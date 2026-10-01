'use strict';

/**
 * Natural-language commands for the Owner/Co-Owner.
 *
 * Where it runs: the ripobot chat channel OR any channel whose parent
 * category name contains "staff" or "owner" (case-insensitive).
 * Who can use it: members with the exact roles "👑 Owner" / "🛡️ Co-Owner".
 * The role check happens BEFORE the AI model is ever called.
 *
 * The owner's message is parsed by the chat model into a strict JSON
 * intent { action, args } where action ∈ announce|warn|timeout|poll|speak|none
 * plus the Flux Rec in-game admin actions:
 * fluxrank|fluxranks|fluxplus|fluxban|fluxtimeout|fluxvoiceban|fluxunban|
 * fluxbans|fluxtokens|fluxgift|fluxstatus|fluxonline.
 * The flux* actions were explicitly ordered by the owner (2026-10-01) for
 * in-game admin. Discord-native ban/kick/message-deleting are STILL never
 * available via natural language (mapped to "none").
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
const {
  adminApi,
  isNoSuchPlayer,
  rankLabel,
  FLUX_RANKS,
  confirmEveryoneTokens,
} = require('./flux');
const { updateStatusChannels } = require('../commands/fluxstatus');

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
// Flux Rec in-game admin triggers ("give Ripo6000 community mod",
// "ban Ripo6000 griefing", "give everyone 500 tokens", ...).
const FLUX_NL_HINT =
  /\bflux\b|\brec\s*room\s*\+?|\bunban\b|\bvoice\s*-?ban\b|\blist\s+bans\b|\bplayers?\b.{0,20}\bonline\b|\bgive\b.{0,40}\btokens?\b|\bgive\b.{0,40}\bgifts?\b|\bgive\b.{0,40}\branks?\b|\branks?\s+(can\s+i\s+)?give\b|\bgive\b.{0,30}\b(community\s*-?mod|dev(eloper)?)\b|\bremove\b.{0,30}\b(community\s*-?mod|dev(eloper)?|rank)\b|\bban\b/i;

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

  // ---- Flux Rec in-game admin -------------------------------------------
  // All of these hit the backend admin API (utils/flux.js) and are gated to
  // Owner/Co-Owner by the caller. Usernames are Flux Rec player names — the
  // backend 404s ("no such player") when the account doesn't exist in-game.

  if (action === 'fluxranks') {
    const list = FLUX_RANKS.map((r) => `**${r.label}**`).join(', ');
    await message.reply(
      `🎖️ Ranks I can give: ${list} — or \`remove\` to take a rank away.\n` +
        'Say e.g. `give Ripo6000 community mod`.'
    );
    return true;
  }

  if (action === 'fluxrank') {
    const username = String(args.user || '').trim();
    if (!username) return true; // uncertain — stay silent
    let rank = String(args.rank || '').trim().toLowerCase();
    if (['community mod', 'community_mod', 'communitymod', 'mod', 'moderator'].includes(rank)) {
      rank = 'community_mod';
    } else if (['dev', 'developer'].includes(rank)) {
      rank = 'developer';
    } else if (['remove', 'none', 'take away', 'takeaway'].includes(rank)) {
      rank = 'none';
    } else {
      rank = '';
    }
    if (!rank) {
      await message.reply(
        `🎖️ Which rank for **${username}**? Say \`community mod\`, \`dev\`, or \`remove\`.\n(e.g. \`give ${username} community mod\`)`
      );
      return true;
    }
    try {
      // POST /api/admin/v1/ranks/set { username, rank } — 404 when no such player
      const result = await adminApi('/ranks/set', 'POST', { username, rank });
      await message.reply(
        rank === 'none'
          ? `✅ Rank removed from **${result.username}**. Takes effect on their next login.`
          : `✅ **${result.username}** is now **${rankLabel(rank)}**! Takes effect on their next login.`
      );
    } catch (err) {
      await message.reply(
        isNoSuchPlayer(err)
          ? `❌ No Flux Rec account named **${username}**. Ranks only work on players who already made an account in-game.`
          : `❌ Failed: ${err.message}`
      );
    }
    return true;
  }

  if (action === 'fluxplus') {
    const username = String(args.user || '').trim();
    if (!username) return true; // uncertain — stay silent
    let months = args.remove === true ? -1 : args.durationMonths;
    months = months == null ? NaN : Math.trunc(Number(months));
    if (!Number.isFinite(months)) {
      await message.reply(
        `🎫 How long should **${username}** get Flux Rec+? Say e.g. \`give ${username} flux rec+ 2 months\`, \`never expire\`, or \`remove\`.`
      );
      return true;
    }
    try {
      // POST /api/admin/v1/membership/set { username, duration_months }
      const result = await adminApi('/membership/set', 'POST', {
        username,
        duration_months: months,
      });
      let msg;
      if (months === -1) {
        msg = `✅ Flux Rec+ removed from **${result.username}**.`;
      } else if (months === 0) {
        msg = `✅ **${result.username}** now has **Flux Rec+ (never expires)**! 🎉`;
      } else {
        const until = result.plusUntil ? ` — until ${String(result.plusUntil).slice(0, 10)}` : '';
        msg = `✅ **${result.username}** now has **Flux Rec+ for ${months} month${months > 1 ? 's' : ''}**${until}! 🎉`;
      }
      await message.reply(`${msg}\nTakes effect on their next login.`);
    } catch (err) {
      await message.reply(
        isNoSuchPlayer(err)
          ? `❌ No Flux Rec account named **${username}**.`
          : `❌ Failed: ${err.message}`
      );
    }
    return true;
  }

  if (action === 'fluxban' || action === 'fluxtimeout' || action === 'fluxvoiceban') {
    const username = String(args.user || '').trim();
    const reason = String(args.reason || '').trim();
    if (!username) return true; // uncertain — stay silent
    if (!reason) {
      await message.reply(
        `🔨 What's the reason for banning **${username}**? (The reason is shown to them in-game.)`
      );
      return true;
    }
    let durationMinutes =
      args.durationMinutes == null ? 0 : Math.max(0, Math.trunc(Number(args.durationMinutes)) || 0);
    if (action === 'fluxtimeout' && durationMinutes === 0) durationMinutes = 10;
    const voiceBan = action === 'fluxvoiceban' ? true : args.voiceBan === true;
    try {
      // POST /api/admin/v1/bans/create { username, reason, duration_minutes, voice_ban }
      // The ban is enforced by matchmaking and the reason shows on the
      // in-game block screen (moderationBlockDetails / TopMessageOverride).
      const result = await adminApi('/bans/create', 'POST', {
        username,
        reason,
        duration_minutes: durationMinutes,
        voice_ban: voiceBan,
      });
      const durText = result.permanent
        ? 'permanently'
        : `for ${durationMinutes} minute${durationMinutes === 1 ? '' : 's'}`;
      const voiceText = result.voiceBanned ? ' (including voice chat)' : '';
      const icon = action === 'fluxtimeout' ? '⏱️' : action === 'fluxvoiceban' ? '🎙️🔨' : '🔨';
      const verb =
        action === 'fluxtimeout'
          ? 'timed out in-game'
          : action === 'fluxvoiceban'
            ? 'voice-banned'
            : 'banned';
      await message.reply(
        `${icon} **${result.username}** has been ${verb} ${durText}${voiceText}.\nReason (shown in-game): ${reason}`
      );
    } catch (err) {
      await message.reply(
        isNoSuchPlayer(err)
          ? `❌ No Flux Rec account named **${username}**.`
          : `❌ Failed: ${err.message}`
      );
    }
    return true;
  }

  if (action === 'fluxunban') {
    const username = String(args.user || '').trim();
    if (!username) return true; // uncertain — stay silent
    try {
      // POST /api/admin/v1/bans/lift { username } -> { lifted }
      const result = await adminApi('/bans/lift', 'POST', { username });
      await message.reply(
        result.lifted
          ? `✅ Ban lifted for **${result.username}**. They can play again now.`
          : `ℹ️ **${username}** has no active ban — nothing to lift.`
      );
    } catch (err) {
      await message.reply(
        isNoSuchPlayer(err)
          ? `❌ No Flux Rec account named **${username}**.`
          : `❌ Failed: ${err.message}`
      );
    }
    return true;
  }

  if (action === 'fluxbans') {
    try {
      // GET /api/admin/v1/bans/list — see BACKEND_NEEDED.md (not on the backend yet)
      const data = await adminApi('/bans/list', 'GET');
      const bans = Array.isArray(data.bans) ? data.bans : [];
      if (bans.length === 0) {
        await message.reply('✅ No active bans right now.');
        return true;
      }
      const lines = bans.slice(0, 25).map((b) => {
        const until = b.permanent ? 'permanent' : b.banExpires ? `until ${b.banExpires}` : 'timed';
        return `• **${b.username}** — ${until}${b.voiceBanned ? ' 🎙️' : ''}`;
      });
      await message.reply(`🔨 **Active bans (${bans.length}):**\n${lines.join('\n')}`);
    } catch (err) {
      await message.reply(
        err && err.status === 404
          ? 'ℹ️ The backend does not support ban listing yet. Use `/fluxunban <username>` to lift a specific ban.'
          : `❌ Failed: ${err.message}`
      );
    }
    return true;
  }

  if (action === 'fluxtokens') {
    const target = String(args.user || '').trim();
    const amount = Math.trunc(Number(args.amount));
    if (!target || !Number.isFinite(amount) || amount < 1) {
      await message.reply('🪙 Say e.g. `give Ripo6000 1000 tokens` or `give everyone 500 tokens`.');
      return true;
    }
    if (amount > 1000000) {
      await message.reply('🪙 Max 1,000,000 tokens per grant.');
      return true;
    }
    try {
      if (target.toLowerCase() === 'everyone') {
        // Destructive-adjacent: button confirmation, 60s.
        await confirmEveryoneTokens(
          (payload) => message.reply(payload),
          message.author.id,
          amount
        );
        return true;
      }
      // POST /api/admin/v1/tokens/grant { username, amount } -> { grantedTo, newBalance }
      const result = await adminApi('/tokens/grant', 'POST', { username: target, amount });
      const balance =
        typeof result.newBalance === 'number'
          ? `\nNew balance: **${result.newBalance.toLocaleString('en-US')}** 🪙`
          : '';
      await message.reply(
        `✅ Gave **${amount.toLocaleString('en-US')}** tokens to **${result.grantedTo}**! 🪙${balance}`
      );
    } catch (err) {
      await message.reply(
        isNoSuchPlayer(err)
          ? `❌ No Flux Rec account named **${target}**.`
          : `❌ Failed: ${err.message}`
      );
    }
    return true;
  }

  if (action === 'fluxgift') {
    const target = String(args.user || '').trim();
    if (!target) {
      await message.reply('🎁 Say e.g. `give Ripo6000 a gift`.');
      return true;
    }
    try {
      // POST /api/admin/v1/gifts/grant { username } -> { username, giftId }
      const result = await adminApi('/gifts/grant', 'POST', { username: target });
      await message.reply(
        `🎁 Gift box sent to **${result.username}** — they'll find it in their gifts in-game!`
      );
    } catch (err) {
      await message.reply(
        isNoSuchPlayer(err)
          ? `❌ No Flux Rec account named **${target}**.`
          : `❌ Failed: ${err.message}`
      );
    }
    return true;
  }

  if (action === 'fluxstatus') {
    try {
      const { count, inRooms } = await updateStatusChannels(message.guild);
      await message.reply(
        `✅ **Flux Rec Status** refreshed: 🟢 **${count}** online · 🎮 **${inRooms}** in rooms.`
      );
    } catch (err) {
      await message.reply(`❌ Failed: ${err.message}`);
    }
    return true;
  }

  if (action === 'fluxonline') {
    try {
      // GET /api/admin/v1/players/online -> { success, count, players: [{ username, room }] }
      const data = await adminApi('/players/online', 'GET');
      const count = data.count || 0;
      const players = Array.isArray(data.players) ? data.players : [];
      const names = players
        .slice(0, 10)
        .map((p) => (p.room ? `${p.username} (${p.room})` : p.username))
        .join(', ');
      await message.reply(
        count === 0
          ? '🟢 No players online right now.'
          : `🟢 **${count}** player${count === 1 ? '' : 's'} online${names ? `: ${names}` : ''}.`
      );
    } catch (err) {
      await message.reply(`❌ Failed: ${err.message}`);
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
  if (!NL_HINT.test(message.content) && !FLUX_NL_HINT.test(message.content)) return false;
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
