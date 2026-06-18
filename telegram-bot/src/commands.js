// commands.js — parser ของ slash command (ทางลัด ไม่ผ่าน Claude เพื่อความเร็ว/ประหยัด token)
// คำสั่งอ่านข้อมูลเร็วๆ จับที่นี่; งานเขียน/ซับซ้อน ปล่อยให้ agent (ภาษาธรรมชาติ)
import { callTool } from "./mcpClient.js";

const HELP = `คำสั่งที่ใช้ได้ค่ะ:
/sites — ดูเว็บทั้งหมด
/health <เว็บ> — เช็คปลั๊กอินเว็บนั้น
/report <เว็บ> — สรุปภาพรวมเว็บ
/posts <เว็บ> — โพสต์ล่าสุด
/help — ช่วยเหลือ

นอกนั้นพิมพ์ภาษาไทยได้เลย เช่น:
"เขียนบทความเรื่องวิธีชงกาแฟลงเว็บA ใส่รูปด้วย"`;

/**
 * ลองจับ slash command. คืน string ตอบกลับ ถ้าไม่ใช่ slash คืน null (ให้ไปเข้า agent)
 */
export async function handleCommand(text) {
  const t = text.trim();
  if (!t.startsWith("/")) return null;

  const [cmd, ...rest] = t.split(/\s+/);
  const arg = rest.join(" ").trim();

  switch (cmd) {
    case "/start":
    case "/help":
      return HELP;

    case "/sites": {
      const { text } = await callTool("list_sites", {});
      return "🌐 เว็บที่ดูแล:\n" + text;
    }

    case "/health":
      if (!arg) return "ระบุเว็บด้วยค่ะ เช่น /health siteA";
      return (await callTool("wp_health", { domain: arg })).text;

    case "/report":
      if (!arg) return "ระบุเว็บด้วยค่ะ เช่น /report siteA";
      return (await callTool("wp_report", { domain: arg })).text;

    case "/posts":
      if (!arg) return "ระบุเว็บด้วยค่ะ เช่น /posts siteA";
      return (await callTool("wp_list_posts", { domain: arg, per_page: 5 })).text;

    default:
      return null; // คำสั่งไม่รู้จัก → ปล่อยให้ agent ลองตีความ
  }
}
