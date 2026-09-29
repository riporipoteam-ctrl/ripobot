'use strict';

/**
 * /apod — public command that shows NASA's Astronomy Picture of the Day.
 * Uses the public DEMO_KEY (rate-limited); handles 429 with a friendly
 * "try again later" message. Videos are embedded as links.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

const FETCH_TIMEOUT_MS = 10_000;
const APOD_URL = 'https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY';

function truncate(text, max) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}\u2026`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('apod')
    .setDescription("Show NASA's Astronomy Picture of the Day")
    .setDMPermission(false),

  async execute(interaction) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      let res;
      try {
        res = await fetch(APOD_URL, { signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }

      if (res.status === 429) {
        await failEphemeral(interaction, '🚀 NASA\u2019s free API is rate-limited right now — try again in a bit!');
        return;
      }
      if (!res.ok) {
        await failEphemeral(interaction, '😅 Could not reach NASA right now — try again in a bit!');
        return;
      }

      const data = await res.json();
      if (!data?.title) {
        await failEphemeral(interaction, '😅 NASA returned something odd — try again in a bit!');
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x0b3d91)
        .setTitle(truncate(String(data.title), 256))
        .setDescription(truncate(String(data.explanation || ''), 2000))
        .setFooter({ text: `NASA APOD${data.date ? ` • ${data.date}` : ''}` });

      if (data.media_type === 'video' || !data.url) {
        const videoUrl = String(data.url || '');
        embed.addFields({ name: '🎬 Video', value: videoUrl ? `[Watch it here](${videoUrl})` : 'No media URL provided' });
      } else {
        embed.setImage(String(data.hdurl || data.url));
      }

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('[apod] execute failed:', err.message);
      await failEphemeral(interaction, 'Something went wrong');
    }
  },
};
