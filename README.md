# ClockShark E2E Tests

Playwright end-to-end tests that spin up the full ClockShark stack via Podman containers — featuring an **AI-powered self-healing test runner** that writes and maintains tests from plain English specifications.

## The Big Idea

Traditional E2E tests are brittle. Every UI change breaks selectors, every redesign means rewriting tests. This project flips the script:

1. **You write specs in markdown** — plain English steps and assertions, no code
2. **An AI agent executes your spec** against the live app using Playwright, discovering the real selectors, buttons, and flows
3. **A deterministic test is generated** from the agent's successful run — standard Playwright code, committed to git
4. **Tests self-heal** — when a generated test breaks (UI changed, selectors moved), the AI agent re-derives it from the original spec. No manual intervention.

The generated tests are a **cache**, not the source of truth. The markdown spec is. Change the spec, and the system automatically detects staleness (via SHA-256 hashing) and regenerates.

### How It Works

```
specs/*.spec.md              ← You write these (source of truth)
       │
       ▼
  ┌─────────────┐
  │  ai-runner   │           ← Orchestrator
  └──────┬──────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
 Cached?   AI Agent          ← Claude Sonnet via API or Claude Code CLI
 Test       │
 passes?    ▼
    │     Executes spec against live app
    │     Records every action
    │       │
    ▼       ▼
  DONE    Generate deterministic .spec.ts
            │
            ▼
          5-pass stability gate
            │
            ▼
          Commit to git ✓
```

### Stability Gate

A generated test isn't trusted until it passes **5 consecutive runs**. This catches flaky selectors, race conditions, and timing issues before they reach your test suite. If any run fails, the agent regenerates with the failure context — it learns from its mistakes.

### Dual Backend

| | Anthropic API | Claude Code CLI |
|---|---|---|
| **Auth** | `ANTHROPIC_API_KEY` in `.env` | Your authenticated `claude` session |
| **Best for** | CI/CD, automation | Local development |
| **Cost visibility** | Token usage reported | Uses your existing plan |
| **How it drives the browser** | 15 custom Playwright tools via tool_use | Playwright MCP server |

### What a Spec Looks Like

```markdown
---
id: signup-flow
generated_test: tests/ai-generated/registration/signup.generated.spec.ts
---

# Company Registration - Signup Flow

## Context
The login page is at /Login and has a "Sign up" link.

## Steps
1. Navigate to /Login
2. Click the "Sign up" link
3. Enter a unique email address
4. Enter "TestPass123!" as the password
5. Check the terms and conditions
6. Click "Start Trial"
7. Wait for redirect to /App/Welcome

## Assertions
- After step 2: URL contains "/Signup"
- After step 7: URL contains "/App/Welcome"
```

