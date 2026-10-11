'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { isOwnerOrCoOwner, adminApi } = require('../utils/flux');
const { normalizeChannelName } = require('../utils/modreport');

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
  // v7.8: Everyone can SEE the status (Armin's order) — but cannot join the
  // voice channels (they're status displays, not real voice channels).
  // v7.10: The bot itself MUST have an explicit allow overwrite, otherwise
  // "Missing Access" when the category is private and the bot isn't listed.
  const overwrites = [
    {
      id: guild.roles.everyone.id,
      allow: [PermissionFlagsBits.ViewChannel],
      deny: [PermissionFlagsBits.Connect],
    },
  ];
  // Bot's own role: allow View + Manage so it can update channel names.
  // Find the bot's role (the managed role for this application).
  const botRole = guild.roles.cache.find(
    (r) => r.managed && r.members.has(guild.client.user.id)
  );
  if (botRole) {
    overwrites.push({
      id: botRole.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.Connect,
      ],
    });
  }
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
  // v7.6: normalized name match — the category may be decorated/renamed
  // (e.g. "✦ FLUX REC STATUS ✦"); exact matching would create a duplicate.
  const wantCategory = normalizeChannelName(STATUS_CATEGORY_NAME);
  let category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && normalizeChannelName(c.name) === wantCategory
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

  // v7.7: Position the status category ABOVE the main FLUX REC category.
  // Armin's order: FLUX REC STATUS must be above FLUX REC (main).
  try {
    const allCats = guild.channels.cache
      .filter((c) => c.type === ChannelType.GuildCategory)
      .sort((a, b) => a.position - b.position);
    // Find the main FLUX REC category (not the status one)
    const mainCat = allCats.find((c) => {
      const n = (c.name || '').toLowerCase();
      return n.includes('flux rec') && !n.includes('status');
    });
    if (mainCat && category.position > mainCat.position) {
      // Move status category to just above the main category
      await category.setPosition(mainCat.position);
      console.log('[fluxstatus] moved status category above main FLUX REC');
    }
  } catch (err) {
    console.error('[fluxstatus] could not reposition category:', err.message);
  }

  const inCategory = (prefix) =>
    guild.channels.cache.find(
      (c) => c.parentId === category.id && String(c.name || '').startsWith(prefix)
    );

  // v7.9: find status channels by their label, not emoji prefix — the emoji
  // changes with the count (🔴 when 0, 🟢 otherwise).
  const inCategoryByLabel = (label) =>
    guild.channels.cache.find(
      (c) => c.parentId === category.id && String(c.name || '').includes(label)
    );

  async function upsertVoice(prefix, name, label) {
    let ch = inCategoryByLabel(label);
    if (!ch) {
      ch = await guild.channels.create({
        name,
        type: ChannelType.GuildVoice,
        parent: category.id,
        // No explicit overwrites: voice channels inherit the category's
        // permissions. Nobody can join them anyway (Connect is denied
        // for @everyone at the category level).
      });
    } else if (ch.name !== name) {
      await ch.setName(name);
    }
    // Make sure a legacy channel keeps inheriting the category perms.
    try {
      await ch.lockPermissions();
    } catch {
      // ignore — rename is the important part
    }
    return ch;
  }

  // v7.9: 🔴 when nobody is online, 🟢 otherwise (Armin's order).
  const onlineEmoji = count > 0 ? '🟢' : '🔴';
  const roomsEmoji = inRooms > 0 ? '🎮' : '🎮';
  const onlineChannel = await upsertVoice(onlineEmoji, `${onlineEmoji} Players Online: ${count}`, 'Players Online:');
  const roomsChannel = await upsertVoice(roomsEmoji, `${roomsEmoji} In Rooms: ${inRooms}`, 'In Rooms:');

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
