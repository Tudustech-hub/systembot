const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const config = require('../config');
const { getEmoji } = require('../utils/emojis');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Send embed messages')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub =>
      sub.setName('send')
        .setDescription('Send an embed')
        .addStringOption(opt => opt.setName('description').setDescription('Message text').setRequired(false))
        .addStringOption(opt => opt.setName('title').setDescription('Title').setRequired(false))
        .addStringOption(opt => opt.setName('code').setDescription('Code snippet').setRequired(false))
        .addStringOption(opt => opt.setName('language').setDescription('Code language').setRequired(false))
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addStringOption(opt => opt.setName('color').setDescription('HEX color (e.g. #5865F2)').setRequired(false))
        .addStringOption(opt => opt.setName('thumbnail').setDescription('Thumbnail URL').setRequired(false))
        .addStringOption(opt => opt.setName('image').setDescription('Image URL').setRequired(false))
        .addStringOption(opt => opt.setName('footer').setDescription('Footer text').setRequired(false))
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guild = interaction.guild;

    if (subcommand === 'send') {
      const descriptionRaw = interaction.options.getString('description');
      const codeRaw = interaction.options.getString('code');
      const language = (interaction.options.getString('language') || 'js').trim();
      const title = interaction.options.getString('title');
      const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
      const colorInput = interaction.options.getString('color');
      const thumbnail = interaction.options.getString('thumbnail');
      const image = interaction.options.getString('image');
      const footer = interaction.options.getString('footer');

      if (!descriptionRaw && !codeRaw && !title) {
        const denyEmoji = getEmoji(guild, 'Deny');
        return interaction.reply({
          content: `${denyEmoji} Please provide a title, description, or code.`,
          ephemeral: true
        });
      }

      let embedColor = config.embedColor;
      if (colorInput) {
        if (/^#?[0-9A-Fa-f]{6}$/.test(colorInput)) {
          embedColor = colorInput.startsWith('#') ? colorInput : `#${colorInput}`;
        }
      }

      const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setTimestamp();

      if (title) embed.setTitle(title);
      if (descriptionRaw) embed.setDescription(descriptionRaw.replace(/\\n/g, '\n'));

      if (codeRaw) {
        const formattedCode = codeRaw.replace(/\\n/g, '\n');
        const codeBlock = `\`\`\`${language}\n${formattedCode}\n\`\`\``;
        if (!descriptionRaw) embed.setDescription(codeBlock);
        else embed.addFields({ name: 'Code', value: codeBlock });
      }

      if (thumbnail) {
        try { new URL(thumbnail); embed.setThumbnail(thumbnail); } catch (e) {}
      }

      if (image) {
        try { new URL(image); embed.setImage(image); } catch (e) {}
      }

      if (footer) {
        embed.setFooter({ text: footer, iconURL: guild.iconURL() });
      }

      try {
        await targetChannel.send({ embeds: [embed] });
        const checkEmoji = getEmoji(guild, 'Accept');
        return interaction.reply({ 
          content: `${checkEmoji} Embed sent to ${targetChannel}!`, 
          ephemeral: true 
        });
      } catch (err) {
        const crossEmoji = getEmoji(guild, 'Deny');
        return interaction.reply({ 
          content: `${crossEmoji} Couldn't send embed to ${targetChannel}.`, 
          ephemeral: true 
        });
      }
    }
  }
};
