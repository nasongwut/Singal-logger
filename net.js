const { exec } = require("child_process");

// ฟังก์ชัน scan Wi-Fi
async function scanWiFi() {
  return new Promise((resolve, reject) => {
    exec("/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -s", (err, stdout, stderr) => {
      if (err) return reject(err);

      const lines = stdout.split("\n")
        .map(l => l.trim())
        .filter(l => l && !l.startsWith("WARNING") && !l.startsWith("SSID"));

      const networks = lines.map(line => {
        // Regex แยก column: SSID, BSSID, RSSI, CHANNEL, HT, CC, SECURITY
        const match = line.match(/^(.+?)\s+([0-9a-f:]{17})\s+(-?\d+)\s+(\d+).*\s+(.*)$/);
        if (!match) return null;
        return {
          ssid: match[1].trim(),
          bssid: match[2].trim(),
          rssi: parseInt(match[3]),
          channel: parseInt(match[4]),
          security: match[5].trim()
        };
      }).filter(n => n !== null);

      resolve(networks);
    });
  });
}

// Test scan ทุก 5 วินาที
setInterval(async () => {
  try {
    console.log("Scanning Wi-Fi...");
    const networks = await scanWiFi();
    console.log(networks);
  } catch (err) {
    console.error("Wi-Fi scan error:", err);
  }
}, 5000);