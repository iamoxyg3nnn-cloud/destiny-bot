import {
  Client,
  Guild,
  PermissionFlagsBits,
  type GuildEmoji,
} from 'discord.js';

const EMOJI_GUILD_ID = '1555968929023664208';
const EMOJI_GG_API = 'https://emoji.gg/api';
const MAX_EMOJI_BYTES = 256 * 1024;

const CATALOGUE: Record<string, string[]> = {
  "orbit": [
    "orbit",
    "planet",
    "saturn",
    "cosmos"
  ],
  "privacy": [
    "lock",
    "privacy",
    "secure"
  ],
  "realtime": [
    "bolt",
    "lightning",
    "flash"
  ],
  "achievement": [
    "trophy",
    "award",
    "medal"
  ],
  "warning": [
    "warning",
    "alert",
    "caution"
  ],
  "birthday": [
    "cake",
    "birthday",
    "calendar"
  ],
  "gender": [
    "gender",
    "symbol",
    "male female"
  ],
  "verified": [
    "verified",
    "check",
    "shield"
  ],
  "wallet": [
    "wallet",
    "coin",
    "currency"
  ],
  "streak": [
    "fire",
    "flame",
    "streak"
  ],
  "interests": [
    "target",
    "aim",
    "interest"
  ],
  "sparkle": [
    "sparkle",
    "glitter",
    "shiny"
  ],
  "profile": [
    "profile",
    "user",
    "person"
  ],
  "chat": [
    "chat",
    "message",
    "speech"
  ],
  "exit": [
    "exit",
    "door",
    "leave"
  ],
  "success": [
    "check",
    "success",
    "tick"
  ],
  "photo": [
    "camera",
    "photo",
    "picture"
  ],
  "shop": [
    "shopping",
    "shop",
    "store"
  ],
  "style": [
    "clothes",
    "fashion",
    "shirt"
  ],
  "error": [
    "cross",
    "x",
    "error"
  ],
  "connection": [
    "link",
    "connection",
    "heart"
  ],
  "search": [
    "search",
    "magnify",
    "discover"
  ],
  "time": [
    "clock",
    "time",
    "hour"
  ],
  "celebration": [
    "party",
    "celebrate",
    "confetti"
  ],
  "list": [
    "list",
    "clipboard",
    "checklist"
  ],
  "alert": [
    "siren",
    "alert",
    "emergency"
  ],
  "pin": [
    "pin",
    "pushpin",
    "bookmark"
  ],
  "folder": [
    "folder",
    "directory",
    "file"
  ],
  "delete": [
    "trash",
    "delete",
    "bin"
  ],
  "settings": [
    "gear",
    "settings",
    "cog"
  ],
  "analytics": [
    "chart",
    "graph",
    "analytics"
  ],
  "global": [
    "globe",
    "world",
    "global"
  ],
  "tools": [
    "tools",
    "wrench",
    "hammer"
  ],
  "identity": [
    "mask",
    "theater",
    "identity"
  ],
  "clean": [
    "broom",
    "clean",
    "sweep"
  ],
  "gift": [
    "gift",
    "present",
    "box"
  ],
  "edit": [
    "pencil",
    "edit",
    "write"
  ],
  "neutral": [
    "circle",
    "white",
    "neutral"
  ],
  "play": [
    "play",
    "triangle",
    "media"
  ],
  "audio": [
    "headphones",
    "audio",
    "music"
  ]
};

const DISALLOWED_TERMS = [
  'kawaii', 'cute', 'anime', 'waifu', 'neko', 'catgirl', 'blob',
  'pepe', 'meme', '3d', 'animated', 'gif', 'reaction face',
];

type EmojiGgEntry = {
  id: number;
  title: string;
  slug: string;
  image: string;
  description?: string;
  faves?: number;
};

