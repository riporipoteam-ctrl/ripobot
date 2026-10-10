'use strict';

/**
 * serverFlavor.js — make the bots feel native to the server.
 *
 * - Custom server emojis: pick from guild.emojis.cache and render as
 *   <:name:id> (or <a:name:id> for animated), so they render inline.
 * - Stickers: pick from guild.stickers.cache and send via channel.send.
 *
 * Everything is best-effort and silent on failure (missing cache, no
 * emojis/stickers, no permission). Never throws.
 */

function guildEmojis(guild) {
  try {
    const cache = guild?.emojis?.cache;
    if (!cache || cache.size === 0) return [];
    return [...cache.values()];
  } catch {
    return [];
  }
}

function guildStickers(guild) {
  try {
    const cache = guild?.stickers?.cache;
    if (!cache || cache.size === 0) return [];
    return [...cache.values()];
  } catch {
    return [];
  }
}

/** Render a guild emoji in <:name:id> / <a:name:id> form. */
function renderEmoji(emoji) {
  if (!emoji || !emoji.id) return null;
  const name = String(emoji.name || 'emoji').replace(/[^a-zA-Z0-9_]/g, '_');
  return emoji.animated ? `<a:${name}:${emoji.id}>` : `<:${name}:${emoji.id}>`;
}

function pick(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * A random server emoji string, or null when the guild has none cached.
 * Pass a name to look up a specific emoji (case-insensitive, tolerant of
 * surrounding punctuation).
 */
function serverEmoji(guild, name) {
  const emojis = guildEmojis(guild);
  if (!emojis.length) return null;
  let emoji = null;
  if (name) {
    const want = String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
    emoji = emojis.find((e) => String(e.name || '').toLowerCase().replace(/[^a-z0-9]/g, '') === want) || null;
  }
  return renderEmoji(emoji || pick(emojis));
}

/**
 * Occasionally append a server emoji to a message so the bots feel native.
 * chance ~ 0.12 by default. Returns the text unchanged when there's nothing
 * to add. Never throws.
 */
function sprinkleServerEmoji(text, guild, chance = 0.12) {
  try {
    if (!text || typeof text !== 'string') return text;
    if (Math.random() >= chance) return text;
    const emoji = serverEmoji(guild);
    if (!emoji) return text;
    // Don't double up if the text already ends with an emoji-ish token.
    if (/[<\u{1F300}-\u{1FAFF}]$/u.test(text.trim())) return text;
    return `${text.trimEnd()} ${emoji}`;
  } catch {
    return text;
  }
}

/** A random server sticker id, or null. */
function randomStickerId(guild) {
  const sticker = pick(guildStickers(guild));
  return sticker ? sticker.id : null;
}

/**
 * Occasionally send a server sticker as a playful follow-up after a reply.
 * Fire-and-forget: callers should NOT await this (or catch its errors).
 * chance ~ 0.07 by default. Never throws.
 */
async function maybeSendSticker(channel, chance = 0.07) {
  try {
    if (!channel || Math.random() >= chance) return false;
    const guild = channel.guild;
    const stickerId = randomStickerId(guild);
    if (!stickerId) return false;
    if (typeof channel.send !== 'function') return false;
    await channel.send({ stickers: [stickerId] });
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  guildEmojis,
  guildStickers,
  renderEmoji,
  serverEmoji,
  sprinkleServerEmoji,
  randomStickerId,
  maybeSendSticker,
};
