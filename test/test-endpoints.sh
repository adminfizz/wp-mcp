#!/usr/bin/env bash
# ทดสอบ Kim MCP Bridge กับ WordPress 1 โดเมน
# วิธีใช้:
#   SITE="https://example.com" KEY="your-secret-key" bash test-endpoints.sh
# หรือแก้ค่า default ด้านล่าง

set -u
SITE="${SITE:-https://example.com}"
KEY="${KEY:-CHANGE_ME}"
H_KEY="X-Kim-Key: ${KEY}"
BASE="${SITE%/}/wp-json/kim/v1"

echo "=== 1) health ==="
curl -s -H "$H_KEY" "$BASE/health" | python -m json.tool 2>/dev/null || curl -s -H "$H_KEY" "$BASE/health"
echo

echo "=== 2) report ==="
curl -s -H "$H_KEY" "$BASE/report"
echo

echo "=== 3) สร้างโพสต์ draft พร้อม SEO + รูป featured (จาก URL) ==="
curl -s -X POST "$BASE/posts" \
  -H "$H_KEY" -H "Content-Type: application/json" \
  -d '{
    "type": "post",
    "status": "draft",
    "title": "ทดสอบจาก Kim MCP",
    "content": "<h2>หัวข้อทดสอบ</h2><p>นี่คือบทความที่สร้างผ่าน REST API ของ Kim MCP Bridge เพื่อตรวจสอบการทำงานปลายทาง</p>",
    "excerpt": "บทความทดสอบระบบ Kim MCP",
    "slug": "kim-mcp-test",
    "categories": ["ทดสอบระบบ"],
    "tags": ["kim-mcp", "test"],
    "seo": {
      "title": "ทดสอบ Kim MCP | ชื่อ SEO",
      "description": "คำอธิบาย meta สำหรับทดสอบความถูกต้องของ SEO ผ่าน Kim MCP Bridge",
      "focus_keyword": "kim mcp"
    },
    "featured_image": {
      "url": "https://placehold.co/1200x630/png",
      "alt": "ภาพปกทดสอบ Kim MCP",
      "filename": "kim-cover.png"
    }
  }'
echo

echo "=== 4) list posts ==="
curl -s -H "$H_KEY" "$BASE/posts?per_page=5"
echo

echo "เสร็จแล้ว — ตรวจว่า health ตอบ ok:true และข้อ 3 คืน id + featured_image_url"
