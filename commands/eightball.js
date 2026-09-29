'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const ANSWERS = [
  // Affirmative
  'It is certain.',
  'It is decidedly so.',
  'Without a doubt.',
  'Yes definitely.',
  'You may rely on it.',
  'As I see it, yes.',
  'Most likely.',
  'Outlook good.',
  'Yes.',
  'Signs point to yes.',
  // Non-committal
  'Reply hazy, try again.',
  'Ask again later.',
  'Better not tell you now.',
  'Cannot predict now.',
  'Concentrate and ask again.',
  // Negative
  "Don't count on it.",
  'My reply is no.',
  'My sources say no.',
  'Outlook not so good.',
  'Very doubtful.',
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('Ask the magic 8-ball a question')
    .addStringOption((o) =>
      o.setName('question').setDescription('Your yes/no question').setRequired(true).setMaxLength(500),
    )
    .setDMPermission(false),

  async execute(interaction) {
    const question = interaction.options.getString('question', true);
    const answer = ANSWERS[Math.floor(Math.random() * ANSWERS.length)];

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle('🎱 Magic 8-Ball')
      .addFields(
        { name: 'Question', value: question },
        { name: 'Answer', value: `*${answer}*` },
      )
      .setFooter({ text: `Asked by ${interaction.user.tag}` });

    await interaction.reply({ embeds: [embed] });
  },
};
