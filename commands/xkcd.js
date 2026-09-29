'use strict';

/**
 * /xkcd — public command that shows a random xkcd comic.
 * Fetches the latest comic number, picks a random one in range,
 * and embeds its title, image, and alt text.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

const FETCH_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 4; // #404 intentionally doesn't exist — retry on 404

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: await res.json() };
  } catch (err) {
    console.error('[xkcd] fetch failed:', err.message);
    return { ok: false };
  } finally {
    clearTimeout(timeout);
  }
}

function truncate(text, max) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}\u2026`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('xkcd')
    .setDescription('Show a random xkcd comic')
    .setDMPermission(false),

  async execute(interaction) {
    try {
      const latest = await fetchJson('https://xkcd.com/info.0.json');
      if (!latest.ok || !Number.isInteger(latest.data?.num) || latest.data.num < 1) {
        await failEphemeral(interaction, '😅 Could not reach xkcd right now — try again in a bit!');
        return;
      }

      const max = latest.data.num;
      let comic = null;
      let n = 0;
      for (let attempt = 0; attempt < MAX_ATTEMPTS && !comic; attempt += 1) {
        n = 1 + Math.floor(Math.random() * max);
        const res = await fetchJson(`https://xkcd.com/${n}/info.0.json`);
        if (res.ok && res.data?.img) comic = res.data;
      }

      if (!comic) {
        await failEphemeral(interaction, '😅 Could not reach xkcd right now — try again in a bit!');
        return;
      }

      const date = comic.month && comic.day && comic.year
        ? `${comic.month}/${comic.day}/${comic.year}`
        : '';

      const embed = new EmbedBuilder()
        .setColor(0x96a8c8)
        .setTitle(truncate(String(comic.title || `xkcd #${n}`), 256))
        .setURL(`https://xkcd.com/${n}`)
        .setImage(comic.img)
        .setDescription(truncate(String(comic.alt || ''), 2000) || '*No alt text*')
        .setFooter({ text: `xkcd #${n}${date ? ` • ${date}` : ''}` });

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('[xkcd] execute failed:', err.message);
      await failEphemeral(interaction, 'Something went wrong');
    }
  },
};
