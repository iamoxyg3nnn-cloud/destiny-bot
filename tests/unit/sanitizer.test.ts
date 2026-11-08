import { describe, it, expect } from 'vitest';
import { sanitizer } from '../../src/core/sanitizer.js';

describe('ContentSanitizer Unit Tests', () => {
  it('should strip discord invite links', () => {
    const input = 'Hey join our server https://discord.gg/abcXYZ123 it is awesome';
    const result = sanitizer.sanitize(input);
    expect(result.sanitizedText).toContain('`[Invite Link Removed]`');
    expect(result.sanitizedText).not.toContain('discord.gg/abcXYZ123');
    expect(result.isClean).toBe(false);
    expect(result.violations).toContain('DISCORD_INVITE_BLOCKED');
  });

  it('should mask user and role mentions to prevent identity disclosure', () => {
    const input = 'Hello <@123456789012345678> and <@&987654321098765432>';
    const result = sanitizer.sanitize(input);
    expect(result.sanitizedText).toBe('Hello @User and @Role');
    expect(result.isClean).toBe(false);
    expect(result.violations).toContain('USER_MENTION_MASKED');
    expect(result.violations).toContain('ROLE_MENTION_MASKED');
  });

  it('should mask channel mentions', () => {
    const input = 'Check out <#112233445566778899>';
    const result = sanitizer.sanitize(input);
    expect(result.sanitizedText).toBe('Check out #channel');
  });

  it('should scrub exposed Discord authentication tokens', () => {
    // Construct fake test token dynamically to prevent GitHub Push Protection false-positive matches
    const fakeToken = ['mock_test_token_part1_12345', 'mock02', 'mock_part3_123456789012345678901234'].join('.');
    const input = `Here is my bot token: ${fakeToken}`;
    const result = sanitizer.sanitize(input);
    expect(result.sanitizedText).toContain('`[Secret Token Scrubbed]`');
    expect(result.sanitizedText).not.toContain(fakeToken);
  });

  it('should filter out dangerous executable attachments', () => {
    const rawAttachments = [
      { name: 'trojan.exe', url: 'https://cdn.discordapp.com/attachments/1/2/trojan.exe' },
      { name: 'photo.jpg', url: 'https://cdn.discordapp.com/attachments/1/2/photo.jpg' },
      { name: 'script.bat', url: 'https://cdn.discordapp.com/attachments/1/2/script.bat' },
    ];
    const cleaned = sanitizer.sanitizeAttachments(rawAttachments);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].name).toBe('photo.jpg');
  });
});
