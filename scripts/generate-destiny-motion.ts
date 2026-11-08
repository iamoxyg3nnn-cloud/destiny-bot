import { createCanvas, Image, GlobalFonts } from '@napi-rs/canvas';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

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
  timezone?: string;
}

// Generate base static SVG
export function getBaseSvg(data: DestinyProfileData): string {
  const progressRatio = Math.min(1, Math.max(0, data.currentXp / data.nextLevelXp));
  const progressWidth = Math.round(896 * progressRatio);

  const coinIconSvg = `
    <circle cx="15" cy="15" r="11" />
    <path d="M15 9v12M11.5 12h5a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h5" />
  `;

  const hashIconSvg = `
    <path d="m12 2-5 29m17-29-5 29M2 12h29M0 23h29" />
  `;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="960" height="480" viewBox="0 0 960 480" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="clip-avatar">
      <circle cx="52" cy="52" r="46" />
    </clipPath>
    <clipPath id="clip-card">
      <rect x="1" y="1" width="958" height="478" rx="28" />
    </clipPath>
  </defs>

  <!-- Card Shell -->
  <rect x="1" y="1" width="958" height="478" rx="28" fill="#14131e" stroke="#403047" stroke-width="1.5" />

  <!-- Avatar Placement -->
  <g transform="translate(36, 32)">
    <circle cx="52" cy="52" r="51" fill="none" stroke="#f45cd6" stroke-width="2.5" />
    <circle cx="52" cy="52" r="46" fill="#28232f" />
    <!-- Gradient Avatar Background with Initials -->
    <text x="52" y="62" text-anchor="middle" font-family="Inter, sans-serif" font-weight="600" font-size="28" fill="#f4f6fa">${data.avatarText || 'CF'}</text>
  </g>

  <!-- Identity Placement -->
  <g transform="translate(164, 0)">
    <text x="0" y="75" font-family="Inter, sans-serif" font-size="38" font-weight="700" fill="#f4f6fa">${data.displayName}</text>
    <g transform="translate(0, 98)">
      <path d="M13 4 21 9v8l-8 5-8-5V9Z" fill="#f45cd6" />
      <text x="37" y="22" font-family="Inter, sans-serif" font-size="25" font-weight="500" fill="#bdacc9">${data.destinyId} · Age ${data.age} · ${data.gender}</text>
    </g>
  </g>

  <!-- Rank & Level Placement -->
  <g transform="translate(644, 0)">
    <text x="0" y="53" font-family="Inter, sans-serif" font-size="23" font-weight="650" letter-spacing="0.8" fill="#f45cd6">${data.tierName.toUpperCase()}</text>
    <text x="0" y="112" font-family="Inter, sans-serif" font-size="26" font-weight="650" fill="#bdacc9">LVL</text>
    <text x="60" y="114" font-family="Inter, sans-serif" font-size="62" font-weight="750" letter-spacing="-2" fill="#f4f6fa">${data.level}</text>
    <text x="0" y="142" font-family="Inter, sans-serif" font-size="20" font-weight="550" fill="#bdacc9">${data.totalXp.toLocaleString('en-US')} XP</text>
  </g>

  <!-- Emblem Placement with circular frame -->
  <g transform="translate(829, 35)">
    <!-- Medallion circle frame -->
    <circle cx="48" cy="48" r="48" fill="#201726" stroke="#403047" stroke-width="1.5" />
    <g transform="scale(0.96)" fill="#b946b3">
      <path d="M 50,9 62,38 50,72 38,38 Z M 36,25 48,53 35,82 17,45 Z M 64,25 52,53 65,82 83,45 Z M 29,52 50,88 71,52 66,87 H 34 Z" />
    </g>
  </g>

  <!-- Horizontal Divider -->
  <path d="M32 163H928" stroke="#403047" stroke-width="1" />

  <!-- Progress Bar Placement -->
  <g id="progress-group">
    <text x="32" y="196" font-family="Inter, sans-serif" font-size="22" font-weight="600" fill="#bdacc9">CONNECTION PROGRESS</text>
    <text x="928" y="196" text-anchor="end" font-family="Inter, sans-serif" font-size="21" font-weight="600" fill="#f4f6fa">${data.currentXp.toLocaleString('en-US')} / ${data.nextLevelXp.toLocaleString('en-US')} XP</text>
    <rect x="32" y="216" width="896" height="16" rx="8" fill="#282632" />
    <rect x="32" y="216" width="${progressWidth}" height="16" rx="8" fill="#b946b3" />
    <!-- Static glossy highlight on progress bar -->
    <rect x="34" y="218" width="${Math.max(0, progressWidth - 4)}" height="5" rx="2.5" fill="#f45cd6" opacity="0.35" />
  </g>

  <!-- Left Panel: DESTINY COINS -->
  <g transform="translate(32, 262)">
    <rect width="548" height="146" rx="18" fill="#201726" stroke="#403047" stroke-width="1" />
    <g transform="translate(23, 23)" fill="none" stroke="#f45cd6" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      ${coinIconSvg}
    </g>
    <text x="71" y="48" font-family="Inter, sans-serif" font-size="24" font-weight="600" fill="#bdacc9">DESTINY COINS</text>
    <text x="23" y="117" font-family="Inter, sans-serif" font-size="62" font-weight="700" letter-spacing="-1.5" fill="#f4f6fa">${data.coins.toLocaleString('en-US')} DC</text>
  </g>

  <!-- Right Panel: SESSIONS -->
  <g transform="translate(596, 262)">
    <rect width="332" height="146" rx="18" fill="#201726" stroke="#403047" stroke-width="1" />
    <g transform="translate(23, 23)" fill="none" stroke="#f45cd6" stroke-width="2.4" stroke-linecap="round">
      ${hashIconSvg}
    </g>
    <text x="71" y="48" font-family="Inter, sans-serif" font-size="24" font-weight="600" fill="#bdacc9">SESSIONS</text>
    <text x="23" y="117" font-family="Inter, sans-serif" font-size="62" font-weight="700" letter-spacing="-1.5" fill="#f4f6fa">${data.sessionsCount}</text>
  </g>

  <!-- Footer -->
  <text x="32" y="448" font-family="Inter, sans-serif" font-size="20" font-weight="500" fill="#bdacc9">${data.reputationText}</text>
  <text x="928" y="448" text-anchor="end" font-family="Inter, sans-serif" font-size="20" font-weight="500" fill="#bdacc9">${data.timezone || 'UTC'}</text>
</svg>`;
}

// Compute rounded path perimeter for border light beam
function getRoundedPoints(w: number, h: number, r: number, count: number): Array<[number, number]> {
  const straightX = w - 2 * r;
  const straightY = h - 2 * r;
  const arc = (Math.PI * r) / 2;
  const total = straightX * 2 + straightY * 2 + arc * 4;
  const points: Array<[number, number]> = [];

  for (let i = 0; i < count; i++) {
    const dist = (total * i) / count;
    let d = dist;

    // Segment 1: top straight (x: r -> w-r, y: 0)
    if (d < straightX) {
      points.push([r + d, 0]);
      continue;
    }
    d -= straightX;

    // Segment 2: top-right corner
    if (d < arc) {
      const angle = -Math.PI / 2 + d / r;
      points.push([w - r + r * Math.cos(angle), r + r * Math.sin(angle)]);
      continue;
    }
    d -= arc;

    // Segment 3: right straight (x: w, y: r -> h-r)
    if (d < straightY) {
      points.push([w, r + d]);
      continue;
    }
    d -= straightY;

    // Segment 4: bottom-right corner
    if (d < arc) {
      const angle = 0 + d / r;
      points.push([w - r + r * Math.cos(angle), h - r + r * Math.sin(angle)]);
      continue;
    }
    d -= arc;

    // Segment 5: bottom straight (x: w-r -> r, y: h)
    if (d < straightX) {
      points.push([w - r - d, h]);
      continue;
    }
    d -= straightX;

    // Segment 6: bottom-left corner
    if (d < arc) {
      const angle = Math.PI / 2 + d / r;
      points.push([r + r * Math.cos(angle), h - r + r * Math.sin(angle)]);
      continue;
    }
    d -= arc;

    // Segment 7: left straight (x: 0, y: h-r -> r)
    if (d < straightY) {
      points.push([0, h - r - d]);
      continue;
    }
    d -= straightY;

    // Segment 8: top-left corner
    const angle = Math.PI + d / r;
    points.push([r + r * Math.cos(angle), r + r * Math.sin(angle)]);
  }

  return points;
}

// Generate animated WebP with 40 frames (2.0s looping animation at 20 FPS)
export async function renderDestinyMotionWebp(data: DestinyProfileData): Promise<Buffer> {
  const width = 960;
  const height = 480;
  const numFrames = 40;

  const baseSvg = getBaseSvg(data);
  const baseImg = new Image();
  baseImg.src = Buffer.from(baseSvg);

  // Precompute border path
  const borderPoints = getRoundedPoints(width - 2, height - 2, 28, 400);

  // Big vertical canvas holding all frames
  const canvas = createCanvas(width, height * numFrames);
  const ctx = canvas.getContext('2d');

  // Star anchors and offsets
  const stars: Array<{ x: number; y: number; s: number; offset: number }> = [
    { x: 39, y: 242, s: 7, offset: 0.0 },
    { x: 920, y: 244, s: 6.5, offset: 0.17 },
    { x: 618, y: 120, s: 5, offset: 0.35 },
    { x: 467, y: 247, s: 4.5, offset: 0.52 },
    { x: 776, y: 420, s: 5, offset: 0.69 },
    { x: 254, y: 42, s: 4, offset: 0.8 },
    { x: 515, y: 55, s: 4, offset: 0.25 },
    { x: 21, y: 422, s: 4.5, offset: 0.6 },
    { x: 940, y: 432, s: 4.5, offset: 0.4 },
    { x: 156, y: 318, s: 3.5, offset: 0.1 },
    { x: 874, y: 35, s: 4, offset: 0.9 },
  ];

  const progressRatio = Math.min(1, Math.max(0, data.currentXp / data.nextLevelXp));
  const progressWidth = Math.round(896 * progressRatio);

  for (let f = 0; f < numFrames; f++) {
    const frameY = f * height;
    const phase = f / numFrames;

    // 1. Draw base card
    ctx.drawImage(baseImg, 0, frameY);

    // 2. Draw moving border light pulse
    const beamLength = 45;
    const startIndex = Math.floor(borderPoints.length * phase) % borderPoints.length;

    ctx.save();
    ctx.translate(1, frameY + 1);
    ctx.beginPath();
    for (let i = 0; i < beamLength; i++) {
      const idx = (startIndex + i) % borderPoints.length;
      const [px, py] = borderPoints[idx];
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    const pulseGrad = ctx.createLinearGradient(
      borderPoints[startIndex][0], borderPoints[startIndex][1],
      borderPoints[(startIndex + beamLength) % borderPoints.length][0], borderPoints[(startIndex + beamLength) % borderPoints.length][1]
    );
    pulseGrad.addColorStop(0, 'rgba(244, 92, 214, 0)');
    pulseGrad.addColorStop(0.5, '#f45cd6');
    pulseGrad.addColorStop(1, 'rgba(244, 92, 214, 0)');
    ctx.strokeStyle = pulseGrad;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // 3. Draw Orbiting Diamond Satellite around Emblem
    // Emblem center is at (877, 83)
    const emblemCenterX = 877;
    const emblemCenterY = frameY + 83;
    const orbitRadius = 52;
    const satAngle = 2 * Math.PI * phase;
    const satX = emblemCenterX + orbitRadius * Math.cos(satAngle);
    const satY = emblemCenterY + orbitRadius * Math.sin(satAngle);

    // Draw satellite diamond
    ctx.save();
    ctx.translate(satX, satY);
    ctx.rotate(satAngle + Math.PI / 4);
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = '#f45cd6';
    ctx.shadowBlur = 6;
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();

    // 4. Draw Orbiting Satellite around Avatar (counter-clockwise)
    const avatarCenterX = 88;
    const avatarCenterY = frameY + 84;
    const avOrbitR = 53;
    const avAngle = -2 * Math.PI * phase;
    const avSatX = avatarCenterX + avOrbitR * Math.cos(avAngle);
    const avSatY = avatarCenterY + avOrbitR * Math.sin(avAngle);

    ctx.save();
    ctx.translate(avSatX, avSatY);
    ctx.rotate(avAngle + Math.PI / 4);
    ctx.fillStyle = '#f45cd6';
    ctx.shadowColor = '#f45cd6';
    ctx.shadowBlur = 6;
    ctx.fillRect(-2.5, -2.5, 5, 5);
    ctx.restore();

    // 5. Draw Progress Bar Sliding Packet
    if (progressWidth > 40) {
      const packetW = 60;
      const travelDist = progressWidth - packetW;
      const packetPhase = 0.5 + 0.5 * Math.sin(2 * Math.PI * phase);
      const packetX = 32 + travelDist * packetPhase;

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(packetX, frameY + 216, packetW, 16, 8);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.fill();
      ctx.restore();
    }

    // 6. Draw Twinkling Stars
    for (const st of stars) {
      const starSignal = 0.35 + 0.65 * Math.max(0, Math.sin(2 * Math.PI * (phase * 2 + st.offset)));
      if (starSignal > 0.4) {
        ctx.save();
        ctx.translate(st.x, frameY + st.y);
        ctx.fillStyle = '#f45cd6';
        ctx.globalAlpha = starSignal;
        // 4-point star
        ctx.beginPath();
        ctx.moveTo(0, -st.s);
        ctx.quadraticCurveTo(0, 0, st.s, 0);
        ctx.quadraticCurveTo(0, 0, 0, st.s);
        ctx.quadraticCurveTo(0, 0, -st.s, 0);
        ctx.quadraticCurveTo(0, 0, 0, -st.s);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // Convert raw vertical strip into animated WebP via Sharp
  const rawData = canvas.data();
  const webpBuffer = await sharp(rawData, {
    raw: {
      width,
      height: height * numFrames,
      channels: 4,
      pageHeight: height
    }
  })
    .webp({
      quality: 90,
      lossless: false,
      effort: 4,
      loop: 0,
      delay: 50 // 50ms per frame = 20 FPS
    })
    .toBuffer();

  return webpBuffer;
}

// Generate the animated WebP
async function run() {
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

  console.log('Rendering animated Destiny profile card (40 frames @ 20 FPS)...');
  const start = Date.now();
  const buffer = await renderDestinyMotionWebp(sample);
  const outPath = path.resolve('C:/Users/basud/.gemini/antigravity/brain/941dc802-7f14-46db-9ac4-519acb6709dc/destiny_profile_motion.webp');
  fs.writeFileSync(outPath, buffer);
  console.log(`Generated animated WebP in ${Date.now() - start}ms: ${outPath} (${buffer.length} bytes)`);

  // Also save a frame 0 high-res static PNG
  const svg = getBaseSvg(sample);
  const img = new Image();
  img.src = Buffer.from(svg);
  const sc = createCanvas(960, 480);
  sc.getContext('2d').drawImage(img, 0, 0);
  const pngPath = path.resolve('C:/Users/basud/.gemini/antigravity/brain/941dc802-7f14-46db-9ac4-519acb6709dc/destiny_profile_perfect.png');
  fs.writeFileSync(pngPath, sc.toBuffer('image/png'));
  console.log(`Saved static PNG to ${pngPath}`);
}

run();
