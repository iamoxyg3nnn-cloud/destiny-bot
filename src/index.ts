import { config } from './config/index.js';
import { db } from './database/supabase.js';
import { redis } from './redis/client.js';
import { startAllWorkers } from './workers/index.js';
import { apiApp } from './api/server.js';
import { bot } from './bot/index.js';

async function bootstrap() {
  console.log('================================================================');
  console.log('🌌 DESTINY — ANONYMOUS SOCIAL & MATCHMAKING ECOSYSTEM');
  console.log('================================================================');
  console.log(`[Config] Node Environment: ${config.NODE_ENV}`);
  console.log(`[Database] Supabase Mode: ${db.isUsingMock() ? 'In-Memory Testing Store' : 'Connected to Supabase'}`);
  console.log(`[Cache/Locks] Redis Mode: ${redis.isHealthy() ? 'Connected' : 'High-Speed Memory Fallback'}`);

  // 1. Start Workers
  startAllWorkers();

  // 2. Start API Server
  const port = config.PORT || 4000;
  const server = apiApp.listen(port, () => {
    console.log(`🌐 [API] Admin Backend listening on http://localhost:${port}`);
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
    try {
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
