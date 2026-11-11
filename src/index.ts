import { config } from './config/index.js';
import { db } from './database/supabase.js';
import { redis } from './redis/client.js';
import { startAllWorkers, stopAllWorkers } from './workers/index.js';
import { apiApp } from './api/server.js';
import { bot } from './bot/index.js';
import { stopPresence } from './bot/presence-manager.js';

async function bootstrap() {
  if (config.NODE_ENV === 'production') {
    if (!config.DISCORD_TOKEN || config.DISCORD_TOKEN.startsWith('mock_') || !config.DISCORD_CLIENT_ID) {
      throw new Error('DISCORD_TOKEN and DISCORD_CLIENT_ID are required in production.');
    }
    if (config.API_SECRET_KEY.length < 32 || config.API_SECRET_KEY === 'destiny_internal_secret_32bytes_min_key!') {
      throw new Error('API_SECRET_KEY must be a unique secret of at least 32 characters in production.');
    }
  }
  console.log('================================================================');
  console.log('🌌 DESTINY — ANONYMOUS SOCIAL & MATCHMAKING ECOSYSTEM');
  console.log('================================================================');
  console.log(`[Config] Node Environment: ${config.NODE_ENV}`);
  console.log(`[Database] Supabase Mode: ${db.isUsingMock() ? 'In-Memory Testing Store' : 'Connected to Supabase'}`);
  // 1. Start Workers
  await startAllWorkers({ includeMatchmaking: true });
  console.log(`[Cache/Locks] Redis Mode: ${redis.isHealthy() ? 'Connected' : 'High-Speed Memory Fallback'}`);

  // 2. Start API Server (loopback only — never exposed directly)
  const port = config.PORT || 4000;
  const server = apiApp.listen(port, config.API_HOST, () => {
    console.log(`🌐 [API] Admin Backend listening on http://${config.API_HOST}:${port}`);
  });

  // 3. Start Discord Bot
  if (config.DISCORD_TOKEN && !config.DISCORD_TOKEN.startsWith('mock_')) {
    await bot.start();
  } else {
    console.log('ℹ️ [Discord] Mock Token configured. Ready for testing & interactions.');
  }

  console.log('🚀 Destiny System is fully operational and healthy.');

  let shuttingDown = false;
  const handleShutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n🛑 Received ${signal}. Gracefully stopping Destiny Ecosystem...`);

    const watchdog = setTimeout(() => {
      console.error('[Shutdown] Graceful shutdown exceeded 20 seconds; forcing process exit.');
      process.exit(1);
    }, 20_000);
    watchdog.unref?.();

    try {
      stopPresence(bot.client);

      const serverClosed = new Promise<void>((resolve) => {
        server.close(() => resolve());
        // close() stops new connections; explicitly drop keep-alive sockets
        // so an idle dashboard client cannot hold the runner open.
        server.closeAllConnections?.();
      });

      const results = await Promise.allSettled([
        serverClosed,
        stopAllWorkers(),
        Promise.resolve().then(() => bot.client?.destroy()),
      ]);

      for (const result of results) {
        if (result.status === 'rejected') {
          console.error('[Shutdown] Component shutdown failed:', result.reason);
          process.exitCode = 1;
        }
      }
      await redis.close();
    } catch (error) {
      console.error('[Shutdown] Unexpected shutdown error:', error);
      process.exitCode = 1;
    } finally {
      clearTimeout(watchdog);
      if (process.exitCode !== 1) process.exitCode = 0;
    }
  };

  process.once('SIGINT', () => { void handleShutdown('SIGINT'); });
  process.once('SIGTERM', () => { void handleShutdown('SIGTERM'); });
}

bootstrap().catch((err) => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});
