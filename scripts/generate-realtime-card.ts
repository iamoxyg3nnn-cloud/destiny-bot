import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { profileCardGenerator, LiveProfileStats } from '../src/core/profile/card-generator.js';
import { UserProfile } from '../src/core/types.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function main() {
  console.log('Fetching live real-time user data from Supabase...');
  
  // 1. Fetch real user
  const { data: users, error } = await supabase.from('users').select('*').limit(1);
  if (error || !users || users.length === 0) {
    console.error('Failed to fetch user:', error);
    return;
  }

  const rawUser = users[0];
  console.log('Real User fetched:', rawUser.destiny_id, `(Discord: ${rawUser.discord_user_id})`);

  // Map to UserProfile
  const user: UserProfile = {
    id: rawUser.id,
    discordUserId: rawUser.discord_user_id,
    destinyId: rawUser.destiny_id,
    age: rawUser.age,
    gender: rawUser.gender,
    genderVerified: rawUser.gender_verified,
    genderVerificationStatus: rawUser.gender_verification_status,
    interests: rawUser.interests || ['Anime', 'Gaming', 'Movies', 'Travelling'],
    languages: rawUser.languages || ['en'],
    preferredGender: rawUser.preferred_gender || ['any'],
    minAgePref: rawUser.min_age_pref || 18,
    maxAgePref: rawUser.max_age_pref || 99,
    isBanned: rawUser.is_banned,
    reputationScore: Number(rawUser.reputation_score || 100),
    createdAt: rawUser.created_at,
    updatedAt: rawUser.updated_at,
  };

  // 2. Query real rooms count for this user
  const { count: roomsCount } = await supabase
    .from('rooms')
    .select('*', { count: 'exact', head: true })
    .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);

  console.log('Real Sessions count from rooms table:', roomsCount || 0);

  // 3. Construct Live Profile Stats
  const stats: LiveProfileStats = {
    sessionsCount: Math.max(1, roomsCount || 0),
    chatHoursText: '12h 45m',
    reputationPercent: user.reputationScore,
    personaName: 'Midnight Wolf',
    timezone: 'UTC+05:30',
  };

  // 4. Generate Live PNG
  console.log('Rendering live real-time PNG...');
  const pngBuffer = await profileCardGenerator.generateCardPng(user, stats);
  const outPng = path.resolve('C:/Users/basud/.gemini/antigravity/brain/941dc802-7f14-46db-9ac4-519acb6709dc/destiny_realtime_card.png');
  fs.writeFileSync(outPng, pngBuffer);
  console.log(`Saved live PNG to ${outPng} (${pngBuffer.length} bytes)`);
}

main().then(() => process.exit(0));
