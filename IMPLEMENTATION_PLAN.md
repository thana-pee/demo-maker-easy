# DEMO MAKER EASY — As-Built Master Plan & Architectural Specification

> **Version:** 2.0 (As-Built Complete Specification)  
> **Last Updated:** 2026-11-12  
> **Live Production URL:** [https://demo-maker-easy-symd.vercel.app](https://demo-maker-easy-symd.vercel.app)  
> **GitHub Repository:** [https://github.com/thana-pee/demo-maker-easy](https://github.com/thana-pee/demo-maker-easy)  
> **Stack:** Next.js 16.4.6 (Turbopack, App Router), TypeScript, Tailwind CSS, Web Audio API, `@breezystack/lamejs`, `midi-writer-js`, `lz-string`  
> **Overall Status:** ✅ ALL PHASES COMPLETED & DEPLOYED TO PRODUCTION

---

## 📌 0. PROJECT OVERVIEW & AS-BUILT HIGHLIGHTS

**Demo Maker Easy** คือเว็บแอปพลิเคชันสตูดิโอแต่งเพลงอะคูสติกและหน้าจอคาราโอเกะ (Acoustic Songwriting Studio & Karaoke Teleprompter) ที่ออกแบบมาเพื่อแก้ไขปัญหาการทำเดโม่เพลงอะคูสติกให้เสร็จไว ได้มิติเสียงธรรมชาติสมจริง และแชร์ให้ผู้ร้อง/นักดนตรีเปิดเล่นตามบน iPad ได้ทันที

### ความสามารถหลักที่สร้างเสร็จสมบูรณ์ 100%:
1. **Realistic 3D Acoustic & Electric Guitar Engine:**
   - กีตาร์ 4 โมเดล: `Classical Nylon` (สายเอ็นนุ่ม), `Dreadnought Steel` (สายเหล็กแน่น), `Ovation Roundback` (หลังเต่าใสคม), และ `Gibson Les Paul` (Humbucker อิ่มหนา Sustain ยาว พร้อมเอฟเฟกต์ Clean / Warm Overdrive / Saturated Fuzz)
   - ขนาดเบอร์สาย 2 ขนาด: `Standard .010` (สบายนิ้ว พริ้วเบา) และ `Heavy Gauge .012` (บูสต์ Low-Mid +3dB, Sustain ยาวขึ้น 25%)
   - ระบบมิติเสียงห้อง 3D (Binaural & Reverb Convolver): `Warm Living Room`, `Wood Studio`, และ `Unplugged Concert Hall`
   - กีตาร์คู่ (Dual Guitar Architecture): กีตาร์ริทึ่มตีคอร์ด + กีตาร์ลีดเล่นเมโลดี้/โซโล่แยกอิสระ
2. **7-Track Acoustic Mixer & Arrangement:**
   - มิกเซอร์รวม 7 แทร็ก: กีตาร์ริทึ่ม, กีตาร์ลีด, เบสโปร่ง, เปียโนคอร์ด, กลองคาฮอน/เชกเกอร์, โน้ตทำนองไกด์, และเสียงร้องจริงที่อัดไว้
   - เลือกเปิด/ปิดและปรับสไตล์การเล่นได้อิสระในแต่ละท่อนเพลง (Per-Section Playing Style Selection)
3. **Songwriting & Musical Helpers:**
   - Diatonic Chord Picker (คอร์ดตรงตามคีย์ ไม่หลุดสเกล) + Custom Chords
   - Formula Presets: สูตรทางคอร์ดฮิตประจำท่อน (ป๊อป, โฟล์ค, ซึ้ง 90s, อาร์แอนด์บี)
   - Transpose (-6 ถึง +6 เซมิโทน) เปลี่ยนระดับเสียงจริง
   - Capo Helper (ช่อง 0 ถึง 7): แสดงรูปคอร์ดที่จับจริงตามช่องคาโป้ ช่วยให้นักดนตรีจับรูปคอร์ดง่ายๆ คลอตามได้ทันที
   - จังหวะรองรับ `4/4`, `3/4` (วอลทซ์), และ `6/8` (เพลงช้า 90s) พร้อมเสียงนับเข้า (Count-in)
4. **Dual Melody Capture:**
   - **Mini Piano Roll:** หน้าต่างจิ้มโน้ตทำนองร้องไกด์รายห้อง มีแถบล็อคคีย์และเน้นโน้ตในคอร์ด (In-Key Snap & Chord Tone Highlight) พร้อมตัวเลือกเสียงเครื่องดนตรีทำนอง (Flute vibrato, Piano, Warm Bell)
   - **Mic Audio Scratchpad:** อัดเสียงร้องสด/ฮัมไกด์ผ่านไมโครโฟนรายห้อง พร้อมตัวนับถอยหลัง 3-2-1 และแถบไฟ VU Meter เรียลไทม์ (0–100%)
   - **Vocal Latency Offset Slider (-150ms ถึง +150ms):** แก้ปัญหาเสียงร้องเหลื่อมเวลาต่อหูฟังบลูทูธหรือไมค์ดีเลย์
5. **Multi-Format Export & Lossless Sharing:**
   - **LINE Share Link:** บีบอัดโครงสร้างเพลงทั้งเพลงลงใน URL-Safe string ด้วย `lz-string` ส่งเข้า LINE เปิดฟังและแก้ต่อได้ทันที
   - **Standard MIDI File (.MID):** ส่งออก 6 แทร็กมาตรฐาน (SMF Format 1) นำเข้า Logic, Cubase, GarageBand, หรือ FL Studio ได้ทันที
   - **High-Quality 3D Stereo .MP3 Mixdown (192 kbps):** เรนเดอร์รวมทุกแทร็กและเสียงร้องสดผ่าน Web Audio OfflineContext ออกมาเป็นไฟล์ MP3 บนเครื่อง
   - **Suno AI Prompt:** สร้างพร้อมพ์สไตล์ดนตรีและแท็กเนื้อเพลงนำไปเจนเพลงใน Suno ได้ทันที
6. **Mobile/iPad Polish, PWA & Bilingual (TH/EN):**
   - Progressive Web App: ติดตั้งลงหน้าจอโฮมของ iPad / iPhone / Android ได้ทันที เปิดเต็มจอ 100% ไม่มีแถบเบราว์เซอร์มากวนตา
   - ปุ่มสลับภาษาแบบคลิกเดียว: 🇹🇭 ไทย / 🇬🇧 English รองรับการใช้งานสากล
   - Karaoke Teleprompter Mode: ตัวหนังสือคอร์ดและเนื้อเพลงขนาดใหญ่ เลื่อนตามบีตดนตรีจริง เหมาะมากสำหรับการวาง iPad บนขาตั้งโน้ต

---

## 🏗️ 1. ARCHITECTURE & CODEBASE STRUCTURE

```
d:\Demo maker easy/
├── public/
│   ├── icons/                   # PWA Icons (192x192, 512x512, apple-touch-icon)
│   ├── manifest.json            # PWA Web App Manifest (display: standalone)
│   └── sw.js                    # Service Worker (Cache & offline shell)
├── src/
│   ├── app/
│   │   ├── layout.tsx           # PWA metadata, viewport-fit=cover, LanguageProvider
│   │   ├── globals.css          # Tailwind, touch-action: manipulation, iOS safe areas
│   │   └── page.tsx             # Main Application Container & Transport Orchestrator
│   ├── components/
│   │   ├── TransportBar.tsx     # Sticky Play/Stop, BPM, TimeSig, Key, Capo, Language Toggle
│   │   ├── SoundCustomizerPanel.tsx # 3D Guitar Body, Gauges, Room, 7-Track Mixer
│   │   ├── SectionBuilder.tsx   # Visual Song Arranger, Bars, Chords, Lyrics, Mini Piano/Mic triggers
│   │   ├── KaraokeTeleprompter.tsx # Fullscreen live prompter for iPad stand
│   │   ├── MiniPianoRollModal.tsx  # In-key Piano Roll Melody Note Editor
│   │   ├── VocalRecorderModal.tsx  # Mic Recording Studio with VU Meter & Latency Compensation
│   │   ├── ChordPickerModal.tsx    # Diatonic Chord & Root selector
│   │   ├── ProgressionPresetsModal.tsx # Acoustic Chord progression formulas
│   │   ├── ExportModal.tsx      # MP3 192kbps, MIDI, LINE Link, Suno Prompt
│   │   ├── SongLibraryModal.tsx # Local multi-song project storage & JSON import/export
│   │   ├── PwaInstallPrompt.tsx # Smart iPad/iPhone & Android install prompts
│   │   └── ServiceWorkerRegister.tsx # Client-side SW registration
│   ├── context/
│   │   └── LanguageContext.tsx  # React context for instant TH/EN switching
│   ├── hooks/
│   │   └── useAudioEngine.ts    # React hook binding UI to AudioEngine lifecycle
│   ├── lib/
│   │   ├── audioEngine.ts       # Web Audio API engine, sample synth & vocal player
│   │   ├── barPlanner.ts        # Bar event scheduling, humanized velocity, let-ring, break
│   │   ├── guitarVoicings.ts    # 6-string acoustic guitar chord voicings & strum physics
│   │   ├── dsp3d.ts             # 3D spatial soundstage & impulse response reverb
│   │   ├── chordUtils.ts        # Transpose logic, Capo calculation, Diatonic matrix
│   │   ├── melodyUtils.ts       # Pitch classes, scale snap, chord tone detection
│   │   ├── micRecorder.ts       # MediaRecorder mic capture with real-time VU meter
│   │   ├── mp3Exporter.ts       # Multi-track OfflineAudioContext MP3 mixdown engine
│   │   ├── midiExport.ts        # SMF Format 1 multi-track MIDI file generator
│   │   ├── shareUrl.ts          # URL-Safe lossless LZ-string compression
│   │   ├── storage.ts           # LocalStorage song project persistence
│   │   ├── cloudSync.ts         # Supabase / Cloud Library readiness adapter
│   │   ├── i18n.ts              # Bilingual dictionary and storage
│   │   └── defaultSong.ts       # Preloaded acoustic demo song
│   └── types/
│       └── song.ts              # Canonical TypeScript data contracts
└── tests/
    ├── phase1b.test.ts          # Voicing, Strumming, DSP, Let-ring, Break tests
    ├── phase1c.test.ts          # Storage, MIDI export, URL share tests
    ├── phase2a.test.ts          # Piano roll, scale snap, melody planner tests
    ├── phase2b.test.ts          # Mic recorder, MP3 sync word, vocal latency tests
    └── phase3a.test.ts          # i18n symmetry, PWA manifest, PNG signatures, cloud sync tests
```

---

## 📊 2. VERIFIED TEST MATRIX & QUALITY STATUS

| Category | Test Suite | Tests Count | Status |
|---|---|---|---|
| **Chord Voicings & Strumming** | `tests/phase1b.test.ts` | 24 | ✅ PASS (100%) |
| **Storage & Export (MIDI / URL)** | `tests/phase1c.test.ts` | 6 | ✅ PASS (100%) |
| **Melody Guide & Piano Roll** | `tests/phase2a.test.ts` | 9 | ✅ PASS (100%) |
| **Mic Recording & MP3 Mixdown** | `tests/phase2b.test.ts` | 4 | ✅ PASS (100%) |
| **PWA, i18n & Cloud Readiness** | `tests/phase3a.test.ts` | 6 | ✅ PASS (100%) |
| **Total Test Suite** | `npx tsx --test tests/*.test.ts` | **49 Tests** | **✅ 49/49 PASS (100%)** |
| **Production Build** | `npm run build` | Next.js 16.4.6 | **✅ 0 Errors, 4/4 Static Prerendered** |

---

## 🎯 3. GUIDE FOR CODE REVIEW & AUDIT AGENTS

หากคุณเป็น AI Agent หรือวิศวกรที่เข้ามาทำ Code Review / Security Audit / UX Audit โปรเจกต์นี้:
1. **Source Code:** โค้ดทั้งหมดอยู่ในไดเรกทอรี `src/` ตามโครงสร้างหมวด 1
2. **Data Contracts:** ดูแกนกลางข้อมูลเพลงได้ที่ `src/types/song.ts` (`SongProject`, `SongSection`, `SongBar`, `InstrumentMixerConfig`)
3. **Sound Engine:** ดูการจัดการ AudioBuffer และ Web Audio DSP ได้ที่ `src/lib/audioEngine.ts`, `src/lib/guitarVoicings.ts`, และ `src/lib/mp3Exporter.ts`
4. **Offline / PWA:** ดูโครงสร้าง Service Worker ที่ `public/sw.js` และ Manifest ที่ `public/manifest.json`
5. **Live Verification:** ทดสอบการทำงานจริงบนเว็บเบราว์เซอร์หรือเครื่อง iPad ได้ที่ [https://demo-maker-easy-symd.vercel.app](https://demo-maker-easy-symd.vercel.app)
