// ============================================================
// กระเป๋าไอเทม (Bag/Inventory) — แยกออกมาจาก server/dnd.js
// รับ ctx (state + helper ที่จำเป็น) จาก dnd.js แล้วคืนฟังก์ชันที่เกี่ยวกับกระเป๋าทั้งหมด
// ============================================================

module.exports = function createBagModule(ctx) {
  // ---- กระเป๋าไอเทมที่ซื้อจากร้านค้า: [{name, qty}] — แยกจากช่องไอเทม/กระเป๋าแบบข้อความอิสระตอนสร้างตัวละคร ----
  function dndSanitizeBag(raw) {
    const arr = Array.isArray(raw) ? raw : [];
    const out = [];
    for (const it of arr) {
      if (!it || typeof it !== 'object') continue;
      const name = (it.name || '').toString().trim().slice(0, 40);
      const qty = Math.max(0, Math.min(9999, Math.round(Number(it.qty) || 0)));
      if (name && qty > 0) out.push({ name, qty });
    }
    return out;
  }

  // เช็คว่ากระเป๋ายังมีที่ว่างพอสำหรับไอเทมชื่อนี้ไหม — ถ้ามีไอเทมชื่อนี้อยู่แล้วถือว่ามีที่เสมอ (กองรวมช่องเดิม ไม่กินช่องเพิ่ม)
  // ถ้าเป็นไอเทมชนิดใหม่ ต้องดูว่าจำนวนช่องที่ใช้อยู่ยังไม่เต็ม DND_BAG_CAPACITY
  function dndBagHasRoomFor(character, name) {
    const bag = dndSanitizeBag(character.bag);
    if (bag.some(it => it.name === name)) return true;
    return bag.length < ctx.DND_BAG_CAPACITY;
  }

  // เพิ่มไอเทมเข้ากระเป๋า — คืนค่า true ถ้าเพิ่มสำเร็จ, false ถ้ากระเป๋าเต็ม (ช่องไอเทมไม่พอสำหรับไอเทมชนิดใหม่) แล้วไม่ได้แก้ไขอะไร
  // force: true = บังคับเพิ่มแม้กระเป๋าเต็ม (ใช้เฉพาะตอนถอดของสวมใส่คืนกระเป๋า กันไม่ให้ไอเทมที่ใส่อยู่แล้วหายไปเฉยๆ เพราะกระเป๋าเต็มพอดี)
  function dndBagAdd(character, name, qty, force) {
    character.bag = dndSanitizeBag(character.bag);
    const row = character.bag.find(it => it.name === name);
    if (row) { row.qty += qty; return true; }
    if (!force && character.bag.length >= ctx.DND_BAG_CAPACITY) return false;
    character.bag.push({ name, qty });
    return true;
  }

  // คืน true ถ้าลบสำเร็จ (มีของพอให้ลบ), false ถ้าของไม่พอ
  function dndBagRemove(character, name, qty) {
    character.bag = dndSanitizeBag(character.bag);
    const row = character.bag.find(it => it.name === name);
    if (!row || row.qty < qty) return false;
    row.qty -= qty;
    if (row.qty <= 0) character.bag = character.bag.filter(it => it !== row);
    return true;
  }

  // เช็คว่ากระเป๋ายังมีที่ว่างพอรับไอเทมชุดนี้ทั้งหมดไหม (ใช้ก่อนยืนยันเทรด — นับเฉพาะไอเทมชนิดใหม่ที่ยังไม่มีในกระเป๋า)
  function dndCharacterHasRoomForItems(character, items) {
    const bag = dndSanitizeBag(character.bag);
    const existingNames = new Set(bag.map(it => it.name));
    const newNames = new Set();
    for (const it of items) if (!existingNames.has(it.name)) newNames.add(it.name);
    return bag.length + newNames.size <= ctx.DND_BAG_CAPACITY;
  }

  // DM มอบไอเทมให้ผู้เล่นคนไหนก็ได้โดยตรง — ซิงค์เข้ากระเป๋าทันทีเหมือนซื้อจากร้าน (ไม่หักทองใคร)
  function dndHandleGiveItem(ws, targetId, name, qty) {
    const p = ctx.dndFindByWs(ws);
    if (!p || !p.isDM) return;
    const target = ctx.dndPlayers.find(pp => pp.id === Number(targetId) && !pp.isDM);
    if (!target) { ctx.dndSendError(ws, 'ไม่พบผู้เล่นเป้าหมาย'); return; }
    const cleanName = (name || '').toString().trim().slice(0, 40);
    const cleanQty = Math.max(1, Math.min(999, Math.round(Number(qty) || 0)));
    if (!cleanName) { ctx.dndSendError(ws, 'กรุณากรอกชื่อไอเทม'); return; }
    if (!dndBagHasRoomFor(target.character, cleanName)) {
      ctx.dndSendError(ws, `กระเป๋าของ ${target.character.charName || target.name} เต็มแล้ว (${ctx.DND_BAG_CAPACITY} ช่อง) มอบไอเทมไม่ได้`);
      return;
    }
    dndBagAdd(target.character, cleanName, cleanQty);
    ctx.dndAddLog(`🎁 DM มอบ ${cleanName} x${cleanQty} ให้ ${target.character.charName || target.name}`, [p.id, target.id]);
  }

  // DM เรียกคืนไอเทมจากผู้เล่นคนไหนก็ได้โดยตรง
  function dndHandleTakeItem(ws, targetId, name, qty) {
    const p = ctx.dndFindByWs(ws);
    if (!p || !p.isDM) return;
    const target = ctx.dndPlayers.find(pp => pp.id === Number(targetId) && !pp.isDM);
    if (!target) { ctx.dndSendError(ws, 'ไม่พบผู้เล่นเป้าหมาย'); return; }
    const cleanName = (name || '').toString().trim().slice(0, 40);
    const cleanQty = Math.max(1, Math.min(999, Math.round(Number(qty) || 0)));
    if (!cleanName) { ctx.dndSendError(ws, 'กรุณากรอกชื่อไอเทม'); return; }
    if (!dndBagRemove(target.character, cleanName, cleanQty)) {
      ctx.dndSendError(ws, `${target.character.charName || target.name} มี ${cleanName} ไม่ถึง ${cleanQty} ชิ้น เรียกคืนไม่ได้`);
      return;
    }
    ctx.dndAddLog(`🗑️ DM เรียกคืน ${cleanName} x${cleanQty} จาก ${target.character.charName || target.name}`);
  }

  return {
    dndSanitizeBag,
    dndBagHasRoomFor,
    dndBagAdd,
    dndBagRemove,
    dndCharacterHasRoomForItems,
    dndHandleGiveItem,
    dndHandleTakeItem,
  };
};
