// ============================================================
// D&D Party Room — เครื่องมือคุมเกม D&D สำหรับ DM และปาร์ตี้
// แยกออกมาจาก server.js เดิม (เป็นระบบอิสระ ไม่เกี่ยวกับ Hearts)
// ============================================================

const WebSocket = require('ws');

const { DND_RACES, DND_CLASSES, DND_CLASS_STARTER_GEAR, DND_HAIR_STYLES, DND_HAIR_COLORS, DND_FACE_STYLES, DND_LEVEL_EXP, DND_POINT_BUY_TOTAL, DND_STARTING_GOLD_MAX } = require('./data/characters');
const { DND_RACE_PASSIVES, DND_PASSIVE_EFFECT_KEYS, DND_CLASS_SKILLS, DND_CLASS_SKILL_ID_BASE } = require('./data/skills');
const { DND_EQUIP_SLOTS, DND_EQUIP_SLOT_LABELS, DND_EQUIP_ICON_MAX_LEN, DND_SHOP_TYPES, DND_FORGE_FAIL_POLICIES, DND_FORGE_FAIL_POLICY_LABELS, DND_ITEM_EFFECT_TYPES } = require('./data/equipment');
const { DND_TOKEN_COLORS, DND_MAX_TOKEN_IMAGE_CHARS, DND_TOKEN_SIZES, DND_MAX_MAP_BG_CHARS } = require('./data/tokens-map');
const { DEFAULT_MAPS, cloneDefaultMaps } = require('./data/maps');

// ---------------- D&D helper room (separate mini-app, independent of Hearts state) ----------------
let dndPlayers = []; // [{id, ws, name, isDM, connected, character}]
let dndLog = [];     // string entries (dice rolls / system messages), newest last
let dndNextId = 1;
let dndSkills = [];  // [{id, name, desc, stat}] — designed by the DM, visible to the whole party
let dndNextSkillId = 1;
let dndCustomPassives = []; // [{id, key, raceKey ('any' or a race key), name, icon, desc, effect}] — passive skills the DM designs, on top of the built-in ones
let dndNextPassiveId = 1;
let dndScene = { location: '', situation: '' }; // ป้ายประกาศสถานที่/สถานการณ์บนจอทุกคน — DM เท่านั้นที่กำหนดได้
// ---- ลำดับเทิร์นผู้เล่น: DM จัดลำดับเอง (ไม่ทอย initiative) แล้วกดเลื่อนตาไปเรื่อยๆ วนลูป ----
let dndTurnOrder = []; // array of player ids (non-DM) ตามลำดับที่ DM ตั้งไว้
let dndTurnIndex = -1; // index ใน dndTurnOrder ของตาปัจจุบัน, -1 = ยังไม่ได้เริ่ม/หยุดแล้ว
// ---- แผนที่ (รองรับหลายแผนที่): DM ออกแบบ/สร้าง/สลับได้หลายแผนที่ — มอนสเตอร์ (npc token) ผูกกับแผนที่ที่สร้างตอนนั้น ----
// ชุดแผนที่เริ่มต้นตั้งค่าไว้ที่ data/maps.js — แก้ไฟล์นั้นเพื่อเพิ่ม/แก้แผนที่ตั้งต้นของห้อง
let dndMaps = cloneDefaultMaps();
let dndNextMapId = Math.max(0, ...DEFAULT_MAPS.map(m => m.id)) + 1;
let dndCurrentMapId = DEFAULT_MAPS[0] ? DEFAULT_MAPS[0].id : 1; // แผนที่ที่กำลังแสดงอยู่ตอนนี้ (ทุกคนเห็นแผนที่เดียวกันเสมอ)
function dndCurrentMap() { return dndMaps.find(m => m.id === dndCurrentMapId) || dndMaps[0]; }
let dndTokens = [];      // [{id, kind:'pc'|'npc', ownerId, name, color, image, x, y, hp, maxHp, ac, attacks, statuses, mapId}] — npc มี hp/ac/attacks/mapId ของตัวเอง (pc ใช้ค่าจากการ์ดตัวละคร และมีตำแหน่งแยกต่อแผนที่ผ่าน positions)
let dndNextTokenId = 1;
let dndNextAttackId = 1;
let dndNextStatusId = 1;
let dndNextLootId = 1;
// ---- ร้านค้า: DM สร้างร้านได้หลายร้าน แต่ละร้านมีรายการไอเทมให้ผู้เล่นซื้อ/ขายคืนด้วยทอง ----
let dndShops = []; // [{id, name, items:[{id,name,price,desc,stock}]}] — stock === null คือขายไม่จำกัด
let dndNextShopId = 1;
let dndNextShopItemId = 1;
// ---- แลกเปลี่ยนไอเทมระหว่างผู้เล่น: เสนอ (ไอเทม+ทอง) แลกกับ (ไอเทม+ทอง) ของอีกฝ่าย ต้องกดยอมรับถึงจะสำเร็จ ----
let dndTrades = []; // [{id, fromId, toId, offerItems:[{name,qty}], offerGold, requestItems:[{name,qty}], requestGold}]
let dndNextTradeId = 1;
// ---- ไอเทมใช้งานได้: DM กำหนดชื่อไอเทม + ผลของมัน (ฟื้นฟู HP / ให้ทอง) — ถ้าชื่อในกระเป๋าผู้เล่นตรงกับรายการนี้ จะมีปุ่ม "ใช้" ให้กด ----
let dndNextItemEffectId = 1;
let dndItemEffects = dndDefaultItemEffectsInit(); // [{id, name, effectType:'heal'|'gold', value, desc}]

// ---- Race / Class card data (also drives the automatic AC/HP ranges & stat bonuses) ----
function dndRaceByKey(k) { return DND_RACES.find(r => r.key === k); }
function dndClassByKey(k) { return DND_CLASSES.find(c => c.key === k); }

// ---- ไอเทมสวมใส่เริ่มต้นตามคลาส: อิงธีมอุปกรณ์เริ่มต้นแบบ D&D ของแต่ละคลาส แต่ปรับเลขให้ต่ำ (ค่าเริ่มต้นระดับ 1) ----
// ใช้เติมให้อัตโนมัติตอนสร้างตัวละคร เฉพาะช่องที่ผู้เล่นไม่ได้กรอกไอเทมเอง (เว้นว่างไว้) — ผู้เล่นแก้ไข/ถอดออกทีหลังได้เสมอเหมือนไอเทมอื่นๆ
function dndStarterGearForClass(classKey) {
  return DND_CLASS_STARTER_GEAR[classKey] || null;
}
// ลงทะเบียนไอเทมสวมใส่เริ่มต้นให้เป็น "ไอเทมใช้งานได้" (itemEffects ชนิด equip) โดยอัตโนมัติ ถ้ายังไม่เคยมีชื่อนี้มาก่อน
// ทำให้พอผู้เล่นถอดไอเทมเริ่มต้นเก็บเข้ากระเป๋าแล้ว จะมีปุ่ม "ใช้" ให้กดสวมใส่กลับได้เสมอ (ไม่ต้องรอ DM มาตั้งค่าไอเทมนี้เอง)
function dndEnsureStarterItemEffect(slot, gear) {
  if (!gear || !gear.name) return;
  if (dndItemEffects.some(e => e.name === gear.name)) return;
  dndItemEffects.push({
    id: dndNextItemEffectId++,
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
// เติมไอเทมสวมใส่เริ่มต้นตามคลาสให้เฉพาะช่องที่ยังว่าง (ไม่มีชื่อไอเทม) — ไม่ทับไอเทมที่ผู้เล่นกรอกเองไว้แล้ว
function dndFillStarterGear(equipment, classKey) {
  const gear = dndStarterGearForClass(classKey);
  if (!gear) return equipment;
  for (const slot of DND_EQUIP_SLOTS) {
    if (!equipment[slot] || !equipment[slot].name) {
      const g = gear[slot];
      if (g) {
        equipment[slot] = dndSanitizeEquipSlot({ name: g.name, atk: g.atk, def: g.def, maxDurability: g.maxDurability, durability: g.maxDurability });
        dndEnsureStarterItemEffect(slot, g);
      }
    }
  }
  return equipment;
}

// ---- สกิลติดตัว (Passive) ประจำเผ่าพันธุ์: อิงจากคุณสมบัติเผ่าพันธุ์ใน D&D 5e แต่ปรับให้เป็นเลขกลไกง่ายๆ ----
// แต่ละเผ่ามีให้เลือก 2 แบบ — เลือกได้ตอนสร้างตัวละครครั้งเดียว (ล็อกไปพร้อมการ์ดตัวละคร)
// effect ที่รองรับ: atk (โบนัสทอยโจมตี), dmg (โบนัสดาเมจ), ac (โบนัสป้องกัน), hp (โบนัส HP สูงสุด), critRange (ขยายช่วงคริติคอล เช่น 1 = โดนคริตที่ 19-20), gold (ทองเริ่มต้นเพิ่ม)
function dndRacePassivesFor(raceKey) {
  const builtin = DND_RACE_PASSIVES[raceKey] || [];
  // สกิลติดตัวที่ DM สร้างเอง: ผูกกับเผ่าใดเผ่าหนึ่งโดยเฉพาะ หรือ raceKey === 'any' = ใช้ได้ทุกเผ่า
  const custom = dndCustomPassives.filter(cp => cp.raceKey === raceKey || cp.raceKey === 'any');
  return builtin.concat(custom);
}
function dndRacePassiveByKey(raceKey, passiveKey) {
  return dndRacePassivesFor(raceKey).find(p => p.key === passiveKey) || null;
}
// ---- สกิลติดตัว (Passive) ที่ DM ออกแบบเอง: เพิ่มเติมจากสกิลติดตัวประจำเผ่าที่มีมาให้ในระบบ ----
function dndSanitizePassiveEffect(raw) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  const clamp = (v, min, max) => Math.max(min, Math.min(max, Math.round(Number(v) || 0)));
  return {
    atk: clamp(r.atk, -20, 20),
    dmg: clamp(r.dmg, -20, 20),
    ac: clamp(r.ac, -20, 20),
    hp: clamp(r.hp, -50, 100),
    critRange: clamp(r.critRange, 0, 5),
    gold: clamp(r.gold, -100, 500),
  };
}
function dndPassiveEffectLogText(effect) {
  const parts = [];
  if (effect.atk) parts.push(`โจมตี ${effect.atk > 0 ? '+' : ''}${effect.atk}`);
  if (effect.dmg) parts.push(`ดาเมจ ${effect.dmg > 0 ? '+' : ''}${effect.dmg}`);
  if (effect.ac) parts.push(`ป้องกัน ${effect.ac > 0 ? '+' : ''}${effect.ac}`);
  if (effect.hp) parts.push(`HP ${effect.hp > 0 ? '+' : ''}${effect.hp}`);
  if (effect.critRange) parts.push(`คริติคอลกว้างขึ้น ${effect.critRange}`);
  if (effect.gold) parts.push(`ทอง ${effect.gold > 0 ? '+' : ''}${effect.gold}`);
  return parts.length ? parts.join(', ') : 'ไม่มีผลกลไก (ใช้เพื่อสีสัน/บทบาทเท่านั้น)';
}
// DM เท่านั้นที่สร้างสกิลติดตัวใหม่ได้ — เลือกผูกกับเผ่าใดเผ่าหนึ่ง หรือ 'any' ให้ทุกเผ่าเลือกได้ตอนสร้างตัวละคร
function dndHandlePassiveCreate(ws, payload) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM || !payload || typeof payload !== 'object') return;
  const name = (payload.name || '').toString().trim().slice(0, 40);
  if (!name) { dndSendError(ws, 'กรุณาตั้งชื่อสกิลติดตัว'); return; }
  const desc = (payload.desc || '').toString().trim().slice(0, 150);
  const icon = (payload.icon || '✨').toString().trim().slice(0, 4) || '✨';
  const raceKeyRaw = (payload.raceKey || 'any').toString();
  const raceKey = (raceKeyRaw === 'any' || dndRaceByKey(raceKeyRaw)) ? raceKeyRaw : 'any';
  const effect = dndSanitizePassiveEffect(payload.effect);

  const passive = { id: dndNextPassiveId++, raceKey, name, icon, desc, effect };
  passive.key = `custom${passive.id}`;
  dndCustomPassives.push(passive);
  const raceInfo = raceKey === 'any' ? null : dndRaceByKey(raceKey);
  const raceText = raceKey === 'any' ? 'ทุกเผ่าพันธุ์' : (raceInfo ? raceInfo.name : raceKey);
  dndAddLog(`✨ DM ออกแบบสกิลติดตัวใหม่: "${name}" (${raceText}) — ${dndPassiveEffectLogText(effect)}`);
}
// DM แก้ไขสกิลติดตัวที่ตัวเองสร้างไว้ได้ทุกเมื่อ (แก้ได้เฉพาะสกิลติดตัวที่ DM สร้างเอง ไม่ใช่สกิลติดตัวประจำเผ่าที่มีมาให้ในระบบ)
function dndHandlePassiveEdit(ws, id, payload) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM || !payload || typeof payload !== 'object') return;
  const passive = dndCustomPassives.find(cp => cp.id === Number(id));
  if (!passive) return;
  const name = (payload.name || '').toString().trim().slice(0, 40);
  if (!name) { dndSendError(ws, 'กรุณาตั้งชื่อสกิลติดตัว'); return; }
  passive.name = name;
  passive.desc = (payload.desc || '').toString().trim().slice(0, 150);
  passive.icon = (payload.icon || '✨').toString().trim().slice(0, 4) || '✨';
  const raceKeyRaw = (payload.raceKey || 'any').toString();
  passive.raceKey = (raceKeyRaw === 'any' || dndRaceByKey(raceKeyRaw)) ? raceKeyRaw : 'any';
  passive.effect = dndSanitizePassiveEffect(payload.effect);
  dndAddLog(`✏️ DM แก้ไขสกิลติดตัว: "${passive.name}"`);
}
// DM ลบสกิลติดตัวที่ตัวเองสร้างไว้ได้ — ตัวละครที่เคยเลือกไว้แล้วจะไม่ได้รับโบนัสโจมตี/ดาเมจ/คริติคอลอีกต่อไป (โบนัส HP/ป้องกัน/ทองที่ให้ไปตอนสร้างตัวละครแล้วจะไม่ถูกดึงคืน)
function dndHandlePassiveDelete(ws, id) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  const idx = dndCustomPassives.findIndex(cp => cp.id === Number(id));
  if (idx === -1) return;
  const [removed] = dndCustomPassives.splice(idx, 1);
  dndAddLog(`DM ลบสกิลติดตัว: "${removed.name}"`);
}
// คืนโบนัสจากสกิลติดตัวของตัวละคร (ค่าเริ่มต้นเป็น 0 ทุกช่องถ้ายังไม่ได้เลือก/หาไม่เจอ)
function dndCharPassiveEffect(character) {
  const passive = character && dndRacePassiveByKey(character.raceKey, character.passiveKey);
  const eff = (passive && passive.effect) || {};
  return { atk: eff.atk || 0, dmg: eff.dmg || 0, ac: eff.ac || 0, hp: eff.hp || 0, critRange: eff.critRange || 0, gold: eff.gold || 0 };
}
// รวมโบนัส/บทลงโทษจากสถานะผิดปกติ (บัฟ/ดีบัฟ) ทั้งหมดที่ติดอยู่กับผู้เล่น/มอนสเตอร์คนนี้ตอนนี้ — ใช้บวกเข้ากับการทอยโจมตี/ดาเมจ/AC
function dndStatusMods(list) {
  let atk = 0, dmg = 0, def = 0;
  for (const s of (list || [])) {
    atk += Number(s.atkMod) || 0;
    dmg += Number(s.dmgMod) || 0;
    def += Number(s.defMod) || 0;
  }
  return { atk, dmg, def };
}

// ---- สกิลประจำคลาส: ทุกคลาสมีสกิลเริ่มต้น (เลเวล 1) ให้อัตโนมัติ แล้วปลดสกิลใหม่เพิ่มตามเลเวล ----
// ผู้เล่นไม่ต้องรอ DM สร้าง/มอบให้ — ระบบคำนวณให้เองจากคลาส + เลเวลปัจจุบันของตัวละคร
function dndClassSkillId(classKey, idx) {
  const ci = Math.max(0, DND_CLASSES.findIndex(c => c.key === classKey));
  return DND_CLASS_SKILL_ID_BASE + ci * 100 + idx;
}
// คืนรายการสกิลประจำคลาสของผู้เล่นคนนี้ทั้งหมด (รวมที่ยังไม่ปลดล็อกด้วย แต่ติดธง locked ไว้ให้เห็นล่วงหน้าว่าจะได้อะไรตอนเลเวลไหน)
function dndClassSkillsForPlayer(p) {
  if (!p || p.isDM || !p.character || !p.character.classKey) return [];
  const templates = DND_CLASS_SKILLS[p.character.classKey] || [];
  const level = Math.max(1, Math.floor(Number(p.character.level) || 1));
  return templates.map((t, idx) => Object.assign({}, t, {
    id: dndClassSkillId(p.character.classKey, idx),
    assignedIds: [p.id],
    classSkill: true,
    locked: t.level > level,
  }));
}
// เรียกตอนเลเวลอัป (ไม่ว่าจะจากฆ่ามอนสเตอร์ได้ EXP หรือ DM แก้ไขเลเวลตรง ๆ) เพื่อประกาศสกิลใหม่ที่เพิ่งปลดล็อก
function dndAnnounceClassSkillUnlocks(target, oldLevel, newLevel) {
  if (!target || target.isDM || !target.character || !target.character.classKey) return;
  const templates = DND_CLASS_SKILLS[target.character.classKey] || [];
  const unlocked = templates.filter(t => t.level > oldLevel && t.level <= newLevel);
  for (const t of unlocked) {
    dndAddLog(`🔓 ${target.character.charName || target.name} ปลดล็อกสกิลประจำคลาสใหม่: "${t.name}" (เลเวล ${t.level})`);
  }
}

