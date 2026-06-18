// sites.js — จัดการไฟล์ทะเบียนโดเมน (domains.json) จากฝั่งบอท
// ใช้ path เดียวกับที่ MCP server (registry.js) อ่าน: DOMAINS_FILE relative กับ cwd
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * path ของ domains.json แบบ cwd-independent (anchor กับตำแหน่งไฟล์โมดูล)
 * mcpClient จะส่งค่านี้ (absolute) ให้ MCP server ด้วย → บอทเขียน/MCP อ่าน ไฟล์เดียวกันเสมอ
 */
export function domainsFilePath() {
  const env = process.env.DOMAINS_FILE;
  const pkgRoot = resolve(__dirname, ".."); // telegram-bot/
  if (env) return isAbsolute(env) ? env : resolve(pkgRoot, env);
  return resolve(pkgRoot, "..", "mcp-server", "config", "domains.json");
}

function file() {
  return domainsFilePath();
}

function readRaw() {
  const f = file();
  if (!existsSync(f)) return {};
  try {
    return JSON.parse(readFileSync(f, "utf8")) || {};
  } catch {
    // อย่าคืน {} เด็ดขาด — addSite/removeSite ทำ read-modify-write ถ้าคืน {} จะลบเว็บอื่นทั้งหมด
    throw new Error(`อ่าน domains.json ไม่ได้ (อาจเสียหาย): ${f}`);
  }
}

function writeRaw(raw) {
  const f = file();
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify(raw, null, 2));
}

/** คืนรายชื่อเว็บ (ไม่รวม key) */
export function listSites() {
  const raw = readRaw();
  return Object.entries(raw)
    .filter(([k]) => !k.startsWith("_"))
    .map(([name, v]) => ({ domain: name, url: v?.url }));
}

/** เว็บนี้มีในทะเบียนไหม */
export function hasSite(name) {
  const raw = readRaw();
  return Object.prototype.hasOwnProperty.call(raw, name) && !name.startsWith("_");
}

/** เพิ่ม/แก้เว็บ (login เว็บใหม่เข้าระบบ) */
export function addSite(name, url, key) {
  if (!/^[a-zA-Z0-9_-]+$/.test(name) || /^\d+$/.test(name) || name.startsWith("_"))
    throw new Error("ชื่อเว็บใช้ a-z A-Z 0-9 _ - (ต้องมีตัวอักษร, ห้ามเป็นตัวเลขล้วน/ขึ้นต้น _/เว้นวรรค)");
  if (!/^https?:\/\//.test(url)) throw new Error("url ต้องขึ้นต้น http:// หรือ https://");
  if (!key) throw new Error("ต้องมี key");
  const raw = readRaw();
  raw[name] = { url: String(url).replace(/\/+$/, ""), key: String(key) };
  writeRaw(raw);
}

/** ตั้งค่า workflow (เชื่อมปลั๊กอินอื่น) ให้เว็บ */
export function setWorkflow(name, workflow) {
  const raw = readRaw();
  if (!raw[name]) throw new Error(`ไม่พบเว็บ "${name}"`);
  raw[name].workflow = workflow;
  writeRaw(raw);
}

/** ลบเว็บออกจากทะเบียน */
export function removeSite(name) {
  if (name.startsWith("_")) return false; // กันลบ metadata เช่น _comment
  const raw = readRaw();
  if (!(name in raw)) return false;
  delete raw[name];
  writeRaw(raw);
  return true;
}
