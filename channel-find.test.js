'use strict';
/** Test findChannelByName / findModLogsChannel against emoji-prefixed names. */
const { findChannelByName, findModLogsChannel, normalizeChannelName } = require('./utils/modreport');

function mockGuild(names) {
  return {
    channels: {
      cache: {
        find: (pred) => names.map((n) => ({
          name: n,
          isTextBased: () => true,
          isThread: () => false,
        })).find(pred) ?? null,
      },
    },
  };
}

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = (got?.name ?? null) === want;
  if (ok) { pass++; console.log(`ok   - ${name}`); }
  else { fail++; console.log(`FAIL - ${name}: got ${got?.name ?? null}, want ${want}`); }
}

const guild = mockGuild(['👋・welcome', '💭・general', '🛡️・mod-logs', '📜・rules', '🎫・tickets']);

check('mod-logs found via emoji prefix', findModLogsChannel(guild), '🛡️・mod-logs');
check('welcome found via emoji prefix', findChannelByName(guild, 'welcome'), '👋・welcome');
check('general found via emoji prefix', findChannelByName(guild, 'general'), '💭・general');
check('missing channel -> null', findChannelByName(guild, 'nope'), null);
check('empty query -> null', findChannelByName(guild, ''), null);
check('null guild -> null', findChannelByName(null, 'mod-logs'), null);
const norm = normalizeChannelName('🛡️・mod-logs');
if (norm === 'modlogs') { pass++; console.log('ok   - normalize strips emoji/dashes'); }
else { fail++; console.log(`FAIL - normalize strips emoji/dashes: got ${norm}`); }

// Plain (non-emoji) server still works.
const plain = mockGuild(['welcome', 'mod-logs', 'general']);
check('plain mod-logs still found', findModLogsChannel(plain), 'mod-logs');
check('plain welcome still found', findChannelByName(plain, 'welcome'), 'welcome');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
