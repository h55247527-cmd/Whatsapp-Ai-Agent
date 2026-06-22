// src/services/sheetsService.js
// Google Sheets via pure HTTP — NO googleapis package (lightweight!)
// Uses Google Service Account JWT auth manually

import { createSign } from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
let cachedToken = null;
let tokenExpiry = 0;

// ── Create JWT for Google Auth (no library needed) ───────
function createJWT(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url');

  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(serviceAccount.private_key, 'base64url');

  return `${header}.${payload}.${signature}`;
}

// ── Get access token ──────────────────────────────────────
async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!raw) return null;

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    console.error('Sheets: Invalid service account JSON');
    return null;
  }

  const jwt = createJWT(serviceAccount);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const data = await res.json();
  if (!data.access_token) {
    console.error('Sheets: Token error', data.error);
    return null;
  }

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

// ── Append row to sheet ───────────────────────────────────
async function appendRow(values) {
  const token = await getAccessToken();
  if (!token || !SHEET_ID) return false;

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Leads!A:J:append?valueInputOption=USER_ENTERED`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: [values] }),
  });

  return res.ok;
}

// ── Check & set headers ───────────────────────────────────
export async function initSheet() {
  if (!SHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT) {
    console.log('📋 Google Sheets not configured — skipping');
    return;
  }

  const token = await getAccessToken();
  if (!token) return;

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Leads!A1:J1`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = await res.json();

  if (!data.values || data.values.length === 0) {
    await appendRow([
      'Date/Time', 'Number', 'Name', 'Project Type',
      'Purpose', 'Features', 'Timeline', 'Budget',
      'Estimated Price', 'Status'
    ]);
    console.log('📊 Google Sheet headers set!');
  } else {
    console.log('📊 Google Sheets connected!');
  }
}

// ── Save lead ─────────────────────────────────────────────
export async function saveLead(data) {
  if (!SHEET_ID) return false;

  const row = [
    new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' }),
    data.number || '',
    data.name || 'Unknown',
    data.projectType || '',
    data.purpose || '',
    Array.isArray(data.features) ? data.features.join(', ') : (data.features || ''),
    data.timeline || '',
    data.budget || '',
    data.estimatedPrice || '',
    data.status || 'New Lead',
  ];

  const ok = await appendRow(row);
  if (ok) console.log(`📊 Lead saved: ${data.name || data.number}`);
  return ok;
}
