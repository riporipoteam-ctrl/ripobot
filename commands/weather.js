'use strict';

/**
 * /weather — public info command that shows the current weather for any
 * city. Uses wttr.in's free JSON API (no key needed). Never throws: network
 * failures or an unknown city fall back to a friendly reply.
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
    .setName('weather')
    .setDescription('Get the current weather for any city')
    .addStringOption((o) =>
      o.setName('city').setDescription('City name').setRequired(true).setMaxLength(200),
    )
    .setDMPermission(false),

  async execute(interaction) {
    const city = interaction.options.getString('city', true);

    await interaction.deferReply();

    const data = await fetchJson(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);

    const cond = data?.current_condition?.[0];
    if (!cond) {
      await interaction.editReply(`😅 Couldn't find that city ("${city}"). Try a different spelling.`);
      return;
    }

    const desc = cond.weatherDesc?.[0]?.value ?? 'Unknown';

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🌤 Weather in ${city}`)
      .addFields(
        { name: '🌡 Temp', value: `${cond.temp_C}°C`, inline: true },
        { name: '🤔 Feels like', value: `${cond.FeelsLikeC}°C`, inline: true },
        { name: '☁️ Condition', value: desc, inline: true },
        { name: '💧 Humidity', value: `${cond.humidity}%`, inline: true },
      )
      .setFooter({ text: 'Data: wttr.in' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
