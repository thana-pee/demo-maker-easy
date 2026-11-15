# 🎼 PHASE 7 MASTER PLAN — Studio Realism, Thai Band Grooves & Demo-to-Master AI Pipeline

> **เอกสารแผนแม่บทฉบับสมบูรณ์สำหรับเริ่มลงมือทำในแชตใหม่ (Hydrogen-Extra Ready Blueprint)**
> สร้างต่อจากสถานะ **[Phase 6C] PASS** (144/144 Unit & Integration Tests ผ่าน, `eslint` 0 warnings, `next build` ผ่าน)

---

## 🎯 เป้าหมายหลักของ Phase 7

1. **เพิ่ม 2 ตำนานนักแต่งเพลงไทยที่ผู้ใช้ร้องขอ:** **แอ๊ด คาราบาว** (`aed-carabao` — สามช่า/เพื่อชีวิต/โฆษณาคมคายติดหู) และ **อัสนี โชติกุล** (`asanee-chotikul` — ร็อกคำซ้ำตอกย้ำ/จิ๊กโก๋อกหัก/เชียร์พลังสูง)
2. **อุดรอยต่อ UX คนแต่งเพลงจริง (Phase 7A & 7B):** Real-time Rhyme & Syllable HUD บนการ์ดห้องเพลง, ส่งสัมผัสข้ามท่อน, แก้เนื้อแบบแผ่นเดียว (`Sheet Mode`), ปุ่มปัดคำท้ายลงห้องถัดไป, ระบบ `Undo / Redo` (`Ctrl+Z` / `Ctrl+Y`), และปุ่มวนลูปเฉพาะห้อง/ท่อน + ฟังจังหวะคำร้อง (0 เครดิต)
3. **อัปเกรดเครื่องดนตรีและการผสมวงให้เดโมใกล้เคียงงานจริง (Phase 7C):** แยกเวทีเสียง Stereo (`Guitar ซ้าย` / `Piano ขวา`), แยกย่าน EQ เบสไม่ตีกับเปียโน, เพิ่มเสียงกลอง (`openHat`, `tomHigh`, `tomLow`, `woodblock`), เพิ่มจังหวะไทยสมจริง (`ลูกทุ่งสามช่า/โจ๊ะ`, `R&B Neo-Soul`, `Thai Rock Drive`), ระบบเครื่องดนตรีฟังกันเอง (`Call-and-Response Lead Guitar`), และปุ่มจัดวงอัตโนมัติ 1 คลิก
4. **ปุ่มพิเศษ "AI Studio Master from Demo" + สุ่มวรรค 3 ตัวเลือก (Phase 7D):** ส่ง **พิมพ์เขียวเดโมทั้งเพลง (Full Demo Blueprint)** จากโปรเจกต์ของเราไปยัง `lyria-3.5` (`/api/advance/reference-track`) เพื่อสังเคราะห์เพลงเต็มคุณภาพห้องอัดที่ยึดคอร์ด เนื้อร้อง โครงสร้างท่อน และสไตล์วงตามเดโมจริง + ปุ่มสุ่ม 3 ตัวเลือกเฉพาะ 1 ห้อง (`singleBarIndex`) + ป้ายอารมณ์คอร์ด

---

## 🛡️ กฎเหล็ก (Invariants) ที่ห้ามละเมิดทุกเฟส

1. **ห้ามทำเทสต์เก่า (Phase 1A – 6C, 144 ข้อ) พังเด็ดขาด:**
   - `getSyllableBudgetForBpm(74, '4/4')` และ `buildLyricsSystemPrompt({ bpm: 74, timeSignature: '4/4', sectionType: 'chorus' })` ต้องยังมีข้อความ `'5-8 พยางค์'` ปรากฏอยู่เสมอ (รักษา [tests/phase5a.test.ts](tests/phase5a.test.ts))
   - `validateThaiLyricCouplets()` ต้องเก็บ `duplicateEndWords` เป็นข้อมูลแจ้งเตือน/Telemetry เท่านั้น **ห้าม** ทำให้ `passed: false` เพียงเพราะคำท้ายซ้ำ (รักษา [tests/phase5b.test.ts](tests/phase5b.test.ts))
   - `src/lib/barPlanner.ts` ต้องเป็น **Pure & Deterministic 100%** (ใช้ `ctx.rng()` จาก `mulberry32` เท่านั้น ห้ามใช้ `Math.random()`) และ **ห้ามแก้** จังหวะ/จำนวน Event ของสไตล์เดิมทั้ง 9 แบบ (`campfire-strum`, `soft-strum`, `fingerpicking`, `root-fifth`, `warm-sustain`, `warm-pad`, `gentle-arpeggio`, `shaker-cajon`, `simple-kit`)
