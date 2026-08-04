// ============================================================
// D&D Party Room — เครื่องมือคุมเกม D&D สำหรับ DM และปาร์ตี้
// แยกออกมาจาก server.js เดิม (เป็นระบบอิสระ ไม่เกี่ยวกับ Hearts)
// ============================================================

const WebSocket = require('ws');

const { DND_RACES, DND_CLASSES, DND_CLASS_STARTER_GEAR, DND_HAIR_STYLES, DND_HAIR_COLORS, DND_FACE_STYLES, DND_LEVEL_EXP, DND_STARTING_GOLD_MAX, DND_STARTING_SP } = require('./data/characters');
const { POINT_BUY_MIN, POINT_BUY_BUDGET, STAT_POINTS_PER_LEVEL, POINT_BUY_COST, POINT_BUY_COST_MAX_DEFINED, POINT_BUY_COST_PER_STEP_ABOVE_MAX, pointBuyCostOf, pointBuyStepCost, pointBuyCostForRaw } = require('./data/point-buy');
const { DND_RACE_PASSIVES, DND_PASSIVE_EFFECT_KEYS, DND_CLASS_SKILLS, DND_CLASS_SKILL_ID_BASE, DND_SPELLBOOK_SKILLS, DND_SPELLBOOK_ID_BASE, DND_SUMMON_TEMPLATES } = require('./data/skills');
const { DND_EQUIP_SLOTS, DND_EQUIP_SLOT_LABELS, DND_EQUIP_ICON_MAX_LEN, DND_SHOP_TYPES, DND_FORGE_FAIL_POLICIES, DND_FORGE_FAIL_POLICY_LABELS, DND_ITEM_EFFECT_TYPES, DND_BAG_CAPACITY } = require('./data/equipment');
const { DND_TOKEN_COLORS, DND_MAX_TOKEN_IMAGE_CHARS, DND_TOKEN_SIZES, DND_MAX_MAP_BG_CHARS } = require('./data/tokens-map');
const { DEFAULT_MAPS, cloneDefaultMaps } = require('./data/maps');
const { dndAbilityMod, dndRandInt, dndRollVsAC, dndRollDamage, dndAcRange, dndHpRange, dndComputeFinalStats } = require('./dnd/combat-math');

// ---- วิสัยทัศน์ผู้เล่น (Fog of War): DM เปิด/ปิดระบบได้ทั้งห้อง + กำหนดชนิด/รัศมีให้ผู้เล่นแต่ละคนแยกกันได้ ----
// 2 ชนิด ตามธีม D&D — 'normal' มองเห็นระยะปกติ, 'dark' (Darkvision) มองเห็นในที่มืดได้ไกลกว่า
// หน่วยรัศมีเป็น "จำนวนช่องตาราง (grid)" ของแผนที่ที่กำลังแสดงอยู่ (ไม่ใช่ % ของแผนที่แบบตายตัวเหมือน AOE)
// เหตุผล: ถ้าเก็บเป็น % ตายตัว พอ DM ปรับขนาดช่องตาราง (ดู DND_MAP_GRID_*) รัศมีวิสัยทัศน์จะครอบคลุมจำนวนช่องไม่เท่าเดิม
// (เช่น ตั้งไว้ให้มองเห็นประมาณ 2 ช่อง แล้ว DM ทำตารางถี่ขึ้น จะกลายเป็นมองเห็นได้หลายช่องขึ้นทันทีทั้งที่ตัวเลขเดิม)
// จึงเก็บเป็น "จำนวนช่อง" แล้วแปลงเป็น % ของแผนที่ตอนส่งให้ผู้เล่นจริง (ดู dndPublicToken) โดยอิงขนาดช่องของแผนที่ปัจจุบันเสมอ
// ---- ขนาดช่องตาราง (grid) บนแผนที่: DM กำหนดได้เองต่อแผนที่ ว่าจะแบ่งแผนที่ออกเป็นกี่ช่องต่อด้าน (ค่ายิ่งมาก = ช่องยิ่งเล็ก/ถี่) ----
// ค่านี้ใช้คุม background-size ของตาราง grid overlay (ก่อนหน้านี้ hardcode ไว้ที่ 10% เท่ากับ 10 ช่องเสมอ)
const DND_MAP_GRID_MIN = 2;
const DND_MAP_GRID_MAX = 100;
const DND_MAP_GRID_DEFAULT = 10;
const DND_VISION_TYPES = ['normal', 'dark'];
const DND_VISION_TYPE_LABELS = { normal: 'ปกติ', dark: 'มองในที่มืด (Darkvision)' };
// ค่าเริ่มต้น/ขอบเขต หน่วยเป็น "จำนวนช่องตาราง" (รัศมี ไม่ใช่เส้นผ่านศูนย์กลาง) — ค่าเดิมก่อนแก้คือ 24%/42% ของแผนที่
// ซึ่งอิงกับตารางเริ่มต้น 10 ช่อง จึงแปลงกลับมาเป็นหน่วยช่องได้ประมาณ 2.4/4.2 ช่อง (ให้พฤติกรรมเดิมคงเดิมไว้ที่ตาราง 10 ช่อง)
const DND_VISION_DEFAULT_RADIUS = { normal: 2.4, dark: 4.2 };
const DND_VISION_RADIUS_CELLS_MIN = 0.5;
const DND_VISION_RADIUS_CELLS_MAX = 20;
// ---- ระยะโจมตี (สกิล / โจมตีปกติ): เดิมเก็บเป็น % ตายตัวของแผนที่ (0-100 อิงพิกัด token) เหมือนปัญหาเดียวกับวิสัยทัศน์ด้านบน ----
// เวลา DM ปรับความถี่ตาราง (gridSize) ระยะเท่าเดิม (%) จะครอบคลุมจำนวนช่องไม่เท่าเดิมอีกต่อไป
// จึงเปลี่ยนมาเก็บเป็น "จำนวนช่องตาราง" แทน แล้วแปลงเป็น % ของแผนที่ปัจจุบันตอนตรวจระยะจริง (อิงขนาดช่องของแผนที่ปัจจุบันเสมอ ดู dndRangeCellsToPercent)
// 0 = ไม่จำกัดระยะ (ค่าเริ่มต้น คงพฤติกรรมเดิมของระบบไว้) — ค่าที่ไม่ใช่ 0 clamp อยู่ในช่วง 0.5-50 ช่อง
const DND_ATTACK_RANGE_CELLS_MIN = 0.5;
const DND_ATTACK_RANGE_CELLS_MAX = 50;
// แปลง "จำนวนช่อง" ของระยะโจมตี เป็น % ของแผนที่ปัจจุบัน โดยอิงขนาดช่องตาราง (gridSize) ที่ DM ตั้งไว้ตอนนี้เสมอ
// ใช้ร่วมกันทั้งสกิล (skill.range) และโจมตีปกติ (normalAttack.range) เพื่อให้ระยะที่ตั้งไว้ครอบคลุม "จำนวนช่องเท่าเดิม" ไม่ว่าตารางจะถี่/ห่างแค่ไหน
function dndRangeCellsToPercent(cells) {
  const gridSize = Number.isFinite(Number(dndCurrentMap().gridSize)) ? Number(dndCurrentMap().gridSize) : DND_MAP_GRID_DEFAULT;
  return cells * (100 / gridSize);
}
// รับค่าระยะโจมตีดิบจาก payload (หน่วยจำนวนช่องตาราง) แล้ว clamp ให้อยู่ในช่วงที่ระบบรองรับ — 0 หรือค่าว่าง/ไม่ใช่ตัวเลข = ไม่จำกัดระยะ (0)
function dndSanitizeAttackRangeCells(raw) {
  const n = Number(raw) || 0;
  if (n <= 0) return 0;
  return Math.max(DND_ATTACK_RANGE_CELLS_MIN, Math.min(DND_ATTACK_RANGE_CELLS_MAX, Math.round(n * 10) / 10));
}


// ---------------- D&D helper room (separate mini-app, independent of Hearts state) ----------------
let dndPlayers = []; // [{id, ws, name, isDM, connected, character}]
let dndLog = [];     // string entries (dice rolls / system messages), newest last
let dndNextId = 1;
let dndSkills = [];  // [{id, name, desc, stat}] — designed by the DM, visible to the whole party
let dndNextSkillId = 1;
let dndCustomPassives = []; // [{id, key, raceKey ('any' or a race key), name, icon, desc, effect}] — passive skills the DM designs, on top of the built-in ones
let dndRacePassiveOverrides = {}; // { `${raceKey}:${passiveKey}`: {name, icon, desc, effect} } — DM edits to the default values of a built-in race passive (global, affects every character of that race)
let dndNextPassiveId = 1;
let dndSummonTemplateOverrides = {}; // { summonTemplateKey: {name, icon, color, size, maxHp, ac, str..cha, statusResist, attacks} } — DM edits to the default values of a built-in summon template (DND_SUMMON_TEMPLATES), same override pattern as dndRacePassiveOverrides above
let dndScene = { location: '', situation: '' }; // ป้ายประกาศสถานที่/สถานการณ์บนจอทุกคน — DM เท่านั้นที่กำหนดได้
// นาฬิกาในเกม + เวลาวิ่งอัตโนมัติ — state ย้ายไปอยู่ใน server/dnd/game-time.js แล้ว (ดูการ instantiate ด้านล่าง)
// ---- ลำดับเทิร์นผู้เล่น+มอนสเตอร์: DM จัดลำดับเอง (ไม่ทอย initiative) แล้วกดเลื่อนตาไปเรื่อยๆ วนลูป ----
// state (turnOrder/turnIndex) ย้ายไปอยู่ใน server/dnd/turn-order.js แล้ว (module 4, ดูการ instantiate ด้านล่าง)
// ---- แผนที่ (รองรับหลายแผนที่): DM ออกแบบ/สร้าง/สลับได้หลายแผนที่ — มอนสเตอร์ (npc token) ผูกกับแผนที่ที่สร้างตอนนั้น ----
// ชุดแผนที่เริ่มต้นตั้งค่าไว้ที่ data/maps.js — แก้ไฟล์นั้นเพื่อเพิ่ม/แก้แผนที่ตั้งต้นของห้อง
let dndMaps = cloneDefaultMaps();
let dndNextMapId = Math.max(0, ...DEFAULT_MAPS.map(m => m.id)) + 1;
let dndCurrentMapId = DEFAULT_MAPS[0] ? DEFAULT_MAPS[0].id : 1; // แผนที่ที่กำลังแสดงอยู่ตอนนี้ (ทุกคนเห็นแผนที่เดียวกันเสมอ)
function dndCurrentMap() { return dndMaps.find(m => m.id === dndCurrentMapId) || dndMaps[0]; }
// แชร์วิสัยทัศน์ในปาร์ตี้: DM เปิด/ปิดได้เป็นครั้งๆ (ค่าเริ่มต้น = ปิด) — เปิดแล้วหมอกของผู้เล่นแต่ละคนจะรวม (union) พื้นที่มองเห็นของเพื่อนร่วมทีมทุกคนเข้าด้วยกัน
// (ไม่นับ token ที่หมดสติ/ตาย hp<=0 เป็นแหล่งวิสัยทัศน์ให้ปาร์ตี้) — แบ่งเป็น "กรุ๊ป" ได้หลายกรุ๊ปพร้อมกัน แต่ละกรุ๊ปแชร์วิสัยทัศน์กันเองเท่านั้น (ไม่เห็นของกรุ๊ปอื่น)
// ผู้เล่น 1 คนอยู่ได้แค่กรุ๊ปเดียว (เพิ่มเข้ากรุ๊ปใหม่ = เอาออกจากกรุ๊ปเดิมอัตโนมัติ) — ใครไม่ได้อยู่กรุ๊ปไหนเลย = เห็นแค่รอบ token ตัวเอง ไม่แชร์กับใคร
let dndPartyVisionShared = false;
let dndPartyVisionGroups = []; // [{id, playerIds: [number,...]}]
let dndNextPartyVisionGroupId = 1;
// เปิด/ปิดระบบวิสัยทัศน์ (fog of war) ทั้งห้อง — DM คุมได้เท่านั้น ปิดไว้เป็นค่าเริ่มต้น (ไม่บังคับใช้ทุกฉาก)
let dndVisionEnabled = false;
let dndTokens = [];      // [{id, kind:'pc'|'npc', ownerId, name, color, image, x, y, hp, maxHp, ac, attacks, statuses, mapId}] — npc มี hp/ac/attacks/mapId ของตัวเอง (pc ใช้ค่าจากการ์ดตัวละคร และมีตำแหน่งแยกต่อแผนที่ผ่าน positions)
let dndNextTokenId = 1;
// ---- กำแพง: DM วาดเส้นกำแพงลงบนแผนที่ได้ (กันสายตา/แสดงผังห้อง) — ผูกกับแผนที่ที่วาดตอนนั้นเหมือน npc token ----
// พิกัดเป็น % ของแผนที่เหมือน token/AOE (0-100 ทั้งสองแกน) เพื่อให้ยืดหด/สเกลตามขนาดจอได้เหมือนกันทุกจุด
let dndWalls = [];       // [{id, mapId, x1, y1, x2, y2}]
let dndNextWallId = 1;
let dndNextAttackId = 1;
// ตัวนับ nextStatusId ย้ายไปอยู่ใน server/dnd/status-effects.js แล้ว (module 5, ดูการ instantiate ด้านล่าง)
let dndNextLootId = 1;
// ---- ร้านค้า: DM สร้างร้านได้หลายร้าน แต่ละร้านมีรายการไอเทมให้ผู้เล่นซื้อ/ขายคืนด้วยทอง ----
let dndShops = []; // [{id, name, items:[{id,name,price,desc,stock}]}] — stock === null คือขายไม่จำกัด
let dndNextShopId = 1;
let dndNextShopItemId = 1;
// ---- แลกเปลี่ยนไอเทมระหว่างผู้เล่น: เสนอ (ไอเทม+ทอง) แลกกับ (ไอเทม+ทอง) ของอีกฝ่าย ต้องกดยอมรับถึงจะสำเร็จ ----
// dndTrades/dndNextTradeId ย้ายไปอยู่ใน server/dnd/trade.js แล้ว (module 6, ดูการ instantiate ด้านล่าง)
// ---- ไอเทมใช้งานได้: DM กำหนดชื่อไอเทม + ผลของมัน (ฟื้นฟู HP / ให้ทอง) — ถ้าชื่อในกระเป๋าผู้เล่นตรงกับรายการนี้ จะมีปุ่ม "ใช้" ให้กด ----
let dndNextItemEffectId = 1;
let dndItemEffects = []; // [{id, name, effectType:'heal'|'gold', value, desc}] — ค่าเริ่มต้นถูกเซ็ตด้านล่างหลังโหลดโมดูล item.js

// ---- Race / Class helpers, สร้าง/เติมค่าเริ่มต้นตัวละคร — ย้ายไปอยู่ที่ server/dnd/character.js แล้ว (module 3) ----
// dndRacePassivesFor/dndRacePassiveByKey/dndCharPassiveEffect ต้องพึ่ง dndCustomPassives (state ของไฟล์นี้)
// จึงมี wrapper ชื่อเดิมด้านล่าง (หลังประกาศ dndCustomPassives) ส่งค่านั้นเข้าไปให้ทุกครั้งที่เรียก
const {
  dndRaceByKey, dndClassByKey, dndStarterGearForClass,
  dndRacePassivesFor: dndRacePassivesForKit, dndRacePassiveByKey: dndRacePassiveByKeyKit, dndCharPassiveEffect: dndCharPassiveEffectKit,
  dndClassSkillId, dndClassSkillsForPlayer,
  dndSanitizeEquipIcon, dndSanitizeForgeHistory, dndSanitizeEquipSlot, dndSanitizeEquipment, dndSanitizeAppearance,
  dndTotalDefense: dndTotalDefenseKit, dndTotalAttack: dndTotalAttackKit,
  dndLevelFromExp, dndNextLevelExp, dndSyncLevelFromExp,
  newDndCharacter, dndEnsureCharacterDefaults,
} = require('./dnd/character');

// ลงทะเบียนไอเทมสวมใส่เริ่มต้นให้เป็น "ไอเทมใช้งานได้" — ย้ายไปอยู่ที่ server/dnd/item.js (dndEnsureStarterItemEffect)
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

// ---- สกิลติดตัว (Passive) ประจำเผ่าพันธุ์: race/class-kit.js เก็บ logic ไว้แล้ว แต่ dndCustomPassives (สกิลติดตัวที่ DM ออกแบบเอง)
// ยังเป็น state ของไฟล์นี้ จึงห่อ wrapper ชื่อเดิมไว้ ส่ง dndCustomPassives เข้าไปให้ทุกครั้งที่เรียก ----
function dndRacePassivesFor(raceKey) { return dndRacePassivesForKit(raceKey, dndCustomPassives, dndRacePassiveOverrides); }
function dndRacePassiveByKey(raceKey, passiveKey) { return dndRacePassiveByKeyKit(raceKey, passiveKey, dndCustomPassives, dndRacePassiveOverrides); }
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
    resist: clamp(r.resist, -30, 30), // ค่าต้านทานสถานะ (%) ที่พาสซีฟให้เพิ่ม/ลดกับตัวละคร — บวกเข้า character.statusResist ตอนเลือก/เปลี่ยนพาสซีฟ
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
  if (effect.resist) parts.push(`ต้านทานสถานะ ${effect.resist > 0 ? '+' : ''}${effect.resist}%`);
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
// DM แก้ไขค่าเริ่มต้นของสกิลติดตัวประจำเผ่าที่มีมาให้ในระบบ (ไม่ใช่สกิลที่ DM สร้างเอง) — เป็นการแก้ไข "แบบกลาง" มีผลกับตัวละครทุกคนของเผ่านั้นที่เลือกสกิลติดตัวนี้ไว้
// เก็บเป็น override แยกต่างหาก (ไม่แก้ DND_RACE_PASSIVES ตรงๆ) คีย์ = `${raceKey}:${passiveKey}` ทับเฉพาะฟิลด์ที่แก้ ส่วน key เดิมของสกิลยังคงเดิมเสมอ
function dndHandleRacePassiveOverrideSave(ws, raceKey, passiveKey, payload) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM || !payload || typeof payload !== 'object') return;
  const race = dndRaceByKey((raceKey || '').toString());
  if (!race) { dndSendError(ws, 'ไม่พบเผ่าพันธุ์นี้'); return; }
  const pk = (passiveKey || '').toString();
  const builtin = (DND_RACE_PASSIVES[race.key] || []).find(bp => bp.key === pk);
  if (!builtin) { dndSendError(ws, 'ไม่พบสกิลติดตัวประจำเผ่านี้'); return; }
  const name = (payload.name || '').toString().trim().slice(0, 40);
  if (!name) { dndSendError(ws, 'กรุณาตั้งชื่อสกิลติดตัว'); return; }
  const desc = (payload.desc || '').toString().trim().slice(0, 150);
  const icon = (payload.icon || '✨').toString().trim().slice(0, 4) || '✨';
  const effect = dndSanitizePassiveEffect(payload.effect);
  dndRacePassiveOverrides[`${race.key}:${pk}`] = { name, icon, desc, effect };
  dndAddLog(`✏️ DM แก้ไขค่าเริ่มต้นสกิลติดตัวประจำเผ่า "${race.name}": "${name}" — ${dndPassiveEffectLogText(effect)}`);
}
// DM รีเซ็ตสกิลติดตัวประจำเผ่าที่แก้ไว้ ให้กลับไปเป็นค่าเริ่มต้นของระบบ
function dndHandleRacePassiveOverrideReset(ws, raceKey, passiveKey) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  const key = `${(raceKey || '').toString()}:${(passiveKey || '').toString()}`;
  if (dndRacePassiveOverrides[key]) {
    delete dndRacePassiveOverrides[key];
    const race = dndRaceByKey((raceKey || '').toString());
    dndAddLog(`♻️ DM รีเซ็ตสกิลติดตัวประจำเผ่า "${race ? race.name : raceKey}" กลับเป็นค่าเริ่มต้นแล้ว`);
  }
}
// คืนโบนัสจากสกิลติดตัวของตัวละคร (ค่าเริ่มต้นเป็น 0 ทุกช่องถ้ายังไม่ได้เลือก/หาไม่เจอ)
function dndCharPassiveEffect(character) { return dndCharPassiveEffectKit(character, dndCustomPassives, dndRacePassiveOverrides); }
// รวมโบนัส/บทลงโทษจากสถานะผิดปกติ (บัฟ/ดีบัฟ) ทั้งหมดที่ติดอยู่กับผู้เล่น/มอนสเตอร์คนนี้ตอนนี้ — ใช้บวกเข้ากับการทอยโจมตี/ดาเมจ/AC
function dndStatusMods(list) {
  let atk = 0, dmg = 0, def = 0, vision = 0;
  for (const s of (list || [])) {
    atk += Number(s.atkMod) || 0;
    dmg += Number(s.dmgMod) || 0;
    def += Number(s.defMod) || 0;
    vision += Number(s.visionMod) || 0;
  }
  return { atk, dmg, def, vision };
}

// ---- สกิลประจำคลาส: dndClassSkillId/dndClassSkillsForPlayer ย้ายไปอยู่ที่ server/dnd/character.js แล้ว (module 3, ไม่ต้องพึ่ง state ของไฟล์นี้ นำเข้ามาใช้ชื่อเดิมได้ตรงๆ) ----
// เรียกตอนเลเวลอัป (ไม่ว่าจะจากฆ่ามอนสเตอร์ได้ EXP หรือ DM แก้ไขเลเวลตรง ๆ) เพื่อประกาศสกิลใหม่ที่เพิ่งปลดล็อก
function dndAnnounceClassSkillUnlocks(target, oldLevel, newLevel) {
  if (!target || target.isDM || !target.character || !target.character.classKey) return;
  const templates = DND_CLASS_SKILLS[target.character.classKey] || [];
  const unlocked = templates.filter(t => t.level > oldLevel && t.level <= newLevel);
  for (const t of unlocked) {
    dndAddLog(`🔓 ${target.character.charName || target.name} ปลดล็อกสกิลประจำคลาสใหม่: "${t.name}" (เลเวล ${t.level})`);
  }
}

// DM แก้ไขสกิลประจำคลาส (🎓) เฉพาะผู้เล่นคนเดียว โดยไม่กระทบผู้เล่นคนอื่นในคลาสเดียวกัน —
// เก็บเป็น override แยกต่อตัวละคร (skillOverrides[skillId]) ทับค่าเริ่มต้นของคลาสตอนแสดงผล/ใช้งานสกิลเท่านั้น
function dndHandleClassSkillOverrideSave(ws, targetId, skillId, payload) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  const target = dndPlayers.find(pp => pp.id === Number(targetId) && !pp.isDM);
  if (!target || !target.character.classKey) { dndSendError(ws, 'ไม่พบผู้เล่นเป้าหมาย'); return; }
  const sid = Number(skillId);
  const exists = dndClassSkillsForPlayer(target).some(s => s.id === sid);
  if (!exists) { dndSendError(ws, 'ไม่พบสกิลประจำคลาสนี้'); return; }
  if (!payload || typeof payload !== 'object') return;

  const name = (payload.name || '').toString().trim().slice(0, 40);
  if (!name) { dndSendError(ws, 'กรุณาตั้งชื่อสกิล'); return; }
  const statRaw = (payload.stat || '').toString();
  const stat = DND_SKILL_STATS.includes(statRaw) ? statRaw : '';
  const desc = (payload.desc || '').toString().trim().slice(0, 500);

  const dmg = (payload.damage && typeof payload.damage === 'object') ? payload.damage : {};
  const dmgDie = DND_VALID_DICE.includes(Number(dmg.die)) ? Number(dmg.die) : 0;
  const dmgCount = Math.max(1, Math.min(20, Math.round(Number(dmg.count) || 1)));
  const dmgMod = Math.max(-100, Math.min(100, Math.round(Number(dmg.mod) || 0)));
  const cooldownSec = Math.max(0, Math.min(3600, Math.round(Number(payload.cooldownSec) || 0)));
  const maxUses = Math.max(0, Math.min(99, Math.round(Number(payload.maxUses) || 0)));
  // SP ที่ต้องใช้ต่อการใช้สกิลนี้ 1 ครั้ง เฉพาะผู้เล่นคนนี้คนเดียว — 0 = ไม่ใช้ SP เลย
  const spCost = Math.max(0, Math.min(999, Math.round(Number(payload.spCost) || 0)));
  // โอกาสโดน (%) — ใช้เฉพาะตอนสกิลนี้ไม่ได้ผูกสเตตัส ดูรายละเอียดที่ dndSanitizeHitChance
  const hitChance = dndSanitizeHitChance(payload.hitChance);
  // โดนเสมอ (guaranteedHit) — DM ตั้งไว้ล่วงหน้าตอนแก้สกิลประจำคลาส ไม่ใช่ตัวเลือกที่ผู้เล่นกดตอนใช้สกิล ดูรายละเอียดที่ dndHandleSkillCreate
  const guaranteedHit = !!payload.guaranteedHit;

  const heal = (payload.heal && typeof payload.heal === 'object') ? payload.heal : {};
  const healDie = DND_VALID_DICE.includes(Number(heal.die)) ? Number(heal.die) : 0;
  const healCount = Math.max(1, Math.min(20, Math.round(Number(heal.count) || 1)));
  const healMod = Math.max(-100, Math.min(100, Math.round(Number(heal.mod) || 0)));
  // ประเภทของสกิลชุบ HP — false (ค่าเริ่มต้น) = "ฟื้นฟู" ธรรมดา ปลุกคนหมดสติไม่ได้, true = "ชุบชีวิต" ปลุกคนหมดสติได้ด้วย (เหมือนไอเทม heal/revive)
  const healRevive = !!heal.revive;

  // สถานะ/ดีบัฟที่ผูกกับสกิล (ไม่บังคับ) — เหมือนตอนสร้าง/แก้ไขสกิลที่ DM สร้างเอง
  const status = dndSanitizeSkillStatus(payload.status);
  // ไอเทมที่ต้องใช้ประกอบสกิลนี้ (ไม่บังคับ) — เหมือนตอนสร้าง/แก้ไขสกิลที่ DM สร้างเอง
  const reqItem = dndSanitizeSkillReqItem(payload.reqItem);
  // สกิลบัฟเพื่อน (ไม่บังคับ) — เปิดไว้แล้วตอนใช้สกิลจะเลือกเป้าหมายเป็นผู้เล่นได้
  const buffAlly = !!payload.buffAlly;

  // รัศมี AOE (0 = เป้าเดี่ยวปกติ) + รูปแบบพื้นที่ (วงกลม/เส้นตรง)
  const aoeRaw = (payload.aoe && typeof payload.aoe === 'object') ? payload.aoe : {};
  const aoeRadius = Math.max(0, Math.min(100, Math.round(Number(aoeRaw.radius) || 0)));
  const aoeShape = dndSanitizeAoeShape(aoeRaw.shape);
  // ระยะโจมตี (0 = ไม่จำกัดระยะ) — หน่วย "จำนวนช่องตาราง" (แปลงเป็น % ของแผนที่ปัจจุบันตอนตรวจระยะจริง ดู dndRangeCellsToPercent) ระหว่าง token ผู้ใช้กับ token เป้าหมาย ดูรายละเอียดที่ dndHandleSkillCreate
  const range = dndSanitizeAttackRangeCells(payload.range);

  // สกิลลบล้างสถานะ (cleanse)
  const cleanseRaw = (payload.cleanse && typeof payload.cleanse === 'object') ? payload.cleanse : {};
  const cleanseEnabled = !!cleanseRaw.enabled;
  const cleanseName = cleanseEnabled ? (cleanseRaw.name || '').toString().trim().slice(0, 24) : '';
  // เป้าหมายที่เลือกได้ตอนใช้สกิลนี้: 'monster' / 'player' / 'both' — ดูรายละเอียดที่ dndHandleSkillCreate
  const targetMode = dndSanitizeTargetMode(payload.targetMode) || (buffAlly || healDie || cleanseEnabled ? 'player' : 'monster');

  target.character.skillOverrides = target.character.skillOverrides || {};
  target.character.skillOverrides[sid] = {
    name, stat, desc, dmgDie, dmgCount, dmgMod, cooldownSec, maxUses, spCost, hitChance, guaranteedHit,
    healDie, healCount, healMod, healRevive, statusName: status.name, statusNote: status.note, statusChance: status.chance, buffAlly, targetMode,
    statusDurationSec: status.durationSec, statusAtkMod: status.atkMod, statusDmgMod: status.dmgMod, statusDefMod: status.defMod, statusVisionMod: status.visionMod,
    statusTickValue: status.tickValue, statusTickIntervalSec: status.tickIntervalSec, statusIcon: status.icon, statusColor: status.color,
    reqItemName: reqItem.reqItemName, reqItemQty: reqItem.reqItemQty,
    aoeRadius, aoeShape, cleanseEnabled, cleanseName, range,
  };
  dndAddLog(`✏️ DM ปรับสกิลประจำคลาส "${name}" ของ ${target.character.charName || target.name} (เฉพาะคนนี้คนเดียว คนอื่นในคลาสเดียวกันไม่กระทบ)`);
}
function dndHandleClassSkillOverrideReset(ws, targetId, skillId) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  const target = dndPlayers.find(pp => pp.id === Number(targetId) && !pp.isDM);
  if (!target) { dndSendError(ws, 'ไม่พบผู้เล่นเป้าหมาย'); return; }
  const sid = Number(skillId);
  if (target.character.skillOverrides && target.character.skillOverrides[sid]) {
    delete target.character.skillOverrides[sid];
    dndAddLog(`♻️ DM รีเซ็ตสกิลประจำคลาสของ ${target.character.charName || target.name} กลับเป็นค่าเริ่มต้นของคลาสแล้ว`);
  }
}

