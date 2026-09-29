'use strict';

/**
 * /qr — public command that turns text into a QR code image using the
 * free api.qrserver.com generator and attaches it to the reply.
 */

const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

const FETCH_TIMEOUT_MS = 10_000;

function qrUrl(text) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(text)}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('qr')
    .setDescription('Turn text into a QR code image')
    .setDMPermission(false)
    .addStringOption((option) => option
      .setName('text')
      .setDescription('Text or link to encode (max 500 characters)')
      .setRequired(true)
      .setMaxLength(500)),

  async execute(interaction) {
    try {
      const text = interaction.options.getString('text', true).trim();
      if (!text) {
        await failEphemeral(interaction, '🤔 Give me some text to encode first!');
        return;
      }

      const url = qrUrl(text);

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        let buffer;
        try {
          const res = await fetch(url, { signal: controller.signal });
          const contentType = res.headers.get('content-type') || '';
          if (!res.ok || !contentType.includes('image')) {
            throw new Error(`QR service returned ${res.status}`);
          }
          buffer = Buffer.from(await res.arrayBuffer());
        } finally {
          clearTimeout(timeout);
        }

        if (!buffer || !buffer.length) throw new Error('empty QR image');

        const file = new AttachmentBuilder(buffer, { name: 'qr.png' });
        const embed = new EmbedBuilder()
          .setColor(0x1abc9c)
          .setTitle('🔳 QR Code')
          .setDescription(`\`${text.slice(0, 200)}\``)
          .setImage('attachment://qr.png');

        await interaction.reply({ embeds: [embed], files: [file] });
      } catch (err) {
        console.error('[qr] image fetch failed:', err.message);
        // Fallback: post the generator URL as a direct link.
        await interaction.reply(
          `🔳 Couldn\u2019t generate the image — here\u2019s a direct link instead:\n${url}`,
        );
      }
    } catch (err) {
      console.error('[qr] execute failed:', err.message);
      await failEphemeral(interaction, 'Something went wrong');
    }
  },
};
