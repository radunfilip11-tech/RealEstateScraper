/**
 * Runs a Node command with NODE_OPTIONS=--use-system-ca.
 * Needed on Windows + Node 24 where bundled CAs don't match the system trust store
 * (common with antivirus HTTPS inspection). NODE_OPTIONS is used (not a CLI flag)
 * so tsx child processes inherit the setting.
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

const existing = process.env.NODE_OPTIONS?.trim() ?? '';
const nodeOptions = existing.includes('--use-system-ca')
  ? existing
  : `${existing} --use-system-ca`.trim();

const child = spawn(process.execPath, args, {
  stdio: 'inherit',
  env: { ...process.env, NODE_OPTIONS: nodeOptions },
  cwd: projectRoot,
  shell: false,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
