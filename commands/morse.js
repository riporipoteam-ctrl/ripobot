'use strict';

/**
 * /morse — public command that converts text to Morse code.
 * Offline, no API calls.
 */

const { SlashCommandBuilder } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

const MORSE = {
  a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.',
  h: '....', i: '..', j: '.---', k: '-.-', l: '.-..', m: '--', n: '-.',
  o: '---', p: '.--.', q: '--.-', r: '.-.', s: '...', t: '-', u: '..-',
  v: '...-', w: '.--', x: '-..-', y: '-.--', z: '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
  '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.',
  '!': '-.-.--', '/': '-..-.', '(': '-.--.', ')': '-.--.-',
  '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-',
  '+': '.-.-.', '-': '-....-', _: '..--.-', '"': '.-..-.',
  $: '...-..-', '@': '.--.-.',
};

function toMorse(text) {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  return words
    .map((word) =>
      [...word]
        .map((ch) => MORSE[ch])
        .filter(Boolean)
        .join(' '),
    )
    .filter(Boolean)
    .join('   ');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('morse')
    .setDescription('Convert text to Morse code ... --- ...')
    .addStringOption((o) =>
      o.setName('text').setDescription('Text to convert').setRequired(true).setMaxLength(300),
    )
    .setDMPermission(false),

  async execute(interaction) {
    try {
      const text = interaction.options.getString('text', true);
      const result = toMorse(text);
      if (!result) {
        await failEphemeral(interaction, '😅 Nothing convertible to Morse in there.');
        return;
      }
      await interaction.reply({ content: `\`\`\`${result}\`\`\`` });
    } catch (err) {
      console.error('[morse] execute failed:', err.message);
      await failEphemeral(interaction, 'Something went wrong');
    }
  },
};
