'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Flip a coin — heads or tails?')
    .setDMPermission(false),

  async execute(interaction) {
    const heads = Math.random() < 0.5;
    const embed = new EmbedBuilder()
      .setColor(heads ? 0xf1c40f : 0x95a5a6)
      .setTitle('🪙 Coin Flip')
      .setDescription(`# ${heads ? 'Heads!' : 'Tails!'}`)
      .setFooter({ text: `Flipped by ${interaction.user.tag}` });

    await interaction.reply({ embeds: [embed] });
  },
};
