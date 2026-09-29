'use strict';

/**
 * XP/level storage + math for RipoBot v3.
 *
 * Levels are computed from cumulative XP thresholds:
 *   thresholdForLevel(L) = 100 * L * (L + 1) / 2   (L1 = 100, L2 = 300, L3 = 600)
 * A user's level is the highest L whose threshold their XP has reached.
 *
 * Storage: data/levels.json, shape { users: { "<userId>": { xp, level, affinity, updatedAt } } }.
 * Writes are atomic (temp file + rename) so a crash can't corrupt the data.
 *
 * NOTE: data/ is ephemeral across host reboots (Space wipes /tmp-style storage) —
 * levels/XP/affinity reset on redeploy. Accepted for v3.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.LEVELS_DATA_DIR || path.join(__dirname, '..', 'data');
const LEVELS_FILE = path.join(DATA_DIR, 'levels.json');

/** Hard cap: nobody can earn past level 100. */
const MAX_LEVEL = 100;

/**
 * Level milestones that grant a Discord role, ascending.
 * Role names are `Level <n>` (created server-side by an admin/bot task).
 */
const LEVEL_ROLE_THRESHOLDS = [5, 10, 20, 30, 50, 100];

/** Role name for a milestone threshold, e.g. 20 -> 'Level 20'. */
function roleNameForThreshold(threshold) {
  return `Level ${threshold}`;
}

/**
 * Highest milestone role a given level has earned, or null.
 * e.g. level 27 -> 'Level 20'.
 */
function levelRoleForLevel(level) {
  let best = 0;
  for (const t of LEVEL_ROLE_THRESHOLDS) {
    if (level >= t) best = t;
  }
  return best > 0 ? roleNameForThreshold(best) : null;
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function blankStore() {
  return { users: {} };
}

function loadStore() {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(LEVELS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.users && typeof parsed.users === 'object') {
      return parsed;
    }
    return blankStore();
  } catch {
    return blankStore();
  }
}

function saveStore(store) {
  ensureDataDir();
  const tmp = `${LEVELS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmp, LEVELS_FILE);
}

/**
 * Cumulative XP required to REACH level L.
 * L1 = 100, L2 = 300, L3 = 600.
 *
 * @param {number} level
 * @returns {number}
 */
function thresholdForLevel(level) {
  const L = Math.max(0, Math.floor(level));
  return 100 * L * (L + 1) / 2;
}

/**
 * Highest level L such that xp >= thresholdForLevel(L). Capped at MAX_LEVEL.
 *
 * @param {number} xp
 * @returns {number}
 */
function levelForXP(xp) {
  const total = Math.max(0, Math.floor(xp));
  let level = 0;
  while (level < MAX_LEVEL && total >= thresholdForLevel(level + 1)) {
    level += 1;
  }
  return level;
}

/**
 * Get (or create) a user's record: { xp, level, affinity, updatedAt }.
 * Creating does NOT write to disk — the record is saved on the next mutation.
 *
 * @param {string} userId
 * @returns {{ xp: number, level: number, affinity: number, updatedAt: number|null }}
 */
function getRecord(userId) {
  const store = loadStore();
  const rec = store.users[userId];
  if (
    rec &&
    typeof rec.xp === 'number' &&
    typeof rec.level === 'number' &&
    typeof rec.affinity === 'number'
  ) {
    return rec;
  }
  return { xp: 0, level: 0, affinity: 0, updatedAt: null };
}

function defaultRecord() {
  return { xp: 0, level: 0, affinity: 0, updatedAt: null };
}

function putRecord(store, userId, rec) {
  store.users[userId] = rec;
  saveStore(store);
}

/**
 * Add XP to a user, recompute level, save.
 *
 * @param {string} userId
 * @param {number} amount
 * @returns {{ xp: number, level: number, leveledUp: boolean, prevLevel: number }}
 */
function awardXP(userId, amount) {
  const store = loadStore();
  const prev = store.users[userId] ?? defaultRecord();
  const prevLevel = prev.level ?? 0;
  const xp = Math.max(0, Math.floor((prev.xp ?? 0) + amount));
  const level = levelForXP(xp);
  putRecord(store, userId, {
    xp,
    level,
    affinity: prev.affinity ?? 0,
    updatedAt: Date.now(),
  });
  return { xp, level, leveledUp: level > prevLevel, prevLevel };
}

/**
 * Get a user's affinity (-100..100). Returns 0 for unknown users.
 *
 * @param {string} userId
 * @returns {number}
 */
function getAffinity(userId) {
  return getRecord(userId).affinity;
}

/**
 * Set a user's affinity, clamped to -100..100. Saves. Returns the new value.
 *
 * @param {string} userId
 * @param {number} v
 * @returns {number}
 */
function setAffinity(userId, v) {
  const store = loadStore();
  const prev = store.users[userId] ?? defaultRecord();
  const affinity = Math.max(-100, Math.min(100, v));
  putRecord(store, userId, { ...prev, affinity, updatedAt: Date.now() });
  return affinity;
}

/**
 * Add a delta to a user's affinity (clamped -100..100 via setAffinity).
 * Returns the new affinity.
 *
 * @param {string} userId
 * @param {number} delta
 * @returns {number}
 */
function addAffinity(userId, delta) {
  return setAffinity(userId, getAffinity(userId) + delta);
}

/**
 * Progress info toward the next level. At MAX_LEVEL there is no next level.
 *
 * @param {string} userId
 * @returns {{ xp: number, level: number, current: number, next: number, into: number, needed: number, pct: number, maxed: boolean }}
 */
function progressToNext(userId) {
  const { xp, level } = getRecord(userId);
  if (level >= MAX_LEVEL) {
    const current = thresholdForLevel(MAX_LEVEL);
    return { xp, level, current, next: current, into: xp - current, needed: 0, pct: 100, maxed: true };
  }
  const current = thresholdForLevel(level);
  const next = thresholdForLevel(level + 1);
  const into = xp - current;
  const needed = next - current;
  const pct = needed > 0 ? Math.max(0, Math.min(100, (into / needed) * 100)) : 100;
  return { xp, level, current, next, into, needed, pct, maxed: false };
}

/**
 * Top users by XP, descending. Returns array of [userId, record].
 *
 * @param {number} limit
 * @returns {Array<[string, { xp: number, level: number, affinity: number, updatedAt: number|null }]>}
 */
function getTop(limit = 10) {
  const store = loadStore();
  return Object.entries(store.users)
    .sort(([, a], [, b]) => (b.xp ?? 0) - (a.xp ?? 0))
    .slice(0, Math.max(0, limit));
}

module.exports = {
  MAX_LEVEL,
  LEVEL_ROLE_THRESHOLDS,
  roleNameForThreshold,
  levelRoleForLevel,
  thresholdForLevel,
  levelForXP,
  getRecord,
  awardXP,
  getAffinity,
  setAffinity,
  addAffinity,
  progressToNext,
  getTop,
};
