import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../../src/database/supabase.js';

const userA = 'block-cache-user-a';
const userB = 'block-cache-user-b';

afterEach(() => {
  db.mockBlocks = db.mockBlocks.filter((block) =>
    block.blockerId !== userA && block.blockedId !== userA &&
    block.blockerId !== userB && block.blockedId !== userB
  );
});

describe('symmetric block-list cache', () => {
  it('invalidates cached negative results when a block is added', async () => {
    expect(await db.isBlocked(userA, userB)).toBe(false);
    expect(await db.addBlock(userA, userB, 'test')).toBe(true);
    expect(await db.isBlocked(userA, userB)).toBe(true);
    expect(await db.isBlocked(userB, userA)).toBe(true);
  });
});
