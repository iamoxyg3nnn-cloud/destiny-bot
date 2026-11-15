# Product Requirements Document (PRD)
# Anonymous Discord Matchmaking Platform — Codex Build Specification

**Document status:** Implementation-ready product specification  
**Version:** 1.0  
**Date:** 14 November 2026  
**Primary product:** A DM-only Discord matchmaking and anonymous social bot  
**Default matching mode:** Random matchmaking  
**Primary build agent:** OpenAI Codex  

---

## 0. Instructions to Codex — read this first

You are the lead engineer responsible for implementing this product, not merely generating a plan. Inspect the existing repository before changing it. Preserve useful existing code, report the current state, create a phased implementation plan, then implement and test the actual product. Do not stop at scaffolding, mockups, TODOs, placeholder buttons, or pseudocode.

Treat the requirements in this document as the source of truth. Where a requirement depends on a live Discord API or library capability, consult the latest official documentation before implementation. Do not guess at undocumented behavior. Keep a `DECISIONS.md` file for necessary technical decisions and deviations. If a feature cannot be implemented because Discord does not expose the required capability, document the limitation and implement the closest truthful alternative; never simulate a feature in a way that misleads users.

**Non-negotiable product constraints:**
1. All end-user bot interaction is exclusively in a one-to-one DM with the bot. No server-channel commands, panels, notifications, logging, or chat relay.
2. Register only global application commands configured for the `BOT_DM` interaction context (`contexts: [1]`). Do not register guild-scoped commands. Do not enable `GUILD` (`0`) or `PRIVATE_CHANNEL` (`2`) contexts.
3. Enforce the DM-only rule again at runtime for every command and component interaction. Reject any interaction with a guild context or non-bot-DM context.
4. Use modern Discord Components V2 layouts, buttons, select menus, and modals wherever appropriate.
5. Random matchmaking is the only enabled matching algorithm at launch. It selects uniformly at random from the eligible waiting pool; it does not use compatibility scores, AI ranking, interests, profile completeness, or popularity to rank candidates.
6. The service is adults-only (18+). No under-18 user may create an active profile, enter a queue, receive a match, or use adult chat features.
7. Never share a user's Discord account identifiers or profile identity automatically. Any optional identity/contact exchange must be user-authored and explicitly approved by both participants.
8. Blocking, reporting, consent, privacy, data deletion, and abuse prevention are core features, not optional premium features.
9. No mandatory paid AI API. AI integrations are optional and off by default; local Ollama may be used when configured.

---

## 1. Product overview

### 1.1 Vision

Create a polished, privacy-conscious anonymous matchmaking and social discovery platform delivered primarily through a Discord bot DM. It should feel like a modern Discord-native app: guided onboarding, interactive profile cards, multi-step forms, random matching, anonymous chat relay, mutual-consent contact exchange, safety tools, events, achievements, and private administration.

The bot is not a server utility. It is a private one-to-one application. Users discover, configure, match, chat, report, and manage their account through the bot's DM UI. A separate private web admin dashboard is used by authorized staff for operations and moderation.

### 1.2 Product goals

- Make starting a random match simple and fast.
- Create a genuinely anonymous conversation layer between matched users.
- Keep users in control of discoverability, matching preferences, conversation state, and identity disclosure.
- Make all user workflows accessible through rich Discord interactions.
- Provide strong reporting, blocking, age eligibility, retention, and deletion controls.
- Support future matching modes and AI assistance without changing the default random algorithm.
- Give operators a secure dashboard for support, moderation, analytics, configuration, and health monitoring.

### 1.3 Success metrics

Track aggregate, privacy-preserving metrics:

- Completed adult onboarding rate.
- Percentage of verified eligible profiles that opt into discovery.
- Queue-to-proposal rate.
- Proposal acceptance rate (both participants accept).
- Median and p95 time from queue entry to proposal.
- Conversation activation rate.
- Conversation continuation at 24 hours / 7 days.
- Mutual contact-exchange rate.
- Block and report rates per 1,000 conversations.
- Report review time and resolution rate.
- DM delivery failure rate.
- Interaction error and timeout rate.
- Queue fairness metrics (match distribution, repeat-pair rate, wait time distribution).

Do not optimize for message volume, compulsive usage, or repeated notifications. Do not expose user-level analytics to public viewers.

### 1.4 Non-goals

- No guild/server matchmaking, server channels, guild roles, or server-specific pools.
- No public chat rooms or group DMs.
- No bot-hosted voice bridge or Discord voice-channel system.
- No collection of users' Discord passwords, tokens, or account credentials.
- No scraping, bypassing access controls, or use of Discord API data to identify anonymous participants.
- No AI deciding who is worthy of a match in the default random mode.
- No automatic contact sharing or identity reveal.

---

## 2. Product decisions and defaults

These are fixed defaults unless changed intentionally through a documented product decision:

| Area | Default |
|---|---|
| Bot surface | One-to-one bot DMs only |
| Application commands | Global commands, `BOT_DM` context only |
| UI | Components V2 / `LayoutView` where supported |
| Matching algorithm | Uniform random selection from eligible queued users |
| Match mode at launch | Random social/dating mode, with user-selected purpose filters |
| Eligibility | 18+ only; age-assurance provider configurable |
| Match proposal | Both users must accept before conversation starts |
| Anonymous chat | Bot-mediated DM relay |
| Identity/contact reveal | User-authored contact details; mutual explicit approval required |
| AI | Disabled by default; local Ollama optional |
| Premium | Feature-flagged future module; safety/basic functionality remains free |
| Data store | PostgreSQL is source of truth |
| Cache/queue | Redis; never the only store for important state |
| Deploy | Docker Compose for development; Linux container deployment target |
| Admin | Separate private web dashboard with role-based access |

### 2.1 What “random matching” means

Random is not “ignore every preference.” The engine first builds the set of candidates who satisfy hard eligibility and safety constraints. It then chooses one candidate uniformly at random from that set. It must not rank or weight candidates by compatibility, age proximity, gender preference beyond explicit hard filters, profile completeness, popularity, activity score, or AI output.

Hard constraints include:
- Both accounts are adult-eligible and not suspended.
- Both users actively opted into the same matching mode and are currently in the waiting queue.
- Both profiles are sufficiently complete to meet the minimum onboarding requirement.
- Each user's explicit hard filters are mutually satisfied.
- Neither user has blocked the other.
- Neither user has an active match, active conversation, or pending proposal.
- Neither user is under a cooldown or paused.
- The pair is not in a configured repeat-match exclusion window.

