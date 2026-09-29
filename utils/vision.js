'use strict';

/**
 * RipoBot v5.4 — vision: see what's on an image, like a human would.
 *
 * describeImage(buffer, mimeType) -> short plain-English description of the
 * image, or null on ANY failure (no HF_TOKEN, network error, timeout, bad
 * response, model error). Callers MUST always have a friendly text fallback.
 * Never throws, never logs tokens.
 *
 * Transport: the Hugging Face Inference router's OpenAI-compatible chat
 * completions endpoint (same pattern as utils/ai.js), with an `image_url`
 * content part carrying a data: URI.
 *
 * Model choice (verified 2026-09-27 via the public Hub API
 * https://huggingface.co/api/models/<id>):
 * - Qwen/Qwen2.5-VL-7B-Instruct — pipeline image-text-to-text, NOT gated,
 *   serverless status "warm". PRIMARY.
 * - Qwen/Qwen2-VL-7B-Instruct — ungated, no serverless slot. Fallback.
 * - google/gemma-3-4b-it — serverless "warm" but gated (manual approval).
 *   Last-resort fallback.
 * Deliberately NOT used: meta-llama/Llama-3.2-11B-Vision-Instruct — gated
 * AND no serverless endpoint at verification time.
 *
 * Only the primary + one fallback are tried: a chat reaction must stay
 * snappy, and a third attempt would just add latency before the fallback.
 */

const VISION_TIMEOUT_MS = 45_000;
const FALLBACK_TIMEOUT_MS = 30_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // Discord uploads cap at 10 MB

const FALLBACK_CHAIN = [
  'Qwen/Qwen2.5-VL-7B-Instruct',
  'Qwen/Qwen2-VL-7B-Instruct',
  'google/gemma-3-4b-it',
];

/** Primary + one fallback, honoring HF_VISION_MODEL as the primary. */
function visionModels() {
  const primary = process.env.HF_VISION_MODEL || FALLBACK_CHAIN[0];
  const chain = [primary];
  for (const m of FALLBACK_CHAIN) {
    if (!chain.includes(m)) chain.push(m);
  }
  return chain.slice(0, 2);
}

/**
 * One describe attempt against one model. Returns the description string or
 * null. Never throws.
 */
async function describeWithModel(buffer, mimeType, model, timeoutMs) {
  const token = process.env.HF_TOKEN;
  if (!token) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Describe this image briefly in one or two plain sentences. Just say what is visibly there — no preamble, no analysis.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType || 'image/jpeg'};base64,${buffer.toString('base64')}`,
                },
              },
            ],
          },
        ],
        max_tokens: 120,
        temperature: 0.3,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const text = data?.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch {
    return null; // network error, timeout (abort), bad JSON — all the same
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Describe an image buffer. Returns a short description string, or null on
 * any failure. Never throws.
 *
 * @param {Buffer} buffer raw image bytes
 * @param {string} mimeType e.g. "image/png"
 * @returns {Promise<string|null>}
 */
async function describeImage(buffer, mimeType) {
  try {
    if (!buffer || !Buffer.isBuffer(buffer)) return null;
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) return null;
    if (!process.env.HF_TOKEN) return null;
    const [primary, fallback] = visionModels();
    return (
      (await describeWithModel(buffer, mimeType, primary, VISION_TIMEOUT_MS)) ||
      (fallback ? await describeWithModel(buffer, mimeType, fallback, FALLBACK_TIMEOUT_MS) : null)
    );
  } catch {
    return null;
  }
}

module.exports = {
  describeImage,
  MAX_IMAGE_BYTES,
  // Exported for tests.
  _visionModels: visionModels,
};
