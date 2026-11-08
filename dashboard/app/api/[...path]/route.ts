import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_API_URL || 'http://localhost:4000';

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join('/');
  const search = req.nextUrl.search;
  const targetUrl = `${BACKEND_URL}/api/${path}${search}`;

  try {
    const res = await fetch(targetUrl, {
      cache: 'no-store',
      headers: {
        'Accept': 'application/json',
      },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ error: 'Backend unreachable', details: err?.message }, { status: 502 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join('/');
  const targetUrl = `${BACKEND_URL}/api/${path}`;
  const body = await req.json().catch(() => ({}));

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ error: 'Backend unreachable', details: err?.message }, { status: 502 });
  }
}
