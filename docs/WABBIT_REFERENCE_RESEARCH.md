# Wabbit reference research

Research date: 2026-11-12. Research is limited to publicly observable pages and documentation. No authentication was bypassed and no private dashboard settings were inspected.

## Public page inventory and observations

| Page | Observed facts | Application to Destiny |
|---|---|---|
| `https://wabbit.gg/` | Public product landing page with top navigation, docs/support links, a light/dark switch, concise hero, primary “Add WabbitBot” and “Open Dashboard” actions, feature cards, and footer. Page title identifies WabbitBot as an economy bot. | Reuse broad hierarchy and clear dashboard entry affordance only. Do not reproduce economy features, Wabbit branding, assets, or copy. |
| `https://wabbit.gg/servers` | Dashboard entry is visible. It presents configurable servers separately from servers where the bot can be invited, with server-level configure/invite actions and role labels. The page required an existing browser session, so no server-specific settings were examined or recorded. | Separate “bot installed and configurable” from “available to install”; show explicit permission state before configuration. |
| `https://docs.wabbit.gg/` | Public docs home with feature-oriented organization and a “Get Started” section. | Use concise help and onboarding content adjacent to the relevant setup controls. |

## Navigation and public interactions

- Landing navigation: Home/brand, Premium, Library, Docs menu, Support, Vote, language control, appearance toggle.
- Main CTA: “Open Dashboard” routes to `/servers`.
- Dashboard server selection: configurable server list and invitable server list; configured guilds provide a configure action, while unconfigured guilds provide an invite action.
- Publicly observed elements support a server-picker-first flow. Dashboard configuration details and responsive behavior behind the authenticated route were not inspected.

## Visual notes (public page only)

- The page uses a dark visual mode option and a centered marketing layout with strong page-level headings and image-led feature panels.
- The server-selection page is more operational: compact navigation, list/card server entries, permission labels, member counts, and a clear action per server.
- Destiny should adopt the operational density and server selection pattern while using its own ink/indigo/celestial brand assets and accessible contrast.

## Facts versus inference

- **Observed:** landing navigation and actions; server list categories; per-server configure/invite actions; permission labels; the public page title and advertised product category.
- **Inferred:** the authenticated configuration experience likely uses a server-scoped sidebar/settings workflow. The private settings UI, complete responsive states, save/validation behavior, and API behavior remain unverified.
- **Not inspected:** server-specific private settings, privileged staff views, non-public network responses, or any Wabbit backend. No source or private credentials were obtained.

## Research limitations

- Public access provided the landing page and a session-authenticated server-selection screen. The dashboard's server configuration pages require a legitimately authorized account and were not explored.
- A browser comparison of the public Wabbit and Destiny landing-page desktop views was completed during the 2026-11-13 implementation. Matching mobile screenshots and a durable screenshot archive were not created; the private authenticated settings interface remains unobserved.
- REA is connected in this Codex environment, but its browser inspection tools require a local Chrome DevTools Protocol endpoint. No such endpoint was configured for the in-app browser, so public observations were gathered through visible browser accessibility state and public docs instead.
- Wabbit's documented economy features are intentionally out of Destiny's product scope.

## Sources

- [WabbitBot public site](https://wabbit.gg/)
- [WabbitBot server selection](https://wabbit.gg/servers)
- [WabbitBot documentation](https://docs.wabbit.gg/)
- [REA official repository and setup documentation](https://github.com/morluto/rea)

