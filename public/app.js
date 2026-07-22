'use strict';

const $ = (id) => document.getElementById(id);

const els = {
  loginCard: $('login-card'),
  botsCard: $('bots-card'),
  editorCard: $('editor-card'),

  username: $('username'),
  loginBtn: $('login-btn'),

  userAvatar: $('user-avatar'),
  userLabel: $('user-label'),
  switchUserBtn: $('switch-user-btn'),
  botList: $('bot-list'),
  emptyBots: $('empty-bots'),
  token: $('token'),
  toggleToken: $('toggle-token'),
  addBotBtn: $('add-bot-btn'),

  botAvatar: $('bot-avatar'),
  botName: $('bot-name'),
  botUsername: $('bot-username'),
  backBtn: $('back-btn'),
  name: $('name'),
  nameCounter: $('name-counter'),
  bio: $('bio'),
  bioCounter: $('bio-counter'),
  description: $('description'),
  counter: $('counter'),
  saveBtn: $('save-btn'),
  removeBtn: $('remove-btn'),

  toast: $('toast'),
};

const LIMITS = { name: 64, bio: 120, description: 512 };
let username = '';
let currentBotId = null;

/* --------------------------------- utils --------------------------------- */

let toastTimer;
function toast(msg, kind = '') {
  els.toast.textContent = msg;
  els.toast.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (els.toast.className = 'toast'), 3200);
}

function busy(btn, on) {
  const label = btn.querySelector('.btn-label');
  const spin = btn.querySelector('.spinner');
  btn.disabled = on;
  if (label) label.style.opacity = on ? '0.5' : '1';
  if (spin) spin.hidden = !on;
}

function shake(card) {
  card.classList.remove('shake');
  void card.offsetWidth; // reflow to restart animation
  card.classList.add('shake');
}

function flashOk(card) {
  card.classList.remove('flash-ok');
  void card.offsetWidth;
  card.classList.add('flash-ok');
}

// Animated view switch: cleanly fade the current card out, THEN reveal the
// next one — no overlap, so there is no layout jump between steps.
function show(card) {
  const current = [els.loginCard, els.botsCard, els.editorCard].find(
    (c) => c !== card && !c.hidden
  );

  const reveal = () => {
    card.hidden = false;
    card.classList.remove('leave', 'enter');
    void card.offsetWidth; // reflow so the entrance animation restarts
    card.classList.add('enter');
    setTimeout(() => card.classList.remove('enter'), 620);
  };

  if (current) {
    current.classList.add('leave');
    setTimeout(() => {
      current.hidden = true;
      current.classList.remove('leave', 'enter');
      reveal();
    }, 200);
  } else {
    reveal();
  }
}

async function api(path, payload) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

function count(input, counterEl, max, warnAt) {
  const n = input.value.length;
  counterEl.textContent = `${n} / ${max}`;
  counterEl.classList.toggle('warn', n > max - warnAt);
}

function updateCounter() {
  count(els.name, els.nameCounter, LIMITS.name, 8);
  count(els.bio, els.bioCounter, LIMITS.bio, 15);
  count(els.description, els.counter, LIMITS.description, 40);
}

const svgChevron =
  '<svg class="open-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/* -------------------------------- render --------------------------------- */

function renderBots(bots) {
  els.botList.innerHTML = '';
  els.emptyBots.hidden = bots.length > 0;

  bots.forEach((bot, i) => {
    const li = document.createElement('li');
    li.className = 'bot-item';
    li.style.animationDelay = `${i * 0.05}s`;
    li.innerHTML = `
      <div class="avatar">${(bot.name || 'B').charAt(0).toUpperCase()}</div>
      <div class="bot-meta">
        <span class="bot-name"></span>
        <span class="bot-username"></span>
      </div>
      ${svgChevron}
      <button class="bot-del" title="Forget this bot">&times;</button>`;
    li.querySelector('.bot-name').textContent = bot.name;
    li.querySelector('.bot-username').textContent = '@' + bot.username;

    li.addEventListener('click', (e) => {
      if (e.target.closest('.bot-del')) return;
      selectBot(bot);
    });
    li.querySelector('.bot-del').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteBot(bot, li);
    });
    els.botList.appendChild(li);
  });
}

/* -------------------------------- actions -------------------------------- */

