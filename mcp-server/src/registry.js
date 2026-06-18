// registry.js — โหลดทะเบียนโดเมน (domain → { url, key })
// ไฟล์ของจริงคือ config/domains.json (อยู่ใน .gitignore) ห้าม commit
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, isAbsolute } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveFile() {
  const p = process.env.DOMAINS_FILE || join(__dirname, "..", "config", "domains.json");
  return isAbsolute(p) ? p : join(process.cwd(), p);
}

let _sites = null;

export function loadSites() {
  if (_sites) return _sites;
  const file = resolveFile();
  let raw;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(
      `อ่านทะเบียนโดเมนไม่ได้ (${file}) — ก็อป config/domains.example.json เป็น domains.json แล้วใส่ของจริง. ${e.message}`
    );
  }
  const sites = {};
  for (const [name, cfg] of Object.entries(raw)) {
    if (name.startsWith("_")) continue; // ข้าม _comment
    if (!cfg || !cfg.url || !cfg.key) continue;
    const entry = { url: String(cfg.url).replace(/\/+$/, ""), key: String(cfg.key) };
    // เก็บบล็อก workflow (สำหรับเชื่อม REST API ปลั๊กอินอื่นต่อโดเมน) ถ้ามี
    if (cfg.workflow && typeof cfg.workflow === "object") entry.workflow = cfg.workflow;
    sites[name] = entry;
  }
  _sites = sites;
  return sites;
}

export function reloadSites() {
  _sites = null;
  return loadSites();
}

export function getSite(domain) {
  const sites = loadSites();
  const site = sites[domain];
  if (!site) {
    const names = Object.keys(sites).join(", ") || "(ว่าง)";
    throw new Error(`ไม่รู้จักโดเมน "${domain}" — โดเมนที่มี: ${names}`);
  }
  return site;
}

export function getWorkflow(domain) {
  const site = getSite(domain);
  if (!site.workflow || !site.workflow.submit_url) {
    throw new Error(`โดเมน "${domain}" ยังไม่ได้ตั้งค่า workflow (ปลั๊กอินอื่น) — ใช้ /setworkflow ก่อน`);
  }
  return site.workflow;
}

export function listSiteNames() {
  return Object.entries(loadSites()).map(([name, s]) => ({ domain: name, url: s.url }));
}
