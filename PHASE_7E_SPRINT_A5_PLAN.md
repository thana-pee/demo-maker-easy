# 🎙️ PHASE 7E (Sprint A.5) PLAN — Play-Section UX, AI Singing Guide (`gemini-3.8-flash-tts`) in MP3, Lyric Sync & Mixdown QA Remediation

> **เอกสารแผนเสริมฉบับสมบูรณ์สำหรับเริ่มลงมือทำในแชทใหม่**
> สร้างต่อจากสถานะ **[Phase 7D] PASS** (`162/162` Tests ผ่าน, `eslint` 0 warnings, `next build` ผ่าน) และอ้างอิงผลตรวจ **Sprint A Track 1 (17 Songwriter Styles Real QA)** เพื่อแก้ไขก่อนยิง Sprint A Track 2 (`lyria-3.5`)

---

## 🎯 เป้าหมายหลักของ Phase 7E (Sprint A.5)

แก้ไขคอขวดสำคัญ 3 กลุ่มที่พบจากการทดสอบ Track 1 และความเห็นผู้ใช้ พร้อมปูทางให้ **ไฟล์เดโม `.mp3` มิกซ์เสียงร้องไกด์จาก AI (`gemini-3.8-flash-tts`) ติดออกมาในไฟล์เดียวกันได้จริง** ก่อนทดสอบเทียบเสียงเต็มเพลงกับ `lyria-3.5`:

1. **กลุ่มที่ 1 — UX เห็นเนื้อ + ได้ยินเนื้อ + เล่นเฉพาะท่อน + ส่งออกเนื้อเพลง (`.lrc`/`.txt`) + ฝังเสียงร้อง AI ลง `.mp3`:**
   * เพิ่มปุ่ม **`▶ เล่นท่อนนี้`** (เล่นเฉพาะท่อนนั้น 1 รอบแล้วหยุด) และทำให้ **`🔁 ลูปท่อนนี้`** กดแล้วเริ่มเล่นทันที
   * เพิ่มแถบ **Live Lyric Teleprompter** ขนาดกะทัดรัดบนหน้าแก้ไข + ปุ่ม **`🗣️ อ่านเนื้อท่อนนี้ (ฟรี 0 เครดิต)`** ด้วย Web Speech API
   * เชื่อม **`gemini-3.8-flash-tts`** (`/api/advance/tts-cue`, `modelTier: 'pro-tts'`, `vocalMode: 'singing-demo'`) ให้บันทึกเสียงร้องไกด์ลง `song.vocalTakes` (ระดับทั้งท่อน) และ `bar.vocalAudio` (รายห้อง) เพื่อมิกซ์ลง **`offline-3d-mix.mp3`** พร้อมจัดตารางไม่ให้เสียงพูด/ร้องทับซ้อนกันข้ามห้อง
   * เพิ่มปุ่มดาวน์โหลด **`.lrc` (ซิงก์เวลาตามบาร์/BPM)** และ **`.txt` (เนื้อร้อง+คอร์ด)** ใน `ExportModal.tsx` พร้อมล้างค่า `lastMixDetail` เมื่อเปลี่ยนเพลง
2. **กลุ่มที่ 2 — ยกระดับความสมจริงของ Offline 3D MP3 Mixdown:**
   * ห้ามใส่ `melodyNotes` ใน `[intro]` เพื่อลดปัญหาฟลุตเป่าทับตั้งแต่ `0:00` (13/17 เพลงใน Track 1) และเปิดสวิตช์สลับ **Backing Track / Guide Melody** ให้ชัดขึ้น
   * ห้ามใส่ `playStyle: 'break'` ทับห้องสุดท้ายของ `[outro]` (แก้ปัญหาหางเงียบ `3.21–4.54 วินาที`) และกันไม่ให้ `break` กลางเพลงสร้างช่วงเงียบยาวผิดจังหวะ
   * อัปเกรด `applyGenreBandArrangement()` ให้ดู **`song.bpm` ควบคู่กับแนวเพลง** (แก้ปัญหาเพลงช้า `66 BPM` ได้กลอง 3 ช่า หรือเพลงป๊อปช้า `68–72 BPM` ได้กีตาร์ `overdrive`)
