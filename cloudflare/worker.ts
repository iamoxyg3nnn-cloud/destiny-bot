import './environment-bootstrap.js';
import { handleDashboardRequest } from '../src/dashboard/server.js';
import html from '../apps/server-dashboard/public/index.html?raw';
import css from '../apps/shared/dashboard.css?raw';
import js from '../apps/shared/dashboard.js?raw';

type WorkerEnv = Record<string, string>;
type NodeRequestLike = {
  url: string;
  method: string;
  headers: Record<string, string>;
  socket: { remoteAddress: string };
  body?: unknown;
};
type NodeResponseLike = {
  headersSent: boolean;
  writeHead(status: number, headers?: Record<string, string>): NodeResponseLike;
  setHeader(name: string, value: string): NodeResponseLike;
  end(body?: string | Uint8Array): void;
  destroy(): void;
};

const staticFiles: Record<string, { body: string; type: string }> = {
  '/': { body: html, type: 'text/html; charset=utf-8' },
  '/index.html': { body: html, type: 'text/html; charset=utf-8' },
  '/dashboard.css': { body: css, type: 'text/css; charset=utf-8' },
  '/dashboard.js': { body: js, type: 'text/javascript; charset=utf-8' },
};

function responseFromNodeAdapter(request: Request, url: URL): Promise<Response> {
  const headersOut = new Headers();
  let status = 200;
  let body: string | Uint8Array | null = null;
  let headersSent = false;

  const response: NodeResponseLike = {
    get headersSent() { return headersSent; },
    writeHead(nextStatus, values = {}) {
      status = nextStatus;
      for (const [name, value] of Object.entries(values)) headersOut.set(name, value);
      headersSent = true;
      return response;
    },
    setHeader(name, value) {
      headersOut.set(name, value);
      return response;
    },
    end(value) {
      if (value !== undefined) body = value;
      headersSent = true;
    },
    destroy() {
      status = 500;
      body = null;
      headersSent = true;
    },
  };

  return (async () => {
    const nodeHeaders = Object.fromEntries(request.headers.entries());
    nodeHeaders.host = url.host;
    const nodeRequest: NodeRequestLike = {
      url: `${url.pathname}${url.search}`,
      method: request.method,
      headers: nodeHeaders,
      socket: { remoteAddress: request.headers.get('cf-connecting-ip') || '' },
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const rawBody = await request.text();
      if (rawBody.length > 8 * 1024) return Response.json({ error: 'Request body is too large.' }, { status: 413 });
      if (rawBody) {
        try { nodeRequest.body = JSON.parse(rawBody); }
        catch { nodeRequest.body = rawBody; }
      } else nodeRequest.body = {};
    }

    await handleDashboardRequest(
      nodeRequest as never,
      response as never,
    );
    return new Response(request.method === 'HEAD' ? null : body, { status, headers: headersOut });
  })();
}

export default {
  async fetch(request: Request, _env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health' || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/api/')) {
      return responseFromNodeAdapter(request, url);
    }

    const file = staticFiles[url.pathname] ?? staticFiles['/index.html'];
    return new Response(request.method === 'HEAD' ? null : file.body, {
      headers: {
        'Content-Type': file.type,
        'Cache-Control': file.type.startsWith('text/html') ? 'no-store' : 'public, max-age=300',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'X-Frame-Options': 'DENY',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://cdn.discordapp.com; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      },
    });
  },
};
