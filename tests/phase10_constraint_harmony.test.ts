/**
 * phase10_constraint_harmony.test.ts — Regression tests for Phase 10 (4-Tier Constraint Harmony + Option B Polish Gate)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ANTI_CLICHE_THAI_PHRASES,
  MASTER_LYRIC_FEW_SHOT_BANK,
  buildEasyArchitectSystemPrompt,
  buildEasyArchitectUserPrompt,
  buildLyricsSystemPrompt,
  getSyllableBudgetForBpm,
  selectPrioritySectionsForPolish,
} from '../src/lib/aiPrompts';
import {
  classifyRhymeGroupId,
  computeLyricQualityPenalty,
  countThaiEnglishSyllables,
  segmentThaiWordToSyllables,
  shouldAcceptPolishedSection,
  validateThaiLyricCouplets,
} from '../src/lib/thaiRhymeHelper';
import { POST as architectPost } from '../src/app/api/advance/architect/route';

async function readFetchBodyText(input: RequestInfo | URL, init?: RequestInit): Promise<string> {
  if (typeof init?.body === 'string') return init.body;
  if (input instanceof Request) return await input.clone().text();
  return '';
}

test('Phase 10.1: Mai-yamok (ๆ) segmentation parity across thaiRhymeHelper & syllable counter', () => {
  assert.deepEqual(segmentThaiWordToSyllables('เบาๆ'), ['เบา', 'เบา']);
  assert.deepEqual(segmentThaiWordToSyllables('ช้าๆ'), ['ช้า', 'ช้า']);
  assert.deepEqual(segmentThaiWordToSyllables('ร้านเล็กๆ'), ['ร้าน', 'เล็ก', 'เล็ก']);

  assert.equal(segmentThaiWordToSyllables('เบาๆ').length, countThaiEnglishSyllables('เบาๆ'));
  assert.equal(segmentThaiWordToSyllables('ทุกๆ วัน  ผูกพัน').length, countThaiEnglishSyllables('ทุกๆ วัน  ผูกพัน'));
  assert.equal(classifyRhymeGroupId('เบาๆ'), 'ao');
  assert.equal(classifyRhymeGroupId('ช้าๆ'), 'aa');
});

test('Phase 10.2: Zero banned clichés or legacy double-words remain in MASTER_LYRIC_FEW_SHOT_BANK', () => {
  const legacyForms = ['เบาเบา', 'ช้าช้า', 'ทุกทุกวัน'];
  for (const [groupName, groupMap] of Object.entries(MASTER_LYRIC_FEW_SHOT_BANK)) {
    for (const [key, value] of Object.entries(groupMap as Record<string, unknown>)) {
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      for (const banned of ANTI_CLICHE_THAI_PHRASES) {
        assert.ok(!text.includes(banned), `Few-shot ${groupName}.${key} still contains cliché "${banned}"`);
      }
      for (const legacy of legacyForms) {
        assert.ok(!text.includes(legacy), `Few-shot ${groupName}.${key} still contains legacy "${legacy}"`);
      }
    }
  }
});

test('Phase 10.3: Chorus Bar 1 budget and 4-Tier Priority Ladder stay synchronized across prompts & validator', () => {
  const chorusBudget88 = getSyllableBudgetForBpm(88, '4/4', { sectionType: 'chorus' });
  const bar1Slot = chorusBudget88.barBudgets?.[0];
  assert.ok(bar1Slot && bar1Slot.min === 4 && bar1Slot.max === 5);

  const sysPrompt = buildEasyArchitectSystemPrompt({ bpm: 88, timeSignature: '4/4' });
  const usrPrompt = buildEasyArchitectUserPrompt({
    stylePreset: 'warm-acoustic',
    vocalProfile: 'female',
    tempoFeel: 'medium',
    topic: 'คืนฝนพรำ',
    language: 'th',
    recommendedBpm: 88,
    recommendedGuitarModel: 'classical-nylon',
    recommendedAmbience: 'living-room',
  });
  const lyricSys = buildLyricsSystemPrompt({ bpm: 88, sectionType: 'chorus' });

  assert.match(sysPrompt, /Chorus: Bar 1 Hook สั้นติดหู 4-5 พยางค์/);
  assert.match(usrPrompt, /Chorus Bar 1 4-5/);
  assert.match(sysPrompt, /4-Tier Constraint Priority/);
  assert.match(lyricSys, /4-Tier Constraint Priority/);

  // 4-syllable Chorus Bar 1 ("รักเธอเท่าเดิม") must PASS when barBudgets are provided at 88 BPM
  const report = validateThaiLyricCouplets(
    ['รักเธอเท่าเดิม', 'ไม่เคยคิดเพิ่มเติม', 'แม้ตัวห่างไกลกัน', 'ใจไม่เคยเปลี่ยนผัน'],
    {
      bpm: 88,
      timeSignature: '4/4',
      sectionType: 'chorus',
      minSyllables: chorusBudget88.min,
      maxSyllables: chorusBudget88.max,
      barBudgets: chorusBudget88.barBudgets,
      enforceSyllableBudget: true,
      allowCoupletOrAlternateRhyme: true,
    }
  );
  assert.equal((report.outOfBudgetBars ?? []).length, 0);
  assert.equal(report.passed, true);
});

test('Phase 10.4: 88 BPM AABB & ABAB score 100%, weak mid-line "ไม่" filtered, and repeatedContentWords caught with anchor exemption', () => {
  const budget88 = getSyllableBudgetForBpm(88, '4/4', { sectionType: 'chorus' });

  // Clean AABB at 88 BPM (max 7 > legacy 6 threshold) now achieves 100% continuity
  const aabb88 = validateThaiLyricCouplets(
    ['ยังอุ่นอยู่ในใจ', 'ไม่เคยจางหายไป', 'แม้ไกลคนละทาง', 'ภาพเธอไม่เลือนราง'],
    {
      bpm: 88,
      timeSignature: '4/4',
      sectionType: 'chorus',
      minSyllables: budget88.min,
      maxSyllables: budget88.max,
      barBudgets: budget88.barBudgets,
      allowCoupletOrAlternateRhyme: true,
    }
  );
  assert.equal(aabb88.chainContinuityRatio, 1);
  assert.equal(aabb88.passed, true);

  // ABAB at 88 BPM also passes cleanly
  const abab88 = validateThaiLyricCouplets(
    ['ยังอุ่นอยู่ในใจ', 'แม้ไกลคนละทาง', 'ภาพเธอไม่จางไป', 'รอยยิ้มไม่เลือนราง'],
    {
      bpm: 88,
      timeSignature: '4/4',
      sectionType: 'chorus',
      minSyllables: budget88.min,
      maxSyllables: budget88.max,
      allowCoupletOrAlternateRhyme: true,
    }
  );
  assert.equal(abab88.chainContinuityRatio, 1);
  assert.equal(abab88.passed, true);

  // Flawed live output ("ไม่จาง" repeated & weak "ไม่" filler at idx 2) must be caught cleanly
  const flawedChorus = validateThaiLyricCouplets(
    ['ยังอุ่นอยู่ในใจ', 'รอยยิ้ม  ไม่จางหาย', 'แม้ไกล  คนละทาง', 'ไม่จาง  ภาพวันวาน'],
    {
      bpm: 88,
      timeSignature: '4/4',
      sectionType: 'chorus',
      minSyllables: budget88.min,
      maxSyllables: budget88.max,
      allowCoupletOrAlternateRhyme: true,
    }
  );
  assert.ok((flawedChorus.repeatedContentWords ?? []).includes('จาง'), 'Should detect repeated "จาง" across bars');
  assert.ok(!flawedChorus.matchedPairs.some((p) => p.fromBar === 0 && p.toBar === 1 && p.sharedGroupId === 'ai'));

  // Exempt when word is a locked user motif or Bar 1 <-> Bar 4 intentional earworm echo
  const exemptedAnchor = validateThaiLyricCouplets(
    ['พรำซ้ำในใจ', 'สายพรำร่วงหล่นไป', 'แม้คืนเหน็บหนาว', 'ดวงดาวยังส่องแสง'],
    { ignoredMotifTerms: ['สายพรำ'] }
  );
  assert.ok(!(exemptedAnchor.repeatedContentWords ?? []).includes('พรำ'));

  const earwormAllowed = validateThaiLyricCouplets(
    ['ตะโกนชื่อเธอไป', 'ฟ้าครามกระจ่างตา', 'ลมหนาวยังพัดพา', 'ตะโกนบอกรักเธอ'],
    { allowIntentionalHookMotif: true }
  );
  assert.ok(!(earwormAllowed.repeatedContentWords ?? []).includes('ตะโกน'));

  // selectPrioritySectionsForPolish selects sections with repeatedContentWords even if chain passed
  const picked = selectPrioritySectionsForPolish([
    { item: 'Chorus', sectionType: 'chorus', passed: true, hasDuplicates: false, hasRepeatedContentWords: true },
  ]);
  assert.equal(picked.length, 1);
});

test('Phase 10.5: Non-Destructive Polish Gate & Option B (gemini-3.8-flash polish) protect primary model output', async () => {
  const orig = validateThaiLyricCouplets(
    ['ยังอุ่นอยู่ในใจ', 'รอยยิ้ม  ไม่จางหาย', 'แม้ไกล  คนละทาง', 'ไม่จาง  ภาพวันวาน'],
    { bpm: 88, sectionType: 'chorus' }
  );
  const improved = validateThaiLyricCouplets(
    ['ยังอุ่นอยู่ในใจ', 'ไม่เคยลบเลือนไป', 'แม้ไกลคนละทาง', 'ภาพจำไม่เลือนราง'],
    { bpm: 88, sectionType: 'chorus', allowCoupletOrAlternateRhyme: true }
  );
  const degraded = validateThaiLyricCouplets(
    ['ยังอุ่นอยู่ในใจจนถึงค่ำคืนนี้ยาวนาน', 'ไม่ไหวแล้วตอนนี้ในใจ', 'ร้องไห้ไปในใจ', 'เจ็บช้ำในใจ'],
    { bpm: 88, sectionType: 'chorus', minSyllables: 5, maxSyllables: 7, enforceSyllableBudget: true }
  );

  assert.ok(computeLyricQualityPenalty(improved) < computeLyricQualityPenalty(orig));
  assert.equal(shouldAcceptPolishedSection(orig, improved), true);
  assert.equal(shouldAcceptPolishedSection(orig, degraded), false);

  // Mocked POST /api/advance/architect verifying Option B gemini-3.8-flash model + rejection gate
  const prevKey = process.env.GEMINI_API_KEY;
  const origFetch = globalThis.fetch;
  let capturedPolishModel = '';

  try {
    process.env.GEMINI_API_KEY = 'AIza-phase10-optionb-test-key';
    let callNum = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      callNum += 1;
      const bodyText = await readFetchBodyText(input, init);
      if (callNum === 1) {
        return new Response(
          JSON.stringify({
            id: 'p10_arch_1',
            object: 'interaction',
            model: 'gemini-4-hydrogen',
            status: 'completed',
            steps: [
              {
                type: 'model_output',
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      title: 'วันฝนพรำ',
                      bpm: 88,
                      baseKey: 'D',
                      capoFret: 2,
                      timeSignature: '4/4',
                      sections: [
                        { name: 'Intro', type: 'intro', intensity: 'low', bars: [{ chords: ['D'], lyrics: '' }, { chords: ['A'], lyrics: '' }] },
                        {
                          name: 'Chorus',
                          type: 'chorus',
                          intensity: 'high',
                          bars: [
                            { chords: ['D'], lyrics: 'ยังอุ่นอยู่ในใจ' },
                            { chords: ['A'], lyrics: 'รอยยิ้ม  ไม่จางหาย' },
                            { chords: ['Bm'], lyrics: 'แม้ไกล  คนละทาง' },
                            { chords: ['G'], lyrics: 'ไม่จาง  ภาพวันวาน' },
                          ],
                        },
                      ],
                    }),
                  },
                ],
              },
            ],
            usage: { total_input_tokens: 300, total_output_tokens: 200, total_tokens: 500 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const parsed = JSON.parse(bodyText) as { model?: string };
      capturedPolishModel = parsed.model || '';
      // Return a WORSE regression (all duplicate 'ใจ' + bloated bar) to verify Non-Destructive Gate rejects it
      return new Response(
        JSON.stringify({
          id: 'p10_polish_reject',
          object: 'interaction',
          model: 'gemini-3.8-flash',
          status: 'completed',
          steps: [
            {
              type: 'model_output',
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    polishedSections: [
                      {
                        sectionName: 'Chorus',
                        lines: [
                          'ยังอุ่นอยู่ในใจ',
                          'คิดถึงเธอแทบขาดใจในคืนนี้ยาวนาน',
                          'มีแค่เธอในใจ',
                          'เก็บไว้ในใจ',
                        ],
                      },
                    ],
                  }),
                },
              ],
            },
          ],
          usage: { total_input_tokens: 100, total_output_tokens: 80, total_tokens: 180 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const res = await architectPost(
      new Request('http://localhost/api/advance/architect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stylePreset: 'warm-acoustic',
          vocalProfile: 'female',
          tempoFeel: 'medium',
          topic: 'ความทรงจำในร้านกาแฟ',
          language: 'th',
        }),
      })
    );
    assert.equal(res.status, 200);
    assert.equal(capturedPolishModel, 'gemini-3.8-flash');

    const json = (await res.json()) as {
      rhymeValidation: { polished: boolean };
      song: { sections: Array<{ name: string; bars: Array<{ lyrics: string }> }> };
    };
    assert.equal(json.rhymeValidation.polished, false, 'Degraded polish result must be rejected by gate');
    const chorus = json.song.sections.find((s) => s.name === 'Chorus')!;
    assert.equal(chorus.bars[1].lyrics, 'รอยยิ้ม  ไม่จางหาย');
    assert.equal(chorus.bars[3].lyrics, 'ไม่จาง  ภาพวันวาน');
  } finally {
    globalThis.fetch = origFetch;
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
    else delete process.env.GEMINI_API_KEY;
  }
});

test('Phase 10.6: Frontend HUD parity (SectionBuilder) & token breakdown UI (EasyModeStarterModal)', () => {
  const root = process.cwd();
  const sectionSrc = fs.readFileSync(path.join(root, 'src/components/SectionBuilder.tsx'), 'utf8');
  const easySrc = fs.readFileSync(path.join(root, 'src/components/EasyModeStarterModal.tsx'), 'utf8');

  assert.match(sectionSrc, /validateThaiLyricCouplets\([\s\S]*allowCoupletOrAlternateRhyme:\s*true/);
  assert.match(sectionSrc, /validateThaiLyricCouplets\([\s\S]*barBudgets:\s*sectionBudget\.barBudgets/);
  assert.match(easySrc, /inputTokens\?:\s*number/);
  assert.match(easySrc, /thoughtTokens\?:\s*number/);
  assert.match(easySrc, /rhymeValidation\?\.polished/);
});
