'use strict';

/**
 * Shared staff check + mod-log reporting helpers.
 *
 * isStaffMember(member): true for 👑 Owner / 🛡️ Co-Owner role holders
 *   or anyone with ManageMessages permission.
 * postModReport(...): posts a formatted report embed to #mod-logs.
 */

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { OWNER_ROLE_NAMES } = require('../commands/announce');

/**
 * @param {import('discord.js').GuildMember | null} member
 * @returns {boolean}
 */
function isStaffMember(member) {
  if (!member) return false;
  const roleNames = member.roles?.cache?.map((r) => r.name) ?? [];
  if (OWNER_ROLE_NAMES.some((name) => roleNames.includes(name))) return true;
  try {
    if (member.permissions?.has(PermissionFlagsBits.ManageMessages)) return true;
  } catch {
    // Permissions unavailable (partial member) — not staff.
  }
  return false;
}

/**
 * Normalize a channel name for lookup: lowercase + strip everything that is
 * not a letter or digit. Lets us find '🛡️・mod-logs' when looking for
 * 'mod-logs', '👋・welcome' for 'welcome', etc. (exact matches used to
 * silently fail on the server's emoji-prefixed channel names, so escalations
 * and reports never reached their channel).
 *
 * @param {string} name
 * @returns {string}
 */
function normalizeChannelName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Find a guild text channel by name, tolerating emoji/punctuation prefixes.
 *
 * @param {import('discord.js').Guild} guild
 * @param {string} name e.g. 'mod-logs'
 * @returns {import('discord.js').TextChannel | null}
 */
function findChannelByName(guild, name) {
  try {
    const want = normalizeChannelName(name);
    if (!want) return null;
    return (
      guild?.channels?.cache?.find(
        (c) => c.isTextBased() && !c.isThread() && normalizeChannelName(c.name) === want,
      ) ?? null
    );
  } catch {
    return null;
  }
}

/**
 * Find the guild's #mod-logs text channel.
 *
 * @param {import('discord.js').Guild} guild
 * @returns {import('discord.js').TextChannel | null}
 */
function findModLogsChannel(guild) {
  return findChannelByName(guild, 'mod-logs');
}

/**
 * Post a user report to #mod-logs.
 *
 * @param {{
 *   guild: import('discord.js').Guild,
 *   reportedUser: import('discord.js').User,
 *   channel: import('discord.js').GuildChannel,
 *   content: string,
 *   messageUrl: string | null,
 *   reason: string,
 * }} opts
 * @returns {Promise<boolean>} true when the report was posted.
 */
async function postModReport({ guild, reportedUser, channel, content, messageUrl, reason }) {
  const modLogs = findModLogsChannel(guild);
  if (!modLogs) return false;

  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('🚨 User Report')
    .addFields(
      { name: 'User', value: `<@${reportedUser.id}> (${reportedUser.tag})` },
      { name: 'Channel', value: `${channel}` },
      { name: 'Reason', value: reason.slice(0, 1024) },
      { name: 'Message excerpt', value: String(content ?? '').slice(0, 500) || '(no content)' },
    )
    .setTimestamp();

  if (messageUrl) {
    embed.addFields({ name: 'Jump to message', value: `[Click here](${messageUrl})` });
  }

  try {
    await modLogs.send({ embeds: [embed] });
    return true;
  } catch (err) {
    console.error('[modreport] failed to post report:', err.message);
    return false;
  }
}

module.exports = { isStaffMember, findModLogsChannel, findChannelByName, normalizeChannelName, postModReport };
