// server.js - Railway Simple Server for ESP32 ↔ Telegram
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// Telegram Bot Config
const BOT_TOKEN = process.env.BOT_TOKEN || "8427933796:AAEq_86aWkKhCTINRO4s_tainPX3dN06jkc";
const CHAT_ID = process.env.CHAT_ID || "1704671838";

// เก็บข้อมูลง่ายๆ ใน memory (ไม่ใช้ database ก่อน)
let sensorData = {
  temperature: 0,
  humidity: 0,
  pm25: 0,
  lastUpdate: null
};

let customerLocation = {
  lat: "",
  lon: "",
  name: "",
  hasLocation: false
};

console.log("🚀 Railway Server Starting...");
console.log("🤖 Bot Token:", BOT_TOKEN.substring(0, 10) + "...");
console.log("💬 Chat ID:", CHAT_ID);

// ==================== ESP32 APIs ====================

// ESP32 ส่งข้อมูล sensor มา
app.post('/sensor-data', (req, res) => {
  try {
    const { temperature, humidity, pm25, deviceId } = req.body;
    
    // เก็บข้อมูล
    sensorData = {
      temperature: temperature,
      humidity: humidity,
      pm25: pm25,
      deviceId: deviceId,
      lastUpdate: new Date().toISOString()
    };
    
    console.log("📊 Sensor data received:", sensorData);
    
    // ส่งไป Telegram (ถ้ามีข้อมูลครบ)
    if (customerLocation.hasLocation) {
      sendSensorDataToTelegram();
    }
    
    res.json({ 
      success: true, 
      message: "Data received",
      timestamp: sensorData.lastUpdate
    });
    
  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).json({ error: "Failed to process data" });
  }
});

// ESP32 ขอข้อมูล location ที่ลูกค้าส่งมา
app.get('/get-location', (req, res) => {
  res.json({
    hasLocation: customerLocation.hasLocation,
    lat: customerLocation.lat,
    lon: customerLocation.lon,
    name: customerLocation.name,
    timestamp: new Date().toISOString()
  });
});

// ==================== Telegram Webhook ====================

// Telegram webhook (ที่ Google Apps Script ทำไม่ได้!)
app.post(`/webhook/${BOT_TOKEN}`, (req, res) => {
  try {
    console.log("📱 Telegram webhook received");
    
    const { message } = req.body;
    
    if (message) {
      handleTelegramMessage(message);
    }
    
    res.status(200).send('OK');
    
  } catch (error) {
    console.error("❌ Webhook error:", error);
    res.status(500).send('Error');
  }
});

// ==================== Telegram Message Handler ====================

function handleTelegramMessage(message) {
  const chatId = message.chat.id.toString();
  const text = message.text;
  const firstName = message.from.first_name;
  
  console.log(`💬 Message from ${firstName} (${chatId}): ${text}`);
  
  // คำสั่ง /start
  if (text && text.startsWith('/start')) {
    sendWelcomeMessage(chatId, firstName);
    return;
  }
  
  // รับ location จาก Telegram
  if (message.location) {
    const lat = message.location.latitude;
    const lon = message.location.longitude;
    
    customerLocation = {
      lat: lat.toString(),
      lon: lon.toString(),
      name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
      hasLocation: true
    };
    
    console.log("📍 Location received:", customerLocation);
    
    sendLocationConfirm(chatId);
    return;
  }
  
  // คำสั่ง /location lat,lon name
  if (text && text.startsWith('/location ')) {
    parseLocationText(text, chatId);
    return;
  }
  
  // คำสั่ง /status
  if (text === '/status') {
    sendCurrentStatus(chatId);
    return;
  }
  
  // คำสั่ง /test - ทดสอบระบบ
  if (text === '/test') {
    sendTestMessage(chatId);
    return;
  }
}

// ==================== Telegram Send Functions ====================

async function sendWelcomeMessage(chatId, firstName) {
  const message = `🌤️ สวัสดี ${firstName}!

🔧 **ระบบทดสอบ Railway**
📡 เชื่อมต่อ ESP32 ↔ Railway ↔ Telegram

📍 **ส่งโลเคชั่นมาเพื่อเริ่มทดสอบ:**
1. กดปุ่ม 📎 → Location
2. หรือพิมพ์: /location 13.7563,100.5018 กรุงเทพฯ

🎮 **คำสั่งทดสอบ:**
/status - ดูสถานะปัจจุบัน
/test - ทดสอบระบบ

🚀 ระบบพร้อมรับข้อมูลจาก ESP32!`;

  await sendTelegramMessage(chatId, message);
}

function parseLocationText(text, chatId) {
  try {
    // Format: /location 13.7563,100.5018 Bangkok
    const parts = text.replace('/location ', '').split(' ');
    const coords = parts[0].split(',');
    const name = parts.slice(1).join(' ') || 'Unknown Location';
    
    if (coords.length === 2) {
      customerLocation = {
        lat: coords[0],
        lon: coords[1],
        name: name,
        hasLocation: true
      };
      
      console.log("📍 Location parsed:", customerLocation);
      sendLocationConfirm(chatId);
    } else {
      sendTelegramMessage(chatId, "❌ รูปแบบไม่ถูกต้อง\nใช้: /location 13.7563,100.5018 ชื่อสถานที่");
    }
  } catch (error) {
    console.error("Error parsing location:", error);
    sendTelegramMessage(chatId, "❌ เกิดข้อผิดพลาดในการอ่านโลเคชั่น");
  }
}

