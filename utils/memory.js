'use strict';

/**
 * Per-user long-term memory for RipoBot.
 *
 * Stored in data/memory.json:
 *   { users: { "<userId>": { facts: [max 50], history: [{role, content}, max 12], updatedAt } } }
 *
 * Chat phrases (handled in events/messageCreate.js):
 *   "remember that <fact>"        -> store the fact, brief confirmation
 *   "what do you remember about me" -> list stored facts
 *   "forget <phrase>"             -> remove facts containing the phrase
 *   "forget everything about me"  -> wipe the user's whole entry
 *
 * NOTE (hosting): the Hugging Face Space container disk is EPHEMERAL, so this
 * memory persists only as long as the container runs (it is kept awake by a
 * keepalive ping). A rebuild/restart of the Space resets it. Same caveat as
 * data/warns.json.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MEMORY_FILE = path.join(DATA_DIR, 'memory.json');

const MAX_FACTS = 50;
const MAX_HISTORY = 28;

function blankStore() {
  return { users: {} };
}

function loadStore() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const raw = fs.readFileSync(MEMORY_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.users === 'object' && parsed.users !== null) {
      return parsed;
    }
  } catch {
    // Missing or corrupt file — start fresh.
  }
  return blankStore();
}

function saveStore(store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${MEMORY_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmp, MEMORY_FILE);
}

function getEntry(userId) {
  const store = loadStore();
  let entry = store.users[userId];
  if (!entry || !Array.isArray(entry.facts) || !Array.isArray(entry.history)) {
    entry = { facts: [], history: [], updatedAt: new Date().toISOString() };
    store.users[userId] = entry;
    saveStore(store);
  }
  return { store, entry };
}

/** Store a fact about a user. Returns true if it was new. */
function rememberFact(userId, fact) {
  const clean = String(fact).trim().slice(0, 500);
  if (!clean) return false;
  const { store, entry } = getEntry(userId);
  const exists = entry.facts.some((f) => f.toLowerCase() === clean.toLowerCase());
  if (exists) return false;
  entry.facts.push(clean);
  while (entry.facts.length > MAX_FACTS) entry.facts.shift();
  entry.updatedAt = new Date().toISOString();
  saveStore(store);
  return true;
}

/** All stored facts for a user (array of strings). */
function getFacts(userId) {
  const { entry } = getEntry(userId);
  return [...entry.facts];
}

/**
 * Remove facts containing `phrase` (case-insensitive).
 * Returns the number of facts removed.
 */
function forgetMatching(userId, phrase) {
  const needle = String(phrase).trim().toLowerCase();
  if (!needle) return 0;
  const { store, entry } = getEntry(userId);
  const before = entry.facts.length;
  entry.facts = entry.facts.filter((f) => !f.toLowerCase().includes(needle));
  const removed = before - entry.facts.length;
  if (removed > 0) {
    entry.updatedAt = new Date().toISOString();
    saveStore(store);
  }
  return removed;
}

/** Wipe a user's whole memory entry. Returns true if anything was stored. */
function forgetAll(userId) {
  const store = loadStore();
  const had = !!store.users[userId];
  delete store.users[userId];
  if (had) saveStore(store);
  return had;
}

/** Append a chat turn to the user's persistent history (capped). */
function pushChatHistory(userId, role, content) {
  const { store, entry } = getEntry(userId);
  entry.history.push({ role, content: String(content).slice(0, 2000) });
  while (entry.history.length > MAX_HISTORY) entry.history.shift();
  entry.updatedAt = new Date().toISOString();
  saveStore(store);
}

/** Recent persistent chat history for prompt injection. */
function getChatHistory(userId) {
  const { entry } = getEntry(userId);
  return entry.history.map((h) => ({ role: h.role, content: h.content }));
}

/**
 * Build the extra system-prompt block with the user's facts + recent history.
 * Returns '' when there is nothing to inject.
 */
function factsBlock(userId) {
  const facts = getFacts(userId);
  const history = getChatHistory(userId);
  const parts = [];
  if (facts.length > 0) {
    parts.push(
      'Things this user asked you to remember about them:\n' +
        facts.map((f) => `- ${f}`).join('\n'),
    );
  }
  if (history.length > 0) {
    parts.push(
      'Recent conversation with this user:\n' +
        history.map((h) => `${h.role === 'user' ? 'User' : 'Ripo'}: ${h.content}`).join('\n'),
    );
  }
  return parts.join('\n\n');
}

/**
 * Parse a message for memory commands. Returns one of:
 *   { type: 'remember', fact } | { type: 'recall' } |
 *   { type: 'forget', phrase } | { type: 'forgetAll' } | null
 */
function parseMemoryCommand(text) {
  const t = String(text).trim();

  let m = t.match(/^remember that\s+(.+)$/is);
  if (m) return { type: 'remember', fact: m[1].trim() };

  if (/^what do you remember about me\??$/i.test(t)) return { type: 'recall' };

  // "forget everything about me" must be checked before the generic forget.
  if (/^forget everything about me\.?$/i.test(t)) return { type: 'forgetAll' };

  m = t.match(/^forget\s+(.+)$/is);
  if (m) return { type: 'forget', phrase: m[1].trim() };

  return null;
}

module.exports = {
  rememberFact,
  getFacts,
  forgetMatching,
  forgetAll,
  pushChatHistory,
  getChatHistory,
  factsBlock,
  parseMemoryCommand,
  MAX_FACTS,
  MAX_HISTORY,
};
