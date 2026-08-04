// ============================================================================
// dnd-map.js — ระบบแผนที่การต่อสู้ (Battle Map / Token / Fog of War / Vision)
// แยกออกมาจาก app.js เพื่อให้แก้ไข/ค้นหาโค้ดส่วนแมพได้ง่ายขึ้น
// หมายเหตุ: ไฟล์นี้เป็น <script> ธรรมดา (ไม่ใช่ ES module) จึงแชร์ global scope
// เดียวกับ app.js — ตัวแปร/ฟังก์ชันที่ประกาศในนี้เรียกใช้จาก app.js ได้ตามปกติ
// และในทางกลับกัน โค้ดในไฟล์นี้ก็เรียกใช้ฟังก์ชัน/ตัวแปรร่วมจาก app.js ได้เช่นกัน
// (เช่น send(), dndYou, dndPlayersList, escapeHtml(), flashBtn(), isDM ฯลฯ)
// ต้องโหลดไฟล์นี้ "หลัง" app.js ใน index.html (มีบรรทัดหนึ่งเรียก
// dndRefreshMonsterPresetSelect() ทันทีตอนโหลดสคริปต์ ซึ่งฟังก์ชันนั้นประกาศอยู่ใน app.js)
// ============================================================================

// ---- ค่าคงที่และ state ของระบบแมพ/token ----
const DND_TOKEN_COLORS = ['#ff6b6b', '#6fd3ff', '#9fdc9f', '#ffd76b', '#c792ea', '#ff9d9d', '#7ee8fa', '#f4a261', '#82c9ff', '#f6a6c1'];

let dndTokens = [];
let dndWalls = [];         // [{id, mapId, x1, y1, x2, y2}] — กำแพงบนแผนที่ปัจจุบัน (พิกัด % เหมือน token)
let dndWallModeOn = false; // โหมดวาดกำแพง (DM เท่านั้น เก็บแค่ฝั่ง client ไม่ sync กับใคร)
let dndWallDrawStart = null; // จุดเริ่มลากตอนกำลังวาดกำแพงอยู่ {x, y}
let dndVisionEnabled = false;
let dndVisionTypeLabels = { normal: 'ปกติ', dark: 'มองในที่มืด (Darkvision)' };
let dndVisionDefaults = { normal: 24, dark: 42 };
let dndPartyVisionShared = false;   // DM เปิด/ปิด "แชร์วิสัยทัศน์ในปาร์ตี้" — รวมพื้นที่มองเห็นของเพื่อนร่วมทีมเข้าด้วยกัน
let dndPartyVisionGroups = [];      // [{id, playerIds}] — แต่ละกรุ๊ปแชร์วิสัยทัศน์กันเองเท่านั้น ไม่เห็นของกรุ๊ปอื่น (1 คนอยู่ได้กรุ๊ปเดียว)
let dndTokenEls = {};       // id -> DOM element, so drags/redraws don't rebuild nodes needlessly
let dndDraggingId = null;   // id ของ token ที่กำลังลากอยู่ตอนนี้ (กันไม่ให้ state ที่ค้างมาจาก server มาแย่งตำแหน่งระหว่างลาก)
let dndMyTokenColor = null;
let dndNpcFormColor = DND_TOKEN_COLORS[0];
let dndNpcFormImage = null;
let dndMapBackground = null;
let dndMapGridSize = 10; // จำนวนช่องตาราง (grid) ต่อด้านของแผนที่ปัจจุบัน — DM ปรับได้ (ค่าเริ่มต้นเดิมคือ 10 ช่องคงที่)
let dndMaps = [];
let dndCurrentMapId = 1;
let dndTokenEditTargetId = null;

// ---- ขนาดกรอบแมพที่ผู้ใช้ปรับเองได้ (บันทึกไว้ในเบราว์เซอร์เครื่องนี้ ไม่ sync กับใคร — ผู้เล่น/DM แต่ละคนตั้งขนาดของตัวเองได้อิสระ) ----
const DND_MAP_SIZE_STORAGE_KEY = 'dndMapFrameSizePx';
const DND_MAP_SIZE_DEFAULT = 1100;
function dndApplyMapSizePx(px) {
  document.documentElement.style.setProperty('--dndMapSizePx', px + 'px');
  const valueEl = document.getElementById('dndMapSizeValue');
  if (valueEl) valueEl.textContent = px + 'px';
}
function dndLoadMapSize() {
  let px = DND_MAP_SIZE_DEFAULT;
  try {
    const raw = localStorage.getItem(DND_MAP_SIZE_STORAGE_KEY);
    const parsed = raw ? parseInt(raw, 10) : NaN;
    if (Number.isFinite(parsed) && parsed >= 500 && parsed <= 1600) px = parsed;
  } catch (e) { /* เบราว์เซอร์อาจปิด localStorage ไว้ — ข้ามไปเงียบๆ ใช้ค่า default แทน */ }
  const slider = document.getElementById('dndMapSizeSlider');
  if (slider) slider.value = px;
  dndApplyMapSizePx(px);
}
function dndSaveMapSize(px) {
  try { localStorage.setItem(DND_MAP_SIZE_STORAGE_KEY, String(px)); } catch (e) { /* ข้ามไปเงียบๆ */ }
}
document.getElementById('dndMapSizeSlider').addEventListener('input', (ev) => {
  const px = parseInt(ev.target.value, 10);
  dndApplyMapSizePx(px);
});
document.getElementById('dndMapSizeSlider').addEventListener('change', (ev) => {
  dndSaveMapSize(parseInt(ev.target.value, 10));
});
document.getElementById('dndMapSizeResetBtn').addEventListener('click', () => {
  const slider = document.getElementById('dndMapSizeSlider');
  if (slider) slider.value = DND_MAP_SIZE_DEFAULT;
  dndApplyMapSizePx(DND_MAP_SIZE_DEFAULT);
  dndSaveMapSize(DND_MAP_SIZE_DEFAULT);
});
dndLoadMapSize();

// ---- input รูปพื้นหลังแมพ (DM อัปโหลด/ล้างพื้นหลัง) ----
document.getElementById('dndMapBgInput').addEventListener('change', ev => {
  readDndImageFile(ev.target.files[0], image => { if (image) send({ type: 'dndMapBackgroundUpdate', image }); ev.target.value = ''; });
});
document.getElementById('dndMapBgClearBtn').onclick = () => send({ type: 'dndMapBackgroundUpdate', image: null });

// ---- ขนาดตาราง (grid) ของแผนที่ที่กำลังเลือกอยู่ (DM ปรับได้) ----
document.getElementById('dndMapGridSizeInput').addEventListener('change', ev => {
  const n = parseInt(ev.target.value, 10);
  if (!Number.isFinite(n)) { ev.target.value = dndMapGridSize; return; }
  send({ type: 'dndMapGridSizeUpdate', mapId: dndCurrentMapId, gridSize: n });
});

// ---- toggle เปิด/ปิดระบบวิสัยทัศน์ (fog of war) ----
document.getElementById('dndVisionEnabledToggle').addEventListener('change', (ev) => {
  send({ type: 'dndVisionToggle', enabled: ev.target.checked });
});

// ---- toggle เปิด/ปิด "แชร์วิสัยทัศน์ในปาร์ตี้" + จัดการกรุ๊ปแชร์วิสัยทัศน์ (สร้าง/ลบ/เลือกสมาชิก) ----
document.getElementById('dndPartyVisionSharedToggle').addEventListener('change', (ev) => {
  send({ type: 'dndPartyVisionToggle', enabled: ev.target.checked });
});
document.getElementById('dndPartyVisionGroupAddBtn').addEventListener('click', () => {
  send({ type: 'dndPartyVisionGroupCreate' });
});
// แผงควบคุมฝั่ง DM: เปิด/ปิด sub-row ตามค่า state ปัจจุบัน + วาดกรุ๊ปแต่ละกรุ๊ปพร้อม checkbox เลือกสมาชิก (1 คนอยู่ได้กรุ๊ปเดียว — เลือกในกรุ๊ปอื่นจะถูกเอาออกจากกรุ๊ปเดิมให้อัตโนมัติฝั่งเซิร์ฟเวอร์)
function renderDndPartyVisionControls() {
  const isDM = !!(dndYou && dndYou.isDM);
  const sharedToggle = document.getElementById('dndPartyVisionSharedToggle');
  const subRow = document.getElementById('dndPartyVisionSubRow');
  const groupsBox = document.getElementById('dndPartyVisionGroupsBox');
  if (!isDM || !sharedToggle || !subRow || !groupsBox) return;
  if (document.activeElement !== sharedToggle) sharedToggle.checked = dndPartyVisionShared;
  subRow.style.display = dndPartyVisionShared ? 'block' : 'none';
  if (!dndPartyVisionShared) return;
  const groups = dndPartyVisionGroups || [];
  groupsBox.innerHTML = groups.length ? '' : '<div class="dndRangeHint">ยังไม่มีกรุ๊ป — กด "+ เพิ่มกรุ๊ป" เพื่อสร้างกรุ๊ปแรก คนที่ไม่ได้อยู่กรุ๊ปไหนจะเห็นแค่รอบ token ตัวเอง</div>';
  groups.forEach((g, i) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'border:1px solid rgba(255,255,255,0.12); border-radius:8px; padding:8px; margin-top:6px;';
    const assigned = new Set(g.playerIds || []);
    const chips = dndPlayersList.filter(p => !p.isDM).map(p => {
      const label = escapeHtml(p.character.charName || p.name);
      const checked = assigned.has(p.id) ? 'checked' : '';
      return `<label class="dndAssignChip"><input type="checkbox" data-pvgid="${g.id}" data-pvid="${p.id}" ${checked}> ${label}</label>`;
    }).join('');
    wrap.innerHTML = `<div class="dndFieldRow" style="align-items:center; justify-content:space-between; margin-bottom:6px;">
      <b style="color:#ffd76b; font-size:12px;">👥 กรุ๊ป ${i + 1}</b>
      <button type="button" class="linkBtn" data-pvgdel="${g.id}" style="color:#ff8080;">ลบกรุ๊ปนี้</button>
    </div>
    <div style="display:flex; flex-wrap:wrap; gap:8px;">${chips}</div>`;
    groupsBox.appendChild(wrap);
  });
  groupsBox.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.onchange = () => {
      const groupId = Number(cb.dataset.pvgid);
      const ids = Array.from(groupsBox.querySelectorAll(`input[data-pvgid="${groupId}"]:checked`)).map(el => Number(el.dataset.pvid));
      send({ type: 'dndPartyVisionGroupPlayersUpdate', groupId, playerIds: ids });
    };
  });
  groupsBox.querySelectorAll('button[data-pvgdel]').forEach(btn => {
    btn.onclick = () => send({ type: 'dndPartyVisionGroupDelete', groupId: Number(btn.dataset.pvgdel) });
  });
}

