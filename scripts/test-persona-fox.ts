import { createCanvas } from '@napi-rs/canvas';
import * as fs from 'fs';

function drawPersonaFox(ctx: any, cx: number, cy: number, scale: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  // 1. Constellation background dots inside avatar
  const stars = [
    [-42, -35, 1.2], [38, -38, 1.0], [-38, 30, 0.9], [42, 25, 1.1],
    [-20, -42, 0.7], [22, -44, 0.8], [-45, -5, 0.7], [46, -2, 0.8]
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
  drawTwinkle(-36, -32, 5);
  drawTwinkle(36, -32, 5);

  // 2. Fox Vector Geometry (Ultra-Thin 1.2px - 1.5px Monochrome Luxury)
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Ears Outer
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.4;

  // Left Ear Outer
  ctx.beginPath();
  ctx.moveTo(-10, -18);
  ctx.lineTo(-28, -44);
  ctx.lineTo(-24, -6);
  ctx.stroke();

  // Right Ear Outer
  ctx.beginPath();
  ctx.moveTo(10, -18);
  ctx.lineTo(28, -44);
  ctx.lineTo(24, -6);
  ctx.stroke();

  // Ears Inner Folds (Delicate Hairline 1.0px)
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

  // Forehead Crown & Brow
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-10, -18);
  ctx.quadraticCurveTo(0, -14, 10, -18);
  ctx.stroke();

  // Celestial Diamond on Forehead
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
  ctx.lineTo(0, 32); // Snout tip
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

  // Nose (Small Inverted Triangle)
  ctx.beginPath();
  ctx.moveTo(-3, 27);
  ctx.lineTo(3, 27);
  ctx.lineTo(0, 31);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Slanted Fox Eyes (Feline Slits)
  const drawFoxEye = (ex: number, ey: number, flip: boolean) => {
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
    // Slit pupil
    ctx.beginPath();
    ctx.ellipse(1, -1, 1, 2.5, Math.PI / 12, 0, Math.PI * 2);
    ctx.fillStyle = '#0e1014';
    ctx.fill();
    ctx.restore();
  };

  drawFoxEye(-12, 2, false);
  drawFoxEye(12, 2, true);

  // Delicate Whiskers
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 0.9;
  // Left
  ctx.beginPath();
  ctx.moveTo(-16, 20);
  ctx.lineTo(-32, 22);
  ctx.moveTo(-15, 24);
  ctx.lineTo(-30, 29);
  ctx.stroke();
  // Right
  ctx.beginPath();
  ctx.moveTo(16, 20);
  ctx.lineTo(32, 22);
  ctx.moveTo(15, 24);
  ctx.lineTo(30, 29);
  ctx.stroke();

  ctx.restore();
}

const canvas = createCanvas(300, 300);
const ctx = canvas.getContext('2d');

// Dark preview background
ctx.fillStyle = '#050607';
ctx.fillRect(0, 0, 300, 300);

// Squircle (same as in session recap card)
const sqSize = 130;
const sqX = (300 - sqSize) / 2;
const sqY = (300 - sqSize) / 2;

// Outer border glow
ctx.beginPath();
ctx.roundRect(sqX - 3, sqY - 3, sqSize + 6, sqSize + 6, 26);
ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
ctx.lineWidth = 1.5;
ctx.stroke();

// Squircle fill
ctx.save();
ctx.beginPath();
ctx.roundRect(sqX, sqY, sqSize, sqSize, 24);
ctx.clip();

const grad = ctx.createLinearGradient(sqX, sqY, sqX + sqSize, sqY + sqSize);
grad.addColorStop(0, '#1a1d24');
grad.addColorStop(1, '#0e1014');
ctx.fillStyle = grad;
ctx.fillRect(sqX, sqY, sqSize, sqSize);

// Radial inner ambient sheen
const radialGlow = ctx.createRadialGradient(sqX + sqSize / 2, sqY + sqSize / 2 - 10, 0, sqX + sqSize / 2, sqY + sqSize / 2, sqSize * 0.7);
radialGlow.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
radialGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
ctx.fillStyle = radialGlow;
ctx.fillRect(sqX, sqY, sqSize, sqSize);

drawPersonaFox(ctx, sqX + sqSize / 2, sqY + sqSize / 2 + 4, 1.15);

ctx.restore();

fs.writeFileSync('test_persona_fox.png', canvas.toBuffer('image/png'));
console.log('Saved test_persona_fox.png');
