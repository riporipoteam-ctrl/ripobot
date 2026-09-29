'use strict';

/**
 * /roast — public command that delivers a playful, light-hearted roast.
 * Everything is offline: a built-in list of ~15 roast templates with a
 * {name} placeholder. The target defaults to the command invoker and can
 * be changed with the optional user argument. Roasts are kept friendly
 * and fun only — nothing about appearance, race, gender, disability or
 * sexuality. Uses plain display names; never pings anyone.
 */

const { SlashCommandBuilder } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

const ROASTS = [
  '{name} is so slow, they make a loading screen look fast.',
  '{name} brings so much joy to the room — especially when they leave it. Just kidding!',
  'I would roast {name} harder, but I\u2019m afraid they\u2019d take it as a compliment.',
  '{name} has the reaction speed of a dial-up modem.',
  'Somewhere out there, {name}\u2019s ideas are all stored in a single kilobyte.',
  '{name} once got lost in a room with one door. Twice.',
  'If brains were dynamite, {name} couldn\u2019t blow their nose. (Just jokes!)',
  '{name}\u2019s jokes are so dry, the Sahara filed a complaint.',
  'Even the autocorrect gave up on {name}\u2019s typing.',
  '{name} is like a cloud — beautiful from far, but up close it\u2019s just fog.',
  '{name} is proof that even glitches can be charming.',
  'The Wi-Fi disconnected just to avoid being blamed for {name}\u2019s gameplay.',
  '{name}\u2019s strategies are so confusing, even the enemy felt bad winning.',
  '{name} is the human equivalent of a "loading..." spinner — but we love them anyway.',
  'If laziness were an Olympic sport, {name} wouldn\u2019t even show up to collect the medal.',
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
    .setName('roast')
    .setDescription('Playfully roast someone (all in good fun)')
    .addUserOption((o) =>
      o.setName('user').setDescription('Who to roast (defaults to you)').setRequired(false),
    )
    .setDMPermission(false),

  async execute(interaction) {
    try {
      const target = interaction.options.getUser('user') ?? interaction.user;
      const name = cleanName(target.displayName ?? target.username ?? 'Someone');
      const template = ROASTS[Math.floor(Math.random() * ROASTS.length)];
      const roast = template.replaceAll('{name}', name);

      await interaction.reply(`🔥 ${roast}`);
    } catch (err) {
      console.error('[roast] execute failed:', err.message);
      await failEphemeral(interaction, 'Something went wrong');
    }
  },
};
