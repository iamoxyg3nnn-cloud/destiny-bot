import { createCanvas, GlobalFonts, Path2D, Image, loadImage } from '@napi-rs/canvas';
import * as path from 'path';
import { UserProfile } from '../types.js';
import { redis } from '../../redis/client.js';

// Register Google Inter and JetBrains Mono fonts
try {
  GlobalFonts.registerFromPath(path.resolve('assets/fonts/Inter.ttf'), 'Inter');
  GlobalFonts.registerFromPath(path.resolve('assets/fonts/JetBrainsMono.ttf'), 'JetBrains Mono');
} catch (e) {
  // Already registered or fallback
}

export interface LiveProfileStats {
  sessionsCount: number;
  chatHoursText: string;
  reputationPercent: number;
  personaName?: string;
  avatarUrl?: string;
  timezone?: string;
  currentXp?: number;
  nextLevelXp?: number;
  level?: number;
  matchIntent?: string;
  bio?: string;
}

export interface RenderCardParams {
  displayName: string;
  personaName?: string; // Anonymous persona pseudonym for creature avatar fallback
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
  matchIntent?: string;
  bio?: string;
  cardTheme?: string;
  equippedBadges?: string[];
  avatarImage?: Image | null;
}

export interface SessionRecapData {
  roomCode: string;
  durationText: string;
  chemistryScore: number;
  xpAwarded: number;
  coinsAwarded: number;
  user1: {
    pseudonym: string;
    avatarMonogram: string;
    destinyId: string;
    tier: string;
    avatarUrl?: string;
  };
  user2: {
    pseudonym: string;
    avatarMonogram: string;
    destinyId: string;
    tier: string;
    avatarUrl?: string;
  };
}

