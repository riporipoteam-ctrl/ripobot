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

// Flux Rec Status auto-updater — refreshes the "Flux Rec Status" category
// channel names every 5 minutes with live player counts.
client.once('ready', async () => {
  // Auto-register slash commands on startup (so new commands deploy without manual deploy-commands.js)
  try {
    const { REST, Routes } = require('discord.js');
    const clientId = process.env.CLIENT_ID;
    const guildId = process.env.GUILD_ID;
    if (clientId && guildId) {
      const commands = [];
      const commandsPath = path.join(__dirname, 'commands');
      for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
        try {
          const cmd = require(path.join(commandsPath, file));
          if (cmd?.data?.toJSON) commands.push(cmd.data.toJSON());
        } catch {}
      }
      const rest = new REST().setToken(token);
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log(`[slash] auto-registered ${commands.length} guild commands`);
    }
  } catch (err) {
    console.error('[slash] auto-registration failed:', err.message);
  }
  const fluxstatus = require('./commands/fluxstatus');
  if (fluxstatus.updateStatusChannels) {
    const updateAll = async () => {
      for (const [, guild] of client.guilds.cache) {
        try {
          // Always run: updateStatusChannels is idempotent —
          // creates the "Flux Rec Status" category if missing, updates if exists.
          await fluxstatus.updateStatusChannels(guild);
        } catch (err) {
          console.error(`[fluxstatus] update failed for ${guild.name}:`, err.message);
        }
      }
    };
    // Run every 5 minutes
    setInterval(updateAll, 5 * 60 * 1000);
    // Run once on startup (after 10s to let guild cache populate).
    setTimeout(updateAll, 10000);
    console.log('[fluxstatus] auto-updater started (5 min interval + startup run)');
  }
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
