// ============================================================
// สกิลติดตัวประจำเผ่า (race passives)
// ============================================================

const DND_RACE_PASSIVES = {
  human: [
    { key: 'skilled',     name: 'ผู้ชำนาญรอบด้าน', icon: '🎯', desc: 'ปรับตัวเก่ง เรียนรู้ไว จับจังหวะโจมตีแม่นกว่าเผ่าอื่น (โจมตี +1)', effect: { atk: 1 } },
    { key: 'resourceful', name: 'มีไหวพริบ',       icon: '💰', desc: 'รู้จักตุนเสบียงและเงินทองมาตั้งแต่ออกเดินทาง (ทองเริ่มต้น +15)', effect: { gold: 15 } },
  ],
  elf: [
    { key: 'feyAncestry', name: 'สายเลือดภูตพราย', icon: '🌙', desc: 'ประสาทสัมผัสไวจนยากจะจู่โจมแบบไม่ทันตั้งตัว (ช่วงคริติคอลกว้างขึ้น 19-20)', effect: { critRange: 1 } },
    { key: 'keenSenses',  name: 'สัมผัสคมกริบ',    icon: '👁️', desc: 'สายตาและปฏิกิริยาไวกว่าเผ่าพันธุ์อื่น (โจมตี +1)', effect: { atk: 1 } },
  ],
  dwarf: [
    { key: 'resilience',   name: 'ความทรหดแห่งดวาร์ฟ', icon: '❤️', desc: 'ร่างกายแข็งแกร่งทนทานผิดมนุษย์ (HP สูงสุด +5)', effect: { hp: 5 } },
    { key: 'stonecunning', name: 'ปราดเปรื่องเรื่องหิน', icon: '🛡️', desc: 'สัญชาตญาณป้องกันตัวเยี่ยมจากการใช้ชีวิตใต้ภูเขา (ป้องกัน +1)', effect: { ac: 1 } },
  ],
  halfling: [
    { key: 'lucky', name: 'โชคดีที่สุด', icon: '🍀', desc: 'ดวงดีเป็นพิเศษ มักเจอจังหวะติดพันสำคัญ ๆ (ช่วงคริติคอลกว้างขึ้น 19-20)', effect: { critRange: 1 } },
    { key: 'brave', name: 'กล้าหาญ',   icon: '💪', desc: 'ใจสู้ไม่หวั่นแม้ตัวเล็ก ทนทานกว่าที่คิด (HP สูงสุด +3)', effect: { hp: 3 } },
  ],
  orc: [
    { key: 'relentless',  name: 'ทรหดไม่ย่อท้อ',  icon: '❤️', desc: 'ร่างกายที่ผ่านศึกมานับไม่ถ้วน ทนทานผิดมนุษย์ (HP สูงสุด +8)', effect: { hp: 8 } },
    { key: 'aggressive',  name: 'ดุดันในสนามรบ',  icon: '🔥', desc: 'พลังบุกตะลุยทำให้โจมตีแรงขึ้น (ดาเมจ +2)', effect: { dmg: 2 } },
  ],
  tiefling: [
    { key: 'infernalLegacy', name: 'มรดกปีศาจ',     icon: '🔥', desc: 'สายเลือดปีศาจซ่อนพลังทำลายล้างในตัว (ดาเมจ +2)', effect: { dmg: 2 } },
    { key: 'hellishResist',  name: 'ทนต่อพลังนรก', icon: '🛡️', desc: 'ผิวหนังต้านทานพลังชั่วร้ายได้ดีกว่าปกติ (ป้องกัน +1)', effect: { ac: 1 } },
  ],
  gnome: [
    { key: 'gnomeCunning', name: 'ไหวพริบแห่งโนม', icon: '🎯', desc: 'จิตใจแหลมคม จับจังหวะโจมตีได้แม่นยำ (โจมตี +1)', effect: { atk: 1 } },
    { key: 'tinker',       name: 'ช่างประดิษฐ์',   icon: '💰', desc: 'พกอุปกรณ์และเงินทุนสำรองติดตัวเสมอ (ทองเริ่มต้น +20)', effect: { gold: 20 } },
  ],
  dragonborn: [
    { key: 'breathWeapon',      name: 'ลมหายใจมังกร',     icon: '🔥', desc: 'สายเลือดมังกรซ่อนพลังทำลายล้างในทุกการโจมตี (ดาเมจ +3)', effect: { dmg: 3 } },
    { key: 'draconicResilience', name: 'ความทรหดแห่งมังกร', icon: '❤️', desc: 'เกล็ดมังกรใต้ผิวหนังช่วยเสริมความอึด (HP สูงสุด +5)', effect: { hp: 5 } },
  ],
};
const DND_PASSIVE_EFFECT_KEYS = ['atk', 'dmg', 'ac', 'hp', 'critRange', 'gold'];

module.exports = { DND_RACE_PASSIVES, DND_PASSIVE_EFFECT_KEYS };
