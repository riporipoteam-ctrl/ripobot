'use strict';

/**
 * Shared safety checks for moderation commands.
 *
 * Every moderation action must pass ALL of these:
 *  1. The invoking member has the required Discord permission.
 *  2. The bot itself has the required Discord permission.
 *  3. The target is not the server owner, the bot itself, or the invoker.
 *  4. Role hierarchy: the target's highest role is strictly below BOTH the
 *     invoker's highest role and the bot's highest role.
 */

const { PermissionFlagsBits } = require('discord.js');

/**
 * Check whether the bot's own member object holds a permission in this guild.
 */
function botHas(interaction, permission) {
  const me = interaction.guild.members.me;
  return !!me && me.permissions.has(permission);
}

/**
 * Full safety gate for acting on a target member.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('discord.js').GuildMember} target - resolved target member
 * @param {bigint} requiredPermission - PermissionFlagsBits.* the invoker needs
 * @param {bigint} botPermission - PermissionFlagsBits.* the bot needs
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function canModerate(interaction, target, requiredPermission, botPermission) {
  const { guild, member: invoker, user } = interaction;

  if (!guild || !target) {
    return { ok: false, reason: 'This command can only be used inside a server.' };
  }

  // 1. Invoker permission.
  if (!invoker.permissions.has(requiredPermission)) {
    return { ok: false, reason: "You don't have permission to do that." };
  }

  // 2. Bot permission.
  const me = guild.members.me;
  if (!me || !me.permissions.has(botPermission)) {
    return { ok: false, reason: "I don't have permission to do that. Check my role permissions." };
  }

  // 3a. Never touch the server owner.
  if (target.id === guild.ownerId) {
    return { ok: false, reason: "I can't take action against the server owner." };
  }

  // 3b. Never act on itself.
  if (target.id === me.id) {
    return { ok: false, reason: "I can't take action against myself." };
  }

  // 3c. Never act on the invoker.
  if (target.id === user.id) {
    return { ok: false, reason: "You can't use that on yourself." };
  }

  // 4. Role hierarchy — invoker must outrank the target.
  if (target.roles.highest.position >= invoker.roles.highest.position && guild.ownerId !== user.id) {
    return { ok: false, reason: "That user's role is equal to or higher than yours." };
  }

  // 4b. Role hierarchy — the bot must outrank the target.
  if (target.roles.highest.position >= me.roles.highest.position) {
    return {
      ok: false,
      reason: "That user's role is equal to or higher than my highest role. Move my role above theirs.",
    };
  }

  return { ok: true };
}

/**
 * Resolve a target user option to a GuildMember, fetching when needed.
 * Returns null when the user is not (or no longer) in the guild.
 */
async function resolveTargetMember(interaction, user) {
  try {
    return await interaction.guild.members.fetch(user.id);
  } catch {
    return null;
  }
}

/**
 * Reply ephemerally with an error, tolerating already-replied interactions.
 */
async function failEphemeral(interaction, reason) {
  const payload = { content: `❌ ${reason}`, ephemeral: true };
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch {
    // Interaction expired or was deleted — nothing more we can do.
  }
}

module.exports = { PermissionFlagsBits, botHas, canModerate, resolveTargetMember, failEphemeral };
