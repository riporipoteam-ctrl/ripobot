'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { canModerate, failEphemeral } = require('../utils/permissions');
const { addWarn, countWarns } = require('../utils/storage');

/**
 * Shared warn core — used by /warn and natural-language warnings.
 * `invoker` is { member, user }; `targetUser` is a User object.
 * Returns { ok: true, warn, total } or { ok: false, reason }.
 */
async function warnUser({ guild, invokerMember, invokerUser, targetUser, reason }) {
  let target;
  try {
    target = await guild.members.fetch(targetUser.id);
  } catch {
    target = null;
  }
  if (!target) {
    return { ok: false, reason: 'That user is not in this server.' };
  }

  const check = canModerate(
    { guild, member: invokerMember, user: invokerUser },
    target,
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.ModerateMembers,
  );
  if (!check.ok) {
    return { ok: false, reason: check.reason };
  }

  let warn;
  try {
    warn = addWarn({
      guildId: guild.id,
      userId: targetUser.id,
      userTag: targetUser.tag,
      reason,
      moderatorId: invokerUser.id,
      moderatorTag: invokerUser.tag,
    });
  } catch (err) {
    console.error('[warn] storage failed:', err.message);
    return { ok: false, reason: 'Could not save the warning. Try again.' };
  }

  // DM the user — best effort, they may have DMs closed.
  try {
    const dm = new EmbedBuilder()
      .setColor(0xffa500)
      .setTitle(`⚠️ You were warned in ${guild.name}`)
      .addFields(
        { name: 'Reason', value: reason },
        { name: 'Warn ID', value: String(warn.id), inline: true },
        { name: 'Total warns', value: String(countWarns(guild.id, targetUser.id)), inline: true },
      )
      .setTimestamp();
    await targetUser.send({ embeds: [dm] });
  } catch {
    // DMs closed — not fatal.
  }

  return { ok: true, warn, total: countWarns(guild.id, targetUser.id) };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user (stored, and they get a DM)')
    .addUserOption((o) => o.setName('user').setDescription('User to warn').setRequired(true))
    .addStringOption((o) =>
      o.setName('reason').setDescription('Reason for the warning').setRequired(true).setMaxLength(512),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);

    const result = await warnUser({
      guild: interaction.guild,
      invokerMember: interaction.member,
      invokerUser: interaction.user,
      targetUser: user,
      reason,
    });

    if (!result.ok) {
      await failEphemeral(interaction, result.reason);
      return;
    }

    await interaction.reply({
      content: `⚠️ Warned **${user.tag}** (ID #${result.warn.id}) — ${reason}`,
      ephemeral: true,
    });
  },

  // Shared with utils/nl.js (natural-language warnings).
  warnUser,
};
