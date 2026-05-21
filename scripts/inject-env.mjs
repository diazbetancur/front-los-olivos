// Patches src/environments/environment.ts with values from environment variables.
// Used by the Vercel build step so the production bundle points to the deployed API.
//
// Recognized env vars (only when set / non-empty):
//   API_BASE_URL    e.g. https://constructora-api.onrender.com
//
// Safe defaults: if no env vars are set, the file is left untouched.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const envFile = resolve(here, '..', 'src', 'environments', 'environment.ts');

const apiBaseUrl = process.env.API_BASE_URL?.trim();
if (!apiBaseUrl) {
  console.log('[inject-env] API_BASE_URL not set; leaving environment.ts unchanged.');
  process.exit(0);
}

if (!/^https?:\/\//i.test(apiBaseUrl)) {
  console.error(`[inject-env] API_BASE_URL "${apiBaseUrl}" must start with http:// or https://`);
  process.exit(1);
}

if (process.env.NODE_ENV === 'production' && !apiBaseUrl.startsWith('https://')) {
  console.error('[inject-env] API_BASE_URL must use HTTPS in production builds.');
  process.exit(1);
}

const source = readFileSync(envFile, 'utf8');
const updated = source.replace(
  /apiBaseUrl:\s*['"][^'"]*['"]/,
  `apiBaseUrl: '${apiBaseUrl}'`
);

if (updated === source) {
  console.warn('[inject-env] Pattern not found in environment.ts; nothing replaced.');
  process.exit(0);
}

writeFileSync(envFile, updated, 'utf8');
console.log(`[inject-env] environment.ts updated. apiBaseUrl='${apiBaseUrl}'`);
