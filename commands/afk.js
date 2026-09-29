'use strict';

/**
 * /afk — mark yourself as away from keyboard.
 *
 * Stores { reason, since } in data/afk.json with an atomic write
 * (temp file + rename, same pattern as utils/levels.js). When you send a
 * message again, events/messageCreate.js clears your entry and welcomes you
 * back; when someone mentions you while you're away, the bot tells them
 * you're AFK. No network calls here.
 *
 * NOTE: data/ is ephemeral across host reboots — AFK entries die on redeploy.
 * Accepted for v3.
 */

const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.AFK_DATA_DIR || path.join(__dirname, '..', 'data');
const AFK_FILE = path.join(DATA_DIR, 'afk.json');

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function blankStore() {
  return {};
}

/**
 * Read the AFK store fresh from disk. Never throws.
 *
 * @returns {Object<string, { reason: string, since: number }>}
 */
function loadStore() {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(AFK_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return blankStore();
  } catch {
    return blankStore();
  }
}

/**
 * Atomic write of the AFK store (temp file + rename).
 *
 * @param {Object<string, { reason: string, since: number }>} store
 */
function saveStore(store) {
  ensureDataDir();
  const tmp = `${AFK_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmp, AFK_FILE);
}

/**
 * Mark a user as AFK with a reason. Saves.
 *
 * @param {string} userId
 * @param {string} reason
 */
function setAfk(userId, reason) {
  const store = loadStore();
  store[userId] = { reason, since: Date.now() };
  saveStore(store);
}

/**
 * Remove a user's AFK entry. Returns true if they were AFK.
 *
 * @param {string} userId
 * @returns {boolean}
 */
function clearAfk(userId) {
  const store = loadStore();
  if (!store[userId]) return false;
  delete store[userId];
  saveStore(store);
  return true;
}

/**
 * Get a user's AFK entry ({ reason, since }) or null.
 *
 * @param {string} userId
 * @returns {{ reason: string, since: number } | null}
 */
function getAfk(userId) {
  const store = loadStore();
  const rec = store[userId];
  if (rec && typeof rec.reason === 'string' && typeof rec.since === 'number') {
    return rec;
  }
  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('Mark yourself as away — the bot will cover for you')
    .addStringOption((o) =>
      o
        .setName('reason')
        .setDescription('Why are you away?')
        .setMaxLength(200),
    )
    .setDMPermission(false),

  async execute(interaction) {
    const reason = interaction.options.getString('reason') || 'AFK';

    try {
      setAfk(interaction.user.id, reason);
    } catch (err) {
      console.error('[afk] failed to store AFK status:', err.message);
      await interaction.reply({
        content: '😅 Could not set your AFK status — try again in a bit.',
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      content: `💤 You're now AFK: ${reason}`,
      ephemeral: true,
    });
  },

  // Exported so events/messageCreate.js can share the same storage shape.
  loadStore,
  saveStore,
  setAfk,
  clearAfk,
  getAfk,
};
