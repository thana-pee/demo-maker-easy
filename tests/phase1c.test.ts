/**
 * phase1c.test.ts — Automated Unit Tests for Phase 1C
 *
 * Tests:
 *   1. storage.ts — Save, Load, Duplicate, Delete, Import/Export JSON
 *   2. shareUrl.ts — URL-safe Compression, Decompression, Parsing, Safeguards
 *   3. midiExport.ts — Standard MIDI File (SMF Format 1) Structure & Multi-track Data
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultSong } from '../src/lib/defaultSong';
import {
  compressToUrlSafe,
  decompressFromUrlSafe,
  generateShareUrl,
  parseSongFromUrl,
} from '../src/lib/shareUrl';
import { generateMidiFile } from '../src/lib/midiExport';

// Mock localStorage for Node.js test environment
const mockStorage: Record<string, string> = {};
(globalThis as any).window = {
  location: {
    origin: 'http://localhost:3000',
    pathname: '/',
    search: '',
  },
  localStorage: {
    getItem: (key: string) => mockStorage[key] || null,
    setItem: (key: string, val: string) => {
      mockStorage[key] = val;
    },
    removeItem: (key: string) => {
      delete mockStorage[key];
    },
    clear: () => {
      for (const k of Object.keys(mockStorage)) delete mockStorage[k];
    },
  },
};

// ───────────────────────── Share URL Tests ─────────────────────────

test('shareUrl: บีบอัดและถอดรหัสข้อความกลับมาตรงเดิม 100% (Lossless URL-Safe)', () => {
  const original = 'Hello World! เพลงรักริมระเบียง คอร์ด C Fmaj7 G 1234567890';
  const compressed = compressToUrlSafe(original);
  assert.ok(compressed.length > 0);
  // ต้องมีเฉพาะตัวอักษร URL-safe [A-Za-z0-9_-]
  assert.match(compressed, /^[A-Za-z0-9_-]+$/);
  const decompressed = decompressFromUrlSafe(compressed);
  assert.equal(decompressed, original);
});

test('shareUrl: บีบอัด SongProject ทั้งเพลงแล้วถอดรหัสได้โครงสร้างครบถ้วน', () => {
  const song = createDefaultSong();
  song.title = 'เพลงทดสอบการแชร์ LINE';
  const url = generateShareUrl(song);
  assert.ok(url.startsWith('http://localhost:3000/?song='));

  const parsed = parseSongFromUrl(url.replace('http://localhost:3000/', ''));
  assert.ok(parsed);
  assert.equal(parsed.title, 'เพลงทดสอบการแชร์ LINE');
  assert.equal(parsed.sections.length, song.sections.length);
  assert.equal(parsed.mixer.guitarLead.model, song.mixer.guitarLead.model);
  assert.equal(parsed.mixer.guitarLead.drive, song.mixer.guitarLead.drive);
});

test('shareUrl: รองรับลิงก์เสียหรือสตริงมั่วโดยไม่ Crash (Graceful Fallback)', () => {
  const badUrl = '?song=InvalidGarbageString!@#$%^&*()';
  const result = parseSongFromUrl(badUrl);
  assert.equal(result, null);

  const emptyUrl = '';
  assert.equal(parseSongFromUrl(emptyUrl), null);
});

// ───────────────────────── MIDI Export Tests ─────────────────────────

test('midiExport: สร้างไฟล์ Standard MIDI File (SMF Format 1) มี Header ถูกต้องตามมาตรฐาน', () => {
  const song = createDefaultSong();
  const midiBytes = generateMidiFile(song);

  assert.ok(midiBytes instanceof Uint8Array);
  assert.ok(midiBytes.length > 500, `MIDI file length should be > 500 bytes, got ${midiBytes.length}`);

  // Header chunk: 'MThd' (0x4D, 0x54, 0x68, 0x64)
  assert.equal(midiBytes[0], 0x4d);
  assert.equal(midiBytes[1], 0x54);
  assert.equal(midiBytes[2], 0x68);
  assert.equal(midiBytes[3], 0x64);

  // Header length = 6
  assert.equal(midiBytes[7], 0x06);

  // Format = 1 (Multi-track)
  assert.equal(midiBytes[8], 0x00);
  assert.equal(midiBytes[9], 0x01);

  // Number of tracks = 6 (Conductor + 5 Instrument tracks)
  const numTracks = (midiBytes[10] << 8) | midiBytes[11];
  assert.equal(numTracks, 6);

  // Division (Ticks per beat = 480)
  const division = (midiBytes[12] << 8) | midiBytes[13];
  assert.equal(division, 480);
});

test('midiExport: ทุก Track เริ่มด้วย MTrk และปิดท้ายด้วย End of Track (0xFF 0x2F 0x00)', () => {
  const song = createDefaultSong();
  const midiBytes = generateMidiFile(song);

  let offset = 14; // หลัง MThd header
  let trackCount = 0;

  while (offset < midiBytes.length) {
    // Track identifier 'MTrk' (0x4D, 0x54, 0x72, 0x6B)
    assert.equal(midiBytes[offset], 0x4d);
    assert.equal(midiBytes[offset + 1], 0x54);
    assert.equal(midiBytes[offset + 2], 0x72);
    assert.equal(midiBytes[offset + 3], 0x6b);

    const trackLen =
      (midiBytes[offset + 4] << 24) |
      (midiBytes[offset + 5] << 16) |
      (midiBytes[offset + 6] << 8) |
      midiBytes[offset + 7];

    const trackEnd = offset + 8 + trackLen;
    // ท้าย track ต้องลงท้ายด้วย 0xFF 0x2F 0x00
    assert.equal(midiBytes[trackEnd - 3], 0xff);
    assert.equal(midiBytes[trackEnd - 2], 0x2f);
    assert.equal(midiBytes[trackEnd - 1], 0x00);

    offset = trackEnd;
    trackCount++;
  }

  assert.equal(trackCount, 6);
});

// ───────────────────────── Storage Tests ─────────────────────────

test('storage: บันทึก, ดึงข้อมูล, ทำสำเนา, และส่งออก/นำเข้า JSON', async () => {
  const {
    getSavedSongs,
    saveSong,
    deleteSong,
    duplicateSong,
    exportAllSongsJSON,
    importSongsJSON,
  } = await import('../src/lib/storage');

  // Initial read
  const initial = getSavedSongs();
  assert.ok(initial.length >= 1);

  // Save new song
  const mySong = createDefaultSong();
  mySong.id = 'test-song-99';
  mySong.title = 'เพลงใหม่ทดสอบ';
  saveSong(mySong);

  const songsAfterSave = getSavedSongs();
  const found = songsAfterSave.find((s) => s.id === 'test-song-99');
  assert.ok(found);
  assert.equal(found.title, 'เพลงใหม่ทดสอบ');

  // Duplicate song
  const copy = duplicateSong('test-song-99');
  assert.ok(copy);
  assert.equal(copy.title, 'เพลงใหม่ทดสอบ (สำเนา)');
  assert.notEqual(copy.id, 'test-song-99');

  // Export & Import backup JSON
  const jsonBackup = exportAllSongsJSON();
  assert.ok(jsonBackup.includes('เพลงใหม่ทดสอบ'));
  const imported = importSongsJSON(jsonBackup);
  assert.ok(imported && imported.length >= 2);

  // Delete song
  const deleted = deleteSong('test-song-99');
  assert.ok(deleted);
  assert.equal(getSavedSongs().find((s) => s.id === 'test-song-99'), undefined);
});
