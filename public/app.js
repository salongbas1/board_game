const SUIT_COLOR = { '♣':'black', '♠':'black', '♦':'red', '♥':'red' };
let numPlayersClient = 8; // อัปเดตจาก state ของเซิร์ฟเวอร์ (4 หรือ 8)

// คำนวณตำแหน่งที่นั่งรอบโต๊ะแบบวงรี โดยที่นั่ง 0 (ตัวเรา) อยู่ล่างสุดเสมอ ปรับตามจำนวนผู้เล่น
function seatPosFor(seat, total) {
  const theta = (90 + seat * (360 / total)) * Math.PI / 180;
  const rx = 46, ry = 43;
  return { top: (50 + ry * Math.sin(theta)) + '%', left: (50 + rx * Math.cos(theta)) + '%' };
}
function trickPosFor(seat, total) {
  const theta = (90 + seat * (360 / total)) * Math.PI / 180;
  const rx = 27, ry = 20;
  return { top: (50 + ry * Math.sin(theta)) + '%', left: (50 + rx * Math.cos(theta)) + '%' };
}
const seatPositions = new Proxy({}, { get: (_, seat) => seatPosFor(Number(seat), numPlayersClient) });
const trickPositions = new Proxy({}, { get: (_, seat) => trickPosFor(Number(seat), numPlayersClient) });

let ws = null;
let mySeat = null;
let selectedPassCards = [];
let lastState = null;

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  const statusEl = document.getElementById('connStatus');
  ws.onopen = () => { statusEl.textContent = 'เชื่อมต่อสำเร็จ'; statusEl.className = 'ok'; };
  ws.onclose = () => { statusEl.textContent = 'การเชื่อมต่อขาดหาย — กรุณารีเฟรชหน้า'; statusEl.className = 'bad'; };
  ws.onerror = () => { statusEl.textContent = 'เชื่อมต่อไม่ได้'; statusEl.className = 'bad'; };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'lobby') renderLobby(msg);
    else if (msg.type === 'state') renderGameState(msg);
    else if (msg.type === 'seatPicker') renderSeatPicker(msg);
    else if (msg.type === 'leftLobby') showJoinScreen();
    else if (msg.type === 'log') appendLog(msg.msg);
    else if (msg.type === 'error') showJoinError(msg.msg);
    else if (msg.type === 'chat') appendChat(msg.name, msg.text);
    else if (msg.type === 'alarm') setBlackout(msg.active);
    else if (msg.type === 'emojiThrow') throwEmojiAnimation(msg.fromSeat, msg.targetSeat, msg.emoji);
    else if (msg.type === 'dndState') renderDndState(msg);
    else if (msg.type === 'dndSeatList') renderDndSeatList(msg.seats);
    else if (msg.type === 'dndLeft') showMainMenu();
    else if (msg.type === 'dndKicked') { alert('DM ได้ลบคุณออกจากห้องนี้แล้ว'); showMainMenu(); }
    else if (msg.type === 'dndChat') appendDndChat(msg.name, msg.text);
    else if (msg.type === 'dndError') { showDndCreateError(msg.msg); showDndErrorToast(msg.msg); }
    else if (msg.type === 'dndAttackAnim') { playDndAttackAnim(msg); playDndMapAttackAnim(msg); }
    else if (msg.type === 'dndExportState') downloadDndSave(msg.data);
  };
}
connect();

function send(obj) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }

// เพิ่มแสงวาบตอนกดปุ่ม ให้เห็นชัดว่ากดปุ่มไหนไปแล้ว (ก่อนที่เซิร์ฟเวอร์จะตอบกลับมา)
function flashBtn(el) {
  if (!el) return;
  el.classList.remove('clickFlash');
  void el.offsetWidth; // รีสตาร์ท animation ได้แม้กดรัว ๆ
  el.classList.add('clickFlash');
  setTimeout(() => el.classList.remove('clickFlash'), 400);
}

function setBlackout(active) {
  document.getElementById('blackout').style.display = active ? 'flex' : 'none';
}

function showJoinError(msg) {
  document.getElementById('joinError').textContent = msg;
}

function showJoinScreen() {
  mySeat = null;
  document.getElementById('mainMenuScreen').style.display = 'none';
  document.getElementById('joinScreen').style.display = 'block';
  document.getElementById('dndJoinScreen').style.display = 'none';
  document.getElementById('dndScreen').style.display = 'none';
  document.getElementById('lobbyScreen').style.display = 'none';
  document.getElementById('seatPickerScreen').style.display = 'none';
  document.getElementById('gameScreen').style.display = 'none';
  document.getElementById('chatPanel').style.display = 'none';
  document.getElementById('alarmBtn').style.display = 'none';
  document.getElementById('newGameBtn').style.display = 'none';
  closeDndModals();
}

function showMainMenu() {
  mySeat = null;
  document.getElementById('mainMenuScreen').style.display = 'block';
  document.getElementById('joinScreen').style.display = 'none';
  document.getElementById('dndJoinScreen').style.display = 'none';
  document.getElementById('dndScreen').style.display = 'none';
  document.getElementById('lobbyScreen').style.display = 'none';
  document.getElementById('seatPickerScreen').style.display = 'none';
  document.getElementById('gameScreen').style.display = 'none';
  document.getElementById('chatPanel').style.display = 'none';
  document.getElementById('alarmBtn').style.display = 'none';
  document.getElementById('newGameBtn').style.display = 'none';
  closeDndModals();
}

document.getElementById('gameCardHearts').onclick = () => {
  document.getElementById('mainMenuScreen').style.display = 'none';
  document.getElementById('joinScreen').style.display = 'block';
};
document.getElementById('gameCardDnd').onclick = () => {
  document.getElementById('mainMenuScreen').style.display = 'none';
  document.getElementById('dndJoinScreen').style.display = 'block';
  send({ type: 'dndListSeats' });
};
document.getElementById('backToMenuBtn').onclick = (ev) => { flashBtn(ev.currentTarget); showMainMenu(); };
document.getElementById('dndBackToMenuBtn').onclick = (ev) => { flashBtn(ev.currentTarget); showMainMenu(); };

document.getElementById('newGameBtn').onclick = () => {
  const inHeartsGame = document.getElementById('gameScreen').style.display === 'block';
  const confirmMsg = inHeartsGame
    ? 'เริ่มเกมใหม่? คุณจะออกจากโต๊ะปัจจุบัน (บอทจะเล่นแทนที่ของคุณ) แล้วกลับไปหน้าเลือกเกม'
    : 'เริ่มเกมใหม่? คุณจะออกจากห้องปัจจุบัน แล้วกลับไปหน้าเลือกเกม';
  if (!confirm(confirmMsg)) return;
  if (ws) { ws.onclose = null; ws.onerror = null; ws.close(); }
  ws = null; mySeat = null; selectedPassCards = []; lastState = null; myName = '';
  showMainMenu();
  connect();
};

let myName = '';
function placeChat(inGame) {
  const chatPanel = document.getElementById('chatPanel');
  const slot = document.getElementById(inGame ? 'chatSlotGame' : 'chatSlotLobby');
  chatPanel.classList.toggle('chatInLobby', !inGame);
  if (chatPanel.parentElement !== slot) slot.appendChild(chatPanel);
}
document.getElementById('joinBtn').onclick = (ev) => {
  const name = document.getElementById('nameInput').value.trim();
  if (!name) { showJoinError('กรุณาใส่ชื่อ'); return; }
  flashBtn(ev.currentTarget);
  myName = name;
  send({ type: 'join', name });
  document.getElementById('joinScreen').style.display = 'none';
  placeChat(false);
  document.getElementById('chatPanel').style.display = 'block';
  document.getElementById('alarmBtn').style.display = 'block';
  document.getElementById('newGameBtn').style.display = 'block';
  // จะไปโชว์ห้องรอ (lobby) หรือหน้าเลือกที่นั่ง (seatPicker) ขึ้นกับข้อความตอบกลับจากเซิร์ฟเวอร์
};

document.getElementById('leaveLobbyBtn').onclick = (ev) => { flashBtn(ev.currentTarget); send({ type: 'leaveLobby' }); };
document.getElementById('leaveSeatBtn').onclick = (ev) => {
  flashBtn(ev.currentTarget);
  if (confirm('ออกจากโต๊ะ? ที่นั่งของคุณจะให้บอทเล่นแทน คุณจะสามารถนั่งกลับเข้าไปใหม่ได้')) {
    send({ type: 'leaveSeat' });
  }
};

document.getElementById('alarmBtn').onclick = () => send({ type: 'alarmToggle' });
document.getElementById('blackout').onclick = () => send({ type: 'alarmToggle' });

function appendChat(name, text) {
  const el = document.getElementById('chatBox');
  const d = document.createElement('div');
  const isMe = name === myName;
  d.innerHTML = `<span class="chatName${isMe ? ' me' : ''}">${escapeHtml(name)}:</span> ${escapeHtml(text)}`;
  el.appendChild(d);
  el.scrollTop = el.scrollHeight;
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
// ---- กดค้างเพื่อทำซ้ำอัตโนมัติ (ใช้กับปุ่ม +/− เช่น ตอนแจกแต้มสเตตัส จะได้ไม่ต้องกดทีละครั้ง) ----
let dndHoldRepeatState = { timeout: null, interval: null };
function dndClearHoldRepeat() {
  clearTimeout(dndHoldRepeatState.timeout);
  clearInterval(dndHoldRepeatState.interval);
  dndHoldRepeatState.timeout = null;
  dndHoldRepeatState.interval = null;
}
document.addEventListener('pointerup', dndClearHoldRepeat);
document.addEventListener('pointercancel', dndClearHoldRepeat);
document.addEventListener('pointerleave', dndClearHoldRepeat);
function dndBindHoldRepeat(btn, fn) {
  if (!btn) return;
  btn.onclick = null; // กันไม่ให้ยิงซ้ำจาก click เดิม เพราะ pointerdown จะยิง fn() ให้ตั้งแต่กดครั้งแรกอยู่แล้ว
  btn.addEventListener('pointerdown', (e) => {
    if (btn.disabled) return;
    e.preventDefault();
    dndClearHoldRepeat();
    fn();
    dndHoldRepeatState.timeout = setTimeout(() => {
      dndHoldRepeatState.interval = setInterval(fn, 90);
    }, 350);
  });
}
// ---- ชิปแสดงสถานะ/ดีบัฟ พร้อมป้ายคูลดาวน์ที่นับถอยหลังสด ๆ (ถ้ามี) — ใช้ร่วมกันทุกจุดที่โชว์สถานะ ----
function dndStatusModSummary(s) {
  const bits = [];
  if (s.atkMod) bits.push(`🎯${s.atkMod > 0 ? '+' : ''}${s.atkMod}`);
  if (s.dmgMod) bits.push(`💥${s.dmgMod > 0 ? '+' : ''}${s.dmgMod}`);
  if (s.defMod) bits.push(`🛡️${s.defMod > 0 ? '+' : ''}${s.defMod}`);
  if (s.tickValue) bits.push(`${s.tickValue > 0 ? '💚+' : '☠️'}${s.tickValue}/${s.tickIntervalSec || 6}วิ`);
  return bits.join(' ');
}
function dndStatusChipHtml(s, innerHtml) {
  const remainSec = s.expiresAt ? Math.max(0, Math.ceil((s.expiresAt - Date.now()) / 1000)) : 0;
  const cdHtml = s.expiresAt ? `<span class="dndStatusCd" data-expires-at="${s.expiresAt}">⏳${remainSec}วิ</span>` : '';
  const modSummary = dndStatusModSummary(s);
  const modHtml = modSummary ? `<span class="dndStatusModTag">${modSummary}</span>` : '';
  return `<span class="dndStatusChip" title="${escapeHtml(s.note || '')}">☠️ ${escapeHtml(s.name)}${modHtml}${cdHtml}${innerHtml || ''}</span>`;
}
// นับถอยหลังคูลดาวน์ของสถานะทุกชิปที่กำลังแสดงอยู่บนหน้าจอ ทุก 1 วินาที (ไม่ต้องรอ state อัปเดตจากเซิร์ฟเวอร์)
function dndTickStatusCooldowns() {
  const now = Date.now();
  document.querySelectorAll('.dndStatusCd[data-expires-at]').forEach(el => {
    const expiresAt = Number(el.dataset.expiresAt || 0);
    if (!expiresAt) return;
    const remain = Math.max(0, Math.ceil((expiresAt - now) / 1000));
    el.textContent = remain > 0 ? `⏳${remain}วิ` : '⏳หมดแล้ว';
  });
}
setInterval(dndTickStatusCooldowns, 1000);
function sendChat() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  send({ type: 'chat', text });
  input.value = '';
}
document.getElementById('chatSendBtn').onclick = sendChat;
document.getElementById('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
document.getElementById('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('joinBtn').click(); });

document.getElementById('startBtn').onclick = (ev) => { flashBtn(ev.currentTarget); send({ type: 'startGame' }); };

document.getElementById('modeOptions').querySelectorAll('.optBtn').forEach(btn => {
  btn.onclick = () => { flashBtn(btn); send({ type: 'setMode', mode: Number(btn.dataset.mode) }); };
});
document.getElementById('botLevelOptions').querySelectorAll('.optBtn').forEach(btn => {
  btn.onclick = () => { flashBtn(btn); send({ type: 'setBotLevel', level: btn.dataset.level }); };
});

const BOT_LEVEL_LABEL = { easy: 'ง่าย', normal: 'ปานกลาง', hard: 'ยาก' };

function renderSeatPicker(msg) {
  document.getElementById('mainMenuScreen').style.display = 'none';
  document.getElementById('joinScreen').style.display = 'none';
  document.getElementById('dndJoinScreen').style.display = 'none';
  document.getElementById('dndScreen').style.display = 'none';
  document.getElementById('lobbyScreen').style.display = 'none';
  document.getElementById('gameScreen').style.display = 'none';
  document.getElementById('seatPickerScreen').style.display = 'block';
  placeChat(false);
  const list = document.getElementById('seatPickerList');
  list.innerHTML = msg.seats.map(s => {
    const label = `ที่นั่ง ${s.seat + 1}: ${escapeHtml(s.name)}${s.isBot ? ' 🤖' : ''}`;
    const action = s.isBot
      ? `<button class="seatTakeBtn" data-seat="${s.seat}">นั่งแทนบอท</button>`
      : `<span class="seatTaken">มีคนเล่นอยู่</span>`;
    return `<div class="seatRow"><span>${label}</span>${action}</div>`;
  }).join('');
  list.querySelectorAll('.seatTakeBtn').forEach(btn => {
    btn.onclick = (ev) => { flashBtn(ev.currentTarget); send({ type: 'takeSeat', seat: Number(btn.dataset.seat) }); };
  });
}


function renderLobby(msg) {
  mySeat = msg.yourSeat;
  numPlayersClient = msg.maxSeats || msg.gameMode || 8;
  document.getElementById('mainMenuScreen').style.display = 'none';
  document.getElementById('joinScreen').style.display = 'none';
  document.getElementById('dndJoinScreen').style.display = 'none';
  document.getElementById('dndScreen').style.display = 'none';
  document.getElementById('seatPickerScreen').style.display = 'none';
  document.getElementById('lobbyScreen').style.display = 'block';
  document.getElementById('gameScreen').style.display = 'none';
  placeChat(false);

  const isHost = mySeat === 0;
  document.getElementById('hostSettings').style.display = isHost ? 'block' : 'none';
  const guestSettings = document.getElementById('guestSettings');
  guestSettings.style.display = isHost ? 'none' : 'block';
  guestSettings.textContent = `โหมด: ${msg.gameMode} คน · ${msg.gameMode === 4 ? '1 สำรับ' : '2 สำรับ'} · ระดับบอท: ${BOT_LEVEL_LABEL[msg.botLevel] || msg.botLevel}`;

  document.getElementById('modeOptions').querySelectorAll('.optBtn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.mode) === msg.gameMode);
  });
  document.getElementById('botLevelOptions').querySelectorAll('.optBtn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.level === msg.botLevel);
  });

  const list = document.getElementById('lobbyList');
  list.innerHTML = msg.seats.map(s =>
    `<div>${s.seat === mySeat ? '👉 ' : ''}${s.name}${s.seat === 0 ? ' (โฮสต์)' : ''}</div>`
  ).join('') || '<div style="color:#888;">ยังไม่มีใครเข้าห้อง</div>';
  const hint = document.getElementById('lobbyHint');
  const startBtn = document.getElementById('startBtn');
  hint.textContent = `ผู้เล่นเข้าร่วมแล้ว ${msg.seats.length}/${msg.maxSeats} คน (ที่นั่งที่เหลือจะให้บอทเล่นแทน)`;
  if (isHost) {
    startBtn.style.display = 'inline-block';
    startBtn.disabled = msg.seats.length < 2;
    startBtn.textContent = msg.seats.length < 2 ? 'ต้องมีอย่างน้อย 2 คน' : 'เริ่มเกม';
  } else {
    startBtn.style.display = 'none';
    hint.textContent += ' — รอโฮสต์กดเริ่มเกม';
  }
}

function appendLog(text) {
  const el = document.getElementById('log');
  const d = document.createElement('div');
  d.textContent = text;
  el.appendChild(d);
  el.scrollTop = el.scrollHeight;
}

function renderGameState(state) {
  lastState = state;
  mySeat = state.yourSeat;
  numPlayersClient = state.numPlayers || state.players.length || 8;
  document.getElementById('mainMenuScreen').style.display = 'none';
  document.getElementById('joinScreen').style.display = 'none';
  document.getElementById('dndJoinScreen').style.display = 'none';
  document.getElementById('dndScreen').style.display = 'none';
  document.getElementById('lobbyScreen').style.display = 'none';
  document.getElementById('seatPickerScreen').style.display = 'none';
  document.getElementById('gameScreen').style.display = 'block';
  placeChat(true);

  renderSeats(state);
  renderTrick(state);
  renderScoreboard(state);
  renderHand(state);
  renderStatus(state);
  renderOverlay(state);

  const np = state.numPlayers || state.players.length;
  const dc = state.deckCount || (np > 4 ? 2 : 1);
  document.getElementById('pageTitle').textContent = `♥ Hearts — ${np} ผู้เล่น / ไพ่ ${dc} สำรับ (${dc * 52} ใบ) ♥`;
  document.getElementById('rulesDynamic').textContent =
    `โหมดนี้: ${np} ผู้เล่น · ไพ่ ${dc} สำรับ (${dc * 52} ใบ) แจกคนละ 13 ใบ · ระดับบอท: ${BOT_LEVEL_LABEL[state.botLevel] || state.botLevel} · เกมจบเมื่อมีคนคะแนนรวมถึง ${state.scoreLimit} (น้อยสุดชนะ)`;
}

function renderSeats(state) {
  const wrap = document.getElementById('tableWrap');
  wrap.querySelectorAll('.seat').forEach(e => e.remove());
  state.players.forEach((p, i) => {
    const pos = seatPositions[i];
    const div = document.createElement('div');
    div.className = 'seat'
      + (p.seat === mySeat ? ' you' : '')
      + (p.isBot ? ' bot' : '')
      + (state.activeSeat === p.seat ? ' active' : '');
    div.style.top = pos.top; div.style.left = pos.left;
    div.dataset.seat = p.seat;
    const throwBtnHtml = (p.seat !== mySeat) ? `<div class="throwBtn" title="ปาอิโมจิใส่ ${escapeHtml(p.name)}">😆</div>` : '';
    div.innerHTML = `${throwBtnHtml}<div class="sname">${p.name}${p.isBot ? ' 🤖' : ''}</div><div class="sscore">${p.score} แต้ม</div><div class="scount">มือนี้ ${p.points >= 0 ? '+' : ''}${p.points} · ไพ่ ${p.handCount}</div>`;
    if (p.seat !== mySeat) {
      div.querySelector('.throwBtn').onclick = (ev) => {
        ev.stopPropagation();
        openEmojiPalette(p.seat, pos);
      };
    }
    wrap.appendChild(div);
  });
}

const THROW_EMOJIS = ['😂','🤣','💩','🍅','🥚','👎','🔥','😜'];
function openEmojiPalette(targetSeat, pos) {
  const palette = document.getElementById('emojiPalette');
  palette.style.display = 'grid';
  palette.style.top = pos.top;
  palette.style.left = pos.left;
  palette.innerHTML = THROW_EMOJIS.map(e => `<div class="em">${e}</div>`).join('');
  palette.querySelectorAll('.em').forEach((el, i) => {
    el.onclick = (ev) => {
      ev.stopPropagation();
      send({ type: 'throwEmoji', targetSeat, emoji: THROW_EMOJIS[i] });
      palette.style.display = 'none';
    };
  });
}
document.addEventListener('click', () => {
  const palette = document.getElementById('emojiPalette');
  if (palette) palette.style.display = 'none';
});

function throwEmojiAnimation(fromSeat, targetSeat, emoji) {
  const wrap = document.getElementById('tableWrap');
  const fromPos = seatPositions[fromSeat] || { top: '46%', left: '50%' };
  const toPos = seatPositions[targetSeat] || { top: '46%', left: '50%' };
  const el = document.createElement('div');
  el.className = 'flyingEmoji';
  el.textContent = emoji;
  el.style.top = fromPos.top;
  el.style.left = fromPos.left;
  wrap.appendChild(el);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.style.top = toPos.top;
      el.style.left = toPos.left;
    });
  });
  setTimeout(() => {
    el.remove();
    const targetEl = wrap.querySelector(`.seat[data-seat="${targetSeat}"]`);
    if (targetEl) {
      targetEl.classList.remove('hit');
      void targetEl.offsetWidth;
      targetEl.classList.add('hit');
      setTimeout(() => targetEl.classList.remove('hit'), 500);
    }
    const splat = document.createElement('div');
    splat.className = 'splatEmoji';
    splat.textContent = emoji;
    splat.style.top = toPos.top;
    splat.style.left = toPos.left;
    wrap.appendChild(splat);
    setTimeout(() => splat.remove(), 950);
  }, 570);
}

function renderTrick(state) {
  document.querySelectorAll('.trickCard').forEach(e => e.remove());
  const wrap = document.getElementById('tableWrap');
  (state.currentTrick || []).forEach(entry => {
    const pos = trickPositions[entry.seat];
    const div = document.createElement('div');
    div.className = 'trickCard';
    div.innerHTML = `<div class="${SUIT_COLOR[entry.card.suit]}">${entry.card.rank}</div><div class="${SUIT_COLOR[entry.card.suit]}">${entry.card.suit}</div>`;
    div.style.top = pos.top; div.style.left = pos.left;
    wrap.appendChild(div);
  });
}

function renderScoreboard(state) {
  const el = document.getElementById('scoreboard');
  let rows = state.players.map(p => `<tr><td>${p.name}${p.seat === mySeat ? ' (คุณ)' : ''}</td><td style="text-align:right;color:#9fdc9f;">${p.points >= 0 ? '+' : ''}${p.points}</td><td style="text-align:right">${p.score}</td></tr>`).join('');
  el.innerHTML = `<table><tr><td><b>ผู้เล่น</b></td><td style="text-align:right"><b>มือนี้</b></td><td style="text-align:right"><b>รวม</b></td></tr>${rows}</table>`;
}

function renderHand(state) {
  const el = document.getElementById('handArea');
  el.innerHTML = '';
  const order = { '♣':0, '♦':1, '♠':2, '♥':3 };
  const sorted = (state.yourHand || []).slice().sort((a,b) => order[a.suit]-order[b.suit] || a.value-b.value);
  const passing = state.phase === 'passing';
  sorted.forEach(card => {
    const div = document.createElement('div');
    const legal = passing ? true : (state.yourTurn && (state.validUids || []).includes(card.uid));
    div.className = 'card ' + (legal ? '' : 'disabled') + (selectedPassCards.includes(card.uid) ? ' selected' : '');
    div.innerHTML = `<div class="${SUIT_COLOR[card.suit]}">${card.rank}</div><div class="${SUIT_COLOR[card.suit]}" style="font-size:20px;">${card.suit}</div><div class="${SUIT_COLOR[card.suit]}">${card.rank}</div>`;
    div.onclick = () => onCardClick(state, card, legal);
    el.appendChild(div);
  });

  const passBtn = document.getElementById('passBtn');
  if (passing) {
    passBtn.style.display = 'inline-block';
    const submitted = state.passing && state.passing.submitted;
    passBtn.disabled = submitted || selectedPassCards.length !== 3;
    passBtn.textContent = submitted ? 'ส่งแล้ว รอผู้เล่นอื่น...' : `ส่งไพ่ที่เลือก (${selectedPassCards.length}/3)`;
  } else {
    passBtn.style.display = 'none';
    selectedPassCards = [];
  }
}

function onCardClick(state, card, legal) {
  if (state.phase === 'passing') {
    if (state.passing && state.passing.submitted) return;
    if (selectedPassCards.includes(card.uid)) {
      selectedPassCards = selectedPassCards.filter(u => u !== card.uid);
    } else if (selectedPassCards.length < 3) {
      selectedPassCards.push(card.uid);
    }
    renderHand(state);
    return;
  }
  if (!legal) return;
  send({ type: 'playCard', uid: card.uid });
}

document.getElementById('passBtn').onclick = () => {
  if (selectedPassCards.length !== 3) return;
  send({ type: 'submitPass', uids: selectedPassCards });
  selectedPassCards = [];
};

function renderStatus(state) {
  let msg = '';
  if (state.phase === 'passing') {
    const dirLabel = { left:'ซ้าย', right:'ขวา', across:'ข้ามโต๊ะ' }[state.passing ? state.passing.direction : ''] || '';
    msg = (state.passing && state.passing.submitted) ? 'ส่งไพ่แล้ว รอผู้เล่นคนอื่น...' : `เลือกไพ่ 3 ใบเพื่อส่งไปทาง${dirLabel}`;
  } else if (state.phase === 'playing') {
    msg = state.yourTurn ? 'ตาคุณ: เลือกไพ่ที่จะเล่น' : (() => {
      const active = state.players.find(p => p.seat === state.activeSeat);
      return active ? `รอ ${active.name} เล่นไพ่...` : '';
    })();
  }
  document.getElementById('status').textContent = msg;
}

