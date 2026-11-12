#!/usr/bin/env node
/**
 * Destiny Admin Console — Cloudflare quick tunnel launcher.
 *
 * Starts the admin API (loopback), the Next.js dashboard, and a
 * `cloudflared` quick tunnel that exposes ONLY the dashboard.
 *
 * The backend API is never published: it binds to 127.0.0.1 and the
 * dashboard proxies to it server-side.
 *
 * Usage:
 *   node scripts/tunnel-admin.mjs [--port 3000] [--api-port 4000]
 *                                 [--log <file>] [--url-file <file>]
 *
 * Requires DASHBOARD_SESSION_SECRET and API_SECRET_KEY. The quick tunnel uses
 * DASHBOARD_ADMIN_PASSWORD; individual Discord OAuth requires a stable named
 * tunnel and is intentionally rejected by this rotating quick-tunnel launcher.
 *
 * `--log` / `--url-file` are for detached (daemonised) launches, where the
 * tunnel must keep running after the parent shell exits.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DASHBOARD = join(ROOT, 'dashboard');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const DASH_PORT = arg('port', '3000');
const API_PORT = arg('api-port', '4000');
const LOG_FILE = arg('log', '');
const URL_FILE = arg('url-file', '');

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  rose: '\x1b[38;2;254;105;142m',
  magenta: '\x1b[38;2;255;78;167m',
  plum: '\x1b[38;2;85;8;27m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

/**
 * Loads a dotenv-style file into process.env without overriding values that
 * are already set (real environment variables always win).
 */
function loadEnvFile(file, { onlyIfMissing = true } = {}) {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value === '') continue;
    if (onlyIfMissing && process.env[key] !== undefined) continue;
    process.env[key] = value;
  }
}

/**
 * The project-root `.env` is the authoritative source for the console
 * password and the shared secrets. `dashboard/.env.local` is only a
 * per-machine override.
 */
loadEnvFile(join(ROOT, '.env'));
loadEnvFile(join(DASHBOARD, '.env.local'));

/** Locate the cloudflared binary. */
function findCloudflared() {
  if (process.env.CLOUDFLARED_PATH && existsSync(process.env.CLOUDFLARED_PATH)) {
    return process.env.CLOUDFLARED_PATH;
  }
  const local = join(process.env.LOCALAPPDATA || '', 'cloudflared', 'cloudflared.exe');
  if (existsSync(local)) return local;

  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['cloudflared'], { encoding: 'utf8' });
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim().split(/\r?\n/)[0];
  return null;
}

const children = [];

/**
 * When a log file is requested, mirror console output into it so a detached
 * launch can still be inspected (and the URL discovered) after the parent
 * shell exits.
 */
let logStream = null;
if (LOG_FILE) {
  const logPath = resolve(ROOT, LOG_FILE);
  mkdirSync(dirname(logPath), { recursive: true });
  logStream = createWriteStream(logPath, { flags: 'a' });
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, ...rest) => {
    try { logStream.write(chunk); } catch {}
    return originalWrite(chunk, ...rest);
  };
  const originalErr = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...rest) => {
    try { logStream.write(chunk); } catch {}
    return originalErr(chunk, ...rest);
  };
}

function recordUrl(url) {
  if (!URL_FILE) return;
  try {
    const urlPath = resolve(ROOT, URL_FILE);
    mkdirSync(dirname(urlPath), { recursive: true });
    writeFileSync(urlPath, url + '\n', 'utf8');
  } catch {}
}

