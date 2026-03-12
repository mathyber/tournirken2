import { execSync } from 'child_process';
import path from 'path';

export async function setup() {
  const apiRoot = path.resolve(__dirname, '../../');
  const prismaBin = path.join(apiRoot, 'node_modules', '.bin', 'prisma');
  execSync(`"${prismaBin}" db push --accept-data-loss --skip-generate`, {
    stdio: 'pipe',
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: 'file:./prisma/test.db' },
  });
}
