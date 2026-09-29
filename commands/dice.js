'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dice')
    .setDescription('Roll dice')
    .addIntegerOption((o) =>
      o.setName('sides').setDescription('Sides per die (2-100)').setMinValue(2).setMaxValue(100),
    )
    .addIntegerOption((o) =>
      o.setName('count').setDescription('Number of dice (1-20)').setMinValue(1).setMaxValue(20),
    )
    .setDMPermission(false),

  async execute(interaction) {
    const sides = interaction.options.getInteger('sides') ?? 6;
    const count = interaction.options.getInteger('count') ?? 1;

    const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
    const total = rolls.reduce((a, b) => a + b, 0);

    const embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle(`🎲 Rolling ${count}d${sides}`)
      .setDescription(rolls.map((r) => `\`${r}\``).join(' '))
      .addFields({ name: 'Total', value: `**${total}**`, inline: true })
      .setFooter({ text: `Rolled by ${interaction.user.tag}` });

    await interaction.reply({ embeds: [embed] });
  },
};
