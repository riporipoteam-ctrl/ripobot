'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, Collection } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Bulk-delete messages from a channel')
    .addIntegerOption((o) =>
      o
        .setName('amount')
        .setDescription('How many messages to delete (1-100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100),
    )
    .addUserOption((o) => o.setName('user').setDescription('Only delete messages from this user'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false),

  async execute(interaction) {
    const amount = interaction.options.getInteger('amount', true);
    const user = interaction.options.getUser('user');

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      await failEphemeral(interaction, "You don't have permission to do that.");
      return;
    }
    const me = interaction.guild.members.me;
    if (!me.permissionsIn(interaction.channel).has(PermissionFlagsBits.ManageMessages)) {
      await failEphemeral(interaction, "I don't have Manage Messages permission in this channel.");
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const fetched = await interaction.channel.messages.fetch({ limit: amount });
      let targets = [...fetched.values()].filter((m) => !m.pinned);
      if (user) targets = targets.filter((m) => m.author.id === user.id);

      if (targets.length === 0) {
        await interaction.editReply('Nothing to delete (messages may be pinned).');
        return;
      }

      const now = Date.now();
      const fresh = targets.filter((m) => now - m.createdTimestamp < FOURTEEN_DAYS);
      const old = targets.filter((m) => now - m.createdTimestamp >= FOURTEEN_DAYS);

      let deleted = 0;

      // Bulk delete for messages younger than 14 days (Discord API limit).
      if (fresh.length > 0) {
        const coll = new Collection(fresh.map((m) => [m.id, m]));
        const res = await interaction.channel.bulkDelete(coll, true);
        deleted += res.size;
      }

      // Fallback: delete older messages one by one.
      for (const m of old) {
        try {
          await m.delete();
          deleted++;
        } catch {
          // Message already gone or undeletable — skip.
        }
      }

      const scope = user ? ` from **${user.tag}**` : '';
      await interaction.editReply(`🧹 Deleted ${deleted} message(s)${scope}.`);
    } catch (err) {
      console.error('[clear] failed:', err.message);
      try {
        await interaction.editReply('❌ Clear failed. I may be missing permissions.');
      } catch {
        // ignore
      }
    }
  },
};
