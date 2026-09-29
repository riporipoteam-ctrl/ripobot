'use strict';

/**
 * /define — public command that looks up an English word via the free
 * dictionaryapi.dev API. Shows part of speech, the first definition and an
 * example when one exists.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

const FETCH_TIMEOUT_MS = 10_000;

/** Fetch dictionary entries for a word; returns null when not found / failed. */
async function fetchDefinition(word) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      { signal: controller.signal },
    );
    if (res.status === 404) return { notFound: true };
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data.length ? data[0] : null;
  } catch (err) {
    console.error('[define] fetch failed:', err.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('define')
    .setDescription('Look up the definition of an English word')
    .addStringOption((o) =>
      o.setName('word').setDescription('The word to define').setRequired(true).setMaxLength(100),
    )
    .setDMPermission(false),

  async execute(interaction) {
    const word = interaction.options.getString('word', true).trim();

    const entry = await fetchDefinition(word);

    if (entry?.notFound) {
      await failEphemeral(interaction, `🤷 I couldn't find a definition for "${word}".`);
      return;
    }

    const meaning = entry?.meanings?.[0];
    const definition = meaning?.definitions?.[0];

    if (!meaning || !definition) {
      await failEphemeral(interaction, `😅 I couldn't get a definition for "${word}" — try again in a bit!`);
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📖 ${entry.word ?? word}`)
      .addFields(
        { name: 'Part of speech', value: meaning.partOfSpeech ?? '—', inline: true },
        { name: 'Definition', value: definition.definition },
      );

    if (definition.example) {
      embed.addFields({ name: 'Example', value: `*"${definition.example}"*` });
    }

    await interaction.reply({ embeds: [embed] });
  },
};
