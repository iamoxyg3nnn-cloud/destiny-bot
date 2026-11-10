import { db } from '../src/database/supabase.js';
import { profileCardGenerator } from '../src/core/profile/card-generator.js';
import * as fs from 'fs';
import * as path from 'path';

async function testIntegration() {
  console.log('--- TESTING PROFILE INTEGRATION ---');

  // 1. Fetch real user from Supabase
  const targetDiscordId = '999598324434866196';
  const user = await db.getUserByDiscordId(targetDiscordId);
  if (!user) {
    throw new Error(`User with Discord ID ${targetDiscordId} not found in database!`);
  }
  console.log(`✓ Fetched real user from Supabase: ${user.destinyId} (Coins: ${user.destinyCoins}, Streak: ${user.streakCount}, Tier: ${user.connectionTier})`);

  // 2. Fetch real user rooms
  const userRooms = await db.getUserRooms(user.id);
  console.log(`✓ Fetched ${userRooms.length} completed match rooms for user.`);

  let totalMinutes = 0;
  for (const r of userRooms) {
    if (r.startedAt && r.endedAt) {
      const diff = (new Date(r.endedAt).getTime() - new Date(r.startedAt).getTime()) / 60000;
      if (diff > 0) totalMinutes += diff;
    }
  }
  const hours = Math.floor(totalMinutes / 60);
  const mins = Math.floor(totalMinutes % 60);
  const chatHoursText = hours > 0 || mins > 0 ? `${hours}h ${mins}m` : '0h 00m';

  const stats = {
    sessionsCount: userRooms.length,
    chatHoursText,
    reputationPercent: user.reputationScore ?? 100,
    personaName: 'Midnight Wolf',
    timezone: 'UTC+05:30',
  };

  // 3. Generate static card PNG
  console.log('Rendering static PNG card...');
  const t0 = Date.now();
  const pngBuf = await profileCardGenerator.generateCardPng(user, stats);
  const pngTime = Date.now() - t0;
  console.log(`✓ Static PNG rendered in ${pngTime}ms (${pngBuf.length} bytes)`);

  const outPngPath = path.resolve('destiny_test_card.png');
  fs.writeFileSync(outPngPath, pngBuf);

  console.log('--- ALL INTEGRATION TESTS PASSED! ---');
  process.exit(0);
}

testIntegration().catch((err) => {
  console.error('Integration test failed:', err);
  process.exit(1);
});
