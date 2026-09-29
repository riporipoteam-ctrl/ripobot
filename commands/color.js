'use strict';

/**
 * /color — public command that shows a color swatch for a hex code.
 * Offline, no API calls.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

function parseHex(input) {
  const hex = input.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{3}$/.test(hex) && !/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  const int = parseInt(full, 16);
  return {
    hex: `#${full.toUpperCase()}`,
    int,
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('color')
    .setDescription('Show a color swatch for a hex code')
    .addStringOption((o) =>
      o
        .setName('hex')
        .setDescription('Hex color, e.g. #5865F2 or 5865F2')
        .setRequired(true)
        .setMaxLength(7),
    )
    .setDMPermission(false),

  async execute(interaction) {
    try {
      const input = interaction.options.getString('hex', true);
      const color = parseHex(input);
      if (!color) {
        await failEphemeral(interaction, '😅 That doesn\u2019t look like a hex color — try something like `#5865F2`.');
        return;
      }
      const embed = new EmbedBuilder()
        .setColor(color.int)
        .setTitle(`🎨 ${color.hex}`)
        .addFields(
          { name: 'RGB', value: `${color.r}, ${color.g}, ${color.b}`, inline: true },
          { name: 'Integer', value: String(color.int), inline: true },
        );
      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('[color] execute failed:', err.message);
      await failEphemeral(interaction, 'Something went wrong');
    }
  },
};
