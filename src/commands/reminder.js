const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const ms = require('ms');
const db = require('../db/database');
const config = require('../config');
const { getEmoji } = require('../utils/emojis');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reminder')
    .setDescription('Set and manage personal reminders')
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Set a reminder')
        .addStringOption(opt => opt.setName('time').setDescription('Time (e.g. 10m, 1h, 2d)').setRequired(true))
        .addStringOption(opt => opt.setName('text').setDescription('Reminder message').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('View your active reminders')
    )
    .addSubcommand(sub =>
      sub.setName('cancel')
        .setDescription('Cancel a reminder')
        .addStringOption(opt => opt.setName('id').setDescription('Reminder ID').setRequired(true))
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const userId = interaction.user.id;

    if (subcommand === 'set') {
      const timeStr = interaction.options.getString('time');
      const text = interaction.options.getString('text');

      const durationMs = ms(timeStr);
      if (!durationMs || durationMs < 5000 || durationMs > ms('365d')) {
        const denyEmoji = getEmoji(guild, 'Deny');
        return interaction.reply({
          content: `${denyEmoji} Invalid time format. Use values like \`10m\`, \`1h\`, \`2d\`.`,
          ephemeral: true
        });
      }

      const dueAt = Date.now() + durationMs;
      const reminderId = Math.random().toString(36).substring(2, 8);

      db.addReminder({
        id: reminderId,
        guildId: guild.id,
        channelId: interaction.channel.id,
        userId,
        text,
        dueAt,
        createdAt: Date.now()
      });

      const checkEmoji = getEmoji(guild, 'check');
      const embed = new EmbedBuilder()
        .setColor(config.successColor)
        .setTitle(`${checkEmoji} Reminder Set`.trim())
        .setDescription(`• **Reminder:** ${text}\n• **Alert:** <t:${Math.floor(dueAt / 1000)}:R> (<t:${Math.floor(dueAt / 1000)}:f>)\n• **ID:** \`${reminderId}\``)
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === 'list') {
      const userReminders = db.getUserReminders(userId, guild.id);

      if (userReminders.length === 0) {
        const infoEmoji = getEmoji(guild, 'info');
        return interaction.reply({
          content: `${infoEmoji} You have no active reminders.`,
          ephemeral: true
        });
      }

      const listText = userReminders.map((r, idx) => 
        `\`${r.id}\` • **${r.text}** (<t:${Math.floor(r.dueAt / 1000)}:R>)`
      ).join('\n');

      const alarmEmoji = getEmoji(guild, 'alarm');
      const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle(`${alarmEmoji} Your Reminders (${userReminders.length})`.trim())
        .setDescription(listText)
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === 'cancel') {
      const id = interaction.options.getString('id').trim();
      const userReminders = db.getUserReminders(userId);
      const target = userReminders.find(r => r.id === id);

      if (!target) {
        const denyEmoji = getEmoji(guild, 'Deny');
        return interaction.reply({
          content: `${denyEmoji} Reminder with ID \`${id}\` not found.`,
          ephemeral: true
        });
      }

      db.deleteReminder(id);

      const checkEmoji = getEmoji(guild, 'check');
      return interaction.reply({
        content: `${checkEmoji} Cancelled reminder: **${target.text}**`,
        ephemeral: true
      });
    }
  }
};
