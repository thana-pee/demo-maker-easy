# DEMO MAKER EASY — Implementation Control Plan

> **Version:** 1.0 (ประยุกต์จาก `TEMPLATE_IMPLEMENTATION_PLAN_v3.md`)
> **หลักคิด:** Plan → Review → Execute → Evidence → Verify → Approve → Next Phase
> Agent ห้ามถือว่า "ทำเสร็จ" = "ถูกต้อง" — Phase จะถือว่าเสร็จเมื่อมีหลักฐานตรงตาม Definition of Done และผ่านการตรวจรับจากเจ้าของโปรเจกต์เท่านั้น

---

## 0. PLAN CONTROL

| รายการ | ค่า |
|---|---|
| **Project** | Demo Maker Easy (Acoustic Songwriting Studio & Karaoke Teleprompter) |
| **Plan Version** | v1.0 |
| **Created** | 2026-11-12 |
| **Planning Agent** | Antigravity (Gemini) |
| **Implementation Agent** | Antigravity (ตามตาราง Phase Table หมวด 6) |
| **Reviewer** | Human (เจ้าของโปรเจกต์ตรวจ UX/UI และฟังมิติเสียงจริงทุก Phase) |
| **Environment** | Localhost Dev (`d:\Demo maker easy`) → Vercel Production |
| **Risk Level** | MEDIUM (Greenfield Web App; Phase 3A เมื่อต่อ Cloud DB ปรับเป็น HIGH) |
| **Status** | `AWAITING REVIEW` (รอเจ้าของโปรเจกต์อนุมัติแผนและหน้าตา UI Preview ก่อนเริ่ม Phase 1A) |

---

## 📐 1. SCOPE & CHANGE BOUNDARY

### 1.1 Objective
สร้างเว็บแอปพลิเคชันสตูดิโอแต่งเพลงและทำเดโม่เพลงอะคูสติก (**Demo Maker Easy**) ด้วย Next.js (App Router, TypeScript), Tailwind CSS และ Web Audio API ที่ออกแบบมาสำหรับผู้ใช้งาน 2 กลุ่มหลัก:
1. **ผู้สร้างเพลงบน PC (คุณ):** จัดโครงสร้างท่อนเพลง เลือกคอร์ดผ่าน Diatonic Chord Picker หรือสูตรทางคอร์ดสำเร็จรูป (Progression Presets) ปรับแต่งเนื้อเสียงกีตาร์ 3 ทรง + เบอร์สาย 2 ขนาด + มิติห้อง 3D (3D Stereo Soundstage) พร้อมมิกเซอร์ 4 เครื่องดนตรี บันทึกเมโลดี้คู่ขนาน (Mini Piano Roll & Mic Scratchpad) และส่งออกเป็นไฟล์เสียง **High-Quality 3D Stereo `.MP3`**, **Suno Prompt**, และ **`.MID` (MIDI)**
2. **ผู้ร้องและเล่นกีตาร์บน iPad (คุณพ่อและเพื่อนๆ):** เปิดลิงก์ที่แชร์ผ่าน LINE เข้าสู่ **โหมดหน้าจอคาราโอเกะขนาดใหญ่ (Karaoke Teleprompter Mode)** อ่านง่าย สบายตา มีเสียงนับเข้าเพลง (Count-in) และมีตัวช่วยทดคอร์ดคาโป้ (**Capo Helper**) สำหรับถือคาโป้เล่นกีตาร์จริงคลอตามได้ทันที

### 1.2 In Scope
- **Design System (Google Material 3 Clean Light Theme):** โทนสว่าง สะอาดตา ปุ่มสัมผัสขนาดใหญ่รองรับทั้งเมาส์บน PC และหน้าจอสัมผัสบน iPad
- **Dynamic Song Structure & Musical Controls:**
  - เพิ่ม/ลบ/สลับลำดับท่อนเพลง (`intro`, `verse`, `pre-chorus`, `chorus`, `solo`, `bridge`, `outro`) พร้อมระดับความหนักแน่น (`low`, `medium`, `high`) และ `soloMode` (`split-slow-fast`)
  - รองรับสัดส่วนจังหวะ **Time Signature (`4/4`, `3/4`, `6/8`)** และเสียงเคาะนับเข้าเพลง (**Count-in 1 ห้อง**)
  - ตั้งค่าต่อห้องเพลง: จำนวนคอร์ดต่อห้อง (`1` หรือ `2` คอร์ด), โหมดการเล่นประจำห้อง (`normal` ตีปกติ / `let-ring` ตีจังหวะเดียวค้างไว้สำหรับห้องส่ง-ห้องจบ / `break` หยุดเงียบ)
  - ตัวช่วยทางคอร์ด: **Diatonic Chord Picker**, **Progression Presets (สูตรคอร์ดฮิตประจำท่อน)**, **Transpose (-6 ถึง +6)**, และ **Capo Helper (ช่อง 0–7)**
