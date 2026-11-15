import { db } from '../database/supabase.js';
import { stateStore } from '../storage/state-store.js';

const ROOM_INACTIVITY_TTL_MS = 24 * 60 * 60 * 1000;

export class CleanupWorker {
  private timer: NodeJS.Timeout | null = null;
  private cleanupPromise: Promise<{ staleRoomsClosed: number }> | null = null;

  start(): void {
    if (this.timer) return;
    console.log('🧹 [Worker] Starting Cleanup Worker...');
    // Run once shortly after startup, then every 15 minutes.
    void this.runCleanup().catch((err: any) => {
      console.error('[Worker:Cleanup] Initial cleanup failed:', err?.message || err);
    });
    this.timer = setInterval(() => {
      void this.runCleanup().catch((err: any) => {
        console.error('[Worker:Cleanup] Error in cleanup cycle:', err?.message || err);
      });
    }, 15 * 60 * 1000);
    this.timer.unref?.();
  }

  async runCleanup(): Promise<{ staleRoomsClosed: number }> {
    if (this.cleanupPromise) return { staleRoomsClosed: 0 };
    const cleanup = this.performCleanup();
    this.cleanupPromise = cleanup;
    try {
      return await cleanup;
    } finally {
      if (this.cleanupPromise === cleanup) this.cleanupPromise = null;
    }
  }

  private async performCleanup(): Promise<{ staleRoomsClosed: number }> {
    await stateStore.pruneExpired().catch((error) => {
      console.warn('[Cleanup] Could not prune expired Supabase runtime state:', error?.message || error);
    });
    const activeRooms = await db.getActiveRooms();
    const cutoff = Date.now() - ROOM_INACTIVITY_TTL_MS;
    let staleRoomsClosed = 0;

    for (const room of activeRooms) {
      // update_room_xp advances rooms.updated_at for each successfully
      // relayed message. Fall back to startedAt for legacy/null timestamps.
      const lastActivity = Date.parse(room.updatedAt || room.startedAt);
      if (!Number.isFinite(lastActivity) || lastActivity > cutoff) continue;

      // Count only rooms that were actually transitioned; another worker
      // may have ended a room after this scan was loaded.
      if (await db.endRoomIfInactive(room.id, new Date(cutoff))) staleRoomsClosed += 1;
    }

    if (staleRoomsClosed > 0) {
      console.log(`[Cleanup] Closed ${staleRoomsClosed} rooms inactive for at least 24 hours.`);
    }

    try {
      const { getDiscordClient } = await import('../bot/client-registry.js');
      const client = getDiscordClient();
      if (client) {
        const { voiceManager } = await import('../core/voice/manager.js');
        await voiceManager.sweepOrphanedVoiceChannels(client);
      }
    } catch (e: any) {
      console.warn('[Cleanup] Voice sweeper error:', e?.message || e);
    }

    return { staleRoomsClosed };
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.cleanupPromise?.catch((error) => {
      console.warn('[Worker:Cleanup] In-flight cleanup did not finish cleanly:', error?.message || error);
    });
  }
}

export const cleanupWorker = new CleanupWorker();
