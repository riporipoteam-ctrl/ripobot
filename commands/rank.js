'use strict';

/**
 * /rank [user] — show a user's RipoBot XP level, progress, and the bot's vibe.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const levels = require('../utils/levels');
const { vibeEmoji } = require('../utils/feelings');
const { failEphemeral } = require('../utils/permissions');

const BAR_LENGTH = 10;

function vibeLabel(affinity) {
  if (affinity >= 50) return 'Adores you';
  if (affinity >= 15) return 'Likes you';
  if (affinity >= -20) return 'Neutral';
  if (affinity >= -60) return 'Annoyed';
  return 'Wants space';
}

function progressBar(pct) {
  const filled = Math.round(Math.max(0, Math.min(100, pct)) / (100 / BAR_LENGTH));
  return '█'.repeat(filled) + '░'.repeat(BAR_LENGTH - filled);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription("Check someone's RipoBot level, XP and vibe")
    .addUserOption((o) => o.setName('user').setDescription('User to check (default: you)'))
    .setDMPermission(false),

  async execute(interaction) {
    const user = interaction.options.getUser('user') ?? interaction.user;

    try {
      const rec = levels.getRecord(user.id);
      const prog = levels.progressToNext(user.id);
      const bar = progressBar(prog.pct);
      const affinity = rec.affinity ?? 0;
      const milestone = levels.levelRoleForLevel(prog.level);

      const embed = new EmbedBuilder()
        .setColor(0xf7b731)
        .setTitle(`🏆 ${user.displayName}'s RipoBot Rank`)
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: 'Level', value: `${prog.level}`, inline: true },
          { name: 'Total XP', value: `${prog.xp}`, inline: true },
          { name: 'Milestone role', value: milestone ? `🏅 ${milestone}` : '—', inline: true },
          prog.maxed
            ? { name: 'Progress', value: '👑 Max level reached!' }
            : {
                name: `Progress to Level ${prog.level + 1}`,
                value: `${bar} ${prog.into}/${prog.needed} XP`,
              },
          {
            name: "RipoBot's vibe toward you:",
            value: `${vibeEmoji(affinity)} ${vibeLabel(affinity)}`,
          },
        )
        .setFooter({ text: `Max level ${levels.MAX_LEVEL} • milestone roles at 5 / 10 / 20 / 30 / 50 / 100` });

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('[rank] failed:', err.message);
      await failEphemeral(interaction, 'Could not fetch rank info.');
    }
  },
};
