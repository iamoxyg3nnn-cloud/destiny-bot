import crypto from 'crypto';

export interface WouldYouRatherItem {
  id: string;
  optionA: string;
  optionB: string;
  votesA: number;
  votesB: number;
}

export const WYR_DATABASE: WouldYouRatherItem[] = [
  {
    id: 'wyr_1',
    optionA: 'Have the ability to speak any language fluently on demand',
    optionB: 'Have the ability to play any musical instrument masterfully',
    votesA: 1420,
    votesB: 980,
  },
  {
    id: 'wyr_2',
    optionA: 'Live 100 years into the futuristic high-tech future',
    optionB: 'Travel 500 years into the ancient historical past with modern knowledge',
    votesA: 1650,
    votesB: 830,
  },
  {
    id: 'wyr_3',
    optionA: 'Always know when someone is lying to you',
    optionB: 'Always get away with any lie you ever tell',
    votesA: 1890,
    votesB: 620,
  },
  {
    id: 'wyr_4',
    optionA: 'Have infinite Destiny Coins to buy every cosmetic item',
    optionB: 'Guaranteed match with your true soulmate every single day',
    votesA: 410,
    votesB: 2340,
  },
  {
    id: 'wyr_5',
    optionA: 'Never have to sleep again with zero fatigue',
    optionB: 'Fall asleep immediately anywhere in under 10 seconds and have vivid lucid dreams',
    votesA: 1290,
    votesB: 1530,
  },
  {
    id: 'wyr_6',
    optionA: 'Explore the deepest unexplored trenches of the alien ocean',
    optionB: 'Explore an unknown habitable exoplanet in another star galaxy',
    votesA: 670,
    votesB: 2110,
  },
];

export class WouldYouRatherEngine {
  getRandomDilemma(): WouldYouRatherItem {
    const idx = crypto.randomInt(0, WYR_DATABASE.length);
    return { ...WYR_DATABASE[idx] };
  }

  recordVote(id: string, choice: 'A' | 'B'): { percentA: number; percentB: number; totalVotes: number } {
    const item = WYR_DATABASE.find((w) => w.id === id);
    if (item) {
      if (choice === 'A') item.votesA++;
      else item.votesB++;

      const total = item.votesA + item.votesB;
      const percentA = Math.round((item.votesA / total) * 100);
      const percentB = 100 - percentA;
      return { percentA, percentB, totalVotes: total };
    }
    return { percentA: 50, percentB: 50, totalVotes: 100 };
  }
}

export const wouldYouRatherEngine = new WouldYouRatherEngine();
