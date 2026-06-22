// src/services/intelligenceService.js
// Phase 2+3: Contact Intelligence + Mood Detection + Language Detection

import { franc } from 'franc';

// ── MOOD DETECTION ────────────────────────────────────────
const MOOD_PATTERNS = {
  urgent: {
    keywords: ['urgent', 'asap', 'jaldi', 'abhi', 'turant', 'emergency', 'help', 'please', 'zaroor', 'foran', 'immediately', 'right now'],
    score: 0,
  },
  angry: {
    keywords: ['ghussa', 'gussa', 'bakwas', 'bekar', 'bura', 'angry', 'frustrated', 'worst', 'terrible', 'hate', 'stupid', 'idiot', 'useless', 'kachra', 'faltu'],
    score: 0,
  },
  sad: {
    keywords: ['sad', 'dukhi', 'pareshan', 'tension', 'mushkil', 'problem', 'cry', 'rona', 'takleef', 'dard', 'alone', 'akela', 'depressed', 'bura lag raha'],
    score: 0,
  },
  happy: {
    keywords: ['khush', 'happy', 'great', 'amazing', 'awesome', 'zabardast', 'mast', 'shandar', 'badhiya', 'perfect', 'love', 'excellent', 'wonderful', 'haha', 'lol', '😊', '😄', '🎉', '❤️'],
    score: 0,
  },
  excited: {
    keywords: ['excited', 'cant wait', 'wait nahi ho raha', 'yay', 'wow', 'omg', 'really', 'seriously', '🔥', '💥', '🚀', 'finally', 'akhir kar'],
    score: 0,
  },
  confused: {
    keywords: ['confused', 'samajh nahi', 'kya matlab', 'what do you mean', 'explain', 'kaise', 'kyun', 'why', 'how', 'pata nahi', 'unclear', 'matlab'],
    score: 0,
  },
};

export function detectMood(message) {
  const lower = message.toLowerCase();
  const scores = {};

  for (const [mood, data] of Object.entries(MOOD_PATTERNS)) {
    scores[mood] = data.keywords.filter(kw => lower.includes(kw)).length;
  }

  // Find highest score
  const topMood = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];

  if (topMood[1] === 0) return 'neutral';
  return topMood[0];
}

// ── LANGUAGE DETECTION ────────────────────────────────────
export function detectLanguage(message) {
  // Quick Urdu/Pashto detection via common words
  const urduWords = ['hai', 'hain', 'mera', 'meri', 'kya', 'aap', 'tum', 'main', 'yaar', 'bhai', 'karo', 'kiya', 'tha', 'thi', 'nahi', 'hoga', 'chahiye'];
  const pashtoWords = ['sta', 'zma', 'da', 'che', 'ka', 'wu', 'kho', 'pa', 'de', 'yam', 'ye', 'dey'];
  const arabicWords = ['السلام', 'عليكم', 'اللہ', 'شکریہ', 'کیا', 'ہے', 'میں', 'آپ'];

  const lower = message.toLowerCase();
  const words = lower.split(/\s+/);

  const urduCount = words.filter(w => urduWords.includes(w)).length;
  const pashtoCount = words.filter(w => pashtoWords.includes(w)).length;

  // Check for Arabic/Urdu script
  const hasUrduScript = /[\u0600-\u06FF]/.test(message);
  if (hasUrduScript) return 'urdu';

  if (pashtoCount >= 2) return 'pashto';
  if (urduCount >= 2) return 'hinglish';

  // Use franc for other languages
  const detected = franc(message, { minLength: 10 });
  if (detected === 'urd') return 'urdu';
  if (detected === 'pus') return 'pashto';
  if (detected === 'eng') return 'english';

  return 'hinglish'; // Default for Pakistan
}

// ── CONTACT INTELLIGENCE / CLASSIFICATION ─────────────────
const SAVED_FRIENDS = new Set([
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

export function classifyContact(number, dbContact, messageHistory = []) {
  // Saved friends
  if (SAVED_FRIENDS.has(number)) return 'friend';

  // Blocked
  if (dbContact?.is_blocked) return 'spammer';

  // Already classified
  if (dbContact?.category && dbContact.category !== 'unknown') {
    return dbContact.category;
  }

  // New unknown
  return 'unknown';
}

// ── TRUST SCORE ENGINE ────────────────────────────────────
export function calculateTrustScore(contact, mood, messageCount) {
  let score = contact?.trust_score || 50;

  // Positive signals
  if (mood === 'happy' || mood === 'excited') score += 2;
  if (messageCount > 5) score += 5;
  if (messageCount > 20) score += 10;

  // Negative signals
  if (mood === 'angry') score -= 5;
  if (contact?.spam_score > 3) score -= 15;
  if (contact?.is_blocked) score = 0;

  return Math.max(0, Math.min(100, score));
}

// ── RELATIONSHIP SCORE ────────────────────────────────────
export function calculateRelationshipScore(contact) {
  let score = contact?.relationship_score || 0;
  const msgCount = contact?.message_count || 0;

  if (msgCount > 1) score = Math.min(100, score + 1);
  if (msgCount > 10) score = Math.min(100, score + 5);
  if (msgCount > 50) score = Math.min(100, score + 10);

  return score;
}

// ── SPAM / SCAM DETECTION ─────────────────────────────────
const SPAM_PATTERNS = [
  /prize|winner|won|lottery|congratulation/i,
  /click here|link below|verify your/i,
  /bank account|otp|pin number|password/i,
  /earn \d+|make money|investment|profit guaranteed/i,
  /free gift|claim now|limited offer/i,
  /crypto|bitcoin|binance|trading signal/i,
  /loan offer|instant cash|apply now/i,
];

const SCAM_PATTERNS = [
  /urgent transfer|wire transfer/i,
  /stranded|stuck|need money|send money/i,
  /irs|tax refund|government grant/i,
  /your account.*suspended|verify.*account/i,
  /nigerian|prince.*million/i,
];

export function analyzeSpamScam(message) {
  const isSpam = SPAM_PATTERNS.some(p => p.test(message));
  const isScam = SCAM_PATTERNS.some(p => p.test(message));
  const hasLink = /https?:\/\/\S+/.test(message) && message.length < 100;
  const isAllCaps = message === message.toUpperCase() && message.length > 15;

  let score = 0;
  if (isSpam) score += 3;
  if (isScam) score += 5;
  if (hasLink) score += 2;
  if (isAllCaps) score += 1;

  return {
    isSpam,
    isScam,
    score,
    type: isScam ? 'scam' : isSpam ? 'spam' : 'clean',
  };
}