2. **Gemini API Cost Guard Rule:**
   - ห้ามสั่งรันคำสั่งที่ยิง `GEMINI_API_KEY` ออกนอกเครื่องแบบเงียบๆ โดยไม่ได้รับการยืนยันจากผู้ใช้ และห้าม Print หรือ Log ค่า `GEMINI_API_KEY` เด็ดขาด (การเขียนโค้ด แก้ไฟล์ รัน `npm test` / `eslint` / `build` แบบใช้ Simulated Fallback ไม่ใช้ Key สามารถทำได้ทันที)
3. **เกณฑ์ตรวจรับทุกจบเฟส (Verification Gate):**
   - ต้องรันผ่านครบ 3 คำสั่งหลังแก้ไขล่าสุดของแต่ละเฟส:
     1. `npm test` (`npx tsx --test tests/*.test.ts`) -> 0 failed
     2. `npx eslint . --max-warnings=0` -> 0 errors, 0 warnings
     3. `npm run build` -> TypeScript & Next.js build ผ่านทุก Route
   - อัปเดตบันทึกความคืบหน้าลงใน `PROGRESS_LOG.md`

---

## 🎸 Phase 7A: 2 ตำนานนักแต่งเพลง (`aed-carabao`, `asanee-chotikul`) + Real-Time HUD & Sheet Editor

### 1. เพิ่มสไตล์ แอ๊ด คาราบาว & อัสนี โชติกุล
- **ไฟล์ `src/types/song.ts` (ประมาณบรรทัด 17–34):**
  - เพิ่ม `'aed-carabao'` และ `'asanee-chotikul'` ลงใน `ThaiSongwriterStyle` (รวมเป็น 18 สไตล์)
- **ไฟล์ `src/lib/aiPrompts.ts`:**
  - เพิ่มใน `SONGWRITER_STYLE_PROFILES`:
    1. `id: 'aed-carabao'`
       - Label: `'คมคายสามช่า/เพื่อชีวิต/โฆษณาติดหู (แรงบันดาลใจ แอ๊ด คาราบาว)'`
       - Core Guidance: ใช้ภาษาชาวบ้านคมชัด ทรงพลังเหมือนคำขวัญ/สโลแกนที่จำแม่นตั้งแต่ฟังครั้งแรก เล่าเรื่องวิถีชีวิต สู้ชีวิต สังคม หรือสารโฆษณาด้วยจังหวะสามช่าโจ๊ะสนุก มีคำคล้องจองในวรรคและคำสร้อยปลุกพลัง
    2. `id: 'asanee-chotikul'`
       - Label: `'ร็อกคำซ้ำตอกย้ำ/จิ๊กโก๋อกหัก/เชียร์พลังสูง (แรงบันดาลใจ อัสนี โชติกุล)'`
       - Core Guidance: เด่นเรื่อง **"การซ้ำวลีสั้น 2–4 พยางค์ตอกย้ำอารมณ์ใน Bar 1 และ Bar 4"** (เช่น ย้ำคำสั้นสองจังหวะแล้วขยี้ประโยคสรุป) ภาษาลูกผู้ชายตรงไปตรงมา อบอุ่นปนเท่ เจ็บแต่ไม่ฟูมฟาย พร้อมเว้นหางเสียงท้ายห้องให้กีตาร์ลีดโซโล่รับได้ลงตัว
  - เพิ่ม 4-bar exemplars ของทั้ง `'aed-carabao'` และ `'asanee-chotikul'` ลงใน `MASTER_LYRIC_FEW_SHOT_BANK.songwriters`
  - อัปเดต `getSyllableBudgetForBpm(bpm, timeSignature, options?)`:
    - ถ้า `options?.songwriterStyle === 'aed-carabao'`: เปิดช่วง `6–11` พยางค์/ห้อง สำหรับจังหวะสามช่า/คำขวัญคล้องจอง
    - ถ้า `options?.songwriterStyle === 'asanee-chotikul'`: ใช้ช่วง `5–9` พยางค์/ห้อง สำหรับคำซ้ำตอกย้ำและช่องว่างให้กีตาร์รับ (ยังคงรักษาเคส `74 BPM` ที่ไม่มี `songwriterStyle` ให้มี `'5-8 พยางค์'` เหมือนเดิม)
