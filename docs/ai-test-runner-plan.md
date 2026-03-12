# AI-Powered Self-Healing E2E Test Runner

## Context

ClockShark.E2E has a working Playwright + Podman infrastructure for deterministic E2E tests. The problem: E2E tests are brittle and expensive to maintain. When the UI changes, tests break and someone has to manually rewrite selectors and flows.

**Solution**: Natural language test specs (markdown) as the source of truth. An AI agent executes specs against the live app using Playwright, then generates deterministic tests as a cache. When deterministic tests break, the agent re-derives them from the spec. Tests self-heal.

## Architecture Overview

```
specs/*.spec.md          -- Human-written, source of truth
        |
        v
  [ai-runner.ts]         -- Orchestrator
        |
   .----+----.
   |         |
   v         v
[Generated   [AI Agent]  -- Fallback: Claude Sonnet + 15 Playwright tools
 test exists  |
 & passes?]   v
   |        [test-generator.ts] -- Deterministic transform: action log -> .spec.ts
   v          |
 DONE         v
            [tests/ai-generated/*.spec.ts] -- Committed to git, runs in CI
```

## Spec Format

`specs/registration/signup.spec.md`:
```markdown
---
id: signup-flow
generated_test: tests/ai-generated/registration/signup.generated.spec.ts
spec_hash: null  # auto-populated after generation
preconditions:
  - clean-session
timeout: 120000
---

# Company Registration - Signup Flow

## Context
The ClockShark signup flow allows new users to create a trial account.

## Steps
1. Navigate to the login page
2. Click the "Sign up" link
3. Enter a unique email address (e2e+{timestamp}@test.clockshark.com)
4. Enter password "TestPass123!"
5. Accept the terms and conditions
6. Click "Start trial"
7. Wait for redirect to the welcome/onboarding page

## Assertions
- After clicking "Sign up": URL contains "/Signup"
- After clicking "Start trial": URL contains "/App/Welcome"
```

Staleness detection: SHA-256 hash of `## Steps` + `## Assertions` sections. Changing `## Context` does not invalidate the generated test.

## Directory Structure (new files only)

```
specs/                              # NEW: markdown test specifications
  registration/signup.spec.md
  employees/create-employee.spec.md
src/ai/                             # NEW: AI agent infrastructure
  agent.ts                          # Core Claude tool_use loop
  tools.ts                          # 15 Playwright tool definitions + executor
  tools.schema.ts                   # Anthropic-format JSON schemas for tools
  spec-parser.ts                    # Markdown + frontmatter parser, hash computation
  test-generator.ts                 # Action log -> Playwright test code (pure transform)
  types.ts                          # Shared types (ActionLog, SpecFile, etc.)
ai-runner.ts                        # CLI entry point
tests/ai-generated/                 # NEW: generated tests (committed to git)
  registration/signup.generated.spec.ts
  employees/create-employee.generated.spec.ts
```

## Tool Definitions (15 tools for Claude)

**Navigation (3)**: `navigate(url)`, `wait_for_url(pattern, timeout?)`, `wait_for_load()`
**Observation (2)**: `get_page_snapshot()` (accessibility tree + URL + title), `get_element_text(selector)`
**Interaction (5)**: `click(selector)`, `fill(selector, value)`, `check(selector)`, `select_option(selector, value)`, `press_key(key)`
**Assertion (3)**: `assert_url(pattern)`, `assert_visible(selector)`, `assert_text(selector, expected)`
**Utility (2)**: `screenshot()` (base64, for when agent is stuck), `wait(ms)` (capped 10s)

Why not Playwright MCP's 70 tools: each tool schema costs tokens on every API call. 15 focused tools keeps cost low and agent focused.

`get_page_snapshot()` is the agent's primary "eyes" -- returns the accessibility tree so the agent can reason about what's on screen and pick the right selectors.

## Agent Loop (agent.ts)

1. Parse spec -> extract steps, assertions, context
2. Build system prompt: role, context, data variables, instruction to use `get_page_snapshot()` after actions
3. Send steps + assertions as user message
4. Tool-use loop:
   - Claude returns tool_use calls -> execute against live Playwright Page -> return results
   - Record every tool call + args + result in `ActionLog[]`
   - On tool error: return error as tool result (let Claude adapt, up to 3 retries per step)
5. Return `{ success, actionLog, error?, tokenUsage }`

Model: **Claude Sonnet** (~$0.03-0.08 per spec run)

## Test Generator (test-generator.ts)

Pure deterministic transform, no LLM involved:
- Input: `ActionLog[]` from successful agent run
- Filter out observation calls (`get_page_snapshot`)
- Map each action to Playwright code:
  - `click("role=button[name='Log In']")` -> `await page.getByRole('button', { name: 'Log In' }).click();`
  - `fill("input[name='Email']", "test@example.com")` -> `await page.locator('input[name="Email"]').fill('test@example.com');`
  - `assert_url("/Signup")` -> `await expect(page).toHaveURL(/\/Signup/);`
- Wrap in standard Playwright test using `base.fixture.ts` imports
- Write to path in spec's `generated_test` frontmatter
- Update `spec_hash` in frontmatter

Generated tests use **flat Playwright calls only** (no page objects). They're disposable cache -- if they break, the agent re-derives them.

