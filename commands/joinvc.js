'use strict';

/**
 * /joinvc — RipoBot joins YOUR voice channel and says hi in its own voice.
 * Works in any server channel. If you're not in a voice channel, it tells
 * you to join one first.
 */

const { SlashCommandBuilder } = require('discord.js');
const voice = require('../utils/voice');

const GREETING = "RipoBot's in the building! what's good?";

module.exports = {
  data: new SlashCommandBuilder()
    .setName('joinvc')
    .setDescription('Try to join your voice channel (blocked on this host — /speak works instead)')
    .setDMPermission(false),

  async execute(interaction) {
    const vc = interaction.member?.voice?.channel;
    if (!vc) {
      await interaction.reply({
        content: '👀 Join a voice channel first, then run /joinvc and I\'ll hop in!',
        ephemeral: true,
      });
      return;
    }
    await interaction.deferReply();
    const ok = await voice.joinVoice(vc);
    if (!ok) {
      await interaction.editReply('😅 Bad news — my host blocks voice connections, so I can\'t join voice channels. But /speak works — I\'ll talk to you there! 🎙️');
      return;
    }
    await interaction.editReply(`🎙️ Joined **${vc.name}** — say hi! (I leave on my own if everyone dips.)`);
    voice.speak(GREETING, 'ripobot').catch(() => {});
  },
};
