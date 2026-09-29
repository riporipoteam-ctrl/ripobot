'use strict';

/**
 * /bug — report a bug to the mod team.
 *
 * Anyone can use it. Posts a formatted bug report to #mod-logs and confirms
 * ephemerally. Nothing is sent if #mod-logs can't be found.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { findModLogsChannel } = require('../utils/modreport');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bug')
    .setDescription('Report a bug to the mod team')
    .addStringOption((o) =>
      o
        .setName('description')
        .setDescription('What is the bug? What were you doing?')
        .setRequired(true)
        .setMaxLength(1000),
    )
    .setDMPermission(false),

  async execute(interaction) {
    const description = interaction.options.getString('description', true);

    const modLogs = findModLogsChannel(interaction.guild);
    if (!modLogs) {
      await interaction.reply({
        content: "😅 Couldn't find the mod-logs channel.",
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle('🔧 Bug Report')
      .addFields(
        { name: 'Reporter', value: `<@${interaction.user.id}> (${interaction.user.tag})` },
        { name: 'Description', value: description.slice(0, 1024) },
      )
      .setTimestamp();

    try {
      await modLogs.send({ embeds: [embed] });
    } catch (err) {
      console.error('[bug] failed to post bug report:', err.message);
      await interaction.reply({
        content: '😅 Could not deliver the bug report — I may be missing permission to send in #mod-logs.',
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      content: '🐞 Bug report sent to the mods — thanks!',
      ephemeral: true,
    });
  },
};
