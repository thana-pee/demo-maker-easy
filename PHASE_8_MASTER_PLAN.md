# 🎼 PHASE 8 MASTER PLAN (`STUDIO_EVOLUTION_PLAN_V5_TH`) — Live Model Routing, Bulletproof Credit & Save/Sync Engine, and Studio UX Overhaul

> **รหัสแผนงาน:** `PHASE_8_MASTER_PLAN` (`STUDIO_EVOLUTION_PLAN_V5_TH`)  
> **วันที่จัดทำ:** 2026-11-18  
> **สถานะตั้งต้น:** สร้างต่อจาก **[Phase 7G / Sprint E] PASS** (`186/186` Unit & Integration Tests ผ่าน, `eslint` 0 warnings, `next build` ผ่าน)  
> **ข้อมูลอ้างอิงจริง:** ผลสำรวจแค็ตตาล็อกโมเดลสดจาก `GET https://generativelanguage.googleapis.com/v1beta/models` ของโปรเจกต์ **`Demo-Maker-Easy` (Tier 1)** จำนวน 64 โมเดล ณ วันที่ 18 พ.ย. 2026  
> **ไฟล์แผนก่อนหน้า (คงไว้ไม่ทับ):** `IMPLEMENTATION_PLAN.md`, `UPGRADE_PLAN_V3.md`, `STUDIO_EVOLUTION_PLAN_V4.md`, `STUDIO_EVOLUTION_PLAN_V4_TH.md`, `PHASE_7_MASTER_PLAN.md`, `PHASE_7E_SPRINT_A5_PLAN.md`  
> **เป้าหมายหลัก:** อัปเกรดระบบทั้งหมดให้ใช้งานจริงได้อย่างสมบูรณ์แบบโดยไม่ต้องคุมงานทีละจุด ครอบคลุม 5 แกนหลัก:  
> **1. Google AI Studio Model Tiering & `v1beta` Parity** (`gemini-4-hydrogen`, `gemini-4-argon` Pro Mode 10 Cr, `gemini-4-carbon`, `gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-3.8-flash-tts`, `gemini-3.5-transcribe`, `lyria-3.5`) →  
> **2. Bulletproof Wallet Refund & Outer `try/catch` Guards** (คืนเครดิตถูกกระเป๋า `trial` vs `purchased` ทุก Route) →  
> **3. Prompt & Musical Coherence Fixes** (16-step `hum-to-song`, ล็อกท่อน & Slash Chord ใน `cohesive-polish`, จับคู่ `sectionId` ใน `architect`) →  
> **4. Studio Save Engine & Resilient Cloud Sync** (สถานะ Save จริง, ปุ่ม Manual Save `Ctrl+S`, Save Checkpoint + Auto-Checkpoint ก่อน AI, แก้ Phantom Auto-Save, Tombstone Delete ไม่ฟื้นคืนชีพ, Conflict Snapshot, 401 Refresh, IDB Vocal Duplicate) →  
> **5. User-Centric UX/UI Overhaul** (ลดความรกบน Bar Card ด้วย Active Bar Focus, Smart Coalesced Undo/Redo, Chord Audition, Non-Destructive Presets, Metronome/Tap Tempo/Count-In LED จริง, Dark Mode & iPad Touch Fix)

---

## 📊 ตารางติดตามสถานะแต่ละเฟส (Phase Status Tracker)

| เฟส | สถานะ | ชื่อเฟส | ไฟล์เป้าหมายหลัก | สรุปสิ่งที่จะได้ |
|---|---|---|---|---|
| **Phase 8A** | ✅ DONE | **Multi-Model Tiering, `v1beta` Parity, Pro Argon Mode & Bulletproof Wallet Refund** | `src/lib/geminiClient.ts`, `src/lib/serverWallet.ts`, `src/lib/creditManager.ts`, `src/app/api/advance/*/route.ts`, `src/components/EasyModeStarterModal.tsx`, `src/components/CohesivePolishModal.tsx`, `src/components/AdvanceModeModal.tsx` | จัดสรรโมเดลตามสเปกจริง `/v1beta/models`, ขยาย `maxOutputTokens` กัน JSON ขาดใน Gemini 4, เพิ่ม `fallbackModels` อัตโนมัติ, ใส่ `apiVersion: 'v1beta'` + `runWithAbortTimeout` ครบทุกฟังก์ชัน, บังคับ `gemini-3.8-flash-tts` สำหรับภาษาไทยทุกจุด, เปิดสวิตช์ **`gemini-4-argon` Pro Mode (10 เครดิต)** ใน Easy Mode & Cohesive Polish และแก้ระบบคืนเครดิตให้คืนถูกกระเป๋า (`trial` vs `purchased`) พร้อม `try/catch` ชั้นนอกครบ 7 Routes |
| **Phase 8B** | ✅ DONE | **Prompt Engineering, 16-Step Hum-to-Song & Cohesive Polish Fixes** | `src/lib/aiPrompts.ts`, `src/lib/songArchitect.ts`, `src/app/api/advance/hum-to-song/route.ts`, `src/app/api/advance/cohesive-polish/route.ts`, `src/app/api/advance/architect/route.ts`, `src/components/CohesivePolishModal.tsx` | แก้สเกลโน้ต `hum-to-song` (`0-7` → `0-15` ใน 4/4, `0-11` ใน 3/4 & 6/8) + Schema `playStyle`/`producerNotes`, เคลียร์คำสั่งขัดกันเรื่อง `melodyNotes` ใน Architect, จับคู่เกลาสัมผัสด้วย `sectionId` แทน `sec.name`, แก้ `cohesive-polish` ให้เคารพ `lockedSectionIds` 100% + รักษา Slash Chords (`/Bass`) + ตัดเสียง Base64 ก่อนส่ง API, อัปเดต Enum Phase 7C ใน Director Prompt |
| **Phase 8C** | ✅ DONE | **Studio Save Engine (Auto + Manual Save `Ctrl+S` + Checkpoints) & IDB Audio Fix** | `src/lib/storage.ts`, `src/lib/audioStorageIdb.ts`, `src/app/page.tsx`, `src/components/TransportBar.tsx`, `src/components/SongLibraryModal.tsx`, `src/lib/i18n.ts` | เปลี่ยนป้าย `Auto-saved` คงที่เป็นสถานะจริง (`dirty` / `saving` / `saved` / `error`), เพิ่มปุ่ม **Manual Save (`Ctrl/Cmd+S`)** + **Save Checkpoint (`Ctrl/Cmd+Shift+S`)**, สร้าง **Auto-Checkpoint** ก่อน AI/Preset เขียนทับเพลง, แก้ Phantom Auto-Save ตอนเปิดเว็บ, อัปเดต `updatedAt` ใน React State จริง, Flush ก่อนปิดแท็บ/สลับเพลง, เขียน IDB เฉพาะไฟล์เสียงที่เปลี่ยน, แก้ `duplicateSongWithVocals` ให้คัดลอกเสียงร้องใน IDB ครบ และกันลิงก์แชร์ `?song=` ทับเพลงเดิม |
| **Phase 8D** | ✅ DONE | **Resilient Cloud Sync, Tombstone Delete & Multi-Device Conflict Guard** | `src/lib/cloudSync.ts`, `src/lib/storage.ts`, `src/components/AccountSyncModal.tsx`, `src/app/page.tsx` | เพิ่ม `DELETED_SONGS_TOMBSTONE_KEY` + ยิง `DELETE /rest/v1/songs` เพื่อไม่ให้เพลงที่ลบแล้วคืนชีพ, เก็บเวอร์ชันที่ชนกันระหว่างเครื่องเข้า `snapshots` (Non-Destructive Conflict Snapshot), เพิ่ม `fetchSupabaseWithRefresh` ต่ออายุ JWT อัตโนมัติเมื่อเจอ HTTP 401, Sanitize ข้อมูลทุกเพลงที่ดึงจาก Cloud, เปิดการทำงานของ `autoSyncEnabled` จริง, แยกข้อมูลปลอดภัยเมื่อ Sign Out และแสดงสถานะ Vocal Assets ข้ามอุปกรณ์อย่างซื่อสัตย์ |
| **Phase 8E** | ✅ DONE | **User-Centric UX/UI Overhaul, Smart Undo/Redo, Chord Audition & Dark/Touch Polish** | `src/components/SectionBuilder.tsx`, `src/components/TransportBar.tsx`, `src/components/ChordPickerModal.tsx`, `src/components/SoundCustomizerPanel.tsx`, `src/components/MiniPianoRollModal.tsx`, `src/components/AdvanceModeModal.tsx`, `src/components/VocalRecorderModal.tsx`, `src/lib/audioEngine.ts`, `src/hooks/useAudioEngine.ts`, `src/app/page.tsx` | Progressive Bar Card Disclosure (`activeBarId` + ปุ่มกางเครื่องมือครบทุกห้อง), ดึงเครื่องมือฟรี (พจนานุกรมสัมผัส / วางเนื้อแบ่งห้อง) ออกมานอกเมนู AI, Coalesced Undo/Redo (`< 1200ms`) + รองรับ `vocalTakes`, `previewChord` ดีดคอร์ดตัวอย่างใน `ChordPickerModal`, Non-Destructive `handleApplyPreset` คงเนื้อ/เสียงร้อง/เมโลดี้, `AdvanceModeModal` AI ร้องไม่แอบเซฟก่อนกดยืนยัน, `EasyModeStarterModal` เลือก "สร้างเป็นเพลงใหม่" เป็นค่าเริ่มต้น, สถานะโหลด Soundfont + ไฟ `COUNT` จริง, Metronome Click + Tap Tempo + คลิกห้องเล่น (`seekToBar`), Play/Stop ใน `SoundCustomizerPanel`, ปุ่ม `-`/`+` Touch-Friendly ใน `MiniPianoRollModal`, และ Dark Mode ครบทุก Modal |

