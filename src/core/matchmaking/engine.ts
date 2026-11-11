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
    ticketB: MatchTicket,
    preloadedBlockLists?: ReadonlyMap<string, ReadonlySet<string>>
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

    // 2. Mutual Age eligibility (defaults to 18-99 if omitted)
    const aMin = Number.isInteger(ticketA.minAgePref) && ticketA.minAgePref >= 18 ? ticketA.minAgePref : 18;
    const aMax = Number.isInteger(ticketA.maxAgePref) && ticketA.maxAgePref <= 99 ? ticketA.maxAgePref : 99;
    const bMin = Number.isInteger(ticketB.minAgePref) && ticketB.minAgePref >= 18 ? ticketB.minAgePref : 18;
    const bMax = Number.isInteger(ticketB.maxAgePref) && ticketB.maxAgePref <= 99 ? ticketB.maxAgePref : 99;

    const aAcceptsB = ticketB.age >= aMin && ticketB.age <= aMax;
    const bAcceptsA = ticketA.age >= bMin && ticketA.age <= bMax;

    if (!aAcceptsB || !bAcceptsA) {
      return { score: 0, isEligible: false, sharedInterests: [], reasons: ['AGE_INCOMPATIBLE'] };
    }

    // 3. Language compatibility (at least one shared language if both configured)
    const langsA = (Array.isArray(ticketA.languages) ? ticketA.languages : []).filter((l) => typeof l === 'string').map((l) => l.toLowerCase().trim());
    const langsB = (Array.isArray(ticketB.languages) ? ticketB.languages : []).filter((l) => typeof l === 'string').map((l) => l.toLowerCase().trim());
    if (langsA.length > 0 && langsB.length > 0) {
      const sharedLanguages = langsA.filter((lang) => langsB.includes(lang));
      if (sharedLanguages.length === 0) {
        return { score: 0, isEligible: false, sharedInterests: [], reasons: ['NO_COMMON_LANGUAGE'] };
      }
    }

    // 4. Block checks run after cheap age/language filters. The DB caches the
    // complete bidirectional block list per user, so one query warms all
    // candidate checks for this queue scan instead of querying per pair.
    const blockedA = preloadedBlockLists?.get(ticketA.userId);
    const blockedB = preloadedBlockLists?.get(ticketB.userId);
    const isBlocked = preloadedBlockLists
      ? Boolean(blockedA?.has(ticketB.userId) || blockedB?.has(ticketA.userId))
      : await db.isBlocked(ticketA.userId, ticketB.userId);
    if (isBlocked) {
      return { score: 0, isEligible: false, sharedInterests: [], reasons: ['USER_BLOCKED'] };
    }

    // 5. Gender is profile metadata only; every eligible user can match with anyone.

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
   * Preload each queued user's bidirectional block list in bounded parallel
   * batches. This turns per-pair Supabase reads into one cached read per user.
   */
  async preloadBlockLists(tickets: MatchTicket[]): Promise<Map<string, ReadonlySet<string>>> {
    const userIds = Array.from(new Set(tickets.map((ticket) => ticket.userId)));
    const result = new Map<string, ReadonlySet<string>>();
    const batchSize = 25;
    for (let offset = 0; offset < userIds.length; offset += batchSize) {
      const batch = userIds.slice(offset, offset + batchSize);
      const entries = await Promise.all(batch.map(async (userId) =>
        [userId, await db.getBlockedUserIds(userId)] as const
      ));
      for (const [userId, blockedIds] of entries) result.set(userId, blockedIds);
    }
    return result;
  }

  /**
   * Scan an array of tickets to find the best compatible match for a given ticket
   */
  async findBestMatch(
    ticket: MatchTicket,
    candidates: MatchTicket[],
    preloadedBlockLists?: ReadonlyMap<string, ReadonlySet<string>>
  ): Promise<{ partner: MatchTicket; matchResult: MatchCandidateResult } | null> {
    const blockLists = preloadedBlockLists ?? await this.preloadBlockLists([ticket, ...candidates]);
    const eligibleResults = await Promise.all(candidates.map(async (candidate, index) => {
      if (candidate.userId === ticket.userId || candidate.discordUserId === ticket.discordUserId) return null;
      const result = await this.evaluateMatch(ticket, candidate, blockLists);
      return result.isEligible ? { candidate, result, index } : null;
    }));

    // Stable tie-break: preserve queue order when scores are equal.
    let best: { candidate: MatchTicket; result: MatchCandidateResult; index: number } | null = null;
    for (const entry of eligibleResults) {
      if (entry && (!best || entry.result.score > best.result.score)) best = entry;
    }

    return best ? { partner: best.candidate, matchResult: best.result } : null;
  }
}

export const matchmakingEngine = new MatchmakingEngine();
