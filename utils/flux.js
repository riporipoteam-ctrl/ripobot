'use strict';

/**
 * Shared helpers for the Flux Rec admin commands.
 *
 * All Flux Rec admin actions are gated to Owner + Co-Owner (same check the
 * individual flux*.js commands use) and go through the backend admin API
 * with the FLUXREC_ADMIN_KEY secret (set on the HF Space).
 *
 * Backend base: https://api.ripo-ripoteam.workers.dev/api/admin/v1
 * DTOs mirror apps/api/src/routes/admin.ts exactly — do not invent fields.
 */

const ADMIN_API = 'https://api.ripo-ripoteam.workers.dev/api/admin/v1';

/** Ranks the backend accepts on POST /api/admin/v1/ranks/set. */
const FLUX_RANKS = [
  { value: 'community_mod', label: 'Community Mod' },
  { value: 'developer', label: 'Developer' },
];

const RANK_LABELS = {
  community_mod: 'Community Mod',
  developer: 'Developer',
  none: 'no rank',
};

function rankLabel(value) {
  return RANK_LABELS[value] || value;
}

/**
 * Owner or Co-Owner check (same pattern as commands/flux*.js):
 * the guild owner always qualifies, otherwise a role whose name contains
 * "owner" (covers 👑 Owner and 🛡️ Co-Owner).
 */
function isOwnerOrCoOwner(member) {
  if (!member) return false;
  if (member.id === member.guild.ownerId) return true;
  const roles = member.roles.cache;
  for (const [, role] of roles) {
    const name = String(role.name || '').toLowerCase();
    if (name.includes('owner') && !name.includes('co-owner')) return true;
    if (name.includes('co-owner') || name.includes('coowner')) return true;
  }
  return false;
}

class FluxApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'FluxApiError';
    this.status = status;
  }
}

/**
 * Call the Flux Rec admin API. Throws FluxApiError on failure.
 * 404 with "no such player" means the username has no Flux Rec account.
 */
async function adminApi(path, method, body) {
  const key = process.env.FLUXREC_ADMIN_KEY;
  if (!key) {
    throw new FluxApiError('Admin API key not configured (FLUXREC_ADMIN_KEY)', 0);
  }
  const res = await fetch(`${ADMIN_API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': key,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new FluxApiError(
      data.error || data.message || `API error: ${res.status}`,
      res.status
    );
  }
  return data;
}

/** True when the error means "no Flux Rec account with that username". */
function isNoSuchPlayer(err) {
  return err instanceof FluxApiError && err.status === 404;
}

/**
 * Search Flux Rec accounts by username prefix (case-insensitive).
 * GET /api/admin/v1/players/search?q= -> { success, players: [{ username, accountId, hasPlus, isModerator, isDeveloper }] }
 * Only ever returns accounts that exist — never invents players.
 */
async function searchPlayers(q) {
  const query = String(q || '').trim();
  if (!query) return [];
  const data = await adminApi(`/players/search?q=${encodeURIComponent(query)}`, 'GET');
  return Array.isArray(data.players) ? data.players : [];
}

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

/**
 * Confirmation step for "give everyone <amount> tokens".
 *
 * @param {(payload: object) => Promise<Message>} send - sends the prompt, resolves the sent message
 *   (e.g. `(p) => interaction.followUp(p)` or `(p) => message.reply(p)`)
 * @param {string} authorId - only this user may press the buttons
 * @param {number} amount - token amount
 * @returns {Promise<{ confirmed: boolean }>} — performs the grant itself on confirm
 */
async function confirmEveryoneTokens(send, authorId, amount) {
  const pretty = amount.toLocaleString('en-US');
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('flux_everyone_confirm')
      .setLabel(`Give ${pretty} to everyone`)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('flux_everyone_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );
  const prompt = await send({
    content:
      `⚠️ Give **${pretty}** tokens to **everyone**?\n` +
      'This credits **every Flux Rec account** and cannot be undone.',
    components: [row],
  });

  let pressed = null;
  try {
    pressed = await prompt.awaitMessageComponent({
      filter: (i) => i.user.id === authorId,
      time: 60_000,
    });
  } catch {
    pressed = null; // timed out
  }

  const disabled = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('flux_everyone_confirm')
      .setLabel(`Give ${pretty} to everyone`)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId('flux_everyone_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );

  if (!pressed) {
    await prompt.edit({ content: '⏱️ Timed out — no tokens were given.', components: [disabled] }).catch(() => {});
    return { confirmed: false };
  }
  if (pressed.customId !== 'flux_everyone_confirm') {
    await pressed.update({ content: '❎ Cancelled — no tokens were given.', components: [disabled] }).catch(() => {});
    return { confirmed: false };
  }

  await pressed.deferUpdate().catch(() => {});
  try {
    // POST /api/admin/v1/tokens/grant { grant_to: "everyone", amount }
    // -> { success, grantedTo: "everyone", accounts, amount, newBalance: null }
    const result = await adminApi('/tokens/grant', 'POST', { grant_to: 'everyone', amount });
    await prompt
      .edit({
        content:
          `✅ Gave **${pretty}** tokens to **everyone**! 🪙\n` +
          `(${result.accounts} account${result.accounts === 1 ? '' : 's'} credited)`,
        components: [disabled],
      })
      .catch(() => {});
    return { confirmed: true };
  } catch (err) {
    await prompt
      .edit({ content: `❌ Failed: ${err.message}`, components: [disabled] })
      .catch(() => {});
    return { confirmed: false };
  }
}

module.exports = {
  ADMIN_API,
  FLUX_RANKS,
  rankLabel,
  isOwnerOrCoOwner,
  adminApi,
  FluxApiError,
  isNoSuchPlayer,
  searchPlayers,
  confirmEveryoneTokens,
};