---

## 🔍 0. ข้อมูลสเปกจริงจาก Google AI Studio (`GET /v1beta/models`) & ตาราง Routing

### 0.1 ข้อมูลสเปกโมเดลจริงที่ตรวจสอบจาก API Key ของโปรเจกต์ `Demo-Maker-Easy` (Tier 1)

| หมวดหมู่ | Model ID จริง (`name`) | Display Name / Version | Input Limit | Output Limit จริง | Methods ที่รองรับ | ประเด็นที่ต้องปรับในโค้ดจากสเปกจริง |
|---|---|---|---|---|---|---|
| **Gemini 4 Main** | `gemini-4-hydrogen` | `Gemini 4 Hydrogen` (`3.0`) | `1,048,576` | **`65,536`** | `generateContent`, `countTokens`, `batchGenerateContent` | เดิม `geminiClient.ts:203` จำกัด `4096` (และ `cohesive-polish` แค่ `3072`) ต้องขยายเป็น `8192`–`12288` เพราะรวม `thought_tokens` ในโควตา Output |
| **Gemini 4 Pro** | `gemini-4-argon` | `Gemini 4 Argon` (`3.0`) | `1,048,576` | **`32,768`** | `generateContent`, `countTokens`, `batchGenerateContent` | เดิมประกาศ `GEMINI_MODEL_PRO` และ `aiProArgonArranger: 10` ไว้แต่ไม่ผูกปุ่ม — เปิดใช้เป็น **Pro Mode (10 Cr)** สำหรับ Paid Credits |
| **Gemini 4 Max** | `gemini-4-carbon` | `Gemini 4 Carbon` (`3.0`) | `1,048,576` | **`32,768`** | `generateContent`, `countTokens`, `batchGenerateContent` | เพิ่มค่าคงที่ `GEMINI_MODEL_CARBON` ไว้รองรับใน `geminiClient.ts` |
| **Gemini 3.8 Balanced** | `gemini-3.8-flash` | `Gemini 3.8 Flash` (`3.0`) | `1,048,576` | **`65,536`** | `generateContent`, `countTokens`, `createCachedContent`, `batchGenerateContent` | ใช้เป็น Hot Fallback เมื่อ `gemini-4-hydrogen` ติด `429` หรือ Timeout; หมายเหตุ: **`minimal` thinking คืน Error** (ต้องใช้ `low`/`medium`/`high`) |
| **Gemini 3.5 / 3.1 Lite** | `gemini-3.5-flash-lite`<br>`gemini-3.1-flash-lite` | `Gemini 3.5 Flash Lite` (`07-2026`)<br>`Gemini 3.1 Flash Lite` (`05-2026`) | `1,048,576` | **`65,536`** | `generateContent`, `countTokens`, `createCachedContent`, `batchGenerateContent` | เพิ่มงบ Architect Polish จาก `1024` เป็น `2048` (`thinkingLevel: 'low'`) และใช้ `3.1-flash-lite` เป็น Fallback ของ Lite |
| **Speech-to-Text** | `gemini-3.5-transcribe` | `Gemini 3.5 Transcribe` (`08-2026`) | `98,304` | `32,768` | `generateContent`, `countTokens` | เติม `apiVersion: 'v1beta'`, ลด timeout เหลือ `12_000` ms เพื่อไม่ให้รวมกับ main pass เกิน 60s, เพิ่ม `:generateContent` fallback |
| **Text-to-Speech** | `gemini-3.8-flash-tts`<br>`gemini-3.8-flash-lite-tts` | `Gemini 3.8 Flash TTS`<br>`Gemini 3.8 Flash Lite TTS` | `8,192` | `16,384` | `generateContent`, `countTokens`, `batchGenerateContent` | `flash-tts` รองรับ 130 ภาษา (**รองรับไทย**); `flash-lite-tts` รองรับ 101 ภาษา (**ไม่รองรับไทย**) — ต้องบังคับใช้ `flash-tts` สำหรับภาษาไทย/โหมดร้องทุกจุด + ใส่ Timeout `35_000` ms |
| **Music Generation** | `lyria-3.5` | `Lyria 3.5` (`3.5`) | `1,048,576` | `65,536` | `generateContent`, `countTokens` | เติม `apiVersion: 'v1beta'` + `runWithAbortTimeout(50_000)` + `:generateContent` fallback + outer `try/catch` refund `toPurchased: true` |

### 0.2 ตารางจับคู่โมเดลตามภารกิจ (Task-to-Model Routing Matrix)

| ลำดับ | ฟีเจอร์ / API Route | Primary Model | Auto-Fallback Chain (เมื่อ 429 / 503 / Timeout) | Config (`thinkingLevel`, `maxOutputTokens`, `timeoutMs`) |
|---|---|---|---|---|
| 1 | `POST /api/advance/architect` (รอบหลัก) | `gemini-4-hydrogen` (หรือ `gemini-4-argon` เมื่อเลือก Pro Mode 10 Cr) | `['gemini-3.8-flash', 'gemini-3.5-flash-lite']` (Pro Mode: `['gemini-4-hydrogen', 'gemini-3.8-flash']`) | `low` (Argon: `medium`), `8192` (`>5` ท่อน: `12288`; Argon: `32768`), `32_000`–`42_000` ms |
| 2 | `POST /api/advance/architect` (รอบ 2 Rhyme Polish) | `gemini-3.5-flash-lite` | ข้ามอย่างปลอดภัย (ใช้ผลรอบหลัก) | `low`, `2048`, `min(10_000, remainingBudgetMs)` |
| 3 | `POST /api/advance/lyrics` (`singleBarIndex` / `quick`) | `gemini-3.5-flash-lite` | `['gemini-3.1-flash-lite']` | Single-Bar: `minimal`, `1024`, `15_000` ms; Quick: `low`, `2048`, `22_000` ms |
| 4 | `POST /api/advance/lyrics` (`deep`) | `gemini-4-hydrogen` | `['gemini-3.8-flash', 'gemini-3.5-flash-lite']` | `low`, `6144`, `32_000` ms |
| 5 | `POST /api/advance/cohesive-polish` | `<=3` ท่อน: `gemini-3.5-flash-lite`<br>`>3` ท่อน: `gemini-4-hydrogen`<br>Pro Mode (10 Cr): `gemini-4-argon` | `<=3`: `['gemini-3.8-flash']`<br>`>3`: `['gemini-3.8-flash', 'gemini-3.5-flash-lite']`<br>Pro: `['gemini-4-hydrogen', 'gemini-3.8-flash']` | `<=3`: `low`, `4096`, `20_000` ms<br>`>3`: `low`, `8192`, `36_000` ms<br>Pro: `medium`, `32768`, `46_000` ms |
| 6 | `POST /api/advance/director` | `gemini-3.5-flash-lite` | `['gemini-3.8-flash']` | `low`, `2048`, `20_000` ms |
| 7 | `POST /api/advance/hum-to-song` | `gemini-4-hydrogen` (+ opt `gemini-3.5-transcribe`) | `['gemini-3.8-flash', 'gemini-3.5-flash-lite']` | Transcribe: `v1beta`, `12_000` ms; Main: `low`, `8192`, `38_000` ms |
| 8 | `POST /api/advance/tts-cue` | **`gemini-3.8-flash-tts`** (บังคับทุกคำขอ `th` / มีตัวอักษรไทย / `singing-demo`) | เฉพาะ `en` guide fallback `gemini-3.8-flash-lite-tts`; `th` คืนเครดิต + Browser Speech | `v1beta`, `timeoutMs: 35_000`, `speech_config: [{ voice }]` |
| 9 | `POST /api/advance/reference-track` | `lyria-3.5` (Paid Credits Only · 8 Cr) | ไม่มี (คืน `purchased_credits` 100%) | `v1beta`, `timeoutMs: 50_000` |

---

## 🛡️ กฎเหล็ก (Invariants) & เกณฑ์ตรวจรับบังคับทุกเฟส (Mandatory Verification Protocol)

1. **รักษาชุดเทสต์เก่าทั้งหมด (`Phase 1A – Phase 7G`, รวม `186/186` ข้อ) ให้ผ่าน 100% (0 Failed, 0 Skipped):**
   - **ห้ามเปลี่ยน** ค่าคงที่ `GEMINI_MODEL_LITE = 'gemini-3.5-flash-lite'`, `GEMINI_MODEL_MAIN = 'gemini-4-hydrogen'`, `GEMINI_MODEL_PRO = 'gemini-4-argon'`, `GEMINI_MODEL_MUSIC = 'lyria-3.5'`, `DEFAULT_GEMINI_MODEL = 'gemini-4-hydrogen'` ใน `src/lib/geminiClient.ts` (รักษา `tests/phase5a.test.ts`).
   - **ห้ามเปลี่ยน** `getSyllableBudgetForBpm(74, '4/4')` ให้หลุดจากข้อความ `'5-8 พยางค์'` (`tests/phase5a.test.ts`), และคงเกณฑ์ `<= 6` พยางค์สำหรับ `108 BPM asanee-chotikul` และ `68 BPM dee-nitipong` เมื่อส่ง `sectionType` (`tests/sprintc.test.ts`).
   - **ห้ามเปลี่ยน** `validateThaiLyricCouplets()` ให้ตั้ง `passed = false` เพียงเพราะ `duplicateEndWords` (`tests/phase5b.test.ts`).
   - **ห้ามเปลี่ยน** 9 สไตล์ดั้งเดิมใน `src/lib/barPlanner.ts` — ต้อง Pure & Deterministic ด้วย `ctx.rng()` (`tests/phase7c.test.ts`).
   - **ห้ามใส่** `minimum`/`maximum` หรือ nested `minItems`/`maxItems` กลับเข้าไปใน Gemini Schemas (`tests/phase7e.test.ts`).
