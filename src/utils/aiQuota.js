/**
 * In-memory AI API Quota & Usage Tracker with Multi-Key Support
 */

class AIQuotaTracker {
  constructor() {
    this.dailyCount = 0;
    this.minuteCount = 0;
    this.lastMinuteReset = Date.now();
    this.lastDayReset = new Date().getUTCDate();
    this.userUsage = new Map(); // userId -> requestCount
    this.currentModel = 'gemini-2.5-flash';
    this.totalKeys = 1;
    this.activeKeyIndex = 0;
    this.quotaExhausted = false;
  }

  checkReset() {
    const now = Date.now();
    const currentUTCDay = new Date().getUTCDate();

    // Reset minute counter
    if (now - this.lastMinuteReset >= 60000) {
      this.minuteCount = 0;
      this.lastMinuteReset = now;
    }

    // Reset daily counter at UTC midnight
    if (currentUTCDay !== this.lastDayReset) {
      this.dailyCount = 0;
      this.userUsage.clear();
      this.lastDayReset = currentUTCDay;
      this.quotaExhausted = false;
      this.activeKeyIndex = 0;
    }
  }

  recordRequest(userId) {
    this.checkReset();
    this.dailyCount++;
    this.minuteCount++;

    const userCount = this.userUsage.get(userId) || 0;
    this.userUsage.set(userId, userCount + 1);
  }

  markQuotaExhausted() {
    this.quotaExhausted = true;
  }

  getUserUsage(userId) {
    return this.userUsage.get(userId) || 0;
  }

  getStatus(userId) {
    this.checkReset();

    const now = Date.now();
    const nextMinuteMs = 60000 - (now - this.lastMinuteReset);
    const secondsToNextMinute = Math.ceil(nextMinuteMs / 1000);

    // Calculate time to UTC midnight
    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);
    const msToMidnight = tomorrow.getTime() - now;
    const hoursToMidnight = Math.floor(msToMidnight / (1000 * 60 * 60));
    const minutesToMidnight = Math.floor((msToMidnight % (1000 * 60 * 60)) / (1000 * 60));

    return {
      dailyCount: this.dailyCount,
      dailyLimit: 1500 * this.totalKeys,
      minuteCount: this.minuteCount,
      minuteLimit: 15 * this.totalKeys,
      userUsage: this.getUserUsage(userId),
      currentModel: this.currentModel,
      totalKeys: this.totalKeys,
      activeKeyIndex: this.activeKeyIndex + 1,
      quotaExhausted: this.quotaExhausted,
      secondsToNextMinute,
      resetTimeFormat: `${hoursToMidnight}h ${minutesToMidnight}m`
    };
  }
}

module.exports = new AIQuotaTracker();
