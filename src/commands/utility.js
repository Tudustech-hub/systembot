const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const { getEmoji } = require('../utils/emojis');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('utility')
    .setDescription('Utility commands')
    .addSubcommand(sub => sub.setName('ping').setDescription('Check latency'))
    .addSubcommand(sub => sub.setName('help').setDescription('List commands'))
    .addSubcommand(sub =>
      sub.setName('userinfo')
        .setDescription('User info')
        .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(false))
    )
    .addSubcommand(sub => sub.setName('serverinfo').setDescription('Server stats')),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guild = interaction.guild;

    if (subcommand === 'ping') {
      const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
      const latency = sent.createdTimestamp - interaction.createdTimestamp;
      const apiLatency = Math.round(interaction.client.ws.ping);

      const checkEmoji = getEmoji(guild, 'check');
      const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle(`${checkEmoji} Pong!`.trim())
        .setDescription(`• **Bot:** \`${latency}ms\`\n• **API:** \`${apiLatency}ms\``);

      return interaction.editReply({ content: null, embeds: [embed] });
    }

    if (subcommand === 'help') {
      const verifiedEmoji = getEmoji(guild, 'verified');

      const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle(`${verifiedEmoji} Commands`.trim())
        .setDescription(
          `• **Config:** \`/panel\`, \`/setup\`\n` +
          `• **Games:** \`/minigame tictactoe\`, \`rps\`, \`8ball\`, \`roll\`, \`coinflip\`\n` +
          `• **Music:** \`/music play\`, \`panel\`, \`skip\`, \`stop\`, \`queue\`\n` +
          `• **Features:** \`/giveaway\`, \`/poll\`, \`/event\`, \`/ticket\`, \`/reminder\`, \`/birthday\`\n` +
          `• **Mod:** \`/moderation kick\`, \`ban\`, \`timeout\`, \`purge\`\n` +
          `• **Utility:** \`/utility ping\`, \`userinfo\`, \`serverinfo\`, \`rules\`, \`ai quota\``
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === 'userinfo') {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const member = await guild.members.fetch(targetUser.id).catch(() => null);

      const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
        .setTitle(`User Info: ${targetUser.username}`)
        .addFields(
          { name: 'ID', value: targetUser.id, inline: true },
          { name: 'Created', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`, inline: true }
        );

      if (member) {
        embed.addFields(
          { name: 'Joined', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
          { name: 'Top Role', value: `${member.roles.highest}`, inline: true }
        );
      }

      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === 'serverinfo') {
      const owner = await guild.fetchOwner().catch(() => null);

      const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle(`Server Info: ${guild.name}`)
        .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
        .addFields(
          { name: 'Owner', value: owner ? owner.user.tag : 'Unknown', inline: true },
          { name: 'Members', value: `${guild.memberCount}`, inline: true },
          { name: 'Channels', value: `${guild.channels.cache.size}`, inline: true },
          { name: 'Roles', value: `${guild.roles.cache.size}`, inline: true }
        );

      return interaction.reply({ embeds: [embed] });
    }
  }
};
