'use strict';

/**
 * /serverstats — public command showing server stats plus RipoBot's uptime.
 */

const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');

/** Format process.uptime() seconds as "Xd Xh Xm". */
function formatUptime(totalSeconds) {
  const s = Math.floor(totalSeconds);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverstats')
    .setDescription('Show server stats and RipoBot uptime')
    .setDMPermission(false),

  async execute(interaction) {
    const { guild } = interaction;

    let members;
    try {
      members = await guild.members.fetch();
    } catch (err) {
      console.error('[serverstats] member fetch failed:', err.message);
      members = guild.members.cache;
    }

    let bots = 0;
    for (const member of members.values()) {
      if (member.user.bot) bots += 1;
    }
    const humans = members.size - bots;

    const channels = guild.channels.cache;
    const text = channels.filter((c) => c.type === ChannelType.GuildText).size;
    const voice = channels.filter((c) => c.type === ChannelType.GuildVoice).size;
    const categories = channels.filter((c) => c.type === ChannelType.GuildCategory).size;
    const threads = channels.filter((c) => c.isThread()).size;

    const boostLevel = guild.premiumTier ?? 0;
    const boostCount = guild.premiumSubscriptionCount ?? 0;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📊 ${guild.name} — Server Stats`)
      .setThumbnail(guild.iconURL({ size: 256 }) ?? null)
      .addFields(
        {
          name: '👥 Members',
          value: `${guild.memberCount} total\n${humans} humans · ${bots} bots`,
          inline: true,
        },
        {
          name: '🚀 Boosts',
          value: `Level ${boostLevel}\n${boostCount} boosts`,
          inline: true,
        },
        {
          name: '📁 Channels',
          value: `${text} text · ${voice} voice\n${categories} categories · ${threads} threads`,
          inline: true,
        },
        {
          name: '🎭 Roles',
          value: `${guild.roles.cache.size} roles`,
          inline: true,
        },
        {
          name: '📅 Created',
          value: `<t:${Math.floor(guild.createdAt.getTime() / 1000)}:D>`,
          inline: true,
        },
        {
          name: '🤖 RipoBot Uptime',
          value: formatUptime(process.uptime()),
          inline: true,
        },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
