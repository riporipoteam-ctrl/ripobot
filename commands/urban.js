'use strict';

/**
 * /urban — public info command that looks up a term on Urban Dictionary.
 * Uses the free Urban Dictionary API (no key needed). Definitions often
 * contain [bracketed] words — those brackets are stripped. Never throws:
 * network failures and missing definitions get friendly replies.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const TIMEOUT_MS = 10000;
const MAX_DEFINITION = 1000;
const MAX_EXAMPLE = 500;

/** Strip [brackets] and truncate to a max length with an ellipsis. */
function cleanText(text, max) {
  if (typeof text !== 'string') return '—';
  let s = text.replace(/\[|\]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > max) s = s.slice(0, max - 1).trimEnd() + '…';
  return s || '—';
}

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
    .setName('urban')
    .setDescription('Look up a term on Urban Dictionary')
    .addStringOption((o) =>
      o.setName('term').setDescription('Term to look up').setRequired(true).setMaxLength(200),
    )
    .setDMPermission(false),

  async execute(interaction) {
    const term = interaction.options.getString('term', true);

    await interaction.deferReply();

    const data = await fetchJson(
      `https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`,
    );

    const top = data?.list?.[0];
    if (!top) {
      await interaction.editReply(`🤷 No definition found for "${term}".`);
      return;
    }

    const definition = cleanText(top.definition, MAX_DEFINITION);
    const example = cleanText(top.example, MAX_EXAMPLE);
    const up = Number(top.thumbs_up) || 0;
    const down = Number(top.thumbs_down) || 0;

    const embed = new EmbedBuilder()
      .setColor(0xe86222)
      .setTitle(`📖 ${term}`)
      .setDescription(definition)
      .addFields({ name: '💬 Example', value: example })
      .setFooter({ text: `👍 ${up} · 👎 ${down} — Urban Dictionary` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
