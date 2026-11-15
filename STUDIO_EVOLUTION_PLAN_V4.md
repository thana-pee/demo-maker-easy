# STUDIO_EVOLUTION_PLAN_V4 — Demo Maker Easy v4.0 Master Upgrade Specification (Phase 5A–5F)

> **Plan Code:** `STUDIO_EVOLUTION_PLAN_V4` (v4.1 — New Plan Document; preserves `IMPLEMENTATION_PLAN.md` v2.0 and `UPGRADE_PLAN_V3.md` Phase 4A–4E untouched)  
> **Created:** 2026-11-13 (Updated: 2026-11-14)  
> **Purpose:** Autonomous execution specification for Demo Maker Easy v4.0 — unifying **AI Easy Mode**, **Studio-Grade System Prompts (`aiPrompts.ts`)**, **Hum-to-Song Capture**, **Full Continuous Real Vocal Recording ("อัดเสียงร้องจริง")**, **Live-to-MP3 Studio Audio Parity**, and **Google Auth + Server Wallet + PromptPay Auto-Slip Billing**. Each phase is self-contained with exact `[EXISTING]` vs `[NEW]` targets, schemas, DSP/AI contracts, and mandatory verification checks.

---

## 📊 Phase Status Tracker

| Phase | Status | Title | Scope Summary |
|---|---|---|---|
| **Phase 5A** | ✅ DONE | Real Gemini SDK, Pro Prompt Architecture & Credit Economics | Migrate `geminiClient.ts` to `@google/genai` SDK (`gemini-3.8-flash` / `3.5-flash-lite`), build hardened Thai/Producer System Prompts (`src/lib/aiPrompts.ts`), strict JSON Schema outputs, usage tracking, `CREDIT_PRICING_TABLE` (`15` starter trial credits), and 0-credit Local Cost Router. |
| **Phase 5B** | ✅ DONE | Easy Mode Starter & Inline AI Architect | Progressive **Easy Mode -> Fine-Tune** entry flow (`SongProject`-bound 1-click whole-song generation + 3-knob Easy Preview Card), Inline Contextual AI triggers inside sections, Thai Rhyme/Syllable validator & Songwriter Progress Checklist. |
| **Phase 5C** | ✅ DONE | Hum-to-Song Draft & Vocal Guide Synth | Early-stage Hum/Voice capture converted to key/BPM/chord draft via `gemini-3.8-flash` (Audio input) + optional `gemini-3.5-transcribe`, plus improved Vocal Melody Guide playback (`MelodySynth` & optional `gemini-3.8-flash-tts` cue guide). |
| **Phase 5D** | ✅ DONE | Continuous Real Vocal Booth (อัดเสียงร้องจริง) | Upgrade `KaraokeTeleprompter` + `MicRecorder` from 1-bar-only takes to continuous **Section / Whole-Song Vocal Recording** with headphone backing playback, 1-bar pre-roll, Multi-Take slots (IndexedDB), Auto Latency calibration, Studio FX presets & Vocal Auto-Ducking. |
| **Phase 5E** | ✅ DONE | Live vs MP3 Export Parity & Realism Boost | Extract shared isomorphic DSP (`audioDspShared.ts` + `audioEngine.ts`), upgrade `mp3Exporter.ts` to render `smplr` Soundfont buffers (`CacheStorage`) + `LeadGuitarTrackGainNode` (`WaveShaperNode` drive/cab) + `VocalStudioTrackGainNode` + continuous `vocalTakes` + Auto-Ducking + `Instrumental Karaoke Only` toggle, bass/fret humanization in `barPlanner.ts`, and Paid-Only `lyria-3.5` AI Reference Track (`8 Credits`). |
| **Phase 5F** | ✅ DONE | Google Sign-In, Server Credit Wallet & PromptPay Auto-Slip Top-Up | Add 1-click Google OAuth onto Supabase Auth (`AccountSyncModal.tsx`), move credit balance/deduction to server-enforced Supabase Postgres Ledger (anti-tamper via `20261114_phase5f_wallet_billing.sql` & `serverWallet.ts`), and implement real EMVCo PromptPay QR (`promptpayQr.ts`) + Auto Slip Verification (`transRef` deduplication & exact 5-layer amount/account/expiry checks). |

---

## 🧩 0. Template Reuse Audit (From `UPGRADE_PLAN_V3.md`) & Complete Creator Flow

### 0.1 Template Reuse Evaluation (~82% Reused + ~18% Upgraded)
- **Reused Directly (~82%):** Kept `UPGRADE_PLAN_V3.md`’s proven structure — Document Header/Purpose, `Phase Status Tracker` table, `Target Files`, `Detailed Engineering Specs`, `Tests`, and mandatory `PROGRESS_LOG.md` + build/test sync protocol.
- **Upgraded in V4 (~18%):**
  1. **Real Public Model Policy:** Replaced non-API labels (`gemini-4-hydrogen`, `gemini-2.5-flash`) with verified public Gemini Developer API model IDs (`gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-3.5-transcribe`, optional `gemini-4-argon`, optional `lyria-3.5`).
  2. **Data & UX Flow Contract per Phase:** Added explicit `Existing vs New` clarity so continuous vocal takes (`Phase 5D`) integrate cleanly without breaking per-bar `SongBar.vocalAudio` (`Phase 2B`/`4C`).
  3. **Cost Guard & Multi-Viewport QA:** Added token usage reporting + Playwright/Browser checks (Desktop `16:9`, iPad `4:3`, Mobile `9:16`) alongside unit tests and Next.js build checks.

