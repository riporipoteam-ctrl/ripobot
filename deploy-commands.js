'use strict';

/**
 * Register (or refresh) the bot's guild slash commands via the Discord REST API.
 *
 * Run:  node deploy-commands.js
 * Needs: CLIENT_ID, GUILD_ID, DISCORD_TOKEN in .env
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error('[fatal] Set DISCORD_TOKEN, CLIENT_ID and GUILD_ID in .env first.');
  process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  if (command?.data?.toJSON) {
    commands.push(command.data.toJSON());
  } else {
    console.warn(`[warn] Skipping ${file}: no slash command data`);
  }
}

(async () => {
  const rest = new REST().setToken(token);
  try {
    console.log(`[deploy] Registering ${commands.length} guild commands...`);
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log(`[deploy] ✅ Done — ${commands.length} commands registered for guild ${guildId}.`);
  } catch (err) {
    console.error('[deploy] Failed:', err.message);
    process.exit(1);
  }
})();
