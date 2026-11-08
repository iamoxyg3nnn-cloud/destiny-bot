import { createCanvas, Image, GlobalFonts } from '@napi-rs/canvas';
import * as fs from 'fs';
import * as path from 'path';

// Register the authentic Inter font
GlobalFonts.registerFromPath('assets/fonts/Inter.ttf', 'Inter');

export interface DestinyProfileData {
  displayName: string;
  destinyId: string;
  age: number;
  gender: string;
  tierName: string;
  level: number;
  currentXp: number;
  nextLevelXp: number;
  totalXp: number;
  coins: number;
  sessionsCount: number;
  reputationText: string;
  avatarText?: string;
  avatarUrl?: string;
  timezone?: string;
}

export function buildDestinySvg(data: DestinyProfileData): string {
  const progressRatio = Math.min(1, Math.max(0, data.currentXp / data.nextLevelXp));
  const progressWidth = Math.round(896 * progressRatio);

  // Coin vector path (24x24 stroke icon)
  const coinIconSvg = `
    <circle cx="15" cy="15" r="12" />
    <path d="M15 8v14M11 11h7a2 2 0 0 1 0 4h-6a2 2 0 0 0 0 4h7" />
  `;

  // Sessions '#' path
  const hashIconSvg = `
    <path d="m12 2-5 29m17-29-5 29M2 12h29M0 23h29" />
  `;

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg
   width="960"
   height="480"
   viewBox="0 0 960 480"
   version="1.1"
   xmlns="http://www.w3.org/2000/svg"
   xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <clipPath id="clip-card">
      <rect x="1" y="1" width="958" height="478" rx="28" />
    </clipPath>
    <clipPath id="clip-avatar">
      <circle cx="52" cy="52" r="46" />
    </clipPath>
    <symbol id="star-shape" viewBox="0 0 24 24">
      <path d="M12 0 14.2 9.8 24 12 14.2 14.2 12 24 9.8 14.2 0 12 9.8 9.8Z" />
    </symbol>
  </defs>

  <g id="card-shell-layer">
    <!-- Outer Card Shell -->
    <rect
       id="card-shell"
       x="1"
       y="1"
       width="958"
       height="478"
       rx="28"
       fill="#14131e"
       stroke="#403047"
       stroke-width="1.5" />

    <!-- Avatar Placement -->
    <g id="avatar-placement" transform="translate(36, 32)">
      <circle
         id="avatar-outline"
         cx="52"
         cy="52"
         r="51"
         fill="none"
         stroke="#f45cd6"
         stroke-width="2.5" />
      <circle
         cx="52"
         cy="52"
         r="46"
         fill="#28232f" />
      <text
         id="avatar-fallback"
         x="52"
         y="62"
         text-anchor="middle"
         font-family="Inter, system-ui, sans-serif"
         font-weight="600"
         font-size="28"
         fill="#f4f6fa">${data.avatarText || 'CF'}</text>
    </g>

    <!-- Identity Info (Name & Destiny ID) -->
    <g id="identity-placement" transform="translate(164, 0)">
      <text
         id="display-name"
         x="0"
         y="75"
         font-family="Inter, system-ui, sans-serif"
         font-size="38"
         font-weight="700"
         fill="#f4f6fa">${data.displayName}</text>
      <g id="sub-placement" transform="translate(0, 98)">
        <!-- Hexagon Badge Icon -->
        <path
           d="M13 4 21 9v8l-8 5-8-5V9Z"
           fill="#f45cd6" />
        <text
           id="sub-name"
           x="37"
           y="22"
           font-family="Inter, system-ui, sans-serif"
           font-size="25"
           font-weight="500"
           fill="#bdacc9">${data.destinyId} · Age ${data.age} · ${data.gender}</text>
      </g>
    </g>

    <!-- Rank & Level (Right Header) -->
    <g id="rank-placement" transform="translate(644, 0)">
      <text
         id="tier-name"
         x="0"
         y="53"
         font-family="Inter, system-ui, sans-serif"
         font-size="23"
         font-weight="650"
         letter-spacing="0.8"
         fill="#f45cd6">${data.tierName.toUpperCase()}</text>
      <text
         id="level-prefix"
         x="0"
         y="112"
         font-family="Inter, system-ui, sans-serif"
         font-size="26"
         font-weight="650"
         fill="#bdacc9">LVL</text>
      <text
         id="level-value"
         x="60"
         y="114"
         font-family="Inter, system-ui, sans-serif"
         font-size="62"
         font-weight="750"
         letter-spacing="-2"
         fill="#f4f6fa">${data.level}</text>
      <text
         id="total-xp"
         x="0"
         y="142"
         font-family="Inter, system-ui, sans-serif"
         font-size="20"
         font-weight="550"
         fill="#bdacc9">${data.totalXp.toLocaleString()} XP</text>
    </g>

    <!-- Lotus / Star Emblem (Far Right) -->
    <g id="emblem-placement" transform="translate(829, 35)">
      <rect width="96" height="96" fill="none" />
      <g transform="scale(0.96)" fill="#b946b3">
        <path d="M 50,9 62,38 50,72 38,38 Z M 36,25 48,53 35,82 17,45 Z M 64,25 52,53 65,82 83,45 Z M 29,52 50,88 71,52 66,87 H 34 Z" />
      </g>
    </g>

    <!-- Horizontal Divider -->
    <path d="M32 163H928" stroke="#403047" stroke-width="1" />

    <!-- Connection Progress Bar -->
    <g id="progress-placement">
      <text
         x="32"
         y="196"
         font-family="Inter, system-ui, sans-serif"
         font-size="22"
         font-weight="600"
         fill="#bdacc9">CONNECTION PROGRESS</text>
      <text
         id="progress-label"
         x="928"
         y="196"
         text-anchor="end"
         font-family="Inter, system-ui, sans-serif"
         font-size="21"
         font-weight="600"
         fill="#f4f6fa">${data.currentXp.toLocaleString()} / ${data.nextLevelXp.toLocaleString()} XP</text>
      <rect
         id="progress-track"
         x="32"
         y="216"
         width="896"
         height="16"
         rx="8"
         fill="#282632" />
      <rect
         id="progress-fill"
         x="32"
         y="216"
         width="${progressWidth}"
         height="16"
         rx="8"
         fill="#b946b3" />
    </g>

    <!-- Panel 1: DESTINY COINS (Left wide panel) -->
    <g id="coins-placement" transform="translate(32, 262)">
      <rect
         width="548"
         height="146"
         rx="18"
         fill="#201726"
         stroke="#403047"
         stroke-width="1" />
      <g
         transform="translate(23, 23)"
         fill="none"
         stroke="#f45cd6"
         stroke-width="2.4"
         stroke-linecap="round"
         stroke-linejoin="round">
        ${coinIconSvg}
      </g>
      <text
         x="71"
         y="48"
         font-family="Inter, system-ui, sans-serif"
         font-size="24"
         font-weight="600"
         fill="#bdacc9">DESTINY COINS</text>
      <text
         id="coins-value"
         x="23"
         y="117"
         font-family="Inter, system-ui, sans-serif"
         font-size="62"
         font-weight="700"
         letter-spacing="-1.5"
         fill="#f4f6fa">${data.coins.toLocaleString()} DC</text>
    </g>

    <!-- Panel 2: SESSIONS (Right panel) -->
    <g id="sessions-placement" transform="translate(596, 262)">
      <rect
         width="332"
         height="146"
         rx="18"
         fill="#201726"
         stroke="#403047"
         stroke-width="1" />
      <g
         transform="translate(23, 23)"
         fill="none"
         stroke="#f45cd6"
         stroke-width="2.4"
         stroke-linecap="round">
        ${hashIconSvg}
      </g>
      <text
         x="71"
         y="48"
         font-family="Inter, system-ui, sans-serif"
         font-size="24"
         font-weight="600"
         fill="#bdacc9">SESSIONS</text>
      <text
         id="sessions-value"
         x="23"
         y="117"
         font-family="Inter, system-ui, sans-serif"
         font-size="62"
         font-weight="700"
         letter-spacing="-1.5"
         fill="#f4f6fa">${data.sessionsCount}</text>
    </g>

    <!-- Footer Text -->
    <text
       id="scope-label"
       x="32"
       y="448"
       font-family="Inter, system-ui, sans-serif"
       font-size="20"
       font-weight="500"
       fill="#bdacc9">${data.reputationText}</text>
    <text
       id="timezone-label"
       x="928"
       y="448"
       text-anchor="end"
       font-family="Inter, system-ui, sans-serif"
       font-size="20"
       font-weight="500"
       fill="#bdacc9">${data.timezone || 'UTC'}</text>

    <!-- Sparkle Stars -->
    <use xlink:href="#star-shape" x="39" y="242" width="14" height="14" fill="#f45cd6" opacity="0.9" />
    <use xlink:href="#star-shape" x="920" y="244" width="13" height="13" fill="#f45cd6" opacity="0.9" />
    <use xlink:href="#star-shape" x="618" y="120" width="10" height="10" fill="#f45cd6" opacity="0.75" />
    <use xlink:href="#star-shape" x="467" y="247" width="9" height="9" fill="#f45cd6" opacity="0.8" />
    <use xlink:href="#star-shape" x="776" y="420" width="10" height="10" fill="#f45cd6" opacity="0.8" />
    <use xlink:href="#star-shape" x="254" y="42" width="8" height="8" fill="#f45cd6" opacity="0.7" />
    <use xlink:href="#star-shape" x="515" y="55" width="8" height="8" fill="#f45cd6" opacity="0.75" />
    <use xlink:href="#star-shape" x="21" y="422" width="9" height="9" fill="#f45cd6" opacity="0.7" />
    <use xlink:href="#star-shape" x="940" y="432" width="9" height="9" fill="#f45cd6" opacity="0.7" />
    <use xlink:href="#star-shape" x="156" y="318" width="7" height="7" fill="#f45cd6" opacity="0.6" />
    <use xlink:href="#star-shape" x="874" y="35" width="8" height="8" fill="#f45cd6" opacity="0.85" />
  </g>
</svg>`;
}

export function renderCardPng(data: DestinyProfileData): Buffer {
  const svg = buildDestinySvg(data);
  const img = new Image();
  img.src = Buffer.from(svg);

  const canvas = createCanvas(960, 480);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  return canvas.toBuffer('image/png');
}

// Generate the card!
const sample: DestinyProfileData = {
  displayName: 'Celestial Fox',
  destinyId: 'DST-7A9K2',
  age: 22,
  gender: 'Female',
  tierName: 'Mythic',
  level: 40,
  currentXp: 4776,
  nextLevelXp: 17850,
  totalXp: 388926,
  coins: 2850,
  sessionsCount: 80,
  reputationText: 'Destiny Anonymous Social · 100% Reputation Rating',
  avatarText: 'CF',
  timezone: 'UTC'
};

const buffer = renderCardPng(sample);
const outPath = path.resolve('C:/Users/basud/.gemini/antigravity/brain/941dc802-7f14-46db-9ac4-519acb6709dc/destiny_authentic_card.png');
fs.writeFileSync(outPath, buffer);
console.log('Successfully generated authentic Destiny profile card at', outPath);
