# PROGRESS LOG — Demo Maker Easy

## Phase Status

| Phase | Status | Approved Date | Notes |
|---|---|---|---|
| **1A** | ✅ APPROVED | 2026-11-12 | Project Setup, Core Schema & Interactive UX/UI |
| **1B** | ✅ APPROVED | 2026-11-12 | 3D Acoustic Audio Engine (`smplr` + 3D Soundstage) |
| **1C** | ✅ APPROVED | 2026-11-12 | My Songs Library, LINE Share Link & SMF MIDI Export |
| **2A** | ✅ APPROVED | 2026-11-12 | Mini Piano Roll & Vocal Melody Guide Editor |
| **2B** | ✅ APPROVED | 2026-11-12 | Mic Audio Scratchpad & 3D MP3 Mixdown |
| **3A** | ✅ APPROVED | 2026-11-12 | PWA, Mobile/iPad Polish & Bilingual (TH/EN) |
| **4A** | ✅ DONE | 2026-11-13 | UI Decluttering, 3-Tab Workflow & Zen Focus Mode |
| **4B** | ✅ DONE | 2026-11-13 | Studio-Grade Musical Realism & Vocal DSP Chain |
| **4C** | ✅ DONE | 2026-11-13 | IndexedDB Audio Storage & Library Organization |
| **4D** | ✅ DONE | 2026-11-13 | User Login & Multi-Device Cloud Sync |
| **4E** | ✅ DONE | 2026-11-13 | Advance Mode, Credit Wallet & Thai Lyric AI |
| **5A** | ✅ DONE | 2026-11-14 | Real @google/genai SDK, Producer Prompts & Credit Economics |
| **5B** | ✅ DONE | 2026-11-14 | Easy Mode Starter (4 Cr), Inline Section AI & 0-Cr Auto-Split |
| **5C** | ✅ DONE | 2026-11-14 | Hum-to-Song Capture (3 Cr), 0-Cr Guide Melody & 2-Cr TTS Cue |
| **5D** | ✅ DONE | 2026-11-14 | Continuous Real Vocal Recording Booth (0 Credits, Local) |
| **5E** | ✅ DONE | 2026-11-14 | Live vs MP3 Export Parity, Studio Realism & Lyria 3.5 Reference Track |
| **5F** | ✅ DONE | 2026-11-14 | Google OAuth Sign-In, Server Postgres Wallet & PromptPay Auto-Slip Billing |
| **7F** | ✅ DONE | 2026-11-15 | Sprint D Anti-Rush Lyric Budget, Bar-1 Vocal Alignment, MP3 Blob Fix & `gemini-4-hydrogen` Live QA |
| **7G** | ✅ DONE | 2026-11-15 | Sprint E Edge-Breath Strip, Section Melodic TTS, 1-Click Full-Song AI Vocals & IDB JSON Import |
| **8A** | ✅ DONE | 2026-11-18 | Multi-Model Tiering, `v1beta` Parity, Pro Argon Mode (10 Cr) & Bulletproof Split-Wallet Refund |
| **8B** | ✅ DONE | 2026-11-18 | Prompt Engineering, 16-Step Hum-to-Song & Cohesive Polish Fixes |
| **8C** | ✅ DONE | 2026-11-18 | Studio Save Engine (Auto + Manual Save Ctrl+S + Auto-Checkpoints) & IDB Audio Fix |
| **8D** | ✅ DONE | 2026-11-19 | Resilient Cloud Sync, Tombstone Delete & Multi-Device Conflict Guard |
| **8E** | ✅ DONE | 2026-11-19 | User-Centric UX/UI Overhaul, Smart Undo/Redo, Chord Audition & Dark/Touch Polish |
| **9A–9E** | ✅ DONE | 2026-11-19 | Singable Phrasing Physics, Breathable Melody Engine & Story Blueprint |
| **UI QA** | ✅ DONE | 2026-11-19 | Navbar Overlap, Modal Tab Overflow, Piano Roll Sticky Z-Index & Stale Auth Sync (`cc55464`) |
| **10** | ✅ DONE | 2026-11-19 | 4-Tier Constraint Harmony, AABB/ABAB & Mai-Yamok Parity, 3.8-Flash Non-Destructive Polish Gate (`e72fa90`) |
| **Post-10** | ✅ DONE | 2026-11-21 | Easy Mode 8 Bars/Section & Studio Loudness Gain Staging (`464dc99`) |
| **Wrap-up** | ✅ DONE | 2026-11-25 | Pre-Shelving Hygiene (Offline Test Isolation, Tutorial MP4 Gitignore, Handover README & Log Closure) |

---

## Immutable Phase Records

### [Phase 1A] Project Setup, Core Schema & Interactive UX/UI
Status: PASS (Awaiting Human Approval)
Timestamp: 2026-11-12T14:16:00+07:00

Files changed:
- `src/types/song.ts`: Master data schema for SongProject, Section, Bar, Mixer, TimeSig, Guitars, 3D Ambience
- `src/lib/chordUtils.ts`: Transpose calculation (-6 to +6), Capo 0-7 fingering calculation, Diatonic Chord list, Progression Presets
- `src/lib/defaultSong.ts`: Full default acoustic demo song (Key C, 74 BPM) with 8 sections (Intro to Outro)
- `src/components/TransportBar.tsx`: Play/Pause/Stop, Count-in toggle, Beat ticker 1..4, TimeSig, BPM, Key, Capo, Clean mode switcher
- `src/components/SoundCustomizerPanel.tsx`: 3 Guitar models, 2 String gauges, 3D Room Ambience, 4-Track Instrument Mixer
- `src/components/SectionBuilder.tsx`: Section cards, Intensity selector, Solo split mode, 1 or 2 chords per bar, PlayStyle (Normal/Let Ring/Break), Lyrics input
- `src/components/KaraokeTeleprompter.tsx`: Full-screen teleprompter for iPad/tablets, extra large chords + Capo guide, auto-scrolling
- `src/components/ChordPickerModal.tsx`: Diatonic chords + custom chord text input
- `src/components/ProgressionPresetsModal.tsx`: Popular acoustic chord progression presets
- `src/components/ExportModal.tsx`: LINE Share Link preview, 3D MP3 preview, Suno AI Prompt generator with metatags, MIDI & JSON
- `src/components/SongLibraryModal.tsx`: Multi-song switcher and creator
- `src/app/page.tsx`: Unified state management and simulated live beat/bar transport ticker
- Per-Section Instruments Feature: Added 4-track instrument toggles (Guitar, Bass, Piano, Drums) directly to each section header
- Dual Guitar Architecture: Added Guitar 1 (Rhythm) and Guitar 2 (Lead/Solo) for independent arrangement
- 4th Guitar Model Added: Gibson Les Paul Electric Guitar (Warm Humbucker, high sustain for melodic solos and riffs)
- 5-Track Mixer Upgrade: Rhythm Guitar, Lead Guitar, Acoustic Bass, Piano Pad, Drums/Percussion
- Per-Section Playing Style Selection: Added inline style selectors directly to every section header (Rhythm: Campfire/Soft/Fingerpicking, Lead: Melodic Solo/Riff Fills/Arpeggio, Bass: Root-Fifth/Sustain, Piano: Warm Pad/Arpeggio, Drums: Shaker-Cajon/Simple Kit)

Tests:
- `npm run build` executed and exited with code 0 (Compiled successfully, static prerender passed)
- Runtime check: `http://localhost:3000` responded with HTTP 200 OK

Production impact:
- None (Localhost Dev)

Rollback:
- Git clean / checkout if needed (initial commit ready)

Human decision:
- Awaiting user visual/interactive verification on `http://localhost:3000`

---

### [Phase 2A] Mini Piano Roll & Vocal Melody Guide Editor
Status: PASS (Awaiting Human Approval)
Timestamp: 2026-11-12T20:45:00+07:00

Files changed:
- `src/types/song.ts`: Added `MelodySound` ('flute' | 'piano' | 'bell') and `melody` track config in `InstrumentMixerConfig`
- `src/lib/melodyUtils.ts`: Created helper functions (`midiToNoteName`, `isBlackKey`, `getScalePitchClasses`, `getChordPitchClasses`, `getPitchRange`, `getRootPitchClass`)
- `src/lib/barPlanner.ts`: Added `melody` to `TrackId` / `ALL_TRACKS`, updated `isTrackOn`, implemented `planMelody` with timing, transposition, and break clamping
- `src/lib/audioEngine.ts`: Added `MelodySynth` multi-timbral synth (Flute with singing vibrato, Lead Piano, Warm Bell), added `previewNote` and `playBarAudition`
- `src/lib/midiExport.ts`: Added Track 6 (Melody Guide) on MIDI Channel 5 (General MIDI Patch 73 Flute / 0 Piano / 14 Bell) when melody notes are present
- `src/components/MiniPianoRollModal.tsx`: Touch-friendly Mini Piano Roll Modal with in-key scale snap, chord tone indicators, 8/16 step grid, note duration modifiers, audition button, and prev/next bar navigation
- `src/components/SectionBuilder.tsx`: Connected `🎹 โน้ตเมโลดี้` button on every bar to open Mini Piano Roll
- `src/components/SoundCustomizerPanel.tsx`: Added Track 6 (Vocal Melody Guide) to 6-Track Mixer with enable toggle, sound picker, and volume slider
- `src/app/page.tsx`: Integrated modal state, bar navigation, and state updates
- `tests/phase2a.test.ts`: 9 new automated unit tests covering note name mapping, scale/chord pitch classes, bar planner, transposition, muting, break clamping, MIDI export, and storage/shareUrl round-trip (Total test suite: 39/39 passing)

Tests:
- `npm run build` executed and exited with code 0 (Compiled successfully, static prerender 4/4 passed)
- Full automated test suite: `npx tsx --test tests/*.test.ts` → 39/39 passing (100%)
- Dev server running on `http://localhost:3000` responding HTTP 200 OK


---

### [Phase 2B] Mic Audio Scratchpad & 3D Stereo MP3 Mixdown
Status: PASS (Completed & Verified)
Timestamp: 2026-11-12T22:30:00+07:00

Files changed:
- `src/types/song.ts`: Added `vocalAudio` (Base64 data URL) to `SongBar` and `vocal` track config to `InstrumentMixerConfig`
- `src/lib/micRecorder.ts`: Created browser MediaRecorder class with high-fidelity singing mic capture, real-time VU meter (0-100%), and safe SSR detection
- `src/lib/mp3Exporter.ts`: Created pure client-side `OfflineAudioContext` multi-track renderer with 3D Room Reverb and MP3 192kbps encoder via `@breezystack/lamejs`
- `src/components/VocalRecorderModal.tsx`: Modal with 3-2-1 countdown, live VU meter, audio player preview, audition with backing track, latency slider, and save/clear
- `src/components/SectionBuilder.tsx`: Wired up `🎙️ อัดฮัม` and `🎙️ มีเสียงร้อง` indicators
- `src/components/SoundCustomizerPanel.tsx`: Added Vocal Latency slider and Track 7 (Recorded Vocals) in 7-Track Mixer
- `src/components/ExportModal.tsx`: Unlocked "🎧 ดาวน์โหลดไฟล์เสียง 3D Stereo (.MP3 192 kbps)"
- `src/lib/audioEngine.ts`: Embedded recorded vocal playback during normal song playback
- `tests/phase2b.test.ts`: 4 automated unit tests covering mic support safety, MP3 frame sync word validation, and storage persistence

Tests:
- `npm run build` executed and exited with code 0 (4/4 static pages prerendered)
- Full automated test suite: `npx tsx --test tests/*.test.ts` → 43/43 passing (100%)

---

### [Phase 3A] PWA (Progressive Web App), Mobile/iPad Polish & Bilingual (TH/EN)
Status: PASS (Completed & Verified)
Timestamp: 2026-11-12T22:40:00+07:00

Files changed:
- `public/manifest.json`: Web App Manifest with standalone display mode, orientation, theme color, and 192/512 app icons
- `public/icons/`: Generated valid PNG icons (icon-192.png, icon-512.png, apple-touch-icon.png)
- `public/sw.js`: Service worker caching static app shell and offline fallbacks
- `src/components/ServiceWorkerRegister.tsx`: Client-side service worker registration
- `src/app/layout.tsx`: PWA meta tags, viewport with `viewportFit=cover`, apple-touch-icon, and LanguageProvider wrapper
- `src/app/globals.css`: Added `touch-action: manipulation;`, `.safe-bottom`, `.safe-top`, and standalone PWA user-select rules
- `src/lib/i18n.ts`: Comprehensive bilingual dictionary (TH/EN) with localStorage persistence and helper functions
- `src/context/LanguageContext.tsx`: React Context for instant language switching without page reload
- `src/components/PwaInstallPrompt.tsx`: Dynamic install banner for Chromium/Android and iPad/iPhone Add-to-Home-Screen prompt
- `src/components/TransportBar.tsx`: Added Language toggle button (🇹🇭 ไทย / 🇬🇧 EN), touch-friendly button targets (min 40px), and bilingual labels
- `src/components/KaraokeTeleprompter.tsx`: Translated chords, tips, and prompter status into active language
- `src/components/SectionBuilder.tsx`: Bilingual section types, intensity, playing styles, and action buttons
- `src/components/SoundCustomizerPanel.tsx`: Bilingual headers, 3D room ambiances, and 7-track mixer labels
- `src/components/ExportModal.tsx`: Bilingual export buttons and action descriptions
- `src/lib/cloudSync.ts`: Architectural readiness for Supabase / Cloud Library sync with offline resilience
- `tests/phase3a.test.ts`: 6 automated unit tests covering i18n symmetry, manifest validation, PNG magic bytes, service worker contents, and cloud sync safety

Tests:
- `npm run build` executed and exited with code 0 (Compiled successfully in 561ms, 4/4 static pages prerendered)
- Full automated test suite: `npx tsx --test tests/*.test.ts` → 49/49 passing (100%)
- Dev server running on `http://localhost:3000` responding HTTP 200 OK

---

### [Phase 4A] UI Decluttering, 3-Tab Workflow & Zen Focus Mode
Status: PASS (Completed & Verified)
Timestamp: 2026-11-13T08:05:00+07:00

Files changed:
- `src/types/song.ts`: Exported `AppViewMode = 'songwriter' | 'arranger' | 'karaoke'`
- `src/lib/sectionUtils.ts`: Added `generateUniqueId`, `cloneSongSection`, `duplicateSectionInList` (deep-clone section with unique IDs and `" (Copy)"` suffix), and `countThaiEnglishSyllables` (Thai vowel cluster + English vowel group syllable estimator)
- `src/lib/i18n.ts`: Added symmetrical `th`/`en` keys for 3-tab workflow (`modeSongwriting`, `modeArranger`, `modeKaraoke`), Zen Mode (`zenMode`, `zenModeHint`), Duplicate Section (`duplicateSection`), Syllable Counter (`syllablesCount`), and progressive disclosure controls
- `src/components/TransportBar.tsx`: Updated mode switcher to 3 workspace tabs (`Songwriter` / `Arranger` / `Stage`), added `✨ Zen` toggle button, and collapsed Row 2 Musical Parameters Bar when `isZenMode` is active
- `src/components/SectionBuilder.tsx`: Added `viewMode?: 'songwriter' | 'arranger'` progressive disclosure (sleek single-line instrument summary pill row, simplified Bar Cards with large chords, live syllable badge, quick vocal mic, and compact `⋯` bar options popover in `songwriter` mode; full 5-instrument arrangement grid, `PlayStyle`, `ChordsPerBar`, `Melody Piano Roll`, and `📋 Duplicate` section button in `arranger` mode)
- `src/app/page.tsx`: Migrated `activeMode` to `AppViewMode` (default `'songwriter'`), added `isZenMode` state, and wired `TransportBar` & `SectionBuilder` view props
- `tests/phase4a.test.ts`: Added 7 unit tests covering `AppViewMode`, section deep-clone & duplication ordering, unique ID generation, Thai/English/mixed syllable counting, and Phase 4A i18n symmetry

Tests:
- `npx tsx --test tests/*.test.ts` → 56/56 passing (100%)
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript checks exited with code 0

---

### [Phase 4B] Studio-Grade Musical Realism & Vocal Studio DSP Chain
Status: PASS (Completed & Verified)
Timestamp: 2026-11-13T08:25:00+07:00

Files changed:
- `src/lib/chordUtils.ts`: Updated `parseChord` and `transposeChord` to preserve and transpose optional `/Bass` slash chord suffixes cleanly alongside root and quality
- `src/lib/guitarVoicings.ts`: Added `bassPc?: number` to `ParsedChord`, parsed slash bass notes in `parseChordSymbol`, and updated `getGuitarVoicing` so `strings[0]` produces exact slash bass pitch in E2–D#3 (MIDI 40–51) with upper strings ordered cleanly above it (including Capo fingering support)
- `src/components/ChordPickerModal.tsx`: Added one-tap **Slash Bass (`/Bass`)** selector bar (`/E`, `/F#`, `/G`, `/A`, `/B`, `/C`, `/D`, plus `Clear Bass`) onto chosen chords
- `src/lib/barPlanner.ts`: Added `isSongEnd` to `PlanCtx`; implemented Zone Strumming in `emitStrum` (downstrokes bottom-up, upstrokes top 3 treble strings top-down); added subtle late-upstroke `sus4`/`add9` Auto-Embellishment (`embellishVoicing`) on 1-chord strum bars; added Walking Bass approach notes (`pickWalkingApproachNote`) on chord transitions and Slash Bass root anchoring in `planBass`; added Outro Ritardando widened arpeggiated sweep gaps (`38–52ms`) and sustained ring-out (`>= 2.6s`) on `isSongEnd`
- `src/lib/audioEngine.ts`: Exported `TrackGainNode` and added `VocalStudioTrackGainNode` (`95Hz highpass` -> `3800Hz +2.5dB Q1.1 peaking` -> `-18dB 4:1 compressor` -> `masterGain` -> `fadeGain` -> `panner` -> `masterBus`) wired to `this.vocalGain`
- `src/lib/mp3Exporter.ts`: Mirrored the Vocal Studio DSP Chain (95Hz HPF, 3.8kHz +2.5dB peaking EQ, vocal compressor) on `trackGains['vocal']` for offline MP3 mixdown
- `tests/phase1b.test.ts`: Updated superseded step-6 upstroke string count assertion (`>= 4` -> `=== 3`) to match Phase 4B 3-string treble Zone Strumming while keeping top-down pitch assertion intact
- `tests/phase4b.test.ts`: Added 7 unit tests verifying Slash Chords (`D/F#`, `C/G`, `G/B`, `C/E`, `F/A`, `Am/G`, Capo), Upstroke Zone Strumming, Auto-Embellishment, Walking Bass approach notes & Slash Bass anchoring, Outro Ritardando (`38–52ms`, `>= 2.6s`), VocalStudioTrackGainNode DSP routing, and MP3 export/UI presence

