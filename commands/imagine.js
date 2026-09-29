'use strict';

const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { generateImageBuffer } = require('../utils/images');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('imagine')
    .setDescription('Generate an image from a text prompt (AI)')
    .addStringOption((o) =>
      o.setName('prompt').setDescription('What to draw').setRequired(true).setMaxLength(1000),
    )
    .setDMPermission(true),

  async execute(interaction) {
    const prompt = interaction.options.getString('prompt', true);

    await interaction.deferReply();

    const result = await generateImageBuffer(prompt);
    if (!result) {
      await interaction.editReply('😅 Image generation failed or took too long — try again in a bit!');
      return;
    }

    const attachment = new AttachmentBuilder(result.buffer, { name: `imagine.${result.ext}` });

    await interaction.editReply({
      content: `🎨 **${prompt}**\n*by ${interaction.user.tag}*`,
      files: [attachment],
    });
  },
};
