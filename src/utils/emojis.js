/**
 * Helper utility to dynamically resolve custom server emojis from guild.emojis.cache.
 * Strictly uses custom server emojis from user's server setup.
 * Does NOT fall back to standard Unicode emojis.
 */

// Aliases dictionary mapping logical keys to exact custom server emoji names
const EMOJI_ALIASES = {
  success: ['Frame18', 'Accept', 'check', 'success', 'verified'],
  error: ['Frame17', 'Deny', 'cross', 'X_', 'error'],
  warning: ['warning', 'Deny', 'Frame17'],
  info: ['info', 'arrow'],
  check: ['Frame18', 'check', 'Accept'],
  cross: ['Frame17', 'cross', 'Deny', 'X_'],
  Accept: ['Frame18', 'Accept', 'check'],
  Deny: ['Frame17', 'Deny', 'cross', 'X_'],
  verified: ['verified', 'Frame6', 'Accept', 'check'],
  online: ['online'],
  offline: ['offline'],
  calendar: ['Calendar'],
  boost: ['server_boost', 'boost'],
  arrow: ['arrow'],
  honeypot: ['honeypot', 'Frame17', 'Deny', 'cross'],
  giveaway: ['Frame8', 'giveaway', 'gift', 'boost', 'server_boost'],
  gift: ['Frame8', 'gift', 'giveaway'],
  ticket: ['ticket', 'Calendar', 'verified'],
  bug: ['Frame7', 'bug', 'error'],
  staff: ['Frame6', 'staff', 'shield', 'verified'],
  shield: ['Frame6', 'shield', 'staff'],
  play: ['Frame10', 'play', 'Accept'],
  pause: ['Frame9', 'pause'],
  stop: ['Frame11', 'stop', 'Deny', 'cross'],
  skip: ['Frame22', 'skip', 'next'],
  shuffle: ['Frame21', 'shuffle', 'mix'],
  queue: ['Frame20', 'queue', 'list'],
  lock: ['Frame13', 'lock', 'private', 'closed'],
  unlock: ['Frame14', 'unlock', 'public', 'open'],
  users: ['Frame12', 'users', 'people', 'members', 'allowed'],
  private: ['Frame13', 'lock', 'private'],
  public: ['Frame14', 'unlock', 'public'],
  allowed: ['Frame12', 'users', 'people', 'members', 'allowed'],
  music: ['Frame19', 'music', 'queue'],
  nowplaying: ['Frame19', 'music']
};

/**
 * Find a matching custom emoji in guild cache or client cache.
 * Returns formatted custom emoji string or empty string.
 */
function getEmoji(guild, key, customFallback = '') {
  if (!guild) {
    return customFallback || '';
  }

  const searchNames = EMOJI_ALIASES[key] ? [key, ...EMOJI_ALIASES[key]] : [key];

  // 1. Search Guild Emoji Cache
  if (guild.emojis && guild.emojis.cache) {
    for (const name of searchNames) {
      const nameLower = name.toLowerCase();
      const customEmoji = guild.emojis.cache.find(e => 
        e.name.toLowerCase() === nameLower || 
        e.name.toLowerCase().includes(nameLower)
      );

      if (customEmoji) {
        return customEmoji.toString();
      }
    }
  }

  // 2. Search Client Application-wide Emoji Cache
  if (guild.client && guild.client.emojis && guild.client.emojis.cache) {
    for (const name of searchNames) {
      const nameLower = name.toLowerCase();
      const customEmoji = guild.client.emojis.cache.find(e => 
        e.name.toLowerCase() === nameLower || 
        e.name.toLowerCase().includes(nameLower)
      );

      if (customEmoji) {
        return customEmoji.toString();
      }
    }
  }

  return customFallback || '';
}

/**
 * Safely attach custom emoji to a Discord ButtonBuilder if valid emoji string is present.
 */
function setButtonEmoji(button, emojiString) {
  if (emojiString && typeof emojiString === 'string' && emojiString.trim() !== '') {
    try {
      button.setEmoji(emojiString);
    } catch (e) {}
  }
  return button;
}

/**
 * React to a message using custom server emoji if available.
 */
async function reactWithEmoji(message, key) {
  if (!message || !message.guild) {
    return;
  }

  const guild = message.guild;
  const searchNames = EMOJI_ALIASES[key] ? [key, ...EMOJI_ALIASES[key]] : [key];

  // Search guild emojis
  if (guild.emojis && guild.emojis.cache) {
    for (const name of searchNames) {
      const nameLower = name.toLowerCase();
      const customEmoji = guild.emojis.cache.find(e => 
        e.name.toLowerCase() === nameLower || 
        e.name.toLowerCase().includes(nameLower)
      );

      if (customEmoji) {
        try {
          await message.react(customEmoji.id);
          return;
        } catch (err) {}
      }
    }
  }
}

module.exports = {
  getEmoji,
  setButtonEmoji,
  reactWithEmoji,
  EMOJI_ALIASES
};
