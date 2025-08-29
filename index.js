const express = require('express');
const wifi = require('node-wifi');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const port = 3000;

// ตั้งค่า wifi
wifi.init({ iface: null });

// เปิดฐานข้อมูล
const db = new sqlite3.Database('./wifi_data.db');

// Middleware สำหรับ static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// สร้างตาราง
db.run(`
  CREATE TABLE IF NOT EXISTS wifi_scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ssid TEXT,
    signal_level INTEGER,
    quality INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// สแกนทุก 1 วินาที
setInterval(() => {
  wifi.scan()
    .then(networks => {
      const stmt = db.prepare("INSERT INTO wifi_scans (ssid, signal_level, quality) VALUES (?, ?, ?)");
      networks.forEach(net => {
        stmt.run(net.ssid || '[ซ่อน]', net.signal_level, net.quality);
      });
      stmt.finalize();
    })
    .catch(error => {
      console.error('สแกนผิดพลาด:', error);
    });
}, 1000);

// ✅ API: ดึงข้อมูล 1 ชั่วโมงล่าสุด
app.get('/api/realtime', (req, res) => {
  db.all(`
    SELECT * FROM wifi_scans
    WHERE timestamp >= datetime('now', '-1 hour')
    ORDER BY timestamp ASC
  `, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ✅ API: ดึงข้อมูลช่วงเวลาย้อนหลัง
app.get('/api/history', (req, res) => {
  const { start, end } = req.query;

  if (!start || !end) {
    return res.status(400).json({ error: 'กรุณาระบุ start และ end ใน query string' });
  }

  db.all(`
    SELECT * FROM wifi_scans
    WHERE timestamp BETWEEN ? AND ?
    ORDER BY timestamp ASC
  `, [start, end], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