async function login() {
  const value = els.username.value.trim();
  if (!value) return toast('Enter your username.', 'err');

  busy(els.loginBtn, true);
  const data = await api('/api/login', { username: value });
  busy(els.loginBtn, false);

  if (!data.ok) {
    shake(els.loginCard);
    return toast(data.error || 'Could not continue.', 'err');
  }
  username = data.username;
  els.userLabel.textContent = '@' + username;
  els.userAvatar.textContent = username.charAt(0).toUpperCase();
  renderBots(data.bots);
  show(els.botsCard);
}

function switchUser() {
  username = '';
  currentBotId = null;
  els.username.value = '';
  els.token.value = '';
  show(els.loginCard);
  setTimeout(() => els.username.focus(), 320);
}

async function addBot() {
  const token = els.token.value.trim();
  if (!token) return toast('Paste a bot token to add.', 'err');

  busy(els.addBotBtn, true);
  const data = await api('/api/add-bot', { username, token });
  busy(els.addBotBtn, false);

  if (!data.ok) {
    shake(els.botsCard);
    return toast(data.error || 'Could not add bot.', 'err');
  }
  els.token.value = '';
  renderBots(data.bots);
  openEditor(data.bot, data.profile);
  toast('Added @' + data.bot.username, 'ok');
}

async function selectBot(bot) {
  const data = await api('/api/select', { username, botId: bot.id });
  if (!data.ok) {
    shake(els.botsCard);
    return toast(data.error || 'Could not open bot.', 'err');
  }
  openEditor(data.bot, data.profile);
}

function openEditor(bot, profile) {
  currentBotId = bot.id;
  els.botName.textContent = bot.name;
  els.botUsername.textContent = '@' + bot.username;
  els.botAvatar.textContent = (bot.name || 'B').charAt(0).toUpperCase();
  const p = profile || {};
  els.name.value = p.name || '';
  els.bio.value = p.bio || '';
  els.description.value = p.description || '';
  updateCounter();
  show(els.editorCard);
}

function backToBots() {
  currentBotId = null;
  show(els.botsCard);
}

async function deleteBot(bot, li) {
  if (!confirm(`Forget @${bot.username}? This only removes it from your saved list.`)) return;
  li.classList.add('removing');
  const data = await api('/api/delete-bot', { username, botId: bot.id });
  setTimeout(() => renderBots(data.bots || []), 240);
  toast('Removed from your list.', 'ok');
}

async function save() {
  if (!els.name.value.trim()) {
    shake(els.editorCard);
    return toast('Name cannot be empty.', 'err');
  }
  busy(els.saveBtn, true);
  const data = await api('/api/save', {
    username,
    botId: currentBotId,
    name: els.name.value,
    bio: els.bio.value,
    description: els.description.value,
  });
  busy(els.saveBtn, false);
  if (!data.ok) {
    shake(els.editorCard);
    return toast(data.error || 'Failed to save.', 'err');
  }
  flashOk(els.editorCard);
  toast('Changes saved.', 'ok');
}

async function remove() {
  if (!confirm('Remove the bot description? This clears the default description shown to everyone.')) return;
  busy(els.removeBtn, true);
  const data = await api('/api/remove', { username, botId: currentBotId });
  busy(els.removeBtn, false);
  if (!data.ok) {
    shake(els.editorCard);
    return toast(data.error || 'Failed to remove.', 'err');
  }
  els.description.value = '';
  updateCounter();
  flashOk(els.editorCard);
  toast('Description removed.', 'ok');
}

/* --------------------------------- wiring -------------------------------- */

els.toggleToken.addEventListener('click', () => {
  const isPw = els.token.type === 'password';
  els.token.type = isPw ? 'text' : 'password';
  els.toggleToken.textContent = isPw ? '🙈' : '👁';
});

els.loginBtn.addEventListener('click', login);
els.switchUserBtn.addEventListener('click', switchUser);
els.addBotBtn.addEventListener('click', addBot);
els.backBtn.addEventListener('click', backToBots);
els.saveBtn.addEventListener('click', save);
els.removeBtn.addEventListener('click', remove);
els.name.addEventListener('input', updateCounter);
els.bio.addEventListener('input', updateCounter);
els.description.addEventListener('input', updateCounter);

els.username.addEventListener('keydown', (e) => e.key === 'Enter' && login());
els.token.addEventListener('keydown', (e) => e.key === 'Enter' && addBot());

updateCounter();

// One-time entrance for the first visible card (login). Removing .enter
// afterwards leaves no base animation, so nothing replays.
els.loginCard.classList.add('enter');
setTimeout(() => els.loginCard.classList.remove('enter'), 640);
