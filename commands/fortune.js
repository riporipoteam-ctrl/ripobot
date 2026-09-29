'use strict';

/**
 * /fortune — public command that cracks open a virtual fortune cookie.
 * Everything is offline: a built-in list of ~20 fortune-cookie messages,
 * no network calls. Output format: "🥠 Your fortune: <text>".
 */

const { SlashCommandBuilder } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

const FORTUNES = [
  'A thrilling adventure is on its way to you.',
  'Your creativity will open doors you didn\u2019t know existed.',
  'Good things come to those who keep grinding.',
  'A new friendship is about to level up your life.',
  'Your hard work is about to pay off in a big way.',
  'Expect good news within the next seven days.',
  'Someone admires your courage — keep being bold.',
  'The stars are aligning in your favor. Strike now.',
  'A surprise victory is hiding in your near future.',
  'Your kindness will come back to you threefold.',
  'Trust your instincts — they are sharper than you think.',
  'An old idea of yours deserves a second chance.',
  'Patience and persistence will unlock your next big win.',
  'You will soon laugh about something that worries you today.',
  'A small risk taken now leads to a big reward later.',
  'Your energy attracts your destiny — stay positive.',
  'The answer you seek is closer than it appears.',
  'A generous heart brings you unexpected luck.',
  'Dreams you thought were distant are moving toward you.',
  'Today is your lucky day to start something new.',
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fortune')
    .setDescription('Crack open a fortune cookie')
    .setDMPermission(false),

  async execute(interaction) {
    try {
      const fortune = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
      await interaction.reply(`🥠 Your fortune: ${fortune}`);
    } catch (err) {
      console.error('[fortune] execute failed:', err.message);
      await failEphemeral(interaction, 'Something went wrong');
    }
  },
};
