// commands.js — slash command ชุดเต็ม (ทางลัด ไม่ผ่าน Claude เพื่อความเร็ว/ประหยัด token)
// ครอบคลุม: login/เชื่อมเว็บ, เลือกโดเมน, อ่านข้อมูล, จัดการโพสต์รายเว็บ
import { callTool } from "./mcpClient.js";
import { addSite, removeSite, hasSite, listSites } from "./sites.js";
import { onboard } from "./onboard.js";

// โดเมนที่เลือกอยู่ของแต่ละแชท (in-memory — รีเซ็ตเมื่อบอทรีสตาร์ท ให้ /use ใหม่)
const active = new Map();
export function getActive(chatId) {
  return active.get(chatId) || null;
}
function setActive(chatId, name) {
  active.set(chatId, name);
}

const HELP = `📋 คำสั่งทั้งหมดค่ะ

— เริ่มต้น / เชื่อมเว็บ —
/start หรือ /login — ดูสถานะ + เว็บที่เชื่อม
/addsite <ชื่อ> <url> <key> — เชื่อมเว็บที่ลงปลั๊กอินแล้ว
/onboard <ชื่อ> <url> <user> <pass> — ติดตั้งปลั๊กอินอัตโนมัติ (เว็บใหม่)
/removesite <ชื่อ> — เอาเว็บออก
/sites — ดูเว็บทั้งหมด
/use <ชื่อ> — เลือกเว็บที่จะสั่งงาน (ตั้งเป็นค่าเริ่มต้นของแชทนี้)

— อ่านข้อมูล (ถ้าไม่ใส่ชื่อ จะใช้เว็บที่ /use ไว้) —
/health [ชื่อ] — เช็คปลั๊กอินเว็บ
/report [ชื่อ] — สรุปภาพรวมเว็บ
/posts [ชื่อ] — โพสต์ล่าสุด

— จัดการโพสต์ —
/publish [ชื่อ] <id> — เผยแพร่โพสต์
/draft [ชื่อ] <id> — เปลี่ยนเป็น draft
/delete [ชื่อ] <id> — ลบโพสต์

— ต่อปลั๊กอิน/ฟังก์ชันเดิมของเว็บ —
/action [ชื่อ] <action> [json] — สั่ง custom action (เช่น เคลียร์แคช, sync สต็อก)

— ภาษาไทย (เขียนบทความ/งานซับซ้อน) —
พิมพ์ได้เลย เช่น "เขียนบทความเรื่องวิธีชงกาแฟลงเว็บA ใส่รูปด้วย"`;

function loginText(chatId) {
  const sites = listSites();
  const act = getActive(chatId);
  const lines = sites.length
    ? sites.map((s) => `  • ${s.domain} — ${s.url}${act === s.domain ? "  ⬅️ ใช้อยู่" : ""}`).join("\n")
    : "  (ยังไม่มี — เชื่อมด้วย /addsite)";
  return `สวัสดีค่ะ 🙂 เลขาคิมพร้อมดูแลเว็บให้\n\n🌐 เว็บที่เชื่อมแล้ว:\n${lines}\n\nเว็บที่เลือกอยู่: ${act || "(ยังไม่เลือก — /use <ชื่อ>)"}\n\nพิมพ์ /help ดูคำสั่งทั้งหมด`;
}

// แยก "ชื่อเว็บ + id" จาก argument (รองรับทั้ง "/publish siteA 12" และ "/publish 12" โดยใช้เว็บที่เลือกไว้)
function targetAndId(rest, chatId) {
  const t = rest.filter(Boolean);
  let domain, id;
  if (t.length >= 2) {
    domain = t[0]; // "<ชื่อ> <id>"
    id = t[1];
  } else if (t.length === 1 && hasSite(t[0])) {
    domain = t[0]; // ระบุเว็บแต่ลืม id
  } else {
    domain = getActive(chatId); // "<id>" → ใช้เว็บที่เลือกไว้
    id = t[0];
  }
  if (!domain) return { err: "ยังไม่ได้เลือกเว็บค่ะ — /use <ชื่อ> ก่อน หรือระบุชื่อในคำสั่ง" };
  if (!hasSite(domain)) return { err: `ไม่พบเว็บ "${domain}" — /sites ดูรายชื่อ` };
  if (!/^\d+$/.test(String(id || ""))) return { err: `ใส่ id โพสต์ (ตัวเลข) ของเว็บ ${domain} ด้วยค่ะ` };
  return { domain, id: Number(id) };
}

/**
 * จับ slash command. คืน string ตอบกลับ; ถ้าไม่ใช่ slash คืน null (→ ส่งเข้า agent)
 */