If no candidate meets the constraints, leave the requester in the queue and explain that no eligible person is currently available. Never silently weaken age or hard preference filters to force a match.

### 2.2 Randomness and fairness

- Use a uniform random selection over the eligible candidate set, not a top-N score or weighted sort.
- For an initial modest queue, a database-side random sample is acceptable if load tests show it meets latency targets. Keep the selection behind a `RandomCandidateSelector` interface so it can be upgraded without changing product logic.
- Use a cryptographically secure random source where selection is performed in application code.
- Selection and reservation must happen inside a transaction with row locks or equivalent concurrency controls.
- A candidate can be reserved by only one proposal at a time.
- Record algorithm version, eligible-pool count, and selection timestamp for fairness debugging; do not expose identities in analytics.
- Do not use profile answers or AI outputs to alter selection probability.

---

## 3. User roles and permissions

### 3.1 User

Can create and manage their own profile, opt in/out of matching, enter/leave queues, accept/decline match proposals, use anonymous chat, request a mutual contact exchange, manage privacy settings, block/report, export/delete their account, and participate in optional social features.

### 3.2 Moderator

Can review assigned reports, view only the minimum identity and conversation evidence necessary for the case, apply approved moderation actions, and leave internal case notes. Moderators cannot casually browse private conversations or reveal user identities outside a documented case workflow.

### 3.3 Administrator

Can configure service-wide settings, manage staff roles, review audit logs, configure eligibility and matching policies, manage feature flags, and access system health. Sensitive actions require step-up authentication and an audit record.

### 3.4 System operator

Can deploy, monitor, back up, restore, and maintain the application. Production data access must be restricted; infrastructure access does not grant permission to browse user content.

---

## 4. DM-only Discord requirements

### 4.1 Command registration

- Register application commands globally, never through guild command endpoints.
- Set the interaction context to `BOT_DM` only (`contexts: [1]`).
- Do not set `GUILD` (`0`) or `PRIVATE_CHANNEL` (`2`).
- Configure installation types only as required by the chosen bot installation flow and supported by the application; do not add user-install private-channel contexts.
- Reconcile/sync global commands through a controlled deployment command, not on every reconnect.
- Add an automated test that inspects the registered command payload/config and fails if any forbidden context is enabled.

### 4.2 Runtime enforcement

Every slash command, autocomplete handler, button, select, modal submission, and dynamic component callback must invoke a shared `DMOnlyGuard` before accessing or mutating state.

Allow only a one-to-one DM interaction with this bot. Reject:
- Any interaction where `guild_id` is present.
- Any `GUILD` or `PRIVATE_CHANNEL` interaction context.
- Group DMs or other private channels that are not the direct bot DM.
- Any message event originating from a guild, thread, group DM, or non-DM channel.

The bot must never send messages into guild channels. The DM-only guard must be tested at the dispatcher layer and business-service layer, not merely hidden in UI choices.

### 4.3 Message event handling for anonymous relay

Anonymous chat relay needs to receive messages users send directly to the bot after a conversation is active. Handle only one-to-one DM messages. Confirm current Discord Message Content Intent requirements for bot DMs before enabling any privileged intent. Request the minimum intents needed; do not enable guild-presence, guild-member, or guild-message access for this product. Never process messages from guilds, threads, or group DMs.

When relaying content:
- Set `AllowedMentions.none()` or the equivalent so mentions cannot ping users or roles.
- Enforce Discord message length and attachment limits.
- Sanitize unsafe content and reject unsupported types clearly.
- Never forward message author IDs, avatar URLs, profile URLs, message references, or metadata that could reveal identity.
- Do not automatically unfurl or embed arbitrary links. Apply link-safety policy and show safe plain links when allowed.
- If a recipient's DMs are closed or Discord rejects delivery, tell the sender that delivery failed without revealing private account data.

### 4.4 DM delivery expectations

Users must initiate the bot DM and explicitly opt into notifications. The bot must not mass-DM non-consenting users. Match, daily-drop, event, and reminder notifications must be directly related to features the user opted into. Offer pause, quiet-hours, and notification-frequency settings.

---

## 5. Discord UI / Components V2 specification

Use modern Discord Components V2 for all rich application messages wherever the library supports them.

### 5.1 Required component toolkit

Use the current supported discord.py UI API, including `discord.ui.LayoutView` (available from discord.py 2.6), and the components exposed by the chosen pinned version. Prefer:
- Containers and sections for structured cards.
- Text Display components for headings, descriptions, instructions, and status.
- Separators for visual grouping.
- Thumbnails and media galleries for profile imagery where appropriate.
- Buttons for primary actions, cancellation, pagination, acceptance, rejection, reveal, and report.
- String select menus for profile preferences, modes, interests, and settings.
- Multi-select controls where supported.
- Modals with labels and text inputs for profile descriptions, report details, custom interests, and contact handles.
- Radio groups and checkbox groups where supported by the API/library version.
- File upload only for explicitly supported, validated profile assets.

### 5.2 Components V2 technical rules

- Set the `IS_COMPONENTS_V2` message flag for Components V2 messages.
- Components V2 messages use component content/layout; do not rely on legacy `content` or `embeds` in the same message after enabling the V2 flag.
- Expose attachments through components when required by the API.
- Respect Discord limits, including the 40-component per-message limit and action-row child limits documented by Discord.
- Keep each message concise; use paginated cards rather than trying to fit everything into one message.
- Use stable, versioned `custom_id` values. Never put raw Discord IDs, access tokens, contact data, secrets, or untrusted text inside `custom_id`.
- Every callback must verify the clicker's Discord account matches the owner or participant authorized for that control.
- Revalidate server-side state on every click; a disabled button is not a security boundary.
- For restart survival, persist the underlying workflow state and register persistent views/dynamic items with stable identifiers. Do not depend solely on in-memory Python objects.
- Respond/defer within Discord's interaction acknowledgement deadline; perform slow work after deferral and edit/follow up appropriately.
- Do not assume ephemeral responses work in a bot DM. The DM itself is the private surface.

### 5.3 Required UI patterns