### 0.2 End-to-End Creator Workflow (Voice Input -> Easy AI -> Fine-Tune -> Real Vocal -> Master MP3)
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. START (เลือกได้ 2 ทาง)                                               │
│   • ทาง A: Easy Mode (เลือกแนว/โทนเสียง + พิมพ์ 1 ประโยค) [4 เหรียญ]    │
│   • ทาง B: Hum-to-Song (ฮัมทำนอง/ร้องเปล่า 10–15 วิ)       [3 เหรียญ]   │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼  (AI เสกโครงเพลงลง SongProject จริง)
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. EASY PREVIEW CARD (คุมง่าย 3 ปุ่มก่อนลงลึก — ปรับเองฟรี 0 เหรียญ)   │
│   [▶ ฟังเดโม]  • คีย์ร้อง (Transpose/Capo) • ความแน่นวง • ความเร็ว BPM    │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼  (กดปุ่ม "เข้าโหมดปรับละเอียด")
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. FINE-TUNE STUDIO (Songwriter / Arranger)                              │
│   • แก้คอร์ด/เนื้อ/เมโลดี้เอง: 0 เหรียญ | ให้ AI ช่วย 1 ท่อน: 1 เหรียญ   │
│   • ใช้ระบบ [EXISTING] SectionBuilder + Inline AI Co-Pilot [Phase 5B]    │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼  (ดนตรีพร้อม! สลับไปโหมด 🎤 คาราโอเกะ/บูธอัด)
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. REAL VOCAL BOOTH (อัดเสียงร้องจริงทับเพลงที่แต่งเสร็จ — ฟรี 0 เหรียญ)│
│   • ฟังดนตรีเต็มวง + ไกด์เมโลดี้ผ่านหูฟัง พร้อมเนื้อร้องเลื่อนตามบีต        │
│   • อัดรวดเดียวทั้งท่อน/ทั้งเพลง • เลือก Take 1/2/3 • ชดเชย Latency + FX  │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼  (ผสมเสียงร้องจริง + วงดนตรีระดับสตูดิโอ)
┌─────────────────────────────────────────────────────────────────────────┐
│ 5. MASTER EXPORT (.MP3 192kbps / MIDI / LINE Share — ฟรี 0 เหรียญ)       │
│   • เสียง Export ตรงกับ Live 100% (smplr + WaveShaper Amp + Auto-Duck)   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 0.3 API Pricing, Credit Cost Schedule & Profit-Protection Model
> Baseline: Lowest package (`Studio Pack`: `800 Credits (700 + 100 bonus) / 499 THB` = `0.624 THB/credit`; net after ~4% payment gateway/slip fee ≈ **`0.60 THB/credit`** @ `35 THB/USD`). Packages: **Mini** `49฿ = 50 cr`, **Starter** `99฿ = 100 + 10 (110 cr)`, **Pro** `249฿ = 300 + 40 (340 cr)`, **Studio** `499฿ = 700 + 100 (800 cr)`. Margins below are verified against BOTH 2026 rates and scheduled **Dec 2026 / Jan 2027 Gemini API price increases**.

| Action / Feature | Model / Engine | Est. API Cost (THB) 2026 → 2027+ | Button Credit Price | Client Cost (0.62–0.98฿) | Worst-Case Net Margin |
|---|---|---|---|---|---|
| Rhyme Lookup, Local Director, Chords, Real Vocal Booth, MP3/MIDI Export | Local Client / Web Audio (`0 API`) | `0.00฿` | **0 เหรียญ (ฟรี)** | ฟรี | — |
| Quick 1-Section Lyrics or AI Studio Config (`ai-director` complex prompt) | `gemini-3.5-flash-lite` (Text) | `~0.08–0.11฿` | **1 เหรียญ** | `0.62–0.98฿` | **~82–87%** |
| Single-Section Deep Rewrite + Melody Contour (`2` pass cap) | `gemini-3.8-flash` | `~0.17฿ → ~0.34฿` | **2 เหรียญ** | `1.25–1.96฿` | **~72–86%** |
| Hum-to-Song (`<= 45s` Audio -> Key/BPM/Chords/Lyrics) | `gemini-3.8-flash` (+ opt `3.5-transcribe`) | `~0.32–0.50฿ → ~0.65–0.83฿` | **3 เหรียญ** | `1.87–2.94฿` | **~54–72%** |
| Easy Mode Whole-Song Architect (`4–6` sections + chords + lyrics + melody) | `gemini-3.8-flash` (strict schema + max 1 polish) | `~0.66–0.95฿ → ~1.31–1.80฿` | **4 เหรียญ** | `2.50–3.92฿` | **~25–73%** |
| Optional AI Voice Rhythm/Speech Cue (`<= 30s` / 1 section) | `gemini-3.8-flash-lite-tts` / `flash-tts` | `~0.16–0.24฿ → ~0.32–0.48฿` | **2 เหรียญ** | `1.25–1.96฿` | **~60–87%** |
| Optional Pro Complex Jazz/Arranger (*Paid Credits Only*) | `gemini-4-argon` | `~1.60฿ → ~3.15฿` | **10 เหรียญ** | `6.24–9.80฿` | **~48–73%** |
| Optional AI Inspiration Reference Track (*Paid Credits Only*) | `lyria-3.5` (`$0.08/song`) | `~2.80฿` (fixed) | **8 เหรียญ** | `4.99–7.84฿` | **~42%** |

