'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

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

async function adminApi(path, method) {
  const key = process.env.FLUXREC_ADMIN_KEY;
  if (!key) throw new Error('Admin API key not configured');
  const res = await fetch(`${ADMIN_API}${path}`, {
    method,
    headers: { 'X-Admin-Key': key },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `API error: ${res.status}`);
  return data;
}

/**
 * Update the Flux Rec Status channels with live player counts.
 * Called by /fluxstatus and by the periodic updater.
 */
async function updateStatusChannels(guild) {
  try {
    const data = await adminApi('/players/online', 'GET');
    const count = data.count || 0;

    // Find or create the "Flux Rec Status" category
    let category = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name === 'Flux Rec Status'
    );
    if (!category) {
      category = await guild.channels.create({
        name: 'Flux Rec Status',
        type: ChannelType.GuildCategory,
      });
    }

    // Find or create the voice channels
    let onlineChannel = guild.channels.cache.find(
      (c) => c.parentId === category.id && c.name.startsWith('🟢')
    );
    if (!onlineChannel) {
      onlineChannel = await guild.channels.create({
        name: `🟢 Online: ${count}`,
        type: ChannelType.GuildVoice,
        parent: category.id,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.Connect],
            allow: [PermissionFlagsBits.ViewChannel],
          },
        ],
      });
    } else {
      await onlineChannel.setName(`🟢 Online: ${count}`);
    }

    return { count, category, onlineChannel };
  } catch (err) {
    console.error('[fluxstatus] update failed:', err.message);
    throw err;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fluxstatus')
    .setDescription('Set up Flux Rec live status channels (Owner/Co-Owner only)')
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
      const { count } = await updateStatusChannels(interaction.guild);
      await interaction.editReply({
        content: `✅ **Flux Rec Status** category created!\n🟢 Currently **${count}** players online.\nThe channel names will update automatically every 5 minutes.`,
      });
    } catch (err) {
      await interaction.editReply({ content: `❌ Failed: ${err.message}` });
    }
  },

  // Export for the periodic updater
  updateStatusChannels,
};
