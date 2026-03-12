#!/usr/bin/env tsx

import { existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { glob } from 'glob';
import dotenv from 'dotenv';
import { chromium } from '@playwright/test';
import { parseSpecFile, isSpecFresh, updateSpecHash } from './src/ai/spec-parser.js';
import { runAgent } from './src/ai/agent.js';
import { generateTest } from './src/ai/test-generator.js';
import type { SpecRunResult, ActionLogEntry } from './src/ai/types.js';

dotenv.config();

// ── CLI argument parsing ──

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

const PROJECT_ROOT = process.cwd();
const BASE_URL = process.env.BASE_URL || 'https://localhost:30080';

// ── Helpers ──

function log(specId: string, message: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${specId}] ${message}`);
}

/**
 * Run a generated Playwright test file using Playwright CLI.
 * Returns true if the test passes.
 */
async function runGeneratedTest(testPath: string): Promise<boolean> {
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
    return true;
  } catch {
    return false;
  }
}

/**
 * Run the stability gate: execute the generated test N times consecutively.
 * Returns the number of passes.
 */
async function runStabilityGate(
  testPath: string,
  runs: number,
  specId: string,
): Promise<{ passes: number; total: number }> {
  let passes = 0;
  for (let i = 1; i <= runs; i++) {
    log(specId, `  Stability run ${i}/${runs}...`);
    const passed = await runGeneratedTest(testPath);
    if (passed) {
      passes++;
      log(specId, `  Run ${i}/${runs}: PASS`);
    } else {
      log(specId, `  Run ${i}/${runs}: FAIL — aborting gate`);
      return { passes, total: runs };
    }
  }
  return { passes, total: runs };
}

// ── Main runner ──

async function runSpec(specPath: string): Promise<SpecRunResult> {
  const absSpecPath = resolve(PROJECT_ROOT, specPath);
  const spec = await parseSpecFile(absSpecPath);
  const specId = spec.frontmatter.id;
  const generatedTestPath = spec.frontmatter.generated_test;
  const absGeneratedPath = resolve(PROJECT_ROOT, generatedTestPath);

  log(specId, `Processing spec: ${relative(PROJECT_ROOT, absSpecPath)}`);

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

  for (let attempt = 1; attempt <= maxRegenAttempts; attempt++) {
    log(specId, `AI agent attempt ${attempt}/${maxRegenAttempts}...`);

    // Launch browser for the agent
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      baseURL: BASE_URL,
    });
    const page = await context.newPage();

    // Set up Chameleon dismisser (same as base.fixture.ts)
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

      totalInputTokens += result.tokenUsage.inputTokens;
      totalOutputTokens += result.tokenUsage.outputTokens;

      if (!result.success) {
        log(specId, `Agent failed: ${result.error}`);
        if (attempt === maxRegenAttempts) {
          return {
            specId,
            specPath,
            status: 'failed',
            resolution: 'failed',
            regenerationAttempts: attempt,
            tokenUsage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
            error: result.error,
          };
        }
        continue;
      }

      // Step 3: Generate deterministic test from action log
      log(specId, 'Agent succeeded — generating deterministic test...');
      await generateTest({
        specId,
        outputPath: generatedTestPath,
        actionLog: result.actionLog,
        projectRoot: PROJECT_ROOT,
      });

      // Step 4: Stability gate
      log(specId, `Running stability gate (${stabilityRuns} consecutive passes required)...`);
      const gate = await runStabilityGate(generatedTestPath, stabilityRuns, specId);

      if (gate.passes === gate.total) {
        // All passes — update hash and report success
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
          tokenUsage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
        };
      }

      // Stability failed — try again with the agent
      log(
        specId,
        `Stability gate FAILED (${gate.passes}/${gate.total}) — regenerating...`,
      );
    } finally {
      await context.close();
      await browser.close();
    }
  }

  // All regeneration attempts exhausted
  return {
    specId,
    specPath,
    status: 'unstable',
    resolution: 'failed',
    regenerationAttempts: maxRegenAttempts,
    tokenUsage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
    error: `Failed to produce stable test after ${maxRegenAttempts} regeneration cycles`,
  };
}

async function main() {
  console.log('=== AI Test Runner ===\n');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY is not set. Add it to your .env file.');
    process.exit(1);
  }

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

  // Run specs sequentially (they share the same app instance)
  const results: SpecRunResult[] = [];
  for (const specPath of specPaths) {
    const result = await runSpec(specPath);
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
