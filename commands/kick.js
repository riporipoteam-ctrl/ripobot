'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { canModerate, resolveTargetMember, failEphemeral } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user from the server')
    .addUserOption((o) => o.setName('user').setDescription('User to kick').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason for the kick').setMaxLength(512))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    const target = await resolveTargetMember(interaction, user);
    if (!target) {
      await failEphemeral(interaction, 'That user is not in this server.');
      return;
    }

    const check = canModerate(
      interaction,
      target,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.KickMembers,
    );
    if (!check.ok) {
      await failEphemeral(interaction, check.reason);
      return;
    }

    try {
      await target.kick(`${reason} (by ${interaction.user.tag})`.slice(0, 512));
      await interaction.reply({
        content: `👢 Kicked **${user.tag}** — ${reason}`,
        ephemeral: true,
      });
    } catch (err) {
      console.error('[kick] failed:', err.message);
      await failEphemeral(interaction, 'Kick failed. I may be missing permissions.');
    }
  },
};
