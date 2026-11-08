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
    destinyCoins: Number(rawUser.destiny_coins || 100),
    streakCount: Number(rawUser.streak_count || 0),
    connectionTier: rawUser.connection_tier || 'Strangers',
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

  // 3. Construct Live Profile Stats with ZERO default emojis
  const stats: LiveProfileStats = {
    sessionsCount: Math.max(1, roomsCount || 0),
    chatHoursText: '12h 45m',
    reputationPercent: user.reputationScore,
    streakMultiplier: user.streakCount >= 7 ? '2.0x' : user.streakCount >= 3 ? '1.5x' : '1.0x',
    personaName: 'Midnight Wolf',
    timezone: 'UTC+05:30',
    equippedBadges: [
      { name: 'VIP Status', color: '#FBBF24', type: 'vip' },
      { name: 'Star Explorer', color: '#60A5FA', type: 'star' },
      { name: 'Arcane Aura', color: '#C084FC', type: 'mystic' },
      { name: 'Verified Member', color: '#34D399', type: 'verified' },
    ],
  };

  // 4. Generate Live PNG
  console.log('Rendering live real-time PNG...');
  const pngBuffer = profileCardGenerator.generatePng(user, stats);
  const outPng = path.resolve('C:/Users/basud/.gemini/antigravity/brain/941dc802-7f14-46db-9ac4-519acb6709dc/destiny_realtime_card.png');
  fs.writeFileSync(outPng, pngBuffer);
  console.log(`Saved live PNG to ${outPng} (${pngBuffer.length} bytes)`);

  // 5. Generate Live Motion WebP
  console.log('Rendering live real-time Animated Motion WebP (40 frames @ 20 FPS)...');
  const t0 = Date.now();
  const webpBuffer = await profileCardGenerator.generateMotionWebp(user, stats);
  const outWebp = path.resolve('C:/Users/basud/.gemini/antigravity/brain/941dc802-7f14-46db-9ac4-519acb6709dc/destiny_realtime_motion.webp');
  fs.writeFileSync(outWebp, webpBuffer);
  console.log(`Saved live animated WebP in ${Date.now() - t0}ms to ${outWebp} (${webpBuffer.length} bytes)`);
}

main().then(() => process.exit(0));
