'use strict';

/**
 * /steam — public info command that searches the Steam store and shows the
 * top result. Uses the store's public storesearch API (no key needed).
 * Never throws: network failures and empty results get friendly replies.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const TIMEOUT_MS = 10000;

/**
 * Fetch JSON with a 10s abort timeout. Returns the parsed JSON, or null
 * on any failure (network error, timeout, bad status, invalid JSON).
 */
async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'RipoBot/3.0 (+discord bot)' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('steam')
    .setDescription('Search the Steam store')
    .addStringOption((o) =>
      o.setName('game').setDescription('Game to search for').setRequired(true).setMaxLength(200),
    )
    .setDMPermission(false),

  async execute(interaction) {
    const game = interaction.options.getString('game', true);

    await interaction.deferReply();

    const data = await fetchJson(
      `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(game)}&l=en&cc=US`,
    );

    const top = data?.items?.[0];
    if (!top) {
      await interaction.editReply(`🤷 No games found for "${game}".`);
      return;
    }

    const priceCents = top.price?.final;
    const price =
      typeof priceCents === 'number'
        ? `$${(priceCents / 100).toFixed(2)}`
        : 'Free to play / price not listed';

    const storeUrl = `https://store.steampowered.com/app/${top.id}/`;

    const embed = new EmbedBuilder()
      .setColor(0x171a21)
      .setTitle(top.name ?? 'Unknown title')
      .setImage(top.tiny_image ?? null)
      .addFields(
        { name: '💰 Price', value: price, inline: true },
        { name: '🔗 Store page', value: storeUrl, inline: true },
      )
      .setFooter({ text: 'Data: Steam store' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
