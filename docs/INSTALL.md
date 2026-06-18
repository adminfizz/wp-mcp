# คู่มือติดตั้งทั้งหมด (ตั้งแต่ศูนย์) + ตัวอย่างใช้งาน

ทำตามลำดับ 1→6 ครั้งเดียว แล้วใช้งานได้เลย

---

## สิ่งที่ต้องมีก่อน (Prerequisites)
- เครื่อง local หรือ VPS (Windows/Linux) ที่ลง **Node.js 20+** และ **pm2** (เครื่องเดียวกับ slip-bot ได้)
  ```bash
  node -v            # ต้อง >= 20
  npm i -g pm2       # ถ้ายังไม่มี
  ```
- คีย์/บัญชี 3 อย่าง:
  - **Telegram Bot Token** — สร้างบอทใหม่กับ [@BotFather](https://t.me/BotFather) → `/newbot` (ใช้ token แยกจาก slip-bot)
  - **Anthropic API key** — เขียนบทความ + ตีความคำสั่ง
  - **Gemini API key** — สร้างรูป (ใช้ key เดียวกับ slip-bot ได้)
- WordPress แต่ละเว็บบน cPanel ที่ **เข้า wp-admin ได้**

---

## 1) เอาโค้ดลงเครื่อง
```bash
git clone https://github.com/adminfizz/wp-mcp.git
cd wp-mcp
```

## 2) ติดตั้งปลั๊กอินบน WordPress (ชั้น 3) — ทำต่อเว็บ
มี 2 ทาง — เลือกอย่างใดอย่างหนึ่ง:

**ทาง A — ให้บอทติดตั้งอัตโนมัติ** (ทำทีหลัง หลังตั้งบอทเสร็จ ข้อ 5)
ในแชทบอท: `/onboard siteA https://a.com admin-user admin-pass` (ดูข้อจำกัดใน [USAGE.md](./USAGE.md))

**ทาง B — ติดตั้งเอง** (ชัวร์ทุกโฮสต์)
1. zip โฟลเดอร์ `wordpress-plugin/kim-mcp-bridge`
   - Windows: คลิกขวาโฟลเดอร์ → Send to → Compressed (zipped) folder
   - Mac/Linux: `cd wordpress-plugin && zip -r kim-mcp-bridge.zip kim-mcp-bridge`
2. WP admin → **Plugins → Add New → Upload Plugin** → เลือก zip → **Install Now → Activate**
3. **Settings → Kim MCP** → ตั้ง **API Key** (สุ่มยาวๆ) → Save
   - หรือใส่ใน `wp-config.php`: `define('KIM_MCP_KEY', 'คีย์ลับของเว็บนี้');`
4. ทดสอบว่าเชื่อมได้:
   ```bash
   SITE="https://a.com" KEY="คีย์ที่ตั้ง" bash test/test-endpoints.sh
   ```
   ต้องเห็น `"ok": true`

## 3) ตั้งค่า MCP server (ชั้น 2)
```bash
cd mcp-server
npm install
cp config/domains.example.json config/domains.json
```
ใส่เว็บลงทะเบียน — แก้ไฟล์ `config/domains.json` หรือใช้ CLI:
```bash
node add-site.mjs add siteA https://a.com KEY_A
node add-site.mjs add siteB https://b.com KEY_B
node add-site.mjs list
```
ทดสอบ MCP server (ควรเห็น 13 tools):
```bash
node smoke-test.mjs
```

## 4) ตั้งค่า Telegram bot (ชั้น 1)
```bash
cd ../telegram-bot
npm install
cp .env.example .env
```
แก้ `.env`:
```ini
TELEGRAM_BOT_TOKEN=123456:ABC...           # จาก BotFather
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIza...
ALLOWED_CHAT_IDS=                            # chat id ที่อนุญาต (ดูวิธีหาด้านล่าง)
```
> **หา chat id ตัวเอง:** สตาร์ทบอทก่อน (ข้อ 5) แล้วทักอะไรก็ได้ — ถ้าไม่มีสิทธิ์ บอทจะตอบ id ของคุณกลับมา เอา id นั้นใส่ `ALLOWED_CHAT_IDS` แล้ว `pm2 restart`
> (ปล่อยว่าง = อนุญาตทุกคน — ไม่แนะนำ)

## 5) รันบอท
```bash
pm2 start ecosystem.config.js     # บอทจะ spawn MCP server (ชั้น 2) ให้เอง
pm2 logs wp-mcp-bot               # ดู log (ควรเห็น "wp-mcp-bot พร้อมทำงาน")
pm2 save                          # จำ process ไว้ (คู่กับ: pm2 startup)
```

## 6) ทดสอบใน Telegram
เปิดแชทบอท แล้วลองตามนี้ 👇

---

## ตัวอย่างใช้งานจริง (worked example)

### กรณี A — เว็บที่ลงปลั๊กอินเองแล้ว (ทาง B ข้อ 2)
```
คุณ:  /start
บอท:  สวัสดีค่ะ 🙂 ... เว็บที่เชื่อมแล้ว: siteA — https://a.com ...

คุณ:  /use siteA
บอท:  เลือกเว็บ "siteA" เป็นค่าเริ่มต้นของแชทนี้แล้วค่ะ ✅

คุณ:  /report
บอท:  { site: "...", posts: { publish: 12, draft: 3 }, ... }

คุณ:  เขียนบทความเรื่องวิธีชงกาแฟดริปสำหรับมือใหม่ ใส่รูปสวยๆ ตั้งเป็น draft
บอท:  (Claude เขียนบทความ+SEO, Gemini สร้างรูป, ลง draft)
      ✅ ลง draft ที่ siteA แล้วค่ะ: https://a.com/?p=45

คุณ:  /publish 45
บอท:  เผยแพร่โพสต์ 45 แล้วค่ะ
```

### กรณี B — เว็บใหม่ ให้บอทติดตั้งปลั๊กอินอัตโนมัติ
```
คุณ:  /onboard siteB https://b.com admin myPassw0rd
บอท:  🔐 login wp-admin... ✅
      📦 อัปโหลดปลั๊กอิน... ✅ activate แล้ว
      🔑 ตั้ง API key... ✅
      ✅ ติดตั้ง+เชื่อม "siteB" อัตโนมัติสำเร็จ! ตั้งเป็นเว็บที่ใช้อยู่
      🔒 ลบข้อความ /onboard นี้ทิ้งด้วยนะคะ (มีรหัส admin อยู่)

คุณ:  (ลบข้อความ /onboard ทิ้ง) แล้วสั่งงาน siteB ได้เลย
```

### สั่งงานแยกหลายเว็บในแชทเดียว
```
/report siteA           ← ยิงเฉพาะ siteA
/report siteB           ← ยิงเฉพาะ siteB
/use siteA
"ลงบทความรีวิวกาแฟ"      ← เข้า siteA (เว็บที่ /use ไว้)
"ลงบทความเดียวกันที่ siteB ด้วย"   ← ระบุชื่อ → เข้า siteB
```

---

## อัปเดต / ดูแลรักษา
```bash
cd wp-mcp && git pull
cd mcp-server && npm install        # ถ้า deps เปลี่ยน
cd ../telegram-bot && npm install
pm2 restart wp-mcp-bot
```
- **อัปเดตปลั๊กอิน:** อัป zip ใหม่ทับของเดิม (หรือ `/onboard` ซ้ำ — จะอัปทับให้)
- **เพิ่มเว็บ:** `/onboard` / `/addsite` ในแชท หรือ `node add-site.mjs add ...` แล้ว `pm2 restart`

## แก้ปัญหาที่พบบ่อย (Troubleshooting)
| อาการ | สาเหตุ/วิธีแก้ |
|-------|---------------|
| `/addsite` ตอบ "ตรวจสอบไม่ผ่าน" | key/url ผิด หรือปลั๊กอินยังไม่ activate — เช็คที่ Settings>Kim MCP |
| `/onboard` ไม่สำเร็จ | เว็บมี 2FA/CAPTCHA/security plugin หรือโฮสต์ปิดอัปปลั๊กอิน → ใช้ทาง B (ติดตั้งเอง) |
| health ตอบ 401 | key ฝั่งบอท (domains.json) ไม่ตรงกับที่ตั้งในปลั๊กอิน |
| บอทไม่ตอบ | เช็ค `ALLOWED_CHAT_IDS`, ดู `pm2 logs wp-mcp-bot` |
| บอทขึ้น "ไม่รู้จักโดเมน" | ยังไม่ได้เพิ่มเว็บ หรือเพิ่มแล้วแต่ไม่ได้ reload — `pm2 restart` หรือใช้ `/addsite` |
| สร้างรูปไม่ได้ | ตรวจ `GEMINI_API_KEY` และชื่อโมเดล `GEMINI_IMAGE_MODEL` |

📖 คำสั่งทั้งหมด + การใช้งานรายวัน ดูที่ [USAGE.md](./USAGE.md) · การออกแบบระบบ [ARCHITECTURE.md](../ARCHITECTURE.md)