**Mandatory Anti-Loss Guardrails:**
1. **Explicit Button Cost Badge + Pre-Call Confirmation:** Every API-backed button displays its exact credit badge (`⚡ 1`, `⚡ 3`, `⚡ 4`, etc.) inline on the button and confirms before deducting. Never mislabel a billable Gemini call as `"0 Credits"` (`AdvanceModeModal.tsx` must route `0 Credits` strictly to local regex `aiSongDirector.ts`, charging `1 Credit` whenever complex prompts invoke Gemini).
2. **Charge Only on Success + Server Token Caps:** Never deduct credits when local fallback/error occurs, and enforce `maxOutputTokens` + audio duration limits (`<= 45s` hum, `<= 30s` TTS cue) server-side so malformed prompts cannot spike token bills.
3. **Trial Credit Abuse Guard:** Adjust `DEFAULT_STARTER_CREDITS` from `30` to **`15` Welcome Trial Credits** (enough for 2 full Easy Mode songs + 1 Hum-to-Song + 4 section edits, capping free-user cost at `~2.5–3.5 THB`) and gate high-cost models (`gemini-4-argon`, `lyria-3.5`) strictly to users with `purchasedCredits > 0`.

---

## 🛡️ Mandatory Verification & Deployment Protocol (Required for Every Phase)

Before marking any phase `✅ DONE`:
1. **Unit Tests:** Preserve all existing tests in `tests/*.test.ts` (currently 83+ tests) and add targeted unit tests for each new phase (`tests/phase5a.test.ts` .. `tests/phase5e.test.ts`).
2. **Test Execution:** Run `npx tsx --test tests/*.test.ts` — **100% pass rate**.
3. **Lint & Production Build:**
   - Run `npx eslint .` — **0 errors, 0 warnings**.
   - Run `npm run build` — **Next.js 16.4.6 Turbopack build and TypeScript checks exit with code `0`**.
4. **Live Cost & Browser Verification (When UI or Gemini API changed):**
   - Inspect live Desktop (`16:9`), iPad (`4:3`), and Mobile (`9:16`) viewports without horizontal overflow.
   - Verify no `GEMINI_API_KEY` secret is exposed to browser bundles or logs, and capture `usage_metadata` in server response metadata.
5. **Documentation Sync:**
   - Update the Phase Status Tracker table in this file (`STUDIO_EVOLUTION_PLAN_V4.md`) from `⏳ PLANNED` to `✅ DONE`.
   - Append a structured entry in `PROGRESS_LOG.md` detailing changed files and observed command outputs.
6. **Git & Deploy (Windows PowerShell, only when ready/requested):**
   ```powershell
   git add -A; git commit -m "feat(phase-5X): <concise description>"; git push origin main
   ```

---

## ⚙️ Phase 5A: Real Gemini SDK, Pro Prompt Architecture & Credit Economics

### Goal
Replace broken/non-public `'gemini-4-hydrogen'` raw REST calls in `src/lib/geminiClient.ts` with the official `@google/genai` SDK using verified public Gemini models, build a dedicated **Studio Producer & Thai Songwriter Prompt Library (`src/lib/aiPrompts.ts`)** so paid AI output actually delights users, enforce strict schemas, and establish anti-loss credit economics.

### Target Files
- `package.json` (`[EXISTING]` — add `@google/genai`)
- `src/lib/geminiClient.ts` (`[EXISTING]` — full upgrade)
- `src/lib/aiPrompts.ts` (`[NEW]` — centralized, hardened System Prompts + Few-shot Golden Examples for Lyrics, Director, Easy Mode Architect & Hum-to-Song)
- `src/lib/creditManager.ts` (`[EXISTING]` — add centralized `CREDIT_COST_TABLE`, `trial vs paid` credit separation & Anti-Loss caps)
- `src/lib/aiSongDirector.ts` (`[EXISTING]` — upgrade local zero-credit command router)
- `src/app/api/advance/director/route.ts` (`[EXISTING]`)
- `src/app/api/advance/lyrics/route.ts` (`[EXISTING]`)
- `src/components/AdvanceModeModal.tsx` (`[EXISTING]` — remove hardcoded `'Gemini 4 Hydrogen'` text, show exact per-button Credit Cost Badges `0 / 1 / 2 / 3 / 4` & real usage status)
- `tests/phase5a.test.ts` (`[NEW]`)

### Detailed Engineering Specs
1. **Studio-Grade System Prompt Library (`src/lib/aiPrompts.ts`):**
   - Replace ad-hoc short prompts in `lyrics/route.ts` and `director/route.ts` with role-specific hardened system prompts + Thai golden few-shot examples:
     - **Thai Lyrical Craftsmanship Rules:** enforce coupled end-rhymes (`ส่งสัมผัสสระ+ตัวสะกด` across lines 1–2–3–4), match syllable count per bar to `bpm` + `timeSignature` (slow `5–8` syllables/bar, medium `7–11`, fast `<= 12`), block stiff English-to-Thai literal translations and repetitive cliché filler words, and inject **previous section summary/lyrics** so story + emotion connect cleanly from Verse -> Pre-Chorus -> Chorus.
     - **Producer Arrangement Rules:** teach frequency separation (keep `guitarLead` quiet/off during sung `verse` bars unless soft fills, swell `intensity` gently toward `chorus`, pick ergonomic `capoFret` + chords matching guitar fingering).
     - **Prompt Regression Fixtures:** store golden Thai & Acoustic Rock test prompts in `tests/phase5a.test.ts` validating structural adherence before rollout.
