'use strict';

/**
 * RipoBot weekly scheduler.
 *
 * startScheduler(client) ticks every 15 minutes (plus one delayed first run
 * 30 seconds after start) and does these jobs, all in Europe/Sarajevo time;
 * a separate 60-second sweep delivers due /remind reminders:
 *
 *   1. Weekly leaderboard — every Sunday at/after 12:00, posts the top-10 XP
 *      leaderboard (🥇🥈🥉 medals, plain names only, no pings) to the first
 *      channel named like "*levels*" found in any guild.
 *   2. Birthday check — once per day at/after 09:00, posts a happy-birthday
 *      message for members whose birthday is today (plain names, no pings).
 *   3. Buddy hangouts (v5.4) — RipoBot kicks off a group hangout with Bolt
 *      and Pip at ~09:00 (morning), ~14:00 (afternoon), ~19:00 (evening) and
 *      ~22:00 (night): EXACTLY ONE proactive message per period per day.
 *      Skipped when humans were active in the last 30 minutes. The kickoff
 *      carries real @-mentions, so the banter state machine takes over.
 *      (Ambient chatter was REMOVED 2026-09-28 — Armin's rule: the bots speak
 *      once per period, never more.)
 *   4. Reminder sweep (separate 60-second interval, not part of the 15-min
 *      tick) — delivers due /remind reminders from data/reminders.json.
 *
 * Anti-duplicate (2026-09-28): the state file lives on ephemeral disk, so a
 * Space restart/rebuild wipes hangoutDone and slots whose hour already passed
 * would fire AGAIN the same day. startScheduler() now marks every slot at or
 * before the current hour as done for today on boot — no retroactive
 * hangouts, ever. One slot = one hangout per day, no exceptions.
 *
 * State: data/scheduler.json — { lastWeeklyPost: "<y>-W<isoWeek>" | null,
 * lastBirthdayCheck: "<YYYY-MM-DD>" | null,
 * hangoutDone: { "<YYYY-MM-DD>-<slot>": true } }. Loads tolerantly
 * (missing/corrupt → defaults); writes are atomic (tmp + rename).
 *
 * The entire tick body is wrapped in try/catch — it logs errors and never
 * throws, so the interval can never produce an unhandled rejection.
 */

const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const levels = require('./levels');
const banter = require('./banter');
// v7.0: hangout openers are spoken aloud when RipoBot is in voice. Defensive.
let voice = null;
try {
  voice = require('./voice');
} catch (err) {
  console.error('[scheduler] voice unavailable:', err.message);
}

const DATA_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'scheduler.json');
const SCHED_TZ = 'Europe/Sarajevo';

const TICK_MS = 15 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 30 * 1000;
const WEEKLY_POST_HOUR = 12; // Sunday, >= 12:00 Sarajevo
const BIRTHDAY_CHECK_HOUR = 9; // daily, >= 09:00 Sarajevo

// Ambient chatter tuning.
const AMBIENT_MIN_UPTIME_MS = 60 * 60 * 1000; // process must be up > 60 min
const AMBIENT_COOLDOWN_MS = 3 * 60 * 60 * 1000; // >= 3 hours between posts
const AMBIENT_QUIET_MS = 2 * 60 * 60 * 1000; // channel quiet for >= 2 hours
const AMBIENT_DAILY_CAP = 3; // max 3 ambient posts per day

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * Ambient conversation starters. Posted as plain messages (no embeds, no
 * pings) into the ripobot-chat channel when it has been quiet for a while.
 * Ripo's personality: casual, playful, a little cocky, Flux Rec / Ripo Team
 * flavored. None of these may contain @everyone/@here (belt-and-suspenders
 * check in maybePostAmbient strips them anyway).
 */