function shutdown(code = 0) {
  console.log(`\n${C.dim}Shutting down…${C.reset}`);
  for (const child of children) {
    try { child.kill('SIGTERM'); } catch {}
  }
  setTimeout(() => process.exit(code), 500);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

/**
 * Resolves a locally installed CLI entrypoint that can be run with node
 * directly. Using the JS entrypoint (instead of the .cmd shim) avoids
 * `spawn EINVAL` on Windows, where .cmd files require a shell.
 */
function localEntry(candidates) {
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function startApi() {
  console.log(`${C.dim}▸ starting admin API on 127.0.0.1:${API_PORT}${C.reset}`);
  const tsxCli = localEntry([
    join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
  ]);

  const command = tsxCli ? process.execPath : (process.platform === 'win32' ? 'npx.cmd' : 'npx');
  const args = tsxCli ? [tsxCli, 'src/api/server.ts'] : ['tsx', 'src/api/server.ts'];

  const child = spawn(command, args, {
    cwd: ROOT,
    env: {
      ...process.env,
      RUN_API: 'true',
      PORT: API_PORT,
      NODE_ENV: process.env.NODE_ENV || 'production',
      // Shared with the dashboard proxy so the backend accepts its calls.
      API_SECRET_KEY: process.env.API_SECRET_KEY,
    },
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
    shell: !tsxCli && process.platform === 'win32',
  });
  children.push(child);
  child.on('error', (err) => console.error(`${C.red}✖ API process error: ${err.message}${C.reset}`));
  return child;
}

function startDashboard() {
  console.log(`${C.dim}▸ starting dashboard on 127.0.0.1:${DASH_PORT}${C.reset}`);
  const nextBin = localEntry([
    join(DASHBOARD, 'node_modules', 'next', 'dist', 'bin', 'next'),
  ]);

  const command = nextBin ? process.execPath : (process.platform === 'win32' ? 'npx.cmd' : 'npx');
  const args = nextBin
    ? [nextBin, 'start', '-p', DASH_PORT, '-H', '127.0.0.1']
    : ['next', 'start', '-p', DASH_PORT, '-H', '127.0.0.1'];

  const child = spawn(command, args, {
    cwd: DASHBOARD,
    env: {
      ...process.env,
      BACKEND_API_URL: `http://127.0.0.1:${API_PORT}`,
      API_SECRET_KEY: process.env.API_SECRET_KEY,
      DASHBOARD_ADMIN_PASSWORD: process.env.DASHBOARD_ADMIN_PASSWORD || '',
      DASHBOARD_SESSION_SECRET: process.env.DASHBOARD_SESSION_SECRET,
    },
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
    shell: !nextBin && process.platform === 'win32',
  });
  children.push(child);
  child.on('error', (err) => console.error(`${C.red}✖ Dashboard process error: ${err.message}${C.reset}`));
  return child;
}

function startTunnel(cloudflared) {
  console.log(`${C.dim}▸ opening Cloudflare quick tunnel…${C.reset}`);
  const child = spawn(
    cloudflared,
    ['tunnel', '--url', `http://127.0.0.1:${DASH_PORT}`, '--no-autoupdate'],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  children.push(child);

  let announced = false;
  const onData = (buf) => {
    const text = buf.toString();
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (match && !announced) {
      announced = true;
      const url = match[0];
      recordUrl(url);
      console.log(`\n${C.rose}${C.bold}  ▸▸  ADMIN CONSOLE IS LIVE${C.reset}`);
      console.log(`${C.rose}${C.bold}${url}${C.reset}\n`);
      console.log(OWNER_OAUTH_ENABLED
        ? `${C.dim}  Access: Discord owners listed in BOT_OWNER_IDS.${C.reset}`
        : `${C.dim}  Password: DASHBOARD_ADMIN_PASSWORD (from .env).${C.reset}`);
      console.log(`${C.dim}  Press Ctrl+C to tear down the tunnel.${C.reset}\n`);
    }
  };

  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('exit', (code) => {
    if (!announced) {
      console.error(`${C.red}✖ Tunnel exited before publishing a URL (code ${code}).${C.reset}`);
    }
    shutdown(code || 0);
  });

  return child;
}

const cloudflared = findCloudflared();
if (!cloudflared) {
  console.error(`${C.red}✖ cloudflared not found.${C.reset}`);
  console.error(`  Install it with:  winget install --id Cloudflare.cloudflared`);
  console.error(`  Or set CLOUDFLARED_PATH to the binary.`);
  process.exit(1);
}

const OWNER_OAUTH_ENABLED = process.env.DASHBOARD_OWNER_OAUTH_ENABLED === 'true';
if (OWNER_OAUTH_ENABLED) {
  console.error('✖ Quick tunnels use rotating hostnames and cannot safely complete Discord OAuth. Use a named Cloudflare tunnel with a stable HTTPS hostname, or disable dashboard OAuth for this quick-tunnel session.');
  process.exit(1);
}
if (!process.env.DASHBOARD_ADMIN_PASSWORD) {
  console.error('✖ DASHBOARD_ADMIN_PASSWORD is not set and Discord owner OAuth is disabled.');
  console.error('  Configure a bootstrap password or use a stable-hostname deployment with dashboard OAuth.');
  process.exit(1);
}

if (!process.env.DASHBOARD_SESSION_SECRET || process.env.DASHBOARD_SESSION_SECRET.length < 32) {
  console.error('✖ DASHBOARD_SESSION_SECRET must contain at least 32 characters.');
  process.exit(1);
}
if (!process.env.API_SECRET_KEY || process.env.API_SECRET_KEY.length < 32 || process.env.API_SECRET_KEY === 'destiny_internal_secret_32bytes_min_key!') {
  console.error('✖ API_SECRET_KEY must contain at least 32 characters.');
  process.exit(1);
}
/**
 * Waits for an HTTP endpoint to become reachable.
 *
 * `/api/health` is protected by the `x-api-key` header, so it must be sent —
 * a plain request returns 401 and would look like the API never came up.
 */
async function waitForHttp(url, { timeoutMs = 45000, apiKey = '', expectedStatus = 200, allowDegraded = false } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const headers = apiKey ? { 'x-api-key': apiKey } : {};
      const res = await fetch(url, { redirect: 'manual', headers });
      if (res.status === expectedStatus || (allowDegraded && res.status === 503)) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 750));
  }
  return false;
}

