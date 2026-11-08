import { ShardingManager } from 'discord.js';
import { config } from '../config/index.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ShardCoordinator {
  private manager: ShardingManager | null = null;

  start() {
    if (!config.DISCORD_TOKEN || config.DISCORD_TOKEN.startsWith('mock_')) {
      console.log('ℹ️ Sharding Coordinator running in mock development mode.');
      return;
    }

    const botFile = path.join(__dirname, 'index.js');

    this.manager = new ShardingManager(botFile, {
      token: config.DISCORD_TOKEN,
      totalShards: config.DISCORD_SHARDS_TOTAL === 'auto' ? 'auto' : parseInt(config.DISCORD_SHARDS_TOTAL, 10),
      respawn: true,
      execArgv: ['--enable-source-maps'],
    });

    this.manager.on('shardCreate', (shard) => {
      console.log(`🚀 [Cluster] Shard #${shard.id} launched successfully.`);

      shard.on('disconnect', () => {
        console.warn(`⚠️ [Cluster] Shard #${shard.id} disconnected. Reconnection in progress...`);
      });

      shard.on('reconnecting', () => {
        console.log(`🔄 [Cluster] Shard #${shard.id} reconnecting...`);
      });

      shard.on('death', (proc: any) => {
        console.error(`💥 [Cluster] Shard #${shard.id} crashed (PID: ${proc?.pid || 'unknown'}). Auto-respawning shard...`);
      });
    });

    this.manager.spawn().catch((err) => {
      console.error('❌ Failed to spawn shard cluster:', err);
    });
  }

  async getClusterStats() {
    if (!this.manager) {
      return { totalShards: 1, shardsOnline: 1, guilds: 1, cachedUsers: 1 };
    }

    try {
      const results = await Promise.all([
        this.manager.fetchClientValues('guilds.cache.size'),
        this.manager.broadcastEval((c) => c.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0)),
      ]);

      const totalGuilds = (results[0] as number[]).reduce((acc, count) => acc + count, 0);
      const totalMembers = (results[1] as number[]).reduce((acc, count) => acc + count, 0);

      return {
        totalShards: this.manager.totalShards,
        shardsOnline: this.manager.shards.size,
        guilds: totalGuilds,
        cachedUsers: totalMembers,
      };
    } catch {
      return { totalShards: 1, shardsOnline: 1, guilds: 0, cachedUsers: 0 };
    }
  }
}

export const shardCoordinator = new ShardCoordinator();

if (process.env.RUN_SHARDS === 'true') {
  shardCoordinator.start();
}
