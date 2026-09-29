'use strict';

/**
 * /country — public command that shows info about a country.
 *
 * Country data (flag emoji, capital, currency, languages, region) comes from
 * the free countries.trevorblades.com GraphQL API; population comes from the
 * free World Bank API. No keys needed.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

const FETCH_TIMEOUT_MS = 10_000;
const GRAPHQL_URL = 'https://countries.trevorblades.com/';
const COUNTRIES_QUERY = '{countries{code name capital emoji currency continent{name} languages{name}}}';

const CURRENCIES = {
  USD: ['US Dollar', '$'], EUR: ['Euro', '\u20AC'], GBP: ['British Pound', '\u00A3'],
  JPY: ['Japanese Yen', '\u00A5'], CNY: ['Chinese Yuan', '\u00A5'], CHF: ['Swiss Franc', 'Fr'],
  CAD: ['Canadian Dollar', '$'], AUD: ['Australian Dollar', '$'], SEK: ['Swedish Krona', 'kr'],
  NOK: ['Norwegian Krone', 'kr'], DKK: ['Danish Krone', 'kr'], NZD: ['New Zealand Dollar', '$'],
  MXN: ['Mexican Peso', '$'], BRL: ['Brazilian Real', 'R$'], INR: ['Indian Rupee', '\u20B9'],
  RUB: ['Russian Ruble', '\u20BD'], KRW: ['South Korean Won', '\u20A9'], TRY: ['Turkish Lira', '\u20BA'],
  ZAR: ['South African Rand', 'R'], AED: ['UAE Dirham', 'DH'], SAR: ['Saudi Riyal', '\uFDFC'],
  EGP: ['Egyptian Pound', 'E\u00A3'], NGN: ['Nigerian Naira', '\u20A6'], KES: ['Kenyan Shilling', 'KSh'],
  GHS: ['Ghanaian Cedi', '\u20B5'], PLN: ['Polish Zloty', 'z\u0142'], CZK: ['Czech Koruna', 'K\u010D'],
  HUF: ['Hungarian Forint', 'Ft'], RON: ['Romanian Leu', 'lei'], BGN: ['Bulgarian Lev', '\u043B\u0432'],
  HRK: ['Croatian Kuna', 'kn'], RSD: ['Serbian Dinar', 'din'], BAM: ['Bosnia-Herzegovina Mark', 'KM'],
  ALL: ['Albanian Lek', 'L'], MKD: ['Macedonian Denar', '\u0434\u0435\u043D'], UAH: ['Ukrainian Hryvnia', '\u20B4'],
  THB: ['Thai Baht', '\u0E3F'], VND: ['Vietnamese Dong', '\u20AB'], IDR: ['Indonesian Rupiah', 'Rp'],
  MYR: ['Malaysian Ringgit', 'RM'], PHP: ['Philippine Peso', '\u20B1'], SGD: ['Singapore Dollar', '$'],
  HKD: ['Hong Kong Dollar', '$'], TWD: ['New Taiwan Dollar', 'NT$'], PKR: ['Pakistani Rupee', '\u20A8'],
  BDT: ['Bangladeshi Taka', '\u09F3'], LKR: ['Sri Lankan Rupee', 'Rs'], NPR: ['Nepalese Rupee', 'Rs'],
  QAR: ['Qatari Riyal', 'QR'], KWD: ['Kuwaiti Dinar', 'KD'], JOD: ['Jordanian Dinar', 'JD'],
  ILS: ['Israeli Shekel', '\u20AA'], GEL: ['Georgian Lari', '\u20BE'], AMD: ['Armenian Dram', '\u058F'],
  AZN: ['Azerbaijani Manat', '\u20BC'],
};

function currencyLabel(code) {
  if (!code) return 'N/A';
  const info = CURRENCIES[code];
  return info ? `${code} (${info[0]} ${info[1]})` : code;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('[country] fetch failed:', err.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchCountries() {
  const data = await fetchJson(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: COUNTRIES_QUERY }),
  });
  const list = data?.data?.countries;
  return Array.isArray(list) ? list : null;
}

function findCountry(list, input) {
  const q = input.trim().toLowerCase();
  if (!q) return null;
  const byName = new Map();
  const byCode = new Map();
  for (const c of list) {
    if (c?.name) byName.set(c.name.toLowerCase(), c);
    if (c?.code) byCode.set(c.code.toLowerCase(), c);
  }
  if (byName.has(q)) return byName.get(q);
  if (byCode.has(q)) return byCode.get(q);
  for (const c of list) {
    if (c?.name && c.name.toLowerCase().startsWith(q)) return c;
  }
  for (const c of list) {
    if (c?.name && c.name.toLowerCase().includes(q)) return c;
  }
  return null;
}

async function fetchPopulation(code) {
  const url = `https://api.worldbank.org/v2/country/${encodeURIComponent(code)}/indicator/SP.POP.TOTL?format=json&per_page=5`;
  const data = await fetchJson(url);
  const rows = Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];
  for (const row of rows) {
    if (row && row.value != null) return Number(row.value);
  }
  return null;
}

function formatPopulation(n) {
  return n.toLocaleString('en-US');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('country')
    .setDescription('Show info about a country (flag, capital, population, …)')
    .setDMPermission(false)
    .addStringOption((option) => option
      .setName('name')
      .setDescription('Country name, e.g. Germany')
      .setRequired(true)
      .setMaxLength(100)),

  async execute(interaction) {
    try {
      const name = interaction.options.getString('name', true).trim();
      if (!name) {
        await failEphemeral(interaction, '🤔 Tell me which country to look up!');
        return;
      }

      const list = await fetchCountries();
      if (!list) {
        await failEphemeral(interaction, '😅 Could not reach the country database right now — try again in a bit!');
        return;
      }

      const country = findCountry(list, name);
      if (!country) {
        await failEphemeral(interaction, `🌍 I couldn\u2019t find a country called \u201C${name.slice(0, 100)}\u201D — try the full name (e.g. Germany).`);
        return;
      }

      const population = await fetchPopulation(country.code);
      const languages = (country.languages || []).map((l) => l.name).filter(Boolean);

      const embed = new EmbedBuilder()
        .setColor(0x27ae60)
        .setTitle(`${country.emoji || '🌍'} ${country.name}`)
        .addFields(
          { name: '🏛️ Capital', value: country.capital || 'N/A', inline: true },
          { name: '👥 Population', value: population ? formatPopulation(population) : 'N/A', inline: true },
          { name: '🗺️ Region', value: country.continent?.name || 'N/A', inline: true },
          { name: '🗣️ Languages', value: languages.length ? languages.join(', ') : 'N/A', inline: true },
          { name: '💱 Currency', value: currencyLabel(country.currency), inline: true },
        )
        .setFooter({ text: 'Country data • trevorblades GraphQL + World Bank' });

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('[country] execute failed:', err.message);
      await failEphemeral(interaction, 'Something went wrong');
    }
  },
};
