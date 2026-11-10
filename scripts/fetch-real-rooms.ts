import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function main() {
  const { data: rooms } = await supabase.from('rooms').select('*').limit(5);
  console.log(`Rooms in DB: ${rooms?.length || 0}`);
  if (rooms && rooms.length > 0) {
    console.log('Sample room:', rooms[0].room_code, rooms[0].user1_pseudonym, 'vs', rooms[0].user2_pseudonym);
  }
}

main().then(() => process.exit(0));
