const { ChannelType, PermissionFlagsBits } = require('discord.js');
const db = require('../db/database');

// In-memory rate-limit store for stats channel renaming
// guildId -> lastUpdatedTimestamp
const lastStatsUpdate = new Map();

/**
 * Calculate human member count and online member count for a guild (excluding bots).
 */
async function getGuildStats(guild) {
  let members = guild.members.cache;
  if (members.size === 0 || members.size < 5) {
    members = await guild.members.fetch({ withPresences: true }).catch(() => guild.members.cache);
  }
  
  // Total Human Members (excludes bots)
  const humanMembers = members.filter(m => !m.user.bot).size;
  
  // Online Human Members (excludes bots)
  const onlineMembers = members.filter(m => 
    !m.user.bot && 
    m.presence && 
    (m.presence.status === 'online' || m.presence.status === 'idle' || m.presence.status === 'dnd')
  ).size;

  return { totalMembers: humanMembers, onlineMembers };
}

/**
 * Update member count & online count channels for a guild.
 * Handles rate limits (minimum 5 mins interval between channel rename calls).
 */
async function updateStatsChannels(guild, force = false) {
  if (!guild) return;

  const cfg = db.getGuildConfig(guild.id);
  if (!cfg.statsMemberChannelId && !cfg.statsOnlineChannelId) return;

  const now = Date.now();
  const lastUpdate = lastStatsUpdate.get(guild.id) || 0;

  // Enforce 5-minute interval between Discord channel rename requests unless forced
  if (!force && (now - lastUpdate < 300000)) {
    return;
  }

  try {
    const { totalMembers, onlineMembers } = await getGuildStats(guild);

    // Total Members Voice Channel
    if (cfg.statsMemberChannelId) {
      const memberChan = guild.channels.cache.get(cfg.statsMemberChannelId) || 
                         await guild.channels.fetch(cfg.statsMemberChannelId).catch(() => null);
      if (memberChan) {
        // Disconnect any user currently in stats channel
        if (memberChan.members && memberChan.members.size > 0) {
          for (const [, m] of memberChan.members) {
            await m.voice.disconnect('Locked Server Stats Voice Channel').catch(() => {});
          }
        }

        const newName = `Members: ${totalMembers}`;
        if (memberChan.name !== newName) {
          await memberChan.setName(newName).catch(err => console.error('Error setting member count channel name:', err.message));
        }

        // Lock permissions
        await memberChan.permissionOverwrites.edit(guild.roles.everyone, {
          Connect: false,
          Speak: false,
          SendMessages: false,
          UseEmbeddedActivities: false,
          ViewChannel: true
        }).catch(() => {});
      }
    }

    // Online People Voice Channel
    if (cfg.statsOnlineChannelId) {
      const onlineChan = guild.channels.cache.get(cfg.statsOnlineChannelId) || 
                         await guild.channels.fetch(cfg.statsOnlineChannelId).catch(() => null);
      if (onlineChan) {
        // Disconnect any user currently in stats channel
        if (onlineChan.members && onlineChan.members.size > 0) {
          for (const [, m] of onlineChan.members) {
            await m.voice.disconnect('Locked Server Stats Voice Channel').catch(() => {});
          }
        }

        const newName = `Online: ${onlineMembers}`;
        if (onlineChan.name !== newName) {
          await onlineChan.setName(newName).catch(err => console.error('Error setting online count channel name:', err.message));
        }

        // Lock permissions
        await onlineChan.permissionOverwrites.edit(guild.roles.everyone, {
          Connect: false,
          Speak: false,
          SendMessages: false,
          UseEmbeddedActivities: false,
          ViewChannel: true
        }).catch(() => {});
      }
    }

    lastStatsUpdate.set(guild.id, now);
  } catch (err) {
    console.error('Error updating stats channels:', err);
  }
}

/**
 * Create or reuse server stats channels and category.
 */
async function setupStatsChannels(guild, category = null) {
  const { totalMembers, onlineMembers } = await getGuildStats(guild);
  const cfg = db.getGuildConfig(guild.id);

  let targetCategory = category;
  if (!targetCategory && cfg.statsCategoryId) {
    targetCategory = guild.channels.cache.get(cfg.statsCategoryId) || 
                     await guild.channels.fetch(cfg.statsCategoryId).catch(() => null);
  }

  if (!targetCategory) {
    targetCategory = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('stats'));
  }

  if (!targetCategory) {
    targetCategory = await guild.channels.create({
      name: 'Server Stats',
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.Speak
          ],
          allow: [
            PermissionFlagsBits.ViewChannel
          ]
        }
      ]
    });
  }

  // 1. Total Members Voice Channel (Locked)
  let memberChan = null;
  if (cfg.statsMemberChannelId) {
    memberChan = guild.channels.cache.get(cfg.statsMemberChannelId) || 
                 await guild.channels.fetch(cfg.statsMemberChannelId).catch(() => null);
  }
  if (!memberChan) {
    memberChan = await guild.channels.create({
      name: `Members: ${totalMembers}`,
      type: ChannelType.GuildVoice,
      parent: targetCategory.id,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.Speak,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.UseEmbeddedActivities
          ],
          allow: [
            PermissionFlagsBits.ViewChannel
          ]
        }
      ]
    });
  } else {
    await memberChan.permissionOverwrites.edit(guild.roles.everyone, {
      Connect: false,
      Speak: false,
      SendMessages: false,
      UseEmbeddedActivities: false,
      ViewChannel: true
    }).catch(() => {});
  }

  // 2. Online People Voice Channel (Locked)
  let onlineChan = null;
  if (cfg.statsOnlineChannelId) {
    onlineChan = guild.channels.cache.get(cfg.statsOnlineChannelId) || 
                 await guild.channels.fetch(cfg.statsOnlineChannelId).catch(() => null);
  }
  if (!onlineChan) {
    onlineChan = await guild.channels.create({
      name: `Online: ${onlineMembers}`,
      type: ChannelType.GuildVoice,
      parent: targetCategory.id,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.Speak,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.UseEmbeddedActivities
          ],
          allow: [
            PermissionFlagsBits.ViewChannel
          ]
        }
      ]
    });
  } else {
    await onlineChan.permissionOverwrites.edit(guild.roles.everyone, {
      Connect: false,
      Speak: false,
      SendMessages: false,
      UseEmbeddedActivities: false,
      ViewChannel: true
    }).catch(() => {});
  }

  db.updateGuildConfig(guild.id, {
    statsCategoryId: targetCategory.id,
    statsMemberChannelId: memberChan.id,
    statsOnlineChannelId: onlineChan.id
  });

  lastStatsUpdate.set(guild.id, Date.now());

  return { targetCategory, memberChan, onlineChan, totalMembers, onlineMembers };
}

module.exports = {
  getGuildStats,
  updateStatsChannels,
  setupStatsChannels
};
