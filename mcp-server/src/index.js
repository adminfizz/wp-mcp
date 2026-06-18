// index.js — MCP server: เปิด "เครื่องมือ" ให้บอท/Claude เรียกไปสั่ง WordPress
// รันเดี่ยว: `node src/index.js`  (สื่อสารผ่าน stdio ตามมาตรฐาน MCP)
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { callWp } from "./wpClient.js";
import { listSiteNames, reloadSites } from "./registry.js";

const server = new McpServer({ name: "wp-mcp-server", version: "0.1.0" });

// helper: คืนผลเป็น text (JSON) ตามรูปแบบ MCP
const ok = (data) => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const fail = (e) => ({ content: [{ type: "text", text: `ERROR: ${e.message}` }], isError: true });

// sub-schema ใช้ซ้ำ
const domain = z.string().describe("ชื่อโดเมนใน registry เช่น siteA");
const seoSchema = z
  .object({
    title: z.string().optional().describe("SEO title"),
    description: z.string().optional().describe("meta description"),
    focus_keyword: z.string().optional(),
  })
  .optional();
const imageSchema = z
  .object({
    ref: z.string().optional().describe("อ้างอิงรูปที่บอทสร้างไว้ (บอทจะสลับเป็น base64 ให้ก่อนส่งจริง)"),
    url: z.string().optional().describe("URL รูป (อย่างใดอย่างหนึ่งกับ base64)"),
    base64: z.string().optional().describe("รูปแบบ base64 (เช่นที่ Gemini สร้าง)"),
    alt: z.string().optional().describe("alt text เพื่อ SEO"),
    filename: z.string().optional(),
  })
  .optional();

// ---- ทะเบียนโดเมน ----
server.registerTool(
  "list_sites",
  { description: "แสดงรายชื่อโดเมนทั้งหมดที่คุมได้ (ไม่แสดง key)", inputSchema: {} },
  async () => {
    try {
      return ok(listSiteNames());
    } catch (e) {
      return fail(e);
    }
  }
);

server.registerTool(
  "reload_sites",
  { description: "โหลดทะเบียนโดเมนใหม่จากไฟล์ (เรียกหลังเพิ่ม/ลบเว็บ เพื่อให้มีผลทันที)", inputSchema: {} },
  async () => {
    try {
      reloadSites();
      return ok(listSiteNames());
    } catch (e) {
      return fail(e);
    }
  }
);

// ---- health / report ----
server.registerTool(
  "wp_health",
  { description: "เช็คว่าปลั๊กอินทำงาน + เวอร์ชัน + SEO plugin ที่ใช้", inputSchema: { domain } },
  async ({ domain }) => {
    try {
      return ok(await callWp(domain, "GET", "/health"));
    } catch (e) {
      return fail(e);
    }
  }
);

server.registerTool(
  "wp_report",
  { description: "สรุปภาพรวมเว็บ: จำนวนโพสต์/เพจ/คอมเมนต์ + โพสต์ล่าสุด", inputSchema: { domain } },
  async ({ domain }) => {
    try {
      return ok(await callWp(domain, "GET", "/report"));
    } catch (e) {
      return fail(e);
    }
  }
);

// ---- โพสต์ ----
server.registerTool(
  "wp_list_posts",
  {
    description: "ลิสต์โพสต์/เพจ",
    inputSchema: {
      domain,
      type: z.string().optional().describe("post | page (default post)"),
      status: z.string().optional().describe("publish | draft | any"),
      search: z.string().optional(),
      per_page: z.number().int().optional(),
    },
  },
  async ({ domain, type, status, search, per_page }) => {
    try {
      const q = new URLSearchParams();
      if (type) q.set("type", type);
      if (status) q.set("status", status);
      if (search) q.set("search", search);
      if (per_page) q.set("per_page", String(per_page));
      const qs = q.toString();
      return ok(await callWp(domain, "GET", `/posts${qs ? "?" + qs : ""}`));
    } catch (e) {
      return fail(e);
    }
  }
);

server.registerTool(
  "wp_get_post",
  { description: "ดึงโพสต์ตาม id (รวมเนื้อหา + SEO)", inputSchema: { domain, id: z.number().int() } },
  async ({ domain, id }) => {
    try {
      return ok(await callWp(domain, "GET", `/posts/${id}`));
    } catch (e) {
      return fail(e);
    }
  }
);

