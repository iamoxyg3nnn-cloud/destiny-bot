import crypto from 'crypto';

export interface TriviaQuestion {
  id: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export const TRIVIA_BANK: TriviaQuestion[] = [
  {
    id: 'triv_1',
    category: 'Astronomy',
    difficulty: 'easy',
    question: 'Which planet in our solar system has the most prominent and visible ring system?',
    options: ['Jupiter', 'Saturn', 'Neptune', 'Uranus'],
    correctIndex: 1,
    explanation: 'Saturn has the most extensive and visible ring system made primarily of ice particles and rocky debris.',
  },
  {
    id: 'triv_2',
    category: 'Computer Science',
    difficulty: 'medium',
    question: 'In distributed systems and databases, what does the "A" in ACID transactions stand for?',
    options: ['Asynchronous', 'Availability', 'Atomicity', 'Authentication'],
    correctIndex: 2,
    explanation: 'Atomicity guarantees that all operations within a transaction succeed together or none take effect.',
  },
  {
    id: 'triv_3',
    category: 'Gaming',
    difficulty: 'easy',
    question: 'In the game "Destiny 2", what are the enigmatic cosmic beings who oversee the Dares of Eternity called?',
    options: ['The Nine', 'The Hive', 'The Cabal', 'The Vex'],
    correctIndex: 0,
    explanation: 'The Nine and the Starhorse host the cosmic realm of Dares of Eternity.',
  },
  {
    id: 'triv_4',
    category: 'Mythology',
    difficulty: 'medium',
    question: 'In Norse mythology, what is the name of the cosmic tree that connects the nine realms?',
    options: ['Valhalla', 'Bifrost', 'Yggdrasil', 'Midgard'],
    correctIndex: 2,
    explanation: 'Yggdrasil is the great world tree connecting Asgard, Midgard, and the other mythical realms.',
  },
  {
    id: 'triv_5',
    category: 'Pop Culture & Film',
    difficulty: 'easy',
    question: 'In the 2014 sci-fi film "Interstellar", what was the name of the supermassive black hole?',
    options: ['Gargantua', 'Cygnus X-1', 'Sagittarius A*', 'Event Horizon'],
    correctIndex: 0,
    explanation: 'Gargantua is the supermassive black hole around which Miller and Mann planets orbited.',
  },
  {
    id: 'triv_6',
    category: 'Science',
    difficulty: 'hard',
    question: 'What is the speed of light in a vacuum approximately rounded in kilometers per second?',
    options: ['150,000 km/s', '300,000 km/s', '450,000 km/s', '1,000,000 km/s'],
    correctIndex: 1,
    explanation: 'The speed of light in vacuum is approximately 299,792 km/s (often rounded to 300,000 km/s).',
  },
];

export class TriviaEngine {
  getRandomQuestion(category?: string): TriviaQuestion {
    let pool = TRIVIA_BANK;
    if (category) {
      pool = pool.filter((q) => q.category.toLowerCase() === category.toLowerCase());
    }
    if (pool.length === 0) pool = TRIVIA_BANK;
    const idx = crypto.randomInt(0, pool.length);
    return pool[idx];
  }

  evaluateAnswer(questionId: string, selectedIndex: number): { isCorrect: boolean; correctOption: string; explanation: string } {
    const q = TRIVIA_BANK.find((item) => item.id === questionId);
    if (!q) {
      return { isCorrect: false, correctOption: 'Unknown', explanation: 'Question not found' };
    }
    const isCorrect = q.correctIndex === selectedIndex;
    return {
      isCorrect,
      correctOption: q.options[q.correctIndex],
      explanation: q.explanation,
    };
  }
}

export const triviaEngine = new TriviaEngine();