// ---- อุปกรณ์สวมใส่: อาวุธ / เกราะ / รองเท้า / เครื่องประดับ — แต่ละชิ้นมีค่าป้องกันและความคงทน ----
// จำกัดขนาดรูปไอเทม (เป็น data URL base64) กันข้อความ websocket ใหญ่เกินไป — ประมาณ 220KB ไฟล์จริง
function dndSanitizeEquipIcon(raw) {
  if (typeof raw !== 'string' || !raw) return '';
  if (!raw.startsWith('data:image/')) return '';
  if (raw.length > DND_EQUIP_ICON_MAX_LEN) return '';
  return raw;
}
// ประวัติการตีบวกสำเร็จของไอเทมชิ้นนี้ [{atk,def}, ...] — ใช้คำนวณโบนัสรวมจากการตีบวก (forgeAtk/forgeDef)
// และใช้ตอน "พลาดแล้วตกระดับ" (ลบรายการล่าสุดออกแล้วคำนวณโบนัสใหม่) แยกต่างหากจาก atk/def พื้นฐานของไอเทม
function dndSanitizeForgeHistory(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.slice(0, 999).map(h => ({
    atk: Math.max(0, Math.min(999, Math.round(Number(h && h.atk) || 0))),
    def: Math.max(0, Math.min(999, Math.round(Number(h && h.def) || 0))),
  }));
}
function dndSanitizeEquipSlot(raw) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  const name = (r.name || '').toString().trim().slice(0, 40);
  const def = Math.max(0, Math.min(999, Math.round(Number(r.def) || 0)));
  const atk = Math.max(0, Math.min(999, Math.round(Number(r.atk) || 0)));
  const maxDurability = Math.max(0, Math.min(999, Math.round(Number(r.maxDurability) || 0)));
  const durability = Math.max(0, Math.min(maxDurability || 999, Math.round(Number(r.durability) || 0)));
  const icon = dndSanitizeEquipIcon(r.icon);
  const plus = Math.max(0, Math.min(999, Math.round(Number(r.plus) || 0)));
  const forgeHistory = dndSanitizeForgeHistory(r.forgeHistory);
  // forgeAtk/forgeDef คำนวณจาก forgeHistory เสมอ (ไม่รับค่าตรงจาก client) กันการตีบวกปลอมด้วยการแก้ตัวเลขส่งเข้ามาเอง
  const forgeAtk = forgeHistory.reduce((s, h) => s + h.atk, 0);
  const forgeDef = forgeHistory.reduce((s, h) => s + h.def, 0);
  return { name, def, atk, durability, maxDurability, icon, plus, forgeAtk, forgeDef, forgeHistory };
}
function dndSanitizeEquipment(raw) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  const out = {};
  for (const slot of DND_EQUIP_SLOTS) out[slot] = dndSanitizeEquipSlot(r[slot]);
  return out;
}
// ---- แต่งหน้าตาตัวละคร (ทรงผม/สีผม/สีหน้า) — เรื่องความสวยงามล้วนๆ ไม่กระทบสเตตัส แก้ไขได้เองทุกเมื่อไม่ต้องรอ DM ปลดล็อกการ์ด ----
function dndSanitizeAppearance(raw) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  const hair = DND_HAIR_STYLES.includes(r.hair) ? r.hair : 'short';
  const hairColor = DND_HAIR_COLORS.includes(r.hairColor) ? r.hairColor : DND_HAIR_COLORS[0];
  const face = DND_FACE_STYLES.includes(r.face) ? r.face : 'neutral';
  return { hair, hairColor, face };
}
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
function dndBagAdd(character, name, qty) {
  character.bag = dndSanitizeBag(character.bag);
  const row = character.bag.find(it => it.name === name);
  if (row) row.qty += qty; else character.bag.push({ name, qty });
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
  return [Object.assign({ id: dndNextShopItemId++ }, dndSanitizeShopItem({
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
  const failPolicy = DND_FORGE_FAIL_POLICIES.includes(r.failPolicy) ? r.failPolicy : 'safe';
  const desc = (r.desc || '').toString().trim().slice(0, 150);
  return { name, cost, successRate, atkBonus, defBonus, failPolicy, desc };
}
function dndDefaultForgeItems() {
  return [
    Object.assign({ id: dndNextShopItemId++ }, dndSanitizeForgeTier({
      name: '+1', cost: 30, successRate: 90, atkBonus: 1, defBonus: 1, failPolicy: 'safe', desc: 'ระดับแรก ความเสี่ยงต่ำ',
    })),
    Object.assign({ id: dndNextShopItemId++ }, dndSanitizeForgeTier({
      name: '+2', cost: 60, successRate: 75, atkBonus: 1, defBonus: 1, failPolicy: 'safe', desc: '',
    })),
    Object.assign({ id: dndNextShopItemId++ }, dndSanitizeForgeTier({
      name: '+3', cost: 100, successRate: 50, atkBonus: 2, defBonus: 2, failPolicy: 'downgrade', desc: 'เริ่มเสี่ยงตกระดับถ้าพลาด',
    })),
  ];
}
// เดิมไอเทม "Red Potion (ยาแดง)" ในร้านค้าเริ่มต้นมีแค่คำอธิบายว่าฟื้นฟู HP แต่ไม่เคยมีการตั้งค่าผล (itemEffects) มาคู่กันจริง ๆ
// ทำให้ซื้อมาแล้วกดใช้ไม่ได้ (ไม่มีปุ่ม "ใช้" ขึ้นเลย) — เพิ่มค่าเริ่มต้นตรงนี้ให้ตรงชื่อกันเป๊ะ ๆ จะได้ใช้ฟื้นฟู/ชุบ HP ได้จริงตั้งแต่แรก
// (สร้าง object ตรงๆ แทนการเรียก dndSanitizeItemEffect เพราะฟังก์ชันนั้นอ้างอิงค่าคงที่ที่ยังไม่ถูกประกาศ ณ จุดที่ไฟล์นี้ทำงานถึงบรรทัดนี้)
function dndDefaultItemEffectsInit() {
  return [{
    id: dndNextItemEffectId++, name: 'Red Potion (ยาแดง)', effectType: 'heal', value: 20,
    desc: 'ฟื้นฟู HP 20 หน่วย (ใช้กับคนหมดสติไม่ได้ ต้องใช้ไอเทมชุบชีวิตแทน)',
    slot: 'weapon', atk: 0, def: 0, maxDurability: 0, icon: '',
  }];
}
// ---- ไอเทมใช้งานได้: DM กำหนดชื่อ + ผล (ฟื้นฟู HP / ชุบชีวิต / ให้ทอง / สวมใส่อุปกรณ์) — ชื่อต้องตรงกับชื่อไอเทมในกระเป๋าผู้เล่นเป๊ะๆ ถึงจะมีปุ่ม "ใช้" ----
// "heal" ฟื้นฟู HP ได้เฉพาะเป้าหมายที่ยังไม่หมดสติเท่านั้น (ปลุกคนหมดสติไม่ได้) — ต้องเป็น "revive" เท่านั้นที่ DM สร้างขึ้นมาโดยเฉพาะ ถึงจะใช้ชุบชีวิตคนหมดสติได้
function dndSanitizeItemEffect(raw) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  const name = (r.name || '').toString().trim().slice(0, 40);
  const effectType = DND_ITEM_EFFECT_TYPES.includes(r.effectType) ? r.effectType : 'heal';
  const value = Math.max(0, Math.min(99999, Math.round(Number(r.value) || 0)));
  const desc = (r.desc || '').toString().trim().slice(0, 100);
  const slot = DND_EQUIP_SLOTS.includes(r.slot) ? r.slot : 'weapon';
  const atk = Math.max(0, Math.min(999, Math.round(Number(r.atk) || 0)));
  const def = Math.max(0, Math.min(999, Math.round(Number(r.def) || 0)));
  const maxDurability = Math.max(0, Math.min(999, Math.round(Number(r.maxDurability) || 0)));
  const icon = dndSanitizeEquipIcon(r.icon);
  return { name, effectType, value, desc, slot, atk, def, maxDurability, icon };
}
function dndItemEffectLogText(item) {
  if (item.effectType === 'heal') return `ฟื้นฟู HP ${item.value} (ปลุกคนหมดสติไม่ได้)`;
  if (item.effectType === 'revive') return `🌟 ชุบชีวิต + ฟื้นฟู HP ${item.value}`;
  if (item.effectType === 'gold') return `ได้ทอง ${item.value}`;
  if (item.effectType === 'none') return item.desc ? `ไม่มีผลพิเศษ — ${item.desc}` : 'ไม่มีผลพิเศษ (ใช้แล้วหายไป)';
  const slotLabel = DND_EQUIP_SLOT_LABELS[item.slot] || item.slot;
  return `สวมใส่เป็น${slotLabel} (ATK+${item.atk} / DEF+${item.def}${item.maxDurability > 0 ? ` / ทน ${item.maxDurability}` : ''})`;
}
function dndHandleItemEffectCreate(ws, payload) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM || !payload || typeof payload !== 'object') return;
  const item = dndSanitizeItemEffect(payload);
  if (!item.name) { dndSendError(ws, 'กรุณาตั้งชื่อไอเทม (ต้องตรงกับชื่อไอเทมในกระเป๋าผู้เล่นเป๊ะๆ)'); return; }
  dndItemEffects.push(Object.assign({ id: dndNextItemEffectId++ }, item));
  dndAddLog(`⚙️ DM ตั้งค่าไอเทมใช้งาน "${item.name}" (${dndItemEffectLogText(item)})`);
}
// อุปกรณ์สวมใส่ที่ถูกกำหนดโดยไม่ผ่านแผงตั้งค่าไอเทมของ DM (เช่น ตอนสร้างตัวละคร หรือ DM มอบอุปกรณ์ให้ตรงๆ)
// จะไม่มีนิยามผลไอเทมอยู่ใน dndItemEffects เลย ทำให้พอถอดออกไปเก็บกระเป๋าแล้ว กดปุ่ม "ใช้" เพื่อสวมกลับไม่ได้
// (ปุ่มใช้จะไม่ขึ้นด้วยซ้ำ เพราะ client เช็คว่ามีนิยามไอเทมจับคู่ชื่อก่อนถึงจะโชว์ปุ่ม) — ฟังก์ชันนี้ลงทะเบียนนิยามให้อัตโนมัติ
// เพื่อให้ผู้เล่นกดใช้สวมใส่กลับเองได้เสมอ โดยไม่ทับนิยามเดิมถ้า DM เคยตั้งชื่อนี้ไว้ในระบบไอเทมแล้ว (กันของที่ DM ปรับแต่งเองถูกเขียนทับ)
function dndAutoRegisterEquipItemEffect(name, item, slot) {
  const cleanName = (name || '').toString().trim().slice(0, 40);
  if (!cleanName || !slot) return;
  if (dndItemEffects.some(e => e.name === cleanName)) return;
  dndItemEffects.push({
    id: dndNextItemEffectId++,
    name: cleanName,
    effectType: 'equip',
    value: 0,
    desc: '',
    slot,
    atk: Math.max(0, Math.min(999, Math.round(Number(item && item.atk) || 0))),
    def: Math.max(0, Math.min(999, Math.round(Number(item && item.def) || 0))),
    maxDurability: Math.max(0, Math.min(999, Math.round(Number(item && item.maxDurability) || 0))),
    icon: dndSanitizeEquipIcon(item && item.icon),
  });
}
function dndHandleItemEffectEdit(ws, id, payload) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM || !payload || typeof payload !== 'object') return;
  const idx = dndItemEffects.findIndex(e => e.id === Number(id));
  if (idx === -1) return;
  dndItemEffects[idx] = Object.assign({ id: dndItemEffects[idx].id }, dndSanitizeItemEffect(payload));
  dndBroadcastState();
}
function dndHandleItemEffectDelete(ws, id) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  dndItemEffects = dndItemEffects.filter(e => e.id !== Number(id));
  dndBroadcastState();
}
// ผู้เล่นกดปุ่ม "ใช้" ไอเทมในกระเป๋าของตัวเอง — ต้องมีของจริงในกระเป๋า และมีนิยามผลของไอเทมนั้นจาก DM ไว้แล้ว
// targetId ใส่มาเมื่อใช้ไอเทม "ฟื้นฟู HP" กับเพื่อนร่วมทีมคนอื่นแทนตัวเอง (เช่นเพื่อนหมดสติอยู่ ต้องให้อีกคนใช้ไอเทมชุบให้)
// ไอเทมประเภท gold/equip ยังคงใช้กับตัวเองได้อย่างเดียวเหมือนเดิม (ไม่รับ targetId)
function dndHandleUseItem(ws, name, targetId) {
  const p = dndFindByWs(ws);
  if (!p || p.isDM) return;
  if (dndIsCharDead(p.character)) { dndSendError(ws, DND_DEAD_MSG); return; } // คนหมดสติใช้ไอเทมเองไม่ได้ ต้องรอให้คนอื่นใช้ให้
  const cleanName = (name || '').toString().trim().slice(0, 40);
  if (!cleanName) return;
  const c = p.character;
  const def = dndItemEffects.find(e => e.name === cleanName);
  if (!def) { dndSendError(ws, `"${cleanName}" ไม่ใช่ไอเทมใช้งานได้ (DM ยังไม่ได้ตั้งค่าผลของมัน)`); return; }

  let targetPlayer = p;
  if ((def.effectType === 'heal' || def.effectType === 'revive') && targetId != null && Number(targetId) !== p.id) {
    const found = dndPlayers.find(pp => pp.id === Number(targetId) && !pp.isDM);
    if (!found) { dndSendError(ws, 'ไม่พบเป้าหมายที่จะใช้ไอเทมด้วย'); return; }
    targetPlayer = found;
  }
  const tc = targetPlayer.character;
  const targetName = tc.charName || targetPlayer.name;
  const wasDead = dndIsCharDead(tc);
  // ไอเทมประเภท "ฟื้นฟู HP" ธรรมดาใช้ปลุกคนหมดสติไม่ได้เด็ดขาด — ต้องเป็นไอเทม "ชุบชีวิต" ที่ DM สร้างขึ้นมาโดยเฉพาะเท่านั้น
  if (def.effectType === 'heal' && wasDead) {
    dndSendError(ws, `ไอเทม "${cleanName}" ฟื้นฟู HP เท่านั้น ใช้ปลุก ${targetName} ที่หมดสติไม่ได้ — ต้องใช้ไอเทมชุบชีวิตแทน (ให้ DM ตั้งค่าไอเทมประเภท "ชุบชีวิต")`);
    return;
  }

  if (!dndBagRemove(c, cleanName, 1)) { dndSendError(ws, `คุณไม่มี "${cleanName}" ในกระเป๋า`); return; }
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
    c.equipment = dndSanitizeEquipment(c.equipment);
    const slot = def.slot;
    const oldItem = c.equipment[slot];
    // ถ้าช่องนั้นมีของสวมอยู่แล้ว คืนของเก่ากลับเข้ากระเป๋าก่อนสวมของใหม่ ไม่ให้ของหาย
    if (oldItem && oldItem.name) dndBagAdd(c, oldItem.name, 1);
    c.equipment[slot] = { name: cleanName, atk: def.atk, def: def.def, durability: def.maxDurability, maxDurability: def.maxDurability, icon: def.icon || '' };
    const slotLabel = DND_EQUIP_SLOT_LABELS[slot] || slot;
    resultText = `🛡️ สวมใส่เป็น${slotLabel}${oldItem && oldItem.name ? ` (ถอด "${oldItem.name}" เก็บเข้ากระเป๋า)` : ''}`;
  } else if (def.effectType === 'none') {
    // ไม่มีผลกลไกอะไร — แค่ใช้แล้วไอเทมหายไป 1 ชิ้น (เหมาะกับของกินเล่น/ไอเทมภารกิจ/ของสะสม) ถ้า DM ใส่คำอธิบายไว้จะโชว์ในแชทด้วย
    resultText = def.desc ? `📦 ${def.desc}` : '📦 ใช้แล้ว (ไม่มีผลพิเศษ)';
  }
  if (targetPlayer === p) dndAddLog(`🧪 ${c.charName || p.name} ใช้ "${cleanName}": ${resultText}`);
  else dndAddLog(`🧪 ${c.charName || p.name} ใช้ "${cleanName}" ให้ ${targetName}: ${resultText}`);
}
// ไอเทมที่มีการกำหนด maxDurability ไว้ และคงทนหมดแล้ว (durability <= 0) ถือว่า "ชำรุด" ใช้ atk/def ไม่ได้แล้ว
// ไอเทมที่ maxDurability = 0 (ไม่ได้ตั้งค่าคงทนไว้) ถือว่าไม่ระบบคงทน ใช้งานได้ปกติเสมอ
function dndEquipSlotBroken(item) {
  return !!(item && item.maxDurability > 0 && item.durability <= 0);
}
function dndTotalDefense(equipment) {
  if (!equipment) return 0;
  return DND_EQUIP_SLOTS.reduce((sum, slot) => {
    const item = equipment[slot];
    return sum + (dndEquipSlotBroken(item) ? 0 : ((item && (item.def + (item.forgeDef || 0))) || 0));
  }, 0);
}
// ตาราง EXP สะสมสำหรับเลเวล (ใช้ EXP รวม ไม่ใช่ EXP ที่เหลือหลังเลเวลอัป)
function dndLevelFromExp(exp) {
  const total = Math.max(0, Math.floor(Number(exp) || 0));
  let level = 1;
  for (let i = 0; i < DND_LEVEL_EXP.length; i++) {
    if (total >= DND_LEVEL_EXP[i]) level = i + 1;
    else break;
  }
  return level;
}
function dndNextLevelExp(level) {
  const lv = Math.max(1, Math.min(DND_LEVEL_EXP.length, Math.floor(Number(level) || 1)));
  return DND_LEVEL_EXP[lv] ?? DND_LEVEL_EXP[DND_LEVEL_EXP.length - 1];
}
function dndSyncLevelFromExp(character) {
  if (!character) return { oldLevel: 1, newLevel: 1 };
  const oldLevel = Math.max(1, Math.floor(Number(character.level) || 1));
  const newLevel = dndLevelFromExp(character.exp);
  character.level = newLevel;
  return { oldLevel, newLevel };
}

function dndAbilityMod(score) { return Math.floor((score - 10) / 2); }
function dndRandInt(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
// ระบบหลบแบบมาตรฐาน D&D: ทอย 1d20 + โบนัส เทียบกับ AC เป้าหมาย — ทอยได้ 1 = พลาดเสมอ, ทอยได้ 20 = โดนเสมอ (คริติคอล), นอกนั้นต้อง "รวมแล้ว >= AC" ถึงจะโดน
function dndRollVsAC(atkRoll, mod, ac, critRange) {
  const total = atkRoll + mod;
  const fumble = atkRoll === 1;
  // critRange (จากสกิลติดตัวบางเผ่า เช่น เอลฟ์/ฮาล์ฟลิง) ขยายช่วงคริติคอลให้กว้างขึ้น เช่น critRange=1 -> โดนคริตที่ 19-20 แทนที่จะเป็นแค่ 20
  const threshold = 20 - Math.max(0, Math.min(19, Math.round(Number(critRange) || 0)));
  const crit = !fumble && atkRoll >= threshold;
  const hit = fumble ? false : (crit ? true : total >= Math.max(0, Number(ac) || 0));
  return { total, fumble, crit, hit };
}
// ทอยดาเมจ — ถ้าคริติคอลให้ทอยจำนวนลูกเต๋าเป็นสองเท่า (ตัวปรับค่าไม่คูณ ตามกติกา D&D มาตรฐาน)
function dndRollDamage(dmgDie, dmgCount, dmgMod, crit) {
  const count = Math.max(0, Math.round(Number(dmgCount) || 0)) * (crit ? 2 : 1);
  const rolls = [];
  for (let i = 0; i < count; i++) rolls.push(1 + Math.floor(Math.random() * dmgDie));
  const damage = Math.max(0, rolls.reduce((a, b) => a + b, 0) + (Number(dmgMod) || 0));
  return { rolls, damage };
}
function dndTotalAttack(equipment) {
  if (!equipment) return 0;
  return DND_EQUIP_SLOTS.reduce((sum, slot) => {
    const item = equipment[slot];
    return sum + (dndEquipSlotBroken(item) ? 0 : ((item && (item.atk + (item.forgeAtk || 0))) || 0));
  }, 0);
}
// ช่วง AC ที่ผู้เล่นพิมพ์เองได้ (คำนวณอัตโนมัติจาก DEX + ประเภทเกราะของคลาส)
function dndAcRange(dexMod, armor) {
  let min, max;
  if (armor === 'light') { min = 10 + dexMod; max = 14 + dexMod; }
  else if (armor === 'medium') { min = 12 + Math.min(dexMod, 2); max = 16 + Math.min(dexMod, 2); }
  else { min = 14; max = 18; } // heavy
  min = Math.max(10, Math.min(25, min));
  max = Math.max(min + 1, Math.min(25, max));
  return { min, max };
}
// ช่วง HP สูงสุดที่ผู้เล่นพิมพ์เองได้ (คำนวณอัตโนมัติจาก Level + CON + Hit Die ของคลาส)
function dndHpRange(level, conMod, hitDie) {
  const min = Math.max(1, level * (1 + conMod));
  const max = Math.max(min, level * (hitDie + conMod));
  return { min, max };
}
function dndComputeFinalStats(pointBuy, race, cls) {
  const stats = {};
  for (const k of ['str', 'dex', 'con', 'int', 'wis', 'cha']) {
    const pb = Math.max(0, Math.min(DND_POINT_BUY_TOTAL, Math.round(Number(pointBuy && pointBuy[k]) || 0)));
    const rb = (race && race.bonus && race.bonus[k]) || 0;
    const cb = (cls && cls.bonus && cls.bonus[k]) || 0;
    stats[k] = 1 + pb + rb + cb;
  }
  return stats;
}

function newDndCharacter(displayName) {
  return {
    charName: displayName, raceKey: '', classKey: '', race: '', cls: '', level: 1, passiveKey: '',
    hp: 10, maxHp: 10, ac: 10,
    str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
    inventory: '', backstory: '', locked: false, pointBuy: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    equipment: dndSanitizeEquipment(null), statuses: [], exp: 0, gold: 0,
    appearance: dndSanitizeAppearance(null), bag: [],
  };
}
function dndPublicPlayer(p) {
  // สกิลที่ DM มอบให้ผู้เล่นคนนี้โดยเฉพาะ — ส่งให้ทุกคนเห็นบนการ์ดตัวละครของเขาในปาร์ตี้
  const assignedSkills = dndSkills.filter(s => s.assignedIds && s.assignedIds.includes(p.id)).map(s => ({ id: s.id, name: s.name }));
  // สกิลประจำคลาสของผู้เล่นคนนี้ทั้งหมด (รวมที่ยังไม่ปลดล็อก) — ให้ DM เห็นครบตอนเปิดหน้าต่างแก้ไขผู้เล่นคนนี้
  const classSkills = dndClassSkillsForPlayer(p).map(s => ({ id: s.id, name: s.name, desc: s.desc, level: s.level, locked: s.locked }));
  return { id: p.id, isDM: p.isDM, connected: p.connected, character: p.character, assignedSkills, classSkills };
}
// คืนรายการสกิลที่ผู้เล่นคนนี้มองเห็น พร้อมสถานะคูลดาวน์/จำนวนครั้งที่ใช้ไปแล้ว "เฉพาะของเขาเอง"
// (ไม่แก้ไขอ็อบเจกต์สกิลต้นฉบับ เพราะสกิลเดียวกันอาจถูกมองจากผู้เล่นหลายคนพร้อมกัน)
function dndVisibleSkills(p) {
  const all = dndSkills.concat(dndClassSkillsForPlayer(p));
  return all.map(s => {
    const used = (p.skillUsedCount && p.skillUsedCount[s.id]) || 0;
    const usesLeft = s.maxUses > 0 ? Math.max(0, s.maxUses - used) : null;
    const readyAt = (p.skillReadyAt && p.skillReadyAt[s.id]) || 0;
    return Object.assign({}, s, { usesLeft, readyAt });
  });
}
// หา skill object จากทั้งสกิลที่ DM สร้างเอง และสกิลประจำคลาสของผู้เล่นคนนี้
function dndFindUsableSkill(p, skillId) {
  const sid = Number(skillId);
  const custom = dndSkills.find(s => s.id === sid);
  if (custom) return custom;
  return dndClassSkillsForPlayer(p).find(s => s.id === sid) || null;
}
function dndBroadcastState() {
  for (const p of dndPlayers) {
    if (p.ws && p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(JSON.stringify({
        type: 'dndState',
        you: { id: p.id, isDM: p.isDM, locked: p.character.locked },
        players: dndPlayers.map(dndPublicPlayer),
        log: dndLogForPlayer(p),
        races: DND_RACES,
        classes: DND_CLASSES,
        classStarterGear: DND_CLASS_STARTER_GEAR,
        passives: DND_RACE_PASSIVES,
        customPassives: dndCustomPassives,
        skills: dndVisibleSkills(p),
        pointBuyTotal: DND_POINT_BUY_TOTAL,
        equipSlots: DND_EQUIP_SLOTS,
        equipSlotLabels: DND_EQUIP_SLOT_LABELS,
        hairStyles: DND_HAIR_STYLES,
        hairColors: DND_HAIR_COLORS,
        faceStyles: DND_FACE_STYLES,
        shops: dndShops,
        forgeFailPolicyLabels: DND_FORGE_FAIL_POLICY_LABELS,
        itemEffects: dndItemEffects,
        trades: dndTradesForPlayer(p),
        scene: dndScene,
        tokens: dndTokensPublic(),
        mapBackground: dndCurrentMap().background,
        maps: dndMaps.map(m => ({ id: m.id, name: m.name })),
        currentMapId: dndCurrentMapId,
        levelExpTable: DND_LEVEL_EXP,
        turnOrder: dndTurnOrder,
        turnIndex: dndTurnIndex,
        currentTurnPlayerId: dndCurrentTurnPlayerId(),
      }));
    }
  }
}
function dndAddLog(text, visibleTo) {
  // visibleTo: undefined/null = ทุกคนเห็น (ปกติ) — หรือใส่ array ของ player id ที่จะเห็นข้อความนี้ได้ (DM เห็นได้เสมอ)
  dndLog.push({ text, visibleTo: Array.isArray(visibleTo) ? visibleTo.slice() : null });
  if (dndLog.length > 300) dndLog.shift();
  dndBroadcastState();
}
function dndLogForPlayer(p) {
  return dndLog
    .filter(entry => !entry.visibleTo || p.isDM || entry.visibleTo.includes(p.id))
    .map(entry => entry.text)
    .slice(-60);
}
function dndRandomTokenPos() {
  // กระจายตำแหน่งเริ่มต้นแบบสุ่มใกล้กลางแคนวาส แล้วให้ DM ลากจัดเอง
  return { x: Math.round((15 + Math.random() * 70) * 10) / 10, y: Math.round((15 + Math.random() * 70) * 10) / 10 };
}
// ตำแหน่งของ token ตัวละครผู้เล่นแยกเก็บต่อแผนที่ — สุ่มตำแหน่งใหม่ครั้งแรกที่ปรากฏบนแผนที่นั้น แล้วจำไว้ (ให้ DM ลากจัดเอง)
function dndPcPosForCurrentMap(t) {
  t.positions = t.positions || {};
  if (!t.positions[dndCurrentMapId]) t.positions[dndCurrentMapId] = dndRandomTokenPos();
  return t.positions[dndCurrentMapId];
}
function dndPublicToken(t) {
  if (t.kind === 'pc') {
    const owner = dndPlayers.find(p => p.id === t.ownerId);
    const name = owner ? (owner.character.charName || owner.name) : '???';
    const hp = owner ? owner.character.hp : 0;
    const maxHp = owner ? owner.character.maxHp : 0;
    const ac = owner ? owner.character.ac : 0;
    const statuses = owner ? (owner.character.statuses || []) : [];
    const pos = dndPcPosForCurrentMap(t);
    return { id: t.id, kind: 'pc', ownerId: t.ownerId, name, color: t.color, image: t.image || null, x: pos.x, y: pos.y, hp, maxHp, ac, attacks: [], statuses };
  }
  return {
    id: t.id, kind: 'npc', ownerId: null, name: t.name, color: t.color, image: t.image || null, x: t.x, y: t.y, mapId: t.mapId,
    hp: t.hp, maxHp: t.maxHp, ac: t.ac, size: t.size || 'normal',
    str: t.str || 10, dex: t.dex || 10, con: t.con || 10, int: t.int || 10, wis: t.wis || 10, cha: t.cha || 10,
    attacks: t.attacks || [], statuses: t.statuses || [], expReward: t.expReward || 0, goldReward: t.goldReward || 0, loot: t.loot || [],
  };
}
// ผู้เล่น (pc) เห็นเสมอไม่ว่าจะสลับไปแผนที่ไหน — มอนสเตอร์ (npc) แสดงเฉพาะที่อยู่บนแผนที่ปัจจุบันเท่านั้น
function dndTokensPublic() {
  return dndTokens.filter(t => t.kind === 'pc' || t.mapId === dndCurrentMapId).map(dndPublicToken);
}
// ---- AOE: หาตำแหน่งเป้าหมายบนแผนที่ปัจจุบัน + รวบรวมเป้าหมายทั้งหมดไว้คำนวณระยะห่างตอนใช้สกิล AOE ----
// พิกัด x,y ของ token ทุกตัวเป็นหน่วย % ของแผนที่ (0-100 ทั้งสองแกน) อยู่แล้ว จึงใช้ระยะทางแบบยุคลิดตรง ๆ ได้
function dndTargetMapPos(targetType, targetId) {
  if (targetType === 'token') {
    const t = dndTokens.find(tt => tt.id === Number(targetId) && tt.kind === 'npc' && tt.mapId === dndCurrentMapId);
    return t ? { x: t.x, y: t.y } : null;
  }
  if (targetType === 'player') {
    const tok = dndTokens.find(t => t.kind === 'pc' && t.ownerId === Number(targetId));
    return tok ? dndPcPosForCurrentMap(tok) : null;
  }
  return null;
}
// รายชื่อเป้าหมายทั้งหมดที่อาจโดน AOE บนแผนที่ปัจจุบัน (ผู้เล่นที่ล็อกการ์ดแล้วทุกคน + มอนสเตอร์บนแผนที่นี้)
function dndAoeCandidates() {
  const list = [];
  for (const pp of dndPlayers) {
    if (pp.isDM || !pp.character || !pp.character.locked) continue;
    const tok = dndTokens.find(t => t.kind === 'pc' && t.ownerId === pp.id);
    if (!tok) continue;
    list.push({ type: 'player', id: pp.id, pos: dndPcPosForCurrentMap(tok) });
  }
  for (const t of dndTokens) {
    if (t.kind !== 'npc' || t.mapId !== dndCurrentMapId) continue;
    list.push({ type: 'token', id: t.id, pos: { x: t.x, y: t.y } });
  }
  return list;
}
// หา id ของ token บนแผนที่ (pc) ของผู้เล่นคนนี้ — ใช้หาตำแหน่งบนแผนที่ตอนเล่นแอนิเมชันโจมตีฝั่ง client
function dndPcTokenId(playerId) {
  const tok = dndTokens.find(t => t.kind === 'pc' && t.ownerId === Number(playerId));
  return tok ? tok.id : null;
}
function dndFindByWs(ws) { return dndPlayers.find(p => p.ws === ws); }
function dndSendError(ws, msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'dndError', msg }));
}
// ตัวละครถือว่า "หมดสติ/ตาย" เมื่อ HP <= 0 — ทำอะไรไม่ได้ (โจมตี/ใช้สกิล/ใช้ไอเทม/ขยับ token) จนกว่าจะมีคนใช้ไอเทมชุบให้ หรือ DM เพิ่ม HP ให้โดยตรง
const DND_DEAD_MSG = 'คุณหมดสติอยู่ ทำอะไรไม่ได้จนกว่าจะมีคนใช้ไอเทมชุบให้ หรือ DM เพิ่ม HP ให้';
function dndIsCharDead(c) { return !!c && (Number(c.hp) || 0) <= 0; }