const AMBIENT_LINES = [
  'anyone up for some games later? 🎮',
  "what's everyone playing this weekend?",
  'hot take: pineapple on pizza is elite 🍕',
  "Ripo's here and bored — entertain me 😤",
  "what's the best game of all time? wrong answers only",
  'if Flux Rec had a secret boss, what would it be? 👀',
  'rate your day 1-10, no context allowed',
  "who's got the funniest old Rec Room memory? spill it 😂",
  'hot take: horror games are better with friends (so you can scream together)',
  "what's one game you never get tired of?",
  "Ripo Team lore drop: what's YOUR headcanon for Flux Rec? 🌀",
  'unpopular opinion: the lobby music should be louder',
  "it's quiet in here... too quiet. someone say something 👀",
  'quick poll in the replies: cats or dogs? no middle ground',
  "what's your go-to snack while gaming? 🍿",
  'imagine Flux Rec launch day — what are you doing first? 🚀',
  'controversial: aim assist is just teamwork with your controller',
  'tell me your best clutch moment, I need stories 🎬',
  "Ripo's vibe check: how we feeling today?",
  'what game deserves a revival like ours? 🎮',
  'if you could add ANY room to Flux Rec, what would it be?',
  'hot take: the best part of gaming is the people, not the pixels',
  'someone drop a banger song recommendation 🎵',
  "what's the longest you've ever gamed in one sitting? be honest 😅",
  "Ripo Team assemble — what's the plan for tonight? 👀",
  'describe your dream dorm room in three words 🏠',
  "what game made you rage the hardest? vent here, it's safe 💀",
  'if Ripo was a boss fight, what would my weak point be? 🤖',
  'drop your funniest fail story, no clip needed 😭',
  'Flux Rec question of the day: solo grind or squad up?',
];

function blankState() {
  return {
    lastWeeklyPost: null,
    lastBirthdayCheck: null,
    lastAmbientAt: null,
    ambientDate: null,
    ambientCount: 0,
    hangoutDone: {}, // "<YYYY-MM-DD>-<slot>" -> true; one hangout per slot per day
  };
}

/**
 * Tolerant state load — missing or corrupt file returns defaults.
 *
 * @returns {{ lastWeeklyPost: string|null, lastBirthdayCheck: string|null, lastAmbientAt: number|null, ambientDate: string|null, ambientCount: number }}
 */
function loadState() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return {
        lastWeeklyPost:
          typeof parsed.lastWeeklyPost === 'string' ? parsed.lastWeeklyPost : null,
        lastBirthdayCheck:
          typeof parsed.lastBirthdayCheck === 'string' ? parsed.lastBirthdayCheck : null,
        lastAmbientAt:
          typeof parsed.lastAmbientAt === 'number' && Number.isFinite(parsed.lastAmbientAt)
            ? parsed.lastAmbientAt
            : null,
        ambientDate: typeof parsed.ambientDate === 'string' ? parsed.ambientDate : null,
        ambientCount:
          typeof parsed.ambientCount === 'number' && Number.isFinite(parsed.ambientCount)
            ? Math.max(0, Math.floor(parsed.ambientCount))
            : 0,
        hangoutDone:
          parsed.hangoutDone && typeof parsed.hangoutDone === 'object' && !Array.isArray(parsed.hangoutDone)
            ? parsed.hangoutDone
            : {},
      };
    }
    return blankState();
  } catch {
    return blankState();
  }
}

/**
 * Atomic state save: write temp file, then rename over the real one.
 *
 * @param {{ lastWeeklyPost: string|null, lastBirthdayCheck: string|null, lastAmbientAt: number|null, ambientDate: string|null, ambientCount: number }} state
 */
function saveState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${STATE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, STATE_FILE);
}

/**
 * Current date/time parts in Europe/Sarajevo.
 * NOTE: en-CA formatting can render midnight as hour "24" — normalized to 0.
 *
 * @returns {{ year: number, month: number, day: number, hour: number }}
 */
function sarajevoNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: SCHED_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
  };
}

/**
 * ISO-8601 week number for a calendar date (1-53), standard algorithm:
 * the week containing the Thursday determines the week number.
 *
 * @param {number} y full year
 * @param {number} m month 1-12
 * @param {number} d day of month
 * @returns {number}
 */
