export type DiscordGuildAuthorization = {
  id: string;
  owner: boolean;
  permissions: string;
};

export type DiscordRolePermission = { id: string; permissions: string };
export type DiscordPermissionOverwrite = { id: string; type: number; allow: string; deny: string };

function bits(value: string): bigint {
  try { return BigInt(value); } catch { return 0n; }
}

export function isServerManager(guild: DiscordGuildAuthorization): boolean {
  const permissions = bits(guild.permissions);
  const administrator = 1n << 3n;
  const manageGuild = 1n << 5n;
  return guild.owner || (permissions & administrator) !== 0n || (permissions & manageGuild) !== 0n;
}

function applyOverwrite(permissions: bigint, allow: string, deny: string): bigint {
  return (permissions & ~bits(deny)) | bits(allow);
}

export function computeChannelPermissions(input: {
  guildId: string;
  memberId: string;
  memberRoleIds: string[];
  roles: DiscordRolePermission[];
  overwrites: DiscordPermissionOverwrite[];
}): bigint {
  const roles = new Map(input.roles.map((role) => [role.id, role]));
  let permissions = bits(roles.get(input.guildId)?.permissions || '0');
  for (const roleId of input.memberRoleIds) permissions |= bits(roles.get(roleId)?.permissions || '0');
  if ((permissions & (1n << 3n)) !== 0n) return (1n << 53n) - 1n;

  const everyone = input.overwrites.find((entry) => entry.type === 0 && entry.id === input.guildId);
  if (everyone) permissions = applyOverwrite(permissions, everyone.allow, everyone.deny);

  const roleOverwrites = input.overwrites.filter((entry) => entry.type === 0 && input.memberRoleIds.includes(entry.id));
  if (roleOverwrites.length) {
    const deny = roleOverwrites.reduce((value, entry) => value | bits(entry.deny), 0n);
    const allow = roleOverwrites.reduce((value, entry) => value | bits(entry.allow), 0n);
    permissions = (permissions & ~deny) | allow;
  }

  const member = input.overwrites.find((entry) => entry.type === 1 && entry.id === input.memberId);
  if (member) permissions = applyOverwrite(permissions, member.allow, member.deny);
  return permissions;
}
