const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { getEmoji } = require('../utils/emojis');
const { sendAuditLog } = require('../utils/auditLogger');

module.exports = {
  name: 'guildBanAdd',
  async execute(ban) {
    if (!ban || !ban.guild) return;

    const guild = ban.guild;
    const denyEmoji = getEmoji(guild, 'Deny');

    const embed = new EmbedBuilder()
      .setColor(config.errorColor)
      .setTitle(`${denyEmoji} Member Banned`.trim())
      .addFields(
        { name: 'Banned User', value: `${ban.user.tag} (${ban.user})`, inline: true },
        { name: 'User ID', value: `\`${ban.user.id}\``, inline: true },
        { name: 'Reason', value: ban.reason || 'No reason provided' }
      )
      .setTimestamp();

    await sendAuditLog(guild, embed, 'bans');
  }
};
