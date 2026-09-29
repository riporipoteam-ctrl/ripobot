'use strict';

/**
 * Ripo Bot — moderation + announcements + 24/7 AI chat for the Ripo Team server.
 *
 * Run:  node index.js   (requires .env with DISCORD_TOKEN)
 * Deploy slash commands first:  node deploy-commands.js
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('[fatal] DISCORD_TOKEN is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, // slash commands, guild info
    GatewayIntentBits.GuildMembers, // PRIVILEGED — moderation, userinfo, hierarchy checks
    GatewayIntentBits.GuildMessages, // reading messages for mention/reply chat
    GatewayIntentBits.MessageContent, // PRIVILEGED — needed to read mention/reply text
    GatewayIntentBits.GuildVoiceStates, // voice channel info for /speak
  ],
});

client.commands = new Collection();

// Load slash commands from ./commands
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  if (command?.data?.name && typeof command.execute === 'function') {
    client.commands.set(command.data.name, command);
  } else {
    console.warn(`[warn] Skipping ${file}: missing data.name or execute()`);
  }
}

// Wire events from ./events
const eventsPath = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsPath).filter((f) => f.endsWith('.js'))) {
  const event = require(path.join(eventsPath, file));
  if (event?.name && typeof event.execute === 'function') {
    if (event.once) client.once(event.name, (...args) => event.execute(...args));
    else client.on(event.name, (...args) => event.execute(...args));
  } else {
    console.warn(`[warn] Skipping event ${file}: missing name or execute()`);
  }
}

// Never die on a stray async error.
process.on('unhandledRejection', (err) => {
  console.error('[fatal] Unhandled promise rejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('[fatal] Uncaught exception:', err);
});

client.login(token).catch((err) => {
  console.error('[fatal] Login failed — check DISCORD_TOKEN:', err.message);
  process.exit(1);
});

// Tiny health endpoint so hosts / keep-alive pings can see we're alive.
const http = require('http');
const port = Number(process.env.PORT) || 7860;
http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('RipoBot alive\n');
  })
  .listen(port, () => console.log(`[health] listening on ${port}`));
