'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { isOwnerOrCoOwner, adminApi } = require('../utils/flux');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fluxbans')
    .setDescription('List active Flux Rec bans (Owner/Co-Owner only)')
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

    await interaction.deferReply({ ephemeral: true });

    try {
      // GET /api/admin/v1/bans/list — see BACKEND_NEEDED.md (not yet implemented
      // on the backend; this degrades gracefully until it is).
      const data = await adminApi('/bans/list', 'GET');
      const bans = Array.isArray(data.bans) ? data.bans : [];
      if (bans.length === 0) {
        await interaction.editReply({ content: '✅ No active bans right now.' });
        return;
      }
      const lines = bans.slice(0, 25).map((b) => {
        const until = b.permanent ? 'permanent' : b.banExpires ? `until ${b.banExpires}` : 'timed';
        const voice = b.voiceBanned ? ' 🎙️voice-banned' : '';
        return `• **${b.username}** — ${until}${voice}\n  _${b.reason || 'no reason recorded'}_`;
      });
      await interaction.editReply({
        content: `🔨 **Active bans (${bans.length}):**\n${lines.join('\n')}`,
      });
    } catch (err) {
      if (err && err.status === 404) {
        await interaction.editReply({
          content:
            'ℹ️ The backend does not support ban listing yet (`GET /api/admin/v1/bans/list` → 404). ' +
            'Use `/fluxunban <username>` to lift a specific ban.',
        });
        return;
      }
      await interaction.editReply({ content: `❌ Failed: ${err.message}` });
    }
  },
};
