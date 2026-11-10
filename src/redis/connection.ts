import { config } from '../config/index.js';

/**
 * Resolved Redis connection parameters, shared by the ioredis client and the
 * BullMQ queues so both always talk to the same instance with the same
 * credentials.
 */
export interface RedisConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db: number;
  tls?: { rejectUnauthorized: boolean };
}

interface RedisEnv {
  REDIS_HOST?: string;
  REDIS_PORT?: string | number;
  REDIS_USERNAME?: string;
  REDIS_PASSWORD?: string;
  REDIS_TOKEN?: string;
  REDIS_URL?: string;
  REDIS_DB?: string | number;
  REDIS_TLS?: string | boolean;
}

/**
 * Builds the Redis connection options from the environment.
 *
 * Three ways to configure, in priority order:
 *
 *  1. `REDIS_URL` — the single-variable form used by hosted providers, e.g.
 *     `rediss://default:<token>@my-db.upstash.io:6379`. Host, port, password
 *     and TLS are all taken from the URL.
 *  2. `REDIS_HOST` + `REDIS_PORT` with `REDIS_TOKEN` (or `REDIS_PASSWORD`) as
 *     the credential. `REDIS_TOKEN` wins when both are set, since it is the
 *     dedicated access token.
 *  3. Local Redis on `127.0.0.1:6379` with no authentication.
 *
 * Values are read straight from `process.env` so the resolver can be exercised
 * with different environments without re-importing the config module.
 */
export function resolveRedisConnection(env: RedisEnv = process.env as RedisEnv): RedisConnectionOptions {
  const url = (env.REDIS_URL || '').trim();

  if (url) {
    return fromUrl(url, env);
  }

  const password = env.REDIS_TOKEN || env.REDIS_PASSWORD || undefined;

  return {
    host: env.REDIS_HOST || '127.0.0.1',
    port: Number(env.REDIS_PORT) || 6379,
    username: env.REDIS_USERNAME || undefined,
    password: password || undefined,
    db: Number(env.REDIS_DB) || 0,
    ...(isTls(env) ? { tls: { rejectUnauthorized: false } } : {}),
  };
}

function isTls(env: RedisEnv): boolean {
  return env.REDIS_TLS === true || env.REDIS_TLS === 'true';
}

function fromUrl(raw: string, env: RedisEnv): RedisConnectionOptions {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    console.warn('[Redis] REDIS_URL is not a valid URL — falling back to host/port.');
    return {
      host: env.REDIS_HOST || '127.0.0.1',
      port: Number(env.REDIS_PORT) || 6379,
      username: env.REDIS_USERNAME || undefined,
      password: env.REDIS_TOKEN || env.REDIS_PASSWORD || undefined,
      db: Number(env.REDIS_DB) || 0,
      ...(isTls(env) ? { tls: { rejectUnauthorized: false } } : {}),
    };
  }

  const username = decodeURIComponent(parsed.username || '') || env.REDIS_USERNAME || undefined;
  const password = decodeURIComponent(parsed.password || '') || undefined;

  return {
    host: parsed.hostname || env.REDIS_HOST || '127.0.0.1',
    port: parsed.port ? Number(parsed.port) : Number(env.REDIS_PORT) || 6379,
    username,
    password: password || env.REDIS_TOKEN || env.REDIS_PASSWORD || undefined,
    db: Number(env.REDIS_DB) || 0,
    ...(parsed.protocol === 'rediss:' || isTls(env) ? { tls: { rejectUnauthorized: false } } : {}),
  };
}

/**
 * Human readable description of the target instance, with no credentials in
 * it — safe to log.
 */
export function describeRedisTarget(env: RedisEnv = process.env as RedisEnv): string {
  const { host, port, tls, password } = resolveRedisConnection(env);
  const auth = password ? ' (authenticated)' : ' (no auth)';
  const scheme = tls ? 'rediss' : 'redis';
  return `${scheme}://${host}:${port}${auth}`;
}
