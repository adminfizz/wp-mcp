// mcpClient.js — ★ ตัวเชื่อม MCP ★
// spawn ชั้น 2 (mcp-server) เป็น child process แล้วคุยผ่าน MCP protocol (stdio)
// ให้บอท: (1) ดึงรายการ tools  (2) เรียก tool
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { domainsFilePath } from "./sites.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// memoize "promise" ไม่ใช่ client — กันกรณีหลายข้อความเข้าพร้อมกันตอนบอทเพิ่งเริ่ม
// แล้ว spawn MCP server ซ้ำซ้อน (เด็กกำพร้า + อ่าน domains.json ซ้อน)
let _clientPromise = null;

/** เปิดการเชื่อมต่อ MCP (เรียกครั้งเดียว ที่เหลือใช้ตัวเดิม) */
export function initMcp() {
  if (_clientPromise) return _clientPromise;
  _clientPromise = (async () => {
    const entry = resolve(__dirname, "..", process.env.MCP_SERVER_ENTRY || "../mcp-server/src/index.js");
    const transport = new StdioClientTransport({
      command: process.execPath, // node ตัวเดียวกัน
      args: [entry],
      // ส่ง DOMAINS_FILE เป็น absolute → บอท (sites.js) เขียน / MCP (registry.js) อ่าน ไฟล์เดียวกันแน่นอน
      env: { ...process.env, DOMAINS_FILE: domainsFilePath() },
    });
    const client = new Client({ name: "wp-mcp-bot", version: "0.1.0" });
    await client.connect(transport);
    return client;
  })().catch((e) => {
    _clientPromise = null; // ล้มเหลว → เคลียร์ ให้เรียกใหม่ได้
    throw e;
  });
  return _clientPromise;
}

/** ดึงรายการ tools จาก MCP server (รูปแบบ JSON schema) */
export async function listTools() {
  const client = await initMcp();
  const { tools } = await client.listTools();
  return tools; // [{ name, description, inputSchema }]
}

/** เรียก tool หนึ่ง คืน text รวม */
export async function callTool(name, args) {
  const client = await initMcp();
  const res = await client.callTool({ name, arguments: args || {} });
  const text = (res.content || [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  return { text, isError: !!res.isError };
}
