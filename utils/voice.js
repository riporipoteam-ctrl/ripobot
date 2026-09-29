'use strict';

/**
 * RipoBot v7.0 — voice channel support.
 *
 * Bots can JOIN a voice channel when asked ("join vc"), TALK in their own
 * neural voices (utils/edgetts.js — Bolt = energetic male, Pip = soft
 * female, RipoBot = easygoing male), and LEAVE on command or when left
 * alone. Per-process state: each bot (RipoBot, Bolt, Pip) runs its own
 * client and manages its own connection.
 *
 * No ffmpeg, no native opus needed for playback: edge-tts audio is encoded
 * to Opus packets in pure JS (opusscript) and streamed paced at 20ms.
 */

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  StreamType,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');
const { Readable } = require('stream');
const tts = require('./edgetts');

const state = {
  connection: null,
  player: null,
  channelId: null,
  guildId: null,
  queue: [],
  pumping: false,
  aloneTimer: null,
};

function isInVoice() {
  return !!state.connection && !!state.channelId;
}

function currentVoiceChannelId() {
  return state.channelId;
}

function getConnection() {
  return state.connection;
}

/** Opus packets → a Readable paced at one packet per 20ms (Discord timing). */
function packetsToStream(packets) {
  let i = 0;
  let timer = null;
  const stream = new Readable({
    read() {},
    destroy(err, cb) {
      if (timer) clearInterval(timer);
      cb(err);
    },
  });
  timer = setInterval(() => {
    if (i >= packets.length) {
      clearInterval(timer);
      timer = null;
      stream.push(null);
      return;
    }
    if (!stream.push(packets[i])) {
      // backpressure: drop pacing for this tick is fine for short clips
    }
    i += 1;
  }, 20);
  stream.on('close', () => {
    if (timer) clearInterval(timer);
  });
  return stream;
}

function playPackets(packets) {
  return new Promise((resolve) => {
    if (!state.player || !isInVoice()) return resolve(false);
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const safety = setTimeout(() => done(true), packets.length * 20 + 10_000);
    try {
      const resource = createAudioResource(packetsToStream(packets), {
        inputType: StreamType.Opus,
        inlineVolume: false,
      });
      const onIdle = () => {
        clearTimeout(safety);
        state.player.off(AudioPlayerStatus.Idle, onIdle);
        state.player.off('error', onError);
        done(true);
      };
      const onError = () => {
        clearTimeout(safety);
        state.player.off(AudioPlayerStatus.Idle, onIdle);
        state.player.off('error', onError);
        done(false);
      };
      state.player.once(AudioPlayerStatus.Idle, onIdle);
      state.player.once('error', onError);
      state.player.play(resource);
    } catch (err) {
      clearTimeout(safety);
      console.error('[voice] play failed:', err.message);
      done(false);
    }
  });
}

async function pumpQueue() {
  if (state.pumping) return;
  state.pumping = true;
  try {
    while (state.queue.length > 0 && isInVoice()) {
      const { text, who, resolve } = state.queue.shift();
      let ok = false;
      try {
        const synth = await tts.synthesize(text, who);
        if (synth && synth.packets.length > 0) {
          ok = await playPackets(synth.packets);
        }
      } catch (err) {
        console.error('[voice] speak failed:', err.message);
      }
      try { resolve(ok); } catch { /* noop */ }
    }
  } finally {
    state.pumping = false;
  }
}

/**
 * Queue a spoken line. Resolves true when it finished playing, false if it
 * couldn't (not connected, TTS failed). Never throws.
 */
function speak(text, who) {
  return new Promise((resolve) => {
    const clean = tts.cleanForSpeech(text);
    if (!clean || !isInVoice()) return resolve(false);
    // Cap runaway queues (a hangout shouldn't stack 50 lines).
    if (state.queue.length > 8) state.queue.splice(0, state.queue.length - 8);
    state.queue.push({ text: clean, who: who || 'ripobot', resolve });
    pumpQueue();
  });
}

/** Speak only if currently in a voice channel; otherwise a silent no-op. */
function speakIfConnected(text, who) {
  if (!isInVoice()) return Promise.resolve(false);
  return speak(text, who);
}

/**
 * Join a voice channel. `voiceChannel` is a discord.js VoiceChannel.
 * Returns true on success. Moves if already connected elsewhere.
 * Checks Connect + Speak permissions first (fail fast, no crash).
 */
