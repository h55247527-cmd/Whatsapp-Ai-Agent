// src/utils/database.js
// SQLite database — permanent memory using sql.js (pure JS, no compilation)

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.resolve('./data/hasdevs.db');
let db = null;

// ── Init Database ─────────────────────────────────────────
export async function initDB() {
  // Ensure data directory exists
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const SQL = await initSqlJs();

  // Load existing DB or create new
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log('💾 Database loaded from disk');
  } else {
    db = new SQL.Database();
    console.log('💾 New database created');
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS contacts (
      number TEXT PRIMARY KEY,
      name TEXT,
      category TEXT DEFAULT 'unknown',
      language TEXT DEFAULT 'hinglish',
      tone TEXT DEFAULT 'neutral',
      trust_score INTEGER DEFAULT 50,
      relationship_score INTEGER DEFAULT 0,
      message_count INTEGER DEFAULT 0,
      spam_score INTEGER DEFAULT 0,
      is_blocked INTEGER DEFAULT 0,
      first_seen TEXT,
      last_seen TEXT,
      notes TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT,
      role TEXT,
      content TEXT,
      mood TEXT,
      timestamp TEXT,
      FOREIGN KEY(number) REFERENCES contacts(number)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT,
      name TEXT,
      project_type TEXT,
      purpose TEXT,
      features TEXT,
      timeline TEXT,
      budget TEXT,
      estimated_price TEXT,
      status TEXT DEFAULT 'New Lead',
      pipeline_stage TEXT DEFAULT 'new',
      trust_score INTEGER DEFAULT 50,
      created_at TEXT,
      updated_at TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT,
      title TEXT,
      description TEXT,
      features TEXT,
      tech_stack TEXT,
      timeline TEXT,
      cost TEXT,
      status TEXT DEFAULT 'discussion',
      created_at TEXT
    );
  `);

  saveDB();
  console.log('✅ Database tables ready');
  return db;
}

// ── Save to disk ──────────────────────────────────────────
export function saveDB() {
  if (!db) return;
  try {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (err) {
    console.error('DB save error:', err.message);
  }
}

// ── Auto-save every 2 minutes ─────────────────────────────
export function startAutoSave() {
  setInterval(saveDB, 2 * 60 * 1000);
}

// ── Contact Operations ────────────────────────────────────
export function upsertContact(number, data = {}) {
  if (!db) return;
  const now = new Date().toISOString();

  const existing = getContact(number);

  if (existing) {
    db.run(`
      UPDATE contacts SET
        name = COALESCE(?, name),
        category = COALESCE(?, category),
        language = COALESCE(?, language),
        trust_score = COALESCE(?, trust_score),
        relationship_score = COALESCE(?, relationship_score),
        message_count = message_count + 1,
        spam_score = COALESCE(?, spam_score),
        is_blocked = COALESCE(?, is_blocked),
        last_seen = ?
      WHERE number = ?
    `, [
      data.name || null,
      data.category || null,
      data.language || null,
      data.trust_score !== undefined ? data.trust_score : null,
      data.relationship_score !== undefined ? data.relationship_score : null,
      data.spam_score !== undefined ? data.spam_score : null,
      data.is_blocked !== undefined ? (data.is_blocked ? 1 : 0) : null,
      now,
      number
    ]);
  } else {
    db.run(`
      INSERT INTO contacts (number, name, category, language, trust_score, relationship_score, message_count, first_seen, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `, [
      number,
      data.name || 'Unknown',
      data.category || 'unknown',
      data.language || 'hinglish',
      data.trust_score || 50,
      data.relationship_score || 0,
      now, now
    ]);
  }
}

export function getContact(number) {
  if (!db) return null;
  const result = db.exec(`SELECT * FROM contacts WHERE number = ?`, [number]);
  if (!result.length || !result[0].values.length) return null;

  const cols = result[0].columns;
  const vals = result[0].values[0];
  return Object.fromEntries(cols.map((c, i) => [c, vals[i]]));
}

export function blockContact(number) {
  if (!db) return;
  db.run(`UPDATE contacts SET is_blocked = 1, category = 'spammer' WHERE number = ?`, [number]);
  saveDB();
}

export function getAllContacts() {
  if (!db) return [];
  const result = db.exec(`SELECT * FROM contacts ORDER BY last_seen DESC`);
  if (!result.length) return [];
  const cols = result[0].columns;
  return result[0].values.map(v => Object.fromEntries(cols.map((c, i) => [c, v[i]])));
}

// ── Conversation Operations ───────────────────────────────
export function saveMessage(number, role, content, mood = 'neutral') {
  if (!db) return;
  db.run(`
    INSERT INTO conversations (number, role, content, mood, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `, [number, role, content, mood, new Date().toISOString()]);
}

export function getHistory(number, limit = 20) {
  if (!db) return [];
  const result = db.exec(`
    SELECT role, content FROM conversations
    WHERE number = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `, [number, limit]);

  if (!result.length) return [];
  const cols = result[0].columns;
  return result[0].values
    .map(v => Object.fromEntries(cols.map((c, i) => [c, v[i]])))
    .reverse(); // Oldest first for AI context
}

// ── Lead Operations ───────────────────────────────────────
export function saveLead(data) {
  if (!db) return;
  const now = new Date().toISOString();

  // Check if lead exists
  const existing = db.exec(`SELECT id FROM leads WHERE number = ?`, [data.number]);

  if (existing.length && existing[0].values.length) {
    db.run(`
      UPDATE leads SET
        project_type = COALESCE(?, project_type),
        features = COALESCE(?, features),
        timeline = COALESCE(?, timeline),
        budget = COALESCE(?, budget),
        estimated_price = COALESCE(?, estimated_price),
        status = COALESCE(?, status),
        pipeline_stage = COALESCE(?, pipeline_stage),
        updated_at = ?
      WHERE number = ?
    `, [
      data.project_type || null,
      data.features || null,
      data.timeline || null,
      data.budget || null,
      data.estimated_price || null,
      data.status || null,
      data.pipeline_stage || null,
      now,
      data.number
    ]);
  } else {
    db.run(`
      INSERT INTO leads (number, name, project_type, purpose, features, timeline, budget, estimated_price, status, pipeline_stage, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      data.number, data.name || 'Unknown',
      data.project_type || '', data.purpose || '',
      data.features || '', data.timeline || '',
      data.budget || '', data.estimated_price || '',
      data.status || 'New Lead', data.pipeline_stage || 'new',
      now, now
    ]);
  }
  saveDB();
}

export function getLeads(stage = null) {
  if (!db) return [];
  const query = stage
    ? `SELECT * FROM leads WHERE pipeline_stage = ? ORDER BY created_at DESC`
    : `SELECT * FROM leads ORDER BY created_at DESC`;
  const result = db.exec(query, stage ? [stage] : []);
  if (!result.length) return [];
  const cols = result[0].columns;
  return result[0].values.map(v => Object.fromEntries(cols.map((c, i) => [c, v[i]])));
}

export function getDB() { return db; }
