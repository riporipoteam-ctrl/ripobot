'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];

/**
 * Post a poll embed and add number reactions.
 * Returns the sent message. Shared by /poll and natural-language polls.
 */
async function postPoll(channel, question, options) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📊 ${question}`)
    .setDescription(options.map((opt, i) => `${EMOJIS[i]} ${opt}`).join('\n'))
    .setFooter({ text: 'React to vote!' })
    .setTimestamp();

  const message = await channel.send({ embeds: [embed] });
  for (let i = 0; i < options.length; i++) {
    await message.react(EMOJIS[i]);
  }
  return message;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a reaction poll (up to 4 options)')
    .addStringOption((o) =>
      o.setName('question').setDescription('The poll question').setRequired(true).setMaxLength(256),
    )
    .addStringOption((o) =>
      o.setName('option1').setDescription('First option').setRequired(true).setMaxLength(100),
    )
    .addStringOption((o) =>
      o.setName('option2').setDescription('Second option').setRequired(true).setMaxLength(100),
    )
    .addStringOption((o) => o.setName('option3').setDescription('Third option').setMaxLength(100))
    .addStringOption((o) => o.setName('option4').setDescription('Fourth option').setMaxLength(100))
    .setDMPermission(false),

  async execute(interaction) {
    const question = interaction.options.getString('question', true);
    const options = ['option1', 'option2', 'option3', 'option4']
      .map((name) => interaction.options.getString(name))
      .filter(Boolean);

    await postPoll(interaction.channel, question, options);
    await interaction.reply({ content: '📊 Poll posted!', ephemeral: true });
  },

  // Shared with utils/nl.js (natural-language polls).
  postPoll,
};
