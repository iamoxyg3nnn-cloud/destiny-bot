import { config } from './config/index.js';
import { db } from './database/supabase.js';
import { stateStore } from './storage/state-store.js';
import { startAllWorkers, stopAllWorkers } from './workers/index.js';
import { bot } from './bot/index.js';
import { stopPresence } from './bot/presence-manager.js';

async function bootstrap() {
  if (config.NODE_ENV === 'production') {
    if (!config.DISCORD_TOKEN || config.DISCORD_TOKEN.startsWith('mock_') || !config.DISCORD_CLIENT_ID) {
      throw new Error('DISCORD_TOKEN and DISCORD_CLIENT_ID are required in production.');
    }
  }
  console.log('================================================================');
  console.log('🌌 DESTINY — ANONYMOUS SOCIAL & MATCHMAKING ECOSYSTEM');
  console.log('================================================================');
  console.log(`[Config] Node Environment: ${config.NODE_ENV}`);
  console.log(`[Database] Supabase Mode: ${db.isUsingMock() ? 'In-Memory Testing Store' : 'Connected to Supabase'}`);
  // 1. Start Workers
  await startAllWorkers({ includeMatchmaking: true });
  console.log(`[Runtime State] Supabase Mode: ${stateStore.isHealthy() ? 'Connected' : 'Unavailable'}`);

  // 2. Start Discord Bot
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

      const results = await Promise.allSettled([
        stopAllWorkers(),
        Promise.resolve().then(() => bot.client?.destroy()),
      ]);

      for (const result of results) {
        if (result.status === 'rejected') {
          console.error('[Shutdown] Component shutdown failed:', result.reason);
          process.exitCode = 1;
        }
      }
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
