const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { getEmoji } = require('../utils/emojis');
const { sendAuditLog } = require('../utils/auditLogger');

module.exports = {
  name: 'channelDelete',
  async execute(channel) {
    if (!channel || !channel.guild) return;

    const guild = channel.guild;
    const denyEmoji = getEmoji(guild, 'Deny');

    const embed = new EmbedBuilder()
      .setColor(config.errorColor)
      .setTitle(`${denyEmoji} Channel Deleted`.trim())
      .addFields(
        { name: 'Channel Name', value: `#${channel.name}`, inline: true },
        { name: 'Channel Type', value: `\`${channel.type}\``, inline: true },
        { name: 'Channel ID', value: `\`${channel.id}\``, inline: true }
      )
      .setTimestamp();

    await sendAuditLog(guild, embed, 'channels');
  }
};
