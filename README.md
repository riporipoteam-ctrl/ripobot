# 🤖 Ripo Bot

Custom Discord bot for the **Ripo Team** server — moderation slash commands, styled
announcements, server/user info cards, 24/7 AI chat powered by Hugging Face,
fun commands, image generation, voice TTS, per-user memory, and natural-language
owner commands.

Built with `discord.js` v14 on Node 20+. Voice uses `@discordjs/voice` +
`@discordjs/opus` + `libsodium-wrappers` (best-effort: if the native modules
can't load on a host, voice degrades gracefully and everything else keeps working).
No database — warnings and memory persist in local JSON files.

---

## 1. Create the Discord application

1. Go to <https://discord.com/developers/applications> → **New Application** → name it (e.g. `Ripo Bot`).
2. **General Information** → copy the **Application ID** → this is `CLIENT_ID`.
3. **Bot** → **Reset Token** → copy the token → this is `DISCORD_TOKEN`. Keep it secret.
4. **Bot** → enable these **Privileged Gateway Intents**:
   - ✅ **Server Members Intent** — needed for `/ban`, `/kick`, `/timeout`, `/userinfo`
     and role-hierarchy safety checks.
   - ✅ **Message Content Intent** — needed so the bot can read the text of
     messages that mention it or reply to it (AI chat).

## 2. Invite the bot to your server

In the Developer Portal → **OAuth2 → URL Generator**:

- Scopes: ✅ `bot`, ✅ `applications.commands`
- Bot permissions: **Administrator** is simplest, or pick exactly:
  `Ban Members`, `Kick Members`, `Moderate Members`, `Manage Messages`,
  `Send Messages`, `Embed Links`, `Read Message History`, `Mention Everyone`,
  `View Channels`, `Timeout Members`.

Open the generated URL, pick your server, authorize.

> ⚠️ Make sure the bot's role sits **above** the roles of anyone it should
> moderate (Server Settings → Roles — drag it up). The bot refuses to act on
> anyone whose highest role is equal to or above its own.

Get your server ID (`GUILD_ID`): enable Developer Mode
(User Settings → Advanced), right-click the server name → **Copy Server ID**.

## 3. Configure

```bash
cd ~/workspace/ripo-bot
cp .env.example .env
# edit .env and fill in DISCORD_TOKEN, CLIENT_ID, GUILD_ID
# optional: HF_TOKEN + HF_MODEL for AI chat
npm install
```

## 4. Deploy the slash commands

```bash
node deploy-commands.js
```

This registers all 23 commands as **guild commands** (they appear instantly,
no hour-long wait like global commands).

> ⚠️ Re-run this after every update that adds or changes commands —
> the hosted bot only runs `node index.js`, it does not re-deploy commands itself.

## 5. Run

```bash
node index.js
```

For 24/7 hosting, run it under a process manager, e.g.:

```bash
npm i -g pm2   # once
pm2 start index.js --name ripo-bot
pm2 save
```

---

## Commands

### 🛡️ Moderation

| Command | Permission | What it does |
|---|---|---|
| `/ban <user> [reason] [delete_days]` | Ban Members | Ban, optionally delete 0–7 days of messages |
| `/kick <user> [reason]` | Kick Members | Kick |
| `/warn <user> <reason>` | Kick Members | Stored warn + DM to the user |
| `/warnings <user>` | Kick Members | List warns with IDs/dates/reasons |
| `/unwarn <user> <warn_id>` | Kick Members | Remove one warn |
| `/timeout <user> <minutes> [reason]` | Moderate Members | Time out (max 28 days) |
| `/untimeout <user>` | Moderate Members | Remove timeout |
| `/clear <amount> [user]` | Manage Messages | Delete 1–100 messages (handles 14-day API limit) |

### 📢 Owner

| Command | Permission | What it does |
|---|---|---|
| `/announce <channel> <title> <message> [ping_role]` | 👑 Owner / 🛡️ Co-Owner roles | Styled embed announcement |

### 🎲 Fun

| Command | What it does |
|---|---|
| `/8ball <question>` | Magic 8-ball answer |
| `/coinflip` | Heads or tails |
| `/dice [sides] [count]` | Roll dice (e.g. 2d20) |
| `/rps <rock\|paper\|scissors>` | Rock-paper-scissors vs the bot |
| `/poll <question> <option1> <option2> [option3] [option4]` | Reaction poll |

### 🛠️ Utility

| Command | What it does |
|---|---|
| `/avatar [user]` | Show a user's avatar large |
| `/remind <minutes> <text>` | Reminder in 1 min – 7 days (doesn't survive a bot restart) |
| `/translate <text> [to]` | Translate text (default: Spanish), via the HF chat model |
| `/userinfo [user]` | Avatar, join dates, roles |
| `/serverinfo` | Member/channel counts, creation date |
| `/help` | Grouped command list |

### 🤖 AI

| Command | What it does |
|---|---|
| `/ask <question>` | Longer AI answer (up to ~600 tokens), chunked |
| `/imagine <prompt>` | Text-to-image (FLUX.1-schnell via Hugging Face) |

### 🔊 Voice

| Command | Permission | What it does |
|---|---|---|
| `/speak <text>` | 👑 Owner / 🛡️ Co-Owner roles | Join your voice channel, speak the text (HF TTS), leave |

### Safety rules (every moderation command)

- The person using the command must have the required Discord permission.
- The bot must have it too.
- The bot **never** acts on: the server owner, itself, or the person invoking.
- Role hierarchy is enforced on **both** sides: the target's highest role must
  be strictly below the invoker's *and* the bot's highest role.
- Failures reply with a clear ephemeral error — the bot never crashes on bad input.

## 💬 AI chat

- Mention the bot (`@Ripo Bot …`) or **reply to one of its messages** and it answers.
- There is also a dedicated **ripobot** chat channel (channel name contains
  `ripobot`, or set `RIPOBOT_CHAT_CHANNEL_ID` in `.env`) — the bot replies to
  **every** message there conversationally.
- Backend: Hugging Face Inference API (`HF_TOKEN`, `HF_MODEL` in `.env`,
  default `meta-llama/Llama-3.1-8B-Instruct`).
- Keeps the last 10 messages of context per user (in-memory, capped at 500 users).
- No `HF_TOKEN`? The bot logs a warning at startup and politely says chat isn't
  configured — every other feature keeps working.

## 🧠 Memory

In the ripobot channel (or when mentioning the bot elsewhere):

- `remember that …` — save a fact about yourself (up to 50 facts).
- `what do you remember about me` — list your saved facts.
- `forget …` — remove facts containing a phrase.
- `forget everything about me` — wipe your whole entry.

Saved facts are injected into the chat prompt, and the last 12 chat turns per
user are kept too, so the bot actually remembers you between conversations.

## 🗣️ Natural-language owner commands

👑 Owner / 🛡️ Co-Owner can skip the slash syntax and just *type* in the
ripobot channel or any staff/owner-category channel:

- `announce in #announcements: server update tomorrow`
- `warn @user for spamming`
- `timeout @user 30 for caps`
- `poll "best game?" Apex / Valorant / Fortnite`
- `speak hello everyone` (joins your voice channel)

The message is parsed by the AI into a strict intent (`announce|warn|timeout|poll|speak|none`).
Ban/kick/clear are **never** available this way. On success the bot confirms;
when unsure it stays silent. The role check happens before the AI is ever called.

## 🔊 Voice (`/speak`)

Joins your current voice channel, speaks the text with Hugging Face TTS
(`espnet/kan-bayashi_ljspeech_vits`), then leaves. The WAV is decoded to PCM
in pure JS (no ffmpeg) and played via `@discordjs/voice`. Best-effort: if the
native voice modules can't load on the host, the command replies
"🔇 Voice isn't available on this host." and everything else works fine.

## 📁 Project layout

```
ripo-bot/
├── index.js            # client, intents, command/event loading
├── deploy-commands.js  # registers slash commands via Discord REST API
├── commands/           # one file per slash command (23)
├── events/             # ready, interactionCreate, messageCreate
├── utils/
│   ├── permissions.js  # mod safety checks (perms + role hierarchy)
│   ├── storage.js      # atomic JSON warn storage
│   ├── ai.js           # HF chat, ask, translate, intent parsing
│   ├── memory.js       # per-user long-term memory (data/memory.json)
│   └── nl.js           # natural-language owner commands
├── data/
│   ├── warns.json      # created automatically at runtime
│   └── memory.json     # created automatically at runtime
├── .env.example
└── package.json
```

## Notes

- Warnings live in `data/warns.json`, memory in `data/memory.json` (both created
  on first use). Back them up if you care about the history — they're plain files.
- ⚠️ The hosted Hugging Face Space container disk is **ephemeral**: warns and
  memory persist as long as the container runs (it is kept awake by a keepalive),
  but a rebuild/restart of the Space resets them.
- AI replies are chunked to Discord's 2000-character limit.
- No tokens are ever logged. Never commit `.env`.
