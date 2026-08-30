const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { getEmoji } = require('../utils/emojis');
const { sendAuditLog } = require('../utils/auditLogger');

module.exports = {
  name: 'messageUpdate',
  async execute(oldMessage, newMessage) {
    if (!oldMessage || !oldMessage.guild || oldMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return; // Ignore embed updates or pin events

    const guild = oldMessage.guild;
    const infoEmoji = getEmoji(guild, 'info');

    const oldContent = oldMessage.content 
      ? (oldMessage.content.length > 1000 ? oldMessage.content.slice(0, 995) + '...' : oldMessage.content)
      : '*[No text content]*';

    const newContent = newMessage.content 
      ? (newMessage.content.length > 1000 ? newMessage.content.slice(0, 995) + '...' : newMessage.content)
      : '*[No text content]*';

    const embed = new EmbedBuilder()
      .setColor(config.warningColor)
      .setTitle(`${infoEmoji} Message Edited`.trim())
      .addFields(
        { name: 'Author', value: `${oldMessage.author} (\`${oldMessage.author.id}\`)`, inline: true },
        { name: 'Channel', value: `${oldMessage.channel} (\`#${oldMessage.channel.name}\`)`, inline: true },
        { name: 'Jump to Message', value: `[Click Here](${newMessage.url})`, inline: true },
        { name: 'Before Edit', value: oldContent },
        { name: 'After Edit', value: newContent }
      )
      .setFooter({ text: `Message ID: ${oldMessage.id}` })
      .setTimestamp();

    await sendAuditLog(guild, embed, 'messageEdits');
  }
};
