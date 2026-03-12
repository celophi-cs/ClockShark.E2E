#!/usr/bin/env tsx

import { existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { glob } from 'glob';
import dotenv from 'dotenv';
import { chromium } from '@playwright/test';
import { parseSpecFile, isSpecFresh, updateSpecHash } from './src/ai/spec-parser.js';
import { runAgent } from './src/ai/agent.js';
import { runAgentCli } from './src/ai/agent-cli.js';
import { generateTest } from './src/ai/test-generator.js';
import type { SpecRunResult, ActionLogEntry } from './src/ai/types.js';

dotenv.config();

// ── CLI argument parsing ──

type Backend = 'api' | 'cli';

const args = process.argv.slice(2);
const forceRegen = args.includes('--force-regen');
const stabilityRuns = parseInt(
  args.find((a) => a.startsWith('--stability-runs='))?.split('=')[1] ?? '5',
  10,
);
const maxRegenAttempts = parseInt(
  args.find((a) => a.startsWith('--max-regen='))?.split('=')[1] ?? '3',
  10,
);
const specArgs = args.filter(
  (a) => !a.startsWith('--') && a.endsWith('.spec.md'),
);

// Backend selection: --backend=api|cli, or auto-detect from ANTHROPIC_API_KEY
const backendArg = args.find((a) => a.startsWith('--backend='))?.split('=')[1] as Backend | undefined;

const PROJECT_ROOT = process.cwd();
const BASE_URL = process.env.BASE_URL || 'https://localhost:30080';

function resolveBackend(): Backend {
  if (backendArg) return backendArg;
  if (process.env.ANTHROPIC_API_KEY) return 'api';
  return 'cli';
}

// ── Helpers ──

function log(specId: string, message: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${specId}] ${message}`);
}

/**
 * Run a generated Playwright test file using Playwright CLI.
 * Returns { passed, error } so callers can see why it failed.
 */
async function runGeneratedTest(testPath: string): Promise<{ passed: boolean; error?: string }> {
  const { execSync } = await import('node:child_process');
  try {
    execSync(
      `npx playwright test "${testPath}" --reporter=list`,
      {
        cwd: PROJECT_ROOT,
        stdio: 'pipe',
        env: { ...process.env, SKIP_INFRA: '1' },
        timeout: 120_000,
      },
    );
    return { passed: true };
  } catch (err) {
    let error = 'Unknown test failure';
    if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>;
      const stdout = Buffer.isBuffer(e.stdout) ? e.stdout.toString('utf-8') : '';
      const stderr = Buffer.isBuffer(e.stderr) ? e.stderr.toString('utf-8') : '';
      const combined = (stdout + '\n' + stderr).trim();
      error = combined.slice(-1500);
    }
    return { passed: false, error };
  }
}

/**
 * Run the stability gate: execute the generated test N times consecutively.
 * Returns pass count and the error from the first failure (if any).
 */
async function runStabilityGate(
  testPath: string,
  runs: number,
  specId: string,
): Promise<{ passes: number; total: number; failureError?: string }> {
  let passes = 0;
  for (let i = 1; i <= runs; i++) {
    log(specId, `  Stability run ${i}/${runs}...`);
    const result = await runGeneratedTest(testPath);
    if (result.passed) {
      passes++;
      log(specId, `  Run ${i}/${runs}: PASS`);
    } else {
      log(specId, `  Run ${i}/${runs}: FAIL — aborting gate`);
      if (result.error) {
        log(specId, `  Failure details:\n${result.error.slice(0, 800)}`);
      }
      return { passes, total: runs, failureError: result.error };
    }
  }
  return { passes, total: runs };
}

// ── Agent execution (API backend) ──

async function runWithApiBackend(
  spec: Awaited<ReturnType<typeof parseSpecFile>>,
  specId: string,
  generatedTestPath: string,
): Promise<{ success: boolean; inputTokens: number; outputTokens: number; error?: string }> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    baseURL: BASE_URL,
  });
  const page = await context.newPage();

  // Chameleon modal dismisser (same as base.fixture.ts)
  await page.addLocatorHandler(
    page.locator('#chmln .chmln-close'),
    async (overlay) => {
      await overlay.click();
    },
  );

  try {
    const result = await runAgent(spec, page, {
      onToolCall: (entry: ActionLogEntry) => {
        const status = entry.result.success ? 'OK' : 'ERR';
        log(specId, `  [${status}] ${entry.tool}(${JSON.stringify(entry.args)})`);
      },
    });

    if (!result.success) {
      return {
        success: false,
        inputTokens: result.tokenUsage.inputTokens,
        outputTokens: result.tokenUsage.outputTokens,
        error: result.error,
      };
    }

    // Generate deterministic test from action log
    log(specId, 'Agent succeeded — generating deterministic test...');
    await generateTest({
      specId,
      outputPath: generatedTestPath,
      actionLog: result.actionLog,
      projectRoot: PROJECT_ROOT,
    });

    return {
      success: true,
      inputTokens: result.tokenUsage.inputTokens,
      outputTokens: result.tokenUsage.outputTokens,
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

// ── Agent execution (CLI backend) ──

async function runWithCliBackend(
  spec: Awaited<ReturnType<typeof parseSpecFile>>,
  specId: string,
  previousFailure?: string,
): Promise<{ success: boolean; error?: string }> {
  const result = await runAgentCli(spec, PROJECT_ROOT, {
    onStatus: (msg) => log(specId, `  ${msg}`),
    baseUrl: BASE_URL,
    previousFailure,
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  // CLI backend writes the test file directly — no test-generator step needed
  return { success: true };
}

// ── Main runner ──

async function runSpec(specPath: string, backend: Backend): Promise<SpecRunResult> {
  const absSpecPath = resolve(PROJECT_ROOT, specPath);
  const spec = await parseSpecFile(absSpecPath);
  const specId = spec.frontmatter.id;
  const generatedTestPath = spec.frontmatter.generated_test;
  const absGeneratedPath = resolve(PROJECT_ROOT, generatedTestPath);

  log(specId, `Processing spec: ${relative(PROJECT_ROOT, absSpecPath)} [backend: ${backend}]`);

  // Step 1: Check if we have a fresh generated test
  if (!forceRegen && isSpecFresh(spec) && existsSync(absGeneratedPath)) {
    log(specId, 'Generated test is fresh — running deterministic test...');
    const passed = await runGeneratedTest(generatedTestPath);
    if (passed) {
      log(specId, 'PASS (cached deterministic test)');
      return {
        specId,
        specPath,
        status: 'stable',
        resolution: 'cached',
      };
    }
    log(specId, 'Deterministic test FAILED — falling back to AI agent...');
  } else if (forceRegen) {
    log(specId, 'Force regeneration requested');
  } else {
    log(specId, 'No fresh generated test — running AI agent...');
  }

  // Step 2: Run AI agent with regeneration loop
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let lastStabilityError: string | undefined;

  for (let attempt = 1; attempt <= maxRegenAttempts; attempt++) {
    log(specId, `AI agent attempt ${attempt}/${maxRegenAttempts}...`);

    let agentSuccess: boolean;
    let agentError: string | undefined;

    if (backend === 'api') {
      const result = await runWithApiBackend(spec, specId, generatedTestPath);
      agentSuccess = result.success;
      agentError = result.error;
      totalInputTokens += result.inputTokens;
      totalOutputTokens += result.outputTokens;
    } else {
      const result = await runWithCliBackend(spec, specId, lastStabilityError);
      agentSuccess = result.success;
      agentError = result.error;
    }

    if (!agentSuccess) {
      log(specId, `Agent failed: ${agentError}`);
      if (attempt === maxRegenAttempts) {
        return {
          specId,
          specPath,
          status: 'failed',
          resolution: 'failed',
          regenerationAttempts: attempt,
          tokenUsage: totalInputTokens > 0
            ? { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }
            : undefined,
          error: agentError,
        };
      }
      continue;
    }

    // Step 3: Stability gate
    log(specId, `Running stability gate (${stabilityRuns} consecutive passes required)...`);
    const gate = await runStabilityGate(generatedTestPath, stabilityRuns, specId);

    if (gate.passes === gate.total) {
      await updateSpecHash(absSpecPath, spec.currentHash);
      const resolution = attempt === 1 ? 'generated' : 'regenerated';
      log(specId, `STABLE (${gate.passes}/${gate.total}) — ${resolution}`);
      return {
        specId,
        specPath,
        status: attempt === 1 ? 'stable' : 'healed',
        resolution,
        stabilityPasses: gate.passes,
        regenerationAttempts: attempt,
        tokenUsage: totalInputTokens > 0
          ? { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }
          : undefined,
      };
    }

    // Capture the failure so the next agent attempt can see it
    lastStabilityError = gate.failureError;
    log(
      specId,
      `Stability gate FAILED (${gate.passes}/${gate.total}) — regenerating...`,
    );
  }

  return {
    specId,
    specPath,
    status: 'unstable',
    resolution: 'failed',
    regenerationAttempts: maxRegenAttempts,
    tokenUsage: totalInputTokens > 0
      ? { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }
      : undefined,
    error: `Failed to produce stable test after ${maxRegenAttempts} regeneration cycles`,
  };
}

async function main() {
  console.log('=== AI Test Runner ===\n');

  const backend = resolveBackend();

  if (backend === 'api' && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      'ERROR: --backend=api specified but ANTHROPIC_API_KEY is not set.\n' +
      'Either add ANTHROPIC_API_KEY to .env, or use --backend=cli for Claude Code CLI.',
    );
    process.exit(1);
  }

  console.log(`Backend: ${backend === 'api' ? 'Anthropic API' : 'Claude Code CLI'}`);
  if (backend === 'cli') {
    console.log('  (Using authenticated Claude Code session — no API key needed)');
  }
  console.log();

  // Discover spec files
  let specPaths: string[];
  if (specArgs.length > 0) {
    specPaths = specArgs;
  } else {
    specPaths = await glob('specs/**/*.spec.md', { cwd: PROJECT_ROOT });
  }

  if (specPaths.length === 0) {
    console.log('No spec files found in specs/');
    process.exit(0);
  }

  console.log(`Found ${specPaths.length} spec(s):`);
  specPaths.forEach((p) => console.log(`  - ${p}`));
  console.log();

  const results: SpecRunResult[] = [];
  for (const specPath of specPaths) {
    const result = await runSpec(specPath, backend);
    results.push(result);
    console.log();
  }

  // Summary
  console.log('=== Results ===\n');
  let hasFailures = false;
  for (const r of results) {
    const icon =
      r.status === 'stable' ? 'PASS' :
      r.status === 'healed' ? 'HEALED' :
      r.status === 'flaky' ? 'FLAKY' :
      r.status === 'unstable' ? 'UNSTABLE' :
      'FAIL';

    const cost = r.tokenUsage
      ? ` (${r.tokenUsage.inputTokens} in / ${r.tokenUsage.outputTokens} out tokens)`
      : '';

    console.log(`  [${icon}] ${r.specId} — ${r.resolution}${cost}`);

    if (r.status === 'failed' || r.status === 'unstable') {
      hasFailures = true;
      if (r.error) console.log(`         Error: ${r.error}`);
    }
  }

  console.log();
  process.exit(hasFailures ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
