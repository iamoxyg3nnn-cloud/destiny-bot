import { Worker, Job } from 'bullmq';
import { matchmakingManager } from '../core/matchmaking/manager.js';
import { redis } from '../redis/client.js';
import { QUEUE_NAMES } from '../redis/queues.js';
import { resolveRedisConnection } from '../redis/connection.js';
import { config } from '../config/index.js';
import { getDiscordClient } from '../bot/client-registry.js';
import { startWorkerHeartbeat, stopWorkerHeartbeat } from './heartbeat.js';

export class MatchmakingWorker {
  private worker: Worker | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;
  private cycleInFlight = false;
  private cyclePromise: Promise<void> | null = null;
  private startPromise: Promise<void> | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private shuttingDown = false;

  private scheduleRetry(): void {
    if (this.shuttingDown || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.start().catch((error) => {
        console.error('[Worker:Matchmaking] Deferred startup retry failed:', error);
      });
    }, 5000);
    this.retryTimer.unref?.();
  }

  async start(): Promise<void> {
    if (this.shuttingDown || this.intervalTimer || this.worker) return;
    if (this.startPromise) return this.startPromise;

    // Matchmaking creates a room and immediately DMs both participants. It
    // must only run inside the process that owns the live Discord client.
    // A standalone background-worker container has no client registry and
    // must not publish a misleading "matchmaking active" heartbeat.
    const client = getDiscordClient();
    if (!client) {
      // A dedicated worker container has no Discord client and must not poll.
      return;
    }
    if (!client.isReady()) {
      console.log('[Worker:Matchmaking] Startup deferred: waiting for the primary Discord client to become ready.');
      this.scheduleRetry();
      return;
    }

    this.startPromise = (async () => {
      // Each shard has its own RedisService instance. The coordinator's Redis
      // readiness does not guarantee that this child shard has connected yet.
      // Wait for this process's connection instead of crashing the ready shard
      // on a transient startup race.
      if (config.NODE_ENV === 'production') {
        const connected = await redis.waitForConnection(15_000);
        if (!connected) {
          console.error('[Worker:Matchmaking] Redis is still unavailable in the primary Discord shard; retrying worker startup in 5 seconds.');
          this.scheduleRetry();
          return;
        }
      }

      const readyClient = getDiscordClient();
      if (!readyClient || !readyClient.isReady()) {
        console.warn('[Worker:Matchmaking] Discord client disconnected while waiting for Redis; retrying worker startup in 5 seconds.');
        this.scheduleRetry();
        return;
      }

      if (!redis.isHealthy() && config.NODE_ENV === 'production') {
        throw new Error('Redis is required for the production matchmaking worker.');
      }

      console.log(`👷 [Worker] Starting Matchmaking Worker for ready Discord client ${readyClient.user?.tag || readyClient.user?.id || 'unknown'}...`);
      const redisConnection = resolveRedisConnection();

      // 1. High frequency polling fallback loop (every 2.5 seconds)
      startWorkerHeartbeat('matchmaking');
      this.intervalTimer = setInterval(() => {
        // Prevent overlapping local polls from competing for the same distributed
        // cycle lock and flooding Redis while a slow room/DM operation is active.
        if (this.cycleInFlight) return;
        this.cycleInFlight = true;
        const cycle = matchmakingManager.processMatchCycle()
          .catch((err: any) => {
            console.error('[Worker:Matchmaking] Error in match cycle:', err);
          })
          .then(() => undefined)
          .finally(() => {
            this.cycleInFlight = false;
            this.cyclePromise = null;
          });
        this.cyclePromise = cycle;
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
    })().finally(() => {
      this.startPromise = null;
    });

    return this.startPromise!;
  }

  async stop(): Promise<void> {
    this.shuttingDown = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    this.intervalTimer = null;

    try {
      const starting = this.startPromise;
      if (starting) await starting.catch(() => {});
      const cycle = this.cyclePromise;
      if (cycle) await cycle;

      const worker = this.worker;
      this.worker = null;
      if (worker) await worker.close();
    } finally {
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = null;
      await stopWorkerHeartbeat('matchmaking');
      this.shuttingDown = false;
    }
  }
}

export const matchmakingWorker = new MatchmakingWorker();
