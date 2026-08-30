const { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ChannelType 
} = require('discord.js');
const db = require('../db/database');
const config = require('../config');
const { getEmoji, setButtonEmoji } = require('../utils/emojis');

// Helper: Build Event Embed & Control Buttons
function buildEventEmbedAndRows(eventObj, guild) {
  const participantCount = (eventObj.participants || []).length;
  const maxText = eventObj.maxParticipants ? ` / ${eventObj.maxParticipants}` : '';
  const calendarEmoji = getEmoji(guild, 'Calendar');
  const checkEmoji = getEmoji(guild, 'check');
  const stopEmoji = getEmoji(guild, 'stop');

  let embedColor = config.embedColor;
  if (eventObj.ended) {
    embedColor = config.errorColor;
  } else if (eventObj.color) {
    const c = eventObj.color.trim();
    if (/^#?[0-9A-Fa-f]{6}$/.test(c)) {
      embedColor = c.startsWith('#') ? c : `#${c}`;
    }
  }

  let desc = `# ${calendarEmoji} ${eventObj.title}\n\n`.trimStart();
  if (eventObj.game) desc += `• **Game:** ${eventObj.game}\n`;
  if (eventObj.activity) desc += `• **Activity:** ${eventObj.activity}\n`;
  if (eventObj.schedule) desc += `• **Time:** ${eventObj.schedule}\n`;
  if (eventObj.server) desc += `• **Server/Room:** ${eventObj.server}\n`;
  if (eventObj.link) desc += `• **Link:** [Join Link](${eventObj.link.startsWith('http') ? eventObj.link : `https://${eventObj.link}`})\n`;
  desc += `\n${eventObj.description}\n\n`;
  desc += eventObj.ended ? '**Event Ended**' : '**Registration Open**';

  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setDescription(desc)
    .addFields(
      { name: 'Attendees', value: `**${participantCount}${maxText}**`, inline: true },
      { name: 'Host', value: `<@${eventObj.hostId}>`, inline: true }
    )
    .setTimestamp(eventObj.createdAt);

  const row = new ActionRowBuilder();

  if (eventObj.ended) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('event_ended')
        .setLabel(`Ended (${participantCount} Joined)`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );
  } else {
    row.addComponents(
      setButtonEmoji(new ButtonBuilder().setCustomId('event_btn_join').setLabel(`Join (${participantCount}${maxText})`).setStyle(ButtonStyle.Success), checkEmoji),
      new ButtonBuilder().setCustomId('event_btn_list').setLabel('Attendees').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('event_btn_remind').setLabel('Remind Me').setStyle(ButtonStyle.Primary)
    );

    if (eventObj.link && /^https?:\/\//i.test(eventObj.link)) {
      row.addComponents(
        new ButtonBuilder()
          .setLabel('Join Link')
          .setURL(eventObj.link)
          .setStyle(ButtonStyle.Link)
      );
    }

    row.addComponents(
      setButtonEmoji(new ButtonBuilder().setCustomId('event_btn_end').setLabel('End').setStyle(ButtonStyle.Danger), stopEmoji)
    );
  }

  return { embed, rows: [row] };
}

