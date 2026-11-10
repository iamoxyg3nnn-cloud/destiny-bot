import { Redis } from 'ioredis';
import { config } from '../config/index.js';
import { describeRedisTarget, resolveRedisConnection } from './connection.js';

export class RedisService {
  private client: Redis | null = null;
  private isConnected: boolean = false;
  private fallbackStore: Map<string, string> = new Map();
  private fallbackSets: Map<string, Set<string>> = new Map();
  private fallbackRateTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.initClient();
  }

  private initClient() {
    try {
      const options = resolveRedisConnection();

      this.client = new Redis({
        host: options.host,
        port: options.port,
        username: options.username,
        password: options.password,
        db: options.db,
        ...(options.tls ? { tls: options.tls } : {}),
        keyPrefix: config.REDIS_KEY_PREFIX,
        retryStrategy: (times: number) => {
          if (times > 3) {
            return null; // Stop retrying and fallback to in-memory store
          }
          return Math.min(times * 100, 1000);
        },
        maxRetriesPerRequest: 1,
        lazyConnect: true,
      });

      this.client.on('ready', () => {
        this.isConnected = true;
        console.log(`✅ Redis connected successfully (${describeRedisTarget()}).`);
      });

      this.client.connect().catch((err: any) => {
        this.isConnected = false;
        const code = err?.code ? ` (${err.code})` : '';
        console.warn(`⚠️ Redis not reachable at ${describeRedisTarget()}${code}. ${config.NODE_ENV === 'production' ? 'Production operations will fail closed until Redis recovers.' : 'Using an in-memory fallback for development/test.'}`);
      });

      this.client.on('error', (_err: any) => {
        this.isConnected = false;
      });

      this.client.on('close', () => {
        this.isConnected = false;
      });
    } catch {
      this.isConnected = false;
    }
  }

  public getRawClient(): Redis | null {
    return this.client;
  }

  public isHealthy(): boolean {
    return this.isConnected;
  }

  private assertFallbackAllowed(operation: string): void {
    if (config.NODE_ENV === 'production') {
      throw new Error(`Redis is unavailable during ${operation}; refusing unsafe in-memory fallback in production.`);
    }
  }

  public async waitForConnection(timeoutMs = 10_000): Promise<boolean> {
    const client = this.client;
    if (!client) return false;
    if (this.isConnected && client.status === 'ready') return true;
    if (client.status === 'end') return false;

    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timeout);
        client.removeListener('ready', onReady);
        client.removeListener('end', onEnd);
        resolve(this.isConnected && client.status === 'ready');
      };
      const onReady = () => finish();
      const onEnd = () => finish();
      const timeout = setTimeout(finish, timeoutMs);

      client.once('ready', onReady);
      client.once('end', onEnd);
      if (client.status === 'ready') finish();
    });
  }

  // ---------------- BASIC KEY-VALUE ----------------
  async get(key: string): Promise<string | null> {
    if (this.isConnected && this.client) {
      try {
        return await this.client.get(key);
      } catch {
        this.isConnected = false;
        // Fallback
      }
    }
    this.assertFallbackAllowed('get');
    return this.fallbackStore.get(key) || null;
  }

  async getBuffer(key: string): Promise<Buffer | null> {
    if (this.isConnected && this.client) {
      try {
        return await this.client.getBuffer(key);
      } catch {
        this.isConnected = false;
        // Fallback
      }
    }
    this.assertFallbackAllowed('get');
    const val = this.fallbackStore.get(key);
    return val ? Buffer.from(val, 'base64') : null;
  }

  async setBuffer(key: string, buffer: Buffer, ttlSeconds?: number): Promise<boolean> {
    if (ttlSeconds !== undefined && (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1)) throw new Error('TTL must be a positive integer.');
    if (this.isConnected && this.client) {
      try {
        if (ttlSeconds) {
          await this.client.set(key, buffer, 'EX', ttlSeconds);
        } else {
          await this.client.set(key, buffer);
        }
        return true;
      } catch {
        this.isConnected = false;
        // Fallback
      }
    }
    this.assertFallbackAllowed('setBuffer');
    const encoded = buffer.toString('base64');
    this.fallbackStore.set(key, encoded);
    if (ttlSeconds) {
      const ms = Math.min(ttlSeconds * 1000, 2147483647);
      const timer = setTimeout(() => { if (this.fallbackStore.get(key) === encoded) this.fallbackStore.delete(key); }, ms);
      // Never let an eviction timer hold the process open.
      timer.unref?.();
    }
    return true;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (ttlSeconds !== undefined && (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1)) throw new Error('TTL must be a positive integer.');
    if (this.isConnected && this.client) {
      try {
        if (ttlSeconds) {
          await this.client.set(key, value, 'EX', ttlSeconds);
        } else {
          await this.client.set(key, value);
        }
        return true;
      } catch {
        this.isConnected = false;
        // Fallback
      }
    }
    this.assertFallbackAllowed('set');
    this.fallbackStore.set(key, value);
    if (ttlSeconds) {
      const ms = Math.min(ttlSeconds * 1000, 2147483647);
      const timer = setTimeout(() => { if (this.fallbackStore.get(key) === value) this.fallbackStore.delete(key); }, ms);
      // Never let an eviction timer hold the process open.
      timer.unref?.();
    }
    return true;
  }

  async del(key: string): Promise<boolean> {
    if (this.isConnected && this.client) {
      try {
        await this.client.del(key);
        return true;
      } catch {
        this.isConnected = false;
        // Fallback
      }
    }
    this.assertFallbackAllowed('delete');
    return this.fallbackStore.delete(key);
  }

  /** Delete a key only when its current value still belongs to this operation. */
  async delIfValue(key: string, expectedValue: string): Promise<boolean> {
    if (this.isConnected && this.client) {
      try {
        const script = `
          if redis.call('GET', KEYS[1]) == ARGV[1] then
            return redis.call('DEL', KEYS[1])
          end
          return 0
        `;
        return Number(await this.client.eval(script, 1, key, expectedValue)) === 1;
      } catch {
        this.isConnected = false;
      }
    }
    this.assertFallbackAllowed('conditional delete');
    if (this.fallbackStore.get(key) !== expectedValue) return false;
    return this.fallbackStore.delete(key);
  }

  /**
   * Atomically set a key only when it does not already exist.
   * Used for cross-process idempotency (e.g. once-per-day reminders).
   */
  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1) {
      throw new Error('setIfAbsent requires a positive integer TTL.');
    }
    if (this.isConnected && this.client) {
      try {
        return (await this.client.set(key, value, 'EX', ttlSeconds, 'NX')) === 'OK';
      } catch {
        this.isConnected = false;
      }
    }
    this.assertFallbackAllowed('conditional set');
    if (this.fallbackStore.has(key)) return false;
    this.fallbackStore.set(key, value);
    const timer = setTimeout(() => {
      if (this.fallbackStore.get(key) === value) this.fallbackStore.delete(key);
    }, Math.min(ttlSeconds * 1000, 2147483647));
    timer.unref?.();
    return true;
  }

  // ---------------- SETS & QUEUES ----------------
  async sAdd(key: string, member: string): Promise<number> {
    if (this.isConnected && this.client) {
      try {
        return await this.client.sadd(key, member);
      } catch {
        this.isConnected = false;
        // Fallback
      }
    }
    this.assertFallbackAllowed('set add');
    if (!this.fallbackSets.has(key)) {
      this.fallbackSets.set(key, new Set());
    }
    const set = this.fallbackSets.get(key)!;
    const sizeBefore = set.size;
    set.add(member);
    return set.size > sizeBefore ? 1 : 0;
  }

  async sRem(key: string, member: string): Promise<number> {
    if (this.isConnected && this.client) {
      try {
        return await this.client.srem(key, member);
      } catch {
        this.isConnected = false;
        // Fallback
      }
    }
    this.assertFallbackAllowed('set removal');
    const set = this.fallbackSets.get(key);
    if (!set) return 0;
    const removed = set.delete(member);
    return removed ? 1 : 0;
  }

  async sMembers(key: string): Promise<string[]> {
    if (this.isConnected && this.client) {
      try {
        return await this.client.smembers(key);
      } catch {
        this.isConnected = false;
        // Fallback
      }
    }
    this.assertFallbackAllowed('set lookup');
    const set = this.fallbackSets.get(key);
    return set ? Array.from(set) : [];
  }

  // ---------------- SLIDING WINDOW RATE LIMITER ----------------
  async checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number }> {
    if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowSeconds) || windowSeconds < 1) {
      return { allowed: false, remaining: 0 };
    }

    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;
    const zKey = `ratelimit:${key}`;

    if (this.isConnected && this.client) {
      const script = `
        redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
        local count = redis.call('ZCARD', KEYS[1])
        local limit = tonumber(ARGV[2])
        if count >= limit then
          redis.call('EXPIRE', KEYS[1], tonumber(ARGV[4]) + 1)
          return {0, 0}
        end
        redis.call('ZADD', KEYS[1], tonumber(ARGV[3]), ARGV[5])
        redis.call('EXPIRE', KEYS[1], tonumber(ARGV[4]) + 1)
        return {1, limit - count - 1}
      `;
      try {
        const result = await this.client.eval(
          script,
          1,
          zKey,
          windowStart,
          limit,
          now,
          windowSeconds,
          `${now}-${Math.random()}`
        ) as [number, number];
        return { allowed: Number(result[0]) === 1, remaining: Number(result[1]) };
      } catch {
        this.isConnected = false;
      }
    }

    this.assertFallbackAllowed('rate limiting');

    // In-memory fallback. Corrupt fallback state must not crash message handling.
    let timestamps: number[] = [];
    try {
      const raw = this.fallbackStore.get(zKey);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) timestamps = parsed.filter((value) => Number.isFinite(value));
    } catch {
      this.fallbackStore.delete(zKey);
    }
    timestamps = timestamps.filter((timestamp) => timestamp > windowStart);

    if (timestamps.length >= limit) {
      this.fallbackStore.set(zKey, JSON.stringify(timestamps));
      return { allowed: false, remaining: 0 };
    }

    timestamps.push(now);
    this.fallbackStore.set(zKey, JSON.stringify(timestamps));
    const previousTimer = this.fallbackRateTimers.get(zKey);
    if (previousTimer) clearTimeout(previousTimer);
    const cleanupTimer = setTimeout(() => {
      const currentRaw = this.fallbackStore.get(zKey);
      try {
        const current = currentRaw ? JSON.parse(currentRaw) : [];
        const active = Array.isArray(current)
          ? current.filter((timestamp) => Number.isFinite(timestamp) && timestamp > Date.now() - windowSeconds * 1000)
          : [];
        if (active.length === 0) this.fallbackStore.delete(zKey);
        else this.fallbackStore.set(zKey, JSON.stringify(active));
      } catch {
        this.fallbackStore.delete(zKey);
      }
      this.fallbackRateTimers.delete(zKey);
    }, Math.min((windowSeconds + 1) * 1000, 2147483647));
    cleanupTimer.unref?.();
    this.fallbackRateTimers.set(zKey, cleanupTimer);
    return { allowed: true, remaining: limit - timestamps.length };
  }
}

export const redis = new RedisService();