- **ไฟล์ `src/lib/songArchitect.ts`:**
  - เพิ่ม `'aed-carabao'` และ `'asanee-chotikul'` ในรายการ `VALID_SONGWRITER_STYLES` (หรือเซ็ตตรวจสอบสไตล์)
  - เพิ่มเนื้อจำลองเฉพาะตัวสำหรับทั้ง 2 สไตล์ใน `buildStyledSimulatedSongLyrics` (ครอบคลุม `verse`, `pre-chorus`, `chorus`, `bridge`, และ `outro` ที่ไม่เป็นค่าว่าง)

### 2. เชื่อม Real-Time Songwriter HUD & Sheet Lyric Editor ใน UI
- **ไฟล์ `src/lib/sectionUtils.ts`:**
  - Export Pure Function ใหม่:
    ```ts
    export function shiftLastTokenToNextBar(bars: SongBar[], fromBarIndex: number): SongBar[]
    ```
    หน้าที่: ตัดคำ/พยางค์สุดท้ายออกจาก `bars[fromBarIndex].lyrics` (ถ้ามีช่องว่าง ใช้คำหลังช่องว่างสุดท้าย; ถ้าติดกัน ใช้ `segmentThaiWordToSyllables` ดึงพยางค์สุดท้าย) แล้วย้ายไปต่อไว้หน้าสุดของ `bars[fromBarIndex + 1].lyrics` โดยคงค่า `chords`, `melodyNotes`, `vocalAudio` ของทุกห้องไว้ครบ
- **ไฟล์ `src/components/SectionBuilder.tsx`:**
  1. **Real-Time Style & Section Syllable Budget (บรรทัด ~250 และในลูป Section/Bar ~1622–1626, ~1948–1965):**
     - เปลี่ยนจาก `bpmBudget` ตัวเดียวระดับเพลง มาคำนวณระดับท่อน `sectionBudget = getSyllableBudgetForBpm(song.bpm, song.timeSignature, { sectionType: section.type, songwriterStyle: song.songwriterStyle, thaiGenre: song.thaiGenre })`
     - ในแต่ละ Bar ใช้ `const barSlot = sectionBudget.barBudgets?.[barIndex];` แสดงช่วงพยางค์ `/{barSlot?.min ?? sectionBudget.min}-{barSlot?.max ?? sectionBudget.max}` พร้อม Tooltip อธิบายบทบาทของห้องนั้น
  2. **Real-Time Section Rhyme & Flow Badge (0 เครดิต) บนหัวท่อน:**
     - นำเข้า `validateThaiLyricCouplets` จาก `@/lib/thaiRhymeHelper`
     - เมื่อท่อนนั้นมีเนื้อร้อง >= 2 ห้อง คำนวณผลตรวจสัมผัสและแสดง Badge:
       - `chainContinuityRatio >= 0.67`: `🔗 สัมผัสต่อเนื่อง {pct}%` (สีเขียว/คราม)
       - `< 0.67`: `⚠️ สัมผัสขาดวรรค {weakPairs}` (สีอำพัน)
       - ถ้ามี `duplicateEndWords.length > 0`: ป้ายเตือนคำลงท้ายซ้ำ
  3. **Cross-Section Rhyme Link (`barIndex === 0`):**
     - ใน `SectionBuilder.tsx` (บรรทัด ~1631) ถ้า `barIndex === 0` และ `sectionIndex > 0` ให้ดึงห้องสุดท้ายของท่อนก่อนหน้ามาเป็น `prevBar` เพื่อให้ห้องแรกของท่อนใหม่กด `🔗 สัมผัสต่อจากวรรคก่อน` รับสัมผัสข้ามท่อนได้จริง
  4. **Sheet Lyric Edit Mode & ปุ่ม `⤵ ปัดคำท้ายลงห้องถัดไป`:**
     - เพิ่มปุ่มบนหัวท่อน `📝 แก้แบบแผ่นเดียว` สลับดู/พิมพ์เนื้อร้องทุกห้องของท่อนนั้นใน `textarea` เดียวแบบแบ่งบรรทัด อัปเดตกลับลง `section.bars[i].lyrics` แบบเรียลไทม์
     - บนแต่ละห้อง (ยกเว้นห้องสุดท้ายของท่อน) ถ้ามีเนื้อร้อง >= 2 หน่วยคำ ให้แสดงปุ่มเล็ก `⤵ ปัดคำลง` เรียก `shiftLastTokenToNextBar`

### 3. เทสต์รับรอง Phase 7A (`tests/phase7a.test.ts`)
- ทดสอบ `aed-carabao` & `asanee-chotikul` ใน `buildLyricsSystemPrompt`, `MASTER_LYRIC_FEW_SHOT_BANK`, `getSyllableBudgetForBpm`, และ `buildStyledSimulatedSongLyrics`
- ทดสอบ `shiftLastTokenToNextBar` (รักษา chords/melodyNotes และย้ายคำถูกต้อง)
- ทดสอบ Contract ของ `SectionBuilder.tsx` ว่าใช้ `validateThaiLyricCouplets` และส่ง `sectionType`/`songwriterStyle` เข้า `getSyllableBudgetForBpm`

