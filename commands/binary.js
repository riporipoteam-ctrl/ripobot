'use strict';

/**
 * /binary — public command that converts text to 8-bit binary.
 * Offline, no API calls.
 */

const { SlashCommandBuilder } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

function toBinary(text) {
  return [...text]
    .map((ch) => ch.codePointAt(0).toString(2).padStart(8, '0'))
    .join(' ');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('binary')
    .setDescription('Convert text to binary 01010100')
    .addStringOption((o) =>
      o.setName('text').setDescription('Text to convert').setRequired(true).setMaxLength(200),
    )
    .setDMPermission(false),

  async execute(interaction) {
    try {
      const text = interaction.options.getString('text', true);
      const result = toBinary(text);
      if (!result) {
        await failEphemeral(interaction, '😅 Nothing to convert.');
        return;
      }
      await interaction.reply({ content: `\`\`\`${result}\`\`\`` });
    } catch (err) {
      console.error('[binary] execute failed:', err.message);
      await failEphemeral(interaction, 'Something went wrong');
    }
  },
};
