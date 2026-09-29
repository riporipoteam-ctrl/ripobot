'use strict';

/**
 * RipoBot v5 ticket greeter.
 *
 * When a ticket channel appears (name starts with "ticket-" or the parent
 * category name contains "ticket"), the bot greets the opener with a friendly
 * no-ping support message and tracks the channel in utils/tickets.js.
 *
 * Nothing here throws: everything is wrapped so a bad channel can never
 * crash the bot.
 */

const { Events, PermissionFlagsBits } = require('discord.js');
const { ensureTicket, setOpener, setStage } = require('../utils/tickets');

/** Try to find the ticket opener's user id in the channel topic. */
function openerIdFromTopic(topic) {
  if (!topic) return null;
  const m = topic.match(/<@!?(\d+)>/) || topic.match(/(\d{17,20})/);
  return m ? m[1] || m[2] || null : null;
}

/** Display name sanitized so it can never ping @everyone / @here. */
function plainName(name) {
  return String(name ?? 'there')
    .replace(/@everyone/gi, '@\u200beveryone')
    .replace(/@here/gi, '@\u200bhere')
    .slice(0, 64);
}

module.exports = {
  name: Events.ChannelCreate,
  once: false,
  async execute(channel) {
    try {
      await handleChannelCreate(channel);
    } catch (err) {
      console.error('[channelCreate] crashed:', err);
      // Never crash the bot on a bad channel.
    }
  },
};

async function handleChannelCreate(channel) {
  if (!channel || !channel.guild) return;

  let channelName = '';
  let parentName = '';
  try {
    channelName = String(channel.name || '').toLowerCase();
    parentName = String(channel.parent?.name || '').toLowerCase();
  } catch {
    return;
  }

  if (!channelName.startsWith('ticket-') && !parentName.includes('ticket')) return;

  // Bail if the bot can't view or send in the new channel.
  try {
    const me = channel.guild.members.me;
    if (me) {
      const perms = me.permissionsIn(channel);
      if (!perms.has(PermissionFlagsBits.ViewChannel) || !perms.has(PermissionFlagsBits.SendMessages)) {
        console.log('[channelCreate] skipping ticket greeting — missing ViewChannel/SendMessages in', channel.id);
        return;
      }
    }
  } catch (err) {
    console.error('[channelCreate] permission check failed:', err.message);
    return;
  }

  try {
    ensureTicket(channel.id);

    // Try to determine the opener right away from the channel topic.
    let display = 'there';
    try {
      const openerId = openerIdFromTopic(channel.topic);
      if (openerId) {
        setOpener(channel.id, openerId);
        try {
          const member = await channel.guild.members.fetch(openerId);
          display = plainName(member?.displayName || openerId);
        } catch {
          // Opener left or is unknown — keep the plain fallback.
        }
      }
    } catch {
      // Topic unreadable — keep the plain fallback.
    }

    try {
      await channel.send(
        `👋 Hey ${display}! Welcome to support — what's wrong? Describe it and I'll try to help.`,
      );
    } catch (err) {
      console.error('[channelCreate] greeting send failed:', err.message);
    }

    try {
      setStage(channel.id, 'greeted');
    } catch (err) {
      console.error('[channelCreate] setStage failed:', err.message);
    }
  } catch (err) {
    console.error('[channelCreate] ticket setup failed:', err.message);
  }
}
