import { createCanvas } from '@napi-rs/canvas';
import * as fs from 'fs';

// Procedural Persona Creature Vector Renderers
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

    // Ears Outer
    ctx.beginPath();
    ctx.moveTo(-10, -18);
    ctx.lineTo(-28, -44);
    ctx.lineTo(-24, -6);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(10, -18);
    ctx.lineTo(28, -44);
    ctx.lineTo(24, -6);
    ctx.stroke();

    // Ears Inner Folds
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(-14, -16);
    ctx.lineTo(-24, -36);
    ctx.lineTo(-20, -10);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(14, -16);
    ctx.lineTo(24, -36);
    ctx.lineTo(20, -10);
    ctx.stroke();

    // Brow & Forehead Diamond
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-10, -18);
    ctx.quadraticCurveTo(0, -14, 10, -18);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(2.5, -17);
    ctx.lineTo(0, -12);
    ctx.lineTo(-2.5, -17);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Cheeks & Jawline
    ctx.beginPath();
    ctx.moveTo(-24, -6);
    ctx.lineTo(-28, 4);
    ctx.lineTo(-20, 10);
    ctx.lineTo(-24, 16);
    ctx.lineTo(-12, 22);
    ctx.lineTo(0, 32);
    ctx.lineTo(12, 22);
    ctx.lineTo(24, 16);
    ctx.lineTo(20, 10);
    ctx.lineTo(28, 4);
    ctx.lineTo(24, -6);
    ctx.stroke();

    // Snout Bridge Facets
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-7, -4);
    ctx.lineTo(-4, 16);
    ctx.lineTo(0, 24);
    ctx.lineTo(4, 16);
    ctx.lineTo(7, -4);
    ctx.stroke();

    // Nose
    ctx.beginPath();
    ctx.moveTo(-3, 27);
    ctx.lineTo(3, 27);
    ctx.lineTo(0, 31);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Eyes
    const drawEye = (ex: number, ey: number, flip: boolean) => {
      ctx.save();
      ctx.translate(ex, ey);
      if (flip) ctx.scale(-1, 1);
      ctx.beginPath();
      ctx.moveTo(-7, -2);
      ctx.quadraticCurveTo(0, -5, 7, 1);
      ctx.quadraticCurveTo(0, 2, -7, -2);
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

    // Whiskers
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

    // Upright noble ears
    ctx.beginPath();
    ctx.moveTo(-12, -18); ctx.lineTo(-24, -46); ctx.lineTo(-14, -8);
    ctx.moveTo(12, -18); ctx.lineTo(24, -46); ctx.lineTo(14, -8);
    ctx.stroke();

    // Inner ear
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(-14, -14); ctx.lineTo(-20, -36); ctx.lineTo(-16, -10);
    ctx.moveTo(14, -14); ctx.lineTo(20, -36); ctx.lineTo(16, -10);
    ctx.stroke();

    // Powerful angular jaw
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-14, -8);
    ctx.lineTo(-26, 4);
    ctx.lineTo(-20, 14);
    ctx.lineTo(-24, 20);
    ctx.lineTo(-10, 26);
    ctx.lineTo(0, 34);
    ctx.lineTo(10, 26);
    ctx.lineTo(24, 20);
    ctx.lineTo(20, 14);
    ctx.lineTo(26, 4);
    ctx.lineTo(14, -8);
    ctx.stroke();

    // Muzzle & Nose
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-8, -4); ctx.lineTo(-5, 18); ctx.lineTo(0, 26); ctx.lineTo(5, 18); ctx.lineTo(8, -4);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-4, 28); ctx.lineTo(4, 28); ctx.lineTo(0, 33); ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Wolf predator eyes
    ctx.beginPath();
    ctx.moveTo(-16, 2); ctx.lineTo(-8, 5); ctx.lineTo(-14, 8); ctx.closePath();
    ctx.moveTo(16, 2); ctx.lineTo(8, 5); ctx.lineTo(14, 8); ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Crescent moon accent behind head
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(0, -30, 14, Math.PI * 0.7, Math.PI * 1.8);
    ctx.stroke();
  } else if (pLower.includes('phoenix')) {
    // PHOENIX
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;

    // Sweeping flame wings
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

    // Central crown plumage
    ctx.beginPath();
    ctx.moveTo(0, -12); ctx.lineTo(0, -42);
    ctx.moveTo(-5, -10); ctx.lineTo(-8, -36);
    ctx.moveTo(5, -10); ctx.lineTo(8, -36);
    ctx.stroke();

    // Beak & Eyes
    ctx.beginPath();
    ctx.moveTo(0, -16); ctx.lineTo(-4, -6); ctx.lineTo(0, 0); ctx.lineTo(4, -6); ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Solar flame teardrop at breast
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

    // Horned feather brows
    ctx.beginPath();
    ctx.moveTo(-8, -14); ctx.lineTo(-24, -38); ctx.lineTo(-22, -10);
    ctx.moveTo(8, -14); ctx.lineTo(24, -38); ctx.lineTo(22, -10);
    ctx.stroke();

    // Head perimeter
    ctx.beginPath();
    ctx.moveTo(-22, -10);
    ctx.quadraticCurveTo(-30, 10, -18, 24);
    ctx.quadraticCurveTo(0, 30, 18, 24);
    ctx.quadraticCurveTo(30, 10, 22, -10);
    ctx.stroke();

    // Large circular wisdom eye frames
    ctx.beginPath(); ctx.arc(-13, 0, 11, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(13, 0, 11, 0, Math.PI * 2); ctx.stroke();

    // Inner eye pupils
    ctx.beginPath(); ctx.arc(-13, 0, 5, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.beginPath(); ctx.arc(13, 0, 5, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();

    // Beak
    ctx.beginPath();
    ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.lineTo(0, 12); ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  } else if (pLower.includes('dragon')) {
    // DRAGON
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;

    // Curving horns
    ctx.beginPath();
    ctx.moveTo(-10, -12); ctx.quadraticCurveTo(-22, -26, -28, -44);
    ctx.moveTo(10, -12); ctx.quadraticCurveTo(22, -26, 28, -44);
    ctx.stroke();

    // Dragon head contour
    ctx.beginPath();
    ctx.moveTo(-10, -12); ctx.lineTo(0, -18); ctx.lineTo(10, -12);
    ctx.lineTo(22, -2); ctx.lineTo(18, 14); ctx.lineTo(24, 20);
    ctx.lineTo(14, 26); ctx.lineTo(0, 32); ctx.lineTo(-14, 26);
    ctx.lineTo(-24, 20); ctx.lineTo(-18, 14); ctx.lineTo(-22, -2);
    ctx.closePath();
    ctx.stroke();

    // Eye slits
    ctx.beginPath();
    ctx.moveTo(-14, 0); ctx.lineTo(-6, 2); ctx.lineTo(-12, 5); ctx.closePath();
    ctx.moveTo(14, 0); ctx.lineTo(6, 2); ctx.lineTo(12, 5); ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Snout ridge & nostrils
    ctx.beginPath();
    ctx.moveTo(-5, 24); ctx.lineTo(-2, 27);
    ctx.moveTo(5, 24); ctx.lineTo(2, 27);
    ctx.stroke();
  } else if (pLower.includes('stag')) {
    // STAG
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;

    // Branching Antlers
    ctx.beginPath();
    ctx.moveTo(-6, -16); ctx.lineTo(-18, -36); ctx.lineTo(-30, -42);
    ctx.moveTo(-18, -36); ctx.lineTo(-16, -46);
    ctx.moveTo(-12, -26); ctx.lineTo(-26, -30);
    ctx.moveTo(6, -16); ctx.lineTo(18, -36); ctx.lineTo(30, -42);
    ctx.moveTo(18, -36); ctx.lineTo(16, -46);
    ctx.moveTo(12, -26); ctx.lineTo(26, -30);
    ctx.stroke();

    // Ears
    ctx.beginPath();
    ctx.moveTo(-10, -10); ctx.quadraticCurveTo(-26, -12, -28, -4); ctx.quadraticCurveTo(-18, 2, -8, -4);
    ctx.moveTo(10, -10); ctx.quadraticCurveTo(26, -12, 28, -4); ctx.quadraticCurveTo(18, 2, 8, -4);
    ctx.stroke();

    // Slender face & muzzle
    ctx.beginPath();
    ctx.moveTo(-8, -6); ctx.lineTo(-14, 6); ctx.lineTo(-8, 20); ctx.lineTo(0, 28);
    ctx.lineTo(8, 20); ctx.lineTo(14, 6); ctx.lineTo(8, -6);
    ctx.stroke();

    // Forehead star & eyes
    ctx.beginPath(); ctx.arc(-8, 6, 2, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.beginPath(); ctx.arc(8, 6, 2, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
  } else {
    // GENERIC CREATURE / CELESTIAL EMBLEM
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    // Central celestial crest star
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.stroke();

    // 8-point compass starburst
    ctx.beginPath();
    ctx.moveTo(0, -36); ctx.lineTo(0, 36);
    ctx.moveTo(-36, 0); ctx.lineTo(36, 0);
    ctx.moveTo(-22, -22); ctx.lineTo(22, 22);
    ctx.moveTo(22, -22); ctx.lineTo(-22, 22);
    ctx.stroke();

    // Diamond core
    ctx.beginPath();
    ctx.moveTo(0, -10); ctx.lineTo(10, 0); ctx.lineTo(0, 10); ctx.lineTo(-10, 0); ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  ctx.restore();
  ctx.restore();
}

// Generate a test sheet with 6 personas: Fox, Wolf, Phoenix, Owl, Dragon, Stag
const canvas = createCanvas(900, 600);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#050607';
ctx.fillRect(0, 0, 900, 600);

const testPersonas = [
  'Celestial Fox', 'Astral Wolf', 'Solar Phoenix',
  'Midnight Owl', 'Cosmic Dragon', 'Silent Stag'
];

testPersonas.forEach((p, i) => {
  const row = Math.floor(i / 3);
  const col = i % 3;
  const x = 50 + col * 280;
  const y = 40 + row * 260;

  drawPersonaAvatar(ctx, p, x, y, 130);

  // Name
  ctx.font = 'bold 18px "Inter", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(p, x + 65, y + 170);

  ctx.font = '500 12px "JetBrains Mono", monospace';
  ctx.fillStyle = '#8b929e';
  ctx.fillText('PERSONA CREST', x + 65, y + 192);
});

fs.writeFileSync('test_personas_grid.png', canvas.toBuffer('image/png'));
console.log('Saved test_personas_grid.png');
