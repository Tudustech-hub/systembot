const db = require('../db/database');
const config = require('../config');
const { getEmoji, setButtonEmoji } = require('./emojis');
const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

let birthdayInterval = null;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Helper: Build the Live Birthday Calendar Panel Embed & Buttons
function buildBirthdayPanelEmbedAndRows(guild) {
  const allBirthdays = db.getBirthdays();
  const userIds = Object.keys(allBirthdays);

  const listItems = [];
  for (const uid of userIds) {
    const member = guild.members.cache.get(uid);
    if (member) {
      const b = allBirthdays[uid];
      listItems.push({
        userId: uid,
        tag: `<@${uid}>`,
        month: b.month,
        day: b.day,
        formatted: `${MONTH_NAMES[b.month - 1]} ${b.day}`
      });
    }
  }

  // Sort chronologically by month, then day
  listItems.sort((a, b) => a.month - b.month || a.day - b.day);

  const verifiedEmoji = getEmoji(guild, 'verified');
  const boostEmoji = getEmoji(guild, 'boost');

  let description = '';
  if (listItems.length === 0) {
    description = `*No birthdays registered yet!*\nClick **Set Birthday** below to add yours to the calendar.`;
  } else {
    // Group by month
    const grouped = {};
    for (const item of listItems) {
      const mName = MONTH_NAMES[item.month - 1];
      if (!grouped[mName]) grouped[mName] = [];
      grouped[mName].push(item);
    }

    description = Object.entries(grouped).map(([mName, members]) => {
      const memberLines = members.map(m => `• ${m.tag} — **${m.day}**`).join('\n');
      return `### 📅 ${mName}\n${memberLines}`;
    }).join('\n\n');
  }

  const embed = new EmbedBuilder()
    .setColor(config.embedColor)
    .setTitle(`${verifiedEmoji} SERVER BIRTHDAY CALENDAR`.trim())
    .setDescription(description)
    .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
    .setFooter({ text: `${guild.name} • ${listItems.length} Registered Birthday(s)` })
    .setTimestamp();

  const setBtn = new ButtonBuilder()
    .setCustomId('bday_btn_set')
    .setLabel('Set Birthday')
    .setStyle(ButtonStyle.Success);
  setButtonEmoji(setBtn, boostEmoji);

  const viewBtn = new ButtonBuilder()
    .setCustomId('bday_btn_view')
    .setLabel('My Birthday')
    .setStyle(ButtonStyle.Primary);

  const removeBtn = new ButtonBuilder()
    .setCustomId('bday_btn_remove')
    .setLabel('Remove')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder().addComponents(setBtn, viewBtn, removeBtn);

  return { embed, row };
}

