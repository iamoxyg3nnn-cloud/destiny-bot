import { config } from './config/index.js';
import { db } from './database/supabase.js';
import { redis } from './redis/client.js';
import { startAllWorkers } from './workers/index.js';
import { apiApp } from './api/server.js';
import { bot } from './bot/index.js';
import { stopPresence } from './bot/presence-manager.js';

async function bootstrap() {
  console.log('================================================================');
  console.log('🌌 DESTINY — ANONYMOUS SOCIAL & MATCHMAKING ECOSYSTEM');
  console.log('================================================================');
  console.log(`[Config] Node Environment: ${config.NODE_ENV}`);
  console.log(`[Database] Supabase Mode: ${db.isUsingMock() ? 'In-Memory Testing Store' : 'Connected to Supabase'}`);
  // 1. Start Workers
  await startAllWorkers();
  console.log(`[Cache/Locks] Redis Mode: ${redis.isHealthy() ? 'Connected' : 'High-Speed Memory Fallback'}`);

  // 2. Start API Server (loopback only — never exposed directly)
  const port = config.PORT || 4000;
  const server = apiApp.listen(port, '127.0.0.1', () => {
    console.log(`🌐 [API] Admin Backend listening on http://127.0.0.1:${port}`);
  });

  // 3. Start Discord Bot
  if (config.DISCORD_TOKEN && !config.DISCORD_TOKEN.startsWith('mock_')) {
    await bot.start();
  } else {
    console.log('ℹ️ [Discord] Mock Token configured. Ready for testing & interactions.');
  }

  console.log('🚀 Destiny System is fully operational and healthy.');

  const handleShutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal}. Gracefully stopping Destiny Ecosystem...`);
    const forceExit = setTimeout(() => process.exit(0), 15_000);
    forceExit.unref();
    try {
      stopPresence(bot.client);
      if (bot.client) {
        await bot.client.destroy();
      }
      server.close();
    } catch {}
    process.exit(0);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});