function dndHandleJoin(ws, name) {
  const cleanName = (name || '').toString().trim().slice(0, 16) || `นักผจญภัย${dndPlayers.length + 1}`;
  const isDM = dndPlayers.length === 0; // คนแรกที่เข้าห้องเป็น DM เสมอ และจะยังคงเป็น DM แม้หลุดการเชื่อมต่อ (ไม่มีใครมาแทนที่)
  const id = dndNextId++;
  dndPlayers.push({ id, ws, name: cleanName, isDM, connected: true, character: newDndCharacter(cleanName) });
  dndAddLog(isDM ? `${cleanName} เข้าห้องในฐานะ Dungeon Master` : `${cleanName} เข้าร่วมปาร์ตี้`);
}
function dndVacantSeats() {
  return dndPlayers.filter(p => !p.connected).map(p => ({
    id: p.id,
    isDM: p.isDM,
    name: p.character.charName || p.name,
    raceCls: p.character.locked ? `${p.character.race || ''} ${p.character.cls || ''}`.trim() : 'ยังไม่ได้สร้างตัวละคร',
    level: p.character.level,
  }));
}
function dndHandleListSeats(ws) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'dndSeatList', seats: dndVacantSeats() }));
}
function dndHandleTakeSeat(ws, id) {
  const target = dndPlayers.find(p => p.id === Number(id) && !p.connected);
  if (!target) { dndHandleListSeats(ws); return; } // ที่นั่งถูกคนอื่นเอาไปแล้ว หรือข้อมูลเก่า — ส่งรายชื่อล่าสุดกลับไป
  target.ws = ws;
  target.connected = true;
  dndAddLog(`${target.character.charName || target.name} กลับเข้ามานั่งที่เดิม${target.isDM ? ' (DM)' : ''}`);
}

// ผู้เล่นสร้างการ์ดตัวละครของตัวเองได้ "ครั้งเดียว" เท่านั้น — หลังบันทึกแล้วจะถูกล็อกทันที
// แก้ไขได้อีกครั้งก็ต่อเมื่อ DM เป็นคนปลดล็อกให้ หรือ DM แก้ไขข้อมูลให้โดยตรง
function dndHandleCreateCharacter(ws, payload) {
  const p = dndFindByWs(ws);
  if (!p || !payload || typeof payload !== 'object') return;
  if (p.character.locked) { dndSendError(ws, 'การ์ดตัวละครของคุณถูกบันทึกและล็อกไปแล้ว ให้ DM เป็นผู้แก้ไขหรือปลดล็อกให้'); return; }

  const charName = (payload.charName || '').toString().trim().slice(0, 40);
  if (!charName) { dndSendError(ws, 'กรุณาตั้งชื่อตัวละคร'); return; }

  const race = dndRaceByKey((payload.raceKey || '').toString());
  const cls = dndClassByKey((payload.classKey || '').toString());
  if (!race || !cls) { dndSendError(ws, 'กรุณาเลือกเผ่าพันธุ์และคลาสจากการ์ด'); return; }

  const passive = dndRacePassiveByKey(race.key, (payload.passiveKey || '').toString());
  if (!passive) { dndSendError(ws, 'กรุณาเลือกสกิลติดตัว (Passive) ประจำเผ่าพันธุ์ของคุณ'); return; }
  const passiveEffect = passive.effect || {};

  const pointBuy = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
  let spent = 0;
  for (const k of Object.keys(pointBuy)) {
    const raw = payload.pointBuy && payload.pointBuy[k];
    const n = Math.max(0, Math.min(DND_POINT_BUY_TOTAL, Math.round(Number(raw) || 0)));
    pointBuy[k] = n;
    spent += n;
  }
  if (spent !== DND_POINT_BUY_TOTAL) {
    dndSendError(ws, `ต้องแจกแต้มสเตตัสให้ครบพอดี ${DND_POINT_BUY_TOTAL} แต้ม (ตอนนี้ใช้ไป ${spent} แต้ม)`);
    return;
  }

  const finalStats = dndComputeFinalStats(pointBuy, race, cls);
  const dexMod = dndAbilityMod(finalStats.dex);
  const conMod = dndAbilityMod(finalStats.con);
  const level = 1;

  // AC และ HP สูงสุด ไม่ให้ผู้เล่นกรอกเองแล้ว — ระบบสุ่มให้อัตโนมัติภายในช่วงที่คำนวณจากสเตตัส/คลาส ตอนกดบันทึก
  const acR = dndAcRange(dexMod, cls.armor);
  const ac = dndRandInt(acR.min, acR.max) + (passiveEffect.ac || 0);

  const hpR = dndHpRange(level, conMod, cls.hitDie);
  const maxHp = dndRandInt(hpR.min, hpR.max) + (passiveEffect.hp || 0);

  const inventory = (payload.inventory || '').toString().slice(0, 500);
  // ประวัติที่มาของตัวละคร (ไม่บังคับ) — เรื่องราวเบื้องหลัง กรอกตอนสร้างได้ครั้งเดียว แต่ DM แก้ไขให้ทีหลังได้เสมอ
  const backstory = (payload.backstory || '').toString().slice(0, 800);
  // ทองเริ่มต้น กรอกได้ตอนสร้างตัวละคร (ไม่บังคับ) จำกัดไม่เกิน DND_STARTING_GOLD_MAX กันผู้เล่นใส่ค่ามั่ว — DM ปรับเพิ่ม/ลดทีหลังได้เสมอ
  let gold = Math.round(Number(payload.gold));
  if (!Number.isFinite(gold)) gold = 0;
  gold = Math.max(0, Math.min(DND_STARTING_GOLD_MAX, gold)) + (passiveEffect.gold || 0);
  // อุปกรณ์สวมใส่กรอกตอนสร้างตัวละครได้ (ไม่บังคับ) และแก้ไขได้อีกเรื่อยๆ ทีหลังผ่าน dndEquipUpdate โดยไม่ต้องรอ DM ปลดล็อก
  // ช่องไหนที่ผู้เล่นไม่ได้กรอกไอเทมเอง ระบบจะเติมไอเทมสวมใส่เริ่มต้นให้อัตโนมัติตามคลาสที่เลือก (สเตตัสต่ำๆ อิงธีม D&D)
  const equipment = dndFillStarterGear(dndSanitizeEquipment(payload.equipment), cls.key);
  for (const slotKey of DND_EQUIP_SLOTS) {
    const slotItem = equipment[slotKey];
    if (slotItem && slotItem.name) dndAutoRegisterEquipItemEffect(slotItem.name, slotItem, slotKey);
  }
  // หน้าตาตัวละคร (ทรงผม/สีผม/สีหน้า) เลือกตอนสร้างได้ และแก้ไขต่อได้เองทุกเมื่อทีหลังผ่าน dndAppearanceUpdate
  const appearance = dndSanitizeAppearance(payload.appearance || p.character.appearance);

  p.character = {
    charName, raceKey: race.key, classKey: cls.key, race: race.name, cls: cls.name, passiveKey: passive.key,
    level, hp: maxHp, maxHp, ac,
    str: finalStats.str, dex: finalStats.dex, con: finalStats.con,
    int: finalStats.int, wis: finalStats.wis, cha: finalStats.cha,
    inventory, backstory, locked: true, pointBuy, equipment, statuses: (p.character.statuses || []),
    appearance, gold: (p.character.gold || 0) + gold, bag: dndSanitizeBag(p.character.bag),
  };
  // สร้าง token บนแผนที่ให้อัตโนมัติ (ครั้งแรกที่ล็อกการ์ดตัวละครเท่านั้น เพราะฟังก์ชันนี้ทำงานได้แค่ครั้งเดียวต่อคน)
  if (!dndTokens.some(t => t.kind === 'pc' && t.ownerId === p.id)) {
    dndTokens.push({
      id: dndNextTokenId++, kind: 'pc', ownerId: p.id,
      color: DND_TOKEN_COLORS[p.id % DND_TOKEN_COLORS.length],
      image: null, positions: {}, // ตำแหน่งเก็บแยกต่อแผนที่ (mapId -> {x,y}) สุ่มตำแหน่งใหม่ครั้งแรกที่ปรากฏบนแต่ละแผนที่
    });
  }
  dndAddLog(`${charName} (${race.name} ${cls.name} · สกิลติดตัว: ${passive.name}) สร้างการ์ดตัวละครแล้ว — บันทึกล็อกเรียบร้อย`);
}

const DND_DM_STR_FIELDS = ['charName', 'race', 'cls', 'inventory', 'backstory'];
const DND_DM_STR_FIELD_MAXLEN = { inventory: 500, backstory: 800 };
const DND_DM_NUM_FIELDS = ['level', 'maxHp', 'ac', 'str', 'dex', 'con', 'int', 'wis', 'cha', 'exp', 'gold'];
// DM แก้ไขข้อมูลของผู้เล่นคนไหนก็ได้ ทุกช่อง ทุกเมื่อ ไม่มีการล็อกหรือจำกัดช่วงค่า
function dndHandleDmUpdate(ws, targetId, updates) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  const target = dndPlayers.find(pp => pp.id === Number(targetId));
  if (!target || !updates || typeof updates !== 'object') return;
  const c = target.character;

  if (updates.raceKey !== undefined) {
    const race = dndRaceByKey(updates.raceKey.toString());
    if (race) {
      c.raceKey = race.key; c.race = race.name;
      // เปลี่ยนเผ่าแล้ว ถ้าสกิลติดตัวเดิมไม่ได้อยู่ในรายการของเผ่าใหม่ ให้ล้างทิ้งไปก่อน (กันสกิลติดตัวจากเผ่าเก่าค้างอยู่)
      if (!dndRacePassiveByKey(race.key, c.passiveKey)) c.passiveKey = '';
    }
  }
  if (updates.classKey !== undefined) {
    const cls = dndClassByKey(updates.classKey.toString());
    if (cls) { c.classKey = cls.key; c.cls = cls.name; }
  }
  if (updates.passiveKey !== undefined) {
    const passive = dndRacePassiveByKey(c.raceKey, updates.passiveKey.toString());
    if (passive) c.passiveKey = passive.key;
  }
  for (const f of DND_DM_STR_FIELDS) {
    if (updates[f] !== undefined) c[f] = updates[f].toString().slice(0, DND_DM_STR_FIELD_MAXLEN[f] || 40);
  }
  for (const f of DND_DM_NUM_FIELDS) {
    if (f === 'level') continue; // Level คำนวณจาก EXP อัตโนมัติ
    if (updates[f] !== undefined) {
      const n = Number(updates[f]);
      if (Number.isFinite(n)) c[f] = Math.max(0, Math.min(9999, Math.round(n)));
    }
  }
  const previousLevel = dndLevelFromExp(c.exp);
  dndSyncLevelFromExp(c);
  if (c.level > previousLevel) {
    dndAddLog(`🎉 ${c.charName || target.name} เลเวลอัป! Lv.${previousLevel} → Lv.${c.level}`);
    dndAnnounceClassSkillUnlocks(target, previousLevel, c.level);
  }
  let revived = false;
  if (updates.hp !== undefined) {
    const n = Number(updates.hp);
    const wasDead = dndIsCharDead(c);
    if (Number.isFinite(n)) c.hp = Math.max(0, Math.min(c.maxHp || 9999, Math.round(n)));
    revived = wasDead && !dndIsCharDead(c);
  }
  if (updates.locked !== undefined) c.locked = !!updates.locked;
  if (updates.equipment !== undefined) {
    c.equipment = dndSanitizeEquipment(updates.equipment);
    for (const slotKey of DND_EQUIP_SLOTS) {
      const slotItem = c.equipment[slotKey];
      if (slotItem && slotItem.name) dndAutoRegisterEquipItemEffect(slotItem.name, slotItem, slotKey);
    }
  }
  if (updates.appearance !== undefined) c.appearance = dndSanitizeAppearance(updates.appearance);

  dndAddLog(`DM แก้ไขข้อมูลของ ${c.charName || target.name}`);
  if (revived) dndAddLog(`🌟 ${c.charName || target.name} ฟื้นจากหมดสติแล้ว! (DM เพิ่ม HP ให้)`);
}
// ผู้เล่นแต่งหน้าตาตัวละคร (ทรงผม/สีผม/สีหน้า) ของตัวเองได้เองทุกเมื่อ ไม่ต้องรอ DM ปลดล็อกการ์ด เพราะเป็นแค่เรื่องความสวยงาม ไม่กระทบสเตตัสหรือกติกาเกม
function dndHandleAppearanceUpdate(ws, appearance) {
  const p = dndFindByWs(ws);
  if (!p) return;
  p.character.appearance = dndSanitizeAppearance(appearance);
  dndBroadcastState();
}

