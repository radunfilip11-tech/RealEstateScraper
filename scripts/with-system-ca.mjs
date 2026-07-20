/**
 * Spawns a Node child process. On Windows + Node 24, sets NODE_OPTIONS=--use-system-ca
 * so tsx inherits the system CA store (fixes UNABLE_TO_VERIFY_LEAF_SIGNATURE).
 * Linux/macOS: no-op — Node rejects --use-system-ca in NODE_OPTIONS on Linux anyway.
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

const env = { ...process.env };

if (process.platform === 'win32') {
  const existing = env.NODE_OPTIONS?.trim() ?? '';
  if (!existing.includes('--use-system-ca')) {
    env.NODE_OPTIONS = `${existing} --use-system-ca`.trim();
  }
}

const child = spawn(process.execPath, args, {
  stdio: 'inherit',
  env,
  cwd: projectRoot,
  shell: false,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
