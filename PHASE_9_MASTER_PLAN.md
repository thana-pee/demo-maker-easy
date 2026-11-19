# 🎼 PHASE 9 MASTER PLAN (`SINGABLE_PHRASING_AND_STORY_BLUEPRINT_V1`) — แก้ปัญหาคำร้องแน่น/หายใจไม่ทันครบทุกสไตล์, ระบบพักหายใจในเมโลดี้ และ Story Blueprint & Anchor Lines

> **รหัสแผนงาน:** `PHASE_9_MASTER_PLAN` (`SINGABLE_PHRASING_AND_STORY_BLUEPRINT_V1`)  
> **วันที่จัดทำ:** 2026-11-19  
> **สถานะล่าสุด:** ✅ DONE — ดำเนินการครบทั้ง **Phase 9A–9E** (ต่อยอดจาก `Phase 8A–8E`, ทดสอบแบบ Offline/Mocked `245/245` ผ่านทั้งหมด)  
> **ไฟล์แผนเดิม (คงไว้ไม่ทับ):** `IMPLEMENTATION_PLAN.md`, `UPGRADE_PLAN_V3.md`, `STUDIO_EVOLUTION_PLAN_V4.md`, `STUDIO_EVOLUTION_PLAN_V4_TH.md`, `PHASE_7_MASTER_PLAN.md`, `PHASE_7E_SPRINT_A5_PLAN.md`, `PHASE_8_MASTER_PLAN.md`  
> **เป้าหมายหลัก 5 แกน:**  
> **1. ฟิสิกส์งบพยางค์ร้องหายใจทันครบ 6 กลุ่มสไตล์ (21 นักแต่งเพลง + 7 แนวเพลง) + ตัวนับ/ตัดพยางค์ไทยแม่นยำ** →  
> **2. ระบบเล่าเรื่องเพลงแบบเต็มอารมณ์ + ล็อกประโยคเปิด/ฮุค/ปิด (`Story Brief & Anchor Lines`) + รวบยอดกระจายฉากใน JSON Call เดียว (0 เครดิตเพิ่ม)** →  
> **3. Melody & Breath Engine มีช่องพักหายใจจริง (Mid-bar + Trailing Rest), ยึดจุดเว้นวรรคในเนื้อร้อง และแก้บั๊กคีย์ `C` ค้าง / โน้ตกองทับกันใน `3/4` & `6/8`** →  
> **4. แก้บั๊ก API Pipeline (Re-sync `melodyNotes` หลัง Post-Polish, ล็อกช่วง BPM, Auto-trim ใน `/api/advance/lyrics`, คุม `hum-to-song`) + ช่องหายใจ AI Vocal TTS (`audioTrim.ts`)** →  
> **5. UI คุมความโปร่ง 3 ระดับ (`โปร่งสบาย` / `พอดีสไตล์` / `คำแน่นมีจังหวะ`), Live HUD `พยางค์/วิ`, จุดแบ่งลมหายใจบน Teleprompter และ Unit/Integration Tests ครบ**

---

## 📊 ตารางติดตามสถานะแต่ละเฟส (Phase Status Tracker)

| เฟส | สถานะ | ชื่อเฟส | ไฟล์เป้าหมายหลัก | สรุปสิ่งที่จะได้ |
|---|---|---|---|---|
| **Phase 9A** | ✅ DONE | **Singable Syllable Physics, Thai Syllabification & 21-Style Few-Shot Overhaul** | `src/types/song.ts`, `src/lib/aiPrompts.ts`, `src/lib/songArchitect.ts`, `src/lib/sectionUtils.ts`, `src/lib/thaiRhymeHelper.ts` | สมการงบพยางค์อิงเวลาจริงต่อห้อง (`barSec`) ครบ 6 กลุ่มสไตล์, ปรับ Few-Shot ทั้ง 21 นักแต่งเพลง + 7 แนวเพลง + โหมดจำลองให้โปร่งตรงงบ, แก้ความแม่นยำตัวนับ/ตัดพยางค์ไทย และเปิดสัมผัสสระยืดหยุ่นสำหรับวรรคสั้น 4–6 พยางค์ |
| **Phase 9B** | ✅ DONE | **Story Brief, Emotional Arc & Anchor Lines (`StoryBlueprint`)** | `src/types/song.ts`, `src/lib/aiPrompts.ts`, `src/components/EasyModeStarterModal.tsx`, `src/components/AdvanceModeModal.tsx`, `src/components/ContinueStoryModal.tsx` | ขยายช่องไอเดียเพลงจาก "1 ประโยค" เป็นช่องเล่าเรื่องเสรี (~1,200 ตัวอักษร) + Smart Structure Hint + แผงเสริม Story Blueprint (ลำดับอารมณ์, ประโยคเปิด, ประโยค/คำฮุคแบบ Exact/Flexible, ประโยคปิด), เพิ่ม `storyBlueprint` ก่อน `sections` ใน JSON Schema (0 เครดิตเพิ่ม), กฎ Smart Anchor Splitting + ปกป้อง Anchor ในรอบ Post-Polish |
| **Phase 9C** | ✅ DONE | **Breathable Melody Engine & Time-Signature / Key / Register Fixes** | `src/lib/melodyUtils.ts`, `src/lib/songArchitect.ts`, `src/app/api/advance/cohesive-polish/route.ts`, `src/app/api/advance/lyrics/route.ts`, `src/components/SectionBuilder.tsx`, `src/components/MiniPianoRollModal.tsx` | ใช้จุดเว้นวรรคในเนื้อร้องแบ่งวลีพูดจริง (ไม่ผ่ากลางคำ), บังคับ **Trailing Breath Rest** (`2–4 steps`) และ **Mid-Bar Breath Gap** (`1–2 steps`) โดยไม่ยืดโน้ตทับช่องพัก, แก้บั๊ก `buildDiatonicGuideNotesForChord` ที่ฮาร์ดโค้ด `totalSteps: 16` + คีย์ `C` + ไม่รับ `vocalProfile` (แก้โน้ตกองทับที่ step 11 ใน `3/4` & `6/8`) |
| **Phase 9D** | ✅ DONE | **API Pipeline Fixes & Natural AI Vocal Breathing Alignment** | `src/app/api/advance/architect/route.ts`, `src/app/api/advance/lyrics/route.ts`, `src/app/api/advance/hum-to-song/route.ts`, `src/lib/audioTrim.ts`, `src/lib/sectionUtils.ts` | **แก้บั๊กสำคัญ:** Regenerate `melodyNotes` ใหม่หลัง Post-Polish แก้เนื้อร้อง, ล็อกช่วง `bpm` จาก AI (±8 BPM), ขยายเพดาน Polish สำหรับเพลง 7–9 ท่อน, เพิ่ม 1-Pass Auto-Trim ใน `/api/advance/lyrics`, เติมงบพยางค์ให้ `hum-to-song`, และขยาย `breathReserveSec` + แยกบรรทัด TTS (`\n`) ลดการเร่งสปีด WSOLA |
| **Phase 9E** | ✅ DONE | **UI Pacing Controls, Live `พยางค์/วิ` HUD, Teleprompter Breath Visuals & Full Test Suite** | `src/components/EasyModeStarterModal.tsx`, `src/components/AdvanceModeModal.tsx`, `src/components/SectionBuilder.tsx`, `src/components/KaraokeTeleprompter.tsx`, `src/lib/i18n.ts`, `tests/phase9_singable_phrasing.test.ts`, `tests/*.test.ts` | ปุ่มคุมความโปร่ง 3 ระดับ (`airy` / `balanced` / `dense`), ป้ายอัตราเร็วร้องจริง `X.X พยางค์/วิ` พร้อมเตือนเมื่อปรับ BPM เร็วเกินคำเดิม, แสดงจุดพักหายใจกลางห้องบน Teleprompter, ชุด Unit/Integration Tests ใหม่ + อัปเดตเทสเก่าให้ผ่าน 100% |

---

