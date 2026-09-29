'use strict';

/**
 * /github — public command that shows a GitHub user's profile card:
 * avatar, name/login, bio, public repos, followers, following, profile link.
 * GitHub requires a User-Agent header, which is set on every request.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

const FETCH_TIMEOUT_MS = 10_000;
// GitHub usernames: alphanumerics and hyphens, max 39 chars, no leading/trailing hyphen.
const USERNAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;

function truncate(text, max) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}\u2026`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('github')
    .setDescription('Show a GitHub user\u2019s profile card')
    .setDMPermission(false)
    .addStringOption((option) => option
      .setName('username')
      .setDescription('GitHub username, e.g. torvalds')
      .setRequired(true)
      .setMaxLength(39)),

  async execute(interaction) {
    try {
      const username = interaction.options.getString('username', true).trim();

      if (!USERNAME_RE.test(username)) {
        await failEphemeral(interaction, '🤔 That doesn\u2019t look like a valid GitHub username.');
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      let res;
      try {
        res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'RipoBot/1.0',
            Accept: 'application/vnd.github+json',
          },
        });
      } catch (err) {
        console.error('[github] fetch failed:', err.message);
        await failEphemeral(interaction, '😅 Could not reach GitHub right now — try again in a bit!');
        return;
      } finally {
        clearTimeout(timeout);
      }

      if (res.status === 404) {
        await failEphemeral(interaction, `👻 Couldn\u2019t find a GitHub user called \u201C${username}\u201D.`);
        return;
      }
      if (!res.ok) {
        await failEphemeral(interaction, '😅 Could not reach GitHub right now — try again in a bit!');
        return;
      }

      const user = await res.json();

      const embed = new EmbedBuilder()
        .setColor(0x24292f)
        .setTitle(truncate(String(user.name || user.login), 256))
        .setURL(String(user.html_url))
        .setThumbnail(String(user.avatar_url))
        .addFields(
          { name: '📦 Public repos', value: String(user.public_repos ?? 'N/A'), inline: true },
          { name: '👥 Followers', value: String(user.followers ?? 'N/A'), inline: true },
          { name: '👀 Following', value: String(user.following ?? 'N/A'), inline: true },
        )
        .setFooter({ text: `@${user.login}` });

      if (user.bio) embed.setDescription(truncate(String(user.bio), 300));
      if (user.location) embed.addFields({ name: '📍 Location', value: truncate(String(user.location), 100), inline: true });
      if (user.company) embed.addFields({ name: '🏢 Company', value: truncate(String(user.company), 100), inline: true });

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('[github] execute failed:', err.message);
      await failEphemeral(interaction, 'Something went wrong');
    }
  },
};
