'use strict';

/**
 * Re-apply nickname badges when a member's roles change.
 *
 * A role badge (set via /badge setrole) must appear when the member GAINS
 * the role and disappear when they LOSE it. We only act when the role set
 * actually changed — nickname edits from elsewhere are left alone.
 */

const { Events } = require('discord.js');
const badges = require('../utils/badges');

function roleIds(member) {
  try {
    return new Set(member?.roles?.cache?.keys() ?? []);
  } catch {
    return new Set();
  }
}

module.exports = {
  name: Events.GuildMemberUpdate,
  once: false,
  async execute(oldMember, newMember) {
    try {
      const before = roleIds(oldMember);
      const after = roleIds(newMember);
      let changed = before.size !== after.size;
      if (!changed) {
        for (const id of after) {
          if (!before.has(id)) {
            changed = true;
            break;
          }
        }
      }
      if (!changed) return; // nickname-only or other update — not our business

      const store = badges.load();
      // Only touch members who have (or had) a badge reason.
      const hadBadge = badges.badgeFor(store, oldMember);
      const hasBadge = badges.badgeFor(store, newMember);
      if (!hadBadge && !hasBadge) return;

      const res = await badges.applyBadge(newMember, store);
      if (res === 'applied' || res === 'removed') {
        console.log(`[badges] ${res} badge for ${newMember.user.tag} after role change`);
      }
    } catch (err) {
      console.error('[guildMemberUpdate] badge refresh failed:', err.message);
    }
  },
};
