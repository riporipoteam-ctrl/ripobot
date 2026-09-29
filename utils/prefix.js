'use strict';

/**
 * v7.4: prefix commands — every slash command also runs from a plain message.
 *
 *   !imagine a red car        -> same as /imagine prompt:"a red car"
 *   !warn @user spamming      -> same as /warn user:@user reason:"spamming"
 *   !kick @user being rude
 *
 * v7.4.2: NATURAL commands — no prefix at all. When the first word of a
 * message is a command name, it runs the same engine:
 *
 *   ban Bob                   -> /ban, but ONLY if the author outranks
 *                                (Owner/Co-Owner). Lower ranks get a decline.
 *   warn @user spam           -> /warn (Owner/Co-Owner/Moderators)
 *   imagine a dragon          -> /imagine (everyone)
 *
 * Natural rules: the message must parse cleanly or it falls through to
 * normal chat ("warn me when it's done" stays chat). Permission failures
 * on well-formed admin commands get an explicit decline. Users can be
 * named by mention, ID, username, or display name ("ban Bob").
 *
 * How it works: the message is matched to a slash-command module, its
 * declared options (from the SlashCommandBuilder) are filled positionally
 * from the message text, and the module's execute() runs against a small
 * adapter that looks like a ChatInputCommandInteraction (reply/deferReply/
 * editReply/followUp + options.getString/getUser/...). No command modules
 * had to change.
 *
 * Permissions (Armin's rule):
 *  - Commands that are NOT staff-gated on slash (no default member
 *    permissions): anyone can use them, via prefix or naturally.
 *  - Staff-gated commands: Owner + Co-Owner roles only ("👑 Owner" /
 *    "🛡️ Co-Owner", or the actual server owner).
 *  - warn additionally allows Moderators (any role with "mod" in the name).
 *
 * Unknown !command names and non-command first words return false so the
 * message falls through to the normal chat pipeline.
 */

const fs = require('fs');
const path = require('path');

const PREFIX = '!';

// Discord API option types (from the builder JSON).
const T = {
  SUB_COMMAND: 1,
  SUB_COMMAND_GROUP: 2,
  STRING: 3,
  INTEGER: 4,
  BOOLEAN: 5,
  USER: 6,
  CHANNEL: 7,
  ROLE: 8,
  MENTIONABLE: 9,
  NUMBER: 10,
  ATTACHMENT: 11,
};

const OWNER_ROLE_NAMES = ['👑 Owner', '🛡️ Co-Owner'];
const MOD_NAME_RE = /mod/i;

// Commands where Moderators are allowed in addition to Owner/Co-Owner.
const MOD_ALLOWED = new Set(['warn']);

let cache = null;

/** Load every command module once, keyed by slash-command name. */
function loadCommands() {
  if (cache) return cache;
  cache = new Map();
  const dir = path.join(__dirname, '..', 'commands');
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.js')) continue;
    try {
      const mod = require(path.join(dir, file));
      if (mod?.data?.name && typeof mod.execute === 'function') {
        cache.set(mod.data.name.toLowerCase(), mod);
      }
    } catch (err) {
      console.error(`[prefix] failed to load ${file}:`, err.message);
    }
  }
  return cache;
}

/** True when the message looks like a prefix command attempt. */
function isPrefixCommand(message) {
  const content = String(message?.content || '');
  return /^![a-zA-Z]/.test(content);
}

function roleNames(member) {
  try {
    return [...member.roles.cache.values()].map((r) => r.name);
  } catch {
    return [];
  }
}

/**
 * Armin's permission rule for prefix admin commands.
 * Returns { ok: true } or { ok: false, reason }.
 */
function checkPrefixPermission(member, guild, command) {
  const def = command.data.toJSON();
  const staffGated = def.default_member_permissions != null;
  if (!staffGated) return { ok: true };

  const names = roleNames(member);
  const isOwner = names.includes(OWNER_ROLE_NAMES[0]) || member.id === guild.ownerId;
  const isCoOwner = names.includes(OWNER_ROLE_NAMES[1]);
  const isMod = names.some((n) => MOD_NAME_RE.test(n));
  const privileged = isOwner || isCoOwner;

  if (MOD_ALLOWED.has(def.name) && (privileged || isMod)) return { ok: true };
  if (privileged) return { ok: true };

  const who = MOD_ALLOWED.has(def.name) ? 'the Owner, Co-Owner, or Moderators' : 'the Owner or Co-Owner';
  return { ok: false, reason: `Only ${who} can use \`${def.name}\`.` };
}

