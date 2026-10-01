# BACKEND_NEEDED — Flux Rec admin API gaps (RipoBot)

RipoBot's 5 admin features are implemented bot-side. These backend endpoints
are missing — the bot degrades gracefully (tells the owner the backend doesn't
support it yet) until they exist. All live under `/api/admin/v1`, admin-key
only (`X-Admin-Key`), same auth as the existing admin routes in
`apps/api/src/routes/admin.ts`.

Existing and used (verified live 2026-10-01, all return 401 without the key):
- `POST /ranks/set` `{ username, rank: "community_mod"|"developer"|"none" }`
- `POST /membership/set` `{ username, duration_months }` (-1 remove, 0 never expires)
- `POST /bans/create` `{ username, reason, duration_minutes, voice_ban }`
- `POST /bans/lift` `{ username }`
- `POST /tokens/grant` `{ username|grant_to:"everyone", amount }`
- `GET /players/online`

## 1. `GET /api/admin/v1/bans/list` — list active bans

Needed for: `/fluxbans` slash command and NL "list bans".
The bot currently replies "the backend does not support ban listing yet".

Expected response:
```json
{
  "success": true,
  "bans": [
    {
      "username": "Ripo6000",
      "accountId": 123,
      "reason": "griefing in dorm",
      "permanent": false,
      "banExpires": "2026-10-02T15:00:00.000Z",
      "voiceBanned": false,
      "voiceBanUntil": null,
      "bannedAt": "2026-10-01T15:00:00.000Z"
    }
  ]
}
```
`bans` should only include bans currently in force (exclude lifted/expired).
Error shape on failure: `{ "success": false, "error": "<message>" }` like the
other admin routes.

## 2. `POST /api/admin/v1/gifts/grant` — grant a gift box to a player

Needed for: NL "give Ripo6000 a gift".
The bot currently replies that gift grants aren't wired yet.

Expected request:
```json
{ "username": "Ripo6000", "gift_id": "optional-specific-gift-or-box-id" }
```
(`gift_id` optional — backend picks a default gift box when omitted.)

Expected response:
```json
{
  "success": true,
  "username": "Ripo6000",
  "accountId": 123,
  "giftId": "the-granted-gift-id",
  "note": "Gift appears in the player's inventory / gift box flow."
}
```
404 `{ "success": false, "error": "no such player" }` when the username has no
account — same convention as the other admin routes.

## 3. `GET /api/admin/v1/players/lookup?username=<name>` — verify a player (nice-to-have)

Not blocking: the bot currently relies on the 404 "no such player" from the
set/grant endpoints to detect missing accounts. A dedicated lookup would let
the bot confirm an account exists *before* applying a change, and show the
owner the player's current rank/plus/balance in one glance.

Expected response:
```json
{
  "success": true,
  "username": "Ripo6000",
  "accountId": 123,
  "isModerator": false,
  "isDeveloper": false,
  "hasPlus": true,
  "plusUntil": "2026-11-01T00:00:00.000Z",
  "tokenBalance": 1500
}
```
404 when no account matches.

## Notes for the backend implementer

- Do NOT invent new rank values: the backend only knows
  `community_mod` / `developer` / `none` — if more ranks (e.g. "Event Host")
  are wanted later, define them in `admin.ts` first, then the bot's
  `FLUX_RANKS` list in `utils/flux.js` can be extended to match.
- `MAX_TOKEN_GRANT` is 1,000,000 — the bot caps grants at the same value.
- Ban display in-game already works: `bans/create` writes a report row with
  the reason, enforced by matchmaking and surfaced via
  `moderationBlockDetails` / `TopMessageOverride` on the client's block screen.