2. **Official `@google/genai` Client (`src/lib/geminiClient.ts`):**
   - Replace `DEFAULT_GEMINI_MODEL = 'gemini-4-hydrogen'` with tiered model constants:
     - `GEMINI_MODEL_LITE = 'gemini-3.5-flash-lite'` (`1 Credit`: quick tweaks, single-section rewrite, syllable fixes; Paid `$0.30 / $2.50` per 1M)
     - `GEMINI_MODEL_MAIN = 'gemini-3.8-flash'` (`2–4 Credits` by scope: whole-song architect, audio/hum analysis; Free Tier available, Paid `$0.75 / $3.75` -> `$1.50 / $7.50` in 2027)
     - `GEMINI_MODEL_PRO = 'gemini-4-argon'` (`10 Credits`, Paid Pack Only: deep arrangement/harmony; Paid `$2.00 / $10.00` -> `$4.00 / $20.00` Dec 2026+)
   - Use `GoogleGenAI` from `@google/genai` on the server (`process.env.GEMINI_API_KEY`) with `responseMimeType: 'application/json'`, strict `responseSchema`, and hard `maxOutputTokens` budget caps per feature.
   - Return normalized result wrapper `{ ok, data, modelUsed, usage?: { inputTokens, outputTokens, thoughtTokens }, isSimulated, failureReason? }`. Never charge credits on failed/simulated responses.
3. **Hybrid 0-Credit Local Router (`src/lib/aiSongDirector.ts`, `director/route.ts`, `creditManager.ts`):**
   - Before invoking Gemini API, detect deterministic commands (e.g., `"เพิ่มความเร็วเป็น 90"`, `"คีย์ G"`, `"ปิดกลอง"`, `"เปิดเบส 80%"`) and apply locally at **0 Credits** (`isLocal: true`).
   - Route complex natural-language studio edits to `GEMINI_MODEL_LITE` (`1 Credit`) — clearly labeling `0 Credits (โหมดด่วนในเครื่อง)` vs `1 Credit (ให้ AI อัจฉริยะวิเคราะห์)` before calling `/api/advance/director`.
4. **UI Transparency (`src/components/AdvanceModeModal.tsx`, `creditManager.ts`):**
   - Set `DEFAULT_STARTER_CREDITS = 15` (Welcome Trial) and track `purchasedCredits` vs `trialCredits` so premium paid-only models (`gemini-4-argon`, `lyria-3.5`) cannot be drained by multi-account free trials.
   - Replace `"Gemini 4 Hydrogen"` labels cleanly with active server-reported model badge (`gemini-3.5-flash-lite` / `gemini-3.8-flash` / `Local Offline`), explicit `ใช้ X เหรียญ` badge on every API button, and clear Thai diagnostics when `.env.local` lacks `GEMINI_API_KEY` or hits rate limits.

### Tests
- Unit tests verifying `aiPrompts.ts` prompt builders include syllable-BPM budgets, previous-section context & anti-cliché constraints, `@google/genai` wrapper schema handling, failure classification, and local 0-credit routing rules.

---

## ✨ Phase 5B: Easy Mode (1-Click Song Starter -> Fine-Tune) & Inline AI Architect

### Goal
Solve "blank-canvas paralysis" by adding an optional **Easy Mode Starter** before/above `songwriter` mode: users pick mood/vocal range/1-sentence idea -> AI generates a complete, valid `SongProject` strictly bounded to real in-app instruments -> users adjust 3 intuitive sliders on an Easy Preview Card -> 1-click transition to full `songwriter` / `arranger` editing. Also move AI songwriting tools inline inside section cards.

### Target Files
- `src/types/song.ts` (`[EXISTING]` — optional `projectStage` / easy metadata if needed)
- `src/app/api/advance/architect/route.ts` (`[NEW]` — unified full-song JSON generator)
- `src/lib/thaiRhymeHelper.ts` (`[EXISTING]` — add rhyme-pair post-validation helper for AI output)
- `src/lib/sectionUtils.ts` (`[EXISTING]` — add smart multi-line lyric-to-bar splitter)
- `src/components/EasyModeStarterModal.tsx` (`[NEW]` — 3-step Starter + 3-Knob Preview Card)
- `src/components/SectionBuilder.tsx` (`[EXISTING]` — add inline contextual AI quick-actions on `✨` button + workflow progress header)
- `src/app/page.tsx` (`[EXISTING]` — wire Easy Starter CTA & mode switch)
- `src/lib/i18n.ts` (`[EXISTING]` — TH/EN symmetrical copy)
- `tests/phase5b.test.ts` (`[NEW]`)

