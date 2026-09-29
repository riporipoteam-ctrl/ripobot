'use strict';

/**
 * /advice — public command that fetches a random piece of advice from
 * the Advice Slip API and shows it in an embed.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

const FETCH_TIMEOUT_MS = 10_000;

/** Fetch random advice; returns { advice, id } or null on failure. */
async function fetchAdvice() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.adviceslip.com/advice', {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const advice = data?.slip?.advice;
    if (typeof advice !== 'string' || !advice.length) return null;
    return { advice, id: data.slip.id };
  } catch (err) {
    console.error('[advice] fetch failed:', err.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('advice')
    .setDescription('Get a random piece of life advice')
    .setDMPermission(false),

  async execute(interaction) {
    try {
      const result = await fetchAdvice();

      if (!result) {
        await failEphemeral(interaction, '😅 Could not fetch advice right now — try again in a bit!');
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle('🧠 Random Advice')
        .setDescription(result.advice)
        .setFooter({ text: result.id ? `Advice #${result.id}` : 'Advice Slip' });

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('[advice] execute failed:', err.message);
      await failEphemeral(interaction, 'Something went wrong');
    }
  },
};
