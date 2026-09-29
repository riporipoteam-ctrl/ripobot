'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const GROUPS = [
  [
    '🛡️ Moderation',
    [
      ['/ban `<user> [reason] [delete_days]`', 'Ban a user (Ban Members).'],
      ['/kick `<user> [reason]`', 'Kick a user (Kick Members).'],
      ['/warn `<user> <reason>`', 'Warn a user, stored + DM sent (Kick Members).'],
      ['/warnings `<user>`', 'List a user\u2019s warnings (Kick Members).'],
      ['/unwarn `<user> <warn_id>`', 'Remove a warning (Kick Members).'],
      ['/timeout `<user> <minutes> [reason]`', 'Time out a user (Moderate Members).'],
      ['/untimeout `<user>`', 'Remove a timeout (Moderate Members).'],
      ['/clear `<amount> [user]`', 'Delete up to 100 messages (Manage Messages).'],
    ],
  ],
  [
    '📢 Owner',
    [
      ['/announce `<channel> <title> <message> [ping_role] [image]`', 'Post a styled announcement (👑 Owner / 🛡️ Co-Owner only).'],
    ],
  ],
  [
    '🎲 Fun',
    [
      ['/8ball `<question>`', 'Ask the magic 8-ball.'],
      ['/coinflip', 'Heads or tails?'],
      ['/dice `[sides] [count]`', 'Roll dice (e.g. 2d20).'],
      ['/rps `<rock|paper|scissors>`', 'Rock-paper-scissors vs the bot.'],
      ['/poll `<question> <option1> <option2> [option3] [option4]`', 'Reaction poll.'],
      ['/trivia', 'Answer a random trivia question (20 seconds!).'],
      ['/joke', 'Get a random clean programming/gaming joke.'],
      ['/define `<word>`', 'Look up a word\u2019s definition.'],
      ['/rank', 'Your RipoBot level, XP and vibe.'],
      ['/leaderboard', 'Top 10 chattiest members by XP.'],
      ['/emojify `<text>`', 'Turn text into big emoji letters.'],
      ['/morse `<text>`', 'Convert text to Morse code.'],
      ['/binary `<text>`', 'Convert text to binary.'],
      ['/reverse `<text>`', 'Reverse text.'],
      ['/color `<hex>`', 'Show a color swatch for a hex code.'],
      ['/pick `<choices>`', 'Pick one at random — separate with `;` or `,`.'],
      ['/mock `<text>`', 'mOcK yOuR tExT lIkE sPoNgEbOb.'],
      ['/buddies', "Meet Bolt and Pip — RipoBot's companion bots (pings them into chat!)."],
    ],
  ],
  [
    '🛠️ Utility',
    [
      ['/avatar `[user]`', 'Show a user\u2019s avatar large.'],
      ['/remind `<in: 10m|2h|1d> <text>`', 'Set a reminder (stored on disk, delivered by the scheduler).'],
      ['/translate `<text> [to]`', 'Translate text (default: Spanish).'],
      ['/userinfo `[user]`', 'Show user info card.'],
      ['/serverinfo', 'Show server stats.'],
      ['/serverstats', 'Server stats + bot uptime.'],
      ['/report `<user> <reason>`', 'Report a user to the mods.'],
      ['/privatechat', 'Open a private thread with RipoBot.'],
      ['/help', 'This list.'],
    ],
  ],
  [
    '🤖 AI',
    [
      ['/ask `<question>`', 'Ask me anything (longer AI answer).'],
      ['/imagine `<prompt>`', 'Generate an image from text.'],
    ],
  ],
  [
    '🔊 Voice',
    [
      ['/speak `<text>`', 'Speak text aloud in your voice channel (👑 Owner / 🛡️ Co-Owner only).'],
    ],
  ],
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('List all commands')
    .setDMPermission(false),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🤖 Ripo Bot — Commands')
      .setDescription(
        'Moderation commands check your permissions, my permissions, and role hierarchy before acting.',
      );

    for (const [groupName, commands] of GROUPS) {
      embed.addFields({
        name: groupName,
        value: commands.map(([name, desc]) => `**${name}**\n${desc}`).join('\n'),
      });
    }

    embed.addFields(
      {
        name: '💬 Chat',
        value:
          'Mention me or reply to one of my messages and I\u2019ll chat back! ' +
          'I also hang out in the **ripobot** channel and reply to everything there.',
      },
      {
        name: '⌨️ No-slash commands',
        value:
          'Every slash command also works as a plain message — just start with the command name! ' +
          '`imagine a red car`, `8ball will this work`, `poll best game?`, `warn @user spam`, `ban Bob`. ' +
          '(`!command` with a prefix works too.) Admin commands (`warn` `kick` `ban` `timeout` `clear` `announce`) only listen to the 👑 Owner and 🛡️ Co-Owner — `warn` also works for Moderators. ' +
          'Lower ranks get a decline.',
      },
      {
        name: '🧠 Memory',
        value:
          'In chat: `remember that …` to save a fact, `what do you remember about me` to list them, ' +
          '`forget …` / `forget everything about me` to erase.',
      },
      {
        name: '🗣️ Owner voice commands',
        value:
          '👑 Owner / 🛡️ Co-Owner can also just *type* in the ripobot channel or staff/owner channels, e.g. ' +
          '`announce in #announcements: update tomorrow`, `warn @user for spam`, `poll "best game?" Apex / Valorant`.',
      },
    );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
