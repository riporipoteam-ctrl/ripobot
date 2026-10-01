'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { isOwnerOrCoOwner, adminApi, isNoSuchPlayer } = require('../utils/flux');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fluxunban')
    .setDescription('Lift a Flux Rec player ban (Owner/Co-Owner only)')
    .addStringOption((o) =>
      o.setName('username').setDescription('Flux Rec username').setRequired(true)
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

    const username = interaction.options.getString('username', true);
    await interaction.deferReply({ ephemeral: true });

    try {
      // POST /api/admin/v1/bans/lift { username } -> { success, username, accountId, lifted }
      const result = await adminApi('/bans/lift', 'POST', { username });
      await interaction.editReply({
        content: result.lifted
          ? `✅ Ban lifted for **${result.username}**. They can play again now.`
          : `ℹ️ **${username}** has no active ban — nothing to lift.`,
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