1. **Home panel:** profile completion, current availability, main actions: Find Random Match, Profile, Matches, Settings, Safety, Help.
2. **Onboarding wizard:** progress indicator; Continue, Back, Skip where optional, Cancel; one focused question per screen or modal.
3. **Profile card:** anonymous handle, optional age-in-years display, selected mode, optional bio/interests, preference-safe details, Edit Profile button.
4. **Random queue card:** Searching status, queue cancellation, help; no fake countdown or false online count.
5. **Match proposal card:** anonymous profile preview, brief consent reminder, Accept, Pass, Block, Report. Never display account identity.
6. **Active chat controls:** End Chat, Report, Block, Request Contact Exchange, Chat Settings.
7. **Contact exchange screen:** explains exactly what fields will be shared; separate approval by each person; revoke before both approve; confirmation and audit event.
8. **Settings:** selects/toggles for discoverability, notification preferences, quiet hours, mode, filters, privacy, retention and AI preferences.
9. **Report modal:** category, description, optional selected evidence; clear submit confirmation.
10. **Admin panel:** separate authenticated web dashboard, not a public Discord server panel.

### 5.4 Modal/form constraints

- Use modals for compact data entry, not a giant all-fields form.
- Provide clear field labels, descriptions, required state, input length limits, validation, and error feedback.
- For longer onboarding, use multiple screens and save drafts.
- Verify which modal component types are supported by the pinned discord.py release; use only supported API features or implement a small isolated adapter with tests if absolutely necessary.

---

## 6. End-user journeys

### 6.1 First-time onboarding

1. User opens the bot DM and runs `/start` (or presses Start on the landing panel).
2. Show a concise explanation: adults only, anonymous matching, DM relay, data usage, reporting, and deletion.
3. Require terms/privacy acceptance with versioned consent records.
4. Run the configured age-assurance flow. A simple self-declaration may be used for local development only; production adult matchmaking must use an age-assurance approach approved for the target jurisdiction and risk. Do not collect or retain government identity documents directly unless a separately reviewed provider/process requires it. Store the provider result and timestamp, not raw ID images or full DOB.
5. If under 18 or not verified, prevent profile activation and matching. Give a neutral explanation and do not retain unnecessary profile data.
6. Collect required profile fields through Components V2 forms.
7. Collect optional fields only with explicit consent.
8. Explain hard matching filters and random matching semantics.
9. User selects whether to become discoverable and whether to join the random queue.
10. Display the home panel.

### 6.2 Profile setup and editing

Required minimum profile:
- Age eligibility status (verified adult; not public DOB).
- Matching purpose/mode.
- Language preference.
- Explicit discovery consent.
- At least one non-identifying profile label or short bio if the product requires it.

Optional profile fields:
- Anonymous display name.
- Short bio.
- Interests/tags.
- Broad region/time zone (never exact address or precise GPS by default).
- Gender identity and match preference, optional and private by default.
- Preferred age range.
- Preferred matching purpose (dating, friendship, casual conversation, gaming/social).
- Preferred languages.
- Conversation preferences.
- Optional user-selected profile image after moderation/validation.
- Optional personality answers, music/game tastes and love-language quiz results.

Users can view, edit, hide, export, or delete profile data. Sensitive fields must be optional, explained, encrypted at rest where appropriate, and excluded from analytics and AI unless the user explicitly opts in.

### 6.3 Random matchmaking flow

1. User presses **Find Random Match**.
2. Check age eligibility, profile state, consent, safety status, availability, existing active match, cooldown, and queue status.
3. If valid, create an idempotent queue entry and show Searching.
4. Find another eligible user currently waiting in the same mode.
5. Apply mutual hard preferences and block/repeat exclusions.
6. Uniformly select one candidate at random from the remaining eligible pool.
7. Atomically reserve both users and create a pending proposal.
8. Send both users an anonymous proposal card in their own bot DM.
9. Both users must press Accept before the anonymous conversation becomes active.
10. If both accept before expiry, create/activate the relay conversation and show chat controls.
11. If either passes, blocks, reports, or the proposal expires, close the proposal. The rejecting user leaves the queue; the waiting user may remain queued if they did not cancel and their consent is still valid.
12. If no candidates exist, keep the requester in queue and explain that they can wait or cancel.

### 6.4 Active anonymous conversation

- Each user writes to the bot in their own one-to-one DM.
- The bot forwards allowed content to the other participant's bot DM using a generated anonymous alias, not the sender's Discord account details.
- Each side sees the same conversation code and non-identifying display labels.
- The bot never creates a shared Discord channel, group DM, or server thread.
- The conversation can be paused, ended, reported, or blocked at any time.
- If a DM cannot be delivered, notify the sender and mark the conversation delivery state; do not expose the recipient's account settings.
- A failed delivery must not lose the original message silently. Provide a retry option within a bounded period if safe.

### 6.5 Mutual contact exchange

- Either person can request contact exchange.
- The requester chooses exactly which self-authored fields to share (e.g., a user-entered social handle or a user-entered profile link). Do not automatically disclose Discord snowflakes, API-derived usernames, email addresses, real names, or server membership.
- The other user sees the exact fields and values to be shared and can accept or decline.
- The requester must also reconfirm the final package if values change.
- Only when both approvals refer to the same version/hash of the package may the bot send each person's opted-in details to the other.
- A declined or expired request shares nothing.
- The feature must not attempt to infer or re-identify a participant from Discord API data.

### 6.6 Daily random match drop

- User explicitly opts into a daily match window and configures timezone/quiet hours.
- At most the configured number of daily proposals are generated.
- Build pairs from consenting eligible users and randomly pair without replacement per drop batch.
- No notification is sent to users who opted out or paused notifications.
- Both people still must accept the proposal.
- If no eligible pair exists, do not fabricate a match.

### 6.7 Block/report flow

- Block is immediate and ends any active or pending connection between the two users.
- Block prevents future matching in either direction.
- The blocked person receives only a generic chat-ended message; do not identify who blocked them.
- Report allows category selection, description, and optional submission of recent relevant messages.
- Reporting does not require the user to keep chatting.
- A report creates a case with least-privilege moderator access and a retention deadline.

### 6.8 Account pause/deletion

- Pause removes user from queues, daily drops, and future proposals immediately.
- Unmatch ends active chat and stops relay immediately.
- Export provides a machine-readable copy of user profile/preferences/consents and their relevant account records.
- Delete account revokes queue entries, proposals, matches, conversations, contact-exchange state, reminders, and tokens; personal data is deleted or irreversibly anonymized subject to documented legal/safety retention exceptions.
- Explain any retained report evidence and its retention deadline.

---

## 7. Feature requirements

### 7.1 Core profile and identity system — P0

