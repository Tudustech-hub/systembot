const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');

if (!config.token || !config.clientId) {
  console.error('❌ Error: DISCORD_TOKEN and CLIENT_ID are required in your .env file!');
  process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
    console.log(`Loaded command for deployment: ${command.data.name}`);
  } else if ('commands' in command && Array.isArray(command.commands)) {
    for (const cmd of command.commands) {
      commands.push(cmd.toJSON());
      console.log(`Loaded context menu for deployment: ${cmd.name}`);
    }
  }
}

const rest = new REST().setToken(config.token);

(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    let data;
    if (config.guildId) {
      // Fast instant deployment to test Guild
      console.log(`Deploying slash commands to Guild ID: ${config.guildId}`);
      data = await rest.put(
        Routes.applicationGuildCommands(config.clientId, config.guildId),
        { body: commands }
      );
    } else {
      // Global deployment (may take up to 1 hour to propagate across Discord)
      console.log('Deploying slash commands globally...');
      data = await rest.put(
        Routes.applicationCommands(config.clientId),
        { body: commands }
      );
    }

    console.log(`Successfully reloaded ${data.length} application (/) commands.`);
  } catch (error) {
    console.error('Error deploying commands:', error);
  }
})();
