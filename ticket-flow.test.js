'use strict';
/**
 * Sanity test for the ticket flow in events/messageCreate.js.
 * Extracts the REAL ticket functions from the file source and runs them
 * in a vm sandbox with stubbed Discord/store dependencies.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, 'events/messageCreate.js'), 'utf8');

// Extract a top-level `const NAME = ...;` or `function NAME(...) {...}` /
// `async function NAME(...) {...}` block by brace matching.
function extract(src, name, kind) {
  let start;
  if (kind === 'line') {
    // Const assignment possibly spanning lines: take through the terminating ';'.
    start = src.indexOf(`const ${name} =`);
    if (start === -1) throw new Error(`const ${name} not found`);
    const semi = src.indexOf(';', start);
    if (semi === -1) throw new Error(`no terminator for ${name}`);
    return src.slice(start, semi + 1);
  }
  if (kind === 'const') {
    start = src.indexOf(`const ${name} =`);
    if (start === -1) throw new Error(`const ${name} not found`);
  } else {
    const re = new RegExp(`(?:async\\s+)?function ${name}\\s*\\(`);
    const m = re.exec(src);
    if (!m) throw new Error(`function ${name} not found`);
    start = m.index;
  }
  let i = src.indexOf('{', start);
  if (kind === 'const') {
    // for const, find first { or [ after =
    const eq = src.indexOf('=', start);
    i = Math.min(
      ...['{', '['].map((c) => (src.indexOf(c, eq) === -1 ? Infinity : src.indexOf(c, eq))),
    );
  }
  let depth = 0;
  let inStr = null;
  let end = -1;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (inStr) {
      if (ch === '\\') { j++; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    // Skip // line comments (they may contain quotes/braces).
    if (ch === '/' && src[j + 1] === '/') {
      const nl = src.indexOf('\n', j);
      j = nl === -1 ? src.length : nl;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) { end = j + 1; break; }
    }
  }
  if (end === -1) throw new Error(`could not extract ${name}`);
  let code = src.slice(start, end);
  if (kind === 'const') code += ';';
  return code;
}

const pieces = [
  extract(SRC, 'TICKET_FAQ', 'const'),
  extract(SRC, 'THANKS_RE', 'line'),
  extract(SRC, 'TICKET_GREETING_RE', 'line'),
  extract(SRC, 'TICKET_WANTS_HUMAN_RE', 'line'),
  extract(SRC, 'isTooVague', 'fn'),
  extract(SRC, 'matchFaq', 'fn'),
  extract(SRC, 'escalateTicket', 'fn'),
  extract(SRC, 'faqOrEscalate', 'fn'),
  extract(SRC, 'runTicketFlow', 'fn'),
  // simple helpers copied verbatim (no deps)
  `function stripMentions(content) { return String(content || '').replace(/<@!?\\d+>/g, '').trim(); }`,
  `function safeName(member, user) { return (member && member.displayName) || (user && user.username) || 'someone'; }`,
].join('\n\n');

const store = {}; // channelId -> ticket record
const sent = [];  // captured { kind: 'send'|'reply', text }

const sandbox = {
  console,
  EmbedBuilder: class {
    constructor() { this.fields = []; }
    setColor() { return this; }
    setTitle() { return this; }
    addFields(...a) { this.fields.push(...a); return this; }
    setTimestamp() { return this; }
  },
  setProblem: (channelId, text) => {
    store[channelId] = store[channelId] || {};
    store[channelId].problem = String(text).slice(0, 2000);
  },
  setStage: (channelId, stage) => {
    store[channelId] = store[channelId] || {};
    store[channelId].stage = stage;
    store[channelId].escalated = stage === 'escalated';
  },
  findStaffRole: () => null, // -> "the mods", no ping
  findModLogsChannel: () => null, // no mod-logs post in test
};
vm.createContext(sandbox);
vm.runInContext(pieces, sandbox);
const runTicketFlow = vm.runInContext('runTicketFlow', sandbox);

function mockMessage(channelId, userId, content, stage) {
  store[channelId] = { userId, stage: stage === undefined ? null : stage, problem: '', escalated: false };
  sent.length = 0;
  return {
    content,
    author: { id: userId, bot: false, tag: 'Axor#0001', username: 'Axor' },
    member: { displayName: 'Axor' },
    guild: { roles: { cache: { find: () => null } } },
    channel: {
      id: channelId,
      send: async (t) => { sent.push({ kind: 'send', text: t }); },
    },
    reply: async (t) => { sent.push({ kind: 'reply', text: t }); },
  };
}

let pass = 0, fail = 0;
async function scenario(name, channelId, userId, content, stage, expect) {
  const msg = mockMessage(channelId, userId, content, stage);
  await runTicketFlow(msg, store[channelId]);
  const rec = store[channelId];
  const escalated = sent.some((s) => /i've called the mods/i.test(s.text));
  const greeted = sent.some((s) => /what can i help you with/i.test(s.text));
  const ok =
    (expect.escalated === undefined || expect.escalated === escalated) &&
    (expect.greeted === undefined || expect.greeted === greeted) &&
    (expect.stage === undefined || expect.stage === rec.stage);
  if (ok) { pass++; console.log(`ok   - ${name}`); }
  else {
    fail++;
    console.log(`FAIL - ${name}`);
    console.log(`  sent: ${JSON.stringify(sent.map((s) => s.text).slice(0, 2))}`);
    console.log(`  stage: ${rec.stage}, escalated=${escalated}, greeted=${greeted}`);
  }
}

(async () => {
  // The reported bug: "Hi" in a fresh ticket must NOT call the mods.
  await scenario('fresh ticket "Hi" -> asks what they need, no escalation', 'c1', 'u1', 'Hi', null,
    { escalated: false, greeted: true, stage: 'greeted' });
  await scenario('fresh ticket "I need support" -> asks what they need', 'c2', 'u1', 'I need support', null,
    { escalated: false, greeted: true, stage: 'greeted' });
  await scenario('fresh ticket "hello" -> asks what they need', 'c3', 'u1', 'hello', null,
    { escalated: false, greeted: true, stage: 'greeted' });
  // Real problem descriptions still escalate when no FAQ matches.
  await scenario('fresh ticket real problem -> escalates', 'c4', 'u1', 'my game crashes on startup every time', null,
    { escalated: true, stage: 'escalated' });
  await scenario('fresh ticket watch-ui bug -> escalates', 'c5', 'u1',
    'Its in the watch ui home page in game theres missing buttons like play and etc', null,
    { escalated: true, stage: 'escalated' });
  // Explicit human request escalates immediately.
  await scenario('fresh ticket "can you get a mod" -> escalates', 'c6', 'u1', 'can you get a mod in here please', null,
    { escalated: true, stage: 'escalated' });
  await scenario('answered + "i want a human" -> escalates', 'c7', 'u1', 'no, let me talk to a human', 'answered',
    { escalated: true, stage: 'escalated' });
  // Thanks still resolves.
  await scenario('answered + thanks -> resolved', 'c8', 'u1', 'thanks, that fixed it!', 'answered',
    { escalated: false, stage: 'resolved' });
  // While escalated: gentle reminder, no new escalation.
  await scenario('escalated + "hello?" -> reminder only', 'c9', 'u1', 'hello?', 'escalated',
    { escalated: false, stage: 'escalated' });
  // Greeted follow-up with a real problem -> normal flow.
  await scenario('greeted + real problem -> escalates', 'c10', 'u1', 'the play button is missing from my watch menu', 'greeted',
    { escalated: true, stage: 'escalated' });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
