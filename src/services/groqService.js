// src/services/groqService.js — v6 with Mood + Language + DB Memory

import Groq from 'groq-sdk';
import { getHistory, saveMessage } from '../utils/database.js';
import dotenv from 'dotenv';
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MY_NAME = process.env.MY_NAME || 'Hashir';
const MY_PERSONALITY = process.env.MY_PERSONALITY || '';

function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ── Language-aware system suffix ──────────────────────────
function getLangInstruction(lang) {
  const map = {
    urdu: 'Sirf Urdu mein jawab do (Roman ya Arabic script).',
    pashto: 'Pashto ya Hinglish mein jawab do.',
    english: 'Reply in English.',
    hinglish: 'Hinglish mein jawab do (Urdu+English mix, Pakistani style).',
  };
  return map[lang] || map.hinglish;
}

// ── Mood-aware tone injection ─────────────────────────────
function getMoodInstruction(mood) {
  const map = {
    angry: 'Banda thoda gusse mein lagta hai — pehle acknowledge karo, phir calmly jawab do. Defensive mat ho.',
    sad: 'Banda sad lag raha hai — pehle empathy dikhao genuinely. Solution baad mein.',
    urgent: 'Urgent message hai — seedha aur fast reply karo. Koi filler nahi.',
    happy: 'Banda khush hai — match karo energy, positive raho.',
    excited: 'Banda excited hai — enthusiasm match karo!',
    confused: 'Banda confused hai — clearly aur simply explain karo. Steps mein.',
    neutral: '',
  };
  return map[mood] || '';
}

// ─── System Prompts ───────────────────────────────────────
function getFriendPrompt(mood, lang) {
  const style = randomFrom([
    'Sirf 1 line mein reply karo — very short',
    '2-3 lines, natural flow',
    'Pehle react karo, phir jawab do',
    'Counter question bhi karo',
    'Apna koi experience share karo phir jawab do',
  ]);

  const moodNote = getMoodInstruction(mood);

  return `Tu ${MY_NAME} hai — real insaan, apne dost se WhatsApp pe baat kar raha hai. BOT NAHI.

PERSONALITY: ${MY_PERSONALITY}

STYLE: ${style}
${moodNote ? `MOOD AWARENESS: ${moodNote}` : ''}

RULES:
- Har reply different ho — kabhi short, kabhi medium
- Natural typos/abbreviations: "hnn", "thik h", "lol", "yaar", "bc"
- "Bot hai?" → "nahi yaar khud hoon 😂"
- Knowledge questions pe seedha helpful jawab
- ${getLangInstruction(lang)}`.trim();
}

function getUnknownPrompt(mood, lang) {
  return `Tu ${MY_NAME} hai — professional full-stack developer (HasDevs), Pakistan.

Unknown number se pehli baar baat:
- Warmly greet karo
- Pooch kaun hain, kahan se contact mila
- Project/kaam ho → CLIENT MODE
- ${getMoodInstruction(mood)}
- Ek waqt mein sirf EK question
- ${getLangInstruction(lang)}`.trim();
}

function getClientPrompt(mood, lang, collectedInfo) {
  const infoNote = collectedInfo
    ? `\nAB TAK KI INFO:\n${JSON.stringify(collectedInfo, null, 2)}\nYe dobara mat poochna.`
    : '';

  return `Tu ${MY_NAME} hai — experienced full-stack developer + AI specialist (HasDevs). Professional sales agent.

TONE: Formal + warm. Pakistani tech professional style.
${getMoodInstruction(mood)}

DISCOVERY ORDER (ek ek karke):
1. Project type?
2. Purpose/niche?
3. Pages/screens/sections?
4. Features? (login, payments, admin, chat)
5. Design? (dark/light, reference?)
6. Paid tools ya free?
7. Timeline?
8. Budget range?

PRICING (PKR):
- Landing page: 8k-15k
- Business site: 15k-30k
- E-commerce basic: 20k-35k
- E-commerce full: 40k-75k
- Full-stack app: 50k-150k
- Mobile app basic: 20k-35k
- Mobile app full: 70k-150k
- AI bot/tool: 15k-50k
- Automation: 5k-25k

QUOTE FORMAT (saari info ke baad):
"✅ [features]
💰 Cost: XX,000 – XX,000 PKR
⏱️ Timeline: X hafte"
${infoNote}
- ${getLangInstruction(lang)}`.trim();
}

function getSpamPrompt() {
  return `Tu ${MY_NAME} hai. Spam/scam detect hua. Firm, cold, 1-2 lines:
"Aapki activity suspicious hai. Legitimate kaam ho toh clearly bataein."`.trim();
}

// ─── Main Reply ───────────────────────────────────────────
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
    systemPrompt += '\n\nAB PRICE QUOTE KARO — sab info mil gayi.';
  }

  // Get history from SQLite
  const history = getHistory(number, 15);

  // Save user message
  saveMessage(number, 'user', message, mood);

  const temperature = 0.7 + Math.random() * 0.25;

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message },
      ],
      max_tokens: 350,
      temperature,
    });

    const reply = response.choices[0]?.message?.content?.trim()
      || randomFrom(['Yaar abhi busy hoon!', 'Thodi der mein baat karta hoon', 'Hnn, baad mein?']);

    // Save assistant reply
    saveMessage(number, 'assistant', reply, 'neutral');

    return reply;

  } catch (err) {
    console.error('Groq Error:', err.message);
    return 'Yaar network issue, thodi der baad try karo!';
  }
}

// ─── Project Intent ───────────────────────────────────────
export function detectProjectIntent(message) {
  const keywords = [
    'project', 'website', 'web', 'app', 'mobile', 'develop', 'bana', 'banwana',
    'chahiye', 'kaam', 'hire', 'ecommerce', 'store', 'dashboard', 'bot', 'software',
    'price', 'cost', 'kitna', 'charge', 'budget', 'rate', 'portfolio', 'api',
    'system', 'platform', 'tool', 'automation', 'saas', 'crm',
  ];
  return keywords.some(kw => message.toLowerCase().includes(kw));
}

// ─── Extract Project Info ─────────────────────────────────
export async function extractProjectInfo(history) {
  if (history.length < 4) return null;
  const text = history.map(m => `${m.role === 'user' ? 'Client' : 'Me'}: ${m.content}`).join('\n');

  try {
    const res = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{
        role: 'user',
        content: `Extract project info from conversation. Return ONLY JSON:\n\n${text}\n\n{"projectType":"","purpose":"","pages":"","features":[],"design":"","paidTools":"","timeline":"","budget":"","infoComplete":false}\n\ninfoComplete=true only if projectType+features+3 other fields filled.`,
      }],
      max_tokens: 300,
      temperature: 0.1,
    });

    const raw = res.choices[0]?.message?.content || '{}';
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch { return null; }
}
