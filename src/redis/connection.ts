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
  if (url) return fromUrl(url, env);

  const password = env.REDIS_TOKEN || env.REDIS_PASSWORD || undefined;
  return {
    host: env.REDIS_HOST || '127.0.0.1',
    port: validInteger(env.REDIS_PORT, 6379, 1, 65535),
    username: env.REDIS_USERNAME || undefined,
    password,
    db: validInteger(env.REDIS_DB, 0, 0, Number.MAX_SAFE_INTEGER),
    ...(isTls(env) ? { tls: { rejectUnauthorized: true } } : {}),
  };
}

function validInteger(value: string | number | undefined, fallback: number, min: number, max: number): number {
  const parsed = value === undefined || value === '' ? fallback : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function isTls(env: RedisEnv): boolean {
  return env.REDIS_TLS === true || String(env.REDIS_TLS || '').toLowerCase() === 'true';
}

function fromUrl(raw: string, env: RedisEnv): RedisConnectionOptions {
  const parsed = new URL(raw);
  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
    throw new Error('REDIS_URL must use redis:// or rediss://.');
  }
  if (!parsed.hostname) throw new Error('REDIS_URL must include a hostname.');

  let username: string | undefined;
  let password: string | undefined;
  try {
    username = decodeURIComponent(parsed.username || '') || env.REDIS_USERNAME || undefined;
    password = decodeURIComponent(parsed.password || '') || undefined;
  } catch {
    throw new Error('REDIS_URL contains invalid percent-encoding in its credentials.');
  }

  const pathDb = parsed.pathname.replace(/^\/+/, '');
  const db = pathDb ? validInteger(pathDb, -1, 0, Number.MAX_SAFE_INTEGER) : validInteger(env.REDIS_DB, 0, 0, Number.MAX_SAFE_INTEGER);
  if (db < 0) throw new Error('REDIS_URL database path must be a non-negative integer.');

  return {
    host: parsed.hostname,
    port: validInteger(parsed.port || env.REDIS_PORT, 6379, 1, 65535),
    username,
    password: password || env.REDIS_TOKEN || env.REDIS_PASSWORD || undefined,
    db,
    ...(parsed.protocol === 'rediss:' || isTls(env) ? { tls: { rejectUnauthorized: true } } : {}),
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
