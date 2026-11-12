import { describe, it, expect } from 'vitest';
import { embedService, COLORS } from '../../src/bot/embeds/index.js';
import { UserProfile, RoomSession } from '../../src/core/types.js';

describe('Discord Components V2 ContainerBuilder Tests', () => {
  const mockUser: UserProfile = {
    id: 'usr_test_123',
    discordUserId: 'disc_123456789',
    destinyId: 'ABC123',
    age: 22,
    gender: 'female',
    genderVerified: true,
    genderVerificationStatus: 'verified',
    preferredGender: ['any'],
    minAgePref: 18,
    maxAgePref: 99,
    interests: ['gaming', 'music'],
    languages: ['en'],
    reputationScore: 95,
    isBanned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('should generate Main Menu container with buttons nested inside the container component tree', () => {
    const container = embedService.createMainMenuContainer('TestUser', mockUser, true);
    const json: any = container.toJSON();

    // Type 17 is Container
    expect(json.type).toBe(17);
    expect(json.accent_color).toBe(COLORS.DESTINY_PURPLE);
    expect(json.components).toBeDefined();

    // Must have TextDisplay (type 10), Separator (type 14), and ActionRow (type 1) nested INSIDE components
    const actionRows = json.components.filter((c: any) => c.type === 1);
    expect(actionRows.length).toBeGreaterThanOrEqual(1);

    const buttons = actionRows[0].components.filter((c: any) => c.type === 2);
    expect(buttons.length).toBe(4);

    const buttonIds = buttons.map((b: any) => b.custom_id);
    expect(buttonIds).toContain('destiny_btn_start');
    expect(buttonIds).toContain('destiny_btn_profile');
    expect(buttonIds).toContain('destiny_btn_verify');
    expect(buttonIds).toContain('destiny_btn_icebreaker');
  });

  it('should generate Verification Prompt container with Submit Verification button', () => {
    const container = embedService.createVerificationPromptContainer(mockUser);
    const json: any = container.toJSON();

    expect(json.type).toBe(17);
    const actionRows = json.components.filter((c: any) => c.type === 1);
    expect(actionRows.length).toBe(1);
    const ids = actionRows[0].components.map((b: any) => b.custom_id);
    expect(ids).toContain('destiny_btn_verify_voicenote_info');
    expect(ids).toContain('destiny_btn_verify_sync_role');
    expect(ids).toContain('destiny_btn_cancel_mood');
  });

  it('should generate Already Verified container with status and Start Match button', () => {
    const container = embedService.createAlreadyVerifiedContainer(mockUser);
    const json: any = container.toJSON();

    expect(json.type).toBe(17);
    const actionRows = json.components.filter((c: any) => c.type === 1);
    expect(actionRows.length).toBe(1);
    const ids = actionRows[0].components.map((b: any) => b.custom_id);
    expect(ids).toContain('destiny_btn_start');
    expect(ids).toContain('destiny_btn_cancel_mood');
  });

  it('should generate Verification Submitted container with confirmation', () => {
    const container = embedService.createVerificationSubmittedContainer();
    const json: any = container.toJSON();

    expect(json.type).toBe(17);
    const actionRows = json.components.filter((c: any) => c.type === 1);
    expect(actionRows.length).toBe(1);
    const ids = actionRows[0].components.map((b: any) => b.custom_id);
    expect(ids).toContain('destiny_btn_start');
    expect(ids).toContain('destiny_btn_cancel_mood');
  });

  it('should generate Profile Required container with Setup Profile button nested inside', () => {
    const container = embedService.createProfileRequiredContainer();
    const json: any = container.toJSON();

    expect(json.type).toBe(17);
    const actionRows = json.components.filter((c: any) => c.type === 1);
    expect(actionRows.length).toBe(1);
    expect(actionRows[0].components[0].custom_id).toBe('destiny_btn_profile');
  });

  it('should generate Searching Queue container with Cancel Search button nested inside', () => {
    const container = embedService.createSearchingContainer(mockUser);
    const json: any = container.toJSON();

    expect(json.type).toBe(17);
    const actionRows = json.components.filter((c: any) => c.type === 1);
    expect(actionRows.length).toBe(1);
    expect(actionRows[0].components[0].custom_id).toBe('destiny_btn_cancel_queue');
  });


  it('should generate Icebreaker container with a conversation prompt and follow-up action', () => {
    const container = embedService.createIcebreakerContainer('What is your favourite late-night snack?');
    const json: any = container.toJSON();

    expect(json.type).toBe(17);
    const textComponents = json.components.filter((c: any) => c.type === 10);
    expect(textComponents[0].content).toContain('favourite late-night snack');

    const actionRows = json.components.filter((c: any) => c.type === 1);
    expect(actionRows.length).toBe(1);
    const ids = actionRows[0].components.map((b: any) => b.custom_id);
    expect(ids).toContain('destiny_btn_icebreaker');
    expect(ids).toContain('destiny_btn_start');
  });

  it('should generate Match Connection container with Reveal and Leave buttons inside the container', () => {
    const mockRoom: RoomSession = {
      id: 'room_test_1',
      roomCode: 'DST-999',
      status: 'active',
      user1Id: 'usr_1',
      user2Id: 'usr_2',
      user1DiscordId: 'disc_1',
      user2DiscordId: 'disc_2',
      user1Pseudonym: 'Starlit Wanderer',
      user2Pseudonym: 'Cosmic Voyager',
      user1Avatar: '🌌',
      user2Avatar: '🌠',
      connectionXp: 10,
      connectionLevel: 'Strangers',
      revealStatusUser1: { consented: false, revealedFields: [] },
      revealStatusUser2: { consented: false, revealedFields: [] },
      startedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const container = embedService.createMatchFoundContainer(mockRoom, true, 'Favorite movie?');
    const json: any = container.toJSON();

    expect(json.type).toBe(17);
    const actionRows = json.components.filter((c: any) => c.type === 1);
    expect(actionRows.length).toBe(1);
    const ids = actionRows[0].components.map((b: any) => b.custom_id);
    expect(ids).toContain('btn_reveal_consent');
    expect(ids).toContain('destiny_btn_leave');
    expect(ids).toContain('btn_report_room_room_test_1');
  });

  it('should generate Report Menu container with category buttons nested inside', () => {
    const container = embedService.createReportMenuContainer('room_123', 'Starlight');
    const json: any = container.toJSON();

    expect(json.type).toBe(17);
    const actionRows = json.components.filter((c: any) => c.type === 1);
    expect(actionRows.length).toBe(2);

    const idsRow1 = actionRows[0].components.map((b: any) => b.custom_id);
    expect(idsRow1).toContain('act_report_room_123_harassment');
    expect(idsRow1).toContain('act_report_room_123_inappropriate_content');
    expect(idsRow1).toContain('act_report_room_123_identity_leak');

    const idsRow2 = actionRows[1].components.map((b: any) => b.custom_id);
    expect(idsRow2).toContain('act_report_room_123_spam');
    expect(idsRow2).toContain('act_report_room_123_underage');
    expect(idsRow2).toContain('act_report_cancel');
  });

  it('should generate Report Success container with confirmation', () => {
    const container = embedService.createReportSuccessContainer();
    const json: any = container.toJSON();

    expect(json.type).toBe(17);
    const actionRows = json.components.filter((c: any) => c.type === 1);
    expect(actionRows.length).toBe(1);
    const ids = actionRows[0].components.map((b: any) => b.custom_id);
    expect(ids).toContain('destiny_btn_start');
    expect(ids).toContain('destiny_btn_cancel_mood');
  });

  it('should generate a direct-to-queue searching container without gender choices', () => {
    const container = embedService.createSearchingContainer(mockUser);
    const json: any = container.toJSON();

    expect(json.type).toBe(17);
    const actionRows = json.components.filter((c: any) => c.type === 1);
    expect(actionRows.length).toBe(1);
    const ids = actionRows[0].components.map((b: any) => b.custom_id);
    expect(ids).toContain('destiny_btn_cancel_queue');
    expect(JSON.stringify(json)).not.toMatch(/match_pref_(male|female|any)|Talk with (Girls|Boys)/);
  });

  it('should generate Low Reputation Restricted container with eclairs link and check button', () => {
    const container = embedService.createLowReputationRestrictedContainer();
    const json: any = container.toJSON();

    expect(json.type).toBe(17);
    const actionRows = json.components.filter((c: any) => c.type === 1);
    expect(actionRows.length).toBe(1);

    const linkButton = actionRows[0].components.find((b: any) => b.style === 5); // Style 5 is Link
    expect(linkButton).toBeDefined();
    expect(linkButton.url).toBe('https://discord.gg/eclairs');

    const checkButton = actionRows[0].components.find((b: any) => b.custom_id === 'destiny_btn_check_reputation');
    expect(checkButton).toBeDefined();
  });

  it('should generate Reputation Restored container with Start Match button', () => {
    const container = embedService.createReputationRestoredContainer();
    const json: any = container.toJSON();

    expect(json.type).toBe(17);
    const actionRows = json.components.filter((c: any) => c.type === 1);
    expect(actionRows.length).toBe(1);
    const ids = actionRows[0].components.map((b: any) => b.custom_id);
    expect(ids).toContain('destiny_btn_start');
    expect(ids).toContain('destiny_btn_cancel_mood');
  });

  it('should generate Relay Message container with type 17', () => {
    const container = embedService.createRelayMessageContainer('Mystery Stargazer', '🌠', 'Hello from the other side!');
    const json: any = container.toJSON();

    expect(json.type).toBe(17);
    const textComponents = json.components.filter((c: any) => c.type === 10);
    expect(textComponents.length).toBeGreaterThanOrEqual(1);
    expect(textComponents[0].content).toContain('Hello from the other side!');
  });

  it('should generate Server Setup container with Channel Select Menu and buttons', () => {
    const container = embedService.createServerSetupContainer(
      { id: '12345', name: 'Test Guild' },
      { guildId: '12345', matchChannelId: null, modLogChannelId: null },
      'channel_999'
    );
    const json: any = container.toJSON();

    expect(json.type).toBe(17);
    const actionRows = json.components.filter((c: any) => c.type === 1);
    expect(actionRows.length).toBe(3);

    // Row 1 buttons: set current, lobby card, verify hub
    const row1Ids = actionRows[0].components.map((b: any) => b.custom_id);
    expect(row1Ids).toContain('destiny_btn_setup_set_current');
    expect(row1Ids).toContain('destiny_btn_setup_lobby_card');
    expect(row1Ids).toContain('destiny_btn_setup_verify_hub');

    // Row 2: Channel Select Menu (type 8)
    expect(actionRows[1].components[0].type).toBe(8);
    expect(actionRows[1].components[0].custom_id).toBe('destiny_select_admin_channel');

    // Row 3 buttons: refresh, reset
    const row3Ids = actionRows[2].components.map((b: any) => b.custom_id);
    expect(row3Ids).toContain('destiny_btn_setup_refresh');
    expect(row3Ids).toContain('destiny_btn_setup_reset');
  });

  it('should generate Server Lobby Card container with Start Match and My Profile buttons', () => {
    const container = embedService.createServerLobbyCardContainer('Eclairs Lounge');
    const json: any = container.toJSON();

    expect(json.type).toBe(17);
    const actionRows = json.components.filter((c: any) => c.type === 1);
    expect(actionRows.length).toBe(1);

    const ids = actionRows[0].components.map((b: any) => b.custom_id);
    expect(ids).toContain('destiny_btn_start');
    expect(ids).toContain('destiny_btn_setup_profile');
    expect(ids).toContain('destiny_btn_verify_prompt');
  });

  it('should generate Channel Set Success container with lobby and setup buttons', () => {
    const container = embedService.createChannelSetSuccessContainer('channel_123', 'My Guild');
    const json: any = container.toJSON();

    expect(json.type).toBe(17);
    const actionRows = json.components.filter((c: any) => c.type === 1);
    expect(actionRows.length).toBe(1);

    const ids = actionRows[0].components.map((b: any) => b.custom_id);
    expect(ids).toContain('destiny_btn_setup_lobby_card');
    expect(ids).toContain('destiny_btn_setup_verify_hub');
    expect(ids).toContain('destiny_btn_setup_refresh');
  });
});
