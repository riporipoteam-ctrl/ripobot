'use strict';

/**
 * /mock — sPoNgEbOb-case text. Offline, no API calls.
 */

const { SlashCommandBuilder } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

/** Randomly alternate letter case. Exported for unit checks. */
function mockCase(text) {
  return [...String(text || '')]
    .map((ch) => (/[a-zA-Z]/.test(ch) ? (Math.random() < 0.5 ? ch.toLowerCase() : ch.toUpperCase()) : ch))
    .join('');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mock')
    .setDescription('mOcK yOuR tExT lIkE sPoNgEbOb')
    .addStringOption((o) =>
      o.setName('text').setDescription('Text to mock').setRequired(true).setMaxLength(500),
    )
    .setDMPermission(false),

  async execute(interaction) {
    try {
      const text = interaction.options.getString('text', true);
      const mocked = mockCase(text);
      await interaction.reply({ content: mocked || '😅 Nothing to mock.' });
    } catch (err) {
      console.error('[mock] execute failed:', err.message);
      await failEphemeral(interaction, 'Something went wrong');
    }
  },

  // exported for acceptance checks
  mockCase,
};