3. **กลุ่มที่ 3 — คุณภาพคำร้องเพลงช้า, Schema Grooves, สัมผัสซ้ำ และการปัดคำลง (`⤵ ปัดคำลง`):**
   * คุม **Syllable Budget สำหรับเพลงช้า `<= 72 BPM`** ลดอาการล้นจังหวะ (`OVER 38.5%` ใน Track 1) + กระจายคีย์เพลงไม่ให้กระจุกที่ `C`/`Am` (`14/17` เพลง)
   * เปิดตัวเลือก Groove Phase 7C (`lukthung-bounce`, `lukthung-3cha`, `rock-power`, `rock-drive`, `rnb-pocket`, `rnb-neo-chord`, ฯลฯ) ใน `ARCHITECT_RESPONSE_SCHEMA`
   * กระตุ้น auto-polish เมื่อ `duplicateEndWords` หรือ `rhymeValidation.passed === false` (เช่น กรณีคำซ้ำ `"มอง"` ใน `suraphon-sombatcharoen`) และปรับ `shiftLastTokenToNextBar()` ไม่ให้ยกทั้งวลียาวข้ามห้อง

---

## 🛡️ กฎเหล็ก (Invariants) & ข้อควรระวังจาก Track 1 (ห้ามละเมิดเด็ดขาด)

1. **รักษาผลเทสต์เก่า (Phase 1A – 7D, 162 ข้อ) ให้ผ่าน 100%:**
   * `getSyllableBudgetForBpm(74, '4/4')` และ `buildLyricsSystemPrompt({ bpm: 74, timeSignature: '4/4', sectionType: 'chorus' })` ใน `src/lib/aiPrompts.ts` ต้องยังมีข้อความ `'5-8 พยางค์'` ปรากฏอยู่เสมอ (รักษา `tests/phase5a.test.ts`)
   * `validateThaiLyricCouplets()` ต้องเก็บ `duplicateEndWords` เป็น Warning/Telemetry เท่านั้น **ห้าม** ตั้ง `passed = false` เพียงเพราะคำลงท้ายซ้ำ (รักษา `tests/phase5b.test.ts`) — หากต้องการแก้คำซ้ำ ให้ใช้เป็นเงื่อนไขกระตุ้น Auto-Polish ใน API หรือปรับ Prompt แทน
   * `src/lib/barPlanner.ts` ต้องเป็น **Pure & Deterministic (`ctx.rng()`)** และ **ห้ามแก้** จังหวะ/จำนวน Event ของ 9 สไตล์ดั้งเดิม (`campfire-strum`, `soft-strum`, `fingerpicking`, `root-fifth`, `warm-sustain`, `warm-pad`, `gentle-arpeggio`, `shaker-cajon`, `simple-kit`) เพื่อรักษา `tests/phase7c.test.ts`
   * เช็กเทสต์ `tests/phase7a.test.ts`, `tests/phase7b.test.ts`, `tests/phase7c.test.ts`, `tests/phase7d.test.ts` ก่อนแก้ฟังก์ชัน `shiftLastTokenToNextBar`, `resolveNextBarIndex`, `applyGenreBandArrangement` และ `sanitizeArchitectSongProject` เพื่อไม่ให้ Assertion เดิมพัง
2. **ข้อควรระวัง Gemini Structured Output Schema (`src/lib/aiPrompts.ts`):**
   * **ห้าม** ใส่ `minimum`/`maximum` หรือ `minItems`/`maxItems` ซ้อนทับกันใน Schema เพราะจะทำให้ Gemini Interactions API คืนค่า `HTTP 400 ("The specified schema produces a constraint that has too many states for serving")` แบบที่เคยแก้ใน `ARCHITECT_RESPONSE_SCHEMA` — ให้ใช้การ Clamp/Sanitize ใน `src/lib/songArchitect.ts` แทน
   * ให้ตรวจ `LYRICS_DEEP_RESPONSE_SCHEMA` และ `DIRECTOR_RESPONSE_SCHEMA` ด้วยว่ามี `minimum`/`maximum` ที่เสี่ยงติด HTTP 400 หรือไม่ และคลายออกพร้อมทดสอบ Schema Integrity
3. **Gemini API Cost Guard Rule:**
   * **ห้าม** ยิง `GEMINI_API_KEY` (`gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-3.8-flash-tts`, `lyria-3.5`) แบบเงียบๆ โดยไม่แจ้งรุ่นโมเดล ปริมาณ และประมาณการค่าใช้จ่าย (USD + THB) เพื่อขออนุมัติจากผู้ใช้ก่อนทุกครั้ง และ **ห้าม** อ่าน/พิมพ์ค่าดิบของ `GEMINI_API_KEY`
4. **สภาพแวดล้อม Dev Server ในเครื่อง Windows Workspace (`d:\Demo maker easy`):**
   * ใน `.env.local` ตั้งค่า `NEXT_PUBLIC_BILLING_MODE=production` อยู่ ดังนั้นเมื่อเปิด Next.js Dev Server ทดสอบในเครื่อง **ต้องรันด้วย:**
     ```powershell
     $env:NEXT_PUBLIC_BILLING_MODE='standalone'; npm run dev
     ```
   * หากเติมเครดิตจำลองใน `localStorage` ระหว่าง QA UI Chrome ให้คืนค่ากลับเป็นค่าเริ่มต้นสะอาด (`AI 15`) หลังจบเทสต์ทุกครั้ง

