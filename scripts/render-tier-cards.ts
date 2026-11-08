import { createCanvas, loadImage } from '@napi-rs/canvas';
import * as fs from 'fs';
import { profileCardGenerator } from '../src/core/profile/card-generator.js';
import { db } from '../src/database/supabase.js';

async function main() {
  const user = await db.getUserByDestinyId('R7ZYFK');
  if (!user) { console.error('User not found'); process.exit(1); }

  const baseStats = {
    sessionsCount: 4,
    chatHoursText: '12h 45m',
    reputationPercent: 100,
    personaName: '_.demon._3',
    timezone: 'UTC+05:30',
    avatarUrl: 'https://cdn.discordapp.com/avatars/999598324434866196/233892372d6c8ebe0ab5fc69c419d394.png?size=256',
    matchIntent: 'LATE NIGHT CHAT',
    bio: 'Living life one conversation at a time',
    equippedBadges: ['ID VERIFIED', '7D STREAK', 'TITAN 1K', 'VETERAN', 'KARMA 100%']
  };

  const tiers = ['Strangers', 'Acquaintance', 'Friends', 'Close', 'Bonded', 'Destiny'];
  const artifactDir = 'C:/Users/basud/.gemini/antigravity/brain/941dc802-7f14-46db-9ac4-519acb6709dc';

  let avatarImage: any = null;
  try { avatarImage = await loadImage(baseStats.avatarUrl); } catch {}

  for (const tier of tiers) {
    const params = {
      displayName: baseStats.personaName,
      personaName: baseStats.personaName,
      destinyId: user.destinyId || 'R7ZYFK',
      age: user.age || 25,
      gender: user.gender || 'Male',
      isVerified: Boolean(user.genderVerified),
      tierName: tier,
      level: 1,
      currentXp: 9500,
      nextLevelXp: 10000,
      totalXp: 9500,
      coins: 100,
      streakCount: 0,
      sessionsCount: 4,
      talkTime: '12h 45m',
      reputationScore: 100,
      interests: ['Anime', 'Gaming', 'Movie and travelling'],
      languages: ['Hindi', 'English', 'Gujarati'],
      timezone: 'UTC+05:30',
      matchIntent: 'LATE NIGHT CHAT',
      bio: 'Living life one conversation at a time',
      cardTheme: 'obsidian',
      equippedBadges: ['ID VERIFIED', '7D STREAK', 'TITAN 1K', 'VETERAN', 'KARMA 100%'],
      avatarImage,
    };

    const canvas = createCanvas(profileCardGenerator.width, profileCardGenerator.height);
    const ctx = canvas.getContext('2d');
    profileCardGenerator.drawCard(ctx, params, profileCardGenerator.width, profileCardGenerator.height, 0, 0);
    const buf = canvas.toBuffer('image/png');

    const name = `card_tier_${tier.toLowerCase()}.png`;
    fs.writeFileSync(name, buf);
    fs.writeFileSync(`${artifactDir}/${name}`, buf);
    console.log(`${tier} rendered: ${buf.length}`);
  }

  console.log('All 6 tier seals rendered!');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