server.registerTool(
  "wp_create_post",
  {
    description:
      "สร้างบทความ/เพจ พร้อม SEO + featured image. ใช้ตอนต้องการเผยแพร่บทความใหม่. ตั้ง status='draft' ถ้ายังไม่อยากให้ขึ้นจริง",
    inputSchema: {
      domain,
      title: z.string(),
      content: z.string().describe("HTML ของบทความ"),
      type: z.string().optional().describe("post | page"),
      status: z.string().optional().describe("draft | publish | future"),
      excerpt: z.string().optional(),
      slug: z.string().optional(),
      categories: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
      seo: seoSchema,
      featured_image: imageSchema,
    },
  },
  async (args) => {
    try {
      const { domain, ...body } = args;
      return ok(await callWp(domain, "POST", "/posts", body));
    } catch (e) {
      return fail(e);
    }
  }
);

server.registerTool(
  "wp_update_post",
  {
    description: "แก้ไขโพสต์ที่มีอยู่ (ส่งเฉพาะ field ที่ต้องการเปลี่ยน)",
    inputSchema: {
      domain,
      id: z.number().int(),
      title: z.string().optional(),
      content: z.string().optional(),
      status: z.string().optional(),
      excerpt: z.string().optional(),
      slug: z.string().optional(),
      categories: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
      seo: seoSchema,
      featured_image: imageSchema,
    },
  },
  async (args) => {
    try {
      const { domain, id, ...body } = args;
      return ok(await callWp(domain, "POST", `/posts/${id}`, body));
    } catch (e) {
      return fail(e);
    }
  }
);

server.registerTool(
  "wp_delete_post",
  {
    description: "ลบโพสต์ (force=true ลบถาวร, ไม่งั้นลงถังขยะ)",
    inputSchema: { domain, id: z.number().int(), force: z.boolean().optional() },
  },
  async ({ domain, id, force }) => {
    try {
      return ok(await callWp(domain, "DELETE", `/posts/${id}${force ? "?force=1" : ""}`));
    } catch (e) {
      return fail(e);
    }
  }
);

// ---- media ----
server.registerTool(
  "wp_upload_media",
  {
    description: "อัปโหลดรูปเข้า media library (ส่ง url หรือ base64) คืน attachment id + url",
    inputSchema: {
      domain,
      url: z.string().optional(),
      base64: z.string().optional(),
      filename: z.string().optional(),
      alt: z.string().optional(),
    },
  },
  async (args) => {
    try {
      const { domain, ...body } = args;
      return ok(await callWp(domain, "POST", "/media", body));
    } catch (e) {
      return fail(e);
    }
  }
);

// ---- settings ----
server.registerTool(
  "wp_get_settings",
  { description: "อ่านค่า option (เฉพาะที่ whitelist)", inputSchema: { domain, keys: z.string().optional().describe("คั่นด้วย comma") } },
  async ({ domain, keys }) => {
    try {
      return ok(await callWp(domain, "GET", `/settings${keys ? "?keys=" + encodeURIComponent(keys) : ""}`));
    } catch (e) {
      return fail(e);
    }
  }
);

server.registerTool(
  "wp_update_settings",
  { description: "แก้ค่า option (เฉพาะที่ whitelist)", inputSchema: { domain, values: z.record(z.any()) } },
  async ({ domain, values }) => {
    try {
      return ok(await callWp(domain, "POST", "/settings", values));
    } catch (e) {
      return fail(e);
    }
  }
);

// ---- custom action ----
server.registerTool(
  "wp_run_action",
  {
    description: "สั่ง action เฉพาะที่ปลั๊กอินลงทะเบียนไว้ (filter kim_mcp_action_{name})",
    inputSchema: { domain, name: z.string(), payload: z.record(z.any()).optional() },
  },
  async ({ domain, name, payload }) => {
    try {
      return ok(await callWp(domain, "POST", `/action/${name}`, payload || {}));
    } catch (e) {
      return fail(e);
    }
  }
);

// ---- start ----
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("wp-mcp-server พร้อมทำงาน (stdio)");
