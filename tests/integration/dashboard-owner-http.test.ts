import { createHmac, randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import type { Server } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReportItem, UserProfile } from '../../src/core/types.js';

const rootOwnerId = '32345678901234567';
const ordinaryUserId = '42345678901234567';
let server: Server;
let port: number;
let host: string;
let stateStore: (typeof import('../../src/storage/state-store.js'))['stateStore'];
let ownerOrigin: string;
let ownerSessionSecret = '';
let ownerSessionKeys: string[] = [];
const csrfToken = 'test-csrf-token';

function request(path: string, cookie?: string, options: { method?: string; body?: string; csrf?: boolean } = {}): Promise<{ status: number; body: string; headers: import('node:http').IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      host: '127.0.0.1',
      port,
      path,
      method: options.method || 'GET',
      headers: {
        host,
        ...(cookie ? { cookie } : {}),
        ...(options.body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(options.body) } : {}),
        ...(options.csrf ? { origin: ownerOrigin, 'x-csrf-token': csrfToken } : {}),
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

async function createSession(userId: string): Promise<string> {
  const sessionId = randomUUID();
  const digest = createHmac('sha256', ownerSessionSecret || 'local-development-only').update(sessionId).digest('hex');
  const key = `dashboard:session:owner:${digest}`;
  ownerSessionKeys.push(key);
  await stateStore.set(key, JSON.stringify({
    user: { id: userId, username: 'Owner Test' },
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    tokenExpiresAt: Date.now() + 60 * 60 * 1000,
    csrfToken,
    createdAt: new Date().toISOString(),
  }), 2400);
  return sessionId;
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DASHBOARD_APP = 'owner';
  process.env.BOT_OWNER_IDS = rootOwnerId;
  process.env.OWNER_DASHBOARD_SESSION_SECRET = 'test-owner-dashboard-session-secret';
  process.env.DISCORD_CLIENT_ID = '92345678901234567';
  process.env.DISCORD_CLIENT_SECRET = 'test-owner-client-secret';
  process.env.SUPABASE_URL = 'https://mock-supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';
  const [{ config }, stateStoreModule, { createDashboardServer }] = await Promise.all([
    import('../../src/config/index.js'),
    import('../../src/storage/state-store.js'),
    import('../../src/dashboard/server.js'),
  ]);
  stateStore = stateStoreModule.stateStore;
  ownerSessionSecret = config.OWNER_DASHBOARD_SESSION_SECRET;
  ownerOrigin = new URL(config.OWNER_DASHBOARD_ORIGIN).origin;
  host = new URL(ownerOrigin).host;
  server = createDashboardServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Owner dashboard test server did not bind a TCP port.');
  port = address.port;
}, 30_000);

afterEach(() => vi.restoreAllMocks());

