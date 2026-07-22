// ============================================================
// Hearts x8 LAN — จุดเริ่มโปรแกรม
// รันด้วย: npm install && npm start
// แล้วเปิด http://<lan-ip>:3000 จากเครื่องอื่นในวงแลนเดียวกัน
//
// ไฟล์นี้ทำหน้าที่แค่ 2 อย่าง: (1) เสิร์ฟไฟล์หน้าเว็บใน /public
// (2) รับ WebSocket แล้วส่งข้อความต่อให้โมดูล hearts.js หรือ dnd.js
// ตามชนิดของข้อความ — ตรรกะเกมจริงทั้งหมดอยู่ในสองไฟล์นั้น
// ============================================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const hearts = require('./hearts');
const dnd = require('./dnd');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const server = http.createServer((req, res) => {
  let urlPath = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.join(PUBLIC_DIR, urlPath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    const type = ext === '.html' ? 'text/html; charset=utf-8'
      : ext === '.js' ? 'text/javascript'
      : ext === '.css' ? 'text/css'
      : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

wss.on('connection', ws => {
  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    // ข้อความที่ขึ้นต้นด้วย 'dnd' ทั้งหมดเป็นของห้อง D&D
    if (typeof msg.type === 'string' && msg.type.startsWith('dnd')) {
      dnd.handleMessage(ws, msg);
      return;
    }
    // ที่เหลือเป็นข้อความของเกม Hearts (ล็อบบี้ / เล่นไพ่ / แชท ฯลฯ)
    hearts.handleMessage(ws, msg);
  });

  ws.on('close', () => {
    hearts.handleDisconnect(ws);
    dnd.handleDisconnect(ws);
  });
});

setInterval(dnd.sweepExpiredStatuses, 1000);

server.listen(PORT, () => {
  console.log(`Hearts x8 LAN server กำลังรันที่พอร์ต ${PORT}`);
  console.log(`ให้ผู้เล่นในวงแลนเดียวกันเปิดเบราว์เซอร์ไปที่ http://<IP เครื่องนี้>:${PORT}`);
});
