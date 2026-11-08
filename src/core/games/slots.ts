import crypto from 'crypto';

export interface SlotSymbol {
  icon: string;
  name: string;
  weight: number;
}

const SYMBOLS: SlotSymbol[] = [
  { icon: '🍒', name: 'Cherry', weight: 35 },
  { icon: '🍋', name: 'Lemon', weight: 25 },
  { icon: '🍇', name: 'Grape', weight: 20 },
  { icon: '🔔', name: 'Bell', weight: 12 },
  { icon: '💎', name: 'Diamond', weight: 6 },
  { icon: '7️⃣', name: 'Seven', weight: 2 },
];

export interface SlotSpinResult {
  reels: string[];
  isWin: boolean;
  multiplier: number;
  bet: number;
  payout: number;
  jackpot: boolean;
  serverSeed: string;
}

export class SlotEngine {
  private totalWeight: number;

  constructor() {
    this.totalWeight = SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
  }

  private pickSymbol(): SlotSymbol {
    let rand = crypto.randomInt(0, this.totalWeight);
    for (const sym of SYMBOLS) {
      if (rand < sym.weight) return sym;
      rand -= sym.weight;
    }
    return SYMBOLS[0];
  }

  spin(bet: number): SlotSpinResult {
    const serverSeed = crypto.randomBytes(16).toString('hex');
    const reels = [this.pickSymbol(), this.pickSymbol(), this.pickSymbol()];
    const icons = reels.map((r) => r.icon);

    let multiplier = 0;
    let jackpot = false;

    // Check 3 matching
    if (icons[0] === icons[1] && icons[1] === icons[2]) {
      const sym = icons[0];
      if (sym === '7️⃣') {
        multiplier = 200; // Mega Jackpot!
        jackpot = true;
      } else if (sym === '💎') {
        multiplier = 50;
      } else if (sym === '🔔') {
        multiplier = 25;
      } else if (sym === '🍇') {
        multiplier = 15;
      } else if (sym === '🍋') {
        multiplier = 10;
      } else if (sym === '🍒') {
        multiplier = 6;
      }
    } 
    // Check 2 matching
    else if (icons[0] === icons[1] || icons[1] === icons[2] || icons[0] === icons[2]) {
      const match = icons[0] === icons[1] ? icons[0] : (icons[1] === icons[2] ? icons[1] : icons[0]);
      if (match === '7️⃣') multiplier = 5;
      else if (match === '💎') multiplier = 3;
      else if (match === '🍒') multiplier = 2;
      else multiplier = 1.2;
    }

    const isWin = multiplier > 0;
    const payout = Math.floor(bet * multiplier);

    return {
      reels: icons,
      isWin,
      multiplier,
      bet,
      payout,
      jackpot,
      serverSeed,
    };
  }
}

export const slotEngine = new SlotEngine();
