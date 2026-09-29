'use strict';

/**
 * /leavevc — RipoBot says bye in its own voice and leaves the voice channel.
 */

const { SlashCommandBuilder } = require('discord.js');
const voice = require('../utils/voice');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leavevc')
    .setDescription('RipoBot leaves the voice channel')
    .setDMPermission(false),

  async execute(interaction) {
    if (!voice.isInVoice()) {
      await interaction.reply({ content: "I'm not in a voice channel right now.", ephemeral: true });
      return;
    }
    await interaction.deferReply();
    // Say bye first, THEN leave — the goodbye needs the connection.
    await voice.speak("alright, I'm heading out! catch you later!", 'ripobot').catch(() => {});
    voice.leaveVoice();
    await interaction.editReply('👋 Left the voice channel.');
  },
};
