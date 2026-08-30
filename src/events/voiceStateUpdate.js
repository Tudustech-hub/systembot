const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../db/database');
const config = require('../config');
const { getEmoji, setButtonEmoji } = require('../utils/emojis');

// Helper: Build Control Panel Embed & Rows for Dynamic Voice Channel
function createVoiceControlPanel(guild, member, isPrivate = false) {
  const voiceEmoji = getEmoji(guild, 'voice');
  const lockEmoji = getEmoji(guild, 'lock');
  const unlockEmoji = getEmoji(guild, 'unlock');
  const usersEmoji = getEmoji(guild, 'users');

  const embed = new EmbedBuilder()
    .setColor(isPrivate ? config.errorColor : config.successColor)
    .setTitle(`${voiceEmoji} Room Control Center — ${member.displayName}'s Room`.trim())
    .setDescription(
      `Welcome ${member} to your temporary voice room!\n\n` +
      `**Current Room Privacy:** ${isPrivate ? `${lockEmoji} **PRIVATE**` : `${unlockEmoji} **PUBLIC**`}\n\n` +
      `${lockEmoji} **Make Private** — Lock your room so only you and invited members can join.\n` +
      `${unlockEmoji} **Make Public** — Open your room for everyone in the server.\n\n` +
      `**Invite Friends**: **REPLY to this message** and tag them (**@person**) to grant them permission to join!`
    )
    .setFooter({ text: `${guild.name} • Dynamic Voice Room Controls` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    setButtonEmoji(new ButtonBuilder().setCustomId('voice_btn_private').setLabel('Make Private').setStyle(isPrivate ? ButtonStyle.Secondary : ButtonStyle.Danger), lockEmoji),
    setButtonEmoji(new ButtonBuilder().setCustomId('voice_btn_public').setLabel('Make Public').setStyle(isPrivate ? ButtonStyle.Success : ButtonStyle.Secondary), unlockEmoji),
    setButtonEmoji(new ButtonBuilder().setCustomId('voice_btn_allowed').setLabel('Allowed Members').setStyle(ButtonStyle.Primary), usersEmoji)
  );

  return { embed, rows: [row] };
}

module.exports = {
  createVoiceControlPanel,
  name: 'voiceStateUpdate',
  async execute(oldState, newState) {
    const guild = newState.guild || oldState.guild;
    const member = newState.member || oldState.member;
    const guildConfig = db.getGuildConfig(guild.id);

    const triggerChannelId = guildConfig.tempVoiceTriggerId;
    const tempVoices = db.getTempVoiceChannels();

    // 0. Auto-Disconnect anyone attempting to join locked Server Stats channels
    if (newState.channelId && (newState.channelId === guildConfig.statsMemberChannelId || newState.channelId === guildConfig.statsOnlineChannelId)) {
      if (member && member.voice) {
        await member.voice.disconnect('Locked Server Stats Voice Channel').catch(() => {});
      }
      return;
    }

    // 1. User Joined the "Join to Create" trigger channel
    if (newState.channelId && newState.channelId === triggerChannelId) {
      try {
        const triggerChannel = newState.channel;
        const parentCategory = triggerChannel.parentId;

        const newChannelName = `${member.user.username}'s Room`;

        // Create the new temporary voice channel with full screen share, media, and voice chat permissions
        const newVoiceChannel = await guild.channels.create({
          name: newChannelName,
          type: ChannelType.GuildVoice,
          parent: parentCategory || null,
          permissionOverwrites: [
            {
              id: guild.roles.everyone.id,
              allow: [
                PermissionFlagsBits.Connect,
                PermissionFlagsBits.Speak,
                PermissionFlagsBits.Stream,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.SendMessagesInThreads,
                PermissionFlagsBits.UseExternalEmojis,
                PermissionFlagsBits.UseExternalStickers,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AddReactions,
                PermissionFlagsBits.UseApplicationCommands,
                PermissionFlagsBits.ViewChannel
              ]
            },
            {
              id: member.id,
              allow: [
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.MuteMembers,
                PermissionFlagsBits.DeafenMembers,
                PermissionFlagsBits.MoveMembers,
                PermissionFlagsBits.Connect,
                PermissionFlagsBits.Speak,
                PermissionFlagsBits.Stream,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.SendMessagesInThreads,
                PermissionFlagsBits.UseExternalEmojis,
                PermissionFlagsBits.UseExternalStickers,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AddReactions,
                PermissionFlagsBits.UseApplicationCommands,
                PermissionFlagsBits.ViewChannel
              ]
            }
          ]
        });

        // Save channel to DB (default: public)
        db.addTempVoiceChannel(newVoiceChannel.id, guild.id, member.id, false);

        // Move member to the new dynamic voice channel
        await member.voice.setChannel(newVoiceChannel);

        // Send Room Control Panel inside the voice channel's text chat
        const { embed, rows } = createVoiceControlPanel(guild, member, false);
        await newVoiceChannel.send({ embeds: [embed], components: rows }).catch(() => {});

      } catch (err) {
        console.error('Error creating dynamic voice channel:', err);
      }
    }

    // 2. Check if a dynamic temporary channel was left and is now empty
    if (oldState.channelId && oldState.channelId !== newState.channelId) {
      const leftChannelId = oldState.channelId;
      const isTempChannel = tempVoices.some(v => v.channelId === leftChannelId);

      if (isTempChannel) {
        const oldChannel = oldState.channel || guild.channels.cache.get(leftChannelId);

        if (oldChannel && oldChannel.members.size === 0) {
          try {
            db.removeTempVoiceChannel(leftChannelId);
            await oldChannel.delete('Dynamic voice channel emptied');
          } catch (err) {
            console.error(`Failed to delete empty temp voice channel ${leftChannelId}:`, err);
          }
        }
      }
    }
  }
};