// Luxury Monochrome & Thin Vector Icons (Ultra-Thin 1.2px, Zero OS Emojis)
const ICONS = {
  chatBubble(ctx: any, x: number, y: number, color = '#ffffff') {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Speech bubble contour
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 14);
    ctx.lineTo(x + 4, y + 5);
    ctx.quadraticCurveTo(x + 4, y + 2, x + 8, y + 2);
    ctx.lineTo(x + 18, y + 2);
    ctx.quadraticCurveTo(x + 22, y + 2, x + 22, y + 5);
    ctx.lineTo(x + 22, y + 13);
    ctx.quadraticCurveTo(x + 22, y + 16, x + 18, y + 16);
    ctx.lineTo(x + 9, y + 16);
    ctx.lineTo(x + 4, y + 20);
    ctx.lineTo(x + 4, y + 15.5);
    ctx.closePath();
    ctx.stroke();
    // Thin voice frequency wave lines
    ctx.beginPath();
    ctx.moveTo(x + 8.5, y + 7.5);
    ctx.lineTo(x + 17.5, y + 7.5);
    ctx.moveTo(x + 8.5, y + 11);
    ctx.lineTo(x + 14.5, y + 11);
    ctx.stroke();
    ctx.restore();
  },

  users(ctx: any, x: number, y: number, color = '#8b929e') {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Primary user node
    ctx.beginPath();
    ctx.arc(x + 9, y + 6.5, 3.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 3.5, y + 17);
    ctx.quadraticCurveTo(x + 3.5, y + 12.5, x + 9, y + 12.5);
    ctx.quadraticCurveTo(x + 14.5, y + 12.5, x + 14.5, y + 17);
    ctx.stroke();
    // Partner user node
    ctx.beginPath();
    ctx.arc(x + 16.5, y + 5, 2.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 15.2, y + 11);
    ctx.quadraticCurveTo(x + 19.5, y + 11, x + 20.5, y + 15.5);
    ctx.stroke();
    ctx.restore();
  },

  shieldCheck(ctx: any, x: number, y: number, color = '#ffffff') {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Precision shield
    ctx.beginPath();
    ctx.moveTo(x + 11, y + 2.5);
    ctx.lineTo(x + 19.5, y + 5.5);
    ctx.quadraticCurveTo(x + 19.5, y + 13.5, x + 11, y + 19.5);
    ctx.quadraticCurveTo(x + 2.5, y + 13.5, x + 2.5, y + 5.5);
    ctx.closePath();
    ctx.stroke();
    // Centered 4-point micro diamond star
    const cx = x + 11;
    const cy = y + 10;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 4.5);
    ctx.lineTo(cx + 1.2, cy - 1.2);
    ctx.lineTo(cx + 4.5, cy);
    ctx.lineTo(cx + 1.2, cy + 1.2);
    ctx.lineTo(cx, cy + 4.5);
    ctx.lineTo(cx - 1.2, cy + 1.2);
    ctx.lineTo(cx - 4.5, cy);
    ctx.lineTo(cx - 1.2, cy - 1.2);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  },

  coin(ctx: any, x: number, y: number, color = '#ffffff') {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Outer hairline coin ring
    ctx.beginPath();
    ctx.arc(x + 11, y + 11, 9.5, 0, Math.PI * 2);
    ctx.stroke();
    // Inner concentric halo ring
    ctx.beginPath();
    ctx.arc(x + 11, y + 11, 6.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 0.9;
    ctx.stroke();
    // Center diamond spark
    ctx.beginPath();
    ctx.moveTo(x + 11, y + 7.5);
    ctx.lineTo(x + 12.2, y + 11);
    ctx.lineTo(x + 11, y + 14.5);
    ctx.lineTo(x + 9.8, y + 11);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  },

  flame(ctx: any, x: number, y: number, color = '#8b929e') {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Thin geometric flame
    ctx.beginPath();
    ctx.moveTo(x + 8.5, y + 1.5);
    ctx.quadraticCurveTo(x + 12.5, y + 6.5, x + 10.5, y + 9.5);
    ctx.quadraticCurveTo(x + 15, y + 9.5, x + 15, y + 13.5);
    ctx.quadraticCurveTo(x + 15, y + 18, x + 8.5, y + 18);
    ctx.quadraticCurveTo(x + 2, y + 18, x + 2, y + 12.5);
    ctx.quadraticCurveTo(x + 2, y + 7.5, x + 8.5, y + 1.5);
    ctx.closePath();
    ctx.stroke();
    // Inner ember teardrop
    ctx.beginPath();
    ctx.moveTo(x + 8.5, y + 9.5);
    ctx.quadraticCurveTo(x + 10.5, y + 12.5, x + 8.5, y + 15.5);
    ctx.quadraticCurveTo(x + 6.5, y + 12.5, x + 8.5, y + 9.5);
    ctx.stroke();
    ctx.restore();
  },

  lock(ctx: any, x: number, y: number, color = '#575d68') {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeRect(x + 3.5, y + 7.5, 9, 7.5);
    ctx.beginPath();
    ctx.arc(x + 8, y + 7.5, 3.2, Math.PI, 0, false);
    ctx.stroke();
    ctx.restore();
  },

  botAvatar(ctx: any, x: number, y: number, size = 20) {
    ctx.save();
    ctx.translate(x, y);

    const r = size / 2;
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, size * 0.28);
    ctx.fillStyle = '#14161a';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const cx = r;
    const cy = r;
    const sphereGrad = ctx.createLinearGradient(cx - r * 0.4, cy - r * 0.4, cx + r * 0.4, cy + r * 0.4);
    sphereGrad.addColorStop(0, '#ffffff');
    sphereGrad.addColorStop(0.5, '#b0b5be');
    sphereGrad.addColorStop(1, '#575d68');

    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = sphereGrad;
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.72, r * 0.26, -Math.PI / 6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.68);
    ctx.lineTo(cx + r * 0.14, cy - r * 0.52);
    ctx.lineTo(cx, cy - r * 0.38);
    ctx.lineTo(cx - r * 0.14, cy - r * 0.52);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  },

  verifiedBadge(ctx: any, x: number, y: number, size = 14, color = '#ffffff') {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const cx = x + size / 2;
    const cy = y + size / 2;
    const r = size / 2;
    ctx.beginPath();
    const points = 8;
    for (let i = 0; i < points * 2; i++) {
      const rad = i % 2 === 0 ? r : r * 0.82;
      const angle = (i * Math.PI) / points - Math.PI / 2;
      const px = cx + rad * Math.cos(angle);
      const py = cy + rad * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    // Checkmark
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.4, cy);
    ctx.lineTo(cx - r * 0.08, cy + r * 0.32);
    ctx.lineTo(cx + r * 0.42, cy - r * 0.28);
    ctx.stroke();
    ctx.restore();
  },

  badgeVerified(ctx: any, x: number, y: number, active = true) {
    ctx.save();
    const color = active ? '#ffffff' : '#33373e';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const cx = x + 9;
    const cy = y + 9;
    const r = 7;
    ctx.beginPath();
    const points = 8;
    for (let i = 0; i < points * 2; i++) {
      const rad = i % 2 === 0 ? r : r * 0.82;
      const angle = (i * Math.PI) / points - Math.PI / 2;
      const px = cx + rad * Math.cos(angle);
      const py = cy + rad * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    if (active) {
      ctx.beginPath();
      ctx.moveTo(cx - 3, cy);
      ctx.lineTo(cx - 0.8, cy + 2.5);
      ctx.lineTo(cx + 3.5, cy - 2.2);
      ctx.stroke();
    }
    ctx.restore();
  },

  badgeStreak(ctx: any, x: number, y: number, active = true) {
    ctx.save();
    const color = active ? '#ffffff' : '#33373e';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x + 9, y + 2);
    ctx.quadraticCurveTo(x + 13, y + 6.5, x + 11, y + 9.5);
    ctx.quadraticCurveTo(x + 15, y + 9.5, x + 15, y + 13);
    ctx.quadraticCurveTo(x + 15, y + 17, x + 9, y + 17);
    ctx.quadraticCurveTo(x + 3, y + 17, x + 3, y + 12);
    ctx.quadraticCurveTo(x + 3, y + 7.5, x + 9, y + 2);
    ctx.closePath();
    ctx.stroke();
    if (active) {
      ctx.beginPath();
      ctx.moveTo(x + 9, y + 9);
      ctx.quadraticCurveTo(x + 11, y + 11.5, x + 9, y + 14.5);
      ctx.quadraticCurveTo(x + 7, y + 11.5, x + 9, y + 9);
      ctx.stroke();
    }
    ctx.restore();
  },

  badgeTitan(ctx: any, x: number, y: number, active = true) {
    ctx.save();
    const color = active ? '#ffffff' : '#33373e';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Crown base line
    ctx.beginPath();
    ctx.moveTo(x + 2.5, y + 15);
    ctx.lineTo(x + 15.5, y + 15);
    ctx.stroke();
    // 5-point royal crown
    ctx.beginPath();
    ctx.moveTo(x + 2.5, y + 15);
    ctx.lineTo(x + 3, y + 7);
    ctx.lineTo(x + 6, y + 10.5);
    ctx.lineTo(x + 9, y + 4.5);
    ctx.lineTo(x + 12, y + 10.5);
    ctx.lineTo(x + 15, y + 7);
    ctx.lineTo(x + 15.5, y + 15);
    ctx.stroke();
    // Micro jewels on peaks
    if (active) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + 3, y + 6, 1, 0, Math.PI * 2);
      ctx.arc(x + 9, y + 3.5, 1.2, 0, Math.PI * 2);
      ctx.arc(x + 15, y + 6, 1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  badgeVeteran(ctx: any, x: number, y: number, active = true) {
    ctx.save();
    const color = active ? '#ffffff' : '#33373e';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Left laurel arc
    ctx.beginPath();
    ctx.arc(x + 6, y + 9.5, 6, Math.PI * 0.35, Math.PI * 1.5, false);
    ctx.stroke();
    // Right laurel arc
    ctx.beginPath();
    ctx.arc(x + 12, y + 9.5, 6, Math.PI * 1.5, Math.PI * 0.65, false);
    ctx.stroke();
    // Center imperial star
    const cx = x + 9;
    const cy = y + 9;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 3.5);
    ctx.lineTo(cx + 1, cy - 1);
    ctx.lineTo(cx + 3.5, cy);
    ctx.lineTo(cx + 1, cy + 1);
    ctx.lineTo(cx, cy + 3.5);
    ctx.lineTo(cx - 1, cy + 1);
    ctx.lineTo(cx - 3.5, cy);
    ctx.lineTo(cx - 1, cy - 1);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  },

  badgeKarma(ctx: any, x: number, y: number, active = true) {
    ctx.save();
    const color = active ? '#ffffff' : '#33373e';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const cx = x + 9;
    const cy = y + 9;
    // Primary cardinal diamond
    ctx.beginPath();
    ctx.moveTo(cx, cy - 7);
    ctx.lineTo(cx + 1.8, cy - 1.8);
    ctx.lineTo(cx + 7, cy);
    ctx.lineTo(cx + 1.8, cy + 1.8);
    ctx.lineTo(cx, cy + 7);
    ctx.lineTo(cx - 1.8, cy + 1.8);
    ctx.lineTo(cx - 7, cy);
    ctx.lineTo(cx - 1.8, cy - 1.8);
    ctx.closePath();
    ctx.stroke();
    // Diagonal micro sparks
    if (active) {
      ctx.beginPath();
      ctx.moveTo(cx - 3.5, cy - 3.5);
      ctx.lineTo(cx + 3.5, cy + 3.5);
      ctx.moveTo(cx + 3.5, cy - 3.5);
      ctx.lineTo(cx - 3.5, cy + 3.5);
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }
    ctx.restore();
  },

  qrWatermark(ctx: any, x: number, y: number) {
    ctx.save();
    ctx.fillStyle = '#575d68';
    ctx.fillRect(x, y, 5, 5);
    ctx.fillRect(x + 9, y, 5, 5);
    ctx.fillRect(x, y + 9, 5, 5);
    ctx.fillRect(x + 6, y + 2, 2, 2);
    ctx.fillRect(x + 2, y + 6, 2, 2);
    ctx.fillRect(x + 7, y + 7, 2, 2);
    ctx.fillRect(x + 11, y + 6, 3, 2);
    ctx.fillRect(x + 9, y + 11, 2, 3);
    ctx.fillRect(x + 12, y + 10, 2, 4);
    ctx.restore();
  }
};

