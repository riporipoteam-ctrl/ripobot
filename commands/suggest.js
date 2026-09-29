'use strict';

/**
 * /suggest — post a suggestion for the community to vote on.
 *
 * Finds the guild's #suggestions-style text channel (name contains
 * "suggestions") and posts the idea as an embed with ✅ / ❌ voting
 * reactions. Anyone can use it. Nothing is sent if the channel is missing.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Post a suggestion for the community to vote on')
    .addStringOption((o) =>
      o
        .setName('idea')
        .setDescription('Your suggestion')
        .setRequired(true)
        .setMaxLength(1000),
    )
    .setDMPermission(false),

  async execute(interaction) {
    const idea = interaction.options.getString('idea', true);
    const guild = interaction.guild;

    if (!guild) {
      await interaction.reply({
        content: "😅 This command only works in a server.",
        ephemeral: true,
      });
      return;
    }

    let channel = null;
    try {
      channel =
        guild.channels.cache.find(
          (c) =>
            c.name.toLowerCase().includes('suggestions') &&
            c.isTextBased() &&
            !c.isThread(),
        ) ?? null;
    } catch {
      channel = null;
    }

    if (!channel) {
      await interaction.reply({
        content: "😅 There's no suggestions channel yet.",
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle('💡 New Suggestion')
      .setAuthor({ name: interaction.user.tag })
      .setDescription(idea)
      .setTimestamp();

    let message;
    try {
      message = await channel.send({ embeds: [embed] });
    } catch (err) {
      console.error('[suggest] failed to post suggestion:', err.message);
      await interaction.reply({
        content: '😅 Could not post your suggestion — I may be missing permission to send in that channel.',
        ephemeral: true,
      });
      return;
    }

    try {
      await message.react('✅');
    } catch {
      // Reactions missing — the suggestion is still posted.
    }
    try {
      await message.react('❌');
    } catch {
      // Reactions missing — the suggestion is still posted.
    }

    await interaction.reply({
      content: '✅ Suggestion posted!',
      ephemeral: true,
    });
  },
};
