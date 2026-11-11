import { matchmakingWorker } from './matchmaking.worker.js';
import { notificationWorker } from './notification.worker.js';
import { cleanupWorker } from './cleanup.worker.js';
import { redis } from '../redis/client.js';
import { config } from '../config/index.js';
import { db } from '../database/supabase.js';
import { startWorkerHeartbeat, stopWorkerHeartbeat } from './heartbeat.js';
import { queueManager } from '../redis/queues.js';

let workersStarted = false;

export async function startAllWorkers(options: { includeMatchmaking?: boolean } = {}): Promise<void> {
  if (workersStarted) return;
  await db.assertConnection();
  const connected = await redis.waitForConnection();
  if (!connected && config.NODE_ENV === 'production') {
    throw new Error('Redis is required in production for distributed queues, rate limits, and locks.');
  }
  console.log('⚡ Launching Destiny Worker Ecosystem...');
  try {
    if (options.includeMatchmaking !== false && process.env.DISABLE_MATCHMAKING_WORKER !== 'true') {
      // This returns immediately when the Discord client is not ready. The
      // primary shard starts it again from its ClientReady handler.
      await matchmakingWorker.start();
    }
    notificationWorker.start();
    cleanupWorker.start();
    startWorkerHeartbeat('workers');
    workersStarted = true;
  } catch (error) {
    await stopAllWorkers();
    throw error;
  }
}

export async function stopAllWorkers(): Promise<void> {
  const results = await Promise.allSettled([
    matchmakingWorker.stop(),
    notificationWorker.stop(),
    cleanupWorker.stop(),
    stopWorkerHeartbeat('workers'),
    queueManager.close(),
  ]);
  workersStarted = false;

  const failures = results
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => result.reason);
  if (failures.length > 0) {
    throw new AggregateError(failures, 'One or more Destiny workers failed to stop cleanly.');
  }
}

if (process.env.RUN_WORKERS === 'true') {
  startAllWorkers({ includeMatchmaking: process.env.DISABLE_MATCHMAKING_WORKER !== 'true' }).catch((err) => {
    console.error('[Worker] Failed to start worker ecosystem:', err);
    process.exitCode = 1;
  });
}
