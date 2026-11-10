import Redis from 'ioredis';
import { describeRedisTarget, resolveRedisConnection } from '../src/redis/connection.js';

const client = new Redis({
  ...resolveRedisConnection(),
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
  console.log(`✅ Redis connectivity verified (${describeRedisTarget()}).`);
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
