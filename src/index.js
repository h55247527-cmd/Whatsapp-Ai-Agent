// src/index.js — v6 HasDevs AI Agent
import makeWASocket, {
  useMultiFileAuthState, DisconnectReason,
  fetchLatestBaileysVersion, makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import pino from 'pino';
import { handleMessage } from './handlers/messageHandler.js';
import { startDailyReport } from './services/reportService.js';
import { initSheet } from './services/sheetsService.js';
import { handleDeletedMessage, storeMessage } from './services/deletedMsgService.js';
import { initDB, startAutoSave } from './utils/database.js';
import dotenv from 'dotenv';
dotenv.config();

const logger = pino({ level: 'silent' });
let stats = { recv: 0, sent: 0, start: new Date() };

async function startBot() {
  console.log(`
╔══════════════════════════════════════════════════╗
║   🤖 HasDevs AI Agent v6.0                      ║
║   Contact Intelligence | Mood Detection          ║
║   Voice | PDF/DOCX | Project Analyzer            ║
║   SQLite Memory | Lead CRM | Follow-up           ║
║   Identity: ${(process.env.MY_NAME || 'You').padEnd(36)}║
╚══════════════════════════════════════════════════╝
  `);

  // Initialize DB first
  await initDB();
  startAutoSave();

  // Init Google Sheets
  await initSheet();

  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState(process.env.SESSION_FOLDER || './sessions');

  const sock = makeWASocket({
    version,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    logger,
    printQRInTerminal: false,
    browser: ['Chrome (Linux)', '', ''],
    syncFullHistory: false,
    markOnlineOnConnect: true,
  });

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      await QRCode.toFile(path.resolve('./qr.png'), qr, { type: 'png', width: 400, margin: 2 });
      console.log('\n📸 QR saved → qr.png | Railway → Files tab → Download\n');
    }

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (fs.existsSync('./qr.png')) fs.unlinkSync('./qr.png');
      console.log(`🔴 Disconnected: ${reason}`);

      if (reason === DisconnectReason.loggedOut) { console.log('❌ Logged out!'); process.exit(0); }
      else if (reason === DisconnectReason.connectionReplaced) { console.log('❌ Session replaced!'); process.exit(0); }
      else { console.log('🔄 Reconnecting in 5s...'); setTimeout(startBot, 5000); }
    }

    if (connection === 'open') {
      if (fs.existsSync('./qr.png')) fs.unlinkSync('./qr.png');
      console.log(`\n✅ LIVE as: ${process.env.MY_NAME}`);
      console.log('📊 Listening...\n');

      startDailyReport(async (jid, text) => { await sock.sendMessage(jid, { text }); });
      setInterval(() => {
        const up = Math.floor((new Date() - stats.start) / 60000);
        console.log(`📊 Uptime: ${up}m | Recv: ${stats.recv} | Sent: ${stats.sent}`);
      }, 30 * 60 * 1000);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.message) continue;
      storeMessage(msg);
      stats.recv++;
      await handleMessage(sock, msg);
      stats.sent++;
    }
  });

  sock.ev.on('messages.update', async (updates) => {
    await handleDeletedMessage(sock, updates);
  });

  process.on('SIGINT', () => { console.log('\n👋 Bye!'); process.exit(0); });
}

startBot().catch(console.error);