### Detailed Engineering Specs
1. **Whole-Song AI Architect (`src/app/api/advance/architect/route.ts` — `4 Credits`):**
   - Accepts `{ stylePreset, vocalProfile: 'female' | 'male' | 'neutral', tempoFeel: 'slow' | 'medium' | 'fast', topic, language: 'th' | 'en' }` with `gemini-3.8-flash` (capped tokens + max 1 rhyme polish pass).
   - Generates full `SongProject` payload validated & clamped strictly against `src/types/song.ts` unions (`GuitarModel`, `StringGauge`, `Ambience3DMode`, `SectionType`, `GuitarStyle`, `LeadGuitarStyle`, `LeadGuitarDrive`, `BassStyle`, `PianoStyle`, `DrumStyle`, `MelodySound`), including:
     - Musical structure (`intro` -> `verse` -> `pre-chorus` -> `chorus` -> `outro`) with rising/falling `intensity`
     - Diatonic + slash chords fit to vocal key (`baseKey` + helpful `capoFret`)
     - Thai lyrics per `SongBar` + guide `melodyNotes` (`step`, `midiPitch`, `durationSteps`)
   - Post-validate Thai end-rhymes using `thaiRhymeHelper.ts` syllable/group check; auto-request one targeted polish if verse/chorus couplets mismatch.
2. **Easy Mode Preview Card -> Fine-Tune Handoff (`EasyModeStarterModal.tsx`, `page.tsx`):**
   - Generate CTA always displays **`✨ เสกทั้งเพลง (ใช้ 4 เหรียญ)`** + user balance before confirmation.
   - Users hear full generated demo immediately inside the Easy Preview Card with **3 streamlined controls (0 Credits)**:
     1. *Vocal Key Fit* (`transposeSemitones` / `capoFret`)
     2. *Band Density* (Acoustic Unplugged ↔ Full Band Arrangement toggling section instruments smoothly)
     3. *Tempo* (`bpm` slider)
   - Primary CTA: **`🎛️ เข้าโหมดปรับละเอียด (Songwriter / Arranger)`** switches seamlessly into the live `SectionBuilder` with all chords, bars, mixer settings, and guide melody intact.
3. **Inline Section AI & Lyric Auto-Splitter (`SectionBuilder.tsx`, `sectionUtils.ts`):**
   - Clicking `✨` on a section opens a lightweight contextual popover showing explicit prices: *"แต่งเนื้อท่อนนี้ (1 เหรียญ)"*, *"แต่งเนื้อ + เมโลดี้ไกด์ของท่อนนี้ (2 เหรียญ)"*, *"วางเนื้อร้องยาวๆ แบ่งลงห้องอัตโนมัติ (ฟรี 0 เหรียญ)"*.
   - Display a compact 4-step progress strip matching `SongStatusTag` (`draft` -> `arranged` -> `vocal-recorded` -> `mastered`).

### Tests
- Validate schema clamping so invalid AI enum outputs never enter `SongProject`, verify lyric-to-bar splitting preserves chords/sections, and verify i18n dictionary symmetry.

---

## 🎙️ Phase 5C: Hum-to-Song Capture & Guide Track Helpers

### Goal
Connect short raw humming/singing audio clips at the **start** of songwriting to Gemini audio understanding (`gemini-3.8-flash` / optional `gemini-3.5-transcribe`) to bootstrap BPM, key, lyrics, and chord ideas, while keeping clear separation between **Guide Melody** (reference before singing) and **Real Vocal Recording** (`Phase 5D`).

### Target Files
- `src/app/api/advance/hum-to-song/route.ts` (`[NEW]`)
- `src/components/EasyModeStarterModal.tsx` (`[EXISTING]` — add "ฮัมทำนอง 10–15 วิ" tab)
- `src/components/MiniPianoRollModal.tsx` (`[EXISTING]` — improve 1-click "Generate Guide Notes from Chords" helper)
- `src/lib/melodyUtils.ts` (`[EXISTING]` — diatonic arpeggio/contour guide generator)
- `tests/phase5c.test.ts` (`[NEW]`)

### Detailed Engineering Specs
1. **Hum / Voice-to-Song API (`/api/advance/hum-to-song` — `3 Credits`):**
   - Accepts short recorded audio (`webm/wav/m4a`, `<= 45 sec` hard cap) from `MicRecorder`.
   - Uses `gemini-3.8-flash` multimodal audio understanding (and optionally `gemini-3.5-transcribe` at ~`$0.005`/min when spoken/sung lyrics need high-accuracy Thai transcription) to infer:
     - Approximate `bpm`, `timeSignature` (`4/4` / `3/4` / `6/8`), suggested `baseKey`
     - Transcribed/cleaned lyric draft lines + matching chord progression & `SongSection[]` starter
   - Always displays explicit **`🎙️ แกะฮัมเป็นโครงเพลง (ใช้ 3 เหรียญ)`** Cost Preview before running and returns `usage_metadata`.
2. **No-Cost Guide Melody Generator (`melodyUtils.ts` & `MiniPianoRollModal.tsx`):**
   - Enhance existing `MelodySynth` workflow with a **0-Credit** `"สร้างโน้ตไกด์ให้ตรงคอร์ด (ฟรี)"` helper button inside `MiniPianoRollModal` so users who cannot read notes can generate a singable rhythmic contour before stepping into the vocal booth (`Phase 5D`).
   - *(Optional Paid Add-on Flag — `2 Credits`, `<= 30s` cap)*: Optionally allow `gemini-3.8-flash-lite-tts` / `gemini-3.8-flash-tts` spoken/rhythmic cue track generation behind an explicit `ใช้ 2 เหรียญ` confirmation badge if TTS phrasing guide is enabled.

### Tests
- Unit tests for `/api/advance/hum-to-song` payload validation (size/duration cap), guide contour pitch bounds within chord/scale tones, and cost-guard confirmation gate.

