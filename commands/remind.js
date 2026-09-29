'use strict';

/**
 * /remind — public command. Set a one-shot reminder with a friendly
 * duration ("10m", "2h", "1d", or plain minutes).
 *
 * Reminders are stored in data/reminders.json (atomic writes) and delivered
 * by the scheduler's reminder sweep (every 60s), so they survive restarts
 * as long as the data directory does. On HF Spaces the data dir is
 * ephemeral across factory rebuilds — same caveat as levels/warns.
 */

const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder } = require('discord.js');

const DATA_DIR = path.join(__dirname, '..', 'data');
const REMINDERS_FILE = path.join(DATA_DIR, 'reminders.json');

const MIN_MS = 60 * 1000; // 1 minute
const MAX_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function blankStore() {
  return { nextId: 1, reminders: [] };
}

function loadReminders() {
  ensureDataDir();
  try {
    const parsed = JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8'));
    if (parsed && typeof parsed.nextId === 'number' && Array.isArray(parsed.reminders)) {
      return parsed;
    }
  } catch {
    // missing/corrupt → blank
  }
  return blankStore();
}

function saveReminders(store) {
  ensureDataDir();
  const tmp = `${REMINDERS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmp, REMINDERS_FILE);
}

/**
 * Parse "10m", "2h", "1d" (or a plain number = minutes) into milliseconds.
 * Returns ms, or null when invalid/out of range.
 */
function parseDuration(input) {
  const m = /^\s*(\d+)\s*([mhd])?\s*$/i.exec(input);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n < 1) return null;
  const unit = (m[2] || 'm').toLowerCase();
  const mult = unit === 'h' ? 3_600_000 : unit === 'd' ? 86_400_000 : 60_000;
  const ms = n * mult;
  if (ms < MIN_MS || ms > MAX_MS) return null;
  return ms;
}

function humanize(ms) {
  if (ms % 86_400_000 === 0) return `${ms / 86_400_000} day(s)`;
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000} hour(s)`;
  return `${Math.round(ms / 60_000)} minute(s)`;
}

async function failEphemeral(interaction, reason) {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: reason, ephemeral: true });
    } else {
      await interaction.reply({ content: reason, ephemeral: true });
    }
  } catch (err) {
    console.error('[remind] failed to send error reply:', err.message);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Set a reminder (e.g. 10m, 2h, 1d)')
    .addStringOption((o) =>
      o
        .setName('in')
        .setDescription('When: 10m, 2h, 1d (or plain minutes, max 7d)')
        .setRequired(true)
        .setMaxLength(10),
    )
    .addStringOption((o) =>
      o.setName('text').setDescription('What to remind you about').setRequired(true).setMaxLength(500),
    )
    .setDMPermission(false),

  async execute(interaction) {
    try {
      const when = interaction.options.getString('in', true);
      const text = interaction.options.getString('text', true);
      const ms = parseDuration(when);
      if (ms === null) {
        await failEphemeral(
          interaction,
          '😅 I couldn\u2019t parse that time — try `10m`, `2h`, `1d`, or a number of minutes (1 min – 7 days).',
        );
        return;
      }
      const store = loadReminders();
      const reminder = {
        id: store.nextId++,
        userId: interaction.user.id,
        channelId: interaction.channelId,
        guildId: interaction.guildId,
        text,
        dueAt: Date.now() + ms,
        createdAt: new Date().toISOString(),
      };
      store.reminders.push(reminder);
      saveReminders(store);
      await interaction.reply({
        content: `⏰ Got it — I\u2019ll remind you in ${humanize(ms)}.`,
        ephemeral: true,
      });
    } catch (err) {
      console.error('[remind] execute failed:', err.message);
      await failEphemeral(interaction, 'Something went wrong');
    }
  },

  // Shared with utils/scheduler.js (delivery sweep).
  _parseDuration: parseDuration,
  _loadReminders: loadReminders,
  _saveReminders: saveReminders,
  _REMINDERS_FILE: REMINDERS_FILE,
};
