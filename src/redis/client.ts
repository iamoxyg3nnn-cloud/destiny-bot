import { Redis } from 'ioredis';
import { config } from '../config/index.js';
import { describeRedisTarget, resolveRedisConnection } from './connection.js';

export class RedisService {
  private client: Redis | null = null;
  private isConnected: boolean = false;
  private fallbackStore: Map<string, string> = new Map();
  private fallbackSets: Map<string, Set<string>> = new Map();

  constructor() {
    this.initClient();
  }

  private initClient() {
    try {
      const options = resolveRedisConnection();

      this.client = new Redis({
        host: options.host,
        port: options.port,
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

      this.client.connect().then(() => {
        this.isConnected = true;
        console.log(`✅ Redis connected successfully (${describeRedisTarget()}).`);
      }).catch((_err: any) => {
        this.isConnected = false;
        console.warn(`⚠️ Redis not reachable at ${describeRedisTarget()}. Operating in high-speed in-memory fallback mode.`);
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

  // ---------------- BASIC KEY-VALUE ----------------
  async get(key: string): Promise<string | null> {
    if (this.isConnected && this.client) {
      try {
        return await this.client.get(key);
      } catch {
        // Fallback
      }
    }
    return this.fallbackStore.get(key) || null;
  }

  async getBuffer(key: string): Promise<Buffer | null> {
    if (this.isConnected && this.client) {
      try {
        return await this.client.getBuffer(key);
      } catch {
        // Fallback
      }
    }
    const val = this.fallbackStore.get(key);
    return val ? Buffer.from(val, 'base64') : null;
  }

  async setBuffer(key: string, buffer: Buffer, ttlSeconds?: number): Promise<boolean> {
    if (this.isConnected && this.client) {
      try {
        if (ttlSeconds) {
          await this.client.set(key, buffer, 'EX', ttlSeconds);
        } else {
          await this.client.set(key, buffer);
        }
        return true;
      } catch {
        // Fallback
      }
    }
    this.fallbackStore.set(key, buffer.toString('base64'));
    if (ttlSeconds) {
      const ms = Math.min(ttlSeconds * 1000, 2147483647);
      const timer = setTimeout(() => this.fallbackStore.delete(key), ms);
      // Never let an eviction timer hold the process open.
      timer.unref?.();
    }
    return true;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (this.isConnected && this.client) {
      try {
        if (ttlSeconds) {
          await this.client.set(key, value, 'EX', ttlSeconds);
        } else {
          await this.client.set(key, value);
        }
        return true;
      } catch {
        // Fallback
      }
    }
    this.fallbackStore.set(key, value);
    if (ttlSeconds) {
      const ms = Math.min(ttlSeconds * 1000, 2147483647);
      const timer = setTimeout(() => this.fallbackStore.delete(key), ms);
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
        // Fallback
      }
    }
    return this.fallbackStore.delete(key);
  }

  // ---------------- SETS & QUEUES ----------------
  async sAdd(key: string, member: string): Promise<number> {
    if (this.isConnected && this.client) {
      try {
        return await this.client.sadd(key, member);
      } catch {
        // Fallback
      }
    }
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
        // Fallback
      }
    }
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
        // Fallback
      }
    }
    const set = this.fallbackSets.get(key);
    return set ? Array.from(set) : [];
  }

  // ---------------- SLIDING WINDOW RATE LIMITER ----------------
  async checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number }> {
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;
    const zKey = `ratelimit:${key}`;

    if (this.isConnected && this.client) {
      try {
        const pipeline = this.client.pipeline();
        pipeline.zremrangebyscore(zKey, 0, windowStart);
        pipeline.zcard(zKey);
        pipeline.zadd(zKey, now, `${now}-${Math.random()}`);
        pipeline.expire(zKey, windowSeconds + 1);

        const results = await pipeline.exec();
        if (results && results[1]) {
          const currentCount = Number(results[1][1]);
          if (currentCount >= limit) {
            return { allowed: false, remaining: 0 };
          }
          return { allowed: true, remaining: limit - currentCount - 1 };
        }
      } catch {
        // Fallback
      }
    }

    // In-memory sliding window fallback
    const rawVal = this.fallbackStore.get(zKey);
    let timestamps: number[] = rawVal ? JSON.parse(rawVal) : [];
    timestamps = timestamps.filter((t) => t > windowStart);

    if (timestamps.length >= limit) {
      return { allowed: false, remaining: 0 };
    }

    timestamps.push(now);
    this.fallbackStore.set(zKey, JSON.stringify(timestamps));
    return { allowed: true, remaining: limit - timestamps.length };
  }
}

export const redis = new RedisService();