async function joinVoice(voiceChannel) {
  try {
    if (!voiceChannel || !voiceChannel.guild || !voiceChannel.isVoiceBased?.()) return false;
    const guildId = voiceChannel.guild.id;
    const channelId = voiceChannel.id;
    if (state.channelId === channelId && state.connection) return true;
    try {
      const me = voiceChannel.guild.members?.me;
      const perms = me ? voiceChannel.permissionsFor(me) : null;
      if (perms && (!perms.has('Connect') || !perms.has('Speak'))) {
        console.error('[voice] missing Connect/Speak permission');
        return false;
      }
    } catch {
      // Permission check is best-effort; the join will fail loudly if needed.
    }
    leaveVoice();
    const connection = joinVoiceChannel({
      channelId,
      guildId,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });
    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
    const player = createAudioPlayer();
    connection.subscribe(player);
    connection.on(VoiceConnectionStatus.Disconnected, () => {
      // Clean up on kick / channel delete / network drop.
      if (state.connection === connection) leaveVoice();
    });
    state.connection = connection;
    state.player = player;
    state.channelId = channelId;
    state.guildId = guildId;
    console.log(`[voice] joined ${guildId}/${channelId}`);
    return true;
  } catch (err) {
    console.error('[voice] join failed:', err.message);
    leaveVoice();
    return false;
  }
}

/** Leave the voice channel, stop audio, clear the queue. */
function leaveVoice() {
  try {
    for (const item of state.queue) {
      try { item.resolve(false); } catch { /* noop */ }
    }
    state.queue = [];
    state.pumping = false;
    if (state.aloneTimer) {
      clearTimeout(state.aloneTimer);
      state.aloneTimer = null;
    }
    if (state.player) {
      try { state.player.stop(true); } catch { /* noop */ }
    }
    if (state.connection) {
      try { state.connection.destroy(); } catch { /* noop */ }
    }
  } catch { /* noop */ }
  state.connection = null;
  state.player = null;
  state.channelId = null;
  state.guildId = null;
}

/**
 * Watch voice states for this client's guilds:
 * - auto-leave when the bot is alone in its channel for 60s (says bye in its
 *   own voice first).
 * - onHumansJoin callback when ≥1 non-bot user is in a VC and no bot is
 *   connected (lets RipoBot nudge "say join vc and I'll hop in 👀").
 */
function watchVoice(client, { onHumansJoin, who } = {}) {
  const voiceId = who || 'ripobot';
  const GOODBYES = {
    bolt: "okay, looks like everyone left — Bolt's heading out too! byeee!",
    pip: 'looks like everyone left… I\'ll head out too. bye bye!',
    ripobot: "okay, looks like everyone left — I'll head out too! bye!",
  };
  if (!client || typeof client.on !== 'function') return;
  let nudgeCooldownUntil = 0;
  client.on('voiceStateUpdate', (oldState, newState) => {
    try {
      const me = client.user?.id;
      if (!me) return;
      // Someone (not us) joined a channel?
      const joinedChannel = newState.channel;
      const leftChannel = oldState.channel;
      if (newState.id !== me && joinedChannel && joinedChannel.id !== leftChannel?.id) {
        const humans = joinedChannel.members.filter((m) => !m.user.bot).size;
        if (humans > 0 && !isInVoice() && onHumansJoin && Date.now() > nudgeCooldownUntil) {
          nudgeCooldownUntil = Date.now() + 30 * 60_000; // nudge at most every 30 min
          Promise.resolve()
            .then(() => onHumansJoin(joinedChannel, humans))
            .catch((e) => console.error('[voice] nudge failed:', e.message));
        }
      }
      // Our own state: are we alone now?
      if (newState.id === me && state.channelId) {
        const chan = newState.channel || oldState.channel;
        if (!chan || chan.id !== state.channelId) return;
        const humans = chan.members.filter((m) => !m.user.bot).size;
        if (humans === 0 && !state.aloneTimer) {
          state.aloneTimer = setTimeout(() => {
            state.aloneTimer = null;
            if (isInVoice()) {
              console.log('[voice] alone for 60s, leaving');
              speak(GOODBYES[voiceId] || GOODBYES.ripobot, voiceId).finally(() =>
                setTimeout(leaveVoice, 3000)
              );
            }
          }, 60_000);
        } else if (humans > 0 && state.aloneTimer) {
          clearTimeout(state.aloneTimer);
          state.aloneTimer = null;
        }
      }
    } catch (err) {
      console.error('[voice] watch error:', err.message);
    }
  });
}

module.exports = {
  isInVoice,
  currentVoiceChannelId,
  getConnection,
  joinVoice,
  leaveVoice,
  speak,
  speakIfConnected,
  watchVoice,
};
