import { matchmakingManager } from '../core/matchmaking/manager.js';
import { stateStore } from '../storage/state-store.js';
import { config } from '../config/index.js';
import { getDiscordClient } from '../bot/client-registry.js';
import { startWorkerHeartbeat, stopWorkerHeartbeat } from './heartbeat.js';

export class MatchmakingWorker {
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
    if (this.shuttingDown || this.intervalTimer) return;
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
      // Each shard owns its Supabase client. Check this process's connection
      // before starting the polling loop.
      if (config.NODE_ENV === 'production') {
        const connected = await stateStore.waitForConnection();
        if (!connected) {
          console.error('[Worker:Matchmaking] Supabase is unavailable in the primary Discord shard; retrying worker startup in 5 seconds.');
          this.scheduleRetry();
          return;
        }
      }

      const readyClient = getDiscordClient();
      if (!readyClient || !readyClient.isReady()) {
        console.warn('[Worker:Matchmaking] Discord client disconnected while waiting for Supabase; retrying worker startup in 5 seconds.');
        this.scheduleRetry();
        return;
      }

      if (!stateStore.isHealthy() && config.NODE_ENV === 'production') {
        throw new Error('Supabase is required for the production matchmaking worker.');
      }

      console.log(`👷 [Worker] Starting Matchmaking Worker for ready Discord client ${readyClient.user?.tag || readyClient.user?.id || 'unknown'}...`);
      // Poll every 2.5 seconds. Matchmaking is driven by the live Discord
      // process so room creation and participant DMs stay in one place.
      startWorkerHeartbeat('matchmaking');
      this.intervalTimer = setInterval(() => {
        // Prevent overlapping local polls from competing for the same distributed
        // cycle lock and flooding Postgres while a slow room/DM operation is active.
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

    } finally {
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = null;
      await stopWorkerHeartbeat('matchmaking');
      this.shuttingDown = false;
    }
  }
}

export const matchmakingWorker = new MatchmakingWorker();
