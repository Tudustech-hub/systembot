const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getEmoji } = require('../utils/emojis');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Bulk delete messages')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(opt =>
      opt.setName('amount')
        .setDescription('Number of messages (1-100)')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('Filter by user')
        .setRequired(false)
    ),

  async execute(interaction) {
    const guild = interaction.guild;
    const amount = interaction.options.getInteger('amount');
    const targetUser = interaction.options.getUser('user');

    await interaction.deferReply({ ephemeral: true });

    try {
      const fetched = await interaction.channel.messages.fetch({ limit: amount });

      let messagesToDelete = fetched;
      if (targetUser) {
        messagesToDelete = fetched.filter(m => m.author.id === targetUser.id);
      }

      if (messagesToDelete.size === 0) {
        const denyEmoji = getEmoji(guild, 'Deny');
        return interaction.editReply({
          content: `${denyEmoji} No matching messages found.`
        });
      }

      const deleted = await interaction.channel.bulkDelete(messagesToDelete, true);
      const checkEmoji = getEmoji(guild, 'check');
      const userText = targetUser ? ` from ${targetUser}` : '';

      return interaction.editReply({
        content: `${checkEmoji} Deleted **${deleted.size}** message(s)${userText}.`
      });

    } catch (err) {
      const crossEmoji = getEmoji(guild, 'cross');
      return interaction.editReply({
        content: `${crossEmoji} Couldn't delete messages older than 14 days.`
      });
    }
  }
};
