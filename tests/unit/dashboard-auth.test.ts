import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSessionToken,
  safeEqual,
  verifyAdminPassword,
  verifySessionToken,
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
    expect(await verifyAdminPassword('anything')).toBe(false);
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

  it('rejects malformed tokens and invalid session lifetimes', async () => {
    vi.stubEnv('DASHBOARD_SESSION_SECRET', 'test-session-secret-with-enough-entropy');
    expect(await createSessionToken(0)).toBeNull();
    expect(await createSessionToken(SESSION_TTL_SECONDS + 1)).toBeNull();
    expect(await verifySessionToken('not-a-token')).toBe(false);
  });
});
