'use strict';

/**
 * /cat — public command that posts a random cat picture. cataas.com/cat
 * returns image bytes directly, so the URL (with a cache-buster) is used
 * as the embed image. A quick HEAD-style check keeps the reply friendly
 * when the service is down.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

const FETCH_TIMEOUT_MS = 10_000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cat')
    .setDescription('Get a random cat picture')
    .setDMPermission(false),

  async execute(interaction) {
    try {
      const imageUrl = `https://cataas.com/cat?t=${Date.now()}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(imageUrl, { signal: controller.signal, method: 'HEAD' });
        if (!res.ok) {
          await failEphemeral(interaction, '😅 The cats are hiding right now — try again in a bit!');
          return;
        }
      } catch (err) {
        console.error('[cat] fetch failed:', err.message);
        await failEphemeral(interaction, '😅 The cats are hiding right now — try again in a bit!');
        return;
      } finally {
        clearTimeout(timeout);
      }

      const embed = new EmbedBuilder()
        .setColor(0xff9f1c)
        .setTitle('🐱 Random cat')
        .setImage(imageUrl);

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('[cat] execute failed:', err.message);
      await failEphemeral(interaction, 'Something went wrong');
    }
  },
};
