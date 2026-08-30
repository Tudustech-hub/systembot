const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const config = require('../config');
const { getEmoji } = require('../utils/emojis');
const { enforceOwner } = require('../utils/owner');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rules')
    .setDescription('View server rules')
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('Channel to post rules (Owner only)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),

  async execute(interaction) {
    const guild = interaction.guild;
    const targetChannel = interaction.options.getChannel('channel');

    const verifiedEmoji = getEmoji(guild, 'verified', '');
    const arrowEmoji = getEmoji(guild, 'arrow', '');
    const checkEmoji = getEmoji(guild, 'check', '');
    const acceptEmoji = getEmoji(guild, 'Accept', '');

    const rulesText = 
      `# ${verifiedEmoji} SERVER RULES\n\n` +
      `**1. Be Respectful**\n` +
      `${arrowEmoji} Treat everyone with respect. No harassment, hate speech, or toxicity.\n\n` +
      `**2. Keep it SFW**\n` +
      `${arrowEmoji} No NSFW, graphic, or illegal content anywhere.\n\n` +
      `**3. No Spam or Self-Promo**\n` +
      `${arrowEmoji} No advertising, mass mentions, or DM spam.\n\n` +
      `**4. Use Correct Channels**\n` +
      `${arrowEmoji} Keep discussions relevant to channel topics.\n\n` +
      `**5. Follow Staff Directions**\n` +
      `${arrowEmoji} Staff decisions are final. Open a ticket if you need help.\n\n` +
      `*${acceptEmoji} Staying in this server means you agree to these rules.*`;

    const rulesEmbed = new EmbedBuilder()
      .setColor(config.embedColor)
      .setDescription(rulesText)
      .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
      .setTimestamp();

    if (targetChannel) {
      const isAuthorized = await enforceOwner(interaction);
      if (!isAuthorized) return;

      await targetChannel.send({ embeds: [rulesEmbed] });
      return interaction.reply({ content: `${checkEmoji} Rules posted to ${targetChannel}!`, ephemeral: true });
    }

    return interaction.reply({ embeds: [rulesEmbed] });
  }
};