const installed = new Map<string, GuildEmoji>();

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function score(entry: EmojiGgEntry, terms: string[]): number {
  const title = normalized(entry.title);
  const slug = normalized(entry.slug);
  const description = normalized(entry.description || '');
  if (DISALLOWED_TERMS.some((term) => `${title} ${slug} ${description}`.includes(term))) return -1;
  if (!/^https:\/\/cdn[0-9]*\.emoji\.gg\//i.test(entry.image)) return -1;
  if (!entry.image.toLowerCase().split('?')[0].endsWith('.png')) return -1;

  let result = 0;
  for (const term of terms) {
    const needle = normalized(term);
    if (title === needle || slug === needle) result += 100;
    else if (title.includes(needle) || slug.includes(needle)) result += 30;
    else if (description.includes(needle)) result += 2;
  }
  return result + Math.min(entry.faves || 0, 100) / 100;
}

async function fetchCatalogue(): Promise<EmojiGgEntry[]> {
  const response = await fetch(EMOJI_GG_API, {
    headers: { 'user-agent': 'DestinyDiscordBot/1.0 (Emoji.gg integration)' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Emoji.gg API returned HTTP ${response.status}`);
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error('Emoji.gg API returned an unexpected payload');
  return payload as EmojiGgEntry[];
}

async function downloadPng(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Emoji image returned HTTP ${response.status}`);
  const type = response.headers.get('content-type') || '';
  if (!type.includes('image/png')) throw new Error('Emoji.gg asset is not served as PNG');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_EMOJI_BYTES) {
    throw new Error(`Emoji image size is invalid (${bytes.length} bytes)`);
  }
  // Validate the PNG signature instead of trusting the filename/content-type.
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error('Emoji.gg asset did not contain a valid PNG signature');
  }
  return bytes;
}

async function ensureEmoji(guild: Guild, catalogue: EmojiGgEntry[], name: string, terms: string[]): Promise<void> {
  const existing = guild.emojis.cache.find((item) => item.name === `destiny_${name}`);
  if (existing) {
    installed.set(name, existing);
    return;
  }

  const candidate = catalogue
    .map((entry) => ({ entry, score: score(entry, terms) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.entry;

  if (!candidate) {
    console.warn(`[Emoji.gg] No suitable static PNG found for destiny_${name}`);
    return;
  }

  try {
    const image = await downloadPng(candidate.image);
    const created = await guild.emojis.create({
      attachment: image,
      name: `destiny_${name}`,
      reason: `Destiny brand emoji sourced from Emoji.gg entry #${candidate.id}`,
    });
    installed.set(name, created);
    console.log(`[Emoji.gg] Installed :${created.name}: from Emoji.gg (${candidate.id})`);
  } catch (error: any) {
    console.warn(`[Emoji.gg] Could not install destiny_${name}:`, error?.message || error);
  }
}

/**
 * Fetches Emoji.gg's public catalogue and installs matching static PNGs in
 * Destiny's brand server. Runs on the primary shard only.
 */
export async function initializeDestinyEmojis(client: Client): Promise<void> {
  const guild = client.guilds.cache.get(EMOJI_GUILD_ID)
    || await client.guilds.fetch(EMOJI_GUILD_ID).catch(() => null);
  if (!guild) {
    console.warn(`[Emoji.gg] Brand server ${EMOJI_GUILD_ID} is not accessible to this bot`);
    return;
  }

  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me?.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
    console.warn('[Emoji.gg] Bot lacks Manage Expressions in the brand server');
    return;
  }

  // Populate the cache before checking names or available slots so restarts
  // never create duplicate copies of emojis already installed in the guild.
  try {
    await guild.emojis.fetch();
  } catch (error: any) {
    console.warn('[Emoji.gg] Could not refresh the guild emoji cache; skipping uploads to avoid duplicates:', error?.message || error);
    return;
  }

  try {
    const catalogue = await fetchCatalogue();
    console.log(`[Emoji.gg] Loaded ${catalogue.length} catalogue entries; installing static brand emojis`);
    for (const [name, terms] of Object.entries(CATALOGUE)) {
      // Re-check the current count before every upload to respect the server's
      // static emoji slot limit and leave existing server emojis untouched.
      if (guild.emojis.cache.filter((emoji) => !emoji.animated).size >= ((guild as any).maximumEmojiSlots || 50) && !guild.emojis.cache.some((item) => item.name === `destiny_${name}`)) {
        console.warn('[Emoji.gg] Server has reached its static emoji slot limit');
        break;
      }
      await ensureEmoji(guild, catalogue, name, terms);
    }
  } catch (error: any) {
    console.warn('[Emoji.gg] Emoji initialization failed:', error?.message || error);
  }
}

const EMOJI_GLYPH_MAP: Record<string, string> = {
  "🪐": "orbit",
  "🔒": "privacy",
  "⚡": "realtime",
  "🏆": "achievement",
  "⚠️": "warning",
  "🎂": "birthday",
  "⚧": "gender",
  "🛡️": "verified",
  "🪙": "wallet",
  "🔥": "streak",
  "🎯": "interests",
  "✨": "sparkle",
  "👤": "profile",
  "💬": "chat",
  "🚪": "exit",
  "✅": "success",
  "📸": "photo",
  "🛍️": "shop",
  "👔": "style",
  "👧": "gender",
  "👦": "gender",
  "❌": "error",
  "💫": "connection",
  "🔍": "search",
  "💰": "wallet",
  "🕒": "time",
  "🎉": "celebration",
  "📜": "list",
  "🚨": "alert",
  "🌱": "streak",
  "🚫": "warning",
  "🔞": "warning",
  "📢": "chat",
  "👶": "birthday",
  "📉": "analytics",
  "🎙️": "audio",
  "🔄": "success",
  "🌟": "achievement",
  "⚪": "neutral",
  "🎧": "audio",
  "📋": "list",
  "📌": "pin",
  "📂": "folder",
  "🗑️": "delete",
  "⚙️": "settings",
  "📊": "analytics",
  "🌐": "global",
  "🛠️": "tools",
  "🎭": "identity",
  "🧹": "clean",
  "📍": "pin",
  "👉": "realtime",
  "🔔": "chat",
  "📩": "chat",
  "⛔": "warning",
  "🔓": "privacy",
  "🎁": "gift",
  "✏️": "edit",
  "💡": "success",
  "🟢": "neutral",
  "⏳": "time",
  "⬇️": "play",
  "▶️": "play"
};

/** Converts Unicode emoji in user-facing copy into installed Destiny custom emoji mentions. */
export function destinyEmojiText(value: string): string {
  return value.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, (glyph) => {
    const key = EMOJI_GLYPH_MAP[glyph] || EMOJI_GLYPH_MAP[glyph + '\uFE0F'];
    return key ? destinyEmoji(key as keyof typeof CATALOGUE) : '';
  });
}

/** Discord button emoji payload for a named installed Destiny emoji. */
export function destinyEmojiComponent(glyph: string): { id: string; name: string } | string {
  const key = EMOJI_GLYPH_MAP[glyph] || EMOJI_GLYPH_MAP[glyph + '\uFE0F'];
  const item = key ? installed.get(key) : undefined;
  return item ? { id: item.id, name: item.name || key! } : glyph;
}

/** Returns a Discord custom-emoji mention, or an empty string if not installed. */
export function destinyEmoji(name: keyof typeof CATALOGUE): string {
  const item = installed.get(name);
  return item ? `<:${item.name}:${item.id}>` : '';
}
