'use strict';

/**
 * Say goodbye when a member leaves the server.
 *
 * Posts a plain-text farewell embed in #welcome (no ping, per the owner's
 * no-mention-ping rule). Silent when the channel is missing or the send fails.
 */

const { Events, EmbedBuilder } = require('discord.js');
const { findChannelByName } = require('../utils/modreport');

/** Strip @everyone / @here so a displayName can never cause a mass ping. */
function sanitizeName(name) {
  return String(name ?? 'Someone').replace(/@(everyone|here)/gi, (_, word) => word);
}

module.exports = {
  name: Events.GuildMemberRemove,
  once: false,
  async execute(member) {
    try {
      const channel = findChannelByName(member.guild, 'welcome');
      if (!channel) return;

      const displayName = sanitizeName(member.displayName).slice(0, 64) || 'Someone';

      const embed = new EmbedBuilder()
        .setColor(0x99aab5)
        .setTitle('👋 Someone left')
        .setDescription(`${displayName} left the server. We'll miss you! 💙`)
        .setTimestamp();

      await channel.send({ embeds: [embed] });
    } catch (err) {
      console.error('[guildMemberRemove] goodbye failed:', err.message);
    }
  },
};
