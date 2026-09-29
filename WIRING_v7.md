# RipoBot v7.0 "Realism + Fun" — wiring guide

New modules: `utils/realism.js`, `utils/fun.js`. **Nothing else was changed.**
Load defensively (companions may run with a partial tree):

```js
let realism = null, fun = null;
try { realism = require('../utils/realism.js'); } catch (e) { console.error('[v7] realism unavailable:', e.message); }
try { fun = require('../utils/fun.js'); } catch (e) { console.error('[v7] fun unavailable:', e.message); }
```

All prompt builders return plain `[{ role, content }]` — call them via
`ai.chatComplete(msgs, { maxTokens, temperature })` inside try/catch and
fall back to the template pools. **Every AI-powered v7 feature has a pool
fallback; never leave the user hanging on AI failure.**

All JSON stores live under `data/` and are **ephemeral on the Hugging Face
Space** (reset on rebuild): `nicknames.json`, `greetings.json`, `stories.json`.

---

## utils/realism.js — human-texting realism

### maybeDoubleText(text) → string[]
- **Call:** on EVERY buddy text (companion summon reply, banter reply, RipoBot banter reply) right before sending.
- **Returns:** `[text]` usually; ~35% of the time long messages (>120 chars) split into `[part1, part2]`.
- **Wiring:** send each part as its own message with a **2–4s gap** between parts (typing indicator on). Never split on the human-chat path unless you want the same effect there.
- **Guarantees:** always returns a non-empty array; parts are trimmed; no content is lost.

### shouldLurk() → boolean
- **Call:** when a companion is about to reply to a banter message (not on summons — summons must always answer).
- **Returns:** `true` ~18% of the time.
- **Wiring:** when true, **do not send text** — instead react to the message with `lurkEmoji()`. This makes buddies feel like people who saw the message and just reacted.

### lurkEmoji() → string
- **Call:** when `shouldLurk()` returns true.
- **Returns:** one of the `LURK_EMOJIS` pool (👀 😂 ❤️ 🔥 💀 🫡 👏 🤣 😭 ✨).
- **Wiring:** `message.react(realism.lurkEmoji())`. Guard with try/catch.

### vibeEmoji(text) → string
- **Call:** when a buddy reacts to a message OR to append to a short reply.
- **Returns:** 😂 laugh · 😭 cry · ⚡ hype · ❤️ love · 😱 shock · 💯 agree · ✨ default.
- **Wiring:** use as the reaction emoji, or append sparingly to template lines. Don't stack — one emoji per use.

### getNickname(userId) → string|null · setNickname(userId, name) → string|null
- **Call:** `setNickname` when a human says "call me X" / the buddy invents a nickname; `getNickname` anywhere a name is displayed (morning lines, comfort, mentions by name).
- **Returns:** stored name (trimmed, max 30 chars) or null.
- **Wiring:** prefer nickname over username in casual copy: `getNickname(id) || username`. File is created lazily with try/catch; safe to call anywhere.

### greetingKindNow(date?) → 'morning' | 'night' | null
- **Call:** when a human sends their first message of a session, or on a scheduler tick.
- **Returns:** `'morning'` 5–11h, `'night'` 22–4h, else `null`. Uses **Europe/Sarajevo**. Accepts an optional Date (defaults to now).
- **Wiring:** only proceed to a greeting when it returns non-null.

### shouldGreet(userId, kind) → boolean
- **Call:** right after `greetingKindNow` returns a kind.
- **Returns:** `true` once per day per kind per user, then records it; `false` if already greeted.
- **Wiring:** `if (realism.shouldGreet(id, kind)) send(kind === 'morning' ? realism.morningLine(name) : realism.nightLine(name))`. Never greet bots.

### morningLine(name) / nightLine(name) → string
- **Call:** when `shouldGreet` returns true.
- **Returns:** one of 6+ casual template lines each, with the name baked in.
- **Cooldown:** the `shouldGreet` guard IS the cooldown — don't add another.