// ---- อุปกรณ์สวมใส่ / แต่งหน้าตา / เลเวล-EXP / สร้างตัวละครใหม่ ----
// dndSanitizeEquipIcon, dndSanitizeForgeHistory, dndSanitizeEquipSlot, dndSanitizeEquipment, dndSanitizeAppearance,
//   dndLevelFromExp, dndNextLevelExp, dndSyncLevelFromExp, newDndCharacter, dndEnsureCharacterDefaults
//                                                                        → ย้ายไปที่ server/dnd/character.js (module 3, นำเข้ามาใช้ชื่อเดิมได้ตรงๆ ด้านบนไฟล์นี้)
// ---- กระเป๋า / ร้านค้า / ไอเทมใช้งานได้ ----
// dndSanitizeBag, dndBagHasRoomFor, dndBagAdd, dndBagRemove, dndCharacterHasRoomForItems,
//   dndHandleGiveItem, dndHandleTakeItem                                → ย้ายไปที่ server/dnd/bag.js
// dndSanitizeShopItem, dndDefaultShopItems, dndSanitizeForgeTier, dndDefaultForgeItems,
//   dndHandleShopCreate/Rename/ToggleClosed/Delete/ItemAdd/ItemEdit/ItemDelete/Buy/Sell,
//   dndHandleForgeAttempt                                                → ย้ายไปที่ server/dnd/shop.js
// dndEnsureStarterItemEffect, dndDefaultItemEffectsInit, dndSanitizeItemEffect, dndItemEffectLogText,
//   dndHandleItemEffectCreate/Edit/Delete, dndAutoRegisterEquipItemEffect, dndHandleUseItem, dndEquipSlotBroken
//                                                                        → ย้ายไปที่ server/dnd/item.js
// ทุกฟังก์ชันข้างต้นยังเรียกใช้ได้ตามชื่อเดิมทุกที่ในไฟล์นี้ (ผูกกลับเข้ามาผ่าน ctx ด้านล่าง หลังประกาศ dndIsCharDead)
// dndTotalDefense/dndTotalAttack ต้องพึ่ง dndEquipSlotBroken (จาก item.js) จึงห่อ wrapper ชื่อเดิมไว้ ส่งค่านั้นเข้าไปให้ทุกครั้งที่เรียก
// (ปลอดภัยแม้ประกาศไว้ก่อน require('./dnd/item') ด้านล่าง เพราะ handler จริงจะถูกเรียกใช้หลังไฟล์โหลดเสร็จสมบูรณ์แล้วเท่านั้น)
function dndTotalDefense(equipment) { return dndTotalDefenseKit(equipment, dndEquipSlotBroken); }
function dndTotalAttack(equipment) { return dndTotalAttackKit(equipment, dndEquipSlotBroken); }
function dndPublicPlayer(p, viewerId) {
  // สกิลที่ DM มอบให้ผู้เล่นคนนี้โดยเฉพาะ — ส่งให้ทุกคนเห็นบนการ์ดตัวละครของเขาในปาร์ตี้
  const assignedSkills = dndSkills.filter(s => s.assignedIds && s.assignedIds.includes(p.id)).map(s => ({ id: s.id, name: s.name }));
  // สกิลประจำคลาสของผู้เล่นคนนี้ทั้งหมด (รวมที่ยังไม่ปลดล็อก) — ให้ DM เห็นครบตอนเปิดหน้าต่างแก้ไขผู้เล่นคนนี้
  const classSkills = dndClassSkillsForPlayer(p).map(s => ({
    id: s.id, name: s.name, desc: s.desc, level: s.level, locked: s.locked, overridden: s.overridden,
    stat: s.stat, dmgDie: s.dmgDie, dmgCount: s.dmgCount, dmgMod: s.dmgMod, cooldownSec: s.cooldownSec, maxUses: s.maxUses, spCost: s.spCost || 0,
    hitChance: s.hitChance, guaranteedHit: !!s.guaranteedHit,
    healDie: s.healDie || 0, healCount: s.healCount || 1, healMod: s.healMod || 0, healRevive: !!s.healRevive,
    statusName: s.statusName || '', statusNote: s.statusNote || '', statusChance: s.statusChance,
    statusDurationSec: s.statusDurationSec || 0, statusAtkMod: s.statusAtkMod || 0, statusDmgMod: s.statusDmgMod || 0,
    statusDefMod: s.statusDefMod || 0, statusVisionMod: s.statusVisionMod || 0, statusTickValue: s.statusTickValue || 0, statusTickIntervalSec: s.statusTickIntervalSec || 6,
    reqItemName: s.reqItemName || '', reqItemQty: s.reqItemQty || 0,
    aoeRadius: s.aoeRadius || 0, aoeShape: dndSanitizeAoeShape(s.aoeShape), cleanseEnabled: !!s.cleanseEnabled, cleanseName: s.cleanseName || '', range: s.range || 0,
    buffAlly: !!s.buffAlly, targetMode: dndSkillTargetMode(s),
  }));
  // แอบเป็น DM (/game mode 1): ซ่อนสถานะ DM จริงจากทุกคนยกเว้นตัวเอง ให้คนอื่นมองว่าเป็นผู้เล่นปกติ
  const shownIsDM = (p.secretDM && viewerId !== p.id) ? false : p.isDM;
  return { id: p.id, isDM: shownIsDM, connected: p.connected, character: p.character, assignedSkills, classSkills };

}
// คืนรายการสกิลที่ผู้เล่นคนนี้มองเห็น พร้อมสถานะคูลดาวน์/จำนวนครั้งที่ใช้ไปแล้ว "เฉพาะของเขาเอง"
// (ไม่แก้ไขอ็อบเจกต์สกิลต้นฉบับ เพราะสกิลเดียวกันอาจถูกมองจากผู้เล่นหลายคนพร้อมกัน)
// ผู้เล่นทั่วไป (ไม่ใช่ DM) เห็นเฉพาะ: สกิลที่ DM ยังไม่ได้จำกัดสิทธิ์ (ใช้ได้ทั้งปาร์ตี้) + สกิลที่ตัวเองถูกระบุสิทธิ์ไว้โดยเฉพาะ/เรียนรู้แล้ว
// (ไม่เห็นรายละเอียด/ชื่อของสกิลที่ DM มอบสิทธิ์ให้ผู้เล่นคนอื่นเท่านั้น) — DM เห็นสกิลทั้งหมดในห้องเสมอเพื่อจัดการได้ครบ
// สำคัญ: รายการนี้คือ "สกิลที่ใช้ได้จริง" ที่ไปโผล่ในแท็บ "สกิล" ของผู้เล่นด้วย — สกิล libraryOnly (จากสมุดเวทย์) ต้องถูกซื้อ+อ่านเรียนก่อน
// (ทำให้ตัวเองถูกเติมเข้า assignedIds) ถึงจะโผล่ตรงนี้ ห้ามเอา libraryOnly ออกจากเงื่อนไขนี้ ไม่งั้นผู้เล่นจะเห็น/ใช้สกิลที่ยังไม่ได้เรียนได้ทั้งหมด
// การแสดงชื่อ/รายละเอียดสกิลในหน้าร้านห้องสมุด "ก่อนซื้อ" ใช้ข้อมูลจากคนละช่องทาง (librarySkillCatalog) ไม่ใช่ช่องนี้
function dndVisibleSkills(p) {
  const customVisible = p.isDM
    ? dndSkills
    : dndSkills.filter(s => (s.assignedIds && s.assignedIds.includes(p.id)) || (!s.libraryOnly && (!s.assignedIds || s.assignedIds.length === 0)));
  const all = customVisible.concat(dndClassSkillsForPlayer(p));
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
// รายการ "ข้อมูลแสดงผล" ของสกิล libraryOnly ทุกตัว (เช่น สกิลจากสมุดเวทย์ในร้านห้องสมุด) ส่งให้ผู้เล่นทุกคนแบบไม่กรอง assignedIds
// ใช้แค่โชว์ชื่อ/ดาเมจ/SP/คูลดาวน์ ฯลฯ ในหน้าร้านก่อนซื้อเท่านั้น — ไม่เกี่ยวกับสิทธิ์ใช้สกิลจริง (ดู dndVisibleSkills ด้านบน)
function dndLibrarySkillCatalog() {
  return dndSkills.filter(s => s.libraryOnly).map(s => ({
    id: s.id, name: s.name, desc: s.desc, level: s.level, stat: s.stat,
    allowedClasses: s.allowedClasses, dmgDie: s.dmgDie, dmgCount: s.dmgCount, dmgMod: s.dmgMod,
    healDie: s.healDie, healCount: s.healCount, healMod: s.healMod, healRevive: s.healRevive,
    spCost: s.spCost || 0, cooldownSec: s.cooldownSec, maxUses: s.maxUses,
    range: s.range, aoeRadius: s.aoeRadius, aoeShape: s.aoeShape,
  }));
}
function dndBroadcastState() {
  for (const p of dndPlayers) {
    if (p.ws && p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(JSON.stringify({
        type: 'dndState',
        you: { id: p.id, isDM: p.isDM, locked: p.character.locked, movedThisTurn: p.dndMovedAtStep === dndTurnOrderModule.getStepId() },
        players: dndPlayers.map(pp => dndPublicPlayer(pp, p.id)),
        log: dndLogForPlayer(p),
        races: DND_RACES,
        classes: DND_CLASSES,
        classStarterGear: DND_CLASS_STARTER_GEAR,
        passives: DND_RACE_PASSIVES,
        customPassives: dndCustomPassives,
        racePassiveOverrides: dndRacePassiveOverrides,
        skills: dndVisibleSkills(p),
        librarySkillCatalog: dndLibrarySkillCatalog(),
        summonTemplates: DND_SUMMON_TEMPLATES,
        summonTemplateOverrides: dndSummonTemplateOverrides,
        pointBuyMin: POINT_BUY_MIN,
        pointBuyBudget: POINT_BUY_BUDGET,
        pointBuyCost: POINT_BUY_COST,
        pointBuyCostMaxDefined: POINT_BUY_COST_MAX_DEFINED,
        pointBuyCostPerStepAboveMax: POINT_BUY_COST_PER_STEP_ABOVE_MAX,
        statPointsPerLevel: STAT_POINTS_PER_LEVEL,
        equipSlots: DND_EQUIP_SLOTS,
        equipSlotLabels: DND_EQUIP_SLOT_LABELS,
        bagCapacity: DND_BAG_CAPACITY,
        hairStyles: DND_HAIR_STYLES,
        hairColors: DND_HAIR_COLORS,
        faceStyles: DND_FACE_STYLES,
        shops: p.isDM ? dndShops : dndShops.filter(s => !s.closed),
        forgeFailPolicyLabels: DND_FORGE_FAIL_POLICY_LABELS,
        itemEffects: dndItemEffects,
        trades: dndTradesForPlayer(p),
        scene: dndScene,
        gameTime: dndGameTimeModule.getGameTime(),
        timeAuto: dndGameTimeModule.getTimeAuto(),
        tokens: dndTokensPublic(),
        walls: dndWallsForCurrentMap(),
        visionEnabled: dndVisionEnabled,
        visionTypeLabels: DND_VISION_TYPE_LABELS,
        visionDefaults: DND_VISION_DEFAULT_RADIUS,
        partyVisionShared: dndPartyVisionShared,
        partyVisionGroups: dndPartyVisionGroups.map(g => ({ id: g.id, playerIds: g.playerIds.slice() })),
        mapBackground: dndCurrentMap().background,
        mapGridSize: Number.isFinite(Number(dndCurrentMap().gridSize)) ? Number(dndCurrentMap().gridSize) : DND_MAP_GRID_DEFAULT,
        mapGridMin: DND_MAP_GRID_MIN,
        mapGridMax: DND_MAP_GRID_MAX,
        maps: dndMaps.map(m => ({ id: m.id, name: m.name, playerIds: Array.isArray(m.playerIds) ? m.playerIds : [], gridSize: Number.isFinite(Number(m.gridSize)) ? Number(m.gridSize) : DND_MAP_GRID_DEFAULT })),
        currentMapId: dndCurrentMapId,
        levelExpTable: DND_LEVEL_EXP,
        turnOrder: dndTurnOrderModule.getTurnOrder().map(e => ({ kind: e.kind, id: e.id, name: dndTurnEntryName(e) })),
        turnIndex: dndTurnOrderModule.getTurnIndex(),
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
    const visionType = DND_VISION_TYPES.includes(t.visionType) ? t.visionType : 'normal';
    const baseVisionRadiusCells = Number.isFinite(t.visionRadius) ? t.visionRadius : DND_VISION_DEFAULT_RADIUS[visionType];
    // บวกโบนัส/บทลงโทษวิสัยทัศน์จากสถานะที่ติดตัวผู้เล่นอยู่ตอนนี้ (เช่นสกิลบัฟตาเหยี่ยว หรือดีบัฟตาบอด) เข้ากับค่าพื้นฐาน (หน่วยจำนวนช่องเหมือนกัน)
    // แล้ว clamp ให้อยู่ในช่วงที่ระบบรองรับ (0.5-20 ช่อง) ก่อนแปลงเป็น % ของแผนที่ปัจจุบันตามขนาดช่องตาราง (gridSize) ที่ DM ตั้งไว้
    // ทำแบบนี้เพื่อให้รัศมีวิสัยทัศน์ครอบคลุม "จำนวนช่องเท่าเดิม" เสมอ ไม่ว่า DM จะปรับตารางให้ถี่/ห่างแค่ไหนก็ตาม
    const visionMod = dndStatusMods(statuses).vision;
    const visionRadiusCells = Math.max(DND_VISION_RADIUS_CELLS_MIN, Math.min(DND_VISION_RADIUS_CELLS_MAX, baseVisionRadiusCells + visionMod));
    const cellPctOfMap = 100 / (Number.isFinite(Number(dndCurrentMap().gridSize)) ? Number(dndCurrentMap().gridSize) : DND_MAP_GRID_DEFAULT);
    const visionRadius = visionRadiusCells * cellPctOfMap;
    return {
      id: t.id, kind: 'pc', ownerId: t.ownerId, name, color: t.color, image: t.image || null, x: pos.x, y: pos.y, hp, maxHp, ac, attacks: [], statuses,
      visionType, visionRadius, visionRadiusOverride: Number.isFinite(t.visionRadius) ? t.visionRadius : null,
    };
  }
  return {
    // ownerId เดิม hardcode เป็น null เสมอ (สมัยที่ npc มีแต่มอนสเตอร์ของ DM) — ตอนนี้ token อัญเชิญของผู้เล่นก็เป็น kind:'npc' เหมือนกัน
    // แต่มี ownerId เป็นผู้เล่นที่ร่าย จึงต้องส่งค่าจริงออกไปให้ client รู้ว่า token ตัวนี้เป็นของใคร (ใช้คุมสิทธิ์สั่งการฝั่ง client ในโมดูลถัดไป)
    id: t.id, kind: 'npc', ownerId: t.ownerId || null, name: t.name, color: t.color, image: t.image || null, x: t.x, y: t.y, mapId: t.mapId,
    hp: t.hp, maxHp: t.maxHp, ac: t.ac, size: t.size || 'normal',
    str: t.str || 10, dex: t.dex || 10, con: t.con || 10, int: t.int || 10, wis: t.wis || 10, cha: t.cha || 10,
    attacks: t.attacks || [], statuses: t.statuses || [], expReward: t.expReward || 0, goldReward: t.goldReward || 0, loot: t.loot || [], statusResist: t.statusResist || 0,
    summoned: !!t.summoned, summonExpiresAt: t.summonExpiresAt || 0,
  };
}
// ผู้เล่น (pc) เห็นเฉพาะแผนที่ที่ตัวเองถูก DM เลือกไว้เท่านั้น (ยังไม่ถูกเลือก = ไม่แสดง) — มอนสเตอร์ (npc) แสดงเฉพาะที่อยู่บนแผนที่ปัจจุบันเท่านั้น
function dndTokensPublic() {
  const map = dndCurrentMap();
  return dndTokens.filter(t => t.kind === 'npc' ? t.mapId === dndCurrentMapId : dndMapAllowsPlayer(map, t.ownerId)).map(dndPublicToken);
}
// กำแพงที่อยู่บนแผนที่ที่กำลังแสดงอยู่ตอนนี้เท่านั้น (เหมือน npc token ที่ผูกกับแผนที่)
function dndWallsForCurrentMap() {
  return dndWalls.filter(w => w.mapId === dndCurrentMapId);
}
// ---- AOE: หาตำแหน่งเป้าหมายบนแผนที่ปัจจุบัน + รวบรวมเป้าหมายทั้งหมดไว้คำนวณระยะห่างตอนใช้สกิล AOE ----
// พิกัด x,y ของ token ทุกตัวเป็นหน่วย % ของแผนที่ (0-100 ทั้งสองแกน) อยู่แล้ว จึงใช้ระยะทางแบบยุคลิดตรง ๆ ได้
function dndTargetMapPos(targetType, targetId) {
  if (targetType === 'token') {
    const t = dndTokens.find(tt => tt.id === Number(targetId) && tt.kind === 'npc' && tt.mapId === dndCurrentMapId);
    return t ? { x: t.x, y: t.y } : null;
  }
  if (targetType === 'player') {
    if (!dndMapAllowsPlayer(dndCurrentMap(), Number(targetId))) return null; // ผู้เล่นคนนี้ไม่ได้อยู่ในแผนที่ปัจจุบัน
    const tok = dndTokens.find(t => t.kind === 'pc' && t.ownerId === Number(targetId));
    return tok ? dndPcPosForCurrentMap(tok) : null;
  }
  return null;
}
// รายชื่อเป้าหมายทั้งหมดที่อาจโดน AOE บนแผนที่ปัจจุบัน (ผู้เล่นที่ล็อกการ์ดแล้วและอยู่ในแผนที่นี้ทุกคน + มอนสเตอร์บนแผนที่นี้)
function dndAoeCandidates() {
  const list = [];
  const map = dndCurrentMap();
  for (const pp of dndPlayers) {
    if (pp.isDM || !pp.character || !pp.character.locked) continue;
    if (!dndMapAllowsPlayer(map, pp.id)) continue;
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
// รูปแบบพื้นที่ AOE: 'circle' (ค่าเริ่มต้น) = วงกลมรอบเป้าหมายหลัก, 'line' = เส้นตรงพุ่งจากตัวผู้ใช้ไปยังเป้าหมายหลัก (กว้างเท่ารัศมีที่ตั้งไว้)
const DND_AOE_SHAPES = ['circle', 'line'];
function dndSanitizeAoeShape(raw) {
  const s = (raw || '').toString();
  return DND_AOE_SHAPES.includes(s) ? s : 'circle';
}
// ระยะของ "ผู้สมัคร" คนหนึ่ง (pos) จากพื้นที่ AOE ตามรูปแบบที่ตั้งไว้ — ใช้ตัวเลขนี้เทียบกับ aoeRadius/aoeWidth เพื่อดูว่าโดนหรือไม่ และคำนวณดาเมจลดหลั่น
// - circle: ระยะทางตรงจากจุดศูนย์กลาง (ตำแหน่งเป้าหมายหลัก) แบบเดิม
// - line: ระยะตั้งฉากจากส่วนของเส้นตรงระหว่างจุดเริ่ม (origin, ตำแหน่งผู้ใช้ตอนร่าย) ถึงจุดปลาย (center, ตำแหน่งเป้าหมายหลัก)
//   หากจุดนั้น "เลย" ปลายเส้นไปข้างใดข้างหนึ่ง จะยึดระยะจากปลายเส้นที่ใกล้ที่สุดแทน (เหมือนแคปซูล/เส้นมีหัวมน กันไม่ให้เป็นเส้นยาวไม่มีที่สิ้นสุด)
function dndAoeDist(shape, originPos, centerPos, pos) {
  if (shape === 'line' && originPos) {
    const dx = centerPos.x - originPos.x, dy = centerPos.y - originPos.y;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq > 0 ? ((pos.x - originPos.x) * dx + (pos.y - originPos.y) * dy) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const px = originPos.x + dx * t, py = originPos.y + dy * t;
    return Math.hypot(pos.x - px, pos.y - py);
  }
  return Math.hypot(pos.x - centerPos.x, pos.y - centerPos.y);
}
function dndFindByWs(ws) { return dndPlayers.find(p => p.ws === ws); }
function dndSendError(ws, msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'dndError', msg }));
}
// ตัวละครถือว่า "หมดสติ/ตาย" เมื่อ HP <= 0 — ทำอะไรไม่ได้ (โจมตี/ใช้สกิล/ใช้ไอเทม/ขยับ token) จนกว่าจะมีคนใช้ไอเทมชุบให้ หรือ DM เพิ่ม HP ให้โดยตรง
const DND_DEAD_MSG = 'คุณหมดสติอยู่ ทำอะไรไม่ได้จนกว่าจะมีคนใช้ไอเทมชุบให้ หรือ DM เพิ่ม HP ให้';
// โดนโจมตีครั้งเดียวดาเมจ >= 2 เท่าของ "เลือดสูงสุด" ตัวเอง (โอเวอร์คิล) = ตายถาวร ("permaDead")
// ต่างจากหมดสติปกติตรงที่ไอเทม/สกิลชุบ (แม้แต่ประเภท "ชุบชีวิต") ปลุกไม่ได้เด็ดขาด — ต้องให้ DM เพิ่ม HP ให้โดยตรงเท่านั้นถึงจะฟื้นกลับมาได้
const DND_OVERKILL_MULT = 2;
const DND_PERMADEAD_MSG = 'คุณตายถาวรแล้ว (โดนดาเมจครั้งเดียวเกิน 2 เท่าของเลือดสูงสุด) ไอเทม/สกิลชุบใช้ปลุกไม่ได้ ต้องรอ DM เพิ่ม HP ให้เท่านั้นถึงจะฟื้นได้';
function dndIsCharDead(c) { return !!c && ((Number(c.hp) || 0) <= 0 || !!c.permaDead); }
function dndDeadMsgFor(c) { return (c && c.permaDead) ? DND_PERMADEAD_MSG : DND_DEAD_MSG; }

// ---- ctx: บริดจ์ระหว่าง dnd.js กับโมดูลย่อย (server/dnd/bag.js, item.js, shop.js) ----
// ใช้ get/set accessor สำหรับ state ที่มีการ "แทนที่ทั้งก้อน" (ไม่ใช่แค่ push/splice) เช่น dndItemEffects ตอนลบ,
// และตัวนับ id ต่างๆ ที่ถูก ++ เพื่อให้โมดูลย่อยอ่าน/แก้ตัวแปร let ตัวจริงในไฟล์นี้ได้เสมอ
const dndCtx = {
  get dndPlayers() { return dndPlayers; },
  get shops() { return dndShops; },
  get skills() { return dndSkills; },
  get itemEffects() { return dndItemEffects; },
  set itemEffects(v) { dndItemEffects = v; },
  get nextShopId() { return dndNextShopId; },
  set nextShopId(v) { dndNextShopId = v; },
  get nextShopItemId() { return dndNextShopItemId; },
  set nextShopItemId(v) { dndNextShopItemId = v; },
  get nextItemEffectId() { return dndNextItemEffectId; },
  set nextItemEffectId(v) { dndNextItemEffectId = v; },
  DND_BAG_CAPACITY, DND_EQUIP_SLOTS, DND_EQUIP_SLOT_LABELS, DND_FORGE_FAIL_POLICIES, DND_ITEM_EFFECT_TYPES,
  DND_DEAD_MSG, DND_PERMADEAD_MSG, DND_CLASSES,
  dndFindByWs, dndSendError, dndAddLog, dndBroadcastState,
  dndSanitizeEquipment, dndSanitizeEquipIcon, dndSanitizeForgeHistory, dndIsCharDead, dndDeadMsgFor,
  dndSkillClassAllowed, dndAllowedClassesText,
};

const {
  dndSanitizeBag, dndBagHasRoomFor, dndBagAdd, dndBagRemove,
  dndCharacterHasRoomForItems, dndHandleGiveItem, dndHandleTakeItem,
} = require('./dnd/bag')(dndCtx);

// ฟังก์ชันกระเป๋าถูกใช้งานจากภายในโมดูลไอเทม/ร้านค้าด้วย (ใช้ตอนซื้อ/ขาย/ใช้ไอเทม) — เติมเข้า ctx หลังสร้างโมดูลกระเป๋าแล้ว
dndCtx.dndBagAdd = dndBagAdd;
dndCtx.dndBagRemove = dndBagRemove;
dndCtx.dndBagHasRoomFor = dndBagHasRoomFor;

// ---- แลกเปลี่ยนไอเทมระหว่างผู้เล่น: ย้ายไปอยู่ที่ server/dnd/trade.js แล้ว (module 6) ----
// getPlayers ต้องเป็นฟังก์ชัน (ไม่ใช่ค่าตรงๆ) เพราะ dndPlayers ถูกแทนที่ทั้งก้อนได้ (เช่นตอนโหลดไฟล์เซฟ)
// ใช้ bag helper ชุดเดียวกับที่โมดูลไอเทม/ร้านค้าใช้ (มาจาก server/dnd/bag.js ด้านบน)
const dndTradeModule = require('./dnd/trade').createTrade({
  findByWs: dndFindByWs, sendError: dndSendError, addLog: dndAddLog, getPlayers: () => dndPlayers,
  sanitizeBag: dndSanitizeBag, bagAdd: dndBagAdd, bagRemove: dndBagRemove,
  hasRoomForItems: dndCharacterHasRoomForItems, bagCapacity: DND_BAG_CAPACITY,
});
const {
  tradesForPlayer: dndTradesForPlayer,
  handleTradeOffer: dndHandleTradeOffer,
  handleTradeRespond: dndHandleTradeRespond,
  handleTradeCancel: dndHandleTradeCancel,
} = dndTradeModule;

const {
  dndEnsureStarterItemEffect, dndDefaultItemEffectsInit, dndSanitizeItemEffect, dndItemEffectLogText,
  dndHandleItemEffectCreate, dndAutoRegisterEquipItemEffect, dndHandleItemEffectEdit, dndHandleItemEffectDelete,
  dndHandleUseItem, dndEquipSlotBroken, dndUpsertSkillItemEffect,
} = require('./dnd/item')(dndCtx);
// ให้ร้านค้า (server/dnd/shop.js) เรียกใช้ตอนเพิ่ม/แก้ไข "สมุดเวทย์" ในร้านห้องสมุดได้ — ผูกชื่อหนังสือเข้ากับผลไอเทมประเภท "skill" ให้อัตโนมัติ
dndCtx.dndUpsertSkillItemEffect = dndUpsertSkillItemEffect;

const {
  dndSanitizeShopItem, dndDefaultShopItems, dndSanitizeForgeTier, dndDefaultForgeItems,
  dndHandleShopCreate, dndHandleShopRename, dndHandleShopToggleClosed, dndHandleShopDelete,
  dndHandleShopItemAdd, dndHandleShopItemEdit, dndHandleShopItemDelete,
  dndHandleShopBuy, dndHandleShopSell, dndHandleForgeAttempt,
} = require('./dnd/shop')(dndCtx);

// ค่าเริ่มต้นของ itemEffects (เดิมเซ็ตตอนประกาศ let dndItemEffects — ย้ายมาทำที่นี่เพราะฟังก์ชันอยู่ในโมดูลแยกแล้ว)
dndItemEffects = dndDefaultItemEffectsInit();

// ---- ห้องสมุดเวทย์เริ่มต้น: seed สกิลจาก DND_SPELLBOOK_SKILLS (Cantrip-9th Level, 574 เวทย์ ครบทุกเลเวลแล้ว) เข้าไปเป็นสกิล libraryOnly ----
// พร้อมเปิดร้านห้องสมุดเริ่มต้น 1 ร้าน ขายสมุดเวทย์ผูกกับสกิลแต่ละอันให้อัตโนมัติ ผู้เล่นซื้อมา "ใช้" (อ่าน) เพื่อเรียนรู้ได้ทันที
// ราคาสมุด: อิงเลเวลเวทย์ — เลเวลยิ่งสูงยิ่งแพง ตามสูตร (level+1)^2 * 10 ทอง (แคนทริป=10, เลเวล1=40, เลเวล2=90, เลเวล3=160, ... เลเวล9=1000)
function dndCloneDefaultSpellbookSkills() {
  return DND_SPELLBOOK_SKILLS.map(s => ({ ...s, assignedIds: [] }));
}
function dndSpellbookPriceForLevel(level) {
  return (level + 1) * (level + 1) * 10;
}
function dndDefaultSpellbookLibraryShop() {
  const items = DND_SPELLBOOK_SKILLS.map(s => ({
    id: ctxNextShopItemIdPeek(), name: `สมุดเวทย์: ${s.name}`, price: dndSpellbookPriceForLevel(s.level),
    desc: `อ่านแล้วเรียนรู้สกิล "${s.name}" (เวทย์เลเวล ${s.level === 0 ? 'แคนทริป' : s.level})`,
    stock: null, skillId: s.id,
  }));
  return { id: 1, name: '📚 ห้องสมุดเวทย์ (Cantrip-9th Level)', type: 'library', closed: false, items };
}
// ctxNextShopItemIdPeek: ตอน seed ตอน startup ยังไม่ต้องกันชนกับ id จริงของร้านอื่น เพราะร้านนี้เป็นร้านแรกเสมอ (id เริ่ม 1..574)
let dndSpellbookItemIdCounter = 0;
function ctxNextShopItemIdPeek() { dndSpellbookItemIdCounter += 1; return dndSpellbookItemIdCounter; }

function dndSeedSpellbookLibrary() {
  dndSpellbookItemIdCounter = 0;
  dndSkills = dndCloneDefaultSpellbookSkills();
  dndNextSkillId = DND_SPELLBOOK_ID_BASE + DND_SPELLBOOK_SKILLS.length + 1000; // เผื่อช่องว่างกันชนสกิลที่ DM สร้างเพิ่มเอง
  const libraryShop = dndDefaultSpellbookLibraryShop();
  dndShops = [libraryShop];
  dndNextShopId = 2;
  dndNextShopItemId = libraryShop.items.length + 1;
  // ผูกชื่อสมุดแต่ละเล่มเข้ากับผลไอเทมประเภท "skill" ให้อัตโนมัติ เหมือนตอน DM เพิ่มเองผ่านหน้าร้าน
  for (const item of libraryShop.items) {
    if (dndUpsertSkillItemEffect) dndUpsertSkillItemEffect(item.name, item.skillId, item.desc);
  }
}
dndSeedSpellbookLibrary();

// เติมห้องสมุดเวทย์ (สกิล 574 เล่ม + ร้านห้องสมุด) กลับเข้าไปอัตโนมัติ ถ้าข้อมูลที่โหลดมา (เช่นไฟล์เซฟเก่า) ไม่มีอยู่แล้ว
// เช็คจากช่วง id สกิล — ถ้าไม่มีสกิลไหนอยู่ในช่วง id ของห้องสมุดเวทย์เลย ถือว่าเซฟนี้ไม่มีห้องสมุด (เซฟไว้ตั้งแต่ก่อนมีฟีเจอร์นี้)
// จะเติมกลับเข้าไปแบบต่อท้าย (ไม่ทับของเดิม) ไม่ให้สกิล/ร้านค้าที่ DM สร้างเองในเซฟหายไป
function dndEnsureSpellbookLibraryPresent() {
  const hasSpellbookSkills = dndSkills.some(s => Number(s.id) >= DND_SPELLBOOK_ID_BASE);
  if (hasSpellbookSkills) return;

  const newSkills = dndCloneDefaultSpellbookSkills();
  dndSkills = dndSkills.concat(newSkills);
  dndNextSkillId = Math.max(dndNextSkillId, DND_SPELLBOOK_ID_BASE + DND_SPELLBOOK_SKILLS.length + 1000);

  const items = newSkills.map(s => {
    const id = dndNextShopItemId;
    dndNextShopItemId += 1;
    return {
      id, name: `สมุดเวทย์: ${s.name}`, price: dndSpellbookPriceForLevel(s.level),
      desc: `อ่านแล้วเรียนรู้สกิล "${s.name}" (เวทย์เลเวล ${s.level === 0 ? 'แคนทริป' : s.level})`,
      stock: null, skillId: s.id,
    };
  });
  const libraryShop = { id: dndNextShopId, name: '📚 ห้องสมุดเวทย์ (Cantrip-9th Level)', type: 'library', closed: false, items };
  dndNextShopId += 1;
  dndShops = dndShops.concat([libraryShop]);
  for (const item of items) {
    if (dndUpsertSkillItemEffect) dndUpsertSkillItemEffect(item.name, item.skillId, item.desc);
  }
  dndAddLog('📚 เซฟนี้ไม่มีห้องสมุดเวทย์อยู่ — เติมห้องสมุดเวทย์ (574 เล่ม) กลับเข้ามาอัตโนมัติแล้ว');
}

function dndHandleJoin(ws, name) {
  // เชื่อมต่อ (ws) นี้มีตัวละครอยู่ในห้องอยู่แล้ว — เช่น รีเฟรช/สลับหน้าเร็วจนข้อความ join เข้ามาซ้ำ
  // ก่อนที่เซิร์ฟเวอร์จะรู้ตัวว่าการเชื่อมต่อเก่าหลุดไปแล้ว ถ้าปล่อยให้สร้างตัวละครใหม่ซ้อนไป จะเกิดตัวละคร "ผี" ค้าง
  // อยู่ในห้อง (โชว์สถานะ/ค่าสเตตัสเก่าค้างไม่อัปเดต เพราะ ws เดียวกันไปผูกกับผู้เล่น 2 รายการพร้อมกัน) — จึงส่งสถานะปัจจุบันกลับไปแทน
  const existing = dndFindByWs(ws);
  if (existing) { dndBroadcastState(); return; }
  const cleanName = (name || '').toString().trim().slice(0, 16) || `นักผจญภัย${dndPlayers.length + 1}`;
  const isDM = dndPlayers.length === 0; // คนแรกที่เข้าห้องเป็น DM เสมอ และจะยังคงเป็น DM แม้หลุดการเชื่อมต่อ (ไม่มีใครมาแทนที่)
  const id = dndNextId++;
  dndPlayers.push({ id, ws, name: cleanName, isDM, connected: true, character: newDndCharacter(cleanName), dndMovedAtStep: -1 });
  dndAddLog(isDM ? `${cleanName} เข้าห้องในฐานะ DM` : `${cleanName} เข้าร่วมปาร์ตี้`);
}
function dndVacantSeats() {
  return dndPlayers.filter(p => !p.connected).map(p => ({
    id: p.id,
    isDM: p.secretDM ? false : p.isDM,
    name: p.character.charName || p.name,
    raceCls: p.character.locked ? `${p.character.race || ''} ${p.character.cls || ''}`.trim() : 'ยังไม่ได้สร้างตัวละคร',
    level: p.character.level,
  }));
}
function dndHandleListSeats(ws) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'dndSeatList', seats: dndVacantSeats() }));
}
function dndHandleTakeSeat(ws, id) {
  // เชื่อมต่อ (ws) นี้ผูกกับผู้เล่นอยู่แล้ว (นั่งอยู่แล้ว หรือ join ไปแล้วในจังหวะไล่เลี่ยกัน) — กันไม่ให้ ws เดียวไปผูกซ้อนกับผู้เล่น 2 คน
  // ซึ่งจะทำให้การกระทำต่างๆ ไปอัปเดตผิดตัว และตัวละครที่เห็นบนจอค้างค่าเก่าไม่อัปเดต
  const already = dndFindByWs(ws);
  if (already) { dndBroadcastState(); return; }
  const target = dndPlayers.find(p => p.id === Number(id) && !p.connected);
  if (!target) { dndHandleListSeats(ws); return; } // ที่นั่งถูกคนอื่นเอาไปแล้ว หรือข้อมูลเก่า — ส่งรายชื่อล่าสุดกลับไป
  target.ws = ws;
  target.connected = true;
  dndAddLog(`${target.character.charName || target.name} กลับเข้ามานั่งที่เดิม${(target.isDM && !target.secretDM) ? ' (DM)' : ''}`);
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
  let spentCost = 0;
  for (const k of Object.keys(pointBuy)) {
    const raw = payload.pointBuy && payload.pointBuy[k];
    let score = Math.round(Number(raw));
    if (!Number.isFinite(score) || score < POINT_BUY_MIN) score = POINT_BUY_MIN;
    pointBuy[k] = score;
    // ราคาต้องอิงค่ารวม (ดิบ+โบนัสเผ่า/คลาส) ไม่ใช่ค่าดิบเฉยๆ — ถ้าสเตตัสไหนมีโบนัสติดตัวอยู่แล้ว
    // การซื้อแต้มเพิ่มในสเตตัสนั้นจะยิ่งแพงขึ้นเรื่อยๆ เร็วกว่าสเตตัสที่ไม่มีโบนัส (โบนัสเองไม่เสียแต้ม)
    const bonus = ((race.bonus && race.bonus[k]) || 0) + ((cls.bonus && cls.bonus[k]) || 0);
    spentCost += pointBuyCostForRaw(score, bonus);
  }
  if (spentCost !== POINT_BUY_BUDGET) {
    dndSendError(ws, `ต้องใช้พอยต์ให้ครบพอดี ${POINT_BUY_BUDGET} พอย (ตอนนี้ใช้ไป ${spentCost} พอย)`);
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
    level, hp: maxHp, maxHp, ac, sp: DND_STARTING_SP, maxSp: DND_STARTING_SP,
    str: finalStats.str, dex: finalStats.dex, con: finalStats.con,
    int: finalStats.int, wis: finalStats.wis, cha: finalStats.cha,
    inventory, backstory, locked: true, pointBuy, equipment, statuses: (p.character.statuses || []),
    appearance, gold: (p.character.gold || 0) + gold, bag: dndSanitizeBag(p.character.bag),
    statPoints: (p.character.statPoints || 0),
    statusResist: Math.max(0, Math.min(100, (p.character.statusResist || 0) + (passiveEffect.resist || 0))),
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

// ผู้เล่นกดใช้ "แต้มสเตตัส" ที่ได้จากการเลเวลอัพ เพิ่มสเตตัสตัวใดตัวหนึ่งขึ้นทีละ 1 แต้ม
// ต้นทุนต่อ 1 แต้มที่เพิ่มขึ้นอยู่กับค่าปัจจุบัน (ขั้นบันไดเดียวกับตอนสร้างตัวละคร — ดู data/point-buy.js)
// สำคัญ: ต้องคิดต้นทุนจากค่ารวม (ดิบ + โบนัสเผ่าพันธุ์/คลาส) ไม่ใช่ค่าดิบเฉยๆ (c.pointBuy[key])
// เพราะถ้าสเตตัสนั้นมีโบนัสติดตัวอยู่แล้ว ค่ารวมจริงจะยืนอยู่สูงกว่าค่าดิบ — ต้องคิดราคาขั้นถัดไปตามตำแหน่ง
// ค่ารวมจริง ไม่งั้นสเตตัสที่มีโบนัสเผ่า/คลาสจะได้แต้มถูกกว่าที่ควรเทียบกับกำลังจริงที่ได้ (ดู pointBuyStepCost(raw, bonus))
const DND_STAT_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
function dndHandleSpendStatPoint(ws, stat) {
  const p = dndFindByWs(ws);
  if (!p || !p.character || !p.character.locked) { dndSendError(ws, 'ต้องสร้างการ์ดตัวละครก่อนถึงจะอัพสเตตัสได้'); return; }
  const key = (stat || '').toString();
  if (!DND_STAT_KEYS.includes(key)) { dndSendError(ws, 'สเตตัสไม่ถูกต้อง'); return; }
  const c = p.character;
  if (!c.pointBuy) c.pointBuy = { str: POINT_BUY_MIN, dex: POINT_BUY_MIN, con: POINT_BUY_MIN, int: POINT_BUY_MIN, wis: POINT_BUY_MIN, cha: POINT_BUY_MIN };
  const currentRaw = Math.round(Number(c.pointBuy[key])) || POINT_BUY_MIN;
  const race = dndRaceByKey(c.raceKey);
  const cls = dndClassByKey(c.classKey);
  const raceBonus = (race && race.bonus && race.bonus[key]) || 0;
  const clsBonus = (cls && cls.bonus && cls.bonus[key]) || 0;
  // สำคัญ: ราคาต้องอิงค่ารวม (ดิบ+โบนัสเผ่า/คลาส) ไม่ใช่ค่าดิบเฉยๆ — ถ้าเผ่า/คลาสให้โบนัสสเตตัสนี้อยู่แล้ว
  // ค่ารวมจริงจะยืนอยู่สูงกว่าค่าดิบ ต้องคิดราคาขั้นถัดไปจากตำแหน่งค่ารวมนั้น ไม่ใช่จากค่าดิบซึ่งจะทำให้ถูกกว่าที่ควร
  const cost = pointBuyStepCost(currentRaw, raceBonus + clsBonus);
  const available = Math.round(Number(c.statPoints) || 0);
  if (available < cost) { dndSendError(ws, `แต้มสเตตัสไม่พอ (เพิ่ม ${key.toUpperCase()} อีก 1 ต้องใช้ ${cost} แต้ม ตอนนี้มี ${available} แต้ม)`); return; }
  // อิงกลไก D&D: ถ้าสเตตัสที่เพิ่มคือ CON ตัวปรับ (modifier) ของ CON อาจขยับขึ้น ซึ่งใน D&D ค่า HP สูงสุดผูกกับ CON โดยตรง
  // ต้องจับค่า modifier "ก่อน" เพิ่มสเตตัสไว้ก่อน แล้วเทียบกับ modifier "หลัง" เพิ่ม เพื่อคำนวณ HP ที่ควรได้เพิ่มมาด้วย (มาตรฐาน D&D: HP เปลี่ยนตาม conMod คูณเลเวล)
  const oldConMod = key === 'con' ? dndAbilityMod(Number(c.con) || 10) : 0;
  c.pointBuy[key] = currentRaw + 1;
  c[key] = c.pointBuy[key] + raceBonus + clsBonus;
  c.statPoints = available - cost;
  let hpNote = '';
  if (key === 'con') {
    const newConMod = dndAbilityMod(Number(c.con) || 10);
    const conModDelta = newConMod - oldConMod;
    if (conModDelta !== 0) {
      const level = Math.max(1, Math.round(Number(c.level) || 1));
      const hpDelta = conModDelta * level;
      c.maxHp = Math.max(1, Math.round((Number(c.maxHp) || 1) + hpDelta));
      c.hp = Math.max(0, Math.min(c.maxHp, Math.round((Number(c.hp) || 0) + hpDelta)));
      hpNote = ` (ตัวปรับ CON เปลี่ยน ${conModDelta > 0 ? '+' : ''}${conModDelta} → HP สูงสุด ${hpDelta > 0 ? '+' : ''}${hpDelta} เป็น ${c.maxHp})`;
    }
  }
  dndAddLog(`📈 ${c.charName || p.name} เพิ่ม ${key.toUpperCase()} เป็น ${c[key]} (ใช้แต้มสเตตัส ${cost} แต้ม เหลือ ${c.statPoints} แต้ม)${hpNote}`);
  dndBroadcastState();
}

const DND_DM_STR_FIELDS = ['charName', 'race', 'cls', 'inventory', 'backstory'];
const DND_DM_STR_FIELD_MAXLEN = { inventory: 500, backstory: 800 };
const DND_DM_NUM_FIELDS = ['level', 'maxHp', 'ac', 'maxSp', 'str', 'dex', 'con', 'int', 'wis', 'cha', 'exp', 'gold', 'statPoints'];
// DM แก้ไขข้อมูลของผู้เล่นคนไหนก็ได้ ทุกช่อง ทุกเมื่อ ไม่มีการล็อกหรือจำกัดช่วงค่า
function dndHandleDmUpdate(ws, targetId, updates) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  const target = dndPlayers.find(pp => pp.id === Number(targetId));
  if (!target || !updates || typeof updates !== 'object') return;
  const c = target.character;
  // จับโบนัสพาสซีพ "ก่อน" แก้ไขอะไรทั้งสิ้นไว้ก่อน — ใช้เทียบกับโบนัสพาสซีพ "หลัง" แก้ไข เพื่อคำนวณส่วนต่าง AC/HP ที่ควรได้เพิ่ม/ลด
  const oldPassiveEffect = dndCharPassiveEffect(c);

  let dndRaceOrClassChanged = false;
  if (updates.raceKey !== undefined) {
    const race = dndRaceByKey(updates.raceKey.toString());
    if (race) {
      if (race.key !== c.raceKey) dndRaceOrClassChanged = true;
      c.raceKey = race.key; c.race = race.name;
      // เปลี่ยนเผ่าแล้ว ถ้าสกิลติดตัวเดิมไม่ได้อยู่ในรายการของเผ่าใหม่ ให้ล้างทิ้งไปก่อน (กันสกิลติดตัวจากเผ่าเก่าค้างอยู่)
      if (!dndRacePassiveByKey(race.key, c.passiveKey)) c.passiveKey = '';
    }
  }
  if (updates.classKey !== undefined) {
    const cls = dndClassByKey(updates.classKey.toString());
    if (cls) {
      if (cls.key !== c.classKey) dndRaceOrClassChanged = true;
      c.classKey = cls.key; c.cls = cls.name;
    }
  }
  // หมายเหตุ: การใช้งาน updates.passiveKey จริงอยู่ "หลัง" ลูป DND_DM_NUM_FIELDS ด้านล่าง (ดูคอมเมนต์ตรงนั้น)
  // เพราะฟอร์มฝั่งไคลเอนต์ส่งค่า ac/maxHp เดิมมาด้วยเสมอ ถ้าคำนวณส่วนต่างพาสซีพตรงนี้ก่อน จะโดนค่าดิบจากฟอร์มทับทิ้ง
  for (const f of DND_DM_STR_FIELDS) {
    if (updates[f] !== undefined) c[f] = updates[f].toString().slice(0, DND_DM_STR_FIELD_MAXLEN[f] || 40);
  }
  // ต้องจับเลเวลเดิมไว้ "ก่อน" ที่ค่า exp จะถูกเขียนทับด้านล่าง ไม่งั้นจะเทียบเลเวลเดิมกับเลเวลใหม่ไม่ได้เลย (เดิมเป็นบั๊ก)
  const previousLevel = dndLevelFromExp(c.exp);
  // อิงกลไก D&D: HP สูงสุดผูกกับตัวปรับ (modifier) ของ CON โดยตรง — ต้องจับ modifier ของ CON "ก่อน" แก้ไข
  // ไว้ก่อน เพื่อเทียบกับ modifier "หลัง" แก้ไข แล้วปรับ HP สูงสุด/HP ปัจจุบันตามส่วนต่างที่เปลี่ยนไปคูณเลเวล
  // (ถ้าไม่ทำแบบนี้ ตอน DM แก้ CON ในฟอร์ม ค่า HP จะไม่ขยับตามเลย เพราะช่อง HP ในฟอร์มยังเป็นค่าเดิมที่ยังไม่ได้คำนวณใหม่)
  const oldConMod = dndAbilityMod(Number(c.con) || 10);
  for (const f of DND_DM_NUM_FIELDS) {
    if (f === 'level') continue; // Level คำนวณจาก EXP อัตโนมัติ
    if (updates[f] !== undefined) {
      const n = Number(updates[f]);
      if (Number.isFinite(n)) c[f] = Math.max(0, Math.min(9999, Math.round(n)));
    }
  }
  // ค่าต้านทานสถานะ (%) ของผู้เล่นคนนี้ — แยกจากลูป DND_DM_NUM_FIELDS ด้านบนเพราะช่วงค่าจำกัดแค่ 0-100 (เป็น % ไม่ใช่ 0-9999) เหมือนของ token
  if (updates.statusResist !== undefined) {
    const n = Number(updates.statusResist);
    if (Number.isFinite(n)) c.statusResist = Math.max(0, Math.min(100, Math.round(n)));
  }
  if (updates.passiveKey !== undefined) {
    const passive = dndRacePassiveByKey(c.raceKey, updates.passiveKey.toString());
    if (passive) {
      c.passiveKey = passive.key;
      // สกิลติดตัวเดิม/ใหม่อาจให้โบนัส AC/HP ต่างกัน — บวก/ลบส่วนต่างเข้า ac/maxHp/hp ทันที
      // ทำหลังบล็อกด้านบนที่เขียนทับ ac/maxHp ดิบจากฟอร์ม เพื่อไม่ให้ส่วนต่างนี้โดนทับทิ้ง
      // (ฟอร์มฝั่งไคลเอนต์ยังไม่รู้จะพรีวิวค่าใหม่ยังไง เลยส่งค่า ac/maxHp เดิมก่อนเปลี่ยนพาสซีพมาด้วยเสมอ)
      const newPassiveEffect = dndCharPassiveEffect(c);
      const acDelta = (newPassiveEffect.ac || 0) - (oldPassiveEffect.ac || 0);
      const hpDelta = (newPassiveEffect.hp || 0) - (oldPassiveEffect.hp || 0);
      const resistDelta = (newPassiveEffect.resist || 0) - (oldPassiveEffect.resist || 0);
      if (acDelta) c.ac = Math.max(0, Math.round((Number(c.ac) || 0) + acDelta));
      if (hpDelta) {
        c.maxHp = Math.max(1, Math.round((Number(c.maxHp) || 1) + hpDelta));
        c.hp = Math.max(0, Math.min(c.maxHp, Math.round((Number(c.hp) || 0) + hpDelta)));
      }
      if (resistDelta) c.statusResist = Math.max(0, Math.min(100, Math.round((Number(c.statusResist) || 0) + resistDelta)));
      if (acDelta || hpDelta || resistDelta) {
        dndAddLog(`✨ ${c.charName || target.name} เปลี่ยนสกิลติดตัวเป็น "${passive.name}"${acDelta ? ` (AC ${acDelta > 0 ? '+' : ''}${acDelta} เป็น ${c.ac})` : ''}${hpDelta ? ` (HP สูงสุด ${hpDelta > 0 ? '+' : ''}${hpDelta} เป็น ${c.maxHp})` : ''}${resistDelta ? ` (ต้านทานสถานะ ${resistDelta > 0 ? '+' : ''}${resistDelta}% เป็น ${c.statusResist}%)` : ''}`);
      }
    }
  }
  // DM เปลี่ยนเผ่าพันธุ์และ/หรือคลาส — ต้องคิดสเตตัสหลัก (str/dex/con/int/wis/cha) ใหม่จากคะแนน point-buy เดิม + โบนัสเผ่า/คลาสล่าสุดเสมอ
  // (ก่อนแก้บั๊กนี้ ค่าที่ส่งมาจากฟอร์มยังเป็นสเตตัสของเผ่า/คลาสเก่าอยู่ เพราะฟอร์มไม่ได้คิดผลรวมใหม่ให้ก่อนกดบันทึก)
  if (dndRaceOrClassChanged) {
    const raceObj = dndRaceByKey(c.raceKey);
    const clsObj = dndClassByKey(c.classKey);
    const pointBuySource = (c.pointBuy && typeof c.pointBuy === 'object') ? c.pointBuy : c;
    const recomputed = dndComputeFinalStats(pointBuySource, raceObj, clsObj);
    c.str = recomputed.str; c.dex = recomputed.dex; c.con = recomputed.con;
    c.int = recomputed.int; c.wis = recomputed.wis; c.cha = recomputed.cha;
  }
  dndSyncLevelFromExp(c);
  if (c.level > previousLevel) {
    c.statPoints = Math.round(Number(c.statPoints) || 0) + STAT_POINTS_PER_LEVEL * (c.level - previousLevel);
    dndAddLog(`🎉 ${c.charName || target.name} เลเวลอัป! Lv.${previousLevel} → Lv.${c.level} (ได้แต้มสเตตัส +${STAT_POINTS_PER_LEVEL * (c.level - previousLevel)})`);
    dndAnnounceClassSkillUnlocks(target, previousLevel, c.level);
  }
  // ส่วนต่างของ HP ที่ต้องปรับตามตัวปรับ CON ที่เปลี่ยนไป (มาตรฐาน D&D: HP เปลี่ยน = ส่วนต่าง conMod x เลเวลปัจจุบัน)
  let conHpDelta = 0;
  if (updates.con !== undefined || dndRaceOrClassChanged) {
    const newConMod = dndAbilityMod(Number(c.con) || 10);
    const conModDelta = newConMod - oldConMod;
    if (conModDelta !== 0) {
      const level = Math.max(1, Math.round(Number(c.level) || 1));
      conHpDelta = conModDelta * level;
      c.maxHp = Math.max(1, Math.min(9999, Math.round((Number(c.maxHp) || 1) + conHpDelta)));
      dndAddLog(`❤️ ${c.charName || target.name} ตัวปรับ CON เปลี่ยน ${conModDelta > 0 ? '+' : ''}${conModDelta} → HP สูงสุด ${conHpDelta > 0 ? '+' : ''}${conHpDelta} เป็น ${c.maxHp} (อิงกลไกเกม)`);
    }
  }
  let revived = false;
  if (updates.hp !== undefined) {
    let n = Number(updates.hp);
    // ถ้า CON เปลี่ยนในการแก้ไขครั้งนี้ด้วย ให้บวกส่วนต่าง HP เข้าไปกับค่าที่ DM ส่งมา (เผื่อช่อง HP ในฟอร์มยังเป็นค่าเดิมที่ยังไม่ได้คิด CON ใหม่)
    if (Number.isFinite(n) && conHpDelta) n += conHpDelta;
    const wasDead = dndIsCharDead(c);
    if (Number.isFinite(n)) c.hp = Math.max(0, Math.min(c.maxHp || 9999, Math.round(n)));
    // DM เพิ่ม HP ให้เองโดยตรง (>0) = ยกเลิกสถานะ "ตายถาวร" ด้วย เพราะถือว่า DM ตั้งใจชุบให้ฟื้นกลับมาเอง
    if (c.permaDead && c.hp > 0) c.permaDead = false;
    revived = wasDead && !dndIsCharDead(c);
  } else if (conHpDelta) {
    // DM ไม่ได้ส่งค่า HP มาด้วย แต่ CON เปลี่ยน — ปรับ HP ปัจจุบันตามส่วนต่างเช่นกัน
    c.hp = Math.max(0, Math.min(c.maxHp || 9999, Math.round((Number(c.hp) || 0) + conHpDelta)));
  }
  // SP ไม่ผูกกับ INT/เลเวลอัตโนมัติแล้ว — DM เป็นคนกำหนด sp/maxSp เองตรง ๆ ผ่านฟอร์มแก้ไขเท่านั้น
  if (updates.sp !== undefined) {
    const n = Number(updates.sp);
    if (Number.isFinite(n)) c.sp = Math.max(0, Math.min(c.maxSp || 9999, Math.round(n)));
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
  // DM ปรับแต่ง "โจมตีปกติ" ของผู้เล่นคนนี้ได้ — ส่ง null มา = ล้างกลับไปใช้ค่าเริ่มต้นของระบบ (max STR/DEX, 1d6)
  if (updates.normalAttack !== undefined) c.normalAttack = dndSanitizeNormalAttack(updates.normalAttack);

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

// dndHandleShopCreate/Rename/ToggleClosed/Delete/ItemAdd/ItemEdit/ItemDelete/Buy/Sell, dndHandleForgeAttempt
//   → ย้ายไปที่ server/dnd/shop.js (ผูกกลับเข้ามาผ่าน ctx)

// dndSanitizeItemQtyList / dndCharacterHasItemsAndGold / dndApplyItemsAndGoldTransfer / dndTradeSideText /
// dndTradesForPlayer / dndHandleTradeOffer / dndHandleTradeRespond / dndHandleTradeCancel
// ย้ายไปอยู่ที่ server/dnd/trade.js แล้ว (module 6, destructure ไว้เป็นชื่อเดิมแล้วตอน instantiate ด้านบน)

// ---- ลำดับเทิร์นผู้เล่น+มอนสเตอร์: ย้ายไปอยู่ที่ server/dnd/turn-order.js แล้ว (module 4) ----
// getPlayers/getTokens/getCurrentMapId ต้องเป็นฟังก์ชัน (ไม่ใช่ค่าตรงๆ) เพราะ dndPlayers/dndTokens/dndCurrentMapId
// ถูกแทนที่ทั้งก้อนได้ (เช่นตอนโหลดไฟล์เซฟ) — ฟังก์ชันข้างล่างยังเรียกใช้ได้ตามชื่อเดิมทุกที่ในไฟล์นี้ (ห่อ wrapper บางไว้)
const { createTurnOrder, dndNormalizeTurnEntry } = require('./dnd/turn-order');
const dndTurnOrderModule = createTurnOrder({
  findByWs: dndFindByWs, sendError: dndSendError, addLog: dndAddLog,
  getPlayers: () => dndPlayers, getTokens: () => dndTokens, getCurrentMapId: () => dndCurrentMapId,
  getCurrentMap: () => dndCurrentMap(), mapAllowsPlayer: dndMapAllowsPlayer,
});
const {
  cleanTurnOrder: dndCleanTurnOrder,
  turnEntryName: dndTurnEntryName,
  currentTurnEntry: dndCurrentTurnEntry,
  currentTurnPlayerId: dndCurrentTurnPlayerId,
  appendTurnEntryIfActive: dndAppendTurnEntryIfActive,
  handleTurnSetOrder: dndHandleTurnSetOrder,
  handleTurnStart: dndHandleTurnStart,
  handleTurnNext: dndHandleTurnNext,
  handleTurnStop: dndHandleTurnStop,
} = dndTurnOrderModule;
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
  const map = { id: dndNextMapId++, name: cleanName, background: null, playerIds: [], gridSize: DND_MAP_GRID_DEFAULT };
  dndMaps.push(map);
  dndCurrentMapId = map.id; // สลับไปแผนที่ใหม่ทันทีเพื่อให้ DM ออกแบบต่อได้เลย
  dndAddLog(`🗺️ DM สร้างแผนที่ใหม่ "${cleanName}" และสลับไปแสดงแผนที่นี้`);
}
// ผู้เล่นที่ "อยู่ในแผนที่" นี้ได้หรือไม่ — ต้องถูกเลือกไว้ใน playerIds เท่านั้น
// ถ้า DM ยังไม่ได้เลือกใครเลย (playerIds ว่าง) = ยังไม่มีใครอยู่ในแผนที่นี้เลย (ผู้เล่นทุกคนจะเห็นมืดสนิทจนกว่า DM จะเลือก)
function dndMapAllowsPlayer(map, playerId) {
  return !!(map && Array.isArray(map.playerIds) && map.playerIds.includes(Number(playerId)));
}
// DM เลือกว่าผู้เล่นคนไหนอยู่ในแผนที่นี้บ้าง — ส่ง playerIds เป็น [] เพื่อล้างกลับไปเป็น "ยังไม่มีใครอยู่ในแผนที่นี้" (ทุกคนจะเห็นมืดสนิทจนกว่าจะถูกเลือก)
function dndHandleMapPlayersUpdate(ws, mapId, playerIds) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  const map = dndMaps.find(m => m.id === Number(mapId));
  if (!map) return;
  const prevIds = new Set(Array.isArray(map.playerIds) ? map.playerIds : []);
  const clean = Array.isArray(playerIds)
    ? [...new Set(playerIds.map(id => Number(id)).filter(id => Number.isFinite(id) && dndPlayers.some(pp => pp.id === id)))]
    : [];
  map.playerIds = clean;
  // ถ้าแผนที่นี้กำลังแสดงอยู่และมีการนับลำดับเทิร์นอยู่แล้ว ผู้เล่นที่พึ่งถูกติ๊กเพิ่มเข้ามาใหม่ (ไม่ได้อยู่ในลิสต์เดิม)
  // ให้เข้าคิวต่อท้ายลำดับเทิร์นทันทีเหมือนตอนวางมอนสเตอร์เพิ่ม ไม่ต้องกด "เริ่มเทิร์น" ใหม่ (ซึ่งจะสุ่มลำดับใหม่ทั้งหมด)
  // ต้องทำ "ก่อน" เรียก dndAddLog เพราะ dndAddLog เป็นตัว broadcast state ให้ทุกคน — ถ้าต่อคิวทีหลัง
  // client จะไม่เห็นคิวใหม่เลยจนกว่าจะมี broadcast รอบถัดไปจากเหตุการณ์อื่น (เช่น กด "ตาถัดไป")
  if (map.id === dndCurrentMapId) {
    for (const id of clean) {
      if (!prevIds.has(id)) dndAppendTurnEntryIfActive('pc', id);
    }
  }
  const label = clean.length ? clean.map(id => { const pp = dndPlayers.find(x => x.id === id); return pp ? (pp.character.charName || pp.name) : '?'; }).join(', ') : '(ยังไม่มีใครเลย — ทุกคนจะเห็นมืด)';
  dndAddLog(`🗺️ DM ตั้งผู้เล่นในแผนที่ "${map.name}": ${label}`);
}
// DM เปิด/ปิดระบบวิสัยทัศน์ (fog of war) ให้ทั้งห้อง — นอกระยะวิสัยทัศน์ผู้เล่นจะมืดสนิทมองไม่เห็นอะไรเลย DM เองยังเห็นแผนที่เต็มเสมอ
function dndHandleVisionToggle(ws, enabled) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  dndVisionEnabled = !!enabled;
  dndAddLog(`👁️ DM ${dndVisionEnabled ? 'เปิด' : 'ปิด'}ระบบวิสัยทัศน์ผู้เล่น (Fog of War)`);
}
// DM เปิด/ปิด "แชร์วิสัยทัศน์ในปาร์ตี้" — เปิดแล้วเพื่อนร่วมทีม (ที่ยังไม่หมดสติ) จะรวมพื้นที่มองเห็นเข้าด้วยกันแทนที่จะเห็นแค่รอบ token ตัวเอง
function dndHandlePartyVisionToggle(ws, enabled) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  dndPartyVisionShared = !!enabled;
  dndAddLog(`👥 DM ${dndPartyVisionShared ? 'เปิด' : 'ปิด'}ระบบแชร์วิสัยทัศน์ในปาร์ตี้`);
}
// DM สร้างกรุ๊ปแชร์วิสัยทัศน์ใหม่ (เริ่มว่างเปล่า แล้วค่อยเลือกผู้เล่นเข้ากรุ๊ปทีหลัง)
function dndHandlePartyVisionGroupCreate(ws) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  dndPartyVisionGroups.push({ id: dndNextPartyVisionGroupId++, playerIds: [] });
  dndAddLog(`👥 DM สร้างกรุ๊ปแชร์วิสัยทัศน์ใหม่`);
}
// DM ลบกรุ๊ปแชร์วิสัยทัศน์ทิ้ง — ผู้เล่นในกรุ๊ปนั้นจะกลับไปเห็นแค่รอบ token ตัวเอง (ไม่แชร์กับใคร) จนกว่าจะถูกจัดเข้ากรุ๊ปใหม่
function dndHandlePartyVisionGroupDelete(ws, groupId) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  const idx = dndPartyVisionGroups.findIndex(g => g.id === Number(groupId));
  if (idx === -1) return;
  dndPartyVisionGroups.splice(idx, 1);
  dndAddLog(`👥 DM ลบกรุ๊ปแชร์วิสัยทัศน์`);
}
// DM ตั้งรายชื่อผู้เล่นในกรุ๊ปหนึ่ง — ผู้เล่น 1 คนอยู่ได้แค่กรุ๊ปเดียวเสมอ ดังนั้นใครถูกเพิ่มเข้ากรุ๊ปนี้จะถูกเอาออกจากกรุ๊ปอื่นให้อัตโนมัติ
function dndHandlePartyVisionGroupPlayersUpdate(ws, groupId, playerIds) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  const group = dndPartyVisionGroups.find(g => g.id === Number(groupId));
  if (!group) return;
  const clean = Array.isArray(playerIds)
    ? [...new Set(playerIds.map(id => Number(id)).filter(id => Number.isFinite(id) && dndPlayers.some(pp => pp.id === id)))]
    : [];
  // เอาผู้เล่นเหล่านี้ออกจากกรุ๊ปอื่นทั้งหมดก่อน (กันไม่ให้อยู่ 2 กรุ๊ปพร้อมกัน)
  for (const g of dndPartyVisionGroups) {
    if (g.id === group.id) continue;
    g.playerIds = g.playerIds.filter(id => !clean.includes(id));
  }
  group.playerIds = clean;
  const label = clean.length ? clean.map(id => { const pp = dndPlayers.find(x => x.id === id); return pp ? (pp.character.charName || pp.name) : '?'; }).join(', ') : '(ว่าง)';
  dndAddLog(`👥 DM ตั้งสมาชิกกรุ๊ปแชร์วิสัยทัศน์: ${label}`);
}
function dndHandleMapSwitch(ws, mapId) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  const map = dndMaps.find(m => m.id === Number(mapId));
  if (!map) return;
  // โมดูล 4 (Lifecycle/Despawn): สลับแผนที่ = เปลี่ยนฉาก สัตว์อัญเชิญที่ยังค้างอยู่ทั้งหมด (ทุกแผนที่) หายไปทันที ไม่ค้างข้ามฉากรอเจ้าของกลับมาใช้ทีหลัง
  if (map.id !== dndCurrentMapId) {
    const before = dndTokens.length;
    dndTokens = dndTokens.filter(t => !(t.kind === 'npc' && t.summoned));
    if (dndTokens.length !== before) {
      dndCleanTurnOrder();
      dndAddLog(`💨 เปลี่ยนแผนที่ — สัตว์อัญเชิญที่ยังค้างอยู่หายไปทั้งหมด (${before - dndTokens.length} ตัว)`);
    }
  }
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
// DM ปรับขนาดช่องตาราง (grid) ของแผนที่นี้ — จำนวนช่องต่อด้าน ยิ่งมากช่องยิ่งเล็ก/ถี่ ยิ่งน้อยช่องยิ่งใหญ่
function dndHandleMapGridSizeUpdate(ws, mapId, gridSize) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  const map = dndMaps.find(m => m.id === Number(mapId));
  if (!map) return;
  const n = Math.round(Number(gridSize));
  if (!Number.isFinite(n) || n < DND_MAP_GRID_MIN || n > DND_MAP_GRID_MAX) {
    dndSendError(ws, `ขนาดช่องแผนที่ต้องเป็นตัวเลขระหว่าง ${DND_MAP_GRID_MIN}-${DND_MAP_GRID_MAX} ช่อง`);
    return;
  }
  map.gridSize = n;
  dndAddLog(`🗺️ DM ปรับตารางแผนที่ "${map.name}" เป็น ${n}x${n} ช่อง`);
}
function dndHandleMapDelete(ws, mapId) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  if (dndMaps.length <= 1) { dndSendError(ws, 'ต้องมีอย่างน้อย 1 แผนที่เสมอ ลบแผนที่สุดท้ายไม่ได้'); return; }
  const idx = dndMaps.findIndex(m => m.id === Number(mapId));
  if (idx === -1) return;
  const [removed] = dndMaps.splice(idx, 1);
  dndTokens = dndTokens.filter(t => !(t.kind === 'npc' && t.mapId === removed.id)); // ลบมอนสเตอร์ที่อยู่บนแผนที่นี้ไปด้วย
  dndWalls = dndWalls.filter(w => w.mapId !== removed.id); // ลบกำแพงที่อยู่บนแผนที่นี้ไปด้วย
  if (dndCurrentMapId === removed.id) dndCurrentMapId = dndMaps[0].id;
  dndCleanTurnOrder(); // มอนสเตอร์บนแผนที่ที่ลบไปอาจอยู่ในลำดับเทิร์นอยู่ ต้องเอาออกด้วย
  dndAddLog(`🗺️ DM ลบแผนที่ "${removed.name}" (รวมมอนสเตอร์และกำแพงบนแผนที่นั้นทั้งหมด)`);
}
// ---- DM วาดกำแพงบนแผนที่ปัจจุบัน (ลากเมาส์/นิ้วเป็นเส้นตรง) ----
function dndHandleWallCreate(ws, payload) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM || !payload || typeof payload !== 'object') return;
  const x1 = Number(payload.x1), y1 = Number(payload.y1), x2 = Number(payload.x2), y2 = Number(payload.y2);
  if (![x1, y1, x2, y2].every(Number.isFinite)) return;
  const clamp = n => Math.max(0, Math.min(100, n));
  const cx1 = clamp(x1), cy1 = clamp(y1), cx2 = clamp(x2), cy2 = clamp(y2);
  if (Math.hypot(cx2 - cx1, cy2 - cy1) < 1) return; // ลากสั้นเกินไป (แค่คลิกเฉยๆ) ไม่นับเป็นกำแพง
  dndWalls.push({ id: dndNextWallId++, mapId: dndCurrentMapId, x1: cx1, y1: cy1, x2: cx2, y2: cy2 });
  dndAddLog(`🧱 DM วาดกำแพงเพิ่มบนแผนที่ "${dndCurrentMap().name}"`);
}
// DM ลบกำแพงเส้นเดียวที่วาดผิดหรือไม่ต้องการแล้ว
function dndHandleWallDelete(ws, id) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  const idx = dndWalls.findIndex(w => w.id === Number(id));
  if (idx === -1) return;
  dndWalls.splice(idx, 1);
  dndAddLog(`🧱 DM ลบกำแพงออกจากแผนที่ "${dndCurrentMap().name}"`);
}
// DM ล้างกำแพงทั้งหมดบนแผนที่ปัจจุบันทีเดียว
function dndHandleWallClear(ws) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  const before = dndWalls.length;
  dndWalls = dndWalls.filter(w => w.mapId !== dndCurrentMapId);
  if (dndWalls.length !== before) dndAddLog(`🧱 DM ล้างกำแพงทั้งหมดบนแผนที่ "${dndCurrentMap().name}"`);
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
// ---- นาฬิกาในเกม — DM เท่านั้นที่เดินเวลา/ข้ามวัน/ตั้งเวลาเองได้ (ย้ายไป server/dnd/game-time.js) ----
const DND_TIME_DAY_LABELS_TH = ['วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์', 'วันอาทิตย์'];
const dndGameTimeModule = require('./dnd/game-time').createGameTime({ findByWs: dndFindByWs, addLog: dndAddLog });
const {
  handleTimeAdvance: dndHandleTimeAdvance,
  handleTimeSkipDay: dndHandleTimeSkipDay,
  handleTimeSet: dndHandleTimeSet,
  handleTimeAutoToggle: dndHandleTimeAutoToggle,
  handleTimeAutoSpeedSet: dndHandleTimeAutoSpeedSet,
} = dndGameTimeModule;
// ---- สถานะ/บัฟ-ดีบัฟ: ย้ายไปอยู่ที่ server/dnd/status-effects.js แล้ว (module 5) ----
// getPlayers/getTokens ต้องเป็นฟังก์ชัน (ไม่ใช่ค่าตรงๆ) เพราะ dndPlayers/dndTokens ถูกแทนที่ทั้งก้อนได้ (เช่นตอนโหลดไฟล์เซฟ)
// pushLogSilent: เหมือน dndAddLog แต่ไม่สั่ง broadcast ทันทีต่อบรรทัด (dndSweepExpiredStatuses รวบ broadcast ครั้งเดียวท้ายสุดเอง)
const dndStatusEffectsModule = require('./dnd/status-effects').createStatusEffects({
  findByWs: dndFindByWs, sendError: dndSendError, addLog: dndAddLog,
  pushLogSilent: (text) => { dndLog.push({ text, visibleTo: null }); if (dndLog.length > 300) dndLog.shift(); },
  getPlayers: () => dndPlayers, getTokens: () => dndTokens,
  isCharDead: dndIsCharDead, checkTokenDefeat: (t, killer) => dndCheckTokenDefeat(t, killer),
  broadcastState: () => dndBroadcastState(), tickGameTime: () => dndGameTimeModule.tickAuto(),
});
const {
  findStatusTarget: dndFindStatusTarget,
  sanitizeStatusDuration: dndSanitizeStatusDuration,
  sanitizeStatusMod: dndSanitizeStatusMod,
  sanitizeStatusTick: dndSanitizeStatusTick,
  sanitizeTickInterval: dndSanitizeTickInterval,
  sanitizeStatusIcon: dndSanitizeStatusIcon,
  sanitizeStatusColor: dndSanitizeStatusColor,
  sanitizeVisionMod: dndSanitizeVisionMod,
  buildStatusModText: dndBuildStatusModText,
  handleStatusApply: dndHandleStatusApply,
  handleStatusRemove: dndHandleStatusRemove,
  handleStatusEdit: dndHandleStatusEdit,
  sweepExpiredStatuses: dndSweepExpiredStatuses,
  allocStatusId: dndAllocStatusId,
} = dndStatusEffectsModule;
// เติมฟังก์ชันจากระบบสถานะเข้า ctx ให้โมดูลไอเทม (server/dnd/item.js, ถูกสร้างไปแล้วก่อนหน้านี้ที่บรรทัดบน แต่ dndCtx เป็น object เดียวกัน
// แก้ไข/เพิ่ม property เข้าไปทีหลังได้เหมือน dndBagAdd/dndBagRemove ด้านบน) ใช้ตอนไอเทมประเภท "เพิ่มวิสัยทัศน์" มอบสถานะบัฟให้ผู้เล่นที่ใช้
dndCtx.sanitizeVisionMod = dndSanitizeVisionMod;
dndCtx.sanitizeStatusDuration = dndSanitizeStatusDuration;
dndCtx.allocStatusId = dndAllocStatusId;
const DND_VALID_DICE = [4, 6, 8, 10, 12, 20, 100];
// ทอยลูกเต๋าอิสระ (d4-d100 เลือกเอง) — statKey (ไม่บังคับ) ให้ผู้เล่นเลือกได้เองว่าจะบวกตัวปรับของสเตตัสตัวไหนเพิ่มจาก modifier
// ที่พิมพ์เอง (บวกเสริมกัน ไม่ใช่แทนที่) ต่างจากโจมตี/สกิลที่สเตตัสถูกกำหนดตายตัวไว้ล่วงหน้าโดย DM
function dndHandleRoll(ws, die, count, modifier, label, statKey) {
  const p = dndFindByWs(ws);
  if (!p) return;
  const d = DND_VALID_DICE.includes(Number(die)) ? Number(die) : 20;
  const n = Math.max(1, Math.min(20, Math.round(Number(count) || 1)));
  const typedMod = Math.max(-100, Math.min(100, Math.round(Number(modifier) || 0)));
  const statRaw = (statKey || '').toString();
  const stat = DND_STAT_KEYS.includes(statRaw) ? statRaw : '';
  const statMod = stat ? dndAbilityMod(Number(p.character && p.character[stat]) || 10) : 0;
  // สำคัญ: เช็ค (ability check) ที่อิงสเตตัสควรได้รับโบนัส/บทลงโทษจากสกิลติดตัว (passive) และสถานะบัฟ/ดีบัฟ
  // ที่ติดตัวผู้เล่นอยู่ตอนนี้ด้วย เหมือนกับตอนโจมตี ไม่งั้นพาสซีพจะมีผลแค่ตอนตีมอนสเตอร์ แต่ไม่มีผลตอนทอยเช็คทั่วไป
  const passive = stat ? dndCharPassiveEffect(p.character) : { atk: 0 };
  const statusMods = stat ? dndStatusMods(p.character && p.character.statuses) : { atk: 0 };
  const passiveAtk = stat ? (passive.atk + statusMods.atk) : 0;
  const mod = typedMod + statMod + passiveAtk;
  const rolls = [];
  for (let i = 0; i < n; i++) rolls.push(1 + Math.floor(Math.random() * d));
  const sum = rolls.reduce((a, b) => a + b, 0) + mod;
  const modStr = mod ? (mod > 0 ? ` +${mod}` : ` ${mod}`) : '';
  const passiveTag = passiveAtk ? ` · พาสซีพ/สถานะ ${passiveAtk >= 0 ? '+' : ''}${passiveAtk}` : '';
  const statTag = stat ? ` [${stat.toUpperCase()} ${statMod >= 0 ? '+' : ''}${statMod}${typedMod ? ` · Modifier ${typedMod >= 0 ? '+' : ''}${typedMod}` : ''}${passiveTag}]` : '';
  const safeLabel = (label || '').toString().trim().slice(0, 30);
  const labelStr = safeLabel ? ` (${safeLabel})` : '';
  dndAddLog(`🎲 ${p.character.charName || p.name} ทอย ${n}d${d}${modStr}${labelStr}${statTag}: [${rolls.join(', ')}]${modStr} = ${sum}`);
}
const DND_SKILL_STATS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const DND_STAT_LABELS_TH = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };
// ค่าตั้งต้นของ "โจมตีปกติ" (ตีธรรมดา) — ใช้เมื่อ DM ยังไม่ได้ปรับแต่งอะไรให้ตัวละครคนนั้น (คงพฤติกรรมเดิมของระบบไว้)
const DND_NORMAL_ATTACK_DEFAULT = { name: 'โจมตีปกติ', stat: 'auto', dmgDie: 6, dmgCount: 1, atkBonus: 0, dmgBonus: 0, range: 0, reqItemName: '', reqItemQty: 0 };
// DM ปรับแต่ง "โจมตีปกติ" ของผู้เล่นแต่ละคนได้ (ชื่อท่า / สเตตัสที่ใช้ทอย / ลูกเต๋าดาเมจ / โบนัสทอยตี-โบนัสดาเมจ / ระยะโจมตี)
// stat: 'auto' = เดิม ใช้ค่ามากสุดระหว่าง STR/DEX เหมือนระบบเดิม, หรือระบุสเตตัสเฉพาะ (เช่น caster ที่อยากให้ตีธรรมดาใช้ INT/WIS/CHA แทน)
// range: ระยะโจมตีสูงสุดบนแผนที่ (หน่วย "จำนวนช่องตาราง" แปลงเป็น % ของแผนที่ปัจจุบันตอนตรวจระยะจริง ดู dndRangeCellsToPercent) — 0 = ไม่จำกัดระยะ (ค่าเริ่มต้น คงพฤติกรรมเดิมของระบบไว้)
function dndSanitizeNormalAttack(raw) {
  if (raw === null) return null; // DM ล้างค่ากลับไปใช้ค่าเริ่มต้นของระบบ
  const r = (raw && typeof raw === 'object') ? raw : {};
  const name = (r.name || '').toString().trim().slice(0, 30) || DND_NORMAL_ATTACK_DEFAULT.name;
  const statRaw = (r.stat || '').toString();
  const stat = (statRaw === 'auto' || DND_SKILL_STATS.includes(statRaw)) ? statRaw : 'auto';
  const dmgDie = DND_VALID_DICE.includes(Number(r.dmgDie)) ? Number(r.dmgDie) : DND_NORMAL_ATTACK_DEFAULT.dmgDie;
  const dmgCount = Math.max(1, Math.min(20, Math.round(Number(r.dmgCount) || 1)));
  const atkBonus = Math.max(-100, Math.min(100, Math.round(Number(r.atkBonus) || 0)));
  const dmgBonus = Math.max(-100, Math.min(100, Math.round(Number(r.dmgBonus) || 0)));
  const range = dndSanitizeAttackRangeCells(r.range);
  // ไอเทมที่ต้องใช้ประกอบท่าโจมตีปกตินี้ (ไม่บังคับ) — ใช้ helper เดียวกับสกิล (dndSanitizeSkillReqItem) ให้พฤติกรรมเหมือนกันทุกประการ
  const reqItem = dndSanitizeSkillReqItem(r.reqItem);
  return { name, stat, dmgDie, dmgCount, atkBonus, dmgBonus, range, reqItemName: reqItem.reqItemName, reqItemQty: reqItem.reqItemQty };
}
// สกิลที่ตั้งค่าสถานะ/ดีบัฟไว้ — เมื่อใช้สกิลแล้วจะติดสถานะนี้ให้เป้าหมายอัตโนมัติ (เหมือนที่ DM มอบสถานะเองด้วยมือ แต่ผูกมากับสกิลแทน)
function dndSanitizeSkillStatus(raw) {
  const s = (raw && typeof raw === 'object') ? raw : {};
  let name = (s.name || '').toString().trim().slice(0, 24);
  const note = (s.note || '').toString().trim().slice(0, 100);
  // โอกาสติดสถานะ (%) — ค่าเริ่มต้น 100 = ติดเสมอเหมือนพฤติกรรมเดิมของระบบ ถ้าอยากให้มีโอกาสพลาด DM ปรับลดได้ (1-100)
  const chanceRaw = s.chance === undefined || s.chance === '' ? 100 : Number(s.chance);
  const chance = Number.isFinite(chanceRaw) ? Math.max(1, Math.min(100, Math.round(chanceRaw))) : 100;
  // ระยะเวลาสถานะ + บัฟ/ดีบัฟค่าโจมตี/ดาเมจ/ป้องกัน/วิสัยทัศน์ + ระบบ "ต่อวิ" (tick ต่อเวลา) — ใช้ helper ชุดเดียวกับที่ DM มอบสถานะเองมือ
  // (dndHandleStatusApply) เพื่อให้พฤติกรรมของสถานะที่ติดจากสกิลผู้เล่นกับสถานะที่ DM ใส่มือ ทำงานเหมือนกันทุกประการ
  const durationSec = dndSanitizeStatusDuration(s.durationSec);
  const atkMod = dndSanitizeStatusMod(s.atkMod);
  const dmgMod = dndSanitizeStatusMod(s.dmgMod);
  const defMod = dndSanitizeStatusMod(s.defMod);
  const visionMod = dndSanitizeVisionMod(s.visionMod);
  const tickValue = dndSanitizeStatusTick(s.tickValue);
  const tickIntervalSec = tickValue !== 0 ? dndSanitizeTickInterval(s.tickIntervalSec) : 0;
  // เดิมถ้าไม่ตั้งชื่อสถานะ ระบบจะทิ้งค่าที่ตั้งไว้ทั้งหมด (รวมถึงวิสัยทัศน์) แบบเงียบๆ — ตอนนี้ถ้า DM ตั้งค่าปรับอะไรไว้ (เช่นวิสัยทัศน์ ±) แต่ลืมใส่ชื่อ
  // จะตั้งชื่อให้อัตโนมัติแทนการทิ้งค่า กันไม่ให้ค่าที่กรอกไว้หายไปโดยไม่รู้ตัว — ถ้าไม่ได้ตั้งอะไรเลยจริงๆ (ไม่มีชื่อ+ไม่มีค่าปรับใดๆ) ถือว่าสกิลนี้ไม่ผูกสถานะ เหมือนเดิม
  const hasAnyEffect = !!(atkMod || dmgMod || defMod || visionMod || tickValue);
  if (!name && !hasAnyEffect) return { name: '', note: '', chance: 100, durationSec: 0, atkMod: 0, dmgMod: 0, defMod: 0, visionMod: 0, tickValue: 0, tickIntervalSec: 0, icon: '', color: '' };
  if (!name) name = 'เอฟเฟกต์สกิล';
  // ไอคอน/สีของสถานะนี้ (ไม่บังคับ) — ใช้ตอนติดสถานะจากสกิลนี้จริง ๆ แทนค่าเริ่มต้น ☠️/ไม่มีสี เหมือนตอน DM มอบสถานะเองด้วยมือ
  const icon = dndSanitizeStatusIcon(s.icon);
  const color = dndSanitizeStatusColor(s.color);
  return { name, note, chance, durationSec, atkMod, dmgMod, defMod, visionMod, tickValue, tickIntervalSec, icon, color };
}
// สกิลที่ต้องการไอเทมถึงจะใช้ได้ (ไม่บังคับ) — DM ระบุชื่อ + จำนวนไอเทมที่ต้องมีในกระเป๋าตอนใช้สกิลนี้
// ไม่มีชื่อไอเทม = สกิลนี้ไม่ต้องการไอเทมอะไรเลย (ใช้ได้อิสระเหมือนเดิม) — ชื่อไอเทมต้องตรงกับชื่อในกระเป๋าผู้เล่นเป๊ะๆ เหมือนระบบไอเทมใช้งานได้
// ใช้สกิลสำเร็จแล้วจะหักไอเทมออกจากกระเป๋าตามจำนวนที่กำหนดทันที (เหมือนไอเทมใช้งานได้ที่หายไปตอนกดใช้) — DM ไม่ถูกหักไอเทม (DM ไม่มีกระเป๋า/ไม่ถูกจำกัดสิทธิ์)
function dndSanitizeSkillReqItem(raw) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  const name = (r.name || '').toString().trim().slice(0, 40);
  const qty = Math.max(1, Math.min(999, Math.round(Number(r.qty) || 1)));
  return { reqItemName: name, reqItemQty: name ? qty : 0 };
}
// จำกัดคลาสที่ใช้สกิลนี้ได้ (ไม่บังคับ) — ไม่เลือกคลาสใดเลย = ทุกคลาสใช้ได้ (ค่าเริ่มต้น เข้ากันได้กับสกิลเก่าที่ยังไม่มีช่องนี้ ถือว่า allowedClasses ว่างเปล่า)
// ใช้ตรวจตอนกดใช้สกิล (dndHandleSkillUse), ตอนอ่านสมุดเวทย์เพื่อเรียนสกิล (server/dnd/item.js), และตอนซื้อสมุดเวทย์ที่ร้านห้องสมุด (server/dnd/shop.js)
function dndSanitizeAllowedClasses(raw) {
  if (!Array.isArray(raw)) return [];
  const validKeys = DND_CLASSES.map(c => c.key);
  const out = [];
  for (const v of raw) {
    const key = (v || '').toString();
    if (validKeys.includes(key) && !out.includes(key)) out.push(key);
  }
  return out;
}
// เช็คว่าคลาสที่ระบุใช้สกิลนี้ได้ไหม — allowedClasses ว่างเปล่า = ทุกคลาสใช้ได้ (ไม่จำกัด) DM ไม่ถูกจำกัดด้วยฟังก์ชันนี้ (เช็คแยกที่จุดเรียกใช้)
function dndSkillClassAllowed(skill, classKey) {
  const allowed = Array.isArray(skill.allowedClasses) ? skill.allowedClasses : [];
  return allowed.length === 0 || allowed.includes(classKey);
}
// ข้อความแสดงรายชื่อคลาสที่จำกัดไว้ (ใช้โชว์เป็นแบดจ์บนชิปสกิล/ร้านห้องสมุด) — คืนค่าว่างถ้าไม่จำกัด (ทุกคลาสใช้ได้)
function dndAllowedClassesText(allowedClasses) {
  const allowed = Array.isArray(allowedClasses) ? allowedClasses : [];
  if (!allowed.length) return '';
  return allowed.map(key => { const cls = DND_CLASSES.find(c => c.key === key); return cls ? `${cls.icon} ${cls.name}` : key; }).join(', ');
}
// เป้าหมายที่สกิล/บัฟ/ดีบัฟ/โจมตีนี้เลือกได้: 'monster' = มอนสเตอร์เท่านั้น, 'player' = ผู้เล่นเท่านั้น, 'both' = ใช้กับใครก็ได้, 'self' = ใช้กับตัวเองเท่านั้น (ผู้ใช้สกิล)
// สกิลเก่าที่สร้างไว้ก่อนมีช่องนี้ (targetMode เป็น undefined) จะ fallback ไปใช้กฎเดิม เพื่อไม่ให้พฤติกรรมสกิลที่มีอยู่แล้วเปลี่ยนไปโดยไม่ตั้งใจ
function dndSanitizeTargetMode(raw) {
  return (raw === 'monster' || raw === 'player' || raw === 'both' || raw === 'self') ? raw : '';
}
function dndSkillTargetMode(skill) {
  const explicit = dndSanitizeTargetMode(skill.targetMode);
  if (explicit) return explicit;
  return (skill.buffAlly || skill.healDie > 0 || skill.cleanseEnabled) ? 'player' : 'monster';
}
// DM เท่านั้นที่ออกแบบ/ลบสกิลได้ — กำหนดดาเมจ (ลูกเต๋า) และมอบสกิลให้ผู้เล่นเฉพาะคนได้ (ไม่เลือกใคร = ทั้งปาร์ตี้ใช้ได้)
function dndHandleSkillCreate(ws, payload) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM || !payload || typeof payload !== 'object') return;
  const name = (payload.name || '').toString().trim().slice(0, 40);
  if (!name) { dndSendError(ws, 'กรุณาตั้งชื่อสกิล'); return; }
  // ไอคอน/สีประจำสกิล (ไม่บังคับ) — แสดงบนชิปสกิลของผู้เล่นและมอนสเตอร์ เหมือนระบบไอคอน/สีของสถานะ
  const icon = dndSanitizeSkillIcon(payload.icon);
  const color = dndSanitizeStatusColor(payload.color);
  const statRaw = (payload.stat || '').toString();
  const stat = DND_SKILL_STATS.includes(statRaw) ? statRaw : '';
  const desc = (payload.desc || '').toString().trim().slice(0, 500);

  const dmg = (payload.damage && typeof payload.damage === 'object') ? payload.damage : {};
  const dmgDie = DND_VALID_DICE.includes(Number(dmg.die)) ? Number(dmg.die) : 0; // 0 = ไม่มีดาเมจ
  const dmgCount = Math.max(1, Math.min(20, Math.round(Number(dmg.count) || 1)));
  const dmgMod = Math.max(-100, Math.min(100, Math.round(Number(dmg.mod) || 0)));

  // สกิลชุบ/ฟื้นฟู HP — DM ตั้งลูกเต๋าฮีลแยกจากดาเมจได้ (0 = ไม่ใช่สกิลชุบ) ใช้กับผู้เล่นเท่านั้น รวมถึงชุบคนหมดสติให้ฟื้นได้ด้วย
  const heal = (payload.heal && typeof payload.heal === 'object') ? payload.heal : {};
  const healDie = DND_VALID_DICE.includes(Number(heal.die)) ? Number(heal.die) : 0;
  const healCount = Math.max(1, Math.min(20, Math.round(Number(heal.count) || 1)));
  const healMod = Math.max(-100, Math.min(100, Math.round(Number(heal.mod) || 0)));
  // ประเภทของสกิลชุบ HP — false (ค่าเริ่มต้น) = "ฟื้นฟู" ธรรมดา ปลุกคนหมดสติไม่ได้ (ต้องยังไม่หมดสติถึงใช้ได้),
  // true = "ชุบชีวิต" ปลุกคนหมดสติได้ด้วย — แยกกันเหมือนไอเทม effectType heal/revive
  const healRevive = !!heal.revive;

  const assignedIds = Array.isArray(payload.assignedIds)
    ? payload.assignedIds.map(Number).filter(id => dndPlayers.some(pp => pp.id === id))
    : [];
  // libraryOnly: สกิลนี้ "ต้องเรียนก่อนถึงจะใช้ได้" (เช่น อ่านสมุดเวทย์จากร้านห้องสมุด) — ถ้าเปิดไว้ จะไม่ตกกลับไปเป็น
  // "ทั้งปาร์ตี้ใช้ได้" แม้ assignedIds จะว่างเปล่า (ต่างจากสกิลปกติที่ assignedIds ว่าง = ทั้งปาร์ตี้ใช้ได้เลย)
  // ต้องมีคนอยู่ใน assignedIds เท่านั้นถึงจะใช้สกิลนี้ได้ (นอกจาก DM ซึ่งใช้ได้เสมอ)
  const libraryOnly = !!payload.libraryOnly;
  // คลาสที่ใช้สกิลนี้ได้ (ไม่บังคับ) — ไม่เลือกคลาสใดเลย = ทุกคลาสใช้ได้ ดูรายละเอียดที่ dndSanitizeAllowedClasses
  const allowedClasses = dndSanitizeAllowedClasses(payload.allowedClasses);
  const cooldownSec = Math.max(0, Math.min(3600, Math.round(Number(payload.cooldownSec) || 0)));
  const maxUses = Math.max(0, Math.min(99, Math.round(Number(payload.maxUses) || 0)));
  // SP (Skill Point / Mana) ที่ต้องใช้ต่อการใช้สกิลนี้ 1 ครั้ง — 0 = ไม่ใช้ SP เลย ผู้เล่นใช้ได้อิสระ (ไม่นับรวม DM)
  const spCost = Math.max(0, Math.min(999, Math.round(Number(payload.spCost) || 0)));
  // โอกาสโดน (%) — ใช้เฉพาะตอนสกิลนี้ไม่ได้ผูกสเตตัส (ไม่มีการทอยโจมตีวัด AC อยู่แล้ว) ดูรายละเอียดที่ dndSanitizeHitChance
  const hitChance = dndSanitizeHitChance(payload.hitChance);
  // โดนเสมอ (guaranteedHit) — DM ตั้งไว้ล่วงหน้าตอนออกแบบสกิล ไม่ใช่ตัวเลือกที่ผู้เล่นกดตอนใช้สกิล
  // ถ้าเปิดไว้ สกิลนี้จะไม่ทอย 1d20 vs AC / ทอยโอกาสโดน (d100) อีกต่อไป ถือว่าโดนเป้าหมายทันทีทุกครั้งที่ใช้ (ไม่นับคริติคอล) แล้วทอยดาเมจตรง ๆ เลย
  const guaranteedHit = !!payload.guaranteedHit;
  // เวทย์เลเวล (0 = แคนทริป, 1-9 = เลเวลเวทย์ตามมาตรฐาน D&D) — ใช้เป็นเกณฑ์เลเวลตัวละครขั้นต่ำที่จะใช้สกิลนี้ได้ (เฉพาะสกิล libraryOnly ดู dndHandleSkillUse)
  // และใช้คำนวณราคาสมุดเวทย์ในร้านห้องสมุด (ดู dndSpellbookPriceForLevel)
  const level = Math.max(0, Math.min(9, Math.round(Number(payload.level) || 0)));

  // สถานะ/ดีบัฟที่ผูกกับสกิล (ไม่บังคับ) — ใช้สกิลแล้วเป้าหมายจะติดสถานะนี้ให้อัตโนมัติ ใช้ร่วมกับดาเมจ/ฮีลได้ในสกิลเดียวกัน
  const status = dndSanitizeSkillStatus(payload.status);
  // ไอเทมที่ต้องใช้ประกอบสกิลนี้ (ไม่บังคับ) — ต้องมีในกระเป๋าครบตามจำนวนถึงจะใช้สกิลได้ ใช้แล้วไอเทมจะถูกหักออกไปตามจำนวนที่ตั้งไว้
  const reqItem = dndSanitizeSkillReqItem(payload.reqItem);
  // สกิลบัฟเพื่อน (ไม่บังคับ) — เปิดไว้แล้วตอนใช้สกิลจะเลือกเป้าหมายเป็นผู้เล่นได้ (เหมือนสกิลฮีล) แทนที่จะเลือกได้แต่มอนสเตอร์
  const buffAlly = !!payload.buffAlly;
  // เป้าหมายที่เลือกได้ตอนใช้สกิลนี้: 'monster' / 'player' / 'both' (ใช้กับใครก็ได้) — ไม่ระบุ = ให้ระบบเดาจากค่าฮีล/บัฟ/ลบล้างสถานะเหมือนเดิม
  let targetMode = dndSanitizeTargetMode(payload.targetMode) || (buffAlly || healDie || (payload.cleanse && payload.cleanse.enabled) ? 'player' : 'monster');

  // สกิล AOE (พื้นที่บริเวณ): เป้าเดี่ยวปกติยังต้องเลือกเป้าหมายหลักเหมือนเดิม แต่ถ้าตั้งรัศมีไว้ (>0)
  // ดาเมจจะกระจายไปโดนเป้าหมายอื่น ๆ ที่อยู่ในระยะรอบเป้าหมายหลักบนแผนที่ด้วย โดยดาเมจจะลดหลั่นตามระยะห่างจากจุดศูนย์กลาง
  // หน่วยรัศมีอิงตามพิกัด token บนแผนที่ (0-100 = กว้าง/ยาวเต็มแผนที่) — 0 = ไม่มี AOE ยิงเป้าเดี่ยวเหมือนเดิม
  const aoeRaw = (payload.aoe && typeof payload.aoe === 'object') ? payload.aoe : {};
  const aoeRadius = Math.max(0, Math.min(100, Math.round(Number(aoeRaw.radius) || 0)));
  // รูปแบบพื้นที่ AOE: 'circle' (ค่าเริ่มต้น) = วงกลมรอบเป้าหมายหลัก, 'line' = เส้นตรงพุ่งจากตัวผู้ใช้สกิลไปยังเป้าหมายหลัก กว้างเท่ารัศมีที่ตั้งไว้
  const aoeShape = dndSanitizeAoeShape(aoeRaw.shape);
  // ระยะโจมตี (หน่วย "จำนวนช่องตาราง") — 0 = ไม่จำกัดระยะ, แปลงเป็น % ของแผนที่ปัจจุบันตอนตรวจระยะจริง (ดู dndRangeCellsToPercent) โดยอิงพิกัด token บนแผนที่ (0-100 = กว้าง/ยาวเต็มแผนที่)
  // ตอนใช้สกิลจะวัดระยะห่างจริงระหว่าง token ผู้ใช้กับ token เป้าหมายบนแผนที่ปัจจุบัน ถ้าไกลเกินระยะนี้จะใช้สกิลไม่ได้
  // ถ้าฝ่ายใดฝ่ายหนึ่งไม่มี token อยู่บนแผนที่ (เล่นแบบไม่มีแผนที่) จะไม่ตรวจระยะให้ ปล่อยผ่านเหมือนเดิม ดูรายละเอียดที่ dndHandleSkillUse
  const range = dndSanitizeAttackRangeCells(payload.range);

  // สกิลลบล้างสถานะผิดปกติ (cleanse): เปิดใช้แล้วต้องเลือกเป้าหมายเป็นผู้เล่นเท่านั้น — cleanseName ว่าง = ล้างสถานะทั้งหมดที่ติดอยู่,
  // ถ้าระบุชื่อไว้จะล้างเฉพาะสถานะที่ชื่อตรงกัน (ใช้ทำสกิลแก้พิษ/แก้มึนงงเฉพาะทางได้) — ใช้ร่วมกับดาเมจ/ฮีล/ติดสถานะในสกิลเดียวกันได้
  const cleanseRaw = (payload.cleanse && typeof payload.cleanse === 'object') ? payload.cleanse : {};
  const cleanseEnabled = !!cleanseRaw.enabled;
  const cleanseName = cleanseEnabled ? (cleanseRaw.name || '').toString().trim().slice(0, 24) : '';

  // สกิลอัญเชิญ (isSummon) — DM เลือกเองได้เต็มที่ตอนสร้างสกิลไหนก็ได้ (ไม่จำกัดแค่สกิลจากสมุดเวทย์) ว่าจะให้เป็นสกิลอัญเชิญไหม
  // แล้วเลือกจาก "แคตตาล็อกสัตว์อัญเชิญ" (DND_SUMMON_TEMPLATES ในไฟล์ summon-templates.js) ว่าจะอัญเชิญตัวไหน — เปลี่ยนได้ตลอดผ่านปุ่มแก้ไขสกิลทีหลัง
  // ไม่ต้องแก้ไฟล์ข้อมูลฝั่งเซิร์ฟเวอร์อีกต่อไป (ดู dndHandleSkillUse ตรง `if (skill.isSummon)` ที่ใช้ค่านี้จริงตอนร่าย)
  const isSummon = !!payload.isSummon;
  const summonTemplateKeyRaw = (payload.summonTemplateKey || '').toString();
  const summonTemplateKey = isSummon && DND_SUMMON_TEMPLATES[summonTemplateKeyRaw] ? summonTemplateKeyRaw : '';
  const summonDurationSec = Math.max(0, Math.min(3600, Math.round(Number(payload.summonDurationSec) || 0)));
  const summonMaxActive = Math.max(1, Math.min(10, Math.round(Number(payload.summonMaxActive) || 1)));
  // สกิลอัญเชิญไม่ได้ใช้เป้าหมายที่เลือกจริง (ดู dndHandleSkillUse ตรง `if (skill.isSummon)` ที่ return ก่อนถึง logic ใช้ target)
  // แต่ flow เดิมยังต้องเลือกเป้าหมายที่ "ถูกต้อง" ผ่าน dndFindCombatTarget ก่อนเข้ามาถึงตรงนั้นอยู่ดี — บังคับเป็น 'self' เสมอ
  // กันไม่ให้ DM เผลอตั้ง targetMode ผิด (เช่น 'monster') แล้วร่ายไม่ได้เพราะหาเป้าหมายไม่เจอตอนแผนที่ไม่มีมอนสเตอร์เลย
  if (isSummon) targetMode = 'self';

  const skill = { id: dndNextSkillId++, name, icon, color, stat, desc, level, dmgDie, dmgCount, dmgMod, healDie, healCount, healMod, healRevive,
    statusName: status.name, statusNote: status.note, statusChance: status.chance,
    statusDurationSec: status.durationSec, statusAtkMod: status.atkMod, statusDmgMod: status.dmgMod, statusDefMod: status.defMod, statusVisionMod: status.visionMod,
    statusTickValue: status.tickValue, statusTickIntervalSec: status.tickIntervalSec, statusIcon: status.icon, statusColor: status.color,
    reqItemName: reqItem.reqItemName, reqItemQty: reqItem.reqItemQty,
    buffAlly, targetMode, assignedIds, libraryOnly, allowedClasses, cooldownSec, maxUses, spCost, hitChance, guaranteedHit, aoeRadius, aoeShape, range, cleanseEnabled, cleanseName,
    isSummon, summonTemplateKey, summonDurationSec, summonMaxActive };
  dndSkills.push(skill);
  const assignedNames = assignedIds.map(id => { const pp = dndPlayers.find(pp => pp.id === id); return pp ? (pp.character.charName || pp.name) : null; }).filter(Boolean);
  const assignText = assignedNames.length ? ` — มอบให้: ${assignedNames.join(', ')}` : (libraryOnly ? ' — ยังไม่มีใครเรียนรู้ (ต้องเรียนก่อนถึงจะใช้ได้)' : ' — ทั้งปาร์ตี้ใช้ได้');
  const classText = allowedClasses.length ? ` (🎓 เฉพาะคลาส: ${dndAllowedClassesText(allowedClasses)})` : '';
  const levelText = ` (📖 เวทย์เลเวล ${level === 0 ? 'แคนทริป' : level})`;
  const ruleText = `${libraryOnly ? ' 🔒ต้องเรียนก่อน' : ''}${cooldownSec ? ` (คูลดาวน์ ${cooldownSec}วิ)` : ''}${maxUses ? ` (ใช้ได้ ${maxUses} ครั้ง)` : ''}${spCost ? ` (ใช้ SP ${spCost})` : ''}${reqItem.reqItemName ? ` (ต้องมี ${reqItem.reqItemName} x${reqItem.reqItemQty})` : ''}`;
  const healText = healDie ? ` (${healRevive ? '🌟 ชุบชีวิต' : '💚 ฟื้นฟู'} HP ${healCount}d${healDie}${healMod ? (healMod > 0 ? '+' + healMod : healMod) : ''})` : '';
  const targetModeText = targetMode === 'both' ? ' 🎯เป้าหมาย: มอนสเตอร์+ผู้เล่น' : (targetMode === 'self' ? ' 🎯เป้าหมาย: ตัวเองเท่านั้น' : (targetMode === 'player' ? ' 🎯เป้าหมาย: ผู้เล่นเท่านั้น' : ' 🎯เป้าหมาย: มอนสเตอร์เท่านั้น'));
  dndAddLog(`✨ DM ออกแบบสกิลใหม่: ${name}${levelText}${stat ? ` (ผูก ${stat.toUpperCase()})` : (hitChance < 100 ? ` (🎯 โอกาสโดน ${hitChance}%)` : '')}${guaranteedHit ? ' (✅ โดนเสมอ)' : ''}${dmgDie ? ` (ดาเมจ ${dmgCount}d${dmgDie}${dmgMod ? (dmgMod > 0 ? '+' + dmgMod : dmgMod) : ''})` : ''}${healText}${status.name ? ` (ติดสถานะ "${status.name}"${buffAlly ? ' — บัฟเพื่อน' : ''}${status.durationSec ? ` คูลดาวน์ ${status.durationSec}วิ` : ''}${dndBuildStatusModText(status.atkMod, status.dmgMod, status.defMod, status.tickValue, status.tickIntervalSec, status.visionMod)})` : ''}${aoeRadius ? ` (💥 AOE${aoeShape === 'line' ? 'เส้นตรง' : 'รัศมี'} ${aoeRadius})` : ''}${range ? ` (📏 ระยะโจมตี ${range} ช่อง)` : ''}${cleanseEnabled ? ` (✨ ลบล้างสถานะ${cleanseName ? ` "${cleanseName}"` : 'ทั้งหมด'})` : ''}${classText}${ruleText}${assignText}${targetModeText}${isSummon ? ` (🔮 อัญเชิญ: ${summonTemplateKey ? dndSummonTemplateByKey(summonTemplateKey).name : 'ยังไม่เลือกตัว'}${summonMaxActive > 1 ? ` x${summonMaxActive}` : ''}${summonDurationSec ? ` อยู่ได้ ${summonDurationSec}วิ` : ''})` : ''}`);
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
  const desc = (payload.desc || '').toString().trim().slice(0, 500);

  const dmg = (payload.damage && typeof payload.damage === 'object') ? payload.damage : {};
  const dmgDie = DND_VALID_DICE.includes(Number(dmg.die)) ? Number(dmg.die) : 0;
  const dmgCount = Math.max(1, Math.min(20, Math.round(Number(dmg.count) || 1)));
  const dmgMod = Math.max(-100, Math.min(100, Math.round(Number(dmg.mod) || 0)));
  const cooldownSec = Math.max(0, Math.min(3600, Math.round(Number(payload.cooldownSec) || 0)));
  const maxUses = Math.max(0, Math.min(99, Math.round(Number(payload.maxUses) || 0)));
  // SP ที่ต้องใช้ต่อการใช้สกิลนี้ 1 ครั้ง — 0 = ไม่ใช้ SP เลย
  const spCost = Math.max(0, Math.min(999, Math.round(Number(payload.spCost) || 0)));
  // โอกาสโดน (%) — ใช้เฉพาะตอนสกิลนี้ไม่ได้ผูกสเตตัส ดูรายละเอียดที่ dndSanitizeHitChance
  const hitChance = dndSanitizeHitChance(payload.hitChance);
  // โดนเสมอ (guaranteedHit) — DM ตั้งไว้ล่วงหน้าตอนแก้สกิล ไม่ใช่ตัวเลือกที่ผู้เล่นกดตอนใช้สกิล ดูรายละเอียดที่ dndHandleSkillCreate
  const guaranteedHit = !!payload.guaranteedHit;
  // เวทย์เลเวล (0 = แคนทริป, 1-9) — แก้ไขได้เหมือนกัน ดูรายละเอียดที่ dndHandleSkillCreate
  const level = Math.max(0, Math.min(9, Math.round(Number(payload.level) || 0)));

  const heal = (payload.heal && typeof payload.heal === 'object') ? payload.heal : {};
  const healDie = DND_VALID_DICE.includes(Number(heal.die)) ? Number(heal.die) : 0;
  const healCount = Math.max(1, Math.min(20, Math.round(Number(heal.count) || 1)));
  const healMod = Math.max(-100, Math.min(100, Math.round(Number(heal.mod) || 0)));
  // ประเภทของสกิลชุบ HP — false = "ฟื้นฟู" ธรรมดา ปลุกคนหมดสติไม่ได้, true = "ชุบชีวิต" ปลุกคนหมดสติได้ด้วย
  const healRevive = !!heal.revive;

  // สถานะ/ดีบัฟที่ผูกกับสกิล (ไม่บังคับ) — แก้ไขได้เหมือนดาเมจ/ฮีล
  const status = dndSanitizeSkillStatus(payload.status);
  // ไอเทมที่ต้องใช้ประกอบสกิลนี้ (ไม่บังคับ) — แก้ไขได้เหมือนกัน
  const reqItem = dndSanitizeSkillReqItem(payload.reqItem);
  // สกิลบัฟเพื่อน (ไม่บังคับ) — เปิดไว้แล้วตอนใช้สกิลจะเลือกเป้าหมายเป็นผู้เล่นได้
  const buffAlly = !!payload.buffAlly;
  // เป้าหมายที่เลือกได้ตอนใช้สกิลนี้: 'monster' / 'player' / 'both' — ดูรายละเอียดที่ dndHandleSkillCreate
  let targetMode = dndSanitizeTargetMode(payload.targetMode) || (buffAlly || healDie || (payload.cleanse && payload.cleanse.enabled) ? 'player' : 'monster');

  // รัศมี AOE (0 = เป้าเดี่ยวปกติ) + รูปแบบพื้นที่ — ดูรายละเอียดหน่วยที่ dndHandleSkillCreate
  const aoeRaw = (payload.aoe && typeof payload.aoe === 'object') ? payload.aoe : {};
  const aoeRadius = Math.max(0, Math.min(100, Math.round(Number(aoeRaw.radius) || 0)));
  const aoeShape = dndSanitizeAoeShape(aoeRaw.shape);
  // ระยะโจมตี (0 = ไม่จำกัดระยะ, หน่วย "จำนวนช่องตาราง") — ดูรายละเอียดที่ dndHandleSkillCreate
  const range = dndSanitizeAttackRangeCells(payload.range);

  // สกิลลบล้างสถานะ (cleanse) — ดูรายละเอียดที่ dndHandleSkillCreate
  const cleanseRaw = (payload.cleanse && typeof payload.cleanse === 'object') ? payload.cleanse : {};
  const cleanseEnabled = !!cleanseRaw.enabled;
  const cleanseName = cleanseEnabled ? (cleanseRaw.name || '').toString().trim().slice(0, 24) : '';

  const assignedIds = Array.isArray(payload.assignedIds)
    ? payload.assignedIds.map(Number).filter(id => dndPlayers.some(pp => pp.id === id))
    : [];
  const libraryOnly = !!payload.libraryOnly;
  // คลาสที่ใช้สกิลนี้ได้ (ไม่บังคับ) — แก้ไขได้เหมือนกัน ดูรายละเอียดที่ dndSanitizeAllowedClasses
  const allowedClasses = dndSanitizeAllowedClasses(payload.allowedClasses);

  // สกิลอัญเชิญ (isSummon) — DM แก้ไขได้ตลอด รวมถึงสกิลจากสมุดเวทย์ที่ seed มาให้ตั้งแต่แรก (เช่น "Summon Beast") เปลี่ยนตัวที่อัญเชิญ
  // ได้จริงในเกมผ่านปุ่ม "✏️ แก้ไข/มอบสกิล" ตรงนี้เลย ไม่ต้องแก้ไฟล์ข้อมูลฝั่งเซิร์ฟเวอร์ ดูรายละเอียดที่ dndHandleSkillCreate
  const isSummon = !!payload.isSummon;
  const summonTemplateKeyRaw = (payload.summonTemplateKey || '').toString();
  const summonTemplateKey = isSummon && DND_SUMMON_TEMPLATES[summonTemplateKeyRaw] ? summonTemplateKeyRaw : '';
  const summonDurationSec = Math.max(0, Math.min(3600, Math.round(Number(payload.summonDurationSec) || 0)));
  const summonMaxActive = Math.max(1, Math.min(10, Math.round(Number(payload.summonMaxActive) || 1)));
  // เหตุผลเดียวกับ dndHandleSkillCreate — บังคับ 'self' เสมอสำหรับสกิลอัญเชิญ กันหาเป้าหมายไม่เจอ
  if (isSummon) targetMode = 'self';

  skill.name = name; skill.icon = dndSanitizeSkillIcon(payload.icon); skill.color = dndSanitizeStatusColor(payload.color); skill.stat = stat; skill.desc = desc; skill.level = level;
  skill.dmgDie = dmgDie; skill.dmgCount = dmgCount; skill.dmgMod = dmgMod;
  skill.healDie = healDie; skill.healCount = healCount; skill.healMod = healMod; skill.healRevive = healRevive;
  skill.statusName = status.name; skill.statusNote = status.note; skill.statusChance = status.chance; skill.buffAlly = buffAlly; skill.targetMode = targetMode;
  skill.statusDurationSec = status.durationSec; skill.statusAtkMod = status.atkMod; skill.statusDmgMod = status.dmgMod; skill.statusDefMod = status.defMod; skill.statusVisionMod = status.visionMod;
  skill.statusTickValue = status.tickValue; skill.statusTickIntervalSec = status.tickIntervalSec; skill.statusIcon = status.icon; skill.statusColor = status.color;
  skill.reqItemName = reqItem.reqItemName; skill.reqItemQty = reqItem.reqItemQty;
  skill.cooldownSec = cooldownSec; skill.maxUses = maxUses; skill.spCost = spCost; skill.hitChance = hitChance; skill.guaranteedHit = guaranteedHit;
  skill.assignedIds = assignedIds; skill.libraryOnly = libraryOnly; skill.allowedClasses = allowedClasses;
  skill.aoeRadius = aoeRadius; skill.aoeShape = aoeShape; skill.range = range;
  skill.cleanseEnabled = cleanseEnabled; skill.cleanseName = cleanseName;
  skill.isSummon = isSummon; skill.summonTemplateKey = summonTemplateKey; skill.summonDurationSec = summonDurationSec; skill.summonMaxActive = summonMaxActive;

  const assignedNames = assignedIds.map(id => { const pp = dndPlayers.find(pp => pp.id === id); return pp ? (pp.character.charName || pp.name) : null; }).filter(Boolean);
  const assignText = assignedNames.length ? ` — มอบให้: ${assignedNames.join(', ')}` : ' — ทั้งปาร์ตี้ใช้ได้';
  const classText = allowedClasses.length ? ` (🎓 เฉพาะคลาส: ${dndAllowedClassesText(allowedClasses)})` : '';
  const healText = healDie ? ` (${healRevive ? '🌟 ชุบชีวิต' : '💚 ฟื้นฟู'} HP ${healCount}d${healDie}${healMod ? (healMod > 0 ? '+' + healMod : healMod) : ''})` : '';
  const reqItemText = reqItem.reqItemName ? ` (ต้องมี ${reqItem.reqItemName} x${reqItem.reqItemQty})` : '';
  const summonText = isSummon ? ` (🔮 อัญเชิญ: ${summonTemplateKey ? dndSummonTemplateByKey(summonTemplateKey).name : 'ยังไม่เลือกตัว'}${summonMaxActive > 1 ? ` x${summonMaxActive}` : ''}${summonDurationSec ? ` อยู่ได้ ${summonDurationSec}วิ` : ''})` : '';
  dndAddLog(`✏️ DM แก้ไขสกิล: ${name} (📖 เวทย์เลเวล ${level === 0 ? 'แคนทริป' : level})${guaranteedHit ? ' (✅ โดนเสมอ)' : ''}${range ? ` (📏 ระยะโจมตี ${range} ช่อง)` : ''}${aoeRadius ? ` (💥 AOE${aoeShape === 'line' ? 'เส้นตรง' : 'รัศมี'} ${aoeRadius})` : ''}${healText}${status.name ? ` (ติดสถานะ "${status.name}"${buffAlly ? ' — บัฟเพื่อน' : ''}${status.durationSec ? ` คูลดาวน์ ${status.durationSec}วิ` : ''}${dndBuildStatusModText(status.atkMod, status.dmgMod, status.defMod, status.tickValue, status.tickIntervalSec, status.visionMod)})` : ''}${reqItemText}${classText}${assignText}${summonText}`);
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
    const gained = STAT_POINTS_PER_LEVEL * (levelInfo.newLevel - oldLevel);
    pp.character.statPoints = Math.round(Number(pp.character.statPoints) || 0) + gained;
    dndAddLog(`🎉 ${pp.character.charName || pp.name} เลเวลอัป! Lv.${oldLevel} → Lv.${levelInfo.newLevel} (ได้แต้มสเตตัส +${gained})`);
    dndAnnounceClassSkillUnlocks(pp, oldLevel, levelInfo.newLevel);
    // SP ไม่โตอัตโนมัติตามเลเวลแล้ว — DM เป็นคนปรับ maxSp เองผ่านฟอร์มแก้ไขผู้เล่น
  }
  const grantedLoot = [];
  const overflowLoot = [];
  if (loot.length) {
    for (const item of loot) {
      if (dndBagAdd(pp.character, item.name, item.qty)) grantedLoot.push(item);
      else overflowLoot.push(item); // กระเป๋าเต็ม (ช่องไอเทมไม่พอ) — ของชิ้นนี้หายไป ไม่ถูกเพิ่มเข้ากระเป๋า
    }
  }
  const rewardParts = [];
  if (exp) rewardParts.push(`✨ EXP +${exp}`);
  if (gold) rewardParts.push(`💰 ทอง +${gold}`);
  if (grantedLoot.length) rewardParts.push(`🎁 ${grantedLoot.map(item => `${item.name} x${item.qty}`).join(', ')}`);
  if (rewardParts.length) dndAddLog(`🎉 ${token.name} ถูกกำจัด — แจกให้ ${pp.character.charName || pp.name}: ${rewardParts.join(' | ')}`);
  if (overflowLoot.length) dndAddLog(`🎒 กระเป๋าของ ${pp.character.charName || pp.name} เต็ม (${DND_BAG_CAPACITY} ช่อง) พลาดของ: ${overflowLoot.map(item => `${item.name} x${item.qty}`).join(', ')}`);
}
function dndCheckTokenDefeat(token, killerPlayer) {
  if (token._rewarded || token.hp > 0) return;
  token._rewarded = true;
  dndGrantRewardsForDefeat(token, killerPlayer);
}

