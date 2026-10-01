'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { isOwnerOrCoOwner, adminApi } = require('../utils/flux');

const STATUS_CATEGORY_NAME = 'Flux Rec Status';
const ONLINE_PREFIX = '🟢';
const ROOMS_PREFIX = '🎮';

/** Roles allowed to see the status category (Owner + Co-Owner, same gate as the commands). */
function staffRoles(guild) {
  return guild.roles.cache.filter((r) => {
    const name = String(r.name || '').toLowerCase();
    return name.includes('owner');
  });
}

function categoryOverwrites(guild) {
  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
  ];
  for (const [, role] of staffRoles(guild)) {
    overwrites.push({
      id: role.id,
      allow: [PermissionFlagsBits.ViewChannel],
    });
  }
  return overwrites;
}

/**
 * Update the Flux Rec Status channels with live player counts.
 * Called by /fluxstatus and by the periodic updater in index.js.
 * Idempotent: finds existing channels by emoji prefix and renames them,
 * so reboots never duplicate anything.
 */
async function updateStatusChannels(guild) {
  // GET /api/admin/v1/players/online -> { success, count, players: [{ username, accountId, room, roomId }] }
  const data = await adminApi('/players/online', 'GET');
  const count = data.count || 0;
  const players = Array.isArray(data.players) ? data.players : [];
  const inRooms = players.filter((p) => p.roomId != null).length;

  // Find or create the "Flux Rec Status" category (private: staff-only view).
  let category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === STATUS_CATEGORY_NAME
  );
  if (!category) {
    category = await guild.channels.create({
      name: STATUS_CATEGORY_NAME,
      type: ChannelType.GuildCategory,
      permissionOverwrites: categoryOverwrites(guild),
    });
  } else {
    // Repair permissions on existing categories (older setups were visible to everyone).
    try {
      await category.permissionOverwrites.set(categoryOverwrites(guild));
    } catch (err) {
      console.error('[fluxstatus] could not fix category perms:', err.message);
    }
  }

  const inCategory = (prefix) =>
    guild.channels.cache.find(
      (c) => c.parentId === category.id && String(c.name || '').startsWith(prefix)
    );

  async function upsertVoice(prefix, name) {
    let ch = inCategory(prefix);
    if (!ch) {
      ch = await guild.channels.create({
        name,
        type: ChannelType.GuildVoice,
        parent: category.id,
        // No explicit overwrites: voice channels inherit the category's
        // staff-only permissions. Nobody can join them anyway (Connect is
        // denied for @everyone via the category deny on ViewChannel).
      });
    } else if (ch.name !== name) {
      await ch.setName(name);
    }
    // Make sure a legacy channel keeps inheriting the private category perms.
    try {
      await ch.lockPermissions();
    } catch {
      // ignore — rename is the important part
    }
    return ch;
  }

  const onlineChannel = await upsertVoice(ONLINE_PREFIX, `${ONLINE_PREFIX} Players Online: ${count}`);
  const roomsChannel = await upsertVoice(ROOMS_PREFIX, `${ROOMS_PREFIX} In Rooms: ${inRooms}`);

  return { count, inRooms, category, onlineChannel, roomsChannel };
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
      const { count, inRooms } = await updateStatusChannels(interaction.guild);
      await interaction.editReply({
        content:
          `✅ **Flux Rec Status** is live (private — only Owner/Co-Owner can see it).\n` +
          `🟢 **${count}** players online · 🎮 **${inRooms}** in rooms.\n` +
          `The channel names update automatically every 5 minutes.`,
      });
    } catch (err) {
      await interaction.editReply({ content: `❌ Failed: ${err.message}` });
    }
  },

  // Exported for the periodic updater
  updateStatusChannels,
};
