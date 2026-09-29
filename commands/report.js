'use strict';

/**
 * /report — report a user to the mod team.
 *
 * Anyone can use it (no special permission). Posts a formatted report to
 * #mod-logs and confirms ephemerally. You can't report yourself or the bot.
 */

const { SlashCommandBuilder } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');
const { postModReport } = require('../utils/modreport');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription('Report a user to the mod team')
    .addUserOption((o) =>
      o.setName('user').setDescription('User to report').setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName('reason')
        .setDescription('Why are you reporting them?')
        .setRequired(true)
        .setMaxLength(500),
    )
    .setDMPermission(false),

  async execute(interaction) {
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);

    if (user.id === interaction.user.id) {
      await failEphemeral(interaction, "You can't report yourself.");
      return;
    }

    if (user.id === interaction.client.user.id) {
      await failEphemeral(interaction, "You can't report me! 😅");
      return;
    }

    const ok = await postModReport({
      guild: interaction.guild,
      reportedUser: user,
      channel: interaction.channel,
      content: '(reported via /report — no message link)',
      messageUrl: null,
      reason: `${reason} (reported by ${interaction.user.tag})`,
    });

    if (!ok) {
      await failEphemeral(
        interaction,
        '😅 Could not deliver the report — the mod-logs channel may be missing.',
      );
      return;
    }

    await interaction.reply({
      content: '✅ Reported. The mods will take a look.',
      ephemeral: true,
    });
  },
};
