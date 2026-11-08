import crypto from 'crypto';

export type PromptType = 'truth' | 'dare';
export type SpiceLevel = 'chill' | 'deep' | 'fun' | 'spicy';

export interface TruthOrDareItem {
  id: string;
  type: PromptType;
  level: SpiceLevel;
  content: string;
}

export const TRUTH_OR_DARE_BANK: TruthOrDareItem[] = [
  // Truths - Chill / Fun
  { id: 't1', type: 'truth', level: 'chill', content: 'What is the most bizarre dream you have ever had that you still remember vividly?' },
  { id: 't2', type: 'truth', level: 'chill', content: 'What is the most useless talent or party trick you can perform?' },
  { id: 't3', type: 'truth', level: 'chill', content: 'If your life was a movie soundtrack, which artist would produce it?' },
  { id: 't4', type: 'truth', level: 'chill', content: 'What is a movie or TV show everyone loves that you secretly think is overrated?' },
  { id: 't5', type: 'truth', level: 'chill', content: 'What is your absolute ultimate comfort food after an exhausting week?' },

  // Truths - Deep
  { id: 't6', type: 'truth', level: 'deep', content: 'What is a core belief you held five years ago that you completely changed your mind about?' },
  { id: 't7', type: 'truth', level: 'deep', content: 'If you could know the absolute truth about one mystery of the universe, what would it be?' },
  { id: 't8', type: 'truth', level: 'deep', content: 'What is something you rarely tell people because you worry they might misunderstand you?' },
  { id: 't9', type: 'truth', level: 'deep', content: 'What does genuine happiness or peace look like to you in daily life?' },
  { id: 't10', type: 'truth', level: 'deep', content: 'Have you ever felt an instant soul-level connection with someone you just met?' },

  // Truths - Fun / Spicy
  { id: 't11', type: 'truth', level: 'fun', content: 'What is the most embarrassing fashion trend or aesthetic phase you went through?' },
  { id: 't12', type: 'truth', level: 'spicy', content: 'What is your biggest green flag and red flag in someone you want to get close to?' },
  { id: 't13', type: 'truth', level: 'spicy', content: 'What is something you find wildly attractive in a personality that other people overlook?' },
  { id: 't14', type: 'truth', level: 'fun', content: 'If you had to switch lives with your chat partner right now based only on vibe, would you?' },

  // Dares - Chill / Fun
  { id: 'd1', type: 'dare', level: 'chill', content: 'Send your partner a haiku (5-7-5 syllables) describing how this conversation feels so far.' },
  { id: 'd2', type: 'dare', level: 'chill', content: 'Explain your current favorite hobby using only emojis and let your partner guess it.' },
  { id: 'd3', type: 'dare', level: 'fun', content: 'Type out the chorus of your favorite song entirely in Shakespearean / pirate slang.' },
  { id: 'd4', type: 'dare', level: 'fun', content: 'Write a 3-sentence dramatic sci-fi trailer narration about you and your partner saving Earth.' },
  { id: 'd5', type: 'dare', level: 'fun', content: 'Give your chat partner a unique superhero codename based on their anonymous pseudonym.' },
  { id: 'd6', type: 'dare', level: 'deep', content: 'Share three genuine compliments about your partner based purely on your conversation.' },
  { id: 'd7', type: 'dare', level: 'spicy', content: 'Tell your partner a convincing lie and two truths; challenge them to spot the lie.' },
  { id: 'd8', type: 'dare', level: 'fun', content: 'Reply to the next 3 messages speaking exclusively like a medieval royal herald.' }
];

export class TruthOrDareEngine {
  getRandomPrompt(type?: PromptType, level?: SpiceLevel): TruthOrDareItem {
    let pool = TRUTH_OR_DARE_BANK;
    if (type) pool = pool.filter((item) => item.type === type);
    if (level) pool = pool.filter((item) => item.level === level);

    if (pool.length === 0) pool = TRUTH_OR_DARE_BANK;
    const index = crypto.randomInt(0, pool.length);
    return pool[index];
  }
}

export const truthOrDareEngine = new TruthOrDareEngine();
