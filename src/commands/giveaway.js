const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const ms = require('ms');
const db = require('../db/database');
const config = require('../config');
const { getEmoji, setButtonEmoji } = require('../utils/emojis');

// Helper to pick random unique winners
function pickWinners(participants, winnerCount) {
  if (!participants || participants.length === 0) return [];
  const shuffled = [...participants].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(winnerCount, participants.length));
}

// End a giveaway and announce winners
async function endGiveaway(client, giveaway) {
  try {
    const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
    if (!channel) return;

    const guild = channel.guild;
    const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
    
    const winners = pickWinners(giveaway.entries, giveaway.winnerCount);
    giveaway.ended = true;
    giveaway.winners = winners;
    db.updateGiveaway(giveaway.messageId, giveaway);

    const winnerMention = winners.length > 0
      ? winners.map(w => `<@${w}>`).join(', ')
      : 'No valid entries';

    const giveawayEmoji = getEmoji(guild, 'giveaway');

    if (message) {
      const endedEmbed = EmbedBuilder.from(message.embeds[0])
        .setTitle(`${giveawayEmoji} GIVEAWAY ENDED ${giveawayEmoji}`.trim())
        .setColor(config.errorColor)
        .setDescription(`**Prize:** ${giveaway.prize}\n**Winners:** ${winnerMention}\n**Hosted By:** <@${giveaway.hostId}>`)
        .setFooter({ text: 'Giveaway Ended' });

      // Disable button
      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('giveaway_ended')
          .setLabel(`Ended (${giveaway.entries.length} Entries)`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      );

      await message.edit({ embeds: [endedEmbed], components: [disabledRow] }).catch(() => {});
    }

    if (winners.length > 0) {
      channel.send(`${giveawayEmoji} Congratulations ${winnerMention}! You won the giveaway for **${giveaway.prize}**!`.trim()).catch(() => {});
    } else {
      channel.send(`Giveaway for **${giveaway.prize}** ended, but there were no valid entries.`).catch(() => {});
    }

  } catch (err) {
    console.error('Error ending giveaway:', err);
  }
}

