'use strict';

/**
 * /dog — public command that fetches a random dog picture URL from
 * dog.ceo's free API and shows it in an embed.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

const FETCH_TIMEOUT_MS = 10_000;

/** Fetch a random dog image URL; returns null on failure. */
async function fetchDogImage() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch('https://dog.ceo/api/breeds/image/random', { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.status === 'success' && typeof data.message === 'string') return data.message;
    return null;
  } catch (err) {
    console.error('[dog] fetch failed:', err.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dog')
    .setDescription('Get a random dog picture')
    .setDMPermission(false),

  async execute(interaction) {
    try {
      const imageUrl = await fetchDogImage();

      if (!imageUrl) {
        await failEphemeral(interaction, '😅 The dogs ran off — try again in a bit!');
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0xff9f1c)
        .setTitle('🐶 Random dog')
        .setImage(imageUrl);

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('[dog] execute failed:', err.message);
      await failEphemeral(interaction, 'Something went wrong');
    }
  },
};
