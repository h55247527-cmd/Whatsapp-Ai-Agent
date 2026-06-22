// src/services/documentService.js
// Phase 6: PDF, DOCX, TXT reading + Requirement Extraction

import fs from 'fs';
import path from 'path';
import Groq from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── Extract text from PDF ─────────────────────────────────
export async function extractPDF(buffer) {
  try {
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
    const data = await pdfParse(buffer);
    return data.text?.trim() || null;
  } catch (err) {
    console.error('PDF parse error:', err.message);
    return null;
  }
}

// ── Extract text from DOCX ────────────────────────────────
export async function extractDOCX(buffer) {
  try {
    const mammoth = (await import('mammoth')).default;
    const result = await mammoth.extractRawText({ buffer });
    return result.value?.trim() || null;
  } catch (err) {
    console.error('DOCX parse error:', err.message);
    return null;
  }
}

// ── Analyze document with Groq ─────────────────────────────
export async function analyzeDocument(text, contactType) {
  if (!text || text.length < 20) return null;

  // Truncate if too long
  const truncated = text.length > 3000 ? text.substring(0, 3000) + '...' : text;

  const isClient = contactType === 'client' || contactType === 'unknown';

  const prompt = isClient
    ? `You are analyzing a document sent by a client. Extract and summarize in Hinglish (Pakistani style):
1. Kya hai ye document?
2. Main requirements kya hain?
3. Koi project/work mention hai?
4. Koi budget/timeline mention hai?
5. Next step kya hona chahiye?

Document:
${truncated}

Reply professional aur helpful rakho. 3-5 lines.`
    : `Summarize this document briefly in Hinglish (2-3 lines):
${truncated}`;

  try {
    const res = await groq.chat.completions.create({
      model: 'llama3-8b-8192',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400,
      temperature: 0.5,
    });
    return res.choices[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error('Doc analysis error:', err.message);
    return null;
  }
}

// ── Project Requirement Analyzer ──────────────────────────
export async function analyzeProjectRequirements(text) {
  const prompt = `Analyze this project requirement and return ONLY valid JSON:

${text.substring(0, 3000)}

Return format:
{
  "projectTitle": "",
  "projectType": "",
  "features": [],
  "techStack": {
    "frontend": "",
    "backend": "",
    "database": "",
    "other": []
  },
  "timeline": "",
  "estimatedCost": {
    "min": 0,
    "max": 0,
    "currency": "PKR"
  },
  "complexity": "simple|medium|complex",
  "risks": [],
  "summary": ""
}`;

  try {
    const res = await groq.chat.completions.create({
      model: 'llama3-8b-8192',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 600,
      temperature: 0.2,
    });

    const raw = res.choices[0]?.message?.content || '{}';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

// ── Format project analysis as WhatsApp message ───────────
export function formatProjectAnalysis(analysis, contactName = 'Aap') {
  if (!analysis) return 'Document analyze nahi ho saka. Dobara try karein.';

  let msg = `📋 *Project Analysis*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (analysis.projectTitle) msg += `🏷️ *Title:* ${analysis.projectTitle}\n`;
  if (analysis.projectType) msg += `📁 *Type:* ${analysis.projectType}\n`;
  if (analysis.complexity) msg += `⚡ *Complexity:* ${analysis.complexity}\n\n`;

  if (analysis.features?.length) {
    msg += `✅ *Features:*\n`;
    analysis.features.slice(0, 6).forEach(f => msg += `  • ${f}\n`);
    msg += '\n';
  }

  if (analysis.techStack) {
    msg += `🛠️ *Tech Stack:*\n`;
    if (analysis.techStack.frontend) msg += `  • Frontend: ${analysis.techStack.frontend}\n`;
    if (analysis.techStack.backend) msg += `  • Backend: ${analysis.techStack.backend}\n`;
    if (analysis.techStack.database) msg += `  • Database: ${analysis.techStack.database}\n`;
    msg += '\n';
  }

  if (analysis.estimatedCost?.min) {
    msg += `💰 *Estimated Cost:* ${analysis.estimatedCost.min.toLocaleString()} – ${analysis.estimatedCost.max.toLocaleString()} ${analysis.estimatedCost.currency}\n`;
  }

  if (analysis.timeline) msg += `⏱️ *Timeline:* ${analysis.timeline}\n`;

  if (analysis.risks?.length) {
    msg += `\n⚠️ *Risks:*\n`;
    analysis.risks.slice(0, 3).forEach(r => msg += `  • ${r}\n`);
  }

  msg += `\n━━━━━━━━━━━━━━━━━━━━━━`;
  return msg;
}
