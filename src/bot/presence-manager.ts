/**
 * Destiny — Dynamic Twitch Streaming Presence Manager
 *
 * Provides a rotating Discord Streaming activity for the Destiny bot:
 * - Continuous rotation of curated Destiny community statuses
 * - Dynamic {members} and {servers} counts computed in real time
 * - Shard-aware: every shard in the cluster rotates independently and never
 *   displays the same status as another shard at the same time
 *
 * Modelled on the music-bot presence engine, adapted to Destiny's domain
 * (anonymous matching / chat) and to the TypeScript + ESM toolchain.
 */

import { ActivityType, Client, PresenceData } from 'discord.js';
import { db } from '../database/supabase.js';
import { getDiscordClient } from './client-registry.js';
import { config } from '../config/index.js';

const DEFAULT_STREAM_URL = config.DESTINY_STREAM_URL;

/**
 * Curated Destiny community rotating statuses.
 *
 * `{members}` is replaced with the number of registered Destiny users and
 * `{servers}` with the number of communities the bot is present in.
 */
export const DESTINY_STATUSES = [
  'Destiny • Where Strangers Become Friends',
  'Eclairs • Where Memories Brew',
  '{servers} Communities United',
  'Destiny • Your Safe Haven',
  'Spreading Warmth to {members} Souls',
  'Growing Together • {servers} Strong',
  '{members} Stars in Our Sky',
  'Every Conversation Starts Somewhere',
  'Late-night talks hit different here',
  'Someone out there needs your hello',
  'Destiny • Anonymous, but never alone',
  'Making strangers into friends since day one',
  'Your next favourite person is waiting',
  'Listening to {members} stories unfold',
  'Destiny • Serendipity, engineered',
  'Every stranger is a friend you have not met yet',
  '{members} hearts, one community',
  'Say hi — someone is waiting',
  'Destiny • Matchmaking with heart',
  'Coffee chats and midnight conversations',
  'Keeping {servers} servers cozy',
  'Your story starts with a hello',
  'Destiny • Where silence finds a voice',
  'Making the internet a little warmer',
  '{members} people found their people here',
  'Be the reason someone smiles today',
  'Destiny • Random chats, real bonds',
  'The queue is warm and waiting',
  'Connecting {members} kindred spirits',
  'New day, new strangers to meet',
  'Destiny • Talk to someone new tonight',
  'Friends are just strangers who stayed',
  'Watching {servers} communities bloom',
  'A kind word travels a long way',
  'Destiny • Your anon adventure awaits',
  'Someone in the queue shares your humour',
  'Brightening timelines, one chat at a time',
  'Destiny • Where every hello matters',
  'Roll the dice and meet a stranger',
  'The best conversations start unexpectedly',
  'Destiny • Building bridges between strangers',
  '{members} members strong and still growing',
  'Your future best friend is in the queue',
  'Destiny • Anonymous chats, genuine bonds',
  'Keeping the night shift company',
  'Every room here has a story to tell',
  'Destiny • Where small talk becomes deep talk',
  'Spread kindness like confetti',
  'The next match could change your week',
  'Destiny • Safe, anonymous, always kind',
  'Two strangers, one unforgettable chat',
  'Destiny • Where nobody has to be anyone',
  '{members} souls have passed through here',
  'Say something kind to a stranger today',
  'Destiny • Your people are out there',
  'From strangers to friends, one tap at a time',
  'Chatting with {servers} communities right now',
  'The world feels smaller with every hello',
  'Destiny • Anonymity with a warm glow',
  'Someone is logging in just to meet you',
  'Destiny • Less scrolling, more connecting',
  'Whisper your thoughts — no names needed',
  '{members} members and counting',
  'A stranger today, a friend tomorrow',
  'Destiny • Your late night companion',
  'Good vibes are always in stock here',
  'Curated for {servers} friendly servers',
  'Destiny • Where shy people shine',
  'Talk freely — your name stays home',
  'Every hello here is a fresh start',
  'Destiny • Making lonely evenings better',
  'The queue never judges',
  '{members} friends made and counting',
  'Destiny • Real talk, no pressure',
  'Take a seat — the next match is close',
  'Serving warm hellos to {members} people',
  'Destiny • Where first words matter most',
  'Somebody is waiting for your message',
  'Connecting hearts across {servers} servers',
  'Destiny • Chat roulette with a conscience',
  'Be the reason someone stays online tonight',
  'Destiny • Where every stranger is welcome',
  'New faces, familiar feelings',
  'The night is young and so is this chat',
  'Destiny • Anonymous by design, kind by default',
  '{members} people call this place home',
  'A quiet corner of the internet that listens',
  'Destiny • Meet someone unforgettable today',
  'Skip the small talk or dive right in',
  'Wherever you are, {servers} servers say hi',
  'Destiny • Your comfort zone, expanded',
  'Everyone here was a stranger once',
  'Catching up with {members} old friends',
  'Destiny • Keep it kind, keep it curious',
  'The next hello might change everything',
  'Holding space for {members} voices tonight',
  'Destiny • Where lurkers become legends',
  'One more chat before bed?',
  'Building a warmer internet, room by room',
  'Destiny • Right person, right time',
  '{servers} servers, one big family',
  'Say hi first — be brave today',
  'Destiny • Never alone after midnight',
  'Come for the chat, stay for the people',
];

