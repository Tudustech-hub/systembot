const { 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ChannelType, 
  PermissionFlagsBits, 
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');
const giveawayCmd = require('../commands/giveaway');
const pollCmd = require('../commands/poll');
const minigamesCmd = require('../commands/minigames');
const musicCmd = require('../commands/music');
const eventCmd = require('../commands/event');
const panelCmd = require('../commands/panel');
const { createVoiceControlPanel } = require('../events/voiceStateUpdate');
const db = require('../db/database');
const config = require('../config');
const { getEmoji, setButtonEmoji } = require('../utils/emojis');

// Base category metadata mapping for ticket creation
const ticketCategoryKeys = {
  ticket_cat_bug: { name: 'Report Bug', emojiKey: 'bug', prefix: 'bug' },
  ticket_cat_staff: { name: 'Need Staff', emojiKey: 'staff', prefix: 'staff' },
  ticket_cat_giveaway: { name: 'Claim Giveaway', emojiKey: 'giveaway', prefix: 'claim' },
  ticket_cat_other: { name: 'Other Inquiry', emojiKey: 'info', prefix: 'other' }
};

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    const guild = interaction.guild;

    // 0. Autocomplete Handler
    if (interaction.isAutocomplete()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (command && command.autocomplete) {
        try {
          await command.autocomplete(interaction);
        } catch (error) {
          console.error(`Error handling autocomplete for ${interaction.commandName}:`, error);
        }
      }
      return;
    }

    // 1. Context Menu Commands (Apps)
    if (interaction.isUserContextMenuCommand()) {
      const { handleUserContextMenu } = require('../commands/contextMenus');
      return handleUserContextMenu(interaction);
    }

    if (interaction.isMessageContextMenuCommand()) {
      const { handleMessageContextMenu } = require('../commands/contextMenus');
      return handleMessageContextMenu(interaction);
    }

    // 2. Slash Commands
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`Error executing command ${interaction.commandName}:`, error);
        const errEmoji = getEmoji(guild, 'error');
        const errorContent = { content: `${errEmoji} There was an error executing this command!`.trim(), ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errorContent).catch(() => {});
        } else {
          await interaction.reply(errorContent).catch(() => {});
        }
      }
      return;
    }

    // 3. Select Menus (String, Channel, Role Pickers for /panel & /help)
    if (interaction.isStringSelectMenu() || interaction.isChannelSelectMenu() || interaction.isRoleSelectMenu()) {
      if (interaction.customId === 'help_category_select') {
        const { buildHelpEmbed, buildHelpMenu } = require('../commands/help');
        const selected = interaction.values[0];
        const embed = buildHelpEmbed(guild, selected);
        const row = buildHelpMenu(selected);
        return interaction.update({ embeds: [embed], components: [row] });
      }

      if (interaction.customId.startsWith('panel_')) {
        return panelCmd.handleSelectMenu(interaction);
      }
    }

    // 3. Buttons
    if (interaction.isButton()) {
      const customId = interaction.customId;

      if (customId.startsWith('panel_')) {
        return panelCmd.handleButton(interaction);
      }

      if (customId.startsWith('giveaway_')) {
        return giveawayCmd.handleButton(interaction);
      }
      
      if (customId.startsWith('poll_')) {
        return pollCmd.handleButton(interaction);
      }

      if (customId.startsWith('music_btn_') || customId === 'music_panel_play') {
        return musicCmd.handleButton(interaction);
      }

      if (customId.startsWith('event_')) {
        return eventCmd.handleButton(interaction);
      }

      // Voice Room Control Buttons
      if (customId.startsWith('voice_btn_')) {
        const channel = interaction.channel;
        const tempVoice = db.getTempVoiceChannel(channel.id);

        if (!tempVoice) {
          const denyEmoji = getEmoji(guild, 'Deny');
          return interaction.reply({ content: `${denyEmoji} Dynamic voice room data not found!`.trim(), ephemeral: true });
        }

        const isOwner = interaction.user.id === tempVoice.ownerId;
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator) || interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);

        if (!isOwner && !isAdmin) {
          const denyEmoji = getEmoji(guild, 'Deny');
          return interaction.reply({ content: `${denyEmoji} Only the room owner (<@${tempVoice.ownerId}>) can change room privacy!`.trim(), ephemeral: true });
        }

        if (customId === 'voice_btn_private') {
          await channel.permissionOverwrites.edit(guild.roles.everyone, { Connect: false }).catch(() => {});
          await channel.permissionOverwrites.edit(interaction.user, { Connect: true, ViewChannel: true }).catch(() => {});

          const cleanName = channel.name.replace(/^[🔊🔒]\s*/, '');
          await channel.setName(`${cleanName}`).catch(() => {});

          db.updateTempVoiceChannel(channel.id, { isPrivate: true });

          const ownerMember = interaction.member;
          const { embed, rows } = createVoiceControlPanel(guild, ownerMember, true);
          await interaction.message.edit({ embeds: [embed], components: rows }).catch(() => {});

          const lockEmoji = getEmoji(guild, 'lock');
          return interaction.reply({
            content: `${lockEmoji} Room is now **PRIVATE**.\n*Reply to a message tagging someone (@person) to grant access!*`.trim(),
            ephemeral: true
          });
        }

        if (customId === 'voice_btn_public') {
          await channel.permissionOverwrites.edit(guild.roles.everyone, {
            Connect: true,
            Speak: true,
            Stream: true,
            AttachFiles: true,
            EmbedLinks: true,
            SendMessages: true,
            ReadMessageHistory: true,
            UseExternalEmojis: true,
            AddReactions: true,
            ViewChannel: true
          }).catch(() => {});

          const cleanName = channel.name.replace(/^[🔊🔒]\s*/, '');
          await channel.setName(`${cleanName}`).catch(() => {});

          db.updateTempVoiceChannel(channel.id, { isPrivate: false });

          const ownerMember = interaction.member;
          const { embed, rows } = createVoiceControlPanel(guild, ownerMember, false);
          await interaction.message.edit({ embeds: [embed], components: rows }).catch(() => {});

          const unlockEmoji = getEmoji(guild, 'unlock');
          return interaction.reply({
            content: `${unlockEmoji} Room is now **PUBLIC** for everyone!`.trim(),
            ephemeral: true
          });
        }

        if (customId === 'voice_btn_allowed') {
          const allowed = tempVoice.allowedUsers || [tempVoice.ownerId];
          const mentions = allowed.map(id => `<@${id}>`).join(', ');

          const usersEmoji = getEmoji(guild, 'users');
          return interaction.reply({
            content: `${usersEmoji} **Allowed (${allowed.length}):** ${mentions}`.trim(),
            ephemeral: true
          });
        }
      }

      // Birthday Panel Buttons
      if (customId.startsWith('bday_btn_')) {
        const { updateBirthdayPanel, MONTH_NAMES } = require('../utils/birthdayScheduler');

        if (customId === 'bday_btn_set') {
          const modal = new ModalBuilder()
            .setCustomId('bday_modal_set')
            .setTitle('Set Your Birthday');

          const monthInput = new TextInputBuilder()
            .setCustomId('bday_month_input')
            .setLabel('Birth Month (1 - 12):')
            .setPlaceholder('e.g. 8 for August')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(2);

          const dayInput = new TextInputBuilder()
            .setCustomId('bday_day_input')
            .setLabel('Birth Day (1 - 31):')
            .setPlaceholder('e.g. 30')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(2);

          modal.addComponents(
            new ActionRowBuilder().addComponents(monthInput),
            new ActionRowBuilder().addComponents(dayInput)
          );

          return interaction.showModal(modal);
        }

        if (customId === 'bday_btn_view') {
          const bday = db.getBirthday(interaction.user.id);
          if (!bday) {
            const infoEmoji = getEmoji(guild, 'info');
            return interaction.reply({
              content: `${infoEmoji} You have not registered your birthday yet. Click **Set Birthday**!`,
              ephemeral: true
            });
          }

          const verifiedEmoji = getEmoji(guild, 'verified');
          return interaction.reply({
            content: `${verifiedEmoji} Your birthday is saved as **${MONTH_NAMES[bday.month - 1]} ${bday.day}**.`,
            ephemeral: true
          });
        }

        if (customId === 'bday_btn_remove') {
          const allBirthdays = db.getBirthdays();
          if (!allBirthdays[interaction.user.id]) {
            const infoEmoji = getEmoji(guild, 'info');
            return interaction.reply({ content: `${infoEmoji} You do not have a birthday saved.`, ephemeral: true });
          }

          delete allBirthdays[interaction.user.id];
          db.save();

          await updateBirthdayPanel(guild).catch(() => {});

          const checkEmoji = getEmoji(guild, 'check');
          return interaction.reply({
            content: `${checkEmoji} Removed your birthday from the calendar.`,
            ephemeral: true
          });
        }
      }

      // Ticket Panel Buttons -> Show Modal Prompt
      if (ticketCategoryKeys[customId]) {
        const catInfo = ticketCategoryKeys[customId];
        const modalTitle = `Create Ticket - ${catInfo.name}`.slice(0, 45);

        const modal = new ModalBuilder()
          .setCustomId(`ticket_modal_${customId}`)
          .setTitle(modalTitle);

        const input = new TextInputBuilder()
          .setCustomId('ticket_details')
          .setLabel('Describe your request or issue:')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Enter details so our staff team can help you...')
          .setRequired(true)
          .setMaxLength(1000);

        const firstActionRow = new ActionRowBuilder().addComponents(input);
        modal.addComponents(firstActionRow);

        return interaction.showModal(modal);
      }

      // Ticket Channel Controls
      if (customId === 'ticket_btn_close') {
        return closeTicket(interaction.channel, interaction.user, 'Closed via ticket button');
      }

      if (customId === 'ticket_btn_close_reason') {
        const modal = new ModalBuilder()
          .setCustomId('ticket_modal_close_reason')
          .setTitle('Close Ticket with Reason'.slice(0, 45));

        const input = new TextInputBuilder()
          .setCustomId('close_reason_input')
          .setLabel('Reason for closing this ticket:')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g., Issue resolved / Giveaway claimed')
          .setRequired(true);

        const row = new ActionRowBuilder().addComponents(input);
        modal.addComponents(row);

        return interaction.showModal(modal);
      }

      if (customId === 'ticket_btn_transcript') {
        return generateTranscript(interaction);
      }
    }

    // 4. Modals Submission
    if (interaction.isModalSubmit()) {
      // A. Music Search / Play Modal Submission
      if (interaction.customId === 'music_modal_play') {
        const voiceChannel = interaction.member?.voice?.channel;

        if (!voiceChannel) {
          const errEmoji = getEmoji(guild, 'error');
          return interaction.reply({ 
            content: `${errEmoji} You must join a Voice Channel first before playing music!`.trim(), 
            ephemeral: true 
          });
        }

        await interaction.deferReply();
        const query = interaction.fields.getTextInputValue('music_query_input');

        const result = await musicCmd.processPlayRequest(guild, voiceChannel, interaction.channel, interaction.user, query);
        return interaction.editReply({ content: result.message });
      }

      // B. Ticket Creation Modal Submission
      if (interaction.customId.startsWith('ticket_modal_ticket_cat_')) {
        await interaction.deferReply({ ephemeral: true });

        const categoryKey = interaction.customId.replace('ticket_modal_', '');
        const catInfo = ticketCategoryKeys[categoryKey] || { name: 'General', emojiKey: 'ticket', prefix: 'ticket' };
        const emoji = getEmoji(guild, catInfo.emojiKey);
        const details = interaction.fields.getTextInputValue('ticket_details');

        const guildConfig = db.getGuildConfig(guild.id);
        let staffRoleIds = guildConfig.ticketStaffRoleIds || [];
        if (staffRoleIds.length === 0 && guildConfig.ticketStaffRoleId) {
          staffRoleIds = [guildConfig.ticketStaffRoleId];
        }

        if (!guildConfig.ticketCategoryId || staffRoleIds.length === 0) {
          const errEmoji = getEmoji(guild, 'error');
          return interaction.editReply({ 
            content: `${errEmoji} Ticket system is not configured! Please ask an admin to run \`/ticket panel\` or \`/setup add_staff_role\`.`.trim()
          });
        }

        const usernameSanitized = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
        const channelName = `ticket-${catInfo.prefix}-${usernameSanitized}`;

        const permissionOverwrites = [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles
            ]
          }
        ];

        // Grant access to ALL configured staff roles
        for (const roleId of staffRoleIds) {
          permissionOverwrites.push({
            id: roleId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles
            ]
          });
        }

        try {
          const ticketChannel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: guildConfig.ticketCategoryId,
            permissionOverwrites
          });

          // Save ticket to DB
          db.addTicket({
            channelId: ticketChannel.id,
            guildId: guild.id,
            creatorId: interaction.user.id,
            category: catInfo.name,
            reason: details,
            createdAt: Date.now()
          });

          const staffPings = staffRoleIds.map(id => `<@&${id}>`).join(' ');

          const titleText = `${emoji} Ticket: ${catInfo.name}`.trim();
          // Ticket Welcome Embed in new Channel
          const welcomeEmbed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle(titleText)
            .setDescription(`Welcome ${interaction.user}! Thank you for reaching out.\nOur support team (${staffPings}) has been notified and will assist you shortly.`)
            .addFields(
              { name: 'Creator', value: `${interaction.user} (${interaction.user.tag})`, inline: true },
              { name: 'Category', value: `${emoji} ${catInfo.name}`.trim(), inline: true },
              { name: 'Request Details', value: `\`\`\`\n${details}\n\`\`\`` }
            )
            .setFooter({ text: 'Use the buttons below to manage this ticket' })
            .setTimestamp();

          const denyEmoji = getEmoji(guild, 'Deny');
          const infoEmoji = getEmoji(guild, 'info');
          const ticketEmoji = getEmoji(guild, 'ticket');

          const controlRow = new ActionRowBuilder().addComponents(
            setButtonEmoji(new ButtonBuilder().setCustomId('ticket_btn_close').setLabel('Close').setStyle(ButtonStyle.Danger), denyEmoji),
            setButtonEmoji(new ButtonBuilder().setCustomId('ticket_btn_close_reason').setLabel('Close with Reason').setStyle(ButtonStyle.Secondary), infoEmoji),
            setButtonEmoji(new ButtonBuilder().setCustomId('ticket_btn_transcript').setLabel('Transcript').setStyle(ButtonStyle.Primary), ticketEmoji)
          );

          await ticketChannel.send({
            content: `Hey ${interaction.user} ${staffPings}, a new ticket has been opened!`,
            embeds: [welcomeEmbed],
            components: [controlRow]
          });

          const checkEmoji = getEmoji(guild, 'check');
          return interaction.editReply({ 
            content: `${checkEmoji} Ticket created! Please head to ${ticketChannel}`.trim()
          });

        } catch (err) {
          console.error('Error creating ticket channel:', err);
          const errEmoji = getEmoji(guild, 'error');
          return interaction.editReply({ 
            content: `${errEmoji} Failed to create ticket channel. Please check bot permissions!`.trim()
          });
        }
      }

      if (interaction.customId === 'ticket_modal_close_reason') {
        await interaction.deferReply({ ephemeral: true });
        const reason = interaction.fields.getTextInputValue('close_reason_input');
        await closeTicket(interaction.channel, interaction.user, reason);
        return interaction.editReply({ content: `Closing ticket...` });
      }

      // C. Birthday Set Modal Submission
      if (interaction.customId === 'bday_modal_set') {
        const { updateBirthdayPanel, MONTH_NAMES } = require('../utils/birthdayScheduler');

        const monthStr = interaction.fields.getTextInputValue('bday_month_input').trim();
        const dayStr = interaction.fields.getTextInputValue('bday_day_input').trim();

        const month = parseInt(monthStr, 10);
        const day = parseInt(dayStr, 10);

        if (isNaN(month) || month < 1 || month > 12) {
          const denyEmoji = getEmoji(guild, 'Deny');
          return interaction.reply({ content: `${denyEmoji} Invalid month. Please enter a number from 1 to 12.`, ephemeral: true });
        }

        const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        if (isNaN(day) || day < 1 || day > daysInMonth[month - 1]) {
          const denyEmoji = getEmoji(guild, 'Deny');
          return interaction.reply({ content: `${denyEmoji} Invalid day for ${MONTH_NAMES[month - 1]}.`, ephemeral: true });
        }

        db.setBirthday(interaction.user.id, month, day);

        await updateBirthdayPanel(guild).catch(() => {});

        const checkEmoji = getEmoji(guild, 'check');
        return interaction.reply({
          content: `${checkEmoji} Your birthday has been saved as **${MONTH_NAMES[month - 1]} ${day}** and updated on the calendar!`,
          ephemeral: true
        });
      }
    }
  }
};

