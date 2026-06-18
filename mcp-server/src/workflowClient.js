// workflowClient.js — เรียก REST API ของ "ปลั๊กอินอื่น" (เช่น ปลั๊กอิน workflow เดิม) ต่อโดเมน
// generic: endpoint/auth/payload ปรับได้ผ่าน config (domains.json -> block "workflow")
import { getWorkflow } from "./registry.js";

// แนบ auth ตาม config: bearer | header | query | none
function applyAuth(wf, urlObj, headers) {
  const a = wf.auth || { type: "none" };
  if (a.type === "bearer") headers["Authorization"] = `Bearer ${a.value}`;
  else if (a.type === "header") headers[a.name || "Authorization"] = a.value;
  else if (a.type === "query") urlObj.searchParams.set(a.name || "api_key", a.value);
}

async function call(domain, method, urlObj, headers, body) {
  const timeoutMs = Number(process.env.WP_TIMEOUT_MS || 30000);
  let res;
  try {
    res = await fetch(urlObj, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const why = e.name === "TimeoutError" || e.name === "AbortError" ? `timeout (เกิน ${timeoutMs}ms)` : e.message;
    throw new Error(`[${domain}] workflow ${method} → ${why}`);
  }
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const m = typeof data === "object" ? JSON.stringify(data).slice(0, 200) : String(text).slice(0, 200);
    throw new Error(`[${domain}] workflow ${method} → HTTP ${res.status}: ${m}`);
  }
  return data;
}

/** ส่ง "หัวข้อ" ให้ปลั๊กอิน workflow เดิมไปสร้างบทความ/รูป */
export async function submitTopic(domain, topic, extra = {}) {
  const wf = getWorkflow(domain);
  const u = new URL(wf.submit_url);
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  applyAuth(wf, u, headers);
  const body = { [wf.topic_field || "topic"]: topic, ...(wf.extra || {}), ...extra };
  return call(domain, wf.method || "POST", u, headers, body);
}

/** ดึงสถานะ/คิวงานจากปลั๊กอิน workflow เดิม */
export async function getStatus(domain) {
  const wf = getWorkflow(domain);
  if (!wf.status_url) throw new Error(`โดเมน "${domain}" ไม่ได้ตั้ง status_url ใน workflow`);
  const u = new URL(wf.status_url);
  const headers = { Accept: "application/json" };
  applyAuth(wf, u, headers);
  return call(domain, wf.status_method || "GET", u, headers);
}
