import { createCanvas, GlobalFonts, Path2D, Image, loadImage } from '@napi-rs/canvas';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

// Register Google Inter and JetBrains Mono fonts
GlobalFonts.registerFromPath('assets/fonts/Inter.ttf', 'Inter');
GlobalFonts.registerFromPath('assets/fonts/JetBrainsMono.ttf', 'JetBrains Mono');

export interface MonochromeCardData {
  displayName: string;
  destinyId: string;
  age: number;
  gender: string;
  isVerified: boolean;
  tierName: string;
  level: number;
  currentXp: number;
  nextLevelXp: number;
  totalXp: number;
  coins: number;
  streakCount: number;
  sessionsCount: number;
  talkTime: string;
  reputationScore: number;
  interests: string[];
  languages: string[];
  timezone: string;
  avatarImage?: Image | null;
}

// 80-frame perimeter points calculation for border pulse
function getRoundedPoints(w: number, h: number, r: number, count: number): Array<[number, number]> {
  const straightX = w - 2 * r;
  const straightY = h - 2 * r;
  const arc = (Math.PI * r) / 2;
  const total = straightX * 2 + straightY * 2 + arc * 4;
  const points: Array<[number, number]> = [];

  for (let i = 0; i < count; i++) {
    const dist = (total * i) / count;
    let d = dist;

    if (d < straightX) {
      points.push([r + d, 0]);
      continue;
    }
    d -= straightX;

    if (d < arc) {
      const angle = -Math.PI / 2 + d / r;
      points.push([w - r + r * Math.cos(angle), r + r * Math.sin(angle)]);
      continue;
    }
    d -= arc;

    if (d < straightY) {
      points.push([w, r + d]);
      continue;
    }
    d -= straightY;

    if (d < arc) {
      const angle = 0 + d / r;
      points.push([w - r + r * Math.cos(angle), h - r + r * Math.sin(angle)]);
      continue;
    }
    d -= arc;

    if (d < straightX) {
      points.push([w - r - d, h]);
      continue;
    }
    d -= straightX;

    if (d < arc) {
      const angle = Math.PI / 2 + d / r;
      points.push([r + r * Math.cos(angle), h - r + r * Math.sin(angle)]);
      continue;
    }
    d -= arc;

    if (d < straightY) {
      points.push([0, h - r - d]);
      continue;
    }
    d -= straightY;

    const angle = Math.PI + d / r;
    points.push([r + r * Math.cos(angle), r + r * Math.sin(angle)]);
  }

  return points;
}

