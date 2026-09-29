# RipoBot v5.6 — "Summon Fix" hotfix 🔧

Small surgical patch on top of v5.5, from a live test on 2026-09-27 ~20:42 CEST.

## The bug

`where are your buddies` → RipoBot answered "They're chillin' in the corner,
waiting for an invite to the fun!" with **no real @-mentions** → Bolt and Pip
never got summoned → silence. Root cause: `isBuddySummon()` required the AI's
*reply* to name Bolt/Pip, but the AI often answers buddy questions generically
("they're chillin'...") without naming them — defeating the summon.

## The fix (`utils/banter.js` only)

- `isBuddySummon()`: explicit user summon intent (`SUMMON_INTENT_RE`) is now
  **sufficient on its own** — the reply gets real `<@Bolt>`/`<@Pip>` pings
  appended even when the AI didn't name them. (AI naming both buddies outright
  still counts as a summon, as before.)
- New `NEGATE_RE`: "stop / don't / no more / leave them alone / shut / quiet /
  go away" **negates** summon intent — a complaint like "stop inviting your
  buddies" can never summon them (the exact thing Armin complained about).
- Thread rule unchanged: `finalizeBuddyMentions` always strips buddy mentions
  in threads, even with summon intent.

## Tests

- `node --check utils/banter.js` OK; `npm run check` OK.
- 8/8 mock assertions pass: intent+generic reply → pings appended; "stop
  inviting your buddies" → no summon; thread+intent → stripped; "pip install"
  → no summon; AI naming both → summon; "can you chat with them a bit" +
  generic reply → summon.

No new deps. No secrets. No other files touched.