// ---- ร้านค้า: DM สร้าง/แก้ไขร้านและไอเทมในร้าน — ผู้เล่นซื้อ/ขายคืนด้วยทองของตัวเอง ----
function dndHandleShopCreate(ws, name, type) {
  const p = dndFindByWs(ws);
  if (!p) { dndSendError(ws, 'ไม่พบข้อมูลผู้เล่นของคุณในห้องนี้ ลองเข้าห้องใหม่อีกครั้ง'); return; }
  if (!p.isDM) { dndSendError(ws, 'เฉพาะ DM เท่านั้นที่เปิดร้านค้าได้'); return; }
  const shopType = type === 'forge' ? 'forge' : 'item';
  const cleanName = (name || '').toString().trim().slice(0, 40)
    || (shopType === 'forge' ? `ร้านตีบวก ${dndShops.length + 1}` : `ร้านค้า ${dndShops.length + 1}`);
  dndShops.push({
    id: dndNextShopId++, name: cleanName, type: shopType,
    items: shopType === 'forge' ? dndDefaultForgeItems() : dndDefaultShopItems(),
  });
  dndAddLog(`🏪 DM เปิด${shopType === 'forge' ? 'ร้านตีบวก' : 'ร้านค้า'}ใหม่: "${cleanName}"`);
}
function dndHandleShopRename(ws, shopId, name) {
  const p = dndFindByWs(ws);
  if (!p) { dndSendError(ws, 'ไม่พบข้อมูลผู้เล่นของคุณในห้องนี้ ลองเข้าห้องใหม่อีกครั้ง'); return; }
  if (!p.isDM) { dndSendError(ws, 'เฉพาะ DM เท่านั้นที่แก้ไขร้านค้าได้'); return; }
  const shop = dndShops.find(s => s.id === Number(shopId));
  if (!shop) { dndSendError(ws, 'ไม่พบร้านค้านี้แล้ว'); return; }
  const cleanName = (name || '').toString().trim().slice(0, 40);
  if (cleanName) shop.name = cleanName;
  dndBroadcastState();
}
function dndHandleShopDelete(ws, shopId) {
  const p = dndFindByWs(ws);
  if (!p) { dndSendError(ws, 'ไม่พบข้อมูลผู้เล่นของคุณในห้องนี้ ลองเข้าห้องใหม่อีกครั้ง'); return; }
  if (!p.isDM) { dndSendError(ws, 'เฉพาะ DM เท่านั้นที่ปิดร้านค้าได้'); return; }
  const idx = dndShops.findIndex(s => s.id === Number(shopId));
  if (idx === -1) { dndSendError(ws, 'ไม่พบร้านค้านี้แล้ว'); return; }
  const [removed] = dndShops.splice(idx, 1);
  dndAddLog(`🏪 DM ปิดร้านค้า "${removed.name}" แล้ว`);
}
function dndHandleShopItemAdd(ws, shopId, payload) {
  const p = dndFindByWs(ws);
  if (!p) { dndSendError(ws, 'ไม่พบข้อมูลผู้เล่นของคุณในห้องนี้ ลองเข้าห้องใหม่อีกครั้ง'); return; }
  if (!p.isDM) { dndSendError(ws, 'เฉพาะ DM เท่านั้นที่เพิ่มไอเทมในร้านได้'); return; }
  if (!payload || typeof payload !== 'object') return;
  const shop = dndShops.find(s => s.id === Number(shopId));
  if (!shop) { dndSendError(ws, 'ไม่พบร้านค้านี้แล้ว'); return; }
  const cleanItem = shop.type === 'forge' ? dndSanitizeForgeTier(payload) : dndSanitizeShopItem(payload);
  shop.items.push(Object.assign({ id: dndNextShopItemId++ }, cleanItem));
  dndBroadcastState();
}
function dndHandleShopItemEdit(ws, shopId, itemId, payload) {
  const p = dndFindByWs(ws);
  if (!p) { dndSendError(ws, 'ไม่พบข้อมูลผู้เล่นของคุณในห้องนี้ ลองเข้าห้องใหม่อีกครั้ง'); return; }
  if (!p.isDM) { dndSendError(ws, 'เฉพาะ DM เท่านั้นที่แก้ไขไอเทมในร้านได้'); return; }
  if (!payload || typeof payload !== 'object') return;
  const shop = dndShops.find(s => s.id === Number(shopId));
  if (!shop) { dndSendError(ws, 'ไม่พบร้านค้านี้แล้ว'); return; }
  const idx = shop.items.findIndex(it => it.id === Number(itemId));
  if (idx === -1) { dndSendError(ws, 'ไม่พบไอเทมนี้แล้ว'); return; }
  const cleanItem = shop.type === 'forge' ? dndSanitizeForgeTier(payload) : dndSanitizeShopItem(payload);
  shop.items[idx] = Object.assign({ id: shop.items[idx].id }, cleanItem);
  dndBroadcastState();
}
function dndHandleShopItemDelete(ws, shopId, itemId) {
  const p = dndFindByWs(ws);
  if (!p) { dndSendError(ws, 'ไม่พบข้อมูลผู้เล่นของคุณในห้องนี้ ลองเข้าห้องใหม่อีกครั้ง'); return; }
  if (!p.isDM) { dndSendError(ws, 'เฉพาะ DM เท่านั้นที่ลบไอเทมในร้านได้'); return; }
  const shop = dndShops.find(s => s.id === Number(shopId));
  if (!shop) { dndSendError(ws, 'ไม่พบร้านค้านี้แล้ว'); return; }
  shop.items = shop.items.filter(it => it.id !== Number(itemId));
  dndBroadcastState();
}
// ผู้เล่น (ไม่ใช่ DM) ซื้อไอเทม 1 ชิ้นจากร้าน — จ่ายทอง ได้ของเข้ากระเป๋า ลดสต็อกถ้าร้านจำกัดจำนวนไว้
function dndHandleShopBuy(ws, shopId, itemId) {
  const p = dndFindByWs(ws);
  if (!p || p.isDM) return;
  const shop = dndShops.find(s => s.id === Number(shopId));
  const item = shop && shop.items.find(it => it.id === Number(itemId));
  if (!item) return;
  if (item.stock !== null && item.stock <= 0) { dndSendError(ws, `${item.name} ในร้านหมดแล้ว`); return; }
  const c = p.character;
  if ((c.gold || 0) < item.price) { dndSendError(ws, `ทองไม่พอซื้อ ${item.name} (ต้องการ ${item.price}, มี ${c.gold || 0})`); return; }
  c.gold = (c.gold || 0) - item.price;
  dndBagAdd(c, item.name, 1);
  if (item.stock !== null) item.stock -= 1;
  dndAddLog(`🛒 ${c.charName || p.name} ซื้อ ${item.name} จากร้าน "${shop.name}" ด้วยทอง ${item.price}`);
}
// ผู้เล่นขายไอเทมที่ถืออยู่คืนให้ร้าน (ต้องเป็นไอเทมชื่อเดียวกับที่ร้านนี้ขาย) ได้ทองครึ่งราคาป้ายของร้าน
function dndHandleShopSell(ws, shopId, itemId) {
  const p = dndFindByWs(ws);
  if (!p || p.isDM) return;
  const shop = dndShops.find(s => s.id === Number(shopId));
  const item = shop && shop.items.find(it => it.id === Number(itemId));
  if (!item) return;
  const c = p.character;
  if (!dndBagRemove(c, item.name, 1)) { dndSendError(ws, `คุณไม่มี ${item.name} ให้ขาย`); return; }
  const sellPrice = Math.floor(item.price / 2);
  c.gold = (c.gold || 0) + sellPrice;
  if (item.stock !== null) item.stock += 1;
  dndAddLog(`💰 ${c.charName || p.name} ขาย ${item.name} คืนให้ร้าน "${shop.name}" ได้ทอง ${sellPrice}`);
}
// ผู้เล่น (ไม่ใช่ DM) ตีบวกอุปกรณ์ที่สวมใส่อยู่ 1 ช่อง ที่ร้านตีบวกของ DM — จ่ายทองตามระดับถัดไป แล้วทอยโอกาสสำเร็จ
// สำเร็จ: ระดับตีบวก (plus) +1 และได้โบนัส atk/def สะสมถาวรตามที่ DM ตั้งไว้ในระดับนี้
// พลาด: เสียทองไปฟรี แล้วเป็นไปตามนโยบายที่ DM ตั้งไว้ต่อระดับ (ไม่มีอะไร / ตกระดับ / ไอเทมพังรีเซตโบนัสทั้งหมด)
function dndHandleForgeAttempt(ws, shopId, slot) {
  const p = dndFindByWs(ws);
  if (!p || p.isDM) return;
  const shop = dndShops.find(s => s.id === Number(shopId));
  if (!shop || shop.type !== 'forge') { dndSendError(ws, 'ไม่พบร้านตีบวกนี้แล้ว'); return; }
  if (!DND_EQUIP_SLOTS.includes(slot)) { dndSendError(ws, 'ช่องอุปกรณ์ไม่ถูกต้อง'); return; }
  const c = p.character;
  c.equipment = dndSanitizeEquipment(c.equipment);
  const item = c.equipment[slot];
  const slotLabel = DND_EQUIP_SLOT_LABELS[slot] || slot;
  if (!item || !item.name) { dndSendError(ws, `คุณยังไม่ได้สวมใส่${slotLabel}อยู่`); return; }
  const tier = shop.items[item.plus || 0];
  if (!tier) { dndSendError(ws, `"${item.name}" ตีบวกได้สูงสุดแล้วเท่าที่ร้านนี้มีตั้งค่าไว้ (+${item.plus || 0})`); return; }
  if ((c.gold || 0) < tier.cost) { dndSendError(ws, `ทองไม่พอตีบวก (ต้องการ ${tier.cost}, มี ${c.gold || 0})`); return; }
  c.gold -= tier.cost;
  const success = Math.random() * 100 < tier.successRate;
  const who = c.charName || p.name;
  if (success) {
    item.forgeHistory = dndSanitizeForgeHistory(item.forgeHistory);
    item.forgeHistory.push({ atk: tier.atkBonus, def: tier.defBonus });
    item.forgeAtk = item.forgeHistory.reduce((s, h) => s + h.atk, 0);
    item.forgeDef = item.forgeHistory.reduce((s, h) => s + h.def, 0);
    item.plus = (item.plus || 0) + 1;
    dndAddLog(`⚒️ ${who} ตีบวก${slotLabel} "${item.name}" ที่ร้าน "${shop.name}" สำเร็จ! ${tier.name} (ATK+${tier.atkBonus}/DEF+${tier.defBonus}) → ตอนนี้ +${item.plus}, เสียทอง ${tier.cost}`);
  } else if (tier.failPolicy === 'downgrade' && (item.plus || 0) > 0) {
    item.forgeHistory = dndSanitizeForgeHistory(item.forgeHistory);
    item.forgeHistory.pop();
    item.forgeAtk = item.forgeHistory.reduce((s, h) => s + h.atk, 0);
    item.forgeDef = item.forgeHistory.reduce((s, h) => s + h.def, 0);
    item.plus = Math.max(0, (item.plus || 0) - 1);
    dndAddLog(`💥 ${who} ตีบวก${slotLabel} "${item.name}" ที่ร้าน "${shop.name}" พลาด! ระดับตกลงเหลือ +${item.plus}, เสียทอง ${tier.cost}`);
  } else if (tier.failPolicy === 'break') {
    item.plus = 0; item.forgeHistory = []; item.forgeAtk = 0; item.forgeDef = 0;
    dndAddLog(`💔 ${who} ตีบวก${slotLabel} "${item.name}" ที่ร้าน "${shop.name}" พลาด! ไอเทมพัง โบนัสตีบวกรีเซตกลับเป็น +0, เสียทอง ${tier.cost}`);
  } else {
    dndAddLog(`❌ ${who} ตีบวก${slotLabel} "${item.name}" ที่ร้าน "${shop.name}" พลาด แต่ไม่มีอะไรเกิดขึ้น (ยังคง +${item.plus || 0}), เสียทอง ${tier.cost}`);
  }
}

// ---- แลกเปลี่ยนไอเทมระหว่างผู้เล่น: ฝ่ายเสนอเลือกไอเทม/ทองที่จะให้ กับที่จะขอ อีกฝ่ายกดยอมรับถึงจะซิงค์เข้ากระเป๋าจริง ----
function dndSanitizeItemQtyList(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const it of raw.slice(0, 20)) {
    const name = (it && it.name || '').toString().trim().slice(0, 40);
    const qty = Math.max(0, Math.min(999, Math.round(Number(it && it.qty) || 0)));
    if (name && qty > 0) out.push({ name, qty });
  }
  return out;
}
function dndCharacterHasItemsAndGold(character, items, gold) {
  if ((character.gold || 0) < gold) return false;
  const bag = dndSanitizeBag(character.bag);
  for (const it of items) {
    const row = bag.find(b => b.name === it.name);
    if (!row || row.qty < it.qty) return false;
  }
  return true;
}
// สมมติว่าตรวจสอบ (dndCharacterHasItemsAndGold) ผ่านแล้วก่อนเรียกฟังก์ชันนี้เสมอ
function dndApplyItemsAndGoldTransfer(fromChar, toChar, items, gold) {
  if (gold > 0) {
    fromChar.gold = Math.max(0, (fromChar.gold || 0) - gold);
    toChar.gold = (toChar.gold || 0) + gold;
  }
  for (const it of items) {
    dndBagRemove(fromChar, it.name, it.qty);
    dndBagAdd(toChar, it.name, it.qty);
  }
}
function dndTradeSideText(items, gold) {
  const parts = [];
  if (gold) parts.push(`ทอง ${gold}`);
  for (const it of items) parts.push(`${it.name} x${it.qty}`);
  return parts.length ? parts.join(', ') : '(ไม่มี)';
}
// ข้อมูลข้อเสนอที่ส่งให้ client — DM เห็นทุกข้อเสนอในห้อง (เพื่อดูแลภาพรวม) ผู้เล่นเห็นเฉพาะที่เกี่ยวกับตัวเอง
function dndTradesForPlayer(p) {
  const relevant = p.isDM ? dndTrades : dndTrades.filter(t => t.fromId === p.id || t.toId === p.id);
  return relevant.map(t => {
    const fromP = dndPlayers.find(pp => pp.id === t.fromId);
    const toP = dndPlayers.find(pp => pp.id === t.toId);
    return {
      id: t.id, fromId: t.fromId, toId: t.toId,
      fromName: fromP ? (fromP.character.charName || fromP.name) : '???',
      toName: toP ? (toP.character.charName || toP.name) : '???',
      offerItems: t.offerItems, offerGold: t.offerGold,
      requestItems: t.requestItems, requestGold: t.requestGold,
    };
  });
}
function dndHandleTradeOffer(ws, payload) {
  const p = dndFindByWs(ws);
  if (!p || p.isDM || !payload || typeof payload !== 'object') return;
  if (!p.character.locked) { dndSendError(ws, 'ต้องสร้างการ์ดตัวละครก่อนถึงจะแลกเปลี่ยนไอเทมได้'); return; }
  const target = dndPlayers.find(pp => pp.id === Number(payload.toId));
  if (!target || target.isDM || target.id === p.id) { dndSendError(ws, 'กรุณาเลือกเพื่อนร่วมทีมที่ถูกต้อง'); return; }
  if (!target.character.locked) { dndSendError(ws, `${target.name} ยังไม่ได้สร้างการ์ดตัวละคร`); return; }

  const offerItems = dndSanitizeItemQtyList(payload.offerItems);
  const offerGold = Math.max(0, Math.min(999999, Math.round(Number(payload.offerGold) || 0)));
  const requestItems = dndSanitizeItemQtyList(payload.requestItems);
  const requestGold = Math.max(0, Math.min(999999, Math.round(Number(payload.requestGold) || 0)));

  if (!offerItems.length && !offerGold && !requestItems.length && !requestGold) {
    dndSendError(ws, 'กรุณาเลือกไอเทมหรือทองอย่างน้อยฝั่งใดฝั่งหนึ่งก่อนส่งข้อเสนอ');
    return;
  }
  if (!dndCharacterHasItemsAndGold(p.character, offerItems, offerGold)) {
    dndSendError(ws, 'คุณมีไอเทมหรือทองที่จะเสนอให้ไม่พอ');
    return;
  }

  const trade = { id: dndNextTradeId++, fromId: p.id, toId: target.id, offerItems, offerGold, requestItems, requestGold };
  dndTrades.push(trade);
  dndAddLog(`🔄 ${p.character.charName || p.name} เสนอแลกเปลี่ยนกับ ${target.character.charName || target.name}: ให้ ${dndTradeSideText(offerItems, offerGold)} — ขอ ${dndTradeSideText(requestItems, requestGold)}`);
}
function dndHandleTradeRespond(ws, tradeId, accept) {
  const p = dndFindByWs(ws);
  if (!p) return;
  const idx = dndTrades.findIndex(t => t.id === Number(tradeId));
  if (idx === -1) return;
  const trade = dndTrades[idx];
  if (trade.toId !== p.id) { dndSendError(ws, 'คุณไม่ใช่ผู้รับข้อเสนอนี้'); return; }
  const fromP = dndPlayers.find(pp => pp.id === trade.fromId);
  dndTrades.splice(idx, 1);
  if (!accept) {
    dndAddLog(`🔄 ${p.character.charName || p.name} ปฏิเสธข้อเสนอแลกเปลี่ยนจาก ${fromP ? (fromP.character.charName || fromP.name) : '???'}`);
    return;
  }
  if (!fromP) { dndSendError(ws, 'ผู้เสนอไม่อยู่ในห้องแล้ว ข้อเสนอนี้ใช้ไม่ได้'); return; }
  if (!dndCharacterHasItemsAndGold(fromP.character, trade.offerItems, trade.offerGold)) {
    dndSendError(ws, `${fromP.character.charName || fromP.name} มีของไม่พอแล้ว ข้อเสนอนี้ใช้ไม่ได้`);
    dndAddLog(`🔄 การแลกเปลี่ยนล้มเหลว — ${fromP.character.charName || fromP.name} มีของไม่พอตามที่เสนอไว้`);
    return;
  }
  if (!dndCharacterHasItemsAndGold(p.character, trade.requestItems, trade.requestGold)) {
    dndSendError(ws, 'คุณมีของไม่พอสำหรับข้อเสนอนี้');
    dndAddLog(`🔄 การแลกเปลี่ยนล้มเหลว — ${p.character.charName || p.name} มีของไม่พอตามที่ถูกขอ`);
    return;
  }
  // ซิงค์เข้ากระเป๋าของทั้งสองฝ่ายพร้อมกัน (เหมือนของที่ได้รับ/ซื้อมา)
  dndApplyItemsAndGoldTransfer(fromP.character, p.character, trade.offerItems, trade.offerGold);
  dndApplyItemsAndGoldTransfer(p.character, fromP.character, trade.requestItems, trade.requestGold);
  dndAddLog(`✅ แลกเปลี่ยนสำเร็จ: ${fromP.character.charName || fromP.name} ↔ ${p.character.charName || p.name} (${fromP.character.charName || fromP.name} ให้ ${dndTradeSideText(trade.offerItems, trade.offerGold)} / ${p.character.charName || p.name} ให้ ${dndTradeSideText(trade.requestItems, trade.requestGold)})`);
}
function dndHandleTradeCancel(ws, tradeId) {
  const p = dndFindByWs(ws);
  if (!p) return;
  const idx = dndTrades.findIndex(t => t.id === Number(tradeId));
  if (idx === -1) return;
  const trade = dndTrades[idx];
  if (trade.fromId !== p.id && !p.isDM) return;
  dndTrades.splice(idx, 1);
  dndAddLog(`🔄 ยกเลิกข้อเสนอแลกเปลี่ยน #${trade.id}`);
}

