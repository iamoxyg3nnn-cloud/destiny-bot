import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.string().default('info'),

  // Discord
  DISCORD_TOKEN: z.string().default(''),
  DISCORD_CLIENT_ID: z.string().default(''),
  DISCORD_CLIENT_SECRET: z.string().default(''),
  DISCORD_PUBLIC_KEY: z.string().default(''),
  DISCORD_SHARDS_TOTAL: z.string().default('1'),
  DISCORD_SHARDS_PER_CLUSTER: z.coerce.number().default(1),

  // Supabase
  SUPABASE_URL: z.string().default('https://mock-supabase.supabase.co'),
  SUPABASE_ANON_KEY: z.string().default('mock-anon-key'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default('mock-service-role-key'),
  DATABASE_URL: z.string().optional(),

  // Redis
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().default(''),
  REDIS_DB: z.coerce.number().default(0),
  REDIS_TLS: z.string().transform((v) => v === 'true').default('false'),
  REDIS_KEY_PREFIX: z.string().default('destiny:'),

  // Notifications
  REMINDER_CRON_SCHEDULE: z.string().default('30 19 * * *'), // 7:30 PM
  REMINDER_DEFAULT_TIMEZONE: z.string().default('Asia/Kolkata'), // IST
  BULLMQ_CONCURRENCY: z.coerce.number().default(50),

  // API & Dashboard
  PORT: z.coerce.number().default(4000),
  API_SECRET_KEY: z.string().default('destiny_internal_secret_32bytes_min_key!'),
  NEXTAUTH_SECRET: z.string().default('destiny_dashboard_secret_key_32bytes!'),

  // Moderation & Anonymity
  ENCRYPTION_KEY: z.string().default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
  AUTO_MOD_ENABLED: z.string().transform((v) => v === 'true').default('true'),
  MAX_MESSAGE_RATE_PER_3S: z.coerce.number().default(5),
  MAX_QUEUE_WAIT_SECONDS: z.coerce.number().default(180),
});

export type Config = z.infer<typeof envSchema>;

function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment configuration:', result.error.format());
    return envSchema.parse({});
  }
  return result.data;
}

export const config = loadConfig();