export async function handleCommand(text, chatId) {
  const t = text.trim();
  if (!t.startsWith("/")) return null;
  const [cmd, ...rest] = t.split(/\s+/);
  const arg = rest.join(" ").trim();

  switch (cmd) {
    case "/start":
    case "/login":
      return loginText(chatId);

    case "/help":
      return HELP;

    case "/sites": {
      const { text } = await callTool("list_sites", {});
      return "🌐 เว็บที่ดูแล:\n" + text;
    }

    case "/addsite": {
      const [name, url] = rest;
      const key = rest.slice(2).join(" "); // key อาจมีช่องว่าง — เก็บทุก token หลัง url
      if (!name || !url || !key) return "รูปแบบ: /addsite <ชื่อ> <url> <key>\nเช่น /addsite siteA https://a.com mykey123";
      try {
        addSite(name, url, key);
      } catch (e) {
        return `เพิ่มไม่สำเร็จ: ${e.message}`;
      }
      await callTool("reload_sites", {}); // ให้ MCP เห็นเว็บใหม่ทันที
      const h = await callTool("wp_health", { domain: name }); // ตรวจว่าเชื่อมติด
      setActive(chatId, name);
      if (h.isError) return `เพิ่ม "${name}" แล้ว แต่ตรวจสอบไม่ผ่าน ⚠️\n${h.text}\n(เช็ค url/key/ปลั๊กอินอีกที)`;
      return `✅ เชื่อมเว็บ "${name}" สำเร็จ และตั้งเป็นเว็บที่ใช้อยู่\n${h.text}`;
    }

    case "/onboard": {
      const [name, url, user] = rest;
      const pass = rest.slice(3).join(" "); // pass อาจมีช่องว่าง
      if (!name || !url || !user || !pass)
        return "รูปแบบ: /onboard <ชื่อ> <url> <admin-user> <admin-pass>\n(ติดตั้งปลั๊กอินอัตโนมัติให้เว็บใหม่)";
      if (!/^[a-zA-Z0-9_-]+$/.test(name) || /^\d+$/.test(name) || name.startsWith("_"))
        return "ชื่อเว็บใช้ a-z A-Z 0-9 _ - (ต้องมีตัวอักษร, ห้ามเป็นตัวเลขล้วน)";
      if (!/^https?:\/\//.test(url)) return "url ต้องขึ้นต้น http:// หรือ https://";
      try {
        const { key, log } = await onboard({ url, user, pass });
        addSite(name, url, key);
        await callTool("reload_sites", {});
        const h = await callTool("wp_health", { domain: name });
        setActive(chatId, name);
        const steps = log.join("\n");
        const tail = "\n\n🔒 ลบข้อความ /onboard นี้ทิ้งด้วยนะคะ (มีรหัส admin อยู่)";
        if (h.isError) return `${steps}\n\n⚠️ เชื่อมแล้วแต่เช็คไม่ผ่าน:\n${h.text}${tail}`;
        return `${steps}\n\n✅ ติดตั้ง+เชื่อม "${name}" อัตโนมัติสำเร็จ! ตั้งเป็นเว็บที่ใช้อยู่${tail}`;
      } catch (e) {
        return `❌ onboard ไม่สำเร็จ: ${e.message}\n\nลองวิธี manual: อัปปลั๊กอินเอง → ตั้ง key → /addsite\n\n🔒 ลบข้อความ /onboard นี้ทิ้งด้วยนะคะ`;
      }
    }

    case "/removesite":
      if (!arg) return "ระบุชื่อเว็บ เช่น /removesite siteA";
      if (!removeSite(arg)) return `ไม่พบเว็บ "${arg}"`;
      await callTool("reload_sites", {});
      if (getActive(chatId) === arg) active.delete(chatId);
      return `ลบเว็บ "${arg}" แล้วค่ะ`;

    case "/use":
      if (!arg) return "ระบุชื่อเว็บ เช่น /use siteA";
      if (!hasSite(arg)) return `ไม่พบเว็บ "${arg}" — /sites ดูรายชื่อ หรือ /addsite เชื่อมก่อน`;
      setActive(chatId, arg);
      return `เลือกเว็บ "${arg}" เป็นค่าเริ่มต้นของแชทนี้แล้วค่ะ ✅`;

    case "/health":
    case "/report":
    case "/posts": {
      const domain = arg || getActive(chatId);
      if (!domain) return "ยังไม่ได้เลือกเว็บค่ะ — /use <ชื่อ> ก่อน หรือใส่ชื่อในคำสั่ง";
      if (cmd === "/health") return (await callTool("wp_health", { domain })).text;
      if (cmd === "/report") return (await callTool("wp_report", { domain })).text;
      return (await callTool("wp_list_posts", { domain, per_page: 5 })).text;
    }

    case "/publish":
    case "/draft": {
      const r = targetAndId(rest, chatId);
      if (r.err) return r.err;
      const status = cmd === "/publish" ? "publish" : "draft";
      return (await callTool("wp_update_post", { domain: r.domain, id: r.id, status })).text;
    }

    case "/delete": {
      const r = targetAndId(rest, chatId);
      if (r.err) return r.err;
      return (await callTool("wp_delete_post", { domain: r.domain, id: r.id })).text;
    }

    case "/action": {
      // /action [ชื่อเว็บ] <action> [json]  — สั่ง custom action ที่ปลั๊กอินเดิมลงทะเบียนไว้
      const t = rest.filter(Boolean);
      let domain, name, payloadTokens;
      if (t.length >= 1 && hasSite(t[0])) {
        domain = t[0];
        name = t[1];
        payloadTokens = t.slice(2);
      } else {
        domain = getActive(chatId);
        name = t[0];
        payloadTokens = t.slice(1);
      }
      if (!domain) return "เลือกเว็บก่อน (/use <ชื่อ>) หรือพิมพ์ /action <ชื่อเว็บ> <action>";
      if (!name) return "ระบุชื่อ action เช่น /action clear_cache";
      let payload = {};
      if (payloadTokens.length) {
        try {
          payload = JSON.parse(payloadTokens.join(" "));
        } catch {
          return 'payload ต้องเป็น JSON เช่น {"id":5}';
        }
      }
      return (await callTool("wp_run_action", { domain, name, payload })).text;
    }

    default:
      return null; // ไม่รู้จัก → ให้ agent ลองตีความ
  }
}