// ================== D&D room (independent mini-app) ==================
let dndYou = null;
let dndPlayersList = [];
let dndTurnOrderClient = [];
let dndTurnIndexClient = -1;
let dndCurrentTurnPlayerId = null;
let dndRaces = [];
let dndClasses = [];
let dndClassStarterGear = {}; // { classKey: { weapon:{name,atk,def,maxDurability}, armor:{...}, shoes:{...}, accessory:{...} } }
let dndPassives = {}; // { raceKey: [{key,name,icon,desc,effect}, ...] }
let dndCustomPassives = []; // [{id,key,raceKey,name,icon,desc,effect}] — created by DM, on top of the built-in ones
let dndPointBuyMin = 8;
let dndPointBuyBudget = 27;
let dndPointBuyCost = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
let dndPointBuyCostMaxDefined = 15;
let dndPointBuyCostPerStepAboveMax = 9;
let dndStatPointsPerLevel = 2;
// ต้นทุนสะสม (จากฐาน dndPointBuyMin) ของค่าสเตตัสใดๆ — คำนวณเหมือนฝั่งเซิร์ฟเวอร์ทุกประการ (data/point-buy.js)
// ค่าในตาราง dndPointBuyCost คือ "ต้นทุนต่อ 1 แต้ม" ของขั้นนั้นๆ ต้องบวกสะสมทีละขั้นจาก min+1 ถึง s
// เช่น 8->15 ต้องรวม 9+10+11+12+13+14+15 = 1+2+3+4+5+7+9 = 31 แต้ม (ห้าม lookup ค่าที่ตำแหน่ง s ตรงๆ)
function dndPointBuyCostOf(score) {
  const s = Math.round(score);
  if (!Number.isFinite(s) || s < dndPointBuyMin) return Infinity;
  if (s === dndPointBuyMin) return 0;
  let total = 0;
  const upper = Math.min(s, dndPointBuyCostMaxDefined);
  for (let i = dndPointBuyMin + 1; i <= upper; i++) {
    if (dndPointBuyCost[i] === undefined) return Infinity;
    total += dndPointBuyCost[i];
  }
  if (s > dndPointBuyCostMaxDefined) {
    total += (s - dndPointBuyCostMaxDefined) * dndPointBuyCostPerStepAboveMax;
  }
  return total;
}
function dndPointBuyStepCost(currentScore) {
  const s = Math.max(dndPointBuyMin, Math.round(currentScore));
  return dndPointBuyCostOf(s + 1) - dndPointBuyCostOf(s);
}
let dndCurrentDie = 20;
let dndCreateInitialized = false;
let dndCreateSelectedRace = null;
let dndCreateSelectedClass = null;
let dndCreateSelectedPassive = null;
let dndCreateAlloc = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 };
const DND_HAIR_STYLE_INFO = { bald: '👤 ล้าน', short: '💇 สั้น', long: '👱 ยาว', mohawk: '🎸 โมฮอว์ก', ponytail: '🎀 หางม้า' };
const DND_FACE_STYLE_INFO = { neutral: '😐 ปกติ', smile: '🙂 ยิ้ม', serious: '😠 จริงจัง', surprised: '😲 ตกใจ', wink: '😉 ขยิบตา' };
const DND_HAIR_COLOR_LIST = ['#2b1b12', '#5b3a1e', '#8a5a2b', '#c9a227', '#e8e2d0', '#7a3b2e', '#3b3b3b', '#c94f4f'];
let dndCreateAppearance = { hair: 'short', hairColor: DND_HAIR_COLOR_LIST[0], face: 'neutral' };
// ช่องไหนที่ผู้เล่นเคยพิมพ์เอง (แก้ไขเอง) ระหว่างสร้างตัวละคร — ช่องนั้นจะไม่ถูกทับตอนสลับคลาสอีก
// ส่วนช่องที่ยังไม่แตะเลย จะถูกแทนที่ด้วยเซตอุปกรณ์เต็มชุดของคลาสใหม่ทุกครั้งที่เปลี่ยนคลาส (กันอาวุธเก่าของคลาสก่อนหน้าค้างอยู่)
let dndCreateManualEquip = {};
let dndDmEditTargetId = null;
let dndTokenEditTargetId = null;
let dndSkills = [];
let dndActiveTool = 'dice';
const DND_STAT_LABELS = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };
const DND_STAT_TIPS = { str: '💪 พละกำลัง — เพิ่มพลังโจมตีและดาเมจระยะประชิด รวมถึงการทดสอบที่ใช้กำลัง', dex: '🏃 ความคล่องตัว — เพิ่มความแม่นยำ ความเร็ว การหลบหลีก และการโจมตีที่ใช้ความคล่องตัว', con: '❤️ ความแข็งแกร่งของร่างกาย — เพิ่มความทนทานและช่วยให้รับความเสียหายได้มากขึ้น', int: '🧠 สติปัญญา — ช่วยด้านเวทมนตร์ ความรู้ และการวิเคราะห์', wis: '👁️ ปัญญา/การรับรู้ — ช่วยด้านการรับรู้ สัญชาตญาณ และเวทบางประเภท', cha: '🗣️ เสน่ห์ — ช่วยด้านการพูดคุย โน้มน้าว และปฏิสัมพันธ์' };
function dndStatTipHtml(k) { return `data-tip="${escapeHtml(DND_STAT_TIPS[k] || '')}"`; }
let dndEquipSlots = ['weapon', 'armor', 'shoes', 'accessory'];
let dndEquipSlotLabels = { weapon: 'อาวุธ', armor: 'เกราะ', shoes: 'รองเท้า', accessory: 'เครื่องประดับ' };
const DND_EQUIP_SLOT_ICONS = { weapon: '⚔️', armor: '🛡️', shoes: '👢', accessory: '💍' };
let dndScene = { location: '', situation: '' };
let dndSceneEditInitialized = false;
let dndGameTime = { day: 1, hour: 8, minute: 0 };
let dndTimeSetInputsInitialized = false;
let dndTimeAuto = { running: false, speed: 10 };
let dndTimeAutoSpeedInitialized = false;
const DND_TOKEN_COLORS = ['#ff6b6b', '#6fd3ff', '#9fdc9f', '#ffd76b', '#c792ea', '#ff9d9d', '#7ee8fa', '#f4a261', '#82c9ff', '#f6a6c1'];
const DND_MAX_TOKEN_IMAGE_BYTES = 300 * 1024;
// ---- คลังมอนสเตอร์สำเร็จรูป 10 ตัว (DM กดสร้างได้เลย ไม่ต้องตั้งค่าเอง) — เรียงจากอ่อนไปแก่ ----
// เป็น let (ไม่ใช่ const) เพราะ DM สามารถกด "เพิ่มมอนสเตอร์ตัวนี้เข้าคลัง" จากหน้าต่างแก้ไข token
// เพื่อบันทึกมอนสเตอร์ที่สร้างเองแบบกำหนดค่าเอง (ไม่ได้มาจากพรีเซ็ตในลิสต์นี้) ให้เข้ามาอยู่ในลิสต์นี้ด้วย
let DND_MONSTER_PRESETS = [
  { key: 'rat', name: 'หนูยักษ์', emoji: '🐀', color: '#c9a876', size: 'normal', maxHp: 7, ac: 10,
    stats: { str: 7, dex: 15, con: 9, int: 2, wis: 10, cha: 3 },
    attacks: [{ name: 'กัด', desc: 'ฟันแหลมคมกัดเข้าเป้าหมาย', stat: 'dex', toHit: 0, dmgDie: 4, dmgCount: 1, dmgMod: 0 }],
    expReward: 5, goldReward: 1, loot: [{ name: 'หางหนู', qty: 1 }] },
  { key: 'slime', name: 'สไลม์', emoji: '🟢', color: '#9fdc9f', size: 'normal', maxHp: 18, ac: 8,
    stats: { str: 6, dex: 2, con: 16, int: 1, wis: 6, cha: 1 },
    attacks: [{ name: 'โอบรัด', desc: 'พุ่งเข้าโอบรัดเป้าหมายด้วยตัวเหลว', stat: 'str', toHit: 0, dmgDie: 6, dmgCount: 1, dmgMod: 0 }],
    expReward: 8, goldReward: 0, loot: [{ name: 'เมือกสไลม์', qty: 2 }] },
  { key: 'wolf', name: 'หมาป่า', emoji: '🐺', color: '#9aa4b2', size: 'normal', maxHp: 15, ac: 13,
    stats: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 },
    attacks: [{ name: 'กัด', desc: 'กระโจนกัดด้วยเขี้ยวคม', stat: 'str', toHit: 2, dmgDie: 6, dmgCount: 1, dmgMod: 1 }],
    expReward: 10, goldReward: 2, loot: [{ name: 'หนังหมาป่า', qty: 1 }] },
  { key: 'goblin', name: 'โกเบลิน', emoji: '👺', color: '#7ee87e', size: 'normal', maxHp: 10, ac: 13,
    stats: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    attacks: [{ name: 'ดาบสั้น', desc: 'ฟันด้วยดาบสั้นเก่าคร่ำคร่า', stat: 'dex', toHit: 2, dmgDie: 6, dmgCount: 1, dmgMod: 2 }],
    expReward: 15, goldReward: 5, loot: [{ name: 'ดาบสั้นเก่า', qty: 1 }, { name: 'เหรียญทองแดง', qty: 3 }] },
  { key: 'skeleton', name: 'โครงกระดูก', emoji: '💀', color: '#e8e6da', size: 'normal', maxHp: 13, ac: 13,
    stats: { str: 10, dex: 14, con: 15, int: 6, wis: 8, cha: 5 },
    attacks: [{ name: 'ดาบโบราณ', desc: 'ฟาดด้วยดาบผุพังจากยุคก่อน', stat: 'dex', toHit: 2, dmgDie: 6, dmgCount: 1, dmgMod: 0 }],
    expReward: 15, goldReward: 3, loot: [{ name: 'เศษกระดูก', qty: 2 }] },
  { key: 'zombie', name: 'ซอมบี้', emoji: '🧟', color: '#8fae7a', size: 'normal', maxHp: 22, ac: 8,
    stats: { str: 13, dex: 6, con: 16, int: 3, wis: 6, cha: 5 },
    attacks: [{ name: 'ตะปบ', desc: 'ยื่นมือเน่าเปื่อยตะปบเข้าใส่', stat: 'str', toHit: 3, dmgDie: 6, dmgCount: 1, dmgMod: 1 }],
    expReward: 20, goldReward: 2, loot: [{ name: 'เนื้อเน่า', qty: 1 }] },
  { key: 'spider', name: 'แมงมุมยักษ์', emoji: '🕷️', color: '#5b4636', size: 'normal', maxHp: 26, ac: 14,
    stats: { str: 14, dex: 16, con: 12, int: 2, wis: 11, cha: 4 },
    attacks: [{ name: 'กัดพิษ', desc: 'ฉีดพิษร้ายผ่านเขี้ยวแหลม', stat: 'dex', toHit: 4, dmgDie: 8, dmgCount: 1, dmgMod: 3 }],
    expReward: 30, goldReward: 5, loot: [{ name: 'พิษแมงมุม', qty: 1 }, { name: 'ใยแมงมุม', qty: 2 }] },
  { key: 'orc', name: 'ออร์ค', emoji: '👹', color: '#6b8f4e', size: 'normal', maxHp: 30, ac: 13,
    stats: { str: 16, dex: 12, con: 16, int: 7, wis: 11, cha: 10 },
    attacks: [{ name: 'ขวานใหญ่', desc: 'ฟาดด้วยขวานสองมือหนักหน่วง', stat: 'str', toHit: 3, dmgDie: 12, dmgCount: 1, dmgMod: 3 }],
    expReward: 50, goldReward: 10, loot: [{ name: 'ขวานออร์ค', qty: 1 }, { name: 'เหรียญทอง', qty: 8 }] },
  { key: 'troll', name: 'โทรลล์', emoji: '🧌', color: '#5f7a5a', size: 'large', maxHp: 84, ac: 15,
    stats: { str: 18, dex: 13, con: 20, int: 7, wis: 9, cha: 7 },
    attacks: [{ name: 'กรงเล็บ', desc: 'ฟาดกรงเล็บยาวสองข้างรัวๆ', stat: 'str', toHit: 7, dmgDie: 6, dmgCount: 2, dmgMod: 4 }],
    expReward: 450, goldReward: 50, loot: [{ name: 'หนังโทรลล์', qty: 1 }, { name: 'เหรียญทอง', qty: 50 }] },
  { key: 'dragon', name: 'มังกรหนุ่ม', emoji: '🐉', color: '#e05b5b', size: 'huge', maxHp: 178, ac: 18,
    stats: { str: 23, dex: 10, con: 21, int: 14, wis: 13, cha: 17 },
    attacks: [
      { name: 'กัด', desc: 'ฟันขากรรไกรมหึมาลงบนเป้าหมาย', stat: 'str', toHit: 10, dmgDie: 10, dmgCount: 2, dmgMod: 6 },
      { name: 'พ่นไฟ', desc: 'พ่นลมหายใจเพลิงเป็นวงกว้าง', stat: 'con', toHit: 0, dmgDie: 6, dmgCount: 8, dmgMod: 0 },
    ],
    expReward: 2300, goldReward: 500, loot: [{ name: 'เกล็ดมังกร', qty: 3 }, { name: 'เหรียญทองคำ', qty: 500 }] },
];
function dndMonsterPresetSummary(m) {
  const atk = (m.attacks || []).map(a => `${a.name} (${DND_STAT_LABELS[a.stat] || '-'} ${a.toHit >= 0 ? '+' : ''}${a.toHit}, ${a.dmgCount}d${a.dmgDie}${a.dmgMod ? (a.dmgMod >= 0 ? '+' : '') + a.dmgMod : ''})`).join(' · ');
  return `❤️ ${m.maxHp} · 🛡 ${m.ac}${atk ? ' — ' + atk : ''}`;
}
// ---- คลังมอนสเตอร์ที่ DM สร้างเองเพิ่มเติม (บันทึกไว้ในเบราว์เซอร์เครื่องนี้ ให้คงอยู่แม้รีเฟรชหน้า) ----
const DND_CUSTOM_PRESET_STORAGE_KEY = 'dndCustomMonsterPresets';
function dndLoadCustomPresets() {
  try {
    const raw = localStorage.getItem(DND_CUSTOM_PRESET_STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (Array.isArray(list)) {
      list.forEach(m => {
        if (m && m.key && !DND_MONSTER_PRESETS.some(p => p.key === m.key)) DND_MONSTER_PRESETS.push(m);
      });
    }
  } catch (e) { /* เบราว์เซอร์อาจปิด localStorage ไว้ — ข้ามไปเงียบๆ */ }
}
function dndSaveCustomPresetsToStorage() {
  try {
    const builtinKeys = new Set(['rat', 'slime', 'wolf', 'goblin', 'skeleton', 'zombie', 'spider', 'orc', 'troll', 'dragon']);
    const custom = DND_MONSTER_PRESETS.filter(m => !builtinKeys.has(m.key));
    localStorage.setItem(DND_CUSTOM_PRESET_STORAGE_KEY, JSON.stringify(custom));
  } catch (e) { /* เบราว์เซอร์อาจปิด localStorage ไว้ — ข้ามไปเงียบๆ */ }
}
function dndSlugifyMonsterName(name) {
  const base = (name || 'monster').toString().trim().toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/g, '-').replace(/(^-+|-+$)/g, '');
  return (base || 'monster') + '-' + Date.now().toString(36) + Math.floor(Math.random() * 1000);
}
function dndRefreshMonsterPresetSelect() {
  const sel = document.getElementById('dndMonsterPresetSelect');
  if (!sel) return;
  const prevKey = sel.value;
  sel.innerHTML = DND_MONSTER_PRESETS
    .map(m => `<option value="${m.key}">${m.emoji} ${m.name}</option>`).join('');
  if (prevKey && DND_MONSTER_PRESETS.some(m => m.key === prevKey)) sel.value = prevKey;
  dndRenderMonsterPresetPreview();
}
dndLoadCustomPresets();
let dndTokens = [];
let dndShops = [];
let dndForgeFailPolicyLabels = { safe: 'พลาดแล้วไม่มีอะไรเกิดขึ้น', downgrade: 'พลาดแล้วตกระดับ 1 ขั้น', break: 'พลาดแล้วไอเทมพัง (รีเซตเป็น +0)' };
let dndItemEffects = [];
let dndTrades = [];
let dndTradeOfferPicked = {};   // name -> qty ที่จะให้
let dndTradeRequestPicked = {}; // name -> qty ที่จะขอ
let dndTradeTargetId = null;
let dndTokenEls = {};       // id -> DOM element, so drags/redraws don't rebuild nodes needlessly
let dndDraggingId = null;   // id ของ token ที่กำลังลากอยู่ตอนนี้ (กันไม่ให้ state ที่ค้างมาจาก server มาแย่งตำแหน่งระหว่างลาก)
let dndMyTokenColor = null;
let dndNpcFormColor = DND_TOKEN_COLORS[0];
let dndNpcFormImage = null;
let dndMapBackground = null;
let dndMaps = [];
let dndCurrentMapId = 1;
function readDndImageFile(file, cb) {
  if (!file) return cb(null);
  if (!file.type.startsWith('image/')) return cb(null);
  if (file.size > 300 * 1024) { alert('รูปใหญ่เกินไป — จำกัดประมาณ 300KB'); return cb(null); }
  const reader = new FileReader();
  reader.onload = () => cb(reader.result);
  reader.readAsDataURL(file);
}
document.getElementById('dndMapBgInput').addEventListener('change', ev => {
  readDndImageFile(ev.target.files[0], image => { if (image) send({ type: 'dndMapBackgroundUpdate', image }); ev.target.value = ''; });
});
document.getElementById('dndMapBgClearBtn').onclick = () => send({ type: 'dndMapBackgroundUpdate', image: null });

document.getElementById('dndNameInput').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('dndJoinBtn').click(); });
document.getElementById('dndJoinBtn').onclick = (ev) => {
  const name = document.getElementById('dndNameInput').value.trim();
  if (!name) return;
  flashBtn(ev.currentTarget);
  send({ type: 'dndJoin', name });
  document.getElementById('dndJoinScreen').style.display = 'none';
  document.getElementById('chatPanel').style.display = 'none';
  document.getElementById('alarmBtn').style.display = 'none';
  document.getElementById('newGameBtn').style.display = 'block';
};
document.getElementById('dndSeatRefreshBtn').onclick = (ev) => { flashBtn(ev.currentTarget); send({ type: 'dndListSeats' }); };
function renderDndSeatList(seats) {
  const box = document.getElementById('dndSeatListBox');
  const list = document.getElementById('dndSeatList');
  if (!seats || seats.length === 0) { box.style.display = 'none'; list.innerHTML = ''; return; }
  box.style.display = 'block';
  list.innerHTML = seats.map(s => `
    <div class="seatRow">
      <span>${escapeHtml(s.name)}${s.isDM ? ' <span class="dndPCardTag">DM</span>' : ''}<br><span style="font-size:11px; color:#9aa4b2;">${escapeHtml(s.raceCls)}${s.raceCls !== 'ยังไม่ได้สร้างตัวละคร' ? ' · Lv.' + s.level : ''}</span></span>
      <button type="button" class="seatTakeBtn" data-id="${s.id}">นั่งแทน</button>
    </div>`).join('');
  list.querySelectorAll('.seatTakeBtn').forEach(btn => {
    btn.onclick = (ev) => {
      flashBtn(ev.currentTarget);
      send({ type: 'dndTakeSeat', id: Number(btn.dataset.id) });
      document.getElementById('dndJoinScreen').style.display = 'none';
      document.getElementById('chatPanel').style.display = 'none';
      document.getElementById('alarmBtn').style.display = 'none';
      document.getElementById('newGameBtn').style.display = 'block';
    };
  });
}

document.getElementById('dndLeaveBtn').onclick = (ev) => {
  flashBtn(ev.currentTarget);
  if (confirm('ออกจากที่นั่ง? ที่นั่งของคุณ (และการ์ดตัวละคร) จะยังอยู่ — กลับเข้ามานั่งที่เดิมได้จากรายชื่อ "ที่นั่งที่เคยออกไป" ตอนเข้าห้องใหม่')) {
    dndCreateInitialized = false;
    dndSceneEditInitialized = false;
    dndTimeSetInputsInitialized = false;
    dndTimeAutoSpeedInitialized = false;
    send({ type: 'dndLeave' });
  }
};
document.getElementById('dndRestartBtn').onclick = (ev) => {
  flashBtn(ev.currentTarget);
  if (confirm('รีเซตห้องทั้งหมด? ผู้เล่นทุกคน (รวมคุณ) และตัวละครทั้งหมดจะถูกล้าง แล้วต้องเข้าห้องกันใหม่ทั้งหมด')) {
    dndCreateInitialized = false;
    dndSceneEditInitialized = false;
    dndTimeSetInputsInitialized = false;
    dndTimeAutoSpeedInitialized = false;
    send({ type: 'dndRestart' });
  }
};