// ================== กำแพง (Wall): DM วาดเส้นกำแพงลงบนแผนที่ ==================
// เก็บพิกัดเป็น % ของแผนที่เหมือน token (0-100 ทั้งสองแกน) ผ่าน SVG overlay ที่ใช้ viewBox 0 0 100 100
// แบบ preserveAspectRatio="none" ตำแหน่งจะยืดหดตามกล่องแคนวาสจริงเหมือนกับที่ token ใช้ left/top %
function dndSetWallMode(on) {
  dndWallModeOn = on;
  const btn = document.getElementById('dndWallModeToggleBtn');
  const hint = document.getElementById('dndWallModeHint');
  const canvas = document.getElementById('dndMapCanvas');
  if (btn) {
    btn.textContent = on ? '🧱 โหมดวาดกำแพง: เปิด (คลิกเพื่อปิด)' : '🧱 โหมดวาดกำแพง: ปิด';
    btn.classList.toggle('active', on);
  }
  if (hint) hint.style.display = on ? 'block' : 'none';
  if (canvas) canvas.style.cursor = on ? 'crosshair' : '';
}
const dndWallModeToggleBtnEl = document.getElementById('dndWallModeToggleBtn');
if (dndWallModeToggleBtnEl) dndWallModeToggleBtnEl.onclick = () => dndSetWallMode(!dndWallModeOn);
const dndWallClearBtnEl = document.getElementById('dndWallClearBtn');
if (dndWallClearBtnEl) dndWallClearBtnEl.onclick = () => {
  if (!dndWalls.length) return;
  if (confirm('ล้างกำแพงทั้งหมดบนแผนที่นี้?')) send({ type: 'dndWallClear' });
};
function dndCanvasPct(ev, canvas) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100));
  const y = Math.max(0, Math.min(100, ((ev.clientY - rect.top) / rect.height) * 100));
  return { x, y };
}
function dndGetMapWallLayer() {
  const canvas = document.getElementById('dndMapCanvas');
  if (!canvas) return null;
  let layer = document.getElementById('dndWallLayer');
  if (!layer || layer.parentElement !== canvas) {
    layer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    layer.id = 'dndWallLayer';
    layer.setAttribute('viewBox', '0 0 100 100');
    layer.setAttribute('preserveAspectRatio', 'none');
    canvas.insertBefore(layer, canvas.firstChild); // แทรกไว้ล่างสุด (ก่อน token ทั้งหมด) กำแพงจะได้ไม่บังตัวละคร
  }
  return layer;
}
// วาดกำแพงทั้งหมดของแผนที่ปัจจุบันใหม่ทุกครั้งที่ state เปลี่ยน (จำนวนน้อย ไม่ต้อง diff เหมือน token)
function renderDndWalls() {
  const layer = dndGetMapWallLayer();
  if (!layer) return;
  const isDM = !!(dndYou && dndYou.isDM);
  if (!isDM) { layer.innerHTML = ''; return; } // ผู้เล่นไม่เห็นเส้นกำแพงเลย (แต่กำแพงยังบังสายตาได้ตามปกติผ่านการคำนวณ FOV)
  layer.innerHTML = dndWalls.map(w =>
    `<line x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" class="dndWallHit" data-wall="${w.id}" vector-effect="non-scaling-stroke"></line>` +
    `<line x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" class="dndWallLine" vector-effect="non-scaling-stroke"></line>`
  ).join('');
  if (isDM) {
    layer.querySelectorAll('.dndWallHit').forEach(el => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (confirm('ลบกำแพงเส้นนี้?')) send({ type: 'dndWallDelete', id: Number(el.dataset.wall) });
      });
    });
  }
}
// ลากเมาส์/นิ้วบนแผนที่เพื่อวาดกำแพงเป็นเส้นตรง (เฉพาะ DM ตอนเปิดโหมดวาดกำแพงอยู่)
(function initDndWallDrawing() {
  const canvas = document.getElementById('dndMapCanvas');
  if (!canvas) return;
  let previewLine = null;
  canvas.addEventListener('pointerdown', (ev) => {
    if (!dndWallModeOn || !(dndYou && dndYou.isDM)) return;
    if (ev.target.closest('.dndToken') || ev.target.closest('.dndWallHit')) return; // ไม่ให้ชนกับการลาก token หรือคลิกลบกำแพงเดิม
    ev.preventDefault();
    const start = dndCanvasPct(ev, canvas);
    dndWallDrawStart = start;
    const layer = dndGetMapWallLayer();
    previewLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    previewLine.setAttribute('class', 'dndWallLinePreview');
    previewLine.setAttribute('x1', start.x); previewLine.setAttribute('y1', start.y);
    previewLine.setAttribute('x2', start.x); previewLine.setAttribute('y2', start.y);
    previewLine.setAttribute('vector-effect', 'non-scaling-stroke');
    if (layer) layer.appendChild(previewLine);
    canvas.setPointerCapture(ev.pointerId);
    const move = (mev) => {
      const cur = dndCanvasPct(mev, canvas);
      if (previewLine) { previewLine.setAttribute('x2', cur.x); previewLine.setAttribute('y2', cur.y); }
    };
    const up = (uev) => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      const end = dndCanvasPct(uev, canvas);
      if (previewLine) { previewLine.remove(); previewLine = null; }
      if (dndWallDrawStart && Math.hypot(end.x - dndWallDrawStart.x, end.y - dndWallDrawStart.y) >= 1) {
        send({ type: 'dndWallCreate', wall: { x1: dndWallDrawStart.x, y1: dndWallDrawStart.y, x2: end.x, y2: end.y } });
      }
      dndWallDrawStart = null;
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  });
})();

// ---- แอนิเมชันโจมตีบนแผนที่ (ทั้งผู้เล่นและมอนสเตอร์): กระสุนพุ่งจากผู้โจมตีไปเป้าหมาย + เอฟเฟกต์กระทบ/สั่นเมื่อโดน ----
// ใช้พิกัด token เดียวกับที่วาดบนแผนที่ (หน่วย % 0-100) จึงไม่ต้องคำนวณพิกเซลใด ๆ เลย ทำงานได้แม้แผนที่ยังไม่แสดงผลบนจอ
function dndGetMapFxLayer() {
  const canvas = document.getElementById('dndMapCanvas');
  if (!canvas) return null;
  let layer = document.getElementById('dndMapFxLayer');
  if (!layer || layer.parentElement !== canvas) {
    layer = document.createElement('div');
    layer.id = 'dndMapFxLayer';
    canvas.appendChild(layer);
  }
  return layer;
}
function dndTokenPosPct(tokenId) {
  if (tokenId == null) return null;
  const t = dndTokens.find(tt => tt.id === Number(tokenId));
  return t ? { x: t.x, y: t.y } : null;
}
function dndFlashToken(tokenId, cls, ms) {
  const el = dndTokenEls[tokenId];
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth; // รีสตาร์ท animation ให้เล่นใหม่ทุกครั้งแม้จะเป็นคลาสเดิม
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms || 500);
}
function dndSpawnFloatNum(layer, pos, text, extraClass) {
  const el = document.createElement('div');
  el.className = 'dndAtkFloatNum' + (extraClass ? ' ' + extraClass : '');
  el.style.left = pos.x + '%';
  el.style.top = pos.y + '%';
  el.textContent = text;
  layer.appendChild(el);
  requestAnimationFrame(() => el.classList.add('dndFxFloat'));
  setTimeout(() => el.remove(), 950);
}
function playDndMapAttackAnim(data) {
  const layer = dndGetMapFxLayer();
  if (!layer) return;
  const atkPos = dndTokenPosPct(data.atkTokenId);
  const tgtPos = dndTokenPosPct(data.tgtTokenId);

  // ผู้โจมตี (ผู้เล่นหรือมอนสเตอร์) เด้งตัวตอนออกท่า — เห็นได้ชัดว่าใครเป็นคนลงมือ
  if (data.atkTokenId != null) dndFlashToken(data.atkTokenId, 'dndFxAttacking', 320);

  // ยิงเส้นแสง/กระสุนจากผู้โจมตีไปยังเป้าหมาย ถ้ารู้ตำแหน่งทั้งคู่บนแผนที่ปัจจุบัน
  if (atkPos && tgtPos && data.atkTokenId !== data.tgtTokenId) {
    const proj = document.createElement('div');
    proj.className = 'dndAtkProjectile';
    proj.style.left = atkPos.x + '%';
    proj.style.top = atkPos.y + '%';
    layer.appendChild(proj);
    requestAnimationFrame(() => {
      proj.style.transition = 'left 0.34s ease-out, top 0.34s ease-out';
      proj.classList.add('dndFxFly');
      proj.style.left = tgtPos.x + '%';
      proj.style.top = tgtPos.y + '%';
    });
    setTimeout(() => proj.remove(), 420);
  }

  const impactDelay = (atkPos && tgtPos) ? 360 : 0;
  setTimeout(() => {
    if (!tgtPos || data.tgtTokenId == null) return;
    const burst = document.createElement('div');
    burst.className = 'dndAtkBurst dndFxBurst' + ((data.fumble || data.hit === false) ? ' dndFxBurstMiss' : (data.crit ? ' dndFxBurstCrit' : ''));
    burst.style.left = tgtPos.x + '%';
    burst.style.top = tgtPos.y + '%';
    layer.appendChild(burst);
    setTimeout(() => burst.remove(), 450);

    if (data.fumble || data.hit === false) {
      dndFlashToken(data.tgtTokenId, 'dndFxMiss', 380);
      dndSpawnFloatNum(layer, tgtPos, data.fumble ? '💨 พลาดสุด ๆ' : '🛡️ หลบ!', 'dndFxFloatMiss');
    } else if (data.damage != null) {
      dndFlashToken(data.tgtTokenId, 'dndFxHit', 420);
      dndSpawnFloatNum(layer, tgtPos, (data.crit ? '💥 -' : '-') + data.damage, data.crit ? 'dndFxFloatCrit' : '');
    } else if (data.hit === true) {
      dndFlashToken(data.tgtTokenId, 'dndFxHit', 420);
    }

    // ---- AOE: วาดพื้นที่ตามรูปแบบที่ตั้งไว้ — วงกลม (ขยายวงแหวนรอบเป้าหมายหลัก) หรือเส้นตรง (คานแสงจากผู้โจมตีไปเป้าหมายหลัก)
    // ขนาดประมาณสัดส่วนคร่าว ๆ จากความกว้าง/สูงจริงของแผนที่บนจอ + กระพริบ/เด้งตัวเลขให้ทุกเป้าหมายที่โดนลูกหลง
    if (data.aoeRadius > 0) {
      const canvas = document.getElementById('dndMapCanvas');
      const wpx = canvas ? canvas.clientWidth : 600;
      const hpx = canvas ? canvas.clientHeight : 600;
      if (data.aoeShape === 'line' && atkPos) {
        const dxPx = (tgtPos.x - atkPos.x) / 100 * wpx;
        const dyPx = (tgtPos.y - atkPos.y) / 100 * hpx;
        const lengthPx = Math.max(4, Math.hypot(dxPx, dyPx));
        const angleDeg = Math.atan2(dyPx, dxPx) * 180 / Math.PI;
        const thicknessPx = Math.max(10, (data.aoeRadius / 100) * wpx * 2);
        const beam = document.createElement('div');
        beam.className = 'dndAtkAoeLine dndFxAoeLine';
        beam.style.left = atkPos.x + '%';
        beam.style.top = `calc(${atkPos.y}% - ${thicknessPx / 2}px)`;
        beam.style.width = lengthPx + 'px';
        beam.style.height = thicknessPx + 'px';
        beam.style.transform = `rotate(${angleDeg}deg)`;
        layer.appendChild(beam);
        setTimeout(() => beam.remove(), 600);
      } else {
        const ring = document.createElement('div');
        ring.className = 'dndAtkAoeRing dndFxAoeRing';
        const sizePx = Math.max(20, (data.aoeRadius / 100) * wpx * 2);
        ring.style.width = sizePx + 'px';
        ring.style.height = sizePx + 'px';
        ring.style.left = tgtPos.x + '%';
        ring.style.top = tgtPos.y + '%';
        layer.appendChild(ring);
        setTimeout(() => ring.remove(), 600);
      }

      (data.aoeHits || []).forEach(hitInfo => {
        const pos = dndTokenPosPct(hitInfo.tokenId);
        if (!pos) return;
        setTimeout(() => {
          dndFlashToken(hitInfo.tokenId, 'dndFxHit', 400);
          dndSpawnFloatNum(layer, pos, '-' + hitInfo.damage, 'dndFxFloatAoe');
        }, 120);
      });
    }
  }, impactDelay);
}

