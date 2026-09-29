'use strict';

/**
 * Natural-language commands for the Owner/Co-Owner.
 *
 * Where it runs: the ripobot chat channel OR any channel whose parent
 * category name contains "staff" or "owner" (case-insensitive).
 * Who can use it: members with the exact roles "👑 Owner" / "🛡️ Co-Owner".
 * The role check happens BEFORE the AI model is ever called.
 *
 * The owner's message is parsed by the HF chat model into a strict JSON
 * intent { action, args } where action ∈ announce|warn|timeout|poll|speak|none.
 * ban/kick/clear are NEVER available via natural language (mapped to "none").
 * On success the bot replies with a short confirmation; on uncertainty it
 * stays silent.
 */

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { chatAvailable, parseIntent } = require('./ai');
const { postAnnouncement, OWNER_ROLE_NAMES } = require('../commands/announce');
const { warnUser } = require('../commands/warn');
const { timeoutUser, MAX_MINUTES } = require('../commands/timeout');
const { postPoll } = require('../commands/poll');
const { speakInVoiceChannel, VOICE_DOWN } = require('../commands/speak');

function isOwnerOrCoOwner(member) {
  return !!member?.roles?.cache?.some((r) => OWNER_ROLE_NAMES.includes(r.name));
}

/** The ripobot chat channel: name contains "ripobot" or env override. */
function isRipobotChannel(channel) {
  if (!channel) return false;
  if (process.env.RIPOBOT_CHAT_CHANNEL_ID && channel.id === process.env.RIPOBOT_CHAT_CHANNEL_ID) {
    return true;
  }
  return (channel.name || '').toLowerCase().includes('ripobot');
}

/** NL commands are allowed in the ripobot channel or staff/owner categories. */
function channelAllowsNL(channel) {
  if (isRipobotChannel(channel)) return true;
  const parentName = channel?.parent?.name || '';
  return /staff|owner/i.test(parentName);
}

// Cheap pre-filter so normal owner chit-chat doesn't hit the model.
const NL_HINT = /\b(announce|warn|timeout|mute|poll|speak|post|say)\b/i;

/** Resolve a mention / id / name to a GuildMember, or null. */
async function resolveMember(guild, ref) {
  const clean = String(ref || '').trim();
  if (!clean) return null;

  const mention = clean.match(/^<@!?(\d+)>$/);
  const id = mention ? mention[1] : /^\d{17,20}$/.test(clean) ? clean : null;
  if (id) {
    try {
      return await guild.members.fetch(id);
    } catch {
      return null;
    }
  }

  const q = clean.replace(/^@/, '').toLowerCase();
  const cached = guild.members.cache.find(
    (m) =>
      m.user.username.toLowerCase().includes(q) ||
      (m.nickname && m.nickname.toLowerCase().includes(q)),
  );
  if (cached) return cached;
  try {
    const res = await guild.members.fetch({ query: q, limit: 5 });
    return res.first() || null;
  } catch {
    return null;
  }
}