## 🔍 0. ผลออดิทปัญหาเชิงลึกทั้งระบบ (12 Root Causes & Coupled Variables)

> **ข้อมูลอ้างอิงจริงจากการตรวจไฟล์ผลลัพธ์ QA 17 สไตล์ (`qa-results/track1-17-styles/*/song.json` & `lyrics-audit.md`) และโค้ดต้นฉบับทั้งหมด ณ วันที่ 2026-11-19:**

1. **สมการงบพยางค์กลับด้านกับเวลาจริงต่อห้อง (`src/lib/aiPrompts.ts:900-1070`)**
   - ในอัตราจังหวะ `4/4` เวลา 1 ห้องคือ `barSec = 240 / BPM` → `68 BPM = 3.53 วิ/ห้อง`, `96 BPM = 2.50 วิ/ห้อง`, `120 BPM = 2.00 วิ/ห้อง`
   - แต่ `getSyllableBudgetForBpm()` เดิมตั้งงบสวนทางกับเวลาจริง: พอ `80–115 BPM` กระโดดเป็น `7–11 พยางค์/ห้อง`, พอ `>115 BPM` กระโดดเป็น `8–12 พยางค์/ห้อง`, และกลุ่ม `DENSE_FLOW_WRITERS` (`joey-boy`, `the-toys`) พุ่งไปถึง **`8–16 พยางค์/ห้อง`**
   - **หลักฐาน QA จริง:** `sek-loso` (`108 BPM`, `2.22 วิ/ห้อง`) ออกมาเฉลี่ย `8.8` สูงสุด `10` พยางค์ (**4.0–4.5 พยางค์/วิ**), `the-toys` (`96 BPM`, `2.50 วิ/ห้อง`) ออกมาเฉลี่ย `12.5` สูงสุด `14` พยางค์ (**5.0–5.6 พยางค์/วิ**), `stamp-apiwat` (`94 BPM`) เฉลี่ย `9.8` สูงสุด `11` พยางค์ (**3.85–4.31 พยางค์/วิ**) — ที่ผ่านมาแก้เฉพาะจุดไว้แค่ `asanee-chotikul` (`≥104 BPM`) กับป๊อปช้า (`64–72 BPM`) เท่านั้น

2. **Few-Shot Contradiction Bias (`src/lib/aiPrompts.ts:488-797`, `src/lib/songArchitect.ts:817-1319`)**
   - ตัวอย่างใน `MASTER_LYRIC_FEW_SHOT_BANK` และ `buildStyledSimulatedSongLyrics()` เกือบทุกสไตล์ยังยาว **8–14 พยางค์** (เช่น `thai-pop` 9–12, `luk-thung` 9–11, `boy-kosiyabong` 10–11, `stamp-apiwat` 10–12, `fongbeer-rock/pop` 10–11, `the-toys` 12–14) ยกเว้นเพียง `thai-rock`, `dee-nitipong`, `asanee-chotikul`, `piercing-sting`
   - **หลักฐาน QA จริง:** เพลงช้า `64–68 BPM` ที่ตั้งงบ 4–7 พยางค์อย่าง `seefa` (เฉลี่ย `10.0`, เกินงบ `11` ห้อง), `phaiboon-butkhan` (เฉลี่ย `9.8`, เกินงบ `11` ห้อง), `chali-intrawichit` (เฉลี่ย `8.1`, เกินงบ `10` ห้อง), `sala-khunawut` (เฉลี่ย `8.3`, เกินงบ `11` ห้อง) หลุดงบแทบทุกห้องเพราะ AI ก๊อปปี้ความยาวตามตัวอย่าง Few-Shot

3. **Melody Engine ไม่มีช่องพักหายใจ (`src/lib/melodyUtils.ts:274-519`)**
   - ใน `generateLyricAlignedGuideMelody()` พยางค์สุดท้ายของทุกห้องใช้ `durationSteps = totalSteps - step` ทำให้น้ำหนักโน้ตลากยาวชน **`step 16/16` (`restSteps = 0`)** ติด Beat 1 ของห้องถัดไปทุกห้อง
   - พยางค์คำเป็น (`phon.isLiveSyllable`) กลางห้องถูกยืด `durationSteps = Math.max(1, gapToNext)` ทับช่องว่างกลางห้อง และ `buildConversationalStepPlan()` ไม่รับค่า `bpm`, `thaiGenre`, `songwriterStyle`, `lyricDensity` จึงวางจังหวะ 16th-note รัวเหมือนกันหมด

4. **บั๊กเมโลดี้ไม่ซิงค์หลัง Post-Polish & งบ Prompt ไม่แยกท่อน (`src/app/api/advance/architect/route.ts:305-414`, `src/lib/aiPrompts.ts:1386, 1459, 1586`)**
   - เมื่อรอบ Post-Polish (`GEMINI_MODEL_LITE`) แก้ `bar.lyrics` ให้สั้นลง โค้ดใน `architect/route.ts:377-391` อัปเดตแค่ `bar.lyrics` แต่ **ไม่ Regenerate `bar.melodyNotes`** ทำให้โน้ตไกด์ยังรัวตามคำเก่าที่ยาวกว่า
   - `selectPrioritySectionsForPolish(evaluatedSections, 3)` จำกัดแค่ 3 ท่อน ทำให้เพลง `7–9` ท่อนหลุดการแก้
   - `buildEasyArchitectSystemPrompt` (`L1386`) และ `buildEasyArchitectUserPrompt` (`L1459`) ดึงงบของ `sectionType: 'verse'` เพียงท่อนเดียวไปใช้ทั้งเพลง แทนที่จะระบุงบแยก `Verse` / `Pre-Chorus` / `Chorus` / `Outro`
   - `buildRhymePolishPrompt` (`L1586`) ฮาร์ดโค้ดข้อความ `'4-6 พยางค์/วรรค'` ตายตัว ไม่สอดคล้องกับงบจริงของสไตล์ที่หลากหลาย

5. **บั๊กคีย์ `C` ค้าง, ไม่รับ `vocalProfile`, และโน้ตกองทับกันที่ `step 11` ใน `3/4` & `6/8` (`src/lib/songArchitect.ts:325-333, 549-581`, `src/app/api/advance/cohesive-polish/route.ts:130-138, 385-393`)**
   - `buildDiatonicGuideNotesForChord()` เรียก `generateLyricAlignedGuideMelody()` โดย **ฮาร์ดโค้ด `totalSteps: 16, stepsPerBeat: 4`** และไม่ส่ง `baseKey` กับ `vocalRegisterShift` (พบปัญหาเดียวกันใน `cohesive-polish/route.ts`)
   - จากนั้น `sanitizeArchitectSongProject()` (`L549-581`) clamp โน้ตสำหรับ `3/4` และ `6/8` ให้ `maxBarStep = 11` ส่งผลให้โน้ตที่อยู่ `step 12–15` **ถูกบีบมากองซ้อนกันที่ `step 11` พร้อมกันเป็นก้อนเดียวท้ายห้อง** รวมถึงคีย์ของโน้ตไกด์ถูกดึงเข้าสเกล `C Major` เสมอและช่วงเสียงชาย-หญิงได้ความสูงเดียวกัน

6. **ช่องโหว่ใน `/api/advance/lyrics` และ `/api/advance/hum-to-song` (`src/app/api/advance/lyrics/route.ts:918-944`, `src/app/api/advance/hum-to-song/route.ts`, `src/lib/aiPrompts.ts:1238, 1648-1674`)**
   - `/api/advance/lyrics` คำนวณ `rhymeValidation` แล้วส่งกลับเฉยๆ ไม่มีรอบ trim/polish เมื่อพยางค์ล้น และใน `mode: 'deep'` สั่ง AI สร้าง `3-10 โน้ต` โดยไม่บอกให้เว้น trailing breath rest
   - `/api/advance/hum-to-song` ไม่มีการส่งงบพยางค์ที่ร้องหายใจทันเข้าไปใน System/User Prompt เมื่อ AI ต้องแต่งเนื้อร้องใหม่จากเสียงฮัม

