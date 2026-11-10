import { matchmakingWorker } from './matchmaking.worker.js';
import { notificationWorker } from './notification.worker.js';
import { cleanupWorker } from './cleanup.worker.js';
import { redis } from '../redis/client.js';
import { config } from '../config/index.js';
import { db } from '../database/supabase.js';
import { startWorkerHeartbeat } from './heartbeat.js';

export async function startAllWorkers(options: { includeMatchmaking?: boolean } = {}) {
  await db.assertConnection();
  const connected = await redis.waitForConnection();
  if (!connected && config.NODE_ENV === 'production') {
    throw new Error('Redis is required in production for distributed queues, rate limits, and locks.');
  }
  console.log('⚡ Launching Destiny Worker Ecosystem...');
  if (options.includeMatchmaking !== false && process.env.DISABLE_MATCHMAKING_WORKER !== 'true') {
    matchmakingWorker.start();
  }
  notificationWorker.start();
  cleanupWorker.start();
  startWorkerHeartbeat('workers');
}

if (process.env.RUN_WORKERS === 'true') {
  startAllWorkers({ includeMatchmaking: process.env.DISABLE_MATCHMAKING_WORKER !== 'true' }).catch((err) => {
    console.error('[Worker] Failed to start worker ecosystem:', err);
    process.exitCode = 1;
  });
}
