import { spawn } from 'node:child_process';

const children = [];
let shuttingDown = false;

function run(name, command, args) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.log(`[dev] ${name} exited (code=${code ?? 'null'} signal=${signal ?? 'null'})`);
    shutdown(code ?? 0);
  });

  children.push(child);
  return child;
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try {
      child.kill('SIGTERM');
    } catch {
      // no-op
    }
  }
  setTimeout(() => process.exit(exitCode), 300);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

run('web', 'npm', ['run', 'start:web']);
run('smtp-trigger', 'npm', ['run', 'smtp:trigger:server']);
