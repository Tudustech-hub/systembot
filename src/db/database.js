const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/db.json');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const DEFAULT_SHOP_ITEMS = [
  {
    id: 'item_vip',
    name: '💎 VIP',
    roleName: '💎┃VIP',
    roleColor: '#FEE75C',
    hoist: true,
    price: 5000,
    description: 'Gold name & VIP rank'
  },
  {
    id: 'item_tycoon',
    name: '👑 Tycoon',
    roleName: '👑┃Tycoon',
    roleColor: '#FF73FA',
    hoist: true,
    price: 15000,
    description: 'Top rank on the member list'
  },
  {
    id: 'item_neon_flame',
    name: '🔥 Crimson',
    roleName: '🔥┃Crimson',
    roleColor: '#FF4654',
    hoist: true,
    price: 2500,
    description: 'Red name color'
  },
  {
    id: 'item_cyberpunk',
    name: '⚡ Cyan',
    roleName: '⚡┃Cyan',
    roleColor: '#00F0FF',
    hoist: true,
    price: 2500,
    description: 'Cyan name color'
  }
];

// Default database structure
const defaultData = {
  guilds: {},       // { guildId: { welcomeChannelId, welcomeRoleId, countingChannelId, tempVoiceCategoryId, tempVoiceTriggerId, honeypotChannelId, ticketCategoryId, ticketStaffRoleId, ticketLogChannelId, minigameChannelId, birthdayChannelId, birthdayRoleId, economyChannelId, economyPanelMessageId, lotteryMessageId } }
  giveaways: [],    // Array of active or completed giveaway objects
  polls: [],        // Array of active poll objects
  counting: {},     // { guildId: { currentCount: number, lastUserId: string, highScore: number } }
  tempVoices: [],   // Array of dynamic temp voice channel IDs
  tickets: [],      // Array of active tickets
  events: [],       // Array of server event objects
  reminders: [],    // Array of reminder objects: { id, guildId, channelId, userId, text, dueAt, createdAt }
  birthdays: {},    // { userId: { month: number, day: number, lastCelebratedYear?: number } }
  economy: {},      // { userId: { wallet: number, bank: number, lastDaily: number, lastWork: number, dailyStreak: number } }
  shop: {},         // { guildId: [ { id, name, price, roleId, roleName, roleColor, hoist, description } ] }
  lottery: {}       // { guildId: { pool: number, endsAt: number, entries: { [userId]: number }, lastWinner?: { userId, prize, date } } }
};

