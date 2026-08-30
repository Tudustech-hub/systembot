const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../db/database');
const ms = require('ms');
const config = require('../config');
const { getEmoji, reactWithEmoji } = require('../utils/emojis');
const { GoogleGenAI } = require('@google/genai');
const aiQuota = require('../utils/aiQuota');
const { sendAuditLog } = require('../utils/auditLogger');

// Initialize Gemini AI Clients Pool (Supports multi-key failover rotation)
const apiKeys = config.geminiApiKeys && config.geminiApiKeys.length > 0 
  ? config.geminiApiKeys 
  : [config.geminiApiKey];

const aiClients = apiKeys.map(key => new GoogleGenAI({ apiKey: key }));
aiQuota.totalKeys = apiKeys.length;

// Chill, natural, human tone avoiding robotic/corporate AI mannerisms and strictly prohibiting code blocks
const SYSTEM_INSTRUCTION = "You are a chill, friendly, and natural helper in Tudustech's server. Talk naturally like a real person on Discord, not like a robotic or corporate AI. Avoid cliché AI openings like 'Sure thing!', 'Certainly!', 'As an AI...', or long verbose essays. Be concise, direct, relaxed, and genuinely helpful. STRICT RULE: NEVER write or output code blocks, scripts, or formatted code snippets under any circumstances to save token credits (explain concepts or steps in casual plain text instead). Never state your name or identity at the start of a reply. Use Discord context naturally.";

// Fallback Model Hierarchy (Auto switches if a model hits rate limit or quota exhaustion)
const CANDIDATE_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash'
];

// Helper: Extract Discord server, member, roles, and channel context for Gemini AI
function buildDiscordContext(message) {
  const guild = message.guild;
  const author = message.author;
  const member = message.member;

  // Author roles
  const authorRoles = member && member.roles ? member.roles.cache.filter(r => r.name !== '@everyone').map(r => r.name).join(', ') || 'None' : 'None';
  const authorNickname = member ? member.displayName : author.username;

  // Mentioned members details
  const mentionedMembersInfo = [];
  if (message.mentions && message.mentions.members) {
    message.mentions.members.forEach(m => {
      if (m.id !== message.client.user.id) {
        const roles = m.roles.cache.filter(r => r.name !== '@everyone').map(r => r.name).join(', ') || 'None';
        mentionedMembersInfo.push(`- Mentioned User: ${m.user.tag} (Nickname/Display Name: "${m.displayName}", ID: ${m.id}), Roles: [${roles}]`);
      }
    });
  }

  // Channel info
  const channelInfo = `Channel: #${message.channel.name}${message.channel.topic ? ` (Topic: "${message.channel.topic}")` : ''}`;

  // Server info
  const serverInfo = `Server Name: "${guild.name}" (Total Members: ${guild.memberCount}, Owner ID: ${guild.ownerId})`;

  let contextSummary = `[SYSTEM DISCORD CONTEXT]\n${serverInfo}\n${channelInfo}\nAsking Member: ${author.tag} (Nickname/Display Name: "${authorNickname}", ID: ${author.id})\nAsking Member Roles: [${authorRoles}]`;

  if (mentionedMembersInfo.length > 0) {
    contextSummary += `\nOther Mentioned Members:\n${mentionedMembersInfo.join('\n')}`;
  }

  contextSummary += `\n[END DISCORD CONTEXT]`;

  return contextSummary;
}