/** Discord caps activity names at 128 characters. */
const ACTIVITY_NAME_MAX = 128;

/** Rotation interval in milliseconds. */
const ROTATION_INTERVAL_MS = 20_000;

/** How many recent statuses to avoid repeating. */
const HISTORY_SIZE = 20;
const RECENT_AVOID = 5;

const registeredClients = new Set<Client>();
const clientTimers = new Map<string, { timeout?: NodeJS.Timeout; interval?: NodeJS.Timeout }>();
/** clientId -> currently displayed status index (null when showing a live state) */
const currentStatusIndices = new Map<string, number | null>();
/** clientId -> recently used status indices */
const clientHistory = new Map<string, number[]>();

function clientKey(client: Client): string {
  return client.user?.id || `shard_${client.shard?.ids?.[0] ?? 0}`;
}

function truncate(text: string, length: number): string {
  if (!text) return '';
  return text.length > length ? `${text.slice(0, Math.max(0, length - 3))}...` : text;
}

/**
 * Applies a genuine Discord Streaming activity. Discord only displays the
 * purple Streaming badge when the activity uses a supported Twitch/YouTube URL.
 */
export function setStreamingPresence(client: Client, name: string, url = DEFAULT_STREAM_URL): void {
  if (!client?.user) return;

  const presence: PresenceData = {
    activities: [
      {
        name: truncate(name, ACTIVITY_NAME_MAX),
        type: ActivityType.Streaming,
        url: url || DEFAULT_STREAM_URL,
      },
    ],
    status: 'online',
  };

  try {
    client.user.setPresence(presence);
  } catch (err: any) {
    console.debug('[Presence] Failed to set streaming presence:', err?.message || err);
  }
}

/**
 * Picks a status index for this client that is not currently shown by any
 * other registered shard and has not been used recently by this shard.
 */
export function pickRandomStatusIndex(client: Client): number {
  const id = clientKey(client);

  // Statuses currently displayed by OTHER shards.
  const occupied = new Set<number>();
  for (const [otherId, idx] of currentStatusIndices.entries()) {
    if (otherId !== id && idx !== null && idx !== undefined) {
      occupied.add(idx);
    }
  }

  const history = clientHistory.get(id) || [];
  const recent = new Set(history.slice(-RECENT_AVOID));

  // Tier 1: not occupied elsewhere AND not recently used here.
  let eligible: number[] = [];
  for (let i = 0; i < DESTINY_STATUSES.length; i++) {
    if (!occupied.has(i) && !recent.has(i)) eligible.push(i);
  }

  // Tier 2: not occupied elsewhere AND not the immediately previous status.
  if (eligible.length === 0) {
    const immediatePrev = history[history.length - 1];
    for (let i = 0; i < DESTINY_STATUSES.length; i++) {
      if (!occupied.has(i) && i !== immediatePrev) eligible.push(i);
    }
  }

  // Tier 3: strictly avoid colliding with another shard.
  if (eligible.length === 0) {
    for (let i = 0; i < DESTINY_STATUSES.length; i++) {
      if (!occupied.has(i)) eligible.push(i);
    }
  }

  // Absolute fallback (cannot occur with 100+ statuses).
  if (eligible.length === 0) {
    eligible = [Math.floor(Math.random() * DESTINY_STATUSES.length)];
  }

  const chosen = eligible[Math.floor(Math.random() * eligible.length)];

  history.push(chosen);
  if (history.length > HISTORY_SIZE) history.shift();
  clientHistory.set(id, history);
  currentStatusIndices.set(id, chosen);

  return chosen;
}

