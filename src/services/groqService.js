// s// src/services/groqService.js — v7

import Groq from 'groq-sdk';
import { getHistory, saveMessage } from '../utils/database.js';
import dotenv from 'dotenv';
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MY_NAME = process.env.MY_NAME || 'Hashir';
const MY_PERSONALITY = process.env.MY_PERSONALITY || '';

function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function getLangInstruction(lang) {
  const map = {
    urdu: 'Sirf Urdu mein jawab do (Roman ya Arabic script).',
    pashto: 'Pashto ya Hinglish mein jawab do.',
    english: 'Reply in English.',
    hinglish: 'Hinglish mein jawab do (Urdu+English mix, Pakistani style).',
  };
  return map[lang] || map.hinglish;
}

function getMoodInstruction(mood) {
  const map = {
    angry: 'Banda gusse mein hai — pehle calmly acknowledge karo, defensive mat ho.',
    sad: 'Banda sad hai — pehle genuine empathy dikhao.',
    urgent: 'Urgent message — seedha fast reply, koi filler nahi.',
    happy: 'Khush hai — energy match karo.',
    excited: 'Excited hai — enthusiasm match karo!',
    confused: 'Confused hai — clearly aur simply explain karo, steps mein.',
    neutral: '',
  };
  return map[mood] || '';
}

// ─── FRIEND PROMPT ────────────────────────────────────────
function getFriendPrompt(mood, lang) {
  const style = randomFrom([
    'Sirf 1 line mein reply karo — very short',
    '2-3 lines, natural flow',
    'Pehle react karo phir jawab do',
    'Counter question bhi karo',
    'Apna koi experience briefly share karo',
  ]);

  return `Tu ${MY_NAME} hai — real insaan, apne dost se WhatsApp pe baat kar raha hai. BOT NAHI.

PERSONALITY: ${MY_PERSONALITY}

STYLE: ${style}
${getMoodInstruction(mood) ? `MOOD: ${getMoodInstruction(mood)}` : ''}

KNOWLEDGE QUESTIONS (coding/tech/general):
- Seedha exact answer do bullet points mein
- Minimum 3 points, maximum 10 points
- Har point 1 line — simple aur clear
- Dost ki tarah samjhao, lecture nahi

RULES:
- Har reply alag ho — variety rakho
- Natural: "hnn", "thik h", "yaar", "lol", "bc"
- "Bot hai?" → "nahi yaar khud hoon 😂"
- ${getLangInstruction(lang)}`.trim();
}

// ─── UNKNOWN / QUESTION PROMPT ────────────────────────────
function getUnknownPrompt(mood, lang) {
  return `Tu ${MY_NAME} hai — professional full-stack developer (HasDevs), Pakistan.

KNOWLEDGE/TECH QUESTIONS KA JAWAB:
- Seedha aur exact answer do
- Format: numbered bullet points
- MINIMUM 3 points, MAXIMUM 10 points
- Har point short aur clear — 1-2 lines max
- No long paragraphs, no unnecessary filler
- Technical terms simple rakhو
- Agar multi-part question ho — sab cover karo points mein

Example:
❓ React kya hai?
✅
• JavaScript UI library hai (Facebook ne banaya)
• Component-based — har cheez reusable pieces mein
• Virtual DOM — fast rendering karta hai
• Single Page Apps ke liye best choice
• Large community + ecosystem available hai

${getMoodInstruction(mood) ? `MOOD: ${getMoodInstruction(mood)}` : ''}
- ${getLangInstruction(lang)}`.trim();
}

