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
    .setName('fluxplus')
    .setDescription('Give or remove Flux Rec+ membership (Owner/Co-Owner only)')
    .addStringOption((o) =>
      o.setName('username').setDescription('Flux Rec username').setRequired(true)
    )
    .addIntegerOption((o) =>
      o
        .setName('duration')
        .setDescription('Duration in months (0 = never expires, -1 = remove)')
        .setRequired(true)
        .addChoices(
          { name: '1 month', value: 1 },
          { name: '2 months', value: 2 },
          { name: '6 months', value: 6 },
          { name: '12 months', value: 12 },
          { name: 'Never expires', value: 0 },
          { name: 'Remove membership', value: -1 }
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
    const duration = interaction.options.getInteger('duration', true);

    await interaction.deferReply({ ephemeral: true });

    try {
      await adminApi('/membership/set', 'POST', {
        username,
        duration_months: duration,
      });
      let msg;
      if (duration === -1) {
        msg = `✅ Flux Rec+ membership removed from **${username}**.`;
      } else if (duration === 0) {
        msg = `✅ **${username}** now has **Flux Rec+ (never expires)**! 🎉`;
      } else {
        msg = `✅ **${username}** now has **Flux Rec+ for ${duration} month${duration > 1 ? 's' : ''}**! 🎉`;
      }
      msg += '\nThey\'ll need to re-log for it to take full effect.';
      await interaction.editReply({ content: msg });
    } catch (err) {
      await interaction.editReply({ content: `❌ Failed: ${err.message}` });
    }
  },
};
