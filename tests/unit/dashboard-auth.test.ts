import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSessionToken,
  isAdminPasswordConfigured,
  safeEqual,
  verifyAdminPassword,
  verifySessionToken,
  readSessionPayload,
  SESSION_TTL_SECONDS,
} from '../../dashboard/lib/auth.js';

describe('Dashboard authentication helpers', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('does not accept colliding strings in the old lossy comparison', async () => {
    expect(await safeEqual('Aa', 'BB')).toBe(false);
    expect(await safeEqual('same-secret', 'same-secret')).toBe(true);
  });

  it('fails closed when no admin password is configured', async () => {
    vi.stubEnv('DASHBOARD_ADMIN_PASSWORD', '');
    expect(isAdminPasswordConfigured()).toBe(false);
    expect(await verifyAdminPassword('anything')).toBe(false);
  });

  it('rejects known placeholder admin passwords', async () => {
    vi.stubEnv('DASHBOARD_ADMIN_PASSWORD', 'replace_with');
    expect(isAdminPasswordConfigured()).toBe(false);
    expect(await verifyAdminPassword('replace_with')).toBe(false);
  });

  it('accepts a strong password beginning with a formerly blocked prefix', async () => {
    const password = 'administrator-with-a-long-unique-passphrase';
    vi.stubEnv('DASHBOARD_ADMIN_PASSWORD', password);
    expect(isAdminPasswordConfigured()).toBe(true);
    expect(await verifyAdminPassword(password)).toBe(true);
    expect(await verifyAdminPassword('administrator-with-a-different-passphrase')).toBe(false);
  });

  it('verifies admin passwords without accepting oversized input', async () => {
    vi.stubEnv('DASHBOARD_ADMIN_PASSWORD', 'correct-horse-battery-staple');
    expect(await verifyAdminPassword('correct-horse-battery-staple')).toBe(true);
    expect(await verifyAdminPassword('x'.repeat(1025))).toBe(false);
  });

  it('accepts a valid signed session and rejects tampering', async () => {
    vi.stubEnv('DASHBOARD_SESSION_SECRET', 'test-session-secret-with-enough-entropy');
    const token = await createSessionToken(60);
    expect(token).toBeTruthy();
    expect(await verifySessionToken(token)).toBe(true);
    const [payload, signature] = token!.split('.');
    const changedSignature = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);
    expect(await verifySessionToken(`${payload}.${changedSignature}`)).toBe(false);
  });

  it('binds Discord owner identity into the signed session', async () => {
    vi.stubEnv('DASHBOARD_SESSION_SECRET', 'test-session-secret-with-enough-entropy');
    vi.stubEnv('DASHBOARD_OWNER_OAUTH_ENABLED', 'true');
    vi.stubEnv('BOT_OWNER_IDS', '123456789012345678,234567890123456789');
    const token = await createSessionToken(60, '123456789012345678');
    expect(token).toBeTruthy();
    expect(await verifySessionToken(token)).toBe(true);
    expect(await readSessionPayload(token)).toMatchObject({
      sub: '123456789012345678',
      role: 'owner',
    });
    expect(await createSessionToken(60, 'not-a-discord-id')).toBeNull();
  });

  it('accepts a strong session secret with a formerly blocked prefix', async () => {
    vi.stubEnv('DASHBOARD_SESSION_SECRET', 'your_own-generated-session-secret-with-enough-randomness');
    const token = await createSessionToken(60);
    expect(token).toBeTruthy();
    expect(await verifySessionToken(token)).toBe(true);
  });

  it('rejects malformed tokens and invalid session lifetimes', async () => {
    vi.stubEnv('DASHBOARD_SESSION_SECRET', 'test-session-secret-with-enough-entropy');
    expect(await createSessionToken(0)).toBeNull();
    expect(await createSessionToken(SESSION_TTL_SECONDS + 1)).toBeNull();
    expect(await verifySessionToken('not-a-token')).toBe(false);
  });
});
