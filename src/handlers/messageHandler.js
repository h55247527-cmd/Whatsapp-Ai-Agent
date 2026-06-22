// src/handlers/messageHandler.js — v6 Complete
// src/handlers/messageHandler.js — v7 Human-like delays + typing + gatekeeper

import { generateReply, detectProjectIntent, extractProjectInfo } from '../services/groqService.js';
import { analyzeImage } from '../services/visionService.js';
import { transcribeVoiceNote } from '../services/voiceService.js';
import { extractPDF, extractDOCX, analyzeDocument, analyzeProjectRequirements, formatProjectAnalysis } from '../services/documentService.js';
import { scheduleFollowUp, cancelFollowUp } from '../services/followUpService.js';
import { saveLead as saveLeadSheets } from '../services/sheetsService.js';
import { trackMessage, trackLead, trackQuote } from '../services/reportService.js';
import { storeMessage } from '../services/deletedMsgService.js';
import { detectMood, detectLanguage, classifyContact, analyzeSpamScam, calculateTrustScore, calculateRelationshipScore } from '../services/intelligenceService.js';
import { upsertContact, getContact, blockContact, saveLead as saveLeadDB, getHistory } from '../utils/database.js';

const projectStates = new Map();

// Track gatekeeper state: number -> { shown: bool, choice: 'hashir'|'bot'|null }
const gatekeeperStates = new Map();

function getProjectState(number) {
  if (!projectStates.has(number)) {
    projectStates.set(number, { active: false, collectedInfo: null, readyToQuote: false, questionCount: 0, quoteSent: false });
  }
  return projectStates.get(number);
}

function getGatekeeperState(number) {
  if (!gatekeeperStates.has(number)) {
    gatekeeperStates.set(number, { shown: false, choice: null });
  }
  return gatekeeperStates.get(number);
}

// ── Typing indicator + natural delay ─────────────────────
async function sendWithTyping(sock, jid, text, msgLength = 50) {
  try {
    // Show "recording" / typing presence
    await sock.sendPresenceUpdate('composing', jid);

    // Natural delay: based on reply length (avg human types ~40 chars/sec)
    const charDelay = Math.min(text.length * 60, 4000);   // 60ms per char, max 4s
    const readDelay = Math.min(msgLength * 40, 2000);      // reading incoming msg
    const randomDelay = 500 + Math.random() * 1500;        // 0.5-2s random
    const totalDelay = readDelay + charDelay + randomDelay;

    await sleep(totalDelay);

    // Stop typing
    await sock.sendPresenceUpdate('paused', jid);
    await sleep(200);

    // Send message
    await sock.sendMessage(jid, { text });
  } catch {
    // Fallback: just send without typing
    await sock.sendMessage(jid, { text });
  }
}

// ── Gatekeeper message ────────────────────────────────────
function getGatekeeperMsg(pushName, lang) {
  const name = pushName ? ` ${pushName}` : '';
  if (lang === 'urdu') {
    return `السلام علیکم${name}! 👋\n\nHashir abhi busy hain. Main unka assistant hoon.\n\nAap kya chahte hain?\n\n1️⃣ *Hashir se baat karni hai* — main unhe inform kar deta hoon, jab available honge reply karenge\n\n2️⃣ *Project ya kaam hai* — main abhi help kar sakta hoon\n\n3️⃣ *Koi question poochna hai* — zaroor poochein!`;
  }
  return `Salam${name}! 👋\n\nHashir abhi busy hain. Main unka AI assistant hoon.\n\nAap kya chahte hain?\n\n1️⃣ *Hashir se seedha baat karni hai* — unke active hone ka wait karogay, main inform kar deta hoon\n\n2️⃣ *Project banwana hai ya services chahiye* — main abhi detail le sakta hoon\n\n3️⃣ *Koi knowledge/tech/programming question hai* — main abhi jawab de sakta hoon`;
}