2. **Gemini API Cost Guard Rule:**
   - การแก้ไขโค้ด, การรัน `npm test`, `eslint`, `npm run build` ต้องทำงานแบบ Offline/Mock 100% (`$0.00` — ห้ามยิง `GEMINI_API_KEY` ออกนอกเครื่องโดยไม่ได้รับอนุมัติจากผู้ใช้ล่วงหน้า).
   - ห้ามอ่าน พิมพ์ หรือ Log ค่าดิบของ `GEMINI_API_KEY` ในโค้ด เทสต์ หรือผลลัพธ์ใดๆ.
3. **เกณฑ์ตรวจรับก่อนจบงาน (Verification Gate) — ต้องรันผ่านครบทุกข้อหลังแก้ไฟล์สุดท้าย:**
   1. `npm test` (`npx tsx --test tests/*.test.ts`) → **100% Pass (0 failed, 0 skipped)**
   2. `npx eslint . --max-warnings=0` → **0 errors, 0 warnings**
   3. `npm run build` → **Next.js 16.4.6 (Turbopack) + TypeScript exit code 0**
   4. อัปเดตสถานะตารางใน `PHASE_8_MASTER_PLAN.md` จาก `⏳ TODO` → `✅ DONE` และเพิ่มหัวข้อ `### [Phase 8A..8E]` ลงใน `PROGRESS_LOG.md`

---

## ⚙️ Phase 8A: Multi-Model Tiering, `v1beta` Parity, Pro Argon Mode & Bulletproof Wallet Refund

### เป้าหมาย
1. ทำให้ `geminiClient.ts` รองรับ Fallback Chain ข้ามโมเดล, มี Timeout + `apiVersion: 'v1beta'` ครบทุก Endpoint, และรองรับโมเดล Pro (`gemini-4-argon`) + `gemini-4-carbon` / `gemini-3.8-flash` / `gemini-3.1-flash-lite` อย่างถูกต้องตามสเปก `/v1beta/models`
2. บังคับใช้ `gemini-3.8-flash-tts` สำหรับคำร้อง/เสียงไกด์ภาษาไทยทุกจุด (แก้บั๊ก `AdvanceModeModal.tsx` และ `tts-cue/route.ts` ที่หลุดไปเรียก `lite-tts`)
3. ปิดช่องโหว่เครดิตรั่วไหล 100%: ใส่ outer `try/catch` ครบทั้ง 7 Routes และคืนเครดิตเข้ากระเป๋าเดิม (`trial_credits` vs `purchased_credits`) ตามยอดที่หักจริง
4. เปิดใช้งาน **`gemini-4-argon` Pro Mode (10 เครดิต — Paid Credits Only)** ในทั้ง **Easy Mode (`EasyModeStarterModal.tsx`)** และ **Cohesive Polish (`CohesivePolishModal.tsx`)**

### ไฟล์ที่เกี่ยวข้อง
- `src/lib/geminiClient.ts` (`[EXISTING]`)
- `src/lib/serverWallet.ts` (`[EXISTING]`)
- `src/lib/creditManager.ts` (`[EXISTING]`)
- `src/app/api/advance/architect/route.ts` (`[EXISTING]`)
- `src/app/api/advance/cohesive-polish/route.ts` (`[EXISTING]`)
- `src/app/api/advance/director/route.ts` (`[EXISTING]`)
- `src/app/api/advance/hum-to-song/route.ts` (`[EXISTING]`)
- `src/app/api/advance/lyrics/route.ts` (`[EXISTING]`)
- `src/app/api/advance/reference-track/route.ts` (`[EXISTING]`)
- `src/app/api/advance/tts-cue/route.ts` (`[EXISTING]`)
- `src/components/EasyModeStarterModal.tsx` (`[EXISTING]`)
- `src/components/CohesivePolishModal.tsx` (`[EXISTING]`)
- `src/components/AdvanceModeModal.tsx` (`[EXISTING]`)
- `tests/phase8a.test.ts` (`[NEW]`)

### รายละเอียดทางวิศวกรรม (Detailed Engineering Specs)
1. **อัปเกรด `src/lib/geminiClient.ts`:**
   - คงค่าคงที่เดิมทั้งหมดไว้ (`GEMINI_MODEL_LITE`, `GEMINI_MODEL_MAIN`, `GEMINI_MODEL_PRO`, `GEMINI_MODEL_TRANSCRIBE`, `GEMINI_MODEL_TTS_LITE`, `GEMINI_MODEL_TTS`, `GEMINI_MODEL_MUSIC`, `DEFAULT_GEMINI_MODEL`) และ Export ค่าคงที่เสริม:
     ```ts
     export const GEMINI_MODEL_FAST_LITE = 'gemini-3.1-flash-lite';
     export const GEMINI_MODEL_FLASH = 'gemini-3.8-flash';
     export const GEMINI_MODEL_CARBON = 'gemini-4-carbon';
     ```
   - เพิ่มใน `GeminiJsonCallOptions`:
     ```ts
     fallbackModels?: string[];
     ```
   - ปรับ `resolveThinkingLevel(model, requested)`:
     - `gemini-3.5-flash-lite` และ `gemini-3.1-flash-lite`: รองรับ `minimal | low | medium | high` (`xhigh` → `high`)
     - `gemini-3.8-flash`: รองรับ `low | medium | high` (`minimal` → `low`, `xhigh` → `high`)
     - `gemini-4-hydrogen` / `gemini-4-argon` / `gemini-4-carbon`: `minimal` → `low`; เฉพาะ `gemini-4-argon` / `gemini-4-carbon` หาก API ไม่รองรับ `xhigh` ให้ normalize `xhigh` → `high` ยกเว้น `gemini-4-hydrogen` เพื่อรักษาเทสต์ `tests/phase5a.test.ts:145` (`resolveThinkingLevel('gemini-4-hydrogen', 'xhigh') === 'xhigh'`)
   - ปรับ `resolveMaxOutputTokens(model, requested)`:
     - คง `resolveMaxOutputTokens(GEMINI_MODEL_LITE) === 2048` และ `resolveMaxOutputTokens(GEMINI_MODEL_MAIN) === 4096` (รักษา `tests/phase5a.test.ts:151-153` เมื่อไม่ได้ส่ง `requested`) แต่เมื่อแต่ละ Route ส่ง `maxOutputTokens: 8192` หรือ `12288` ให้ใช้ค่าที่ร้องขอ (สูงสุด `65536` สำหรับ `gemini-4-hydrogen` / `3.8-flash` และ `32768` สำหรับ `gemini-4-argon` / `gemini-4-carbon`).
   - ใน `callGeminiJson`:
     - รองรับการวน `fallbackModels` เมื่อโมเดลหลักคืน `reason === 'rate-limit'`, `'network-error'` (Timeout/503), `'http-error'` (status >= 500 หรือ 404), `'incomplete-output'`, หรือ `'parse-error'` (ข้าม fallback ทันทีหากเป็น `'missing-key'` หรือ `'auth-error'` 401/403).
     - อัปเกรด `extractJsonFromText<T>(rawText)` ให้รองรับข้อความห่อหุ้มนอก `{...}` / `[...]` (ค้นหา `{ ... }` หรือ `[ ... ]` ที่สมดุลก่อน `JSON.parse`).
   - ใน `callGeminiTranscribeAudio` และ `callGeminiMusicAudio`:
     - ส่ง `{ apiVersion: 'v1beta' }` ให้ `new GoogleGenAI({ apiKey, apiVersion: 'v1beta' })`.
     - ครอบด้วย `runWithAbortTimeout` (`timeoutMs` default: `12_000` สำหรับ `callGeminiTranscribeAudio`, `50_000` สำหรับ `callGeminiMusicAudio`, `35_000` สำหรับ `callGeminiTtsAudio` ทั้ง interactions และ generateContent fallback).
   - ใน `callGeminiTtsAudio`:
     - อัปเดต `models.generateContent` fallback (บรรทัด 801–805) ไม่ให้ใส่ `speechMetadata` บน Part ที่มี `text` หาก SDK ไม่รองรับ multi-field Part (ส่ง `text` อย่างเดียวเมื่อ fallback และกำหนด `speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName`).
2. **บังคับ `gemini-3.8-flash-tts` สำหรับภาษาไทย (`src/app/api/advance/tts-cue/route.ts`, `src/components/AdvanceModeModal.tsx`):**
   - ใน `tts-cue/route.ts`: ตรวจเงื่อนไข `const containsThai = /[ก-๙]/.test(rawText);` — ถ้า `obj.modelTier === 'pro-tts' || vocalMode === 'singing-demo' || language === 'th' || containsThai` ให้บังคับ `requestedModel = GEMINI_MODEL_TTS` (`'gemini-3.8-flash-tts'`). อนุญาต `GEMINI_MODEL_TTS_LITE` เฉพาะเมื่อ `language === 'en' && !containsThai && vocalMode === 'guide' && obj.modelTier !== 'pro-tts'`.
   - ใน `AdvanceModeModal.tsx` (`handleSynthesizeSectionVocal` บริเวณบรรทัด 862–876): ส่ง `modelTier: 'pro-tts'`, `sectionType: targetSection.sectionType`, `baseKey: song?.baseKey` ให้ครบเหมือน `SectionBuilder.tsx`.
