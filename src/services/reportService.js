// src/services/reportService.js
// Daily summary report — sends stats to owner every morning at 9 AM

import dotenv from 'dotenv';
dotenv.config();

const MY_NUMBER = process.env.MY_NUMBER;
const REPORT_HOUR = parseInt(process.env.REPORT_HOUR || '9'); // 9 AM default

// Daily stats tracker
let dailyStats = resetStats();

function resetStats() {
  return {
    date: new Date().toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi' }),
    totalMessages: 0,
    friendMessages: 0,
    unknownMessages: 0,
    newLeads: 0,
    quotesGiven: 0,
    spamBlocked: 0,
    activeConversations: new Set(),
    leads: [], // { number, name, projectType, estimatedPrice }
  };
}

// ── Track incoming message ────────────────────────────────
export function trackMessage(number, contactType) {
  dailyStats.totalMessages++;
  dailyStats.activeConversations.add(number);

  if (contactType === 'friend') dailyStats.friendMessages++;
  else if (contactType === 'unknown' || contactType === 'stranger') dailyStats.unknownMessages++;
  else if (contactType === 'spammer') dailyStats.spamBlocked++;
}

// ── Track new lead ────────────────────────────────────────
export function trackLead(number, name, projectType, estimatedPrice) {
  dailyStats.newLeads++;
  dailyStats.leads.push({ number, name, projectType, estimatedPrice });
}

// ── Track quote given ─────────────────────────────────────
export function trackQuote() {
  dailyStats.quotesGiven++;
}

// ── Generate report message ───────────────────────────────
function generateReport() {
  const stats = dailyStats;
  const uniqueChats = stats.activeConversations.size;

  let report = `📊 *Daily Report — ${stats.date}*\n`;
  report += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  report += `💬 *Messages:* ${stats.totalMessages}\n`;
  report += `👥 *Friends:* ${stats.friendMessages}\n`;
  report += `👤 *Unknown:* ${stats.unknownMessages}\n`;
  report += `🚫 *Spam blocked:* ${stats.spamBlocked}\n`;
  report += `💼 *New leads:* ${stats.newLeads}\n`;
  report += `💰 *Quotes given:* ${stats.quotesGiven}\n`;
  report += `🗨️ *Active chats:* ${uniqueChats}\n\n`;

  if (stats.leads.length > 0) {
    report += `🔥 *Today's Leads:*\n`;
    stats.leads.forEach((lead, i) => {
      report += `${i + 1}. ${lead.name || lead.number}\n`;
      report += `   📁 ${lead.projectType || 'Unknown project'}\n`;
      if (lead.estimatedPrice) report += `   💰 ${lead.estimatedPrice}\n`;
    });
  } else {
    report += `📭 Aaj koi naya lead nahi aaya.\n`;
  }

  report += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
  report += `_Bot by HasDevs 🤖_`;

  return report;
}

// ── Schedule daily report ─────────────────────────────────
export function startDailyReport(sendFn) {
  if (!MY_NUMBER) {
    console.log('⚠️  MY_NUMBER not set — daily report disabled');
    return;
  }

  const checkAndSend = async () => {
    const now = new Date();
    const pkTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
    const hour = pkTime.getHours();
    const minute = pkTime.getMinutes();

    if (hour === REPORT_HOUR && minute === 0) {
      const report = generateReport();
      const jid = `${MY_NUMBER}@s.whatsapp.net`;

      try {
        await sendFn(jid, report);
        console.log('📊 Daily report sent!');
      } catch (err) {
        console.error('Report send error:', err.message);
      }

      // Reset stats for new day
      dailyStats = resetStats();
    }
  };

  // Check every minute
  setInterval(checkAndSend, 60 * 1000);
  console.log(`📊 Daily report scheduled at ${REPORT_HOUR}:00 AM (PKT)`);
}

export { dailyStats };
