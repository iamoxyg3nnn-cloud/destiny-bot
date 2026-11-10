import { createCanvas, GlobalFonts, Path2D } from '@napi-rs/canvas';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

GlobalFonts.registerFromPath('assets/fonts/Inter.ttf', 'Inter');

export interface ProCardData {
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
  streakCount: number;
  sessionsCount: number;
  talkTime: string;
  reputationScore: number;
  interests: string[];
  timezone: string;
}

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

export function drawProCard(
  ctx: any,
  data: ProCardData,
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
    ctx.fillStyle = '#f45cd6';
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

  ctx.fillStyle = '#14131e';
  ctx.fillRect(0, frameY, width, height);

  // Subtle ambient radial glow behind avatar
  const avGlow = ctx.createRadialGradient(88, frameY + 80, 10, 88, frameY + 80, 160);
  avGlow.addColorStop(0, 'rgba(244, 92, 214, 0.12)');
  avGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = avGlow;
  ctx.fillRect(0, frameY, width, height);

  // Subtle ambient glow behind emblem
  const emGlow = ctx.createRadialGradient(880, frameY + 75, 10, 880, frameY + 75, 160);
  emGlow.addColorStop(0, 'rgba(185, 70, 179, 0.16)');
  emGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = emGlow;
  ctx.fillRect(0, frameY, width, height);

  // Twinkling stars
  const stars = [
    { x: 39, y: 236, r: 6, off: 0.0 },
    { x: 920, y: 238, r: 6.5, off: 0.17 },
    { x: 618, y: 114, r: 4.5, off: 0.35 },
    { x: 467, y: 241, r: 4, off: 0.52 },
    { x: 776, y: 414, r: 4.5, off: 0.69 },
    { x: 254, y: 36, r: 4, off: 0.8 },
    { x: 515, y: 49, r: 4, off: 0.25 },
    { x: 21, y: 416, r: 4.5, off: 0.6 },
    { x: 940, y: 426, r: 4.5, off: 0.4 },
    { x: 874, y: 29, r: 4, off: 0.85 },
  ];
  for (const st of stars) {
    const alpha = 0.3 + 0.7 * Math.max(0, Math.sin(2 * Math.PI * (phase * 2 + st.off)));
    drawSparkle(st.x, st.y, st.r, alpha);
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

  // Celestial Wolf/Fox Silhouette Icon
  ctx.save();
  ctx.translate(avX + 46, avY + 46);
  ctx.fillStyle = '#f4f6fa';
  ctx.beginPath();
  // Stylized wolf head silhouette
  ctx.moveTo(0, 18);
  ctx.lineTo(-12, 6);
  ctx.lineTo(-20, 12);
  ctx.lineTo(-18, -4);
  ctx.lineTo(-24, -18);
  ctx.lineTo(-10, -12);
  ctx.lineTo(0, -22);
  ctx.lineTo(10, -12);
  ctx.lineTo(24, -18);
  ctx.lineTo(18, -4);
  ctx.lineTo(20, 12);
  ctx.lineTo(12, 6);
  ctx.closePath();
  ctx.fill();
  // Wolf eye slits
  ctx.fillStyle = '#f45cd6';
  ctx.beginPath();
  ctx.arc(-6, -4, 2, 0, Math.PI * 2);
  ctx.arc(6, -4, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Online Emerald Dot
  ctx.beginPath();
  ctx.arc(avX + 80, avY + 80, 9, 0, Math.PI * 2);
  ctx.fillStyle = '#14131e';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(avX + 80, avY + 80, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#10B981';
  ctx.fill();

  // -------------------------------------------------------------
  // HEADER: IDENTITY (x: 156, y: 24)
  // -------------------------------------------------------------
  const idX = 156;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Display Name
  ctx.font = 'bold 36px "Inter", sans-serif';
  ctx.fillStyle = '#f4f6fa';
  ctx.fillText(data.displayName, idX, frameY + 62);

  const nameW = ctx.measureText(data.displayName).width;

  // Monospace Destiny ID Badge
  const pillX = idX + nameW + 14;
  const pillY = 38;
  const pillW = 86;
  const pillH = 24;
  roundRect(pillX, pillY, pillW, pillH, 6);
  ctx.fillStyle = '#201726';
  ctx.fill();
  ctx.strokeStyle = '#403047';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.font = 'bold 12px "Consolas", monospace';
  ctx.fillStyle = '#D8B4FE';
  ctx.textAlign = 'center';
  ctx.fillText(data.destinyId, pillX + pillW / 2, frameY + pillY + 16);

  // Subtitle (Hexagon mark + Demographics)
  ctx.textAlign = 'left';
  const subY = 94;
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

  ctx.font = '500 20px "Inter", sans-serif';
  ctx.fillStyle = '#bdacc9';
  const genderCap = data.gender.charAt(0).toUpperCase() + data.gender.slice(1);
  ctx.fillText(`Age ${data.age} Â· ${genderCap} Â· ID: ${data.destinyId}`, idX + 24, frameY + subY);

  // Quiet Interest Tag Pills (Row 3 under subtitle, y: 110)
  const tagY = 110;
  let tx = idX;
  for (const it of data.interests.slice(0, 4)) {
    const clean = it.replace(/^[^a-zA-Z0-9]+/, '').trim();
    const capitalized = clean.charAt(0).toUpperCase() + clean.slice(1);
    ctx.font = '500 13px "Inter", sans-serif';
    const tW = ctx.measureText(capitalized).width + 24;
    const tH = 24;

    roundRect(tx, tagY, tW, tH, 12);
    ctx.fillStyle = '#201726';
    ctx.fill();
    ctx.strokeStyle = '#403047';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#bdacc9';
    ctx.fillText(capitalized, tx + 12, frameY + tagY + 16);

    tx += tW + 8;
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

  ctx.font = 'bold 22px "Inter", sans-serif';
  ctx.fillStyle = '#f45cd6';
  ctx.fillText(data.tierName.toUpperCase(), tierX, frameY + 50);

  ctx.font = '650 24px "Inter", sans-serif';
  ctx.fillStyle = '#bdacc9';
  ctx.fillText('LVL', tierX - 60, frameY + 94);

  ctx.font = 'bold 58px "Inter", sans-serif';
  ctx.fillStyle = '#f4f6fa';
  ctx.fillText(`${data.level}`, tierX, frameY + 94);

  ctx.font = '550 18px "Inter", sans-serif';
  ctx.fillStyle = '#bdacc9';
  ctx.fillText(`${data.totalXp.toLocaleString('en-US')} XP`, tierX, frameY + 120);

  // Horizontal Divider Line
  ctx.beginPath();
  ctx.moveTo(32, frameY + 152);
  ctx.lineTo(928, frameY + 152);
  ctx.strokeStyle = '#403047';
  ctx.lineWidth = 1;
  ctx.stroke();

  // -------------------------------------------------------------
  // CONNECTION PROGRESS BAR (y: 168)
  // -------------------------------------------------------------
  const barY = 168;
  const barLeft = 32;
  const barW = 896;
  const barH = 16;

  ctx.textAlign = 'left';
  ctx.font = 'bold 18px "Inter", sans-serif';
  ctx.fillStyle = '#bdacc9';
  ctx.fillText('CONNECTION PROGRESS', barLeft, frameY + barY + 16);

  const progressRatio = Math.min(1, Math.max(0, data.currentXp / data.nextLevelXp));
  const progressFillW = Math.round(barW * progressRatio);

  ctx.textAlign = 'right';
  ctx.font = 'bold 18px "Inter", sans-serif';
  ctx.fillStyle = '#f4f6fa';
  ctx.fillText(
    `${data.currentXp.toLocaleString('en-US')} / ${data.nextLevelXp.toLocaleString('en-US')} XP`,
    barLeft + barW,
    frameY + barY + 16
  );

  // Track
  roundRect(barLeft, barY + 28, barW, barH, 8);
  ctx.fillStyle = '#282632';
  ctx.fill();

  // Fill
  roundRect(barLeft, barY + 28, progressFillW, barH, 8);
  ctx.fillStyle = '#b946b3';
  ctx.fill();

  // Glossy reflection streak
  roundRect(barLeft + 2, barY + 30, Math.max(0, progressFillW - 4), 5, 2.5);
  ctx.fillStyle = 'rgba(244, 92, 214, 0.4)';
  ctx.fill();

  // Progress sliding packet if motion
  if (phase > 0 && progressFillW > 40) {
    const packetW = 60;
    const travel = progressFillW - packetW;
    const pPhase = 0.5 + 0.5 * Math.sin(2 * Math.PI * phase);
    const px = barLeft + travel * pPhase;
    roundRect(px, barY + 28, packetW, barH, 8);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fill();
  }

  // -------------------------------------------------------------
  // THE TWO LARGE STAT PANELS (y: 236, height: 164)
  // -------------------------------------------------------------
  const cardY = 236;
  const cardH = 164;
  const leftW = 548;
  const rightW = 332;

  // PANEL 1: DESTINY COINS (Wide Left Panel)
  roundRect(barLeft, cardY, leftW, cardH, 18);
  ctx.fillStyle = '#201726';
  ctx.fill();
  ctx.strokeStyle = '#403047';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Vector Coin Icon
  ctx.save();
  ctx.translate(barLeft + 36, frameY + cardY + 32);
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.strokeStyle = '#f45cd6';
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(0, 6);
  ctx.moveTo(-3, -3);
  ctx.lineTo(3, -3);
  ctx.moveTo(-3, 3);
  ctx.lineTo(3, 3);
  ctx.strokeStyle = '#f45cd6';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // Label
  ctx.textAlign = 'left';
  ctx.font = 'bold 22px "Inter", sans-serif';
  ctx.fillStyle = '#bdacc9';
  ctx.fillText('DESTINY COINS', barLeft + 58, frameY + cardY + 39);

  // Large Value
  ctx.font = 'bold 64px "Inter", sans-serif';
  ctx.letterSpacing = '-1.5px';
  ctx.fillStyle = '#f4f6fa';
  ctx.fillText(`${data.coins.toLocaleString('en-US')} DC`, barLeft + 24, frameY + cardY + 110);
  ctx.letterSpacing = '0px';

  // Sub-metric row inside Card 1
  ctx.beginPath();
  ctx.moveTo(barLeft + 20, frameY + cardY + 128);
  ctx.lineTo(barLeft + leftW - 20, frameY + cardY + 128);
  ctx.strokeStyle = '#403047';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = '500 14px "Inter", sans-serif';
  ctx.fillStyle = '#bdacc9';
  ctx.fillText(`Daily Streak: ${data.streakCount} Days`, barLeft + 24, frameY + cardY + 150);

  ctx.textAlign = 'right';
  ctx.fillText(`Reputation: ${data.reputationScore}% Verified`, barLeft + leftW - 24, frameY + cardY + 150);

  // PANEL 2: SESSIONS (Right Panel)
  const rightX = barLeft + leftW + 16;
  roundRect(rightX, cardY, rightW, cardH, 18);
  ctx.fillStyle = '#201726';
  ctx.fill();
  ctx.strokeStyle = '#403047';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Vector '#' Sessions Icon
  ctx.save();
  ctx.translate(rightX + 24, frameY + cardY + 22);
  ctx.beginPath();
  ctx.moveTo(8, 2);
  ctx.lineTo(5, 22);
  ctx.moveTo(16, 2);
  ctx.lineTo(13, 22);
  ctx.moveTo(2, 8);
  ctx.lineTo(20, 8);
  ctx.moveTo(1, 16);
  ctx.lineTo(19, 16);
  ctx.strokeStyle = '#f45cd6';
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();

  // Label
  ctx.textAlign = 'left';
  ctx.font = 'bold 22px "Inter", sans-serif';
  ctx.fillStyle = '#bdacc9';
  ctx.fillText('SESSIONS', rightX + 54, frameY + cardY + 39);

  // Large Value
  ctx.font = 'bold 64px "Inter", sans-serif';
  ctx.letterSpacing = '-1.5px';
  ctx.fillStyle = '#f4f6fa';
  ctx.fillText(`${data.sessionsCount}`, rightX + 24, frameY + cardY + 110);
  ctx.letterSpacing = '0px';

  // Sub-metric row inside Card 2
  ctx.beginPath();
  ctx.moveTo(rightX + 20, frameY + cardY + 128);
  ctx.lineTo(rightX + rightW - 20, frameY + cardY + 128);
  ctx.strokeStyle = '#403047';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = '500 14px "Inter", sans-serif';
  ctx.fillStyle = '#bdacc9';
  ctx.fillText(`Talk Time: ${data.talkTime}`, rightX + 24, frameY + cardY + 150);

  // -------------------------------------------------------------
  // FOOTER (y: 440)
  // -------------------------------------------------------------
  const footY = frameY + 446;

  ctx.textAlign = 'left';
  ctx.font = '500 18px "Inter", sans-serif';
  ctx.fillStyle = '#bdacc9';
  ctx.fillText('Destiny Anonymous Social Â· 100% Reputation Rating', barLeft, footY);

  ctx.textAlign = 'right';
  ctx.fillText(`${data.timezone}`, barLeft + barW, footY);
}


async function main() {
  // Real data from Supabase for user R7ZYFK
  const realData: ProCardData = {
    displayName: 'Midnight Wolf',
    destinyId: 'R7ZYFK',
    age: 25,
    gender: 'male',
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
    timezone: 'UTC+05:30',
  };

  // 1. Static PNG
  const canvas = createCanvas(960, 480);
  drawProCard(canvas.getContext('2d'), realData, 960, 480, 0, 0);
  const pngPath = path.resolve('C:/Users/basud/.gemini/antigravity/brain/941dc802-7f14-46db-9ac4-519acb6709dc/destiny_pro_card.png');
  fs.writeFileSync(pngPath, canvas.toBuffer('image/png'));
  console.log('Saved pro PNG to', pngPath);
}

main();
