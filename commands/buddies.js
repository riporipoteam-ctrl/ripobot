'use strict';

/**
 * /buddies — introduce RipoBot's companion bots and ping them into chat.
 * The pings are real <@id> mentions, so Bolt and Pip's summon handlers
 * (companions/chatter.js) pick them up and reply.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const BOLT_ID = '1553794360829673553';
const PIP_ID = '1553796168356593675';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buddies')
    .setDescription("Meet RipoBot's companion bots — and call them into chat")
    .setDMPermission(false),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('⚡🌱 Meet my buddies!')
      .setDescription('These two are always hanging around the server with me:')
      .addFields(
        {
          name: '⚡ Bolt',
          value:
            `<@${BOLT_ID}>\n` +
            'Hyper, playful, chaotic-good. Runs on pure energy and bad ideas (the fun kind). ' +
            'Mention him when the chat needs HYPE.',
        },
        {
          name: '🌱 Pip',
          value:
            `<@${PIP_ID}>\n` +
            'Chill, wholesome, gentle. The cozy corner of the server — blankets, tea, and good vibes. ' +
            'Mention her when things need to slow down.',
        },
      )
      .setFooter({ text: 'Mention them anytime — they love the attention.' });

    // Real pings in the content so the companions get summoned.
    await interaction.reply({
      content: `<@${BOLT_ID}> <@${PIP_ID}> come say hi!`,
      embeds: [embed],
    });
  },
};
