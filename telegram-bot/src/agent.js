// agent.js — ★ สมองของบอท ★
// รับข้อความภาษาไทย → ให้ Claude ตีความ + เขียนบทความ + เลือกเรียก MCP tools เอง
// เชื่อม MCP tools (จาก mcpClient) เข้าเป็น "เครื่องมือ" ของ Claude แบบอัตโนมัติ
import Anthropic from "@anthropic-ai/sdk";
import { listTools, callTool } from "./mcpClient.js";
import { generateImage } from "./gemini.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-4-8";

// เก็บรูปที่ Gemini สร้าง ไว้ในบอท (ไม่ดัน base64 ก้อนใหญ่ผ่าน context ของ Claude)
// Claude อ้างอิงด้วย ref สั้นๆ แล้วบอทค่อยสลับเป็น base64 จริงตอนส่งเข้า MCP
const imageStore = new Map();
let imgCounter = 0;

const SYSTEM = `คุณคือ "เลขาคิม" ผู้ช่วยหญิงที่ดูแลเว็บไซต์ WordPress หลายโดเมนให้เจ้านาย พูดสุภาพ ลงท้าย ค่ะ/นะคะ

หน้าที่: รับคำสั่งภาษาไทยแล้วจัดการเว็บผ่านเครื่องมือ (tools) ที่มีให้

แนวทาง:
- ถ้าไม่ระบุว่าเว็บไหน และมีหลายเว็บ ให้เรียก list_sites ดูก่อน แล้วถามถ้ายังไม่ชัด
- เมื่อขอ "เขียนบทความ": ให้คุณเขียนเนื้อหาเองเป็น HTML ภาษาไทยคุณภาพดี ถูกหลัก SEO
  • มีโครงสร้างหัวข้อ <h2>/<h3>, ย่อหน้าอ่านง่าย, ความยาวเหมาะกับเรื่อง
  • สร้าง seo: { title (≤60 ตัว), description (≤155 ตัว), focus_keyword }
  • ตั้ง slug เป็นภาษาอังกฤษสั้นๆ
  • ถ้าเจ้านายไม่บอกว่าให้เผยแพร่เลย ให้ตั้ง status="draft"
- เมื่ออยาก "ใส่รูป/สร้างรูป": เรียก generate_image ด้วย prompt ที่อิงเนื้อหาบทความ
  จะได้ค่า ref กลับมา → เอา ref นั้นใส่ใน featured_image: { ref: "<ref>", alt: "<alt SEO>" }
- ตอบกลับสั้น กระชับ เป็นภาษาไทย พร้อมลิงก์/ผลลัพธ์ที่ได้`;

// แปลง MCP tool → รูปแบบ tool ของ Anthropic
function toAnthropicTools(mcpTools) {
  const tools = mcpTools.map((t) => ({
    name: t.name,
    description: t.description || "",
    input_schema: t.inputSchema || { type: "object", properties: {} },
  }));
  // เพิ่ม local tool: สร้างรูปด้วย Gemini (รันในบอท ไม่ผ่าน MCP)
  tools.push({
    name: "generate_image",
    description:
      "สร้างรูปประกอบจากคำอธิบาย (Gemini) คืนค่า ref เพื่อนำไปใส่ใน featured_image.ref ตอนสร้าง/แก้โพสต์",
    input_schema: {
      type: "object",
      properties: { prompt: { type: "string", description: "คำอธิบายรูปที่ต้องการ อิงจากเนื้อหาบทความ" } },
      required: ["prompt"],
    },
  });
  return tools;
}

// แทนค่า featured_image.ref / media ref → base64 จริง ก่อนส่งเข้า MCP
function resolveImageRefs(args) {
  if (!args || typeof args !== "object") return args;
  const fix = (img) => {
    if (img && img.ref && imageStore.has(img.ref)) {
      const { base64 } = imageStore.get(img.ref);
      const { ref, ...rest } = img;
      return { ...rest, base64 };
    }
    return img;
  };
  if (args.featured_image) args.featured_image = fix(args.featured_image);
  if (args.ref && imageStore.has(args.ref)) {
    // กรณี wp_upload_media ส่ง ref ตรงๆ
    args.base64 = imageStore.get(args.ref).base64;
    delete args.ref;
  }
  return args;
}

// รัน tool หนึ่ง (generate_image รันในบอท, ที่เหลือส่งเข้า MCP)
async function runTool(name, args) {
  if (name === "generate_image") {
    const { base64, mime } = await generateImage(args.prompt || "");
    const ref = `img_${++imgCounter}`;
    imageStore.set(ref, { base64, mime });
    return `สร้างรูปแล้ว (ref="${ref}") — ใส่ใน featured_image: { ref: "${ref}", alt: "..." }`;
  }
  // ★ สำคัญ: clone ก่อน เพราะ args === block.input (อยู่ใน messages ที่ส่งกลับ Claude)
  // ถ้าแก้ตรงๆ จะทำให้ base64 ก้อนใหญ่รั่วเข้า context และถูกเก็บข้ามรอบ
  const resolved = resolveImageRefs(structuredClone(args));
  const { text, isError } = await callTool(name, resolved);
  return isError ? `ERROR: ${text}` : text;
}

/**
 * ตัดประวัติแบบปลอดภัย: เริ่ม window ที่ "user turn จริง" เสมอ
 * กัน 400 จาก (1) ขึ้นต้นด้วย assistant (2) tool_result ที่ขาด tool_use คู่กัน
 */
export function trimHistory(messages, max = 12) {
  if (messages.length <= max) return messages;
  const isCleanUserTurn = (m) =>
    m.role === "user" &&
    (typeof m.content === "string" ||
      (Array.isArray(m.content) && !m.content.some((b) => b && b.type === "tool_result")));
  for (let i = messages.length - max; i < messages.length; i++) {
    if (isCleanUserTurn(messages[i])) return messages.slice(i);
  }
  return []; // ไม่เจอ boundary ปลอดภัย → เริ่มใหม่ ดีกว่าส่ง window ที่พัง
}

/**
 * รัน agent กับข้อความผู้ใช้ คืนข้อความตอบ
 * @param {string} userText
 * @param {Array} [history] ประวัติ messages เดิม (optional)
 */
export async function runAgent(userText, history = []) {
  const tools = toAnthropicTools(await listTools());
  const messages = [...history, { role: "user", content: userText }];

  for (let step = 0; step < 12; step++) {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      tools,
      messages,
    });

    messages.push({ role: "assistant", content: res.content });

    if (res.stop_reason !== "tool_use") {
      const finalText = res.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { text: finalText || "เรียบร้อยค่ะ", messages };
    }

    // ทำทุก tool_use แล้วส่งผลกลับ
    const toolResults = [];
    for (const block of res.content) {
      if (block.type !== "tool_use") continue;
      let out;
      try {
        out = await runTool(block.name, block.input);
      } catch (e) {
        out = `ERROR: ${e.message}`;
      }
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: out });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return { text: "งานซับซ้อนเกิน (เกิน 12 รอบ) ขอลองใหม่แบบเจาะจงขึ้นนะคะ", messages };
}
