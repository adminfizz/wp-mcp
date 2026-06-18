// smoke test: spawn MCP server, list tools, เรียก list_sites
// รัน: node smoke-test.mjs   (ต้อง npm install ก่อน)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["src/index.js"],
});
const client = new Client({ name: "smoke", version: "0.0.1" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log("TOOLS (" + tools.length + "):", tools.map((t) => t.name).join(", "));

const res = await client.callTool({ name: "list_sites", arguments: {} });
console.log("list_sites →", res.content?.[0]?.text);

await client.close();
process.exit(0);
