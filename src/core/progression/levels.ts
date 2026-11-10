import { ConnectionTier } from '../types.js';

export interface TierInfo {
  tier: ConnectionTier;
  minXp: number;
  maxXp: number;
  perks: string[];
  badge: string;
}

export const CONNECTION_TIERS: TierInfo[] = [
  {
    tier: 'Strangers',
    minXp: 0,
    maxXp: 50,
    perks: ['Anonymous chat relay', 'Icebreakers'],
    badge: '🌱',
  },
  {
    tier: 'Acquaintances',
    minXp: 51,
    maxXp: 150,
    perks: ['Unlock deeper conversation prompts', 'Priority icebreaker suggestions'],
    badge: '🌿',
  },
  {
    tier: 'Familiar',
    minXp: 151,
    maxXp: 350,
    perks: ['Unlock mutual profile reveal requests', 'Extended conversation recap'],
    badge: '🌸',
  },
  {
    tier: 'Connection',
    minXp: 351,
    maxXp: 700,
    perks: ['Unlock deeper compatibility matching', 'Cosmetic profile badges'],
    badge: '💫',
  },
  {
    tier: 'Trusted Connection',
    minXp: 701,
    maxXp: 1200,
    perks: ['Full mutual bio reveal', 'Permanent reconnection token'],
    badge: '⭐',
  },
  {
    tier: 'Destiny',
    minXp: 1201,
    maxXp: Infinity,
    perks: ['Destiny Soulmate title', 'Zero-fee reveal cards', 'Leaderboard recognition'],
    badge: '👑',
  },
];

export class ProgressionService {
  getTierFromXp(xp: number): TierInfo {
    for (let i = CONNECTION_TIERS.length - 1; i >= 0; i--) {
      if (xp >= CONNECTION_TIERS[i].minXp) {
        return CONNECTION_TIERS[i];
      }
    }
    return CONNECTION_TIERS[0];
  }

  canInitiateReveal(xp: number): boolean {
    return xp >= 150; // Familiar tier or higher
  }
}

export const progressionService = new ProgressionService();
