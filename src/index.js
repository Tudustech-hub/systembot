const { Client, GatewayIntentBits, Collection, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const db = require('./db/database');
const { endGiveaway } = require('./commands/giveaway');
const { updateStatsChannels } = require('./utils/statsCounter');
const { setupLogCategory } = require('./utils/auditLogger');
const { initReminderScheduler } = require('./utils/reminderScheduler');
const { initBirthdayScheduler } = require('./utils/birthdayScheduler');
const { startDashboard } = require('./dashboard/server');

if (!config.token) {
  console.error('Error: DISCORD_TOKEN is missing! Please create a .env file based on .env.example');
  process.exit(1);
}

// Global Process Exception Protection (Prevents process crash on network errors)
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err, origin) => {
  console.error(`Uncaught Exception (${origin}):`, err);
});

// Initialize Client with required GatewayIntents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,        // Welcome, Auto-role & Stats Counter
    GatewayIntentBits.GuildPresences,      // Online Member Stats Counter
    GatewayIntentBits.GuildVoiceStates,    // Join-to-Create & Music
    GatewayIntentBits.GuildMessages,      // Counting Game & Honeypot
    GatewayIntentBits.MessageContent       // Reading numbers in counting channel
  ],
  presence: {
    status: 'dnd', // Set Discord status to Do Not Disturb (DND)
    activities: [
      {
        name: 'Botting',
        type: ActivityType.Watching
      }
    ]
  }
});

client.commands = new Collection();

// 1. Load Commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  }
}

// 2. Load Event Listeners
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}

// 3. Presence & Member Events for Live Server Stats Counters
client.on('guildMemberAdd', member => {
  if (member.guild) updateStatsChannels(member.guild);
});

client.on('guildMemberRemove', member => {
  if (member.guild) updateStatsChannels(member.guild);
});

client.on('presenceUpdate', (oldPresence, newPresence) => {
  if (newPresence && newPresence.guild) {
    updateStatsChannels(newPresence.guild);
  }
});

// Auto-create SERVER LOGS Category & Channels when bot joins a new server
client.on('guildCreate', async guild => {
  await setupLogCategory(guild);
  updateStatsChannels(guild, true);
});

// 4. Ready Event, Schedulers & Giveaways
client.once('ready', async () => {
  console.log(`=========================================`);
  console.log(`Logged in as ${client.user.tag} (Status: Do Not Disturb | Activity: Watching Botting)`);
  console.log(`Serving ${client.guilds.cache.size} server(s)`);
  console.log(`=========================================`);

  // Ensure status stays on DND with Watching Botting activity
  client.user.setPresence({
    status: 'dnd',
    activities: [{ name: 'Botting', type: ActivityType.Watching }]
  });

  // Initialize Reminders & Birthdays Schedulers
  initReminderScheduler(client);
  initBirthdayScheduler(client);

  // Start 100% Local Web Dashboard Server
  startDashboard(client, process.env.PORT || 3000);

  // Automatically setup SERVER LOGS category & channels for all guilds
  for (const [id, guild] of client.guilds.cache) {
    await setupLogCategory(guild);
    updateStatsChannels(guild, true);
  }

  // Periodic 10-minute stats counter sync
  setInterval(() => {
    client.guilds.cache.forEach(guild => {
      updateStatsChannels(guild, false);
    });
  }, 600000);

  // Resume active giveaways timer
  const activeGiveaways = db.getGiveaways().filter(g => !g.ended);
  if (activeGiveaways.length > 0) {
    console.log(`Resuming ${activeGiveaways.length} active giveaway timer(s)...`);
    for (const giveaway of activeGiveaways) {
      const remainingMs = giveaway.endsAt - Date.now();
      if (remainingMs <= 0) {
        endGiveaway(client, giveaway);
      } else {
        setTimeout(() => {
          endGiveaway(client, giveaway);
        }, remainingMs);
      }
    }
  }
});

// Graceful process shutdown handler
function gracefulShutdown() {
  console.log('\nShutting down bot gracefully...');
  db.save();
  if (client) client.destroy();
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Log in
client.login(config.token);
