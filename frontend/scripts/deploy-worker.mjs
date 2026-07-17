import { spawn } from 'node:child_process';

const maxAttempts = 3;

const runWrangler = () => new Promise((resolve) => {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const child = spawn(command, ['wrangler', 'deploy'], {
    cwd: new URL('..', import.meta.url),
    stdio: 'inherit',
    shell: false,
  });
  child.on('exit', (code) => resolve(code ?? 1));
  child.on('error', () => resolve(1));
});

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  const code = await runWrangler();
  if (code === 0) process.exit(0);
  if (attempt === maxAttempts) process.exit(code);

  const delaySeconds = attempt * 10;
  console.warn(`Wrangler deploy failed (attempt ${attempt}/${maxAttempts}). Retrying in ${delaySeconds}s...`);
  await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
}