7. **ความคลาดเคลื่อนของตัวนับ/ตัดพยางค์ไทย (`src/lib/sectionUtils.ts:177-208`, `src/lib/thaiRhymeHelper.ts:395-613`)**
   - `countThaiEnglishSyllables()` นับพยางค์ตกหล่นในคำประสม/คำหลายพยางค์ (เช่น `"แสงไฟนีออนส่องสะท้อนกระจกห้องเดิมยามค่ำคืน"` มี 14 พยางค์แต่นับได้ `11`, `"ธรรมดา"` นับได้ `2`) ทำให้ประโยคที่แน่นจริงหลุดผ่านตัวตรวจ
   - `segmentThaiWordToSyllables()` แยกตัวสะกดออกมาเป็นพยางค์เกินจริงในบางคำ (เช่น `"สบายใจ"` → `ส|บา|ย|ใจ` = `4` โน้ต, `"ความทรงจำ"` → `ความ|ทร|ง|จำ` = `4` โน้ต) ทำให้สร้างโน้ตเมโลดี้ถี่กว่าคำพูดจริง

8. **วงจรเร่งสปีด AI Vocal TTS + WSOLA (`src/lib/audioTrim.ts:1061-1099`, `src/lib/vocalBoothUtils.ts:301-304`, `src/lib/sectionUtils.ts:372`)**
   - `alignAndFitVocalPhrasesToBars()` กันช่วงหายใจท้ายห้องไว้แค่ `breathReserveSec = Math.min(0.26, Math.max(0.14, barSec * 0.1))` (`0.14–0.26 วิ`) ซึ่งสั้นกว่าลมหายใจคนร้องจริง
   - พอเนื้อร้องแน่น AI TTS ร้องติดกันจนไม่มีจุดพักชัดเจน ระบบจึงบีบ pause เหลือ `85ms` และเร่งความเร็วเสียงผ่าน WSOLA `1.24x–1.35x` ซ้ำเติมให้ออกเสียงรัวขึ้นไปอีก
   - `buildSectionTtsTextPlan()` (`sectionUtils.ts:372`) เชื่อมแต่ละห้องด้วย `", "` (จุลภาค) แทนการเว้นบรรทัด ทำให้ TTS อ่านไหลต่อเนื่องมากกว่าจะพักหายใจระหว่างห้อง

9. **กฎบังคับสัมผัสต่อเนื่องทุกวรรคกดดันให้ AI เติมคำฟุ่มเฟือย (`src/lib/aiPrompts.ts:1129-1130`, `src/lib/thaiRhymeHelper.ts:1185-1242`)**
   - การบังคับส่งสัมผัสท้ายวรรคเข้าต้นวรรคถัดไปทุกคู่พร้อมห้ามใช้สระซ้ำในวรรคสั้น 4–6 พยางค์ บีบให้ AI เติมคำเชื่อม/คำสร้อยเพื่อรับสัมผัสจนพยางค์ทะลุงบ

10. **AI เปลี่ยน BPM หนีงบที่คำนวณไว้ + ขาด HUD แจ้งเตือนเมื่อผู้ใช้ปรับ BPM ทีหลัง**
    - ใน `architect/route.ts` งบคำนวณจาก `preset.bpmByTempo[tempoFeel]` แต่ `sanitizeArchitectSongProject()` ยอมรับค่า `bpm` ใดก็ได้ระหว่าง `55–160` จาก AI — หาก AI คืน BPM สูงกว่าค่า preset มาก งบพยางค์จะคลาดเคลื่อนทันที และใน `SectionBuilder.tsx:1750` ยังไม่แสดงอัตรา `พยางค์/วิ` เพื่อเตือนเมื่อผู้ใช้เร่ง BPM ทีหลัง

11. **ช่องว่างเว้นวรรคในเนื้อร้องถูกลบทิ้ง (`src/lib/melodyUtils.ts:228-360`)**
    - `segmentThaiWordToSyllables()` ลบช่องว่างออกทั้งหมดแล้ว `buildConversationalStepPlan()` แบ่งครึ่งด้วย `Math.ceil(count / 2)` ทำให้มักผ่ากลางคำภาษาไทย (เช่น `หัว | ใจ`) แทนที่จะใช้ช่องเว้นวรรคในบรรทัดเป็นจุดแบ่งลมหายใจกลางห้อง

12. **ช่องใส่ไอเดียเพลงจำกัดแค่ "1 ประโยค" และขาด Story Blueprint (`src/components/EasyModeStarterModal.tsx:1201-1219`, `src/lib/aiPrompts.ts:1487`)**
    - ช่องกรอก `rows={2}` เขียนไกด์ว่า `"1 ประโยค"` และโยนข้อความดิบทั้งก้อนเข้า Prompt โดยไม่มีขั้นตอนรวบยอด/กระจายฉากลงรายท่อน — เมื่อผู้ใช้พิมพ์เล่าเรื่องราวหลายประโยค AI จะยัดข้อมูลทั้งหมดลงใน Verse 4 ห้อง ทำให้คำแน่นทะลัก
    - ไม่มีช่องให้กำหนด **การไล่ระดับอารมณ์ (Emotional Progression)** หรือ **ล็อกประโยคเปิด / คำสำคัญในท่อนฮุค / คำปิดท่อนจบ** และรอบ Post-Polish มีสิทธิ์ลบคำสำคัญที่ผู้ใช้ต้องการออก

---

## 🎛️ 1. ตารางมาตรฐานความโปร่งของคำร้องและช่องหายใจ (6 กลุ่มสไตล์ — ครอบคลุม 21 นักแต่งเพลง & 7 แนวเพลง)

> **เกณฑ์หลัก:** คุมความเร็วร้องจริงให้อยู่ในช่วงร้องสบายตามธรรมชาติของคนจริง (**~1.8–3.0 พยางค์/วินาที** สำหรับป๊อป/ลูกทุ่ง/ร็อก และ **ไม่เกิน 3.5–4.0 พยางค์/วินาที** พร้อมช่วงพักในสายแร็ป/R&B) โดยทุกห้อง **ต้องมี Trailing Breath Rest ท้ายห้องเสมอ**

