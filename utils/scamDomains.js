'use strict';

/**
 * Known-suspicious lookalike / malicious domains seen in Discord scams.
 *
 * All entries are lowercase and protocol-free (bare hostnames).
 * Extend this list as new scam domains appear — a message containing one
 * of these gets flagged by utils/spamfilter.js.
 */

const SCAM_DOMAINS = [
  // Discord / Nitro lookalikes
  'discrod.gift',
  'discord-nitro-free.com',
  'nitro-discord.com',
  'discordgift.shop',
  'free-nitro.xyz',
  'nitro-drops.com',
  'discord-nitro.click',
  // Fake verification / airdrop / crypto-doubler bait
  'airdrop-verify.com',
  'double-crypto.net',
  'discord-verify.net',
  'claim-nitro.gg',
  'token-grab.xyz',
  // Steam lookalikes
  'steamcommunity-com.ru',
  'steancommunity.com',
  'steamcommunlty.com',
];

module.exports = { SCAM_DOMAINS };