### comfortPrompt(userName, contextLine) → [{role, content}]
- **Call:** when a human message reads sad/down (feelings.js negative shift, or keywords like "bad day", "stressed", "sad", "depressed"). Pip should send it; Bolt should NOT (Bolt comforting breaks his voice).
- **Returns:** chat messages for a Pip-style gentle reply.
- **Wiring:** `await chatComplete(realism.comfortPrompt(name, line), { maxTokens: 100 })`, fallback: pick from `comfortFallbacks` (6+ lines). Sanitize @everyone/@here like other outbound text. One comfort per conversation — don't comfort-spam every sad message.

### lengthGuidance() → string
- **Call:** append to buddy AI prompt systems (companion reply prompts, banter prompts, debate prompts).
- **Returns:** a prompt-snippet string telling the AI to vary length (3–8 word 1-liners sometimes, 2–3 sentences sometimes, never a wall of text).
- **Wiring:** string-concat into the system content. Pairs well with the existing 1–2 sentence style.

### pronouns() → { Bolt: 'he/him', Pip: 'she/her' }
- **Call:** whenever generated copy needs a pronoun for a buddy.
- **Returns:** the mapping above.

---

## utils/fun.js — group fun

### DEBATE_TOPICS → [{ topic, sides: [a, b] }]
- **Call:** during a hangout, rare trigger (~1 per session max) — RipoBot tosses a topic: `pick(DEBATE_TOPICS)`, then assigns sides (Bolt = sides[0], Pip = sides[1] or shuffled).
- **Returns:** 15 topics with both sides spelled out.

### debatePrompt(topic, who, side) → [{role, content}]
- **Call:** after a debate starts — call once per buddy with their side.
- **Returns:** chat messages: `who` ('Bolt'|'Pip') argues `side` playfully, teases the other buddy, 1–2 sentences, stays light.
- **Wiring:** `await chatComplete(fun.debatePrompt(t.topic, 'Bolt', t.sides[0]), { maxTokens: 120 })`. AI-failure fallback: have the buddy reply with a generic light rebuttal from their own banter templates (no dedicated pool — improvise one line like "okay but have you considered you're wrong ⚡"). Pace like normal banter (humanPause). **Cooldown:** one debate per hangout session max — set a flag on the session.

### miniGameStarter() → { kind: 'wyr' | 'trivia', text }
- **Call:** rare hangout spice (~10% chance per session, not every session). RipoBot sends `text` to the channel.
- **Returns:** a would-you-rather question or a trivia question.
- **Wiring:** for `kind === 'trivia'`, the answer is in `_TRIVIA_POOL` — match by question to reveal the answer after someone guesses (or after ~2 min). `text` already includes the "quick trivia! 🧠" framing for trivia; WYR text is the raw question — prefix with something casual like "ok quick one:". **Cooldown:** one mini-game per hangout.

### roastPrompt(targetName) → [{role, content}] · roastFallbacks (10 lines)
- **Call:** when a human explicitly asks for a roast ("roast me", "roast @Bolt"). **Bolt does the roasting** — Pip never roasts.
- **Returns:** Bolt-style playful roast prompt. Built-in rails: roasts the IDEA not the person, never cruel, no appearance insults.
- **Wiring:** `await chatComplete(fun.roastPrompt(name), { maxTokens: 120 })`, fallback: `pick(fun.roastFallbacks)`. Sanitize output. **Cooldown:** max ~3 roasts per user per hour — track in-memory; never roast unprompted.

### defendPrompt(targetName) → [{role, content}] · defendFallbacks (8 lines)
- **Call:** right after a roast lands (roast AI success OR fallback) — **Pip defends**.
- **Returns:** Pip-style defense prompt / pool lines.
- **Wiring:** `await chatComplete(fun.defendPrompt(name), { maxTokens: 120 })`, fallback: `pick(fun.defendFallbacks)`. Send 3–6s after the roast so it reads like a real reaction.

### getStory(channelId) → [{ who, line }] · addStoryLine(channelId, who, line) → [{ who, line }]
- **Call:** "story time" / "let's make a story" from a human starts story mode for the channel. Every subsequent message (human or buddy, one sentence each) goes through `addStoryLine`.
- **Returns:** the story so far. **Cap: 30 lines — adding the 31st auto-resets** to just the new line (a fresh story begins).
- **Wiring:** when it's a buddy's turn, call `storyPrompt(getStory(ch), buddyName)`. End story mode when a human says "end story" or the session farewells; on end, post a fun one-line recap (AI or "and so ends the tale of…"). Store is per-channel.

