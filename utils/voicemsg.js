'use strict';

/**
 * Voice-message speech-to-text for RipoBot.
 *
 * Transcription runs through the ripo-stt Cloudflare Worker (Workers AI
 * Whisper — free tier, no API key in the bot). The worker URL and shared
 * secret come from the environment:
 *   RIPO_STT_URL     e.g. https://ripo-stt.ripo-ripoteam.workers.dev
 *   RIPO_STT_SECRET  shared secret, also set as a worker secret
 *
 * Nothing here throws: failures return null and the caller falls back to a
 * friendly text reply.
 */

const STT_TIMEOUT_MS = 90_000;

function sttConfigured() {
  return Boolean(process.env.RIPO_STT_URL && process.env.RIPO_STT_SECRET);
}

/**
 * Transcribe raw audio bytes (OGG Opus voice message, MP3, WAV, ...).
 * Returns the transcript string, or null when unavailable/failed.
 */
async function transcribe(audioBuffer) {
  const url = process.env.RIPO_STT_URL;
  const secret = process.env.RIPO_STT_SECRET;
  if (!url || !secret || !audioBuffer || !audioBuffer.length) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STT_TIMEOUT_MS);
  try {
    const res = await fetch(String(url).replace(/\/$/, '') + '/', {
      method: 'POST',
      headers: {
        'x-ripo-secret': secret,
        'content-type': 'application/octet-stream',
      },
      body: audioBuffer,
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const text = data && typeof data.text === 'string' ? data.text.trim() : '';
    return text || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { sttConfigured, transcribe };
