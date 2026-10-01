'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const {
  isOwnerOrCoOwner,
  adminApi,
  isNoSuchPlayer,
  confirmEveryoneTokens,
} = require('../utils/flux');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fluxtokens')
    .setDescription('Give Flux Rec tokens to players (Owner/Co-Owner only)')
    .addStringOption((o) =>
      o.setName('target').setDescription('Username or "everyone"').setRequired(true)
    )
    .addIntegerOption((o) =>
      o.setName('amount').setDescription('Number of tokens').setRequired(true).setMinValue(1).setMaxValue(1000000)
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

    const target = interaction.options.getString('target', true);
    const amount = interaction.options.getInteger('amount', true);

    await interaction.deferReply({ ephemeral: true });

    try {
      if (target.toLowerCase() === 'everyone') {
        // Destructive-adjacent: require an explicit button confirmation.
        await confirmEveryoneTokens(
          (payload) => interaction.followUp(payload),
          interaction.user.id,
          amount
        );
        return;
      }
      // POST /api/admin/v1/tokens/grant { username, amount }
      // -> { success, grantedTo, accounts: 1, amount, newBalance }
      const result = await adminApi('/tokens/grant', 'POST', { username: target, amount });
      const balance =
        typeof result.newBalance === 'number'
          ? `\nNew balance: **${result.newBalance.toLocaleString('en-US')}** 🪙`
          : '';
      await interaction.editReply({
        content: `✅ Gave **${amount.toLocaleString('en-US')}** tokens to **${result.grantedTo}**! 🪙${balance}`,
      });
    } catch (err) {
      await interaction.editReply({
        content: isNoSuchPlayer(err)
          ? `❌ No Flux Rec account named **${target}**.`
          : `❌ Failed: ${err.message}`,
      });
    }
  },
};