- Generate a unique anonymous public handle (e.g. `Cupid#0417` or a product-branded equivalent).
- Handle must not encode the Discord user ID or reveal account identity.
- Store the mapping between account and internal profile in a restricted private identity table.
- Use Discord snowflake only to DM the user and enforce account ownership; never expose it to other users.
- Prevent duplicate profiles per Discord account.
- Support profile update, visibility, pause, export, and deletion.
- Use generated, safe display names if user does not choose one.

### 7.2 Applications and onboarding — P0

- Guided onboarding wizard.
- Versioned Terms of Service and Privacy Policy consent.
- Configurable age assurance.
- Profile validation and completeness indicator.
- Draft autosave and resume after restart.
- Skip optional steps.
- Clear progress and cancellation controls.

### 7.3 Random matching engine — P0

- Random queue entry/exit.
- Only currently waiting/available users are eligible for instant random matches.
- Same matching mode and mutual hard preferences required.
- Uniform random candidate selection.
- Candidate reservations and atomic proposal creation.
- Duplicate/active-match prevention.
- Proposal acceptance/decline/expiry.
- Pair repeat cooldown.
- User-level match cooldown.
- Match history.
- Queue timeout and stale queue cleanup.
- Daily random drops as a scheduled opt-in mode.
- Metrics for fairness and queue latency.

### 7.4 Anonymous chat relay — P0

- One-to-one DM relay in each participant's bot DM.
- Text messages.
- Emoji and supported formatting handling.
- Optional image/file relay after file type/size validation and clear user notice.
- Safe link handling and mention suppression.
- Conversation pause/end.
- Delivery error handling.
- Configurable retention policy and transparent user notice.
- Abuse throttling and flood control.
- Conversation-level report/block controls.

Limitations to implement honestly:
- Do not claim Discord read receipts unless the API actually exposes them to this application. Provide delivery status only.
- Typing indicator is optional and best-effort only if current Discord events/library expose a usable DM typing event. Do not promise exact cross-user typing state.
- The bot cannot host an anonymous voice call via normal bot DMs. After mutual contact exchange, users may share a user-entered external voice link or contact method with mutual consent.

### 7.5 Mutual contact exchange — P0

- Contact exchange request.
- Select fields to share.
- Preview exact data before approval.
- Both participants approve identical package.
- Expiration and cancellation.
- Audit event.
- No automatic Discord account identifier reveal.

### 7.6 Safety and moderation — P0

- Adult-only eligibility gate.
- User pause and discoverability toggle.
- Block list.
- Report categories: harassment, threats, sexual harassment, scam/fraud, impersonation, spam, underage concern, sharing personal information, other.
- Immediate end-conversation action.
- Rate limits per account, conversation, command, and IP for dashboard/API.
- New-account safeguards and abuse heuristics that do not use sensitive profiling.
- Moderator case queue, assignment, status, notes, resolution, escalation.
- Sanction levels: warning, temporary matching pause, temporary suspension, permanent ban.
- Appeals workflow.
- Audit log for all staff access to report evidence and sensitive data.
- Minimal retention and automated expiry.
- Emergency safety copy and links configurable by region.

### 7.7 Discovery modes — P1

Support these mode labels as configuration-driven modes:
- Dating / romantic discovery.
- Friendship.
- Casual conversation.
- Gaming/social interests.

At launch, all use the random algorithm, with each mode forming its own eligible queue. Users must explicitly choose a mode. Users can pause or change mode; a mode change removes stale queue entries and pending proposals as appropriate.

### 7.8 Personality and interest features — P1

- Optional personality questionnaire.
- Optional love-language questionnaire.
- Interests and hobby tags.
- Gaming and music preferences.
- Daily question prompts.
- Icebreaker suggestions.

These features are used for profile display and conversation prompts only while random matching is the default. They must not silently affect candidate ranking or selection probability.

### 7.9 Social/gamification features — P2

- Anonymous compliments.
- Secret admirer system with privacy-safe mutual interest reveal.
- Daily question/challenge.
- Achievement badges.
- Profile completion badge.
- Non-coercive streaks.
- Seasonal events and opt-in matchmaking events.
- Event participation and completion rewards.
- Cosmetic profile themes.

Do not gamify repeated messaging, romantic consent, identity disclosure, or reporting. No reward may pressure a user to accept a match or reveal contact details.

### 7.10 Optional AI features — P2, off by default

AI can assist with:
- Conversation-starter suggestions.
- Profile wording assistance.
- Voluntary interest extraction from user-written profile text.
- Optional match explanation after a match (not used to select the match in random mode).
- Human-reviewed safety triage hints.

AI constraints:
- Local Ollama support through configurable `OLLAMA_BASE_URL` and model name.
- No paid API required or enabled by default.
- No AI-driven candidate ranking while random mode is active.
- Do not infer protected traits, age, sexuality, identity, or mental/medical conditions.
- Do not send private conversations or sensitive profile fields to an external model without explicit opt-in and clear disclosure.
- Moderator decisions remain human-controlled.
- Feature flags must disable AI completely.

### 7.11 Premium / monetization — P3, feature-flagged

Possible optional paid additions: cosmetic themes, extra profile customization, expanded non-sensitive insights, and special event cosmetics. Do not paywall baseline matching, blocking, reporting, account deletion, privacy controls, or safety. Do not implement payments until provider, legal, refund, tax, and platform-policy requirements are reviewed. No manipulative loot-box or pay-to-reveal mechanics.

---

## 8. Command surface

Prefer a small slash-command set that opens interactive panels rather than dozens of commands.

| Command | Purpose |
|---|---|
| `/start` | Start onboarding or reopen the home panel |
| `/menu` | Open the main interactive dashboard |
| `/find` | Enter random matchmaking queue |
| `/stop` | Leave queue or stop current discovery activity |
| `/profile` | View/edit own profile |
| `/matches` | View active and recent matches |
| `/settings` | Open settings |
| `/privacy` | Privacy, export, consent, retention, delete account |
| `/help` | Help and safety information |

Use buttons/selects for most sub-actions. Add `/report` as an emergency direct command if a component is unavailable, and `/admin` only as a link or authenticated access entry for allowlisted staff in DM; actual staff operations live in the secure web dashboard. All commands remain global and `BOT_DM` only.

---

## 9. Admin web dashboard

### 9.1 Scope

Build a private staff dashboard, separate from Discord server channels. Use Next.js + TypeScript for the frontend and FastAPI for authenticated admin endpoints.

### 9.2 Dashboard modules