// ============================================================
// โมดูล 4: Lifecycle / Despawn ของ token อัญเชิญ (summoned: true)
// ครอบคลุม 3 เหตุตามที่ระบุไว้: หมดเวลา (summonExpiresAt), เจ้าของหมดสติ/ตาย, เจ้าของออกจากเกม/แผนที่เปลี่ยน
// - หมดเวลา + เจ้าของหมดสติ/ตาย: เช็คจาก sweep tick นี้ทุก 1 วิ (รวมเข้ากับ dndSweepExpiredStatuses ที่ index.js เรียกอยู่แล้ว ดู dndSweepExpired ด้านล่าง)
// - เจ้าของออกจากเกม (DM เตะออกถาวร): ลบทันทีตรงจุดนั้นเลยใน dndHandleDmKickPlayer (ไม่ต้องรอ tick)
// - แผนที่เปลี่ยน (DM สลับแผนที่ที่แสดงอยู่): ลบทันทีตรงจุดนั้นเลยใน dndHandleMapSwitch (ไม่ต้องรอ tick)
//   หมายเหตุการออกแบบ: ตีความ "แผนที่เปลี่ยน" แบบกว้าง คือสัตว์อัญเชิญที่ยังค้างอยู่ทั้งหมด (ทุกแผนที่) หายไปทันทีที่ DM สลับฉาก
//   ไม่ใช่แค่ตัวที่อยู่บนแผนที่ที่กำลังจะออกจากไปเท่านั้น เพราะสัตว์อัญเชิญไม่ควร "ค้าง" ข้ามฉากรอเจ้าของย้อนกลับมาใช้งานทีหลัง
// ============================================================
// ลบ token อัญเชิญ 1 ตัวออกจากระบบให้ครบ (ตัด array + เอาออกจากลำดับเทิร์นถ้าอยู่ในนั้น) — ใช้ร่วมกันทั้ง sweep tick และปุ่มยกเลิกอัญเชิญเอง
function dndRemoveSummonToken(token) {
  const idx = dndTokens.findIndex(tt => tt.id === token.id);
  if (idx === -1) return false;
  dndTokens.splice(idx, 1);
  dndCleanTurnOrder();
  return true;
}
// ไล่เช็กทุกวินาทีว่ามีสัตว์อัญเชิญตัวไหนหมดเวลา หรือเจ้าของหมดสติ/ตายไปแล้วหรือยัง (หมดแล้วให้หายไปอัตโนมัติ)
// เขียนตามแพทเทิร์นเดียวกับ dndSweepExpiredStatuses (server/dnd/status-effects.js): สะสม log แบบเงียบ (ไม่ broadcast ทีละบรรทัด)
// แล้ว broadcast รวมครั้งเดียวท้ายสุดถ้ามีอะไรเปลี่ยนจริง กันสแปม broadcast ถ้ามีหลายตัวหมดอายุพร้อมกันในติ๊กเดียว
function dndSweepExpiredSummons() {
  const now = Date.now();
  let changed = false;
  for (let i = dndTokens.length - 1; i >= 0; i--) {
    const t = dndTokens[i];
    if (t.kind !== 'npc' || !t.summoned) continue;
    const owner = dndPlayers.find(pp => pp.id === t.ownerId);
    let reason = null;
    if (t.summonExpiresAt && t.summonExpiresAt <= now) {
      reason = 'หมดเวลาอัญเชิญแล้ว';
    } else if (owner && dndIsCharDead(owner.character)) {
      reason = `เจ้าของ (${owner.character.charName || owner.name}) หมดสติ/ตายไปแล้ว`;
    } else if (!owner) {
      // กันขยะค้าง เผื่อกรณีขอบ (เช่นโหลดไฟล์เซฟเก่าที่ ownerId ชี้ไปหาผู้เล่นที่ไม่มีอยู่แล้ว)
      reason = 'ไม่พบเจ้าของในห้องแล้ว';
    }
    if (!reason) continue;
    dndTokens.splice(i, 1);
    dndLog.push({ text: `💨 สัตว์อัญเชิญ "${t.name}" หายไปแล้ว (${reason})`, visibleTo: null });
    if (dndLog.length > 300) dndLog.shift();
    changed = true;
  }
  if (changed) {
    dndCleanTurnOrder();
    dndBroadcastState();
  }
}
// รวม sweep tick ทั้งสองระบบ (สถานะ + สัตว์อัญเชิญ) เข้าด้วยกัน — index.js ยังเรียกผ่านชื่อ export เดิม (sweepExpiredStatuses) เหมือนเดิมทุกประการ
function dndSweepExpired() {
  dndSweepExpiredStatuses();
  dndSweepExpiredSummons();
}
// เจ้าของสัตว์อัญเชิญยกเลิกอัญเชิญเองได้ทุกเมื่อ ไม่ต้องรอหมดเวลา (DM ก็ยกเลิกแทนใครก็ได้เหมือนกัน) — ต่างจาก dndHandleTokenDelete ตรงที่ไม่ใช่ DM-only
function dndHandleSummonDismiss(ws, tokenId) {
  const p = dndFindByWs(ws);
  if (!p) return;
  const t = dndTokens.find(tt => tt.id === Number(tokenId) && tt.kind === 'npc' && !!tt.summoned);
  if (!t) return;
  const isOwner = t.ownerId === p.id;
  if (!p.isDM && !isOwner) return;
  const owner = dndPlayers.find(pp => pp.id === t.ownerId);
  const ownerName = owner ? (owner.character.charName || owner.name) : '?';
  dndRemoveSummonToken(t);
  dndAddLog(p.isDM && !isOwner ? `💨 DM ยกเลิกอัญเชิญ "${t.name}" ของ ${ownerName}` : `💨 ${ownerName} ยกเลิกอัญเชิญ "${t.name}" เอง`);
}

