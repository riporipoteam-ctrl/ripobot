'use strict';

/**
 * Welcome new members to the server.
 *
 * Posts a decorated no-ping welcome card in #welcome: the member's avatar
 * as a big thumbnail, member count, and quick-start pointers. Display names
 * are printed as plain text — the owner explicitly forbids mention pings
 * on join. Also auto-assigns the Member role. Silent when the channel is
 * missing or the send fails.
 *
 * The card itself is built by utils/welcomeCard.js, shared with the
 * !welcometest staff command so both always render identically.
 */

const { Events } = require('discord.js');
const { findChannelByName, normalizeChannelName } = require('../utils/modreport');
const { buildWelcomeEmbed } = require('../utils/welcomeCard');

/** Find the Member role (tolerates emoji/punctuation prefixes). */
function findMemberRole(guild) {
  try {
    return (
      guild?.roles?.cache?.find((r) => normalizeChannelName(r.name) === 'member') ?? null
    );
  } catch {
    return null;
  }
}

module.exports = {
  name: Events.GuildMemberAdd,
  once: false,
  async execute(member) {
    // Auto-assign the Member role first (independent of the welcome post).
    try {
      const memberRole = findMemberRole(member.guild);
      if (memberRole && !member.roles.cache.has(memberRole.id)) {
        const botHighest = member.guild.members.me?.roles?.highest?.position ?? Infinity;
        if (memberRole.position < botHighest) {
          await member.roles.add(memberRole).catch(() => {});
        }
      }
    } catch (err) {
      console.error('[guildMemberAdd] member role assign failed:', err.message);
    }

    try {
      const channel = findChannelByName(member.guild, 'welcome');
      if (!channel) return;

      const embed = buildWelcomeEmbed({
        member,
        memberCount: member.guild.memberCount,
      });

      // Plain send — never a ping.
      await channel.send({ embeds: [embed] });
    } catch (err) {
      console.error('[guildMemberAdd] welcome failed:', err.message);
    }
  },
};
