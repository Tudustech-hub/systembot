const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const config = require('../config');
const { getEmoji } = require('../utils/emojis');

function buildHelpEmbed(guild, category = 'overview') {
  const verifiedEmoji = getEmoji(guild, 'verified');
  const boostEmoji = getEmoji(guild, 'boost');
  const staffEmoji = getEmoji(guild, 'staff');
  const voiceEmoji = getEmoji(guild, 'voice');

  const embed = new EmbedBuilder()
    .setColor(config.embedColor)
    .setTimestamp();

  if (category === 'overview') {
    embed
      .setTitle(`${verifiedEmoji} System Bot • Commands & Modules`.trim())
      .setDescription(
        `Welcome to **System Bot**! Select a category from the dropdown menu below to view specific commands and features.\n\n` +
        `• **🎛️ Management**: \`/panel\`, \`/setup\`, \`/setup quickstart\`\n` +
        `• **🛡️ Moderation**: \`/purge\`, \`/ban\`, \`/kick\`, \`/timeout\`, Honeypot\n` +
        `• **🎉 Community**: \`/giveaway\`, \`/poll\`, \`/event\`, \`/counting\`, \`/birthday\`\n` +
        `• **🔊 Voice & Music**: Dynamic Join-to-Create, \`/music play\`, controls\n` +
        `• **🤖 AI & Utility**: \`/ai\`, \`/reminder\`, \`/rules\`, \`/embed\`, \`/minigame\``
      )
      .setFooter({ text: 'System Bot • Use dropdown below' });
  } else if (category === 'moderation') {
    embed
      .setTitle(`${staffEmoji} Moderation & Security Commands`.trim())
      .setDescription(
        `• \`/purge <amount> [user]\` — Delete 1–100 messages from the channel.\n` +
        `• \`/ban <user> [reason] [days]\` — Ban a member and optionally purge messages.\n` +
        `• \`/kick <user> [reason]\` — Kick a member from the server.\n` +
        `• \`/timeout <user> <duration> [reason]\` — Mute/timeout a member (e.g. \`10m\`, \`1h\`).\n` +
        `• \`/unban <user_id> [reason]\` — Unban a user by their Discord ID.\n` +
        `• **Honeypot Trap** — Configure hidden trap channel to auto-ban raid bots.`
      );
  } else if (category === 'community') {
    embed
      .setTitle(`${boostEmoji} Community & Engagement Commands`.trim())
      .setDescription(
        `• \`/giveaway start <duration> <winners> <prize>\` — Host automated giveaways.\n` +
        `• \`/giveaway end <giveaway_id>\` — End a giveaway early and pick winners.\n` +
        `• \`/giveaway reroll <giveaway_id>\` — Reroll new winners for a giveaway.\n` +
        `• \`/poll send <question> <options...>\` — Create live voting polls with buttons.\n` +
        `• \`/event send <title> <description> <time>\` — Post gaming events with RSVP buttons.\n` +
        `• \`/counting <channel>\` — Set up cooperative counting (Easy & Hard mode).\n` +
        `• \`/birthday <channel>\` — Birthday celebration calendar with automated roles.`
      );
  } else if (category === 'voice_music') {
    embed
      .setTitle(`${voiceEmoji} Voice & Music Commands`.trim())
      .setDescription(
        `• **➕ Join to Create** — Connect to voice trigger to spawn a private/public room.\n` +
        `• \`/setup unlock_voice_permissions\` — Force screen share & screenshot permissions.\n` +
        `• \`/music play <query/url>\` — Stream music from YouTube/Spotify into voice.\n` +
        `• \`/music panel\` — Open voice playback control center.\n` +
        `• \`/music skip\`, \`/music stop\`, \`/music queue\` — Music queue management.`
      );
  } else if (category === 'ai_utility') {
    embed
      .setTitle(`🤖 AI & Utility Commands`)
      .setDescription(
        `• \`/ai <prompt>\` — Ask Google Gemini AI questions.\n` +
        `• \`/reminder set <time> <message>\` — Schedule timed reminders (e.g. \`1h\`, \`30m\`).\n` +
        `• \`/embed send <channel> <json/title>\` — Post rich custom embeds.\n` +
        `• \`/rules send <channel>\` — Post server rules and guidelines.\n` +
        `• \`/minigame <game>\` — Play Tic-Tac-Toe, RPS, 8-Ball, Coinflip, Dice Roll.\n` +
        `• \`/utility ping\`, \`userinfo\`, \`serverinfo\` — Check system stats and info.`
      );
  } else if (category === 'setup') {
    embed
      .setTitle(`⚙️ Server Setup & Quickstart`)
      .setDescription(
        `• \`/setup quickstart\` — **1-Click auto-setup** for the entire server.\n` +
        `• \`/panel\` — Interactive visual control panel in Discord.\n` +
        `• \`/setup sync_emojis\` — Upload all custom System Bot emojis.\n` +
        `• \`/setup logs_channel\`, \`stats_channels\`, \`welcome\`, \`ticket\` — Individual module setup.\n` +
        `• **Web Dashboard** — Manage everything at \`http://localhost:3000\`.`
      );
  }

  return embed;
}

function buildHelpMenu(currentCategory = 'overview') {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('help_category_select')
    .setPlaceholder('Select a module category...')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Overview')
        .setDescription('General bot info & summary')
        .setValue('overview')
        .setEmoji('📖')
        .setDefault(currentCategory === 'overview'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Moderation & Security')
        .setDescription('Purge, Ban, Kick, Timeout, Honeypot')
        .setValue('moderation')
        .setEmoji('🛡️')
        .setDefault(currentCategory === 'moderation'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Community & Engagement')
        .setDescription('Giveaways, Polls, Events, Counting, Birthdays')
        .setValue('community')
        .setEmoji('🎉')
        .setDefault(currentCategory === 'community'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Voice & Music')
        .setDescription('Temp Voice Rooms, Music Streaming')
        .setValue('voice_music')
        .setEmoji('🔊')
        .setDefault(currentCategory === 'voice_music'),
      new StringSelectMenuOptionBuilder()
        .setLabel('AI & Utility')
        .setDescription('Gemini AI, Reminders, Embeds, Minigames')
        .setValue('ai_utility')
        .setEmoji('🤖')
        .setDefault(currentCategory === 'ai_utility'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Server Setup')
        .setDescription('Quickstart, In-Discord Panel & Dashboard')
        .setValue('setup')
        .setEmoji('⚙️')
        .setDefault(currentCategory === 'setup')
    );

  return new ActionRowBuilder().addComponents(menu);
}

module.exports = {
  buildHelpEmbed,
  buildHelpMenu,
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Explore all bot commands and features interactively'),

  async execute(interaction) {
    const embed = buildHelpEmbed(interaction.guild, 'overview');
    const row = buildHelpMenu('overview');
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }
};
