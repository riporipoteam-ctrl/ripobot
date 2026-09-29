'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const EMOJI = { rock: '🪨', paper: '📄', scissors: '✂️' };
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rps')
    .setDescription('Play rock-paper-scissors against the bot')
    .addStringOption((o) =>
      o
        .setName('choice')
        .setDescription('Your pick')
        .setRequired(true)
        .addChoices(
          { name: 'Rock 🪨', value: 'rock' },
          { name: 'Paper 📄', value: 'paper' },
          { name: 'Scissors ✂️', value: 'scissors' },
        ),
    )
    .setDMPermission(false),

  async execute(interaction) {
    const userChoice = interaction.options.getString('choice', true);
    const botChoice = ['rock', 'paper', 'scissors'][Math.floor(Math.random() * 3)];

    let result, color;
    if (userChoice === botChoice) {
      result = "It's a tie! 🤝";
      color = 0x95a5a6;
    } else if (BEATS[userChoice] === botChoice) {
      result = 'You win! 🎉';
      color = 0x2ecc71;
    } else {
      result = 'I win! 😎';
      color = 0xe74c3c;
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle('Rock Paper Scissors')
      .addFields(
        { name: 'You', value: `${EMOJI[userChoice]} ${userChoice}`, inline: true },
        { name: 'RipoBot', value: `${EMOJI[botChoice]} ${botChoice}`, inline: true },
        { name: 'Result', value: `**${result}**` },
      );

    await interaction.reply({ embeds: [embed] });
  },
};
