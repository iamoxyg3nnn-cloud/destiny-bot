import { describe, expect, it } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import { isGuildAdmin } from '../../src/bot/interactions/handler.js';

function fakeGuildInteraction(permissions: bigint[], ownerId = '999999999999999999') {
  return {
    user: { id: '123456789012345678' },
    guild: { ownerId },
    memberPermissions: {
      has: (permission: bigint) => permissions.includes(permission),
    },
  } as any;
}

describe('guild-scoped setup authorization', () => {
  it('allows a member with Manage Server to configure their own guild', () => {
    expect(isGuildAdmin(fakeGuildInteraction([PermissionFlagsBits.ManageGuild]))).toBe(true);
  });

  it('allows a member with Administrator to configure their own guild', () => {
    expect(isGuildAdmin(fakeGuildInteraction([PermissionFlagsBits.Administrator]))).toBe(true);
  });

  it('allows the guild owner even when permission bits are absent', () => {
    expect(isGuildAdmin(fakeGuildInteraction([], '123456789012345678'))).toBe(true);
  });

  it('does not treat unrelated permissions as server administration', () => {
    expect(isGuildAdmin(fakeGuildInteraction([PermissionFlagsBits.ModerateMembers]))).toBe(false);
  });
});
