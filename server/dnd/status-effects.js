// ============================================================
// สถานะ/บัฟ-ดีบัฟ (status effects) — DM มอบ/ถอน/แก้ไขให้ผู้เล่นหรือ NPC token คนไหนก็ได้
// ครอบคลุมการกวาดสถานะที่หมดคูลดาวน์ + ติ๊กดาเมจ/ฟื้น HP ต่อเนื่อง (พิษ/ไฟลุก/รีเจน ฯลฯ) ทุกวินาที
// แยกออกมาจาก dnd.js: ตัวนับ nextStatusId ย้ายมาเก็บไว้ในโมดูลนี้เอง ไม่ใช่ตัวแปร module-level ของ dnd.js อีกต่อไป
// รับ findByWs/sendError/addLog/getPlayers/getTokens ฯลฯ จาก dnd.js ผ่าน factory function createStatusEffects(...)
// เพื่อเลี่ยง circular require (เหมือน server/dnd/game-time.js และ server/dnd/turn-order.js) — getPlayers/getTokens
// ต้องเป็นฟังก์ชัน (ไม่ใช่ค่าตรงๆ) เพราะ dndPlayers/dndTokens ใน dnd.js ถูกแทนที่ทั้งก้อนได้ (เช่นตอนโหลดไฟล์เซฟ)
//
// หมายเหตุ: ฟังก์ชัน sanitize*/findStatusTarget/buildStatusModText/allocStatusId ยังถูก dnd.js เรียกใช้ตอน
// ออกแบบ/แก้ไขสกิลผู้เล่นที่ผูกสถานะ และตอนสกิลติดสถานะให้เป้าหมายจริงตอนใช้งาน (โค้ดส่วนนั้นยังอยู่ใน dnd.js
// รอย้ายเป็น combat-handlers.js — module 7) เพื่อให้พฤติกรรมสถานะที่ DM มอบเองมือ กับสถานะที่ติดจากสกิลผู้เล่น
// ทำงานเหมือนกันทุกประการ
// ============================================================

