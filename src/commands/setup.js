const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../db/database');
const config = require('../config');
const { getEmoji, setButtonEmoji } = require('../utils/emojis');
const { enforceOwner } = require('../utils/owner');
const { setupStatsChannels } = require('../utils/statsCounter');
const { DEFAULT_LOG_TOGGLES } = require('../utils/auditLogger');
const { updateBirthdayPanel } = require('../utils/birthdayScheduler');
const { syncServerEmojis } = require('../utils/emojiSync');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure server features (Owner only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('quickstart')
        .setDescription('1-Click complete server auto-setup (Voice, Tickets, Stats, Logs, Birthdays)')
    )
    .addSubcommand(sub =>
      sub.setName('counting_mode')
        .setDescription('Set counting mode')
        .addStringOption(opt =>
          opt.setName('mode')
            .setDescription('Difficulty')
            .setRequired(true)
            .addChoices(
              { name: 'Easy (No resets)', value: 'easy' },
              { name: 'Hard (Resets to 0)', value: 'hard' }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName('reset_counting')
        .setDescription('Reset counting to 0')
    )
    .addSubcommand(sub =>
      sub.setName('logs_autocreate')
        .setDescription('Toggle auto-create #server-logs')
        .addBooleanOption(opt => opt.setName('enabled').setDescription('Enable/Disable').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('logs_event_toggle')
        .setDescription('Toggle log events')
        .addStringOption(opt =>
          opt.setName('event')
            .setDescription('Event type')
            .setRequired(true)
            .addChoices(
              { name: 'Message Deletes', value: 'messageDeletes' },
              { name: 'Message Edits', value: 'messageEdits' },
              { name: 'Bans', value: 'bans' },
              { name: 'Channels', value: 'channels' },
              { name: 'Tickets', value: 'tickets' },
              { name: 'Honeypot', value: 'honeypot' }
            )
        )
        .addBooleanOption(opt => opt.setName('enabled').setDescription('Enable/Disable').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('logs_channel')
        .setDescription('Set audit logs channel')
        .addChannelOption(opt => opt.setName('channel').setDescription('Logs channel').addChannelTypes(ChannelType.GuildText).setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('disable_logs')
        .setDescription('Disable audit logs')
    )
    .addSubcommand(sub =>
      sub.setName('stats_channels')
        .setDescription('Create live server stats channels')
        .addChannelOption(opt => opt.setName('category').setDescription('Category').addChannelTypes(ChannelType.GuildCategory).setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('disable_stats_channels')
        .setDescription('Disable server stats channels')
    )
    .addSubcommand(sub =>
      sub.setName('ai_channel')
        .setDescription('Set AI chat channel')
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText).setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('add_staff_role')
        .setDescription('Add staff role')
        .addRoleOption(opt => opt.setName('role').setDescription('Role').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('remove_staff_role')
        .setDescription('Remove staff role')
        .addRoleOption(opt => opt.setName('role').setDescription('Role').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('list_staff_roles')
        .setDescription('List staff roles')
    )
    .addSubcommand(sub =>
      sub.setName('welcome')
        .setDescription('Set welcome channel & role')
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addRoleOption(opt => opt.setName('role').setDescription('Auto-role').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('voice')
        .setDescription('Set Join-to-Create voice trigger')
        .addChannelOption(opt => opt.setName('trigger_channel').setDescription('Voice channel').addChannelTypes(ChannelType.GuildVoice).setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('counting')
        .setDescription('Set counting channel')
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('minigame_channel')
        .setDescription('Set minigames channel')
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('birthday')
        .setDescription('Set birthday channel (select channel or category to auto-create)')
        .addChannelOption(opt => opt.setName('category').setDescription('Category (auto-creates #birthdays)').addChannelTypes(ChannelType.GuildCategory).setRequired(false))
        .addChannelOption(opt => opt.setName('channel').setDescription('Existing text channel').addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addRoleOption(opt => opt.setName('role').setDescription('Birthday role').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('disable_birthday')
        .setDescription('Disable birthday announcements')
    )
    .addSubcommand(sub =>
      sub.setName('honeypot')
        .setDescription('[Owner] Set honeypot trap channel')
        .addChannelOption(opt => opt.setName('trap_channel').setDescription('Trap channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addStringOption(opt =>
          opt.setName('action')
            .setDescription('Action')
            .addChoices(
              { name: 'Ban', value: 'ban' },
              { name: 'Kick', value: 'kick' },
              { name: 'Timeout', value: 'timeout' }
            )
            .setRequired(false)
        )
        .addChannelOption(opt => opt.setName('log_channel').setDescription('Log channel').addChannelTypes(ChannelType.GuildText).setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('disable_honeypot')
        .setDescription('[Owner] Disable honeypot')
    )
    .addSubcommand(sub =>
      sub.setName('sync_emojis')
        .setDescription('Upload all custom System Bot emojis to this server')
    )
    .addSubcommand(sub =>
      sub.setName('unlock_voice_permissions')
        .setDescription('Force-enable screen sharing & media permissions on all voice channels')
    )
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('View server settings')
    ),

  async execute(interaction) {
    const isAuthorized = await enforceOwner(interaction);
    if (!isAuthorized) return;

    const subcommand = interaction.options.getSubcommand();
    const guild = interaction.guild;

    if (subcommand === 'quickstart') {
      await interaction.deferReply({ ephemeral: true });

      const resultsLog = [];

      // 1. Sync Custom Emojis
      try {
        const emojiRes = await syncServerEmojis(guild, interaction.client);
        resultsLog.push(`• **Custom Emojis**: Synced (${emojiRes.created.length} created, ${emojiRes.skipped.length} existing)`);
      } catch (e) {
        resultsLog.push(`• **Custom Emojis**: Skipped (Checked)`);
      }

      // 2. Setup Server Stats Voice Counters
      try {
        await setupStatsChannels(guild);
        resultsLog.push(`• **Server Stats**: Live Member & Online voice counters created`);
      } catch (e) {
        resultsLog.push(`• **Server Stats**: Failed (${e.message})`);
      }

      // 3. Dynamic Temp Voice Category & Trigger
      try {
        let voiceCat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('voice'));
        if (!voiceCat) {
          voiceCat = await guild.channels.create({
            name: 'COMMUNITY VOICE',
            type: ChannelType.GuildCategory
          });
        }

        let voiceTrigger = guild.channels.cache.find(c => c.type === ChannelType.GuildVoice && c.name.includes('Join To Create'));
        if (!voiceTrigger) {
          voiceTrigger = await guild.channels.create({
            name: '➕│Join To Create',
            type: ChannelType.GuildVoice,
            parent: voiceCat.id,
            permissionOverwrites: [
              {
                id: guild.roles.everyone.id,
                allow: [
                  PermissionFlagsBits.Connect,
                  PermissionFlagsBits.Speak,
                  PermissionFlagsBits.Stream,
                  PermissionFlagsBits.AttachFiles,
                  PermissionFlagsBits.EmbedLinks,
                  PermissionFlagsBits.SendMessages
                ]
              }
            ]
          });
        }

        db.updateGuildConfig(guild.id, {
          tempVoiceTriggerId: voiceTrigger.id,
          tempVoiceCategoryId: voiceCat.id
        });
        resultsLog.push(`• **Temp Voice**: ${voiceTrigger} under **${voiceCat.name}**`);
      } catch (e) {
        resultsLog.push(`• **Temp Voice**: Failed (${e.message})`);
      }

      // 4. Support Tickets Category & Interactive Panel
      try {
        let ticketCat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('ticket'));
        if (!ticketCat) {
          ticketCat = await guild.channels.create({
            name: 'SUPPORT TICKETS',
            type: ChannelType.GuildCategory
          });
        }

        let staffRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'staff' || r.name.toLowerCase().includes('moderator'));
        if (!staffRole) {
          staffRole = await guild.roles.create({
            name: 'Staff',
            color: '#5865F2',
            reason: 'Auto-created support staff role'
          }).catch(() => null);
        }

        let panelChan = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name.includes('open-a-ticket'));
        if (!panelChan) {
          panelChan = await guild.channels.create({
            name: '🎫┃open-a-ticket',
            type: ChannelType.GuildText,
            parent: ticketCat.id,
            topic: 'Click a button below to open a private support ticket'
          });

          const ticketEmoji = getEmoji(guild, 'ticket');
          const bugEmoji = getEmoji(guild, 'bug');
          const staffEmoji = getEmoji(guild, 'staff');
          const giveawayEmoji = getEmoji(guild, 'giveaway');
          const infoEmoji = getEmoji(guild, 'info');

          const panelEmbed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle(`${ticketEmoji} Support Center`.trim())
            .setDescription(`Click a button below to open a ticket with our staff:`)
            .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
            .setTimestamp();

          const row = new ActionRowBuilder().addComponents(
            setButtonEmoji(new ButtonBuilder().setCustomId('ticket_cat_bug').setLabel('Report Bug').setStyle(ButtonStyle.Danger), bugEmoji),
            setButtonEmoji(new ButtonBuilder().setCustomId('ticket_cat_staff').setLabel('Need Staff').setStyle(ButtonStyle.Primary), staffEmoji),
            setButtonEmoji(new ButtonBuilder().setCustomId('ticket_cat_giveaway').setLabel('Claim Giveaway').setStyle(ButtonStyle.Success), giveawayEmoji),
            setButtonEmoji(new ButtonBuilder().setCustomId('ticket_cat_other').setLabel('Other').setStyle(ButtonStyle.Secondary), infoEmoji)
          );

          await panelChan.send({ embeds: [panelEmbed], components: [row] }).catch(() => {});
        }

        db.updateGuildConfig(guild.id, {
          ticketCategoryId: ticketCat.id,
          ticketStaffRoleId: staffRole ? staffRole.id : null,
          ticketStaffRoleIds: staffRole ? [staffRole.id] : []
        });
        resultsLog.push(`• **Tickets**: ${panelChan} under **${ticketCat.name}** with staff role ${staffRole ? `<@&${staffRole.id}>` : 'Admin'}`);
      } catch (e) {
        resultsLog.push(`• **Tickets**: Failed (${e.message})`);
      }

      // 5. Audit Logs Category & Channel
      try {
        let logCat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('server logs'));
        if (!logCat) {
          logCat = await guild.channels.create({
            name: '📁 SERVER LOGS',
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
              {
                id: guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel]
              }
            ]
          });
        }

        let logChan = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === 'audit-logs');
        if (!logChan) {
          logChan = await guild.channels.create({
            name: 'audit-logs',
            type: ChannelType.GuildText,
            parent: logCat.id,
            permissionOverwrites: [
              {
                id: guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel]
              }
            ]
          });
        }

        db.updateGuildConfig(guild.id, { serverLogChannelId: logChan.id });
        resultsLog.push(`• **Audit Logs**: ${logChan} under **${logCat.name}** (Private)`);
      } catch (e) {
        resultsLog.push(`• **Audit Logs**: Failed (${e.message})`);
      }

      // 6. Birthday Celebrations & Role
      try {
        let bdayCat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('celebration'));
        if (!bdayCat) {
          bdayCat = await guild.channels.create({
            name: 'CELEBRATIONS',
            type: ChannelType.GuildCategory
          });
        }

        let bdayChan = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name.includes('birthdays'));
        if (!bdayChan) {
          bdayChan = await guild.channels.create({
            name: '🎉┃birthdays',
            type: ChannelType.GuildText,
            parent: bdayCat.id,
            topic: 'Server Birthday Celebrations'
          });
        }

        let bdayRole = guild.roles.cache.find(r => r.name.toLowerCase().includes('birthday'));
        if (!bdayRole) {
          bdayRole = await guild.roles.create({
            name: '🎉┃Birthday',
            color: '#FF73FA',
            reason: 'Auto-created birthday celebratory role'
          }).catch(() => null);
        }

        db.updateGuildConfig(guild.id, {
          birthdayChannelId: bdayChan.id,
          birthdayRoleId: bdayRole ? bdayRole.id : null
        });

        await updateBirthdayPanel(guild).catch(() => {});
        resultsLog.push(`• **Birthdays**: ${bdayChan} with role ${bdayRole ? `<@&${bdayRole.id}>` : 'None'}`);
      } catch (e) {
        resultsLog.push(`• **Birthdays**: Failed (${e.message})`);
      }

      const verifiedEmoji = getEmoji(guild, 'verified');
      const embed = new EmbedBuilder()
        .setColor(config.successColor)
        .setTitle(`${verifiedEmoji} Quickstart Auto-Setup Complete!`.trim())
        .setDescription(
          `**${guild.name}** has been automatically configured with all core modules:\n\n` +
          resultsLog.join('\n') +
          `\n\n*You can customize any setting at any time using \`/panel\` or the Web Dashboard!*`
        )
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    if (subcommand === 'counting_mode') {
      const mode = interaction.options.getString('mode');
      db.updateGuildConfig(guild.id, { countingMode: mode });

      const checkEmoji = getEmoji(guild, 'check');
      const isEasy = mode === 'easy';
      const embed = new EmbedBuilder()
        .setColor(config.successColor)
        .setTitle(`${checkEmoji} Counting Mode: ${isEasy ? 'Easy' : 'Hard'}`.trim())
        .setDescription(isEasy ? 'Mistakes auto-delete after 8s without resetting score.' : 'Mistakes reset score to 0.');

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === 'reset_counting') {
      const cfg = db.getGuildConfig(guild.id);
      const state = db.getCountingState(guild.id);
      const prevScore = state.currentCount;
      const highScore = state.highScore;

      db.updateCountingState(guild.id, { currentCount: 0, lastUserId: null });

      if (cfg.countingChannelId) {
        const countChannel = guild.channels.cache.get(cfg.countingChannelId) || await guild.channels.fetch(cfg.countingChannelId).catch(() => null);
        if (countChannel) {
          const infoEmoji = getEmoji(guild, 'info');
          const resetEmbed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle(`${infoEmoji} Counting Reset`.trim())
            .setDescription(`Score reset to **0** by ${interaction.user}!\n• Previous: **${prevScore}** | High Score: **${highScore}**\n• Next: **1**`)
            .setTimestamp();

          await countChannel.send({ embeds: [resetEmbed] }).catch(() => {});
        }
      }

      const checkEmoji = getEmoji(guild, 'check');
      const embed = new EmbedBuilder()
        .setColor(config.successColor)
        .setTitle(`${checkEmoji} Counting Score Reset`.trim())
        .setDescription('Count reset to **0**. Next number is **1**.');

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === 'logs_autocreate') {
      const enabled = interaction.options.getBoolean('enabled');
      db.updateGuildConfig(guild.id, { autoCreateLogs: enabled });

      const checkEmoji = getEmoji(guild, 'check');
      const embed = new EmbedBuilder()
        .setColor(config.successColor)
        .setTitle(`${checkEmoji} Auto-Create Logs: ${enabled ? 'ON' : 'OFF'}`.trim());

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === 'logs_event_toggle') {
      const eventType = interaction.options.getString('event');
      const enabled = interaction.options.getBoolean('enabled');

      const cfg = db.getGuildConfig(guild.id);
      const toggles = { ...DEFAULT_LOG_TOGGLES, ...(cfg.logToggles || {}) };
      toggles[eventType] = enabled;

      db.updateGuildConfig(guild.id, { logToggles: toggles });

      const checkEmoji = getEmoji(guild, 'check');
      const embed = new EmbedBuilder()
        .setColor(config.successColor)
        .setTitle(`${checkEmoji} Log Toggle: ${eventType} -> ${enabled ? 'ON' : 'OFF'}`.trim());

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === 'logs_channel') {
      let targetChannel = interaction.options.getChannel('channel');

      if (!targetChannel) {
        targetChannel = await guild.channels.create({
          name: 'server-logs',
          type: ChannelType.GuildText,
          permissionOverwrites: [
            {
              id: guild.roles.everyone.id,
              deny: [PermissionFlagsBits.ViewChannel]
            }
          ]
        });
      }

      db.updateGuildConfig(guild.id, {
        serverLogChannelId: targetChannel.id
      });

      const acceptEmoji = getEmoji(guild, 'Accept');
      const embed = new EmbedBuilder()
        .setColor(config.successColor)
        .setTitle(`${acceptEmoji} Audit Logs Channel Set`.trim())
        .setDescription(`Logs will be sent to ${targetChannel}.`);

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === 'disable_logs') {
      db.updateGuildConfig(guild.id, {
        serverLogChannelId: null
      });

      const denyEmoji = getEmoji(guild, 'Deny');
      const embed = new EmbedBuilder()
        .setColor(config.errorColor)
        .setTitle(`${denyEmoji} Logs Disabled`.trim());

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === 'stats_channels') {
      await interaction.deferReply({ ephemeral: true });

      const category = interaction.options.getChannel('category');
      const { targetCategory, memberChan, onlineChan, totalMembers, onlineMembers } = await setupStatsChannels(guild, category);

      const checkEmoji = getEmoji(guild, 'check');
      const embed = new EmbedBuilder()
        .setColor(config.successColor)
        .setTitle(`${checkEmoji} Stats Channels Created`.trim())
        .setDescription(`• ${memberChan} (\`${totalMembers}\`)\n• ${onlineChan} (\`${onlineMembers}\`)`);

      return interaction.editReply({ embeds: [embed] });
    }

    if (subcommand === 'disable_stats_channels') {
      const cfg = db.getGuildConfig(guild.id);
      if (cfg.statsMemberChannelId) {
        const chan = guild.channels.cache.get(cfg.statsMemberChannelId) || await guild.channels.fetch(cfg.statsMemberChannelId).catch(() => null);
        if (chan) await chan.delete().catch(() => {});
      }
      if (cfg.statsOnlineChannelId) {
        const chan = guild.channels.cache.get(cfg.statsOnlineChannelId) || await guild.channels.fetch(cfg.statsOnlineChannelId).catch(() => null);
        if (chan) await chan.delete().catch(() => {});
      }

      db.updateGuildConfig(guild.id, {
        statsCategoryId: null,
        statsMemberChannelId: null,
        statsOnlineChannelId: null
      });

      const denyEmoji = getEmoji(guild, 'Deny');
      const embed = new EmbedBuilder()
        .setColor(config.errorColor)
        .setTitle(`${denyEmoji} Stats Channels Disabled`.trim());

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === 'ai_channel') {
      const channel = interaction.options.getChannel('channel');

      db.updateGuildConfig(guild.id, {
        aiChannelId: channel ? channel.id : null
      });

      const checkEmoji = getEmoji(guild, 'check');
      const embed = new EmbedBuilder()
        .setColor(config.successColor)
        .setTitle(`${checkEmoji} AI Channel Set`.trim())
        .setDescription(channel ? `AI responses set to ${channel}.` : `AI reset to #general.`);

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === 'add_staff_role') {
      const role = interaction.options.getRole('role');
      const cfg = db.getGuildConfig(guild.id);
      let staffRoleIds = cfg.ticketStaffRoleIds || [];

      if (cfg.ticketStaffRoleId && !staffRoleIds.includes(cfg.ticketStaffRoleId)) {
        staffRoleIds.push(cfg.ticketStaffRoleId);
      }

      const denyEmoji = getEmoji(guild, 'Deny');
      if (staffRoleIds.includes(role.id)) {
        return interaction.reply({ content: `${denyEmoji} Role is already added!`, ephemeral: true });
      }

      staffRoleIds.push(role.id);
      db.updateGuildConfig(guild.id, { ticketStaffRoleIds: staffRoleIds, ticketStaffRoleId: staffRoleIds[0] });

      const staffEmoji = getEmoji(guild, 'staff');
      const embed = new EmbedBuilder()
        .setColor(config.successColor)
        .setTitle(`${staffEmoji} Staff Role Added`.trim())
        .setDescription(`Added ${role} to staff roles.`);

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === 'remove_staff_role') {
      const role = interaction.options.getRole('role');
      const cfg = db.getGuildConfig(guild.id);
      let staffRoleIds = cfg.ticketStaffRoleIds || [];

      if (cfg.ticketStaffRoleId && !staffRoleIds.includes(cfg.ticketStaffRoleId)) {
        staffRoleIds.push(cfg.ticketStaffRoleId);
      }

      const denyEmoji = getEmoji(guild, 'Deny');
      if (!staffRoleIds.includes(role.id)) {
        return interaction.reply({ content: `${denyEmoji} Role not in staff list!`, ephemeral: true });
      }

      staffRoleIds = staffRoleIds.filter(id => id !== role.id);
      db.updateGuildConfig(guild.id, { ticketStaffRoleIds: staffRoleIds, ticketStaffRoleId: staffRoleIds[0] || null });

      const embed = new EmbedBuilder()
        .setColor(config.errorColor)
        .setTitle(`${denyEmoji} Staff Role Removed`.trim())
        .setDescription(`Removed ${role}.`);

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === 'list_staff_roles') {
      const cfg = db.getGuildConfig(guild.id);
      let staffRoleIds = cfg.ticketStaffRoleIds || [];

      if (cfg.ticketStaffRoleId && !staffRoleIds.includes(cfg.ticketStaffRoleId)) {
        staffRoleIds.push(cfg.ticketStaffRoleId);
      }

      if (staffRoleIds.length === 0) {
        const infoEmoji = getEmoji(guild, 'info');
        return interaction.reply({ content: `${infoEmoji} No staff roles configured.`, ephemeral: true });
      }

      const staffEmoji = getEmoji(guild, 'staff');
      const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle(`${staffEmoji} Staff Roles`.trim())
        .setDescription(staffRoleIds.map((id, idx) => `${idx + 1}. <@&${id}>`).join('\n'))
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === 'welcome') {
      const channel = interaction.options.getChannel('channel');
      const role = interaction.options.getRole('role');

      db.updateGuildConfig(guild.id, {
        welcomeChannelId: channel.id,
        welcomeRoleId: role ? role.id : null
      });

      const acceptEmoji = getEmoji(guild, 'Accept');
      const embed = new EmbedBuilder()
        .setColor(config.successColor)
        .setTitle(`${acceptEmoji} Welcome Set`.trim())
        .setDescription(`Channel: ${channel}${role ? ` | Auto-Role: ${role}` : ''}`);

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === 'voice') {
      const triggerChannel = interaction.options.getChannel('trigger_channel');

      db.updateGuildConfig(guild.id, {
        tempVoiceTriggerId: triggerChannel.id,
        tempVoiceCategoryId: triggerChannel.parentId
      });

      const voiceEmoji = getEmoji(guild, 'voice');
      const embed = new EmbedBuilder()
        .setColor(config.successColor)
        .setTitle(`${voiceEmoji} Temp Voice Set`.trim())
        .setDescription(`Trigger: ${triggerChannel}`);

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === 'counting') {
      const channel = interaction.options.getChannel('channel');

      db.updateGuildConfig(guild.id, {
        countingChannelId: channel.id
      });

      const checkEmoji = getEmoji(guild, 'check');
      const embed = new EmbedBuilder()
        .setColor(config.successColor)
        .setTitle(`${checkEmoji} Counting Set`.trim())
        .setDescription(`Channel: ${channel}`);

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === 'minigame_channel') {
      const channel = interaction.options.getChannel('channel');

      db.updateGuildConfig(guild.id, {
        minigameChannelId: channel.id
      });

      const acceptEmoji = getEmoji(guild, 'Accept');
      const embed = new EmbedBuilder()
        .setColor(config.successColor)
        .setTitle(`${acceptEmoji} Minigames Channel Set`.trim())
        .setDescription(`Channel: ${channel}`);

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === 'birthday') {
      let channel = interaction.options.getChannel('channel');
      let category = interaction.options.getChannel('category');
      let role = interaction.options.getRole('role');

      if (!channel) {
        if (!category) {
          category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('birthday')) ||
            await guild.channels.create({ name: 'CELEBRATIONS', type: ChannelType.GuildCategory }).catch(() => null);
        }

        channel = await guild.channels.create({
          name: '🎉┃birthdays',
          type: ChannelType.GuildText,
          parent: category ? category.id : null,
          topic: 'Server Birthday Celebrations'
        });
      }

      if (!role) {
        let bdayRole = guild.roles.cache.find(r => r.name.toLowerCase().includes('birthday'));
        if (!bdayRole) {
          bdayRole = await guild.roles.create({
            name: '🎉┃Birthday',
            color: '#FF73FA',
            reason: 'Auto-created birthday celebratory role'
          }).catch(() => null);
        }
        role = bdayRole;
      }

      db.updateGuildConfig(guild.id, {
        birthdayChannelId: channel.id,
        birthdayRoleId: role ? role.id : null
      });

      await updateBirthdayPanel(guild).catch(() => {});

      const checkEmoji = getEmoji(guild, 'check');
      const embed = new EmbedBuilder()
        .setColor(config.successColor)
        .setTitle(`${checkEmoji} Birthday Announcements Set`.trim())
        .setDescription(`• Channel: ${channel}${category ? ` (Under **${category.name}**)` : ''}\n• Role: ${role ? `<@&${role.id}>` : 'None'}`);

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === 'disable_birthday') {
      db.updateGuildConfig(guild.id, {
        birthdayChannelId: null,
        birthdayRoleId: null
      });

      const denyEmoji = getEmoji(guild, 'Deny');
      const embed = new EmbedBuilder()
        .setColor(config.errorColor)
        .setTitle(`${denyEmoji} Birthday Announcements Disabled`.trim());

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // DANGEROUS: HONEYPOT CONFIG -> OWNER ONLY
    if (subcommand === 'honeypot') {
      const trapChannel = interaction.options.getChannel('trap_channel');
      const action = interaction.options.getString('action') || 'ban';
      const logChannel = interaction.options.getChannel('log_channel');

      db.updateGuildConfig(guild.id, {
        honeypotChannelId: trapChannel.id,
        honeypotAction: action,
        honeypotLogChannelId: logChannel ? logChannel.id : null
      });

      const honeypotEmoji = getEmoji(guild, 'honeypot');
      const embed = new EmbedBuilder()
        .setColor(config.warningColor)
        .setTitle(`${honeypotEmoji} Honeypot Active`.trim())
        .setDescription(`• Trap: ${trapChannel}\n• Action: \`${action.toUpperCase()}\`${logChannel ? `\n• Log: ${logChannel}` : ''}`);

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // DANGEROUS: DISABLE HONEYPOT -> OWNER ONLY
    if (subcommand === 'disable_honeypot') {
      db.updateGuildConfig(guild.id, {
        honeypotChannelId: null,
        honeypotAction: null,
        honeypotLogChannelId: null
      });

      const denyEmoji = getEmoji(guild, 'Deny');
      const embed = new EmbedBuilder()
        .setColor(config.errorColor)
        .setTitle(`${denyEmoji} Honeypot Disabled`.trim());

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === 'sync_emojis') {
      await interaction.deferReply({ ephemeral: true });
      const results = await syncServerEmojis(guild, interaction.client);

      const checkEmoji = getEmoji(guild, 'check');
      const embed = new EmbedBuilder()
        .setColor(config.successColor)
        .setTitle(`${checkEmoji} Custom Emojis Synced`.trim())
        .setDescription(
          `**Created**: ${results.created.length} emojis\n` +
          `**Already Present**: ${results.skipped.length} emojis\n` +
          (results.errors.length > 0 ? `**Errors**: ${results.errors.length} (Check bot permissions / emoji slots)` : '')
        );

      return interaction.editReply({ embeds: [embed] });
    }

    if (subcommand === 'unlock_voice_permissions') {
      await interaction.deferReply({ ephemeral: true });

      const voiceChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice);
      let updatedCount = 0;

      for (const [, vc] of voiceChannels) {
        try {
          await vc.permissionOverwrites.edit(guild.roles.everyone, {
            Connect: true,
            Speak: true,
            Stream: true,
            AttachFiles: true,
            EmbedLinks: true,
            SendMessages: true,
            SendMessagesInThreads: true,
            ReadMessageHistory: true,
            UseExternalEmojis: true,
            AddReactions: true
          });
          updatedCount++;
        } catch (err) {}
      }

      const checkEmoji = getEmoji(guild, 'check');
      const voiceEmoji = getEmoji(guild, 'voice');
      const embed = new EmbedBuilder()
        .setColor(config.successColor)
        .setTitle(`${checkEmoji} Voice Permissions Unlocked`.trim())
        .setDescription(
          `**Screen Sharing & Media Permissions Forced:**\n\n` +
          `• **Screen Share / Video (Go Live)**: Enabled\n` +
          `• **Send Screenshots & Attach Files**: Enabled\n` +
          `• **Embed Links & Text Chat**: Enabled\n\n` +
          `Updated **${updatedCount}** voice channels across **${guild.name}**!`
        );

      return interaction.editReply({ embeds: [embed] });
    }

    if (subcommand === 'status') {
      const cfg = db.getGuildConfig(guild.id);
      const countState = db.getCountingState(guild.id);
      let staffRoleIds = cfg.ticketStaffRoleIds || [];
      if (cfg.ticketStaffRoleId && !staffRoleIds.includes(cfg.ticketStaffRoleId)) {
        staffRoleIds.push(cfg.ticketStaffRoleId);
      }

      const voiceEmoji = getEmoji(guild, 'voice');
      const staffEmoji = getEmoji(guild, 'staff');
      const honeypotEmoji = getEmoji(guild, 'honeypot');
      const verifiedEmoji = getEmoji(guild, 'verified');

      const autoCreateText = cfg.autoCreateLogs !== false ? 'Auto-Create ON' : 'Auto-Create OFF';
      const logStatus = cfg.serverLogChannelId ? `<#${cfg.serverLogChannelId}> (${autoCreateText})` : `None (${autoCreateText})`;
      const countMode = cfg.countingMode === 'hard' ? 'Hard Mode' : 'Easy Mode';

      const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle(`${verifiedEmoji} Settings: ${guild.name}`.trim())
        .addFields(
          { name: 'AI Chat', value: cfg.aiChannelId ? `<#${cfg.aiChannelId}>` : '#general', inline: true },
          { name: 'Audit Logs', value: logStatus, inline: true },
          { name: 'Welcome', value: cfg.welcomeChannelId ? `<#${cfg.welcomeChannelId}>` : 'None', inline: true },
          { name: 'Auto Role', value: cfg.welcomeRoleId ? `<@&${cfg.welcomeRoleId}>` : 'None', inline: true },
          { name: `${staffEmoji} Staff Roles`.trim(), value: staffRoleIds.length > 0 ? staffRoleIds.map(id => `<@&${id}>`).join(', ') : 'None', inline: true },
          { name: `${voiceEmoji} Temp Voice`.trim(), value: cfg.tempVoiceTriggerId ? `<#${cfg.tempVoiceTriggerId}>` : 'None', inline: true },
          { name: 'Stats Channels', value: cfg.statsMemberChannelId ? `<#${cfg.statsMemberChannelId}>` : 'None', inline: true },
          { name: 'Counting', value: cfg.countingChannelId ? `<#${cfg.countingChannelId}> (${countMode})` : 'None', inline: true },
          { name: 'Minigames', value: cfg.minigameChannelId ? `<#${cfg.minigameChannelId}>` : 'Any channel', inline: true },
          { name: 'Birthdays', value: cfg.birthdayChannelId ? `<#${cfg.birthdayChannelId}>` : 'None', inline: true },
          { name: 'High Score', value: `${countState.highScore} (Count: ${countState.currentCount})`, inline: true },
          { name: `${honeypotEmoji} Honeypot`.trim(), value: cfg.honeypotChannelId ? `<#${cfg.honeypotChannelId}> (${(cfg.honeypotAction || 'ban').toUpperCase()})` : 'Off', inline: true }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
};
