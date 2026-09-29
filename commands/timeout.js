'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { canModerate, failEphemeral } = require('../utils/permissions');

const MAX_MINUTES = 28 * 24 * 60; // Discord max timeout: 28 days

/**
 * Shared timeout core — used by /timeout and natural-language timeouts.
 * `invoker` is { member, user }; `targetUser` is a User object.
 * Returns { ok: true } or { ok: false, reason }.
 */
async function timeoutUser({ guild, invokerMember, invokerUser, targetUser, minutes, reason }) {
  let target;
  try {
    target = await guild.members.fetch(targetUser.id);
  } catch {
    target = null;
  }
  if (!target) {
    return { ok: false, reason: 'That user is not in this server.' };
  }

  if (target.isCommunicationDisabled()) {
    return { ok: false, reason: 'That user is already timed out.' };
  }

  const check = canModerate(
    { guild, member: invokerMember, user: invokerUser },
    target,
    PermissionFlagsBits.ModerateMembers,
    PermissionFlagsBits.ModerateMembers,
  );
  if (!check.ok) {
    return { ok: false, reason: check.reason };
  }

  try {
    await target.timeout(
      minutes * 60 * 1000,
      `${reason} (by ${invokerUser.tag})`.slice(0, 512),
    );
    return { ok: true };
  } catch (err) {
    console.error('[timeout] failed:', err.message);
    return { ok: false, reason: 'Timeout failed. I may be missing permissions.' };
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Time out a user (mute them temporarily)')
    .addUserOption((o) => o.setName('user').setDescription('User to time out').setRequired(true))
    .addIntegerOption((o) =>
      o
        .setName('minutes')
        .setDescription(`Duration in minutes (1-${MAX_MINUTES})`)
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(MAX_MINUTES),
    )
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setMaxLength(512))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const user = interaction.options.getUser('user', true);
    const minutes = interaction.options.getInteger('minutes', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    const result = await timeoutUser({
      guild: interaction.guild,
      invokerMember: interaction.member,
      invokerUser: interaction.user,
      targetUser: user,
      minutes,
      reason,
    });

    if (!result.ok) {
      await failEphemeral(interaction, result.reason);
      return;
    }

    await interaction.reply({
      content: `⏱️ Timed out **${user.tag}** for ${minutes} minute(s) — ${reason}`,
      ephemeral: true,
    });
  },

  // Shared with utils/nl.js (natural-language timeouts).
  timeoutUser,
  MAX_MINUTES,
};
