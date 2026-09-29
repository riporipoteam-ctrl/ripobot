'use strict';

/**
 * Toxicity auto-report for RipoBot v3.
 *
 * checkToxicity(text) -> reason string | null
 *
 * Two layers:
 *  1. Cheap local slur regex — instant report, no API call.
 *  2. Hugging Face unitary/toxic-bert via the Inference API. Report when the
 *     'toxic' label scores >= 0.90 or 'threat' >= 0.80.
 *
 * Everything is wrapped in try/catch: any failure (no HF_TOKEN, network,
 * bad JSON) returns null (no report). Never throws, never logs tokens.
 */

const TOXIC_URL = 'https://api-inference.huggingface.co/models/unitary/toxic-bert';
const TIMEOUT_MS = 10000;

// Compact blocklist of well-known slurs. Kept short and lowercase;
// matched case-insensitively with word boundaries.
const SLUR_REGEX =
  /\b(nigg[ae]r?|chink|spic|kike|fag(got)?|trann+y|retard|coon|gook|wetback|dyke)\b/i;

async function fetchWithTimeout(url, options, ms = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns a human-readable reason when the text should be reported to mods,
 * or null when it's clean (or the check couldn't run).
 */
async function checkToxicity(text) {
  const clean = String(text || '').trim();
  if (!clean) return null;

  if (SLUR_REGEX.test(clean)) {
    return 'Slur detected (blocklist match)';
  }

  const token = process.env.HF_TOKEN;
  if (!token) return null;

  let res;
  try {
    res = await fetchWithTimeout(TOXIC_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: clean.slice(0, 500) }),
    });
  } catch (err) {
    console.error('[toxicity] network error:', err.message);
    return null;
  }

  if (!res.ok) {
    console.error(`[toxicity] model returned HTTP ${res.status}`);
    return null;
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    console.error('[toxicity] bad JSON:', err.message);
    return null;
  }

  // unitary/toxic-bert returns [[{label, score}, ...]] (nested batch array).
  const labels = Array.isArray(data?.[0]) ? data[0] : Array.isArray(data) ? data : [];
  const scoreOf = (name) => {
    const hit = labels.find((l) => String(l.label).toLowerCase() === name);
    return typeof hit?.score === 'number' ? hit.score : 0;
  };

  const toxic = scoreOf('toxic');
  const threat = scoreOf('threat');
  if (toxic >= 0.9) return `Toxic language (model score ${toxic.toFixed(2)})`;
  if (threat >= 0.8) return `Threat detected (model score ${threat.toFixed(2)})`;
  return null;
}

module.exports = { checkToxicity };
