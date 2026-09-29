'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');
const { removeWarn } = require('../utils/storage');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unwarn')
    .setDescription('Remove a warning from a user')
    .addUserOption((o) => o.setName('user').setDescription('User to unwarn').setRequired(true))
    .addIntegerOption((o) =>
      o.setName('warn_id').setDescription('Warn ID (see /warnings)').setRequired(true).setMinValue(1),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const user = interaction.options.getUser('user', true);
    const warnId = interaction.options.getInteger('warn_id', true);

    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      await failEphemeral(interaction, "You don't have permission to do that.");
      return;
    }

    let removed;
    try {
      removed = removeWarn(interaction.guildId, user.id, warnId);
    } catch (err) {
      console.error('[unwarn] storage failed:', err.message);
      await failEphemeral(interaction, 'Could not update warnings. Try again.');
      return;
    }

    if (!removed) {
      await failEphemeral(interaction, `No warn #${warnId} found for **${user.tag}**.`);
      return;
    }

    await interaction.reply({
      content: `✅ Removed warn #${warnId} from **${user.tag}** ("${removed.reason}").`,
      ephemeral: true,
    });
  },
};
