# ใช้ปลั๊กอินที่ติดตั้งบนแต่ละเว็บ สั่งผ่าน Telegram (รายโดเมน)

> Blueprint: ปลั๊กอิน `kim-mcp-bridge` ที่ติดตั้งบนเว็บ = **"มือ" ที่ลงมือทำบนเว็บนั้น**
> Telegram = **"ปาก" ที่สั่ง** · บอท+MCP = **ตัวกลาง** ส่งคำสั่งไปเว็บที่ถูกต้อง

```
พิมพ์ใน Telegram  ──►  บอท+MCP  ──►  ปลั๊กอินบน "เว็บที่เลือก"  ──►  ลงมือทำจริง
   (สั่ง)            (เลือกโดเมน)        (มือทำงาน)                (โพสต์/รูป/SEO/action)
```

---

## ขั้นที่ 1 — เชื่อมแต่ละโดเมน (ครั้งเดียว/เว็บ)
| สถานการณ์ | คำสั่ง |
|-----------|--------|
| เว็บใหม่ (ยังไม่มีปลั๊กอิน) | `/onboard <ชื่อ> <url> <admin-user> <admin-pass>` — บอทลงปลั๊กอิน+ตั้ง key เอง |
| เว็บที่ลงปลั๊กอินแล้ว | `/addsite <ชื่อ> <url> <key>` |

ทำซ้ำต่อเว็บ → `siteA`, `siteB`, `siteC` ... **แต่ละตัวมี url + key ของตัวเอง แยกขาดกัน**

---

## ขั้นที่ 2 — ปลั๊กอินทำอะไรได้บ้าง + สั่งยังไง (แค็ตตาล็อก)
"หัวข้อ" ที่ปลั๊กอินเปิดให้ (REST `/wp-json/kim/v1/...`) และคำสั่ง Telegram ที่ตรงกัน — ทุกอย่าง **ระบุโดเมนได้**:

| ปลั๊กอินทำอะไร (บนเว็บ) | endpoint | สั่งผ่าน Telegram |
|------------------------|----------|------------------|
| เขียนบทความ + SEO + รูป | `POST /posts` | ภาษาไทย: "เขียนบทความเรื่อง... ลง **siteA** ใส่รูป" |
| ดูโพสต์ล่าสุด | `GET /posts` | `/posts siteA` |
| เผยแพร่โพสต์ | `POST /posts/{id}` | `/publish siteA 45` |
| เปลี่ยนเป็น draft | `POST /posts/{id}` | `/draft siteA 45` |
| ลบโพสต์ | `DELETE /posts/{id}` | `/delete siteA 45` |
| รายงานภาพรวมเว็บ | `GET /report` | `/report siteA` |
| เช็คปลั๊กอิน/เวอร์ชัน | `GET /health` | `/health siteA` |
| อ่าน/แก้ตั้งค่า | `GET/POST /settings` | ภาษาไทย: "เปลี่ยนชื่อเว็บ siteA เป็น..." |
| **custom action** (ต่อปลั๊กอินเดิม) | `POST /action/{name}` | `/action siteA <name> [json]` |

---

## ขั้นที่ 3 — แยกโดเมนสั่งงาน (3 วิธี)
1. **เลือกค้างไว้:** `/use siteA` → คำสั่งถัดไปเข้า siteA หมด (ไม่ต้องพิมพ์ชื่อซ้ำ)
2. **ระบุชื่อในคำสั่ง:** `/report siteB` · `/publish siteB 12` (ยิงเว็บนั้นทันที ไม่กระทบเว็บที่ /use)
3. **ภาษาไทยระบุชื่อ:** "ลงบทความรีวิวกาแฟที่ **siteB**"

> ทุกคำสั่งวิ่งไปแค่โดเมนเดียวที่ระบุ — เว็บอื่นไม่ได้รับผลกระทบ

---

## ต่อ "ปลั๊กอินเดิม" ของเว็บ (WooCommerce / ของพี่เอง) เข้าบอท
`kim-mcp-bridge` เปิดช่อง `/action/{name}` ให้ปลั๊กอินอื่นเสียบฟังก์ชันเข้ามาได้ ผ่าน hook `kim_mcp_action_{name}`

**ขั้นตอน (ทำบนเว็บนั้น ครั้งเดียว):**
1. ใส่ snippet ลงใน mu-plugin / ธีม `functions.php` / ปลั๊กอินเล็กๆ ของเว็บนั้น:
   ```php
   // เคลียร์แคช (ต่อปลั๊กอิน cache เดิม)
   add_filter('kim_mcp_action_clear_cache', function ($res, $payload) {
       if (function_exists('wp_cache_clear_cache')) wp_cache_clear_cache();
       return ['cleared' => true];
   }, 10, 2);

   // นับออเดอร์ WooCommerce ที่รอจัดส่ง
   add_filter('kim_mcp_action_woo_pending', function ($res, $payload) {
       $ids = wc_get_orders(['limit' => -1, 'return' => 'ids', 'status' => 'processing']);
       return ['processing_orders' => count($ids)];
   }, 10, 2);
   ```
2. สั่งผ่าน Telegram (เลือกโดเมนได้):
   ```
   /action siteA clear_cache
   /action siteA woo_pending
   /action siteB run_sync {"full":true}      ← ส่ง payload เป็น JSON ได้
   ```
   → บอท → MCP → `POST /wp-json/kim/v1/action/<name>` ที่เว็บนั้น → snippet ทำงาน → ตอบกลับใน Telegram

> วิธีนี้ทำให้ "ปลั๊กอินเดิมอะไรก็ได้" กลายเป็นคำสั่ง Telegram รายโดเมน โดยไม่ต้องแก้ปลั๊กอินเดิม — แค่เพิ่ม hook สั้นๆ

---

## ตัวอย่างครบ (หลายโดเมน)
```
/onboard siteA https://a.com admin passA      ← เชื่อม+ลงปลั๊กอิน siteA
/addsite siteB https://b.com KEY_B            ← siteB ลงปลั๊กอินไว้แล้ว
/sites                                         ← • siteA  • siteB

/use siteA
เขียนบทความวิธีชงกาแฟดริป ใส่รูป ตั้ง draft     ← เขียนลง siteA (มือ=ปลั๊กอิน siteA)
/publish 45                                    ← เผยแพร่ที่ siteA

/report siteB                                  ← ดูภาพรวม siteB (ไม่ยุ่งกับ siteA)
/action siteB clear_cache                      ← สั่งปลั๊กอินเดิมของ siteB เคลียร์แคช
```

📖 คำสั่งทั้งหมด [USAGE.md](./USAGE.md) · ติดตั้งตั้งแต่ศูนย์ [INSTALL.md](./INSTALL.md) · ออกแบบระบบ [ARCHITECTURE.md](../ARCHITECTURE.md)
