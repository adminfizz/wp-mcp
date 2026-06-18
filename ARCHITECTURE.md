# สถาปัตยกรรมระบบ WP-MCP

> คุม WordPress หลายโดเมน (เขียนบทความ + สร้างรูป + ทำ SEO) สั่งงานผ่าน Telegram โดยมี **MCP** เป็นตัวกลางเชื่อมคำสั่งเข้ากับปลั๊กอินที่เราเขียนเอง

---

## 1. ภาพรวม 3 ชั้น + ตัวเชื่อม

```
┌──────────────────────────────────────────────────────────────────┐
│  ผู้ใช้พิมพ์ใน Telegram                                              │
│  • slash command  เช่น  /post เว็บA "หัวข้อ"                          │
│  • ภาษาไทยธรรมชาติ เช่น  "เขียนบทความเรื่องกาแฟลงเว็บA ใส่รูปด้วย"      │
└───────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│  [ชั้น 1] Telegram Bot  (Node, รันด้วย pm2 เครื่องเดียวกับ slip-bot)   │
│  ────────────────────────────────────────────────────────────────  │
│  • รับข้อความ + เช็คสิทธิ์ (ALLOWED_CHAT_IDS)                          │
│  • slash → เรียก MCP tool ตรงๆ (เร็ว ประหยัด token)                   │
│  • ภาษาไทย → ส่งให้ Claude ตีความ (Agent loop)                        │
│  • ★ ตัวเชื่อม MCP↔Telegram อยู่ที่นี่ (mcpClient.js + agent.js) ★      │
│  • สร้างรูปด้วย Gemini (local tool: generate_image)                   │
└───────────────────────────────┬──────────────────────────────────┘
                                │  พูดผ่าน MCP protocol (stdio)
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│  [ชั้น 2] MCP Server  (Node, spawn เป็น child process ของบอท)         │
│  ────────────────────────────────────────────────────────────────  │
│  • เปิด "เครื่องมือ" (tools) ให้ Claude/บอทเรียก                        │
│  • มีทะเบียนโดเมน (domain → URL + API key)  [gitignored]              │
│  • ทุก tool รับพารามิเตอร์ `domain` → route ไปเว็บที่ถูกต้อง            │
│  • แปลงคำสั่งเป็น HTTP เรียกปลั๊กอิน (แนบ header X-Kim-Key)            │
└───────────────────────────────┬──────────────────────────────────┘
                                │  HTTPS REST + header X-Kim-Key
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│  [ชั้น 3] ปลั๊กอิน PHP `kim-mcp-bridge`  (ติดตั้งทุกเว็บบน cPanel)      │
│  ────────────────────────────────────────────────────────────────  │
│  • REST namespace  /wp-json/kim/v1/                                 │
│  • สร้าง/แก้/ลบ โพสต์ + featured image + SEO meta                     │
│  • auto-detect RankMath / Yoast                                     │
└──────────────────────────────────────────────────────────────────┘
```

### ที่รันแต่ละชั้น (สำคัญ)
| ชั้น | รันที่ไหน | เหตุผล |
|------|----------|--------|
| 1 บอท + 2 MCP | เครื่อง local (pm2) เดียวกับ slip-bot | cPanel รัน Node ค้างไม่ได้ + เก็บ API key ปลอดภัยฝั่งเรา |
| 3 ปลั๊กอิน | cPanel แต่ละโดเมน | เป็นแค่ REST endpoint เบาๆ ไม่มี key ภายนอก |

---

## 2. ★ ตัวเชื่อม MCP ↔ Telegram (ชิ้นหัวใจ) ★

นี่คือส่วนที่ทำให้ "พิมพ์ใน Telegram → ไปสั่ง WordPress ได้" มี 3 ไฟล์หลักในบอท:

```
telegram-bot/src/
├── bot.js          ← รับข้อความ Telegram, แยก slash vs ภาษาธรรมชาติ
├── mcpClient.js    ← เปิดการเชื่อมต่อ MCP (spawn ชั้น 2 เป็น child), ดึง tool list, เรียก tool
└── agent.js        ← Claude agent loop: เอา MCP tools มาเป็นเครื่องมือให้ Claude เลือกใช้เอง
```

### flow ของข้อความภาษาไทย (กรณีซับซ้อนสุด)
```
1. user: "เขียนบทความเรื่องวิธีชงกาแฟลงเว็บA แล้วใส่รูปสวยๆด้วย"
2. bot.js  → ส่งข้อความ + ประวัติให้ agent.js
3. agent.js → เรียก Claude (claude-opus-4-8) พร้อมแนบ tool list ที่ได้จาก mcpClient
              (list_sites, wp_create_post, generate_image, ...)
4. Claude คิด → เขียนบทความไทย + SEO meta เอง → ขอเรียก tool `generate_image`
5. agent.js  → รัน Gemini สร้างรูป (base64) → ส่งผลกลับเข้า Claude
6. Claude → ขอเรียก tool `wp_create_post` { domain:"เว็บA", title, content, seo, featured_image:{base64} }
7. agent.js → ส่งคำขอนี้ผ่าน mcpClient → MCP server (ชั้น 2)
8. MCP server → POST /wp-json/kim/v1/posts ที่เว็บA (แนบ X-Kim-Key)
9. ปลั๊กอิน → สร้างโพสต์ + อัปรูป + เซ็ต SEO → คืน {id, link}
10. ไหลกลับขึ้นมา → bot.js ตอบใน Telegram: "✅ ลงเว็บA แล้ว: <ลิงก์>"
```

