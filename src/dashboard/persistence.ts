import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';

type EncryptedValue = {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
};

const PERSISTENT_DASHBOARD_RUNTIME = process.env.VERCEL === '1' || process.env.CLOUDFLARE_WORKER === '1';
let serviceClient: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient {
  if (serviceClient) return serviceClient;
  if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY || config.SUPABASE_URL.includes('mock-supabase')) {
    throw new Error('Supabase service credentials are required for persistent dashboard state.');
  }
  serviceClient = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serviceClient;
}

function encryptionKey(secret: string, app: string): Buffer {
  if (secret.length < 32) throw new Error('Dashboard session secret must be at least 32 characters.');
  return createHash('sha256').update(`destiny-dashboard-state:${app}:`).update(secret).digest();
}

function encrypt(value: string, secret: string, app: string): EncryptedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret, app), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    version: 1,
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  };
}

function decrypt(value: unknown, secret: string, app: string): string {
  if (!value || typeof value !== 'object') throw new Error('Stored dashboard state is invalid.');
  const encrypted = value as Partial<EncryptedValue>;
  if (encrypted.version !== 1 || !encrypted.iv || !encrypted.tag || !encrypted.ciphertext) {
    throw new Error('Stored dashboard state has an unsupported format.');
  }
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret, app), Buffer.from(encrypted.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export async function readDashboardState(app: string, key: string, secret: string): Promise<string | null> {
  if (!PERSISTENT_DASHBOARD_RUNTIME) return null;
  const { data, error } = await getServiceClient()
    .from('dashboard_runtime_state')
    .select('payload')
    .eq('app', app)
    .eq('key', key)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) throw new Error(`Could not read dashboard state: ${error.message}`);
  if (!data) return null;
  return decrypt(data.payload, secret, app);
}

export async function writeDashboardState(app: string, key: string, value: string, ttlSeconds: number, secret: string): Promise<void> {
  if (!PERSISTENT_DASHBOARD_RUNTIME) return;
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1) throw new Error('Dashboard state TTL is invalid.');
  const { error } = await getServiceClient()
    .from('dashboard_runtime_state')
    .upsert({
      app,
      key,
      payload: encrypt(value, secret, app),
      expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    }, { onConflict: 'app,key' });
  if (error) throw new Error(`Could not write dashboard state: ${error.message}`);
}

export async function deleteDashboardState(app: string, key: string): Promise<void> {
  if (!PERSISTENT_DASHBOARD_RUNTIME) return;
  const { error } = await getServiceClient()
    .from('dashboard_runtime_state')
    .delete()
    .eq('app', app)
    .eq('key', key);
  if (error) throw new Error(`Could not delete dashboard state: ${error.message}`);
}

export async function consumeDashboardState(app: string, key: string, secret: string): Promise<string | null> {
  if (!PERSISTENT_DASHBOARD_RUNTIME) return null;
  const { data, error } = await getServiceClient().rpc('consume_dashboard_runtime_state', {
    p_app: app,
    p_key: key,
  });
  if (error) throw new Error(`Could not consume dashboard state: ${error.message}`);
  return data === null ? null : decrypt(data, secret, app);
}

export async function incrementDashboardRateLimit(app: string, bucket: string, ip: string, secret: string): Promise<number> {
  if (!PERSISTENT_DASHBOARD_RUNTIME) throw new Error('Persistent dashboard rate limiting requires a persistent dashboard runtime.');
  const ipHash = createHmac('sha256', encryptionKey(secret, app)).update(ip).digest('hex');
  const { data, error } = await getServiceClient().rpc('increment_dashboard_rate_limit', {
    p_app: app,
    p_bucket: bucket,
    p_ip_hash: ipHash,
    p_window_seconds: 60,
  });
  if (error) throw new Error(`Could not update dashboard rate limit: ${error.message}`);
  return Number(data);
}

export function isPersistentDashboardRuntime(): boolean {
  return PERSISTENT_DASHBOARD_RUNTIME;
}
