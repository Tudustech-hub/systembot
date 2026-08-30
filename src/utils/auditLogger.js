const { ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../db/database');
const config = require('../config');
const { getEmoji } = require('./emojis');

/**
 * Default module-specific log toggles state
 */
const DEFAULT_LOG_TOGGLES = {
  messageDeletes: true,
  messageEdits: true,
  bans: true,
  channels: true,
  tickets: true,
  honeypot: true
};

let isSettingUpLogs = false;

/**
 * Cleanup duplicate SERVER LOGS categories and channels if any were created
 */
async function cleanupDuplicateLogChannels(guild) {
  if (!guild) return;
  try {
    await guild.channels.fetch().catch(() => null);
    const categories = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory && c.name.includes('SERVER LOGS'));
    
    const categoryList = Array.from(categories.values());
    
    // If multiple categories exist, keep the first one and delete extra categories
    if (categoryList.length > 1) {
      console.log(`[CLEANUP] Found ${categoryList.length} duplicate SERVER LOGS categories. Cleaning up...`);
      for (let i = 1; i < categoryList.length; i++) {
        const extraCat = categoryList[i];
        const children = guild.channels.cache.filter(c => c.parentId === extraCat.id);
        for (const [_, child] of children) {
          await child.delete('Duplicate log channel cleanup').catch(() => {});
        }
        await extraCat.delete('Duplicate log category cleanup').catch(() => {});
      }
    }

    const targetCategory = categoryList[0];
    if (!targetCategory) return;

    // Deduplicate channels inside target category
    const channelNames = ['message-logs', 'mod-logs', 'channel-logs', 'ticket-logs', 'general-logs'];
    for (const name of channelNames) {
      const matching = guild.channels.cache.filter(c => c.parentId === targetCategory.id && c.name === name);
      const list = Array.from(matching.values());
      if (list.length > 1) {
        console.log(`[CLEANUP] Found ${list.length} duplicate #${name} channels. Cleaning up...`);
        for (let i = 1; i < list.length; i++) {
          await list[i].delete('Duplicate channel cleanup').catch(() => {});
        }
      }
    }

    // Also delete any old duplicate standalone #server-logs if it exists outside category
    const oldStandalone = guild.channels.cache.filter(c => c.isTextBased() && c.name === 'server-logs' && c.parentId !== targetCategory.id);
    for (const [_, chan] of oldStandalone) {
      await chan.delete('Old standalone server-logs cleanup').catch(() => {});
    }
  } catch (err) {
    console.error('[CLEANUP] Error during log channel cleanup:', err);
  }
}

/**
 * Send an informational welcome / purpose embed explaining what the log channel records
 */
