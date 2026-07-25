// ============================================================
// สกิลประจำคลาส (class skills) ที่ปลดล็อกตามเลเวล
// ============================================================

const DND_CLASS_SKILLS = {
  fighter: [
    { level: 1, name: 'ฟันดาบหนักหน่วง', desc: 'ฟันเข้าเป้าหมายด้วยแรง STR เต็มกำลัง', stat: 'str', dmgDie: 8, dmgCount: 1, dmgMod: 2, cooldownSec: 6, maxUses: 0, spCost: 0 },
    { level: 4, name: 'จู่โจมสองจังหวะ', desc: 'ฟันสองครั้งรัว ๆ ติดกัน', stat: 'str', dmgDie: 6, dmgCount: 2, dmgMod: 1, cooldownSec: 12, maxUses: 0, spCost: 5 },
    { level: 8, name: 'ท่าไม้ตายนักรบ', desc: 'ทุ่มพลังทั้งหมดฟันเดียวจบ', stat: 'str', dmgDie: 12, dmgCount: 2, dmgMod: 3, cooldownSec: 25, maxUses: 0, spCost: 10 },
  ],
  wizard: [
    { level: 1, name: 'ลูกไฟเวทมนตร์', desc: 'ยิงลูกไฟใส่เป้าหมายด้วยพลัง INT', stat: 'int', dmgDie: 6, dmgCount: 1, dmgMod: 2, cooldownSec: 6, maxUses: 0, spCost: 0 },
    { level: 4, name: 'สายฟ้าฟาด', desc: 'ปล่อยสายฟ้าพลังทำลายล้างสูง', stat: 'int', dmgDie: 8, dmgCount: 2, dmgMod: 1, cooldownSec: 15, maxUses: 0, spCost: 5 },
    { level: 8, name: 'อุกกาบาต', desc: 'เรียกอุกกาบาตถล่มเป้าหมาย', stat: 'int', dmgDie: 10, dmgCount: 3, dmgMod: 2, cooldownSec: 30, maxUses: 3, spCost: 10 },
  ],
  cleric: [
    { level: 1, name: 'แสงศักดิ์สิทธิ์', desc: 'สาดแสงศักดิ์สิทธิ์ใส่เป้าหมาย', stat: 'wis', dmgDie: 6, dmgCount: 1, dmgMod: 1, cooldownSec: 6, maxUses: 0, spCost: 0 },
    { level: 4, name: 'ตัดสินของพระเจ้า', desc: 'เรียกพลังศักดิ์สิทธิ์ลงโทษเป้าหมาย', stat: 'wis', dmgDie: 8, dmgCount: 1, dmgMod: 2, cooldownSec: 14, maxUses: 0, spCost: 5 },
    { level: 8, name: 'ประกาศิตสวรรค์', desc: 'พลังแห่งเทพเจ้ากระหน่ำเป้าหมาย', stat: 'wis', dmgDie: 10, dmgCount: 2, dmgMod: 2, cooldownSec: 28, maxUses: 3, spCost: 10 },
  ],
  rogue: [
    { level: 1, name: 'แทงจุดอ่อน', desc: 'จู่โจมจุดอ่อนด้วยความคล่องแคล่ว', stat: 'dex', dmgDie: 6, dmgCount: 1, dmgMod: 2, cooldownSec: 5, maxUses: 0, spCost: 0 },
    { level: 4, name: 'สังหารเงียบ', desc: 'แอบเข้าประชิดแล้วจู่โจมรุนแรง', stat: 'dex', dmgDie: 8, dmgCount: 1, dmgMod: 3, cooldownSec: 14, maxUses: 0, spCost: 5 },
    { level: 8, name: 'ระเบิดมีดพันเล่ม', desc: 'สาดมีดใส่เป้าหมายรัว ๆ', stat: 'dex', dmgDie: 6, dmgCount: 4, dmgMod: 1, cooldownSec: 24, maxUses: 3, spCost: 10 },
  ],
  ranger: [
    { level: 1, name: 'ยิงธนูแม่นยำ', desc: 'ยิงธนูเล็งจุดตายแม่นยำ', stat: 'dex', dmgDie: 6, dmgCount: 1, dmgMod: 2, cooldownSec: 5, maxUses: 0, spCost: 0 },
    { level: 4, name: 'ธนูคู่', desc: 'ยิงธนูสองดอกติดกัน', stat: 'dex', dmgDie: 6, dmgCount: 2, dmgMod: 1, cooldownSec: 12, maxUses: 0, spCost: 5 },
    { level: 8, name: 'ห่าธนู', desc: 'ยิงธนูรัวใส่เป้าหมายไม่หยุด', stat: 'dex', dmgDie: 8, dmgCount: 3, dmgMod: 2, cooldownSec: 26, maxUses: 3, spCost: 10 },
  ],
  barbarian: [
    { level: 1, name: 'ทุบกระหน่ำ', desc: 'ทุ่มพลังบ้าคลั่งเข้าใส่เป้าหมาย', stat: 'str', dmgDie: 10, dmgCount: 1, dmgMod: 2, cooldownSec: 6, maxUses: 0, spCost: 0 },
    { level: 4, name: 'คลั่งเลือด', desc: 'ระเบิดพลังบ้าคลั่งฟันรัว', stat: 'str', dmgDie: 8, dmgCount: 2, dmgMod: 2, cooldownSec: 14, maxUses: 0, spCost: 5 },
    { level: 8, name: 'พิโรธไททัน', desc: 'ปลดปล่อยพลังบ้าคลั่งสูงสุด', stat: 'str', dmgDie: 12, dmgCount: 2, dmgMod: 4, cooldownSec: 28, maxUses: 2, spCost: 10 },
  ],
  paladin: [
    { level: 1, name: 'ฟันแห่งศรัทธา', desc: 'ฟันดาบพร้อมพลังศักดิ์สิทธิ์', stat: 'str', dmgDie: 8, dmgCount: 1, dmgMod: 2, cooldownSec: 6, maxUses: 0, spCost: 0 },
    { level: 4, name: 'พิพากษาศักดิ์สิทธิ์', desc: 'เรียกพลังศรัทธาลงทัณฑ์เป้าหมาย', stat: 'cha', dmgDie: 8, dmgCount: 2, dmgMod: 1, cooldownSec: 15, maxUses: 0, spCost: 5 },
    { level: 8, name: 'อัศวินแห่งแสง', desc: 'สำแดงพลังศักดิ์สิทธิ์เต็มกำลัง', stat: 'str', dmgDie: 10, dmgCount: 2, dmgMod: 3, cooldownSec: 28, maxUses: 3, spCost: 10 },
  ],
  bard: [
    { level: 1, name: 'เสียงเพลงจู่โจม', desc: 'ปล่อยคลื่นเสียงกระแทกเป้าหมาย', stat: 'cha', dmgDie: 6, dmgCount: 1, dmgMod: 1, cooldownSec: 6, maxUses: 0, spCost: 0 },
    { level: 4, name: 'ท่วงทำนองปลุกใจ', desc: 'บรรเลงเพลงกระแทกใจศัตรู', stat: 'cha', dmgDie: 6, dmgCount: 2, dmgMod: 1, cooldownSec: 14, maxUses: 0, spCost: 5 },
    { level: 8, name: 'ซิมโฟนีทำลายล้าง', desc: 'บรรเลงเพลงพลังทำลายล้างสูงสุด', stat: 'cha', dmgDie: 10, dmgCount: 2, dmgMod: 2, cooldownSec: 28, maxUses: 3, spCost: 10 },
  ],
};
const DND_CLASS_SKILL_ID_BASE = 900000; // เลข id เฉพาะช่วงสกิลคลาส กันชนกับ id สกิลที่ DM สร้างเอง (เริ่มนับจาก 1)

module.exports = { DND_CLASS_SKILLS, DND_CLASS_SKILL_ID_BASE };
