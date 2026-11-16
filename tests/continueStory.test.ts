import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  POPULAR_CHORD_FORMULAS,
  resolveChordProgressionFormula,
} from '../src/lib/chordUtils';

test('Continue Story: Popular chord formulas transpose correctly to any key', () => {
  // In Key C: I-V-vi-IV -> C, G, Am, F
  const chordsKeyC = resolveChordProgressionFormula('I-V-vi-IV', 'C');
  assert.deepEqual(chordsKeyC, ['C', 'G', 'Am', 'F']);

  // In Key G (common for Thai acoustic pop):
  // I-V-vi-IV -> G, D, Em, C
  const chordsKeyG = resolveChordProgressionFormula('I-V-vi-IV', 'G');
  assert.deepEqual(chordsKeyG, ['G', 'D', 'Em', 'C']);

  // Royal Road formula IV-V-iii-vi in Key G:
  // C, D, Bm, Em
  const royalRoadKeyG = resolveChordProgressionFormula('IV-V-iii-vi', 'G');
  assert.deepEqual(royalRoadKeyG, ['C', 'D', 'Bm', 'Em']);

  // All 5 formulas resolve to non-empty chord arrays
  for (const formula of POPULAR_CHORD_FORMULAS) {
    const resolved = resolveChordProgressionFormula(formula.id, 'G');
    assert.equal(resolved.length, 4);
  }
});

test('Continue Story: ContinueStoryModal and AdvanceModeModal contracts', () => {
  const root = process.cwd();
  const continueStoryModalSrc = fs.readFileSync(
    path.join(root, 'src/components/ContinueStoryModal.tsx'),
    'utf8'
  );
  const advanceModalSrc = fs.readFileSync(
    path.join(root, 'src/components/AdvanceModeModal.tsx'),
    'utf8'
  );
  const pageSrc = fs.readFileSync(
    path.join(root, 'src/app/page.tsx'),
    'utf8'
  );

  // 1. ContinueStoryModal supports choosing section type, bars, chords, and story direction
  assert.match(continueStoryModalSrc, /SECTION_OPTIONS/);
  assert.match(continueStoryModalSrc, /STORY_DIRECTIONS/);
  assert.match(continueStoryModalSrc, /POPULAR_CHORD_FORMULAS/);
  assert.match(continueStoryModalSrc, /handleSelectSectionType/);
  assert.match(continueStoryModalSrc, /actionType:\s*'ai-lyric'\s*\|\s*'blank'/);
  assert.match(continueStoryModalSrc, /max-h-\[92vh\]|max-h-\[88vh\]/);
  assert.match(continueStoryModalSrc, /flex-1 overflow-y-auto/);

  // 2. AdvanceModeModal supports switching target section, editing section type, and editing chords
  assert.match(advanceModalSrc, /handleSwitchTargetSection/);
  assert.match(advanceModalSrc, /handleChangeSectionType/);
  assert.match(advanceModalSrc, /handleApplyCustomChords/);
  assert.match(advanceModalSrc, /isEditingChords/);
  assert.match(advanceModalSrc, /initialTopic/);

  // 3. page.tsx connects ContinueStoryModal and passes initialTopic to AdvanceModeModal
  assert.match(pageSrc, /ContinueStoryModal/);
  assert.match(pageSrc, /handleConfirmContinueStory/);
  assert.match(pageSrc, /initialTopic=\{advanceModalState\.initialTopic\}/);
});
