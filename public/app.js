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
    else if (msg.type === 'dndQuickChat') appendDndQuickChat(msg.name, msg.text);
    else if (msg.type === 'dndCommandResult') appendDndCommandResult(msg.text);
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
  if (s.visionMod) bits.push(`👁️${s.visionMod > 0 ? '+' : ''}${s.visionMod}`);
  if (s.tickValue) bits.push(`${s.tickValue > 0 ? '💚+' : '☠️'}${s.tickValue}/${s.tickIntervalSec || 6}วิ`);
  return bits.join(' ');
}
function dndStatusChipHtml(s, innerHtml) {
  const remainSec = s.expiresAt ? Math.max(0, Math.ceil((s.expiresAt - Date.now()) / 1000)) : 0;
  const cdHtml = s.expiresAt ? `<span class="dndStatusCd" data-expires-at="${s.expiresAt}">⏳${remainSec}วิ</span>` : '';
  const modSummary = dndStatusModSummary(s);
  const modHtml = modSummary ? `<span class="dndStatusModTag">${modSummary}</span>` : '';
  const icon = s.icon || '☠️';
  const colorStyle = s.color ? ` style="border-color:${s.color}; color:${s.color};"` : '';
  return `<span class="dndStatusChip"${colorStyle} title="${escapeHtml(s.note || '')}">${escapeHtml(icon)} ${escapeHtml(s.name)}${modHtml}${cdHtml}${innerHtml || ''}</span>`;
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
  // นับถอยหลังเวลาที่เหลือของสัตว์อัญเชิญในแผงควบคุมของผู้เล่นด้วย (โมดูล 5) — ไม่ต้องรอ state อัปเดตเหมือนกัน
  document.querySelectorAll('.dndSummonCd[data-summon-expires-at]').forEach(el => {
    const expiresAt = Number(el.dataset.summonExpiresAt || 0);
    if (!expiresAt) return;
    const remain = Math.max(0, Math.ceil((expiresAt - now) / 1000));
    const m = Math.floor(remain / 60), s = remain % 60;
    el.textContent = remain > 0 ? `⏳${m}:${String(s).padStart(2, '0')}` : '⏳หมดเวลาแล้ว';
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
let dndSummonTemplates = {}; // แคตตาล็อกสัตว์อัญเชิญ (key -> {name, icon, ...}) จากเซิร์ฟเวอร์ — ใช้เติม dropdown ตอน DM สร้าง/แก้สกิลอัญเชิญ
let dndSummonTemplateOverrides = {}; // { key: {name, icon, color, size, maxHp, ac, str..cha, statusResist, attacks} } — DM edits to a built-in summon template's default values
function dndSummonTemplateMerged(key) {
  const base = dndSummonTemplates[key];
  if (!base) return null;
  const ov = dndSummonTemplateOverrides && dndSummonTemplateOverrides[key];
  return ov ? Object.assign({}, base, ov) : base;
}
function fillSummonTemplateSelect(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">— ยังไม่เลือกตัว —</option>' + Object.keys(dndSummonTemplates).map(key => {
    const tpl = dndSummonTemplateMerged(key);
    return `<option value="${key}">${escapeHtml(tpl.icon || '')} ${escapeHtml(tpl.name || key)}</option>`;
  }).join('');
  sel.value = current; // คงค่าที่เลือกไว้เดิม ถ้ายังมีอยู่ในลิสต์ (ไม่งั้นกลับไปเป็นตัวเลือกว่างอัตโนมัติ)
}
let dndClassStarterGear = {}; // { classKey: { weapon:{name,atk,def,maxDurability}, armor:{...}, shoes:{...}, accessory:{...} } }
let dndPassives = {}; // { raceKey: [{key,name,icon,desc,effect}, ...] }
let dndCustomPassives = []; // [{id,key,raceKey,name,icon,desc,effect}] — created by DM, on top of the built-in ones
let dndRacePassiveOverrides = {}; // { `${raceKey}:${passiveKey}`: {name,icon,desc,effect} } — DM edits to a built-in race passive's default values
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
// bonus = โบนัสเผ่าพันธุ์/คลาสที่บวกเข้ากับค่าดิบอยู่แล้ว — ราคาต้องอิงค่ารวม (ดิบ+โบนัส) ไม่ใช่ค่าดิบเฉยๆ
function dndPointBuyStepCost(currentScore, bonus) {
  const b = Math.round(Number(bonus)) || 0;
  const s = Math.max(dndPointBuyMin, Math.round(currentScore));
  return dndPointBuyCostOf(s + b + 1) - dndPointBuyCostOf(s + b);
}
// ต้นทุนรวมของการซื้อค่าดิบ (rawScore) เมื่อมีโบนัสเผ่า/คลาสคงที่ (bonus) บวกอยู่ด้วยเสมอ — ใช้ตอนสร้างตัวละคร
function dndPointBuyCostForRaw(rawScore, bonus) {
  const b = Math.round(Number(bonus)) || 0;
  const s = Math.max(dndPointBuyMin, Math.round(rawScore));
  return dndPointBuyCostOf(s + b) - dndPointBuyCostOf(dndPointBuyMin + b);
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
// (ตัวแปร/ฟังก์ชันของระบบแผนที่-token เช่น dndTokens, dndMaps, renderDndMap() ฯลฯ
//  ถูกย้ายไปไว้ที่ public/js/dnd-map.js ทั้งหมดแล้ว — ดูที่ไฟล์นั้นเพื่อแก้ไขส่วนแมพ)
let dndDmEditTargetId = null;
let dndSkills = [];
let dndLibrarySkillCatalog = []; // ข้อมูลแสดงผลของสกิล libraryOnly ทุกตัว (โชว์ในร้านห้องสมุดก่อนซื้อ) — ไม่ใช่สกิลที่ใช้ได้จริง ดู dndAnySkillById
// หาข้อมูลสกิลไว้ "แสดงผล" (ชื่อ/ดาเมจ/SP ฯลฯ) — เช็ก dndSkills (สกิลที่ใช้ได้จริง/DM เห็นทั้งหมด) ก่อน แล้วค่อย fallback ไปแคตตาล็อกร้านห้องสมุด
function dndAnySkillById(id) {
  const sid = Number(id);
  return dndSkills.find(s => s.id === sid) || dndLibrarySkillCatalog.find(s => s.id === sid) || null;
}
let dndActiveTool = 'dice';
const DND_STAT_LABELS = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };
// ค่าตั้งต้นของ "โจมตีปกติ" ฝั่งไคลเอนต์ — ต้องตรงกับ DND_NORMAL_ATTACK_DEFAULT ฝั่งเซิร์ฟเวอร์ (server/dnd.js)
const DND_NORMAL_ATTACK_DEFAULT_CLIENT = { name: 'โจมตีปกติ', stat: 'auto', dmgDie: 6, dmgCount: 1, atkBonus: 0, dmgBonus: 0, range: 0, reqItemName: '', reqItemQty: 0 };
// ค่าเฉลี่ยคนทั่วไป ~10 — ตัวปรับ (modifier) คำนวณจาก floor((ค่าสเตตัส-10)/2) ยิ่งค่าสูงยิ่งได้ตัวปรับบวกมาก ยิ่งค่าต่ำยิ่งโดนหักลบตอนทอยเต๋า
const DND_STAT_TIPS = {
  str: '💪 พละกำลัง (STR) — พลังกายภาพและระยะประชิด เพิ่มพลังโจมตีและดาเมจระยะประชิด ค่าเฉลี่ยคนทั่วไป ~10',
  dex: '🏃 ความคล่องตัว (DEX) — ความเร็วและการหลบหลีก เพิ่มความแม่นยำ ความเร็ว และ AC ค่าเฉลี่ยคนทั่วไป ~10',
  con: '❤️ ความอึด/ความทนทาน (CON) — พลังชีวิต ผูกกับ HP สูงสุดโดยตรง (แก้ CON แล้ว HP จะขยับตามอัตโนมัติ) ค่าเฉลี่ยคนทั่วไป ~10',
  int: '🧠 สติปัญญา (INT) — ความฉลาด ไหวพริบ และความรู้ ช่วยด้านเวทมนตร์และการวิเคราะห์ ค่าเฉลี่ยคนทั่วไป ~10',
  wis: '👁️ สติปัญญา/การรับรู้ (WIS) — การรับรู้และสัญชาตญาณ ช่วยด้านการสังเกตและเวทบางประเภท ค่าเฉลี่ยคนทั่วไป ~10',
  cha: '🗣️ เสน่ห์ (CHA) — การพูดคุยและการโน้มน้าวใจ ช่วยด้านปฏิสัมพันธ์ทางสังคม ค่าเฉลี่ยคนทั่วไป ~10',
};
function dndStatTipHtml(k) { return `data-tip="${escapeHtml(DND_STAT_TIPS[k] || '')}"`; }
// ตัวปรับ (modifier) จากค่าสเตตัสดิบ — มาตรฐาน D&D: floor((score-10)/2) เช่น 8→-1, 10→+0, 16→+3
function dndAbilityModText(score) {
  const mod = Math.floor(((Number(score) || 10) - 10) / 2);
  return mod > 0 ? `+${mod}` : `${mod}`;
}
let dndEquipSlots = ['weapon', 'armor', 'shoes', 'accessory'];
let dndEquipSlotLabels = { weapon: 'อาวุธ', armor: 'เกราะ', shoes: 'รองเท้า', accessory: 'เครื่องประดับ' };
let dndBagCapacity = 20;
let dndShopEditKey = null; // "shopId:itemId" ของไอเทมร้านค้าที่กำลังแก้ไขอยู่ (null = ไม่มี) — ใช้ตอน DM กดแก้ไขไอเทมในร้าน
// เก็บสถานะค้นหา/กลุ่มที่เปิดอยู่ของแต่ละร้าน (คีย์ = shop.id) ไว้แยกจาก DOM เพราะ renderDndShops() rebuild HTML ทั้งกล่องทุกครั้งที่ state อัปเดตจากเซิร์ฟเวอร์
// ถ้าไม่เก็บแยกไว้แบบนี้ พิมพ์ค้นหาอยู่ดีๆ พอมีคนอื่นซื้อของในห้อง ข้อความค้นหาจะหายเพราะโดน rebuild ทับ
let dndShopUIState = {};
function dndGetShopUIState(shopId) {
  if (!dndShopUIState[shopId]) dndShopUIState[shopId] = { search: '', openLevels: new Set() };
  return dndShopUIState[shopId];
}
const DND_EQUIP_SLOT_ICONS = { weapon: '⚔️', armor: '🛡️', shoes: '👢', accessory: '💍' };
let dndScene = { location: '', situation: '' };
let dndSceneEditInitialized = false;
let dndGameTime = { day: 1, hour: 8, minute: 0 };
let dndTimeSetInputsInitialized = false;
let dndTimeAuto = { running: false, speed: 10 };
let dndTimeAutoSpeedInitialized = false;
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
  {
    key: 'goblin', name: 'ก็อบลิน', emoji: '👺', color: '#7ba05b', size: 'small', maxHp: 7, ac: 15,
    stats: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    attacks: [
      { name: 'ดาบสั้น', desc: 'ฟันดาบสั้นเข้าใส่เป้าหมายอย่างรวดเร็ว', stat: 'dex', toHit: 4, dmgDie: 6, dmgCount: 1, dmgMod: 2 },
      { name: 'ธนูสั้น', desc: 'ยิงธนูจากระยะไกล', stat: 'dex', toHit: 4, dmgDie: 6, dmgCount: 1, dmgMod: 2 },
    ],
    expReward: 50, goldReward: 15, loot: [{ name: 'ดาบสั้นเก่า', qty: 1 }, { name: 'เหรียญทองแดง', qty: 15 }]
  },
  {
    key: 'bugbear', name: 'บักแบร์', emoji: '👹', color: '#5b4a3a', size: 'medium', maxHp: 27, ac: 16,
    stats: { str: 15, dex: 14, con: 13, int: 8, wis: 11, cha: 9 },
    attacks: [
      { name: 'มอร์นิ่งสตาร์', desc: 'ตีอาวุธหนามแหลมด้วยแรงมหาศาล', stat: 'str', toHit: 4, dmgDie: 8, dmgCount: 1, dmgMod: 2 },
      { name: 'หอกซัด', desc: 'ขว้างหอกใส่เป้าหมายระยะไกล', stat: 'str', toHit: 4, dmgDie: 6, dmgCount: 1, dmgMod: 2 },
    ],
    expReward: 200, goldReward: 40, loot: [{ name: 'มอร์นิ่งสตาร์', qty: 1 }, { name: 'เหรียญทองคำ', qty: 40 }]
  },
  {
    key: 'hobgoblin', name: 'ฮอบก็อบลิน', emoji: '👺', color: '#8a9a5a', size: 'medium', maxHp: 11, ac: 18,
    stats: { str: 13, dex: 12, con: 12, int: 10, wis: 10, cha: 9 },
    attacks: [
      { name: 'ดาบยาว', desc: 'ฟันดาบยาวอย่างมีวินัยแบบทหาร', stat: 'str', toHit: 3, dmgDie: 8, dmgCount: 1, dmgMod: 1 },
    ],
    expReward: 100, goldReward: 25, loot: [{ name: 'ดาบยาว', qty: 1 }, { name: 'เหรียญเงิน', qty: 25 }]
  },
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
let dndShops = [];
let dndForgeFailPolicyLabels = { safe: 'พลาดแล้วไม่มีอะไรเกิดขึ้น', downgrade: 'พลาดแล้วตกระดับ 1 ขั้น', break: 'พลาดแล้วไอเทมพัง (รีเซตเป็น +0)' };
let dndItemEffects = [];
let dndTrades = [];
let dndTradeOfferPicked = {};   // name -> qty ที่จะให้
let dndTradeRequestPicked = {}; // name -> qty ที่จะขอ
let dndTradeTargetId = null;
function readDndImageFile(file, cb) {
  if (!file) return cb(null);
  if (!file.type.startsWith('image/')) return cb(null);
  if (file.size > 300 * 1024) { alert('รูปใหญ่เกินไป — จำกัดประมาณ 300KB'); return cb(null); }
  const reader = new FileReader();
  reader.onload = () => cb(reader.result);
  reader.readAsDataURL(file);
}

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
(function fillDiceStatSelect() {
  const sel = document.getElementById('dndDiceStatSelect');
  if (sel && !sel.dataset.filled) {
    sel.innerHTML += Object.keys(DND_STAT_LABELS).map(k => `<option value="${k}">${DND_STAT_LABELS[k]}</option>`).join('');
    sel.dataset.filled = '1';
  }
})();
document.getElementById('dndRollBtn').onclick = (ev) => {
  flashBtn(ev.currentTarget);
  send({
    type: 'dndRoll',
    die: dndCurrentDie,
    count: document.getElementById('dndDiceCount').value,
    modifier: document.getElementById('dndDiceMod').value,
    label: document.getElementById('dndDiceLabel').value,
    stat: document.getElementById('dndDiceStatSelect').value,
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
function fillNormalAttackSelects() {
  const statSel = document.getElementById('dndEditNaStat');
  if (statSel && !statSel.dataset.filled) {
    statSel.innerHTML = `<option value="auto">อัตโนมัติ (STR/DEX มากสุด)</option>` +
      Object.keys(DND_STAT_LABELS).map(k => `<option value="${k}">${DND_STAT_LABELS[k]}</option>`).join('');
    statSel.dataset.filled = '1';
  }
  const dieSel = document.getElementById('dndEditNaDmgDie');
  if (dieSel && !dieSel.dataset.filled) {
    dieSel.innerHTML = [4, 6, 8, 10, 12, 20, 100].map(d => `<option value="${d}">d${d}</option>`).join('');
    dieSel.dataset.filled = '1';
  }
}
fillNormalAttackSelects();
function applyNormalAttackToEditForm(na) {
  const cfg = na || DND_NORMAL_ATTACK_DEFAULT_CLIENT;
  document.getElementById('dndEditNaName').value = cfg.name || DND_NORMAL_ATTACK_DEFAULT_CLIENT.name;
  document.getElementById('dndEditNaStat').value = cfg.stat || 'auto';
  document.getElementById('dndEditNaDmgDie').value = cfg.dmgDie || DND_NORMAL_ATTACK_DEFAULT_CLIENT.dmgDie;
  document.getElementById('dndEditNaDmgCount').value = cfg.dmgCount || DND_NORMAL_ATTACK_DEFAULT_CLIENT.dmgCount;
  document.getElementById('dndEditNaAtkBonus').value = cfg.atkBonus || 0;
  document.getElementById('dndEditNaDmgBonus').value = cfg.dmgBonus || 0;
  const rangeEl = document.getElementById('dndEditNaRange');
  if (rangeEl) rangeEl.value = cfg.range || 0;
  const reqItemNameEl = document.getElementById('dndEditNaReqItemName');
  if (reqItemNameEl) reqItemNameEl.value = cfg.reqItemName || '';
  const reqItemQtyEl = document.getElementById('dndEditNaReqItemQty');
  if (reqItemQtyEl) reqItemQtyEl.value = cfg.reqItemQty || 1;
}
document.getElementById('dndEditNaResetBtn').onclick = (ev) => {
  flashBtn(ev.currentTarget);
  applyNormalAttackToEditForm(null);
};
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

// จำกัดคลาสที่ใช้สกิลนี้ได้ (ไม่บังคับ) — ไม่เลือกคลาสใดเลย = ทุกคลาสใช้ได้ ใช้ Set แบบเดียวกับ dndSkillAssignSelected ด้านบน
let dndSkillClassSelected = new Set();
function renderDndSkillClassBox() {
  const box = document.getElementById('dndSkillClassBox');
  if (!box) return;
  box.innerHTML = dndClasses.map(cls => {
    const checked = dndSkillClassSelected.has(cls.key) ? 'checked' : '';
    return `<label class="dndAssignChip"><input type="checkbox" data-classkey="${cls.key}" ${checked}> ${escapeHtml(cls.icon || '')} ${escapeHtml(cls.name)}</label>`;
  }).join('');
  box.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.onchange = () => {
      const key = cb.dataset.classkey;
      if (cb.checked) dndSkillClassSelected.add(key); else dndSkillClassSelected.delete(key);
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
      icon: document.getElementById('dndSkillIcon').value,
      color: document.getElementById('dndSkillColor').value,
      stat: document.getElementById('dndSkillStat').value,
      desc: document.getElementById('dndSkillDesc').value,
      guaranteedHit: document.getElementById('dndSkillGuaranteedHit').checked,
      damage: {
        die: document.getElementById('dndSkillDmgDie').value,
        count: document.getElementById('dndSkillDmgCount').value,
        mod: document.getElementById('dndSkillDmgMod').value,
      },
      heal: {
        die: document.getElementById('dndSkillHealDie').value,
        count: document.getElementById('dndSkillHealCount').value,
        mod: document.getElementById('dndSkillHealMod').value,
        revive: document.getElementById('dndSkillHealRevive').value === '1',
      },
      status: {
        name: document.getElementById('dndSkillStatusName').value,
        note: document.getElementById('dndSkillStatusNote').value,
        chance: document.getElementById('dndSkillStatusChance').value,
        durationSec: document.getElementById('dndSkillStatusDuration').value,
        atkMod: document.getElementById('dndSkillStatusAtkMod').value,
        dmgMod: document.getElementById('dndSkillStatusDmgMod').value,
        defMod: document.getElementById('dndSkillStatusDefMod').value,
        visionMod: document.getElementById('dndSkillStatusVisionMod').value,
        tickValue: document.getElementById('dndSkillStatusTick').value,
        tickIntervalSec: document.getElementById('dndSkillStatusTickInterval').value,
        icon: document.getElementById('dndSkillStatusIcon').value,
        color: document.getElementById('dndSkillStatusColor').value,
      },
      buffAlly: document.getElementById('dndSkillBuffAlly').checked,
      targetMode: document.getElementById('dndSkillTargetMode').value,
      aoe: {
        radius: document.getElementById('dndSkillAoeRadius').value,
        shape: document.getElementById('dndSkillAoeShape').value,
      },
      range: document.getElementById('dndSkillRange').value,
      cleanse: {
        enabled: document.getElementById('dndSkillCleanseEnabled').checked,
        name: document.getElementById('dndSkillCleanseName').value,
      },
      level: document.getElementById('dndSkillLevel').value,
      cooldownSec: document.getElementById('dndSkillCooldown').value,
      maxUses: document.getElementById('dndSkillMaxUses').value,
      spCost: document.getElementById('dndSkillSpCost').value,
      reqItem: {
        name: document.getElementById('dndSkillReqItemName').value,
        qty: document.getElementById('dndSkillReqItemQty').value,
      },
      assignedIds: Array.from(dndSkillAssignSelected),
      libraryOnly: document.getElementById('dndSkillLibraryOnly').checked,
      allowedClasses: Array.from(dndSkillClassSelected),
      isSummon: document.getElementById('dndSkillIsSummon').checked,
      summonTemplateKey: document.getElementById('dndSkillSummonTemplateKey').value,
      summonDurationSec: document.getElementById('dndSkillSummonDuration').value,
      summonMaxActive: document.getElementById('dndSkillSummonMaxActive').value,
    },
  });
  document.getElementById('dndSkillName').value = '';
  document.getElementById('dndSkillIcon').value = '';
  document.getElementById('dndSkillColor').value = '#7ee8fa';
  document.getElementById('dndSkillDesc').value = '';
  document.getElementById('dndSkillStat').value = '';
  document.getElementById('dndSkillGuaranteedHit').checked = false;
  document.getElementById('dndSkillDmgDie').value = '0';
  document.getElementById('dndSkillDmgCount').value = '1';
  document.getElementById('dndSkillHealDie').value = '0';
  document.getElementById('dndSkillHealCount').value = '1';
  document.getElementById('dndSkillHealMod').value = '0';
  document.getElementById('dndSkillHealRevive').value = '0';
  document.getElementById('dndSkillDmgMod').value = '0';
  document.getElementById('dndSkillStatusName').value = '';
  document.getElementById('dndSkillStatusNote').value = '';
  document.getElementById('dndSkillStatusIcon').value = '';
  document.getElementById('dndSkillStatusColor').value = '#ff6b6b';
  document.getElementById('dndSkillBuffAlly').checked = false;
  document.getElementById('dndSkillTargetMode').value = 'both';
  document.getElementById('dndSkillStatusChance').value = '100';
  document.getElementById('dndSkillStatusDuration').value = '0';
  document.getElementById('dndSkillStatusAtkMod').value = '0';
  document.getElementById('dndSkillStatusDmgMod').value = '0';
  document.getElementById('dndSkillStatusDefMod').value = '0';
  document.getElementById('dndSkillStatusVisionMod').value = '0';
  document.getElementById('dndSkillStatusTick').value = '0';
  document.getElementById('dndSkillStatusTickInterval').value = '6';
  document.getElementById('dndSkillAoeRadius').value = '0';
  document.getElementById('dndSkillAoeShape').value = 'circle';
  document.getElementById('dndSkillRange').value = '0';
  document.getElementById('dndSkillCleanseEnabled').checked = false;
  document.getElementById('dndSkillCleanseName').value = '';
  document.getElementById('dndSkillLevel').value = '0';
  document.getElementById('dndSkillCooldown').value = '0';
  document.getElementById('dndSkillMaxUses').value = '0';
  document.getElementById('dndSkillSpCost').value = '0';
  document.getElementById('dndSkillReqItemName').value = '';
  document.getElementById('dndSkillReqItemQty').value = '1';
  document.getElementById('dndSkillLibraryOnly').checked = false;
  document.getElementById('dndSkillIsSummon').checked = false;
  document.getElementById('dndSkillSummonTemplateKey').value = '';
  document.getElementById('dndSkillSummonDuration').value = '60';
  document.getElementById('dndSkillSummonMaxActive').value = '1';
  dndSkillAssignSelected = new Set();
  renderDndSkillAssignBox();
  dndSkillClassSelected = new Set();
  renderDndSkillClassBox();
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
    dndPlayersList.filter(p => !p.isDM && p.connected !== false && dndPlayerInCurrentMap(p.id)).forEach(p => {
      rows.push({ type: 'player', id: p.id, name: p.character.charName || p.name, hp: p.character.hp, maxHp: p.character.maxHp, ac: p.character.ac });
    });
    if (action.isSummon) {
      // สัตว์อัญเชิญของผู้เล่น (ไม่ใช่มอนสเตอร์ของ DM): เลือกโจมตี npc token อื่น (เช่นมอนสเตอร์) ได้ด้วย ยกเว้นตัวเอง
      dndTokens.filter(t => t.kind === 'npc' && t.id !== action.tokenId && Number(t.hp) > 0).forEach(t => {
        rows.push({ type: 'token', id: t.id, name: t.name, hp: t.hp, maxHp: t.maxHp, ac: t.ac });
      });
      hint.textContent = 'เลือกเป้าหมาย (มอนสเตอร์หรือผู้เล่น)';
    } else {
      hint.textContent = 'เลือกผู้เล่นที่จะโดนโจมตี';
    }
  } else if (action.mode === 'useItem') {
    const allowDead = action.effType === 'revive';
    dndPlayersList.filter(p => !p.isDM && p.connected !== false).forEach(p => {
      const isMe = dndYou && p.id === dndYou.id;
      const dead = Number(p.character.hp) <= 0;
      const permaDead = !!p.character.permaDead;
      if (dead && !allowDead) return; // ไอเทมฟื้นฟู HP ธรรมดา เลือกเป้าหมายที่หมดสติไม่ได้เลย
      if (permaDead) return; // ตายถาวรแล้ว ไอเทม (แม้แต่ชุบชีวิต) ใช้ปลุกไม่ได้ ต้องรอ DM เพิ่ม HP ให้เท่านั้น
      rows.push({ type: 'player', id: p.id, name: (p.character.charName || p.name) + (isMe ? ' (ตัวเอง)' : '') + (dead ? ' 💀' : ''), hp: p.character.hp, maxHp: p.character.maxHp, ac: p.character.ac });
    });
    hint.textContent = allowDead ? 'เลือกคนที่จะใช้ไอเทมนี้ให้ (เลือกเพื่อนที่หมดสติเพื่อชุบชีวิตให้ฟื้น)' : 'เลือกเพื่อนที่จะฟื้นฟู HP ให้ (ใช้กับคนที่หมดสติไม่ได้ ต้องใช้ไอเทมชุบชีวิตแทน)';
  } else if (action.mode === 'skill' || action.mode === 'normalAttack') {
    // เป้าหมายที่เลือกได้: ตามที่ DM ตั้งไว้ตอนสร้าง/แก้สกิล ('both' = มอนสเตอร์+ผู้เล่นเลือกได้ทั้งคู่) — โจมตีปกติเลือกได้ทั้งคู่เสมอ (ใครก็ได้)
    const tMode = action.mode === 'normalAttack' ? 'both' : (action.targetMode || 'monster');
    // สกิลฟื้นฟู HP ธรรมดา (ไม่ใช่สกิลชุบชีวิต) เลือกเป้าหมายที่หมดสติไม่ได้เลย — ต้องใช้สกิลชุบชีวิตแทน
    const isPlainHeal = !!action.isHeal && !action.isCleanse && !action.isBuff && !action.isRevive;
    if (tMode === 'player' || tMode === 'both') {
      dndPlayersList.filter(p => !p.isDM && p.connected !== false && dndPlayerInCurrentMap(p.id)).forEach(p => {
        const isMe = dndYou && p.id === dndYou.id;
        if (action.mode === 'normalAttack' && isMe) return; // โจมตีปกติเลือกโจมตีตัวเองไม่ได้
        const dead = Number(p.character.hp) <= 0;
        const permaDead = !!p.character.permaDead;
        if (dead && isPlainHeal) return;
        if (permaDead && action.isHeal) return; // ตายถาวรแล้ว สกิลชุบ (แม้แต่ชุบชีวิต) ใช้ปลุกไม่ได้ ต้องรอ DM เพิ่ม HP ให้เท่านั้น
        rows.push({ type: 'player', id: p.id, name: (p.character.charName || p.name) + (isMe ? ' (ตัวเอง)' : '') + (dead ? ' 💀' : ''), hp: p.character.hp, maxHp: p.character.maxHp, ac: p.character.ac });
      });
    }
    if (tMode === 'self') {
      // สกิลนี้ใช้ได้กับตัวเองเท่านั้น — แสดงให้เลือกแค่ตัวผู้เล่นเอง ไม่มีตัวเลือกอื่น
      const me = dndYou && dndPlayersList.find(p => p.id === dndYou.id);
      if (me) {
        const dead = Number(me.character.hp) <= 0;
        const permaDead = !!me.character.permaDead;
        if (!(dead && isPlainHeal) && !(permaDead && action.isHeal)) {
          rows.push({ type: 'player', id: me.id, name: (me.character.charName || me.name) + ' (ตัวเอง)' + (dead ? ' 💀' : ''), hp: me.character.hp, maxHp: me.character.maxHp, ac: me.character.ac });
        }
      }
    }
    if (tMode === 'monster' || tMode === 'both') {
      dndTokens.filter(t => t.kind === 'npc' && Number(t.hp) > 0).forEach(t => {
        rows.push({ type: 'token', id: t.id, name: t.name, hp: t.hp, maxHp: t.maxHp, ac: t.ac });
      });
    }
    if (action.mode === 'normalAttack') {
      hint.textContent = 'เลือกเป้าหมาย (มอนสเตอร์หรือผู้เล่น)';
    } else if (action.isCleanse) {
      hint.textContent = 'เลือกเป้าหมายที่จะลบล้างสถานะให้';
    } else if (action.isBuff) {
      hint.textContent = tMode === 'both' ? 'เลือกเป้าหมายที่จะบัฟให้ (มอนสเตอร์หรือผู้เล่น)' : (tMode === 'self' ? 'ยืนยันใช้กับตัวเอง' : 'เลือกเพื่อนที่จะบัฟให้');
    } else if (action.isRevive) {
      hint.textContent = 'เลือกเป้าหมายที่จะชุบ HP ให้ (เลือกคนที่หมดสติเพื่อชุบชีวิตให้ฟื้น)';
    } else if (action.isHeal) {
      hint.textContent = tMode === 'both' ? 'เลือกเป้าหมายที่จะฟื้นฟู HP ให้ (ใช้กับคนที่หมดสติไม่ได้ ต้องใช้สกิลชุบชีวิตแทน)' : (tMode === 'self' ? 'ยืนยันใช้กับตัวเอง' : 'เลือกเพื่อนที่จะฟื้นฟู HP ให้ (ใช้กับคนที่หมดสติไม่ได้ ต้องใช้สกิลชุบชีวิตแทน)');
    } else {
      hint.textContent = tMode === 'both' ? 'เลือกเป้าหมาย (มอนสเตอร์หรือผู้เล่น)' : (tMode === 'self' ? 'สกิลนี้ใช้ได้กับตัวเองเท่านั้น — กดยืนยัน' : (tMode === 'player' ? 'เลือกผู้เล่นที่จะเป็นเป้าหมาย' : 'เลือกมอนสเตอร์/เป้าหมายบนแผนที่'));
    }
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
    openDndTargetPicker({ mode: 'npcAttack', tokenId: t.id, attackId: a.id, title: `เลือกเป้าหมายสำหรับ ${t.name} — ${a.name}`, isSummon: !!t.summoned });
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
      openDndTargetPicker({ mode: 'npcAttack', tokenId: t.id, attackId: Number(btn.dataset.attack), title: `เลือกเป้าหมายสำหรับ ${t.name}${a ? ` — ${a.name}` : ''}`, isSummon: !!t.summoned });
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
  if (amIDead()) { showDndErrorToast(dndDeadMsgForMe()); return; }
  flashBtn(ev.currentTarget);
  openDndTargetPicker({ mode: 'normalAttack', title: 'เลือกเป้าหมายสำหรับโจมตีปกติ (มอนสเตอร์หรือผู้เล่น)' });
};

function renderDndNormalAttackInfo() {
  const el = document.getElementById('dndNormalAttackInfo');
  const me = myDndEntry();
  if (!el || !me) return;
  const btn = document.getElementById('dndNormalAttackBtn');
  const c = me.character || {};
  const na = c.normalAttack || DND_NORMAL_ATTACK_DEFAULT_CLIENT;
  const naStat = (na.stat === 'auto' || DND_STAT_LABELS[na.stat]) ? na.stat : 'auto';
  const strMod = Math.floor(((Number(c.str) || 10) - 10) / 2);
  const dexMod = Math.floor(((Number(c.dex) || 10) - 10) / 2);
  const abilityMod = naStat === 'auto' ? Math.max(strMod, dexMod) : Math.floor(((Number(c[naStat]) || 10) - 10) / 2);
  const equipAtk = dndTotalAttackClient(c.equipment || {});
  const atkBonus = Number(na.atkBonus) || 0;
  const dmgBonus = Number(na.dmgBonus) || 0;
  const mod = abilityMod + atkBonus;
  const dmgMod = abilityMod + dmgBonus;
  const modStr = mod >= 0 ? `+${mod}` : `${mod}`;
  const dmgModStr = dmgMod >= 0 ? `+${dmgMod}` : `${dmgMod}`;
  const dmgDie = na.dmgDie || 6;
  const dmgCount = na.dmgCount || 1;
  const statTag = naStat === 'auto' ? 'STR/DEX' : DND_STAT_LABELS[naStat];
  const nameTag = na.name || DND_NORMAL_ATTACK_DEFAULT_CLIENT.name;
  const naRange = Number(na.range) || 0;
  const rangeTag = naRange > 0 ? `<br>📏 ระยะโจมตี: <b>${naRange}</b> ช่อง` : '';
  const myBag = (me.character && me.character.bag) || [];
  const myReqItemQty = na.reqItemName ? ((myBag.find(it => it.name === na.reqItemName) || {}).qty || 0) : 0;
  const notEnoughItem = dndYou && !dndYou.isDM && !!na.reqItemName && myReqItemQty < (na.reqItemQty || 1);
  const reqItemTag = na.reqItemName ? `<br>📦 ต้องมี: <b>${escapeHtml(na.reqItemName)} x${na.reqItemQty}</b>${notEnoughItem ? ' (ไม่พอ!)' : ''}` : '';
  el.innerHTML = `⚔️ ${escapeHtml(nameTag)} (${statTag})<br>🎯 โจมตี: <b>1d20 ${modStr} ${equipAtk ? `+ ${equipAtk} อุปกรณ์` : ''}</b><br>💥 ดาเมจ: <b>${dmgCount}d${dmgDie} ${dmgModStr} ${equipAtk ? `+ ${equipAtk} อุปกรณ์` : ''}</b>${rangeTag}${reqItemTag}`;
  if (btn) {
    if (amIDead()) {
      btn.disabled = true;
      btn.textContent = '⚔️ โจมตีปกติ';
    } else if (notEnoughItem) {
      btn.disabled = true;
      btn.textContent = `📦 ไอเทมไม่พอ (ต้องมี ${na.reqItemName} x${na.reqItemQty})`;
    } else {
      btn.disabled = false;
      btn.textContent = '⚔️ โจมตีปกติ';
    }
  }
}

function amIDead() {
  if (!dndYou || dndYou.isDM) return false;
  const me = myDndEntry();
  return !!(me && Number(me.character && me.character.hp) <= 0);
}
function amIPermaDead() {
  if (!dndYou || dndYou.isDM) return false;
  const me = myDndEntry();
  return !!(me && me.character && me.character.permaDead);
}
function dndDeadMsgForMe() {
  return amIPermaDead()
    ? 'คุณตายถาวรแล้ว (โดนดาเมจครั้งเดียวเกิน 2 เท่าของเลือดสูงสุด) ไอเทม/สกิลชุบใช้ปลุกไม่ได้ ต้องรอ DM เพิ่ม HP ให้เท่านั้นถึงจะฟื้นได้'
    : 'คุณหมดสติอยู่ ทำอะไรไม่ได้จนกว่าจะมีคนใช้ไอเทมชุบให้ หรือ DM เพิ่ม HP ให้';
}
function renderDndSkillList() {
  document.getElementById('dndSkillDmForm').style.display = (dndYou && dndYou.isDM) ? 'block' : 'none';
  if (dndYou && dndYou.isDM) { renderDndSkillAssignBox(); renderDndSkillClassBox(); fillSummonTemplateSelect('dndSkillSummonTemplateKey'); }
  const emptyHint = document.getElementById('dndSkillEmptyHint');
  emptyHint.style.display = dndSkills.length ? 'none' : 'block';
  const list = document.getElementById('dndSkillList');
  list.innerHTML = '';
  dndSkills.forEach(skill => {
    const dmgText = skill.dmgDie ? `💥 ดาเมจ ${skill.dmgCount}d${skill.dmgDie}${skill.dmgMod ? (skill.dmgMod > 0 ? ' +' + skill.dmgMod : ' ' + skill.dmgMod) : ''}` : '';
    const hasHitRoll = !skill.healDie && !skill.cleanseEnabled && !!skill.stat;
    const guaranteedHitText = (skill.guaranteedHit && hasHitRoll) ? '✅ เลือกโดนเสมอ (ไม่ทอย 1d20/AC)' : '';
    const healText = skill.healDie ? `${skill.healRevive ? '🌟 ชุบชีวิต' : '💚 ฟื้นฟู'} HP ${skill.healCount}d${skill.healDie}${skill.healMod ? (skill.healMod > 0 ? ' +' + skill.healMod : ' ' + skill.healMod) : ''} (เลือกเป้าหมายเป็นผู้เล่น${skill.healRevive ? ' — ปลุกคนหมดสติได้' : ' — ปลุกคนหมดสติไม่ได้'})` : '';
    const statusModBits = [];
    if (skill.statusDurationSec) statusModBits.push(`⏳ ${skill.statusDurationSec}วิ`);
    if (skill.statusAtkMod) statusModBits.push(`🎯${skill.statusAtkMod > 0 ? '+' : ''}${skill.statusAtkMod}`);
    if (skill.statusDmgMod) statusModBits.push(`💥${skill.statusDmgMod > 0 ? '+' : ''}${skill.statusDmgMod}`);
    if (skill.statusDefMod) statusModBits.push(`🛡️${skill.statusDefMod > 0 ? '+' : ''}${skill.statusDefMod}`);
    if (skill.statusVisionMod) statusModBits.push(`👁️${skill.statusVisionMod > 0 ? '+' : ''}${skill.statusVisionMod}`);
    if (skill.statusTickValue) statusModBits.push(`${skill.statusTickValue > 0 ? '💚+' : '☠️'}${skill.statusTickValue}/${skill.statusTickIntervalSec || 6}วิ`);
    const statusIconPreview = skill.statusIcon || '☠️';
    const statusColorStyle = skill.statusColor ? ` style="color:${skill.statusColor};"` : '';
    const statusText = skill.statusName ? `<span${statusColorStyle}>${escapeHtml(statusIconPreview)} ติดสถานะ "${escapeHtml(skill.statusName)}"</span>${skill.statusNote ? ` — ${escapeHtml(skill.statusNote)}` : ''}${skill.buffAlly ? ' (🛡️ บัฟ — เลือกเป้าหมายเป็นเพื่อน)' : (skill.statusChance && skill.statusChance < 100 ? ` (🎯 โอกาสติด ${skill.statusChance}%)` : '')}${statusModBits.length ? ` [${statusModBits.join(' · ')}]` : ''}` : '';
    const aoeText = skill.aoeRadius ? (skill.aoeShape === 'line'
      ? `💥 AOE เส้นตรง กว้าง ${skill.aoeRadius} (ดาเมจกระจายเป็นเส้นจากตัวเองไปเป้าหมายหลัก ยิ่งไกลจากเส้นยิ่งเบา)`
      : `💥 AOE รัศมี ${skill.aoeRadius} (ดาเมจกระจายรอบเป้าหมายหลัก ยิ่งไกลยิ่งเบา)`) : '';
    const rangeText = skill.range ? `📏 ระยะโจมตี ${skill.range} ช่อง (ต้องอยู่ในระยะนี้บนแผนที่ถึงจะใช้ได้)` : '';
    const cleanseText = skill.cleanseEnabled ? `✨ ลบล้างสถานะ${skill.cleanseName ? ` "${escapeHtml(skill.cleanseName)}"` : 'ทั้งหมด'} (เลือกเป้าหมายเป็นผู้เล่น)` : '';
    const tMode = dndSkillTargetModeOf(skill);
    const targetModeText = tMode === 'both' ? '🎯 เป้าหมาย: มอนสเตอร์/ผู้เล่น (เลือกได้ทั้งคู่)' : (tMode === 'self' ? '🎯 เป้าหมาย: ตัวเองเท่านั้น' : (tMode === 'player' ? '🎯 เป้าหมาย: ผู้เล่นเท่านั้น' : '🎯 เป้าหมาย: มอนสเตอร์เท่านั้น'));
    const assignedNames = (!skill.classSkill && skill.assignedIds && skill.assignedIds.length)
      ? skill.assignedIds.map(id => { const pp = dndPlayersList.find(p => p.id === id); return pp ? (pp.character.charName || pp.name) : null; }).filter(Boolean)
      : [];
    const assignedText = skill.classSkill
      ? `🎓 สกิลประจำคลาส (ปลดล็อกเลเวล ${skill.level})`
      : (assignedNames.length ? `🔒 เฉพาะ: ${assignedNames.map(escapeHtml).join(', ')}` : (skill.libraryOnly ? '🔒 ยังไม่มีใครเรียนรู้ (ต้องเรียนก่อนถึงจะใช้ได้)' : '👥 ทั้งปาร์ตี้ใช้ได้'));
    const classRestrictText = (!skill.classSkill && skill.allowedClasses && skill.allowedClasses.length)
      ? `🎓 เฉพาะคลาส: ${dndAllowedClassesTextClient(skill.allowedClasses)}` : '';
    const ruleBits = [];
    if (!skill.classSkill && skill.level) ruleBits.push(`📖 เวทย์เลเวล ${skill.level}`);
    if (skill.cooldownSec) ruleBits.push(`⏱ คูลดาวน์ ${skill.cooldownSec} วิ`);
    if (skill.maxUses) ruleBits.push(`🔁 ใช้ได้ ${skill.maxUses} ครั้ง${(dndYou && !dndYou.isDM && skill.usesLeft != null) ? ` (เหลือ ${skill.usesLeft})` : ''}`);
    if (skill.spCost) ruleBits.push(`🔵 ใช้ SP ${skill.spCost}`);
    if (skill.reqItemName) ruleBits.push(`📦 ต้องมี ${escapeHtml(skill.reqItemName)} x${skill.reqItemQty}`);
    const ruleText = ruleBits.join(' · ');
    const skillIcon = skill.classSkill ? '🎓' : (skill.icon || '✨');
    const skillColorStyle = (!skill.classSkill && skill.color) ? ` style="color:${skill.color};"` : '';
    const card = document.createElement('div');
    card.className = 'dndSkillCard';
    if (!skill.classSkill && skill.color) card.style.borderColor = skill.color;
    card.innerHTML = `
      <div class="dndSkillCardTop">
        <span class="dndSkillCardName"${skillColorStyle}>${escapeHtml(skillIcon)} ${escapeHtml(skill.name)}</span>
        ${skill.stat ? `<span class="dndSkillCardStat">${DND_STAT_LABELS[skill.stat] || skill.stat}</span>` : ''}
      </div>
      ${skill.desc ? `<div class="dndSkillCardDesc">${escapeHtml(skill.desc)}</div>` : ''}
      ${dmgText ? `<div class="dndSkillCardDmg">${dmgText}</div>` : ''}
      ${guaranteedHitText ? `<div class="dndSkillCardDmg" style="color:#7affc4;">${guaranteedHitText}</div>` : ''}
      ${healText ? `<div class="dndSkillCardDmg" style="color:#7ee87e;">${healText}</div>` : ''}
      ${statusText ? `<div class="dndSkillCardDmg" style="color:#d8a4ff;">${statusText}</div>` : ''}
      ${aoeText ? `<div class="dndSkillCardDmg" style="color:#ffb86b;">${aoeText}</div>` : ''}
      ${rangeText ? `<div class="dndSkillCardDmg" style="color:#8fd3ff;">${rangeText}</div>` : ''}
      ${cleanseText ? `<div class="dndSkillCardDmg" style="color:#7ee8fa;">${cleanseText}</div>` : ''}
      <div class="dndSkillCardDmg" style="color:#9fd0ff;">${targetModeText}</div>
      ${ruleText ? `<div class="dndSkillCardRules">${ruleText}</div>` : ''}
      <div class="dndSkillCardAssigned">${assignedText}</div>
      ${classRestrictText ? `<div class="dndSkillCardAssigned" style="color:#ffb86b;">${classRestrictText}</div>` : ''}
      <div class="dndSkillCardBtns"></div>`;
    const btnRow = card.querySelector('.dndSkillCardBtns');
    const classOk = dndSkillAllowedForMyClass(skill);
    const myCharLevel = (() => { const m = myDndEntry(); return Math.max(1, Math.floor(Number(m && m.character && m.character.level) || 1)); })();
    const levelOk = dndYou && dndYou.isDM ? true : (!skill.libraryOnly || myCharLevel >= (Number(skill.level) || 0));
    const canUse = classOk && levelOk && dndYou && !skill.locked && !amIDead() && (dndYou.isDM || skill.classSkill || (skill.assignedIds || []).includes(dndYou.id) || (assignedNames.length === 0 && !skill.libraryOnly));
    const me = myDndEntry();
    const mySp = (me && me.character && me.character.sp != null) ? Number(me.character.sp) : 0;
    const notEnoughSp = dndYou && !dndYou.isDM && skill.spCost > 0 && mySp < skill.spCost;
    const myBag = (me && me.character && me.character.bag) || [];
    const myReqItemQty = skill.reqItemName ? ((myBag.find(it => it.name === skill.reqItemName) || {}).qty || 0) : 0;
    const notEnoughItem = dndYou && !dndYou.isDM && !!skill.reqItemName && myReqItemQty < skill.reqItemQty;
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
    } else if (!classOk) {
      useBtn.textContent = `🎓 คลาสไม่ตรง (ต้องเป็น: ${dndAllowedClassesTextClient(skill.allowedClasses)})`;
      useBtn.disabled = true;
      useBtn.classList.add('dndSkillLockedBtn');
    } else if (!levelOk) {
      useBtn.textContent = `🔒 ต้องเลเวลตัวละคร ${skill.level} ขึ้นไป (ตอนนี้เลเวล ${myCharLevel})`;
      useBtn.disabled = true;
      useBtn.classList.add('dndSkillLockedBtn');
    } else if (canUse && notEnoughSp) {
      useBtn.textContent = `🔵 SP ไม่พอ (ต้องใช้ ${skill.spCost})`;
      useBtn.disabled = true;
      useBtn.classList.add('dndSkillLockedBtn');
    } else if (canUse && notEnoughItem) {
      useBtn.textContent = `📦 ไอเทมไม่พอ (ต้องมี ${skill.reqItemName} x${skill.reqItemQty})`;
      useBtn.disabled = true;
      useBtn.classList.add('dndSkillLockedBtn');
    } else if (canUse) {
      useBtn.textContent = '🎲 ใช้สกิล';
      useBtn.dataset.readyAt = (dndYou && !dndYou.isDM && skill.readyAt) ? String(skill.readyAt) : '0';
      useBtn.dataset.usesLeft = (dndYou && !dndYou.isDM && skill.maxUses > 0) ? String(skill.usesLeft) : 'inf';
      useBtn.onclick = (ev) => { flashBtn(ev.currentTarget); openDndTargetPicker({ mode: 'skill', skillId: skill.id, targetMode: dndSkillTargetModeOf(skill), isHeal: !!skill.healDie || !!skill.cleanseEnabled || !!skill.buffAlly, isRevive: !!skill.healDie && !!skill.healRevive, isCleanse: !!skill.cleanseEnabled && !skill.healDie, isBuff: !!skill.buffAlly && !skill.healDie && !skill.cleanseEnabled, title: `เลือกเป้าหมายสำหรับ ${skill.name}` }); };
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
  if (effect.resist) bits.push(`ต้านทานสถานะ ${effect.resist > 0 ? '+' : ''}${effect.resist}%`);
  return bits.length ? bits.join(' · ') : 'ไม่มีผลกลไก';
}
function showDndPassiveFormError(msg) {
  const el = document.getElementById('dndPassiveFormError');
  if (el) el.textContent = msg || '';
}
function fillRaceSelectPlain(id, selectedKey) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = dndRaces.map(r => `<option value="${r.key}">${r.icon} ${escapeHtml(r.name)}</option>`).join('');
  sel.value = selectedKey && dndRaceByKey(selectedKey) ? selectedKey : (dndRaces[0] ? dndRaces[0].key : '');
}
function renderDndBuiltinPassiveList() {
  const sel = document.getElementById('dndBuiltinPassiveRace');
  if (!sel) return;
  fillRaceSelectPlain('dndBuiltinPassiveRace', sel.value);
  const raceKey = sel.value;
  const list = document.getElementById('dndBuiltinPassiveList');
  list.innerHTML = '';
  const builtin = (dndPassives && dndPassives[raceKey]) || [];
  builtin.forEach(base => {
    const ov = dndRacePassiveOverrides && dndRacePassiveOverrides[`${raceKey}:${base.key}`];
    const passive = ov ? Object.assign({}, base, ov) : base;
    const card = document.createElement('div');
    card.className = 'dndSkillCard';
    card.innerHTML = `
      <div class="dndSkillCardTop">
        <span class="dndSkillCardName">${passive.icon || '✨'} ${escapeHtml(passive.name)}</span>
        <span class="dndSkillCardStat">${ov ? '✏️ แก้ไขแล้ว' : 'ค่าเริ่มต้น'}</span>
      </div>
      ${passive.desc ? `<div class="dndSkillCardDesc">${escapeHtml(passive.desc)}</div>` : ''}
      <div class="dndSkillCardDmg">${dndPassiveEffectSummary(passive.effect || {})}</div>
      <div class="dndSkillCardBtns"></div>`;
    const btnRow = card.querySelector('.dndSkillCardBtns');
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'dndEditBtn';
    editBtn.textContent = '✏️ แก้ไข';
    editBtn.onclick = () => openDndBuiltinPassiveEdit(raceKey, base.key);
    btnRow.appendChild(editBtn);
    if (ov) {
      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'dndSkillDelBtn';
      resetBtn.textContent = '♻️ รีเซ็ต';
      resetBtn.onclick = () => { if (confirm(`รีเซ็ต "${base.name}" กลับเป็นค่าเริ่มต้น?`)) send({ type: 'dndRacePassiveOverrideReset', raceKey, passiveKey: base.key }); };
      btnRow.appendChild(resetBtn);
    }
    list.appendChild(card);
  });
}
document.getElementById('dndBuiltinPassiveRace').onchange = renderDndBuiltinPassiveList;
function renderDndPassiveManageList() {
  const section = document.getElementById('dndPassiveManageSection');
  const isDM = !!(dndYou && dndYou.isDM);
  section.style.display = isDM ? 'block' : 'none';
  if (!isDM) return;
  fillRaceSelectWithAny('dndPassiveRace', document.getElementById('dndPassiveRace').value);
  renderDndBuiltinPassiveList();
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
        resist: document.getElementById('dndPassiveResist').value,
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
  document.getElementById('dndPassiveResist').value = '0';
};
let dndPassiveEditTargetId = null;
let dndPassiveEditMode = 'custom'; // 'custom' = สกิลติดตัวที่ DM สร้างเอง, 'builtin' = แก้ไขค่าเริ่มต้นสกิลติดตัวประจำเผ่าที่มีมาให้ในระบบ
let dndPassiveEditBuiltin = null; // { raceKey, passiveKey } เมื่ออยู่โหมด 'builtin'
function openDndPassiveEdit(passiveId) {
  const passive = (dndCustomPassives || []).find(cp => cp.id === passiveId);
  if (!passive) return;
  dndPassiveEditMode = 'custom';
  dndPassiveEditBuiltin = null;
  dndPassiveEditTargetId = passiveId;
  const eff = passive.effect || {};
  document.getElementById('dndPassiveEditTitle').textContent = 'แก้ไขสกิลติดตัว (DM)';
  document.getElementById('dndPassiveEditName').value = passive.name || '';
  document.getElementById('dndPassiveEditIcon').value = passive.icon || '';
  fillRaceSelectWithAny('dndPassiveEditRace', passive.raceKey);
  document.getElementById('dndPassiveEditRace').disabled = false;
  document.getElementById('dndPassiveEditDesc').value = passive.desc || '';
  document.getElementById('dndPassiveEditAtk').value = eff.atk || 0;
  document.getElementById('dndPassiveEditDmg').value = eff.dmg || 0;
  document.getElementById('dndPassiveEditAc').value = eff.ac || 0;
  document.getElementById('dndPassiveEditHp').value = eff.hp || 0;
  document.getElementById('dndPassiveEditCritRange').value = eff.critRange || 0;
  document.getElementById('dndPassiveEditGold').value = eff.gold || 0;
  document.getElementById('dndPassiveEditResist').value = eff.resist || 0;
  document.getElementById('dndPassiveEditError').textContent = '';
  document.getElementById('dndPassiveEditResetBtn').style.display = 'none';
  document.getElementById('dndPassiveEditOverlay').style.display = 'flex';
}
function openDndBuiltinPassiveEdit(raceKey, passiveKey) {
  const base = ((dndPassives && dndPassives[raceKey]) || []).find(bp => bp.key === passiveKey);
  if (!base) return;
  const ov = dndRacePassiveOverrides && dndRacePassiveOverrides[`${raceKey}:${passiveKey}`];
  const passive = ov ? Object.assign({}, base, ov) : base;
  dndPassiveEditMode = 'builtin';
  dndPassiveEditBuiltin = { raceKey, passiveKey };
  dndPassiveEditTargetId = null;
  const raceInfo = dndRaceByKey(raceKey);
  const eff = passive.effect || {};
  document.getElementById('dndPassiveEditTitle').textContent = `แก้ไขค่าเริ่มต้นสกิลติดตัว: ${raceInfo ? raceInfo.name : raceKey} (DM)`;
  document.getElementById('dndPassiveEditName').value = passive.name || '';
  document.getElementById('dndPassiveEditIcon').value = passive.icon || '';
  fillRaceSelectWithAny('dndPassiveEditRace', raceKey);
  document.getElementById('dndPassiveEditRace').disabled = true; // ผูกกับเผ่านี้ตายตัว แก้ไม่ได้
  document.getElementById('dndPassiveEditDesc').value = passive.desc || '';
  document.getElementById('dndPassiveEditAtk').value = eff.atk || 0;
  document.getElementById('dndPassiveEditDmg').value = eff.dmg || 0;
  document.getElementById('dndPassiveEditAc').value = eff.ac || 0;
  document.getElementById('dndPassiveEditHp').value = eff.hp || 0;
  document.getElementById('dndPassiveEditCritRange').value = eff.critRange || 0;
  document.getElementById('dndPassiveEditGold').value = eff.gold || 0;
  document.getElementById('dndPassiveEditResist').value = eff.resist || 0;
  document.getElementById('dndPassiveEditError').textContent = '';
  document.getElementById('dndPassiveEditResetBtn').style.display = ov ? 'inline-block' : 'none';
  document.getElementById('dndPassiveEditOverlay').style.display = 'flex';
}
document.getElementById('dndPassiveEditSaveBtn').onclick = (ev) => {
  const name = document.getElementById('dndPassiveEditName').value.trim();
  if (!name) { document.getElementById('dndPassiveEditError').textContent = 'กรุณาตั้งชื่อสกิลติดตัว'; return; }
  const effect = {
    atk: document.getElementById('dndPassiveEditAtk').value,
    dmg: document.getElementById('dndPassiveEditDmg').value,
    ac: document.getElementById('dndPassiveEditAc').value,
    hp: document.getElementById('dndPassiveEditHp').value,
    critRange: document.getElementById('dndPassiveEditCritRange').value,
    gold: document.getElementById('dndPassiveEditGold').value,
    resist: document.getElementById('dndPassiveEditResist').value,
  };
  flashBtn(ev.currentTarget);
  if (dndPassiveEditMode === 'builtin' && dndPassiveEditBuiltin) {
    send({
      type: 'dndRacePassiveOverrideSave',
      raceKey: dndPassiveEditBuiltin.raceKey,
      passiveKey: dndPassiveEditBuiltin.passiveKey,
      passive: { name, icon: document.getElementById('dndPassiveEditIcon').value, desc: document.getElementById('dndPassiveEditDesc').value, effect },
    });
  } else if (dndPassiveEditTargetId != null) {
    send({
      type: 'dndPassiveEdit',
      passiveId: dndPassiveEditTargetId,
      passive: {
        name,
        icon: document.getElementById('dndPassiveEditIcon').value,
        raceKey: document.getElementById('dndPassiveEditRace').value,
        desc: document.getElementById('dndPassiveEditDesc').value,
        effect,
      },
    });
  }
  closeDndModals();
};
document.getElementById('dndPassiveEditResetBtn').onclick = () => {
  if (dndPassiveEditMode === 'builtin' && dndPassiveEditBuiltin) {
    send({ type: 'dndRacePassiveOverrideReset', raceKey: dndPassiveEditBuiltin.raceKey, passiveKey: dndPassiveEditBuiltin.passiveKey });
  }
  closeDndModals();
};
document.getElementById('dndPassiveEditCancelBtn').onclick = () => closeDndModals();

// ---- DM: จัดการแคตตาล็อกสัตว์อัญเชิญ (แก้ไขค่าเริ่มต้นของ DND_SUMMON_TEMPLATES) ----
const DND_TPL_STAT_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
function dndTplStatSummary(tpl) {
  return DND_TPL_STAT_KEYS.map(k => `${k.toUpperCase()} ${tpl[k]}`).join(' · ');
}
function renderDndSummonTemplateManageList() {
  const section = document.getElementById('dndSummonTemplateManageSection');
  const isDM = !!(dndYou && dndYou.isDM);
  section.style.display = isDM ? 'block' : 'none';
  if (!isDM) return;
  const list = document.getElementById('dndSummonTemplateList');
  list.innerHTML = '';
  Object.keys(dndSummonTemplates).forEach(key => {
    const tpl = dndSummonTemplateMerged(key);
    if (!tpl) return;
    const isOverridden = !!(dndSummonTemplateOverrides && dndSummonTemplateOverrides[key]);
    const card = document.createElement('div');
    card.className = 'dndSkillCard';
    card.innerHTML = `
      <div class="dndSkillCardTop">
        <span class="dndSkillCardName">${tpl.icon || '✨'} ${escapeHtml(tpl.name)}</span>
        <span class="dndSkillCardStat">${isOverridden ? '✏️ แก้ไขแล้ว' : 'ค่าเริ่มต้น'}</span>
      </div>
      <div class="dndSkillCardDmg">HP ${tpl.maxHp} · AC ${tpl.ac} · ${dndTplStatSummary(tpl)}${(tpl.attacks && tpl.attacks.length) ? ` · ${tpl.attacks.map(a => escapeHtml(a.name)).join(', ')}` : ''}</div>
      <div class="dndSkillCardBtns"></div>`;
    const btnRow = card.querySelector('.dndSkillCardBtns');
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'dndEditBtn';
    editBtn.textContent = '✏️ แก้ไข';
    editBtn.onclick = () => openDndSummonTemplateEdit(key);
    btnRow.appendChild(editBtn);
    if (isOverridden) {
      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'dndSkillDelBtn';
      resetBtn.textContent = '♻️ รีเซ็ต';
      resetBtn.onclick = () => { if (confirm(`รีเซ็ต "${tpl.name}" กลับเป็นค่าเริ่มต้น?`)) send({ type: 'dndSummonTemplateOverrideReset', key }); };
      btnRow.appendChild(resetBtn);
    }
    list.appendChild(card);
  });
}
let dndTplEditKey = null;
let dndTplEditAttacks = []; // ท่าโจมตีของ template ที่กำลังแก้ไขอยู่ตอนนี้ (แก้เสร็จค่อยส่งรวมไปทีเดียวตอนกด "บันทึก")
function dndTplRenderAttackList() {
  const box = document.getElementById('dndTplAtkList');
  if (!dndTplEditAttacks.length) { box.innerHTML = '<div class="dndRangeHint">ยังไม่มีท่าโจมตี</div>'; return; }
  box.innerHTML = dndTplEditAttacks.map((a, idx) => `
    <div class="dndSkillCard" style="margin-bottom:6px;">
      <div class="dndSkillCardTop">
        <span class="dndSkillCardName">${escapeHtml(a.name)}</span>
        <span class="dndSkillCardStat">${a.stat ? a.stat.toUpperCase() : ''}${a.toHit ? ` (+${a.toHit})` : ''}</span>
      </div>
      <div class="dndSkillCardDmg">${a.dmgDie ? `ดาเมจ ${a.dmgCount}d${a.dmgDie}${a.dmgMod ? (a.dmgMod > 0 ? '+' + a.dmgMod : a.dmgMod) : ''}` : 'ไม่มีดาเมจ'}${a.aoeRadius ? ` · AOE${a.aoeShape === 'line' ? 'เส้นตรง' : 'รัศมี'} ${a.aoeRadius}` : ''}${a.statusName ? ` · ติดสถานะ "${escapeHtml(a.statusName)}"` : ''}</div>
      <div class="dndSkillCardBtns"><button type="button" class="dndSkillDelBtn" data-tpl-atk-del="${idx}">ลบ</button></div>
    </div>`).join('');
  box.querySelectorAll('[data-tpl-atk-del]').forEach(btn => {
    btn.onclick = () => { dndTplEditAttacks.splice(Number(btn.dataset.tplAtkDel), 1); dndTplRenderAttackList(); };
  });
}
function dndTplResetAtkForm() {
  document.getElementById('dndTplAtkNameInput').value = '';
  document.getElementById('dndTplAtkStatSelect').value = '';
  document.getElementById('dndTplAtkToHitInput').value = '0';
  document.getElementById('dndTplAtkDieSelect').value = '0';
  document.getElementById('dndTplAtkCountInput').value = '1';
  document.getElementById('dndTplAtkModInput').value = '0';
  document.getElementById('dndTplAtkDescInput').value = '';
  document.getElementById('dndTplAtkAoeRadiusInput').value = '0';
  document.getElementById('dndTplAtkAoeShapeInput').value = 'circle';
  document.getElementById('dndTplAtkStatusName').value = '';
  document.getElementById('dndTplAtkStatusChance').value = '0';
  document.getElementById('dndTplAtkStatusDuration').value = '0';
  document.getElementById('dndTplAtkStatusNote').value = '';
  document.getElementById('dndTplAtkStatusIcon').value = '';
  document.getElementById('dndTplAtkStatusColor').value = '#3a3a55';
  document.getElementById('dndTplAtkStatusAtk').value = '0';
  document.getElementById('dndTplAtkStatusDmg').value = '0';
  document.getElementById('dndTplAtkStatusDef').value = '0';
  document.getElementById('dndTplAtkStatusVision').value = '0';
  document.getElementById('dndTplAtkStatusTick').value = '0';
  document.getElementById('dndTplAtkStatusTickInterval').value = '0';
}
function openDndSummonTemplateEdit(key) {
  const tpl = dndSummonTemplateMerged(key);
  if (!tpl) return;
  dndTplEditKey = key;
  dndTplEditAttacks = (tpl.attacks || []).map(a => Object.assign({}, a));
  document.getElementById('dndTplEditTitle').textContent = `แก้ไขสัตว์อัญเชิญ: ${tpl.icon || ''} ${tpl.name} (DM)`;
  document.getElementById('dndTplEditName').value = tpl.name || '';
  document.getElementById('dndTplEditIcon').value = tpl.icon || '';
  document.getElementById('dndTplEditColor').value = tpl.color || '#9fdc9f';
  document.getElementById('dndTplEditMaxHp').value = tpl.maxHp || 20;
  document.getElementById('dndTplEditAc').value = tpl.ac || 10;
  document.getElementById('dndTplEditSize').value = tpl.size || 'normal';
  DND_TPL_STAT_KEYS.forEach(k => { document.getElementById('dndTplEditStat-' + k).value = tpl[k] || 10; });
  document.getElementById('dndTplEditStatusResist').value = tpl.statusResist || 0;
  document.getElementById('dndTplEditError').textContent = '';
  const isOverridden = !!(dndSummonTemplateOverrides && dndSummonTemplateOverrides[key]);
  document.getElementById('dndTplEditResetBtn').style.display = isOverridden ? 'inline-block' : 'none';
  dndTplResetAtkForm();
  dndTplRenderAttackList();
  document.getElementById('dndSummonTemplateEditOverlay').style.display = 'flex';
}
document.getElementById('dndTplAtkAddBtn').onclick = (ev) => {
  const name = document.getElementById('dndTplAtkNameInput').value.trim();
  if (!name) return;
  flashBtn(ev.currentTarget);
  dndTplEditAttacks.push({
    name,
    stat: document.getElementById('dndTplAtkStatSelect').value,
    toHit: Number(document.getElementById('dndTplAtkToHitInput').value) || 0,
    dmgDie: Number(document.getElementById('dndTplAtkDieSelect').value) || 0,
    dmgCount: Number(document.getElementById('dndTplAtkCountInput').value) || 1,
    dmgMod: Number(document.getElementById('dndTplAtkModInput').value) || 0,
    desc: document.getElementById('dndTplAtkDescInput').value,
    aoeRadius: Number(document.getElementById('dndTplAtkAoeRadiusInput').value) || 0,
    aoeShape: document.getElementById('dndTplAtkAoeShapeInput').value,
    statusName: document.getElementById('dndTplAtkStatusName').value,
    statusNote: document.getElementById('dndTplAtkStatusNote').value,
    statusChance: Number(document.getElementById('dndTplAtkStatusChance').value) || 0,
    statusDurationSec: Number(document.getElementById('dndTplAtkStatusDuration').value) || 0,
    statusAtkMod: Number(document.getElementById('dndTplAtkStatusAtk').value) || 0,
    statusDmgMod: Number(document.getElementById('dndTplAtkStatusDmg').value) || 0,
    statusDefMod: Number(document.getElementById('dndTplAtkStatusDef').value) || 0,
    statusVisionMod: Number(document.getElementById('dndTplAtkStatusVision').value) || 0,
    statusTickValue: Number(document.getElementById('dndTplAtkStatusTick').value) || 0,
    statusTickIntervalSec: Number(document.getElementById('dndTplAtkStatusTickInterval').value) || 0,
    statusIcon: document.getElementById('dndTplAtkStatusIcon').value,
    statusColor: document.getElementById('dndTplAtkStatusColor').value,
  });
  dndTplResetAtkForm();
  dndTplRenderAttackList();
};
document.getElementById('dndTplEditSaveBtn').onclick = (ev) => {
  if (dndTplEditKey == null) return;
  const name = document.getElementById('dndTplEditName').value.trim();
  if (!name) { document.getElementById('dndTplEditError').textContent = 'กรุณาตั้งชื่อ'; return; }
  flashBtn(ev.currentTarget);
  const template = {
    name,
    icon: document.getElementById('dndTplEditIcon').value,
    color: document.getElementById('dndTplEditColor').value,
    size: document.getElementById('dndTplEditSize').value,
    maxHp: document.getElementById('dndTplEditMaxHp').value,
    ac: document.getElementById('dndTplEditAc').value,
    statusResist: document.getElementById('dndTplEditStatusResist').value,
    attacks: dndTplEditAttacks,
  };
  DND_TPL_STAT_KEYS.forEach(k => { template[k] = document.getElementById('dndTplEditStat-' + k).value; });
  send({ type: 'dndSummonTemplateOverrideSave', key: dndTplEditKey, template });
  closeDndModals();
};
document.getElementById('dndTplEditResetBtn').onclick = () => {
  if (dndTplEditKey != null) send({ type: 'dndSummonTemplateOverrideReset', key: dndTplEditKey });
  closeDndModals();
};
document.getElementById('dndTplEditCancelBtn').onclick = () => closeDndModals();

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
// จำกัดคลาสที่ใช้สกิลนี้ได้ (แก้ไขได้) — ใช้ Set แบบเดียวกับ dndSkillEditAssignSelected ด้านบน
let dndSkillEditClassSelected = new Set();
function renderDndSkillEditClassBox() {
  const box = document.getElementById('dndSkillEditClassBox');
  if (!box) return;
  box.innerHTML = dndClasses.map(cls => {
    const checked = dndSkillEditClassSelected.has(cls.key) ? 'checked' : '';
    return `<label class="dndAssignChip"><input type="checkbox" data-classkey="${cls.key}" ${checked}> ${escapeHtml(cls.icon || '')} ${escapeHtml(cls.name)}</label>`;
  }).join('');
  box.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.onchange = () => {
      const key = cb.dataset.classkey;
      if (cb.checked) dndSkillEditClassSelected.add(key); else dndSkillEditClassSelected.delete(key);
    };
  });
}
// เป้าหมายที่สกิลนี้เลือกได้: 'monster' / 'player' / 'both' — สกิลเก่าที่ยังไม่มีช่องนี้จะ fallback ตามกฎเดิม (ตรงกับฝั่งเซิร์ฟเวอร์)
function dndSkillTargetModeOf(skill) {
  if (skill.targetMode === 'monster' || skill.targetMode === 'player' || skill.targetMode === 'both' || skill.targetMode === 'self') return skill.targetMode;
  return (skill.buffAlly || skill.healDie || skill.cleanseEnabled) ? 'player' : 'monster';
}
function openDndSkillEdit(skillId) {
  const skill = dndSkills.find(s => s.id === skillId);
  if (!skill) return;
  dndSkillEditTargetId = skillId;
  document.getElementById('dndSkillEditTitle').textContent = `แก้ไขสกิล (DM) — ${skill.name}`;
  document.getElementById('dndSkillEditName').value = skill.name || '';
  document.getElementById('dndSkillEditIcon').value = skill.icon || '';
  document.getElementById('dndSkillEditColor').value = skill.color || '#7ee8fa';
  document.getElementById('dndSkillEditStat').value = skill.stat || '';
  document.getElementById('dndSkillEditGuaranteedHit').checked = !!skill.guaranteedHit;
  document.getElementById('dndSkillEditDesc').value = skill.desc || '';
  document.getElementById('dndSkillEditLevel').value = skill.level || 0;
  document.getElementById('dndSkillEditDmgDie').value = String(skill.dmgDie || 0);
  document.getElementById('dndSkillEditDmgCount').value = skill.dmgCount || 1;
  document.getElementById('dndSkillEditDmgMod').value = skill.dmgMod || 0;
  document.getElementById('dndSkillEditHealDie').value = String(skill.healDie || 0);
  document.getElementById('dndSkillEditHealCount').value = skill.healCount || 1;
  document.getElementById('dndSkillEditHealMod').value = skill.healMod || 0;
  document.getElementById('dndSkillEditHealRevive').value = skill.healRevive ? '1' : '0';
  document.getElementById('dndSkillEditStatusName').value = skill.statusName || '';
  document.getElementById('dndSkillEditStatusNote').value = skill.statusNote || '';
  document.getElementById('dndSkillEditStatusIcon').value = skill.statusIcon || '';
  document.getElementById('dndSkillEditStatusColor').value = skill.statusColor || '#ff6b6b';
  document.getElementById('dndSkillEditBuffAlly').checked = !!skill.buffAlly;
  document.getElementById('dndSkillEditTargetMode').value = dndSkillTargetModeOf(skill);
  document.getElementById('dndSkillEditStatusChance').value = skill.statusChance || 100;
  document.getElementById('dndSkillEditStatusDuration').value = skill.statusDurationSec || 0;
  document.getElementById('dndSkillEditStatusAtkMod').value = skill.statusAtkMod || 0;
  document.getElementById('dndSkillEditStatusDmgMod').value = skill.statusDmgMod || 0;
  document.getElementById('dndSkillEditStatusDefMod').value = skill.statusDefMod || 0;
  document.getElementById('dndSkillEditStatusVisionMod').value = skill.statusVisionMod || 0;
  document.getElementById('dndSkillEditStatusTick').value = skill.statusTickValue || 0;
  document.getElementById('dndSkillEditStatusTickInterval').value = skill.statusTickIntervalSec || 6;
  document.getElementById('dndSkillEditAoeRadius').value = skill.aoeRadius || 0;
  document.getElementById('dndSkillEditAoeShape').value = skill.aoeShape === 'line' ? 'line' : 'circle';
  document.getElementById('dndSkillEditRange').value = skill.range || 0;
  document.getElementById('dndSkillEditCleanseEnabled').checked = !!skill.cleanseEnabled;
  document.getElementById('dndSkillEditCleanseName').value = skill.cleanseName || '';
  document.getElementById('dndSkillEditCooldown').value = skill.cooldownSec || 0;
  document.getElementById('dndSkillEditMaxUses').value = skill.maxUses || 0;
  document.getElementById('dndSkillEditSpCost').value = skill.spCost || 0;
  document.getElementById('dndSkillEditReqItemName').value = skill.reqItemName || '';
  document.getElementById('dndSkillEditReqItemQty').value = skill.reqItemQty || 1;
  document.getElementById('dndSkillEditIsSummon').checked = !!skill.isSummon;
  fillSummonTemplateSelect('dndSkillEditSummonTemplateKey');
  document.getElementById('dndSkillEditSummonTemplateKey').value = skill.summonTemplateKey || '';
  document.getElementById('dndSkillEditSummonDuration').value = skill.summonDurationSec || 0;
  document.getElementById('dndSkillEditSummonMaxActive').value = skill.summonMaxActive || 1;
  dndSkillEditAssignSelected = new Set(skill.assignedIds || []);
  renderDndSkillEditAssignBox();
  dndSkillEditClassSelected = new Set(skill.allowedClasses || []);
  renderDndSkillEditClassBox();
  document.getElementById('dndSkillEditLibraryOnly').checked = !!skill.libraryOnly;
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
      icon: document.getElementById('dndSkillEditIcon').value,
      color: document.getElementById('dndSkillEditColor').value,
      stat: document.getElementById('dndSkillEditStat').value,
      desc: document.getElementById('dndSkillEditDesc').value,
      guaranteedHit: document.getElementById('dndSkillEditGuaranteedHit').checked,
      damage: {
        die: document.getElementById('dndSkillEditDmgDie').value,
        count: document.getElementById('dndSkillEditDmgCount').value,
        mod: document.getElementById('dndSkillEditDmgMod').value,
      },
      heal: {
        die: document.getElementById('dndSkillEditHealDie').value,
        count: document.getElementById('dndSkillEditHealCount').value,
        mod: document.getElementById('dndSkillEditHealMod').value,
        revive: document.getElementById('dndSkillEditHealRevive').value === '1',
      },
      status: {
        name: document.getElementById('dndSkillEditStatusName').value,
        note: document.getElementById('dndSkillEditStatusNote').value,
        chance: document.getElementById('dndSkillEditStatusChance').value,
        durationSec: document.getElementById('dndSkillEditStatusDuration').value,
        atkMod: document.getElementById('dndSkillEditStatusAtkMod').value,
        dmgMod: document.getElementById('dndSkillEditStatusDmgMod').value,
        defMod: document.getElementById('dndSkillEditStatusDefMod').value,
        visionMod: document.getElementById('dndSkillEditStatusVisionMod').value,
        tickValue: document.getElementById('dndSkillEditStatusTick').value,
        tickIntervalSec: document.getElementById('dndSkillEditStatusTickInterval').value,
        icon: document.getElementById('dndSkillEditStatusIcon').value,
        color: document.getElementById('dndSkillEditStatusColor').value,
      },
      buffAlly: document.getElementById('dndSkillEditBuffAlly').checked,
      targetMode: document.getElementById('dndSkillEditTargetMode').value,
      aoe: {
        radius: document.getElementById('dndSkillEditAoeRadius').value,
        shape: document.getElementById('dndSkillEditAoeShape').value,
      },
      range: document.getElementById('dndSkillEditRange').value,
      cleanse: {
        enabled: document.getElementById('dndSkillEditCleanseEnabled').checked,
        name: document.getElementById('dndSkillEditCleanseName').value,
      },
      level: document.getElementById('dndSkillEditLevel').value,
      cooldownSec: document.getElementById('dndSkillEditCooldown').value,
      maxUses: document.getElementById('dndSkillEditMaxUses').value,
      spCost: document.getElementById('dndSkillEditSpCost').value,
      reqItem: {
        name: document.getElementById('dndSkillEditReqItemName').value,
        qty: document.getElementById('dndSkillEditReqItemQty').value,
      },
      assignedIds: Array.from(dndSkillEditAssignSelected),
      libraryOnly: document.getElementById('dndSkillEditLibraryOnly').checked,
      allowedClasses: Array.from(dndSkillEditClassSelected),
      isSummon: document.getElementById('dndSkillEditIsSummon').checked,
      summonTemplateKey: document.getElementById('dndSkillEditSummonTemplateKey').value,
      summonDurationSec: document.getElementById('dndSkillEditSummonDuration').value,
      summonMaxActive: document.getElementById('dndSkillEditSummonMaxActive').value,
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

// ---- แชทด่วน (Ctrl+K): โอเวอร์เลย์แยกต่างหากจากช่องแชท/บันทึกหลัก (#dndLogBox) ----
function sendDndQuickChat() {
  const input = document.getElementById('dndQuickChatInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  // ข้อความที่ขึ้นต้นด้วย "/" คือคำสั่ง — ส่งแยกช่องทาง ไม่ broadcast เป็นข้อความแชท ไม่โผล่ในกล่องแชทของใครเลย (รวมถึงตัวเอง)
  if (text.startsWith('/')) {
    send({ type: 'dndCommand', text });
    return;
  }
  send({ type: 'dndQuickChat', text });
}
document.getElementById('dndQuickChatSendBtn').onclick = sendDndQuickChat;
document.getElementById('dndQuickChatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendDndQuickChat(); });

function appendDndQuickChat(name, text) {
  const el = document.getElementById('dndQuickChatMessages');
  const d = document.createElement('div');
  d.innerHTML = `<b>${escapeHtml(name)}:</b> ${escapeHtml(text)}`;
  el.appendChild(d);
  el.scrollTop = el.scrollHeight;
}

// ผลลัพธ์คำสั่ง / — เห็นเฉพาะคนพิมพ์เอง แสดงเป็นบรรทัดสีจาง ๆ แยกจากข้อความแชทปกติ ไม่ระบุชื่อผู้พิมพ์
function appendDndCommandResult(text) {
  const el = document.getElementById('dndQuickChatMessages');
  const d = document.createElement('div');
  d.style.color = '#9aa4b2';
  d.style.fontStyle = 'italic';
  d.textContent = text;
  el.appendChild(d);
  el.scrollTop = el.scrollHeight;
}

function toggleDndQuickChat() {
  const overlay = document.getElementById('dndQuickChatOverlay');
  const opening = overlay.style.display === 'none';
  overlay.style.display = opening ? 'flex' : 'none';
  if (opening) document.getElementById('dndQuickChatInput').focus();
}

// คีย์ลัด Ctrl+K: เปิด/ปิดแชทด่วน เฉพาะตอนอยู่หน้าเกม D&D (กันไม่ให้เบราว์เซอร์เปิดช่องค้นหาแทน)
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'k') return;
  const dndScreen = document.getElementById('dndScreen');
  if (!dndScreen || dndScreen.style.display === 'none') return;
  e.preventDefault();
  toggleDndQuickChat();
});

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

// (แอนิเมชันโจมตีบนแผนที่ / playDndMapAttackAnim() ถูกย้ายไปที่ public/js/dnd-map.js)
function myDndEntry() {
  return dndPlayersList.find(p => dndYou && p.id === dndYou.id);
}

// จำกัดคลาสที่ใช้สกิลนี้ได้ (ฝั่งไคลเอ็นต์ — mirror ของ dndAllowedClassesText/dndSkillClassAllowed ใน server/dnd.js)
// ใช้แสดงแบดจ์และปิดปุ่มใช้/ซื้อล่วงหน้าก่อนจะยิงไปเซิร์ฟเวอร์ (เซิร์ฟเวอร์เช็คซ้ำอีกทีเป็นด่านสุดท้ายเสมอ)
function dndAllowedClassesTextClient(allowedClasses) {
  const allowed = Array.isArray(allowedClasses) ? allowedClasses : [];
  if (!allowed.length) return '';
  return allowed.map(key => { const cls = dndClassByKey(key); return cls ? `${cls.icon} ${cls.name}` : key; }).join(', ');
}
function dndSkillAllowedForMyClass(skill) {
  if (!dndYou || dndYou.isDM) return true;
  const allowed = Array.isArray(skill.allowedClasses) ? skill.allowedClasses : [];
  if (!allowed.length) return true;
  const me = myDndEntry();
  const myClassKey = me && me.character && me.character.classKey;
  return allowed.includes(myClassKey);
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
// ไลบรารีลักษณะเด่นของอวาตาร์ ใช้ผสมกันได้หลายอย่างต่อเผ่า (วาดรอบหัว/ลำตัวหลังผมและหน้า)
function dndAvatarFeatureSVG(feature, skin) {
  switch (feature) {
    case 'ears': return `<polygon points="36,30 26,22 34,42" fill="${skin}"/><polygon points="84,30 94,22 86,42" fill="${skin}"/>`;
    case 'earsBig': return `<polygon points="38,28 18,10 36,44" fill="${skin}"/><polygon points="82,28 102,10 84,44" fill="${skin}"/>`;
    case 'beard': return `<rect x="48" y="46" width="24" height="14" rx="6" fill="#c9c9c9"/>`;
    case 'beardDark': return `<rect x="48" y="46" width="24" height="14" rx="6" fill="#3b2a1e"/>`;
    case 'horns': return `<polygon points="46,14 40,0 50,10" fill="#3a2a2a"/><polygon points="74,14 80,0 70,10" fill="#3a2a2a"/>`;
    case 'hornsSmall': return `<polygon points="50,12 47,2 53,10" fill="#6b4a2a"/><polygon points="70,12 73,2 67,10" fill="#6b4a2a"/>`;
    case 'hornsBull': return `<path d="M42,16 Q30,4 34,-6" stroke="#3a2a2a" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M78,16 Q90,4 86,-6" stroke="#3a2a2a" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    case 'hat': return `<polygon points="40,14 60,-12 80,14" fill="#5b3fae"/>`;
    case 'halo': return `<ellipse cx="60" cy="2" rx="16" ry="5" fill="none" stroke="#f6e27a" stroke-width="3"/>`;
    case 'wingsFeather': return `<path d="M30,20 Q8,8 14,34 Q22,30 30,26 Z" fill="#eef0e8"/><path d="M90,20 Q112,8 106,34 Q98,30 90,26 Z" fill="#eef0e8"/>`;
    case 'wingsBat': return `<path d="M30,20 Q6,14 12,36 Q20,32 30,26 Z" fill="#4a3b4a"/><path d="M90,20 Q114,14 108,36 Q100,32 90,26 Z" fill="#4a3b4a"/>`;
    case 'beak': return `<polygon points="55,32 65,32 60,42" fill="#e0a838"/>`;
    case 'scalePattern': return `<circle cx="50" cy="24" r="1.6" fill="#000" opacity="0.18"/><circle cx="70" cy="24" r="1.6" fill="#000" opacity="0.18"/><circle cx="60" cy="18" r="1.6" fill="#000" opacity="0.18"/>`;
    case 'mane': return `<circle cx="60" cy="34" r="30" fill="none" stroke="#c9922b" stroke-width="9" opacity="0.55"/>`;
    case 'catEars': return `<polygon points="42,16 37,-2 51,12" fill="${skin}"/><polygon points="78,16 83,-2 69,12" fill="${skin}"/>`;
    case 'rabbitEars': return `<ellipse cx="46" cy="-2" rx="6" ry="20" fill="${skin}"/><ellipse cx="74" cy="-2" rx="6" ry="20" fill="${skin}"/>`;
    case 'mechanical': return `<rect x="40" y="16" width="8" height="8" rx="1" fill="#8b8f96"/><rect x="72" y="16" width="8" height="8" rx="1" fill="#8b8f96"/><rect x="52" y="8" width="16" height="4" fill="#6c7078"/>`;
    case 'shell': return `<ellipse cx="60" cy="84" rx="32" ry="26" fill="#6b8a4a" opacity="0.9"/><path d="M40 84 Q60 68 80 84" stroke="#4a6a34" stroke-width="2" fill="none" opacity="0.6"/>`;
    case 'trunk': return `<path d="M58 40 Q52 62 62 70 Q69 72 66 63" stroke="${skin}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
    case 'snakeHair': return `<path d="M40 12 Q32 22 40 30" stroke="#3d6b3d" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M80 12 Q88 22 80 30" stroke="#3d6b3d" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M60 6 Q54 18 62 26" stroke="#3d6b3d" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    case 'antennae': return `<path d="M52 8 Q46 -8 38 -10" stroke="#3a2a2a" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M68 8 Q74 -8 82 -10" stroke="#3a2a2a" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    case 'earsSmall': return `<polygon points="38,30 32,24 36,40" fill="${skin}"/><polygon points="82,30 88,24 84,40" fill="${skin}"/>`;
    case 'tusks': return `<polygon points="52,44 49,54 55,50" fill="#eee4d3"/><polygon points="68,44 71,54 65,50" fill="#eee4d3"/>`;
    case 'tusksSmall': return `<polygon points="54,43 52,50 57,47" fill="#eee4d3"/><polygon points="66,43 68,50 63,47" fill="#eee4d3"/>`;
    case 'fangs': return `<polygon points="55,41 54,47 58,42" fill="#f5f0e6"/><polygon points="65,41 66,47 62,42" fill="#f5f0e6"/>`;
    case 'scar': return `<path d="M50 16 L58 46" stroke="#8a5a5a" stroke-width="1.6" opacity="0.7" stroke-linecap="round"/>`;
    case 'gills': return `<path d="M32 30 L38 30 M32 35 L38 35 M32 40 L38 40" stroke="#3a6b7a" stroke-width="2" stroke-linecap="round"/><path d="M88 30 L82 30 M88 35 L82 35 M88 40 L82 40" stroke="#3a6b7a" stroke-width="2" stroke-linecap="round"/>`;
    case 'stitches': return `<path d="M42 30 L48 30 M45 27 L45 33" stroke="#5a4a42" stroke-width="1.6"/><path d="M70 40 L78 40 M74 37 L74 43" stroke="#5a4a42" stroke-width="1.6"/>`;
    case 'furPatches': return `<path d="M38 40 Q34 46 38 52" stroke="#6b5238" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M82 40 Q86 46 82 52" stroke="#6b5238" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    case 'tribalMarks': return `<path d="M46 16 L42 24" stroke="#5a3a2a" stroke-width="2" stroke-linecap="round"/><path d="M74 16 L78 24" stroke="#5a3a2a" stroke-width="2" stroke-linecap="round"/>`;
    case 'freckles': return `<circle cx="48" cy="34" r="1.1" fill="#8a6a4a" opacity="0.6"/><circle cx="52" cy="37" r="1.1" fill="#8a6a4a" opacity="0.6"/><circle cx="68" cy="34" r="1.1" fill="#8a6a4a" opacity="0.6"/><circle cx="72" cy="37" r="1.1" fill="#8a6a4a" opacity="0.6"/>`;
    case 'thirdEye': return `<ellipse cx="60" cy="18" rx="3.4" ry="2.2" fill="#9ab8d8"/><circle cx="60" cy="18" r="1" fill="#2b2b2b"/>`;
    case 'foreheadGem': return `<circle cx="60" cy="18" r="3" fill="#7a5ac9"/><circle cx="60" cy="18" r="1.2" fill="#c9b8f0"/>`;
    case 'elementalMarks': return `<path d="M48 18 Q52 26 48 32" stroke="#5ab0d8" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M72 18 Q68 26 72 32" stroke="#5ab0d8" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    case 'tail': return `<path d="M84 108 Q106 116 100 138" stroke="#8a7458" stroke-width="7" fill="none" stroke-linecap="round"/>`;
    case 'bubbles': return `<circle cx="46" cy="26" r="3" fill="#fff" opacity="0.3"/><circle cx="74" cy="22" r="2.2" fill="#fff" opacity="0.3"/><circle cx="58" cy="46" r="2.6" fill="#fff" opacity="0.25"/>`;
    case 'snout': return `<ellipse cx="60" cy="42" rx="9" ry="6" fill="${skin}"/><circle cx="56" cy="42" r="1" fill="#2b2b2b"/><circle cx="64" cy="42" r="1" fill="#2b2b2b"/>`;
    case 'leafMark': return `<path d="M56 20 Q60 12 64 20 Q60 24 56 20" fill="#6ba05a" opacity="0.75"/>`;
    case 'mole': return `<circle cx="70" cy="38" r="1.3" fill="#5a3a2a" opacity="0.7"/>`;
    case 'earring': return `<circle cx="36" cy="34" r="2.2" fill="none" stroke="#d8b84a" stroke-width="1.4"/><circle cx="84" cy="34" r="2.2" fill="none" stroke="#d8b84a" stroke-width="1.4"/>`;
    case 'glowEyes': return `<circle cx="52" cy="30" r="3.4" fill="none" stroke="#f0d878" stroke-width="1.2" opacity="0.8"/><circle cx="68" cy="30" r="3.4" fill="none" stroke="#f0d878" stroke-width="1.2" opacity="0.8"/>`;
    case 'wrinkles': return `<path d="M48 22 Q60 18 72 22" stroke="#000" stroke-width="1" opacity="0.2" fill="none"/><path d="M47 46 Q60 50 73 46" stroke="#000" stroke-width="1" opacity="0.2" fill="none"/>`;
    case 'jewelBand': return `<path d="M38 20 Q60 12 82 20" stroke="#d8b84a" stroke-width="2.4" fill="none"/><circle cx="60" cy="15" r="2" fill="#7ab8d8"/>`;
    case 'clawMarks': return `<path d="M46 32 L50 44" stroke="#000" stroke-width="1" opacity="0.25" stroke-linecap="round"/><path d="M50 30 L54 44" stroke="#000" stroke-width="1" opacity="0.25" stroke-linecap="round"/><path d="M54 28 L58 44" stroke="#000" stroke-width="1" opacity="0.25" stroke-linecap="round"/>`;
    case 'whiskers': return `<path d="M40 38 L28 36 M40 40 L28 41" stroke="#3a3a3a" stroke-width="1" opacity="0.6"/><path d="M80 38 L92 36 M80 40 L92 41" stroke="#3a3a3a" stroke-width="1" opacity="0.6"/>`;
    case 'stripes': return `<path d="M46 18 L44 26" stroke="#3a2a1a" stroke-width="2" opacity="0.55" stroke-linecap="round"/><path d="M74 18 L76 26" stroke="#3a2a1a" stroke-width="2" opacity="0.55" stroke-linecap="round"/>`;
    default: return '';
  }
}
// สีผิว + ขนาดตัว + ลักษณะเด่นของแต่ละเผ่าพันธุ์ (ครบทุกเผ่าใน DND_RACES)
const DND_RACE_AVATAR = {
  human:       { skin: '#f0c8a0', scale: 1,    features: ['mole'] },
  elf:         { skin: '#f3d9b8', scale: 1.05, features: ['ears', 'earring'] },
  dwarf:       { skin: '#e8b98c', scale: 0.85, features: ['beard', 'scar'] },
  halfling:    { skin: '#f0c8a0', scale: 0.72, features: ['earsSmall', 'freckles'] },
  orc:         { skin: '#8fae6b', scale: 1.12, features: ['tusks', 'scar'] },
  tiefling:    { skin: '#c97b6b', scale: 1,    features: ['horns', 'glowEyes'] },
  gnome:       { skin: '#f0c8a0', scale: 0.68, features: ['hat', 'freckles'] },
  dragonborn:  { skin: '#7a9a7a', scale: 1.08, features: ['scalePattern', 'hornsSmall'] },
  medusa:      { skin: '#a8c48a', scale: 1,    features: ['snakeHair', 'glowEyes'] },
  aasimar:     { skin: '#f3e0c8', scale: 1,    features: ['halo', 'glowEyes'] },
  goliath:     { skin: '#b89a7a', scale: 1.15, features: ['tribalMarks', 'scar'] },
  halfElf:     { skin: '#f3d9b8', scale: 1,    features: ['ears', 'freckles'] },
  halfOrc:     { skin: '#a0956b', scale: 1.1,  features: ['tusksSmall', 'scar'] },
  aarakocra:   { skin: '#c9a876', scale: 0.95, features: ['wingsFeather', 'beak'] },
  astralElf:   { skin: '#d8cbe8', scale: 1,    features: ['ears', 'glowEyes'] },
  autognome:   { skin: '#b0b0b0', scale: 0.7,  features: ['mechanical', 'glowEyes'] },
  bugbear:     { skin: '#8a7458', scale: 1.15, features: ['earsBig', 'furPatches'] },
  centaur:     { skin: '#d8a878', scale: 1.1,  features: ['tail', 'tribalMarks'] },
  changeling:  { skin: '#c8b8a0', scale: 1,    features: ['freckles'] },
  deepGnome:   { skin: '#9a8a7a', scale: 0.68, features: ['hat', 'wrinkles'] },
  dhampir:     { skin: '#d8c8c8', scale: 1,    features: ['fangs', 'glowEyes'] },
  duergar:     { skin: '#8a8a8a', scale: 0.85, features: ['beard', 'wrinkles'] },
  eladrin:     { skin: '#f3d9b8', scale: 1,    features: ['ears', 'earring'] },
  fairy:       { skin: '#f0d8c8', scale: 0.65, features: ['wingsFeather', 'freckles'] },
  firbolg:     { skin: '#b0c090', scale: 1.2,  features: ['leafMark', 'wrinkles'] },
  genasi:      { skin: '#a0c8d8', scale: 1,    features: ['elementalMarks', 'glowEyes'] },
  giff:        { skin: '#7a8a6a', scale: 1.18, features: ['snout', 'scar'] },
  githyanki:   { skin: '#c8a878', scale: 1,    features: ['scar', 'clawMarks'] },
  githzerai:   { skin: '#9aa8b8', scale: 1,    features: ['thirdEye', 'wrinkles'] },
  goblin:      { skin: '#8fae6b', scale: 0.72, features: ['earsBig', 'tusksSmall'] },
  hadozee:     { skin: '#a08858', scale: 1,    features: ['catEars', 'furPatches'] },
  harengon:    { skin: '#e8d8c8', scale: 1,    features: ['rabbitEars', 'whiskers'] },
  hexblood:    { skin: '#b898a8', scale: 1,    features: ['hornsSmall', 'scar'] },
  hobgoblin:   { skin: '#a89858', scale: 1.05, features: ['scar', 'tribalMarks'] },
  kalashtar:   { skin: '#d8c8b8', scale: 1,    features: ['foreheadGem', 'glowEyes'] },
  kender:      { skin: '#e0c8a0', scale: 0.7,  features: ['earsSmall', 'freckles'] },
  kenku:       { skin: '#4a4a4a', scale: 0.95, features: ['beak', 'scalePattern'] },
  kobold:      { skin: '#8ab878', scale: 0.75, features: ['scalePattern', 'tail'] },
  leonin:      { skin: '#d8a848', scale: 1.05, features: ['mane', 'stripes'] },
  lizardfolk:  { skin: '#6a9a6a', scale: 1,    features: ['scalePattern', 'tail'] },
  loxodon:     { skin: '#8a98a8', scale: 1.1,  features: ['trunk', 'wrinkles'] },
  minotaur:    { skin: '#7a6858', scale: 1.15, features: ['hornsBull', 'clawMarks'] },
  owlin:       { skin: '#b89868', scale: 0.95, features: ['wingsFeather', 'beak'] },
  plasmoid:    { skin: '#7ac8a8', scale: 1,    features: ['bubbles', 'glowEyes'] },
  reborn:      { skin: '#b8b0a8', scale: 1,    features: ['stitches', 'glowEyes'] },
  satyr:       { skin: '#c9a878', scale: 1,    features: ['hornsSmall', 'tail'] },
  seaElf:      { skin: '#a8c8d8', scale: 1,    features: ['ears', 'gills'] },
  shadarKai:   { skin: '#c8c0d8', scale: 1,    features: ['ears', 'glowEyes'] },
  shifter:     { skin: '#a08868', scale: 1.05, features: ['furPatches', 'clawMarks'] },
  simicHybrid: { skin: '#88b898', scale: 1,    features: ['gills', 'scalePattern'] },
  tabaxi:      { skin: '#c89858', scale: 1,    features: ['catEars', 'whiskers'] },
  thriKreen:   { skin: '#8ab878', scale: 1,    features: ['antennae', 'clawMarks'] },
  tortle:      { skin: '#7a9868', scale: 1.1,  features: ['shell', 'wrinkles'] },
  triton:      { skin: '#78b8c8', scale: 1,    features: ['gills', 'jewelBand'] },
  vedalken:    { skin: '#7898b8', scale: 1,    features: ['earsSmall', 'glowEyes'] },
  verdan:      { skin: '#98b878', scale: 0.9,  features: ['earsSmall', 'freckles'] },
  warforged:   { skin: '#9a9a9a', scale: 1.1,  features: ['mechanical', 'scar'] },
  yuanTi:      { skin: '#98b878', scale: 1,    features: ['scalePattern', 'glowEyes'] },
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
  const clsInfo = c ? dndClassByKey(c.classKey) : null;
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
  const features = raceAv.features || [];
  const extraHead = features.map(f => dndAvatarFeatureSVG(f, skin)).join('');
  const hairSvg = features.includes('hat') ? '' : dndHairSVG(ap.hair, ap.hairColor);
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
          : `<text x="94" y="90" font-size="22" text-anchor="middle">${(clsInfo && clsInfo.icon) || '🗡️'}</text>`)
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
  const builtin = ((dndPassives && dndPassives[raceKey]) || []).map(base => {
    const ov = dndRacePassiveOverrides && dndRacePassiveOverrides[`${raceKey}:${base.key}`];
    return ov ? Object.assign({}, base, ov, { overridden: true }) : base;
  });
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
  const bonusOf = (k) => ((race && race.bonus[k]) || 0) + ((cls && cls.bonus[k]) || 0);
  const spent = Object.keys(DND_STAT_LABELS).reduce((sum, k) => sum + dndPointBuyCostForRaw(dndCreateAlloc[k], bonusOf(k)), 0);
  const left = dndPointBuyBudget - spent;
  Object.keys(DND_STAT_LABELS).forEach(k => {
    const row = document.createElement('div');
    row.className = 'dndStatAllocRow';
    const rb = (race && race.bonus[k]) || 0;
    const cb = (cls && cls.bonus[k]) || 0;
    const bonus = rb + cb;
    const nextStepCost = dndPointBuyStepCost(dndCreateAlloc[k], bonus);
    row.innerHTML = `
      <span class="dndStatAllocLabel">${DND_STAT_LABELS[k]}</span>
      <button type="button" data-act="minus">−</button>
      <span class="dndStatAllocVal">${finalStats[k]}</span>
      <button type="button" data-act="plus">+</button>
      <span class="dndStatAllocBreakdown">${dndCreateAlloc[k]} แต้ม (ใช้ ${dndPointBuyCostForRaw(dndCreateAlloc[k], bonus)} พอย)${rb ? ' + ' + rb + ' เผ่า' : ''}${cb ? ' + ' + cb + ' คลาส' : ''}${left >= nextStepCost ? ` · เพิ่มอีก 1 ใช้ ${nextStepCost} พอย` : ''}</span>`;
    row.querySelector('[data-act="minus"]').disabled = dndCreateAlloc[k] <= dndPointBuyMin;
    row.querySelector('[data-act="plus"]').disabled = left < nextStepCost;
    dndBindHoldRepeat(row.querySelector('[data-act="minus"]'), () => { dndCreateAlloc[k] = Math.max(dndPointBuyMin, dndCreateAlloc[k] - 1); renderStatAllocGrid(); updateCreateHints(); validateCreateForm(); });
    dndBindHoldRepeat(row.querySelector('[data-act="plus"]'), () => {
      const stepCost = dndPointBuyStepCost(dndCreateAlloc[k], bonusOf(k));
      const curSpent = Object.keys(DND_STAT_LABELS).reduce((sum, kk) => sum + dndPointBuyCostForRaw(dndCreateAlloc[kk], bonusOf(kk)), 0);
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
  const race = dndCreateSelectedRace ? dndRaceByKey(dndCreateSelectedRace) : null;
  const cls = dndCreateSelectedClass ? dndClassByKey(dndCreateSelectedClass) : null;
  const spent = Object.keys(DND_STAT_LABELS).reduce((sum, k) => {
    const bonus = ((race && race.bonus[k]) || 0) + ((cls && cls.bonus[k]) || 0);
    return sum + dndPointBuyCostForRaw(dndCreateAlloc[k], bonus);
  }, 0);
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
  const equipment = readEquipGrid('dndCreateEquipGrid');
  box.innerHTML = dndBuildAvatarSVG({ raceKey: dndCreateSelectedRace, classKey: dndCreateSelectedClass, equipment, appearance: dndCreateAppearance }, 100, 130);
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
  applyStarterGearPreview(key);
  renderStatAllocGrid(); updateCreateHints(); validateCreateForm(); renderCreateAvatarPreview();
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
    if (nameInput) nameInput.addEventListener('input', () => { dndCreateManualEquip[slot] = true; renderCreateAvatarPreview(); });
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
    ['SP', `${c.sp != null ? c.sp : 0} / ${c.maxSp != null ? c.maxSp : 0}`],
    ['EXP', c.exp || 0],
    ['ทอง', c.gold || 0],
    ['แต้มสเตตัส (จากเลเวลอัพ)', statPoints],
  ];
  box.innerHTML = `<div class="dndAvatarWrap">${dndBuildAvatarSVG(c, 120, 160)}</div>`
    + rows.map(([k, v]) => `<div class="dndSheetViewRow"><span>${escapeHtml(k)}</span><span>${escapeHtml(String(v))}</span></div>`).join('')
    + `<div class="dndSheetStatRow">${Object.keys(DND_STAT_LABELS).map(k => {
      // ต้นทุนต้องอิงค่ารวม (ดิบ+โบนัสเผ่า/คลาส) ไม่ใช่ค่าดิบเฉยๆ — ให้ตรงกับตำแหน่งค่ารวมจริงที่สเตตัสยืนอยู่
      const rawScore = (c.pointBuy && c.pointBuy[k] != null) ? c.pointBuy[k] : c[k];
      const statBonus = ((raceInfo && raceInfo.bonus && raceInfo.bonus[k]) || 0) + ((clsInfo && clsInfo.bonus && clsInfo.bonus[k]) || 0);
      const stepCost = dndPointBuyStepCost(rawScore, statBonus);
      const btn = statPoints > 0
        ? `<button type="button" class="dndStatPlusBtn" ${statPoints >= stepCost ? '' : 'disabled'} title="เพิ่มอีก 1 ใช้แต้มสเตตัส ${stepCost} แต้ม" onclick="dndSpendStatPointClick('${k}')">+${stepCost}</button>`
        : '';
      return `<div class="dndStatTip" ${dndStatTipHtml(k)}><div class="dndStatKey">${DND_STAT_LABELS[k]}</div><div class="dndStatVal">${c[k]} <span class="dndStatModBadge">(${dndAbilityModText(c[k])})</span></div>${btn}</div>`;
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
// ค่าอ้างอิงตอนเปิดหน้าต่างแก้ไข — ใช้เทียบตัวปรับ CON เดิม/ใหม่ เพื่อพรีวิว HP ที่จะเปลี่ยนก่อน DM กดบันทึกจริง (เซิร์ฟเวอร์คำนวณจริงอีกที ค่านี้แค่โชว์พรีวิว)
let dndDmEditBaseline = { con: 10, maxHp: 20, hp: 20 };
// โบนัส AC/HP ของสกิลติดตัวที่ตัวละครมีอยู่ "ตอนเปิดฟอร์มแก้ไข" — ใช้เทียบกับพาสซีพที่ DM เลือกใหม่ในฟอร์ม เพื่อโชว์ข้อความพรีวิวส่วนต่าง AC/HP ก่อนกดบันทึกจริง
let dndDmEditPassiveBaseline = { ac: 0, hp: 0 };
// เมื่อ DM เปลี่ยนตัวเลือกสกิลติดตัวในฟอร์มแก้ไข — โชว์ "ข้อความ" บอกส่วนต่าง AC/HP ที่จะเกิดขึ้นเท่านั้น (เหมือนช่อง CON hint)
// ห้ามไปแก้ค่าในช่อง AC/HP/MaxHP ตรงๆ เด็ดขาด เพราะเซิร์ฟเวอร์เป็นคนคำนวณส่วนต่างจริงจากค่าดิบในฟอร์มอยู่แล้ว
// ถ้าฝั่งนี้ไปบวกเข้าช่องเองด้วย พอกดบันทึกจะโดนบวกซ้ำสองชั้น (ค่าที่ฟอร์มส่งไปแล้ว + เซิร์ฟเวอร์บวกซ้ำอีกที) ทำให้ AC/HP เพี้ยนเป็นสองเท่า
function dndPreviewPassiveAcHpChange() {
  const raceKey = document.getElementById('dndEditRace').value;
  const passiveKey = document.getElementById('dndEditPassive').value;
  const passive = dndPassiveByKey(raceKey, passiveKey);
  const newEff = (passive && passive.effect) || { ac: 0, hp: 0, resist: 0 };
  const acDelta = (newEff.ac || 0) - (dndDmEditPassiveBaseline.ac || 0);
  const hpDelta = (newEff.hp || 0) - (dndDmEditPassiveBaseline.hp || 0);
  const resistDelta = (newEff.resist || 0) - (dndDmEditPassiveBaseline.resist || 0);
  const hint = document.getElementById('dndEditPassiveHint');
  const parts = [];
  if (acDelta) parts.push(`AC ${acDelta > 0 ? '+' : ''}${acDelta}`);
  if (hpDelta) parts.push(`HP สูงสุด ${hpDelta > 0 ? '+' : ''}${hpDelta}`);
  if (resistDelta) parts.push(`ต้านทานสถานะ ${resistDelta > 0 ? '+' : ''}${resistDelta}%`);
  hint.textContent = parts.length ? `⚙️ บันทึกแล้วจะได้ ${parts.join(', ')} (อิงสกิลติดตัวที่เลือก)` : '';
}
// คะแนน point-buy ดิบ (ไม่รวมโบนัสเผ่า/คลาส) ของตัวละครที่กำลังแก้ไขอยู่ — ใช้คิดสเตตัสใหม่ทันทีที่ DM เปลี่ยนเผ่า/คลาสในฟอร์ม ก่อนกดบันทึกจริง
let dndDmEditPointBuy = null;
// เมื่อ DM เปลี่ยนเผ่าพันธุ์หรือคลาสในฟอร์มแก้ไข — คิดสเตตัสหลักใหม่ทันที (point-buy ดิบ + โบนัสเผ่า/คลาสล่าสุด) ไม่ให้ค่าที่โชว์ค้างเป็นของเผ่า/คลาสเดิม
function dndRecomputeEditStatsFromRaceClass() {
  if (!dndDmEditPointBuy) return; // ตัวละครเก่าที่ไม่มีข้อมูล point-buy เก็บไว้ (สร้างก่อนระบบนี้) — ให้ DM แก้ตัวเลขสเตตัสเองตรงๆ แทน
  const race = dndRaceByKey(document.getElementById('dndEditRace').value);
  const cls = dndClassByKey(document.getElementById('dndEditClass').value);
  const fieldIds = { str: 'dndEditStr', dex: 'dndEditDex', con: 'dndEditCon', int: 'dndEditInt', wis: 'dndEditWis', cha: 'dndEditCha' };
  Object.keys(fieldIds).forEach(k => {
    const rb = (race && race.bonus && race.bonus[k]) || 0;
    const cb = (cls && cls.bonus && cls.bonus[k]) || 0;
    let base = Math.round(Number(dndDmEditPointBuy[k]));
    if (!Number.isFinite(base) || base < dndPointBuyMin) base = dndPointBuyMin;
    document.getElementById(fieldIds[k]).value = base + rb + cb;
  });
  dndUpdateEditStatMods();
}
function dndUpdateEditStatMods() {
  document.getElementById('dndEditStrMod').textContent = `(${dndAbilityModText(document.getElementById('dndEditStr').value)})`;
  document.getElementById('dndEditDexMod').textContent = `(${dndAbilityModText(document.getElementById('dndEditDex').value)})`;
  document.getElementById('dndEditConMod').textContent = `(${dndAbilityModText(document.getElementById('dndEditCon').value)})`;
  document.getElementById('dndEditIntMod').textContent = `(${dndAbilityModText(document.getElementById('dndEditInt').value)})`;
  document.getElementById('dndEditWisMod').textContent = `(${dndAbilityModText(document.getElementById('dndEditWis').value)})`;
  document.getElementById('dndEditChaMod').textContent = `(${dndAbilityModText(document.getElementById('dndEditCha').value)})`;
  const hint = document.getElementById('dndEditConHpHint');
  const newConMod = Math.floor(((Number(document.getElementById('dndEditCon').value) || 10) - 10) / 2);
  const oldConMod = Math.floor(((dndDmEditBaseline.con || 10) - 10) / 2);
  const delta = newConMod - oldConMod;
  if (delta !== 0) {
    const level = Math.max(1, Number(document.getElementById('dndEditLevel').value) || 1);
    const hpDelta = delta * level;
    hint.textContent = `⚙️ ตัวปรับ CON เปลี่ยน → บันทึกแล้ว HP สูงสุดจะ${hpDelta > 0 ? '+' : ''}${hpDelta} (อิงกลไกเกม)`;
  } else {
    hint.textContent = '';
  }
}
let dndEditStatModListenersBound = false;
function bindEditStatModListenersOnce() {
  if (dndEditStatModListenersBound) return;
  dndEditStatModListenersBound = true;
  ['dndEditStr', 'dndEditDex', 'dndEditCon', 'dndEditInt', 'dndEditWis', 'dndEditCha'].forEach(id => {
    document.getElementById(id).addEventListener('input', dndUpdateEditStatMods);
  });
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
  dndDmEditPointBuy = (c.pointBuy && typeof c.pointBuy === 'object') ? c.pointBuy : null;
  // จำโบนัส AC/HP ของสกิลติดตัว "ตอนเปิดฟอร์ม" ไว้ — ใช้เทียบตอนเปลี่ยนตัวเลือกพาสซีพในฟอร์ม เพื่อพรีวิวค่า AC/HP ใหม่ให้ตรงกับที่เซิร์ฟเวอร์จะคำนวณจริงตอนบันทึก
  const basePassive = dndPassiveByKey(c.raceKey, c.passiveKey);
  dndDmEditPassiveBaseline = (basePassive && basePassive.effect) || { ac: 0, hp: 0, resist: 0 };
  document.getElementById('dndEditPassiveHint').textContent = '';
  document.getElementById('dndEditRace').onchange = (ev) => { fillPassiveSelectOptions(ev.target.value, null); dndRecomputeEditStatsFromRaceClass(); dndPreviewPassiveAcHpChange(); };
  document.getElementById('dndEditClass').onchange = () => dndRecomputeEditStatsFromRaceClass();
  document.getElementById('dndEditPassive').onchange = () => dndPreviewPassiveAcHpChange();
  document.getElementById('dndEditLevel').value = dndLevelFromExpClient(c.exp || 0);
  document.getElementById('dndEditLevelHint').textContent = `Lv.${dndLevelFromExpClient(c.exp || 0)} · ${dndExpProgressText(c.exp || 0)}`;
  document.getElementById('dndEditAc').value = c.ac;
  document.getElementById('dndEditHp').value = c.hp;
  document.getElementById('dndEditMaxHp').value = c.maxHp;
  document.getElementById('dndEditSp').value = c.sp != null ? c.sp : 0;
  document.getElementById('dndEditMaxSp').value = c.maxSp != null ? c.maxSp : 0;
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
  document.getElementById('dndEditStatusResist').value = c.statusResist || 0;
  renderEquipGrid('dndEditEquipGrid', c.equipment);
  applyNormalAttackToEditForm(c.normalAttack);
  document.getElementById('dndEditLocked').checked = !!c.locked;
  {
    const tok = dndTokens.find(tt => tt.kind === 'pc' && tt.ownerId === targetId);
    document.getElementById('dndEditVisionType').value = (tok && tok.visionType) || 'normal';
    document.getElementById('dndEditVisionRadius').value = (tok && tok.visionRadiusOverride != null) ? tok.visionRadiusOverride : '';
  }
  renderDndStatusChips('dndEditStatusList', c.statuses || [], 'player', targetId);
  renderDmEditSkills(p);
  dndDmEditBaseline = { con: Number(c.con) || 10, maxHp: Number(c.maxHp) || 20, hp: Number(c.hp) || 20 };
  bindEditStatModListenersOnce();
  dndUpdateEditStatMods();
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
    `<span class="dndSkillChip dndEditableSkillChip"${s.color ? ` style="border-color:${s.color}; color:${s.color};"` : ''} data-skill-id="${s.id}" title="คลิกเพื่อแก้ไขสกิลนี้">${escapeHtml(s.icon || '✨')} ${escapeHtml(s.name)} ✏️</span>`
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
  document.getElementById('dndClassSkillEditGuaranteedHit').checked = !!skill.guaranteedHit;
  document.getElementById('dndClassSkillEditDesc').value = skill.desc || '';
  document.getElementById('dndClassSkillEditDmgDie').value = String(skill.dmgDie || 0);
  document.getElementById('dndClassSkillEditDmgCount').value = skill.dmgCount || 1;
  document.getElementById('dndClassSkillEditDmgMod').value = skill.dmgMod || 0;
  document.getElementById('dndClassSkillEditHealDie').value = String(skill.healDie || 0);
  document.getElementById('dndClassSkillEditHealCount').value = skill.healCount || 1;
  document.getElementById('dndClassSkillEditHealMod').value = skill.healMod || 0;
  document.getElementById('dndClassSkillEditHealRevive').value = skill.healRevive ? '1' : '0';
  document.getElementById('dndClassSkillEditStatusName').value = skill.statusName || '';
  document.getElementById('dndClassSkillEditStatusNote').value = skill.statusNote || '';
  document.getElementById('dndClassSkillEditStatusIcon').value = skill.statusIcon || '';
  document.getElementById('dndClassSkillEditStatusColor').value = skill.statusColor || '#ff6b6b';
  document.getElementById('dndClassSkillEditBuffAlly').checked = !!skill.buffAlly;
  document.getElementById('dndClassSkillEditTargetMode').value = dndSkillTargetModeOf(skill);
  document.getElementById('dndClassSkillEditStatusChance').value = skill.statusChance || 100;
  document.getElementById('dndClassSkillEditStatusDuration').value = skill.statusDurationSec || 0;
  document.getElementById('dndClassSkillEditStatusAtkMod').value = skill.statusAtkMod || 0;
  document.getElementById('dndClassSkillEditStatusDmgMod').value = skill.statusDmgMod || 0;
  document.getElementById('dndClassSkillEditStatusDefMod').value = skill.statusDefMod || 0;
  document.getElementById('dndClassSkillEditStatusVisionMod').value = skill.statusVisionMod || 0;
  document.getElementById('dndClassSkillEditStatusTick').value = skill.statusTickValue || 0;
  document.getElementById('dndClassSkillEditStatusTickInterval').value = skill.statusTickIntervalSec || 6;
  document.getElementById('dndClassSkillEditAoeRadius').value = skill.aoeRadius || 0;
  document.getElementById('dndClassSkillEditAoeShape').value = skill.aoeShape === 'line' ? 'line' : 'circle';
  document.getElementById('dndClassSkillEditRange').value = skill.range || 0;
  document.getElementById('dndClassSkillEditCleanseEnabled').checked = !!skill.cleanseEnabled;
  document.getElementById('dndClassSkillEditCleanseName').value = skill.cleanseName || '';
  document.getElementById('dndClassSkillEditCooldown').value = skill.cooldownSec || 0;
  document.getElementById('dndClassSkillEditMaxUses').value = skill.maxUses || 0;
  document.getElementById('dndClassSkillEditSpCost').value = skill.spCost || 0;
  document.getElementById('dndClassSkillEditReqItemName').value = skill.reqItemName || '';
  document.getElementById('dndClassSkillEditReqItemQty').value = skill.reqItemQty || 1;
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
      guaranteedHit: document.getElementById('dndClassSkillEditGuaranteedHit').checked,
      damage: {
        die: document.getElementById('dndClassSkillEditDmgDie').value,
        count: document.getElementById('dndClassSkillEditDmgCount').value,
        mod: document.getElementById('dndClassSkillEditDmgMod').value,
      },
      heal: {
        die: document.getElementById('dndClassSkillEditHealDie').value,
        count: document.getElementById('dndClassSkillEditHealCount').value,
        mod: document.getElementById('dndClassSkillEditHealMod').value,
        revive: document.getElementById('dndClassSkillEditHealRevive').value === '1',
      },
      status: {
        name: document.getElementById('dndClassSkillEditStatusName').value,
        note: document.getElementById('dndClassSkillEditStatusNote').value,
        chance: document.getElementById('dndClassSkillEditStatusChance').value,
        durationSec: document.getElementById('dndClassSkillEditStatusDuration').value,
        atkMod: document.getElementById('dndClassSkillEditStatusAtkMod').value,
        dmgMod: document.getElementById('dndClassSkillEditStatusDmgMod').value,
        defMod: document.getElementById('dndClassSkillEditStatusDefMod').value,
        visionMod: document.getElementById('dndClassSkillEditStatusVisionMod').value,
        tickValue: document.getElementById('dndClassSkillEditStatusTick').value,
        tickIntervalSec: document.getElementById('dndClassSkillEditStatusTickInterval').value,
        icon: document.getElementById('dndClassSkillEditStatusIcon').value,
        color: document.getElementById('dndClassSkillEditStatusColor').value,
      },
      buffAlly: document.getElementById('dndClassSkillEditBuffAlly').checked,
      targetMode: document.getElementById('dndClassSkillEditTargetMode').value,
      aoe: {
        radius: document.getElementById('dndClassSkillEditAoeRadius').value,
        shape: document.getElementById('dndClassSkillEditAoeShape').value,
      },
      range: document.getElementById('dndClassSkillEditRange').value,
      cleanse: {
        enabled: document.getElementById('dndClassSkillEditCleanseEnabled').checked,
        name: document.getElementById('dndClassSkillEditCleanseName').value,
      },
      cooldownSec: document.getElementById('dndClassSkillEditCooldown').value,
      maxUses: document.getElementById('dndClassSkillEditMaxUses').value,
      spCost: document.getElementById('dndClassSkillEditSpCost').value,
      reqItem: {
        name: document.getElementById('dndClassSkillEditReqItemName').value,
        qty: document.getElementById('dndClassSkillEditReqItemQty').value,
      },
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
      const visionInput = prompt('ปรับระยะวิสัยทัศน์ ± (0 = ไม่ปรับ, ลบ = มองแคบลง)', String(cur.visionMod || 0));
      if (visionInput === null) return;
      const visionMod = Math.max(-80, Math.min(80, Math.round(Number(visionInput) || 0)));
      const tickInput = prompt('HP ต่อติ๊ก ± (ลบ=โดนดาเมจต่อเนื่อง, บวก=ฟื้น HP ต่อเนื่อง, 0=ไม่มี)', String(cur.tickValue || 0));
      if (tickInput === null) return;
      const tickValue = Math.max(-1000, Math.min(1000, Math.round(Number(tickInput) || 0)));
      let tickIntervalSec = cur.tickIntervalSec || 6;
      if (tickValue !== 0) {
        const tickIntervalInput = prompt('ติ๊กทุกกี่วินาที', String(tickIntervalSec || 6));
        if (tickIntervalInput === null) return;
        tickIntervalSec = Math.max(1, Math.min(3600, Math.round(Number(tickIntervalInput) || 0) || 6));
      }
      const iconInput = prompt('ไอคอน/อีโมจิของสถานะนี้ (ปล่อยว่าง = ☠️)', cur.icon || '☠️');
      if (iconInput === null) return;
      const icon = iconInput.trim().slice(0, 4);
      const colorInput = prompt('สีของสถานะนี้ (รหัสสี hex เช่น #ff6b6b, ปล่อยว่าง = สีเริ่มต้น)', cur.color || '');
      if (colorInput === null) return;
      const color = colorInput.trim();
      send({ type: 'dndStatusEdit', status: { targetType, targetId, statusId: cur.id, name: trimmedName, note, durationSec, atkMod, dmgMod, defMod, visionMod, tickValue, tickIntervalSec, icon, color } });
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
  const visionMod = Number(document.getElementById('dndEditStatusVision').value) || 0;
  const tickValue = Number(document.getElementById('dndEditStatusTick').value) || 0;
  const tickIntervalSec = Number(document.getElementById('dndEditStatusTickInterval').value) || 0;
  const icon = document.getElementById('dndEditStatusIcon').value;
  const color = document.getElementById('dndEditStatusColor').value;
  send({ type: 'dndStatusApply', status: { targetType: 'player', targetId: dndDmEditTargetId, name, note: document.getElementById('dndEditStatusNote').value, durationSec, atkMod, dmgMod, defMod, visionMod, tickValue, tickIntervalSec, icon, color } });
  document.getElementById('dndEditStatusName').value = '';
  document.getElementById('dndEditStatusNote').value = '';
  document.getElementById('dndEditStatusDuration').value = '';
  document.getElementById('dndEditStatusAtk').value = '';
  document.getElementById('dndEditStatusDmg').value = '';
  document.getElementById('dndEditStatusDef').value = '';
  document.getElementById('dndEditStatusVision').value = '';
  document.getElementById('dndEditStatusTick').value = '';
  document.getElementById('dndEditStatusTickInterval').value = '';
  document.getElementById('dndEditStatusIcon').value = '';
  document.getElementById('dndEditStatusColor').value = '#ff6b6b';
};
function closeDndModals() {
  document.getElementById('dndDmEditOverlay').style.display = 'none';
  document.getElementById('dndClassSkillEditOverlay').style.display = 'none';
  document.getElementById('dndSkillEditOverlay').style.display = 'none';
  document.getElementById('dndPassiveEditOverlay').style.display = 'none';
  document.getElementById('dndSummonTemplateEditOverlay').style.display = 'none';
  document.getElementById('dndTokenEditOverlay').style.display = 'none';
  document.getElementById('dndHowToOverlay').style.display = 'none';
  document.getElementById('dndPatchNotesOverlay').style.display = 'none';
  dndDmEditTargetId = null;
  dndClassSkillEditTarget = { playerId: null, skillId: null };
  dndSkillEditTargetId = null;
  dndPassiveEditTargetId = null;
  dndTplEditKey = null;
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
      sp: document.getElementById('dndEditSp').value,
      maxSp: document.getElementById('dndEditMaxSp').value,
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
      statusResist: document.getElementById('dndEditStatusResist').value,
      equipment: readEquipGrid('dndEditEquipGrid'),
      locked: document.getElementById('dndEditLocked').checked,
      normalAttack: {
        name: document.getElementById('dndEditNaName').value,
        stat: document.getElementById('dndEditNaStat').value,
        dmgDie: document.getElementById('dndEditNaDmgDie').value,
        dmgCount: document.getElementById('dndEditNaDmgCount').value,
        atkBonus: document.getElementById('dndEditNaAtkBonus').value,
        dmgBonus: document.getElementById('dndEditNaDmgBonus').value,
        range: document.getElementById('dndEditNaRange').value,
        reqItem: {
          name: document.getElementById('dndEditNaReqItemName').value,
          qty: document.getElementById('dndEditNaReqItemQty').value,
        },
      },
    },
  });
  {
    const tok = dndTokens.find(tt => tt.kind === 'pc' && tt.ownerId === dndDmEditTargetId);
    if (tok) {
      const radiusRaw = document.getElementById('dndEditVisionRadius').value;
      send({
        type: 'dndTokenEdit',
        id: tok.id,
        updates: {
          visionType: document.getElementById('dndEditVisionType').value,
          visionRadius: radiusRaw === '' ? null : Number(radiusRaw),
        },
      });
    }
  }
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
    const isPermaDead = isDead && !!(p.character && p.character.permaDead);
    const div = document.createElement('div');
    div.className = 'dndPCard' + (isMe ? ' me' : '') + (p.isDM ? ' dm' : '') + (isCurrentTurn ? ' myTurn' : '') + (isDead ? ' dead' : '') + (isPermaDead ? ' permaDead' : '');

    // DM ไม่มีการ์ดตัวละคร (ไม่ใช่ตัวละครในปาร์ตี้) — โชว์แค่ป้ายบทบาทสั้นๆ
    if (p.isDM) {
      div.innerHTML = `
        <div class="dndPCardTop">
          <span class="dndPCardName">${escapeHtml(p.character.charName || p.name)}${isMe ? ' (คุณ)' : ''}</span>
          <span class="dndPCardTag">DM</span>
        </div>
        <div class="dndPCardMeta">🎛️ DM — ควบคุมเกม${p.connected ? '' : ' · หลุดการเชื่อมต่อ'}</div>`;
      list.appendChild(div);
      return;
    }

    const c = p.character;
    const pct = c.maxHp > 0 ? Math.max(0, Math.min(100, Math.round(c.hp / c.maxHp * 100))) : 0;
    const spMax = Number(c.maxSp) || 0;
    const spCur = Number(c.sp) || 0;
    const spPct = spMax > 0 ? Math.max(0, Math.min(100, Math.round(spCur / spMax * 100))) : 0;
    const raceInfo = dndRaceByKey(c.raceKey);
    const clsInfo = dndClassByKey(c.classKey);
    const passiveInfo = c.locked ? dndPassiveByKey(c.raceKey, c.passiveKey) : null;
    const raceClsText = c.locked ? `${(raceInfo ? raceInfo.icon + ' ' : '')}${escapeHtml(c.race || '-')} · ${(clsInfo ? clsInfo.icon + ' ' : '')}${escapeHtml(c.cls || '-')}${passiveInfo ? ` · ${passiveInfo.icon || '✨'} ${escapeHtml(passiveInfo.name)}` : ''}` : 'ยังไม่ได้สร้างตัวละคร';
    const skillsHtml = (p.assignedSkills && p.assignedSkills.length)
      ? `<div class="dndPCardSkills">${p.assignedSkills.map(s => `<span class="dndSkillChip"${s.color ? ` style="border-color:${s.color}; color:${s.color};"` : ''}>${escapeHtml(s.icon || '✨')} ${escapeHtml(s.name)}</span>`).join('')}</div>` : '';
    const statusesHtml = (c.statuses && c.statuses.length)
      ? `<div class="dndPCardSkills">${c.statuses.map(s => dndStatusChipHtml(s)).join('')}</div>` : '';
    // DM เท่านั้นที่เห็นแถวสเตตัส (STR/DEX/CON/INT/WIS/CHA) ตรงบนการ์ดเลย ไม่ต้องกด "แก้ไข" เข้าไปดูทีละคน
    const dmStatsHtml = (dndYou && dndYou.isDM && c.locked)
      ? `<div class="dndPCardStats">${Object.keys(DND_STAT_LABELS).map(k => `<span class="dndPCardStatChip dndStatTip" ${dndStatTipHtml(k)}>${DND_STAT_LABELS[k]} ${c[k]} <span class="dndStatModBadge">(${dndAbilityModText(c[k])})</span></span>`).join('')}</div>`
      : '';
    div.innerHTML = `
      <div class="dndPCardBody">
        <div class="dndAvatarMini">${dndBuildAvatarSVG(c, 44, 58)}</div>
        <div class="dndPCardBodyMain">
          <div class="dndPCardTop">
            <span class="dndPCardName">${escapeHtml(c.charName || p.name)}${isMe ? ' (คุณ)' : ''}</span>
            ${isCurrentTurn ? '<span class="dndMyTurnBadge">🎯 ตานี้</span>' : ''}
            ${isPermaDead ? '<span class="dndDeadBadge dndPermaDeadBadge">☠️ ตายถาวร</span>' : (isDead ? '<span class="dndDeadBadge">💀 หมดสติ</span>' : '')}
          </div>
          <div class="dndPCardMeta">${raceClsText} · Lv.${c.level} · ${dndExpProgressText(c.exp || 0)} · AC ${c.ac} · <span class="dndTotalDefBadge">ป้องกัน ${dndTotalDefenseClient(c.equipment || {})}</span>${p.connected ? '' : ' · หลุดการเชื่อมต่อ'}</div>
          ${dmStatsHtml}
          <div class="dndHpRow">
            <div class="dndHpBarWrap"><div class="dndHpBar${pct <= 25 ? ' low' : ''}" style="width:${pct}%;"></div></div>
            <div class="dndHpText">${c.hp}/${c.maxHp} HP</div>
          </div>
          <div class="dndSpRow">
            <div class="dndSpBarWrap"><div class="dndSpBar" style="width:${spPct}%;"></div></div>
            <div class="dndSpText">${spCur}/${spMax} SP</div>
          </div>
          ${skillsHtml}
          ${statusesHtml}
          ${isPermaDead ? `<div class="dndDeadNotice dndPermaDeadNotice">☠️ ตายถาวร (โดนโอเวอร์คิลเกิน 2 เท่าของเลือดสูงสุด) — ไอเทม/สกิลชุบใช้ปลุกไม่ได้ ต้องรอ DM เพิ่ม HP ให้เท่านั้น</div>` : (isDead ? `<div class="dndDeadNotice">💀 หมดสติอยู่ — ทำอะไรไม่ได้จนกว่าจะมีคนใช้ไอเทมชุบให้ หรือ DM เพิ่ม HP ให้</div>` : '')}
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
      `<span class="dndSkillChip${s.locked ? ' dndSkillChipLocked' : ''} dndEditableSkillChip" data-class-skill-id="${s.id}" title="${escapeHtml(s.desc || '')}\nคลิกเพื่อแก้ไขสกิลนี้ (เฉพาะผู้เล่นคนนี้คนเดียว)">🎓 ${escapeHtml(s.name)}${s.locked ? ` (ปลดล็อก Lv.${s.level})` : ''}${s.overridden ? ' ✏️' : ''}</span>`
    ).join('');
    const customChips = (p.assignedSkills || []).map(s =>
      `<span class="dndSkillChip dndEditableSkillChip" data-skill-id="${s.id}" title="${escapeHtml(s.desc || '')}\nคลิกเพื่อแก้ไขสกิลนี้">✨ ${escapeHtml(s.name)} ✏️</span>`
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
    // สกิลแต่ละอันคลิกแล้วไปหน้าต่างแก้ไขสกิลนั้นตรงๆ ทันที ไม่ต้องเปิดหน้าต่างแก้ตัวละครทั้งใบก่อน
    // ต้องกัน event ไม่ให้ลอยขึ้นไปโดน onclick ของทั้งแถวด้านบน (ซึ่งเปิดหน้าต่างแก้ตัวละครแทน)
    row.querySelectorAll('[data-skill-id]').forEach(chip => {
      chip.onclick = (ev) => { ev.stopPropagation(); openDndSkillEdit(Number(chip.dataset.skillId)); };
    });
    row.querySelectorAll('[data-class-skill-id]').forEach(chip => {
      chip.onclick = (ev) => { ev.stopPropagation(); openDndClassSkillEdit(Number(row.dataset.pid), Number(chip.dataset.classSkillId)); };
    });
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
  dndRacePassiveOverrides = state.racePassiveOverrides || dndRacePassiveOverrides;
  dndSkills = state.skills || dndSkills;
  dndLibrarySkillCatalog = state.librarySkillCatalog || dndLibrarySkillCatalog;
  if (state.summonTemplates) {
    dndSummonTemplates = state.summonTemplates;
    dndSummonTemplateOverrides = state.summonTemplateOverrides || dndSummonTemplateOverrides;
    fillSummonTemplateSelect('dndSkillSummonTemplateKey');
    fillSummonTemplateSelect('dndSkillEditSummonTemplateKey');
  }
  dndPointBuyMin = state.pointBuyMin || dndPointBuyMin;
  dndPointBuyBudget = state.pointBuyBudget || dndPointBuyBudget;
  dndPointBuyCost = state.pointBuyCost || dndPointBuyCost;
  dndPointBuyCostMaxDefined = state.pointBuyCostMaxDefined || dndPointBuyCostMaxDefined;
  dndPointBuyCostPerStepAboveMax = state.pointBuyCostPerStepAboveMax || dndPointBuyCostPerStepAboveMax;
  dndStatPointsPerLevel = state.statPointsPerLevel || dndStatPointsPerLevel;
  dndEquipSlots = state.equipSlots || dndEquipSlots;
  dndEquipSlotLabels = state.equipSlotLabels || dndEquipSlotLabels;
  dndBagCapacity = state.bagCapacity || dndBagCapacity;
  dndTokens = state.tokens || dndTokens;
  dndWalls = state.walls || [];
  dndVisionEnabled = !!state.visionEnabled;
  dndVisionTypeLabels = state.visionTypeLabels || dndVisionTypeLabels;
  dndVisionDefaults = state.visionDefaults || dndVisionDefaults;
  dndPartyVisionShared = !!state.partyVisionShared;
  dndPartyVisionGroups = Array.isArray(state.partyVisionGroups) ? state.partyVisionGroups : [];
  dndShops = state.shops || dndShops;
  dndForgeFailPolicyLabels = state.forgeFailPolicyLabels || dndForgeFailPolicyLabels;
  dndItemEffects = state.itemEffects || [];
  dndTrades = state.trades || [];
  dndMapBackground = state.mapBackground || null;
  dndMapGridSize = Number.isFinite(Number(state.mapGridSize)) ? Number(state.mapGridSize) : 10;
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
  renderDndSummonTemplateManageList();
  document.getElementById('dndMapMyTokenBox').style.display = (!isDM && dndYou && dndYou.locked) ? 'block' : 'none';
  document.getElementById('dndMapNpcAddBox').style.display = isDM ? 'block' : 'none';
  document.getElementById('dndVisionDmRow').style.display = isDM ? 'block' : 'none';
  document.getElementById('dndWallDmRow').style.display = isDM ? 'flex' : 'none';
  const visionToggleEl = document.getElementById('dndVisionEnabledToggle');
  if (visionToggleEl && document.activeElement !== visionToggleEl) visionToggleEl.checked = dndVisionEnabled;
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
    const isLibrary = shop.type === 'library';
    const bodyHtml = isForge ? dndRenderForgeShopBody(shop, isDM, myGold, myEquipment)
      : (isLibrary ? dndRenderLibraryShopBody(shop, isDM, myGold) : dndRenderItemShopBody(shop, isDM, myGold));
    const shopIcon = isForge ? '⚒️' : (isLibrary ? '📚' : '🛍️');
    return `
    <div class="dndShopCard" data-shop="${shop.id}">
      <div class="dndShopCardHead">
        <h4>${shopIcon} ${escapeHtml(shop.name)}${(isDM && shop.closed) ? ' <span class="dndPCardTag">ปิดอยู่</span>' : ''}</h4>
        ${isDM ? `
          <button type="button" class="dndShopDelBtn" data-shopclose="${shop.id}">${shop.closed ? 'เปิดร้าน' : 'ปิดร้านชั่วคราว'}</button>
          <button type="button" class="dndShopDelBtn dndKickBtn" data-shopdel="${shop.id}">ลบร้านถาวร</button>
        ` : ''}
      </div>
      ${bodyHtml}
    </div>
  `;
  }).join('');

  box.querySelectorAll('button[data-shopclose]').forEach(btn => {
    btn.onclick = () => send({ type: 'dndShopToggleClosed', shopId: Number(btn.dataset.shopclose) });
  });
  box.querySelectorAll('button[data-shopdel]').forEach(btn => {
    btn.onclick = () => { if (confirm('ลบร้านนี้ถาวรเลยไหม? ไอเทมทั้งหมดในร้านจะหายไปด้วย กู้คืนไม่ได้ (ถ้าแค่อยากปิดร้านชั่วคราว ให้ใช้ปุ่ม "ปิดร้านชั่วคราว" แทน)')) send({ type: 'dndShopDelete', shopId: Number(btn.dataset.shopdel) }); };
  });
  dndWireShopInteractions(box);
  // ---- ค้นหา + ย่อ/ขยายกลุ่ม (เฉพาะร้านห้องสมุด/ร้านไอเทมทั่วไปที่มีของเยอะ) ----
  box.querySelectorAll('input[data-libsearch]').forEach(inp => {
    inp.oninput = () => {
      const shopId = Number(inp.dataset.libsearch);
      dndGetShopUIState(shopId).search = inp.value;
      dndRefreshLibraryShopItems(shopId);
    };
  });
  box.querySelectorAll('button[data-libexpandall]').forEach(btn => {
    btn.onclick = () => {
      const shopId = Number(btn.dataset.libexpandall);
      const shop = dndShops.find(s => s.id === shopId);
      if (!shop) return;
      const levels = new Set();
      shop.items.forEach(it => { const l = dndSkillLevelById(it.skillId); levels.add(l === null ? 'other' : l); });
      dndGetShopUIState(shopId).openLevels = levels;
      dndRefreshLibraryShopItems(shopId);
    };
  });
  box.querySelectorAll('button[data-libcollapseall]').forEach(btn => {
    btn.onclick = () => {
      const shopId = Number(btn.dataset.libcollapseall);
      dndGetShopUIState(shopId).openLevels = new Set();
      dndRefreshLibraryShopItems(shopId);
    };
  });
  dndWireLibraryDetailsToggles(box);
  box.querySelectorAll('input[data-itemsearch]').forEach(inp => {
    inp.oninput = () => {
      const shopId = Number(inp.dataset.itemsearch);
      dndGetShopUIState(shopId).search = inp.value;
      dndRefreshItemShopItems(shopId);
    };
  });
  box.querySelectorAll('button[data-additem]').forEach(btn => {
    btn.onclick = (ev) => {
      const shopId = Number(btn.dataset.additem);
      const name = box.querySelector(`input[data-newname="${shopId}"]`).value.trim();
      if (!name) return;
      const shop = dndShops.find(s => s.id === shopId);
      const isLibraryShop = shop && shop.type === 'library';
      const skillSelect = isLibraryShop ? box.querySelector(`select[data-newskill="${shopId}"]`) : null;
      if (isLibraryShop && (!skillSelect || !skillSelect.value)) { alert('กรุณาเลือกสกิลที่จะผูกกับสมุดเวทย์เล่มนี้ก่อน (ต้องมีสกิลในแท็บสกิลก่อน)'); return; }
      flashBtn(ev.currentTarget);
      send({
        type: 'dndShopItemAdd',
        shopId,
        item: {
          name,
          price: box.querySelector(`input[data-newprice="${shopId}"]`).value,
          stock: box.querySelector(`input[data-newstock="${shopId}"]`).value,
          desc: box.querySelector(`input[data-newdesc="${shopId}"]`).value,
          ...(skillSelect ? { skillId: skillSelect.value } : {}),
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
// ---- ฟังก์ชันกลาง: ผูก event ปุ่มซื้อ/ขาย/แก้ไข/ลบไอเทมในร้าน — ใช้ได้ทั้งตอน render ทั้งกล่อง และตอน refresh แค่บางส่วน (หลังค้นหา/ย่อ-ขยายกลุ่ม) ----
function dndWireShopInteractions(scopeEl) {
  scopeEl.querySelectorAll('button[data-itemdel]').forEach(btn => {
    btn.onclick = () => {
      const [shopId, itemId] = btn.dataset.itemdel.split(':').map(Number);
      send({ type: 'dndShopItemDelete', shopId, itemId });
    };
  });
  scopeEl.querySelectorAll('button[data-itemeditopen]').forEach(btn => {
    btn.onclick = () => { dndShopEditKey = btn.dataset.itemeditopen; renderDndShops(); };
  });
  scopeEl.querySelectorAll('button[data-itemeditcancel]').forEach(btn => {
    btn.onclick = () => { dndShopEditKey = null; renderDndShops(); };
  });
  scopeEl.querySelectorAll('button[data-itemeditsave]').forEach(btn => {
    btn.onclick = (ev) => {
      const key = btn.dataset.itemeditsave;
      const [shopId, itemId] = key.split(':').map(Number);
      const name = document.querySelector(`input[data-editname="${key}"]`).value.trim();
      if (!name) return;
      const shop = dndShops.find(s => s.id === shopId);
      const isLibraryShop = shop && shop.type === 'library';
      const skillSelect = isLibraryShop ? document.querySelector(`select[data-editskill="${key}"]`) : null;
      flashBtn(ev.currentTarget);
      send({
        type: 'dndShopItemEdit',
        shopId, itemId,
        item: {
          name,
          price: document.querySelector(`input[data-editprice="${key}"]`).value,
          stock: document.querySelector(`input[data-editstock="${key}"]`).value,
          desc: document.querySelector(`input[data-editdesc="${key}"]`).value,
          ...(skillSelect ? { skillId: skillSelect.value } : {}),
        },
      });
      dndShopEditKey = null;
    };
  });
  scopeEl.querySelectorAll('button[data-buy]').forEach(btn => {
    btn.onclick = (ev) => {
      flashBtn(ev.currentTarget);
      const [shopId, itemId] = btn.dataset.buy.split(':').map(Number);
      send({ type: 'dndShopBuy', shopId, itemId });
    };
  });
  scopeEl.querySelectorAll('button[data-sell]').forEach(btn => {
    btn.onclick = (ev) => {
      flashBtn(ev.currentTarget);
      const [shopId, itemId] = btn.dataset.sell.split(':').map(Number);
      send({ type: 'dndShopSell', shopId, itemId });
    };
  });
}
// จำว่ากลุ่มเลเวลไหนถูกเปิด/ปิดอยู่ ผูกกับ <details> ของแต่ละกลุ่มในร้านห้องสมุด — เก็บไว้ใน dndShopUIState เพื่อให้จำสถานะข้ามการ render ใหม่ได้
function dndWireLibraryDetailsToggles(scopeEl) {
  scopeEl.querySelectorAll('details.dndLibraryGroup').forEach(det => {
    det.addEventListener('toggle', () => {
      const shopId = Number(det.dataset.shop);
      const key = det.dataset.level === 'other' ? 'other' : Number(det.dataset.level);
      const ui = dndGetShopUIState(shopId);
      if (det.open) ui.openLevels.add(key); else ui.openLevels.delete(key);
    });
  });
}
// หาเลเวลเวทย์ของสกิลที่สมุดเล่มนี้ผูกอยู่ (สำหรับจัดกลุ่มในร้านห้องสมุด) — คืน null ถ้าหาไม่เจอ/ไม่มีเลเวล (เช่น DM สร้างสมุดเองแบบไม่ผูกเลเวล)
function dndSkillLevelById(id) {
  const s = dndAnySkillById(id);
  return (s && Number.isFinite(Number(s.level))) ? Number(s.level) : null;
}
function dndLibraryLevelLabel(key) {
  if (key === 'other') return 'อื่นๆ';
  return key === 0 ? '✨ แคนทริป' : `เลเวล ${key}`;
}
// สร้างแถวป้าย (badge) รายละเอียดสกิลที่ผูกกับสมุดเวทย์เล่มนี้ — โชว์ให้ผู้เล่นเห็นก่อนซื้อว่า: คลาสไหนใช้ได้, ระดับเวทย์, ดาเมจ/ฮีลเท่าไหร่,
// ใช้ SP กี่แต้ม, คูลดาวน์กี่วิ, ระยะโจมตี(ช่อง)เท่าไหร่ — ใช้ร่วมกันทั้งตอน render เต็มและตอน refresh บางส่วนของร้านห้องสมุด
function dndLibrarySkillDetailBadgesHtml(boundSkill) {
  if (!boundSkill) return '';
  const badges = [];
  const lvl = Number.isFinite(Number(boundSkill.level)) ? Number(boundSkill.level) : null;
  if (lvl !== null) badges.push(`<span class="dndLibraryDetailBadge">${lvl === 0 ? '✨ แคนทริป' : `📚 เวทย์เลเวล ${lvl}`}</span>`);
  if (boundSkill.allowedClasses && boundSkill.allowedClasses.length) {
    badges.push(`<span class="dndLibraryDetailBadge" style="color:#ffb86b;">🎓 เฉพาะคลาส: ${dndAllowedClassesTextClient(boundSkill.allowedClasses)}</span>`);
  } else {
    badges.push(`<span class="dndLibraryDetailBadge" style="color:#9aa4b2;">🎓 ทุกคลาสเรียนได้</span>`);
  }
  if (boundSkill.dmgDie) {
    const dmgMod = boundSkill.dmgMod ? (boundSkill.dmgMod > 0 ? ` +${boundSkill.dmgMod}` : ` ${boundSkill.dmgMod}`) : '';
    badges.push(`<span class="dndLibraryDetailBadge" style="color:#ff9d9d;">💥 ดาเมจ ${boundSkill.dmgCount}d${boundSkill.dmgDie}${dmgMod}</span>`);
  }
  if (boundSkill.healDie) {
    const healMod = boundSkill.healMod ? (boundSkill.healMod > 0 ? ` +${boundSkill.healMod}` : ` ${boundSkill.healMod}`) : '';
    badges.push(`<span class="dndLibraryDetailBadge" style="color:#7ee87e;">${boundSkill.healRevive ? '🌟 ชุบชีวิต' : '💚 ฟื้นฟู'} HP ${boundSkill.healCount}d${boundSkill.healDie}${healMod}</span>`);
  }
  badges.push(`<span class="dndLibraryDetailBadge" style="color:#8fd3ff;">🔵 ใช้ SP ${boundSkill.spCost || 0}</span>`);
  if (boundSkill.cooldownSec) badges.push(`<span class="dndLibraryDetailBadge" style="color:#9fd0ff;">⏱ คูลดาวน์ ${boundSkill.cooldownSec} วิ</span>`);
  if (boundSkill.range) badges.push(`<span class="dndLibraryDetailBadge" style="color:#8fd3ff;">📏 ระยะ ${boundSkill.range} ช่อง</span>`);
  if (boundSkill.aoeRadius) badges.push(`<span class="dndLibraryDetailBadge" style="color:#ffb86b;">💥 AOE${boundSkill.aoeShape === 'line' ? 'เส้นตรง' : 'รัศมี'} ${boundSkill.aoeRadius}</span>`);
  if (boundSkill.maxUses) badges.push(`<span class="dndLibraryDetailBadge" style="color:#d8a4ff;">🔁 ใช้ได้ ${boundSkill.maxUses} ครั้ง</span>`);
  return `<div class="dndLibrarySkillDetail">${badges.join('')}</div>`;
}
// สร้าง HTML แถวไอเทมของสมุดเวทย์ 1 เล่ม — แยกออกมาเพื่อให้ใช้ซ้ำได้ทั้งตอน render เต็มและตอน refresh บางส่วน
function dndLibraryItemRowHtml(shop, it, isDM, myGold) {
  const stockStr = it.stock === null ? 'ไม่จำกัด' : `เหลือ ${it.stock}`;
  const have = dndBagQty(it.name);
  const boundSkill = dndAnySkillById(it.skillId);
  const classOk = !boundSkill || dndSkillAllowedForMyClass(boundSkill);
  const skillDetailHtml = dndLibrarySkillDetailBadgesHtml(boundSkill);
  const canBuy = !isDM && classOk && (it.stock === null || it.stock > 0) && myGold >= it.price;
  const canSell = !isDM && have > 0;
  const editKey = `${shop.id}:${it.id}`;
  const skillName = dndSkillNameById(it.skillId);
  if (isDM && dndShopEditKey === editKey) {
    return `
    <div class="dndShopItemRow">
      <div class="dndShopAddItemRow">
        <input type="text" placeholder="ชื่อสมุดเวทย์" data-editname="${editKey}" maxlength="40" value="${escapeHtml(it.name)}">
        <input type="number" placeholder="ราคา" data-editprice="${editKey}" min="0" style="max-width:70px;" value="${it.price}">
        <input type="number" placeholder="สต็อก (ว่าง=ไม่จำกัด)" data-editstock="${editKey}" min="0" style="max-width:120px;" value="${it.stock === null ? '' : it.stock}">
        <input type="text" placeholder="คำอธิบาย (ไม่บังคับ)" data-editdesc="${editKey}" maxlength="150" value="${escapeHtml(it.desc || '')}">
        <select data-editskill="${editKey}">${dndSkillOptionsHtml(it.skillId)}</select>
        <button type="button" data-itemeditsave="${editKey}">💾 บันทึก</button>
        <button type="button" data-itemeditcancel="${editKey}">ยกเลิก</button>
      </div>
    </div>`;
  }
  return `
    <div class="dndShopItemRow">
      <div class="dndShopItemInfo">
        <div class="dndShopItemName">📖 ${escapeHtml(it.name)}</div>
        <div class="dndShopItemMeta">💰 ${it.price} · สต็อก ${stockStr}${have ? ` · คุณมี ${have}` : ''}</div>
        <div class="dndShopItemDesc">มอบสกิล: <b>${escapeHtml(skillName)}</b></div>
        ${skillDetailHtml}
        ${it.desc ? `<div class="dndShopItemDesc">${escapeHtml(it.desc)}</div>` : ''}
      </div>
      ${isDM
        ? `<button type="button" class="dndShopItemDelBtn" data-itemeditopen="${editKey}">✏️ แก้ไข</button>
           <button type="button" class="dndShopItemDelBtn" data-itemdel="${shop.id}:${it.id}">ลบ</button>`
        : `<button type="button" class="dndShopBuyBtn" data-buy="${shop.id}:${it.id}" ${canBuy ? '' : 'disabled'}${(!classOk) ? ` title="คลาสของคุณเรียนรู้สกิลนี้ไม่ได้"` : ''}>ซื้อ</button>
           <button type="button" class="dndShopSellBtn" data-sell="${shop.id}:${it.id}" ${canSell ? '' : 'disabled'}>ขาย (${Math.floor(it.price / 2)})</button>`}
    </div>`;
}
// กรองตามคำค้นหา (ชื่อสมุด/ชื่อสกิล/คำอธิบาย) แล้วจัดกลุ่มตามเลเวลเวทย์ — คืน HTML ของกลุ่มทั้งหมด (ยังไม่รวมกล่องค้นหา)
function dndLibraryGroupsHtml(shop, isDM, myGold) {
  const ui = dndGetShopUIState(shop.id);
  const searchLower = ui.search.trim().toLowerCase();
  const filtered = !searchLower ? shop.items : shop.items.filter(it => {
    const skillName = dndSkillNameById(it.skillId);
    return it.name.toLowerCase().includes(searchLower)
      || skillName.toLowerCase().includes(searchLower)
      || (it.desc || '').toLowerCase().includes(searchLower);
  });
  if (!filtered.length) {
    return `<div class="dndRangeHint">${searchLower ? `ไม่พบสมุดเวทย์ที่ตรงกับ "${escapeHtml(ui.search.trim())}"` : 'ห้องสมุดนี้ยังไม่มีสมุดเวทย์'}</div>`;
  }
  const groups = new Map();
  for (const it of filtered) {
    const lvl = dndSkillLevelById(it.skillId);
    const key = lvl === null ? 'other' : lvl;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  const sortedKeys = [...groups.keys()].sort((a, b) => {
    if (a === 'other') return 1;
    if (b === 'other') return -1;
    return a - b;
  });
  const searching = !!searchLower;
  return sortedKeys.map(key => {
    const items = groups.get(key);
    const isOpen = searching || ui.openLevels.has(key);
    const rowsHtml = items.map(it => dndLibraryItemRowHtml(shop, it, isDM, myGold)).join('');
    return `
    <details class="dndLibraryGroup" data-level="${key}" data-shop="${shop.id}" ${isOpen ? 'open' : ''}>
      <summary class="dndLibraryGroupSummary">${dndLibraryLevelLabel(key)} <span class="dndRangeHint">(${items.length} เล่ม)</span></summary>
      <div class="dndLibraryGroupBody">${rowsHtml}</div>
    </details>`;
  }).join('');
}
// เรียกตอนพิมพ์ค้นหา/กดปุ่มเปิด-ปิดกลุ่มทั้งหมดในร้านห้องสมุด — อัปเดตแค่รายการไอเทม ไม่แตะกล่องค้นหา กันโฟกัส/เคอร์เซอร์หลุดตอนพิมพ์
function dndRefreshLibraryShopItems(shopId) {
  const shop = dndShops.find(s => s.id === Number(shopId));
  if (!shop) return;
  const wrap = document.querySelector(`.dndLibraryItemsWrap[data-shopitems="${shopId}"]`);
  if (!wrap) return;
  const isDM = !!(dndYou && dndYou.isDM);
  const myGold = (() => { const me = myDndEntry(); return me ? (me.character.gold || 0) : 0; })();
  wrap.innerHTML = dndLibraryGroupsHtml(shop, isDM, myGold);
  dndWireShopInteractions(wrap);
  dndWireLibraryDetailsToggles(wrap);
}
// เรียกตอนพิมพ์ค้นหาในร้านไอเทมทั่วไป — เหมือนห้องสมุดแต่ไม่มีจัดกลุ่มเลเวล (ร้านไอเทมทั่วไปไม่มีข้อมูลเลเวล)
function dndRefreshItemShopItems(shopId) {
  const shop = dndShops.find(s => s.id === Number(shopId));
  if (!shop) return;
  const wrap = document.querySelector(`.dndItemShopItemsWrap[data-shopitems="${shopId}"]`);
  if (!wrap) return;
  const isDM = !!(dndYou && dndYou.isDM);
  const myGold = (() => { const me = myDndEntry(); return me ? (me.character.gold || 0) : 0; })();
  wrap.innerHTML = dndItemShopRowsHtml(shop, isDM, myGold);
  dndWireShopInteractions(wrap);
}
// ---- ร้านไอเทมทั่วไป: ซื้อ/ขายด้วยทอง (เดิม) ----
function dndItemShopRowsHtml(shop, isDM, myGold) {
  const ui = dndGetShopUIState(shop.id);
  const searchLower = ui.search.trim().toLowerCase();
  const filtered = !searchLower ? shop.items : shop.items.filter(it =>
    it.name.toLowerCase().includes(searchLower) || (it.desc || '').toLowerCase().includes(searchLower));
  if (!filtered.length) {
    return `<div class="dndRangeHint">${searchLower ? `ไม่พบไอเทมที่ตรงกับ "${escapeHtml(ui.search.trim())}"` : 'ร้านนี้ยังไม่มีไอเทม'}</div>`;
  }
  return filtered.map(it => {
    const stockStr = it.stock === null ? 'ไม่จำกัด' : `เหลือ ${it.stock}`;
    const have = dndBagQty(it.name);
    const canBuy = !isDM && (it.stock === null || it.stock > 0) && myGold >= it.price;
    const canSell = !isDM && have > 0;
    const editKey = `${shop.id}:${it.id}`;
    if (isDM && dndShopEditKey === editKey) {
      return `
    <div class="dndShopItemRow">
      <div class="dndShopAddItemRow">
        <input type="text" placeholder="ชื่อไอเทม" data-editname="${editKey}" maxlength="40" value="${escapeHtml(it.name)}">
        <input type="number" placeholder="ราคา" data-editprice="${editKey}" min="0" style="max-width:70px;" value="${it.price}">
        <input type="number" placeholder="สต็อก (ว่าง=ไม่จำกัด)" data-editstock="${editKey}" min="0" style="max-width:120px;" value="${it.stock === null ? '' : it.stock}">
        <input type="text" placeholder="คำอธิบาย (ไม่บังคับ)" data-editdesc="${editKey}" maxlength="150" value="${escapeHtml(it.desc || '')}">
        <button type="button" data-itemeditsave="${editKey}">💾 บันทึก</button>
        <button type="button" data-itemeditcancel="${editKey}">ยกเลิก</button>
      </div>
    </div>`;
    }
    return `
    <div class="dndShopItemRow">
      <div class="dndShopItemInfo">
        <div class="dndShopItemName">${escapeHtml(it.name)}</div>
        <div class="dndShopItemMeta">💰 ${it.price} · สต็อก ${stockStr}${have ? ` · คุณมี ${have}` : ''}</div>
        ${it.desc ? `<div class="dndShopItemDesc">${escapeHtml(it.desc)}</div>` : ''}
      </div>
      ${isDM
        ? `<button type="button" class="dndShopItemDelBtn" data-itemeditopen="${editKey}">✏️ แก้ไข</button>
           <button type="button" class="dndShopItemDelBtn" data-itemdel="${shop.id}:${it.id}">ลบ</button>`
        : `<button type="button" class="dndShopBuyBtn" data-buy="${shop.id}:${it.id}" ${canBuy ? '' : 'disabled'}>ซื้อ</button>
           <button type="button" class="dndShopSellBtn" data-sell="${shop.id}:${it.id}" ${canSell ? '' : 'disabled'}>ขาย (${Math.floor(it.price / 2)})</button>`}
    </div>`;
  }).join('');
}
function dndRenderItemShopBody(shop, isDM, myGold) {
  const ui = dndGetShopUIState(shop.id);
  // กล่องค้นหาโชว์เฉพาะร้านที่มีของตั้งแต่ 8 ชิ้นขึ้นไป — ร้านเล็กๆ ไม่จำเป็นต้องมีก็ไม่รก
  const searchRowHtml = shop.items.length >= 8 ? `
      <div class="dndShopSearchRow">
        <input type="text" class="dndShopSearchInput" placeholder="🔍 ค้นหาไอเทม..." data-itemsearch="${shop.id}" value="${escapeHtml(ui.search)}">
      </div>` : '';
  const itemsHtml = `<div class="dndItemShopItemsWrap" data-shopitems="${shop.id}">${dndItemShopRowsHtml(shop, isDM, myGold)}</div>`;
  const addFormHtml = isDM ? `
      <div class="dndShopAddItemRow">
        <input type="text" placeholder="ชื่อไอเทม" data-newname="${shop.id}" maxlength="40">
        <input type="number" placeholder="ราคา" data-newprice="${shop.id}" min="0" style="max-width:70px;">
        <input type="number" placeholder="สต็อก (ว่าง=ไม่จำกัด)" data-newstock="${shop.id}" min="0" style="max-width:120px;">
        <input type="text" placeholder="คำอธิบาย (ไม่บังคับ)" data-newdesc="${shop.id}" maxlength="150">
        <button type="button" data-additem="${shop.id}">➕ เพิ่มไอเทม</button>
      </div>` : '';
  return searchRowHtml + itemsHtml + addFormHtml;
}
// ---- ร้านห้องสมุด: DM ขาย "สมุดเวทย์" ที่ผูกกับสกิล — ผู้เล่นซื้อมาเก็บกระเป๋าแล้วกดใช้ (อ่าน) เพื่อเรียนสกิลนั้นทันที ----
function dndSkillOptionsHtml(selectedId) {
  if (!dndSkills.length) return '<option value="">(ยังไม่มีสกิลให้เลือก — ไปสร้างในแท็บสกิลก่อน)</option>';
  return dndSkills.map(s => `<option value="${s.id}"${Number(selectedId) === s.id ? ' selected' : ''}>${escapeHtml(s.name)}</option>`).join('');
}
function dndSkillNameById(id) {
  const s = dndAnySkillById(id);
  return s ? s.name : '(สกิลถูกลบไปแล้ว)';
}
function dndRenderLibraryShopBody(shop, isDM, myGold) {
  const ui = dndGetShopUIState(shop.id);
  const searchRowHtml = `
      <div class="dndShopSearchRow">
        <input type="text" class="dndShopSearchInput" placeholder="🔍 ค้นหาชื่อเวทย์..." data-libsearch="${shop.id}" value="${escapeHtml(ui.search)}">
        <button type="button" class="dndShopSearchToggleBtn" data-libexpandall="${shop.id}">เปิดทั้งหมด</button>
        <button type="button" class="dndShopSearchToggleBtn" data-libcollapseall="${shop.id}">ปิดทั้งหมด</button>
      </div>`;
  const itemsHtml = `<div class="dndLibraryItemsWrap" data-shopitems="${shop.id}">${dndLibraryGroupsHtml(shop, isDM, myGold)}</div>`;
  const addFormHtml = isDM ? `
      <div class="dndShopAddItemRow">
        <input type="text" placeholder="ชื่อสมุดเวทย์" data-newname="${shop.id}" maxlength="40">
        <input type="number" placeholder="ราคา" data-newprice="${shop.id}" min="0" style="max-width:70px;">
        <input type="number" placeholder="สต็อก (ว่าง=ไม่จำกัด)" data-newstock="${shop.id}" min="0" style="max-width:120px;">
        <input type="text" placeholder="คำอธิบาย (ไม่บังคับ)" data-newdesc="${shop.id}" maxlength="150">
        <select data-newskill="${shop.id}">${dndSkillOptionsHtml(null)}</select>
        <button type="button" data-additem="${shop.id}">➕ เพิ่มสมุดเวทย์</button>
      </div>
      <div class="dndRangeHint" style="margin-top:4px;">อ่าน (กดปุ่ม "ใช้" ในกระเป๋า) แล้วเรียนรู้สกิลที่เลือกไว้ทันที — สมุดจะหายไป 1 เล่ม ถ้าอยากให้เรียนได้ครั้งเดียวจริง ๆ ไปติ๊ก "🔒 ล็อกไว้ก่อน" ตอนสร้างสกิลนั้นในแท็บสกิลด้วย</div>` : '';
  return searchRowHtml + itemsHtml + addFormHtml;
}
// ---- ร้านตีบวก: DM ตั้งค่าระดับตีบวก (tier) ทีละขั้น — ผู้เล่นเลือกอุปกรณ์ที่สวมใส่อยู่มาตีบวกทีละช่อง ----
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
  if (e.effectType === 'vision') return `👁️ วิสัยทัศน์ ${e.value > 0 ? '+' : ''}${e.value}${e.durationSec ? ` นาน ${e.durationSec}วิ` : ' (ถาวรจนกว่า DM จะถอน)'}`;
  if (e.effectType === 'skill') return `📖 มอบสกิล "${dndSkillNameById(e.value)}" (ผูกจากร้านห้องสมุด)`;
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
    const capEl = document.getElementById('dndBagCapacityVal');
    if (capEl) {
      capEl.textContent = `${bag.length}/${dndBagCapacity}`;
      capEl.classList.toggle('dndBagCapacityFull', bag.length >= dndBagCapacity);
    }
    const bagListEl = document.getElementById('dndMyBagList');
    const iAmDead = amIDead();
    bagListEl.innerHTML = bag.length
      ? bag.map(it => {
          const def = dndItemEffects.find(e => e.name === it.name);
          if (!def) return `<span class="dndBagChip">${escapeHtml(it.name)} x${it.qty}</span>`;
          let disabledAttr = iAmDead ? ' disabled' : '';
          let titleAttr = '';
          if (def.effectType === 'skill') {
            const skill = dndSkills.find(s => s.id === def.value);
            if (!iAmDead && skill && !dndSkillAllowedForMyClass(skill)) {
              disabledAttr = ' disabled';
              titleAttr = ` title="คลาสของคุณเรียนรู้สกิลนี้ไม่ได้ — ใช้ได้เฉพาะคลาส: ${escapeHtml(dndAllowedClassesTextClient(skill.allowedClasses))}"`;
            }
            const useBtnHtml = `<button type="button" class="dndBagUseBtn" data-usename="${escapeHtml(it.name)}" data-efftype="${escapeHtml(def.effectType || '')}"${disabledAttr}${titleAttr}>📖 อ่าน/เรียนรู้</button>`;
            return `
              <div class="dndBagSkillItemRow">
                <div class="dndBagSkillItemHead">
                  <span class="dndShopItemName">📖 ${escapeHtml(it.name)} x${it.qty}</span>
                  ${useBtnHtml}
                </div>
                ${dndLibrarySkillDetailBadgesHtml(skill)}
              </div>`;
          }
          return `<span class="dndBagChip dndBagChipUsable">${escapeHtml(it.name)} x${it.qty} <button type="button" class="dndBagUseBtn" data-usename="${escapeHtml(it.name)}" data-efftype="${escapeHtml(def.effectType || '')}"${disabledAttr}${titleAttr}>ใช้</button></span>`;
        }).join('')
      : `<span class="dndRangeHint">กระเป๋าว่างเปล่า</span>`;
    bagListEl.querySelectorAll('button[data-usename]').forEach(btn => {
      btn.onclick = (ev) => {
        if (amIDead()) { showDndErrorToast(dndDeadMsgForMe()); return; }
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
  const isVision = effectType === 'vision';
  document.getElementById('dndItemEffectValueRow').style.display = (isEquip || isNone) ? 'none' : 'flex';
  document.getElementById('dndItemEffectValueLabel').textContent = isVision ? 'วิสัยทัศน์ +/- (ติดลบ = มองเห็นแคบลง)' : 'จำนวน';
  document.getElementById('dndItemEffectValue').min = isVision ? '-80' : '0';
  document.getElementById('dndItemEffectVisionRow').style.display = isVision ? 'flex' : 'none';
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
  const durationSec = document.getElementById('dndItemEffectVisionDuration').value;
  if (!name) { showDndErrorToast('กรุณาตั้งชื่อไอเทม'); return; }
  flashBtn(ev.currentTarget);
  send({ type: 'dndItemEffectCreate', item: { name, effectType, value, slot, atk, def, maxDurability, desc, durationSec, icon: dndItemEffectIconData } });
  document.getElementById('dndItemEffectName').value = '';
  document.getElementById('dndItemEffectValue').value = 0;
  document.getElementById('dndItemEffectAtk').value = 0;
  document.getElementById('dndItemEffectDef').value = 0;
  document.getElementById('dndItemEffectDurability').value = 0;
  document.getElementById('dndItemEffectDesc').value = '';
  document.getElementById('dndItemEffectVisionDuration').value = 0;
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

// รายการลำดับเทิร์นที่ DM จัดเรียงเอง (ผู้เล่น + มอนสเตอร์บนแผนที่ปัจจุบัน) — ถ้ายังไม่เคยตั้งลำดับ ให้พรีวิวจากผู้เล่นทุกคน + มอนสเตอร์บนแผนที่นี้ทั้งหมดไปก่อน
// แต่ละ entry คือ { kind: 'pc'|'npc', id, name } — name มาจากเซิร์ฟเวอร์เสมอเมื่อมีลำดับเทิร์นจริงแล้ว (กันปัญหาชื่อไม่ตรงถ้า DM สลับแผนที่ระหว่างนับเทิร์นอยู่)
function dndTurnOrderIds() {
  if (dndTurnOrderClient.length) return dndTurnOrderClient;
  const playerEntries = dndPlayersList.filter(p => !p.isDM).map(p => ({ kind: 'pc', id: p.id, name: p.character.charName || p.name }));
  const npcEntries = dndTokens.filter(t => t.kind === 'npc').map(t => ({ kind: 'npc', id: t.id, name: t.name }));
  return [...playerEntries, ...npcEntries];
}
function renderDndTurnBox() {
  const box = document.getElementById('dndTurnOrderList');
  if (!box) return;
  const entries = dndTurnOrderIds();
  if (!entries.length) { box.innerHTML = `<div class="dndRangeHint">ยังไม่มีผู้เล่นหรือมอนสเตอร์บนแผนที่นี้</div>`; return; }
  box.innerHTML = '';
  entries.forEach((entry, idx) => {
    const isNpc = entry.kind === 'npc';
    const row = document.createElement('div');
    // ใช้ตำแหน่ง index เทียบกับ turnIndex ตรงๆ แทนการเทียบ id เฉยๆ เพราะ id ของผู้เล่นกับมอนสเตอร์อาจซ้ำกันได้ (คนละชุดเลข)
    const isCurrent = dndTurnIndexClient >= 0 && dndTurnIndexClient === idx && dndTurnOrderClient.length > 0;
    row.className = 'dndTurnRow' + (isCurrent ? ' current' : '');
    // token npc ที่เป็นสัตว์อัญเชิญของผู้เล่น (ไม่ใช่มอนสเตอร์ทั่วไปของ DM) — ใช้ไอคอน 🐾 แทน 👹 และต่อท้ายด้วยชื่อเจ้าของ ให้ DM แยกออกได้ทันทีว่าเป็นของใคร
    const tok = isNpc ? dndTokens.find(t => t.id === entry.id && t.kind === 'npc') : null;
    const isSummon = !!(tok && tok.summoned);
    const owner = isSummon ? dndPlayersList.find(p => p.id === tok.ownerId) : null;
    const ownerTag = owner ? ` <span style="color:#7ee8fa;">(${escapeHtml(owner.character.charName || owner.name)})</span>` : '';
    row.innerHTML = `
      <span class="dndTurnRowName">${isCurrent ? '🎯 ' : ''}${isSummon ? '🐾 ' : (isNpc ? '👹 ' : '')}${escapeHtml(entry.name || '???')}${ownerTag}</span>
      <button type="button" data-act="up">↑</button>
      <button type="button" data-act="down">↓</button>`;
    row.querySelector('[data-act="up"]').disabled = idx === 0;
    row.querySelector('[data-act="down"]').disabled = idx === entries.length - 1;
    row.querySelector('[data-act="up"]').onclick = () => dndTurnReorder(idx, idx - 1);
    row.querySelector('[data-act="down"]').onclick = () => dndTurnReorder(idx, idx + 1);
    box.appendChild(row);
  });
}
function dndTurnReorder(from, to) {
  const entries = dndTurnOrderIds().slice();
  if (to < 0 || to >= entries.length) return;
  const [moved] = entries.splice(from, 1);
  entries.splice(to, 0, moved);
  send({ type: 'dndTurnSetOrder', order: entries.map(e => ({ kind: e.kind, id: e.id })) });
}
document.getElementById('dndTurnStartBtn').onclick = () => send({ type: 'dndTurnStart' });
document.getElementById('dndTurnNextBtn').onclick = () => send({ type: 'dndTurnNext' });
document.getElementById('dndTurnStopBtn').onclick = () => send({ type: 'dndTurnStop' });

// ================== ระบบแผนที่การต่อสู้ (Battle Map) ==================
// ย้ายไปอยู่ที่ public/js/dnd-map.js ทั้งหมดแล้ว (token, fog of war, vision,
// npc list, token editor ฯลฯ) — ไฟล์นั้นโหลดหลัง app.js นี้ใน index.html
// ========================================================================

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


