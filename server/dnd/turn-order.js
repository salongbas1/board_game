// ============================================================
// ลำดับเทิร์นผู้เล่น+มอนสเตอร์ — ตอนกด "เริ่มเทิร์น" ระบบทอย initiative (d20 + DEX modifier) ให้ทุกตัว
// จากผู้เล่นที่ DM ติ๊กเลือกไว้ว่าอยู่ในแผนที่ปัจจุบัน + มอนสเตอร์ทุกตัวบนแผนที่นั้น แล้วเรียงจากมากไปน้อย
// (เสมอกันจะเทียบ DEX ดิบต่อ แล้วสุ่มถ้ายังเสมออยู่) จากนั้น DM ยังลาก/เลื่อนขึ้นลงจัดลำดับเองต่อได้ตามปกติ
// ถ้าเริ่มเทิร์นไปแล้ว DM พึ่งติ๊กเพิ่มผู้เล่นเข้าแผนที่ปัจจุบัน (หรือวางมอนสเตอร์เพิ่ม) จะต่อท้ายลำดับให้ทันที ไม่แทรกกลางคิวตาม initiative
// แยกออกมาจาก dnd.js: state (turnOrder/turnIndex) ถูกย้ายมาเก็บไว้ในโมดูลนี้เอง ไม่ใช่ตัวแปร module-level ของ dnd.js อีกต่อไป
// รับ findByWs/sendError/addLog/getPlayers/getTokens/getCurrentMapId/getCurrentMap/mapAllowsPlayer จาก dnd.js ผ่าน factory function createTurnOrder(...)
// เพื่อเลี่ยง circular require (เหมือน server/dnd/game-time.js) — ต้องเป็นฟังก์ชันทั้งหมด (ไม่ใช่ค่าตรงๆ)
// เพราะ dndPlayers/dndTokens/dndCurrentMapId/dndMaps ใน dnd.js ถูกแทนที่ทั้งก้อนได้ (เช่นตอนโหลดไฟล์เซฟ)
// ============================================================

const { dndAbilityMod, dndRandInt } = require('./combat-math');

// สุ่มเรียงลำดับ array แบบ Fisher–Yates (ไม่แก้ array เดิม คืน array ใหม่) — ยังใช้เป็นตัวเบรกไทตอน initiative เท่ากันเป๊ะ
function dndShuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// แต่ละช่องในลำดับเทิร์นเป็น entry รูปแบบ { kind: 'pc'|'npc', id } — 'pc' คือผู้เล่น (id = player id), 'npc' คือมอนสเตอร์/token บนแผนที่ (id = token id)
// ต้องแยก kind เพราะ player id กับ token id คนละชุดตัวเลข อาจชนกันได้ ถ้าเทียบแค่ id เฉยๆ จะสับสนว่าเป็นใครกันแน่
function dndNormalizeTurnEntry(raw) {
  // รองรับของเก่า (เซฟไฟล์ก่อนหน้านี้ที่ยังเก็บลำดับเทิร์นเป็นเลข player id ล้วนๆ ไม่มี kind) ให้ตีความเป็น 'pc' เสมอ
  if (raw && typeof raw === 'object') {
    const kind = raw.kind === 'npc' ? 'npc' : 'pc';
    const id = Number(raw.id);
    return Number.isFinite(id) ? { kind, id } : null;
  }
  const id = Number(raw);
  return Number.isFinite(id) ? { kind: 'pc', id } : null;
}

