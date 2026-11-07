'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const {
  clearFluxLoadingScreen,
  isOwnerOrCoOwner,
  setFluxLoadingScreen,
} = require('../utils/flux');

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg']);

async function mayManage(interaction) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  const member = interaction.member?.roles?.cache
    ? interaction.member
    : await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
  return isOwnerOrCoOwner(member);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fluxloadingscreen')
    .setDescription('Set the global Flux Rec room loading screen (staff only)')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('set')
        .setDescription('Upload a screen shown when players switch rooms')
        .addStringOption((option) =>
          option.setName('title').setDescription('Loading screen title').setRequired(true).setMaxLength(120)
        )
        .addStringOption((option) =>
          option
            .setName('description')
            .setDescription('Short loading screen description')
            .setRequired(true)
            .setMaxLength(240)
        )
        .addAttachmentOption((option) =>
          option.setName('image').setDescription('PNG or JPEG, up to 4 MB').setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('clear').setDescription('Restore each room’s own loading screen')
    )
    .setDMPermission(false),

  async execute(interaction) {
    if (!(await mayManage(interaction))) {
      await interaction.reply({
        content: 'Only the Owner, Co-Owner, or a Discord Administrator can manage Flux Rec loading screens.',
        ephemeral: true,
      });
      return;
    }

    const action = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });
    try {
      if (action === 'clear') {
        await clearFluxLoadingScreen();
        await interaction.editReply('✅ Global loading screen cleared. Rooms will show their saved loading screens again.');
        return;
      }

      const title = interaction.options.getString('title', true).trim();
      const subtitle = interaction.options.getString('description', true).trim();
      const attachment = interaction.options.getAttachment('image', true);
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
      if (bytes.byteLength <= 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
        await interaction.editReply('The downloaded image must be smaller than 4 MB.');
        return;
      }

      await setFluxLoadingScreen({
        title,
        subtitle,
        image: {
          bytes,
          contentType,
          filename: contentType === 'image/png' ? 'loading-screen.png' : 'loading-screen.jpg',
        },
      });
      await interaction.editReply(`✅ **${title}** is now shown to players as they switch rooms.`);
    } catch (error) {
      console.error('[fluxloadingscreen] failed:', error.message);
      await interaction.editReply(`❌ Failed to update the global loading screen: ${error.message}`);
    }
  },
};
