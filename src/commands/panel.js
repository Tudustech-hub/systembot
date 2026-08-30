const { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  StringSelectMenuOptionBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ButtonBuilder, 
  ButtonStyle, 
  ChannelType 
} = require('discord.js');
const db = require('../db/database');
const config = require('../config');
const { getEmoji, setButtonEmoji } = require('../utils/emojis');
const { enforceOwner } = require('../utils/owner');
const { setupStatsChannels } = require('../utils/statsCounter');
const { DEFAULT_LOG_TOGGLES } = require('../utils/auditLogger');
const { updateBirthdayPanel } = require('../utils/birthdayScheduler');

// Helper: Build Main Overview Embed & Component Rows for /panel
function buildOverviewPanel(guild) {
  const cfg = db.getGuildConfig(guild.id);

  let staffRoleIds = cfg.ticketStaffRoleIds || [];
  if (cfg.ticketStaffRoleId && !staffRoleIds.includes(cfg.ticketStaffRoleId)) {
    staffRoleIds.push(cfg.ticketStaffRoleId);
  }

  const verifiedEmoji = getEmoji(guild, 'verified');
  const staffEmoji = getEmoji(guild, 'staff');
  const voiceEmoji = getEmoji(guild, 'voice');
  const honeypotEmoji = getEmoji(guild, 'honeypot');

  const autoCreateStatus = cfg.autoCreateLogs !== false ? 'Auto-Create ON' : 'Auto-Create OFF';
  const logChanText = cfg.serverLogChannelId ? `<#${cfg.serverLogChannelId}>` : `None (${autoCreateStatus})`;
  const countMode = cfg.countingMode === 'hard' ? 'Hard Mode' : 'Easy Mode';

  const embed = new EmbedBuilder()
    .setColor(config.embedColor)
    .setTitle(`${verifiedEmoji} Control Panel — ${guild.name}`.trim())
    .setDescription('Select a setting from the menu below to configure:')
    .addFields(
      { name: 'AI Chat', value: cfg.aiChannelId ? `<#${cfg.aiChannelId}>` : '#general', inline: true },
      { name: 'Audit Logs', value: logChanText, inline: true },
      { name: 'Welcome', value: cfg.welcomeChannelId ? `<#${cfg.welcomeChannelId}>` : 'None', inline: true },
      { name: 'Auto Role', value: cfg.welcomeRoleId ? `<@&${cfg.welcomeRoleId}>` : 'None', inline: true },
      { name: `${staffEmoji} Staff Roles`.trim(), value: staffRoleIds.length > 0 ? staffRoleIds.map(id => `<@&${id}>`).join(', ') : 'None', inline: true },
      { name: `${voiceEmoji} Temp Voice`.trim(), value: cfg.tempVoiceTriggerId ? `<#${cfg.tempVoiceTriggerId}>` : 'None', inline: true },
      { name: 'Stats Channels', value: cfg.statsMemberChannelId ? `<#${cfg.statsMemberChannelId}>` : 'None', inline: true },
      { name: 'Counting', value: cfg.countingChannelId ? `<#${cfg.countingChannelId}> (${countMode})` : 'None', inline: true },
      { name: 'Minigames', value: cfg.minigameChannelId ? `<#${cfg.minigameChannelId}>` : 'Any channel', inline: true },
      { name: 'Birthdays', value: cfg.birthdayChannelId ? `<#${cfg.birthdayChannelId}>` : 'None', inline: true },
      { name: `${honeypotEmoji} Honeypot`.trim(), value: cfg.honeypotChannelId ? `<#${cfg.honeypotChannelId}> (${(cfg.honeypotAction || 'ban').toUpperCase()})` : 'Off', inline: true }
    )
    .setTimestamp();

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('panel_module_select')
    .setPlaceholder('Choose a module to configure...')
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('AI Chat').setValue('module_ai').setDescription('AI response channel'),
      new StringSelectMenuOptionBuilder().setLabel('Audit Logs & Toggles').setValue('module_logs').setDescription('Logs channel & event toggles'),
      new StringSelectMenuOptionBuilder().setLabel('Stats Channels').setValue('module_stats').setDescription('Live member counter channels'),
      new StringSelectMenuOptionBuilder().setLabel('Welcome & Auto-Role').setValue('module_welcome').setDescription('Welcome channel & auto-role'),
      new StringSelectMenuOptionBuilder().setLabel('Temp Voice').setValue('module_voice').setDescription('Join-to-create voice channels'),
      new StringSelectMenuOptionBuilder().setLabel('Tickets & Staff').setValue('module_tickets').setDescription('Ticket category & staff roles'),
      new StringSelectMenuOptionBuilder().setLabel('Counting Game').setValue('module_counting').setDescription('Counting channel & mode'),
      new StringSelectMenuOptionBuilder().setLabel('Minigames').setValue('module_minigames').setDescription('Minigames channel'),
      new StringSelectMenuOptionBuilder().setLabel('Birthdays').setValue('module_birthdays').setDescription('Birthday channel & role'),
      new StringSelectMenuOptionBuilder().setLabel('Honeypot Security').setValue('module_honeypot').setDescription('Anti-raid trap channel')
    );

  const row1 = new ActionRowBuilder().addComponents(selectMenu);

  const refreshBtn = new ButtonBuilder()
    .setCustomId('panel_btn_refresh')
    .setLabel('Refresh')
    .setStyle(ButtonStyle.Secondary);

  setButtonEmoji(refreshBtn, getEmoji(guild, 'check'));

  const row2 = new ActionRowBuilder().addComponents(refreshBtn);

  return { embeds: [embed], components: [row1, row2] };
}