---

## 🔧 กลุ่มที่ 1 — UX เล่นเฉพาะท่อน + เห็น/ฟังเนื้อเพลง + ฝัง AI Vocal (`gemini-3.8-flash-tts`) + Export `.lrc`/`.txt`

### 1A. ปุ่ม `▶ เล่นเฉพาะท่อนนี้` และอัปเกรด `🔁 ลูปท่อนนี้`
* **ไฟล์ `src/lib/audioEngine.ts` และ `src/hooks/useAudioEngine.ts`:**
  * เพิ่มรองรับ **`playRangeOnce` / `setPlayBounds(range: LoopRange | null)`** (หรือพารามิเตอร์ใน `play(song, fromBar, options?)`):
    * เมื่อเล่นครบ `endBar` ในโหมด **Play Once** ให้จบเพลง/หยุดเล่นทันที (`activeBarIndex = -1`, `state = 'ready'`, `_stopAllVocals()`) โดยไม่เล่นเลยไปท่อนถัดไปและไม่วนซ้ำ
    * เก็บ `resolveNextBarIndex(currentBar, totalBars, loopRange)` เดิมไว้ให้ทำงานเหมือนเดิม (เพื่อรักษา `tests/phase7b.test.ts`) หรือเพิ่มพารามิเตอร์/ฟังก์ชันเสริมแยกชัดเจน เช่น `resolvePlaybackNextBar(currentBar, totalBars, loopRange, playBounds)`
* **ไฟล์ `src/app/page.tsx` และ `src/components/SectionBuilder.tsx` (บริเวณบรรทัด 1341–1375):**
  * เพิ่ม Handler `handlePlaySectionOnce(startBar, endBar)` ใน `src/app/page.tsx` ส่งให้ `SectionBuilder`
  * ปรับ `handleToggleLoopRange` ใน `src/app/page.tsx` (บรรทัด 429–434): เมื่อผู้ใช้กดเปิด **`🔁 ลูปท่อนนี้`** ขณะที่เครื่องเล่นไม่ได้เล่นอยู่ (หรือกำลังเล่นอยู่นอกช่วงท่อนนั้น) ให้สั่ง `engine.play(song, range.startBar)` ให้ทันที ไม่ต้องเลื่อนขึ้นไปกดปุ่ม Play ด้านบนซ้ำ
  * ใน `SectionBuilder.tsx`: เพิ่มปุ่ม **`▶ เล่นท่อนนี้`** ข้างปุ่ม **`🔁 ลูปท่อนนี้`** บนหัวทุกท่อน โดยแสดงข้อความสั้นอ่านออกได้ทั้งจอมือถือ/แท็บเล็ตและเดสก์ท็อป (เช่น `▶ เล่นท่อนนี้` / `▶ ท่อนนี้` แทนการซ่อนด้วย `hidden md:inline` จนเหลือแต่ไอคอน) และไฮไลต์สถานะกำลังเล่นท่อนนั้นชัดเจน

### 1B. เห็นเนื้อเพลงซิงก์สด + เสียงอ่านไกด์ฟรี (`0 เครดิต`) + ฝังเสียงร้องไกด์ AI (`gemini-3.8-flash-tts`) ลง `.mp3`
* **แถบเนื้อเพลงซิงก์สดในหน้าแก้ไข & ทางลัด Karaoke Booth:**
  * ใน `src/app/page.tsx` / `src/components/SectionBuilder.tsx`: เมื่อ `isPlaying` (`activeGlobalBarIndex >= 0`), แสดงแถบ **Live Lyric Strip** (เนื้อเพลงบาร์ปัจจุบันตัวชัด + คอร์ด + ปุ่มลัดสลับไปโหมด `🎤 Karaoke` / ตู้อัดเสียง 0 เครดิต) เพื่อให้ผู้ใช้มองเห็นเนื้อร้องวิ่งตามจังหวะได้ทันทีโดยไม่ต้องออกจากหน้าแต่งเพลง
