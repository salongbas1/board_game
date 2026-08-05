// ============================================================
// ข้อมูลสกิล D&D — รวมทุกหมวดย่อยไว้ที่เดียว
// แยกไฟล์ตามหมวด: race-passives.js, class-skills.js, spellbook-skills.js
// ============================================================

module.exports = {
  ...require('./race-passives'),
  ...require('./class-skills'),
  ...require('./spellbook-skills'),
  ...require('./summon-templates'),
};
