import { describe, it, expect } from 'vitest';
import { parseEmbedScript, DEFAULT_PANEL_TEMPLATE, DEFAULT_LOG_TEMPLATE, formatDestinyHandle } from '../../src/bot/embed-script.js';
import { slashCommands, createInviteActionRow, BOT_INVITE_URL, SUPPORT_SERVER_URL } from '../../src/bot/commands/definitions.js';

describe('Website Commands & Embed Script Tests', () => {
  it('registers all slash commands matching the Destiny website', () => {
    const commandNames = slashCommands.map((c) => c.name);

    // Exact website commands
    expect(commandNames).toContain('application');
    expect(commandNames).toContain('find');
    expect(commandNames).toContain('cancel');
    expect(commandNames).toContain('user');
    expect(commandNames).toContain('search');
    expect(commandNames).toContain('partner');
    expect(commandNames).toContain('report');
    expect(commandNames).toContain('latency');
    expect(commandNames).toContain('help');
    expect(commandNames).toContain('invite');
    expect(commandNames).toContain('setup');
    expect(commandNames).toContain('owner');

    // Backward-compatibility aliases
    expect(commandNames).toContain('match');
    expect(commandNames).toContain('leave');
    expect(commandNames).toContain('reveal');

    // Test invite row links
    const inviteRow = createInviteActionRow();
    const data = inviteRow.toJSON();
    expect(data.components.length).toBe(3);
    expect(BOT_INVITE_URL).toContain('client_id=1568212916304617557');
    expect(BOT_INVITE_URL).toContain('permissions=8');
    expect(SUPPORT_SERVER_URL).toBe('https://discord.gg/eclairs');
  });

  it('correctly parses default application panel embed script', () => {
    const embed = parseEmbedScript(DEFAULT_PANEL_TEMPLATE, {
      guild: {
        name: 'The Valley',
        icon: 'https://example.com/icon.png',
      },
    });

    const json = embed.toJSON();
    expect(json.title).toBe('Welcome to Destiny');
    expect(json.author?.name).toBe('The Valley Matchmaking');
    expect(json.author?.icon_url).toBe('https://example.com/icon.png');
    expect(json.fields?.length).toBe(2);
    expect(json.fields?.[0].name).toBe('1. Apply');
    expect(json.footer?.text).toContain('Powered by destiny.adore.rest');
  });

  it('correctly parses custom directives and variables in paired-logs embed script for Pair, Reveal, and Unmatch', () => {
    // 1. Pair
    const embedPair = parseEmbedScript(DEFAULT_LOG_TEMPLATE, {
      guild: { name: 'Strawberry Cafe', icon: 'https://example.com/cafe.png' },
      destiny1: { alias: 'destiny#0417' },
      destiny2: { alias: 'destiny#1183' },
      match: { type: 'Pair' },
    });
    const jsonPair = embedPair.toJSON();
    expect(jsonPair.title).toBe('New Match Formed!');
    expect(jsonPair.description).toContain('destiny#0417');
    expect(jsonPair.description).toContain('destiny#1183');
    expect(jsonPair.fields?.[0].value).toBe('Pair');

    // 2. Reveal
    const embedReveal = parseEmbedScript(DEFAULT_LOG_TEMPLATE, {
      guild: { name: 'Strawberry Cafe' },
      destiny1: { alias: '0417' },
      destiny2: { alias: '1183' },
      match: { type: 'Reveal' },
    });
    const jsonReveal = embedReveal.toJSON();
    expect(jsonReveal.description).toContain('destiny#0417');
    expect(jsonReveal.description).toContain('destiny#1183');
    expect(jsonReveal.fields?.[0].value).toBe('Reveal');

    // 3. Unmatch
    const embedUnmatch = parseEmbedScript(DEFAULT_LOG_TEMPLATE, {
      guild: { name: 'Strawberry Cafe' },
      destiny1: { alias: 'destiny#0417' },
      destiny2: { alias: 'destiny#1183' },
      match: { type: 'Unmatch' },
    });
    const jsonUnmatch = embedUnmatch.toJSON();
    expect(jsonUnmatch.fields?.[0].value).toBe('Unmatch');
  });

  it('formats destiny handles with destiny# prefix', () => {
    expect(formatDestinyHandle('0417')).toBe('destiny#0417');
    expect(formatDestinyHandle('destiny#1183')).toBe('destiny#1183');
    expect(formatDestinyHandle(undefined)).toBe('destiny#0417');
  });

  it('contains every one of the 22 website commands and subcommands', () => {
    const registeredPaths = new Set<string>();
    for (const cmd of slashCommands) {
      const json = cmd.toJSON();
      const subcommands = (json.options as any[])?.filter((o: any) => o.type === 1) || [];
      const groups = (json.options as any[])?.filter((o: any) => o.type === 2) || [];
      if (subcommands.length === 0 && groups.length === 0) {
        registeredPaths.add('/' + json.name);
      } else {
        for (const sub of subcommands) {
          registeredPaths.add('/' + json.name + ' ' + sub.name);
        }
        for (const grp of groups) {
          for (const sub of (grp.options || [])) {
            registeredPaths.add('/' + json.name + ' ' + grp.name + ' ' + sub.name);
          }
        }
      }
    }

    const websiteCommands = [
      '/application',
      '/find match',
      '/cancel match',
      '/user info',
      '/user overview',
      '/user match',
      '/user reveal',
      '/search scope',
      '/partner profile',
      '/partner birthday',
      '/partner time',
      '/report',
      '/latency',
      '/help',
      '/setup application send',
      '/setup application embed',
      '/setup paired-logs channel',
      '/setup paired-logs embed',
      '/setup paired-logs enable',
      '/setup paired-logs disable',
      '/setup search scope',
      '/setup voice enable',
      '/setup voice disable',
      '/setup voice category',
      '/setup voice duration',
      '/setup overview',
    ];

    for (const expected of websiteCommands) {
      expect(registeredPaths.has(expected), `Expected ${expected} to be registered in the bot`).toBe(true);
    }
  });

  it('allows script option to be optional so admins can reset embed back to default', () => {
    const setupCmd = slashCommands.find((c) => c.name === 'setup');
    expect(setupCmd).toBeDefined();
    const json = setupCmd!.toJSON();

    const appGroup = (json.options as any[]).find((o: any) => o.name === 'application');
    const appEmbedSub = appGroup.options.find((o: any) => o.name === 'embed');
    const appScriptOpt = appEmbedSub.options.find((o: any) => o.name === 'script');
    expect(appScriptOpt.required).toBe(false);

    const logsGroup = (json.options as any[]).find((o: any) => o.name === 'paired-logs');
    const logsEmbedSub = logsGroup.options.find((o: any) => o.name === 'embed');
    const logsScriptOpt = logsEmbedSub.options.find((o: any) => o.name === 'script');
    expect(logsScriptOpt.required).toBe(false);
  });

  it('supports text and voice choices on /find match', () => {
    const findCmd = slashCommands.find((c) => c.name === 'find');
    expect(findCmd).toBeDefined();
    const json = findCmd!.toJSON();

    const matchSub = (json.options as any[]).find((o: any) => o.name === 'match');
    expect(matchSub).toBeDefined();

    const modeOpt = matchSub.options.find((o: any) => o.name === 'mode');
    expect(modeOpt).toBeDefined();
    expect(modeOpt.required).toBe(false);
    expect(modeOpt.choices.map((c: any) => c.value)).toContain('text');
    expect(modeOpt.choices.map((c: any) => c.value)).toContain('voice');
  });
});
