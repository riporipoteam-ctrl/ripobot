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
        await adminApi('/tokens/grant', 'POST', { grant_to: 'everyone', amount });
        await interaction.editReply({
          content: `✅ Gave **${amount.toLocaleString()}** tokens to **everyone**! 🪙`,
        });
      } else {
        await adminApi('/tokens/grant', 'POST', { username: target, amount });
        await interaction.editReply({
          content: `✅ Gave **${amount.toLocaleString()}** tokens to **${target}**! 🪙`,
        });
      }
    } catch (err) {
      await interaction.editReply({ content: `❌ Failed: ${err.message}` });
    }
  },
};
