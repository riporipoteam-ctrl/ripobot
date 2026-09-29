'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { chatAvailable, translateText } = require('../utils/ai');

const NOT_CONFIGURED = '💤 My chat brain isn\u2019t set up yet (no Hugging Face token).';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('translate')
    .setDescription('Translate text into another language')
    .addStringOption((o) =>
      o.setName('text').setDescription('Text to translate').setRequired(true).setMaxLength(1000),
    )
    .addStringOption((o) =>
      o.setName('to').setDescription('Target language (name or code, default: es)').setMaxLength(50),
    )
    .setDMPermission(false),

  async execute(interaction) {
    const text = interaction.options.getString('text', true);
    const to = interaction.options.getString('to') ?? 'es';

    await interaction.deferReply();

    if (!chatAvailable()) {
      await interaction.editReply(NOT_CONFIGURED);
      return;
    }

    const translated = await translateText(text, to);
    if (!translated) {
      await interaction.editReply('😅 My brain lagged out — try again in a bit!');
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x1abc9c)
      .setTitle(`🌐 Translation → ${to}`)
      .addFields(
        { name: 'Original', value: text.slice(0, 1000) },
        { name: 'Translated', value: translated.slice(0, 1000) },
      )
      .setFooter({ text: `Requested by ${interaction.user.tag}` });

    await interaction.editReply({ embeds: [embed] });
  },
};
