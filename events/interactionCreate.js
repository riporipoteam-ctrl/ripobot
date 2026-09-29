'use strict';

const { Events } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

module.exports = {
  name: Events.InteractionCreate,
  once: false,
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) {
      await failEphemeral(interaction, 'Unknown command.');
      return;
    }

    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`[interaction] /${interaction.commandName} crashed:`, err);
      await failEphemeral(interaction, 'Something went wrong running that command.');
    }
  },
};