---

## ⏪ Phase 7B: Studio Undo/Redo Stack + Single-Bar Loop & 0-Credit Syllable Rhythm Preview

### 1. ระบบ Studio History (`Undo / Redo`)
- **ไฟล์ `src/app/page.tsx`:**
  - เพิ่ม `undoStackRef = useRef<SongProject[]>([])`, `redoStackRef = useRef<SongProject[]>([])` (`MAX_HISTORY = 30`), และ State `canUndo`, `canRedo`
  - ห่อ `setSong` ในฟังก์ชัน `updateSongWithHistory` (เปรียบเทียบ Serialized snapshot ของ `title/bpm/timeSignature/baseKey/transposeSemitones/capoFret/sections/mixer/thaiGenre/songwriterStyle/emotionalResolution` เพื่อไม่เก็บก้าวซ้ำที่ไม่ได้แก้จริง และจำกัด 30 ก้าว)
  - สร้าง `handleUndo` / `handleRedo` (sync state + toast สั้นๆ หรืออัปเดต engine แบบ live ด้วย `engine.updateSong` ผ่าน `useEffect` เดิม) และส่งให้ `TransportBar`
- **ไฟล์ `src/components/TransportBar.tsx`:**
  - เพิ่ม optional props `canUndo?: boolean`, `canRedo?: boolean`, `onUndo?: () => void`, `onRedo?: () => void`
  - แสดงปุ่ม Undo (`Undo2`) และ Redo (`Redo2`) ใน Header Row
  - ใน `handleKeyDown` (บรรทัด ~138–165): เมื่อ `!isTyping` ผูก `(e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z'` (ถ้า `e.shiftKey` เรียก `onRedo?.()` มิฉะนั้น `onUndo?.()`) และ `(e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y'` เรียก `onRedo?.()`

### 2. Single-Bar / Section Loop & ฟังจังหวะคำร้องทันที (0 เครดิต)
- **ไฟล์ `src/lib/audioEngine.ts` & `src/hooks/useAudioEngine.ts`:**
  - เพิ่ม `export interface LoopRange { startBar: number; endBar: number }` และฟิลด์ `private loopRange: LoopRange | null = null` บน `AudioEngine` พร้อมเพิ่มใน `EngineStatus` (`loopRange?: LoopRange | null`)
  - เพิ่มเมธอด `setLoopRange(range: LoopRange | null)` และส่งออกผ่าน `AudioEngineHookResult` ใน `useAudioEngine.ts` (และ `stop()` ควรเคารพหรือรีเซ็ตเมื่อผู้ใช้กดยกเลิก Loop อย่างชัดเจน)
  - ในตัวจัดตารางเปลี่ยนห้องของ `AudioEngine`: เมื่อถึง `activeBarIndex >= this.loopRange.endBar` และเปิด `this.loopRange` อยู่ ให้กำหนด `nextBar = this.loopRange.startBar` แทนการจบเพลงหรือเดินเลยท่อน
- **ไฟล์ `src/components/SectionBuilder.tsx`:**
  - รับ optional props `loopRange?: { startBar: number; endBar: number } | null`, `onToggleLoopRange?: (range: { startBar: number; endBar: number } | null) => void`, `onPlayBarFromIndex?: (globalBarIndex: number) => void` (ต่อสายจาก `page.tsx`)
  - เพิ่มปุ่ม `🔁 ลูปห้องนี้` บน Footer/Header ของการ์ดห้องเพลง และ `🔁 ลูปท่อนนี้` บนหัวท่อน (คลิกซ้ำเพื่อยกเลิก Loop)
  - เพิ่มปุ่ม `🔊 ฟังจังหวะคำร้อง` (0 เครดิต) บนห้องที่มีเนื้อร้อง: หาก `bar.melodyNotes.length === 0` ให้สร้างไกด์เมโลดี้ด้วย `generateLyricAlignedGuideMelody(bar.lyrics, bar.chords[0] || song.baseKey, { chord2: bar.chords[1], chordsPerBar: bar.chordsPerBar, sectionType: section.type, barIndex, totalBars: section.bars.length })` บันทึกลงห้องนั้น แล้วเปิดเล่นลูปห้องนั้นทันที