// ---- ลำดับเทิร์นผู้เล่น: DM จัดลำดับเอง (ลาก/เลื่อนขึ้นลง ไม่ทอย initiative) แล้วกดเลื่อนตาไปเรื่อยๆ วนลูป ----
function dndCurrentTurnPlayerId() {
  if (dndTurnIndex < 0 || dndTurnIndex >= dndTurnOrder.length) return null;
  return dndTurnOrder[dndTurnIndex];
}
function dndHandleTurnSetOrder(ws, order) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM || !Array.isArray(order)) return;
  const validIds = new Set(dndPlayers.filter(pp => !pp.isDM).map(pp => pp.id));
  const seen = new Set();
  const cleaned = [];
  for (const raw of order) {
    const id = Number(raw);
    if (validIds.has(id) && !seen.has(id)) { seen.add(id); cleaned.push(id); }
  }
  dndTurnOrder = cleaned;
  if (dndTurnIndex >= dndTurnOrder.length) dndTurnIndex = dndTurnOrder.length ? 0 : -1;
}
function dndHandleTurnStart(ws) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  if (!dndTurnOrder.length) dndTurnOrder = dndPlayers.filter(pp => !pp.isDM).map(pp => pp.id);
  if (!dndTurnOrder.length) { dndSendError(ws, 'ยังไม่มีผู้เล่นในปาร์ตี้ให้เริ่มเทิร์น'); return; }
  dndTurnIndex = 0;
  const cur = dndPlayers.find(pp => pp.id === dndCurrentTurnPlayerId());
  dndAddLog(`🎯 เริ่มลำดับเทิร์น — ตอนนี้เป็นตาของ ${cur ? (cur.character.charName || cur.name) : '-'}`);
}
function dndHandleTurnNext(ws) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM || !dndTurnOrder.length || dndTurnIndex < 0) return;
  dndTurnIndex = (dndTurnIndex + 1) % dndTurnOrder.length;
  const cur = dndPlayers.find(pp => pp.id === dndCurrentTurnPlayerId());
  dndAddLog(`➡️ ตาถัดไป: ${cur ? (cur.character.charName || cur.name) : '-'}`);
}
function dndHandleTurnStop(ws) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  dndTurnIndex = -1;
  dndAddLog('⏹️ หยุดลำดับเทิร์นแล้ว');
}
// ผู้เล่นแก้ไขอุปกรณ์สวมใส่ (อาวุธ/เกราะ/รองเท้า/เครื่องประดับ) ของตัวเองได้ทุกเมื่อ — ไม่ผูกกับสถานะล็อกของการ์ดตัวละคร
// เพราะของสวมใส่เปลี่ยนบ่อยระหว่างเล่น (เจอไอเทมใหม่ ของพังจากความคงทนหมด ฯลฯ)
function dndHandleEquipUpdate(ws, equipment) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) {
    dndSendError(ws, 'เฉพาะ DM เท่านั้นที่จัดการอุปกรณ์ของผู้เล่นได้');
    return;
  }
  // รองรับการเรียกจากเครื่องมือ DM ที่ส่ง targetId + equipment ผ่าน payload ในอนาคต
  if (equipment && equipment.targetId !== undefined) {
    const target = dndPlayers.find(pp => pp.id === Number(equipment.targetId));
    if (!target) return;
    target.character.equipment = dndSanitizeEquipment(equipment.equipment);
    for (const slotKey of DND_EQUIP_SLOTS) {
      const slotItem = target.character.equipment[slotKey];
      if (slotItem && slotItem.name) dndAutoRegisterEquipItemEffect(slotItem.name, slotItem, slotKey);
    }
    dndAddLog(`DM ปรับปรุงอุปกรณ์ของ ${target.character.charName || target.name}`);
    return;
  }
  dndSendError(ws, 'ต้องระบุผู้เล่นเป้าหมายสำหรับการแก้ไขอุปกรณ์');
}
function dndHandleMapBackgroundUpdate(ws, image) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  const map = dndCurrentMap();
  if (image === null) {
    map.background = null;
    dndAddLog(`🗺️ DM ลบพื้นหลังแผนที่ "${map.name}"`);
    return;
  }
  if (typeof image !== 'string' || !image.startsWith('data:image/') || image.length > DND_MAX_MAP_BG_CHARS) {
    dndSendError(ws, 'รูปพื้นหลังแผนที่ไม่ถูกต้องหรือใหญ่เกินไป (ประมาณ 300KB)');
    return;
  }
  map.background = image;
  dndAddLog(`🗺️ DM เปลี่ยนพื้นหลังแผนที่ "${map.name}"`);
}
// ---- จัดการหลายแผนที่ (DM เท่านั้น): สร้าง/สลับ/เปลี่ยนชื่อ/ลบแผนที่ ----
function dndHandleMapCreate(ws, name) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  const cleanName = (name || '').toString().trim().slice(0, 30) || `แผนที่ ${dndMaps.length + 1}`;
  const map = { id: dndNextMapId++, name: cleanName, background: null };
  dndMaps.push(map);
  dndCurrentMapId = map.id; // สลับไปแผนที่ใหม่ทันทีเพื่อให้ DM ออกแบบต่อได้เลย
  dndAddLog(`🗺️ DM สร้างแผนที่ใหม่ "${cleanName}" และสลับไปแสดงแผนที่นี้`);
}
function dndHandleMapSwitch(ws, mapId) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  const map = dndMaps.find(m => m.id === Number(mapId));
  if (!map) return;
  dndCurrentMapId = map.id;
  dndAddLog(`🗺️ DM สลับไปแสดงแผนที่ "${map.name}"`);
}
function dndHandleMapRename(ws, mapId, name) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  const map = dndMaps.find(m => m.id === Number(mapId));
  if (!map) return;
  const cleanName = (name || '').toString().trim().slice(0, 30);
  if (!cleanName) { dndSendError(ws, 'กรุณาตั้งชื่อแผนที่'); return; }
  map.name = cleanName;
  dndAddLog(`🗺️ DM เปลี่ยนชื่อแผนที่เป็น "${cleanName}"`);
}
function dndHandleMapDelete(ws, mapId) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  if (dndMaps.length <= 1) { dndSendError(ws, 'ต้องมีอย่างน้อย 1 แผนที่เสมอ ลบแผนที่สุดท้ายไม่ได้'); return; }
  const idx = dndMaps.findIndex(m => m.id === Number(mapId));
  if (idx === -1) return;
  const [removed] = dndMaps.splice(idx, 1);
  dndTokens = dndTokens.filter(t => !(t.kind === 'npc' && t.mapId === removed.id)); // ลบมอนสเตอร์ที่อยู่บนแผนที่นี้ไปด้วย
  if (dndCurrentMapId === removed.id) dndCurrentMapId = dndMaps[0].id;
  dndAddLog(`🗺️ DM ลบแผนที่ "${removed.name}" (รวมมอนสเตอร์บนแผนที่นั้นทั้งหมด)`);
}
// DM เท่านั้นที่ประกาศสถานที่/สถานการณ์ปัจจุบันให้ทุกคนในห้องเห็นพร้อมกันได้ — ใช้บอกฉากปัจจุบันของปาร์ตี้
function dndHandleSceneUpdate(ws, payload) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM || !payload || typeof payload !== 'object') return;
  dndScene = {
    location: (payload.location || '').toString().trim().slice(0, 60),
    situation: (payload.situation || '').toString().trim().slice(0, 300),
  };
  const text = dndScene.location || dndScene.situation
    ? `${dndScene.location ? '📍 ' + dndScene.location : ''}${dndScene.location && dndScene.situation ? ' — ' : ''}${dndScene.situation || ''}`
    : '(ล้างประกาศแล้ว)';
  dndAddLog(`🖥️ DM ประกาศสถานการณ์: ${text}`);
}
const DND_VALID_DICE = [4, 6, 8, 10, 12, 20, 100];
function dndHandleRoll(ws, die, count, modifier, label) {
  const p = dndFindByWs(ws);
  if (!p) return;
  const d = DND_VALID_DICE.includes(Number(die)) ? Number(die) : 20;
  const n = Math.max(1, Math.min(20, Math.round(Number(count) || 1)));
  const mod = Math.max(-100, Math.min(100, Math.round(Number(modifier) || 0)));
  const rolls = [];
  for (let i = 0; i < n; i++) rolls.push(1 + Math.floor(Math.random() * d));
  const sum = rolls.reduce((a, b) => a + b, 0) + mod;
  const modStr = mod ? (mod > 0 ? ` +${mod}` : ` ${mod}`) : '';
  const safeLabel = (label || '').toString().trim().slice(0, 30);
  const labelStr = safeLabel ? ` (${safeLabel})` : '';
  dndAddLog(`🎲 ${p.character.charName || p.name} ทอย ${n}d${d}${modStr}${labelStr}: [${rolls.join(', ')}]${modStr} = ${sum}`);
}
const DND_SKILL_STATS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const DND_STAT_LABELS_TH = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };
// สกิลที่ตั้งค่าสถานะ/ดีบัฟไว้ — เมื่อใช้สกิลแล้วจะติดสถานะนี้ให้เป้าหมายอัตโนมัติ (เหมือนที่ DM มอบสถานะเองด้วยมือ แต่ผูกมากับสกิลแทน)
function dndSanitizeSkillStatus(raw) {
  const s = (raw && typeof raw === 'object') ? raw : {};
  const name = (s.name || '').toString().trim().slice(0, 24);
  if (!name) return { name: '', note: '' };
  const note = (s.note || '').toString().trim().slice(0, 100);
  return { name, note };
}
// DM เท่านั้นที่ออกแบบ/ลบสกิลได้ — กำหนดดาเมจ (ลูกเต๋า) และมอบสกิลให้ผู้เล่นเฉพาะคนได้ (ไม่เลือกใคร = ทั้งปาร์ตี้ใช้ได้)
function dndHandleSkillCreate(ws, payload) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM || !payload || typeof payload !== 'object') return;
  const name = (payload.name || '').toString().trim().slice(0, 40);
  if (!name) { dndSendError(ws, 'กรุณาตั้งชื่อสกิล'); return; }
  const statRaw = (payload.stat || '').toString();
  const stat = DND_SKILL_STATS.includes(statRaw) ? statRaw : '';
  const desc = (payload.desc || '').toString().trim().slice(0, 200);

  const dmg = (payload.damage && typeof payload.damage === 'object') ? payload.damage : {};
  const dmgDie = DND_VALID_DICE.includes(Number(dmg.die)) ? Number(dmg.die) : 0; // 0 = ไม่มีดาเมจ
  const dmgCount = Math.max(1, Math.min(20, Math.round(Number(dmg.count) || 1)));
  const dmgMod = Math.max(-100, Math.min(100, Math.round(Number(dmg.mod) || 0)));

  // สกิลชุบ/ฟื้นฟู HP — DM ตั้งลูกเต๋าฮีลแยกจากดาเมจได้ (0 = ไม่ใช่สกิลชุบ) ใช้กับผู้เล่นเท่านั้น รวมถึงชุบคนหมดสติให้ฟื้นได้ด้วย
  const heal = (payload.heal && typeof payload.heal === 'object') ? payload.heal : {};
  const healDie = DND_VALID_DICE.includes(Number(heal.die)) ? Number(heal.die) : 0;
  const healCount = Math.max(1, Math.min(20, Math.round(Number(heal.count) || 1)));
  const healMod = Math.max(-100, Math.min(100, Math.round(Number(heal.mod) || 0)));

  const assignedIds = Array.isArray(payload.assignedIds)
    ? payload.assignedIds.map(Number).filter(id => dndPlayers.some(pp => pp.id === id))
    : [];
  const cooldownSec = Math.max(0, Math.min(3600, Math.round(Number(payload.cooldownSec) || 0)));
  const maxUses = Math.max(0, Math.min(99, Math.round(Number(payload.maxUses) || 0)));

  // สถานะ/ดีบัฟที่ผูกกับสกิล (ไม่บังคับ) — ใช้สกิลแล้วเป้าหมายจะติดสถานะนี้ให้อัตโนมัติ ใช้ร่วมกับดาเมจ/ฮีลได้ในสกิลเดียวกัน
  const status = dndSanitizeSkillStatus(payload.status);

  // สกิล AOE (พื้นที่บริเวณ): เป้าเดี่ยวปกติยังต้องเลือกเป้าหมายหลักเหมือนเดิม แต่ถ้าตั้งรัศมีไว้ (>0)
  // ดาเมจจะกระจายไปโดนเป้าหมายอื่น ๆ ที่อยู่ในระยะรอบเป้าหมายหลักบนแผนที่ด้วย โดยดาเมจจะลดหลั่นตามระยะห่างจากจุดศูนย์กลาง
  // หน่วยรัศมีอิงตามพิกัด token บนแผนที่ (0-100 = กว้าง/ยาวเต็มแผนที่) — 0 = ไม่มี AOE ยิงเป้าเดี่ยวเหมือนเดิม
  const aoeRaw = (payload.aoe && typeof payload.aoe === 'object') ? payload.aoe : {};
  const aoeRadius = Math.max(0, Math.min(100, Math.round(Number(aoeRaw.radius) || 0)));

  // สกิลลบล้างสถานะผิดปกติ (cleanse): เปิดใช้แล้วต้องเลือกเป้าหมายเป็นผู้เล่นเท่านั้น — cleanseName ว่าง = ล้างสถานะทั้งหมดที่ติดอยู่,
  // ถ้าระบุชื่อไว้จะล้างเฉพาะสถานะที่ชื่อตรงกัน (ใช้ทำสกิลแก้พิษ/แก้มึนงงเฉพาะทางได้) — ใช้ร่วมกับดาเมจ/ฮีล/ติดสถานะในสกิลเดียวกันได้
  const cleanseRaw = (payload.cleanse && typeof payload.cleanse === 'object') ? payload.cleanse : {};
  const cleanseEnabled = !!cleanseRaw.enabled;
  const cleanseName = cleanseEnabled ? (cleanseRaw.name || '').toString().trim().slice(0, 24) : '';

  const skill = { id: dndNextSkillId++, name, stat, desc, dmgDie, dmgCount, dmgMod, healDie, healCount, healMod, statusName: status.name, statusNote: status.note, assignedIds, cooldownSec, maxUses, aoeRadius, cleanseEnabled, cleanseName };
  dndSkills.push(skill);
  const assignedNames = assignedIds.map(id => { const pp = dndPlayers.find(pp => pp.id === id); return pp ? (pp.character.charName || pp.name) : null; }).filter(Boolean);
  const assignText = assignedNames.length ? ` — มอบให้: ${assignedNames.join(', ')}` : ' — ทั้งปาร์ตี้ใช้ได้';
  const ruleText = `${cooldownSec ? ` (คูลดาวน์ ${cooldownSec}วิ)` : ''}${maxUses ? ` (ใช้ได้ ${maxUses} ครั้ง)` : ''}`;
  dndAddLog(`✨ DM ออกแบบสกิลใหม่: ${name}${stat ? ` (ผูก ${stat.toUpperCase()})` : ''}${dmgDie ? ` (ดาเมจ ${dmgCount}d${dmgDie}${dmgMod ? (dmgMod > 0 ? '+' + dmgMod : dmgMod) : ''})` : ''}${healDie ? ` (ชุบ HP ${healCount}d${healDie}${healMod ? (healMod > 0 ? '+' + healMod : healMod) : ''})` : ''}${status.name ? ` (ติดสถานะ "${status.name}")` : ''}${aoeRadius ? ` (💥 AOE รัศมี ${aoeRadius})` : ''}${cleanseEnabled ? ` (✨ ลบล้างสถานะ${cleanseName ? ` "${cleanseName}"` : 'ทั้งหมด'})` : ''}${ruleText}${assignText}`);
}
// DM แก้ไขสกิลที่มีอยู่แล้วได้ทุกเมื่อ — เปลี่ยนรายละเอียด, คูลดาวน์, จำนวนครั้ง, หรือมอบ/ถอนสิทธิ์ให้ผู้เล่นคนไหนก็ได้
function dndHandleSkillEdit(ws, skillId, payload) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM || !payload || typeof payload !== 'object') return;
  const skill = dndSkills.find(s => s.id === Number(skillId));
  if (!skill) return;

  const name = (payload.name || '').toString().trim().slice(0, 40);
  if (!name) { dndSendError(ws, 'กรุณาตั้งชื่อสกิล'); return; }
  const statRaw = (payload.stat || '').toString();
  const stat = DND_SKILL_STATS.includes(statRaw) ? statRaw : '';
  const desc = (payload.desc || '').toString().trim().slice(0, 200);

  const dmg = (payload.damage && typeof payload.damage === 'object') ? payload.damage : {};
  const dmgDie = DND_VALID_DICE.includes(Number(dmg.die)) ? Number(dmg.die) : 0;
  const dmgCount = Math.max(1, Math.min(20, Math.round(Number(dmg.count) || 1)));
  const dmgMod = Math.max(-100, Math.min(100, Math.round(Number(dmg.mod) || 0)));
  const cooldownSec = Math.max(0, Math.min(3600, Math.round(Number(payload.cooldownSec) || 0)));
  const maxUses = Math.max(0, Math.min(99, Math.round(Number(payload.maxUses) || 0)));

  const heal = (payload.heal && typeof payload.heal === 'object') ? payload.heal : {};
  const healDie = DND_VALID_DICE.includes(Number(heal.die)) ? Number(heal.die) : 0;
  const healCount = Math.max(1, Math.min(20, Math.round(Number(heal.count) || 1)));
  const healMod = Math.max(-100, Math.min(100, Math.round(Number(heal.mod) || 0)));

  // สถานะ/ดีบัฟที่ผูกกับสกิล (ไม่บังคับ) — แก้ไขได้เหมือนดาเมจ/ฮีล
  const status = dndSanitizeSkillStatus(payload.status);

  // รัศมี AOE (0 = เป้าเดี่ยวปกติ) — ดูรายละเอียดหน่วยที่ dndHandleSkillCreate
  const aoeRaw = (payload.aoe && typeof payload.aoe === 'object') ? payload.aoe : {};
  const aoeRadius = Math.max(0, Math.min(100, Math.round(Number(aoeRaw.radius) || 0)));

  // สกิลลบล้างสถานะ (cleanse) — ดูรายละเอียดที่ dndHandleSkillCreate
  const cleanseRaw = (payload.cleanse && typeof payload.cleanse === 'object') ? payload.cleanse : {};
  const cleanseEnabled = !!cleanseRaw.enabled;
  const cleanseName = cleanseEnabled ? (cleanseRaw.name || '').toString().trim().slice(0, 24) : '';

  const assignedIds = Array.isArray(payload.assignedIds)
    ? payload.assignedIds.map(Number).filter(id => dndPlayers.some(pp => pp.id === id))
    : [];

  skill.name = name; skill.stat = stat; skill.desc = desc;
  skill.dmgDie = dmgDie; skill.dmgCount = dmgCount; skill.dmgMod = dmgMod;
  skill.healDie = healDie; skill.healCount = healCount; skill.healMod = healMod;
  skill.statusName = status.name; skill.statusNote = status.note;
  skill.cooldownSec = cooldownSec; skill.maxUses = maxUses;
  skill.assignedIds = assignedIds;
  skill.aoeRadius = aoeRadius;
  skill.cleanseEnabled = cleanseEnabled; skill.cleanseName = cleanseName;

  const assignedNames = assignedIds.map(id => { const pp = dndPlayers.find(pp => pp.id === id); return pp ? (pp.character.charName || pp.name) : null; }).filter(Boolean);
  const assignText = assignedNames.length ? ` — มอบให้: ${assignedNames.join(', ')}` : ' — ทั้งปาร์ตี้ใช้ได้';
  dndAddLog(`✏️ DM แก้ไขสกิล: ${name}${status.name ? ` (ติดสถานะ "${status.name}")` : ''}${assignText}`);
}
function dndHandleSkillDelete(ws, skillId) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  const idx = dndSkills.findIndex(s => s.id === Number(skillId));
  if (idx === -1) return;
  const [removed] = dndSkills.splice(idx, 1);
  dndAddLog(`DM ลบสกิล: ${removed.name}`);
}
// ใช้สกิลได้ถ้าเป็น DM, หรือสกิลนั้นไม่ได้ระบุผู้ใช้เฉพาะ (ทั้งปาร์ตี้ใช้ได้), หรือถูกมอบให้ตัวเอง
// ถ้าสกิลผูกสเตตัสไว้ จะทอย d20 + ตัวปรับค่าของสเตตัสนั้นให้อัตโนมัติ และถ้ากำหนดดาเมจไว้ จะทอยดาเมจแยกให้ด้วย
function dndSanitizeLoot(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 30).map(item => {
    const name = (item && item.name || '').toString().trim().slice(0, 50);
    const qty = Math.max(1, Math.min(999, Math.round(Number(item && item.qty) || 1)));
    return name ? { id: dndNextLootId++, name, qty } : null;
  }).filter(Boolean);
}
// แจกรางวัลให้ "คนที่กดโจมตี/ใช้สกิลจนมอนสเตอร์ตาย" เท่านั้น (ไม่ใช่ทั้งปาร์ตี้)
// ก่อนหน้านี้มีบั๊ก: รับ killerPlayer มาแต่ไม่ได้ใช้ กลับแจก EXP/ทอง/ไอเทมให้ทุกคนในปาร์ตี้เท่ากันหมด
// ทำให้ EXP ของคนที่ไม่ได้ลงมือฆ่าถูกบวกเพิ่มไปด้วย เหมือน "ทับ" กับ EXP ที่ควรเป็นของคนอื่นคนเดียว
function dndGrantRewardsForDefeat(token, killerPlayer) {
  const exp = Math.max(0, Math.round(Number(token.expReward) || 0));
  const gold = Math.max(0, Math.round(Number(token.goldReward) || 0));
  const loot = Array.isArray(token.loot) ? token.loot : [];
  if (!killerPlayer || killerPlayer.isDM || !killerPlayer.character || !killerPlayer.character.locked) return;
  const pp = killerPlayer;
  const oldLevel = dndLevelFromExp(pp.character.exp);
  pp.character.exp = Math.max(0, Math.round(Number(pp.character.exp) || 0)) + exp;
  pp.character.gold = Math.max(0, Math.round(Number(pp.character.gold) || 0)) + gold;
  const levelInfo = dndSyncLevelFromExp(pp.character);
  if (levelInfo.newLevel > oldLevel) {
    dndAddLog(`🎉 ${pp.character.charName || pp.name} เลเวลอัป! Lv.${oldLevel} → Lv.${levelInfo.newLevel}`);
    dndAnnounceClassSkillUnlocks(pp, oldLevel, levelInfo.newLevel);
  }
  if (loot.length) {
    for (const item of loot) dndBagAdd(pp.character, item.name, item.qty);
  }
  const rewardParts = [];
  if (exp) rewardParts.push(`✨ EXP +${exp}`);
  if (gold) rewardParts.push(`💰 ทอง +${gold}`);
  if (loot.length) rewardParts.push(`🎁 ${loot.map(item => `${item.name} x${item.qty}`).join(', ')}`);
  if (rewardParts.length) dndAddLog(`🎉 ${token.name} ถูกกำจัด — แจกให้ ${pp.character.charName || pp.name}: ${rewardParts.join(' | ')}`);
}
function dndCheckTokenDefeat(token, killerPlayer) {
  if (token._rewarded || token.hp > 0) return;
  token._rewarded = true;
  dndGrantRewardsForDefeat(token, killerPlayer);
}