* **ปุ่มฟังเนื้อร้องไกด์ฟรีด้วย Web Speech API (`0 เครดิต`):**
  * แยก Helper สำหรับ Browser Speech Preview (ต่อยอดจาก `speakBrowserCueFallback` ใน `src/components/MiniPianoRollModal.tsx`) ไปไว้ในไฟล์ Utility กลาง (เช่น `src/lib/browserSpeechCue.ts`) รองรับหยุดก่อนเริ่มใหม่ (`speechSynthesis.cancel()`), ปรับ `rate` ตาม `song.bpm`, อ่านไทย (`th-TH`) / อังกฤษ (`en-US`)
  * เพิ่มปุ่ม **`🗣️ อ่านเนื้อท่อนนี้ (0 เครดิต)`** บนหัวท่อนใน `SectionBuilder.tsx` พร้อมหมายเหตุสั้นๆ ว่าเป็นเสียงอ่านไกด์สดในเบราว์เซอร์ (บันทึกเป็น MP3 ไม่ได้ — หากต้องการเสียงร้องติดลง MP3 ให้ใช้ปุ่มเสียงร้องไกด์ AI หรือ Vocal Booth)
* **เชื่อม AI Singing Guide (`gemini-3.8-flash-tts`) ให้ฝังลงโปรเจกต์และมิกซ์เข้า `.mp3` อัตโนมัติ:**
  * **ไฟล์ `src/app/api/advance/tts-cue/route.ts` และ `src/lib/geminiClient.ts`:**
    * ตรวจสอบให้แน่ใจว่าเมื่อ Request ส่ง `modelTier: 'pro-tts'` ระบบใช้ `GEMINI_MODEL_TTS` (`gemini-3.8-flash-tts`) จริง พร้อมแนบ `vocalMode: 'singing-demo'`, `bpm`, `thaiGenre`
    * ปรับ `styleHint` ของโหมด `singing-demo` ให้ร้องคุมจังหวะกระชับตาม `bpm` และหลีกเลี่ยงช่วงเงียบต้นคลิปยาวเกินจำเป็น
    * เก็บ Telemetry `usage` กลับมาครบ (พร้อม `MAX_TTS_CUE_CHARS = 240`, `MAX_TTS_DURATION_SEC = 30`)
  * **โหมดใช้งานใน UI (`SectionBuilder.tsx` + `MiniPianoRollModal.tsx` + `src/app/page.tsx`):**
    1. **ระดับทั้งท่อน (`Section AI Vocal Take` — `2 เครดิต/ท่อน`):** เพิ่มปุ่ม **`🎙️ เสียงร้องไกด์ AI ท่อนนี้ (2 เครดิต)`** บนหัวท่อน (มี Modal/Popover ยืนยันก่อนยิงเสมอ แสดงโมเดล `gemini-3.8-flash-tts` และจำนวนเครดิต) → รวมเนื้อร้องทุกห้องในท่อนนั้น (ตรวจไม่ให้เกิน `240` ตัวอักษร) → ยิง `/api/advance/tts-cue` ครั้งเดียว → แปลงคลิปที่ได้รับเป็น **`VocalTake`** (`scope: 'section'`, `sectionId: section.id`, `startGlobalBarIndex`, `endGlobalBarIndex`, `fxPreset: 'studio-warm'`, `isActive: true`) เพิ่มเข้า `song.vocalTakes` + บันทึก IndexedDB (`saveVocalBlob`) ทันที (ให้ปิด/แทนที่ Take เดิมของท่อนเดียวกันได้สะอาด)
    2. **ระดับรายห้อง (`Bar Vocal Guide` — `2 เครดิต/ห้อง`):** ปรับใน `MiniPianoRollModal.tsx` (และทางลัดบนการ์ดบาร์ถ้าเหมาะสม) ให้เลือก `gemini-3.8-flash-tts` (`modelTier: 'pro-tts'`) ได้ และมีตัวเลือก **Auto-save ลง `bar.vocalAudio`** ทันทีเมื่อสังเคราะห์สำเร็จ (ไม่บังคับผู้ใช้ต้องกด `💾` แยกอีกขั้นตอน)
  * **แก้เสียงทับซ้อนและช่วงเงียบต้นคลิปเวลา Export `.mp3` (`src/lib/mp3Exporter.ts` & `src/lib/audioEngine.ts`):**
    * เพิ่มฟังก์ชัน **Trim Leading Silence** บน Client `AudioBuffer` (ตัดความเงียบต้นคลิปที่ต่ำกว่า `-45 dB` ออกสูงสุดไม่เกิน threshold ที่ปลอดภัย) ก่อนบันทึก/Encode กลับมาเป็น Data URL (หรือจัด Alignment Offset) เพื่อไม่ให้คำร้องเข้าช้ากว่าจังหวะตกของห้อง
    * ใน `src/lib/mp3Exporter.ts` (บรรทัด 547–558 `for (const clip of vocalSchedule.barClips)`): คำนวณขอบเขตไม่ให้ `clip[i]` ร้องทับซ้อนเข้าไปในเวลาเริ่มของ `clip[i + 1]` — ใช้ Gain Envelope fade-out 20ms แล้วเรียก `src.stop(nextClipStartSec)` เพื่อให้ Offline MP3 ทำงานสอดคล้อง (`parity`) กับ Live `AudioEngine.playVocalClip()` (บรรทัด 691–697) ที่สั่งหยุด `activeVocalSource` ก่อนเริ่มห้องถัดไป

