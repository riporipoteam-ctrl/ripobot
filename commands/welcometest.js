'use strict';

/**
 * !welcometest — staff preview of the new-member welcome card.
 *
 * Posts the exact same card the guildMemberAdd event sends, into #welcome,
 * for a chosen user (defaults to whoever ran it). Owner/Co-Owner only.
 * Works via ! prefix and natural-language routing; the slash variant
 * registers with Discord on the next deploy-commands run.
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');
const { findChannelByName } = require('../utils/modreport');
const { buildWelcomeEmbed } = require('../utils/welcomeCard');
const { isOwnerOrCoOwner } = require('./announce');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('welcometest')
    .setDescription('Preview the new-member welcome card in #welcome (Owner/Co-Owner only)')
    .addUserOption((o) =>
      o.setName('user').setDescription('Who to preview the card for (default: you)'),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false),

  async execute(interaction) {
    if (!isOwnerOrCoOwner(interaction.member)) {
      await failEphemeral(interaction, 'Only the Owner/Co-Owner can preview the welcome card.');
      return;
    }

    const guild = interaction.guild;
    if (!guild) {
      await failEphemeral(interaction, 'This only works inside the server.');
      return;
    }

    const channel = findChannelByName(guild, 'welcome');
    if (!channel) {
      await failEphemeral(interaction, "I can't find the #welcome channel.");
      return;
    }

    try {
      const targetUser = interaction.options.getUser('user') ?? interaction.user;
      // Fetch the guild member so we get their real server display name / join date.
      const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
      const memberLike = targetMember ?? {
        user: targetUser,
        displayName: targetUser.username,
      };

      const embed = buildWelcomeEmbed({
        member: memberLike,
        memberCount: guild.memberCount,
        joinedAtMs: targetMember?.joinedTimestamp ?? Date.now(),
      });

      await channel.send({ embeds: [embed] });
      await interaction.reply({
        content: `✅ Welcome card preview posted in ${channel}.`,
        ephemeral: true,
      });
    } catch (err) {
      console.error('[welcometest] failed:', err.message);
      await failEphemeral(interaction, 'Failed to post the preview.');
    }
  },
};
