import { Worker, Job } from 'bullmq';
import { db } from '../database/supabase.js';
import { redis } from '../redis/client.js';
import { QUEUE_NAMES } from '../redis/queues.js';
import { config } from '../config/index.js';

export class NotificationWorker {
  private worker: Worker | null = null;
  private cronTimer: NodeJS.Timeout | null = null;

  start() {
    console.log('⏰ [Worker] Starting 7:30 PM IST Daily Notification Scheduler...');

    // Hourly / Periodic check for users whose local time matches reminder time
    this.cronTimer = setInterval(async () => {
      try {
        await this.dispatchScheduledReminders();
      } catch (err: any) {
        console.error('[Worker:Notifications] Error in scheduler cycle:', err?.message || err);
      }
    }, 60 * 1000); // Check every minute

    if (redis.isHealthy()) {
      try {
        this.worker = new Worker(
          QUEUE_NAMES.NOTIFICATIONS,
          async (job: Job) => {
            if (job.name === 'send-reminder') {
              await this.sendUserReminder(job.data.userId, job.data.discordUserId);
            }
          },
          {
            connection: {
              host: config.REDIS_HOST,
              port: config.REDIS_PORT,
              password: config.REDIS_PASSWORD || undefined,
            },
            concurrency: 10,
          }
        );
      } catch (err) {
        console.warn('[Worker:Notifications] BullMQ setup fallback:', err);
      }
    }
  }

  async dispatchScheduledReminders() {
    const now = new Date();

    // Check IST time (UTC+5:30)
    const utcHours = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    const totalUtcMinutes = utcHours * 60 + utcMinutes;
    // 7:30 PM IST is 14:00 UTC (840 minutes)
    const isIst730Pm = Math.abs(totalUtcMinutes - 840) < 2;

    if (!isIst730Pm && process.env.NODE_ENV !== 'test') {
      return;
    }

    const users = await db.getAllUsers(500);
    for (const user of users) {
      if (user.isBanned) continue;

      const notifSettings = db.mockNotifications.get(user.id);
      if (notifSettings?.optOut || notifSettings?.dailyReminderEnabled === false) {
        continue;
      }

      await this.sendUserReminder(user.id, user.discordUserId);
    }
  }

  async sendUserReminder(_userId: string, discordUserId: string) {
    // In production, sends via bot client or shard pub/sub
    console.log(`[Notification] 7:30 PM IST reminder triggered for user ${discordUserId}`);
  }

  stop() {
    if (this.cronTimer) clearInterval(this.cronTimer);
    if (this.worker) this.worker.close();
  }
}

export const notificationWorker = new NotificationWorker();
