# RipoBot v5.4 — "Buddy Life" 🤖⚡🌱

RipoBot, Bolt, and Pip now hang out like real friends: human-paced replies,
explicit goodbyes, four daily hangouts, image sharing, and RipoBot can
actually *see* images humans post.

## What changed (files)

| File | Change |
|---|---|
| `utils/banter.js` | Reworked: realistic pacing (typing + random 8–25s per banter reply), sustained back-and-forth (programmatic buddy @-mention backstop on non-final rounds), goodbye ritual (session capped at ~8 bot messages → AI farewell pinging both buddies → session deleted immediately), ~25% image-share requests, `ensureBuddyMentions` mention guarantee, `composeHangoutOpener` for scheduled hangouts. TTL bumped 3→6 min (pacing stretches sessions). |
| `utils/vision.js` | **New.** `describeImage(buffer, mimeType)` → short description or `null` on any failure. HF router OpenAI-compatible `image_url` call, 45s timeout + one 30s fallback, 8 MB cap. Never throws, never logs tokens. |
| `utils/images.js` | **New.** Buddy image sharing: `fetchShareImage('meme'\|'cat'\|'dog'\|'photo')` from free no-key APIs (meme-api.com, cataas.com, dog.ceo, picsum.photos). 12s timeout, image content-type check, 6 MB cap → `null` on any failure (text-only fallback). Share protocol: invisible zero-width-wrapped `[[share:<kind>:<Name>]]` directive; `stripShareDirectives` for AI context. |
| `companions/chatter.js` | Summon replies paced (typing + 4–10s); handleSummon honors `[[share:<kind>:<Name>]]` for *its own* name → fetches + attaches via `AttachmentBuilder` with an in-character caption from API metadata (meme title / dog breed / etc.); fetch failure or 5-min share cooldown → text-only. Human mention replies paced (3–8s). |
| `utils/scheduler.js` | Daily hangouts at **09:00 / 14:00 / 19:00 / 22:00 Europe/Sarajevo**. One per slot per date (guard in `data/scheduler.json`, pruned daily). Skipped when a human posted in the channel in the last 30 min (fetch failure fails closed → skip), skipped when a banter session is already live. Kickoff = AI opener (template fallback) + ~60% share directive + **guaranteed real @-mentions**, so companions get summoned and the banter state machine takes over. |
| `events/messageCreate.js` | **Mention guarantee (live-test fix):** after the AI chat reply is generated, `ensureBuddyMentions(userText, reply)` appends real `<@1553794360829673553>`/`<@1553796168356593675>` when the reply is a buddy summon the AI wrote with plain-text names only — **before** the banter-session scan sees the outbound message. Non-summon replies untouched, existing mentions never duplicated. **Vision hook:** human-posted images in chat → ~60% chance RipoBot describes via `describeImage` and reacts like a person; vision failure → friendly generic reaction; 40% → normal flow continues. If the message also summons buddies, the description is woven into the summon so companions react to what was seen. |

No new npm dependencies. No secrets in code/logs.

## Behavior details

- **Pacing:** buddy-banter replies wait a random 8–25s with `sendTyping()` re-sent every ~9s (typing indicator lasts ~10s). Companions wait 4–10s on summons. Human-chat replies are instant as before — pacing is banter-only.
- **Goodbye ritual:** sessions count every bot message (summon + replies). At ~8 messages RipoBot sends an AI farewell ("well, see you later guys!" style) pinging both buddies, records the farewell message id, and deletes the session *immediately* — so the farewell's own pings can't start a new session and the buddies' byes get no reply. Explicit `farewelling` flag guards concurrent double-farewells.
- **Hangouts:** the kickoff's real mentions summon Bolt+Pip and start the session via the normal self-scan; pacing → back-and-forth → farewell all follow automatically.
- **Image sharing:** only RipoBot can request a share (directive in its message); companions never self-initiate. Directive is zero-width-wrapped → invisible in chat, stripped before AI context. One share per buddy per 5 min max.
- **Vision:** only the first image per message, human authors only, 8 MB cap, 15s download timeout. 60% react / 40% stay quiet.

## Loop / spam guards

- Only RipoBot ever pings; companions strip all pings from their output and can never ping each other.
- Sessions: hard ~8-message cap + 6-min TTL + immediate deletion on farewell. One session per channel.
- Hangouts: max 4/day, one per slot per date, never interrupt humans (30-min rule), never stack on a live session.
- Shares: RipoBot-initiated only, 5-min per-buddy cooldown, fetch failure → text-only, no retry.
- Vision: per-message, 60% chance, all failures → generic friendly line, never an error in chat.
- Mention guarantee: summon-gated only; "pip install" can't false-positive (Pip matched case-sensitively).

## Tests

- `npm run check` — OK (all `commands/`, `events/`, `utils/` files).
- `node --check` — OK on all touched files incl. `companions/chatter.js`.
- `node /tmp/v54-test.js` — **46/46 pass** (mock/unit, no network/Discord):
  - pacing delay within 8–25s (300 samples) + typing indicator fires;
  - mention guarantee: plain-text summon → both real mentions appended; non-summon untouched; no duplicates; no "pip install" false positive; ensured summon text starts a live banter session;
  - goodbye: farewell pings both buddies, session deleted, farewell message can't restart a session, post-farewell byes ignored;
  - session cap: exactly 3 banter replies + 1 farewell, then silence;
  - backstop ping on every non-final reply; share directive attached on the forced 25% path, invisible (zero-width-wrapped), stripped from AI context;
  - hangouts: kickoff sent when quiet (real mentions), once per slot per date, again next day; skipped when humans active <30 min; fetch failure fails closed; slots at 09/14/19/22;
  - image API failure → `null`; unknown kind → `null`;
  - vision: no token → `null`, network failure → `null`, empty/oversized → `null`;
  - non-companion bots ignored, zero output.

## Vision model proof

Live inference from this sandbox was **not possible** (the stored HF credential is host-restricted to `huggingface.co`; the router returned 401 for the surrogate — the code path itself is the same OpenAI-compatible shape `utils/ai.js` uses, but no test image was actually described here).

What *was* verified (2026-09-27, public Hub API `huggingface.co/api/models/<id>`):
- `Qwen/Qwen2.5-VL-7B-Instruct` — pipeline `image-text-to-text`, **not gated**, serverless status **"warm"** → primary (`HF_VISION_MODEL` overrides).
- `Qwen/Qwen2-VL-7B-Instruct` — ungated, no serverless slot → fallback #1.
- `google/gemma-3-4b-it` — serverless "warm" but gated → fallback #2.
- `meta-llama/Llama-3.2-11B-Vision-Instruct` — gated (manual approval) + no serverless endpoint → deliberately excluded.

## Needs live verification (post-deploy)

1. **Vision end-to-end:** post an image in #🤖・ripobot-chat → RipoBot should describe it naturally (~60%). Needs the real `HF_TOKEN` on the Space.
2. **Summon fix:** "can you chat with them a bit" → RipoBot's reply must contain real `<@…>` mentions → both companions reply (this exact case failed live before the fix).
3. **Full hangout arc:** pacing delays visible, ~25% image share appears as a real attachment, goodbye ritual ends the session cleanly.
4. **Scheduled hangouts:** 09:00/14:00/19:00/22:00 Europe/Sarajevo kickoffs; skip behavior when humans are chatting.
5. Bolt/Pip were offline during v5.3 testing — companion-side changes (pacing, share handler) need them online to prove.
