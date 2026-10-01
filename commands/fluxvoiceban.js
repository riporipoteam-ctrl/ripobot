'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { isOwnerOrCoOwner, adminApi, isNoSuchPlayer } = require('../utils/flux');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fluxvoiceban')
    .setDescription("Voice-ban a Flux Rec player (they keep playing, can't speak) (Owner/Co-Owner only)")
    .addStringOption((o) =>
      o.setName('username').setDescription('Flux Rec username').setRequired(true)
    )
    .addIntegerOption((o) =>
      o
        .setName('duration')
        .setDescription('How long the voice ban lasts')
        .setRequired(false)
        .addChoices(
          { name: 'Permanent', value: 0 },
          { name: '10 minutes', value: 10 },
          { name: '1 hour', value: 60 },
          { name: '24 hours', value: 1440 },
          { name: '7 days', value: 10080 },
          { name: 'Remove voice ban', value: -1 }
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

    const username = interaction.options.getString('username', true);
    const duration = interaction.options.getInteger('duration') ?? 0;
    await interaction.deferReply({ ephemeral: true });

    try {
      // POST /api/admin/v1/voiceban/set { username, duration_minutes }
      // 0 = permanent, positive = timed, -1 = remove. Enforced by matchmaking
      // (no voice server from connection-info) — the account itself is NOT banned.
      const result = await adminApi('/voiceban/set', 'POST', {
        username,
        duration_minutes: duration,
      });
      if (duration === -1) {
        await interaction.editReply({
          content: `✅ Voice ban removed for **${result.username}** — they can speak in-game again.`,
        });
      } else {
        const durText = duration === 0 ? 'permanently' : `for ${duration} minutes`;
        await interaction.editReply({
          content: `🎙️🔨 **${result.username}** has been voice-banned ${durText}.\nThey can still play — they just can't use voice chat.`,
        });
      }
    } catch (err) {
      await interaction.editReply({
        content: isNoSuchPlayer(err)
          ? `❌ No Flux Rec account named **${username}**.`
          : `❌ Failed: ${err.message}`,
      });
    }
  },
};
