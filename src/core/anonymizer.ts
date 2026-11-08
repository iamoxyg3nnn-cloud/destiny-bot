import crypto from 'crypto';

export interface AnonymousPersona {
  pseudonym: string;
  avatarEmoji: string;
  avatarColor: string;
  destinyTag: string;
}

const ADJECTIVES = [
  'Celestial', 'Nebula', 'Cosmic', 'Astral', 'Lunar', 'Solar',
  'Mystic', 'Velvet', 'Aurora', 'Phantom', 'Ethereal', 'Midnight',
  'Starlight', 'Silent', 'Enchanted', 'Crimson', 'Radiant', 'Zenith'
];

const CREATURES = [
  { name: 'Fox', emoji: '🦊', color: '#E67E22' },
  { name: 'Phoenix', emoji: '🦅', color: '#E74C3C' },
  { name: 'Owl', emoji: '🦉', color: '#9B59B6' },
  { name: 'Wolf', emoji: '🐺', color: '#34495E' },
  { name: 'Lynx', emoji: '🐱', color: '#F39C12' },
  { name: 'Bear', emoji: '🐻', color: '#D35400' },
  { name: 'Stag', emoji: '🦌', color: '#27AE60' },
  { name: 'Dragon', emoji: '🐉', color: '#16A085' },
  { name: 'Otter', emoji: '🦦', color: '#2980B9' },
  { name: 'Raven', emoji: '🐦‍⬛', color: '#2C3E50' },
  { name: 'Panda', emoji: '🐼', color: '#BDC3C7' },
  { name: 'Koala', emoji: '🐨', color: '#7F8C8D' }
];

export class AnonymizerService {
  /**
   * Generate an anonymous persona for a user in a specific room session.
   * Uses hashing to guarantee deterministic yet unpredictable pseudonym within that room.
   */
  generatePersona(userId: string, roomId: string): AnonymousPersona {
    const hash = crypto
      .createHash('sha256')
      .update(`${userId}:${roomId}:destiny-salt-2026`)
      .digest('hex');

    const adjIndex = parseInt(hash.substring(0, 4), 16) % ADJECTIVES.length;
    const creatureIndex = parseInt(hash.substring(4, 8), 16) % CREATURES.length;
    const tagNum = parseInt(hash.substring(8, 12), 16) % 1000;

    const creature = CREATURES[creatureIndex];
    const pseudonym = `${ADJECTIVES[adjIndex]} ${creature.name}`;
    const destinyTag = `#${tagNum.toString().padStart(3, '0')}`;

    return {
      pseudonym,
      avatarEmoji: creature.emoji,
      avatarColor: creature.color,
      destinyTag,
    };
  }

  /**
   * Generates a unique Room Code e.g. "ROOM-849201"
   */
  generateRoomCode(): string {
    const randomBytes = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `ROOM-${randomBytes}`;
  }

  /**
   * Generates a 6-character code with combination of alphabets and numbers only e.g. "A7X9K2", "8M3Q9F"
   */
  generateDestinyId(): string {
    const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    while (true) {
      const bytes = crypto.randomBytes(6);
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += CHARS[bytes[i] % CHARS.length];
      }
      // Guarantee a combination of letters and numbers only
      if (/[A-Z]/.test(code) && /[0-9]/.test(code)) {
        return code;
      }
    }
  }
}

export const anonymizer = new AnonymizerService();
