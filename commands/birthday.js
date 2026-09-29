'use strict';

/**
 * /birthday — save and view member birthdays.
 *
 * Subcommands:
 *   /birthday set <month 1-12> <day 1-31>  — save your birthday (Feb 29 allowed)
 *   /birthday next                          — birthdays in the next 30 days (Sarajevo time)
 *
 * Storage: data/birthdays.json, shape { "<userId>": { month, day } }.
 * Writes are atomic (temp file + rename), same pattern as utils/levels.js.
 *
 * Plain display names only — never @-ping anyone in birthday output.
 */

const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

const DATA_DIR = path.join(__dirname, '..', 'data');
const BIRTHDAYS_FILE = path.join(DATA_DIR, 'birthdays.json');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

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
 * Load the birthday store: { "<userId>": { month, day } }.
 * Missing or corrupt file → empty object.
 *
 * @returns {Object.<string, { month: number, day: number }>}
 */
function loadBirthdays() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const raw = fs.readFileSync(BIRTHDAYS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Atomic save: write temp file, then rename over the real one.
 *
 * @param {Object.<string, { month: number, day: number }>} store
 */
function saveBirthdays(store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${BIRTHDAYS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmp, BIRTHDAYS_FILE);
}

/**
 * Is (month, day) a real calendar date? Feb 29 is allowed (leap years exist).
 *
 * @param {number} month 1-12
 * @param {number} day 1-31
 * @returns {boolean}
 */
function isValidBirthday(month, day) {
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (!Number.isInteger(day) || day < 1 || day > 31) return false;
  if (month === 2) return day <= 29;
  if ([4, 6, 9, 11].includes(month)) return day <= 30;
  return true;
}

/**
 * Current date parts in Europe/Sarajevo (time-zone-safe date arithmetic).
 *
 * @returns {{ year: number, month: number, day: number }}
 */
function sarajevoToday() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Sarajevo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

/**
 * True if (month, day) occurs in the given year (Feb 29 only in leap years).
 *
 * @param {number} month
 * @param {number} day
 * @param {number} year
 * @returns {boolean}
 */
function dateExistsInYear(month, day, year) {
  if (month === 2 && day === 29) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  }
  return true; // validated by isValidBirthday()
}

/**
 * Next occurrence of a (month, day) birthday on or after the Sarajevo today,
 * as { year, month, day }. Handles Feb 29 by rolling to the next leap year.
 *
 * @param {number} month
 * @param {number} day
 * @param {{ year: number, month: number, day: number }} today
 * @returns {{ year: number, month: number, day: number }}
 */
function nextOccurrence(month, day, today) {
  let year = today.year;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (dateExistsInYear(month, day, year)) {
      const sameYear = year === today.year;
      // Any month/day in a future year is on or after today; within the
      // current year we need month/day >= today's month/day.
      const isFutureOrToday =
        !sameYear ||
        month > today.month ||
        (month === today.month && day >= today.day);
      if (isFutureOrToday) return { year, month, day };
    }
    year += 1;
  }
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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('birthday')
    .setDescription('Save or view member birthdays')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Save your birthday')
        .addIntegerOption((opt) =>
          opt.setName('month').setDescription('Month (1-12)').setRequired(true).setMinValue(1).setMaxValue(12),
        )
        .addIntegerOption((opt) =>
          opt.setName('day').setDescription('Day (1-31)').setRequired(true).setMinValue(1).setMaxValue(31),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('next').setDescription('Birthdays in the next 30 days'),
    ),

  async execute(interaction) {
    try {
      const sub = interaction.options.getSubcommand();

      if (sub === 'set') {
        const month = interaction.options.getInteger('month', true);
        const day = interaction.options.getInteger('day', true);

        if (!isValidBirthday(month, day)) {
          await interaction.reply({
            content: `❌ ${MONTH_NAMES[month - 1]} doesn't have ${day} days — pick a real date.`,
            ephemeral: true,
          });
          return;
        }

        const store = loadBirthdays();
        store[interaction.user.id] = { month, day };
        saveBirthdays(store);

        await interaction.reply({
          content: `🎂 Birthday saved: ${MONTH_NAMES[month - 1]} ${day}!`,
          ephemeral: true,
        });
        return;
      }

      // sub === 'next'
      const today = sarajevoToday();
      const store = loadBirthdays();

      const upcoming = [];
      for (const [userId, entry] of Object.entries(store)) {
        if (!entry || !isValidBirthday(entry.month, entry.day)) continue;
        const occ = nextOccurrence(entry.month, entry.day, today);
        const diffDays = Math.round(
          (Date.UTC(occ.year, occ.month - 1, occ.day) -
            Date.UTC(today.year, today.month - 1, today.day)) /
            (24 * 60 * 60 * 1000),
        );
        if (diffDays >= 0 && diffDays <= 30) {
          upcoming.push({ userId, occ, diffDays });
        }
      }
      upcoming.sort(
        (a, b) =>
          Date.UTC(a.occ.year, a.occ.month - 1, a.occ.day) -
          Date.UTC(b.occ.year, b.occ.month - 1, b.occ.day),
      );

      if (upcoming.length === 0) {
        await interaction.reply('No birthdays in the next 30 days 🎈');
        return;
      }

      const lines = [];
      for (const { userId, occ, diffDays } of upcoming) {
        const name = await resolveName(interaction.client, userId);
        const inText = diffDays === 0 ? 'today!' : diffDays === 1 ? 'tomorrow' : `in ${diffDays} days`;
        lines.push(`🎂 ${name} — ${MONTH_NAMES[occ.month - 1]} ${occ.day} (${inText})`);
      }

      await interaction.reply(lines.join('\n'));
    } catch (err) {
      console.error('[birthday] failed:', err.message);
      await failEphemeral(interaction, 'Could not handle the birthday command.');
    }
  },

  // Exported for tests.
  _isValidBirthday: isValidBirthday,
  _safeName: safeName,
  _nextOccurrence: nextOccurrence,
};
