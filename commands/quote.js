'use strict';

/**
 * /quote — public command that replies with an inspirational quote.
 * It tries the quotable.io API first (known to be dead), and always
 * falls back to a built-in list of ~15 inspirational quotes, so the
 * command works even when the API is unreachable. Output format:
 * "❝<quote>❞\n— <author>"
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

const FETCH_TIMEOUT_MS = 10_000;

const FALLBACK_QUOTES = [
  { text: 'The best way to predict the future is to invent it.', author: 'Alan Kay' },
  { text: 'Do not wait to strike till the iron is hot; but make it hot by striking.', author: 'William Butler Yeats' },
  { text: 'What you get by achieving your goals is not as important as what you become by achieving your goals.', author: 'Zig Ziglar' },
  { text: 'Whether you think you can or you think you can\u2019t, you\u2019re right.', author: 'Henry Ford' },
  { text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
  { text: 'Believe you can and you\u2019re halfway there.', author: 'Theodore Roosevelt' },
  { text: 'It always seems impossible until it\u2019s done.', author: 'Nelson Mandela' },
  { text: 'Don\u2019t watch the clock; do what it does. Keep going.', author: 'Sam Levenson' },
  { text: 'The future belongs to those who believe in the beauty of their dreams.', author: 'Eleanor Roosevelt' },
  { text: 'Act as if what you do makes a difference. It does.', author: 'William James' },
  { text: 'Success is not final, failure is not fatal: it is the courage to continue that counts.', author: 'Winston Churchill' },
  { text: 'You miss 100% of the shots you don\u2019t take.', author: 'Wayne Gretzky' },
  { text: 'Everything you\u2019ve ever wanted is on the other side of fear.', author: 'George Addair' },
  { text: 'Hardships often prepare ordinary people for an extraordinary destiny.', author: 'C.S. Lewis' },
  { text: 'Start where you are. Use what you have. Do what you can.', author: 'Arthur Ashe' },
];

/** Try the quotable API; returns {text, author} or null on any failure. */
async function fetchQuote() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.quotable.io/random', { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data?.content === 'string' && data.content.length) {
      return { text: data.content, author: data.author || 'Unknown' };
    }
    return null;
  } catch (err) {
    console.error('[quote] fetch failed:', err.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('quote')
    .setDescription('Get an inspirational quote')
    .setDMPermission(false),

  async execute(interaction) {
    try {
      const apiQuote = await fetchQuote();
      const quote =
        apiQuote ?? FALLBACK_QUOTES[Math.floor(Math.random() * FALLBACK_QUOTES.length)];

      const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setDescription(`\u275D${quote.text}\u275E\n\u2014 ${quote.author}`);

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('[quote] execute failed:', err.message);
      await failEphemeral(interaction, 'Something went wrong');
    }
  },
};
