import fs from 'fs';

const keys = [
  'NODE_ENV',
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'DISCORD_PUBLIC_KEY',
  'DISCORD_SHARDS_TOTAL',
  'DISCORD_SHARDS_PER_CLUSTER',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ACCESS_TOKEN',
  'DATABASE_URL',
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_USERNAME',
  'REDIS_PASSWORD',
  'REDIS_TOKEN',
  'REDIS_URL',
  'REDIS_DB',
  'REDIS_TLS',
  'REDIS_KEY_PREFIX',
  'REMINDER_CRON_SCHEDULE',
  'REMINDER_DEFAULT_TIMEZONE',
  'BULLMQ_CONCURRENCY',
  'PORT',
  'API_SECRET_KEY',
  'DASHBOARD_ADMIN_PASSWORD',
  'DASHBOARD_SESSION_SECRET',
  'NEXTAUTH_SECRET',
  'NEXTAUTH_URL',
  'NEXT_PUBLIC_API_URL',
  'ENCRYPTION_KEY',
  'AUTO_MOD_ENABLED',
  'MAX_MESSAGE_RATE_PER_3S',
  'MAX_QUEUE_WAIT_SECONDS',
  'LOG_LEVEL',
];

const lines = [];
for (const key of keys) {
  const val = process.env[key] !== undefined ? process.env[key] : '';
  lines.push(`${key}=${val}`);
}

fs.writeFileSync('.env', lines.join('\n') + '\n');
console.log('✅ Generated .env configuration file successfully.');
