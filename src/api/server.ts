import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { config } from '../config/index.js';
import { db } from '../database/supabase.js';
import { redis } from '../redis/client.js';
import { matchmakingManager } from '../core/matchmaking/manager.js';
import { verificationService } from '../core/moderation/verification.js';
import { queueManager } from '../redis/queues.js';
import os from 'os';
import { REST, Routes } from 'discord.js';

/**
 * Constant-time comparison for secret material.
 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Still burn a comparison so length is not leaked by timing.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Guards the admin API.
 *
 * The dashboard proxy forwards requests with `x-api-key`. When no key is
 * configured the API refuses every request rather than defaulting to open —
 * this API can manage users, moderate rooms and read private anonymous chat messages.
 */
function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const expected = config.API_SECRET_KEY;
  if (!expected) {
    return res.status(503).json({
      error: 'Admin API access is not configured (API_SECRET_KEY missing).',
    });
  }

  const provided = req.header('x-api-key') || '';
  if (!provided || !safeEqual(provided, expected)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return next();
}

function wrapAsyncRoutes(app: express.Express): void {
  for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
    const original = (app as any)[method].bind(app);
    (app as any)[method] = (path: any, ...handlers: any[]) => original(
      path,
      ...handlers.map((handler) => {
        if (typeof handler !== 'function') return handler;
        return (req: Request, res: Response, next: NextFunction) => {
          try {
            Promise.resolve(handler(req, res, next)).catch(next);
          } catch (error) {
            next(error);
          }
        };
      })
    );
  }
}

async function botCanSendToChannel(rest: REST, guildId: string, channel: any): Promise<boolean> {
  const [roles, member] = await Promise.all([
    rest.get(Routes.guildRoles(guildId)) as Promise<any[]>,
    rest.get(Routes.guildMember(guildId, config.DISCORD_CLIENT_ID)) as Promise<any>,
  ]);

  let permissions = BigInt(roles.find((role) => role.id === guildId)?.permissions || '0');
  for (const roleId of member.roles || []) {
    const role = roles.find((candidate) => candidate.id === roleId);
    if (role) permissions |= BigInt(role.permissions || '0');
  }

  const administrator = 8n;
  if ((permissions & administrator) === administrator) return true;

  const overwrites = Array.isArray(channel.permission_overwrites) ? channel.permission_overwrites : [];
  const applyOverwrite = (current: bigint, deny: bigint, allow: bigint) => (current & ~deny) | allow;

  const everyone = overwrites.find((overwrite: any) => overwrite.id === guildId && Number(overwrite.type) === 0);
  if (everyone) {
    permissions = applyOverwrite(permissions, BigInt(everyone.deny || '0'), BigInt(everyone.allow || '0'));
  }

  const memberRoleIds = new Set<string>(member.roles || []);
  let roleDeny = 0n;
  let roleAllow = 0n;
  for (const overwrite of overwrites) {
    if (Number(overwrite.type) === 0 && memberRoleIds.has(overwrite.id)) {
      roleDeny |= BigInt(overwrite.deny || '0');
      roleAllow |= BigInt(overwrite.allow || '0');
    }
  }
  permissions = applyOverwrite(permissions, roleDeny, roleAllow);

  const memberOverwrite = overwrites.find((overwrite: any) =>
    Number(overwrite.type) === 1 && overwrite.id === config.DISCORD_CLIENT_ID
  );
  if (memberOverwrite) {
    permissions = applyOverwrite(
      permissions,
      BigInt(memberOverwrite.deny || '0'),
      BigInt(memberOverwrite.allow || '0')
    );
  }

  const viewChannel = 1024n;
  const sendMessages = 2048n;
  return (permissions & viewChannel) === viewChannel &&
    (permissions & sendMessages) === sendMessages;
}

