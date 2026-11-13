import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';
import { stateStore } from './state-store.js';

export class DistributedLock {
  async acquire(resource: string, ttlMs = 8000, retryCount = 25, retryDelayMs = 150): Promise<string | null> {
    const token = uuidv4();
    for (let attempt = 0; attempt < retryCount; attempt += 1) {
      try {
        if (await stateStore.tryAcquireLock(resource, token, ttlMs)) return token;
      } catch (error) {
        if (config.NODE_ENV === 'production') {
          console.error(`[Lock] Supabase lock acquisition failed for ${resource}:`, error);
          return null;
        }
      }
      if (attempt < retryCount - 1) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
    return null;
  }

  private renew(resource: string, token: string, ttlMs: number): Promise<boolean> {
    return stateStore.renewLock(resource, token, ttlMs);
  }

  release(resource: string, token: string): Promise<boolean> {
    return stateStore.releaseLock(resource, token);
  }

  async withLock<T>(resource: string, fn: () => Promise<T>, ttlMs = 8000): Promise<T> {
    const token = await this.acquire(resource, ttlMs);
    if (!token) throw new Error(`Failed to acquire distributed lock for resource: ${resource}`);
    let renewalInFlight = false;
    let stopping = false;
    let leaseLost = false;
    let renewalPromise: Promise<void> | null = null;
    const timer = setInterval(() => {
      if (renewalInFlight || stopping) return;
      renewalInFlight = true;
      renewalPromise = this.renew(resource, token, ttlMs)
        .then((renewed) => { if (!renewed) leaseLost = true; })
        .catch(() => { leaseLost = true; })
        .finally(() => { renewalInFlight = false; });
    }, Math.max(250, Math.floor(ttlMs / 3)));
    timer.unref?.();

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
      clearInterval(timer);
      if (renewalPromise) await renewalPromise;
      if (!await this.release(resource, token)) leaseLost = true;
    }
    if (operationFailed) throw operationError;
    if (leaseLost) throw new Error(`Supabase lock lease was lost for resource: ${resource}`);
    return result;
  }
}

export const lockManager = new DistributedLock();