// Helper: Walk up Discord message reply chains to construct multi-turn conversation history for Gemini AI
async function fetchConversationHistory(message) {
  const history = [];
  let currentMsg = message;
  const botId = message.client.user.id;
  const botMentionRegex = new RegExp(`<@!?${botId}>`, 'g');

  // Walk back up to 6 reply levels
  let depth = 0;
  while (currentMsg && depth < 6) {
    let cleanText = currentMsg.content.replace(botMentionRegex, '').trim();

    if (cleanText) {
      if (currentMsg.author.id === botId) {
        history.unshift({ role: 'model', parts: [{ text: cleanText }] });
      } else {
        history.unshift({ role: 'user', parts: [{ text: cleanText }] });
      }
    }

    if (currentMsg.reference && currentMsg.reference.messageId) {
      try {
        currentMsg = await currentMsg.channel.messages.fetch(currentMsg.reference.messageId).catch(() => null);
        depth++;
      } catch (err) {
        break;
      }
    } else {
      break;
    }
  }

  // Ensure conversation turns alternate properly (Gemini requirements: user -> model -> user)
  const sanitizedHistory = [];
  for (const item of history) {
    if (sanitizedHistory.length === 0) {
      if (item.role === 'user') sanitizedHistory.push(item);
    } else {
      const lastItem = sanitizedHistory[sanitizedHistory.length - 1];
      if (lastItem.role !== item.role) {
        sanitizedHistory.push(item);
      } else {
        // Merge adjacent messages of the same role
        lastItem.parts[0].text += `\n${item.parts[0].text}`;
      }
    }
  }

  return sanitizedHistory;
}

// Helper: Generate Gemini Content with Multi-Key Pool & Model Fallback Chain
async function generateContentWithFallback(conversationHistory) {
  let lastError = null;

  for (let keyIdx = 0; keyIdx < aiClients.length; keyIdx++) {
    const client = aiClients[keyIdx];

    for (const modelName of CANDIDATE_MODELS) {
      try {
        let response;
        try {
          // Try with Google Search tool enabled
          response = await client.models.generateContent({
            model: modelName,
            contents: conversationHistory,
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
              tools: [{ googleSearch: {} }]
            }
          });
        } catch (toolErr) {
          // Fallback without tools if googleSearch fails on model
          response = await client.models.generateContent({
            model: modelName,
            contents: conversationHistory,
            config: {
              systemInstruction: SYSTEM_INSTRUCTION
            }
          });
        }

        if (response && response.text) {
          aiQuota.currentModel = modelName;
          aiQuota.activeKeyIndex = keyIdx;
          return { text: response.text, modelName, keyIndex: keyIdx };
        }
      } catch (err) {
        console.warn(`Gemini API Key #${keyIdx + 1} with model ${modelName} failed/exhausted:`, err.status || err.message);
        lastError = err;
      }
    }
  }

  throw lastError || new Error('All Gemini API keys and model fallbacks failed');
}

