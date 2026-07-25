// ============================================================
// แลกเปลี่ยนไอเทมระหว่างผู้เล่น (trade) — ฝ่ายเสนอเลือกไอเทม/ทองที่จะให้ กับที่จะขอ
// อีกฝ่ายกดยอมรับถึงจะซิงค์เข้ากระเป๋าจริง (หรือกดปฏิเสธ/ยกเลิกก็ได้)
// แยกออกมาจาก dnd.js: state (trades/nextTradeId) ถูกย้ายมาเก็บไว้ในโมดูลนี้เอง ไม่ใช่ตัวแปร module-level ของ dnd.js อีกต่อไป
// รับ findByWs/sendError/addLog/getPlayers/bag helper ฯลฯ จาก dnd.js ผ่าน factory function createTrade(...)
// เพื่อเลี่ยง circular require (เหมือน server/dnd/turn-order.js, game-time.js, status-effects.js) — getPlayers
// ต้องเป็นฟังก์ชัน (ไม่ใช่ค่าตรงๆ) เพราะ dndPlayers ใน dnd.js ถูกแทนที่ทั้งก้อนได้ (เช่นตอนโหลดไฟล์เซฟ)
//
// bag helper (sanitizeBag/bagAdd/bagRemove/hasRoomForItems) รับเข้ามาจากโมดูล server/dnd/bag.js ผ่าน dnd.js อีกที
// (bag.js เองใช้ ctx pattern แบบเก่า ไม่ใช่ factory closure — ดูหมายเหตุที่จุด instantiate ใน dnd.js)
// ============================================================

