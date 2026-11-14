import './environment-bootstrap.js';
import { handleDashboardRequest } from '../src/dashboard/server.js';
import html from '../apps/server-dashboard/public/index.html?raw';
import css from '../apps/shared/dashboard.css?raw';
import js from '../apps/shared/dashboard.js?raw';
import hero from '../apps/shared/assets/destiny-hero.svg?raw';
import portal from '../apps/shared/assets/feature-portal.svg?raw';
import match from '../apps/shared/assets/feature-match.svg?raw';
import safety from '../apps/shared/assets/feature-safety.svg?raw';
import community from '../apps/shared/assets/feature-community.svg?raw';
import anonymous from '../apps/shared/assets/feature-anonymous.svg?raw';
import profile from '../apps/shared/assets/feature-profile.svg?raw';
import reveal from '../apps/shared/assets/feature-reveal.svg?raw';
import destinyWaifuBase64 from '../apps/shared/assets/destiny-waifu.png?base64';
import matchEmojiBase64 from '../apps/shared/assets/destiny_match.png?base64';
import profileEmojiBase64 from '../apps/shared/assets/destiny_profile.png?base64';
import shieldEmojiBase64 from '../apps/shared/assets/destiny_shield.png?base64';
import sparkEmojiBase64 from '../apps/shared/assets/destiny_spark.png?base64';

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

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

const staticFiles: Record<string, { body: string | Uint8Array; type: string }> = {
  '/': { body: html, type: 'text/html; charset=utf-8' },
  '/index.html': { body: html, type: 'text/html; charset=utf-8' },
  '/dashboard.css': { body: css, type: 'text/css; charset=utf-8' },
  '/dashboard.js': { body: js, type: 'text/javascript; charset=utf-8' },
  '/assets/destiny-hero.svg': { body: hero, type: 'image/svg+xml' },
  '/assets/feature-portal.svg': { body: portal, type: 'image/svg+xml' },
  '/assets/feature-match.svg': { body: match, type: 'image/svg+xml' },
  '/assets/feature-safety.svg': { body: safety, type: 'image/svg+xml' },
  '/assets/feature-community.svg': { body: community, type: 'image/svg+xml' },
  '/assets/feature-anonymous.svg': { body: anonymous, type: 'image/svg+xml' },
  '/assets/feature-profile.svg': { body: profile, type: 'image/svg+xml' },
  '/assets/feature-reveal.svg': { body: reveal, type: 'image/svg+xml' },
  '/assets/destiny-waifu.png': { body: decodeBase64(destinyWaifuBase64), type: 'image/png' },
  '/assets/destiny_match.png': { body: decodeBase64(matchEmojiBase64), type: 'image/png' },
  '/assets/destiny_profile.png': { body: decodeBase64(profileEmojiBase64), type: 'image/png' },
  '/assets/destiny_shield.png': { body: decodeBase64(shieldEmojiBase64), type: 'image/png' },
  '/assets/destiny_spark.png': { body: decodeBase64(sparkEmojiBase64), type: 'image/png' },
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
        'Cache-Control': file.type.startsWith('text/html') || file.type.startsWith('text/css') || file.type.startsWith('text/javascript')
          ? 'no-store'
          : 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'X-Frame-Options': 'DENY',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://cdn.discordapp.com; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      },
    });
  },
};
