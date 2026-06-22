// src/services/followUpService.js
// Auto follow-up — reminds clients who haven't replied in 24 hours

import { generateReply } from './groqService.js';
import dotenv from 'dotenv';
dotenv.config();

const MY_NAME = process.env.MY_NAME || 'Hashir';

// Store pending follow-ups: number -> { timer, projectInfo, sentAt }
const followUpTimers = new Map();

// Follow-up messages (random pick karo)
const FOLLOWUP_MESSAGES = [
  `Assalam o Alaikum! Bas check kar raha tha — kya aapne project ke baare mein soch liya? Koi sawaal ho toh zaroor batayein. 😊`,
  `Hi! Aapka project discuss karna tha — kya aap available hain thodi baat karne ke liye?`,
  `Salam! Maine aapka project estimate bheja tha — kya aap interested hain aage badhne mein? Koi confusion ho toh clear kar deta hoon.`,
  `Hello! Just following up — agar budget ya timeline mein koi adjustment chahiye toh discuss kar sakte hain. Main flexible hoon! 👍`,
];

// ── Schedule a follow-up ──────────────────────────────────
export function scheduleFollowUp(number, projectInfo, sendFn) {
  // Cancel existing timer if any
  cancelFollowUp(number);

  const delay = parseInt(process.env.FOLLOWUP_HOURS || '24') * 60 * 60 * 1000;

  console.log(`⏰ Follow-up scheduled for ${number} in ${delay / 3600000}h`);

  const timer = setTimeout(async () => {
    try {
      const msg = FOLLOWUP_MESSAGES[Math.floor(Math.random() * FOLLOWUP_MESSAGES.length)];
      await sendFn(number, msg);
      console.log(`📨 Follow-up sent to ${number}`);
      followUpTimers.delete(number);
    } catch (err) {
      console.error('Follow-up send error:', err.message);
    }
  }, delay);

  followUpTimers.set(number, {
    timer,
    projectInfo,
    scheduledAt: new Date().toISOString(),
  });
}

// ── Cancel follow-up (when client replies) ───────────────
export function cancelFollowUp(number) {
  if (followUpTimers.has(number)) {
    clearTimeout(followUpTimers.get(number).timer);
    followUpTimers.delete(number);
    console.log(`✅ Follow-up cancelled for ${number} (they replied)`);
  }
}

// ── Get all pending follow-ups ────────────────────────────
export function getPendingFollowUps() {
  return [...followUpTimers.entries()].map(([number, data]) => ({
    number,
    scheduledAt: data.scheduledAt,
    projectType: data.projectInfo?.projectType || 'Unknown',
  }));
}
