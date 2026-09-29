# RipoBot v7.0 — "Alive" (neural voice + human realism + fun)

Shipped 2026-09-27. Commit `de684bd` on `riporipoteam-ctrl/ripobot` main.

## Voice (all free, keyless, zero-spend)

- `utils/edgetts.js` — Microsoft Edge read-aloud neural TTS via a custom
  tolerant WebSocket client (Node's strict `ws` rejected MS's
  `Connection: close` upgrade response). Pipeline: SSML → MP3 →
  `mpg123-decoder` → resample 48 kHz → 20 ms Discord Opus packets via
  pure-JS `opusscript`. No native opus, no ffmpeg, no API key.
- Distinct voices, proven live 2026-09-27: Bolt = en-US-ChristopherNeural
  (229 packets), Pip = en-US-AriaNeural (266 packets), RipoBot =
  en-US-GuyNeural (144 packets). Opus decoded back to non-silent PCM.
- `utils/voice.js` — join/speak/leave manager: Connect/Speak permission
  checks, 20 ms-paced Opus streaming, queue limits, auto-leave after 60 s
  alone (with a spoken goodbye in the bot's own voice), human-join nudges
  in #ripobot-chat, `selfDeaf: false`.
- `/joinvc`, `/leavevc` slash commands; NL "join vc"/"leave vc" works for
  all three bots.
- Speak-along: every text reply is also spoken in VC when connected
  (RipoBot chat/banter/farewells/scheduled openers; Bolt/Pip mentions,
  summons, shares, goodbyes). Threads are never narrated in a public VC.
- `/speak` rebuilt on Edge TTS: WAV attachment primary, live voice
  secondary; `voiceAvailable()` now reflects the real TTS pipeline state.
- NOT done: hearing humans (STT). No free no-card STT path was found;
  voice is talk-only until one is proven. Never claim listening.

## Realism (utils/realism.js)

- Truly invisible marker protocol (utils/markers.js): U+FEFF/U+200B/U+200C/
  U+200D encoding — no more `[[...]]` leaks in chat.
- Farewell race fixes (re-check session after AI gen + after pause).
- Vision-off honesty: captions describe details only after successful
  vision; failures forbid inventing people/animals/objects.
- Double-texting (35% of long messages split, 2–4 s typing gap).
- Lurking (18%: react-only instead of replying).
- Once-daily morning/night greetings (Europe/Sarajevo).
- Nicknames ("call me X"), persistent in data/nicknames.json.
- Pip comfort mode: feelings.js `vulnerable` flag → kind reply, once per
  conversation. Bolt never comforts (voice break).
- BACK lines after 30+ min silence; varied AI reply lengths; explicit
  Bolt he/him / Pip she/her pronouns; vibe emojis.

## Fun (utils/fun.js)

- Roast battles: explicit "roast me" only, Bolt roasts (3/hour/user cap),
  Pip defends cross-process via data/roast_pending.json (15 s poll).
- Story mode: "story time"/"end story", file-based cross-process story;
  RipoBot opens, buddies add one sentence via handleSummon, humans add
  sentences (📖 react, no AI chat while active); banter sessions suspended
  during stories.
- Debate topics in hangouts (rare, once per session, sides assigned).
- WYR/trivia mini-games in hangouts (trivia answer revealed after 2 min).
- Bolt's daily hot take (once/day after 12:00 Sarajevo, file guard).

## Deploy notes

- Deps added: `mpg123-decoder`, `opusscript` (both pure JS, no install
  scripts — Space `npm ci` safe). `@discordjs/opus` stays optional.
- 72 guild slash commands registered.
- Space factory rebuild required to go live (bot tarball pulls GitHub main).
