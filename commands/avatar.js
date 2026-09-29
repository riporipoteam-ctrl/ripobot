'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription("Show a user's avatar large")
    .addUserOption((o) => o.setName('user').setDescription('User (defaults to you)'))
    .setDMPermission(false),

  async execute(interaction) {
    const user = interaction.options.getUser('user') ?? interaction.user;
    const url = user.displayAvatarURL({ size: 4096 });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`${user.tag}'s avatar`)
      .setImage(url)
      .setFooter({ text: `Requested by ${interaction.user.tag}` });

    await interaction.reply({ embeds: [embed] });
  },
};