afterAll(async () => {
  await Promise.all(ownerSessionKeys.map((key) => stateStore.del(key)));
  if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

describe('owner dashboard HTTP authorization', () => {
  it('rejects unauthenticated and non-root access, then allows the configured root owner', async () => {
    const unauthenticated = await request('/api/owner/overview');
    const ordinarySession = await createSession(ordinaryUserId);
    const ordinary = await request('/api/owner/overview', `destiny_owner=${ordinarySession}`);
    const rootSession = await createSession(rootOwnerId);
    const root = await request('/api/owner/overview', `destiny_owner=${rootSession}`);

    expect(unauthenticated.status).toBe(401);
    expect(ordinary.status).toBe(403);
    expect(root.status).toBe(200);
    expect(JSON.parse(root.body).services.database).toBe('unavailable');
  });

  it('does not accept a server-dashboard cookie in the owner application', async () => {
    const sessionId = await createSession(rootOwnerId);
    const response = await request('/api/owner/overview', `destiny_admin=${sessionId}`);
    expect(response.status).toBe(401);
  });

  it('grants and revokes a capability with root-only management and immediate route revocation', async () => {
    const { db } = await import('../../src/database/supabase.js');
    const operatorId = '52345678901234567';
    const rootSession = await createSession(rootOwnerId);
    const operatorSession = await createSession(operatorId);
    const capability = 'safety.reports.review';

    const forbiddenList = await request('/api/owner/operators', `destiny_owner=${operatorSession}`);
    const deniedBeforeGrant = await request('/api/owner/reports?status=pending', `destiny_owner=${operatorSession}`);
    const grant = await request('/api/owner/operators', `destiny_owner=${rootSession}`, {
      method: 'POST', csrf: true, body: JSON.stringify({ discordUserId: operatorId, capability }),
    });
    const session = await request('/api/session', `destiny_owner=${operatorSession}`);
    const allowedRoute = await request('/api/owner/reports?status=pending', `destiny_owner=${operatorSession}`);
    const listed = await request('/api/owner/operators', `destiny_owner=${rootSession}`);
    const revoke = await request(`/api/owner/operators/${operatorId}/revoke`, `destiny_owner=${rootSession}`, {
      method: 'POST', csrf: true, body: JSON.stringify({ capability }),
    });
    const deniedAfterRevoke = await request('/api/owner/reports?status=pending', `destiny_owner=${operatorSession}`);

    expect(forbiddenList.status).toBe(403);
    expect(deniedBeforeGrant.status).toBe(403);
    expect(grant.status).toBe(200);
    expect(JSON.parse(grant.body)).toMatchObject({ changed: true, audit: 'recorded' });
    expect(JSON.parse(session.body)).toMatchObject({ rootOwner: false, capabilities: [capability] });
    // Capability authorization passes; this endpoint then reports that mock data is unavailable.
    expect(allowedRoute.status).toBe(503);
    expect(JSON.parse(listed.body).grants).toContainEqual(expect.objectContaining({ discordUserId: operatorId, capability, grantedBy: rootOwnerId }));
    expect(revoke.status).toBe(200);
    expect(JSON.parse(revoke.body)).toMatchObject({ changed: true, audit: 'recorded' });
    expect(deniedAfterRevoke.status).toBe(403);
    expect(db.mockAuditLogs.filter((entry) => entry.targetId === operatorId && entry.targetType === 'platform_operator')).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'PLATFORM_OPERATOR_CAPABILITY_GRANTED', adminId: rootOwnerId }),
      expect.objectContaining({ action: 'PLATFORM_OPERATOR_CAPABILITY_REVOKED', adminId: rootOwnerId }),
    ]));
  });

  it('rejects invalid operator grants and attempts to alter configured root owners', async () => {
    const rootSession = await createSession(rootOwnerId);
    const selfGrant = await request('/api/owner/operators', `destiny_owner=${rootSession}`, {
      method: 'POST', csrf: true, body: JSON.stringify({ discordUserId: rootOwnerId, capability: 'platform.health.read' }),
    });
    const invalidCapability = await request('/api/owner/operators', `destiny_owner=${rootSession}`, {
      method: 'POST', csrf: true, body: JSON.stringify({ discordUserId: ordinaryUserId, capability: 'platform.root' }),
    });

    expect(selfGrant.status).toBe(422);
    expect(invalidCapability.status).toBe(400);
  });

  it('allows only BOT_OWNER_IDS through the owner OAuth callback and audits both outcomes', async () => {
    const { db } = await import('../../src/database/supabase.js');
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/oauth2/token')) {
        const params = new URLSearchParams(String(init?.body || ''));
        const code = params.get('code') || '';
        return new Response(JSON.stringify({ access_token: `access-${code}`, refresh_token: `refresh-${code}`, expires_in: 3600 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/users/@me')) {
        const auth = new Headers(init?.headers).get('authorization') || '';
        const user = auth === 'Bearer access-root-code'
          ? { id: rootOwnerId, username: 'Root Owner' }
          : { id: ordinaryUserId, username: 'Ordinary User' };
        return new Response(JSON.stringify(user), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('Unexpected mocked Discord request', { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const deniedLogin = await request('/auth/login');
    const deniedAuth = new URL(String(deniedLogin.headers.location));
    const deniedCallback = await request(`/auth/callback?code=ordinary-code&state=${encodeURIComponent(deniedAuth.searchParams.get('state') || '')}`);
    const ownerLogin = await request('/auth/login');
    const ownerAuth = new URL(String(ownerLogin.headers.location));
    const ownerCallback = await request(`/auth/callback?code=root-code&state=${encodeURIComponent(ownerAuth.searchParams.get('state') || '')}`);
    const setCookie = ownerCallback.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    const ownerSession = await request('/api/session', String(cookieHeader).split(';')[0]);

    expect(deniedCallback.headers.location).toContain('auth=denied');
    expect(deniedCallback.headers['set-cookie']).toBeUndefined();
    expect(ownerCallback.status).toBe(302);
    expect(cookieHeader).toContain('destiny_owner=');
    expect(JSON.parse(ownerSession.body)).toMatchObject({ user: { id: rootOwnerId }, app: 'owner' });
    expect(db.mockAuditLogs.some((entry) => entry.action === 'OWNER_DASHBOARD_LOGIN_DENIED' && entry.adminId === ordinaryUserId)).toBe(true);
    expect(db.mockAuditLogs.some((entry) => entry.action === 'OWNER_DASHBOARD_LOGIN' && entry.adminId === rootOwnerId)).toBe(true);
  });

  it('allows a delegated operator with an active capability through owner OAuth', async () => {
    const { db } = await import('../../src/database/supabase.js');
    const capability = 'users.status.lookup';
    await db.setPlatformOperatorCapability(ordinaryUserId, capability, rootOwnerId, true);
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/oauth2/token')) {
        return new Response(JSON.stringify({ access_token: 'access-delegate-code', refresh_token: 'refresh-delegate-code', expires_in: 3600 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/users/@me')) {
        return new Response(JSON.stringify({ id: ordinaryUserId, username: 'Delegated Operator' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('Unexpected mocked Discord request', { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const login = await request('/auth/login');
      const authorization = new URL(String(login.headers.location));
      const callback = await request(`/auth/callback?code=delegate-code&state=${encodeURIComponent(authorization.searchParams.get('state') || '')}`);
      const setCookie = callback.headers['set-cookie'];
      const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      const session = await request('/api/session', String(cookieHeader).split(';')[0]);

      expect(callback.status).toBe(302);
      expect(String(cookieHeader)).toContain('destiny_owner=');
      expect(JSON.parse(session.body)).toMatchObject({ rootOwner: false, capabilities: [capability], user: { id: ordinaryUserId } });
    } finally {
      await db.setPlatformOperatorCapability(ordinaryUserId, capability, rootOwnerId, false);
    }
  });

  it('resolves an owner report through the existing atomic domain method and returns case-scoped evidence', async () => {
    const { db } = await import('../../src/database/supabase.js');
    const reportId = '11111111-1111-4111-8111-111111111111';
    const report: ReportItem = {
      id: reportId,
      reporterId: 'private-reporter',
      reportedId: 'private-reported',
      roomId: 'private-room',
      category: 'harassment',
      description: 'Case detail',
      chatExcerpt: [{ senderPseudonym: 'Moonlight', content: 'reported text', timestamp: new Date().toISOString() }],
      status: 'pending',
      actionTaken: 'none',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    vi.spyOn(db, 'isUsingMock').mockReturnValue(false);
    const getQueue = vi.spyOn(db, 'getReportQueue').mockResolvedValue([{ id: reportId, category: 'harassment', status: 'pending', actionTaken: 'none', createdAt: report.createdAt, updatedAt: report.updatedAt }]);
    const getReport = vi.spyOn(db, 'getReportById').mockResolvedValue(report);
    const resolve = vi.spyOn(db, 'resolveReport').mockResolvedValue(true);
    const audit = vi.spyOn(db, 'logAdminAction').mockResolvedValue();
    const rootSession = await createSession(rootOwnerId);

    const queue = await request('/api/owner/reports?status=pending', `destiny_owner=${rootSession}`);
    const detail = await request(`/api/owner/reports/${reportId}`, `destiny_owner=${rootSession}`);
    const resolution = await request(`/api/owner/reports/${reportId}`, `destiny_owner=${rootSession}`, {
      method: 'POST',
      csrf: true,
      body: JSON.stringify({ action: 'perma_ban', notes: 'Evidence supports a permanent safety restriction.' }),
    });

    expect(queue.status).toBe(200);
    expect(getQueue).toHaveBeenCalledWith({ status: 'pending', limit: 25, offset: 0 });
    expect(detail.status).toBe(200);
    expect(detail.body).not.toContain('private-reporter');
    expect(detail.body).not.toContain('private-reported');
    expect(detail.body).toContain('reported text');
    expect(resolution.status).toBe(200);
    expect(resolve).toHaveBeenCalledWith(reportId, 'perma_ban', 'Evidence supports a permanent safety restriction.', rootOwnerId);
    expect(audit).toHaveBeenCalledWith(rootOwnerId, 'OWNER_RESOLVE_REPORT', 'report', reportId, { action: 'perma_ban', category: 'harassment' });
    expect(getReport).toHaveBeenCalled();
  });

  it('routes verification decisions through the existing reviewer service', async () => {
    const [{ db }, { verificationService }] = await Promise.all([
      import('../../src/database/supabase.js'),
      import('../../src/core/moderation/verification.js'),
    ]);
    const userId = '22222222-2222-4222-8222-222222222222';
    const user: UserProfile = {
      id: userId,
      discordUserId: 'private-discord-id',
      destinyId: 'ABC123',
      age: 25,
      gender: 'female',
      genderVerified: false,
      genderVerificationStatus: 'pending',
      genderVerificationEvidence: 'private voice evidence',
      interests: [],
      languages: ['en'],
      preferredGender: ['any'],
      minAgePref: 18,
      maxAgePref: 99,
      isBanned: false,
      reputationScore: 100,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    vi.spyOn(db, 'isUsingMock').mockReturnValue(false);
    const queue = vi.spyOn(db, 'getPendingVerificationQueue').mockResolvedValue([{ id: userId, destinyId: user.destinyId, age: user.age, gender: user.gender, createdAt: user.createdAt }]);
    const getUser = vi.spyOn(db, 'getUserById').mockResolvedValue(user);
    const review = vi.spyOn(verificationService, 'reviewVerification').mockResolvedValue({ success: true, message: 'Verification approved.', auditWarning: false });
    const rootSession = await createSession(rootOwnerId);

    const queueResponse = await request('/api/owner/verification', `destiny_owner=${rootSession}`);
    const detail = await request(`/api/owner/verification/${userId}`, `destiny_owner=${rootSession}`);
    const decision = await request(`/api/owner/verification/${userId}`, `destiny_owner=${rootSession}`, {
      method: 'POST',
      csrf: true,
      body: JSON.stringify({ approved: true, notes: 'Evidence matches the submitted verification request.' }),
    });

    expect(queueResponse.status).toBe(200);
    expect(queue).toHaveBeenCalledWith({ limit: 25, offset: 0 });
    expect(queueResponse.body).not.toContain('private-discord-id');
    expect(detail.status).toBe(200);
    expect(detail.body).toContain('private voice evidence');
    expect(detail.body).not.toContain('private-discord-id');
    expect(decision.status).toBe(200);
    expect(review).toHaveBeenCalledWith(rootOwnerId, userId, true, 'Evidence matches the submitted verification request.');
    expect(getUser).toHaveBeenCalledWith(userId, true);
  });

  it('fails closed when user lookup cannot write its audit record', async () => {
    const { db } = await import('../../src/database/supabase.js');
    const user: UserProfile = {
      id: 'lookup-user',
      discordUserId: 'private-discord-id',
      destinyId: 'ABC123',
      age: 25,
      gender: 'female',
      genderVerified: false,
      genderVerificationStatus: 'unverified',
      interests: [],
      languages: ['en'],
      preferredGender: ['any'],
      minAgePref: 18,
      maxAgePref: 99,
      isBanned: false,
      reputationScore: 100,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    vi.spyOn(db, 'isUsingMock').mockReturnValue(false);
    const lookup = vi.spyOn(db, 'getUserByDestinyId').mockResolvedValue(user);
    vi.spyOn(db, 'logAdminAction').mockRejectedValue(new Error('audit unavailable'));
    const rootSession = await createSession(rootOwnerId);

    const response = await request('/api/owner/users/search', `destiny_owner=${rootSession}`, {
      method: 'POST',
      csrf: true,
      body: JSON.stringify({ query: 'DESTINY-ABC123' }),
    });

    expect(response.status).toBe(503);
    expect(response.body).not.toContain('private-discord-id');
    expect(lookup).toHaveBeenCalledWith('ABC123');
  });
});