---

## 🎤 Phase 5D: Continuous Real Vocal Recording Booth ("อัดเสียงร้องจริง" หลังแต่งเพลงเสร็จ) ✅ DONE

### Goal
Deliver the missing bridge between finished arrangements and finished demos: transform **Karaoke Mode (`KaraokeTeleprompter.tsx`)** + **`MicRecorder`** from a *1-bar-at-a-time scratchpad* into a **real Vocal Recording Booth** where users listen to the full arranged backing band through headphones and record continuous vocals across a whole section or whole song, pick their best take, calibrate sync, apply studio vocal polish, and save directly into IndexedDB.

### Target Files
- `src/types/song.ts` (`[EXISTING]` — add `VocalTake`, `VocalFxPreset`, and `vocalTakes?: VocalTake[]` on `SongProject`)
- `src/lib/micRecorder.ts` (`[EXISTING]` — expose studio-grade recording constraints toggle `rawStudioMic: boolean` disabling browser auto-gain/echo cancellation when wearing headphones + clean track metadata)
- `src/lib/audioStorageIdb.ts` (`[EXISTING]` — extend store/keys to persist continuous `vocalTakes` blobs alongside `bar.vocalAudio`)
- `src/lib/storage.ts` (`[EXISTING]` — dehydrate/hydrate `vocalTakes` in `saveSong` / `hydrateSongVocalsFromIdb`, strip audio from `shareUrl` / `snapshots`)
- `src/lib/audioEngine.ts` (`[EXISTING]` — schedule continuous `VocalTake` tracks aligned to `sectionStartTime` + add Studio FX presets & gentle Backing Auto-Ducking during vocal phrases)
- `src/components/KaraokeTeleprompter.tsx` (`[EXISTING]` — transform into **Karaoke Stage & Real Vocal Booth** with Rec / Pre-roll / Take Switcher / Latency Calibrator)
- `src/components/VocalBoothControls.tsx` (`[NEW]` — focused subcomponent inside Karaoke view: Record Full Song / Record Selected Section, Take 1-2-3 selector, Studio FX preset, Mic Input Meter & Sync Calibration)
- `src/components/SoundCustomizerPanel.tsx` (`[EXISTING]` — expose Track 7 Vocal FX Preset selector)
- `src/app/page.tsx` (`[EXISTING]` — auto-update `statusTag` to `'vocal-recorded'` when a vocal take is saved)
- `tests/phase5d.test.ts` (`[NEW]`)

### Detailed Engineering Specs
1. **Non-Breaking Dual Vocal Architecture (`src/types/song.ts`):**
   - Keep existing `SongBar.vocalAudio` (Phase 2B/4C) 100% compatible for bar-level humming/punch notes.
   - Add continuous take model on `SongProject`:
     ```ts
     export type VocalFxPreset = 'dry-natural' | 'studio-warm' | 'wide-chorus';
     export interface VocalTake {
       id: string;
       name: string;               // e.g., "Take 1 — Chorus", "Take 2 — Full Song"
       scope: 'full-song' | 'section';
       sectionId?: string;         // Present when scope === 'section'
       startGlobalBarIndex: number;
       preRollOffsetSec: number;   // Trim pre-roll before bar start
       latencyOffsetMs?: number;   // Per-take fine sync override
       audioDataUrl?: string;      // Dehydrated into IndexedDB (`${songId}_take_${takeId}`)
       fxPreset: VocalFxPreset;
       isActive: boolean;
       createdAt: string;
     }
     ```
2. **Real Recording Workflow inside `KaraokeTeleprompter.tsx` (`VocalBoothControls.tsx`):**
   - **Record Scope Selector:** Toggle **🎙️ อัดทั้งเพลง (Full Take)** or **🎙️ อัดเฉพาะท่อนที่เลือก (Section Punch-In)** (e.g., Verse 1 only, Chorus only).
   - **Pre-Roll + Headphone Cue:** Optional **1-Bar Backing Pre-Roll** (plays the bar right before the target section with visual countdown dots so the singer enters naturally in groove) while full band + optional Guide Melody plays cleanly.
   - **Mic Studio Mode Toggle:** Warning badge *"แนะนำใส่หูฟัง"* — turns off browser aggressive `echoCancellation` / `noiseSuppression` when wearing headphones for fuller vocal tone, or keeps them on for iPad speaker use.
   - **Multi-Take Comping:** Record Take 1, Take 2, Take 3 side by side; tap to A/B audition with backing band and activate the best take per section (automatically muting older overlapping takes unless stacked).
   - **One-Tap Latency Calibrator:** Quick calibration beep/clap utility or live millisecond nudge slider (`-150ms` to `+250ms`) right inside the Vocal Booth after recording so vocals lock tight to drums/guitar.
3. **Studio Vocal FX & Backing Auto-Ducking (`src/lib/audioEngine.ts`):**
   - Extend `VocalStudioTrackGainNode` (`95Hz HPF -> 3.8kHz Presence -> 4:1 Comp`) with selectable `VocalFxPreset`:
     - `dry-natural`: HPF + gentle 2.5:1 compression
     - `studio-warm`: Existing HPF + Presence EQ + Comp + warm reverb send boost
     - `wide-chorus`: Adds subtle Haas/short delay stereo widening (`~18ms` soft double) on active Chorus takes
   - Add smooth RMS-envelope or section/take-aware **Auto-Ducking** (`~ -2dB` gentle dip on `guitarRhythm`/`piano` mid bus when vocal track is active) so user vocals sit inside the mix without clipping.

