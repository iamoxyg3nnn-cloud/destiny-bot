import { describe, it, expect } from 'vitest';
import { resolveRedisConnection, describeRedisTarget } from '../../src/redis/connection.js';

const BASE = {
  REDIS_HOST: undefined,
  REDIS_PORT: undefined,
  REDIS_USERNAME: undefined,
  REDIS_PASSWORD: undefined,
  REDIS_TOKEN: undefined,
  REDIS_URL: undefined,
  REDIS_DB: undefined,
  REDIS_TLS: undefined,
} as Record<string, string | undefined>;

const resolve = (env: Record<string, string | undefined>) =>
  resolveRedisConnection({ ...BASE, ...env } as any);

const target = (env: Record<string, string | undefined>) =>
  describeRedisTarget({ ...BASE, ...env } as any);

describe('Redis connection resolution', () => {
  it('should default to a local unauthenticated instance', () => {
    const result = resolve({});
    expect(result.host).toBe('127.0.0.1');
    expect(result.port).toBe(6379);
    expect(result.password).toBeUndefined();
    expect(result.tls).toBeUndefined();
    expect(target({})).toContain('127.0.0.1:6379');
    expect(target({})).toContain('no auth');
  });

  it('should use REDIS_TOKEN as the password', () => {
    const token = 'a'.repeat(51);
    const result = resolve({ REDIS_HOST: 'my-db.upstash.io', REDIS_PORT: '6379', REDIS_TOKEN: token });
    expect(result.password).toBe(token);
    expect(result.host).toBe('my-db.upstash.io');
    // The token must never be logged.
    expect(target({ REDIS_HOST: 'my-db.upstash.io', REDIS_TOKEN: token })).not.toContain(token);
    expect(target({ REDIS_HOST: 'my-db.upstash.io', REDIS_TOKEN: token })).toContain('authenticated');
  });

  it('should prefer REDIS_TOKEN over REDIS_PASSWORD', () => {
    const result = resolve({ REDIS_TOKEN: 'token-value', REDIS_PASSWORD: 'password-value' });
    expect(result.password).toBe('token-value');
  });

  it('should fall back to REDIS_PASSWORD when no token is set', () => {
    const result = resolve({ REDIS_PASSWORD: 'password-value' });
    expect(result.password).toBe('password-value');
  });

  it('should use the Redis ACL username when configured directly', () => {
    const result = resolve({ REDIS_USERNAME: 'service-user' });
    expect(result.username).toBe('service-user');
  });

  it('should enable TLS when REDIS_TLS is true', () => {
    const result = resolve({ REDIS_HOST: 'secure.example.com', REDIS_TLS: 'true' });
    expect(result.tls).toEqual({ rejectUnauthorized: true });
    expect(target({ REDIS_HOST: 'secure.example.com', REDIS_TLS: 'true' })).toContain('rediss://');
  });

  it('should accept case-insensitive true for REDIS_TLS', () => {
    expect(resolve({ REDIS_TLS: 'TRUE' }).tls).toEqual({ rejectUnauthorized: true });
  });

  it('should not enable TLS when REDIS_TLS is false', () => {
    const result = resolve({ REDIS_TLS: 'false' });
    expect(result.tls).toBeUndefined();
    expect(target({ REDIS_TLS: 'false' })).toContain('redis://');
  });

  it('should parse host, port, password, TLS and database index from REDIS_URL', () => {
    const result = resolve({ REDIS_URL: 'rediss://default:secret-token@my-db.upstash.io:6380/2' });
    expect(result.host).toBe('my-db.upstash.io');
    expect(result.port).toBe(6380);
    expect(result.db).toBe(2);
    expect(result.password).toBe('secret-token');
    expect(result.tls).toEqual({ rejectUnauthorized: true });
    expect(target({ REDIS_URL: 'rediss://default:secret-token@my-db.upstash.io:6380' })).not.toContain('secret-token');
  });

  it('should parse and decode the ACL username from REDIS_URL', () => {
    const result = resolve({ REDIS_URL: 'redis://service%2Duser:secret@my-db.example.com:6379' });
    expect(result.username).toBe('service-user');
    expect(result.password).toBe('secret');
  });

  it('should URL-decode a percent-encoded password from REDIS_URL', () => {
    const result = resolve({ REDIS_URL: 'redis://default:p%40ss%3Aword@host.example.com:6379' });
    expect(result.password).toBe('p@ss:word');
  });

  it('should let REDIS_URL override the discrete host and port', () => {
    const result = resolve({
      REDIS_HOST: 'ignored.example.com',
      REDIS_PORT: '1111',
      REDIS_URL: 'redis://default:t@url-host.example.com:2222',
    });
    expect(result.host).toBe('url-host.example.com');
    expect(result.port).toBe(2222);
  });

  it('should reject malformed REDIS_URL values instead of silently connecting elsewhere', () => {
    expect(() => resolve({ REDIS_URL: 'not-a-valid-url' })).toThrow();
  });

  it('should reject unsupported URL schemes', () => {
    expect(() => resolve({ REDIS_URL: 'https://redis.example.com' })).toThrow('redis:// or rediss://');
  });

  it('should never leak the credential into the log description', () => {
    const secret = 'S3CRET-TOKEN-VALUE-1234567890';
    expect(target({ REDIS_HOST: 'h.example.com', REDIS_TOKEN: secret })).not.toContain(secret);
    expect(target({ REDIS_URL: `redis://default:${secret}@h.example.com:6379` })).not.toContain(secret);
  });
});
