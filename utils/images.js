'use strict';

/**
 * RipoBot v5.4 — buddy image sharing.
 *
 * Free, no-key image sources a buddy can share like a human would:
 * - meme:  meme-api.com/gimme            (caption = the meme's title)
 * - cat:   cataas.com/cat                (caption = "a cute cat")
 * - dog:   dog.ceo/api/breeds/image/random (caption = "a cute dog" + breed)
 * - photo: picsum.photos/800/600        (caption = "a cool photo")
 *
 * fetchShareImage(kind) -> { buffer, ext, caption, kind } | null.
 * Every fetch has a timeout, content-type is validated as image/*, and
 * oversized files are rejected. Returns null on ANY failure — callers fall
 * back to a text-only reply.
 *
 * Share protocol: RipoBot embeds `[[share:<kind>:<BuddyName>]]` in a message
 * to ask ONE buddy to attach an image when it replies. Companions strip the
 * directive before feeding the text to their AI (stripShareDirectives), so it
 * never leaks into the visible conversation. Companions never self-initiate a
 * share — only RipoBot can request one — so shares can't loop or spam.
 */

const { MARK, shareDirectiveFor, stripMarkers } = require('./markers');

const FETCH_TIMEOUT_MS = 12_000;
const MAX_SHARE_BYTES = 6 * 1024 * 1024;

// Share directive: zero-width ENCODED marker `share:<kind>:<Name>` — truly
// invisible in chat (v7.0; the old visible [[...]] form is no longer
// produced, but shareDirectiveFor only matches the new form).
// Compat shims keep the old export names working for any external readers.
const SHARE_DIRECTIVE_RE = { test: (s) => !!shareDirectiveFor(s) };
const SHARE_DIRECTIVE_GLOBAL_RE = null; // unused; strip via stripShareDirectives

/** Build a share directive, zero-width-encoded so it stays invisible in chat. */
function shareDirective(kind, name) {
  return MARK.share(kind, name);
}

/** Remove share directives (and any markers) from text (for AI context / display). */
function stripShareDirectives(text) {
  return stripMarkers(String(text || ''));
}

async function fetchWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
}

/** Download a URL as image bytes. Returns { buffer, ext } or null. */
async function downloadImage(url) {
  const res = await fetchWithTimeout(url);
  if (!res || !res.ok) return null;
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (!ct.startsWith('image/')) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0 || buffer.length > MAX_SHARE_BYTES) return null;
  const ext = ct.includes('png') ? 'png' : ct.includes('gif') ? 'gif' : ct.includes('webp') ? 'webp' : 'jpg';
  return { buffer, ext };
}

async function fetchJson(url) {
  const res = await fetchWithTimeout(url);
  if (!res || !res.ok) return null;
  return res.json().catch(() => null);
}

async function shareMeme() {
  const meta = await fetchJson('https://meme-api.com/gimme');
  const url = meta && typeof meta.url === 'string' ? meta.url : null;
  if (!url) return null;
  const img = await downloadImage(url);
  if (!img) return null;
  const title =
    meta && typeof meta.title === 'string' && meta.title.trim()
      ? meta.title.trim().slice(0, 200)
      : 'a funny meme';
  return { ...img, caption: title, kind: 'meme' };
}

async function shareCat() {
  const img = await downloadImage('https://cataas.com/cat?width=800');
  if (!img) return null;
  return { ...img, caption: 'a cute cat', kind: 'cat' };
}

async function shareDog() {
  const meta = await fetchJson('https://dog.ceo/api/breeds/image/random');
  const url = meta && typeof meta.message === 'string' ? meta.message : null;
  if (!url) return null;
  const img = await downloadImage(url);
  if (!img) return null;
  let caption = 'a cute dog';
  const breedMatch = /\/breeds\/([^/]+)\//i.exec(url);
  if (breedMatch) caption = `a cute ${breedMatch[1].replace(/-/g, ' ')}`;
  return { ...img, caption, kind: 'dog' };
}

async function sharePhoto() {
  const img = await downloadImage('https://picsum.photos/800/600');
  if (!img) return null;
  return { ...img, caption: 'a cool photo', kind: 'photo' };
}

const SHARERS = { meme: shareMeme, cat: shareCat, dog: shareDog, photo: sharePhoto };
const SHARE_KINDS = Object.keys(SHARERS);

// ---------------------------------------------------------------------------
// v7.4: AI image generation via Pollinations.ai — free, no key, no signup.
// generateImageBuffer(prompt) -> { buffer, ext } | null. Never throws.
// ---------------------------------------------------------------------------

const POLLINATIONS_IMAGE_BASE = 'https://image.pollinations.ai/prompt';
const IMAGE_GEN_TIMEOUT_MS = 120_000; // image gen can take ~1 minute

function pollinationsImageUrl(prompt, { width = 1024, height = 1024 } = {}) {
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    nologo: 'true',
    model: 'flux',
    seed: String(Math.floor(Math.random() * 1_000_000)),
  });
  return `${POLLINATIONS_IMAGE_BASE}/${encodeURIComponent(prompt)}?${params.toString()}`;
}

/**
 * Generate an AI image from a text prompt. Returns { buffer, ext } or null
 * on any failure (timeout, non-image response, empty body). Never throws.
 */
async function generateImageBuffer(prompt, opts) {
  try {
    const cleanPrompt = String(prompt || '').trim().slice(0, 1000);
    if (!cleanPrompt) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_GEN_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(pollinationsImageUrl(cleanPrompt, opts), { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return null;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.startsWith('image/')) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_SHARE_BYTES * 2) return null;
    const ext = ct.includes('png') ? 'png' : ct.includes('gif') ? 'gif' : ct.includes('webp') ? 'webp' : 'jpg';
    return { buffer, ext };
  } catch (err) {
    console.error('[images] generate failed:', err.message);
    return null;
  }
}

/**
 * Fetch one shareable image. Returns { buffer, ext, caption, kind } or null
 * on any failure. Never throws.
 */
async function fetchShareImage(kind) {
  try {
    const fn = SHARERS[kind];
    if (!fn) return null;
    return await fn();
  } catch (err) {
    console.error(`[images] share fetch failed (${kind}):`, err.message);
    return null;
  }
}

/**
 * v7.4: natural-language image requests in chat.
 * "generate an image of a car" -> "a car". "draw me a dragon" -> "a dragon".
 * Questions without a subject ("can you generate images?") return null so
 * they fall through to normal chat (where the AI points at /imagine).
 */
const IMAGE_PROMPT_RES = [
  /(?:generate|create|make|draw|paint)\s+(?:me\s+)?(?:an?\s+|some\s+)?(?:ai\s+)?(?:images?|pictures?|photos?|pics?)\s+(?:of\s+)?(.{3,})/i,
  /(?:draw|paint)\s+me\s+(.{3,})/i,
];

function extractImagePrompt(text) {
  const clean = String(text || '').trim();
  if (!clean) return null;
  for (const re of IMAGE_PROMPT_RES) {
    const m = re.exec(clean);
    if (!m) continue;
    const subject = m[1].replace(/[?!.…\s]+$/g, '').trim().slice(0, 300);
    if (subject.length >= 3) return subject;
  }
  return null;
}

module.exports = {
  fetchShareImage,
  stripShareDirectives,
  shareDirective,
  SHARE_DIRECTIVE_RE,
  SHARE_KINDS,
  FETCH_TIMEOUT_MS,
  MAX_SHARE_BYTES,
  generateImageBuffer,
  extractImagePrompt,
};
