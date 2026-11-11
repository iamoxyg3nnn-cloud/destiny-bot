import { MatchTicket } from '../types.js';
import { db } from '../../database/supabase.js';

export interface MatchCandidateResult {
  score: number;
  isEligible: boolean;
  sharedInterests: string[];
  reasons: string[];
}

export class MatchmakingEngine {
  /**
   * Evaluates if two tickets are mutually compatible and computes a compatibility score (0-100)
   */
  async evaluateMatch(
    ticketA: MatchTicket,
    ticketB: MatchTicket
  ): Promise<MatchCandidateResult> {
    const reasons: string[] = [];
    const validAge = (age: unknown): age is number => Number.isInteger(age) && Number(age) >= 18 && Number(age) <= 99;
    if (!ticketA || !ticketB || !validAge(ticketA.age) || !validAge(ticketB.age)) {
      return { score: 0, isEligible: false, sharedInterests: [], reasons: ['INVALID_PROFILE'] };
    }

    // 1. Prevent self-matching
    if (ticketA.userId === ticketB.userId || ticketA.discordUserId === ticketB.discordUserId) {
      return { score: 0, isEligible: false, sharedInterests: [], reasons: ['SELF_MATCH'] };
    }

    // 2. Global block list verification
    const isBlocked = await db.isBlocked(ticketA.userId, ticketB.userId);
    if (isBlocked) {
      return { score: 0, isEligible: false, sharedInterests: [], reasons: ['USER_BLOCKED'] };
    }

    // 3. Mutual Age eligibility (defaults to 18-99 if omitted)
    const aMin = Number.isInteger(ticketA.minAgePref) && ticketA.minAgePref >= 18 ? ticketA.minAgePref : 18;
    const aMax = Number.isInteger(ticketA.maxAgePref) && ticketA.maxAgePref <= 99 ? ticketA.maxAgePref : 99;
    const bMin = Number.isInteger(ticketB.minAgePref) && ticketB.minAgePref >= 18 ? ticketB.minAgePref : 18;
    const bMax = Number.isInteger(ticketB.maxAgePref) && ticketB.maxAgePref <= 99 ? ticketB.maxAgePref : 99;

    const aAcceptsB = ticketB.age >= aMin && ticketB.age <= aMax;
    const bAcceptsA = ticketA.age >= bMin && ticketA.age <= bMax;

    if (!aAcceptsB || !bAcceptsA) {
      return { score: 0, isEligible: false, sharedInterests: [], reasons: ['AGE_INCOMPATIBLE'] };
    }

    // 4. Gender is profile metadata only; every eligible user can match with anyone.

    // 5. Language compatibility (at least one shared language if both configured)
    const langsA = (Array.isArray(ticketA.languages) ? ticketA.languages : []).filter((l) => typeof l === 'string').map((l) => l.toLowerCase().trim());
    const langsB = (Array.isArray(ticketB.languages) ? ticketB.languages : []).filter((l) => typeof l === 'string').map((l) => l.toLowerCase().trim());
    if (langsA.length > 0 && langsB.length > 0) {
      const sharedLanguages = langsA.filter((lang) => langsB.includes(lang));
      if (sharedLanguages.length === 0) {
        return { score: 0, isEligible: false, sharedInterests: [], reasons: ['NO_COMMON_LANGUAGE'] };
      }
    }

    // 6. Interest overlap calculation (Jaccard Index)
    const setA = new Set((Array.isArray(ticketA.interests) ? ticketA.interests : []).filter((i) => typeof i === 'string').map((i) => i.trim().toLowerCase()));
    const setB = new Set((Array.isArray(ticketB.interests) ? ticketB.interests : []).filter((i) => typeof i === 'string').map((i) => i.trim().toLowerCase()));
    const sharedInterests = Array.from(setA).filter((interest) => setB.has(interest));

    let interestScore = 50; // Baseline compatibility for meeting all criteria
    const unionSize = new Set([...setA, ...setB]).size;
    if (unionSize > 0) {
      const overlapPercent = (sharedInterests.length / unionSize) * 50;
      interestScore += Math.round(overlapPercent);
    }

    // 7. Queue Wait Time Boost (prevent starvation)
    const now = Date.now();
    const waitA = Number.isFinite(ticketA.queuedAt) ? Math.max(0, (now - ticketA.queuedAt) / 1000) : 0;
    const waitB = Number.isFinite(ticketB.queuedAt) ? Math.max(0, (now - ticketB.queuedAt) / 1000) : 0;
    const waitTimeSec = Math.max(waitA, waitB);
    const waitBonus = Math.min(Math.floor(waitTimeSec / 10) * 2, 10);

    const finalScore = Math.min(interestScore + waitBonus, 100);

    return {
      score: finalScore,
      isEligible: true,
      sharedInterests,
      reasons: ['MUTUAL_COMPATIBILITY_CONFIRMED'],
    };
  }

  /**
   * Scan an array of tickets to find the best compatible match for a given ticket
   */
  async findBestMatch(
    ticket: MatchTicket,
    candidates: MatchTicket[]
  ): Promise<{ partner: MatchTicket; matchResult: MatchCandidateResult } | null> {
    let bestPartner: MatchTicket | null = null;
    let bestResult: MatchCandidateResult | null = null;

    for (const candidate of candidates) {
      if (candidate.userId === ticket.userId) continue;

      const result = await this.evaluateMatch(ticket, candidate);
      if (result.isEligible) {
        if (!bestResult || result.score > bestResult.score) {
          bestResult = result;
          bestPartner = candidate;
        }
      }
    }

    if (bestPartner && bestResult) {
      return { partner: bestPartner, matchResult: bestResult };
    }
    return null;
  }
}

export const matchmakingEngine = new MatchmakingEngine();
