'use strict';

/**
 * /joke — public command that replies with a random clean, family-friendly
 * programming/gaming joke. No network calls.
 */

const { SlashCommandBuilder } = require('discord.js');

const JOKES = [
  'Why do programmers prefer dark mode? Because light attracts bugs.',
  'I told my computer I needed a break, and now it won\u2019t stop sending me to the beach.',
  'Why did the gamer bring a ladder? They wanted to reach the next level.',
  'A SQL query walks into a bar, sees two tables and asks: \u201cMind if I join you?\u201d',
  'Why do Java developers wear glasses? Because they don\u2019t C#.',
  'There are only 10 kinds of people: those who understand binary and those who don\u2019t.',
  'My gaming PC has commitment issues — it keeps crashing.',
  'Why was the programmer cold? They left their Windows open.',
  'A programmer\u2019s favorite snack? Cookies — especially the ones browsers save.',
  'Why did the NPC go to therapy? It had too many unresolved quests.',
  'I would tell you a UDP joke, but you might not get it.',
  'Debugging: being the detective in a crime movie where you are also the murderer.',
  'Why did the gamer stay up all night? Because they wanted to play it cool under the stars... in-game.',
  'Real programmers count from 0.',
  'Why don\u2019t programmers like nature? Too many bugs.',
  'My friend asked if I could stop making Zelda jokes. I said, \u201cIt\u2019s dangerous to go alone.\u201d',
  'Why did the smartphone go to the doctor? It lost its contacts.',
  'Git commit messages I wrote at 3am: \u201cplease work\u201d.',
  'Why was the console.log sad? It felt unreturned.',
  'The best thing about a Boolean is that even if you are wrong, you are only off by a bit.',
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('joke')
    .setDescription('Get a random clean programming/gaming joke')
    .setDMPermission(false),

  async execute(interaction) {
    const joke = JOKES[Math.floor(Math.random() * JOKES.length)];
    await interaction.reply(`😂 ${joke}`);
  },
};
