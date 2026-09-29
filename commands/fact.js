'use strict';

/**
 * /fact — public command that fetches a random fact from the
 * uselessfacts.jsph.pl API and shows it in an embed.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

const FETCH_TIMEOUT_MS = 10_000;

/** Fetch a random fact; returns the text or null on failure. */
async function fetchFact() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch('https://uselessfacts.jsph.pl/api/v2/facts/random', {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.text === 'string' && data.text.length ? data.text : null;
  } catch (err) {
    console.error('[fact] fetch failed:', err.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fact')
    .setDescription('Get a random mind-blowing fact')
    .setDMPermission(false),

  async execute(interaction) {
    try {
      const fact = await fetchFact();

      if (!fact) {
        await failEphemeral(interaction, '😅 Could not dig up a fact right now — try again in a bit!');
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('💡 Random Fact')
        .setDescription(fact);

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('[fact] execute failed:', err.message);
      await failEphemeral(interaction, 'Something went wrong');
    }
  },
};
