import { matchmakingWorker } from './matchmaking.worker.js';
import { notificationWorker } from './notification.worker.js';
import { cleanupWorker } from './cleanup.worker.js';
import { redis } from '../redis/client.js';

export async function startAllWorkers() {
  await redis.waitForConnection();
  console.log('⚡ Launching Destiny Worker Ecosystem...');
  matchmakingWorker.start();
  notificationWorker.start();
  cleanupWorker.start();
}

if (process.env.RUN_WORKERS === 'true') {
  startAllWorkers().catch((err) => {
    console.error('[Worker] Failed to start worker ecosystem:', err);
    process.exitCode = 1;
  });
}
