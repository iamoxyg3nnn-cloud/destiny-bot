import os from 'node:os';
import { stateStore } from '../storage/state-store.js';

const timers = new Map<string, NodeJS.Timeout>();

export function startWorkerHeartbeat(role: string): void {
  if (timers.has(role)) return;
  const instanceId = `${os.hostname()}:${process.pid}:${role}`;
  const publish = async () => {
    try {
      await Promise.all([
        stateStore.set(`worker:heartbeat:${instanceId}`, JSON.stringify({
          role,
          instanceId,
          pid: process.pid,
          hostname: os.hostname(),
          updatedAt: new Date().toISOString(),
        }), 90),
        stateStore.sAdd('worker:instances', instanceId),
      ]);
    } catch (error: any) {
      console.warn(`[WorkerHeartbeat] Could not publish ${role} heartbeat:`, error?.message || error);
    }
  };

  void publish();
  const timer = setInterval(() => void publish(), 30_000);
  timer.unref?.();
  timers.set(role, timer);
}

export async function stopWorkerHeartbeat(role: string): Promise<void> {
  const timer = timers.get(role);
  if (timer) clearInterval(timer);
  timers.delete(role);
  const instanceId = `${os.hostname()}:${process.pid}:${role}`;
  try {
    await Promise.all([
      stateStore.del(`worker:heartbeat:${instanceId}`),
      stateStore.sRem('worker:instances', instanceId),
    ]);
  } catch (error: any) {
    console.warn(`[WorkerHeartbeat] Could not remove ${role} heartbeat:`, error?.message || error);
  }
}
