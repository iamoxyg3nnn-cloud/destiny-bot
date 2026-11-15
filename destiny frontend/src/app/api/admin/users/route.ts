import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!verifyAdminAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized: Staff authentication required' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim() || '';

  const supabase = getSupabase();
  if (!supabase || !query) {
    return NextResponse.json({ users: [] });
  }

  try {
    let dbQuery = supabase.from('users').select('*').limit(20);
    if (/^[0-9]{15,22}$/.test(query)) {
      dbQuery = dbQuery.eq('discord_user_id', query);
    } else if (query.startsWith('DESTINY-') || query.startsWith('destiny#')) {
      const cleanId = query.replace('destiny#', 'DESTINY-');
      dbQuery = dbQuery.ilike('destiny_id', `%${cleanId}%`);
    } else {
      dbQuery = dbQuery.or(`destiny_id.ilike.%${query}%,bio.ilike.%${query}%`);
    }

    const { data, error } = await dbQuery;
    if (error) throw error;
    return NextResponse.json({ users: data || [] });
  } catch (err: any) {
    return NextResponse.json({ users: [], error: err?.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized: Staff authentication required' }, { status: 401 });
  }

  const body = await request.json();
  const { userId, action, reason } = body;

  const supabase = getSupabase();
  if (!supabase || !userId) {
    return NextResponse.json({ success: false, message: 'Missing parameters' }, { status: 400 });
  }

  try {
    if (action === 'ban') {
      await supabase.from('users').update({
        is_banned: true,
        ban_reason: reason || 'Banned by administrator',
        ban_expires_at: null,
      }).eq('id', userId);
    } else if (action === 'unban') {
      await supabase.from('users').update({
        is_banned: false,
        ban_reason: null,
        ban_expires_at: null,
      }).eq('id', userId);
    } else if (action === 'reset_reputation') {
      await supabase.from('users').update({
        reputation_score: 100,
      }).eq('id', userId);
    }

    return NextResponse.json({ success: true, message: `Action ${action} executed successfully` });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message }, { status: 500 });
  }
}
