export interface SanitizationResult {
  sanitizedText: string;
  isClean: boolean;
  violations: string[];
}

const INVITE_REGEX = /(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li)|discord(app)?\.com\/invite)\/[a-zA-Z0-9_-]+/gi;
const USER_MENTION_REGEX = /<@!?(\d+)>/g;
const ROLE_MENTION_REGEX = /<@&(\d+)>/g;
const CHANNEL_MENTION_REGEX = /<#(\d+)>/g;
const CUSTOM_EMOJI_REGEX = /<(a?):([a-zA-Z0-9_]+):(\d+)>/g;
const DISCORD_TOKEN_REGEX = /[\w-]{24}\.[\w-]{6}\.[\w-]{27,38}/g;

const SUSPICIOUS_DOMAINS = [
  'grabify.link',
  'iplogger.org',
  '2no.co',
  'yip.su',
  'blasze.com',
  'kek.host',
  'discorcl.app',
  'dlscord.gg'
];

const DISALLOWED_FILE_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.sh', '.scr', '.vbs', '.js', '.jar', '.msi', '.pif'
];

export class ContentSanitizer {
  /**
   * Comprehensive content sanitization pipeline for incoming anonymous messages
   */
  sanitize(text: string): SanitizationResult {
    let current = text;
    const violations: string[] = [];

    // 1. Strip Discord Invites (uses fresh RegExp or replace directly to avoid stateful lastIndex bug)
    const beforeInvite = current;
    current = current.replace(/(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li)|discord(app)?\.com\/invite)\/[a-zA-Z0-9_-]+/gi, '`[Invite Link Removed]`');
    if (current !== beforeInvite) {
      violations.push('DISCORD_INVITE_BLOCKED');
    }

    // 2. Mask user mentions (<@123456789> -> @User)
    const beforeUser = current;
    current = current.replace(/<@!?(\d+)>/g, '@User');
    if (current !== beforeUser) {
      violations.push('USER_MENTION_MASKED');
    }

    // 3. Mask role mentions (<@&123456789> -> @Role)
    const beforeRole = current;
    current = current.replace(/<@&(\d+)>/g, '@Role');
    if (current !== beforeRole) {
      violations.push('ROLE_MENTION_MASKED');
    }

    // 4. Mask channel mentions (<#123456789> -> #channel)
    const beforeChannel = current;
    current = current.replace(/<#(\d+)>/g, '#channel');
    if (current !== beforeChannel) {
      violations.push('CHANNEL_MENTION_MASKED');
    }

    // 5. Mask @everyone and @here pings
    const beforePings = current;
    current = current.replace(/@(everyone|here)/gi, '@\u200b$1');
    if (current !== beforePings) {
      violations.push('MASS_PING_MASKED');
    }

    // 6. Sanitize custom emojis (<a:spark:123456> -> :spark:)
    current = current.replace(/<(a?):([a-zA-Z0-9_]+):(\d+)>/g, ':$2:');

    // 7. Scrub token leaks
    const beforeToken = current;
    current = current.replace(/[\w-]{24}\.[\w-]{6}\.[\w-]{27,38}/g, '`[Secret Token Scrubbed]`');
    if (current !== beforeToken) {
      violations.push('AUTH_TOKEN_STRIPPED');
    }

    // 8. Check for suspicious phishing/IP loggers
    for (const domain of SUSPICIOUS_DOMAINS) {
      if (current.toLowerCase().includes(domain)) {
        violations.push(`MALICIOUS_DOMAIN_${domain.toUpperCase()}`);
        const reg = new RegExp(`https?://[^\\s]*${domain}[^\\s]*`, 'gi');
        current = current.replace(reg, '`[Blocked Suspicious Link]`');
      }
    }

    return {
      sanitizedText: current.trim(),
      isClean: violations.length === 0,
      violations,
    };
  }

  /**
   * Sanitizes attachment files to prevent malicious uploads and scrub metadata
   */
  sanitizeAttachments(attachments: Array<{ url: string; name: string; size?: number; contentType?: string }>) {
    return attachments.filter((att) => {
      const lowerName = att.name.toLowerCase();
      const isDisallowed = DISALLOWED_FILE_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
      return !isDisallowed;
    }).map((att) => ({
      url: att.url,
      name: att.name.replace(/[^a-zA-Z0-9._-]/g, '_'),
      contentType: att.contentType,
      size: att.size,
    }));
  }
}

export const sanitizer = new ContentSanitizer();
