'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

// Admin API base URL
const ADMIN_API = 'https://api.ripo-ripoteam.workers.dev/api/admin/v1';

/**
 * Check if member is Owner or Co-Owner (by role name)
 */
function isOwnerOrCoOwner(member) {
  if (!member) return false;
  // Server owner always qualifies
  if (member.id === member.guild.ownerId) return true;
  // Check for Owner/Co-Owner roles by name
  const roles = member.roles.cache;
  for (const [, role] of roles) {
    const name = role.name.toLowerCase();
    if (name.includes('owner') && !name.includes('co-owner')) return true;
    if (name.includes('co-owner') || name.includes('coowner')) return true;
  }
  return false;
}

/**
 * Call the admin API
 */
async function adminApi(path, method, body) {
  const key = process.env.FLUXREC_ADMIN_KEY;
  if (!key) {
    throw new Error('Admin API key not configured');
  }
  const res = await fetch(`${ADMIN_API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': key,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || `API error: ${res.status}`);
  }
  return data;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fluxrank')
    .setDescription('Give or remove a Flux Rec rank (Owner/Co-Owner only)')
    .addStringOption((o) =>
      o.setName('username').setDescription('Flux Rec username').setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName('rank')
        .setDescription('Rank to give (or "none" to remove)')
        .setRequired(true)
        .addChoices(
          { name: 'Community Mod', value: 'community_mod' },
          { name: 'Developer', value: 'developer' },
          { name: 'Remove rank', value: 'none' }
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
    const rank = interaction.options.getString('rank', true);

    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await adminApi('/ranks/set', 'POST', { username, rank });
      const rankName =
        rank === 'none' ? 'removed' : rank === 'community_mod' ? 'Community Mod' : 'Developer';
      await interaction.editReply({
        content:
          rank === 'none'
            ? `✅ Rank removed from **${username}**. They'll need to re-log for it to take effect.`
            : `✅ **${username}** is now a **${rankName}**! They'll need to re-log for the tools to unlock.`,
      });
    } catch (err) {
      await interaction.editReply({
        content: `❌ Failed: ${err.message}`,
      });
    }
  },
};
