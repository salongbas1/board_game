// ============================================================
// Hearts x8 — เกมไพ่ Hearts (หัวใจ) ล็อบบี้ + กติกา + AI บอท
// แยกออกมาจาก server.js เดิม (ไม่พึ่งพาโค้ดส่วน D&D เลย)
// ============================================================

const WebSocket = require('ws');

// ---------------- Mode config (เลือกได้ในห้องรอ) ----------------
const MODES = {
  4: { numPlayers: 4, decks: 1, scoreLimit: 100 },
  8: { numPlayers: 8, decks: 2, scoreLimit: 150 },
};
let gameMode = 8;        // 4 หรือ 8 — เลือกโดยโฮสต์ในห้องรอ
let botLevel = 'normal'; // 'easy' | 'normal' | 'hard' — เลือกโดยโฮสต์ในห้องรอ

let NUM_PLAYERS = MODES[gameMode].numPlayers;
let DECK_COUNT = MODES[gameMode].decks;
let SCORE_LIMIT = MODES[gameMode].scoreLimit;

const BOT_NAMES = ['บอท1', 'บอท2', 'บอท3', 'บอท4', 'บอท5', 'บอท6', 'บอท7'];

// ---------------- Card helpers (ported from original single-player logic) ----------------
const SUITS = ['♣', '♦', '♠', '♥'];
const RANKS = [
  { r: '2', v: 2 }, { r: '3', v: 3 }, { r: '4', v: 4 }, { r: '5', v: 5 }, { r: '6', v: 6 }, { r: '7', v: 7 },
  { r: '8', v: 8 }, { r: '9', v: 9 }, { r: '10', v: 10 }, { r: 'J', v: 11 }, { r: 'Q', v: 12 }, { r: 'K', v: 13 }, { r: 'A', v: 14 },
];

