const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { getEmoji } = require('../utils/emojis');
const { sendAuditLog } = require('../utils/auditLogger');

module.exports = {
  name: 'messageDelete',
  async execute(message) {
    if (!message || !message.guild || message.author?.bot) return;

    const guild = message.guild;
    const denyEmoji = getEmoji(guild, 'Deny');

    const embed = new EmbedBuilder()
      .setColor(config.errorColor)
      .setTitle(`${denyEmoji} Message Deleted`.trim())
      .addFields(
        { name: 'Author', value: `${message.author} (\`${message.author.id}\`)`, inline: true },
        { name: 'Channel', value: `${message.channel} (\`#${message.channel.name}\`)`, inline: true }
      )
      .setTimestamp();

    if (message.content) {
      const trimmedContent = message.content.length > 1024 ? message.content.slice(0, 1020) + '...' : message.content;
      embed.addFields({ name: 'Content', value: trimmedContent });
    }

    if (message.attachments && message.attachments.size > 0) {
      const attachmentsList = message.attachments.map(a => `[${a.name}](${a.url})`).join(', ');
      embed.addFields({ name: 'Attachments', value: attachmentsList });
    }

    embed.setFooter({ text: `Message ID: ${message.id}` });

    await sendAuditLog(guild, embed, 'messageDeletes');
  }
};
