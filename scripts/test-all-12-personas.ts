import { createCanvas } from '@napi-rs/canvas';
import * as fs from 'fs';

export function drawPersonaAvatar(
  ctx: any,
  pseudonym: string,
  sqX: number,
  sqY: number,
  sqSize: number
) {
  const pLower = (pseudonym || '').toLowerCase();

  // Squircle background fill & clip
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(sqX, sqY, sqSize, sqSize, Math.round(sqSize * 0.185));
  ctx.clip();

  // Dark obsidian gradient
  const grad = ctx.createLinearGradient(sqX, sqY, sqX + sqSize, sqY + sqSize);
  grad.addColorStop(0, '#191c22');
  grad.addColorStop(1, '#0c0d10');
  ctx.fillStyle = grad;
  ctx.fillRect(sqX, sqY, sqSize, sqSize);

  // Radial inner ambient sheen
  const cx = sqX + sqSize / 2;
  const cy = sqY + sqSize / 2;
  const radialGlow = ctx.createRadialGradient(cx, cy - sqSize * 0.1, 0, cx, cy, sqSize * 0.7);
  radialGlow.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
  radialGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = radialGlow;
  ctx.fillRect(sqX, sqY, sqSize, sqSize);

  const scale = sqSize / 130;
  ctx.save();
  ctx.translate(cx, cy + 3 * scale);
  ctx.scale(scale, scale);

  // Background celestial star dust
  const stars = [
    [-42, -35, 1.1], [38, -38, 1.0], [-38, 30, 0.9], [42, 25, 1.1],
    [-20, -44, 0.7], [22, -45, 0.8], [-45, -5, 0.7], [46, -2, 0.8]
  ];
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  for (const [sx, sy, sr] of stars) {
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Two 4-point celestial twinkle stars in upper corners
  const drawTwinkle = (tx: number, ty: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(tx, ty - r);
    ctx.lineTo(tx + r * 0.25, ty - r * 0.25);
    ctx.lineTo(tx + r, ty);
    ctx.lineTo(tx + r * 0.25, ty + r * 0.25);
    ctx.lineTo(tx, ty + r);
    ctx.lineTo(tx - r * 0.25, ty + r * 0.25);
    ctx.lineTo(tx - r, ty);
    ctx.lineTo(tx - r * 0.25, ty - r * 0.25);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fill();
  };
  drawTwinkle(-38, -34, 4.5);
  drawTwinkle(38, -34, 4.5);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (pLower.includes('fox')) {
    // FOX
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;

    ctx.beginPath();
    ctx.moveTo(-10, -18); ctx.lineTo(-28, -44); ctx.lineTo(-24, -6);
    ctx.moveTo(10, -18); ctx.lineTo(28, -44); ctx.lineTo(24, -6);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(-14, -16); ctx.lineTo(-24, -36); ctx.lineTo(-20, -10);
    ctx.moveTo(14, -16); ctx.lineTo(24, -36); ctx.lineTo(20, -10);
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-10, -18); ctx.quadraticCurveTo(0, -14, 10, -18);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -22); ctx.lineTo(2.5, -17); ctx.lineTo(0, -12); ctx.lineTo(-2.5, -17); ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-24, -6); ctx.lineTo(-28, 4); ctx.lineTo(-20, 10); ctx.lineTo(-24, 16);
    ctx.lineTo(-12, 22); ctx.lineTo(0, 32); ctx.lineTo(12, 22); ctx.lineTo(24, 16);
    ctx.lineTo(20, 10); ctx.lineTo(28, 4); ctx.lineTo(24, -6);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-7, -4); ctx.lineTo(-4, 16); ctx.lineTo(0, 24); ctx.lineTo(4, 16); ctx.lineTo(7, -4);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-3, 27); ctx.lineTo(3, 27); ctx.lineTo(0, 31); ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    const drawEye = (ex: number, ey: number, flip: boolean) => {
      ctx.save();
      ctx.translate(ex, ey);
      if (flip) ctx.scale(-1, 1);
      ctx.beginPath();
      ctx.moveTo(-7, -2); ctx.quadraticCurveTo(0, -5, 7, 1); ctx.quadraticCurveTo(0, 2, -7, -2);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(1, -1, 1, 2.5, Math.PI / 12, 0, Math.PI * 2);
      ctx.fillStyle = '#0e1014';
      ctx.fill();
      ctx.restore();
    };
    drawEye(-12, 2, false);
    drawEye(12, 2, true);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-16, 20); ctx.lineTo(-32, 22);
    ctx.moveTo(-15, 24); ctx.lineTo(-30, 29);
    ctx.moveTo(16, 20); ctx.lineTo(32, 22);
    ctx.moveTo(15, 24); ctx.lineTo(30, 29);
    ctx.stroke();
  } else if (pLower.includes('wolf')) {
    // WOLF
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-12, -18); ctx.lineTo(-24, -46); ctx.lineTo(-14, -8);
    ctx.moveTo(12, -18); ctx.lineTo(24, -46); ctx.lineTo(14, -8);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(-14, -14); ctx.lineTo(-20, -36); ctx.lineTo(-16, -10);
    ctx.moveTo(14, -14); ctx.lineTo(20, -36); ctx.lineTo(16, -10);
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-14, -8); ctx.lineTo(-26, 4); ctx.lineTo(-20, 14); ctx.lineTo(-24, 20);
    ctx.lineTo(-10, 26); ctx.lineTo(0, 34); ctx.lineTo(10, 26); ctx.lineTo(24, 20);
    ctx.lineTo(20, 14); ctx.lineTo(26, 4); ctx.lineTo(14, -8);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-8, -4); ctx.lineTo(-5, 18); ctx.lineTo(0, 26); ctx.lineTo(5, 18); ctx.lineTo(8, -4);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-4, 28); ctx.lineTo(4, 28); ctx.lineTo(0, 33); ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-16, 2); ctx.lineTo(-8, 5); ctx.lineTo(-14, 8); ctx.closePath();
    ctx.moveTo(16, 2); ctx.lineTo(8, 5); ctx.lineTo(14, 8); ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(0, -30, 14, Math.PI * 0.7, Math.PI * 1.8);
    ctx.stroke();
  } else if (pLower.includes('phoenix')) {
    // PHOENIX
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, 18);
    ctx.quadraticCurveTo(-20, 12, -36, -10);
    ctx.quadraticCurveTo(-26, -18, -32, -32);
    ctx.quadraticCurveTo(-18, -20, -16, -6);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, 18);
    ctx.quadraticCurveTo(20, 12, 36, -10);
    ctx.quadraticCurveTo(26, -18, 32, -32);
    ctx.quadraticCurveTo(18, -20, 16, -6);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -12); ctx.lineTo(0, -42);
    ctx.moveTo(-5, -10); ctx.lineTo(-8, -36);
    ctx.moveTo(5, -10); ctx.lineTo(8, -36);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -16); ctx.lineTo(-4, -6); ctx.lineTo(0, 0); ctx.lineTo(4, -6); ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.quadraticCurveTo(8, 18, 0, 30);
    ctx.quadraticCurveTo(-8, 18, 0, 8);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  } else if (pLower.includes('owl')) {
    // OWL
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-8, -14); ctx.lineTo(-24, -38); ctx.lineTo(-22, -10);
    ctx.moveTo(8, -14); ctx.lineTo(24, -38); ctx.lineTo(22, -10);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-22, -10);
    ctx.quadraticCurveTo(-30, 10, -18, 24);
    ctx.quadraticCurveTo(0, 30, 18, 24);
    ctx.quadraticCurveTo(30, 10, 22, -10);
    ctx.stroke();

    ctx.beginPath(); ctx.arc(-13, 0, 11, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(13, 0, 11, 0, Math.PI * 2); ctx.stroke();

    ctx.beginPath(); ctx.arc(-13, 0, 5, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.beginPath(); ctx.arc(13, 0, 5, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.lineTo(0, 12); ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  } else if (pLower.includes('dragon')) {
    // DRAGON
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-10, -12); ctx.quadraticCurveTo(-22, -26, -28, -44);
    ctx.moveTo(10, -12); ctx.quadraticCurveTo(22, -26, 28, -44);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-10, -12); ctx.lineTo(0, -18); ctx.lineTo(10, -12);
    ctx.lineTo(22, -2); ctx.lineTo(18, 14); ctx.lineTo(24, 20);
    ctx.lineTo(14, 26); ctx.lineTo(0, 32); ctx.lineTo(-14, 26);
    ctx.lineTo(-24, 20); ctx.lineTo(-18, 14); ctx.lineTo(-22, -2);
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-14, 0); ctx.lineTo(-6, 2); ctx.lineTo(-12, 5); ctx.closePath();
    ctx.moveTo(14, 0); ctx.lineTo(6, 2); ctx.lineTo(12, 5); ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-5, 24); ctx.lineTo(-2, 27);
    ctx.moveTo(5, 24); ctx.lineTo(2, 27);
    ctx.stroke();
  } else if (pLower.includes('stag')) {
    // STAG
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-6, -16); ctx.lineTo(-18, -36); ctx.lineTo(-30, -42);
    ctx.moveTo(-18, -36); ctx.lineTo(-16, -46);
    ctx.moveTo(-12, -26); ctx.lineTo(-26, -30);
    ctx.moveTo(6, -16); ctx.lineTo(18, -36); ctx.lineTo(30, -42);
    ctx.moveTo(18, -36); ctx.lineTo(16, -46);
    ctx.moveTo(12, -26); ctx.lineTo(26, -30);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-10, -10); ctx.quadraticCurveTo(-26, -12, -28, -4); ctx.quadraticCurveTo(-18, 2, -8, -4);
    ctx.moveTo(10, -10); ctx.quadraticCurveTo(26, -12, 28, -4); ctx.quadraticCurveTo(18, 2, 8, -4);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-8, -6); ctx.lineTo(-14, 6); ctx.lineTo(-8, 20); ctx.lineTo(0, 28);
    ctx.lineTo(8, 20); ctx.lineTo(14, 6); ctx.lineTo(8, -6);
    ctx.stroke();

    ctx.beginPath(); ctx.arc(-8, 6, 2, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.beginPath(); ctx.arc(8, 6, 2, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
  } else if (pLower.includes('lynx')) {
    // LYNX
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    // Pointed cat ears with tuft spikes
    ctx.beginPath();
    ctx.moveTo(-10, -14); ctx.lineTo(-24, -40); ctx.lineTo(-20, -48); ctx.lineTo(-20, -6);
    ctx.moveTo(10, -14); ctx.lineTo(24, -40); ctx.lineTo(20, -48); ctx.lineTo(20, -6);
    ctx.stroke();

    // Cheek ruffs
    ctx.beginPath();
    ctx.moveTo(-20, -6); ctx.lineTo(-30, 6); ctx.lineTo(-20, 14); ctx.lineTo(-28, 22);
    ctx.lineTo(-12, 26); ctx.lineTo(0, 30); ctx.lineTo(12, 26); ctx.lineTo(28, 22);
    ctx.lineTo(20, 14); ctx.lineTo(30, 6); ctx.lineTo(20, -6);
    ctx.stroke();

    // Slit feline eyes
    ctx.beginPath();
    ctx.moveTo(-14, 2); ctx.quadraticCurveTo(-8, -2, -6, 4); ctx.quadraticCurveTo(-10, 6, -14, 2);
    ctx.moveTo(14, 2); ctx.quadraticCurveTo(8, -2, 6, 4); ctx.quadraticCurveTo(10, 6, 14, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Nose
    ctx.beginPath(); ctx.moveTo(-3, 22); ctx.lineTo(3, 22); ctx.lineTo(0, 26); ctx.closePath();
    ctx.fill();
  } else if (pLower.includes('bear')) {
    // BEAR
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    // Round ears
    ctx.beginPath(); ctx.arc(-24, -20, 12, Math.PI * 0.7, Math.PI * 2.1); ctx.stroke();
    ctx.beginPath(); ctx.arc(24, -20, 12, Math.PI * 0.9, Math.PI * 2.3); ctx.stroke();

    // Strong head
    ctx.beginPath();
    ctx.moveTo(-18, -14); ctx.lineTo(18, -14);
    ctx.quadraticCurveTo(30, 8, 22, 26);
    ctx.quadraticCurveTo(0, 36, -22, 26);
    ctx.quadraticCurveTo(-30, 8, -18, -14);
    ctx.stroke();

    // Muzzle & big nose
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.ellipse(0, 20, 14, 10, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-6, 15); ctx.lineTo(6, 15); ctx.lineTo(0, 21); ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Eyes
    ctx.beginPath(); ctx.arc(-12, 2, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(12, 2, 2.5, 0, Math.PI * 2); ctx.fill();
  } else if (pLower.includes('raven')) {
    // RAVEN
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    // Aerodynamic crown & crest
    ctx.beginPath();
    ctx.moveTo(-20, 24); ctx.lineTo(-16, -14); ctx.lineTo(-6, -34); ctx.lineTo(0, -38);
    ctx.lineTo(8, -30); ctx.lineTo(24, 0); ctx.lineTo(38, 14); // Beak tip
    ctx.lineTo(16, 18); ctx.lineTo(8, 28); ctx.lineTo(-12, 32); ctx.closePath();
    ctx.stroke();

    // Curved beak line
    ctx.beginPath();
    ctx.moveTo(38, 14); ctx.quadraticCurveTo(22, 10, 8, 8);
    ctx.stroke();

    // Eye with concentric ring
    ctx.beginPath(); ctx.arc(4, -4, 4, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(4, -4, 1.8, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
  } else if (pLower.includes('otter')) {
    // OTTER
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    // Round ears
    ctx.beginPath(); ctx.arc(-22, -10, 6, Math.PI * 0.5, Math.PI * 2.2); ctx.stroke();
    ctx.beginPath(); ctx.arc(22, -10, 6, Math.PI * 0.8, Math.PI * 2.5); ctx.stroke();

    // Sleek head
    ctx.beginPath();
    ctx.moveTo(-18, -16); ctx.quadraticCurveTo(0, -26, 18, -16);
    ctx.quadraticCurveTo(26, 6, 18, 24);
    ctx.quadraticCurveTo(0, 32, -18, 24);
    ctx.quadraticCurveTo(-26, 6, -18, -16);
    ctx.stroke();

    // Button nose & whisker pads
    ctx.beginPath();
    ctx.arc(0, 14, 3, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-8, 16); ctx.lineTo(-22, 14);
    ctx.moveTo(-8, 18); ctx.lineTo(-20, 22);
    ctx.moveTo(8, 16); ctx.lineTo(22, 14);
    ctx.moveTo(8, 18); ctx.lineTo(20, 22);
    ctx.stroke();

    // Friendly eyes
    ctx.beginPath(); ctx.arc(-10, 2, 2.8, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.beginPath(); ctx.arc(10, 2, 2.8, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
  } else if (pLower.includes('panda')) {
    // PANDA
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    // Big round ears
    ctx.beginPath(); ctx.arc(-26, -24, 12, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(26, -24, 12, 0, Math.PI * 2); ctx.stroke();

    // Head
    ctx.beginPath();
    ctx.ellipse(0, 4, 28, 26, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Angled oval eye patches
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(-12, 0, 8, 11, -Math.PI / 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(12, 0, 8, 11, Math.PI / 8, 0, Math.PI * 2);
    ctx.stroke();

    // Pupils
    ctx.beginPath(); ctx.arc(-11, 0, 2.5, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.beginPath(); ctx.arc(11, 0, 2.5, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.restore();

    // Nose
    ctx.beginPath(); ctx.arc(0, 16, 4, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
  } else if (pLower.includes('koala')) {
    // KOALA
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    // Fluffy wide ears
    ctx.beginPath(); ctx.arc(-30, -12, 14, Math.PI * 0.4, Math.PI * 2.3); ctx.stroke();
    ctx.beginPath(); ctx.arc(30, -12, 14, Math.PI * 0.7, Math.PI * 2.6); ctx.stroke();

    // Head
    ctx.beginPath();
    ctx.ellipse(0, 6, 26, 24, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Bold vertical oval nose
    ctx.beginPath();
    ctx.ellipse(0, 10, 7, 12, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Gentle eyes
    ctx.beginPath(); ctx.arc(-14, 2, 2.5, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.beginPath(); ctx.arc(14, 2, 2.5, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
  } else {
    // GENERIC CREATURE / CELESTIAL EMBLEM
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -36); ctx.lineTo(0, 36);
    ctx.moveTo(-36, 0); ctx.lineTo(36, 0);
    ctx.moveTo(-22, -22); ctx.lineTo(22, 22);
    ctx.moveTo(22, -22); ctx.lineTo(-22, 22);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -10); ctx.lineTo(10, 0); ctx.lineTo(0, 10); ctx.lineTo(-10, 0); ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  ctx.restore();
  ctx.restore();
}

// Generate full 12 creatures grid (4 columns x 3 rows)
const canvas = createCanvas(1200, 900);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#050607';
ctx.fillRect(0, 0, 1200, 900);

const all12Personas = [
  'Celestial Fox', 'Astral Wolf', 'Solar Phoenix', 'Midnight Owl',
  'Cosmic Dragon', 'Silent Stag', 'Velvet Lynx', 'Ethereal Bear',
  'Phantom Raven', 'Mystic Otter', 'Lunar Panda', 'Radiant Koala'
];

all12Personas.forEach((p, i) => {
  const row = Math.floor(i / 4);
  const col = i % 4;
  const x = 50 + col * 280;
  const y = 40 + row * 280;

  drawPersonaAvatar(ctx, p, x, y, 130);

  ctx.font = 'bold 18px "Inter", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(p, x + 65, y + 170);

  ctx.font = '500 12px "JetBrains Mono", monospace';
  ctx.fillStyle = '#8b929e';
  ctx.fillText('PERSONA CREST', x + 65, y + 192);
});

fs.writeFileSync('all_12_personas_grid.png', canvas.toBuffer('image/png'));
console.log('Saved all_12_personas_grid.png');
