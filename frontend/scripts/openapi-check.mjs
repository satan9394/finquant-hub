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

const typesFile = resolve(__dirname, '../src/types/openapi.generated.ts');

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

// Verify Python environment has required dependencies
try {
  execSync(`"${py}" -c "import fastapi"`, { stdio: 'pipe' });
} catch {
  if (existsSync(typesFile)) {
    console.warn(`[openapi-check] Python (${py}) lacks backend dependencies (fastapi); using existing openapi.generated.ts.`);
    process.exit(0);
  } else {
    console.error(`[openapi-check] Python (${py}) lacks backend dependencies and openapi.generated.ts is missing.`);
    process.exit(1);
  }
}

try {
  execSync(`"${py}" "${scriptPath}" --check`, { stdio: 'inherit' });
} catch (err) {
  process.exit(err.status ?? 1);
}
