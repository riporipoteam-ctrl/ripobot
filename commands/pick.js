'use strict';

/**
 * /pick — pick one option at random from a list.
 * Choices are separated by semicolons or commas.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

const MAX_CHOICES = 20;

/** Split raw input into clean choices. Exported for unit checks. */
function parseChoices(raw) {
  return String(raw || '')
    .split(/[;,]/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
    .slice(0, MAX_CHOICES + 1);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pick')
    .setDescription('Pick one option at random from your list')
    .addStringOption((o) =>
      o
        .setName('choices')
        .setDescription('Options separated by ; or , — e.g. "pizza; sushi; tacos"')
        .setRequired(true)
        .setMaxLength(500),
    )
    .setDMPermission(false),

  async execute(interaction) {
    try {
      const raw = interaction.options.getString('choices', true);
      const choices = parseChoices(raw);

      if (choices.length < 2) {
        await failEphemeral(interaction, 'Give me at least 2 choices separated by `;` or `,` — e.g. `pizza; sushi; tacos`.');
        return;
      }
      if (choices.length > MAX_CHOICES) {
        await failEphemeral(interaction, `Too many choices — keep it to ${MAX_CHOICES} or fewer.`);
        return;
      }

      const winner = choices[Math.floor(Math.random() * choices.length)];
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('🎯 Pick')
        .setDescription(`Options: ${choices.map((c) => `\`${c.slice(0, 50)}\``).join(', ')}`)
        .addFields({ name: 'Winner', value: `**${winner.slice(0, 200)}**` })
        .setFooter({ text: `Picked for ${interaction.user.tag}` });

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('[pick] execute failed:', err.message);
      await failEphemeral(interaction, 'Something went wrong');
    }
  },

  // exported for acceptance checks
  parseChoices,
  MAX_CHOICES,
};
