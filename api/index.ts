import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleDashboardRequest } from '../src/dashboard/server.js';

type VercelIncomingMessage = IncomingMessage & { body?: unknown };

export default async function handler(req: VercelIncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`);
  const path = url.searchParams.get('__path');
  if (path && /^\/(?:auth|api)(?:\/|$)|^\/health$/.test(path)) {
    url.searchParams.delete('__path');
    req.url = `${path}${url.search ? url.search : ''}`;
  }
  await handleDashboardRequest(req, res);
}