// ── Parse gatekeeper choice ───────────────────────────────
function parseGatekeeperChoice(body) {
  const lower = body.toLowerCase().trim();

  // Option 1 — wants Hashir
  if (lower.includes('1') || lower.includes('hashir') || lower.includes('seedha') ||
      lower.includes('aap se') || lower.includes('tumse') || lower.includes('wait') ||
      lower.includes('khud') || lower.includes('personal')) {
    return 'hashir';
  }

  // Option 2 — project
  if (lower.includes('2') || lower.includes('project') || lower.includes('website') ||
      lower.includes('app') || lower.includes('banwana') || lower.includes('service') ||
      lower.includes('kaam') || lower.includes('hire')) {
    return 'project';
  }

  // Option 3 — question
  if (lower.includes('3') || lower.includes('question') || lower.includes('poochna') ||
      lower.includes('tech') || lower.includes('coding') || lower.includes('programming') ||
      lower.includes('help') || lower.includes('kaise') || lower.includes('kya hai')) {
    return 'question';
  }

  return null; // Not understood
}

// ── Notify owner when someone wants to talk to Hashir ─────
async function notifyOwner(sock, number, pushName, message) {
  const myJid = `${process.env.MY_NUMBER}@s.whatsapp.net`;
  const name = pushName || number;
  const alert = `📬 *Message Alert!*\n\n👤 *${name}* (${number}) tumse personally baat karna chahta hai.\n\n💬 "${message}"\n\n_Bot ne unhe bataya ke tum busy ho — jab free ho reply karo._`;
  try {
    await sock.sendMessage(myJid, { text: alert });
  } catch (err) {
    console.error('Owner notify error:', err.message);
  }
}