### 1C. ส่งออก `.lrc` & `.txt` คู่ `.mp3` + แก้ Stale `lastMixDetail`
* **สร้าง `src/lib/lyricExport.ts` (Pure Functions):**
  * `buildLrcContent(song)`: คำนวณเวลา `[mm:ss.xx]` ของทุกห้องจาก `flattenSong(song)` และ `getTiming(song).barSec` ใส่ Metadata Header (`[ti:...]`, `[ar:...]`, `[by:Demo Maker Easy]`), แท็กชื่อท่อน และเนื้อร้องรายห้อง (ข้าม/ระบุห้องบรรเลง `[Instrumental]` อย่างเรียบร้อย)
  * `buildPlainLyricsWithChords(song)`: สร้างไฟล์ `.txt` แสดงชื่อเพลง คีย์ คาโป้ BPM ชื่อท่อน คอร์ดที่ทรานสโพสแล้ว และเนื้อร้องเรียงอ่าน/ปรินต์ซ้อมได้ทันที
  * เพิ่มฟังก์ชันดาวน์โหลด `.lrc` และ `.txt` ด้วย Sanitizing ชื่อไฟล์มาตรฐานเดียวกับ `mp3Exporter.ts`
* **ไฟล์ `src/components/ExportModal.tsx`:**
  * เพิ่ม `useEffect` ล้าง `lastMixDetail`, `mp3Error`, และ `mp3Progress` ทุกครั้งที่ `song.id` หรือ `song.updatedAt` เปลี่ยน (แก้ปัญหา badge `Soundfonts 4/4` ของเพลงเก่าค้างอยู่หลังสลับเพลง)
  * แสดงจำนวน Vocal Sources ที่พร้อมมิกซ์ลง `.mp3` (`activeTakes.length` + `vocalClipsCount`) พร้อมปุ่มดาวน์โหลด **`📄 ส่งออกเนื้อเพลงซิงก์ (.LRC)`** และ **`📝 ส่งออกเนื้อร้อง+คอร์ด (.TXT)`** ในหน้า Modal เดียวกับการ Export `.MP3`

---

## 🎚️ กลุ่มที่ 2 — อัปเกรด Offline 3D MP3 Mixdown

### 2A. ปิดฟลุต Intro (`0:00`) & ปรับสมดุล Guide Melody / Backing Track Switch
* **ไฟล์ `src/lib/songArchitect.ts`:**
  * ใน `sanitizeArchitectSongProject()` (และขั้นตอนสร้างโครงสร้างจาก AI / Simulated): หากห้องอยู่ใน `section.type === 'intro'` ให้ตั้ง `bar.melodyNotes = []` เสมอ (กันไม่ให้ `13/17` เพลงขึ้นต้นด้วยเสียงฟลุตเมโลดี้ร้องทับอินโทรดนตรีตั้งแต่ `0:00`)
  * ตรวจสอบระดับ `mixer.melody.volume` (เช็กเทสต์เก่าใน `tests/` ก่อนว่ามี Assert ค่า `82` อยู่หรือไม่ — หากมี Assertion ล็อกค่าไว้ ให้ปรับ gain scaling ใน `barPlanner.ts` สำหรับ `melody` เท่านั้นหรือปรับที่ `SoundCustomizerPanel.tsx` / `ExportModal.tsx` แทนการพังเทสต์เก่า) และเพิ่มปุ่มสลับ **`Backing Track Only (ปิดเมโลดี้ไกด์)`** ให้กดง่ายใน `ExportModal.tsx` และ Mixer
  * (ตัวเลือกเสริมใน `audioEngine.ts` / `MelodySynth`): ปรับโทน `'flute'` หรือ Default Melody Sound ให้อุ่นละมุนไม่แหลมเหมือนริงโทน MIDI

### 2B. แก้หางเงียบค้างท้ายเพลง (`4.54s` / `3.21s`) และช่วงเงียบกลางเพลง
* **ไฟล์ `src/lib/songArchitect.ts`:**
  * ใน `sanitizeArchitectSongProject()`:
    * ห้องสุดท้ายของ `[outro]` (หรือห้องสุดท้ายของเพลง): **ห้าม** เป็น `playStyle: 'break'` — ให้แปลงเป็น `'let-ring'` อัตโนมัติ เพื่อจบเพลงด้วยเสียงคอร์ดค้างอย่างธรรมชาติ
    * ห้องร้องกลางเพลงที่มีเนื้อร้องอยู่ และห้องก่อนหน้าเป็น `'break'` อยู่แล้ว: ห้ามวาง `'break'` ติดกัน 2 ห้องรวด (แปลงห้องที่สองเป็น `'normal'` หรือ `'let-ring'`)