| กลุ่มสไตล์ | สไตล์ / แนวเพลงในกลุ่ม | งบพยางค์ 4/4 (ช้า ≤76 / กลาง 77–102 / เร็ว >102 BPM) | งบเฉพาะ Chorus Bar 1 & Outro | Trailing Rest ท้ายห้อง (จาก 16 steps) | Mid-Bar Rest & คาแรกเตอร์การวางเมโลดี้ |
|---|---|---|---|---|---|
| **1. เอื้อนลูกคอ / กวีคลาสสิก** | `luk-krung`, `luk-thung` (ช้า–กลาง), `chali-intrawichit`, `phaiboon-butkhan`, `chonlathi-thanthong`, `sala-khunawut` | **ช้า:** `4–6`<br>**กลาง:** `4–6`<br>**เร็ว:** `5–7` | Chorus Bar 1: `4–5`<br>Outro: `3–5` | **3–4 steps**<br>*(~0.75–1 จังหวะ)* จบไม่เกิน step 12–13 | เน้นคำเป็นสระเสียงยาวท้ายวรรค ลากโน้ตคำท้าย 3–4 steps ก่อนปล่อยช่องว่างให้เอื้อน/หายใจ |
| **2. ป๊อปซึ้ง / อินดี้ / โฟล์กละมุน** | `thai-pop` (ช้า–กลาง), `acoustic-indie`, `none`, `boy-kosiyabong`, `seefa`, `fongbeer-pop`, `wasu-haohan`, `nga-caravan` | **ช้า:** `4–6`<br>**กลาง:** `5–7`<br>**เร็ว:** `5–7` | Chorus Bar 1: `4–5`<br>Outro: `3–5` | **2–3 steps**<br>*(~0.5–0.75 จังหวะ)* | แบ่ง 2 วลีพูดธรรมชาติ + พักกลางห้อง **1–2 steps** (Beat 1–2 แล้วพักเข้า Beat 3) ไม่ยืดโน้ตทับช่องพัก |
| **3. ป๊อปฮิต / หมัดฮุคคม** | `thai-pop` (Hit/Upbeat), `dee-nitipong`, `tan-lipta`, `stamp-apiwat` | **ช้า:** `4–6`<br>**กลาง:** `5–7`<br>**เร็ว:** `5–7` | Chorus Bar 1: `4–5` *(Punchline)*<br>Chorus Bar 2–3: `5–7`<br>Bar 4: `4–6` · Outro: `3–5` | **2–3 steps** | เน้นจังหวะเขบ็ต 1 ชั้น (8th-note groove) ชัดเจน ไม่รัว 16th-note เพื่อเข้าหมัดฮุค Beat 1 ห้องถัดไปคมๆ |
| **4. ไทยร็อก / พลังเต็มปอด** | `thai-rock`, `phuea-chiwit` (ร็อก), `asanee-chotikul`, `sek-loso`, `kob-bigass`, `fongbeer-rock`, `suea-thanapol` | **Ballad (<98 BPM):** `5–7`<br>**Rock (≥98 BPM):** `4–6` | Chorus Bar 1: `4–5`<br>Outro: `3–5` | **3–4 steps**<br>จบไม่เกิน step 11–12 | ปัก Beat 1 และ Beat 3 หนักแน่น เปิดท้ายห้องให้สูดหายใจเต็มปอดและให้กีตาร์ `riff-fills` (step 10–14 ใน `barPlanner.ts`) ตอบ |
| **5. สามช่า / ลูกทุ่งโจ๊ะ / สโลแกน** | `phuea-chiwit` (สามช่า), `luk-thung` (เร็ว), `aed-carabao`, `suraphon-sombatcharoen` | **Verse:** `5–7` *(สูงสุด 8)*<br>**Chorus/สโลแกน:** `5–6` | Chorus Bar 1: `4–6`<br>Outro: `3–5` | **2–3 steps** | คำสั้นคมคล้องจองในวรรค ลงบีตโจ๊ะสามช่า/ลูกทุ่งโดยไม่ยืดยาวจนลิ้นพันที่ 110–120 BPM |
| **6. แร็ป-ป๊อป / Melodic R&B** | `thai-rnb`, `the-toys`, `joey-boy` | **`the-toys`/R&B:** ช้า `5–7` · กลาง `6–9` · เร็ว `6–8`<br>**`joey-boy`:** Verse `7–10` · Chorus `5–8` | Chorus Bar 1: `5–7`<br>Outro: `4–6` | **อย่างน้อย 2 steps**<br>*(ไม่ชน step 16)* | **Burst + Pocket:** รัวพยางค์ชิดช่วง Beat 1–2.5 แล้วเว้นหายใจ/ปล่อยคำเปิดช่วง Beat 4 สลับห้องแน่นกับห้องโปร่ง |

**ตัวปรับสากล (Universal Modifiers):**
- **อัตราจังหวะ `3/4` และ `6/8` (`totalSteps = 12`):** ลดเพดาน `max` ลง **1 พยางค์** จากตาราง 4/4 (ขั้นต่ำไม่ต่ำกว่า `3`) และกัน **Trailing Rest `2–3 steps`** (จบไม่เกิน step 9–10)
- **ห้องที่มี 2 คอร์ด (`chordsPerBar === 2`):** แบ่งคำเป็น 2 กลุ่มสั้นรับคอร์ด Beat 1 และ Beat 3 โดย **ห้ามเพิ่มงบพยางค์**
- **โหมดความโปร่ง 3 ระดับ (`LyricDensityMode`):**
  - `'airy'` (โปร่งสบาย): ลด `max` ลง `1` พยางค์, เพิ่ม `restSteps +1`
  - `'balanced'` (พอดีสไตล์ — ค่าเริ่มต้น): ใช้ค่ามาตรฐานในตาราง
  - `'dense'` (คำแน่นมีจังหวะ): เพิ่ม `max` ได้ `+1` ถึง `+2` พยางค์ (ยกเว้นกลุ่ม 6 ไม่เกิน `11`) โดยยัง **บังคับเหลือ `restSteps >= 1–2`**

---

## 🛠️ Phase 9A — Singable Syllable Physics, Thai Syllabification & 21-Style Few-Shot Overhaul

### เป้าหมาย
ปรับฐานคณิตศาสตร์ของงบพยางค์ ตัวอย่างใน Prompt โหมดจำลอง และตัวนับ/ตัดคำไทยให้เป็นมาตรฐานเดียวกันทั้งระบบ

### ไฟล์เป้าหมาย
1. `src/types/song.ts`
2. `src/lib/aiPrompts.ts`
3. `src/lib/songArchitect.ts`
4. `src/lib/sectionUtils.ts`
5. `src/lib/thaiRhymeHelper.ts`

### รายละเอียดการแก้ไข
1. **เพิ่ม Type Definitions ใน `src/types/song.ts`:**
   - `export type LyricDensityMode = 'airy' | 'balanced' | 'dense';`
   - `export type VocalPhrasingProfile = 'lyrical-sustain' | 'conversational-pop' | 'punchy-hook' | 'rock-anthem' | 'groove-bounce' | 'burst-pocket';`
   - `export type StoryAnchorMode = 'exact' | 'flexible';`
   - `export interface StoryBlueprintInput { storyArcPreset?: string; customEmotionalArc?: string; openingAnchor?: string; hookAnchor?: string; hookAnchorMode?: StoryAnchorMode; closingAnchor?: string; }`
   - เพิ่ม `lyricDensity?: LyricDensityMode` และ `storyBlueprint?: StoryBlueprintInput` ใน `EasyArchitectInput` และ `SongProject.easyConfig`
2. **ปรับปรุง `getSyllableBudgetForBpm()` ใน `src/lib/aiPrompts.ts`:**
   - ขยาย `SyllableBudgetOptions` ให้รับ `lyricDensity?: LyricDensityMode`, `chordsPerBar?: 1 | 2`
   - ขยาย `SyllableBudget` ให้คืนค่าเพิ่ม: `restSteps: number`, `midBarRestSteps: number`, `phrasingProfile: VocalPhrasingProfile`, `maxSyllablesPerSec: number`
   - คำนวณ `min`, `max`, `restSteps`, `midBarRestSteps` ตามตาราง 6 กลุ่มสไตล์ด้านบน + ตัวปรับ `3/4`/`6/8`, `chordsPerBar === 2`, `sectionType`, และ `lyricDensity`
   - ระบุใน `guidance` ชัดเจนให้ **ใส่เว้นวรรค 1 ช่องตรงจุดพักหายใจกลางห้อง** (เช่น `"ใจแข็ง  เหมือนหินผา"`, `"ลมพัดเบาๆ  ในคืนเหงา"`)
3. **อัปเดต Prompt Builders ใน `src/lib/aiPrompts.ts`:**
   - **`MASTER_LYRIC_FEW_SHOT_BANK`:** รีไรต์ตัวอย่างทั้ง **7 แนวเพลง**, **21 สไตล์นักแต่งเพลง**, และ **6 โหมดจบเพลง** ให้ทุกบรรทัดมีจำนวนพยางค์อยู่ในช่วงงบใหม่จริง (4–7 พยางค์สำหรับกลุ่ม 1–5 และ 6–10 พยางค์สำหรับ `joey-boy`/`the-toys` พร้อมจุดเว้นวรรคกลางห้อง)
   - **`buildEasyArchitectSystemPrompt` & `buildEasyArchitectUserPrompt`:** แทนที่การส่งงบของ `'verse'` อย่างเดียวด้วย **Per-Section Budget Breakdown** (`Verse`, `Pre-Chorus`, `Chorus (Bar 1 vs Bar 2-4)`, `Bridge`, `Outro`) และบอกเวลาต่อห้องจริง (`barSec` วินาที) ให้ AI เห็นภาพความเร็วเพลง
   - **`buildRhymePolishPrompt`:** ลบข้อความฮาร์ดโค้ด `'4-6 พยางค์/วรรค'` (`L1586`) เปลี่ยนเป็นรับ `budgetLabel` / `expectedMin..expectedMax` ของแต่ละท่อนจริง + เพิ่มฟิลด์ `lockedAnchors?: string[]` เพื่อห้ามลบคำสำคัญของผู้ใช้
