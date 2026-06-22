// src/services/visionService.js
// Image/photo analysis using Groq's vision model

import Groq from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MY_NAME = process.env.MY_NAME || 'Hashir';
const LANG = process.env.LANGUAGE || 'hinglish';

// ── Analyze image and generate reply ─────────────────────
export async function analyzeImage(imageBase64, mimeType, caption, contactType) {

  const contextPrompt = contactType === 'friend'
    ? `Tu ${MY_NAME} hai — apne dost se WhatsApp pe baat kar raha hai. Usne yeh image bheji hai${caption ? ` aur likha hai: "${caption}"` : ''}. Dost ki tarah natural react karo — chhota, casual jawab do.`
    : `Tu ${MY_NAME} hai — ek professional developer. Client ya unknown number ne yeh image bheji hai${caption ? ` aur likha hai: "${caption}"` : ''}. Professionally respond karo. Agar image project se related hai (design, screenshot, reference) to isko samajh ke helpful jawab do.`;

  const langNote = LANG === 'hinglish'
    ? 'Hinglish mein jawab do (Urdu+English mix).'
    : LANG === 'urdu' ? 'Urdu mein jawab do.' : 'English mein jawab do.';

  try {
    const response = await groq.chat.completions.create({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct', // Groq vision model
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
              },
            },
            {
              type: 'text',
              text: `${contextPrompt}\n${langNote}\nReply 2-3 lines mein rakho jab tak detail na maangi ho.`,
            },
          ],
        },
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content?.trim()
      || 'Yaar image dekh raha hoon, thodi der mein bolta hoon!';

  } catch (err) {
    console.error('Vision Error:', err.message);
    // Fallback if vision model unavailable
    return caption
      ? `Haan dekha! "${caption}" — interesting hai yaar.`
      : 'Image mili, lekin abhi properly open nahi ho rahi. Dobara bhej?';
  }
}
