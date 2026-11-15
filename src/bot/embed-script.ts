import { EmbedBuilder, ColorResolvable } from 'discord.js';

export interface EmbedScriptContext {
  guild?: {
    name?: string;
    id?: string;
    count?: number;
    icon?: string | null;
    boost_count?: number;
    created_at?: string;
  };
  user?: {
    name?: string;
    mention?: string;
    id?: string;
    avatar?: string | null;
    nick?: string;
    joined_at?: string;
    join_position?: string;
  };
  destiny1?: {
    alias?: string;
    mention?: string;
    name?: string;
    id?: string;
  };
  destiny2?: {
    alias?: string;
    mention?: string;
    name?: string;
    id?: string;
  };
  match?: {
    type?: string;
  };
}

export const DEFAULT_PANEL_TEMPLATE =
  '{embed}$v{color: #e8a0bf}$v{author: {guild.name} Matchmaking && {guild.icon}}$v{title: Welcome to Destiny}$v{description: Click the button below to start your anonymous application.\n\n-# You will receive a private destiny# handle. Your real username stays hidden until both sides agree to reveal.}$v{field: 1. Apply && Answer profile questions && true}$v{field: 2. Match && Run /find match && true}$v{footer: Powered by destiny.adore.rest}';

export const DEFAULT_LOG_TEMPLATE =
  '{embed}$v{color: #e8a0bf}$v{title: New Match Formed!}$v{description: **{destiny1.alias}** has been matched with **{destiny2.alias}**!}$v{field: Event && {match.type} && true}$v{field: Server && {guild.name} && true}$v{footer: Destiny Match Logging && {guild.icon}}';

export function formatDestinyHandle(id?: string): string {
  if (!id) return 'destiny#0417';
  const clean = id.trim();
  if (clean.toLowerCase().startsWith('destiny#')) return clean;
  return `destiny#${clean}`;
}

/**
 * Replace placeholders like {guild.name}, {user.mention}, etc.
 */
function interpolateVariables(input: string, context: EmbedScriptContext): string {
  const g = context.guild || {};
  const u = context.user || {};
  const d1 = context.destiny1 || {};
  const d2 = context.destiny2 || {};
  const m = context.match || {};

  const replacements: Record<string, string> = {
    '{guild.name}': g.name || 'Destiny Server',
    '{guild.id}': g.id || '',
    '{guild.count}': g.count !== undefined ? String(g.count) : '0',
    '{guild.icon}': g.icon || 'https://destiny.adore.rest/brand/destiny-mark-256.png',
    '{guild.boost_count}': g.boost_count !== undefined ? String(g.boost_count) : '0',
    '{guild.created_at}': g.created_at || '',

    '{user.name}': u.name || 'User',
    '{user.mention}': u.mention || (u.id ? `<@${u.id}>` : '@User'),
    '{user.id}': u.id || '',
    '{user.avatar}': u.avatar || '',
    '{user.nick}': u.nick || u.name || 'User',
    '{user.joined_at}': u.joined_at || '',
    '{user.join_position}': u.join_position || '1st',

    '{destiny1.alias}': d1.alias ? formatDestinyHandle(d1.alias) : 'destiny#0417',
    '{destiny1.mention}': d1.mention || (d1.id ? `<@${d1.id}>` : '@Partner1'),
    '{destiny1.name}': d1.name || 'Destiny Member',
    '{destiny1.id}': d1.id || '',

    '{destiny2.alias}': d2.alias ? formatDestinyHandle(d2.alias) : 'destiny#1183',
    '{destiny2.mention}': d2.mention || (d2.id ? `<@${d2.id}>` : '@Partner2'),
    '{destiny2.name}': d2.name || 'Destiny Member',
    '{destiny2.id}': d2.id || '',

    '{match.type}': m.type || 'Pair',
  };

  let result = input;
  for (const [key, val] of Object.entries(replacements)) {
    result = result.split(key).join(val);
  }
  return result;
}

/**
 * Parses embed script directives:
 * $v{color: #hex}
 * $v{title: text}
 * $v{description: text}
 * $v{author: name && icon && url}
 * $v{field: name && value && inline}
 * $v{footer: text && icon}
 * $v{thumbnail: url}
 * $v{image: url}
 */
export function parseEmbedScript(script: string, context: EmbedScriptContext = {}): EmbedBuilder {
  const embed = new EmbedBuilder();
  let text = interpolateVariables(script || '', context);

  // Normalize literal escaped newlines
  text = text.replace(/\\n/g, '\n');

  // Strip leading {embed} if present
  if (text.startsWith('{embed}')) {
    text = text.substring(7);
  }

  // Regex to extract all $v{directive: args}
  const directiveRegex = /\$v\{([a-zA-Z0-9_]+):\s*([^}]+)\}/g;
  let match: RegExpExecArray | null;
  const foundDirectives: Array<{ key: string; value: string }> = [];

  while ((match = directiveRegex.exec(text)) !== null) {
    foundDirectives.push({
      key: match[1].toLowerCase().trim(),
      value: match[2].trim(),
    });
  }

  // Remove directives from body text
  const cleanBody = text.replace(directiveRegex, '').trim();

  // If no $v directives were found at all, treat cleanBody as description
  if (foundDirectives.length === 0 && cleanBody.length > 0) {
    embed.setDescription(cleanBody);
    return embed;
  }

  let descriptionSet = false;

  for (const { key, value } of foundDirectives) {
    switch (key) {
      case 'color': {
        const hex = value.startsWith('#') ? value : `#${value}`;
        embed.setColor(hex as ColorResolvable);
        break;
      }
      case 'title': {
        embed.setTitle(value.slice(0, 256));
        break;
      }
      case 'description': {
        embed.setDescription(value.slice(0, 4096));
        descriptionSet = true;
        break;
      }
      case 'author': {
        const parts = value.split('&&').map((p) => p.trim());
        embed.setAuthor({
          name: parts[0]?.slice(0, 256) || 'Destiny',
          iconURL: parts[1] && /^https?:\/\//i.test(parts[1]) ? parts[1] : undefined,
          url: parts[2] && /^https?:\/\//i.test(parts[2]) ? parts[2] : undefined,
        });
        break;
      }
      case 'footer': {
        const parts = value.split('&&').map((p) => p.trim());
        embed.setFooter({
          text: parts[0]?.slice(0, 2048) || '',
          iconURL: parts[1] && /^https?:\/\//i.test(parts[1]) ? parts[1] : undefined,
        });
        break;
      }
      case 'thumbnail': {
        if (/^https?:\/\//i.test(value)) {
          embed.setThumbnail(value);
        }
        break;
      }
      case 'image': {
        if (/^https?:\/\//i.test(value)) {
          embed.setImage(value);
        }
        break;
      }
      case 'field': {
        const parts = value.split('&&').map((p) => p.trim());
        const name = parts[0]?.slice(0, 256) || 'Field';
        const val = parts[1]?.slice(0, 1024) || '—';
        const inline = parts[2] ? parts[2].toLowerCase() === 'true' : false;
        embed.addFields({ name, value: val, inline });
        break;
      }
    }
  }

  // If description wasn't explicitly set with $v{description: ...} and there's remaining clean text
  if (!descriptionSet && cleanBody.length > 0) {
    embed.setDescription(cleanBody.slice(0, 4096));
  }

  return embed;
}