- Overview: bot status, API/worker health, active queue count, active proposals, active conversations, pending reports.
- User lookup: search by internal user ID or anonymous handle; Discord ID lookup restricted to elevated roles and audit-logged.
- Profile moderation: view user-submitted public profile fields; do not expose hidden sensitive fields by default.
- Reports: case list, priority, assignment, evidence, notes, action history, resolution, appeal.
- Moderation: warn, suspend, ban, unban, disable matching, remove content, escalate.
- Matching operations: queue statistics, proposal state, stale queue cleanup, repeat-pair controls, random algorithm configuration.
- Events: create/manage opt-in events and daily prompts.
- Feature flags: enable/disable AI, events, compliments, premium, and experimental features.
- Analytics: aggregate metrics only; prevent staff from exporting unnecessary PII.
- System: worker status, Redis/Postgres health, error logs, backup status, migration state.
- Audit: view staff access and sensitive action history.

### 9.3 Admin security

- Discord OAuth2 sign-in or another secure identity provider.
- Explicit allowlist of staff Discord accounts.
- Roles: owner, admin, moderator, analyst, support.
- MFA/step-up authentication for severe actions.
- CSRF protection, secure cookies, short session expiry, refresh rotation.
- No shared admin credentials.
- Every sensitive record view and action is audit logged.
- Moderators only see cases assigned to them or in their allowed scope.
- Do not expose the admin dashboard publicly without authentication.

---

## 10. Technical architecture

### 10.1 Recommended stack

| Layer | Technology |
|---|---|
| Discord bot | Python + current stable `discord.py` |
| HTTP API | FastAPI + Pydantic |
| ORM/database | SQLAlchemy 2.x async + PostgreSQL |
| Migrations | Alembic |
| Queue/cache | Redis |
| Background jobs | ARQ or another asyncio-native Redis worker |
| Admin frontend | Next.js + TypeScript + Tailwind CSS |
| Validation | Pydantic / Zod |
| Tests | pytest, pytest-asyncio, Playwright |
| Quality | Ruff, mypy/pyright, ESLint, typecheck |
| Local services | Docker Compose |
| Deployment | Linux containers |
| Optional AI | Local Ollama adapter |

Choose versions by checking current compatibility and pin the tested versions in lockfiles. Do not use an unpinned `latest` dependency in production.

### 10.2 Service boundaries

1. `bot`: Discord gateway client, commands, DM message receiver, components, forms, and DM delivery.
2. `api`: user/admin API, OAuth, authentication, authorization, configuration, and webhooks if required.
3. `worker`: match queue processing, daily drops, reminders, expirations, retention cleanup, analytics rollups, and optional AI tasks.
4. `web-admin`: private staff dashboard.
5. `postgres`: source of truth.
6. `redis`: short-lived cache, distributed locks, job queue, typing/presence hints if implemented; never sole source of truth for matches or consent.

Services communicate through typed service interfaces and/or authenticated internal API calls. Keep domain logic outside Discord callbacks so it is testable without Discord.

### 10.3 Suggested repository structure

```text
.
├── apps/
│   ├── bot/
│   │   ├── cogs/
│   │   ├── commands/
│   │   ├── components/
│   │   ├── modals/
│   │   ├── dm_gateway/
│   │   └── main.py
│   ├── api/
│   │   ├── routes/
│   │   ├── auth/
│   │   └── main.py
│   ├── worker/
│   │   ├── jobs/
│   │   └── main.py
│   └── admin-web/
├── packages/
│   ├── domain/
│   ├── services/
│   ├── repositories/
│   ├── schemas/
│   └── discord_ui/
├── migrations/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── discord_contract/
│   ├── e2e/
│   └── security/
├── infra/
│   ├── docker/
│   └── scripts/
├── docs/
├── .env.example
├── docker-compose.yml
├── pyproject.toml
├── README.md
└── CODEX.md
```

Codex may adjust this structure if the existing repository has a better established pattern, but keep clear service boundaries.

### 10.4 Configuration

Use validated environment configuration. Provide `.env.example` with placeholders only, never real secrets.

Required/expected settings:
- `DISCORD_BOT_TOKEN`
- `DISCORD_APPLICATION_ID`
- `DATABASE_URL`
- `REDIS_URL`
- `APP_ENV`
- `APP_SECRET_KEY`
- `PII_ENCRYPTION_KEY`
- `PII_LOOKUP_HMAC_KEY`
- `ADMIN_OAUTH_CLIENT_ID`
- `ADMIN_OAUTH_CLIENT_SECRET`
- `ADMIN_ALLOWED_DISCORD_IDS`
- `PUBLIC_BASE_URL`
- `TERMS_VERSION`
- `PRIVACY_VERSION`
- `AGE_VERIFICATION_MODE`
- `AGE_VERIFICATION_PROVIDER_*` (only if provider configured)
- `OLLAMA_BASE_URL` (optional)
- `OLLAMA_MODEL` (optional)
- `FEATURE_*` flags
- Queue, cooldown, retention, quiet-hours and notification settings

Validate missing or malformed production secrets at startup and fail closed. Never log tokens, OAuth codes, raw IDs, contact details, or message content.

---

## 11. Data model (initial logical schema)

Use UUID primary keys internally. Use migrations for all schema changes. Define foreign keys, check constraints, unique constraints, indexes, timestamps, and retention policies.

### 11.1 Core identity and consent

- `users`: internal user UUID, status, created/updated/deleted timestamps, locale, timezone, notification preferences, last active timestamp.
- `user_private_identity`: user UUID, encrypted Discord user ID, HMAC lookup digest, DM delivery state. This table is highly restricted; never expose via normal profile serializers.
- `user_profiles`: anonymous handle, display name, bio, optional avatar asset key, mode, profile visibility, profile state.
- `user_preferences`: preferred modes, preferred age range, optional gender filters, languages, broad region, hard filters, queue availability.
- `user_sensitive_profile_fields`: optional sensitive answers encrypted separately with explicit consent metadata.
- `age_assurance_events`: provider/method, adult-eligible result, verification timestamp, expiry/recheck status, provider reference (no raw document image or full DOB by default).
- `consents`: versioned ToS/privacy/relay/notification/AI/contact-exchange consents and timestamp.
- `privacy_requests`: export/delete request state, deadline, completion metadata.

### 11.2 Matching and conversations

