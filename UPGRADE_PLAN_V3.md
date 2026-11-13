# UPGRADE_PLAN_V3 — Master Upgrade Specification (Phase 4A–4E)

> **Purpose:** Autonomous execution specification for Demo Maker Easy v3.0. Each phase below is self-contained with exact target files, interfaces, DSP/UI behavior, and verification rules so that execution agents (e.g., `Gemini 4 Hydrogen (Extra)` or `Gemini 3.8 Flash`) can read this file in a fresh chat and execute any phase cleanly.

---

## 📊 Phase Status Tracker

| Phase | Status | Title | Scope Summary |
|---|---|---|---|
| **Phase 4A** | ✅ DONE | UI Decluttering & 3-Tab Workflow | Split into `Songwriter` / `Arranger` / `Stage` (`karaoke`) tabs, add Zen Focus Mode, collapse per-section instruments in Songwriter mode, add syllable counter, and add Duplicate Section button. |
| **Phase 4B** | ✅ DONE | Studio-Grade Musical Realism & Vocal DSP | Slash Chords (`C/G`, `D/F#`), Zone Strumming, Auto-Sus/Add9 embellishments, Walking Bass approach notes, Outro Ritardando & `VocalStudioTrackGainNode` DSP chain. |
| **Phase 4C** | ⏳ TODO | IndexedDB Audio Storage & Library Organization | IndexedDB vocal storage (`audioStorageIdb.ts`), Folders/Albums, Status Tags (`draft` / `arranged` / `vocal-recorded` / `mastered`), Search & Song Version Snapshots. |
| **Phase 4D** | ⏳ TODO | User Auth & Multi-Device Cloud Sync | Supabase Auth / Guest fallback, `updatedAt`-based pull/push cloud merge, `AccountSyncModal.tsx` & header sync status badge. |
| **Phase 4E** | ⏳ TODO | Advance Mode, Credit Wallet & Thai Lyric AI | `creditManager.ts` (30 starter credits, transactions, packages), offline `thaiRhymeHelper.ts`, `/api/advance/lyrics` endpoint & `AdvanceModeModal.tsx`. |

---

## 🛡️ Mandatory Verification & Deployment Protocol (Required for Every Phase)

Before marking any phase `✅ DONE`:
1. **Unit Tests:** Preserve all existing tests in `tests/*.test.ts` and add new tests covering the newly implemented logic.
2. **Test Execution:** Run `npx tsx --test tests/*.test.ts` — **100% of tests must pass**.
3. **Production Build:** Run `npm run build` — **Next.js 16 Turbopack build and TypeScript checks must exit with code `0`**.
4. **Documentation Sync:**
   - Update the Phase Status Tracker table in this file (`UPGRADE_PLAN_V3.md`) from `⏳ TODO` to `✅ DONE`.
   - Append a structured entry in `PROGRESS_LOG.md` detailing changed files and test/build verification outputs.
5. **Git & Vercel Deploy (Windows PowerShell):**
   - Run with `;` separator (PowerShell compatible):
     ```powershell
     git add -A; git commit -m "feat(phase-4X): <concise description>"; git push origin main
     ```

---

## 📦 Phase 4A: UI Decluttering, 3-Tab Workflow & Zen Focus Mode

### Goal
Solve screen clutter by separating **Songwriting** (clean chord/lyric sheet) from **Arranging** (instrument mixer, playing styles, piano roll) and **Stage** (Karaoke teleprompter), plus adding a **Zen Mode** toggle for distraction-free iPad use.

### Target Files
- `src/types/song.ts`
- `src/app/page.tsx`
- `src/components/TransportBar.tsx`
- `src/components/SectionBuilder.tsx`
- `src/lib/i18n.ts`

