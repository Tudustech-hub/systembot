require('dotenv').config();

// Collect all configured GEMINI_API_KEY variables dynamically
const keys = Object.keys(process.env)
  .filter(k => k.startsWith('GEMINI_API_KEY'))
  .map(k => process.env[k])
  .filter(Boolean);

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  geminiApiKey: keys[0] || '',
  geminiApiKeys: keys,
  embedColor: '#5865F2', // Discord Blurple
  successColor: '#57F287',
  errorColor: '#ED4245',
  warningColor: '#FEE75C'
};