- **3D Realistic Acoustic Audio Engine (`smplr` + Web Audio DSP):**
  - แหล่งกำเนิดเสียงเครื่องดนตรีจริงผ่านไลบรารี `smplr` (พร้อม Fallback Synth กรณีออฟไลน์ และแถบสถานะโหลดแซมเพิล)
  - **Guitar Chord Voicing 6 สาย** + **Strum Physics** (หน่วงเวลาแต่ละสาย 18–32ms + Humanize Velocity)
  - **DSP EQ Chain:** กีตาร์ 4 ทรง (`Classical Nylon`, `Dreadnought Steel`, `Ovation Roundback`, `Gibson Les Paul`) × เบอร์สาย 2 ขนาด (`.010 Standard`, `.012 Heavy Gauge`)
  - **3D Stereo Soundstage & Ambience:** จัดวางมิติเสียงซ้าย-ขวา (Stereo Panning / Haas Double-Tracking) และจำลองมิติห้อง 3 แบบ (`Warm Living Room`, `Wood Studio`, `Unplugged Concert Hall`)
  - **5-Track Instrument Mixer:** กีตาร์ริทึ่ม (คอร์ด), กีตาร์ลีด/โซโล่ (Gibson Les Paul / Acoustic Lead), เบสอะคูสติก, เปียโน, และเพอร์คัชชัน/กลอง พร้อมเลือกเปิด/ปิดอิสระในแต่ละท่อนเพลง
- **Library, Sharing & Export:**
  - สมุดเพลงในเครื่อง (`My Songs Library` บน `localStorage` เก็บได้หลายเพลง)
  - แชร์เพลงผ่านลิงก์สั้นส่ง LINE (บีบอัดด้วย `lz-string`), Export/Import `.json`, Export to Suno Modal, และ Export `.MID`
- **Dual Melody Capture & 3D MP3 Mixdown:**
  - Mini Piano Roll ประจำห้อง + อัดเสียงร้องฮัมผ่านไมค์ (`MediaRecorder`) + แถบชดเชยความหน่วง (`Latency Offset -150ms ถึง +150ms`) + เรนเดอร์รวมแทร็กเป็นไฟล์ **`.MP3` (192–320 kbps Stereo 3D)**

### 1.3 Explicitly Out of Scope (ในเฟส 1–2)
- ระบบล็อกอินสมาชิก (Authentication) และฐานข้อมูลออนไลน์ (จะอยู่ใน **Phase 3A** เมื่อต้องการทำห้องสมุดเพลงออนไลน์ร่วมกันผ่าน Supabase)
- การตัดต่อคลื่นเสียงหลายแทร็กแบบ DAW เต็มรูปแบบ (เราเน้นความง่ายและเร็วสำหรับการทำ Demo)

### 1.4 Change Budget & File Protection Rule
- ห้ามเพิ่ม npm package นอกเหนือจากที่ระบุในแต่ละ Phase โดยไม่ขออนุมัติก่อน
- **กฎเหล็กข้อ 9:** ไฟล์ที่ผ่านการอนุมัติใน Phase ก่อนหน้าแล้ว (เช่น `src/types/song.ts` หลังจบ 1A หรือ `src/lib/audioEngine.ts` หลังจบ 1B) หาก Phase ถัดไปจำเป็นต้องแตะ ต้องแสดง diff และเหตุผลชัดเจน ห้ามแอบแก้เงียบๆ

---

## 📌 2. HANDOFF SUMMARY (สำหรับ Agent ทุกตัวที่รับงานต่อ)

### 2.1 ข้อมูลโปรเจกต์และสภาพแวดล้อม