/**
 * Fails fast if a port is already taken, instead of letting the child
 * process die with a confusing EADDRINUSE.
 */
function portInUse(port) {
  const probe = spawnSync(
    process.platform === 'win32' ? 'netstat' : 'ss',
    process.platform === 'win32'
      ? ['-ano']
      : ['-ltn'],
    { encoding: 'utf8' }
  );
  const output = probe.stdout || '';
  const pattern = process.platform === 'win32'
    ? new RegExp(`[:.]${port}\\s+\\S+\\s+LISTENING`, 'i')
    : new RegExp(`:${port}\\s`, 'm');
  return pattern.test(output);
}

async function main() {
  console.log(`\n${C.magenta}${C.bold}🌌 Destiny Admin Console → Cloudflare Tunnel${C.reset}\n`);

  for (const [label, port] of [['API', API_PORT], ['dashboard', DASH_PORT]]) {
    if (portInUse(port)) {
      console.error(`${C.red}✖ Port ${port} is already in use — stop the other process first.${C.reset}`);
      shutdown(1);
      return;
    }
  }

  startApi();
  startDashboard();

  const apiUp = await waitForHttp(`http://127.0.0.1:${API_PORT}/api/health`, {
    apiKey: process.env.API_SECRET_KEY || '',
    allowDegraded: true,
  });
  if (!apiUp) {
    console.error(`${C.red}✖ Admin API did not come up on 127.0.0.1:${API_PORT}.${C.reset}`);
    shutdown(1);
    return;
  }

  const dashUp = await waitForHttp(`http://127.0.0.1:${DASH_PORT}/login`);
  if (!dashUp) {
    console.error(`${C.red}✖ Dashboard did not come up on 127.0.0.1:${DASH_PORT}.${C.reset}`);
    shutdown(1);
    return;
  }

  console.log(`${C.green}✓${C.dim} API + dashboard healthy${C.reset}`);
  startTunnel(cloudflared);
}

main().catch((err) => {
  console.error(`${C.red}✖ ${err?.message || err}${C.reset}`);
  shutdown(1);
});
