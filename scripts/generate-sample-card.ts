import { createCanvas } from '@napi-rs/canvas';
import * as fs from 'fs';
import * as path from 'path';

export interface CardData {
  pseudonym: string;
  destinyId: string;
  title: string;
  age: number;
  gender: string;
  genderVerified: boolean;
  tierName: string;
  level: number;
  currentXp: number;
  nextLevelXp: number;
  totalXp: number;
  coins: number;
  streakCount: number;
  matchesCount: number;
  reputationScore: number;
  interests: string[];
}

export function drawProfileCard(data: CardData): Buffer {
  const width = 960;
  const height = 480;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Helper: rounded rectangle
  function roundRect(x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Helper: Vector Checkmark Icon
  function drawCheckmark(x: number, y: number, size: number, color: string) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x - size * 0.4, y);
    ctx.lineTo(x - size * 0.1, y + size * 0.35);
    ctx.lineTo(x + size * 0.45, y - size * 0.35);
    ctx.stroke();
    ctx.restore();
  }

  // Helper: Vector Coin Icon
  function drawCoin(x: number, y: number, r: number) {
    ctx.save();
    // Outer coin glow & rim
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    const grad = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    grad.addColorStop(0, '#FDE047');
    grad.addColorStop(0.5, '#EAB308');
    grad.addColorStop(1, '#CA8A04');
    ctx.fillStyle = grad;
    ctx.fill();

    // Inner groove
    ctx.beginPath();
    ctx.arc(x, y, r - 2.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Center star symbol
    ctx.fillStyle = '#713F12';
    ctx.font = `bold ${Math.round(r * 1.2)}px "Bahnschrift", Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('C', x, y + 1);
    ctx.restore();
  }

  // Helper: Vector Flame Icon
  function drawFlame(x: number, y: number, size: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, size);
    ctx.bezierCurveTo(-size * 0.8, size * 0.6, -size * 0.9, -size * 0.1, -size * 0.2, -size * 0.7);
    ctx.bezierCurveTo(-size * 0.1, -size * 0.4, size * 0.1, -size * 0.3, size * 0.2, -size * 0.5);
    ctx.bezierCurveTo(size * 0.8, -size * 0.2, size * 0.8, size * 0.6, 0, size);
    ctx.closePath();
    const fGrad = ctx.createLinearGradient(0, -size * 0.7, 0, size);
    fGrad.addColorStop(0, '#FDE047');
    fGrad.addColorStop(0.4, '#F97316');
    fGrad.addColorStop(1, '#DC2626');
    ctx.fillStyle = fGrad;
    ctx.fill();
    ctx.restore();
  }

  // Helper: Vector Chat Bubble Icon
  function drawChatBubble(x: number, y: number, w: number, h: number) {
    ctx.save();
    ctx.translate(x, y);
    roundRect(-w / 2, -h / 2, w, h, 4);
    const cGrad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    cGrad.addColorStop(0, '#C084FC');
    cGrad.addColorStop(1, '#7C3AED');
    ctx.fillStyle = cGrad;
    ctx.fill();

    // Little tail
    ctx.beginPath();
    ctx.moveTo(-w * 0.2, h / 2);
    ctx.lineTo(-w * 0.35, h / 2 + 4);
    ctx.lineTo(-w * 0.05, h / 2);
    ctx.closePath();
    ctx.fillStyle = '#7C3AED';
    ctx.fill();

    // Inner chat dots
    ctx.fillStyle = '#FFFFFF';
    [-w * 0.22, 0, w * 0.22].forEach((dx) => {
      ctx.beginPath();
      ctx.arc(dx, 0, 1.8, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  // Helper: Draw 4-Point Star
  function drawStar(x: number, y: number, r: number, color: string, glow: boolean = false) {
    ctx.save();
    if (glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 1. BASE DARK COSMIC BACKGROUND
  const bgGrad = ctx.createRadialGradient(280, 100, 60, width / 2, height / 2, 620);
  bgGrad.addColorStop(0, '#1c1333');
  bgGrad.addColorStop(0.45, '#120d22');
  bgGrad.addColorStop(1, '#090710');

  // Clip the entire canvas into rounded corners
  roundRect(0, 0, width, height, 24);
  ctx.clip();

  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // 2. AMBIENT NEBULA GLOWS
  // Top-left purple glow
  const glow1 = ctx.createRadialGradient(160, 90, 10, 160, 90, 240);
  glow1.addColorStop(0, 'rgba(168, 85, 247, 0.25)');
  glow1.addColorStop(1, 'rgba(168, 85, 247, 0)');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, width, height);

  // Top-right magenta/cyan aura
  const glow2 = ctx.createRadialGradient(width - 130, 80, 10, width - 130, 80, 220);
  glow2.addColorStop(0, 'rgba(236, 72, 153, 0.2)');
  glow2.addColorStop(0.5, 'rgba(6, 182, 212, 0.08)');
  glow2.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, width, height);

  // 3. SUBTLE COSMIC SPARKLES (+)
  const starsList: [number, number, number][] = [
    [70, 40, 4], [220, 28, 5], [440, 50, 3.5], [550, 30, 4.5], [630, 75, 3.5],
    [900, 35, 5], [65, 175, 4], [470, 180, 4], [915, 185, 3.5],
    [55, 410, 4.5], [310, 445, 3.5], [690, 440, 4], [895, 420, 4]
  ];
  for (const [sx, sy, size] of starsList) {
    drawStar(sx, sy, size, 'rgba(255, 255, 255, 0.35)');
  }

  // 4. OUTER GLASSMORPHIС BORDER
  roundRect(1, 1, width - 2, height - 2, 24);
  const borderGrad = ctx.createLinearGradient(0, 0, width, height);
  borderGrad.addColorStop(0, 'rgba(192, 132, 252, 0.45)');
  borderGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.08)');
  borderGrad.addColorStop(1, 'rgba(59, 130, 246, 0.35)');
  ctx.strokeStyle = borderGrad;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // -------------------------------------------------------------
  // HEADER SECTION (Left: Avatar & Identity | Right: Tier & Level)
  // -------------------------------------------------------------
  const avatarX = 80;
  const avatarY = 76;
  const avatarR = 44;

  // Outer glowing aura
  const avatarAura = ctx.createRadialGradient(avatarX, avatarY, avatarR - 5, avatarX, avatarY, avatarR + 16);
  avatarAura.addColorStop(0, 'rgba(168, 85, 247, 0.45)');
  avatarAura.addColorStop(1, 'rgba(168, 85, 247, 0)');
  ctx.fillStyle = avatarAura;
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarR + 16, 0, Math.PI * 2);
  ctx.fill();

  // Outer ring border
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarR + 3, 0, Math.PI * 2);
  const ringGrad = ctx.createLinearGradient(avatarX - avatarR, avatarY - avatarR, avatarX + avatarR, avatarY + avatarR);
  ringGrad.addColorStop(0, '#EC4899');
  ringGrad.addColorStop(0.5, '#A855F7');
  ringGrad.addColorStop(1, '#06B6D4');
  ctx.strokeStyle = ringGrad;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Avatar disc
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
  ctx.clip();
  const avatarBg = ctx.createLinearGradient(avatarX - avatarR, avatarY - avatarR, avatarX + avatarR, avatarY + avatarR);
  avatarBg.addColorStop(0, '#2b1754');
  avatarBg.addColorStop(1, '#130c24');
  ctx.fillStyle = avatarBg;
  ctx.fillRect(avatarX - avatarR, avatarY - avatarR, avatarR * 2, avatarR * 2);

  // Avatar Persona Artwork / Icon
  ctx.font = '44px "Segoe UI Emoji", "Segoe UI", Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🦊', avatarX, avatarY + 2);
  ctx.restore();

  // Status Indicator Dot (Online / Active verified)
  ctx.beginPath();
  ctx.arc(avatarX + 31, avatarY + 31, 8.5, 0, Math.PI * 2);
  ctx.fillStyle = '#100c1e';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(avatarX + 31, avatarY + 31, 6.5, 0, Math.PI * 2);
  ctx.fillStyle = '#10B981';
  ctx.fill();

  // IDENTITY TEXT
  const textLeft = 145;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Row 1: Pseudonym + Destiny ID Badge + Verification Pill
  ctx.font = 'bold 28px "Segoe UI", Arial';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(data.pseudonym, textLeft, 64);

  const nameWidth = ctx.measureText(data.pseudonym).width;

  // Destiny ID Badge Pill
  const idX = textLeft + nameWidth + 12;
  const idY = 44;
  const idText = data.destinyId;
  ctx.font = 'bold 12px "Consolas", "Courier New", monospace';
  const idTextWidth = ctx.measureText(idText).width;
  roundRect(idX, idY, idTextWidth + 16, 22, 6);
  ctx.fillStyle = 'rgba(168, 85, 247, 0.16)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(168, 85, 247, 0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#D8B4FE';
  ctx.fillText(idText, idX + 8, idY + 15);

  // Verified Pill (with vector checkmark!)
  if (data.genderVerified) {
    const vX = idX + idTextWidth + 24;
    const vText = 'VERIFIED';
    ctx.font = 'bold 11px "Segoe UI", Arial';
    const vWidth = ctx.measureText(vText).width;
    roundRect(vX, idY, vWidth + 26, 22, 6);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.16)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw vector checkmark inside pill
    drawCheckmark(vX + 11, idY + 11, 10, '#34D399');

    ctx.fillStyle = '#34D399';
    ctx.fillText(vText, vX + 19, idY + 15);
  }

  // Row 2: Title & Metadata Subtitle
  drawStar(textLeft + 4, 86, 4, '#C084FC', true);
  ctx.font = '14px "Segoe UI", Arial';
  ctx.fillStyle = '#C084FC';
  ctx.fillText(data.title.replace(/^[^a-zA-Z0-9]+/, ''), textLeft + 16, 90);

  const cleanTitleWidth = ctx.measureText(data.title.replace(/^[^a-zA-Z0-9]+/, '')).width + 16;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.fillText(' • ', textLeft + cleanTitleWidth, 90);

  ctx.fillStyle = '#94A3B8';
  const metaText = `Age ${data.age} · ${data.gender}`;
  ctx.fillText(metaText, textLeft + cleanTitleWidth + 16, 90);

  // Row 3: Small reputation hint
  ctx.font = '12px "Segoe UI", Arial';
  ctx.fillStyle = '#64748B';
  ctx.fillText('Global Anonymous Persona · 100% Reputation Score', textLeft, 110);

  // -------------------------------------------------------------
  // RIGHT HEADER: TIER & LEVEL CREST
  // -------------------------------------------------------------
  const crestCenterX = width - 80;
  const crestCenterY = 76;

  // Draw Glowing Celestial Crest Emblem (Lotus / Star Geometry)
  ctx.save();
  ctx.translate(crestCenterX, crestCenterY);

  // Ambient glow behind emblem
  const emblemGlow = ctx.createRadialGradient(0, 0, 5, 0, 0, 48);
  emblemGlow.addColorStop(0, 'rgba(236, 72, 153, 0.45)');
  emblemGlow.addColorStop(1, 'rgba(236, 72, 153, 0)');
  ctx.fillStyle = emblemGlow;
  ctx.beginPath();
  ctx.arc(0, 0, 48, 0, Math.PI * 2);
  ctx.fill();

  // Crest Outer Petals (Geometric Diamond Lotus)
  for (let i = 0; i < 8; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.lineTo(7, -15);
    ctx.lineTo(0, 0);
    ctx.lineTo(-7, -15);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? 'rgba(236, 72, 153, 0.9)' : 'rgba(168, 85, 247, 0.75)';
    ctx.fill();
  }
  // Center gem
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = '#EC4899';
  ctx.shadowBlur = 12;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.beginPath();
  ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
  ctx.fillStyle = '#F43F5E';
  ctx.fill();
  ctx.restore();

  // Tier, Level & XP text (Right aligned next to crest)
  const tierRightX = width - 145;
  ctx.textAlign = 'right';

  // Tier Name
  ctx.font = 'bold 13px "Segoe UI", Arial';
  ctx.fillStyle = '#F472B6';
  ctx.fillText(data.tierName.toUpperCase(), tierRightX, 54);

  // Level
  ctx.font = '14px "Segoe UI", Arial';
  ctx.fillStyle = '#94A3B8';
  ctx.fillText('LVL', tierRightX - 60, 88);

  ctx.font = 'bold 42px "Bahnschrift", "Segoe UI", Arial';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(`${data.level}`, tierRightX, 88);

  // Total XP
  ctx.font = '13px "Segoe UI", Arial';
  ctx.fillStyle = '#C084FC';
  ctx.fillText(`${data.totalXp.toLocaleString()} XP`, tierRightX, 108);

  // -------------------------------------------------------------
  // PROGRESS BAR SECTION (Well below header now, at Y = 152)
  // -------------------------------------------------------------
  const barY = 156;
  const barLeft = 45;
  const barWidth = width - 90; // 870px
  const barHeight = 12;

  // Header above progress bar
  ctx.textAlign = 'left';
  ctx.font = 'bold 12px "Segoe UI", Arial';
  ctx.fillStyle = '#94A3B8';
  ctx.fillText('CONNECTION PROGRESS', barLeft, barY - 10);

  ctx.textAlign = 'right';
  ctx.font = '12px "Segoe UI", Arial';
  ctx.fillStyle = '#E2E8F0';
  const progressRatio = Math.min(1, Math.max(0, data.currentXp / data.nextLevelXp));
  const progressPct = Math.round(progressRatio * 100);
  ctx.fillText(`${data.currentXp.toLocaleString()} / ${data.nextLevelXp.toLocaleString()} XP (${progressPct}%)`, barLeft + barWidth, barY - 10);

  // Track (background)
  roundRect(barLeft, barY, barWidth, barHeight, 6);
  ctx.fillStyle = '#1e1930';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Progress Fill
  const fillWidth = Math.max(16, barWidth * progressRatio);
  roundRect(barLeft, barY, fillWidth, barHeight, 6);
  const fillGrad = ctx.createLinearGradient(barLeft, barY, barLeft + fillWidth, barY);
  fillGrad.addColorStop(0, '#EC4899');
  fillGrad.addColorStop(0.5, '#A855F7');
  fillGrad.addColorStop(1, '#06B6D4');
  ctx.fillStyle = fillGrad;
  ctx.fill();

  // Glowing cap at the end of progress
  ctx.beginPath();
  ctx.arc(barLeft + fillWidth - 2, barY + barHeight / 2, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = '#06B6D4';
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.shadowBlur = 0;

  // -------------------------------------------------------------
  // 3 STAT METRIC CARDS (HORIZONTAL GRID)
  // -------------------------------------------------------------
  const cardTop = 188;
  const cardHeight = 114;
  const cardGap = 16;
  const totalCardsWidth = barWidth;
  const singleCardWidth = (totalCardsWidth - cardGap * 2) / 3; // ~279px each

  const stats = [
    {
      label: 'DESTINY COINS',
      drawIcon: (cx: number, cy: number) => drawCoin(cx, cy, 10),
      value: `${data.coins.toLocaleString()} DC`,
      subtext: 'Global Vault • Ready to Spend',
      accent: '#FBBF24',
      bgGlow: 'rgba(251, 191, 36, 0.08)'
    },
    {
      label: 'DAILY STREAK',
      drawIcon: (cx: number, cy: number) => drawFlame(cx, cy - 2, 11),
      value: `${data.streakCount} Days`,
      subtext: '2.0x Reward Multiplier Active',
      accent: '#F97316',
      bgGlow: 'rgba(249, 115, 22, 0.08)'
    },
    {
      label: 'ANONYMOUS SESSIONS',
      drawIcon: (cx: number, cy: number) => drawChatBubble(cx, cy, 19, 14),
      value: `${data.matchesCount} Matches`,
      subtext: `${data.reputationScore}% Safe Chat Score`,
      accent: '#A855F7',
      bgGlow: 'rgba(168, 85, 247, 0.08)'
    }
  ];

  stats.forEach((st, idx) => {
    const cx = barLeft + idx * (singleCardWidth + cardGap);

    // Glassmorphic Card Container
    roundRect(cx, cardTop, singleCardWidth, cardHeight, 16);
    ctx.fillStyle = 'rgba(22, 17, 36, 0.75)';
    ctx.fill();

    // Subtle inner accent tint
    const innerTint = ctx.createRadialGradient(cx + 40, cardTop + 40, 5, cx + 40, cardTop + 40, 100);
    innerTint.addColorStop(0, st.bgGlow);
    innerTint.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = innerTint;
    ctx.fill();

    // Border
    roundRect(cx, cardTop, singleCardWidth, cardHeight, 16);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Left accent bar
    roundRect(cx, cardTop + 14, 4, cardHeight - 28, 2);
    ctx.fillStyle = st.accent;
    ctx.fill();

    // Card Content
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Draw Vector Icon
    st.drawIcon(cx + 26, cardTop + 26);

    // Label
    ctx.font = 'bold 11px "Segoe UI", Arial';
    ctx.fillStyle = '#94A3B8';
    ctx.fillText(st.label, cx + 44, cardTop + 30);

    // Big Value
    ctx.font = 'bold 28px "Bahnschrift", "Segoe UI", Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(st.value, cx + 20, cardTop + 69);

    // Subtext
    ctx.font = '12px "Segoe UI", Arial';
    ctx.fillStyle = '#64748B';
    ctx.fillText(st.subtext, cx + 20, cardTop + 95);
  });

  // -------------------------------------------------------------
  // INTERESTS / BADGES PILL ROW (Y = 328)
  // -------------------------------------------------------------
  const pillY = 328;
  ctx.textAlign = 'left';
  ctx.font = 'bold 11px "Segoe UI", Arial';
  ctx.fillStyle = '#94A3B8';
  ctx.fillText('DISCOVERY INTERESTS', barLeft, pillY + 16);

  let currentPillX = barLeft + 155;
  const pillHeight = 28;

  for (const item of data.interests) {
    ctx.font = '12px "Segoe UI Emoji", "Segoe UI", Arial';
    const textWidth = ctx.measureText(item).width;
    const pillWidth = textWidth + 24;

    if (currentPillX + pillWidth > barLeft + barWidth) break;

    // Pill container
    roundRect(currentPillX, pillY, pillWidth, pillHeight, 14);
    ctx.fillStyle = 'rgba(168, 85, 247, 0.12)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Pill text
    ctx.fillStyle = '#E2E8F0';
    ctx.fillText(item, currentPillX + 12, pillY + 18);

    currentPillX += pillWidth + 10;
  }

  // -------------------------------------------------------------
  // FOOTER DIVIDER & BRANDING (Y = 385)
  // -------------------------------------------------------------
  const footerY = 385;
  ctx.beginPath();
  ctx.moveTo(barLeft, footerY);
  ctx.lineTo(barLeft + barWidth, footerY);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Footer Metadata
  const footerTextY = 418;
  ctx.textAlign = 'left';

  // Small vector star in footer
  drawStar(barLeft + 5, footerTextY - 4, 4, '#A855F7', true);

  ctx.font = '12px "Segoe UI", Arial';
  ctx.fillStyle = '#64748B';
  ctx.fillText('Destiny Anonymous Social · End-to-End Persona Masking Active', barLeft + 16, footerTextY);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#475569';
  ctx.fillText('Shard #0 · Production Node · 2026', barLeft + barWidth, footerTextY);

  return canvas.toBuffer('image/png');
}

// Direct test execution
const sampleData: CardData = {
  pseudonym: 'Celestial Fox',
  destinyId: 'DST-7A9K2',
  title: 'Cosmic Soul',
  age: 22,
  gender: 'Female',
  genderVerified: true,
  tierName: 'Destiny Tier',
  level: 42,
  currentXp: 7450,
  nextLevelXp: 10000,
  totalXp: 388926,
  coins: 2850,
  streakCount: 14,
  matchesCount: 68,
  reputationScore: 100,
  interests: ['🎮 Gaming', '🎵 Lo-Fi Music', '🌌 Astronomy', '☕ Deep Talks', '💻 Tech']
};

const buffer = drawProfileCard(sampleData);
const outputPath = path.resolve('C:\\Users\\basud\\.gemini\\antigravity\\brain\\941dc802-7f14-46db-9ac4-519acb6709dc\\destiny_profile_sample.png');
fs.writeFileSync(outputPath, buffer);
console.log(`Successfully generated refined profile card at ${outputPath} (${buffer.length} bytes)`);
