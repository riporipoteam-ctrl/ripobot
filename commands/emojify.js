'use strict';

/**
 * /emojify — public command that converts text into regional-indicator
 * emoji letters (🇦 🇧 🇨 ...). Offline, no API calls.
 */

const { SlashCommandBuilder } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

const REGIONAL_BASE = 0x1f1e6; // 🇦

function emojify(text) {
  let out = '';
  for (const ch of text.toLowerCase()) {
    if (ch >= 'a' && ch <= 'z') {
      out += String.fromCodePoint(REGIONAL_BASE + (ch.charCodeAt(0) - 97)) + ' ';
    } else if (ch >= '0' && ch <= '9') {
      out += ch + '\uFE0F\u20E3 ';
    } else if (ch === ' ') {
      out += '   ';
    } else {
      out += ch + ' ';
    }
  }
  return out.trimEnd();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('emojify')
    .setDescription('Turn text into big emoji letters 🇦🇧🇨')
    .addStringOption((o) =>
      o.setName('text').setDescription('Text to emojify').setRequired(true).setMaxLength(200),
    )
    .setDMPermission(false),

  async execute(interaction) {
    try {
      const text = interaction.options.getString('text', true);
      const result = emojify(text);
      if (!result) {
        await failEphemeral(interaction, '😅 Nothing to emojify.');
        return;
      }
      if (result.length > 2000) {
        await failEphemeral(interaction, '😅 That text is too long to emojify — try something shorter.');
        return;
      }
      await interaction.reply({ content: result });
    } catch (err) {
      console.error('[emojify] execute failed:', err.message);
      await failEphemeral(interaction, 'Something went wrong');
    }
  },
};
