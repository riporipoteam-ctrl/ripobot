'use strict';

/**
 * /privatechat — open a private 1-on-1 thread with the bot.
 *
 * Must be run in a normal guild text channel (not inside a thread, not in DMs).
 * The bot posts its intro message inside the new thread and confirms
 * ephemerally to the invoker.
 */

const { SlashCommandBuilder } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');
const { createPrivateThread } = require('../utils/privatethreads');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('privatechat')
    .setDescription('Open a private thread to chat with RipoBot 1-on-1')
    .setDMPermission(false),

  async execute(interaction) {
    if (!interaction.guild) {
      await failEphemeral(interaction, 'This command can only be used inside a server.');
      return;
    }

    if (interaction.channel?.isThread?.()) {
      await failEphemeral(interaction, 'Use /privatechat in a normal channel.');
      return;
    }

    const thread = await createPrivateThread(interaction.channel, interaction.user);

    if (!thread) {
      await failEphemeral(interaction, '😅 Could not create the private thread.');
      return;
    }

    await interaction.reply({
      content: `🔒 Your private thread is ready! ${thread}`,
      ephemeral: true,
    });
  },
};