### Tests
- Unit tests for `VocalTake` IndexedDB offload/hydration (`stripVocalsFromSong` + `hydrateSongVocalsFromIdb`), `shareUrl` bloat stripping, start time alignment math (`startGlobalBarIndex` + `preRollOffsetSec` + `latencyOffsetMs`), and multi-take active selection exclusivity.

---

## 🎧 Phase 5E: Live vs MP3 Export Parity & Studio Audio Realism

### Goal
Ensure that when users hit **Export `.MP3` (192 kbps)** after recording their real voice in Phase 5D, the exported file sounds **identical in depth, guitar tone, distortion, and mix balance** to live playback in `audioEngine.ts`, plus add optional AI Reference Track comparison (`lyria-3.5`).

### Target Files
- `src/lib/audioEngine.ts` (`[EXISTING]` — extract shared guitar amp/body DSP & Soundfont loader helpers)
- `src/lib/audioDspShared.ts` (`[NEW]` — shared isomorphic Web Audio DSP chain builders usable by both real-time `AudioContext` and `OfflineAudioContext`)
- `src/lib/mp3Exporter.ts` (`[EXISTING]` — replace raw oscillators with `smplr` Soundfont offline rendering + shared `LeadGuitarTrackGainNode` overdrive/fuzz + continuous `VocalTake` rendering + Auto-Ducking)
- `src/lib/barPlanner.ts` (`[EXISTING]` — subtle fret slide / dynamic accent humanization refinements)
- `src/components/ExportModal.tsx` (`[EXISTING]` — show progress phases: Loading Samples -> Mixing Band & Vocals -> Encoding MP3, plus mixdown status for active Vocal Takes)
- `src/app/api/advance/reference-track/route.ts` (`[NEW]` — optional Paid Tier `lyria-3.5` `$0.08/song` inspiration demo generator with hard Cost Guard confirmation)
- `tests/phase5e.test.ts` (`[NEW]`)

### Detailed Engineering Specs
1. **Shared DSP & Sampled Offline Rendering (`src/lib/audioDspShared.ts`, `src/lib/mp3Exporter.ts`):**
   - Extract `BodyResonance` EQ, `LeadGuitarTrackGainNode` (`preFilter -> preGain -> WaveShaperNode` curve -> `toneFilter -> cabFilter`), and `VocalStudioTrackGainNode` (`VocalFxPreset`) into `audioDspShared.ts` so live playback (`BaseAudioContext`) and offline export (`OfflineAudioContext`) run the **exact same DSP topology**.
   - Load/cache Soundfont instrument sample buffers (`acoustic_guitar_steel`, `acoustic_guitar_nylon`, `overdriven_guitar` and piano/bass samples where available) on `OfflineAudioContext` with graceful synth fallback only if offline network/cache misses, eliminating the thin `triangle`/`sawtooth` sound in current `mp3Exporter.ts`.
   - Mix active `song.vocalTakes` precisely at their `startGlobalBarIndex` timestamp minus `preRollOffsetSec` plus `latencyOffsetMs`, alongside any legacy `bar.vocalAudio` clips.
2. **Export Progress & Vocal Readiness UX (`src/components/ExportModal.tsx`):**
   - Display which vocal tracks are included in the render (e.g., `"รวม 3 Vocal Takes + วงเต็ม 5 ชิ้น"`) and allow quick toggle `"Instrumental Karaoke Only (ปิดเสียงร้อง)"` for exporting a backing track in one click!
3. **Optional AI Inspiration Track (`lyria-3.5` — `8 Credits`, Paid Credits Only):**
   - Available only inside Advance Mode for accounts with **`purchasedCredits > 0`** (blocked cleanly for trial-only accounts to prevent `$0.08`/song multi-account drain), displaying an explicit **`ใช้ 8 เหรียญ`** confirmation dialog before calling Gemini API.

### Tests
- Verify shared DSP builder attaches without error onto offline contexts, verify continuous `VocalTake` timing math inside `mp3Exporter.ts` scheduling helpers, verify "Instrumental Only" toggle mutes vocal takes/clips cleanly, and validate existing MP3 header sync assertions.

---

## 🔐 Phase 5F: Google Sign-In, Server Credit Wallet & PromptPay Auto-Slip Top-Up

### Goal
Prepare Demo Maker Easy for **real commercial launch (Method 2 — Fast Auto Slip Verification)**: add 1-click **Google Sign-In** on existing Supabase Auth, move credit wallets off client `localStorage` into tamper-proof **Supabase Postgres tables**, and implement **real PromptPay QR + Auto Slip Verification** (`<= 2 sec` auto-crediting with strict fraud/duplicate guards).