### 3. เทสต์รับรอง Phase 7B (`tests/phase7b.test.ts`)
- ทดสอบ `EngineStatus` / `AudioEngine` loop range wrapping logic (หากแยก helper pure function `resolveNextBarIndex(currentBar, totalBars, loopRange)` ออกมาจะทดสอบแบบ Pure Unit Test ได้แม่นยำ 100%)
- ทดสอบ Contract ของ `TransportBar.tsx` (Undo/Redo buttons + Ctrl+Z/Y shortcuts), `page.tsx` history wiring, และ `SectionBuilder.tsx` loop & rhythm preview buttons

---

## 🥁 Phase 7C: อัปเกรดเครื่องดนตรี การผสมวง (Studio Mix & Interplay) และจังหวะดนตรีไทยสมจริง

> **จุดเน้นสำคัญ:** ทำให้เสียงแบ็กกิ้งเดโมฟังเหมือนวงดนตรีจริงที่จัดตำแหน่งสเตอริโอ แบ่งย่านความถี่ และเล่นขานรับกับเสียงร้อง ไม่กวนกัน

### 1. ขยายชนิดข้อมูลเครื่องดนตรีใน `src/types/song.ts` & `src/lib/barPlanner.ts`
- **`src/types/song.ts` (บรรทัด 64–69)** — คงค่าเดิมทั้งหมดไว้ครบ แล้วเพิ่มสไตล์ใหม่:
  ```ts
  export type GuitarStyle = 'campfire-strum' | 'soft-strum' | 'fingerpicking' | 'lukthung-bounce' | 'rock-power';
  export type BassStyle = 'root-fifth' | 'warm-sustain' | 'lukthung-groove' | 'rnb-syncopated';
  export type PianoStyle = 'warm-pad' | 'gentle-arpeggio' | 'rnb-neo-chord' | 'rock-organ-pad';
  export type DrumStyle = 'off' | 'shaker-cajon' | 'simple-kit' | 'lukthung-3cha' | 'rnb-pocket' | 'rock-drive';
  ```
- **`src/lib/barPlanner.ts` (บรรทัด 45–53):**
  - ขยาย `DrumVoice` เพิ่ม: `| 'openHat' | 'tomHigh' | 'tomLow' | 'woodblock'`

### 2. Studio Mixing & Frequency Carving ใน `src/lib/audioDspShared.ts` & `src/lib/audioEngine.ts`
1. **แก้ Stereo Pan Collision (`src/lib/audioDspShared.ts` บรรทัด 38–45):**
   - เดิม `guitarRhythm (-0.3)` และ `piano (-0.2)` อยู่ซ้ายทั้งคู่ ให้ปรับ `TRACK_PAN` เป็น:
     ```ts
     export const TRACK_PAN: Record<TrackId, number> = {
       guitarRhythm: -0.32,
       guitarLead: 0.38,
       bass: 0.0,
       piano: 0.28,
       drums: 0.0,
       melody: 0.0,
     };
     ```
2. **เพิ่ม `BassTrackGainNode` และ `PianoTrackGainNode` (ใช้ร่วมกัน 100% ทั้ง Live `audioEngine.ts` และ Offline `createOfflineTrackBusSet` ใน `audioDspShared.ts`):**
   - `BassTrackGainNode extends TrackGainNode`:
     - Low-shelf Boost `75Hz (+2.5 dB)` ให้ฐานเบสอิ่มลึก
     - Peaking Cut `320Hz (-2.5 dB, Q: 1.1)` ลดย่านโคลนไม่ให้ทับบอดี้กีตาร์โปร่ง
   - `PianoTrackGainNode extends TrackGainNode`:
     - High-pass Filter `140Hz (Q: 0.707)` ตัดเบสต่ำส่วนเกินของเปียโนออกไม่ให้ตีกับแทร็กเบส
     - High-shelf Filter `4500Hz (+1.5 dB)` เพิ่มความโปร่งใสให้เสียงคอร์ดเปียโน
   - ใน `AudioEngine.init()` (`src/lib/audioEngine.ts`): ใช้ `BassTrackGainNode` สำหรับ `'bass'` และ `PianoTrackGainNode` สำหรับ `'piano'` ให้ตรงกับ `createOfflineTrackBusSet()` 100%
3. **ขยายเสียงสังเคราะห์กลองใน `DrumSynth` (`src/lib/audioDspShared.ts`):**
   - `openHat`: Filtered white noise (HPF `6200Hz`, Decay `0.24s`)
   - `tomHigh`: Triangle/Sine sweep `195Hz -> 105Hz` (`0.20s`)
   - `tomLow`: Sine sweep `130Hz -> 68Hz` (`0.26s`)
   - `woodblock`: Bandpass resonant click (`950Hz` + short transient `1850Hz`, `0.06s`) สำหรับจังหวะสามช่า/ลูกทุ่งไทย

