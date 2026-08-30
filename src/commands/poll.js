const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../db/database');
const config = require('../config');
const { getEmoji } = require('../utils/emojis');

// Helper to format vote progress bar
function createProgressBar(votes, total) {
  if (total === 0) return '░░░░░░░░░░ 0%';
  const percentage = Math.round((votes / total) * 100);
  const filledBlocks = Math.round((percentage / 100) * 10);
  const emptyBlocks = 10 - filledBlocks;
  return '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks) + ` ${percentage}% (${votes})`;
}

// Generate updated poll embed & buttons
function buildPollEmbedAndRows(poll, guild) {
  const totalVotes = Object.keys(poll.userVotes || {}).length;
  const pollEmoji = getEmoji(guild, 'poll');

  const counts = poll.options.map((_, idx) => {
    return Object.values(poll.userVotes || {}).filter(v => v === idx).length;
  });

  const description = poll.options.map((opt, idx) => {
    const bar = createProgressBar(counts[idx], totalVotes);
    return `**${idx + 1}. ${opt}**\n${bar}`;
  }).join('\n\n');

  const titleText = `${pollEmoji} Poll: ${poll.question}`.trim();
  const embed = new EmbedBuilder()
    .setTitle(titleText)
    .setColor(config.embedColor)
    .setDescription(description)
    .setFooter({ text: `Total Votes: ${totalVotes}` })
    .setTimestamp(poll.createdAt);

  const row = new ActionRowBuilder();
  poll.options.forEach((opt, idx) => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`poll_vote_${idx}`)
        .setLabel(`Option ${idx + 1}`)
        .setStyle(ButtonStyle.Primary)
    );
  });

  return { embed, row };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create server polls')
    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription('Create a poll')
        .addStringOption(opt =>
          opt.setName('question')
            .setDescription('Poll question')
            .setRequired(true)
        )
        .addStringOption(opt => opt.setName('option1').setDescription('Option 1').setRequired(true))
        .addStringOption(opt => opt.setName('option2').setDescription('Option 2').setRequired(true))
        .addStringOption(opt => opt.setName('option3').setDescription('Option 3').setRequired(false))
        .addStringOption(opt => opt.setName('option4').setDescription('Option 4').setRequired(false))
        .addStringOption(opt => opt.setName('option5').setDescription('Option 5').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('quick')
        .setDescription('Create a Yes/No poll')
        .addStringOption(opt =>
          opt.setName('question')
            .setDescription('Poll question')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const question = interaction.options.getString('question');

    let options = [];
    if (subcommand === 'quick') {
      options = ['Yes', 'No'];
    } else {
      for (let i = 1; i <= 5; i++) {
        const val = interaction.options.getString(`option${i}`);
        if (val) options.push(val);
      }
    }

    const pollData = {
      messageId: null,
      guildId: guild.id,
      authorId: interaction.user.id,
      authorTag: interaction.user.tag,
      question,
      options,
      userVotes: {},
      createdAt: Date.now()
    };

    const { embed, row } = buildPollEmbedAndRows(pollData, guild);
    const message = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

    pollData.messageId = message.id;
    db.savePoll(pollData);
  },

  // Button handler for voting
  async handleButton(interaction) {
    if (!interaction.customId.startsWith('poll_vote_')) return;

    const guild = interaction.guild;
    const optionIndex = parseInt(interaction.customId.replace('poll_vote_', ''), 10);
    const messageId = interaction.message.id;

    const poll = db.getPoll(messageId);
    if (!poll) {
      const denyEmoji = getEmoji(guild, 'Deny');
      return interaction.reply({ content: `${denyEmoji} Poll not found!`.trim(), ephemeral: true });
    }

    const userId = interaction.user.id;
    poll.userVotes = poll.userVotes || {};

    const previousVote = poll.userVotes[userId];
    if (previousVote === optionIndex) {
      const warnEmoji = getEmoji(guild, 'warning');
      return interaction.reply({ content: `${warnEmoji} You already voted for this!`.trim(), ephemeral: true });
    }

    poll.userVotes[userId] = optionIndex;
    db.savePoll(poll);

    const { embed, row } = buildPollEmbedAndRows(poll, guild);
    await interaction.message.edit({ embeds: [embed], components: [row] }).catch(() => {});

    const acceptEmoji = getEmoji(guild, 'Accept');
    return interaction.reply({
      content: `${acceptEmoji} Voted for: **${poll.options[optionIndex]}**`.trim(),
      ephemeral: true
    });
  }
};
