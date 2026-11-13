import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config/index.js';
import { db } from '../database/supabase.js';
import { stateStore } from '../storage/state-store.js';
import { verificationService } from '../core/moderation/verification.js';
import { PLATFORM_OPERATOR_CAPABILITIES, type PlatformOperatorCapability } from '../core/types.js';
import { computeChannelPermissions, isServerManager } from './security.js';
import {
  consumeDashboardState,
  deleteDashboardState,
  incrementDashboardRateLimit,
  isPersistentDashboardRuntime,
  readDashboardState,
  writeDashboardState,
} from './persistence.js';

const APP = config.DASHBOARD_APP;
const ORIGIN = new URL(APP === 'owner' ? config.OWNER_DASHBOARD_ORIGIN : config.SERVER_DASHBOARD_ORIGIN).origin;
const SESSION_COOKIE = config.NODE_ENV === 'production'
  ? (APP === 'owner' ? '__Host-destiny-owner' : '__Host-destiny-admin')
  : (APP === 'owner' ? 'destiny_owner' : 'destiny_admin');
const SESSION_PREFIX = `dashboard:session:${APP}:`;
const OAUTH_STATE_PREFIX = `dashboard:oauth-state:${APP}:`;
const SESSION_TTL_SECONDS = 4 * 60 * 60;
const SESSION_SECRET = APP === 'owner' ? config.OWNER_DASHBOARD_SESSION_SECRET : config.SERVER_DASHBOARD_SESSION_SECRET;
const OAUTH_STATE_TTL_SECONDS = 5 * 60;
const MAX_BODY_BYTES = 8 * 1024;
const STATIC_ROOT = process.env.CLOUDFLARE_WORKER === '1'
  ? '/cloudflare-worker/static-assets-are-served-by-the-fetch-handler'
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../apps', `${APP}-dashboard`, 'public');
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

type DashboardSession = {
  user: { id: string; username: string; global_name?: string | null; avatar?: string | null };
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: number;
  csrfToken: string;
  createdAt: string;
};

type DiscordGuild = {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
};

type BotChannel = { id: string; name: string; botPermissions: string };
type BotGuild = { id: string; name: string; icon: string | null; memberCount: number; channels: BotChannel[] };

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(value));
}

function redirect(res: ServerResponse, location: string, cookie?: string): void {
  res.writeHead(302, {
    Location: location,
    'Cache-Control': 'no-store',
    ...(cookie ? { 'Set-Cookie': cookie } : {}),
  });
  res.end();
}

function cookieOptions(maxAge: number): string {
  const secure = config.NODE_ENV === 'production' ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function setSessionCookie(id: string): string {
  return `${SESSION_COOKIE}=${id}; ${cookieOptions(SESSION_TTL_SECONDS)}`;
}

function clearSessionCookie(): string {
  const secure = config.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function parseCookies(header: string | undefined): Record<string, string> {
  const output: Record<string, string> = {};
  for (const item of (header || '').split(';')) {
    const separator = item.indexOf('=');
    if (separator < 1) continue;
    const key = item.slice(0, separator).trim();
    try { output[key] = decodeURIComponent(item.slice(separator + 1).trim()); } catch { /* Ignore malformed cookie values. */ }
  }
  return output;
}

function requestHostIsExpected(req: IncomingMessage): boolean {
  const host = req.headers.host?.toLowerCase();
  return Boolean(host && host === new URL(ORIGIN).host.toLowerCase());
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sessionKey(id: string): string {
  const digest = createHmac('sha256', SESSION_SECRET || 'local-development-only')
    .update(id)
    .digest('hex');
  return SESSION_PREFIX + digest;
}

function discordId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9]{17,20}$/.test(value);
}

function parseDiscordBits(value: string): bigint {
  try { return BigInt(value); } catch { return 0n; }
}

function safeAuditChanges(value: unknown, depth = 0): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 2) return {};
  const sensitiveKey = /note|evidence|excerpt|content|description|reason|identity|token|secret|email|ip/i;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !sensitiveKey.test(key))
    .slice(0, 24)
    .map(([key, item]) => [key, item && typeof item === 'object' ? safeAuditChanges(item, depth + 1) : typeof item === 'string' ? item.slice(0, 240) : item]);
  return Object.fromEntries(entries);
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const parsedBody = (req as IncomingMessage & { body?: unknown }).body;
  if (parsedBody !== undefined && parsedBody !== null) {
    if (typeof parsedBody === 'string') {
      try {
        const parsed = JSON.parse(parsedBody);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected an object.');
        return parsed as Record<string, unknown>;
      } catch {
        throw Object.assign(new Error('Invalid JSON body.'), { status: 400 });
      }
    }
    if (typeof parsedBody === 'object' && !Array.isArray(parsedBody) && !Buffer.isBuffer(parsedBody)) {
      return parsedBody as Record<string, unknown>;
    }
    throw Object.assign(new Error('Invalid JSON body.'), { status: 400 });
  }
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
    chunks.push(buffer);
  }
  if (!size) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected an object.');
    return parsed as Record<string, unknown>;
  } catch {
    throw Object.assign(new Error('Invalid JSON body.'), { status: 400 });
  }
}

async function apiRateLimit(req: IncomingMessage, bucket: string, max: number): Promise<boolean> {
  const cloudflareIp = req.headers['cf-connecting-ip'];
  const forwardedFor = req.headers['x-forwarded-for'];
  const ip = (typeof cloudflareIp === 'string'
    ? cloudflareIp
    : typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0]
      : '').trim() || req.socket.remoteAddress || 'unknown';
  if (isPersistentDashboardRuntime()) {
    try { return await incrementDashboardRateLimit(APP, bucket, ip, SESSION_SECRET) <= max; }
    catch { return false; }
  }
  const key = `dashboard:rate:${APP}:${bucket}:${ip}`;
  if (config.SUPABASE_SERVICE_ROLE_KEY && !config.SUPABASE_SERVICE_ROLE_KEY.startsWith('mock_')) {
    try { return (await stateStore.checkRateLimit(key, max, 60)).allowed; }
    catch { return false; }
  }
  if (config.NODE_ENV === 'production') return false;
  const counter = fallbackRateLimits.get(key);
  const now = Date.now();
  if (!counter || counter.expiresAt < now) {
    fallbackRateLimits.set(key, { count: 1, expiresAt: now + 60_000 });
    return true;
  }
  counter.count += 1;
  return counter.count <= max;
}

const fallbackRateLimits = new Map<string, { count: number; expiresAt: number }>();

async function readState(key: string): Promise<string | null> {
  if (isPersistentDashboardRuntime()) return readDashboardState(APP, key, SESSION_SECRET);
  return stateStore.get(key);
}