3. **แก้ระบบติดตามกระเป๋าและคืนเครดิตใน `src/lib/serverWallet.ts` & ทุก AI Routes:**
   - อัปเดต `ServerBillingPreDeductResult` เมื่อ `{ active: true }` ให้เก็บยอดที่ถูกหักจริงแยกกระเป๋า:
     ```ts
     export type ServerBillingPreDeductResult =
       | { active: false }
       | {
           active: true;
           userId: string;
           wallet: WalletBalanceSummary;
           deductedFromTrial: number;
           deductedFromPurchased: number;
         }
       | { active: true; errorStatus: number; error: string; errorCode?: string };
     ```
   - ใน `tryServerBillingPreDeduct()`: คำนวณ `deductedFromTrial` และ `deductedFromPurchased` (โดยเทียบจากสถานะกระเป๋าก่อน/หลังหัก หรือจากผลลัพธ์ของ `atomicDeductCredits` — หาก `requirePurchased` เป็น true จะหักจาก `purchased` ทั้งจำนวน).
   - ใน `refundServerBillingOnFailure()`:
     - ถ้า `options?.toPurchased` ถูกส่งมา → คืนเข้า `purchased` ตามเดิม (Backward Compatible).
     - มิฉะนั้น ถ้ามี `billing.deductedFromPurchased > 0` และ `billing.deductedFromTrial > 0` → คืนแยกส่วนตามจริง (`atomicRefundCredits(..., billing.deductedFromTrial, ..., { toPurchased: false })` และ `atomicRefundCredits(..., billing.deductedFromPurchased, ..., { toPurchased: true })`) หรือถ้า `deductedFromPurchased > 0` อย่างเดียว → ส่ง `{ toPurchased: true }` โดยอัตโนมัติ!
   - เพิ่ม outer `try / catch` ที่เรียก `refundServerBillingOnFailure(...)` และคืน JSON error (`status: 500`) ให้ครบทั้ง 5 Routes ที่ยังขาดอยู่:
     - `src/app/api/advance/director/route.ts`
     - `src/app/api/advance/hum-to-song/route.ts`
     - `src/app/api/advance/lyrics/route.ts`
     - `src/app/api/advance/reference-track/route.ts`
     - `src/app/api/advance/tts-cue/route.ts`
   - **Refund on Empty / No-Op Outputs:**
     - ใน `director/route.ts`: ตรวจสอบว่า `gemini.data` มี Patch ที่ใช้งานได้จริงอย่างน้อย 1 รายการ (เช่น `bpm`, `transposeSemitones`, `capoFret`, `guitarModel`, `stringGauge`, `ambience3D`, `mixerPatch`, หรือ `sectionPatches` ที่ไม่ว่างเปล่า) — ถ้าว่างเปล่าทั้งหมด ให้เรียก `refundServerBillingOnFailure` คืน `1` เครดิตและตั้ง `isSimulated: true, patch: null`.
     - ใน `lyrics/route.ts`:
       - โหมด `singleBarIndex`: ถ้าได้ `rawVariations.length === 0` (หรือได้น้อยกว่า `2` ตัวเลือกที่ผ่านการกรอง) ให้คืนเครดิตและส่ง fallback แทนการยัดคำจำลองปนแล้วคิดเงินเต็ม.
       - โหมดรายท่อน: ถ้าได้บรรทัดกลับมาน้อยกว่า `Math.min(2, expectedBars)` ให้คืนเครดิตและส่ง fallback แทนการปล่อยผ่าน.
   - อัปเดต Routing & Token Budgets บน Routes ตามตาราง 0.2:
     - `architect/route.ts`: `maxOutputTokens: sectionCount <= 5 ? 8192 : 12288`, `fallbackModels: ['gemini-3.8-flash', 'gemini-3.5-flash-lite']`, และ polish pass `maxOutputTokens: 2048`, `thinkingLevel: 'low'`.
     - `cohesive-polish/route.ts`: `isPartial` → `maxOutputTokens: 4096, thinkingLevel: 'low', fallbackModels: ['gemini-3.8-flash']`; whole → `maxOutputTokens: 8192, thinkingLevel: 'low', fallbackModels: ['gemini-3.8-flash', 'gemini-3.5-flash-lite']`.
     - `director/route.ts`: `thinkingLevel: 'low', maxOutputTokens: 2048, timeoutMs: 20_000, fallbackModels: ['gemini-3.8-flash']`.
     - `hum-to-song/route.ts`: transcribe timeout `12_000` ms; main `maxOutputTokens: 8192, timeoutMs: 38_000, fallbackModels: ['gemini-3.8-flash', 'gemini-3.5-flash-lite']`.
     - `lyrics/route.ts`: `quick` → `thinkingLevel: 'low', maxOutputTokens: 2048, timeoutMs: 22_000, fallbackModels: ['gemini-3.1-flash-lite']`; `deep` → `thinkingLevel: 'low', maxOutputTokens: 6144, timeoutMs: 32_000, fallbackModels: ['gemini-3.8-flash', 'gemini-3.5-flash-lite']`; `singleBarIndex` → `fallbackModels: ['gemini-3.1-flash-lite']`.
4. **เปิดสวิตช์ `gemini-4-argon` Pro Mode (10 เครดิต — Paid Credits Only) (ตามคำตัดสินใจข้อ 2):**
   - **`src/app/api/advance/architect/route.ts` & `src/components/EasyModeStarterModal.tsx`:**
     - รองรับ `modelTier?: 'standard' | 'pro-argon'` (boolean `useProArgon`).
     - เมื่อ `useProArgon === true`:
       - ใช้ `GEMINI_MODEL_PRO` (`'gemini-4-argon'`), `thinkingLevel: 'medium'`, `maxOutputTokens: 32768`, `timeoutMs: 46_000`, `fallbackModels: ['gemini-4-hydrogen', 'gemini-3.8-flash']`.
       - คิดราคา `CREDIT_COST_TABLE.aiProArgonArranger` (`10` เครดิต) และเรียก `tryServerBillingPreDeduct(..., { requirePurchased: true, modelId: GEMINI_MODEL_PRO })`.
     - ใน `EasyModeStarterModal.tsx`: เพิ่มสวิตช์เลือกคุณภาพโมเดล: `⚡ Standard (Gemini 4 Hydrogen · 4–8 Cr)` vs `💎 Pro Producer (Gemini 4 Argon · 10 Cr · เครดิตเติมเงิน)` โดยใช้ `canUsePaidOnlyModel(CREDIT_COST_TABLE.aiProArgonArranger)` ตรวจสอบสิทธิ์ฝั่ง Client และแจ้งปุ่มไปเติมเงินถ้าเป็น Trial-only.
   - **`src/app/api/advance/cohesive-polish/route.ts` & `src/components/CohesivePolishModal.tsx`:**
     - รองรับ `useProArgon?: boolean` เมื่อไม่ได้ล็อก 100%:
       - ใช้ `GEMINI_MODEL_PRO` (`'gemini-4-argon'`), `thinkingLevel: 'medium'`, `maxOutputTokens: 32768`, `timeoutMs: 46_000`, `fallbackModels: ['gemini-4-hydrogen', 'gemini-3.8-flash']`.
       - คิดราคา `CREDIT_COST_TABLE.aiProArgonArranger` (`10` เครดิต) พร้อม `{ requirePurchased: true, modelId: GEMINI_MODEL_PRO }`.
     - ใน `CohesivePolishModal.tsx`: เพิ่ม Toggle `💎 โหมด Pro Producer (Gemini 4 Argon · 10 เครดิต)` คู่กับโหมดมาตรฐาน (2–3 เครดิต) และแสดงข้อความแจ้งเตือนชัดเจนหากมีเฉพาะ Trial Credits.

### การทดสอบ (`tests/phase8a.test.ts`)
- ทดสอบ `callGeminiJson` สลับไปยัง `fallbackModels` เมื่อโมเดลหลักคืน HTTP 429 หรือ Timeout และยังคงอ่าน JSON ที่มีข้อความห่อหุ้มได้
- ทดสอบ `tts-cue` ว่าข้อความภาษาไทยถูกส่งไปยัง `gemini-3.8-flash-tts` แม้ไม่ได้ส่ง `modelTier: 'pro-tts'` และใส่ `apiVersion: 'v1beta'` บน `transcribe` + `lyria-3.5`
- ทดสอบ `tryServerBillingPreDeduct` + `refundServerBillingOnFailure` ว่าบัญชีที่มี `trialCredits: 0, purchasedCredits: 10` เมื่อเกิด Failure ใน `architect` / `lyrics` / `hum-to-song` / `director` ได้เครดิตคืนเข้า `purchasedCredits` ครบ 100%
- ทดสอบ `useProArgon: true` ใน `architect` และ `cohesive-polish` (ต้องหัก 10 purchased credits, เรียก `gemini-4-argon`, และกันบัญชี trial-only ด้วย HTTP 402)

---

## 🧠 Phase 8B: Prompt Engineering, 16-Step Hum-to-Song & Cohesive Polish Fixes

### เป้าหมาย
แก้ไขข้อขัดแย้งใน System Prompts และ Schema ของ AI ให้ผลลัพธ์ทางดนตรี ฉันทลักษณ์ไทย และโครงสร้างท่อนเพลงตรงกับ Audio Engine 100%

