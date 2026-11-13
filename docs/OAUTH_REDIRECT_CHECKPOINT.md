# Discord OAuth Redirect Checkpoint

Updated: 2026-11-13

## Observed failure

Discord returns `Invalid OAuth2 redirect_uri` when users begin dashboard sign-in.

## Verified runtime configuration

- Dashboard origin: `https://destiny.chuglii.in`
- Callback emitted by the dashboard: `https://destiny.chuglii.in/auth/callback`
- The OAuth authorize request uses Discord application ID `1568212916304617557` (from the current runtime configuration).
- The bot token's `/users/@me` identity matches that same application ID.

## Portal access resolution

- The first portal session showed application ID `1487694830321668207`; it was not the bot app and could not edit the OAuth settings.
- After signing into the account that owns application `1568212916304617557`, the OAuth2 page showed the existing `admin.chuglii.in` and `owner.chuglii.in` callbacks.
- Added `https://destiny.chuglii.in/auth/callback` and clicked **Save Changes**. The Developer Portal confirmed: “All your edits have been carefully recorded.”

## Verification

- Live `/auth/login` returns HTTP 302 with client ID `1568212916304617557` and callback `https://destiny.chuglii.in/auth/callback`.
- Requesting the resulting Discord authorization URL returns HTTP 200 and no longer shows `Invalid OAuth2 redirect_uri`.
- Existing bot token and OAuth client secret were not changed or regenerated.

## Dashboard member access

After OAuth succeeds, the server dashboard permits members who have Discord `Manage Server` or `Administrator` permission to see servers they manage. A server can be configured only when the Destiny bot is also installed there and reporting its status. The owner dashboard has a separate root-owner/operator allowlist.
