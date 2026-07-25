// ============================================================
// ไอเทมใช้งานได้ (Item Effects) — แยกออกมาจาก server/dnd.js
// รับ ctx (state + helper ที่จำเป็น รวมถึงฟังก์ชันกระเป๋าจาก bag.js) จาก dnd.js
// ============================================================

module.exports = function createItemModule(ctx) {
  // ลงทะเบียนไอเทมสวมใส่เริ่มต้นให้เป็น "ไอเทมใช้งานได้" (itemEffects ชนิด equip) โดยอัตโนมัติ ถ้ายังไม่เคยมีชื่อนี้มาก่อน
  // ทำให้พอผู้เล่นถอดไอเทมเริ่มต้นเก็บเข้ากระเป๋าแล้ว จะมีปุ่ม "ใช้" ให้กดสวมใส่กลับได้เสมอ (ไม่ต้องรอ DM มาตั้งค่าไอเทมนี้เอง)
  function dndEnsureStarterItemEffect(slot, gear) {
    if (!gear || !gear.name) return;
    if (ctx.itemEffects.some(e => e.name === gear.name)) return;
    ctx.itemEffects.push({
      id: ctx.nextItemEffectId++,
      name: gear.name,
      effectType: 'equip',
      value: 0,
      desc: 'ไอเทมสวมใส่เริ่มต้นประจำคลาส — ใช้เพื่อสวมใส่กลับได้หลังถอด',
      slot,
      atk: gear.atk,
      def: gear.def,
      maxDurability: gear.maxDurability,
      icon: '',
    });
  }

  // เดิมไอเทม "Red Potion (ยาแดง)" ในร้านค้าเริ่มต้นมีแค่คำอธิบายว่าฟื้นฟู HP แต่ไม่เคยมีการตั้งค่าผล (itemEffects) มาคู่กันจริง ๆ
  // ทำให้ซื้อมาแล้วกดใช้ไม่ได้ (ไม่มีปุ่ม "ใช้" ขึ้นเลย) — เพิ่มค่าเริ่มต้นตรงนี้ให้ตรงชื่อกันเป๊ะ ๆ จะได้ใช้ฟื้นฟู/ชุบ HP ได้จริงตั้งแต่แรก
  function dndDefaultItemEffectsInit() {
    return [{
      id: ctx.nextItemEffectId++, name: 'Red Potion (ยาแดง)', effectType: 'heal', value: 20,
      desc: 'ฟื้นฟู HP 20 หน่วย (ใช้กับคนหมดสติไม่ได้ ต้องใช้ไอเทมชุบชีวิตแทน)',
      slot: 'weapon', atk: 0, def: 0, maxDurability: 0, icon: '',
    }];
  }

  // ---- ไอเทมใช้งานได้: DM กำหนดชื่อ + ผล (ฟื้นฟู HP / ชุบชีวิต / ให้ทอง / สวมใส่อุปกรณ์) — ชื่อต้องตรงกับชื่อไอเทมในกระเป๋าผู้เล่นเป๊ะๆ ถึงจะมีปุ่ม "ใช้" ----
  // "heal" ฟื้นฟู HP ได้เฉพาะเป้าหมายที่ยังไม่หมดสติเท่านั้น (ปลุกคนหมดสติไม่ได้) — ต้องเป็น "revive" เท่านั้นที่ DM สร้างขึ้นมาโดยเฉพาะ ถึงจะใช้ชุบชีวิตคนหมดสติได้
  function dndSanitizeItemEffect(raw) {
    const r = (raw && typeof raw === 'object') ? raw : {};
    const name = (r.name || '').toString().trim().slice(0, 40);
    const effectType = ctx.DND_ITEM_EFFECT_TYPES.includes(r.effectType) ? r.effectType : 'heal';
    const value = Math.max(0, Math.min(99999, Math.round(Number(r.value) || 0)));
    const desc = (r.desc || '').toString().trim().slice(0, 100);
    const slot = ctx.DND_EQUIP_SLOTS.includes(r.slot) ? r.slot : 'weapon';
    const atk = Math.max(0, Math.min(999, Math.round(Number(r.atk) || 0)));
    const def = Math.max(0, Math.min(999, Math.round(Number(r.def) || 0)));
    const maxDurability = Math.max(0, Math.min(999, Math.round(Number(r.maxDurability) || 0)));
    const icon = ctx.dndSanitizeEquipIcon(r.icon);
    return { name, effectType, value, desc, slot, atk, def, maxDurability, icon };
  }

  function dndItemEffectLogText(item) {
    if (item.effectType === 'heal') return `ฟื้นฟู HP ${item.value} (ปลุกคนหมดสติไม่ได้)`;
    if (item.effectType === 'revive') return `🌟 ชุบชีวิต + ฟื้นฟู HP ${item.value}`;
    if (item.effectType === 'gold') return `ได้ทอง ${item.value}`;
    if (item.effectType === 'none') return item.desc ? `ไม่มีผลพิเศษ — ${item.desc}` : 'ไม่มีผลพิเศษ (ใช้แล้วหายไป)';
    const slotLabel = ctx.DND_EQUIP_SLOT_LABELS[item.slot] || item.slot;
    return `สวมใส่เป็น${slotLabel} (ATK+${item.atk} / DEF+${item.def}${item.maxDurability > 0 ? ` / ทน ${item.maxDurability}` : ''})`;
  }

  function dndHandleItemEffectCreate(ws, payload) {
    const p = ctx.dndFindByWs(ws);
    if (!p || !p.isDM || !payload || typeof payload !== 'object') return;
    const item = dndSanitizeItemEffect(payload);
    if (!item.name) { ctx.dndSendError(ws, 'กรุณาตั้งชื่อไอเทม (ต้องตรงกับชื่อไอเทมในกระเป๋าผู้เล่นเป๊ะๆ)'); return; }
    ctx.itemEffects.push(Object.assign({ id: ctx.nextItemEffectId++ }, item));
    ctx.dndAddLog(`⚙️ DM ตั้งค่าไอเทมใช้งาน "${item.name}" (${dndItemEffectLogText(item)})`);
  }

  // อุปกรณ์สวมใส่ที่ถูกกำหนดโดยไม่ผ่านแผงตั้งค่าไอเทมของ DM (เช่น ตอนสร้างตัวละคร หรือ DM มอบอุปกรณ์ให้ตรงๆ)
  // จะไม่มีนิยามผลไอเทมอยู่ใน itemEffects เลย ทำให้พอถอดออกไปเก็บกระเป๋าแล้ว กดปุ่ม "ใช้" เพื่อสวมกลับไม่ได้
  // (ปุ่มใช้จะไม่ขึ้นด้วยซ้ำ เพราะ client เช็คว่ามีนิยามไอเทมจับคู่ชื่อก่อนถึงจะโชว์ปุ่ม) — ฟังก์ชันนี้ลงทะเบียนนิยามให้อัตโนมัติ
  // เพื่อให้ผู้เล่นกดใช้สวมใส่กลับเองได้เสมอ โดยไม่ทับนิยามเดิมถ้า DM เคยตั้งชื่อนี้ไว้ในระบบไอเทมแล้ว (กันของที่ DM ปรับแต่งเองถูกเขียนทับ)
  function dndAutoRegisterEquipItemEffect(name, item, slot) {
    const cleanName = (name || '').toString().trim().slice(0, 40);
    if (!cleanName || !slot) return;
    if (ctx.itemEffects.some(e => e.name === cleanName)) return;
    ctx.itemEffects.push({
      id: ctx.nextItemEffectId++,
      name: cleanName,
      effectType: 'equip',
      value: 0,
      desc: '',
      slot,
      atk: Math.max(0, Math.min(999, Math.round(Number(item && item.atk) || 0))),
      def: Math.max(0, Math.min(999, Math.round(Number(item && item.def) || 0))),
      maxDurability: Math.max(0, Math.min(999, Math.round(Number(item && item.maxDurability) || 0))),
      icon: ctx.dndSanitizeEquipIcon(item && item.icon),
    });
  }

  function dndHandleItemEffectEdit(ws, id, payload) {
    const p = ctx.dndFindByWs(ws);
    if (!p || !p.isDM || !payload || typeof payload !== 'object') return;
    const idx = ctx.itemEffects.findIndex(e => e.id === Number(id));
    if (idx === -1) return;
    ctx.itemEffects[idx] = Object.assign({ id: ctx.itemEffects[idx].id }, dndSanitizeItemEffect(payload));
    ctx.dndBroadcastState();
  }

  function dndHandleItemEffectDelete(ws, id) {
    const p = ctx.dndFindByWs(ws);
    if (!p || !p.isDM) return;
    ctx.itemEffects = ctx.itemEffects.filter(e => e.id !== Number(id));
    ctx.dndBroadcastState();
  }

  // ผู้เล่นกดปุ่ม "ใช้" ไอเทมในกระเป๋าของตัวเอง — ต้องมีของจริงในกระเป๋า และมีนิยามผลของไอเทมนั้นจาก DM ไว้แล้ว
  // targetId ใส่มาเมื่อใช้ไอเทม "ฟื้นฟู HP" กับเพื่อนร่วมทีมคนอื่นแทนตัวเอง (เช่นเพื่อนหมดสติอยู่ ต้องให้อีกคนใช้ไอเทมชุบให้)
  // ไอเทมประเภท gold/equip ยังคงใช้กับตัวเองได้อย่างเดียวเหมือนเดิม (ไม่รับ targetId)
  function dndHandleUseItem(ws, name, targetId) {
    const p = ctx.dndFindByWs(ws);
    if (!p || p.isDM) return;
    if (ctx.dndIsCharDead(p.character)) { ctx.dndSendError(ws, ctx.DND_DEAD_MSG); return; } // คนหมดสติใช้ไอเทมเองไม่ได้ ต้องรอให้คนอื่นใช้ให้
    const cleanName = (name || '').toString().trim().slice(0, 40);
    if (!cleanName) return;
    const c = p.character;
    const def = ctx.itemEffects.find(e => e.name === cleanName);
    if (!def) { ctx.dndSendError(ws, `"${cleanName}" ไม่ใช่ไอเทมใช้งานได้ (DM ยังไม่ได้ตั้งค่าผลของมัน)`); return; }

    let targetPlayer = p;
    if ((def.effectType === 'heal' || def.effectType === 'revive') && targetId != null && Number(targetId) !== p.id) {
      const found = ctx.dndPlayers.find(pp => pp.id === Number(targetId) && !pp.isDM);
      if (!found) { ctx.dndSendError(ws, 'ไม่พบเป้าหมายที่จะใช้ไอเทมด้วย'); return; }
      targetPlayer = found;
    }
    const tc = targetPlayer.character;
    const targetName = tc.charName || targetPlayer.name;
    const wasDead = ctx.dndIsCharDead(tc);
    // ไอเทมประเภท "ฟื้นฟู HP" ธรรมดาใช้ปลุกคนหมดสติไม่ได้เด็ดขาด — ต้องเป็นไอเทม "ชุบชีวิต" ที่ DM สร้างขึ้นมาโดยเฉพาะเท่านั้น
    if (def.effectType === 'heal' && wasDead) {
      ctx.dndSendError(ws, `ไอเทม "${cleanName}" ฟื้นฟู HP เท่านั้น ใช้ปลุก ${targetName} ที่หมดสติไม่ได้ — ต้องใช้ไอเทมชุบชีวิตแทน (ให้ DM ตั้งค่าไอเทมประเภท "ชุบชีวิต")`);
      return;
    }

    if (!ctx.dndBagRemove(c, cleanName, 1)) { ctx.dndSendError(ws, `คุณไม่มี "${cleanName}" ในกระเป๋า`); return; }
    let resultText = '';
    if (def.effectType === 'heal') {
      const oldHp = tc.hp;
      tc.hp = Math.max(0, Math.min(tc.maxHp, tc.hp + def.value));
      resultText = `❤️ HP ${oldHp} → ${tc.hp}`;
    } else if (def.effectType === 'revive') {
      const oldHp = tc.hp;
      let newHp = Math.max(0, Math.min(tc.maxHp, tc.hp + def.value));
      if (wasDead && newHp <= 0) newHp = Math.min(tc.maxHp, 1); // ไอเทมชุบชีวิตต้องปลุกได้จริงอย่างน้อย 1 HP แม้ DM ตั้งค่าฟื้นฟูไว้น้อยไป
      tc.hp = newHp;
      resultText = `❤️ HP ${oldHp} → ${tc.hp}`;
      if (wasDead && tc.hp > 0) resultText += ` — 🌟 ฟื้นจากหมดสติแล้ว!`;
    } else if (def.effectType === 'gold') {
      c.gold = (c.gold || 0) + def.value;
      resultText = `💰 ได้ทอง ${def.value}`;
    } else if (def.effectType === 'equip') {
      c.equipment = ctx.dndSanitizeEquipment(c.equipment);
      const slot = def.slot;
      const oldItem = c.equipment[slot];
      // ถ้าช่องนั้นมีของสวมอยู่แล้ว คืนของเก่ากลับเข้ากระเป๋าก่อนสวมของใหม่ ไม่ให้ของหาย
      if (oldItem && oldItem.name) ctx.dndBagAdd(c, oldItem.name, 1, true); // force: กันของที่สวมอยู่หายเพราะกระเป๋าเต็มพอดี
      c.equipment[slot] = { name: cleanName, atk: def.atk, def: def.def, durability: def.maxDurability, maxDurability: def.maxDurability, icon: def.icon || '' };
      const slotLabel = ctx.DND_EQUIP_SLOT_LABELS[slot] || slot;
      resultText = `🛡️ สวมใส่เป็น${slotLabel}${oldItem && oldItem.name ? ` (ถอด "${oldItem.name}" เก็บเข้ากระเป๋า)` : ''}`;
    } else if (def.effectType === 'none') {
      // ไม่มีผลกลไกอะไร — แค่ใช้แล้วไอเทมหายไป 1 ชิ้น (เหมาะกับของกินเล่น/ไอเทมภารกิจ/ของสะสม) ถ้า DM ใส่คำอธิบายไว้จะโชว์ในแชทด้วย
      resultText = def.desc ? `📦 ${def.desc}` : '📦 ใช้แล้ว (ไม่มีผลพิเศษ)';
    }
    if (targetPlayer === p) ctx.dndAddLog(`🧪 ${c.charName || p.name} ใช้ "${cleanName}": ${resultText}`);
    else ctx.dndAddLog(`🧪 ${c.charName || p.name} ใช้ "${cleanName}" ให้ ${targetName}: ${resultText}`);
  }

  // ไอเทมที่มีการกำหนด maxDurability ไว้ และคงทนหมดแล้ว (durability <= 0) ถือว่า "ชำรุด" ใช้ atk/def ไม่ได้แล้ว
  // ไอเทมที่ maxDurability = 0 (ไม่ได้ตั้งค่าคงทนไว้) ถือว่าไม่ระบบคงทน ใช้งานได้ปกติเสมอ
  function dndEquipSlotBroken(item) {
    return !!(item && item.maxDurability > 0 && item.durability <= 0);
  }

  return {
    dndEnsureStarterItemEffect,
    dndDefaultItemEffectsInit,
    dndSanitizeItemEffect,
    dndItemEffectLogText,
    dndHandleItemEffectCreate,
    dndAutoRegisterEquipItemEffect,
    dndHandleItemEffectEdit,
    dndHandleItemEffectDelete,
    dndHandleUseItem,
    dndEquipSlotBroken,
  };
};
