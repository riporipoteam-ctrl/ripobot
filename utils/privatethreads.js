'use strict';

/**
 * Private per-user threads: a quiet side-channel for 1-on-1 chats with the bot.
 *
 * Thread names are prefixed with '🔒 private —' so they can be identified
 * later (see isPrivateBotThread).
 */

const { ChannelType } = require('discord.js');

const THREAD_NAME_PREFIX = '🔒 private —';
const AUTO_ARCHIVE_DURATION = 1440; // minutes — 24h of inactivity

const INTRO_MESSAGE =
  '🔒 **Private chat** — it\'s just you and me here.\n' +
  'Staff with Manage Threads permission *can* peek in if needed, so keep it clean.\n' +
  'This thread auto-archives after 24h of inactivity.\n' +
  'What’s on your mind?';

/**
 * Create a private thread for the user in the given channel.
 *
 * @param {import('discord.js').TextChannel} channel
 * @param {import('discord.js').User} user
 * @returns {Promise<import('discord.js').ThreadChannel | null>} the thread, or null on failure.
 */
async function createPrivateThread(channel, user) {
  try {
    const thread = await channel.threads.create({
      name: `${THREAD_NAME_PREFIX} ${user.username}`.slice(0, 100),
      autoArchiveDuration: AUTO_ARCHIVE_DURATION,
      type: ChannelType.PrivateThread,
      reason: 'RipoBot private chat',
    });

    try {
      await thread.members.add(user.id);
    } catch (err) {
      // Adding the member is nice-to-have; the thread still works.
      console.error('[privatethreads] failed to add member:', err.message);
    }

    try {
      await thread.send(INTRO_MESSAGE);
    } catch (err) {
      console.error('[privatethreads] failed to send intro:', err.message);
    }

    return thread;
  } catch (err) {
    console.error('[privatethreads] failed to create thread:', err.message);
    return null;
  }
}

/**
 * @param {import('discord.js').Channel | null | undefined} channel
 * @returns {boolean} true when the channel is a RipoBot private thread.
 */
function isPrivateBotThread(channel) {
  try {
    return !!channel?.isThread?.() && channel.name.startsWith(THREAD_NAME_PREFIX);
  } catch {
    return false;
  }
}

module.exports = { createPrivateThread, isPrivateBotThread };
