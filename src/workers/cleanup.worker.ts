import { db } from '../database/supabase.js';

export class CleanupWorker {
  private timer: NodeJS.Timeout | null = null;

  start() {
    console.log('🧹 [Worker] Starting Cleanup Worker...');
    // Run cleanup every 15 minutes
    this.timer = setInterval(async () => {
      try {
        await this.runCleanup();
      } catch (err: any) {
        console.error('[Worker:Cleanup] Error in cleanup cycle:', err?.message || err);
      }
    }, 15 * 60 * 1000);
  }

  async runCleanup(): Promise<{ staleRoomsClosed: number }> {
    const activeRooms = await db.getActiveRooms();
    const now = Date.now();
    let staleRoomsClosed = 0;

    for (const room of activeRooms) {
      const started = new Date(room.startedAt).getTime();
      // If room has been open for > 24 hours without message, cleanly end
      if (now - started > 24 * 60 * 60 * 1000) {
        await db.endRoom(room.id, 'inactivity');
        staleRoomsClosed++;
      }
    }

    if (staleRoomsClosed > 0) {
      console.log(`[Cleanup] Cleaned up ${staleRoomsClosed} inactive room sessions.`);
    }

    return { staleRoomsClosed };
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }
}

export const cleanupWorker = new CleanupWorker();
