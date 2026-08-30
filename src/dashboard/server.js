const express = require('express');
const path = require('path');
const db = require('../db/database');
const config = require('../config');
const { EmbedBuilder } = require('discord.js');

let app = null;
let serverInstance = null;

function startDashboard(client, port = 3000) {
  if (serverInstance) return;

  app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  // 1. Bot & System Health API
  app.get('/api/status', (req, res) => {
    const memory = process.memoryUsage();
    const uptimeSec = Math.floor(process.uptime());
    const totalMembers = client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0);

    res.json({
      online: client.isReady(),
      tag: client.user ? client.user.tag : 'SystemBot',
      avatar: client.user ? client.user.displayAvatarURL({ dynamic: true, size: 128 }) : null,
      ping: client.ws ? Math.round(client.ws.ping) : 0,
      uptime: uptimeSec,
      guildCount: client.guilds.cache.size,
      memberCount: totalMembers,
      ramUsage: (memory.heapUsed / 1024 / 1024).toFixed(1) + ' MB',
      ramTotal: (memory.rss / 1024 / 1024).toFixed(1) + ' MB'
    });
  });

  // 2. Guilds & Metadata (Channels & Roles)
  app.get('/api/guilds', (req, res) => {
    const guilds = client.guilds.cache.map(g => ({
      id: g.id,
      name: g.name,
      icon: g.iconURL({ dynamic: true, size: 128 }),
      memberCount: g.memberCount,
      channels: g.channels.cache
        .filter(c => c.type === 0 || c.type === 4 || c.type === 2) // Text (0), Category (4), Voice (2)
        .map(c => ({
          id: c.id,
          name: c.name,
          type: c.type,
          parentId: c.parentId
        })),
      roles: g.roles.cache
        .filter(r => r.id !== g.id) // Exclude @everyone
        .map(r => ({
          id: r.id,
          name: r.name,
          color: r.hexColor
        }))
    }));

    res.json(guilds);
  });

  // 3. Guild Configuration API
  app.get('/api/config/:guildId', (req, res) => {
    const { guildId } = req.params;
    const cfg = db.getGuildConfig(guildId);
    const counting = db.getCountingState(guildId);
    res.json({ config: cfg, counting });
  });

  app.post('/api/config/:guildId', (req, res) => {
    const { guildId } = req.params;
    const updateData = req.body;

    // Handle counting state update if included
    if (updateData.countingState) {
      db.updateCountingState(guildId, updateData.countingState);
      delete updateData.countingState;
    }

    const updated = db.updateGuildConfig(guildId, updateData);
    res.json({ success: true, config: updated });
  });

  // 4. Send Custom Embed to Channel
  app.post('/api/send-embed', async (req, res) => {
    const { channelId, title, description, color, author, footer, thumbnail, image } = req.body;

    if (!channelId || (!title && !description)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      return res.status(404).json({ error: 'Channel not found or not text-based' });
    }

    try {
      const embed = new EmbedBuilder();
      if (title) embed.setTitle(title);
      if (description) embed.setDescription(description);
      if (color) embed.setColor(color);
      if (author) embed.setAuthor({ name: author });
      if (footer) embed.setFooter({ text: footer });
      if (thumbnail) embed.setThumbnail(thumbnail);
      if (image) embed.setImage(image);
      embed.setTimestamp();

      await channel.send({ embeds: [embed] });
      res.json({ success: true });
    } catch (err) {
      console.error('Error sending embed from dashboard:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 5. 1-Click Auto-Create Modules API
  app.post('/api/autocreate/:guildId/:module', async (req, res) => {
    const { guildId, module: modName } = req.params;
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });

    const { ChannelType } = require('discord.js');
    const { setupStatsChannels } = require('../utils/statsCounter');
    const { setupLogCategory } = require('../utils/auditLogger');
    const { updateBirthdayPanel } = require('../utils/birthdayScheduler');

    try {
      if (modName === 'birthdays') {
        let cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && (c.name.toLowerCase().includes('celebration') || c.name.toLowerCase().includes('birthday')));
        if (!cat) {
          cat = await guild.channels.create({ name: 'CELEBRATIONS', type: ChannelType.GuildCategory }).catch(() => null);
        }

        const newChan = await guild.channels.create({
          name: '🎉┃birthdays',
          type: ChannelType.GuildText,
          parent: cat ? cat.id : null,
          topic: 'Server Birthday Calendar & Daily Celebrations'
        });

        let bdayRole = guild.roles.cache.find(r => r.name.toLowerCase().includes('birthday'));
        if (!bdayRole) {
          bdayRole = await guild.roles.create({
            name: '🎉┃Birthday',
            color: '#FF73FA',
            reason: 'Auto-created birthday celebratory role'
          }).catch(() => null);
        }

        db.updateGuildConfig(guild.id, {
          birthdayChannelId: newChan.id,
          birthdayRoleId: bdayRole ? bdayRole.id : null
        });

        await updateBirthdayPanel(guild).catch(() => {});
        return res.json({ success: true, channelId: newChan.id, roleId: bdayRole?.id });
      }

      if (modName === 'stats') {
        await setupStatsChannels(guild, true);
        return res.json({ success: true });
      }

      if (modName === 'logs') {
        await setupLogCategory(guild);
        return res.json({ success: true });
      }

      if (modName === 'voice') {
        let cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('voice'));
        if (!cat) {
          cat = await guild.channels.create({ name: '🔊 Voice Channels', type: ChannelType.GuildCategory }).catch(() => null);
        }

        const trigger = await guild.channels.create({
          name: '➕│Join To Create',
          type: ChannelType.GuildVoice,
          parent: cat ? cat.id : null
        });

        db.updateGuildConfig(guild.id, {
          tempVoiceTriggerId: trigger.id,
          tempVoiceCategoryId: cat ? cat.id : null
        });
        return res.json({ success: true, channelId: trigger.id });
      }

      if (modName === 'tickets') {
        let cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('ticket'));
        if (!cat) {
          cat = await guild.channels.create({ name: '🔐 Support Tickets', type: ChannelType.GuildCategory }).catch(() => null);
        }
        db.updateGuildConfig(guild.id, { ticketCategoryId: cat.id });
        return res.json({ success: true, categoryId: cat.id });
      }

      res.status(400).json({ error: 'Unknown module' });
    } catch (err) {
      console.error('Auto-create error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 6. Reset Counting Score
  app.post('/api/reset-counting/:guildId', (req, res) => {
    const { guildId } = req.params;
    db.updateCountingState(guildId, {
      currentNumber: 0,
      lastUserId: null,
      highScore: 0
    });
    res.json({ success: true });
  });

  // 5. Send Plain Text Message to Channel
  app.post('/api/send-message', async (req, res) => {
    const { channelId, message } = req.body;

    if (!channelId || !message) {
      return res.status(400).json({ error: 'Missing channelId or message' });
    }

    const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    try {
      await channel.send(message);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 7. Action: Create Giveaway
  app.post('/api/create-giveaway', async (req, res) => {
    const { channelId, prize, duration, winnerCount } = req.body;
    if (!channelId || !prize) return res.status(400).json({ error: 'Missing channel or prize' });

    const ms = require('ms');
    const { buildGiveawayEmbedAndRow, endGiveaway } = require('../commands/giveaway');
    const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return res.status(404).json({ error: 'Text channel not found' });

    const durationMs = ms(duration || '1h') || 3600000;
    const endsAt = Date.now() + durationMs;
    const winners = parseInt(winnerCount, 10) || 1;

    const giveawayObj = {
      messageId: null,
      channelId: channel.id,
      guildId: channel.guild.id,
      prize,
      endsAt,
      winnerCount: winners,
      hostId: client.user.id,
      entries: [],
      ended: false,
      createdAt: Date.now()
    };

    const { embed, rows } = buildGiveawayEmbedAndRow(giveawayObj, channel.guild);
    const msg = await channel.send({ embeds: [embed], components: rows });
    giveawayObj.messageId = msg.id;

    db.addGiveaway(giveawayObj);

    setTimeout(() => {
      endGiveaway(client, giveawayObj);
    }, durationMs);

    res.json({ success: true, messageId: msg.id });
  });

  // 8. Action: Create Poll
  app.post('/api/create-poll', async (req, res) => {
    const { channelId, question } = req.body;
    if (!channelId || !question) return res.status(400).json({ error: 'Missing channel or question' });

    const { buildPollEmbedAndRows } = require('../commands/poll');
    const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return res.status(404).json({ error: 'Text channel not found' });

    const pollObj = {
      id: Date.now().toString(),
      messageId: null,
      channelId: channel.id,
      guildId: channel.guild.id,
      question,
      options: ['Yes', 'No'],
      votes: { '0': 0, '1': 0 },
      userVotes: {},
      authorId: client.user.id,
      createdAt: Date.now()
    };

    const { embed, rows } = buildPollEmbedAndRows(pollObj, channel.guild);
    const msg = await channel.send({ embeds: [embed], components: rows });
    pollObj.messageId = msg.id;

    db.savePoll(pollObj);
    res.json({ success: true, messageId: msg.id });
  });

  // 9. Action: Purge Messages
  app.post('/api/purge-messages', async (req, res) => {
    const { channelId, amount } = req.body;
    const count = Math.min(Math.max(parseInt(amount, 10) || 10, 1), 100);

    const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return res.status(404).json({ error: 'Text channel not found' });

    try {
      const deleted = await channel.bulkDelete(count, true);
      res.json({ success: true, count: deleted.size });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 10. Action: End Giveaway
  app.post('/api/end-giveaway', async (req, res) => {
    const { messageId } = req.body;
    const giveaway = db.getGiveaway(messageId);
    if (!giveaway) return res.status(404).json({ error: 'Giveaway not found' });

    const { endGiveaway } = require('../commands/giveaway');
    await endGiveaway(client, giveaway);
    res.json({ success: true });
  });

  // 11. Giveaways & Polls List
  app.get('/api/giveaways', (req, res) => {
    res.json(db.getGiveaways());
  });

  app.get('/api/polls', (req, res) => {
    res.json(db.data.polls || []);
  });

  // 12. Events API
  app.get('/api/events', (req, res) => {
    res.json(db.getEvents());
  });

  app.post('/api/create-event', async (req, res) => {
    const { channelId, title, description, game, schedule, link } = req.body;
    if (!channelId || !title || !description) {
      return res.status(400).json({ error: 'Missing channel, title, or description' });
    }

    const { buildEventEmbedAndRows } = require('../commands/event');
    const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return res.status(404).json({ error: 'Text channel not found' });

    const eventObj = {
      messageId: null,
      channelId: channel.id,
      guildId: channel.guild.id,
      hostId: client.user.id,
      title,
      description,
      game: game || null,
      activity: null,
      link: link || null,
      server: null,
      schedule: schedule || null,
      color: null,
      maxParticipants: null,
      participants: [],
      reminders: [],
      ended: false,
      createdAt: Date.now()
    };

    const { embed, rows } = buildEventEmbedAndRows(eventObj, channel.guild);
    const msg = await channel.send({ embeds: [embed], components: rows });
    eventObj.messageId = msg.id;

    db.addEvent(eventObj);
    res.json({ success: true, messageId: msg.id });
  });

  app.post('/api/end-event', async (req, res) => {
    const { messageId } = req.body;
    const eventObj = db.getEvent(messageId);
    if (!eventObj) return res.status(404).json({ error: 'Event not found' });

    eventObj.ended = true;
    db.updateEvent(messageId, eventObj);

    const { buildEventEmbedAndRows } = require('../commands/event');
    const channel = client.channels.cache.get(eventObj.channelId) || await client.channels.fetch(eventObj.channelId).catch(() => null);
    if (channel) {
      const msg = await channel.messages.fetch(messageId).catch(() => null);
      if (msg) {
        const { embed, rows } = buildEventEmbedAndRows(eventObj, channel.guild);
        await msg.edit({ embeds: [embed], components: rows }).catch(() => {});
      }
    }

    res.json({ success: true });
  });

  // 13. Birthdays & Reminders
  app.get('/api/birthdays', (req, res) => {
    res.json(db.getBirthdays());
  });

  app.get('/api/reminders', (req, res) => {
    res.json(db.getReminders());
  });

  // 14. Auto-Pull & Hot-Reload API (for GitHub Webhooks / Dashboard trigger)
  app.post('/api/git-pull', (req, res) => {
    const { exec } = require('child_process');
    exec('./scripts/auto-update.sh', (err, stdout, stderr) => {
      if (err) {
        console.error('Git pull error:', err);
        return res.status(500).json({ error: err.message, stderr });
      }
      res.json({ success: true, output: stdout });
    });
  });

  // Start HTTP Listener
  serverInstance = app.listen(port, () => {
    console.log(`=========================================`);
    console.log(`🚀 System Bot Dashboard Live at: http://localhost:${port}`);
    console.log(`=========================================`);
  });

  return serverInstance;
}

module.exports = { startDashboard };
