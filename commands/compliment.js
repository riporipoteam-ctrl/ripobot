'use strict';

/**
 * /compliment — public command that gives a genuine, warm compliment.
 * Everything is offline: a built-in list of ~20 compliment templates
 * with a {name} placeholder. The target defaults to the command invoker
 * and can be changed with the optional user argument. Uses plain display
 * names; never pings anyone.
 */

const { SlashCommandBuilder } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

const COMPLIMENTS = [
  '{name}, you have a way of making everyone around you feel welcome.',
  'Your energy is contagious, {name} — in the best way possible.',
  '{name}, you always know the right thing to say.',
  'You\u2019re the kind of person who makes a bad day better, {name}.',
  '{name}, your creativity never fails to impress.',
  'You have an amazing sense of humor, {name} — never lose it.',
  '{name}, you make this server a better place just by being here.',
  'Your kindness doesn\u2019t go unnoticed, {name}.',
  '{name}, you handle challenges like an absolute champion.',
  'You\u2019re smarter than you give yourself credit for, {name}.',
  '{name}, your dedication is genuinely inspiring.',
  'The world is brighter with you in it, {name}.',
  '{name}, you have a rare gift for lifting people up.',
  'Your perspective always adds something valuable, {name}.',
  '{name}, you\u2019re proof that good people still exist.',
  'You make teamwork look easy, {name}.',
  '{name}, your positive attitude is a superpower.',
  'You\u2019re doing better than you think, {name} — keep going.',
  '{name}, your confidence inspires everyone around you.',
  'You have great taste and an even greater heart, {name}.',
];

/** Sanitize a name for plain display: trim, cap length, no newlines. */
function cleanName(name) {
  return String(name ?? 'Someone')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, 32) || 'Someone';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('compliment')
    .setDescription('Give someone a genuine compliment')
    .addUserOption((o) =>
      o.setName('user').setDescription('Who to compliment (defaults to you)').setRequired(false),
    )
    .setDMPermission(false),

  async execute(interaction) {
    try {
      const target = interaction.options.getUser('user') ?? interaction.user;
      const name = cleanName(target.displayName ?? target.username ?? 'Someone');
      const template = COMPLIMENTS[Math.floor(Math.random() * COMPLIMENTS.length)];
      const compliment = template.replaceAll('{name}', name);

      await interaction.reply(`💛 ${compliment}`);
    } catch (err) {
      console.error('[compliment] execute failed:', err.message);
      await failEphemeral(interaction, 'Something went wrong');
    }
  },
};