async function sendChannelPurposeEmbed(guild, channel, spec) {
  if (!channel) return;
  try {
    const messages = await channel.messages.fetch({ limit: 5 }).catch(() => null);
    if (messages && messages.size > 0) return; // Purpose embed already sent

    const embed = new EmbedBuilder().setColor(config.embedColor).setTimestamp();

    if (spec.name === 'message-logs') {
      const infoEmoji = getEmoji(guild, 'info');
      embed.setTitle(`${infoEmoji} 💬 Message Audit Logs`.trim())
        .setDescription('This channel records message creation, deletion, and editing activity across all text channels.')
        .addFields(
          { name: '🗑️ Deleted Messages', value: 'Logs author, channel, message text, timestamps, and attached file links.' },
          { name: '✏️ Edited Messages', value: 'Logs author, channel, direct jump link, original content before edit, and new content after edit.' }
        )
        .setFooter({ text: 'Automated Message Logging System' });
    } else if (spec.name === 'mod-logs') {
      const staffEmoji = getEmoji(guild, 'staff');
      embed.setTitle(`${staffEmoji} 🔨 Moderation & Security Audit Logs`.trim())
        .setDescription('This channel records staff moderation actions, member bans/unbans, and automated anti-bot triggers.')
        .addFields(
          { name: '🔨 Member Bans & Unbans', value: 'Logs banned/unbanned user tags, user IDs, staff member, and ban reasons.' },
          { name: '🍯 Honeypot Anti-Bot Security', value: 'Logs unauthorized messages in trap channels and records automatic kicks/bans.' }
        )
        .setFooter({ text: 'Automated Moderation & Security Logging System' });
    } else if (spec.name === 'channel-logs') {
      const checkEmoji = getEmoji(guild, 'check');
      embed.setTitle(`${checkEmoji} 📁 Channel Management Audit Logs`.trim())
        .setDescription('This channel records channel creation, deletion, and structural modification events.')
        .addFields(
          { name: '➕ Channel Created', value: 'Logs new channel name, channel type (Text/Voice/Category), and channel ID.' },
          { name: '➖ Channel Deleted', value: 'Logs removed channel name, channel type, and channel ID.' }
        )
        .setFooter({ text: 'Automated Channel Logging System' });
    } else if (spec.name === 'ticket-logs') {
      const ticketEmoji = getEmoji(guild, 'ticket');
      embed.setTitle(`${ticketEmoji} 🎟️ Support Ticket & Transcript Logs`.trim())
        .setDescription('This channel records support ticket operations and stores ticket transcript records upon closure.')
        .addFields(
          { name: '🎟️ Ticket Activity', value: 'Logs ticket creation, category, assigned staff members, closer tag, and closing reason.' },
          { name: '📄 Ticket Transcripts', value: 'Generates and attaches complete text transcript files for audit records.' }
        )
        .setFooter({ text: 'Automated Ticket Logging System' });
    } else if (spec.name === 'general-logs') {
      const verifiedEmoji = getEmoji(guild, 'verified');
      embed.setTitle(`${verifiedEmoji} 📜 General Server Audit Logs`.trim())
        .setDescription('This channel records general server configuration updates and core system events.')
        .addFields(
          { name: '⚙️ Server Settings', value: 'Logs server configuration updates, module toggles, and system alerts.' }
        )
        .setFooter({ text: 'Automated System Logging Engine' });
    }

    await channel.send({ embeds: [embed] }).catch(() => {});
  } catch (err) {
    console.error(`Failed to send purpose embed in #${channel.name}:`, err.message);
  }
}

/**
 * Creates or fetches the single private "SERVER LOGS" Category and its 5 dedicated log channels:
 * - #message-logs
 * - #mod-logs
 * - #channel-logs
 * - #ticket-logs
 * - #general-logs
 */
