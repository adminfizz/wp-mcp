// gemini.js — สร้างรูปจากเนื้อหาบทความ (ใช้ GEMINI_API_KEY เดิมจาก slip-bot ได้)
// ใช้ @google/genai (SDK ใหม่) ที่รองรับโมเดลสร้างภาพ gemini-2.5-flash-image โดยตรง
import { GoogleGenAI } from "@google/genai";

const MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

// สร้าง client แบบ lazy — ตอนใช้จริง (กัน warning ตอน import ถ้ายังไม่ตั้ง key)
let _ai = null;
function client() {
  if (!_ai) _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return _ai;
}

/**
 * สร้างรูปจาก prompt ภาษาไทย/อังกฤษ
 * @param {string} prompt คำอธิบายรูปที่อยากได้ (อิงจากเนื้อหาบทความ)
 * @returns {Promise<{base64:string, mime:string}>}
 *
 * หมายเหตุ: gemini-2.5-flash-image คืนภาพเป็น inlineData โดยตรง (ไม่ต้องตั้ง responseModalities)
 * ถ้าใช้โมเดล preview รุ่นเก่า (เช่น gemini-2.0-flash-preview-image-generation)
 * อาจต้องเพิ่ม config: { responseModalities: ["IMAGE"] } ในการเรียก
 */
export async function generateImage(prompt) {
  if (!process.env.GEMINI_API_KEY) throw new Error("ยังไม่ได้ตั้ง GEMINI_API_KEY");

  const response = await client().models.generateContent({
    model: MODEL,
    contents: `สร้างภาพประกอบบทความคุณภาพสูง สวยงาม เหมาะใช้เป็นภาพปก (featured image): ${prompt}`,
  });

  const parts = response?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) {
    if (p.inlineData?.data) {
      return { base64: p.inlineData.data, mime: p.inlineData.mimeType || "image/png" };
    }
  }
  throw new Error("Gemini ไม่ได้คืนรูป (ตรวจชื่อโมเดล GEMINI_IMAGE_MODEL ว่ารองรับการสร้างภาพ)");
}