module.exports = {
  buildEventEmbedAndRows,
  data: new SlashCommandBuilder()
    .setName('event')
    .setDescription('Manage server events')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
    .addSubcommand(sub =>
      sub.setName('send')
        .setDescription('Create a server event')
        .addStringOption(opt => opt.setName('title').setDescription('Event title').setRequired(true))
        .addStringOption(opt => opt.setName('description').setDescription('Description').setRequired(true))
        .addStringOption(opt => opt.setName('game').setDescription('Game').setRequired(false))
        .addStringOption(opt => opt.setName('activity').setDescription('Activity').setRequired(false))
        .addStringOption(opt => opt.setName('link').setDescription('Room/Stream URL').setRequired(false))
        .addStringOption(opt => opt.setName('server').setDescription('Server/Room Code').setRequired(false))
        .addStringOption(opt => opt.setName('schedule').setDescription('Time').setRequired(false))
        .addIntegerOption(opt => opt.setName('max_participants').setDescription('Max limit').setMinValue(1).setRequired(false))
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addStringOption(opt => opt.setName('color').setDescription('HEX color (e.g. #5865F2)').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List active events')
    )
    .addSubcommand(sub =>
      sub.setName('end')
        .setDescription('End an event')
        .addStringOption(opt =>
          opt.setName('message_id')
            .setDescription('Event to end')
            .setAutocomplete(true)
            .setRequired(true)
        )
    ),

  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    const events = db.getEvents() || [];
    const guildEvents = events.filter(e => e.guildId === interaction.guild.id);

    const filtered = guildEvents
      .filter(e => (e.title && e.title.toLowerCase().includes(focusedValue)) || (e.messageId && e.messageId.includes(focusedValue)))
      .slice(0, 25);

    await interaction.respond(
      filtered.map(e => ({
        name: `${e.title} (${e.ended ? 'Ended' : 'Active'}) - ${e.messageId}`.slice(0, 100),
        value: e.messageId
      }))
    );
  },

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guild = interaction.guild;

    if (subcommand === 'send') {
      const title = interaction.options.getString('title');
      const description = interaction.options.getString('description').replace(/\\n/g, '\n');
      const game = interaction.options.getString('game');
      const activity = interaction.options.getString('activity');
      const link = interaction.options.getString('link');
      const server = interaction.options.getString('server');
      const schedule = interaction.options.getString('schedule');
      const maxParticipants = interaction.options.getInteger('max_participants');
      const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
      const color = interaction.options.getString('color');

      const eventData = {
        messageId: null,
        channelId: targetChannel.id,
        guildId: guild.id,
        hostId: interaction.user.id,
        title,
        description,
        game,
        activity,
        link,
        server,
        schedule,
        color,
        maxParticipants,
        participants: [],
        reminders: [],
        ended: false,
        createdAt: Date.now()
      };

      const { embed, rows } = buildEventEmbedAndRows(eventData, guild);
      const message = await targetChannel.send({ embeds: [embed], components: rows });

      eventData.messageId = message.id;
      db.addEvent(eventData);

      const checkEmoji = getEmoji(guild, 'Accept');
      return interaction.reply({
        content: `${checkEmoji} Event **"${title}"** posted in ${targetChannel}!`,
        ephemeral: true
      });
    }

    if (subcommand === 'list') {
      const events = db.getEvents().filter(e => e.guildId === guild.id && !e.ended);

      if (events.length === 0) {
        const infoEmoji = getEmoji(guild, 'info');
        return interaction.reply({ content: `${infoEmoji} No active events.`, ephemeral: true });
      }

      const listText = events.map(e => `• **${e.title}** (${(e.participants || []).length} joined) — <#${e.channelId}> (\`${e.messageId}\`)`).join('\n');
      const calendarEmoji = getEmoji(guild, 'Calendar');
      const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle(`${calendarEmoji} Active Events`.trim())
        .setDescription(listText)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === 'end') {
      const messageId = interaction.options.getString('message_id');
      const eventObj = db.getEvent(messageId);

      if (!eventObj || eventObj.ended) {
        const denyEmoji = getEmoji(guild, 'Deny');
        return interaction.reply({ content: `${denyEmoji} Event not found.`, ephemeral: true });
      }

      eventObj.ended = true;
      db.updateEvent(messageId, eventObj);

      const channel = await guild.channels.fetch(eventObj.channelId).catch(() => null);
      if (channel) {
        const message = await channel.messages.fetch(messageId).catch(() => null);
        if (message) {
          const { embed, rows } = buildEventEmbedAndRows(eventObj, guild);
          await message.edit({ embeds: [embed], components: rows }).catch(() => {});
        }
      }

      const acceptEmoji = getEmoji(guild, 'Accept');
      return interaction.reply({ content: `${acceptEmoji} Event ended.`, ephemeral: true });
    }
  },

  async handleButton(interaction) {
    const customId = interaction.customId;
    const messageId = interaction.message.id;
    const guild = interaction.guild;
    const userId = interaction.user.id;

    const eventObj = db.getEvent(messageId);
    if (!eventObj) {
      const denyEmoji = getEmoji(guild, 'Deny');
      return interaction.reply({ content: `${denyEmoji} Event not found!`, ephemeral: true });
    }

    if (customId === 'event_btn_join') {
      if (eventObj.ended) {
        const denyEmoji = getEmoji(guild, 'Deny');
        return interaction.reply({ content: `${denyEmoji} Event has ended.`, ephemeral: true });
      }

      let participants = eventObj.participants || [];

      if (participants.includes(userId)) {
        participants = participants.filter(id => id !== userId);
        eventObj.participants = participants;
        db.updateEvent(messageId, eventObj);

        const { embed, rows } = buildEventEmbedAndRows(eventObj, guild);
        await interaction.message.edit({ embeds: [embed], components: rows }).catch(() => {});
        return interaction.reply({ content: `Left **"${eventObj.title}"**.`, ephemeral: true });
      } else {
        if (eventObj.maxParticipants && participants.length >= eventObj.maxParticipants) {
          const denyEmoji = getEmoji(guild, 'Deny');
          return interaction.reply({ content: `${denyEmoji} Event is full.`, ephemeral: true });
        }

        participants.push(userId);
        eventObj.participants = participants;
        db.updateEvent(messageId, eventObj);

        const { embed, rows } = buildEventEmbedAndRows(eventObj, guild);
        await interaction.message.edit({ embeds: [embed], components: rows }).catch(() => {});
        const checkEmoji = getEmoji(guild, 'check');
        return interaction.reply({ content: `${checkEmoji} Joined **"${eventObj.title}"**!`, ephemeral: true });
      }
    }

    if (customId === 'event_btn_list') {
      const participants = eventObj.participants || [];
      if (participants.length === 0) {
        return interaction.reply({ content: `No participants yet.`, ephemeral: true });
      }

      const mentions = participants.map((id, idx) => `${idx + 1}. <@${id}>`).join('\n');
      const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle(`Attendees (${participants.length})`)
        .setDescription(mentions)
        .setFooter({ text: eventObj.title });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (customId === 'event_btn_remind') {
      let reminders = eventObj.reminders || [];
      if (reminders.includes(userId)) {
        reminders = reminders.filter(id => id !== userId);
        eventObj.reminders = reminders;
        db.updateEvent(messageId, eventObj);
        return interaction.reply({ content: 'Reminder off.', ephemeral: true });
      } else {
        reminders.push(userId);
        eventObj.reminders = reminders;
        db.updateEvent(messageId, eventObj);
        return interaction.reply({ content: 'Reminder on!', ephemeral: true });
      }
    }

    if (customId === 'event_btn_end') {
      const member = interaction.member;
      const isHost = userId === eventObj.hostId;
      const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ManageEvents);

      if (!isHost && !isAdmin) {
        const denyEmoji = getEmoji(guild, 'Deny');
        return interaction.reply({ content: `${denyEmoji} Host/Admin only.`, ephemeral: true });
      }

      eventObj.ended = true;
      db.updateEvent(messageId, eventObj);

      const { embed, rows } = buildEventEmbedAndRows(eventObj, guild);
      await interaction.message.edit({ embeds: [embed], components: rows }).catch(() => {});

      const acceptEmoji = getEmoji(guild, 'Accept');
      return interaction.reply({ content: `${acceptEmoji} Event ended.` });
    }
  }
};
