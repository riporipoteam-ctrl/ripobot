'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { isOwnerOrCoOwner, adminApi, isNoSuchPlayer } = require('../utils/flux');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fluxgift')
    .setDescription('Grant a gift box to a Flux Rec player (Owner/Co-Owner only)')
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
      // POST /api/admin/v1/gifts/grant { username } -> { username, accountId, giftId }
      // 404 when the player has no Flux Rec account.
      const result = await adminApi('/gifts/grant', 'POST', { username });
      await interaction.editReply({
        content: `🎁 Gift box sent to **${result.username}** — they'll find it in their gifts in-game!`,
      });
    } catch (err) {
      await interaction.editReply({
        content: isNoSuchPlayer(err)
          ? `❌ No Flux Rec account named **${username}**. Gifts only work on players who already made an account in-game.`
          : `❌ Failed: ${err.message}`,
      });
    }
  },
};