4. **ปรับโหมดจำลองใน `src/lib/songArchitect.ts`:**
   - อัปเดต `buildStyledSimulatedSongLyrics()` ให้ทุกสไตล์ (ทั้ง 21 นักแต่งเพลงและทุกแนวเพลง) มีจำนวนพยางค์กระชับตรงตามงบใหม่และมีจุดเว้นวรรคกลางห้องเป็นธรรมชาติ (ทั้ง `language: 'th'` และ `'en'`)
5. **ปรับตัวนับ/ตัดพยางค์และกติกาความคล้องจอง (`src/lib/sectionUtils.ts`, `src/lib/thaiRhymeHelper.ts`):**
   - **`countThaiEnglishSyllables` (`sectionUtils.ts`):** แก้เคสคำประสม/คำ 3+ พยางค์ที่นับตก (`ธรรมดา` → 3, `แสงไฟนีออน...` → 14, ตัวการันต์, อักษรนำ/ควบกล้ำ, คำซ้ำ `ๆ`)
   - **`segmentThaiWordToSyllables` (`thaiRhymeHelper.ts`):** ป้องกันการแยกตัวสะกดออกมาเป็นพยางค์เดี่ยว (เช่น `สบายใจ` ไม่แตกเป็น `ส|บา|ย|ใจ` 4 พยางค์, `ความทรงจำ` ไม่แตกเป็น `ความ|ทร|ง|จำ`)
   - **`validateThaiLyricCouplets` (`thaiRhymeHelper.ts`):** รองรับ `allowCoupletOrAlternateRhyme` สำหรับสไตล์วรรคสั้น 4–6 พยางค์ (`AABB` / `ABAB` หรือท้ายชนต้น/กลางวรรค) เพื่อไม่ให้ AI ถูกบีบให้เติมคำเชื่อมจนพยางค์เกินงบ

### เกณฑ์ทดสอบ (Phase 9A)
- ทุกคู่ `(21 นักแต่งเพลง × 3 เทมโป ช้า/กลาง/เร็ว)` มีค่า `max / barSec <= maxSyllablesPerSec`
- ทุกบรรทัดตัวอย่างใน `MASTER_LYRIC_FEW_SHOT_BANK` และ `buildStyledSimulatedSongLyrics()` มีพยางค์ไม่เกินงบของสไตล์นั้นๆ

---

## 📖 Phase 9B — Story Brief, Emotional Arc & Anchor Lines (`StoryBlueprint`)

### เป้าหมาย
เปลี่ยนช่องกรอกไอเดียเพลงจากข้อจำกัด "1 ประโยค" ให้รองรับเรื่องราวเต็มรูปแบบ พร้อมระบบ **Distill → Split Across Sections → Anchor Protection** โดย **ไม่เพิ่มรอบเรียก API และไม่เพิ่มเครดิต**

### ไฟล์เป้าหมาย
1. `src/types/song.ts`
2. `src/lib/aiPrompts.ts`
3. `src/components/EasyModeStarterModal.tsx`
4. `src/components/AdvanceModeModal.tsx`
5. `src/components/ContinueStoryModal.tsx`

### รายละเอียดการแก้ไข
1. **ต่อยอด `ARCHITECT_RESPONSE_SCHEMA` ใน `src/lib/aiPrompts.ts`:**
   - เพิ่ม Property `storyBlueprint` **ไว้ด้านบนก่อน `sections`** ใน `ARCHITECT_RESPONSE_SCHEMA`:
     - `coreTheme` (`string`): แก่นอารมณ์หลัก 1 ประโยคที่รวบยอดจากเรื่องราวทั้งหมด
     - `emotionalArcSummary` (`string`): สรุปการไต่ระดับอารมณ์จาก Intro → Outro
     - `sectionBeats` (`array` of `{ sectionType, beatGoal, imageryKeywords[] }`): ระบุชัดว่าท่อนไหนเล่าเฉพาะเหตุการณ์ส่วนใด
   - การวาง `storyBlueprint` ก่อน `sections` ทำให้ LLM ทำ Chain-of-Thought เชิงโครงสร้างรวบยอดเรื่องราวก่อนเริ่มเขียนบรรทัดแรกของเนื้อเพลงจริง โดยเสียแค่ Output tokens เล็กน้อยใน Request เดิม (0 เครดิตเพิ่ม)
2. **อัปเดต Prompt Rules สำหรับ Story Brief & Anchors ใน `src/lib/aiPrompts.ts`:**
   - **Rule 1 — Scene Distribution (ห้ามยัดทั้งเรื่องลงท่อนเดียว):** แจกแจงให้ AI แบ่งเรื่องเล่าของผู้ใช้เป็นช่วงๆ ตามจำนวนท่อนที่มี (ถ้ามี `Verse 1` และ `Verse 2` ให้แบ่งเหตุการณ์ต้นเรื่อง/กลางเรื่อง; `Pre-Chorus` เก็บปมความอัดอั้น; `Chorus` สรุปหัวใจหลัก; `Outro` ปิดภาพจำสุดท้าย)
   - **Rule 2 — Anchor Placement & Exact/Flexible Mode:**
     - `openingAnchor` → วางเปิดที่ `Verse 1 Bar 1` (หรือแบ่ง `Bar 1–2` ถ้ายาวเกินงบ 1 ห้อง)
     - `hookAnchor` + `hookAnchorMode` → วางใน `Chorus`: หากเลือก `'exact'` ต้องคงวลีเดิมเป๊ะ (อนุญาตให้แบ่งลง 2 ห้องติดกันได้); หากเลือก `'flexible'` อนุญาตให้ปรับคำเชื่อมท้ายเล็กน้อยเพื่อส่งสัมผัสและคงความโปร่ง
     - `closingAnchor` → วางปิดที่ `Outro`
   - **Rule 3 — Smart Anchor Splitting:** ถ้าระบุประโยค Anchor ยาวเกิน `budget.max` ของ 1 ห้อง ห้ามบีบทั้งหมดลงห้องเดียวและห้ามตัดคำของผู้ใช้ทิ้ง ให้ **แบ่งประโยคนั้นลง 2 ห้องติดกันอย่างเป็นจังหวะ** (เช่น `"รักเธอเท่าเดิม  แต่เดินต่อไม่ไหว"` → Bar 1: `"รักเธอเท่าเดิม"`, Bar 2: `"แต่เดินต่อไม่ไหว"`)
   - ส่งข้อมูล Anchors & Story Notes เข้าไปใน `buildLyricsUserPrompt`, `buildSingleBarVariationsUserPrompt`, และ `buildRhymePolishPrompt` ด้วย
