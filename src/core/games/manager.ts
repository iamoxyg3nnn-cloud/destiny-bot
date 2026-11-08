import { db } from '../../database/supabase.js';
import { lockManager } from '../../redis/locks.js';
import { coinFlipEngine, CoinChoice, CoinFlipResult } from './coinflip.js';
import { blackjackEngine, BlackjackGameSession } from './blackjack.js';
import { diceEngine, DicePrediction, DiceResult } from './dice.js';
import { slotEngine, SlotSpinResult } from './slots.js';
import { higherLowerEngine, GuessDirection, HigherLowerResult } from './higherlower.js';
import { truthOrDareEngine, TruthOrDareItem, PromptType, SpiceLevel } from './truthordare.js';
import { wouldYouRatherEngine, WouldYouRatherItem } from './wouldyourather.js';
import { triviaEngine, TriviaQuestion } from './trivia.js';
import { compatibilityEngine, COMPATIBILITY_QUESTIONS } from './compatibility.js';
import { GameType } from '../types.js';
import { v4 as uuidv4 } from 'uuid';

export class GameManager {
  private activeBlackjackSessions: Map<string, BlackjackGameSession> = new Map();
  private activeCompatibilitySessions: Map<string, { u1Answers: Record<number, string>; u2Answers: Record<number, string> }> = new Map();

  // ---------------- COIN FLIP ----------------
  async playCoinFlip(userId: string, choice: CoinChoice, bet: number): Promise<{ success: boolean; result?: CoinFlipResult; error?: string }> {
    if (bet <= 0) return { success: false, error: 'Bet amount must be greater than 0.' };

    return await lockManager.withLock(`lock:wallet:${userId}`, async () => {
      // 1. Debit bet
      const debitRef = `game:coinflip:bet:${uuidv4()}`;
      const debitRes = await db.executeCoinTransaction(userId, -bet, 'game_loss', debitRef, { game: 'coin_flip', choice });
      if (!debitRes.success) {
        return { success: false, error: debitRes.error || 'Insufficient Destiny Coins balance.' };
      }

      // 2. Compute outcome
      const outcome = coinFlipEngine.play(choice, bet);

      // 3. Credit if win
      if (outcome.payout > 0) {
        const winRef = `game:coinflip:win:${uuidv4()}`;
        await db.executeCoinTransaction(userId, outcome.payout, 'game_win', winRef, { game: 'coin_flip', serverSeed: outcome.serverSeed });
      }

      // 4. Record history
      await db.recordGame({
        userId,
        gameType: 'coin_flip',
        betAmount: bet,
        payoutAmount: outcome.payout,
        outcome: outcome.isWin ? 'win' : 'loss',
        serverSeed: outcome.serverSeed,
        gameState: outcome,
      });

      return { success: true, result: outcome };
    });
  }

  // ---------------- BLACKJACK ----------------
  async startBlackjack(userId: string, bet: number): Promise<{ success: boolean; session?: BlackjackGameSession; error?: string }> {
    if (bet <= 0) return { success: false, error: 'Bet amount must be greater than 0.' };

    return await lockManager.withLock(`lock:wallet:${userId}`, async () => {
      const debitRef = `game:blackjack:bet:${uuidv4()}`;
      const debitRes = await db.executeCoinTransaction(userId, -bet, 'game_loss', debitRef, { game: 'blackjack' });
      if (!debitRes.success) {
        return { success: false, error: debitRes.error || 'Insufficient Destiny Coins balance.' };
      }

      const session = blackjackEngine.startSession(userId, bet);

      if (session.status !== 'playing') {
        // Immediate blackjack or push
        if (session.payout > 0) {
          const winRef = `game:blackjack:payout:${uuidv4()}`;
          await db.executeCoinTransaction(userId, session.payout, 'game_win', winRef, { game: 'blackjack' });
        }
        await db.recordGame({
          userId,
          gameType: 'blackjack',
          betAmount: bet,
          payoutAmount: session.payout,
          outcome: session.status === 'push' ? 'push' : (session.status === 'dealer_won' ? 'loss' : 'win'),
          serverSeed: session.serverSeed,
          gameState: session,
        });
      } else {
        this.activeBlackjackSessions.set(session.id, session);
      }

      return { success: true, session };
    });
  }

