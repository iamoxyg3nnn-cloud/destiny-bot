import { NextRequest, NextResponse } from 'next/server';
import { readSessionPayload, SESSION_COOKIE } from '../../../lib/auth';

const BACKEND_URL = process.env.BACKEND_API_URL || 'http://localhost:4000';
const API_KEY = process.env.API_SECRET_KEY || '';

/**
 * The backend admin API is protected by a shared secret. We attach it
 * server-side so the key is never exposed to the browser bundle.
 */
async function backendHeaders(req: NextRequest, extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const session = await readSessionPayload(req.cookies.get(SESSION_COOKIE)?.value);
  return {
    Accept: 'application/json',
    ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
    ...extra,
    // The actor is derived from the signed HttpOnly session, never a browser header.
    'x-admin-id': session?.sub || 'dashboard_owner',
  };
}

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join('/');
  const search = req.nextUrl.search;
  const targetUrl = `${BACKEND_URL}/api/${path}${search}`;

  try {
    const res = await fetch(targetUrl, {
      cache: 'no-store',
      headers: await backendHeaders(req),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error('[Dashboard API] Backend request failed:', err);
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join('/');
  const targetUrl = `${BACKEND_URL}/api/${path}`;
  const body = await req.json().catch(() => ({}));

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: await backendHeaders(req, {
        'Content-Type': 'application/json',
        ...(req.headers.get('idempotency-key') ? { 'Idempotency-Key': req.headers.get('idempotency-key')! } : {}),
      }),
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error('[Dashboard API] Backend request failed:', err);
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 });
  }
}