- `match_queue_entries`: user, mode, queue status, entered_at, expiry, hard-filter snapshot/version, idempotency key.
- `match_proposals`: participants, state, created_at, expires_at, per-user acceptance state, algorithm version, eligibility count, decline reason category (not free text by default).
- `matches`: accepted pair, state, created_at, ended_at, end reason, repeat-pair key.
- `conversations`: match ID, state, started_at, ended_at, retention policy.
- `conversation_messages`: optional encrypted relay record, sender participant, message type, content/attachment reference, delivered state, created_at, expiry. Keep minimal retention; attachments default transient and not persisted.
- `contact_exchange_requests`: requester, recipient, package version/hash, exact user-entered fields, approval states, expiry, completed_at.
- `blocks`: blocker, blocked user, created_at, unique pair constraint.
- `reports`: reporter, reported participant, match/conversation, category, description, status, priority, created_at, retention deadline.
- `report_evidence`: only user-submitted or report-associated evidence, encrypted, access logged, expiry.

### 11.3 Engagement and administration

- `interest_catalog`, `user_interests`.
- `personality_questions`, `personality_answers` (optional, consented).
- `daily_questions`, `daily_answers`.
- `compliments`, `secret_admirer_events` (mutual-interest semantics only).
- `events`, `event_participants`.
- `badges`, `user_badges`, `streaks`.
- `feature_flags`, `system_settings`.
- `admin_users`, `admin_roles`, `admin_sessions`.
- `moderation_actions`, `moderation_appeals`.
- `audit_logs`.
- `outbox_events` for reliable external DM/job delivery.
- `idempotency_keys` for commands/interactions and worker jobs.

### 11.4 Data separation rules

- Keep Discord identity separate from anonymous profile data.
- Normal profile and match queries must not join the private identity table.
- Only DM-delivery service and explicitly authorized safety workflows can resolve a user UUID to a Discord ID.
- Encrypt contact fields and sensitive fields at rest using authenticated encryption and managed keys.
- Use HMAC digests for equality lookup rather than storing plaintext identifiers in broad-access tables.
- Never store raw passwords, tokens, government ID images, or precise GPS location.
- Use a separate serializer for public anonymous profile cards that allowlists fields.

---

## 12. Core domain rules and state machines

### 12.1 User state

`NEW -> ONBOARDING -> ACTIVE -> PAUSED -> ACTIVE`

Terminal/exception states: `AGE_INELIGIBLE`, `SUSPENDED`, `BANNED`, `DELETION_PENDING`, `DELETED`.

Only `ACTIVE` and verified adult users can enter matching. `PAUSED` users are removed from all queues and future drops.

### 12.2 Queue state

`WAITING -> RESERVED -> REMOVED`

Removal reasons: user cancel, proposal accepted, proposal rejected, proposal expired, user paused, age verification expired, moderation action, preference changed, queue timeout.

### 12.3 Proposal state

`PENDING -> ACCEPTED` only when both participants accept before expiry. Other terminal states: `DECLINED`, `EXPIRED`, `CANCELLED`, `BLOCKED`, `REPORTED`.

No conversation can start from a one-sided acceptance.

### 12.4 Conversation state

`ACTIVE -> PAUSED -> ACTIVE` or `ACTIVE -> ENDED`.

Terminal reasons: mutual end, unmatch, block, report-triggered closure, moderation, deletion, delivery/eligibility policy.

### 12.5 Contact exchange state

`REQUESTED -> RECIPIENT_APPROVED -> BOTH_APPROVED -> SHARED`

Terminal states: `DECLINED`, `EXPIRED`, `CANCELLED`, `REVOKED_BEFORE_SHARE`.

Approval must apply to the exact package version. Updating a contact value invalidates previous approvals.

### 12.6 Transaction invariants

- A user can have at most one active queue entry.
- A user can have at most one pending proposal reservation at a time.
- A user can have at most one active conversation at a time (configurable later, default one).
- A pair cannot have duplicate active matches.
- Both participants must accept before conversation activation.
- A blocked pair can never be matched again unless the blocker explicitly removes the block.
- A contact package can only be shared after both exact-version approvals.
- Deleting/pausing a user must invalidate queue entries and pending proposals atomically.
- Worker retries must be idempotent.

---

## 13. API and internal service contracts

Define typed request/response schemas, domain exceptions, authorization checks, and integration tests. Suggested internal endpoints (names can change):

### User endpoints
- `GET /v1/me`
- `PATCH /v1/me/profile`
- `PATCH /v1/me/preferences`
- `POST /v1/me/consents`
- `POST /v1/me/age-assurance/start`
- `GET /v1/me/privacy/export`
- `POST /v1/me/privacy/delete`
- `POST /v1/matching/queue`
- `DELETE /v1/matching/queue`
- `GET /v1/matches`
- `POST /v1/matches/{id}/accept`
- `POST /v1/matches/{id}/decline`
- `POST /v1/conversations/{id}/end`
- `POST /v1/conversations/{id}/block`
- `POST /v1/conversations/{id}/report`
- `POST /v1/contact-exchange`
- `POST /v1/contact-exchange/{id}/approve`
- `POST /v1/contact-exchange/{id}/decline`

### Admin endpoints
- `GET /v1/admin/overview`
- `GET /v1/admin/reports`
- `GET /v1/admin/reports/{id}`
- `POST /v1/admin/reports/{id}/assign`
- `POST /v1/admin/reports/{id}/resolve`
- `POST /v1/admin/users/{id}/sanctions`
- `GET /v1/admin/audit-logs`
- `GET /v1/admin/settings`
- `PATCH /v1/admin/settings`
- `GET /v1/admin/health`

The Discord bot should call domain services, not directly issue ad-hoc SQL from UI callbacks. Internal API calls must authenticate service-to-service or call shared application services in-process; do not expose unauthenticated admin endpoints.

---

## 14. Privacy, safety, and platform policy requirements

### 14.1 Data minimization

Only collect fields that have a documented product reason. Make sensitive fields optional and private by default. Never collect precise location, government ID images, email, phone, or real name unless a separate reviewed feature requires it.

### 14.2 Age eligibility

- Adult-only by product design.
- Under-18 users are blocked before profile activation.
- Production age assurance must be reviewed for the operating countries and current legal obligations.
- Do not store full date of birth or ID document images by default.
- Provide a manual review/appeal path for verification errors.
- If age assurance cannot be established, fail closed and do not match.

### 14.3 Identity and anonymity

- Anonymous IDs are product-generated, non-reversible, and never derived from Discord IDs.
- Do not expose Discord ID, username, avatar, global name, server membership, account creation date, or other API metadata to match partners.
- Do not attempt to infer or reverse a user's identity from Discord API data.
- Contact exchange only shares fields manually entered by the user and approved by both sides.

