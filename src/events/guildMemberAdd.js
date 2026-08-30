const { EmbedBuilder } = require('discord.js');
const db = require('../db/database');
const config = require('../config');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    const guildConfig = db.getGuildConfig(member.guild.id);

    // Auto-role assignment if configured
    if (guildConfig.welcomeRoleId) {
      try {
        const role = member.guild.roles.cache.get(guildConfig.welcomeRoleId);
        if (role) {
          await member.roles.add(role);
        }
      } catch (err) {
        console.error(`Failed to assign auto-role to ${member.user.tag}:`, err);
      }
    }

    // Welcome embed message
    if (guildConfig.welcomeChannelId) {
      const channel = member.guild.channels.cache.get(guildConfig.welcomeChannelId);
      if (channel) {
        const welcomeEmbed = new EmbedBuilder()
          .setColor(config.embedColor)
          .setTitle(`Welcome to ${member.guild.name}!`)
          .setDescription(`Hey ${member}, welcome to our server! We're glad to have you here.`)
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
          .addFields(
            { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
            { name: 'Member Count', value: `${member.guild.memberCount}`, inline: true }
          )
          .setFooter({ text: `User ID: ${member.id}` })
          .setTimestamp();

        channel.send({ embeds: [welcomeEmbed] }).catch(err => {
          console.error(`Failed to send welcome message in ${channel.id}:`, err);
        });
      }
    }
  }
};
