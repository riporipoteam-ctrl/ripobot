'use strict';

/**
 * /ship — fun love-compatibility meter for two users.
 * Deterministic: the two user IDs are sorted, then the sha256 hex of
 * "id1:id2" is hashed and the first 8 hex chars become an int % 101,
 * giving a stable 0..100 score for the same pair. No randomness, no
 * state, no secrets. Results show a 10-block progress bar and playful
 * tier text. Plain display names only — no pings.
 */

const crypto = require('crypto');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const BAR_BLOCKS = 10;

/**
 * Deterministic 0..100 compatibility score for a pair of user IDs.
 *
 * @param {string} idA
 * @param {string} idB
 * @returns {number}
 */
function shipScore(idA, idB) {
  const [id1, id2] = [idA, idB].sort();
  const hex = crypto.createHash('sha256').update(`${id1}:${id2}`).digest('hex');
  const head = parseInt(hex.slice(0, 8), 16);
  return head % 101;
}

/** 10-block progress bar: 🟩 for filled, ⬛ for empty. */
function progressBar(score) {
  const filled = Math.round((score / 100) * BAR_BLOCKS);
  return '🟩'.repeat(filled) + '⬛'.repeat(BAR_BLOCKS - filled);
}

/** Playful tier text for a score. */
function tierText(score) {
  if (score >= 90) return 'SOULMATES 💍';
  if (score >= 70) return 'Great match 💕';
  if (score >= 50) return 'Could work 🙂';
  if (score >= 30) return 'Meh 😐';
  return 'Disaster 💥';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ship')
    .setDescription('Check the love compatibility of two users')
    .addUserOption((option) =>
      option.setName('user1').setDescription('First user').setRequired(true),
    )
    .addUserOption((option) =>
      option.setName('user2').setDescription('Second user').setRequired(true),
    )
    .setDMPermission(false),

  async execute(interaction) {
    const user1 = interaction.options.getUser('user1');
    const user2 = interaction.options.getUser('user2');

    let score;
    try {
      score = shipScore(user1.id, user2.id);
    } catch (err) {
      console.error('[ship] score failed:', err.message);
      score = 0;
    }

    const name1 = user1.displayName ?? user1.username;
    const name2 = user2.displayName ?? user2.username;

    const embed = new EmbedBuilder()
      .setColor(0xeb459e)
      .setTitle('💘 Love Compatibility')
      .setDescription(
        `**${name1}** 💞 **${name2}**\n\n` +
          `${progressBar(score)} **${score}%**\n\n` +
          `${tierText(score)}`,
      );

    try {
      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('[ship] reply failed:', err.message);
    }
  },
};

// Exported for testing (determinism check).
module.exports._shipScore = shipScore;
