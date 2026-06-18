# แผนพัฒนา (Roadmap) — WP-MCP

> สถานะ ณ วันที่เริ่มโปรเจกต์: ชั้น 3 (ปลั๊กอิน) เสร็จ, ชั้น 1–2 วางโครงแล้ว รอใส่กุญแจจริง

## สิ่งที่เสร็จแล้ว ✅
- **ปลั๊กอิน `kim-mcp-bridge`** (ชั้น 3) — REST `/wp-json/kim/v1/` ครบ: health, posts (CRUD), media, settings, report, action
  - Auth `X-Kim-Key`, auto-detect RankMath/Yoast, featured image (url/base64)
  - **ผ่าน `php -l` ไม่มี syntax error**
- **โครง MCP server** (ชั้น 2) — index/registry/wpClient + tools ครบทุก endpoint
- **โครง Telegram bot + ตัวเชื่อม MCP** (ชั้น 1) — bot/mcpClient/agent/commands/gemini

## ขาดอยู่ / ต้องทำต่อ ⏳
1. **ใส่กุญแจจริง** (สิ่งที่บล็อกการรันจริง)
   - `mcp-server/config/domains.json` ← รายชื่อโดเมน + API key แต่ละเว็บ
   - `telegram-bot/.env` ← `TELEGRAM_BOT_TOKEN`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `ALLOWED_CHAT_IDS`
2. **ติดตั้งปลั๊กอินบนเว็บจริง 1 เว็บ** + ตั้ง key → ทดสอบ `test/test-endpoints.sh`
3. **ทดสอบ MCP server** เดี่ยวๆ: `node mcp-server/src/index.js` แล้วลองเรียก tool
4. **ทดสอบบอท end-to-end**: `/sites`, `/report`, แล้วลองสั่งภาษาไทยเขียนบทความ
5. **ขยายไป >5 โดเมน**: เพิ่มเข้า `domains.json` (โครงรองรับแล้ว)

## ลำดับการลงมือ (แนะนำ)
```
[เสร็จ] เขียนปลั๊กอิน → lint ผ่าน
  ↓
(1) อัปปลั๊กอินขึ้นเว็บแรก + ตั้ง key + curl ทดสอบ      ← ทำก่อน (vertical slice)
  ↓
(2) ใส่ domains.json (เว็บแรก) → ทดสอบ MCP server เดี่ยว
  ↓
(3) ใส่ .env บอท → npm i → pm2 start → ทดสอบใน Telegram
  ↓
(4) ครบรอบ 1 เว็บแล้ว → เพิ่มอีกหลายโดเมนเข้า domains.json
```

## ไอเดียต่อยอด (ภายหลัง)
- `/schedule` ตั้งเวลาโพสต์อัตโนมัติ (ปลั๊กอินรองรับ status=future ได้)
- คิวงาน + กันโพสต์ซ้ำ (เหมือน slip-bot persistent_queue)
- `GET /health` ของทุกเว็บ → dashboard ดูว่าเว็บไหนปลั๊กอินเวอร์ชันไหน
- action เฉพาะทาง เช่น sync สต็อก WooCommerce ผ่าน `/action/{name}`
- รายงานสรุปยอด/สถิติรวมหลายเว็บใน Telegram
