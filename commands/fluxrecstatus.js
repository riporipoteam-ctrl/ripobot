'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { isOwnerOrCoOwner, adminApi } = require('../utils/flux');
const { normalizeChannelName } = require('../utils/modreport');

const CATEGORY_NAME = '| Server Status |';

// Channel name prefixes (used to find existing channels for idempotent updates)
const WEBSITE_PREFIX = '🌐';
const GAMESERVER_PREFIX = '🟡';
const BOTSTATUS_PREFIX = '🔴';
const PLAYERS_PREFIX = '🎮';

const WEBSITE_URL = 'https://flux.sitey.my';

/**
 * Check if the Flux Rec game backend is reachable.
 * Returns 'Online' / 'Developing' / 'Offline'.
 */
async function checkGameServer() {
  try {
    const res = await fetch('https://api.ripo-ripoteam.workers.dev/api/config/v2', {
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return { label: 'Online', emoji: '🟢' };
    return { label: 'Issues', emoji: '🟡' };
  } catch {
    return { label: 'Offline', emoji: '🔴' };
  }
}

/**
 * Set up (or refresh) the Server Status category with live status channels.
 * Idempotent: finds existing channels by emoji prefix and renames them.
 */
async function setupStatusChannels(guild) {
  // Find or create the category (visible to everyone, read-only channels inside).
  // v7.6: normalized name match so later decoration/renames don't duplicate it.
  const wantCategory = normalizeChannelName(CATEGORY_NAME);
  let category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && normalizeChannelName(c.name) === wantCategory
  );
  if (!category) {
    category = await guild.channels.create({
      name: CATEGORY_NAME,
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          allow: [PermissionFlagsBits.ViewChannel],
          deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect],
        },
      ],
    });
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
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            allow: [PermissionFlagsBits.ViewChannel],
            deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
          },
        ],
      });
    } else if (ch.name !== name) {
      await ch.setName(name);
    }
    return ch;
  }

  // Gather live data
  let playerCount = 0;
  try {
    const data = await adminApi('/players/online', 'GET');
    playerCount = data.count || 0;
  } catch {
    // Admin API down — show 0, don't fail the whole setup
  }

  const gameServer = await checkGameServer();

  // Bot is running this command, so it's online
  const botStatus = { label: 'Online', emoji: '🟢' };

  await upsertVoice(WEBSITE_PREFIX, `${WEBSITE_PREFIX} | Website: ${WEBSITE_URL}`);
  await upsertVoice(
    GAMESERVER_PREFIX,
    `${gameServer.emoji} | Game Server: ${gameServer.label}`
  );
  await upsertVoice(
    BOTSTATUS_PREFIX,
    `${botStatus.emoji} | Bot Status: ${botStatus.label}`
  );
  await upsertVoice(PLAYERS_PREFIX, `${PLAYERS_PREFIX} | Players Online: ${playerCount}`);

  return { playerCount, gameServer, botStatus };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fluxrecstatus')
    .setDescription('Set up the Server Status category with live status channels (Owner only)')
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
      const { playerCount, gameServer } = await setupStatusChannels(interaction.guild);
      await interaction.editReply({
        content:
          `✅ **Server Status** category is live!\n` +
          `🌐 Website: ${WEBSITE_URL}\n` +
          `${gameServer.emoji} Game Server: ${gameServer.label}\n` +
          `🟢 Bot Status: Online\n` +
          `🎮 Players Online: ${playerCount}\n\n` +
          `Channels update when you re-run this command.`,
      });
    } catch (err) {
      await interaction.editReply({ content: `❌ Failed: ${err.message}` });
    }
  },

  setupStatusChannels,
};
