const { Events, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { syncServerEmojis } = require('../utils/emojiSync');

module.exports = {
  name: Events.GuildCreate,
  async execute(guild, client) {
    console.log(`Joined ${guild.name} (${guild.id})`);

    try {
      await syncServerEmojis(guild, client);
    } catch (err) {}

    const tutorialEmbed = new EmbedBuilder()
      .setColor('#B4C6FF')
      .setTitle(`System Bot • Quick Setup Guide`)
      .setDescription(`Thanks for adding **System Bot** to **${guild.name}**!\nHere is how to get your server configured in 3 steps.`)
      .addFields(
        {
          name: '1. Server Setup (`/panel` or `/setup`)',
          value: 'Run `/panel` in any channel to configure welcome messages, support tickets, temp voice, honeypot anti-raid, and audit logs.'
        },
        {
          name: '2. Auto-Create Channels',
          value: '• Support category & tickets\n• `➕│Join To Create` voice trigger\n• Live member & online voice counters\n• `📁 SERVER LOGS` audit category\n• `🎉┃birthdays` celebration calendar & role'
        },
        {
          name: '3. Core Commands',
          value: '• `/event send` — Post server events & games with RSVP\n• `/giveaway start` — Start automated giveaways\n• `/poll send` — Create community vote polls\n• `/purge` — Delete 1–100 messages\n• `/ai` — Ask AI questions\n• `/reminder set` — Schedule timed reminders\n• `/music play` — Play music in voice channels'
        },
        {
          name: '4. Web Dashboard',
          value: 'Configure and monitor your bot from the local web dashboard at `http://localhost:3000`.'
        }
      )
      .setFooter({ text: 'System Bot • Made by tudustech' })
      .setTimestamp();

    try {
      let targetChannel = guild.systemChannel;

      if (!targetChannel || !targetChannel.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.SendMessages)) {
        targetChannel = guild.channels.cache.find(
          c => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.SendMessages)
        );
      }

      if (targetChannel) {
        await targetChannel.send({ embeds: [tutorialEmbed] });
      }
    } catch (err) {}

    try {
      const owner = await guild.fetchOwner();
      if (owner) {
        await owner.send({ embeds: [tutorialEmbed] }).catch(() => {});
      }
    } catch (err) {}
  }
};
