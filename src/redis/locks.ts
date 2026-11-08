import { redis } from './client.js';
import { v4 as uuidv4 } from 'uuid';

export class DistributedLock {
  private inMemoryLocks: Map<string, { token: string; expiresAt: number }> = new Map();

  /**
   * Acquire a distributed lock on a given resource key
   * @param resource Key identifier, e.g. "lock:room:reveal:ROOM-123"
   * @param ttlMs Time-to-live in milliseconds
   * @param retryCount Number of acquisition attempts
   * @param retryDelayMs Delay between retries
   */
  async acquire(
    resource: string,
    ttlMs: number = 8000,
    retryCount: number = 25,
    retryDelayMs: number = 150
  ): Promise<string | null> {
    const token = uuidv4();
    const rawClient = redis.getRawClient();

    for (let i = 0; i < retryCount; i++) {
      if (redis.isHealthy() && rawClient) {
        try {
          // SET resource token NX PX ttlMs
          const result = await rawClient.set(resource, token, 'PX', ttlMs, 'NX');
          if (result === 'OK') {
            return token;
          }
        } catch {
          // Fallback to in-memory check
        }
      } else {
        const now = Date.now();
        const existing = this.inMemoryLocks.get(resource);
        if (!existing || existing.expiresAt < now) {
          this.inMemoryLocks.set(resource, { token, expiresAt: now + ttlMs });
          return token;
        }
      }

      if (i < retryCount - 1) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
      }
    }

    return null;
  }

  /**
   * Release the distributed lock safely using an atomic Lua script
   * so that a client cannot release someone else's expired lock.
   */
  async release(resource: string, token: string): Promise<boolean> {
    const rawClient = redis.getRawClient();

    if (redis.isHealthy() && rawClient) {
      // Atomic Lua check-and-delete
      const luaScript = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      try {
        const res = await rawClient.eval(luaScript, 1, resource, token);
        return res === 1;
      } catch {
        // Fallback
      }
    }

    const existing = this.inMemoryLocks.get(resource);
    if (existing && existing.token === token) {
      this.inMemoryLocks.delete(resource);
      return true;
    }
    return false;
  }

  /**
   * Run an asynchronous callback within a protected distributed lock
   */
  async withLock<T>(
    resource: string,
    fn: () => Promise<T>,
    ttlMs: number = 8000
  ): Promise<T> {
    const token = await this.acquire(resource, ttlMs);
    if (!token) {
      throw new Error(`Failed to acquire distributed lock for resource: ${resource}`);
    }
    try {
      return await fn();
    } finally {
      await this.release(resource, token);
    }
  }
}

export const lockManager = new DistributedLock();
