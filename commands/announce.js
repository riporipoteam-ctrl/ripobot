'use strict';

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
} = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

const OWNER_ROLE_NAMES = ['👑 Owner', '🛡️ Co-Owner'];

/** Exact role-name match: only 👑 Owner / 🛡️ Co-Owner. */
function isOwnerOrCoOwner(member) {
  return !!member?.roles?.cache?.some((r) => OWNER_ROLE_NAMES.includes(r.name));
}

/** Shared embed builder — used by /announce and natural-language announcements. */
function buildAnnouncementEmbed({ title, message, authorTag, imageUrl }) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📢 ${title}`)
    .setDescription(message)
    .setFooter({ text: `Posted by ${authorTag}` })
    .setTimestamp();

  if (imageUrl) {
    embed.setImage(imageUrl);
  }

  return embed;
}

/**
 * Post an announcement embed to a channel.
 * Returns { ok: true } or { ok: false, reason }.
 */
async function postAnnouncement({ channel, title, message, pingRoleId, authorTag, guild, imageUrl }) {
  const me = guild.members.me;
  const perms = me.permissionsIn(channel);
  if (!perms.has(PermissionFlagsBits.ViewChannel) || !perms.has(PermissionFlagsBits.SendMessages)) {
    return { ok: false, reason: "I can't post in that channel." };
  }

  const embed = buildAnnouncementEmbed({ title, message, authorTag, imageUrl });

  let content;
  if (pingRoleId) {
    if (!perms.has(PermissionFlagsBits.MentionEveryone)) {
      return { ok: false, reason: 'I need Mention Everyone permission to ping that role.' };
    }
    content = `<@&${pingRoleId}>`;
  }

  try {
    await channel.send({ content, embeds: [embed] });
    return { ok: true };
  } catch (err) {
    console.error('[announce] failed:', err.message);
    return { ok: false, reason: 'Failed to post the announcement.' };
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Post a styled announcement embed to a channel (Owner/Co-Owner only)')
    .addChannelOption((o) =>
      o
        .setName('channel')
        .setDescription('Channel to post in')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true),
    )
    .addStringOption((o) =>
      o.setName('title').setDescription('Announcement title').setRequired(true).setMaxLength(256),
    )
    .addStringOption((o) =>
      o
        .setName('message')
        .setDescription('Announcement body')
        .setRequired(true)
        .setMaxLength(4000),
    )
    .addRoleOption((o) => o.setName('ping_role').setDescription('Role to ping (optional)'))
    .addAttachmentOption((o) =>
      o.setName('image').setDescription('Optional image to attach to the announcement'),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false),

  async execute(interaction) {
    if (!isOwnerOrCoOwner(interaction.member)) {
      await failEphemeral(interaction, 'Only the Owner/Co-Owner can post announcements.');
      return;
    }

    const channel = interaction.options.getChannel('channel', true);
    const title = interaction.options.getString('title', true);
    const message = interaction.options.getString('message', true);
    const pingRole = interaction.options.getRole('ping_role');
    const image = interaction.options.getAttachment('image');

    if (image && !image.contentType?.startsWith('image/')) {
      await failEphemeral(interaction, 'Please attach an image file.');
      return;
    }

    const result = await postAnnouncement({
      channel,
      title,
      message,
      pingRoleId: pingRole?.id,
      authorTag: interaction.user.tag,
      guild: interaction.guild,
      imageUrl: image?.url,
    });

    if (!result.ok) {
      await failEphemeral(interaction, result.reason);
      return;
    }

    await interaction.reply({
      content: `✅ Announcement posted in ${channel}.`,
      ephemeral: true,
    });
  },

  // Shared with utils/nl.js (natural-language announcements).
  buildAnnouncementEmbed,
  postAnnouncement,
  isOwnerOrCoOwner,
  OWNER_ROLE_NAMES,
};
