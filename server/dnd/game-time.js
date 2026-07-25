// ============================================================
// นาฬิกาในเกม — DM เท่านั้นที่เดินเวลา/ข้ามวัน/ตั้งเวลาเอง + เวลาวิ่งอัตโนมัติ
// แยกออกมาจาก dnd.js: state (gameTime/timeAuto/timeAutoAccumMinutes) ถูกย้ายมาเก็บไว้
// ในโมดูลนี้เอง ไม่ใช่ตัวแปร module-level ของ dnd.js อีกต่อไป
// รับ findByWs/addLog จาก dnd.js ผ่าน factory function createGameTime(...) เพื่อเลี่ยง circular require
// (function declaration ของ dndFindByWs/dndAddLog ใน dnd.js ถูก hoist ขึ้นมาแล้วตอนเรียก require บรรทัดบนสุด จึงส่งเข้ามาได้เลย)
// ============================================================

function dndFormatGameTime(t) {
  const hh = String(t.hour).padStart(2, '0');
  const mm = String(t.minute).padStart(2, '0');
  return `วันที่ ${t.day} เวลา ${hh}:${mm}`;
}

function dndNormalizeGameTime(day, totalMinutesOfDay) {
  // totalMinutesOfDay อาจติดลบหรือเกิน 1440 ได้ (เช่นเดินเวลาถอยหลัง หรือบวกหลายชั่วโมงข้ามวัน) — ฟังก์ชันนี้ทบวันให้ถูกต้อง
  let d = day;
  let m = totalMinutesOfDay;
  while (m < 0) { m += 1440; d -= 1; }
  while (m >= 1440) { m -= 1440; d += 1; }
  if (d < 1) d = 1;
  return { day: d, hour: Math.floor(m / 60), minute: m % 60 };
}

function dndFormatMinutesSpan(mins) {
  const abs = Math.abs(mins);
  if (abs % 60 === 0) return `${abs / 60} ชม.`;
  if (abs < 60) return `${abs} นาที`;
  return `${Math.floor(abs / 60)} ชม. ${abs % 60} นาที`;
}

