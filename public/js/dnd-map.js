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
let dndTokenEls = {};       // id -> DOM element, so drags/redraws don't rebuild nodes needlessly
let dndDraggingId = null;   // id ของ token ที่กำลังลากอยู่ตอนนี้ (กันไม่ให้ state ที่ค้างมาจาก server มาแย่งตำแหน่งระหว่างลาก)
let dndMyTokenColor = null;
let dndNpcFormColor = DND_TOKEN_COLORS[0];
let dndNpcFormImage = null;
let dndMapBackground = null;
let dndMaps = [];
let dndCurrentMapId = 1;
let dndTokenEditTargetId = null;

// ---- input รูปพื้นหลังแมพ (DM อัปโหลด/ล้างพื้นหลัง) ----
document.getElementById('dndMapBgInput').addEventListener('change', ev => {
  readDndImageFile(ev.target.files[0], image => { if (image) send({ type: 'dndMapBackgroundUpdate', image }); ev.target.value = ''; });
});
document.getElementById('dndMapBgClearBtn').onclick = () => send({ type: 'dndMapBackgroundUpdate', image: null });

// ---- toggle เปิด/ปิดระบบวิสัยทัศน์ (fog of war) ----
document.getElementById('dndVisionEnabledToggle').addEventListener('change', (ev) => {
  send({ type: 'dndVisionToggle', enabled: ev.target.checked });
});

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
  layer.innerHTML = dndWalls.map(w => (isDM
    ? `<line x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" class="dndWallHit" data-wall="${w.id}" vector-effect="non-scaling-stroke"></line>`
    : '') + `<line x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" class="dndWallLine" vector-effect="non-scaling-stroke"></line>`
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

    // ---- AOE: ขยายวงแหวนตามรัศมีที่ตั้งไว้ (ประมาณสัดส่วนคร่าว ๆ จากความกว้างแผนที่) + กระพริบ/เด้งตัวเลขให้ทุกเป้าหมายที่โดนลูกหลง ----
    if (data.aoeRadius > 0) {
      const ring = document.createElement('div');
      ring.className = 'dndAtkAoeRing dndFxAoeRing';
      const canvas = document.getElementById('dndMapCanvas');
      const wpx = canvas ? canvas.clientWidth : 600;
      const sizePx = Math.max(20, (data.aoeRadius / 100) * wpx * 2);
      ring.style.width = sizePx + 'px';
      ring.style.height = sizePx + 'px';
      ring.style.left = tgtPos.x + '%';
      ring.style.top = tgtPos.y + '%';
      layer.appendChild(ring);
      setTimeout(() => ring.remove(), 600);

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
function dndCanDragToken(t) {
  if (!dndYou) return false;
  if (dndYou.isDM) return true;
  if (t.kind === 'pc' && t.ownerId === dndYou.id && Number(t.hp) <= 0) return false; // หมดสติ ลาก token ตัวเองไม่ได้
  return t.kind === 'pc' && t.ownerId === dndYou.id;
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
    if (!t || !dndCanDragToken(t)) return;
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
function renderDndMapBackground() {
  const canvas = document.getElementById('dndMapCanvas');
  if (!canvas) return;
  if (dndMapBackground) {
    canvas.style.backgroundImage = `linear-gradient(to right, rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.07) 1px, transparent 1px), url("${dndMapBackground}")`;
    canvas.style.backgroundSize = '10% 10%, 10% 10%, cover';
    canvas.style.backgroundPosition = '0 0, 0 0, center';
    canvas.style.backgroundRepeat = 'repeat, repeat, no-repeat';
  } else {
    canvas.style.backgroundImage = 'linear-gradient(to right, rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.07) 1px, transparent 1px)';
    canvas.style.backgroundSize = '10% 10%';
    canvas.style.backgroundPosition = '0 0';
    canvas.style.backgroundRepeat = 'repeat';
  }
}
// วิสัยทัศน์ผู้เล่น (Fog of War): DM เห็นแผนที่เต็มเสมอ ผู้เล่นเห็นแค่รอบรัศมี token ตัวเอง นอกรัศมีมืดสนิท
// รัศมีเป็นหน่วย % ของแผนที่เหมือน AOE (ดูคอมเมนต์ฝั่งเซิร์ฟเวอร์) — แปลงเป็นวงรีพิกเซลตามสัดส่วนจริงของแคนวาส (กว้าง/สูงไม่เท่ากัน)
function dndHideVisionFog() {
  const fog = document.getElementById('dndFogOverlay');
  if (fog) fog.style.display = 'none';
}
function dndApplyVisionFog(xPct, yPct) {
  const canvas = document.getElementById('dndMapCanvas');
  const fog = document.getElementById('dndFogOverlay');
  if (!canvas || !fog) return;
  const isDM = !!(dndYou && dndYou.isDM);
  if (isDM || !dndVisionEnabled) { dndHideVisionFog(); return; }
  const mine = dndMyToken();
  if (!mine) { dndHideVisionFog(); return; }
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) { dndHideVisionFog(); return; }
  const radiusPct = Number.isFinite(mine.visionRadius) ? mine.visionRadius : (dndVisionDefaults[mine.visionType || 'normal'] || 24);
  const rx = Math.max(4, (radiusPct / 100) * w);
  const ry = Math.max(4, (radiusPct / 100) * h);
  const px = (xPct / 100) * w;
  const py = (yPct / 100) * h;
  fog.style.background = `radial-gradient(ellipse ${rx}px ${ry}px at ${px}px ${py}px, transparent 0%, transparent 94%, rgba(4,5,10,0.985) 100%)`;
  fog.style.display = 'block';
}
window.addEventListener('resize', () => {
  const mine = dndMyToken();
  if (mine) dndApplyVisionFog(mine.x, mine.y); else dndHideVisionFog();
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
    el.classList.toggle('dndTokenMine', canDrag && !(dndYou && dndYou.isDM));
    el.classList.toggle('dndTokenDm', canDrag && !!(dndYou && dndYou.isDM));
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
    el.querySelector('.dndTokenLabel').textContent = t.name;
    el.title = t.name + (t.kind === 'npc' ? ' (NPC)' : '');
    el.querySelector('.dndTokenAcBadge').textContent = '🛡' + (t.ac != null ? t.ac : '-');
    const maxHp = t.maxHp || 0;
    const pct = maxHp > 0 ? Math.max(0, Math.min(100, Math.round((t.hp / maxHp) * 100))) : 0;
    const fill = el.querySelector('.dndTokenHpBarFill');
    const hpWrap = el.querySelector('.dndTokenHpWrap');
    // ไม่บอกเลือดที่เหลือของมอนสเตอร์ (npc) บนแผนที่ให้ผู้เล่นเห็น — DM เท่านั้นที่เห็น
    const hideHp = t.kind === 'npc' && !(dndYou && dndYou.isDM);
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
  renderDndMapTabs();
  refreshOpenDndModals();
  const mine = dndMyToken();
  if (mine && dndDraggingId !== mine.id) dndApplyVisionFog(mine.x, mine.y);
  else if (!mine) dndHideVisionFog();
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
  box.innerHTML = npcs.map(t => `
    <div class="dndNpcRow">
      <div class="dndNpcSwatch" style="${dndTokenBgStyle(t)}"></div>
      <div class="dndNpcName">${escapeHtml(t.name)} <span style="color:#9aa4b2;">(HP ${t.hp}/${t.maxHp} · AC ${t.ac})</span></div>
      <button type="button" class="dndNpcEditBtn" data-edit="${t.id}">✏️ แก้ไข</button>
      <button type="button" class="dndNpcRollBtn" data-roll="${t.id}">🎲 ทอย</button>
      <button type="button" class="dndNpcCopyBtn" data-copy="${t.id}">📋 คัดลอก</button>
      <button type="button" data-del="${t.id}">ลบ</button>
    </div>
  `).join('');
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
    const aoeTag = a.aoeRadius > 0 ? ` · 💥 AOE รัศมี ${a.aoeRadius}` : '';
    return `
    <div class="dndAttackRow">
      <div class="dndAttackInfo">
        <div class="dndAttackName">${escapeHtml(a.name)}${statTag}</div>
        <div class="dndAttackDice">ทอยโจมตี 1d20${hitStr} · ดาเมจ ${dmgStr}${aoeTag}${a.desc ? ' · ' + escapeHtml(a.desc) : ''}</div>
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
        title: `เลือกเป้าหมายสำหรับ ${t.name}${attack ? ` — ${attack.name}` : ''}`
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
      name: a.name, desc: a.desc, stat: a.stat, toHit: a.toHit, dmgDie: a.dmgDie, dmgCount: a.dmgCount, dmgMod: a.dmgMod, aoeRadius: a.aoeRadius || 0,
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
