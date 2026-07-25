// ============================================================
// ข้อมูลตัวละคร D&D — รวมทุกหมวดย่อยไว้ที่เดียว
// แยกไฟล์ตามหมวด: races.js, classes.js, appearance.js, progression.js
// ============================================================

module.exports = {
  ...require('./races'),
  ...require('./classes'),
  ...require('./appearance'),
  ...require('./progression'),
};
