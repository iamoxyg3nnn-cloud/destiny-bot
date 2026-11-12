import { describe, it, expect } from 'vitest';
import { embedService, COLORS, BRAND } from '../../src/bot/embeds/index.js';
import { UserProfile, RoomSession } from '../../src/core/types.js';

/**
 * The Destiny brand palette is intentionally closed: every colour rendered in
 * a Discord embed or Components V2 container must come from BRAND. These tests
 * lock that in so a stray hex literal cannot creep back in.
 */
const BRAND_HEX = new Set<number>([0xfe698e, 0xff4ea7, 0x55081b]);

describe('Destiny Brand Colour Palette', () => {
  const mockUser: UserProfile = {
    id: 'usr_palette',
    discordUserId: 'disc_palette',
    destinyId: 'PAL123',
    age: 24,
    gender: 'non_binary',
    genderVerified: true,
    genderVerificationStatus: 'verified',
    preferredGender: ['any'],
    minAgePref: 18,
    maxAgePref: 99,
    interests: ['music', 'coding'],
    languages: ['en'],
    reputationScore: 88,
    isBanned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockRoom: RoomSession = {
    id: 'room_palette',
    roomCode: 'PAL-000',
    status: 'active',
    user1Id: 'usr_1',
    user2Id: 'usr_2',
    user1DiscordId: 'disc_1',
    user2DiscordId: 'disc_2',
    user1Pseudonym: 'Starlit Wanderer',
    user2Pseudonym: 'Cosmic Voyager',
    user1Avatar: '🌌',
    user2Avatar: '🌠',
    revealStatusUser1: { consented: false, revealedFields: [] },
    revealStatusUser2: { consented: false, revealedFields: [] },
    startedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('should expose exactly the three approved brand colours', () => {
    expect(Object.values(BRAND).sort()).toEqual([0x55081b, 0xfe698e, 0xff4ea7].sort());
  });

  it('should map every semantic colour onto the approved brand palette', () => {
    for (const [name, value] of Object.entries(COLORS)) {
      expect(BRAND_HEX.has(value), `${name} = 0x${value.toString(16)} is off-brand`).toBe(true);
    }
  });

  it('should keep colours that are compared against each other visually distinct', () => {
    // Success/cooldown, approved/rejected and pinned/unpinned all switch
    // between two colours in a ternary, so those pairs must differ.
    expect(COLORS.SUCCESS).not.toBe(COLORS.GOLD);
    expect(COLORS.SUCCESS).not.toBe(COLORS.DANGER);
    expect(COLORS.GOLD).not.toBe(COLORS.DESTINY_PURPLE);
    expect(COLORS.GOLD).not.toBe(COLORS.DARK);
  });

  it('should only emit approved accent colours on generated containers', () => {
    const containers: any[] = [
      embedService.createMainMenuContainer('Tester', mockUser, true),
      embedService.createProfileRequiredContainer(),
      embedService.createProfileCreatedContainer(mockUser),
      embedService.createMatchFoundContainer(mockRoom, true),
      embedService.createReportMenuContainer('room_palette', 'Starlit'),
      embedService.createReportSuccessContainer(),
      embedService.createSearchingContainer(mockUser),
      embedService.createLowReputationRestrictedContainer(),
      embedService.createReputationRestoredContainer(),
      embedService.createRelayMessageContainer('Starlit', '🌌', 'Hello!'),
      embedService.createDMRedirectContainer('Tester'),
      embedService.createRevealPromptPartnerContainer('🌌', 'Starlit'),
      embedService.createRevealWaitingContainer(),
      embedService.createRevealDeclinedContainer(true),
      embedService.createRevealDeclinedContainer(false),
      embedService.createVerificationPromptContainer(mockUser),
      embedService.createAlreadyVerifiedContainer(mockUser),
      embedService.createVerificationPendingContainer(),
      embedService.createVerificationSubmittedContainer(),
    ];

    for (const container of containers) {
      const json: any = container.toJSON();
      expect(typeof json.accent_color).toBe('number');
      expect(
        BRAND_HEX.has(json.accent_color),
        `accent_color 0x${json.accent_color.toString(16)} is off-brand`
      ).toBe(true);
    }
  });

  it('should only emit approved embed colours on legacy embeds', () => {
    const embeds: any[] = [
      embedService.createMatchFoundEmbed(mockRoom, true, 'Favourite movie?'),
      embedService.createProfileEmbed(mockUser),
      embedService.createRelayMessageEmbed('Starlit', '🌌', 'Hello!'),
    ];

    for (const embed of embeds) {
      const json: any = embed.toJSON();
      expect(typeof json.color).toBe('number');
      expect(
        BRAND_HEX.has(json.color),
        `embed color 0x${json.color.toString(16)} is off-brand`
      ).toBe(true);
    }
  });
});
