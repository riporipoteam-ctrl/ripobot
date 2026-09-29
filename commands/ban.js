'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { canModerate, resolveTargetMember, failEphemeral } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server')
    .addUserOption((o) => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason for the ban').setMaxLength(512))
    .addIntegerOption((o) =>
      o
        .setName('delete_days')
        .setDescription('Days of message history to delete (0-7)')
        .setMinValue(0)
        .setMaxValue(7),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const deleteDays = interaction.options.getInteger('delete_days') ?? 0;

    const target = await resolveTargetMember(interaction, user);
    if (!target) {
      await failEphemeral(interaction, 'That user is not in this server.');
      return;
    }

    const check = canModerate(
      interaction,
      target,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.BanMembers,
    );
    if (!check.ok) {
      await failEphemeral(interaction, check.reason);
      return;
    }

    try {
      await interaction.guild.members.ban(user.id, {
        reason: `${reason} (by ${interaction.user.tag})`.slice(0, 512),
        deleteMessageSeconds: deleteDays * 24 * 60 * 60,
      });
      await interaction.reply({
        content: `🔨 Banned **${user.tag}** — ${reason}`,
        ephemeral: true,
      });
    } catch (err) {
      console.error('[ban] failed:', err.message);
      await failEphemeral(interaction, 'Ban failed. I may be missing permissions or the user left.');
    }
  },
};
