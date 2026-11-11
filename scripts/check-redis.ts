import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { describeRedisTarget, resolveRedisConnection } from '../src/redis/connection.js';

const client = new Redis({
  ...resolveRedisConnection(),
  keyPrefix: process.env.REDIS_KEY_PREFIX || 'destiny:',
  connectTimeout: 10_000,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy: () => null,
});
let connectionErrorCode: string | undefined;
client.on('error', (error) => {
  connectionErrorCode = error.code || error.name;
});

try {
  await client.connect();
  const response = await client.ping();
  if (response !== 'PONG') {
    throw new Error('Unexpected Redis PING response.');
  }

  // Prove that this credential can write, read and delete in the same
  // logical database/namespace the bot will use—not just answer PING.
  const key = `healthcheck:${randomUUID()}`;
  const value = randomUUID();
  const writeResult = await client.set(key, value, 'EX', 30, 'NX');
  if (writeResult !== 'OK') throw new Error('Redis SET verification failed.');
  const readValue = await client.get(key);
  if (readValue !== value) throw new Error('Redis GET verification failed.');
  const deleted = await client.del(key);
  if (deleted !== 1) throw new Error('Redis DEL verification failed.');

  console.log(`✅ Redis PING + SET/GET/DEL verified (${describeRedisTarget()}).`);
} catch (error) {
  const errorCode = error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : connectionErrorCode;
  const code = errorCode ? ` (${errorCode})` : '';
  console.error(`❌ Redis connection failed${code} at ${describeRedisTarget()}.`);
  process.exitCode = 1;
} finally {
  client.disconnect();
}
