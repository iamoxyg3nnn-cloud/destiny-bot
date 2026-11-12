import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.string().default('info'),

  // Discord
  DISCORD_TOKEN: z.string().default(''),
  DISCORD_CLIENT_ID: z.string().default(''),
  DISCORD_PUBLIC_KEY: z.string().default(''),
  // Comma-separated Discord user IDs allowed to operate the bot globally.
  BOT_OWNER_IDS: z.string().default('').transform((value) => value.split(',').map((id) => id.trim()).filter(Boolean)).refine((ids) => ids.every((id) => /^[0-9]{17,20}$/.test(id)), 'BOT_OWNER_IDS must contain only valid 17–20 digit Discord user IDs.').transform((ids) => Array.from(new Set(ids))),
  DISCORD_SHARDS_TOTAL: z.string().default('1').refine((value) => value === 'auto' || (/^[1-9][0-9]*$/.test(value) && Number(value) <= 1000)),
  DISCORD_SHARDS_PER_CLUSTER: z.coerce.number().int().min(1).max(100).default(1),
  DESTINY_STREAM_URL: z.string().url().refine((value) => {
    const host = new URL(value).hostname.toLowerCase();
    return new URL(value).protocol === 'https:' && (host === 'twitch.tv' || host.endsWith('.twitch.tv') || host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be');
  }).default('https://www.twitch.tv/ninja'),

  // Supabase
  SUPABASE_URL: z.string().default('https://mock-supabase.supabase.co'),
  SUPABASE_ANON_KEY: z.string().default('mock-anon-key'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default('mock-service-role-key'),
  DATABASE_URL: z.string().optional(),

  // Redis
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  REDIS_USERNAME: z.string().default(''),
  REDIS_PASSWORD: z.string().default(''),
  /**
   * Access token for hosted Redis providers (e.g. Upstash). Used as the
   * password when set; takes precedence over REDIS_PASSWORD.
   */
  REDIS_TOKEN: z.string().default(''),
  /**
   * Full connection URL for hosted Redis, e.g.
   * `rediss://default:<token>@my-db.upstash.io:6379`. Overrides the discrete
   * host/port/password variables when set.
   */
  REDIS_URL: z.string().default(''),
  REDIS_DB: z.coerce.number().int().nonnegative().default(0),
  REDIS_TLS: z.string().transform((v) => v.toLowerCase() === 'true').default('false'),
  REDIS_KEY_PREFIX: z.string().default('destiny:'),

  // Notifications
  REMINDER_CRON_SCHEDULE: z.string().default('30 19 * * *'), // 7:30 PM
  REMINDER_DEFAULT_TIMEZONE: z.string().default('Asia/Kolkata'), // IST
  BULLMQ_CONCURRENCY: z.coerce.number().int().min(1).max(1000).default(50),

  // Moderation & Anonymity
  ENCRYPTION_KEY: z.string().default(''),
  AUTO_MOD_ENABLED: z.string().transform((v) => v.toLowerCase() === 'true').default('true'),
  MAX_MESSAGE_RATE_PER_3S: z.coerce.number().int().min(1).max(100).default(5),
  MAX_QUEUE_WAIT_SECONDS: z.coerce.number().int().min(1).max(3600).default(180),
});

export type Config = z.infer<typeof envSchema>;

/**
 * Treats empty strings as "not set".
 *
 * `scripts/setup-env.js` writes `KEY=` for any secret that is absent from the
 * environment, and a hand-written `.env` may do the same. Zod's `.default()`
 * only kicks in for `undefined`, so an empty string would otherwise be
 * accepted as a literal value and silently shadow the real configuration.
 */
function withoutEmptyStrings(source: NodeJS.ProcessEnv): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string' && value.trim() === '') continue;
    if (value !== undefined) cleaned[key] = value;
  }
  return cleaned;
}

function loadConfig(): Config {
  const cleaned = withoutEmptyStrings(process.env);
  const result = envSchema.safeParse(cleaned);
  if (result.success) return result.data;

  console.error('❌ Invalid environment configuration:', result.error.format());

  // Validate each supplied variable independently. The previous fallback
  // reparsed the same invalid values and could crash startup unexpectedly.
  const resolved: Record<string, unknown> = envSchema.parse({});
  for (const [key, value] of Object.entries(cleaned)) {
    const field = (envSchema.shape as Record<string, z.ZodTypeAny>)[key];
    if (!field) continue;
    const parsed = field.safeParse(value);
    if (parsed.success) resolved[key] = parsed.data;
    else console.error(`[Config] Ignoring invalid ${key}; using its safe default.`);
  }
  return resolved as Config;
}

export const config = loadConfig();