### flow ของ slash command (เร็ว ไม่ผ่าน Claude)
```
/report เว็บA
  → bot.js แยกคำสั่ง → mcpClient.callTool("wp_report", {domain:"เว็บA"})
  → MCP → GET /wp-json/kim/v1/report → ตอบสรุปกลับ Telegram
```

**กุญแจการออกแบบ:** MCP tools ถูก "แปลง" เป็นรูปแบบ tool ของ Claude แบบอัตโนมัติใน `agent.js`
ดังนั้นเพิ่ม tool ใหม่ในชั้น 2 ครั้งเดียว → ใช้ได้ทั้ง slash และภาษาธรรมชาติทันที

---

## 3. การจัดวางโค้ดทั้งหมด

```
wp-mcp/
├── README.md                 ← เริ่มที่นี่: ติดตั้ง + รัน
├── ARCHITECTURE.md           ← ไฟล์นี้: ออกแบบ + flow
├── docs/
│   └── ROADMAP.md            ← แผนพัฒนา + สิ่งที่ทำแล้ว/ยังขาด
│
├── wordpress-plugin/kim-mcp-bridge/
│   └── kim-mcp-bridge.php     ← [ชั้น 3] ปลั๊กอิน (อัปขึ้น WP)  ✅ เสร็จ
│
├── mcp-server/                ← [ชั้น 2] MCP server
│   ├── package.json
│   ├── src/
│   │   ├── index.js           ← จุดเข้า: ลงทะเบียน tools ทั้งหมด
│   │   ├── registry.js        ← โหลดทะเบียนโดเมน (domain→url+key)
│   │   └── wpClient.js        ← เรียก REST ปลั๊กอิน (แนบ X-Kim-Key)
│   ├── config/
│   │   └── domains.example.json  ← ก็อปเป็น domains.json แล้วใส่ของจริง [gitignored]
│   └── .env.example
│
└── telegram-bot/              ← [ชั้น 1] บอท + ตัวเชื่อม
    ├── package.json
    ├── ecosystem.config.js    ← pm2
    ├── src/
    │   ├── bot.js             ← รับข้อความ Telegram
    │   ├── mcpClient.js       ← ★ เชื่อม MCP (spawn ชั้น 2)
    │   ├── agent.js           ← ★ Claude agent loop (NL → tools)
    │   ├── commands.js        ← parser ของ slash command
    │   └── gemini.js          ← สร้างรูปจากเนื้อหา
    └── .env.example
```

---

## 4. การตัดสินใจหลัก (ทำไมออกแบบแบบนี้)

| ประเด็น | ทางเลือก | เหตุผล |
|---------|----------|--------|
| Auth ปลั๊กอิน | header `X-Kim-Key` (ไม่ใช่ Application Password) | cPanel หลายเจ้าตัด `Authorization` header → Basic Auth พังแบบงงๆ |
| AI อยู่ชั้นไหน | ชั้นบอท (ไม่ใช่ใน PHP) | ไม่เก็บ API key บน shared hosting + PHP เบา ปลอดภัย |
| สมองเขียนบทความ | Claude (claude-opus-4-8) | คุณภาพงานเขียนไทย + รองรับ tool use/MCP ดี |
| สร้างรูป | Gemini (GEMINI_API_KEY เดิมจาก slip-bot) | มี key อยู่แล้ว ไม่ต้องสมัครบริการรูปใหม่ |
| หลายโดเมน | registry + param `domain` ทุก tool | เพิ่มเว็บ = แก้ config ไฟล์เดียว ไม่ต้องแก้โค้ด |
| รูปแบบสั่ง | slash + ภาษาไทย ผสม | slash เร็ว/ประหยัด token, ภาษาไทยยืดหยุ่น |

---

## 5. ความปลอดภัย
- **กุญแจไม่ขึ้น git**: `.env`, `config/domains.json` อยู่ใน `.gitignore`
- **API key ต่อเว็บ**: แต่ละโดเมนมี key ของตัวเอง เพิกถอนทีละเว็บได้
- **เช็คสิทธิ์ Telegram**: `ALLOWED_CHAT_IDS` กันคนอื่นสั่งบอท
- **ปลั๊กอินเทียบ key แบบ constant-time** (`hash_equals`) กันเดา key
