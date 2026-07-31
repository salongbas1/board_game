// ============================================================
// Character — สร้าง/เติมค่าเริ่มต้นตัวละคร + race/class helper ล้วนๆ
// แยกออกมาจาก dnd.js เหมือน combat-math.js (module 1): ฟังก์ชันเกือบทั้งหมดเป็น pure
// (รับ input คืน output อย่างเดียว ไม่แตะ dndPlayers/dndTokens ฯลฯ)
// ข้อยกเว้น 2 จุดที่ต้องพึ่งพาโมดูลอื่น (dndCustomPassives จาก dnd.js, dndEquipSlotBroken จาก item.js)
// รับมาเป็นพารามิเตอร์แทนการอ้างตัวแปรนอกโมดูลตรงๆ — ฝั่ง dnd.js มี wrapper ฟังก์ชันชื่อเดิม
// คอยส่งค่าที่ต้องใช้เข้ามาให้ ทุกจุดที่เรียกใช้ในไฟล์เดิมจึงเรียกได้เหมือนเดิมทุกประการ
// ============================================================

const { DND_RACES, DND_CLASSES, DND_CLASS_STARTER_GEAR, DND_HAIR_STYLES, DND_HAIR_COLORS, DND_FACE_STYLES, DND_LEVEL_EXP, DND_STARTING_SP } = require('../data/characters');
const { DND_EQUIP_SLOTS, DND_EQUIP_ICON_MAX_LEN } = require('../data/equipment');
const { DND_RACE_PASSIVES, DND_CLASS_SKILLS, DND_CLASS_SKILL_ID_BASE } = require('../data/skills');

// ---- Race / Class card data (also drives the automatic AC/HP ranges & stat bonuses) ----
function dndRaceByKey(k) { return DND_RACES.find(r => r.key === k); }
function dndClassByKey(k) { return DND_CLASSES.find(c => c.key === k); }

// ---- ไอเทมสวมใส่เริ่มต้นตามคลาส: อิงธีมอุปกรณ์เริ่มต้นแบบ D&D ของแต่ละคลาส แต่ปรับเลขให้ต่ำ (ค่าเริ่มต้นระดับ 1) ----
// ใช้เติมให้อัตโนมัติตอนสร้างตัวละคร เฉพาะช่องที่ผู้เล่นไม่ได้กรอกไอเทมเอง (เว้นว่างไว้) — ผู้เล่นแก้ไข/ถอดออกทีหลังได้เสมอเหมือนไอเทมอื่นๆ
function dndStarterGearForClass(classKey) {
  return DND_CLASS_STARTER_GEAR[classKey] || null;
}

