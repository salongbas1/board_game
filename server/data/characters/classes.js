// ============================================================
// คลาส (classes) ของตัวละคร D&D และอุปกรณ์เริ่มต้นตามคลาส
// ============================================================

const DND_CLASSES = [
  { key: 'fighter',    name: 'นักรบ',       icon: '⚔️', desc: 'ผู้เชี่ยวชาญการต่อสู้ระยะประชิด',       bonus: { str: 2, con: 1 }, hitDie: 10, armor: 'heavy' },
  { key: 'wizard',     name: 'นักเวท',      icon: '🔮', desc: 'ควบคุมเวทมนตร์อันทรงพลัง',              bonus: { int: 2, wis: 1 }, hitDie: 6,  armor: 'light' },
  { key: 'cleric',     name: 'นักบวช',      icon: '✨', desc: 'ผู้รับใช้เทพเจ้า รักษาและปกป้องปาร์ตี้',  bonus: { wis: 2, con: 1 }, hitDie: 8,  armor: 'medium' },
  { key: 'rogue',      name: 'โจร',         icon: '🗡️', desc: 'คล่องแคล่ว หลบหลีก จู่โจมจุดอ่อน',      bonus: { dex: 2, cha: 1 }, hitDie: 8,  armor: 'light' },
  { key: 'ranger',     name: 'เรนเจอร์',    icon: '🏹', desc: 'นักล่าแห่งป่าเถื่อน แม่นธนู',            bonus: { dex: 2, wis: 1 }, hitDie: 10, armor: 'medium' },
  { key: 'barbarian',  name: 'บาร์บาเรียน', icon: '🪓', desc: 'พลังดิบ ความดุร้ายที่ไม่มีใครหยุดได้',    bonus: { str: 2, con: 1 }, hitDie: 12, armor: 'medium' },
  { key: 'paladin',    name: 'พาลาดิน',     icon: '🛡️', desc: 'นักรบศักดิ์สิทธิ์ผู้ปกป้องความยุติธรรม',  bonus: { cha: 2, str: 1 }, hitDie: 10, armor: 'heavy' },
  { key: 'bard',       name: 'บาร์ด',       icon: '🎵', desc: 'เสน่ห์และดนตรี สร้างแรงบันดาลใจให้ปาร์ตี้', bonus: { cha: 2, dex: 1 }, hitDie: 8,  armor: 'light' },
];

const DND_CLASS_STARTER_GEAR = {
  fighter:   { weapon: { name: 'ดาบยาว',        atk: 2, def: 0, maxDurability: 10 }, armor: { name: 'เกราะโซ่',         atk: 0, def: 2, maxDurability: 10 }, shoes: { name: 'รองเท้าบูทเกราะ',  atk: 0, def: 1, maxDurability: 8 }, accessory: { name: 'โล่ไม้',           atk: 0, def: 1, maxDurability: 6 } },
  wizard:    { weapon: { name: 'ไม้เท้าเวทย์',   atk: 1, def: 0, maxDurability: 6  }, armor: { name: 'เสื้อคลุมนักเวท',  atk: 0, def: 1, maxDurability: 6  }, shoes: { name: 'รองเท้าผ้า',        atk: 0, def: 0, maxDurability: 4 }, accessory: { name: 'ตำราคาถา',        atk: 1, def: 0, maxDurability: 6 } },
  cleric:    { weapon: { name: 'ตะบองศักดิ์สิทธิ์', atk: 1, def: 0, maxDurability: 8 }, armor: { name: 'เกราะโซ่นักบวช',  atk: 0, def: 2, maxDurability: 8  }, shoes: { name: 'รองเท้าหนัง',        atk: 0, def: 1, maxDurability: 6 }, accessory: { name: 'สัญลักษณ์ศักดิ์สิทธิ์', atk: 0, def: 1, maxDurability: 6 } },
  rogue:     { weapon: { name: 'กริชคู่',        atk: 2, def: 0, maxDurability: 8  }, armor: { name: 'เสื้อหนังนุ่ม',    atk: 0, def: 1, maxDurability: 6  }, shoes: { name: 'รองเท้าย่องเบา',     atk: 0, def: 1, maxDurability: 6 }, accessory: { name: 'ชุดเครื่องมือโจร', atk: 1, def: 0, maxDurability: 6 } },
  ranger:    { weapon: { name: 'ธนูสั้น',        atk: 2, def: 0, maxDurability: 8  }, armor: { name: 'เกราะหนัง',        atk: 0, def: 2, maxDurability: 8  }, shoes: { name: 'รองเท้าเดินป่า',     atk: 0, def: 1, maxDurability: 6 }, accessory: { name: 'แล่งธนู',          atk: 1, def: 0, maxDurability: 6 } },
  barbarian: { weapon: { name: 'ขวานใหญ่',       atk: 3, def: 0, maxDurability: 10 }, armor: { name: 'ชุดหนังสัตว์',     atk: 0, def: 1, maxDurability: 8  }, shoes: { name: 'รองเท้าหนังหยาบ',    atk: 0, def: 1, maxDurability: 6 }, accessory: { name: 'สร้อยเขี้ยวสัตว์', atk: 1, def: 0, maxDurability: 4 } },
  paladin:   { weapon: { name: 'ดาบยาว',        atk: 2, def: 0, maxDurability: 10 }, armor: { name: 'เกราะแผ่นเหล็ก',   atk: 0, def: 3, maxDurability: 10 }, shoes: { name: 'รองเท้าบูทเหล็ก',    atk: 0, def: 1, maxDurability: 8 }, accessory: { name: 'โล่ประจำตระกูล',   atk: 0, def: 1, maxDurability: 6 } },
  bard:      { weapon: { name: 'กระบี่สั้น',     atk: 1, def: 0, maxDurability: 6  }, armor: { name: 'เสื้อคลุมนักแสดง', atk: 0, def: 1, maxDurability: 6  }, shoes: { name: 'รองเท้าผ้านิ่ม',     atk: 0, def: 0, maxDurability: 4 }, accessory: { name: 'พิณคู่ใจ',         atk: 1, def: 0, maxDurability: 6 } },
};

module.exports = { DND_CLASSES, DND_CLASS_STARTER_GEAR };
