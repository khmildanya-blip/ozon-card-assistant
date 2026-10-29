import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const venvPython = join(
  root,
  '.venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
);
const python = process.env.PYTHON || (existsSync(venvPython) ? venvPython : 'python3');
const viteScript = join(root, 'frontend/node_modules/vite/bin/vite.js');
const check = spawnSync(
  python,
  ['-c', 'import fastapi, uvicorn, multipart, dotenv, httpx, openai'],
  { cwd: root, encoding: 'utf8' },
);
if (check.error || check.status !== 0) {
  console.error(
    'Не установлены зависимости backend. Выполните из корня:\n  python3 -m venv .venv\n  .venv/bin/python -m pip install -r backend/requirements-api.txt\nЗатем: npm run dev',
  );
  process.exit(1);
}
if (!existsSync(viteScript)) {
  console.error('Не установлены зависимости frontend: npm --prefix frontend install');
  process.exit(1);
}

const frontendPort = process.env.FRONTEND_PORT || '5173';
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
}
function start(command, args, cwd = root) {
  const child = spawn(command, args, { cwd, stdio: 'inherit' });
  children.push(child);
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on('exit', (code) => stop(code || 0));
  return child;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
start(python, [
  '-m',
  'uvicorn',
  'main:app',
  '--app-dir',
  join(root, 'backend'),
  '--reload',
  '--host',
  '127.0.0.1',
  '--port',
  '8000',
]);

// Start the UI only once the actual API is reachable, without making any AI calls.
let ready = false;
for (let attempt = 0; attempt < 40 && !stopping; attempt++) {
  try {
    const response = await fetch('http://127.0.0.1:8000/api/health', {
      signal: AbortSignal.timeout(500),
    });
    ready = response.ok && (await response.json()).status === 'ok';
    if (ready) break;
  } catch {
    /* Uvicorn is still starting. */
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}
if (!ready || stopping) {
  if (!stopping) console.error('Backend не запустился. Проверьте ошибку Uvicorn выше.');
  stop(1);
} else {
  console.log(
    `\nAPI готов: http://127.0.0.1:8000/docs\nFrontend: http://localhost:${frontendPort}\n`,
  );
  start(
    process.execPath,
    [viteScript, '--host', '127.0.0.1', '--port', frontendPort],
    join(root, 'frontend'),
  );
}
