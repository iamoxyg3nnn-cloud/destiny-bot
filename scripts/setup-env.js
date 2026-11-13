import fs from 'fs';

const keys = [
  'NODE_ENV',
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'DISCORD_PUBLIC_KEY',
  'BOT_OWNER_IDS',
  'DESTINY_STREAM_URL',
  'DISCORD_SHARDS_TOTAL',
  'DISCORD_SHARDS_PER_CLUSTER',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ACCESS_TOKEN',
  'DATABASE_URL',
  'REMINDER_CRON_SCHEDULE',
  'REMINDER_DEFAULT_TIMEZONE',
  'ENCRYPTION_KEY',
  'AUTO_MOD_ENABLED',
  'MAX_MESSAGE_RATE_PER_3S',
  'MAX_QUEUE_WAIT_SECONDS',
  'LOG_LEVEL',
];

// Preserve existing secrets/settings. Explicit process environment values win,
// but running setup-env must never wipe an already configured .env file.
const existing = new Map();
if (fs.existsSync('.env')) {
  for (const raw of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    existing.set(key, value);
  }
}

const lines = keys.map((key) => {
  const value = process.env[key] !== undefined ? process.env[key] : (existing.get(key) ?? '');
  return `${key}=${value}`;
});

// Retain custom variables that are not managed by this script.
for (const [key, value] of existing) {
  if (!keys.includes(key) && !key.startsWith('REDIS_') && key !== 'BULLMQ_CONCURRENCY') lines.push(`${key}=${value}`);
}

fs.writeFileSync('.env', lines.join('\n') + '\n', { mode: 0o600 });
fs.chmodSync('.env', 0o600);
console.log('✅ Generated .env configuration file successfully (existing values preserved).');