  async hitBlackjack(sessionId: string): Promise<{ success: boolean; session?: BlackjackGameSession; error?: string }> {
    const session = this.activeBlackjackSessions.get(sessionId);
    if (!session) return { success: false, error: 'Session expired or not found.' };

    blackjackEngine.hit(session);

    if (session.status !== 'playing') {
      this.activeBlackjackSessions.delete(sessionId);
      await db.recordGame({
        userId: session.userId,
        gameType: 'blackjack',
        betAmount: session.bet,
        payoutAmount: 0,
        outcome: 'loss',
        serverSeed: session.serverSeed,
        gameState: session,
      });
    }

    return { success: true, session };
  }

  async standBlackjack(sessionId: string): Promise<{ success: boolean; session?: BlackjackGameSession; error?: string }> {
    const session = this.activeBlackjackSessions.get(sessionId);
    if (!session) return { success: false, error: 'Session expired or not found.' };

    blackjackEngine.stand(session);
    this.activeBlackjackSessions.delete(sessionId);

    if (session.payout > 0) {
      const winRef = `game:blackjack:stand:${uuidv4()}`;
      await db.executeCoinTransaction(session.userId, session.payout, 'game_win', winRef, { game: 'blackjack' });
    }

    await db.recordGame({
      userId: session.userId,
      gameType: 'blackjack',
      betAmount: session.bet,
      payoutAmount: session.payout,
      outcome: session.status === 'push' ? 'push' : (session.status === 'dealer_won' ? 'loss' : 'win'),
      serverSeed: session.serverSeed,
      gameState: session,
    });

    return { success: true, session };
  }

  // ---------------- DICE ----------------
  async playDice(userId: string, prediction: DicePrediction, bet: number): Promise<{ success: boolean; result?: DiceResult; error?: string }> {
    if (bet <= 0) return { success: false, error: 'Bet amount must be greater than 0.' };

    return await lockManager.withLock(`lock:wallet:${userId}`, async () => {
      const debitRef = `game:dice:bet:${uuidv4()}`;
      const debitRes = await db.executeCoinTransaction(userId, -bet, 'game_loss', debitRef, { game: 'dice', prediction });
      if (!debitRes.success) {
        return { success: false, error: debitRes.error || 'Insufficient Destiny Coins balance.' };
      }

      const outcome = diceEngine.play(prediction, bet);

      if (outcome.payout > 0) {
        const winRef = `game:dice:win:${uuidv4()}`;
        await db.executeCoinTransaction(userId, outcome.payout, 'game_win', winRef, { game: 'dice' });
      }

      await db.recordGame({
        userId,
        gameType: 'dice',
        betAmount: bet,
        payoutAmount: outcome.payout,
        outcome: outcome.isWin ? 'win' : 'loss',
        serverSeed: outcome.serverSeed,
        gameState: outcome,
      });

      return { success: true, result: outcome };
    });
  }

  // ---------------- SLOTS ----------------
  async playSlots(userId: string, bet: number): Promise<{ success: boolean; result?: SlotSpinResult; error?: string }> {
    if (bet <= 0) return { success: false, error: 'Bet amount must be greater than 0.' };

    return await lockManager.withLock(`lock:wallet:${userId}`, async () => {
      const debitRef = `game:slots:bet:${uuidv4()}`;
      const debitRes = await db.executeCoinTransaction(userId, -bet, 'game_loss', debitRef, { game: 'slots' });
      if (!debitRes.success) {
        return { success: false, error: debitRes.error || 'Insufficient Destiny Coins balance.' };
      }

      const outcome = slotEngine.spin(bet);

      if (outcome.payout > 0) {
        const winRef = `game:slots:win:${uuidv4()}`;
        await db.executeCoinTransaction(userId, outcome.payout, 'game_win', winRef, { game: 'slots' });
      }

      await db.recordGame({
        userId,
        gameType: 'slots',
        betAmount: bet,
        payoutAmount: outcome.payout,
        outcome: outcome.isWin ? 'win' : 'loss',
        serverSeed: outcome.serverSeed,
        gameState: outcome,
      });

      return { success: true, result: outcome };
    });
  }