## Self-Healing Runner (ai-runner.ts)

```
npm run test:ai                     # run all specs
npm run test:ai -- specs/signup     # run specific spec
npm run test:ai -- --force-regen    # force AI re-derivation
```

Per spec:
1. Parse spec, compute current hash
2. If `generated_test` exists AND `spec_hash` matches current hash:
   - Run generated test via Playwright
   - If **passes**: done (zero API cost)
   - If **fails**: fall through to step 3
3. Launch browser, run AI agent against spec
   - If **succeeds**: run stability validation (see below), then report success
   - If **fails** (after 3 retries): report failure with action log + screenshots

### Stability Validation (5-pass gate)

A generated test must pass **5 consecutive runs** before it is considered stable and committed. This catches flaky selectors, race conditions, and timing-dependent flows.

Flow after agent succeeds:
1. Generate the deterministic test from the action log
2. Run the generated test 5 times sequentially
3. If all 5 pass: update `spec_hash` in frontmatter, test is ready to commit
4. If any run fails: log which run failed and why, re-invoke the AI agent with the failure context (the agent may choose different selectors or add waits), repeat from step 1
5. After 3 full regeneration attempts with stability failures: report as unstable with diagnostics

The `--force-regen` flag also triggers the 5-pass gate. The runner reports: `STABLE (5/5)`, `FLAKY (3/5, regenerating...)`, or `UNSTABLE (failed 3 regeneration cycles)`.

## Integration with Existing Infrastructure

- `npx playwright test` stays fast and free -- runs hand-written + generated tests
- `npm run test:ai` is the AI-powered runner (separate command, requires API key)
- Generated tests in `tests/ai-generated/` are picked up by `playwright.config.ts` automatically (testDir: `./tests`)
- The Chameleon dismisser from `base.fixture.ts` is used in both AI runs and generated tests
- Global setup/teardown (Podman compose) works the same way

## New Dependencies

```
@anthropic-ai/sdk   - Claude API client with tool_use support
gray-matter          - YAML frontmatter parser for spec markdown
tsx                  - Fast TypeScript execution for CLI runner
```

## .env Addition

```
ANTHROPIC_API_KEY=   # Required for AI spec runs (not needed for CI running generated tests)
```

## Implementation Steps

### Step 1: Types and spec parser
- `src/ai/types.ts` -- SpecFile, ActionLog, ToolCall, AgentResult types
- `src/ai/spec-parser.ts` -- parse markdown with gray-matter, extract sections, compute SHA-256 hash
- Files: `src/ai/types.ts`, `src/ai/spec-parser.ts`

### Step 2: Tool definitions and executor
- `src/ai/tools.schema.ts` -- 15 tool schemas in Anthropic JSON format
- `src/ai/tools.ts` -- executor function: `(toolName, args, page) => Promise<ToolResult>`
- Implement `get_page_snapshot()` using Playwright accessibility API
- Implement selector parsing (handle both CSS and `role=` format)
- Files: `src/ai/tools.schema.ts`, `src/ai/tools.ts`

### Step 3: Agent loop
- `src/ai/agent.ts` -- Claude SDK client, system prompt construction, tool_use loop, action log recording, retry logic, cost tracking
- Files: `src/ai/agent.ts`

### Step 4: Test generator
- `src/ai/test-generator.ts` -- action log to Playwright code mapping, file writing, frontmatter hash update
- Files: `src/ai/test-generator.ts`

### Step 5: CLI runner
- `ai-runner.ts` -- spec discovery (glob specs/**/*.spec.md), freshness check, deterministic-first with AI fallback, CLI args, result reporting
- Files: `ai-runner.ts`

### Step 6: First spec files
- Convert existing signup test to `specs/registration/signup.spec.md`
- Convert employee creation test to `specs/employees/create-employee.spec.md`
- Files: `specs/registration/signup.spec.md`, `specs/employees/create-employee.spec.md`

### Step 7: Package.json and config updates
- Add dependencies: `@anthropic-ai/sdk`, `gray-matter`, `tsx`
- Add npm scripts: `test:ai`, `test:ai:regen`, `test:all`
- Add `ANTHROPIC_API_KEY` to `.env.example`
- Files: `package.json`, `.env.example`

### Step 8: End-to-end validation
- Run `npm run test:ai` against a live stack (with SKIP_INFRA if stack already running)
- Verify: spec parsed -> agent executes -> test generated -> deterministic re-run passes
- Verify: modify spec steps -> hash mismatch detected -> agent re-derives test

## Verification

1. `npm run test:ai -- specs/registration/signup.spec.md` -- should run AI agent, generate test, pass 5/5 stability gate
2. `npm run test:ai -- specs/registration/signup.spec.md` (second run) -- should run generated test directly (no API call), pass
3. Edit steps in signup.spec.md -> `npm run test:ai` -- should detect staleness, re-run agent + 5-pass gate
4. `npx playwright test tests/ai-generated/` -- generated tests run as normal Playwright tests
5. `npm run test:ai -- --force-regen` -- forces AI re-derivation + 5-pass gate even when hash matches
6. Verify flaky detection: if a generated test intermittently fails during the 5-pass gate, agent should regenerate with adjusted selectors/waits
