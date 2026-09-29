'use strict';

/**
 * /leaderboard — top 10 users by XP.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const levels = require('../utils/levels');
const { failEphemeral } = require('../utils/permissions');

const MEDALS = ['🥇', '🥈', '🥉'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Top 10 chatters by RipoBot XP')
    .setDMPermission(false),

  async execute(interaction) {
    try {
      const top = levels.getTop(10);

      if (top.length === 0) {
        await interaction.reply('Nobody has earned XP yet — chat with me in the ripobot channel!');
        return;
      }

      const lines = [];
      for (let i = 0; i < top.length; i++) {
        const [userId, rec] = top[i];
        let name = `<@${userId}>`;
        try {
          const user = await interaction.client.users.fetch(userId);
          if (user) name = user.username;
        } catch {
          // left the guild / deleted account — keep the mention fallback
        }
        const medal = MEDALS[i] ?? `${i + 1}.`;
        lines.push(`${medal} ${name} — Level ${rec.level} (${rec.xp} XP)`);
      }

      const embed = new EmbedBuilder()
        .setColor(0xf7b731)
        .setTitle('🏆 RipoBot Leaderboard')
        .setDescription(lines.join('\n'));

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('[leaderboard] failed:', err.message);
      await failEphemeral(interaction, 'Could not fetch the leaderboard.');
    }
  },
};
