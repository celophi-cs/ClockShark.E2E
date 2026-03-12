import type { Page } from '@playwright/test';

// ── Spec file types ──

export interface SpecFrontmatter {
  id: string;
  generated_test: string;
  spec_hash: string | null;
  preconditions?: string[];
  timeout?: number;
}

export interface SpecFile {
  /** Absolute path to the .spec.md file */
  filePath: string;
  /** Parsed YAML frontmatter */
  frontmatter: SpecFrontmatter;
  /** Raw markdown body (everything after frontmatter) */
  body: string;
  /** Extracted ## Context section */
  context: string;
  /** Extracted ## Steps section */
  steps: string;
  /** Extracted ## Assertions section */
  assertions: string;
  /** Extracted ## Data section */
  data: string;
  /** SHA-256 hash of steps + assertions (for staleness detection) */
  currentHash: string;
}

// ── Tool / agent types ──

export type ToolName =
  | 'navigate'
  | 'wait_for_url'
  | 'wait_for_load'
  | 'get_page_snapshot'
  | 'get_element_text'
  | 'click'
  | 'fill'
  | 'check'
  | 'select_option'
  | 'press_key'
  | 'assert_url'
  | 'assert_visible'
  | 'assert_text'
  | 'screenshot'
  | 'wait';

export interface ToolCall {
  name: ToolName;
  args: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  value?: string;
  error?: string;
}

export interface ActionLogEntry {
  tool: ToolName;
  args: Record<string, unknown>;
  result: ToolResult;
  timestamp: number;
}

export interface AgentResult {
  success: boolean;
  actionLog: ActionLogEntry[];
  error?: string;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
  };
}

// ── Runner types ──

export type SpecRunStatus = 'stable' | 'healed' | 'flaky' | 'unstable' | 'failed';

export interface SpecRunResult {
  specId: string;
  specPath: string;
  status: SpecRunStatus;
  /** How the deterministic test was resolved */
  resolution: 'cached' | 'generated' | 'regenerated' | 'failed';
  /** Number of stability gate passes achieved (out of 5) */
  stabilityPasses?: number;
  /** Number of agent regeneration attempts */
  regenerationAttempts?: number;
  /** Cost in tokens */
  tokenUsage?: { inputTokens: number; outputTokens: number };
  error?: string;
}

export interface RunnerOptions {
  /** Specific spec files to run (default: all) */
  specPaths?: string[];
  /** Force AI re-derivation even if generated test is fresh */
  forceRegen?: boolean;
  /** Number of stability gate passes required (default: 5) */
  stabilityRuns?: number;
  /** Max regeneration attempts on flaky tests (default: 3) */
  maxRegenAttempts?: number;
  /** Base URL for the app under test */
  baseUrl?: string;
}
