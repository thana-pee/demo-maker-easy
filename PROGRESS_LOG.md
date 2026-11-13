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
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript checks exited with code 0 (4/4 static pages prerendered)

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
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript checks exited with code 0 (4/4 static pages prerendered)

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
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript checks exited with code 0 (4/4 static pages prerendered)

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
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript checks exited with code 0 (4/4 static pages prerendered)

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
- `npm run build` → Next.js 16.4.6 (Turbopack) + TypeScript checks exited with code 0 (`/api/advance/lyrics` + `/` rendered cleanly)
