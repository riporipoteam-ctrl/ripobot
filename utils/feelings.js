'use strict';

/**
 * Sentiment → affinity ("feelings") for RipoBot v3.
 *
 * analyzeMessage() runs each chat message through a Hugging Face sentiment model
 * and nudges the user's affinity score (via utils/levels.js) based on the mood:
 * friendly people warm the bot up, hostile people cool it down, sad people get
 * kindness. Any network failure or a missing HF_TOKEN degrades to neutral.
 *
 * NOTE: data/levels.json is ephemeral across host reboots (affinity resets).
 * The HF token comes from process.env.HF_TOKEN — never hardcoded here.
 */

const levels = require('./levels');

const HF_SENTIMENT_URL =
  'https://api-inference.huggingface.co/models/cardiffnlp/twitter-roberta-base-sentiment-latest';
const HF_TIMEOUT_MS = 10_000;

// Second-person attacks: "you're dumb", "u r stupid", "shut up", "i hate you", etc.
const HOSTILE_REGEX =
  /\b(you'?re?|u\s*r?)\s+(dumb|stupid|idiot|moron|trash|worthless|useless|loser)|\bshut\s*up\b|\bi\s+hate\s+you\b|\bkill\s*yourself\b|\bkys\b|\byou\s+suck\b|\bfuck\s+you\b|\bf\s+you\b/i;

// Someone going through it: "I'm sad", "so lonely", "anxious", etc.
const SAD_REGEX =
  /\b(sad|depressed|depressing|crying|lonely|anxious|anxiety|heartbroken|hopeless|miserable|suicidal)\b/i;

/**
 * Genuinely kind-note fragment the chat handler appends to the system prompt
 * when the user was last detected as vulnerable (sad/upset).
 */
const KINDNESS_NOTE =
  'The user seems to be going through a hard time. Be genuinely kind, supportive and warm regardless of anything else.';

/**
 * Run sentiment analysis on a message and adjust the user's affinity.
 *
 * @param {string} userId - Discord user id
 * @param {string} text - message content
 * @returns {Promise<{ affinity: number, mood: string, vulnerable: boolean }>}
 */
async function analyzeMessage(userId, text) {
  let label = 'NEUTRAL';

  try {
    const token = process.env.HF_TOKEN;
    if (!token) throw new Error('no HF_TOKEN');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HF_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(HF_SENTIMENT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: String(text).slice(0, 500) }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) throw new Error(`HF ${res.status}`);
    const data = await res.json();

    // Response: [{ label: 'POSITIVE'|'NEGATIVE'|'NEUTRAL', score }] (array may be nested).
    const flat = Array.isArray(data) ? data.flat() : [];
    let best = null;
    for (const item of flat) {
      if (item && typeof item.label === 'string' && typeof item.score === 'number') {
        if (!best || item.score > best.score) best = item;
      }
    }
    if (best) label = best.label.toUpperCase();
  } catch {
    label = 'NEUTRAL'; // any failure or missing token → neutral
  }

  const msg = String(text);
  let mood;
  let delta;

  if (label === 'POSITIVE') {
    mood = 'friendly';
    delta = 3;
  } else if (label === 'NEGATIVE') {
    if (HOSTILE_REGEX.test(msg)) {
      mood = 'attacking';
      delta = -12;
    } else if (SAD_REGEX.test(msg)) {
      mood = 'vulnerable';
      delta = 2;
    } else {
      mood = 'annoyed';
      delta = -4;
    }
  } else {
    mood = 'neutral';
    delta = 0.5;
  }

  // Sadness can be stated flatly even in "positive"/"neutral" messages.
  if (mood !== 'vulnerable' && mood !== 'attacking' && SAD_REGEX.test(msg)) {
    mood = 'vulnerable';
    delta = 2;
  }

  // THAW RULE: non-attacking moods slowly warm up a frosty relationship.
  const current = levels.getAffinity(userId);
  if (current < 0 && mood !== 'attacking') {
    delta += 1;
  }

  const affinity = levels.addAffinity(userId, delta);
  return { affinity, mood, vulnerable: mood === 'vulnerable' };
}

/**
 * System-prompt fragment describing the bot's relationship with a user,
 * based on their current affinity.
 *
 * @param {string} userId - Discord user id
 * @param {string} firstName - user's first name (for the adoring tier)
 * @returns {string}
 */
function relationshipPrompt(userId, firstName) {
  const affinity = levels.getAffinity(userId);
  if (affinity >= 30) {
    return `You ADORE this user (affinity ${affinity}). Be warm, playful, affectionate; use their first name ${firstName} sometimes.`;
  }
  if (affinity >= -20) {
    return 'You like this user fine. Normal friendly Ripo.';
  }
  if (affinity >= -60) {
    return `You're cold toward this user (affinity ${affinity}). Keep replies SHORT, dry, a little distant — but never rude.`;
  }
  return `You really don't want to talk to this user right now (affinity ${affinity}). Politely decline: say something like "Nah, I'm good right now." and NOTHING else.`;
}

/**
 * Emoji summarizing the bot's vibe toward someone.
 *
 * @param {number} affinity
 * @returns {string}
 */
function vibeEmoji(affinity) {
  if (affinity >= 50) return '😍';
  if (affinity >= 15) return '🙂';
  if (affinity >= -20) return '😐';
  if (affinity >= -60) return '😒';
  return '🚫';
}

module.exports = {
  analyzeMessage,
  relationshipPrompt,
  vibeEmoji,
  KINDNESS_NOTE,
  HOSTILE_REGEX,
  SAD_REGEX,
};
