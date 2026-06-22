// src/services/deletedMsgService.js
// Catches "Delete for Everyone" messages and notifies the owner

import dotenv from 'dotenv';
dotenv.config();

const MY_NUMBER = process.env.MY_NUMBER;

// Store: messageId -> { from, pushName, body, sentAt, mediaType }
const messageStore = new Map();

// Max messages to store in memory (per user)
const MAX_STORE = 200;

// ── Store every incoming message before it gets deleted ──
export function storeMessage(message) {
  try {
    const msgId = message.key?.id;
    if (!msgId) return;

    const from = message.key?.remoteJid || '';
    const number = from.replace('@s.whatsapp.net', '').replace('@g.us', '');
    const pushName = message.pushName || 'Unknown';
    const isGroup = from.endsWith('@g.us');

    // Extract content
    const body =
      message.message?.conversation ||
      message.message?.extendedTextMessage?.text ||
      message.message?.imageMessage?.caption ||
      null;

    const mediaType =
      message.message?.imageMessage ? '🖼️ Image' :
      message.message?.videoMessage ? '🎥 Video' :
      message.message?.audioMessage ? '🎵 Audio' :
      message.message?.documentMessage ? '📄 Document' :
      message.message?.stickerMessage ? '🎭 Sticker' :
      null;

    // Store with timestamp
    messageStore.set(msgId, {
      from,
      number,
      pushName,
      body,
      mediaType,
      isGroup,
      sentAt: new Date(),
    });

    // Trim old messages
    if (messageStore.size > MAX_STORE) {
      const firstKey = messageStore.keys().next().value;
      messageStore.delete(firstKey);
    }

  } catch (err) {
    // Silent fail — don't break main flow
  }
}

// ── Handle delete event ───────────────────────────────────
export async function handleDeletedMessage(sock, messageUpdate) {
  try {
    if (!MY_NUMBER) return;

    for (const update of messageUpdate) {
      // Check if this is a "Delete for Everyone"
      if (update.update?.message === null || update.update?.messageStubType === 1) {

        const msgId = update.key?.id;
        const stored = messageStore.get(msgId);

        if (!stored) return; // Message wasn't stored (too old or unseen)

        // Don't alert for your own deleted messages
        if (update.key?.fromMe) return;

        const deletedAt = new Date();
        const sentAt = stored.sentAt;

        // Format times in PKT
        const formatTime = (date) =>
          date.toLocaleTimeString('en-PK', {
            timeZone: 'Asia/Karachi',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          });

        const formatDate = (date) =>
          date.toLocaleDateString('en-PK', {
            timeZone: 'Asia/Karachi',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          });

        // Build notification
        let alert = `🗑️ *Deleted Message Alert!*\n`;
        alert += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        alert += `👤 *From:* ${stored.pushName} (${stored.number})\n`;

        if (stored.isGroup) {
          const groupName = stored.from.replace('@g.us', '');
          alert += `👥 *Group:* ${groupName}\n`;
        }

        alert += `\n`;

        if (stored.body) {
          alert += `💬 *Message:*\n"${stored.body}"\n\n`;
        } else if (stored.mediaType) {
          alert += `📎 *Content:* ${stored.mediaType} (media deleted)\n\n`;
        } else {
          alert += `❓ *Content:* Unknown (possibly media)\n\n`;
        }

        alert += `📤 *Sent at:* ${formatTime(sentAt)} — ${formatDate(sentAt)}\n`;
        alert += `🗑️ *Deleted at:* ${formatTime(deletedAt)} — ${formatDate(deletedAt)}\n`;
        alert += `━━━━━━━━━━━━━━━━━━━━━━`;

        // Send to owner
        await sock.sendMessage(`${MY_NUMBER}@s.whatsapp.net`, { text: alert });

        console.log(`🗑️ Deleted msg caught from ${stored.pushName}: "${stored.body?.substring(0, 40) || '[media]'}"`);

        // Remove from store after alerting
        messageStore.delete(msgId);
      }
    }
  } catch (err) {
    console.error('Delete handler error:', err.message);
  }
}

// ── Stats ─────────────────────────────────────────────────
export function getStoreSize() {
  return messageStore.size;
}
