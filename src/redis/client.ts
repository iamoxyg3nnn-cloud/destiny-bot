import { Redis } from 'ioredis';
import { config } from '../config/index.js';
import { describeRedisTarget, resolveRedisConnection } from './connection.js';

export class RedisService {
  private client: Redis | null = null;
  private isConnected: boolean = false;
  private fallbackStore: Map<string, string> = new Map();
  private fallbackSets: Map<string, Set<string>> = new Map();
  private fallbackRateTimers: Map<string, NodeJS.Timeout> = new Map();
  private fallbackTtlTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.initClient();
  }

  private initClient() {
    if (
      config.NODE_ENV === 'production' &&
      config.REDIS_DISABLED_FOR_DASHBOARD &&
      config.DASHBOARD_PROCESS
    ) {
      this.isConnected = false;
      console.warn('⚠️ Redis disabled for this dashboard process; auth state and sessions are process-local, and BullMQ diagnostics are unavailable.');
      return;
    }

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
        // Keep retrying with a capped delay. Stopping after a few failures
        // leaves a long-running production bot permanently disconnected even
        // after the hosted Redis service has recovered.
        retryStrategy: (times: number) => {
          // Production should recover automatically from transient hosted Redis
          // outages. Development/tests stop retrying and use their local
          // fallback so an absent local Redis daemon cannot keep the process alive.
          if (config.NODE_ENV !== 'production' && times > 3) return null;
          return Math.min(Math.max(times, 1) * 500, 10_000);
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
    const dashboardMemoryFallback = config.REDIS_DISABLED_FOR_DASHBOARD && config.DASHBOARD_PROCESS;
    if (config.NODE_ENV === 'production' && !dashboardMemoryFallback) {
      throw new Error(`Redis is unavailable during ${operation}; refusing unsafe in-memory fallback in production.`);
    }
  }

  private storeFallbackValue(key: string, value: string, ttlSeconds?: number): void {
    const existingTimer = this.fallbackTtlTimers.get(key);
    if (existingTimer) clearTimeout(existingTimer);
    this.fallbackTtlTimers.delete(key);
    this.fallbackStore.set(key, value);

    if (ttlSeconds === undefined) return;
    const timer = setTimeout(() => {
      this.fallbackStore.delete(key);
      this.fallbackTtlTimers.delete(key);
    }, Math.min(ttlSeconds * 1000, 2_147_483_647));
    timer.unref?.();
    this.fallbackTtlTimers.set(key, timer);
  }

  private deleteFallbackValue(key: string): boolean {
    const timer = this.fallbackTtlTimers.get(key);
    if (timer) clearTimeout(timer);
    this.fallbackTtlTimers.delete(key);
    return this.fallbackStore.delete(key);
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
    return this.fallbackStore.get(key) ?? null;
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
    return val !== undefined ? Buffer.from(val, 'base64') : null;
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
    this.storeFallbackValue(key, buffer.toString('base64'), ttlSeconds);
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
    this.storeFallbackValue(key, value, ttlSeconds);
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
    return this.deleteFallbackValue(key);
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
    return this.deleteFallbackValue(key);
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
    this.storeFallbackValue(key, value, ttlSeconds);
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

  /** Close the Redis connection and clear fallback timers on process shutdown. */
  public async close(): Promise<void> {
    this.isConnected = false;
    for (const timer of this.fallbackTtlTimers.values()) clearTimeout(timer);
    for (const timer of this.fallbackRateTimers.values()) clearTimeout(timer);
    this.fallbackTtlTimers.clear();
    this.fallbackRateTimers.clear();

    const client = this.client;
    this.client = null;
    if (!client) return;
    try {
      if (client.status === 'ready') await client.quit();
      else client.disconnect();
    } catch {
      client.disconnect();
    }
  }
}

export const redis = new RedisService();
