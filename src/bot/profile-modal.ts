import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { Gender, UserProfile } from '../core/types.js';

/**
 * Builds the single profile setup/edit modal used by both the slash command
 * and the interactive buttons.
 */
export function buildProfileModal(user?: UserProfile | null): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId('modal_destiny_profile')
    .setTitle(user && user.age >= 18 ? 'Destiny — Edit Profile' : 'Destiny — Profile Setup');

  const ageInput = new TextInputBuilder()
    .setCustomId('profile_age')
    .setLabel('Your Age (Must be 18+)')
    .setStyle(TextInputStyle.Short)
    .setMinLength(2)
    .setMaxLength(2)
    .setPlaceholder('18')
    .setRequired(true);

  if (user && user.age >= 18) {
    ageInput.setValue(user.age.toString());
  }

  const genderInput = new TextInputBuilder()
    .setCustomId('profile_gender')
    .setLabel('Your Gender (Male / Female / Other)')
    .setStyle(TextInputStyle.Short)
    .setMinLength(3)
    .setMaxLength(25)
    .setPlaceholder('Male, Female, Non-binary, etc.')
    .setRequired(true);

  if (user && user.gender && user.gender !== 'prefer_not_to_say') {
    genderInput.setValue(user.gender.slice(0, 25));
  }

  const interestsInput = new TextInputBuilder()
    .setCustomId('profile_interests')
    .setLabel('Interests & Hobbies (Comma separated)')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(150)
    .setPlaceholder('Gaming, Anime, Music, Coding, Travel')
    .setRequired(false);

  if (user && user.interests && user.interests.length > 0) {
    interestsInput.setValue(user.interests.join(', ').slice(0, 150));
  }

  const languagesInput = new TextInputBuilder()
    .setCustomId('profile_languages')
    .setLabel('Languages Spoken')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(50)
    .setPlaceholder('English, Spanish, Hindi')
    .setRequired(false);

  if (user && user.languages && user.languages.length > 0) {
    languagesInput.setValue(user.languages.join(', ').slice(0, 50));
  }

  const bioInput = new TextInputBuilder()
    .setCustomId('profile_bio')
    .setLabel('Profile Motto / Bio (Max 80 chars)')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(80)
    .setPlaceholder('Looking for late-night gaming friends & deep talks')
    .setRequired(false);

  if (user && user.bio) {
    bioInput.setValue(user.bio.slice(0, 80));
  }

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(ageInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(genderInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(interestsInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(languagesInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(bioInput)
  );

  return modal;
}

export function normalizeGender(rawGender: string): Gender {
  const value = rawGender.trim().toLowerCase();

  if (/^(?:f|female|woman|women|girl)$/i.test(value) || value.includes('female') || value.includes('woman') || value.includes('girl')) {
    return 'female';
  }
  if (/^(?:m|male|man|men|boy|guy)$/i.test(value) || value.includes('male') || value.includes('man') || value.includes('boy')) {
    return 'male';
  }
  if (value.includes('non') || value.includes('nb') || value.includes('enby')) {
    return 'non_binary';
  }
  if (value.includes('prefer') || value === 'private' || value === 'secret') {
    return 'prefer_not_to_say';
  }
  return 'other';
}

/**
 * Human readable label for a stored gender value.
 */
export function formatGenderLabel(gender: Gender | string): string {
  switch (gender) {
    case 'male': return 'Male';
    case 'female': return 'Female';
    case 'non_binary': return 'Non-binary';
    case 'other': return 'Other';
    case 'prefer_not_to_say': return 'Prefer not to say';
    default:
      return gender
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export function parseList(value: string | null | undefined, max = 8): string[] {
  if (!value) return [];
  return value
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, max);
}
