# Destiny Administration Model

Destiny has separate control planes. Do not use a Discord server administrator role as a substitute for bot-owner authority.

## 1. Platform / bot owner

The platform owner is configured out-of-band in the bot runtime environment:

```env
BOT_OWNER_IDS=123456789012345678,234567890123456789
```

Use Discord user IDs (17–20 digits), comma-separated. These identities can run `/owner status` for global service diagnostics and perform platform-owner verification overrides. An empty list disables all platform-owner command and verification overrides. Never put this list in a public dashboard form or allow a guild administrator to modify it.

The web dashboard can use individual Discord OAuth sessions (`DASHBOARD_OWNER_OAUTH_ENABLED=true`). Each login is checked against `BOT_OWNER_IDS` and the Discord user ID is written to the audit log. OAuth requires `NEXTAUTH_URL` to be the stable public HTTPS dashboard origin and the exact callback URL `/api/auth/callback/discord` to be registered in the Discord Developer Portal. Rotating quick-tunnel URLs cannot be used for OAuth. If OAuth is disabled, the dashboard falls back to the shared `DASHBOARD_ADMIN_PASSWORD`; that fallback is owner-only by operational policy but audit entries use the generic `dashboard_owner` actor. It is distinct from Discord server administration.

## 2. Discord server setup

A Discord server owner or member with the native Discord `Administrator` permission can configure only the guild in which the command is run. `Manage Server` alone is not sufficient for setup.

- `/setup portal channel:#channel` sets the matchmaking portal.
- `/setup modlog channel:#channel` sets the moderation-alert channel independently.
- `/setup cross_server enabled:true|false` sets that guild's cross-server matchmaking policy.
- `/setup view` displays that guild's stored configuration.

The portal and moderation channels are separate settings. The portal can be configured from the setup panel or `/setup portal`; moderation logs require `/setup modlog` and a channel hidden from `@everyone`. The bot persists them to `guild_settings` and records the acting Discord user ID in `admin_audit_logs`.

## 3. Cross-server matchmaking

A guild opting out of cross-server discovery can still match members from its own guild, but its queue tickets cannot be paired with tickets from another guild. Cross-server pairing is allowed only when both participating guilds have not opted out. A missing guild setting retains the existing default-allow behavior.

## 4. Operational notes

- Keep `API_SECRET_KEY`, `DASHBOARD_ADMIN_PASSWORD`, `DASHBOARD_SESSION_SECRET`, and `DISCORD_CLIENT_SECRET` in deployment secrets, never in source control.
- For individually attributable dashboard owners, set `DASHBOARD_OWNER_OAUTH_ENABLED=true`, configure a stable HTTPS `NEXTAUTH_URL`, and register `${NEXTAUTH_URL}/api/auth/callback/discord` in Discord Developer Portal. Do not use a rotating quick tunnel in OAuth mode.
- Set `BOT_OWNER_IDS` in the environment for every bot/shard process.
- Re-deploy slash commands after changing command definitions so Discord publishes `/owner`.
- Do not grant the dashboard credential to guild administrators. They should use Discord's `/setup` command.