* **ไฟล์ `src/lib/aiPrompts.ts` (`buildArchitectSystemPrompt`):**
  * ระบุคำสั่งชัดเจนใน System Prompt: ห้ามวาง `playStyle: 'break'` ในห้องสุดท้ายของ `[outro]`, ห้องแรกของ `[intro]`, และห้ามวาง `break` ติดกันหลายห้องในท่อนร้อง

### 2C. อัปเกรด `applyGenreBandArrangement()` ให้ดู BPM ควบคู่ Style (`0 เครดิต`)
* **ไฟล์ `src/lib/songArchitect.ts` (บรรทัด 1361–1572):**
  * **`isLukThung`:**
    * ถ้า `song.bpm < 90` (เพลงลูกทุ่งช้า/หวานซึ้ง เช่น `sala-khunawut` `66 BPM`, `phaiboon-butkhan` `66 BPM`): ใช้ `drumsStyle: 'simple-kit'` (หรือ `'shaker-cajon'` ใน verse/intro) และ `guitarRhythmStyle: 'fingerpicking'` / `'soft-strum'` — **ห้าม** ใส่ `'lukthung-3cha'` อัตโนมัติให้เพลงช้า `< 90 BPM`
    * ถ้า `song.bpm >= 90` (สามช่า/ลูกทุ่งโจ๊ะ เช่น `aed-carabao` หรือเพลงจังหวะสนุก): คง `'lukthung-3cha'` และ `'lukthung-bounce'` ตามเดิม
  * **Default Thai Pop / Acoustic / Luk Krung:**
    * ถ้า `song.bpm < 82` หรือ `genre === 'acoustic-indie' || genre === 'luk-krung'`: คง `guitarLeadDrive: 'clean'` แม้ในท่อน Peak/Chorus เพื่อไม่ให้เพลงป๊อปช้า (`dee-nitipong` `68 BPM`, `boy-kosiyabong` `72 BPM`) ติดเสียงแตก `overdrive`
  * **`isRock`:**
    * ถ้า `song.bpm < 80` (สโลว์ร็อก): ใช้ `'clean'` ใน Verse/Intro และ `'overdrive'` เฉพาะ Chorus/Solo (เก็บ `'distortion'` ไว้สำหรับ Rock `>= 80 BPM` หรือท่อน Solo หนักๆ)

---

## ✍️ กลุ่มที่ 3 — คำร้องเพลงช้า, Schema Grooves, สัมผัสซ้ำ & ปุ่ม `⤵ ปัดคำลง`

### 3A. Syllable Budget เพลงช้า (`<= 72 BPM`) & ความหลากหลายของคีย์
* **ไฟล์ `src/lib/aiPrompts.ts`:**
  * ตรวจ `getSyllableBudgetForBpm()` และ `buildArchitectSystemPrompt()` / `buildArchitectUserPrompt()`:
    * รักษาInvariant `'5-8 พยางค์'` ของ `74 BPM 4/4` ตามเดิม (`tests/phase5a.test.ts`)
    * เพิ่มกฎเข้มข้นสำหรับ **`bpm <= 72` (เช่น `64–70 BPM`)**: จำกัดพยางค์แนะนำให้กระชับ (`4–6 พยางค์/ห้อง`, สูงสุดไม่เกิน `7 พยางค์/ห้อง`) เพื่อแก้ปัญหาล้น Budget (`seefa` `11/11`, `phaiboon-butkhan` `11/11`, `sala-khunawut` `11/12`, `chali-intrawichit` `10/11`)
    * เพิ่มแนวทางเลือกคีย์ให้สอดคล้องกับโทนเพลง/อารมณ์ (`D`, `E`, `F`, `G`, `A`, `Bb`, `Em`, `Bm`, `Dm`, `F#m`) ลดการตกคีย์เดิม `C`/`Am` (`14/17` เพลง)

