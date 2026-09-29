'use strict';

/**
 * /wyr — "Would you rather?" Public vote between two options.
 * Posts an embed with the question and two buttons (A and B). Votes are
 * tracked per user over a 30s window; clicking again updates your vote.
 * When the window closes, the message is edited with results (counts +
 * percentages) and the buttons are disabled. Custom IDs are unique per
 * invocation (interaction.id suffix) so parallel games never collide.
 */

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require('discord.js');

const VOTE_WINDOW_MS = 30_000;

const QUESTIONS = [
  { a: 'Have unlimited money', b: 'Have unlimited time' },
  { a: 'Be able to fly', b: 'Be able to turn invisible' },
  { a: 'Never need to sleep', b: 'Never need to eat' },
  { a: 'Live in the past', b: 'Live in the future' },
  { a: 'Always be 10 minutes late', b: 'Always be 20 minutes early' },
  { a: 'Know every language', b: 'Play every instrument' },
  { a: 'Have a rewind button for life', b: 'Have a pause button for life' },
  { a: 'Be famous online', b: 'Be unknown but rich' },
  { a: 'Fight 100 duck-sized horses', b: 'Fight 1 horse-sized duck' },
  { a: 'Never use social media again', b: 'Never watch TV/movies again' },
  { a: 'Have super strength', b: 'Have super speed' },
  { a: 'Travel the world for free', b: 'Never have to work again' },
  { a: 'Read minds', b: 'See the future' },
  { a: 'Always know when someone lies', b: 'Always get away with lying' },
  { a: 'Live without the internet', b: 'Live without AC/heating' },
  { a: 'Be a hero nobody knows', b: 'Be a celebrity everyone hates' },
];

function buildRows(customBase, disabled = false, winner = null) {
  const mk = (suffix, label, winnerSide) =>
    new ButtonBuilder()
      .setCustomId(`${customBase}_${suffix}`)
      .setLabel(label)
      .setStyle(
        disabled
          ? (winnerSide ? ButtonStyle.Success : ButtonStyle.Secondary)
          : ButtonStyle.Primary,
      )
      .setDisabled(disabled);
  return [new ActionRowBuilder().addComponents(mk('a', 'A', winner === 'a'), mk('b', 'B', winner === 'b'))];
}

/** Format vote results as text lines with counts and percentages. */
function resultsText(q, votesA, votesB, total) {
  const pct = (n) => (total === 0 ? 0 : Math.round((n / total) * 100));
  return (
    `**A — ${q.a}**\n` +
    `🗳️ ${votesA} vote${votesA === 1 ? '' : 's'} — ${pct(votesA)}%\n\n` +
    `**B — ${q.b}**\n` +
    `🗳️ ${votesB} vote${votesB === 1 ? '' : 's'} — ${pct(votesB)}%\n\n` +
    `👥 ${total} total vote${total === 1 ? '' : 's'}`
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wyr')
    .setDescription('Would you rather? Vote with the server on a fun dilemma')
    .setDMPermission(false),

  async execute(interaction) {
    const q = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
    const base = `wyr_${interaction.id}`;
    const votes = new Map(); // userId -> 'a' | 'b'

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle('🤔 Would you rather?')
      .setDescription(`**A:** ${q.a}\n**B:** ${q.b}`)
      .setFooter({ text: `Voting ends in 30s — started by ${interaction.user.username}` });

    let reply;
    try {
      reply = await interaction.reply({
        embeds: [embed],
        components: buildRows(base),
        fetchReply: true,
      });
    } catch (err) {
      console.error('[wyr] reply failed:', err.message);
      return;
    }

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: VOTE_WINDOW_MS,
    });

    collector.on('collect', async (buttonInteraction) => {
      if (!buttonInteraction.customId.startsWith(base)) return;
      const pick = buttonInteraction.customId.endsWith('_a') ? 'a' : 'b';
      votes.set(buttonInteraction.user.id, pick);
      try {
        await buttonInteraction.reply({
          content: `✅ You voted **${pick.toUpperCase()}** — ${pick === 'a' ? q.a : q.b}`,
          ephemeral: true,
        });
      } catch (err) {
        console.error('[wyr] vote ack failed:', err.message);
      }
    });

    collector.on('end', async () => {
      let votesA = 0;
      let votesB = 0;
      for (const v of votes.values()) {
        if (v === 'a') votesA += 1;
        else votesB += 1;
      }
      const total = votes.size;
      const winner = votesA === votesB ? null : votesA > votesB ? 'a' : 'b';

      const resultEmbed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle('🤔 Would you rather? — results')
        .setDescription(`**A:** ${q.a}\n**B:** ${q.b}`)
        .addFields({ name: '📊 Results', value: resultsText(q, votesA, votesB, total) });

      try {
        await interaction.editReply({
          embeds: [resultEmbed],
          components: buildRows(base, true, winner),
        });
      } catch (err) {
        console.error('[wyr] results edit failed:', err.message);
      }
    });
  },
};
