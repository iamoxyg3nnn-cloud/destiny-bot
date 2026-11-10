/**
 * Curated conversation starters used across slash commands, DM text commands
 * and the interactive Icebreaker button.
 */
export const ICEBREAKERS: readonly string[] = [
  'If you could instantly become a master at any skill tonight, what would you choose?',
  'What is a weird habit or ritual you have that you think nobody else does?',
  'Which fictional world would you move into for 24 hours if you could?',
  'What is the best piece of advice you have ever heard that actually changed how you live?',
  'What is a song or album that feels like a core memory to you?',
  'If your life had a soundtrack, what genre would dominate it right now?',
  'What is something you are secretly proud of that you do not get to brag about often?',
  'Would you rather explore the depths of the ocean or the furthest edges of space?',
  'What is the most spontaneous thing you have ever done that turned out amazing?',
  'If you could talk to your future self 10 years from now, what single question would you ask?',
  'What is a small thing that instantly makes your day better?',
  'What is one opinion you used to hold strongly but completely changed?',
  'If you had a free weekend and unlimited budget, what would you do?',
  'What is a book, show, or story you wish you could experience for the first time again?',
  'What is the kindest thing a stranger has ever done for you?',
];

/**
 * Pick a random icebreaker, optionally avoiding the prompt the user just saw.
 */
export function pickIcebreaker(previous?: string): string {
  if (ICEBREAKERS.length === 0) return '';
  if (!previous) {
    return ICEBREAKERS[Math.floor(Math.random() * ICEBREAKERS.length)];
  }

  const candidates = ICEBREAKERS.filter((prompt) => prompt !== previous);
  const pool = candidates.length > 0 ? candidates : ICEBREAKERS;
  return pool[Math.floor(Math.random() * pool.length)];
}
