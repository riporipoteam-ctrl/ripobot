'use strict';

/**
 * /badge — nickname emoji badges (no Level 2 / Nitro needed).
 *
 *   /badge set @user <emoji>    — badge one user ("🛡️ Username")
 *   /badge setrole @role <emoji> — badge everyone holding a role
 *   /badge remove @user          — remove a user's badge
 *   /badge list                  — show all badges
 *
 * Badges auto-apply when a badged user joins or gains the role
 * (events/guildMemberAdd.js + events/guildMemberUpdate.js).
 *
 * Gated to Owner / Co-Owner / Moderator. Needs ManageNicknames + the bot's
 * role above the target's. The server owner can never be renamed (Discord).
 *
 * NOTE: data/badges.json is ephemeral on the free HF host — badges reset
 * if the Space restarts. /badge list says so honestly.
 */

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { isOwnerOrCoOwner } = require('./announce');
const { isStaffMember } = require('../utils/modreport');
const badges = require('../utils/badges');

function isBadgeStaff(member) {
  if (!member) return false;
  if (isOwnerOrCoOwner(member)) return true;
  if (isStaffMember(member)) return true; // ManageMessages holders
  try {
    const names = member.roles?.cache?.map((r) => String(r.name || '').toLowerCase()) ?? [];
    if (names.some((n) => n.includes('moderator') || n.includes('mod '))) return true;
  } catch {
    // ignore
  }
  return false;
}

/** True when the string is (mostly) a single unicode emoji. */
function isEmoji(str) {
  const s = String(str || '').trim();
  if (!s || s.length > 12) return false;
  // Reject Discord custom-emoji syntax and plain words.
  if (s.includes(':') || s.includes('<')) return false;
  return /\p{Extended_Pictographic}/u.test(s);
}

async function refreshGuildBadges(guild) {
  const store = badges.load();
  let applied = 0;
  let failed = 0;
  try {
    const members = await guild.members.fetch();
    for (const [, member] of members) {
      if (badges.badgeFor(store, member)) {
        const res = await badges.applyBadge(member, store);
        if (res === 'applied') applied += 1;
        else if (res === 'failed') failed += 1;
      }
    }
  } catch (err) {
    console.error('[badge] bulk refresh failed:', err.message);
  }
  return { applied, failed };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('badge')
    .setDescription('Nickname emoji badges (Owner/Co-Owner/Moderator)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Give a user a nickname emoji badge')
        .addUserOption((o) => o.setName('user').setDescription('The user').setRequired(true))
        .addStringOption((o) => o.setName('emoji').setDescription('The emoji badge').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('setrole')
        .setDescription('Give everyone with a role a nickname emoji badge')
        .addRoleOption((o) => o.setName('role').setDescription('The role').setRequired(true))
        .addStringOption((o) => o.setName('emoji').setDescription('The emoji badge').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription("Remove a user's nickname badge")
        .addUserOption((o) => o.setName('user').setDescription('The user').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Show all nickname badges')),

  async execute(interaction) {
    if (!isBadgeStaff(interaction.member)) {
      await interaction.reply({ content: '❌ Only the Owner, Co-Owner, or Moderators can manage badges.', ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const store = badges.load();

    if (sub === 'list') {
      const userEntries = Object.entries(store.users);
      const roleEntries = Object.entries(store.roles);
      const embed = new EmbedBuilder().setTitle('🎖️ Nickname badges').setColor(0x5865f2);
      const userLines = [];
      for (const [id, emoji] of userEntries) {
        let label = id;
        try {
          const m = await interaction.guild.members.fetch(id).catch(() => null);
          if (m) label = m.user.tag;
        } catch {
          // keep the id
        }
        userLines.push(`${emoji} — ${label}`);
      }
      const roleLines = roleEntries.map(([id, emoji]) => {
        const role = interaction.guild.roles.cache.get(id);
        return `${emoji} — @${role ? role.name : id}`;
      });
      embed.addFields(
        { name: '👤 User badges', value: userLines.length ? userLines.join('\n') : '_none_', inline: false },
        { name: '🛡️ Role badges', value: roleLines.length ? roleLines.join('\n') : '_none_', inline: false },
      );
      embed.setFooter({ text: 'Badges reset if the bot restarts (free host storage).' });
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (sub === 'set') {
      const user = interaction.options.getUser('user');
      const emoji = interaction.options.getString('emoji');
      if (!isEmoji(emoji)) {
        await interaction.reply({ content: '❌ That doesn\'t look like an emoji — send a single emoji like 🛡️ or ⭐.', ephemeral: true });
        return;
      }
      store.users[user.id] = emoji.trim();
      badges.save(store);
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      let note = '';
      if (member) {
        const res = await badges.applyBadge(member, store);
        note = res === 'applied' ? ` Applied to **${member.nickname || user.username}**.`
          : res === 'skipped' ? ` (Couldn't rename — I need Manage Nicknames and my role above theirs.)`
          : ` (Rename failed — check my permissions.)`;
      }
      await interaction.reply({ content: `✅ ${emoji} badge set for **${user.tag}**.${note}`, ephemeral: true });
      return;
    }

    if (sub === 'setrole') {
      const role = interaction.options.getRole('role');
      const emoji = interaction.options.getString('emoji');
      if (!isEmoji(emoji)) {
        await interaction.reply({ content: '❌ That doesn\'t look like an emoji — send a single emoji like 🛡️ or ⭐.', ephemeral: true });
        return;
      }
      if (role.id === interaction.guild.id) {
        await interaction.reply({ content: '❌ Can\'t badge @everyone.', ephemeral: true });
        return;
      }
      store.roles[role.id] = emoji.trim();
      badges.save(store);
      await interaction.deferReply({ ephemeral: true });
      const { applied, failed } = await refreshGuildBadges(interaction.guild);
      await interaction.editReply(
        `✅ ${emoji} badge set for **@${role.name}** — applied to ${applied} member${applied === 1 ? '' : 's'}` +
        (failed ? ` (${failed} failed — likely role hierarchy).` : '.') +
        ' New members and role gains get it automatically.',
      );
      return;
    }

    if (sub === 'remove') {
      const user = interaction.options.getUser('user');
      if (!store.users[user.id]) {
        await interaction.reply({ content: `ℹ️ **${user.tag}** has no badge.`, ephemeral: true });
        return;
      }
      delete store.users[user.id];
      badges.save(store);
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (member) await badges.applyBadge(member, store); // cleans the nickname
      await interaction.reply({ content: `✅ Badge removed from **${user.tag}**.`, ephemeral: true });
      return;
    }

    await interaction.reply({ content: '❓ Unknown subcommand.', ephemeral: true });
  },
};