### ไฟล์ที่เกี่ยวข้อง
- `src/lib/aiPrompts.ts` (`[EXISTING]`)
- `src/lib/songArchitect.ts` (`[EXISTING]`)
- `src/app/api/advance/hum-to-song/route.ts` (`[EXISTING]`)
- `src/app/api/advance/cohesive-polish/route.ts` (`[EXISTING]`)
- `src/app/api/advance/architect/route.ts` (`[EXISTING]`)
- `src/components/CohesivePolishModal.tsx` (`[EXISTING]`)
- `tests/phase8b.test.ts` (`[NEW]`)

### รายละเอียดทางวิศวกรรม
1. **แก้บั๊ก 8-Step → 16-Step Grid ใน Hum-to-Song (`src/lib/aiPrompts.ts`, `src/lib/songArchitect.ts`):**
   - ใน `buildHumToSongSystemPrompt()` (`aiPrompts.ts` บริเวณบรรทัด 1649): เปลี่ยนคำสั่งจาก `step (0-7 สำหรับ 4/4 และ 0-5 สำหรับ 3/4 หรือ 6/8)` เป็น **`step (0-15 สำหรับ 4/4 และ 0-11 สำหรับ 3/4 หรือ 6/8)`** และ `durationSteps (1-16)`.
   - ใน `HUM_TO_SONG_RESPONSE_SCHEMA` (`aiPrompts.ts` บริเวณบรรทัด 2003, 2025): แก้ `playStyle` enum ให้ตรงกับ `['normal', 'let-ring', 'break']` และปรับ `producerNotes` ให้เป็น `ARRAY` ของ `STRING` (`{ type: 'array', items: { type: 'string' } }`) พร้อมคงตัวป้องกันใน `hum-to-song/route.ts` เผื่อกรณี string เดี่ยว.
   - ใน `sanitizeArchitectSongProject()` (`songArchitect.ts`): ตรวจสอบหากโน้ตเมโลดี้ทั้งหมดในบาร์ของ Hum-to-Song อยู่ในช่วง `0..7` (ทั้งๆ ที่เป็น `4/4`) ให้รองรับอย่างปลอดภัยโดยไม่ตกขอบ.
2. **แก้คำสั่งขัดกันเรื่อง `melodyNotes` และ `4-6 พยางค์` ใน `aiPrompts.ts`:**
   - ใน `buildEasyArchitectUserPrompt()` (บรรทัด 1502): ลบคำสั่งที่บังคับให้ส่ง `melodyNotes` (ซึ่งตีกับ System Prompt บรรทัด 1411 ที่สั่งไม่ให้สร้าง array melodyNotes เพื่อกัน JSON บวมและรักษา `tests/phase7e.test.ts:804`).
   - ใน `buildEasyArchitectSystemPrompt()`, `buildEasyArchitectUserPrompt()`, `buildCohesivePolishSystemPrompt()`: ลบข้อความตายตัว `"4-6 พยางค์ ... ห้ามแต่ง 8-12 พยางค์เด็ดขาด"` ที่ขัดกับ `getSyllableBudgetForBpm()` เมื่อแต่งเพลงเร็ว/ร็อก/เพื่อชีวิต (`aed-carabao` 6–11 พยางค์ ฯลฯ) และให้อ้างอิง `${budget.guidance}` ของ BPM/Style นั้นๆ แทน (โดยยังคงข้อความ `'5-8 พยางค์'` สำหรับเคส default `74 BPM 4/4` ใน `tests/phase5a.test.ts`!).
   - ใน `lyrics/route.ts` (บรรทัด 857): ส่ง `minSyllables: budget.min, maxSyllables: budget.max, enforceSyllableBudget: true` จาก `getSyllableBudgetForBpm()` เข้า `validateThaiLyricCouplets()` ให้มาตรฐานเดียวกับ `architect/route.ts`.
3. **แก้ Architect Rhyme Polish ทับท่อนชื่อซ้ำ (`src/app/api/advance/architect/route.ts`, `src/lib/aiPrompts.ts`):**
   - เพิ่ม `sectionId?: string` ใน `RHYME_POLISH_RESPONSE_SCHEMA` และ `buildRhymePolishPrompt()` (ส่ง `sec.id` คู่กับ `sec.name`).
   - ใน `architect/route.ts` (บรรทัด 324–343): จับคู่ผลเกลาสัมผัสด้วย **`p.sectionId` ก่อน** (แล้วค่อย fallback ไปจับคู่แบบ 1-ต่อ-1 ตามลำดับที่เลือกไว้หากโมเดลไม่คืน `sectionId`) เพื่อไม่ให้เพลงที่มีท่อนชื่อ `Chorus` 2 ท่อนโดนเขียนทับด้วยเนื้อเดียวกัน.
4. **แก้ `cohesive-polish` ทับท่อนล็อก + Slash Chord หาย + Payload 413 (`src/app/api/advance/cohesive-polish/route.ts`, `src/components/CohesivePolishModal.tsx`):**
   - **รักษาท่อนที่ล็อกไว้ 100% (`lockedSectionIds`):** เมื่อเรียก `applyGenreBandArrangement()` ทั้งในกรณี 100% retention (บรรทัด 80), graceful fallback (บรรทัด 184) และหลัง AI ตอบกลับ (บรรทัด 333) ให้คืนค่า `sec` เดิมของท่อนที่อยู่ใน `lockedSet` ทั้ง `instruments`, `intensity`, `bars`, `lyrics`, `chords` ห้ามแตะต้องท่อนที่ล็อกไว้เด็ดขาด!
   - **รักษา Slash Chord (`/Bass`):** ใน `cohesive-polish/route.ts` (บรรทัด 287–289) ใช้ `parseChord(c)` แล้วประกอบกลับเป็น `parsed.root + parsed.quality + (parsed.bass ? '/' + parsed.bass : '')` พร้อมตรวจด้วย Chord Regex ที่ถูกต้องเพื่อกันข้อความแปลกปลอมอย่าง `'N.C.'`.
   - **แก้ Index Shift & Empty Lyrics:** เมื่อ `returnedMapById.get(sec.id)` ไม่พบ ให้จับคู่ตามลำดับของ **`unlockedSections`** (ไม่ใช่ `song.sections` index ที่มีท่อนล็อกปนอยู่!) และห้ามเขียนทับ `bar.lyrics` ด้วยสตริงว่าง `""` หากเดิมมีเนื้อร้องอยู่แล้ว.
   - **กัน 413 Payload Too Large:** ใน `CohesivePolishModal.tsx` ใช้ `stripVocalsFromSong(song)` และตัด `snapshots` ออกก่อนส่ง Request ไปยัง `/api/advance/cohesive-polish` แล้วนำเสียงร้องเดิมตาม `bar.id` และ `vocalTakes`, `snapshots` กลับมารวมกับผลลัพธ์ก่อนเรียก `onApplySong`.
5. **อัปเดต Enum สไตล์ Phase 7C ใน `buildDirectorSystemPrompt()` (`src/lib/aiPrompts.ts`):**
   - เพิ่ม Enum ที่ขาดหายในคำอธิบายของ AI Song Director: `lukthung-bounce`, `rock-power` (`guitarRhythmStyle`); `fuzz` (`guitarLeadDrive`); `lukthung-groove`, `rnb-syncopated` (`bassStyle`); `rnb-neo-chord`, `rock-organ-pad` (`pianoStyle`); `lukthung-3cha`, `rnb-pocket`, `rock-drive` (`drumsStyle`).

### การทดสอบ (`tests/phase8b.test.ts`)
- ทดสอบ `buildHumToSongSystemPrompt` (`0-15` สำหรับ `4/4`) และ `HUM_TO_SONG_RESPONSE_SCHEMA` (`playStyle` ตรงกับ `SongBar`)
- ทดสอบ `cohesive-polish/route.ts`: ท่อนที่ล็อกใน `lockedSectionIds` ต้องคง `instruments` และ `intensity` เดิม 100% แม้ `rebalanceBand: true`; คอร์ด `G/B`, `D/F#` ต้องไม่โดนตัด `/B`, `/F#` ทิ้ง
- ทดสอบ `architect/route.ts` รอบ Polish เมื่อมี 2 ท่อนชื่อ `'Chorus'` ว่าแต่ละท่อนได้เนื้อร้องตรง `sec.id` ของตนเอง

---

## 💾 Phase 8C: Studio Save Engine (Auto + Manual Save `Ctrl+S` + Auto-Checkpoints) & IDB Audio Fix

### เป้าหมาย
1. เปลี่ยนป้าย `Auto-saved` คงที่เป็นระบบสถานะการเซฟจริง + เพิ่มปุ่ม **Manual Save (`Ctrl/Cmd+S`)** และ **Save Checkpoint (`Ctrl/Cmd+Shift+S`)**
2. เพิ่ม **Auto-Checkpoint** อัตโนมัติก่อนทุกคำสั่ง AI หรือ Preset ที่เขียนทับเพลง
3. แก้บั๊ก Phantom Auto-Save ตอนเปิดเว็บ, ซิงค์ `updatedAt` ใน React State, Flush งานก่อนสลับเพลง/ปิดแท็บ, เลิกเขียนไฟล์เสียง IDB ซ้ำทุก keystroke, แก้ `duplicateSong` เสียงร้องหาย 100%, และกันลิงก์แชร์ `?song=` ทับเพลงเดิม

### ไฟล์ที่เกี่ยวข้อง
- `src/lib/storage.ts` (`[EXISTING]`)
- `src/lib/audioStorageIdb.ts` (`[EXISTING]`)
- `src/app/page.tsx` (`[EXISTING]`)
- `src/components/TransportBar.tsx` (`[EXISTING]`)
- `src/components/SongLibraryModal.tsx` (`[EXISTING]`)
- `src/lib/i18n.ts` (`[EXISTING]`)
- `tests/phase8c.test.ts` (`[NEW]`)