// Helper: Render Audit Log Module Settings View with Toggles
function renderLogsModuleView(guild) {
  const cfg = db.getGuildConfig(guild.id);
  const autoCreateState = cfg.autoCreateLogs !== false;
  const toggles = { ...DEFAULT_LOG_TOGGLES, ...(cfg.logToggles || {}) };

  const embed = new EmbedBuilder()
    .setColor(config.embedColor)
    .setTitle('Audit Logs Settings')
    .setDescription(
      `• **Channel:** ${cfg.serverLogChannelId ? `<#${cfg.serverLogChannelId}>` : '**None**'}\n` +
      `• **Auto-Create:** \`${autoCreateState ? 'ON' : 'OFF'}\`\n\n` +
      `**Event Toggles:**\n` +
      `• Deletes: \`${toggles.messageDeletes ? 'ON' : 'OFF'}\` | Edits: \`${toggles.messageEdits ? 'ON' : 'OFF'}\`\n` +
      `• Bans: \`${toggles.bans ? 'ON' : 'OFF'}\` | Channels: \`${toggles.channels ? 'ON' : 'OFF'}\`\n` +
      `• Tickets: \`${toggles.tickets ? 'ON' : 'OFF'}\` | Honeypot: \`${toggles.honeypot ? 'ON' : 'OFF'}\``
    )
    .setTimestamp();

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId('panel_set_logs_channel')
    .setPlaceholder('Select Logs Channel...')
    .setChannelTypes(ChannelType.GuildText);

  const autoCreateBtn = new ButtonBuilder()
    .setCustomId('panel_toggle_autocreate')
    .setLabel(`Auto-Create: ${autoCreateState ? 'ON' : 'OFF'}`)
    .setStyle(autoCreateState ? ButtonStyle.Success : ButtonStyle.Secondary);

  const toggleMsgDelBtn = new ButtonBuilder()
    .setCustomId('panel_toggle_event_messageDeletes')
    .setLabel(`Deletes: ${toggles.messageDeletes ? 'ON' : 'OFF'}`)
    .setStyle(toggles.messageDeletes ? ButtonStyle.Success : ButtonStyle.Secondary);

  const toggleMsgEditBtn = new ButtonBuilder()
    .setCustomId('panel_toggle_event_messageEdits')
    .setLabel(`Edits: ${toggles.messageEdits ? 'ON' : 'OFF'}`)
    .setStyle(toggles.messageEdits ? ButtonStyle.Success : ButtonStyle.Secondary);

  const toggleBansBtn = new ButtonBuilder()
    .setCustomId('panel_toggle_event_bans')
    .setLabel(`Bans: ${toggles.bans ? 'ON' : 'OFF'}`)
    .setStyle(toggles.bans ? ButtonStyle.Success : ButtonStyle.Secondary);

  const toggleChannelsBtn = new ButtonBuilder()
    .setCustomId('panel_toggle_event_channels')
    .setLabel(`Channels: ${toggles.channels ? 'ON' : 'OFF'}`)
    .setStyle(toggles.channels ? ButtonStyle.Success : ButtonStyle.Secondary);

  const backBtn = new ButtonBuilder()
    .setCustomId('panel_btn_back')
    .setLabel('Back')
    .setStyle(ButtonStyle.Secondary);

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(channelSelect),
      new ActionRowBuilder().addComponents(autoCreateBtn, toggleMsgDelBtn, toggleMsgEditBtn),
      new ActionRowBuilder().addComponents(toggleBansBtn, toggleChannelsBtn, backBtn)
    ]
  };
}

