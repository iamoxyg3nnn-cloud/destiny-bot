import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import * as path from 'path';
import { UserProfile } from '../types.js';
import { redis } from '../../redis/client.js';

try {
  GlobalFonts.registerFromPath(path.resolve('assets/fonts/Inter.ttf'), 'Inter');
  GlobalFonts.registerFromPath(path.resolve('assets/fonts/JetBrainsMono.ttf'), 'JetBrains Mono');
} catch {
  // Fonts may already be registered; canvas has a system fallback.
}

export interface LiveProfileStats {
  sessionsCount: number;
  chatHoursText: string;
  reputationPercent: number;
  personaName?: string;
  avatarUrl?: string;
  timezone?: string;
  matchIntent?: string;
  bio?: string;
}

export class ProfileCardGenerator {
  public readonly width = 960;
  public readonly height = 480;

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
    const background = ctx.createLinearGradient(0, 0, this.width, this.height);
    background.addColorStop(0, '#11131a');
    background.addColorStop(1, '#090a0f');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.strokeStyle = '#343744';
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

    ctx.strokeStyle = '#343744';
    ctx.beginPath();
    ctx.moveTo(48, 194);
    ctx.lineTo(this.width - 48, 194);
    ctx.stroke();

    const details: Array<[string, string]> = [
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
      // Cache writes are best-effort.
    }
    return buffer;
  }
}

export const profileCardGenerator = new ProfileCardGenerator();
