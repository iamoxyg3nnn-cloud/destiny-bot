import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!verifyAdminAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized: Staff authentication required' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'pending';

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ reports: [] });
  }

  try {
    let query = supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(50);
    if (status !== 'all') {
      query = query.eq('status', status);
    }
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ reports: data || [] });
  } catch (err: any) {
    return NextResponse.json({ reports: [], error: err?.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized: Staff authentication required' }, { status: 401 });
  }

  const body = await request.json();
  const { reportId, action, notes } = body;

  const supabase = getSupabase();
  if (!supabase || !reportId) {
    return NextResponse.json({ success: false, message: 'Missing parameters or database offline' }, { status: 400 });
  }

  try {
    // 1. Fetch report details
    const { data: report, error: fetchErr } = await supabase.from('reports').select('*').eq('id', reportId).single();
    if (fetchErr || !report) {
      return NextResponse.json({ success: false, message: 'Report not found' }, { status: 404 });
    }

    const updates: any = {
      status: action === 'dismiss' ? 'dismissed' : 'resolved',
      action_taken: action === 'dismiss' ? 'none' : action,
      moderator_notes: notes || 'Resolved via Admin Dashboard',
      resolved_by: 'Platform Staff',
      updated_at: new Date().toISOString(),
    };

    // 2. Perform enforcement action if applicable
    if (action === 'warn') {
      // Deduct reputation
      await supabase.rpc('adjust_user_reputation', {
        target_user_id: report.target_user_id,
        amount: -25,
      });
    } else if (action === 'suspend_24h') {
      const expiresAt = new Date(Date.now() + 86400 * 1000).toISOString();
      await supabase.from('users').update({
        is_banned: true,
        ban_reason: `Temporary 24h suspension: ${report.category}`,
        ban_expires_at: expiresAt,
      }).eq('id', report.target_user_id);
    } else if (action === 'ban_permanent') {
      await supabase.from('users').update({
        is_banned: true,
        ban_reason: `Permanent ban: ${report.category}`,
        ban_expires_at: null,
      }).eq('id', report.target_user_id);
    }

    // 3. Mark report resolved
    await supabase.from('reports').update(updates).eq('id', reportId);

    return NextResponse.json({ success: true, message: `Action ${action} executed successfully` });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message }, { status: 500 });
  }
}