// ส่งข้อมูลผลทอยแบบสด ๆ ให้ทุกคนเล่นแอนิเมชันทอยลูกเต๋าตอนโจมตี (แยกจาก log ข้อความ)
function dndBroadcastAttackAnim(payload) {
  const data = JSON.stringify(Object.assign({ type: 'dndAttackAnim' }, payload));
  for (const p of dndPlayers) {
    if (p.ws && p.ws.readyState === WebSocket.OPEN) p.ws.send(data);
  }
}
function dndFindCombatTarget(targetType, targetId) {
  if (targetType === 'token') {
    const t = dndTokens.find(tt => tt.id === Number(targetId) && tt.kind === 'npc');
    if (!t) return null;
    const defMod = dndStatusMods(t.statuses).def;
    const obj = { type: 'token', id: t.id, name: t.name, hp: t.hp, maxHp: t.maxHp, ac: Math.max(0, t.ac + defMod) };
    obj.applyDamage = dmg => { t.hp = Math.max(0, Math.min(t.maxHp, t.hp - dmg)); obj.hp = t.hp; };
    return obj;
  }
  if (targetType === 'player') {
    const target = dndPlayers.find(pp => pp.id === Number(targetId));
    if (!target) return null;
    const defMod = dndStatusMods(target.character.statuses).def;
    const obj = { type: 'player', id: target.id, name: target.character.charName || target.name, hp: target.character.hp, maxHp: target.character.maxHp, ac: Math.max(0, target.character.ac + defMod) };
    obj.applyDamage = dmg => {
      const wasDead = dndIsCharDead(target.character);
      target.character.hp = Math.max(0, Math.min(target.character.maxHp, target.character.hp - dmg));
      obj.hp = target.character.hp;
      if (!wasDead && dndIsCharDead(target.character)) dndAddLog(`💀 ${obj.name} หมดสติ! ทำอะไรไม่ได้จนกว่าจะมีคนใช้ไอเทมชุบให้ หรือ DM เพิ่ม HP ให้`);
    };
    // ชุบ HP ให้เป้าหมาย — ใช้กับสกิลชุบของ DM ได้ รวมถึงชุบคนหมดสติ (HP 0) ให้ฟื้นกลับมาได้ด้วย
    obj.applyHeal = amount => {
      const wasDead = dndIsCharDead(target.character);
      target.character.hp = Math.max(0, Math.min(target.character.maxHp, target.character.hp + amount));
      obj.hp = target.character.hp;
      const revived = wasDead && !dndIsCharDead(target.character);
      if (revived) dndAddLog(`🌟 ${obj.name} ฟื้นจากหมดสติแล้ว!`);
      return { revived };
    };
    return obj;
  }
  return null;
}
function dndHandleSkillUse(ws, skillId, targetType, targetId) {
  const p = dndFindByWs(ws);
  if (!p) return;
  if (!p.isDM && dndIsCharDead(p.character)) { dndSendError(ws, DND_DEAD_MSG); return; }
  const skill = dndFindUsableSkill(p, skillId);
  if (!skill) return;
  if (skill.locked) { dndSendError(ws, `สกิล "${skill.name}" จะปลดล็อกตอนเลเวล ${skill.level}`); return; }
  const allowed = p.isDM || !skill.assignedIds || skill.assignedIds.length === 0 || skill.assignedIds.includes(p.id);
  if (!allowed) { dndSendError(ws, 'คุณไม่มีสิทธิ์ใช้สกิลนี้'); return; }
  if (!p.isDM && dndTurnIndex >= 0 && dndCurrentTurnPlayerId() !== p.id) {
    dndSendError(ws, 'ยังไม่ถึงตาคุณ รอให้ถึงตาก่อนถึงจะใช้สกิลได้');
    return;
  }

  const target = dndFindCombatTarget(targetType, targetId);
  if (!target) { dndSendError(ws, 'กรุณาเลือกเป้าหมายที่ถูกต้อง'); return; }
  const isHealSkill = skill.healDie > 0;
  if (isHealSkill && target.type !== 'player') { dndSendError(ws, 'สกิลชุบ HP ต้องเลือกเป้าหมายเป็นผู้เล่นเท่านั้น'); return; }
  const isCleanseSkill = !!skill.cleanseEnabled;
  if (isCleanseSkill && target.type !== 'player') { dndSendError(ws, 'สกิลลบล้างสถานะต้องเลือกเป้าหมายเป็นผู้เล่นเท่านั้น'); return; }

  if (!p.isDM) {
    const now = Date.now();
    const readyAt = (p.skillReadyAt && p.skillReadyAt[skill.id]) || 0;
    if (readyAt > now) {
      dndSendError(ws, `สกิล "${skill.name}" ยังคูลดาวน์อยู่ อีก ${Math.ceil((readyAt - now) / 1000)} วินาที`);
      return;
    }
    if (skill.maxUses > 0) {
      const used = (p.skillUsedCount && p.skillUsedCount[skill.id]) || 0;
      if (used >= skill.maxUses) {
        dndSendError(ws, `ใช้สกิล "${skill.name}" ครบ ${skill.maxUses} ครั้งที่กำหนดไว้แล้ว`);
        return;
      }
    }
  }

  const charName = p.character.charName || p.name;
  const parts = [];
  let attackRoll = null, attackMod = 0, attackTotal = null, hit = null, crit = false, fumble = false;
  const passive = dndCharPassiveEffect(p.character);
  const statusMods = dndStatusMods(p.character && p.character.statuses);
  const hasAttackRoll = !isHealSkill && !isCleanseSkill && skill.stat && DND_SKILL_STATS.includes(skill.stat);
  if (hasAttackRoll) {
    const score = Number(p.character[skill.stat]) || 10;
    const mod = dndAbilityMod(score) + passive.atk + statusMods.atk;
    const modStr = mod ? (mod > 0 ? ` +${mod}` : ` ${mod}`) : '';
    const roll = 1 + Math.floor(Math.random() * 20);
    const res = dndRollVsAC(roll, mod, target.ac, passive.critRange);
    attackRoll = roll; attackMod = mod; attackTotal = res.total; hit = res.hit; crit = res.crit; fumble = res.fumble;
    const hitTag = fumble ? ' 💨 พลาดสุด ๆ' : (!hit ? ' 🛡️ พลาด! หลบได้' : (crit ? ' 🎯 คริติคอล!' : ' ✅ โดน'));
    parts.push(`🎯 โจมตี 1d20${modStr} = [${roll}]${modStr} = ${res.total} vs AC ${target.ac} —${hitTag}`);
  }
  if (hasAttackRoll && hit && target.type === 'player') {
    const targetPlayer = dndPlayers.find(pp => pp.id === Number(targetId));
    const wear = dndWearArmorOnHit(targetPlayer);
    if (wear) {
      parts.push(wear.broken
        ? `💔 เกราะ "${wear.armor.name}" ของ ${target.name} ชำรุด! หมดความคงทน ไม่ได้รับโบนัสป้องกันอีกจนกว่าจะซ่อม`
        : `🛠️ เกราะ "${wear.armor.name}" ของ ${target.name} สึกไป 1 (คงทนเหลือ ${wear.armor.durability}/${wear.armor.maxDurability})`);
    }
  }
  let damage = 0;
  let dmgRolls = null;
  let aoeHitsForAnim = [];
  if (skill.dmgDie && !isHealSkill && (!hasAttackRoll || hit)) {
    const effDmgMod = skill.dmgMod + passive.dmg + statusMods.dmg;
    const dmg = dndRollDamage(skill.dmgDie, skill.dmgCount, effDmgMod, crit);
    dmgRolls = dmg.rolls; damage = dmg.damage;
    const dmgModStr = effDmgMod ? (effDmgMod > 0 ? ` +${effDmgMod}` : ` ${effDmgMod}`) : '';
    parts.push(`💥 ดาเมจ ${dmgRolls.length}d${skill.dmgDie}${dmgModStr} = [${dmgRolls.join(', ')}]${dmgModStr} = ${damage}`);
    const oldHp = target.hp;
    target.applyDamage(damage);
    if (target.type === 'token') dndCheckTokenDefeat(dndTokens.find(tt => tt.id === target.id), p);
    // ไม่บอกเลือดที่เหลือของมอนสเตอร์ในข้อความแชท — ผู้เล่นจะไม่รู้ HP มอนสเตอร์จากตรงนี้
    if (target.type !== 'token') parts.push(`❤️ ${target.name} HP ${oldHp} → ${target.hp}`);

    // ---- AOE: ถ้าสกิลตั้งรัศมีไว้ (>0) ให้กระจายดาเมจไปยังเป้าหมายอื่น ๆ รอบเป้าหมายหลักบนแผนที่ด้วย
    // ดาเมจจะลดหลั่นเป็นเส้นตรงตามระยะห่างจากจุดศูนย์กลาง (เป้าหมายหลัก): ระยะ 0 = โดนเต็ม ระยะเท่ารัศมี = ดาเมจ 0
    if (skill.aoeRadius > 0 && damage > 0) {
      const center = dndTargetMapPos(target.type, target.id);
      if (center) {
        const aoeParts = [];
        for (const cand of dndAoeCandidates()) {
          if (cand.type === target.type && cand.id === target.id) continue; // เป้าหมายหลักโดนดาเมจเต็มไปแล้วด้านบน ไม่ต้องนับซ้ำ
          const dist = Math.hypot(cand.pos.x - center.x, cand.pos.y - center.y);
          if (dist > skill.aoeRadius) continue; // อยู่นอกรัศมี ไม่โดน
          const aoeDmg = Math.round(damage * Math.max(0, 1 - dist / skill.aoeRadius));
          if (aoeDmg <= 0) continue;
          const aoeTarget = dndFindCombatTarget(cand.type, cand.id);
          if (!aoeTarget) continue;
          const aoeOldHp = aoeTarget.hp;
          aoeTarget.applyDamage(aoeDmg);
          if (aoeTarget.type === 'token') dndCheckTokenDefeat(dndTokens.find(tt => tt.id === aoeTarget.id), p);
          aoeHitsForAnim.push({ tokenId: cand.type === 'token' ? aoeTarget.id : dndPcTokenId(aoeTarget.id), damage: aoeDmg });
          aoeParts.push(aoeTarget.type === 'token'
            ? `${aoeTarget.name} -${aoeDmg} (ระยะ ${dist.toFixed(1)})`
            : `${aoeTarget.name} -${aoeDmg} HP ${aoeOldHp}→${aoeTarget.hp} (ระยะ ${dist.toFixed(1)})`);
        }
        if (aoeParts.length) parts.push(`🌊 AOE รัศมี ${skill.aoeRadius}: ${aoeParts.join(', ')}`);
      }
    }
  }
  let heal = 0;
  let healRolls = null;
  if (skill.healDie && target.type === 'player') {
    const effHealMod = skill.healMod;
    const h = dndRollDamage(skill.healDie, skill.healCount, effHealMod, false);
    healRolls = h.rolls; heal = h.damage;
    const healModStr = effHealMod ? (effHealMod > 0 ? ` +${effHealMod}` : ` ${effHealMod}`) : '';
    const oldHp = target.hp;
    const res = target.applyHeal(heal);
    parts.push(`💚 ชุบ HP ${healRolls.length}d${skill.healDie}${healModStr} = [${healRolls.join(', ')}]${healModStr} = ${heal}`);
    parts.push(`❤️ ${target.name} HP ${oldHp} → ${target.hp}${res.revived ? ' — 🌟 ฟื้นจากหมดสติแล้ว!' : ''}`);
  }
  // ลบล้างสถานะ/ดีบัฟผิดปกติออกจากเป้าหมาย — cleanseName ว่าง = ล้างสถานะทั้งหมด, ไม่ว่าง = ล้างเฉพาะชื่อที่ตรงกัน (ไม่สนตัวพิมพ์เล็ก-ใหญ่)
  if (isCleanseSkill) {
    const statusTarget = dndFindStatusTarget(target.type, target.id);
    if (statusTarget) {
      const matchName = (skill.cleanseName || '').trim().toLowerCase();
      const cleansed = [];
      for (let i = statusTarget.list.length - 1; i >= 0; i--) {
        const s = statusTarget.list[i];
        if (!matchName || (s.name || '').trim().toLowerCase() === matchName) {
          cleansed.push(s.name);
          statusTarget.list.splice(i, 1);
        }
      }
      parts.push(cleansed.length
        ? `✨ ลบล้างสถานะ: ${cleansed.join(', ')} ออกจาก ${target.name}`
        : `✨ ${target.name} ไม่มีสถานะที่ตรงเงื่อนไขให้ลบล้าง`);
    }
  }
  // ติดสถานะ/ดีบัฟที่ผูกไว้กับสกิล (ถ้ามี) ให้เป้าหมายที่เลือกไว้ — ใช้ได้ทั้งเป้าหมายที่เป็นผู้เล่นและมอนสเตอร์ ไม่ต้องทอยโจมตีก่อน (นอกจากสกิลนี้จะมีดาเมจ/ทอยโจมตีอยู่แล้วและพลาด)
  if (skill.statusName && (!hasAttackRoll || hit)) {
    const statusTarget = dndFindStatusTarget(target.type, target.id);
    if (statusTarget) {
      statusTarget.list.push({ id: dndNextStatusId++, name: skill.statusName, note: skill.statusNote });
      parts.push(`☠️ ติดสถานะ "${skill.statusName}"${skill.statusNote ? ` (${skill.statusNote})` : ''} ให้ ${target.name}`);
    }
  }
  const dealtDamage = skill.dmgDie && !isHealSkill && (!hasAttackRoll || hit);
  if (attackRoll !== null || dealtDamage) {
    dndBroadcastAttackAnim({
      atkKey: 'p' + p.id,
      attacker: charName, target: target.name, targetType: target.type, skillName: skill.name,
      atkTokenId: dndPcTokenId(p.id), tgtTokenId: target.type === 'token' ? target.id : dndPcTokenId(target.id),
      attackRoll, attackMod, attackTotal, targetAC: target.ac, hit, crit, fumble,
      dmgDie: dealtDamage ? skill.dmgDie : null, dmgCount: dealtDamage ? dmgRolls.length : 0, dmgRolls: dealtDamage ? dmgRolls : null, dmgMod: (skill.dmgMod || 0) + passive.dmg + statusMods.dmg, damage: dealtDamage ? damage : null,
      aoeRadius: skill.aoeRadius || 0, aoeHits: aoeHitsForAnim,
    });
  }
  if (!p.isDM) {
    p.skillUsedCount = p.skillUsedCount || {};
    p.skillUsedCount[skill.id] = ((p.skillUsedCount[skill.id]) || 0) + 1;
    if (skill.cooldownSec > 0) {
      p.skillReadyAt = p.skillReadyAt || {};
      p.skillReadyAt[skill.id] = Date.now() + skill.cooldownSec * 1000;
    }
  }

  if (parts.length) dndAddLog(`✨ ${charName} ใช้สกิล "${skill.name}" ใส่ ${target.name}: ${parts.join(' | ')}`);
  else dndAddLog(`✨ ${charName} ใช้สกิล "${skill.name}" ใส่ ${target.name}`);
}

function dndHandleNormalAttack(ws, targetType, targetId) {
  const p = dndFindByWs(ws);
  if (!p || p.isDM) return;
  if (dndIsCharDead(p.character)) { dndSendError(ws, DND_DEAD_MSG); return; }
  if (dndTurnIndex >= 0 && dndCurrentTurnPlayerId() !== p.id) {
    dndSendError(ws, 'ยังไม่ถึงตาคุณ รอให้ถึงตาก่อนถึงจะโจมตีได้');
    return;
  }
  const target = dndFindCombatTarget(targetType, targetId);
  if (!target || target.hp <= 0) { dndSendError(ws, 'กรุณาเลือกมอนสเตอร์ที่ยังมี HP'); return; }
  const c = p.character || {};
  const strMod = dndAbilityMod(Number(c.str) || 10);
  const dexMod = dndAbilityMod(Number(c.dex) || 10);
  const abilityMod = Math.max(strMod, dexMod);
  const equipAtk = dndTotalAttack(c.equipment);
  const passive = dndCharPassiveEffect(c);
  const statusMods = dndStatusMods(c.statuses);
  const mod = abilityMod + equipAtk + passive.atk + statusMods.atk;
  const attackRoll = 1 + Math.floor(Math.random() * 20);
  const res = dndRollVsAC(attackRoll, mod, target.ac, passive.critRange);
  const modStr = mod >= 0 ? ` +${mod}` : ` ${mod}`;
  let damage = 0, damageRolls = [];
  if (res.hit) {
    const dmg = dndRollDamage(6, 1, mod + passive.dmg + statusMods.dmg, res.crit);
    damage = dmg.damage; damageRolls = dmg.rolls;
    const oldHp = target.hp;
    target.applyDamage(damage);
    if (target.type === 'token') dndCheckTokenDefeat(dndTokens.find(tt => tt.id === target.id), p);
    void oldHp;
  }
  const hitTag = res.fumble ? ' | 💨 พลาดสุด ๆ (ทอยได้ 1)' : (!res.hit ? ' | 🛡️ พลาด! หลบได้' : (res.crit ? ' | 🎯 คริติคอล!' : ' | ✅ โดน'));
  // ไม่บอกเลือดที่เหลือของมอนสเตอร์ในข้อความแชท — ผู้เล่นจะไม่รู้ HP มอนสเตอร์จากตรงนี้
  const hpPart = (res.hit && target.type !== 'token') ? ` | ❤️ ${target.name} HP ${target.hp + damage} → ${target.hp}` : '';
  const dmgPart = res.hit ? ` | 💥 ${damageRolls.length}d6${modStr} = [${damageRolls.join(', ')}]${modStr} = ${damage}` : '';
  dndAddLog(`⚔️ ${c.charName || p.name} โจมตีปกติใส่ ${target.name}: 🎯 1d20${modStr} = [${attackRoll}] = ${res.total} vs AC ${target.ac}${hitTag}${dmgPart}${hpPart}`);
  dndBroadcastAttackAnim({
    atkKey: 'p' + p.id,
    attacker: c.charName || p.name, target: target.name, targetType: target.type,
    atkTokenId: dndPcTokenId(p.id), tgtTokenId: target.type === 'token' ? target.id : dndPcTokenId(target.id),
    attackRoll, attackMod: mod, attackTotal: res.total, targetAC: target.ac, hit: res.hit, crit: res.crit, fumble: res.fumble,
    dmgDie: res.hit ? 6 : null, dmgCount: res.hit ? damageRolls.length : 0, dmgRolls: res.hit ? damageRolls : null, dmgMod: mod, damage: res.hit ? damage : null,
  });
}

// ---- แผนที่การต่อสู้ (Battle Map): ผู้เล่นลากได้แค่ token ตัวเอง, DM ลากได้ทุกอันและสร้าง/ลบ NPC ได้ ----
function dndHandleTokenMove(ws, id, x, y) {
  const p = dndFindByWs(ws);
  if (!p) return;
  const t = dndTokens.find(tt => tt.id === Number(id));
  if (!t) return;
  const isOwner = t.kind === 'pc' && t.ownerId === p.id;
  if (!p.isDM && !isOwner) return;
  if (isOwner && dndIsCharDead(p.character)) { dndSendError(ws, DND_DEAD_MSG); return; }
  const nx = Number(x), ny = Number(y);
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
  const cx = Math.max(0, Math.min(100, nx));
  const cy = Math.max(0, Math.min(100, ny));
  if (t.kind === 'pc') {
    t.positions = t.positions || {};
    t.positions[dndCurrentMapId] = { x: cx, y: cy }; // ตำแหน่งผูกกับแผนที่ที่กำลังแสดงอยู่ตอนนี้เท่านั้น
  } else {
    if (t.mapId !== dndCurrentMapId) return; // มอนสเตอร์อยู่คนละแผนที่ ลากไม่ได้
    t.x = cx; t.y = cy;
  }
  dndBroadcastState(); // ไม่บันทึกลง log เพื่อไม่ให้สแปมระหว่างลาก
}
function dndHandleTokenCreate(ws, payload) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM || !payload || typeof payload !== 'object') return;
  const name = (payload.name || '').toString().trim().slice(0, 20) || 'NPC';
  const color = typeof payload.color === 'string' && payload.color ? payload.color.slice(0, 20) : DND_TOKEN_COLORS[dndTokens.length % DND_TOKEN_COLORS.length];
  let image = null;
  if (typeof payload.image === 'string' && payload.image.startsWith('data:image/') && payload.image.length <= DND_MAX_TOKEN_IMAGE_CHARS) {
    image = payload.image;
  }
  const maxHp = Math.max(1, Math.min(9999, Math.round(Number(payload.maxHp) || 20)));
  const ac = Math.max(0, Math.min(40, Math.round(Number(payload.ac) || 10)));
  const size = DND_TOKEN_SIZES.includes(payload.size) ? payload.size : 'normal';
  const pos = dndRandomTokenPos();
  const stats = {};
  DND_SKILL_STATS.forEach(stat => {
    const n = Number(payload[stat]);
    stats[stat] = Number.isFinite(n) ? Math.max(1, Math.min(30, Math.round(n))) : 10;
  });
  // อนุญาตให้ส่งท่าโจมตี/ของดรอป/รางวัลมาพร้อมกันได้เลย (ใช้กับมอนสเตอร์สำเร็จรูป) — ยังผ่านการ sanitize เหมือนเดิมทุกจุด
  const attacks = Array.isArray(payload.attacks)
    ? payload.attacks.slice(0, 20).map(a => Object.assign({ id: dndNextAttackId++ }, dndSanitizeAttackPayload(a || {})))
    : [];
  const expReward = Math.max(0, Math.min(999999, Math.round(Number(payload.expReward) || 0)));
  const goldReward = Math.max(0, Math.min(999999, Math.round(Number(payload.goldReward) || 0)));
  const loot = dndSanitizeLoot(payload.loot);
  dndTokens.push({
    id: dndNextTokenId++, kind: 'npc', ownerId: null, name, color, image, x: pos.x, y: pos.y, mapId: dndCurrentMapId, size,
    hp: maxHp, maxHp, ac, ...stats, attacks, statuses: [], expReward, goldReward, loot,
  });
  dndAddLog(`🗺️ DM เพิ่ม token "${name}" ลงแผนที่ "${dndCurrentMap().name}" (HP ${maxHp}, AC ${ac})`);
}
// ตั้งชื่อสำเนามอนสเตอร์ต่อท้ายด้วย "+1" — ถ้าชื่อเดิมมี "+N" อยู่แล้ว (คัดลอกจากสำเนาอีกที) ให้เพิ่มเลขต่อ (+2, +3, ...)
function dndNextCopyName(name) {
  const m = /^(.*) \+(\d+)$/.exec(name || '');
  if (m) return `${m[1]} +${Number(m[2]) + 1}`;
  return `${name} +1`;
}
// DM คัดลอกมอนสเตอร์ที่มีอยู่แล้ว (รวมท่าโจมตีและของดรอปทั้งหมด) เป็นตัวใหม่ลงแผนที่เดิม — สะดวกเวลาต้องการมอนสเตอร์ตัวเดิมหลายตัว
function dndHandleTokenDuplicate(ws, id) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  const t = dndTokens.find(tt => tt.id === Number(id) && tt.kind === 'npc');
  if (!t) return;
  const copyName = dndNextCopyName(t.name);
  const copy = {
    id: dndNextTokenId++, kind: 'npc', ownerId: null,
    name: copyName, color: t.color, image: t.image || null,
    x: Math.max(0, Math.min(100, t.x + 4)), y: Math.max(0, Math.min(100, t.y + 4)), mapId: t.mapId,
    hp: t.maxHp, maxHp: t.maxHp, ac: t.ac, size: t.size || 'normal',
    str: t.str || 10, dex: t.dex || 10, con: t.con || 10, int: t.int || 10, wis: t.wis || 10, cha: t.cha || 10,
    attacks: (t.attacks || []).map(a => Object.assign({}, a, { id: dndNextAttackId++ })),
    statuses: [], // สถานะ/ดีบัฟไม่คัดลอกตามมา เพราะเป็นของเฉพาะตัวที่เกิดขึ้นระหว่างเล่น
    expReward: t.expReward || 0, goldReward: t.goldReward || 0,
    loot: (t.loot || []).map(item => Object.assign({}, item, { id: dndNextLootId++ })),
  };
  dndTokens.push(copy);
  dndAddLog(`📋 DM คัดลอก token "${t.name}" เป็น "${copyName}" เพิ่มอีกตัวลงแผนที่ "${dndCurrentMap().name}"`);
}
function dndHandleTokenEdit(ws, id, updates) {
  const p = dndFindByWs(ws);
  if (!p || !updates || typeof updates !== 'object') return;
  const t = dndTokens.find(tt => tt.id === Number(id));
  if (!t) return;
  const isOwner = t.kind === 'pc' && t.ownerId === p.id;
  if (!p.isDM && !isOwner) return;
  if (typeof updates.color === 'string' && updates.color) t.color = updates.color.slice(0, 20);
  if (updates.image === null) {
    t.image = null;
  } else if (typeof updates.image === 'string' && updates.image.startsWith('data:image/') && updates.image.length <= DND_MAX_TOKEN_IMAGE_CHARS) {
    t.image = updates.image;
  }
  if (p.isDM && t.kind === 'npc') {
    if (typeof updates.name === 'string') {
      const nm = updates.name.trim().slice(0, 20);
      if (nm) t.name = nm;
    }
    if (updates.maxHp !== undefined) {
      const n = Number(updates.maxHp);
      if (Number.isFinite(n)) t.maxHp = Math.max(1, Math.min(9999, Math.round(n)));
    }
    if (updates.hp !== undefined) {
      const n = Number(updates.hp);
      if (Number.isFinite(n)) t.hp = Math.max(0, Math.min(t.maxHp, Math.round(n)));
    }
    if (updates.ac !== undefined) {
      const n = Number(updates.ac);
      if (Number.isFinite(n)) t.ac = Math.max(0, Math.min(40, Math.round(n)));
    }
    if (updates.size !== undefined && DND_TOKEN_SIZES.includes(updates.size)) t.size = updates.size;
    DND_SKILL_STATS.forEach(stat => {
      if (updates[stat] !== undefined) {
        const n = Number(updates[stat]);
        if (Number.isFinite(n)) t[stat] = Math.max(1, Math.min(30, Math.round(n)));
      }
    });
    if (updates.expReward !== undefined) { const n = Number(updates.expReward); if (Number.isFinite(n)) t.expReward = Math.max(0, Math.min(999999, Math.round(n))); }
    if (updates.goldReward !== undefined) { const n = Number(updates.goldReward); if (Number.isFinite(n)) t.goldReward = Math.max(0, Math.min(999999, Math.round(n))); }
    if (updates.loot !== undefined) t.loot = dndSanitizeLoot(updates.loot);
    if (t.hp > 0) t._rewarded = false;
  }
  dndBroadcastState();
}
function dndHandleTokenDelete(ws, id) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  const idx = dndTokens.findIndex(tt => tt.id === Number(id) && tt.kind === 'npc');
  if (idx === -1) return;
  const [removed] = dndTokens.splice(idx, 1);
  dndAddLog(`🗺️ DM ลบ token "${removed.name}" ออกจากแผนที่`);
}