// Helper: Purge last 1 day (24h) of messages from a specific user across text channels
async function purgeUserMessagesLast24Hours(guild, userId) {
  const ONE_DAY_MS = 86400000;
  const now = Date.now();

  try {
    const textChannels = guild.channels.cache.filter(c => c.isTextBased() && !c.isVoiceBased());
    for (const [, channel] of textChannels) {
      try {
        const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
        if (!messages || messages.size === 0) continue;

        const userMessages = messages.filter(m => 
          m.author.id === userId && 
          (now - m.createdTimestamp) <= ONE_DAY_MS
        );

        if (userMessages.size > 0) {
          await channel.bulkDelete(userMessages, true).catch(() => {});
        }
      } catch (e) {}
    }
  } catch (err) {
    console.error('Error purging user messages last 24h:', err);
  }
}

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (!message.guild) return;
    const guild = message.guild;

    const guildConfig = db.getGuildConfig(guild.id);

    // ===============================================
    // 1. HONEYPOT TRAP PROTECTION
    // ===============================================
    if (guildConfig.honeypotChannelId && message.channel.id === guildConfig.honeypotChannelId) {
      const member = message.member || await guild.members.fetch(message.author.id).catch(() => null);
      if (member && (member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ManageGuild))) {
        return;
      }

      // Delete triggering message immediately
      await message.delete().catch(() => {});

      const action = guildConfig.honeypotAction || 'ban';
      const reason = 'Honeypot Trap Triggered (Automated Spam / Raid Bot Detection)';
      const targetUserId = message.author.id;

      try {
        // 1. Execute Punitive Action & Purge Last 1 Day (24 Hours) of Messages
        if (action === 'ban') {
          await guild.members.ban(targetUserId, { 
            deleteMessageSeconds: 86400, // Discord Native 24h (1 Day) Message Purge on Ban!
            reason 
          });
        } else if (action === 'kick' && member && member.kickable) {
          await purgeUserMessagesLast24Hours(guild, targetUserId);
          await member.kick(reason);
        } else if (action === 'timeout' && member && member.moderatable) {
          await purgeUserMessagesLast24Hours(guild, targetUserId);
          await member.timeout(ms('28d'), reason);
        }

        console.log(`HONEYPOT TRIGGERED: ${message.author.tag} (${targetUserId}) was ${action}ned and 1 day of messages purged.`);

        // Log alert directly to #mod-logs channel
        const honeypotEmoji = getEmoji(guild, 'honeypot');
        const alertEmbed = new EmbedBuilder()
          .setColor(config.errorColor)
          .setTitle(`${honeypotEmoji} HONEYPOT TRAP TRIGGERED`.trim())
          .setDescription(`An account triggered the honeypot in ${message.channel} and was automatically **${action.toUpperCase()}NED**.\n**Last 1 Day (24 Hours) of messages from this user have been purged server-wide.**`)
          .addFields(
            { name: 'Target User', value: `${message.author.tag} (\`${targetUserId}\`)`, inline: true },
            { name: 'Action Taken', value: `\`${action.toUpperCase()}\``, inline: true },
            { name: 'Message Purge', value: `\`24 Hours (1 Day)\``, inline: true }
          )
          .setTimestamp();

        await sendAuditLog(guild, alertEmbed, 'honeypot');
      } catch (err) {
        console.error('Error executing honeypot action:', err);
      }
      return;
    }

    // Ignore bots for all subsequent features
    if (message.author.bot) return;

    // ===============================================
    // 2. DYNAMIC VOICE ROOM MEMBER MENTION PERMISSION GRANT (MUST REPLY TO MESSAGE WITH @person)
    // ===============================================
    const tempVoice = db.getTempVoiceChannel(message.channel.id);
    const isReplyMsg = !!(message.reference && message.reference.messageId);

    if (tempVoice && isReplyMsg && message.mentions.members && message.mentions.members.size > 0) {
      const isOwner = message.author.id === tempVoice.ownerId;
      const isAdmin = message.member && (message.member.permissions.has(PermissionFlagsBits.Administrator) || message.member.permissions.has(PermissionFlagsBits.ManageChannels));

      if (isOwner || isAdmin) {
        const addedMembers = [];
        let allowedUsers = tempVoice.allowedUsers || [tempVoice.ownerId];

        for (const [, targetMember] of message.mentions.members) {
          if (targetMember.id !== message.client.user.id) {
            await message.channel.permissionOverwrites.edit(targetMember.user, {
              Connect: true,
              ViewChannel: true,
              Speak: true,
              Stream: true,
              AttachFiles: true,
              EmbedLinks: true,
              SendMessages: true,
              ReadMessageHistory: true,
              UseExternalEmojis: true,
              AddReactions: true
            }).catch(() => {});

            if (!allowedUsers.includes(targetMember.id)) {
              allowedUsers.push(targetMember.id);
            }
            addedMembers.push(targetMember.toString());
          }
        }

        tempVoice.allowedUsers = allowedUsers;
        db.updateTempVoiceChannel(message.channel.id, tempVoice);

        if (addedMembers.length > 0) {
          const checkEmoji = getEmoji(guild, 'Accept');
          await message.reply(`${checkEmoji} Granted ${addedMembers.join(', ')} permission to join **${message.channel.name}**!`.trim()).catch(() => {});
        }
      }
    }

    // ===============================================
    // 3. GEMINI AI MULTI-TURN CONVERSATION (STRICTLY DISABLED IN TICKETS)
    // ===============================================
    const isDirectMention = message.mentions.has(message.client.user) && !message.mentions.everyone;
    
    // Check if message is a reply to the bot
    let isReplyToBot = false;
    if (message.reference && message.reference.messageId) {
      try {
        const referencedMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
        if (referencedMsg && referencedMsg.author.id === message.client.user.id) {
          isReplyToBot = true;
        }
      } catch (e) {}
    }

    if (isDirectMention || isReplyToBot) {
      // Completely disable AI responses inside ticket channels!
      const ticket = db.getTicket(message.channel.id);
      const isTicketChannel = !!ticket || message.channel.name.toLowerCase().startsWith('ticket-');

      if (isTicketChannel) {
        return; // Ignore AI inside ticket channels completely
      }

      // General channel restriction check
      const channelName = message.channel.name.toLowerCase();
      const aiChannelId = guildConfig.aiChannelId;

      const isGeneralChannel = channelName.includes('general') || (aiChannelId && message.channel.id === aiChannelId);

      if (!isGeneralChannel) {
        let generalTarget = '**#general**';
        if (aiChannelId) {
          generalTarget = `<#${aiChannelId}>`;
        } else {
          const generalChan = guild.channels.cache.find(c => c.isTextBased() && c.name.toLowerCase().includes('general'));
          if (generalChan) generalTarget = `${generalChan}`;
        }

        return message.reply(`Please ask in ${generalTarget}.`).catch(() => {});
      }

      // Show typing indicator while generating AI response
      await message.channel.sendTyping().catch(() => {});

      // Build multi-turn conversation history
      const conversationHistory = await fetchConversationHistory(message);

      if (conversationHistory.length === 0) {
        return message.reply("How's it going? How can I help?").catch(() => {});
      }

      // Prepend Discord server context to the latest user prompt in the history array
      const discordContext = buildDiscordContext(message);
      const lastTurn = conversationHistory[conversationHistory.length - 1];
      if (lastTurn && lastTurn.role === 'user') {
        lastTurn.parts[0].text = `${discordContext}\nUser Query: ${lastTurn.parts[0].text}`;
      }

      try {
        // Record request in quota tracker
        aiQuota.recordRequest(message.author.id);

        const result = await generateContentWithFallback(conversationHistory);
        const replyText = result.text.trim();

        // If response is longer than Discord's 2000 character limit, split into chunks
        if (replyText.length > 2000) {
          const chunks = replyText.match(/[\s\S]{1,1900}/g) || [replyText];
          for (let i = 0; i < chunks.length; i++) {
            if (i === 0) {
              await message.reply(chunks[i]).catch(() => {});
            } else {
              await message.channel.send(chunks[i]).catch(() => {});
            }
          }
        } else {
          await message.reply(replyText).catch(() => {});
        }
      } catch (err) {
        console.error('Gemini AI Generation Error:', err);

        const isQuotaError = err.status === 429 || (err.message && err.message.includes('429'));
        if (isQuotaError) {
          aiQuota.markQuotaExhausted();
          const status = aiQuota.getStatus(message.author.id);
          const quotaEmbed = new EmbedBuilder()
            .setColor(config.warningColor)
            .setTitle(`Daily AI Quota Reached`)
            .setDescription(`AI limit reached for today. Resets in **${status.resetTimeFormat}** (UTC Midnight).`);

          await message.reply({ embeds: [quotaEmbed] }).catch(() => {});
        } else {
          await message.reply("Something went wrong while processing that.").catch(() => {});
        }
      }
      return;
    }

    // ===============================================
    // 4. COUNTING GAME (EASY MODE & EXTENDED AUTO-CLEANUP)
    // ===============================================
    if (guildConfig.countingChannelId && message.channel.id === guildConfig.countingChannelId) {
      const state = db.getCountingState(guild.id);
      const content = message.content.trim();
      const countNumber = parseInt(content, 10);
      const isEasyMode = guildConfig.countingMode !== 'hard'; // Default to Easy Mode
      const allowSolo = guildConfig.countingAllowSolo === true; // Toggle for solo/consecutive counting
      const CLEANUP_DELAY_MS = 8000; // Extended deletion delay (8 seconds)

      const expectedCount = state.currentCount + 1;
      const crossEmojiText = getEmoji(guild, 'cross');

      // If message is not a valid number
      if (isNaN(countNumber) || content !== countNumber.toString()) {
        if (isEasyMode) {
          const warnMsg = await message.channel.send(`${crossEmojiText} ${message.author}, only numbers in this channel! Next number is **${expectedCount}**!`.trim()).catch(() => null);
          setTimeout(async () => {
            await message.delete().catch(() => {});
            if (warnMsg) await warnMsg.delete().catch(() => {});
          }, CLEANUP_DELAY_MS);
        }
        return;
      }

      // Rule 1: Cannot count twice in a row (Unless solo counting is enabled)
      if (!allowSolo && state.lastUserId === message.author.id) {
        if (isEasyMode) {
          const warnMsg = await message.channel.send(`${crossEmojiText} **${message.author.username}**, you can't count twice in a row! Next number is still **${expectedCount}**!`.trim()).catch(() => null);
          setTimeout(async () => {
            await message.delete().catch(() => {});
            if (warnMsg) await warnMsg.delete().catch(() => {});
          }, CLEANUP_DELAY_MS);
          return;
        } else {
          // Hard Mode Reset Announcement Embed
          const resetEmbed = new EmbedBuilder()
            .setColor(config.errorColor)
            .setTitle(`${crossEmojiText} Count Reset to 0`.trim())
            .setDescription(`**${message.author.username}** counted twice in a row! Count reset to **0**.\n\n• Previous High Score: **${state.highScore}**\n• Next number is **1**!`)
            .setTimestamp();

          await message.channel.send({ embeds: [resetEmbed] }).catch(() => {});
          db.updateCountingState(guild.id, { currentCount: 0, lastUserId: null });
          return;
        }
      }

      // Rule 2: Must be expected consecutive number
      if (countNumber !== expectedCount) {
        if (isEasyMode) {
          const warnMsg = await message.channel.send(`${crossEmojiText} **${message.author.username}**, wrong number! Expected **${expectedCount}**, but got **${countNumber}**. Next number is still **${expectedCount}**!`.trim()).catch(() => null);
          setTimeout(async () => {
            await message.delete().catch(() => {});
            if (warnMsg) await warnMsg.delete().catch(() => {});
          }, CLEANUP_DELAY_MS);
          return;
        } else {
          // Hard Mode Reset Announcement Embed
          const resetEmbed = new EmbedBuilder()
            .setColor(config.errorColor)
            .setTitle(`${crossEmojiText} Count Reset to 0`.trim())
            .setDescription(`Wrong number by **${message.author.username}**! (Expected **${expectedCount}**, got **${countNumber}**).\n\n• Previous High Score: **${state.highScore}**\n• Next number is **1**!`)
            .setTimestamp();

          await message.channel.send({ embeds: [resetEmbed] }).catch(() => {});
          db.updateCountingState(guild.id, { currentCount: 0, lastUserId: null });
          return;
        }
      }

      // Success!
      const newCount = state.currentCount + 1;
      const newHighScore = Math.max(state.highScore, newCount);

      db.updateCountingState(guild.id, {
        currentCount: newCount,
        lastUserId: message.author.id,
        highScore: newHighScore
      });

      // React with custom server emoji (:check: / :Accept:)
      await reactWithEmoji(message, 'check');

      // Milestone celebration
      if (newCount % 100 === 0) {
        await reactWithEmoji(message, 'boost');
        await message.channel.send(`**Milestone Reached!** We hit **${newCount}**! Keep it going!`).catch(() => {});
      } else if (newCount % 50 === 0) {
        await reactWithEmoji(message, 'boost');
      }
    }
  }
};
