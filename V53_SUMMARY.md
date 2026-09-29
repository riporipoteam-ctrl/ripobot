# RipoBot v5.3 — "Group Banter"

RipoBot now chats BACK with Bolt and Pip instead of going silent after
summoning them. Armin's complaint: "ripobot doesnt talk back to them tho".

## What changed

- **`utils/banter.js` (new)** — in-memory banter session state machine,
  keyed by channel id: `{ rounds, expiresAt }`.
  - A session STARTS when RipoBot's own outbound message contains a
    companion @-mention (`<@1553794360829673553>` / `<@1553796168356593675>`).
    Starting is a no-op while a session is live (rounds never reset).
  - `tryBanterReply(message)`: during a live session, a message from Bolt
    or Pip (and ONLY those two ids) gets one AI banter reply from RipoBot.
    Every other bot falls through to the normal ignore guard.
  - `MAX_ROUNDS = 3` RipoBot replies per session, then the session is
    deleted. `TTL_MS = 3 minutes` backstop. Final round never pings anyone
    (prompt instruction + `sanitize()` backstop strips `<@id>` and
    neutralizes `@everyone`/`@here`), so the thread ends naturally.
  - Banter replies use the last ~6 channel messages for coherence, are
    1–2 sentences, and are NEVER added to per-user chat history or the
    XP/affinity pipeline.
- **`events/messageCreate.js`** —
  - Top of `handleMessage`, BEFORE the bot guard: RipoBot's own messages
    are scanned for companion pings (`banter.maybeStartBanterSession`).
  - Companion branch before the guard: `banter.tryBanterReply(message)`.
  - `BUDDIES_BLOCK` tightened: RipoBot must NEVER roleplay as the buddies
    (no `"Bolt: ..."` / `"Pip: ..."` ventriloquism — it did this once).
    It speaks as itself and pings them; they speak for themselves.
- **`companions/chatter.js`** — unchanged; re-verified safe (see below).

## Loop-guard chain (why this can't run away)

1. Only Bolt's and Pip's user ids can trigger a banter reply
   (`COMPANION_IDS` allowlist). All other bots → ignore guard.
2. At most 3 RipoBot banter replies per session (round counter + delete).
3. Companions reply at most once per RipoBot message id
   (`lastSummonMessageId`) and their replies never contain mentions
   (`stripPings`), so a companion reply can never summon the other
   companion or re-summon RipoBot.
4. RipoBot's banter replies with pings (rounds 1–2) DO re-trigger the
   companions — that IS the back-and-forth — but each cycle burns one
   round, so it terminates after 3 RipoBot replies regardless.
5. Final round has no pings → companions stay quiet → natural end.
6. TTL (3 min) kills stale sessions even if rounds never fill.
7. RipoBot ignores ALL bot messages outside a live session (unchanged).

## Acceptance

- `npm run check` → OK (all files incl. new `utils/banter.js`).
- Mock state-machine test (`/tmp/banter-test.js`, ai stubbed):
  22/22 pass — session start on ping, no session without ping/DM,
  exactly one reply per companion message, other bots + humans ignored,
  no round reset on re-ping, pings kept rounds 1–2, pings stripped on
  final round, session deleted at MAX_ROUNDS, TTL expiry stops replies.
- No new `package.json` dependencies. No hardcoded tokens
  (companion/RipoBot ids are public Discord user ids, already in code).

## Deploy (parent)

No slash-command changes → no `deploy-commands.js` needed.
`push_to_github.py` → Space restart (companions unchanged, but the main
bot process reads the new `messageCreate.js` + `utils/banter.js` from the
GitHub tarball at startup).

## Live verification still needed

In #🤖・ripobot-chat: "can you chat with them a bit" → RipoBot should
introduce + ping (no ventriloquism), Bolt/Pip answer, then RipoBot should
reply back to THEM 1–3 times and stop. Watch for: no double replies, no
companion↔companion chatter, conversation ends after ~3 RipoBot banter
replies.