| รายการ | ข้อมูล |
|---|---|
| **โปรเจกต์** | Demo Maker Easy — สตูดิโอแต่งเพลงอะคูสติกและหน้าจอคาราโอเกะสำหรับครอบครัว |
| **Repo หลัก** | `d:\Demo maker easy` |
| **ใบควบคุมงาน** | `d:\Demo maker easy\IMPLEMENTATION_PLAN.md` |
| **บันทึกความคืบหน้า** | `d:\Demo maker easy\PROGRESS_LOG.md` |
| **Stack** | Next.js (App Router, TypeScript), Tailwind CSS, Lucide Icons, Web Audio API, `smplr`, `lz-string`, `midi-writer-js`, `lamejs` |
| **Runtime บนเครื่อง** | Node.js `v24.19.0`, npm `11.17.0`, Git `2.47.1` (ตรวจสอบยืนยันแล้ว — FACT) |
| **Deploy Target** | Vercel |

### 2.2 โครงสร้างข้อมูลกลางที่ห้ามเข้าใจผิด (`src/types/song.ts`)
> **สำคัญมาก:** ทุกโมดูล (UI, Audio Engine, URL Share, Suno Export, MIDI/MP3 Export) ต้องอ้างอิงโครงสร้าง `SongProject` นี้ตรงกัน ห้ามเปลี่ยนชื่อ field เอง:

```typescript
export type TimeSignature = '4/4' | '3/4' | '6/8';
export type SectionType = 'intro' | 'verse' | 'pre-chorus' | 'chorus' | 'solo' | 'bridge' | 'outro';
export type SectionIntensity = 'low' | 'medium' | 'high';
export type SoloMode = 'normal' | 'split-slow-fast';
export type BarPlayStyle = 'normal' | 'let-ring' | 'break';

export type GuitarModel = 'classical-nylon' | 'dreadnought-steel' | 'ovation-roundback';
export type StringGauge = 'standard-010' | 'heavy-012';
export type Ambience3DMode = 'living-room' | 'wood-studio' | 'unplugged-hall';

export type GuitarStyle = 'campfire-strum' | 'soft-strum' | 'fingerpicking';
export type BassStyle = 'root-fifth' | 'warm-sustain';
export type PianoStyle = 'warm-pad' | 'gentle-arpeggio';
export type DrumStyle = 'off' | 'shaker-cajon' | 'simple-kit';

export interface MelodyNote {
  step: number;       // ตำแหน่งเขบ็ตในห้อง (0 ถึง 7 หรือ 0 ถึง 15)
  midiPitch: number;  // เช่น 60 = C4
  durationSteps: number;
}

export interface SongBar {
  id: string;
  chordsPerBar: 1 | 2;
  chords: [string] | [string, string]; // เก็บคอร์ดตามคีย์เริ่มต้น (Base Key)
  playStyle: BarPlayStyle;             // 'normal' | 'let-ring' | 'break'
  lyrics: string;                      // 1 ห้องต่อ 1 ช่องเนื้อร้องเสมอ
  melodyNotes: MelodyNote[];           // รองรับ Mini Piano Roll
}

export interface SongSection {
  id: string;
  name: string;
  type: SectionType;
  intensity: SectionIntensity;
  soloMode?: SoloMode;
  bars: SongBar[];
}

export interface InstrumentMixerConfig {
  guitar: { enabled: boolean; volume: number; style: GuitarStyle };
  bass:   { enabled: boolean; volume: number; style: BassStyle };
  piano:  { enabled: boolean; volume: number; style: PianoStyle };
  drums:  { enabled: boolean; volume: number; style: DrumStyle };
}

export interface SongProject {
  id: string;
  version: number;                     // เริ่มที่ 1 สำหรับตรวจสอบความเข้ากันได้ของลิงก์แชร์
  title: string;
  updatedAt: string;
  bpm: number;                         // 50 - 160 (ค่าเริ่มต้น 74)
  timeSignature: TimeSignature;        // ค่าเริ่มต้น '4/4'
  baseKey: string;                     // ค่าเริ่มต้น 'C'
  transposeSemitones: number;          // -6 ถึง +6 (เปลี่ยนระดับเสียงจริง)
  capoFret: number;                    // 0 ถึง 7 (เปลี่ยนการแสดงผลฟอร์มคอร์ดสำหรับเล่นกีตาร์ตาม)
  countInEnabled: boolean;             // เปิด/ปิดเสียงเคาะนับเข้าเพลง 1 ห้อง
  guitarModel: GuitarModel;
  stringGauge: StringGauge;
  ambience3D: Ambience3DMode;
  mixer: InstrumentMixerConfig;
  sections: SongSection[];
  vocalLatencyOffsetMs?: number;       // -150 ถึง +150 ms สำหรับเฟส 2B
}
```

