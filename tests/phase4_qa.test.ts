/**
 * phase4_qa.test.ts — Phase 4 Cross-Phase QA, Bug-Hunt Regression & Integration Suite
 *
 * Tests:
 *   1. Bug #1 Regression — shareUrl strips heavy snapshots & vocalAudio while keeping Slash Chords/metadata intact
 *   2. Bug #2 Regression — duplicateSong creates collision-free unique bar IDs, clears snapshots, and non-active saves preserve active song ID
 *   3. Bug #3 Regression — SongLibraryModal exposes statusFilter and filterLibrarySongs combines query + folder + status cleanly
 *   4. Bug #4 Regression — thaiRhymeHelper removes non-rhyming words and prioritizes direct dictionary lookup for special spellings
 *   5. Cross-Phase E2E Flow — Phase 4A duplicate section + 4B slash/walking-bass/ritardando planning + 4C snapshots + 4D merge + 4E credits
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createDefaultSong } from '../src/lib/defaultSong';
import { duplicateSectionInList } from '../src/lib/sectionUtils';
import { planBar, flattenSong } from '../src/lib/barPlanner';
import {
  saveSong,
  duplicateSong,
  addSnapshotToSong,
  updateSongLibraryMeta,
  setActiveSongId,
  getActiveSongId,
  filterLibrarySongs,
} from '../src/lib/storage';
import { generateShareUrl, parseSongFromUrl } from '../src/lib/shareUrl';
import { THAI_RHYME_GROUPS, findThaiRhymes } from '../src/lib/thaiRhymeHelper';
import { mergeSongLists } from '../src/lib/cloudSync';
import {
  getCreditBalance,
  deductCredits,
  topUpCredits,
  CREDIT_PACKAGES,
  resetCreditWalletForTests,
} from '../src/lib/creditManager';

function setupBrowserEnv(): void {
  const store = new Map<string, string>();
  const mockLocalStorage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k: string) => store.get(k) ?? null,
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => {
      store.delete(k);
    },
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  };

  (globalThis as Record<string, unknown>).localStorage = mockLocalStorage;
  (globalThis as Record<string, unknown>).window = {
    location: { origin: 'https://demo-maker.example', pathname: '/', search: '' },
    localStorage: mockLocalStorage,
  };
}

// ───────────────────────── 1. Bug #1 Regression: Share URL Payload ─────────────────────────

test('QA Bug #1 Regression: generateShareUrl ตัด snapshots และ vocalAudio ออกให้ลิงก์กะทัดรัดแม้มีหลายเวอร์ชัน', () => {
  setupBrowserEnv();
  let song = createDefaultSong();
  song.folder = 'อัลบั้ม QA';
  song.statusTag = 'arranged';
  song.sections[0].bars[0].chords[0] = 'D/F#';
  song.sections[0].bars[0].lyrics = 'แสงแดดยามเช้ากับคอร์ดใหม่';
  song.sections[0].bars[0].vocalAudio = 'data:audio/webm;base64,' + 'A'.repeat(2000);

  const baselineUrl = generateShareUrl(song);

  for (let i = 1; i <= 5; i++) {
    song = addSnapshotToSong(song, `Mix v${i}`).song;
  }
  assert.equal(song.snapshots?.length, 5);

  const url = generateShareUrl(song);
  assert.equal(url.length, baselineUrl.length, 'การมี snapshots เพิ่มต้องไม่ทำให้ URL แชร์ยาวขึ้น');

  const search = new URL(url).search;
  const parsed = parseSongFromUrl(search);
  assert.ok(parsed);
  assert.equal(parsed.snapshots, undefined);
  assert.equal(parsed.sections[0].bars[0].vocalAudio, undefined);
  assert.equal(parsed.sections[0].bars[0].chords[0], 'D/F#');
  assert.equal(parsed.sections[0].bars[0].lyrics, 'แสงแดดยามเช้ากับคอร์ดใหม่');
  assert.equal(parsed.folder, 'อัลบั้ม QA');
  assert.equal(parsed.statusTag, 'arranged');
});

// ───────────────────────── 2. Bug #2 Regression: Unique IDs & Active Isolation ─────────────────────────

test('QA Bug #2 Regression: duplicateSong สร้าง ID ไม่ซ้ำทุกห้อง ล้าง snapshots และไม่แย่ง Active Song ID', () => {
  setupBrowserEnv();
  const songA = createDefaultSong();
  songA.id = 'song-qa-active';
  songA.title = 'Active Song A';

  let songB = createDefaultSong();
  songB.id = 'song-qa-other';
  songB.title = 'Library Song B';
  // เพิ่มจำนวนห้องให้ครบ 24 ห้องเพื่อทดสอบการชนของ ID ในลูปความเร็วสูง
  while (songB.sections[0].bars.length < 24) {
    const src = songB.sections[0].bars[0];
    songB.sections[0].bars.push({
      ...src,
      id: `orig-bar-${songB.sections[0].bars.length}`,
      melodyNotes: [],
    });
  }

  saveSong(songB);
  saveSong(songA);
  setActiveSongId(songA.id);
  assert.equal(getActiveSongId(), songA.id);

  songB = addSnapshotToSong(songB, 'Old Snapshot').song;
  assert.equal(getActiveSongId(), songA.id);

  songB = updateSongLibraryMeta(songB, { folder: 'Rock', statusTag: 'mastered' });
  assert.equal(getActiveSongId(), songA.id);

  const duplicated = duplicateSong(songB.id);
  assert.ok(duplicated);
  assert.notEqual(duplicated.id, songB.id);
  assert.deepEqual(duplicated.snapshots, []);
  assert.equal(getActiveSongId(), songA.id, 'การ duplicate เพลงในคลังต้องไม่แย่ง active song');

  const origBarIds = songB.sections.flatMap((s) => s.bars.map((b) => b.id));
  const dupBarIds = duplicated.sections.flatMap((s) => s.bars.map((b) => b.id));
  assert.equal(dupBarIds.length, origBarIds.length);
  assert.equal(new Set(dupBarIds).size, origBarIds.length, 'ทุกห้องในเพลงสำเนาต้องมี ID ไม่ซ้ำกันเลย');
});

// ───────────────────────── 3. Bug #3 Regression: Status Filter UI & Combine Query ─────────────────────────

test('QA Bug #3 Regression: SongLibraryModal มี statusFilter UI และ filterLibrarySongs กรองร่วมกันแม่นยำ', () => {
  const modalPath = path.join(process.cwd(), 'src/components/SongLibraryModal.tsx');
  const modalSrc = fs.readFileSync(modalPath, 'utf8');
  assert.match(modalSrc, /statusFilter/);
  assert.match(modalSrc, /setStatusFilter/);
  assert.match(modalSrc, /filterLibrarySongs\(songs,\s*searchQuery,\s*folderFilter,\s*statusFilter\)/);
  assert.match(modalSrc, /setActive:\s*id === currentSong\.id/);

  const s1 = { ...createDefaultSong(), id: 's1', title: 'คืนดาว', folder: 'Acoustic', statusTag: 'mastered' as const };
  const s2 = { ...createDefaultSong(), id: 's2', title: 'แสงดาว', folder: 'Acoustic', statusTag: 'draft' as const };
  const s3 = { ...createDefaultSong(), id: 's3', title: 'คิดถึงดาว', folder: 'Pop', statusTag: 'mastered' as const };

  const matched = filterLibrarySongs([s1, s2, s3], 'ดาว', 'Acoustic', 'mastered');
  assert.deepEqual(
    matched.map((s) => s.id),
    ['s1']
  );
});

// ───────────────────────── 4. Bug #4 Regression: Thai Rhyme Dictionary Accuracy ─────────────────────────

test('QA Bug #4 Regression: thaiRhymeHelper ไม่มีคำผิดกลุ่ม (-าย) และจับคู่คำสะกดพิเศษจากพจนานุกรมได้ตรงกลุ่ม', () => {
  const aaiGroup = THAI_RHYME_GROUPS.find((g) => g.id === 'aai');
  assert.ok(aaiGroup);
  assert.ok(!aaiGroup.words.includes('สายลม'), 'คำว่า สายลม ไม่ได้ลงท้ายด้วยสระ -าย');
  assert.ok(aaiGroup.words.every((w) => w.endsWith('าย')), 'ทุกคำในกลุ่ม -าย ควรลงท้ายด้วย -าย');

  const rAnSpecial = findThaiRhymes('อัศจรรย์');
  assert.match(rAnSpecial.groupLabel, /-ัน/);

  const rInSpecial = findThaiRhymes('ถวิล');
  assert.match(rInSpecial.groupLabel, /-ิน/);

  const rUaSpecial = findThaiRhymes('ชัวร์');
  assert.match(rUaSpecial.groupLabel, /-ัว/);
});

// ───────────────────────── 5. Cross-Phase E2E Integration ─────────────────────────

test('Cross-Phase E2E (4A->4E): Duplicate Section + Slash/WalkingBass Planning + Merge + Credit Wallet', () => {
  setupBrowserEnv();
  resetCreditWalletForTests();

  const song = createDefaultSong();
  // Phase 4A: Duplicate first section
  song.sections = duplicateSectionInList(song.sections, song.sections[0].id);
  const lastSec = song.sections[song.sections.length - 1];
  // Phase 4B: Slash chord on final outro bar
  lastSec.bars[lastSec.bars.length - 1].chords[0] = 'D/F#';

  const flat = flattenSong(song);
  const lastPlan = planBar(song, flat, flat.length - 1);
  assert.ok(lastPlan.events.length > 0);
  assert.ok(lastPlan.events.every((ev) => Number.isFinite(ev.t)));
  const noteEvents = lastPlan.events.filter((ev) => ev.kind === 'note');
  assert.ok(noteEvents.length > 0);
  assert.ok(noteEvents.every((ev) => Number.isFinite(ev.dur) && ev.vel > 0));

  // Phase 4D: Cloud merge keeps newer updatedAt
  const localCopy = { ...song, title: 'Local Newer', updatedAt: '2026-11-13T10:00:00.000Z' };
  const cloudCopy = { ...song, title: 'Cloud Older', updatedAt: '2026-11-13T09:00:00.000Z' };
  const merged = mergeSongLists([localCopy], [cloudCopy]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].title, 'Local Newer');

  // Phase 4E: Credit flow
  assert.equal(getCreditBalance(), 30);
  const spend = deductCredits(1, 'E2E AI Chorus');
  assert.equal(spend.balance, 29);
  const top = topUpCredits(CREDIT_PACKAGES[1]);
  assert.equal(top.balance, 329);
  resetCreditWalletForTests();
});