/**
 * Live stats shown in the rotating statuses.
 */
interface PresenceCounts {
  members: number;
  servers: number;
}

let cachedCounts: PresenceCounts = { members: 0, servers: 0 };
let lastCountsAt = 0;

/**
 * Counts are refreshed at most every 30s so the rotation never hammers the
 * database while still showing reasonably live numbers.
 */
const COUNTS_TTL_MS = 30_000;

async function getCounts(client: Client): Promise<PresenceCounts> {
  const now = Date.now();
  if (now - lastCountsAt < COUNTS_TTL_MS) {
    return { ...cachedCounts, servers: client.guilds.cache.size };
  }

  let members = cachedCounts.members;
  try {
    members = await db.getUserCount();
  } catch (err: any) {
    console.debug('[Presence] Could not refresh member count:', err?.message || err);
  }

  cachedCounts = { members, servers: client.guilds.cache.size };
  lastCountsAt = now;
  return { ...cachedCounts };
}

/**
 * Synchronises the presence for a single client.
 */
export async function updatePresence(client: Client): Promise<void> {
  if (!client?.user) return;

  const id = clientKey(client);

  // Always keep the curated rotation running. Queue depth and active rooms
  // must never pin the bot to a single matchmaking message.
  const chosenIndex = pickRandomStatusIndex(client);
  const counts = await getCounts(client);

  const template = DESTINY_STATUSES[chosenIndex];
  const message = template
    .replace(/\{members\}/g, counts.members.toLocaleString())
    .replace(/\{servers\}/g, counts.servers.toLocaleString());

  setStreamingPresence(client, message);
}

/**
 * Arms the rotating presence engine for a shard.
 *
 * Each shard rotates independently on a staggered interval so that:
 *  1. Every shard displays a unique status at all times.
 *  2. Gateway presence updates are spread across time.
 */
export function initPresence(client: Client): void {
  if (!client) return;
  registeredClients.add(client);

  // Apply an initial status immediately.
  updatePresence(client).catch(() => {});

  const existing = clientTimers.get(clientKey(client));
  if (existing) {
    if (existing.interval) clearInterval(existing.interval);
    if (existing.timeout) clearTimeout(existing.timeout);
    clientTimers.delete(clientKey(client));
  }

  // Stagger the first rotation so shards do not update in lockstep.
  const shardId = client.shard?.ids?.[0] ?? 0;
  const staggerDelay = (shardId * 5000) % 20000;

  const timer: { timeout?: NodeJS.Timeout; interval?: NodeJS.Timeout } = {};

  timer.timeout = setTimeout(() => {
    if (client?.user && client.isReady()) {
      updatePresence(client).catch(() => {});
    }

    timer.interval = setInterval(() => {
      if (client?.user && client.isReady()) {
        updatePresence(client).catch(() => {});
      }
    }, ROTATION_INTERVAL_MS);

    timer.interval.unref();
  }, staggerDelay);

  timer.timeout.unref();
  clientTimers.set(clientKey(client), timer);
}

/**
 * Stops the presence timers for a shard (used on shutdown).
 */
export function stopPresence(client: Client): void {
  if (!client) return;

  const id = clientKey(client);
  const timer = clientTimers.get(id);
  if (timer) {
    if (timer.interval) clearInterval(timer.interval);
    if (timer.timeout) clearTimeout(timer.timeout);
    clientTimers.delete(id);
  }

  registeredClients.delete(client);
  currentStatusIndices.delete(id);
  clientHistory.delete(id);
}

/**
 * Forces an immediate presence refresh — useful after a state change.
 */
export function refreshPresence(client: Client): void {
  updatePresence(client).catch(() => {});
}

/**
 * Refreshes the presence of the currently registered bot.
 *
 * This is the entry point used by core services (e.g. matchmaking) so they do
 * not have to import the bot layer directly.
 */
export function refreshBotPresence(): void {
  const client = getDiscordClient();
  if (client?.isReady()) {
    updatePresence(client).catch(() => {});
  }
}
