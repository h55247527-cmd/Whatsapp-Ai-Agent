// src/services/voiceService.js
// Phase 5: Voice Note STT using Groq Whisper (free)

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

const GROQ_API_KEY = process.env.GROQ_API_KEY;

export async function transcribeVoiceNote(audioBuffer, mimeType = 'audio/ogg') {
  try {
    // Save buffer to temp file
    const tmpDir = './tmp';
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, `voice_${Date.now()}.ogg`);
    fs.writeFileSync(tmpPath, audioBuffer);

    // Create form data for Groq Whisper
    const formData = new FormData();
    const blob = new Blob([fs.readFileSync(tmpPath)], { type: 'audio/ogg' });
    formData.append('file', blob, 'voice.ogg');
    formData.append('model', 'whisper-large-v3');
    formData.append('response_format', 'json');
    formData.append('language', 'ur'); // Urdu/Hinglish

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: formData,
    });

    // Cleanup temp file
    fs.unlinkSync(tmpPath);

    if (!res.ok) {
      const err = await res.text();
      console.error('Whisper error:', err);
      return null;
    }

    const data = await res.json();
    return data.text || null;

  } catch (err) {
    console.error('Voice transcription error:', err.message);
    return null;
  }
}

// Generate a reply acknowledging the voice note
export function getVoiceNoteReply(transcription, contactType) {
  if (!transcription) {
    return contactType === 'friend'
      ? 'Yaar voice note sun nahi paya, text mein bhej!'
      : 'Voice note process nahi ho saki. Kindly text mein bataein.';
  }
  return transcription; // Return transcription for AI to process
}