// ---- factory: สร้าง instance ของระบบลำดับเทิร์น พร้อม state ของตัวเอง ----
function createTurnOrder({ findByWs, sendError, addLog, getPlayers, getTokens, getCurrentMapId, getCurrentMap, mapAllowsPlayer }) {
  let turnOrder = []; // array of entries { kind: 'pc'|'npc', id } ตามลำดับที่ DM ตั้งไว้
  let turnIndex = -1; // index ใน turnOrder ของตาปัจจุบัน, -1 = ยังไม่ได้เริ่ม/หยุดแล้ว
  // นับ "รอบตา" ปัจจุบันแบบไม่ซ้ำ (เพิ่มขึ้นทุกครั้งที่ตาเปลี่ยน ไม่ว่าจะเป็นตอนกด "เริ่มเทิร์น" หรือ "ตาถัดไป")
  // ใช้แยกแยะว่า "ตานี้" กับ "ตาก่อนหน้าที่ index อาจวนกลับมาเลขเดิม" เป็นคนละตากันจริงๆ — เอาไว้ให้ dnd.js เช็คว่าผู้เล่นขยับ token ไปแล้วหรือยังในตานี้
  let stepId = 0;

  // ผู้เล่นที่ DM ติ๊กเลือกไว้ว่า "อยู่ในแผนที่ปัจจุบัน" เท่านั้น (ไม่รวม DM เอง) — ใช้เป็นสระสำหรับสุ่มลำดับเทิร์นตอนกดเริ่ม
  function playersInCurrentMap() {
    const map = getCurrentMap();
    return getPlayers().filter(pp => !pp.isDM && mapAllowsPlayer(map, pp.id));
  }
  // เอา entry ที่อ้างถึงผู้เล่น/มอนสเตอร์ที่ไม่มีอยู่แล้วออกจากลำดับเทิร์น (เผื่อถูกเตะออก หรือมอนสเตอร์ถูกลบ/แผนที่ถูกลบระหว่างนับเทิร์นอยู่)
  function cleanTurnOrder() {
    const players = getPlayers();
    const tokens = getTokens();
    turnOrder = turnOrder.filter(e => {
      if (e.kind === 'npc') return tokens.some(t => t.id === e.id && t.kind === 'npc');
      return players.some(pp => pp.id === e.id && !pp.isDM);
    });
    if (turnIndex >= turnOrder.length) turnIndex = turnOrder.length ? 0 : -1;
  }
  function turnEntryName(e) {
    if (!e) return '-';
    if (e.kind === 'npc') {
      const t = getTokens().find(tt => tt.id === e.id && tt.kind === 'npc');
      return t ? t.name : '(มอนสเตอร์ที่ถูกลบไปแล้ว)';
    }
    const pp = getPlayers().find(pl => pl.id === e.id);
    return pp ? (pp.character.charName || pp.name) : '-';
  }
  // หา DEX ดิบของเจ้าของ entry (ผู้เล่นดูจาก character.dex, มอนสเตอร์ดูจาก token.dex) — ไม่เจอให้ถือว่า 10 (ตัวปรับ = 0) เหมือนค่าเริ่มต้นปกติ
  function entryDex(e) {
    if (e.kind === 'npc') {
      const t = getTokens().find(tt => tt.id === e.id && tt.kind === 'npc');
      return Number(t && t.dex) || 10;
    }
    const pp = getPlayers().find(pl => pl.id === e.id && !pl.isDM);
    return Number(pp && pp.character && pp.character.dex) || 10;
  }
  // ทอย initiative แบบ D&D มาตรฐาน: 1d20 + ตัวปรับ DEX ของตัวละคร/มอนสเตอร์ตัวนั้น
  function rollInitiative(e) {
    const dex = entryDex(e);
    const total = dndRandInt(1, 20) + dndAbilityMod(dex);
    return { entry: e, total, dex };
  }
  function currentTurnEntry() {
    if (turnIndex < 0 || turnIndex >= turnOrder.length) return null;
    return turnOrder[turnIndex];
  }
  // คืน player id เฉพาะตอนที่ตาปัจจุบันเป็นของ "ผู้เล่น" เท่านั้น — ถ้าเป็นตาของมอนสเตอร์ ให้คืน null เสมอ
  // (ผลคือผู้เล่นทุกคนกระทำการไม่ได้ในตามอนสเตอร์ ต้องรอ DM สั่งมอนสเตอร์เอง เหมือนตากันแทรกในลำดับปกติ)
  function currentTurnPlayerId() {
    const e = currentTurnEntry();
    return (e && e.kind === 'pc') ? e.id : null;
  }
  // ถ้ากำลังนับเทิร์นอยู่ (turnIndex >= 0) เวลามีมอนสเตอร์ตัวใหม่ถูกวางเพิ่มลงแผนที่ปัจจุบันระหว่างนั้น
  // ให้ต่อท้ายลำดับเทิร์นทันที เพื่อให้มอนสเตอร์ตัวใหม่เข้าคิวได้โดยไม่ต้องกด "เริ่มเทิร์น" ใหม่ (ซึ่งจะรีเซ็ตกลับไปเป็นตาแรกทุกครั้ง)
  function appendTurnEntryIfActive(kind, id) {
    if (turnIndex < 0 || !turnOrder.length) return;
    if (turnOrder.some(e => e.kind === kind && e.id === id)) return;
    turnOrder.push({ kind, id });
  }
  function handleTurnSetOrder(ws, order) {
    const p = findByWs(ws);
    if (!p || !p.isDM || !Array.isArray(order)) return;
    const validPlayerIds = new Set(getPlayers().filter(pp => !pp.isDM).map(pp => pp.id));
    const validNpcIds = new Set(getTokens().filter(t => t.kind === 'npc' && t.mapId === getCurrentMapId()).map(t => t.id));
    const seen = new Set();
    const cleaned = [];
    for (const raw of order) {
      const entry = dndNormalizeTurnEntry(raw);
      if (!entry) continue;
      const valid = entry.kind === 'npc' ? validNpcIds.has(entry.id) : validPlayerIds.has(entry.id);
      const key = `${entry.kind}:${entry.id}`;
      if (valid && !seen.has(key)) { seen.add(key); cleaned.push(entry); }
    }
    turnOrder = cleaned;
    if (turnIndex >= turnOrder.length) turnIndex = turnOrder.length ? 0 : -1;
  }
  function handleTurnStart(ws) {
    const p = findByWs(ws);
    if (!p || !p.isDM) return;
    // ทุกครั้งที่กดเริ่ม ทอย initiative (1d20 + ตัวปรับ DEX) ใหม่ทั้งหมดจาก "ผู้เล่นที่ DM ติ๊กเลือกไว้ว่าอยู่ในแผนที่ปัจจุบัน" + มอนสเตอร์ทุกตัวบนแผนที่นี้
    // (ไม่ใช่ผู้เล่นทุกคนในห้อง — ต้องถูกติ๊กเข้าแผนที่นี้ก่อนถึงจะเข้าคิวได้) เรียงจากคะแนนรวมมากไปน้อย
    // เสมอกันเป๊ะเทียบ DEX ดิบต่อ (สูงกว่าไปก่อน) ถ้ายังเสมออยู่อีกค่อยสุ่มเรียง (dndShuffleArray) ตัดสิน
    const pcEntries = playersInCurrentMap().map(pp => ({ kind: 'pc', id: pp.id }));
    const npcEntries = getTokens().filter(t => t.kind === 'npc' && t.mapId === getCurrentMapId()).map(t => ({ kind: 'npc', id: t.id }));
    const pool = [...pcEntries, ...npcEntries];
    if (!pool.length) { sendError(ws, 'ยังไม่มีผู้เล่นหรือมอนสเตอร์บนแผนที่นี้ให้เริ่มเทิร์น'); return; }
    const rolled = dndShuffleArray(pool).map(rollInitiative); // สุ่มก่อนทอยกันลำดับเดิมมีผลตอนเสมอกันเป๊ะทุกอย่าง
    rolled.sort((a, b) => b.total - a.total || b.dex - a.dex);
    turnOrder = rolled.map(r => r.entry);
    turnIndex = 0;
    stepId++; // ตาใหม่เสมอทุกครั้งที่กดเริ่มเทิร์น (รีเซตสิทธิ์ขยับ token ของทุกคน)
    const rollSummary = rolled.map(r => `${turnEntryName(r.entry)} (${r.total})`).join(', ');
    addLog(`🎲 ทอย initiative ใหม่ (1d20+DEX, ${turnOrder.length} ตัว): ${rollSummary} — ตอนนี้เป็นตาของ ${turnEntryName(currentTurnEntry())}`);
  }
  function handleTurnNext(ws) {
    const p = findByWs(ws);
    if (!p || !p.isDM || !turnOrder.length || turnIndex < 0) return;
    turnIndex = (turnIndex + 1) % turnOrder.length;
    stepId++; // ตาใหม่ทุกครั้งที่กด "ตาถัดไป" — แม้ index จะวนกลับมาเลขเดิม (รอบใหม่) ก็นับเป็นตาใหม่
    addLog(`➡️ ตาถัดไป: ${turnEntryName(currentTurnEntry())}`);
  }
  function handleTurnStop(ws) {
    const p = findByWs(ws);
    if (!p || !p.isDM) return;
    turnIndex = -1;
    addLog('⏹️ หยุดลำดับเทิร์นแล้ว');
  }

  function getTurnOrder() { return turnOrder; }
  function getTurnIndex() { return turnIndex; }
  function getStepId() { return stepId; }

  // ใช้ตอน dndHandleRestart — รีเซตลำดับเทิร์นกลับค่าเริ่มต้น
  function reset() {
    turnOrder = [];
    turnIndex = -1;
    stepId = 0;
  }

  // ใช้ตอน dndSerializeState — ส่วนหนึ่งของไฟล์เซฟ
  function serialize() {
    return { turnOrder, turnIndex };
  }

  // ใช้ตอน dndHandleImportState — โหลดค่ากลับจากไฟล์เซฟ แล้วเก็บกวาด entry ที่ไม่มีอยู่แล้วออกทันที (เหมือนโค้ดเดิม)
  function restore(data) {
    turnOrder = Array.isArray(data && data.turnOrder) ? data.turnOrder.map(dndNormalizeTurnEntry).filter(Boolean) : [];
    turnIndex = Number.isFinite(Number(data && data.turnIndex)) ? Number(data.turnIndex) : -1;
    cleanTurnOrder();
  }

  return {
    cleanTurnOrder,
    turnEntryName,
    currentTurnEntry,
    currentTurnPlayerId,
    appendTurnEntryIfActive,
    handleTurnSetOrder,
    handleTurnStart,
    handleTurnNext,
    handleTurnStop,
    getTurnOrder,
    getTurnIndex,
    getStepId,
    reset,
    serialize,
    restore,
  };
}

module.exports = {
  createTurnOrder,
  dndNormalizeTurnEntry,
};