Tests:
- `npx tsx --test tests/*.test.ts` → 63/63 passing (100%)
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript checks exited with code 0

---

### [Phase 4C] IndexedDB Audio Storage, Folders, Status Tags & Version Snapshots
Status: PASS (Completed & Verified)
Timestamp: 2026-11-13T08:30:00+07:00

Files changed:
- `src/lib/audioStorageIdb.ts`: Created IndexedDB vocal store (`demo_maker_audio_db`, v1, store `vocals`, key `${songId}_${barId}`) with `saveVocalBlob`, `getVocalBlob`, `deleteVocalBlob`, `clearSongVocals`, `persistSongVocalsToIdb`, `hydrateSongVocalsFromIdb`, and SSR/Node in-memory `Map` fallback
- `src/types/song.ts`: Exported `SongStatusTag` (`draft` | `arranged` | `vocal-recorded` | `mastered`), `SongSnapshot`, and added optional `folder`, `statusTag`, `snapshots` to `SongProject`
- `src/lib/storage.ts`: Added browser IndexedDB offload in `saveSong` (via `stripVocalsFromSong` + `persistSongVocalsToIdb`), `clearSongVocals` cleanup in `deleteSong`, plus `extractSongFolders`, `filterLibrarySongs`, `createSongSnapshot`, `restoreSongFromSnapshot`, `addSnapshotToSong`, `removeSnapshotFromSong`, and `updateSongLibraryMeta`
- `src/components/SongLibraryModal.tsx`: Upgraded library modal with title/lyrics search bar, interactive Folder filter pills + inline folder assignment/creation, color-coded Status Tag selector (`📝 Draft`, `🎸 Arranged`, `🎤 Vocal`, `⭐ Mastered`), and active-song `📸 Save Snapshot` with collapsible snapshot history (**Restore Version** & **Delete Snapshot**)
- `src/app/page.tsx`: Wired `selectSongWithVocals` hydration via `hydrateSongVocalsFromIdb` and immediate IndexedDB vocal persistence/deletion on vocal record/clear
- `tests/phase4c.test.ts`: Added 5 tests covering IndexedDB memory fallback, mocked `demo_maker_audio_db` v1 lifecycle & `localStorage` offload/hydration, search/folder/status filtering, lightweight snapshot creation/restore/deletion, and `SongLibraryModal` UI contract

Tests:
- `npx tsx --test tests/*.test.ts` → 68/68 passing (100%)
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript checks exited with code 0

---

### [Phase 4D] User Login & Multi-Device Cloud Sync
Status: PASS (Completed & Verified)
Timestamp: 2026-11-13T08:42:00+07:00

Files changed:
- `src/lib/cloudSync.ts`: Added `CloudUser` (`guest` | `authenticated`), Guest local profile fallback (`GUEST_USER`), Supabase Auth REST helpers (`getCurrentUser`, `signInWithEmailOtp`, `verifyEmailOtp`, `signOutUser`, `consumeAuthCallbackFromUrl`), `updatedAt`-based conflict resolution (`mergeSongLists`), and 1-click Pull + Merge + Push orchestrator (`syncLibraryNow`)
- `src/components/AccountSyncModal.tsx`: Created Account & Cloud Sync modal featuring Email Magic Link / 6-digit OTP login, user profile badge, live cloud sync status indicator (`local-only` | `synced` | `syncing` | `offline` | `error`), 1-click `☁️ Sync Now` trigger, Sign Out action, and optional Supabase endpoint settings
- `src/components/TransportBar.tsx`: Added compact Account & Cloud Sync status pill button opening `AccountSyncModal`
- `src/app/page.tsx`: Wired cloud auth/sync state (`cloudUser`, `syncStatus`, `lastSyncedAt`), URL hash Magic Link consumption, online/offline listeners, `handleSyncNow`, and `AccountSyncModal`
- `tests/phase4d.test.ts`: Added 5 unit tests covering Guest fallback, Supabase Auth REST (`/auth/v1/otp`, `/auth/v1/verify`, `/auth/v1/logout`), `mergeSongLists` conflict resolution, `syncLibraryNow` Pull+Merge+Push, and UI contract checks

Tests:
- `npx tsx --test tests/*.test.ts` → 73/73 passing (100%)
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript checks exited with code 0

---

### [Phase 4E] Advance Mode, Credit Wallet, PromptPay Preview & Thai Rhyme / AI Lyric Co-Pilot
Status: PASS (Completed & Verified)
Timestamp: 2026-11-13T08:49:00+07:00

Files changed:
- `src/lib/thaiRhymeHelper.ts`: Created offline 0-credit Thai rhyme dictionary & heuristic syllable analyzer (`THAI_RHYME_GROUPS`, `findThaiRhymes`) supporting 15+ Thai vowel/final-consonant groups while re-exporting `countThaiEnglishSyllables` from `src/lib/sectionUtils.ts`
- `src/lib/creditManager.ts`: Implemented Credit Wallet state & transaction ledger (`DEFAULT_STARTER_CREDITS = 30`, `CREDIT_PACKAGES`, `getCreditBalance`, `getCreditTransactions`, `canAfford`, `deductCredits`, `topUpCredits`, `resetCreditWalletForTests`) backed by `localStorage` with SSR/Node memory fallback
- `src/app/api/advance/lyrics/route.ts`: Implemented `POST /api/advance/lyrics` Route Handler with strict payload validation (`400`), Gemini 2.5 Flash REST call via `x-goog-api-key` header (`process.env.GEMINI_API_KEY`) when configured (`isSimulated: false`), and graceful offline Thai poetic simulation (`isSimulated: true`, HTTP `200`) when key is absent
- `src/components/AdvanceModeModal.tsx`: Created Advance Mode modal featuring credit balance badge, 0-credit Thai Rhyme & Syllable Helper tab, AI Lyric Co-Pilot tab with explicit `ใช้ 1 เครดิต / Uses 1 Credit` Cost Preview Confirmation + `Apply Lyrics` action, and Credit Top-Up / Ledger tab with PromptPay QR Preview Dialog
- `src/components/TransportBar.tsx`: Added compact Credit Wallet pill (`⚡ {creditBalance} Credits`) opening `AdvanceModeModal`
- `src/components/SectionBuilder.tsx`: Added subtle section-level `✨` trigger (`onOpenAdvanceForSection`) in section action controls
- `src/app/page.tsx`: Wired `creditBalance`, `advanceModalState`, `handleOpenAdvanceModal`, `handleApplyAiLyrics`, and `<AdvanceModeModal />` integration
- `tests/phase4e.test.ts`: Added 5 unit tests covering `thaiRhymeHelper`, `creditManager`, `/api/advance/lyrics` POST validation/simulation/Gemini header security, and Phase 4E UI wiring contracts

Tests:
- `npx eslint src/lib/thaiRhymeHelper.ts src/lib/creditManager.ts src/app/api/advance/lyrics/route.ts src/components/AdvanceModeModal.tsx src/components/TransportBar.tsx src/components/SectionBuilder.tsx tests/phase4e.test.ts` → 0 errors, 0 warnings
- `npx tsx --test tests/*.test.ts` → 78/78 passing (100%)
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript checks exited with code 0

---

### [Phase 4 QA Audit & Bug Fixes] Cross-Phase Regression Suite & Full-Repo Lint Cleanup
Status: PASS (Completed & Verified)
Timestamp: 2026-11-13T09:03:00+07:00

Bugs fixed:
- `src/lib/shareUrl.ts`: Stripped `snapshots` array alongside `vocalAudio` in `generateShareUrl` so LINE share links stay compact regardless of snapshot count
- `src/lib/storage.ts`: Switched `duplicateSong` and `importSongsJSON` to collision-free `generateUniqueId`, cleared inherited `snapshots` on song duplication, and added `{ setActive?: boolean }` to `saveSong` so background library edits/duplication/metadata updates do not hijack `ACTIVE_SONG_KEY`
- `src/components/SongLibraryModal.tsx`: Wired interactive `statusFilter` pills to `filterLibrarySongs` and ensured `submitRename` uses live `currentSong` data when renaming the active song
- `src/lib/thaiRhymeHelper.ts`: Removed non-rhyming `'สายลม'` from `-าย` group and moved direct dictionary lookup ahead of regex heuristics so irregular Thai spellings (`'อัศจรรย์'`, `'ถวิล'`, `'ชัวร์'`) match accurately
- Repo-wide ESLint cleanup: Resolved all `react-hooks/set-state-in-effect`, `react-hooks/preserve-manual-memoization`, `react-hooks/exhaustive-deps`, `react/no-unescaped-entities`, `@typescript-eslint/no-explicit-any`, and unused variable issues across `page.tsx`, `MiniPianoRollModal.tsx`, `VocalRecorderModal.tsx`, `PwaInstallPrompt.tsx`, `ExportModal.tsx`, `SoundCustomizerPanel.tsx`, `LanguageContext.tsx`, `audioEngine.ts`, `mp3Exporter.ts`, and `tests/phase1c–4a.test.ts`
- `tests/phase4_qa.test.ts`: Added 5 QA regression and cross-phase end-to-end tests covering Bugs #1–#4 and Phase 4A–4E integration

Tests:
- `npx eslint .` → 0 errors, 0 warnings across the entire repository
- `npx tsx --test tests/*.test.ts` → 83/83 passing (100%)
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript checks exited with code 0

---

### [Phase 5A] Real `@google/genai` SDK Integration, Producer Prompt Library & Credit Economics
Status: PASS (Completed & Verified)
Timestamp: 2026-11-14T00:40:00+07:00

Changes implemented:
- Plan & Environment Docs: Updated credit packages (`Mini 49฿ = 50 Cr`, `Starter 99฿ = 100 + 10 bonus`, `Pro 249฿ = 300 + 40 bonus`, `Studio 499฿ = 700 + 100 bonus`) and Pro model button pricing (`lyria-3.5 = 8 Cr`, `gemini-4-argon = 10 Cr`) across `STUDIO_EVOLUTION_PLAN_V4.md`, `STUDIO_EVOLUTION_PLAN_V4_TH.md`, and `.env.example` (set default example `GEMINI_MODEL=gemini-3.8-flash`).
- `package.json`: Installed official `@google/genai` SDK (`^3.3.0`).
- `src/lib/aiPrompts.ts` (New): Created centralized Producer & Thai Songwriter Prompt Library with BPM/time-signature syllable budgeting (`getSyllableBudgetForBpm`), Thai end-rhyme coupling rules, Anti-Cliché banned phrases (`ANTI_CLICHE_THAI_PHRASES`), Golden Few-Shot Thai lyric/director examples, Producer frequency-spacing arrangement rules, strict JSON Schemas (`LYRICS_RESPONSE_SCHEMA`, `DIRECTOR_RESPONSE_SCHEMA`), and reusable Phase 5B/5C prompt builders.
- `src/lib/geminiClient.ts`: Migrated from raw `:generateContent` REST fetch and `'gemini-4-hydrogen'` to official `@google/genai` SDK `ai.interactions.create` (`store: false`, `system_instruction`, JSON `response_format.schema`, normalized `thinking_level` & `max_output_tokens`, `GeminiTokenUsage` telemetry, deprecated alias normalization, and status/NextGen error classification without exposing `GEMINI_API_KEY`).
- `src/lib/creditManager.ts`: Updated `DEFAULT_STARTER_CREDITS = 15`, 4-tier `CREDIT_PACKAGES` (Mini 49฿, Starter 99฿, Pro 249฿, Studio 499฿), centralized `CREDIT_COST_TABLE`, `trialCredits` vs `purchasedCredits` wallet tracking (with legacy wallet migration & `getWalletBreakdown()`), `canUsePaidOnlyModel()` anti-loss guard blocking `lyria-3.5` (8 Cr) / `gemini-4-argon` (10 Cr) on trial-only accounts, and `refundCredits()`.
- `src/lib/aiSongDirector.ts`: Replaced legacy codename references and added `classifyDirectorPromptMode` separating 0-Credit local commands from 1-Credit creative AI Producer requests.
- `src/app/api/advance/lyrics/route.ts` & `src/app/api/advance/director/route.ts`: Wired to `@google/genai` (`gemini-3.5-flash-lite` default for quick/director, `gemini-3.8-flash` for `mode: 'deep'`), strict JSON schemas, BPM/previous-section context, token usage response telemetry, and structured rate-limit/auth/missing-key fallback without charging credits.
- `src/components/AdvanceModeModal.tsx` & `src/components/TransportBar.tsx`: Set default starter balance to `DEFAULT_STARTER_CREDITS` (`15`), updated AI Lyrics & AI Director to deduct credits strictly on non-simulated API success (`!data.isSimulated`), separated 0-Credit local execution vs 1-Credit confirmed Gemini AI in AI Director, removed all `'Gemini 4 Hydrogen'` strings, displayed 4-tier packages with bonus tags + trial/purchased breakdown, and rendered token usage badges.
- `tests/phase4e.test.ts`, `tests/phase4_qa.test.ts`, `tests/phase4_user_feedback.test.ts`, & `tests/phase5a.test.ts`: Updated Phase 4 credit/SDK assertions cleanly and added `tests/phase5a.test.ts` covering `aiPrompts`, `geminiClient`, `creditManager`, `classifyDirectorPromptMode`, rate-limit fallback, and UI contracts.

Tests:
- `npx tsx --test tests/*.test.ts` → 101/101 passing (100%)
- `npx eslint .` → 0 errors, 0 warnings across the entire repository
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript exited with code 0
- Multi-viewport UI QA (`http://localhost:3100` on Desktop `1440×900`, iPad `768×1024`, Mobile `390×844`) → 0 console errors, 0 horizontal overflow, verified 15 starter credits, 0-Cr local AI Director update (74→95 BPM), 1-Cr creative confirmation gate, and responsive 4-tier Wallet layout

---

### [Phase 5B] Easy Mode Starter (1-Click Song -> Fine-Tune), Inline AI Architect & 0-Cr Lyric Auto-Splitter
Status: PASS (Completed & Verified)
Timestamp: 2026-11-14T01:41:30+07:00

Changes implemented:
- `src/types/song.ts`: Added optional `easyConfig` metadata (`stylePreset`, `vocalProfile`, `tempoFeel`, `generatedAt`) on `SongProject`.
- `src/lib/thaiRhymeHelper.ts`: Added `getRhymeGroupIdForWord()` and `validateThaiLyricCouplets()` (checking both end-to-end and end-to-next-early Thai couplet rhymes) and refined `classifyRhymeGroupId()` phonological signatures (`aan`, `aat`, `ao`, `uung`, `other:*`) so unrelated syllables never falsely collide on `'aa'`.
- `src/lib/sectionUtils.ts`: Added `splitLyricsToSectionBars(rawText, existingBars)` distributing multi-line, slash-separated (` / ` / `|`), or whitespace-grouped lyrics cleanly across bars while preserving chords, `chordsPerBar`, `playStyle`, `melodyNotes`, and `vocalAudio`.
- `src/lib/i18n.ts`: Added 10 strictly symmetrical `th` / `en` Phase 5B UI labels (`easyModeBtn`, `easyModeTitle`, `easyModeSubtitle`, `stageDraft`, `stageArranged`, `stageVocal`, `stageMastered`, `inlineAiQuick`, `inlineAiDeep`, `inlineSplitLyrics`).
- `src/lib/songArchitect.ts` (New): Implemented `EASY_STYLE_PRESETS` (5 acoustic/pop presets), `buildDiatonicGuideNotesForChord()`, `clampMelodyNotesForBar()`, `sanitizeArchitectSongProject()` (strict enum clamping + Verse `guitarLead: false` vocal pocket guard), `buildSimulatedArchitectSong()`, and 0-Credit `applyBandDensityToSong()` (`unplugged` / `balanced` / `full`).
- `src/lib/aiPrompts.ts`: Added `buildEasyArchitectSystemPrompt()`, `buildEasyArchitectUserPrompt()`, `buildRhymePolishPrompt()`, `LYRICS_DEEP_RESPONSE_SCHEMA`, `ARCHITECT_RESPONSE_SCHEMA`, `RHYME_POLISH_RESPONSE_SCHEMA`, and optional `mode?: 'quick' | 'deep'` guide melody instructions in `buildLyricsUserPrompt()`.
- `src/app/api/advance/architect/route.ts` (New): Implemented `POST /api/advance/architect` (4 Credits, `gemini-3.8-flash` via `@google/genai`, `maxOutputTokens: 8192`) with `sanitizeArchitectSongProject()`, automatic `validateThaiLyricCouplets` post-check + max-1 `gemini-3.5-flash-lite` rhyme polish pass, and credit-safe offline simulation fallback (`isSimulated: true`).
- `src/app/api/advance/lyrics/route.ts`: Upgraded `mode: 'deep'` (2 Credits) to use `LYRICS_DEEP_RESPONSE_SCHEMA` and return bar-aligned guide `melodyNotesPerBar` clamped with `clampMelodyNotesForBar()`.
- `src/components/EasyModeStarterModal.tsx` (New): Built 2-stage Easy Mode Starter modal (3-step configurator + explicit 4-Credit cost confirmation charging only on `!data.isSimulated`; Stage 2 Preview Card with live playback preview, Vocal Key Fit transpose/capo controls, Band Density presets, BPM slider, and 1-click Handoff to `songwriter` / `arranger`).
- `src/components/AdvanceModeModal.tsx`: Added Quick (1 Credit) vs Deep + Guide Melody (2 Credits) mode toggle, `initialMode` / `initialTab` props, and `melodyNotesPerBar` forwarding in `onApplyLyrics`.
- `src/components/SectionBuilder.tsx`: Added the clickable 4-step studio workflow progress strip (`draft` → `arranged` → `vocal-recorded` → `mastered`), contextual `✨ AI` section popover (1 Cr Quick / 2 Cr Deep / 0 Cr Auto-Split), inline 0-Credit lyric paste-and-split editor, and responsive mobile header wrapping.
- `src/hooks/useAudioEngine.ts` & `src/app/page.tsx`: Added optional `songOverride` on `engine.play`, Easy Mode CTA banner, live Easy Preview playback wiring, `handleOpenInlineAiSection`, and `melodyNotesPerBar` application in `handleApplyAiLyrics`.
- `tests/phase5b.test.ts` (New): Added comprehensive tests for `sanitizeArchitectSongProject`, `applyBandDensityToSong`, `validateThaiLyricCouplets`, `splitLyricsToSectionBars`, `/api/advance/architect` (400 / offline / mocked live + max-1 polish + key non-leak), `/api/advance/lyrics` deep mode, and Phase 5B UI contracts.

