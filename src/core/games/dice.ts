import crypto from 'crypto';

export type DicePrediction = 'under' | 'seven' | 'over';

export interface DiceResult {
  prediction: DicePrediction;
  dice1: number;
  dice2: number;
  sum: number;
  isWin: boolean;
  multiplier: number;
  bet: number;
  payout: number;
  serverSeed: string;
}

export class DiceEngine {
  play(prediction: DicePrediction, bet: number): DiceResult {
    const serverSeed = crypto.randomBytes(16).toString('hex');
    const d1 = crypto.randomInt(1, 7);
    const d2 = crypto.randomInt(1, 7);
    const sum = d1 + d2;

    let isWin = false;
    let multiplier = 0;

    if (prediction === 'under' && sum < 7) {
      isWin = true;
      multiplier = 2.3;
    } else if (prediction === 'seven' && sum === 7) {
      isWin = true;
      multiplier = 5.8;
    } else if (prediction === 'over' && sum > 7) {
      isWin = true;
      multiplier = 2.3;
    }

    const payout = isWin ? Math.floor(bet * multiplier) : 0;

    return {
      prediction,
      dice1: d1,
      dice2: d2,
      sum,
      isWin,
      multiplier,
      bet,
      payout,
      serverSeed,
    };
  }
}

export const diceEngine = new DiceEngine();