function usageHint(optionDefs) {
  return (optionDefs || [])
    .map((o) => {
      switch (o.type) {
        case T.USER: return '<@user>';
        case T.CHANNEL: return '<#channel>';
        case T.ROLE: return '<@&role>';
        case T.INTEGER:
        case T.NUMBER: return '<number>';
        case T.BOOLEAN: return '<true|false>';
        case T.ATTACHMENT: return '<attach a file>';
        default: return `<${o.name}>`;
      }
    })
    .join(' ');
}

/**
 * Fill the command's declared options positionally from message tokens.
 * The LAST string option swallows the rest of the line
 * ("!warn @user being rude" -> reason = "being rude").
 */
async function parseOptions(message, optionDefs, rawArgs) {
  const tokens = String(rawArgs || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const values = {};
  const need = (msg) => {
    throw new Error(msg);
  };
  let i = 0;

  for (let d = 0; d < optionDefs.length; d++) {
    const opt = optionDefs[d];
    const isLast = d === optionDefs.length - 1;

    switch (opt.type) {
      case T.USER: {
        const tok = tokens[i];
        const m = tok && /^<@!?(\d+)>$/.exec(tok);
        const id = m ? m[1] : tok && /^\d{15,25}$/.test(tok) ? tok : null;
        let user = null;
        if (id) {
          try {
            user = await message.client.users.fetch(id);
          } catch {
            user = null; // fall through to name lookup
          }
        }
        if (!user && tok && message.guild) {
          // v7.4.2: display-name / username fallback ("ban Bob").
          const low = tok.toLowerCase();
          try {
            const member = message.guild.members.cache.find(
              (mb) =>
                mb.user.username.toLowerCase() === low ||
                String(mb.displayName || '').toLowerCase() === low ||
                mb.user.tag.toLowerCase() === low,
            );
            if (member) user = member.user;
          } catch {
            // cache unavailable — mention/ID only
          }
        }
        if (!user) {
          if (opt.required) need(`Couldn't find user "${tok || ''}" — mention them.`);
          break;
        }
        values[opt.name] = user;
        i++;
        break;
      }
      case T.STRING: {
        if (isLast) {
          const rest = tokens.slice(i).join(' ');
          if (!rest && opt.required) need(`Missing "${opt.name}".`);
          values[opt.name] = rest;
          i = tokens.length;
        } else {
          if (i >= tokens.length) {
            if (opt.required) need(`Missing "${opt.name}".`);
            break;
          }
          values[opt.name] = tokens[i++];
        }
        break;
      }
      case T.INTEGER:
      case T.NUMBER: {
        const tok = tokens[i];
        const n = tok !== undefined ? Number(tok) : NaN;
        if (!Number.isFinite(n)) {
          if (opt.required) need(`"${opt.name}" must be a number.`);
          break;
        }
        values[opt.name] = opt.type === T.INTEGER ? Math.trunc(n) : n;
        i++;
        break;
      }
      case T.BOOLEAN: {
        const tok = String(tokens[i] || '').toLowerCase();
        values[opt.name] = /^(true|yes|y|1|on|enable)$/.test(tok);
        i++;
        break;
      }
      case T.CHANNEL: {
        const tok = tokens[i];
        const m = tok && /^<#(\d+)>$/.exec(tok);
        const id = m ? m[1] : tok && /^\d{15,25}$/.test(tok) ? tok : null;
        if (!id) {
          if (opt.required) need(`Missing channel for "${opt.name}".`);
          break;
        }
        try {
          values[opt.name] = await message.client.channels.fetch(id);
        } catch {
          need('Could not find that channel.');
        }
        i++;
        break;
      }
      case T.ROLE: {
        const tok = tokens[i];
        const m = tok && /^<@&(\d+)>$/.exec(tok);
        const id = m ? m[1] : tok && /^\d{15,25}$/.test(tok) ? tok : null;
        if (!id) {
          if (opt.required) need(`Missing role for "${opt.name}".`);
          break;
        }
        const role = message.guild.roles.cache.get(id);
        if (!role) need('Could not find that role.');
        values[opt.name] = role;
        i++;
        break;
      }
      case T.MENTIONABLE: {
        const tok = tokens[i];
        const m = tok && /^<@!?(\d+)>$/.exec(tok);
        const rm = tok && /^<@&(\d+)>$/.exec(tok);
        const id = m ? m[1] : rm ? rm[1] : tok && /^\d{15,25}$/.test(tok) ? tok : null;
        if (!id) {
          if (opt.required) need(`Missing mention for "${opt.name}".`);
          break;
        }
        values[opt.name] = message.guild.roles.cache.get(id) || (await message.client.users.fetch(id).catch(() => null));
        if (!values[opt.name] && opt.required) need('Could not find that user or role.');
        i++;
        break;
      }
      case T.ATTACHMENT: {
        const att = message.attachments.first() || null;
        if (!att && opt.required) need(`"${opt.name}" needs an attached file.`);
        values[opt.name] = att;
        break;
      }
      default:
        break;
    }
  }
  return values;
}

function getOpt(values, name, required) {
  const v = values[name];
  if (required && (v === undefined || v === null || v === '')) {
    throw new Error(`Missing required option "${name}".`);
  }
  return v ?? null;
}

/** Adapter: makes a message look like a ChatInputCommandInteraction. */
function buildInteraction(message, command, values, subName) {
  // Message replies can't be ephemeral — strip the flag.
  const clean = (payload) => {
    if (payload && typeof payload === 'object' && 'ephemeral' in payload) {
      const { ephemeral, ...rest } = payload;
      return rest;
    }
    return payload;
  };

  let placeholder = null;
  const inter = {
    __prefixCommand: true,
    commandName: command.data.name,
    user: message.author,
    member: message.member,
    guild: message.guild,
    guildId: message.guild?.id || null,
    channel: message.channel,
    channelId: message.channel?.id || null,
    client: message.client,
    createdTimestamp: message.createdTimestamp,
    replied: false,
    deferred: false,
    isChatInputCommand: () => true,
    options: {
      getSubcommand: () => subName,
      getString: (n, r) => getOpt(values, n, r),
      getInteger: (n, r) => getOpt(values, n, r),
      getNumber: (n, r) => getOpt(values, n, r),
      getBoolean: (n, r) => getOpt(values, n, r),
      getUser: (n, r) => getOpt(values, n, r),
      getMember: (n) => {
        const u = values[n];
        return u ? message.guild.members.cache.get(u.id) || null : null;
      },
      getChannel: (n, r) => getOpt(values, n, r),
      getRole: (n, r) => getOpt(values, n, r),
      getAttachment: (n, r) => getOpt(values, n, r),
      getMentionable: (n, r) => getOpt(values, n, r),
    },
    deferReply: async () => {
      inter.deferred = true;
      try {
        placeholder = await message.reply('⏳ Working on it…');
      } catch {
        placeholder = null;
      }
    },
    reply: async (payload) => {
      inter.replied = true;
      if (typeof payload === 'string') return message.reply(payload);
      return message.reply(clean(payload));
    },
    editReply: async (payload) => {
      const p = typeof payload === 'string' ? { content: payload } : clean(payload);
      if (placeholder) {
        try {
          return await placeholder.edit(p);
        } catch {
          // Fall through to a fresh reply.
        }
      }
      inter.replied = true;
      return message.reply(p);
    },
    followUp: async (payload) => {
      if (typeof payload === 'string') return message.channel.send(payload);
      return message.channel.send(clean(payload));
    },
    deleteReply: async () => {
      if (placeholder) {
        try {
          await placeholder.delete();
        } catch {
          // Already gone — fine.
        }
      }
    },
  };
  return inter;
}

/**
 * Shared runner: resolve subcommand, check rank, parse args, execute.
 * `parseFail`: 'hint' (prefix — show usage, consume) or 'passthrough'
 * (natural — fall through to chat when the message doesn't parse cleanly).
 * Permission denials always consume with a decline message.
 * Returns true when the message was consumed.
 */
async function runCommand(message, command, name, rawArgs, { parseFail }) {
  // v7.4.1: subcommand support — "!birthday set 01-15" / "birthday set 01-15".
  let subName = null;
  let optionDefs = command.data.toJSON().options || [];
  let argsText = rawArgs;
  const first = optionDefs[0];
  if (first && (first.type === T.SUB_COMMAND || first.type === T.SUB_COMMAND_GROUP)) {
    const tokens = String(rawArgs || '').trim().split(/\s+/).filter(Boolean);
    subName = (tokens[0] || '').toLowerCase();
    const sub = optionDefs.find((o) => o.type === T.SUB_COMMAND && o.name.toLowerCase() === subName);
    if (!sub) {
      if (parseFail === 'passthrough') return false; // "birthday" alone stays chat
      const names = optionDefs
        .filter((o) => o.type === T.SUB_COMMAND)
        .map((o) => o.name)
        .join(' | ');
      try {
        await message.reply(`⚠️ \`${name}\` needs a subcommand: \`${name} ${names} …\``);
      } catch {
        // Missing permission — nothing more we can do.
      }
      return true;
    }
    optionDefs = sub.options || [];
    argsText = tokens.slice(1).join(' ');
  }

  // v7.4.2 natural order: parse FIRST so only well-formed attempts are
  // consumed ("warn me when it's done" stays chat). Prefix keeps the
  // explicit order (rank check, then usage hints).
  let values = null;
  let parseError = null;
  try {
    values = await parseOptions(message, optionDefs, argsText);
  } catch (err) {
    parseError = err;
  }

  if (parseError) {
    if (parseFail === 'hint') {
      try {
        const hint = usageHint(optionDefs);
        const usage = subName ? `${name} ${subName} ${hint}` : `${name} ${hint}`;
        await message.reply(`⚠️ ${parseError.message}${hint ? `\nUsage: \`!${usage.trim()}\`` : ''}`);
      } catch {
        // ignore
      }
      return true;
    }
    return false; // not a real command invocation — stay in chat
  }

  const perm = checkPrefixPermission(message.member, message.guild, command);
  if (!perm.ok) {
    try {
      await message.reply(`🔒 ${perm.reason}`);
    } catch {
      // ignore
    }
    return true;
  }

  const interaction = buildInteraction(message, command, values, subName);
  await command.execute(interaction);
  return true;
}

/**
 * Try to run a message as a prefix command ("!warn @user spam").
 * Returns true when the message was consumed (known command, permission
 * denial, or usage error). Returns false for unknown command names so the
 * message falls through to the normal chat pipeline. Never throws.
 */
async function handlePrefixCommand(message) {
  try {
    const content = String(message.content || '');
    const spaceIdx = content.indexOf(' ');
    const name = (spaceIdx === -1 ? content : content.slice(0, spaceIdx)).slice(1).toLowerCase();
    const rawArgs = spaceIdx === -1 ? '' : content.slice(spaceIdx + 1);

    const command = loadCommands().get(name);
    if (!command) return false;

    return await runCommand(message, command, name, rawArgs, { parseFail: 'hint' });
  } catch (err) {
    console.error('[prefix] command failed:', err.message);
    try {
      await message.reply('😅 That command hiccuped — try again in a bit!');
    } catch {
      // ignore
    }
    return true;
  }
}

/**
 * v7.4.2: natural commands — the message's first word is a command name
 * ("ban Bob", "imagine a dragon"). A leading @-mention (usually the bot)
 * is skipped. Must parse cleanly or the message stays in chat; rank is
 * enforced before anything runs, with an explicit decline for lower ranks.
 * Never throws — chat must never break because of this.
 *
 * Polite lead-ins people naturally type ("can you kick @x",
 * "please ban Bob", "ripobot, warn @x spam") are stripped first,
 * repeatedly, so "please can you ban Bob" works too.
 */
const LEAD_IN_RE = /^(?:(?:can|could|will|would) you|please|hey|ok(?:ay)?)\s+/i;
const BOT_NAME_LEAD_RE = /^(?:ripobot|bolt|pip)\s*,?\s+/i;

function stripLeadIns(text) {
  let t = String(text || '');
  for (let i = 0; i < 4; i++) {
    const next = t
      .replace(/^\s*(<@!?\d+>\s*)+/, '')
      .replace(LEAD_IN_RE, '')
      .replace(BOT_NAME_LEAD_RE, '');
    if (next === t) break;
    t = next;
  }
  return t;
}

async function handleNaturalCommand(message) {
  try {
    const stripped = stripLeadIns(message?.content);
    const m = /^\s*([a-zA-Z0-9]+)/.exec(stripped);
    if (!m) return false;
    const name = m[1].toLowerCase();
    const command = loadCommands().get(name);
    if (!command) return false;
    const rest = stripped.slice(m[0].length);
    return await runCommand(message, command, name, rest, { parseFail: 'passthrough' });
  } catch (err) {
    console.error('[prefix] natural command failed:', err.message);
    return false;
  }
}

/**
 * Entry point for the message pipeline: prefix ("!warn …") first, then
 * natural ("ban Bob"). Returns true when the message was consumed.
 */
async function handleMessageCommand(message) {
  if (isPrefixCommand(message)) return handlePrefixCommand(message);
  return handleNaturalCommand(message);
}

module.exports = {
  PREFIX,
  isPrefixCommand,
  handlePrefixCommand,
  handleNaturalCommand,
  handleMessageCommand,
  checkPrefixPermission,
  // Exported for tests.
  _parseOptions: parseOptions,
  _usageHint: usageHint,
};