// ---- factory: สร้าง instance ของระบบแลกเปลี่ยน พร้อม state ของตัวเอง ----
function createTrade({ findByWs, sendError, addLog, getPlayers, sanitizeBag, bagAdd, bagRemove, hasRoomForItems, bagCapacity }) {
  let trades = []; // [{id, fromId, toId, offerItems:[{name,qty}], offerGold, requestItems:[{name,qty}], requestGold}]
  let nextTradeId = 1;

  function sanitizeItemQtyList(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const it of raw.slice(0, 20)) {
      const name = (it && it.name || '').toString().trim().slice(0, 40);
      const qty = Math.max(0, Math.min(999, Math.round(Number(it && it.qty) || 0)));
      if (name && qty > 0) out.push({ name, qty });
    }
    return out;
  }
  function characterHasItemsAndGold(character, items, gold) {
    if ((character.gold || 0) < gold) return false;
    const bag = sanitizeBag(character.bag);
    for (const it of items) {
      const row = bag.find(b => b.name === it.name);
      if (!row || row.qty < it.qty) return false;
    }
    return true;
  }
  // สมมติว่าตรวจสอบ (characterHasItemsAndGold) ผ่านแล้วก่อนเรียกฟังก์ชันนี้เสมอ
  function applyItemsAndGoldTransfer(fromChar, toChar, items, gold) {
    if (gold > 0) {
      fromChar.gold = Math.max(0, (fromChar.gold || 0) - gold);
      toChar.gold = (toChar.gold || 0) + gold;
    }
    for (const it of items) {
      bagRemove(fromChar, it.name, it.qty);
      bagAdd(toChar, it.name, it.qty);
    }
  }
  function tradeSideText(items, gold) {
    const parts = [];
    if (gold) parts.push(`ทอง ${gold}`);
    for (const it of items) parts.push(`${it.name} x${it.qty}`);
    return parts.length ? parts.join(', ') : '(ไม่มี)';
  }
  // ข้อมูลข้อเสนอที่ส่งให้ client — DM เห็นทุกข้อเสนอในห้อง (เพื่อดูแลภาพรวม) ผู้เล่นเห็นเฉพาะที่เกี่ยวกับตัวเอง
  function tradesForPlayer(p) {
    const players = getPlayers();
    const relevant = p.isDM ? trades : trades.filter(t => t.fromId === p.id || t.toId === p.id);
    return relevant.map(t => {
      const fromP = players.find(pp => pp.id === t.fromId);
      const toP = players.find(pp => pp.id === t.toId);
      return {
        id: t.id, fromId: t.fromId, toId: t.toId,
        fromName: fromP ? (fromP.character.charName || fromP.name) : '???',
        toName: toP ? (toP.character.charName || toP.name) : '???',
        offerItems: t.offerItems, offerGold: t.offerGold,
        requestItems: t.requestItems, requestGold: t.requestGold,
      };
    });
  }
  function handleTradeOffer(ws, payload) {
    const p = findByWs(ws);
    if (!p || p.isDM || !payload || typeof payload !== 'object') return;
    if (!p.character.locked) { sendError(ws, 'ต้องสร้างการ์ดตัวละครก่อนถึงจะแลกเปลี่ยนไอเทมได้'); return; }
    const target = getPlayers().find(pp => pp.id === Number(payload.toId));
    if (!target || target.isDM || target.id === p.id) { sendError(ws, 'กรุณาเลือกเพื่อนร่วมทีมที่ถูกต้อง'); return; }
    if (!target.character.locked) { sendError(ws, `${target.name} ยังไม่ได้สร้างการ์ดตัวละคร`); return; }

    const offerItems = sanitizeItemQtyList(payload.offerItems);
    const offerGold = Math.max(0, Math.min(999999, Math.round(Number(payload.offerGold) || 0)));
    const requestItems = sanitizeItemQtyList(payload.requestItems);
    const requestGold = Math.max(0, Math.min(999999, Math.round(Number(payload.requestGold) || 0)));

    if (!offerItems.length && !offerGold && !requestItems.length && !requestGold) {
      sendError(ws, 'กรุณาเลือกไอเทมหรือทองอย่างน้อยฝั่งใดฝั่งหนึ่งก่อนส่งข้อเสนอ');
      return;
    }
    if (!characterHasItemsAndGold(p.character, offerItems, offerGold)) {
      sendError(ws, 'คุณมีไอเทมหรือทองที่จะเสนอให้ไม่พอ');
      return;
    }

    const trade = { id: nextTradeId++, fromId: p.id, toId: target.id, offerItems, offerGold, requestItems, requestGold };
    trades.push(trade);
    addLog(`🔄 ${p.character.charName || p.name} เสนอแลกเปลี่ยนกับ ${target.character.charName || target.name}: ให้ ${tradeSideText(offerItems, offerGold)} — ขอ ${tradeSideText(requestItems, requestGold)}`);
  }
  function handleTradeRespond(ws, tradeId, accept) {
    const p = findByWs(ws);
    if (!p) return;
    const idx = trades.findIndex(t => t.id === Number(tradeId));
    if (idx === -1) return;
    const trade = trades[idx];
    if (trade.toId !== p.id) { sendError(ws, 'คุณไม่ใช่ผู้รับข้อเสนอนี้'); return; }
    const fromP = getPlayers().find(pp => pp.id === trade.fromId);
    trades.splice(idx, 1);
    if (!accept) {
      addLog(`🔄 ${p.character.charName || p.name} ปฏิเสธข้อเสนอแลกเปลี่ยนจาก ${fromP ? (fromP.character.charName || fromP.name) : '???'}`);
      return;
    }
    if (!fromP) { sendError(ws, 'ผู้เสนอไม่อยู่ในห้องแล้ว ข้อเสนอนี้ใช้ไม่ได้'); return; }
    if (!characterHasItemsAndGold(fromP.character, trade.offerItems, trade.offerGold)) {
      sendError(ws, `${fromP.character.charName || fromP.name} มีของไม่พอแล้ว ข้อเสนอนี้ใช้ไม่ได้`);
      addLog(`🔄 การแลกเปลี่ยนล้มเหลว — ${fromP.character.charName || fromP.name} มีของไม่พอตามที่เสนอไว้`);
      return;
    }
    if (!characterHasItemsAndGold(p.character, trade.requestItems, trade.requestGold)) {
      sendError(ws, 'คุณมีของไม่พอสำหรับข้อเสนอนี้');
      addLog(`🔄 การแลกเปลี่ยนล้มเหลว — ${p.character.charName || p.name} มีของไม่พอตามที่ถูกขอ`);
      return;
    }
    if (!hasRoomForItems(p.character, trade.offerItems)) {
      sendError(ws, `กระเป๋าของคุณเต็มแล้ว (${bagCapacity} ช่อง) รับของจากข้อเสนอนี้ไม่ได้`);
      addLog(`🔄 การแลกเปลี่ยนล้มเหลว — กระเป๋าของ ${p.character.charName || p.name} เต็ม`);
      return;
    }
    if (!hasRoomForItems(fromP.character, trade.requestItems)) {
      sendError(ws, `กระเป๋าของ ${fromP.character.charName || fromP.name} เต็มแล้ว (${bagCapacity} ช่อง) แลกเปลี่ยนไม่ได้`);
      addLog(`🔄 การแลกเปลี่ยนล้มเหลว — กระเป๋าของ ${fromP.character.charName || fromP.name} เต็ม`);
      return;
    }
    // ซิงค์เข้ากระเป๋าของทั้งสองฝ่ายพร้อมกัน (เหมือนของที่ได้รับ/ซื้อมา)
    applyItemsAndGoldTransfer(fromP.character, p.character, trade.offerItems, trade.offerGold);
    applyItemsAndGoldTransfer(p.character, fromP.character, trade.requestItems, trade.requestGold);
    addLog(`✅ แลกเปลี่ยนสำเร็จ: ${fromP.character.charName || fromP.name} ↔ ${p.character.charName || p.name} (${fromP.character.charName || fromP.name} ให้ ${tradeSideText(trade.offerItems, trade.offerGold)} / ${p.character.charName || p.name} ให้ ${tradeSideText(trade.requestItems, trade.requestGold)})`);
  }
  function handleTradeCancel(ws, tradeId) {
    const p = findByWs(ws);
    if (!p) return;
    const idx = trades.findIndex(t => t.id === Number(tradeId));
    if (idx === -1) return;
    const trade = trades[idx];
    if (trade.fromId !== p.id && !p.isDM) return;
    trades.splice(idx, 1);
    addLog(`🔄 ยกเลิกข้อเสนอแลกเปลี่ยน #${trade.id}`);
  }

  // ใช้ตอน dndHandleRestart — รีเซตกลับค่าเริ่มต้น
  function reset() {
    trades = [];
    nextTradeId = 1;
  }

  // ใช้ตอน dndSerializeState — ส่วนหนึ่งของไฟล์เซฟ
  function serialize() {
    return { trades, nextTradeId };
  }

  // ใช้ตอน dndHandleImportState — โหลดค่ากลับจากไฟล์เซฟ
  function restore(data) {
    trades = Array.isArray(data && data.trades) ? data.trades : [];
    nextTradeId = Number.isFinite(Number(data && data.nextTradeId)) ? Number(data.nextTradeId) : 1;
  }

  return {
    tradesForPlayer,
    handleTradeOffer,
    handleTradeRespond,
    handleTradeCancel,
    reset,
    serialize,
    restore,
  };
}

module.exports = {
  createTrade,
};