async function writeState(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  if (isPersistentDashboardRuntime()) {
    await writeDashboardState(APP, key, value, ttlSeconds, SESSION_SECRET);
    return true;
  }
  return stateStore.set(key, value, ttlSeconds);
}

async function deleteState(key: string): Promise<boolean> {
  if (isPersistentDashboardRuntime()) {
    await deleteDashboardState(APP, key);
    return true;
  }
  return stateStore.del(key);
}

async function consumeState(key: string): Promise<string | null> {
  if (isPersistentDashboardRuntime()) return consumeDashboardState(APP, key, SESSION_SECRET);
  const value = await stateStore.get(key);
  if (value) await stateStore.del(key);
  return value;
}

async function loadSession(req: IncomingMessage): Promise<{ id: string; session: DashboardSession } | null> {
  const id = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    const value = await readState(sessionKey(id));
    if (!value) return null;
    const session = JSON.parse(value) as DashboardSession;
    if (!session.user?.id || !session.accessToken || !session.refreshToken || !session.csrfToken) return null;
    return { id, session };
  } catch { return null; }
}

async function saveSession(id: string, session: DashboardSession): Promise<void> {
  const ok = await writeState(sessionKey(id), JSON.stringify(session), SESSION_TTL_SECONDS);
  if (!ok) throw new Error('Session store is unavailable.');
}

async function discordFetch<T>(route: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://discord.com/api/v10${route}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw Object.assign(new Error(`Discord API returned ${response.status}.`), { status: response.status });
  return await response.json() as T;
}

