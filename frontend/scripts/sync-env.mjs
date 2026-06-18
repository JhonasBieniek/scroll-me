import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(scriptDir, '..');
const projectRoot = resolve(frontendDir, '..');
const envFile = resolve(projectRoot, '.env');
const outDir = resolve(frontendDir, 'src/environments');
const outFile = resolve(outDir, 'environment.ts');

const DEFAULT_API_BASE_URL = 'http://localhost:3000';

function parseDotEnv(content) {
  const vars = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

function resolveApiBaseUrl() {
  if (process.env.API_BASE_URL?.trim()) {
    return process.env.API_BASE_URL.trim();
  }

  if (existsSync(envFile)) {
    const fromFile = parseDotEnv(readFileSync(envFile, 'utf8')).API_BASE_URL?.trim();
    if (fromFile) return fromFile;
  }

  return DEFAULT_API_BASE_URL;
}

const apiBaseUrl = resolveApiBaseUrl().replace(/\/$/, '');

mkdirSync(outDir, { recursive: true });

const source = `// Gerado por scripts/sync-env.mjs — não edite manualmente.
// Fonte: API_BASE_URL em .env (raiz do projeto) ou variável de ambiente no build.

export const environment = {
  apiBaseUrl: '${apiBaseUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}',
} as const;
`;

writeFileSync(outFile, source, 'utf8');
console.log(`[sync-env] API_BASE_URL=${apiBaseUrl}`);