### 2.3 Next Step ทันที
- รอเจ้าของโปรเจกต์ตรวจ `ui_preview.html` และอนุมัติแผนนี้ (`APPROVED`) เพื่อเริ่ม **Phase 1A**

---

## 🗂️ 6. PHASE TABLE & MULTI-POOL QUOTA STRATEGY (แผนแบ่งเฟสและจัดสรรโควตาโมเดล)

> **กลยุทธ์บริหารโควตา 3 ก้อน (อิงตามโควตาจริงของบัญชี Google AI Pro):**
> 1. **ก้อน Gemini Models (`Gemini 3.8 Flash (High)`) — เหลือ 100% (รีเซ็ตทุก 5 ชม.):** ใช้เป็นม้างานหลักในเฟสที่โครงสร้างและสเปคชัดเจน (`1A`, `1C`, `2A`, `3A`) เร็วและประหยัดที่สุด
> 2. **ก้อน Claude & GPT (`Claude Sonnet 5.5 (High)` / `Claude Opus 5.5 (High)`) — เหลือ 100% (รีเซ็ตทุก 5 ชม.):** ใช้ในเฟสที่มีความซับซ้อนเชิงลึกด้าน Audio DSP / Buffer (`1B`, `2B`) เพื่อช่วยแบ่งเบาภาระโควตารายสัปดาห์ของ Argon
> 3. **ก้อน Gemini 4 Argon (`Gemini 4 Argon (High)`) — เหลือ 59% (โควตารายสัปดาห์):** เก็บไว้ใช้เฉพาะจังหวะวางแผนสถาปัตยกรรม หรือจุดที่ต้องการให้ตรวจแก้บักซับซ้อนเป็นพิเศษ

| Phase | ชื่องาน | ไฟล์หลักที่แตะ | โมเดลหลักที่แนะนำ (และตัวสำรองคนละก้อนโควตา) | Risk | ขนาด | สถานะ |
|---|---|---|---|---|---|---|
| **1A** | **Project Setup, Core Schema & Interactive UX/UI (`โหมดแต่งเพลง` + `โหมดคาราโอเกะ`)** | `src/types/song.ts`, `src/lib/chordUtils.ts`, `src/lib/defaultSong.ts`, `src/app/page.tsx`, `src/components/*` | **Gemini 3.8 Flash (High)** *(สำรอง: Claude Sonnet 5.5 High)* | LOW | M | ⏳ AWAITING REVIEW |
| **1B** | **3D Acoustic Audio Engine (`smplr` + 6-String Strum + Guitar/Gauge EQ + 3D Room + 4-Track Mixer + Count-in)** | `src/lib/audioEngine.ts`, `src/lib/guitarVoicings.ts`, `src/lib/dsp3d.ts` | **Claude Sonnet 5.5 (High)** หรือ **Gemini 4 Argon (High)** | MEDIUM | M | ⏳ NOT STARTED |
| **1C** | **My Songs Library, LINE Share Link (`lz-string`), Suno Prompt & MIDI (`.MID`) Export** | `src/lib/storage.ts`, `src/lib/exporters.ts`, `src/components/ExportModal.tsx`, `src/components/SongLibraryModal.tsx` | **Gemini 3.8 Flash (High)** | LOW | S | ⏳ NOT STARTED |
| **2A** | **Mini Piano Roll (จิ้มโน้ตเมโลดี้ไกด์ประจำห้อง + เล่นเสียงเมโลดี้คู่ดนตรี)** | `src/components/MiniPianoRollModal.tsx`, `src/lib/audioEngine.ts` | **Gemini 3.8 Flash (High)** *(สำรอง: Claude Sonnet 5.5 High)* | MEDIUM | M | ⏳ NOT STARTED |
| **2B** | **Mic Audio Scratchpad + Latency Offset Slider + High-Quality 3D Stereo `.MP3` Mixdown** | `src/lib/micRecorder.ts`, `src/lib/mp3Exporter.ts`, `src/components/VocalRecorderBar.tsx` | **Claude Sonnet 5.5 (High)** หรือ **Gemini 4 Argon (High)** | MEDIUM | M | ⏳ NOT STARTED |
| **3A** | **PWA (ติดตั้งลง iPad/มือถือ), สลับภาษา TH/EN, และเตรียมเชื่อม Cloud Library (Supabase)** | `public/manifest.json`, `src/lib/i18n.ts`, `src/lib/cloudSync.ts` | **Gemini 3.8 Flash (High)** | MEDIUM | M | ⏳ NOT STARTED |
