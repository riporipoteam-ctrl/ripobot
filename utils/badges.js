'use strict';

/**
 * badges.js — nickname emoji badges (no Level 2 / Nitro needed).
 *
 * A badge is a unicode emoji prepended to a member's nickname:
 *   "🛡️ Username"
 *
 * Stored in data/badges.json:
 *   { "users": { "<userId>": "🛡️" }, "roles": { "<roleId>": "⭐" } }
 *
 * NOTE (free-host reality): data/*.json is ephemeral on the Hugging Face
 * Space — badges reset when the Space sleeps/restarts. The JSON file keeps
 * them working across local restarts and documents the current setup.
 *
 * Nickname edits need the ManageNicknames permission and the bot's highest
 * role must sit above the target's. The server owner can never be renamed.
 * All failures are silent (logged) — a badge command never crashes.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const BADGES_PATH = path.join(DATA_DIR, 'badges.json');

function blankStore() {
  return { users: {}, roles: {} };
}

function load() {
  try {
    if (!fs.existsSync(BADGES_PATH)) return blankStore();
    const raw = JSON.parse(fs.readFileSync(BADGES_PATH, 'utf8'));
    return {
      users: raw && typeof raw.users === 'object' ? raw.users : {},
      roles: raw && typeof raw.roles === 'object' ? raw.roles : {},
    };
  } catch (err) {
    console.error('[badges] load failed:', err.message);
    return blankStore();
  }
}

function save(store) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(BADGES_PATH, JSON.stringify(store, null, 2));
    return true;
  } catch (err) {
    console.error('[badges] save failed:', err.message);
    return false;
  }
}

/** Strip a leading "emoji " prefix from a nickname, returning the base name. */
function stripBadgePrefix(nick) {
  if (!nick) return '';
  // Remove one leading token that looks like an emoji/badge followed by space.
  return String(nick).replace(/^\S+\s+/, (m) => (/\p{Extended_Pictographic}/u.test(m) ? '' : m)).trim();
}

/** The display name to badge: current nickname (badge-stripped) or username. */
function baseNameOf(member) {
  const nick = member?.nickname;
  if (nick && nick.trim()) return stripBadgePrefix(nick) || member.user.username;
  return member?.user?.username || 'member';
}

function badgeFor(store, member) {
  if (!member) return null;
  const userBadge = store.users[member.id];
  if (userBadge) return userBadge;
  try {
    for (const roleId of Object.keys(store.roles)) {
      if (member.roles?.cache?.has(roleId)) return store.roles[roleId];
    }
  } catch {
    // ignore
  }
  return null;
}

function canRename(guild, member) {
  try {
    if (!guild || !member) return false;
    if (member.id === guild.ownerId) return false; // owner can't be renamed
    const me = guild.members.me;
    if (!me) return false;
    if (!me.permissions.has('ManageNicknames')) return false;
    if (member.roles.highest.position >= me.roles.highest.position) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Apply (or refresh) the stored badge for one member.
 * Returns 'applied' | 'removed' | 'skipped' | 'failed'.
 */
async function applyBadge(member, store) {
  const s = store || load();
  try {
    const guild = member?.guild;
    if (!guild || !canRename(guild, member)) return 'skipped';
    const badge = badgeFor(s, member);
    const base = baseNameOf(member);
    if (badge) {
      const want = `${badge} ${base}`.slice(0, 32);
      if (member.nickname === want) return 'skipped';
      await member.setNickname(want, 'Badge applied');
      return 'applied';
    }
    // No badge stored: clean up a stale badged nickname back to base.
    if (member.nickname && member.nickname !== base) {
      const clean = base === member.user.username ? null : base;
      await member.setNickname(clean, 'Badge removed');
      return 'removed';
    }
    return 'skipped';
  } catch (err) {
    console.error('[badges] apply failed:', err.message);
    return 'failed';
  }
}

module.exports = {
  load,
  save,
  blankStore,
  badgeFor,
  baseNameOf,
  stripBadgePrefix,
  canRename,
  applyBadge,
  BADGES_PATH,
};