// Helper: Close ticket
async function closeTicket(channel, user, reason) {
  const ticket = db.getTicket(channel.id);
  const guild = channel.guild;
  const guildConfig = db.getGuildConfig(guild.id);

  const errEmoji = getEmoji(guild, 'error');
  const closeEmbed = new EmbedBuilder()
    .setColor(config.errorColor)
    .setTitle(`${errEmoji} Closing Ticket...`.trim())
    .setDescription(`Ticket closed by ${user}.\n**Reason:** ${reason}\n\n*Channel will be deleted in 5 seconds...*`)
    .setTimestamp();

  await channel.send({ embeds: [closeEmbed] }).catch(() => {});

  const ticketLogChanId = guildConfig.logChannelIds?.ticketLogsId || guildConfig.ticketLogChannelId;
  if (ticketLogChanId) {
    const logChannel = guild.channels.cache.get(ticketLogChanId) || await guild.channels.fetch(ticketLogChanId).catch(() => null);
    if (logChannel) {
      try {
        const messages = await channel.messages.fetch({ limit: 100 });
        const transcriptText = messages
          .reverse()
          .map(m => `[${new Date(m.createdTimestamp).toISOString()}] ${m.author.tag}: ${m.content}`)
          .join('\n');

        const ticketEmoji = getEmoji(guild, 'ticket');
        const logEmbed = new EmbedBuilder()
          .setColor(config.embedColor)
          .setTitle(`${ticketEmoji} Ticket Transcript Record`.trim())
          .addFields(
            { name: 'Channel', value: `#${channel.name}`, inline: true },
            { name: 'Creator', value: ticket ? `<@${ticket.creatorId}>` : 'Unknown', inline: true },
            { name: 'Closed By', value: `${user.tag}`, inline: true },
            { name: 'Category', value: ticket ? ticket.category : 'General', inline: true },
            { name: 'Reason', value: reason }
          )
          .setTimestamp();

        const buffer = Buffer.from(transcriptText || 'No text messages', 'utf-8');
        await logChannel.send({
          embeds: [logEmbed],
          files: [{ attachment: buffer, name: `transcript-${channel.name}.txt` }]
        }).catch(() => {});
      } catch (err) {
        console.error('Error creating ticket log:', err);
      }
    }
  }

  db.removeTicket(channel.id);

  setTimeout(async () => {
    await channel.delete('Ticket Closed').catch(() => {});
  }, 5000);
}

// Helper: Generate Transcript on demand
async function generateTranscript(interaction) {
  const guild = interaction.guild;
  try {
    const messages = await interaction.channel.messages.fetch({ limit: 100 });
    const transcriptText = messages
      .reverse()
      .map(m => `[${new Date(m.createdTimestamp).toISOString()}] ${m.author.tag}: ${m.content}`)
      .join('\n');

    const buffer = Buffer.from(transcriptText || 'No text messages', 'utf-8');

    const ticketEmoji = getEmoji(guild, 'ticket');
    return interaction.reply({
      content: `${ticketEmoji} Here is the current ticket transcript:`.trim(),
      files: [{ attachment: buffer, name: `transcript-${interaction.channel.name}.txt` }],
      ephemeral: true
    });
  } catch (err) {
    console.error('Transcript error:', err);
    const errEmoji = getEmoji(guild, 'error');
    return interaction.reply({ content: `${errEmoji} Failed to generate transcript.`.trim(), ephemeral: true });
  }
}
