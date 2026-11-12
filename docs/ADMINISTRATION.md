# Destiny Administration Model

Destiny has separate control planes. Do not use a Discord server administrator role as a substitute for bot-owner authority.

## 1. Platform / bot owner

The platform owner is configured out-of-band in the bot runtime environment:

```env
BOT_OWNER_IDS=123456789012345678,234567890123456789
```

Use Discord user IDs (17–20 digits), comma-separated. These identities can run `/owner status` for global service diagnostics. An empty list disables all `/owner` access. Never put this list in a public dashboard form or allow a guild administrator to modify it.

The web dashboard password (`DASHBOARD_ADMIN_PASSWORD`) is a platform-owner credential. It is distinct from Discord server administration.

## 2. Discord server setup

A Discord member with the native Discord `Administrator` permission can configure only the guild in which the command is run:

- `/setup portal channel:#channel` sets the matchmaking portal.
- `/setup modlog channel:#channel` sets the moderation-alert channel independently.
- `/setup cross_server enabled:true|false` sets that guild's cross-server matchmaking policy.
- `/setup view` displays that guild's stored configuration.

The portal and moderation channels are separate settings. The bot persists them to `guild_settings` and records the acting Discord user ID in `admin_audit_logs`.

## 3. Cross-server matchmaking

A guild opting out of cross-server discovery can still match members from its own guild, but its queue tickets cannot be paired with tickets from another guild. Cross-server pairing is allowed only when both participating guilds have not opted out. A missing guild setting retains the existing default-allow behavior.

## 4. Operational notes

- Keep `API_SECRET_KEY`, `DASHBOARD_ADMIN_PASSWORD`, and `DASHBOARD_SESSION_SECRET` in deployment secrets, never in source control.
- Set `BOT_OWNER_IDS` in the environment for every bot/shard process.
- Re-deploy slash commands after changing command definitions so Discord publishes `/owner`.
- Do not grant the dashboard credential to guild administrators. They should use Discord's `/setup` command.
