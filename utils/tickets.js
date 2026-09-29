'use strict';

/**
 * Ticket-support store for RipoBot v5.
 *
 * Tracks ticket channels so the bot knows who opened each ticket and what
 * stage the conversation is in. Pure JSON store — no Discord calls here.
 *
 * Store shape (data/tickets.json):
 *   { tickets: { [channelId]: { userId, stage, problem, escalated, createdAt } } }
 *
 * Stages: null (just created) -> 'greeted' -> 'noted' -> 'answered' | 'escalated'
 *   'answered' -> 'resolved' (opener says thanks / it worked)
 *   'resolved' -> treated as a new problem on the next message.
 *
 * Writes are atomic (temp file + rename) so a crash can't corrupt the data,
 * and loads are tolerant (missing/corrupt file -> blank store).
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const TICKETS_FILE = path.join(DATA_DIR, 'tickets.json');

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function blankStore() {
  return { tickets: {} };
}

function blankTicket() {
  return {
    userId: null,
    stage: null,
    problem: '',
    escalated: false,
    createdAt: new Date().toISOString(),
  };
}

function loadStore() {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(TICKETS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.tickets && typeof parsed.tickets === 'object' && !Array.isArray(parsed.tickets)) {
      return parsed;
    }
    return blankStore();
  } catch {
    return blankStore();
  }
}

function saveStore(store) {
  ensureDataDir();
  const tmp = `${TICKETS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmp, TICKETS_FILE);
}

function sanitizeTicket(t) {
  const base = blankTicket();
  if (!t || typeof t !== 'object') return base;
  return {
    userId: typeof t.userId === 'string' ? t.userId : null,
    stage: typeof t.stage === 'string' ? t.stage : null,
    problem: typeof t.problem === 'string' ? t.problem : '',
    escalated: t.escalated === true,
    createdAt: typeof t.createdAt === 'string' ? t.createdAt : base.createdAt,
  };
}

/**
 * Get the ticket record for a channel, or null when untracked.
 * @param {string} channelId
 * @returns {{ userId: string|null, stage: string|null, problem: string, escalated: boolean, createdAt: string } | null}
 */
function getTicket(channelId) {
  const store = loadStore();
  const t = store.tickets[channelId];
  return t ? sanitizeTicket(t) : null;
}

/**
 * Create a ticket record for a channel if none exists. Returns the record.
 * @param {string} channelId
 */
function ensureTicket(channelId) {
  const store = loadStore();
  if (!store.tickets[channelId]) {
    store.tickets[channelId] = blankTicket();
    saveStore(store);
  }
  return sanitizeTicket(store.tickets[channelId]);
}

function updateTicket(channelId, patch) {
  const store = loadStore();
  const current = sanitizeTicket(store.tickets[channelId]);
  store.tickets[channelId] = { ...current, ...patch };
  saveStore(store);
  return sanitizeTicket(store.tickets[channelId]);
}

/** @param {string} channelId @param {string} userId */
function setOpener(channelId, userId) {
  return updateTicket(channelId, { userId: String(userId) });
}

/** @param {string} channelId @param {string|null} stage */
function setStage(channelId, stage) {
  return updateTicket(channelId, { stage, escalated: stage === 'escalated' });
}

/** @param {string} channelId @param {string} text */
function setProblem(channelId, text) {
  return updateTicket(channelId, { problem: String(text ?? '').slice(0, 2000) });
}

/** All tracked tickets, keyed by channel id. */
function allTickets() {
  const store = loadStore();
  const out = {};
  for (const [id, t] of Object.entries(store.tickets)) {
    out[id] = sanitizeTicket(t);
  }
  return out;
}

module.exports = {
  getTicket,
  ensureTicket,
  setOpener,
  setStage,
  setProblem,
  allTickets,
};
