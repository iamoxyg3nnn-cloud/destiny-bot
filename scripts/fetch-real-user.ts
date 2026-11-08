import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function main() {
  console.log('Querying real Supabase at', process.env.SUPABASE_URL);
  try {
    const { data: users, error } = await supabase.from('users').select('*').limit(5);
    if (error) {
      console.error('Supabase query error:', error);
      return;
    }
    console.log(`Found ${users.length} users in database:`);
    for (const u of users) {
      console.log(`- ${u.destiny_id} (Discord: ${u.discord_user_id}): Age ${u.age}, Gender ${u.gender}, Coins: ${u.destiny_coins}, Streak: ${u.streak_count}, Tier: ${u.connection_tier}, Interests: ${u.interests?.join(',')}`);
    }

    const { data: items } = await supabase.from('shop_items').select('*').limit(5);
    console.log(`Found ${items?.length || 0} shop items:`, items?.map(i => i.name).join(', '));
  } catch (err: any) {
    console.error('Catch error:', err?.message || err);
  }
}

main().then(() => process.exit(0));
