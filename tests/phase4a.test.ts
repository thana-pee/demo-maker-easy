/**
 * phase4a.test.ts — Automated Unit Tests for Phase 4A
 *
 * Tests:
 *   1. types/song.ts — AppViewMode ('songwriter' | 'arranger' | 'karaoke')
 *   2. sectionUtils.ts — cloneSongSection & duplicateSectionInList (deep clone, unique IDs, " (Copy)" suffix, insertion order)
 *   3. sectionUtils.ts — countThaiEnglishSyllables (Thai, English, mixed, yamok ๆ, thanthakhat ์, punctuation)
 *   4. i18n.ts — Phase 4A bilingual keys & symmetry check
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { AppViewMode } from '../src/types/song';
import {
  cloneSongSection,
  duplicateSectionInList,
  countThaiEnglishSyllables,
  generateUniqueId,
} from '../src/lib/sectionUtils';
import { createDefaultSong } from '../src/lib/defaultSong';
import { translations } from '../src/lib/i18n';

// ───────────────────────── 1. AppViewMode & UI Contract ─────────────────────────

test('Phase 4A Types: AppViewMode รองรับ songwriter | arranger | karaoke ครบทั้ง 3 โหมด', () => {
  const modes: AppViewMode[] = ['songwriter', 'arranger', 'karaoke'];
  assert.deepEqual(modes, ['songwriter', 'arranger', 'karaoke']);

  const pageSource = fs.readFileSync(
    path.join(process.cwd(), 'src', 'app', 'page.tsx'),
    'utf-8'
  );
  assert.ok(
    pageSource.includes("useState<AppViewMode>('songwriter')"),
    'page.tsx ต้องตั้งค่าเริ่มต้นของ activeMode เป็น songwriter'
  );
  assert.ok(
    pageSource.includes('isZenMode'),
    'page.tsx ต้องมีสถานะ isZenMode สำหรับ Zen Focus Mode'
  );
});

// ───────────────────────── 2. Section Duplication Tests ─────────────────────────

test('duplicateSection: cloneSongSection คัดลอกท่อนเพลงแบบ Deep Clone พร้อม ID ใหม่และต่อท้าย " (Copy)"', () => {
  const song = createDefaultSong();
  const chorus = song.sections[3]; // Chorus
  chorus.bars[0].melodyNotes = [{ step: 0, midiPitch: 64, durationSteps: 2 }];

  const cloned = cloneSongSection(chorus);

  assert.notEqual(cloned.id, chorus.id, 'Section ID ใหม่ต้องไม่ซ้ำกับต้นฉบับ');
  assert.equal(cloned.name, `${chorus.name} (Copy)`, 'ชื่อท่อนที่คัดลอกต้องต่อท้าย " (Copy)"');
  assert.equal(cloned.bars.length, chorus.bars.length, 'จำนวนห้องต้องเท่าเดิม');

  const sourceBarIds = new Set(chorus.bars.map((b) => b.id));
  const clonedBarIds = new Set(cloned.bars.map((b) => b.id));
  assert.equal(clonedBarIds.size, cloned.bars.length, 'Bar ID ในท่อนใหม่ต้องไม่ซ้ำกันเอง');
  for (const id of clonedBarIds) {
    assert.ok(!sourceBarIds.has(id), `Bar ID ${id} ต้องไม่ซ้ำกับต้นฉบับ`);
  }

  // Verify deep clone isolation (mutating clone must not affect source)
  cloned.instruments.drums = !chorus.instruments.drums;
  cloned.bars[0].chords[0] = 'Dm7';
  cloned.bars[0].melodyNotes[0].midiPitch = 72;

  assert.notEqual(chorus.instruments.drums, cloned.instruments.drums);
  assert.notEqual(chorus.bars[0].chords[0], 'Dm7');
  assert.equal(chorus.bars[0].melodyNotes[0].midiPitch, 64);
});

test('duplicateSection: duplicateSectionInList แทรกท่อนที่คัดลอกไว้ถัดจากท่อนต้นฉบับทันที', () => {
  const song = createDefaultSong();
  const initialCount = song.sections.length;
  const targetIndex = 2; // Pre-Chorus
  const targetSection = song.sections[targetIndex];

  const updated = duplicateSectionInList(song.sections, targetSection.id);

  assert.equal(updated.length, initialCount + 1);
  assert.equal(updated[targetIndex].id, targetSection.id);
  assert.equal(updated[targetIndex + 1].name, `${targetSection.name} (Copy)`);
  assert.notEqual(updated[targetIndex + 1].id, targetSection.id);

  // Unknown section ID should leave list unchanged
  const unchanged = duplicateSectionInList(song.sections, 'non-existent-id');
  assert.equal(unchanged.length, initialCount);
});

test('generateUniqueId: สร้าง ID ไม่ซ้ำกันแม้เรียกติดกันหลายครั้งภายในมิลลิวินาทีเดียวกัน', () => {
  const ids = new Set<string>();
  for (let i = 0; i < 100; i += 1) {
    ids.add(generateUniqueId('bar'));
  }
  assert.equal(ids.size, 100);
});

// ───────────────────────── 3. Thai & English Syllable Counter ─────────────────────────

test('syllableCounter: นับพยางค์ภาษาไทยจากเนื้อเพลงจริงได้แม่นยำ (รวมไม้ยมก ๆ และการันต์ ์)', () => {
  assert.equal(countThaiEnglishSyllables(''), 0);
  assert.equal(countThaiEnglishSyllables('   ...  '), 0);

  assert.equal(countThaiEnglishSyllables('ลมหนาวพัดมาเบาๆ...'), 6);
  assert.equal(countThaiEnglishSyllables('นั่งมองดาวบนระเบียงไม้'), 7);
  assert.equal(countThaiEnglishSyllables('หยิบกีตาร์ตัวเก่าขึ้นมา'), 7);
  assert.equal(countThaiEnglishSyllables('ส่งใจไปหาเธอไกลแสนไกล'), 8);
  assert.equal(countThaiEnglishSyllables('นึกถึงรอยยิ้มวันวาน'), 6);
  assert.equal(countThaiEnglishSyllables('อยากบอกว่ารักเธอเหมือนวันวาน'), 8);
  assert.equal(countThaiEnglishSyllables('ต่อให้ระยะทางจะไกลแค่ไหน'), 9);
  assert.equal(countThaiEnglishSyllables('เธอทำให้ฉันสบายใจ'), 7);
});

test('syllableCounter: นับพยางค์ภาษาอังกฤษและข้อความผสมไทย-อังกฤษได้ถูกต้อง', () => {
  assert.equal(countThaiEnglishSyllables('love'), 1);
  assert.equal(countThaiEnglishSyllables('Hello world tonight'), 5);
  assert.equal(countThaiEnglishSyllables('Beautiful melody in my heart'), 9);
  assert.equal(countThaiEnglishSyllables('ฉันรักเธอ forever more'), 7);
});

// ───────────────────────── 4. i18n Phase 4A Keys & Symmetry ─────────────────────────

test('i18n: มี Key ใหม่ของ Phase 4A ครบถ้วนและสมมาตรทั้งภาษาไทยและภาษาอังกฤษ', () => {
  const thKeys = Object.keys(translations.th).sort();
  const enKeys = Object.keys(translations.en).sort();
  assert.deepEqual(thKeys, enKeys);

  const requiredKeys: Array<keyof typeof translations.th> = [
    'modeSongwriting',
    'modeArranger',
    'modeKaraoke',
    'zenMode',
    'zenModeHint',
    'duplicateSection',
    'syllablesCount',
    'activeInstrumentsLabel',
    'expandInstruments',
    'collapseInstruments',
    'openArrangerBtn',
    'barOptionsBtn',
    'songwriterTitle',
    'arrangerTitle',
  ];

  for (const key of requiredKeys) {
    assert.ok(translations.th[key].trim().length > 0, `th.${key} must not be empty`);
    assert.ok(translations.en[key].trim().length > 0, `en.${key} must not be empty`);
  }
});