export function createApiServer(): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '256kb' }));
  wrapAsyncRoutes(app);

  // Every admin route requires the shared secret.
  app.use('/api', requireApiKey);

  // 1. HEALTH & TELEMETRY
  app.get('/api/health', async (_req: Request, res: Response) => {
    const mem = process.memoryUsage();
    const supabaseConnected = !db.isUsingMock() && await db.assertConnection().then(() => true).catch(() => false);
    const redisConnected = redis.isHealthy();
    let workersConnected = false;
    if (redisConnected) {
      const workerIds = await redis.sMembers('worker:instances');
      const heartbeats = await Promise.all(workerIds.map((instanceId) => redis.get(`worker:heartbeat:${instanceId}`)));
      workersConnected = heartbeats.some(Boolean);
    }
    const healthy = supabaseConnected && redisConnected && workersConnected;
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        supabase: supabaseConnected,
        redis: redisConnected,
        workers: workersConnected,
      },
      system: {
        nodeVersion: process.version,
        uptimeSeconds: Math.floor(process.uptime()),
        memoryUsageMb: Math.round(mem.rss / 1024 / 1024),
        cpuCount: os.cpus().length,
        loadAverage: os.loadavg(),
      },
    });
  });

  // 2. OVERVIEW METRICS
  app.get('/api/overview', async (_req: Request, res: Response) => {
    const [
      totalUsers,
      activeRooms,
      queuedTickets,
      reports,
      queueStats,
      messagesCount,
      hourlyActivity,
      shardIds,
      workerIds,
    ] = await Promise.all([
      db.getUserCount(),
      db.getActiveRooms(),
      matchmakingManager.getQueueTickets(),
      db.getReports('pending'),
      queueManager.getQueueStats(),
      db.getMessageCountLast24h(),
      db.getHourlyActivity(24),
      redis.sMembers('bot:guild-shards'),
      redis.sMembers('worker:instances'),
    ]);

    const [shardSnapshots, workerHeartbeats] = await Promise.all([
      Promise.all(shardIds.map((shardId) => redis.get(`bot:guilds:${shardId}`))),
      Promise.all(workerIds.map((instanceId) => redis.get(`worker:heartbeat:${instanceId}`))),
    ]);

    const hourlyThroughput = hourlyActivity.map((bucket) => ({
      time: new Date(bucket.hour).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: config.REMINDER_DEFAULT_TIMEZONE,
      }),
      messages: bucket.messages,
      matches: bucket.matches,
    }));

    res.json({
      totalUsers,
      activeRoomsCount: activeRooms.length,
      queuedUsersCount: queuedTickets.length,
      pendingReportsCount: reports.length,
      messagesLast24h: messagesCount,
      hourlyThroughput,
      supabaseConnected: !db.isUsingMock(),
      redisConnected: redis.isHealthy(),
      shardsOnline: shardSnapshots.filter(Boolean).length,
      workersActive: workerHeartbeats.filter(Boolean).length,
      queueStats,
      uptimeSeconds: Math.floor(process.uptime()),
    });
  });

  // 3. USERS MANAGEMENT
  app.get('/api/users', async (req: Request, res: Response) => {
    const query = (req.query.q as string || '').toLowerCase();
    const allUsers = await db.getAllUsers(200);

    let filtered = allUsers;
    if (query) {
      filtered = allUsers.filter(
        (u) => u.destinyId.toLowerCase().includes(query) || u.discordUserId.includes(query)
      );
    }

    res.json(filtered.map(({ destinyCoins, streakCount, lastDailyClaim, connectionTier, equippedBadges, cardTheme, ...profile }) => profile));
  });

  app.post('/api/users/:id/ban', async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { banned, reason } = req.body || {};
    if (typeof banned !== 'boolean') return res.status(400).json({ error: 'banned must be a boolean.' });
    if (reason !== undefined && (typeof reason !== 'string' || reason.length > 500)) {
      return res.status(400).json({ error: 'reason must be a string of at most 500 characters.' });
    }

    const result = await matchmakingManager.withTicketLock(id, async () => {
      const user = await db.getUserById(id, true);
      if (!user) return { notFound: true as const };

      // Partial update avoids overwriting reputation/profile fields from a
      // stale in-memory snapshot. The ticket lock serializes this with pairing.
      const updatedUser = await db.createOrUpdateUser({
        discordUserId: user.discordUserId,
        isBanned: banned,
        banReason: banned ? (reason?.trim() || 'Admin moderation action') : '',
      });

      if (banned) {
        await matchmakingManager.removeQueueTicketUnderLock(id);
        if (user.activeRoomId) await db.endRoom(user.activeRoomId, 'moderated');
      }
      return { notFound: false as const, user: updatedUser };
    });

    if (result.notFound) return res.status(404).json({ error: 'User not found' });
    await db.logAdminAction('admin_web', banned ? 'BAN_USER' : 'UNBAN_USER', 'USER', id, { reason });
    res.json({ success: true, user: result.user });
  });


  // 4. LIVE ROOMS & CHAT INSPECTOR
  app.get('/api/rooms', async (_req: Request, res: Response) => {
    const rooms = await db.getActiveRooms();
    res.json(rooms);
  });

  app.post('/api/rooms/:id/terminate', async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { reason } = req.body || {};
    if (reason !== undefined && (typeof reason !== 'string' || reason.length > 500)) {
      return res.status(400).json({ error: 'reason must be a string of at most 500 characters.' });
    }

    const success = await db.endRoom(id, 'moderated');
    await db.logAdminAction('admin_web', 'TERMINATE_ROOM', 'ROOM', id, { reason });
    res.json({ success });
  });

  app.get('/api/rooms/:id/messages', async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const messages = await db.getRoomMessages(id, 100);
    res.json(messages);
  });

  // 5. REPORTS DESK
  app.get('/api/reports', async (req: Request, res: Response) => {
    const status = req.query.status as any;
    const reports = await db.getReports(status);
    res.json(reports);
  });

  app.post('/api/reports/:id/resolve', async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { action, notes } = req.body || {};
    const allowedActions = ['none', 'warned', 'temp_ban', 'perma_ban'];
    if (!allowedActions.includes(action)) return res.status(400).json({ error: 'Invalid report resolution action.' });
    if (notes !== undefined && (typeof notes !== 'string' || notes.length > 1000)) {
      return res.status(400).json({ error: 'notes must be a string of at most 1000 characters.' });
    }

    const initialReport = await db.getReportById(id);
    if (!initialReport) return res.status(404).json({ error: 'Report not found' });

    // For permanent bans, hold the reported user's queue lock around the
    // database transaction and queue/room cleanup. This prevents a match from
    // being reserved between the DB ban and Redis ticket removal.
    const resolve = async () => {
      const report = await db.getReportById(id);
      if (!report) return { notFound: true as const, resolved: false as const };
      const resolved = await db.resolveReport(id, action, notes, 'admin_web');
      if (!resolved) return { notFound: false as const, resolved: false as const };
      if (action === 'perma_ban') {
        await matchmakingManager.removeQueueTicketUnderLock(report.reportedId);
        const reportedUser = await db.getUserById(report.reportedId, true);
        if (reportedUser?.activeRoomId) await db.endRoom(reportedUser.activeRoomId, 'moderated');
      }
      return { notFound: false as const, resolved: true as const, report };
    };

    const outcome = action === 'perma_ban'
      ? await matchmakingManager.withTicketLock(initialReport.reportedId, resolve)
      : await resolve();

    if (outcome.notFound) return res.status(404).json({ error: 'Report not found' });
    if (!outcome.resolved) return res.status(409).json({ error: 'Report could not be resolved.' });

    await db.logAdminAction('admin_web', 'RESOLVE_REPORT', 'REPORT', id, { action, notes });
    res.json({ success: true, report: { ...outcome.report, status: 'resolved', actionTaken: action } });
  });

  // 6. GENDER VERIFICATIONS
  app.get('/api/verifications', async (req: Request, res: Response) => {
    const status = (req.query.status as string) || 'pending';
    const users = await db.getAllUsers(500);
    const filtered = status === 'all'
      ? users.filter((u) => u.genderVerificationStatus && u.genderVerificationStatus !== 'unverified')
      : users.filter((u) => u.genderVerificationStatus === status);
    res.json(filtered);
  });

  app.post('/api/verifications/:id/review', async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { approved, notes } = req.body || {};
    if (typeof approved !== 'boolean') return res.status(400).json({ error: 'approved must be a boolean.' });
    if (notes !== undefined && (typeof notes !== 'string' || notes.length > 1000)) {
      return res.status(400).json({ error: 'notes must be a string of at most 1000 characters.' });
    }

    const result = await verificationService.reviewVerification('admin_web', id, approved, notes);
    res.json(result);
  });

  // 7. AUDIT LOGS
  app.get('/api/logs', async (_req: Request, res: Response) => {
    const logs = await db.getAdminLogs(100);
    res.json(logs);
  });

  // 9. GUILDS & SERVER DEDICATED CHANNELS
  app.get('/api/guilds', async (_req: Request, res: Response) => {
    const shardIds = await redis.sMembers('bot:guild-shards');
    const snapshots = await Promise.all(shardIds.map(async (shardId) => {
      const raw = await redis.get(`bot:guilds:${shardId}`);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        console.warn(`[API] Ignoring malformed guild snapshot for shard ${shardId}.`);
        return [];
      }
    }));
    const guilds = snapshots.flat();
    const enriched = await Promise.all(guilds.map(async (guild: any) => {
      const settings = await db.getGuildSettings(guild.id);
      return {
        ...guild,
        matchChannelId: settings?.matchChannelId || null,
        modLogChannelId: settings?.modLogChannelId || null,
      };
    }));
    res.json(enriched);
  });

  app.post('/api/guilds/:id/settings', async (req: Request, res: Response) => {
    try {
      const guildId = req.params.id as string;
      const { channelId, guildName } = req.body || {};
      if (!/^[0-9]{17,20}$/.test(guildId)) return res.status(400).json({ error: 'Invalid guild ID.' });
      if (guildName !== undefined && (typeof guildName !== 'string' || guildName.length > 100)) {
        return res.status(400).json({ error: 'Invalid guild name.' });
      }

      if (channelId) {
        if (typeof channelId !== 'string' || !/^[0-9]{17,20}$/.test(channelId)) {
          return res.status(400).json({ error: 'Invalid channel ID.' });
        }
        if (!config.DISCORD_TOKEN || config.DISCORD_TOKEN.startsWith('mock_')) {
          return res.status(503).json({ error: 'Discord bot credentials are not configured.' });
        }
        const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
        const channels = await rest.get(Routes.guildChannels(guildId)) as any[];
        const channel = channels.find((entry) => entry.id === channelId);
        if (!channel || ![0, 5].includes(Number(channel.type))) {
          return res.status(400).json({ error: 'Channel must be a text or announcement channel in the selected server.' });
        }
        if (!(await botCanSendToChannel(rest, guildId, channel))) {
          return res.status(403).json({ error: 'Destiny needs View Channel and Send Messages permissions in that channel.' });
        }
        const saved = await db.setGuildAdminChannel(guildId, channelId, guildName);
        if (!saved) return res.status(500).json({ error: 'Could not save guild channel settings.' });
      } else {
        const cleared = await db.clearGuildChannels(guildId);
        if (!cleared) return res.status(500).json({ error: 'Could not clear guild channel settings.' });
      }
      res.json({ success: true, guildId, channelId: channelId || null });
    } catch (err: any) {
      console.error('[API] Failed to update guild channel settings:', err?.message || err);
      res.status(500).json({ error: 'Failed to update guild settings' });
    }
  });

  app.use((error: any, _req: Request, res: Response, next: NextFunction) => {
    console.error('[API] Unhandled request error:', error?.message || error);
    if (res.headersSent) return next(error);
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

export const apiApp: express.Express = createApiServer();

if (process.env.RUN_API === 'true') {
  const port = config.PORT || 4000;
  // Bind to loopback only — the admin API must never be directly reachable
  // from outside the host. The dashboard proxies to it over localhost.
  apiApp.listen(port, config.API_HOST, () => {
    console.log(`🌐 Destiny Admin API Server listening on http://${config.API_HOST}:${port}`);
  });
}
