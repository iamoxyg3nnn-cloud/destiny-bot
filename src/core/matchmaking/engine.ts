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
    const aMin = ticketA.minAgePref || 18;
    const aMax = ticketA.maxAgePref || 99;
    const bMin = ticketB.minAgePref || 18;
    const bMax = ticketB.maxAgePref || 99;

    const aAcceptsB = ticketB.age >= aMin && ticketB.age <= aMax;
    const bAcceptsA = ticketA.age >= bMin && ticketA.age <= bMax;

    if (!aAcceptsB || !bAcceptsA) {
      return { score: 0, isEligible: false, sharedInterests: [], reasons: ['AGE_INCOMPATIBLE'] };
    }

    // 4. Mutual Gender Preference
    const checkWantsGender = (ticket: MatchTicket, candidate: MatchTicket): boolean => {
      const prefs = (ticket.preferredGender || []).map((p) => p.trim().toLowerCase());
      const candidateGender = (candidate.gender || '').trim().toLowerCase();
      const myGender = (ticket.gender || '').trim().toLowerCase();

      // Wildcard / Any (or unset)
      if (prefs.length === 0 || prefs.includes('any') || prefs.includes('all') || prefs.includes('either') || prefs.includes('both')) {
        return true;
      }

      // Direct match
      if (prefs.includes(candidateGender)) {
        return true;
      }

      // Alter / Opposite / Other gender preference
      if (prefs.includes('alter') || prefs.includes('opposite') || prefs.includes('other')) {
        if (myGender === 'male' && candidateGender === 'female') return true;
        if (myGender === 'female' && candidateGender === 'male') return true;
        if (myGender !== candidateGender) return true;
      }

      // Synonyms for female
      const femaleSynonyms = ['f', 'female', 'woman', 'women', 'girl'];
      if (candidateGender === 'female' && prefs.some((p) => femaleSynonyms.includes(p))) {
        return true;
      }

      // Synonyms for male
      const maleSynonyms = ['m', 'male', 'man', 'men', 'boy', 'guy'];
      if (candidateGender === 'male' && prefs.some((p) => maleSynonyms.includes(p))) {
        return true;
      }

      return false;
    };

    const aWantsBGender = checkWantsGender(ticketA, ticketB);
    const bWantsAGender = checkWantsGender(ticketB, ticketA);

    if (!aWantsBGender || !bWantsAGender) {
      return { score: 0, isEligible: false, sharedInterests: [], reasons: ['GENDER_PREFERENCE_MISMATCH'] };
    }

    // 5. Language compatibility (at least one shared language if both configured)
    const langsA = (ticketA.languages || []).map((l) => l.toLowerCase().trim());
    const langsB = (ticketB.languages || []).map((l) => l.toLowerCase().trim());
    if (langsA.length > 0 && langsB.length > 0) {
      const sharedLanguages = langsA.filter((lang) => langsB.includes(lang));
      if (sharedLanguages.length === 0) {
        return { score: 0, isEligible: false, sharedInterests: [], reasons: ['NO_COMMON_LANGUAGE'] };
      }
    }

    // 6. Interest overlap calculation (Jaccard Index)
    const setA = new Set(ticketA.interests.map((i) => i.trim().toLowerCase()));
    const setB = new Set(ticketB.interests.map((i) => i.trim().toLowerCase()));
    const sharedInterests = Array.from(setA).filter((interest) => setB.has(interest));

    let interestScore = 50; // Baseline compatibility for meeting all criteria
    const maxInterestCount = Math.max(setA.size, setB.size);
    if (maxInterestCount > 0) {
      const overlapPercent = (sharedInterests.length / maxInterestCount) * 50;
      interestScore += Math.round(overlapPercent);
    }

    // 7. Queue Wait Time Boost (prevent starvation)
    const now = Date.now();
    const waitTimeSec = Math.max((now - ticketA.queuedAt) / 1000, (now - ticketB.queuedAt) / 1000);
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
