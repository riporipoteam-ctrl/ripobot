# RipoBot v5.2 — Buddies: RipoBot knows Bolt & Pip + summon protocol

Fixes Armin's complaint (screenshot proof): when asked "Wheres your buddys",
RipoBot talked about "the Ripo Team crew" — it didn't know Bolt and Pip are
its buddies and couldn't call them into chat. Now it does.

## RipoBot knows its buddies — `events/messageCreate.js`, `utils/ai.js`
- New `BUDDIES_BLOCK` in the chat system prompt (the live path in
  `events/messageCreate.js`): Bolt (`<@1553794360829673553>`, hyper/playful)
  and Pip (`<@1553796168356593675>`, chill/wholesome) are its companion bots,
  always online in the server. When asked about buddies/friends/companions,
  the model must mention them BY NAME and PING them with `<@id>` so they join
  the chat. Never invent other buddies.
- Compact version of the same added to `SYSTEM_PROMPT` in `utils/ai.js`
  (used by `chatReply`; currently no live caller, kept in sync for safety).
- Existing prompt rules kept: never invent levels/XP/roles/channels/commands
  — buddies now included in the never-invent list.

## Companions answer the summon — `companions/chatter.js`
- Bot-message policy changed: ALL bot messages are still ignored, EXCEPT an
  explicit @-mention from RipoBot's user id (`1553742796072951898`), which is
  handled as a **summon** (`handleSummon`).
- Summon reply: AI via the existing `chatComplete` path with a new
  summon-specific system prompt ("RipoBot just called you into chat"), 20s
  timeout, template-pool fallback. Template fallbacks unchanged.
- Loop guards (all in place):
  1. `lastSummonMessageId` — never reply twice to the same summon message.
  2. Author allowlist is RipoBot's id ONLY; the other companion's id
     (`OTHER_COMPANION_ID`) is tracked explicitly and can never trigger a
     reply — Bolt and Pip never talk to each other.
  3. `stripPings()` removes `<@id>` mentions and neutralizes @everyone/@here
     in ALL AI-generated companion replies — companions never mention anyone.
  4. RipoBot's main process ignores ALL bot messages
     (`events/messageCreate.js`: `if (message.author.bot ...) return;`) —
     verified present. A summon reply can never summon RipoBot back.
     **No bot-to-bot loop is possible.**

## New commands (67 → 70 total)
- `/buddies` — embed introducing Bolt ⚡ and Pip 🌱 (name, vibe, what they're
  good for), and pings them both in the reply content so they pop into chat.
- `/pick <choices>` — random pick from `;`- or comma-separated options
  (2–20 choices, 500-char cap, ephemeral errors on bad input).
- `/mock <text>` — sPoNgEbOb-case text (500-char cap).
- NOTE: `/8ball`, `/coinflip`, `/dice` were requested as new but already
  existed from an earlier drop (verified they match the spec: `/8ball` takes
  a required question, `/coinflip` is option-free, `/dice` uses Discord-native
  validated `sides`/`count` options instead of NdM strings). Left untouched.
- `/help` updated: `/buddies`, `/pick`, `/mock` added to the 🎲 Fun group.

## Acceptance (all pass, 2026-09-27)
- `npm run check` → OK (all commands/events/utils/index/deploy syntax-clean).
- `node --check companions/chatter.js` → OK.
- 70/70 commands require-load with unique names; `buddies`/`pick`/`mock` present.
- Unit checks: `parseChoices` (semicolons, commas, empties skipped, 20-cap),
  `mockCase` (length/letters preserved, randomized, empty-safe), `stripPings`
  (mentions removed, @everyone neutralized). `/dice` and `/buddies` load.
- No new `package.json` dependencies (still 4: discord.js, @discordjs/voice,
  dotenv, libsodium-wrappers). No hardcoded tokens anywhere.

## Needs live verification (parent: after push + deploy)
1. `node deploy-commands.js` to register the 70 guild commands.
2. Space restart so companions pick up the new `chatter.js` (no launcher change needed).
3. In #🤖・ripobot-chat: ask RipoBot "where are your buddies" → expect it to
   name + ping Bolt and Pip → expect both companions to reply once each.
4. Run `/buddies` → expect the embed + both companions popping in.
5. Confirm no double-replies and no companion-to-companion chatter.
