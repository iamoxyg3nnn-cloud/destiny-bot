export interface CompatibilityQuestion {
  id: number;
  question: string;
  options: { key: string; label: string; vibe: string }[];
}

export const COMPATIBILITY_QUESTIONS: CompatibilityQuestion[] = [
  {
    id: 1,
    question: 'How does your ideal recharging weekend look like?',
    options: [
      { key: 'A', label: 'Cozy night in with games, books, or movies', vibe: 'introvert_chill' },
      { key: 'B', label: 'Going out to concerts, parties, or social gatherings', vibe: 'extrovert_hype' },
      { key: 'C', label: 'Spontaneous road trip or outdoor hiking adventure', vibe: 'adventurer' },
      { key: 'D', label: 'Working on passion projects or learning new skills', vibe: 'creative_drive' },
    ],
  },
  {
    id: 2,
    question: 'When communicating with close friends, what is your preferred style?',
    options: [
      { key: 'A', label: 'Deep long voice calls or late-night talks', vibe: 'intimate_depth' },
      { key: 'B', label: 'Sending chaotic memes and short voice notes 24/7', vibe: 'meme_banter' },
      { key: 'C', label: 'Occasional check-ins where we pick up right where we left off', vibe: 'low_maintenance' },
      { key: 'D', label: 'Sharing music playlists and creative thoughts regularly', vibe: 'aesthetic_bond' },
    ],
  },
  {
    id: 3,
    question: 'What kind of humor makes you laugh the hardest?',
    options: [
      { key: 'A', label: 'Dry, witty sarcasm and deadpan delivery', vibe: 'witty' },
      { key: 'B', label: 'Absurdist, chaotic, and unhinged brainrot memes', vibe: 'chaotic' },
      { key: 'C', label: 'Clever situational comedy and relatable storytelling', vibe: 'relatable' },
      { key: 'D', label: 'Wholesome, heartwarming situational giggles', vibe: 'wholesome' },
    ],
  },
  {
    id: 4,
    question: 'How do you handle disagreements or misunderstandings?',
    options: [
      { key: 'A', label: 'Address it immediately and calmly talk it through', vibe: 'direct_calm' },
      { key: 'B', label: 'Take a brief quiet breather to process before responding', vibe: 'reflective' },
      { key: 'C', label: 'Use humor and lighthearted empathy to break the tension', vibe: 'empathic' },
      { key: 'D', label: 'Write out feelings clearly in structured text', vibe: 'articulate' },
    ],
  },
  {
    id: 5,
    question: 'What is your cosmic outlook on coincidences and destiny?',
    options: [
      { key: 'A', label: 'Everything happens for an exact reason; serendipity is real', vibe: 'destiny_believer' },
      { key: 'B', label: 'We make our own luck through deliberate choices', vibe: 'rational_builder' },
      { key: 'C', label: 'The universe is beautifully random, so enjoy the ride', vibe: 'free_spirit' },
      { key: 'D', label: 'A mysterious mix of fate and personal agency', vibe: 'mystic_balance' },
    ],
  },
];

export class CompatibilityEngine {
  calculateScore(answersUser1: Record<number, string>, answersUser2: Record<number, string>): {
    scorePercent: number;
    matchDescription: string;
    sharedVibesCount: number;
  } {
    let exactMatches = 0;
    const totalQuestions = COMPATIBILITY_QUESTIONS.length;

    for (let i = 1; i <= totalQuestions; i++) {
      if (answersUser1[i] && answersUser2[i] && answersUser1[i] === answersUser2[i]) {
        exactMatches++;
      }
    }

    // Base compatibility starts at 50% for completing the quiz together
    // Exact match contributes 10% each (up to 100%)
    const scorePercent = Math.min(50 + exactMatches * 10, 100);

    let matchDescription = 'Complementary Cosmic Orbit 🪐';
    if (scorePercent >= 90) {
      matchDescription = 'Twin Flame Resonance 🔥 (Rare 90%+ Sync)';
    } else if (scorePercent >= 75) {
      matchDescription = 'Harmonic Celestial Waves 🌊 (High Synergy)';
    } else if (scorePercent >= 60) {
      matchDescription = 'Fascinating Dual Perspectives 🌌 (Vibrant Chemistry)';
    }

    return {
      scorePercent,
      matchDescription,
      sharedVibesCount: exactMatches,
    };
  }
}

export const compatibilityEngine = new CompatibilityEngine();