// ส่งข้อมูลผลทอยแบบสด ๆ ให้ทุกคนเล่นแอนิเมชันทอยลูกเต๋าตอนโจมตี (แยกจาก log ข้อความ)
function dndBroadcastAttackAnim(payload) {
  const data = JSON.stringify(Object.assign({ type: 'dndAttackAnim' }, payload));
  for (const p of dndPlayers) {
    if (p.ws && p.ws.readyState === WebSocket.OPEN) p.ws.send(data);
  }
}
// selfId (ไม่บังคับ): ถ้าเป้าหมายที่เลือกคือผู้เล่นคนเดียวกับ selfId (เช่นสกิล targetMode 'self' ที่ใช้กับตัวเอง)
// จะข้ามการเช็ก dndMapAllowsPlayer ไปเลย — เพราะการ "เลือกเป้าหมายเป็นตัวเอง" ไม่ควรถูกบล็อกด้วยการตั้งค่าว่า
// DM เพิ่มผู้เล่นคนนี้ลงในรายชื่อผู้เล่นของแผนที่ปัจจุบันหรือยัง (ค่านั้นมีไว้กันไม่ให้เลือก "คนอื่น" ที่ไม่ได้อยู่ในฉากนี้)
function dndFindCombatTarget(targetType, targetId, selfId) {
  if (targetType === 'token') {
    const t = dndTokens.find(tt => tt.id === Number(targetId) && tt.kind === 'npc');
    if (!t) return null;
    const defMod = dndStatusMods(t.statuses).def;
    const obj = { type: 'token', id: t.id, name: t.name, hp: t.hp, maxHp: t.maxHp, ac: Math.max(0, t.ac + defMod), dead: Number(t.hp) <= 0 };
    obj.applyDamage = dmg => { t.hp = Math.max(0, Math.min(t.maxHp, t.hp - dmg)); obj.hp = t.hp; };
    // มอนสเตอร์ก็โดนสกิลชุบ HP ได้เหมือนผู้เล่น เผื่อ DM ตั้งสกิลให้ใช้กับใครก็ได้ (เช่น ชุบมอนสเตอร์ฝ่ายเดียวกัน/สัตว์เลี้ยง)
    obj.applyHeal = amount => { t.hp = Math.max(0, Math.min(t.maxHp, t.hp + amount)); obj.hp = t.hp; return { revived: false }; };
    return obj;
  }
  if (targetType === 'player') {
    const target = dndPlayers.find(pp => pp.id === Number(targetId));
    if (!target) return null;
    const isSelf = selfId !== undefined && Number(selfId) === target.id;
    if (!isSelf && !dndMapAllowsPlayer(dndCurrentMap(), target.id)) return null; // ผู้เล่นคนนี้ไม่ได้อยู่ในแผนที่ปัจจุบัน เลือกเป็นเป้าหมายไม่ได้ (ยกเว้นเลือกตัวเอง)
    const defMod = dndStatusMods(target.character.statuses).def;
    const obj = { type: 'player', id: target.id, name: target.character.charName || target.name, hp: target.character.hp, maxHp: target.character.maxHp, ac: Math.max(0, target.character.ac + defMod), dead: dndIsCharDead(target.character), permaDead: !!target.character.permaDead };
    obj.applyDamage = dmg => {
      const wasDead = dndIsCharDead(target.character);
      const wasPermaDead = !!target.character.permaDead;
      target.character.hp = Math.max(0, Math.min(target.character.maxHp, target.character.hp - dmg));
      obj.hp = target.character.hp;
      // โดนโจมตีครั้งเดียวดาเมจ >= 2 เท่าของ "เลือดสูงสุด" ตัวเอง (โอเวอร์คิล) = ตายถาวร ฟื้นด้วยไอเทม/สกิลชุบธรรมดาไม่ได้อีกต่อไป
      const overkillThreshold = DND_OVERKILL_MULT * (Number(target.character.maxHp) || 0);
      if (!wasPermaDead && overkillThreshold > 0 && dmg >= overkillThreshold) {
        target.character.permaDead = true;
      }
      obj.permaDead = !!target.character.permaDead;
      if (!wasDead && dndIsCharDead(target.character)) {
        if (target.character.permaDead) {
          dndAddLog(`☠️ ${obj.name} โดนโจมตีแรงเกินไป (ดาเมจ ${dmg} ≥ 2 เท่าของเลือดสูงสุด ${target.character.maxHp}) ตายถาวร! ไอเทม/สกิลชุบใช้ปลุกไม่ได้ ต้องรอ DM เพิ่ม HP ให้เท่านั้น`);
        } else {
          dndAddLog(`💀 ${obj.name} หมดสติ! ทำอะไรไม่ได้จนกว่าจะมีคนใช้ไอเทมชุบให้ หรือ DM เพิ่ม HP ให้`);
        }
      }
    };
    // ชุบ HP ให้เป้าหมาย — ใช้กับสกิลชุบของ DM ได้ รวมถึงชุบคนหมดสติ (HP 0) ให้ฟื้นกลับมาได้ด้วย
    // (แต่ถ้าตายถาวรจากการโอเวอร์คิลแล้ว ฟื้นด้วยวิธีนี้ไม่ได้เด็ดขาด — ต้องให้ DM เพิ่ม HP ให้โดยตรงเท่านั้น)
    obj.applyHeal = amount => {
      if (target.character.permaDead) return { revived: false, permaDeadBlocked: true };
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
// ---- DM: แก้ไขค่าเริ่มต้นของ "แคตตาล็อกสัตว์อัญเชิญ" (DND_SUMMON_TEMPLATES) ที่มีมาให้ในระบบ ----
// เก็บเป็น override แยกต่างหาก (ไม่แก้ DND_SUMMON_TEMPLATES ตรงๆ) คีย์ = summonTemplateKey ทับเฉพาะ template ที่แก้
// รูปแบบเดียวกับ dndRacePassiveOverrides ด้านบน — แก้ได้เฉพาะตัวที่มีอยู่แล้วในแคตตาล็อก (ไม่ได้เพิ่มตัวใหม่)
// ท่าโจมตี (attacks) ใช้ dndSanitizeAttackPayload ตัวเดียวกับท่าโจมตีของ NPC token ทุกประการ
function dndSanitizeSummonTemplatePayload(payload) {
  payload = (payload && typeof payload === 'object') ? payload : {};
  const name = (payload.name || '').toString().trim().slice(0, 20) || 'สัตว์อัญเชิญ';
  const icon = (payload.icon || '✨').toString().trim().slice(0, 4) || '✨';
  const color = (typeof payload.color === 'string' && payload.color) ? payload.color.slice(0, 20) : '#9fdc9f';
  const size = DND_TOKEN_SIZES.includes(payload.size) ? payload.size : 'normal';
  const maxHp = Math.max(1, Math.min(9999, Math.round(Number(payload.maxHp) || 20)));
  const ac = Math.max(0, Math.min(40, Math.round(Number(payload.ac) || 10)));
  const stats = {};
  DND_SKILL_STATS.forEach(stat => {
    const n = Number(payload[stat]);
    stats[stat] = Number.isFinite(n) ? Math.max(1, Math.min(30, Math.round(n))) : 10;
  });
  const statusResist = Math.max(0, Math.min(100, Math.round(Number(payload.statusResist) || 0)));
  const attacks = Array.isArray(payload.attacks) ? payload.attacks.slice(0, 10).map(a => dndSanitizeAttackPayload(a || {})) : [];
  return { name, icon, color, size, maxHp, ac, ...stats, statusResist, attacks };
}
// คืนค่า template จริงที่ควรใช้ (ทับด้วย override ถ้ามี) — ใช้ตอน spawn จริง (dndHandleSkillUse) และตอนแสดงชื่อใน log
function dndSummonTemplateByKey(key) {
  const builtin = DND_SUMMON_TEMPLATES[key];
  if (!builtin) return null;
  const ov = dndSummonTemplateOverrides[key];
  return ov ? Object.assign({}, builtin, ov) : builtin;
}
function dndHandleSummonTemplateOverrideSave(ws, key, payload) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM || !payload || typeof payload !== 'object') return;
  const k = (key || '').toString();
  if (!DND_SUMMON_TEMPLATES[k]) { dndSendError(ws, 'ไม่พบสัตว์อัญเชิญนี้ในแคตตาล็อก'); return; }
  dndSummonTemplateOverrides[k] = dndSanitizeSummonTemplatePayload(payload);
  dndAddLog(`✏️ DM แก้ไขค่าเริ่มต้นสัตว์อัญเชิญ: "${dndSummonTemplateOverrides[k].name}"`);
  dndBroadcastState();
}
// DM รีเซ็ตสัตว์อัญเชิญที่แก้ไว้ ให้กลับไปเป็นค่าเริ่มต้นของระบบ
function dndHandleSummonTemplateOverrideReset(ws, key) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  const k = (key || '').toString();
  if (dndSummonTemplateOverrides[k]) {
    const name = (DND_SUMMON_TEMPLATES[k] || {}).name || k;
    delete dndSummonTemplateOverrides[k];
    dndAddLog(`♻️ DM รีเซ็ตสัตว์อัญเชิญ "${name}" กลับเป็นค่าเริ่มต้นแล้ว`);
    dndBroadcastState();
  }
}
function dndHandleSkillUse(ws, skillId, targetType, targetId) {
  const p = dndFindByWs(ws);
  if (!p) return;
  if (!p.isDM && dndIsCharDead(p.character)) { dndSendError(ws, dndDeadMsgFor(p.character)); return; }
  const skill = dndFindUsableSkill(p, skillId);
  if (!skill) return;
  if (skill.locked) { dndSendError(ws, `สกิล "${skill.name}" จะปลดล็อกตอนเลเวล ${skill.level}`); return; }
  const allowed = p.isDM || (skill.assignedIds && skill.assignedIds.includes(p.id)) || (!skill.libraryOnly && (!skill.assignedIds || skill.assignedIds.length === 0));
  if (!allowed) { dndSendError(ws, 'คุณไม่มีสิทธิ์ใช้สกิลนี้'); return; }
  // จำกัดคลาส (ไม่บังคับ) — DM ใช้ได้เสมอไม่ถูกจำกัด ผู้เล่นต้องเป็นคลาสที่ระบุไว้ถึงจะใช้สกิลนี้ได้ (allowedClasses ว่างเปล่า = ทุกคลาสใช้ได้)
  if (!p.isDM && !dndSkillClassAllowed(skill, p.character && p.character.classKey)) {
    dndSendError(ws, `สกิล "${skill.name}" ใช้ได้เฉพาะคลาส: ${dndAllowedClassesText(skill.allowedClasses)}`);
    return;
  }
  // จำกัดเลเวล (เฉพาะสกิลจากสมุดเวทย์ / ร้านห้องสมุด เท่านั้น) — เลเวลตัวละครต้อง >= เลเวลสกิลถึงจะร่ายได้ (แบบสะสม)
  // สกิลประจำคลาสไม่โดนเงื่อนไขนี้ (มีระบบปลดล็อกตามเลเวลของตัวเองอยู่แล้วผ่าน skill.locked ด้านบน)
  // DM แก้เกณฑ์นี้ได้อยู่แล้วผ่านช่อง "เวทย์เลเวล" ตอนสร้าง/แก้สกิลในร้านห้องสมุด (skill.level) — ไม่ต้องเพิ่มช่องใหม่
  if (!p.isDM && skill.libraryOnly) {
    const requiredLevel = Number(skill.level) || 0;
    const myLevel = Math.max(1, Math.floor(Number(p.character && p.character.level) || 1));
    if (myLevel < requiredLevel) {
      dndSendError(ws, `สกิล "${skill.name}" ต้องเลเวลตัวละคร ${requiredLevel} ขึ้นไปถึงจะใช้ได้ (ตอนนี้เลเวล ${myLevel})`);
      return;
    }
  }
  if (!p.isDM && dndTurnOrderModule.getTurnIndex() >= 0 && dndCurrentTurnPlayerId() !== p.id) {
    dndSendError(ws, 'ยังไม่ถึงตาคุณ รอให้ถึงตาก่อนถึงจะใช้สกิลได้');
    return;
  }

  const target = dndFindCombatTarget(targetType, targetId, p.id);
  if (!target) { dndSendError(ws, 'กรุณาเลือกเป้าหมายที่ถูกต้อง'); return; }
  const isHealSkill = skill.healDie > 0;
  const isCleanseSkill = !!skill.cleanseEnabled;
  // targetMode: 'both' (ใช้กับใครก็ได้ทั้งมอนสเตอร์/ผู้เล่น — DM เลือกไว้ตอนสร้าง/แก้สกิล), 'player', หรือ 'monster'
  // สกิลเก่าที่ยังไม่มีค่านี้ (สร้างไว้ก่อนอัปเดต) จะ fallback ไปใช้กฎเดิม: ฮีล/ลบล้างสถานะ/บัฟเพื่อน = ผู้เล่นเท่านั้น, นอกนั้น = มอนสเตอร์เท่านั้น
  const skillTargetMode = dndSkillTargetMode(skill);
  if (skillTargetMode === 'player' && target.type !== 'player') { dndSendError(ws, `สกิล "${skill.name}" ตั้งค่าให้ใช้กับผู้เล่นเท่านั้น`); return; }
  if (skillTargetMode === 'monster' && target.type !== 'token') { dndSendError(ws, `สกิล "${skill.name}" ตั้งค่าให้ใช้กับมอนสเตอร์เท่านั้น`); return; }
  if (skillTargetMode === 'self' && (target.type !== 'player' || target.id !== p.id)) { dndSendError(ws, `สกิล "${skill.name}" ใช้ได้กับตัวเองเท่านั้น`); return; }
  // สกิล "ฟื้นฟู" ธรรมดา (healRevive = false) ใช้ปลุกคนหมดสติไม่ได้เด็ดขาด — ต้องเป็นสกิล "ชุบชีวิต" ที่ DM ตั้งค่าไว้โดยเฉพาะเท่านั้น (เหมือนไอเทม heal/revive)
  // (มอนสเตอร์ไม่มีสถานะ "หมดสติ" แบบผู้เล่น จึงเช็คเฉพาะตอนเป้าหมายเป็นผู้เล่นเท่านั้น)
  // เป้าหมายตายถาวรจากการโอเวอร์คิล (โดนดาเมจครั้งเดียว >= 2 เท่าของเลือดสูงสุด) — สกิลชุบใช้ปลุกไม่ได้เด็ดขาด แม้จะเป็นสกิล "ชุบชีวิต" ก็ตาม
  if (isHealSkill && target.type === 'player' && target.permaDead) {
    dndSendError(ws, `${target.name} ตายถาวรแล้ว (โดนโอเวอร์คิลเกิน 2 เท่าของเลือดสูงสุด) สกิล "${skill.name}" ใช้ปลุกไม่ได้ ต้องรอ DM เพิ่ม HP ให้เท่านั้น`);
    return;
  }
  if (isHealSkill && target.type === 'player' && target.dead && !skill.healRevive) {
    dndSendError(ws, `สกิล "${skill.name}" ฟื้นฟู HP เท่านั้น ใช้ปลุก ${target.name} ที่หมดสติไม่ได้ — ต้องใช้สกิลชุบชีวิตแทน (ให้ DM ตั้งค่าสกิลประเภท "ชุบชีวิต")`);
    return;
  }

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
    // ตรวจ SP (Skill Point / Mana) ให้พอก่อนใช้สกิล — ถ้าสกิลนี้ไม่ใช้ SP เลย (spCost 0) จะข้ามการเช็กนี้ไปเลย
    if (skill.spCost > 0) {
      const curSp = Math.round(Number(p.character.sp) || 0);
      if (curSp < skill.spCost) {
        dndSendError(ws, `SP ไม่พอใช้สกิล "${skill.name}" (ต้องใช้ ${skill.spCost} SP ตอนนี้มี ${curSp} SP)`);
        return;
      }
    }
    // ตรวจไอเทมที่สกิลนี้ต้องใช้ประกอบ (ถ้ามี) — ต้องมีในกระเป๋าครบตามจำนวนที่ DM ตั้งไว้ถึงจะใช้สกิลได้ (เช็คก่อนใช้จริง ไม่หักถ้ายังไม่พอ)
    if (skill.reqItemName) {
      const bag = dndSanitizeBag(p.character.bag);
      const have = (bag.find(it => it.name === skill.reqItemName) || {}).qty || 0;
      if (have < skill.reqItemQty) {
        dndSendError(ws, `ต้องมี "${skill.reqItemName}" x${skill.reqItemQty} ถึงจะใช้สกิล "${skill.name}" ได้ (ตอนนี้มี ${have} ชิ้น)`);
        return;
      }
    }
    // ตรวจระยะโจมตี (skill.range หน่วยจำนวนช่องตาราง, 0 = ไม่จำกัด) — วัดระยะห่างจริงบนแผนที่ระหว่าง token ผู้ใช้กับ token เป้าหมาย (พิกัดหน่วย % ของแผนที่ 0-100 ทั้งสองแกน เหมือน AOE)
    // แปลงระยะที่ DM ตั้งไว้ (ช่อง) เป็น % ของแผนที่ปัจจุบันก่อนเทียบ โดยอิงขนาดช่องตาราง (gridSize) ของแผนที่ปัจจุบันเสมอ (ดู dndRangeCellsToPercent)
    // ถ้าฝ่ายใดฝ่ายหนึ่งไม่มี token อยู่บนแผนที่ปัจจุบัน (ยังไม่ได้วาง/เล่นแบบไม่ใช้แผนที่) จะไม่ตรวจระยะให้ ปล่อยผ่านเหมือนเดิม
    if (skill.range > 0) {
      const casterPos = dndTargetMapPos('player', p.id);
      const targetPos = dndTargetMapPos(target.type, target.id);
      if (casterPos && targetPos) {
        const dist = Math.hypot(targetPos.x - casterPos.x, targetPos.y - casterPos.y);
        const cellPct = dndRangeCellsToPercent(1);
        if (dist > skill.range * cellPct) {
          dndSendError(ws, `เป้าหมายอยู่ไกลเกินระยะโจมตีของสกิล "${skill.name}" (ระยะที่ตั้งไว้ ${skill.range} ช่อง แต่ห่างจริง ${(dist / cellPct).toFixed(1)} ช่อง) ให้เข้าใกล้เป้าหมายก่อนแล้วค่อยใช้สกิลนี้`);
          return;
        }
      }
    }
  }

  // ---- สกิลอัญเชิญ (isSummon): แยก flow ออกไปเลยตรงนี้ ก่อนเข้า logic โจมตี/ฮีล/ดีบัฟด้านล่างทั้งหมด
  // เพราะการ์ตอนอัญเชิญไม่มีการทอยโจมตี/ดาเมจ/ติดสถานะแบบสกิลทั่วไป — สิ่งที่ต้องทำคือ spawn token มอนสเตอร์ตัวใหม่ลงแผนที่แทน
  // (ผ่านการตรวจสอบทั่วไปทั้งหมดด้านบนมาแล้ว: สิทธิ์ใช้สกิล/คลาส/เลเวล/ตา/คูลดาวน์/จำนวนครั้ง/SP/ไอเทม/ระยะ เหลือแค่เช็คโควตาอัญเชิญ + สร้าง token จริง)
  if (skill.isSummon) {
    const tpl = dndSummonTemplateByKey(skill.summonTemplateKey);
    if (!tpl) { dndSendError(ws, `สกิล "${skill.name}" ยังไม่มีข้อมูลสัตว์อัญเชิญผูกไว้ (ติดต่อ DM)`); return; }
    const casterName = p.character.charName || p.name;
    // จำกัดจำนวนที่อัญเชิญพร้อมกันได้ต่อสกิลนี้ (skill.summonMaxActive) — นับเฉพาะตัวที่ยังไม่หมดอายุ/ยังไม่ตายของผู้เล่นคนนี้จากสกิลนี้เท่านั้น
    const maxActive = Math.max(1, Math.round(Number(skill.summonMaxActive) || 1));
    const activeCount = dndTokens.filter(tt => tt.kind === 'npc' && tt.summoned && tt.ownerId === p.id && tt.summonSkillId === skill.id).length;
    if (activeCount >= maxActive) {
      dndSendError(ws, `อัญเชิญจากสกิล "${skill.name}" ได้พร้อมกันสูงสุด ${maxActive} ตัว (ตอนนี้มีอยู่ครบแล้ว) ต้องรอตัวเดิมหมดเวลาหรือถูกปราบก่อน`);
      return;
    }
    // spawn ใกล้ตำแหน่ง token ของผู้ร่ายบนแผนที่ปัจจุบัน (เยื้องไปเล็กน้อยกันซ้อนทับพอดี) — ถ้าหาตำแหน่งผู้ร่ายไม่เจอ (ยังไม่มี token/ไม่อยู่แผนที่นี้) ใช้ตำแหน่งสุ่มแทนเหมือน token ทั่วไป
    const casterPos = dndTargetMapPos('player', p.id);
    const pos = casterPos
      ? { x: Math.max(0, Math.min(100, casterPos.x + 4)), y: Math.max(0, Math.min(100, casterPos.y + 4)) }
      : dndRandomTokenPos();
    const attacks = (tpl.attacks || []).map(a => Object.assign({ id: dndNextAttackId++ }, dndSanitizeAttackPayload(a)));
    const durationSec = Math.max(0, Math.round(Number(skill.summonDurationSec) || 0));
    const newTokenId = dndNextTokenId++;
    dndTokens.push({
      id: newTokenId, kind: 'npc', ownerId: p.id, name: `${tpl.name} (${casterName})`, color: tpl.color, image: null,
      x: pos.x, y: pos.y, mapId: dndCurrentMapId, size: tpl.size || 'normal',
      hp: tpl.maxHp, maxHp: tpl.maxHp, ac: tpl.ac,
      str: tpl.str, dex: tpl.dex, con: tpl.con, int: tpl.int, wis: tpl.wis, cha: tpl.cha,
      attacks, statuses: [], expReward: 0, goldReward: 0, loot: [], statusResist: tpl.statusResist || 0,
      // ฟิลด์เฉพาะ token อัญเชิญ — summonSkillId ไว้เช็คโควตาต่อสกิล (ด้านบน), summonExpiresAt ไว้ให้ระบบลบทิ้งอัตโนมัติเมื่อหมดเวลา (โมดูลถัดไป)
      summoned: true, summonSkillId: skill.id,
      summonExpiresAt: durationSec > 0 ? Date.now() + durationSec * 1000 : 0,
    });
    dndAppendTurnEntryIfActive('npc', newTokenId);

    if (!p.isDM) {
      p.skillUsedCount = p.skillUsedCount || {};
      p.skillUsedCount[skill.id] = ((p.skillUsedCount[skill.id]) || 0) + 1;
      if (skill.cooldownSec > 0) {
        p.skillReadyAt = p.skillReadyAt || {};
        p.skillReadyAt[skill.id] = Date.now() + skill.cooldownSec * 1000;
      }
      if (skill.spCost > 0) {
        p.character.sp = Math.max(0, Math.round((Number(p.character.sp) || 0) - skill.spCost));
      }
      if (skill.reqItemName) {
        dndBagRemove(p.character, skill.reqItemName, skill.reqItemQty);
      }
    }

    dndAddLog(`🔮 ${casterName} ร่ายสกิล "${skill.name}" อัญเชิญ "${tpl.name}" เข้าสนามรบ! (HP ${tpl.maxHp}, AC ${tpl.ac}${durationSec > 0 ? `, อยู่ได้ ${durationSec} วิ` : ''})`);
    return;
  }

  const charName = p.character.charName || p.name;
  const parts = [];
  let attackRoll = null, attackMod = 0, attackTotal = null, hit = null, crit = false, fumble = false;
  const passive = dndCharPassiveEffect(p.character);
  const statusMods = dndStatusMods(p.character && p.character.statuses);
  const hasAttackRoll = !isHealSkill && !isCleanseSkill && skill.stat && DND_SKILL_STATS.includes(skill.stat);
  // ตัวช่วยโดนแน่นอน (guaranteedHit) — DM เป็นคนตั้งค่านี้ไว้ตอนสร้าง/แก้สกิลเท่านั้น (ไม่ใช่ผู้เล่นเลือกตอนใช้)
  // ถ้าเปิดไว้ สกิลนี้จะข้ามการทอย 1d20 vs AC / ทอยโอกาสโดน (d100) ไปเลยทุกครั้งที่มีคนใช้ ถือว่าโดนเป้าหมายทันที (แต่ไม่นับเป็นคริติคอล) แล้วไปทอยดาเมจต่อตามปกติ
  const wantForceHit = !!skill.guaranteedHit;
  if (hasAttackRoll) {
    if (wantForceHit) {
      attackRoll = null; attackMod = 0; attackTotal = null; hit = true; crit = false; fumble = false;
      parts.push(`🎯 ใช้ตัวช่วยโดนแน่นอน — ข้ามทอย 1d20 vs AC ${target.ac} — ✅ โดน (ไม่นับคริติคอล)`);
    } else {
      const score = Number(p.character[skill.stat]) || 10;
      const mod = dndAbilityMod(score) + passive.atk + statusMods.atk;
      const modStr = mod ? (mod > 0 ? ` +${mod}` : ` ${mod}`) : '';
      const roll = 1 + Math.floor(Math.random() * 20);
      const res = dndRollVsAC(roll, mod, target.ac, passive.critRange);
      attackRoll = roll; attackMod = mod; attackTotal = res.total; hit = res.hit; crit = res.crit; fumble = res.fumble;
      const hitTag = fumble ? ' 💨 พลาดสุด ๆ' : (!hit ? ' 🛡️ พลาด! หลบได้' : (crit ? ' 🎯 คริติคอล!' : ' ✅ โดน'));
      parts.push(`🎯 โจมตี 1d20${modStr} = [${roll}]${modStr} = ${res.total} vs AC ${target.ac} —${hitTag}`);
    }
  }
  // สกิลที่ไม่ได้ผูกสเตตัส (จึงไม่มีการทอยโจมตีวัด AC ด้านบน) — ใช้โอกาสโดน (hitChance) แทน ทอย d100 เทียบดู
  // ไม่ใช้กับสกิลชุบ/ลบล้างสถานะ/บัฟเพื่อน เพราะเป็นการให้พรไม่ใช่การโจมตี จึงติดเสมอเหมือนเดิม
  const hasHitChance = !isHealSkill && !isCleanseSkill && !skill.buffAlly && !hasAttackRoll;
  if (hasHitChance) {
    const chance = dndSanitizeHitChance(skill.hitChance);
    if (wantForceHit && chance < 100) {
      hit = true;
      parts.push(`🎯 ใช้ตัวช่วยโดนแน่นอน — ข้ามทอยโอกาสโดน ${chance}% — ✅ โดน!`);
    } else {
      const roll = 1 + Math.floor(Math.random() * 100);
      hit = roll <= chance;
      if (chance < 100) parts.push(`🎲 โอกาสโดน ${chance}%: ทอยได้ ${roll} — ${hit ? '✅ โดน!' : '❌ พลาด!'}`);
    }
  }
  // ผลสรุปว่าสกิลนี้ "โดน" เป้าหมายหรือไม่ (ใช้คุมว่าจะคิดดาเมจ/ติดสถานะหรือไม่) — สกิลชุบ/ลบล้างสถานะ/บัฟเพื่อนไม่มีโอกาสพลาด จึงถือว่าโดนเสมอ
  const skillLands = (hasAttackRoll || hasHitChance) ? hit : true;
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
  if (skill.dmgDie && !isHealSkill && skillLands) {
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

    // ---- AOE: ถ้าสกิลตั้งรัศมีไว้ (>0) ให้กระจายดาเมจไปยังเป้าหมายอื่น ๆ ในพื้นที่รอบเป้าหมายหลักบนแผนที่ด้วย (วงกลม หรือเส้นตรงจากตัวผู้ใช้ไปยังเป้าหมายหลัก)
    // ดาเมจจะลดหลั่นเป็นเส้นตรงตามระยะห่างจากพื้นที่นั้น: ระยะ 0 = โดนเต็ม ระยะเท่ารัศมี(ความกว้าง) = ดาเมจ 0
    if (skill.aoeRadius > 0 && damage > 0) {
      const center = dndTargetMapPos(target.type, target.id);
      const origin = skill.aoeShape === 'line' ? dndTargetMapPos('player', p.id) : null;
      if (center && (skill.aoeShape !== 'line' || origin)) {
        const aoeParts = [];
        for (const cand of dndAoeCandidates()) {
          if (cand.type === target.type && cand.id === target.id) continue; // เป้าหมายหลักโดนดาเมจเต็มไปแล้วด้านบน ไม่ต้องนับซ้ำ
          if (skill.aoeShape === 'line' && cand.type === 'player' && cand.id === p.id) continue; // เส้นเริ่มจากตัวผู้ร่ายเอง กันไม่ให้โดนดาเมจตัวเอง
          const dist = dndAoeDist(skill.aoeShape, origin, center, cand.pos);
          if (dist > skill.aoeRadius) continue; // อยู่นอกพื้นที่ ไม่โดน
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
        if (aoeParts.length) parts.push(`🌊 AOE${skill.aoeShape === 'line' ? 'เส้นตรง' : 'รัศมี'} ${skill.aoeRadius}: ${aoeParts.join(', ')}`);
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
  // ดีบัฟใส่ศัตรู: มีโอกาสติด (statusChance ของสกิล) หักด้วยค่าต้านทานของมอนสเตอร์ (statusResist) แล้วทอย d100 เทียบ — ไม่ติด 100% เสมอไปแบบเดิมอีกต่อไป
  // บัฟใส่เพื่อน (buffAlly): ติดเสมอ ไม่มีการทอย/ต้านทาน เพราะเป็นการให้พรตัวเอง/ปาร์ตี้ ไม่ใช่การโจมตี
  if (skill.statusName && skillLands) {
    const isBuffApply = !!skill.buffAlly;
    const chance = Number(skill.statusChance) || 100;
    let resist = 0;
    if (!isBuffApply && target.type === 'token') {
      const rawToken = dndTokens.find(tt => tt.id === target.id);
      resist = Math.max(0, Math.min(100, Number(rawToken && rawToken.statusResist) || 0));
    } else if (!isBuffApply && target.type === 'player') {
      // เดิมผู้เล่นไม่มีค่าต้านทานสถานะเลย (ไม่ว่าเผ่าไหน) ต่างจากมอนสเตอร์ที่ DM ตั้งได้ — ตอนนี้ผู้เล่นก็มี statusResist เหมือนกันแล้ว (ดู server/dnd/character.js)
      const rawPlayer = dndPlayers.find(pp => pp.id === target.id);
      resist = Math.max(0, Math.min(100, Number(rawPlayer && rawPlayer.character && rawPlayer.character.statusResist) || 0));
    }
    const effChance = isBuffApply ? 100 : Math.max(0, Math.min(100, chance - resist));
    const statusRoll = 1 + Math.floor(Math.random() * 100);
    const landed = isBuffApply || statusRoll <= effChance;
    const rollTag = (chance < 100 || resist > 0) ? ` (🎲 ${statusRoll} vs ${effChance}%${resist ? ` — โอกาส ${chance}% หักต้านทาน ${resist}%` : ''})` : '';
    if (landed) {
      const statusTarget = dndFindStatusTarget(target.type, target.id);
      if (statusTarget) {
        // ต่อวิ (tick): ใช้ค่าที่ตั้งไว้ตอนออกแบบสกิล (statusTickValue/statusTickIntervalSec) คำนวณ expiresAt/nextTickAt ตอนติดจริง
        // เหมือนกับตอน DM มอบสถานะเองมือทุกประการ (ดู dndHandleStatusApply) — สกิลผู้เล่นจึงมีดีบัฟ/บัฟต่อเนื่อง (พิษ/ไฟลุก/รีเจน ฯลฯ) ได้เหมือนกัน
        const durationSec = Number(skill.statusDurationSec) || 0;
        const expiresAt = durationSec > 0 ? Date.now() + durationSec * 1000 : 0;
        const tickValue = Number(skill.statusTickValue) || 0;
        const tickIntervalSec = tickValue !== 0 ? (Number(skill.statusTickIntervalSec) || 6) : 0;
        const nextTickAt = tickValue !== 0 ? Date.now() + tickIntervalSec * 1000 : 0;
        statusTarget.list.push({
          id: dndAllocStatusId(), name: skill.statusName, note: skill.statusNote,
          durationSec, expiresAt,
          atkMod: Number(skill.statusAtkMod) || 0, dmgMod: Number(skill.statusDmgMod) || 0, defMod: Number(skill.statusDefMod) || 0, visionMod: Number(skill.statusVisionMod) || 0,
          tickValue, tickIntervalSec, nextTickAt,
          icon: skill.statusIcon || '☠️', color: skill.statusColor || '',
        });
        parts.push(`☠️ ติดสถานะ "${skill.statusName}"${skill.statusNote ? ` (${skill.statusNote})` : ''} ให้ ${target.name}${rollTag}${dndBuildStatusModText(skill.statusAtkMod, skill.statusDmgMod, skill.statusDefMod, tickValue, tickIntervalSec, skill.statusVisionMod)}`);
      }
    } else {
      parts.push(`🛡️ ${target.name} ต้านทานสถานะ "${skill.statusName}" ได้สำเร็จ!${rollTag}`);
    }
  }
  const dealtDamage = skill.dmgDie && !isHealSkill && skillLands;
  if (attackRoll !== null || dealtDamage) {
    dndBroadcastAttackAnim({
      atkKey: 'p' + p.id,
      attacker: charName, target: target.name, targetType: target.type, skillName: skill.name,
      atkTokenId: dndPcTokenId(p.id), tgtTokenId: target.type === 'token' ? target.id : dndPcTokenId(target.id),
      attackRoll, attackMod, attackTotal, targetAC: target.ac, hit, crit, fumble,
      dmgDie: dealtDamage ? skill.dmgDie : null, dmgCount: dealtDamage ? dmgRolls.length : 0, dmgRolls: dealtDamage ? dmgRolls : null, dmgMod: (skill.dmgMod || 0) + passive.dmg + statusMods.dmg, damage: dealtDamage ? damage : null,
      aoeRadius: skill.aoeRadius || 0, aoeShape: skill.aoeRadius > 0 ? (skill.aoeShape || 'circle') : 'circle', aoeHits: aoeHitsForAnim,
    });
  }
  if (!p.isDM) {
    p.skillUsedCount = p.skillUsedCount || {};
    p.skillUsedCount[skill.id] = ((p.skillUsedCount[skill.id]) || 0) + 1;
    if (skill.cooldownSec > 0) {
      p.skillReadyAt = p.skillReadyAt || {};
      p.skillReadyAt[skill.id] = Date.now() + skill.cooldownSec * 1000;
    }
    // หัก SP ตามที่สกิลนี้กำหนด (ถ้ามี) — เช็กว่าพอแล้วก่อนหน้านี้แล้วตอนต้นฟังก์ชัน
    if (skill.spCost > 0) {
      p.character.sp = Math.max(0, Math.round((Number(p.character.sp) || 0) - skill.spCost));
      parts.push(`🔵 ใช้ SP ${skill.spCost} (เหลือ ${p.character.sp}/${p.character.maxSp})`);
    }
    // หักไอเทมที่สกิลนี้ต้องใช้ประกอบ (ถ้ามี) — เช็กว่ามีพอแล้วก่อนหน้านี้แล้วตอนต้นฟังก์ชัน
    if (skill.reqItemName) {
      dndBagRemove(p.character, skill.reqItemName, skill.reqItemQty);
      parts.push(`📦 ใช้ "${skill.reqItemName}" x${skill.reqItemQty}`);
    }
  }

  if (parts.length) dndAddLog(`✨ ${charName} ใช้สกิล "${skill.name}" ใส่ ${target.name}: ${parts.join(' | ')}`);
  else dndAddLog(`✨ ${charName} ใช้สกิล "${skill.name}" ใส่ ${target.name}`);
}

function dndHandleNormalAttack(ws, targetType, targetId) {
  const p = dndFindByWs(ws);
  if (!p || p.isDM) return;
  if (dndIsCharDead(p.character)) { dndSendError(ws, dndDeadMsgFor(p.character)); return; }
  if (dndTurnOrderModule.getTurnIndex() >= 0 && dndCurrentTurnPlayerId() !== p.id) {
    dndSendError(ws, 'ยังไม่ถึงตาคุณ รอให้ถึงตาก่อนถึงจะโจมตีได้');
    return;
  }
  const target = dndFindCombatTarget(targetType, targetId);
  if (!target || target.hp <= 0) { dndSendError(ws, 'กรุณาเลือกเป้าหมายที่ยังมี HP'); return; }
  const c = p.character || {};
  const na = c.normalAttack || DND_NORMAL_ATTACK_DEFAULT;
  const naName = na.name || DND_NORMAL_ATTACK_DEFAULT.name;
  const naStat = (na.stat === 'auto' || DND_STAT_KEYS.includes(na.stat)) ? na.stat : 'auto';
  const naDmgDie = DND_VALID_DICE.includes(Number(na.dmgDie)) ? Number(na.dmgDie) : DND_NORMAL_ATTACK_DEFAULT.dmgDie;
  const naDmgCount = Math.max(1, Math.min(20, Math.round(Number(na.dmgCount) || 1)));
  const naAtkBonus = Math.round(Number(na.atkBonus) || 0);
  const naDmgBonus = Math.round(Number(na.dmgBonus) || 0);
  const naRange = dndSanitizeAttackRangeCells(na.range);
  const naReqItemName = (na.reqItemName || '').toString();
  const naReqItemQty = naReqItemName ? (Math.max(1, Math.min(999, Math.round(Number(na.reqItemQty) || 1)))) : 0;
  // ตรวจไอเทมที่ท่าโจมตีปกตินี้ต้องใช้ประกอบ (ถ้ามี) — ต้องมีในกระเป๋าครบตามจำนวนที่ DM ตั้งไว้ถึงจะโจมตีได้ (เช็คก่อนโจมตีจริง ไม่หักถ้ายังไม่พอ) เหมือนระบบสกิล
  if (naReqItemName) {
    const bag = dndSanitizeBag(p.character.bag);
    const have = (bag.find(it => it.name === naReqItemName) || {}).qty || 0;
    if (have < naReqItemQty) {
      dndSendError(ws, `ต้องมี "${naReqItemName}" x${naReqItemQty} ถึงจะใช้ "${naName}" ได้ (ตอนนี้มี ${have} ชิ้น)`);
      return;
    }
  }
  // ระยะโจมตี (หน่วยจำนวนช่องตาราง): ถ้า DM ตั้งค่าไว้ (>0) ต้องเช็คระยะห่างบนแผนที่ปัจจุบันก่อนโจมตี — 0 = ไม่จำกัดระยะ (พฤติกรรมเดิม)
  // แปลงเป็น % ของแผนที่ปัจจุบันก่อนเทียบ โดยอิงขนาดช่องตาราง (gridSize) ปัจจุบันเสมอ (ดู dndRangeCellsToPercent)
  if (naRange > 0) {
    const atkPos = dndTargetMapPos('player', p.id);
    const tgtPos = dndTargetMapPos(target.type, target.id);
    if (atkPos && tgtPos) {
      const dist = Math.hypot(tgtPos.x - atkPos.x, tgtPos.y - atkPos.y);
      const cellPct = dndRangeCellsToPercent(1);
      if (dist > naRange * cellPct) {
        dndSendError(ws, `เป้าหมายอยู่นอกระยะโจมตี (ระยะโจมตี ${naRange} ช่อง, ห่าง ${(dist / cellPct).toFixed(1)} ช่อง)`);
        return;
      }
    }
  }
  const strMod = dndAbilityMod(Number(c.str) || 10);
  const dexMod = dndAbilityMod(Number(c.dex) || 10);
  const abilityMod = naStat === 'auto' ? Math.max(strMod, dexMod) : dndAbilityMod(Number(c[naStat]) || 10);
  const equipAtk = dndTotalAttack(c.equipment);
  const passive = dndCharPassiveEffect(c);
  const statusMods = dndStatusMods(c.statuses);
  const mod = abilityMod + equipAtk + passive.atk + statusMods.atk + naAtkBonus;
  const attackRoll = 1 + Math.floor(Math.random() * 20);
  const res = dndRollVsAC(attackRoll, mod, target.ac, passive.critRange);
  const modStr = mod >= 0 ? ` +${mod}` : ` ${mod}`;
  let damage = 0, damageRolls = [];
  if (res.hit) {
    const dmg = dndRollDamage(naDmgDie, naDmgCount, mod + passive.dmg + statusMods.dmg + naDmgBonus, res.crit);
    damage = dmg.damage; damageRolls = dmg.rolls;
    const oldHp = target.hp;
    target.applyDamage(damage);
    if (target.type === 'token') dndCheckTokenDefeat(dndTokens.find(tt => tt.id === target.id), p);
    void oldHp;
  }
  const hitTag = res.fumble ? ' | 💨 พลาดสุด ๆ (ทอยได้ 1)' : (!res.hit ? ' | 🛡️ พลาด! หลบได้' : (res.crit ? ' | 🎯 คริติคอล!' : ' | ✅ โดน'));
  // หักไอเทมที่ท่าโจมตีปกตินี้ต้องใช้ประกอบ (ถ้ามี) — เช็กว่ามีพอแล้วก่อนหน้านี้แล้วตอนต้นฟังก์ชัน หักไม่ว่าจะโจมตีโดนหรือพลาด (เหมือนระบบสกิล)
  let itemPart = '';
  if (naReqItemName) {
    dndBagRemove(p.character, naReqItemName, naReqItemQty);
    itemPart = ` | 📦 ใช้ "${naReqItemName}" x${naReqItemQty}`;
  }
  // ไม่บอกเลือดที่เหลือของมอนสเตอร์ในข้อความแชท — ผู้เล่นจะไม่รู้ HP มอนสเตอร์จากตรงนี้
  const hpPart = (res.hit && target.type !== 'token') ? ` | ❤️ ${target.name} HP ${target.hp + damage} → ${target.hp}` : '';
  const dmgPart = res.hit ? ` | 💥 ${damageRolls.length}d${naDmgDie}${modStr} = [${damageRolls.join(', ')}]${modStr} = ${damage}` : '';
  dndAddLog(`⚔️ ${c.charName || p.name} ใช้ "${naName}" ใส่ ${target.name}: 🎯 1d20${modStr} = [${attackRoll}] = ${res.total} vs AC ${target.ac}${hitTag}${dmgPart}${hpPart}${itemPart}`);
  dndBroadcastAttackAnim({
    atkKey: 'p' + p.id,
    attacker: c.charName || p.name, target: target.name, targetType: target.type,
    atkTokenId: dndPcTokenId(p.id), tgtTokenId: target.type === 'token' ? target.id : dndPcTokenId(target.id),
    attackRoll, attackMod: mod, attackTotal: res.total, targetAC: target.ac, hit: res.hit, crit: res.crit, fumble: res.fumble,
    dmgDie: res.hit ? naDmgDie : null, dmgCount: res.hit ? damageRolls.length : 0, dmgRolls: res.hit ? damageRolls : null, dmgMod: mod, damage: res.hit ? damage : null,
  });
}

// ---- แผนที่การต่อสู้ (Battle Map): ผู้เล่นลากได้แค่ token ตัวเอง, DM ลากได้ทุกอันและสร้าง/ลบ NPC ได้ ----
function dndHandleTokenMove(ws, id, x, y) {
  const p = dndFindByWs(ws);
  if (!p) return;
  const t = dndTokens.find(tt => tt.id === Number(id));
  if (!t) return;
  // เจ้าของ token: ตัวละครผู้เล่นเอง (kind 'pc') หรือสัตว์อัญเชิญที่ตัวเองร่ายไว้ (kind 'npc' ที่ summoned + ownerId ตรงกัน)
  const isOwner = (t.kind === 'pc' && t.ownerId === p.id) || (t.kind === 'npc' && !!t.summoned && t.ownerId === p.id);
  if (!p.isDM && !isOwner) return;
  if (isOwner && dndIsCharDead(p.character)) { dndSendError(ws, dndDeadMsgFor(p.character)); return; }
  // ผู้เล่น (ไม่ใช่ DM) ขยับ token ตัวเองได้เฉพาะตอนที่กำลังนับเทิร์นอยู่ (turnIndex >= 0) และถึงตาของ "entry นี้โดยเฉพาะ" เท่านั้น
  // ตัวละครผู้เล่นกับสัตว์อัญเชิญของเขาเป็นคนละ entry ในลำดับเทิร์น (kind ต่างกัน) จึงต้องเช็คให้ตรง entry จริงๆ ไม่ใช่แค่ "ถึงตาของผู้เล่นคนนี้หรือยัง" เฉยๆ
  // แถมขยับได้แค่ "ครั้งเดียวต่อตา" (เทียบ step ปัจจุบันกับ step ล่าสุดที่เคยขยับไปแล้ว) กันลากวนไปมาไม่จำกัดตลอดทั้งตา
  // ถ้ายังไม่ได้กด "เริ่มเทิร์น" เลย (turnIndex === -1) อนุญาตให้ขยับได้อิสระเหมือนเดิม (ตอนเตรียมฉาก/นอกรอบต่อสู้)
  if (isOwner && !p.isDM && dndTurnOrderModule.getTurnIndex() >= 0) {
    const entry = dndCurrentTurnEntry();
    const myEntryNow = !!entry && ((t.kind === 'pc' && entry.kind === 'pc' && entry.id === p.id) || (t.kind === 'npc' && entry.kind === 'npc' && entry.id === t.id));
    if (!myEntryNow) {
      dndSendError(ws, t.kind === 'npc' ? 'ยังไม่ถึงตาของสัตว์อัญเชิญตัวนี้ รอให้ถึงตาก่อนถึงจะขยับได้' : 'ยังไม่ถึงตาคุณ รอให้ถึงตาก่อนถึงจะขยับ token ได้');
      return;
    }
    const step = dndTurnOrderModule.getStepId();
    if (p.dndMovedAtStep === step) {
      dndSendError(ws, 'ขยับ token ได้แค่ครั้งเดียวต่อตา รอตาหน้าค่อยขยับใหม่');
      return;
    }
    p.dndMovedAtStep = step;
  }
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
  // ค่าต้านทานสถานะ/ดีบัฟ (%) — หักออกจากโอกาสติดสถานะของสกิลที่ใช้ใส่มอนสเตอร์ตัวนี้ (0 = ไม่ต้านทานเลย เหมือนพฤติกรรมเดิม)
  const statusResist = Math.max(0, Math.min(100, Math.round(Number(payload.statusResist) || 0)));
  const newTokenId = dndNextTokenId++;
  dndTokens.push({
    id: newTokenId, kind: 'npc', ownerId: null, name, color, image, x: pos.x, y: pos.y, mapId: dndCurrentMapId, size,
    hp: maxHp, maxHp, ac, ...stats, attacks, statuses: [], expReward, goldReward, loot, statusResist,
  });
  dndAppendTurnEntryIfActive('npc', newTokenId);
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
  const newTokenId = dndNextTokenId++;
  const copy = {
    id: newTokenId, kind: 'npc', ownerId: null,
    name: copyName, color: t.color, image: t.image || null,
    x: Math.max(0, Math.min(100, t.x + 4)), y: Math.max(0, Math.min(100, t.y + 4)), mapId: t.mapId,
    hp: t.maxHp, maxHp: t.maxHp, ac: t.ac, size: t.size || 'normal',
    str: t.str || 10, dex: t.dex || 10, con: t.con || 10, int: t.int || 10, wis: t.wis || 10, cha: t.cha || 10,
    attacks: (t.attacks || []).map(a => Object.assign({}, a, { id: dndNextAttackId++ })),
    statuses: [], // สถานะ/ดีบัฟไม่คัดลอกตามมา เพราะเป็นของเฉพาะตัวที่เกิดขึ้นระหว่างเล่น
    statusResist: t.statusResist || 0,
    expReward: t.expReward || 0, goldReward: t.goldReward || 0,
    loot: (t.loot || []).map(item => Object.assign({}, item, { id: dndNextLootId++ })),
  };
  dndTokens.push(copy);
  dndAppendTurnEntryIfActive('npc', newTokenId);
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
  if (p.isDM && t.kind === 'pc') {
    // วิสัยทัศน์ (fog of war): DM เท่านั้นที่กำหนดชนิด/รัศมีให้ token ผู้เล่นแต่ละคนได้ — ผู้เล่นแก้เองไม่ได้
    if (typeof updates.visionType === 'string' && DND_VISION_TYPES.includes(updates.visionType)) t.visionType = updates.visionType;
    if (updates.visionRadius !== undefined) {
      if (updates.visionRadius === null || updates.visionRadius === '') {
        t.visionRadius = null; // null = ใช้ค่ารัศมีตั้งต้นตามชนิดวิสัยทัศน์
      } else {
        const n = Number(updates.visionRadius);
        if (Number.isFinite(n)) t.visionRadius = Math.max(DND_VISION_RADIUS_CELLS_MIN, Math.min(DND_VISION_RADIUS_CELLS_MAX, Math.round(n * 10) / 10));
      }
    }
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
    if (updates.statusResist !== undefined) { const n = Number(updates.statusResist); if (Number.isFinite(n)) t.statusResist = Math.max(0, Math.min(100, Math.round(n))); }
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
  dndCleanTurnOrder();
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
  // รัศมี AOE (0-100, 0 = เป้าเดี่ยวปกติเหมือนเดิม) — ถ้าตั้งไว้ ดาเมจจะกระจายไปโดนผู้เล่นคนอื่นที่อยู่ในพื้นที่รอบเป้าหมายหลักบนแผนที่ด้วย เหมือนกลไก AOE ของสกิลผู้เล่น
  const aoeRadius = Math.max(0, Math.min(100, Math.round(Number(payload.aoeRadius) || 0)));
  // รูปแบบพื้นที่ AOE: 'circle' (ค่าเริ่มต้น) = วงกลมรอบเป้าหมายหลัก, 'line' = เส้นตรงพุ่งจากตัวมอนสเตอร์ไปยังเป้าหมายหลัก
  const aoeShape = dndSanitizeAoeShape(payload.aoeShape);
  // สถานะ/ดีบัฟที่ผูกกับท่านี้ (ไม่บังคับ) — ใช้ sanitizer ตัวเดียวกับสกิลผู้เล่นทุกประการ (โอกาสติด/ระยะเวลา/บัฟ-ดีบัฟ/tick/ไอคอน/สี)
  // เพื่อให้ท่าโจมตีมอนสเตอร์ติดสถานะให้ผู้เล่นได้เหมือนที่สกิลผู้เล่นติดสถานะให้มอนสเตอร์ได้ (ก่อนหน้านี้ท่าโจมตีมอนสเตอร์ไม่มีช่องนี้เลย มีแต่ดาเมจ)
  const status = dndSanitizeSkillStatus(payload.status);
  return {
    name, desc, stat, toHit, dmgDie, dmgCount, dmgMod, aoeRadius, aoeShape,
    statusName: status.name, statusNote: status.note, statusChance: status.chance, statusDurationSec: status.durationSec,
    statusAtkMod: status.atkMod, statusDmgMod: status.dmgMod, statusDefMod: status.defMod, statusVisionMod: status.visionMod,
    statusTickValue: status.tickValue, statusTickIntervalSec: status.tickIntervalSec, statusIcon: status.icon, statusColor: status.color,
  };
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
// ทอยท่าโจมตีของมอนสเตอร์ (DM สั่งได้ทุกตัว, เจ้าของสัตว์อัญเชิญสั่งได้เฉพาะตัวเอง) — ทอยแล้วประกาศผลลง log ให้ทุกคนเห็น (คนสั่งเป็นคนหักเลือดเป้าหมายเองหลังเห็นผล)
function dndHandleTokenAttackUse(ws, tokenId, attackId, targetType, targetId) {
  const p = dndFindByWs(ws);
  if (!p) return;
  const t = dndTokens.find(tt => tt.id === Number(tokenId) && tt.kind === 'npc');
  if (!t || !t.attacks) return;
  // เจ้าของสัตว์อัญเชิญสั่งท่าโจมตีของสัตว์ตัวเองได้ด้วย (นอกจาก DM) — มอนสเตอร์ของ DM ทั่วไป (ไม่มี ownerId) ยังคง DM สั่งได้เท่านั้นเหมือนเดิม
  const isOwner = !!t.summoned && t.ownerId === p.id;
  if (!p.isDM && !isOwner) return;
  if (isOwner && dndIsCharDead(p.character)) { dndSendError(ws, dndDeadMsgFor(p.character)); return; }
  // เจ้าของสั่งโจมตีได้เฉพาะตอนถึงตาของสัตว์อัญเชิญตัวนี้โดยเฉพาะเท่านั้น (entry แยกจากตาตัวเอง) — DM ไม่ผูกกับเงื่อนไขนี้ สั่งได้ตลอดเหมือนเดิม
  if (isOwner && !p.isDM && dndTurnOrderModule.getTurnIndex() >= 0) {
    const entry = dndCurrentTurnEntry();
    if (!entry || entry.kind !== 'npc' || entry.id !== t.id) {
      dndSendError(ws, 'ยังไม่ถึงตาของสัตว์อัญเชิญตัวนี้ รอให้ถึงตาก่อนถึงจะสั่งโจมตีได้');
      return;
    }
  }
  const atk = t.attacks.find(a => a.id === Number(attackId));
  if (!atk) return;
  const target = dndFindCombatTarget(targetType, targetId);
  if (!target) { dndSendError(ws, 'กรุณาเลือกเป้าหมายที่ยังมี HP'); return; }
  if (isOwner) {
    // สัตว์อัญเชิญของผู้เล่น: โจมตีได้ทั้งผู้เล่น (ถ้า DM ปล่อยให้ตีเพื่อนได้) และมอนสเตอร์/npc token อื่น ๆ (ห้ามเลือกตัวเอง)
    if (target.type === 'token' && target.id === t.id) { dndSendError(ws, 'เลือกเป้าหมายอื่นที่ไม่ใช่ตัวเอง'); return; }
  } else {
    // มอนสเตอร์ของ DM (ไม่ใช่สัตว์อัญเชิญ ไม่มีเจ้าของ): โจมตีได้เฉพาะผู้เล่นเหมือนเดิม
    if (target.type !== 'player') { dndSendError(ws, 'มอนสเตอร์ต้องเลือกเป้าหมายเป็นผู้เล่น'); return; }
  }

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

    // ---- AOE: ถ้าท่านี้ตั้งรัศมีไว้ (>0) ดาเมจจะกระจายไปโดนผู้เล่นคนอื่นที่อยู่ในพื้นที่รอบเป้าหมายหลักบนแผนที่ด้วย (ไม่โดนมอนสเตอร์ตัวอื่น กันมั่ว)
    // ดาเมจลดหลั่นตามระยะห่างจากพื้นที่นั้น (วงกลม หรือเส้นตรงจากตัวมอนสเตอร์ไปยังเป้าหมายหลัก) เหมือนกลไก AOE ของสกิลผู้เล่น
    if (atk.aoeRadius > 0 && damage > 0) {
      const center = dndTargetMapPos(target.type, target.id);
      const origin = atk.aoeShape === 'line' ? { x: t.x, y: t.y } : null;
      if (center) {
        const aoeParts = [];
        for (const cand of dndAoeCandidates()) {
          if (cand.type !== 'player') continue; // มอนสเตอร์โจมตี AOE โดนเฉพาะผู้เล่น ไม่โดนมอนสเตอร์ด้วยกันเอง
          if (cand.id === Number(targetId)) continue; // เป้าหมายหลักโดนดาเมจเต็มไปแล้วด้านบน ไม่ต้องนับซ้ำ
          const dist = dndAoeDist(atk.aoeShape, origin, center, cand.pos);
          if (dist > atk.aoeRadius) continue; // อยู่นอกพื้นที่ ไม่โดน
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
        if (aoeParts.length) parts.push(`🌊 AOE${atk.aoeShape === 'line' ? 'เส้นตรง' : 'รัศมี'} ${atk.aoeRadius}: ${aoeParts.join(', ')}`);
      }
    }
  }
  // ติดสถานะ/ดีบัฟที่ผูกไว้กับท่านี้ (ถ้ามี) ให้ผู้เล่นเป้าหมาย — ต้องโจมตีโดนก่อน (res.hit) เหมือนดาเมจ ไม่ใช่ติดฟรีทุกครั้งที่ทอย
  // มีโอกาสติด (atk.statusChance) หักด้วยค่าต้านทานสถานะของผู้เล่น (character.statusResist) แล้วทอย d100 เทียบ — กลไกเดียวกับตอนสกิลผู้เล่นติดสถานะใส่มอนสเตอร์ทุกประการ
  if (atk.statusName && res.hit) {
    const chance = Number(atk.statusChance) || 100;
    const targetPlayer = dndPlayers.find(pp => pp.id === Number(targetId));
    const resist = Math.max(0, Math.min(100, Number(targetPlayer && targetPlayer.character && targetPlayer.character.statusResist) || 0));
    const effChance = Math.max(0, Math.min(100, chance - resist));
    const statusRoll = 1 + Math.floor(Math.random() * 100);
    const landed = statusRoll <= effChance;
    const rollTag = (chance < 100 || resist > 0) ? ` (🎲 ${statusRoll} vs ${effChance}%${resist ? ` — โอกาส ${chance}% หักต้านทาน ${resist}%` : ''})` : '';
    if (landed) {
      const statusTarget = dndFindStatusTarget('player', targetId);
      if (statusTarget) {
        const durationSec = Number(atk.statusDurationSec) || 0;
        const expiresAt = durationSec > 0 ? Date.now() + durationSec * 1000 : 0;
        const tickValue = Number(atk.statusTickValue) || 0;
        const tickIntervalSec = tickValue !== 0 ? (Number(atk.statusTickIntervalSec) || 6) : 0;
        const nextTickAt = tickValue !== 0 ? Date.now() + tickIntervalSec * 1000 : 0;
        statusTarget.list.push({
          id: dndAllocStatusId(), name: atk.statusName, note: atk.statusNote,
          durationSec, expiresAt,
          atkMod: Number(atk.statusAtkMod) || 0, dmgMod: Number(atk.statusDmgMod) || 0, defMod: Number(atk.statusDefMod) || 0, visionMod: Number(atk.statusVisionMod) || 0,
          tickValue, tickIntervalSec, nextTickAt,
          icon: atk.statusIcon || '☠️', color: atk.statusColor || '',
        });
        parts.push(`☠️ ติดสถานะ "${atk.statusName}"${atk.statusNote ? ` (${atk.statusNote})` : ''} ให้ ${target.name}${rollTag}${dndBuildStatusModText(atk.statusAtkMod, atk.statusDmgMod, atk.statusDefMod, tickValue, tickIntervalSec, atk.statusVisionMod)}`);
      }
    } else {
      parts.push(`🛡️ ${target.name} ต้านทานสถานะ "${atk.statusName}" ได้สำเร็จ!${rollTag}`);
    }
  }
  dndBroadcastAttackAnim({
    atkKey: 't' + t.id,
    attacker: t.name, target: target.name, targetType: target.type, attackName: atk.name,
    atkTokenId: t.id, tgtTokenId: target.type === 'token' ? target.id : dndPcTokenId(target.id),
    attackRoll: hitRoll, attackMod: effToHit, attackTotal: res.total, targetAC: target.ac, hit: res.hit, crit: res.crit, fumble: res.fumble,
    dmgDie: dealtDamage ? atk.dmgDie : null, dmgCount: dealtDamage ? rolls.length : 0, dmgRolls: dealtDamage ? rolls : null, dmgMod: effDmgMod, damage: dealtDamage ? damage : null,
    aoeRadius: atk.aoeRadius || 0, aoeShape: atk.aoeRadius > 0 ? (atk.aoeShape || 'circle') : 'circle', aoeHits: aoeHitsForAnim,
  });
  dndAddLog(`👹 "${t.name}" ใช้ท่า "${atk.name}" ใส่ ${target.name}: ${parts.join(' | ')}`);
}
// ---- สถานะดีบัฟ: DM เป็นคนมอบ/ถอนให้ผู้เล่นหรือ NPC token คนไหนก็ได้ (dndFindStatusTarget/sanitize duration/mod/tick
// ย้ายไปอยู่ที่ server/dnd/status-effects.js แล้ว — module 5, destructure ไว้เป็นชื่อเดิมแล้วด้านบน) ----
// hitChance: โอกาสที่สกิล (ที่ไม่ได้ผูกสเตตัส จึงไม่มีการทอยโจมตีวัด AC) จะโดนเป้าหมายหรือไม่ — ทอย d100 เทียบค่านี้ก่อนคิดดาเมจ/ติดสถานะ
// 1-100, ค่าเริ่มต้น 100 = โดนเสมอเหมือนพฤติกรรมเดิมก่อนมีฟีเจอร์นี้ (สกิลเก่าที่ไม่มีค่านี้จะถือว่าเป็น 100 เหมือนเดิมทุกประการ)
function dndSanitizeHitChance(raw) {
  return Math.max(1, Math.min(100, Math.round(Number(raw) || 100) || 100));
}
// dndSanitizeStatusIcon/dndSanitizeStatusColor ย้ายไปอยู่ที่ server/dnd/status-effects.js แล้ว (module 5)
// icon: อีโมจิ/สัญลักษณ์ประจำสกิลที่ DM ออกแบบ (ไม่บังคับ) — ไม่ใส่มาก็ใช้ ✨ เป็นค่าเริ่มต้น
function dndSanitizeSkillIcon(raw) {
  const s = (raw || '').toString().trim().slice(0, 4);
  return s || '✨';
}
// dndBuildStatusModText / dndHandleStatusApply / dndHandleStatusRemove / dndHandleStatusEdit / dndSweepExpiredStatuses
// ย้ายไปอยู่ที่ server/dnd/status-effects.js แล้ว (module 5, destructure ไว้เป็นชื่อเดิมแล้วด้านบน)
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
// แชทด่วน (Ctrl+K) — ช่องแชทแยกต่างหากจากบันทึกการทอย/แชทหลัก ไม่บันทึกลง dndLog และไม่มีประวัติย้อนหลัง
// (ผู้เล่นที่เพิ่งเปิดโอเวอร์เลย์จะไม่เห็นข้อความเก่าก่อนหน้า เหมือนหน้าต่างแชทสด ๆ)
function dndHandleQuickChat(ws, text) {
  const p = dndFindByWs(ws);
  if (!p) return;
  const trimmed = (text || '').toString().trim().slice(0, 300);
  if (!trimmed) return;
  for (const pp of dndPlayers) {
    if (pp.ws && pp.ws.readyState === WebSocket.OPEN) {
      pp.ws.send(JSON.stringify({ type: 'dndQuickChat', name: p.character.charName || p.name, text: trimmed }));
    }
  }
}
// ส่งข้อความตอบกลับแบบส่วนตัว (เห็นเฉพาะคนพิมพ์คำสั่งเอง) — ใช้กับผลลัพธ์คำสั่ง /
function dndSendCommandResult(ws, text) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'dndCommandResult', text }));
  }
}
// คำสั่งที่ขึ้นต้นด้วย "/" จากแชทด่วน — ไม่ broadcast เป็นข้อความแชท ไม่บันทึกลง log ที่คนอื่นเห็น
// รองรับ: /game mode 0 (กลับเป็นผู้เล่นปกติ), /game mode 1 (แอบเป็น DM คนที่สอง — คนอื่นยังมองว่าเป็นผู้เล่นปกติ)
function dndHandleCommand(ws, rawText) {
  const p = dndFindByWs(ws);
  if (!p) return;
  const body = (rawText || '').toString().trim().replace(/^\//, '').trim();
  const tokens = body.split(/\s+/).filter(Boolean);

  if (tokens[0] === 'game' && tokens[1] === 'mode' && (tokens[2] === '0' || tokens[2] === '1')) {
    if (tokens[2] === '1') {
      if (p.isDM && !p.secretDM) {
        dndSendCommandResult(ws, '⚠️ คุณเป็น DM อยู่แล้ว');
        return;
      }
      p.isDM = true;
      p.secretDM = true;
      dndSendCommandResult(ws, '🕵️ เปิดโหมด DM (ลับ) แล้ว — คนอื่นจะยังมองว่าคุณเป็นผู้เล่นปกติ');
    } else {
      if (!p.secretDM) {
        dndSendCommandResult(ws, '⚠️ คุณไม่ได้อยู่ในโหมด DM ลับ');
        return;
      }
      p.isDM = false;
      p.secretDM = false;
      dndSendCommandResult(ws, '↩️ กลับเป็นผู้เล่นปกติแล้ว');
    }
    dndBroadcastState();
    return;
  }

  dndSendCommandResult(ws, '❓ คำสั่งไม่ถูกต้อง — ใช้ /game mode 0 หรือ /game mode 1');
}
// DM เท่านั้นที่รีเซตห้องได้ทั้งหมด — ล้างผู้เล่น/การ์ดตัวละคร/บันทึก/สกิลทั้งหมด แล้วเด้งทุกคน (รวม DM เอง) กลับไปหน้าเข้าห้อง
function dndHandleRestart(ws) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  const everyone = dndPlayers.slice();
  dndPlayers = [];
  dndLog = [];
  dndNextId = 1;
  dndSeedSpellbookLibrary(); // รีเซตกลับไปเป็นห้องสมุดเวทย์เริ่มต้น (สกิล+ร้านห้องสมุด) แทนที่จะล้างเป็นค่าว่างเปล่า
  dndCustomPassives = [];
  dndRacePassiveOverrides = {};
  dndSummonTemplateOverrides = {};
  dndNextPassiveId = 1;
  dndScene = { location: '', situation: '' };
  dndGameTimeModule.reset();
  dndMaps = cloneDefaultMaps();
  dndNextMapId = Math.max(0, ...DEFAULT_MAPS.map(m => m.id)) + 1;
  dndCurrentMapId = DEFAULT_MAPS[0] ? DEFAULT_MAPS[0].id : 1;
  dndVisionEnabled = false;
  dndPartyVisionShared = false;
  dndPartyVisionGroups = [];
  dndNextPartyVisionGroupId = 1;
  dndTokens = [];
  dndNextTokenId = 1;
  dndNextAttackId = 1;
  dndStatusEffectsModule.reset();
  dndWalls = [];
  dndNextWallId = 1;
  dndTurnOrderModule.reset();
  dndTradeModule.reset();
  const payload = JSON.stringify({ type: 'dndLeft' });
  for (const pp of everyone) {
    if (pp.ws && pp.ws.readyState === WebSocket.OPEN) pp.ws.send(payload);
  }
}
// ============================================================
// บันทึกเกม / โหลดเกม: DM กดบันทึกสถานะห้องทั้งหมด (ผู้เล่น/การ์ดตัวละคร/แผนที่/token/ร้านค้า/เวลาในเกม ฯลฯ)
// ออกมาเป็นไฟล์ .json เก็บไว้ในเครื่อง แล้วเอาไฟล์นั้นกลับมาโหลดทีหลังเพื่อเล่นต่อจากจุดเดิมได้
// (เช่น ปิดเซิร์ฟเวอร์ไปแล้วเปิดใหม่ หรือย้ายไปรันที่เครื่องอื่น) — ทำได้เฉพาะ DM เท่านั้น
// ============================================================
// รวมสถานะทั้งหมดของห้องเป็นก้อนข้อมูลเดียวที่ JSON.stringify ได้ตรงๆ (ตัด ws ออกเพราะ serialize ไม่ได้)
function dndSerializeState() {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    players: dndPlayers.map(p => ({
      id: p.id, name: p.name, isDM: p.isDM, character: p.character,
    })),
    nextId: dndNextId,
    log: dndLog,
    skills: dndSkills,
    nextSkillId: dndNextSkillId,
    customPassives: dndCustomPassives,
    racePassiveOverrides: dndRacePassiveOverrides,
    summonTemplateOverrides: dndSummonTemplateOverrides,
    nextPassiveId: dndNextPassiveId,
    scene: dndScene,
    ...dndGameTimeModule.serialize(),
    maps: dndMaps,
    nextMapId: dndNextMapId,
    currentMapId: dndCurrentMapId,
    visionEnabled: dndVisionEnabled,
    partyVisionShared: dndPartyVisionShared,
    partyVisionGroups: dndPartyVisionGroups,
    nextPartyVisionGroupId: dndNextPartyVisionGroupId,
    tokens: dndTokens,
    nextTokenId: dndNextTokenId,
    nextAttackId: dndNextAttackId,
    ...dndStatusEffectsModule.serialize(),
    nextLootId: dndNextLootId,
    walls: dndWalls,
    nextWallId: dndNextWallId,
    ...dndTurnOrderModule.serialize(),
    shops: dndShops,
    nextShopId: dndNextShopId,
    nextShopItemId: dndNextShopItemId,
    ...dndTradeModule.serialize(),
    itemEffects: dndItemEffects,
    nextItemEffectId: dndNextItemEffectId,
  };
}
// DM กดปุ่ม "บันทึกเกมเป็นไฟล์" — ส่งก้อนข้อมูลสถานะทั้งหมดกลับไปให้เบราว์เซอร์ของ DM คนที่ขอเท่านั้น
// (ฝั่ง client จะเป็นคนสร้างไฟล์ .json ให้ดาวน์โหลดจากข้อมูลนี้)
function dndHandleExportState(ws) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) { dndSendError(ws, 'เฉพาะ DM เท่านั้นที่บันทึกเกมเป็นไฟล์ได้'); return; }
  const snapshot = dndSerializeState();
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'dndExportState', data: snapshot }));
  dndAddLog(`💾 ${p.character.charName || p.name} (DM) บันทึกสถานะห้องทั้งหมดเป็นไฟล์`);
}
// DM เลือกไฟล์เซฟที่เคยบันทึกไว้ (จากปุ่ม "โหลดเกมจากไฟล์") มาแทนที่สถานะห้องทั้งหมดตอนนี้
// ผู้เล่นทุกคน (รวม DM ที่กดโหลด) จะหลุดกลับไปหน้าหลักเหมือนตอนกด "รีเซตห้องทั้งหมด" แล้วต้องกลับเข้ามา
// "นั่งที่เดิม" ผ่านรายชื่อที่นั่งกันใหม่ทุกคน — เพราะที่นั่งในไฟล์เซฟถูก mark เป็น "ยังไม่ได้เชื่อมต่อ" เสมอ
function dndHandleImportState(ws, data) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) { dndSendError(ws, 'เฉพาะ DM เท่านั้นที่โหลดไฟล์เซฟได้'); return; }
  if (!data || typeof data !== 'object') { dndSendError(ws, 'ไฟล์เซฟไม่ถูกต้องหรือเสียหาย อ่านข้อมูลไม่ได้'); return; }

  const rawPlayers = Array.isArray(data.players) ? data.players : [];
  const newPlayers = rawPlayers
    .filter(pl => pl && typeof pl === 'object' && Number.isFinite(Number(pl.id)))
    .map(pl => ({
      id: Number(pl.id),
      ws: null,
      name: (pl.name || 'ผู้เล่น').toString().slice(0, 16),
      isDM: !!pl.isDM,
      connected: false,
      character: dndEnsureCharacterDefaults((pl.character && typeof pl.character === 'object') ? pl.character : newDndCharacter(pl.name || 'ผู้เล่น')),
    }));
  if (!newPlayers.length) { dndSendError(ws, 'ไฟล์เซฟนี้ไม่มีข้อมูลผู้เล่นเลย โหลดไม่ได้'); return; }
  // ต้องมี DM อย่างน้อย 1 คนเสมอ ไม่งั้นห้องจะไม่มีใครคุมได้ — ถ้าไฟล์เพี้ยนไม่มี DM เลย ให้คนแรกในลิสต์เป็น DM แทน
  if (!newPlayers.some(pp => pp.isDM)) newPlayers[0].isDM = true;

  const everyone = dndPlayers.slice(); // เก็บรายชื่อคนที่ต่ออยู่ตอนนี้ไว้ก่อน เพื่อเด้งทุกคนกลับหน้าหลัก

  dndPlayers = newPlayers;
  dndNextId = Number.isFinite(Number(data.nextId)) ? Number(data.nextId) : (Math.max(0, ...dndPlayers.map(pp => pp.id)) + 1);
  dndLog = Array.isArray(data.log) ? data.log.slice(-500) : [];
  dndSkills = Array.isArray(data.skills) ? data.skills : [];
  dndNextSkillId = Number.isFinite(Number(data.nextSkillId)) ? Number(data.nextSkillId) : 1;
  dndCustomPassives = Array.isArray(data.customPassives) ? data.customPassives : [];
  dndRacePassiveOverrides = {};
  if (data.racePassiveOverrides && typeof data.racePassiveOverrides === 'object') {
    for (const [key, ov] of Object.entries(data.racePassiveOverrides)) {
      const [raceKey, passiveKey] = key.split(':');
      const builtin = (DND_RACE_PASSIVES[raceKey] || []).find(bp => bp.key === passiveKey);
      if (builtin && ov && typeof ov === 'object') {
        dndRacePassiveOverrides[key] = {
          name: (ov.name || '').toString().trim().slice(0, 40) || builtin.name,
          icon: (ov.icon || '✨').toString().trim().slice(0, 4) || '✨',
          desc: (ov.desc || '').toString().trim().slice(0, 150),
          effect: dndSanitizePassiveEffect(ov.effect),
        };
      }
    }
  }
  dndSummonTemplateOverrides = {};
  if (data.summonTemplateOverrides && typeof data.summonTemplateOverrides === 'object') {
    for (const [key, ov] of Object.entries(data.summonTemplateOverrides)) {
      if (DND_SUMMON_TEMPLATES[key] && ov && typeof ov === 'object') {
        dndSummonTemplateOverrides[key] = dndSanitizeSummonTemplatePayload(ov);
      }
    }
  }
  dndNextPassiveId = Number.isFinite(Number(data.nextPassiveId)) ? Number(data.nextPassiveId) : 1;
  dndScene = (data.scene && typeof data.scene === 'object')
    ? { location: (data.scene.location || '').toString(), situation: (data.scene.situation || '').toString() }
    : { location: '', situation: '' };
  dndGameTimeModule.restore(data);
  dndMaps = (Array.isArray(data.maps) && data.maps.length) ? data.maps : cloneDefaultMaps();
  // เซฟเก่าก่อนมีระบบ "ขนาดช่องแผนที่" จะไม่มีฟิลด์นี้ — ตั้งค่าเริ่มต้นให้เหมือนพฤติกรรมเดิม (10x10 ช่อง)
  for (const m of dndMaps) {
    const g = Number(m.gridSize);
    m.gridSize = (Number.isFinite(g) && g >= DND_MAP_GRID_MIN && g <= DND_MAP_GRID_MAX) ? g : DND_MAP_GRID_DEFAULT;
  }
  dndNextMapId = Number.isFinite(Number(data.nextMapId)) ? Number(data.nextMapId) : (Math.max(0, ...dndMaps.map(m => m.id)) + 1);
  dndCurrentMapId = (Number.isFinite(Number(data.currentMapId)) && dndMaps.some(m => m.id === Number(data.currentMapId)))
    ? Number(data.currentMapId)
    : (dndMaps[0] ? dndMaps[0].id : 1);
  dndVisionEnabled = !!data.visionEnabled;
  dndPartyVisionShared = !!data.partyVisionShared;
  dndPartyVisionGroups = Array.isArray(data.partyVisionGroups)
    ? data.partyVisionGroups
        .filter(g => g && typeof g === 'object' && Number.isFinite(Number(g.id)))
        .map(g => ({ id: Number(g.id), playerIds: Array.isArray(g.playerIds) ? g.playerIds.map(Number).filter(Number.isFinite) : [] }))
    : [];
  dndNextPartyVisionGroupId = Number.isFinite(Number(data.nextPartyVisionGroupId)) ? Number(data.nextPartyVisionGroupId) : (Math.max(0, ...dndPartyVisionGroups.map(g => g.id)) + 1);
  dndTokens = Array.isArray(data.tokens) ? data.tokens : [];
  // โมดูล 6 (Save/Load backward-compat): เซฟเก่าก่อนมีระบบสัตว์อัญเชิญ (โมดูล 1-5) จะไม่มีฟิลด์ summoned/summonExpiresAt/summonSkillId
  // เลยแม้แต่ตัวเดียว (และ token npc บางไฟล์เซฟเก่ามากๆ อาจไม่มี ownerId ด้วยซ้ำ) — เติมค่าเริ่มต้นให้ครบทุก token ตรงนี้
  // ครั้งเดียวตอนโหลด กันไม่ให้โค้ดจุดอื่นในไฟล์ต้องเจอ undefined ที่ไม่ตั้งใจ (แม้ส่วนใหญ่จะเช็คแบบ truthy อยู่แล้วซึ่งปลอดภัยกับ
  // undefined เหมือนกับ false แต่ normalize ให้ชัดเจนตรงนี้จุดเดียวย่อมกันเหนียวกว่าไปหวังพึ่ง falsy-check กระจายอยู่หลายที่)
  for (const t of dndTokens) {
    if (!t || typeof t !== 'object') continue;
    if (t.kind === 'npc' && !('ownerId' in t)) t.ownerId = null; // เซฟเก่ามากๆ ก่อนมี ownerId บน npc เลยก็เป็นไปได้
    t.summoned = !!t.summoned;
    const exp = Number(t.summonExpiresAt);
    t.summonExpiresAt = Number.isFinite(exp) && exp > 0 ? exp : 0;
    if (!t.summoned) {
      // token npc ปกติของ DM (ไม่ใช่สัตว์อัญเชิญ) ไม่ควรมีเศษฟิลด์อัญเชิญค้างอยู่ กันสับสนตอนอ่านข้อมูลทีหลัง
      t.summonExpiresAt = 0;
      delete t.summonSkillId;
    } else if (!t.summonSkillId) {
      t.summonSkillId = null;
    }
  }
  dndNextTokenId = Number.isFinite(Number(data.nextTokenId)) ? Number(data.nextTokenId) : 1;
  dndNextAttackId = Number.isFinite(Number(data.nextAttackId)) ? Number(data.nextAttackId) : 1;
  dndStatusEffectsModule.restore(data);
  dndNextLootId = Number.isFinite(Number(data.nextLootId)) ? Number(data.nextLootId) : 1;
  dndWalls = Array.isArray(data.walls) ? data.walls : [];
  dndNextWallId = Number.isFinite(Number(data.nextWallId)) ? Number(data.nextWallId) : 1;
  dndTurnOrderModule.restore(data);
  dndShops = Array.isArray(data.shops) ? data.shops : [];
  dndNextShopId = Number.isFinite(Number(data.nextShopId)) ? Number(data.nextShopId) : 1;
  dndNextShopItemId = Number.isFinite(Number(data.nextShopItemId)) ? Number(data.nextShopItemId) : 1;
  dndTradeModule.restore(data);
  dndItemEffects = (Array.isArray(data.itemEffects) && data.itemEffects.length) ? data.itemEffects : dndDefaultItemEffectsInit();
  dndNextItemEffectId = Number.isFinite(Number(data.nextItemEffectId)) ? Number(data.nextItemEffectId) : 1;

  dndEnsureSpellbookLibraryPresent(); // เซฟเก่าที่ไม่มีห้องสมุดเวทย์อยู่ (บันทึกไว้ก่อนมีฟีเจอร์นี้) จะได้ห้องสมุด 574 เล่มกลับมาอัตโนมัติ

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
  dndAddLog(`${p.character.charName || p.name} ออกจากที่นั่ง${(p.isDM && !p.secretDM) ? ' (DM)' : ''} — เลือกกลับเข้านั่งที่เดิมได้จากรายชื่อที่นั่งว่างตอนเข้าห้อง`);
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'dndLeft' }));
}
// DM ลบผู้เล่นออกจากห้องอย่างถาวร (ต่างจากออกจากที่นั่งเอง เพราะที่นั่ง/การ์ดตัวละครจะหายไปเลย เข้ามาใหม่ต้องสร้างใหม่)
function dndHandleDmKickPlayer(ws, targetId) {
  const p = dndFindByWs(ws);
  if (!p || !p.isDM) return;
  const idx = dndPlayers.findIndex(pp => pp.id === Number(targetId));
  if (idx === -1) return;
  const target = dndPlayers[idx];
  if (target.isDM) { dndSendError(ws, 'ไม่สามารถลบ DM ได้'); return; }
  const name = target.character.charName || target.name;
  if (target.ws && target.ws.readyState === WebSocket.OPEN) {
    target.ws.send(JSON.stringify({ type: 'dndKicked' }));
    target.ws.close();
  }
  // โมดูล 4 (Lifecycle/Despawn): เตะผู้เล่นออกจากห้องถาวร = "ออกจากเกม" ตามสเปก ลบทั้ง token ตัวละคร (pc) และสัตว์อัญเชิญที่ยังค้างอยู่ (npc summoned) ของคนนั้นทันที
  dndTokens = dndTokens.filter(t => !(t.kind === 'pc' && t.ownerId === target.id) && !(t.kind === 'npc' && t.summoned && t.ownerId === target.id));
  dndSkills.forEach(s => { if (s.assignedIds) s.assignedIds = s.assignedIds.filter(id => id !== target.id); });
  dndPlayers.splice(idx, 1);
  dndCleanTurnOrder();
  dndAddLog(`🚫 DM ลบผู้เล่น "${name}" ออกจากห้องแล้ว`);
}
function dndHandleDisconnect(ws) {
  const p = dndPlayers.find(pp => pp.ws === ws);
  if (!p) return;
  p.connected = false;
  p.ws = null;
  // เช่นเดียวกับออกจากที่นั่งเอง — ไม่มีการโอนบทบาท DM ให้ใคร ที่นั่งยังรออยู่
  dndAddLog(`${p.character.charName || p.name} หลุดการเชื่อมต่อ${(p.isDM && !p.secretDM) ? ' (DM) — เลือกกลับเข้านั่งที่เดิมได้จากรายชื่อที่นั่งว่าง' : ''}`);
}
// dndHandleGiveItem, dndHandleTakeItem → ย้ายไปที่ server/dnd/bag.js (ผูกกลับเข้ามาผ่าน ctx)
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
  if (oldItem && oldItem.name) dndBagAdd(c, oldItem.name, 1, true); // force: กันของที่สวมอยู่หายเพราะกระเป๋าเต็มพอดี
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
  dndBagAdd(c, item.name, 1, true); // force: กันของที่สวมอยู่หายเพราะกระเป๋าเต็มพอดี
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
  else if (msg.type === 'dndSpendStatPoint') dndHandleSpendStatPoint(ws, msg.stat);
  else if (msg.type === 'dndDmUpdate') dndHandleDmUpdate(ws, msg.targetId, msg.updates);
  else if (msg.type === 'dndDmKickPlayer') dndHandleDmKickPlayer(ws, msg.targetId);
  else if (msg.type === 'dndRoll') dndHandleRoll(ws, msg.die, msg.count, msg.modifier, msg.label, msg.stat);
  else if (msg.type === 'dndChat') dndHandleChat(ws, msg.text);
  else if (msg.type === 'dndQuickChat') dndHandleQuickChat(ws, msg.text);
  else if (msg.type === 'dndCommand') dndHandleCommand(ws, msg.text);
  else if (msg.type === 'dndSkillCreate') dndHandleSkillCreate(ws, msg.skill);
  else if (msg.type === 'dndSkillEdit') dndHandleSkillEdit(ws, msg.skillId, msg.skill);
  else if (msg.type === 'dndSkillDelete') dndHandleSkillDelete(ws, msg.skillId);
  else if (msg.type === 'dndClassSkillOverrideSave') dndHandleClassSkillOverrideSave(ws, msg.targetId, msg.skillId, msg.skill);
  else if (msg.type === 'dndClassSkillOverrideReset') dndHandleClassSkillOverrideReset(ws, msg.targetId, msg.skillId);
  else if (msg.type === 'dndPassiveCreate') dndHandlePassiveCreate(ws, msg.passive);
  else if (msg.type === 'dndPassiveEdit') dndHandlePassiveEdit(ws, msg.passiveId, msg.passive);
  else if (msg.type === 'dndPassiveDelete') dndHandlePassiveDelete(ws, msg.passiveId);
  else if (msg.type === 'dndRacePassiveOverrideSave') dndHandleRacePassiveOverrideSave(ws, msg.raceKey, msg.passiveKey, msg.passive);
  else if (msg.type === 'dndRacePassiveOverrideReset') dndHandleRacePassiveOverrideReset(ws, msg.raceKey, msg.passiveKey);
  else if (msg.type === 'dndSummonTemplateOverrideSave') dndHandleSummonTemplateOverrideSave(ws, msg.key, msg.template);
  else if (msg.type === 'dndSummonTemplateOverrideReset') dndHandleSummonTemplateOverrideReset(ws, msg.key);
  else if (msg.type === 'dndSkillUse') dndHandleSkillUse(ws, msg.skillId, msg.targetType, msg.targetId);
  else if (msg.type === 'dndNormalAttack') dndHandleNormalAttack(ws, msg.targetType, msg.targetId);
  else if (msg.type === 'dndEquipUpdate') dndHandleEquipUpdate(ws, msg.equipment);
  else if (msg.type === 'dndAppearanceUpdate') dndHandleAppearanceUpdate(ws, msg.appearance);
  else if (msg.type === 'dndShopCreate') dndHandleShopCreate(ws, msg.name, msg.shopType);
  else if (msg.type === 'dndShopRename') dndHandleShopRename(ws, msg.shopId, msg.name);
  else if (msg.type === 'dndShopToggleClosed') dndHandleShopToggleClosed(ws, msg.shopId);
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
  else if (msg.type === 'dndTimeAdvance') dndHandleTimeAdvance(ws, msg.minutes);
  else if (msg.type === 'dndTimeSkipDay') dndHandleTimeSkipDay(ws);
  else if (msg.type === 'dndTimeSet') dndHandleTimeSet(ws, msg.time);
  else if (msg.type === 'dndTimeAutoToggle') dndHandleTimeAutoToggle(ws, msg.running);
  else if (msg.type === 'dndTimeAutoSpeedSet') dndHandleTimeAutoSpeedSet(ws, msg.speed);
  else if (msg.type === 'dndTokenMove') dndHandleTokenMove(ws, msg.id, msg.x, msg.y);
  else if (msg.type === 'dndTokenCreate') dndHandleTokenCreate(ws, msg.token);
  else if (msg.type === 'dndTokenEdit') dndHandleTokenEdit(ws, msg.id, msg.updates);
  else if (msg.type === 'dndTokenDelete') dndHandleTokenDelete(ws, msg.id);
  else if (msg.type === 'dndTokenDuplicate') dndHandleTokenDuplicate(ws, msg.id);
  else if (msg.type === 'dndSummonDismiss') dndHandleSummonDismiss(ws, msg.tokenId);
  else if (msg.type === 'dndMapCreate') dndHandleMapCreate(ws, msg.name);
  else if (msg.type === 'dndVisionToggle') dndHandleVisionToggle(ws, msg.enabled);
  else if (msg.type === 'dndPartyVisionToggle') dndHandlePartyVisionToggle(ws, msg.enabled);
  else if (msg.type === 'dndPartyVisionGroupCreate') dndHandlePartyVisionGroupCreate(ws);
  else if (msg.type === 'dndPartyVisionGroupDelete') dndHandlePartyVisionGroupDelete(ws, msg.groupId);
  else if (msg.type === 'dndPartyVisionGroupPlayersUpdate') dndHandlePartyVisionGroupPlayersUpdate(ws, msg.groupId, msg.playerIds);
  else if (msg.type === 'dndMapSwitch') dndHandleMapSwitch(ws, msg.mapId);
  else if (msg.type === 'dndMapRename') dndHandleMapRename(ws, msg.mapId, msg.name);
  else if (msg.type === 'dndMapGridSizeUpdate') dndHandleMapGridSizeUpdate(ws, msg.mapId, msg.gridSize);
  else if (msg.type === 'dndMapDelete') dndHandleMapDelete(ws, msg.mapId);
  else if (msg.type === 'dndMapPlayersUpdate') dndHandleMapPlayersUpdate(ws, msg.mapId, msg.playerIds);
  else if (msg.type === 'dndWallCreate') dndHandleWallCreate(ws, msg.wall);
  else if (msg.type === 'dndWallDelete') dndHandleWallDelete(ws, msg.id);
  else if (msg.type === 'dndWallClear') dndHandleWallClear(ws);
  else if (msg.type === 'dndTokenAttackAdd') dndHandleTokenAttackAdd(ws, msg.tokenId, msg.attack);
  else if (msg.type === 'dndTokenAttackEdit') dndHandleTokenAttackEdit(ws, msg.tokenId, msg.attackId, msg.attack);
  else if (msg.type === 'dndTokenAttackDelete') dndHandleTokenAttackDelete(ws, msg.tokenId, msg.attackId);
  else if (msg.type === 'dndTokenAttackUse') dndHandleTokenAttackUse(ws, msg.tokenId, msg.attackId, msg.targetType, msg.targetId);
  else if (msg.type === 'dndStatusApply') dndHandleStatusApply(ws, msg.status);
  else if (msg.type === 'dndStatusRemove') dndHandleStatusRemove(ws, msg.status);
  else if (msg.type === 'dndStatusEdit') dndHandleStatusEdit(ws, msg.status);
  else if (msg.type === 'dndRestart') dndHandleRestart(ws);
  else if (msg.type === 'dndExportState') dndHandleExportState(ws);
  else if (msg.type === 'dndImportState') dndHandleImportState(ws, msg.data);
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
  // โมดูล 4: sweepExpiredStatuses (เดิมของสถานะ/บัฟ-ดีบัฟ) รวมเข้ากับ dndSweepExpiredSummons (เช็คสัตว์อัญเชิญหมดเวลา/เจ้าของหมดสติ-ตาย) ผ่าน dndSweepExpired
  // — ยัง export ชื่อเดิม sweepExpiredStatuses เหมือนเดิมทุกประการ เพราะ index.js เรียกผ่านชื่อนี้อยู่แล้ว (setInterval(dnd.sweepExpiredStatuses, 1000)) ไม่ต้องแก้ index.js
  sweepExpiredStatuses: dndSweepExpired,
};