### Target Files
- `.env.example` (`[EXISTING]` — document `SUPABASE_SERVICE_ROLE_KEY`, `PROMPTPAY_RECEIVER_ID`, `PROMPTPAY_RECEIVER_NAME`, `SLIP_VERIFY_API_URL`, `SLIP_VERIFY_API_KEY`)
- `src/lib/cloudSync.ts` (`[EXISTING]` — add `signInWithGoogleOAuth()` + session token helper)
- `src/components/AccountSyncModal.tsx` (`[EXISTING]` — add prominent `"เข้าสู่ระบบด้วย Google"` 1-click CTA while retaining Guest offline play)
- `src/lib/creditManager.ts` (`[EXISTING]` — sync live server balance when signed in; disable client-side fake top-up in production)
- `src/lib/promptpayQr.ts` (`[NEW]` — EMVCo PromptPay QR payload generator for exact merchant ID & package THB amount)
- `src/lib/serverWallet.ts` (`[NEW]` — server-only Supabase Service Role helper for `getOrInitWallet`, `atomicDeductCredits`, `atomicRefundCredits`, `recordAutoSlipTopUp`)
- `src/app/api/billing/create-order/route.ts` (`[NEW]` — generates tracked order + exact-amount PromptPay QR)
- `src/app/api/billing/verify-slip/route.ts` (`[NEW]` — validates uploaded bank slip image against Thai Slip Verification API & credits wallet atomically)
- `src/components/AdvanceModeModal.tsx` (`[EXISTING]` — replace mock QR top-up preview with real PromptPay QR + Upload Slip dropzone + Login-to-TopUp gate)
- `tests/phase5f.test.ts` (`[NEW]`)

### Detailed Engineering Specs
1. **1-Click Google Authentication (`cloudSync.ts`, `AccountSyncModal.tsx`):**
   - Keep **Guest Mode completely free** for local songwriting, real vocal recording (`Phase 5D`), and MP3/MIDI export (`Phase 5E`).
   - Require Google Sign-In (`signInWithOAuth({ provider: 'google' })`) when claiming starter AI trial credits, triggering paid Gemini endpoints, or opening Wallet Top-Up.
2. **Tamper-Proof Server Credit Wallet (`Supabase Postgres` via `src/lib/serverWallet.ts`):**
   - Schema tables (`supabase/migrations/`):
     - `user_wallets`: `user_id (PK)`, `trial_credits` (default `15`), `purchased_credits` (default `0`), `updated_at`
     - `credit_transactions`: `id`, `user_id`, `type ('starter' | 'topup' | 'spend' | 'refund')`, `amount`, `model_used`, `usage_tokens`, `description`, `created_at`
     - `topup_orders`: `id`, `user_id`, `package_id`, `amount_thb`, `credits_granted`, `trans_ref UNIQUE`, `status ('pending' | 'verified' | 'rejected')`, `slip_metadata_json`, `created_at`
   - Perform **atomic deduction** on the server ONLY after Gemini API returns valid `ok: true` output (or deduct-then-refund atomically on failure). Never trust client `localStorage` balances for API authorization.
3. **Real PromptPay QR + Auto Slip Verification (`create-order`, `verify-slip`, `AdvanceModeModal.tsx`):**
   - Package minimum starts at `49 THB` (`Mini 49฿ / 50 cr`, `Starter 99฿ / 100+10 (110) cr`, `Pro 249฿ / 300+40 (340) cr`, `Studio 499฿ / 700+100 (800) cr`) so fixed per-slip check fees (`~0.5–1฿/slip`) preserve `>=98%` payment net efficiency across tiers.
   - `/api/billing/verify-slip` accepts multipart/base64 slip upload (`<= 4MB`) from authenticated user, forwards to server-side Slip Verification API (`SLIP_VERIFY_API_KEY`), and requires ALL **5 security checks** to pass before crediting:
     1. Authentic slip verified (`success === true`).
     2. Receiver bank account / PromptPay ID or account suffix matches `PROMPTPAY_RECEIVER_ID` / `PROMPTPAY_RECEIVER_NAME`.
     3. Paid `amount` strictly matches the selected `CreditPackage.priceThb`.
     4. **`transRef` is NOT already present** in `topup_orders` (`UNIQUE` index prevents reusing screenshots).
     5. Slip timestamp is fresh (within accepted top-up window, e.g. `<= 24 hours`).
   - *(Future Upgrade Path)*: Wallet & `topup_orders` schema supports adding Stripe/Omise PromptPay Webhook later without migrating user balances.

### Tests
- Unit tests for EMVCo PromptPay QR CRC16 checksum generation, 5-point slip validation (reject wrong receiver, underpaid amount, expired timestamp, or duplicate `transRef`), atomic wallet deduction, and non-auth `401` rejections on billing endpoints.

---

## 📅 Recommended Execution Order

1. **เริ่มจาก Phase 5A + 5B ก่อน (ลองใช้งานจริง + เช็กคุณภาพผลงานก่อนเปิดขาย):**
   - แก้ `geminiClient.ts` ต่อ `@google/genai`, สร้างคลัง `aiPrompts.ts` ให้เนื้อเพลงไทย/การจัดมิกซ์ตรงใจ, และเปิด **Easy Mode** ให้คุณได้ลองฟังผลงานจริงก่อนตามแผน
2. **ต่อด้วย Phase 5D + 5E (และแทรก Phase 5C):**
   - ทำ **บูธอัดเสียงร้องจริงต่อเนื่องบน Karaoke** + **Export `.MP3` เสียงตรง Live 100%** + **ฮัมทำนองเป็นโครงเพลง**
3. **ปิดท้ายก่อนเปิดขายสาธารณะด้วย Phase 5F:**
   - ติด **Google Login + กระเป๋าเหรียญบน Supabase + PromptPay ตรวจสลิปอัตโนมัติ** พร้อมรับเงินจริงเข้าบัญชีได้ทันที!
