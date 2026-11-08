import { profileCardGenerator } from '../src/core/profile/card-generator.js';
import { db } from '../src/database/supabase.js';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const user = await db.getUserByDestinyId('R7ZYFK');
  if (!user) {
    console.error('User not found!');
    process.exit(1);
  }

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

  const artifactDir = 'C:/Users/basud/.gemini/antigravity/brain/941dc802-7f14-46db-9ac4-519acb6709dc';

  // 1. Obsidian (Classic Pure Dark Monochrome)
  user.cardTheme = 'obsidian';
  const bufObsidian = await profileCardGenerator.generateCardPng(user, baseStats);
  fs.writeFileSync('card_theme_obsidian.png', bufObsidian);
  fs.writeFileSync(path.join(artifactDir, 'card_theme_obsidian.png'), bufObsidian);
  console.log('1. Obsidian rendered:', bufObsidian.length);

  // 2. Cyber Damask (Etched Steel)
  user.cardTheme = 'cyber_damask';
  const bufDamask = await profileCardGenerator.generateCardPng(user, baseStats);
  fs.writeFileSync('card_theme_cyber_damask.png', bufDamask);
  fs.writeFileSync(path.join(artifactDir, 'card_theme_cyber_damask.png'), bufDamask);
  console.log('2. Cyber Damask rendered:', bufDamask.length);

  // 3. Frost Glaze (Crystalline Frost Luminescence)
  user.cardTheme = 'frost_glaze';
  const bufFrost = await profileCardGenerator.generateCardPng(user, baseStats);
  fs.writeFileSync('card_theme_frost_glaze.png', bufFrost);
  fs.writeFileSync(path.join(artifactDir, 'card_theme_frost_glaze.png'), bufFrost);
  console.log('3. Frost Glaze rendered:', bufFrost.length);

  // 4. Holographic Platinum (Prismatic Platinum Ambient)
  user.cardTheme = 'holographic_plat';
  const bufHolo = await profileCardGenerator.generateCardPng(user, baseStats);
  fs.writeFileSync('card_theme_holographic.png', bufHolo);
  fs.writeFileSync(path.join(artifactDir, 'card_theme_holographic.png'), bufHolo);
  console.log('4. Holographic rendered:', bufHolo.length);

  // 5. Anonymous Monogram (Initials fallback)
  user.cardTheme = 'obsidian';
  const anonStats = { ...baseStats, avatarUrl: undefined };
  const bufAnon = await profileCardGenerator.generateCardPng(user, anonStats);
  fs.writeFileSync('card_anonymous_monogram.png', bufAnon);
  fs.writeFileSync(path.join(artifactDir, 'card_anonymous_monogram.png'), bufAnon);
  console.log('5. Anonymous Monogram rendered:', bufAnon.length);

  // 6. Session Recap Card (Co-Op Chemistry)
  const recapData = {
    roomCode: 'DEST-9428',
    durationText: '24m 12s',
    chemistryScore: 98,
    xpAwarded: 450,
    coinsAwarded: 60,
    user1: {
      pseudonym: '_.demon._3',
      avatarMonogram: 'DM',
      destinyId: 'R7ZYFK',
      tier: 'Destiny',
      avatarUrl: 'https://cdn.discordapp.com/avatars/999598324434866196/233892372d6c8ebe0ab5fc69c419d394.png?size=256'
    },
    user2: {
      pseudonym: 'Celestial Fox',
      avatarMonogram: 'CF',
      destinyId: 'X9K2LQ',
      tier: 'Destiny',
      avatarUrl: 'https://cdn.discordapp.com/embed/avatars/1.png'
    }
  };
  const bufRecap = await profileCardGenerator.generateSessionRecapCard(recapData);
  fs.writeFileSync('destiny_session_recap.png', bufRecap);
  fs.writeFileSync(path.join(artifactDir, 'destiny_session_recap.png'), bufRecap);
  console.log('6. Session Recap rendered:', bufRecap.length);

  console.log('All 6 cards rendered successfully!');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
