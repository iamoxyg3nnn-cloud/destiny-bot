import crypto from 'crypto';

export type CoinChoice = 'heads' | 'tails';

export interface CoinFlipResult {
  choice: CoinChoice;
  result: CoinChoice;
  isWin: boolean;
  bet: number;
  payout: number;
  serverSeed: string;
}

export class CoinFlipEngine {
  play(choice: CoinChoice, bet: number): CoinFlipResult {
    const serverSeed = crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHash('sha256').update(serverSeed).digest('hex');
    const num = parseInt(hash.substring(0, 8), 16);
    const result: CoinChoice = num % 2 === 0 ? 'heads' : 'tails';

    const isWin = choice.toLowerCase() === result;
    const payout = isWin ? bet * 2 : 0;

    return {
      choice,
      result,
      isWin,
      bet,
      payout,
      serverSeed,
    };
  }
}

export const coinFlipEngine = new CoinFlipEngine();
