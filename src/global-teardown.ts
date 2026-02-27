import { execSync } from 'child_process';
import path from 'path';

const COMPOSE_FILE = path.resolve(__dirname, '..', 'docker', 'compose.e2e.yaml');
const ENV_FILE = path.resolve(__dirname, '..', '.env');
const PROJECT_NAME = 'clockshark-e2e';

function compose(cmd: string) {
  execSync(
    `podman compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" -p ${PROJECT_NAME} ${cmd}`,
    { stdio: 'inherit', timeout: 60_000 }
  );
}

export default async function globalTeardown() {
  if (process.env.SKIP_INFRA) {
    console.log('[global-teardown] SKIP_INFRA set, skipping compose down');
    return;
  }

  console.log('[global-teardown] Tearing down infrastructure...');
  compose('down --volumes --remove-orphans');
  console.log('[global-teardown] Done.');
}
