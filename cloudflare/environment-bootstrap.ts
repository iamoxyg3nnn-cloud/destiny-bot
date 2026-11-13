import { env } from 'cloudflare:workers';

const workerProcess = (globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
}).process;

if (workerProcess?.env) {
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') workerProcess.env[key] = value;
  }
}
