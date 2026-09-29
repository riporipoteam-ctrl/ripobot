'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');
const { getWarns } = require('../utils/storage');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription("List a user's warnings")
    .addUserOption((o) => o.setName('user').setDescription('User to check').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const user = interaction.options.getUser('user', true);

    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      await failEphemeral(interaction, "You don't have permission to do that.");
      return;
    }

    let warns;
    try {
      warns = getWarns(interaction.guildId, user.id);
    } catch (err) {
      console.error('[warnings] storage failed:', err.message);
      await failEphemeral(interaction, 'Could not read warnings. Try again.');
      return;
    }

    if (warns.length === 0) {
      await interaction.reply({ content: `✅ **${user.tag}** has no warnings.`, ephemeral: true });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xffa500)
      .setTitle(`⚠️ Warnings for ${user.tag}`)
      .setDescription(`Total: ${warns.length}`)
      .setThumbnail(user.displayAvatarURL())
      .setTimestamp();

    for (const w of warns.slice(0, 25)) {
      const date = new Date(w.createdAt).toLocaleString();
      embed.addFields({
        name: `#${w.id} — ${date}`,
        value: `${w.reason}\n*by ${w.moderatorTag}*`,
      });
    }
    if (warns.length > 25) {
      embed.setFooter({ text: `Showing 25 of ${warns.length} warnings` });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
