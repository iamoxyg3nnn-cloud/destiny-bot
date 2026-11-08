import { matchmakingWorker } from './matchmaking.worker.js';
import { notificationWorker } from './notification.worker.js';
import { cleanupWorker } from './cleanup.worker.js';

export function startAllWorkers() {
  console.log('⚡ Launching Destiny Worker Ecosystem...');
  matchmakingWorker.start();
  notificationWorker.start();
  cleanupWorker.start();
}

if (process.env.RUN_WORKERS === 'true') {
  startAllWorkers();
}
