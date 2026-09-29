'use strict';

/**
 * Tiny persistent JSON storage for warnings.
 * Writes are atomic (temp file + rename) so a crash can't corrupt the data.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const WARNS_FILE = path.join(DATA_DIR, 'warns.json');

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function blankStore() {
  return { nextId: 1, warns: [] };
}

function loadWarns() {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(WARNS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.nextId === 'number' && Array.isArray(parsed.warns)) {
      return parsed;
    }
    return blankStore();
  } catch {
    return blankStore();
  }
}

function saveWarns(store) {
  ensureDataDir();
  const tmp = `${WARNS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmp, WARNS_FILE);
}

/**
 * Add a warn. Returns the created warn object (with numeric id).
 */
function addWarn({ guildId, userId, userTag, reason, moderatorId, moderatorTag }) {
  const store = loadWarns();
  const warn = {
    id: store.nextId++,
    guildId,
    userId,
    userTag,
    reason,
    moderatorId,
    moderatorTag,
    createdAt: new Date().toISOString(),
  };
  store.warns.push(warn);
  saveWarns(store);
  return warn;
}

/**
 * All warns for a user in a guild, newest first.
 */
function getWarns(guildId, userId) {
  const store = loadWarns();
  return store.warns
    .filter((w) => w.guildId === guildId && w.userId === userId)
    .sort((a, b) => b.id - a.id);
}

/**
 * Remove a warn by id for a user in a guild. Returns the removed warn or null.
 */
function removeWarn(guildId, userId, warnId) {
  const store = loadWarns();
  const idx = store.warns.findIndex(
    (w) => w.guildId === guildId && w.userId === userId && w.id === warnId,
  );
  if (idx === -1) return null;
  const [removed] = store.warns.splice(idx, 1);
  saveWarns(store);
  return removed;
}

/**
 * Count warns for a user in a guild.
 */
function countWarns(guildId, userId) {
  return getWarns(guildId, userId).length;
}

module.exports = { addWarn, getWarns, removeWarn, countWarns };
