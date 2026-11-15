import { REST, Routes } from 'discord.js';
import { config } from '../src/config/index.js';
import { slashCommands } from '../src/bot/commands/definitions.js';

async function deployCommands() {
  if (!config.DISCORD_TOKEN || config.DISCORD_TOKEN.startsWith('mock_')) {
    console.log('⚠️ Running in mock Discord token mode. Please configure DISCORD_TOKEN in .env to deploy live to Discord.');
    console.log(`Validated ${slashCommands.length} commands ready for deployment:`);
    for (const cmd of slashCommands) {
      console.log(` - /${cmd.name}`);
    }
    return;
  }
  if (!config.DISCORD_CLIENT_ID) {
    console.error('❌ DISCORD_CLIENT_ID is missing in .env');
    process.exit(1);
  }

  const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
  const body = slashCommands.map((cmd) => cmd.toJSON());

  console.log(`🌌 Deploying ${slashCommands.length} slash commands to Discord Application ${config.DISCORD_CLIENT_ID}...`);

  try {
    await rest.put(
      Routes.applicationCommands(config.DISCORD_CLIENT_ID),
      { body }
    );
    console.log(`✅ Successfully published all ${slashCommands.length} slash commands globally!`);
  } catch (error: any) {
    console.error('❌ Failed to deploy slash commands to Discord:', error?.message || error);
    process.exit(1);
  }
}

deployCommands();
