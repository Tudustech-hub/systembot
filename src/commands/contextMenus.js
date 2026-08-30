const { ContextMenuCommandBuilder, ApplicationCommandType, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { getEmoji } = require('../utils/emojis');
const { GoogleGenAI } = require('@google/genai');

const apiKeys = config.geminiApiKeys && config.geminiApiKeys.length > 0 
  ? config.geminiApiKeys 
  : [config.geminiApiKey];
const aiClients = apiKeys.map(key => new GoogleGenAI({ apiKey: key }));

const userInfoMenu = new ContextMenuCommandBuilder()
  .setName('User Info')
  .setType(ApplicationCommandType.User);

const askAiMenu = new ContextMenuCommandBuilder()
  .setName('Ask AI About This')
  .setType(ApplicationCommandType.Message);

async function handleUserContextMenu(interaction) {
  const targetUser = interaction.targetUser;
  const guild = interaction.guild;
  const member = interaction.targetMember || await guild.members.fetch(targetUser.id).catch(() => null);

  const verifiedEmoji = getEmoji(guild, 'verified');
  const embed = new EmbedBuilder()
    .setColor(config.embedColor)
    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
    .setTitle(`${verifiedEmoji} Profile: ${targetUser.tag || targetUser.username}`.trim())
    .addFields(
      { name: 'User ID', value: `\`${targetUser.id}\``, inline: true },
      { name: 'Account Created', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`, inline: true }
    );

  if (member) {
    const roles = member.roles.cache.filter(r => r.name !== '@everyone').map(r => `${r}`).join(' ') || 'None';
    embed.addFields(
      { name: 'Joined Server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
      { name: 'Highest Role', value: `${member.roles.highest}`, inline: true },
      { name: 'Roles', value: roles.slice(0, 1000) }
    );
  }

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleMessageContextMenu(interaction) {
  const targetMessage = interaction.targetMessage;
  const content = targetMessage.content;

  if (!content || !content.trim()) {
    return interaction.reply({ content: 'That message has no text content to analyze.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const client = aiClients[0];
    const prompt = `You are a helpful assistant on Discord. The user selected this message: "${content}". Provide a clear, helpful, concise explanation, summary, or answer about what this message means or says.`;

    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    const replyText = response && response.text ? response.text.trim() : 'Could not generate an analysis for this message.';

    const embed = new EmbedBuilder()
      .setColor(config.embedColor)
      .setTitle(`🤖 AI Analysis`)
      .setDescription(replyText.slice(0, 4000))
      .setFooter({ text: `Target message by ${targetMessage.author.tag}` });

    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    return interaction.editReply({ content: `AI Error: ${err.message}` });
  }
}

module.exports = {
  commands: [userInfoMenu, askAiMenu],
  handleUserContextMenu,
  handleMessageContextMenu
};
