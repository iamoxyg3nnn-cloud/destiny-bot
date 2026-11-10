import { createCanvas, GlobalFonts, Path2D } from '@napi-rs/canvas';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

GlobalFonts.registerFromPath('assets/fonts/Inter.ttf', 'Inter');

export interface RichCardData {
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
  avatarInitials: string;
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

    // Segment 1: top straight
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

    // Segment 3: right straight
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

    // Segment 5: bottom straight
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

    // Segment 7: left straight
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

export function drawRichFrame(ctx: any, data: RichCardData, width: number, height: number, frameY: number = 0, phase: number = 0) {
  function roundRect(x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.roundRect(x, y + frameY, w, h, r);
    ctx.closePath();
  }

  // Draw 4-point sparkle star
  function drawSparkle(x: number, y: number, r: number, color: string, alpha: number = 0.8) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y + frameY - r);
    ctx.quadraticCurveTo(x, y + frameY, x + r, y + frameY);
    ctx.quadraticCurveTo(x, y + frameY, x, y + frameY + r);
    ctx.quadraticCurveTo(x, y + frameY, x - r, y + frameY);
    ctx.quadraticCurveTo(x, y + frameY, x, y + frameY - r);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 1. BASE BACKGROUND & SHELL
  ctx.save();
  roundRect(1, 1, width - 2, height - 2, 28);
  ctx.clip();