// ---- ท่าโจมตีของมอนสเตอร์ (DM เท่านั้น ผูกกับ NPC token แต่ละตัว) ----
function dndSanitizeAttackPayload(payload) {
  const name = (payload.name || '').toString().trim().slice(0, 30) || 'โจมตี';
  const desc = (payload.desc || '').toString().trim().slice(0, 150);
  const statRaw = (payload.stat || '').toString();
  const stat = DND_SKILL_STATS.includes(statRaw) ? statRaw : '';
  const toHit = Math.max(-20, Math.min(20, Math.round(Number(payload.toHit) || 0)));
  const dmgDie = DND_VALID_DICE.includes(Number(payload.dmgDie)) ? Number(payload.dmgDie) : 0;
  const dmgCount = Math.max(1, Math.min(20, Math.round(Number(payload.dmgCount) || 1)));
  const dmgMod = Math.max(-100, Math.min(100, Math.round(Number(payload.dmgMod) || 0)));
  // รัศมี AOE (0-100, 0 = เป้าเดี่ยวปกติเหมือนเดิม) — ถ้าตั้งไว้ ดาเมจจะกระจายไปโดนผู้เล่นคนอื่นที่อยู่รอบเป้าหมายหลักบนแผนที่ด้วย เหมือนกลไก AOE ของสกิลผู้เล่น
  const aoeRadius = Math.max(0, Math.min(100, Math.round(Number(payload.aoeRadius) || 0)));
  return { name, desc, stat, toHit, dmgDie, dmgCount, dmgMod, aoeRadius };
}
function dndHandleTokenAttackAdd(ws, tokenId, payload) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM || !payload || typeof payload !== 'object') return;
  const t = dndTokens.find(tt => tt.id === Number(tokenId) && tt.kind === 'npc');
  if (!t) return;
  const atk = Object.assign({ id: dndNextAttackId++ }, dndSanitizeAttackPayload(payload));
  t.attacks = t.attacks || [];
  t.attacks.push(atk);
  dndAddLog(`🗡️ DM เพิ่มท่าโจมตี "${atk.name}" ให้ "${t.name}"`);
}
function dndHandleTokenAttackEdit(ws, tokenId, attackId, payload) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM || !payload || typeof payload !== 'object') return;
  const t = dndTokens.find(tt => tt.id === Number(tokenId) && tt.kind === 'npc');
  if (!t || !t.attacks) return;
  const idx = t.attacks.findIndex(a => a.id === Number(attackId));
  if (idx === -1) return;
  t.attacks[idx] = Object.assign({ id: t.attacks[idx].id }, dndSanitizeAttackPayload(payload));
  dndBroadcastState();
}
// ระบบสึกหรอของเกราะ: เฉพาะ "เกราะ" ของผู้เล่นที่โดนมอนสเตอร์ตีเข้าเท่านั้น (ไม่ใช้กับมอนสเตอร์)
// เงื่อนไข: โดนตีครั้งใดก็ตามที่โจมตีลงจริง (hit) เกราะสึก 1 หน่วยเสมอ ไม่สนใจเลขทอย
// เกราะที่ไม่ได้ตั้ง maxDurability ไว้ (=0) ถือว่าไม่ใช้ระบบนี้ ทนทานตลอดไป
function dndWearArmorOnHit(targetPlayer) {
  if (!targetPlayer || !targetPlayer.character || !targetPlayer.character.equipment) return null;
  const armor = targetPlayer.character.equipment.armor;
  if (!armor || !armor.name || !(armor.maxDurability > 0) || !(armor.durability > 0)) return null;
  armor.durability = Math.max(0, armor.durability - 1);
  return { armor, broken: armor.durability <= 0 };
}
// ซ่อมเกราะ: จ่ายทองตามจำนวนความคงทนที่หายไป เติมกลับเต็ม 100% ทันที (ผู้เล่นกดเองได้ ไม่ต้องรอ DM)
const DND_ARMOR_REPAIR_COST_PER_POINT = 5;
function dndHandleRepairArmor(ws) {
  const p = dndFindByWs(ws);
  if (!p || p.isDM) return;
  const c = p.character;
  const armor = c.equipment && c.equipment.armor;
  if (!armor || !armor.name || !(armor.maxDurability > 0)) { dndSendError(ws, 'คุณไม่มีเกราะที่ใช้ระบบความคงทนอยู่'); return; }
  const missing = armor.maxDurability - armor.durability;
  if (missing <= 0) { dndSendError(ws, `เกราะ "${armor.name}" คงทนเต็มอยู่แล้ว`); return; }
  const cost = missing * DND_ARMOR_REPAIR_COST_PER_POINT;
  if ((c.gold || 0) < cost) { dndSendError(ws, `ทองไม่พอซ่อมเกราะ (ต้องการ ${cost}, มี ${c.gold || 0})`); return; }
  c.gold -= cost;
  armor.durability = armor.maxDurability;
  dndAddLog(`🛠️ ${c.charName || p.name} ซ่อมเกราะ "${armor.name}" จนคงทนเต็ม ${armor.maxDurability}/${armor.maxDurability} ด้วยทอง ${cost}`);
}
function dndHandleTokenAttackDelete(ws, tokenId, attackId) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  const t = dndTokens.find(tt => tt.id === Number(tokenId) && tt.kind === 'npc');
  if (!t || !t.attacks) return;
  t.attacks = t.attacks.filter(a => a.id !== Number(attackId));
  dndBroadcastState();
}
// DM ทอยท่าโจมตีของมอนสเตอร์ — ทอยแล้วประกาศผลลง log ให้ทุกคนเห็น (DM เป็นคนหักเลือดเป้าหมายเองหลังเห็นผล)
function dndHandleTokenAttackUse(ws, tokenId, attackId, targetType, targetId) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  const t = dndTokens.find(tt => tt.id === Number(tokenId) && tt.kind === 'npc');
  if (!t || !t.attacks) return;
  const atk = t.attacks.find(a => a.id === Number(attackId));
  if (!atk) return;
  const target = dndFindCombatTarget(targetType, targetId);
  if (!target || target.type !== 'player') { dndSendError(ws, 'มอนสเตอร์ต้องเลือกเป้าหมายเป็นผู้เล่น'); return; }

  const parts = [];
  const abilityMod = atk.stat ? dndAbilityMod(Number(t[atk.stat]) || 10) : 0;
  const statusMods = dndStatusMods(t.statuses);
  const effToHit = atk.toHit + abilityMod + statusMods.atk;
  const effDmgMod = atk.dmgMod + abilityMod + statusMods.dmg;
  const statTag = atk.stat ? ` (${DND_STAT_LABELS_TH[atk.stat]} ${abilityMod >= 0 ? '+' : ''}${abilityMod})` : '';
  const hitRoll = 1 + Math.floor(Math.random() * 20);
  const hitModStr = effToHit ? (effToHit > 0 ? ` +${effToHit}` : ` ${effToHit}`) : '';
  const res = dndRollVsAC(hitRoll, effToHit, target.ac);
  const hitTag = res.fumble ? ' 💨 พลาดสุด ๆ' : (!res.hit ? ' 🛡️ พลาด! หลบได้' : (res.crit ? ' 🎯 คริติคอล!' : ' ✅ โดน'));
  parts.push(`🎯 ทอยโจมตี 1d20${hitModStr}${statTag} = [${hitRoll}]${hitModStr} = ${res.total} vs AC ${target.ac} —${hitTag}`);
  if (res.hit) {
    const targetPlayer = dndPlayers.find(pp => pp.id === Number(targetId));
    const wear = dndWearArmorOnHit(targetPlayer);
    if (wear) {
      parts.push(wear.broken
        ? `💔 เกราะ "${wear.armor.name}" ของ ${target.name} ชำรุด! หมดความคงทน ไม่ได้รับโบนัสป้องกันอีกจนกว่าจะซ่อม`
        : `🛠️ เกราะ "${wear.armor.name}" ของ ${target.name} สึกไป 1 (คงทนเหลือ ${wear.armor.durability}/${wear.armor.maxDurability})`);
    }
  }
  let dealtDamage = false, damage = 0, rolls = [];
  let aoeHitsForAnim = [];
  if (atk.dmgDie && res.hit) {
    const dmg = dndRollDamage(atk.dmgDie, atk.dmgCount, effDmgMod, res.crit);
    rolls = dmg.rolls; damage = dmg.damage; dealtDamage = true;
    const dmgModStr = effDmgMod ? (effDmgMod > 0 ? ` +${effDmgMod}` : ` ${effDmgMod}`) : '';
    const oldHp = target.hp;
    target.applyDamage(damage);
    parts.push(`💥 ดาเมจ ${rolls.length}d${atk.dmgDie}${dmgModStr} = [${rolls.join(', ')}]${dmgModStr} = ${damage}`);
    parts.push(`❤️ ${target.name} HP ${oldHp} → ${target.hp}`);

    // ---- AOE: ถ้าท่านี้ตั้งรัศมีไว้ (>0) ดาเมจจะกระจายไปโดนผู้เล่นคนอื่นที่อยู่รอบเป้าหมายหลักบนแผนที่ด้วย (ไม่โดนมอนสเตอร์ตัวอื่น กันมั่ว)
    // ดาเมจลดหลั่นตามระยะห่างจากจุดศูนย์กลาง เหมือนกลไก AOE ของสกิลผู้เล่น
    if (atk.aoeRadius > 0 && damage > 0) {
      const center = dndTargetMapPos(target.type, target.id);
      if (center) {
        const aoeParts = [];
        for (const cand of dndAoeCandidates()) {
          if (cand.type !== 'player') continue; // มอนสเตอร์โจมตี AOE โดนเฉพาะผู้เล่น ไม่โดนมอนสเตอร์ด้วยกันเอง
          if (cand.id === Number(targetId)) continue; // เป้าหมายหลักโดนดาเมจเต็มไปแล้วด้านบน ไม่ต้องนับซ้ำ
          const dist = Math.hypot(cand.pos.x - center.x, cand.pos.y - center.y);
          if (dist > atk.aoeRadius) continue; // อยู่นอกรัศมี ไม่โดน
          const aoeDmg = Math.round(damage * Math.max(0, 1 - dist / atk.aoeRadius));
          if (aoeDmg <= 0) continue;
          const aoeTarget = dndFindCombatTarget(cand.type, cand.id);
          if (!aoeTarget) continue;
          const aoeOldHp = aoeTarget.hp;
          aoeTarget.applyDamage(aoeDmg);
          const aoeTargetPlayer = dndPlayers.find(pp => pp.id === cand.id);
          const aoeWear = dndWearArmorOnHit(aoeTargetPlayer);
          aoeHitsForAnim.push({ tokenId: dndPcTokenId(cand.id), damage: aoeDmg });
          aoeParts.push(`${aoeTarget.name} -${aoeDmg} HP ${aoeOldHp}→${aoeTarget.hp} (ระยะ ${dist.toFixed(1)})${aoeWear ? (aoeWear.broken ? ` (เกราะ "${aoeWear.armor.name}" ชำรุด!)` : '') : ''}`);
        }
        if (aoeParts.length) parts.push(`🌊 AOE รัศมี ${atk.aoeRadius}: ${aoeParts.join(', ')}`);
      }
    }
  }
  dndBroadcastAttackAnim({
    atkKey: 't' + t.id,
    attacker: t.name, target: target.name, targetType: target.type, attackName: atk.name,
    atkTokenId: t.id, tgtTokenId: target.type === 'token' ? target.id : dndPcTokenId(target.id),
    attackRoll: hitRoll, attackMod: effToHit, attackTotal: res.total, targetAC: target.ac, hit: res.hit, crit: res.crit, fumble: res.fumble,
    dmgDie: dealtDamage ? atk.dmgDie : null, dmgCount: dealtDamage ? rolls.length : 0, dmgRolls: dealtDamage ? rolls : null, dmgMod: effDmgMod, damage: dealtDamage ? damage : null,
    aoeRadius: atk.aoeRadius || 0, aoeHits: aoeHitsForAnim,
  });
  dndAddLog(`👹 "${t.name}" ใช้ท่า "${atk.name}" ใส่ ${target.name}: ${parts.join(' | ')}`);
}
// ---- สถานะดีบัฟ: DM เป็นคนมอบ/ถอนให้ผู้เล่นหรือ NPC token คนไหนก็ได้ ----
function dndFindStatusTarget(targetType, targetId) {
  if (targetType === 'player') {
    const target = dndPlayers.find(pp => pp.id === Number(targetId));
    return target ? { list: (target.character.statuses = target.character.statuses || []), label: target.character.charName || target.name } : null;
  }
  if (targetType === 'token') {
    const t = dndTokens.find(tt => tt.id === Number(targetId) && tt.kind === 'npc');
    return t ? { list: (t.statuses = t.statuses || []), label: t.name } : null;
  }
  return null;
}
// durationSec: 0 = ติดสถานะถาวรจนกว่า DM จะถอนเอง, > 0 = คูลดาวน์เป็นวินาที หมดเวลาแล้วหลุดสถานะให้อัตโนมัติ (เช็คจาก dndSweepExpiredStatuses)
function dndSanitizeStatusDuration(raw) {
  return Math.max(0, Math.min(86400, Math.round(Number(raw) || 0)));
}
// atkMod/dmgMod/defMod: บวก-ลบค่าโจมตี/ดาเมจ/ป้องกัน (AC) ระหว่างติดสถานะนี้ (บัฟ = ค่าบวก, ดีบัฟ = ค่าลบ)
function dndSanitizeStatusMod(raw) {
  return Math.max(-20, Math.min(20, Math.round(Number(raw) || 0)));
}
// tickValue: ค่า HP ที่เปลี่ยนทุก ๆ tickIntervalSec วินาที (ลบ = โดนดาเมจต่อเนื่อง เช่นพิษ/ไฟลุก, บวก = ฟื้น HP ต่อเนื่อง เช่นรีเจน) — 0 = ไม่มีผลต่อเนื่อง
function dndSanitizeStatusTick(raw) {
  return Math.max(-1000, Math.min(1000, Math.round(Number(raw) || 0)));
}
function dndSanitizeTickInterval(raw) {
  return Math.max(1, Math.min(3600, Math.round(Number(raw) || 0) || 6));
}
function dndBuildStatusModText(atkMod, dmgMod, defMod, tickValue, tickIntervalSec) {
  const parts = [];
  if (atkMod) parts.push(`🎯 โจมตี ${atkMod > 0 ? '+' : ''}${atkMod}`);
  if (dmgMod) parts.push(`💥 ดาเมจ ${dmgMod > 0 ? '+' : ''}${dmgMod}`);
  if (defMod) parts.push(`🛡️ ป้องกัน ${defMod > 0 ? '+' : ''}${defMod}`);
  if (tickValue) parts.push(tickValue > 0 ? `💚 ฟื้น HP +${tickValue} ทุก ${tickIntervalSec}วิ` : `☠️ โดนดาเมจ ${Math.abs(tickValue)} ทุก ${tickIntervalSec}วิ`);
  return parts.length ? ` [${parts.join(' · ')}]` : '';
}
function dndHandleStatusApply(ws, payload) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM || !payload || typeof payload !== 'object') return;
  const target = dndFindStatusTarget((payload.targetType || '').toString(), payload.targetId);
  if (!target) return;
  const name = (payload.name || '').toString().trim().slice(0, 24);
  if (!name) { dndSendError(ws, 'กรุณาตั้งชื่อสถานะ/ดีบัฟ'); return; }
  const note = (payload.note || '').toString().trim().slice(0, 100);
  const durationSec = dndSanitizeStatusDuration(payload.durationSec);
  const expiresAt = durationSec > 0 ? Date.now() + durationSec * 1000 : 0;
  const atkMod = dndSanitizeStatusMod(payload.atkMod);
  const dmgMod = dndSanitizeStatusMod(payload.dmgMod);
  const defMod = dndSanitizeStatusMod(payload.defMod);
  const tickValue = dndSanitizeStatusTick(payload.tickValue);
  const tickIntervalSec = tickValue !== 0 ? dndSanitizeTickInterval(payload.tickIntervalSec) : 0;
  const nextTickAt = tickValue !== 0 ? Date.now() + tickIntervalSec * 1000 : 0;
  target.list.push({ id: dndNextStatusId++, name, note, durationSec, expiresAt, atkMod, dmgMod, defMod, tickValue, tickIntervalSec, nextTickAt });
  dndAddLog(`☠️ DM มอบสถานะ "${name}" ให้ ${target.label}${durationSec ? ` (คูลดาวน์ ${durationSec}วิ)` : ''}${dndBuildStatusModText(atkMod, dmgMod, defMod, tickValue, tickIntervalSec)}`);
}
function dndHandleStatusRemove(ws, payload) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM || !payload || typeof payload !== 'object') return;
  const target = dndFindStatusTarget((payload.targetType || '').toString(), payload.targetId);
  if (!target) return;
  const idx = target.list.findIndex(s => s.id === Number(payload.statusId));
  if (idx === -1) return;
  const [removed] = target.list.splice(idx, 1);
  dndAddLog(`✅ DM ถอนสถานะ "${removed.name}" จาก ${target.label}`);
}
function dndHandleStatusEdit(ws, payload) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM || !payload || typeof payload !== 'object') return;
  const target = dndFindStatusTarget((payload.targetType || '').toString(), payload.targetId);
  if (!target) return;
  const status = target.list.find(s => s.id === Number(payload.statusId));
  if (!status) return;
  const name = (payload.name || '').toString().trim().slice(0, 24);
  if (!name) { dndSendError(ws, 'กรุณาตั้งชื่อสถานะ/ดีบัฟ'); return; }
  const note = (payload.note || '').toString().trim().slice(0, 100);
  const durationSec = dndSanitizeStatusDuration(payload.durationSec);
  const atkMod = dndSanitizeStatusMod(payload.atkMod);
  const dmgMod = dndSanitizeStatusMod(payload.dmgMod);
  const defMod = dndSanitizeStatusMod(payload.defMod);
  const tickValue = dndSanitizeStatusTick(payload.tickValue);
  const tickIntervalSec = tickValue !== 0 ? dndSanitizeTickInterval(payload.tickIntervalSec) : 0;
  status.name = name;
  status.note = note;
  status.durationSec = durationSec;
  status.expiresAt = durationSec > 0 ? Date.now() + durationSec * 1000 : 0;
  status.atkMod = atkMod;
  status.dmgMod = dmgMod;
  status.defMod = defMod;
  status.tickValue = tickValue;
  status.tickIntervalSec = tickIntervalSec;
  // แก้ไขค่า tick ใหม่ระหว่างที่สถานะติดอยู่แล้ว — รีเซตนับเวลาติ๊กรอบถัดไปใหม่ จะได้ไม่ติ๊กถี่/ห่างผิดจากที่เพิ่งตั้งใหม่
  status.nextTickAt = tickValue !== 0 ? Date.now() + tickIntervalSec * 1000 : 0;
  dndAddLog(`✏️ DM แก้ไขสถานะของ ${target.label} เป็น "${name}"${durationSec ? ` (คูลดาวน์ ${durationSec}วิ)` : ' (ไม่มีคูลดาวน์)'}${dndBuildStatusModText(atkMod, dmgMod, defMod, tickValue, tickIntervalSec)}`);
}
// ไล่เช็กทุกวินาทีว่ามีสถานะของใครหมดคูลดาวน์แล้วหรือยัง (หมดแล้วให้หลุดออกอัตโนมัติ) และมีสถานะไหนถึงรอบติ๊กดาเมจ/ฟื้น HP ต่อเนื่องหรือยัง (พิษ/ไฟลุก/รีเจน ฯลฯ)
function dndSweepExpiredStatuses() {
  const now = Date.now();
  let changed = false;
  const processList = (list, label, applyTick, onAfterTick) => {
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (s.expiresAt && s.expiresAt <= now) {
        list.splice(i, 1);
        dndLog.push({ text: `⏳ สถานะ "${s.name}" ของ ${label} หมดคูลดาวน์แล้ว`, visibleTo: null });
        if (dndLog.length > 300) dndLog.shift();
        changed = true;
        continue;
      }
      if (s.tickValue && s.nextTickAt && s.nextTickAt <= now) {
        const res = applyTick(s.tickValue);
        const tag = s.tickValue > 0 ? '💚 ฟื้น HP' : '☠️ โดนดาเมจ';
        dndLog.push({ text: `${tag}จากสถานะ "${s.name}": ${label} HP ${res.oldHp} → ${res.newHp}${res.revived ? ' — 🌟 ฟื้นจากหมดสติแล้ว!' : ''}`, visibleTo: null });
        if (dndLog.length > 300) dndLog.shift();
        s.nextTickAt = now + (s.tickIntervalSec || 6) * 1000;
        changed = true;
        if (onAfterTick) onAfterTick();
      }
    }
  };
  for (const pp of dndPlayers) {
    if (pp.character && Array.isArray(pp.character.statuses)) {
      processList(pp.character.statuses, pp.character.charName || pp.name, (val) => {
        const c = pp.character;
        const wasDead = dndIsCharDead(c);
        const oldHp = c.hp;
        c.hp = Math.max(0, Math.min(c.maxHp, c.hp + val));
        const revived = wasDead && !dndIsCharDead(c);
        if (!wasDead && dndIsCharDead(c)) {
          dndLog.push({ text: `💀 ${c.charName || pp.name} หมดสติ! ทำอะไรไม่ได้จนกว่าจะมีคนใช้ไอเทมชุบให้ หรือ DM เพิ่ม HP ให้`, visibleTo: null });
          if (dndLog.length > 300) dndLog.shift();
        }
        return { oldHp, newHp: c.hp, revived };
      });
    }
  }
  for (const t of dndTokens) {
    if (t.kind === 'npc' && Array.isArray(t.statuses)) {
      processList(t.statuses, t.name, (val) => {
        const oldHp = t.hp;
        t.hp = Math.max(0, Math.min(t.maxHp, t.hp + val));
        return { oldHp, newHp: t.hp, revived: false };
      }, () => dndCheckTokenDefeat(t, null));
    }
  }
  if (changed) dndBroadcastState();
}
function dndHandleChat(ws, text) {
  const p = dndFindByWs(ws);
  if (!p) return;
  const trimmed = (text || '').toString().trim().slice(0, 300);
  if (!trimmed) return;
  for (const pp of dndPlayers) {
    if (pp.ws && pp.ws.readyState === WebSocket.OPEN) {
      pp.ws.send(JSON.stringify({ type: 'dndChat', name: p.character.charName || p.name, text: trimmed }));
    }
  }
}
// DM เท่านั้นที่รีเซตห้องได้ทั้งหมด — ล้างผู้เล่น/การ์ดตัวละคร/บันทึก/สกิลทั้งหมด แล้วเด้งทุกคน (รวม DM เอง) กลับไปหน้าเข้าห้อง
function dndHandleRestart(ws) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  const everyone = dndPlayers.slice();
  dndPlayers = [];
  dndLog = [];
  dndSkills = [];
  dndNextId = 1;
  dndNextSkillId = 1;
  dndCustomPassives = [];
  dndNextPassiveId = 1;
  dndScene = { location: '', situation: '' };
  dndMaps = cloneDefaultMaps();
  dndNextMapId = Math.max(0, ...DEFAULT_MAPS.map(m => m.id)) + 1;
  dndCurrentMapId = DEFAULT_MAPS[0] ? DEFAULT_MAPS[0].id : 1;
  dndTokens = [];
  dndNextTokenId = 1;
  dndNextAttackId = 1;
  dndNextStatusId = 1;
  dndTurnOrder = [];
  dndTurnIndex = -1;
  dndTrades = [];
  dndNextTradeId = 1;
  const payload = JSON.stringify({ type: 'dndLeft' });
  for (const pp of everyone) {
    if (pp.ws && pp.ws.readyState === WebSocket.OPEN) pp.ws.send(payload);
  }
}
function dndHandleLeave(ws) {
  const p = dndPlayers.find(pp => pp.ws === ws);
  if (!p) return;
  p.connected = false;
  p.ws = null;
  // ไม่มีการโอนบทบาท DM ให้ใคร — ที่นั่ง (และการ์ดตัวละคร) ยังอยู่ รอเลือกกลับเข้านั่งที่เดิมจากรายชื่อที่นั่งว่างได้เสมอ
  dndAddLog(`${p.character.charName || p.name} ออกจากที่นั่ง${p.isDM ? ' (DM)' : ''} — เลือกกลับเข้านั่งที่เดิมได้จากรายชื่อที่นั่งว่างตอนเข้าห้อง`);
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'dndLeft' }));
}
// DM ลบผู้เล่นออกจากห้องอย่างถาวร (ต่างจากออกจากที่นั่งเอง เพราะที่นั่ง/การ์ดตัวละครจะหายไปเลย เข้ามาใหม่ต้องสร้างใหม่)
function dndHandleDmKickPlayer(ws, targetId) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  const idx = dndPlayers.findIndex(pp => pp.id === Number(targetId));
  if (idx === -1) return;
  const target = dndPlayers[idx];
  if (target.isDM) { dndSendError(ws, 'ไม่สามารถลบ Dungeon Master ได้'); return; }
  const name = target.character.charName || target.name;
  if (target.ws && target.ws.readyState === WebSocket.OPEN) {
    target.ws.send(JSON.stringify({ type: 'dndKicked' }));
    target.ws.close();
  }
  dndTokens = dndTokens.filter(t => !(t.kind === 'pc' && t.ownerId === target.id));
  dndSkills.forEach(s => { if (s.assignedIds) s.assignedIds = s.assignedIds.filter(id => id !== target.id); });
  dndTurnOrder = dndTurnOrder.filter(id => id !== target.id);
  if (dndTurnIndex >= dndTurnOrder.length) dndTurnIndex = dndTurnOrder.length ? 0 : -1;
  dndPlayers.splice(idx, 1);
  dndAddLog(`🚫 DM ลบผู้เล่น "${name}" ออกจากห้องแล้ว`);
}
function dndHandleDisconnect(ws) {
  const p = dndPlayers.find(pp => pp.ws === ws);
  if (!p) return;
  p.connected = false;
  p.ws = null;
  // เช่นเดียวกับออกจากที่นั่งเอง — ไม่มีการโอนบทบาท DM ให้ใคร ที่นั่งยังรออยู่
  dndAddLog(`${p.character.charName || p.name} หลุดการเชื่อมต่อ${p.isDM ? ' (DM) — เลือกกลับเข้านั่งที่เดิมได้จากรายชื่อที่นั่งว่าง' : ''}`);
}
// DM มอบไอเทมให้ผู้เล่นคนไหนก็ได้โดยตรง — ซิงค์เข้ากระเป๋าทันทีเหมือนซื้อจากร้าน (ไม่หักทองใคร)
function dndHandleGiveItem(ws, targetId, name, qty) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  const target = dndPlayers.find(pp => pp.id === Number(targetId) && !pp.isDM);
  if (!target) { dndSendError(ws, 'ไม่พบผู้เล่นเป้าหมาย'); return; }
  const cleanName = (name || '').toString().trim().slice(0, 40);
  const cleanQty = Math.max(1, Math.min(999, Math.round(Number(qty) || 0)));
  if (!cleanName) { dndSendError(ws, 'กรุณากรอกชื่อไอเทม'); return; }
  dndBagAdd(target.character, cleanName, cleanQty);
  dndAddLog(`🎁 DM มอบ ${cleanName} x${cleanQty} ให้ ${target.character.charName || target.name}`, [p.id, target.id]);
}
// DM เรียกคืนไอเทมจากผู้เล่นคนไหนก็ได้โดยตรง
function dndHandleTakeItem(ws, targetId, name, qty) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  const target = dndPlayers.find(pp => pp.id === Number(targetId) && !pp.isDM);
  if (!target) { dndSendError(ws, 'ไม่พบผู้เล่นเป้าหมาย'); return; }
  const cleanName = (name || '').toString().trim().slice(0, 40);
  const cleanQty = Math.max(1, Math.min(999, Math.round(Number(qty) || 0)));
  if (!cleanName) { dndSendError(ws, 'กรุณากรอกชื่อไอเทม'); return; }
  if (!dndBagRemove(target.character, cleanName, cleanQty)) {
    dndSendError(ws, `${target.character.charName || target.name} มี ${cleanName} ไม่ถึง ${cleanQty} ชิ้น เรียกคืนไม่ได้`);
    return;
  }
  dndAddLog(`🗑️ DM เรียกคืน ${cleanName} x${cleanQty} จาก ${target.character.charName || target.name}`);
}
// DM มอบอุปกรณ์สวมใส่ให้ผู้เล่นโดยตรง พร้อมระบุรายละเอียด (ช่อง/ATK/DEF/ความคงทน) — สวมใส่ให้ทันที ไม่ต้องผ่านกระเป๋า
// ถ้าช่องนั้นมีของสวมอยู่แล้ว ของเก่าจะถูกเก็บกลับเข้ากระเป๋าผู้เล่นก่อนเสมอ ไม่ให้ของหาย
function dndHandleGiveEquip(ws, targetId, payload) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  const target = dndPlayers.find(pp => pp.id === Number(targetId) && !pp.isDM);
  if (!target) { dndSendError(ws, 'ไม่พบผู้เล่นเป้าหมาย'); return; }
  const r = (payload && typeof payload === 'object') ? payload : {};
  const slot = DND_EQUIP_SLOTS.includes(r.slot) ? r.slot : null;
  if (!slot) { dndSendError(ws, 'กรุณาเลือกช่องอุปกรณ์ให้ถูกต้อง'); return; }
  const name = (r.name || '').toString().trim().slice(0, 40);
  if (!name) { dndSendError(ws, 'กรุณากรอกชื่ออุปกรณ์'); return; }
  const atk = Math.max(0, Math.min(999, Math.round(Number(r.atk) || 0)));
  const def = Math.max(0, Math.min(999, Math.round(Number(r.def) || 0)));
  const maxDurability = Math.max(0, Math.min(999, Math.round(Number(r.maxDurability) || 0)));
  const icon = dndSanitizeEquipIcon(r.icon);
  const c = target.character;
  c.equipment = dndSanitizeEquipment(c.equipment);
  const oldItem = c.equipment[slot];
  if (oldItem && oldItem.name) dndBagAdd(c, oldItem.name, 1);
  c.equipment[slot] = { name, atk, def, durability: maxDurability, maxDurability, icon };
  dndAutoRegisterEquipItemEffect(name, c.equipment[slot], slot);
  const slotLabel = DND_EQUIP_SLOT_LABELS[slot] || slot;
  dndAddLog(`🛡️ DM มอบ ${slotLabel} "${name}" (ATK+${atk} / DEF+${def}${maxDurability > 0 ? ` / ทน ${maxDurability}` : ''}) ให้ ${c.charName || target.name}${oldItem && oldItem.name ? ` (ถอด "${oldItem.name}" เก็บเข้ากระเป๋า)` : ''}`);
}
// ถอดของสวมใส่คืนเข้ากระเป๋า — ผู้เล่นถอดของตัวเองได้เอง, DM ถอดให้ผู้เล่นคนไหนก็ได้ (ระบุ targetId)
function dndHandleUnequip(ws, payload) {
  const p = dndFindByWs(ws);
  if (!p) return;
  const r = (payload && typeof payload === 'object') ? payload : {};
  const slot = DND_EQUIP_SLOTS.includes(r.slot) ? r.slot : null;
  if (!slot) return;
  let target;
  if (p.isDM) {
    target = dndPlayers.find(pp => pp.id === Number(r.targetId) && !pp.isDM);
    if (!target) { dndSendError(ws, 'ไม่พบผู้เล่นเป้าหมาย'); return; }
  } else {
    target = p;
  }
  const c = target.character;
  c.equipment = dndSanitizeEquipment(c.equipment);
  const item = c.equipment[slot];
  if (!item || !item.name) { dndSendError(ws, 'ช่องนี้ไม่มีของสวมใส่อยู่'); return; }
  dndBagAdd(c, item.name, 1);
  c.equipment[slot] = dndSanitizeEquipSlot(null);
  const slotLabel = DND_EQUIP_SLOT_LABELS[slot] || slot;
  const who = c.charName || target.name;
  dndAddLog(p.isDM ? `🎒 DM ถอด${slotLabel}ให้ ${who}: "${item.name}" เก็บเข้ากระเป๋า` : `🎒 ${who} ถอด${slotLabel} "${item.name}" เก็บเข้ากระเป๋า`);
}
function dndHandleMessage(ws, msg) {
  if (msg.type === 'dndJoin') dndHandleJoin(ws, msg.name);
  else if (msg.type === 'dndListSeats') dndHandleListSeats(ws);
  else if (msg.type === 'dndTakeSeat') dndHandleTakeSeat(ws, msg.id);
  else if (msg.type === 'dndLeave') dndHandleLeave(ws);
  else if (msg.type === 'dndCreateCharacter') dndHandleCreateCharacter(ws, msg.character);
  else if (msg.type === 'dndDmUpdate') dndHandleDmUpdate(ws, msg.targetId, msg.updates);
  else if (msg.type === 'dndDmKickPlayer') dndHandleDmKickPlayer(ws, msg.targetId);
  else if (msg.type === 'dndRoll') dndHandleRoll(ws, msg.die, msg.count, msg.modifier, msg.label);
  else if (msg.type === 'dndChat') dndHandleChat(ws, msg.text);
  else if (msg.type === 'dndSkillCreate') dndHandleSkillCreate(ws, msg.skill);
  else if (msg.type === 'dndSkillEdit') dndHandleSkillEdit(ws, msg.skillId, msg.skill);
  else if (msg.type === 'dndSkillDelete') dndHandleSkillDelete(ws, msg.skillId);
  else if (msg.type === 'dndPassiveCreate') dndHandlePassiveCreate(ws, msg.passive);
  else if (msg.type === 'dndPassiveEdit') dndHandlePassiveEdit(ws, msg.passiveId, msg.passive);
  else if (msg.type === 'dndPassiveDelete') dndHandlePassiveDelete(ws, msg.passiveId);
  else if (msg.type === 'dndSkillUse') dndHandleSkillUse(ws, msg.skillId, msg.targetType, msg.targetId);
  else if (msg.type === 'dndNormalAttack') dndHandleNormalAttack(ws, msg.targetType, msg.targetId);
  else if (msg.type === 'dndEquipUpdate') dndHandleEquipUpdate(ws, msg.equipment);
  else if (msg.type === 'dndAppearanceUpdate') dndHandleAppearanceUpdate(ws, msg.appearance);
  else if (msg.type === 'dndShopCreate') dndHandleShopCreate(ws, msg.name, msg.shopType);
  else if (msg.type === 'dndShopRename') dndHandleShopRename(ws, msg.shopId, msg.name);
  else if (msg.type === 'dndShopDelete') dndHandleShopDelete(ws, msg.shopId);
  else if (msg.type === 'dndShopItemAdd') dndHandleShopItemAdd(ws, msg.shopId, msg.item);
  else if (msg.type === 'dndShopItemEdit') dndHandleShopItemEdit(ws, msg.shopId, msg.itemId, msg.item);
  else if (msg.type === 'dndShopItemDelete') dndHandleShopItemDelete(ws, msg.shopId, msg.itemId);
  else if (msg.type === 'dndShopBuy') dndHandleShopBuy(ws, msg.shopId, msg.itemId);
  else if (msg.type === 'dndShopSell') dndHandleShopSell(ws, msg.shopId, msg.itemId);
  else if (msg.type === 'dndForgeAttempt') dndHandleForgeAttempt(ws, msg.shopId, msg.slot);
  else if (msg.type === 'dndTradeOffer') dndHandleTradeOffer(ws, msg.trade);
  else if (msg.type === 'dndTradeRespond') dndHandleTradeRespond(ws, msg.tradeId, !!msg.accept);
  else if (msg.type === 'dndTradeCancel') dndHandleTradeCancel(ws, msg.tradeId);
  else if (msg.type === 'dndMapBackgroundUpdate') dndHandleMapBackgroundUpdate(ws, msg.image);
  else if (msg.type === 'dndSceneUpdate') dndHandleSceneUpdate(ws, msg.scene);
  else if (msg.type === 'dndTokenMove') dndHandleTokenMove(ws, msg.id, msg.x, msg.y);
  else if (msg.type === 'dndTokenCreate') dndHandleTokenCreate(ws, msg.token);
  else if (msg.type === 'dndTokenEdit') dndHandleTokenEdit(ws, msg.id, msg.updates);
  else if (msg.type === 'dndTokenDelete') dndHandleTokenDelete(ws, msg.id);
  else if (msg.type === 'dndTokenDuplicate') dndHandleTokenDuplicate(ws, msg.id);
  else if (msg.type === 'dndMapCreate') dndHandleMapCreate(ws, msg.name);
  else if (msg.type === 'dndMapSwitch') dndHandleMapSwitch(ws, msg.mapId);
  else if (msg.type === 'dndMapRename') dndHandleMapRename(ws, msg.mapId, msg.name);
  else if (msg.type === 'dndMapDelete') dndHandleMapDelete(ws, msg.mapId);
  else if (msg.type === 'dndTokenAttackAdd') dndHandleTokenAttackAdd(ws, msg.tokenId, msg.attack);
  else if (msg.type === 'dndTokenAttackEdit') dndHandleTokenAttackEdit(ws, msg.tokenId, msg.attackId, msg.attack);
  else if (msg.type === 'dndTokenAttackDelete') dndHandleTokenAttackDelete(ws, msg.tokenId, msg.attackId);
  else if (msg.type === 'dndTokenAttackUse') dndHandleTokenAttackUse(ws, msg.tokenId, msg.attackId, msg.targetType, msg.targetId);
  else if (msg.type === 'dndStatusApply') dndHandleStatusApply(ws, msg.status);
  else if (msg.type === 'dndStatusRemove') dndHandleStatusRemove(ws, msg.status);
  else if (msg.type === 'dndStatusEdit') dndHandleStatusEdit(ws, msg.status);
  else if (msg.type === 'dndRestart') dndHandleRestart(ws);
  else if (msg.type === 'dndRepairArmor') dndHandleRepairArmor(ws);
  else if (msg.type === 'dndGiveItem') dndHandleGiveItem(ws, msg.targetId, msg.name, msg.qty);
  else if (msg.type === 'dndTakeItem') dndHandleTakeItem(ws, msg.targetId, msg.name, msg.qty);
  else if (msg.type === 'dndGiveEquip') dndHandleGiveEquip(ws, msg.targetId, msg.item);
  else if (msg.type === 'dndUnequip') dndHandleUnequip(ws, msg);
  else if (msg.type === 'dndItemEffectCreate') dndHandleItemEffectCreate(ws, msg.item);
  else if (msg.type === 'dndItemEffectEdit') dndHandleItemEffectEdit(ws, msg.itemId, msg.item);
  else if (msg.type === 'dndItemEffectDelete') dndHandleItemEffectDelete(ws, msg.itemId);
  else if (msg.type === 'dndUseItem') dndHandleUseItem(ws, msg.name, msg.targetId);
  else if (msg.type === 'dndTurnSetOrder') dndHandleTurnSetOrder(ws, msg.order);
  else if (msg.type === 'dndTurnStart') dndHandleTurnStart(ws);
  else if (msg.type === 'dndTurnNext') dndHandleTurnNext(ws);
  else if (msg.type === 'dndTurnStop') dndHandleTurnStop(ws);
}


module.exports = {
  handleMessage: dndHandleMessage,
  handleDisconnect: dndHandleDisconnect,
  sweepExpiredStatuses: dndSweepExpiredStatuses,
};