### 3. แพตเทิร์นดนตรีไทยสมจริง & Smart Band Interplay ใน `src/lib/barPlanner.ts`
- **ต้องใช้ `ctx.rng()` (Deterministic) เสมอ และห้ามเปลี่ยนพฤติกรรมของ 9 สไตล์เดิม**
- **`planRhythm`:**
  - `'lukthung-bounce'`: 4/4 ตีจังหวะยกสามช่า/ลูกทุ่งเน้น Off-beat (`steps 0(D,78), 3(U,66), 6(U,84), 8(D,76), 11(U,66), 14(U,84)`) สั้นกระชับ; 3/4 ใช้ `[0(D), 3(U), 4(D), 8(U)]`; 6/8 ใช้ `[0(D), 3(U), 6(D), 9(U)]`
  - `'rock-power'`: ดีดเน้น 3 สายล่างของ voicing (`voicing.strings.slice(0, 3)`) ทุก 8th note `[0, 2, 4, 6, 8, 10, 12, 14]` พร้อม Accent `0, 4, 8, 12` (และ 12 steps ใน 3/4, 6/8)
- **`planBass`:**
  - `'lukthung-groove'`: 4/4 เดิน Root-Fifth-Octave สลับกระชับต่อครึ่งห้อง (`0: root`, `3: fifth สั้น`, `4: octave/fifth`, `6: root`, ซ้ำครึ่งหลัง `+8` พร้อม `hasWalk` ท้ายห้อง)
  - `'rnb-syncopated'`: 4/4 (`0: root 3 steps`, `3: fifth`, `6: root`, `10: fifth/octave`, `14: walking approach`)
- **`planPiano`:**
  - **Smart Low-End Yielding:** ถ้า `isTrackOn(song, fb.section, 'bass')` เปิดอยู่ และเป็นสไตล์ใหม่ (`'rnb-neo-chord' | 'rock-organ-pad'`) หรือในท่อน `'high'` ให้ลดความดังโน้ตมือซ้าย (`pc.low`) ลงเหลือ `0.65x`
  - `'rnb-neo-chord'`: กดคอร์ดซิงโคเปตที่ `[0, 3, 6, 10, 12]` (หรือเทียบเท่าใน 3/4, 6/8) โรลคอร์ด `0.018s` พร้อมเติมโน้ต 9th (`60 + ((parsed.pc + 14) % 12)` ให้อยู่ช่วง `60..76`) เบาๆ
  - `'rock-organ-pad'`: กดคอร์ดเต็มน้ำหนัก (Root Octave + Triad) ลากยาวปูพื้นให้ท่อนฮุค/โซโล่หนาแน่น
- **`planDrums` & `planDrumFill`:**
  - `'lukthung-3cha'`: Kick `[0, 6, 8, 14]`, Snare `[4, 12]`, `woodblock` `[2, 6, 10, 14]`, `openHat` ยกที่ `[2, 10]`
  - `'rnb-pocket'`: Kick `[0, 7, 10]`, Snare `[4, 12]`, Ghost Snare เบา (`vel 26`) `[9, 15]`, Closed/Open Hat 16th-note สลับน้ำหนัก
  - `'rock-drive'`: Kick `[0, 2, 8, 10]`, Snare หนัก `[4, 12]`, Open Hat ที่ `[0, 4, 8, 12]` (และ `planDrumFill` ใช้ `tomHigh` -> `tomLow` -> `snare` ส่งท้ายห้อง!)
- **`planLead` (Vocal-Aware Call-and-Response):**
  - เมื่อ `style === 'riff-fills'` และ `fb.bar.lyrics.trim().length > 0` ให้หยอดลูกส่งลีดเฉพาะช่วงท้ายห้อง (`steps N-6..N-1`) ตอนนักร้องเว้นหายใจ เพื่อไม่ให้เสียงกีตาร์ลีดตีทับคำร้อง

### 4. Auto-Arrange Band 1 คลิก & UI Selectors
- **ไฟล์ `src/lib/songArchitect.ts`:**
  - Export ฟังก์ชัน Pure `applyGenreBandArrangement(song: SongProject): SongProject` ที่ตั้งค่าสไตล์การเล่น (`guitarRhythmStyle`, `bassStyle`, `pianoStyle`, `drumsStyle`, `guitarLeadDrive`) และ `Volume Contour` รายท่อนตาม `song.thaiGenre` + `song.songwriterStyle` (เช่น `aed-carabao` / `luk-thung` ใช้ชุด `lukthung-bounce` + `lukthung-groove` + `lukthung-3cha`; `thai-rnb` / `the-toys` ใช้ชุด `rnb-syncopated` + `rnb-neo-chord` + `rnb-pocket`; `thai-rock` / `sek-loso` / `asanee-chotikul` ใช้ชุด `rock-power` + `rock-drive` + Overdrive `riff-fills`)
