'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { adminApi, isOwnerOrCoOwner, isNoSuchPlayer } = require('../utils/flux');

async function mayManageLevels(interaction) {
  const member = interaction.member?.roles?.cache
    ? interaction.member
    : await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
  return isOwnerOrCoOwner(member);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fluxlevel')
    .setDescription('Set a Flux Rec player’s level (Owner/Co-Owner only)')
    .addStringOption((option) =>
      option.setName('username').setDescription('Flux Rec username').setRequired(true).setMaxLength(64)
    )
    .addIntegerOption((option) =>
      option
        .setName('level')
        .setDescription('Target level (1–50)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(50)
    )
    .setDMPermission(false),

  async execute(interaction) {
    if (!(await mayManageLevels(interaction))) {
      await interaction.reply({
        content: 'Only the Flux Rec Owner or Co-Owner can change player levels.',
        ephemeral: true,
      });
      return;
    }

    const username = interaction.options.getString('username', true).trim();
    const level = interaction.options.getInteger('level', true);
    await interaction.deferReply({ ephemeral: true });
    try {
      const result = await adminApi('/progression/set', 'POST', { username, level });
      await interaction.editReply(
        `✅ **${result.username || username}** is now level **${result.level}** (was ${result.previousLevel}). XP within the level was reset to 0. This command sets progression only; it does not create or open a reward box.`
      );
    } catch (error) {
      if (isNoSuchPlayer(error)) {
        await interaction.editReply(`❌ No Flux Rec account found with username **${username}**.`);
      } else {
        console.error('[fluxlevel] failed:', error.message);
        await interaction.editReply(`❌ Failed to set the Flux Rec level: ${error.message}`);
      }
    }
  },
};
