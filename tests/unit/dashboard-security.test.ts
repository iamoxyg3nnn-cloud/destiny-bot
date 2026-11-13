import { describe, expect, it } from 'vitest';
import { computeChannelPermissions, isServerManager } from '../../src/dashboard/security.js';

describe('dashboard Discord authorization', () => {
  it('allows only guild owners, administrators, and Manage Server members', () => {
    expect(isServerManager({ id: '1', owner: true, permissions: '0' })).toBe(true);
    expect(isServerManager({ id: '1', owner: false, permissions: String(1n << 3n) })).toBe(true);
    expect(isServerManager({ id: '1', owner: false, permissions: String(1n << 5n) })).toBe(true);
    expect(isServerManager({ id: '1', owner: false, permissions: String(1n << 4n) })).toBe(false);
  });

  it('applies @everyone, combined role, then member channel overwrites', () => {
    const view = 1n << 10n;
    const send = 1n << 11n;
    const result = computeChannelPermissions({
      guildId: '10',
      memberId: '99',
      memberRoleIds: ['20', '21'],
      roles: [
        { id: '10', permissions: String(view | send) },
        { id: '20', permissions: '0' },
        { id: '21', permissions: '0' },
      ],
      overwrites: [
        { id: '10', type: 0, allow: '0', deny: String(view) },
        { id: '20', type: 0, allow: String(view), deny: String(send) },
        { id: '21', type: 0, allow: '0', deny: String(send) },
        { id: '99', type: 1, allow: String(send), deny: '0' },
      ],
    });
    expect((result & view) !== 0n).toBe(true);
    expect((result & send) !== 0n).toBe(true);
  });

  it('lets Administrator bypass channel overwrites', () => {
    const view = 1n << 10n;
    const result = computeChannelPermissions({
      guildId: '10',
      memberId: '99',
      memberRoleIds: [],
      roles: [{ id: '10', permissions: String(1n << 3n) }],
      overwrites: [{ id: '10', type: 0, allow: '0', deny: String(view) }],
    });
    expect((result & view) !== 0n).toBe(true);
  });
});
