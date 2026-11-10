export interface SanitizationResult {
  sanitizedText: string;
  isClean: boolean;
  violations: string[];
}

const SUSPICIOUS_DOMAINS = [
  'grabify.link',
  'iplogger.org',
  '2no.co',
  'yip.su',
  'blasze.com',
  'kek.host',
  'discorcl.app',
  'dlscord.gg',
];

const DISCORD_TOKEN_REGEX = /(?:mfa\.[\w-]{80,100}|[\w-]{24}\.[\w-]{6}\.[\w-]{27,38})/g;
const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif',
  '.mp4', '.webm', '.mov',
  '.mp3', '.wav', '.ogg', '.m4a',
  '.pdf',
]);
const ALLOWED_MIME_TYPES = new RegExp(
  '^(image/(png|jpeg|gif|webp|avif)|video/(mp4|webm|quicktime)|audio/(mpeg|wav|ogg|mp4|x-m4a)|application/pdf)$',
  'i'
);
const TRUSTED_ATTACHMENT_HOSTS = new Set([
  'cdn.discordapp.com',
  'media.discordapp.net',
  'cdn.discordapp.net',
]);
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export class ContentSanitizer {
  sanitize(text: string): SanitizationResult {
    let current = typeof text === 'string' ? text : '';
    const violations: string[] = [];

    const beforeInvite = current;
    current = current.replace(
      /(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li)|discord(app)?\.com\/invite)\/[a-zA-Z0-9_-]+/gi,
      '\x60[Invite Link Removed]\x60'
    );
    if (current !== beforeInvite) violations.push('DISCORD_INVITE_BLOCKED');

    const beforeUser = current;
    current = current.replace(/<@!?\d+>/g, '@User');
    if (current !== beforeUser) violations.push('USER_MENTION_MASKED');

    const beforeRole = current;
    current = current.replace(/<@&\d+>/g, '@Role');
    if (current !== beforeRole) violations.push('ROLE_MENTION_MASKED');

    const beforeChannel = current;
    current = current.replace(/<#\d+>/g, '#channel');
    if (current !== beforeChannel) violations.push('CHANNEL_MENTION_MASKED');

    const beforePings = current;
    current = current.replace(/@[\u200B-\u200D\uFEFF]*(everyone|here)/gi, '@\u200b $1');
    if (current !== beforePings) violations.push('MASS_PING_MASKED');

    current = current.replace(/<(a?):([a-zA-Z0-9_]+):(\d+)>/g, ':$2:');

    const beforeToken = current;
    current = current.replace(new RegExp(DISCORD_TOKEN_REGEX.source, 'g'), '\x60[Secret Token Scrubbed]\x60');
    if (current !== beforeToken) violations.push('AUTH_TOKEN_STRIPPED');

    for (const domain of SUSPICIOUS_DOMAINS) {
      const escapedDomain = domain.split('.').join('\\.');
      const expression = new RegExp(
        '(^|[^a-z0-9.-])((?:https?://)?(?:www\\.)?' + escapedDomain + '(?:[/?#]\\S*)?)(?![a-z0-9.-])',
        'gi'
      );
      const before = current;
      current = current.replace(expression, '$1[Blocked Suspicious Link]');
      if (current !== before) violations.push('MALICIOUS_DOMAIN_' + domain.toUpperCase());
    }

    return {
      sanitizedText: current.trim(),
      isClean: violations.length === 0,
      violations,
    };
  }

  sanitizeAttachments(
    attachments: Array<{ url: string; name: string; size?: number; contentType?: string }>
  ): Array<{ url: string; name: string; contentType?: string; size?: number }> {
    return attachments.filter((attachment) => {
      if (!attachment || typeof attachment.url !== 'string') return false;
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(attachment.url);
      } catch {
        return false;
      }

      if (
        parsedUrl.protocol !== 'https:' ||
        parsedUrl.username.length > 0 ||
        parsedUrl.password.length > 0 ||
        (parsedUrl.port !== '' && parsedUrl.port !== '443') ||
        !TRUSTED_ATTACHMENT_HOSTS.has(parsedUrl.hostname.toLowerCase())
      ) return false;

      if (
        typeof attachment.name !== 'string' ||
        attachment.name.length === 0 ||
        attachment.name.length > 255
      ) return false;

      if (
        !Number.isFinite(attachment.size) ||
        attachment.size! < 0 ||
        attachment.size! > MAX_ATTACHMENT_BYTES
      ) return false;

      const lowerName = attachment.name.toLowerCase();
      const extension = lowerName.includes('.') ? lowerName.slice(lowerName.lastIndexOf('.')) : '';
      if (!ALLOWED_ATTACHMENT_EXTENSIONS.has(extension)) return false;

      if (
        attachment.contentType &&
        !ALLOWED_MIME_TYPES.test(attachment.contentType.split(';')[0].trim())
      ) return false;

      return true;
    }).map((attachment) => ({
      url: attachment.url,
      name: attachment.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100),
      contentType: attachment.contentType,
      size: attachment.size,
    }));
  }
}

export const sanitizer = new ContentSanitizer();
