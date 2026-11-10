const path = require('path');
const fs = require('fs');

/**
 * The Destiny admin console reads its access-control secrets from the
 * project-root `.env` so that a single file is the source of truth for the
 * bot, the API and the dashboard.
 *
 * Next.js only auto-loads env files from its own directory, so we load the
 * root `.env` here. Values already present in the process environment win,
 * and `dashboard/.env.local` is used as a per-machine override.
 */
const ROOT_ENV = path.join(__dirname, '..', '.env');
const DASH_ENV = path.join(__dirname, '.env.local');

function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value !== '') out[key] = value;
  }
  return out;
}

/**
 * Precedence (first wins), matching scripts/tunnel-admin.mjs:
 *   1. real environment variables
 *   2. project-root .env        (authoritative)
 *   3. dashboard/.env.local     (per-machine override, only for keys the
 *                                 root .env does not define)
 *
 * Both files are parsed before merging so that the root .env always wins —
 * otherwise the dashboard and the API could end up with different secrets.
 */
const rootVars = parseEnvFile(ROOT_ENV);
const dashVars = parseEnvFile(DASH_ENV);

for (const [key, value] of Object.entries(rootVars)) {
  if (process.env[key] === undefined) process.env[key] = value;
}
for (const [key, value] of Object.entries(dashVars)) {
  if (process.env[key] === undefined && rootVars[key] === undefined) {
    process.env[key] = value;
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

module.exports = nextConfig;
