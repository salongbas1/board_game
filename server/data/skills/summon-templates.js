// ============================================================
// สเตตัสบล็อกของ "สัตว์อัญเชิญ" — ใช้คู่กับสกิลสมุดเวทย์ที่มี isSummon: true
// (ดู server/data/skills/spellbook-skills.js ช่อง summonTemplateKey ที่ผูกกับ key ในไฟล์นี้)
//
// แต่ละ template คือสเตตัสบล็อกมอนสเตอร์ตัวเดียว รูปแบบเดียวกับ token npc ที่ DM สร้างเองผ่าน
// dndHandleTokenCreate (server/dnd.js) — id/x/y/mapId/ownerId ไม่ใส่ไว้ที่นี่ เพราะถูกกำหนดตอน
// spawn จริงตามตัวละครที่ร่าย/แผนที่/ตำแหน่งขณะนั้น (ทำในโมดูล 2: Cast-Summon Handler)
//
// dmgMod ของท่าโจมตีตั้งเป็น 0 โดยตั้งใจ — ดาเมจจริงจะมาจาก "ตัวปรับสเตตัส" (stat) ของ token
// บวกเพิ่มอัตโนมัติตอนคำนวณ (เหมือนมอนสเตอร์ทั่วไปทุกตัวในเกม) ส่วน toHit เป็นตัวปรับพิเศษ
// เพิ่มเติมจากสเตตัส ให้ความรู้สึกเหมือน "โบนัสความชำนาญ" ที่ขยับตามเลเวลของสกิล
// ============================================================

