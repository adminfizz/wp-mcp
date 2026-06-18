// logger.js — เก็บ log เหตุการณ์ (login, โดเมนหลุด, คำสั่งไม่สำเร็จ) ลงไฟล์
// ไฟล์อยู่ใน data/ (gitignored) ไม่ขึ้น git
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_FILE = resolve(__dirname, "..", "data", "events.log");

/**
 * บันทึกเหตุการณ์ 1 บรรทัด
 * @param {{level?:string, domain?:string|number, chat?:string|number, cmd?:string, msg?:string}} e
 */
export function logEvent({ level = "info", domain = "-", chat = "-", cmd = "-", msg = "" } = {}) {
  try {
    mkdirSync(dirname(LOG_FILE), { recursive: true });
    const ts = new Date().toISOString();
    const line = `${ts} [${level}] domain=${domain} chat=${chat} cmd=${cmd} ${String(msg).replace(/\s+/g, " ")}\n`;
    appendFileSync(LOG_FILE, line);
  } catch {
    /* อย่าให้ log ล้มแล้วทำบอทพัง */
  }
}

/** อ่าน log ล่าสุด n บรรทัด (กรองตามโดเมนได้) */
export function readLog(n = 15, domain = null) {
  try {
    if (!existsSync(LOG_FILE)) return [];
    let lines = readFileSync(LOG_FILE, "utf8").trim().split("\n").filter(Boolean);
    if (domain) lines = lines.filter((l) => l.includes(`domain=${domain} `));
    return lines.slice(-n);
  } catch {
    return [];
  }
}
