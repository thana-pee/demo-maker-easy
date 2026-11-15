import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { resolveNextBarIndex } from '../src/lib/audioEngine';
import { generateLyricAlignedGuideMelody } from '../src/lib/melodyUtils';

test('Phase 7B: resolveNextBarIndex handles linear, single-bar loop, section loop & fallback safely', () => {
  // Normal linear progression without loop
  assert.equal(resolveNextBarIndex(0, 8, null), 1);
  assert.equal(resolveNextBarIndex(6, 8, null), 7);
  assert.equal(resolveNextBarIndex(7, 8, null), -1);
  assert.equal(resolveNextBarIndex(0, 0, null), -1);

  // Single-bar loop
  assert.equal(resolveNextBarIndex(2, 8, { startBar: 2, endBar: 2 }), 2);

  // Section loop (bars 4..7)
  assert.equal(resolveNextBarIndex(4, 8, { startBar: 4, endBar: 7 }), 5);
  assert.equal(resolveNextBarIndex(6, 8, { startBar: 4, endBar: 7 }), 7);
  assert.equal(resolveNextBarIndex(7, 8, { startBar: 4, endBar: 7 }), 4);
  // Pre-range jumps cleanly into loop start
  assert.equal(resolveNextBarIndex(1, 8, { startBar: 4, endBar: 7 }), 4);

  // Shrunk song clamps endBar safely if startBar is still valid
  assert.equal(resolveNextBarIndex(5, 6, { startBar: 4, endBar: 9 }), 4);

  // Out-of-bounds loopRange falls back to linear
  assert.equal(resolveNextBarIndex(3, 6, { startBar: 8, endBar: 10 }), 4);
  assert.equal(resolveNextBarIndex(5, 6, { startBar: 8, endBar: 10 }), -1);
});

test('Phase 7B: generateLyricAlignedGuideMelody supports 3-arg overload for 0-credit bar rhythm preview', () => {
  const viaThreeArgs = generateLyricAlignedGuideMelody('ข้ามทะเลใจไปให้ถึงฝัน', 'C', {
    chord2: 'G',
    chordsPerBar: 2,
    sectionType: 'chorus',
    barIndex: 0,
    totalBars: 4,
    baseKey: 'C',
  });
  const viaOptions = generateLyricAlignedGuideMelody({
    lyrics: 'ข้ามทะเลใจไปให้ถึงฝัน',
    chord1: 'C',
    chord2: 'G',
    chordsPerBar: 2,
    sectionType: 'chorus',
    barIndex: 0,
    baseKey: 'C',
  });

  assert.ok(viaThreeArgs.length >= 4);
  assert.deepEqual(viaThreeArgs, viaOptions);
  for (const n of viaThreeArgs) {
    assert.ok(Number.isFinite(n.step) && n.step >= 0 && n.step <= 15);
    assert.ok(Number.isFinite(n.midiPitch) && n.midiPitch >= 48 && n.midiPitch <= 84);
    assert.ok(Number.isFinite(n.durationSteps) && n.durationSteps >= 1);
  }
});

test('Phase 7B: AudioEngine, useAudioEngine, page.tsx Undo/Redo, TransportBar shortcuts & SectionBuilder loop controls contract', () => {
  const audioEngineSrc = fs.readFileSync(
    path.join(process.cwd(), 'src', 'lib', 'audioEngine.ts'),
    'utf8'
  );
  assert.match(audioEngineSrc, /export interface LoopRange/);
  assert.match(audioEngineSrc, /setLoopRange\(range:\s*LoopRange \| null\)/);
  assert.match(audioEngineSrc, /resolveNextBarIndex/);

  const hookSrc = fs.readFileSync(
    path.join(process.cwd(), 'src', 'hooks', 'useAudioEngine.ts'),
    'utf8'
  );
  assert.match(hookSrc, /loopRange:\s*LoopRange \| null/);
  assert.match(hookSrc, /setLoopRange:\s*\(range:\s*LoopRange \| null\)\s*=>\s*void/);

  const pageSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'page.tsx'), 'utf8');
  assert.match(pageSrc, /MAX_HISTORY\s*=\s*30/);
  assert.match(pageSrc, /undoStackRef/);
  assert.match(pageSrc, /redoStackRef/);
  assert.match(pageSrc, /updateSongWithHistory/);
  assert.match(pageSrc, /handleUndo/);
  assert.match(pageSrc, /handleRedo/);
  assert.match(pageSrc, /handleToggleLoopRange/);
  assert.match(pageSrc, /handlePlayBarFromIndex/);

  const transportSrc = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'TransportBar.tsx'),
    'utf8'
  );
  assert.match(transportSrc, /Undo2/);
  assert.match(transportSrc, /Redo2/);
  assert.match(transportSrc, /canUndo\?:/);
  assert.match(transportSrc, /canRedo\?:/);
  assert.match(transportSrc, /keyLower\s*===\s*'z'/);
  assert.match(transportSrc, /keyLower\s*===\s*'y'/);

  const sectionSrc = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'SectionBuilder.tsx'),
    'utf8'
  );
  assert.match(sectionSrc, /🔁 ลูปท่อนนี้/);
  assert.match(sectionSrc, /🔁 ลูปห้องนี้/);
  assert.match(sectionSrc, /🔊 ฟังจังหวะคำร้อง/);
});