// Custom crisp vector icons in pure monochrome
const ICONS = {
  chatBubble(ctx: any, x: number, y: number, color = '#f2f4f8') {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 14);
    ctx.lineTo(x + 3, y + 6);
    ctx.quadraticCurveTo(x + 3, y + 2, x + 7, y + 2);
    ctx.lineTo(x + 17, y + 2);
    ctx.quadraticCurveTo(x + 21, y + 2, x + 21, y + 6);
    ctx.lineTo(x + 21, y + 13);
    ctx.quadraticCurveTo(x + 21, y + 17, x + 17, y + 17);
    ctx.lineTo(x + 8, y + 17);
    ctx.lineTo(x + 4, y + 21);
    ctx.lineTo(x + 4, y + 16.5);
    ctx.quadraticCurveTo(x + 3, y + 16.5, x + 3, y + 14);
    ctx.stroke();
    // Inner dots
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + 8, y + 9.5, 1.2, 0, Math.PI * 2);
    ctx.arc(x + 12, y + 9.5, 1.2, 0, Math.PI * 2);
    ctx.arc(x + 16, y + 9.5, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  users(ctx: any, x: number, y: number, color = '#8b929e') {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.arc(x + 10, y + 7, 3.8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 18);
    ctx.quadraticCurveTo(x + 4, y + 13, x + 10, y + 13);
    ctx.quadraticCurveTo(x + 16, y + 13, x + 16, y + 18);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 16.5, y + 5.5, 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 18.5, y + 12);
    ctx.quadraticCurveTo(x + 21, y + 12, x + 21, y + 16);
    ctx.stroke();
    ctx.restore();
  },

  shieldCheck(ctx: any, x: number, y: number, color = '#10b981') {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x + 11, y + 3);
    ctx.lineTo(x + 19, y + 6);
    ctx.quadraticCurveTo(x + 19, y + 14, x + 11, y + 19);
    ctx.quadraticCurveTo(x + 3, y + 14, x + 3, y + 6);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 7.5, y + 11);
    ctx.lineTo(x + 10, y + 13.5);
    ctx.lineTo(x + 14.5, y + 8.5);
    ctx.stroke();
    ctx.restore();
  },

  coin(ctx: any, x: number, y: number, color = '#f2f4f8') {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.arc(x + 11, y + 11, 9.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DC', x + 11, y + 11.5);
    ctx.restore();
  },

  flame(ctx: any, x: number, y: number, color = '#8b929e') {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 2);
    ctx.quadraticCurveTo(x + 12, y + 7, x + 10, y + 10);
    ctx.quadraticCurveTo(x + 14, y + 10, x + 14, y + 13);
    ctx.quadraticCurveTo(x + 14, y + 17, x + 8, y + 17);
    ctx.quadraticCurveTo(x + 2, y + 17, x + 2, y + 12);
    ctx.quadraticCurveTo(x + 2, y + 8, x + 8, y + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  },

  lock(ctx: any, x: number, y: number, color = '#575d68') {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeRect(x + 3, y + 7, 10, 8);
    ctx.beginPath();
    ctx.arc(x + 8, y + 7, 3.5, Math.PI, 0, false);
    ctx.stroke();
    ctx.restore();
  },

  clock(ctx: any, x: number, y: number, color = '#575d68') {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x + 8, y + 8, 6.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 4.5);
    ctx.lineTo(x + 8, y + 8);
    ctx.lineTo(x + 11, y + 8);
    ctx.stroke();
    ctx.restore();
  },

  verifiedBadge(ctx: any, x: number, y: number) {
    ctx.save();
    ctx.fillStyle = '#10B981';
    ctx.beginPath();
    ctx.arc(x + 8, y + 8, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#090a0c';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x + 4.5, y + 8);
    ctx.lineTo(x + 7, y + 10.5);
    ctx.lineTo(x + 11.5, y + 5.5);
    ctx.stroke();
    ctx.restore();
  }
};