// ---- สกิลติดตัว (Passive) ประจำเผ่าพันธุ์: อิงจากคุณสมบัติเผ่าพันธุ์ใน D&D 5e แต่ปรับให้เป็นเลขกลไกง่ายๆ ----
// แต่ละเผ่ามีให้เลือก 2 แบบ — เลือกได้ตอนสร้างตัวละครครั้งเดียว (ล็อกไปพร้อมการ์ดตัวละคร)
// effect ที่รองรับ: atk (โบนัสทอยโจมตี), dmg (โบนัสดาเมจ), ac (โบนัสป้องกัน), hp (โบนัส HP สูงสุด), critRange (ขยายช่วงคริติคอล เช่น 1 = โดนคริตที่ 19-20), gold (ทองเริ่มต้นเพิ่ม)
// customPassives: dndCustomPassives จาก dnd.js (สกิลติดตัวที่ DM ออกแบบเอง) — ส่งเข้ามาเป็นพารามิเตอร์เพราะ state ตัวนี้ยังอยู่ที่ dnd.js
// raceOverrides: dndRacePassiveOverrides จาก dnd.js — DM แก้ไขค่าเริ่มต้นของสกิลติดตัวประจำเผ่าที่มีมาให้ในระบบ (คีย์ `${raceKey}:${passiveKey}`)
// ทับเฉพาะฟิลด์ของสกิลติดตัวเดิม (name/icon/desc/effect) ไม่กระทบ key เดิม เพื่อไม่ให้ตัวละครที่เลือกไว้แล้วหลุดออกจากพาสซีฟ
function dndRacePassivesFor(raceKey, customPassives, raceOverrides) {
  const builtin = (DND_RACE_PASSIVES[raceKey] || []).map(base => {
    const ov = raceOverrides && raceOverrides[`${raceKey}:${base.key}`];
    return ov ? Object.assign({}, base, ov, { overridden: true }) : base;
  });
  // สกิลติดตัวที่ DM สร้างเอง: ผูกกับเผ่าใดเผ่าหนึ่งโดยเฉพาะ หรือ raceKey === 'any' = ใช้ได้ทุกเผ่า
  const custom = (customPassives || []).filter(cp => cp.raceKey === raceKey || cp.raceKey === 'any');
  return builtin.concat(custom);
}
function dndRacePassiveByKey(raceKey, passiveKey, customPassives, raceOverrides) {
  return dndRacePassivesFor(raceKey, customPassives, raceOverrides).find(p => p.key === passiveKey) || null;
}
// คืนโบนัสจากสกิลติดตัวของตัวละคร (ค่าเริ่มต้นเป็น 0 ทุกช่องถ้ายังไม่ได้เลือก/หาไม่เจอ)
function dndCharPassiveEffect(character, customPassives, raceOverrides) {
  const passive = character && dndRacePassiveByKey(character.raceKey, character.passiveKey, customPassives, raceOverrides);
  const eff = (passive && passive.effect) || {};
  return { atk: eff.atk || 0, dmg: eff.dmg || 0, ac: eff.ac || 0, hp: eff.hp || 0, critRange: eff.critRange || 0, gold: eff.gold || 0, resist: eff.resist || 0 };
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
  const overrides = p.character.skillOverrides || {};
  return templates.map((t, idx) => {
    const id = dndClassSkillId(p.character.classKey, idx);
    const ov = overrides[id];
    const merged = ov ? Object.assign({}, t, ov) : t;
    return Object.assign({}, merged, {
      id,
      assignedIds: [p.id],
      classSkill: true,
      locked: t.level > level, // ปลดล็อกตามเลเวลเดิมของคลาสเสมอ ไม่ให้ override เปลี่ยนเงื่อนไขปลดล็อกได้
      overridden: !!ov,
    });
  });
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

// equipSlotBroken: dndEquipSlotBroken จาก server/dnd/item.js — ส่งเข้ามาเป็นพารามิเตอร์เพราะฟังก์ชันนี้อยู่คนละโมดูล
function dndTotalDefense(equipment, equipSlotBroken) {
  if (!equipment) return 0;
  return DND_EQUIP_SLOTS.reduce((sum, slot) => {
    const item = equipment[slot];
    return sum + (equipSlotBroken(item) ? 0 : ((item && (item.def + (item.forgeDef || 0))) || 0));
  }, 0);
}
function dndTotalAttack(equipment, equipSlotBroken) {
  if (!equipment) return 0;
  return DND_EQUIP_SLOTS.reduce((sum, slot) => {
    const item = equipment[slot];
    return sum + (equipSlotBroken(item) ? 0 : ((item && (item.atk + (item.forgeAtk || 0))) || 0));
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

function newDndCharacter(displayName) {
  return {
    charName: displayName, raceKey: '', classKey: '', race: '', cls: '', level: 1, passiveKey: '',
    hp: 10, maxHp: 10, ac: 10, sp: DND_STARTING_SP, maxSp: DND_STARTING_SP,
    str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
    inventory: '', backstory: '', locked: false, pointBuy: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    equipment: dndSanitizeEquipment(null), statuses: [], exp: 0, gold: 0, statPoints: 0, permaDead: false,
    appearance: dndSanitizeAppearance(null), bag: [], normalAttack: null,
    skillOverrides: {}, // DM ปรับสกิลประจำคลาสเฉพาะผู้เล่นคนนี้คนเดียว — คีย์ = id สกิลคลาส, ค่า = ฟิลด์ที่ทับค่าเริ่มต้นของคลาส
    // ค่าต้านทานสถานะ (%) — เหมือน statusResist ของ token มอนสเตอร์ทุกประการ แต่ฝั่งผู้เล่น: หักออกจากโอกาสติดสถานะของ
    // ท่าโจมตีมอนสเตอร์ที่ใส่ผู้เล่นคนนี้ (DM ปรับได้จากหน้าต่างแก้ไขตัวละคร) — ก่อนหน้านี้ผู้เล่นไม่มีช่องนี้เลย มีแต่ฝั่งมอนสเตอร์
    statusResist: 0,
  };
}
// เติมฟิลด์ที่อาจขาดหายไปให้ตัวละคร (เช่นไฟล์เซฟเก่าที่บันทึกไว้ก่อนจะมีระบบ SP)
// ป้องกัน sp/maxSp เป็น undefined แล้วโหลดไฟล์เก่ากลับมาแล้วหลอด SP ไม่ขึ้นทั้งฝั่งผู้เล่น/DM
function dndEnsureCharacterDefaults(character) {
  const c = character || newDndCharacter('ผู้เล่น');
  if (c.maxSp == null || !Number.isFinite(Number(c.maxSp))) c.maxSp = DND_STARTING_SP;
  if (c.sp == null || !Number.isFinite(Number(c.sp))) c.sp = c.maxSp;
  if (c.permaDead == null) c.permaDead = false;
  // ไฟล์เซฟเก่าก่อนมีระบบต้านทานสถานะฝั่งผู้เล่น — เติม 0 ให้ (ไม่ต้านทานอะไรเลย เหมือนพฤติกรรมเดิมก่อนมีฟีเจอร์นี้)
  if (c.statusResist == null || !Number.isFinite(Number(c.statusResist))) c.statusResist = 0;
  return c;
}

module.exports = {
  dndRaceByKey,
  dndClassByKey,
  dndStarterGearForClass,
  dndRacePassivesFor,
  dndRacePassiveByKey,
  dndCharPassiveEffect,
  dndClassSkillId,
  dndClassSkillsForPlayer,
  dndSanitizeEquipIcon,
  dndSanitizeForgeHistory,
  dndSanitizeEquipSlot,
  dndSanitizeEquipment,
  dndSanitizeAppearance,
  dndTotalDefense,
  dndTotalAttack,
  dndLevelFromExp,
  dndNextLevelExp,
  dndSyncLevelFromExp,
  newDndCharacter,
  dndEnsureCharacterDefaults,
};
