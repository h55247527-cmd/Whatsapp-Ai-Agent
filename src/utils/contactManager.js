// src/utils/contactManager.js
// Manages known contacts, unknown numbers, and spam detection

import NodeCache from 'node-cache';

const spamCache = new NodeCache({ stdTTL: 86400 }); // 24hr memory

// Known spam patterns
const SPAM_PATTERNS = [
  /prize|winner|won|lottery|congratulation/i,
  /click here|link below|verify your/i,
  /bank account|otp|pin number|password/i,
  /earn \d+|make money|investment|profit/i,
  /free gift|claim now|limited offer/i,
  /crypto|bitcoin|binance|trading/i,
  /loan offer|instant cash|apply now/i,
];

const SPAM_KEYWORDS = [
  'prize', 'winner', 'lottery', 'bitcoin', 'crypto',
  'otp', 'verify', 'bank account', 'click here', 'free gift',
  'earn money', 'investment', 'trading', 'loan', 'claim'
];

export class ContactManager {
  constructor() {
    this.blockedNumbers = new Set();
    this.userProfiles = new Map(); // number -> { name, messageCount, isSpammer, firstSeen }
  }

  // Check if number is blocked
  isBlocked(number) {
    return this.blockedNumbers.has(number);
  }

  // Block a number
  block(number) {
    this.blockedNumbers.add(number);
    console.log(`🚫 Blocked: ${number}`);
  }

  // Unblock a number
  unblock(number) {
    this.blockedNumbers.delete(number);
  }

  // Get or create user profile
  getProfile(number, pushName = '') {
    if (!this.userProfiles.has(number)) {
      this.userProfiles.set(number, {
        number,
        name: pushName || 'Unknown',
        messageCount: 0,
        spamScore: 0,
        isSpammer: false,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        isSaved: false,
      });
    }

    const profile = this.userProfiles.get(number);
    profile.lastSeen = new Date().toISOString();
    profile.messageCount += 1;
    if (pushName && !profile.name) profile.name = pushName;

    return profile;
  }

  // Analyze message for spam
  analyzeSpam(message, profile) {
    let spamScore = 0;
    const lowerMsg = message.toLowerCase();

    // Check regex patterns
    for (const pattern of SPAM_PATTERNS) {
      if (pattern.test(lowerMsg)) spamScore += 2;
    }

    // Check keywords
    for (const keyword of SPAM_KEYWORDS) {
      if (lowerMsg.includes(keyword)) spamScore += 1;
    }

    // Suspicious: short messages with links
    if (lowerMsg.includes('http') && message.length < 50) spamScore += 3;

    // Suspicious: all caps
    if (message === message.toUpperCase() && message.length > 10) spamScore += 1;

    // Add to cumulative profile score
    profile.spamScore = (profile.spamScore || 0) + spamScore;

    const threshold = parseInt(process.env.SPAM_THRESHOLD || '3');
    const isSpam = spamScore >= threshold || profile.spamScore >= threshold * 2;

    return { spamScore, isSpam, cumulativeScore: profile.spamScore };
  }

  // Determine contact type
  getContactType(number, profile) {
    const savedContacts = new Set([
      '923169895286', // Koor
      '923195804102', // Shayan
      '923225293560', // Afaq
      '923369779724', // CyberWolf
      '923165797989', // Doctor Saib
      '923228359053', // AJ Prince
      '923179783085', // Fahad Khan
      '923120872051', // Abdullah
      '923025575040', // Waleed
      '923175882062', // Imad
    ]);

    if (savedContacts.has(number)) return 'friend';
    if (profile.isSpammer) return 'spammer';
    if (profile.messageCount <= 1) return 'stranger';
    return 'unknown';
  }
}

export const contactManager = new ContactManager();
