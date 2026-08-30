const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { getEmoji } = require('../utils/emojis');
const { sendAuditLog } = require('../utils/auditLogger');

module.exports = {
  name: 'guildBanRemove',
  async execute(ban) {
    if (!ban || !ban.guild) return;

    const guild = ban.guild;
    const checkEmoji = getEmoji(guild, 'check');

    const embed = new EmbedBuilder()
      .setColor(config.successColor)
      .setTitle(`${checkEmoji} Member Unbanned`.trim())
      .addFields(
        { name: 'Unbanned User', value: `${ban.user.tag} (${ban.user})`, inline: true },
        { name: 'User ID', value: `\`${ban.user.id}\``, inline: true }
      )
      .setTimestamp();

    await sendAuditLog(guild, embed, 'bans');
  }
};