### รายละเอียดทางวิศวกรรม
1. **แก้ Phantom Auto-Save & ซิงค์ `updatedAt` (`src/app/page.tsx`, `src/lib/storage.ts`):**
   - ใน `src/lib/storage.ts`:
     - เพิ่ม `options?: { setActive?: boolean; preserveUpdatedAt?: boolean; skipIdbPersist?: boolean }` ใน `saveSong(song, options)`: เมื่อ `preserveUpdatedAt: true` จะไม่สร้าง `new Date().toISOString()` ทับเวลาเดิมของเพลง.
   - ใน `src/app/page.tsx`:
     - สร้าง `LocalSaveState = 'saved' | 'dirty' | 'saving' | 'error'` และ `lastLocalSavedAt: string | null`.
     - ใช้ `isHydratingOrLoadingRef` / `lastPersistedSongKeyRef` (`${song.id}::${song.updatedAt}::${buildSongContentFingerprint(song)}`) เพื่อแยกความแตกต่างระหว่าง **"กำลังโหลดเพลงตอนเปิดแอป / Hydrate เสียงจาก IDB"** กับ **"ผู้ใช้แก้ไขเพลงจริง"**:
       - ตอนเปิดเว็บ (`selectSongWithVocals` และ `hydrateSongVocalsFromIdb`): อัปเดต `lastPersistedSongKeyRef` โดย **ไม่สั่ง** `saveSong` และไม่ปั๊ม `updatedAt` ใหม่.
       - ใน `updateSongWithHistory`: เมื่อเนื้อหาเปลี่ยนจริง ให้ประทับ `updatedAt: new Date().toISOString()` ลงในตัวแปร `next` ของ React State ทันที และตั้ง `localSaveState = 'dirty'`.
     - เพิ่ม **Flush Handlers**:
       - `flushPendingLocalSave(songToFlush?)`: ยกเลิก Timer 600ms แล้วเรียก `saveSong(..., { preserveUpdatedAt: true })` ทันที พร้อมตั้ง `localSaveState = 'saved' | 'error'`.
       - ผูก `visibilitychange` (`document.visibilityState === 'hidden'`) และ `pagehide` ให้เรียก `flushPendingLocalSave()` ทันที.
       - ก่อนสลับเพลงใน `SongLibraryModal` (`onSelectSong`) ให้เรียก `flushPendingLocalSave()` สำหรับเพลงปัจจุบันก่อนเสมอ.
2. **เพิ่มปุ่ม Manual Save (`Ctrl+S`), Save Checkpoint & Auto-Checkpoint (`TransportBar.tsx`, `page.tsx`, `i18n.ts`):**
   - เพิ่ม Props บน `TransportBar`: `localSaveState`, `lastLocalSavedAt`, `onManualSave: () => Promise<void> | void`, `onSaveCheckpoint: () => void`.
   - บน `TransportBar.tsx`:
     - แสดงป้ายสถานะการเซฟตามจริง:
       - `dirty` / `saving`: จุดสีเหลือง + `"รอ/กำลังบันทึก..."`
       - `saved`: จุดสีเขียว + `"บันทึกแล้ว HH:mm"`
       - `error`: จุดสีแดง + `"บันทึกไม่สำเร็จ (พื้นที่เต็ม?)"`
     - เพิ่มปุ่ม **`💾 บันทึก` (Manual Save)** กดได้ทั้งคลิกและคีย์ลัด **`Ctrl+S` / `Cmd+S`** (ทำงานแม้กำลังพิมพ์อยู่ในช่อง Input โดยเรียก `e.preventDefault()`, flush ลงเครื่องทันที + หากล็อกอิน Cloud อยู่ให้ทริกเกอร์ Sync ขึ้น Cloud ทันที + แสดง Toast ยืนยัน).
     - เพิ่มปุ่ม **`📸 ปักหมุดเวอร์ชัน` (`Ctrl/Cmd+Shift+S`)** เรียก `addSnapshotToSong` ทันทีโดยไม่ต้องเปิด `SongLibraryModal` (และคง Undo Stack เดิมไว้ ไม่ล้างเหมือน `selectSongWithVocals`).
   - **Auto-Checkpoint ก่อนเขียนทับเพลงด้วย AI / Preset:**
     - สร้าง Helper `createAutoCheckpointBeforeMutation(label: string)` ใน `page.tsx` ที่เรียก `addSnapshotToSong(songRef.current, label)` ทันทีก่อน:
       - `handleApplyPreset` (เปลี่ยนชุดคอร์ด)
       - `CohesivePolishModal` (`onApplySong`)
       - `AdvanceModeModal` AI Director & AI Lyrics (`onApplyLyrics` / `onApplySongUpdate`)
       - `handleApplyEasySong` (กรณีเลือกเขียนทับเพลงเดิม)
3. **IDB Dirty-Check & `duplicateSongWithVocals` (`src/lib/audioStorageIdb.ts`, `src/lib/storage.ts`, `src/components/SongLibraryModal.tsx`):**
   - ใน `audioStorageIdb.ts`:
     - เก็บ `writtenSignatureByKey = new Map<string, string>()` (`${dataUrl.length}:${dataUrl.slice(0, 64)}:${dataUrl.slice(-32)}`) ใน `saveVocalBlob` / `persistSongVocalsToIdb` (และล้างใน `deleteVocalBlob`, `clearSongVocals`, `resetAudioDbForTests`) เพื่อไม่เขียนไฟล์เสียงซ้ำลง IndexedDB หากไฟล์เดิมไม่เปลี่ยนเมื่อผู้ใช้พิมพ์แก้เนื้อร้อง!
     - `saveSong` เมื่อเรียก `persistSongVocalsToIdb` จะทำเฉพาะเมื่อตรวจพบว่ามีเสียงที่ยังไม่เคยเขียน.
   - เพิ่ม `duplicateSongWithVocals(id: string, liveSong?: SongProject): Promise<SongProject | null>` ใน `src/lib/storage.ts`:
     - ใช้ `liveSong` (หากกำลังเปิดเพลงนั้นอยู่ เพื่อไม่ให้ตกหล่นข้อมูลในหน้าจอ) หรืออ่านจากคลัง + ดึง `hydrateSongVocalsFromIdb()` ให้ครบทั้ง `bar.vocalAudio` และ `vocalTakes[].audioDataUrl` ก่อนสร้างสำเนาที่มี `sec.id`, `bar.id`, `take.id` ใหม่ พร้อมบันทึกไฟล์เสียงทั้งหมดของสำเนาลง IndexedDB ภายใต้ `${copy.id}_...` อย่างสมบูรณ์ (และคง `duplicateSong` เดิมแบบ synchronous ไว้เพื่อ Backward Compatibility).
   - แก้ `SongLibraryModal.tsx`: เรียก `await duplicateSongWithVocals(id, isCurrent ? currentSong : undefined)` และเมื่อแก้ Title / Folder / Snapshot บนเพลงที่กำลังเปิดอยู่ **ห้าม** ล้าง Undo Stack!
4. **Safe Default ID & Safe `?song=` Share Link Loading (`src/lib/defaultSong.ts`, `src/app/page.tsx`):**
   - ใน `page.tsx`: เมื่อโหลดครั้งแรกและยังไม่มี `STORAGE_KEY` ใน `localStorage` หรือเมื่อเปิดลิงก์แชร์ `?song=` ที่ `shared.id` ชนกับเพลงที่มีอยู่แล้วในเครื่อง (และเนื้อหาต่างกัน) ให้สร้าง ID ใหม่ (`generateUniqueId('shared')`) แทนการเขียนทับเพลงในคลังของผู้ใช้อัตโนมัติ พร้อม Toast แจ้งชัดเจน.
   - เมื่อ `createDefaultSong()` ถูกใช้สร้างเพลงใหม่บนเครื่องที่ว่าง (ไม่ใช่ค่าอ้างอิงใน Test) หรือกด `+ เพลงใหม่` ให้ใช้ ID ไม่ซ้ำกันข้ามเครื่อง (`demo-song-...` ใน `storage.ts` ตอน initial seed หรือปุ่ม New Song — โดยยังรักษา `createDefaultSong().id === 'demo-song-1'` เผื่อ Unit Tests ที่คาดหวังค่าเริ่มต้น).

### การทดสอบ (`tests/phase8c.test.ts`)
- ทดสอบ `duplicateSongWithVocals()` ว่าคัดลอกทั้ง `bar.vocalAudio` และ `vocalTakes[].audioDataUrl` ไปยัง IDB ของเพลงใหม่ครบ 100%
- ทดสอบ `persistSongVocalsToIdb()` dirty-check ว่าไม่เขียนซ้ำเมื่อข้อมูลเสียงเหมือนเดิม และเขียนใหม่เมื่อเสียงเปลี่ยน
- ทดสอบ `saveSong(..., { preserveUpdatedAt: true })` ว่าไม่เปลี่ยน `updatedAt` เอง (ป้องกัน Phantom Auto-Save)
- ทดสอบ Contract ใน `page.tsx` & `TransportBar.tsx` สำหรับปุ่ม Manual Save (`Ctrl+S`), Save Checkpoint, Auto-Checkpoint และ Safe Share Link ID Collision Guard

---

## ☁️ Phase 8D: Resilient Cloud Sync, Tombstone Delete & Multi-Device Conflict Guard

