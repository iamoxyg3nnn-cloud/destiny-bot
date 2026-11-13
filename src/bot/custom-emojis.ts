import type { Client, ComponentEmojiResolvable } from 'discord.js';

export type DestinyEmojiName = 'destiny_match' | 'destiny_profile' | 'destiny_shield' | 'destiny_spark';

type CustomEmoji = {
  id: string;
  name: string;
  animated: boolean;
};

let emojiLookup: ((name: DestinyEmojiName) => CustomEmoji | undefined) | null = null;

/** Use server custom emoji when available; keep readable Unicode fallbacks elsewhere. */
export function configureDestinyEmojis(client: Client): void {
  emojiLookup = (name) => {
    const emoji = client.emojis.cache.find((candidate) => candidate.name === name);
    return emoji?.name
      ? { id: emoji.id, name: emoji.name, animated: emoji.animated }
      : undefined;
  };
}

function destinyEmojiFor(token: string): DestinyEmojiName {
  const first = Array.from(token)[0] ?? token;

  if (/^[👤👥🧑👶🧒👦👧👨👩🧔🧓🧕👮👷💂🕵👳👱👸🤴👰🤵👼🎅🤶🦸🦹🧙🧚🧛🧜🧝🧞🧟🧌🦊🦅🦉🐺🐱🐻🦌🐉🦦🐦🐼🐨🎭⚧🆔🎂]$/u.test(first)) {
    return 'destiny_profile';
  }

  if (/^[🛡🔒🔓✅❌⛔⚠🚨🚫🔞🚷🛑]$/u.test(first)) {
    return 'destiny_shield';
  }

  if (/^[💬🗨🗯💭📩📨📧💌📜🎙🎧🎤🎼🎵🎶🎉🎊🥳💞💕💓💖💝💘💗💑💏💍💋]$/u.test(first) || first === '🚪') {
    return 'destiny_match';
  }

  return 'destiny_spark';
}

function customMarkup(token: string): string | undefined {
  const emoji = emojiLookup?.(destinyEmojiFor(token));
  if (!emoji) return undefined;
  return `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`;
}

const EMOJI_SEQUENCE = /(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\p{Emoji_Modifier})?)*)/gu;

/** Convert source-authored emoji markers in bot UI copy to the Destiny set. */
export function formatCustomEmojiText(text: string): string {
  return text.replace(EMOJI_SEQUENCE, (token) => customMarkup(token) ?? token);
}

/** Resolve a Unicode marker for buttons and reactions, where Markdown is invalid. */
export function resolveBotEmoji(fallback: string): ComponentEmojiResolvable {
  const emoji = emojiLookup?.(destinyEmojiFor(fallback));
  return emoji ? { id: emoji.id, name: emoji.name, animated: emoji.animated } : fallback;
}

export function resolveBotReactionEmoji(fallback: string): string {
  const emoji = emojiLookup?.(destinyEmojiFor(fallback));
  return emoji ? `${emoji.name}:${emoji.id}` : fallback;
}
