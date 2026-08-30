const { PermissionFlagsBits } = require('discord.js');

/**
 * Automatically syncs custom System Bot emojis from the template cache to the target guild.
 * @param {import('discord.js').Guild} targetGuild
 * @param {import('discord.js').Client} client
 * @returns {Promise<{ created: string[], skipped: string[], errors: string[] }>}
 */
async function syncServerEmojis(targetGuild, client) {
  const results = { created: [], skipped: [], errors: [] };

  if (!targetGuild.members.me?.permissions.has(PermissionFlagsBits.ManageGuildExpressions) &&
      !targetGuild.members.me?.permissions.has(PermissionFlagsBits.ManageEmojisAndStickers)) {
    console.log(`⚠️ Missing Manage Emojis permission in ${targetGuild.name} to auto-upload emojis.`);
    return results;
  }

  // Find all emojis available across all client guilds or cache
  const sourceEmojis = new Map();
  client.emojis.cache.forEach(emoji => {
    if (emoji.name && !sourceEmojis.has(emoji.name.toLowerCase())) {
      sourceEmojis.set(emoji.name.toLowerCase(), emoji);
    }
  });

  if (sourceEmojis.size === 0) {
    return results;
  }

  // Fetch current guild emojis
  const currentGuildEmojis = await targetGuild.emojis.fetch().catch(() => targetGuild.emojis.cache);

  for (const [nameLower, sourceEmoji] of sourceEmojis) {
    // Check if target guild already has this emoji
    const exists = currentGuildEmojis.some(e => e.name.toLowerCase() === nameLower);
    if (exists) {
      results.skipped.push(sourceEmoji.name);
      continue;
    }

    // Check emoji limit (50 for standard servers)
    if (currentGuildEmojis.size >= 50) {
      console.log(`⚠️ Emoji limit reached for guild ${targetGuild.name}`);
      break;
    }

    try {
      const createdEmoji = await targetGuild.emojis.create({
        attachment: sourceEmoji.url,
        name: sourceEmoji.name,
        reason: 'Auto-synced System Bot custom emoji'
      });
      results.created.push(createdEmoji.name);
      console.log(`✅ Auto-created emoji :${createdEmoji.name}: in ${targetGuild.name}`);
    } catch (err) {
      console.error(`❌ Could not auto-upload emoji ${sourceEmoji.name} to ${targetGuild.name}:`, err.message);
      results.errors.push(sourceEmoji.name);
    }
  }

  return results;
}

module.exports = { syncServerEmojis };
