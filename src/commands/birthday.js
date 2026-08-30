const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db/database');
const config = require('../config');
const { getEmoji } = require('../utils/emojis');
const { MONTH_NAMES, updateBirthdayPanel } = require('../utils/birthdayScheduler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('birthday')
    .setDescription('Set and view server birthdays')
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Set your birthday')
        .addIntegerOption(opt =>
          opt.setName('month')
            .setDescription('Birth month (1-12)')
            .setMinValue(1)
            .setMaxValue(12)
            .setRequired(true)
            .addChoices(
              { name: '1 - January', value: 1 },
              { name: '2 - February', value: 2 },
              { name: '3 - March', value: 3 },
              { name: '4 - April', value: 4 },
              { name: '5 - May', value: 5 },
              { name: '6 - June', value: 6 },
              { name: '7 - July', value: 7 },
              { name: '8 - August', value: 8 },
              { name: '9 - September', value: 9 },
              { name: '10 - October', value: 10 },
              { name: '11 - November', value: 11 },
              { name: '12 - December', value: 12 }
            )
        )
        .addIntegerOption(opt =>
          opt.setName('day')
            .setDescription('Birth day (1-31)')
            .setMinValue(1)
            .setMaxValue(31)
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('View a member\'s birthday')
        .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('View upcoming server birthdays')
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove your registered birthday')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const userId = interaction.user.id;

    if (subcommand === 'set') {
      const month = interaction.options.getInteger('month');
      const day = interaction.options.getInteger('day');

      const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      if (day > daysInMonth[month - 1]) {
        const denyEmoji = getEmoji(guild, 'Deny');
        return interaction.reply({
          content: `${denyEmoji} Invalid date for ${MONTH_NAMES[month - 1]}.`,
          ephemeral: true
        });
      }

      db.setBirthday(userId, month, day);

      // Auto update live calendar panel in birthdays channel
      await updateBirthdayPanel(guild).catch(() => {});

      const checkEmoji = getEmoji(guild, 'check');
      const embed = new EmbedBuilder()
        .setColor(config.successColor)
        .setTitle(`${checkEmoji} Birthday Saved`.trim())
        .setDescription(`Your birthday is set to **${MONTH_NAMES[month - 1]} ${day}**.\nAdded to the server birthday calendar!`)
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === 'view') {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const bday = db.getBirthday(targetUser.id);

      if (!bday) {
        const infoEmoji = getEmoji(guild, 'info');
        const isSelf = targetUser.id === userId;
        return interaction.reply({
          content: `${infoEmoji} ${isSelf ? 'You haven\'t set your birthday yet! Use `/birthday set`.' : `${targetUser.username} has not set their birthday.`}`,
          ephemeral: true
        });
      }

      const verifiedEmoji = getEmoji(guild, 'verified');
      const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle(`${verifiedEmoji} ${targetUser.username}'s Birthday`.trim())
        .setDescription(`• **Date:** **${MONTH_NAMES[bday.month - 1]} ${bday.day}**`)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === 'list') {
      const allBirthdays = db.getBirthdays();
      const userIds = Object.keys(allBirthdays);

      if (userIds.length === 0) {
        const infoEmoji = getEmoji(guild, 'info');
        return interaction.reply({
          content: `${infoEmoji} No birthdays registered yet. Use \`/birthday set\` to add yours!`,
          ephemeral: true
        });
      }

      const listItems = [];
      for (const uid of userIds) {
        const member = guild.members.cache.get(uid);
        if (member) {
          const b = allBirthdays[uid];
          listItems.push({
            name: member.user.username,
            tag: `<@${uid}>`,
            month: b.month,
            day: b.day,
            formatted: `${MONTH_NAMES[b.month - 1]} ${b.day}`
          });
        }
      }

      if (listItems.length === 0) {
        const infoEmoji = getEmoji(guild, 'info');
        return interaction.reply({
          content: `${infoEmoji} No registered birthdays found for current members.`,
          ephemeral: true
        });
      }

      listItems.sort((a, b) => a.month - b.month || a.day - b.day);

      const description = listItems.map(item => `• ${item.tag} — **${item.formatted}**`).join('\n');

      const verifiedEmoji = getEmoji(guild, 'verified');
      const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle(`${verifiedEmoji} Server Birthdays (${listItems.length})`.trim())
        .setDescription(description)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === 'remove') {
      const bday = db.getBirthday(userId);
      if (!bday) {
        const infoEmoji = getEmoji(guild, 'info');
        return interaction.reply({ content: `${infoEmoji} You do not have a birthday saved.`, ephemeral: true });
      }

      const all = db.getBirthdays();
      delete all[userId];
      db.save();

      await updateBirthdayPanel(guild).catch(() => {});

      const checkEmoji = getEmoji(guild, 'check');
      return interaction.reply({ content: `${checkEmoji} Your birthday was removed from the calendar.`, ephemeral: true });
    }
  }
};
