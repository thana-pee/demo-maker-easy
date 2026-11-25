# Demo Maker Easy

สตูดิโอแต่งเพลงและทำเดโม 3D บนเว็บแบบครบวงจร สำหรับนักแต่งเพลงไทยและสากล (Next.js 16 + Web Audio + `smplr` Soundfont + Gemini / Lyria AI)

---

## 1. ภาพรวมและความสามารถหลัก (Overview & Core Features)

- **3-Tab Studio Workflow (`Songwriter` / `Arranger` / `Stage`) + Zen Mode:**
  - **Songwriter:** จัดโครงท่อนเพลง (สูงสุด 9 ท่อน × 8 ห้อง/ท่อน), คอร์ด + Slash Chords (`/Bass`) + Transpose/Capo, แต่งเนื้อร้องพร้อม HUD นับพยางค์/วิ, ตรวจสัมผัสไทยเรียลไทม์, Sheet Editor และปุ่มลัด 0-Credit
  - **Arranger:** ปรับ Playing Style แยกตามท่อน, Band Arrangement ตามแนวเพลง (รวมลูกทุ่ง/สามช่า/ไทยร็อก/R&B), Mini Piano Roll (16-step / 12-step), Auto-Guide Melody และ 7-Track 3D Soundstage Mixer + Solo/Mute + Drive/Fuzz
  - **Stage (Karaoke Teleprompter):** จอแสดงเนื้อร้อง คอร์ด Capo ตัวใหญ่ จุดแบ่งลมหายใจกลางห้อง (`·`) และ Auto-scroll สำหรับซ้อม/อัดเสียง
- **3D Web Audio Engine & 1:1 Offline MP3 192 kbps:**
  - ใช้ DSP ชุดเดียวกัน (`src/lib/audioDspShared.ts`) ทั้งการเล่นสด (`audioEngine.ts`) และเรนเดอร์ออฟไลน์ (`mp3Exporter.ts`) รองรับ `smplr` Soundfont (แคชใน `CacheStorage`) พร้อม Oscillator Fallback เมื่อออฟไลน์ และ Studio Loudness Gain Staging (Glue Compressor + Limiter)
- **Thai Songwriting Engine เชิงลึก:**
  - กลุ่มสัมผัสไทย 34 ตระกูล, วิเคราะห์คำเป็น/คำตาย, มาตราตัวสะกด 9 แม่, วรรณยุกต์ 5 เสียง, 22 สไตล์นักแต่งเพลงไทย, 7 แนวเพลง, 4 ภาษาถิ่น, ฟิสิกส์งบพยางค์ร้องหายใจทัน 6 กลุ่ม (Phase 9–10), ระบบ **Story Blueprint & Anchor Lines**, และ AABB/ABAB + ไม้ยมก (`ๆ`) parity
- **AI Studio & Vocal Booth:**
  - **Easy Mode Architect:** สร้างเพลงทั้งเพลงจากไอเดีย/เรื่องเล่า หรือโครงท่อน+คอร์ดที่กำหนดเอง (4 / 6 / 8 Cr, และ Pro Mode `gemini-4-argon` 10 Cr)
  - **AI Lyrics / Cohesive Polish / Continue Story / Director / Hum-to-Song:** แต่ง/เกลาต่อท่อน รักษา Section Lock และ Slash Chords
  - **Vocal Recording Booth (0 Cr, Local) & AI Vocal Guide (`gemini-3.8-flash-tts`):** อัดเสียงร้องหลายเทคพร้อม Pre-Roll, Auto-Ducking (-2 dB), WSOLA Pitch-Preserving Time-Fit และ Phrase-to-Bar Beat-1 Alignment
- **Export & Share:**
  - `.MP3` (192 kbps 3D Mix / Instrumental Karaoke), `.MID` (SMF Multi-Track), `.LRC`, `_lyrics.txt`, `.JSON` Backup, LINE Share URL (`?song=`), Suno AI Prompt และ AI Reference Track (`lyria-3.5`)
- **Cloud Sync, Commercial Wallet & Admin Consoles:**
  - Google OAuth + Email OTP, Supabase Cloud Sync (Tombstone Delete + Non-Destructive Conflict Snapshots), Server Credit Wallet (แยก `trial_credits` / `purchased_credits` + Auto-Refund), PromptPay EMVCo QR + Auto-Slip Verification (`trans_ref` unique), Admin Analytics (`/admin/analytics`) และ Admin Top-Up Console (`/admin/topup`)
