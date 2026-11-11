import { redis } from './client.js';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';

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
          if (config.NODE_ENV === 'production') return null;
          // Fallback to in-memory check
        }
      } else {
        if (config.NODE_ENV === 'production') return null;
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

  private async renew(resource: string, token: string, ttlMs: number): Promise<boolean> {
    const rawClient = redis.getRawClient();
    if (redis.isHealthy() && rawClient) {
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("pexpire", KEYS[1], ARGV[2])
        end
        return 0
      `;
      try {
        return Number(await rawClient.eval(script, 1, resource, token, ttlMs)) === 1;
      } catch {
        return false;
      }
    }
    const existing = this.inMemoryLocks.get(resource);
    if (!existing || existing.token !== token) return false;
    existing.expiresAt = Date.now() + ttlMs;
    return true;
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
    let renewalInFlight = false;
    let stopping = false;
    let leaseLost = false;
    let renewalPromise: Promise<void> | null = null;
    const renewalTimer = setInterval(() => {
      if (renewalInFlight || stopping) return;
      renewalInFlight = true;
      renewalPromise = this.renew(resource, token, ttlMs)
        .then((renewed) => {
          if (!renewed) {
            leaseLost = true;
            console.error(`[Lock] Lease lost for ${resource}; refusing to report the protected operation as successful.`);
          }
        })
        .catch((error) => {
          leaseLost = true;
          console.error(`[Lock] Lease renewal errored for ${resource}; refusing to report the protected operation as successful:`, error);
        })
        .finally(() => {
          renewalInFlight = false;
        });
    }, Math.max(250, Math.floor(ttlMs / 3)));
    renewalTimer.unref?.();

    let result!: T;
    let operationError: unknown;
    let operationFailed = false;
    try {
      result = await fn();
    } catch (error) {
      operationFailed = true;
      operationError = error;
    } finally {
      stopping = true;
      clearInterval(renewalTimer);
      if (renewalPromise) await renewalPromise;
      const released = await this.release(resource, token);
      if (!released) {
        leaseLost = true;
        console.error(`[Lock] Could not confirm release of ${resource}; the lease may already have expired or been replaced.`);
      }
    }

    if (operationFailed) throw operationError;
    if (leaseLost) {
      throw new Error(`Distributed lock lease was lost for resource: ${resource}`);
    }
    return result;
  }
}

export const lockManager = new DistributedLock();