function pointValue(card) {
  // ใช้สำหรับกติกา "ห้ามทิ้งไพ่แต้มในกองแรกถ้ายังมีดอกอื่นให้เดิน" — ไม่รวม J♦ เพราะ J♦ เป็นไพ่ที่อยากได้ (ลบแต้ม)
  if (card.suit === '♥') return 1;
  if (card.suit === '♠' && card.rank === 'Q') return 13;
  return 0;
}
function moonPointValue(card) {
  // ใช้เช็คการกินหมดกระดาน (Shoot the Moon) — เฉพาะโพแดงกับ Q♠ เท่านั้น รวมได้ 52 แต้มเสมอ
  if (card.suit === '♥') return 1;
  if (card.suit === '♠' && card.rank === 'Q') return 13;
  return 0;
}
function jackBonusValue(card) {
  // J♦ = -10 แต้ม (มี 2 ใบเพราะ 2 สำรับ) ไม่เกี่ยวกับการกินหมดกระดาน คิดแยกต่างหากเสมอ
  return (card.suit === '♦' && card.rank === 'J') ? -10 : 0;
}
function createDeck(numDecks) {
  const deck = [];
  for (let d = 0; d < numDecks; d++) {
    for (const suit of SUITS) {
      for (const rk of RANKS) {
        deck.push({ suit, rank: rk.r, value: rk.v, deckId: d, uid: suit + rk.r + '_' + d });
      }
    }
  }
  return deck;
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function sortHand(hand) {
  const order = { '♣': 0, '♦': 1, '♠': 2, '♥': 3 };
  return hand.slice().sort((a, b) => order[a.suit] - order[b.suit] || a.value - b.value);
}
function cardPublic(c) { return { suit: c.suit, rank: c.rank, value: c.value, uid: c.uid }; }
function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

// ---------------- Server-side game state ----------------
let lobbySeats = [];  // [{ws, seat, name}] before game starts
let players = [];     // [{seat,name,isBot,ws,hand,collected,score}] once started
let started = false;
let phase = 'lobby';  // lobby | passing | playing | handSummary | gameOver
let handNumber = 0;
let heartsBroken = false;
let currentTrick = [];
let leaderSeat = 0;
let firstTrick = true;
let tricksPlayed = 0;
let gameOver = false;
let lastHandSummary = null;
let finalScoresCache = null;
let passingState = null;      // { direction, chosen: {seat: [cards]} }
let pendingResolvers = {};    // seat -> resolve(card)
let alarmActive = false;      // สัญญาณเตือน (blackout) เปิด/ปิดอยู่ตอนนี้หรือไม่
let watchers = [];            // [{ws, name}] คนที่เชื่อมต่ออยู่ระหว่างเกมแต่ยังไม่มีที่นั่ง (ออกจากโต๊ะแล้ว หรือเพิ่งเข้ามาดู)

function broadcastAlarm() {
  const payload = JSON.stringify({ type: 'alarm', active: alarmActive });
  const targets = started ? players.filter(p => !p.isBot) : lobbySeats;
  for (const t of targets) {
    if (t.ws && t.ws.readyState === WebSocket.OPEN) t.ws.send(payload);
  }
}

function addLog(msg) {
  for (const p of players) {
    if (!p.isBot && p.ws && p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(JSON.stringify({ type: 'log', msg }));
    }
  }
}

function seatPickerPayload() {
  return JSON.stringify({
    type: 'seatPicker',
    seats: players.map(p => ({ seat: p.seat, name: p.name, isBot: p.isBot })),
  });
}
function broadcastSeatPicker() {
  const payload = seatPickerPayload();
  for (const w of watchers) {
    if (w.ws.readyState === WebSocket.OPEN) w.ws.send(payload);
  }
}

// ---------------- Lobby ----------------
function assignSeatsCompact() {
  lobbySeats.forEach((c, i) => { c.seat = i; });
}
function broadcastLobby() {
  for (const c of lobbySeats) {
    if (c.ws.readyState !== WebSocket.OPEN) continue;
    c.ws.send(JSON.stringify({
      type: 'lobby',
      seats: lobbySeats.map(s => ({ seat: s.seat, name: s.name })),
      yourSeat: c.seat,
      maxSeats: MODES[gameMode].numPlayers,
      gameMode,
      botLevel,
    }));
  }
}

function beginGame() {
  started = true;
  gameOver = false;
  handNumber = 0;
  NUM_PLAYERS = MODES[gameMode].numPlayers;
  DECK_COUNT = MODES[gameMode].decks;
  SCORE_LIMIT = MODES[gameMode].scoreLimit;
  const humanCount = lobbySeats.length;
  players = [];
  for (let i = 0; i < NUM_PLAYERS; i++) {
    if (i < humanCount) {
      const c = lobbySeats[i];
      players.push({ seat: i, name: c.name, isBot: false, ws: c.ws, hand: [], collected: [], score: 0 });
    } else {
      players.push({ seat: i, name: BOT_NAMES[i - humanCount] || ('บอท' + (i - humanCount + 1)), isBot: true, ws: null, hand: [], collected: [], score: 0 });
    }
  }
  lobbySeats = [];
  runGame();
}

// ---------------- Game rules (ported) ----------------
function getPassDirection(hIdx) {
  const cycle = ['left', 'right', 'across', 'none'];
  return cycle[hIdx % 4];
}
function passTargetSeat(seat, direction) {
  if (direction === 'left') return (seat + 1) % NUM_PLAYERS;
  if (direction === 'right') return (seat - 1 + NUM_PLAYERS) % NUM_PLAYERS;
  if (direction === 'across') return (seat + Math.floor(NUM_PLAYERS / 2)) % NUM_PLAYERS;
  return seat;
}
function botChoosePassCards(seat) {
  if (botLevel === 'easy') return botChoosePassEasy(seat);
  if (botLevel === 'hard') return botChoosePassHard(seat);
  return botChoosePassNormal(seat);
}
function botChoosePassEasy(seat) {
  // สุ่มทิ้งไพ่ 3 ใบแบบไม่มีกลยุทธ์
  const hand = players[seat].hand;
  return shuffle(hand.slice()).slice(0, 3);
}
function botChoosePassNormal(seat) {
  const hand = players[seat].hand;
  const danger = c => (c.suit === '♠' && c.rank === 'Q' ? 100 : 0) + (c.suit === '♥' ? c.value : 0) + (c.suit === '♠' && c.value >= 13 ? 40 : 0);
  return hand.slice().sort((a, b) => danger(b) - danger(a)).slice(0, 3);
}
function botChoosePassHard(seat) {
  const hand = players[seat].hand;
  const suitCount = {};
  hand.forEach(c => { suitCount[c.suit] = (suitCount[c.suit] || 0) + 1; });
  const danger = c => {
    if (c.suit === '♦' && c.rank === 'J') return -100; // J♦ อยากเก็บไว้เอง (-10 แต้ม)
    let d = 0;
    if (c.suit === '♠' && c.rank === 'Q') d += 100;
    if (c.suit === '♠' && c.value >= 13 && suitCount['♠'] <= 3) d += 55; // A/K โพดำ อันตรายถ้าโพดำสั้น
    if (c.suit === '♥') d += c.value + 5;
    // โบนัสเล็กน้อยให้ทิ้งจากดอกที่สั้นที่สุด เพื่อสร้างดอกว่างเร็วขึ้น
    if (suitCount[c.suit] <= 2) d += (3 - suitCount[c.suit]) * 3;
    return d;
  };
  return hand.slice().sort((a, b) => danger(b) - danger(a)).slice(0, 3);
}
function determineFirstLeader() {
  for (const p of players) {
    if (p.hand.some(c => c.suit === '♣' && c.rank === '2')) return p.seat;
  }
  return 0;
}
function seatsOrderForTrick() {
  const order = [];
  for (let i = 0; i < NUM_PLAYERS; i++) order.push((leaderSeat + i) % NUM_PLAYERS);
  return order;
}
function isValidPlay(seat, card) {
  const p = players[seat];
  if (currentTrick.length === 0) {
    if (firstTrick) return card.suit === '♣' && card.rank === '2';
    if (card.suit === '♥' && !heartsBroken) {
      const hasNonHeart = p.hand.some(c => c.suit !== '♥');
      return !hasNonHeart;
    }
    return true;
  } else {
    const ledSuit = currentTrick[0].card.suit;
    const hasLedSuit = p.hand.some(c => c.suit === ledSuit);
    if (hasLedSuit) return card.suit === ledSuit;
    if (firstTrick) {
      const isPoint = pointValue(card) > 0;
      if (isPoint) {
        const hasNonPoint = p.hand.some(c => pointValue(c) === 0);
        return !hasNonPoint;
      }
    }
    return true;
  }
}
function botChooseCard(seat) {
  if (botLevel === 'easy') return botChooseCardEasy(seat);
  if (botLevel === 'hard') return botChooseCardHard(seat);
  return botChooseCardNormal(seat);
}
function botChooseCardEasy(seat) {
  // เลือกไพ่ที่เล่นได้แบบสุ่ม ไม่มีกลยุทธ์
  const hand = players[seat].hand;
  const legal = hand.filter(c => isValidPlay(seat, c));
  const pool = legal.length > 0 ? legal : hand;
  return pool[Math.floor(Math.random() * pool.length)];
}
function botChooseCardNormal(seat) {
  const hand = players[seat].hand;
  const legal = hand.filter(c => isValidPlay(seat, c));
  if (currentTrick.length === 0) {
    const nonHeart = legal.filter(c => c.suit !== '♥');
    const pool = nonHeart.length > 0 ? nonHeart : legal;
    const bySuitCount = {};
    pool.forEach(c => { bySuitCount[c.suit] = (bySuitCount[c.suit] || 0) + hand.filter(h => h.suit === c.suit).length; });
    pool.sort((a, b) => (bySuitCount[a.suit] - bySuitCount[b.suit]) || (a.value - b.value));
    return pool[0];
  } else {
    const ledSuit = currentTrick[0].card.suit;
    const sameSuit = legal.filter(c => c.suit === ledSuit);
    if (sameSuit.length > 0) {
      const currentBest = Math.max(...currentTrick.filter(e => e.card.suit === ledSuit).map(e => e.card.value));
      const cannotWin = sameSuit.filter(c => c.value <= currentBest);
      if (cannotWin.length > 0) {
        cannotWin.sort((a, b) => b.value - a.value);
        return cannotWin[0];
      }
      const canWin = sameSuit.slice().sort((a, b) => a.value - b.value);
      return canWin[0];
    } else {
      const qs = legal.find(c => c.suit === '♠' && c.rank === 'Q');
      if (qs) return qs;
      const hearts = legal.filter(c => c.suit === '♥').sort((a, b) => b.value - a.value);
      if (hearts.length > 0) return hearts[0];
      const spadesHigh = legal.filter(c => c.suit === '♠').sort((a, b) => b.value - a.value);
      if (spadesHigh.length > 0 && spadesHigh[0].value >= 12) return spadesHigh[0];
      const rest = legal.slice().sort((a, b) => b.value - a.value);
      return rest[0];
    }
  }
}
function botChooseCardHard(seat) {
  const hand = players[seat].hand;
  const legal = hand.filter(c => isValidPlay(seat, c));
  const jd = c => c.suit === '♦' && c.rank === 'J';
  const qs = c => c.suit === '♠' && c.rank === 'Q';

  if (currentTrick.length === 0) {
    // เป็นผู้นำ: หลีกเลี่ยงการนำโพดำถ้ายังถือ Q♠ อยู่ (เว้นแต่จำเป็น), เลือกดอกที่สั้นที่สุดก่อนเพื่อสร้างดอกว่างเร็ว
    const holdsQS = hand.some(qs);
    const nonHeart = legal.filter(c => c.suit !== '♥');
    let pool = nonHeart.length > 0 ? nonHeart : legal;
    const spadeSafe = pool.filter(c => !(c.suit === '♠' && holdsQS));
    if (spadeSafe.length > 0) pool = spadeSafe;
    const bySuitCount = {};
    pool.forEach(c => { bySuitCount[c.suit] = (bySuitCount[c.suit] || 0) + hand.filter(h => h.suit === c.suit).length; });
    pool = pool.slice().sort((a, b) => (bySuitCount[a.suit] - bySuitCount[b.suit]) || (a.value - b.value));
    return pool[0];
  } else {
    const ledSuit = currentTrick[0].card.suit;
    const sameSuit = legal.filter(c => c.suit === ledSuit);
    if (sameSuit.length > 0) {
      const currentBest = Math.max(...currentTrick.filter(e => e.card.suit === ledSuit).map(e => e.card.value));
      const cannotWin = sameSuit.filter(c => c.value <= currentBest);
      if (cannotWin.length > 0) {
        // ดันไพ่ใบสูงสุดที่ยังแพ้อยู่ออกไปก่อน แต่เก็บ J♦ ไว้ถ้าไม่จำเป็นต้องทิ้ง
        cannotWin.sort((a, b) => b.value - a.value);
        const notJd = cannotWin.filter(c => !jd(c));
        return notJd.length > 0 ? notJd[0] : cannotWin[0];
      }
      const canWin = sameSuit.slice().sort((a, b) => a.value - b.value);
      return canWin[0];
    } else {
      // ไม่มีดอกตาม: ทิ้ง Q♠ ก่อนถ้ามี จากนั้นโพแดงใบสูงสุด แต่เก็บ J♦ ไว้เอง (คุ้ม -10 แต้ม)
      const q = legal.find(qs);
      if (q) return q;
      const hearts = legal.filter(c => c.suit === '♥').sort((a, b) => b.value - a.value);
      if (hearts.length > 0) return hearts[0];
      const spadesHigh = legal.filter(c => c.suit === '♠').sort((a, b) => b.value - a.value);
      if (spadesHigh.length > 0 && spadesHigh[0].value >= 12) return spadesHigh[0];
      const rest = legal.filter(c => !jd(c)).sort((a, b) => b.value - a.value);
      if (rest.length > 0) return rest[0];
      return legal.slice().sort((a, b) => b.value - a.value)[0];
    }
  }
}
function resolveTrick() {
  const ledSuit = currentTrick[0].card.suit;
  const contenders = currentTrick.filter(e => e.card.suit === ledSuit);
  const maxVal = Math.max(...contenders.map(e => e.card.value));
  const winnerEntry = contenders.find(e => e.card.value === maxVal);
  const winnerSeat = winnerEntry.seat;
  if (currentTrick.some(e => e.card.suit === '♥')) heartsBroken = true;
  const wonCards = currentTrick.map(e => e.card);
  players[winnerSeat].collected.push(...wonCards);
  addLog(`${players[winnerSeat].name} ชนะกองนี้ (${wonCards.map(c => c.rank + c.suit).join(' ')})`);
  leaderSeat = winnerSeat;
  currentTrick = [];
}
function scoreHand() {
  const moonPoints = players.map(p => p.collected.reduce((s, c) => s + moonPointValue(c), 0));
  const jackPoints = players.map(p => p.collected.reduce((s, c) => s + jackBonusValue(c), 0));
  const totalPool = 26 * DECK_COUNT; // โพแดง 13pt + Q♠ 13pt ต่อสำรับ
  const moonSeat = moonPoints.findIndex(v => v === totalPool);
  let summary = [];
  if (moonSeat >= 0) {
    players.forEach((p, i) => {
      const moonAdd = (i === moonSeat) ? 0 : totalPool;
      const add = moonAdd + jackPoints[i];
      p.score += add;
      summary.push({ name: p.name, add });
    });
    addLog(`🌙 ${players[moonSeat].name} กินหมดกระดาน (Shoot the Moon)! ตัวเองได้ 0 คนอื่นโดนคนละ ${totalPool} แต้ม (ยังบวก/ลบ J♦ ตามจริงแยกต่างหาก)`);
  } else {
    players.forEach((p, i) => {
      const add = moonPoints[i] + jackPoints[i];
      p.score += add;
      summary.push({ name: p.name, add });
    });
  }
  return summary;
}
function livePoints(p) {
  return p.collected.reduce((s, c) => s + moonPointValue(c) + jackBonusValue(c), 0);
}
function checkGameOver() { return players.some(p => p.score >= SCORE_LIMIT); }

// ---------------- Passing phase ----------------
function runPassingPhase(direction) {
  return new Promise(resolve => {
    passingState = { direction, chosen: {}, _resolve: resolve };
    players.forEach(p => {
      if (p.isBot) passingState.chosen[p.seat] = botChoosePassCards(p.seat);
    });
    broadcastState();
    checkPassingComplete();
  });
}
function checkPassingComplete() {
  if (!passingState) return;
  const allDone = players.every(p => passingState.chosen[p.seat]);
  if (!allDone) return;
  const outgoing = passingState.chosen;
  const direction = passingState.direction;
  for (const p of players) {
    p.hand = p.hand.filter(c => !outgoing[p.seat].includes(c));
  }
  for (const p of players) {
    const target = passTargetSeat(p.seat, direction);
    players[target].hand.push(...outgoing[p.seat]);
  }
  addLog(`ส่งไพ่เสร็จแล้ว (ทิศทาง: ${direction})`);
  const resolve = passingState._resolve;
  passingState = null;
  resolve();
}

// ---------------- Human input plumbing ----------------
function askPlayerToPlay(seat) {
  return new Promise(resolve => { pendingResolvers[seat] = resolve; });
}
function handlePlayCard(seat, uid) {
  if (!pendingResolvers[seat]) return;
  const p = players[seat];
  const card = p.hand.find(c => c.uid === uid);
  if (!card || !isValidPlay(seat, card)) return;
  const resolve = pendingResolvers[seat];
  delete pendingResolvers[seat];
  resolve(card);
}
function handleSubmitPass(seat, uids) {
  if (!passingState || passingState.chosen[seat]) return;
  const p = players[seat];
  if (!Array.isArray(uids) || uids.length !== 3) return;
  const cards = uids.map(u => p.hand.find(c => c.uid === u)).filter(Boolean);
  if (cards.length !== 3) return;
  passingState.chosen[seat] = cards;
  broadcastState();
  checkPassingComplete();
}

// ---------------- Main game loop ----------------
async function runGame() {
  while (!gameOver) {
    const deck = shuffle(createDeck(DECK_COUNT));
    players.forEach(p => { p.hand = []; p.collected = []; });
    for (let i = 0; i < deck.length; i++) players[i % NUM_PLAYERS].hand.push(deck[i]);
    heartsBroken = false;
    tricksPlayed = 0;
    phase = 'playing';
    broadcastState();

    const direction = getPassDirection(handNumber);
    addLog(`--- เริ่มมือที่ ${handNumber + 1} (ทิศทางส่งไพ่: ${direction}) ---`);
    if (direction !== 'none') {
      phase = 'passing';
      broadcastState();
      await runPassingPhase(direction);
    }

    leaderSeat = determineFirstLeader();
    firstTrick = true;
    phase = 'playing';

    for (tricksPlayed = 0; tricksPlayed < 13; tricksPlayed++) {
      currentTrick = [];
      const order = seatsOrderForTrick();
      for (const seat of order) {
        let card;
        if (players[seat].isBot) {
          broadcastState(seat);
          await sleep(450);
          card = botChooseCard(seat);
        } else {
          const playPromise = askPlayerToPlay(seat); // registers pendingResolvers[seat] synchronously
          broadcastState(seat); // now yourTurn will correctly be true for this seat
          card = await playPromise;
        }
        players[seat].hand = players[seat].hand.filter(c => c.uid !== card.uid);
        currentTrick.push({ seat, card });
        broadcastState();
        await sleep(280);
      }
      resolveTrick();
      broadcastState();
      await sleep(900);
      firstTrick = false;
    }

    const summary = scoreHand();
    phase = 'handSummary';
    lastHandSummary = summary;
    broadcastState();
    await sleep(4500);

    if (checkGameOver()) {
      gameOver = true;
      phase = 'gameOver';
      finalScoresCache = players.map(p => ({ name: p.name, score: p.score })).sort((a, b) => a.score - b.score);
      broadcastState();
    } else {
      handNumber++;
    }
  }
}

// ---------------- State broadcast ----------------
function publicPlayersInfo() {
  return players.map(p => ({
    seat: p.seat, name: p.name, isBot: p.isBot,
    score: p.score, handCount: p.hand.length, points: livePoints(p),
  }));
}
function broadcastState(activeSeat) {
  for (const p of players) {
    if (p.isBot || !p.ws || p.ws.readyState !== WebSocket.OPEN) continue;
    const yourTurn = pendingResolvers[p.seat] !== undefined;
    const payload = {
      type: 'state',
      phase,
      numPlayers: NUM_PLAYERS,
      deckCount: DECK_COUNT,
      scoreLimit: SCORE_LIMIT,
      botLevel,
      players: publicPlayersInfo(),
      yourSeat: p.seat,
      yourHand: sortHand(p.hand).map(cardPublic),
      currentTrick: currentTrick.map(e => ({ seat: e.seat, card: cardPublic(e.card) })),
      leaderSeat, heartsBroken, tricksPlayed, handNumber,
      activeSeat: activeSeat != null ? activeSeat : null,
      yourTurn,
      validUids: yourTurn ? p.hand.filter(c => isValidPlay(p.seat, c)).map(c => c.uid) : [],
      passing: phase === 'passing' ? {
        direction: passingState ? passingState.direction : null,
        submitted: passingState ? !!passingState.chosen[p.seat] : false,
      } : null,
      handSummary: phase === 'handSummary' ? lastHandSummary : null,
      finalScores: phase === 'gameOver' ? finalScoresCache : null,
    };
    p.ws.send(JSON.stringify(payload));
  }
}

function handleLeaveSeat(ws) {
  const p = players.find(pp => pp.ws === ws);
  if (!p || p.isBot) return;
  const name = p.name;
  p.isBot = true;
  p.ws = null;
  addLog(`${name} ออกจากโต๊ะ ระบบจะเล่นแทนอัตโนมัติ (บอท)`);
  if (pendingResolvers[p.seat]) {
    const resolve = pendingResolvers[p.seat];
    delete pendingResolvers[p.seat];
    resolve(botChooseCard(p.seat));
  }
  if (passingState && !passingState.chosen[p.seat]) {
    passingState.chosen[p.seat] = botChoosePassCards(p.seat);
    checkPassingComplete();
  }
  broadcastState();
  // ให้ ws เดิมกลายเป็นผู้ชม ที่สามารถเลือกนั่งที่นั่งไหนก็ได้ต่อ (รวมถึงที่นั่งเดิม)
  watchers.push({ ws, name });
  ws.send(seatPickerPayload());
  broadcastSeatPicker();
}
function handleTakeSeat(ws, seatNum) {
  const wIdx = watchers.findIndex(w => w.ws === ws);
  if (wIdx === -1) return; // ต้อง join ก่อนถึงจะนั่งได้
  const seat = Number(seatNum);
  const target = players[seat];
  if (!target || !target.isBot) {
    ws.send(seatPickerPayload());
    return;
  }
  const watcher = watchers[wIdx];
  watchers.splice(wIdx, 1);
  target.isBot = false;
  target.ws = ws;
  target.name = watcher.name;
  addLog(`${watcher.name} เข้ามานั่งแทนที่นั่ง ${seat + 1} (แทนบอท)`);
  broadcastState();
  broadcastSeatPicker();
}

// ---------------- Disconnect / restart handling ----------------
function handleDisconnect(ws) {
  watchers = watchers.filter(w => w.ws !== ws);
  if (!started) {
    lobbySeats = lobbySeats.filter(c => c.ws !== ws);
    assignSeatsCompact();
    broadcastLobby();
    return;
  }
  const p = players.find(pp => pp.ws === ws);
  if (p && !p.isBot) {
    p.isBot = true;
    p.ws = null;
    addLog(`${p.name} หลุดการเชื่อมต่อ ระบบจะเล่นแทนอัตโนมัติ (บอท)`);
    if (pendingResolvers[p.seat]) {
      const resolve = pendingResolvers[p.seat];
      delete pendingResolvers[p.seat];
      resolve(botChooseCard(p.seat));
    }
    if (passingState && !passingState.chosen[p.seat]) {
      passingState.chosen[p.seat] = botChoosePassCards(p.seat);
      checkPassingComplete();
    }
    broadcastState();
    broadcastSeatPicker();
  }
}
function leaveLobby(ws) {
  const c = lobbySeats.find(c => c.ws === ws);
  if (!c) return;
  lobbySeats = lobbySeats.filter(cc => cc.ws !== ws);
  assignSeatsCompact();
  broadcastLobby();
  ws.send(JSON.stringify({ type: 'leftLobby' }));
}
function restartToLobby(ws) {
  if (!started) return;
  const p = players.find(pp => pp.ws === ws);
  if (!p || p.isBot || phase !== 'gameOver') return;
  const seated = players.filter(pp => !pp.isBot && pp.ws).map(pp => ({ ws: pp.ws, name: pp.name }));
  const stillConnectedWatchers = watchers.filter(w => w.ws.readyState === WebSocket.OPEN);
  lobbySeats = [...seated, ...stillConnectedWatchers].map((c, i) => ({ ws: c.ws, seat: i, name: c.name }));
  started = false;
  phase = 'lobby';
  players = [];
  pendingResolvers = {};
  passingState = null;
  alarmActive = false;
  watchers = [];
  assignSeatsCompact();
  broadcastLobby();
}

// ---------------- WebSocket wiring ----------------
function findSeatByWs(ws) {
  const p = players.find(pp => pp.ws === ws);
  return p ? p.seat : null;
}

// ---------------- แชท/อีโมจิ (เฉพาะฝั่ง Hearts) ----------------
function handleChatLobby(ws, text) {
  const c = lobbySeats.find(c => c.ws === ws);
  if (!c) return;
  const trimmed = (text || '').toString().trim().slice(0, 300);
  if (!trimmed) return;
  for (const cc of lobbySeats) {
    if (cc.ws.readyState === WebSocket.OPEN) {
      cc.ws.send(JSON.stringify({ type: 'chat', name: c.name, text: trimmed }));
    }
  }
}
function handleChatGame(seat, text) {
  const p = players[seat];
  if (!p) return;
  const trimmed = (text || '').toString().trim().slice(0, 300);
  if (!trimmed) return;
  for (const pp of players) {
    if (!pp.isBot && pp.ws && pp.ws.readyState === WebSocket.OPEN) {
      pp.ws.send(JSON.stringify({ type: 'chat', name: p.name, text: trimmed }));
    }
  }
}
function handleThrowEmoji(seat, targetSeat, emoji) {
  const p = players[seat];
  if (!p) return;
  const target = Number(targetSeat);
  if (!Number.isInteger(target) || !players[target]) return;
  const safeEmoji = (emoji || '').toString().slice(0, 8);
  if (!safeEmoji) return;
  for (const pp of players) {
    if (!pp.isBot && pp.ws && pp.ws.readyState === WebSocket.OPEN) {
      pp.ws.send(JSON.stringify({ type: 'emojiThrow', fromSeat: seat, targetSeat: target, emoji: safeEmoji }));
    }
  }
}

// ---------------- ตัวจัดการข้อความ (เรียกจาก server/index.js) ----------------
// รับ msg ที่ parse เป็น object แล้ว และไม่ใช่ข้อความที่ขึ้นต้นด้วย 'dnd' (อันนั้นไปฝั่ง dnd.js)
function handleMessage(ws, msg) {
  if (msg.type === 'alarmToggle') {
    alarmActive = !alarmActive;
    broadcastAlarm();
    return;
  }

  if (!started) {
    if (msg.type === 'join') {
      const maxSeats = MODES[gameMode].numPlayers;
      if (lobbySeats.length >= maxSeats) {
        ws.send(JSON.stringify({ type: 'error', msg: `ห้องเต็มแล้ว (สูงสุด ${maxSeats} คน)` }));
        return;
      }
      const name = (msg.name || '').toString().trim().slice(0, 16) || `ผู้เล่น${lobbySeats.length + 1}`;
      lobbySeats.push({ ws, seat: lobbySeats.length, name });
      broadcastLobby();
      if (alarmActive) ws.send(JSON.stringify({ type: 'alarm', active: true }));
    } else if (msg.type === 'setMode') {
      const c = lobbySeats.find(c => c.ws === ws);
      if (!c || c.seat !== 0) return;
      const mode = Number(msg.mode);
      if (!MODES[mode]) return;
      if (lobbySeats.length > MODES[mode].numPlayers) {
        ws.send(JSON.stringify({ type: 'error', msg: `เปลี่ยนโหมดไม่ได้ เพราะมีผู้เล่นเข้าห้องแล้ว ${lobbySeats.length} คน เกินขนาดของโหมดนี้` }));
        return;
      }
      gameMode = mode;
      broadcastLobby();
    } else if (msg.type === 'setBotLevel') {
      const c = lobbySeats.find(c => c.ws === ws);
      if (!c || c.seat !== 0) return;
      if (!['easy', 'normal', 'hard'].includes(msg.level)) return;
      botLevel = msg.level;
      broadcastLobby();
    } else if (msg.type === 'startGame') {
      const c = lobbySeats.find(c => c.ws === ws);
      if (!c || c.seat !== 0) return;
      if (lobbySeats.length < 2) {
        ws.send(JSON.stringify({ type: 'error', msg: 'ต้องมีผู้เล่นจริงอย่างน้อย 2 คน' }));
        return;
      }
      beginGame();
    } else if (msg.type === 'leaveLobby') {
      leaveLobby(ws);
    } else if (msg.type === 'chat') {
      handleChatLobby(ws, msg.text);
    }
    return;
  }

  // ----- เกมกำลังเล่นอยู่ -----
  const seat = findSeatByWs(ws);
  if (seat === null) {
    // ws นี้ยังไม่มีที่นั่ง (เพิ่งเข้ามาดู หรือออกจากโต๊ะไปแล้ว)
    if (msg.type === 'join') {
      const name = (msg.name || '').toString().trim().slice(0, 16) || 'ผู้เล่น';
      const existing = watchers.find(w => w.ws === ws);
      if (existing) existing.name = name; else watchers.push({ ws, name });
      ws.send(seatPickerPayload());
    } else if (msg.type === 'takeSeat') {
      handleTakeSeat(ws, msg.seat);
    }
    return;
  }
  if (msg.type === 'playCard') handlePlayCard(seat, msg.uid);
  else if (msg.type === 'submitPass') handleSubmitPass(seat, msg.uids);
  else if (msg.type === 'restartGame') restartToLobby(ws);
  else if (msg.type === 'leaveSeat') handleLeaveSeat(ws);
  else if (msg.type === 'chat') handleChatGame(seat, msg.text);
  else if (msg.type === 'throwEmoji') handleThrowEmoji(seat, msg.targetSeat, msg.emoji);
}

module.exports = { handleMessage, handleDisconnect };
