import { createCanvas, Image, GlobalFonts } from '@napi-rs/canvas';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

GlobalFonts.registerFromPath('assets/fonts/Inter.ttf', 'Inter');

export interface RichProfileData {
  displayName: string;
  destinyId: string;
  title: string;
  age: number;
  gender: string;
  seeking: string;
  genderVerified: boolean;
  tierName: string;
  level: number;
  currentXp: number;
  nextLevelXp: number;
  totalXp: number;
  coins: number;
  streakCount: number;
  streakMultiplier: string;
  matchesCount: number;
  chatHours: string;
  reputationScore: number;
  badges: Array<{ icon: string; name: string; color: string }>;
  interests: string[];
  languages: string[];
  timezone: string;
  avatarText?: string;
}

export function buildRichSvg(data: RichProfileData): string {
  const progressRatio = Math.min(1, Math.max(0, data.currentXp / data.nextLevelXp));
  const progressWidth = Math.round(896 * progressRatio);

  // Badges SVG pills
  let currentBadgeX = 0;
  const badgesSvg = data.badges.map((b) => {
    const x = currentBadgeX;
    const w = b.name.length * 8.5 + 40;
    currentBadgeX += w + 8;
    return `
      <g transform="translate(${x}, 0)">
        <rect width="${w}" height="24" rx="12" fill="${b.color}18" stroke="${b.color}55" stroke-width="1" />
        <text x="10" y="16" font-family="Segoe UI Emoji, Inter, sans-serif" font-size="12">${b.icon}</text>
        <text x="28" y="16" font-family="Inter, sans-serif" font-size="11" font-weight="600" fill="${b.color}">${b.name}</text>
      </g>
    `;
  }).join('');

  // Interests SVG pills
  let currentPillX = 0;
  const pillsSvg = data.interests.map((it) => {
    const x = currentPillX;
    const w = it.length * 8.5 + 24;
    currentPillX += w + 8;
    return `
      <g transform="translate(${x}, 0)">
        <rect width="${w}" height="26" rx="13" fill="#201726" stroke="#403047" stroke-width="1" />
        <text x="12" y="17" font-family="Segoe UI Emoji, Inter, sans-serif" font-size="12" fill="#bdacc9">${it}</text>
      </g>
    `;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="960" height="540" viewBox="0 0 960 540" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="clip-card">
      <rect x="1" y="1" width="958" height="538" rx="28" />
    </clipPath>
    <clipPath id="clip-avatar">
      <circle cx="52" cy="52" r="46" />
    </clipPath>
    <symbol id="star-shape" viewBox="0 0 24 24">
      <path d="M12 0 14.2 9.8 24 12 14.2 14.2 12 24 9.8 14.2 0 12 9.8 9.8Z" />
    </symbol>
  </defs>

  <!-- Outer Card Shell -->
  <rect x="1" y="1" width="958" height="538" rx="28" fill="#14131e" stroke="#403047" stroke-width="1.5" />

  <!-- ============================================================ -->
  <!-- HEADER ROW (Y: 28 to 150)                                    -->
  <!-- ============================================================ -->

  <!-- Left: Avatar (x: 36, y: 28) -->
  <g transform="translate(36, 28)">
    <circle cx="52" cy="52" r="51" fill="none" stroke="#f45cd6" stroke-width="2.5" />
    <circle cx="52" cy="52" r="46" fill="#28232f" />
    <text x="52" y="62" text-anchor="middle" font-family="Inter, sans-serif" font-weight="600" font-size="28" fill="#f4f6fa">${data.avatarText || 'CF'}</text>
    <!-- Verified Green Online Dot -->
    <circle cx="85" cy="85" r="9" fill="#14131e" />
    <circle cx="85" cy="85" r="7" fill="#10B981" />
  </g>

  <!-- Center Identity & Badges (x: 164, y: 24) -->
  <g transform="translate(164, 24)">
    <!-- Row 1: Name + Monospace ID Pill + Title -->
    <text x="0" y="32" font-family="Inter, sans-serif" font-size="34" font-weight="700" fill="#f4f6fa">${data.displayName}</text>
    
    <!-- ID Pill -->
    <g transform="translate(240, 10)">
      <rect width="96" height="24" rx="6" fill="#28232f" stroke="#403047" stroke-width="1" />
      <text x="48" y="16" text-anchor="middle" font-family="Consolas, monospace" font-size="12" font-weight="700" fill="#D8B4FE">${data.destinyId}</text>
    </g>

    <!-- Row 2: Demographic & Seeking Subtitle -->
    <g transform="translate(0, 56)">
      <path d="M10 2 17 6v7l-7 4-7-4V6Z" fill="#f45cd6" />
      <text x="26" y="14" font-family="Inter, sans-serif" font-size="18" font-weight="500" fill="#bdacc9">✦ ${data.title}  ·  Age ${data.age} · ${data.gender}  ·  Seeking: ${data.seeking}</text>
    </g>

    <!-- Row 3: Equipped Vanity Badges Showcase -->
    <g transform="translate(0, 84)">
      ${badgesSvg}
    </g>
  </g>

  <!-- Right: Tier Crest, Level & Total XP (x: 644, y: 18) -->
  <g transform="translate(644, 18)">
    <text x="0" y="36" font-family="Inter, sans-serif" font-size="22" font-weight="650" letter-spacing="0.8" fill="#f45cd6">${data.tierName.toUpperCase()} TIER</text>
    <text x="0" y="90" font-family="Inter, sans-serif" font-size="24" font-weight="650" fill="#bdacc9">LVL</text>
    <text x="56" y="92" font-family="Inter, sans-serif" font-size="56" font-weight="750" letter-spacing="-2" fill="#f4f6fa">${data.level}</text>
    <text x="0" y="118" font-family="Inter, sans-serif" font-size="18" font-weight="550" fill="#bdacc9">${data.totalXp.toLocaleString('en-US')} XP</text>
  </g>

  <!-- Far Right: Medallion Lotus Emblem -->
  <g transform="translate(832, 28)">
    <circle cx="48" cy="48" r="46" fill="#201726" stroke="#403047" stroke-width="1.5" />
    <g transform="translate(4, 4) scale(0.92)" fill="#b946b3">
      <path d="M 50,9 62,38 50,72 38,38 Z M 36,25 48,53 35,82 17,45 Z M 64,25 52,53 65,82 83,45 Z M 29,52 50,88 71,52 66,87 H 34 Z" />
    </g>
  </g>

  <!-- Horizontal Divider Line -->
  <path d="M32 154H928" stroke="#403047" stroke-width="1" />

  <!-- ============================================================ -->
  <!-- PROGRESS BAR ROW (Y: 168 to 216)                             -->
  <!-- ============================================================ -->
  <g transform="translate(32, 168)">
    <text x="0" y="18" font-family="Inter, sans-serif" font-size="18" font-weight="600" fill="#bdacc9">CONNECTION LEVEL PROGRESS</text>
    <text x="896" y="18" text-anchor="end" font-family="Inter, sans-serif" font-size="18" font-weight="600" fill="#f4f6fa">${data.currentXp.toLocaleString('en-US')} / ${data.nextLevelXp.toLocaleString('en-US')} XP (${Math.round(progressRatio * 100)}%)</text>
    <rect x="0" y="28" width="896" height="14" rx="7" fill="#282632" />
    <rect x="0" y="28" width="${progressWidth}" height="14" rx="7" fill="#b946b3" />
    <!-- Glossy reflection streak on progress bar -->
    <rect x="2" y="30" width="${Math.max(0, progressWidth - 4)}" height="4" rx="2" fill="#f45cd6" opacity="0.35" />
  </g>

  <!-- ============================================================ -->
  <!-- 4-METRIC GRID CARDS (Y: 232 to 348)                          -->
  <!-- ============================================================ -->
  <!-- Card 1: DESTINY COINS (x: 32, w: 212, h: 116) -->
  <g transform="translate(32, 232)">
    <rect width="212" height="116" rx="16" fill="#201726" stroke="#403047" stroke-width="1" />
    <rect x="0" y="14" width="4" height="88" rx="2" fill="#FBBF24" />
    <!-- Coin Icon -->
    <circle cx="28" cy="28" r="9" fill="none" stroke="#FBBF24" stroke-width="2" />
    <path d="M28 23v10M25 25h5a1 1 0 0 1 0 2h-3a1 1 0 0 0 0 2h4" stroke="#FBBF24" stroke-width="1.8" stroke-linecap="round" />
    <text x="46" y="32" font-family="Inter, sans-serif" font-size="14" font-weight="600" fill="#bdacc9">DESTINY COINS</text>
    <text x="18" y="76" font-family="Inter, sans-serif" font-size="34" font-weight="700" letter-spacing="-1" fill="#f4f6fa">${data.coins.toLocaleString('en-US')}</text>
    <text x="18" y="98" font-family="Inter, sans-serif" font-size="12" font-weight="500" fill="#FBBF24">Global Economy Vault</text>
  </g>

  <!-- Card 2: DAILY STREAK (x: 260, w: 212, h: 116) -->
  <g transform="translate(260, 232)">
    <rect width="212" height="116" rx="16" fill="#201726" stroke="#403047" stroke-width="1" />
    <rect x="0" y="14" width="4" height="88" rx="2" fill="#F97316" />
    <!-- Flame Icon -->
    <path d="M28 36c-5 0-8-3-8-7 0-5 5-9 6-11 1 2 2 4 4 4 1-2 2-3 4-5 3 4 5 7 5 10 0 5-5 9-11 9Z" fill="#F97316" />
    <text x="46" y="32" font-family="Inter, sans-serif" font-size="14" font-weight="600" fill="#bdacc9">DAILY STREAK</text>
    <text x="18" y="76" font-family="Inter, sans-serif" font-size="34" font-weight="700" letter-spacing="-1" fill="#f4f6fa">${data.streakCount} Days</text>
    <text x="18" y="98" font-family="Inter, sans-serif" font-size="12" font-weight="500" fill="#F97316">${data.streakMultiplier} Multiplier Active</text>
  </g>

  <!-- Card 3: MATCHES & TIME (x: 488, w: 212, h: 116) -->
  <g transform="translate(488, 232)">
    <rect width="212" height="116" rx="16" fill="#201726" stroke="#403047" stroke-width="1" />
    <rect x="0" y="14" width="4" height="88" rx="2" fill="#f45cd6" />
    <!-- Chat Icon -->
    <path d="M22 22h14a4 4 0 0 1 4 4v7a4 4 0 0 1-4 4h-8l-5 4v-4h-1a4 4 0 0 1-4-4v-7a4 4 0 0 1 4-4Z" fill="none" stroke="#f45cd6" stroke-width="2" />
    <text x="46" y="32" font-family="Inter, sans-serif" font-size="14" font-weight="600" fill="#bdacc9">MATCHES</text>
    <text x="18" y="76" font-family="Inter, sans-serif" font-size="34" font-weight="700" letter-spacing="-1" fill="#f4f6fa">${data.matchesCount}</text>
    <text x="18" y="98" font-family="Inter, sans-serif" font-size="12" font-weight="500" fill="#f45cd6">${data.chatHours} Talk Time</text>
  </g>

  <!-- Card 4: SAFETY & REPUTATION (x: 716, w: 212, h: 116) -->
  <g transform="translate(716, 232)">
    <rect width="212" height="116" rx="16" fill="#201726" stroke="#403047" stroke-width="1" />
    <rect x="0" y="14" width="4" height="88" rx="2" fill="#10B981" />
    <!-- Shield Icon -->
    <path d="M28 20 37 24v6c0 5-4 9-9 11-5-2-9-6-9-11v-6l9-4Z" fill="none" stroke="#10B981" stroke-width="2" />
    <path d="M25 30l2 2 5-5" stroke="#10B981" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round" />
    <text x="46" y="32" font-family="Inter, sans-serif" font-size="14" font-weight="600" fill="#bdacc9">REPUTATION</text>
    <text x="18" y="76" font-family="Inter, sans-serif" font-size="34" font-weight="700" letter-spacing="-1" fill="#f4f6fa">${data.reputationScore}%</text>
    <text x="18" y="98" font-family="Inter, sans-serif" font-size="12" font-weight="500" fill="#10B981">Verified Trust Score</text>
  </g>

  <!-- ============================================================ -->
  <!-- INTERESTS & LANGUAGES ROW (Y: 372 to 450)                    -->
  <!-- ============================================================ -->
  <g transform="translate(32, 372)">
    <!-- Inner Panel Container -->
    <rect width="896" height="74" rx="16" fill="#181324" stroke="#403047" stroke-width="1" />
    
    <!-- Left: Discovery Interests -->
    <g transform="translate(18, 14)">
      <text x="0" y="14" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#bdacc9" letter-spacing="0.5">DISCOVERY INTERESTS</text>
      <g transform="translate(0, 24)">
        ${pillsSvg}
      </g>
    </g>

    <!-- Right: Spoken Languages -->
    <g transform="translate(680, 14)">
      <text x="0" y="14" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#bdacc9" letter-spacing="0.5">SPOKEN LANGUAGES</text>
      <g transform="translate(0, 24)">
        <rect width="190" height="26" rx="13" fill="#201726" stroke="#403047" stroke-width="1" />
        <text x="14" y="17" font-family="Segoe UI Emoji, Inter, sans-serif" font-size="12" fill="#f4f6fa">🗣️ ${data.languages.join(', ')}</text>
      </g>
    </g>
  </g>

  <!-- ============================================================ -->
  <!-- FOOTER BRANDING & TIMEZONE (Y: 480 to 520)                   -->
  <!-- ============================================================ -->
  <path d="M32 468H928" stroke="#403047" stroke-width="1" />
  <g transform="translate(32, 502)">
    <!-- Small star -->
    <use href="#star-shape" x="0" y="-10" width="12" height="12" fill="#f45cd6" />
    <text x="20" y="0" font-family="Inter, sans-serif" font-size="16" font-weight="500" fill="#bdacc9">Destiny Anonymous Social · End-to-End Persona Masking Active</text>
    <text x="896" y="0" text-anchor="end" font-family="Inter, sans-serif" font-size="16" font-weight="500" fill="#bdacc9">Shard #0 · Node Asia · ${data.timezone}</text>
  </g>

  <!-- Ambient Sparkles -->
  <use href="#star-shape" x="40" y="140" width="12" height="12" fill="#f45cd6" opacity="0.8" />
  <use href="#star-shape" x="916" y="142" width="12" height="12" fill="#f45cd6" opacity="0.8" />
  <use href="#star-shape" x="618" y="80" width="10" height="10" fill="#f45cd6" opacity="0.7" />
  <use href="#star-shape" x="470" y="215" width="8" height="8" fill="#f45cd6" opacity="0.6" />
  <use href="#star-shape" x="20" y="360" width="9" height="9" fill="#f45cd6" opacity="0.6" />
  <use href="#star-shape" x="936" y="360" width="9" height="9" fill="#f45cd6" opacity="0.6" />
</svg>`;
}

// Generate the rich card
export async function renderRichCardPng(data: RichProfileData): Promise<Buffer> {
  const svg = buildRichSvg(data);
  const img = new Image();
  img.src = Buffer.from(svg);

  const canvas = createCanvas(960, 540);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  return canvas.toBuffer('image/png');
}

// Test runner
async function test() {
  const sample: RichProfileData = {
    displayName: 'Celestial Fox 🦊',
    destinyId: 'DST-7A9K2',
    title: 'Cosmic Soul',
    age: 22,
    gender: 'Female',
    seeking: 'Any Gender',
    genderVerified: true,
    tierName: 'Destiny',
    level: 42,
    currentXp: 7450,
    nextLevelXp: 10000,
    totalXp: 388926,
    coins: 2850,
    streakCount: 14,
    streakMultiplier: '2.0x',
    matchesCount: 68,
    chatHours: '42h 15m',
    reputationScore: 100,
    badges: [
      { icon: '👑', name: 'Destiny VIP', color: '#FBBF24' },
      { icon: '⭐', name: 'Star Wanderer', color: '#60A5FA' },
      { icon: '🔮', name: 'Mystic Aura', color: '#C084FC' },
      { icon: '✓', name: 'Voice Verified', color: '#34D399' }
    ],
    interests: ['🎮 Gaming', '🎵 Lo-Fi Music', '🌌 Astronomy', '☕ Deep Talks', '💻 Tech'],
    languages: ['English', 'Hindi'],
    timezone: 'UTC+05:30',
    avatarText: '🦊'
  };

  const buffer = await renderRichCardPng(sample);
  const outPath = path.resolve('C:/Users/basud/.gemini/antigravity/brain/941dc802-7f14-46db-9ac4-519acb6709dc/destiny_rich_profile.png');
  fs.writeFileSync(outPath, buffer);
  console.log('Successfully generated rich Destiny card at', outPath);
}

test();
