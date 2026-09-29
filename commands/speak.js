'use strict';

/**
 * /speak — Owner/Co-Owner only. Neural TTS (Microsoft Edge read-aloud,
 * free/keyless via utils/edgetts.js) delivered as a WAV file attachment
 * (PRIMARY delivery). If the invoker is in a voice channel, ALSO speaks it
 * there live (SECONDARY, best-effort).
 *
 * v7.0: rebuilt on edge-tts — the old Hugging Face TTS model is unusable
 * (402: monthly credits depleted) and sounded robotic. Edge voices are
 * neural, per-bot (RipoBot = Guy), and need no token at all.
 */

const { SlashCommandBuilder } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');
const { OWNER_ROLE_NAMES } = require('./announce');
const edgetts = require('../utils/edgetts');
const voice = require('../utils/voice');

const VOICE_DOWN = "🔇 Voice isn't available right now.";

/** Generate neural speech as a WAV buffer. { ok, wav } / { ok:false, reason }. */
async function ttsWav(text) {
  try {
    const wav = await edgetts.synthesizeWav(text, 'ripobot');
    if (!wav) return { ok: false, reason: 'tts-failed' };
    return { ok: true, wav };
  } catch (err) {
    console.error('[speak] TTS failed:', err.message);
    return { ok: false, reason: 'tts-failed' };
  }
}

/**
 * Speak text in a voice channel (join → speak → leave), unless the bot is
 * already hanging out in a voice channel — then it just speaks where it is
 * (never hijacks a different channel mid-hangout).
 * Kept signature-compatible with the old version for utils/nl.js.
 * Returns { ok: true } or { ok: false, reason }.
 */
async function speakInVoiceChannel(guild, voiceChannel, text) {
  try {
    const alreadyIn = voice.isInVoice();
    const sameChannel = alreadyIn && voice.currentVoiceChannelId() === voiceChannel.id;
    if (alreadyIn && !sameChannel) return { ok: false, reason: 'busy' };
    if (!alreadyIn) {
      const joined = await voice.joinVoice(voiceChannel);
      if (!joined) return { ok: false, reason: 'voice-down' };
    }
    const said = await voice.speak(text, 'ripobot');
    if (!alreadyIn) {
      // Old behavior: leave after the one-off line. Small delay so the
      // goodbye doesn't clip the tail of the audio.
      setTimeout(() => voice.leaveVoice(), 2500);
    }
    return said ? { ok: true } : { ok: false, reason: 'tts-failed' };
  } catch (err) {
    console.error('[speak] speakInVoiceChannel failed:', err.message);
    return { ok: false, reason: 'voice-down' };
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('speak')
    .setDescription('Speak text in a neural voice (WAV file + voice channel) — Owner/Co-Owner only')
    .addStringOption((o) =>
      o.setName('text').setDescription('Text to speak (max 300 chars)').setRequired(true).setMaxLength(300),
    )
    .setDMPermission(false),

  async execute(interaction) {
    if (!interaction.member?.roles?.cache?.some((r) => OWNER_ROLE_NAMES.includes(r.name))) {
      await failEphemeral(interaction, 'Only the Owner/Co-Owner can use voice.');
      return;
    }

    const text = interaction.options.getString('text', true);
    await interaction.deferReply();

    // Step 1: generate the neural audio.
    const tts = await ttsWav(text);
    if (!tts.ok) {
      await interaction.editReply('😅 Could not generate speech — try again in a bit!');
      return;
    }

    // Step 2 (PRIMARY): deliver the WAV as a public attachment.
    await interaction.editReply({
      content: `🔊 "${text}"`,
      files: [{ attachment: tts.wav, name: 'ripo-speak.wav' }],
    });

    // Step 3 (SECONDARY, best-effort): also speak it live if the invoker is
    // in a voice channel. edgetts caches, so this re-synthesis is instant.
    const voiceChannel = interaction.member?.voice?.channel;
    if (voiceChannel) {
      const result = await speakInVoiceChannel(interaction.guild, voiceChannel, text);
      if (!result.ok && result.reason !== 'busy') {
        console.error('[speak] live voice playback failed:', result.reason);
      }
    }
  },

  // Shared with utils/nl.js (natural-language speak).
  speakInVoiceChannel,
  ttsWav,
  // v7.0: honest availability — true when the neural TTS pipeline loaded.
  // (Live Discord audibility still needs a real voice-channel test.)
  voiceAvailable: () => !!edgetts && typeof edgetts.synthesize === 'function',
  VOICE_DOWN,
};
