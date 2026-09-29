'use strict';

/**
 * /meme — public command that fetches a random SFW meme from meme-api.com
 * and shows it in an embed with the title, image and source subreddit.
 * Retries up to 3 times to avoid NSFW/spoiler memes.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

const FETCH_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;

/** Try to fetch one SFW meme; returns the meme object or null on failure. */
async function fetchMeme() {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch('https://meme-api.com/gimme', { signal: controller.signal });
      if (!res.ok) continue;
      const data = await res.json();
      if (!data || !data.url || data.nsfw === true || data.spoiler === true) continue;
      return data;
    } catch (err) {
      console.error('[meme] fetch failed:', err.message);
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('meme')
    .setDescription('Get a random meme')
    .setDMPermission(false),

  async execute(interaction) {
    try {
      const meme = await fetchMeme();

      if (!meme) {
        await failEphemeral(interaction, `😅 Couldn't find a SFW meme right now — try again in a bit!`);
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle((meme.title || 'Random meme').slice(0, 256))
        .setImage(meme.url)
        .setFooter({ text: `r/${meme.subreddit || 'memes'}` });

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('[meme] execute failed:', err.message);
      await failEphemeral(interaction, 'Something went wrong');
    }
  },
};
