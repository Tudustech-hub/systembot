const db = require('../db/database');
const config = require('../config');
const { getEmoji } = require('./emojis');
const { EmbedBuilder } = require('discord.js');

let reminderInterval = null;

function initReminderScheduler(client) {
  if (reminderInterval) clearInterval(reminderInterval);

  // Check every 5 seconds for due reminders
  reminderInterval = setInterval(async () => {
    const now = Date.now();
    const reminders = db.getReminders();
    if (!reminders || reminders.length === 0) return;

    const dueReminders = reminders.filter(r => r.dueAt <= now);
    if (dueReminders.length === 0) return;

    for (const r of dueReminders) {
      try {
        const guild = client.guilds.cache.get(r.guildId);
        const user = await client.users.fetch(r.userId).catch(() => null);

        if (!user) {
          db.deleteReminder(r.id);
          continue;
        }

        const alarmEmoji = guild ? getEmoji(guild, 'alarm') : '';
        const checkEmoji = guild ? getEmoji(guild, 'check') : '';

        const embed = new EmbedBuilder()
          .setColor(config.embedColor)
          .setTitle(`${alarmEmoji} Reminder Alert`.trim())
          .setDescription(`Hey <@${r.userId}>, here is your reminder:\n\n**${r.text}**`)
          .setFooter({ text: `Set <t:${Math.floor(r.createdAt / 1000)}:R>` })
          .setTimestamp();

        let delivered = false;

        // Try sending to the channel first
        if (guild && r.channelId) {
          const channel = guild.channels.cache.get(r.channelId) || await guild.channels.fetch(r.channelId).catch(() => null);
          if (channel && channel.isTextBased()) {
            await channel.send({ content: `<@${r.userId}>`, embeds: [embed] }).catch(() => {});
            delivered = true;
          }
        }

        // If not delivered in channel, send DM
        if (!delivered) {
          await user.send({ embeds: [embed] }).catch(() => {});
        }

      } catch (err) {
        console.error('Error processing reminder:', err);
      } finally {
        db.deleteReminder(r.id);
      }
    }
  }, 5000);
}

module.exports = {
  initReminderScheduler
};