module.exports = {
  endGiveaway,
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Manage giveaways')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub =>
      sub.setName('start')
        .setDescription('Start a giveaway')
        .addStringOption(opt =>
          opt.setName('duration')
            .setDescription('Duration (e.g. 10m, 1h)')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('prize')
            .setDescription('Prize')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('winners')
            .setDescription('Winners count (default: 1)')
            .setMinValue(1)
            .setMaxValue(20)
            .setRequired(false)
        )
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('Channel')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('end')
        .setDescription('End a giveaway')
        .addStringOption(opt =>
          opt.setName('message_id')
            .setDescription('Giveaway to end')
            .setAutocomplete(true)
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('reroll')
        .setDescription('Reroll winners')
        .addStringOption(opt =>
          opt.setName('message_id')
            .setDescription('Giveaway to reroll')
            .setAutocomplete(true)
            .setRequired(true)
        )
    ),

  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    const giveaways = db.getGiveaways() || {};
    const guildGiveaways = Object.entries(giveaways)
      .map(([msgId, g]) => ({ id: msgId, ...g }))
      .filter(g => g.guildId === interaction.guild.id);

    const filtered = guildGiveaways
      .filter(g => (g.prize && g.prize.toLowerCase().includes(focusedValue)) || g.id.includes(focusedValue))
      .slice(0, 25);

    await interaction.respond(
      filtered.map(g => ({
        name: `${g.prize} (${g.ended ? 'Ended' : 'Active'}) - ${g.id}`.slice(0, 100),
        value: g.id
      }))
    );
  },

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guild = interaction.guild;

    if (subcommand === 'start') {
      const durationStr = interaction.options.getString('duration');
      const prize = interaction.options.getString('prize');
      const winnerCount = interaction.options.getInteger('winners') || 1;
      const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

      const durationMs = ms(durationStr);
      if (!durationMs || durationMs < 5000 || durationMs > ms('30d')) {
        const denyEmoji = getEmoji(guild, 'Deny');
        return interaction.reply({ 
          content: `${denyEmoji} Invalid duration format! Use formats like \`10m\`, \`2h\`, \`1d\`.`.trim(), 
          ephemeral: true 
        });
      }

      const endsAt = Date.now() + durationMs;
      const endTimestamp = Math.floor(endsAt / 1000);
      const giveawayEmoji = getEmoji(guild, 'giveaway');

      const embed = new EmbedBuilder()
        .setTitle(`${giveawayEmoji} NEW GIVEAWAY ${giveawayEmoji}`.trim())
        .setColor(config.embedColor)
        .setDescription(`**Prize:** ${prize}\n**Winners:** ${winnerCount}\n**Ends:** <t:${endTimestamp}:R> (<t:${endTimestamp}:f>)\n**Hosted By:** ${interaction.user}`)
        .setFooter({ text: 'Click the button below to join!' })
        .setTimestamp(endsAt);

      const row = new ActionRowBuilder().addComponents(
        setButtonEmoji(new ButtonBuilder().setCustomId('giveaway_join').setLabel('Join Giveaway (0)').setStyle(ButtonStyle.Primary), giveawayEmoji)
      );

      const message = await targetChannel.send({ embeds: [embed], components: [row] });

      const giveawayData = {
        messageId: message.id,
        channelId: targetChannel.id,
        guildId: guild.id,
        hostId: interaction.user.id,
        prize,
        winnerCount,
        endsAt,
        entries: [],
        ended: false
      };

      db.addGiveaway(giveawayData);

      setTimeout(() => {
        endGiveaway(interaction.client, giveawayData);
      }, durationMs);

      const acceptEmoji = getEmoji(guild, 'Accept');
      return interaction.reply({ 
        content: `${acceptEmoji} Giveaway started in ${targetChannel}!`.trim(), 
        ephemeral: true 
      });
    }

    if (subcommand === 'end') {
      const messageId = interaction.options.getString('message_id');
      const giveaways = db.getGiveaways();
      const giveaway = giveaways.find(g => g.messageId === messageId && !g.ended);

      if (!giveaway) {
        const denyEmoji = getEmoji(guild, 'Deny');
        return interaction.reply({ 
          content: `${denyEmoji} Active giveaway with that Message ID was not found!`.trim(), 
          ephemeral: true 
        });
      }

      await endGiveaway(interaction.client, giveaway);
      const acceptEmoji = getEmoji(guild, 'Accept');
      return interaction.reply({ content: `${acceptEmoji} Giveaway ended manually.`.trim(), ephemeral: true });
    }

    if (subcommand === 'reroll') {
      const messageId = interaction.options.getString('message_id');
      const giveaways = db.getGiveaways();
      const giveaway = giveaways.find(g => g.messageId === messageId && g.ended);

      if (!giveaway) {
        const denyEmoji = getEmoji(guild, 'Deny');
        return interaction.reply({ 
          content: `${denyEmoji} Ended giveaway with that Message ID was not found!`.trim(), 
          ephemeral: true 
        });
      }

      const winners = pickWinners(giveaway.entries, giveaway.winnerCount);
      const winnerMention = winners.length > 0 ? winners.map(w => `<@${w}>`).join(', ') : 'No valid entries';

      const giveawayEmoji = getEmoji(guild, 'giveaway');
      const channel = await interaction.client.channels.fetch(giveaway.channelId).catch(() => null);
      if (channel) {
        channel.send(`${giveawayEmoji} **GIVEAWAY REROLL:** New winner(s) for **${giveaway.prize}**: ${winnerMention}!`.trim()).catch(() => {});
      }

      const acceptEmoji = getEmoji(guild, 'Accept');
      return interaction.reply({ content: `${acceptEmoji} Giveaway rerolled! Winner(s): ${winnerMention}`.trim(), ephemeral: true });
    }
  },

  // Button handler for joining giveaways
  async handleButton(interaction) {
    if (interaction.customId !== 'giveaway_join') return;

    const guild = interaction.guild;
    const messageId = interaction.message.id;
    const giveaways = db.getGiveaways();
    const giveaway = giveaways.find(g => g.messageId === messageId);

    const denyEmoji = getEmoji(guild, 'Deny');
    if (!giveaway || giveaway.ended) {
      return interaction.reply({ content: `${denyEmoji} This giveaway has ended!`.trim(), ephemeral: true });
    }

    const userId = interaction.user.id;
    let entries = giveaway.entries || [];
    const giveawayEmoji = getEmoji(guild, 'giveaway');

    if (entries.includes(userId)) {
      // Leave giveaway
      entries = entries.filter(id => id !== userId);
      giveaway.entries = entries;
      db.updateGiveaway(messageId, giveaway);

      const row = new ActionRowBuilder().addComponents(
        setButtonEmoji(new ButtonBuilder().setCustomId('giveaway_join').setLabel(`Join Giveaway (${entries.length})`).setStyle(ButtonStyle.Primary), giveawayEmoji)
      );

      await interaction.message.edit({ components: [row] }).catch(() => {});
      return interaction.reply({ content: 'You left the giveaway.', ephemeral: true });
    } else {
      // Join giveaway
      entries.push(userId);
      giveaway.entries = entries;
      db.updateGiveaway(messageId, giveaway);

      const row = new ActionRowBuilder().addComponents(
        setButtonEmoji(new ButtonBuilder().setCustomId('giveaway_join').setLabel(`Join Giveaway (${entries.length})`).setStyle(ButtonStyle.Primary), giveawayEmoji)
      );

      await interaction.message.edit({ components: [row] }).catch(() => {});
      return interaction.reply({ content: `${giveawayEmoji} You have successfully entered the giveaway! Good luck!`.trim(), ephemeral: true });
    }
  }
};
