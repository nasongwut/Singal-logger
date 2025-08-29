const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const ExcelJS = require("exceljs");
const path = require("path");
const { exec } = require("child_process");

const app = express();
const port = 3001;

// SSID ที่ต้องการ monitor
const hosts = ["Cityart aluminium work's", "Hannnyyy"]; // เปลี่ยนเป็น SSID ของคุณ

// SQLite database
const db = new sqlite3.Database("wifi_history.db");

// Create table if not exists
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS wifi_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ssid TEXT,
      timestamp TEXT,
      signal_level REAL,
      frequency REAL,
      channel INTEGER
    )
  `);
});

// ฟังก์ชัน scan Wi-Fi ด้วย airport
async function scanWiFi() {
  return new Promise((resolve, reject) => {
    // เรียก airport scan (sudo ต้องรัน node)
    exec(
      "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -s",
      (err, stdout, stderr) => {
        if (err) return reject(err);
        const lines = stdout.split("\n").slice(1).filter(l => l.trim() !== "");
        const networks = lines.map(line => {
          const parts = line.match(/^(.+?)\s+(-?\d+)\s+(\d+)\s+([\d.]+)/);
          if (!parts) return null;
          return {
            ssid: parts[1].trim(),
            signal_level: parseInt(parts[2]), // dBm
            channel: parseInt(parts[3]),
            frequency: parseFloat(parts[4])
          };
        }).filter(n => n !== null);
        resolve(networks);
      }
    );
  });
}

// Scan Wi-Fi ทุก 5 วินาทีและบันทึกลง DB
setInterval(async () => {
  const timestamp = new Date().toISOString();
  try {
    console.log("Scanning Wi-Fi...");
    const networks = await scanWiFi();
    console.log(networks); // ตรวจสอบผล scan

    hosts.forEach(h => {
      const net = networks.find(n => n.ssid === h);
      if (net) {
        db.run(
          "INSERT INTO wifi_data (ssid, timestamp, signal_level, frequency, channel) VALUES (?,?,?,?,?)",
          [h, timestamp, net.signal_level, net.frequency, net.channel]
        );
      } else {
        db.run(
          "INSERT INTO wifi_data (ssid, timestamp, signal_level, frequency, channel) VALUES (?,?,?,?,?)",
          [h, timestamp, null, null, null]
        );
      }
    });
  } catch (err) {
    console.error("Wi-Fi scan error:", err);
  }
}, 5000);

// API: data for chart with optional time range
app.get("/data", (req, res) => {
  let query = "SELECT * FROM wifi_data";
  const params = [];
  if (req.query.from && req.query.to) {
    query += " WHERE timestamp BETWEEN ? AND ?";
    params.push(req.query.from, req.query.to);
  } else {
    const since = new Date(Date.now() - 3600*1000).toISOString(); // last 1 hour
    query += " WHERE timestamp >= ?";
    params.push(since);
  }
  query += " ORDER BY timestamp ASC";
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const history = {};
    hosts.forEach(h => history[h] = []);
    rows.forEach(r => {
      history[r.ssid].push({
        t: r.timestamp,
        signal: r.signal_level,
        freq: r.frequency,
        channel: r.channel
      });
    });
    res.json({ hosts, history });
  });
});

// API: export Excel
app.get("/export", async (req, res) => {
  db.all("SELECT * FROM wifi_data ORDER BY timestamp ASC", async (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("WiFi History");
    const ssids = hosts;
    sheet.columns = [
      { header: "Timestamp", key: "Timestamp", width: 25 },
      ...ssids.map(s => ({ header: s + "_dBm", key: s + "_dBm", width: 15 })),
      ...ssids.map(s => ({ header: s + "_Freq", key: s + "_Freq", width: 15 })),
      ...ssids.map(s => ({ header: s + "_CH", key: s + "_CH", width: 10 }))
    ];

    const grouped = {};
    rows.forEach(r => {
      if (!grouped[r.timestamp]) grouped[r.timestamp] = {};
      grouped[r.timestamp][r.ssid] = r;
    });

    Object.keys(grouped).forEach(ts => {
      const row = { Timestamp: ts };
      ssids.forEach(s => {
        const net = grouped[ts][s];
        row[s + "_dBm"] = net?.signal_level ?? "";
        row[s + "_Freq"] = net?.frequency ?? "";
        row[s + "_CH"] = net?.channel ?? "";
      });
      sheet.addRow(row);
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=wifi_history.xlsx");
    await workbook.xlsx.write(res);
    res.end();
  });
});

// Serve frontend HTML
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend.html"));
});

app.listen(port, () => {
  console.log("🚀 Server running at http://localhost:" + port);
});