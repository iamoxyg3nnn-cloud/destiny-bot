import { Worker, Job } from 'bullmq';
import { REST, Routes } from 'discord.js';
import { db } from '../database/supabase.js';
import { redis } from '../redis/client.js';
import { QUEUE_NAMES } from '../redis/queues.js';
import { resolveRedisConnection } from '../redis/connection.js';
import { config } from '../config/index.js';
import { randomUUID } from 'node:crypto';

function parseClock(value?: string): number | null {
  if (!value || !/^(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?$/.test(value)) return null;
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function parseCronClock(expression: string): number | null {
  const fields = expression.trim().split(/\\s+/).filter(Boolean);
  if (fields.length !== 5 || !/^[0-9]+$/.test(fields[0]) || !/^[0-9]+$/.test(fields[1])) return 19 * 60 + 30;
  return parseClock(`${fields[1]}:${fields[0]}`) ?? 19 * 60 + 30;
}

function getLocalParts(date: Date, timeZone: string): { date: string; minutes: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return {
      date: `${values.year}-${values.month}-${values.day}`,
      minutes: Number(values.hour) * 60 + Number(values.minute),
    };
  } catch {
    return null;
  }
}

function isQuietNow(current: number, start?: string, end?: string): boolean {
  const startMinutes = parseClock(start);
  const endMinutes = parseClock(end);
  if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) return false;
  return startMinutes < endMinutes
    ? current >= startMinutes && current < endMinutes
    : current >= startMinutes || current < endMinutes;
}

export class NotificationWorker {
  private worker: Worker | null = null;
  private cronTimer: NodeJS.Timeout | null = null;
  private rest: REST | null = null;

  start() {
    if (this.cronTimer || this.worker) return;
    console.log('⏰ [Worker] Starting timezone-aware daily notification scheduler...');
    const redisConnection = resolveRedisConnection();

    this.cronTimer = setInterval(async () => {
      try {
        await this.dispatchScheduledReminders();
      } catch (err: any) {
        console.error('[Worker:Notifications] Error in scheduler cycle:', err?.message || err);
      }
    }, 60 * 1000);

    if (redis.isHealthy()) {
      this.worker = new Worker(
        QUEUE_NAMES.NOTIFICATIONS,
        async (job: Job) => {
          if (job.name === 'send-reminder') {
            await this.sendUserReminder(job.data.userId, job.data.discordUserId);
          }
        },
        {
          connection: { ...redisConnection, maxRetriesPerRequest: null },
          concurrency: 10,
        }
      );
      this.worker.on('error', (error: Error) => console.error('[Worker:Notifications] Queue worker error:', error));
    } else if (config.NODE_ENV === 'production') {
      throw new Error('Redis is required for the notification worker in production.');
    }
  }

  async dispatchScheduledReminders() {
    const now = new Date();
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const users = await db.getAllUsers(pageSize, offset);
      if (users.length === 0) break;

      const settingsByUser = await db.getNotificationSettingsForUsers(users.map((user) => user.id));
      for (const user of users) {
        if (user.isBanned) continue;
        const settings = settingsByUser.get(user.id);
        if (settings?.optOut || settings?.dailyReminderEnabled === false) continue;

        const timeZone = settings?.timeZone || config.REMINDER_DEFAULT_TIMEZONE;
        const local = getLocalParts(now, timeZone) || getLocalParts(now, config.REMINDER_DEFAULT_TIMEZONE);
        if (!local) continue;

        const targetMinutes = settings?.dailyReminderTime
          ? parseClock(settings.dailyReminderTime)
          : parseCronClock(config.REMINDER_CRON_SCHEDULE);
        if (targetMinutes === null || targetMinutes !== local.minutes) continue;
        if (isQuietNow(local.minutes, settings?.quietHoursStart, settings?.quietHoursEnd)) continue;

        const sentKey = `reminder:sent:${user.id}:${local.date}`;
        if (await redis.get(sentKey)) continue;
        const lockKey = `reminder:lock:${user.id}:${local.date}`;
        const lockToken = randomUUID();
        if (!(await redis.setIfAbsent(lockKey, lockToken, 120))) continue;

        try {
          if (await redis.get(sentKey)) continue;
          await this.sendUserReminder(user.id, user.discordUserId);
          await redis.set(sentKey, '1', 26 * 60 * 60);
        } catch (err: any) {
          const status = Number(err?.status || err?.httpStatus || 0);
          // Retry transient Discord failures on the next scheduler tick.
          // Permanent DM/privacy failures are recorded for the day to avoid spam.
          if (status !== 0 && status !== 401 && status !== 429 && status < 500) {
            await redis.set(sentKey, '1', 26 * 60 * 60).catch(() => {});
          }
          console.warn(`[Notification] Reminder delivery failed for ${user.discordUserId}:`, err?.message || err);
        } finally {
          await redis.delIfValue(lockKey, lockToken).catch(() => {});
        }
      }

      if (users.length < pageSize) break;
    }
  }

  async sendUserReminder(_userId: string, discordUserId: string): Promise<void> {
    if (!config.DISCORD_TOKEN || config.DISCORD_TOKEN.startsWith('mock_')) {
      if (config.NODE_ENV === 'production') throw new Error('DISCORD_TOKEN is required to send reminders.');
      console.log(`[Notification] Reminder skipped in development for ${discordUserId} (no Discord token).`);
      return;
    }

    this.rest ||= new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
    const channel = await this.rest.post(Routes.userChannels(), {
      body: { recipient_id: discordUserId },
    }) as { id: string };
    await this.rest.post(Routes.channelMessages(channel.id), {
      body: { content: '🌌 Your Destiny connection is waiting. Open the bot to continue your conversation or meet someone new!' },
    });
  }

  stop() {
    if (this.cronTimer) clearInterval(this.cronTimer);
    this.cronTimer = null;
    if (this.worker) void this.worker.close();
    this.worker = null;
  }
}

export const notificationWorker = new NotificationWorker();