// ---- factory: สร้าง instance ของระบบนาฬิกาเกม พร้อม state ของตัวเอง ----
function createGameTime({ findByWs, addLog }) {
  let gameTime = { day: 1, hour: 8, minute: 0 };
  let timeAuto = { running: false, speed: 10 };
  let timeAutoAccumMinutes = 0;

  // DM เดินเวลาไปข้างหน้า (หรือถอยหลังถ้าใส่ค่าติดลบ) เป็นนาที เช่น +30 = เดินไป 30 นาที, +1440 = ข้ามไป 1 วันเต็ม
  function handleTimeAdvance(ws, minutes) {
    const p = findByWs(ws);
    if (!p || !p.isDM) return;
    const delta = Math.max(-100000, Math.min(100000, Math.round(Number(minutes) || 0)));
    if (!delta) return;
    const totalNow = gameTime.hour * 60 + gameTime.minute;
    gameTime = dndNormalizeGameTime(gameTime.day, totalNow + delta);
    const verb = delta > 0 ? 'เดินเวลาไป' : 'ย้อนเวลากลับ';
    addLog(`⏰ DM ${verb} ${dndFormatMinutesSpan(delta)} — ตอนนี้เป็น${dndFormatGameTime(gameTime)}`);
  }

  // DM ข้ามไปวันถัดไปทันที (คงเวลาของวันเดิมไว้ เช่นถ้าตอนนี้ 20:00 ข้ามวันแล้วจะเป็น 20:00 ของวันถัดไป)
  function handleTimeSkipDay(ws) {
    const p = findByWs(ws);
    if (!p || !p.isDM) return;
    gameTime = { day: gameTime.day + 1, hour: gameTime.hour, minute: gameTime.minute };
    addLog(`⏭️ DM ข้ามไปวันถัดไป — ตอนนี้เป็น${dndFormatGameTime(gameTime)}`);
  }

  // DM ตั้งวัน/เวลาในเกมเองโดยตรง (เช่นแก้ให้ตรงกับเนื้อเรื่อง)
  function handleTimeSet(ws, payload) {
    const p = findByWs(ws);
    if (!p || !p.isDM || !payload || typeof payload !== 'object') return;
    const day = Math.max(1, Math.min(999999, Math.round(Number(payload.day)) || 1));
    const hour = Math.max(0, Math.min(23, Math.round(Number(payload.hour)) || 0));
    const minute = Math.max(0, Math.min(59, Math.round(Number(payload.minute)) || 0));
    gameTime = { day, hour, minute };
    addLog(`🛠️ DM ตั้งเวลาในเกมเป็น${dndFormatGameTime(gameTime)}`);
  }

  // DM เปิด/ปิดโหมดเวลาวิ่งอัตโนมัติ (เดินเองตามความเร็วที่ตั้งไว้ ไม่ต้องกดเดินเวลาเอง)
  function handleTimeAutoToggle(ws, running) {
    const p = findByWs(ws);
    if (!p || !p.isDM) return;
    timeAuto.running = !!running;
    timeAutoAccumMinutes = 0; // เริ่ม/หยุดใหม่ทุกครั้ง ล้างเศษนาทีสะสมทิ้งกันสะดุด
    addLog(timeAuto.running ? `▶️ DM เปิดเวลาวิ่งอัตโนมัติ (ความเร็ว x${timeAuto.speed})` : '⏸️ DM หยุดเวลาวิ่งอัตโนมัติ');
  }

  // DM ปรับความเร็วเวลาวิ่งอัตโนมัติ — speed = กี่นาทีในเกม ต่อ 1 นาทีจริง
  function handleTimeAutoSpeedSet(ws, speed) {
    const p = findByWs(ws);
    if (!p || !p.isDM) return;
    const s = Math.max(1, Math.min(1440, Math.round(Number(speed)) || 1));
    timeAuto.speed = s;
    addLog(`🛠️ DM ตั้งความเร็วเวลาวิ่งอัตโนมัติเป็น x${s} (1 นาทีจริง = ${s} นาทีในเกม)`);
  }

  // เรียกจาก sweep tick ทุก 1 วิ (ดู setInterval ใน index.js) — เดินเวลาอัตโนมัติถ้าเปิดโหมดไว้
  // คืนค่า true ถ้าเวลาขยับจริง (ไว้ให้ dndSweepExpiredStatuses รวมเข้ากับ "changed" เพื่อสั่ง broadcast ต่อ)
  function tickAuto() {
    if (!timeAuto.running) return false;
    timeAutoAccumMinutes += timeAuto.speed / 60; // ต่อ 1 วินาทีจริงที่ผ่านไป
    if (timeAutoAccumMinutes >= 1) {
      const wholeMinutes = Math.floor(timeAutoAccumMinutes);
      timeAutoAccumMinutes -= wholeMinutes;
      const totalNow = gameTime.hour * 60 + gameTime.minute;
      gameTime = dndNormalizeGameTime(gameTime.day, totalNow + wholeMinutes);
      return true;
    }
    return false;
  }

  function getGameTime() { return gameTime; }
  function getTimeAuto() { return timeAuto; }
  function getTimeAutoAccumMinutes() { return timeAutoAccumMinutes; }

  // ใช้ตอน dndHandleRestart — รีเซตนาฬิกากลับค่าเริ่มต้น
  function reset() {
    gameTime = { day: 1, hour: 8, minute: 0 };
    timeAuto = { running: false, speed: 10 };
    timeAutoAccumMinutes = 0;
  }

  // ใช้ตอน dndSerializeState — ส่วนหนึ่งของไฟล์เซฟ
  function serialize() {
    return { gameTime, timeAuto, timeAutoAccumMinutes };
  }

  // ใช้ตอน dndHandleImportState — โหลดค่ากลับจากไฟล์เซฟ (ตรวจสอบชนิด/ค่าเริ่มต้นเหมือนของเดิมทุกจุด)
  function restore(data) {
    gameTime = (data && data.gameTime && typeof data.gameTime === 'object')
      ? { day: Number(data.gameTime.day) || 1, hour: Number(data.gameTime.hour) || 8, minute: Number(data.gameTime.minute) || 0 }
      : { day: 1, hour: 8, minute: 0 };
    timeAuto = (data && data.timeAuto && typeof data.timeAuto === 'object')
      ? { running: !!data.timeAuto.running, speed: Number(data.timeAuto.speed) || 10 }
      : { running: false, speed: 10 };
    timeAutoAccumMinutes = Number(data && data.timeAutoAccumMinutes) || 0;
  }

  return {
    handleTimeAdvance,
    handleTimeSkipDay,
    handleTimeSet,
    handleTimeAutoToggle,
    handleTimeAutoSpeedSet,
    tickAuto,
    getGameTime,
    getTimeAuto,
    getTimeAutoAccumMinutes,
    reset,
    serialize,
    restore,
  };
}

module.exports = {
  createGameTime,
  dndFormatGameTime,
  dndNormalizeGameTime,
  dndFormatMinutesSpan,
};