async function sendLocationConfirm(chatId) {
  const message = `✅ **รับโลเคชั่นเรียบร้อย!**

📍 **ตำแหน่ง:** ${customerLocation.name}
🌐 **พิกัด:** ${customerLocation.lat}, ${customerLocation.lon}

🔄 **ระบบพร้อมแล้ว!**
- ESP32 สามารถส่งข้อมูลมาได้
- ข้อมูลจะถูกส่งต่อมาหาคุณอัตโนมัติ

⏰ รอข้อมูลจาก ESP32...`;

  await sendTelegramMessage(chatId, message);
}

async function sendCurrentStatus(chatId) {
  const message = `📊 **สถานะระบบ**

📍 **Location:**
${customerLocation.hasLocation ? 
  `✅ ${customerLocation.name}\n🌐 ${customerLocation.lat}, ${customerLocation.lon}` : 
  '❌ ยังไม่ได้ตั้งโลเคชั่น'}

📡 **Sensor Data:**
${sensorData.lastUpdate ? 
  `✅ อัพเดทล่าสุด: ${new Date(sensorData.lastUpdate).toLocaleString('th-TH')}
🌡️ อุณหภูมิ: ${sensorData.temperature}°C
💧 ความชื้น: ${sensorData.humidity}%
🌫️ PM2.5: ${sensorData.pm25} μg/m³` : 
  '❌ ยังไม่มีข้อมูลจาก ESP32'}

🚀 **Server:** ใช้งานได้ปกติ
⏰ **เวลาเซิร์ฟเวอร์:** ${new Date().toLocaleString('th-TH')}`;

  await sendTelegramMessage(chatId, message);
}

async function sendTestMessage(chatId) {
  const testData = {
    temperature: 28.5,
    humidity: 65,
    pm25: 35.2,
    deviceId: "TEST_001",
    timestamp: new Date().toISOString()
  };
  
  // จำลองข้อมูลจาก ESP32
  sensorData = { ...testData, lastUpdate: testData.timestamp };
  
  const message = `🧪 **ทดสอบระบบ**

📊 ข้อมูลจำลอง:
🌡️ อุณหภูมิ: ${testData.temperature}°C
💧 ความชื้น: ${testData.humidity}%
🌫️ PM2.5: ${testData.pm25} μg/m³
🏷️ Device: ${testData.deviceId}

✅ **Railway Server:** ทำงานปกติ
✅ **Telegram Webhook:** ทำงานปกติ
✅ **Data Processing:** ทำงานปกติ

🎯 **พร้อมรับข้อมูลจาก ESP32!**`;

  await sendTelegramMessage(chatId, message);
}

async function sendSensorDataToTelegram() {
  if (!sensorData.lastUpdate) return;
  
  const message = `📊 **ข้อมูลจาก ESP32**

📍 **ตำแหน่ง:** ${customerLocation.name}
🏷️ **Device:** ${sensorData.deviceId}

🌡️ **อุณหภูมิ:** ${sensorData.temperature}°C
💧 **ความชื้น:** ${sensorData.humidity}%
🌫️ **PM2.5:** ${sensorData.pm25} μg/m³

⏰ **เวลา:** ${new Date(sensorData.lastUpdate).toLocaleString('th-TH')}

${generateAlert(sensorData.pm25)}`;

  await sendTelegramMessage(CHAT_ID, message);
}

function generateAlert(pm25) {
  if (pm25 > 75) return "🚨 **อันตราย!** ค่า PM2.5 สูงมาก";
  if (pm25 > 50) return "⚠️ **ระวัง!** ค่า PM2.5 สูง";
  if (pm25 > 25) return "🟡 **เฝ้าระวัง** ค่า PM2.5 เริ่มสูง";
  return "✅ **ปกติ** คุณภาพอากาศดี";
}

// ==================== Helper Functions ====================

async function sendTelegramMessage(chatId, message) {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    
    const response = await axios.post(url, {
      chat_id: chatId,
      text: message,

    });
    
    console.log("✅ Message sent to Telegram");
    return response.data;
    
  } catch (error) {
    console.error("❌ Failed to send Telegram message:", error.message);
  }
}

// ==================== Server Setup ====================

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: "🚀 Railway ESP32-Telegram Server",
    status: "Running",
    endpoints: {
      "POST /sensor-data": "ESP32 ส่งข้อมูล sensor",
      "GET /get-location": "ESP32 ขอ location",
      "POST /webhook/[BOT_TOKEN]": "Telegram webhook",
      "GET /health": "Health check"
    },
    webhook_url: `https://your-app.railway.app/webhook/${BOT_TOKEN}`
  });
});

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Webhook URL: https://your-app.railway.app/webhook/${BOT_TOKEN}`);
  console.log(`🏥 Health check: https://your-app.railway.app/health`);
  console.log(`📡 Ready for ESP32 connections!`);
});
