const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const aiQuota = require('../utils/aiQuota');
const config = require('../config');
const { getEmoji } = require('../utils/emojis');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ai')
    .setDescription('Check AI status and quota')
    .addSubcommand(sub =>
      sub.setName('quota')
        .setDescription('Check AI usage')
    )
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('Check AI system status')
    ),

  async execute(interaction) {
    const guild = interaction.guild;
    const userId = interaction.user.id;
    const status = aiQuota.getStatus(userId);

    const isExhausted = status.quotaExhausted;
    const statusEmoji = isExhausted ? getEmoji(guild, 'offline') : getEmoji(guild, 'online');
    const verifiedEmoji = getEmoji(guild, 'verified');

    const embed = new EmbedBuilder()
      .setColor(isExhausted ? config.warningColor : config.embedColor)
      .setTitle(`${verifiedEmoji} AI Status`.trim())
      .setDescription(
        `• **Status:** ${statusEmoji} ${isExhausted ? 'Quota Limit' : 'Online'}\n` +
        `• **Model:** \`${status.currentModel}\`\n` +
        `• **Today's Requests:** \`${status.dailyCount}\`\n` +
        `• **Your Requests:** \`${status.userUsage}\`\n` +
        `• **Reset:** In ${status.resetTimeFormat}`
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
};