  // Dark obsidian/violet gradient
  const bgGrad = ctx.createLinearGradient(0, frameY, width, frameY + height);
  bgGrad.addColorStop(0, '#15121f');
  bgGrad.addColorStop(0.5, '#110f1a');
  bgGrad.addColorStop(1, '#0a0811');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, frameY, width, height);

  // Subtle ambient radial glow behind avatar
  const avatarGlow = ctx.createRadialGradient(88, frameY + 80, 10, 88, frameY + 80, 160);
  avatarGlow.addColorStop(0, 'rgba(244, 92, 214, 0.16)');
  avatarGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = avatarGlow;
  ctx.fillRect(0, frameY, width, height);

  // Subtle ambient glow behind emblem
  const emblemGlow = ctx.createRadialGradient(880, frameY + 75, 10, 880, frameY + 75, 160);
  emblemGlow.addColorStop(0, 'rgba(185, 70, 179, 0.2)');
  emblemGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = emblemGlow;
  ctx.fillRect(0, frameY, width, height);

  // Twinkling stars with periodic phase
  const starsList = [
    { x: 42, y: 145, r: 6, offset: 0.0 },
    { x: 918, y: 148, r: 6.5, offset: 0.17 },
    { x: 610, y: 130, r: 4.5, offset: 0.35 },
    { x: 470, y: 220, r: 4, offset: 0.52 },
    { x: 22, y: 355, r: 4.5, offset: 0.65 },
    { x: 938, y: 355, r: 4.5, offset: 0.4 },
    { x: 885, y: 30, r: 4, offset: 0.8 },
  ];
  for (const st of starsList) {
    const starAlpha = 0.35 + 0.65 * Math.max(0, Math.sin(2 * Math.PI * (phase * 2 + st.offset)));
    drawSparkle(st.x, st.y, st.r, '#f45cd6', starAlpha);
  }
  ctx.restore();

  // Outer border
  roundRect(1, 1, width - 2, height - 2, 28);
  ctx.strokeStyle = '#403047';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // -------------------------------------------------------------
  // HEADER: AVATAR (x: 36, y: 28)
  // -------------------------------------------------------------
  const avX = 36;
  const avY = 28 + frameY;
  const avR = 46;

  // Outer bright outline
  ctx.beginPath();
  ctx.arc(avX + 46, avY + 46, avR + 5, 0, Math.PI * 2);
  ctx.strokeStyle = '#f45cd6';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Inner avatar disc
  ctx.beginPath();
  ctx.arc(avX + 46, avY + 46, avR, 0, Math.PI * 2);
  ctx.fillStyle = '#28232f';
  ctx.fill();

  // Initials / Persona
  ctx.font = 'bold 30px "Inter", sans-serif';
  ctx.fillStyle = '#f4f6fa';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(data.avatarInitials, avX + 46, avY + 47);

  // Online / Verified Emerald Dot
  ctx.beginPath();
  ctx.arc(avX + 80, avY + 80, 9, 0, Math.PI * 2);
  ctx.fillStyle = '#14131e';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(avX + 80, avY + 80, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#10B981';
  ctx.fill();

  // -------------------------------------------------------------
  // HEADER: IDENTITY & BADGES (x: 154, y: 24)
  // -------------------------------------------------------------
  const idX = 154;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Row 1: Name
  ctx.font = 'bold 32px "Inter", sans-serif';
  ctx.fillStyle = '#f4f6fa';
  ctx.fillText(data.displayName, idX, frameY + 58);

  const nameW = ctx.measureText(data.displayName).width;

  // ID Pill next to name
  const pillX = idX + nameW + 12;
  const pillY = 38;
  const pillW = 92;
  const pillH = 24;
  roundRect(pillX, pillY, pillW, pillH, 6);
  ctx.fillStyle = '#28232f';
  ctx.fill();
  ctx.strokeStyle = '#403047';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.font = 'bold 12px "Consolas", monospace';
  ctx.fillStyle = '#D8B4FE';
  ctx.textAlign = 'center';
  ctx.fillText(data.destinyId, pillX + pillW / 2, frameY + pillY + 16);

  // Row 2: Subtitle (Hexagon + Title + Demographics)
  ctx.textAlign = 'left';
  const subY = 86;
  // Hexagon mark
  ctx.save();
  ctx.translate(idX, frameY + subY - 14);
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(15, 4);
  ctx.lineTo(15, 12);
  ctx.lineTo(8, 16);
  ctx.lineTo(1, 12);
  ctx.lineTo(1, 4);
  ctx.closePath();
  ctx.fillStyle = '#f45cd6';
  ctx.fill();
  ctx.restore();

  ctx.font = '500 17px "Inter", sans-serif';
  ctx.fillStyle = '#bdacc9';
  const subText = `${data.title}  Â·  Age ${data.age} Â· ${data.gender}  Â·  Seeking: ${data.seeking}`;
  ctx.fillText(subText, idX + 24, frameY + subY);

  // Row 3: Equipped Vanity Badges Row (x: idX, y: 104)
  const badgeY = 104;
  let bx = idX;
  for (const b of data.badges) {
    ctx.font = 'bold 11px "Inter", sans-serif';
    const textW = ctx.measureText(b.name).width;
    const bW = textW + 30;
    const bH = 24;

    roundRect(bx, badgeY, bW, bH, 12);
    ctx.fillStyle = `${b.color}15`;
    ctx.fill();
    ctx.strokeStyle = `${b.color}55`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Text & Dot
    ctx.beginPath();
    ctx.arc(bx + 12, frameY + badgeY + 12, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = b.color;
    ctx.fill();

    ctx.font = 'bold 11px "Inter", sans-serif';
    ctx.fillStyle = b.color;
    ctx.fillText(b.name, bx + 20, frameY + badgeY + 16);

    bx += bW + 8;
  }

  // -------------------------------------------------------------
  // HEADER: TIER & LEVEL CREST (Right Header)
  // -------------------------------------------------------------
  const crestX = 878;
  const crestY = 74 + frameY;

  // Medallion Circle Frame
  ctx.beginPath();
  ctx.arc(crestX, crestY, 46, 0, Math.PI * 2);
  ctx.fillStyle = '#201726';
  ctx.fill();
  ctx.strokeStyle = '#403047';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Geometric Lotus Emblem
  ctx.save();
  ctx.translate(crestX - 44, crestY - 44);
  ctx.scale(0.88, 0.88);
  ctx.fillStyle = '#b946b3';
  const lotusPath = new Path2D(
    'M 50,9 62,38 50,72 38,38 Z M 36,25 48,53 35,82 17,45 Z M 64,25 52,53 65,82 83,45 Z M 29,52 50,88 71,52 66,87 H 34 Z'
  );
  ctx.fill(lotusPath);
  ctx.restore();

  // Tier, Level & Total XP Text (Right Aligned before crest)
  const tierX = 818;
  ctx.textAlign = 'right';

  // Tier Name
  ctx.font = 'bold 20px "Inter", sans-serif';
  ctx.fillStyle = '#f45cd6';
  ctx.fillText(`${data.tierName.toUpperCase()} TIER`, tierX, frameY + 50);

  // Level
  ctx.font = '650 22px "Inter", sans-serif';
  ctx.fillStyle = '#bdacc9';
  ctx.fillText('LVL', tierX - 68, frameY + 92);

  ctx.font = 'bold 54px "Inter", sans-serif';
  ctx.fillStyle = '#f4f6fa';
  ctx.fillText(`${data.level}`, tierX, frameY + 92);

  // Total XP
  ctx.font = '550 17px "Inter", sans-serif';
  ctx.fillStyle = '#bdacc9';
  ctx.fillText(`${data.totalXp.toLocaleString('en-US')} XP`, tierX, frameY + 116);

  // Horizontal Divider Line
  ctx.beginPath();
  ctx.moveTo(32, frameY + 148);
  ctx.lineTo(928, frameY + 148);
  ctx.strokeStyle = '#403047';
  ctx.lineWidth = 1;
  ctx.stroke();

  // -------------------------------------------------------------
  // CONNECTION PROGRESS BAR (y: 162)
  // -------------------------------------------------------------
  const barY = 162;
  const barLeft = 32;
  const barW = 896;
  const barH = 14;

  ctx.textAlign = 'left';
  ctx.font = 'bold 16px "Inter", sans-serif';
  ctx.fillStyle = '#bdacc9';
  ctx.fillText('CONNECTION LEVEL PROGRESS', barLeft, frameY + barY + 14);

  const progressRatio = Math.min(1, Math.max(0, data.currentXp / data.nextLevelXp));
  const progressFillW = Math.round(barW * progressRatio);

  ctx.textAlign = 'right';
  ctx.font = 'bold 16px "Inter", sans-serif';
  ctx.fillStyle = '#f4f6fa';
  ctx.fillText(`${data.currentXp.toLocaleString('en-US')} / ${data.nextLevelXp.toLocaleString('en-US')} XP (${Math.round(progressRatio * 100)}%)`, barLeft + barW, frameY + barY + 14);

  // Track
  roundRect(barLeft, barY + 24, barW, barH, 7);
  ctx.fillStyle = '#282632';
  ctx.fill();

  // Progress Fill
  roundRect(barLeft, barY + 24, progressFillW, barH, 7);
  ctx.fillStyle = '#b946b3';
  ctx.fill();

  // Glossy reflection streak
  roundRect(barLeft + 2, barY + 26, Math.max(0, progressFillW - 4), 4, 2);
  ctx.fillStyle = 'rgba(244, 92, 214, 0.4)';
  ctx.fill();

  // Progress bar sliding packet (if animated)
  if (phase > 0 && progressFillW > 40) {
    const packetW = 60;
    const travelDist = progressFillW - packetW;
    const packetPhase = 0.5 + 0.5 * Math.sin(2 * Math.PI * phase);
    const packetX = barLeft + travelDist * packetPhase;

    roundRect(packetX, barY + 24, packetW, barH, 7);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fill();
  }

  // -------------------------------------------------------------
  // 4 METRIC CARDS GRID (y: 220, height: 120)
  // -------------------------------------------------------------
  const cardY = 220;
  const cardH = 120;
  const cardW = 212;
  const cardGap = 16;

  const metrics = [
    {
      label: 'DESTINY COINS',
      value: `${data.coins.toLocaleString('en-US')}`,
      unit: 'DC',
      sub: 'Global Vault Balance',
      color: '#FBBF24',
      drawIcon: (cx: number, cy: number) => {
        ctx.beginPath();
        ctx.arc(cx, cy, 9, 0, Math.PI * 2);
        ctx.strokeStyle = '#FBBF24';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = 'bold 11px "Inter", sans-serif';
        ctx.fillStyle = '#FBBF24';
        ctx.textAlign = 'center';
        ctx.fillText('$', cx, cy + 4);
      }
    },
    {
      label: 'DAILY STREAK',
      value: `${data.streakCount}`,
      unit: 'Days',
      sub: `${data.streakMultiplier} Multiplier Active`,
      color: '#F97316',
      drawIcon: (cx: number, cy: number) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.beginPath();
        ctx.moveTo(0, 8);
        ctx.bezierCurveTo(-6, 5, -7, -1, -2, -6);
        ctx.bezierCurveTo(-1, -3, 1, -2, 2, -4);
        ctx.bezierCurveTo(6, -2, 6, 5, 0, 8);
        ctx.closePath();
        ctx.fillStyle = '#F97316';
        ctx.fill();
        ctx.restore();
      }
    },
    {
      label: 'MATCHES',
      value: `${data.matchesCount}`,
      unit: 'Chats',
      sub: `${data.chatHours} Talk Time`,
      color: '#f45cd6',
      drawIcon: (cx: number, cy: number) => {
        ctx.save();
        ctx.translate(cx, cy);
        roundRect(-9, -7, 18, 14, 3);
        ctx.strokeStyle = '#f45cd6';
        ctx.lineWidth = 1.8;
        ctx.stroke();
        // Chat dots
        ctx.fillStyle = '#f45cd6';
        [-4, 0, 4].forEach(dx => {
          ctx.beginPath();
          ctx.arc(dx, 0, 1.2, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.restore();
      }
    },
    {
      label: 'REPUTATION',
      value: `${data.reputationScore}%`,
      unit: '',
      sub: 'Verified Safe Score',
      color: '#10B981',
      drawIcon: (cx: number, cy: number) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(7, -5);
        ctx.lineTo(7, 1);
        ctx.bezierCurveTo(7, 5, 4, 8, 0, 10);
        ctx.bezierCurveTo(-4, 8, -7, 5, -7, 1);
        ctx.lineTo(-7, -5);
        ctx.closePath();
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-3, 0);
        ctx.lineTo(-1, 2);
        ctx.lineTo(4, -3);
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.restore();
      }
    }
  ];

  metrics.forEach((m, idx) => {
    const cx = barLeft + idx * (cardW + cardGap);

    // Card background
    roundRect(cx, cardY, cardW, cardH, 16);
    ctx.fillStyle = '#201726';
    ctx.fill();
    ctx.strokeStyle = '#403047';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Accent line on left
    roundRect(cx, cardY + 16, 4, cardH - 32, 2);
    ctx.fillStyle = m.color;
    ctx.fill();

    // Icon
    m.drawIcon(cx + 26, frameY + cardY + 28);

    // Label
    ctx.textAlign = 'left';
    ctx.font = 'bold 12px "Inter", sans-serif';
    ctx.fillStyle = '#bdacc9';
    ctx.fillText(m.label, cx + 44, frameY + cardY + 32);

    // Large Metric Value
    ctx.font = 'bold 36px "Inter", sans-serif';
    ctx.fillStyle = '#f4f6fa';
    ctx.fillText(m.value, cx + 18, frameY + cardY + 76);

    const valW = ctx.measureText(m.value).width;
    if (m.unit) {
      ctx.font = '500 16px "Inter", sans-serif';
      ctx.fillStyle = '#bdacc9';
      ctx.fillText(m.unit, cx + 22 + valW, frameY + cardY + 76);
    }

    // Subtext
    ctx.font = '500 12px "Inter", sans-serif';
    ctx.fillStyle = m.color;
    ctx.fillText(m.sub, cx + 18, frameY + cardY + 102);
  });

  // -------------------------------------------------------------
  // INTERESTS & LANGUAGES BAR (y: 360, height: 78)
  // -------------------------------------------------------------
  const intY = 360;
  const intH = 78;

  // Background panel
  roundRect(barLeft, intY, barW, intH, 16);
  ctx.fillStyle = '#181324';
  ctx.fill();
  ctx.strokeStyle = '#403047';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Left Section: Discovery Interests
  ctx.textAlign = 'left';
  ctx.font = 'bold 12px "Inter", sans-serif';
  ctx.fillStyle = '#bdacc9';
  ctx.fillText('DISCOVERY INTERESTS', barLeft + 18, frameY + intY + 24);

  let px = barLeft + 18;
  const pillRowY = intY + 36;
  for (const it of data.interests) {
    ctx.font = '500 13px "Inter", sans-serif';
    const cleanTag = it.replace(/^[^a-zA-Z0-9]+/, '').trim();
    const textW = ctx.measureText(cleanTag).width;
    const pW = textW + 28;
    const pH = 26;

    if (px + pW > barLeft + 640) break;

    roundRect(px, pillRowY, pW, pH, 13);
    ctx.fillStyle = '#201726';
    ctx.fill();
    ctx.strokeStyle = '#403047';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Small dot bullet
    ctx.beginPath();
    ctx.arc(px + 10, frameY + pillRowY + 13, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#f45cd6';
    ctx.fill();

    ctx.fillStyle = '#f4f6fa';
    ctx.fillText(cleanTag, px + 18, frameY + pillRowY + 17);

    px += pW + 8;
  }

  // Right Section: Languages
  const langX = barLeft + 660;
  ctx.font = 'bold 12px "Inter", sans-serif';
  ctx.fillStyle = '#bdacc9';
  ctx.fillText('SPOKEN LANGUAGES', langX, frameY + intY + 24);

  const langText = `ðŸ—£ï¸  ${data.languages.join(', ')}`;
  ctx.font = '500 13px "Inter", sans-serif';
  const cleanLang = data.languages.join(' Â· ');
  const langW = ctx.measureText(cleanLang).width + 28;
  roundRect(langX, pillRowY, langW, 26, 13);
  ctx.fillStyle = '#201726';
  ctx.fill();
  ctx.strokeStyle = '#403047';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(langX + 12, frameY + pillRowY + 13, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#34D399';
  ctx.fill();

  ctx.fillStyle = '#f4f6fa';
  ctx.fillText(cleanLang, langX + 20, frameY + pillRowY + 17);

  // -------------------------------------------------------------
  // FOOTER (y: 470)
  // -------------------------------------------------------------
  ctx.beginPath();
  ctx.moveTo(barLeft, frameY + 464);
  ctx.lineTo(barLeft + barW, frameY + 464);
  ctx.strokeStyle = '#403047';
  ctx.lineWidth = 1;
  ctx.stroke();

  const footY = frameY + 498;
  drawSparkle(barLeft + 6, footY - frameY - 4, 5, '#f45cd6', 0.9);

  ctx.font = '500 15px "Inter", sans-serif';
  ctx.fillStyle = '#bdacc9';
  ctx.fillText('Destiny Anonymous Social  Â·  End-to-End Persona Masking Active', barLeft + 20, footY);

  ctx.textAlign = 'right';
  ctx.fillText(`Shard #0  Â·  Node Asia  Â·  ${data.timezone}`, barLeft + barW, footY);
}


// Generate test files
async function main() {
  const sample: RichCardData = {
    displayName: 'Celestial Fox',
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
      { icon: 'ðŸ‘‘', name: 'VIP', color: '#FBBF24' },
      { icon: 'â­', name: 'Star Wanderer', color: '#60A5FA' },
      { icon: 'ðŸ”®', name: 'Mystic Aura', color: '#C084FC' },
      { icon: 'âœ“', name: 'Voice Verified', color: '#34D399' }
    ],
    interests: ['Gaming', 'Lo-Fi Music', 'Astronomy', 'Deep Talks', 'Tech'],
    languages: ['English', 'Hindi'],
    timezone: 'UTC+05:30',
    avatarInitials: 'CF'
  };

  // 1. Static PNG
  const singleCanvas = createCanvas(960, 540);
  drawRichFrame(singleCanvas.getContext('2d'), sample, 960, 540, 0, 0);
  const pngPath = path.resolve('C:/Users/basud/.gemini/antigravity/brain/941dc802-7f14-46db-9ac4-519acb6709dc/destiny_rich_final.png');
  fs.writeFileSync(pngPath, singleCanvas.toBuffer('image/png'));
  console.log('Saved rich PNG to', pngPath);
}

main();
