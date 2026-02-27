import { execSync } from 'child_process';
import path from 'path';

const COMPOSE_FILE = path.resolve(__dirname, '..', 'docker', 'compose.e2e.yaml');
const ENV_FILE = path.resolve(__dirname, '..', '.env');
const PROJECT_NAME = 'clockshark-e2e';
const BASE_URL = process.env.BASE_URL || 'https://localhost:30080';
const HEALTH_TIMEOUT_MS = 300_000; // 5 minutes for first build + start

// Allow self-signed certs for health checks
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

function compose(cmd: string, opts?: { timeout?: number }) {
  const timeout = opts?.timeout ?? 120_000;
  execSync(
    `podman compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" -p ${PROJECT_NAME} ${cmd}`,
    { stdio: 'inherit', timeout }
  );
}

async function waitForHealthy(url: string, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 302) {
        return;
      }
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 3_000));
  }
  throw new Error(`App not healthy at ${url} after ${timeoutMs / 1000}s`);
}

export default async function globalSetup() {
  // Skip compose if SKIP_INFRA is set (for running tests against already-running stack)
  if (process.env.SKIP_INFRA) {
    console.log('[global-setup] SKIP_INFRA set, skipping compose up');
  } else {
    console.log('[global-setup] Starting infrastructure...');
    compose('up -d --build', { timeout: HEALTH_TIMEOUT_MS });
    console.log('[global-setup] Containers started.');
  }

  console.log(`[global-setup] Waiting for app at ${BASE_URL}...`);
  await waitForHealthy(BASE_URL, HEALTH_TIMEOUT_MS);
  console.log('[global-setup] App is ready.');
}
