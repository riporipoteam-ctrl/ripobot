# RipoBot v5.1 — Companion AI + fun commands

## Companions (Bolt & Pip) — `companions/chatter.js`
- **AI mention replies**: when a user mentions Bolt/Pip, the companion now asks the
  shared Hugging Face inference (same `HF_TOKEN` + `chatComplete` helper as the main
  bot, 20s timeout) with a per-vibe system prompt (Bolt = hyper/playful, Pip =
  chill/wholesome, max 2 sentences). Falls back to the existing template lines when
  `HF_TOKEN` is missing or the call fails/times out. Still ignores ALL bot messages
  (no bot-to-bot loops).
- **Ambient upgrades**: no longer repeats any of the last 3 ambient lines
  (in-memory tracking); 20% of the time it reacts with a vibe emoji
  (⚡🔥💯🚀 for Bolt, 🌱💧✨🫶 for Pip) to one of RipoBot's recent messages
  instead of posting text. All original guards kept (1h warmup, quiet channel,
  40% chance, 30-min loop).

## RipoBot — 5 new commands (62 → 67 total)
- `/emojify <text>` — text → 🇦🇧🇨 regional-indicator emoji letters.
- `/morse <text>` — text → Morse code.
- `/binary <text>` — text → 8-bit binary.
- `/reverse <text>` — reverses text.
- `/color <hex>` — embed swatch with RGB + integer values for a hex color.
- All offline, zero new dependencies, input length caps keep replies under limits.
- `/help` updated with the new commands.

## `/remind` rewritten
- Now takes a friendly duration string: `10m`, `2h`, `1d` (or plain minutes),
  1 minute – 7 days.
- Reminders persist to `data/reminders.json` (atomic writes) and are delivered
  by a new 60-second scheduler sweep (`maybeDeliverReminders` in
  `utils/scheduler.js`), so they survive restarts as long as `data/` does.
  (Same HF Spaces caveat as other state: `data/` is ephemeral across factory
  rebuilds.)

## Deploy notes
- `deploy-commands.js` auto-discovers `commands/` — run `node deploy-commands.js`
  to register the 67 commands.
- No Space launcher changes needed; companions pick up the new `chatter.js`
  from the GitHub tarball on next rebuild/restart.
- Zero new npm dependencies. No secrets in code.
