import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const venvWin = resolve(__dirname, '../../backend/.venv/Scripts/python.exe');
const venvPosix = resolve(__dirname, '../../backend/.venv/bin/python');
const scriptPath = resolve(__dirname, '../../scripts/openapi_tsgen.py');

let py = process.env.PYTHON || '';
if (!py) {
  if (platform() === 'win32' && existsSync(venvWin)) {
    py = venvWin;
  } else if (existsSync(venvPosix)) {
    py = venvPosix;
  } else {
    py = platform() === 'win32' ? 'python' : 'python3';
  }
}

try {
  execSync(`"${py}" "${scriptPath}" --check`, { stdio: 'inherit' });
} catch (err) {
  process.exit(err.status ?? 1);
}
