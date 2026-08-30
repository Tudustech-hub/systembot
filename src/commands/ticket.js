const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const db = require('../db/database');
const config = require('../config');
const { getEmoji, setButtonEmoji } = require('../utils/emojis');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket support system')
    .addSubcommand(sub =>
      sub.setName('panel')
        .setDescription('Create ticket panel')
        .addChannelOption(opt =>
          opt.setName('panel_channel')
            .setDescription('Channel for panel')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addChannelOption(opt =>
          opt.setName('category')
            .setDescription('Tickets category')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true)
        )
        .addRoleOption(opt =>
          opt.setName('staff_role')
            .setDescription('Staff support role')
            .setRequired(true)
        )
        .addRoleOption(opt =>
          opt.setName('staff_role_2')
            .setDescription('Additional staff role 2')
            .setRequired(false)
        )
        .addRoleOption(opt =>
          opt.setName('staff_role_3')
            .setDescription('Additional staff role 3')
            .setRequired(false)
        )
        .addRoleOption(opt =>
          opt.setName('staff_role_4')
            .setDescription('Additional staff role 4')
            .setRequired(false)
        )
        .addChannelOption(opt =>
          opt.setName('log_channel')
            .setDescription('Transcripts channel')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add user to ticket')
        .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove user from ticket')
        .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('close')
        .setDescription('Close this ticket')
        .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guild = interaction.guild;

    // 1. SETUP TICKET PANEL
    if (subcommand === 'panel') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        const errEmoji = getEmoji(guild, 'error');
        return interaction.reply({ 
          content: `${errEmoji} Admin only.`, 
          ephemeral: true 
        });
      }

      const panelChannel = interaction.options.getChannel('panel_channel');
      const category = interaction.options.getChannel('category');
      const staffRole1 = interaction.options.getRole('staff_role');
      const staffRole2 = interaction.options.getRole('staff_role_2');
      const staffRole3 = interaction.options.getRole('staff_role_3');
      const staffRole4 = interaction.options.getRole('staff_role_4');
      const logChannel = interaction.options.getChannel('log_channel');

      const ticketEmoji = getEmoji(guild, 'ticket');
      const bugEmoji = getEmoji(guild, 'bug');
      const staffEmoji = getEmoji(guild, 'staff');
      const giveawayEmoji = getEmoji(guild, 'giveaway');
      const infoEmoji = getEmoji(guild, 'info');

      const customTitle = `${ticketEmoji} Support Center`.trim();
      const customDesc = `Click a button below to open a ticket with our staff:`;

      const cfg = db.getGuildConfig(guild.id);
      let staffRoleIds = cfg.ticketStaffRoleIds || [];

      const rolesProvided = [staffRole1, staffRole2, staffRole3, staffRole4].filter(Boolean);
      for (const r of rolesProvided) {
        if (!staffRoleIds.includes(r.id)) {
          staffRoleIds.push(r.id);
        }
      }

      db.updateGuildConfig(guild.id, {
        ticketCategoryId: category.id,
        ticketStaffRoleId: staffRole1.id,
        ticketStaffRoleIds: staffRoleIds,
        ticketLogChannelId: logChannel ? logChannel.id : null
      });

      const panelEmbed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle(customTitle)
        .setDescription(customDesc)
        .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        setButtonEmoji(new ButtonBuilder().setCustomId('ticket_cat_bug').setLabel('Report Bug').setStyle(ButtonStyle.Danger), bugEmoji),
        setButtonEmoji(new ButtonBuilder().setCustomId('ticket_cat_staff').setLabel('Need Staff').setStyle(ButtonStyle.Primary), staffEmoji),
        setButtonEmoji(new ButtonBuilder().setCustomId('ticket_cat_giveaway').setLabel('Claim Giveaway').setStyle(ButtonStyle.Success), giveawayEmoji),
        setButtonEmoji(new ButtonBuilder().setCustomId('ticket_cat_other').setLabel('Other').setStyle(ButtonStyle.Secondary), infoEmoji)
      );

      await panelChannel.send({ embeds: [panelEmbed], components: [row] });

      const checkEmoji = getEmoji(guild, 'check');
      return interaction.reply({ 
        content: `${checkEmoji} Ticket panel posted in ${panelChannel}!`, 
        ephemeral: true 
      });
    }

    // 2. ADD USER TO TICKET
    if (subcommand === 'add') {
      const ticket = db.getTicket(interaction.channel.id);
      if (!ticket) {
        const errEmoji = getEmoji(guild, 'error');
        return interaction.reply({ 
          content: `${errEmoji} Use inside a ticket channel.`, 
          ephemeral: true 
        });
      }

      const targetUser = interaction.options.getUser('user');
      await interaction.channel.permissionOverwrites.edit(targetUser.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true
      });

      const checkEmoji = getEmoji(guild, 'check');
      return interaction.reply({ 
        content: `${checkEmoji} Added ${targetUser} to ticket.` 
      });
    }

    // 3. REMOVE USER FROM TICKET
    if (subcommand === 'remove') {
      const ticket = db.getTicket(interaction.channel.id);
      if (!ticket) {
        const errEmoji = getEmoji(guild, 'error');
        return interaction.reply({ 
          content: `${errEmoji} Use inside a ticket channel.`, 
          ephemeral: true 
        });
      }

      const targetUser = interaction.options.getUser('user');
      await interaction.channel.permissionOverwrites.delete(targetUser.id);

      const checkEmoji = getEmoji(guild, 'check');
      return interaction.reply({ 
        content: `${checkEmoji} Removed ${targetUser} from ticket.` 
      });
    }

    // 4. CLOSE TICKET COMMAND
    if (subcommand === 'close') {
      const ticket = db.getTicket(interaction.channel.id);
      if (!ticket) {
        const errEmoji = getEmoji(guild, 'error');
        return interaction.reply({ 
          content: `${errEmoji} Use inside a ticket channel.`, 
          ephemeral: true 
        });
      }

      const reason = interaction.options.getString('reason') || 'No reason';
      return closeTicketChannel(interaction.channel, interaction.user, reason);
    }
  }
};

