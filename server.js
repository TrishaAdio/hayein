'use strict';

/**
 * Telegram Bot Description Changer — zero-dependency backend.
 *
 * Accounts are keyed by a username. Each username owns a set of bots
 * (their tokens are stored server-side in data/store.json). Entering a
 * username lists the bots saved under it. Language code is locked to "en".
 *
 * Run: node server.js   (listens on PORT, default 4000)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 4000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const LANG_CODE = 'en'; // locked to English as requested
const TG_API = 'https://api.telegram.org';
const MAX_NAME = 64;  // setMyName limit
const MAX_BIO = 120;  // setMyShortDescription limit
const MAX_DESC = 512; // setMyDescription limit

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/* ------------------------------- storage -------------------------------- */
// Shape: { "<username>": { bots: { "<botId>": { token, name, username } } } }

function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveStore(store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

function normUser(u) {
  return String(u || '').trim().replace(/^@/, '').toLowerCase();
}

// Public view of a user's bots (never leaks tokens to the client).
function botList(store, username) {
  const acct = store[username];
  if (!acct) return [];
  return Object.values(acct.bots).map((b) => ({
    id: b.id,
    name: b.name,
    username: b.username,
  }));
}

function getToken(store, username, botId) {
  const acct = store[username];
  if (!acct) return null;
  const bot = acct.bots[String(botId)];
  return bot ? bot.token : null;
}

/* ----------------------------- Telegram call ---------------------------- */

async function tg(token, method, params) {
  if (!token || !/^\d+:[\w-]+$/.test(String(token).trim())) {
    return { ok: false, status: 400, description: 'That does not look like a valid bot token.' };
  }
  const url = `${TG_API}/bot${token.trim()}/${method}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) {
      return { ok: false, status: res.status, description: data.description || `Telegram error (${res.status}).` };
    }
    return { ok: true, result: data.result };
  } catch {
    return { ok: false, status: 502, description: 'Could not reach Telegram. Check the server network.' };
  }
}

// Fetch the editable profile fields (name, bio/short description, description).
async function fetchProfile(token) {
  const [name, bio, desc] = await Promise.all([
    tg(token, 'getMyName', { language_code: LANG_CODE }),
    tg(token, 'getMyShortDescription', { language_code: LANG_CODE }),
    tg(token, 'getMyDescription', { language_code: LANG_CODE }),
  ]);
  return {
    name: name.ok ? name.result.name || '' : '',
    bio: bio.ok ? bio.result.short_description || '' : '',
    description: desc.ok ? desc.result.description || '' : '',
  };
}

/* --------------------------------- http --------------------------------- */

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve(null);
      }
    });
  });
}

/* ------------------------------ API handlers ---------------------------- */

// Enter a username -> list bots saved under it (creates the account lazily).
function handleLogin(body, res) {
  const username = normUser(body.username);
  if (username.length < 3) {
    return sendJSON(res, 200, { ok: false, error: 'Username must be at least 3 characters.' });
  }
  const store = loadStore();
  if (!store[username]) {
    store[username] = { bots: {} };
    saveStore(store);
  }
  return sendJSON(res, 200, { ok: true, username, bots: botList(store, username) });
}

// Add a bot to a username by token -> validates, stores, returns editor data.
async function handleAddBot(body, res) {
  const username = normUser(body.username);
  const token = String(body.token || '').trim();
  if (!username) return sendJSON(res, 200, { ok: false, error: 'Enter your username first.' });

  const me = await tg(token, 'getMe');
  if (!me.ok) return sendJSON(res, 200, { ok: false, error: me.description });

  const store = loadStore();
  if (!store[username]) store[username] = { bots: {} };
  store[username].bots[String(me.result.id)] = {
    id: me.result.id,
    name: me.result.first_name,
    username: me.result.username,
    token,
  };
  saveStore(store);

  const profile = await fetchProfile(token);
  return sendJSON(res, 200, {
    ok: true,
    bots: botList(store, username),
    bot: { id: me.result.id, name: me.result.first_name, username: me.result.username },
    profile,
    lang: LANG_CODE,
  });
}

// Open a saved bot -> refreshes identity + current description.
async function handleSelect(body, res) {
  const username = normUser(body.username);
  const token = getToken(loadStore(), username, body.botId);
  if (!token) return sendJSON(res, 200, { ok: false, error: 'Bot not found for this username.' });

  const me = await tg(token, 'getMe');
  if (!me.ok) return sendJSON(res, 200, { ok: false, error: me.description });
  const profile = await fetchProfile(token);
  return sendJSON(res, 200, {
    ok: true,
    bot: { id: me.result.id, name: me.result.first_name, username: me.result.username },
    profile,
    lang: LANG_CODE,
  });
}

// Save name / bio / description. Only fields that actually changed are sent to
// Telegram (setMyName is rate-limited, so we avoid redundant calls).
async function handleSave(body, res) {
  const username = normUser(body.username);
  const token = getToken(loadStore(), username, body.botId);
  if (!token) return sendJSON(res, 200, { ok: false, error: 'Bot not found for this username.' });

  const name = typeof body.name === 'string' ? body.name : '';
  const bio = typeof body.bio === 'string' ? body.bio : '';
  const description = typeof body.description === 'string' ? body.description : '';

  if (name.length > MAX_NAME) return sendJSON(res, 200, { ok: false, error: `Name must be ${MAX_NAME} characters or fewer.` });
  if (bio.length > MAX_BIO) return sendJSON(res, 200, { ok: false, error: `Bio must be ${MAX_BIO} characters or fewer.` });
  if (description.length > MAX_DESC) return sendJSON(res, 200, { ok: false, error: `Description must be ${MAX_DESC} characters or fewer.` });
  if (!name.trim()) return sendJSON(res, 200, { ok: false, error: 'Name cannot be empty.' });

  const current = await fetchProfile(token);
  const errors = [];

  if (name !== current.name) {
    const r = await tg(token, 'setMyName', { name, language_code: LANG_CODE });
    if (!r.ok) errors.push(`Name: ${r.description}`);
  }
  if (bio !== current.bio) {
    const r = await tg(token, 'setMyShortDescription', { short_description: bio, language_code: LANG_CODE });
    if (!r.ok) errors.push(`Bio: ${r.description}`);
  }
  if (description !== current.description) {
    const r = await tg(token, 'setMyDescription', { description, language_code: LANG_CODE });
    if (!r.ok) errors.push(`Description: ${r.description}`);
  }

  if (errors.length) return sendJSON(res, 200, { ok: false, error: errors.join(' · ') });
  return sendJSON(res, 200, { ok: true, profile: { name, bio, description } });
}

async function handleRemove(body, res) {
  const username = normUser(body.username);
  const token = getToken(loadStore(), username, body.botId);
  if (!token) return sendJSON(res, 200, { ok: false, error: 'Bot not found for this username.' });

  const r = await tg(token, 'setMyDescription', { description: '', language_code: LANG_CODE });
  if (!r.ok) return sendJSON(res, 200, { ok: false, error: r.description });
  return sendJSON(res, 200, { ok: true, description: '' });
}

// Forget a saved bot (does not touch the bot on Telegram).
function handleDeleteBot(body, res) {
  const username = normUser(body.username);
  const store = loadStore();
  if (store[username] && store[username].bots[String(body.botId)]) {
    delete store[username].bots[String(body.botId)];
    saveStore(store);
  }
  return sendJSON(res, 200, { ok: true, bots: botList(store, username) });
}

/* ------------------------------ static files ---------------------------- */

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

/* -------------------------------- router -------------------------------- */

const routes = {
  '/api/login': handleLogin,
  '/api/add-bot': handleAddBot,
  '/api/select': handleSelect,
  '/api/save': handleSave,
  '/api/remove': handleRemove,
  '/api/delete-bot': handleDeleteBot,
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/api/')) {
    const body = await readBody(req);
    if (body === null) return sendJSON(res, 400, { ok: false, error: 'Invalid JSON.' });
    const handler = routes[req.url];
    if (!handler) return sendJSON(res, 404, { ok: false, error: 'Unknown endpoint.' });
    return handler(body, res);
  }
  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405);
  res.end('Method Not Allowed');
});

server.listen(PORT, () => {
  console.log(`Telegram Description Changer running on http://localhost:${PORT}`);
});
