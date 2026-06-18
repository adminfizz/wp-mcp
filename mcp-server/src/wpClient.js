// wpClient.js — เรียก REST API ของปลั๊กอิน kim-mcp-bridge
// แนบ header X-Kim-Key ของโดเมนนั้นๆ (ไม่ใช้ Basic Auth เพราะ cPanel ตัด Authorization)
import { getSite } from "./registry.js";

const NS = "/wp-json/kim/v1";

/**
 * เรียกปลั๊กอินของโดเมนหนึ่ง
 * @param {string} domain  ชื่อโดเมนใน registry
 * @param {string} method  GET | POST | DELETE ...
 * @param {string} path    เช่น "/posts" หรือ "/posts/12"
 * @param {object} [body]  payload (จะ JSON.stringify ให้)
 * @returns {Promise<any>} JSON ที่ปลั๊กอินคืนมา
 */
export async function callWp(domain, method, path, body) {
  const site = getSite(domain);
  const url = `${site.url}${NS}${path}`;
  const timeoutMs = Number(process.env.WP_TIMEOUT_MS || 20000);
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        "X-Kim-Key": site.key,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e.name === "TimeoutError" || e.name === "AbortError") {
      throw new Error(`[${domain}] ${method} ${path} → timeout (เกิน ${timeoutMs}ms — เว็บช้า/ไม่ตอบ)`);
    }
    throw new Error(`[${domain}] ${method} ${path} → เข้าไม่ถึงเว็บ: ${e.message}`);
  }

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const msg = data && (data.message || data.code) ? `${data.code || ""} ${data.message || ""}`.trim() : text;
    throw new Error(`[${domain}] ${method} ${path} → HTTP ${res.status}: ${msg}`);
  }
  return data;
}