// ---- factory: สร้าง instance ของระบบสถานะ พร้อม state (ตัวนับ nextStatusId) ของตัวเอง ----
function createStatusEffects({ findByWs, sendError, addLog, pushLogSilent, getPlayers, getTokens, isCharDead, checkTokenDefeat, broadcastState, tickGameTime }) {
  let nextStatusId = 1;

  function findStatusTarget(targetType, targetId) {
    if (targetType === 'player') {
      const target = getPlayers().find(pp => pp.id === Number(targetId));
      return target ? { list: (target.character.statuses = target.character.statuses || []), label: target.character.charName || target.name } : null;
    }
    if (targetType === 'token') {
      const t = getTokens().find(tt => tt.id === Number(targetId) && tt.kind === 'npc');
      return t ? { list: (t.statuses = t.statuses || []), label: t.name } : null;
    }
    return null;
  }
  // durationSec: 0 = ติดสถานะถาวรจนกว่า DM จะถอนเอง, > 0 = คูลดาวน์เป็นวินาที หมดเวลาแล้วหลุดสถานะให้อัตโนมัติ (เช็คจาก sweepExpiredStatuses)
  function sanitizeStatusDuration(raw) {
    return Math.max(0, Math.min(86400, Math.round(Number(raw) || 0)));
  }
  // atkMod/dmgMod/defMod: บวก-ลบค่าโจมตี/ดาเมจ/ป้องกัน (AC) ระหว่างติดสถานะนี้ (บัฟ = ค่าบวก, ดีบัฟ = ค่าลบ)
  function sanitizeStatusMod(raw) {
    return Math.max(-20, Math.min(20, Math.round(Number(raw) || 0)));
  }
  // tickValue: ค่า HP ที่เปลี่ยนทุก ๆ tickIntervalSec วินาที (ลบ = โดนดาเมจต่อเนื่อง เช่นพิษ/ไฟลุก, บวก = ฟื้น HP ต่อเนื่อง เช่นรีเจน) — 0 = ไม่มีผลต่อเนื่อง
  function sanitizeStatusTick(raw) {
    return Math.max(-1000, Math.min(1000, Math.round(Number(raw) || 0)));
  }
  function sanitizeTickInterval(raw) {
    return Math.max(1, Math.min(3600, Math.round(Number(raw) || 0) || 6));
  }
  // icon: อีโมจิ/สัญลักษณ์แสดงบนชิปสถานะ (ไม่บังคับ) — ไม่ใส่มาก็ใช้ ☠️ เป็นค่าเริ่มต้นเหมือนเดิม
  function sanitizeStatusIcon(raw) {
    const s = (raw || '').toString().trim().slice(0, 4);
    return s || '☠️';
  }
  // color: สีประจำตัวของสถานะนี้ (hex เท่านั้น เช่น #ff6b6b) — ไม่ใส่มาก็ปล่อยว่าง ใช้สีธีมเริ่มต้นของระบบ
  function sanitizeStatusColor(raw) {
    const s = (raw || '').toString().trim();
    return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : '';
  }
  function buildStatusModText(atkMod, dmgMod, defMod, tickValue, tickIntervalSec) {
    const parts = [];
    if (atkMod) parts.push(`🎯 โจมตี ${atkMod > 0 ? '+' : ''}${atkMod}`);
    if (dmgMod) parts.push(`💥 ดาเมจ ${dmgMod > 0 ? '+' : ''}${dmgMod}`);
    if (defMod) parts.push(`🛡️ ป้องกัน ${defMod > 0 ? '+' : ''}${defMod}`);
    if (tickValue) parts.push(tickValue > 0 ? `💚 ฟื้น HP +${tickValue} ทุก ${tickIntervalSec}วิ` : `☠️ โดนดาเมจ ${Math.abs(tickValue)} ทุก ${tickIntervalSec}วิ`);
    return parts.length ? ` [${parts.join(' · ')}]` : '';
  }
  function handleStatusApply(ws, payload) {
    const p = findByWs(ws);
    if (!p || !p.isDM || !payload || typeof payload !== 'object') return;
    const target = findStatusTarget((payload.targetType || '').toString(), payload.targetId);
    if (!target) return;
    const name = (payload.name || '').toString().trim().slice(0, 24);
    if (!name) { sendError(ws, 'กรุณาตั้งชื่อสถานะ/ดีบัฟ'); return; }
    const note = (payload.note || '').toString().trim().slice(0, 100);
    const durationSec = sanitizeStatusDuration(payload.durationSec);
    const expiresAt = durationSec > 0 ? Date.now() + durationSec * 1000 : 0;
    const atkMod = sanitizeStatusMod(payload.atkMod);
    const dmgMod = sanitizeStatusMod(payload.dmgMod);
    const defMod = sanitizeStatusMod(payload.defMod);
    const tickValue = sanitizeStatusTick(payload.tickValue);
    const tickIntervalSec = tickValue !== 0 ? sanitizeTickInterval(payload.tickIntervalSec) : 0;
    const nextTickAt = tickValue !== 0 ? Date.now() + tickIntervalSec * 1000 : 0;
    const icon = sanitizeStatusIcon(payload.icon);
    const color = sanitizeStatusColor(payload.color);
    target.list.push({ id: nextStatusId++, name, note, durationSec, expiresAt, atkMod, dmgMod, defMod, tickValue, tickIntervalSec, nextTickAt, icon, color });
    addLog(`${icon} DM มอบสถานะ "${name}" ให้ ${target.label}${durationSec ? ` (คูลดาวน์ ${durationSec}วิ)` : ''}${buildStatusModText(atkMod, dmgMod, defMod, tickValue, tickIntervalSec)}`);
  }
  function handleStatusRemove(ws, payload) {
    const p = findByWs(ws);
    if (!p || !p.isDM || !payload || typeof payload !== 'object') return;
    const target = findStatusTarget((payload.targetType || '').toString(), payload.targetId);
    if (!target) return;
    const idx = target.list.findIndex(s => s.id === Number(payload.statusId));
    if (idx === -1) return;
    const [removed] = target.list.splice(idx, 1);
    addLog(`✅ DM ถอนสถานะ "${removed.name}" จาก ${target.label}`);
  }
  function handleStatusEdit(ws, payload) {
    const p = findByWs(ws);
    if (!p || !p.isDM || !payload || typeof payload !== 'object') return;
    const target = findStatusTarget((payload.targetType || '').toString(), payload.targetId);
    if (!target) return;
    const status = target.list.find(s => s.id === Number(payload.statusId));
    if (!status) return;
    const name = (payload.name || '').toString().trim().slice(0, 24);
    if (!name) { sendError(ws, 'กรุณาตั้งชื่อสถานะ/ดีบัฟ'); return; }
    const note = (payload.note || '').toString().trim().slice(0, 100);
    const durationSec = sanitizeStatusDuration(payload.durationSec);
    const atkMod = sanitizeStatusMod(payload.atkMod);
    const dmgMod = sanitizeStatusMod(payload.dmgMod);
    const defMod = sanitizeStatusMod(payload.defMod);
    const tickValue = sanitizeStatusTick(payload.tickValue);
    const tickIntervalSec = tickValue !== 0 ? sanitizeTickInterval(payload.tickIntervalSec) : 0;
    const icon = sanitizeStatusIcon(payload.icon);
    const color = sanitizeStatusColor(payload.color);
    status.name = name;
    status.note = note;
    status.durationSec = durationSec;
    status.expiresAt = durationSec > 0 ? Date.now() + durationSec * 1000 : 0;
    status.atkMod = atkMod;
    status.dmgMod = dmgMod;
    status.defMod = defMod;
    status.tickValue = tickValue;
    status.tickIntervalSec = tickIntervalSec;
    status.icon = icon;
    status.color = color;
    // แก้ไขค่า tick ใหม่ระหว่างที่สถานะติดอยู่แล้ว — รีเซตนับเวลาติ๊กรอบถัดไปใหม่ จะได้ไม่ติ๊กถี่/ห่างผิดจากที่เพิ่งตั้งใหม่
    status.nextTickAt = tickValue !== 0 ? Date.now() + tickIntervalSec * 1000 : 0;
    addLog(`✏️ DM แก้ไขสถานะของ ${target.label} เป็น "${icon} ${name}"${durationSec ? ` (คูลดาวน์ ${durationSec}วิ)` : ' (ไม่มีคูลดาวน์)'}${buildStatusModText(atkMod, dmgMod, defMod, tickValue, tickIntervalSec)}`);
  }
  // ไล่เช็กทุกวินาทีว่ามีสถานะของใครหมดคูลดาวน์แล้วหรือยัง (หมดแล้วให้หลุดออกอัตโนมัติ) และมีสถานะไหนถึงรอบติ๊กดาเมจ/ฟื้น HP ต่อเนื่องหรือยัง (พิษ/ไฟลุก/รีเจน ฯลฯ)
  function sweepExpiredStatuses() {
    const now = Date.now();
    let changed = false;
    // เวลาวิ่งอัตโนมัติ — ฟังก์ชันนี้ถูกเรียกทุก 1 วิ (ดู setInterval ใน index.js) ใช้ tick เดิมนี้เดินเวลาในเกมไปด้วยเลย
    if (tickGameTime()) {
      changed = true;
    }
    const processList = (list, label, applyTick, onAfterTick) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const s = list[i];
        if (s.expiresAt && s.expiresAt <= now) {
          list.splice(i, 1);
          pushLogSilent(`⏳ สถานะ "${s.name}" ของ ${label} หมดคูลดาวน์แล้ว`);
          changed = true;
          continue;
        }
        if (s.tickValue && s.nextTickAt && s.nextTickAt <= now) {
          const res = applyTick(s.tickValue);
          const tag = s.tickValue > 0 ? '💚 ฟื้น HP' : '☠️ โดนดาเมจ';
          pushLogSilent(`${tag}จากสถานะ "${s.name}": ${label} HP ${res.oldHp} → ${res.newHp}${res.revived ? ' — 🌟 ฟื้นจากหมดสติแล้ว!' : ''}`);
          s.nextTickAt = now + (s.tickIntervalSec || 6) * 1000;
          changed = true;
          if (onAfterTick) onAfterTick();
        }
      }
    };
    for (const pp of getPlayers()) {
      if (pp.character && Array.isArray(pp.character.statuses)) {
        processList(pp.character.statuses, pp.character.charName || pp.name, (val) => {
          const c = pp.character;
          const wasDead = isCharDead(c);
          const oldHp = c.hp;
          c.hp = Math.max(0, Math.min(c.maxHp, c.hp + val));
          const revived = wasDead && !isCharDead(c);
          if (!wasDead && isCharDead(c)) {
            pushLogSilent(`💀 ${c.charName || pp.name} หมดสติ! ทำอะไรไม่ได้จนกว่าจะมีคนใช้ไอเทมชุบให้ หรือ DM เพิ่ม HP ให้`);
          }
          return { oldHp, newHp: c.hp, revived };
        });
      }
    }
    for (const t of getTokens()) {
      if (t.kind === 'npc' && Array.isArray(t.statuses)) {
        processList(t.statuses, t.name, (val) => {
          const oldHp = t.hp;
          t.hp = Math.max(0, Math.min(t.maxHp, t.hp + val));
          return { oldHp, newHp: t.hp, revived: false };
        }, () => checkTokenDefeat(t, null));
      }
    }
    if (changed) broadcastState();
  }

  // จองเลข id ถัดไปให้สถานะใหม่ — ใช้ตอน DM มอบสถานะเองมือ (handleStatusApply ข้างบน) และตอนสกิลผู้เล่นติดสถานะให้เป้าหมาย (ยังอยู่ใน dnd.js)
  function allocStatusId() { return nextStatusId++; }

  // ใช้ตอน dndHandleRestart — รีเซตตัวนับกลับค่าเริ่มต้น
  function reset() {
    nextStatusId = 1;
  }

  // ใช้ตอน dndSerializeState — ส่วนหนึ่งของไฟล์เซฟ
  function serialize() {
    return { nextStatusId };
  }

  // ใช้ตอน dndHandleImportState — โหลดค่ากลับจากไฟล์เซฟ
  function restore(data) {
    nextStatusId = Number.isFinite(Number(data && data.nextStatusId)) ? Number(data.nextStatusId) : 1;
  }

  return {
    findStatusTarget,
    sanitizeStatusDuration,
    sanitizeStatusMod,
    sanitizeStatusTick,
    sanitizeTickInterval,
    sanitizeStatusIcon,
    sanitizeStatusColor,
    buildStatusModText,
    handleStatusApply,
    handleStatusRemove,
    handleStatusEdit,
    sweepExpiredStatuses,
    allocStatusId,
    reset,
    serialize,
    restore,
  };
}

module.exports = {
  createStatusEffects,
};
