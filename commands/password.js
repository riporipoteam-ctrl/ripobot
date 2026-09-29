'use strict';

/**
 * /password — generates a random password from an unambiguous charset
 * (no 0/O/1/l/I) and shows it only to you (ephemeral reply).
 */

const crypto = require('crypto');
const { SlashCommandBuilder } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

const CHARSET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!?@#$%&*-_';
const DEFAULT_LENGTH = 16;

function generatePassword(length) {
  const bytes = crypto.randomBytes(length);
  let pw = '';
  for (const b of bytes) {
    pw += CHARSET[b % CHARSET.length];
  }
  return pw;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('password')
    .setDescription('Generate a random password (only you can see it)')
    .setDMPermission(false)
    .addIntegerOption((option) => option
      .setName('length')
      .setDescription('Password length (8-64)')
      .setRequired(false)
      .setMinValue(8)
      .setMaxValue(64)),

  async execute(interaction) {
    try {
      const length = interaction.options.getInteger('length') ?? DEFAULT_LENGTH;
      const password = generatePassword(length);
      await interaction.reply({
        content: `🔑 \`${password}\`\n(only you can see this — don\u2019t share it)`,
        ephemeral: true,
      });
    } catch (err) {
      console.error('[password] execute failed:', err.message);
      await failEphemeral(interaction, 'Something went wrong');
    }
  },
};
