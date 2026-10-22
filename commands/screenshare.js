'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { isOwnerOrCoOwner, adminApi, isNoSuchPlayer } = require('../utils/flux');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('screenshare')
    .setDescription('Allow or deny in-game screen sharing for a Flux Rec player')
    .addStringOption((option) =>
      option.setName('username').setDescription('Flux Rec username').setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('access')
        .setDescription('Whether the player may use screen sharing')
        .setRequired(true)
        .addChoices(
          { name: 'Allow', value: 'allow' },
          { name: 'Deny', value: 'deny' }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    if (!isOwnerOrCoOwner(interaction.member)) {
      await interaction.reply({
        content: '❌ Only the Owner and Co-Owner can use this command.',
        ephemeral: true,
      });
      return;
    }

    const username = interaction.options.getString('username', true).trim();
    const allowed = interaction.options.getString('access', true) === 'allow';
    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await adminApi('/screenshare/set', 'POST', { username, allowed });
      await interaction.editReply({
        content: allowed
          ? `✅ **${result.username}** may now use screen sharing. They must sign in again to activate it.`
          : `✅ Screen sharing is disabled for **${result.username}**. They must sign in again to refresh access.`,
      });
    } catch (err) {
      await interaction.editReply({
        content: isNoSuchPlayer(err)
          ? `❌ No Flux Rec account named **${username}**.`
          : `❌ Failed: ${err.message}`,
      });
    }
  },
};