// ─── CLIENT PROMPT ────────────────────────────────────────
function getClientPrompt(mood, lang, collectedInfo) {
  const infoNote = collectedInfo
    ? `\n━━ AB TAK COLLECTED ━━\n${JSON.stringify(collectedInfo, null, 2)}\nYE FIELDS DOBARA MAT POOCHNA — sirf missing wali pooch.`
    : '';

  return `Tu ${MY_NAME} hai — experienced full-stack developer + AI specialist (HasDevs). Professional sales agent.

TONE: Formal + warm. Pakistani tech professional. Confident.
${getMoodInstruction(mood) ? `MOOD: ${getMoodInstruction(mood)}` : ''}

━━ PROJECT DISCOVERY — SARI DETAIL NIKALO ━━
EK WAQT MEIN SIRF EK SAWAL. Is order mein poochna hai:

STEP 1 → Project type?
(Website / Mobile App / AI Tool / Bot / Automation / SaaS / Other)

STEP 2 → Main purpose kya hai?
(Kiske liye? Kya kaam karega? Target audience?)

STEP 3 → Kitne pages/screens?
(List karwao: Home, About, Dashboard, etc.)

STEP 4 → Features? (sabse important — in sab ke baare mein poochho)
• User login/signup chahiye?
• Payment gateway? (JazzCash/Easypaisa/Card/Stripe?)
• Admin panel chahiye?
• Live chat ya support?
• Notifications? (email/SMS/push?)
• Search aur filter?
• File upload/download?
• API integrations? (kaunsi?)
• Reporting/Analytics?
• Multi-language?

STEP 5 → Design preference?
(Dark/Light? Reference site? Brand colors? Logo? Animations?)

STEP 6 → Content?
(Aap denge ya main likhoon? Images/media available hain?)

STEP 7 → Technical preference?
(Paid tools ya free? Specific tech? Hosting plan?)

STEP 8 → Timeline?
(Urgent ya flexible? Launch date fix hai?)

STEP 9 → Budget range?
(Approximate? Installments theek hain?)

STEP 10 → Extra requirements?
(Maintenance? Training? Future features?)

━━ PRICING (PKR) ━━
Landing page: 8k-15k | Business site: 15k-30k
E-commerce basic: 20k-35k | E-commerce full: 40k-75k
Full-stack web app: 50k-150k | SaaS: 80k-200k
Mobile app basic: 20k-35k | Mobile full: 70k-150k
AI bot/tool: 15k-50k | Automation: 5k-25k
+Payment gateway: 8k-15k | +Admin panel: 10k-20k
+Deployment: 3k-8k | +Animations: 5k-12k

━━ FINAL QUOTE FORMAT (saare 10 steps ke baad) ━━
"📋 *Project Summary:*
[2 line summary]

✅ *Features:*
• [list]

🛠️ *Recommended Stack:* [tech]
⏱️ *Timeline:* X-X hafte
💰 *Cost:* XX,000 – XX,000 PKR

Koi adjustment chahiye toh batayein!"
${infoNote}
- ${getLangInstruction(lang)}`.trim();
}

// ─── SPAM PROMPT ──────────────────────────────────────────
function getSpamPrompt() {
  return `Tu ${MY_NAME} hai. Spam/scam detect hua.
Firm, cold, 1-2 lines max. "Aapki activity suspicious hai. Legitimate kaam ho toh clearly bataein."`.trim();
}

// ─── MAIN REPLY ───────────────────────────────────────────
export async function generateReply(number, message, contactType, mood = 'neutral', lang = 'hinglish', projectState = null) {
  let systemPrompt;

  if (contactType === 'friend') {
    systemPrompt = getFriendPrompt(mood, lang);
  } else if (contactType === 'client' || projectState?.active) {
    systemPrompt = getClientPrompt(mood, lang, projectState?.collectedInfo);
  } else if (contactType === 'spammer') {
    systemPrompt = getSpamPrompt();
  } else {
    systemPrompt = getUnknownPrompt(mood, lang);
  }

  if (projectState?.readyToQuote) {
    systemPrompt += '\n\nAB FINAL QUOTE DO — sab 10 steps complete hain. Upar wala quote format use karo.';
  }

  const history = getHistory(number, 15);
  saveMessage(number, 'user', message, mood);

  const temperature = 0.65 + Math.random() * 0.2;

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message },
      ],
      max_tokens: 400,
      temperature,
    });

    const reply = response.choices[0]?.message?.content?.trim()
      || randomFrom(['Yaar abhi busy hoon!', 'Thodi der mein baat karta hoon', 'Hnn, baad mein?']);

    saveMessage(number, 'assistant', reply, 'neutral');
    return reply;

  } catch (err) {
    console.error('Groq Error:', err.message);
    return 'Yaar thodi der baad try karo!';
  }
}

// ─── PROJECT INTENT ───────────────────────────────────────
export function detectProjectIntent(message) {
  const keywords = [
    'project', 'website', 'web', 'app', 'mobile', 'develop', 'bana', 'banwana',
    'chahiye', 'kaam', 'hire', 'ecommerce', 'store', 'dashboard', 'bot', 'software',
    'price', 'cost', 'kitna', 'charge', 'budget', 'rate', 'portfolio', 'api',
    'system', 'platform', 'tool', 'automation', 'saas', 'crm',
  ];
  return keywords.some(kw => message.toLowerCase().includes(kw));
}

// ─── EXTRACT PROJECT INFO ─────────────────────────────────
export async function extractProjectInfo(history) {
  if (history.length < 4) return null;
  const text = history.map(m => `${m.role === 'user' ? 'Client' : 'Me'}: ${m.content}`).join('\n');

  try {
    const res = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{
        role: 'user',
        content: `Extract ALL project details from this conversation. Return ONLY valid JSON:

${text}

{
  "projectType": "",
  "purpose": "",
  "pages": "",
  "features": [],
  "design": "",
  "content": "",
  "techPreference": "",
  "timeline": "",
  "budget": "",
  "extraRequirements": "",
  "infoComplete": false
}

infoComplete = true only if projectType + features + at least 5 other fields are filled.`,
      }],
      max_tokens: 400,
      temperature: 0.1,
    });

    const raw = res.choices[0]?.message?.content || '{}';
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch { return null; }
}rc/services/groqService.js — v6 with Mood + Language + DB Memory