- **ไฟล์ `src/components/SectionBuilder.tsx` & `src/components/SoundCustomizerPanel.tsx`:**
  - เพิ่ม `<option>` สำหรับสไตล์ใหม่ทั้งหมดใน Dropdown ประจำท่อนและแผงตั้งค่าเสียงหลัก
  - เพิ่มปุ่ม `🎚️ จัดวงอัตโนมัติตามสไตล์เพลง (0 เครดิต)` เรียก `applyGenreBandArrangement(song)`

### 5. เทสต์รับรอง Phase 7C (`tests/phase7c.test.ts`)
- ทดสอบว่าสไตล์เดิมทั้ง 9 แบบยังคง Output ตรงตามเดิมทุก Event (Deterministic)
- ทดสอบว่าสไตล์ใหม่ทั้ง 4 ประเภท (`lukthung-*`, `rnb-*`, `rock-*`) สร้าง Event ที่ถูกต้อง, มี `openHat`/`tomHigh`/`tomLow`/`woodblock`, ไม่มี `NaN`, และ `riff-fills` ในห้องที่มีเนื้อร้องเว้นช่วงต้นห้องให้คนร้อง
- ทดสอบ `BassTrackGainNode`, `PianoTrackGainNode`, `TRACK_PAN` สมดุลซ้าย-ขวา, และ `applyGenreBandArrangement()`

---

## ✨ Phase 7D: "AI Studio Master from Demo" (`lyria-3.5`) + สุ่มวรรค 3 ตัวเลือก & ป้ายอารมณ์คอร์ด

### 1. ต่อยอดเดโมเป็นเพลงจริงด้วย "Full Demo Blueprint"
- **ไฟล์ `src/lib/aiPrompts.ts`:**
  - เพิ่ม Interface & Function ใหม่:
    ```ts
    export function buildFullDemoMasterPrompt(
      song: SongProject,
      options?: { userNotes?: string; instrumental?: boolean; vocalGender?: 'female' | 'male' | 'neutral'; language?: 'th' | 'en' }
    ): { promptUsed: string; blueprintSummary: { totalBars: number; sectionCount: number; lyricLinesCount: number; melodyBarsCount: number } }
    ```
  - ฟังก์ชันนี้จะสกัดข้อมูลจริงทั้งเพลงจาก `SongProject`:
    - แนวเพลง (`thaiGenre`), ยุค (`lyricEra`), ภาษาถิ่น (`lyricDialect`), สไตล์นักแต่งเพลง (`songwriterStyle` รวมถึง `aed-carabao` / `asanee-chotikul`), บทสรุปอารมณ์ (`emotionalResolution`)
    - เครื่องดนตรี & ห้องจำลอง 3D (`guitarModel`, `stringGauge`, `ambience3D`, `bpm`, `timeSignature`, คีย์ที่ Transpose แล้ว)
    - แผนที่ท่อนเพลงทั้งหมดแบบเรียงลำดับ (`Section Map`): ชื่อท่อน, ระดับพลัง (`intensity`), เครื่องดนตรีเด่นในท่อนนั้น (เช่น `Solo: Gibson Les Paul Overdrive + Rock Drive Drums`), ทางคอร์ดทุกห้องที่ Transpose แล้ว, และเนื้อร้องครบทุกท่อน
    - สรุปทิศทางเมโลดี้ (`Melody Contour Hint`) จาก `melodyNotes` (เช่น โน้ตต่ำสุด–สูงสุดและระดับพีคใน Chorus)
  - อัปเกรด `buildLyriaReferencePrompt` ให้รองรับ `fullSectionMap` / `songwriterStyle` ได้อย่างเข้ากันได้ย้อนหลัง 100%
- **ไฟล์ `src/app/api/advance/reference-track/route.ts`:**
  - รองรับ optional field `fullSong?: SongProject` ใน Request JSON โดยถ้ามี `fullSong` ให้ใช้ `buildFullDemoMasterPrompt(fullSong, ...)` สร้าง `promptUsed` (สูงสุดไม่เกินขีดจำกัดของ Lyria และยังคงใช้ `tryServerBillingPreDeduct` / `refundServerBillingOnFailure` 8 เครดิตเดิมทั้งหมด)