function isoWeek(y, m, d) {
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // shift to Thursday
  const thursdayYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(thursdayYear, 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((date - firstThursday) / (7 * 24 * 3600 * 1000));
}

/**
 * Pad a number to two digits.
 *
 * @param {number} n
 * @returns {string}
 */
function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Strip @everyone / @here so a display name can never ping anyone.
 *
 * @param {string} name
 * @returns {string}
 */
function safeName(name) {
  return String(name ?? 'Someone')
    .replace(/@everyone/gi, '')
    .replace(/@here/gi, '')
    .trim() || 'Someone';
}

/**
 * Resolve a plain (non-pinging) display name for a user id.
 *
 * @param {{ users: { fetch: (id: string) => Promise<{ username?: string, displayName?: string }> } }} client
 * @param {string} userId
 * @returns {Promise<string>}
 */
async function resolveName(client, userId) {
  try {
    const user = await client.users.fetch(userId);
    if (user && (user.displayName || user.username)) {
      return safeName(user.displayName || user.username);
    }
  } catch {
    // left the guild / deleted account — fall through to "Someone"
  }
  return 'Someone';
}

/**
 * Find the first text channel (not a thread) whose name contains "levels",
 * scanning every guild the client is in. Returns null when none exists.
 *
 * @param {{ guilds: { cache: Map<string, { channels: { cache: Map<string, unknown> } }> } }} client
 * @returns {import('discord.js').TextChannel|null}
 */
function findLevelsChannel(client) {
  try {
    for (const guild of client.guilds.cache.values()) {
      const channel = guild.channels.cache.find(
        (c) =>
          c &&
          typeof c.name === 'string' &&
          c.name.toLowerCase().includes('levels') &&
          typeof c.isTextBased === 'function' &&
          c.isTextBased() &&
          typeof c.isThread === 'function' &&
          !c.isThread(),
      );
      if (channel) return channel;
    }
  } catch (err) {
    console.error('[scheduler] findLevelsChannel failed:', err.message);
  }
  return null;
}

/**
 * Build the weekly leaderboard embed: top 10 by XP, medals for the top 3,
 * plain display names only (no pings).
 *
 * @param {{ users: unknown }} client
 * @returns {Promise<import('discord.js').EmbedBuilder|null>} null when nobody has XP yet
 */
async function buildWeeklyEmbed(client) {
  const top = levels.getTop(10);
  if (top.length === 0) return null;

  const lines = [];
  for (let i = 0; i < top.length; i++) {
    const [userId, rec] = top[i];
    const name = await resolveName(client, userId);
    const medal = MEDALS[i] ?? `${i + 1}.`;
    lines.push(`${medal} ${name} — Level ${rec.level} (${rec.xp} XP)`);
  }

  return new EmbedBuilder()
    .setColor(0xf7b731)
    .setTitle('🏆 Weekly XP Leaderboard')
    .setDescription(lines.join('\n'));
}

/**
 * Sunday at/after 12:00 Sarajevo: post the weekly leaderboard once per
 * ISO week, then stamp lastWeeklyPost.
 *
 * @param {{ users: unknown, guilds: unknown }} client
 * @param {{ year: number, month: number, day: number, hour: number }} now
 * @param {{ lastWeeklyPost: string|null, lastBirthdayCheck: string|null, lastAmbientAt: number|null, ambientDate: string|null, ambientCount: number }} state
 */
async function maybePostWeekly(client, now, state) {
  const isSunday = new Date(Date.UTC(now.year, now.month - 1, now.day)).getUTCDay() === 0;
  if (!isSunday || now.hour < WEEKLY_POST_HOUR) return;

  const weekKey = `${now.year}-W${isoWeek(now.year, now.month, now.day)}`;
  if (state.lastWeeklyPost === weekKey) return;

  const channel = findLevelsChannel(client);
  if (!channel) {
    console.error('[scheduler] weekly: no levels channel found');
    state.lastWeeklyPost = weekKey; // don't retry every tick for a missing channel
    saveState(state);
    return;
  }

  try {
    const embed = await buildWeeklyEmbed(client);
    if (!embed) {
      console.log('[scheduler] weekly: nobody has XP yet, skipping post');
    } else {
      await channel.send({ embeds: [embed] });
      console.log(`[scheduler] weekly leaderboard posted for ${weekKey}`);
    }
    state.lastWeeklyPost = weekKey;
    saveState(state);
  } catch (err) {
    console.error('[scheduler] weekly post failed:', err.message);
  }
}

/**
 * Load the birthday store: { "<userId>": { month, day } }.
 * Missing/corrupt → {}.
 *
 * @returns {Object.<string, { month: number, day: number }>}
 */
function loadBirthdays() {
  try {
    const file = path.join(DATA_DIR, 'birthdays.json');
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    return {};
  } catch {
    return {};
  }
}

/**
 * Once per day at/after 09:00 Sarajevo: post a birthday greeting if anyone's
 * birthday is today. Always stamps lastBirthdayCheck so this runs once a day.
 *
 * @param {{ users: unknown, guilds: unknown }} client
 * @param {{ year: number, month: number, day: number, hour: number }} now
 * @param {{ lastWeeklyPost: string|null, lastBirthdayCheck: string|null, lastAmbientAt: number|null, ambientDate: string|null, ambientCount: number }} state
 */
async function maybeCheckBirthdays(client, now, state) {
  const todayKey = `${now.year}-${pad2(now.month)}-${pad2(now.day)}`;
  if (now.hour < BIRTHDAY_CHECK_HOUR || state.lastBirthdayCheck === todayKey) return;

  try {
    const birthdays = loadBirthdays();
    const celebrants = [];
    for (const [userId, entry] of Object.entries(birthdays)) {
      if (entry && entry.month === now.month && entry.day === now.day) {
        celebrants.push(await resolveName(client, userId));
      }
    }

    if (celebrants.length > 0) {
      const channel = findLevelsChannel(client);
      if (channel) {
        try {
          await channel.send(
            `🎂 Happy birthday, ${celebrants.join(', ')}! Hope you have an amazing day! 🥳`,
          );
          console.log(`[scheduler] birthday greeting posted for ${todayKey}: ${celebrants.length} celebrant(s)`);
        } catch (err) {
          console.error('[scheduler] birthday post failed:', err.message);
        }
      } else {
        console.error('[scheduler] birthday: no levels channel found');
      }
    }
  } catch (err) {
    console.error('[scheduler] birthday check failed:', err.message);
  }

  state.lastBirthdayCheck = todayKey; // once per day, even with no birthdays
  saveState(state);
}

/**
 * Find the ripobot-chat channel: prefers process.env.RIPOBOT_CHAT_CHANNEL_ID
 * (via fetch, with a cache fallback), otherwise the first text channel
 * (not a thread) whose name includes "ripobot-chat" in any guild.
 * Returns null when none resolves.
 *
 * @param {{ channels: { fetch: (id: string) => Promise<unknown>, cache: Map<string, unknown> }, guilds: { cache: Map<string, { channels: { cache: Map<string, unknown> } }> } }} client
 * @returns {Promise<import('discord.js').TextChannel|null>}
 */
async function findRipobotChatChannel(client) {
  try {
    const configuredId = process.env.RIPOBOT_CHAT_CHANNEL_ID;
    if (configuredId) {
      let channel = null;
      try {
        channel = await client.channels.fetch(configuredId);
      } catch {
        channel = client.channels.cache.get(configuredId) || null;
      }
      if (channel) return channel;
      // configured id didn't resolve — fall through to the name scan
    }
    for (const guild of client.guilds.cache.values()) {
      const channel = guild.channels.cache.find(
        (c) =>
          c &&
          typeof c.name === 'string' &&
          c.name.toLowerCase().includes('ripobot-chat') &&
          typeof c.isTextBased === 'function' &&
          c.isTextBased() &&
          typeof c.isThread === 'function' &&
          !c.isThread(),
      );
      if (channel) return channel;
    }
  } catch (err) {
    console.error('[scheduler] findRipobotChatChannel failed:', err.message);
  }
  return null;
}

/**
 * Strip @everyone/@here so an ambient line can never ping anyone.
 *
 * @param {string} text
 * @returns {string}
 */
function noPings(text) {
  return String(text ?? '')
    .replace(/@everyone/gi, '')
    .replace(/@here/gi, '')
    .trim();
}

/**
 * Ambient chatter job: post a conversation starter when ALL of these hold —
 * (a) the process has been up > 60 min (the 30s first-run-after-boot never
 *     qualifies) AND it has been >= 3 hours since the last ambient post,
 * (b) fewer than 3 ambient posts have gone out today (Sarajevo date),
 * (c) the ripobot-chat channel had zero messages in the last 2 hours,
 * (d) a 50% coin flip lands.
 * Posts as a plain message with mentions disabled. All failures are caught
 * here so they can never break the other jobs or throw out of tick().
 *
 * @param {{ channels: unknown, guilds: unknown }} client
 * @param {{ year: number, month: number, day: number, hour: number }} now
 * @param {{ lastWeeklyPost: string|null, lastBirthdayCheck: string|null, lastAmbientAt: number|null, ambientDate: string|null, ambientCount: number }} state
 */
async function maybePostAmbient(client, now, state) {
  try {
    // Gate (a), part 1: the delayed first run after boot must not post.
    if (process.uptime() * 1000 < AMBIENT_MIN_UPTIME_MS) return;

    // Gate (b): daily cap resets on a new Sarajevo date.
    const todayKey = `${now.year}-${pad2(now.month)}-${pad2(now.day)}`;
    if (state.ambientDate !== todayKey) {
      state.ambientDate = todayKey;
      state.ambientCount = 0;
      saveState(state);
    }
    if (state.ambientCount >= AMBIENT_DAILY_CAP) return;

    // Gate (a), part 2: at least 3 hours since the last ambient post.
    if (
      state.lastAmbientAt != null &&
      Date.now() - state.lastAmbientAt < AMBIENT_COOLDOWN_MS
    ) {
      return;
    }

    // Gate (d): 50% chance on any qualifying tick.
    if (Math.random() >= 0.5) return;

    // Gate (c): the channel must be quiet for the last 2 hours.
    const channel = await findRipobotChatChannel(client);
    if (!channel) {
      console.log('[scheduler] ambient: no ripobot-chat channel found, skipping');
      return;
    }
    let quiet;
    try {
      const msgs = await channel.messages.fetch({ limit: 10 });
      quiet = msgs.every((m) => Date.now() - m.createdTimestamp > AMBIENT_QUIET_MS);
    } catch (err) {
      // fetch failure → treat as "not quiet", skip
      console.log('[scheduler] ambient: message fetch failed, skipping:', err.message);
      return;
    }
    if (!quiet) return;

    const line = AMBIENT_LINES[Math.floor(Math.random() * AMBIENT_LINES.length)];
    await channel.send({ content: noPings(line), allowedMentions: { parse: [] } });
    console.log(`[scheduler] ambient posted (${state.ambientCount + 1}/${AMBIENT_DAILY_CAP} today)`);

    state.lastAmbientAt = Date.now();
    state.ambientCount += 1;
    saveState(state);
  } catch (err) {
    console.error('[scheduler] ambient failed:', err.message);
  }
}

/**
 * Reminder sweep (new in v5.1): deliver due /remind reminders.
 * Reads data/reminders.json (written by commands/remind.js), sends each due
 * reminder as a plain channel message mentioning the user, then removes it.
 * Atomic writes; never throws.
 *
 * @param {import('discord.js').Client} client
 */
async function maybeDeliverReminders(client) {
  let loadReminders;
  let saveReminders;
  try {
    // Lazy require avoids a hard dependency cycle at module load.
    ({ _loadReminders: loadReminders, _saveReminders: saveReminders } = require('../commands/remind'));
  } catch (err) {
    console.error('[scheduler] reminders: could not load remind module:', err.message);
    return;
  }
  try {
    const store = loadReminders();
    if (!store.reminders.length) return;
    const now = Date.now();
    const due = store.reminders.filter((r) => r && typeof r.dueAt === 'number' && r.dueAt <= now);
    if (!due.length) return;
    const dueIds = new Set(due.map((r) => r.id));
    for (const r of due) {
      try {
        const channel = await client.channels.fetch(r.channelId);
        if (channel && channel.isTextBased()) {
          await channel.send({
            content: `⏰ <@${r.userId}> reminder: ${r.text}`,
            allowedMentions: { users: [r.userId] },
          });
        }
      } catch (err) {
        console.error('[scheduler] reminder delivery failed:', err.message);
      }
    }
    store.reminders = store.reminders.filter((r) => !dueIds.has(r.id));
    saveReminders(store);
  } catch (err) {
    console.error('[scheduler] reminders sweep failed:', err.message);
  }
}

const REMINDER_SWEEP_MS = 60 * 1000; // deliver reminders every minute

// ---------------------------------------------------------------------------
// v5.4 — daily buddy hangouts: RipoBot kicks off a group hangout with Bolt
// and Pip four times a day (Europe/Sarajevo). The kickoff carries real
// @-mentions, so the companions get summoned and the normal banter state
// machine (pacing → goodbye ritual) takes over automatically.
//
// Guards: one hangout per slot per Sarajevo date (persisted in
// scheduler.json), skipped when a human posted in the channel in the last
// 30 minutes (never interrupt real humans), skipped when a banter session is
// already live (never stack hangouts). Fetch failure fails closed (skip).
// ---------------------------------------------------------------------------

const HANGOUT_SLOTS = [
  { key: 'morning', hour: 9 },
  { key: 'afternoon', hour: 14 },
  { key: 'evening', hour: 19 },
  { key: 'night', hour: 22 },
];

const HANGOUT_HUMAN_QUIET_MS = 30 * 60 * 1000;

function hangoutDateKey(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Drop hangoutDone entries older than yesterday (state hygiene). */
function pruneHangoutDone(state, now) {
  try {
    const today = hangoutDateKey(now.year, now.month, now.day);
    const yest = new Date(Date.UTC(now.year, now.month - 1, now.day) - 24 * 60 * 60 * 1000);
    const yesterday = hangoutDateKey(yest.getUTCFullYear(), yest.getUTCMonth() + 1, yest.getUTCDate());
    for (const key of Object.keys(state.hangoutDone || {})) {
      if (!key.startsWith(today) && !key.startsWith(yesterday)) delete state.hangoutDone[key];
    }
  } catch {
    /* hygiene only */
  }
}

/**
 * True when a non-bot human posted in the channel within the last `ms`.
 * Fetch failure fails CLOSED (returns true → hangout skipped).
 */
async function humanActiveRecently(channel, ms = HANGOUT_HUMAN_QUIET_MS) {
  try {
    const msgs = await channel.messages.fetch({ limit: 10 });
    const cutoff = Date.now() - ms;
    for (const m of msgs.values()) {
      if (!m.author?.bot && m.createdTimestamp >= cutoff) return true;
    }
    return false;
  } catch (err) {
    console.error('[scheduler] human-activity check failed (fail closed):', err.message);
    return true;
  }
}

async function attemptHangout(client, slot, key, state) {
  const markDone = () => {
    state.hangoutDone[key] = true;
    try {
      saveState(state);
    } catch (err) {
      console.error('[scheduler] hangout state save failed:', err.message);
    }
  };
  const channel = await findRipobotChatChannel(client);
  if (!channel) {
    console.log(`[scheduler] hangout ${slot.key}: no chat channel found`);
    markDone();
    return;
  }
  if (banter.getLiveSession(channel.id)) {
    console.log(`[scheduler] hangout ${slot.key}: banter session already live — skipping`);
    markDone();
    return;
  }
  if (await humanActiveRecently(channel)) {
    console.log(`[scheduler] hangout ${slot.key}: humans active in the last 30 min — skipping`);
    markDone();
    return;
  }
  try {
    const opener = await banter.composeHangoutOpener(slot.key);
    await channel.send(opener); // real @-mentions: companions get summoned, session starts
    // v7.0: speak the opener too (cleanForSpeech drops the pings/markers).
    if (voice) voice.speakIfConnected(opener, 'ripobot').catch(() => {});
    console.log(`[scheduler] hangout ${slot.key} kicked off in #${channel.id}`);
  } catch (err) {
    console.error(`[scheduler] hangout ${slot.key} send failed:`, err.message);
  }
  markDone();
}

/**
 * One hangout attempt per tick, at most: the first due, not-yet-done slot.
 * Never throws.
 */
async function maybeDoHangout(client, now, state) {
  try {
    if (!state.hangoutDone || typeof state.hangoutDone !== 'object') state.hangoutDone = {};
    pruneHangoutDone(state, now);
    const today = hangoutDateKey(now.year, now.month, now.day);
    for (const slot of HANGOUT_SLOTS) {
      if (now.hour < slot.hour) break; // slots are ascending; nothing else is due
      const key = `${today}-${slot.key}`;
      if (state.hangoutDone[key]) continue;
      await attemptHangout(client, slot, key, state);
      break; // one attempt per tick
    }
  } catch (err) {
    console.error('[scheduler] hangout job failed:', err.message);
  }
}

/**
 * One scheduler tick: run all jobs. Never throws.
 *
 * @param {import('discord.js').Client} client
 */
async function tick(client) {
  try {
    const now = sarajevoNow();
    const state = loadState();
    await maybePostWeekly(client, now, state);
    await maybeCheckBirthdays(client, now, state);
    await maybeDoHangout(client, now, state);
  } catch (err) {
    console.error('[scheduler] tick failed:', err.message);
  }
}

/**
 * Start the weekly scheduler: every 15 minutes, plus one delayed first run
 * 30 seconds after start. Reminder sweep runs every 60 seconds. Safe to
 * call once at ready.
 *
 * Anti-duplicate: the state file is on ephemeral disk, so after a
 * restart/rebuild hangoutDone is empty and slots whose hour already passed
 * today would fire a second time. Mark them done on boot instead — the bots
 * speak once per period per day, never retroactively.
 *
 * @param {import('discord.js').Client} client
 * @returns {NodeJS.Timeout} the interval handle (clear it to stop)
 */
function startScheduler(client) {
  try {
    const now = sarajevoNow();
    const state = loadState();
    if (!state.hangoutDone || typeof state.hangoutDone !== 'object') state.hangoutDone = {};
    const today = hangoutDateKey(now.year, now.month, now.day);
    let marked = 0;
    for (const slot of HANGOUT_SLOTS) {
      if (slot.hour <= now.hour) {
        const key = `${today}-${slot.key}`;
        if (!state.hangoutDone[key]) {
          state.hangoutDone[key] = true;
          marked += 1;
        }
      }
    }
    if (marked > 0) {
      saveState(state);
      console.log(`[scheduler] boot: marked ${marked} already-passed slot(s) done for ${today} (no retroactive hangouts)`);
    }
  } catch (err) {
    console.error('[scheduler] boot dedup failed (non-fatal):', err.message);
  }
  const run = () => {
    tick(client).catch((err) => {
      // belt-and-suspenders: tick already catches everything internally
      console.error('[scheduler] unexpected tick rejection:', err && err.message);
    });
  };
  const sweep = () => {
    maybeDeliverReminders(client).catch((err) => {
      console.error('[scheduler] unexpected reminder sweep rejection:', err && err.message);
    });
  };
  const interval = setInterval(run, TICK_MS);
  const reminderInterval = setInterval(sweep, REMINDER_SWEEP_MS);
  setTimeout(run, FIRST_RUN_DELAY_MS);
  setTimeout(sweep, FIRST_RUN_DELAY_MS);
  console.log('[scheduler] started (15-min ticks + 60s reminder sweep, first run in 30s)');
  return interval;
}

module.exports = {
  startScheduler,
  // Exported for tests.
  _isoWeek: isoWeek,
  _sarajevoNow: sarajevoNow,
  _safeName: safeName,
  _blankState: blankState,
  _loadState: loadState,
  _saveState: saveState,
  _ambientLines: AMBIENT_LINES,
  _maybePostAmbient: maybePostAmbient,
  _maybeDoHangout: maybeDoHangout,
  _HANGOUT_SLOTS: HANGOUT_SLOTS,
  _findRipobotChatChannel: findRipobotChatChannel,
  _maybeDeliverReminders: maybeDeliverReminders,
  _tick: tick,
};