async function setupLogCategory(guild) {
  if (!guild || isSettingUpLogs) return null;
  isSettingUpLogs = true;

  try {
    await cleanupDuplicateLogChannels(guild);

    await guild.channels.fetch().catch(() => null);
    const cfg = db.getGuildConfig(guild.id);

    let category = null;
    if (cfg.logCategoryId) {
      category = guild.channels.cache.get(cfg.logCategoryId) || 
                 await guild.channels.fetch(cfg.logCategoryId).catch(() => null);
    }

    if (!category) {
      category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.includes('SERVER LOGS'));
    }

    if (!category) {
      category = await guild.channels.create({
        name: '📁 SERVER LOGS',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel]
          }
        ]
      });
      console.log(`[AUTO-LOGS] Created SERVER LOGS Category in ${guild.name}`);
    }

    const channelSpecs = [
      { key: 'messageLogsId', name: 'message-logs', topic: 'Logs for deleted & edited messages' },
      { key: 'modLogsId', name: 'mod-logs', topic: 'Logs for member bans, unbans, kicks & honeypot alerts' },
      { key: 'channelLogsId', name: 'channel-logs', topic: 'Logs for channel creations & deletions' },
      { key: 'ticketLogsId', name: 'ticket-logs', topic: 'Logs for support ticket creations & transcripts' },
      { key: 'generalLogsId', name: 'general-logs', topic: 'General server audit logs' }
    ];

    const logChannelIds = { ...(cfg.logChannelIds || {}) };

    for (const spec of channelSpecs) {
      let chan = null;
      if (logChannelIds[spec.key]) {
        chan = guild.channels.cache.get(logChannelIds[spec.key]) ||
               await guild.channels.fetch(logChannelIds[spec.key]).catch(() => null);
      }

      if (!chan) {
        chan = guild.channels.cache.find(c => c.isTextBased() && c.parentId === category.id && c.name === spec.name);
      }

      if (!chan) {
        chan = await guild.channels.create({
          name: spec.name,
          type: ChannelType.GuildText,
          parent: category.id,
          topic: spec.topic,
          permissionOverwrites: [
            {
              id: guild.roles.everyone.id,
              deny: [PermissionFlagsBits.ViewChannel]
            }
          ]
        });
        console.log(`[AUTO-LOGS] Created #${spec.name} in category ${category.name}`);
      }

      if (chan) {
        logChannelIds[spec.key] = chan.id;
        await sendChannelPurposeEmbed(guild, chan, spec);
      }
    }

    db.updateGuildConfig(guild.id, {
      logCategoryId: category.id,
      logChannelIds: logChannelIds,
      serverLogChannelId: logChannelIds.generalLogsId || cfg.serverLogChannelId
    });

    return { category, logChannelIds };
  } finally {
    isSettingUpLogs = false;
  }
}

/**
 * Ensures Log Category and specific channels exist for the guild.
 */
async function ensureLogCategory(guild) {
  if (!guild) return null;
  const cfg = db.getGuildConfig(guild.id);

  if (cfg.serverLogsEnabled === false) return null;

  if (!cfg.logCategoryId || !cfg.logChannelIds || !cfg.logChannelIds.messageLogsId) {
    return await setupLogCategory(guild);
  }

  return { logCategoryId: cfg.logCategoryId, logChannelIds: cfg.logChannelIds };
}

/**
 * Route audit logs to their specific dedicated channel in the SERVER LOGS category!
 */
async function sendAuditLog(guild, embed, eventType = null) {
  if (!guild || !embed) return;
  const cfg = db.getGuildConfig(guild.id);

  if (cfg.serverLogsEnabled === false) return;

  const toggles = { ...DEFAULT_LOG_TOGGLES, ...(cfg.logToggles || {}) };
  if (eventType && toggles[eventType] === false) {
    return;
  }

  const logData = await ensureLogCategory(guild);
  if (!logData || !logData.logChannelIds) return;

  const logChannelIds = logData.logChannelIds;
  let targetChannelId = null;

  switch (eventType) {
    case 'messageDeletes':
    case 'messageEdits':
      targetChannelId = logChannelIds.messageLogsId;
      break;
    case 'bans':
    case 'honeypot':
    case 'moderation':
      targetChannelId = logChannelIds.modLogsId;
      break;
    case 'channels':
      targetChannelId = logChannelIds.channelLogsId;
      break;
    case 'tickets':
      targetChannelId = logChannelIds.ticketLogsId;
      break;
    default:
      targetChannelId = logChannelIds.generalLogsId || cfg.serverLogChannelId;
      break;
  }

  if (!targetChannelId) {
    targetChannelId = logChannelIds.generalLogsId || cfg.serverLogChannelId;
  }

  if (targetChannelId) {
    const targetChannel = guild.channels.cache.get(targetChannelId) ||
                          await guild.channels.fetch(targetChannelId).catch(() => null);

    if (targetChannel) {
      targetChannel.send({ embeds: [embed] }).catch(err => {
        console.error(`Failed to send audit log in ${targetChannel.name}:`, err.message);
      });
    }
  }
}

module.exports = {
  DEFAULT_LOG_TOGGLES,
  setupLogCategory,
  ensureLogCategory,
  cleanupDuplicateLogChannels,
  sendAuditLog
};
