'use strict';

const { Events } = require('discord.js');
const { chatAvailable } = require('../utils/ai');
const { startScheduler } = require('../utils/scheduler');

// v7.0: voice — auto-leave when alone, nudge when humans gather in a VC.
let voice = null;
try {
  voice = require('../utils/voice');
} catch (err) {
  console.error('[ready] voice unavailable:', err.message);
}

/**
 * Give the Member role to every human member missing it. Idempotent.
 * Skips bots (they have the Bots role) and guilds without a Member role.
 */
async function backfillMemberRole(client) {
  let added = 0;
  for (const [, guild] of client.guilds.cache) {
    let memberRole = null;
    try {
      memberRole =
        guild.roles.cache.find(
          (r) => String(r.name || '').toLowerCase().replace(/[^a-z0-9]/g, '') === 'member',
        ) ?? null;
      if (!memberRole) continue;
      const botHighest = guild.members.me?.roles?.highest?.position ?? Infinity;
      if (memberRole.position >= botHighest) continue;
      const members = await guild.members.fetch().catch(() => null);
      if (!members) continue;
      for (const [, m] of members) {
        if (m.user.bot) continue;
        if (m.roles.cache.has(memberRole.id)) continue;
        try {
          await m.roles.add(memberRole);
          added += 1;
        } catch {
          // One failure shouldn't stop the sweep.
        }
      }
    } catch (err) {
      console.error(`[ready] member backfill failed for ${guild?.name}:`, err.message);
    }
  }
  if (added > 0) console.log(`[ready] member backfill: added Member role to ${added} user(s)`);
}

/** Find #ripobot-chat (or fall back to the guild's system channel). */
async function findNudgeChannel(guild) {  try {
    const targetId = process.env.RIPOBOT_CHAT_CHANNEL_ID;
    if (targetId) {
      const ch = await guild.channels.fetch(targetId).catch(() => null);
      if (ch?.isTextBased?.()) return ch;
    }
    const channels = await guild.channels.fetch();
    for (const [, ch] of channels) {
      if (ch?.name?.toLowerCase?.().includes('ripobot-chat') && ch?.isTextBased?.()) return ch;
    }
    return guild.systemChannel || null;
  } catch {
    return null;
  }
}

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`[ready] Logged in as ${client.user.tag}`);
    console.log(
      chatAvailable()
        ? '[ready] AI chat enabled (Hugging Face token present).'
        : '[ready] WARNING: HF_TOKEN not set — AI chat will reply that chat is not configured.',
    );
    try {
      startScheduler(client);
    } catch (err) {
      console.error('[ready] scheduler failed to start:', err.message);
    }
    // Backfill the Member role to existing members (idempotent — only adds
    // where missing). Runs on every boot; cheap for a small server.
    try {
      await backfillMemberRole(client);
    } catch (err) {
      console.error('[ready] member backfill failed:', err.message);
    }
    if (voice) {
      try {
        voice.watchVoice(client, {
          who: 'ripobot',
          onHumansJoin: async (voiceChannel, humans) => {
            try {
              const guild = voiceChannel.guild;
              const textChannel = await findNudgeChannel(guild);
              if (!textChannel) return;
              const name = String(voiceChannel.name || 'voice').slice(0, 64);
              await textChannel.send(
                `👀 I see ${humans === 1 ? 'someone' : `${humans} of you`} hanging in **${name}** — ` +
                  'run /speak and I\'ll talk to you in my actual voice! 🎙️',
              );
            } catch (err) {
              console.error('[ready] voice nudge failed:', err.message);
            }
          },
        });
        console.log('[ready] voice watch active');
      } catch (err) {
        console.error('[ready] voice watch failed:', err.message);
      }
    }
  },
};