3. **อัปเกรด UI ใน `src/components/EasyModeStarterModal.tsx`:**
   - แก้ Step 5 (`L1201-1219`): เปลี่ยนป้ายเป็น *"5. เล่าเรื่องราว / ไอเดียเพลงของคุณ (สั้นหรือยาวก็ได้):"* และขยายเป็น `rows={4}` (รองรับได้ถึง ~1,200 ตัวอักษร พร้อมแสดงตัวนับอักขระเบาๆ)
   - **Smart Structure Hint:** เมื่อ `topic.trim().length > 180` หรือมีหลายบรรทัด (`\n`) และปัจจุบันยังเลือก `'standard-5'` ให้แสดงแถบแนะนำ (Non-blocking) ชวนสลับเป็น `'full-hit-7'` ใน 1 คลิกเพื่อให้มี `Verse 1 + Verse 2` กระจายเรื่องโดยไม่ยัดคำแน่น
   - **แผงเสริมแบบพับเปิดได้ (Collapsible Optional Panel) — `🎯 กำหนดการไล่ระดับอารมณ์ & ล็อกประโยคสำคัญ`:**
     - **Emotional Arc Preset:** Dropdown เลือกเร็ว (`อัตโนมัติตามเรื่องเล่า`, `เหงาเริ่มเรื่อง → อัดอั้น → ระเบิดความจริง → จุกนิ่ง`, `แอบชอบ → ลุ้นใจเต้น → บอกรัก → ยิ้มอบอุ่น`, `เหนื่อยท้อ → กัดฟันสู้ → ปลุกพลัง → ภูมิใจ`, `หวนนึกถึงอดีต → คิดถึงสุดใจ → ยอมรับปล่อยวาง`, `กำหนดเอง...`)
     - **Opening Anchor:** ช่องพิมพ์ประโยค/ภาพเปิดท่อนเริ่ม (Optional)
     - **Must-Have Hook Phrase:** ช่องพิมพ์คำ/ประโยคที่อยากให้มีในท่อนฮุค + สวิตช์ `ใช้คำเป๊ะ (Exact)` vs `เกลาให้เข้าจังหวะ/สัมผัสได้ (Flexible)`
     - **Closing Anchor:** ช่องพิมพ์คำทิ้งท้าย/บทสรุปท่อนจบ (Optional)
   - แสดงสรุป `storyBlueprint` ที่ AI รวบยอดให้เห็นใน Stage Preview คู่กับ `producerNotes`
4. **อัปเกรด `AdvanceModeModal.tsx` และ `ContinueStoryModal.tsx`:**
   - รองรับการใส่บริบทเรื่องเล่ายาวขึ้น + ช่อง **"ประโยค/คำที่ต้องมีในท่อนนี้ (Optional)"**

---

## 🌬️ Phase 9C — Breathable Melody Engine & Time-Signature / Key / Register Fixes

### เป้าหมาย
ทำให้โน้ตเมโลดี้ไกด์ทุกห้องมีช่องพักหายใจจริง วางโน้ตตรงวลีพูดภาษาไทย ไม่ตกคีย์ `C` และไม่กองทับกันท้ายห้องในเพลงจังหวะ `3/4` หรือ `6/8`

### ไฟล์เป้าหมาย
1. `src/lib/melodyUtils.ts`
2. `src/lib/songArchitect.ts`
3. `src/app/api/advance/cohesive-polish/route.ts`
4. `src/app/api/advance/lyrics/route.ts`
5. `src/components/SectionBuilder.tsx`
6. `src/components/MiniPianoRollModal.tsx`

### รายละเอียดการแก้ไข
1. **เพิ่ม Phrase-Aware Splitting ใน `src/lib/melodyUtils.ts`:**
   - เพิ่มฟังก์ชัน `splitThaiLyricPhraseGroups(line: string): string[][]` ที่แยกกลุ่มคำตาม **ช่องว่าง (`\s+` หรือ `  `) ก่อน** แล้วค่อยตัดแต่ละกลุ่มเป็นพยางค์ด้วย `segmentThaiWordToSyllables`
   - เมื่อมี 2 กลุ่มคำธรรมชาติ (หรือมากกว่า) ให้ใช้จุดแบ่งระหว่างกลุ่มคำเป็นรอยต่อ **Group 1 (Beats 1–2) | Mid-Bar Breath Gap | Group 2 (Beats 3–4)** แทนการหารครึ่งด้วย `Math.ceil(count / 2)` (Fallback ไปแบ่งใกล้กึ่งกลางเฉพาะกรณีทั้งบรรทัดเขียนติดกันไม่มีเว้นวรรค โดยพยายามไม่ผ่ากลางคำที่มาจาก `Intl.Segmenter`)
2. **บังคับ Trailing Breath Rest & Mid-Bar Breath Gap ใน `src/lib/melodyUtils.ts`:**
   - เพิ่ม Options ใน `GenerateLyricAlignedMelodyOptions` และ `ConversationalStepPlanOptions`:
     `bpm?: number`, `timeSignature?: TimeSignature`, `thaiGenre?: ThaiSongGenre`, `songwriterStyle?: ThaiSongwriterStyle`, `lyricDensity?: LyricDensityMode`, `restSteps?: number`, `midBarRestSteps?: number`
   - คำนวณ `effectiveTotalSteps = timeSignature === '3/4' || timeSignature === '6/8' ? 12 : 16`
   - คำนวณ `effectiveRestSteps` (อิงจาก `getSyllableBudgetForBpm(...)` หากไม่ส่งมาโดยตรง: ปกติ `2–4` ใน 16 steps และ `2–3` ใน 12 steps)
   - กำหนดเพดานตำแหน่งจบเสียง **`singingCeiling = totalSteps - effectiveRestSteps`** (ต้องมีช่องเงียบท้ายห้องเหลือจริงอย่างน้อย `effectiveRestSteps` steps และโน้ตสุดท้าย **`lastNote.step + lastNote.durationSteps <= singingCeiling`** เสมอ!)
   - **แก้จุดลากเสียงทับช่องพักกลางห้อง:** พยางค์สุดท้ายของ Group 1 ต้องจำกัด `durationSteps` ไม่ให้ลากชน `step` แรกของ Group 2 อย่างน้อย `midBarRestSteps` (เช่น `1` step ใน 8–9 พยางค์ หรือ `1–2` steps ใน 4–7 พยางค์) เพื่อให้ได้ยินการเว้นหายใจกลางประโยคจริง
3. **แก้บั๊ก `baseKey`, `totalSteps` และ `vocalRegisterShift` ทุกจุดเรียก:**
   - **`src/lib/songArchitect.ts`:**
     - ขยาย `buildDiatonicGuideNotesForChord()` และ `sanitizeBar()` ให้รับ `ctx: { baseKey: string; timeSignature: TimeSignature; bpm: number; vocalProfile: VocalProfile; thaiGenre?: ThaiSongGenre; songwriterStyle?: ThaiSongwriterStyle; lyricDensity?: LyricDensityMode }`
     - ส่ง `totalSteps` (`12` เมื่อ `3/4`/`6/8`, `16` เมื่อ `4/4`), `stepsPerBeat` (`4` สำหรับ `4/4` และ `3/4`, `2` สำหรับ `6/8`), `baseKey`, และ `vocalRegisterShift` (`female: +3`, `male: -4`, `neutral: 0`) เข้า `generateLyricAlignedGuideMelody()`
     - ใน `sanitizeArchitectSongProject()` หาก AI ส่ง `melodyNotes` มาไม่ครบ หรือ `timeSignature` เป็น `3/4`/`6/8` ที่ step เกิน `11` ให้สังเคราะห์ใหม่ด้วย `totalSteps = 12` (ห้าม clamp ไปกองที่ `step 11`)
   - ส่งบริบทเพลงเต็มรูปแบบแบบเดียวกันใน `cohesive-polish/route.ts`, `lyrics/route.ts`, `SectionBuilder.tsx` (`L3791`), และ `MiniPianoRollModal.tsx` (`L291`)

---

## ⚙️ Phase 9D — API Pipeline Fixes & Natural AI Vocal Breathing Alignment

### เป้าหมาย
อุดรอยรั่วใน API Routes ทั้ง 3 เส้น (`architect`, `lyrics`, `hum-to-song`) ให้เนื้อร้องกับเมโลดี้ซิงค์กัน 100% หลัง Polish และปรับ DSP ของ AI Vocal TTS ให้ไม่เร่งสปีดจนฟังเหนื่อย

### ไฟล์เป้าหมาย
1. `src/app/api/advance/architect/route.ts`
2. `src/app/api/advance/lyrics/route.ts`
3. `src/app/api/advance/hum-to-song/route.ts`
4. `src/lib/audioTrim.ts`
5. `src/lib/sectionUtils.ts`

