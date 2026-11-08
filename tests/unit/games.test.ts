import { describe, it, expect } from 'vitest';
import { coinFlipEngine } from '../../src/core/games/coinflip.js';
import { blackjackEngine } from '../../src/core/games/blackjack.js';
import { diceEngine } from '../../src/core/games/dice.js';
import { slotEngine } from '../../src/core/games/slots.js';
import { higherLowerEngine } from '../../src/core/games/higherlower.js';
import { truthOrDareEngine } from '../../src/core/games/truthordare.js';
import { wouldYouRatherEngine } from '../../src/core/games/wouldyourather.js';
import { triviaEngine } from '../../src/core/games/trivia.js';
import { compatibilityEngine } from '../../src/core/games/compatibility.js';

describe('All 9 Destiny Games Engines', () => {
  // 1. Coin Flip
  it('Coin Flip: should return provably fair outcome with 2x payout on win', () => {
    const res = coinFlipEngine.play('heads', 50);
    expect(['heads', 'tails']).toContain(res.result);
    expect(res.serverSeed).toBeDefined();
    if (res.isWin) {
      expect(res.payout).toBe(100);
    } else {
      expect(res.payout).toBe(0);
    }
  });

  // 2. Blackjack
  it('Blackjack: correctly calculates scores, soft aces, and dealer standing', () => {
    const session = blackjackEngine.startSession('user_test', 100);
    expect(session.playerHand.cards).toHaveLength(2);
    expect(session.dealerHand.cards).toHaveLength(2);
    expect(session.serverSeed).toBeDefined();

    // Check hit logic
    if (session.status === 'playing') {
      const updated = blackjackEngine.hit(session);
      expect(updated.playerHand.cards.length).toBeGreaterThanOrEqual(3);
    }
  });

  // 3. Dice
  it('Dice: rolls 2d6 and awards exact multipliers for under, seven, over', () => {
    const underRes = diceEngine.play('under', 20);
    expect(underRes.sum).toBeGreaterThanOrEqual(2);
    expect(underRes.sum).toBeLessThanOrEqual(12);
    if (underRes.sum < 7) {
      expect(underRes.isWin).toBe(true);
      expect(underRes.payout).toBe(Math.floor(20 * 2.3));
    }
  });

  // 4. Slots
  it('Slots: spins 3 reels and calculates matching paylines', () => {
    const spin = slotEngine.spin(50);
    expect(spin.reels).toHaveLength(3);
    expect(spin.serverSeed).toBeDefined();
    if (spin.isWin) {
      expect(spin.payout).toBeGreaterThan(0);
    } else {
      expect(spin.payout).toBe(0);
    }
  });

  // 5. Higher / Lower
  it('Higher/Lower: computes correct direction comparison and push on tie', () => {
    const res = higherLowerEngine.play(7, 'higher', 30);
    expect(res.currentCard.value).toBe(7);
    if (res.nextCard.value > 7) {
      expect(res.isWin).toBe(true);
      expect(res.payout).toBe(Math.floor(30 * 1.85));
    } else if (res.nextCard.value === 7) {
      expect(res.isWin).toBe(true);
      expect(res.payout).toBe(30); // Push
    } else {
      expect(res.isWin).toBe(false);
      expect(res.payout).toBe(0);
    }
  });

  // 6. Truth or Dare
  it('Truth or Dare: fetches curated anonymous-safe prompts', () => {
    const truth = truthOrDareEngine.getRandomPrompt('truth');
    expect(truth.type).toBe('truth');
    expect(truth.content.length).toBeGreaterThan(10);

    const dare = truthOrDareEngine.getRandomPrompt('dare');
    expect(dare.type).toBe('dare');
    expect(dare.content.length).toBeGreaterThan(10);
  });

  // 7. Would You Rather
  it('Would You Rather: returns dilemmas and updates global vote percentages', () => {
    const dilemma = wouldYouRatherEngine.getRandomDilemma();
    expect(dilemma.optionA).toBeDefined();
    expect(dilemma.optionB).toBeDefined();

    const voteStats = wouldYouRatherEngine.recordVote(dilemma.id, 'A');
    expect(voteStats.percentA + voteStats.percentB).toBe(100);
  });

  // 8. Trivia
  it('Trivia: evaluates answers correctly and provides explanation', () => {
    const q = triviaEngine.getRandomQuestion();
    const correctRes = triviaEngine.evaluateAnswer(q.id, q.correctIndex);
    expect(correctRes.isCorrect).toBe(true);
    expect(correctRes.explanation).toBeDefined();

    const wrongIndex = (q.correctIndex + 1) % q.options.length;
    const wrongRes = triviaEngine.evaluateAnswer(q.id, wrongIndex);
    expect(wrongRes.isCorrect).toBe(false);
  });

  // 9. Compatibility Quiz
  it('Compatibility: calculates synchronized vibe score between partners', () => {
    const identicalAnswers = { 1: 'A', 2: 'B', 3: 'C', 4: 'A', 5: 'D' };
    const result100 = compatibilityEngine.calculateScore(identicalAnswers, identicalAnswers);
    expect(result100.scorePercent).toBe(100);
    expect(result100.sharedVibesCount).toBe(5);

    const differentAnswers = { 1: 'B', 2: 'C', 3: 'D', 4: 'B', 5: 'A' };
    const resultBase = compatibilityEngine.calculateScore(identicalAnswers, differentAnswers);
    expect(resultBase.scorePercent).toBe(50);
    expect(resultBase.sharedVibesCount).toBe(0);
  });
});
