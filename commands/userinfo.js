'use strict';

/**
 * /userinfo [user] — decorated profile card: big avatar, account age,
 * join date, roles, timeout state, and RipoBot level/XP.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { resolveTargetMember, failEphemeral } = require('../utils/permissions');
const levels = require('../utils/levels');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Show a decorated profile card for someone')
    .addUserOption((o) => o.setName('user').setDescription('User to inspect (default: you)'))
    .setDMPermission(false),

  async execute(interaction) {
    const user = interaction.options.getUser('user') ?? interaction.user;

    const avatar = user.displayAvatarURL({ size: 512 });
    const created = Math.floor(user.createdTimestamp / 1000);
    const prog = levels.progressToNext(user.id);
    const milestone = levels.levelRoleForLevel(prog.level);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({ name: user.tag, iconURL: avatar })
      .setTitle(`👤 ${user.username}`)
      .setThumbnail(avatar)
      .addFields(
        { name: '🆔 ID', value: `\`${user.id}\``, inline: true },
        { name: '🤖 Bot', value: user.bot ? 'Yes' : 'No', inline: true },
        {
          name: '🏆 RipoBot level',
          value: `Level ${prog.level} (${prog.xp} XP)${milestone ? ` • 🏅 ${milestone}` : ''}`,
          inline: true,
        },
        {
          name: '📅 Account created',
          value: `<t:${created}:D> (<t:${created}:R>)`,
          inline: true,
        },
      );

    const member = await resolveTargetMember(interaction, user);
    if (member) {
      const roles = member.roles.cache
        .filter((r) => r.id !== interaction.guild.id)
        .sort((a, b) => b.position - a.position)
        .map((r) => `${r}`)
        .slice(0, 20);
      const joined = Math.floor(member.joinedTimestamp / 1000);
      embed.addFields(
        {
          name: '📥 Joined server',
          value: `<t:${joined}:D> (<t:${joined}:R>)`,
          inline: true,
        },
        {
          name: `🎭 Roles [${member.roles.cache.size - 1}]`,
          value: roles.length > 0 ? roles.join(' ') : 'None',
        },
      );
      if (member.isCommunicationDisabled()) {
        embed.addFields({ name: '🔇 Timed out', value: 'Yes', inline: true });
      }
    } else {
      embed.addFields({ name: '📥 In server', value: 'No', inline: true });
    }

    embed.setImage(avatar).setFooter({ text: 'Ripo Team' }).setTimestamp();

    try {
      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('[userinfo] failed:', err.message);
      await failEphemeral(interaction, 'Could not fetch user info.');
    }
  },
};