### 14.4 Content and evidence retention

Choose an explicit retention policy before launch. Recommended starting policy:
- Unreported relay content: encrypted, short retention (e.g. 7 days) only if necessary for delivery/support; otherwise transient delivery processing with no durable content storage.
- Report evidence: only relevant excerpts explicitly included in a report or captured under disclosed safety policy; retain for a defined case period (e.g. 90 days after closure) then purge unless legally required.
- Attachments: do not retain by default; if needed for a report, store securely with strict expiry and access logs.
- Operational logs: no message text, contact details, tokens, or raw Discord IDs.
- Deletion requests: complete promptly, subject only to disclosed legal/safety exceptions.

The exact periods must be configurable and documented in the Privacy Policy before launch.

### 14.5 Discord policy

Follow current Discord Developer Terms and Developer Policy, including restrictions on unsolicited DMs, API data use, privacy, and user expectations. All notifications must be consent-based and related to the app's core functionality. Do not use API data to deanonymize users.

### 14.6 Security controls

- TLS in transit.
- Encryption at rest for sensitive fields.
- Secrets manager or protected environment variables.
- Least-privilege database roles.
- Separate staff roles.
- Admin MFA/step-up for severe actions.
- Audit access to sensitive data.
- Rate limiting and abuse monitoring.
- Dependency and container scanning.
- Database backup encryption and restore tests.
- Secure file upload validation, MIME inspection, size limits, and malware scanning where applicable.
- Protect against SQL injection, SSRF, XSS, CSRF, IDOR, mass assignment, replay, and race conditions.

---

## 15. Reliability, observability, and operations

- Structured logs with correlation IDs for interactions, matches, jobs, and reports.
- Metrics for interaction latency, command errors, DM send failures, worker queue depth, match proposal outcomes, database query latency, and Redis health.
- Health endpoints for API, bot readiness, worker, database, and Redis.
- Graceful shutdown and reconnect handling.
- Retry policies with bounded exponential backoff and idempotency.
- Outbox pattern for match proposal DMs and other critical notifications so DB commits and DM sends do not drift silently.
- Dead-letter handling for repeated DM delivery failure.
- Scheduled cleanup for stale queue entries, expired proposals, expired contact requests, expired content, and abandoned onboarding drafts.
- Backups with restore drills.
- Migration must run as a deployment step, not concurrently from every app replica.
- No duplicate daily drops after worker restart; use idempotent scheduled jobs keyed by date/timezone.

---

## 16. Testing and quality plan

### 16.1 Unit tests

- Random selector uniformity over a large simulated sample (statistical tolerance test, deterministic seed for reproducibility).
- Candidate eligibility and mutual preference logic.
- Age eligibility and fail-closed behavior.
- Block and repeat-pair exclusion.
- State-machine transition validity.
- Contact package hash/version approvals.
- Consent and notification rules.
- Data serializer never includes private identity fields.
- Retention and deletion services.

### 16.2 Database/integration tests

- Simultaneous queue joins by many users.
- Race where two workers try to reserve the same candidate.
- Double-click/idempotency for accept/reject buttons.
- Both users accept at the same time.
- One user declines while other accepts.
- Proposal expiration during an accept attempt.
- Block during active relay.
- Account deletion while queued or matched.
- Worker retry after database commit but before DM send.
- Redis outage and recovery.

### 16.3 Discord contract tests

- Global application commands only.
- `contexts` includes only `BOT_DM`.
- No guild command sync calls.
- No `GUILD` or `PRIVATE_CHANNEL` command context.
- Runtime guard rejects guild interactions, private-channel interactions, and group DMs.
- Message handler ignores all guild/thread/group-DM messages.
- Components V2 payload complies with current API schema.
- `custom_id` has no PII/secrets and respects length limits.
- Every component is authorization-checked.
- Persistent views recover after restart.
- DM send failure is handled without leaking recipient details.

### 16.4 End-to-end tests

1. New adult user onboards and creates profile.
2. User pauses and leaves queue.
3. Two users enter queue; random proposal is created.
4. One accepts; conversation remains inactive.
5. Second accepts; relay becomes active.
6. Both exchange messages through bot DMs.
7. Mention injection does not ping anyone.
8. One user requests contact exchange; second approves; only user-authored approved fields are shared.
9. User blocks; relay stops immediately and no future match occurs.
10. User reports; case reaches moderator dashboard.
11. User exports and deletes account.
12. Daily match runs once for opted-in users only.
13. No step posts anything to a server channel.

### 16.5 Load/security tests

- Load test queue matching at expected launch concurrency.
- Verify random selection fairness.
- Verify rate limits and flood controls.
- Test authz bypass/IDOR across users and admins.
- Test token/secret leakage in logs.
- Test file upload attack payloads.
- Test retention cleanup and backup restoration.

### 16.6 Definition of Done

A feature is done only when:
- Code is implemented, not stubbed.
- Validation and error handling exist.
- Unit/integration tests pass.
- UI workflow is tested in Discord or a faithful test harness.
- Authorization and privacy tests pass.
- Documentation/configuration is updated.
- No hidden TODOs or fake success messages remain.

---

## 17. Non-functional requirements and targets

Initial targets (adjust only with documented rationale):
- Interaction acknowledgement: respond/defer comfortably within Discord's interaction deadline; aim for < 2 seconds in normal conditions.
- Queue match proposal creation: p95 < 5 seconds when a compatible queued candidate exists.
- Admin API p95 < 500 ms for ordinary reads under expected launch load.
- Match state consistency: no duplicate active proposal/conversation for a participant.
- Availability target: 99.5% monthly for initial production, excluding planned maintenance and third-party Discord outages.
- Data deletion: complete within documented policy window and report status to user.
- Recovery: documented backups and restore test; define RPO/RTO before public launch.
- Accessibility: clear labels, contrast, keyboard navigation for dashboard, understandable button labels and concise error messages.

---

## 18. Delivery roadmap

### Phase 0 — Repository and API reconnaissance
- Inspect repository, current Python/Node versions, package files, deployment setup, existing code, Discord app configuration.
- Read latest Discord docs for command contexts, Component V2, modals, Gateway intents, message delivery, rate limits, and policy.
- Confirm installed discord.py release supports required Components V2 APIs (LayoutView and needed component types); pin a compatible tested version.
- Produce architecture/decision record and risks.
- Do not change production secrets or sync commands during reconnaissance.

**Gate:** architecture documented and DM-only plan proven in a small test command.

