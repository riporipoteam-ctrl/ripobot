'use strict';

/**
 * /dadjoke — public command that fetches a random dad joke from
 * icanhazdadjoke.com and shows it in an embed.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

const FETCH_TIMEOUT_MS = 10_000;

/** Fetch a random dad joke; returns the text or null on failure. */
async function fetchDadJoke() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch('https://icanhazdadjoke.com/', {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.joke === 'string' && data.joke.length ? data.joke : null;
  } catch (err) {
    console.error('[dadjoke] fetch failed:', err.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dadjoke')
    .setDescription('Get a random dad joke (groan guaranteed)')
    .setDMPermission(false),

  async execute(interaction) {
    try {
      const joke = await fetchDadJoke();

      if (!joke) {
        await failEphemeral(interaction, '😅 Could not fetch a dad joke right now — try again in a bit!');
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle('😅 Dad Joke')
        .setDescription(joke);

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('[dadjoke] execute failed:', err.message);
      await failEphemeral(interaction, 'Something went wrong');
    }
  },
};