### รายละเอียดการแก้ไข
1. **`src/app/api/advance/architect/route.ts`:**
   - **แก้บั๊ก Critical — Regenerate `melodyNotes` หลัง Polish:** ในบล็อก `L377-391` เมื่อ `nextLines` แทนที่ `bar.lyrics` ของท่อนใด ให้เรียก `buildDiatonicGuideNotesForChord(...)` (พร้อม `baseKey`, `timeSignature`, `bpm`, `vocalProfile`, `thaiGenre`, `songwriterStyle`, `lyricDensity`) เพื่อสร้าง `bar.melodyNotes` ใหม่ให้ตรงกับจำนวนพยางค์และวรรณยุกต์ใหม่ทันที
   - **Clamp BPM ไม่ให้หลุดงบ:** คุม `song.bpm` ที่ได้จาก AI ให้อยู่ในช่วง `[recommendedBpm - 8, recommendedBpm + 8]` (เว้นแต่ผู้ใช้กำหนดเอง)
   - **ขยายเพดาน Polish สำหรับเพลง 7–9 ท่อน:** ปรับ `selectPrioritySectionsForPolish(evaluatedSections, Math.min(5, evaluatedSections.length))` และส่ง `anchorPhrases` ของผู้ใช้ + งบ `expectedMin..expectedMax` ของแต่ละท่อนเข้า `buildRhymePolishPrompt()`
   - คืนค่า `storyBlueprint` (ถ้ามีในผลลัพธ์ AI) ใน `AdvanceArchitectResponseBody`
2. **`src/app/api/advance/lyrics/route.ts`:**
   - หาก `rhymeValidation.outOfBudgetBars` มีห้องที่พยางค์เกิน `expectedMax` (โดยเฉพาะกลุ่มจังหวะช้า-กลาง หรือมี anchor) และมีเวลา budget เหลือ ให้เรียก 1-pass `GEMINI_MODEL_LITE` polish สั้นๆ (`maxOutputTokens: 1024`, `timeoutMs: 8000`) แล้วนับ `syllables`, `phonetics`, `rhymeValidation`, และสร้าง `melodyNotesPerBar` ใหม่ (รวมถึงใน `mode: 'deep'` ให้ระบุคำสั่ง Rest ท้ายห้องใน Prompt และ clamp/fix ปลายห้องด้วย)
3. **`src/app/api/advance/hum-to-song/route.ts` & `src/lib/aiPrompts.ts`:**
   - ส่งงบพยางค์ที่ร้องหายใจทันและกฎ Rest ท้ายห้องเข้าไปใน `buildHumToSongSystemPrompt()` และ `buildHumToSongUserPrompt()` และใช้ `sanitizeArchitectSongProject()` กับบริบทเต็ม
4. **`src/lib/audioTrim.ts` (`alignAndFitVocalPhrasesToBars`) & `src/lib/sectionUtils.ts` (`buildSectionTtsTextPlan`):**
   - ขยาย `breathReserveSec` ใน `audioTrim.ts:1061` จากเดิม `Math.min(0.26, Math.max(0.14, barSec * 0.1))` เป็น `Math.min(0.45, Math.max(0.22, barSec * 0.16))` เพื่อให้เสียงร้อง AI TTS แต่ละห้องมีช่องลมหายใจก่อนเข้า Beat 1 ห้องถัดไปจริง
   - ผ่อนการบีบ pause ใน `audioTrim.ts:1087` จาก `keepPauseMs: 85` เป็น `keepPauseMs: 120` และจำกัด WSOLA speedup ใน bar-aligned phrases ไม่ให้เกิน `1.18x`
   - ปรับ `buildSectionTtsTextPlan()` (`sectionUtils.ts:372`) ให้คั่นแต่ละห้องด้วย `'\n'` (หรือกำหนดผ่าน option เช่น separator `'\n'`) แทน `', '` เพื่อกระตุ้นให้ `gemini-3.8-flash-tts` หยุดหายใจสั้นๆ ระหว่างบรรทัดมากขึ้น
   - **⚠️ หมายเหตุสำคัญสำหรับเทส:** `tests/sprintb.test.ts:415` มี assertion `assert.equal(shortPlan.text, 'รักเธอเสมอ, ไม่เคยเปลี่ยนไป');` — หากเปลี่ยน default separator ของ `buildSectionTtsTextPlan` ต้องอัปเดตเทสนี้ (หรือใส่ parameter `separator` โดยที่ UI caller ใน `SectionBuilder.tsx` ส่ง `'\n'`) เพื่อไม่ให้เทสเก่าพังโดยไม่ตั้งใจ

---

## 🎨 Phase 9E — UI Pacing Controls, Live `พยางค์/วิ` HUD, Teleprompter Breath Visuals & Full Test Suite

### เป้าหมาย
ให้ผู้ใช้เลือกความโปร่ง-แน่นของคำร้องได้ตามรสนิยม เห็นอัตราเร็วร้องจริงบนการ์ดท่อนเพลง อ่านจุดพักหายใจบนหน้าคาราโอเกะได้ทันที และครอบคลุมด้วยการทดสอบอัตโนมัติทั้งระบบ

### ไฟล์เป้าหมาย
1. `src/components/EasyModeStarterModal.tsx`
2. `src/components/AdvanceModeModal.tsx`
3. `src/components/SectionBuilder.tsx`
4. `src/components/KaraokeTeleprompter.tsx`
5. `src/lib/i18n.ts`
6. `tests/phase9_singable_phrasing.test.ts` (สร้างใหม่)
7. `tests/phase5a.test.ts`, `tests/phase6_thai_lyrics_ux.test.ts`, `tests/phase7a.test.ts`, `tests/phase8b.test.ts`, `tests/sprintb.test.ts`, `tests/sprintc.test.ts` (อัปเดตให้ตรงเกณฑ์ใหม่)

### รายละเอียดการแก้ไข
1. **ตัวเลือกความโปร่งของคำร้อง 3 ระดับ (`LyricDensityMode`):**
   - เพิ่ม Segmented Control 3 ปุ่มใน `EasyModeStarterModal.tsx` (ทั้งแท็บ Idea และส่งต่อเป็น default ให้แท็บเพลง) และ `AdvanceModeModal.tsx` แท็บ AI Lyrics:
     - `🌬️ โปร่ง สบาย` (`'airy'`) — คำน้อย หายใจกว้าง ร้องลากหางเสียงได้เต็มที่
     - `🎵 พอดีสไตล์ (แนะนำ)` (`'balanced'`) — ค่าเริ่มต้นตามตาราง 6 กลุ่มสไตล์
     - `⚡ คำแน่น มีจังหวะ` (`'dense'`) — สำหรับแนวเล่าเรื่อง/ฮิปฮอป/R&B ที่อยากใส่คำมากขึ้น (ยังกัน rest ≥ 1–2 steps)
   - เพิ่มคำแปล TH/EN ใน `src/lib/i18n.ts`
2. **Live `พยางค์/วิ` Pacing Badge ใน `SectionBuilder.tsx`:**
   - ในส่วน HUD (`SectionBuilder.tsx:1750`) คำนวณ `avgSylPerSec` และ `maxSylPerSec` ของท่อนนั้นเทียบกับ `barSec` ของ `song.bpm` ปัจจุบัน
   - แสดงป้ายสถานะ เช่น `⚡ 2.4 พยางค์/วิ (ร้องสบาย)` หรือเมื่อผู้ใช้หมุน BPM เร็วขึ้นจนเกินเกณฑ์ (>3.4 พยางค์/วิ ในเพลงทั่วไป) แสดงคำแนะนำเบาๆ ให้ลดคำหรือกดเกลาให้กระชับ
3. **Teleprompter Breath Visuals ใน `KaraokeTeleprompter.tsx`:**
   - เมื่อ `bar.lyrics` มีจุดเว้นวรรคคู่หรือช่องพักกลางห้อง แสดงตัวคั่นจังหวะหายใจแบบบางเบา (เช่นช่องว่างกว้างขึ้นเล็กน้อยหรือสัญลักษณ์ `·` สีจาง) เพื่อให้นักร้องอ่านแบ่งวรรคหายใจตามจังหวะเพลงได้ทันที
