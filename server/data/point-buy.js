// ============================================================
// ระบบแจกแต้มสเตตัสแบบขั้นบันได (ใช้ทั้งตอน "สร้างตัวละคร" และตอน "เลเวลอัพแล้วอัพสเตตัส")
//
// ทุกสเตตัส (STR/DEX/CON/INT/WIS/CHA) เริ่มต้นที่ 8 เสมอตอนสร้างตัวละคร
// ยิ่งอัพค่าสูงยิ่งใช้พอยต์เพิ่มขึ้นเป็นขั้นบันได ตามตาราง POINT_BUY_COST ด้านล่าง
// ตั้งแต่ 16 ขึ้นไป (เกินตารางที่กำหนดไว้ถึง 15) จะคงที่ที่ POINT_BUY_COST_PER_STEP_ABOVE_MAX
// พอยต์ต่อ 1 แต้มที่เพิ่ม (ไม่เพิ่มขั้นบันไดต่อไปอีกแล้ว)
// ============================================================
const POINT_BUY_MIN = 8; // สเตตัสเริ่มต้นทุกอันตอนสร้างตัวละคร แก้ไม่ได้ต่ำกว่านี้
const POINT_BUY_BUDGET = 27; // งบพอยต์ตอน "สร้างตัวละคร" (ต้องแจกให้ครบพอดี ห้ามเหลือ/เกิน)
const STAT_POINTS_PER_LEVEL = 2; // แต้มสเตตัสที่ผู้เล่นได้รับทุกครั้งที่เลเวลอัพ 1 เลเวล — แก้เลขนี้เพื่อปรับสมดุลเกมได้

// ต้นทุนสะสม (นับจากฐาน 8) ของแต่ละค่าสเตตัส 9-15
const POINT_BUY_COST = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};
const POINT_BUY_COST_MAX_DEFINED = 15; // ค่าสูงสุดที่กำหนดไว้ในตารางข้างบน
const POINT_BUY_COST_PER_STEP_ABOVE_MAX = 9; // ตั้งแต่ 16 ขึ้นไป ใช้เท่านี้พอยต์ต่อ 1 แต้มเสมอ (คงที่)

// ต้นทุนสะสม (จากฐาน 8) ในการมีค่าสเตตัสเท่ากับ score ใดๆ — รองรับค่าที่เกิน 15 ด้วย
function pointBuyCostOf(score) {
  const s = Math.round(Number(score));
  if (!Number.isFinite(s) || s < POINT_BUY_MIN) return Infinity;
  if (s === POINT_BUY_MIN) return 0;
  // ค่าในตาราง POINT_BUY_COST คือ "ต้นทุนต่อ 1 แต้ม" ของการขยับไปถึงค่านั้นๆ (ไม่ใช่ต้นทุนสะสม)
  // ต้องบวกสะสมทีละขั้นจาก 9 ถึง s เพื่อให้ได้ต้นทุนรวมที่แท้จริง
  // เช่น 8->15 ต้องรวม 9+10+11+12+13+14+15 = 1+2+3+4+5+7+9 = 31 แต้ม
  let total = 0;
  const upper = Math.min(s, POINT_BUY_COST_MAX_DEFINED);
  for (let i = POINT_BUY_MIN + 1; i <= upper; i++) {
    if (POINT_BUY_COST[i] === undefined) return Infinity;
    total += POINT_BUY_COST[i];
  }
  if (s > POINT_BUY_COST_MAX_DEFINED) {
    total += (s - POINT_BUY_COST_MAX_DEFINED) * POINT_BUY_COST_PER_STEP_ABOVE_MAX;
  }
  return total;
}

// ต้นทุนของการ "เพิ่มสเตตัสอีก 1 แต้ม" จากค่าปัจจุบัน — ใช้ตอนเลเวลอัพแล้วอัพสเตตัสทีละแต้ม
function pointBuyStepCost(currentScore) {
  const s = Math.max(POINT_BUY_MIN, Math.round(Number(currentScore)) || POINT_BUY_MIN);
  return pointBuyCostOf(s + 1) - pointBuyCostOf(s);
}

module.exports = {
  POINT_BUY_MIN,
  POINT_BUY_BUDGET,
  STAT_POINTS_PER_LEVEL,
  POINT_BUY_COST,
  POINT_BUY_COST_MAX_DEFINED,
  POINT_BUY_COST_PER_STEP_ABOVE_MAX,
  pointBuyCostOf,
  pointBuyStepCost,
};
