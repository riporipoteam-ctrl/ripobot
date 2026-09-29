'use strict';

/**
 * /bored — public command that suggests a random activity when you are bored.
 *
 * The Bored API (boredapi.com) is unreachable from this environment, so this
 * command ships with a built-in activity list instead. Same vibe, zero network.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

const ACTIVITIES = [
  { activity: 'Learn a new magic trick', type: 'recreational', participants: 1 },
  { activity: 'Bake a cake from scratch', type: 'cooking', participants: 1 },
  { activity: 'Go for a long walk with no destination in mind', type: 'recreational', participants: 1 },
  { activity: 'Start a 30-day drawing challenge', type: 'creative', participants: 1 },
  { activity: 'Teach yourself to solve a Rubik\u2019s cube', type: 'recreational', participants: 1 },
  { activity: 'Write a short story in one sitting', type: 'creative', participants: 1 },
  { activity: 'Have a board game night with friends', type: 'social', participants: 4 },
  { activity: 'Learn to juggle with three balls', type: 'recreational', participants: 1 },
  { activity: 'Try a new recipe from a different country', type: 'cooking', participants: 2 },
  { activity: 'Organize your room like a speedrun — beat your PB', type: 'busywork', participants: 1 },
  { activity: 'Start a journal and write about your day', type: 'relaxation', participants: 1 },
  { activity: 'Build a playlist for every mood you have', type: 'music', participants: 1 },
  { activity: 'Learn five phrases in a new language', type: 'education', participants: 1 },
  { activity: 'Play hide and seek in the dark', type: 'social', participants: 3 },
  { activity: 'Do a 20-minute home workout', type: 'recreational', participants: 1 },
  { activity: 'Make origami animals', type: 'creative', participants: 1 },
  { activity: 'Stargaze and try to name three constellations', type: 'relaxation', participants: 2 },
  { activity: 'Learn to speed-type — aim for 80 WPM', type: 'education', participants: 1 },
  { activity: 'Host a movie night with a theme', type: 'social', participants: 3 },
  { activity: 'Draw your favorite game character from memory', type: 'creative', participants: 1 },
  { activity: 'Go birdwatching and log what you spot', type: 'recreational', participants: 1 },
  { activity: 'Learn a card trick and perform it for someone', type: 'recreational', participants: 2 },
  { activity: 'Rearrange your furniture', type: 'busywork', participants: 1 },
  { activity: 'Meditate for ten minutes', type: 'relaxation', participants: 1 },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bored')
    .setDescription('Get a random activity idea when you are bored')
    .setDMPermission(false),

  async execute(interaction) {
    try {
      const pick = ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)];

      const embed = new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle('🎲 Bored? Try this')
        .addFields(
          { name: 'Activity', value: pick.activity, inline: false },
          { name: 'Type', value: pick.type, inline: true },
          { name: 'Participants', value: String(pick.participants), inline: true },
        );

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('[bored] execute failed:', err.message);
      await failEphemeral(interaction, 'Something went wrong');
    }
  },
};