  // ---------------- HIGHER / LOWER ----------------
  async playHigherLower(userId: string, currentRank: number, guess: GuessDirection, bet: number): Promise<{ success: boolean; result?: HigherLowerResult; error?: string }> {
    if (bet <= 0) return { success: false, error: 'Bet amount must be greater than 0.' };

    return await lockManager.withLock(`lock:wallet:${userId}`, async () => {
      const debitRef = `game:higherlower:bet:${uuidv4()}`;
      const debitRes = await db.executeCoinTransaction(userId, -bet, 'game_loss', debitRef, { game: 'higher_lower' });
      if (!debitRes.success) {
        return { success: false, error: debitRes.error || 'Insufficient Destiny Coins balance.' };
      }

      const outcome = higherLowerEngine.play(currentRank, guess, bet);

      if (outcome.payout > 0) {
        const winRef = `game:higherlower:win:${uuidv4()}`;
        await db.executeCoinTransaction(userId, outcome.payout, 'game_win', winRef, { game: 'higher_lower' });
      }

      await db.recordGame({
        userId,
        gameType: 'higher_lower',
        betAmount: bet,
        payoutAmount: outcome.payout,
        outcome: outcome.isWin ? 'win' : 'loss',
        serverSeed: outcome.serverSeed,
        gameState: outcome,
      });

      return { success: true, result: outcome };
    });
  }

  // ---------------- SOCIAL ROOM GAMES ----------------
  getTruthOrDare(type?: PromptType, level?: SpiceLevel): TruthOrDareItem {
    return truthOrDareEngine.getRandomPrompt(type, level);
  }

  getWouldYouRather(): WouldYouRatherItem {
    return wouldYouRatherEngine.getRandomDilemma();
  }

  voteWouldYouRather(id: string, choice: 'A' | 'B'): { percentA: number; percentB: number; totalVotes: number } {
    return wouldYouRatherEngine.recordVote(id, choice);
  }

  getTrivia(category?: string): TriviaQuestion {
    return triviaEngine.getRandomQuestion(category);
  }

  async answerTrivia(userId: string, questionId: string, selectedIndex: number, roomId?: string): Promise<{ isCorrect: boolean; correctOption: string; explanation: string; dcAwarded: number }> {
    const res = triviaEngine.evaluateAnswer(questionId, selectedIndex);
    let dcAwarded = 0;

    if (res.isCorrect) {
      dcAwarded = 25;
      const ref = `trivia:award:${uuidv4()}`;
      await db.executeCoinTransaction(userId, dcAwarded, 'mission_reward', ref, { questionId });
      if (roomId) {
        await db.updateRoomXP(roomId, 20); // XP for learning together
      }
    }

    return {
      ...res,
      dcAwarded,
    };
  }

  getCompatibilityQuestions() {
    return COMPATIBILITY_QUESTIONS;
  }

  async submitCompatibilityAnswer(roomId: string, userId: string, isUser1: boolean, answers: Record<number, string>): Promise<{ complete: boolean; result?: any }> {
    let session = this.activeCompatibilitySessions.get(roomId);
    if (!session) {
      session = { u1Answers: {}, u2Answers: {} };
      this.activeCompatibilitySessions.set(roomId, session);
    }

    if (isUser1) {
      session.u1Answers = answers;
    } else {
      session.u2Answers = answers;
    }

    const u1Done = Object.keys(session.u1Answers).length >= COMPATIBILITY_QUESTIONS.length;
    const u2Done = Object.keys(session.u2Answers).length >= COMPATIBILITY_QUESTIONS.length;

    if (u1Done && u2Done) {
      const evalResult = compatibilityEngine.calculateScore(session.u1Answers, session.u2Answers);
      this.activeCompatibilitySessions.delete(roomId);
      await db.updateRoomXP(roomId, 60); // Bonus XP
      return { complete: true, result: evalResult };
    }

    return { complete: false };
  }
}

export const gameManager = new GameManager();