export async function handleMessage(sock, message) {
  try {
    const from = message.key.remoteJid;
    if (from.endsWith('@g.us') || message.key.fromMe) return;

    const number = from.replace('@s.whatsapp.net', '');
    if (number === process.env.MY_NUMBER) return;

    const pushName = message.pushName || '';

    const body =
      message.message?.conversation ||
      message.message?.extendedTextMessage?.text ||
      message.message?.imageMessage?.caption ||
      message.message?.documentMessage?.caption || '';

    const hasImage = !!(message.message?.imageMessage);
    const hasVoice = !!(message.message?.audioMessage);
    const hasDocument = !!(message.message?.documentMessage);

    if (!body && !hasImage && !hasVoice && !hasDocument) return;

    console.log(`\n📩 ${pushName || number} | ${hasImage ? '[IMG]' : hasVoice ? '[VOICE]' : hasDocument ? '[DOC]' : body.substring(0, 50)}`);

    storeMessage(message);

    // ── DB contact ────────────────────────────────────────
    const dbContact = getContact(number);
    if (dbContact?.is_blocked) return;

    // ── Intelligence ──────────────────────────────────────
    const mood = body ? detectMood(body) : 'neutral';
    const lang = body ? detectLanguage(body) : (dbContact?.language || 'hinglish');
    const spamResult = analyzeSpamScam(body || '');
    const currentSpamScore = (dbContact?.spam_score || 0) + spamResult.score;

    // ── Spam check ────────────────────────────────────────
    if (spamResult.score >= 3 || currentSpamScore >= 8) {
      upsertContact(number, { name: pushName, category: 'spammer', spam_score: currentSpamScore });
      if (currentSpamScore >= 12) {
        blockContact(number);
        await sendWithTyping(sock, from, 'Spam/scam activity detected. Number blocked.', body.length);
        return;
      }
      const warn = await generateReply(number, body, 'spammer', mood, lang, null);
      await sendWithTyping(sock, from, warn, body.length);
      trackMessage(number, 'spammer');
      return;
    }

    // ── Contact classification ────────────────────────────
    let contactType = classifyContact(number, dbContact);
    const projectState = getProjectState(number);
    const gatekeeperState = getGatekeeperState(number);
    cancelFollowUp(number);

    // ── Trust scores ──────────────────────────────────────
    const trustScore = calculateTrustScore(dbContact, mood, dbContact?.message_count || 0);
    const relScore = calculateRelationshipScore(dbContact);

    upsertContact(number, {
      name: pushName || dbContact?.name,
      category: contactType === 'friend' ? 'friend' : (projectState.active ? 'client' : contactType),
      language: lang,
      trust_score: trustScore,
      relationship_score: relScore,
      spam_score: currentSpamScore,
    });

    trackMessage(number, contactType);
    if (mood !== 'neutral') console.log(`😊 Mood: ${mood} | 🌐 Lang: ${lang}`);

    // ════════════════════════════════════════════════════════
    // GATEKEEPER — only for unknown/stranger (not friends)
    // ════════════════════════════════════════════════════════
    if (contactType !== 'friend' && !gatekeeperState.shown) {
      gatekeeperState.shown = true;
      gatekeeperState.choice = null;

      // Small read delay before showing gatekeeper
      await sock.sendPresenceUpdate('composing', from);
      await sleep(1500 + Math.random() * 1000);
      await sock.sendPresenceUpdate('paused', from);
      await sleep(300);

      const gatekeeperMsg = getGatekeeperMsg(pushName, lang);
      await sock.sendMessage(from, { text: gatekeeperMsg });
      console.log(`🚪 Gatekeeper shown to ${number}`);
      return;
    }

    // ── Gatekeeper response handling ──────────────────────
    if (contactType !== 'friend' && gatekeeperState.shown && !gatekeeperState.choice) {
      const choice = parseGatekeeperChoice(body);

      if (choice === 'hashir') {
        gatekeeperState.choice = 'hashir';
        await notifyOwner(sock, number, pushName, body);
        await sendWithTyping(sock, from,
          lang === 'urdu'
            ? 'Ji bilkul! Maine Hashir ko inform kar diya hai. Jab woh available honge reply karenge. Shukriya aapki patience ke liye! 🙏'
            : 'Sure! Maine Hashir ko inform kar diya — jab available honge woh khud reply karenge. Thoda wait karein! 🙏',
          body.length
        );
        return;
      }

      if (choice === 'project') {
        gatekeeperState.choice = 'project';
        projectState.active = true;
        contactType = 'client';
        await sendWithTyping(sock, from,
          lang === 'urdu'
            ? 'Zabardast! Project ke baare mein batayein — kya banana chahte hain?'
            : 'Great! Batao project kya banana hai — website, app, ya kuch aur?',
          body.length
        );
        return;
      }

      if (choice === 'question') {
        gatekeeperState.choice = 'question';
        contactType = 'unknown';
        // Fall through to normal AI reply
      }

      if (!choice) {
        // Didn't understand — ask again
        await sendWithTyping(sock, from,
          lang === 'urdu'
            ? 'Maafi chahta hoon, samajh nahi aaya. Kripya 1, 2, ya 3 likhein 😊'
            : 'Yaar samajh nahi aaya 😅 Please 1, 2, ya 3 mein se choose karo!',
          body.length
        );
        return;
      }
    }

    // ── If user chose "hashir" — keep reminding ───────────
    if (gatekeeperState.choice === 'hashir' && contactType !== 'friend') {
      await notifyOwner(sock, number, pushName, body);
      await sendWithTyping(sock, from,
        lang === 'urdu'
          ? 'Ji, Maine Hashir ko dobara inform kar diya. Woh jald reply karenge InshaAllah! 🙏'
          : 'Haan bhai, Hashir ko dobara bata diya — thodi der mein reply karenge! 🙏',
        body.length
      );
      return;
    }

    // ── Project intent (for friends too) ─────────────────
    if (!projectState.active && body) {
      if (detectProjectIntent(body)) {
        projectState.active = true;
        if (contactType !== 'friend') contactType = 'client';
      }
    }

    // ══ VOICE NOTE ════════════════════════════════════════
    if (hasVoice) {
      try {
        const { downloadMediaMessage } = await import('@whiskeysockets/baileys');
        const buffer = await downloadMediaMessage(message, 'buffer', {});

        await sock.sendPresenceUpdate('composing', from);
        await sleep(2000);

        const transcription = await transcribeVoiceNote(buffer);
        if (transcription) {
          console.log(`🎙️ Voice: "${transcription.substring(0, 50)}"`);
          const reply = await generateReply(number, `[Voice Note]: ${transcription}`, contactType, mood, lang, projectState);
          await sendWithTyping(sock, from, reply, transcription.length);
        } else {
          await sendWithTyping(sock, from,
            contactType === 'friend' ? 'Yaar voice note sun nahi paya 😅 text mein bhej!' : 'Voice note process nahi ho saki. Text mein bataein.',
            20
          );
        }
        return;
      } catch (err) {
        console.error('Voice error:', err.message);
        await sendWithTyping(sock, from, 'Voice note nahi sun paya!', 20);
        return;
      }
    }

    // ══ DOCUMENT ══════════════════════════════════════════
    if (hasDocument) {
      try {
        const { downloadMediaMessage } = await import('@whiskeysockets/baileys');
        const buffer = await downloadMediaMessage(message, 'buffer', {});
        const mimeType = message.message.documentMessage?.mimetype || '';
        const fileName = message.message.documentMessage?.fileName || '';

        await sendWithTyping(sock, from,
          contactType === 'friend' ? '📄 File dekh raha hoon...' : '📄 Document analyze kar raha hoon...',
          30
        );

        let text = null;
        if (mimeType.includes('pdf') || fileName.endsWith('.pdf')) text = await extractPDF(buffer);
        else if (mimeType.includes('word') || fileName.endsWith('.docx')) text = await extractDOCX(buffer);
        else if (fileName.endsWith('.txt') || fileName.endsWith('.md')) text = buffer.toString('utf-8');

        if (text) {
          const isProjectDoc = detectProjectIntent(text.substring(0, 500));
          if (isProjectDoc && contactType !== 'friend') {
            const analysis = await analyzeProjectRequirements(text);
            const formatted = formatProjectAnalysis(analysis, pushName);
            await sendWithTyping(sock, from, formatted, 100);
            if (analysis) {
              projectState.active = true;
              projectState.collectedInfo = { projectType: analysis.projectType, features: analysis.features, timeline: analysis.timeline, infoComplete: true };
              saveLeadDB({ number, name: pushName, project_type: analysis.projectType, features: JSON.stringify(analysis.features), status: 'Analyzed' });
            }
          } else {
            const summary = await analyzeDocument(text, contactType);
            await sendWithTyping(sock, from, summary || 'Document analyze nahi ho saka.', 80);
          }
        } else {
          await sendWithTyping(sock, from,
            contactType === 'friend' ? 'Yaar ye file open nahi ho rahi 😅' : 'Format support nahi — PDF ya DOCX bhejein.',
            30
          );
        }
        return;
      } catch (err) {
        console.error('Doc error:', err.message);
        await sendWithTyping(sock, from, 'Document process nahi ho saka.', 20);
        return;
      }
    }

    // ══ IMAGE ═════════════════════════════════════════════
    if (hasImage) {
      try {
        const { downloadMediaMessage } = await import('@whiskeysockets/baileys');
        const buffer = await downloadMediaMessage(message, 'buffer', {});
        const mimeType = message.message.imageMessage?.mimetype || 'image/jpeg';

        await sock.sendPresenceUpdate('composing', from);
        await sleep(2000 + Math.random() * 1500);

        const imageReply = await analyzeImage(buffer.toString('base64'), mimeType, body, contactType);
        await sendWithTyping(sock, from, imageReply, body.length || 30);
        return;
      } catch (err) {
        console.error('Image error:', err.message);
        await sendWithTyping(sock, from, 'Image dekh nahi paya!', 15);
        return;
      }
    }

    // ══ TEXT MESSAGE ══════════════════════════════════════
    if (projectState.active) {
      contactType = contactType === 'friend' ? 'friend' : 'client';
      projectState.questionCount += 1;

      if (projectState.questionCount % 3 === 0) {
        const history = getHistory(number, 10);
        if (history.length >= 4) {
          const info = await extractProjectInfo(history);
          if (info) {
            projectState.collectedInfo = info;
            projectState.readyToQuote = info.infoComplete === true;
          }
        }
      }
    }

    const reply = await generateReply(number, body, contactType, mood, lang, projectState);

    // Post-quote actions
    if (projectState.readyToQuote && !projectState.quoteSent) {
      projectState.quoteSent = true;
      projectState.readyToQuote = false;
      trackQuote();

      const leadData = {
        number, name: pushName,
        project_type: projectState.collectedInfo?.projectType,
        purpose: projectState.collectedInfo?.purpose,
        features: JSON.stringify(projectState.collectedInfo?.features || []),
        timeline: projectState.collectedInfo?.timeline,
        budget: projectState.collectedInfo?.budget,
        status: 'Quoted', pipeline_stage: 'proposal_sent',
      };
      saveLeadDB(leadData);
      trackLead(number, pushName, projectState.collectedInfo?.projectType, projectState.collectedInfo?.budget);
      await saveLeadSheets({ ...leadData, features: projectState.collectedInfo?.features });
      scheduleFollowUp(number, projectState.collectedInfo, async (num, msg) => {
        await sock.sendMessage(`${num}@s.whatsapp.net`, { text: msg });
      });
    }

    // Send with typing indicator + natural delay
    await sendWithTyping(sock, from, reply, body.length);
    console.log(`✅ Reply: ${reply.substring(0, 60)}...`);

  } catch (err) {
    console.error('❌ Handler Error:', err.message);
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}