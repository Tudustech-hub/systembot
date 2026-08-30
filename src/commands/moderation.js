const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ms = require('ms');
const config = require('../config');
const { getEmoji } = require('../utils/emojis');
const { enforceOwner } = require('../utils/owner');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('moderation')
    .setDescription('Moderation commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand(sub =>
      sub.setName('kick')
        .setDescription('Kick a member (Owner only)')
        .addUserOption(opt => opt.setName('user').setDescription('Target member').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('ban')
        .setDescription('Ban a member (Owner only)')
        .addUserOption(opt => opt.setName('user').setDescription('Target member').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('timeout')
        .setDescription('Timeout a member')
        .addUserOption(opt => opt.setName('user').setDescription('Target member').setRequired(true))
        .addStringOption(opt => opt.setName('duration').setDescription('Duration (e.g. 10m, 1h, 1d)').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('purge')
        .setDescription('Delete messages')
        .addIntegerOption(opt => opt.setName('amount').setDescription('Number (1-100)').setMinValue(1).setMaxValue(100).setRequired(true))
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guild = interaction.guild;

    // Kick -> Owner Only
    if (subcommand === 'kick') {
      const isAuthorized = await enforceOwner(interaction);
      if (!isAuthorized) return;

      const user = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'No reason';
      const member = await guild.members.fetch(user.id).catch(() => null);

      if (!member || !member.kickable) {
        const denyEmoji = getEmoji(guild, 'Deny');
        return interaction.reply({ 
          content: `${denyEmoji} Cannot kick this user.`, 
          ephemeral: true 
        });
      }

      await member.kick(reason);

      const denyEmoji = getEmoji(guild, 'Deny');
      const embed = new EmbedBuilder()
        .setColor(config.warningColor)
        .setTitle(`${denyEmoji} Member Kicked`.trim())
        .setDescription(`**User:** ${user.tag}\n**Reason:** ${reason}`)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // Ban -> Owner Only
    if (subcommand === 'ban') {
      const isAuthorized = await enforceOwner(interaction);
      if (!isAuthorized) return;

      const user = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'No reason';
      const member = await guild.members.fetch(user.id).catch(() => null);

      if (member && !member.bannable) {
        const denyEmoji = getEmoji(guild, 'Deny');
        return interaction.reply({ 
          content: `${denyEmoji} Cannot ban this user.`, 
          ephemeral: true 
        });
      }

      await guild.members.ban(user.id, { reason });

      const denyEmoji = getEmoji(guild, 'Deny');
      const embed = new EmbedBuilder()
        .setColor(config.errorColor)
        .setTitle(`${denyEmoji} Member Banned`.trim())
        .setDescription(`**User:** ${user.tag}\n**Reason:** ${reason}`)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === 'timeout') {
      const user = interaction.options.getUser('user');
      const durationStr = interaction.options.getString('duration');
      const reason = interaction.options.getString('reason') || 'No reason';
      const member = await guild.members.fetch(user.id).catch(() => null);

      if (!member) {
        const denyEmoji = getEmoji(guild, 'Deny');
        return interaction.reply({ content: `${denyEmoji} User not found.`, ephemeral: true });
      }

      const durationMs = ms(durationStr);
      if (!durationMs || durationMs < 5000 || durationMs > ms('28d')) {
        const denyEmoji = getEmoji(guild, 'Deny');
        return interaction.reply({ content: `${denyEmoji} Invalid duration (e.g. 10m, 1h, 1d).`, ephemeral: true });
      }

      await member.timeout(durationMs, reason);

      const denyEmoji = getEmoji(guild, 'Deny');
      const embed = new EmbedBuilder()
        .setColor(config.warningColor)
        .setTitle(`${denyEmoji} Member Timed Out`.trim())
        .setDescription(`**User:** ${user.tag}\n**Duration:** ${durationStr}\n**Reason:** ${reason}`)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === 'purge') {
      const amount = interaction.options.getInteger('amount');
      const deleted = await interaction.channel.bulkDelete(amount, true).catch(() => null);

      if (!deleted) {
        const denyEmoji = getEmoji(guild, 'Deny');
        return interaction.reply({ content: `${denyEmoji} Couldn't delete messages older than 14 days.`, ephemeral: true });
      }

      const checkEmoji = getEmoji(guild, 'check');
      return interaction.reply({ content: `${checkEmoji} Deleted **${deleted.size}** messages.`, ephemeral: true });
    }
  }
};
