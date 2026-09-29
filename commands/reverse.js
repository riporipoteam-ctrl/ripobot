'use strict';

/**
 * /reverse — public command that reverses text. Offline, no API calls.
 */

const { SlashCommandBuilder } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reverse')
    .setDescription('Reverse text esrever')
    .addStringOption((o) =>
      o.setName('text').setDescription('Text to reverse').setRequired(true).setMaxLength(500),
    )
    .setDMPermission(false),

  async execute(interaction) {
    try {
      const text = interaction.options.getString('text', true);
      const reversed = [...text].reverse().join('');
      await interaction.reply({ content: reversed || '😅 Nothing to reverse.' });
    } catch (err) {
      console.error('[reverse] execute failed:', err.message);
      await failEphemeral(interaction, 'Something went wrong');
    }
  },
};