- **PWA, Bilingual & Themes:** ติดตั้งใช้งานแบบ PWA ได้, รองรับภาษาไทย/อังกฤษ (`TH`/`EN`) และธีมสว่าง/มืด (Light/Dark)

---

## 2. Tech Stack

- **Framework:** Next.js `16.4.6` (Turbopack) + React `19.3.0` + TypeScript `5`
- **Styling:** Tailwind CSS `4.3.3` + `lucide-react`
- **AI SDK:** `@google/genai` `3.3.0` (Interactions API `v1beta` + JSON Schema)
- **Audio & Export:** Web Audio API, `smplr` `1.2.0`, `@breezystack/lamejs` `1.2.7`, `qrcode` `1.5.4`
- **Backend / Auth / DB:** Next.js App Router API Routes + Supabase (Postgres + Auth + RLS + RPC)

---

## 3. Quick Start & Scripts

```bash
# 1. ติดตั้ง Dependencies
npm install

# 2. สร้างไฟล์ Environment จาก Template
cp .env.example .env.local   # (Windows PowerShell: Copy-Item .env.example .env.local)

# 3. รันโหมดพัฒนา
npm run dev
```

เปิดใช้งานที่ [http://localhost:3000](http://localhost:3000)

### คำสั่งตรวจสอบหลัก (Scripts)

| คำสั่ง | หน้าที่ |
|---|---|
| `npm run dev` | เปิด Next.js Dev Server |
| `npm run build` | Build สำหรับ Production (`next build`) |
| `npm run lint` | ตรวจ ESLint ทั้งโปรเจกต์ |
| `npm test` | รันชุดเทสต์ Offline ทั้งหมด (`npx tsx --test tests/*.test.ts`) |
| `npm run check:prod` | ตรวจความพร้อม Environment & PromptPay QR ใน `.env.local` (ไม่พิมพ์ค่า Secret) |
| `npm run check:prod -- --live` | ตรวจการเชื่อมต่อ Supabase Auth (Google/Email), ตารางและ RPC จริง |

---

## 4. Environment Variables & Supabase Setup

อ้างอิงรายการตัวแปรทั้งหมดได้จาก `.env.example` (ห้าม commit `.env.local` หรือค่า Secret ใดๆ):

| โหมด | ตัวแปรที่ต้องตั้งค่า | หมายเหตุ |
|---|---|---|
| **Standalone (ทดลอง/พัฒนาในเครื่อง)** | `NEXT_PUBLIC_BILLING_MODE=standalone` | ใช้ Credit Wallet ใน `localStorage` ได้ทันที; ถ้าไม่มี `GEMINI_API_KEY` ระบบจะทำงานใน Simulated Mode อัตโนมัติ (ไม่เสียค่า API) |
| **AI Features (Live Gemini / Lyria)** | `GEMINI_API_KEY`, `GEMINI_MODEL` | ใช้ฝั่ง Server เท่านั้น |
| **Cloud Sync & Google Login** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | เปิด Google/Email Auth ใน Supabase Dashboard |
| **Production Billing & PromptPay** | `NEXT_PUBLIC_BILLING_MODE=production`, `SUPABASE_SERVICE_ROLE_KEY`, `PROMPTPAY_RECEIVER_ID`, `PROMPTPAY_RECEIVER_NAME`, `SLIP_VERIFY_API_URL`, `SLIP_VERIFY_API_KEY` | บังคับล็อกอิน Google, หัก/คืนเครดิตแบบ Atomic ฝั่ง Server และตรวจสลิปธนาคาร |
| **Admin Consoles (ไม่บังคับ)** | `ANALYTICS_ADMIN_KEY`, `ANALYTICS_ADMIN_EMAILS` | คุมสิทธิ์เข้า `/admin/analytics` และ `/admin/topup` |

### การตั้งค่าฐานข้อมูล Supabase (Single-Paste Setup)

1. เปิด **Supabase Dashboard → SQL Editor**
2. คัดลอกคำสั่งทั้งหมดจาก `supabase/ALL_IN_ONE_SETUP.sql` แล้วกด **Run** (ไฟล์เป็นแบบ Idempotent รันซ้ำได้อย่างปลอดภัย ครอบคลุมตาราง `songs`, `user_wallets`, `credit_transactions`, `topup_orders`, `app_usage_events`, RLS Policies และ Atomic RPCs)
3. รัน `npm run check:prod -- --live` เพื่อยืนยันตาราง, RPC และ Google OAuth Provider

---

## 5. โครงสร้างโปรเจกต์และเอกสารแผน (Repository Map)

```text
src/
  app/
    page.tsx                  # หน้าสตูดิโอหลัก
    admin/{analytics,topup}/  # หน้าคอนโซลแอดมิน
    api/advance/*/            # AI Endpoints (architect, lyrics, cohesive-polish, director, hum-to-song, reference-track, tts-cue)
    api/billing/*/            # Wallet, PromptPay Order, Slip Verification
    api/analytics/, api/health/
  components/                 # UI Components & Modals
  hooks/useAudioEngine.ts     # React hook คุม AudioEngine
  lib/                        # Core DSP, Thai phonology/rhyme, AI prompts, Gemini client, Billing, Cloud sync, Storage
  types/song.ts               # Master TypeScript schema
tests/                        # ชุด Unit & Integration Tests (Offline / Mocked)
supabase/                     # ALL_IN_ONE_SETUP.sql และ migrations รายเฟส
scripts/                      # check-production-readiness.ts
tutorials/                    # วิดีโอ Tutorial (ไฟล์ .mp4 ถูก ignore ใน Git; เก็บ CHAPTERS_YOUTUBE.txt)
```

- **ประวัติการพัฒนาและแผนงาน:** ดูรายละเอียดแต่ละเฟสได้ใน `PROGRESS_LOG.md` รวมถึงไฟล์ Spec/Plan Archive ที่ root (`IMPLEMENTATION_PLAN.md`, `UPGRADE_PLAN_V3.md`, `STUDIO_EVOLUTION_PLAN_V4*.md`, `PHASE_7*.md`, `PHASE_8_MASTER_PLAN.md`, `PHASE_9_MASTER_PLAN.md`)

---

## 6. ข้อจำกัดที่ทราบ & แนวทางอัปเกรดในอนาคต (Known Limitations & Upgrade Notes)

1. **ไฟล์เสียงร้องเก็บเฉพาะในเครื่อง (IndexedDB):** `bar.vocalAudio` และ `vocalTakes` เก็บใน IndexedDB ของเบราว์เซอร์เครื่องนั้นๆ (Cloud Sync ซิงค์เฉพาะโครงเพลง/คอร์ด/เนื้อ/เมโลดี้ และลิงก์แชร์ `?song=` ตัดเสียงร้องออก) — หากต้องการย้ายเพลงพร้อมเสียงร้องข้ามเครื่อง ให้ใช้ **Export / Import `.JSON`** (ในอนาคตสามารถต่อยอดอัปโหลดขึ้น Supabase Storage ได้)
2. **AI Vocal Guide ใช้ TTS + WSOLA:** เสียงไกด์จาก `gemini-3.8-flash-tts` ถูกจัดจังหวะให้ลง Beat 1 ด้วย DSP เพื่อเป็นไกด์จังหวะและอารมณ์ร้อง ไม่ใช่ Singing Synthesizer ที่ร้องตรงโน้ต 100% (ถ้าต้องการเพลงเต็มพร้อมเสียงร้อง+ดนตรี แนะนำ Export Prompt ไปต่อใน Suno หรือใช้ `lyria-3.5`)
3. **คุณภาพเสียงดนตรีระดับ Soundfont / Web Audio:** เหมาะกับการทำเดโมและแต่งเพลงอย่างรวดเร็ว แต่ยังไม่ละเอียดเท่าระบบ DAW/VST เต็มรูปแบบ
4. **Serverless Timeout & การอัปเดตรุ่นโมเดล AI:** API Routes กำหนด `maxDuration = 60` วินาที (สำหรับ Vercel) และอ้างอิง Model IDs ใน `src/lib/geminiClient.ts` ซึ่งอาจต้องอัปเดตเมื่อ Google AI Studio เปลี่ยนรุ่นโมเดลในอนาคต
5. **Refactor Candidates (เมื่อกลับมาพัฒนาต่อ):** ไฟล์ `src/lib/aiPrompts.ts`, `src/components/SectionBuilder.tsx`, `src/components/AdvanceModeModal.tsx`, `src/components/EasyModeStarterModal.tsx` และ `src/lib/songArchitect.ts` มีขนาดใหญ่ ควรทยอยแยกเป็นโมดูลย่อยเมื่อเริ่มฟีเจอร์ใหญ่รอบถัดไป