export function drawMonochromeCard(
  ctx: any,
  data: MonochromeCardData,
  width: number,
  height: number,
  frameY = 0,
  phase = 0
) {
  const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.roundRect(x, y + frameY, w, h, r);
    ctx.closePath();
  };

  const drawSparkle = (x: number, y: number, r: number, alpha = 0.8) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x, y + frameY - r);
    ctx.quadraticCurveTo(x, y + frameY, x + r, y + frameY);
    ctx.quadraticCurveTo(x, y + frameY, x, y + frameY + r);
    ctx.quadraticCurveTo(x, y + frameY, x - r, y + frameY);
    ctx.quadraticCurveTo(x, y + frameY, x, y + frameY - r);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  // 1. BASE BACKGROUND & SHELL
  ctx.save();
  roundRect(1, 1, width - 2, height - 2, 28);
  ctx.clip();

  // Solid deep obsidian dark surface
  ctx.fillStyle = '#090a0c';
  ctx.fillRect(0, frameY, width, height);

  // Top-lit subtle ambient specular highlight (Linear / Vercel style)
  const topGlow = ctx.createRadialGradient(width / 2, frameY, 10, width / 2, frameY, 320);
  topGlow.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
  topGlow.addColorStop(1, 'rgba(9, 10, 12, 0)');
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, frameY, width, height);

  // Subtle ambient glow behind avatar (cool platinum)
  const avGlow = ctx.createRadialGradient(88, frameY + 80, 10, 88, frameY + 80, 180);
  avGlow.addColorStop(0, 'rgba(255, 255, 255, 0.04)');
  avGlow.addColorStop(1, 'rgba(9, 10, 12, 0)');
  ctx.fillStyle = avGlow;
  ctx.fillRect(0, frameY, width, height);

  // Subtle ambient glow behind emblem (cool white)
  const emGlow = ctx.createRadialGradient(880, frameY + 80, 10, 880, frameY + 80, 180);
  emGlow.addColorStop(0, 'rgba(255, 255, 255, 0.06)');
  emGlow.addColorStop(1, 'rgba(9, 10, 12, 0)');
  ctx.fillStyle = emGlow;
  ctx.fillRect(0, frameY, width, height);

  // Twinkling subtle stars
  const stars = [
    { x: 39, y: 236, r: 4.5, off: 0.0 },
    { x: 920, y: 238, r: 5.0, off: 0.17 },
    { x: 618, y: 114, r: 3.5, off: 0.35 },
    { x: 467, y: 241, r: 3.0, off: 0.52 },
    { x: 776, y: 414, r: 3.5, off: 0.69 },
    { x: 254, y: 36, r: 3.0, off: 0.8 },
    { x: 515, y: 49, r: 3.0, off: 0.25 },
    { x: 21, y: 416, r: 3.5, off: 0.6 },
    { x: 940, y: 426, r: 3.5, off: 0.4 },
    { x: 874, y: 29, r: 3.0, off: 0.85 },
  ];
  for (const st of stars) {
    const alpha = 0.15 + 0.55 * Math.max(0, Math.sin(2 * Math.PI * (phase * 2 + st.off)));
    drawSparkle(st.x, st.y, st.r, alpha);
  }
  ctx.restore();

  // Outer border (Crisp 1px hairline border)
  roundRect(1, 1, width - 2, height - 2, 28);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // -------------------------------------------------------------
  // HEADER: AVATAR (x: 36, y: 32)
  // -------------------------------------------------------------
  const avX = 36;
  const avY = 32 + frameY;
  const avR = 48;

  // Outer brushed platinum outline ring
  ctx.beginPath();
  ctx.arc(avX + 48, avY + 48, avR + 4, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 2.0;
  ctx.stroke();

  // Inner avatar disc
  ctx.beginPath();
  ctx.arc(avX + 48, avY + 48, avR, 0, Math.PI * 2);
  ctx.fillStyle = '#141619';
  ctx.fill();

  // Draw Avatar Image or Monogram
  ctx.save();
  ctx.beginPath();
  ctx.arc(avX + 48, avY + 48, avR - 1, 0, Math.PI * 2);
  ctx.clip();

  if (data.avatarImage) {
    ctx.drawImage(data.avatarImage, avX, avY, 96, 96);
  } else {
    // Stylized Monochrome Monogram Avatar
    const avGrad = ctx.createLinearGradient(avX, avY, avX + 96, avY + 96);
    avGrad.addColorStop(0, '#22252a');
    avGrad.addColorStop(1, '#111315');
    ctx.fillStyle = avGrad;
    ctx.fillRect(avX, avY, 96, 96);

    ctx.translate(avX + 48, avY + 48);
    // Brushed silver crescent ring
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, 0, 32, -Math.PI * 0.75, Math.PI * 0.75);
    ctx.stroke();

    const initials = data.displayName
      .split(' ')
      .map(p => p[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
    ctx.font = 'bold 28px "JetBrains Mono", monospace';
    ctx.fillStyle = '#f2f4f8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, 0, 1);
  }
  ctx.restore();

  // Online Status Dot at (avX + 78, avY + 78)
  ctx.beginPath();
  ctx.arc(avX + 78, avY + 78, 10, 0, Math.PI * 2);
  ctx.fillStyle = '#090a0c';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(avX + 78, avY + 78, 7.5, 0, Math.PI * 2);
  ctx.fillStyle = '#10B981'; // Signal green dot
  ctx.fill();

  // -------------------------------------------------------------
  // HEADER: IDENTITY (x: 156, y: 26)
  // -------------------------------------------------------------
  const idX = 156;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // 1. Display Name
  ctx.font = 'bold 34px "Inter", sans-serif';
  ctx.fillStyle = '#f2f4f8';
  ctx.fillText(data.displayName, idX, frameY + 64);

  const nameW = ctx.measureText(data.displayName).width;

  // 2. Verified Pill / ID Badge
  const badgeX = idX + nameW + 14;
  const badgeY = 42;
  const badgeH = 24;
  const badgeText = data.isVerified ? 'VERIFIED' : `ID: ${data.destinyId}`;
  ctx.font = 'bold 11px "JetBrains Mono", monospace';
  const badgeTextW = ctx.measureText(badgeText).width;
  const badgeW = badgeTextW + (data.isVerified ? 30 : 18);

  roundRect(badgeX, badgeY, badgeW, badgeH, 6);
  ctx.fillStyle = '#141619';
  ctx.fill();
  ctx.strokeStyle = data.isVerified ? '#10B981' : 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.stroke();

  if (data.isVerified) {
    ICONS.verifiedBadge(ctx, badgeX + 6, badgeY + 4);
    ctx.font = 'bold 11px "Inter", sans-serif';
    ctx.fillStyle = '#10B981';
    ctx.fillText(badgeText, badgeX + 26, frameY + badgeY + 16);
  } else {
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.fillStyle = '#e1e4ea';
    ctx.fillText(badgeText, badgeX + 9, frameY + badgeY + 16);
  }

  // 3. Demographics Row (Age • Gender • Languages)
  const demoY = frameY + 95;
  const demoText = `Age ${data.age}  ·  ${data.gender.charAt(0).toUpperCase() + data.gender.slice(1)}  ·  ${data.languages.join(', ')}`;
  ctx.font = '500 15px "Inter", sans-serif';
  ctx.fillStyle = '#8b929e';
  ctx.fillText(demoText, idX, demoY);

  // 4. Clean Interest Tags (Monochrome Titanium Micro-Pills)
  let tagX = idX;
  const tagY = 110;
  for (const tag of data.interests.slice(0, 3)) {
    ctx.font = '600 11px "Inter", sans-serif';
    const cleanTag = tag.trim().charAt(0).toUpperCase() + tag.trim().slice(1);
    const tw = ctx.measureText(cleanTag).width;
    const pw = tw + 20;

    roundRect(tagX, tagY, pw, 24, 6);
    ctx.fillStyle = '#141619';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#d0d4dc';
    ctx.fillText(cleanTag, tagX + 10, frameY + tagY + 16);

    tagX += pw + 8;
  }

  // -------------------------------------------------------------
  // HEADER: RANK & TIER (x: 648, y: 0)
  // -------------------------------------------------------------
  const rankX = 648;
  ctx.textAlign = 'left';

  // Tier Name
  ctx.font = 'bold 20px "JetBrains Mono", monospace';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(data.tierName.toUpperCase(), rankX, frameY + 52);

  // LVL and Level Value
  ctx.font = '650 22px "JetBrains Mono", monospace';
  ctx.fillStyle = '#8b929e';
  ctx.fillText('LVL', rankX, frameY + 112);

  ctx.font = '750 56px "JetBrains Mono", monospace';
  ctx.fillStyle = '#f2f4f8';
  ctx.fillText(data.level.toString().padStart(2, '0'), rankX + 54, frameY + 114);

  // Total XP
  ctx.font = '550 16px "JetBrains Mono", monospace';
  ctx.fillStyle = '#8b929e';
  ctx.fillText(`${data.totalXp.toLocaleString()} XP`, rankX, frameY + 142);

  // -------------------------------------------------------------
  // HEADER: CRYSTAL LOTUS EMBLEM (829, 35) & SATELLITE
  // -------------------------------------------------------------
  ctx.save();
  ctx.translate(829, frameY + 35);
  ctx.scale(0.96, 0.96);

  // Mathematical SVG Lotus Crystal in Titanium / Monochrome Chrome
  const lotusPath = new Path2D(
    'M 50,9 62,38 50,72 38,38 Z M 36,25 48,53 35,82 17,45 Z M 64,25 52,53 65,82 83,45 Z M 29,52 50,88 71,52 66,87 H 34 Z'
  );
  // Brushed silver gradient fill
  const lotusGrad = ctx.createLinearGradient(0, 0, 96, 96);
  lotusGrad.addColorStop(0, '#ffffff');
  lotusGrad.addColorStop(0.5, '#b0b5be');
  lotusGrad.addColorStop(1, '#575d68');
  ctx.fillStyle = lotusGrad;
  ctx.fill(lotusPath);

  // Orbiting satellite diamond
  const orbAngle = phase * 2 * Math.PI;
  const orbRadius = 46;
  const satX = 50 + orbRadius * Math.cos(orbAngle);
  const satY = 48 + orbRadius * Math.sin(orbAngle);

  ctx.save();
  ctx.translate(satX, satY);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
  ctx.shadowBlur = 6;
  ctx.fillRect(-3.5, -3.5, 7, 7);
  ctx.restore();

  ctx.restore();

  // -------------------------------------------------------------
  // DIVIDER LINE (y: 160)
  // -------------------------------------------------------------
  ctx.beginPath();
  ctx.moveTo(32, frameY + 160);
  ctx.lineTo(width - 32, frameY + 160);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // -------------------------------------------------------------
  // PROGRESS SECTION (y: 190)
  // -------------------------------------------------------------
  ctx.font = '600 16px "JetBrains Mono", monospace';
  ctx.fillStyle = '#8b929e';
  ctx.textAlign = 'left';
  ctx.fillText('CONNECTION PROGRESS', 32, frameY + 192);

  ctx.font = '600 16px "JetBrains Mono", monospace';
  ctx.fillStyle = '#f2f4f8';
  ctx.textAlign = 'right';
  ctx.fillText(`${data.currentXp.toLocaleString()} / ${data.nextLevelXp.toLocaleString()} XP`, width - 32, frameY + 192);

  // Progress Bar Track
  const progX = 32;
  const progY = 208;
  const progW = width - 64; // 896
  const progH = 10; // Sleek surgical 10px height

  roundRect(progX, progY, progW, progH, 5);
  ctx.fillStyle = '#17191d';
  ctx.fill();

  // Progress Fill
  const fillRatio = Math.min(1, Math.max(0, data.currentXp / data.nextLevelXp));
  const fillW = Math.max(progH, progW * fillRatio);

  ctx.save();
  roundRect(progX, progY, fillW, progH, 5);
  ctx.clip();

  // Brushed Titanium to Pure White Gradient
  const progGrad = ctx.createLinearGradient(progX, 0, progX + fillW, 0);
  progGrad.addColorStop(0, '#737a86');
  progGrad.addColorStop(1, '#ffffff');
  ctx.fillStyle = progGrad;
  ctx.fillRect(progX, frameY + progY, fillW, progH);

  // Sliding Specular White Highlight Beam
  const beamX = progX - 80 + (fillW + 160) * phase;
  const beamGrad = ctx.createLinearGradient(beamX, 0, beamX + 70, 0);
  beamGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
  beamGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.8)');
  beamGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = beamGrad;
  ctx.fillRect(beamX, frameY + progY, 70, progH);
  ctx.restore();

  // -------------------------------------------------------------
  // LOWER PANEL 1: CONVERSATION ACTIVITY (x: 32, width: 548, height: 156)
  // -------------------------------------------------------------
  const card1X = 32;
  const cardY = 244;
  const card1W = 548;
  const cardH = 160;

  // Level 1 Elevation: #131417 with 1px border
  roundRect(card1X, cardY, card1W, cardH, 18);
  ctx.fillStyle = '#121417';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Top edge reflection highlight (Tactile Glass Bevel)
  ctx.beginPath();
  ctx.moveTo(card1X + 18, frameY + cardY + 1);
  ctx.lineTo(card1X + card1W - 18, frameY + cardY + 1);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Panel 1 Header
  ICONS.chatBubble(ctx, card1X + 22, cardY + 18, '#ffffff');
  ctx.font = '600 13px "JetBrains Mono", monospace';
  ctx.fillStyle = '#8b929e';
  ctx.textAlign = 'left';
  ctx.fillText('CONVERSATION ACTIVITY', card1X + 54, frameY + cardY + 34);

  // Column A (Left): Talk Time Hero
  ctx.font = 'bold 46px "JetBrains Mono", monospace';
  ctx.fillStyle = '#f2f4f8';
  ctx.fillText(data.talkTime, card1X + 22, frameY + cardY + 88);

  ctx.font = '500 12px "Inter", sans-serif';
  ctx.fillStyle = '#575d68';
  ctx.fillText('Total Anonymized Talk Time', card1X + 22, frameY + cardY + 110);

  // Hairline Vertical Divider
  const splitX = card1X + 316;
  ctx.beginPath();
  ctx.moveTo(splitX, frameY + cardY + 20);
  ctx.lineTo(splitX, frameY + cardY + cardH - 20);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Column B (Right): Structured Sub-Metrics
  // Sub-metric 1: Sessions
  ICONS.users(ctx, splitX + 20, cardY + 28, '#8b929e');
  ctx.font = 'bold 16px "JetBrains Mono", monospace';
  ctx.fillStyle = '#f2f4f8';
  ctx.fillText(`${data.sessionsCount.toString().padStart(2, '0')} SESSIONS`, splitX + 48, frameY + cardY + 42);
  ctx.font = '500 11px "Inter", sans-serif';
  ctx.fillStyle = '#575d68';
  ctx.fillText('Completed Match Rooms', splitX + 48, frameY + cardY + 58);

  // Sub-metric 2: Reputation
  ICONS.shieldCheck(ctx, splitX + 20, cardY + 80, '#10b981');
  ctx.font = 'bold 16px "JetBrains Mono", monospace';
  ctx.fillStyle = '#10B981';
  ctx.fillText(`${data.reputationScore}% SCORE`, splitX + 48, frameY + cardY + 94);
  ctx.font = '500 11px "Inter", sans-serif';
  ctx.fillStyle = '#575d68';
  ctx.fillText('High Reputation Rating', splitX + 48, frameY + cardY + 110);

  // -------------------------------------------------------------
  // LOWER PANEL 2: DESTINY VAULT (x: 600, width: 328, height: 160)
  // -------------------------------------------------------------
  const card2X = 600;
  const card2W = 328;

  roundRect(card2X, cardY, card2W, cardH, 18);
  ctx.fillStyle = '#121417';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Top edge reflection highlight
  ctx.beginPath();
  ctx.moveTo(card2X + 18, frameY + cardY + 1);
  ctx.lineTo(card2X + card2W - 18, frameY + cardY + 1);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Panel 2 Header
  ICONS.coin(ctx, card2X + 20, cardY + 18, '#ffffff');
  ctx.font = '600 13px "JetBrains Mono", monospace';
  ctx.fillStyle = '#8b929e';
  ctx.textAlign = 'left';
  ctx.fillText('DESTINY VAULT', card2X + 50, frameY + cardY + 34);

  // Hero Value: Coins in crisp white
  ctx.font = 'bold 46px "JetBrains Mono", monospace';
  ctx.fillStyle = '#f2f4f8';
  ctx.fillText(`${data.coins} DC`, card2X + 20, frameY + cardY + 88);

  ctx.font = '500 12px "Inter", sans-serif';
  ctx.fillStyle = '#575d68';
  ctx.fillText('Available Coins Balance', card2X + 20, frameY + cardY + 110);

  // Bottom Row: Streak & Claim Badge
  ICONS.flame(ctx, card2X + 20, cardY + 125, '#8b929e');
  ctx.font = '600 13px "JetBrains Mono", monospace';
  ctx.fillStyle = '#8b929e';
  ctx.fillText(`${data.streakCount} DAY STREAK`, card2X + 42, frameY + cardY + 138);

  // Claim status badge in sleek monochrome
  const claimW = 86;
  const claimH = 22;
  const claimX = card2X + card2W - claimW - 18;
  const claimY = cardY + 122;
  roundRect(claimX, claimY, claimW, claimH, 6);
  ctx.fillStyle = '#171a1e';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = 'bold 10px "JetBrains Mono", monospace';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText('• READY', claimX + claimW / 2, frameY + claimY + 15);

  // -------------------------------------------------------------
  // FOOTER (y: 446)
  // -------------------------------------------------------------
  ICONS.lock(ctx, 32, 436, '#575d68');
  ctx.font = '500 12px "JetBrains Mono", monospace';
  ctx.fillStyle = '#575d68';
  ctx.textAlign = 'left';
  ctx.fillText('DESTINY ANONYMOUS SOCIAL · END-TO-END EPHEMERAL', 54, frameY + 448);

  ICONS.clock(ctx, width - 150, 436, '#575d68');
  ctx.textAlign = 'right';
  ctx.fillText(data.timezone || 'UTC+05:30', width - 32, frameY + 448);

  // -------------------------------------------------------------
  // ANIMATION: TRAVELING BORDER LASER LIGHT PULSE
  // -------------------------------------------------------------
  if (phase > 0) {
    const perimeterPoints = getRoundedPoints(width - 2, height - 2, 28, 80);
    const pulseIdx = Math.floor(phase * 80) % 80;
    const [px, py] = perimeterPoints[pulseIdx];

    ctx.save();
    const pulseGlow = ctx.createRadialGradient(px + 1, py + 1 + frameY, 1, px + 1, py + 1 + frameY, 24);
    pulseGlow.addColorStop(0, '#ffffff');
    pulseGlow.addColorStop(0.4, 'rgba(255, 255, 255, 0.6)');
    pulseGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = pulseGlow;
    ctx.beginPath();
    ctx.arc(px + 1, py + 1 + frameY, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export async function renderMonochromeMotionWebp(data: MonochromeCardData): Promise<Buffer> {
  const WIDTH = 960;
  const HEIGHT = 480;
  const NUM_FRAMES = 80;

  const tallCanvas = createCanvas(WIDTH, HEIGHT * NUM_FRAMES);
  const ctx = tallCanvas.getContext('2d');

  for (let i = 0; i < NUM_FRAMES; i++) {
    const frameY = i * HEIGHT;
    const phase = i / NUM_FRAMES;
    drawMonochromeCard(ctx, data, WIDTH, HEIGHT, frameY, phase);
  }

  const rawData = tallCanvas.data();
  return await sharp(rawData, {
    raw: {
      width: WIDTH,
      height: HEIGHT * NUM_FRAMES,
      channels: 4,
      pageHeight: HEIGHT,
    },
  })
    .webp({
      quality: 90,
      lossless: false,
      effort: 4,
      loop: 0,
      delay: 50,
    })
    .toBuffer();
}

async function main() {
  const WIDTH = 960;
  const HEIGHT = 480;

  const cardData: MonochromeCardData = {
    displayName: 'Midnight Wolf',
    destinyId: 'R7ZYFK',
    age: 25,
    gender: 'male',
    isVerified: true,
    tierName: 'Strangers',
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
    languages: ['English', 'Hindi'],
    timezone: 'UTC+05:30'
  };

  const artifactDir = 'C:\\Users\\basud\\.gemini\\antigravity\\brain\\941dc802-7f14-46db-9ac4-519acb6709dc';

  // 1. Static PNG
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  drawMonochromeCard(ctx, cardData, WIDTH, HEIGHT, 0, 0);

  const pngBuf = canvas.toBuffer('image/png');
  const pngPath = path.join(artifactDir, 'destiny_monochrome_card.png');
  fs.writeFileSync(pngPath, pngBuf);
  console.log(`Saved Monochrome PNG to ${pngPath}`);

  // 2. Animated WebP (20 FPS)
  console.log('Rendering 80-frame Animated Monochrome WebP...');
  const t0 = Date.now();
  const webpBuffer = await renderMonochromeMotionWebp(cardData);
  const webpPath = path.join(artifactDir, 'destiny_monochrome_motion.webp');
  fs.writeFileSync(webpPath, webpBuffer);
  console.log(`Saved Animated Monochrome WebP in ${Date.now() - t0}ms to ${webpPath} (${webpBuffer.length} bytes)`);
}

main().catch(console.error);