### Detailed Engineering Specs
1. **3-Tab Mode Architecture (`src/types/song.ts`, `src/app/page.tsx`):**
   - Export type `AppViewMode = 'songwriter' | 'arranger' | 'karaoke'`.
   - Change `activeMode` state in `src/app/page.tsx` from `'edit' | 'karaoke'` to `AppViewMode`, defaulting to `'songwriter'`.
   - Add `isZenMode: boolean` state (default `false`) in `src/app/page.tsx` and pass `isZenMode` and `onToggleZenMode` to `TransportBar`.
   - Pass `viewMode={activeMode === 'arranger' ? 'arranger' : 'songwriter'}` to `SectionBuilder` when `activeMode !== 'karaoke'`.
2. **TransportBar Enhancements (`src/components/TransportBar.tsx`):**
   - Update props: `activeMode: AppViewMode`, `onSwitchMode: (mode: AppViewMode) => void`, `isZenMode?: boolean`, `onToggleZenMode?: () => void`.
   - Render 3 workspace tabs on the right side:
     - `✍️ แต่งเพลง` / `Songwriter` (`'songwriter'`)
     - `🎛️ เรียบเรียง` / `Arranger` (`'arranger'`)
     - `🎤 คาราโอเกะ` / `Stage` (`'karaoke'`)
   - Add a compact `✨ Zen` toggle button; when `isZenMode` is `true`, hide/collapse Row 2 (Musical Parameters Bar) so the viewport opens up on iPad/mobile.
3. **SectionBuilder Progressive Disclosure (`src/components/SectionBuilder.tsx`):**
   - Add prop `viewMode?: 'songwriter' | 'arranger'` (default `'songwriter'`).
   - Add a `handleDuplicateSection(sectionId: string)` handler that deep-clones the section (generating fresh unique `section.id` and `bar.id` values and suffixing `" (Copy)"`) and inserts it right after the source section.
   - **When `viewMode === 'songwriter'`:**
     - Collapse the 5-instrument grid into a sleek single-line summary pill row (e.g., `🎼 Active: 🎸 Rhythm • 🎸 Lead • 🎻 Bass • 🎹 Piano • 🥁 Drums` + quick toggle/link button or expand toggle) so cards remain uncluttered.
     - Simplify each Bar Card to emphasize large Chord buttons, the Lyrics input with a live Thai/English **syllable count badge** on the right (counting Thai vowel clusters / English vowel groups), and the quick Vocal Mic button.
     - Move secondary bar controls (`PlayStyle`, `ChordsPerBar`, `Melody Piano Roll`, `Delete`) behind a small compact popover/expand toggle or show them cleanly in `arranger` mode.
   - **When `viewMode === 'arranger'`:**
     - Render full per-section instrument toggles and style/drive selectors, `PlayStyle` (`normal` / `let-ring` / `break`), `chordsPerBar` (`1` / `2`), `🎹 Melody Piano Roll` button, and a `📋 คัดลอกท่อน / Duplicate` button on every section header.
4. **Bilingual Strings (`src/lib/i18n.ts`):**
   - Add matching `th` and `en` keys for `modeArranger`, `zenMode`, `duplicateSection`, `syllablesCount`, etc., keeping both dictionaries symmetrical (verified by existing i18n symmetry unit test).

---

## 🎸 Phase 4B: Studio-Grade Musical Realism & Vocal Studio DSP Chain

### Goal
Upgrade rhythmic feel, harmonic motion, and recorded vocal integration so playback sounds like real studio musicians playing together in the same room.

### Target Files
- `src/lib/guitarVoicings.ts`
- `src/components/ChordPickerModal.tsx`
- `src/lib/barPlanner.ts`
- `src/lib/audioEngine.ts`
- `src/lib/mp3Exporter.ts`
- `tests/phase4b.test.ts` (new unit tests)