class Database {
  constructor() {
    this.data = defaultData;
    this.saveTimeout = null;
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(DB_PATH)) {
        const raw = fs.readFileSync(DB_PATH, 'utf-8');
        this.data = { ...defaultData, ...JSON.parse(raw) };
      } else {
        this.save();
      }
    } catch (err) {
      console.error('Error loading database, resetting to default:', err);
      this.data = defaultData;
      this.save();
    }
  }

  // Atomic write to prevent file corruption
  save() {
    try {
      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout);
        this.saveTimeout = null;
      }
      const tmpPath = `${DB_PATH}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tmpPath, DB_PATH);
    } catch (err) {
      console.error('Error saving database:', err);
    }
  }

  // Debounced save for high-frequency operations
  saveDebounced(delayMs = 1000) {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      this.save();
    }, delayMs);
  }

  // --- Guild Settings ---
  getGuildConfig(guildId) {
    return this.data.guilds[guildId] || {};
  }

  updateGuildConfig(guildId, newConfig) {
    this.data.guilds[guildId] = {
      ...(this.data.guilds[guildId] || {}),
      ...newConfig
    };
    this.save();
    return this.data.guilds[guildId];
  }

  // --- Giveaways ---
  getGiveaways() {
    return this.data.giveaways || [];
  }

  addGiveaway(giveaway) {
    if (!this.data.giveaways) this.data.giveaways = [];
    this.data.giveaways.push(giveaway);
    this.save();
  }

  updateGiveaway(messageId, updatedData) {
    if (!this.data.giveaways) this.data.giveaways = [];
    const idx = this.data.giveaways.findIndex(g => g.messageId === messageId);
    if (idx !== -1) {
      this.data.giveaways[idx] = { ...this.data.giveaways[idx], ...updatedData };
      this.saveDebounced(500);
    }
  }

  deleteGiveaway(messageId) {
    if (!this.data.giveaways) this.data.giveaways = [];
    this.data.giveaways = this.data.giveaways.filter(g => g.messageId !== messageId);
    this.save();
  }

  // --- Polls ---
  getPoll(messageId) {
    return (this.data.polls || []).find(p => p.messageId === messageId);
  }

  savePoll(poll) {
    if (!this.data.polls) this.data.polls = [];
    const idx = this.data.polls.findIndex(p => p.messageId === poll.messageId);
    if (idx !== -1) {
      this.data.polls[idx] = poll;
    } else {
      this.data.polls.push(poll);
    }
    this.saveDebounced(500);
  }

  // --- Counting ---
  getCountingState(guildId) {
    return (this.data.counting && this.data.counting[guildId]) || { currentCount: 0, lastUserId: null, highScore: 0 };
  }

  updateCountingState(guildId, state) {
    if (!this.data.counting) this.data.counting = {};
    this.data.counting[guildId] = {
      ...(this.data.counting[guildId] || { currentCount: 0, lastUserId: null, highScore: 0 }),
      ...state
    };
    this.saveDebounced(1000);
  }

  // --- Temp Voice Channels ---
  getTempVoiceChannels() {
    return this.data.tempVoices || [];
  }

  getTempVoiceChannel(channelId) {
    return (this.data.tempVoices || []).find(v => v.channelId === channelId);
  }

  addTempVoiceChannel(channelId, guildId, ownerId, isPrivate = false) {
    if (!this.data.tempVoices) this.data.tempVoices = [];
    this.data.tempVoices.push({
      channelId,
      guildId,
      ownerId,
      isPrivate,
      allowedUsers: [ownerId],
      createdAt: Date.now()
    });
    this.save();
  }

  updateTempVoiceChannel(channelId, updatedData) {
    if (!this.data.tempVoices) this.data.tempVoices = [];
    const idx = this.data.tempVoices.findIndex(v => v.channelId === channelId);
    if (idx !== -1) {
      this.data.tempVoices[idx] = { ...this.data.tempVoices[idx], ...updatedData };
      this.saveDebounced(500);
    }
  }

  removeTempVoiceChannel(channelId) {
    if (!this.data.tempVoices) this.data.tempVoices = [];
    this.data.tempVoices = this.data.tempVoices.filter(v => v.channelId !== channelId);
    this.save();
  }

  // --- Tickets ---
  getTicket(channelId) {
    return (this.data.tickets || []).find(t => t.channelId === channelId);
  }

  addTicket(ticket) {
    if (!this.data.tickets) this.data.tickets = [];
    this.data.tickets.push(ticket);
    this.save();
  }

  removeTicket(channelId) {
    if (!this.data.tickets) this.data.tickets = [];
    this.data.tickets = this.data.tickets.filter(t => t.channelId !== channelId);
    this.save();
  }

  // --- Events ---
  getEvents() {
    return this.data.events || [];
  }

  getEvent(messageId) {
    return (this.data.events || []).find(e => e.messageId === messageId);
  }

  addEvent(eventObj) {
    if (!this.data.events) this.data.events = [];
    this.data.events.push(eventObj);
    this.save();
  }

  updateEvent(messageId, updatedData) {
    if (!this.data.events) this.data.events = [];
    const idx = this.data.events.findIndex(e => e.messageId === messageId);
    if (idx !== -1) {
      this.data.events[idx] = { ...this.data.events[idx], ...updatedData };
      this.saveDebounced(500);
    }
  }

  deleteEvent(messageId) {
    if (!this.data.events) this.data.events = [];
    this.data.events = this.data.events.filter(e => e.messageId !== messageId);
    this.save();
  }

  // --- Reminders ---
  getReminders() {
    return this.data.reminders || [];
  }

  getUserReminders(userId, guildId) {
    return (this.data.reminders || []).filter(r => r.userId === userId && (!guildId || r.guildId === guildId));
  }

  addReminder(reminder) {
    if (!this.data.reminders) this.data.reminders = [];
    this.data.reminders.push(reminder);
    this.save();
  }

  deleteReminder(id) {
    if (!this.data.reminders) this.data.reminders = [];
    this.data.reminders = this.data.reminders.filter(r => r.id !== id);
    this.save();
  }

  // --- Birthdays ---
  getBirthdays() {
    return this.data.birthdays || {};
  }

  getBirthday(userId) {
    return (this.data.birthdays && this.data.birthdays[userId]) || null;
  }

  setBirthday(userId, month, day) {
    if (!this.data.birthdays) this.data.birthdays = {};
    this.data.birthdays[userId] = {
      month: parseInt(month, 10),
      day: parseInt(day, 10),
      updatedAt: Date.now()
    };
    this.save();
    return this.data.birthdays[userId];
  }

  updateBirthday(userId, updatedData) {
    if (!this.data.birthdays) this.data.birthdays = {};
    this.data.birthdays[userId] = {
      ...(this.data.birthdays[userId] || {}),
      ...updatedData
    };
    this.save();
  }

  // --- Economy ---
  getUserEconomy(userId) {
    if (!this.data.economy) this.data.economy = {};
    if (!this.data.economy[userId]) {
      this.data.economy[userId] = {
        wallet: 0,
        bank: 0,
        lastDaily: 0,
        lastWork: 0,
        dailyStreak: 0
      };
      this.saveDebounced(1000);
    }
    return this.data.economy[userId];
  }

  updateUserEconomy(userId, updatedData) {
    if (!this.data.economy) this.data.economy = {};
    this.data.economy[userId] = {
      ...(this.data.economy[userId] || { wallet: 0, bank: 0, lastDaily: 0, lastWork: 0, dailyStreak: 0 }),
      ...updatedData
    };
    this.saveDebounced(500);
    return this.data.economy[userId];
  }

  addCoins(userId, amount, type = 'wallet') {
    const eco = this.getUserEconomy(userId);
    eco[type] = Math.max(0, (eco[type] || 0) + amount);
    this.updateUserEconomy(userId, eco);
    return eco;
  }

  removeCoins(userId, amount, type = 'wallet') {
    const eco = this.getUserEconomy(userId);
    if ((eco[type] || 0) < amount) return false;
    eco[type] -= amount;
    this.updateUserEconomy(userId, eco);
    return true;
  }

  getLeaderboard(limit = 10) {
    if (!this.data.economy) return [];
    return Object.entries(this.data.economy)
      .map(([userId, data]) => ({
        userId,
        wallet: data.wallet || 0,
        bank: data.bank || 0,
        netWorth: (data.wallet || 0) + (data.bank || 0)
      }))
      .sort((a, b) => b.netWorth - a.netWorth)
      .slice(0, limit);
  }

  // --- Shop ---
  getShopItems(guildId) {
    if (!this.data.shop) this.data.shop = {};
    if (!this.data.shop[guildId] || this.data.shop[guildId].length === 0) {
      this.data.shop[guildId] = JSON.parse(JSON.stringify(DEFAULT_SHOP_ITEMS));
      this.save();
    }
    return this.data.shop[guildId] || [];
  }

  updateShopItem(guildId, item) {
    if (!this.data.shop) this.data.shop = {};
    if (!this.data.shop[guildId]) this.data.shop[guildId] = JSON.parse(JSON.stringify(DEFAULT_SHOP_ITEMS));
    const idx = this.data.shop[guildId].findIndex(i => i.id === item.id);
    if (idx !== -1) {
      this.data.shop[guildId][idx] = { ...this.data.shop[guildId][idx], ...item };
    } else {
      this.data.shop[guildId].push(item);
    }
    this.save();
  }

  addShopItem(guildId, item) {
    if (!this.data.shop) this.data.shop = {};
    if (!this.data.shop[guildId]) this.data.shop[guildId] = [];
    this.data.shop[guildId].push(item);
    this.save();
  }

  removeShopItem(guildId, itemId) {
    if (!this.data.shop || !this.data.shop[guildId]) return;
    this.data.shop[guildId] = this.data.shop[guildId].filter(i => i.id !== itemId);
    this.save();
  }

  // --- Automated Lottery ---
  getLottery(guildId) {
    if (!this.data.lottery) this.data.lottery = {};
    if (!this.data.lottery[guildId]) {
      this.data.lottery[guildId] = {
        pool: 2500, // Base starting jackpot
        endsAt: Date.now() + 604800000, // 7 days from now
        entries: {}, // { userId: ticketCount }
        lastWinner: null
      };
      this.save();
    }
    return this.data.lottery[guildId];
  }

  updateLottery(guildId, updatedData) {
    if (!this.data.lottery) this.data.lottery = {};
    this.data.lottery[guildId] = {
      ...(this.data.lottery[guildId] || { pool: 2500, endsAt: Date.now() + 604800000, entries: {} }),
      ...updatedData
    };
    this.save();
    return this.data.lottery[guildId];
  }
}

module.exports = new Database();
