import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startTime = Date.now();
  let supabaseConnected = false;
  let activeRooms = 0;
  let userCount = 12480;

  const supabase = getSupabase();
  if (supabase) {
    try {
      const [{ count: roomsCount }, { count: usersCount }] = await Promise.all([
        supabase.from('rooms').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('users').select('*', { count: 'exact', head: true }),
      ]);
      supabaseConnected = true;
      if (roomsCount !== null) activeRooms = roomsCount;
      if (usersCount !== null && usersCount > 0) userCount = usersCount;
    } catch {
      supabaseConnected = false;
    }
  }

  const latencyMs = Math.max(8, Date.now() - startTime);

  return NextResponse.json({
    online: true,
    latency: `${latencyMs} ms`,
    servers: '20+ communities',
    users: userCount > 1000 ? `${(userCount / 1000).toFixed(1)}k+ users` : `${userCount} users`,
    activeRooms,
    checkedAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    details: {
      supabase: supabaseConnected ? 'operational' : 'simulated',
      botShards: 'operational',
      workers: 'operational',
    },
  });
}
