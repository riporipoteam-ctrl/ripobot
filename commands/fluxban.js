'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const ADMIN_API = 'https://api.ripo-ripoteam.workers.dev/api/admin/v1';

function isOwnerOrCoOwner(member) {
  if (!member) return false;
  if (member.id === member.guild.ownerId) return true;
  const roles = member.roles.cache;
  for (const [, role] of roles) {
    const name = role.name.toLowerCase();
    if (name.includes('owner') && !name.includes('co-owner')) return true;
    if (name.includes('co-owner') || name.includes('coowner')) return true;
  }
  return false;
}

async function adminApi(path, method, body) {
  const key = process.env.FLUXREC_ADMIN_KEY;
  if (!key) throw new Error('Admin API key not configured');
  const res = await fetch(`${ADMIN_API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Admin-Key': key },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `API error: ${res.status}`);
  return data;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fluxban')
    .setDescription('Ban a Flux Rec player (Owner/Co-Owner only)')
    .addStringOption((o) =>
      o.setName('username').setDescription('Flux Rec username').setRequired(true)
    )
    .addStringOption((o) =>
      o.setName('reason').setDescription('Ban reason (shown in-game)').setRequired(true).setMaxLength(512)
    )
    .addIntegerOption((o) =>
      o
        .setName('duration')
        .setDescription('Duration in minutes (0 = permanent)')
        .setRequired(false)
        .addChoices(
          { name: 'Permanent', value: 0 },
          { name: '10 minutes', value: 10 },
          { name: '1 hour', value: 60 },
          { name: '24 hours', value: 1440 },
          { name: '7 days', value: 10080 }
        )
    )
    .addBooleanOption((o) =>
      o.setName('voice_ban').setDescription('Also ban from voice chat').setRequired(false)
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
    const reason = interaction.options.getString('reason', true);
    const duration = interaction.options.getInteger('duration') ?? 0;
    const voiceBan = interaction.options.getBoolean('voice_ban') ?? false;

    await interaction.deferReply({ ephemeral: true });

    try {
      await adminApi('/bans/create', 'POST', {
        username,
        reason,
        duration_minutes: duration,
        voice_ban: voiceBan,
      });
      const durText = duration === 0 ? 'permanently' : `for ${duration} minutes`;
      const voiceText = voiceBan ? ' (including voice chat)' : '';
      await interaction.editReply({
        content: `🔨 **${username}** has been banned ${durText}${voiceText}.\nReason: ${reason}`,
      });
    } catch (err) {
      await interaction.editReply({ content: `❌ Failed: ${err.message}` });
    }
  },
};