### เป้าหมาย
แก้ปัญหาการซิงค์ข้อมูลข้ามอุปกรณ์ทั้งหมด: ลบเพลงแล้วต้องหายบน Cloud ด้วยไม่คืนชีพ, ข้อมูลที่แก้คนละเครื่องไม่เขียนทับกันหาย, ต่ออายุ Session 401 อัตโนมัติ, และสวิตช์ `autoSyncEnabled` ทำงานจริง

### ไฟล์ที่เกี่ยวข้อง
- `src/lib/cloudSync.ts` (`[EXISTING]`)
- `src/lib/storage.ts` (`[EXISTING]`)
- `src/components/AccountSyncModal.tsx` (`[EXISTING]`)
- `src/app/page.tsx` (`[EXISTING]`)
- `tests/phase8d.test.ts` (`[NEW]`)

### รายละเอียดทางวิศวกรรม
1. **Tombstone Deletion Propagation (`src/lib/storage.ts`, `src/lib/cloudSync.ts`):**
   - ใน `storage.ts`:
     - เพิ่ม `DELETED_SONGS_KEY = 'demo_maker_deleted_songs_v1'` (`Record<string, string>` mapping `songId -> deletedAtIso`).
     - Export `getDeletedSongTombstones()`, `recordDeletedSongTombstone(id)`, `clearDeletedSongTombstone(id)`.
     - เมื่อเรียก `deleteSong(id)` → บันทึกลง `DELETED_SONGS_KEY` ทันที (และหาก `saveSong` มี ID เดียวกันถูกสร้าง/นำเข้าใหม่ให้ลบออกจาก Tombstone).
     - รองรับการลบเพลงจนเหลือ 0 แล้วสร้าง Default ใหม่สะอาด หรือแจ้งเตือนชัดเจนแทนการค้างลบไม่ได้โดยไม่บอกสาเหตุ.
   - ใน `cloudSync.ts`:
     - เพิ่ม `deleteSongFromCloud(songId: string)`: ส่ง `DELETE /rest/v1/songs?id=eq.${encodeURIComponent(songId)}&user_id=eq.${encodeURIComponent(user.id)}` (ผ่าน `fetchSupabaseWithRefresh`).
     - อัปเดต `mergeSongLists(localSongs, cloudSongs, tombstones?)`: ถ้า `cloud.id` อยู่ใน `tombstones` และ `parseUpdatedAtMs(tombstones[cloud.id]) >= parseUpdatedAtMs(cloud.updatedAt)` ให้ข้ามไม่นำกลับเข้า `merged` และใน `syncLibraryNow()` ให้ส่ง `deleteSongFromCloud(id)` ขึ้นไปลบบน Server (เมื่อลบสำเร็จจึงล้าง tombstone นั้น).
2. **Non-Destructive Conflict Snapshot (`src/lib/cloudSync.ts`):**
   - ใน `mergeSongLists()`: เมื่อ `local` และ `cloud` มี `id` เดียวกันและเนื้อหาต่างกัน (เช็กด้วย `buildSongSyncDigest(s)` จาก title/bpm/key/sections/mixer):
     - ถ้า `Math.abs(localMs - cloudMs) > 0` และฝั่งหนึ่งเก่ากว่า: ยังคงเลือกฝั่งที่ `updatedAt` ใหม่กว่าเป็นเพลงหลัก **แต่** สร้าง `SongSnapshot` ของฝั่งที่เก่ากว่าชื่อ `Auto-backup: Sync Conflict (${olderTime})` ใส่ไว้ใน `winner.snapshots` (ไม่ให้ซ้ำกับ snapshot เดิมที่มีอยู่แล้วและจำกัดสูงสุด 25 รายการ) เพื่อให้ผู้ใช้กู้คืนได้ทุกเมื่อ!
3. **Token Auto-Refresh, Explicit Fetch Error & Schema Sanitization (`src/lib/cloudSync.ts`, `src/app/page.tsx`):**
   - สร้าง `fetchSupabaseWithRefresh(url, init)` ที่ตรวจจับ `res.status === 401`, เรียก `refreshAuthSession()` (single-flight promise กันชนกัน) แล้วลองยิงคำขอซ้ำให้อัตโนมัติ 1 ครั้ง.
   - ปรับ `fetchSongsFromCloud()` (หรือเพิ่ม `fetchSongsFromCloudDetailed()` โดยคง `fetchSongsFromCloud()` ไว้สำหรับเทสต์เก่า `phase4d.test.ts`) ให้แยกสถานะ **Network/Auth Error (`ok: false`)** ออกจาก **Cloud ว่าง (`ok: true, songs: []`)** — ห้ามกลืน 401/500 เป็น `[]` แล้วลุย Push ทับ!
   - สร้าง `sanitizeCloudSongProject(raw)` ตรวจสอบและเติมโครงสร้าง `SongProject` (مثل `mixer`, `sections`, `bars`, `chords`) ที่อาจขาดหายก่อนบันทึกลงเครื่อง.
   - ใน `syncSongToCloud`: อย่าส่ง `created_at: song.updatedAt` ทับในการ `PATCH`/`UPSERT` (ส่ง `created_at` เฉพาะเมื่อไม่มี หรือส่งเฉพาะ `updated_at`) และคงส่งเฉพาะ metadata โดยแยก `stripVocalsFromSong`.
   - ใน `syncLibraryNow`:
     - อ่าน `getSavedSongs()` ปัจจุบันอีกครั้งหลัง `await` เพื่อไม่เขียนทับการแก้ไขที่เกิดขึ้นระหว่างกำลังอัปโหลด (In-Flight Edit Protection).
     - หาก Upload เพลงที่ 3 ล้มเหลว ให้บันทึกเพลงที่ Pull มาได้เรียบร้อยแล้วลงเครื่องก่อนคืนผล Error (ไม่ทิ้งข้อมูลที่ดึงมา).
     - ป้องกัน Guest ไม่ให้ `syncLibraryNow` ยิงไปชน RLS Error (ให้ตรวจสอบ `user.mode === 'authenticated'` ก่อนยิง Supabase REST).
   - **Auto-Sync & Sign-Out Isolation (`page.tsx`, `cloudSync.ts`, `AccountSyncModal.tsx`):**
     - ใน `page.tsx`: ห้ามตั้ง `syncStatus = 'synced'` ตอนเปิดเว็บจนกว่าจะได้ผลลัพธ์ Sync จริง (เริ่มเป็น `'local-only'` หรือ `'offline'` หรือซิงค์อัตโนมัติ 1 ครั้งเมื่อเปิดเว็บและ `isCloudConfigured() && user.mode === 'authenticated'`).
     - ผูก `getCloudConfig().autoSyncEnabled` กับ `useEffect` ใน `page.tsx`: เมื่อ `autoSyncEnabled === true && cloudUser.mode === 'authenticated'` และ `localSaveState === 'saved'` ให้ซิงค์ขึ้น Cloud เบื้องหลังอัตโนมัติ (Debounce 3 วินาที).
     - ใน `AccountSyncModal.tsx`: แจ้งให้ผู้ใช้ทราบอย่างซื่อสัตย์ว่าไฟล์เสียงร้องบันทึกในเครื่อง (IndexedDB) และแนะนำการสำรอง `.JSON` สำหรับการย้ายเสียงร้องข้ามเครื่อง; เมื่อ `signOutUser()` ถามหรือล้าง Session ค้างอย่างปลอดภัยไม่ให้ปนข้ามบัญชี.

### การทดสอบ (`tests/phase8d.test.ts`)
- ทดสอบ Tombstone Deletion: หลัง `deleteSong(id)` เมื่อ `syncLibraryNow` ทำงาน ต้องยิง `DELETE` และไม่คืนเพลงที่ลบแล้วกลับมาในคลัง
- ทดสอบ Conflict Snapshot: เมื่อ Local และ Cloud มีเนื้อหาต่างกัน ฝั่งเก่าต้องถูกแนบเก็บเป็น `SongSnapshot` ในเพลงผลลัพธ์
- ทดสอบ HTTP 401 Auto-Refresh ใน `fetchSongsFromCloudDetailed` / `syncSongToCloud`
- ทดสอบ Schema Sanitization เมื่อดึงเพลงที่ขาดฟิลด์จาก Cloud

---

## 🎨 Phase 8E: User-Centric UX/UI Overhaul, Smart Undo/Redo, Chord Audition & Dark/Touch Polish

### เป้าหมาย
แก้ไขปัญหาความรก, การซ่อนเครื่องมือฟรี, บั๊ก Undo/Redo, การเผลอทำข้อมูลหายตอนเปลี่ยนคอร์ด/พรีวิว AI และความไม่พร้อมบน Dark Mode / จอสัมผัส iPad จากมุมมองผู้ใช้งานจริง

### ไฟล์ที่เกี่ยวข้อง
- `src/components/SectionBuilder.tsx` (`[EXISTING]`)
- `src/components/TransportBar.tsx` (`[EXISTING]`)
- `src/components/ChordPickerModal.tsx` (`[EXISTING]`)
- `src/components/SoundCustomizerPanel.tsx` (`[EXISTING]`)
- `src/components/MiniPianoRollModal.tsx` (`[EXISTING]`)
- `src/components/AdvanceModeModal.tsx` (`[EXISTING]`)
- `src/components/EasyModeStarterModal.tsx` (`[EXISTING]`)
- `src/components/VocalRecorderModal.tsx` (`[EXISTING]`)
- `src/lib/audioEngine.ts` & `src/hooks/useAudioEngine.ts` (`[EXISTING]`)
- `src/app/page.tsx` (`[EXISTING]`)
- `tests/phase8e.test.ts` (`[NEW]`)

