import crypto from 'crypto';

export type GuessDirection = 'higher' | 'lower';

export interface CardRank {
  rank: string;
  value: number;
}

const RANKS: CardRank[] = [
  { rank: '2', value: 2 },
  { rank: '3', value: 3 },
  { rank: '4', value: 4 },
  { rank: '5', value: 5 },
  { rank: '6', value: 6 },
  { rank: '7', value: 7 },
  { rank: '8', value: 8 },
  { rank: '9', value: 9 },
  { rank: '10', value: 10 },
  { rank: 'J', value: 11 },
  { rank: 'Q', value: 12 },
  { rank: 'K', value: 13 },
  { rank: 'A', value: 14 },
];

export interface HigherLowerResult {
  currentCard: CardRank;
  nextCard: CardRank;
  guess: GuessDirection;
  isWin: boolean;
  multiplier: number;
  bet: number;
  payout: number;
  serverSeed: string;
}

export class HigherLowerEngine {
  play(currentRankValue: number, guess: GuessDirection, bet: number): HigherLowerResult {
    const serverSeed = crypto.randomBytes(16).toString('hex');
    const currentCard = RANKS.find((r) => r.value === currentRankValue) || RANKS[crypto.randomInt(0, RANKS.length)];
    const nextCard = RANKS[crypto.randomInt(0, RANKS.length)];

    let isWin = false;
    let multiplier = 0;

    if (guess === 'higher') {
      isWin = nextCard.value > currentCard.value;
      multiplier = isWin ? 1.85 : 0;
    } else {
      isWin = nextCard.value < currentCard.value;
      multiplier = isWin ? 1.85 : 0;
    }

    // Tie is a friendly push (returns bet)
    if (nextCard.value === currentCard.value) {
      isWin = true;
      multiplier = 1.0;
    }

    const payout = Math.floor(bet * multiplier);

    return {
      currentCard,
      nextCard,
      guess,
      isWin,
      multiplier,
      bet,
      payout,
      serverSeed,
    };
  }
}

export const higherLowerEngine = new HigherLowerEngine();
