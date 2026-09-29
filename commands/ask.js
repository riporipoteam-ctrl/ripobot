'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { chatAvailable, askAI, chunkText } = require('../utils/ai');

const NOT_CONFIGURED = '💤 My chat brain isn\u2019t set up yet (no Hugging Face token).';
const BRAIN_LAG = '😅 My brain lagged out — try again in a bit!';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask RipoBot a question (longer AI answer)')
    .addStringOption((o) =>
      o.setName('question').setDescription('Your question').setRequired(true).setMaxLength(1000),
    )
    .setDMPermission(false),

  async execute(interaction) {
    const question = interaction.options.getString('question', true);

    await interaction.deferReply();

    if (!chatAvailable()) {
      await interaction.editReply(NOT_CONFIGURED);
      return;
    }

    const answer = await askAI(question);
    if (!answer) {
      await interaction.editReply(BRAIN_LAG);
      return;
    }

    const chunks = chunkText(answer, 2000);
    await interaction.editReply(`**❓ ${question}**\n\n${chunks[0]}`);
    for (const chunk of chunks.slice(1)) {
      await interaction.followUp(chunk);
    }
  },
};
