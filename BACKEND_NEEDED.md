# Flux Rec admin API — RipoBot backend status

All 5 RipoBot admin feature sets are implemented bot-side AND backend-side.
All endpoints live under `/api/admin/v1`, admin-key only (`X-Admin-Key` header
must equal the `ADMIN_API_KEY` env var), in `apps/api/src/routes/admin.ts`.

| Feature | Endpoint | Notes |
|---|---|---|
| Set/remove rank | `POST /ranks/set` `{ username, rank: "community_mod"\|"developer"\|"none" }` | Backs `/role/*` + token role claims; takes effect on next login |
| Search players | `GET /players/search?q=` | Case-insensitive prefix search, max 10; only real accounts, never invented |
| Flux Rec+ membership | `POST /membership/set` `{ username, duration_months }` | 1, 2, … months; `0` = never expires; `-1` = remove |
| Ban (reason shown in-game) | `POST /bans/create` `{ username, reason, duration_minutes, voice_ban? }` | `0` = permanent; reason shows on the in-game block screen via moderationBlockDetails |
| Timeout | `POST /bans/create` with `duration_minutes > 0` | Timed ban lifts itself on expiry |
| Voice ban (standalone) | `POST /voiceban/set` `{ username, duration_minutes }` | `0` = permanent, positive = timed, `-1` = remove. Account NOT banned — match worker refuses voice server only |
| Lift ban (+voice) | `POST /bans/lift` `{ username }` | Clears voice ban too |
| List bans | `GET /bans/list` | Bans currently in force, newest first |
| Grant tokens | `POST /tokens/grant` `{ username\|grant_to:"everyone", amount }` | Max 1,000,000 per grant |
| Grant gift box | `POST /gifts/grant` `{ username, gift_id? }` | Omit `gift_id` for the operator-configured default gift (OPERATOR_DEFAULT_GIFT_* vars) |
| Who's online | `GET /players/online` | Live count + room per player; feeds the Discord "Flux Rec Status" channels |

No gaps remain. The bot degrades gracefully (explicit error replies) if an
endpoint ever 404s.

## Notes

- Do NOT invent new rank values: the backend only knows
  `community_mod` / `developer` / `none` — if more ranks (e.g. "Event Host")
  are wanted later, define them in `admin.ts` first, then the bot's
  `FLUX_RANKS` list in `utils/flux.js` can be extended to match.
- `MAX_TOKEN_GRANT` is 1,000,000 — the bot caps grants at the same value.
- Ban display in-game already works: `bans/create` writes a report row with
  the reason, enforced by matchmaking and surfaced via
  `moderationBlockDetails` / `TopMessageOverride` on the client's block screen.
