# WP-MCP — คุม WordPress หลายโดเมนผ่าน Telegram + MCP

สั่งงาน WordPress หลายเว็บ (เขียนบทความ + สร้างรูปจากเนื้อหา + ทำ SEO) ผ่าน Telegram
โดยมี **MCP** เป็นตัวกลางเชื่อมคำสั่งเข้ากับปลั๊กอินที่เราเขียนเอง

📐 อ่านการออกแบบ/flow เต็มที่ [`ARCHITECTURE.md`](./ARCHITECTURE.md) · 🗺️ แผนงานที่ [`docs/ROADMAP.md`](./docs/ROADMAP.md)

---

## สถาปัตยกรรมย่อ

```
Telegram (slash / ภาษาไทย)
   │
   ▼
[1] telegram-bot  ── Claude เขียนบทความ + Gemini สร้างรูป + ★เชื่อม MCP★
   │  (MCP stdio)
   ▼
[2] mcp-server    ── tools + ทะเบียนโดเมน (domain→url+key), route ตาม `domain`
   │  (HTTPS + X-Kim-Key)
   ▼
[3] kim-mcp-bridge (ปลั๊กอิน PHP) ── /wp-json/kim/v1/ ติดตั้งทุกเว็บบน cPanel
```

- ชั้น 1+2 รันที่เครื่อง local (pm2) เดียวกับ slip-bot
- ชั้น 3 รันบน cPanel แต่ละโดเมน

---

## ติดตั้ง & รัน

### 1) ปลั๊กอิน (ชั้น 3) — ทำก่อน
1. zip โฟลเดอร์ `wordpress-plugin/kim-mcp-bridge`
2. WP admin → Plugins → Add New → Upload → Activate
3. Settings → **Kim MCP** → ตั้ง **API Key** (สุ่มยาวๆ) — หรือใส่ใน `wp-config.php`:
   `define('KIM_MCP_KEY', 'คีย์ลับของเว็บนี้');`
4. ทดสอบ: `SITE="https://โดเมน" KEY="คีย์" bash test/test-endpoints.sh` → ต้องเห็น `"ok": true`

### 2) MCP server (ชั้น 2)
```bash
cd mcp-server
cp config/domains.example.json config/domains.json   # ใส่ url + key ของแต่ละเว็บ
npm install
node src/index.js        # ทดสอบรันเดี่ยว (Ctrl+C ออก)
```

### 3) Telegram bot (ชั้น 1)
```bash
cd telegram-bot
cp .env.example .env      # ใส่ TELEGRAM_BOT_TOKEN, ANTHROPIC_API_KEY, GEMINI_API_KEY, ALLOWED_CHAT_IDS
npm install
pm2 start ecosystem.config.js     # หรือ npm start
```
> บอทจะ spawn MCP server (ชั้น 2) ให้เองอัตโนมัติ ไม่ต้องรันแยก

---

## ใช้งานใน Telegram

📖 คู่มือใช้งานละเอียด (เริ่มตั้งแต่ login) ที่ [`docs/USAGE.md`](./docs/USAGE.md)

**เริ่มต้น (login → เชื่อมเว็บ → เลือก → สั่ง):**
```
/start                                ← login บอท
/addsite siteA https://a.com KEY      ← เชื่อมเว็บ (เว็บที่ลงปลั๊กอินแล้ว) บอทเช็ค health ให้
/use siteA                            ← เลือกเว็บที่จะสั่งงาน
/report                               ← ลองอ่านข้อมูล
```

**Slash (เร็ว):** `/sites` `/use` `/health [เว็บ]` `/report [เว็บ]` `/posts [เว็บ]`
`/publish [เว็บ] <id>` `/draft [เว็บ] <id>` `/delete [เว็บ] <id>` · ไม่ใส่ชื่อเว็บ = ใช้เว็บที่ `/use` ไว้

**ภาษาไทย (ยืดหยุ่น):**
- "เขียนบทความเรื่องวิธีชงกาแฟดริปลงเว็บA ใส่รูปสวยๆด้วย"
- "ลงเว็บB บทความรีวิวร้านอาหาร ตั้งเป็น draft ก่อน"
- "เว็บA มีโพสต์อะไรล่าสุดบ้าง"

---

## โครงสร้าง

```
wp-mcp/
├── wordpress-plugin/kim-mcp-bridge/kim-mcp-bridge.php   [3] ปลั๊กอิน ✅
├── mcp-server/        [2] MCP server (index/registry/wpClient)
├── telegram-bot/      [1] บอท + ตัวเชื่อม MCP (bot/mcpClient/agent/commands/gemini)
├── test/test-endpoints.sh
├── ARCHITECTURE.md    การออกแบบ + flow เต็ม
└── docs/ROADMAP.md    แผนงาน
```

## ความปลอดภัย
- กุญแจไม่ขึ้น git: `.env`, `mcp-server/config/domains.json` อยู่ใน `.gitignore`
- ปลั๊กอิน auth ด้วย header `X-Kim-Key` (เลี่ยงปัญหา cPanel ตัด Authorization)
- บอทเช็คสิทธิ์ด้วย `ALLOWED_CHAT_IDS`
