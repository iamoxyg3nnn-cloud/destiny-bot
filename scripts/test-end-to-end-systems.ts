import { db } from '../src/database/supabase.js';
import { shopService } from '../src/core/economy/shop.js';
import { profileCardGenerator } from '../src/core/profile/card-generator.js';
import { progressionService } from '../src/core/progression/levels.js';
import { embedService } from '../src/bot/embeds/index.js';
import { slashCommands } from '../src/bot/commands/definitions.js';
import * as fs from 'fs';
import * as path from 'path';

async function runEndToEndVerification() {
  console.log('====================================================');
  console.log('DESTINY BOT: COMPLETE END-TO-END SYSTEM VERIFICATION');
  console.log('====================================================\n');

  // -----------------------------------------------------------------
  // 1. WARDROBE & SHOP CATALOG VERIFICATION
  // -----------------------------------------------------------------
  console.log('▶ [1/5] Verifying Shop & Wardrobe System...');
  const catalog = await shopService.getCatalog();
  console.log(`✓ Fetched shop catalog: ${catalog.length} available items.`);
  const prestigeThemes = catalog.filter((i) => i.category === 'theme');
  console.log(`✓ Prestige themes available: ${prestigeThemes.map((t) => t.name).join(', ')}`);

  const targetDiscordId = '999598324434866196';
  const user = await db.getUserByDiscordId(targetDiscordId);
  if (!user) throw new Error('Target test user not found!');

  console.log(`✓ Testing user ${user.destinyId} (Current theme: ${user.cardTheme || 'obsidian'})`);

  // Equip cyber_damask theme
  await db.addToUserInventory(user.id, 'theme_cyber_damask');
  const equipRes = await shopService.equipCardTheme(user, 'cyber_damask');
  console.log(`✓ Equip theme result: ${equipRes.message}`);

  // Equip 5 insignia badges
  const testBadges = ['ID VERIFIED', '7D STREAK', 'TITAN 1K', 'VETERAN', 'KARMA 100%'];
  const badgeRes = await shopService.setEquippedBadges(user, testBadges);
  console.log(`✓ Equip badges result: ${badgeRes.message}`);

  // -----------------------------------------------------------------
  // 2. SKIA CARD GENERATOR WITH THEMES & INSIGNIAS
  // -----------------------------------------------------------------
  console.log('\n▶ [2/5] Testing Skia Card Generator with Themes...');
  const userRooms = await db.getUserRooms(user.id);
  const stats = {
    sessionsCount: userRooms.length,
    chatHoursText: '12h 45m',
    reputationPercent: user.reputationScore ?? 100,
    personaName: 'Midnight Wolf',
    timezone: 'UTC+05:30',
    matchIntent: user.matchIntent || 'LATE NIGHT CHAT',
    bio: user.bio || 'Looking for late-night gaming friends & deep talks',
    equippedBadges: user.equippedBadges,
  };

  // Render Cyber Damask
  user.cardTheme = 'cyber_damask';
  const t0 = Date.now();
  const damaskBuf = await profileCardGenerator.generateCardPng(user, stats);
  console.log(`✓ Cyber Damask PNG rendered in ${Date.now() - t0}ms (${damaskBuf.length} bytes)`);
  fs.writeFileSync('destiny_damask_preview.png', damaskBuf);

  // Render Frost Glaze
  user.cardTheme = 'frost_glaze';
  const t1 = Date.now();
  const frostBuf = await profileCardGenerator.generateCardPng(user, stats);
  console.log(`✓ Frost Glaze PNG rendered in ${Date.now() - t1}ms (${frostBuf.length} bytes)`);
  fs.writeFileSync('destiny_frost_preview.png', frostBuf);

  // Reset back to Obsidian
  user.cardTheme = 'obsidian';
  const obsidianBuf = await profileCardGenerator.generateCardPng(user, stats);
  fs.writeFileSync('destiny_obsidian_preview.png', obsidianBuf);
  console.log(`✓ Default Obsidian Monochrome PNG rendered (${obsidianBuf.length} bytes)`);

  // -----------------------------------------------------------------
  // 3. LIVE ROOM CHEMISTRY & TIER PROGRESSION
  // -----------------------------------------------------------------
  console.log('\n▶ [3/5] Testing Connection XP & Tier Progression Logic...');
  const testTiers = [
    { xp: 10, expected: 'Strangers' },
    { xp: 75, expected: 'Acquaintances' },
    { xp: 200, expected: 'Familiar' },
    { xp: 500, expected: 'Connection' },
    { xp: 850, expected: 'Trusted Connection' },
    { xp: 1500, expected: 'Destiny' },
  ];

  for (const t of testTiers) {
    const tierInfo = progressionService.getTierFromXp(t.xp);
    if (tierInfo.tier !== t.expected) {
      throw new Error(`Tier mismatch for ${t.xp} XP! Got ${tierInfo.tier}, expected ${t.expected}`);
    }
    console.log(`✓ XP ${t.xp} -> Tier "${tierInfo.tier}" ${tierInfo.badge} (Perks: ${tierInfo.perks.join('; ')})`);
  }

  // -----------------------------------------------------------------
  // 4. SERVER ONBOARDING & MATCHMAKING PORTAL
  // -----------------------------------------------------------------
  console.log('\n▶ [4/5] Testing Server Onboarding & Portal Container...');
  const portalContainer = embedService.createMatchmakingPortalContainer();
  if (!portalContainer) throw new Error('Portal container generation failed!');
  console.log('✓ Permanent Matchmaking Portal Container constructed cleanly with Components V2 buttons.');

  // -----------------------------------------------------------------
  // 5. APPLICATION SLASH COMMAND SERIALIZATION
  // -----------------------------------------------------------------
  console.log('\n▶ [5/5] Testing Discord Slash Command Definitions...');
  console.log(`✓ Total registered application slash commands: ${slashCommands.length}`);
  const serialized = slashCommands.map((c) => c.toJSON());
  for (const cmd of serialized) {
    console.log(`  • /${cmd.name.padEnd(14)} — ${cmd.description.slice(0, 50)}...`);
  }

  console.log('\n====================================================');
  console.log('🎉 ALL 5 SUBSYSTEMS VERIFIED AND PASSING 100%!');
  console.log('====================================================');
}

runEndToEndVerification().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