// ---- บันทึกเกม / โหลดเกม (เฉพาะ DM): เซฟสถานะห้องทั้งหมดเป็นไฟล์ .json แล้วเอากลับมาโหลดเล่นต่อได้ ----
document.getElementById('dndSaveGameBtn').onclick = (ev) => {
  flashBtn(ev.currentTarget);
  send({ type: 'dndExportState' });
};
document.getElementById('dndLoadGameBtn').onclick = (ev) => {
  flashBtn(ev.currentTarget);
  if (confirm('โหลดเกมจากไฟล์? สถานะห้องปัจจุบันทั้งหมดจะถูกแทนที่ด้วยข้อมูลในไฟล์ที่เลือก และผู้เล่นทุกคน (รวมคุณ) จะต้องกลับเข้ามานั่งที่เดิมกันใหม่')) {
    document.getElementById('dndLoadGameFileInput').click();
  }
};
document.getElementById('dndLoadGameFileInput').onchange = (ev) => {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = ''; // เคลียร์ค่าไว้ เผื่อผู้ใช้เลือกไฟล์เดิมซ้ำอีกครั้งในอนาคต
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try {
      data = JSON.parse(reader.result);
    } catch (e) {
      alert('ไฟล์นี้ไม่ใช่ไฟล์เซฟที่ถูกต้อง (อ่านเป็น JSON ไม่ได้)');
      return;
    }
    dndCreateInitialized = false;
    dndSceneEditInitialized = false;
    dndTimeSetInputsInitialized = false;
    dndTimeAutoSpeedInitialized = false;
    send({ type: 'dndImportState', data });
  };
  reader.onerror = () => alert('อ่านไฟล์นี้ไม่สำเร็จ ลองใหม่อีกครั้ง');
  reader.readAsText(file);
};
// เซิร์ฟเวอร์ส่งสถานะห้องทั้งหมดกลับมาให้ (ตอบรับปุ่ม "บันทึกเกมเป็นไฟล์") — สร้างไฟล์ .json ให้เบราว์เซอร์ดาวน์โหลดทันที
function downloadDndSave(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const a = document.createElement('a');
  a.href = url;
  a.download = `hearts8-dnd-save-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---- อุปกรณ์สวมใส่: อาวุธ / เกราะ / รองเท้า / เครื่องประดับ — ค่าป้องกัน + ความคงทน ต่อชิ้น ----
function renderEquipGrid(containerId, equipment, readOnly = false) {
  const grid = document.getElementById(containerId);
  if (!grid) return;
  const eq = equipment || {};
  grid.innerHTML = dndEquipSlots.map(slot => {
    const item = eq[slot] || { name: '', def: 0, atk: 0, durability: 0, maxDurability: 0, icon: '' };
    const label = dndEquipSlotLabels[slot] || slot;
    const icon = DND_EQUIP_SLOT_ICONS[slot] || '';
    const imgHtml = item.icon ? `<img src="${item.icon}" class="dndEquipItemIcon" alt="">` : '';
    if (readOnly) {
      const name = item.name || 'ไม่มีไอเทม';
      const broken = dndEquipSlotBrokenClient(item);
      const plus = Number(item.plus) || 0;
      const totalDef = broken ? 0 : ((Number(item.def) || 0) + (Number(item.forgeDef) || 0));
      const totalAtk = broken ? 0 : ((Number(item.atk) || 0) + (Number(item.forgeAtk) || 0));
      return `
        <div class="dndEquipSlotCard${broken ? ' broken' : ''}" data-slot="${slot}">
          <div class="dndEquipSlotLabel">${icon} ${escapeHtml(label)}${broken ? ' <span class="dndEquipBrokenTag">💔 ชำรุด</span>' : ''}</div>
          ${imgHtml}
          <div class="dndEquipReadValue${item.name ? '' : ' empty'}">${escapeHtml(name)}${item.name && plus > 0 ? ` <span class="dndForgePlusTag">+${plus}</span>` : ''}</div>
          <div class="dndEquipRow">
            <div style="flex:1;"><div class="dndEquipMiniLabel">ป้องกัน</div><div class="dndEquipStatValue">${totalDef}</div></div>
            <div style="flex:1;"><div class="dndEquipMiniLabel">โจมตี</div><div class="dndEquipStatValue">${totalAtk}</div></div>
            <div style="flex:1;"><div class="dndEquipMiniLabel">คงทน</div><div class="dndEquipStatValue">${Number(item.durability) || 0}/${Number(item.maxDurability) || 0}</div></div>
          </div>
          ${item.name ? `<button type="button" class="dndUnequipBtn" data-unequip-slot="${slot}">🎒 ถอด</button>` : ''}
        </div>`;
    }
    return `
      <div class="dndEquipSlotCard" data-slot="${slot}">
        <div class="dndEquipSlotLabel">${icon} ${escapeHtml(label)}</div>
        ${imgHtml}
        <input type="text" class="dndEquipName" maxlength="40" placeholder="ชื่อไอเทม" value="${escapeHtml(item.name || '')}">
        <div class="dndEquipRow">
          <div style="flex:1;"><div class="dndEquipMiniLabel">ป้องกัน</div><input type="number" class="dndEquipDef" min="0" max="999" value="${item.def || 0}"></div>
          <div style="flex:1;"><div class="dndEquipMiniLabel">โจมตี</div><input type="number" class="dndEquipAtk" min="0" max="999" value="${item.atk || 0}"></div>
          <div style="flex:1;"><div class="dndEquipMiniLabel">คงทน</div><input type="number" class="dndEquipDur" min="0" max="999" value="${item.durability || 0}"></div>
          <div style="flex:1;"><div class="dndEquipMiniLabel">สูงสุด</div><input type="number" class="dndEquipMaxDur" min="0" max="999" value="${item.maxDurability || 0}"></div>
        </div>
        <input type="hidden" class="dndEquipIcon" value="${escapeHtml(item.icon || '')}">
        <input type="hidden" class="dndEquipPlus" value="${Number(item.plus) || 0}">
        <input type="hidden" class="dndEquipForgeHistory" value="${escapeHtml(JSON.stringify(item.forgeHistory || []))}">
        ${(Number(item.plus) || 0) > 0 ? `<div class="dndRangeHint">ระดับตีบวกปัจจุบัน: <span class="dndForgePlusTag">+${Number(item.plus) || 0}</span> (แก้ไขค่านี้ได้จากแท็บร้านตีบวกเท่านั้น)</div>` : ''}
        <label class="dndEquipIconLabel">🖼️ รูปไอเทม (PNG/JPG, ≤250KB)<input type="file" class="dndEquipIconFile" accept="image/png,image/jpeg,image/webp"></label>
      </div>`;
  }).join('');
  if (readOnly) {
    grid.querySelectorAll('button[data-unequip-slot]').forEach(btn => {
      btn.onclick = (ev) => {
        flashBtn(ev.currentTarget);
        send({ type: 'dndUnequip', slot: btn.dataset.unequipSlot });
      };
    });
    return;
  }
  grid.querySelectorAll('.dndEquipSlotCard').forEach(card => {
    const fileInput = card.querySelector('.dndEquipIconFile');
    const hiddenInput = card.querySelector('.dndEquipIcon');
    fileInput.onchange = () => {
      const file = fileInput.files[0];
      if (!file) return;
      if (file.size > 250000) { showDndErrorToast('รูปใหญ่เกินไป (จำกัดประมาณ 250KB)'); fileInput.value = ''; return; }
      const reader = new FileReader();
      reader.onload = () => {
        hiddenInput.value = reader.result;
        let img = card.querySelector('.dndEquipItemIcon');
        if (!img) {
          img = document.createElement('img');
          img.className = 'dndEquipItemIcon';
          card.querySelector('.dndEquipSlotLabel').insertAdjacentElement('afterend', img);
        }
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    };
  });
}
function readEquipGrid(containerId) {
  const grid = document.getElementById(containerId);
  const out = {};
  if (!grid) return out;
  grid.querySelectorAll('.dndEquipSlotCard').forEach(card => {
    const slot = card.dataset.slot;
    const iconEl = card.querySelector('.dndEquipIcon');
    const plusEl = card.querySelector('.dndEquipPlus');
    const forgeHistEl = card.querySelector('.dndEquipForgeHistory');
    let forgeHistory = [];
    if (forgeHistEl && forgeHistEl.value) { try { forgeHistory = JSON.parse(forgeHistEl.value); } catch (e) { forgeHistory = []; } }
    out[slot] = {
      name: card.querySelector('.dndEquipName').value,
      def: card.querySelector('.dndEquipDef').value,
      atk: card.querySelector('.dndEquipAtk').value,
      durability: card.querySelector('.dndEquipDur').value,
      maxDurability: card.querySelector('.dndEquipMaxDur').value,
      icon: iconEl ? iconEl.value : '',
      plus: plusEl ? plusEl.value : 0,
      forgeHistory,
    };
  });
  return out;
}
function dndEquipSlotBrokenClient(item) {
  return !!(item && item.maxDurability > 0 && item.durability <= 0);
}
function dndTotalDefenseClient(equipment) {
  if (!equipment) return 0;
  return dndEquipSlots.reduce((sum, slot) => {
    const item = equipment[slot];
    if (dndEquipSlotBrokenClient(item)) return sum;
    return sum + (Number(item && item.def) || 0) + (Number(item && item.forgeDef) || 0);
  }, 0);
}
function dndTotalAttackClient(equipment) {
  if (!equipment) return 0;
  return dndEquipSlots.reduce((sum, slot) => {
    const item = equipment[slot];
    if (dndEquipSlotBrokenClient(item)) return sum;
    return sum + (Number(item && item.atk) || 0) + (Number(item && item.forgeAtk) || 0);
  }, 0);
}
// ---- ป้ายประกาศสถานที่ / สถานการณ์ — DM เท่านั้นที่กำหนดได้ ขึ้นจอทุกคนพร้อมกัน ----
function renderDndScene(scene) {
  dndScene = scene || { location: '', situation: '' };
  const banner = document.getElementById('dndSceneBanner');
  const locEl = document.getElementById('dndSceneLocation');
  const sitEl = document.getElementById('dndSceneSituation');
  if (dndScene.location || dndScene.situation) {
    banner.style.display = 'block';
    locEl.textContent = dndScene.location ? '📍 ' + dndScene.location : '';
    sitEl.textContent = dndScene.situation || '';
  } else {
    banner.style.display = 'none';
  }
}
document.getElementById('dndSceneAnnounceBtn').onclick = (ev) => {
  flashBtn(ev.currentTarget);
  send({
    type: 'dndSceneUpdate',
    scene: {
      location: document.getElementById('dndSceneLocationInput').value,
      situation: document.getElementById('dndSceneSituationInput').value,
    },
  });
};
document.getElementById('dndSceneClearBtn').onclick = (ev) => {
  flashBtn(ev.currentTarget);
  document.getElementById('dndSceneLocationInput').value = '';
  document.getElementById('dndSceneSituationInput').value = '';
  send({ type: 'dndSceneUpdate', scene: { location: '', situation: '' } });
};

// ---- นาฬิกาในเกม — ทุกคนเห็นป้ายเวลาบนจอ / DM เท่านั้นเดินเวลา ข้ามวัน หรือแก้ไขเวลาเองได้ ----
function dndTimeIconForHour(hour) {
  if (hour >= 5 && hour < 8) return '🌅';   // เช้าตรู่
  if (hour >= 8 && hour < 17) return '🌞';  // กลางวัน
  if (hour >= 17 && hour < 20) return '🌆'; // เย็น
  return '🌙';                              // กลางคืน
}
function renderDndGameTime(gameTime) {
  dndGameTime = gameTime || dndGameTime;
  document.getElementById('dndTimeBannerIcon').textContent = dndTimeIconForHour(dndGameTime.hour);
  document.getElementById('dndTimeBannerText').textContent =
    `วันที่ ${dndGameTime.day} — ${String(dndGameTime.hour).padStart(2, '0')}:${String(dndGameTime.minute).padStart(2, '0')} น.`;
  const nowEl = document.getElementById('dndTimeEditNow');
  if (nowEl) nowEl.textContent = `(ตอนนี้: วันที่ ${dndGameTime.day} ${String(dndGameTime.hour).padStart(2, '0')}:${String(dndGameTime.minute).padStart(2, '0')})`;
}
function renderDndTimeAuto(timeAuto) {
  dndTimeAuto = timeAuto || dndTimeAuto;
  document.getElementById('dndTimeBannerAuto').style.display = dndTimeAuto.running ? 'inline' : 'none';
  const btn = document.getElementById('dndTimeAutoToggleBtn');
  if (btn) {
    btn.textContent = dndTimeAuto.running ? '⏸️ หยุดเวลาอัตโนมัติ' : '▶️ เดินเวลาอัตโนมัติ';
    btn.classList.toggle('dndTimeAutoOn', dndTimeAuto.running);
  }
  const speedSel = document.getElementById('dndTimeAutoSpeedSelect');
  if (speedSel && !dndTimeAutoSpeedInitialized) {
    speedSel.value = String(dndTimeAuto.speed);
    dndTimeAutoSpeedInitialized = true;
  }
}
document.querySelectorAll('.dndTimeAdvBtn').forEach(btn => {
  btn.onclick = (ev) => {
    flashBtn(ev.currentTarget);
    send({ type: 'dndTimeAdvance', minutes: Number(btn.dataset.min) });
  };
});
document.getElementById('dndTimeSkipDayBtn').onclick = (ev) => {
  flashBtn(ev.currentTarget);
  send({ type: 'dndTimeSkipDay' });
};
document.getElementById('dndTimeSetBtn').onclick = (ev) => {
  flashBtn(ev.currentTarget);
  send({
    type: 'dndTimeSet',
    time: {
      day: document.getElementById('dndTimeSetDay').value,
      hour: document.getElementById('dndTimeSetHour').value,
      minute: document.getElementById('dndTimeSetMinute').value,
    },
  });
};
document.getElementById('dndTimeAutoToggleBtn').onclick = (ev) => {
  flashBtn(ev.currentTarget);
  send({ type: 'dndTimeAutoToggle', running: !dndTimeAuto.running });
};
document.getElementById('dndTimeAutoSpeedSelect').addEventListener('change', (ev) => {
  send({ type: 'dndTimeAutoSpeedSet', speed: Number(ev.target.value) });
});

document.getElementById('dndDiceGrid').querySelectorAll('.dndDieBtn').forEach(btn => {
  btn.onclick = () => {
    dndCurrentDie = Number(btn.dataset.die);
    document.getElementById('dndDiceGrid').querySelectorAll('.dndDieBtn').forEach(b => b.classList.toggle('active', b === btn));
  };
});
document.getElementById('dndRollBtn').onclick = (ev) => {
  flashBtn(ev.currentTarget);
  send({
    type: 'dndRoll',
    die: dndCurrentDie,
    count: document.getElementById('dndDiceCount').value,
    modifier: document.getElementById('dndDiceMod').value,
    label: document.getElementById('dndDiceLabel').value,
  });
};

// ---- แท็บ ทอยลูกเต๋า / สกิล ----
function dndShowTool(tool) {
  dndActiveTool = tool;
  document.getElementById('dndDiceBox').style.display = tool === 'dice' ? 'block' : 'none';
  document.getElementById('dndAttackBox').style.display = tool === 'attack' ? 'block' : 'none';
  document.getElementById('dndSkillBox').style.display = tool === 'skill' ? 'block' : 'none';
  document.getElementById('dndMapBox').style.display = tool === 'map' ? 'block' : 'none';
  document.getElementById('dndShopBox').style.display = tool === 'shop' ? 'block' : 'none';
  document.getElementById('dndBagBox').style.display = tool === 'bag' ? 'block' : 'none';
  document.getElementById('dndToolTabDice').classList.toggle('active', tool === 'dice');
  document.getElementById('dndToolTabAttack').classList.toggle('active', tool === 'attack');
  document.getElementById('dndToolTabSkill').classList.toggle('active', tool === 'skill');
  document.getElementById('dndToolTabMap').classList.toggle('active', tool === 'map');
  document.getElementById('dndToolTabShop').classList.toggle('active', tool === 'shop');
  document.getElementById('dndToolTabBag').classList.toggle('active', tool === 'bag');
  if (tool === 'map') renderDndMap();
  if (tool === 'shop') renderDndShops();
  if (tool === 'bag') renderDndBag();
}
document.getElementById('dndToolTabDice').onclick = () => dndShowTool('dice');
document.getElementById('dndToolTabSkill').onclick = () => dndShowTool('skill');
document.getElementById('dndToolTabAttack').onclick = () => dndShowTool('attack');
document.getElementById('dndToolTabMap').onclick = () => dndShowTool('map');
document.getElementById('dndToolTabShop').onclick = () => dndShowTool('shop');
document.getElementById('dndToolTabBag').onclick = () => dndShowTool('bag');

// ---- สกิล: DM ออกแบบ/แก้ไขสกิลได้ทุกเมื่อ / ทุกคนใช้สกิลได้ (ถ้ามีสิทธิ์) ----
function fillSkillStatSelect(id) {
  const sel = document.getElementById(id);
  if (!sel || sel.dataset.filled) return;
  sel.innerHTML = '<option value="">— ไม่ผูกสเตตัส —</option>' +
    Object.keys(DND_STAT_LABELS).map(k => `<option value="${k}">${DND_STAT_LABELS[k]}</option>`).join('');
  sel.dataset.filled = '1';
}
fillSkillStatSelect('dndSkillStat');
fillSkillStatSelect('dndSkillEditStat');
fillSkillStatSelect('dndAtkStatSelect');
function fillSkillDmgDieSelect(id) {
  const sel = document.getElementById(id);
  if (!sel || sel.dataset.filled) return;
  sel.innerHTML = '<option value="0">— ไม่มีดาเมจ —</option>' +
    [4, 6, 8, 10, 12, 20, 100].map(d => `<option value="${d}">d${d}</option>`).join('');
  sel.dataset.filled = '1';
}
fillSkillDmgDieSelect('dndSkillDmgDie');
fillSkillDmgDieSelect('dndSkillEditDmgDie');
fillSkillDmgDieSelect('dndAtkDieSelect');
function fillSkillHealDieSelect(id) {
  const sel = document.getElementById(id);
  if (!sel || sel.dataset.filled) return;
  sel.innerHTML = '<option value="0">— ไม่ใช่สกิลชุบ —</option>' +
    [4, 6, 8, 10, 12, 20, 100].map(d => `<option value="${d}">d${d}</option>`).join('');
  sel.dataset.filled = '1';
}
fillSkillHealDieSelect('dndSkillHealDie');
fillSkillHealDieSelect('dndSkillEditHealDie');

let dndSkillAssignSelected = new Set();
function renderDndSkillAssignBox() {
  const box = document.getElementById('dndSkillAssignBox');
  box.innerHTML = dndPlayersList.map(p => {
    const label = escapeHtml(p.character.charName || p.name);
    const checked = dndSkillAssignSelected.has(p.id) ? 'checked' : '';
    return `<label class="dndAssignChip"><input type="checkbox" data-id="${p.id}" ${checked}> ${label}${p.isDM ? ' (DM)' : ''}</label>`;
  }).join('');
  box.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.onchange = () => {
      const id = Number(cb.dataset.id);
      if (cb.checked) dndSkillAssignSelected.add(id); else dndSkillAssignSelected.delete(id);
    };
  });
}

function showDndSkillFormError(msg) {
  const el = document.getElementById('dndSkillFormError');
  if (el) el.textContent = msg || '';
}

document.getElementById('dndSkillAddBtn').onclick = (ev) => {
  const name = document.getElementById('dndSkillName').value.trim();
  if (!name) { showDndSkillFormError('กรุณาตั้งชื่อสกิล'); return; }
  flashBtn(ev.currentTarget);
  showDndSkillFormError('');
  send({
    type: 'dndSkillCreate',
    skill: {
      name,
      stat: document.getElementById('dndSkillStat').value,
      desc: document.getElementById('dndSkillDesc').value,
      damage: {
        die: document.getElementById('dndSkillDmgDie').value,
        count: document.getElementById('dndSkillDmgCount').value,
        mod: document.getElementById('dndSkillDmgMod').value,
      },
      heal: {
        die: document.getElementById('dndSkillHealDie').value,
        count: document.getElementById('dndSkillHealCount').value,
        mod: document.getElementById('dndSkillHealMod').value,
      },
      status: {
        name: document.getElementById('dndSkillStatusName').value,
        note: document.getElementById('dndSkillStatusNote').value,
      },
      aoe: {
        radius: document.getElementById('dndSkillAoeRadius').value,
      },
      cleanse: {
        enabled: document.getElementById('dndSkillCleanseEnabled').checked,
        name: document.getElementById('dndSkillCleanseName').value,
      },
      cooldownSec: document.getElementById('dndSkillCooldown').value,
      maxUses: document.getElementById('dndSkillMaxUses').value,
      assignedIds: Array.from(dndSkillAssignSelected),
    },
  });
  document.getElementById('dndSkillName').value = '';
  document.getElementById('dndSkillDesc').value = '';
  document.getElementById('dndSkillStat').value = '';
  document.getElementById('dndSkillDmgDie').value = '0';
  document.getElementById('dndSkillDmgCount').value = '1';
  document.getElementById('dndSkillHealDie').value = '0';
  document.getElementById('dndSkillHealCount').value = '1';
  document.getElementById('dndSkillHealMod').value = '0';
  document.getElementById('dndSkillDmgMod').value = '0';
  document.getElementById('dndSkillStatusName').value = '';
  document.getElementById('dndSkillStatusNote').value = '';
  document.getElementById('dndSkillAoeRadius').value = '0';
  document.getElementById('dndSkillCleanseEnabled').checked = false;
  document.getElementById('dndSkillCleanseName').value = '';
  document.getElementById('dndSkillCooldown').value = '0';
  document.getElementById('dndSkillMaxUses').value = '0';
  dndSkillAssignSelected = new Set();
  renderDndSkillAssignBox();
};

let dndPendingTargetAction = null;
let dndSelectedTargetId = null;
let dndSelectedTargetType = null;
function openDndTargetPicker(action) {
  dndPendingTargetAction = action;
  dndSelectedTargetId = null;
  dndSelectedTargetType = null;
  const list = document.getElementById('dndTargetList');
  const title = document.getElementById('dndTargetTitle');
  const hint = document.getElementById('dndTargetHint');
  const error = document.getElementById('dndTargetError');
  title.textContent = action.title || 'เลือกเป้าหมาย';
  error.textContent = '';
  const rows = [];
  if (action.mode === 'npcAttack') {
    dndPlayersList.filter(p => !p.isDM && p.connected !== false).forEach(p => {
      rows.push({ type: 'player', id: p.id, name: p.character.charName || p.name, hp: p.character.hp, maxHp: p.character.maxHp, ac: p.character.ac });
    });
    hint.textContent = 'เลือกผู้เล่นที่จะโดนโจมตี';
  } else if (action.mode === 'useItem') {
    const allowDead = action.effType === 'revive';
    dndPlayersList.filter(p => !p.isDM && p.connected !== false).forEach(p => {
      const isMe = dndYou && p.id === dndYou.id;
      const dead = Number(p.character.hp) <= 0;
      if (dead && !allowDead) return; // ไอเทมฟื้นฟู HP ธรรมดา เลือกเป้าหมายที่หมดสติไม่ได้เลย
      rows.push({ type: 'player', id: p.id, name: (p.character.charName || p.name) + (isMe ? ' (ตัวเอง)' : '') + (dead ? ' 💀' : ''), hp: p.character.hp, maxHp: p.character.maxHp, ac: p.character.ac });
    });
    hint.textContent = allowDead ? 'เลือกคนที่จะใช้ไอเทมนี้ให้ (เลือกเพื่อนที่หมดสติเพื่อชุบชีวิตให้ฟื้น)' : 'เลือกเพื่อนที่จะฟื้นฟู HP ให้ (ใช้กับคนที่หมดสติไม่ได้ ต้องใช้ไอเทมชุบชีวิตแทน)';
  } else if (action.mode === 'skill' && action.isHeal) {
    dndPlayersList.filter(p => !p.isDM && p.connected !== false).forEach(p => {
      const isMe = dndYou && p.id === dndYou.id;
      const dead = Number(p.character.hp) <= 0;
      rows.push({ type: 'player', id: p.id, name: (p.character.charName || p.name) + (isMe ? ' (ตัวเอง)' : '') + (dead ? ' 💀' : ''), hp: p.character.hp, maxHp: p.character.maxHp, ac: p.character.ac });
    });
    hint.textContent = action.isCleanse ? 'เลือกคนที่จะลบล้างสถานะให้' : 'เลือกคนที่จะชุบ HP ให้ (เลือกเพื่อนที่หมดสติเพื่อชุบให้ฟื้น)';
  } else {
    dndTokens.filter(t => t.kind === 'npc' && Number(t.hp) > 0).forEach(t => {
      rows.push({ type: 'token', id: t.id, name: t.name, hp: t.hp, maxHp: t.maxHp, ac: t.ac });
    });
    hint.textContent = 'เลือกมอนสเตอร์/เป้าหมายบนแผนที่';
  }
  if (!rows.length) {
    list.innerHTML = '<div class="dndRangeHint">ยังไม่มีเป้าหมายที่เลือกได้</div>';
  } else {
    const isDM = !!(dndYou && dndYou.isDM);
    list.innerHTML = rows.map(r => {
      // ไม่บอกเลือดที่เหลือของมอนสเตอร์ให้ผู้เล่นเห็นตอนเลือกเป้าหมายโจมตี — DM เท่านั้นที่เห็น HP มอนสเตอร์ตรงนี้
      const hpText = (r.type === 'token' && !isDM) ? '' : `❤️ ${r.hp}/${r.maxHp} · `;
      return `<button type="button" class="dndTargetOption" data-type="${r.type}" data-id="${r.id}"><span>🎯 ${escapeHtml(r.name)}</span><span>${hpText}🛡️ ${r.ac}</span></button>`;
    }).join('');
    list.querySelectorAll('.dndTargetOption').forEach(btn => {
      btn.onclick = () => {
        list.querySelectorAll('.dndTargetOption').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        dndSelectedTargetType = btn.dataset.type;
        dndSelectedTargetId = Number(btn.dataset.id);
      };
    });
  }
  document.getElementById('dndTargetOverlay').style.display = 'flex';
}
// ---- ปุ่ม 🎲 ทอย บนรายการมอนสเตอร์ — ทอยท่าโจมตีได้ทันทีโดยไม่ต้องเปิดหน้าต่างแก้ไขก่อน ----
function dndOpenMonsterRoll(t) {
  if (!t) return;
  const attacks = t.attacks || [];
  if (!attacks.length) {
    alert('มอนสเตอร์ตัวนี้ยังไม่มีท่าโจมตี — เพิ่มท่าโจมตีได้ที่ปุ่ม ✏️ แก้ไข');
    return;
  }
  if (attacks.length === 1) {
    const a = attacks[0];
    openDndTargetPicker({ mode: 'npcAttack', tokenId: t.id, attackId: a.id, title: `เลือกเป้าหมายสำหรับ ${t.name} — ${a.name}` });
    return;
  }
  dndOpenAttackPick(t);
}
function dndOpenAttackPick(t) {
  const list = document.getElementById('dndAttackPickList');
  document.getElementById('dndAttackPickTitle').textContent = `เลือกท่าโจมตีของ ${t.name}`;
  list.innerHTML = (t.attacks || []).map(a => {
    const hitStr = a.toHit ? (a.toHit > 0 ? `+${a.toHit}` : `${a.toHit}`) : '+0';
    const dmgStr = a.dmgDie ? `${a.dmgCount}d${a.dmgDie}${a.dmgMod ? (a.dmgMod > 0 ? '+' + a.dmgMod : a.dmgMod) : ''}` : 'ไม่มีดาเมจ';
    return `<button type="button" class="dndTargetOption" data-attack="${a.id}"><span>⚔️ ${escapeHtml(a.name)}</span><span>1d20${hitStr} · ${dmgStr}</span></button>`;
  }).join('');
  list.querySelectorAll('button[data-attack]').forEach(btn => {
    btn.onclick = () => {
      const a = (t.attacks || []).find(aa => aa.id === Number(btn.dataset.attack));
      document.getElementById('dndAttackPickOverlay').style.display = 'none';
      openDndTargetPicker({ mode: 'npcAttack', tokenId: t.id, attackId: Number(btn.dataset.attack), title: `เลือกเป้าหมายสำหรับ ${t.name}${a ? ` — ${a.name}` : ''}` });
    };
  });
  document.getElementById('dndAttackPickOverlay').style.display = 'flex';
}
document.getElementById('dndAttackPickCancelBtn').onclick = () => {
  document.getElementById('dndAttackPickOverlay').style.display = 'none';
};
document.getElementById('dndTargetCancelBtn').onclick = () => {
  document.getElementById('dndTargetOverlay').style.display = 'none';
  dndPendingTargetAction = null;
};
document.getElementById('dndTargetConfirmBtn').onclick = (ev) => {
  if (!dndPendingTargetAction || dndSelectedTargetId == null) {
    document.getElementById('dndTargetError').textContent = 'กรุณาเลือกเป้าหมายก่อน';
    return;
  }
  flashBtn(ev.currentTarget);
  if (dndPendingTargetAction.mode === 'npcAttack') {
    send({ type: 'dndTokenAttackUse', tokenId: dndPendingTargetAction.tokenId, attackId: dndPendingTargetAction.attackId, targetType: dndSelectedTargetType, targetId: dndSelectedTargetId });
  } else if (dndPendingTargetAction.mode === 'normalAttack') {
    send({ type: 'dndNormalAttack', targetType: dndSelectedTargetType, targetId: dndSelectedTargetId });
  } else if (dndPendingTargetAction.mode === 'useItem') {
    send({ type: 'dndUseItem', name: dndPendingTargetAction.itemName, targetId: dndSelectedTargetId });
  } else {
    send({ type: 'dndSkillUse', skillId: dndPendingTargetAction.skillId, targetType: dndSelectedTargetType, targetId: dndSelectedTargetId });
  }
  document.getElementById('dndTargetOverlay').style.display = 'none';
  dndPendingTargetAction = null;
};

document.getElementById('dndNormalAttackBtn').onclick = (ev) => {
  if (!dndYou || dndYou.isDM) return;
  if (amIDead()) { showDndErrorToast('คุณหมดสติอยู่ ทำอะไรไม่ได้จนกว่าจะมีคนใช้ไอเทมชุบให้ หรือ DM เพิ่ม HP ให้'); return; }
  flashBtn(ev.currentTarget);
  openDndTargetPicker({ mode: 'normalAttack', title: 'เลือกมอนสเตอร์สำหรับโจมตีปกติ' });
};

function renderDndNormalAttackInfo() {
  const el = document.getElementById('dndNormalAttackInfo');
  const me = myDndEntry();
  if (!el || !me) return;
  const btn = document.getElementById('dndNormalAttackBtn');
  if (btn) btn.disabled = amIDead();
  const c = me.character || {};
  const strMod = Math.floor(((Number(c.str) || 10) - 10) / 2);
  const dexMod = Math.floor(((Number(c.dex) || 10) - 10) / 2);
  const equipAtk = dndTotalAttackClient(c.equipment || {});
  const mod = Math.max(strMod, dexMod);
  const modStr = mod >= 0 ? `+${mod}` : `${mod}`;
  el.innerHTML = `🎯 โจมตี: <b>1d20 ${modStr} ${equipAtk ? `+ ${equipAtk} อุปกรณ์` : ''}</b><br>💥 ดาเมจ: <b>1d6 ${modStr} ${equipAtk ? `+ ${equipAtk} อุปกรณ์` : ''}</b>`;
}

function amIDead() {
  if (!dndYou || dndYou.isDM) return false;
  const me = myDndEntry();
  return !!(me && Number(me.character && me.character.hp) <= 0);
}
function renderDndSkillList() {
  document.getElementById('dndSkillDmForm').style.display = (dndYou && dndYou.isDM) ? 'block' : 'none';
  if (dndYou && dndYou.isDM) renderDndSkillAssignBox();
  const emptyHint = document.getElementById('dndSkillEmptyHint');
  emptyHint.style.display = dndSkills.length ? 'none' : 'block';
  const list = document.getElementById('dndSkillList');
  list.innerHTML = '';
  dndSkills.forEach(skill => {
    const dmgText = skill.dmgDie ? `💥 ดาเมจ ${skill.dmgCount}d${skill.dmgDie}${skill.dmgMod ? (skill.dmgMod > 0 ? ' +' + skill.dmgMod : ' ' + skill.dmgMod) : ''}` : '';
    const healText = skill.healDie ? `💚 ชุบ HP ${skill.healCount}d${skill.healDie}${skill.healMod ? (skill.healMod > 0 ? ' +' + skill.healMod : ' ' + skill.healMod) : ''} (เลือกเป้าหมายเป็นผู้เล่น)` : '';
    const statusText = skill.statusName ? `☠️ ติดสถานะ "${escapeHtml(skill.statusName)}"${skill.statusNote ? ` — ${escapeHtml(skill.statusNote)}` : ''}` : '';
    const aoeText = skill.aoeRadius ? `💥 AOE รัศมี ${skill.aoeRadius} (ดาเมจกระจายรอบเป้าหมายหลัก ยิ่งไกลยิ่งเบา)` : '';
    const cleanseText = skill.cleanseEnabled ? `✨ ลบล้างสถานะ${skill.cleanseName ? ` "${escapeHtml(skill.cleanseName)}"` : 'ทั้งหมด'} (เลือกเป้าหมายเป็นผู้เล่น)` : '';
    const assignedNames = (!skill.classSkill && skill.assignedIds && skill.assignedIds.length)
      ? skill.assignedIds.map(id => { const pp = dndPlayersList.find(p => p.id === id); return pp ? (pp.character.charName || pp.name) : null; }).filter(Boolean)
      : [];
    const assignedText = skill.classSkill
      ? `🎓 สกิลประจำคลาส (ปลดล็อกเลเวล ${skill.level})`
      : (assignedNames.length ? `🔒 เฉพาะ: ${assignedNames.map(escapeHtml).join(', ')}` : '👥 ทั้งปาร์ตี้ใช้ได้');
    const ruleBits = [];
    if (skill.cooldownSec) ruleBits.push(`⏱ คูลดาวน์ ${skill.cooldownSec} วิ`);
    if (skill.maxUses) ruleBits.push(`🔁 ใช้ได้ ${skill.maxUses} ครั้ง${(dndYou && !dndYou.isDM && skill.usesLeft != null) ? ` (เหลือ ${skill.usesLeft})` : ''}`);
    const ruleText = ruleBits.join(' · ');
    const card = document.createElement('div');
    card.className = 'dndSkillCard';
    card.innerHTML = `
      <div class="dndSkillCardTop">
        <span class="dndSkillCardName">${skill.classSkill ? '🎓' : '✨'} ${escapeHtml(skill.name)}</span>
        ${skill.stat ? `<span class="dndSkillCardStat">${DND_STAT_LABELS[skill.stat] || skill.stat}</span>` : ''}
      </div>
      ${skill.desc ? `<div class="dndSkillCardDesc">${escapeHtml(skill.desc)}</div>` : ''}
      ${dmgText ? `<div class="dndSkillCardDmg">${dmgText}</div>` : ''}
      ${healText ? `<div class="dndSkillCardDmg" style="color:#7ee87e;">${healText}</div>` : ''}
      ${statusText ? `<div class="dndSkillCardDmg" style="color:#d8a4ff;">${statusText}</div>` : ''}
      ${aoeText ? `<div class="dndSkillCardDmg" style="color:#ffb86b;">${aoeText}</div>` : ''}
      ${cleanseText ? `<div class="dndSkillCardDmg" style="color:#7ee8fa;">${cleanseText}</div>` : ''}
      ${ruleText ? `<div class="dndSkillCardRules">${ruleText}</div>` : ''}
      <div class="dndSkillCardAssigned">${assignedText}</div>
      <div class="dndSkillCardBtns"></div>`;
    const btnRow = card.querySelector('.dndSkillCardBtns');
    const canUse = dndYou && !skill.locked && !amIDead() && (dndYou.isDM || skill.classSkill || assignedNames.length === 0 || (skill.assignedIds || []).includes(dndYou.id));
    const useBtn = document.createElement('button');
    useBtn.type = 'button';
    useBtn.className = 'dndSkillUseBtn';
    if (skill.locked) {
      useBtn.textContent = `🔒 ปลดล็อกเลเวล ${skill.level}`;
      useBtn.disabled = true;
      useBtn.classList.add('dndSkillLockedBtn');
    } else if (!skill.locked && amIDead() && !dndYou.isDM) {
      useBtn.textContent = '💀 หมดสติอยู่';
      useBtn.disabled = true;
      useBtn.classList.add('dndSkillLockedBtn');
    } else if (canUse) {
      useBtn.textContent = '🎲 ใช้สกิล';
      useBtn.dataset.readyAt = (dndYou && !dndYou.isDM && skill.readyAt) ? String(skill.readyAt) : '0';
      useBtn.dataset.usesLeft = (dndYou && !dndYou.isDM && skill.maxUses > 0) ? String(skill.usesLeft) : 'inf';
      useBtn.onclick = (ev) => { flashBtn(ev.currentTarget); openDndTargetPicker({ mode: 'skill', skillId: skill.id, isHeal: !!skill.healDie || !!skill.cleanseEnabled, isCleanse: !!skill.cleanseEnabled && !skill.healDie, title: `เลือกเป้าหมายสำหรับ ${skill.name}` }); };
    } else {
      useBtn.textContent = '🔒 ไม่มีสิทธิ์ใช้';
      useBtn.disabled = true;
      useBtn.classList.add('dndSkillLockedBtn');
    }
    btnRow.appendChild(useBtn);
    if (dndYou && dndYou.isDM && !skill.classSkill) {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'dndEditBtn';
      editBtn.textContent = '✏️ แก้ไข/มอบสกิล';
      editBtn.onclick = () => openDndSkillEdit(skill.id);
      btnRow.appendChild(editBtn);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'dndSkillDelBtn';
      delBtn.textContent = 'ลบ';
      delBtn.onclick = () => { if (confirm(`ลบสกิล "${skill.name}"?`)) send({ type: 'dndSkillDelete', skillId: skill.id }); };
      btnRow.appendChild(delBtn);
    }
    list.appendChild(card);
  });
  dndTickSkillCooldowns();
}

// อัปเดตปุ่ม "ใช้สกิล" ทุกวินาที ให้แสดงเวลาคูลดาวน์ที่เหลือ/สถานะใช้ครบแล้ว โดยไม่ต้องรีเรนเดอร์ทั้งลิสต์
function dndTickSkillCooldowns() {
  const now = Date.now();
  document.querySelectorAll('.dndSkillUseBtn').forEach(btn => {
    if (btn.classList.contains('dndSkillLockedBtn')) return;
    if (btn.dataset.usesLeft === '0') { btn.disabled = true; btn.textContent = '🚫 ใช้ครบแล้ว'; return; }
    const readyAt = Number(btn.dataset.readyAt || 0);
    if (readyAt && readyAt > now) {
      btn.disabled = true;
      btn.textContent = `⏳ รออีก ${Math.ceil((readyAt - now) / 1000)} วิ`;
    } else {
      btn.disabled = false;
      btn.textContent = '🎲 ใช้สกิล';
    }
  });
}
setInterval(dndTickSkillCooldowns, 1000);

// ---- DM: จัดการสกิลติดตัว (Passive) ที่สร้างเอง — เพิ่มเติมจากสกิลติดตัวประจำเผ่าที่มีมาให้ในระบบ ----
function fillRaceSelectWithAny(id, selectedKey) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = '<option value="any">🌐 ทุกเผ่าพันธุ์</option>' +
    dndRaces.map(r => `<option value="${r.key}">${r.icon} ${escapeHtml(r.name)}</option>`).join('');
  sel.value = selectedKey || 'any';
}
function dndPassiveEffectSummary(effect) {
  const bits = [];
  if (effect.atk) bits.push(`โจมตี ${effect.atk > 0 ? '+' : ''}${effect.atk}`);
  if (effect.dmg) bits.push(`ดาเมจ ${effect.dmg > 0 ? '+' : ''}${effect.dmg}`);
  if (effect.ac) bits.push(`ป้องกัน ${effect.ac > 0 ? '+' : ''}${effect.ac}`);
  if (effect.hp) bits.push(`HP ${effect.hp > 0 ? '+' : ''}${effect.hp}`);
  if (effect.critRange) bits.push(`คริติคอลกว้างขึ้น ${effect.critRange}`);
  if (effect.gold) bits.push(`ทอง ${effect.gold > 0 ? '+' : ''}${effect.gold}`);
  return bits.length ? bits.join(' · ') : 'ไม่มีผลกลไก';
}
function showDndPassiveFormError(msg) {
  const el = document.getElementById('dndPassiveFormError');
  if (el) el.textContent = msg || '';
}
function renderDndPassiveManageList() {
  const section = document.getElementById('dndPassiveManageSection');
  const isDM = !!(dndYou && dndYou.isDM);
  section.style.display = isDM ? 'block' : 'none';
  if (!isDM) return;
  fillRaceSelectWithAny('dndPassiveRace', document.getElementById('dndPassiveRace').value);
  const emptyHint = document.getElementById('dndPassiveEmptyHint');
  emptyHint.style.display = (dndCustomPassives || []).length ? 'none' : 'block';
  const list = document.getElementById('dndPassiveList');
  list.innerHTML = '';
  (dndCustomPassives || []).forEach(passive => {
    const raceInfo = passive.raceKey === 'any' ? null : dndRaceByKey(passive.raceKey);
    const raceText = passive.raceKey === 'any' ? '🌐 ทุกเผ่าพันธุ์' : `${raceInfo ? raceInfo.icon + ' ' : ''}${raceInfo ? raceInfo.name : passive.raceKey}`;
    const card = document.createElement('div');
    card.className = 'dndSkillCard';
    card.innerHTML = `
      <div class="dndSkillCardTop">
        <span class="dndSkillCardName">${passive.icon || '✨'} ${escapeHtml(passive.name)}</span>
        <span class="dndSkillCardStat">${raceText}</span>
      </div>
      ${passive.desc ? `<div class="dndSkillCardDesc">${escapeHtml(passive.desc)}</div>` : ''}
      <div class="dndSkillCardDmg">${dndPassiveEffectSummary(passive.effect || {})}</div>
      <div class="dndSkillCardBtns"></div>`;
    const btnRow = card.querySelector('.dndSkillCardBtns');
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'dndEditBtn';
    editBtn.textContent = '✏️ แก้ไข';
    editBtn.onclick = () => openDndPassiveEdit(passive.id);
    btnRow.appendChild(editBtn);
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'dndSkillDelBtn';
    delBtn.textContent = 'ลบ';
    delBtn.onclick = () => { if (confirm(`ลบสกิลติดตัว "${passive.name}"?`)) send({ type: 'dndPassiveDelete', passiveId: passive.id }); };
    btnRow.appendChild(delBtn);
    list.appendChild(card);
  });
}
document.getElementById('dndPassiveAddBtn').onclick = (ev) => {
  const name = document.getElementById('dndPassiveName').value.trim();
  if (!name) { showDndPassiveFormError('กรุณาตั้งชื่อสกิลติดตัว'); return; }
  flashBtn(ev.currentTarget);
  showDndPassiveFormError('');
  send({
    type: 'dndPassiveCreate',
    passive: {
      name,
      icon: document.getElementById('dndPassiveIcon').value,
      raceKey: document.getElementById('dndPassiveRace').value,
      desc: document.getElementById('dndPassiveDesc').value,
      effect: {
        atk: document.getElementById('dndPassiveAtk').value,
        dmg: document.getElementById('dndPassiveDmg').value,
        ac: document.getElementById('dndPassiveAc').value,
        hp: document.getElementById('dndPassiveHp').value,
        critRange: document.getElementById('dndPassiveCritRange').value,
        gold: document.getElementById('dndPassiveGold').value,
      },
    },
  });
  document.getElementById('dndPassiveName').value = '';
  document.getElementById('dndPassiveIcon').value = '';
  document.getElementById('dndPassiveDesc').value = '';
  document.getElementById('dndPassiveAtk').value = '0';
  document.getElementById('dndPassiveDmg').value = '0';
  document.getElementById('dndPassiveAc').value = '0';
  document.getElementById('dndPassiveHp').value = '0';
  document.getElementById('dndPassiveCritRange').value = '0';
  document.getElementById('dndPassiveGold').value = '0';
};
let dndPassiveEditTargetId = null;
function openDndPassiveEdit(passiveId) {
  const passive = (dndCustomPassives || []).find(cp => cp.id === passiveId);
  if (!passive) return;
  dndPassiveEditTargetId = passiveId;
  const eff = passive.effect || {};
  document.getElementById('dndPassiveEditName').value = passive.name || '';
  document.getElementById('dndPassiveEditIcon').value = passive.icon || '';
  fillRaceSelectWithAny('dndPassiveEditRace', passive.raceKey);
  document.getElementById('dndPassiveEditDesc').value = passive.desc || '';
  document.getElementById('dndPassiveEditAtk').value = eff.atk || 0;
  document.getElementById('dndPassiveEditDmg').value = eff.dmg || 0;
  document.getElementById('dndPassiveEditAc').value = eff.ac || 0;
  document.getElementById('dndPassiveEditHp').value = eff.hp || 0;
  document.getElementById('dndPassiveEditCritRange').value = eff.critRange || 0;
  document.getElementById('dndPassiveEditGold').value = eff.gold || 0;
  document.getElementById('dndPassiveEditError').textContent = '';
  document.getElementById('dndPassiveEditOverlay').style.display = 'flex';
}
document.getElementById('dndPassiveEditSaveBtn').onclick = (ev) => {
  if (dndPassiveEditTargetId == null) return;
  const name = document.getElementById('dndPassiveEditName').value.trim();
  if (!name) { document.getElementById('dndPassiveEditError').textContent = 'กรุณาตั้งชื่อสกิลติดตัว'; return; }
  flashBtn(ev.currentTarget);
  send({
    type: 'dndPassiveEdit',
    passiveId: dndPassiveEditTargetId,
    passive: {
      name,
      icon: document.getElementById('dndPassiveEditIcon').value,
      raceKey: document.getElementById('dndPassiveEditRace').value,
      desc: document.getElementById('dndPassiveEditDesc').value,
      effect: {
        atk: document.getElementById('dndPassiveEditAtk').value,
        dmg: document.getElementById('dndPassiveEditDmg').value,
        ac: document.getElementById('dndPassiveEditAc').value,
        hp: document.getElementById('dndPassiveEditHp').value,
        critRange: document.getElementById('dndPassiveEditCritRange').value,
        gold: document.getElementById('dndPassiveEditGold').value,
      },
    },
  });
  closeDndModals();
};
document.getElementById('dndPassiveEditCancelBtn').onclick = () => closeDndModals();

// ---- DM: หน้าต่างแก้ไขสกิลที่มีอยู่แล้ว (คูลดาวน์/จำนวนครั้ง/มอบให้ใคร) เปลี่ยนได้ทุกเมื่อ ----
let dndSkillEditTargetId = null;
let dndSkillEditAssignSelected = new Set();
function renderDndSkillEditAssignBox() {
  const box = document.getElementById('dndSkillEditAssignBox');
  box.innerHTML = dndPlayersList.map(p => {
    const label = escapeHtml(p.character.charName || p.name);
    const checked = dndSkillEditAssignSelected.has(p.id) ? 'checked' : '';
    return `<label class="dndAssignChip"><input type="checkbox" data-id="${p.id}" ${checked}> ${label}${p.isDM ? ' (DM)' : ''}</label>`;
  }).join('');
  box.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.onchange = () => {
      const id = Number(cb.dataset.id);
      if (cb.checked) dndSkillEditAssignSelected.add(id); else dndSkillEditAssignSelected.delete(id);
    };
  });
}
function openDndSkillEdit(skillId) {
  const skill = dndSkills.find(s => s.id === skillId);
  if (!skill) return;
  dndSkillEditTargetId = skillId;
  document.getElementById('dndSkillEditTitle').textContent = `แก้ไขสกิล (DM) — ${skill.name}`;
  document.getElementById('dndSkillEditName').value = skill.name || '';
  document.getElementById('dndSkillEditStat').value = skill.stat || '';
  document.getElementById('dndSkillEditDesc').value = skill.desc || '';
  document.getElementById('dndSkillEditDmgDie').value = String(skill.dmgDie || 0);
  document.getElementById('dndSkillEditDmgCount').value = skill.dmgCount || 1;
  document.getElementById('dndSkillEditDmgMod').value = skill.dmgMod || 0;
  document.getElementById('dndSkillEditHealDie').value = String(skill.healDie || 0);
  document.getElementById('dndSkillEditHealCount').value = skill.healCount || 1;
  document.getElementById('dndSkillEditHealMod').value = skill.healMod || 0;
  document.getElementById('dndSkillEditStatusName').value = skill.statusName || '';
  document.getElementById('dndSkillEditStatusNote').value = skill.statusNote || '';
  document.getElementById('dndSkillEditAoeRadius').value = skill.aoeRadius || 0;
  document.getElementById('dndSkillEditCleanseEnabled').checked = !!skill.cleanseEnabled;
  document.getElementById('dndSkillEditCleanseName').value = skill.cleanseName || '';
  document.getElementById('dndSkillEditCooldown').value = skill.cooldownSec || 0;
  document.getElementById('dndSkillEditMaxUses').value = skill.maxUses || 0;
  dndSkillEditAssignSelected = new Set(skill.assignedIds || []);
  renderDndSkillEditAssignBox();
  document.getElementById('dndSkillEditError').textContent = '';
  document.getElementById('dndSkillEditOverlay').style.display = 'flex';
}
document.getElementById('dndSkillEditCancelBtn').onclick = () => {
  document.getElementById('dndSkillEditOverlay').style.display = 'none';
  dndSkillEditTargetId = null;
};
document.getElementById('dndSkillEditSaveBtn').onclick = (ev) => {
  if (dndSkillEditTargetId == null) return;
  const name = document.getElementById('dndSkillEditName').value.trim();
  if (!name) { document.getElementById('dndSkillEditError').textContent = 'กรุณาตั้งชื่อสกิล'; return; }
  flashBtn(ev.currentTarget);
  send({
    type: 'dndSkillEdit',
    skillId: dndSkillEditTargetId,
    skill: {
      name,
      stat: document.getElementById('dndSkillEditStat').value,
      desc: document.getElementById('dndSkillEditDesc').value,
      damage: {
        die: document.getElementById('dndSkillEditDmgDie').value,
        count: document.getElementById('dndSkillEditDmgCount').value,
        mod: document.getElementById('dndSkillEditDmgMod').value,
      },
      heal: {
        die: document.getElementById('dndSkillEditHealDie').value,
        count: document.getElementById('dndSkillEditHealCount').value,
        mod: document.getElementById('dndSkillEditHealMod').value,
      },
      status: {
        name: document.getElementById('dndSkillEditStatusName').value,
        note: document.getElementById('dndSkillEditStatusNote').value,
      },
      aoe: {
        radius: document.getElementById('dndSkillEditAoeRadius').value,
      },
      cleanse: {
        enabled: document.getElementById('dndSkillEditCleanseEnabled').checked,
        name: document.getElementById('dndSkillEditCleanseName').value,
      },
      cooldownSec: document.getElementById('dndSkillEditCooldown').value,
      maxUses: document.getElementById('dndSkillEditMaxUses').value,
      assignedIds: Array.from(dndSkillEditAssignSelected),
    },
  });
  document.getElementById('dndSkillEditOverlay').style.display = 'none';
  dndSkillEditTargetId = null;
};

function sendDndChat() {
  const input = document.getElementById('dndChatInput');
  const text = input.value.trim();
  if (!text) return;
  send({ type: 'dndChat', text });
  input.value = '';
}
document.getElementById('dndChatSendBtn').onclick = sendDndChat;
document.getElementById('dndChatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendDndChat(); });

function appendDndChat(name, text) {
  const el = document.getElementById('dndLog');
  const d = document.createElement('div');
  d.innerHTML = `<span class="chatName">💬 ${escapeHtml(name)}:</span> ${escapeHtml(text)}`;
  el.appendChild(d);
  el.scrollTop = el.scrollHeight;
}

// ---- แอนิเมชันทอยลูกเต๋าตอนโจมตี/ใช้สกิลใส่มอนสเตอร์หรือผู้เล่น ----
// การ์ดแต่ละใบผูกกับ "คนที่ทอย" คนเดียว (ผู้เล่น/มอนสเตอร์) ค้างอยู่บนจอตลอด จะเปลี่ยนก็ต่อเมื่อคนนั้นทอยใหม่เท่านั้น
let dndDiceAnimLayer = null;
let dndDiceCards = {}; // atkKey -> การ์ด DOM ล่าสุดของคนนั้น
function dndGetDiceAnimLayer() {
  if (!dndDiceAnimLayer || !document.body.contains(dndDiceAnimLayer)) {
    dndDiceAnimLayer = document.createElement('div');
    dndDiceAnimLayer.id = 'dndDiceAnimLayer';
    document.body.appendChild(dndDiceAnimLayer);
    dndDiceCards = {};
  }
  return dndDiceAnimLayer;
}
function dndModText(mod) {
  const n = Number(mod) || 0;
  return n ? (n > 0 ? ` +${n}` : ` ${n}`) : '';
}
function dndSpinFace(container, sides, finalValue, spinMs, extraClass) {
  const face = document.createElement('span');
  face.className = 'dndDiceFace spinning' + (extraClass ? ' ' + extraClass : '');
  face.textContent = '?';
  container.appendChild(face);
  const spinTimer = setInterval(() => {
    face.textContent = String(1 + Math.floor(Math.random() * Math.max(2, sides)));
  }, 60);
  setTimeout(() => {
    clearInterval(spinTimer);
    face.classList.remove('spinning');
    face.classList.add('landed');
    face.textContent = String(finalValue);
  }, spinMs);
}
function playDndAttackAnim(data) {
  const layer = dndGetDiceAnimLayer();
  const key = data.atkKey || data.attacker;
  let toast = dndDiceCards[key];
  if (!toast || !layer.contains(toast)) {
    toast = document.createElement('div');
    toast.className = 'dndDiceToast';
    layer.appendChild(toast);
    dndDiceCards[key] = toast;
  }
  toast.innerHTML = '';
  // เล่นแอนิเมชัน "เด้ง" สั้น ๆ ทุกครั้งที่คนเดิมทอยใหม่ ให้เห็นชัดว่าค่าเปลี่ยน
  toast.style.animation = 'none';
  void toast.offsetWidth;
  toast.style.animation = 'dndToastPop 0.35s ease';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'dndDiceCloseBtn';
  closeBtn.textContent = '✕';
  closeBtn.title = 'ปิด';
  closeBtn.onclick = () => {
    toast.remove();
    if (dndDiceCards[key] === toast) delete dndDiceCards[key];
  };
  toast.appendChild(closeBtn);

  let head;
  if (data.skillName) head = `✨ ${data.attacker} ใช้ "${data.skillName}" ใส่ ${data.target}`;
  else if (data.attackName) head = `👹 "${data.attacker}" ใช้ท่า "${data.attackName}" ใส่ ${data.target}`;
  else head = `⚔️ ${data.attacker} โจมตีปกติใส่ ${data.target}`;
  const headEl = document.createElement('div');
  headEl.className = 'dndDiceHead';
  headEl.textContent = head;
  toast.appendChild(headEl);

  const hasAttack = data.attackRoll !== undefined && data.attackRoll !== null;
  // hit === false คือระบบหลบ (ทอยไม่ถึง AC เป้าหมาย) — hit === undefined คือสกิลที่ไม่มีการทอยเข้าปะทะ (เอฟเฟกต์อัตโนมัติ)
  const hasDamage = data.damage !== undefined && data.damage !== null && data.dmgDie;

  if (hasAttack) {
    const row = document.createElement('div');
    row.className = 'dndDiceRow';
    const lbl = document.createElement('span');
    lbl.textContent = `🎯 1d20${dndModText(data.attackMod)} =`;
    row.appendChild(lbl);
    toast.appendChild(row);
    const acText = data.targetAC != null ? ` (AC ${data.targetAC})` : '';
    dndSpinFace(row, 20, `${data.attackRoll} = ${data.attackTotal}${acText}`, 650);
    if (data.hit === true || data.hit === false) {
      setTimeout(() => {
        if (!layer.contains(toast)) return;
        const tag = document.createElement('div');
        if (data.fumble) { tag.className = 'dndDiceResultTag dndResultMiss'; tag.textContent = '💨 พลาดสุด ๆ'; }
        else if (!data.hit) { tag.className = 'dndDiceResultTag dndResultMiss'; tag.textContent = '🛡️ พลาด! หลบได้'; }
        else if (data.crit) { tag.className = 'dndDiceResultTag dndResultCrit'; tag.textContent = '🎯 คริติคอล!'; }
        else { tag.className = 'dndDiceResultTag dndResultHit'; tag.textContent = '✅ โดน'; }
        toast.appendChild(tag);
      }, 650);
    }
  }
  if (hasDamage) {
    setTimeout(() => {
      if (!layer.contains(toast)) return; // การ์ดถูกแทนที่ไปแล้วระหว่างรอ อย่าแทรกซ้อน
      const row = document.createElement('div');
      row.className = 'dndDiceRow';
      const lbl = document.createElement('span');
      lbl.textContent = `💥 ${data.dmgCount}d${data.dmgDie}${dndModText(data.dmgMod)} =`;
      row.appendChild(lbl);
      toast.appendChild(row);
      dndSpinFace(row, data.dmgDie, data.damage, 650, 'dndDamageFace');
    }, hasAttack ? 700 : 0);
  }
}

function myDndEntry() {
  return dndPlayersList.find(p => dndYou && p.id === dndYou.id);
}

// ---- แอนิเมชันโจมตีบนแผนที่ (ทั้งผู้เล่นและมอนสเตอร์): กระสุนพุ่งจากผู้โจมตีไปเป้าหมาย + เอฟเฟกต์กระทบ/สั่นเมื่อโดน ----
// ใช้พิกัด token เดียวกับที่วาดบนแผนที่ (หน่วย % 0-100) จึงไม่ต้องคำนวณพิกเซลใด ๆ เลย ทำงานได้แม้แผนที่ยังไม่แสดงผลบนจอ
function dndGetMapFxLayer() {
  const canvas = document.getElementById('dndMapCanvas');
  if (!canvas) return null;
  let layer = document.getElementById('dndMapFxLayer');
  if (!layer || layer.parentElement !== canvas) {
    layer = document.createElement('div');
    layer.id = 'dndMapFxLayer';
    canvas.appendChild(layer);
  }
  return layer;
}
function dndTokenPosPct(tokenId) {
  if (tokenId == null) return null;
  const t = dndTokens.find(tt => tt.id === Number(tokenId));
  return t ? { x: t.x, y: t.y } : null;
}
function dndFlashToken(tokenId, cls, ms) {
  const el = dndTokenEls[tokenId];
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth; // รีสตาร์ท animation ให้เล่นใหม่ทุกครั้งแม้จะเป็นคลาสเดิม
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms || 500);
}
function dndSpawnFloatNum(layer, pos, text, extraClass) {
  const el = document.createElement('div');
  el.className = 'dndAtkFloatNum' + (extraClass ? ' ' + extraClass : '');
  el.style.left = pos.x + '%';
  el.style.top = pos.y + '%';
  el.textContent = text;
  layer.appendChild(el);
  requestAnimationFrame(() => el.classList.add('dndFxFloat'));
  setTimeout(() => el.remove(), 950);
}
function playDndMapAttackAnim(data) {
  const layer = dndGetMapFxLayer();
  if (!layer) return;
  const atkPos = dndTokenPosPct(data.atkTokenId);
  const tgtPos = dndTokenPosPct(data.tgtTokenId);

  // ผู้โจมตี (ผู้เล่นหรือมอนสเตอร์) เด้งตัวตอนออกท่า — เห็นได้ชัดว่าใครเป็นคนลงมือ
  if (data.atkTokenId != null) dndFlashToken(data.atkTokenId, 'dndFxAttacking', 320);

  // ยิงเส้นแสง/กระสุนจากผู้โจมตีไปยังเป้าหมาย ถ้ารู้ตำแหน่งทั้งคู่บนแผนที่ปัจจุบัน
  if (atkPos && tgtPos && data.atkTokenId !== data.tgtTokenId) {
    const proj = document.createElement('div');
    proj.className = 'dndAtkProjectile';
    proj.style.left = atkPos.x + '%';
    proj.style.top = atkPos.y + '%';
    layer.appendChild(proj);
    requestAnimationFrame(() => {
      proj.style.transition = 'left 0.34s ease-out, top 0.34s ease-out';
      proj.classList.add('dndFxFly');
      proj.style.left = tgtPos.x + '%';
      proj.style.top = tgtPos.y + '%';
    });
    setTimeout(() => proj.remove(), 420);
  }

  const impactDelay = (atkPos && tgtPos) ? 360 : 0;
  setTimeout(() => {
    if (!tgtPos || data.tgtTokenId == null) return;
    const burst = document.createElement('div');
    burst.className = 'dndAtkBurst dndFxBurst' + ((data.fumble || data.hit === false) ? ' dndFxBurstMiss' : (data.crit ? ' dndFxBurstCrit' : ''));
    burst.style.left = tgtPos.x + '%';
    burst.style.top = tgtPos.y + '%';
    layer.appendChild(burst);
    setTimeout(() => burst.remove(), 450);

    if (data.fumble || data.hit === false) {
      dndFlashToken(data.tgtTokenId, 'dndFxMiss', 380);
      dndSpawnFloatNum(layer, tgtPos, data.fumble ? '💨 พลาดสุด ๆ' : '🛡️ หลบ!', 'dndFxFloatMiss');
    } else if (data.damage != null) {
      dndFlashToken(data.tgtTokenId, 'dndFxHit', 420);
      dndSpawnFloatNum(layer, tgtPos, (data.crit ? '💥 -' : '-') + data.damage, data.crit ? 'dndFxFloatCrit' : '');
    } else if (data.hit === true) {
      dndFlashToken(data.tgtTokenId, 'dndFxHit', 420);
    }

    // ---- AOE: ขยายวงแหวนตามรัศมีที่ตั้งไว้ (ประมาณสัดส่วนคร่าว ๆ จากความกว้างแผนที่) + กระพริบ/เด้งตัวเลขให้ทุกเป้าหมายที่โดนลูกหลง ----
    if (data.aoeRadius > 0) {
      const ring = document.createElement('div');
      ring.className = 'dndAtkAoeRing dndFxAoeRing';
      const canvas = document.getElementById('dndMapCanvas');
      const wpx = canvas ? canvas.clientWidth : 600;
      const sizePx = Math.max(20, (data.aoeRadius / 100) * wpx * 2);
      ring.style.width = sizePx + 'px';
      ring.style.height = sizePx + 'px';
      ring.style.left = tgtPos.x + '%';
      ring.style.top = tgtPos.y + '%';
      layer.appendChild(ring);
      setTimeout(() => ring.remove(), 600);

      (data.aoeHits || []).forEach(hitInfo => {
        const pos = dndTokenPosPct(hitInfo.tokenId);
        if (!pos) return;
        setTimeout(() => {
          dndFlashToken(hitInfo.tokenId, 'dndFxHit', 400);
          dndSpawnFloatNum(layer, pos, '-' + hitInfo.damage, 'dndFxFloatAoe');
        }, 120);
      });
    }
  }, impactDelay);
}

// ---- shared ability-score math (mirrors server.js so the UI can show live ranges before saving) ----
function dndAbilityMod(score) { return Math.floor((score - 10) / 2); }
function dndAcRange(dexMod, armor) {
  let min, max;
  if (armor === 'light') { min = 10 + dexMod; max = 14 + dexMod; }
  else if (armor === 'medium') { min = 12 + Math.min(dexMod, 2); max = 16 + Math.min(dexMod, 2); }
  else { min = 14; max = 18; }
  min = Math.max(10, Math.min(25, min));
  max = Math.max(min + 1, Math.min(25, max));
  return { min, max };
}
function dndHpRange(level, conMod, hitDie) {
  const min = Math.max(1, level * (1 + conMod));
  const max = Math.max(min, level * (hitDie + conMod));
  return { min, max };
}
function dndRaceByKey(k) { return dndRaces.find(r => r.key === k); }
function dndClassByKey(k) { return dndClasses.find(c => c.key === k); }
// ---- อวาตาร์ตัวละคร: SVG paperdoll ง่ายๆ สีตามคลาส + ลักษณะอิงตามเผ่าพันธุ์ + แต่งตามอุปกรณ์ที่สวมใส่จริง ----
const DND_CLASS_AVATAR_COLOR = {
  fighter: '#c0392b', wizard: '#8e44ad', cleric: '#f1c40f', rogue: '#34495e',
  ranger: '#27ae60', barbarian: '#a0522d', paladin: '#ecf0f1', bard: '#e67e22',
};
// สีผิว + ขนาดตัว + ลักษณะเด่นของแต่ละเผ่าพันธุ์ (เรียบง่าย แค่พอแยกออกว่าเป็นเผ่าไหน)
const DND_RACE_AVATAR = {
  human:      { skin: '#f0c8a0', scale: 1,    extra: null },
  elf:        { skin: '#f3d9b8', scale: 1.05, extra: 'ears' },
  dwarf:      { skin: '#e8b98c', scale: 0.85, extra: 'beard' },
  halfling:   { skin: '#f0c8a0', scale: 0.72, extra: null },
  orc:        { skin: '#8fae6b', scale: 1.12, extra: null },
  tiefling:   { skin: '#c97b6b', scale: 1,    extra: 'horns' },
  gnome:      { skin: '#f0c8a0', scale: 0.68, extra: 'hat' },
  dragonborn: { skin: '#7a9a7a', scale: 1.08, extra: null },
};
function dndAvatarSlotFilled(equipment, slot) {
  return !!(equipment && equipment[slot] && equipment[slot].name);
}
// ---- ทรงผมและสีหน้าของตัวละคร วาดทับหัวกลม (cx=60 cy=34 r=24) ----
function dndHairSVG(hair, color) {
  const cap = `<path d="M36 32 Q36 8 60 8 Q84 8 84 32 L84 22 Q60 2 36 22 Z" fill="${color}"/>`;
  switch (hair) {
    case 'bald': return '';
    case 'mohawk': return `<path d="M53 2 L67 2 L63 26 L57 26 Z" fill="${color}"/>`;
    case 'long': return cap
      + `<path d="M34 24 Q30 50 34 66 L42 66 Q38 44 40 24 Z" fill="${color}"/>`
      + `<path d="M86 24 Q90 50 86 66 L78 66 Q82 44 80 24 Z" fill="${color}"/>`;
    case 'ponytail': return cap
      + `<path d="M84 26 Q100 30 96 54 Q94 62 86 58 Q92 40 82 28 Z" fill="${color}"/>`;
    case 'short':
    default: return cap;
  }
}
function dndFaceFeaturesSVG(face) {
  const ink = '#2b2b2b';
  switch (face) {
    case 'smile': return `<circle cx="52" cy="30" r="2.4" fill="${ink}"/><circle cx="68" cy="30" r="2.4" fill="${ink}"/><path d="M50 40 Q60 48 70 40" stroke="${ink}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    case 'serious': return `<rect x="47" y="27" width="8" height="2.4" rx="1.2" fill="${ink}"/><rect x="65" y="27" width="8" height="2.4" rx="1.2" fill="${ink}"/><circle cx="52" cy="32" r="2" fill="${ink}"/><circle cx="68" cy="32" r="2" fill="${ink}"/><path d="M51 42 L69 42" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/>`;
    case 'surprised': return `<circle cx="52" cy="30" r="2.8" fill="${ink}"/><circle cx="68" cy="30" r="2.8" fill="${ink}"/><ellipse cx="60" cy="42" rx="4" ry="5" fill="${ink}"/>`;
    case 'wink': return `<path d="M48 30 L56 30" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/><circle cx="68" cy="30" r="2.4" fill="${ink}"/><path d="M50 40 Q60 47 70 39" stroke="${ink}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    case 'neutral':
    default: return `<circle cx="52" cy="30" r="2.2" fill="${ink}"/><circle cx="68" cy="30" r="2.2" fill="${ink}"/><path d="M51 41 L69 41" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/>`;
  }
}
let dndAvatarSvgSeq = 0;
function dndBuildAvatarSVG(c, w, h) {
  w = w || 120; h = h || 160;
  const eq = (c && c.equipment) || {};
  const ap = (c && c.appearance) || { hair: 'short', hairColor: DND_HAIR_COLOR_LIST[0], face: 'neutral' };
  const bodyColor = DND_CLASS_AVATAR_COLOR[c && c.classKey] || '#7f8c8d';
  const raceInfo = c ? dndRaceByKey(c.raceKey) : null;
  const raceAv = DND_RACE_AVATAR[c && c.raceKey] || DND_RACE_AVATAR.human;
  const hasWeapon = dndAvatarSlotFilled(eq, 'weapon');
  const weaponIcon = hasWeapon && eq.weapon && eq.weapon.icon;
  const armorItem = eq.armor;
  const armorBroken = dndEquipSlotBrokenClient(armorItem);
  const hasArmor = dndAvatarSlotFilled(eq, 'armor') && !armorBroken;
  const armorIcon = hasArmor && armorItem && armorItem.icon;
  const hasShoes = dndAvatarSlotFilled(eq, 'shoes');
  const shoesIcon = hasShoes && eq.shoes && eq.shoes.icon;
  const hasAcc = dndAvatarSlotFilled(eq, 'accessory');
  const accIcon = hasAcc && eq.accessory && eq.accessory.icon;
  const skin = raceAv.skin;
  const uid = 'av' + (dndAvatarSvgSeq++); // กันชื่อ id ของ clipPath ชนกันเวลามีอวตารหลายตัวในหน้าเดียวกัน
  let extraHead = '';
  if (raceAv.extra === 'ears') extraHead = `<polygon points="36,30 26,22 34,42" fill="${skin}"/><polygon points="84,30 94,22 86,42" fill="${skin}"/>`;
  else if (raceAv.extra === 'beard') extraHead = `<rect x="48" y="46" width="24" height="14" rx="6" fill="#c9c9c9"/>`;
  else if (raceAv.extra === 'horns') extraHead = `<polygon points="46,14 40,0 50,10" fill="#3a2a2a"/><polygon points="74,14 80,0 70,10" fill="#3a2a2a"/>`;
  else if (raceAv.extra === 'hat') extraHead = `<polygon points="40,14 60,-12 80,14" fill="#5b3fae"/>`;
  const hairSvg = raceAv.extra === 'hat' ? '' : dndHairSVG(ap.hair, ap.hairColor);
  return `<svg viewBox="0 -20 120 180" width="${w}" height="${h}" class="dndAvatarSvg">
    <defs>
      <clipPath id="${uid}armor"><rect x="36" y="58" width="48" height="50" rx="14"/></clipPath>
      <clipPath id="${uid}weapon"><circle cx="94" cy="90" r="11"/></clipPath>
      <clipPath id="${uid}acc"><circle cx="60" cy="68" r="9"/></clipPath>
      <clipPath id="${uid}shoes"><rect x="40" y="134" width="40" height="14" rx="5"/></clipPath>
    </defs>
    <g transform="translate(60,90) scale(${raceAv.scale}) translate(-60,-90)">
      <ellipse cx="60" cy="152" rx="30" ry="6" fill="#000" opacity="0.18"/>
      <rect x="42" y="104" width="14" height="38" rx="5" fill="#3a3f4b"/>
      <rect x="64" y="104" width="14" height="38" rx="5" fill="#3a3f4b"/>
      ${hasShoes
        ? (shoesIcon
          ? `<image href="${shoesIcon}" x="38" y="132" width="44" height="18" preserveAspectRatio="xMidYMid slice" clip-path="url(#${uid}shoes)"/>`
          : `<rect x="40" y="136" width="18" height="10" rx="4" fill="#6b4423"/><rect x="62" y="136" width="18" height="10" rx="4" fill="#6b4423"/>`)
        : `<circle cx="49" cy="141" r="6" fill="${skin}"/><circle cx="71" cy="141" r="6" fill="${skin}"/>`}
      <rect x="24" y="66" width="12" height="40" rx="6" fill="${skin}"/>
      <rect x="84" y="66" width="12" height="40" rx="6" fill="${skin}"/>
      <rect x="36" y="58" width="48" height="50" rx="14" fill="${hasArmor ? bodyColor : '#cfd6de'}"/>
      ${armorIcon ? `<image href="${armorIcon}" x="34" y="56" width="52" height="54" preserveAspectRatio="xMidYMid slice" clip-path="url(#${uid}armor)"/>` : ''}
      ${hasArmor && !armorIcon ? `<rect x="36" y="58" width="48" height="14" rx="8" fill="#000" opacity="0.14"/>` : ''}
      ${armorBroken ? `<text x="60" y="88" font-size="16" text-anchor="middle">💔</text>` : ''}
      <circle cx="60" cy="34" r="24" fill="${skin}"/>
      ${dndFaceFeaturesSVG(ap.face)}
      ${hairSvg}
      ${extraHead}
      ${raceInfo ? `<text x="60" y="14" font-size="14" text-anchor="middle">${raceInfo.icon}</text>` : ''}
      ${hasAcc
        ? (accIcon
          ? `<image href="${accIcon}" x="51" y="59" width="18" height="18" preserveAspectRatio="xMidYMid slice" clip-path="url(#${uid}acc)"/>`
          : `<text x="60" y="68" font-size="14" text-anchor="middle">✨</text>`)
        : ''}
      ${hasWeapon
        ? (weaponIcon
          ? `<image href="${weaponIcon}" x="83" y="79" width="22" height="22" preserveAspectRatio="xMidYMid slice" clip-path="url(#${uid}weapon)"/>`
          : `<text x="94" y="90" font-size="22" text-anchor="middle">🗡️</text>`)
        : `<circle cx="94" cy="90" r="10" fill="none" stroke="#8899aa" stroke-width="1.5" stroke-dasharray="3,3"/>`}
    </g>
  </svg>`;
}
function dndCreateFinalStats() {
  const race = dndCreateSelectedRace ? dndRaceByKey(dndCreateSelectedRace) : null;
  const cls = dndCreateSelectedClass ? dndClassByKey(dndCreateSelectedClass) : null;
  const stats = {};
  for (const k of Object.keys(DND_STAT_LABELS)) {
    const rb = (race && race.bonus[k]) || 0;
    const cb = (cls && cls.bonus[k]) || 0;
    stats[k] = dndCreateAlloc[k] + rb + cb;
  }
  return stats;
}

// ---- ตัวเลือกการ์ด เผ่าพันธุ์ / คลาส ----
function bonusText(bonus) {
  return Object.entries(bonus).map(([k, v]) => `+${v} ${DND_STAT_LABELS[k]}`).join(' ');
}
function renderPickCards(containerId, items, selectedKey, onPick) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'dndPickCard' + (item.key === selectedKey ? ' selected' : '');
    card.innerHTML = `
      <div class="dndPickCardIcon">${item.icon}</div>
      <div class="dndPickCardName">${escapeHtml(item.name)}</div>
      <div class="dndPickCardDesc">${escapeHtml(item.desc)}</div>
      <div class="dndPickCardBonus">${bonusText(item.bonus)}</div>`;
    card.onclick = () => onPick(item.key);
    el.appendChild(card);
  });
}

function renderPassiveCards(containerId, items, selectedKey, onPick) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'dndPickCard' + (item.key === selectedKey ? ' selected' : '');
    card.innerHTML = `
      <div class="dndPickCardIcon">${item.icon || '✨'}</div>
      <div class="dndPickCardName">${escapeHtml(item.name)}</div>
      <div class="dndPickCardDesc">${escapeHtml(item.desc)}</div>`;
    card.onclick = () => onPick(item.key);
    el.appendChild(card);
  });
}
function dndPassivesForRace(raceKey) {
  const builtin = (dndPassives && dndPassives[raceKey]) || [];
  const custom = (dndCustomPassives || []).filter(cp => cp.raceKey === raceKey || cp.raceKey === 'any');
  return builtin.concat(custom);
}
function dndPassiveByKey(raceKey, passiveKey) { return dndPassivesForRace(raceKey).find(p => p.key === passiveKey) || null; }
function renderCreatePassiveCards() {
  const hint = document.getElementById('dndPassiveHint');
  if (!dndCreateSelectedRace) {
    hint.textContent = '(เลือกเผ่าพันธุ์ก่อน)';
    document.getElementById('dndPassiveCards').innerHTML = '';
    return;
  }
  hint.textContent = '(เลือกได้ 1 อย่าง ล็อกไปพร้อมการ์ดตัวละคร)';
  renderPassiveCards('dndPassiveCards', dndPassivesForRace(dndCreateSelectedRace), dndCreateSelectedPassive, dndPickPassive);
}
function dndPickPassive(key) {
  dndCreateSelectedPassive = key;
  renderCreatePassiveCards();
  validateCreateForm();
}

function renderStatAllocGrid() {
  const el = document.getElementById('dndStatAllocGrid');
  el.innerHTML = '';
  const finalStats = dndCreateFinalStats();
  const race = dndCreateSelectedRace ? dndRaceByKey(dndCreateSelectedRace) : null;
  const cls = dndCreateSelectedClass ? dndClassByKey(dndCreateSelectedClass) : null;
  const spent = Object.values(dndCreateAlloc).reduce((sum, v) => sum + dndPointBuyCostOf(v), 0);
  const left = dndPointBuyBudget - spent;
  Object.keys(DND_STAT_LABELS).forEach(k => {
    const row = document.createElement('div');
    row.className = 'dndStatAllocRow';
    const rb = (race && race.bonus[k]) || 0;
    const cb = (cls && cls.bonus[k]) || 0;
    const nextStepCost = dndPointBuyStepCost(dndCreateAlloc[k]);
    row.innerHTML = `
      <span class="dndStatAllocLabel">${DND_STAT_LABELS[k]}</span>
      <button type="button" data-act="minus">−</button>
      <span class="dndStatAllocVal">${finalStats[k]}</span>
      <button type="button" data-act="plus">+</button>
      <span class="dndStatAllocBreakdown">${dndCreateAlloc[k]} แต้ม (ใช้ ${dndPointBuyCostOf(dndCreateAlloc[k])} พอย)${rb ? ' + ' + rb + ' เผ่า' : ''}${cb ? ' + ' + cb + ' คลาส' : ''}${left >= nextStepCost ? ` · เพิ่มอีก 1 ใช้ ${nextStepCost} พอย` : ''}</span>`;
    row.querySelector('[data-act="minus"]').disabled = dndCreateAlloc[k] <= dndPointBuyMin;
    row.querySelector('[data-act="plus"]').disabled = left < nextStepCost;
    dndBindHoldRepeat(row.querySelector('[data-act="minus"]'), () => { dndCreateAlloc[k] = Math.max(dndPointBuyMin, dndCreateAlloc[k] - 1); renderStatAllocGrid(); updateCreateHints(); validateCreateForm(); });
    dndBindHoldRepeat(row.querySelector('[data-act="plus"]'), () => {
      const stepCost = dndPointBuyStepCost(dndCreateAlloc[k]);
      const curSpent = Object.values(dndCreateAlloc).reduce((sum, v) => sum + dndPointBuyCostOf(v), 0);
      if (dndPointBuyBudget - curSpent >= stepCost) dndCreateAlloc[k] += 1;
      renderStatAllocGrid(); updateCreateHints(); validateCreateForm();
    });
    el.appendChild(row);
  });
  const pointsLeftEl = document.getElementById('dndPointsLeft');
  pointsLeftEl.textContent = left;
  pointsLeftEl.className = left === 0 ? 'zero' : '';
}

function updateCreateHints() {
  const cls = dndCreateSelectedClass ? dndClassByKey(dndCreateSelectedClass) : null;
  const finalStats = dndCreateFinalStats();
  const acHint = document.getElementById('dndAcRangeHint');
  const hpHint = document.getElementById('dndHpRangeHint');
  const rollAcBtn = document.getElementById('dndRollAcBtn');
  const rollHpBtn = document.getElementById('dndRollHpBtn');
  const acInput = document.getElementById('dndCreateAc');
  const hpInput = document.getElementById('dndCreateMaxHp');
  if (!cls) {
    acHint.textContent = '(เลือกคลาสก่อน)';
    hpHint.textContent = '(เลือกคลาสก่อน)';
    if (rollAcBtn) rollAcBtn.disabled = true;
    if (rollHpBtn) rollHpBtn.disabled = true;
    return;
  }
  const dexMod = dndAbilityMod(finalStats.dex);
  const conMod = dndAbilityMod(finalStats.con);
  const acR = dndAcRange(dexMod, cls.armor);
  const hpR = dndHpRange(1, conMod, cls.hitDie);
  acHint.textContent = `(ช่วง ${acR.min}-${acR.max})`;
  hpHint.textContent = `(ช่วง ${hpR.min}-${hpR.max})`;
  if (rollAcBtn) rollAcBtn.disabled = false;
  if (rollHpBtn) rollHpBtn.disabled = false;

  // ปรับค่า AC/HP ที่กรอกไว้แล้วให้อยู่ในช่วงที่ถูกต้องเสมอเมื่อสเตตัสเปลี่ยน
  // (กันปัญหาเดิม: กด +/- เปลี่ยน DEX/CON แล้วตัวเลข AC/HP ที่กรอกไว้ไม่ขยับตาม)
  if (acInput && acInput.value !== '') {
    const cur = Math.round(Number(acInput.value));
    const v = Math.max(acR.min, Math.min(acR.max, Number.isFinite(cur) ? cur : acR.min));
    if (String(v) !== acInput.value) acInput.value = v;
  }
  if (hpInput && hpInput.value !== '') {
    const cur = Math.round(Number(hpInput.value));
    const v = Math.max(hpR.min, Math.min(hpR.max, Number.isFinite(cur) ? cur : hpR.min));
    if (String(v) !== hpInput.value) hpInput.value = v;
  }
}
function dndRandInt(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
document.getElementById('dndRollAcBtn').onclick = (ev) => {
  const cls = dndCreateSelectedClass ? dndClassByKey(dndCreateSelectedClass) : null;
  if (!cls) return;
  flashBtn(ev.currentTarget);
  const dexMod = dndAbilityMod(dndCreateFinalStats().dex);
  const acR = dndAcRange(dexMod, cls.armor);
  document.getElementById('dndCreateAc').value = dndRandInt(acR.min, acR.max);
  validateCreateForm();
};
document.getElementById('dndRollHpBtn').onclick = (ev) => {
  const cls = dndCreateSelectedClass ? dndClassByKey(dndCreateSelectedClass) : null;
  if (!cls) return;
  flashBtn(ev.currentTarget);
  const conMod = dndAbilityMod(dndCreateFinalStats().con);
  const hpR = dndHpRange(1, conMod, cls.hitDie);
  document.getElementById('dndCreateMaxHp').value = dndRandInt(hpR.min, hpR.max);
  validateCreateForm();
};

function showDndCreateError(msg) {
  const el = document.getElementById('dndCreateError');
  if (el) el.textContent = msg || '';
}
let dndErrorToastTimer = null;
function showDndErrorToast(msg) {
  if (!msg) return;
  const el = document.getElementById('dndErrorToast');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(dndErrorToastTimer);
  dndErrorToastTimer = setTimeout(() => { el.style.display = 'none'; }, 3500);
}

function validateCreateForm() {
  const name = document.getElementById('dndCreateName').value.trim();
  const spent = Object.values(dndCreateAlloc).reduce((sum, v) => sum + dndPointBuyCostOf(v), 0);
  const ok = !!name && !!dndCreateSelectedRace && !!dndCreateSelectedPassive && !!dndCreateSelectedClass && spent === dndPointBuyBudget;
  document.getElementById('dndCreateSaveBtn').disabled = !ok;
  return ok;
}

function initDndCreateForm() {
  dndCreateSelectedRace = null;
  dndCreateSelectedClass = null;
  dndCreateSelectedPassive = null;
  dndCreateAlloc = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 };
  dndCreateAppearance = { hair: 'short', hairColor: DND_HAIR_COLOR_LIST[0], face: 'neutral' };
  const me = myDndEntry();
  document.getElementById('dndCreateName').value = (me && me.character && me.character.charName) || '';
  document.getElementById('dndCreateAc').value = '';
  document.getElementById('dndCreateMaxHp').value = '';
  document.getElementById('dndCreateInventory').value = '';
  document.getElementById('dndCreateBackstory').value = (me && me.character && me.character.backstory) || '';
  document.getElementById('dndCreateGold').value = 0;
  dndCreateManualEquip = {};
  renderEquipGrid('dndCreateEquipGrid', null);
  attachCreateEquipManualTracking();
  showDndCreateError('');
  renderPickCards('dndRaceCards', dndRaces, dndCreateSelectedRace, dndPickRace);
  renderCreatePassiveCards();
  renderPickCards('dndClassCards', dndClasses, dndCreateSelectedClass, dndPickClass);
  renderStatAllocGrid();
  renderAppearancePicker('dndCreate', dndCreateAppearance, dndCreateAppearanceChange);
  renderCreateAvatarPreview();
  updateCreateHints();
  validateCreateForm();
}
function renderAppearancePicker(idPrefix, appearance, onChange) {
  const hairBox = document.getElementById(idPrefix + 'HairRow');
  const colorBox = document.getElementById(idPrefix + 'HairColorRow');
  const faceBox = document.getElementById(idPrefix + 'FaceRow');
  if (!hairBox || !colorBox || !faceBox) return;
  hairBox.innerHTML = Object.keys(DND_HAIR_STYLE_INFO).map(k =>
    `<button type="button" class="dndApPickBtn${appearance.hair === k ? ' active' : ''}" data-hair="${k}">${DND_HAIR_STYLE_INFO[k]}</button>`
  ).join('');
  colorBox.innerHTML = DND_HAIR_COLOR_LIST.map(c =>
    `<div class="dndTokenColorSwatch${appearance.hairColor === c ? ' active' : ''}" style="background:${c};" data-haircolor="${c}"></div>`
  ).join('');
  faceBox.innerHTML = Object.keys(DND_FACE_STYLE_INFO).map(k =>
    `<button type="button" class="dndApPickBtn${appearance.face === k ? ' active' : ''}" data-face="${k}">${DND_FACE_STYLE_INFO[k]}</button>`
  ).join('');
  hairBox.querySelectorAll('button[data-hair]').forEach(btn => { btn.onclick = () => onChange('hair', btn.dataset.hair); });
  colorBox.querySelectorAll('[data-haircolor]').forEach(sw => { sw.onclick = () => onChange('hairColor', sw.dataset.haircolor); });
  faceBox.querySelectorAll('button[data-face]').forEach(btn => { btn.onclick = () => onChange('face', btn.dataset.face); });
}
function renderCreateAvatarPreview() {
  const box = document.getElementById('dndCreateAvatarPreview');
  if (!box) return;
  box.innerHTML = dndBuildAvatarSVG({ raceKey: dndCreateSelectedRace, classKey: dndCreateSelectedClass, equipment: {}, appearance: dndCreateAppearance }, 100, 130);
}
function dndCreateAppearanceChange(field, value) {
  dndCreateAppearance = Object.assign({}, dndCreateAppearance, { [field]: value });
  renderAppearancePicker('dndCreate', dndCreateAppearance, dndCreateAppearanceChange);
  renderCreateAvatarPreview();
}
function dndPickRace(key) {
  if (key !== dndCreateSelectedRace) dndCreateSelectedPassive = null; // เปลี่ยนเผ่าแล้วต้องเลือกสกิลติดตัวใหม่
  dndCreateSelectedRace = key;
  renderPickCards('dndRaceCards', dndRaces, dndCreateSelectedRace, dndPickRace);
  renderCreatePassiveCards();
  renderStatAllocGrid(); updateCreateHints(); validateCreateForm(); renderCreateAvatarPreview();
}
function dndPickClass(key) {
  dndCreateSelectedClass = key;
  renderPickCards('dndClassCards', dndClasses, dndCreateSelectedClass, dndPickClass);
  renderStatAllocGrid(); updateCreateHints(); validateCreateForm(); renderCreateAvatarPreview();
  applyStarterGearPreview(key);
}
// เติมไอเทมสวมใส่เริ่มต้นตามคลาสที่เลือกลงในฟอร์มสร้างตัวละคร แบบ "ยกเซต" ตามธีม D&D ของคลาสนั้น
// ช่องไหนที่ผู้เล่นยังไม่เคยพิมพ์เอง (dndCreateManualEquip) จะถูกแทนที่ด้วยไอเทมของคลาสใหม่เสมอเมื่อสลับคลาส
// (กันปัญหาอาวุธ/เกราะของคลาสเก่าค้างอยู่ไม่ตรงกับคลาสที่เลือกล่าสุด) ส่วนช่องที่ผู้เล่นพิมพ์เองแล้วจะไม่ถูกแตะต้อง
function applyStarterGearPreview(classKey) {
  const gear = dndClassStarterGear[classKey];
  if (!gear) return;
  const current = readEquipGrid('dndCreateEquipGrid');
  const merged = {};
  dndEquipSlots.forEach(slot => {
    if (dndCreateManualEquip[slot]) { merged[slot] = current[slot] || null; return; }
    const g = gear[slot];
    merged[slot] = g ? { name: g.name, atk: g.atk, def: g.def, durability: g.maxDurability, maxDurability: g.maxDurability, icon: '' } : null;
  });
  renderEquipGrid('dndCreateEquipGrid', merged);
  attachCreateEquipManualTracking();
}
// ผูก listener ไว้กับช่อง "ชื่อไอเทม" ของฟอร์มสร้างตัวละครเท่านั้น — พิมพ์เมื่อไหร่ถือว่าช่องนั้นผู้เล่นตั้งใจแก้เอง
// (renderEquipGrid วาด innerHTML ใหม่ทุกครั้ง จึงต้องเรียกฟังก์ชันนี้ซ้ำหลังจากวาดกริดใหม่ทุกครั้ง)
function attachCreateEquipManualTracking() {
  const grid = document.getElementById('dndCreateEquipGrid');
  if (!grid) return;
  grid.querySelectorAll('.dndEquipSlotCard').forEach(card => {
    const slot = card.dataset.slot;
    const nameInput = card.querySelector('.dndEquipName');
    if (nameInput) nameInput.addEventListener('input', () => { dndCreateManualEquip[slot] = true; });
  });
}

document.getElementById('dndCreateName').addEventListener('input', validateCreateForm);

document.getElementById('dndCreateSaveBtn').onclick = (ev) => {
  if (!validateCreateForm()) return;
  flashBtn(ev.currentTarget);
  showDndCreateError('');
  send({
    type: 'dndCreateCharacter',
    character: {
      charName: document.getElementById('dndCreateName').value,
      raceKey: dndCreateSelectedRace,
      passiveKey: dndCreateSelectedPassive,
      classKey: dndCreateSelectedClass,
      pointBuy: dndCreateAlloc,
      inventory: document.getElementById('dndCreateInventory').value,
      backstory: document.getElementById('dndCreateBackstory').value,
      gold: document.getElementById('dndCreateGold').value,
      equipment: readEquipGrid('dndCreateEquipGrid'),
      appearance: dndCreateAppearance,
    },
  });
};

function renderMySheetView() {
  const me = myDndEntry();
  const box = document.getElementById('dndMySheetView');
  if (!me) { box.innerHTML = ''; return; }
  const c = me.character;
  const raceInfo = dndRaceByKey(c.raceKey);
  const clsInfo = dndClassByKey(c.classKey);
  const passiveInfo = dndPassiveByKey(c.raceKey, c.passiveKey);
  const statPoints = Math.round(Number(c.statPoints) || 0);
  const rows = [
    ['ชื่อตัวละคร', c.charName || '-'],
    ['เผ่าพันธุ์ / คลาส', `${(raceInfo ? raceInfo.icon + ' ' : '') + (c.race || '-')} · ${(clsInfo ? clsInfo.icon + ' ' : '') + (c.cls || '-')}`],
    ['สกิลติดตัว', passiveInfo ? `${passiveInfo.icon || '✨'} ${passiveInfo.name}` : '-'],
    ['Level', `Lv.${c.level} · ${dndExpProgressText(c.exp || 0)}`],
    ['AC', c.ac],
    ['HP', `${c.hp} / ${c.maxHp}`],
    ['EXP', c.exp || 0],
    ['ทอง', c.gold || 0],
    ['แต้มสเตตัส (จากเลเวลอัพ)', statPoints],
  ];
  box.innerHTML = `<div class="dndAvatarWrap">${dndBuildAvatarSVG(c, 120, 160)}</div>`
    + rows.map(([k, v]) => `<div class="dndSheetViewRow"><span>${escapeHtml(k)}</span><span>${escapeHtml(String(v))}</span></div>`).join('')
    + `<div class="dndSheetStatRow">${Object.keys(DND_STAT_LABELS).map(k => {
      // สำคัญ: ต้องคิดต้นทุนจากค่า point-buy ดิบ (c.pointBuy[k]) ไม่ใช่ค่าสเตตัสสุดท้าย c[k]
      // เพราะ c[k] อาจถูกบวกโบนัสเผ่าพันธุ์/คลาสไปแล้ว ถ้าเอามาคิดต้นทุนราคาจะผิดเพี้ยนได้
      const rawScore = (c.pointBuy && c.pointBuy[k] != null) ? c.pointBuy[k] : c[k];
      const stepCost = dndPointBuyStepCost(rawScore);
      const btn = statPoints > 0
        ? `<button type="button" class="dndStatPlusBtn" ${statPoints >= stepCost ? '' : 'disabled'} title="เพิ่มอีก 1 ใช้แต้มสเตตัส ${stepCost} แต้ม" onclick="dndSpendStatPointClick('${k}')">+${stepCost}</button>`
        : '';
      return `<div class="dndStatTip" ${dndStatTipHtml(k)}><div class="dndStatKey">${DND_STAT_LABELS[k]}</div><div class="dndStatVal">${c[k]}</div>${btn}</div>`;
    }).join('')}</div>`
    + ((c.statuses && c.statuses.length) ? `<div class="dndPCardSkills">${c.statuses.map(s => dndStatusChipHtml(s)).join('')}</div>` : '')
    + `<div class="dndSheetViewRow" style="border-bottom:none; flex-direction:column; align-items:flex-start; gap:4px;"><span>ประวัติที่มา</span><span style="text-align:left; white-space:pre-wrap;">${escapeHtml(c.backstory || '-')}</span></div>`
    + `<div class="dndSheetViewRow" style="border-bottom:none; flex-direction:column; align-items:flex-start; gap:4px;"><span>ไอเทม / กระเป๋า</span><span style="text-align:left; white-space:pre-wrap;">${escapeHtml(c.inventory || '-')}</span></div>`;

  renderEquipGrid('dndEquipGrid', c.equipment, true);
  const totalDefEl = document.getElementById('dndTotalDefVal');
  if (totalDefEl) totalDefEl.textContent = dndTotalDefenseClient(c.equipment);
  const totalAtkEl = document.getElementById('dndTotalAtkVal');
  if (totalAtkEl) totalAtkEl.textContent = dndTotalAttackClient(c.equipment);
  const myAppearance = c.appearance || { hair: 'short', hairColor: DND_HAIR_COLOR_LIST[0], face: 'neutral' };
  renderAppearancePicker('dndMySheet', myAppearance, (field, value) => {
    send({ type: 'dndAppearanceUpdate', appearance: Object.assign({}, myAppearance, { [field]: value }) });
  });
  renderDndNormalAttackInfo();
}
function dndSpendStatPointClick(stat) {
  send({ type: 'dndSpendStatPoint', stat });
}

// ---- DM: หน้าต่างแก้ไขข้อมูลผู้เล่นคนไหนก็ได้ ทุกช่อง ----
function fillSelectOptions(selectEl, items, selectedKey) {
  selectEl.innerHTML = items.map(it => `<option value="${it.key}">${it.icon} ${escapeHtml(it.name)}</option>`).join('');
  selectEl.value = selectedKey || (items[0] && items[0].key) || '';
}
function fillPassiveSelectOptions(raceKey, selectedPassiveKey) {
  const el = document.getElementById('dndEditPassive');
  const list = dndPassivesForRace(raceKey);
  el.innerHTML = list.map(it => `<option value="${it.key}">${it.icon || '✨'} ${escapeHtml(it.name)}</option>`).join('');
  el.value = selectedPassiveKey || (list[0] && list[0].key) || '';
}
function openDmEdit(targetId) {
  const p = dndPlayersList.find(pp => pp.id === targetId);
  if (!p) return;
  dndDmEditTargetId = targetId;
  const c = p.character;
  document.getElementById('dndDmEditTitle').textContent = `แก้ไขข้อมูลตัวละคร (DM) — ${c.charName || p.name}`;
  document.getElementById('dndEditName').value = c.charName || '';
  fillSelectOptions(document.getElementById('dndEditRace'), dndRaces, c.raceKey);
  fillSelectOptions(document.getElementById('dndEditClass'), dndClasses, c.classKey);
  fillPassiveSelectOptions(c.raceKey, c.passiveKey);
  document.getElementById('dndEditRace').onchange = (ev) => fillPassiveSelectOptions(ev.target.value, null);
  document.getElementById('dndEditLevel').value = dndLevelFromExpClient(c.exp || 0);
  document.getElementById('dndEditLevelHint').textContent = `Lv.${dndLevelFromExpClient(c.exp || 0)} · ${dndExpProgressText(c.exp || 0)}`;
  document.getElementById('dndEditAc').value = c.ac;
  document.getElementById('dndEditHp').value = c.hp;
  document.getElementById('dndEditMaxHp').value = c.maxHp;
  document.getElementById('dndEditStr').value = c.str;
  document.getElementById('dndEditDex').value = c.dex;
  document.getElementById('dndEditCon').value = c.con;
  document.getElementById('dndEditInt').value = c.int;
  document.getElementById('dndEditWis').value = c.wis;
  document.getElementById('dndEditCha').value = c.cha;
  document.getElementById('dndEditBackstory').value = c.backstory || '';
  document.getElementById('dndEditInventory').value = c.inventory || '';
  document.getElementById('dndEditExp').value = c.exp || 0;
  document.getElementById('dndEditGold').value = c.gold || 0;
  renderEquipGrid('dndEditEquipGrid', c.equipment);
  document.getElementById('dndEditLocked').checked = !!c.locked;
  renderDndStatusChips('dndEditStatusList', c.statuses || [], 'player', targetId);
  renderDmEditSkills(p);
  document.getElementById('dndDmEditOverlay').style.display = 'flex';
}
// แสดงสกิลทั้งหมดของผู้เล่นคนนี้ในหน้าต่างแก้ไข DM — ทั้งสกิลประจำคลาส (รวมที่ยังไม่ปลดล็อก) และสกิลที่ DM มอบให้เฉพาะคน
// คลิกที่สกิลที่ DM สร้างเองได้เพื่อเปิดไปแก้ไขสกิลนั้นต่อทันที
function renderDmEditSkills(p) {
  const box = document.getElementById('dndEditSkillsBox');
  if (!box) return;
  const classChips = (p.classSkills || []).map(s =>
    `<span class="dndSkillChip dndEditableSkillChip" data-class-skill-id="${s.id}" title="${escapeHtml(s.desc || '')}\nคลิกเพื่อแก้ไขสกิลนี้ (เฉพาะผู้เล่นคนนี้คนเดียว)">🎓 ${escapeHtml(s.name)}${s.locked ? ` (ปลดล็อก Lv.${s.level})` : ''}${s.overridden ? ' ✏️' : ''}</span>`
  ).join('');
  const customChips = (p.assignedSkills || []).map(s =>
    `<span class="dndSkillChip dndEditableSkillChip" data-skill-id="${s.id}" title="คลิกเพื่อแก้ไขสกิลนี้">✨ ${escapeHtml(s.name)} ✏️</span>`
  ).join('');
  box.innerHTML = (classChips + customChips) || '<div class="dndRangeHint">ยังไม่มีสกิล</div>';
  box.querySelectorAll('[data-skill-id]').forEach(chip => {
    chip.onclick = () => { openDndSkillEdit(Number(chip.dataset.skillId)); };
  });
  box.querySelectorAll('[data-class-skill-id]').forEach(chip => {
    chip.onclick = () => { openDndClassSkillEdit(p.id, Number(chip.dataset.classSkillId)); };
  });
}
// ---- DM: แก้ไขสกิลประจำคลาส (🎓) เฉพาะผู้เล่นคนเดียว — ไม่กระทบคนอื่นในคลาสเดียวกัน ----
let dndClassSkillEditTarget = { playerId: null, skillId: null };
fillSkillStatSelect('dndClassSkillEditStat');
fillSkillDmgDieSelect('dndClassSkillEditDmgDie');
fillSkillHealDieSelect('dndClassSkillEditHealDie');
function openDndClassSkillEdit(playerId, skillId) {
  const p = dndPlayersList.find(pp => pp.id === playerId);
  if (!p) return;
  const skill = (p.classSkills || []).find(s => s.id === skillId);
  if (!skill) return;
  dndClassSkillEditTarget = { playerId, skillId };
  document.getElementById('dndClassSkillEditTitle').textContent = `แก้ไขสกิลประจำคลาส (DM) — ${skill.name} · เฉพาะ ${p.character.charName || p.name}`;
  document.getElementById('dndClassSkillEditName').value = skill.name || '';
  document.getElementById('dndClassSkillEditStat').value = skill.stat || '';
  document.getElementById('dndClassSkillEditDesc').value = skill.desc || '';
  document.getElementById('dndClassSkillEditDmgDie').value = String(skill.dmgDie || 0);
  document.getElementById('dndClassSkillEditDmgCount').value = skill.dmgCount || 1;
  document.getElementById('dndClassSkillEditDmgMod').value = skill.dmgMod || 0;
  document.getElementById('dndClassSkillEditHealDie').value = String(skill.healDie || 0);
  document.getElementById('dndClassSkillEditHealCount').value = skill.healCount || 1;
  document.getElementById('dndClassSkillEditHealMod').value = skill.healMod || 0;
  document.getElementById('dndClassSkillEditStatusName').value = skill.statusName || '';
  document.getElementById('dndClassSkillEditStatusNote').value = skill.statusNote || '';
  document.getElementById('dndClassSkillEditAoeRadius').value = skill.aoeRadius || 0;
  document.getElementById('dndClassSkillEditCleanseEnabled').checked = !!skill.cleanseEnabled;
  document.getElementById('dndClassSkillEditCleanseName').value = skill.cleanseName || '';
  document.getElementById('dndClassSkillEditCooldown').value = skill.cooldownSec || 0;
  document.getElementById('dndClassSkillEditMaxUses').value = skill.maxUses || 0;
  document.getElementById('dndClassSkillEditError').textContent = '';
  document.getElementById('dndClassSkillEditResetBtn').style.display = skill.overridden ? 'inline-block' : 'none';
  document.getElementById('dndClassSkillEditOverlay').style.display = 'flex';
}
document.getElementById('dndClassSkillEditCancelBtn').onclick = () => {
  document.getElementById('dndClassSkillEditOverlay').style.display = 'none';
  dndClassSkillEditTarget = { playerId: null, skillId: null };
};
document.getElementById('dndClassSkillEditSaveBtn').onclick = (ev) => {
  const { playerId, skillId } = dndClassSkillEditTarget;
  if (playerId == null || skillId == null) return;
  const name = document.getElementById('dndClassSkillEditName').value.trim();
  if (!name) { document.getElementById('dndClassSkillEditError').textContent = 'กรุณาตั้งชื่อสกิล'; return; }
  flashBtn(ev.currentTarget);
  send({
    type: 'dndClassSkillOverrideSave',
    targetId: playerId,
    skillId,
    skill: {
      name,
      stat: document.getElementById('dndClassSkillEditStat').value,
      desc: document.getElementById('dndClassSkillEditDesc').value,
      damage: {
        die: document.getElementById('dndClassSkillEditDmgDie').value,
        count: document.getElementById('dndClassSkillEditDmgCount').value,
        mod: document.getElementById('dndClassSkillEditDmgMod').value,
      },
      heal: {
        die: document.getElementById('dndClassSkillEditHealDie').value,
        count: document.getElementById('dndClassSkillEditHealCount').value,
        mod: document.getElementById('dndClassSkillEditHealMod').value,
      },
      status: {
        name: document.getElementById('dndClassSkillEditStatusName').value,
        note: document.getElementById('dndClassSkillEditStatusNote').value,
      },
      aoe: {
        radius: document.getElementById('dndClassSkillEditAoeRadius').value,
      },
      cleanse: {
        enabled: document.getElementById('dndClassSkillEditCleanseEnabled').checked,
        name: document.getElementById('dndClassSkillEditCleanseName').value,
      },
      cooldownSec: document.getElementById('dndClassSkillEditCooldown').value,
      maxUses: document.getElementById('dndClassSkillEditMaxUses').value,
    },
  });
  document.getElementById('dndClassSkillEditOverlay').style.display = 'none';
  dndClassSkillEditTarget = { playerId: null, skillId: null };
};
document.getElementById('dndClassSkillEditResetBtn').onclick = (ev) => {
  const { playerId, skillId } = dndClassSkillEditTarget;
  if (playerId == null || skillId == null) return;
  if (!confirm('รีเซ็ตสกิลนี้ของผู้เล่นคนนี้กลับเป็นค่าเริ่มต้นของคลาส?')) return;
  flashBtn(ev.currentTarget);
  send({ type: 'dndClassSkillOverrideReset', targetId: playerId, skillId });
  document.getElementById('dndClassSkillEditOverlay').style.display = 'none';
  dndClassSkillEditTarget = { playerId: null, skillId: null };
};
// ---- แสดง chip สถานะ/ดีบัฟ พร้อมปุ่มถอน (ใช้ร่วมกันทั้งหน้าต่างแก้ไขผู้เล่นและ NPC) ----
function renderDndStatusChips(elId, statuses, targetType, targetId) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!statuses || !statuses.length) { el.innerHTML = '<div class="dndRangeHint">ไม่มีสถานะ/ดีบัฟตอนนี้</div>'; return; }
  el.innerHTML = statuses.map(s => dndStatusChipHtml(s, `<button type="button" data-eid="${s.id}" title="แก้ไขสถานะนี้">✏️</button><button type="button" data-sid="${s.id}" title="ถอนสถานะนี้">✕</button>`)).join('');
  el.querySelectorAll('button[data-sid]').forEach(btn => {
    btn.onclick = () => send({ type: 'dndStatusRemove', status: { targetType, targetId, statusId: Number(btn.dataset.sid) } });
  });
  el.querySelectorAll('button[data-eid]').forEach(btn => {
    btn.onclick = () => {
      const cur = statuses.find(s => s.id === Number(btn.dataset.eid));
      if (!cur) return;
      const name = prompt('ชื่อสถานะ', cur.name);
      if (name === null) return;
      const trimmedName = name.trim();
      if (!trimmedName) return;
      const noteInput = prompt('หมายเหตุ (ไม่บังคับ)', cur.note || '');
      const note = noteInput === null ? (cur.note || '') : noteInput;
      const durationInput = prompt('คูลดาวน์ (วินาที, 0 = ไม่มีคูลดาวน์ ถอนเองอย่างเดียว)', String(cur.durationSec || 0));
      if (durationInput === null) return;
      const durationSec = Math.max(0, Math.min(86400, Math.round(Number(durationInput) || 0)));
      const atkInput = prompt('ปรับค่าโจมตี ± (0 = ไม่ปรับ)', String(cur.atkMod || 0));
      if (atkInput === null) return;
      const atkMod = Math.max(-20, Math.min(20, Math.round(Number(atkInput) || 0)));
      const dmgInput = prompt('ปรับค่าดาเมจ ± (0 = ไม่ปรับ)', String(cur.dmgMod || 0));
      if (dmgInput === null) return;
      const dmgMod = Math.max(-20, Math.min(20, Math.round(Number(dmgInput) || 0)));
      const defInput = prompt('ปรับค่าป้องกัน AC ± (0 = ไม่ปรับ)', String(cur.defMod || 0));
      if (defInput === null) return;
      const defMod = Math.max(-20, Math.min(20, Math.round(Number(defInput) || 0)));
      const tickInput = prompt('HP ต่อติ๊ก ± (ลบ=โดนดาเมจต่อเนื่อง, บวก=ฟื้น HP ต่อเนื่อง, 0=ไม่มี)', String(cur.tickValue || 0));
      if (tickInput === null) return;
      const tickValue = Math.max(-1000, Math.min(1000, Math.round(Number(tickInput) || 0)));
      let tickIntervalSec = cur.tickIntervalSec || 6;
      if (tickValue !== 0) {
        const tickIntervalInput = prompt('ติ๊กทุกกี่วินาที', String(tickIntervalSec || 6));
        if (tickIntervalInput === null) return;
        tickIntervalSec = Math.max(1, Math.min(3600, Math.round(Number(tickIntervalInput) || 0) || 6));
      }
      send({ type: 'dndStatusEdit', status: { targetType, targetId, statusId: cur.id, name: trimmedName, note, durationSec, atkMod, dmgMod, defMod, tickValue, tickIntervalSec } });
    };
  });
}
document.getElementById('dndEditStatusAddBtn').onclick = (ev) => {
  if (dndDmEditTargetId == null) return;
  const name = document.getElementById('dndEditStatusName').value.trim();
  if (!name) return;
  flashBtn(ev.currentTarget);
  const durationSec = Math.max(0, Math.min(86400, Math.round(Number(document.getElementById('dndEditStatusDuration').value) || 0)));
  const atkMod = Number(document.getElementById('dndEditStatusAtk').value) || 0;
  const dmgMod = Number(document.getElementById('dndEditStatusDmg').value) || 0;
  const defMod = Number(document.getElementById('dndEditStatusDef').value) || 0;
  const tickValue = Number(document.getElementById('dndEditStatusTick').value) || 0;
  const tickIntervalSec = Number(document.getElementById('dndEditStatusTickInterval').value) || 0;
  send({ type: 'dndStatusApply', status: { targetType: 'player', targetId: dndDmEditTargetId, name, note: document.getElementById('dndEditStatusNote').value, durationSec, atkMod, dmgMod, defMod, tickValue, tickIntervalSec } });
  document.getElementById('dndEditStatusName').value = '';
  document.getElementById('dndEditStatusNote').value = '';
  document.getElementById('dndEditStatusDuration').value = '';
  document.getElementById('dndEditStatusAtk').value = '';
  document.getElementById('dndEditStatusDmg').value = '';
  document.getElementById('dndEditStatusDef').value = '';
  document.getElementById('dndEditStatusTick').value = '';
  document.getElementById('dndEditStatusTickInterval').value = '';
};
function closeDndModals() {
  document.getElementById('dndDmEditOverlay').style.display = 'none';
  document.getElementById('dndClassSkillEditOverlay').style.display = 'none';
  document.getElementById('dndSkillEditOverlay').style.display = 'none';
  document.getElementById('dndPassiveEditOverlay').style.display = 'none';
  document.getElementById('dndTokenEditOverlay').style.display = 'none';
  document.getElementById('dndHowToOverlay').style.display = 'none';
  document.getElementById('dndPatchNotesOverlay').style.display = 'none';
  dndDmEditTargetId = null;
  dndClassSkillEditTarget = { playerId: null, skillId: null };
  dndSkillEditTargetId = null;
  dndPassiveEditTargetId = null;
  dndTokenEditTargetId = null;
}
document.getElementById('dndDmEditCancelBtn').onclick = () => closeDndModals();
document.getElementById('dndDmEditSaveBtn').onclick = (ev) => {
  if (dndDmEditTargetId == null) return;
  flashBtn(ev.currentTarget);
  send({
    type: 'dndDmUpdate',
    targetId: dndDmEditTargetId,
    updates: {
      charName: document.getElementById('dndEditName').value,
      raceKey: document.getElementById('dndEditRace').value,
      passiveKey: document.getElementById('dndEditPassive').value,
      classKey: document.getElementById('dndEditClass').value,
      ac: document.getElementById('dndEditAc').value,
      hp: document.getElementById('dndEditHp').value,
      maxHp: document.getElementById('dndEditMaxHp').value,
      str: document.getElementById('dndEditStr').value,
      dex: document.getElementById('dndEditDex').value,
      con: document.getElementById('dndEditCon').value,
      int: document.getElementById('dndEditInt').value,
      wis: document.getElementById('dndEditWis').value,
      cha: document.getElementById('dndEditCha').value,
      inventory: document.getElementById('dndEditInventory').value,
      backstory: document.getElementById('dndEditBackstory').value,
      exp: document.getElementById('dndEditExp').value,
      gold: document.getElementById('dndEditGold').value,
      equipment: readEquipGrid('dndEditEquipGrid'),
      locked: document.getElementById('dndEditLocked').checked,
    },
  });
  closeDndModals();
};

document.getElementById('dndHowToBtn').onclick = (ev) => { flashBtn(ev.currentTarget); document.getElementById('dndHowToOverlay').style.display = 'flex'; };
document.getElementById('dndHowToCloseBtn').onclick = () => { document.getElementById('dndHowToOverlay').style.display = 'none'; };
document.getElementById('dndPatchNotesBtn').onclick = (ev) => { flashBtn(ev.currentTarget); document.getElementById('dndPatchNotesOverlay').style.display = 'flex'; };
document.getElementById('dndPatchNotesCloseBtn').onclick = () => { document.getElementById('dndPatchNotesOverlay').style.display = 'none'; };

function renderDndParty() {
  const list = document.getElementById('dndPartyList');
  list.innerHTML = '';
  dndPlayersList.forEach(p => {
    const isMe = dndYou && p.id === dndYou.id;
    const isCurrentTurn = dndTurnIndexClient >= 0 && dndCurrentTurnPlayerId === p.id;
    const isDead = !p.isDM && Number(p.character && p.character.hp) <= 0;
    const div = document.createElement('div');
    div.className = 'dndPCard' + (isMe ? ' me' : '') + (p.isDM ? ' dm' : '') + (isCurrentTurn ? ' myTurn' : '') + (isDead ? ' dead' : '');

    // DM ไม่มีการ์ดตัวละคร (ไม่ใช่ตัวละครในปาร์ตี้) — โชว์แค่ป้ายบทบาทสั้นๆ
    if (p.isDM) {
      div.innerHTML = `
        <div class="dndPCardTop">
          <span class="dndPCardName">${escapeHtml(p.character.charName || p.name)}${isMe ? ' (คุณ)' : ''}</span>
          <span class="dndPCardTag">DM</span>
        </div>
        <div class="dndPCardMeta">🎛️ Dungeon Master — ควบคุมเกม${p.connected ? '' : ' · หลุดการเชื่อมต่อ'}</div>`;
      list.appendChild(div);
      return;
    }

    const c = p.character;
    const pct = c.maxHp > 0 ? Math.max(0, Math.min(100, Math.round(c.hp / c.maxHp * 100))) : 0;
    const raceInfo = dndRaceByKey(c.raceKey);
    const clsInfo = dndClassByKey(c.classKey);
    const passiveInfo = c.locked ? dndPassiveByKey(c.raceKey, c.passiveKey) : null;
    const raceClsText = c.locked ? `${(raceInfo ? raceInfo.icon + ' ' : '')}${escapeHtml(c.race || '-')} · ${(clsInfo ? clsInfo.icon + ' ' : '')}${escapeHtml(c.cls || '-')}${passiveInfo ? ` · ${passiveInfo.icon || '✨'} ${escapeHtml(passiveInfo.name)}` : ''}` : 'ยังไม่ได้สร้างตัวละคร';
    const skillsHtml = (p.assignedSkills && p.assignedSkills.length)
      ? `<div class="dndPCardSkills">${p.assignedSkills.map(s => `<span class="dndSkillChip">✨ ${escapeHtml(s.name)}</span>`).join('')}</div>` : '';
    const statusesHtml = (c.statuses && c.statuses.length)
      ? `<div class="dndPCardSkills">${c.statuses.map(s => dndStatusChipHtml(s)).join('')}</div>` : '';
    div.innerHTML = `
      <div class="dndPCardBody">
        <div class="dndAvatarMini">${dndBuildAvatarSVG(c, 44, 58)}</div>
        <div class="dndPCardBodyMain">
          <div class="dndPCardTop">
            <span class="dndPCardName">${escapeHtml(c.charName || p.name)}${isMe ? ' (คุณ)' : ''}</span>
            ${isCurrentTurn ? '<span class="dndMyTurnBadge">🎯 ตานี้</span>' : ''}
            ${isDead ? '<span class="dndDeadBadge">💀 หมดสติ</span>' : ''}
          </div>
          <div class="dndPCardMeta">${raceClsText} · Lv.${c.level} · ${dndExpProgressText(c.exp || 0)} · AC ${c.ac} · <span class="dndTotalDefBadge">ป้องกัน ${dndTotalDefenseClient(c.equipment || {})}</span>${p.connected ? '' : ' · หลุดการเชื่อมต่อ'}</div>
          <div class="dndHpRow">
            <div class="dndHpBarWrap"><div class="dndHpBar${pct <= 25 ? ' low' : ''}" style="width:${pct}%;"></div></div>
            <div class="dndHpText">${c.hp}/${c.maxHp} HP</div>
          </div>
          ${skillsHtml}
          ${statusesHtml}
          ${isDead ? `<div class="dndDeadNotice">💀 หมดสติอยู่ — ทำอะไรไม่ได้จนกว่าจะมีคนใช้ไอเทมชุบให้ หรือ DM เพิ่ม HP ให้</div>` : ''}
        </div>
      </div>`;
    if (dndYou && dndYou.isDM) {
      const btn = document.createElement('button');
      btn.className = 'dndEditBtn';
      btn.type = 'button';
      btn.textContent = '✏️ แก้ไข';
      btn.onclick = () => openDmEdit(p.id);
      div.appendChild(btn);
      const kickBtn = document.createElement('button');
      kickBtn.className = 'dndEditBtn dndKickBtn';
      kickBtn.type = 'button';
      kickBtn.textContent = '🗑️ ลบผู้เล่น';
      kickBtn.onclick = () => {
        if (confirm(`ลบ "${c.charName || p.name}" ออกจากห้องถาวร? ที่นั่งและการ์ดตัวละครจะหายไปเลย กู้คืนไม่ได้`)) {
          send({ type: 'dndDmKickPlayer', targetId: p.id });
        }
      };
      div.appendChild(kickBtn);
    }
    list.appendChild(div);
  });
}

function renderDndLog(log) {
  const el = document.getElementById('dndLog');
  el.innerHTML = (log || []).map(line => `<div>${escapeHtml(line)}</div>`).join('');
  el.scrollTop = el.scrollHeight;
}
// แผงสรุปสกิลผู้เล่นทุกคนสำหรับ DM (สกิลประจำคลาสที่ปลดล็อกแล้ว/ยังไม่ปลดล็อก + สกิลที่ DM มอบให้เฉพาะคน)
// อยู่ทางขวาคู่กับแชท ให้ DM เห็นภาพรวมสกิลทุกคนได้เร็ว โดยไม่ต้องเปิดหน้าต่างแก้ไขทีละคน
// คลิกที่ชื่อผู้เล่นเพื่อเปิดหน้าต่างแก้ไขตัวละครคนนั้นไปที่ส่วนสกิลได้ทันที
function renderDmSkillsOverview() {
  const box = document.getElementById('dndDmSkillsOverviewList');
  if (!box) return;
  const players = dndPlayersList.filter(p => !p.isDM);
  if (!players.length) { box.innerHTML = '<div class="dndRangeHint">ยังไม่มีผู้เล่น</div>'; return; }
  box.innerHTML = players.map(p => {
    const c = p.character || {};
    const raceInfo = dndRaceByKey(c.raceKey);
    const clsInfo = dndClassByKey(c.classKey);
    const metaText = c.locked
      ? `${(raceInfo ? raceInfo.icon + ' ' : '')}${escapeHtml(c.race || '-')} · ${(clsInfo ? clsInfo.icon + ' ' : '')}${escapeHtml(c.cls || '-')} · Lv.${c.level || 1}`
      : 'ยังไม่ได้สร้างตัวละคร';
    const classChips = (p.classSkills || []).map(s =>
      `<span class="dndSkillChip${s.locked ? ' dndSkillChipLocked' : ''}" title="${escapeHtml(s.desc || '')}">🎓 ${escapeHtml(s.name)}${s.locked ? ` (ปลดล็อก Lv.${s.level})` : ''}</span>`
    ).join('');
    const customChips = (p.assignedSkills || []).map(s =>
      `<span class="dndSkillChip" title="${escapeHtml(s.desc || '')}">✨ ${escapeHtml(s.name)}</span>`
    ).join('');
    const skillsHtml = (classChips + customChips) || '<span class="dndRangeHint">ยังไม่มีสกิล</span>';
    return `
      <div class="dndDmSkillsPlayerRow" data-pid="${p.id}">
        <div class="dndDmSkillsPlayerName">${escapeHtml(c.charName || p.name)} <span class="dndRangeHint">${metaText}</span></div>
        <div class="dndDmSkillsChips">${skillsHtml}</div>
      </div>`;
  }).join('');
  box.querySelectorAll('.dndDmSkillsPlayerRow').forEach(row => {
    row.style.cursor = 'pointer';
    row.title = 'คลิกเพื่อแก้ไขตัวละครคนนี้';
    row.onclick = () => openDmEdit(Number(row.dataset.pid));
  });
}

function renderDndState(state) {
  dndYou = state.you;
  dndPlayersList = state.players || [];
  dndRaces = state.races || dndRaces;
  dndClasses = state.classes || dndClasses;
  dndClassStarterGear = state.classStarterGear || dndClassStarterGear;
  dndPassives = state.passives || dndPassives;
  dndCustomPassives = state.customPassives || dndCustomPassives;
  dndSkills = state.skills || dndSkills;
  dndPointBuyMin = state.pointBuyMin || dndPointBuyMin;
  dndPointBuyBudget = state.pointBuyBudget || dndPointBuyBudget;
  dndPointBuyCost = state.pointBuyCost || dndPointBuyCost;
  dndPointBuyCostMaxDefined = state.pointBuyCostMaxDefined || dndPointBuyCostMaxDefined;
  dndPointBuyCostPerStepAboveMax = state.pointBuyCostPerStepAboveMax || dndPointBuyCostPerStepAboveMax;
  dndStatPointsPerLevel = state.statPointsPerLevel || dndStatPointsPerLevel;
  dndEquipSlots = state.equipSlots || dndEquipSlots;
  dndEquipSlotLabels = state.equipSlotLabels || dndEquipSlotLabels;
  dndTokens = state.tokens || dndTokens;
  dndShops = state.shops || dndShops;
  dndForgeFailPolicyLabels = state.forgeFailPolicyLabels || dndForgeFailPolicyLabels;
  dndItemEffects = state.itemEffects || [];
  dndTrades = state.trades || [];
  dndMapBackground = state.mapBackground || null;
  dndMaps = state.maps || dndMaps;
  dndCurrentMapId = state.currentMapId != null ? state.currentMapId : dndCurrentMapId;
  dndTurnOrderClient = state.turnOrder || [];
  dndTurnIndexClient = state.turnIndex != null ? state.turnIndex : -1;
  dndCurrentTurnPlayerId = state.currentTurnPlayerId != null ? state.currentTurnPlayerId : null;
  if (Array.isArray(state.levelExpTable) && state.levelExpTable.length) window.DND_LEVEL_EXP_CLIENT = state.levelExpTable;
  renderDndScene(state.scene);
  renderDndGameTime(state.gameTime);
  renderDndTimeAuto(state.timeAuto);

  document.getElementById('mainMenuScreen').style.display = 'none';
  document.getElementById('joinScreen').style.display = 'none';
  document.getElementById('dndJoinScreen').style.display = 'none';
  document.getElementById('lobbyScreen').style.display = 'none';
  document.getElementById('seatPickerScreen').style.display = 'none';
  document.getElementById('gameScreen').style.display = 'none';
  document.getElementById('dndScreen').style.display = 'block';
  document.getElementById('chatPanel').style.display = 'none';
  document.getElementById('alarmBtn').style.display = 'none';
  document.getElementById('newGameBtn').style.display = 'block';

  const isDM = !!(dndYou && dndYou.isDM);
  document.getElementById('dndYouAreDm').style.display = isDM ? 'inline' : 'none';
  document.getElementById('dndRestartBtn').style.display = isDM ? 'inline' : 'none';
  document.getElementById('dndSaveGameBtn').style.display = isDM ? 'inline' : 'none';
  document.getElementById('dndLoadGameBtn').style.display = isDM ? 'inline' : 'none';

  // DM ไม่ต้องสร้างการ์ดตัวละครของตัวเอง (บทบาทคุมเกม ไม่ใช่ตัวละครในปาร์ตี้) — โชว์แผงสถานะห้องแทน
  document.getElementById('dndDmStatusBox').style.display = isDM ? 'block' : 'none';
  document.getElementById('dndDmSkillsOverviewBox').style.display = isDM ? 'block' : 'none';
  document.getElementById('dndTurnBox').style.display = isDM ? 'block' : 'none';
  document.getElementById('dndSceneEditBox').style.display = isDM ? 'block' : 'none';
  document.getElementById('dndTimeEditBox').style.display = isDM ? 'block' : 'none';
  if (isDM) {
    document.getElementById('dndCreateBox').style.display = 'none';
    document.getElementById('dndMySheetBox').style.display = 'none';
    dndCreateInitialized = false;
    if (!dndSceneEditInitialized) {
      document.getElementById('dndSceneLocationInput').value = (state.scene && state.scene.location) || '';
      document.getElementById('dndSceneSituationInput').value = (state.scene && state.scene.situation) || '';
      dndSceneEditInitialized = true;
    }
    if (!dndTimeSetInputsInitialized && state.gameTime) {
      document.getElementById('dndTimeSetDay').value = state.gameTime.day;
      document.getElementById('dndTimeSetHour').value = state.gameTime.hour;
      document.getElementById('dndTimeSetMinute').value = state.gameTime.minute;
      dndTimeSetInputsInitialized = true;
    }
    renderDndStatusBox();
    renderDndTurnBox();
  } else {
    const locked = !!(dndYou && dndYou.locked);
    document.getElementById('dndCreateBox').style.display = locked ? 'none' : 'block';
    document.getElementById('dndMySheetBox').style.display = locked ? 'block' : 'none';
    if (!locked) {
      if (!dndCreateInitialized) { initDndCreateForm(); dndCreateInitialized = true; }
    } else {
      dndCreateInitialized = false;
      renderMySheetView();
    }
  }

  renderDndParty();
  renderDmSkillsOverview();
  renderDndLog(state.log);
  renderDndSkillList();
  renderDndPassiveManageList();
  document.getElementById('dndMapMyTokenBox').style.display = (!isDM && dndYou && dndYou.locked) ? 'block' : 'none';
  document.getElementById('dndMapNpcAddBox').style.display = isDM ? 'block' : 'none';
  document.getElementById('dndShopDmForm').style.display = isDM ? 'block' : 'none';
  renderDndShops();
  renderDndMap();
  renderDndBag();
}

// แผงสถานะห้องของ DM — แทนที่หน้าจอสร้างตัวละคร ที่กลางจอ (DM ไม่ต้องมีตัวละครของตัวเอง)
function renderDndStatusBox() {
  const box = document.getElementById('dndDmStatusContent');
  if (!box) return;
  const members = dndPlayersList.filter(p => !p.isDM);
  const connected = members.filter(p => p.connected).length;
  const lockedCount = members.filter(p => p.character.locked).length;
  box.innerHTML = `
    <div class="dndSheetViewRow"><span>ผู้เล่นในปาร์ตี้</span><span>${members.length} คน</span></div>
    <div class="dndSheetViewRow"><span>เชื่อมต่ออยู่ตอนนี้</span><span>${connected} คน</span></div>
    <div class="dndSheetViewRow"><span>สร้างการ์ดตัวละครแล้ว</span><span>${lockedCount} / ${members.length} คน</span></div>
    <div class="dndSheetViewRow" style="border-bottom:none;"><span>สกิลทั้งหมดในห้อง</span><span>${dndSkills.length} สกิล</span></div>
  `;
}

// ---- ร้านค้า: DM จัดการร้าน/ไอเทม — ผู้เล่นซื้อ/ขายคืนด้วยทองของตัวเอง ----
document.getElementById('dndShopAddBtn').onclick = (ev) => {
  flashBtn(ev.currentTarget);
  send({
    type: 'dndShopCreate',
    name: document.getElementById('dndShopNameInput').value,
    shopType: document.getElementById('dndShopTypeInput').value,
  });
  document.getElementById('dndShopNameInput').value = '';
};
function dndMyBag() {
  const me = myDndEntry();
  return (me && me.character && me.character.bag) || [];
}
function dndBagQty(name) {
  const row = dndMyBag().find(it => it.name === name);
  return row ? row.qty : 0;
}
function renderDndShops() {
  const box = document.getElementById('dndShopList');
  if (!box) return;
  const isDM = !!(dndYou && dndYou.isDM);
  const myGold = (() => { const me = myDndEntry(); return me ? (me.character.gold || 0) : 0; })();
  const myEquipment = (() => { const me = myDndEntry(); return (me && me.character && me.character.equipment) || {}; })();
  if (!dndShops.length) {
    box.innerHTML = `<div class="dndRangeHint">${isDM ? 'ยังไม่มีร้านค้า — เปิดร้านใหม่ได้ด้านบน' : 'ยังไม่มีร้านค้าเปิดอยู่ในตอนนี้'}</div>`;
    return;
  }
  box.innerHTML = dndShops.map(shop => {
    const isForge = shop.type === 'forge';
    const bodyHtml = isForge ? dndRenderForgeShopBody(shop, isDM, myGold, myEquipment) : dndRenderItemShopBody(shop, isDM, myGold);
    return `
    <div class="dndShopCard" data-shop="${shop.id}">
      <div class="dndShopCardHead">
        <h4>${isForge ? '⚒️' : '🛍️'} ${escapeHtml(shop.name)}</h4>
        ${isDM ? `<button type="button" class="dndShopDelBtn" data-shopdel="${shop.id}">ปิดร้าน</button>` : ''}
      </div>
      ${bodyHtml}
    </div>
  `;
  }).join('');

  box.querySelectorAll('button[data-shopdel]').forEach(btn => {
    btn.onclick = () => { if (confirm('ปิดร้านนี้เลยไหม?')) send({ type: 'dndShopDelete', shopId: Number(btn.dataset.shopdel) }); };
  });
  box.querySelectorAll('button[data-itemdel]').forEach(btn => {
    btn.onclick = () => {
      const [shopId, itemId] = btn.dataset.itemdel.split(':').map(Number);
      send({ type: 'dndShopItemDelete', shopId, itemId });
    };
  });
  box.querySelectorAll('button[data-buy]').forEach(btn => {
    btn.onclick = (ev) => {
      flashBtn(ev.currentTarget);
      const [shopId, itemId] = btn.dataset.buy.split(':').map(Number);
      send({ type: 'dndShopBuy', shopId, itemId });
    };
  });
  box.querySelectorAll('button[data-sell]').forEach(btn => {
    btn.onclick = (ev) => {
      flashBtn(ev.currentTarget);
      const [shopId, itemId] = btn.dataset.sell.split(':').map(Number);
      send({ type: 'dndShopSell', shopId, itemId });
    };
  });
  box.querySelectorAll('button[data-additem]').forEach(btn => {
    btn.onclick = (ev) => {
      const shopId = Number(btn.dataset.additem);
      const name = box.querySelector(`input[data-newname="${shopId}"]`).value.trim();
      if (!name) return;
      flashBtn(ev.currentTarget);
      send({
        type: 'dndShopItemAdd',
        shopId,
        item: {
          name,
          price: box.querySelector(`input[data-newprice="${shopId}"]`).value,
          stock: box.querySelector(`input[data-newstock="${shopId}"]`).value,
          desc: box.querySelector(`input[data-newdesc="${shopId}"]`).value,
        },
      });
    };
  });
  box.querySelectorAll('button[data-addtier]').forEach(btn => {
    btn.onclick = (ev) => {
      const shopId = Number(btn.dataset.addtier);
      flashBtn(ev.currentTarget);
      send({
        type: 'dndShopItemAdd',
        shopId,
        item: {
          name: box.querySelector(`input[data-tiername="${shopId}"]`).value,
          cost: box.querySelector(`input[data-tiercost="${shopId}"]`).value,
          successRate: box.querySelector(`input[data-tiersuccess="${shopId}"]`).value,
          atkBonus: box.querySelector(`input[data-tieratk="${shopId}"]`).value,
          defBonus: box.querySelector(`input[data-tierdef="${shopId}"]`).value,
          failPolicy: box.querySelector(`select[data-tierfail="${shopId}"]`).value,
          desc: box.querySelector(`input[data-tierdesc="${shopId}"]`).value,
        },
      });
    };
  });
  box.querySelectorAll('button[data-forge]').forEach(btn => {
    btn.onclick = (ev) => {
      flashBtn(ev.currentTarget);
      const [shopId, slot] = btn.dataset.forge.split(':');
      send({ type: 'dndForgeAttempt', shopId: Number(shopId), slot });
    };
  });
}
// ---- ร้านไอเทมทั่วไป: ซื้อ/ขายด้วยทอง (เดิม) ----
function dndRenderItemShopBody(shop, isDM, myGold) {
  const itemsHtml = shop.items.length ? shop.items.map(it => {
    const stockStr = it.stock === null ? 'ไม่จำกัด' : `เหลือ ${it.stock}`;
    const have = dndBagQty(it.name);
    const canBuy = !isDM && (it.stock === null || it.stock > 0) && myGold >= it.price;
    const canSell = !isDM && have > 0;
    return `
    <div class="dndShopItemRow">
      <div class="dndShopItemInfo">
        <div class="dndShopItemName">${escapeHtml(it.name)}</div>
        <div class="dndShopItemMeta">💰 ${it.price} · สต็อก ${stockStr}${have ? ` · คุณมี ${have}` : ''}</div>
        ${it.desc ? `<div class="dndShopItemDesc">${escapeHtml(it.desc)}</div>` : ''}
      </div>
      ${isDM
        ? `<button type="button" class="dndShopItemDelBtn" data-itemdel="${shop.id}:${it.id}">ลบ</button>`
        : `<button type="button" class="dndShopBuyBtn" data-buy="${shop.id}:${it.id}" ${canBuy ? '' : 'disabled'}>ซื้อ</button>
           <button type="button" class="dndShopSellBtn" data-sell="${shop.id}:${it.id}" ${canSell ? '' : 'disabled'}>ขาย (${Math.floor(it.price / 2)})</button>`}
    </div>`;
  }).join('') : `<div class="dndRangeHint">ร้านนี้ยังไม่มีไอเทม</div>`;
  const addFormHtml = isDM ? `
      <div class="dndShopAddItemRow">
        <input type="text" placeholder="ชื่อไอเทม" data-newname="${shop.id}" maxlength="40">
        <input type="number" placeholder="ราคา" data-newprice="${shop.id}" min="0" style="max-width:70px;">
        <input type="number" placeholder="สต็อก (ว่าง=ไม่จำกัด)" data-newstock="${shop.id}" min="0" style="max-width:120px;">
        <input type="text" placeholder="คำอธิบาย (ไม่บังคับ)" data-newdesc="${shop.id}" maxlength="150">
        <button type="button" data-additem="${shop.id}">➕ เพิ่มไอเทม</button>
      </div>` : '';
  return itemsHtml + addFormHtml;
}
// ---- ร้านตีบวก: DM ตั้งค่าระดับตีบวก (tier) ทีละขั้น — ผู้เล่นเลือกของที่สวมใส่อยู่มาตีบวกทีละช่อง ----
function dndRenderForgeShopBody(shop, isDM, myGold, myEquipment) {
  let bodyHtml;
  if (isDM) {
    bodyHtml = shop.items.length ? shop.items.map((tier, idx) => `
      <div class="dndShopItemRow">
        <div class="dndShopItemInfo">
          <div class="dndShopItemName">ระดับที่ ${idx + 1}: ${escapeHtml(tier.name)}</div>
          <div class="dndShopItemMeta">💰 ${tier.cost} · สำเร็จ ${tier.successRate}% · ATK+${tier.atkBonus}/DEF+${tier.defBonus} · ${escapeHtml(dndForgeFailPolicyLabels[tier.failPolicy] || tier.failPolicy)}</div>
          ${tier.desc ? `<div class="dndShopItemDesc">${escapeHtml(tier.desc)}</div>` : ''}
        </div>
        <button type="button" class="dndShopItemDelBtn" data-itemdel="${shop.id}:${tier.id}">ลบ</button>
      </div>`).join('') : `<div class="dndRangeHint">ร้านนี้ยังไม่มีระดับตีบวก</div>`;
    bodyHtml += `
      <div class="dndShopAddItemRow">
        <input type="text" placeholder="ชื่อระดับ เช่น +4" data-tiername="${shop.id}" maxlength="40" style="max-width:70px;">
        <input type="number" placeholder="ค่าตี (ทอง)" data-tiercost="${shop.id}" min="0" style="max-width:90px;">
        <input type="number" placeholder="โอกาสสำเร็จ %" data-tiersuccess="${shop.id}" min="1" max="100" style="max-width:100px;">
        <input type="number" placeholder="ATK โบนัส" data-tieratk="${shop.id}" min="0" style="max-width:80px;">
        <input type="number" placeholder="DEF โบนัส" data-tierdef="${shop.id}" min="0" style="max-width:80px;">
        <select data-tierfail="${shop.id}">
          <option value="safe">พลาด: ไม่มีอะไรเกิดขึ้น</option>
          <option value="downgrade">พลาด: ตกระดับ 1 ขั้น</option>
          <option value="break">พลาด: ไอเทมพัง (รีเซต +0)</option>
        </select>
        <input type="text" placeholder="คำอธิบาย (ไม่บังคับ)" data-tierdesc="${shop.id}" maxlength="150">
        <button type="button" data-addtier="${shop.id}">➕ เพิ่มระดับตีบวก</button>
      </div>`;
    return bodyHtml;
  }
  bodyHtml = dndEquipSlots.map(slot => {
    const item = myEquipment[slot];
    const label = dndEquipSlotLabels[slot] || slot;
    const icon = DND_EQUIP_SLOT_ICONS[slot] || '';
    if (!item || !item.name) {
      return `<div class="dndForgeSlotRow"><div class="dndForgeSlotHead"><div class="dndForgeSlotName">${icon} ${escapeHtml(label)}</div></div><div class="dndRangeHint">ยังไม่ได้สวมใส่${escapeHtml(label)}อยู่</div></div>`;
    }
    const plus = Number(item.plus) || 0;
    const tier = shop.items[plus];
    let actionHtml;
    if (!tier) {
      actionHtml = `<div class="dndForgeMaxedTag">🌟 ตีบวกถึงระดับสูงสุดที่ร้านนี้ตั้งไว้แล้ว (+${plus})</div>`;
    } else {
      const canForge = myGold >= tier.cost;
      actionHtml = `
        <div class="dndForgeNextInfo">ตีบวกเป็น ${escapeHtml(tier.name)}: 💰 ${tier.cost} · โอกาสสำเร็จ ${tier.successRate}% · สำเร็จได้ ATK+${tier.atkBonus}/DEF+${tier.defBonus} · ${escapeHtml(dndForgeFailPolicyLabels[tier.failPolicy] || tier.failPolicy)}</div>
        <button type="button" class="dndForgeAttemptBtn" data-forge="${shop.id}:${slot}" ${canForge ? '' : 'disabled'}>⚒️ ตีบวก</button>`;
    }
    return `
      <div class="dndForgeSlotRow">
        <div class="dndForgeSlotHead">
          <div class="dndForgeSlotName">${icon} ${escapeHtml(label)}: ${escapeHtml(item.name)}${plus > 0 ? ` <span class="dndForgePlusTag">+${plus}</span>` : ''}</div>
        </div>
        ${actionHtml}
      </div>`;
  }).join('');
  return bodyHtml;
}

// ---- กระเป๋าไอเทม / แลกเปลี่ยนระหว่างผู้เล่น / DM มอบ-เรียกคืนไอเทม ----
function dndPlayerById(id) { return dndPlayersList.find(p => p.id === Number(id)); }
// เพื่อนร่วมทีม: ไม่ใช่ DM, ไม่ใช่ตัวเอง, และสร้างการ์ดตัวละครแล้ว
function dndTeammates() {
  return dndPlayersList.filter(p => !p.isDM && dndYou && p.id !== dndYou.id && p.character && p.character.locked);
}
function dndTradeSideLabel(items, gold) {
  const parts = [];
  if (gold) parts.push(`💰 ${gold}`);
  (items || []).forEach(it => parts.push(`${it.name} x${it.qty}`));
  return parts.length ? parts.join(', ') : '(ไม่มี)';
}
function dndPickedToItemList(picked) {
  return Object.keys(picked).filter(k => picked[k] > 0).map(name => ({ name, qty: picked[name] }));
}
function renderDndTradePickList(containerId, bag, picked) {
  const box = document.getElementById(containerId);
  if (!box) return;
  if (!bag.length) { box.innerHTML = `<div class="dndRangeHint">ไม่มีไอเทม</div>`; return; }
  box.innerHTML = bag.map(it => {
    const cur = Math.min(picked[it.name] || 0, it.qty);
    return `
      <div class="dndTradeItemPickRow">
        <span class="dndTradeItemPickName">${escapeHtml(it.name)} <span class="dndRangeHint">(มี ${it.qty})</span></span>
        <input type="number" min="0" max="${it.qty}" value="${cur}" data-pickname="${escapeHtml(it.name)}" data-pickmax="${it.qty}">
      </div>`;
  }).join('');
  box.querySelectorAll('input[data-pickname]').forEach(inp => {
    inp.onchange = () => {
      const name = inp.dataset.pickname;
      const max = Number(inp.dataset.pickmax);
      const v = Math.max(0, Math.min(max, Math.round(Number(inp.value) || 0)));
      inp.value = v;
      if (v > 0) picked[name] = v; else delete picked[name];
    };
  });
}
function renderDndTradeForm() {
  const sel = document.getElementById('dndTradeTargetSelect');
  const mates = dndTeammates();
  const prevVal = dndTradeTargetId;
  sel.innerHTML = mates.length
    ? mates.map(p => `<option value="${p.id}">${escapeHtml(p.character.charName || p.name)}</option>`).join('')
    : `<option value="">(ยังไม่มีเพื่อนร่วมทีมให้แลกเปลี่ยนตอนนี้)</option>`;
  if (prevVal && mates.some(p => p.id === Number(prevVal))) sel.value = String(prevVal);
  dndTradeTargetId = sel.value ? Number(sel.value) : null;

  const me = myDndEntry();
  const myBag = (me && me.character && me.character.bag) || [];
  const targetP = dndTradeTargetId ? dndPlayerById(dndTradeTargetId) : null;
  const targetBag = (targetP && targetP.character && targetP.character.bag) || [];

  renderDndTradePickList('dndTradeOfferItems', myBag, dndTradeOfferPicked);
  renderDndTradePickList('dndTradeRequestItems', targetBag, dndTradeRequestPicked);

  sel.onchange = () => {
    dndTradeTargetId = sel.value ? Number(sel.value) : null;
    dndTradeRequestPicked = {};
    renderDndTradeForm();
  };
}
function renderDndTradeLists() {
  const meId = dndYou ? dndYou.id : null;
  const incoming = dndTrades.filter(t => t.toId === meId);
  const outgoing = dndTrades.filter(t => t.fromId === meId);

  const inBox = document.getElementById('dndTradeIncomingList');
  inBox.innerHTML = incoming.length ? incoming.map(t => `
    <div class="dndTradeCard">
      <div class="dndTradeCardHead">${escapeHtml(t.fromName)} เสนอแลกเปลี่ยนกับคุณ</div>
      <div class="dndTradeCardRow"><span>เขาจะให้คุณ</span><span>${escapeHtml(dndTradeSideLabel(t.offerItems, t.offerGold))}</span></div>
      <div class="dndTradeCardRow"><span>เขาขอจากคุณ</span><span>${escapeHtml(dndTradeSideLabel(t.requestItems, t.requestGold))}</span></div>
      <div class="dndTradeCardBtnRow">
        <button type="button" class="dndTradeAcceptBtn" data-accept="${t.id}">✅ ยอมรับ</button>
        <button type="button" class="dndTradeDeclineBtn" data-decline="${t.id}">❌ ปฏิเสธ</button>
      </div>
    </div>`).join('') : `<div class="dndRangeHint">ยังไม่มีข้อเสนอ</div>`;

  const outBox = document.getElementById('dndTradeOutgoingList');
  outBox.innerHTML = outgoing.length ? outgoing.map(t => `
    <div class="dndTradeCard">
      <div class="dndTradeCardHead">เสนอแลกเปลี่ยนกับ ${escapeHtml(t.toName)}</div>
      <div class="dndTradeCardRow"><span>คุณจะให้</span><span>${escapeHtml(dndTradeSideLabel(t.offerItems, t.offerGold))}</span></div>
      <div class="dndTradeCardRow"><span>คุณขอ</span><span>${escapeHtml(dndTradeSideLabel(t.requestItems, t.requestGold))}</span></div>
      <div class="dndTradeCardBtnRow">
        <button type="button" class="dndTradeCancelBtn" data-cancel="${t.id}">ยกเลิก</button>
      </div>
    </div>`).join('') : `<div class="dndRangeHint">ยังไม่มีข้อเสนอ</div>`;

  inBox.querySelectorAll('button[data-accept]').forEach(btn => {
    btn.onclick = (ev) => { flashBtn(ev.currentTarget); send({ type: 'dndTradeRespond', tradeId: Number(btn.dataset.accept), accept: true }); };
  });
  inBox.querySelectorAll('button[data-decline]').forEach(btn => {
    btn.onclick = (ev) => { flashBtn(ev.currentTarget); send({ type: 'dndTradeRespond', tradeId: Number(btn.dataset.decline), accept: false }); };
  });
  outBox.querySelectorAll('button[data-cancel]').forEach(btn => {
    btn.onclick = (ev) => { flashBtn(ev.currentTarget); send({ type: 'dndTradeCancel', tradeId: Number(btn.dataset.cancel) }); };
  });
}
function renderDndGiveTargetOptions() {
  const members = dndPlayersList.filter(p => !p.isDM);
  const optionsHtml = members.length
    ? members.map(p => `<option value="${p.id}">${escapeHtml(p.character.charName || p.name)}</option>`).join('')
    : `<option value="">(ยังไม่มีผู้เล่น)</option>`;
  ['dndGiveTargetSelect', 'dndGiveEquipTargetSelect'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const prevVal = sel.value;
    sel.innerHTML = optionsHtml;
    if (prevVal && members.some(p => String(p.id) === prevVal)) sel.value = prevVal;
  });
}
function renderDndAllTrades() {
  const box = document.getElementById('dndAllTradesList');
  box.innerHTML = dndTrades.length ? dndTrades.map(t => `
    <div class="dndTradeCard">
      <div class="dndTradeCardHead">${escapeHtml(t.fromName)} → ${escapeHtml(t.toName)}</div>
      <div class="dndTradeCardRow"><span>ให้</span><span>${escapeHtml(dndTradeSideLabel(t.offerItems, t.offerGold))}</span></div>
      <div class="dndTradeCardRow"><span>ขอ</span><span>${escapeHtml(dndTradeSideLabel(t.requestItems, t.requestGold))}</span></div>
    </div>`).join('') : `<div class="dndRangeHint">ไม่มีการแลกเปลี่ยนที่กำลังดำเนินอยู่</div>`;
}
function dndItemEffectLabel(e) {
  if (e.effectType === 'heal') return `❤️ ฟื้นฟู HP ${e.value} (ปลุกคนหมดสติไม่ได้)`;
  if (e.effectType === 'revive') return `🌟 ชุบชีวิต + ฟื้นฟู HP ${e.value}`;
  if (e.effectType === 'gold') return `💰 ให้ทอง ${e.value}`;
  if (e.effectType === 'none') return `📦 ไม่มีผลพิเศษ (ใช้แล้วหายไป)${e.desc ? ` — ${e.desc}` : ''}`;
  const slotLabel = dndEquipSlotLabels[e.slot] || e.slot;
  return `🛡️ สวมใส่เป็น${slotLabel} (ATK+${e.atk||0} / DEF+${e.def||0}${e.maxDurability ? ` / ทน ${e.maxDurability}` : ''})`;
}
function renderDndItemEffectList() {
  const box = document.getElementById('dndItemEffectList');
  if (!box) return;
  box.innerHTML = dndItemEffects.length ? dndItemEffects.map(e => `
    <div class="dndTradeCard">
      <div class="dndTradeCardHead">${escapeHtml(e.name)}</div>
      ${e.icon ? `<img src="${e.icon}" class="dndEquipItemIcon" style="max-height:48px;" alt="">` : ''}
      <div class="dndTradeCardRow"><span>ผล</span><span>${dndItemEffectLabel(e)}</span></div>
      <div class="dndTradeCardBtnRow">
        <button type="button" class="dndTradeDeclineBtn" data-delitemeffect="${e.id}">🗑️ ลบ</button>
      </div>
    </div>`).join('') : `<div class="dndRangeHint">ยังไม่มีไอเทมใช้งานที่ตั้งค่าไว้</div>`;
  box.querySelectorAll('button[data-delitemeffect]').forEach(btn => {
    btn.onclick = (ev) => { flashBtn(ev.currentTarget); send({ type: 'dndItemEffectDelete', itemId: Number(btn.dataset.delitemeffect) }); };
  });
}
// ต้องตรงกับ DND_ARMOR_REPAIR_COST_PER_POINT ฝั่ง server.js — ใช้แค่โชว์ราคาโดยประมาณ ราคาจริงคำนวณที่ server เสมอ
const DND_ARMOR_REPAIR_COST_PER_POINT_CLIENT = 5;
function renderDndArmorRepair() {
  const box = document.getElementById('dndArmorRepairBox');
  if (!box) return;
  const me = myDndEntry();
  const armor = me && me.character && me.character.equipment && me.character.equipment.armor;
  if (!armor || !armor.name || !(armor.maxDurability > 0)) { box.innerHTML = ''; return; }
  const missing = armor.maxDurability - armor.durability;
  if (missing <= 0) {
    box.innerHTML = `<div class="dndRangeHint">🛡️ เกราะ "${escapeHtml(armor.name)}" คงทนเต็ม (${armor.durability}/${armor.maxDurability})</div>`;
    return;
  }
  const cost = missing * DND_ARMOR_REPAIR_COST_PER_POINT_CLIENT;
  const broken = dndEquipSlotBrokenClient(armor);
  box.innerHTML = `
    <div class="dndRangeHint">🛡️ เกราะ "${escapeHtml(armor.name)}" คงทน ${armor.durability}/${armor.maxDurability}${broken ? ' <span class="dndEquipBrokenTag">💔 ชำรุด</span>' : ''}</div>
    <button type="button" id="dndRepairArmorBtn">🛠️ ซ่อมเกราะ (${cost} ทอง)</button>`;
  document.getElementById('dndRepairArmorBtn').onclick = (ev) => {
    flashBtn(ev.currentTarget);
    send({ type: 'dndRepairArmor' });
  };
}
function renderDndBag() {
  const isDM = !!(dndYou && dndYou.isDM);
  const canTrade = !isDM && dndYou && dndYou.locked;
  document.getElementById('dndMyBagSection').style.display = canTrade ? 'block' : 'none';
  document.getElementById('dndTradeSection').style.display = canTrade ? 'block' : 'none';
  document.getElementById('dndGiveItemBox').style.display = isDM ? 'block' : 'none';

  if (canTrade) {
    const me = myDndEntry();
    const bag = (me && me.character && me.character.bag) || [];
    const gold = (me && me.character && me.character.gold) || 0;
    document.getElementById('dndBagGoldVal').textContent = gold;
    const bagListEl = document.getElementById('dndMyBagList');
    const iAmDead = amIDead();
    bagListEl.innerHTML = bag.length
      ? bag.map(it => {
          const def = dndItemEffects.find(e => e.name === it.name);
          if (!def) return `<span class="dndBagChip">${escapeHtml(it.name)} x${it.qty}</span>`;
          const disabledAttr = iAmDead ? ' disabled' : '';
          return `<span class="dndBagChip dndBagChipUsable">${escapeHtml(it.name)} x${it.qty} <button type="button" class="dndBagUseBtn" data-usename="${escapeHtml(it.name)}" data-efftype="${escapeHtml(def.effectType || '')}"${disabledAttr}>ใช้</button></span>`;
        }).join('')
      : `<span class="dndRangeHint">กระเป๋าว่างเปล่า</span>`;
    bagListEl.querySelectorAll('button[data-usename]').forEach(btn => {
      btn.onclick = (ev) => {
        if (amIDead()) { showDndErrorToast('คุณหมดสติอยู่ ทำอะไรไม่ได้จนกว่าจะมีคนใช้ไอเทมชุบให้ หรือ DM เพิ่ม HP ให้'); return; }
        flashBtn(ev.currentTarget);
        const itemName = btn.dataset.usename;
        if (btn.dataset.efftype === 'heal' || btn.dataset.efftype === 'revive') {
          openDndTargetPicker({ mode: 'useItem', itemName, title: `ใช้ "${itemName}" กับใคร?`, effType: btn.dataset.efftype });
        } else {
          send({ type: 'dndUseItem', name: itemName });
        }
      };
    });
    renderDndArmorRepair();
    renderDndTradeForm();
    renderDndTradeLists();
  }
  if (isDM) {
    renderDndGiveTargetOptions();
    renderDndItemEffectList();
    renderDndAllTrades();
  }
}
document.getElementById('dndTradeOfferBtn').onclick = (ev) => {
  if (!dndTradeTargetId) { showDndErrorToast('กรุณาเลือกเพื่อนร่วมทีมที่จะแลกเปลี่ยนด้วย'); return; }
  flashBtn(ev.currentTarget);
  send({
    type: 'dndTradeOffer',
    trade: {
      toId: dndTradeTargetId,
      offerItems: dndPickedToItemList(dndTradeOfferPicked),
      offerGold: document.getElementById('dndTradeOfferGold').value,
      requestItems: dndPickedToItemList(dndTradeRequestPicked),
      requestGold: document.getElementById('dndTradeRequestGold').value,
    },
  });
  dndTradeOfferPicked = {};
  dndTradeRequestPicked = {};
  document.getElementById('dndTradeOfferGold').value = 0;
  document.getElementById('dndTradeRequestGold').value = 0;
};
document.getElementById('dndGiveItemBtn').onclick = (ev) => {
  const targetId = Number(document.getElementById('dndGiveTargetSelect').value);
  const name = document.getElementById('dndGiveItemName').value.trim();
  const qty = document.getElementById('dndGiveItemQty').value;
  if (!targetId || !name) { showDndErrorToast('กรุณาเลือกผู้เล่นและระบุชื่อไอเทม'); return; }
  flashBtn(ev.currentTarget);
  send({ type: 'dndGiveItem', targetId, name, qty });
  document.getElementById('dndGiveItemName').value = '';
};
document.getElementById('dndTakeItemBtn').onclick = (ev) => {
  const targetId = Number(document.getElementById('dndGiveTargetSelect').value);
  const name = document.getElementById('dndGiveItemName').value.trim();
  const qty = document.getElementById('dndGiveItemQty').value;
  if (!targetId || !name) { showDndErrorToast('กรุณาเลือกผู้เล่นและระบุชื่อไอเทม'); return; }
  flashBtn(ev.currentTarget);
  send({ type: 'dndTakeItem', targetId, name, qty });
  document.getElementById('dndGiveItemName').value = '';
};
let dndItemEffectIconData = '';
let dndGiveEquipIconData = '';
function dndWireIconFileInput(fileInputId, previewId, onLoaded) {
  const fileInput = document.getElementById(fileInputId);
  const preview = document.getElementById(previewId);
  if (!fileInput) return;
  fileInput.onchange = () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (file.size > 250000) { showDndErrorToast('รูปใหญ่เกินไป (จำกัดประมาณ 250KB)'); fileInput.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => {
      onLoaded(reader.result);
      if (preview) { preview.src = reader.result; preview.style.display = 'block'; }
    };
    reader.readAsDataURL(file);
  };
}
dndWireIconFileInput('dndItemEffectIconFile', 'dndItemEffectIconPreview', (dataUrl) => { dndItemEffectIconData = dataUrl; });
dndWireIconFileInput('dndGiveEquipIconFile', 'dndGiveEquipIconPreview', (dataUrl) => { dndGiveEquipIconData = dataUrl; });
function dndToggleItemEffectFields() {
  const effectType = document.getElementById('dndItemEffectType').value;
  const isEquip = effectType === 'equip';
  const isNone = effectType === 'none';
  document.getElementById('dndItemEffectValueRow').style.display = (isEquip || isNone) ? 'none' : 'flex';
  document.getElementById('dndItemEffectEquipRow').style.display = isEquip ? 'flex' : 'none';
  document.getElementById('dndItemEffectNoneRow').style.display = isNone ? 'flex' : 'none';
}
document.getElementById('dndItemEffectType').onchange = dndToggleItemEffectFields;
dndToggleItemEffectFields();
document.getElementById('dndItemEffectAddBtn').onclick = (ev) => {
  const name = document.getElementById('dndItemEffectName').value.trim();
  const effectType = document.getElementById('dndItemEffectType').value;
  const value = document.getElementById('dndItemEffectValue').value;
  const slot = document.getElementById('dndItemEffectSlot').value;
  const atk = document.getElementById('dndItemEffectAtk').value;
  const def = document.getElementById('dndItemEffectDef').value;
  const maxDurability = document.getElementById('dndItemEffectDurability').value;
  const desc = document.getElementById('dndItemEffectDesc').value.trim();
  if (!name) { showDndErrorToast('กรุณาตั้งชื่อไอเทม'); return; }
  flashBtn(ev.currentTarget);
  send({ type: 'dndItemEffectCreate', item: { name, effectType, value, slot, atk, def, maxDurability, desc, icon: dndItemEffectIconData } });
  document.getElementById('dndItemEffectName').value = '';
  document.getElementById('dndItemEffectValue').value = 0;
  document.getElementById('dndItemEffectAtk').value = 0;
  document.getElementById('dndItemEffectDef').value = 0;
  document.getElementById('dndItemEffectDurability').value = 0;
  document.getElementById('dndItemEffectDesc').value = '';
  document.getElementById('dndItemEffectIconFile').value = '';
  document.getElementById('dndItemEffectIconPreview').style.display = 'none';
  dndItemEffectIconData = '';
};
document.getElementById('dndGiveEquipBtn').onclick = (ev) => {
  const targetId = Number(document.getElementById('dndGiveEquipTargetSelect').value);
  const slot = document.getElementById('dndGiveEquipSlot').value;
  const name = document.getElementById('dndGiveEquipName').value.trim();
  const atk = document.getElementById('dndGiveEquipAtk').value;
  const def = document.getElementById('dndGiveEquipDef').value;
  const maxDurability = document.getElementById('dndGiveEquipDurability').value;
  if (!targetId || !name) { showDndErrorToast('กรุณาเลือกผู้เล่นและระบุชื่ออุปกรณ์'); return; }
  flashBtn(ev.currentTarget);
  send({ type: 'dndGiveEquip', targetId, item: { slot, name, atk, def, maxDurability, icon: dndGiveEquipIconData } });
  document.getElementById('dndGiveEquipName').value = '';
  document.getElementById('dndGiveEquipAtk').value = 0;
  document.getElementById('dndGiveEquipDef').value = 0;
  document.getElementById('dndGiveEquipDurability').value = 0;
  document.getElementById('dndGiveEquipIconFile').value = '';
  document.getElementById('dndGiveEquipIconPreview').style.display = 'none';
  dndGiveEquipIconData = '';
};

// รายการลำดับเทิร์นที่ DM จัดเรียงเอง — ถ้ายังไม่เคยตั้งลำดับ ให้เริ่มจากลำดับที่ทุกคนเข้าห้องมาก่อน
function dndTurnOrderIds() {
  if (dndTurnOrderClient.length) return dndTurnOrderClient;
  return dndPlayersList.filter(p => !p.isDM).map(p => p.id);
}
function renderDndTurnBox() {
  const box = document.getElementById('dndTurnOrderList');
  if (!box) return;
  const ids = dndTurnOrderIds();
  const byId = {};
  dndPlayersList.forEach(p => { byId[p.id] = p; });
  if (!ids.length) { box.innerHTML = `<div class="dndRangeHint">ยังไม่มีผู้เล่นในปาร์ตี้</div>`; return; }
  box.innerHTML = '';
  ids.forEach((id, idx) => {
    const p = byId[id];
    if (!p) return;
    const row = document.createElement('div');
    const isCurrent = dndTurnIndexClient >= 0 && dndCurrentTurnPlayerId === id;
    row.className = 'dndTurnRow' + (isCurrent ? ' current' : '');
    row.innerHTML = `
      <span class="dndTurnRowName">${isCurrent ? '🎯 ' : ''}${escapeHtml(p.character.charName || p.name)}</span>
      <button type="button" data-act="up">↑</button>
      <button type="button" data-act="down">↓</button>`;
    row.querySelector('[data-act="up"]').disabled = idx === 0;
    row.querySelector('[data-act="down"]').disabled = idx === ids.length - 1;
    row.querySelector('[data-act="up"]').onclick = () => dndTurnReorder(idx, idx - 1);
    row.querySelector('[data-act="down"]').onclick = () => dndTurnReorder(idx, idx + 1);
    box.appendChild(row);
  });
}
function dndTurnReorder(from, to) {
  const ids = dndTurnOrderIds().slice();
  if (to < 0 || to >= ids.length) return;
  const [moved] = ids.splice(from, 1);
  ids.splice(to, 0, moved);
  send({ type: 'dndTurnSetOrder', order: ids });
}
document.getElementById('dndTurnStartBtn').onclick = () => send({ type: 'dndTurnStart' });
document.getElementById('dndTurnNextBtn').onclick = () => send({ type: 'dndTurnNext' });
document.getElementById('dndTurnStopBtn').onclick = () => send({ type: 'dndTurnStop' });

// ================== แผนที่การต่อสู้ (Battle Map) ==================
function dndMyToken() {
  if (!dndYou) return null;
  return dndTokens.find(t => t.kind === 'pc' && t.ownerId === dndYou.id) || null;
}
function dndCanDragToken(t) {
  if (!dndYou) return false;
  if (dndYou.isDM) return true;
  if (t.kind === 'pc' && t.ownerId === dndYou.id && Number(t.hp) <= 0) return false; // หมดสติ ลาก token ตัวเองไม่ได้
  return t.kind === 'pc' && t.ownerId === dndYou.id;
}
function dndTokenInitials(name) {
  return (name || '?').trim().slice(0, 2).toUpperCase();
}
function dndTokenBgStyle(t) {
  return t.image ? `background-image:url('${t.image}'); background-color:transparent;` : `background-color:${t.color || '#6fd3ff'};`;
}
let dndMapMoveThrottle = {}; // id -> last-sent timestamp, ป้องกันยิง WS ถี่เกินระหว่างลาก
function dndSendTokenMove(id, x, y, force) {
  const now = Date.now();
  if (!force && dndMapMoveThrottle[id] && now - dndMapMoveThrottle[id] < 100) return;
  dndMapMoveThrottle[id] = now;
  send({ type: 'dndTokenMove', id, x, y });
}
function dndAttachTokenDrag(el, tokenId) {
  el.addEventListener('pointerdown', ev => {
    const t = dndTokens.find(tt => tt.id === tokenId);
    if (!t || !dndCanDragToken(t)) return;
    ev.preventDefault();
    const canvas = document.getElementById('dndMapCanvas');
    dndDraggingId = tokenId;
    el.classList.add('dndTokenDragging');
    el.setPointerCapture(ev.pointerId);
    const move = (mev) => {
      const rect = canvas.getBoundingClientRect();
      let x = ((mev.clientX - rect.left) / rect.width) * 100;
      let y = ((mev.clientY - rect.top) / rect.height) * 100;
      x = Math.max(0, Math.min(100, x));
      y = Math.max(0, Math.min(100, y));
      el.style.left = x + '%';
      el.style.top = y + '%';
      dndSendTokenMove(tokenId, x, y, false);
    };
    const up = (uev) => {
      el.classList.remove('dndTokenDragging');
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      const rect = canvas.getBoundingClientRect();
      let x = ((uev.clientX - rect.left) / rect.width) * 100;
      let y = ((uev.clientY - rect.top) / rect.height) * 100;
      x = Math.max(0, Math.min(100, x));
      y = Math.max(0, Math.min(100, y));
      dndSendTokenMove(tokenId, x, y, true); // ส่งตำแหน่งสุดท้ายเสมอตอนปล่อยมือ
      dndDraggingId = null;
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  });
}
function renderDndMapTabs() {
  const row = document.getElementById('dndMapTabsRow');
  const label = document.getElementById('dndMapCurrentLabel');
  if (!row) return;
  const isDM = !!(dndYou && dndYou.isDM);
  const current = dndMaps.find(m => m.id === dndCurrentMapId);
  if (!isDM) {
    row.innerHTML = '';
    row.style.display = 'none';
    if (label) {
      label.style.display = dndMaps.length > 1 ? 'block' : 'none';
      label.textContent = current ? `📍 แผนที่: ${current.name}` : '';
    }
    return;
  }
  row.style.display = 'flex';
  if (label) label.style.display = 'none';
  row.innerHTML = dndMaps.map(m => `
    <div class="dndMapTab${m.id === dndCurrentMapId ? ' active' : ''}" data-switch="${m.id}" title="ดับเบิลคลิกเพื่อเปลี่ยนชื่อ">
      ${escapeHtml(m.name)}
      <span class="dndMapTabDel" data-mapdel="${m.id}" title="ลบแผนที่นี้">✕</span>
    </div>
  `).join('') + '<button type="button" id="dndMapAddBtn">+ สร้างแผนที่ใหม่</button>';
  row.querySelectorAll('.dndMapTab').forEach(el => {
    el.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-mapdel]')) return;
      send({ type: 'dndMapSwitch', mapId: Number(el.dataset.switch) });
    });
    el.addEventListener('dblclick', (ev) => {
      ev.stopPropagation();
      const map = dndMaps.find(mm => mm.id === Number(el.dataset.switch));
      const newName = prompt('เปลี่ยนชื่อแผนที่:', map ? map.name : '');
      if (newName === null || !newName.trim()) return;
      send({ type: 'dndMapRename', mapId: Number(el.dataset.switch), name: newName });
    });
  });
  row.querySelectorAll('[data-mapdel]').forEach(el => {
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (dndMaps.length <= 1) { alert('ต้องมีอย่างน้อย 1 แผนที่เสมอ ลบแผนที่สุดท้ายไม่ได้'); return; }
      if (confirm('ลบแผนที่นี้? มอนสเตอร์ทั้งหมดบนแผนที่นี้จะหายไปด้วย')) {
        send({ type: 'dndMapDelete', mapId: Number(el.dataset.mapdel) });
      }
    });
  });
  const addBtn = document.getElementById('dndMapAddBtn');
  if (addBtn) addBtn.onclick = () => {
    const name = prompt('ตั้งชื่อแผนที่ใหม่:', `แผนที่ ${dndMaps.length + 1}`);
    if (name === null) return;
    send({ type: 'dndMapCreate', name });
  };
  const heading = document.getElementById('dndMapBgHeading');
  if (heading) heading.textContent = `🖼️ พื้นหลังแผนที่ "${current ? current.name : ''}" (DM)`;
}
function renderDndMapBackground() {
  const canvas = document.getElementById('dndMapCanvas');
  if (!canvas) return;
  if (dndMapBackground) {
    canvas.style.backgroundImage = `linear-gradient(to right, rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.07) 1px, transparent 1px), url("${dndMapBackground}")`;
    canvas.style.backgroundSize = '10% 10%, 10% 10%, cover';
    canvas.style.backgroundPosition = '0 0, 0 0, center';
    canvas.style.backgroundRepeat = 'repeat, repeat, no-repeat';
  } else {
    canvas.style.backgroundImage = 'linear-gradient(to right, rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.07) 1px, transparent 1px)';
    canvas.style.backgroundSize = '10% 10%';
    canvas.style.backgroundPosition = '0 0';
    canvas.style.backgroundRepeat = 'repeat';
  }
}
function renderDndMap() {
  const canvas = document.getElementById('dndMapCanvas');
  renderDndMapBackground();
  if (!canvas) return;
  const seenIds = new Set();
  for (const t of dndTokens) {
    seenIds.add(t.id);
    let el = dndTokenEls[t.id];
    if (!el) {
      el = document.createElement('div');
      el.className = 'dndToken';
      el.innerHTML = '<span class="dndTokenInner"></span><span class="dndTokenLabel"></span><span class="dndTokenAcBadge"></span><span class="dndTokenStatusRow"></span><span class="dndTokenHpWrap"><span class="dndTokenHpBarFill"></span></span>';
      canvas.appendChild(el);
      dndTokenEls[t.id] = el;
      dndAttachTokenDrag(el, t.id);
    }
    const canDrag = dndCanDragToken(t);
    el.classList.toggle('dndTokenMine', canDrag && !(dndYou && dndYou.isDM));
    el.classList.toggle('dndTokenDm', canDrag && !!(dndYou && dndYou.isDM));
    if (dndDraggingId !== t.id) {
      el.style.left = t.x + '%';
      el.style.top = t.y + '%';
    }
    if (t.image) {
      el.style.backgroundImage = `url('${t.image}')`;
      el.style.backgroundColor = 'transparent';
    } else {
      el.style.backgroundImage = 'none';
      el.style.backgroundColor = t.color || '#6fd3ff';
    }
    const inner = el.querySelector('.dndTokenInner');
    inner.textContent = t.image ? '' : dndTokenInitials(t.name);
    el.querySelector('.dndTokenLabel').textContent = t.name;
    el.title = t.name + (t.kind === 'npc' ? ' (NPC)' : '');
    el.querySelector('.dndTokenAcBadge').textContent = '🛡' + (t.ac != null ? t.ac : '-');
    const maxHp = t.maxHp || 0;
    const pct = maxHp > 0 ? Math.max(0, Math.min(100, Math.round((t.hp / maxHp) * 100))) : 0;
    const fill = el.querySelector('.dndTokenHpBarFill');
    const hpWrap = el.querySelector('.dndTokenHpWrap');
    // ไม่บอกเลือดที่เหลือของมอนสเตอร์ (npc) บนแผนที่ให้ผู้เล่นเห็น — DM เท่านั้นที่เห็น
    const hideHp = t.kind === 'npc' && !(dndYou && dndYou.isDM);
    hpWrap.style.display = hideHp ? 'none' : '';
    if (!hideHp) {
      fill.style.width = pct + '%';
      fill.className = 'dndTokenHpBarFill' + (pct <= 25 ? ' low' : pct <= 60 ? ' mid' : '');
      hpWrap.title = `${t.hp}/${maxHp} HP`;
    }
    const statusRow = el.querySelector('.dndTokenStatusRow');
    const statuses = t.statuses || [];
    statusRow.innerHTML = statuses.map(s => {
      const remainSec = s.expiresAt ? Math.max(0, Math.ceil((s.expiresAt - Date.now()) / 1000)) : 0;
      return `<span class="dndTokenStatusDot" title="☠️ ${escapeHtml(s.name)}${s.note ? ' — ' + escapeHtml(s.note) : ''}${s.expiresAt ? ` (คูลดาวน์เหลือ ${remainSec}วิ)` : ''}"></span>`;
    }).join('');
    el.classList.toggle('dndTokenDead', Number(t.hp) <= 0);
    el.classList.toggle('dndTokenLarge', t.size === 'large');
    el.classList.toggle('dndTokenHuge', t.size === 'huge');
  }
  for (const id of Object.keys(dndTokenEls)) {
    if (!seenIds.has(Number(id))) {
      dndTokenEls[id].remove();
      delete dndTokenEls[id];
    }
  }
  renderDndMyTokenColorRow();
  renderDndNpcColorRow();
  renderDndMapNpcList();
  renderDndMapTabs();
  refreshOpenDndModals();
}
// รีเฟรชรายการในหน้าต่างแก้ไขที่เปิดค้างอยู่ (สถานะ/ท่าโจมตี) เมื่อมี state ใหม่เข้ามา โดยไม่ไปรีเซ็ตช่องกรอกข้อความที่ผู้ใช้กำลังพิมพ์อยู่
function refreshOpenDndModals() {
  if (dndDmEditTargetId != null) {
    const p = dndPlayersList.find(pp => pp.id === dndDmEditTargetId);
    if (p) {
      renderDndStatusChips('dndEditStatusList', p.character.statuses || [], 'player', dndDmEditTargetId);
      renderDmEditSkills(p);
    }
  }
  if (dndTokenEditTargetId != null) {
    const t = dndTokens.find(tt => tt.id === dndTokenEditTargetId && tt.kind === 'npc');
    if (t) {
      renderTokenAttackList(t);
      renderDndStatusChips('dndTokenStatusList', t.statuses || [], 'token', dndTokenEditTargetId);
    }
  }
}
function renderDndMyTokenColorRow() {
  const row = document.getElementById('dndMyTokenColorRow');
  const mine = dndMyToken();
  if (!row || !mine) return;
  if (dndMyTokenColor === null) dndMyTokenColor = mine.color;
  row.innerHTML = DND_TOKEN_COLORS.map(c =>
    `<div class="dndTokenColorSwatch${c === mine.color ? ' active' : ''}" style="background:${c};" data-color="${c}"></div>`
  ).join('');
  row.querySelectorAll('.dndTokenColorSwatch').forEach(sw => {
    sw.onclick = () => send({ type: 'dndTokenEdit', id: mine.id, updates: { color: sw.dataset.color } });
  });
}
function renderDndNpcColorRow() {
  const row = document.getElementById('dndNpcColorRow');
  if (!row) return;
  row.innerHTML = DND_TOKEN_COLORS.map(c =>
    `<div class="dndTokenColorSwatch${c === dndNpcFormColor ? ' active' : ''}" style="background:${c};" data-color="${c}"></div>`
  ).join('');
  row.querySelectorAll('.dndTokenColorSwatch').forEach(sw => {
    sw.onclick = () => { dndNpcFormColor = sw.dataset.color; renderDndNpcColorRow(); };
  });
}
function renderDndMapNpcList() {
  const box = document.getElementById('dndMapNpcList');
  if (!box || !dndYou || !dndYou.isDM) { if (box) box.innerHTML = ''; return; }
  const npcs = dndTokens.filter(t => t.kind === 'npc');
  if (!npcs.length) { box.innerHTML = '<div class="dndRangeHint">ยังไม่มี token NPC</div>'; return; }
  box.innerHTML = npcs.map(t => `
    <div class="dndNpcRow">
      <div class="dndNpcSwatch" style="${dndTokenBgStyle(t)}"></div>
      <div class="dndNpcName">${escapeHtml(t.name)} <span style="color:#9aa4b2;">(HP ${t.hp}/${t.maxHp} · AC ${t.ac})</span></div>
      <button type="button" class="dndNpcEditBtn" data-edit="${t.id}">✏️ แก้ไข</button>
      <button type="button" class="dndNpcRollBtn" data-roll="${t.id}">🎲 ทอย</button>
      <button type="button" class="dndNpcCopyBtn" data-copy="${t.id}">📋 คัดลอก</button>
      <button type="button" data-del="${t.id}">ลบ</button>
    </div>
  `).join('');
  box.querySelectorAll('button[data-edit]').forEach(btn => {
    btn.onclick = () => openTokenEdit(Number(btn.dataset.edit));
  });
  box.querySelectorAll('button[data-roll]').forEach(btn => {
    btn.onclick = (ev) => { flashBtn(ev.currentTarget); dndOpenMonsterRoll(npcs.find(n => n.id === Number(btn.dataset.roll))); };
  });
  box.querySelectorAll('button[data-copy]').forEach(btn => {
    btn.onclick = (ev) => { flashBtn(ev.currentTarget); send({ type: 'dndTokenDuplicate', id: Number(btn.dataset.copy) }); };
  });
  box.querySelectorAll('button[data-del]').forEach(btn => {
    btn.onclick = () => send({ type: 'dndTokenDelete', id: Number(btn.dataset.del) });
  });
}
function dndReadImageFile(file, cb) {
  if (!file) { cb(null); return; }
  if (file.size > DND_MAX_TOKEN_IMAGE_BYTES) {
    alert('ไฟล์รูปใหญ่เกินไป (จำกัด ~300KB) กรุณาเลือกรูปที่เล็กกว่านี้');
    cb(undefined);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => cb(reader.result);
  reader.readAsDataURL(file);
}
document.getElementById('dndMyTokenImgInput').addEventListener('change', (ev) => {
  const mine = dndMyToken();
  if (!mine) return;
  dndReadImageFile(ev.target.files[0], (dataUrl) => {
    if (dataUrl === undefined) { ev.target.value = ''; return; }
    if (dataUrl) send({ type: 'dndTokenEdit', id: mine.id, updates: { image: dataUrl } });
    ev.target.value = '';
  });
});
document.getElementById('dndMyTokenImgClearBtn').onclick = () => {
  const mine = dndMyToken();
  if (!mine) return;
  send({ type: 'dndTokenEdit', id: mine.id, updates: { image: null } });
};
document.getElementById('dndTokenEditImgInput').addEventListener('change', (ev) => {
  if (dndTokenEditTargetId == null) { ev.target.value = ''; return; }
  dndReadImageFile(ev.target.files[0], (dataUrl) => {
    if (dataUrl === undefined) { ev.target.value = ''; return; }
    if (dataUrl) send({ type: 'dndTokenEdit', id: dndTokenEditTargetId, updates: { image: dataUrl } });
    ev.target.value = '';
  });
});
document.getElementById('dndTokenEditImgClearBtn').onclick = () => {
  if (dndTokenEditTargetId == null) return;
  send({ type: 'dndTokenEdit', id: dndTokenEditTargetId, updates: { image: null } });
};
document.getElementById('dndNpcImgInput').addEventListener('change', (ev) => {
  dndReadImageFile(ev.target.files[0], (dataUrl) => {
    if (dataUrl === undefined) { ev.target.value = ''; return; }
    dndNpcFormImage = dataUrl || null;
  });
});
function dndRenderMonsterPresetPreview() {
  const key = document.getElementById('dndMonsterPresetSelect').value;
  const m = DND_MONSTER_PRESETS.find(mm => mm.key === key);
  document.getElementById('dndMonsterPresetPreview').textContent = m ? dndMonsterPresetSummary(m) : '';
}
document.getElementById('dndMonsterPresetSelect').addEventListener('change', dndRenderMonsterPresetPreview);
dndRefreshMonsterPresetSelect();
document.getElementById('dndMonsterPresetAddBtn').onclick = (ev) => {
  const key = document.getElementById('dndMonsterPresetSelect').value;
  const m = DND_MONSTER_PRESETS.find(mm => mm.key === key);
  if (!m) return;
  flashBtn(ev.currentTarget);
  send({
    type: 'dndTokenCreate',
    token: Object.assign(
      { name: m.name, color: m.color, image: null, maxHp: m.maxHp, ac: m.ac, size: m.size,
        attacks: m.attacks, expReward: m.expReward, goldReward: m.goldReward, loot: m.loot },
      m.stats,
    ),
  });
};
document.getElementById('dndNpcAddBtn').onclick = (ev) => {
  const name = document.getElementById('dndNpcNameInput').value.trim();
  const errEl = document.getElementById('dndNpcAddError');
  if (!name) { errEl.textContent = 'กรุณาตั้งชื่อ NPC'; return; }
  errEl.textContent = '';
  flashBtn(ev.currentTarget);
  send({
    type: 'dndTokenCreate',
    token: {
      name, color: dndNpcFormColor, image: dndNpcFormImage,
      maxHp: document.getElementById('dndNpcMaxHpInput').value,
      ac: document.getElementById('dndNpcAcInput').value,
      size: document.getElementById('dndNpcSizeInput').value,
    },
  });
  document.getElementById('dndNpcNameInput').value = '';
  document.getElementById('dndNpcImgInput').value = '';
  document.getElementById('dndNpcMaxHpInput').value = '20';
  document.getElementById('dndNpcAcInput').value = '10';
  document.getElementById('dndNpcSizeInput').value = 'normal';
  dndNpcFormImage = null;
};

// ---- DM: หน้าต่างแก้ไข token NPC/มอนสเตอร์ (HP/AC, ท่าโจมตี, สถานะดีบัฟ) ----
function openTokenEdit(tokenId) {
  const t = dndTokens.find(tt => tt.id === tokenId && tt.kind === 'npc');
  if (!t) return;
  dndTokenEditTargetId = tokenId;
  document.getElementById('dndTokenEditTitle').textContent = `แก้ไข Token (DM) — ${t.name}`;
  document.getElementById('dndTokenEditName').value = t.name;
  document.getElementById('dndTokenEditHp').value = t.hp;
  document.getElementById('dndTokenEditMaxHp').value = t.maxHp;
  document.getElementById('dndTokenEditAc').value = t.ac;
  document.getElementById('dndTokenEditSize').value = t.size || 'normal';
  Object.keys(DND_STAT_LABELS).forEach(k => { document.getElementById('dndTokenStat-' + k).value = t[k] != null ? t[k] : 10; });
  dndUpdateTokenStatMods();
  document.getElementById('dndTokenEditExp').value = t.expReward || 0;
  document.getElementById('dndTokenEditGold').value = t.goldReward || 0;
  document.getElementById('dndTokenEditLoot').value = (t.loot || []).map(item => `${item.name} x${item.qty}`).join('\n');
  document.getElementById('dndTokenEditError').textContent = '';
  renderTokenAttackList(t);
  renderDndStatusChips('dndTokenStatusList', t.statuses || [], 'token', tokenId);
  document.getElementById('dndTokenEditOverlay').style.display = 'flex';
}
function dndUpdateTokenStatMods() {
  Object.keys(DND_STAT_LABELS).forEach(k => {
    const input = document.getElementById('dndTokenStat-' + k);
    const modEl = document.getElementById('dndTokenStatMod-' + k);
    if (!input || !modEl) return;
    const score = Number(input.value) || 10;
    const mod = dndAbilityMod(score);
    modEl.textContent = `(${mod >= 0 ? '+' : ''}${mod})`;
  });
}
Object.keys(DND_STAT_LABELS).forEach(k => {
  const input = document.getElementById('dndTokenStat-' + k);
  if (input) input.addEventListener('input', dndUpdateTokenStatMods);
});
function renderTokenAttackList(t) {
  const box = document.getElementById('dndTokenAttackList');
  const attacks = t.attacks || [];
  if (!attacks.length) { box.innerHTML = '<div class="dndRangeHint">ยังไม่มีท่าโจมตี</div>'; return; }
  box.innerHTML = attacks.map(a => {
    const abilityMod = a.stat ? dndAbilityMod(Number(t[a.stat]) || 10) : 0;
    const totalHit = (a.toHit || 0) + abilityMod;
    const totalDmgMod = (a.dmgMod || 0) + abilityMod;
    const hitStr = totalHit ? (totalHit > 0 ? `+${totalHit}` : `${totalHit}`) : '+0';
    const statTag = a.stat ? ` (${DND_STAT_LABELS[a.stat]})` : '';
    const dmgStr = a.dmgDie ? `${a.dmgCount}d${a.dmgDie}${totalDmgMod ? (totalDmgMod > 0 ? '+' + totalDmgMod : totalDmgMod) : ''}` : 'ไม่มีดาเมจ';
    const aoeTag = a.aoeRadius > 0 ? ` · 💥 AOE รัศมี ${a.aoeRadius}` : '';
    return `
    <div class="dndAttackRow">
      <div class="dndAttackInfo">
        <div class="dndAttackName">${escapeHtml(a.name)}${statTag}</div>
        <div class="dndAttackDice">ทอยโจมตี 1d20${hitStr} · ดาเมจ ${dmgStr}${aoeTag}${a.desc ? ' · ' + escapeHtml(a.desc) : ''}</div>
      </div>
      <button type="button" class="dndAttackUseBtn" data-use="${a.id}">🎲 ทอย</button>
      <button type="button" class="dndAttackDelBtn" data-adel="${a.id}">ลบ</button>
    </div>`;
  }).join('');
  box.querySelectorAll('button[data-use]').forEach(btn => {
    const attack = attacks.find(a => a.id === Number(btn.dataset.use));
    btn.onclick = (ev) => {
      flashBtn(ev.currentTarget);
      openDndTargetPicker({
        mode: 'npcAttack',
        tokenId: t.id,
        attackId: Number(btn.dataset.use),
        title: `เลือกเป้าหมายสำหรับ ${t.name}${attack ? ` — ${attack.name}` : ''}`
      });
    };
  });
  box.querySelectorAll('button[data-adel]').forEach(btn => {
    btn.onclick = () => send({ type: 'dndTokenAttackDelete', tokenId: t.id, attackId: Number(btn.dataset.adel) });
  });
}
document.getElementById('dndTokenEditSaveBtn').onclick = (ev) => {
  if (dndTokenEditTargetId == null) return;
  const name = document.getElementById('dndTokenEditName').value.trim();
  if (!name) { document.getElementById('dndTokenEditError').textContent = 'กรุณาตั้งชื่อ'; return; }
  flashBtn(ev.currentTarget);
  send({
    type: 'dndTokenEdit',
    id: dndTokenEditTargetId,
    updates: {
      name,
      hp: document.getElementById('dndTokenEditHp').value,
      maxHp: document.getElementById('dndTokenEditMaxHp').value,
      ac: document.getElementById('dndTokenEditAc').value,
      size: document.getElementById('dndTokenEditSize').value,
      str: document.getElementById('dndTokenStat-str').value,
      dex: document.getElementById('dndTokenStat-dex').value,
      con: document.getElementById('dndTokenStat-con').value,
      int: document.getElementById('dndTokenStat-int').value,
      wis: document.getElementById('dndTokenStat-wis').value,
      cha: document.getElementById('dndTokenStat-cha').value,
      expReward: document.getElementById('dndTokenEditExp').value,
      goldReward: document.getElementById('dndTokenEditGold').value,
      loot: document.getElementById('dndTokenEditLoot').value.split('\n').map(line => {
        const m = line.trim().match(/^(.*?)(?:\s+x(\d+))?$/i);
        return m && m[1] ? { name: m[1].trim(), qty: Number(m[2] || 1) } : null;
      }).filter(Boolean),
    },
  });
};
document.getElementById('dndTokenEditCloseBtn').onclick = () => closeDndModals();
// DM: บันทึกมอนสเตอร์ (ที่สร้างเองแบบกำหนดค่าเอง ไม่ได้มาจากพรีเซ็ต) เข้าคลัง DND_MONSTER_PRESETS
// เพื่อให้เลือกกดสร้างซ้ำได้จากลิสต์ "คลังมอนสเตอร์สำเร็จรูป" ในครั้งต่อไป
document.getElementById('dndTokenSaveAsPresetBtn').onclick = (ev) => {
  if (dndTokenEditTargetId == null) return;
  const t = dndTokens.find(tt => tt.id === dndTokenEditTargetId && tt.kind === 'npc');
  const msgEl = document.getElementById('dndTokenSaveAsPresetMsg');
  const name = document.getElementById('dndTokenEditName').value.trim();
  if (!name) { msgEl.style.color = '#ff8080'; msgEl.textContent = 'กรุณาตั้งชื่อก่อนบันทึกเข้าคลัง'; return; }
  flashBtn(ev.currentTarget);
  const emoji = (document.getElementById('dndTokenEditEmoji').value || '👾').trim().slice(0, 4) || '👾';
  const stats = {};
  Object.keys(DND_STAT_LABELS).forEach(k => { stats[k] = Number(document.getElementById('dndTokenStat-' + k).value) || 10; });
  const loot = document.getElementById('dndTokenEditLoot').value.split('\n').map(line => {
    const m = line.trim().match(/^(.*?)(?:\s+x(\d+))?$/i);
    return m && m[1] ? { name: m[1].trim(), qty: Number(m[2] || 1) } : null;
  }).filter(Boolean);
  const preset = {
    key: dndSlugifyMonsterName(name), name, emoji,
    color: (t && t.color) || dndNpcFormColor, size: document.getElementById('dndTokenEditSize').value,
    maxHp: Number(document.getElementById('dndTokenEditMaxHp').value) || 1,
    ac: Number(document.getElementById('dndTokenEditAc').value) || 0,
    stats,
    attacks: (t && t.attacks ? t.attacks : []).map(a => ({
      name: a.name, desc: a.desc, stat: a.stat, toHit: a.toHit, dmgDie: a.dmgDie, dmgCount: a.dmgCount, dmgMod: a.dmgMod, aoeRadius: a.aoeRadius || 0,
    })),
    expReward: Number(document.getElementById('dndTokenEditExp').value) || 0,
    goldReward: Number(document.getElementById('dndTokenEditGold').value) || 0,
    loot,
  };
  DND_MONSTER_PRESETS.push(preset);
  dndSaveCustomPresetsToStorage();
  dndRefreshMonsterPresetSelect();
  document.getElementById('dndMonsterPresetSelect').value = preset.key;
  dndRenderMonsterPresetPreview();
  msgEl.style.color = '#7ee87e';
  msgEl.textContent = `✅ เพิ่ม "${emoji} ${name}" เข้าคลังมอนสเตอร์แล้ว — เลือกจากลิสต์ด้านบนเพื่อกดสร้างซ้ำได้เลยครั้งหน้า`;
};
document.getElementById('dndAtkAddBtn').onclick = (ev) => {
  if (dndTokenEditTargetId == null) return;
  const name = document.getElementById('dndAtkNameInput').value.trim();
  if (!name) return;
  flashBtn(ev.currentTarget);
  send({
    type: 'dndTokenAttackAdd',
    tokenId: dndTokenEditTargetId,
    attack: {
      name,
      stat: document.getElementById('dndAtkStatSelect').value,
      toHit: document.getElementById('dndAtkToHitInput').value,
      dmgDie: document.getElementById('dndAtkDieSelect').value,
      dmgCount: document.getElementById('dndAtkCountInput').value,
      dmgMod: document.getElementById('dndAtkModInput').value,
      desc: document.getElementById('dndAtkDescInput').value,
      aoeRadius: document.getElementById('dndAtkAoeRadiusInput').value,
    },
  });
  document.getElementById('dndAtkNameInput').value = '';
  document.getElementById('dndAtkStatSelect').value = '';
  document.getElementById('dndAtkToHitInput').value = '0';
  document.getElementById('dndAtkDieSelect').value = '0';
  document.getElementById('dndAtkCountInput').value = '1';
  document.getElementById('dndAtkModInput').value = '0';
  document.getElementById('dndAtkDescInput').value = '';
  document.getElementById('dndAtkAoeRadiusInput').value = '0';
};
document.getElementById('dndTokenStatusAddBtn').onclick = (ev) => {
  if (dndTokenEditTargetId == null) return;
  const name = document.getElementById('dndTokenStatusName').value.trim();
  if (!name) return;
  flashBtn(ev.currentTarget);
  const durationSec = Math.max(0, Math.min(86400, Math.round(Number(document.getElementById('dndTokenStatusDuration').value) || 0)));
  const tAtkMod = Number(document.getElementById('dndTokenStatusAtk').value) || 0;
  const tDmgMod = Number(document.getElementById('dndTokenStatusDmg').value) || 0;
  const tDefMod = Number(document.getElementById('dndTokenStatusDef').value) || 0;
  const tTickValue = Number(document.getElementById('dndTokenStatusTick').value) || 0;
  const tTickIntervalSec = Number(document.getElementById('dndTokenStatusTickInterval').value) || 0;
  send({ type: 'dndStatusApply', status: { targetType: 'token', targetId: dndTokenEditTargetId, name, note: document.getElementById('dndTokenStatusNote').value, durationSec, atkMod: tAtkMod, dmgMod: tDmgMod, defMod: tDefMod, tickValue: tTickValue, tickIntervalSec: tTickIntervalSec } });
  document.getElementById('dndTokenStatusName').value = '';
  document.getElementById('dndTokenStatusNote').value = '';
  document.getElementById('dndTokenStatusDuration').value = '';
  document.getElementById('dndTokenStatusAtk').value = '';
  document.getElementById('dndTokenStatusDmg').value = '';
  document.getElementById('dndTokenStatusDef').value = '';
  document.getElementById('dndTokenStatusTick').value = '';
  document.getElementById('dndTokenStatusTickInterval').value = '';
};

function renderOverlay(state) {
  const overlay = document.getElementById('overlay');
  if (state.phase === 'handSummary' && state.handSummary) {
    const rows = state.handSummary.map(s => `<tr><td>${s.name}</td><td style="text-align:right">${s.add >= 0 ? '+' : ''}${s.add}</td></tr>`).join('');
    document.getElementById('overlayBox').innerHTML = `<h2>จบมือที่ ${state.handNumber + 1}</h2><table>${rows}</table><div style="color:#888;font-size:12px;">กำลังเริ่มมือถัดไป...</div>`;
    overlay.style.display = 'flex';
  } else if (state.phase === 'gameOver' && state.finalScores) {
    const sorted = state.finalScores;
    const rows = sorted.map((p,i) => `<tr><td>${i===0?'🏆 ':''}${p.name}</td><td style="text-align:right">${p.score}</td></tr>`).join('');
    const restartBtn = `<button onclick="send({type:'restartGame'})">กลับไปห้องรอ / เริ่มเกมใหม่</button>`;
    document.getElementById('overlayBox').innerHTML = `<h2>จบเกม! ผู้ชนะ: ${sorted[0].name}</h2><table>${rows}</table>${restartBtn}`;
    overlay.style.display = 'flex';
  } else {
    overlay.style.display = 'none';
  }
}

const DND_LEVEL_EXP_CLIENT = [0,300,900,2700,6500,14000,23000,34000,48000,64000,85000,100000,120000,140000,165000,195000,225000,265000,305000,355000];
function dndLevelFromExpClient(exp) {
  const total = Math.max(0, Math.floor(Number(exp) || 0));
  let level = 1;
  for (let i = 0; i < DND_LEVEL_EXP_CLIENT.length; i++) {
    if (total >= DND_LEVEL_EXP_CLIENT[i]) level = i + 1;
    else break;
  }
  return level;
}
function dndExpProgressText(exp) {
  const total = Math.max(0, Math.floor(Number(exp) || 0));
  const level = dndLevelFromExpClient(total);
  const next = DND_LEVEL_EXP_CLIENT[level] ?? null;
  return next === null ? `EXP ${total} · เลเวลสูงสุด` : `EXP ${total} / ${next}`;
}