That's it. No page objects. No CSS selectors. The AI figures out the rest.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Podman Desktop](https://podman-desktop.io/) with `podman compose`
- A **GitHub PAT** with read access to the `clockshark/ClockShark` repo
- An **Azure DevOps PAT** with Packaging (Read) access to the `ClockShark.Libraries` NuGet feed
- **For AI test runner**: an `ANTHROPIC_API_KEY` or an authenticated [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI session

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env
```

Edit `.env` and fill in your tokens:

```
GIT_TOKEN=ghp_...
NUGET_PAT=...
ANTHROPIC_API_KEY=sk-ant-...   # optional — only for AI test runner API backend
```

### Claude Code CLI Setup (Alternative to API Key)

If you don't have an API key, you can use your authenticated Claude Code session instead:

```bash
# Install Claude Code CLI globally
npm install -g @anthropic-ai/claude-code

# Add the Playwright MCP server (one-time setup)
claude mcp add playwright -s local -- npx @playwright/mcp@latest --ignore-https-errors
```

## Running Tests

### Deterministic tests (no AI, no API key)

```bash
# Full lifecycle (compose up → test → compose down)
npx playwright test

# Headed mode (see the browser)
npx playwright test --headed

# With stack already running
SKIP_INFRA=1 npx playwright test
```

### AI-powered test runner

```bash
# Run all specs (auto-detects backend: API if key set, else CLI)
npm run test:ai

# Explicit backend selection
npm run test:ai:api                      # Force Anthropic API
npm run test:ai:cli                      # Force Claude Code CLI

# Run a specific spec
npm run test:ai -- specs/registration/signup.spec.md

# Force AI regeneration (even if generated test is fresh)
npm run test:ai:regen

# Custom stability gate (default: 5 runs)
npm run test:ai -- --stability-runs=3

# Run everything: AI specs + deterministic tests
npm run test:all
```

### What you'll see

```
=== AI Test Runner ===

Backend: Claude Code CLI
  (Using authenticated Claude Code session — no API key needed)

Found 1 spec(s):
  - specs/registration/signup.spec.md

[12:30:01] [signup-flow] Processing spec: specs/registration/signup.spec.md [backend: cli]
[12:30:01] [signup-flow] AI agent attempt 1/3...
[12:30:01] [signup-flow]   Invoking Claude Code CLI...
[12:33:28] [signup-flow] Running stability gate (5 consecutive passes required)...
[12:33:28] [signup-flow]   Stability run 1/5...
[12:33:35] [signup-flow]   Run 1/5: PASS
  ...
[12:35:12] [signup-flow] STABLE (5/5) — generated

=== Results ===

  [PASS] signup-flow — generated
```

## Infrastructure Commands

```bash
# Start the stack (build + detached)
npm run infra:up

# Stop the stack and remove volumes
npm run infra:down

# Tail logs from all services
npm run infra:logs
```

## Services & Ports

| Service           | Container Port | Host Port |
|-------------------|---------------|-----------|
| MVC (web app)     | 5000          | 30080     |
| Hangfire (jobs)   | 5000          | 30081     |
| Admin             | 5000          | 30082     |
| MSSQL             | 1433          | 31433     |
| Redis             | 6379          | 36379     |
| Azurite (Blob)    | 10000         | 30000     |
| Azurite (Queue)   | 10001         | 30001     |
| Azurite (Table)   | 10002         | 30002     |
| SEQ (logging)     | 80            | 35341     |

## Project Structure

```
ClockShark.E2E/
  ai-runner.ts                # AI test runner CLI entry point
  specs/                      # Markdown test specifications (source of truth)
    registration/
      signup.spec.md
    employees/
      create-employee.spec.md
  src/
    ai/                       # AI agent infrastructure
      agent.ts                #   API backend — Claude tool_use loop
      agent-cli.ts            #   CLI backend — shells out to claude
      spec-parser.ts          #   Markdown parser + SHA-256 staleness detection
      test-generator.ts       #   Action log → Playwright code (deterministic)
      tools.ts                #   15 Playwright tool implementations
      tools.schema.ts         #   Tool schemas in Anthropic format
      types.ts                #   Shared TypeScript types
    fixtures/
      base.fixture.ts         # Shared Playwright fixture (Chameleon dismisser, etc.)
    global-setup.ts           # Compose up + health check
    global-teardown.ts        # Compose down
    pages/                    # Page Object Models (for hand-written tests)
      login.page.ts
      signup.page.ts
  tests/
    ai-generated/             # Auto-generated tests (committed, run in CI)
      registration/
        signup.generated.spec.ts
    registration/
      signup.spec.ts          # Hand-written deterministic test
    smoke/
      playwright-works.spec.ts
  docker/
    Dockerfile.app            # Multi-target Dockerfile (mvc/hangfire/admin)
    Dockerfile.db-init        # Database schema init via dacpac
    compose.e2e.yaml          # Full compose stack
    db-init.sh                # DB init entrypoint script
    config/
      localsettings.json
      appsettings.Development.json
  docs/
    ai-test-runner-plan.md    # Detailed architecture documentation
```

## Writing New Specs

1. Create a markdown file in `specs/` with YAML frontmatter:

```markdown
---
id: my-feature
generated_test: tests/ai-generated/my-feature/test.generated.spec.ts
preconditions:
  - clean-session
timeout: 120000
---

# My Feature

## Context
Describe the app state and navigation needed.

## Steps
1. Navigate to /some-page
2. Click the "Button" button
3. Fill in the form field with "value"

## Assertions
- After step 2: URL contains "/expected-path"
- After step 3: "Success" text is visible
```

2. Run it: `npm run test:ai -- specs/my-feature.spec.md`
3. The AI agent executes your steps, generates a test, validates it 5 times, and writes it to the path in `generated_test`.
4. Commit both the spec and the generated test.

## How Self-Healing Works

```
Spec unchanged + generated test passes  →  Run cached test (zero cost)
Spec unchanged + generated test fails   →  AI re-derives test from spec
Spec changed (hash mismatch)            →  AI generates fresh test
--force-regen flag                       →  AI regenerates regardless
```

The regeneration loop feeds failure output back to the agent, so it can adjust selectors, add waits, or fix assertions based on what actually broke. Up to 3 regeneration attempts before reporting a spec as unstable.
