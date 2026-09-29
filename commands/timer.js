'use strict';

/**
 * /timer — set a simple countdown timer.
 *
 * Cap of 3 concurrent timers per user (module-level Map). When the timer
 * fires, the bot pings the user in the channel where it was set. This ping
 * is the ONLY ping this command is allowed to send.
 *
 * NOTE: timers are in-memory (setTimeout) and die on bot reboot — accepted
 * for v3. data/ persistence isn't needed for something this ephemeral.
 */

const { SlashCommandBuilder } = require('discord.js');

const MAX_TIMERS_PER_USER = 3;

// userId -> number of currently active timers.
const activeTimers = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timer')
    .setDescription('Set a countdown timer — I will ping you when it fires')
    .addIntegerOption((o) =>
      o
        .setName('seconds')
        .setDescription('How many seconds until it fires?')
        .setRequired(true)
        .setMinValue(5)
        .setMaxValue(3600),
    )
    .addStringOption((o) =>
      o
        .setName('label')
        .setDescription('What should I remind you about?')
        .setRequired(true)
        .setMaxLength(100),
    )
    .setDMPermission(false),

  async execute(interaction) {
    const seconds = interaction.options.getInteger('seconds', true);
    const label = interaction.options.getString('label', true);
    const userId = interaction.user.id;

    const current = activeTimers.get(userId) || 0;
    if (current >= MAX_TIMERS_PER_USER) {
      await interaction.reply({
        content: '😅 You already have 3 timers running.',
        ephemeral: true,
      });
      return;
    }

    activeTimers.set(userId, current + 1);

    await interaction.reply({
      content: `⏰ Timer set: **${label}** — I'll ping you in ${seconds}s.`,
      ephemeral: true,
    });

    // In-memory timer: dies on bot reboot (accepted — cheap and simple).
    setTimeout(async () => {
      try {
        await interaction.followUp({
          content: `<@${userId}> ⏰ **${label}** — time's up!`,
        });
      } catch (err) {
        console.error('[timer] followUp failed:', err.message);
      } finally {
        const left = (activeTimers.get(userId) || 1) - 1;
        if (left <= 0) {
          activeTimers.delete(userId);
        } else {
          activeTimers.set(userId, left);
        }
      }
    }, seconds * 1000);
  },
};