### 3B. ปลดล็อก Phase 7C Grooves ใน `ARCHITECT_RESPONSE_SCHEMA` (และตรวจ Schema อื่นกัน 400)
* **ไฟล์ `src/lib/aiPrompts.ts`:**
  * ขยาย Enum ใน `ARCHITECT_RESPONSE_SCHEMA` (`instruments.properties` บริเวณบรรทัด 1647–1661):
    * `guitarRhythmStyle`: `['campfire-strum', 'soft-strum', 'fingerpicking', 'lukthung-bounce', 'rock-power']`
    * `bassStyle`: `['root-fifth', 'warm-sustain', 'lukthung-groove', 'rnb-syncopated']`
    * `pianoStyle`: `['warm-pad', 'gentle-arpeggio', 'rnb-neo-chord', 'rock-organ-pad']`
    * `drumsStyle`: `['off', 'shaker-cajon', 'simple-kit', 'lukthung-3cha', 'rnb-pocket', 'rock-drive']`
  * **ห้าม** ใส่ `minimum`/`maximum` หรือ nested `minItems`/`maxItems` กลับเข้าไป
  * ตรวจสอบ `LYRICS_DEEP_RESPONSE_SCHEMA` และ `DIRECTOR_RESPONSE_SCHEMA` เพื่อลบ Numeric Bounds ที่เสี่ยงชน HTTP 400 เช่นเดียวกัน (ให้ย้าย validation ไปฝั่ง TypeScript sanitizer แทน)

### 3C. อุดช่องโหว่ Auto-Polish คำท้ายซ้ำ & ปรับ `shiftLastTokenToNextBar` (`⤵ ปัดคำลง`)
* **Auto-Polish Trigger (`src/app/api/advance/architect/route.ts` / `src/lib/songArchitect.ts` / `src/lib/aiPrompts.ts`):**
  * **ไม่แก้** logic `passed` ใน `validateThaiLyricCouplets()` (รักษา `tests/phase5b.test.ts`), แต่ในขั้นตอน Auto-Polish หลัง AI Architect สร้างเพลงเสร็จ: ให้ทริกเกอร์ `rhyme-polish` เมื่อ **`!rhymeValidation.passed || rhymeValidation.duplicateEndWords.length > 0`** และแนบรายการ `duplicateEndWords` เข้า prompt ของ polish เพื่อให้แก้คำซ้ำเช่น `"มอง"` ใน `suraphon-sombatcharoen` ด้วย
  * เสริมคำอธิบายตัวอย่างสัมผัสไทยใน `RHYME_POLISH_RESPONSE_SCHEMA` / prompt เพื่อเพิ่มโอกาสผ่านสัมผัสต่อเนื่องในสไตล์ `the-toys`, `joey-boy`, `stamp-apiwat`
* **ปรับ `shiftLastTokenToNextBar()` (`src/lib/sectionUtils.ts` บรรทัด 282–329):**
  * เมื่อ `spaceTokens.length >= 2` (มีช่องว่างคั่นหลายกลุ่มคำ เช่น `"คำที่หนึ่ง คำสัญญาที่ให้ไว้"`): ให้วัดจำนวนพยางค์ของ `lastChunk = spaceTokens[spaceTokens.length - 1]`
  * ถ้า `countThaiEnglishSyllables(lastChunk) <= 2`: ย้ายทั้ง `lastChunk` ตามเดิม (รักษาพฤติกรรมเทสต์เดิม 100%)
  * ถ้า `countThaiEnglishSyllables(lastChunk) > 2` (เช่น `"คำสัญญาที่ให้ไว้"` ที่เป็นกลุ่มคำ 6 พยางค์ไม่มีเว้นวรรค): ให้ตัดแบ่งด้วย `segmentThaiWordToSyllables(lastChunk)` แล้วย้ายเฉพาะ **พยางค์สุดท้าย (หรือ 1–2 พยางค์ท้าย)** ไปต่อหน้าห้องถัดไปแทนการยกทั้งก้อน 6 พยางค์

---

## 🧪 เกณฑ์ตรวจรับและแผนทดสอบใหม่ "แบบมีเสียงร้อง" (Verification Gate ก่อนยิง Track 2)

### ขั้นที่ 1: ตรวจผ่าน Code & Deterministic Suite (0 เครดิต)
1. เขียน Unit/Integration Test ใหม่ใน `tests/phase7e.test.ts` ครอบคลุม:
   * `playOnce` vs `loopRange` in `AudioEngine` / `resolvePlaybackNextBar`
   * `buildLrcContent()` & `buildPlainLyricsWithChords()` timing + UTF-8 output
   * Non-overlapping `barClips` vocal stop window ใน `mp3Exporter.ts` & leading silence trim helper
   * `sanitizeArchitectSongProject()` (Intro `melodyNotes` ว่าง, Outro ไม่จบด้วย `'break'`, ไม่วาง `'break'` ติดกัน)
   * `applyGenreBandArrangement()` BPM-aware (66 BPM Luk Thung ไม่ได้ `3-ช่า`, 68–72 BPM Pop ได้ `'clean'`)
   * `shiftLastTokenToNextBar()` กรณีก้อนท้ายยาว `> 2` พยางค์
   * Gemini Schemas (`ARCHITECT_RESPONSE_SCHEMA`, `LYRICS_DEEP_RESPONSE_SCHEMA`, `DIRECTOR_RESPONSE_SCHEMA`) ไม่มี nested `minimum`/`maximum` ที่เสี่ยง 400 + รวม Phase 7C grooves
