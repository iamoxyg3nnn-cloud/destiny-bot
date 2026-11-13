import { request as httpRequest } from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { config } from '../../src/config/index.js';
import { stateStore } from '../../src/storage/state-store.js';

let server: Server;
let port: number;
const allowedHost = new URL(config.SERVER_DASHBOARD_ORIGIN).host;

function request(path: string, options: { method?: string; host?: string; body?: string; cookie?: string; csrf?: string | boolean } = {}): Promise<{ status: number; body: string; headers: import('node:http').IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      host: '127.0.0.1',
      port,
      path,
      method: options.method || 'GET',
      headers: {
        host: options.host || allowedHost,
        ...(options.cookie ? { cookie: options.cookie } : {}),
        ...(options.csrf ? { origin: new URL(config.SERVER_DASHBOARD_ORIGIN).origin, 'x-csrf-token': typeof options.csrf === 'string' ? options.csrf : 'test-csrf-token' } : {}),
        ...(options.body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(options.body) } : {}),
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8'), headers: res.headers }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

beforeAll(async () => {
  config.DISCORD_TOKEN = 'test-bot-token';
  config.DISCORD_CLIENT_ID = '52345678901234567';
  config.DISCORD_CLIENT_SECRET = 'test-client-secret';
  config.SERVER_DASHBOARD_SESSION_SECRET = 'test-server-dashboard-session-secret';
  const { createDashboardServer } = await import('../../src/dashboard/server.js');
  server = createDashboardServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Dashboard test server did not bind a TCP port.');
  port = address.port;
}, 30_000);

afterAll(async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

afterEach(() => vi.unstubAllGlobals());

describe('dashboard HTTP boundary', () => {
  it('serves the server app and health check only on its configured host', async () => {
    const health = await request('/health');
    const page = await request('/');
    const wrongHost = await request('/health', { host: 'untrusted.example' });

    expect(health.status).toBe(200);
    expect(JSON.parse(health.body)).toMatchObject({ status: 'ok', app: 'server' });
    expect(page.status).toBe(200);
    expect(page.body).toContain('data-app="server"');
    expect(wrongHost.status).toBe(421);
  });

  it('rejects unauthenticated API reads and mutations', async () => {
    const read = await request('/api/guilds');
    const write = await request('/api/guilds/12345678901234567/settings', {
      method: 'PUT',
      body: JSON.stringify({ crossServerEnabled: false, expectedUpdatedAt: null }),
    });

    expect(read.status).toBe(401);
    expect(write.status).toBe(401);
  });

  it('completes a mocked OAuth PKCE round trip, revokes the session, and rejects state replay', async () => {
    const user = { id: '82345678901234567', username: 'OAuth Tester', global_name: 'OAuth Tester' };
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/oauth2/token/revoke')) return new Response(null, { status: 200 });
      if (url.endsWith('/oauth2/token')) return new Response(JSON.stringify({ access_token: 'mock-access', refresh_token: 'mock-refresh', expires_in: 3600 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.endsWith('/users/@me')) return new Response(JSON.stringify(user), { status: 200, headers: { 'Content-Type': 'application/json' } });
      return new Response('Unexpected mocked Discord request', { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const login = await request('/auth/login');
    const authorizeUrl = new URL(String(login.headers.location));
    const state = authorizeUrl.searchParams.get('state') || '';
    const callback = await request(`/auth/callback?code=mock-code&state=${encodeURIComponent(state)}`);
    const setCookie = callback.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    const cookie = String(cookieHeader).split(';')[0];
    const session = await request('/api/session', { cookie });
    const sessionId = cookie.split('=')[1];
    const sessionDigest = createHmac('sha256', config.SERVER_DASHBOARD_SESSION_SECRET)
      .update(sessionId)
      .digest('hex');
    const stateSessionKey = `dashboard:session:server:${sessionDigest}`;
    const storedSession = JSON.parse((await stateStore.get(stateSessionKey)) || '{}');
    storedSession.tokenExpiresAt = Date.now() - 1000;
    await stateStore.set(stateSessionKey, JSON.stringify(storedSession), 2400);
    const refreshedSession = await request('/api/session', { cookie });
    const replay = await request(`/auth/callback?code=mock-code&state=${encodeURIComponent(state)}`);
    const logout = await request('/auth/logout', { method: 'POST', body: '{}', cookie, csrf: JSON.parse(session.body).csrfToken });
    const afterLogout = await request('/api/session', { cookie });

    expect(login.status).toBe(302);
    expect(authorizeUrl.origin).toBe('https://discord.com');
    expect(authorizeUrl.searchParams.get('response_type')).toBe('code');
    expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorizeUrl.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(authorizeUrl.searchParams.get('scope')).toBe('identify guilds');
    expect(callback.status).toBe(302);
    expect(cookieHeader).toContain('HttpOnly');
    expect(cookieHeader).toContain('SameSite=Lax');
    expect(session.status).toBe(200);
    expect(JSON.parse(session.body)).toMatchObject({ user, app: 'server' });
    expect(refreshedSession.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/oauth2/token'), expect.objectContaining({ method: 'POST' }));
    expect(replay.headers.location).toContain('auth=failed');
    expect(logout.status).toBe(200);
    expect(JSON.parse(logout.body)).toEqual({ ok: true });
    expect(afterLogout.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/oauth2/token/revoke'), expect.objectContaining({ method: 'POST' }));
  });

  it('rechecks current Discord guild membership on every request and isolates guilds', async () => {
    const sessionId = randomUUID();
    const sessionKey = createHmac('sha256', config.SERVER_DASHBOARD_SESSION_SECRET || 'local-development-only')
      .update(sessionId)
      .digest('hex');
    const stateSessionKey = `dashboard:session:server:${sessionKey}`;
    const guildA = '12345678901234567';
    const guildB = '22345678901234567';
    const shardSetKey = 'bot:guild-shards';
    const shardSnapshotKey = 'bot:guilds:0';
    const session = {
      user: { id: '32345678901234567', username: 'Dashboard Tester' },
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      tokenExpiresAt: Date.now() + 60 * 60 * 1000,
      csrfToken: 'test-csrf-token',
      createdAt: new Date().toISOString(),
    };
    await stateStore.set(stateSessionKey, JSON.stringify(session), 2400);
    await stateStore.sAdd(shardSetKey, '0');
    await stateStore.set(shardSnapshotKey, JSON.stringify([{ id: guildA, name: 'Guild A', icon: null, memberCount: 12, channels: [] }]), 180);
    let currentGuilds = [{ id: guildA, name: 'Guild A', icon: null, owner: false, permissions: '32' }];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(currentGuilds), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    const cookie = `destiny_admin=${sessionId}`;

    try {
      const authorized = await request('/api/guilds', { cookie });
      const crossGuild = await request(`/api/guilds/${guildB}`, { cookie });
      currentGuilds = [];
      const revoked = await request('/api/guilds', { cookie });

      expect(authorized.status).toBe(200);
      expect(JSON.parse(authorized.body).guilds).toEqual(expect.arrayContaining([expect.objectContaining({ id: guildA, configurable: true })]));
      expect(crossGuild.status).toBe(404);
      expect(JSON.parse(revoked.body).guilds).toEqual([]);
    } finally {
      await Promise.all([
        stateStore.del(stateSessionKey),
        stateStore.del(shardSnapshotKey),
        stateStore.sRem(shardSetKey, '0'),
      ]);
    }
  });

  it('rejects stale guild-setting writes through the authenticated HTTP route', async () => {
    const sessionId = randomUUID();
    const sessionKey = createHmac('sha256', config.SERVER_DASHBOARD_SESSION_SECRET || 'local-development-only')
      .update(sessionId)
      .digest('hex');
    const stateSessionKey = `dashboard:session:server:${sessionKey}`;
    const guildId = '62345678901234567';
    const channelId = '72345678901234567';
    const shardSetKey = 'bot:guild-shards';
    const shardSnapshotKey = 'bot:guilds:0';
    const session = {
      user: { id: '32345678901234567', username: 'Dashboard Tester' },
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      tokenExpiresAt: Date.now() + 60 * 60 * 1000,
      csrfToken: 'test-csrf-token',
      createdAt: new Date().toISOString(),
    };
    await stateStore.set(stateSessionKey, JSON.stringify(session), 2400);
    await stateStore.sAdd(shardSetKey, '0');
    await stateStore.set(shardSnapshotKey, JSON.stringify([{ id: guildId, name: 'Settings Test Guild', icon: null, memberCount: 5, channels: [] }]), 180);
    const guildMembership = [{ id: guildId, name: 'Settings Test Guild', icon: null, owner: false, permissions: '32' }];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/v10/users/@me/guilds') return new Response(JSON.stringify(guildMembership), { status: 200 });
      if (url.pathname === `/api/v10/guilds/${guildId}/roles`) return new Response(JSON.stringify([{ id: guildId, permissions: '19456' }]), { status: 200 });
      if (url.pathname === `/api/v10/guilds/${guildId}/members/${config.DISCORD_CLIENT_ID}`) return new Response(JSON.stringify({ roles: [] }), { status: 200 });
      if (url.pathname === `/api/v10/guilds/${guildId}/channels`) return new Response(JSON.stringify([{ id: channelId, name: 'matchmaking', type: 0 }]), { status: 200 });
      return new Response('Not found', { status: 404 });
    }));
    const cookie = `destiny_admin=${sessionId}`;

    try {
      const csrfMissing = await request(`/api/guilds/${guildId}/settings`, {
        method: 'PUT',
        cookie,
        body: JSON.stringify({ crossServerEnabled: false, expectedUpdatedAt: null }),
      });
      const first = await request(`/api/guilds/${guildId}/settings`, {
        method: 'PUT',
        cookie,
        csrf: true,
        body: JSON.stringify({ crossServerEnabled: false, expectedUpdatedAt: null }),
      });
      const stale = await request(`/api/guilds/${guildId}/settings`, {
        method: 'PUT',
        cookie,
        csrf: true,
        body: JSON.stringify({ crossServerEnabled: true, expectedUpdatedAt: null }),
      });
      const current = await request(`/api/guilds/${guildId}`, { cookie });
      const exported = await request(`/api/guilds/${guildId}/export`, { cookie });
      const audit = await request(`/api/guilds/${guildId}/audit`, { cookie });
      const auditLogs = JSON.parse(audit.body).logs as Array<{ id: string; action: string }>;
      const settingEvent = auditLogs.find((entry) => entry.action === 'DASHBOARD_SET_CROSS_SERVER');

      expect(csrfMissing.status).toBe(403);
      expect(first.status).toBe(200);
      expect(JSON.parse(first.body).audit).toBe('recorded');
      expect(stale.status).toBe(409);
      expect(JSON.parse(stale.body).error).toContain('Another administrator changed');
      expect(JSON.parse(current.body).settings.crossServerEnabled).toBe(false);
      expect(exported.status).toBe(200);
      expect(exported.headers['content-disposition']).toContain(`destiny-guild-${guildId}-config.json`);
      expect(JSON.parse(exported.body)).toMatchObject({
        format: 'destiny-guild-config',
        version: 1,
        guild: { id: guildId, name: 'Settings Test Guild' },
        settings: { matchChannelId: null, modLogChannelId: null, crossServerEnabled: false },
      });
      expect(exported.body).not.toContain('discordUserId');
      expect(audit.status).toBe(200);
      expect(JSON.parse(audit.body).logs).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: 'DASHBOARD_EXPORT_GUILD_CONFIG', targetId: guildId }),
      ]));
      expect(settingEvent).toBeDefined();
      const staleRollback = await request(`/api/guilds/${guildId}/audit/${settingEvent!.id}/rollback`, {
        method: 'POST',
        cookie,
        csrf: true,
        body: JSON.stringify({ expectedUpdatedAt: null }),
      });
      const rollback = await request(`/api/guilds/${guildId}/audit/${settingEvent!.id}/rollback`, {
        method: 'POST',
        cookie,
        csrf: true,
        body: JSON.stringify({ expectedUpdatedAt: JSON.parse(current.body).settings.updatedAt }),
      });
      const rolledBack = await request(`/api/guilds/${guildId}`, { cookie });
      const auditAfterRollback = await request(`/api/guilds/${guildId}/audit`, { cookie });
      expect(staleRollback.status).toBe(409);
      expect(rollback.status).toBe(200);
      expect(JSON.parse(rolledBack.body).settings.crossServerEnabled).toBe(true);
      expect(JSON.parse(auditAfterRollback.body).logs).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: 'DASHBOARD_ROLLBACK_SETTING', targetId: guildId }),
      ]));
    } finally {
      await Promise.all([
        stateStore.del(stateSessionKey),
        stateStore.del(shardSnapshotKey),
        stateStore.sRem(shardSetKey, '0'),
      ]);
    }
  });
});
