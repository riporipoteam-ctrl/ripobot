# RipoBot v5.5 — "Boundaries" 🧱

Fixes Armin's bug report (with screenshot proof): RipoBot kept inviting Bolt
and Pip **unasked** — they even barged into someone's **private thread**
("private — ripo60…" in #ripobot-chat). Sequence from the screenshot: Bolt
posted an uninvited party message in the private thread; RipoBot told a user
"Bolt's got his party mode on, but Pip's chill vibes are the real party…"
(unprompted buddy talk); Pip posted "Hey there, friends!…" uninvited; Armin:
"DUDE STOP INVITING YOUR BUDDYS @RipoBot".

## Root cause (investigated in code)

Bolt entered the private thread through the **summon path**, not ambient
chatter:

1. RipoBot's AI chat works inside private bot threads (`inChatZone`
   includes `isPrivateBotThread`), and `BUDDIES_BLOCK` told the model to
   PING the buddies — so its in-thread replies carried real `<@Bolt>` /
   `<@Pip>` mentions (v5.4's `ensureBuddyMentions` could also append them).
2. A real mention **is** a summon. `companions/chatter.js → handleSummon`
   had **no channel guard at all**, so it `message.reply()`-ed Bolt's
   answer **inside the private thread**.
3. Ambient chatter was *not* the path: `resolveChatChannel()` resolves the
   explicit `RIPOBOT_CHAT_CHANNEL_ID` (the main channel, never a thread id).

## What changed (files)

| File | Change |
|---|---|
| `utils/banter.js` | **New exports:** `isBuddySummon(userText, reply)` (the summon-intent test, factored out of `ensureBuddyMentions`), `stripBuddyMentions(reply)` (removes real `<@Bolt>`/`<@Pip>` incl. `<@!id>` variants, collapses whitespace), `finalizeBuddyMentions(userText, reply, inThread)` — the single choke point for outbound AI chat text: keep/ensure mentions **only** on a genuine summon, strip everywhere else, **always strip in threads**. Stripping happens before send, so the banter self-scan can never start a session on a stripped message. |
| `events/messageCreate.js` | Chat path + vision hook now call `banter.finalizeBuddyMentions(text, reply, inThread)` instead of `ensureBuddyMentions`. `inThread = message.channel?.isThread?.() === true`. `BUDDIES_BLOCK` tightened: only bring up Bolt/Pip when the user asks about them, asks to call them in, or it's a scheduled hangout — never unprompted (names or pings); notes the safety filter strips unprompted mentions anyway. |
| `companions/chatter.js` | **Thread ban:** `handleSummon` returns immediately (with a log line) when `message.channel` is any thread — companions can never reply in threads, public or private. `resolveChatChannel`: skips threads in the guild name-scan; an explicit ID resolving to a thread returns `null` (no fallthrough). `ambientTick`: belt-and-braces `isThreadChannel` guard before posting. New `isThreadChannel()` helper, exported for tests. `client.login` now guarded by `require.main === module` so the module is import-safe in tests. `resolveChatChannel` accepts an optional client override for tests. |
| `V55_SUMMARY.md` | This file. |

No new npm dependencies. No secrets in code/logs.

## How each entry path is closed

- **Unprompted AI mentions** → stripped by `finalizeBuddyMentions` before
  send; companions never see a mention, no summon, no session.
- **Summon in a thread** → main-bot side strips mentions in threads
  (`inThread` → strip); companion side ignores thread summons anyway
  (defense in depth).
- **Ambient chatter into threads** → `resolveChatChannel` rejects threads
  in both resolution paths + `ambientTick` guard.
- **Legitimate summons still work** → `/buddies` command (explicit user
  action, untouched), "where are your buddies" in the main channel
  (mentions kept, session starts), scheduled hangout kickoffs (main
  channel only — scheduler already excludes threads).

## Loop / spam guards (unchanged)

Only RipoBot pings; companions strip pings; sessions capped + TTL'd;
farewell deletes the session. v5.5 adds: fewer pings emitted overall
(strip-by-default), so fewer summon triggers exist at all.

## Tests

- `npm run check` — OK.
- `node --check` — OK on all touched files incl. `companions/chatter.js`.
- `node /tmp/v55-test.js` — **27/27 pass** (mock/unit, no network/Discord):
  - (a) unprompted AI reply with real buddy mentions → stripped; stripped
    message starts **no** banter session (self-scan sees no mentions);
  - (b) summon-intent reply → both real mentions kept, no duplicates when
    one already present; mention-bearing message **does** start a session;
    thread + summon intent → still stripped;
  - `isBuddySummon` edge cases: "chat with them" intent ✓, no
    "pip install" false positive ✓, single name without intent ✓;
  - (c) `isThreadChannel`: thread → true; normal/missing/null → false;
    `handleSummon` source verified to bail on threads before any reply
    logic (live path needs a logged-in client);
  - (d) `resolveChatChannel`: explicit ID → thread returns `null`;
    explicit ID → normal channel resolves; name scan skips thread-named
    channels; name scan still finds the real channel.

## Needs live verification (post-deploy)

1. In a **private thread**, ask RipoBot about anything (not buddies) →
   buddies must stay silent and out of the thread.
2. In the main channel: "where are your buddies" → real mentions, both
   reply, banter + goodbye as in v5.4.
3. "DUDE STOP INVITING YOUR BUDDYS"-style complaint → RipoBot apologizes
   WITHOUT mentioning/pinging Bolt or Pip (strip guard proof).
4. Next scheduled hangout (09:00/14:00/19:00/22:00 Europe/Sarajevo) →
   kickoff still summons both buddies in the main channel.
