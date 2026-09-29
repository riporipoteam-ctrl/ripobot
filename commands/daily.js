'use strict';

/**
 * /daily — claim your daily XP reward: +100 XP every day.
 * Consecutive days build a streak (persisted in data/daily.json), worth a
 * streak bonus of min(streak, 10) * 25 XP, awarded as a second awardXP call
 * so level-ups from either grant are reported.
 *
 * Date keys are computed in the Europe/Sarajevo timezone as "YYYY-MM-DD".
 * Writes are atomic (tmp file + rename). Everything is wrapped in try/catch
 * so the command never crashes the user.
 */

const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder } = require('discord.js');
const { awardXP } = require('../utils/levels');

const DATA_DIR = process.env.LEVELS_DATA_DIR || path.join(__dirname, '..', 'data');
const DAILY_FILE = path.join(DATA_DIR, 'daily.json');

const BASE_XP = 100;
const STREAK_BONUS_PER_DAY = 25;
const STREAK_BONUS_CAP_DAYS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

const sarajevoDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Sarajevo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** "YYYY-MM-DD" for a Date (or now) in Europe/Sarajevo time. */
function dayKey(date = new Date()) {
  return sarajevoDay.format(date);
}

/** Load the daily store; blank on missing/corrupt file. */
function loadStore() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const raw = fs.readFileSync(DAILY_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // missing or corrupt → start fresh
  }
  return {};
}

/** Save the daily store atomically (tmp file + rename). */
function saveStore(store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DAILY_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmp, DAILY_FILE);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily XP reward and build a streak')
    .setDMPermission(false),

  async execute(interaction) {
    const today = dayKey();
    const yesterday = dayKey(new Date(Date.now() - DAY_MS));

    let replyText;
    try {
      const store = loadStore();
      const rec = store[interaction.user.id];

      if (rec && rec.lastClaim === today) {
        await interaction.reply({
          content: "You've already claimed today — come back tomorrow! 🎁",
          ephemeral: true,
        });
        return;
      }

      const streak = rec && rec.lastClaim === yesterday ? (rec.streak ?? 0) + 1 : 1;
      const bonus = Math.min(streak, STREAK_BONUS_CAP_DAYS) * STREAK_BONUS_PER_DAY;

      const base = awardXP(interaction.user.id, BASE_XP);
      let bonusResult = null;
      if (bonus > 0) {
        bonusResult = awardXP(interaction.user.id, bonus);
      }

      store[interaction.user.id] = { streak, lastClaim: today };
      saveStore(store);

      const leveledUp =
        (base && base.leveledUp) || (bonusResult && bonusResult.leveledUp);
      const level = (bonusResult && bonusResult.level) ?? (base && base.level);

      replyText =
        `🎁 Daily claimed! **+${BASE_XP} XP** ` +
        `(+${bonus} streak bonus 🔥 ${streak}-day streak)`;
      if (leveledUp && typeof level === 'number') {
        replyText += `\nLevel up! You're now level ${level} 🎉`;
      }

      await interaction.reply({ content: replyText });
    } catch (err) {
      console.error('[daily] claim failed:', err.message);
      try {
        if (replyText === undefined && !interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: '😅 Could not claim your daily reward — try again in a bit!',
            ephemeral: true,
          });
        }
      } catch {
        // give up gracefully
      }
    }
  },
};

// Exported for testing (date-key logic).
module.exports._dayKey = dayKey;
module.exports._store = { loadStore, saveStore };
