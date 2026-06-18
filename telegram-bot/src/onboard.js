// onboard.js — ★ ติดตั้งปลั๊กอินอัตโนมัติผ่าน wp-admin ★
// ขั้นตอน: cookie login → zip+อัปโหลด+activate ปลั๊กอิน → ตั้ง API key ผ่านฟอร์มตั้งค่า
// ใช้ cookie auth (ไม่ใช่ Basic/Authorization) → ไม่โดน cPanel ตัด header
//
// ⚠️ ต้องใช้รหัส wp-admin จริง และจะไม่ทำงานถ้าเว็บมี 2FA / CAPTCHA / security plugin
//    กัน login อัตโนมัติ หรือโฮสต์ปิดการอัปโหลดปลั๊กอิน
import AdmZip from "adm-zip";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = resolve(__dirname, "..", "..", "wordpress-plugin", "kim-mcp-bridge");

// ---- cookie jar ขั้นต่ำ ----
class Jar {
  constructor() {
    this.c = new Map();
  }
  store(res) {
    const sc = (res.headers.getSetCookie && res.headers.getSetCookie()) || [];
    for (const line of sc) {
      const pair = line.split(";")[0];
      const i = pair.indexOf("=");
      if (i <= 0) continue;
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      if (!v || v.toLowerCase() === "deleted") this.c.delete(k);
      else this.c.set(k, v);
    }
  }
  header() {
    return [...this.c.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  has(prefix) {
    for (const k of this.c.keys()) if (k.startsWith(prefix)) return true;
    return false;
  }
}

async function jfetch(jar, url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const cookie = jar.header();
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(url, { ...opts, headers, redirect: "manual" });
  jar.store(res);
  return res;
}

const grab = (html, re) => {
  const m = html.match(re);
  return m ? m[1] : null;
};

function absolutize(base, href) {
  href = href.replace(/&amp;/g, "&");
  if (/^https?:\/\//.test(href)) return href;
  if (href.startsWith("/")) return base + href;
  return `${base}/wp-admin/${href.replace(/^\/?wp-admin\//, "")}`;
}

/**
 * @param {{url, user, pass, statusCb?}} args
 * @returns {Promise<{key:string, url:string, log:string[]}>}
 */
export async function onboard({ url, user, pass, statusCb }) {
  url = url.replace(/\/+$/, "");
  const log = [];
  const say = (m) => {
    log.push(m);
    if (statusCb) statusCb(m);
  };
  const jar = new Jar();

  // 1) login (ตั้ง test cookie ก่อน)
  say("🔐 login wp-admin...");
  jar.c.set("wordpress_test_cookie", "WP%20Cookie%20check");
  const body = new URLSearchParams({
    log: user,
    pwd: pass,
    "wp-submit": "Log In",
    redirect_to: `${url}/wp-admin/`,
    testcookie: "1",
  });
  await jfetch(jar, `${url}/wp-login.php`, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  if (!jar.has("wordpress_logged_in")) {
    throw new Error("login ไม่สำเร็จ — เช็ค user/pass หรือเว็บมี 2FA/CAPTCHA/security plugin กันอยู่");
  }
  say("✅ login สำเร็จ");

  // 2) zip ปลั๊กอินจากโฟลเดอร์ในรีโป
  const zip = new AdmZip();
  zip.addLocalFolder(PLUGIN_DIR, "kim-mcp-bridge");
  const zipBuf = zip.toBuffer();

  // 3) อัปโหลด + activate
  say("📦 อัปโหลดปลั๊กอิน...");
  const upPage = await (await jfetch(jar, `${url}/wp-admin/plugin-install.php?tab=upload`, {})).text();
  const upNonce = grab(upPage, /name="_wpnonce"[^>]*\bvalue="([^"]+)"/);
  const upRef = grab(upPage, /name="_wp_http_referer"[^>]*\bvalue="([^"]+)"/) || "/wp-admin/plugin-install.php?tab=upload";
  if (!upNonce) throw new Error("หา nonce อัปโหลดไม่เจอ (อาจถูก security plugin บล็อก หรือ login ไม่ผ่านจริง)");

  const fd = new FormData();
  fd.append("_wpnonce", upNonce);
  fd.append("_wp_http_referer", upRef);
  fd.append("install-plugin-submit", "Install Now");
  fd.append("pluginzip", new Blob([zipBuf]), "kim-mcp-bridge.zip");
  const instHtml = await (
    await jfetch(jar, `${url}/wp-admin/update.php?action=upload-plugin`, { method: "POST", body: fd })
  ).text();

  let activateHref = grab(instHtml, /href="([^"]*action=activate[^"]*kim-mcp-bridge[^"]*)"/);
  const exists = /already exists|มีอยู่แล้ว/i.test(instHtml);
  if (!activateHref) {
    // อาจติดตั้งไว้แล้ว → หา activate ที่ plugins.php
    const plHtml = await (await jfetch(jar, `${url}/wp-admin/plugins.php`, {})).text();
    activateHref = grab(plHtml, /href="([^"]*action=activate[^"]*kim-mcp-bridge[^"]*)"/);
    if (!activateHref && /kim-mcp-bridge/.test(plHtml)) say("ℹ️ ปลั๊กอิน active อยู่แล้ว");
    else if (exists) say("ℹ️ ปลั๊กอินมีอยู่แล้ว ใช้ตัวเดิม");
  }
  if (activateHref) {
    await jfetch(jar, absolutize(url, activateHref), {});
    say("✅ activate ปลั๊กอินแล้ว");
  }

  // 4) ตั้ง API key ผ่านฟอร์มตั้งค่า (options.php) — nonce อยู่บนหน้า Settings > Kim MCP
  say("🔑 ตั้ง API key...");
  const setPage = await (await jfetch(jar, `${url}/wp-admin/options-general.php?page=kim-mcp`, {})).text();
  const sNonce = grab(setPage, /name="_wpnonce"[^>]*\bvalue="([^"]+)"/);
  const sRef = grab(setPage, /name="_wp_http_referer"[^>]*\bvalue="([^"]+)"/) || "/wp-admin/options-general.php?page=kim-mcp";
  if (!sNonce) throw new Error("เปิดหน้าตั้งค่าไม่ได้ — ปลั๊กอิน activate สำเร็จไหม?");

  const key = randomBytes(24).toString("hex");
  const sBody = new URLSearchParams({
    option_page: "kim_mcp_group",
    action: "update",
    _wpnonce: sNonce,
    _wp_http_referer: sRef,
    kim_mcp_api_key: key,
  });
  const setRes = await jfetch(jar, `${url}/wp-admin/options.php`, {
    method: "POST",
    body: sBody,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  if (setRes.status >= 400) throw new Error(`ตั้ง key ไม่สำเร็จ (HTTP ${setRes.status})`);
  say("✅ ตั้ง key สำเร็จ");

  return { key, url, log };
}
