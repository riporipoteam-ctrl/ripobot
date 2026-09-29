'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { canModerate, resolveTargetMember, failEphemeral } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription("Remove a user's timeout")
    .addUserOption((o) => o.setName('user').setDescription('User to un-timeout').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const user = interaction.options.getUser('user', true);

    const target = await resolveTargetMember(interaction, user);
    if (!target) {
      await failEphemeral(interaction, 'That user is not in this server.');
      return;
    }

    if (!target.isCommunicationDisabled()) {
      await failEphemeral(interaction, 'That user is not timed out.');
      return;
    }

    const check = canModerate(
      interaction,
      target,
      PermissionFlagsBits.ModerateMembers,
      PermissionFlagsBits.ModerateMembers,
    );
    if (!check.ok) {
      await failEphemeral(interaction, check.reason);
      return;
    }

    try {
      await target.timeout(null, `Timeout removed by ${interaction.user.tag}`);
      await interaction.reply({
        content: `✅ Removed timeout for **${user.tag}**.`,
        ephemeral: true,
      });
    } catch (err) {
      console.error('[untimeout] failed:', err.message);
      await failEphemeral(interaction, 'Failed to remove the timeout. I may be missing permissions.');
    }
  },
};