const DND_SUMMON_TEMPLATES = {
  // ---- เลเวล 2 ----
  beast: {
    name: 'วิญญาณสัตว์ป่า', icon: '🐺', color: '#9fdc9f', size: 'normal',
    maxHp: 18, ac: 12,
    str: 14, dex: 15, con: 12, int: 4, wis: 12, cha: 6,
    statusResist: 0,
    attacks: [
      { name: 'กัด', desc: 'ขย้ำด้วยเขี้ยวคม', stat: 'str', toHit: 2, dmgDie: 6, dmgCount: 1, dmgMod: 0, aoeRadius: 0, aoeShape: 'circle' },
    ],
  },

  // ---- เลเวล 3 ----
  fey: {
    name: 'นางฟ้าเฟย์', icon: '🧚', color: '#c792ea', size: 'normal',
    maxHp: 26, ac: 13,
    str: 8, dex: 16, con: 10, int: 12, wis: 14, cha: 16,
    statusResist: 0,
    attacks: [
      { name: 'มนตร์เฟย์', desc: 'สายมนตร์วิปริตจากดินแดนเฟย์', stat: 'cha', toHit: 3, dmgDie: 8, dmgCount: 1, dmgMod: 0, aoeRadius: 0, aoeShape: 'circle' },
    ],
  },
  lesser_demon: {
    name: 'ปีศาจชั้นต่ำ', icon: '👹', color: '#ff6b6b', size: 'normal',
    maxHp: 26, ac: 13,
    str: 15, dex: 13, con: 13, int: 9, wis: 9, cha: 11,
    statusResist: 0,
    attacks: [
      { name: 'กรงเล็บอสูร', desc: 'ตะปบด้วยกรงเล็บแหลมคม', stat: 'str', toHit: 3, dmgDie: 8, dmgCount: 1, dmgMod: 0, aoeRadius: 0, aoeShape: 'circle' },
    ],
  },
  shadowspawn: {
    name: 'เงามืด', icon: '🌑', color: '#82c9ff', size: 'normal',
    maxHp: 26, ac: 13,
    str: 10, dex: 17, con: 10, int: 9, wis: 12, cha: 11,
    statusResist: 0,
    attacks: [
      {
        name: 'จู่โจมเงา', desc: 'พุ่งจากเงาเข้าจู่โจมแล้วซ่อนตัวกลับ', stat: 'dex', toHit: 3, dmgDie: 8, dmgCount: 1, dmgMod: 0, aoeRadius: 0, aoeShape: 'circle',
        statusName: 'มืดบอด', statusNote: 'เงามืดบดบังสายตาชั่วคราว', statusChance: 40, statusDurationSec: 8,
        statusAtkMod: 0, statusDmgMod: 0, statusDefMod: 0, statusVisionMod: -2, statusTickValue: 0, statusTickIntervalSec: 0,
        statusIcon: '🌑', statusColor: '#3a3a55',
      },
    ],
  },
  undead: {
    name: 'ซากไร้วิญญาณ', icon: '💀', color: '#7ee8fa', size: 'normal',
    maxHp: 26, ac: 13,
    str: 13, dex: 8, con: 14, int: 6, wis: 8, cha: 5,
    statusResist: 0,
    attacks: [
      {
        name: 'สัมผัสเนโครติก', desc: 'มือเน่าเปื่อยที่ดูดพลังชีวิต', stat: 'str', toHit: 3, dmgDie: 8, dmgCount: 1, dmgMod: 0, aoeRadius: 0, aoeShape: 'circle',
        statusName: 'เนโครติก', statusNote: 'พลังชีวิตค่อยๆ ถูกกัดกร่อน', statusChance: 50, statusDurationSec: 12,
        statusAtkMod: 0, statusDmgMod: 0, statusDefMod: 0, statusVisionMod: 0, statusTickValue: -2, statusTickIntervalSec: 6,
        statusIcon: '☠️', statusColor: '#5a7a5a',
      },
    ],
  },
  warrior_spirit: {
    name: 'วิญญาณนักรบ (UA)', icon: '⚔️', color: '#f4a261', size: 'normal',
    maxHp: 26, ac: 13,
    str: 16, dex: 12, con: 13, int: 8, wis: 10, cha: 10,
    statusResist: 0,
    attacks: [
      { name: 'ฟันดาบวิญญาณ', desc: 'ฟาดดาบวิญญาณคมกริบ', stat: 'str', toHit: 3, dmgDie: 8, dmgCount: 1, dmgMod: 0, aoeRadius: 0, aoeShape: 'circle' },
    ],
  },

  // ---- เลเวล 4 ----
  aberration: {
    name: 'อสูรวิปลาส', icon: '👁️', color: '#c792ea', size: 'normal',
    maxHp: 36, ac: 14,
    str: 12, dex: 12, con: 14, int: 14, wis: 11, cha: 7,
    statusResist: 0,
    attacks: [
      { name: 'หนวดบิดเบือน', desc: 'หนวดจากมิติแปลกปลอมบิดตัวเข้าโจมตี', stat: 'int', toHit: 3, dmgDie: 8, dmgCount: 2, dmgMod: 0, aoeRadius: 0, aoeShape: 'circle' },
    ],
  },
  construct: {
    name: 'หุ่นเวทย์', icon: '🗿', color: '#82c9ff', size: 'normal',
    maxHp: 36, ac: 14,
    str: 17, dex: 9, con: 16, int: 5, wis: 8, cha: 3,
    statusResist: 0,
    attacks: [
      { name: 'หมัดเหล็ก', desc: 'กระหน่ำหมัดหินหนักอึ้ง', stat: 'str', toHit: 3, dmgDie: 8, dmgCount: 2, dmgMod: 0, aoeRadius: 0, aoeShape: 'circle' },
    ],
  },
  elemental: {
    name: 'ธาตุพิโรธ', icon: '🔥', color: '#ffd76b', size: 'large',
    maxHp: 36, ac: 14,
    str: 15, dex: 13, con: 15, int: 6, wis: 11, cha: 7,
    statusResist: 0,
    attacks: [
      { name: 'ระเบิดธาตุ', desc: 'ปะทุพลังธาตุใส่เป้าหมาย', stat: 'con', toHit: 3, dmgDie: 8, dmgCount: 2, dmgMod: 0, aoeRadius: 0, aoeShape: 'circle' },
    ],
  },
  greater_demon: {
    name: 'อสูรชั้นสูง', icon: '😈', color: '#ff9d9d', size: 'large',
    maxHp: 36, ac: 14,
    str: 18, dex: 12, con: 16, int: 11, wis: 11, cha: 14,
    statusResist: 0,
    attacks: [
      { name: 'เขี้ยวอสูร', desc: 'ขบกัดด้วยเขี้ยวยักษ์', stat: 'str', toHit: 3, dmgDie: 8, dmgCount: 2, dmgMod: 0, aoeRadius: 0, aoeShape: 'circle' },
    ],
  },

  // ---- เลเวล 5 ----
  celestial: {
    name: 'ทูตสวรรค์', icon: '✨', color: '#ffd76b', size: 'normal',
    maxHp: 48, ac: 15,
    str: 16, dex: 14, con: 15, int: 12, wis: 16, cha: 18,
    statusResist: 0,
    attacks: [
      { name: 'แสงศักดิ์สิทธิ์', desc: 'ลำแสงศักดิ์สิทธิ์เผาผลาญเป้าหมาย', stat: 'wis', toHit: 4, dmgDie: 10, dmgCount: 2, dmgMod: 0, aoeRadius: 0, aoeShape: 'circle' },
    ],
  },
  draconic_spirit: {
    name: 'วิญญาณมังกร', icon: '🐉', color: '#f6a6c1', size: 'large',
    maxHp: 48, ac: 15,
    str: 18, dex: 13, con: 16, int: 11, wis: 12, cha: 15,
    statusResist: 0,
    attacks: [
      { name: 'ลมหายใจมังกร', desc: 'พ่นลมหายใจธาตุเป็นเส้นตรง', stat: 'cha', toHit: 4, dmgDie: 10, dmgCount: 2, dmgMod: 0, aoeRadius: 12, aoeShape: 'line' },
    ],
  },

  // ---- เลเวล 6 ----
  fiend: {
    name: 'ปีศาจร้าย', icon: '👿', color: '#ff6b6b', size: 'large',
    maxHp: 62, ac: 16,
    str: 19, dex: 14, con: 17, int: 13, wis: 11, cha: 16,
    statusResist: 0,
    attacks: [
      {
        name: 'เปลวนรก', desc: 'พ่นเปลวเพลิงจากขุมนรก', stat: 'cha', toHit: 5, dmgDie: 10, dmgCount: 3, dmgMod: 0, aoeRadius: 0, aoeShape: 'circle',
        statusName: 'ไฟลุก', statusNote: 'ไฟนรกลุกไหม้ต่อเนื่อง', statusChance: 40, statusDurationSec: 12,
        statusAtkMod: 0, statusDmgMod: 0, statusDefMod: 0, statusVisionMod: 0, statusTickValue: -3, statusTickIntervalSec: 6,
        statusIcon: '🔥', statusColor: '#ff6b3d',
      },
    ],
  },
};

module.exports = { DND_SUMMON_TEMPLATES };
