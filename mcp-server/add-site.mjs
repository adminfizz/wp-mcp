#!/usr/bin/env node
// CLI เพิ่ม/ลบ/ดูเว็บ "โดยไม่ต้องผ่าน Telegram" — แก้ทะเบียน domains.json ตรงๆ
// เหมาะกับการตั้งค่าทีละหลายเว็บ (>5 โดเมน) ก่อนสตาร์ทบอท
//
// วิธีใช้ (รันในโฟลเดอร์ mcp-server):
//   node add-site.mjs add <ชื่อ> <url> <key...>
//   node add-site.mjs list
//   node add-site.mjs remove <ชื่อ>
//
// หมายเหตุ: ถ้าบอทรันอยู่แล้ว ให้รีสตาร์ทบอท หรือสั่ง /addsite ในแชทแทน
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function file() {
  const e = process.env.DOMAINS_FILE;
  if (e) return isAbsolute(e) ? e : resolve(process.cwd(), e);
  return resolve(__dirname, "config", "domains.json");
}
function read() {
  const f = file();
  if (!existsSync(f)) return {};
  return JSON.parse(readFileSync(f, "utf8")) || {};
}
function write(o) {
  const f = file();
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify(o, null, 2));
  return f;
}

const [cmd, name, url, ...rest] = process.argv.slice(2);

function die(msg) {
  console.error(msg);
  process.exit(1);
}

switch (cmd) {
  case "add": {
    const key = rest.join(" ");
    if (!name || !url || !key) die("ใช้: node add-site.mjs add <ชื่อ> <url> <key>");
    if (!/^[a-zA-Z0-9_-]+$/.test(name) || /^\d+$/.test(name) || name.startsWith("_"))
      die("ชื่อเว็บใช้ a-z A-Z 0-9 _ - (ต้องมีตัวอักษร, ห้ามเป็นตัวเลขล้วน/ขึ้นต้น _)");
    if (!/^https?:\/\//.test(url)) die("url ต้องขึ้นต้น http:// หรือ https://");
    const raw = read();
    raw[name] = { url: url.replace(/\/+$/, ""), key };
    const f = write(raw);
    console.log(`✅ เพิ่ม/อัปเดต "${name}" แล้ว → ${f}`);
    console.log("ถ้าบอทรันอยู่ ให้รีสตาร์ท หรือสั่ง reload (/addsite ในแชท)");
    break;
  }
  case "remove": {
    if (!name) die("ใช้: node add-site.mjs remove <ชื่อ>");
    if (name.startsWith("_")) die("ลบ metadata ไม่ได้");
    const raw = read();
    if (!(name in raw)) die(`ไม่พบเว็บ "${name}"`);
    delete raw[name];
    write(raw);
    console.log(`🗑️ ลบ "${name}" แล้ว`);
    break;
  }
  case "list": {
    const raw = read();
    const names = Object.keys(raw).filter((k) => !k.startsWith("_"));
    if (!names.length) console.log("(ยังไม่มีเว็บ)");
    else names.forEach((n) => console.log(`• ${n} — ${raw[n].url}`));
    break;
  }
  default:
    console.log("ใช้: node add-site.mjs <add|list|remove> ...");
}