### Detailed Engineering Specs
1. **Slash Chords Support (`src/lib/guitarVoicings.ts`, `src/components/ChordPickerModal.tsx`):**
   - Update `parseChordSymbol(symbol: string)` in `guitarVoicings.ts` to detect `/` (e.g., `C/G`, `D/F#`, `G/B`, `Am/G`, `C/E`, `F/A`), storing `bassPc?: number` in `ParsedChord`.
   - Update `getGuitarVoicing(chordSymbol, capoFret)`: when `bassPc` is present, ensure the lowest sounded string (`strings[0]`) produces the exact requested slash bass note (in guitar bass register E2–D#3, MIDI 40–51) and reorder/filter voicing strings cleanly above it.
   - In `ChordPickerModal.tsx`, add a quick **Slash Bass (`/Bass`)** selector bar allowing one-tap attachment of `/E`, `/F#`, `/G`, `/A`, `/B`, `/C`, `/D` (or Clear Bass) onto any chosen chord.
2. **Realistic Musical Physics (`src/lib/barPlanner.ts`):**
   - **Zone Strumming in `emitStrum`:**
     - Downstrokes (`dir === 'D'`): strum from lowest bass string to highest treble string (`voicing.strings`).
     - Upstrokes (`dir === 'U'`): brush **only the top 3 treble strings** (`voicing.strings.slice(-3).reverse()`) so upstrokes sound crisp without muddying low bass strings.
   - **Auto-Embellishment (`sus4` / `add9` color):**
     - On bars where `chordsPerBar === 1` and `style` is `'campfire-strum'` or `'soft-strum'` (and `!ctx.isLetRing` and `!ctx.isBreak`), on the late upstroke/final eighth beat (e.g., step 10 or 14 in 4/4) subtly embellish one mid/treble string by +1 or +2 semitones when appropriate (`sus4` / `add9` inflection) to create organic finger movement.
   - **Walking Bass Approach Notes in `planBass`:**
     - Check `ctx.next`: if the next bar changes chord (`nextChordRootPc !== seg.parsed.pc`), play a short eighth-note approach note (`root ± 1` or `root + 2` semitones leading into next bar's root) at the end of the bar (e.g., final 2 steps). When `bassPc` is set via a Slash Chord, anchor `planBass` to `bassRoot(parsed.bassPc)`.
   - **Outro Ritardando & Final Arpeggiated Strum:**
     - On `isSongEnd` in `planRhythm`, widen strum gaps slightly (`38–52ms` slow arpeggiated sweep across strings) and extend sustained ring-out duration (`tail >= 2.6s`).
3. **Vocal Studio Chain (`src/lib/audioEngine.ts`, `src/lib/mp3Exporter.ts`):**
   - Add `VocalStudioTrackGainNode extends TrackGainNode` in `audioEngine.ts`:
     - Chain: `input -> hpf (highpass @ 95Hz) -> presenceEq (peaking @ 3800Hz, +2.5dB, Q: 1.1) -> vocalComp (DynamicsCompressorNode: threshold -18dB, ratio 4:1, attack 0.008s, release 0.12s) -> masterGain -> fadeGain -> panner -> destination`.
   - Use `VocalStudioTrackGainNode` for `this.vocalGain` connected to `this.masterBus` so recorded iPad vocals cut through cleanly and share the live 3D Room Reverb & Master Compressor.
   - Mirror the 95Hz HPF + 3.8kHz +2.5dB presence EQ on `trackGains['vocal']` inside `src/lib/mp3Exporter.ts`.
4. **Tests (`tests/phase4b.test.ts`):**
   - Verify Slash Chord parsing and lowest bass string MIDI pitch for `D/F#`, `C/G`, `G/B`.
   - Verify Upstroke Zone Strumming only emits ≤ 3 treble notes per upstroke.
   - Verify Walking Bass approach note appears when transitioning to a different chord.

---

## 🗂️ Phase 4C: IndexedDB Audio Storage, Folders, Status Tags & Version Snapshots

### Goal
Remove the browser 5MB `localStorage` bottleneck for vocal scratchpad recordings and organize large song catalogs cleanly with Folders, Status Tags, Search, and Version Snapshots.

### Target Files
- `src/lib/audioStorageIdb.ts` (new)
- `src/types/song.ts`
- `src/lib/storage.ts`
- `src/components/SongLibraryModal.tsx`
- `tests/phase4c.test.ts` (new unit tests)

### Detailed Engineering Specs
1. **IndexedDB Audio Store (`src/lib/audioStorageIdb.ts`):**
   - Create database `demo_maker_audio_db` (version 1) with object store `vocals`.
   - Export async helpers:
     - `saveVocalBlob(key: string, dataUrl: string): Promise<void>` (key format: `${songId}_${barId}`)
     - `getVocalBlob(key: string): Promise<string | null>`
     - `deleteVocalBlob(key: string): Promise<void>`
     - `clearSongVocals(songId: string): Promise<void>`
   - Include safe in-memory `Map<string, string>` fallback when `typeof indexedDB === 'undefined'` (SSR / Node test runner safe).
2. **Schema Extensions (`src/types/song.ts`):**
   - Export `SongStatusTag = 'draft' | 'arranged' | 'vocal-recorded' | 'mastered'`.
   - Export `SongSnapshot`:
     ```ts
     export interface SongSnapshot {
       id: string;
       name: string;
       createdAt: string;
       songData: string; // JSON snapshot excluding snapshots/vocalAudio to stay lightweight
     }
     ```
   - Add optional fields to `SongProject`: `folder?: string`, `statusTag?: SongStatusTag`, `snapshots?: SongSnapshot[]`.
3. **Song Library Organization (`src/components/SongLibraryModal.tsx`):**
   - Add a Search bar filtering songs by `title` OR matching any `bar.lyrics`.
   - Add Folder filter pills (`All`, custom folders created/assigned by user, editable folder tag on songs).
   - Add Status Tag selector pill (`📝 Draft`, `🎸 Arranged`, `🎤 Vocal`, `⭐ Mastered`) on each song card.
   - Add `📸 Save Snapshot` button for the active song and a collapsible list of saved snapshots with 1-click **Restore Version** and **Delete Snapshot**.

---

## 👤 Phase 4D: User Login & Multi-Device Cloud Sync

### Goal
Allow users to sign in once and seamlessly synchronize their songs, folders, and snapshots across iPad, iPhone, and desktop browsers while continuing to work 100% offline-first as a Guest.

### Target Files
- `src/lib/cloudSync.ts`
- `src/components/AccountSyncModal.tsx` (new)
- `src/components/TransportBar.tsx`
- `src/app/page.tsx`
- `tests/phase4d.test.ts` (new unit tests)

### Detailed Engineering Specs
1. **Auth & Timestamp Merge (`src/lib/cloudSync.ts`):**
   - Define `CloudUser`: `{ id: string; email?: string; displayName: string; mode: 'guest' | 'authenticated' }`.
   - Add auth helpers: `getCurrentUser()`, `signInWithEmailOtp(email)` / `signOutUser()` wired cleanly to Supabase Auth REST endpoints when `isCloudConfigured()` is true, with safe Guest local profile fallback when env vars are missing or offline.
   - Implement `mergeSongLists(localSongs: SongProject[], cloudSongs: SongProject[]): SongProject[]` choosing the newest `updatedAt` record per `song.id` and preserving unique songs from both sides.
   - Track sync states: `'local-only' | 'synced' | 'syncing' | 'offline' | 'error'`.
2. **Account Sync UI (`src/components/AccountSyncModal.tsx`, `src/components/TransportBar.tsx`, `src/app/page.tsx`):**
   - Build `AccountSyncModal.tsx` with Login / Magic Link email form, current user profile badge, live cloud status indicator, 1-click `☁️ Sync Now` button (running pull + merge + push), and sign-out action.
   - Add a compact Account/Sync status button in `TransportBar.tsx` opening `AccountSyncModal`.

---

## ⚡ Phase 4E: Advance Mode, Credit Wallet & Thai Rhyme / AI Lyric Co-Pilot

### Goal
Introduce a dedicated, cost-protected **Advance Mode** for paid/external AI API features using a **Credit Wallet** monetization model, alongside a zero-cost built-in Thai rhyme & syllable helper.

### Target Files
- `src/lib/thaiRhymeHelper.ts` (new)
- `src/lib/creditManager.ts` (new)
- `src/app/api/advance/lyrics/route.ts` (new)
- `src/components/AdvanceModeModal.tsx` (new)
- `src/components/TransportBar.tsx`
- `src/components/SectionBuilder.tsx`
- `tests/phase4e.test.ts` (new unit tests)

### Detailed Engineering Specs
1. **Offline Thai Rhyme & Syllable Engine (`src/lib/thaiRhymeHelper.ts`):**
   - `countThaiEnglishSyllables(text: string): number`: Accurate syllable estimator for Thai words and English words inside a bar's lyric line.
   - `findThaiRhymes(word: string): { groupLabel: string; suggestions: string[] }`: Built-in local dictionary grouping Thai words by vowel sound + final consonant class (e.g., `-า / มาตรา ก กา`, `-าย`, `-าว`, `-อน`, `-ิน`, `-ิง`, `-ัก`, `-ัน`, `-ึง`, `-ัว`, `-อ`, `-เออ`, `-ใจ/-ไ-`) at **0 credits**.
2. **Credit Wallet Manager (`src/lib/creditManager.ts`):**
   - Types:
     ```ts
     export interface CreditPackage {
       id: string;
       name: string;
       credits: number;
       priceThb: number;
     }
     export interface CreditTransaction {
       id: string;
       type: 'starter' | 'topup' | 'spend';
       amount: number;
       description: string;
       createdAt: string;
     }
     ```
   - `DEFAULT_STARTER_CREDITS = 30`.
   - Persist wallet safely in `localStorage` (with SSR/Node memory fallback).
   - Export `getCreditBalance()`, `getCreditTransactions()`, `canAfford(cost)`, `deductCredits(cost, description)`, `topUpCredits(pkg)`.
3. **Server-Side AI Endpoint (`src/app/api/advance/lyrics/route.ts`):**
   - Accept `POST` JSON: `{ mood: string; topic: string; chordProgression: string[]; existingLyrics?: string; sectionType: string }`.
   - Validate payload cleanly; if `process.env.GEMINI_API_KEY` is present on the server, call Gemini REST API (`gemini-2.5-flash`) with a songwriting prompt requesting Thai/bilingual poetic lyrics fitting the chords.
   - If `GEMINI_API_KEY` is not set in `.env`, return a well-structured fallback response (`isSimulated: true`) demonstrating the feature safely without crashing or exposing any secret keys to the client.
4. **Advance Mode UI (`src/components/AdvanceModeModal.tsx`, `src/components/TransportBar.tsx`, `src/components/SectionBuilder.tsx`):**
   - Display Credit Wallet chip (`⚡ 30 Credits`) in `TransportBar`.
   - Inside `AdvanceModeModal.tsx`:
     - Show current credit balance, transaction history, and Top-Up packages (Starter `100 Credits / 99฿`, Pro `300 Credits / 249฿`, Studio `700 Credits / 499฿`) with a PromptPay QR preview dialog.
     - Show **AI Lyric & Rhyme Co-Pilot** workspace with **Cost Preview Confirmation** (e.g., `"ใช้ 1 เครดิต / Uses 1 Credit"`) before calling `/api/advance/lyrics`.
     - Include a free **Thai Rhyme Lookup Tab (0 Credits)** powered by `thaiRhymeHelper.ts`.
   - Add a subtle `✨` rhyme/AI trigger on Section headers or lyric rows (respecting Songwriter mode cleanliness).