2. รันคำสั่งตรวจรับทั้งหมดให้ผ่าน **0 errors / 0 skipped**:
   * `npm test` (`npx tsx --test tests/*.test.ts`)
   * `npx eslint . --max-warnings=0`
   * `npm run build`

### ขั้นที่ 2: ด่านขออนุมัติยิง Live API รอบ Re-test (ทำตามกฎ Cost Guard ก่อนรันจริง)
* **ห้ามยิงโดยไม่ขออนุมัติก่อน!** เมื่อแก้โค้ดขั้นที่ 1 ผ่านแล้ว ให้แชทใหม่คำนวณ Scope รอบสั้นและเสนอขออนุมัติจากผู้ใช้ก่อน (แนะนำทดสอบ **4 แนวหลักตัวแทน** + 1 แนวเพลงช้า เช่น `sala-khunawut`, `dee-nitipong`, `boy-kosiyabong`, `asanee-chotikul`):
  * **`gemini-3.8-flash` (`POST /api/advance/architect`):** ~4 เพลง เพื่อยืนยันคำร้องเพลงช้าไม่ล้น Budget, ไม่มีฟลุต Intro, ไม่มีหางเงียบ Outro
  * **`gemini-3.8-flash-tts` (`POST /api/advance/tts-cue`, `modelTier: 'pro-tts'`, `vocalMode: 'singing-demo'`):** ประมาณ 4–8 คลิป (เช่น ท่อน Verse/Chorus ของ 2–4 เพลงตัวอย่าง) เพื่อทดสอบฝังลง `song.vocalTakes` และ `bar.vocalAudio` แล้ว Export ออกเป็น `.mp3`
  * **อัตราค่าบริการอ้างอิงจาก Official Gemini Pricing Docs (ถึง 31 ธ.ค. 2026):**
    * `gemini-3.8-flash-tts` Standard Tier: Free Tier = ฟรี (ภายใต้โควตา), Paid Tier = Input `$0.50 / 1M` text tokens, Output `$9.00 / 1M` audio tokens (`25 audio tokens/sec` หรือราว `$0.00225` ต่อเสียงยาว `10 วินาที`)

### ขั้นที่ 3: ทดสอบบน Chrome + Export MP3 มีเสียงร้องจริง (`qa-results/track1b-retest/`)
1. เปิด Dev Server ด้วย `$env:NEXT_PUBLIC_BILLING_MODE='standalone'; npm run dev`
2. ทดสอบใน Chrome จริง:
   * กด **`▶ เล่นท่อนนี้`** (เช็กว่าจบ 1 รอบแล้วหยุดจริง) และ **`🔁 ลูปท่อนนี้`** (กดแล้วเล่นทันที)
   * กด **`🗣️ อ่านเนื้อท่อนนี้ (0 เครดิต)`** และสังเกต **Live Lyric Strip** ขณะเล่น
   * กด **`🎙️ เสียงร้องไกด์ AI (gemini-3.8-flash-tts)`** ฝังลงท่อน/ห้อง
   * กด **`🎚️ จัดวงอัตโนมัติ (0 เครดิต)`** และ **`⤵ ปัดคำลง`**
   * ดาวน์โหลดไฟล์ครบ 3 อย่างต่อเพลงตัวอย่างเก็บใน `qa-results/track1b-retest/<style-id>/`:
     * `offline-3d-mix-vocal.mp3` (ต้องโชว์ `Soundfonts 4/4` และ `Vocal Sources >= 1`)
     * `lyrics.lrc`
     * `lyrics-chords.txt`
3. วิเคราะห์ `.mp3` ด้วย `ffprobe` + `ffmpeg` (`volumedetect` & `silencedetect`) **และเปิดฟังจริงด้วย `read_file`** ส่งลิงก์ให้ผู้ใช้เปิดฟังเทียบกับไฟล์เดิมจาก Track 1 — เมื่อผู้ใช้ยืนยันว่าผ่านมาตรฐานแล้ว จึงเข้าสู่ **Sprint A Track 2 (`lyria-3.5`)** ต่อไป

---

## 📝 บันทึกปิดเฟส (หลังทำ Phase 7E เสร็จ)
* อัปเดตบันทึกสรุปผลโค้ดและผลเทสต์ทั้งหมดลงใน `PROGRESS_LOG.md` ตามรูปแบบหัวข้อ `### [Phase 7E]`
* คืนค่า `localStorage` ใน Chrome ให้กลับเป็นค่าสะอาด (`AI 15`)
