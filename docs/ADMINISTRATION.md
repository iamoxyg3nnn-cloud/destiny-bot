# Destiny Administration Model

Destiny has separate control planes. Do not use a Discord server administrator role as a substitute for bot-owner authority.

## 1. Platform / bot owner

The platform owner is configured out-of-band in the bot runtime environment:

```env
BOT_OWNER_IDS=123456789012345678,234567890123456789
```

Use Discord user IDs (17–20 digits), comma-separated. These identities can run `/owner status` for global service diagnostics and perform platform-owner verification overrides. An empty list disables all platform-owner command and verification overrides. Never allow a guild administrator to modify this allowlist.

## 2. Discord server setup

A Discord server owner or member with `Manage Server` or `Administrator` can configure only the guild in which the command is run. This permission never grants platform-owner or global moderation access.

- `/setup portal channel:#channel` sets this guild's matchmaking portal.
- `/setup cross_server enabled:true|false` sets this guild's cross-server matchmaking policy.
- `/setup view` displays this guild's stored configuration.
- `/setup modlog channel:#channel` is available only inside a trusted staff guild listed in `ECLAIRS_GUILD_IDS`. It configures the global private moderation-alert destination because reports are submitted in DMs and rooms do not currently carry a source-guild identity.

The portal and moderation channels are separate settings. The portal can be configured from the setup panel or `/setup portal`; moderation logs require `/setup modlog` and a channel hidden from `@everyone`. The bot persists them to `guild_settings` and records the acting Discord user ID in `admin_audit_logs`.

## 3. Cross-server matchmaking

A guild opting out of cross-server discovery can still match members from its own guild, but its queue tickets cannot be paired with tickets from another guild. Cross-server pairing is allowed only when both participating guilds have not opted out. A missing guild setting retains the existing default-allow behavior. The originating guild is retained for 30 days so DM re-match buttons continue to respect the same policy. A user who starts entirely from DMs has no source guild and enters the unscoped DM pool; unscoped tickets are never paired with guild-scoped tickets. To apply a server's opt-out, start matchmaking from that server or its portal.

## 4. Moderation boundaries

- Platform owners in `BOT_OWNER_IDS` can use `/owner status` and perform the platform-owner verification override.
- Trusted Eclairs moderation staff can review verification only when they have Discord `Moderate Members` or `Administrator` permission in a configured trusted staff guild. `Manage Server` alone does not grant this global moderation capability.
- Report actions support a real 24-hour temporary ban or a permanent ban. Temporary bans expire automatically when user profiles are read; a new temporary ban extends an existing active temporary ban and never shortens a permanent ban.
- Verification evidence is cleared after an approval or rejection to reduce sensitive-data retention.

## 5. Operational notes

- Set `BOT_OWNER_IDS` in the environment for every bot/shard process.
- The GitHub deployment runner tracks applied SQL in the private `destiny_internal.schema_migrations` table and skips completed migrations. The existing database was baselined after checking its live schema; do not run `supabase db push` against it until the separate Supabase CLI migration history has been reconciled.
- Re-deploy slash commands after changing command definitions so Discord publishes `/owner`.
