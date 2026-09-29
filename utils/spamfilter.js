'use strict';

/**
 * In-memory spam and scam detection.
 *
 * checkSpam(message): repetition flood detection per user (sliding window).
 * checkScam(text):    pattern + suspicious-domain detection for scam text.
 *
 * All state is in-memory; nothing here persists to disk.
 */

const { SCAM_DOMAINS } = require('./scamDomains');

const WINDOW_MS = 60_000; // per-user message history window
const FLOOD_WINDOW_MS = 10_000; // repetition flood window
const FLOOD_THRESHOLD = 4; // same content N times within the flood window = spam
const MAX_USERS = 500; // cap on tracked users (drops oldest)

// A message made up only of emojis (custom <:name:id> / <a:name:id> or
// unicode) is never flood-spam — people test/react with emojis in bursts.
const EMOJI_ONLY_RE = /^(?:<a?:\w+:\d+>|\p{Extended_Pictographic}\uFE0F?|[\s\u200d])*$/u;

/** Map<userId, Array<{ content: string, ts: number }>> */
const userHistory = new Map();

/**
 * Detect message floods: the same normalized content repeated within a
 * short window by a non-bot author.
 *
 * @param {import('discord.js').Message} message
 * @returns {{ type: 'spam' } | null}
 */
function checkSpam(message) {
  if (!message?.author || message.author.bot) return null;
  if (!message.guild) return null;

  // Staff are trusted: never eat a moderator's messages with the flood
  // filter (they test emojis/features and run events in bursts).
  try {
    if (message.member?.permissions?.has('ManageMessages')) return null;
  } catch {
    /* fall through to normal checks */
  }

  const raw = String(message.content ?? '').trim();
  const normalized = raw.toLowerCase();
  if (!normalized) return null;

  // Emoji-only messages (custom or unicode) are never flood-spam.
  if (EMOJI_ONLY_RE.test(raw)) return null;

  const userId = message.author.id;
  const now = Date.now();

  // Prune entries older than the history window.
  for (const [id, entries] of userHistory) {
    const fresh = entries.filter((e) => now - e.ts <= WINDOW_MS);
    if (fresh.length === 0) {
      userHistory.delete(id);
    } else if (fresh.length !== entries.length) {
      userHistory.set(id, fresh);
    }
  }

  // Cap the map: drop the oldest entry when over capacity.
  if (!userHistory.has(userId) && userHistory.size >= MAX_USERS) {
    const oldest = userHistory.keys().next().value;
    userHistory.delete(oldest);
  }

  const entries = userHistory.get(userId) ?? [];
  const repeats = entries.filter(
    (e) => e.content === normalized && now - e.ts <= FLOOD_WINDOW_MS,
  ).length;

  entries.push({ content: normalized, ts: now });
  userHistory.set(userId, entries);

  return repeats + 1 >= FLOOD_THRESHOLD ? { type: 'spam' } : null;
}

// Scam-text patterns (case-insensitive).
const SCAM_PATTERNS = [
  [/free\s+nitro/, 'free nitro bait'],
  [/discord\.gift\/[a-z0-9]+/, 'suspicious discord.gift link'],
  [/\bairdrop\b.*(claim|verify|connect wallet)/, 'fake airdrop'],
  [/steamcommunity\.\S*login/, 'fake steam login'],
  [/double\s+(your\s+)?(crypto|eth|btc|bitcoin)/, 'crypto doubler scam'],
  [/(dm|message)\s+me.*(nitro|gift)/, 'nitro bait'],
];

const DOMAIN_RE = /(https?:\/\/)?([a-z0-9.-]+\.[a-z]{2,})/gi;

/**
 * Check text against scam patterns and the suspicious-domain list.
 *
 * @param {string} text
 * @returns {string | null} a human-readable reason, or null when clean.
 */
function checkScam(text) {
  const lowered = String(text ?? '').toLowerCase();
  if (!lowered) return null;

  for (const [pattern, reason] of SCAM_PATTERNS) {
    if (pattern.test(lowered)) return reason;
  }

  const domains = new Set();
  let match;
  DOMAIN_RE.lastIndex = 0;
  while ((match = DOMAIN_RE.exec(lowered)) !== null) {
    domains.add(match[2]);
  }

  for (const domain of domains) {
    // Registrable suffix approximation: last two labels.
    const parts = domain.split('.');
    const suffix = parts.length >= 2 ? parts.slice(-2).join('.') : domain;
    // NOTE: only the extracted-host-contains-bad-domain direction is used.
    // Matching the reverse direction (bad domain contains the host) would
    // false-positive on the most common legit domain, 'discord.com', which
    // is a substring of 'nitro-discord.com'.
    const hit = SCAM_DOMAINS.find((bad) => domain.includes(bad) || suffix === bad);
    if (hit) return `suspicious link: ${domain}`;
  }

  return null;
}

/** Clear all in-memory spam state (used by tests). */
function resetForTests() {
  userHistory.clear();
}

module.exports = { checkSpam, checkScam, resetForTests };
