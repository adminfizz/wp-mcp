// mcpClient.js — ★ ตัวเชื่อม MCP ★
// spawn ชั้น 2 (mcp-server) เป็น child process แล้วคุยผ่าน MCP protocol (stdio)
// ให้บอท: (1) ดึงรายการ tools  (2) เรียก tool
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

let _client = null;

/** เปิดการเชื่อมต่อ MCP (เรียกครั้งเดียวตอนบอทเริ่ม) */
export async function initMcp() {
  if (_client) return _client;

  const entry = resolve(__dirname, "..", process.env.MCP_SERVER_ENTRY || "../mcp-server/src/index.js");

  const transport = new StdioClientTransport({
    command: process.execPath, // node ตัวเดียวกัน
    args: [entry],
    // ส่ง env ต่อให้ MCP server (ตำแหน่งทะเบียนโดเมน)
    env: { ...process.env, DOMAINS_FILE: process.env.DOMAINS_FILE || "" },
  });

  const client = new Client({ name: "wp-mcp-bot", version: "0.1.0" });
  await client.connect(transport);
  _client = client;
  return client;
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