// Helper: Ensure the Live Birthday Panel in the channel is created or updated
async function updateBirthdayPanel(guild) {
  if (!guild) return;
  const cfg = db.getGuildConfig(guild.id);
  if (!cfg.birthdayChannelId) return;

  const channel = guild.channels.cache.get(cfg.birthdayChannelId) || await guild.channels.fetch(cfg.birthdayChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const { embed, row } = buildBirthdayPanelEmbedAndRows(guild);

  if (cfg.birthdayPanelMessageId) {
    try {
      const msg = await channel.messages.fetch(cfg.birthdayPanelMessageId).catch(() => null);
      if (msg) {
        await msg.edit({ embeds: [embed], components: [row] });
        return;
      }
    } catch (err) {}
  }

  // If not found or not created, send new panel message
  try {
    const newMsg = await channel.send({ embeds: [embed], components: [row] });
    db.updateGuildConfig(guild.id, { birthdayPanelMessageId: newMsg.id });
  } catch (err) {
    console.error('Error posting live birthday panel:', err);
  }
}

// Helper: Check birthdays and cleanup expired daily celebration messages
async function checkBirthdays(client) {
  const now = new Date();
  const currentMonth = now.getUTCMonth() + 1; // 1 - 12
  const currentDay = now.getUTCDate();        // 1 - 31
  const currentYear = now.getUTCFullYear();
  const currentTimestamp = Date.now();

  const allBirthdays = db.getBirthdays();
  const birthdayUserIds = Object.keys(allBirthdays);

  for (const guild of client.guilds.cache.values()) {
    const cfg = db.getGuildConfig(guild.id);
    if (!cfg.birthdayChannelId) continue;

    const channel = guild.channels.cache.get(cfg.birthdayChannelId) || await guild.channels.fetch(cfg.birthdayChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) continue;

    let celebrations = cfg.birthdayCelebrations || [];
    let celebrationsChanged = false;

    // 1. Clean up expired celebration messages (after 24 hours / when day is over)
    const remainingCelebrations = [];
    for (const item of celebrations) {
      if (currentTimestamp >= item.expiresAt) {
        celebrationsChanged = true;
        // Delete yesterday's celebration message
        try {
          const msg = await channel.messages.fetch(item.messageId).catch(() => null);
          if (msg) await msg.delete().catch(() => {});
        } catch (e) {}

        // Remove birthday role if assigned
        if (cfg.birthdayRoleId) {
          try {
            const member = await guild.members.fetch(item.userId).catch(() => null);
            if (member && member.roles.cache.has(cfg.birthdayRoleId)) {
              await member.roles.remove(cfg.birthdayRoleId).catch(() => {});
            }
          } catch (e) {}
        }
      } else {
        remainingCelebrations.push(item);
      }
    }

    if (celebrationsChanged) {
      celebrations = remainingCelebrations;
      db.updateGuildConfig(guild.id, { birthdayCelebrations: celebrations });
    }

    // 2. Announce Today's Birthdays
    for (const userId of birthdayUserIds) {
      const bday = allBirthdays[userId];
      if (!bday) continue;

      if (bday.month === currentMonth && bday.day === currentDay) {
        if (bday.lastCelebratedYear === currentYear) continue;

        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) continue;

        // Assign birthday role
        if (cfg.birthdayRoleId) {
          await member.roles.add(cfg.birthdayRoleId).catch(() => {});
        }

        const boostEmoji = getEmoji(guild, 'boost');
        const verifiedEmoji = getEmoji(guild, 'verified');

        const embed = new EmbedBuilder()
          .setColor(config.embedColor)
          .setTitle(`${verifiedEmoji} HAPPY BIRTHDAY!`.trim())
          .setDescription(`Wishing a wonderful and happy birthday to ${member}! 🎉\n\nHope you have an awesome day filled with joy and celebration!`)
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
          .setFooter({ text: `${guild.name} • Birthday Celebration (Auto-cleans tomorrow)` })
          .setTimestamp();

        const sentMsg = await channel.send({ content: `${boostEmoji} Happy Birthday ${member}!`, embeds: [embed] }).catch(() => null);

        if (sentMsg) {
          // Expires in 24 hours (86,400,000 ms)
          const expiresAt = currentTimestamp + 86400000;
          celebrations.push({
            messageId: sentMsg.id,
            channelId: channel.id,
            userId,
            expiresAt
          });
          db.updateGuildConfig(guild.id, { birthdayCelebrations: celebrations });
        }

        // Mark as celebrated this year
        db.updateBirthday(userId, { lastCelebratedYear: currentYear });
      }
    }
  }
}

function initBirthdayScheduler(client) {
  if (birthdayInterval) clearInterval(birthdayInterval);

  // Initial run on startup
  checkBirthdays(client).catch(err => console.error('Initial birthday check error:', err));

  // Check every 10 minutes
  birthdayInterval = setInterval(() => {
    checkBirthdays(client).catch(err => console.error('Birthday scheduler error:', err));
  }, 600000);
}

module.exports = {
  initBirthdayScheduler,
  checkBirthdays,
  updateBirthdayPanel,
  buildBirthdayPanelEmbedAndRows,
  MONTH_NAMES
};
