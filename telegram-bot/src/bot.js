// bot.js — จุดเข้าบอท Telegram (รันด้วย pm2)
// รับข้อความ → ถ้าเป็น slash จับด้วย commands.js, ถ้าเป็นภาษาธรรมชาติส่งเข้า agent (Claude+MCP)
import "dotenv/config";
import TelegramBot from "node-telegram-bot-api";
import { initMcp } from "./mcpClient.js";
import { handleCommand, getActive } from "./commands.js";
import { runAgent, trimHistory } from "./agent.js";
import { logEvent } from "./logger.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("ยังไม่ได้ตั้ง TELEGRAM_BOT_TOKEN ใน .env");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// เช็คสิทธิ์ผู้สั่ง (เหมือน slip-bot)
function allowed(msg) {
  const list = (process.env.ALLOWED_CHAT_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return true; // ว่าง = อนุญาตทุกคน
  return list.includes(String(msg.chat.id));
}

// เก็บประวัติบทสนทนาต่อ chat (สั้นๆ พอให้ต่อเนื่อง)
const histories = new Map();

bot.on("message", async (msg) => {
  const text = msg.text;
  if (!text) return;
  if (!allowed(msg)) {
    bot.sendMessage(msg.chat.id, `ขออภัยค่ะ chat นี้ไม่มีสิทธิ์ใช้งาน (id: ${msg.chat.id})`);
    return;
  }

  try {
    // 1) ลองจับ slash command ก่อน
    const cmdReply = await handleCommand(text, msg.chat.id);
    if (cmdReply !== null) {
      await bot.sendMessage(msg.chat.id, cmdReply);
      return;
    }

    // 2) ภาษาธรรมชาติ → agent (Claude + MCP) ใช้เว็บที่ /use ไว้เป็นค่าเริ่มต้น
    await bot.sendChatAction(msg.chat.id, "typing");
    const history = histories.get(msg.chat.id) || [];
    const { text: reply, messages } = await runAgent(text, history, getActive(msg.chat.id), msg.chat.id);
    // เก็บประวัติแบบตัดที่ขอบ user turn (กัน 400)
    histories.set(msg.chat.id, trimHistory(messages, 12));
    await bot.sendMessage(msg.chat.id, reply || "เรียบร้อยค่ะ");
  } catch (e) {
    console.error("handle error:", e);
    logEvent({ level: "error", chat: msg.chat.id, cmd: (text || "").split(/\s+/)[0], msg: e.message });
    await bot.sendMessage(msg.chat.id, `เกิดข้อผิดพลาดค่ะ: ${e.message}`);
  }
});

bot.on("polling_error", (e) => console.error("polling_error:", e.message));

// ตั้งเมนูคำสั่ง + เปิดการเชื่อม MCP ตอนเริ่ม
(async () => {
  try {
    await initMcp();
    await bot.setMyCommands([
      { command: "login", description: "ดูสถานะ + เว็บที่เชื่อม" },
      { command: "addsite", description: "เชื่อมเว็บที่ลงปลั๊กอินแล้ว <ชื่อ> <url> <key>" },
      { command: "onboard", description: "ติดตั้งปลั๊กอินอัตโนมัติ <ชื่อ> <url> <user> <pass>" },
      { command: "sites", description: "ดูเว็บทั้งหมด" },
      { command: "use", description: "เลือกเว็บที่จะสั่งงาน <ชื่อ>" },
      { command: "report", description: "สรุปภาพรวมเว็บ [ชื่อ]" },
      { command: "health", description: "เช็คปลั๊กอิน [ชื่อ]" },
      { command: "status", description: "สถานะแต่ละโดเมน (ออนไลน์/หลุด) [ชื่อ|all]" },
      { command: "log", description: "ประวัติกิจกรรมรายโดเมน [ชื่อ] [n]" },
      { command: "posts", description: "โพสต์ล่าสุด [ชื่อ]" },
      { command: "publish", description: "เผยแพร่โพสต์ [ชื่อ] <id>" },
      { command: "draft", description: "เปลี่ยนเป็น draft [ชื่อ] <id>" },
      { command: "delete", description: "ลบโพสต์ [ชื่อ] <id>" },
      { command: "action", description: "สั่ง custom action [ชื่อ] <action> [json]" },
      { command: "removesite", description: "เอาเว็บออก <ชื่อ>" },
      { command: "help", description: "ช่วยเหลือ" },
    ]);
    console.log("wp-mcp-bot พร้อมทำงาน ✅");
  } catch (e) {
    console.error("เริ่มบอทไม่สำเร็จ:", e.message);
    process.exit(1);
  }
})();