Tests:
- `npx tsx --test tests/*.test.ts` → 108/108 passing (100%)
- `npx eslint .` → 0 errors, 0 warnings across the entire repository
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript exited with code 0
- Multi-viewport UI QA (`http://localhost:3100` on Desktop `1440×900`, iPad `768×1024`, Mobile `390×844`) → 0 console errors, 0 horizontal overflow (`1425/1440`, `754/769`, `390/390`), verified 4-step workflow strip, Easy Mode 4-Cr confirmation gate (cancelled safely without live API charges), inline `✨ AI` popover, 0-Cr multi-line lyric split onto Verse 1 bars while preserving chords & 15 credits, and clean mobile Intro header layout.

---

### [Phase 5C] Hum-to-Song Capture (3 Cr), 0-Cr Chord Guide Melody & 2-Cr TTS Cue
Status: PASS (Completed & Verified)
Timestamp: 2026-11-14T04:56:45+07:00

Changes implemented:
- `src/lib/melodyUtils.ts`: Added 0-Credit chord/scale-locked vocal guide generator (`GuideContourPattern`: `gentle-arch` / `rising-hook` / `call-response` / `arpeggio`, `generateChordGuideMelodyNotes()`, `generateSectionGuideMelody()`) supporting split-bar chords across `4/4`, `3/4`, and `6/8` within vocal pitch range (`55–76` MIDI +/- shift).
- `src/lib/i18n.ts`: Added 7 symmetrical `th` / `en` Phase 5C labels (`easyTabIdea`, `easyTabHum`, `humRecordBtn`, `humStopBtn`, `humSubmitBtn`, `generateGuideBtn`, `ttsCueBtn`).
- `src/lib/geminiClient.ts`: Upgraded `callGeminiJson` to accept `string | GeminiInputPart[]` multimodal parts (`text` + `audio` base64), extracted shared Interactions status/error helpers (`buildMissingKeyFailure`, `evaluateInteractionTerminalFailure`, `classifyInteractionError`, `extractTextFromInteraction`, `extractAudioFromInteraction`), and added `callGeminiTranscribeAudio` (`gemini-3.5-transcribe`) and `callGeminiTtsAudio` (`gemini-3.8-flash-lite-tts` / `gemini-3.8-flash-tts` via `response_format: { type: 'audio' }` & `speech_metadata` annotations).
- `src/lib/aiPrompts.ts`: Added `normalizeAudioMimeType()` (normalizing codec suffixes & `audio/mp4` -> `audio/m4a`, blocking non-audio MIMEs), upgraded `buildHumToSongSystemPrompt()`, added `buildHumToSongUserPrompt()`, and added `HUM_TO_SONG_RESPONSE_SCHEMA` aligned with `sanitizeArchitectSongProject` (`chords`, `lyrics`, `melodyNotes`).
- `src/app/api/advance/hum-to-song/route.ts` (New): Implemented `POST /api/advance/hum-to-song` (3 Credits, enforcing `<= 45s` duration & `<= 8 MB` decoded audio limit), supporting optional `gemini-3.5-transcribe` pre-pass + multimodal `gemini-3.8-flash`, `sanitizeArchitectSongProject` + `enrichMissingGuideNotes()`, and safe offline fallback (`isSimulated: true`, 0 Credits).
- `src/app/api/advance/tts-cue/route.ts` (New): Implemented `POST /api/advance/tts-cue` (2 Credits, enforcing `<= 240 chars` / `<= 30s` limit) calling `gemini-3.8-flash-lite-tts` (or optional `pro-tts`) with safe offline `browser-speech-fallback` (`0 Credits`).
- `src/components/MiniPianoRollModal.tsx` & `src/app/page.tsx`: Added contour pattern picker + 0-Credit `✨ สร้างโน้ตไกด์ให้ตรงคอร์ด (ฟรี)` button, optional 2-Credit `🗣️ AI นับจังหวะ & ไกด์ร้อง (2 เหรียญ)` with inline cost confirmation (`if (!data.isSimulated)` billing) & browser speech fallback, and wired `creditBalance` / `onCreditsChange` in `page.tsx`.
- `src/components/EasyModeStarterModal.tsx`: Added Stage 1 Idea (4 Cr) vs Hum-to-Song (3 Cr) mode tabs, 45s `MicRecorder` live VU meter & timer (`0-100` calibrated) + audio file uploader (`<= 45s` / `<= 8 MB`), `gemini-3.5-transcribe` toggle, explicit 3-Credit confirmation gate, and Stage 2 transcribed lyrics/confidence readout feeding cleanly into 3 free knobs & Studio handoff.
- `tests/phase5c.test.ts` (New): Added verification suite covering guide melody contours across `4/4` / `3/4` / `6/8`, `normalizeAudioMimeType`, `/api/advance/hum-to-song` (`400` bounds, offline fallback, mocked `gemini-3.5-transcribe` + `gemini-3.8-flash` multimodal audio, key non-leak), `/api/advance/tts-cue` (`400` bounds, mocked `gemini-3.8-flash-lite-tts`), and Phase 5C UI contracts.

Tests:
- `npx tsx --test tests/*.test.ts` → 114/114 passing (100%)
- `npx eslint .` → 0 errors, 0 warnings across the entire repository
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript exited with code 0
- Multi-viewport UI QA (`http://localhost:3100` on Desktop `1440×900`, iPad `768×1024`, Mobile `390×844`) → 0 console errors, 0 horizontal overflow (`1425/1440`, `768/768`, `390/390`, `clippedOrOverflowChildren: []`), verified Easy Mode Idea/Hum tabs, 45s Hum capture & file upload controls, Mini Piano Roll 0-Cr chord-locked guide generator (`4` notes created cleanly), and 2-Cr TTS confirmation open/cancel without executing live paid API calls.

---

### [Phase 5D] Continuous Real Vocal Recording Booth (0 Credits, 100% Local)
Status: PASS (Completed & Verified)
Timestamp: 2026-11-14T06:20:00+07:00

Changes implemented:
- `src/types/song.ts`: Added `VocalFxPreset` (`'dry-natural' | 'studio-warm' | 'wide-chorus'`), `VocalTake`, `vocalTakes?: VocalTake[]` on `SongProject`, and `fxPreset` / `autoDucking` fields on `InstrumentMixerConfig.vocal`, preserving full backward compatibility with `SongBar.vocalAudio`.
- `src/lib/vocalBoothUtils.ts` (New): Implemented pure alignment & comping utilities (`getSectionBarRange`, `computePreRollPlaybackPlan`, `computeTakePlaybackSlice`, `activateVocalTake`, `addAndActivateVocalTake`, `removeVocalTake`, `formatNextTakeName`, `hasActiveVocalAtBar`, `computeAutoDuckFactor` returning `0.79` `-2dB` backing dip, and `clampVocalLatencyMs` clamped `-150..+250ms`).
- `src/lib/micRecorder.ts`: Added `MicStartOptions` and `MicRecorder.buildAudioConstraints(rawStudioMic)` supporting raw studio capture (`echoCancellation: false`, `noiseSuppression: false`, `autoGainControl: false`) when wearing headphones and speaker AEC/NS suppression when toggled off.
- `src/lib/audioStorageIdb.ts`, `src/lib/storage.ts`, & `src/lib/shareUrl.ts`: Added `makeVocalTakeBlobKey(songId, takeId)` (`${songId}_take_${takeId}`), extended `persistSongVocalsToIdb`, `hydrateSongVocalsFromIdb`, and `stripVocalsFromSong` for `vocalTakes`, preserved live `vocalTakes` in `restoreSongFromSnapshot`, and stripped `vocalTakes` in `generateShareUrl` / `parseSongFromUrl`.
- `src/lib/audioEngine.ts` & `src/hooks/useAudioEngine.ts`: Upgraded `VocalStudioTrackGainNode` with `setFxPreset` (`dry-natural`, `studio-warm`, `wide-chorus` stereo micro-delay width), added scheduled multi-take playback (`_scheduleActiveVocalTakes`, `_stopAllVocals`, sample-locked seeking & count-in deferral), applied real-time backing `autoDucking` on `guitarRhythm` and `piano` inside `_applySectionMixAndDrive`, and exposed `setVocalFxPreset` in `useAudioEngine.ts`.
- `src/lib/i18n.ts`: Added 11 symmetrical `th` / `en` Phase 5D Vocal Booth labels (`vocalBoothTitle`, `vocalBoothFreeBadge`, `scopeFullSong`, `scopeSelectedSection`, `preRollToggle`, `studioMicToggle`, `headphoneTip`, `startRecBooth`, `stopRecBooth`, `fxPresetLabel`, `autoDuckingLabel`).
- `src/components/VocalBoothControls.tsx` (New), `src/components/KaraokeTeleprompter.tsx`, `src/components/SoundCustomizerPanel.tsx`, & `src/app/page.tsx`: Built collapsible Real Vocal Booth (`0 Credits` badge, `Full Song` / `Selected Section` scope, `1-Bar Pre-Roll`, `Raw Studio Mic` mode + headphone recommendation, real-time VU meter + elapsed timer, Sync Click calibrator + `-150..+250ms` nudge slider, FX preset pills, Auto-Ducking toggle, Multi-Take comping list with solo audition & delete), exposed FX Presets + Auto-Ducking + `-150..+250ms` range in Sound Customizer Track 7, and auto-updated `statusTag` to `'vocal-recorded'` on vocal save.
- `tests/phase5d.test.ts` (New): Added unit & contract tests covering bar range math, 1-bar pre-roll plans, `computeTakePlaybackSlice` (bar-0 play, mid-take seek, Bluetooth negative latency pull, past-end skip), multi-take comping exclusivity, auto-ducking factor, `MicRecorder.buildAudioConstraints`, IndexedDB/snapshot/LINE-share offload roundtrips, and Phase 5D UI/engine contracts.

Tests:
- `npx tsx --test tests/*.test.ts` → 122/122 passing (100%)
- `npx eslint .` → 0 errors, 0 warnings across the entire repository
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript exited with code 0
- Multi-viewport UI QA (`http://localhost:3100` on Desktop `1440×900`, iPad `768×1024`, Mobile `390×844`) → 0 console errors, 0 horizontal overflow (`1425/1440`, `768/768`, `390/390`), 0 truncated FX buttons across all 3 viewports (`scrollWidth === clientWidth`), verified Section dropdown scoping, toggles, Sync Click calibrator, Latency `+10ms` nudge, and bidirectional Mixer Track 7 FX/Auto-Ducking sync.

---

### [Phase 5E] Live vs MP3 Export Parity, Studio Realism & AI Reference Track (Lyria 3.5)
Status: PASS (Completed & Verified)
Timestamp: 2026-11-14T06:40:00+07:00

Changes implemented:
- `src/lib/audioDspShared.ts` (New): Extracted isomorphic `BaseAudioContext`-compatible Web Audio DSP classes and constants (`GUITAR_INSTRUMENT`, `TRACK_PAN`, `TRACK_DEFAULT_VOL`, `resolveLeadSoundfontInstrument`, `getAmbienceWetGain`, `buildRoomImpulseBuffer`, `DrumSynth`, `MelodySynth`, `TrackGainNode` with `setVolumeAt`, `GuitarRhythmTrackGainNode`, `makeGuitarDistortionCurve`, `makeGuitarFuzzCurve`, `getLeadDriveDSPParams`, `LeadGuitarTrackGainNode`, `VocalStudioTrackGainNode`, `computeEffectiveBarMix`, and `createOfflineTrackBusSet`), eliminating immediate-start exponential lag when `t <= 0` on `OfflineAudioContext`.
- `src/lib/audioEngine.ts`: Refactored to import and re-export shared DSP components from `audioDspShared.ts` cleanly (preserving `VocalStudioTrackGainNode`, `computeAutoDuckFactor`, `setFxPreset`, and `smplr` `CacheStorage('demo_maker_smplr_v1')` support), and removed double drum attenuation so live playback matches offline MP3 1:1.
- `src/lib/vocalBoothUtils.ts`: Aligned `computeAutoDuckFactor` omitted-`vocal` default behavior (`enabled: true, volume: 95`) cleanly with live engine and exporter defaults.
- `src/lib/barPlanner.ts`: Added Beat 1 / Section-entry downbeat accent contours on rhythm guitar and bass plus subtle phrase fret-slide articulation in `planLead` (preserving exact Beat 1 `t = 0` target notes, `[18, 32]` ms strum gap physics, and bass note counts).
- `src/lib/mp3Exporter.ts`: Upgraded `renderSongToAudioBuffer`, `exportSongMp3`, and `downloadSongMp3` with `OfflineAudioContext` `smplr` `Soundfont` rendering (`CacheStorage('demo_maker_smplr_v1')`, parallel load with timeout + per-track oscillator fallback), `createOfflineTrackBusSet` shared DSP routing + per-bar `applyBarMix` (`setVolumeAt`, section lead drive transitions, `-2dB` auto-ducking), `computeOfflineVocalSchedule` combining continuous active `song.vocalTakes` (`startGlobalBarIndex` / `preRollOffsetSec` / `vocalLatencyOffsetMs`) + legacy `bar.vocalAudio` clips, and `{ instrumentalOnly }` karaoke export option (with `_Instrumental.mp3` download filename).
- `src/components/ExportModal.tsx`: Added live vocal/band mixdown readiness readout (`Vocal Takes` + active instrument count + `ambience3D`), `"Instrumental Karaoke Only (ปิดเสียงร้อง)"` toggle (`aria-pressed`), phased progress bar (`loading-samples` -> `mixing` -> `encoding`), and post-export parity telemetry summary.
- `src/lib/geminiClient.ts`, `src/lib/aiPrompts.ts`, `src/app/api/advance/reference-track/route.ts` (New), & `src/components/AdvanceModeModal.tsx`: Added `callGeminiMusicAudio()` (`lyria-3.5`), `buildLyriaReferencePrompt()`, `POST /api/advance/reference-track` with validation and offline simulation (`0 Credits`), and the Paid-Credits-Only **AI Reference Track (`lyria-3.5 · 8 เหรียญ`)** tab inside `AdvanceModeModal` gated via `canUsePaidOnlyModel` + explicit `ใช้ 8 เหรียญ` confirmation + inline `<audio controls>` & MP3 download.
- `tests/phase5e.test.ts` (New): Added verification suite covering shared `BaseAudioContext`/`OfflineAudioContext` DSP parity & auto-ducking, continuous `VocalTake` + `Instrumental Only` export scheduling + `0xFF` MP3 frame sync header, `barPlanner` groove accents & fret slide safety, `lyria-3.5` prompt/API route (`400`, offline simulation, mocked audio output, zero key leak), and `ExportModal` / `AdvanceModeModal` UI contracts.

Tests:
- `npx tsx --test tests/*.test.ts` → 127/127 passing (100%)
- `npx eslint .` → 0 errors, 0 warnings across the entire repository
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript exited with code 0
- Multi-viewport UI QA (`http://localhost:3100` on Desktop `1440×900`, iPad `768×1024`, Mobile `390×844`) → 0 console errors, 0 horizontal overflow (`1425/1425`, `768/768`, `390/390`), verified ExportModal band/vocal mixdown readout & `"Instrumental Karaoke Only (ปิดเสียงร้อง)"` toggle state transitions, and AdvanceModeModal Paid-Only Guard for `lyria-3.5` (`8 เหรียญ`) on fresh trial wallet without executing live paid API calls.

---

### [Phase 5F] Google Sign-In, Server Credit Wallet & PromptPay Auto-Slip Top-Up
Status: PASS (Completed & Verified)
Timestamp: 2026-11-14T07:01:00+07:00

Changes implemented:
- `.env.example` & `supabase/migrations/20261114_phase5f_wallet_billing.sql` (New): Documented `NEXT_PUBLIC_BILLING_MODE`, `SUPABASE_SERVICE_ROLE_KEY`, `PROMPTPAY_RECEIVER_ID`, `PROMPTPAY_RECEIVER_NAME`, `SLIP_VERIFY_API_URL`, and `SLIP_VERIFY_API_KEY`; created Row-Level-Security Postgres tables (`user_wallets`, `credit_transactions`, `topup_orders` with `trans_ref UNIQUE`), `SELECT`-only authenticated policies, and `service_role`-exclusive atomic RPCs (`init_user_wallet`, `atomic_deduct_credits`, `atomic_refund_credits`, `atomic_credit_topup_from_slip`).
- `src/lib/promptpayQr.ts` (New): Implemented EMVCo / Bank of Thailand PromptPay QR payload generator (`normalizePromptPayReceiver`, `crc16Ccitt` CCITT-FALSE `0x1021`, `generatePromptPayPayload` for 10-digit mobile `0066...`, 13-digit Tax/ID, and 15-digit e-Wallet) and `qrcode`-backed SVG / Data URL QR generators (`generatePromptPayQrSvg`, `generatePromptPayQrDataUrl`).
- `src/lib/serverWallet.ts` (New): Built server-only billing & anti-fraud verification layer (`verifySupabaseUserFromRequest`, `getOrInitWallet`, `atomicDeductCredits`, `atomicRefundCredits`, `createPendingTopUpOrder`, `normalizeSlipApiPayload`, `validateSlipAgainstOrder` enforcing all 5 security checks: valid signature, receiver ID/name match, exact package THB amount, unique `transRef`, and `<= 24h` timestamp, plus `tryServerBillingPreDeduct`).
- `src/app/api/billing/wallet/route.ts`, `src/app/api/billing/create-order/route.ts`, & `src/app/api/billing/verify-slip/route.ts` (New): Added authenticated (`401` on missing/invalid Bearer JWT) server wallet balance API, server-authoritative PromptPay QR order generator, and `<= 4MB` (`JPG/PNG/WebP`) Auto-Slip verification endpoint with `409 Conflict` duplicate `transRef` protection; wired `tryServerBillingPreDeduct` + auto-refund safely into `/api/advance/lyrics` and `/api/advance/reference-track`.
- `src/lib/cloudSync.ts`, `src/components/AccountSyncModal.tsx`, `src/lib/creditManager.ts`, `src/components/AdvanceModeModal.tsx`, & `src/app/page.tsx`: Added 1-click Google OAuth (`getGoogleOAuthAuthorizeUrl`, `signInWithGoogleOAuth`), prominent `"เข้าสู่ระบบด้วย Google"` button + free Guest Mode notice in `AccountSyncModal`, server wallet sync (`syncWalletFromServer`, `applyServerWalletSnapshot`, `isProductionBillingEnabled`, `canAllowDemoTopUp`), real EMVCo PromptPay QR image + Slip Upload dropzone + `"เข้าสู่ระบบด้วย Google เพื่อเติมเครดิต"` Login-to-TopUp gate in `AdvanceModeModal`, and auto wallet sync on page load/login.
- `tests/phase5f.test.ts` (New): Added automated tests for CCITT CRC16 (`123456789` -> `29B1`), mobile/tax/e-wallet EMVCo QR payloads & SVG output, Google OAuth URL construction & wallet sync, 5-layer slip verification attack matrix, `401` unauthenticated billing endpoint rejections, `> 4MB` slip rejection, `409` replay rejection, SQL migration & Phase 5F UI contracts.

