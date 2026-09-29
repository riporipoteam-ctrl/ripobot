'use strict';

const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Show info about this server')
    .setDMPermission(false),

  async execute(interaction) {
    const { guild } = interaction;

    try {
      // Ensure member count is accurate.
      await guild.members.fetch();

      const members = guild.members.cache;
      const humans = members.filter((m) => !m.user.bot).size;
      const bots = members.filter((m) => m.user.bot).size;

      const channels = guild.channels.cache;
      const text = channels.filter((c) => c.type === ChannelType.GuildText).size;
      const voice = channels.filter((c) => c.type === ChannelType.GuildVoice).size;
      const categories = channels.filter((c) => c.type === ChannelType.GuildCategory).size;

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`🏠 ${guild.name}`)
        .setThumbnail(guild.iconURL({ size: 256 }))
        .addFields(
          { name: 'ID', value: guild.id, inline: true },
          {
            name: 'Created',
            value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`,
            inline: true,
          },
          { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
          {
            name: `Members [${guild.memberCount}]`,
            value: `👥 ${humans} humans\n🤖 ${bots} bots`,
            inline: true,
          },
          {
            name: `Channels [${channels.size}]`,
            value: `💬 ${text} text\n🔊 ${voice} voice\n📁 ${categories} categories`,
            inline: true,
          },
          { name: 'Roles', value: String(guild.roles.cache.size), inline: true },
          { name: 'Boosts', value: `✨ ${guild.premiumSubscriptionCount ?? 0}`, inline: true },
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('[serverinfo] failed:', err.message);
      await failEphemeral(interaction, 'Could not fetch server info.');
    }
  },
};