export class ProfileCardGenerator {
  public readonly width = 960;
  public readonly height = 480;

  /**
   * Procedural Persona Creature Vector Renderer (Monochrome & Thin 1.2px)
   * Renders a distinct luxury creature emblem for all 12 Destiny matchmaking personas
   */
  public drawPersonaAvatar(
    ctx: any,
    pseudonym: string,
    sqX: number,
    sqY: number,
    sqSize: number
  ) {
    const pLower = (pseudonym || '').toLowerCase();

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(sqX, sqY, sqSize, sqSize, Math.round(sqSize * 0.22));
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
      ctx.beginPath();
      ctx.moveTo(-10, -14); ctx.lineTo(-24, -40); ctx.lineTo(-20, -48); ctx.lineTo(-20, -6);
      ctx.moveTo(10, -14); ctx.lineTo(24, -40); ctx.lineTo(20, -48); ctx.lineTo(20, -6);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-20, -6); ctx.lineTo(-30, 6); ctx.lineTo(-20, 14); ctx.lineTo(-28, 22);
      ctx.lineTo(-12, 26); ctx.lineTo(0, 30); ctx.lineTo(12, 26); ctx.lineTo(28, 22);
      ctx.lineTo(20, 14); ctx.lineTo(30, 6); ctx.lineTo(20, -6);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-14, 2); ctx.quadraticCurveTo(-8, -2, -6, 4); ctx.quadraticCurveTo(-10, 6, -14, 2);
      ctx.moveTo(14, 2); ctx.quadraticCurveTo(8, -2, 6, 4); ctx.quadraticCurveTo(10, 6, 14, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      ctx.beginPath(); ctx.moveTo(-3, 22); ctx.lineTo(3, 22); ctx.lineTo(0, 26); ctx.closePath();
      ctx.fill();
    } else if (pLower.includes('bear')) {
      // BEAR
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(-24, -20, 12, Math.PI * 0.7, Math.PI * 2.1); ctx.stroke();
      ctx.beginPath(); ctx.arc(24, -20, 12, Math.PI * 0.9, Math.PI * 2.3); ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-18, -14); ctx.lineTo(18, -14);
      ctx.quadraticCurveTo(30, 8, 22, 26);
      ctx.quadraticCurveTo(0, 36, -22, 26);
      ctx.quadraticCurveTo(-30, 8, -18, -14);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.ellipse(0, 20, 14, 10, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-6, 15); ctx.lineTo(6, 15); ctx.lineTo(0, 21); ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      ctx.beginPath(); ctx.arc(-12, 2, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(12, 2, 2.5, 0, Math.PI * 2); ctx.fill();
    } else if (pLower.includes('raven')) {
      // RAVEN
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-20, 24); ctx.lineTo(-16, -14); ctx.lineTo(-6, -34); ctx.lineTo(0, -38);
      ctx.lineTo(8, -30); ctx.lineTo(24, 0); ctx.lineTo(38, 14);
      ctx.lineTo(16, 18); ctx.lineTo(8, 28); ctx.lineTo(-12, 32); ctx.closePath();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(38, 14); ctx.quadraticCurveTo(22, 10, 8, 8);
      ctx.stroke();

      ctx.beginPath(); ctx.arc(4, -4, 4, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(4, -4, 1.8, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
    } else if (pLower.includes('otter')) {
      // OTTER
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(-22, -10, 6, Math.PI * 0.5, Math.PI * 2.2); ctx.stroke();
      ctx.beginPath(); ctx.arc(22, -10, 6, Math.PI * 0.8, Math.PI * 2.5); ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-18, -16); ctx.quadraticCurveTo(0, -26, 18, -16);
      ctx.quadraticCurveTo(26, 6, 18, 24);
      ctx.quadraticCurveTo(0, 32, -18, 24);
      ctx.quadraticCurveTo(-26, 6, -18, -16);
      ctx.stroke();

      ctx.beginPath(); ctx.arc(0, 14, 3, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-8, 16); ctx.lineTo(-22, 14);
      ctx.moveTo(-8, 18); ctx.lineTo(-20, 22);
      ctx.moveTo(8, 16); ctx.lineTo(22, 14);
      ctx.moveTo(8, 18); ctx.lineTo(20, 22);
      ctx.stroke();

      ctx.beginPath(); ctx.arc(-10, 2, 2.8, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.beginPath(); ctx.arc(10, 2, 2.8, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
    } else if (pLower.includes('panda')) {
      // PANDA
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(-26, -24, 12, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(26, -24, 12, 0, Math.PI * 2); ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(0, 4, 28, 26, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.save();
      ctx.beginPath();
      ctx.ellipse(-12, 0, 8, 11, -Math.PI / 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(12, 0, 8, 11, Math.PI / 8, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath(); ctx.arc(-11, 0, 2.5, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.beginPath(); ctx.arc(11, 0, 2.5, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.restore();

      ctx.beginPath(); ctx.arc(0, 16, 4, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
    } else if (pLower.includes('koala')) {
      // KOALA
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(-30, -12, 14, Math.PI * 0.4, Math.PI * 2.3); ctx.stroke();
      ctx.beginPath(); ctx.arc(30, -12, 14, Math.PI * 0.7, Math.PI * 2.6); ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(0, 6, 26, 24, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(0, 10, 7, 12, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

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

  /**
   * Internal render routine for profile card
   */
  public drawCard(
    ctx: any,
    data: RenderCardParams,
    width: number,
    height: number
  ) {
    const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.closePath();
    };

    const drawSparkle = (x: number, y: number, r: number, alpha = 0.8) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(x, y  - r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.quadraticCurveTo(x, y, x, y + r);
      ctx.quadraticCurveTo(x, y, x - r, y);
      ctx.quadraticCurveTo(x, y, x, y - r);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    // 1. BASE BACKGROUND & SHELL
    ctx.save();
    roundRect(1, 1, width - 2, height - 2, 28);
    ctx.clip();

    const theme = data.cardTheme || 'obsidian';

    if (theme === 'frost_glaze') {
      ctx.fillStyle = '#0c0f14';
      ctx.fillRect(0, 0, width, height);

      // Cool crystalline frost texture
      ctx.fillStyle = 'rgba(180, 210, 255, 0.035)';
      const dotSpacing = 16;
      for (let dx = 16; dx < width; dx += dotSpacing) {
        for (let dy = 16; dy < height; dy += dotSpacing) {
          ctx.fillRect(dx, dy, 1, 1);
        }
      }
      const frostGlow = ctx.createLinearGradient(0, 0, width, height);
      frostGlow.addColorStop(0, 'rgba(200, 225, 255, 0.06)');
      frostGlow.addColorStop(1, 'rgba(12, 15, 20, 0)');
      ctx.fillStyle = frostGlow;
      ctx.fillRect(0, 0, width, height);
    } else if (theme === 'cyber_damask') {
      ctx.fillStyle = '#08080a';
      ctx.fillRect(0, 0, width, height);

      // Damask diagonal micro-etched lines
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.lineWidth = 1;
      for (let d = -width; d < width * 2; d += 16) {
        ctx.beginPath();
        ctx.moveTo(d, 0);
        ctx.lineTo(d + height, height);
        ctx.stroke();
      }
      ctx.restore();
    } else if (theme === 'holographic_plat') {
      ctx.fillStyle = '#090a0d';
      ctx.fillRect(0, 0, width, height);

      // Prismatic subtle ambient shimmer
      const holoGlow = ctx.createLinearGradient(0, 0, width, height);
      holoGlow.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
      holoGlow.addColorStop(0.3, 'rgba(220, 235, 255, 0.04)');
      holoGlow.addColorStop(0.7, 'rgba(240, 230, 255, 0.04)');
      holoGlow.addColorStop(1, 'rgba(255, 255, 255, 0.02)');
      ctx.fillStyle = holoGlow;
      ctx.fillRect(0, 0, width, height);
    } else {
      // Obsidian Pure Dark Monochrome
      ctx.fillStyle = '#090a0c';
      ctx.fillRect(0, 0, width, height);

      // Procedural Dot-Matrix Grain (Linear / Industrial hardware texture)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
      const dotSpacing = 16;
      for (let dx = 16; dx < width; dx += dotSpacing) {
        for (let dy = 16; dy < height; dy += dotSpacing) {
          ctx.fillRect(dx, dy, 1, 1);
        }
      }
    }

    // Top-lit subtle ambient specular highlight
    const topGlow = ctx.createRadialGradient(width / 2, 0, 10, width / 2, 0, 320);
    topGlow.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
    topGlow.addColorStop(1, 'rgba(9, 10, 12, 0)');
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, 0, width, height);

    // Subtle ambient glow behind avatar
    const avGlow = ctx.createRadialGradient(88, 80, 10, 88, 80, 180);
    avGlow.addColorStop(0, 'rgba(255, 255, 255, 0.04)');
    avGlow.addColorStop(1, 'rgba(9, 10, 12, 0)');
    ctx.fillStyle = avGlow;
    ctx.fillRect(0, 0, width, height);

    // Subtle ambient glow behind emblem
    const emGlow = ctx.createRadialGradient(880, 80, 10, 880, 80, 180);
    emGlow.addColorStop(0, 'rgba(255, 255, 255, 0.06)');
    emGlow.addColorStop(1, 'rgba(9, 10, 12, 0)');
    ctx.fillStyle = emGlow;
    ctx.fillRect(0, 0, width, height);

    // Twinkling stars
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
      const alpha = 0.15 + 0.55 * Math.max(0, Math.sin(2 * Math.PI * st.off));
      drawSparkle(st.x, st.y, st.r, alpha);
    }
    ctx.restore();

    // Outer border (Crisp 1px hairline border)
    roundRect(1, 1, width - 2, height - 2, 28);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // -------------------------------------------------------------
    // HEADER: AVATAR SQUIRCLE (x: 36, y: 30)
    // -------------------------------------------------------------
    const avX = 36;
    const avY = 30 ;
    const avSize = 96;
    const avRadius = 24;

    roundRect(avX - 4, avY - 4, avSize + 8, avSize + 8, avRadius + 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    roundRect(avX, avY, avSize, avSize, avRadius);
    ctx.fillStyle = '#141619';
    ctx.fill();

    ctx.save();
    roundRect(avX, avY, avSize, avSize, avRadius);
    ctx.clip();

    if (data.avatarImage) {
      ctx.drawImage(data.avatarImage, avX, avY, avSize, avSize);
    } else if (
      data.personaName ||
      ['fox', 'wolf', 'phoenix', 'owl', 'dragon', 'stag', 'lynx', 'bear', 'raven', 'otter', 'panda', 'koala'].some(c => (data.displayName || '').toLowerCase().includes(c))
    ) {
      this.drawPersonaAvatar(ctx, data.personaName || data.displayName, avX, avY, avSize);
    } else {
      const avGrad = ctx.createLinearGradient(avX, avY, avX + avSize, avY + avSize);
      avGrad.addColorStop(0, '#22252a');
      avGrad.addColorStop(1, '#111315');
      ctx.fillStyle = avGrad;
      ctx.fillRect(avX, avY, avSize, avSize);

      ctx.translate(avX + avSize / 2, avY + avSize / 2);
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

    // Online Status Dot (Monochrome)
    ctx.beginPath();
    ctx.arc(avX + avSize - 8, avY + avSize - 8, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#090a0c';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(avX + avSize - 8, avY + avSize - 8, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // -------------------------------------------------------------
    // HEADER: IDENTITY (x: 156, y: 26)
    // -------------------------------------------------------------
    const idX = 156;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // 1. Display Name
    ctx.font = 'bold 32px "Inter", sans-serif';
    ctx.fillStyle = '#f2f4f8';
    ctx.fillText(data.displayName, idX, 60);

    const nameW = ctx.measureText(data.displayName).width;

    // 2. Verified Pill / ID Badge
    const badgeX = idX + nameW + 12;
    const badgeY = 38;
    const badgeH = 24;
    const badgeText = data.isVerified ? 'VERIFIED' : `ID: ${data.destinyId}`;
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    const badgeTextW = ctx.measureText(badgeText).width;
    const badgeW = badgeTextW + (data.isVerified ? 28 : 18);

    roundRect(badgeX, badgeY, badgeW, badgeH, 6);
    ctx.fillStyle = '#141619';
    ctx.fill();
    ctx.strokeStyle = data.isVerified ? 'rgba(255, 255, 255, 0.35)' : 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (data.isVerified) {
      ICONS.verifiedBadge(ctx, badgeX + 7, badgeY + 5, 14, '#ffffff');
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(badgeText, badgeX + 25, badgeY + 16);
    } else {
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.fillStyle = '#e1e4ea';
      ctx.fillText(badgeText, badgeX + 9, badgeY + 16);
    }

    // 3. Matchmaking Vibe / Intent Badge
    const intentText = data.matchIntent || 'LATE NIGHT CHAT';
    const intentX = badgeX + badgeW + 10;
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    const intentW = ctx.measureText(intentText).width + 24;

    roundRect(intentX, badgeY, intentW, badgeH, 6);
    ctx.fillStyle = '#121417';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const dotAlpha = 0.5;
    ctx.fillStyle = `rgba(255, 255, 255, ${dotAlpha})`;
    ctx.beginPath();
    ctx.arc(intentX + 9, badgeY + 12, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#d0d4dc';
    ctx.fillText(intentText, intentX + 17, badgeY + 16);

    // 4. Demographics Row
    const demoY = 88;
    const demoText = `Age ${data.age}  ·  ${data.gender.charAt(0).toUpperCase() + data.gender.slice(1)}  ·  ${data.languages.join(', ')}`;
    ctx.font = '500 14px "Inter", sans-serif';
    ctx.fillStyle = '#8b929e';
    ctx.fillText(demoText, idX, demoY);

    // 5. Bio Motto Line
    const bioY = 108;
    const bioText = data.bio || 'Looking for late-night conversations & gaming duos';
    ctx.font = 'italic 12px "Inter", sans-serif';
    ctx.fillStyle = '#656c7a';
    ctx.fillText(`“${bioText}”`, idX, bioY);

    // 6. Clean Interest Tags
    let tagX = idX;
    const tagY = 122;
    for (const tag of data.interests.slice(0, 3)) {
      ctx.font = '600 11px "Inter", sans-serif';
      const cleanTag = tag.trim().charAt(0).toUpperCase() + tag.trim().slice(1);
      const tw = ctx.measureText(cleanTag).width;
      const pw = tw + 18;

      roundRect(tagX, tagY, pw, 22, 5);
      ctx.fillStyle = '#141619';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#c0c5cf';
      ctx.fillText(cleanTag, tagX + 9, tagY + 15);

      tagX += pw + 8;
    }

    // -------------------------------------------------------------
    // HEADER: RANK & TIER (x: 648, y: 0)
    // -------------------------------------------------------------
    const rankX = 648;
    ctx.textAlign = 'left';

    ctx.font = 'bold 20px "JetBrains Mono", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(data.tierName.toUpperCase(), rankX, 52);

    ctx.font = '650 22px "JetBrains Mono", monospace';
    ctx.fillStyle = '#8b929e';
    ctx.fillText('LVL', rankX, 112);

    ctx.font = '750 56px "JetBrains Mono", monospace';
    ctx.fillStyle = '#f2f4f8';
    ctx.fillText(data.level.toString().padStart(2, '0'), rankX + 54, 114);

    ctx.font = '550 16px "JetBrains Mono", monospace';
    ctx.fillStyle = '#8b929e';
    ctx.fillText(`${data.totalXp.toLocaleString()} XP`, rankX, 142);

    // -------------------------------------------------------------
    // HEADER: TIER SEAL EMBLEM (top-right, hairline 1.2px)
    // -------------------------------------------------------------
    ctx.save();
    {
      // Tier-to-seal level map: each tier gets a distinct thin-line geometric seal
      const tier = (data.tierName || 'Strangers').toLowerCase();
      const ex = 877; // emblem center X
      const ey = 76; // emblem center Y

      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Outer hairline circle container (always present)
      ctx.beginPath();
      ctx.arc(ex, ey, 42, 0, Math.PI * 2);
      ctx.stroke();

      // Inner secondary ring
      ctx.beginPath();
      ctx.arc(ex, ey, 32, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.lineWidth = 0.9;
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (tier === 'strangers' || tier === 'stranger') {
        // Strangers: single thin 4-point diamond — first connection
        ctx.beginPath();
        ctx.moveTo(ex, ey - 20);
        ctx.lineTo(ex + 14, ey);
        ctx.lineTo(ex, ey + 20);
        ctx.lineTo(ex - 14, ey);
        ctx.closePath();
        ctx.stroke();
        // Tiny inner diamond
        ctx.beginPath();
        ctx.moveTo(ex, ey - 8);
        ctx.lineTo(ex + 5, ey);
        ctx.lineTo(ex, ey + 8);
        ctx.lineTo(ex - 5, ey);
        ctx.closePath();
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 0.9;
        ctx.stroke();
      } else if (tier === 'acquaintance' || tier === 'acquaintances') {
        // Acquaintance: dual-diamond stack
        ctx.beginPath();
        ctx.moveTo(ex, ey - 20); ctx.lineTo(ex + 14, ey); ctx.lineTo(ex, ey + 20); ctx.lineTo(ex - 14, ey); ctx.closePath(); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(ex, ey - 11); ctx.lineTo(ex + 8, ey); ctx.lineTo(ex, ey + 11); ctx.lineTo(ex - 8, ey); ctx.closePath(); ctx.stroke();
      } else if (tier === 'friends' || tier === 'friend') {
        // Friends: 6-point snowflake / Star of David
        for (let i = 0; i < 3; i++) {
          const a = (i * Math.PI) / 3;
          ctx.beginPath();
          ctx.moveTo(ex + 20 * Math.cos(a), ey + 20 * Math.sin(a));
          ctx.lineTo(ex - 20 * Math.cos(a), ey - 20 * Math.sin(a));
          ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(ex, ey, 7, 0, Math.PI * 2); ctx.stroke();
      } else if (tier === 'close') {
        // Close: interlocked dual circles (Vesica Piscis)
        ctx.beginPath(); ctx.arc(ex - 8, ey, 16, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(ex + 8, ey, 16, 0, Math.PI * 2); ctx.stroke();
      } else if (tier === 'bonded') {
        // Bonded: 8-petal rose / 8-point star
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(ex + 20 * Math.cos(a), ey + 20 * Math.sin(a));
          ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(ex, ey, 8, 0, Math.PI * 2); ctx.stroke();
      } else if (tier === 'destiny') {
        // Destiny (max tier): 12-point precision sun dial
        for (let i = 0; i < 12; i++) {
          const a = (i * Math.PI) / 6;
          const inner = i % 3 === 0 ? 10 : 15;
          ctx.beginPath();
          ctx.moveTo(ex + inner * Math.cos(a), ey + inner * Math.sin(a));
          ctx.lineTo(ex + 22 * Math.cos(a), ey + 22 * Math.sin(a));
          ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(ex, ey, 10, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(ex, ey, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff'; ctx.fill();
      } else {
        // Generic: simple diamond
        ctx.beginPath();
        ctx.moveTo(ex, ey - 18); ctx.lineTo(ex + 13, ey); ctx.lineTo(ex, ey + 18); ctx.lineTo(ex - 13, ey); ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.restore();

    // -------------------------------------------------------------
    // COLLECTIBLE 5-SLOT INSIGNIA BADGE RACK (y: 154)
    // -------------------------------------------------------------
    const rackX = 32;
    const rackY = 154;
    const rackW = width - 64;
    const rackH = 28;

    roundRect(rackX, rackY, rackW, rackH, 7);
    ctx.fillStyle = '#101215';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#575d68';
    ctx.textAlign = 'left';
    ctx.fillText('INSIGNIA', rackX + 12, rackY + 18);

    const badges = [
      { id: 'verified', label: 'ID VERIFIED', draw: ICONS.badgeVerified, active: data.isVerified },
      { id: 'streak_7', label: '7D STREAK', draw: ICONS.badgeStreak, active: data.streakCount >= 7 },
      { id: 'titan', label: 'TITAN 1K', draw: ICONS.badgeTitan, active: data.coins >= 1000 },
      { id: 'veteran', label: 'VETERAN', draw: ICONS.badgeVeteran, active: data.sessionsCount >= 4 },
      { id: 'karma', label: 'KARMA 100%', draw: ICONS.badgeKarma, active: data.reputationScore >= 100 },
    ];

    let bSlotX = rackX + 90;
    for (const b of badges) {
      b.draw(ctx, bSlotX, rackY + 5, b.active);
      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.fillStyle = b.active ? '#e1e4ea' : '#33373e';
      ctx.fillText(b.label, bSlotX + 22, rackY + 18);
      bSlotX += 150;
    }

    // -------------------------------------------------------------
    // PROGRESS SECTION (y: 194)
    // -------------------------------------------------------------
    ctx.font = '600 15px "JetBrains Mono", monospace';
    ctx.fillStyle = '#8b929e';
    ctx.textAlign = 'left';
    ctx.fillText('CONNECTION PROGRESS', 32, 204);

    ctx.font = '600 15px "JetBrains Mono", monospace';
    ctx.fillStyle = '#f2f4f8';
    ctx.textAlign = 'right';
    ctx.fillText(`${data.currentXp.toLocaleString()} / ${data.nextLevelXp.toLocaleString()} XP`, width - 32, 204);

    const progX = 32;
    const progY = 216;
    const progW = width - 64;
    const progH = 10;

    roundRect(progX, progY, progW, progH, 5);
    ctx.fillStyle = '#17191d';
    ctx.fill();

    const fillRatio = Math.min(1, Math.max(0, data.currentXp / data.nextLevelXp));
    const fillW = Math.max(progH, progW * fillRatio);

    ctx.save();
    roundRect(progX, progY, fillW, progH, 5);
    ctx.clip();

    const progGrad = ctx.createLinearGradient(progX, 0, progX + fillW, 0);
    progGrad.addColorStop(0, '#737a86');
    progGrad.addColorStop(1, '#ffffff');
    ctx.fillStyle = progGrad;
    ctx.fillRect(progX, progY, fillW, progH);
    ctx.restore();

    // -------------------------------------------------------------
    // LOWER PANEL 1: CONVERSATION ACTIVITY (x: 32, width: 548, height: 156)
    // -------------------------------------------------------------
    const card1X = 32;
    const cardY = 246;
    const card1W = 548;
    const cardH = 156;

    roundRect(card1X, cardY, card1W, cardH, 18);
    ctx.fillStyle = '#121417';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(card1X + 18, cardY + 1);
    ctx.lineTo(card1X + card1W - 18, cardY + 1);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ICONS.chatBubble(ctx, card1X + 22, cardY + 18, '#ffffff');
    ctx.font = '600 13px "JetBrains Mono", monospace';
    ctx.fillStyle = '#8b929e';
    ctx.textAlign = 'left';
    ctx.fillText('CONVERSATION ACTIVITY', card1X + 54, cardY + 34);

    ctx.font = 'bold 44px "JetBrains Mono", monospace';
    ctx.fillStyle = '#f2f4f8';
    ctx.fillText(data.talkTime, card1X + 22, cardY + 86);

    ctx.font = '500 12px "Inter", sans-serif';
    ctx.fillStyle = '#575d68';
    ctx.fillText('Total Anonymized Talk Time', card1X + 22, cardY + 108);

    const splitX = card1X + 316;
    ctx.beginPath();
    ctx.moveTo(splitX, cardY + 20);
    ctx.lineTo(splitX, cardY + cardH - 20);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ICONS.users(ctx, splitX + 20, cardY + 26, '#8b929e');
    ctx.font = 'bold 16px "JetBrains Mono", monospace';
    ctx.fillStyle = '#f2f4f8';
    ctx.fillText(`${data.sessionsCount.toString().padStart(2, '0')} SESSIONS`, splitX + 48, cardY + 40);
    ctx.font = '500 11px "Inter", sans-serif';
    ctx.fillStyle = '#575d68';
    ctx.fillText('Completed Match Rooms', splitX + 48, cardY + 56);

    ICONS.shieldCheck(ctx, splitX + 20, cardY + 76, '#ffffff');
    ctx.font = 'bold 16px "JetBrains Mono", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${data.reputationScore}% SCORE`, splitX + 48, cardY + 90);
    ctx.font = '500 11px "Inter", sans-serif';
    ctx.fillStyle = '#575d68';
    ctx.fillText('High Reputation Rating', splitX + 48, cardY + 106);

    // -------------------------------------------------------------
    // LOWER PANEL 2: DESTINY VAULT (x: 600, width: 328, height: 156)
    // -------------------------------------------------------------
    const card2X = 600;
    const card2W = 328;

    roundRect(card2X, cardY, card2W, cardH, 18);
    ctx.fillStyle = '#121417';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(card2X + 18, cardY + 1);
    ctx.lineTo(card2X + card2W - 18, cardY + 1);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ICONS.coin(ctx, card2X + 20, cardY + 18, '#ffffff');
    ctx.font = '600 13px "JetBrains Mono", monospace';
    ctx.fillStyle = '#8b929e';
    ctx.textAlign = 'left';
    ctx.fillText('DESTINY VAULT', card2X + 50, cardY + 34);

    ctx.font = 'bold 44px "JetBrains Mono", monospace';
    ctx.fillStyle = '#f2f4f8';
    ctx.fillText(`${data.coins} DC`, card2X + 20, cardY + 86);

    ctx.font = '500 12px "Inter", sans-serif';
    ctx.fillStyle = '#575d68';
    ctx.fillText('Available Coins Balance', card2X + 20, cardY + 108);

    ICONS.flame(ctx, card2X + 20, cardY + 122, '#8b929e');
    ctx.font = '600 13px "JetBrains Mono", monospace';
    ctx.fillStyle = '#8b929e';
    ctx.fillText(`${data.streakCount} DAY STREAK`, card2X + 42, cardY + 135);

    const claimW = 86;
    const claimH = 22;
    const claimX = card2X + card2W - claimW - 18;
    const claimY = cardY + 118;
    roundRect(claimX, claimY, claimW, claimH, 6);
    ctx.fillStyle = '#171a1e';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('• READY', claimX + claimW / 2, claimY + 15);

    // -------------------------------------------------------------
    // FOOTER (y: 444)
    // -------------------------------------------------------------
    ICONS.botAvatar(ctx, 32, 433, 18);
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.fillStyle = '#8b929e';
    ctx.textAlign = 'left';
    ctx.fillText('DESTINY BOT', 56, 446);

    ctx.font = '500 11px "JetBrains Mono", monospace';
    ctx.fillStyle = '#575d68';
    ctx.fillText('· ANONYMOUS SOCIAL · END-TO-END EPHEMERAL', 142, 446);

    ICONS.qrWatermark(ctx, width - 176, 435);
    ctx.textAlign = 'right';
    ctx.fillText('CONNECT · ' + (data.timezone || 'UTC+05:30'), width - 32, 446);
  }

  /**
   * Helper to normalize user profile and live stats into card params
   */
  public async prepareParams(
    user: UserProfile,
    stats: LiveProfileStats
  ): Promise<RenderCardParams> {
    let avatarImage: Image | null = null;
    if (stats.avatarUrl) {
      try {
        avatarImage = await loadImage(stats.avatarUrl);
      } catch (e) {
        avatarImage = null;
      }
    }

    const currentXp = 0;
    const nextLevelXp = 0;
    const level = 0;

    return {
      displayName: stats.personaName || 'Midnight Wolf',
      personaName: stats.personaName,
      destinyId: user.destinyId || 'R7ZYFK',
      age: user.age || 18,
      gender: user.gender || 'unspecified',
      isVerified: Boolean(user.genderVerified),
      tierName: 'Anonymous',
      level,
      currentXp,
      nextLevelXp,
      totalXp: currentXp,
      sessionsCount: stats.sessionsCount || 0,
      talkTime: stats.chatHoursText || '0h 00m',
      reputationScore: user.reputationScore ?? 100,
      interests: user.interests && user.interests.length > 0 ? user.interests : ['Anime', 'Gaming', 'Music'],
      languages: user.languages && user.languages.length > 0 ? user.languages : ['English'],
      timezone: stats.timezone || 'UTC+05:30',
      matchIntent: stats.matchIntent || user.matchIntent || 'LATE NIGHT CHAT',
      bio: stats.bio || user.bio || 'Looking for late-night gaming friends & deep talks',
      cardTheme: 'obsidian',
      equippedBadges: [],
      avatarImage,
    };
  }

  /**
   * Generate static PNG buffer with Redis multi-tier caching (sub-2ms on hit)
   */
  public async generateCardPng(user: UserProfile, stats: LiveProfileStats): Promise<Buffer> {
    const cacheKey = `card:anonymous:${user.id}:${user.updatedAt}:${stats.sessionsCount}:${stats.reputationPercent}`;
    try {
      const cached = await redis.getBuffer(cacheKey);
      if (cached) return cached;
    } catch {
      // Continue on cache miss.
    }

    const canvas = createCanvas(this.width, this.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.strokeStyle = '#303541';
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 18, this.width - 36, this.height - 36);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#a78bfa';
    ctx.font = '600 16px Inter';
    ctx.fillText('DESTINY  /  ANONYMOUS PROFILE', 48, 62);

    ctx.fillStyle = '#f4f4f5';
    ctx.font = '600 38px Inter';
    ctx.fillText((stats.personaName || 'Anonymous Member').slice(0, 28), 48, 126);

    ctx.fillStyle = '#a1a1aa';
    ctx.font = '500 18px "JetBrains Mono", monospace';
    ctx.fillText(user.destinyId || 'DESTINY MEMBER', 48, 164);

    ctx.strokeStyle = '#303541';
    ctx.beginPath();
    ctx.moveTo(48, 194);
    ctx.lineTo(this.width - 48, 194);
    ctx.stroke();

    const details = [
      ['AGE', String(user.age || '—')],
      ['GENDER', String(user.gender || 'Not specified').replaceAll('_', ' ')],
      ['SESSIONS', String(stats.sessionsCount || 0)],
      ['REPUTATION', `${Math.max(0, Math.min(100, stats.reputationPercent ?? 100))}%`],
    ];
    const colWidth = (this.width - 96) / details.length;
    details.forEach(([label, value], index) => {
      const x = 48 + index * colWidth;
      ctx.fillStyle = '#71717a';
      ctx.font = '600 12px Inter';
      ctx.fillText(label, x, 236);
      ctx.fillStyle = '#e4e4e7';
      ctx.font = '600 22px Inter';
      ctx.fillText(value.slice(0, 24), x, 270);
    });

    const interests = (user.interests || []).slice(0, 8).join('  ·  ') || 'Open to meeting new people';
    const languages = (user.languages || []).slice(0, 6).join(', ') || 'Not specified';
    ctx.fillStyle = '#a78bfa';
    ctx.font = '600 12px Inter';
    ctx.fillText('INTERESTS', 48, 326);
    ctx.fillStyle = '#e4e4e7';
    ctx.font = '500 16px Inter';
    ctx.fillText(interests.slice(0, 92), 48, 352);
    ctx.fillStyle = '#a78bfa';
    ctx.font = '600 12px Inter';
    ctx.fillText('LANGUAGES', 48, 390);
    ctx.fillStyle = '#e4e4e7';
    ctx.font = '500 16px Inter';
    ctx.fillText(languages.slice(0, 92), 48, 416);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#71717a';
    ctx.font = '500 11px "JetBrains Mono", monospace';
    ctx.fillText('YOUR DISCORD IDENTITY STAYS PRIVATE', this.width - 48, this.height - 42);

    const buffer = canvas.toBuffer('image/png');
    try {
      await redis.setBuffer(cacheKey, buffer, 900);
    } catch {
      // Non-blocking cache store.
    }
    return buffer;
  }

  /**
   * Generate Post-Room Co-Op Session Recap Card
   */
  public async generateSessionRecapCard(data: SessionRecapData): Promise<Buffer> {
    let u1Img: Image | null = null;
    let u2Img: Image | null = null;
    const isDefaultAvatar = (url?: string) => !url || url.includes('embed/avatars') || url.includes('discordapp.com/embed');

    if (data.user1.avatarUrl && !isDefaultAvatar(data.user1.avatarUrl)) {
      try { u1Img = await loadImage(data.user1.avatarUrl); } catch {}
    }
    if (data.user2.avatarUrl && !isDefaultAvatar(data.user2.avatarUrl)) {
      try { u2Img = await loadImage(data.user2.avatarUrl); } catch {}
    }

    const canvas = createCanvas(this.width, this.height);
    const ctx = canvas.getContext('2d');

    const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.closePath();
    };

    // 1. Background
    ctx.save();
    roundRect(1, 1, this.width - 2, this.height - 2, 28);
    ctx.clip();

    ctx.fillStyle = '#090a0c';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
    for (let dx = 16; dx < this.width; dx += 16) {
      for (let dy = 16; dy < this.height; dy += 16) {
        ctx.fillRect(dx, dy, 1, 1);
      }
    }

    const topGlow = ctx.createRadialGradient(this.width / 2, 0, 10, this.width / 2, 0, 360);
    topGlow.addColorStop(0, 'rgba(255, 255, 255, 0.06)');
    topGlow.addColorStop(1, 'rgba(9, 10, 12, 0)');
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.restore();

    roundRect(1, 1, this.width - 2, this.height - 2, 28);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 2. Header with Destiny Bot Avatar
    ICONS.botAvatar(ctx, 36, 33, 20);
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.fillStyle = '#8b929e';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('DESTINY BOT · OFFICIAL SESSION RECAP', 64, 48);

    ctx.textAlign = 'right';
    ctx.fillText(`ROOM: ${data.roomCode}`, this.width - 36, 48);

    ctx.beginPath();
    ctx.moveTo(36, 62);
    ctx.lineTo(this.width - 36, 62);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 3. User 1 Left Squircle
    const u1X = 60;
    const uY = 96;
    const sqSize = 100;

    roundRect(u1X - 3, uY - 3, sqSize + 6, sqSize + 6, 26);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.save();
    roundRect(u1X, uY, sqSize, sqSize, 24);
    ctx.clip();
    if (u1Img) {
      ctx.drawImage(u1Img, u1X, uY, sqSize, sqSize);
    } else {
      this.drawPersonaAvatar(ctx, data.user1.pseudonym, u1X, uY, sqSize);
    }
    ctx.restore();

    ctx.font = 'bold 24px "Inter", sans-serif';
    ctx.fillStyle = '#f2f4f8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(data.user1.pseudonym, u1X + sqSize / 2, uY + sqSize + 36);

    ctx.font = '500 13px "JetBrains Mono", monospace';
    ctx.fillStyle = '#8b929e';
    ctx.fillText(`ID: ${data.user1.destinyId} · ${data.user1.tier}`, u1X + sqSize / 2, uY + sqSize + 58);

    // 4. User 2 Right Squircle
    const u2X = this.width - 60 - sqSize;

    roundRect(u2X - 3, uY - 3, sqSize + 6, sqSize + 6, 26);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.save();
    roundRect(u2X, uY, sqSize, sqSize, 24);
    ctx.clip();
    if (u2Img) {
      ctx.drawImage(u2Img, u2X, uY, sqSize, sqSize);
    } else {
      this.drawPersonaAvatar(ctx, data.user2.pseudonym, u2X, uY, sqSize);
    }
    ctx.restore();

    ctx.font = 'bold 24px "Inter", sans-serif';
    ctx.fillStyle = '#f2f4f8';
    ctx.fillText(data.user2.pseudonym, u2X + sqSize / 2, uY + sqSize + 36);

    ctx.font = '500 13px "JetBrains Mono", monospace';
    ctx.fillStyle = '#8b929e';
    ctx.fillText(`ID: ${data.user2.destinyId} · ${data.user2.tier}`, u2X + sqSize / 2, uY + sqSize + 58);

    // 5. Center Telemetry & Chemistry Box
    const cX = this.width / 2;
    const cBoxX = 260;
    const cBoxW = 440;
    const cBoxY = 96;
    const cBoxH = 190;

    roundRect(cBoxX, cBoxY, cBoxW, cBoxH, 18);
    ctx.fillStyle = '#121417';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cBoxX + 18, cBoxY + 1);
    ctx.lineTo(cBoxX + cBoxW - 18, cBoxY + 1);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.fillStyle = '#8b929e';
    ctx.textAlign = 'center';
    ctx.fillText('MATCH CHEMISTRY AFFINITY', cX, cBoxY + 36);

    ctx.font = 'bold 52px "JetBrains Mono", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${data.chemistryScore}%`, cX, cBoxY + 92);

    ctx.font = '600 15px "JetBrains Mono", monospace';
    ctx.fillStyle = '#d0d4dc';
    ctx.fillText(`DURATION: ${data.durationText}`, cX, cBoxY + 124);

    const rY = cBoxY + 144;
    roundRect(cX - 160, rY, 150, 28, 6);
    ctx.fillStyle = '#181b20';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.stroke();
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`+${data.xpAwarded} XP GAINED`, cX - 85, rY + 18);

    roundRect(cX + 10, rY, 150, 28, 6);
    ctx.fillStyle = '#181b20';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`+${data.coinsAwarded} DC EARNED`, cX + 85, rY + 18);

    // 6. Lower Banner
    const banY = 316;
    const banW = this.width - 72;
    roundRect(36, banY, banW, 76, 14);
    ctx.fillStyle = '#101215';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = '600 13px "Inter", sans-serif';
    ctx.fillStyle = '#f2f4f8';
    ctx.textAlign = 'center';
    ctx.fillText('Both partners were awarded coins and connection progression XP.', this.width / 2, banY + 34);

    ctx.font = '500 12px "JetBrains Mono", monospace';
    ctx.fillStyle = '#575d68';
    ctx.fillText('Privacy Guaranteed · Discord usernames and identities remained 100% hidden', this.width / 2, banY + 56);

    // 7. Footer
    ctx.font = '500 11px "JetBrains Mono", monospace';
    ctx.fillStyle = '#575d68';
    ctx.textAlign = 'left';
    ctx.fillText('DESTINY ANONYMOUS MATCHMAKING · EPHEMERAL CO-OP RECAP', 36, 446);

    ctx.textAlign = 'right';
    ctx.fillText('STATUS: SESSION COMPLETED', this.width - 36, 446);

    return canvas.toBuffer('image/png');
  }
}

export const profileCardGenerator = new ProfileCardGenerator();
