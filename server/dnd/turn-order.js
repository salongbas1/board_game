// ============================================================
// ลำดับเทิร์นผู้เล่น+มอนสเตอร์ — DM จัดลำดับเอง (ลาก/เลื่อนขึ้นลง ไม่ทอย initiative) แล้วกดเลื่อนตาไปเรื่อยๆ วนลูป
// แยกออกมาจาก dnd.js: state (turnOrder/turnIndex) ถูกย้ายมาเก็บไว้ในโมดูลนี้เอง ไม่ใช่ตัวแปร module-level ของ dnd.js อีกต่อไป
// รับ findByWs/sendError/addLog/getPlayers/getTokens/getCurrentMapId จาก dnd.js ผ่าน factory function createTurnOrder(...)
// เพื่อเลี่ยง circular require (เหมือน server/dnd/game-time.js) — getPlayers/getTokens/getCurrentMapId ต้องเป็นฟังก์ชัน
// (ไม่ใช่ค่าตรงๆ) เพราะ dndPlayers/dndTokens/dndCurrentMapId ใน dnd.js ถูกแทนที่ทั้งก้อนได้ (เช่นตอนโหลดไฟล์เซฟ)
// ============================================================

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
function createTurnOrder({ findByWs, sendError, addLog, getPlayers, getTokens, getCurrentMapId }) {
  let turnOrder = []; // array of entries { kind: 'pc'|'npc', id } ตามลำดับที่ DM ตั้งไว้
  let turnIndex = -1; // index ใน turnOrder ของตาปัจจุบัน, -1 = ยังไม่ได้เริ่ม/หยุดแล้ว

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
    // สำคัญ: ต้อง "ซิงค์" ทุกครั้งที่กดเริ่ม ไม่ใช่สร้างใหม่แค่ตอนลำดับว่างเปล่าเท่านั้น
    // เพราะถ้าเคยกดเริ่ม/หยุดไปแล้วครั้งหนึ่ง (ตอนนั้นยังไม่มีมอนสเตอร์) turnOrder จะไม่ว่างอีกต่อไป
    // แล้วพอ DM วางมอนสเตอร์เพิ่มทีหลังแล้วกดเริ่มใหม่ มอนสเตอร์จะไม่ถูกเติมเข้าลำดับเลยเพราะเงื่อนไข "ถ้าว่าง" ไม่จริงแล้ว
    // เก็บลำดับที่ DM เคยจัดไว้สำหรับคนที่ยังอยู่ไว้ก่อน แล้วเติมผู้เล่น/มอนสเตอร์บนแผนที่นี้ที่ยังไม่มีในลำดับต่อท้ายให้อัตโนมัติ
    cleanTurnOrder();
    const existingKeys = new Set(turnOrder.map(e => `${e.kind}:${e.id}`));
    const missingPlayers = getPlayers().filter(pp => !pp.isDM && !existingKeys.has(`pc:${pp.id}`)).map(pp => ({ kind: 'pc', id: pp.id }));
    const missingNpcs = getTokens().filter(t => t.kind === 'npc' && t.mapId === getCurrentMapId() && !existingKeys.has(`npc:${t.id}`)).map(t => ({ kind: 'npc', id: t.id }));
    turnOrder = [...turnOrder, ...missingPlayers, ...missingNpcs];
    if (!turnOrder.length) { sendError(ws, 'ยังไม่มีผู้เล่นหรือมอนสเตอร์บนแผนที่นี้ให้เริ่มเทิร์น'); return; }
    turnIndex = 0;
    addLog(`🎯 เริ่มลำดับเทิร์น (${turnOrder.length} ตัว) — ตอนนี้เป็นตาของ ${turnEntryName(currentTurnEntry())}`);
  }
  function handleTurnNext(ws) {
    const p = findByWs(ws);
    if (!p || !p.isDM || !turnOrder.length || turnIndex < 0) return;
    turnIndex = (turnIndex + 1) % turnOrder.length;
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

  // ใช้ตอน dndHandleRestart — รีเซตลำดับเทิร์นกลับค่าเริ่มต้น
  function reset() {
    turnOrder = [];
    turnIndex = -1;
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
    reset,
    serialize,
    restore,
  };
}

module.exports = {
  createTurnOrder,
  dndNormalizeTurnEntry,
};