4. **ชุดทดสอบอัตโนมัติ (`tests/phase9_singable_phrasing.test.ts`):**
   - **Test 1 — 6-Group Physics Matrix:** วนทดสอบทุก `ThaiSongwriterStyle` (21 สไตล์) × 3 เทมโป (`70`, `94`, `118` BPM) × `4/4`, `3/4`, `6/8` × `airy/balanced/dense` ยืนยันงบพยางค์และ `restSteps >= 2`
   - **Test 2 — Few-Shot & Simulated Consistency:** ตรวจทุกบรรทัดใน `MASTER_LYRIC_FEW_SHOT_BANK` และ `buildStyledSimulatedSongLyrics()` ว่าอยู่ในเพดานงบใหม่ของแต่ละสไตล์จริง (ไม่มี Few-Shot 10–14 พยางค์ในเพลงช้า 4–6 พยางค์อีก)
   - **Test 3 — Melody Breath & Rest Invariants:** ตรวจ `generateLyricAlignedGuideMelody()` ในหลายความยาวพยางค์ (4, 6, 8, 10 พยางค์) ยืนยันว่าโน้ตสุดท้ายจบก่อน `totalSteps - restSteps` เสมอ (ไม่ชน `16/16` หรือ `12/12`), จุดเว้นวรรคในข้อความกำหนด boundary ระหว่าง Group 1 และ Group 2, และไม่มีโน้ตทับช่องพักกลางห้อง
   - **Test 4 — `3/4` & `6/8` + Key + Register Fixes:** ยืนยัน `sanitizeArchitectSongProject()` เมื่อ `timeSignature: '3/4'` และ `'6/8'` สร้างโน้ตใน `0..11` ไม่กองทับที่ step 11, ใช้คีย์จริง (`baseKey: 'D'`, `'Em'`) ไม่ค้างที่ `'C'`, และ `vocalProfile: 'female'` สูงกว่า `'male'`
   - **Test 5 — Post-Polish Re-Sync & Anchor Protection:** จำลองผล `architect/route.ts` (mock หรือ unit helper) ยืนยันว่าเมื่อรอบ polish หั่นเนื้อร้องสั้นลง `melodyNotes` ถูกสร้างใหม่ตรงตามคำใหม่ และ `hookAnchor` / `openingAnchor` ไม่ถูกลบทิ้ง
   - **Test 6 — Story Blueprint Schema & Thai Syllables:** ยืนยัน `ARCHITECT_RESPONSE_SCHEMA` มี `storyBlueprint` ก่อน `sections` และทดสอบ `countThaiEnglishSyllables` + `segmentThaiWordToSyllables` กับเคสเดิมที่เคยพลาด (`ธรรมดา`, `สบายใจ`, `ความทรงจำ`, `แสงไฟนีออนส่องสะท้อนกระจกห้องเดิมยามค่ำคืน`)
5. **อัปเดต Legacy Assertions ในเทสเดิมที่ผูกกับงบแน่นแบบเก่า:**
   - ตรวจสอบและปรับให้สอดคล้องใน `tests/phase5a.test.ts` (`L88-98`), `tests/phase6_thai_lyrics_ux.test.ts`, `tests/phase7a.test.ts` (`L223-303`), `tests/phase8b.test.ts` (`L218-255`), `tests/sprintb.test.ts` (`L350-416`), `tests/sprintc.test.ts` (`L364-376`)

---

## ✅ 7. เกณฑ์ตรวจรับงานขั้นสุดท้าย (Verification Gates & Documentation)

เมื่อลงมือแก้ครบแต่ละเฟสและหลังจบ `Phase 9E` ต้องรันคำสั่งตรวจรับงานต่อไปนี้ให้ผ่านทั้งหมดก่อนปิดงาน:
1. `npx tsx --test tests/*.test.ts` — ต้องผ่าน **100% ทุกไฟล์** (0 failures, 0 skipped assertions)
2. `npm run lint` — ต้องผ่าน **0 errors**
3. `npm run build` — Production build (`next build`) ต้อง Compile ผ่านสมบูรณ์
4. อัปเดตตารางสถานะและบันทึกการเปลี่ยนแปลงลง [PROGRESS_LOG.md](file:///d:/Demo%20maker%20easy/PROGRESS_LOG.md)
5. **คำเตือนเรื่อง Live Gemini API QA:** หากต้องการทดสอบยิง `POST /api/advance/architect` หรือ `tts-cue` จริงด้วย `GEMINI_API_KEY` ต้องแจ้งโมเดล, ขอบเขตการใช้งาน และประมาณการค่าใช้จ่ายให้ผู้ใช้ยืนยันก่อนทุกครั้งตามกฎ Cost Guard

---

## 💬 8. ชุดคำสั่งเริ่มต้นสำหรับเปิดแชทใหม่ (New-Chat Starter Prompts)

### ตัวเลือกที่ 1: ให้ทำต่อเนื่องครบทั้ง 5 เฟสอย่างรอบคอบ (แนะนำ)
> ก๊อปปี้ข้อความด้านล่างไปวางในแชทใหม่ได้เลย (แนะนำพิมพ์ `/goal` นำหน้าหรือเปิดโหมดวางแผนถ้ารองรับ):

```text
ช่วยดำเนินการปรับปรุงระบบแต่งเพลงและสร้างเมโลดี้ตามแผนงานในไฟล์ @PHASE_9_MASTER_PLAN.md ให้ครบทุกเฟสตั้งแต่ Phase 9A ถึง Phase 9E ตามลำดับ

กติกาการทำงาน:
1. อ่าน @PHASE_9_MASTER_PLAN.md ให้เข้าใจครบก่อนลงมือ และตรวจสอบไฟล์ที่เกี่ยวข้องก่อนแก้ทุกครั้ง
2. ทำทีละเฟสอย่างรอบคอบ (9A -> 9B -> 9C -> 9D -> 9E) หลังจบแต่ละเฟสให้รันเทสที่เกี่ยวข้องเพื่อกันผลกระทบย้อนหลัง
3. รักษาพฤติกรรมและ Test Contract เดิมที่ไม่ขัดกับแผนใหม่ และอัปเดต Legacy Assertions ที่ระบุใน Phase 9E ให้ตรงกับมาตรฐานใหม่
4. เมื่อจบครบทุกเฟส ให้รัน `npx tsx --test tests/*.test.ts`, `npm run lint`, และ `npm run build` ให้ผ่านทั้งหมด แล้วสรุปผลพร้อมอัปเดต @PROGRESS_LOG.md และ @PHASE_9_MASTER_PLAN.md (ห้ามยิง Live Gemini API ที่เสียค่าใช้จ่ายโดยไม่ขออนุญาตก่อน)
```

### ตัวเลือกที่ 2: สั่งทำและตรวจรับทีละเฟส (คุมรายละเอียดทีละขั้น)
> ใช้เริ่มจากเฟสแรก แล้วค่อยสั่งเฟสถัดไปเมื่อตรวจผลเฟสก่อนหน้าเรียบร้อย:

```text
อ่านแผนงานใน @PHASE_9_MASTER_PLAN.md แล้วเริ่มลงมือทำเฉพาะ **Phase 9A** ก่อน (ปรับฟิสิกส์งบพยางค์ 6 กลุ่มสไตล์, Few-Shot ทั้ง 21 สไตล์, โหมดจำลอง, และแก้ความแม่นยำตัวนับ/ตัดพยางค์ไทย)

หลังจากแก้ไขเสร็จ ให้สร้าง/รัน Unit Test ตรวจสอบงบพยางค์ของทุกสไตล์และทุกเทมโป พร้อมรัน `npx tsx --test tests/*.test.ts` เพื่อเช็กผลกระทบ แล้วสรุปรายงานให้ตรวจก่อนไปต่อ Phase 9B
```
