const { getEmoji } = require('./emojis');

/**
 * Check if the user executing an interaction is the Server Owner or configured Bot Owner.
 * @param {Interaction} interaction - Discord Interaction instance
 * @returns {boolean}
 */
function isOwner(interaction) {
  if (!interaction || !interaction.guild) return false;
  
  const isGuildOwner = interaction.guild.ownerId === interaction.user.id;
  const isBotOwner = process.env.OWNER_ID && interaction.user.id === process.env.OWNER_ID;

  return isGuildOwner || isBotOwner;
}

/**
 * Enforce server owner permission. If non-owner attempts, sends an ephemeral rejection.
 * @param {Interaction} interaction 
 * @returns {boolean} - true if owner, false if blocked
 */
async function enforceOwner(interaction) {
  if (isOwner(interaction)) {
    return true;
  }

  const denyEmoji = getEmoji(interaction.guild, 'Deny');
  const crossEmoji = getEmoji(interaction.guild, 'cross');

  const content = `${denyEmoji} ${crossEmoji} **ACCESS DENIED**\nThis dangerous command is restricted and can **ONLY** be executed by the **Server Owner** (<@${interaction.guild.ownerId}>)!`;

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content, ephemeral: true }).catch(() => {});
  } else {
    await interaction.reply({ content, ephemeral: true }).catch(() => {});
  }

  return false;
}

module.exports = {
  isOwner,
  enforceOwner
};
