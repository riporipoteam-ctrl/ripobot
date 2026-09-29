'use strict';

/**
 * Shared welcome-card builder for new members.
 *
 * Used by the guildMemberAdd event (real joins) and the welcometest
 * command (staff preview) so both always render the exact same card:
 * the member's avatar as thumbnail + big image, member count, join
 * time, and quick-start pointers. Never pings anyone.
 */

const { EmbedBuilder } = require('discord.js');

const WELCOME_QUIPS = [
  'Grab a role and say hi — the water is fine! 🌊',
  'Flux Rec is cooking — glad you made it! 🍳',
  'New legend just dropped! 🌟',
  'We saved you a seat! 🪑',
  'The squad grows stronger! 💪',
];

/** Strip @everyone / @here so a displayName can never cause a mass ping. */
function sanitizeName(name) {
  return String(name ?? 'New member').replace(/@(everyone|here)/gi, (_, word) => word);
}

/**
 * Build the welcome embed.
 *
 * @param {object} args
 * @param {object} args.member member-like: { user, displayName }
 * @param {number} args.memberCount guild.memberCount
 * @param {number} [args.joinedAtMs] join timestamp ms (defaults to now)
 */
function buildWelcomeEmbed({ member, memberCount, joinedAtMs }) {
  const displayName = sanitizeName(member.displayName).slice(0, 64) || 'New member';
  const avatar = member.user.displayAvatarURL({ size: 256 });
  const avatarBig = member.user.displayAvatarURL({ size: 512 });
  const quip = WELCOME_QUIPS[Math.floor(Math.random() * WELCOME_QUIPS.length)];
  const joinedSec = Math.floor((joinedAtMs ?? Date.now()) / 1000);

  return new EmbedBuilder()
    .setColor(0x57f287)
    .setAuthor({ name: 'A new member joined! 🎉', iconURL: avatar })
    .setTitle(`👋 Welcome, ${displayName}!`)
    .setThumbnail(avatar)
    .setDescription(
      `${quip}\n\n` +
        "We're **Ripo Team** — the gaming tech crew building **Flux Rec**, our private Rec Room revival. " +
        'Kick back, meet the squad, and have fun!\n\u200b',
    )
    .addFields(
      { name: '👤 Member', value: `**${displayName}**`, inline: true },
      { name: '🔢 Member #', value: `${memberCount}`, inline: true },
      { name: '📅 Joined', value: `<t:${joinedSec}:R>`, inline: true },
      {
        name: '🚀 Get started',
        value:
          '• Pick your device + ping roles in 🎭❯roles\n' +
          '• Read the rules in 📜❯rules\n' +
          '• Say hi in 🗨️❯general\n' +
          '• Chat with me in 💻❯ripobot-chat for XP!',
      },
    )
    .setImage(avatarBig)
    .setFooter({ text: 'Ripo Team • Flux Rec' })
    .setTimestamp();
}

module.exports = { buildWelcomeEmbed, sanitizeName, WELCOME_QUIPS };
