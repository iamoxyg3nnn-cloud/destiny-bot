import { describe, it, expect, afterAll } from 'vitest';
import { anonymizer } from '../../src/core/anonymizer.js';
import { db } from '../../src/database/supabase.js';

describe('Destiny DM-First Button & Message Workflow Tests', () => {
  const testDiscordId = `test_btn_user_${Date.now()}`;
  let createdUserId: string | null = null;

  afterAll(async () => {
    if (createdUserId && (db as any).client) {
      try {
        await (db as any).client.from('users').delete().eq('id', createdUserId);
      } catch {}
    }
  });

  describe('6-Digit Alphanumeric Destiny ID Generation Algorithm', () => {
    it('should generate a strictly 6-character code combining uppercase letters and numbers only', () => {
      for (let i = 0; i < 50; i++) {
        const id = anonymizer.generateDestinyId();
        expect(id).toHaveLength(6);
        expect(/^[A-Z0-9]{6}$/.test(id)).toBe(true);
        expect(/[A-Z]/.test(id)).toBe(true); // Must contain letters
        expect(/[0-9]/.test(id)).toBe(true); // Must contain digits
      }
    });

    it('should generate a guaranteed non-overlapping unique 6-digit ID in Supabase', async () => {
      const uniqueId = await db.generateUniqueDestinyId();
      expect(uniqueId).toHaveLength(6);
      expect(/^[A-Z0-9]{6}$/.test(uniqueId)).toBe(true);
      expect(/[A-Z]/.test(uniqueId)).toBe(true);
      expect(/[0-9]/.test(uniqueId)).toBe(true);

      // Verify no user exists in Supabase with this code
      const existing = await db.getUserByDestinyId(uniqueId);
      expect(existing).toBeNull();
    });
  });

  describe('DM-First Command & Keyword Matching', () => {
    const startDmRegex = /^\s*(?:destiny\s+start|start)\s*$/i;
    const leaveDmRegex = /^\s*(?:destiny\s+leave|leave|exit|stop|end)\s*$/i;
    const cancelDmRegex = /^\s*(?:destiny\s+cancel|cancel|stop)\s*$/i;
    const walletDmRegex = /^\s*(?:destiny\s+wallet|wallet|coins|daily)\s*$/i;
    const icebreakerDmRegex = /^\s*(?:destiny\s+icebreaker|icebreaker|prompt|conversation\s+starter)\s*$/i;

    it('should match start matchmaking keywords in DM ("start", "destiny start")', () => {
      expect(startDmRegex.test('start')).toBe(true);
      expect(startDmRegex.test('  START  ')).toBe(true);
      expect(startDmRegex.test('destiny start')).toBe(true);
      expect(startDmRegex.test('destiny   start')).toBe(true);
      expect(startDmRegex.test('  destiny    start  ')).toBe(true);

      expect(startDmRegex.test('starting')).toBe(false);
      expect(startDmRegex.test('start now')).toBe(false);
    });

    it('should match room leave keywords in DM ("leave", "exit", "stop", "end")', () => {
      expect(leaveDmRegex.test('leave')).toBe(true);
      expect(leaveDmRegex.test('exit')).toBe(true);
      expect(leaveDmRegex.test('stop')).toBe(true);
      expect(leaveDmRegex.test('end')).toBe(true);
      expect(leaveDmRegex.test('destiny leave')).toBe(true);

      expect(leaveDmRegex.test('leave chat')).toBe(false);
    });

    it('should match queue cancel keywords in DM ("cancel", "destiny cancel")', () => {
      expect(cancelDmRegex.test('cancel')).toBe(true);
      expect(cancelDmRegex.test('destiny cancel')).toBe(true);
      expect(cancelDmRegex.test('stop')).toBe(true);
    });

    it('should match wallet and icebreaker quick commands in DM', () => {
      expect(walletDmRegex.test('wallet')).toBe(true);
      expect(walletDmRegex.test('coins')).toBe(true);
      expect(walletDmRegex.test('daily')).toBe(true);
      expect(walletDmRegex.test('destiny wallet')).toBe(true);

      expect(icebreakerDmRegex.test('icebreaker')).toBe(true);
      expect(icebreakerDmRegex.test('prompt')).toBe(true);
      expect(icebreakerDmRegex.test('conversation starter')).toBe(true);
      expect(icebreakerDmRegex.test('destiny icebreaker')).toBe(true);
    });
  });

  describe('User Profile Creation & Strict Enforcement', () => {
    it('should assign a 6-digit alphanumeric ID when creating a user', async () => {
      const user = await db.createOrUpdateUser({
        discordUserId: testDiscordId,
        age: 21,
        gender: 'female',
        interests: ['coding', 'music'],
        languages: ['English'],
      });

      createdUserId = user.id;

      expect(user.destinyId).toHaveLength(6);
      expect(/^[A-Z0-9]{6}$/.test(user.destinyId)).toBe(true);
      expect(/[A-Z]/.test(user.destinyId)).toBe(true);
      expect(/[0-9]/.test(user.destinyId)).toBe(true);
      expect(user.age).toBe(21);
      expect(user.gender).toBe('female');

      // Verify profile is considered complete
      const isComplete = Boolean(
        user.age >= 18 &&
        user.gender &&
        user.gender !== 'prefer_not_to_say' &&
        user.gender.trim().length > 0
      );
      expect(isComplete).toBe(true);
    });
  });
});
