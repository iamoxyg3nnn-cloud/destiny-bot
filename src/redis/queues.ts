import { Queue, Worker, QueueEvents } from 'bullmq';
import { config } from '../config/index.js';
import { redis } from './client.js';
import { resolveRedisConnection } from './connection.js';

export const QUEUE_NAMES = {
  MATCHMAKING: 'destiny-matchmaking',
  NOTIFICATIONS: 'destiny-notifications',
  MODERATION: 'destiny-moderation',
  CLEANUP: 'destiny-cleanup',
} as const;

export class QueueManager {
  private queues: Map<string, Queue> = new Map();
  private redisConnectionConfig: any;

  constructor() {
    const options = resolveRedisConnection();

    this.redisConnectionConfig = {
      host: options.host,
      port: options.port,
      username: options.username,
      password: options.password,
      db: options.db,
      ...(options.tls ? { tls: options.tls } : {}),
      maxRetriesPerRequest: null,
    };

  }

  private ensureQueues(): void {
    if (!redis.isHealthy() || this.queues.size > 0) return;
    try {
      for (const name of Object.values(QUEUE_NAMES)) {
        const q = new Queue(name, {
          connection: this.redisConnectionConfig,
          defaultJobOptions: {
            removeOnComplete: 1000,
            removeOnFail: 5000,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 1000,
            },
          },
        });
        this.queues.set(name, q);
      }
    } catch (err) {
      console.warn('⚠️ BullMQ queue initialization fallback:', err);
    }
  }

  getQueue(name: string): Queue | null {
    this.ensureQueues();
    return this.queues.get(name) || null;
  }

  async addJob(queueName: string, jobName: string, data: any, opts: any = {}): Promise<void> {
    const queue = this.getQueue(queueName);
    if (queue) {
      await queue.add(jobName, data, opts);
      return;
    }
    if (config.NODE_ENV === 'production') {
      throw new Error(`BullMQ queue ${queueName} is unavailable in production.`);
    }
  }

  async close(): Promise<void> {
    const queues = Array.from(this.queues.values());
    this.queues.clear();
    await Promise.allSettled(queues.map((queue) => queue.close()));
  }

  async getQueueStats(): Promise<Record<string, { waiting: number; active: number; completed: number; failed: number } | null>> {
    this.ensureQueues();
    const stats: Record<string, { waiting: number; active: number; completed: number; failed: number } | null> = {};
    for (const name of Object.values(QUEUE_NAMES)) {
      const q = this.queues.get(name);
      if (!q) {
        stats[name] = null;
        continue;
      }
      try {
        const counts = await q.getJobCounts('waiting', 'active', 'completed', 'failed');
        if ([counts.waiting, counts.active, counts.completed, counts.failed].some((count) => typeof count !== 'number')) {
          stats[name] = null;
        } else {
          stats[name] = { waiting: counts.waiting, active: counts.active, completed: counts.completed, failed: counts.failed };
        }
      } catch {
        stats[name] = null;
      }
    }
    return stats;
  }
}

export const queueManager = new QueueManager();
