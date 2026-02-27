# ClockShark E2E Tests

Playwright end-to-end tests that spin up the full ClockShark stack via Podman containers.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Podman Desktop](https://podman-desktop.io/) with `podman compose`
- A **GitHub PAT** with read access to the `clockshark/ClockShark` repo
- An **Azure DevOps PAT** with Packaging (Read) access to the `ClockShark.Libraries` NuGet feed

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
```

## Running Tests

### Full lifecycle (compose up, test, compose down)

```bash
npx playwright test
```

### Headed mode (see the browser)

```bash
npx playwright test --headed
```

### With stack already running

If you already have the stack up (via `npm run infra:up`), skip the compose lifecycle:

```powershell
$env:SKIP_INFRA=1; npx playwright test
```

### Run a specific test file

```powershell
$env:SKIP_INFRA=1; npx playwright test tests/registration/signup.spec.ts --headed
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
  docker/
    Dockerfile.app          # Multi-target Dockerfile (mvc/hangfire/admin)
    Dockerfile.db-init      # Database schema init via dacpac
    compose.e2e.yaml        # Full compose stack
    db-init.sh              # DB init entrypoint script
    config/
      localsettings.json            # App config overrides
      appsettings.Development.json  # HTTPS + Kestrel cert config
  src/
    global-setup.ts         # Compose up + health check
    global-teardown.ts      # Compose down
    pages/                  # Page Object Models
      login.page.ts
      signup.page.ts
  tests/
    registration/
      signup.spec.ts        # Company registration test
    smoke/
      playwright-works.spec.ts
```