Tests:
- `npx tsx --test tests/*.test.ts` → 132/132 passing (100%)
- `npx eslint .` → 0 errors, 0 warnings across the entire repository
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript exited with code 0
- Multi-viewport UI QA (`http://localhost:3100` on Desktop `1440×900`, Tablet `768×1024`, Mobile `390×844`) → 0 console errors on load/modals (`1425/1440`, `753/768`, `390/390` width, `0` horizontal overflow), verified 1-click `"เข้าสู่ระบบด้วย Google"` + free Guest Mode badge in `AccountSyncModal`, verified PromptPay Login-to-TopUp Gate (`"🔐 กรุณาเข้าสู่ระบบด้วย Google เพื่อเติมเครดิต"`) in `AdvanceModeModal`, and verified live `POST /api/billing/create-order` returns HTTP `401 UNAUTHENTICATED` without a Bearer token.

---

### [Pre-Production Hardening] Strict Production Auth/Billing Gate (All 6 AI Routes) + Cloud Songs SQL Migration
Status: PASS (Completed & Verified)
Timestamp: 2026-11-14T09:29:00+07:00

Changes implemented:
- `src/lib/serverWallet.ts`: Hardened `tryServerBillingPreDeduct` so `NEXT_PUBLIC_BILLING_MODE=production` enforces fail-closed HTTP `503 BILLING_NOT_CONFIGURED` when Supabase URL / `SUPABASE_SERVICE_ROLE_KEY` are missing and HTTP `401 AUTH_REQUIRED` / `AUTH_REQUIRED_FOR_PRO_MODEL` when requests lack a valid Bearer JWT; added shared `WalletBalanceSummary`, `ServerBillingPreDeductResult`, and `refundServerBillingOnFailure` helper.
- `src/app/api/advance/{architect,director,hum-to-song,lyrics,reference-track,tts-cue}/route.ts`: Wired `tryServerBillingPreDeduct` (`CREDIT_COST_TABLE.aiEasyWholeSong`, `aiDirectorComplex`, `aiHumToSong`, `aiTtsCue`, lyrics, and `lyria-3.5` reference-track) + shared `refundServerBillingOnFailure` auto-refund on failures across all 6 AI endpoints, returning synced `wallet?: WalletBalanceSummary` snapshots.
- `supabase/migrations/20261114_phase4d_cloud_songs.sql` (New) & `src/lib/cloudSync.ts`: Added `public.songs` table (`PRIMARY KEY (user_id, id)`), `idx_songs_user_updated`, and strict `TO authenticated` RLS policies (`select`, `insert`, `update`, `delete`); updated `syncSongToCloud()` to append `?on_conflict=user_id,id` for authenticated users so starter IDs never collide across accounts.
- `src/components/EasyModeStarterModal.tsx`, `src/components/MiniPianoRollModal.tsx`, `src/components/AdvanceModeModal.tsx`, & `src/components/AccountSyncModal.tsx`: Attached `getAuthAccessToken()` Bearer headers and `applyServerWalletSnapshot()` across all remaining AI callers (`architect`, `hum-to-song`, `tts-cue`, `director`), added explicit `directorNotice` handling on `401`/`402`/`503`, and added `id`/`name` attributes on auth/cloud/slip `<input>` controls.
- `tests/phase5f.test.ts`: Added Pre-Production Hardening tests verifying `503` missing server billing config, `401` rejections on all 6 `/api/advance/*` routes in `production` mode, mocked pre-deduct + `refundServerBillingOnFailure` roundtrip, `20261114_phase4d_cloud_songs.sql` RLS/PK definitions, and frontend/route wiring contracts.

Tests:
- `npx tsx --test tests/*.test.ts` → 133/133 passing (100%, 0 failed, 0 skipped)
- `npx eslint .` → 0 errors, 0 warnings across the entire repository
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript exited with code 0 (13/13 static pages, all 9 `/api/*` routes)

---

### [Activation Readiness] All-in-One Supabase SQL, Live Verification CLI, `/api/health` & OAuth Token Refresh
Status: PASS (Codebase Ready — Awaiting User Credentials & External Service Setup)
Timestamp: 2026-11-14T10:19:00+07:00

