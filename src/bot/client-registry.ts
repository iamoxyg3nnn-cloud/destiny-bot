import type { Client } from 'discord.js';

let discordClient: Client | null = null;

/**
 * Registers the live Discord client so core services can deliver DMs without
 * importing the whole bot bootstrap (which would create a second client).
 */
export function setDiscordClient(client: Client): void {
  discordClient = client;
}

export function getDiscordClient(): Client | null {
  return discordClient;
}
