// ============================================================
// ข้อมูลอุปกรณ์/ร้านค้า D&D — ช่องสวมใส่, ประเภทร้านค้า/ตีบวก,
// นโยบายเมื่อตีบวกพลาด, ประเภทผลไอเทม
// ============================================================

const DND_EQUIP_SLOTS = ['weapon', 'armor', 'shoes', 'accessory'];
const DND_EQUIP_SLOT_LABELS = { weapon: 'อาวุธ', armor: 'เกราะ', shoes: 'รองเท้า', accessory: 'เครื่องประดับ' };
const DND_EQUIP_ICON_MAX_LEN = 300000;
const DND_SHOP_TYPES = ['item', 'forge'];
const DND_FORGE_FAIL_POLICIES = ['safe', 'downgrade', 'break'];
const DND_FORGE_FAIL_POLICY_LABELS = {
  safe: 'พลาดแล้วไม่มีอะไรเกิดขึ้น (เสียแค่ทอง)',
  downgrade: 'พลาดแล้วระดับตีบวกลดลง 1 ขั้น',
  break: 'พลาดแล้วไอเทมพัง (โบนัสตีบวกรีเซตกลับเป็น +0 ทั้งหมด)',
};
const DND_ITEM_EFFECT_TYPES = ['heal', 'revive', 'gold', 'equip', 'none'];
module.exports = {
  DND_EQUIP_SLOTS, DND_EQUIP_SLOT_LABELS, DND_EQUIP_ICON_MAX_LEN,
  DND_SHOP_TYPES, DND_FORGE_FAIL_POLICIES, DND_FORGE_FAIL_POLICY_LABELS,
  DND_ITEM_EFFECT_TYPES,
};
