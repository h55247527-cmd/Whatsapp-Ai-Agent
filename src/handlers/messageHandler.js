// src/handlers/messageHandler.js — v6 Complete

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

function getProjectState(number) {
  if (!projectStates.has(number)) {
    projectStates.set(number, { active: false, collectedInfo: null, readyToQuote: false, questionCount: 0, quoteSent: false });
  }
  return projectStates.get(number);
}

export async function handleMessage(sock, message) {
  try {
    const from = message.key.remoteJid;
    if (from.endsWith('@g.us') || message.key.fromMe) return;

    const number = from.replace('@s.whatsapp.net', '');
    if (number === process.env.MY_NUMBER) return;

    const pushName = message.pushName || '';

    // ── Extract content type ──────────────────────────────
    const body =
      message.message?.conversation ||
      message.message?.extendedTextMessage?.text ||
      message.message?.imageMessage?.caption ||
      message.message?.documentMessage?.caption || '';

    const hasImage = !!(message.message?.imageMessage);
    const hasVoice = !!(message.message?.audioMessage);
    const hasDocument = !!(message.message?.documentMessage);
    const hasVideo = !!(message.message?.videoMessage);

    if (!body && !hasImage && !hasVoice && !hasDocument) return;

    console.log(`\n📩 ${pushName || number} | ${hasImage ? '[IMG]' : hasVoice ? '[VOICE]' : hasDocument ? '[DOC]' : body.substring(0,40)}`);

    // Store for deleted msg detection
    storeMessage(message);

    // ── Get/create contact in DB ──────────────────────────
    const dbContact = getContact(number);
    const isBlocked = dbContact?.is_blocked;
    if (isBlocked) return;

    // ── Intelligence analysis ─────────────────────────────
    const mood = body ? detectMood(body) : 'neutral';
    const lang = body ? detectLanguage(body) : (dbContact?.language || 'hinglish');
    const spamResult = analyzeSpamScam(body || '');

    // ── Spam/Scam handling ────────────────────────────────
    const currentSpamScore = (dbContact?.spam_score || 0) + spamResult.score;

    if (spamResult.score >= 3 || currentSpamScore >= 8) {
      upsertContact(number, { name: pushName, category: 'spammer', spam_score: currentSpamScore });

      if (currentSpamScore >= 12) {
        blockContact(number);
        await sendReply(sock, from, spamResult.type === 'scam'
          ? '⚠️ Scam activity detected. Number blocked.'
          : 'Spam activity detected. Number blocked.');
        return;
      }

      const warn = await generateReply(number, body, 'spammer', mood, lang, null);
      await sendReply(sock, from, warn);
      trackMessage(number, 'spammer');
      return;
    }

    // ── Classify contact ──────────────────────────────────
    let contactType = classifyContact(number, dbContact);
    const projectState = getProjectState(number);
    cancelFollowUp(number);

    // ── Project intent ────────────────────────────────────
    if (contactType !== 'friend' && !projectState.active && body) {
      if (detectProjectIntent(body)) {
        projectState.active = true;
        contactType = 'client';
        console.log(`💼 Client mode: ${number}`);
      }
    }

    // ── Trust + Relationship scores ───────────────────────
    const trustScore = calculateTrustScore(dbContact, mood, dbContact?.message_count || 0);
    const relScore = calculateRelationshipScore(dbContact);

    // ── Update DB contact ─────────────────────────────────
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

    // ══ VOICE NOTE ════════════════════════════════════════
    if (hasVoice) {
      try {
        const { downloadMediaMessage } = await import('@whiskeysockets/baileys');
        const buffer = await downloadMediaMessage(message, 'buffer', {});
        await sleep(1500);

        const transcription = await transcribeVoiceNote(buffer);
        if (transcription) {
          console.log(`🎙️ Voice: "${transcription.substring(0, 50)}"`);
          const reply = await generateReply(number, `[Voice Note]: ${transcription}`, contactType, mood, lang, projectState);
          await sendReply(sock, from, reply);
        } else {
          await sendReply(sock, from, contactType === 'friend'
            ? 'Yaar voice note sun nahi paya 😅 text mein bhej!'
            : 'Voice note process nahi ho saki. Text mein bataein please.');
        }
        return;
      } catch (err) {
        console.error('Voice error:', err.message);
        await sendReply(sock, from, 'Voice note nahi sun paya, text bhejo!');
        return;
      }
    }

    // ══ DOCUMENT (PDF/DOCX) ═══════════════════════════════
    if (hasDocument) {
      try {
        const { downloadMediaMessage } = await import('@whiskeysockets/baileys');
        const buffer = await downloadMediaMessage(message, 'buffer', {});
        const mimeType = message.message.documentMessage?.mimetype || '';
        const fileName = message.message.documentMessage?.fileName || '';

        await sleep(2000);
        await sock.sendMessage(from, { text: contactType === 'friend' ? '📄 File dekh raha hoon...' : '📄 Document analyze kar raha hoon...' });

        let text = null;
        if (mimeType.includes('pdf') || fileName.endsWith('.pdf')) {
          text = await extractPDF(buffer);
        } else if (mimeType.includes('word') || fileName.endsWith('.docx')) {
          text = await extractDOCX(buffer);
        } else if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
          text = buffer.toString('utf-8');
        }

        if (text) {
          // Check if it looks like project requirements
          const isProjectDoc = detectProjectIntent(text.substring(0, 500));

          if (isProjectDoc && contactType !== 'friend') {
            const analysis = await analyzeProjectRequirements(text);
            const formatted = formatProjectAnalysis(analysis, pushName);
            await sendReply(sock, from, formatted);

            // Save as lead
            if (analysis) {
              projectState.active = true;
              projectState.collectedInfo = {
                projectType: analysis.projectType,
                features: analysis.features,
                timeline: analysis.timeline,
                budget: `${analysis.estimatedCost?.min}-${analysis.estimatedCost?.max} PKR`,
                infoComplete: true,
              };
              saveLeadDB({ number, name: pushName, project_type: analysis.projectType, features: JSON.stringify(analysis.features), status: 'Analyzed' });
            }
          } else {
            const summary = await analyzeDocument(text, contactType);
            await sendReply(sock, from, summary || 'Document mila lekin summarize nahi ho saka.');
          }
        } else {
          await sendReply(sock, from, contactType === 'friend'
            ? 'Yaar ye file open nahi ho rahi 😅'
            : 'Document format support nahi hai. PDF ya DOCX bhejein.');
        }
        return;
      } catch (err) {
        console.error('Document error:', err.message);
        await sendReply(sock, from, 'Document process nahi ho saka.');
        return;
      }
    }

    // ══ IMAGE ═════════════════════════════════════════════
    if (hasImage) {
      try {
        const { downloadMediaMessage } = await import('@whiskeysockets/baileys');
        const buffer = await downloadMediaMessage(message, 'buffer', {});
        const mimeType = message.message.imageMessage?.mimetype || 'image/jpeg';

        await sleep(naturalDelay(30));
        const imageReply = await analyzeImage(buffer.toString('base64'), mimeType, body, contactType);
        await sendReply(sock, from, imageReply);
        return;
      } catch (err) {
        console.error('Image error:', err.message);
        await sendReply(sock, from, 'Image dekh nahi paya, dobara bhejo!');
        return;
      }
    }

    // ══ TEXT MESSAGE ══════════════════════════════════════

    // Project info extraction every 3 messages
    if (projectState.active) {
      contactType = 'client';
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

    // Generate reply
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

      // Google Sheets backup
      await saveLeadSheets({ ...leadData, features: projectState.collectedInfo?.features });

      // Schedule follow-up
      scheduleFollowUp(number, projectState.collectedInfo, async (num, msg) => {
        await sock.sendMessage(`${num}@s.whatsapp.net`, { text: msg });
      });
    }

    await sleep(naturalDelay(body.length));
    await sendReply(sock, from, reply);
    console.log(`✅ Reply: ${reply.substring(0, 60)}...`);

  } catch (err) {
    console.error('❌ Handler Error:', err.message);
  }
}

async function sendReply(sock, jid, text) {
  await sock.sendMessage(jid, { text });
}

function naturalDelay(len) {
  return Math.min(len * 30, 2000) + Math.min(len * 20, 3000) + Math.random() * 800;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
