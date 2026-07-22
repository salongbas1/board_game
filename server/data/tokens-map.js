// ============================================================
// ข้อมูล token บนแผนที่ — สีตัวเลือก, ขนาด, ขีดจำกัดขนาดรูป
// (ใช้ได้ทั้งตัวละครผู้เล่นและ NPC/มอนสเตอร์ที่ DM สร้างบนแผนที่)
// ============================================================

const DND_TOKEN_COLORS = ['#ff6b6b', '#6fd3ff', '#9fdc9f', '#ffd76b', '#c792ea', '#ff9d9d', '#7ee8fa', '#f4a261', '#82c9ff', '#f6a6c1'];
const DND_MAX_TOKEN_IMAGE_CHARS = 420000;
const DND_TOKEN_SIZES = ['normal', 'large', 'huge']; // ขนาดวง token บนแผนที่ — large/huge เอาไว้ใช้กับมอนสเตอร์บอสให้เด่นบนแผนที่
const DND_MAX_MAP_BG_CHARS = 420000; // ไฟล์จริง ~300KB (base64 ใหญ่กว่าไฟล์จริงประมาณ 4/3 เท่า)
module.exports = {
  DND_TOKEN_COLORS, DND_MAX_TOKEN_IMAGE_CHARS,
  DND_TOKEN_SIZES, DND_MAX_MAP_BG_CHARS,
};