// Helper: Render Counting Module View
function renderCountingModuleView(guild) {
  const cfg = db.getGuildConfig(guild.id);
  const state = db.getCountingState(guild.id);
  const isEasyMode = cfg.countingMode !== 'hard';
  const allowSolo = cfg.countingAllowSolo === true;

  const embed = new EmbedBuilder()
    .setColor(config.embedColor)
    .setTitle('Counting Settings')
    .setDescription(
      `• **Channel:** ${cfg.countingChannelId ? `<#${cfg.countingChannelId}>` : '**None**'}\n` +
      `• **Mode:** \`${isEasyMode ? 'Easy Mode (No Resets)' : 'Hard Mode (Strict Resets)'}\`\n` +
      `• **Solo Counting:** \`${allowSolo ? 'Allowed' : 'Alternating Only'}\`\n` +
      `• **Current:** \`${state.currentCount}\` | **High Score:** \`${state.highScore}\``
    )
    .setTimestamp();

  const chanSelect = new ChannelSelectMenuBuilder()
    .setCustomId('panel_set_counting_channel')
    .setPlaceholder('Select Counting Channel...')
    .setChannelTypes(ChannelType.GuildText);

  const toggleModeBtn = new ButtonBuilder()
    .setCustomId('panel_toggle_counting_mode')
    .setLabel(`Mode: ${isEasyMode ? 'Easy' : 'Hard'}`)
    .setStyle(isEasyMode ? ButtonStyle.Success : ButtonStyle.Danger);

  const toggleSoloBtn = new ButtonBuilder()
    .setCustomId('panel_toggle_counting_solo')
    .setLabel(`Solo: ${allowSolo ? 'ON' : 'OFF'}`)
    .setStyle(allowSolo ? ButtonStyle.Primary : ButtonStyle.Secondary);

  const resetCountBtn = new ButtonBuilder()
    .setCustomId('panel_reset_count')
    .setLabel('Reset to 0')
    .setStyle(ButtonStyle.Secondary);

  const backBtn = new ButtonBuilder()
    .setCustomId('panel_btn_back')
    .setLabel('Back')
    .setStyle(ButtonStyle.Secondary);

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(chanSelect),
      new ActionRowBuilder().addComponents(toggleModeBtn, toggleSoloBtn),
      new ActionRowBuilder().addComponents(resetCountBtn, backBtn)
    ]
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Server Control Panel (Owner only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const isAuthorized = await enforceOwner(interaction);
    if (!isAuthorized) return;

    const guild = interaction.guild;
    const panelData = buildOverviewPanel(guild);
    return interaction.reply({ ...panelData, ephemeral: true });
  },

  // Component Interaction Handlers
  async handleSelectMenu(interaction) {
    const isAuthorized = await enforceOwner(interaction);
    if (!isAuthorized) return;

    const customId = interaction.customId;
    const guild = interaction.guild;
    const cfg = db.getGuildConfig(guild.id);

    // --- A. MAIN MODULE SELECTION ---
    if (customId === 'panel_module_select') {
      const selectedModule = interaction.values[0];

      if (selectedModule === 'module_ai') {
        const embed = new EmbedBuilder()
          .setColor(config.embedColor)
          .setTitle('AI Chat Settings')
          .setDescription(`• **Current Channel:** ${cfg.aiChannelId ? `<#${cfg.aiChannelId}>` : '**#general**'}\n\nSelect a text channel below:`)
          .setTimestamp();

        const channelSelect = new ChannelSelectMenuBuilder()
          .setCustomId('panel_set_ai_channel')
          .setPlaceholder('Select AI Channel...')
          .setChannelTypes(ChannelType.GuildText);

        const resetBtn = new ButtonBuilder()
          .setCustomId('panel_reset_ai_channel')
          .setLabel('Reset to #general')
          .setStyle(ButtonStyle.Danger);

        const backBtn = new ButtonBuilder()
          .setCustomId('panel_btn_back')
          .setLabel('Back')
          .setStyle(ButtonStyle.Secondary);

        return interaction.update({
          embeds: [embed],
          components: [
            new ActionRowBuilder().addComponents(channelSelect),
            new ActionRowBuilder().addComponents(resetBtn, backBtn)
          ]
        });
      }

      if (selectedModule === 'module_logs') {
        const logsView = renderLogsModuleView(guild);
        return interaction.update(logsView);
      }

      if (selectedModule === 'module_stats') {
        const isEnabled = !!cfg.statsMemberChannelId;
        const embed = new EmbedBuilder()
          .setColor(config.embedColor)
          .setTitle('Server Stats Channels')
          .setDescription(
            `• **Status:** ${isEnabled ? `Enabled (<#${cfg.statsMemberChannelId}>)` : '**Disabled**'}\n` +
            `Creates locked voice channels showing live member counts.`
          )
          .setTimestamp();

        const enableBtn = new ButtonBuilder()
          .setCustomId('panel_enable_stats')
          .setLabel('Enable Stats')
          .setStyle(ButtonStyle.Success);

        const disableBtn = new ButtonBuilder()
          .setCustomId('panel_disable_stats')
          .setLabel('Disable Stats')
          .setStyle(ButtonStyle.Danger);

        const backBtn = new ButtonBuilder()
          .setCustomId('panel_btn_back')
          .setLabel('Back')
          .setStyle(ButtonStyle.Secondary);

        return interaction.update({
          embeds: [embed],
          components: [
            new ActionRowBuilder().addComponents(enableBtn, disableBtn, backBtn)
          ]
        });
      }

      if (selectedModule === 'module_welcome') {
        const embed = new EmbedBuilder()
          .setColor(config.embedColor)
          .setTitle('Welcome Settings')
          .setDescription(`• **Channel:** ${cfg.welcomeChannelId ? `<#${cfg.welcomeChannelId}>` : '**None**'}\n• **Auto-Role:** ${cfg.welcomeRoleId ? `<@&${cfg.welcomeRoleId}>` : '**None**'}`)
          .setTimestamp();

        const chanSelect = new ChannelSelectMenuBuilder()
          .setCustomId('panel_set_welcome_channel')
          .setPlaceholder('Select Welcome Channel...')
          .setChannelTypes(ChannelType.GuildText);

        const roleSelect = new RoleSelectMenuBuilder()
          .setCustomId('panel_set_welcome_role')
          .setPlaceholder('Select Auto-Role...');

        const backBtn = new ButtonBuilder()
          .setCustomId('panel_btn_back')
          .setLabel('Back')
          .setStyle(ButtonStyle.Secondary);

        return interaction.update({
          embeds: [embed],
          components: [
            new ActionRowBuilder().addComponents(chanSelect),
            new ActionRowBuilder().addComponents(roleSelect),
            new ActionRowBuilder().addComponents(backBtn)
          ]
        });
      }

      if (selectedModule === 'module_voice') {
        const embed = new EmbedBuilder()
          .setColor(config.embedColor)
          .setTitle('Temp Voice Settings')
          .setDescription(`• **Trigger Channel:** ${cfg.tempVoiceTriggerId ? `<#${cfg.tempVoiceTriggerId}>` : '**None**'}`)
          .setTimestamp();

        const voiceSelect = new ChannelSelectMenuBuilder()
          .setCustomId('panel_set_voice_trigger')
          .setPlaceholder('Select Trigger Channel...')
          .setChannelTypes(ChannelType.GuildVoice);

        const backBtn = new ButtonBuilder()
          .setCustomId('panel_btn_back')
          .setLabel('Back')
          .setStyle(ButtonStyle.Secondary);

        return interaction.update({
          embeds: [embed],
          components: [
            new ActionRowBuilder().addComponents(voiceSelect),
            new ActionRowBuilder().addComponents(backBtn)
          ]
        });
      }

      if (selectedModule === 'module_tickets') {
        let staffRoleIds = cfg.ticketStaffRoleIds || [];
        if (cfg.ticketStaffRoleId && !staffRoleIds.includes(cfg.ticketStaffRoleId)) {
          staffRoleIds.push(cfg.ticketStaffRoleId);
        }

        const embed = new EmbedBuilder()
          .setColor(config.embedColor)
          .setTitle('Ticket Settings')
          .setDescription(`• **Category:** ${cfg.ticketCategoryId ? `<#${cfg.ticketCategoryId}>` : '**None**'}\n• **Staff Roles:** ${staffRoleIds.length > 0 ? staffRoleIds.map(id => `<@&${id}>`).join(', ') : '**None**'}`)
          .setTimestamp();

        const roleSelect = new RoleSelectMenuBuilder()
          .setCustomId('panel_add_staff_role')
          .setPlaceholder('Add Staff Role...');

        const backBtn = new ButtonBuilder()
          .setCustomId('panel_btn_back')
          .setLabel('Back')
          .setStyle(ButtonStyle.Secondary);

        return interaction.update({
          embeds: [embed],
          components: [
            new ActionRowBuilder().addComponents(roleSelect),
            new ActionRowBuilder().addComponents(backBtn)
          ]
        });
      }

      if (selectedModule === 'module_counting') {
        const countingView = renderCountingModuleView(guild);
        return interaction.update(countingView);
      }

      if (selectedModule === 'module_minigames') {
        const embed = new EmbedBuilder()
          .setColor(config.embedColor)
          .setTitle('Minigames Settings')
          .setDescription(`• **Restricted Channel:** ${cfg.minigameChannelId ? `<#${cfg.minigameChannelId}>` : '**Any channel**'}`)
          .setTimestamp();

        const chanSelect = new ChannelSelectMenuBuilder()
          .setCustomId('panel_set_minigame_channel')
          .setPlaceholder('Select Minigames Channel...')
          .setChannelTypes(ChannelType.GuildText);

        const backBtn = new ButtonBuilder()
          .setCustomId('panel_btn_back')
          .setLabel('Back')
          .setStyle(ButtonStyle.Secondary);

        return interaction.update({
          embeds: [embed],
          components: [
            new ActionRowBuilder().addComponents(chanSelect),
            new ActionRowBuilder().addComponents(backBtn)
          ]
        });
      }

      if (selectedModule === 'module_birthdays') {
        const embed = new EmbedBuilder()
          .setColor(config.embedColor)
          .setTitle('Birthday Settings')
          .setDescription(
            `• **Channel:** ${cfg.birthdayChannelId ? `<#${cfg.birthdayChannelId}>` : '**None**'}\n` +
            `• **Birthday Role:** ${cfg.birthdayRoleId ? `<@&${cfg.birthdayRoleId}>` : '**None**'}\n\n` +
            `*Select a category to auto-create \`#birthdays\`, or choose an existing channel:*`
          )
          .setTimestamp();

        const categorySelect = new ChannelSelectMenuBuilder()
          .setCustomId('panel_set_birthday_category')
          .setPlaceholder('Select Category (Auto-creates #birthdays)...')
          .setChannelTypes(ChannelType.GuildCategory);

        const chanSelect = new ChannelSelectMenuBuilder()
          .setCustomId('panel_set_birthday_channel')
          .setPlaceholder('Or Select Existing Text Channel...')
          .setChannelTypes(ChannelType.GuildText);

        const roleSelect = new RoleSelectMenuBuilder()
          .setCustomId('panel_set_birthday_role')
          .setPlaceholder('Select Birthday Role...');

        const autoCreateBtn = new ButtonBuilder()
          .setCustomId('panel_autocreate_birthday')
          .setLabel('Auto-Create 🎉┃birthdays')
          .setStyle(ButtonStyle.Success);

        const disableBtn = new ButtonBuilder()
          .setCustomId('panel_disable_birthday')
          .setLabel('Disable')
          .setStyle(ButtonStyle.Danger);

        const backBtn = new ButtonBuilder()
          .setCustomId('panel_btn_back')
          .setLabel('Back')
          .setStyle(ButtonStyle.Secondary);

        return interaction.update({
          embeds: [embed],
          components: [
            new ActionRowBuilder().addComponents(categorySelect),
            new ActionRowBuilder().addComponents(chanSelect),
            new ActionRowBuilder().addComponents(roleSelect),
            new ActionRowBuilder().addComponents(autoCreateBtn, disableBtn, backBtn)
          ]
        });
      }

      if (selectedModule === 'module_honeypot') {
        const embed = new EmbedBuilder()
          .setColor(config.embedColor)
          .setTitle('Honeypot Settings')
          .setDescription(`• **Trap Channel:** ${cfg.honeypotChannelId ? `<#${cfg.honeypotChannelId}>` : '**Off**'}\n• **Action:** \`${(cfg.honeypotAction || 'ban').toUpperCase()}\``)
          .setTimestamp();

        const chanSelect = new ChannelSelectMenuBuilder()
          .setCustomId('panel_set_honeypot_channel')
          .setPlaceholder('Select Honeypot Channel...')
          .setChannelTypes(ChannelType.GuildText);

        const disableBtn = new ButtonBuilder()
          .setCustomId('panel_disable_honeypot')
          .setLabel('Disable')
          .setStyle(ButtonStyle.Danger);

        const backBtn = new ButtonBuilder()
          .setCustomId('panel_btn_back')
          .setLabel('Back')
          .setStyle(ButtonStyle.Secondary);

        return interaction.update({
          embeds: [embed],
          components: [
            new ActionRowBuilder().addComponents(chanSelect),
            new ActionRowBuilder().addComponents(disableBtn, backBtn)
          ]
        });
      }
    }

    // --- B. CHANNEL / ROLE SELECTOR PICKERS ---
    if (customId === 'panel_set_ai_channel') {
      const selectedChanId = interaction.values[0];
      db.updateGuildConfig(guild.id, { aiChannelId: selectedChanId });
      const panelData = buildOverviewPanel(guild);
      return interaction.update(panelData);
    }

    if (customId === 'panel_set_logs_channel') {
      const selectedChanId = interaction.values[0];
      db.updateGuildConfig(guild.id, { serverLogChannelId: selectedChanId });
      const logsView = renderLogsModuleView(guild);
      return interaction.update(logsView);
    }

    if (customId === 'panel_set_welcome_channel') {
      const selectedChanId = interaction.values[0];
      db.updateGuildConfig(guild.id, { welcomeChannelId: selectedChanId });
      const panelData = buildOverviewPanel(guild);
      return interaction.update(panelData);
    }

    if (customId === 'panel_set_welcome_role') {
      const selectedRoleId = interaction.values[0];
      db.updateGuildConfig(guild.id, { welcomeRoleId: selectedRoleId });
      const panelData = buildOverviewPanel(guild);
      return interaction.update(panelData);
    }

    if (customId === 'panel_set_voice_trigger') {
      const selectedChanId = interaction.values[0];
      const chan = guild.channels.cache.get(selectedChanId);
      db.updateGuildConfig(guild.id, { tempVoiceTriggerId: selectedChanId, tempVoiceCategoryId: chan ? chan.parentId : null });
      const panelData = buildOverviewPanel(guild);
      return interaction.update(panelData);
    }

    if (customId === 'panel_add_staff_role') {
      const selectedRoleId = interaction.values[0];
      let staffRoleIds = cfg.ticketStaffRoleIds || [];
      if (!staffRoleIds.includes(selectedRoleId)) {
        staffRoleIds.push(selectedRoleId);
        db.updateGuildConfig(guild.id, { ticketStaffRoleIds: staffRoleIds, ticketStaffRoleId: staffRoleIds[0] });
      }
      const panelData = buildOverviewPanel(guild);
      return interaction.update(panelData);
    }

    if (customId === 'panel_set_counting_channel') {
      const selectedChanId = interaction.values[0];
      db.updateGuildConfig(guild.id, { countingChannelId: selectedChanId });
      const countingView = renderCountingModuleView(guild);
      return interaction.update(countingView);
    }

    if (customId === 'panel_set_minigame_channel') {
      const selectedChanId = interaction.values[0];
      db.updateGuildConfig(guild.id, { minigameChannelId: selectedChanId });
      const panelData = buildOverviewPanel(guild);
      return interaction.update(panelData);
    }

    if (customId === 'panel_set_birthday_category') {
      const selectedCatId = interaction.values[0];
      const newChan = await guild.channels.create({
        name: '🎉┃birthdays',
        type: ChannelType.GuildText,
        parent: selectedCatId,
        topic: 'Server Birthday Celebrations'
      });

      let bdayRoleId = cfg.birthdayRoleId;
      if (!bdayRoleId) {
        let bdayRole = guild.roles.cache.find(r => r.name.toLowerCase().includes('birthday'));
        if (!bdayRole) {
          bdayRole = await guild.roles.create({
            name: '🎉┃Birthday',
            color: '#FF73FA',
            reason: 'Auto-created birthday celebratory role'
          }).catch(() => null);
        }
        if (bdayRole) bdayRoleId = bdayRole.id;
      }

      db.updateGuildConfig(guild.id, { birthdayChannelId: newChan.id, birthdayRoleId: bdayRoleId });
      await updateBirthdayPanel(guild).catch(() => {});
      const panelData = buildOverviewPanel(guild);
      return interaction.update(panelData);
    }

    if (customId === 'panel_set_birthday_channel') {
      const selectedChanId = interaction.values[0];
      db.updateGuildConfig(guild.id, { birthdayChannelId: selectedChanId });
      await updateBirthdayPanel(guild).catch(() => {});
      const panelData = buildOverviewPanel(guild);
      return interaction.update(panelData);
    }

    if (customId === 'panel_set_birthday_role') {
      const selectedRoleId = interaction.values[0];
      db.updateGuildConfig(guild.id, { birthdayRoleId: selectedRoleId });
      const panelData = buildOverviewPanel(guild);
      return interaction.update(panelData);
    }

    if (customId === 'panel_set_honeypot_channel') {
      const selectedChanId = interaction.values[0];
      db.updateGuildConfig(guild.id, { honeypotChannelId: selectedChanId, honeypotAction: cfg.honeypotAction || 'ban' });
      const panelData = buildOverviewPanel(guild);
      return interaction.update(panelData);
    }
  },

  // Button Action Handlers for Panel
  async handleButton(interaction) {
    const isAuthorized = await enforceOwner(interaction);
    if (!isAuthorized) return;

    const customId = interaction.customId;
    const guild = interaction.guild;
    const cfg = db.getGuildConfig(guild.id);

    if (customId === 'panel_btn_refresh' || customId === 'panel_btn_back') {
      const panelData = buildOverviewPanel(guild);
      return interaction.update(panelData);
    }

    if (customId === 'panel_toggle_autocreate') {
      const currentState = cfg.autoCreateLogs !== false;
      db.updateGuildConfig(guild.id, { autoCreateLogs: !currentState });
      const logsView = renderLogsModuleView(guild);
      return interaction.update(logsView);
    }

    if (customId.startsWith('panel_toggle_event_')) {
      const eventType = customId.replace('panel_toggle_event_', '');
      const toggles = { ...DEFAULT_LOG_TOGGLES, ...(cfg.logToggles || {}) };
      toggles[eventType] = !toggles[eventType];

      db.updateGuildConfig(guild.id, { logToggles: toggles });
      const logsView = renderLogsModuleView(guild);
      return interaction.update(logsView);
    }

    if (customId === 'panel_toggle_counting_mode') {
      const newMode = cfg.countingMode === 'hard' ? 'easy' : 'hard';
      db.updateGuildConfig(guild.id, { countingMode: newMode });
      const countingView = renderCountingModuleView(guild);
      return interaction.update(countingView);
    }

    if (customId === 'panel_toggle_counting_solo') {
      const currentSolo = cfg.countingAllowSolo === true;
      db.updateGuildConfig(guild.id, { countingAllowSolo: !currentSolo });
      const countingView = renderCountingModuleView(guild);
      return interaction.update(countingView);
    }

    if (customId === 'panel_reset_count') {
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

      const countingView = renderCountingModuleView(guild);
      return interaction.update(countingView);
    }

    if (customId === 'panel_reset_ai_channel') {
      db.updateGuildConfig(guild.id, { aiChannelId: null });
      const panelData = buildOverviewPanel(guild);
      return interaction.update(panelData);
    }

    if (customId === 'panel_enable_stats') {
      await interaction.deferUpdate();
      await setupStatsChannels(guild);
      const panelData = buildOverviewPanel(guild);
      return interaction.editReply(panelData);
    }

    if (customId === 'panel_disable_stats') {
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

      const panelData = buildOverviewPanel(guild);
      return interaction.update(panelData);
    }

    if (customId === 'panel_autocreate_birthday') {
      let cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('birthday'));
      if (!cat) {
        cat = await guild.channels.create({
          name: 'CELEBRATIONS',
          type: ChannelType.GuildCategory
        }).catch(() => null);
      }

      const newChan = await guild.channels.create({
        name: '🎉┃birthdays',
        type: ChannelType.GuildText,
        parent: cat ? cat.id : null,
        topic: 'Server Birthday Celebrations'
      });

      let bdayRoleId = cfg.birthdayRoleId;
      if (!bdayRoleId) {
        let bdayRole = guild.roles.cache.find(r => r.name.toLowerCase().includes('birthday'));
        if (!bdayRole) {
          bdayRole = await guild.roles.create({
            name: '🎉┃Birthday',
            color: '#FF73FA',
            reason: 'Auto-created birthday celebratory role'
          }).catch(() => null);
        }
        if (bdayRole) bdayRoleId = bdayRole.id;
      }

      db.updateGuildConfig(guild.id, { birthdayChannelId: newChan.id, birthdayRoleId: bdayRoleId });
      await updateBirthdayPanel(guild).catch(() => {});
      const panelData = buildOverviewPanel(guild);
      return interaction.update(panelData);
    }

    if (customId === 'panel_disable_birthday') {
      db.updateGuildConfig(guild.id, {
        birthdayChannelId: null,
        birthdayRoleId: null
      });
      const panelData = buildOverviewPanel(guild);
      return interaction.update(panelData);
    }

    if (customId === 'panel_disable_honeypot') {
      db.updateGuildConfig(guild.id, {
        honeypotChannelId: null,
        honeypotAction: null,
        honeypotLogChannelId: null
      });
      const panelData = buildOverviewPanel(guild);
      return interaction.update(panelData);
    }
  }
};