async function discordBotFetch<T>(route: string): Promise<T> {
  if (!config.DISCORD_TOKEN) throw Object.assign(new Error('Discord bot connection is not configured.'), { status: 503 });
  const response = await fetch(`https://discord.com/api/v10${route}`, {
    headers: { Authorization: `Bot ${config.DISCORD_TOKEN}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw Object.assign(new Error(`Discord bot could not verify this server (${response.status}).`), { status: response.status === 404 ? 409 : 503 });
  return await response.json() as T;
}

type DiscordRoleRecord = { id: string; permissions: string };
type DiscordOverwrite = { id: string; type: number; allow: string; deny: string };
type DiscordChannelRecord = { id: string; name: string; type: number; permission_overwrites?: DiscordOverwrite[] };

async function getLiveBotChannels(guildId: string): Promise<BotChannel[]> {
  const [roles, member, channels] = await Promise.all([
    discordBotFetch<DiscordRoleRecord[]>(`/guilds/${guildId}/roles`),
    discordBotFetch<{ roles: string[] }>(`/guilds/${guildId}/members/${config.DISCORD_CLIENT_ID}`),
    discordBotFetch<DiscordChannelRecord[]>(`/guilds/${guildId}/channels`),
  ]);
  return channels
    .filter((channel) => channel.type === 0 || channel.type === 5)
    .map((channel) => {
      const permissions = computeChannelPermissions({
        guildId,
        memberId: config.DISCORD_CLIENT_ID,
        memberRoleIds: member.roles,
        roles,
        overwrites: channel.permission_overwrites || [],
      });
      return { id: channel.id, name: channel.name, botPermissions: permissions.toString() };
    });
}

async function refreshSessionTokens(session: DashboardSession): Promise<DashboardSession> {
  if (session.tokenExpiresAt > Date.now() + 30_000) return session;
  const body = new URLSearchParams({
    client_id: config.DISCORD_CLIENT_ID,
    client_secret: config.DISCORD_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: session.refreshToken,
  });
  const response = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw Object.assign(new Error('Discord session expired. Sign in again.'), { status: 401 });
  const tokens = await response.json() as { access_token: string; refresh_token: string; expires_in: number };
  return { ...session, accessToken: tokens.access_token, refreshToken: tokens.refresh_token, tokenExpiresAt: Date.now() + tokens.expires_in * 1000 };
}

async function getDiscordGuilds(session: DashboardSession): Promise<{ session: DashboardSession; guilds: DiscordGuild[] }> {
  const nextSession = await refreshSessionTokens(session);
  const guilds = await discordFetch<DiscordGuild[]>('/users/@me/guilds?with_counts=true', nextSession.accessToken);
  return { session: nextSession, guilds };
}

async function loadBotGuilds(): Promise<{ guilds: BotGuild[]; stale: boolean }> {
  const shardIds = await stateStore.sMembers('bot:guild-shards');
  const snapshots = await Promise.all(shardIds.map((id) => stateStore.get(`bot:guilds:${id}`)));
  const fresh = snapshots.filter((value): value is string => Boolean(value));
  if (fresh.length === 0) return { guilds: [], stale: true };
  const guilds: BotGuild[] = [];
  let invalidSnapshot = false;
  for (const snapshot of fresh) {
    try {
      const parsed = JSON.parse(snapshot) as BotGuild[];
      if (Array.isArray(parsed)) guilds.push(...parsed);
      else invalidSnapshot = true;
    } catch { invalidSnapshot = true; }
  }
  return { guilds, stale: fresh.length !== snapshots.length || invalidSnapshot, };
}

async function requireCsrf(req: IncomingMessage, session: DashboardSession): Promise<boolean> {
  const origin = req.headers.origin;
  const token = req.headers['x-csrf-token'];
  return typeof origin === 'string' && origin === ORIGIN && typeof token === 'string' && safeEqual(session.csrfToken, token);
}

async function hasOwnerCapability(userId: string, capability: PlatformOperatorCapability): Promise<boolean> {
  if (config.BOT_OWNER_IDS.includes(userId)) return true;
  try { return (await db.getPlatformOperatorCapabilities(userId)).includes(capability); }
  catch { return false; }
}

async function serveStatic(url: URL, res: ServerResponse): Promise<void> {
  const relative = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (!/^[a-zA-Z0-9._/-]+$/.test(relative) || relative.includes('..')) return json(res, 404, { error: 'Not found.' });
  const sharedAsset = relative === 'dashboard.css' || relative === 'dashboard.js' || relative.startsWith('assets/');
  const assetRoot = sharedAsset ? path.resolve(STATIC_ROOT, '../../shared') : STATIC_ROOT;
  const filePath = path.resolve(assetRoot, relative);
  if (!filePath.startsWith(assetRoot + path.sep)) return json(res, 404, { error: 'Not found.' });
  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': relative === 'index.html' || relative === 'dashboard.js' || relative === 'dashboard.css'
        ? 'no-store'
        : 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    res.end(content);
  } catch { json(res, 404, { error: 'Not found.' }); }
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!requestHostIsExpected(req)) return json(res, 421, { error: 'This dashboard is not served for the requested host.' });
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://cdn.discordapp.com; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  const url = new URL(req.url || '/', ORIGIN);
  const method = req.method || 'GET';

  if (method === 'GET' && url.pathname === '/health') return json(res, 200, { status: 'ok', app: APP });

  if (method === 'GET' && url.pathname === '/auth/login') {
    if (!await apiRateLimit(req, 'login', 10)) return json(res, 429, { error: 'Too many sign-in attempts. Try again shortly.' });
    if (!config.DISCORD_CLIENT_ID || !config.DISCORD_CLIENT_SECRET || !SESSION_SECRET) return json(res, 503, { error: 'Discord OAuth and session secrets are not configured for this dashboard.' });
    const state = randomBytes(32).toString('base64url');
    const codeVerifier = randomBytes(48).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const ok = await writeState(OAUTH_STATE_PREFIX + state, JSON.stringify({ codeVerifier }), OAUTH_STATE_TTL_SECONDS);
    if (!ok) return json(res, 503, { error: 'Sign-in is temporarily unavailable.' });
    const callback = `${ORIGIN}/auth/callback`;
    const oauth = new URL('https://discord.com/oauth2/authorize');
    oauth.searchParams.set('client_id', config.DISCORD_CLIENT_ID);
    oauth.searchParams.set('redirect_uri', callback);
    oauth.searchParams.set('response_type', 'code');
    oauth.searchParams.set('scope', APP === 'owner' ? 'identify' : 'identify guilds');
    oauth.searchParams.set('state', state);
    oauth.searchParams.set('code_challenge', codeChallenge);
    oauth.searchParams.set('code_challenge_method', 'S256');
    return redirect(res, oauth.toString());
  }

  if (method === 'GET' && url.pathname === '/auth/callback') {
    const state = url.searchParams.get('state') || '';
    const code = url.searchParams.get('code') || '';
    if (!/^[A-Za-z0-9_-]{32,64}$/.test(state) || !code || code.length > 2048) return redirect(res, `${ORIGIN}/?auth=failed`);
    const stateKey = OAUTH_STATE_PREFIX + state;
    const stateValue = await consumeState(stateKey).catch(() => null);
    if (!stateValue) return redirect(res, `${ORIGIN}/?auth=failed`);
    let oauthState: { codeVerifier: string };
    try { oauthState = JSON.parse(stateValue); } catch { return redirect(res, `${ORIGIN}/?auth=failed`); }
    if (!oauthState.codeVerifier) return redirect(res, `${ORIGIN}/?auth=failed`);
    const body = new URLSearchParams({
      client_id: config.DISCORD_CLIENT_ID,
      client_secret: config.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${ORIGIN}/auth/callback`,
      code_verifier: oauthState.codeVerifier,
    });
    const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(8_000),
    });
    if (!tokenResponse.ok) return redirect(res, `${ORIGIN}/?auth=failed`);
    const tokens = await tokenResponse.json() as { access_token: string; refresh_token: string; expires_in: number };
    const user = await discordFetch<DashboardSession['user']>('/users/@me', tokens.access_token);
    if (!discordId(user.id)) return redirect(res, `${ORIGIN}/?auth=failed`);
    if (APP === 'owner') {
      const rootOwner = config.BOT_OWNER_IDS.includes(user.id);
      let capabilities: PlatformOperatorCapability[] = [];
      if (!rootOwner) capabilities = await db.getPlatformOperatorCapabilities(user.id).catch(() => []);
      if (!rootOwner && capabilities.length === 0) {
        await db.logAdminAction(user.id, 'OWNER_DASHBOARD_LOGIN_DENIED', 'platform', 'owner-dashboard').catch(() => {});
        return redirect(res, `${ORIGIN}/?auth=denied`);
      }
    }
    const id = randomUUID();
    const session: DashboardSession = {
      user,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt: Date.now() + tokens.expires_in * 1000,
      csrfToken: randomBytes(32).toString('base64url'),
      createdAt: new Date().toISOString(),
    };
    await saveSession(id, session);
    if (APP === 'owner') {
      try { await db.logAdminAction(user.id, 'OWNER_DASHBOARD_LOGIN', 'platform', 'owner-dashboard'); }
      catch {
        await deleteState(sessionKey(id)).catch(() => false);
        return redirect(res, `${ORIGIN}/?auth=audit-unavailable`);
      }
    }
    return redirect(res, `${ORIGIN}/`, setSessionCookie(id));
  }

  if (method === 'POST' && url.pathname === '/auth/logout') {
    const loaded = await loadSession(req);
    if (!loaded) return json(res, 401, { error: 'Sign in required.' });
    if (!await requireCsrf(req, loaded.session)) return json(res, 403, { error: 'Request verification failed.' });
    await deleteState(sessionKey(loaded.id)).catch(() => false);
    const revoke = new URLSearchParams({
      client_id: config.DISCORD_CLIENT_ID,
      client_secret: config.DISCORD_CLIENT_SECRET,
      token: loaded.session.refreshToken,
      token_type_hint: 'refresh_token',
    });
    await fetch('https://discord.com/api/v10/oauth2/token/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: revoke,
      signal: AbortSignal.timeout(5_000),
    }).catch(() => undefined);
    res.setHeader('Set-Cookie', clearSessionCookie());
    return json(res, 200, { ok: true });
  }

  if (url.pathname.startsWith('/api/')) {
    if (!await apiRateLimit(req, 'api', 180)) return json(res, 429, { error: 'Request rate is too high.' });
    const loaded = await loadSession(req);
    if (!loaded) return json(res, 401, { error: 'Sign in required.' });
    let session = loaded.session;
    try {
      session = await refreshSessionTokens(session);
      await saveSession(loaded.id, session);
    } catch { return json(res, 401, { error: 'Session expired. Sign in again.' }); }

    if (method === 'GET' && url.pathname === '/api/session') {
      if (APP !== 'owner') return json(res, 200, { user: session.user, csrfToken: session.csrfToken, app: APP });
      const rootOwner = config.BOT_OWNER_IDS.includes(session.user.id);
      const capabilities = rootOwner
        ? [...PLATFORM_OPERATOR_CAPABILITIES]
        : await db.getPlatformOperatorCapabilities(session.user.id).catch(() => []);
      return json(res, 200, { user: session.user, csrfToken: session.csrfToken, app: APP, rootOwner, capabilities });
    }

    if (APP === 'owner' && url.pathname === '/api/owner/operators') {
      if (!config.BOT_OWNER_IDS.includes(session.user.id)) return json(res, 403, { error: 'Only a configured root owner can manage platform operators.' });
      if (method === 'GET') {
        try { return json(res, 200, { grants: await db.getPlatformOperatorGrants(), capabilities: PLATFORM_OPERATOR_CAPABILITIES }); }
        catch { return json(res, 503, { error: 'Platform operator grants are unavailable.' }); }
      }
      if (method === 'POST') {
        if (!await requireCsrf(req, session)) return json(res, 403, { error: 'Request verification failed.' });
        const body = await readBody(req);
        if (!discordId(body.discordUserId) || typeof body.capability !== 'string' || !PLATFORM_OPERATOR_CAPABILITIES.includes(body.capability as PlatformOperatorCapability)) {
          return json(res, 400, { error: 'Choose a valid Discord user ID and platform capability.' });
        }
        if (config.BOT_OWNER_IDS.includes(body.discordUserId) || body.discordUserId === session.user.id) {
          return json(res, 422, { error: 'Configured root owners cannot be changed through delegated operator grants.' });
        }
        try {
          const changed = await db.setPlatformOperatorCapability(body.discordUserId, body.capability as PlatformOperatorCapability, session.user.id, true);
          return json(res, 200, { ok: true, changed, audit: changed ? 'recorded' : 'unchanged' });
        } catch { return json(res, 503, { error: 'The grant could not be saved with its audit record.' }); }
      }
    }

    const operatorRevokeMatch = APP === 'owner' && method === 'POST'
      ? url.pathname.match(/^\/api\/owner\/operators\/([0-9]{17,20})\/revoke$/)
      : null;
    if (operatorRevokeMatch) {
      if (!config.BOT_OWNER_IDS.includes(session.user.id)) return json(res, 403, { error: 'Only a configured root owner can manage platform operators.' });
      if (!await requireCsrf(req, session)) return json(res, 403, { error: 'Request verification failed.' });
      const targetDiscordId = operatorRevokeMatch[1];
      if (config.BOT_OWNER_IDS.includes(targetDiscordId)) return json(res, 422, { error: 'Configured root owners cannot be changed through delegated operator grants.' });
      const body = await readBody(req);
      if (typeof body.capability !== 'string' || !PLATFORM_OPERATOR_CAPABILITIES.includes(body.capability as PlatformOperatorCapability)) return json(res, 400, { error: 'Choose a valid platform capability to revoke.' });
      try {
        const changed = await db.setPlatformOperatorCapability(targetDiscordId, body.capability as PlatformOperatorCapability, session.user.id, false);
        return json(res, 200, { ok: true, changed, audit: changed ? 'recorded' : 'unchanged' });
      } catch { return json(res, 503, { error: 'The revocation could not be saved with its audit record.' }); }
    }

    if (APP === 'owner' && method === 'GET' && url.pathname === '/api/owner/overview') {
      if (!await hasOwnerCapability(session.user.id, 'platform.health.read')) return json(res, 403, { error: 'Platform owner access required.' });
      await stateStore.waitForConnection();
      const [database, shardIds, workerIds] = await Promise.all([
        db.isUsingMock() ? Promise.resolve(false) : db.assertConnection().then(() => true).catch(() => false),
        stateStore.isHealthy() ? stateStore.sMembers('bot:guild-shards').catch(() => []) : Promise.resolve([]),
        stateStore.isHealthy() ? stateStore.sMembers('worker:instances').catch(() => []) : Promise.resolve([]),
      ]);
      const [shardSnapshots, workerHeartbeats] = await Promise.all([
        Promise.all(shardIds.map((id) => stateStore.get(`bot:guilds:${id}`).catch(() => null))),
        Promise.all(workerIds.map((id) => stateStore.get(`worker:heartbeat:${id}`).catch(() => null))),
      ]);
      const botSnapshot = stateStore.isHealthy()
        ? await loadBotGuilds().catch(() => ({ guilds: [], stale: true }))
        : { guilds: [], stale: true };
      const [registeredUsers, activeConversations] = database
        ? await Promise.all([db.getUserCount().catch(() => null), db.getActiveRoomCount().catch(() => null)])
        : [null, null];
      const workers = workerIds.map((id, index) => {
        const raw = workerHeartbeats[index];
        if (!raw) return { id, role: 'unknown', status: 'stale', updatedAt: null };
        try {
          const heartbeat = JSON.parse(raw) as { role?: string; updatedAt?: string };
          const age = heartbeat.updatedAt ? Date.now() - Date.parse(heartbeat.updatedAt) : Number.POSITIVE_INFINITY;
          return { id, role: heartbeat.role || 'unknown', status: age >= 0 && age < 90_000 ? 'healthy' : 'stale', updatedAt: heartbeat.updatedAt || null };
        } catch { return { id, role: 'unknown', status: 'invalid', updatedAt: null }; }
      });
      const shards = shardIds.map((id, index) => {
        const raw = shardSnapshots[index];
        if (!raw) return { id, status: 'stale', connectedServers: null };
        try {
          const snapshot = JSON.parse(raw) as unknown;
          return Array.isArray(snapshot)
            ? { id, status: 'healthy', connectedServers: snapshot.length }
            : { id, status: 'invalid', connectedServers: null };
        } catch { return { id, status: 'invalid', connectedServers: null }; }
      });
      return json(res, 200, {
        checkedAt: new Date().toISOString(),
        metrics: {
          connectedServers: botSnapshot.stale ? null : new Set(botSnapshot.guilds.map((guild) => guild.id)).size,
          registeredUsers,
          activeConversations,
        },
        services: {
          database: database ? 'connected' : 'unavailable',
          runtimeState: stateStore.isHealthy() ? 'connected' : 'unavailable',
          discordShards: stateStore.isHealthy() ? String(shardSnapshots.filter(Boolean).length) : 'unavailable',
          workers: stateStore.isHealthy() ? String(workerHeartbeats.filter(Boolean).length) : 'unavailable',
        },
        diagnostics: { workers, shards },
      });
    }

    if (APP === 'owner' && method === 'GET' && url.pathname === '/api/owner/servers') {
      if (!await hasOwnerCapability(session.user.id, 'platform.servers.read')) return json(res, 403, { error: 'Platform owner access required.' });
      const search = (url.searchParams.get('search') || '').trim().slice(0, 100).toLocaleLowerCase();
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 25), 1), 100);
      const offset = Math.min(Math.max(Number(url.searchParams.get('offset') || 0), 0), 10_000);
      if (!Number.isSafeInteger(limit) || !Number.isSafeInteger(offset)) return json(res, 400, { error: 'Invalid pagination.' });
      const snapshot = await loadBotGuilds().catch(() => ({ guilds: [], stale: true }));
      if (snapshot.stale) return json(res, 200, { available: false, servers: [], total: null, nextOffset: null });
      const uniqueGuilds = Array.from(new Map(snapshot.guilds.map((guild) => [guild.id, guild])).values());
      const filtered = uniqueGuilds
        .filter((guild) => !search || guild.name.toLocaleLowerCase().includes(search) || guild.id.includes(search))
        .sort((left, right) => left.name.localeCompare(right.name));
      const page = filtered.slice(offset, offset + limit);
      const nextOffset = offset + limit < filtered.length ? offset + limit : null;
      return json(res, 200, {
        available: true,
        servers: page.map(({ id, name, icon, memberCount }) => ({ id, name, icon, memberCount })),
        total: filtered.length,
        nextOffset,
      });
    }

    const ownerServerMatch = APP === 'owner' && method === 'GET'
      ? url.pathname.match(/^\/api\/owner\/servers\/([0-9]{17,20})$/)
      : null;
    if (ownerServerMatch) {
      if (!await hasOwnerCapability(session.user.id, 'platform.servers.read')) return json(res, 403, { error: 'Platform owner access required.' });
      const snapshot = await loadBotGuilds().catch(() => ({ guilds: [], stale: true }));
      if (snapshot.stale) return json(res, 503, { error: 'The connected-server snapshot is unavailable.' });
      const botGuild = snapshot.guilds.find((guild) => guild.id === ownerServerMatch[1]);
      if (!botGuild) return json(res, 404, { error: 'Destiny is not currently connected to this server.' });
      const [settings, channels] = await Promise.all([
        db.isUsingMock() ? Promise.resolve(null) : db.getGuildSettings(botGuild.id, true),
        getLiveBotChannels(botGuild.id),
      ]);
      return json(res, 200, {
        server: { id: botGuild.id, name: botGuild.name, icon: botGuild.icon, memberCount: botGuild.memberCount },
        configurationAvailable: !db.isUsingMock(),
        settings: settings ? {
          matchChannelId: settings?.matchChannelId ?? null,
          modLogChannelId: settings?.modLogChannelId ?? null,
          crossServerEnabled: settings?.crossServerEnabled ?? true,
          updatedAt: settings?.updatedAt ?? null,
        } : null,
        channels: channels.map(({ id, name, botPermissions }) => {
          const permissions = parseDiscordBits(botPermissions);
          return {
            id,
            name,
            canView: (permissions & (1n << 10n)) !== 0n,
            canSend: (permissions & (1n << 11n)) !== 0n,
            canEmbed: (permissions & (1n << 14n)) !== 0n,
          };
        }),
      });
    }

    if (APP === 'owner' && method === 'GET' && url.pathname === '/api/owner/audit') {
      if (!await hasOwnerCapability(session.user.id, 'platform.audit.read')) return json(res, 403, { error: 'Platform owner access required.' });
      const limit = Number(url.searchParams.get('limit') || 50);
      const offset = Number(url.searchParams.get('offset') || 0);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 10_000) return json(res, 400, { error: 'Invalid audit pagination.' });
      const logs = await db.getAdminAuditLogs({ limit, offset });
      return json(res, 200, { logs: logs.map(({ ipAddress: _ipAddress, ...log }) => ({ ...log, changes: safeAuditChanges(log.changes) })), limit, offset, nextOffset: logs.length === limit ? offset + limit : null });
    }

    if (APP === 'owner' && url.pathname.startsWith('/api/owner/reports')) {
      if (!await hasOwnerCapability(session.user.id, 'safety.reports.review')) return json(res, 403, { error: 'Platform owner access required.' });
      if (db.isUsingMock()) return json(res, 503, { error: 'The report queue requires the configured Destiny database.' });
      if (url.pathname === '/api/owner/reports' && method === 'GET') {
        const requestedStatus = url.searchParams.get('status') || 'pending';
        if (requestedStatus !== 'pending' && requestedStatus !== 'resolved') return json(res, 400, { error: 'Unsupported report status.' });
        const limit = Number(url.searchParams.get('limit') || 25);
        const offset = Number(url.searchParams.get('offset') || 0);
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 || !Number.isSafeInteger(offset) || offset < 0 || offset > 10_000) return json(res, 400, { error: 'Invalid report pagination.' });
        const reports = await db.getReportQueue({ status: requestedStatus, limit, offset });
        return json(res, 200, { reports, status: requestedStatus, limit, offset, nextOffset: reports.length === limit ? offset + limit : null });
      }
      const reportMatch = url.pathname.match(/^\/api\/owner\/reports\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/i);
      if (!reportMatch) return json(res, 404, { error: 'Report not found.' });
      const reportId = reportMatch[1];
      if (method === 'GET') {
        const report = await db.getReportById(reportId);
        if (!report) return json(res, 404, { error: 'Report not found.' });
        return json(res, 200, {
          report: {
            id: report.id,
            category: report.category,
            description: report.description,
            chatExcerpt: report.chatExcerpt,
            status: report.status,
            actionTaken: report.actionTaken,
            moderatorNotes: report.moderatorNotes,
            createdAt: report.createdAt,
            updatedAt: report.updatedAt,
          },
        });
      }
      if (method === 'POST') {
        if (!await requireCsrf(req, session)) return json(res, 403, { error: 'Request verification failed.' });
        const body = await readBody(req);
        const actions = ['none', 'warned', 'temp_ban', 'perma_ban'];
        if (typeof body.action !== 'string' || !actions.includes(body.action)) return json(res, 400, { error: 'Choose a supported resolution action.' });
        if (typeof body.notes !== 'string' || body.notes.trim().length < 5 || body.notes.trim().length > 1000) return json(res, 400, { error: 'Add a 5–1,000 character moderator rationale.' });
        const existing = await db.getReportById(reportId);
        if (!existing || existing.status !== 'pending') return json(res, 409, { error: 'This report is no longer pending.' });
        const saved = await db.resolveReport(reportId, body.action, body.notes.trim(), session.user.id);
        if (!saved) return json(res, 409, { error: 'This report was resolved by another moderator. Refresh the queue.' });
        try {
          await db.logAdminAction(session.user.id, 'OWNER_RESOLVE_REPORT', 'report', reportId, { action: body.action, category: existing.category });
        } catch {
          return json(res, 202, { ok: true, audit: 'unavailable', message: 'The report was resolved, but the platform audit record could not be written.' });
        }
        return json(res, 200, { ok: true, audit: 'recorded' });
      }
    }

    if (APP === 'owner' && url.pathname.startsWith('/api/owner/verification')) {
      if (!await hasOwnerCapability(session.user.id, 'safety.verification.review')) return json(res, 403, { error: 'Platform owner access required.' });
      if (db.isUsingMock()) return json(res, 503, { error: 'Verification review requires the configured Destiny database.' });
      if (url.pathname === '/api/owner/verification' && method === 'GET') {
        const limit = Number(url.searchParams.get('limit') || 25);
        const offset = Number(url.searchParams.get('offset') || 0);
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 || !Number.isSafeInteger(offset) || offset < 0 || offset > 10_000) return json(res, 400, { error: 'Invalid verification pagination.' });
        const requests = await db.getPendingVerificationQueue({ limit, offset });
        return json(res, 200, { requests: requests.map(({ id, destinyId, createdAt }) => ({ id, destinyId, createdAt })), limit, offset, nextOffset: requests.length === limit ? offset + limit : null });
      }
      const verificationMatch = url.pathname.match(/^\/api\/owner\/verification\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/i);
      if (!verificationMatch) return json(res, 404, { error: 'Verification request not found.' });
      const userId = verificationMatch[1];
      if (method === 'GET') {
        const user = await db.getUserById(userId, true);
        if (!user || user.genderVerificationStatus !== 'pending') return json(res, 404, { error: 'Pending verification request not found.' });
        return json(res, 200, {
          request: {
            id: user.id,
            destinyId: user.destinyId,
            age: user.age,
            gender: user.gender,
            evidence: user.genderVerificationEvidence || null,
            submittedAt: user.updatedAt,
          },
        });
      }
      if (method === 'POST') {
        if (!await requireCsrf(req, session)) return json(res, 403, { error: 'Request verification failed.' });
        const body = await readBody(req);
        if (typeof body.approved !== 'boolean') return json(res, 400, { error: 'Choose approve or reject.' });
        if (typeof body.notes !== 'string' || body.notes.trim().length < 5 || body.notes.trim().length > 1000) return json(res, 400, { error: 'Add a 5–1,000 character reviewer rationale.' });
        const result = await verificationService.reviewVerification(session.user.id, userId, body.approved, body.notes.trim());
        if (!result.success) return json(res, 409, { error: result.message });
        return json(res, result.auditWarning ? 202 : 200, {
          ok: true,
          audit: result.auditWarning ? 'unavailable' : 'recorded',
          message: result.auditWarning ? 'The review was saved, but the audit record could not be written.' : result.message,
        });
      }
    }

    if (APP === 'owner' && method === 'POST' && url.pathname === '/api/owner/users/search') {
      if (!await hasOwnerCapability(session.user.id, 'users.status.lookup')) return json(res, 403, { error: 'Platform owner access required.' });
      if (!await requireCsrf(req, session)) return json(res, 403, { error: 'Request verification failed.' });
      if (db.isUsingMock()) return json(res, 503, { error: 'User lookup requires the configured Destiny database.' });
      const body = await readBody(req);
      if (typeof body.query !== 'string') return json(res, 400, { error: 'Enter an exact Destiny ID or Discord ID.' });
      const query = body.query.trim();
      let user: Awaited<ReturnType<typeof db.getUserById>> = null;
      let lookupType: 'discord_id' | 'destiny_id';
      if (/^[0-9]{17,20}$/.test(query)) {
        lookupType = 'discord_id';
        user = await db.getUserByDiscordId(query, true);
      } else {
        const destinyId = query.toUpperCase().replace(/^DESTINY-/, '');
        if (!/^[A-Z0-9]{6}$/.test(destinyId)) return json(res, 400, { error: 'Enter a complete Destiny ID or a 17–20 digit Discord ID.' });
        lookupType = 'destiny_id';
        user = await db.getUserByDestinyId(destinyId);
      }
      try {
        await db.logAdminAction(session.user.id, user ? 'OWNER_USER_LOOKUP' : 'OWNER_USER_LOOKUP_NOT_FOUND', 'user', user?.id || 'not-found', { lookupType });
      } catch { return json(res, 503, { error: 'User lookup is unavailable until its audit record can be saved.' }); }
      if (!user) return json(res, 404, { error: 'No user matched that exact ID.' });
      return json(res, 200, {
        user: {
          destinyId: user.destinyId,
          ...(lookupType === 'discord_id' ? { discordUserId: user.discordUserId } : {}),
          age: user.age,
          genderVerificationStatus: user.genderVerificationStatus,
          genderVerified: user.genderVerified,
          restriction: {
            active: user.isBanned,
            reason: user.isBanned ? user.banReason || 'No restriction reason recorded.' : null,
            expiresAt: user.isBanned ? user.banExpiresAt || null : null,
          },
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      });
    }

    if (APP === 'owner' && method === 'GET' && url.pathname === '/api/owner/rooms') {
      if (!await hasOwnerCapability(session.user.id, 'conversations.metadata.read')) return json(res, 403, { error: 'Platform owner access required.' });
      if (db.isUsingMock()) return json(res, 503, { error: 'Active conversation inventory requires the configured Destiny database.' });
      const limit = Number(url.searchParams.get('limit') || 25);
      const offset = Number(url.searchParams.get('offset') || 0);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 || !Number.isSafeInteger(offset) || offset < 0 || offset > 10_000) return json(res, 400, { error: 'Invalid conversation pagination.' });
      const rooms = await db.getActiveRoomSummaries({ limit, offset });
      try { await db.logAdminAction(session.user.id, 'OWNER_VIEW_ACTIVE_ROOMS', 'room_inventory', 'active', { limit, offset }); }
      catch { return json(res, 503, { error: 'Conversation inventory is unavailable until its access audit can be saved.' }); }
      const now = Date.now();
      return json(res, 200, {
        rooms: rooms.map((room) => {
          const started = Date.parse(room.startedAt);
          return {
            roomCode: room.roomCode,
            participants: [room.user1Pseudonym, room.user2Pseudonym],
            status: room.status,
            startedAt: room.startedAt,
            lastActivityAt: room.updatedAt,
            durationSeconds: Number.isFinite(started) ? Math.max(0, Math.floor((now - started) / 1000)) : null,
          };
        }),
        limit,
        offset,
        nextOffset: rooms.length === limit ? offset + limit : null,
      });
    }

    if (APP === 'server') {
      const guildList = await getDiscordGuilds(session);
      session = guildList.session;
      await saveSession(loaded.id, session);
      const manageable = guildList.guilds.filter(isServerManager);
      const botState = await loadBotGuilds();
      const botById = new Map(botState.guilds.map((guild) => [guild.id, guild]));
      if (method === 'GET' && url.pathname === '/api/guilds') {
        const list = manageable.map((guild) => {
          const bot = botById.get(guild.id);
          return {
            id: guild.id,
            name: guild.name,
            icon: guild.icon,
            owner: guild.owner,
            botInstalled: botState.stale ? null : Boolean(bot),
            memberCount: botState.stale ? null : bot?.memberCount ?? null,
            configurable: !botState.stale && Boolean(bot),
          };
        });
        return json(res, 200, { guilds: list, botSnapshotAvailable: !botState.stale });
      }

      const match = url.pathname.match(/^\/api\/guilds\/([0-9]{17,20})$/);
      if (match && method === 'GET') {
        const guildId = match[1];
        const membership = manageable.find((guild) => guild.id === guildId);
        if (!membership) return json(res, 404, { error: 'Server not found or not authorized.' });
        const botGuild = botById.get(guildId);
        if (!botGuild) return json(res, 409, { error: 'Destiny bot is not currently reporting this server.' });
        let liveChannels: BotChannel[];
        try { liveChannels = await getLiveBotChannels(guildId); }
        catch (error: any) { return json(res, Number.isInteger(error?.status) ? error.status : 503, { error: error.message || 'Could not verify Destiny’s current server permissions.' }); }
        const settings = await db.getGuildSettings(guildId, true);
        return json(res, 200, {
          guild: { id: guildId, name: botGuild.name, icon: botGuild.icon, memberCount: botGuild.memberCount },
          settings: {
            matchChannelId: settings?.matchChannelId ?? null,
            modLogChannelId: settings?.modLogChannelId ?? null,
            crossServerEnabled: settings?.crossServerEnabled ?? true,
            updatedAt: settings?.updatedAt ?? null,
          },
          channels: liveChannels.map(({ id, name, botPermissions }) => {
            const permissions = parseDiscordBits(botPermissions);
            return {
              id,
              name,
              canView: (permissions & (1n << 10n)) !== 0n,
              canSend: (permissions & (1n << 11n)) !== 0n,
              canEmbed: (permissions & (1n << 14n)) !== 0n,
            };
          }),
          botSnapshotAvailable: !botState.stale,
        });
      }

      const exportMatch = url.pathname.match(/^\/api\/guilds\/([0-9]{17,20})\/export$/);
      if (exportMatch && method === 'GET') {
        const guildId = exportMatch[1];
        const membership = manageable.find((guild) => guild.id === guildId);
        if (!membership) return json(res, 404, { error: 'Server not found or not authorized.' });
        if (botState.stale) return json(res, 503, { error: 'Destiny server status is unavailable; try the export again later.' });
        const botGuild = botById.get(guildId);
        if (!botGuild) return json(res, 409, { error: 'Destiny bot is not currently reporting this server.' });
        const settings = await db.getGuildSettings(guildId, true);
        const configuration = {
          format: 'destiny-guild-config',
          version: 1,
          exportedAt: new Date().toISOString(),
          guild: { id: guildId, name: botGuild.name },
          settings: {
            matchChannelId: settings?.matchChannelId ?? null,
            modLogChannelId: settings?.modLogChannelId ?? null,
            crossServerEnabled: settings?.crossServerEnabled ?? true,
            updatedAt: settings?.updatedAt ?? null,
          },
        };
        try {
          await db.logAdminAction(session.user.id, 'DASHBOARD_EXPORT_GUILD_CONFIG', 'guild', guildId, {
            format: configuration.format,
            version: configuration.version,
            fields: Object.keys(configuration.settings),
          });
        } catch {
          return json(res, 503, { error: 'Configuration export is unavailable until the access audit can be saved.' });
        }
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="destiny-guild-${guildId}-config.json"`,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        res.end(JSON.stringify(configuration, null, 2));
        return;
      }

      const rollbackMatch = url.pathname.match(/^\/api\/guilds\/([0-9]{17,20})\/audit\/([0-9a-f-]{36})\/rollback$/i);
      if (rollbackMatch && method === 'POST') {
        if (!await requireCsrf(req, session)) return json(res, 403, { error: 'Request verification failed.' });
        const guildId = rollbackMatch[1];
        const auditId = rollbackMatch[2];
        const membership = manageable.find((guild) => guild.id === guildId);
        if (!membership) return json(res, 404, { error: 'Server not found or not authorized.' });
        const body = await readBody(req);
        const expectedUpdatedAt = body.expectedUpdatedAt;
        if (expectedUpdatedAt !== null && (typeof expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(expectedUpdatedAt)))) return json(res, 400, { error: 'Reload the settings before rolling back this change.' });
        const event = await db.getGuildAdminAuditLogById(guildId, auditId);
        const rollbackField = event?.action === 'DASHBOARD_SET_PORTAL_CHANNEL'
          ? { key: 'matchChannelId' as const, currentKey: 'matchChannelId' as const }
          : event?.action === 'DASHBOARD_SET_MODLOG_CHANNEL'
            ? { key: 'modLogChannelId' as const, currentKey: 'modLogChannelId' as const }
            : event?.action === 'DASHBOARD_SET_CROSS_SERVER'
              ? { key: 'crossServerEnabled' as const, currentKey: 'crossServerEnabled' as const }
              : null;
        if (!event || !rollbackField || event.changes?.key !== rollbackField.key) return json(res, 422, { error: 'Only a supported dashboard setting change can be rolled back.' });
        const previousValue = event.changes.previous;
        const nextValue = event.changes.next;
        const channelSetting = rollbackField.key === 'matchChannelId' || rollbackField.key === 'modLogChannelId';
        if (channelSetting
          ? !((previousValue === null || discordId(previousValue)) && (nextValue === null || discordId(nextValue)))
          : typeof previousValue !== 'boolean' || typeof nextValue !== 'boolean') {
          return json(res, 422, { error: 'The saved audit change does not contain a reversible setting value.' });
        }
        const currentSettings = await db.getGuildSettings(guildId, true);
        const currentValue = rollbackField.key === 'crossServerEnabled'
          ? currentSettings?.crossServerEnabled ?? true
          : currentSettings?.[rollbackField.currentKey] ?? null;
        if (currentValue !== nextValue) return json(res, 409, { error: 'This setting has changed since the selected audit event; refresh history before rolling it back.' });
        if (channelSetting && typeof previousValue === 'string') {
          let liveChannels: BotChannel[];
          try { liveChannels = await getLiveBotChannels(guildId); }
          catch (error: any) { return json(res, Number.isInteger(error?.status) ? error.status : 503, { error: error.message || 'Could not verify Destiny’s current server permissions.' }); }
          const channel = liveChannels.find((candidate) => candidate.id === previousValue);
          const permissions = channel ? parseDiscordBits(channel.botPermissions) : 0n;
          const canView = (permissions & (1n << 10n)) !== 0n;
          const canSend = (permissions & (1n << 11n)) !== 0n;
          const canEmbed = (permissions & (1n << 14n)) !== 0n;
          if (!channel || !canView || !canSend || (rollbackField.key === 'matchChannelId' && !canEmbed)) return json(res, 422, { error: 'Destiny no longer has the required access to the previous channel, so this change cannot be rolled back.' });
        }
        const saved = await db.saveGuildDashboardSetting(
          guildId,
          rollbackField.key,
          previousValue as string | null | boolean,
          expectedUpdatedAt as string | null,
          membership.name,
        );
        if (saved.status === 'conflict') return json(res, 409, { error: 'Another administrator changed these settings. Reload the latest values and try again.' });
        try {
          await db.logAdminAction(session.user.id, 'DASHBOARD_ROLLBACK_SETTING', 'guild', guildId, {
            sourceAuditId: event.id,
            key: rollbackField.key,
            previous: currentValue,
            next: previousValue,
          });
        } catch {
          return json(res, 202, { ok: true, audit: 'unavailable', message: 'The setting was rolled back, but the audit record could not be written. Contact a platform owner.' });
        }
        return json(res, 200, { ok: true, audit: 'recorded', savedAt: saved.updatedAt });
      }

      const auditMatch = url.pathname.match(/^\/api\/guilds\/([0-9]{17,20})\/audit$/);
      if (auditMatch && method === 'GET') {
        const guildId = auditMatch[1];
        if (!manageable.some((guild) => guild.id === guildId)) return json(res, 404, { error: 'Server not found or not authorized.' });
        const limit = Number(url.searchParams.get('limit') || 25);
        const offset = Number(url.searchParams.get('offset') || 0);
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 10_000) return json(res, 400, { error: 'Invalid audit pagination.' });
        const logs = await db.getAdminAuditLogs({ targetId: guildId, limit, offset });
        return json(res, 200, { logs: logs.map(({ ipAddress: _ipAddress, ...log }) => ({ ...log, changes: safeAuditChanges(log.changes) })), limit, offset, nextOffset: logs.length === limit ? offset + limit : null });
      }

      const settingMatch = url.pathname.match(/^\/api\/guilds\/([0-9]{17,20})\/settings$/);
      if (settingMatch && method === 'PUT') {
        if (!await requireCsrf(req, session)) return json(res, 403, { error: 'Request verification failed.' });
        const guildId = settingMatch[1];
        const membership = manageable.find((guild) => guild.id === guildId);
        if (!membership) return json(res, 404, { error: 'Server not found or not authorized.' });
        const body = await readBody(req);
        const fields = Object.keys(body).filter((key) => key !== 'expectedUpdatedAt');
        if (fields.length !== 1) return json(res, 400, { error: 'Update one supported setting at a time.' });
        const expectedUpdatedAt = body.expectedUpdatedAt;
        if (expectedUpdatedAt !== null && (typeof expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(expectedUpdatedAt)))) return json(res, 400, { error: 'Reload the settings before saving this change.' });
        let liveChannels: BotChannel[];
        try { liveChannels = await getLiveBotChannels(guildId); }
        catch (error: any) { return json(res, Number.isInteger(error?.status) ? error.status : 503, { error: error.message || 'Could not verify Destiny’s current server permissions.' }); }
        const channelFields = ['matchChannelId', 'modLogChannelId'];
        if (channelFields.includes(fields[0])) {
          const channelId = body[fields[0]];
          if (channelId !== null && !discordId(channelId)) return json(res, 400, { error: 'Choose a text channel from this server.' });
          if (typeof channelId === 'string') {
            const channel = liveChannels.find((candidate) => candidate.id === channelId);
            const permissions = channel ? parseDiscordBits(channel.botPermissions) : 0n;
            const canView = (permissions & (1n << 10n)) !== 0n;
            const canSend = (permissions & (1n << 11n)) !== 0n;
            const canEmbed = (permissions & (1n << 14n)) !== 0n;
            if (!channel || !canView || !canSend || (fields[0] === 'matchChannelId' && !canEmbed)) return json(res, 422, { error: 'Destiny needs view and send access in that channel; the portal also needs Embed Links.' });
          }
          const previous = await db.getGuildSettings(guildId, true);
          const saved = await db.saveGuildDashboardSetting(guildId, fields[0] as 'matchChannelId' | 'modLogChannelId', channelId as string | null, expectedUpdatedAt as string | null, membership.name);
          if (saved.status === 'conflict') return json(res, 409, { error: 'Another administrator changed these settings. Reload the latest values and try again.' });
          try {
            await db.logAdminAction(session.user.id, fields[0] === 'matchChannelId' ? 'DASHBOARD_SET_PORTAL_CHANNEL' : 'DASHBOARD_SET_MODLOG_CHANNEL', 'guild', guildId, { key: fields[0], previous: previous?.[fields[0] === 'matchChannelId' ? 'matchChannelId' : 'modLogChannelId'] ?? null, next: channelId });
          } catch {
            return json(res, 202, { ok: true, audit: 'unavailable', message: 'Saved, but the audit record could not be written. Contact a platform owner.' });
          }
          return json(res, 200, { ok: true, audit: 'recorded', savedAt: saved.updatedAt });
        }
        if (fields[0] === 'crossServerEnabled' && typeof body.crossServerEnabled === 'boolean') {
          const previous = await db.getGuildSettings(guildId, true);
          const saved = await db.saveGuildDashboardSetting(guildId, 'crossServerEnabled', body.crossServerEnabled, expectedUpdatedAt as string | null, membership.name);
          if (saved.status === 'conflict') return json(res, 409, { error: 'Another administrator changed these settings. Reload the latest values and try again.' });
          try {
            await db.logAdminAction(session.user.id, 'DASHBOARD_SET_CROSS_SERVER', 'guild', guildId, { key: 'crossServerEnabled', previous: previous?.crossServerEnabled ?? true, next: body.crossServerEnabled });
          } catch {
            return json(res, 202, { ok: true, audit: 'unavailable', message: 'Saved, but the audit record could not be written. Contact a platform owner.' });
          }
          return json(res, 200, { ok: true, audit: 'recorded', savedAt: saved.updatedAt });
        }
        return json(res, 400, { error: 'Unsupported setting.' });
      }
    }
    return json(res, 404, { error: 'Not found.' });
  }

  if (method === 'GET') return serveStatic(url, res);
  return json(res, 404, { error: 'Not found.' });
}

if (config.NODE_ENV === 'production' && process.env.CLOUDFLARE_WORKER !== '1' && (!config.DISCORD_CLIENT_SECRET || SESSION_SECRET.length < 32)) {
  throw new Error(`Dashboard startup requires DISCORD_CLIENT_SECRET and a 32-character ${APP.toUpperCase()}_DASHBOARD_SESSION_SECRET in production.`);
}

const port = Number(process.env.PORT || (APP === 'owner' ? 4174 : 4173));
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.');
export async function handleDashboardRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    await handle(req, res);
  } catch (error: any) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    if (!res.headersSent) json(res, status, { error: status === 500 ? 'The request could not be completed.' : error.message });
    else res.destroy();
  }
}

export function createDashboardServer() {
  return createServer((req, res) => { void handleDashboardRequest(req, res); });
}

if (config.NODE_ENV !== 'test' && process.env.VERCEL !== '1' && process.env.CLOUDFLARE_WORKER !== '1') {
  const server = createDashboardServer();
  server.listen(port, () => console.log(`[Dashboard:${APP}] Listening on ${port} for ${ORIGIN}`));
}
