import { Queue, Worker, QueueEvents } from 'bullmq';
import { config } from '../config/index.js';
import { redis } from './client.js';

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
    this.redisConnectionConfig = {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD || undefined,
      db: config.REDIS_DB,
      maxRetriesPerRequest: null,
    };

    if (redis.isHealthy()) {
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
  }

  getQueue(name: string): Queue | null {
    return this.queues.get(name) || null;
  }

  async addJob(queueName: string, jobName: string, data: any, opts: any = {}): Promise<void> {
    const queue = this.getQueue(queueName);
    if (queue) {
      await queue.add(jobName, data, opts);
    }
  }

  async getQueueStats(): Promise<Record<string, { waiting: number; active: number; completed: number; failed: number }>> {
    const stats: Record<string, any> = {};
    for (const [name, q] of this.queues.entries()) {
      try {
        const counts = await q.getJobCounts('waiting', 'active', 'completed', 'failed');
        stats[name] = counts;
      } catch {
        stats[name] = { waiting: 0, active: 0, completed: 0, failed: 0 };
      }
    }
    return stats;
  }
}

export const queueManager = new QueueManager();
