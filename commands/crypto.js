'use strict';

/**
 * /crypto — public info command that shows a crypto price in USD.
 * Uses CoinGecko's free simple price API (no key needed). Accepts common
 * symbols/names plus any raw CoinGecko id. Never throws: unknown coins and
 * network failures get friendly replies.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const TIMEOUT_MS = 10000;

const COIN_MAP = {
  btc: 'bitcoin',
  bitcoin: 'bitcoin',
  eth: 'ethereum',
  ethereum: 'ethereum',
  sol: 'solana',
  solana: 'solana',
  doge: 'dogecoin',
  dogecoin: 'dogecoin',
  xrp: 'ripple',
  ripple: 'ripple',
  ada: 'cardano',
  cardano: 'cardano',
  bnb: 'binancecoin',
  binancecoin: 'binancecoin',
  ltc: 'litecoin',
  litecoin: 'litecoin',
  link: 'chainlink',
  chainlink: 'chainlink',
  dot: 'polkadot',
  polkadot: 'polkadot',
  avax: 'avalanche-2',
  avalanche: 'avalanche-2',
  'avalanche-2': 'avalanche-2',
  matic: 'matic-network',
  'matic-network': 'matic-network',
  shib: 'shiba-inu',
  'shiba-inu': 'shiba-inu',
  pepe: 'pepe',
  trx: 'tron',
  tron: 'tron',
  ton: 'toncoin',
  toncoin: 'toncoin',
  arb: 'arbitrum',
  arbitrum: 'arbitrum',
  op: 'optimism',
  optimism: 'optimism',
  inj: 'injective',
  injective: 'injective',
};

const EXAMPLES = 'bitcoin (btc), ethereum (eth), solana (sol), dogecoin (doge), chainlink (link)';

/**
 * Resolve a user's coin input to a CoinGecko id. Returns null if unknown.
 */
function resolveCoinId(input) {
  if (typeof input !== 'string') return null;
  return COIN_MAP[input.trim().toLowerCase()] ?? null;
}

/**
 * Fetch JSON with a 10s abort timeout. Returns the parsed JSON, or null
 * on any failure (network error, timeout, bad status, invalid JSON).
 */
async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'RipoBot/3.0 (+discord bot)' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Pretty display name: "avalanche-2" → "Avalanche 2". */
function prettyName(id) {
  return id
    .split(/[-_]/)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('crypto')
    .setDescription('Check a crypto price in USD')
    .addStringOption((o) =>
      o.setName('coin').setDescription('Coin name or symbol (default: bitcoin)').setMaxLength(100),
    )
    .setDMPermission(false),

  async execute(interaction) {
    const raw = interaction.options.getString('coin') ?? 'bitcoin';
    const id = resolveCoinId(raw);

    if (!id) {
      await interaction.reply({
        content: `🤷 I don't recognize that coin ("${raw}"). Try one of these: ${EXAMPLES}`,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    const data = await fetchJson(
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd`,
    );

    const price = data?.[id]?.usd;
    if (typeof price !== 'number') {
      await interaction.editReply(`😅 Couldn't get a price for ${prettyName(id)} right now — try again in a bit.`);
      return;
    }

    const formatted = price.toLocaleString('en-US', { maximumFractionDigits: 8 });

    const embed = new EmbedBuilder()
      .setColor(0xf7931a)
      .setTitle(`🪙 ${prettyName(id)} — $${formatted}`)
      .setFooter({ text: 'Data: CoinGecko' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
