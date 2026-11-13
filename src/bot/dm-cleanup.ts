import { Message, MessageCreateOptions, User } from 'discord.js';
import { lockManager } from '../storage/locks.js';
import { stateStore } from '../storage/state-store.js';

const PANEL_KEY_PREFIX = 'dm:active-panel:';
const PANEL_LOCK_PREFIX = 'lock:dm-active-panel:';
const PANEL_LOCK_TTL_MS = 30_000;
const panelQueues = new Map<string, Promise<void>>();
// Best-effort process-local journal for panels sent while Supabase is unavailable.
const pendingPanelIds = new Map<string, Set<string>>();

function isMessageId(value: unknown): value is string {
  return typeof value === 'string' && /^\d{17,20}$/.test(value);
}

/** Parse the current JSON-array format and the legacy single-ID format. */
export function parsePanelIds(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return [...new Set(parsed.filter(isMessageId))];
  } catch {
    // Migrate the previous single raw message-ID format.
  }
  return isMessageId(value) ? [value] : [];
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(isMessageId))];
}

function rememberPending(userId: string, ids: string[]): void {
  if (!ids.length) return;
  const pending = pendingPanelIds.get(userId) ?? new Set<string>();
  for (const id of ids) pending.add(id);
  pendingPanelIds.set(userId, pending);
}

function takePending(userId: string): string[] {
  return [...(pendingPanelIds.get(userId) ?? [])];
}

function isAlreadyGone(error: any): boolean {
  const code = Number(error?.code ?? error?.rawError?.code);
  // Unknown Message (10008) and Unknown Channel (10003) are already-clean states.
  return code === 10008 || code === 10003;
}

async function sendWithoutCleanup(user: User, payload: MessageCreateOptions): Promise<Message> {
  const channel = await user.createDM();
  const sent = await channel.send(payload);
  rememberPending(user.id, [sent.id]);
  return sent;
}

/**
 * Send a replaceable Destiny UI panel in a user's DM.
 *
 * A Supabase distributed lock coordinates shards/processes; the local queue avoids
 * unnecessary lock contention within one process. Only explicitly tracked message
 * IDs are considered for deletion. Ordinary relay messages are never scanned.
 */
export async function sendCleanDmPanel(
  user: User,
  payload: MessageCreateOptions
): Promise<Message> {
  // Fail-safe boundary: only explicitly structured UI panels may enter the
  // replacement/cleanup lifecycle. Plain text messages are never tracked or
  // eligible for deletion, even if a future caller accidentally uses this API.
  const isStructuredPanel =
    (Array.isArray(payload.components) && payload.components.length > 0) ||
    (Array.isArray(payload.embeds) && payload.embeds.length > 0);
  if (!isStructuredPanel) {
    const channel = await user.createDM();
    return await channel.send(payload);
  }

  const previousTask = panelQueues.get(user.id);
  let release!: () => void;
  const currentTask = new Promise<void>((resolve) => { release = resolve; });
  panelQueues.set(user.id, currentTask);
  await previousTask?.catch(() => {});

  try {
    let enteredLock = false;
    try {
      return await lockManager.withLock(
        `${PANEL_LOCK_PREFIX}${user.id}`,
        async () => {
          enteredLock = true;
          const channel = await user.createDM();
          const key = `${PANEL_KEY_PREFIX}${user.id}`;

          let stored: string | null;
          try {
            stored = await stateStore.get(key);
          } catch (error: any) {
            console.warn('[DM cleanup] Could not read panel references; preserving runtime state:', error?.message || error);
            const sent = await channel.send(payload);
            rememberPending(user.id, [sent.id]);
            return sent;
          }

          const previousIds = uniqueIds([
            ...parsePanelIds(stored),
            ...takePending(user.id),
          ]);

          // Send first so a failed send never destroys the current panel.
          const sent = await channel.send(payload);
          const allTrackedIds = uniqueIds([...previousIds, sent.id]);

          // Write-ahead record: do not delete any previous panel unless Supabase has
          // durably recorded the new ID alongside every old ID.
          try {
            const saved = await stateStore.set(key, JSON.stringify(allTrackedIds));
            if (!saved) throw new Error('Supabase did not confirm saving panel references.');
            pendingPanelIds.delete(user.id);
          } catch (error: any) {
            rememberPending(user.id, [sent.id]);
            console.warn('[DM cleanup] Could not persist panel before cleanup; leaving old panels intact:', error?.message || error);
            return sent;
          }

          const failedIds: string[] = [];
          const botId = user.client.user?.id;

          for (const messageId of previousIds) {
            if (messageId === sent.id) continue;

            try {
              const previous = await channel.messages.fetch(messageId);
              // Never delete another author's message. If bot identity is not yet
              // available, retain the ID so a later attempt can safely retry it.
              if (!botId) {
                failedIds.push(messageId);
                continue;
              }
              if (previous.author.id !== botId) continue;

              // Delete even if edited and no longer has embeds/components: the ID
              // came from this helper's trusted tracking list.
              await previous.delete();
            } catch (error: any) {
              if (!isAlreadyGone(error)) {
                failedIds.push(messageId);
                console.warn('[DM cleanup] Could not delete tracked panel; will retry:', messageId, error?.message || error);
              }
            }
          }

          // Retain only failed deletions plus the newest visible panel. No TTL or
          // arbitrary cap: failed references must not silently become untracked.
          const remainingIds = uniqueIds([...failedIds, sent.id]);
          try {
            const saved = await stateStore.set(key, JSON.stringify(remainingIds));
            if (!saved) throw new Error('Supabase did not confirm saving pruned panel references.');
          } catch (error: any) {
            // The write-ahead value remains safe: it contains every old ID and the
            // new panel, so later calls can prune already-deleted IDs (10008).
            console.warn('[DM cleanup] Could not save pruned panel references; retaining write-ahead state:', error?.message || error);
          }

          return sent;
        },
        PANEL_LOCK_TTL_MS
      );
    } catch (error: any) {
      // If the callback started, never send a duplicate panel. Otherwise lock
      // acquisition failed: preserve UX, skip cleanup, and journal the new ID locally.
      if (enteredLock) throw error;
      console.warn('[DM cleanup] Distributed lock unavailable; sending without cleanup:', error?.message || error);
      return await sendWithoutCleanup(user, payload);
    }
  } finally {
    release();
    if (panelQueues.get(user.id) === currentTask) panelQueues.delete(user.id);
  }
}
