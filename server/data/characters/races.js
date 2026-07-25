// ============================================================
// เผ่าพันธุ์ (races) ของตัวละคร D&D
// ============================================================

const DND_RACES = [
  { key: 'human',      name: 'มนุษย์',        icon: '🧑', desc: 'ปรับตัวเก่ง เรียนรู้ไว เป็นได้ทุกอย่าง',       bonus: { str: 1, dex: 1, con: 1 } },
  { key: 'elf',        name: 'เอลฟ์',         icon: '🧝', desc: 'ปราดเปรียว สายตาดี ผูกพันกับเวทมนตร์',        bonus: { dex: 2, int: 1 } },
  { key: 'dwarf',      name: 'ดวาร์ฟ',        icon: '🧔', desc: 'แข็งแกร่ง ทนทาน ช่างฝีมือใต้ภูเขา',           bonus: { con: 2, str: 1 } },
  { key: 'halfling',   name: 'ฮาล์ฟลิง',      icon: '🍀', desc: 'ตัวเล็ก ปราดเปรียว โชคดีเป็นพิเศษ',           bonus: { dex: 2, cha: 1 } },
  { key: 'orc',        name: 'ออร์ค',         icon: '💪', desc: 'พละกำลังมหาศาล ดุดันในสนามรบ',               bonus: { str: 2, con: 1 } },
  { key: 'tiefling',   name: 'ทิฟลิง',        icon: '😈', desc: 'สายเลือดปีศาจ เสน่ห์ล้ำลึก',                  bonus: { cha: 2, int: 1 } },
  { key: 'gnome',      name: 'โนม',           icon: '🎩', desc: 'ฉลาดหลักแหลม ช่างประดิษฐ์',                   bonus: { int: 2, dex: 1 } },
  { key: 'dragonborn', name: 'ดราก้อนบอร์น', icon: '🐉', desc: 'สายเลือดมังกร พลังและศักดิ์ศรี',              bonus: { str: 2, cha: 1 } },
];

module.exports = { DND_RACES };
