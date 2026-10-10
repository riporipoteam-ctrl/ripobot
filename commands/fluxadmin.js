'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { isOwnerOrCoOwner, adminApi, isNoSuchPlayer } = require('../utils/flux');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fluxadmin')
    .setDescription('Give or remove Flux Rec admin (developer) rank (Owner/Co-Owner only)')
    .addStringOption((o) =>
      o.setName('username').setDescription('Flux Rec in-game username').setRequired(true)
    )
    .addBooleanOption((o) =>
      o.setName('remove').setDescription('Remove admin rank instead of giving it').setRequired(false)
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
    const remove = interaction.options.getBoolean('remove') || false;
    const rank = remove ? 'none' : 'developer';

    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await adminApi('/ranks/set', 'POST', { username, rank });
      if (remove) {
        await interaction.editReply({
          content: `✅ Admin rank removed from **${result.username || username}**. They'll need to re-log for it to take effect.`,
        });
      } else {
        await interaction.editReply({
          content:
            `✅ **${result.username || username}** is now a Flux Rec **admin** (developer)! 🛡️\n` +
            `They'll need to re-log for the admin tools to unlock.`,
        });
      }
    } catch (err) {
      if (isNoSuchPlayer(err)) {
        await interaction.editReply({
          content: `❌ No Flux Rec account found with username **${username}**. Check the spelling — usernames are case-insensitive.`,
        });
      } else {
        await interaction.editReply({ content: `❌ Failed: ${err.message}` });
      }
    }
  },
};
