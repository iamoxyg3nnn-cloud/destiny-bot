import { describe, it, expect } from 'vitest';
import { verifyAdminAuth, getAdminSecretKey, ADMIN_COOKIE_NAME } from '../../destiny frontend/src/lib/admin-auth.js';

describe('Admin Authentication Guard', () => {
  it('correctly resolves admin secret key', () => {
    const key = getAdminSecretKey();
    expect(key).toBeDefined();
    expect(key.length).toBeGreaterThan(5);
  });

  it('rejects unauthenticated requests without cookie or bearer token', () => {
    const req = {
      cookies: { get: () => undefined },
      headers: { get: () => null },
    };
    expect(verifyAdminAuth(req)).toBe(false);
  });

  it('rejects requests with invalid bearer token', () => {
    const req = {
      cookies: { get: () => undefined },
      headers: { get: (name: string) => (name === 'authorization' ? 'Bearer invalid-secret' : null) },
    };
    expect(verifyAdminAuth(req)).toBe(false);
  });

  it('accepts requests with valid bearer token', () => {
    const secret = getAdminSecretKey();
    const req = {
      cookies: { get: () => undefined },
      headers: { get: (name: string) => (name === 'authorization' ? `Bearer ${secret}` : null) },
    };
    expect(verifyAdminAuth(req)).toBe(true);
  });

  it('accepts requests with valid admin cookie', () => {
    const secret = getAdminSecretKey();
    const req = {
      cookies: { get: (name: string) => (name === ADMIN_COOKIE_NAME ? { value: secret } : undefined) },
      headers: { get: () => null },
    };
    expect(verifyAdminAuth(req)).toBe(true);
  });
});