// ================== แผนที่การต่อสู้ (Battle Map) ==================
function dndMyToken() {
  if (!dndYou) return null;
  return dndTokens.find(t => t.kind === 'pc' && t.ownerId === dndYou.id) || null;
}
// สัตว์อัญเชิญทั้งหมดที่เป็นของผู้เล่นคนนี้ (โมดูล 5: แผงควบคุมฝั่งผู้เล่น) — DM ไม่มี "ของตัวเอง" เพราะ DM ไม่ร่ายสกิล
function dndMySummonTokens() {
  if (!dndYou || dndYou.isDM) return [];
  return dndTokens.filter(t => t.kind === 'npc' && !!t.summoned && t.ownerId === dndYou.id);
}
// entry ของลำดับเทิร์นที่กำลังถึงตาอยู่ตอนนี้ (ทั้ง pc และ npc) — ใช้ทั้งเช็คสิทธิ์ลาก/สั่งโจมตี และไฮไลต์ UI
function dndCurrentTurnEntryClient() {
  if (dndTurnIndexClient < 0 || dndTurnIndexClient >= dndTurnOrderClient.length) return null;
  return dndTurnOrderClient[dndTurnIndexClient];
}
// ข้อความเวลาคงเหลือก่อนสัตว์อัญเชิญหมดอายุ (mm:ss) — null ถ้าไม่มีกำหนดหมดอายุ
function dndSummonTimeLeftText(t) {
  if (!t || !t.summonExpiresAt) return null;
  const remain = Math.max(0, Math.ceil((t.summonExpiresAt - Date.now()) / 1000));
  const m = Math.floor(remain / 60), s = remain % 60;
  return `⏳${m}:${String(s).padStart(2, '0')}`;
}
// เช็คว่าผู้เล่นคนนี้ "อยู่ในแผนที่" ที่กำลังแสดงอยู่ตอนนี้หรือไม่ — ต้องถูก DM เลือกไว้เท่านั้น (ไม่เลือกเลย = ยังไม่มีใครอยู่ในแผนที่นี้)
function dndPlayerInCurrentMap(playerId) {
  const current = dndMaps.find(m => m.id === dndCurrentMapId);
  return !!(current && Array.isArray(current.playerIds) && current.playerIds.includes(Number(playerId)));
}
// คืนข้อความเหตุผลที่ขยับ token นี้ไม่ได้ตอนนี้ เฉพาะเงื่อนไขเรื่อง "ตาเดิน" (ไม่รวมเรื่องเป็นเจ้าของ/ตายไปแล้ว) — null แปลว่าขยับได้
// t ไม่ระบุ (undefined) = เช็คแบบเดิม (ตาตัวละครผู้เล่นเอง) เผื่อจุดอื่นเรียกไม่ส่ง token มา; ถ้าส่ง token kind:'npc' มา จะเช็คว่าถึงตาของสัตว์อัญเชิญตัวนั้นเป๊ะๆ แทน (คนละ entry กับตาตัวเอง)
function dndTurnBlockReason(t) {
  if (!dndYou || dndYou.isDM) return null;
  if (dndTurnIndexClient < 0) return null; // ยังไม่กด "เริ่มเทิร์น" เลย ยังลากได้อิสระ
  const isSummonEntry = !!(t && t.kind === 'npc');
  const entry = dndCurrentTurnEntryClient();
  const myEntryNow = !!entry && (isSummonEntry ? (entry.kind === 'npc' && entry.id === t.id) : (entry.kind === 'pc' && entry.id === dndYou.id));
  if (!myEntryNow) return isSummonEntry ? 'ยังไม่ถึงตาของสัตว์อัญเชิญตัวนี้ รอให้ถึงตาก่อนถึงจะขยับได้' : 'ยังไม่ถึงตาคุณ รอให้ถึงตาก่อนถึงจะขยับ token ได้';
  if (dndYou.movedThisTurn) return 'ขยับ token ได้แค่ครั้งเดียวต่อตา รอตาหน้าค่อยขยับใหม่';
  return null;
}
function dndCanDragToken(t) {
  if (!dndYou) return false;
  if (dndYou.isDM) return true;
  const isMySummon = t.kind === 'npc' && !!t.summoned && t.ownerId === dndYou.id;
  if (t.kind === 'pc') {
    if (t.ownerId !== dndYou.id) return false;
    if (Number(t.hp) <= 0) return false; // หมดสติ ลาก token ตัวเองไม่ได้
  } else if (isMySummon) {
    if (Number(t.hp) <= 0) return false; // สัตว์อัญเชิญหมดแรง (HP 0) ลากไม่ได้เหมือนกัน
    if (typeof amIDead === 'function' && amIDead()) return false; // เจ้าของหมดสติ/ตายไปแล้ว สั่งสัตว์อัญเชิญไม่ได้เหมือนกัน (ตรงกับเงื่อนไขฝั่งเซิร์ฟเวอร์)
  } else {
    return false; // token คนอื่น/มอนสเตอร์ของ DM — ผู้เล่นทั่วไปลากไม่ได้
  }
  // กำลังนับเทิร์นอยู่ (ตั้งแต่กด "เริ่มเทิร์น") — ขยับได้เฉพาะตอนถึงตาของ entry นี้จริงๆ และขยับได้แค่ครั้งเดียวต่อตา
  return !dndTurnBlockReason(t);
}
function dndTokenInitials(name) {
  return (name || '?').trim().slice(0, 2).toUpperCase();
}
function dndTokenBgStyle(t) {
  return t.image ? `background-image:url('${t.image}'); background-color:transparent;` : `background-color:${t.color || '#6fd3ff'};`;
}
function dndSendTokenMove(id, x, y) {
  send({ type: 'dndTokenMove', id, x, y });
}
function dndAttachTokenDrag(el, tokenId) {
  el.addEventListener('pointerdown', ev => {
    const t = dndTokens.find(tt => tt.id === tokenId);
    if (!t) return;
    if (!dndCanDragToken(t)) {
      // แจ้งเตือนเฉพาะตอนพยายามลาก token ของตัวเอง (ตัวละครหรือสัตว์อัญเชิญ) แต่ติดเงื่อนไขเรื่องตาเดิน
      // (token คนอื่น/มอนสเตอร์ของ DM ไม่ต้องมีข้อความ เพราะลากไม่ได้อยู่แล้วเป็นปกติ)
      const isMine = (t.kind === 'pc' && dndYou && t.ownerId === dndYou.id) || (t.kind === 'npc' && !!t.summoned && dndYou && t.ownerId === dndYou.id);
      if (isMine && Number(t.hp) > 0) {
        const reason = dndTurnBlockReason(t);
        if (reason) showDndErrorToast(reason);
        else if (t.kind === 'npc' && typeof amIDead === 'function' && amIDead()) showDndErrorToast(dndDeadMsgForMe());
      }
      return;
    }
    ev.preventDefault();
    const canvas = document.getElementById('dndMapCanvas');
    dndDraggingId = tokenId;
    el.classList.add('dndTokenDragging');
    el.setPointerCapture(ev.pointerId);
    // สำคัญ: ระหว่างลาก จะขยับแค่ตำแหน่ง token บนหน้าจอตัวเอง (local, ลื่นเต็มที่ ไม่ต้องรอเน็ตเวิร์ก)
    // ไม่ยิง dndTokenMove ไปเซิร์ฟเวอร์ทุกครั้งที่ขยับแล้ว เพราะแต่ละครั้งเซิร์ฟเวอร์จะ broadcast state ทั้งก้อน
    // กลับมาให้ทุกคน (รวมถึงคนลากเอง) ทำให้กระตุก/หน่วง — จะส่งตำแหน่งจริงไปเซิร์ฟเวอร์แค่ "ครั้งเดียว" ตอนปล่อยมือ
    const move = (mev) => {
      const rect = canvas.getBoundingClientRect();
      let x = ((mev.clientX - rect.left) / rect.width) * 100;
      let y = ((mev.clientY - rect.top) / rect.height) * 100;
      x = Math.max(0, Math.min(100, x));
      y = Math.max(0, Math.min(100, y));
      el.style.left = x + '%';
      el.style.top = y + '%';
      const mine = dndMyToken();
      if (mine && mine.id === tokenId) dndApplyVisionFog(x, y); // ลาก token ตัวเอง — อัปเดตวิสัยทัศน์ตามให้ลื่นไปพร้อมกัน
    };
    const up = (uev) => {
      el.classList.remove('dndTokenDragging');
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      const rect = canvas.getBoundingClientRect();
      let x = ((uev.clientX - rect.left) / rect.width) * 100;
      let y = ((uev.clientY - rect.top) / rect.height) * 100;
      x = Math.max(0, Math.min(100, x));
      y = Math.max(0, Math.min(100, y));
      dndSendTokenMove(tokenId, x, y); // ส่งตำแหน่งสุดท้ายครั้งเดียวตอนปล่อยมือ
      dndDraggingId = null;
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  });
}
function renderDndMapTabs() {
  const row = document.getElementById('dndMapTabsRow');
  const label = document.getElementById('dndMapCurrentLabel');
  if (!row) return;
  const isDM = !!(dndYou && dndYou.isDM);
  const current = dndMaps.find(m => m.id === dndCurrentMapId);
  renderDndMapPlayersAssign();
  renderDndPartyVisionControls();
  if (!isDM) {
    row.innerHTML = '';
    row.style.display = 'none';
    if (label) {
      label.style.display = dndMaps.length > 1 ? 'block' : 'none';
      label.textContent = current ? `📍 แผนที่: ${current.name}` : '';
    }
    return;
  }
  row.style.display = 'flex';
  if (label) label.style.display = 'none';
  row.innerHTML = dndMaps.map(m => `
    <div class="dndMapTab${m.id === dndCurrentMapId ? ' active' : ''}" data-switch="${m.id}" title="ดับเบิลคลิกเพื่อเปลี่ยนชื่อ">
      ${escapeHtml(m.name)}
      <span class="dndMapTabDel" data-mapdel="${m.id}" title="ลบแผนที่นี้">✕</span>
    </div>
  `).join('') + '<button type="button" id="dndMapAddBtn">+ สร้างแผนที่ใหม่</button>';
  row.querySelectorAll('.dndMapTab').forEach(el => {
    el.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-mapdel]')) return;
      send({ type: 'dndMapSwitch', mapId: Number(el.dataset.switch) });
    });
    el.addEventListener('dblclick', (ev) => {
      ev.stopPropagation();
      const map = dndMaps.find(mm => mm.id === Number(el.dataset.switch));
      const newName = prompt('เปลี่ยนชื่อแผนที่:', map ? map.name : '');
      if (newName === null || !newName.trim()) return;
      send({ type: 'dndMapRename', mapId: Number(el.dataset.switch), name: newName });
    });
  });
  row.querySelectorAll('[data-mapdel]').forEach(el => {
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (dndMaps.length <= 1) { alert('ต้องมีอย่างน้อย 1 แผนที่เสมอ ลบแผนที่สุดท้ายไม่ได้'); return; }
      if (confirm('ลบแผนที่นี้? มอนสเตอร์ทั้งหมดบนแผนที่นี้จะหายไปด้วย')) {
        send({ type: 'dndMapDelete', mapId: Number(el.dataset.mapdel) });
      }
    });
  });
  const addBtn = document.getElementById('dndMapAddBtn');
  if (addBtn) addBtn.onclick = () => {
    const name = prompt('ตั้งชื่อแผนที่ใหม่:', `แผนที่ ${dndMaps.length + 1}`);
    if (name === null) return;
    send({ type: 'dndMapCreate', name });
  };
  const heading = document.getElementById('dndMapBgHeading');
  if (heading) heading.textContent = `🖼️ พื้นหลังแผนที่ "${current ? current.name : ''}" (DM)`;
}
// DM เลือกว่าผู้เล่นคนไหน "อยู่ในแผนที่" ที่กำลังแสดงอยู่ตอนนี้บ้าง — ไม่เลือกใครเลย = ทุกคนอยู่ในแผนที่นี้เหมือนพฤติกรรมเดิม
function renderDndMapPlayersAssign() {
  const wrap = document.getElementById('dndMapPlayersDmRow');
  const box = document.getElementById('dndMapPlayersAssignBox');
  if (!wrap || !box) return;
  const isDM = !!(dndYou && dndYou.isDM);
  if (!isDM) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  const current = dndMaps.find(m => m.id === dndCurrentMapId);
  const assigned = new Set(Array.isArray(current && current.playerIds) ? current.playerIds : []);
  box.innerHTML = dndPlayersList.filter(p => !p.isDM).map(p => {
    const label = escapeHtml(p.character.charName || p.name);
    const checked = assigned.has(p.id) ? 'checked' : '';
    return `<label class="dndAssignChip"><input type="checkbox" data-pid="${p.id}" ${checked}> ${label}</label>`;
  }).join('');
  box.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.onchange = () => {
      const ids = Array.from(box.querySelectorAll('input[type="checkbox"]:checked')).map(el => Number(el.dataset.pid));
      send({ type: 'dndMapPlayersUpdate', mapId: dndCurrentMapId, playerIds: ids });
    };
  });
}
function renderDndMapBackground() {
  const canvas = document.getElementById('dndMapCanvas');
  if (!canvas) return;
  const cells = Number.isFinite(Number(dndMapGridSize)) && Number(dndMapGridSize) > 0 ? Number(dndMapGridSize) : 10;
  // #dndMapCanvas ถูกล็อกสัดส่วนไว้ที่ 4:3 (กว้าง:สูง) ใน CSS เสมอ ไม่ใช่สี่เหลี่ยมจัตุรัส
  // ถ้าใช้ % เท่ากันทั้งแกน x และ y ช่องตารางจะออกมาเป็นสี่เหลี่ยมผืนผ้า (ไม่ใช่สี่เหลี่ยมจัตุรัส) บนจอจริง
  // ต้องคูณเปอร์เซ็นต์แกน y ด้วย 4/3 เพื่อชดเชยสัดส่วนแคนวาส ให้ช่องออกมาเป็นสี่เหลี่ยมจัตุรัสจริงบนหน้าจอ
  const cellPctX = (100 / cells);
  const cellPctY = cellPctX * (4 / 3);
  const cellPct = cellPctX + '%';
  const cellPctYStr = cellPctY + '%';
  // ตั้งตัวแปร CSS จำนวนช่องตารางไว้ที่ตัวแคนวาส — .dndToken (ลูกของแคนวาส) จะ inherit ไปคำนวณขนาด token
  // ให้เท่ากับ 1 ช่องพอดีเสมอ (ดู .dndToken ใน style.css — ใช้ตัวคูณ 4/3 แบบเดียวกันนี้กับแกนสูง)
  canvas.style.setProperty('--dndGridCols', cells);
  if (dndMapBackground) {
    canvas.style.backgroundImage = `linear-gradient(to right, rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.07) 1px, transparent 1px), url("${dndMapBackground}")`;
    canvas.style.backgroundSize = `${cellPct} ${cellPctYStr}, ${cellPct} ${cellPctYStr}, cover`;
    canvas.style.backgroundPosition = '0 0, 0 0, center';
    canvas.style.backgroundRepeat = 'repeat, repeat, no-repeat';
  } else {
    canvas.style.backgroundImage = 'linear-gradient(to right, rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.07) 1px, transparent 1px)';
    canvas.style.backgroundSize = `${cellPct} ${cellPctYStr}`;
    canvas.style.backgroundPosition = '0 0';
    canvas.style.backgroundRepeat = 'repeat';
  }
  const input = document.getElementById('dndMapGridSizeInput');
  if (input && document.activeElement !== input) input.value = cells;
}
// วิสัยทัศน์ผู้เล่น (Fog of War): DM เห็นแผนที่เต็มเสมอ ผู้เล่นเห็นแค่รอบรัศมี token ตัวเอง นอกรัศมีมืดสนิท
// tok.visionRadius ที่ได้จาก server เป็น % ของแผนที่ที่ "แปลงมาแล้ว" จากหน่วยจำนวนช่องตาราง (grid) ของแผนที่ปัจจุบัน
// (ดูคอมเมนต์ dndPublicToken ฝั่งเซิร์ฟเวอร์ — ทำแบบนี้เพื่อให้รัศมีวิสัยทัศน์ครอบคลุมจำนวนช่องเท่าเดิมเสมอไม่ว่า DM จะปรับตารางเป็นเท่าไหร่)
// ฝั่ง client แค่รับ % นี้มาแปลงเป็นวงรีพิกเซลตามสัดส่วนจริงของแคนวาส (กว้าง/สูงไม่เท่ากัน) ตามปกติ ไม่ต้องรู้เรื่องหน่วยช่องเลย
// กำแพงที่ DM วาดไว้ (dndWalls) จะบังวิสัยทัศน์ด้วย: คำนวณ "พื้นที่มองเห็นได้จริง" ด้วยเทคนิค shadow casting
// (ยิงรังสีจากตำแหน่ง token ไปยังมุมกำแพงทุกจุด + รอบวงกลมแบบเว้นระยะสม่ำเสมอ หาจุดตัดกำแพงที่ใกล้ที่สุดของแต่ละรังสี)
// แล้ววาดเป็น polygon ตัดรู mask ของหมอกแทนวงรีทึบเดิม — เพื่อให้แกน x/y ที่สัดส่วนไม่เท่ากันของแคนวาสไม่บิดมุมคำนวณผิด
// จึงคำนวณทุกอย่างในพิกัด "ปกติแล้ว" (หาร x ด้วย rx, หาร y ด้วย ry ก่อน) ให้ขอบเขตวิสัยทัศน์กลายเป็นวงกลมหนึ่งหน่วยเสียก่อน
function dndHideVisionFog() {
  const fog = document.getElementById('dndFogOverlay');
  if (fog) fog.style.display = 'none';
}
// แผนที่นี้ DM ไม่ได้เลือกให้ผู้เล่นคนนี้เข้ามา (ไม่มี token ตัวเองบนแผนที่ปัจจุบัน) — บังคับมืดสนิททั้งจอ ไม่ว่าจะเปิดระบบวิสัยทัศน์หรือไม่
function dndShowFullDarkFog() {
  const fog = document.getElementById('dndFogOverlay');
  if (!fog) return;
  fog.innerHTML = '';
  fog.style.background = 'rgba(4,5,10,0.985)';
  fog.style.display = 'block';
}
function dndIntersectRaySegment(dx, dy, ax, ay, ex, ey) {
  // รังสี: (x,y) = t*(dx,dy), t>=0 จากจุดกำเนิด (0,0) ; เส้นกำแพง (segment): (x,y) = (ax,ay)+u*(ex,ey), u ใน [0,1]
  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < 1e-9) return null; // ขนานกัน ไม่ตัดกัน
  const t = (ax * ey - ay * ex) / denom;
  const u = (ax * dy - ay * dx) / denom;
  if (t < 0 || u < 0 || u > 1) return null;
  return t;
}
// คำนวณ polygon พื้นที่มองเห็นได้ (หน่วยพิกเซลจริงของแคนวาส) จากตำแหน่งกำเนิด + รัศมีวงรี + กำแพงทั้งหมด (พิกเซล)
function dndComputeVisionPolygonPoints(originPx, rx, ry, segmentsPx) {
  if (!(rx > 0) || !(ry > 0)) return null;
  const norm = (x, y) => ({ x: (x - originPx.x) / rx, y: (y - originPx.y) / ry });
  const segs = segmentsPx.map(s => {
    const a = norm(s.x1, s.y1), b = norm(s.x2, s.y2);
    return { ax: a.x, ay: a.y, ex: b.x - a.x, ey: b.y - a.y };
  });
  const EPS = 0.0003;
  const angles = [];
  segmentsPx.forEach(s => {
    [[s.x1, s.y1], [s.x2, s.y2]].forEach(([px, py]) => {
      const n = norm(px, py);
      const ang = Math.atan2(n.y, n.x);
      angles.push(ang - EPS, ang, ang + EPS);
    });
  });
  const STEPS = 72; // ยิงรังสีรอบวงกลมทุก 5 องศา ให้ขอบวงกลม (จุดที่ไม่มีกำแพงบัง) ยังคงเรียบ
  for (let i = 0; i < STEPS; i++) angles.push((i / STEPS) * Math.PI * 2);
  angles.sort((a, b) => a - b);
  const pts = [];
  for (const ang of angles) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    let closest = 1; // ขอบเขตวิสัยทัศน์ = วงกลมหนึ่งหน่วยหลัง normalize แล้ว
    for (const s of segs) {
      const t = dndIntersectRaySegment(dx, dy, s.ax, s.ay, s.ex, s.ey);
      if (t != null && t < closest) closest = t;
    }
    pts.push({ x: originPx.x + dx * closest * rx, y: originPx.y + dy * closest * ry });
  }
  return pts;
}
// สร้าง svg shape (ellipse หรือ polygon ถ้ามีกำแพงบัง) ของ "แหล่งวิสัยทัศน์" หนึ่งจุด — ใช้ทั้งกับ token ตัวเองและเพื่อนร่วมทีมตอนแชร์วิสัยทัศน์กัน
function dndVisionShapeSvgFor(px, py, rx, ry, wallSegs) {
  if (!wallSegs.length) return `<ellipse cx="${px}" cy="${py}" rx="${rx}" ry="${ry}"></ellipse>`;
  const poly = dndComputeVisionPolygonPoints({ x: px, y: py }, rx, ry, wallSegs);
  if (!poly || !poly.length) return `<ellipse cx="${px}" cy="${py}" rx="${rx}" ry="${ry}"></ellipse>`;
  return `<polygon points="${poly.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}"></polygon>`;
}
function dndApplyVisionFog(xPct, yPct) {
  const canvas = document.getElementById('dndMapCanvas');
  const fog = document.getElementById('dndFogOverlay');
  if (!canvas || !fog) return;
  const isDM = !!(dndYou && dndYou.isDM);
  if (isDM) { dndHideVisionFog(); return; }
  const mine = dndMyToken();
  if (!mine) { dndShowFullDarkFog(); return; } // DM ไม่ได้เลือกผู้เล่นคนนี้เข้าแผนที่นี้ — เห็นมืดสนิทเสมอ
  if (!dndVisionEnabled) { dndHideVisionFog(); return; }
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) { dndHideVisionFog(); return; }
  const wallSegs = (dndWalls || []).map(wall => ({
    x1: (wall.x1 / 100) * w, y1: (wall.y1 / 100) * h,
    x2: (wall.x2 / 100) * w, y2: (wall.y2 / 100) * h,
  }));
  const radiusPctFor = (tok) => Number.isFinite(tok.visionRadius) ? tok.visionRadius : (dndVisionDefaults[tok.visionType || 'normal'] || 24);
  // แหล่งวิสัยทัศน์ของตัวเอง — ใช้ตำแหน่งสด (xPct,yPct) ที่ส่งเข้ามา (ระหว่างลากจะอัปเดตลื่นๆ)
  const myRadiusPct = radiusPctFor(mine);
  const myRx = Math.max(4, (myRadiusPct / 100) * w);
  const myRy = Math.max(4, (myRadiusPct / 100) * h);
  const myPx = (xPct / 100) * w;
  const myPy = (yPct / 100) * h;
  let shapeSvg = dndVisionShapeSvgFor(myPx, myPy, myRx, myRy, wallSegs);
  // แชร์วิสัยทัศน์ในปาร์ตี้: หา "กรุ๊ป" ที่ตัวเองอยู่ (ถ้ามี) แล้วรวมพื้นที่มองเห็นของเพื่อนร่วมกรุ๊ปที่ยังไม่หมดสติเข้ามาด้วย — ไม่อยู่กรุ๊ปไหนเลย = เห็นแค่รอบ token ตัวเอง
  if (dndPartyVisionShared) {
    const myGroup = (dndPartyVisionGroups || []).find(g => (g.playerIds || []).includes(dndYou.id));
    if (myGroup) {
      const mateIds = new Set(myGroup.playerIds);
      const mates = dndTokens.filter(t => t.kind === 'pc' && t.id !== mine.id && Number(t.hp) > 0 && mateIds.has(t.ownerId));
      for (const mate of mates) {
        const mRadiusPct = radiusPctFor(mate);
        const mRx = Math.max(4, (mRadiusPct / 100) * w);
        const mRy = Math.max(4, (mRadiusPct / 100) * h);
        const mPx = (mate.x / 100) * w;
        const mPy = (mate.y / 100) * h;
        shapeSvg += dndVisionShapeSvgFor(mPx, mPy, mRx, mRy, wallSegs);
      }
    }
  }
  fog.innerHTML = `<svg width="100%" height="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <defs>
      <filter id="dndFogEdgeBlur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"></feGaussianBlur></filter>
      <mask id="dndFogMask">
        <rect x="0" y="0" width="${w}" height="${h}" fill="#fff"></rect>
        <g fill="#000" filter="url(#dndFogEdgeBlur)">${shapeSvg}</g>
      </mask>
    </defs>
    <rect x="0" y="0" width="${w}" height="${h}" fill="rgba(4,5,10,0.985)" mask="url(#dndFogMask)"></rect>
  </svg>`;
  fog.style.background = 'none';
  fog.style.display = 'block';
}
window.addEventListener('resize', () => {
  const mine = dndMyToken();
  if (mine) dndApplyVisionFog(mine.x, mine.y); else dndApplyVisionFog(0, 0);
});
function renderDndMap() {
  const canvas = document.getElementById('dndMapCanvas');
  renderDndMapBackground();
  if (!canvas) return;
  renderDndWalls();
  const seenIds = new Set();
  for (const t of dndTokens) {
    seenIds.add(t.id);
    let el = dndTokenEls[t.id];
    if (!el) {
      el = document.createElement('div');
      el.className = 'dndToken';
      el.innerHTML = '<span class="dndTokenInner"></span><span class="dndTokenLabel"></span><span class="dndTokenAcBadge"></span><span class="dndTokenStatusRow"></span><span class="dndTokenHpWrap"><span class="dndTokenHpBarFill"></span></span>';
      canvas.appendChild(el);
      dndTokenEls[t.id] = el;
      dndAttachTokenDrag(el, t.id);
    }
    const canDrag = dndCanDragToken(t);
    const isMySummonToken = t.kind === 'npc' && !!t.summoned && !!dndYou && t.ownerId === dndYou.id;
    el.classList.toggle('dndTokenMine', canDrag && !(dndYou && dndYou.isDM));
    el.classList.toggle('dndTokenDm', canDrag && !!(dndYou && dndYou.isDM));
    // ขอบเส้นประ = สัตว์อัญเชิญของผู้เล่น (ต่างจาก NPC ทั่วไปของ DM ที่เป็นเส้นทึบ) ให้เห็นชัดตั้งแต่แรกเห็นว่าไม่ใช่มอนสเตอร์ของ DM
    el.classList.toggle('dndTokenSummon', !!t.summoned);
    if (dndDraggingId !== t.id) {
      el.style.left = t.x + '%';
      el.style.top = t.y + '%';
    }
    if (t.image) {
      el.style.backgroundImage = `url('${t.image}')`;
      el.style.backgroundColor = 'transparent';
    } else {
      el.style.backgroundImage = 'none';
      el.style.backgroundColor = t.color || '#6fd3ff';
    }
    const inner = el.querySelector('.dndTokenInner');
    inner.textContent = t.image ? '' : dndTokenInitials(t.name);
    // สัตว์อัญเชิญ: ติดไอคอน 🐾 หน้าชื่อบนแผนที่เสมอ ให้ทุกคนแยกออกจาก NPC ของ DM ได้ทันที; DM เห็นชื่อเจ้าของต่อท้ายด้วย (ผู้เล่นคนอื่นไม่เห็น กันสับสนเรื่องสิทธิ์)
    const summonOwner = t.summoned ? dndPlayersList.find(pp => pp.id === t.ownerId) : null;
    const summonOwnerName = summonOwner ? (summonOwner.character.charName || summonOwner.name) : null;
    let labelText = t.name;
    if (t.summoned) {
      labelText = '🐾 ' + labelText;
      if (dndYou && dndYou.isDM && summonOwnerName) labelText += ` (${summonOwnerName})`;
    }
    el.querySelector('.dndTokenLabel').textContent = labelText;
    el.title = t.summoned ? `${t.name} — สัตว์อัญเชิญของ ${summonOwnerName || '?'}` : (t.name + (t.kind === 'npc' ? ' (NPC)' : ''));
    el.querySelector('.dndTokenAcBadge').textContent = '🛡' + (t.ac != null ? t.ac : '-');
    const maxHp = t.maxHp || 0;
    const pct = maxHp > 0 ? Math.max(0, Math.min(100, Math.round((t.hp / maxHp) * 100))) : 0;
    const fill = el.querySelector('.dndTokenHpBarFill');
    const hpWrap = el.querySelector('.dndTokenHpWrap');
    // ไม่บอกเลือดที่เหลือของมอนสเตอร์ (npc) บนแผนที่ให้ผู้เล่นเห็น — DM เห็นได้ทุกตัว, เจ้าของสัตว์อัญเชิญเห็นเลือดของสัตว์ตัวเองได้ด้วย
    const hideHp = t.kind === 'npc' && !(dndYou && (dndYou.isDM || isMySummonToken));
    hpWrap.style.display = hideHp ? 'none' : '';
    if (!hideHp) {
      fill.style.width = pct + '%';
      fill.className = 'dndTokenHpBarFill' + (pct <= 25 ? ' low' : pct <= 60 ? ' mid' : '');
      hpWrap.title = `${t.hp}/${maxHp} HP`;
    }
    const statusRow = el.querySelector('.dndTokenStatusRow');
    const statuses = t.statuses || [];
    statusRow.innerHTML = statuses.map(s => {
      const remainSec = s.expiresAt ? Math.max(0, Math.ceil((s.expiresAt - Date.now()) / 1000)) : 0;
      const icon = s.icon || '☠️';
      const colorStyle = s.color ? ` style="background:${s.color};"` : '';
      return `<span class="dndTokenStatusDot"${colorStyle} title="${escapeHtml(icon)} ${escapeHtml(s.name)}${s.note ? ' — ' + escapeHtml(s.note) : ''}${s.expiresAt ? ` (คูลดาวน์เหลือ ${remainSec}วิ)` : ''}"></span>`;
    }).join('');
    el.classList.toggle('dndTokenDead', Number(t.hp) <= 0);
    el.classList.toggle('dndTokenLarge', t.size === 'large');
    el.classList.toggle('dndTokenHuge', t.size === 'huge');
  }
  for (const id of Object.keys(dndTokenEls)) {
    if (!seenIds.has(Number(id))) {
      dndTokenEls[id].remove();
      delete dndTokenEls[id];
    }
  }
  renderDndMyTokenColorRow();
  renderDndNpcColorRow();
  renderDndMapNpcList();
  renderDndMySummonsPanel();
  renderDndMapTabs();
  refreshOpenDndModals();
  const mine = dndMyToken();
  if (mine && dndDraggingId !== mine.id) dndApplyVisionFog(mine.x, mine.y);
  else if (!mine) dndApplyVisionFog(0, 0);
}
// รีเฟรชรายการในหน้าต่างแก้ไขที่เปิดค้างอยู่ (สถานะ/ท่าโจมตี) เมื่อมี state ใหม่เข้ามา โดยไม่ไปรีเซ็ตช่องกรอกข้อความที่ผู้ใช้กำลังพิมพ์อยู่
function refreshOpenDndModals() {
  if (dndDmEditTargetId != null) {
    const p = dndPlayersList.find(pp => pp.id === dndDmEditTargetId);
    if (p) {
      renderDndStatusChips('dndEditStatusList', p.character.statuses || [], 'player', dndDmEditTargetId);
      renderDmEditSkills(p);
    }
  }
  if (dndTokenEditTargetId != null) {
    const t = dndTokens.find(tt => tt.id === dndTokenEditTargetId && tt.kind === 'npc');
    if (t) {
      renderTokenAttackList(t);
      renderDndStatusChips('dndTokenStatusList', t.statuses || [], 'token', dndTokenEditTargetId);
    }
  }
}
function renderDndMyTokenColorRow() {
  const row = document.getElementById('dndMyTokenColorRow');
  const mine = dndMyToken();
  if (!row || !mine) return;
  if (dndMyTokenColor === null) dndMyTokenColor = mine.color;
  row.innerHTML = DND_TOKEN_COLORS.map(c =>
    `<div class="dndTokenColorSwatch${c === mine.color ? ' active' : ''}" style="background:${c};" data-color="${c}"></div>`
  ).join('');
  row.querySelectorAll('.dndTokenColorSwatch').forEach(sw => {
    sw.onclick = () => send({ type: 'dndTokenEdit', id: mine.id, updates: { color: sw.dataset.color } });
  });
}
function renderDndNpcColorRow() {
  const row = document.getElementById('dndNpcColorRow');
  if (!row) return;
  row.innerHTML = DND_TOKEN_COLORS.map(c =>
    `<div class="dndTokenColorSwatch${c === dndNpcFormColor ? ' active' : ''}" style="background:${c};" data-color="${c}"></div>`
  ).join('');
  row.querySelectorAll('.dndTokenColorSwatch').forEach(sw => {
    sw.onclick = () => { dndNpcFormColor = sw.dataset.color; renderDndNpcColorRow(); };
  });
}
function renderDndMapNpcList() {
  const box = document.getElementById('dndMapNpcList');
  if (!box || !dndYou || !dndYou.isDM) { if (box) box.innerHTML = ''; return; }
  const npcs = dndTokens.filter(t => t.kind === 'npc');
  if (!npcs.length) { box.innerHTML = '<div class="dndRangeHint">ยังไม่มี token NPC</div>'; return; }
  box.innerHTML = npcs.map(t => {
    // สัตว์อัญเชิญของผู้เล่น: ติดป้ายชื่อเจ้าของให้ DM เห็นชัด แยกจากมอนสเตอร์ทั่วไปที่ DM สร้างเอง (ไม่มี ownerId)
    const owner = t.summoned ? dndPlayersList.find(p => p.id === t.ownerId) : null;
    const ownerName = owner ? (owner.character.charName || owner.name) : '?';
    const ownerTag = t.summoned ? ` <span style="color:#7ee8fa;">🐾 อัญเชิญของ ${escapeHtml(ownerName)}</span>` : '';
    return `
    <div class="dndNpcRow">
      <div class="dndNpcSwatch" style="${dndTokenBgStyle(t)}"></div>
      <div class="dndNpcName">${escapeHtml(t.name)} <span style="color:#9aa4b2;">(HP ${t.hp}/${t.maxHp} · AC ${t.ac})</span>${ownerTag}</div>
      <button type="button" class="dndNpcEditBtn" data-edit="${t.id}">✏️ แก้ไข</button>
      <button type="button" class="dndNpcRollBtn" data-roll="${t.id}">🎲 ทอย</button>
      <button type="button" class="dndNpcCopyBtn" data-copy="${t.id}">📋 คัดลอก</button>
      <button type="button" data-del="${t.id}">ลบ</button>
    </div>
  `;
  }).join('');
  box.querySelectorAll('button[data-edit]').forEach(btn => {
    btn.onclick = () => openTokenEdit(Number(btn.dataset.edit));
  });
  box.querySelectorAll('button[data-roll]').forEach(btn => {
    btn.onclick = (ev) => { flashBtn(ev.currentTarget); dndOpenMonsterRoll(npcs.find(n => n.id === Number(btn.dataset.roll))); };
  });
  box.querySelectorAll('button[data-copy]').forEach(btn => {
    btn.onclick = (ev) => { flashBtn(ev.currentTarget); send({ type: 'dndTokenDuplicate', id: Number(btn.dataset.copy) }); };
  });
  box.querySelectorAll('button[data-del]').forEach(btn => {
    btn.onclick = () => send({ type: 'dndTokenDelete', id: Number(btn.dataset.del) });
  });
}
// ---- ผู้เล่น: แผงควบคุมสัตว์อัญเชิญของตัวเอง (โมดูล 5) ----
// ซ่อนกล่องทั้งหมดถ้าเป็น DM หรือยังไม่มีสัตว์อัญเชิญตัวไหนอยู่เลย — ไม่โชว์กล่องเปล่าค้างหน้าจอ
function renderDndMySummonsPanel() {
  const wrap = document.getElementById('dndMySummonsBox');
  const box = document.getElementById('dndMySummonsList');
  if (!wrap || !box) return;
  if (!dndYou || dndYou.isDM) { wrap.style.display = 'none'; box.innerHTML = ''; return; }
  const mine = dndMySummonTokens();
  if (!mine.length) { wrap.style.display = 'none'; box.innerHTML = ''; return; }
  wrap.style.display = 'block';
  const entry = dndCurrentTurnEntryClient();
  box.innerHTML = mine.map(t => {
    const isTurnNow = dndTurnIndexClient >= 0 && !!entry && entry.kind === 'npc' && entry.id === t.id;
    const timeLeft = dndSummonTimeLeftText(t);
    const timeHtml = timeLeft ? ` · <span class="dndSummonCd" data-summon-expires-at="${t.summonExpiresAt}">${timeLeft}</span>` : '';
    const dead = Number(t.hp) <= 0;
    return `
    <div class="dndNpcRow dndMySummonRow${isTurnNow ? ' current' : ''}">
      <div class="dndNpcSwatch" style="${dndTokenBgStyle(t)}"></div>
      <div class="dndNpcName">${isTurnNow ? '🎯 ' : ''}${escapeHtml(t.name)} <span style="color:#9aa4b2;">(HP ${t.hp}/${t.maxHp} · AC ${t.ac}${timeHtml})</span>${dead ? ' <span style="color:#ff8080;">💀 หมดแรงแล้ว</span>' : ''}</div>
      <button type="button" class="dndNpcRollBtn" data-roll="${t.id}"${dead ? ' disabled' : ''}>🎲 โจมตี</button>
      <button type="button" class="dndSummonDismissBtn" data-dismiss="${t.id}">💨 ยกเลิก</button>
    </div>`;
  }).join('');
  box.querySelectorAll('button[data-roll]').forEach(btn => {
    btn.onclick = (ev) => {
      flashBtn(ev.currentTarget);
      const t = mine.find(m => m.id === Number(btn.dataset.roll));
      if (!t) return;
      const reason = dndTurnBlockReason(t);
      if (reason) { showDndErrorToast(reason); return; }
      dndOpenMonsterRoll(t);
    };
  });
  box.querySelectorAll('button[data-dismiss]').forEach(btn => {
    btn.onclick = (ev) => {
      flashBtn(ev.currentTarget);
      const t = mine.find(m => m.id === Number(btn.dataset.dismiss));
      if (confirm(`ยกเลิกอัญเชิญ "${t ? t.name : ''}" เลยไหม? เรียกกลับมาใหม่ไม่ได้จนกว่าจะร่ายสกิลอัญเชิญอีกครั้ง`)) {
        send({ type: 'dndSummonDismiss', tokenId: Number(btn.dataset.dismiss) });
      }
    };
  });
}
function dndReadImageFile(file, cb) {
  if (!file) { cb(null); return; }
  if (file.size > DND_MAX_TOKEN_IMAGE_BYTES) {
    alert('ไฟล์รูปใหญ่เกินไป (จำกัด ~300KB) กรุณาเลือกรูปที่เล็กกว่านี้');
    cb(undefined);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => cb(reader.result);
  reader.readAsDataURL(file);
}
document.getElementById('dndMyTokenImgInput').addEventListener('change', (ev) => {
  const mine = dndMyToken();
  if (!mine) return;
  dndReadImageFile(ev.target.files[0], (dataUrl) => {
    if (dataUrl === undefined) { ev.target.value = ''; return; }
    if (dataUrl) send({ type: 'dndTokenEdit', id: mine.id, updates: { image: dataUrl } });
    ev.target.value = '';
  });
});
document.getElementById('dndMyTokenImgClearBtn').onclick = () => {
  const mine = dndMyToken();
  if (!mine) return;
  send({ type: 'dndTokenEdit', id: mine.id, updates: { image: null } });
};
document.getElementById('dndTokenEditImgInput').addEventListener('change', (ev) => {
  if (dndTokenEditTargetId == null) { ev.target.value = ''; return; }
  dndReadImageFile(ev.target.files[0], (dataUrl) => {
    if (dataUrl === undefined) { ev.target.value = ''; return; }
    if (dataUrl) send({ type: 'dndTokenEdit', id: dndTokenEditTargetId, updates: { image: dataUrl } });
    ev.target.value = '';
  });
});
document.getElementById('dndTokenEditImgClearBtn').onclick = () => {
  if (dndTokenEditTargetId == null) return;
  send({ type: 'dndTokenEdit', id: dndTokenEditTargetId, updates: { image: null } });
};
document.getElementById('dndNpcImgInput').addEventListener('change', (ev) => {
  dndReadImageFile(ev.target.files[0], (dataUrl) => {
    if (dataUrl === undefined) { ev.target.value = ''; return; }
    dndNpcFormImage = dataUrl || null;
  });
});
function dndRenderMonsterPresetPreview() {
  const key = document.getElementById('dndMonsterPresetSelect').value;
  const m = DND_MONSTER_PRESETS.find(mm => mm.key === key);
  document.getElementById('dndMonsterPresetPreview').textContent = m ? dndMonsterPresetSummary(m) : '';
}
document.getElementById('dndMonsterPresetSelect').addEventListener('change', dndRenderMonsterPresetPreview);
dndRefreshMonsterPresetSelect();
document.getElementById('dndMonsterPresetAddBtn').onclick = (ev) => {
  const key = document.getElementById('dndMonsterPresetSelect').value;
  const m = DND_MONSTER_PRESETS.find(mm => mm.key === key);
  if (!m) return;
  flashBtn(ev.currentTarget);
  send({
    type: 'dndTokenCreate',
    token: Object.assign(
      { name: m.name, color: m.color, image: null, maxHp: m.maxHp, ac: m.ac, size: m.size,
        attacks: m.attacks, expReward: m.expReward, goldReward: m.goldReward, loot: m.loot },
      m.stats,
    ),
  });
};
document.getElementById('dndNpcAddBtn').onclick = (ev) => {
  const name = document.getElementById('dndNpcNameInput').value.trim();
  const errEl = document.getElementById('dndNpcAddError');
  if (!name) { errEl.textContent = 'กรุณาตั้งชื่อ NPC'; return; }
  errEl.textContent = '';
  flashBtn(ev.currentTarget);
  send({
    type: 'dndTokenCreate',
    token: {
      name, color: dndNpcFormColor, image: dndNpcFormImage,
      maxHp: document.getElementById('dndNpcMaxHpInput').value,
      ac: document.getElementById('dndNpcAcInput').value,
      size: document.getElementById('dndNpcSizeInput').value,
    },
  });
  document.getElementById('dndNpcNameInput').value = '';
  document.getElementById('dndNpcImgInput').value = '';
  document.getElementById('dndNpcMaxHpInput').value = '20';
  document.getElementById('dndNpcAcInput').value = '10';
  document.getElementById('dndNpcSizeInput').value = 'normal';
  dndNpcFormImage = null;
};

// ---- DM: หน้าต่างแก้ไข token NPC/มอนสเตอร์ (HP/AC, ท่าโจมตี, สถานะดีบัฟ) ----
function openTokenEdit(tokenId) {
  const t = dndTokens.find(tt => tt.id === tokenId && tt.kind === 'npc');
  if (!t) return;
  dndTokenEditTargetId = tokenId;
  document.getElementById('dndTokenEditTitle').textContent = `แก้ไข Token (DM) — ${t.name}`;
  document.getElementById('dndTokenEditName').value = t.name;
  document.getElementById('dndTokenEditHp').value = t.hp;
  document.getElementById('dndTokenEditMaxHp').value = t.maxHp;
  document.getElementById('dndTokenEditAc').value = t.ac;
  document.getElementById('dndTokenEditSize').value = t.size || 'normal';
  Object.keys(DND_STAT_LABELS).forEach(k => { document.getElementById('dndTokenStat-' + k).value = t[k] != null ? t[k] : 10; });
  dndUpdateTokenStatMods();
  document.getElementById('dndTokenEditExp').value = t.expReward || 0;
  document.getElementById('dndTokenEditGold').value = t.goldReward || 0;
  document.getElementById('dndTokenEditLoot').value = (t.loot || []).map(item => `${item.name} x${item.qty}`).join('\n');
  document.getElementById('dndTokenEditStatusResist').value = t.statusResist || 0;
  document.getElementById('dndTokenEditError').textContent = '';
  renderTokenAttackList(t);
  renderDndStatusChips('dndTokenStatusList', t.statuses || [], 'token', tokenId);
  document.getElementById('dndTokenEditOverlay').style.display = 'flex';
}
function dndUpdateTokenStatMods() {
  Object.keys(DND_STAT_LABELS).forEach(k => {
    const input = document.getElementById('dndTokenStat-' + k);
    const modEl = document.getElementById('dndTokenStatMod-' + k);
    if (!input || !modEl) return;
    const score = Number(input.value) || 10;
    const mod = dndAbilityMod(score);
    modEl.textContent = `(${mod >= 0 ? '+' : ''}${mod})`;
  });
}
Object.keys(DND_STAT_LABELS).forEach(k => {
  const input = document.getElementById('dndTokenStat-' + k);
  if (input) input.addEventListener('input', dndUpdateTokenStatMods);
});
function renderTokenAttackList(t) {
  const box = document.getElementById('dndTokenAttackList');
  const attacks = t.attacks || [];
  if (!attacks.length) { box.innerHTML = '<div class="dndRangeHint">ยังไม่มีท่าโจมตี</div>'; return; }
  box.innerHTML = attacks.map(a => {
    const abilityMod = a.stat ? dndAbilityMod(Number(t[a.stat]) || 10) : 0;
    const totalHit = (a.toHit || 0) + abilityMod;
    const totalDmgMod = (a.dmgMod || 0) + abilityMod;
    const hitStr = totalHit ? (totalHit > 0 ? `+${totalHit}` : `${totalHit}`) : '+0';
    const statTag = a.stat ? ` (${DND_STAT_LABELS[a.stat]})` : '';
    const dmgStr = a.dmgDie ? `${a.dmgCount}d${a.dmgDie}${totalDmgMod ? (totalDmgMod > 0 ? '+' + totalDmgMod : totalDmgMod) : ''}` : 'ไม่มีดาเมจ';
    const aoeTag = a.aoeRadius > 0 ? ` · 💥 AOE${a.aoeShape === 'line' ? 'เส้นตรง' : 'รัศมี'} ${a.aoeRadius}` : '';
    const statusTag = a.statusName ? ` · ☠️ ${escapeHtml(a.statusName)} (${a.statusChance || 100}%)` : '';
    return `
    <div class="dndAttackRow">
      <div class="dndAttackInfo">
        <div class="dndAttackName">${escapeHtml(a.name)}${statTag}</div>
        <div class="dndAttackDice">ทอยโจมตี 1d20${hitStr} · ดาเมจ ${dmgStr}${aoeTag}${statusTag}${a.desc ? ' · ' + escapeHtml(a.desc) : ''}</div>
      </div>
      <button type="button" class="dndAttackUseBtn" data-use="${a.id}">🎲 ทอย</button>
      <button type="button" class="dndAttackDelBtn" data-adel="${a.id}">ลบ</button>
    </div>`;
  }).join('');
  box.querySelectorAll('button[data-use]').forEach(btn => {
    const attack = attacks.find(a => a.id === Number(btn.dataset.use));
    btn.onclick = (ev) => {
      flashBtn(ev.currentTarget);
      openDndTargetPicker({
        mode: 'npcAttack',
        tokenId: t.id,
        attackId: Number(btn.dataset.use),
        title: `เลือกเป้าหมายสำหรับ ${t.name}${attack ? ` — ${attack.name}` : ''}`,
        isSummon: !!t.summoned
      });
    };
  });
  box.querySelectorAll('button[data-adel]').forEach(btn => {
    btn.onclick = () => send({ type: 'dndTokenAttackDelete', tokenId: t.id, attackId: Number(btn.dataset.adel) });
  });
}
document.getElementById('dndTokenEditSaveBtn').onclick = (ev) => {
  if (dndTokenEditTargetId == null) return;
  const name = document.getElementById('dndTokenEditName').value.trim();
  if (!name) { document.getElementById('dndTokenEditError').textContent = 'กรุณาตั้งชื่อ'; return; }
  flashBtn(ev.currentTarget);
  send({
    type: 'dndTokenEdit',
    id: dndTokenEditTargetId,
    updates: {
      name,
      hp: document.getElementById('dndTokenEditHp').value,
      maxHp: document.getElementById('dndTokenEditMaxHp').value,
      ac: document.getElementById('dndTokenEditAc').value,
      size: document.getElementById('dndTokenEditSize').value,
      str: document.getElementById('dndTokenStat-str').value,
      dex: document.getElementById('dndTokenStat-dex').value,
      con: document.getElementById('dndTokenStat-con').value,
      int: document.getElementById('dndTokenStat-int').value,
      wis: document.getElementById('dndTokenStat-wis').value,
      cha: document.getElementById('dndTokenStat-cha').value,
      expReward: document.getElementById('dndTokenEditExp').value,
      goldReward: document.getElementById('dndTokenEditGold').value,
      statusResist: document.getElementById('dndTokenEditStatusResist').value,
      loot: document.getElementById('dndTokenEditLoot').value.split('\n').map(line => {
        const m = line.trim().match(/^(.*?)(?:\s+x(\d+))?$/i);
        return m && m[1] ? { name: m[1].trim(), qty: Number(m[2] || 1) } : null;
      }).filter(Boolean),
    },
  });
};
document.getElementById('dndTokenEditCloseBtn').onclick = () => closeDndModals();
// DM: บันทึกมอนสเตอร์ (ที่สร้างเองแบบกำหนดค่าเอง ไม่ได้มาจากพรีเซ็ต) เข้าคลัง DND_MONSTER_PRESETS
// เพื่อให้เลือกกดสร้างซ้ำได้จากลิสต์ "คลังมอนสเตอร์สำเร็จรูป" ในครั้งต่อไป
document.getElementById('dndTokenSaveAsPresetBtn').onclick = (ev) => {
  if (dndTokenEditTargetId == null) return;
  const t = dndTokens.find(tt => tt.id === dndTokenEditTargetId && tt.kind === 'npc');
  const msgEl = document.getElementById('dndTokenSaveAsPresetMsg');
  const name = document.getElementById('dndTokenEditName').value.trim();
  if (!name) { msgEl.style.color = '#ff8080'; msgEl.textContent = 'กรุณาตั้งชื่อก่อนบันทึกเข้าคลัง'; return; }
  flashBtn(ev.currentTarget);
  const emoji = (document.getElementById('dndTokenEditEmoji').value || '👾').trim().slice(0, 4) || '👾';
  const stats = {};
  Object.keys(DND_STAT_LABELS).forEach(k => { stats[k] = Number(document.getElementById('dndTokenStat-' + k).value) || 10; });
  const loot = document.getElementById('dndTokenEditLoot').value.split('\n').map(line => {
    const m = line.trim().match(/^(.*?)(?:\s+x(\d+))?$/i);
    return m && m[1] ? { name: m[1].trim(), qty: Number(m[2] || 1) } : null;
  }).filter(Boolean);
  const preset = {
    key: dndSlugifyMonsterName(name), name, emoji,
    color: (t && t.color) || dndNpcFormColor, size: document.getElementById('dndTokenEditSize').value,
    maxHp: Number(document.getElementById('dndTokenEditMaxHp').value) || 1,
    ac: Number(document.getElementById('dndTokenEditAc').value) || 0,
    stats,
    attacks: (t && t.attacks ? t.attacks : []).map(a => ({
      name: a.name, desc: a.desc, stat: a.stat, toHit: a.toHit, dmgDie: a.dmgDie, dmgCount: a.dmgCount, dmgMod: a.dmgMod, aoeRadius: a.aoeRadius || 0, aoeShape: a.aoeShape || 'circle',
    })),
    expReward: Number(document.getElementById('dndTokenEditExp').value) || 0,
    goldReward: Number(document.getElementById('dndTokenEditGold').value) || 0,
    loot,
  };
  DND_MONSTER_PRESETS.push(preset);
  dndSaveCustomPresetsToStorage();
  dndRefreshMonsterPresetSelect();
  document.getElementById('dndMonsterPresetSelect').value = preset.key;
  dndRenderMonsterPresetPreview();
  msgEl.style.color = '#7ee87e';
  msgEl.textContent = `✅ เพิ่ม "${emoji} ${name}" เข้าคลังมอนสเตอร์แล้ว — เลือกจากลิสต์ด้านบนเพื่อกดสร้างซ้ำได้เลยครั้งหน้า`;
};
document.getElementById('dndAtkAddBtn').onclick = (ev) => {
  if (dndTokenEditTargetId == null) return;
  const name = document.getElementById('dndAtkNameInput').value.trim();
  if (!name) return;
  flashBtn(ev.currentTarget);
  send({
    type: 'dndTokenAttackAdd',
    tokenId: dndTokenEditTargetId,
    attack: {
      name,
      stat: document.getElementById('dndAtkStatSelect').value,
      toHit: document.getElementById('dndAtkToHitInput').value,
      dmgDie: document.getElementById('dndAtkDieSelect').value,
      dmgCount: document.getElementById('dndAtkCountInput').value,
      dmgMod: document.getElementById('dndAtkModInput').value,
      desc: document.getElementById('dndAtkDescInput').value,
      aoeRadius: document.getElementById('dndAtkAoeRadiusInput').value,
      aoeShape: document.getElementById('dndAtkAoeShapeInput').value,
      status: {
        name: document.getElementById('dndAtkStatusName').value,
        note: document.getElementById('dndAtkStatusNote').value,
        chance: document.getElementById('dndAtkStatusChance').value,
        durationSec: document.getElementById('dndAtkStatusDuration').value,
        atkMod: document.getElementById('dndAtkStatusAtk').value,
        dmgMod: document.getElementById('dndAtkStatusDmg').value,
        defMod: document.getElementById('dndAtkStatusDef').value,
        tickValue: document.getElementById('dndAtkStatusTick').value,
        tickIntervalSec: document.getElementById('dndAtkStatusTickInterval').value,
        icon: document.getElementById('dndAtkStatusIcon').value,
        color: document.getElementById('dndAtkStatusColor').value,
      },
    },
  });
  document.getElementById('dndAtkNameInput').value = '';
  document.getElementById('dndAtkStatSelect').value = '';
  document.getElementById('dndAtkToHitInput').value = '0';
  document.getElementById('dndAtkDieSelect').value = '0';
  document.getElementById('dndAtkCountInput').value = '1';
  document.getElementById('dndAtkModInput').value = '0';
  document.getElementById('dndAtkDescInput').value = '';
  document.getElementById('dndAtkAoeRadiusInput').value = '0';
  document.getElementById('dndAtkAoeShapeInput').value = 'circle';
  document.getElementById('dndAtkStatusName').value = '';
  document.getElementById('dndAtkStatusNote').value = '';
  document.getElementById('dndAtkStatusChance').value = '100';
  document.getElementById('dndAtkStatusDuration').value = '0';
  document.getElementById('dndAtkStatusAtk').value = '0';
  document.getElementById('dndAtkStatusDmg').value = '0';
  document.getElementById('dndAtkStatusDef').value = '0';
  document.getElementById('dndAtkStatusTick').value = '0';
  document.getElementById('dndAtkStatusTickInterval').value = '6';
  document.getElementById('dndAtkStatusIcon').value = '';
  document.getElementById('dndAtkStatusColor').value = '#ff6b6b';
};
document.getElementById('dndTokenStatusAddBtn').onclick = (ev) => {
  if (dndTokenEditTargetId == null) return;
  const name = document.getElementById('dndTokenStatusName').value.trim();
  if (!name) return;
  flashBtn(ev.currentTarget);
  const durationSec = Math.max(0, Math.min(86400, Math.round(Number(document.getElementById('dndTokenStatusDuration').value) || 0)));
  const tAtkMod = Number(document.getElementById('dndTokenStatusAtk').value) || 0;
  const tDmgMod = Number(document.getElementById('dndTokenStatusDmg').value) || 0;
  const tDefMod = Number(document.getElementById('dndTokenStatusDef').value) || 0;
  const tTickValue = Number(document.getElementById('dndTokenStatusTick').value) || 0;
  const tTickIntervalSec = Number(document.getElementById('dndTokenStatusTickInterval').value) || 0;
  const tIcon = document.getElementById('dndTokenStatusIcon').value;
  const tColor = document.getElementById('dndTokenStatusColor').value;
  send({ type: 'dndStatusApply', status: { targetType: 'token', targetId: dndTokenEditTargetId, name, note: document.getElementById('dndTokenStatusNote').value, durationSec, atkMod: tAtkMod, dmgMod: tDmgMod, defMod: tDefMod, tickValue: tTickValue, tickIntervalSec: tTickIntervalSec, icon: tIcon, color: tColor } });
  document.getElementById('dndTokenStatusName').value = '';
  document.getElementById('dndTokenStatusNote').value = '';
  document.getElementById('dndTokenStatusDuration').value = '';
  document.getElementById('dndTokenStatusAtk').value = '';
  document.getElementById('dndTokenStatusDmg').value = '';
  document.getElementById('dndTokenStatusDef').value = '';
  document.getElementById('dndTokenStatusTick').value = '';
  document.getElementById('dndTokenStatusTickInterval').value = '';
  document.getElementById('dndTokenStatusIcon').value = '';
  document.getElementById('dndTokenStatusColor').value = '#ff6b6b';
};
