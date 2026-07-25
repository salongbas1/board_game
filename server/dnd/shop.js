// ============================================================
// ร้านค้า (Shop/Forge) — แยกออกมาจาก server/dnd.js
// รับ ctx (state + helper ที่จำเป็น รวมถึงฟังก์ชันกระเป๋าจาก bag.js) จาก dnd.js
// ============================================================

module.exports = function createShopModule(ctx) {
  // ---- ร้านค้า: DM สร้าง/แก้ไขไอเทมในร้าน — ผู้เล่นซื้อ/ขายคืนด้วยทอง ----
  function dndSanitizeShopItem(raw) {
    const r = (raw && typeof raw === 'object') ? raw : {};
    const name = (r.name || '').toString().trim().slice(0, 40) || 'ไอเทม';
    const price = Math.max(0, Math.min(999999, Math.round(Number(r.price) || 0)));
    const desc = (r.desc || '').toString().trim().slice(0, 150);
    let stock = null;
    if (r.stock !== null && r.stock !== undefined && r.stock !== '') {
      const n = Math.max(0, Math.min(9999, Math.round(Number(r.stock) || 0)));
      if (Number.isFinite(n)) stock = n;
    }
    return { name, price, desc, stock };
  }

  function dndDefaultShopItems() {
    return [Object.assign({ id: ctx.nextShopItemId++ }, dndSanitizeShopItem({
      name: 'Red Potion (ยาแดง)', price: 20, desc: 'ดื่มแล้วฟื้นฟู HP ให้ตัวละคร', stock: null,
    }))];
  }

  // ---- ร้านตีบวก: DM สร้างร้านประเภท "forge" — ผู้เล่นเลือกอุปกรณ์ที่สวมใส่อยู่มาตีบวกทีละขั้นด้วยทอง ----
  // นโยบายเมื่อตีบวกพลาด: safe = ไม่มีอะไรเกิดขึ้นนอกจากเสียทอง, downgrade = ระดับตีบวกลดลง 1 ขั้น, break = ไอเทมพัง (รีเซตโบนัสตีบวกทั้งหมดกลับเป็น +0)
  function dndSanitizeForgeTier(raw) {
    const r = (raw && typeof raw === 'object') ? raw : {};
    const name = (r.name || '').toString().trim().slice(0, 40) || 'ตีบวก';
    const cost = Math.max(0, Math.min(999999, Math.round(Number(r.cost) || 0)));
    let successRate = Math.round(Number(r.successRate));
    if (!Number.isFinite(successRate)) successRate = 100;
    successRate = Math.max(1, Math.min(100, successRate));
    const atkBonus = Math.max(0, Math.min(999, Math.round(Number(r.atkBonus) || 0)));
    const defBonus = Math.max(0, Math.min(999, Math.round(Number(r.defBonus) || 0)));
    const failPolicy = ctx.DND_FORGE_FAIL_POLICIES.includes(r.failPolicy) ? r.failPolicy : 'safe';
    const desc = (r.desc || '').toString().trim().slice(0, 150);
    return { name, cost, successRate, atkBonus, defBonus, failPolicy, desc };
  }

  function dndDefaultForgeItems() {
    return [
      Object.assign({ id: ctx.nextShopItemId++ }, dndSanitizeForgeTier({
        name: '+1', cost: 30, successRate: 90, atkBonus: 1, defBonus: 1, failPolicy: 'safe', desc: 'ระดับแรก ความเสี่ยงต่ำ',
      })),
      Object.assign({ id: ctx.nextShopItemId++ }, dndSanitizeForgeTier({
        name: '+2', cost: 60, successRate: 75, atkBonus: 1, defBonus: 1, failPolicy: 'safe', desc: '',
      })),
      Object.assign({ id: ctx.nextShopItemId++ }, dndSanitizeForgeTier({
        name: '+3', cost: 100, successRate: 50, atkBonus: 2, defBonus: 2, failPolicy: 'downgrade', desc: 'เริ่มเสี่ยงตกระดับถ้าพลาด',
      })),
    ];
  }

  function dndHandleShopCreate(ws, name, type) {
    const p = ctx.dndFindByWs(ws);
    if (!p) { ctx.dndSendError(ws, 'ไม่พบข้อมูลผู้เล่นของคุณในห้องนี้ ลองเข้าห้องใหม่อีกครั้ง'); return; }
    if (!p.isDM) { ctx.dndSendError(ws, 'เฉพาะ DM เท่านั้นที่เปิดร้านค้าได้'); return; }
    const shopType = type === 'forge' ? 'forge' : 'item';
    const cleanName = (name || '').toString().trim().slice(0, 40)
      || (shopType === 'forge' ? `ร้านตีบวก ${ctx.shops.length + 1}` : `ร้านค้า ${ctx.shops.length + 1}`);
    ctx.shops.push({
      id: ctx.nextShopId++, name: cleanName, type: shopType, closed: false,
      items: shopType === 'forge' ? dndDefaultForgeItems() : dndDefaultShopItems(),
    });
    ctx.dndAddLog(`🏪 DM เปิด${shopType === 'forge' ? 'ร้านตีบวก' : 'ร้านค้า'}ใหม่: "${cleanName}"`);
  }

  function dndHandleShopRename(ws, shopId, name) {
    const p = ctx.dndFindByWs(ws);
    if (!p) { ctx.dndSendError(ws, 'ไม่พบข้อมูลผู้เล่นของคุณในห้องนี้ ลองเข้าห้องใหม่อีกครั้ง'); return; }
    if (!p.isDM) { ctx.dndSendError(ws, 'เฉพาะ DM เท่านั้นที่แก้ไขร้านค้าได้'); return; }
    const shop = ctx.shops.find(s => s.id === Number(shopId));
    if (!shop) { ctx.dndSendError(ws, 'ไม่พบร้านค้านี้แล้ว'); return; }
    const cleanName = (name || '').toString().trim().slice(0, 40);
    if (cleanName) shop.name = cleanName;
    ctx.dndBroadcastState();
  }

  // ปิด/เปิดร้านชั่วคราว — ไม่ลบไอเทมในร้านทิ้ง แค่ซ่อนร้านจากมุมมองผู้เล่น (DM ยังเห็น/จัดการ/เปิดกลับได้เสมอ)
  // แยกออกจาก dndHandleShopDelete โดยเจตนา เพราะการ "ปิดร้าน" ไม่ควรทำให้ไอเทมที่ตั้งค่าไว้หายไปถาวร
  function dndHandleShopToggleClosed(ws, shopId) {
    const p = ctx.dndFindByWs(ws);
    if (!p) { ctx.dndSendError(ws, 'ไม่พบข้อมูลผู้เล่นของคุณในห้องนี้ ลองเข้าห้องใหม่อีกครั้ง'); return; }
    if (!p.isDM) { ctx.dndSendError(ws, 'เฉพาะ DM เท่านั้นที่ปิด/เปิดร้านค้าได้'); return; }
    const shop = ctx.shops.find(s => s.id === Number(shopId));
    if (!shop) { ctx.dndSendError(ws, 'ไม่พบร้านค้านี้แล้ว'); return; }
    shop.closed = !shop.closed;
    ctx.dndAddLog(shop.closed ? `🔒 DM ปิดร้าน "${shop.name}" ชั่วคราว (ไอเทมในร้านยังอยู่ครบ เปิดกลับได้ทุกเมื่อ)` : `🔓 DM เปิดร้าน "${shop.name}" กลับมาขายอีกครั้ง`);
  }

  // ลบร้านค้าออกจากห้องอย่างถาวร — ไอเทมทั้งหมดในร้านจะหายไปด้วย กู้คืนไม่ได้ ใช้เมื่อไม่ต้องการร้านนี้อีกแล้วจริงๆ เท่านั้น
  function dndHandleShopDelete(ws, shopId) {
    const p = ctx.dndFindByWs(ws);
    if (!p) { ctx.dndSendError(ws, 'ไม่พบข้อมูลผู้เล่นของคุณในห้องนี้ ลองเข้าห้องใหม่อีกครั้ง'); return; }
    if (!p.isDM) { ctx.dndSendError(ws, 'เฉพาะ DM เท่านั้นที่ลบร้านค้าได้'); return; }
    const idx = ctx.shops.findIndex(s => s.id === Number(shopId));
    if (idx === -1) { ctx.dndSendError(ws, 'ไม่พบร้านค้านี้แล้ว'); return; }
    const [removed] = ctx.shops.splice(idx, 1);
    ctx.dndAddLog(`🗑️ DM ลบร้านค้า "${removed.name}" ออกจากห้องอย่างถาวร (ไอเทมในร้านหายไปทั้งหมด)`);
  }

  function dndHandleShopItemAdd(ws, shopId, payload) {
    const p = ctx.dndFindByWs(ws);
    if (!p) { ctx.dndSendError(ws, 'ไม่พบข้อมูลผู้เล่นของคุณในห้องนี้ ลองเข้าห้องใหม่อีกครั้ง'); return; }
    if (!p.isDM) { ctx.dndSendError(ws, 'เฉพาะ DM เท่านั้นที่เพิ่มไอเทมในร้านได้'); return; }
    if (!payload || typeof payload !== 'object') return;
    const shop = ctx.shops.find(s => s.id === Number(shopId));
    if (!shop) { ctx.dndSendError(ws, 'ไม่พบร้านค้านี้แล้ว'); return; }
    const cleanItem = shop.type === 'forge' ? dndSanitizeForgeTier(payload) : dndSanitizeShopItem(payload);
    shop.items.push(Object.assign({ id: ctx.nextShopItemId++ }, cleanItem));
    ctx.dndBroadcastState();
  }

  function dndHandleShopItemEdit(ws, shopId, itemId, payload) {
    const p = ctx.dndFindByWs(ws);
    if (!p) { ctx.dndSendError(ws, 'ไม่พบข้อมูลผู้เล่นของคุณในห้องนี้ ลองเข้าห้องใหม่อีกครั้ง'); return; }
    if (!p.isDM) { ctx.dndSendError(ws, 'เฉพาะ DM เท่านั้นที่แก้ไขไอเทมในร้านได้'); return; }
    if (!payload || typeof payload !== 'object') return;
    const shop = ctx.shops.find(s => s.id === Number(shopId));
    if (!shop) { ctx.dndSendError(ws, 'ไม่พบร้านค้านี้แล้ว'); return; }
    const idx = shop.items.findIndex(it => it.id === Number(itemId));
    if (idx === -1) { ctx.dndSendError(ws, 'ไม่พบไอเทมนี้แล้ว'); return; }
    const cleanItem = shop.type === 'forge' ? dndSanitizeForgeTier(payload) : dndSanitizeShopItem(payload);
    shop.items[idx] = Object.assign({ id: shop.items[idx].id }, cleanItem);
    ctx.dndBroadcastState();
  }

  function dndHandleShopItemDelete(ws, shopId, itemId) {
    const p = ctx.dndFindByWs(ws);
    if (!p) { ctx.dndSendError(ws, 'ไม่พบข้อมูลผู้เล่นของคุณในห้องนี้ ลองเข้าห้องใหม่อีกครั้ง'); return; }
    if (!p.isDM) { ctx.dndSendError(ws, 'เฉพาะ DM เท่านั้นที่ลบไอเทมในร้านได้'); return; }
    const shop = ctx.shops.find(s => s.id === Number(shopId));
    if (!shop) { ctx.dndSendError(ws, 'ไม่พบร้านค้านี้แล้ว'); return; }
    shop.items = shop.items.filter(it => it.id !== Number(itemId));
    ctx.dndBroadcastState();
  }

  // ผู้เล่น (ไม่ใช่ DM) ซื้อไอเทม 1 ชิ้นจากร้าน — จ่ายทอง ได้ของเข้ากระเป๋า ลดสต็อกถ้าร้านจำกัดจำนวนไว้
  function dndHandleShopBuy(ws, shopId, itemId) {
    const p = ctx.dndFindByWs(ws);
    if (!p || p.isDM) return;
    const shop = ctx.shops.find(s => s.id === Number(shopId));
    const item = shop && shop.items.find(it => it.id === Number(itemId));
    if (!item) return;
    if (item.stock !== null && item.stock <= 0) { ctx.dndSendError(ws, `${item.name} ในร้านหมดแล้ว`); return; }
    const c = p.character;
    if ((c.gold || 0) < item.price) { ctx.dndSendError(ws, `ทองไม่พอซื้อ ${item.name} (ต้องการ ${item.price}, มี ${c.gold || 0})`); return; }
    if (!ctx.dndBagHasRoomFor(c, item.name)) { ctx.dndSendError(ws, `กระเป๋าเต็มแล้ว (${ctx.DND_BAG_CAPACITY} ช่อง) ซื้อ ${item.name} ไม่ได้ ลองใช้หรือขายไอเทมอื่นก่อน`); return; }
    c.gold = (c.gold || 0) - item.price;
    ctx.dndBagAdd(c, item.name, 1);
    if (item.stock !== null) item.stock -= 1;
    ctx.dndAddLog(`🛒 ${c.charName || p.name} ซื้อ ${item.name} จากร้าน "${shop.name}" ด้วยทอง ${item.price}`);
  }

  // ผู้เล่นขายไอเทมที่ถืออยู่คืนให้ร้าน (ต้องเป็นไอเทมชื่อเดียวกับที่ร้านนี้ขาย) ได้ทองครึ่งราคาป้ายของร้าน
  function dndHandleShopSell(ws, shopId, itemId) {
    const p = ctx.dndFindByWs(ws);
    if (!p || p.isDM) return;
    const shop = ctx.shops.find(s => s.id === Number(shopId));
    const item = shop && shop.items.find(it => it.id === Number(itemId));
    if (!item) return;
    const c = p.character;
    if (!ctx.dndBagRemove(c, item.name, 1)) { ctx.dndSendError(ws, `คุณไม่มี ${item.name} ให้ขาย`); return; }
    const sellPrice = Math.floor(item.price / 2);
    c.gold = (c.gold || 0) + sellPrice;
    if (item.stock !== null) item.stock += 1;
    ctx.dndAddLog(`💰 ${c.charName || p.name} ขาย ${item.name} คืนให้ร้าน "${shop.name}" ได้ทอง ${sellPrice}`);
  }

  // ผู้เล่น (ไม่ใช่ DM) ตีบวกอุปกรณ์ที่สวมใส่อยู่ 1 ช่อง ที่ร้านตีบวกของ DM — จ่ายทองตามระดับถัดไป แล้วทอยโอกาสสำเร็จ
  // สำเร็จ: ระดับตีบวก (plus) +1 และได้โบนัส atk/def สะสมถาวรตามที่ DM ตั้งไว้ในระดับนี้
  // พลาด: เสียทองไปฟรี แล้วเป็นไปตามนโยบายที่ DM ตั้งไว้ต่อระดับ (ไม่มีอะไร / ตกระดับ / ไอเทมพังรีเซตโบนัสทั้งหมด)
  function dndHandleForgeAttempt(ws, shopId, slot) {
    const p = ctx.dndFindByWs(ws);
    if (!p || p.isDM) return;
    const shop = ctx.shops.find(s => s.id === Number(shopId));
    if (!shop || shop.type !== 'forge') { ctx.dndSendError(ws, 'ไม่พบร้านตีบวกนี้แล้ว'); return; }
    if (!ctx.DND_EQUIP_SLOTS.includes(slot)) { ctx.dndSendError(ws, 'ช่องอุปกรณ์ไม่ถูกต้อง'); return; }
    const c = p.character;
    c.equipment = ctx.dndSanitizeEquipment(c.equipment);
    const item = c.equipment[slot];
    const slotLabel = ctx.DND_EQUIP_SLOT_LABELS[slot] || slot;
    if (!item || !item.name) { ctx.dndSendError(ws, `คุณยังไม่ได้สวมใส่${slotLabel}อยู่`); return; }
    const tier = shop.items[item.plus || 0];
    if (!tier) { ctx.dndSendError(ws, `"${item.name}" ตีบวกได้สูงสุดแล้วเท่าที่ร้านนี้มีตั้งค่าไว้ (+${item.plus || 0})`); return; }
    if ((c.gold || 0) < tier.cost) { ctx.dndSendError(ws, `ทองไม่พอตีบวก (ต้องการ ${tier.cost}, มี ${c.gold || 0})`); return; }
    c.gold -= tier.cost;
    const success = Math.random() * 100 < tier.successRate;
    const who = c.charName || p.name;
    if (success) {
      item.forgeHistory = ctx.dndSanitizeForgeHistory(item.forgeHistory);
      item.forgeHistory.push({ atk: tier.atkBonus, def: tier.defBonus });
      item.forgeAtk = item.forgeHistory.reduce((s, h) => s + h.atk, 0);
      item.forgeDef = item.forgeHistory.reduce((s, h) => s + h.def, 0);
      item.plus = (item.plus || 0) + 1;
      ctx.dndAddLog(`⚒️ ${who} ตีบวก${slotLabel} "${item.name}" ที่ร้าน "${shop.name}" สำเร็จ! ${tier.name} (ATK+${tier.atkBonus}/DEF+${tier.defBonus}) → ตอนนี้ +${item.plus}, เสียทอง ${tier.cost}`);
    } else if (tier.failPolicy === 'downgrade' && (item.plus || 0) > 0) {
      item.forgeHistory = ctx.dndSanitizeForgeHistory(item.forgeHistory);
      item.forgeHistory.pop();
      item.forgeAtk = item.forgeHistory.reduce((s, h) => s + h.atk, 0);
      item.forgeDef = item.forgeHistory.reduce((s, h) => s + h.def, 0);
      item.plus = Math.max(0, (item.plus || 0) - 1);
      ctx.dndAddLog(`💥 ${who} ตีบวก${slotLabel} "${item.name}" ที่ร้าน "${shop.name}" พลาด! ระดับตกลงเหลือ +${item.plus}, เสียทอง ${tier.cost}`);
    } else if (tier.failPolicy === 'break') {
      item.plus = 0; item.forgeHistory = []; item.forgeAtk = 0; item.forgeDef = 0;
      ctx.dndAddLog(`💔 ${who} ตีบวก${slotLabel} "${item.name}" ที่ร้าน "${shop.name}" พลาด! ไอเทมพัง โบนัสตีบวกรีเซตกลับเป็น +0, เสียทอง ${tier.cost}`);
    } else {
      ctx.dndAddLog(`❌ ${who} ตีบวก${slotLabel} "${item.name}" ที่ร้าน "${shop.name}" พลาด แต่ไม่มีอะไรเกิดขึ้น (ยังคง +${item.plus || 0}), เสียทอง ${tier.cost}`);
    }
  }

  return {
    dndSanitizeShopItem,
    dndDefaultShopItems,
    dndSanitizeForgeTier,
    dndDefaultForgeItems,
    dndHandleShopCreate,
    dndHandleShopRename,
    dndHandleShopToggleClosed,
    dndHandleShopDelete,
    dndHandleShopItemAdd,
    dndHandleShopItemEdit,
    dndHandleShopItemDelete,
    dndHandleShopBuy,
    dndHandleShopSell,
    dndHandleForgeAttempt,
  };
};
