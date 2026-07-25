// ============================================================
// Combat math — ฟังก์ชันคำนวณล้วนๆ (pure) ที่แยกออกมาจาก dnd.js
// ไม่แตะ state ของห้อง (dndPlayers/dndTokens/...) เลย รับ input คืน output อย่างเดียว
// จึงทดสอบและย้ายออกมาได้ง่ายที่สุดเป็นโมดูลแรก
// ============================================================

const { POINT_BUY_MIN } = require('../data/point-buy');

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
    let score = Math.round(Number(pointBuy && pointBuy[k]));
    if (!Number.isFinite(score) || score < POINT_BUY_MIN) score = POINT_BUY_MIN;
    const rb = (race && race.bonus && race.bonus[k]) || 0;
    const cb = (cls && cls.bonus && cls.bonus[k]) || 0;
    stats[k] = score + rb + cb;
  }
  return stats;
}

module.exports = {
  dndAbilityMod,
  dndRandInt,
  dndRollVsAC,
  dndRollDamage,
  dndAcRange,
  dndHpRange,
  dndComputeFinalStats,
};
