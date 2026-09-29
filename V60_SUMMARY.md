# RipoBot v6.0 "Alive" — summary (2026-09-27 ~21:45 CEST)

Armin's brief: add a FREE backup AI; make the buddies way more human —
slower replies, think about what the other bot said, randomized goodbyes,
buddy memory, more features, stuff no other Discord bot has.

## 1. Free backup AI (the HF 402 fix)
- `utils/ai.js`: new `chatCompleteBackup()` → Pollinations OpenAI-compatible
  endpoint (`https://text.pollinations.ai/openai`). **Free, no key, no signup.**
  Verified live from sandbox: chat works; vision does NOT (keyless endpoint
  is text-only — the keyed `gen.pollinations.ai` gateway needs an API key,
  so vision stays HF-only and fails gracefully until credits reset).
- `chatComplete()` now tries HF primary first, falls back to the backup on ANY
  HF failure (402 out-of-credits, 429, 5xx, network, bad JSON).
- HF circuit breaker: after an HF failure, HF is skipped for 5 minutes so
  calls don't waste seconds on a dead endpoint during an outage.
- `chatAvailable()` is now always true (backup needs no key).
- Live failover test: stubbed HF 402 → backup answered in ~4s; 2nd call skipped
  HF entirely (cooldown). Real end-to-end backup reply verified: "backup works".

## 2. Farewell protocol fix (the 21:05 screenshot incident)
- Root cause: RipoBot's farewell pings were answered with SUMMON greetings
  ("attention acquired!!", "you called? i'm all ears") instead of goodbyes.
- New invisible markers: `[[farewell]]` on RipoBot's farewell,
  `[[farewell-turn:Bolt|Pip]]` on handoffs. Companions check these FIRST in
  handleSummon and answer with goodbyes — never summon greetings.
- **Randomized goodbye initiator** (Armin's ask): `pickFarewellInitiator()` —
  RipoBot ~50%, Bolt ~25%, Pip ~25%. When a buddy is picked, RipoBot sends a
  natural handoff ("ok @Bolt, you do the honors — goodbye speech! 🎤" + pings
  + turn marker); the named buddy gives the main speech (with [[farewell]]
  marker), the other answers with a short bye. Session closes ~75s later.
- Handoff message id goes into farewellIds so its pings can't start a new
  session; session.farewelling blocks further banter immediately.

## 3. Buddies think about the conversation (not one line)
- `session.transcript`: last 8 exchanges (who said what), pushed for the
  summon, every companion reply, and every RipoBot banter reply.
- `buildBanterPrompt()`: the reply prompt now includes the conversation so
  far + an explicit instruction to reference something SPECIFIC that was
  said — no generic lines.

## 4. Slower, human pacing
- Companion `buddyPause` defaults: 4–10s → **8–22s** (typing indicator kept).
- Human mentions: 3–8s → 5–12s (snappy but human).
- Independent long windows naturally stagger Bolt/Pip instead of same-minute
  machine-gun replies.

## 5. Buddy memory + feelings + moods (companions/chatter.js)
- Companions now load `utils/memory.js`: "remember that …", "what do you
  remember about me", "forget …", "forget everything about me" — each buddy
  keeps its OWN memory of people (separate process, separate store).
- Companions now load `utils/feelings.js`: sentiment → affinity shifts how
  they vibe toward each person; `relationshipPrompt` + remembered facts are
  injected into their AI replies.
- **Buddy moods**: slowly-rotating mood (every 6h) colors replies —
  Bolt: "gremlin mode", "weirdly philosophical (for like 5 seconds)"…
  Pip: "extra cozy", "quietly amused"…

## 6. Human-like image shares
- `aiShareReply` rewritten: react to the SPECIFIC thing in the image, then
  pull the group in (ask something, dare someone, roast a buddy by name).
- **Vision grounding**: the buddy now actually LOOKS at the image it shares
  (`vision.describeImage` on the fetched buffer) and captions what it sees —
  like a human sending a pic. Falls back to API metadata when vision is down.

## 7. Dream journal (the "no other bot has this" feature)
- After each hangout (4+ messages), an AI one-liner summarizes it into
  `data/dream_journal.json` (ephemeral, like levels.json; capped at 20).
- `composeHangoutOpener` includes the last 2 summaries: buddies callback to
  previous hangouts naturally ("remember when Bolt…") — inside jokes.

## Verification
- `npm run check`: OK. `node --check companions/chatter.js`: OK.
- chatter.js loads clean with stub env.
- 21/21 focused assertions pass (/tmp/v60_assert.js): failover, circuit
  breaker, markers, initiator distribution, transcript cap, prompt content,
  dream journal empty-safe.

## Still not live-proven (needs HF credits OR live backup test)
- End-to-end: v5.7 thread invites, v6.0 farewell protocol, dream journal
  callback in a real hangout, vision-grounded share caption, buddy memory
  commands from a human. The backup AI makes all of these TESTABLE NOW
  even with HF at 402 — run a live hangout to prove them.