### storyPrompt(linesSoFar, who = 'Bolt') → [{role, content}]
- **Call:** when it's buddy `who`'s turn in story mode.
- **Returns:** chat messages — continue the absurd story in EXACTLY ONE sentence in that buddy's voice.
- **Wiring:** `await chatComplete(fun.storyPrompt(story, who), { maxTokens: 80 })`, fallback: a template continuation like `"and then, out of nowhere, a toaster achieved sentience ⚡"` (Bolt) / `"the toaster politely asked for jam 🌱"` (Pip). Cap the sentence at 300 chars via `addStoryLine`'s built-in trim.

### hotTakePrompt() → [{role, content}] · hotTakeFallbacks (12 lines)
- **Call:** once per day — wire into `utils/scheduler.js` alongside the hangout slots (e.g. the 14:00 slot, Bolt only).
- **Returns:** Bolt's daily hot take prompt (spicy but harmless: food, games, movies).
- **Wiring:** `await chatComplete(fun.hotTakePrompt(), { maxTokens: 100 })`, fallback: `pick(fun.hotTakeFallbacks)`. **Cooldown:** once per day max — persist a `data/hottake.json` date guard or piggyback the scheduler's slot guard. Never post twice.

### BRB_LINES (8) · BACK_LINES (7)
- **Call:** when a buddy "steps away" (random rare event during long hangouts, or when a buddy hasn't spoken for a while and returns).
- **Returns:** casual away/back one-liners ("brb, my wifi died lol" / "ok i'm back, what'd I miss").
- **Wiring:** pick one, send as the buddy. **Cooldown:** max once per 30 min per buddy — these lose their charm if spammed.

---

## Integration gotchas

1. **Nothing is wired yet.** These are pure helpers + prompt builders. The main agent must call them from `events/messageCreate.js` (human-chat path), `companions/chatter.js` (buddy reply path), `utils/banter.js` (session flow), and `utils/scheduler.js` (hot take).
2. **Companions are separate processes** (`companions/chatter.js` runs Bolt and Pip independently). If a fun feature needs shared state (story, debate flag), the store must be file-based (`data/`) — in-memory Maps won't sync across the three processes. `stories.json`, `nicknames.json`, `greetings.json` are already file-based for this reason.
3. **Voice channels — WIRED in v7.0** (this note was written before the
   voice batch landed). `utils/edgetts.js` = free/keyless Microsoft Edge
   neural TTS → 48 kHz Opus packets via pure-JS `opusscript` (no native
   opus, no ffmpeg). `utils/voice.js` = join/speak/leave manager with
   per-bot voices (Bolt = en-US-ChristopherNeural, Pip = en-US-AriaNeural,
   RipoBot = en-US-GuyNeural), auto-leave when alone, human-join nudges.
   Wired into `events/ready.js` (watcher), `events/messageCreate.js`
   ("join vc"/"leave vc" + speak-along), `companions/chatter.js` (same for
   Bolt/Pip + spoken banter/farewells), `utils/banter.js`,
   `utils/scheduler.js`, and `commands/speak.js` (rebuilt on Edge TTS).
   `/joinvc` + `/leavevc` slash commands added. STT (hearing humans) is
   NOT implemented — voice is talk-only until a free STT path is proven.
4. **Anti-loop:** buddies must never trigger each other's fun features in a loop (e.g. Bolt's hot take must not summon Pip's defense, debates must not ping-pong forever). Keep the v5.2 rule: only RipoBot pings; companions strip pings; fun triggers fire on human messages or RipoBot-sent messages only.
5. **Rate sanity:** lurk (18%) + double-text (35%) + greetings + comfort are all per-message rolls — on a busy channel they compose. If the channel gets spammy, gate fun features behind "humans active" checks like the hangout scheduler does.
6. **Test seam:** both modules export `_setRandom(fn)` for deterministic tests. Production never calls it.
7. All new files pass `node --check`; `/tmp/v70_fun_assert.js` passes 77/77.