/** Resolve a #mention / id / name to a text channel the bot can use, or null. */
function resolveTextChannel(guild, ref) {
  const clean = String(ref || '').trim();
  if (!clean) return null;

  const mention = clean.match(/^<#(\d+)>$/);
  const id = mention ? mention[1] : /^\d{17,20}$/.test(clean) ? clean : null;
  const isText = (c) =>
    (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) && !c.isThread();

  if (id) {
    const c = guild.channels.cache.get(id);
    return c && isText(c) ? c : null;
  }

  const q = clean.replace(/^#/, '').toLowerCase();
  return (
    guild.channels.cache.find((c) => isText(c) && c.name.toLowerCase() === q) ||
    guild.channels.cache.find((c) => isText(c) && c.name.toLowerCase().includes(q)) ||
    null
  );
}

async function dispatchIntent(message, intent) {
  const { action, args } = intent;
  const { guild } = message;

  if (action === 'announce') {
    const channel = resolveTextChannel(guild, args.channel);
    const text = String(args.text || '').trim();
    if (!channel || !text) return true; // uncertain — stay silent
    const title = String(args.title || '').trim() || 'Announcement';
    const result = await postAnnouncement({
      channel,
      title,
      message: text,
      authorTag: message.author.tag,
      guild,
    });
    if (result.ok) {
      await message.reply(`✅ Announcement posted in ${channel}.`);
    } else {
      await message.reply(`❌ ${result.reason}`);
    }
    return true;
  }

  if (action === 'warn') {
    const member = await resolveMember(guild, args.user);
    const reason = String(args.reason || '').trim();
    if (!member || !reason) return true; // uncertain — stay silent
    const result = await warnUser({
      guild,
      invokerMember: message.member,
      invokerUser: message.author,
      targetUser: member.user,
      reason,
    });
    await message.reply(
      result.ok ? `⚠️ Warned **${member.user.tag}** — ${reason}` : `❌ ${result.reason}`,
    );
    return true;
  }

  if (action === 'timeout') {
    const member = await resolveMember(guild, args.user);
    const reason = String(args.reason || '').trim() || 'No reason provided';
    let minutes = Number.parseInt(args.durationMinutes, 10);
    if (!Number.isFinite(minutes)) minutes = 10;
    minutes = Math.max(1, Math.min(MAX_MINUTES, minutes));
    if (!member) return true; // uncertain — stay silent
    const result = await timeoutUser({
      guild,
      invokerMember: message.member,
      invokerUser: message.author,
      targetUser: member.user,
      minutes,
      reason,
    });
    await message.reply(
      result.ok
        ? `⏱️ Timed out **${member.user.tag}** for ${minutes} minute(s) — ${reason}`
        : `❌ ${result.reason}`,
    );
    return true;
  }

  if (action === 'poll') {
    const question = String(args.question || '').trim();
    const options = Array.isArray(args.options)
      ? args.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 4)
      : [];
    if (!question || options.length < 2) return true; // uncertain — stay silent
    try {
      await postPoll(message.channel, question, options);
      await message.reply('📊 Poll posted!');
    } catch (err) {
      console.error('[nl] poll failed:', err.message);
      await message.reply('❌ Could not post the poll.');
    }
    return true;
  }

  if (action === 'speak') {
    const text = String(args.text || '').trim().slice(0, 300);
    const voiceChannel = message.member?.voice?.channel;
    if (!text || !voiceChannel) return true; // uncertain — stay silent
    const result = await speakInVoiceChannel(guild, voiceChannel, text);
    if (result.ok) {
      await message.reply(`🔊 Spoke in **${voiceChannel.name}**.`);
    } else if (result.reason === 'voice-down') {
      await message.reply(VOICE_DOWN);
    } else {
      await message.reply('😅 Could not speak that — try again in a bit!');
    }
    return true;
  }

  return true; // 'none' — consumed silently
}

/**
 * Try to handle a message as a natural-language owner command.
 * Returns true when the message was consumed (executed or silently dropped),
 * false when it should fall through to normal chat handling.
 */
async function tryNaturalLanguage(message) {
  if (!NL_HINT.test(message.content)) return false;
  if (!chatAvailable()) return false; // no model — let normal chat handle it
  if (!message.guild) return false;

  let intent;
  try {
    intent = await parseIntent(message.content);
  } catch (err) {
    console.error('[nl] parse failed:', err.message);
    return true; // looked like a command — don't let chat riff on it
  }

  if (!intent || intent.action === 'none') return true; // silent

  try {
    return await dispatchIntent(message, intent);
  } catch (err) {
    console.error('[nl] dispatch crashed:', err);
    return true;
  }
}

module.exports = {
  isOwnerOrCoOwner,
  isRipobotChannel,
  channelAllowsNL,
  tryNaturalLanguage,
  OWNER_ROLE_NAMES,
  // Exported for unit checks.
  resolveMember,
  resolveTextChannel,
};
