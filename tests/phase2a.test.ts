/**
 * phase2a.test.ts — Automated Unit Tests for Phase 2A
 *
 * Tests:
 *   1. melodyUtils — MIDI to note name, black keys, scale pitch classes, chord pitch classes
 *   2. barPlanner — Melody note planning, timing, transposition, break clamping, mixer muting
 *   3. midiExport — Multi-track MIDI file includes Track 6 (Melody Guide) when melody notes exist
 *   4. storage & shareUrl — Preserves melodyNotes array across compression & serialization
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultSong } from '../src/lib/defaultSong';
import { planBar, flattenSong, isTrackOn } from '../src/lib/barPlanner';
import {
  midiToNoteName,
  isBlackKey,
  getScalePitchClasses,
  getChordPitchClasses,
  getRootPitchClass,
} from '../src/lib/melodyUtils';
import { generateMidiFile } from '../src/lib/midiExport';
import { generateShareUrl, parseSongFromUrl } from '../src/lib/shareUrl';

// Mock localStorage for Node.js test environment
const mockStorage: Record<string, string> = {};
(globalThis as Record<string, unknown>).window = {
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

// ───────────────────────── 1. Melody Utils Tests ─────────────────────────

test('melodyUtils: แปลงรหัส MIDI Pitch เป็นชื่อโน้ตพร้อม Octave ถูกต้อง', () => {
  assert.equal(midiToNoteName(60), 'C4');
  assert.equal(midiToNoteName(62), 'D4');
  assert.equal(midiToNoteName(64), 'E4');
  assert.equal(midiToNoteName(65), 'F4');
  assert.equal(midiToNoteName(67), 'G4');
  assert.equal(midiToNoteName(69), 'A4');
  assert.equal(midiToNoteName(71), 'B4');
  assert.equal(midiToNoteName(72), 'C5');
  assert.equal(midiToNoteName(55), 'G3');
});

test('melodyUtils: แยกแยะคีย์ขาวและคีย์ดำบนเปียโนถูกต้อง', () => {
  assert.equal(isBlackKey(60), false); // C
  assert.equal(isBlackKey(61), true);  // C#
  assert.equal(isBlackKey(62), false); // D
  assert.equal(isBlackKey(63), true);  // D#
  assert.equal(isBlackKey(64), false); // E
  assert.equal(isBlackKey(65), false); // F
  assert.equal(isBlackKey(66), true);  // F#
});

test('melodyUtils: คำนวณโน้ตในสเกลประจำคีย์ (Scale Pitch Classes) และโน้ตในคอร์ดถูกต้อง', () => {
  // Key C Major: C D E F G A B (0, 2, 4, 5, 7, 9, 11)
  const cMajor = getScalePitchClasses('C', 'major');
  assert.equal(cMajor.size, 7);
  assert.ok(cMajor.has(0)); // C
  assert.ok(cMajor.has(4)); // E
  assert.ok(cMajor.has(7)); // G
  assert.ok(!cMajor.has(1)); // C# ไม่ใช่โน้ตในสเกล C

  // Key A Minor: A B C D E F G (9, 11, 0, 2, 4, 5, 7)
  const aMinor = getScalePitchClasses('Am', 'major');
  assert.ok(aMinor.has(9));
  assert.ok(aMinor.has(0));

  // Chord C: Root (0), Major 3rd (4), Perfect 5th (7)
  const chordC = getChordPitchClasses('C');
  assert.deepEqual([...chordC].sort(), [0, 4, 7]);

  // Chord Am7: A (9), C (0), E (4), G (7)
  const chordAm7 = getChordPitchClasses('Am7');
  assert.deepEqual([...chordAm7].sort(), [0, 4, 7, 9]);

  // Root pitch class helper
  assert.equal(getRootPitchClass('C'), 0);
  assert.equal(getRootPitchClass('G'), 7);
  assert.equal(getRootPitchClass('Am'), 9);
});

// ───────────────────────── 2. Bar Planner Melody Tests ─────────────────────────

test('barPlanner: วางแผนสร้าง Event โน้ตทำนองร้องไกด์ (Melody Guide) เมื่อห้องมี melodyNotes', () => {
  const song = createDefaultSong();
  const flat = flattenSong(song);

  // กำหนดโน้ตในห้องแรก: E4 (64), G4 (67), C5 (72)
  flat[0].bar.melodyNotes = [
    { step: 0, midiPitch: 64, durationSteps: 2 },
    { step: 2, midiPitch: 67, durationSteps: 2 },
    { step: 4, midiPitch: 72, durationSteps: 4 },
  ];

  const planned = planBar(song, flat, 0);
  const melodyEvents = planned.events.filter((e) => e.kind === 'note' && e.track === 'melody');

  assert.equal(melodyEvents.length, 3, 'ต้องมีโน้ตทำนองครบ 3 โน้ต');
  assert.equal(melodyEvents[0].kind === 'note' && melodyEvents[0].midi, 64);
  assert.equal(melodyEvents[1].kind === 'note' && melodyEvents[1].midi, 67);
  assert.equal(melodyEvents[2].kind === 'note' && melodyEvents[2].midi, 72);

  // ตรวจสอบเวลา t สัมพันธ์กับ stepSec
  const stepSec = planned.timing.stepSec;
  assert.equal(melodyEvents[0].t, 0 * stepSec);
  assert.equal(melodyEvents[1].t, 2 * stepSec);
  assert.equal(melodyEvents[2].t, 4 * stepSec);
});

test('barPlanner: Transpose ขยับระดับเสียงจริงของโน้ตทำนองตามระดับเสียงเพลง', () => {
  const song = createDefaultSong();
  song.transposeSemitones = 2; // ขยับขึ้น 1 เสียงเต็ม (+2 semitones)
  const flat = flattenSong(song);

  flat[0].bar.melodyNotes = [
    { step: 0, midiPitch: 60, durationSteps: 2 }, // C4
  ];

  const planned = planBar(song, flat, 0);
  const melodyEvents = planned.events.filter((e) => e.kind === 'note' && e.track === 'melody');

  assert.equal(melodyEvents.length, 1);
  assert.equal(melodyEvents[0].kind === 'note' && melodyEvents[0].midi, 62, 'C4 (60) + 2 semitones ต้องดังเป็น D4 (62)');
});

test('barPlanner: ปิดสวิตช์ Melody ในมิกเซอร์รวม → ไม่มีโน้ตทำนองส่งออกมา', () => {
  const song = createDefaultSong();
  song.mixer.melody = { enabled: false, volume: 80, sound: 'flute' };
  const flat = flattenSong(song);

  flat[0].bar.melodyNotes = [
    { step: 0, midiPitch: 64, durationSteps: 2 },
  ];

  assert.equal(isTrackOn(song, flat[0].section, 'melody'), false);

  const planned = planBar(song, flat, 0);
  const melodyEvents = planned.events.filter((e) => e.kind === 'note' && e.track === 'melody');
  assert.equal(melodyEvents.length, 0, 'เมื่อปิดสวิตช์ในมิกเซอร์ ต้องไม่มีโน้ต melody ส่งออก');
});

test('barPlanner: เมื่อห้องเป็น Break โน้ตทำนองที่อยู่ในครึ่งหลังของห้องจะถูกหยุดเสียงตามจังหวะ Break', () => {
  const song = createDefaultSong();
  const flat = flattenSong(song);

  flat[0].bar.playStyle = 'break';
  flat[0].bar.melodyNotes = [
    { step: 0, midiPitch: 64, durationSteps: 4 }, // ครึ่งแรก
    { step: 10, midiPitch: 67, durationSteps: 2 }, // ครึ่งหลัง (ตรงจุด break)
  ];

  const planned = planBar(song, flat, 0);
  const melodyEvents = planned.events.filter((e) => e.kind === 'note' && e.track === 'melody');

  assert.equal(melodyEvents.length, 1, 'โน้ตครึ่งหลังหลังจุด Break ต้องถูกตัดออก');
  assert.equal(melodyEvents[0].kind === 'note' && melodyEvents[0].midi, 64);
});

// ───────────────────────── 3. MIDI Export Melody Track ─────────────────────────

test('midiExport: มี Track 6 Melody Guide ในไฟล์ SMF Format 1 เมื่อเพลงมีโน้ตทำนอง', () => {
  const song = createDefaultSong();
  // เติมโน้ตทำนองลงในห้อง
  song.sections[1].bars[0].melodyNotes = [
    { step: 0, midiPitch: 64, durationSteps: 2 },
    { step: 2, midiPitch: 67, durationSteps: 2 },
  ];

  const midiBytes = generateMidiFile(song);
  const numTracks = (midiBytes[10] << 8) | midiBytes[11];
  assert.equal(numTracks, 7, 'ต้องมี 7 Tracks (Conductor + 5 ดนตรี + 1 Melody Guide)');
});

// ───────────────────────── 4. Storage & Share URL ─────────────────────────

test('shareUrl & storage: บันทึกและแชร์เพลงที่มีโน้ตเมโลดี้ไกด์ได้สมบูรณ์ ไม่ตกหล่น', () => {
  const song = createDefaultSong();
  song.title = 'เพลงทดสอบเมโลดี้ไกด์';
  song.sections[0].bars[0].melodyNotes = [
    { step: 0, midiPitch: 60, durationSteps: 2 },
    { step: 2, midiPitch: 64, durationSteps: 2 },
    { step: 4, midiPitch: 67, durationSteps: 4 },
  ];

  // บีบอัดเป็น LINE Share URL
  const shareUrl = generateShareUrl(song);
  assert.ok(shareUrl.includes('?song='));

  // ถอดรหัสกลับมา
  const parsed = parseSongFromUrl(shareUrl.replace('http://localhost:3000/', ''));
  assert.ok(parsed);
  assert.equal(parsed.title, 'เพลงทดสอบเมโลดี้ไกด์');
  const bar0Notes = parsed.sections[0].bars[0].melodyNotes;
  assert.equal(bar0Notes.length, 3);
  assert.equal(bar0Notes[0].midiPitch, 60);
  assert.equal(bar0Notes[1].midiPitch, 64);
  assert.equal(bar0Notes[2].midiPitch, 67);
});