// Helper function to handle ticket channel closure and archiving
async function closeTicketChannel(channel, closedByUser, reason = 'Closed by user') {
  const ticket = db.getTicket(channel.id);
  const guild = channel.guild;
  const guildConfig = db.getGuildConfig(guild.id);

  const errEmoji = getEmoji(guild, 'error');
  const closeEmbed = new EmbedBuilder()
    .setColor(config.errorColor)
    .setTitle(`${errEmoji} Closing Ticket...`.trim())
    .setDescription(`Closed by ${closedByUser}.\n**Reason:** ${reason}\n\n*Deleting in 5 seconds...*`)
    .setTimestamp();

  await channel.send({ embeds: [closeEmbed] }).catch(() => {});

  const ticketLogChanId = guildConfig.logChannelIds?.ticketLogsId || guildConfig.ticketLogChannelId;
  if (ticketLogChanId) {
    const logChannel = guild.channels.cache.get(ticketLogChanId) || await guild.channels.fetch(ticketLogChanId).catch(() => null);
    if (logChannel) {
      try {
        const fetchedMessages = await channel.messages.fetch({ limit: 100 });
        const transcriptText = fetchedMessages
          .reverse()
          .map(m => `[${new Date(m.createdTimestamp).toISOString()}] ${m.author.tag}: ${m.content}`)
          .join('\n');

        const ticketEmoji = getEmoji(guild, 'ticket');
        const logEmbed = new EmbedBuilder()
          .setColor(config.embedColor)
          .setTitle(`${ticketEmoji} Ticket Transcript`.trim())
          .addFields(
            { name: 'Channel', value: `#${channel.name}`, inline: true },
            { name: 'Creator', value: ticket ? `<@${ticket.creatorId}>` : 'Unknown', inline: true },
            { name: 'Closed By', value: `${closedByUser.tag}`, inline: true },
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
        console.error('Error generating ticket transcript:', err);
      }
    }
  }

  db.removeTicket(channel.id);

  setTimeout(async () => {
    await channel.delete('Ticket Closed').catch(() => {});
  }, 5000);
}
