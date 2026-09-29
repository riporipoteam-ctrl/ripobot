'use strict';

/**
 * /trivia — public command that fetches one question from OpenTDB, shuffles
 * the answers, and shows them as buttons. The invoker has 20 seconds to
 * answer; the collector only counts the invoker's first click.
 */

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

const TRIVIA_URL = 'https://opentdb.com/api.php?amount=1';
const ANSWER_TIMEOUT_MS = 20_000;
const FETCH_TIMEOUT_MS = 10_000;

const NAMED_ENTITIES = {
  '&quot;': '"',
  '&#039;': "'",
  '&apos;': "'",
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
  '&eacute;': 'é',
  '&Eacute;': 'É',
  '&egrave;': 'è',
  '&Egrave;': 'È',
  '&euml;': 'ë',
  '&aacute;': 'á',
  '&Aacute;': 'Á',
  '&iacute;': 'í',
  '&Iacute;': 'Í',
  '&oacute;': 'ó',
  '&Oacute;': 'Ó',
  '&uacute;': 'ú',
  '&Uacute;': 'Ú',
  '&uuml;': 'ü',
  '&Uuml;': 'Ü',
  '&ccedil;': 'ç',
  '&Ccedil;': 'Ç',
  '&ntilde;': 'ñ',
  '&Ntilde;': 'Ñ',
  '&hellip;': '…',
  '&mdash;': '—',
  '&ndash;': '–',
  '&rsquo;': '’',
  '&lsquo;': '‘',
  '&ldquo;': '“',
  '&rdquo;': '”',
  '&ouml;': 'ö',
  '&Ouml;': 'Ö',
  '&auml;': 'ä',
  '&Auml;': 'Ä',
};

/** Decode HTML entities found in OpenTDB responses (named + numeric). */
function decodeEntities(text) {
  if (!text) return text;
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&[a-zA-Z]+;|&#\d+;/g, (entity) => NAMED_ENTITIES[entity] ?? entity);
}

/** Fisher–Yates shuffle, returns a new array. */
function shuffle(array) {
  const out = array.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Fetch one trivia question from OpenTDB; returns null on any failure. */
async function fetchTrivia() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(TRIVIA_URL, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.results?.length) return null;
    const q = data.results[0];
    return {
      category: decodeEntities(q.category),
      difficulty: decodeEntities(q.difficulty),
      question: decodeEntities(q.question),
      correct: decodeEntities(q.correct_answer),
      incorrect: (q.incorrect_answers ?? []).map(decodeEntities),
    };
  } catch (err) {
    console.error('[trivia] fetch failed:', err.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trivia')
    .setDescription('Answer a random trivia question (20 seconds!)')
    .setDMPermission(false),

  async execute(interaction) {
    const trivia = await fetchTrivia();
    if (!trivia) {
      await failEphemeral(interaction, '😅 Could not fetch a trivia question — try again in a bit!');
      return;
    }

    const answers = shuffle([trivia.correct, ...trivia.incorrect]);
    const correctIdx = answers.indexOf(trivia.correct);

    const buttons = answers.map((answer, idx) =>
      new ButtonBuilder()
        .setCustomId(`trivia_${idx}`)
        .setLabel(answer.length > 80 ? `${answer.slice(0, 77)}…` : answer)
        .setStyle(ButtonStyle.Primary),
    );

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🧠 Trivia')
      .setDescription(trivia.question)
      .addFields(
        { name: '📚 Category', value: trivia.category, inline: true },
        {
          name: '⭐ Difficulty',
          value: trivia.difficulty.charAt(0).toUpperCase() + trivia.difficulty.slice(1),
          inline: true,
        },
      )
      .setFooter({ text: `You have 20 seconds — ${interaction.user.username}` });

    const reply = await interaction.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(buttons)],
      fetchReply: true,
    });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: ANSWER_TIMEOUT_MS,
    });

    const disableButtons = () => {
      const disabled = answers.map((answer, idx) =>
        new ButtonBuilder()
          .setCustomId(`trivia_${idx}`)
          .setLabel(answer.length > 80 ? `${answer.slice(0, 77)}…` : answer)
          .setStyle(idx === correctIdx ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(true),
      );
      return new ActionRowBuilder().addComponents(disabled);
    };

    collector.on('collect', async (buttonInteraction) => {
      // Only the command invoker's clicks count; ignore everyone else.
      if (buttonInteraction.user.id !== interaction.user.id) {
        await buttonInteraction.reply({
          content: '❌ This trivia is not yours — use /trivia to start your own!',
          ephemeral: true,
        });
        return;
      }

      collector.stop();
      const pickedIdx = Number(buttonInteraction.customId.replace('trivia_', ''));
      const isCorrect = pickedIdx === correctIdx;

      const resultEmbed = new EmbedBuilder()
        .setColor(isCorrect ? 0x57f287 : 0xed4245)
        .setTitle('🧠 Trivia')
        .setDescription(trivia.question)
        .addFields({ name: '✅ Correct answer', value: trivia.correct });

      try {
        await buttonInteraction.update({
          embeds: [resultEmbed],
          components: [disableButtons()],
        });
        await buttonInteraction.followUp({
          content: isCorrect ? '✅ Correct!' : `❌ Wrong! The answer was **${trivia.correct}**.`,
          ephemeral: true,
        });
      } catch (err) {
        console.error('[trivia] answer handling failed:', err.message);
      }
    });

    collector.on('end', async (_, reason) => {
      // 'time' = nobody (the invoker) answered in 20s; otherwise handled above.
      if (reason !== 'time') return;

      const timedOutEmbed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('🧠 Trivia — time\u2019s up!')
        .setDescription(trivia.question)
        .addFields({ name: '✅ Correct answer', value: trivia.correct });

      try {
        await interaction.editReply({
          embeds: [timedOutEmbed],
          components: [disableButtons()],
        });
      } catch (err) {
        console.error('[trivia] timeout edit failed:', err.message);
      }
    });
  },
};