### Phase 1 — Foundation
- Create repo structure, typed settings, logging, DB, migrations, Redis, worker, Docker Compose, CI.
- Create domain/service/repository boundaries.
- Implement health checks and deployment docs.

**Gate:** all services boot locally; migrations and smoke tests pass.

### Phase 2 — DM-only shell and Components V2 UI
- Register global `BOT_DM`-only commands.
- Implement DM runtime guard.
- Build `/start`, `/menu`, `/help` and persistent Component V2 navigation.
- Add component authorization and restart persistence.

**Gate:** commands/components work in bot DMs and are unavailable in guilds/group DMs.

### Phase 3 — Onboarding, adult eligibility, profile, consent
- Build age-assurance adapter and fail-closed state.
- Build ToS/privacy consent records.
- Build profile wizard, profile card, settings, pause, export/delete.

**Gate:** adult-only eligibility, privacy and deletion tests pass.

### Phase 4 — Random matching engine
- Build queue, candidate selector, transactions/locks, reservations, proposals, accept/decline/expiry, history, cooldowns, daily random batch.
- Add fairness telemetry.

**Gate:** concurrency and statistical fairness tests pass; default engine is random only.

### Phase 5 — Anonymous relay and contact exchange
- Build one-to-one DM message relay, safe forwarding, delivery state, chat controls, block, report, mutual contact exchange.
- Implement retention and report evidence policy.

**Gate:** no identity metadata leakage; mutual exchange cannot complete one-sided.

### Phase 6 — Moderation and admin dashboard
- Build admin OAuth, roles, MFA/step-up, reports, sanctions, audit log, aggregate analytics, feature configuration.

**Gate:** unauthorized staff cannot view evidence or perform actions; all sensitive access is audited.

### Phase 7 — Social features and gamification
- Add friendship/dating/casual/gaming modes (still random matching per mode), interests, questions, compliments, admirers, events, badges, streaks, themes.

**Gate:** features respect consent, quiet hours, and privacy settings.

### Phase 8 — Optional AI and premium modules
- Add local Ollama adapter and opt-in AI helpers.
- Add feature-flagged premium cosmetics/insights only after policy and business review.

**Gate:** random algorithm unchanged when AI/premium toggled; no paid API is required.

### Phase 9 — Production hardening and launch
- Run load, security, end-to-end, restore, policy, age-assurance, and DM-only audits.
- Prepare privacy policy, terms, moderation playbook, support instructions, incident plan, backup/restore runbook.
- Deploy staging, test with consenting adult accounts, then production.

**Gate:** launch checklist signed off by owner.

---

## 19. Launch checklist

- [ ] Bot commands are global and `BOT_DM` only.
- [ ] No guild command registration exists.
- [ ] DM-only runtime guard is enforced everywhere.
- [ ] Guild and group-DM message events are ignored.
- [ ] Only minimum Discord intents are enabled.
- [ ] Adult eligibility process is configured and tested.
- [ ] Terms and privacy policy published with accurate retention details.
- [ ] Random matching is default and selection is unweighted.
- [ ] Both users must accept a match before chat starts.
- [ ] Anonymous relay hides sender API identity and suppresses mentions.
- [ ] Contact exchange shares only self-authored fields after mutual approval.
- [ ] Block/report is available in every active conversation.
- [ ] Account pause/export/deletion works.
- [ ] Admin roles/MFA/audit log are configured.
- [ ] Data retention/cleanup jobs are enabled.
- [ ] Backups and restore process are tested.
- [ ] Monitoring/alerts are configured.
- [ ] Rate limits and incident response are documented.
- [ ] Discord Developer Policy and Terms have been reviewed.
- [ ] No secret, token, private message, or sensitive identifier appears in logs.

---

## 20. Official technical references

Codex must re-check these sources at implementation time because Discord and library behavior can change:

- Discord Application Commands and interaction contexts: https://docs.discord.com/developers/interactions/application-commands
- Discord Component Reference / Components V2: https://docs.discord.com/developers/components/reference
- Discord Using Message Components: https://docs.discord.com/developers/components/using-message-components
- Discord Using Modal Components: https://docs.discord.com/developers/components/using-modal-components
- Discord Interactions Overview: https://docs.discord.com/developers/interactions/overview
- Discord Developer Policy: https://support-dev.discord.com/hc/en-us/articles/8563934450327-Discord-Developer-Policy
- discord.py stable interaction/UI API: https://discordpy.readthedocs.io/en/stable/interactions/api.html
- discord.py stable changelog: https://discordpy.readthedocs.io/en/stable/whats_new.html

Important current implementation notes to verify against those references:
- Discord documents `GUILD` (`0`), `BOT_DM` (`1`), and `PRIVATE_CHANNEL` (`2`) interaction contexts. Guild-scoped commands do not support `BOT_DM`; use global commands and configure only the bot-DM context.
- Components V2 uses the `IS_COMPONENTS_V2` message flag. V2 messages use components for content/layout rather than legacy message `content` and `embeds` fields.
- discord.py documents `discord.ui.LayoutView` as the V2-capable layout view (introduced in 2.6). Pin a tested compatible release.
- Current Discord component references include layout, content, and interactive components; support can differ by library release, so verify every component type used.

---

## 21. Final Codex execution brief

Build this product end to end. Start by inspecting the repository and produce a short `IMPLEMENTATION_STATUS.md` showing: current files, what already works, missing pieces, planned next phase, and exact tests to run. Then implement Phase 0 through Phase 9 in order. You may parallelize independent frontend/backend tasks, but preserve the domain invariants and acceptance gates.

For each phase:
1. Implement real code.
2. Add/update database migrations.
3. Add tests before declaring completion.
4. Run lint, type checks, unit tests, integration tests, and relevant e2e tests.
5. Update README and `IMPLEMENTATION_STATUS.md`.
6. Report files changed, tests run, results, and any genuine blockers.

Do not ask for confirmation for ordinary engineering choices. Use secure defaults. Do not silently drop requirements. Do not mark a feature complete if it is only mocked. If a requirement conflicts with the current Discord API or policy, document the conflict, explain the limitation, and implement the closest compliant behavior.

**Final acceptance:** the delivered application must be a working adult-only, anonymous, DM-only Discord matchmaking platform; random matching is enabled by default; all core workflows use modern interactive Discord UI; anonymous relay and mutual contact exchange work; safety and deletion controls work; the private admin dashboard works; and automated tests prove that no end-user workflow operates in a server channel.