Changes implemented:
- `supabase/ALL_IN_ONE_SETUP.sql` (New): Consolidated idempotent SQL script combining `20261114_phase4d_cloud_songs.sql` and `20261114_phase5f_wallet_billing.sql` for single-paste execution in Supabase SQL Editor.
- `src/lib/productionReadiness.ts` (New) & `src/app/api/health/route.ts` (New): Added non-secret readiness evaluator (`evaluateProductionReadiness`, `GET /api/health`) validating Gemini, Supabase URL/Keys distinction, PromptPay ID format, Slip Verify API URL/Key, and `billingMode`.
- `scripts/check-production-readiness.ts` (New) & `package.json`: Added `npm run check:prod` (local `.env.local` validation + PromptPay EMVCo CRC16 check without printing secrets) and `npm run check:prod -- --live` (live Supabase Auth Google OAuth status, table existence, and PostgREST RPC inspection); added `npm test` script alias.
- `src/lib/cloudSync.ts`, `src/lib/creditManager.ts`, & `src/app/page.tsx`: Added `refreshAuthSession()` (`/auth/v1/token?grant_type=refresh_token`), OAuth query-error cleanup in `consumeAuthCallbackFromUrl()`, `status` reporting on `syncWalletFromServer()`, whitespace/case-tolerant `isProductionBillingEnabled()`, and automatic `401` token refresh retry on app startup.
- `.env.local`: Safely populated missing empty template keys (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_BILLING_MODE=standalone`, `SUPABASE_SERVICE_ROLE_KEY`, `PROMPTPAY_RECEIVER_ID`, `PROMPTPAY_RECEIVER_NAME`, `SLIP_VERIFY_API_URL`, `SLIP_VERIFY_API_KEY`) while preserving existing `GEMINI_API_KEY` and `GEMINI_MODEL`.
- `tests/phase5f.test.ts`: Added Section 7 covering `evaluateProductionReadiness`, `/api/health`, `ALL_IN_ONE_SETUP.sql`, `isProductionBillingEnabled()`, and `refreshAuthSession()` / `401` wallet retry contract.

Tests:
- `npm run check:prod` → verified `.env.local` readiness (reports `GEMINI_API_KEY` set; lists the 7 external production keys awaiting user values)
- `npm test` (`npx tsx --test tests/*.test.ts`) → 134/134 passing (100%, 0 failed, 0 skipped)
- `npx eslint .` → 0 errors, 0 warnings across the entire repository
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript exited with code 0 (14/14 static pages + all 10 `/api/*` routes)

---

### [Phase 6] Thai Songwriting Phonology Engine, Multi-Genre Presets, Lyric-Aligned Melody, AI Singing Demo & Writer UX
Status: PASS (Completed & Verified)
Timestamp: 2026-11-14T16:13:00+07:00

Changes implemented:
- `src/types/song.ts`: Added `ThaiSongGenre`, `ThaiLyricEra`, `ThaiLyricDialect`, and `ThaiSongwriterStyle` plus optional `thaiGenre`, `lyricEra`, `lyricDialect`, and `songwriterStyle` metadata on `SongProject`.
- `src/lib/thaiRhymeHelper.ts`: Added Thai syllable phonology engine (`segmentThaiWordToSyllables`, `analyzeThaiSyllablePhonetics` detecting ไตรยางศ์/อักษรนำ, สระสั้น-ยาว, มาตราตัวสะกด 9 แม่, คำเป็น/คำตาย, 5 Thai lexical tones, and tone-to-melody pitch contour advice; `filterThaiRhymes` with liveness & tone filters; expanded `THAI_RHYME_GROUPS` to 34 rhyme families).
- `src/lib/aiPrompts.ts`: Added `THAI_GENRE_PROFILES` (`thai-pop`, `thai-rock`, `phuea-chiwit`, `luk-thung`, `luk-krung`, `acoustic-indie`, `thai-rnb`), `THAI_ERA_PROFILES`, `THAI_DIALECT_PROFILES` (กลาง/เหนือ/อีสาน/สุพรรณ/ใต้), `SONGWRITER_STYLE_PROFILES`, `getSyllableBudgetForBpm`, dynamic `barCount` (`2..8`) schema & prompts, full-song story continuity (`allPriorSections`), draft polishing (`polishExistingDraft`), and Thai genre-aware `buildLyriaReferencePrompt`.
- `src/lib/melodyUtils.ts` & `src/lib/songArchitect.ts`: Added `splitThaiLyricSyllables` and `generateLyricAlignedGuideMelody` (16-step bar alignment, 2-chord bar split, Thai tone-to-pitch inflection & คำเป็น/คำตาย note duration); added 5 Thai genre presets (`thai-pop-hit`, `thai-rock-90s`, `phuea-chiwit-road`, `luk-thung-heart`, `luk-krung-classic`) to `EASY_STYLE_PRESETS` (10 presets total) and 16-step guide melody generation in `buildDiatonicGuideNotesForChord`.
- `src/app/api/advance/{lyrics,architect,reference-track,tts-cue}/route.ts`: Upgraded lyrics generation to support dynamic `2..8` bars, per-bar chords/drafts, `thaiGenre`/`lyricEra`/`lyricDialect`/`songwriterStyle`, `polishExistingDraft`, `allPriorSections`, and per-line `phonetics` output; wired `thaiGenre`/`lyricDialect`/`songwriterStyle` into `architect` & `reference-track`; added `vocalMode: 'singing-demo'` and `thaiGenre` phrasing support to `tts-cue`. (Zero edits to Production Auth/Billing backend.)
- `src/components/AdvanceModeModal.tsx`: Added Thai Phonology Inspector + คำเป็น/คำตาย & 5-tone rhyme filters in Tab 1; added genre/era/dialect/songwriter selectors, auto-filled topic, draft polish toggle, editable generated lines with selective bar checkboxes + chord apply toggle, and per-line `🎤 AI ร้อง` synthesis saving straight to `bar.vocalAudio`.
- `src/components/MiniPianoRollModal.tsx`: Integrated `generateLyricAlignedGuideMelody` alongside `generateChordGuideMelodyNotes`, rendered a synchronized Thai syllable + tone/liveness strip aligned to the piano roll grid, added AI voice selector (`Kore`/`Aoede`/`Puck`/`Charon`/`Fenrir`) calling `/api/advance/tts-cue` in `singing-demo` mode, and added `"💾 ใช้เสียง AI นี้เป็นเสียงร้องประจำห้อง"` (`onSaveVocalToBar`).
- `src/components/EasyModeStarterModal.tsx`: Exposed `lyricDialect`, `songwriterStyle`, and `lyricEra` selectors for Thai songs alongside the 10 style presets and forwarded them to `/api/advance/architect`.
- `src/components/SectionBuilder.tsx` & `src/app/page.tsx`: Added per-bar BPM syllable budget indicator, ending syllable phonology chip, inline `"🔗 สัมผัสต่อจากวรรคก่อน"` previous-bar rhyme popover, and `"✨ ต่อเรื่องราวท่อนถัดไป (AI Continue Story)"` section continuation flow (`onAddNextAiStorySection`); wired `onSaveVocalToBar`, `onApplySectionVocalAudio`, `onUpdateSongStyleMeta`, and expanded `onApplyLyrics` in `page.tsx`.
- `src/components/ExportModal.tsx`: Exported `generateSunoPrompt(song, { includeChords })` embedding Thai genre `sunoTags`, era, and dialect hints, added clean lyrics mode toggle (hide/show chords for crisp Suno singing), and added 1-click Copy Style Tags.
- `tests/phase6_thai_lyrics_ux.test.ts` (New): Added automated verification across phonology, lyric-aligned 16-step melody, genre/dialect/songwriter prompts, `/api/advance/lyrics` 6-bar + `/api/advance/tts-cue` `singing-demo` routes, `generateSunoPrompt`, and all Phase 6 UI contracts.

Tests:
- `npx tsx --test tests/*.test.ts` → 140/140 passing (100%, 0 failed, 0 skipped)
- `npx eslint . --max-warnings=0` → 0 errors, 0 warnings across the entire repository
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript exited with code 0 (14/14 static pages + all 10 `/api/*` routes)

---

### [Phase 6B] Classic/Luk-Thung/Modern Songwriters + Emotional Energy Arc, Hook Punchline & Ending Resolution Engine
Status: PASS (Completed & Verified)
Timestamp: 2026-11-14T16:44:30+07:00

Changes implemented:
- `src/types/song.ts`: Expanded `ThaiSongwriterStyle` to 16 entries (adding 10 classic/luk-thung/modern masters: `phaiboon-butkhan`, `suraphon-sombatcharoen`, `chali-intrawichit`, `sala-khunawut`, `chonlathi-thanthong`, `wasu-haohan`, `joey-boy`, `stamp-apiwat`, `the-toys`, `tan-lipta`) and added `ThaiEmotionalResolution` (`'auto' | 'piercing-sting' | 'fulfilling-warm' | 'empowering-anthem' | 'catchy-earworm' | 'nostalgic-fade'`) + `emotionalResolution` on `SongProject`.
- `src/lib/aiPrompts.ts`: Added `SECTION_ENERGY_ARC_BLUEPRINTS` (per-section `energyScore`, `roleTitle`, `vocalRegisterHint`, and `barByBarPlan` including Chorus Bar 1 Opening Hook Punchline → Bar 3 Emotional Climax → Bar 4 Signature Payoff Line and Outro `3→1/10`) and 6 `EMOTIONAL_RESOLUTION_PROFILES` (`hookRule` + `endingRule`), wired into `buildLyricsSystemPrompt`, `buildLyricsUserPrompt`, `buildEasyArchitectSystemPrompt`, and `buildEasyArchitectUserPrompt`.
- `src/lib/melodyUtils.ts`: Added `sectionType` awareness to `generateLyricAlignedGuideMelody` (`chorus` `+2` / `bridge` `+1` / `outro` `-1` register shift, `pre-chorus` final-syllable upward lift, `chorus` punchline emphasis, and `outro` final-syllable tonic root resolution with `durationSteps >= 3`).
- `src/lib/songArchitect.ts` & `src/app/api/advance/{lyrics,architect}/route.ts`: Forwarded `emotionalResolution` and `sectionType` across prompts, simulated fallback, guide melody generation, and `sanitizeArchitectSongProject`.
- `src/app/page.tsx`, `src/components/MiniPianoRollModal.tsx`, `src/components/EasyModeStarterModal.tsx`, & `src/components/AdvanceModeModal.tsx`: Wired `emotionalResolution` persistence/selectors, passed `sectionType` in `MiniPianoRollModal` guide melody generation, and added the live Section Energy & Hook Blueprint card inside `AdvanceModeModal`.
- `tests/phase6_thai_lyrics_ux.test.ts`: Added unit, prompt, melody contour/tonic-resolution, and UI contract coverage for Phase 6B.

Tests:
- `npx tsx --test tests/*.test.ts` → 141/141 passing (100%, 0 failed, 0 skipped)
- `npx eslint . --max-warnings=0` → 0 errors, 0 warnings across the entire repository
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript exited with code 0 (14/14 static pages + all 10 `/api/*` routes)

---

### [Phase 6C] Dynamic Few-Shot Bank, Strict Chain-Rhyme Validator, Conversational Phrasing & Live Benchmark
Status: PASS (Completed & Verified)
Timestamp: 2026-11-14T17:32:00+07:00

Changes implemented:
- `src/lib/aiPrompts.ts`: Replaced single static coffee-shop `GOLDEN_LYRIC_FEW_SHOTS` with `MASTER_LYRIC_FEW_SHOT_BANK` covering all 7 `thaiGenre`s, all 16 `songwriterStyle`s, 4 `lyricDialect`s, and all 6 `emotionalResolution` modes (with Chorus + Outro examples) plus exported `buildDynamicLyricFewShots`; upgraded `getSyllableBudgetForBpm(bpm, timeSignature, options?)` to adapt budgets and `barBudgets` per `sectionType`, `songwriterStyle`, and `thaiGenre` while preserving legacy BPM compatibility; wired dynamic few-shots and style/section budgets into `buildLyricsSystemPrompt`, `buildLyricsUserPrompt`, and `buildEasyArchitectSystemPrompt`.
- `src/lib/thaiRhymeHelper.ts` & `src/lib/sectionUtils.ts`: Expanded `classifyRhymeGroupId` to cover `-อง/-อม/-อย/-อก/-อด/-อบ`, implicit `-โอะ` closed syllables (`คน/ลม/ลง/จบ/หมด`), `เ-ิ`, `แ-`, `เ-`, `โ-`, and `-ัว`+coda; fixed reduced `-ัว` closed syllable segmentation/counting (`สวน/ดวง/สวย/อ้วน`) in `segmentThaiWordToSyllables` & `countThaiWordSyllables`; upgraded `validateThaiLyricCouplets` to enforce full chain-rhyme continuity (`chainContinuityRatio`, internal rhymes across first 6 syllables, `duplicateEndWords`, `uniqueRhymeGroups`, `hasVowelShift`, `syllableCounts`, and `outOfBudgetBars`).
- `src/lib/melodyUtils.ts`: Added exported `buildConversationalStepPlan` and wired it into `generateLyricAlignedGuideMelody` so Thai lyric syllables cluster into natural 2-phrase conversational pockets with mid-bar breath pauses instead of uniform step division, preserving Outro tonic root resolution.
- `src/lib/songArchitect.ts`, `src/app/api/advance/lyrics/route.ts`, & `src/app/api/advance/architect/route.ts`: Added shared `buildStyledSimulatedSongLyrics`, updated `buildSimulatedArchitectSong` and `buildSimulatedLyrics` to produce distinct style/genre/dialect/resolution lyrics with non-empty `outro` sections, and passed `{ bpm, timeSignature }` + style metadata across both API routes.
- `tests/phase6_thai_lyrics_ux.test.ts`: Added Phase 6C tests covering Dynamic Few-Shot Bank & style/section syllable budgets, chain-rhyme continuity & budget validation, and conversational phrasing melody + style/outro-aware offline simulation.

Live Benchmark (`gemini-3.8-flash`, 7 archetype cases, 8 total API calls including 1 auto-polish on Case 1):
- Cases tested: `dee-nitipong` (76 BPM Chorus `piercing-sting`), `phaiboon-butkhan` (68 BPM `classic-lukthung` Verse), `sala-khunawut` (80 BPM `isan` Chorus), `joey-boy` (108 BPM `catchy-earworm` Verse), `the-toys` (92 BPM `thai-rnb` Chorus), `sek-loso` (116 BPM `thai-rock` Chorus), `boy-kosiyabong` (74 BPM `acoustic-indie` 2-bar Outro).
- Result: 7/7 passed (`chainContinuityRatio` 0.67–1.00, 3 cases achieved 1.00 = 100%; `hasVowelShift: true` in 7/7; `duplicateEndWords: []` in 7/7).
- Recorded usage: 20,832 input / 0 cached / 2,141 output / 0 thought = 22,973 total tokens (~$0.023653 USD / ~0.80 THB).

Tests:
- `npx tsx --test tests/*.test.ts` → 144/144 passing (100%, 0 failed, 0 skipped)
- `npx eslint . --max-warnings=0` → 0 errors, 0 warnings across the entire repository
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript exited with code 0 (14/14 static pages + all 10 `/api/*` routes)

---

### [Phase 7A & Phase 7B] New Songwriter Legends (`aed-carabao`, `asanee-chotikul`), Real-Time HUD & Sheet Editor + Studio Undo/Redo & Single-Bar/Section Loop Preview
Status: PASS (Completed & Verified)
Timestamp: 2026-11-14T19:52:00+07:00

Changes implemented:
- **Phase 7A — 2 ตำนานนักแต่งเพลง + Real-Time Songwriter HUD & Sheet Editor:**
  - `src/types/song.ts`: Expanded `ThaiSongwriterStyle` from 16 to 18 styles by adding `'aed-carabao'` and `'asanee-chotikul'`.
  - `src/lib/aiPrompts.ts`: Added `'aed-carabao'` and `'asanee-chotikul'` entries to `SONGWRITER_STYLE_PROFILES` and `MASTER_LYRIC_FEW_SHOT_BANK.songwriters`; updated `getSyllableBudgetForBpm()` to open `6-11` syllables/bar for `'aed-carabao'` and `5-9` syllables/bar for `'asanee-chotikul'` while preserving `'5-8 พยางค์'` for the `74 BPM 4/4` default invariant.
  - `src/lib/songArchitect.ts`: Exported `VALID_SONGWRITER_STYLES` and validated `songwriterStyle` in `sanitizeArchitectSongProject()`; added chain-rhymed simulated lyrics and non-empty outro lines for `'aed-carabao'` and `'asanee-chotikul'` in `buildStyledSimulatedSongLyrics()` and `resolveSimulatedOutroLines()`.
  - `src/lib/sectionUtils.ts`: Added pure function `shiftLastTokenToNextBar(bars, fromBarIndex)` to shift the trailing whitespace word or Thai syllable onto the beginning of the next bar while preserving `chords`, `chordsPerBar`, `playStyle`, `melodyNotes`, and `vocalAudio`.
  - `src/components/SectionBuilder.tsx`: Switched from global `bpmBudget` to per-section `sectionBudget = getSyllableBudgetForBpm(song.bpm, song.timeSignature, { sectionType, songwriterStyle, thaiGenre })` + per-bar `barBudgets?.[barIndex]` slot guidance & tooltips; added real-time `validateThaiLyricCouplets()` HUD badges (`🔗 สัมผัสต่อเนื่อง {pct}%`, `⚠️ สัมผัสขาดวรรค`, duplicate end-word warning); enabled cross-section `prevBar` rhyme lookup on `barIndex === 0`; added `📝 แก้แบบแผ่นเดียว` multi-line Sheet Lyric Editor toggle and `⤵ ปัดคำลง` button on eligible bars.
- **Phase 7B — Studio History (Undo/Redo) + Single-Bar/Section Loop & 0-Credit Syllable Rhythm Preview:**
  - `src/lib/melodyUtils.ts`: Added `chordsPerBar?: 1 | 2` on `GenerateLyricAlignedMelodyOptions` and added 3-argument function overload `generateLyricAlignedGuideMelody(lyrics, chord1, extra)` matching the Phase 7 blueprint.
  - `src/lib/audioEngine.ts` & `src/hooks/useAudioEngine.ts`: Exported `LoopRange` (`{ startBar, endBar }`) and pure function `resolveNextBarIndex(currentBar, totalBars, loopRange)`; added `loopRange` to `EngineStatus`, `setLoopRange()` / `getLoopRange()` on `AudioEngine`, loop-range wrapping in `_playFromBar()`, and exposed `loopRange` + `setLoopRange` via `useAudioEngine()`.
  - `src/app/page.tsx` & `src/components/TransportBar.tsx`: Implemented Studio History stack (`MAX_HISTORY = 30`, `undoStackRef`, `redoStackRef`, `canUndo`, `canRedo`, `updateSongWithHistory`, `handleUndo`, `handleRedo`) wired across all song editing handlers/components; added `Undo2` / `Redo2` buttons and `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` keyboard shortcuts in `TransportBar`; wired `handleToggleLoopRange` and `handlePlayBarFromIndex`.
  - `src/components/SectionBuilder.tsx`: Added `🔁 ลูปท่อนนี้` on section headers, `🔁 ลูปห้องนี้` on bar cards, and 0-credit `🔊 ฟังจังหวะคำร้อง` button (auto-generating `generateLyricAlignedGuideMelody` when `melodyNotes` is empty and starting single-bar loop playback immediately).
- **Tests:**
  - `tests/phase6_thai_lyrics_ux.test.ts`: Adjusted bank size assertion on line 486 to `>= 16` (preserving Phase 6C while Phase 7A explicitly asserts `18`).
  - `tests/phase7a.test.ts` (New): 4 test blocks covering 18 styles/few-shots/budgets, `aed-carabao`/`asanee-chotikul` simulation & sanitization, `shiftLastTokenToNextBar` word/syllable immutability, and `SectionBuilder.tsx` HUD/Sheet/Shift contracts.
  - `tests/phase7b.test.ts` (New): 3 test blocks covering `resolveNextBarIndex`, `generateLyricAlignedGuideMelody` 3-argument overload, and Undo/Redo/Loop/Rhythm-Preview wiring contracts.

Tests:
- `npm test` (`npx tsx --test tests/*.test.ts`) → 151/151 passing (100%, 0 failed, 0 skipped; includes all 144 existing tests + 7 new Phase 7A/7B tests)
- `npx eslint . --max-warnings=0` → 0 errors, 0 warnings across the entire repository
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript exited with code 0 (14/14 static pages + all 10 `/api/*` routes)

---

### [Phase 7C] Studio Instrument Upgrade, Mixing & Thai Backing Band Grooves
Status: PASS (Completed & Verified)
Timestamp: 2026-11-14T20:16:00+07:00

Changes implemented:
- **Expanded Instrument & Drum Taxonomy (`src/types/song.ts`, `src/lib/barPlanner.ts`, `src/lib/midiExport.ts`, `src/lib/songArchitect.ts`, `src/lib/aiSongDirector.ts`):**
  - Expanded `GuitarStyle` (`'lukthung-bounce'`, `'rock-power'`), `BassStyle` (`'lukthung-groove'`, `'rnb-syncopated'`), `PianoStyle` (`'rnb-neo-chord'`, `'rock-organ-pad'`), and `DrumStyle` (`'lukthung-3cha'`, `'rnb-pocket'`, `'rock-drive'`).
  - Expanded `DrumVoice` and `GM_DRUM_MAP` in `src/lib/midiExport.ts` with `'openHat'` (46), `'tomHigh'` (48), `'tomLow'` (45), and `'woodblock'` (77).
  - Updated `VALID_RHYTHM_STYLES`, `VALID_BASS_STYLES`, `VALID_PIANO_STYLES`, and `VALID_DRUM_STYLES` in both `src/lib/songArchitect.ts` and `src/lib/aiSongDirector.ts`.
- **Studio Mixing & Isomorphic Live/Offline DSP Parity (`src/lib/audioDspShared.ts`, `src/lib/audioEngine.ts`):**
  - Calibrated `TRACK_PAN`: `guitarRhythm: -0.32`, `guitarLead: 0.38`, `piano: 0.28`, `bass: 0.0`, `drums: 0.0`, `melody: 0.0`.
  - Extended `DrumSynth` with `'openHat'` (6200 Hz HPF, 0.24s decay), `'tomHigh'` (triangle 195→105 Hz, 0.20s), `'tomLow'` (sine 130→68 Hz, 0.26s), and `'woodblock'` (950 Hz bandpass + 1850→950 Hz click transient, 0.06s).
  - Added and re-exported `BassTrackGainNode` (lowshelf 75 Hz +2.5 dB, peaking 320 Hz -2.5 dB Q 1.1) and `PianoTrackGainNode` (highpass 140 Hz Q 0.707, highshelf 4500 Hz +1.5 dB), wired identically in `AudioEngine.init()` and `createOfflineTrackBusSet()`.
- **Pure/Deterministic Thai Backing Band Grooves & Smart Interplay (`src/lib/barPlanner.ts`):**
  - Preserved all 9 original styles (`campfire-strum`, `soft-strum`, `fingerpicking`, `root-fifth`, `warm-sustain`, `warm-pad`, `gentle-arpeggio`, `shaker-cajon`, `simple-kit`) with identical RNG consumption and event behavior using `ctx.rng()` exclusively.
  - Implemented `'lukthung-bounce'` & `'rock-power'` in `planRhythm()`, `'lukthung-groove'` & `'rnb-syncopated'` in `planBass()`, `'rnb-neo-chord'` (with 7th/9th extensions + offbeat comping) & `'rock-organ-pad'` in `planPiano()` (with Smart Low-End Yielding `0.65x` on left-hand bass note when Bass is active or section intensity is `'high'`), and `'lukthung-3cha'`, `'rnb-pocket'`, `'rock-drive'` + multi-voice `planDrumFill()` in `planDrums()`.
  - Added Vocal-Aware Call-and-Response to `planLead()` (`riff-fills`): leaves steps `0..N-7` open when a bar contains lyrics (while preserving `t = 0` entry pickup when transitioning from a non-lead section) and responds strictly inside `N-6..N-1`.
- **0-Credit Genre Band Arrangement & UI Controls (`src/lib/songArchitect.ts`, `src/components/SectionBuilder.tsx`, `src/components/SoundCustomizerPanel.tsx`):**
  - Implemented and exported pure `applyGenreBandArrangement(song)` covering Luk Thung/Carabao (`aed-carabao`/`luk-thung`), Thai R&B (`thai-rnb`/`the-toys`), Thai Rock (`thai-rock`/`asanee-chotikul`/`sek-loso`), and Pop/Luk Krung/Acoustic Indie defaults.
  - Added all new instrument style `<option>` items and the `🎚️ จัดวงอัตโนมัติตามสไตล์เพลง (0 เครดิต)` button in both `SectionBuilder.tsx` and `SoundCustomizerPanel.tsx`.
- **Tests (`tests/phase7c.test.ts`):**
  - Added 6 comprehensive test blocks verifying 9-style invariance & determinism (`4/4`, `3/4`, `6/8`), all 9 new groove styles & 4 new drum voices + MIDI SMF export, Smart Low-End Yielding & 9th voicings, Vocal-Aware Call-and-Response Lead Guitar, live/offline `TRACK_PAN` / `BassTrackGainNode` / `PianoTrackGainNode` / `DrumSynth` parity, `applyGenreBandArrangement`, AI style sanitizer preservation, and UI contracts.

Tests:
- `npm test` (`npx tsx --test tests/*.test.ts`) → 157/157 passing (100%, 0 failed, 0 skipped; includes all 151 existing tests + 6 new Phase 7C tests)
- `npx eslint . --max-warnings=0` → 0 errors, 0 warnings across the entire repository
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript exited with code 0 (14/14 static/dynamic routes)

---

### [Phase 7D] AI Studio Master from Demo (`lyria-3.5`) + Single-Bar 3-Variations & Chord Mood Hints
Status: PASS (Completed & Verified)
Timestamp: 2026-11-14T20:34:00+07:00

Changes implemented:
- **Full Demo Master Blueprint & Lyria 3.5 Integration (`src/lib/aiPrompts.ts`, `src/app/api/advance/reference-track/route.ts`):**
  - Added `buildFullDemoMasterPrompt(song, options)` and upgraded `buildLyriaReferencePrompt` (100% backward compatible, safe fallbacks for `bpm`/`timeSignature`/`baseKey`) to extract multi-section maps (`[Verse]`, `[Chorus]`, `[Guitar Solo]`, `[Bridge]`, `[Outro]`), transposed chords per bar (`transposeChord`), section intensities, instrument styles (`mixer.guitarLead.model === 'gibson-les-paul'`, drive, drums), full lyrics, MIDI melody contour (`midiToNoteName` min/max & Chorus peak), and all 18 songwriter profiles (`aed-carabao`, `asanee-chotikul`, etc.).
  - Updated `POST /api/advance/reference-track` with `MAX_LYRIA_PROMPT_CHARS = 6000`, `sanitizeFullSongInput()`, `400` validation for invalid/empty `fullSong`, and `blueprintSummary` response telemetry, preserving 8-credit `tryServerBillingPreDeduct(..., { requirePurchased: true })` and `refundServerBillingOnFailure`.
- **AI Studio Master UI in Modals (`src/components/ExportModal.tsx`, `src/components/AdvanceModeModal.tsx`, `src/app/page.tsx`):**
  - Added **"✨ AI Studio Master: ต่อยอดเดโมนี้เป็นเพลงเต็ม"** panel in `ExportModal.tsx` with `blueprintSummary` stats, 0-credit Mock Preview Summary / Blueprint inspection toggle, 8-credit `canUsePaidOnlyModel` confirmation gate, `getAuthAccessToken()` Bearer header, `applyServerWalletSnapshot` / `deductCredits`, `fullSong: song` request payload, and audio player/download preview.
  - Updated Reference Track (`lyria-3.5`) tab in `AdvanceModeModal.tsx` with the Full Demo Blueprint card (`useFullDemoBlueprint` toggle + free Mock Preview Summary), `fullSong: song` submission, and `refResult.blueprintSummary` display.
- **Single-Bar 3-Variations & Chord Emotional Mood Hints (`src/lib/chordUtils.ts`, `src/lib/aiPrompts.ts`, `src/lib/songArchitect.ts`, `src/app/api/advance/lyrics/route.ts`, `src/components/SectionBuilder.tsx`, `src/app/page.tsx`):**
  - Added pure `getChordEmotionalHint(chordSymbol, lang)` in `src/lib/chordUtils.ts` translating Major, Minor, maj7, m7, Dom7, sus2, sus4, add9, dim/m7b5, and aug chords into TH/EN emotional cues.
  - Added `buildSingleBarVariationsUserPrompt` & `SINGLE_BAR_VARIATIONS_SCHEMA` in `src/lib/aiPrompts.ts` and `buildSimulatedSingleBarVariations` in `src/lib/songArchitect.ts`.
  - Extended `POST /api/advance/lyrics` to support `singleBarIndex` (`0..15` & bar-length validation, `GEMINI_MODEL_LITE` with `SINGLE_BAR_VARIATIONS_SCHEMA`, `buildSimulatedSingleBarVariations` fallback, 3 unique `variations`, and `tryServerBillingPreDeduct` 1 Cr + `refundServerBillingOnFailure`).
  - Added chord emotional mood badges (`🎭 ...`) per bar chord slot, the `🎲 3 ตัวเลือก` button & confirmation/picker popover (`1 Cr aiLyricsQuick`, Bearer auth, `applyServerWalletSnapshot`) in `src/components/SectionBuilder.tsx`, and wired `onCreditsChange` / `onOpenWallet` / `onOpenTopUpWallet` in `src/app/page.tsx`.
- **Tests (`tests/phase7d.test.ts`):**
  - Added 5 comprehensive test suites (`Phase 7D-1`..`Phase 7D-5`) validating chord hints, `buildFullDemoMasterPrompt` extraction, `/api/advance/reference-track` (`fullSong` validation, simulated fallback, mocked `lyria-3.5`), `/api/advance/lyrics` (`singleBarIndex` validation, simulated fallback, mocked `gemini-3.5-flash-lite`), and UI wiring contracts without invoking any real `GEMINI_API_KEY` API calls.

Tests:
- `npm test` (`npx tsx --test tests/*.test.ts`) → 162/162 passing (100%, 0 failed, 0 skipped; includes all 157 existing tests + 5 new Phase 7D tests)
- `npx eslint . --max-warnings=0` → 0 errors, 0 warnings across the entire repository
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript exited with code 0 (14/14 static/dynamic routes)

---

### [Phase 7E] Sprint A.5 — Arrangement, Vocal Timing, Lyrics Export, TTS `v1beta` Fix & Track 1B Retest
Status: PASS (Completed & Verified)
Timestamp: 2026-11-15T00:17:00+07:00

Changes implemented:
- **Group 1 — Playback Section Bounds, Live Lyric Strip, Arrange-by-Genre, Intro/Outro Sanitizer & Thai Syllable Split:**
  - `src/lib/audioEngine.ts` & `src/hooks/useAudioEngine.ts`: Added `PlayBounds` / `resolvePlaybackNextBar()` for single-pass `▶ เล่นท่อนนี้` playback and immediate loop-start transport; fixed `melody` default tracking in live engine.
  - `src/lib/songArchitect.ts` & `src/lib/aiPrompts.ts`: Updated `sanitizeArchitectSongProject()` to clear `Intro` `melodyNotes`, normalize trailing `Outro` `break` -> `let-ring`, prevent consecutive `break` bars, preserve `applyGenreBandArrangement()` slow-tempo accuracy (no undesired `3-cha` / `reggae-ska`), tightened `<= 72 BPM` lyric syllable budgets in `getSyllableBudgetForBpm()` + schemas, and triggered `gemini-3.5-flash-lite` auto-polish on `duplicateEndWords` in `src/app/api/advance/architect/route.ts`.
  - `src/lib/sectionUtils.ts`: Upgraded `shiftLastTokenToNextBar()` with Thai syllable segmentation when trailing unspaced chunks exceed 2 syllables.
  - `src/components/SectionBuilder.tsx`, `src/components/LiveLyricStrip.tsx`, `src/components/TransportBar.tsx`, `src/app/page.tsx`: Wired `▶ เล่นท่อนนี้`, `🔁 ลูปท่อนนี้`, `🎚️ จัดวงอัตโนมัติตามสไตล์เพลง`, `LiveLyricStrip`, `aria-label` on Share/Export CTA button.
- **Group 2 & Group 3 — Silence Trimming, Non-Overlapping Clips, 0-Cr Browser Speech, `.LRC`/`.TXT` Export & Melody Balance:**
  - `src/lib/audioTrim.ts` & `src/lib/mp3Exporter.ts`: Trimmed `-45 dB` leading silence safely with 15ms margin, enforced non-overlapping vocal take playback windows with `20ms` fade-out (`computeNonOverlappingClipWindow`), balanced default `melody` guide volume (`56`) + `Backing Track Only` toggle.
  - `src/lib/browserSpeechCue.ts`: Added 0-credit BPM-scaled Web Speech API lyric reader (`🗣️ อ่านเนื้อท่อนนี้ (0 Cr)`).
  - `src/lib/lyricExport.ts` & `src/components/ExportModal.tsx`: Implemented `buildLrcContent` / `downloadLrcFile` (`.lrc`) and `buildPlainLyricsWithChords` / `downloadLyricsTxtFile` (`_lyrics.txt`) plus `.json` download feedback state.
- **Gemini 3.8 TTS `v1beta` Fix & Safe Error Handling (`src/lib/geminiClient.ts`):**
  - Updated `callGeminiTtsAudio()` to initialize `@google/genai@3.3` with `apiVersion: 'v1beta'` (removing unsupported `speech_config.language` & `store: false`), added `:generateContent` HTTP 400/404 fallback + L16-to-WAV wrapping, and added key-redacting error detail reporting in `classifyInteractionError()`.
- **Track 1B Live Retest & Audio Inspection (`qa-results/track1b-retest/`):**
  - Executed live Chrome QA (`NEXT_PUBLIC_BILLING_MODE=standalone`) on 4 representative styles (`sala-khunawut`, `dee-nitipong`, `boy-kosiyabong`, `asanee-chotikul`) generating 4 `gemini-3.8-flash` songs (+1 `gemini-3.5-flash-lite` polish) and 8 live `gemini-3.8-flash-tts` `audio/wav` singing guide clips (`Kore`, `Charon`, `Fenrir`), exporting `offline-3d-mix-vocal.mp3`, `lyrics.lrc`, `lyrics-chords.txt`, and `song.json`.
  - Audited via `ffprobe`, `ffmpeg` (`volumedetect`/`silencedetect`), `read_file` audio playback listening, and `qa-results/track1b-retest/README.md` (`mean_volume` improved from `-18.3..-16.0 dB` to `-16.4..-15.0 dB`, 0 mid-song dead silence bugs, 0 Intro flute notes, all Outros resolving on `let-ring`, `Soundfonts 4/4 · 2 Vocal Sources`; reset Chrome `localStorage` cleanly to starter `AI 15`).

Tests:
- `npm test` (`npx tsx --test tests/*.test.ts`) → 170/170 passing (100%, 0 failed, 0 skipped; includes 162 prior tests + 8 Phase 7E test suites in `tests/phase7e.test.ts`)
- `npx eslint . --max-warnings=0` → 0 errors, 0 warnings across the entire repository
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript exited with code 0 (14/14 static/dynamic routes)

---

### [Phase 7E] Sprint B — Vocal Timing/Boundary Clamp, Offline Soundfont Parity, Thai Rhyme Extensions & Priority Polish
Status: PASS (Completed & Verified)
Timestamp: 2026-11-15T07:36:30+07:00

Changes implemented:
- **Dynamic Section Bar Tracking, AI TTS Time-Fit (`<= 1.35x`) & Zero-Bleed Boundary Clamp (`src/types/song.ts`, `src/lib/vocalBoothUtils.ts`, `src/lib/audioTrim.ts`, `src/lib/audioEngine.ts`, `src/lib/mp3Exporter.ts`):**
  - Added `source?: 'mic' | 'ai-tts'` to `VocalTake` (`src/types/song.ts`) and `isAiTtsVocalTake()` (`src/lib/vocalBoothUtils.ts`) to distinguish synthetic AI TTS guides cleanly from real mic recordings.
  - Added `resolveVocalTakeBarSpan()` (`src/lib/vocalBoothUtils.ts`) so `scope === 'section'` vocal takes follow their `sectionId` dynamically across bar insertions, deletions, and section reorders (while preserving synthetic partial sub-ranges). Updates `computeTakePlaybackSlice()` and `hasActiveVocalAtBar()`.
  - Added `computeVocalTakePlaybackPlan()` (`src/lib/vocalBoothUtils.ts`) shared across `AudioEngine._scheduleActiveVocalTakes()` and `mp3Exporter.renderSongToAudioBuffer()`: applies gentle `playbackRate` time-fitting (`1.0..1.35x`) exclusively to `ai-tts` takes (preserving `1.0x` on mic vocals), scales mid-take seek buffer offsets by `playbackRate`, and hard-clamps overflowing takes at section end (`+0.18s` max slack for AI TTS, `+0.65s` for mic, and `otherStartSongSec - 0.03s` before any subsequent active vocal take) with a smooth `<= 45ms` `GainNode` fade-out and `src.stop(...)`.
  - Extended `src/lib/audioTrim.ts` with `findTrailingSilenceEndSampleIndex()`, `trimChannelsSilence()`, `trimAudioBufferTrailingSilence()`, and `options.trimTrailing` on `trimAudioDataUrlLeadingSilence()` (`trailingMarginMs = 40ms`). Applied trailing trim on `ai-tts` decoding in `AudioEngine` and `mp3Exporter`, leaving mic takes/bar clips untouched.
- **Offline Soundfont Scheduler, Resource Lifecycle & Large-Project Export Safety (`src/lib/mp3Exporter.ts`, `src/lib/audioEngine.ts`, `src/hooks/useAudioEngine.ts`, `src/components/ExportModal.tsx`):**
  - Exported `OFFLINE_IMMEDIATE_SCHEDULER` (`src/lib/mp3Exporter.ts`) to bypass `smplr`'s real-time `setInterval` lookahead inside fast `OfflineAudioContext` rendering; guarded timed-out `sf.ready.catch(() => {})` rejections and disposed loaded Soundfont instances reliably in `finally`.
  - Added `AudioEngine.invalidateLoadedInstruments()` (`src/lib/audioEngine.ts`), serialized concurrent `init()` calls via `activeInitPromise`, disposed prior `Soundfont` instances before re-init / `dispose()`, guarded `ctx.resume().catch(() => {})` + `ctx.close().catch(() => {})`, and wired `useAudioEngine.ts` to call `invalidateLoadedInstruments()` on guitar model switches.
  - Replaced `data:text/json;charset=utf-8,...` URI download in `ExportModal.tsx` `handleDownloadJSON()` with `Blob` + `URL.createObjectURL` + deferred `URL.revokeObjectURL` cleanup to handle multi-MB embedded-WAV projects cleanly.
- **Thai Syllable Segmenter & Vowel Rhyme Coverage (`src/lib/thaiRhymeHelper.ts`):**
  - Fixed `segmentThaiWordToSyllables()` compound vowel rule so `เ-อะ` (`เยอะ`, `เลอะ`, `เขอะ`), `เ-ียะ`, and `เ-ือะ` stay intact as single syllables instead of splitting off `อะ`.
  - Extended `classifyRhymeGroupId()` before the generic `/อ$/` rule with `-ือ` (`ue`: `มือ`, `ถือ`, `คือ`, `จับมือ` separated cleanly from `รอ` `or`), `เ-าะ` (`oh_short`: `หัวเราะ`, `เพราะ`), `-ุย` (`ui`: `คุย`), `เ-อะ` (`oe_short`: `เยอะ`), `โ-ะ` (`o_short`: `โต๊ะ`), `เ-ะ` (`eh_short`: `เตะ`), and `-ะ` (`a_short`: `นะ`).
- **Slow Thai Pop/R&B Budgets, Outro Bar-1 Guard & Chorus-First Priority Polish (`src/lib/aiPrompts.ts`, `src/app/api/advance/architect/route.ts`):**
  - Updated `getSyllableBudgetForBpm()` so slow modern Pop/R&B (`64..72 BPM`, `4/4`, `thai-pop` / `thai-rnb` / `acoustic-indie` or modern writers `dee-nitipong`, `boy-kosiyabong`, `seefa`, etc., excluding heritage genres/melismatic writers) unlocks a natural `5–8` syllable range while strictly preserving baseline `68 BPM -> 4–6`, `74 BPM -> 5–8`, and waltz/heritage invariants.
  - Added `Outro Bar 1` conciseness guard in `buildEasyArchitectSystemPrompt()`.
  - Added `selectPrioritySectionsForPolish()` (`src/lib/aiPrompts.ts`) prioritizing `chorus -> pre-chorus -> verse -> outro` (preventing 2-section slicing from skipping `Chorus`), enriched `buildRhymePolishPrompt()` with explicit `weakPairs` and `outOfBudgetBars` notes, and wired both into `POST /api/advance/architect` (evaluating `chorus`, `pre-chorus`, `verse`, and `outro`).
- **Word-Boundary Section TTS Plan & Duration Pacing (`src/lib/sectionUtils.ts`, `src/app/api/advance/tts-cue/route.ts`, `src/components/SectionBuilder.tsx`):**
  - Added `buildSectionTtsTextPlan()` (`src/lib/sectionUtils.ts`) capping at 240 chars strictly on bar or `Intl.Segmenter` word boundaries without slicing Thai words mid-cluster.
  - Extended `POST /api/advance/tts-cue` to accept bounded `targetDurationSec` (`2..30s`) and embed duration pacing hints into `singing-demo` `styleHint`; wired `SectionBuilder.tsx` to send `targetDurationSec`, apply `{ trimTrailing: true }`, tag `source: 'ai-tts'`, and display a clear boundary-trim notice in the confirmation popover.
- **Tests (`tests/sprintb.test.ts`):**
  - Added 7 deterministic test suites covering trailing+leading trim, dynamic `resolveVocalTakeBarSpan`, 108 BPM `computeVocalTakePlaybackPlan` (`<= 1.35x` time-fit, zero Pre-Chorus/Chorus bleed, `1.0x` mic invariant), `OFFLINE_IMMEDIATE_SCHEDULER` & Blob JSON download contracts, Thai `เ-อะ`/`-ือ`/`เ-าะ`/`-ุย` rhyme rules, slow Pop vs baseline invariants + `Chorus`-first priority polish, and `buildSectionTtsTextPlan` + mocked/simulated `tts-cue` `targetDurationSec`.

Tests:
- `npm test` (`npx tsx --test tests/*.test.ts`) → 177/177 passing (100%, 0 failed, 0 skipped; includes all 170 prior tests + 7 Sprint B test suites in `tests/sprintb.test.ts`)
- `npx eslint . --max-warnings=0` → 0 errors, 0 warnings across the entire repository
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript exited with code 0 (14/14 static/dynamic workers)

---

### [Phase 7E] Sprint C — Pitch-Preserving WSOLA Vocal Fit, Slow-Ballad Break Fix & Live QA Bugfixes
Status: PASS (Completed & Verified)
Timestamp: 2026-11-15T08:21:00+07:00

Changes implemented:
- **Pitch-Preserving WSOLA + Internal Pause Squeeze & MP3 Peak Headroom (`src/lib/audioTrim.ts`, `src/lib/audioEngine.ts`, `src/lib/mp3Exporter.ts`):**
  - Added isomorphic `compressChannelsInternalPauses()` (5ms silent-frame scanner, proportional pause trim with 8ms splice crossfade), stereo-coherent Hann 44ms `timeScaleChannelsPitchPreserving()` (WSOLA), `fitChannelsToDurationPitchPreserving()`, `prepareAiTtsAudioBufferForSpan()`, and `applyPeakHeadroom(..., 0.94)` (`-0.54 dBFS` safety ceiling before `float32ToInt16`).
  - Wired `prepareAiTtsAudioBufferForSpan()` into both `AudioEngine.getVocalBuffer()` and offline `renderSongToAudioBuffer()` keyed by `targetSpanSec`, keeping `ai-tts` vocal pitch at `1.0x` (`playbackRate === 1.0`, eliminating chipmunk shift and end-word chops) while leaving microphone recordings untouched.
- **Slow-Ballad Break Dead-Air Fix & Architect/TTS Tuning (`src/lib/songArchitect.ts`, `src/lib/aiPrompts.ts`, `src/app/api/advance/architect/route.ts`, `src/app/api/advance/tts-cue/route.ts`):**
  - Updated `sanitizeArchitectSongProject()` to convert slow-ballad (`bpm < 78`) `pre-chorus` and section-ending `break` bars into `'let-ring'` (eliminating the `1.47s` mid-song dead silence observed in `dee-nitipong` Pre-Chorus bar 3) while preserving `phase1b`, `phase2a`, and `phase7e` Chorus invariants.
  - Updated `POST /api/advance/architect` to polish up to `3` priority sections, strengthen overflow trimming hints in `buildRhymePolishPrompt()`, and evaluate post-polish `recheckFailed` with the same section-specific `getSyllableBudgetForBpm()` bounds.
  - Extracted pure `buildTtsCueStyleHint()` in `src/lib/aiPrompts.ts` enforcing brisk on-beat pacing (`ไม่อ้อยอิ่ง`) for compact durations (`<= 11s` or `>= 100 BPM`).
- **UI & State Hygiene (`src/lib/chordUtils.ts`, `src/components/TransportBar.tsx`, `src/hooks/useAudioEngine.ts`, `src/app/page.tsx`, `src/components/SectionBuilder.tsx`, `src/components/EasyModeStarterModal.tsx`):**
  - Added `getTransposedKeyName()` in `src/lib/chordUtils.ts` and replaced `TransportBar.tsx`'s hardcoded `baseIdx = 6` (`'C'`) with actual `song.baseKey` transposition.
  - Reset `loopRange` and active playback cleanly via `prevSongIdRef` in `useAudioEngine.ts` and inside `handleApplyEasySong` in `src/app/page.tsx`.
  - Fixed `sectionTtsConfirmId` popover UX in `SectionBuilder.tsx` (closes before opening Wallet, shows inline insufficient-credit badge + top-up shortcut, disables confirm when `< 2 Cr`) and added clean `id`/`name`/`htmlFor` attributes to form inputs in `EasyModeStarterModal.tsx` and `SectionBuilder.tsx`.
- **Tests (`tests/sprintc.test.ts`) & Option B Archive (`qa-results/sprintb-retest/`):**
  - Added 6 deterministic tests in `tests/sprintc.test.ts` covering `getTransposedKeyName`, UI loop/low-credit contracts, slow-ballad `break -> let-ring` sanitization, `buildTtsCueStyleHint` / simulated `tts-cue`, `compressChannelsInternalPauses` + WSOLA pitch preservation, and `applyPeakHeadroom`.
  - Verified WSOLA directly on the saved Option B Gemini TTS WAVs (`asanee-chotikul` `14.551s -> 8.756s` at `1.604x`, `13.183s -> 8.756s` at `1.436x`; `dee-nitipong` Verse `18.852s -> 13.906s` at `1.332x`) and listened directly to confirm authentic pitch and un-chopped endings (`"งมงาย"`, `"ไม่รักกัน"`).

Tests:
- `npm test` (`npx tsx --test tests/*.test.ts`) → 183/183 passing (100%, 0 failed, 0 skipped; includes all 177 prior tests + 6 Sprint C tests)
- `npx eslint . --max-warnings=0` → 0 errors, 0 warnings across the entire repository
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript exited with code 0

### [Phase 7F] Sprint D — Anti-Rush Singable Lyric Budgets, Phrase-to-Bar Beat-1 Vocal Alignment, MP3 Blob Download Fix & `gemini-4-hydrogen` Live QA
Status: PASS (Completed & Verified)
Timestamp: 2026-11-15T11:22:00+07:00

Changes implemented:
- **Anti-Rush Singable Lyric Budgets & Architect Enforcement (`src/lib/aiPrompts.ts`, `src/app/api/advance/architect/route.ts`):**
  - Tightened `MASTER_LYRIC_FEW_SHOT_BANK` (`thai-rock`, `dee-nitipong`, `asanee-chotikul`, `piercing-sting`) and section-level budgets in `getSyllableBudgetForBpm()` (`4–6` syllables/bar when `sectionType !== undefined` for slow pop / rock `>= 104 BPM`).
  - Added Singable Pacing & Anti-Rush phrasing rules to `buildEasyArchitectSystemPrompt()`, `buildEasyArchitectUserPrompt()`, and `buildRhymePolishPrompt()`, and replaced rushed cue wording in `buildTtsCueStyleHint()` with natural melodic pacing (`ไม่รัวคำ`, sustained vowel tails, clear breath gaps).
  - Passed `enforceSyllableBudget: true` into `validateThaiLyricCouplets()` in both `evaluatedSections` and `recheckFailed` inside `POST /api/advance/architect`.
- **Phrase-to-Bar Beat-1 Vocal Alignment (`src/lib/audioTrim.ts`, `src/lib/audioEngine.ts`, `src/lib/mp3Exporter.ts`):**
  - Added `alignAndFitVocalPhrasesToBars()` using dynamic programming over detected internal silence pauses (`-35/-30 dBFS`, coalescing `< 70ms` breath blips) to isolate 4 phrases and snap each phrase onto Beat 1 (`k * barSec + 0.02s`) of Bars 1–4 with `10ms`/`30ms` fades and trailing breath room, capping per-phrase WSOLA speedup at `1.24x`.
  - Passed `barCount` (`endGlobalBarIndex - startGlobalBarIndex + 1`) and `:b${barCount}` cache key into `prepareAiTtsAudioBufferForSpan()` in both `audioEngine.ts` and `mp3Exporter.ts`.
- **Chromium Large-Blob MP3 Download Fix (`src/lib/mp3Exporter.ts`):**
  - Deferred `URL.revokeObjectURL(url)` in `downloadSongMp3()` using `setTimeout(..., 1500)` after discovering headless Chromium returned `path: null` when revoking the object URL synchronously right after `a.click()`.
- **Tests (`tests/sprintc.test.ts`) & Live QA Archive (`qa-results/hydrogen-live-verify/`):**
  - Updated `Sprint C-3b` hint assertion (`/ไม่รัวคำ/`) and added `Sprint D-1` testing 4-phrase Beat-1 downbeat locking and `<= 6` syllable budgets.
  - Executed Live QA with `gemini-4-hydrogen` + `gemini-3.8-flash-tts` on `http://localhost:3000` (`NEXT_PUBLIC_BILLING_MODE=standalone`):
    - **Song 1 (`พอแล้วคนใจแข็ง` · `thai-rock-90s` · `asanee-chotikul` · Male `Fenrir` · 108 BPM · `Em`):** 8/8 total exports archived; `.mp3` (`925,988 bytes`, `38.58s`, `mean -17.5 dB`, `max -0.6 dB`, 0 mid-song silences).
    - **Song 2 (`รักคนไม่มีใจ` · `sad-ballad` · `dee-nitipong` · Female `Kore` · 68 BPM · `D`):** 0 `break` bars; `.mp3` (`1,258,893 bytes`, `52.45s`, `mean -17.2 dB`, `max -2.8 dB`, 0 mid-song silences — tail fadeout only `49.04s–52.45s`).
    - Direct audio listening confirmed natural, non-rushed Thai vocal delivery locked to Beat 1 across Verse and Chorus.
  - Observed live API calls in server logs (`2` `/api/advance/architect` calls [`21.4s`, `16.8s`], `5` `/api/advance/tts-cue` calls [`8.2s`, `6.4s`, `6.2s`, `8.1s`, `7.3s`], `58.802s` raw WAV synthesized).

Tests & Gates:
- `npm test` (`npx tsx --test tests/*.test.ts`) → `184/184` passing (0 failed, 0 skipped)
- `npx eslint . --max-warnings=0` → 0 errors, 0 warnings
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript exited with code 0

---

### [Phase 7G] Sprint E — Edge-Breath Stripping, Section Melodic TTS Cues, One-Click Full-Song AI Vocals & IndexedDB JSON Import (2026-11-15)
Implemented holistic product fixes targeting full-song AI vocal completeness, cleaner sung phrasing/mix integration, and browser storage durability without additional live Gemini API spend (`$0.00`):
- **DSP Edge-Breath Stripping (`src/lib/audioTrim.ts`)**:
  - Exported `stripDetachedEdgeBreaths(channels, sampleRate)` (`10ms` frames at `-32 dBFS`, removing detached leading/trailing islands `<= 0.24s` separated by `>= 0.025s` when `islandRms < mainPeakRms * 0.45 || islandPeak < 0.14`).
  - Wired `stripDetachedEdgeBreaths()` inside `alignAndFitVocalPhrasesToBars()`, tightened `trimChannelsSilence` (`thresholdDb: -32, safetyMarginMs: 15, trailingMarginMs: 40, minTrimMs: 10`), and smoothed fades (`fadeInSamples = 15ms`, `fadeOutSamples = 55ms`).
- **Section-Aware Melodic Contour & Mix Blend (`src/lib/aiPrompts.ts`, `src/app/api/advance/tts-cue/route.ts`, `src/lib/audioDspShared.ts`)**:
  - Extended `BuildTtsStyleHintInput` and `POST /api/advance/tts-cue` with optional `sectionType` and `baseKey`, adding section-specific melodic contour instructions (`Chorus`, `Pre-Chorus`, `Verse`, `Bridge`/`Outro`) plus anti-sigh cues while preserving `'ให้ขึ้นเสียงทันทีไม่ต้องเว้นเงียบ'` and `'ไม่รัวคำ'`.
  - Increased `VocalStudioTrackGainNode` `chorusWetGain.gain` from `0.04` to `0.10` for cohesive room blend while preserving `presenceEq.gain` at `2.5`.
- **One-Click Full-Song AI Vocal Guide & Smart Default Voice (`src/components/SectionBuilder.tsx`)**:
  - Added smart default voice selection (`defaultVoiceForSong`: `Fenrir` for rock/phuea-chiwit male, `Charon` for other male, `Kore` for female) with per-song `voiceOverride` and `#full-song-tts-voice` selector.
  - Extracted `requestSectionAiVocalTake()` (passing `sectionType` & `baseKey`) and added parallel `handleGenerateFullSongAiVocals()` (`Promise.allSettled` across `targetFullVocalSections`) behind top-bar CTA (`🎤 ร้องไกด์ AI ครบทุกท่อน` / `🎤 เติมเสียงร้อง AI ให้ครบทุกท่อน`).
- **5MB `localStorage` Quota Safety & Backup Download Stability (`src/lib/storage.ts`, `src/components/SongLibraryModal.tsx`, `tests/sprintc.test.ts`)**:
  - Updated `importSongsJSON()` to persist imported vocals via `persistSongVocalsToIdb()`, strip heavy vocal blobs before saving to `localStorage`, and handle `QuotaExceededError` (`code 22 / 1014`).
  - Deferred `URL.revokeObjectURL(url)` by `1500ms` in `handleExportBackup` (`SongLibraryModal.tsx`).
  - Added `Sprint E-1` and `Sprint E-2` unit tests in `tests/sprintc.test.ts`.

Tests & Gates:
- `npm test` (`npx tsx --test tests/*.test.ts`) → `186/186` passing (0 failed, 0 skipped)
- `npx eslint . --max-warnings=0` → 0 errors, 0 warnings
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript exited with code 0

---

### [Phase 8A] Multi-Model Tiering, `v1beta` Parity, Pro Argon Mode & Bulletproof Wallet Refund (2026-11-18)
Implemented Phase 8A per `PHASE_8_MASTER_PLAN.md` (`$0.00` offline/mock execution):
- **Gemini Client Model Tiering, `v1beta` Parity & Balanced JSON Recovery (`src/lib/geminiClient.ts`)**:
  - Exported `GEMINI_MODEL_FAST_LITE` (`gemini-3.1-flash-lite`), `GEMINI_MODEL_FLASH` (`gemini-3.8-flash`), and `GEMINI_MODEL_CARBON` (`gemini-4-carbon`) while preserving all existing model constants.
  - Added `fallbackModels?: string[]` loop in `callGeminiJson` (retrying on `rate-limit`, `network-error`, `http-error`, `incomplete-output`, and `parse-error`; skipping fallback on `auth-error` / `missing-key`), updated `resolveThinkingLevel` and `resolveMaxOutputTokens` per model serving caps, and upgraded `extractJsonFromText` with balanced `{...}`/`[...]` scanning.
  - Enforced `{ apiVersion: 'v1beta' }`, `runWithAbortTimeout`, and `:generateContent` fallbacks across `callGeminiJson`, `callGeminiTranscribeAudio` (`12_000` ms), `callGeminiTtsAudio` (`35_000` ms), and `callGeminiMusicAudio` (`50_000` ms).
- **Thai TTS Model Enforcement (`src/app/api/advance/tts-cue/route.ts`, `src/components/AdvanceModeModal.tsx`)**:
  - Enforced `GEMINI_MODEL_TTS` (`gemini-3.8-flash-tts`) for all Thai requests (`language === 'th'`, `/[ก-๙]/`, `vocalMode === 'singing-demo'`, or `modelTier === 'pro-tts'`), restricting `gemini-3.8-flash-lite-tts` fallback strictly to English guide mode.
  - Updated `handleSingLineWithAi` in `AdvanceModeModal.tsx` to pass `modelTier: 'pro-tts'`, `sectionType`, and `baseKey`.
- **Bulletproof Split-Wallet Refund & Outer `try/catch` Guards (`src/lib/serverWallet.ts`, `src/app/api/advance/*/route.ts`)**:
  - Tracked exact `deductedFromTrial` and `deductedFromPurchased` pockets in `tryServerBillingPreDeduct` (preserving legacy RPC-only `404`/`{}` test mocks) and refunded the exact pocket(s) in `refundServerBillingOnFailure`.
  - Wrapped all 7 AI routes (`architect`, `cohesive-polish`, `director`, `hum-to-song`, `lyrics`, `reference-track`, `tts-cue`) in outer `try/catch` guards with double-refund protection, empty-patch/insufficient-line auto-refunds in `director` and `lyrics`, and Table 0.2 model/token/timeout/fallback configurations.
- **`gemini-4-argon` Pro Mode (`src/app/api/advance/architect/route.ts`, `src/app/api/advance/cohesive-polish/route.ts`, `src/components/EasyModeStarterModal.tsx`, `src/components/CohesivePolishModal.tsx`)**:
  - Added 10-Credit Paid-Only (`requirePurchased: true`) Pro Argon Mode (`useProArgon` / `modelTier: 'pro-argon'`) with UI switches gated by `canUsePaidOnlyModel(walletBreakdown)` in both `EasyModeStarterModal.tsx` and `CohesivePolishModal.tsx`.
- **Tests (`tests/phase8a.test.ts`)**:
  - Added offline unit & integration test suite `tests/phase8a.test.ts`.

Tests & Gates:
- `npm test` (`npx tsx --test tests/*.test.ts`) → `219/219` passing (0 failed, 0 skipped)
- `npx eslint . --max-warnings=0` → 0 errors, 0 warnings
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript exited with code 0

---

### [Phase 8B] Prompt Engineering, 16-Step Hum-to-Song & Cohesive Polish Fixes (2026-11-19)
Implemented Phase 8B per `PHASE_8_MASTER_PLAN.md` (`$0.00` offline/mock execution):
- **16-Step Hum-to-Song & Schema Alignment (`src/lib/aiPrompts.ts`, `src/lib/songArchitect.ts`)**:
  - Updated `buildHumToSongSystemPrompt()` to use `0-15` steps for `4/4`, `0-11` steps for `3/4`/`6/8`, and `durationSteps (1-16)`.
  - Aligned `HUM_TO_SONG_RESPONSE_SCHEMA` `playStyle` enum to `['normal', 'let-ring', 'break']`, changed `producerNotes` to an array of strings, and removed nested `maxItems` constraints.
  - Updated `sanitizeArchitectSongProject()` to clamp `melodyNotes` step/duration bounds safely per time signature (`16` steps in `4/4`, `12` steps in `3/4` & `6/8`) while supporting `0..7`, `0..11`, and `0..15`.
- **Dynamic Syllable Budgets, Melody Prompt Alignment, Lyrics Enforcement & Director Enums (`src/lib/aiPrompts.ts`, `src/app/api/advance/lyrics/route.ts`)**:
  - Replaced hardcoded `"4-6 พยางค์"` syllable text in `buildEasyArchitectSystemPrompt()`, `buildEasyArchitectUserPrompt()`, and `buildCohesivePolishSystemPrompt()` with dynamic `getSyllableBudgetForBpm()` guidance while preserving the `74 BPM 4/4` `'5-8 พยางค์'` invariant.
  - Removed the contradictory `melodyNotes` requirement from `buildEasyArchitectUserPrompt()` so it aligns with `buildEasyArchitectSystemPrompt()`.
  - Updated `POST /api/advance/lyrics` to pass `minSyllables`, `maxSyllables`, and `enforceSyllableBudget: true` into `validateThaiLyricCouplets()`.
  - Updated `buildDirectorSystemPrompt()` enum descriptions to include all Phase 7C styles (`lukthung-bounce`, `rock-power`, `fuzz`, `lukthung-groove`, `rnb-syncopated`, `rnb-neo-chord`, `rock-organ-pad`, `lukthung-3cha`, `rnb-pocket`, `rock-drive`).
- **Duplicate Section Rhyme Polish Mapping (`src/app/api/advance/architect/route.ts`, `src/lib/aiPrompts.ts`)**:
  - Added `sectionId` to `buildRhymePolishPrompt()`, `RHYME_POLISH_RESPONSE_SCHEMA`, and `POST /api/advance/architect` polish payload, matching returned `polishedSections` by `sectionId` first with an ordered 1-to-1 fallback so duplicate-named sections (e.g., two `Chorus` sections) never overwrite each other.
- **Cohesive Polish Safety (`src/app/api/advance/cohesive-polish/route.ts`, `src/components/CohesivePolishModal.tsx`)**:
  - Guaranteed 100% immutability of `lockedSectionIds` (`instruments`, `intensity`, `bars`, `lyrics`, `chords`) across local 0-credit, fallback, and live AI paths—including after `applyGenreBandArrangement()`.
  - Preserved Slash Chords (`/Bass`), validated chord tokens against invalid outputs (`N.C.`), fixed unlocked-section index alignment when earlier sections are locked, and blocked empty `""` AI strings from erasing existing lyrics.
  - Stripped vocals (`stripVocalsFromSong`) and `snapshots` in `CohesivePolishModal.tsx` before submitting to `/api/advance/cohesive-polish` to prevent 413 payloads, restoring vocals and locked sections on apply.
- **Tests (`tests/phase8b.test.ts`)**:
  - Added 5 offline unit & integration tests covering Hum-to-Song 16-step/12-step grid & schemas, dynamic BPM/style syllable budgets, Director Phase 7C enums, `sectionId`-keyed Architect Rhyme Polish, and Cohesive Polish locked-section/slash-chord/payload-strip guarantees.

---

### [Phase 8C] Studio Save Engine (Auto + Manual Save `Ctrl+S` + Auto-Checkpoints) & IDB Audio Fix (2026-11-19)
Implemented Phase 8C per `PHASE_8_MASTER_PLAN.md` (`$0.00` offline/mock execution):
- **IDB Dirty-Check & Full Vocal Duplication (`src/lib/audioStorageIdb.ts`, `src/lib/storage.ts`)**:
  - Added `computeVocalDataSignature()` / `writtenSignatureByKey` cache and `hasUnpersistedVocals()` in `audioStorageIdb.ts` so unchanged vocal blobs are not re-written to IndexedDB on every lyric edit.
  - Added `SaveSongOptions` (`setActive`, `preserveUpdatedAt`, `skipIdbPersist`) and boolean status return on `saveSong()`, plus `duplicateSongWithVocals()` (hydrating and cloning both `bar.vocalAudio` and `vocalTakes` under new unique IDs into IDB) and `resolveSafeSharedSong()` (preventing `?song=` share links from overwriting colliding local song IDs), while seeding empty storage with unique `demo-song-...` IDs.
- **Studio Save Engine, Keyboard Shortcuts & Auto-Checkpoints (`src/app/page.tsx`, `src/components/TransportBar.tsx`, `src/components/SongLibraryModal.tsx`, `src/components/SectionBuilder.tsx`, `src/lib/i18n.ts`)**:
  - Replaced static `Auto-saved` text in `TransportBar.tsx` with live `LocalSaveState` (`dirty` / `saving` / `saved HH:mm` / `error`), added **Manual Save (`Ctrl/Cmd+S`)** and **Save Checkpoint (`Ctrl/Cmd+Shift+S`)** buttons & global shortcuts (working even inside text inputs), and added symmetrical `th`/`en` i18n keys.
  - Eliminated Phantom Auto-Save on load/IDB hydration via `isHydratingOrLoadingRef` & `lastPersistedSongKeyRef`, synced `updatedAt` in React state on real edits, flushed pending saves on `visibilitychange`, `pagehide`, and song switching, preserved Undo/Redo history on same-song metadata/snapshot updates, and created automatic checkpoints before Preset, Easy Mode, AI Lyrics, AI Director, and Cohesive Polish mutations.
  - Updated `SongLibraryModal.tsx` to use `duplicateSongWithVocals`, `generateUniqueId('demo-song')`, and preserve `vocalTakes` on active-song updates.
- **Tests (`tests/phase8c.test.ts`)**:
  - Added 5 offline tests covering `duplicateSongWithVocals`, IDB dirty-check write avoidance, `saveSong` `preserveUpdatedAt` & quota error return, `resolveSafeSharedSong` collision guard, and Studio Save Engine UI/hook contracts.

Tests & Gates:
- `npm test` (`npx tsx --test tests/*.test.ts`) → `229/229` passing (0 failed, 0 skipped; includes all 219 prior tests + 5 Phase 8B + 5 Phase 8C)
- `npx eslint . --max-warnings=0` → 0 errors, 0 warnings across the entire repository
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript exited with code 0
- Standalone Dev Server (`NEXT_PUBLIC_BILLING_MODE=standalone npm run dev`) → `http://localhost:3000/` returned `HTTP 200` (`602315` bytes), stopped cleanly with port `3000` free

---

### [Phase 8D] Resilient Cloud Sync, Tombstone Delete & Multi-Device Conflict Guard (2026-11-19)
Implemented Phase 8D per `PHASE_8_MASTER_PLAN.md` (`$0.00` offline/mock execution):
- **Tombstone Delete & Last-Song Recovery (`src/lib/storage.ts`, `src/lib/cloudSync.ts`, `src/components/SongLibraryModal.tsx`)**:
  - Added `DELETED_SONGS_KEY` / `DELETED_SONGS_TOMBSTONE_KEY`, `getDeletedSongTombstones()`, `recordDeletedSongTombstone()`, and `clearDeletedSongTombstone()`, clearing tombstones on `saveSong()` / `importSongsJSON()` and enabling deletion of even the last remaining song (generating a fresh unique-ID default demo).
  - Added `deleteSongFromCloud()`, updated `mergeSongLists(local, cloud, tombstones)` to block tombstoned cloud resurrection, and propagated `DELETE /rest/v1/songs` during `syncLibraryNow()`.
- **Non-Destructive Conflict Snapshots, 401 Single-Flight Refresh & Schema Sanitization (`src/lib/cloudSync.ts`)**:
  - Updated `mergeSongLists()` with `buildSongSyncDigest()` conflict detection that preserves the older diverging version as an `Auto-backup: Sync Conflict (...)` `SongSnapshot` rather than overwriting silently.
  - Added `fetchSupabaseWithRefresh()` (single-flight 401 refresh lock), `fetchSongsFromCloudDetailed()` (distinguishing HTTP/network error from empty cloud), `sanitizeCloudSongProject()` (repairing partial cloud JSON), omitted `created_at` overwrite in `syncSongToCloud()`, guarded Guest users from RLS sync calls, protected raw local storage edits without auto-seeding side effects in `persistMergedSongsToLocal()`, and persisted pulled cloud songs when a partial upload fails.
- **Auto-Sync, Honest Initial Status & Vocal Asset Notice (`src/app/page.tsx`, `src/components/AccountSyncModal.tsx`)**:
  - Wired honest initial `syncStatus` (`'synced'` only when `getLastSyncedAt()` exists + initial/sign-in sync), 3-second debounced `getCloudConfig().autoSyncEnabled` background sync, Sign Out timestamp clearing, an honest cross-device IndexedDB vocal storage note (recommending `.JSON` backup in Account modal), and Dark Mode semantic tokens on `AccountSyncModal.tsx`.
- **Tests (`tests/phase8d.test.ts`)**:
  - Added 5 offline tests covering Tombstone Delete & last-song recovery, Non-Destructive Conflict Snapshots, single-flight HTTP 401 refresh & HTTP 500 push-abort / Guest RLS guard, `sanitizeCloudSongProject`, and UI/Page Phase 8D contracts.

---

### [Phase 8E] User-Centric UX/UI Overhaul, Smart Undo/Redo, Chord Audition & Dark/Touch Polish (2026-11-19)
Implemented Phase 8E per `PHASE_8_MASTER_PLAN.md` (`$0.00` offline/mock execution):
- **Non-Destructive Presets & Coalesced Undo/Redo (`src/lib/sectionUtils.ts`, `src/app/page.tsx`)**:
  - Added `applyProgressionPresetToSection()` preserving existing bar IDs, lyrics, `melodyNotes`, `vocalAudio`, `playStyle`, and extra bars when applying chord progression presets.
  - Added `buildSongHistoryFingerprint()` (covering lightweight `vocalTakes` & `vocalAudio` signatures, `vocalLatencyOffsetMs`, `countInEnabled`, `metronomeEnabled`, guitar acoustics, `folder`, `statusTag`) and `pushCoalescedUndoHistory()` (`1200ms` window) so rapid BPM/lyric edits collapse into clean Undo steps without burning history capacity.
- **Audio Engine, Chord Audition, Metronome & Transport Polish (`src/types/song.ts`, `src/lib/audioEngine.ts`, `src/hooks/useAudioEngine.ts`, `src/components/ChordPickerModal.tsx`, `src/components/SoundCustomizerPanel.tsx`, `src/components/TransportBar.tsx`)**:
  - Exposed real `isCountIn` state, dedicated `clickSynth` (audible even when drums are muted) + `metronomeEnabled` playback clicks, and `previewChord(chordSymbol, song?)` via `getGuitarVoicing()` + `transposeChord()`.
  - Added `🔊 ฟังเสียงคอร์ด` audition button & click preview in `ChordPickerModal.tsx`; inline `▶`/`⏸`/`⏹` transport buttons + non-destructive per-track `S` (Solo) toggle across all 7 tracks in `SoundCustomizerPanel.tsx`; and Soundfont loading state (`"กำลังโหลดเสียงเครื่องดนตรี..."`), Metronome toggle, BPM `50–180` numeric input + `🥁 Tap Tempo`, `✨ Easy Mode` & `➕ เพลงใหม่` quick buttons, plus modal-aware `Escape` handling in `TransportBar.tsx`.
- **Progressive Bar Tools, Free Tools, Non-Mutating AI Previews, Dark Mode & Touch Fixes (`src/components/SectionBuilder.tsx`, `src/components/EasyModeStarterModal.tsx`, `src/components/AdvanceModeModal.tsx`, `src/components/MiniPianoRollModal.tsx`, `src/components/VocalRecorderModal.tsx`)**:
  - Added Progressive Bar Tool Disclosure (`focusedBarId`, `showAllBarTools`, `🛠️`), surfaced 0-Cr tools outside AI menu (`📖 พจนานุกรมสัมผัสไทย (ฟรี 0 Cr)` & `📋 วางเนื้อร้องแบ่งห้อง (ฟรี 0 Cr)`), clickable `Bar #` (`seekToBar`), mobile-readable section/bar labels, and non-mutating `🔊 ฟังจังหวะคำร้อง` preview in `SectionBuilder.tsx`.
  - Defaulted `EasyModeStarterModal.tsx` apply mode to `'new-song'` (with optional `'overwrite-current'` + Auto-Checkpoint).
  - Updated `AdvanceModeModal.tsx` so `handleSingLineWithAi()` stores preview audio without auto-mutating the song until clicking `💾 บันทึกเสียงนี้ลงห้อง`.
  - Made `MiniPianoRollModal.tsx` `-`/`+` note duration buttons touch-visible (`opacity-100 sm:opacity-0 sm:group-hover:opacity-100`) and converted `AdvanceModeModal.tsx`, `MiniPianoRollModal.tsx`, and `VocalRecorderModal.tsx` to semantic Dark Mode tokens (`bg-surface-1`, `bg-surface-2`, `text-ink-900`, `border-hairline`).
- **Tests (`tests/phase8e.test.ts`)**:
  - Added 5 offline unit & contract tests covering non-destructive `applyProgressionPresetToSection`, `buildSongHistoryFingerprint` + 1200ms coalesced Undo, `AudioEngine`/hook contracts, Transport/Mixer/ChordPicker controls, and SectionBuilder/Modal UX & Dark Mode tokens.

Tests & Gates:
- `npm test` (`npx tsx --test tests/*.test.ts`) → `239/239` passing (0 failed, 0 skipped; includes all 186 baseline tests + prior phases + 5 Phase 8A + 5 Phase 8B + 5 Phase 8C + 5 Phase 8D + 5 Phase 8E)
- `npx eslint . --max-warnings=0` → 0 errors, 0 warnings across the entire repository
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript exited with code 0

---

### [Phase 9A–9E] Singable Phrasing, Breathable Melody Engine & Story Blueprint (`PHASE_9_MASTER_PLAN`, 2026-11-19)
Implemented Phases 9A–9E per `PHASE_9_MASTER_PLAN.md` (`$0.00` offline/mocked verification — zero live Gemini API calls):
- **[Phase 9A] Singable Syllable Physics, 22-Style Few-Shot Overhaul & Accurate Thai Syllabification (`src/types/song.ts`, `src/lib/aiPrompts.ts`, `src/lib/songArchitect.ts`, `src/lib/sectionUtils.ts`, `src/lib/thaiRhymeHelper.ts`)**:
  - Added `LyricDensityMode` (`'airy' | 'balanced' | 'dense'`), `VocalPhrasingProfile`, `StoryAnchorMode`, `StoryBlueprintInput`, `StoryBlueprintSummary`, and wired `lyricDensity`/`storyBlueprint` onto `SongProject`, `SongProject.easyConfig`, and `EasyArchitectInput`.
  - Overhauled `getSyllableBudgetForBpm()` with `computeBarDurationSec()` across 6 vocal phrasing groups, 3 tempo tiers (`<=76`, `77–102`, `>102` BPM), `3/4` & `6/8` modifiers, `chordsPerBar === 2` protection, and physics ceiling guarantees (`restSteps >= 2`, `max / barSec <= maxSyllablesPerSec`), updating all 7 prompt builders with Per-Section Budget Breakdowns and dynamic `buildRhymePolishPrompt(..., options)`.
  - Rewrote `MASTER_LYRIC_FEW_SHOT_BANK` (7 genres, 22 songwriters, 6 emotional resolutions, 4 dialects) and all `buildStyledSimulatedSongLyrics()` / `resolveSimulatedOutroLines()` branches with concise singable budgets (`4–6` syl Groups 1–5, `6–8` syl `joey-boy`/`the-toys`/`thai-rnb`, `4–5` Chorus Bar 1 & Outro) + double-space `"  "` mid-bar breath cues passing `validateThaiLyricCouplets`.
  - Fixed `segmentThaiWordToSyllables()` & `countThaiWordSyllables()` edge cases (`ธรรมดา`=3, `ธรรมชาติ`=3, `สบายใจ`=3, `ความทรงจำ`=3, `เพชร`=1, `ถนน`=2, `กระจก`=2, `แสงไฟนีออนส่องสะท้อนกระจกห้องเดิมยามค่ำคืน`=14) and added `allowCoupletOrAlternateRhyme` & `sectionType` support to `validateThaiLyricCouplets()`.
- **[Phase 9B] Story Brief, Emotional Arc & Anchor Lines (`src/lib/aiPrompts.ts`, `src/components/EasyModeStarterModal.tsx`, `src/components/AdvanceModeModal.tsx`, `src/components/ContinueStoryModal.tsx`, `src/app/page.tsx`)**:
  - Added `storyBlueprint` (`coreTheme`, `emotionalArcSummary`, `sectionBeats`) BEFORE `sections` in `ARCHITECT_RESPONSE_SCHEMA` (without nested bound keys) so Gemini distills and distributes scenes across sections in the existing call (0 extra credits), plus exported `STORY_ARC_PRESETS` and `buildStoryBlueprintPromptBlock()` covering Scene Distribution, Exact/Flexible Anchors, and Smart Anchor Splitting.
  - Upgraded Easy Mode Step 5 (`rows={4}`, `maxLength={1200}` + char counter), added non-blocking Smart Structure Hint (`full-hit-7` suggestion), collapsible `StoryBlueprint` panel (6 Arc Presets, opening/hook/closing anchors, Exact/Flexible toggle), Stage 2 `storyBlueprint` preview, and expanded `AdvanceModeModal.tsx` & `ContinueStoryModal.tsx` with longer context + per-section anchor inputs.
- **[Phase 9C] Breathable Melody Engine & Time-Signature / Key / Register Fixes (`src/lib/melodyUtils.ts`, `src/lib/songArchitect.ts`, `cohesive-polish/route.ts`, `CohesivePolishModal.tsx`, `SectionBuilder.tsx`, `MiniPianoRollModal.tsx`)**:
  - Exported `splitThaiLyricPhraseGroups()` (splitting natural whitespace/`  ` groups and `Intl.Segmenter` word boundaries rather than mid-word `Math.ceil(n/2)`), implemented self-contained `resolveMelodyBreathRestSteps()` (avoiding circular runtime import with `aiPrompts.ts`), enforced `singingCeiling = totalSteps - restSteps`, prevented Group 1 final syllable from sustaining across mid-bar breath gaps, and kept `outro` resolving on `rootPc` with `durationSteps >= 3` inside `singingCeiling`.
  - Exported `GuideMelodyContext`, `getVocalRegisterShift()` (`female +3`, `male -4`, `neutral 0`), and `getStepsGridForTimeSignature()`, fixed `3/4` & `6/8` step-11 pileup by re-synthesizing overflowing bars into `0..11`, and wired full musical context across all 5 callers.
- **[Phase 9D] API Pipeline Fixes & Natural AI Vocal Breathing (`architect/route.ts`, `lyrics/route.ts`, `hum-to-song/route.ts`, `src/lib/audioTrim.ts`, `src/lib/sectionUtils.ts`, `src/components/SectionBuilder.tsx`)**:
  - `architect/route.ts`: Clamped AI BPM within `±8` of `recommendedBpm`, expanded polish cap to `Math.min(5, evaluatedSections.length)`, passed per-section budgets & protected `exact` anchors, **regenerated `bar.melodyNotes` whenever polish updates `bar.lyrics`**, and returned `storyBlueprint`.
  - `lyrics/route.ts`: Added 1-pass `GEMINI_MODEL_LITE` auto-trim on `outOfBudgetBars` protecting `sectionAnchorPhrase`, recomputed phonetics/rhyme validation, re-synced `3/4`/`6/8` overflowing deep notes, and preserved `4/4` deep note clamping.
  - `hum-to-song/route.ts`, `audioTrim.ts`, `sectionUtils.ts`: Added singable budgets to Hum prompts, expanded `breathReserveSec` (`Math.min(0.45, Math.max(0.22, barSec * 0.16))`), relaxed `keepPauseMs` (`120`) & WSOLA speedup ceiling (`1.18`), and updated `buildSectionTtsTextPlan()` default separator to `'\n'`.
- **[Phase 9E] Pacing UI Controls, Live HUD, Teleprompter Breath Visuals & Full Tests (`src/lib/i18n.ts`, `EasyModeStarterModal.tsx`, `AdvanceModeModal.tsx`, `SectionBuilder.tsx`, `KaraokeTeleprompter.tsx`, `tests/*.test.ts`)**:
  - Added symmetrical bilingual keys in `i18n.ts`, 3-level `LyricDensityMode` selector in `EasyModeStarterModal` & `AdvanceModeModal`, Live `X.X พยางค์/วิ` pacing badge + fast-rate warning in `SectionBuilder`, and mid-bar breath dot (`·`) rendering in `KaraokeTeleprompter`.
  - Updated legacy assertions in `phase5a`, `phase5b`, `phase6_thai_lyrics_ux`, `phase7a`, `phase7e`, `phase8b`, `sprintb`, and `sprintc` to align with the new singable budgets & `\n` TTS separator, and added 6 offline/mocked Phase 9 verification suites in `tests/phase9_singable_phrasing.test.ts`.

Tests & Gates:
- `npx tsx --test tests/*.test.ts` → `245/245` passing (0 failed, 0 skipped; all baseline + Phase 1–8 tests + 6 new Phase 9 suites)
- `npm run lint` / `npx eslint . --max-warnings=0` → 0 errors, 0 warnings across the entire repository
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript exited with code 0 (20/20 static/dynamic routes compiled cleanly)


---

### [UI QA] Navbar Overlap, Modal Tab Overflow, Piano Roll Sticky Z-Index & Stale Auth Sync (`cc55464`, 2026-11-19)
Implemented UI polish and auth-sync fixes (`tests/ui_polish_vercel_qa.test.ts`):
- `src/components/TransportBar.tsx` & `src/app/globals.css`: Resolved navbar overlap and strengthened sticky glass opacity.
- `src/components/AdvanceModeModal.tsx`: Fixed responsive 5-column tab grid (no horizontal overflow) and Escape/dialog handling.
- `src/components/MiniPianoRollModal.tsx`: Unified sticky headers, 16-step minimum grid width, non-clipping pills, and Escape dismissal.
- `src/app/page.tsx`: Checked latest refreshed user state after `refreshAuthSession()` before invoking `handleSyncNow()`.

---

### [Phase 10] 4-Tier Constraint Harmony, AABB/ABAB & Mai-Yamok Parity, and 3.8-Flash Non-Destructive Polish Gate (`e72fa90`, 2026-11-19)
Implemented Phase 10 quality & constraint harmony upgrades (`tests/phase10_constraint_harmony.test.ts`):
- `src/lib/thaiRhymeHelper.ts` & `src/lib/aiPrompts.ts`: Synchronized mai-yamok (`ๆ`) segmentation parity with syllable counting, purged legacy clichés/double-words from `MASTER_LYRIC_FEW_SHOT_BANK`, synchronized Chorus Bar 1 budgets & 4-Tier Priority Ladder across prompts and validator, and added 88 BPM AABB/ABAB scoring + mid-line weak-word filtering + repeated-content-word checks with anchor exemption.
- `src/app/api/advance/architect/route.ts`, `src/app/api/advance/lyrics/route.ts`, `src/lib/songArchitect.ts`, `src/components/EasyModeStarterModal.tsx`, & `src/components/SectionBuilder.tsx`: Added Non-Destructive Polish Gate (`gemini-3.8-flash` Option B polish) protecting primary model outputs, plus frontend HUD parity and token breakdown UI.

---

### [Post-Phase 10] Easy Mode 8 Bars/Section & Studio Loudness Gain Staging (`464dc99`, 2026-11-21)
Implemented user-feedback upgrades (`tests/user_feedback_8bars_loudness.test.ts`):
- `src/types/song.ts`, `src/lib/aiPrompts.ts`, `src/lib/songArchitect.ts`, `src/app/api/advance/architect/route.ts`, & `src/components/EasyModeStarterModal.tsx`: Added 2/4/6/8 bar cycling per section in Easy Mode (`customStructure` up to 8 bars/section) across schemas, prompts, sanitizer, and simulated song builder.
- `src/lib/audioDspShared.ts`, `src/lib/audioEngine.ts`, `src/lib/mp3Exporter.ts`, `src/lib/barPlanner.ts`, `src/hooks/useAudioEngine.ts`, & `src/components/SoundCustomizerPanel.tsx`: Calibrated `mixerVolumeToGain` / `masterVolumeToGain`, built `createMasterBusChain` (glue compressor → makeup gain → limiter → destination + parallel reverb), applied `TRACK_GAIN_TRIM`, and softened `secVol` curve to prevent double attenuation with full live/offline parity.

---

### [Wrap-up] Pre-Shelving Hygiene (2026-11-25)
Finalized repository hygiene before pausing active work on the project:
- `tests/easyFeatures.test.ts`: Isolated `GEMINI_API_KEY` and `NEXT_PUBLIC_BILLING_MODE` in the simulated Cohesive Polish test (`try`/`finally` restore) so `npm test` runs 100% offline with zero live API calls.
- `.gitignore` & Git index: Added `/tutorials/*.mp4` ignore rule and removed 24 deleted legacy `.mp4` paths from Git index (`git rm --cached`) while preserving all 21 local `.mp4` videos on disk and keeping `tutorials/CHAPTERS_YOUTUBE.txt` tracked.
- `README.md` & `PROGRESS_LOG.md`: Replaced starter template with a full Thai/English handover README (features, stack, scripts, env/Supabase setup, repo map, known limitations) and closed out Phase 8D–Post-10 records.

Tests & Gates:
- `npm test` (`npx tsx --test tests/*.test.ts`) → `266/266` passing (`0` failed, `0` skipped, `~2.9s` offline)
- `npm run lint` (`eslint`) → `0` errors, `0` warnings
- `npx tsc --noEmit` → `0` errors