### รายละเอียดทางวิศวกรรม
1. **ลดความรกของการ์ดห้องเพลง + ดึงเครื่องมือฟรีออกมาหน้าหลัก (`SectionBuilder.tsx`, `page.tsx`):**
   - **Active Bar Progressive Disclosure:** เพิ่ม `focusedBarId: string | null` และปุ่มสลับ `showAllBarTools` ใน `SectionBuilder.tsx`:
     - ห้องที่ไม่ได้ถูกเลือก: แสดงคอร์ด, เนื้อร้อง, ตัวนับพยางค์ (`/min-max`) และปุ่มสถานะหลัก (`🎙️`, `🎹`) อย่างโล่งสบายตา
     - ห้องที่คลิก/โฟกัส (`focusedBarId === bar.id` หรือเปิด `showAllBarTools`): กางแถบเครื่องมือช่วยแต่งครบชุด (`🎭 อารมณ์คอร์ด`, ป้ายวรรณยุกต์, `🔗 สัมผัสต่อจากวรรคก่อน`, `⤵ ปัดคำลง`, `🎲 3 ตัวเลือก`, `🔊 ฟังจังหวะคำร้อง`, `🔁 ลูปห้องนี้`)
   - **ดึงปุ่มฟรี (0 Cr) & Easy Mode ออกมาให้เข้าถึงง่าย:**
     - เพิ่มปุ่ม `✨ Easy Mode` และ `➕ เพลงใหม่` ที่เข้าถึงได้สะดวกบน `TransportBar` หรือ Action Strip บนสุด (ให้ใช้ได้แม้สลับโหมด).
     - เพิ่มปุ่มลัด **`📖 พจนานุกรมสัมผัสไทย (ฟรี 0 Cr)`** (เปิด `AdvanceModeModal` ที่ Tab `'rhyme'`) และ **`📋 วางเนื้อร้องแบ่งห้อง (ฟรี 0 Cr)`** บนแถบเครื่องมือหลักของ `SectionBuilder` ไม่ให้หลบอยู่ในเมนู `✨ AI`.
     - บน Mobile/Tablet ให้ป้ายชื่อปุ่มสำคัญใน `SectionBuilder` (`▶ เล่นท่อนนี้`, `🔁 ลูป`, `📝 แผ่นเดียว`) อ่านออกได้โดยไม่เหลือแต่ไอคอนปริศนา.
2. **Smart Coalesced Undo/Redo (`src/app/page.tsx`, `src/components/TransportBar.tsx`):**
   - ขยาย `buildSongHistoryFingerprint()` ให้ครอบคลุม `vocalTakes`, `vocalLatencyOffsetMs`, `countInEnabled`, `guitarModel`, `stringGauge`, `ambience3D`, `folder`, `statusTag` (ยกเว้น `audioDataUrl` / `vocalAudio` ก้อนใหญ่ใน Memory clone ถ้าทำได้ หรือเก็บแบบ Light Reference เพื่อไม่ให้กิน RAM จนกระตุก).
   - เพิ่มการรวบประวัติ (`Coalescing Window = 1200ms` เมื่อระบุ `{ coalesceKey: 'lyrics-bar-...' | 'title' | 'mixer-vol' }`): การพิมพ์ต่อเนื่องในห้องเดิมหรือลากสไลเดอร์ความดังจะรวบเป็น Undo 1 ขั้น ไม่เผาโควตา `MAX_HISTORY = 30` ในไม่กี่วินาที.
   - แก้ `TransportBar.tsx` `handleKeyDown` (`Esc` key): ไม่สั่ง `onStop()` หากมี Modal อื่นเปิดอยู่ (ให้ปิดเฉพาะ Modal นั้น).
3. **ป้องกันการเผลอลบข้อมูลเพลง & เพิ่มเสียงดีดคอร์ดตัวอย่าง:**
   - **Non-Destructive `handleApplyPreset` (`src/app/page.tsx`):** เมื่อเลือก Preset ทางคอร์ดใน `ProgressionPresetsModal`, เปลี่ยนเฉพาะ `chords` (`chordsPerBar: 1`, `chords: [chord]`) ของแต่ละห้องในท่อนนั้น **โดยคง `id`, `lyrics`, `vocalAudio` และ `melodyNotes` เดิมไว้ครบ** (และคงจำนวนห้องหากต้องการหรือยืด/หดแบบรักษาห้องเดิมไว้).
   - **Chord Audition ใน `ChordPickerModal.tsx` & `audioEngine.ts`:**
     - เพิ่ม `previewChord(chordSymbol: string, song: SongProject)` บน `AudioEngine` / `useAudioEngine` ใช้ Voicing กีตาร์จริงดีดคอร์ดตัวอย่างทันทีเมื่อผู้ใช้คลิกเลือกคอร์ดหรือแตะปุ่ม `/Bass` (เพิ่มปุ่ม `🔊 ฟังเสียงคอร์ด` หรือ Preview ก่อนกดยืนยันปิด Modal).
   - **ป้องกัน Sidebar/Modal แอบเขียนทับเพลงโดยไม่ตั้งใจ:**
     - ใน `SectionBuilder.tsx` ปุ่ม `🔊 ฟังจังหวะคำร้อง`: หาก `bar.melodyNotes.length === 0` ให้พรีวิวเสียงเมโลดี้ชั่วคราวผ่าน `engine` โดยไม่แอบ mutate `bar.melodyNotes` (หรือถาม/แสดง badge ชัดเจน).
     - ใน `AdvanceModeModal.tsx` ปุ่ม `🎤 AI ร้อง`: เก็บเสียงที่สังเคราะห์ไว้ใน `barVocalUrls` ของ Modal เพื่อพรีวิวก่อน และบันทึกเข้า `bar.vocalAudio` เฉพาะเมื่อผู้ใช้กดปุ่ม `💾 บันทึกเสียงนี้ลงห้อง` หรือ `✓ นำเนื้อร้องลงท่อนเพลง`!
     - ใน `EasyModeStarterModal.tsx`: เพิ่มตัวเลือกใน Stage 2 (`สร้างเป็นเพลงใหม่ในคลัง [แนะนำ]` vs `เขียนทับเพลงที่เปิดอยู่` พร้อม Auto-Checkpoint).
4. **อัปเกรด Studio Controls, Real Count-In LED, Metronome, Tap Tempo & Dark/Touch Polish:**
   - **Real Loading & Count-In State (`audioEngine.ts`, `useAudioEngine.ts`, `page.tsx`, `TransportBar.tsx`):**
     - เปิด `isLoading` (`state === 'loading'`) และ `isCountIn` จริงจาก `AudioEngine` (แทนที่ `const isCountIn = false;` ใน `page.tsx:256`) ส่งไปยัง `TransportBar` และ `KaraokeTeleprompter`.
     - แสดงข้อความ/Spinner `"กำลังโหลดเสียงเครื่องดนตรี..."` บนปุ่ม Play ขณะโหลด Soundfont ครั้งแรก.
   - **Metronome Click Toggle + Tap Tempo + Direct BPM Input (`TransportBar.tsx`, `audioEngine.ts`):**
     - เพิ่ม `metronomeEnabled?: boolean` ใน `SongProject` (หรือ Engine State) และปุ่ม `🥁 คลิกจังหวะ` (Metronome Click) ที่เปิดเสียงคลิกตามจังหวะได้ตลอดเวลา (ไม่ต้องรอแค่ Count-in).
     - เพิ่มปุ่ม **Tap Tempo** (คำนวณ BPM เฉลี่ยจากการเคาะ 3–4 ครั้ง) และช่องพิมพ์เลข BPM โดยตรง (`50–180`) ใน Popover BPM.
     - ผูกคลิกที่เลขห้อง (`Bar #`) กับ `engine.seekToBar(globalBarIndex)` เพื่อกระโดดไปเล่นห้องนั้นได้ทันที.
   - **Inline Play/Stop ใน `SoundCustomizerPanel.tsx`:**
     - เพิ่มปุ่ม Play/Stop กะทัดรัดใน Header ของ `SoundCustomizerPanel` + ปุ่ม **Solo (S)** ต่อแทร็ก และ Master Volume หรือให้ไม่บัง Transport.
   - **Touch & Dark Mode Fixes:**
     - ใน `MiniPianoRollModal.tsx` (บรรทัด 927): เปลี่ยนปุ่มปรับความยาวโน้ต `-`/`+` จาก `opacity-0 group-hover:opacity-100` เป็นแสดงผลชัดเจนบนจอสัมผัส (`opacity-100 sm:opacity-0 sm:group-hover:opacity-100`).
     - อัปเดตคลาสสีของ `AdvanceModeModal.tsx`, `MiniPianoRollModal.tsx`, `VocalRecorderModal.tsx` จาก `bg-white` / `bg-slate-50` / `text-slate-900` เป็น Semantic Tokens (`bg-surface-1`, `bg-surface-2`, `text-ink-900`, `border-hairline`) ให้ใช้งานใน Dark Mode ได้สบายตาทั้งแอป.

### การทดสอบ (`tests/phase8e.test.ts`)
- ทดสอบ `handleApplyPreset` คง `lyrics`, `vocalAudio` และ `melodyNotes` ของห้องเดิมครบ
- ทดสอบ `buildSongHistoryFingerprint` รวม `vocalTakes` และระบบ Coalesced Undo
- ทดสอบ Contract ของ `AudioEngine` (`isCountIn`, `previewChord`, `metronomeEnabled`), `ChordPickerModal`, `TransportBar` (`Tap Tempo`, `Metronome`), `SoundCustomizerPanel` (Inline Play/Stop), `MiniPianoRollModal` (Touch-visible controls) และ Dark Mode tokens ใน Modals
