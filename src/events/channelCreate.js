const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { getEmoji } = require('../utils/emojis');
const { sendAuditLog } = require('../utils/auditLogger');

module.exports = {
  name: 'channelCreate',
  async execute(channel) {
    if (!channel || !channel.guild) return;

    const guild = channel.guild;
    const checkEmoji = getEmoji(guild, 'check');

    const embed = new EmbedBuilder()
      .setColor(config.successColor)
      .setTitle(`${checkEmoji} Channel Created`.trim())
      .addFields(
        { name: 'Channel Name', value: `${channel} (\`#${channel.name}\`)`, inline: true },
        { name: 'Channel Type', value: `\`${channel.type}\``, inline: true },
        { name: 'Channel ID', value: `\`${channel.id}\``, inline: true }
      )
      .setTimestamp();

    await sendAuditLog(guild, embed, 'channels');
  }
};
