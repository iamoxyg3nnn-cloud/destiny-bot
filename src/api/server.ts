import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import crypto from 'crypto';
import { config } from '../config/index.js';
import { db } from '../database/supabase.js';
import { redis } from '../redis/client.js';
import { matchmakingManager } from '../core/matchmaking/manager.js';
import { verificationService } from '../core/moderation/verification.js';
import { ECLAIRS_GUILD_IDS } from '../core/moderation/reputation.js';
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
async function writeDashboardAudit(
  req: Request,
  action: string,
  targetType: string,
  targetId: string,
  changes: Record<string, any> = {}
): Promise<boolean> {
  try {
    await db.logAdminAction(dashboardActor(req), action, targetType, targetId, changes);
    return true;
  } catch (error: any) {
    console.error('[API] Action completed but audit write failed:', error?.message || error);
    return false;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}

function dashboardActor(req: Request): string {
  const actor = req.header('x-admin-id') || '';
  return /^[0-9]{17,20}$/.test(actor) ? actor : 'dashboard_owner';
}

function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const expected = config.API_SECRET_KEY;
  if (expected.length < 32 || expected === 'destiny_internal_secret_32bytes_min_key!') {
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

function everyoneCanViewChannel(guildId: string, channel: any, roles: any[]): boolean {
  const everyoneRole = roles.find((role) => role.id === guildId);
  let permissions = BigInt(everyoneRole?.permissions || '0');
  const overwrite = (Array.isArray(channel.permission_overwrites) ? channel.permission_overwrites : [])
    .find((entry: any) => entry.id === guildId && Number(entry.type) === 0);
  if (overwrite) {
    permissions = (permissions & ~BigInt(overwrite.deny || '0')) | BigInt(overwrite.allow || '0');
  }
  return (permissions & 1024n) === 1024n;
}

function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function requireDashboardOwner(req: Request, res: Response, next: NextFunction) {
  if (process.env.DASHBOARD_OWNER_OAUTH_ENABLED !== 'true') return next();
  const actor = req.header('x-admin-id') || '';
  if (!config.BOT_OWNER_IDS.includes(actor)) {
    return res.status(403).json({ error: 'A current, authorized platform-owner session is required.' });
  }
  return next();
}

export function createApiServer(): express.Express {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  // Every admin route requires the shared secret.
  app.use('/api', requireApiKey);

  // 1. HEALTH & TELEMETRY
  app.get('/api/health', asyncRoute(async (_req: Request, res: Response) => {
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
  }));

  // Health stays available for authenticated infrastructure diagnostics. All
  // user, room, report, verification and guild-management routes are owner-only.
  app.use('/api', requireDashboardOwner);

  // 2. OVERVIEW METRICS
  app.get('/api/overview', asyncRoute(async (_req: Request, res: Response) => {
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
  }));

  // 3. USERS MANAGEMENT
  app.get('/api/users', asyncRoute(async (req: Request, res: Response) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 64) : '';
    const users = await db.searchUsers(query, 200);
    // Verification evidence is private and belongs only in the dedicated
    // verification workflow, never in the general user directory response.
    res.json(users.map(({ genderVerificationEvidence: _evidence, ...user }) => user));
  }));

  app.post('/api/users/:id/ban', asyncRoute(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid user ID.' });
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
        banExpiresAt: null,
      });

      let cleanupWarning = false;
      if (banned) {
        const cleanup = await Promise.allSettled([
          matchmakingManager.removeQueueTicketUnderLock(id),
          ...(user.activeRoomId
            ? [db.endRoom(user.activeRoomId, 'moderated').then(async (ended) => {
                if (!ended) await db.clearActiveRoom(id, user.activeRoomId!);
              })]
            : []),
        ]);
        cleanupWarning = cleanup.some((result) => result.status === 'rejected');
        if (cleanupWarning) {
          console.error('[API] Ban was saved but queue/room cleanup needs attention:', cleanup.filter((result) => result.status === 'rejected'));
        }
      }
      return { notFound: false as const, user: updatedUser, cleanupWarning };
    });

    if (result.notFound) return res.status(404).json({ error: 'User not found' });
    const auditLogged = await writeDashboardAudit(req, banned ? 'BAN_USER' : 'UNBAN_USER', 'USER', id, { reason });
    res.json({ success: true, user: result.user, auditWarning: !auditLogged, cleanupWarning: result.cleanupWarning });
  }));


  // 4. LIVE ROOMS & CHAT INSPECTOR
  app.get('/api/rooms', asyncRoute(async (_req: Request, res: Response) => {
    const rooms = await db.getActiveRooms();
    res.json(rooms);
  }));

  app.post('/api/rooms/:id/terminate', asyncRoute(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid room ID.' });
    const { reason } = req.body || {};
    if (reason !== undefined && (typeof reason !== 'string' || reason.length > 500)) {
      return res.status(400).json({ error: 'reason must be a string of at most 500 characters.' });
    }

    const success = await db.endRoom(id, 'moderated');
    if (!success) return res.status(409).json({ error: 'Room is missing or is no longer active.' });
    const auditLogged = await writeDashboardAudit(req, 'TERMINATE_ROOM', 'ROOM', id, { reason });
    res.json({ success: true, auditWarning: !auditLogged });
  }));

  app.get('/api/rooms/:id/messages', asyncRoute(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid room ID.' });
    const messages = await db.getRoomMessages(id, 100);
    res.json(messages);
  }));

  // 5. REPORTS DESK
  app.get('/api/reports', asyncRoute(async (req: Request, res: Response) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const allowedStatuses = ['pending', 'resolved', 'dismissed'];
    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid report status filter.' });
    }
    const reports = await db.getReports(status as 'pending' | 'resolved' | 'dismissed' | undefined);
    res.json(reports);
  }));

  app.post('/api/reports/:id/resolve', asyncRoute(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid report ID.' });
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
      const resolved = await db.resolveReport(id, action, notes, dashboardActor(req));
      if (!resolved) return { notFound: false as const, resolved: false as const };
      let cleanupWarning = false;
      if (action === 'perma_ban' || action === 'temp_ban') {
        const reportedUser = await db.getUserById(report.reportedId, true).catch((error: any) => {
          cleanupWarning = true;
          console.error('[API] Could not load banned user for cleanup:', error?.message || error);
          return null;
        });
        const cleanup = await Promise.allSettled([
          matchmakingManager.removeQueueTicketUnderLock(report.reportedId),
          ...(reportedUser?.activeRoomId
            ? [db.endRoom(reportedUser.activeRoomId, 'moderated').then(async (ended) => {
                if (!ended) await db.clearActiveRoom(report.reportedId, reportedUser.activeRoomId!);
              })]
            : []),
        ]);
        cleanupWarning = cleanupWarning || cleanup.some((result) => result.status === 'rejected');
        if (cleanupWarning) {
          console.error('[API] Ban was recorded but queue/room cleanup needs attention:', cleanup.filter((result) => result.status === 'rejected'));
        }
      }
      return { notFound: false as const, resolved: true as const, report, cleanupWarning };
    };

    const requiresBan = action === 'perma_ban' || action === 'temp_ban';
    const outcome = requiresBan
      ? await matchmakingManager.withTicketLock(initialReport.reportedId, resolve)
      : await resolve();

    if (outcome.notFound) return res.status(404).json({ error: 'Report not found' });
    if (!outcome.resolved) return res.status(409).json({ error: 'Report could not be resolved.' });

    const auditLogged = await writeDashboardAudit(req, 'RESOLVE_REPORT', 'REPORT', id, { action, notes });
    res.json({
      success: true,
      auditWarning: !auditLogged,
      cleanupWarning: outcome.cleanupWarning,
      report: { ...outcome.report, status: 'resolved', actionTaken: action },
    });
  }));

  // 6. GENDER VERIFICATIONS
  app.get('/api/verifications', asyncRoute(async (req: Request, res: Response) => {
    const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
    const allowedStatuses = ['pending', 'verified', 'rejected', 'unverified', 'all'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid verification status filter.' });
    }
    const users = await db.getUsersByVerificationStatus(status as any, 1000, 0);
    res.json(users);
  }));

  app.post('/api/verifications/:id/review', asyncRoute(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid user ID.' });
    const { approved, notes } = req.body || {};
    if (typeof approved !== 'boolean') return res.status(400).json({ error: 'approved must be a boolean.' });
    if (notes !== undefined && (typeof notes !== 'string' || notes.length > 1000)) {
      return res.status(400).json({ error: 'notes must be a string of at most 1000 characters.' });
    }

    const result = await verificationService.reviewVerification(dashboardActor(req), id, approved, notes);
    res.json(result);
  }));

  // 7. AUDIT LOGS
  app.get('/api/logs', asyncRoute(async (_req: Request, res: Response) => {
    const logs = await db.getAdminLogs(100);
    res.json(logs);
  }));

  // 9. GUILDS & SERVER DEDICATED CHANNELS
  app.get('/api/guilds', asyncRoute(async (_req: Request, res: Response) => {
    const shardIds = await redis.sMembers('bot:guild-shards');
    const snapshots = await Promise.all(shardIds.map(async (shardId) => {
      const raw = await redis.get(`bot:guilds:${shardId}`);
      if (!raw) {
        await redis.sRem('bot:guild-shards', shardId);
        return [];
      }
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
        crossServerEnabled: settings?.crossServerEnabled !== false,
        isTrustedStaffGuild: ECLAIRS_GUILD_IDS.includes(guild.id),
      };
    }));
    res.json(enriched);
  }));

  app.post('/api/guilds/:id/settings', asyncRoute(async (req: Request, res: Response) => {
    try {
      const guildId = req.params.id as string;
      const body = req.body || {};
      const { guildName, matchChannelId, modLogChannelId, crossServerEnabled } = body;
      if (!/^[0-9]{17,20}$/.test(guildId)) return res.status(400).json({ error: 'Invalid guild ID.' });
      if (guildName !== undefined && (typeof guildName !== 'string' || guildName.length > 100)) {
        return res.status(400).json({ error: 'Invalid guild name.' });
      }
      const hasMatch = Object.prototype.hasOwnProperty.call(body, 'matchChannelId');
      const hasModLog = Object.prototype.hasOwnProperty.call(body, 'modLogChannelId');
      if (hasModLog && !ECLAIRS_GUILD_IDS.includes(guildId)) {
        return res.status(403).json({ error: 'The global moderation alert channel can only be configured in a trusted staff guild.' });
      }
      const hasCrossServer = Object.prototype.hasOwnProperty.call(body, 'crossServerEnabled');
      const settingCount = Number(hasMatch) + Number(hasModLog) + Number(hasCrossServer);
      if (settingCount !== 1) {
        return res.status(400).json({ error: 'Update exactly one server setting per request so a partial database failure cannot leave mixed configuration.' });
      }
      if (hasCrossServer && typeof crossServerEnabled !== 'boolean') {
        return res.status(400).json({ error: 'crossServerEnabled must be a boolean.' });
      }

      const channelIds = [hasMatch ? matchChannelId : undefined, hasModLog ? modLogChannelId : undefined]
        .filter((value) => value !== undefined && value !== null);
      if (channelIds.some((value) => typeof value !== 'string' || !/^[0-9]{17,20}$/.test(value))) {
        return res.status(400).json({ error: 'Channel IDs must be valid Discord snowflakes or null.' });
      }

      if (channelIds.length > 0) {
        if (!config.DISCORD_TOKEN || config.DISCORD_TOKEN.startsWith('mock_')) {
          return res.status(503).json({ error: 'Discord bot credentials are not configured.' });
        }
        const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
        const [channels, roles] = await Promise.all([
          rest.get(Routes.guildChannels(guildId)) as Promise<any[]>,
          rest.get(Routes.guildRoles(guildId)) as Promise<any[]>,
        ]);
        for (const channelId of channelIds) {
          const channel = channels.find((entry) => entry.id === channelId);
          if (!channel || ![0, 5].includes(Number(channel.type))) {
            return res.status(400).json({ error: 'Each channel must be a text or announcement channel in the selected server.' });
          }
          if (!(await botCanSendToChannel(rest, guildId, channel))) {
            return res.status(403).json({ error: 'Destiny needs View Channel and Send Messages permissions in each selected channel.' });
          }
          if (hasModLog && modLogChannelId === channelId && everyoneCanViewChannel(guildId, channel, roles)) {
            return res.status(403).json({ error: 'The moderation channel must be private from @everyone.' });
          }
        }
      }

      const results = await Promise.all([
        hasMatch ? db.setGuildMatchChannel(guildId, matchChannelId ?? null, guildName) : Promise.resolve(true),
        hasModLog ? db.setGuildModLogChannel(guildId, modLogChannelId ?? null, guildName) : Promise.resolve(true),
        hasCrossServer ? db.setGuildCrossServerEnabled(guildId, crossServerEnabled, guildName) : Promise.resolve(true),
      ]);
      if (results.some((saved) => !saved)) {
        return res.status(500).json({ error: 'One or more server settings could not be saved. Refresh the page before retrying.' });
      }
      const auditLogged = await writeDashboardAudit(req, 'UPDATE_GUILD_SETTINGS', 'GUILD', guildId, {
        ...(hasMatch ? { matchChannelId: matchChannelId ?? null } : {}),
        ...(hasModLog ? { modLogChannelId: modLogChannelId ?? null } : {}),
        ...(hasCrossServer ? { crossServerEnabled } : {}),
      });
      res.json({ success: true, guildId, auditWarning: !auditLogged });
    } catch (err: any) {
      console.error('[API] Failed to update guild settings:', err?.message || err);
      res.status(500).json({ error: 'Failed to update guild settings' });
    }
  }));

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
  // Bind to the configured interface. Docker uses 0.0.0.0 for the private
  // container network; the API port is not published to the host.
  apiApp.listen(port, config.API_HOST, () => {
    console.log(`🌐 Destiny Admin API Server listening on http://${config.API_HOST}:${port}`);
  });
}
