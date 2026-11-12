/**
 * Returns whether a persisted ban is currently in force.
 * Missing or malformed expiry values fail closed as permanent bans.
 */
export function isBanActive(
  isBanned: boolean,
  banExpiresAt?: string | null,
  now = Date.now()
): boolean {
  if (!isBanned) return false;
  if (!banExpiresAt) return true;
  const expiresAt = Date.parse(banExpiresAt);
  return !Number.isFinite(expiresAt) || expiresAt > now;
}
