import { Message, MessageCreateOptions, User } from 'discord.js';
import { redis } from '../redis/client.js';

const PANEL_KEY_PREFIX = 'dm:active-panel:';
const PANEL_TTL_SECONDS = 60 * 60 * 24 * 14;
const panelQueues = new Map<string, Promise<void>>();

/**
 * Send a replaceable Destiny UI panel in a user's DM.
 *
 * Only the last message sent through this helper is eligible for cleanup.
 * Ordinary anonymous chat relays and user messages are never scanned or deleted.
 */
export async function sendCleanDmPanel(
  user: User,
  payload: MessageCreateOptions
): Promise<Message> {
  // Serialize sends for the same user within this process so two fast interactions
  // cannot both read the same old ID and leave two newly-created panels behind.
  const previousTask = panelQueues.get(user.id);
  let release!: () => void;
  const currentTask = new Promise<void>((resolve) => { release = resolve; });
  panelQueues.set(user.id, currentTask);
  await previousTask?.catch(() => {});

  try {
    const channel = await user.createDM();
    const key = `${PANEL_KEY_PREFIX}${user.id}`;

    let previousMessageId: string | null = null;
    try {
      previousMessageId = await redis.get(key);
    } catch (error: any) {
      console.warn('[DM cleanup] Could not read previous panel reference:', error?.message || error);
    }

    // Send first so a failed new panel never destroys the user's current panel.
    const sent = await channel.send(payload);

    if (previousMessageId && previousMessageId !== sent.id) {
      try {
        const previous = await channel.messages.fetch(previousMessageId);
        // Guard against stale/corrupt references: only delete our own rich UI panel.
        const isBotMessage = Boolean(user.client.user && previous.author.id === user.client.user.id);
        const isRichPanel = previous.embeds.length > 0 || previous.components.length > 0;
        if (isBotMessage && isRichPanel) await previous.delete();
      } catch (error: any) {
        // Unknown Message (10008) is expected when users or Discord already removed it.
        if (error?.code !== 10008) {
          console.warn('[DM cleanup] Could not delete previous panel:', error?.message || error);
        }
      }
    }

    try {
      await redis.set(key, sent.id, PANEL_TTL_SECONDS);
    } catch (error: any) {
      console.warn('[DM cleanup] Could not save current panel reference:', error?.message || error);
    }

    return sent;
  } finally {
    release();
    if (panelQueues.get(user.id) === currentTask) panelQueues.delete(user.id);
  }
}
