'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createFluxAnnouncement, isOwnerOrCoOwner } = require('../utils/flux');

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg']);

async function mayPublish(interaction) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;

  // The interaction payload may contain only the API member shape, which has
  // role IDs instead of the cached role collection used by isOwnerOrCoOwner.
  const member = interaction.member?.roles?.cache
    ? interaction.member
    : await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
  return isOwnerOrCoOwner(member);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fluxannounce')
    .setDescription('Publish an announcement to Flux Rec players (Owner/Admin only)')
    .addStringOption((option) =>
      option
        .setName('title')
        .setDescription('Announcement title')
        .setRequired(true)
        .setMaxLength(120)
    )
    .addStringOption((option) =>
      option
        .setName('description')
        .setDescription('Announcement text shown to players')
        .setRequired(true)
        .setMaxLength(4000)
    )
    .addAttachmentOption((option) =>
      option.setName('image').setDescription('Optional PNG or JPEG image, up to 4 MB')
    )
    .setDMPermission(false),

  async execute(interaction) {
    if (!(await mayPublish(interaction))) {
      await interaction.reply({
        content: 'Only the Owner, Co-Owner, or a Discord Administrator can publish Flux Rec announcements.',
        ephemeral: true,
      });
      return;
    }

    const title = interaction.options.getString('title', true).trim();
    const body = interaction.options.getString('description', true).trim();
    const attachment = interaction.options.getAttachment('image');
    await interaction.deferReply({ ephemeral: true });

    try {
      let image;
      if (attachment) {
        const contentType = String(attachment.contentType || '').toLowerCase();
        if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
          await interaction.editReply('Attach a PNG or JPEG image.');
          return;
        }
        if (attachment.size <= 0 || attachment.size > MAX_IMAGE_BYTES) {
          await interaction.editReply('The image must be smaller than 4 MB.');
          return;
        }

        const response = await fetch(attachment.url);
        if (!response.ok) throw new Error(`Discord image download failed (${response.status}).`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength > MAX_IMAGE_BYTES) {
          await interaction.editReply('The downloaded image is larger than 4 MB.');
          return;
        }
        image = {
          bytes,
          contentType,
          filename: contentType === 'image/png' ? 'announcement.png' : 'announcement.jpg',
        };
      }

      const result = await createFluxAnnouncement({ title, body, image });
      const live = Number.isInteger(result.delivered)
        ? ` Pushed to ${result.delivered} connected game clients.`
        : '';
      await interaction.editReply(`✅ **${title}** is saved to Flux Rec's Official announcements.${live}`);
    } catch (error) {
      console.error('[fluxannounce] failed:', error.message);
      await interaction.editReply(`❌ Failed to publish the announcement: ${error.message}`);
    }
  },
};