- **ไฟล์ `src/components/ExportModal.tsx` & `src/components/AdvanceModeModal.tsx`:**
  - เพิ่มบล็อก/ปุ่มเด่น **"✨ AI Studio Master: ต่อยอดเดโมนี้เป็นเพลงเต็ม"** ที่แสดงสรุป Blueprint จากเดโม (กี่ท่อน, กี่ห้อง, มีเนื้อเพลงกี่บรรทัด, มีไกด์เมโลดี้กี่ห้อง) และเชื่อมต่อกับ `/api/advance/reference-track` พร้อมส่ง `fullSong: song` เข้าไปประมวลผลจริง (และแสดง Mock Preview Summary ฟรีเมื่อยังไม่ตั้งค่า Key)

### 2. สุ่มตัวเลือก 3 แบบเฉพาะ 1 วรรค (`Single-Bar 3-Variations`) + ป้ายอารมณ์คอร์ด
- **ไฟล์ `src/lib/chordUtils.ts`:**
  - Export Pure Function `getChordEmotionalHint(chordSymbol: string, lang: 'th' | 'en' = 'th'): string` แปลคุณภาพคอร์ด (Major, Minor, maj7, m7, dom7, sus2/sus4, add9, dim) เป็นคำบรรยายอารมณ์สั้นๆ เพื่อช่วยคนแต่งเนื้อเพลง
- **ไฟล์ `src/lib/aiPrompts.ts` & `src/app/api/advance/lyrics/route.ts`:**
  - เพิ่ม `SINGLE_BAR_VARIATIONS_SCHEMA` (`variations: string[]`, 3 items) และรองรับ optional field `singleBarIndex?: number` ใน `POST /api/advance/lyrics`
  - เมื่อส่ง `singleBarIndex` มายัง `/api/advance/lyrics`:
    - สร้าง Prompt เฉพาะเจาะจงที่ขอ 3 ประโยคใหม่สำหรับห้อง `singleBarIndex` ที่เชื่อมสัมผัสจาก `existingLyrics[singleBarIndex - 1]` (หรือท้ายท่อนก่อนหน้า) และส่งต่อเข้า `existingLyrics[singleBarIndex + 1]` พร้อมคุมงบพยางค์ของห้องนั้นด้วยโมเดลเร็ว (`GEMINI_MODEL_LITE`)
    - เพิ่ม Simulated Fallback `buildSimulatedSingleBarVariations()` ที่สร้าง 3 ตัวเลือกตรงสไตล์ (และ 0 errors เมื่อไม่มี `GEMINI_API_KEY`)
- **ไฟล์ `src/components/SectionBuilder.tsx`:**
  - แสดงป้ายอารมณ์คอร์ดสั้นๆ จาก `getChordEmotionalHint` ใต้ปุ่มคอร์ด
  - เพิ่มปุ่ม `🎲 3 ตัวเลือก` บนการ์ดแต่ละห้อง เรียก `/api/advance/lyrics` ด้วย `singleBarIndex` แล้วแสดง Popover ให้คลิกเลือก 1 ใน 3 วลีลงห้องได้ทันที

### 3. เทสต์รับรอง Phase 7D (`tests/phase7d.test.ts`)
- ทดสอบ `buildFullDemoMasterPrompt` (ตรวจว่าสกัดคอร์ดทุกท่อน เนื้อร้อง สไตล์ `aed-carabao` / `asanee-chotikul` และ Melody contour ครบ)
- ทดสอบ `/api/advance/reference-track` กับ payload ที่มี `fullSong` (simulated fallback & validation)
- ทดสอบ `/api/advance/lyrics` โหมด `singleBarIndex` คืน `variations` 3 รายการ + ทดสอบ `getChordEmotionalHint`

---

## 📋 ลำดับการแบ่งงานที่แนะนำสำหรับ Hydrogen Extra
- **แชตใหม่ที่ 1:** ทำ **Phase 7A + Phase 7B** (กลุ่ม Songwriter HUD + Undo/Redo + Single-Bar Loop — แตะ UI & Utility เป็นหลัก ไม่กระทบ DSP Audio)
- **แชตใหม่ที่ 2:** ทำ **Phase 7C** (กลุ่ม Audio DSP, Band Interplay & Thai Grooves — โฟกัส `audioDspShared.ts` + `barPlanner.ts` อย่างเดียวเพื่อง่ายต่อการคุมคุณภาพเสียงและ Determinism)
- **แชตใหม่ที่ 3:** ทำ **Phase 7D** (กลุ่ม Demo-to-Master `lyria-3.5` + Single-Bar 3-Variations & Chord Hints)
