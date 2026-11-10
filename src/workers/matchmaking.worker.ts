import { Worker, Job } from 'bullmq';
import { matchmakingManager } from '../core/matchmaking/manager.js';
import { redis } from '../redis/client.js';
import { QUEUE_NAMES } from '../redis/queues.js';
import { resolveRedisConnection } from '../redis/connection.js';
import { config } from '../config/index.js';
import { startWorkerHeartbeat, stopWorkerHeartbeat } from './heartbeat.js';

export class MatchmakingWorker {
  private worker: Worker | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;

  start() {
    if (this.intervalTimer || this.worker) return;
    if (!redis.isHealthy() && config.NODE_ENV === 'production') {
      throw new Error('Redis is required for the production matchmaking worker.');
    }
    console.log('👷 [Worker] Starting Matchmaking Worker...');
    const redisConnection = resolveRedisConnection();

    // 1. High frequency polling fallback loop (every 2.5 seconds)
    startWorkerHeartbeat('matchmaking');
    this.intervalTimer = setInterval(async () => {
      try {
        await matchmakingManager.processMatchCycle();
      } catch (err: any) {
        console.error('[Worker:Matchmaking] Error in match cycle:', err?.message);
      }
    }, 2500);

    // 2. BullMQ Distributed Job Worker
    if (redis.isHealthy()) {
      try {
        this.worker = new Worker(
          QUEUE_NAMES.MATCHMAKING,
          async (job: Job) => {
            if (job.name === 'process-cycle') {
              return await matchmakingManager.processMatchCycle();
            }
          },
          {
            connection: {
              ...redisConnection,
              maxRetriesPerRequest: null,
            },
            concurrency: 5,
          }
        );

        this.worker.on('error', (err) => console.error('[Worker:Matchmaking] BullMQ worker error:', err));
        this.worker.on('failed', (job, err) => {
          console.error(`[Worker:Matchmaking] Job ${job?.id} failed:`, err);
        });
      } catch (err) {
        console.warn('[Worker:Matchmaking] BullMQ worker startup fallback:', err);
      }
    }
  }

  stop() {
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    this.intervalTimer = null;
    if (this.worker) void this.worker.close();
    this.worker = null;
    void stopWorkerHeartbeat('matchmaking');
  }
}

export const matchmakingWorker = new MatchmakingWorker();
