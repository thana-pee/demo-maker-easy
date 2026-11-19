import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ARCHITECT_RESPONSE_SCHEMA,
  MASTER_LYRIC_FEW_SHOT_BANK,
  SONGWRITER_STYLE_PROFILES,
  STORY_ARC_PRESETS,
  THAI_GENRE_PROFILES,
  buildStoryBlueprintPromptBlock,
  computeBarDurationSec,
  getSyllableBudgetForBpm,
} from '../src/lib/aiPrompts';
import {
  buildSimulatedArchitectSong,
  buildStyledSimulatedSongLyrics,
  sanitizeArchitectSongProject,
} from '../src/lib/songArchitect';
import {
  generateLyricAlignedGuideMelody,
  getRootPitchClass,
  splitThaiLyricPhraseGroups,
} from '../src/lib/melodyUtils';
import {
  segmentThaiWordToSyllables,
  validateThaiLyricCouplets,
} from '../src/lib/thaiRhymeHelper';
import {
  buildSectionTtsTextPlan,
  countThaiEnglishSyllables,
} from '../src/lib/sectionUtils';
import { translations } from '../src/lib/i18n';
import { POST as architectPost } from '../src/app/api/advance/architect/route';
import { POST as lyricsPost } from '../src/app/api/advance/lyrics/route';
import type {
  LyricDensityMode,
  SongBar,
  ThaiEmotionalResolution,
  ThaiSongGenre,
  ThaiSongwriterStyle,
  TimeSignature,
} from '../src/types/song';

function makeBar(lyrics: string, chords = ['C']): SongBar {
  return {
    id: `bar-${Math.random().toString(36).slice(2, 8)}`,
    chordsPerBar: chords.length >= 2 ? 2 : 1,
    chords,
    playStyle: 'normal',
    lyrics,
    melodyNotes: [],
  };
}

// ───────────────────── Test 1: 6-Group Physics Matrix ─────────────────────

test('Phase 9.1: 6-group physics matrix holds across 22 songwriter styles, 3 tempos, 3 time signatures & 3 densities', () => {
  const styles = SONGWRITER_STYLE_PROFILES.map((p) => p.id as ThaiSongwriterStyle);
  const tempos = [70, 94, 118];
  const meters: TimeSignature[] = ['4/4', '3/4', '6/8'];
  const densities: LyricDensityMode[] = ['airy', 'balanced', 'dense'];

  for (const style of styles) {
    for (const bpm of tempos) {
      for (const ts of meters) {
        const expectedBarSec = computeBarDurationSec(bpm, ts);
        const budgetsByDensity: Record<LyricDensityMode, ReturnType<typeof getSyllableBudgetForBpm>> = {
          airy: getSyllableBudgetForBpm(bpm, ts, { songwriterStyle: style, lyricDensity: 'airy' }),
          balanced: getSyllableBudgetForBpm(bpm, ts, { songwriterStyle: style, lyricDensity: 'balanced' }),
          dense: getSyllableBudgetForBpm(bpm, ts, { songwriterStyle: style, lyricDensity: 'dense' }),
        };

        for (const d of densities) {
          const b = budgetsByDensity[d];
          assert.ok(b.min >= 3 && b.min <= b.max, `Invalid bounds for ${style} ${bpm} ${ts} ${d}`);
          assert.ok(b.restSteps >= 2, `Expected restSteps >= 2 for ${style} ${bpm} ${ts} ${d}, got ${b.restSteps}`);
          assert.ok(Math.abs(b.barDurationSec - expectedBarSec) < 0.01);
          const rate = b.max / b.barDurationSec;
          assert.ok(
            rate <= b.maxSyllablesPerSec + 0.05,
            `Syllable rate ${rate.toFixed(2)}/s exceeded cap ${b.maxSyllablesPerSec}/s for ${style} @ ${bpm} ${ts} ${d}`
          );
        }

        assert.ok(
          budgetsByDensity.airy.max <= budgetsByDensity.balanced.max,
          `Expected airy <= balanced max for ${style} ${bpm} ${ts}`
        );
        assert.ok(
          budgetsByDensity.balanced.max <= budgetsByDensity.dense.max,
          `Expected balanced <= dense max for ${style} ${bpm} ${ts}`
        );
      }
    }
  }

  // ChordsPerBar === 2 must NOT inflate syllable budget
  const singleChord = getSyllableBudgetForBpm(84, '4/4', { chordsPerBar: 1 });
  const twoChords = getSyllableBudgetForBpm(84, '4/4', { chordsPerBar: 2 });
  assert.equal(twoChords.max, singleChord.max);
  assert.ok(twoChords.guidance.includes('2'));
});

// ───────────────────── Test 2: Few-Shot & Simulated Consistency ─────────────────────

test('Phase 9.2: Every MASTER_LYRIC_FEW_SHOT_BANK line & buildStyledSimulatedSongLyrics branch fits singable budgets & rhymes', () => {
  const extractQuotedOrRaw = (entry: string): string[] => {
    const quoted = [...entry.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    return quoted.length > 0 ? quoted : [entry];
  };

  for (const [groupName, groupMap] of Object.entries(MASTER_LYRIC_FEW_SHOT_BANK)) {
    for (const [key, value] of Object.entries(groupMap as Record<string, unknown>)) {
      const entries = Array.isArray(value)
        ? value
        : value && typeof value === 'object'
          ? Object.values(value).flat()
          : [];
      for (const item of entries) {
        if (typeof item !== 'string') continue;
        for (const line of extractQuotedOrRaw(item)) {
          const sylCount = countThaiEnglishSyllables(line);
          const maxCap = key === 'joey-boy' ? 10 : key === 'the-toys' || key === 'thai-rnb' ? 9 : 7;
          assert.ok(
            sylCount > 0 && sylCount <= maxCap,
            `Few-shot ${groupName}.${key} line "${line}" has ${sylCount} syllables (cap ${maxCap})`
          );
        }
      }
    }
  }

  // Check all 22 songwriters + 7 genres + 5 emotional resolutions in simulation mode
  for (const w of SONGWRITER_STYLE_PROFILES.map((p) => p.id as ThaiSongwriterStyle)) {
    const bundle = buildStyledSimulatedSongLyrics({
      topic: 'แสงดาวคืนเหงา',
      mood: 'warm',
      language: 'th',
      songwriterStyle: w,
    });
    const isGroup6 = w === 'joey-boy' || w === 'the-toys';
    const maxCap = w === 'joey-boy' ? 9 : isGroup6 ? 7 : 6;

    for (const line of bundle.verse) {
      assert.ok(countThaiEnglishSyllables(line) <= maxCap, `Sim verse over for ${w}: "${line}"`);
    }
    for (const line of bundle.outro) {
      assert.ok(countThaiEnglishSyllables(line) <= 5, `Sim outro over for ${w}: "${line}"`);
    }
    assert.equal(
      validateThaiLyricCouplets(bundle.verse.slice(0, 4), { bpm: 84 }).passed,
      true,
      `Verse rhyme should pass for ${w}`
    );
    assert.equal(
      validateThaiLyricCouplets(bundle.chorus.slice(0, 4), { bpm: 84, sectionType: 'chorus' }).passed,
      true,
      `Chorus rhyme should pass for ${w}`
    );
    assert.equal(
      validateThaiLyricCouplets(bundle.outro.slice(0, 2), { bpm: 84, sectionType: 'outro' }).passed,
      true,
      `Outro rhyme should pass for ${w}`
    );
  }

  for (const g of THAI_GENRE_PROFILES) {
    const bundle = buildStyledSimulatedSongLyrics({
      topic: 'วันเก่า',
      language: 'th',
      thaiGenre: g.id as ThaiSongGenre,
    });
    const maxCap = g.id === 'thai-rnb' ? 7 : 6;
    assert.ok(bundle.verse.slice(0, 4).every((l) => countThaiEnglishSyllables(l) <= maxCap));
    assert.equal(validateThaiLyricCouplets(bundle.outro, { sectionType: 'outro', bpm: 84 }).passed, true);
  }

  for (const res of ['piercing-sting', 'fulfilling-warm', 'empowering-anthem', 'catchy-earworm', 'nostalgic-fade'] as ThaiEmotionalResolution[]) {
    const bundle = buildStyledSimulatedSongLyrics({ language: 'th', emotionalResolution: res });
    assert.ok(bundle.outro.every((l) => countThaiEnglishSyllables(l) <= 5));
    assert.equal(validateThaiLyricCouplets(bundle.outro, { sectionType: 'outro', bpm: 84 }).passed, true);
  }
});

// ───────────────────── Test 3: Melody Breath & Rest Invariants ─────────────────────

test('Phase 9.3: generateLyricAlignedGuideMelody enforces trailing rest, phrase-group split, mid-bar pause & outro root hold', () => {
  // Phrase group splitting keeps natural whitespace phrasing intact
  const groups = splitThaiLyricPhraseGroups('รักเท่าไร  ก็แพ้');
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0], ['รัก', 'เท่า', 'ไร']);
  assert.deepEqual(groups[1], ['ก็', 'แพ้']);

  // Verify 4, 6, 8, 10 syllables never collide with trailing breath rest
  const cases: Array<{ lyrics: string; writer: ThaiSongwriterStyle; ts: TimeSignature; sectionType?: 'verse' | 'outro' }> = [
    { lyrics: 'มองดาว  ในคืน', writer: 'dee-nitipong', ts: '4/4' },
    { lyrics: 'เก็บความจำ  ไม่จาง', writer: 'none', ts: '3/4', sectionType: 'outro' },
    { lyrics: 'แสงนีออน  กระจกใส  คืนเหงา', writer: 'the-toys', ts: '4/4' },
    { lyrics: 'หยิบมือถือขึ้นทักไปเลย  ส่งใจไปในคืนนี้', writer: 'joey-boy', ts: '4/4' },
    { lyrics: 'ฝากลมอ้อน  ฟ้าไกล', writer: 'sala-khunawut', ts: '6/8', sectionType: 'outro' },
  ];

  for (const c of cases) {
    const totalSteps = c.ts === '4/4' ? 16 : 12;
    const notes = generateLyricAlignedGuideMelody({
      lyrics: c.lyrics,
      chord1: 'D',
      baseKey: 'D',
      bpm: 88,
      timeSignature: c.ts,
      songwriterStyle: c.writer,
      sectionType: c.sectionType ?? 'verse',
    });
    assert.ok(notes.length >= 3);
    const last = notes[notes.length - 1];
    assert.ok(
      last.step + last.durationSteps <= totalSteps - 2,
      `Trailing breath rest violated for "${c.lyrics}" (${c.ts}): ended at ${last.step + last.durationSteps}/${totalSteps}`
    );

    if (c.sectionType === 'outro') {
      assert.equal(last.midiPitch % 12, getRootPitchClass('D'), 'Outro last note must resolve on root pitch class');
      assert.ok(last.durationSteps >= 3, `Expected outro hold >= 3 steps, got ${last.durationSteps}`);
    }
  }

  // Group 1 final note must NOT sustain over the mid-bar breath gap into Group 2 start
  const phrasedNotes = generateLyricAlignedGuideMelody({
    lyrics: 'รักเท่าไร  ก็แพ้',
    chord1: 'C',
    baseKey: 'C',
    bpm: 84,
    timeSignature: '4/4',
    songwriterStyle: 'dee-nitipong',
    restSteps: 3,
    midBarRestSteps: 2,
  });
  const group1LastNote = phrasedNotes[2]; // 3rd syllable ('ไร')
  const group2FirstNote = phrasedNotes[3]; // 4th syllable ('ก็')
  assert.ok(
    group1LastNote.step + group1LastNote.durationSteps <= group2FirstNote.step - 1,
    `Group 1 final note (${group1LastNote.step}+${group1LastNote.durationSteps}) overlapped mid-bar breath before Group 2 (${group2FirstNote.step})`
  );
});

// ───────────────────── Test 4: 3/4 & 6/8 + Key + Register Fixes ─────────────────────

test('Phase 9.4: sanitizeArchitectSongProject fixes 3/4 & 6/8 step-11 pileup, preserves baseKey & separates female/male registers', () => {
  for (const ts of ['3/4', '6/8'] as const) {
    const raw = {
      title: 'Waltz Key D',
      bpm: 80,
      baseKey: 'D',
      timeSignature: ts,
      sections: [
        { name: 'Intro', type: 'intro', bars: [{ chords: ['D'], lyrics: '' }, { chords: ['A'], lyrics: '' }] },
        {
          name: 'Verse',
          type: 'verse',
          bars: [
            {
              chords: ['D'],
              lyrics: 'มองดาวไกล  กลางคืนหนาว',
              melodyNotes: [
                { step: 0, midiPitch: 62, durationSteps: 2 },
                { step: 13, midiPitch: 66, durationSteps: 3 },
                { step: 15, midiPitch: 69, durationSteps: 1 },
              ],
            },
            { chords: ['Bm'], lyrics: 'ใจยังคอย  ไม่จางหาย' },
          ],
        },
        {
          name: 'Chorus',
          type: 'chorus',
          bars: [
            { chords: ['G'], lyrics: 'รักเท่าไร  ก็แพ้' },
            { chords: ['A'], lyrics: 'แม้ทุ่มเท  ทั้งใจ' },
          ],
        },
      ],
    };

    const femaleSong = sanitizeArchitectSongProject(raw, {
      stylePreset: 'warm-acoustic',
      vocalProfile: 'female',
      tempoFeel: 'slow',
      topic: 'ดาว',
      language: 'th',
    });
    const maleSong = sanitizeArchitectSongProject(raw, {
      stylePreset: 'warm-acoustic',
      vocalProfile: 'male',
      tempoFeel: 'slow',
      topic: 'ดาว',
      language: 'th',
    });

    assert.equal(femaleSong.baseKey, 'D');
    assert.equal(femaleSong.timeSignature, ts);
    const notesF = femaleSong.sections[1].bars[0].melodyNotes;
    const notesM = maleSong.sections[1].bars[0].melodyNotes;

    assert.ok(notesF.every((n) => n.step >= 0 && n.step <= 10 && n.step + n.durationSteps <= 10));
    assert.equal(notesF.filter((n) => n.step === 11).length, 0);
    const avgF = notesF.reduce((sum, n) => sum + n.midiPitch, 0) / notesF.length;
    const avgM = notesM.reduce((sum, n) => sum + n.midiPitch, 0) / notesM.length;
    assert.ok(avgF > avgM + 4, `Expected female avg pitch (${avgF.toFixed(1)}) > male (${avgM.toFixed(1)})`);
  }

  // Preserves minor key Em as well
  const sim = buildSimulatedArchitectSong({
    stylePreset: 'sad-ballad',
    vocalProfile: 'female',
    tempoFeel: 'slow',
    topic: 'คืนฝนตก',
    language: 'th',
    lyricDensity: 'airy',
  });
  assert.equal(sim.lyricDensity, 'airy');
  assert.equal(sim.easyConfig?.lyricDensity, 'airy');
});

// ───────────────────── Test 5: Post-Polish Re-Sync, BPM Clamp & Anchor Protection ─────────────────────

test('Phase 9.5: architect & lyrics routes re-sync melodyNotes after polish, clamp BPM, protect exact anchors & auto-trim overflow', async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  const origFetch = globalThis.fetch;

  try {
    process.env.GEMINI_API_KEY = 'AIza-phase9-mock-key-not-live';
    let callIdx = 0;
    globalThis.fetch = async () => {
      callIdx += 1;
      if (callIdx === 1) {
        // Architect returns out-of-range BPM (140 vs recommended 72), openingAnchor & exact hookAnchor + overlong unrhymed Verse
        return new Response(
          JSON.stringify({
            id: 'arch_p9',
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
                      title: 'ฝนริมหน้าต่าง',
                      bpm: 140,
                      baseKey: 'E',
                      capoFret: 0,
                      timeSignature: '4/4',
                      storyBlueprint: {
                        coreTheme: 'คิดถึงคนเก่าในค่ำคืนฝนพรำ',
                        emotionalArcSummary: 'เหงาเริ่มเรื่อง -> ระเบิดความจริง -> ยอมปล่อยวาง',
                        sectionBeats: [
                          { sectionType: 'verse', beatGoal: 'เปิดฉากฝนตกริมหน้าต่าง' },
                          { sectionType: 'chorus', beatGoal: 'ย้ำหมุดหมายรักเธอเท่าเดิม' },
                        ],
                      },
                      sections: [
                        { name: 'Intro', type: 'intro', bars: [{ chords: ['E'], lyrics: '' }, { chords: ['B'], lyrics: '' }] },
                        {
                          name: 'Verse 1',
                          type: 'verse',
                          bars: [
                            { chords: ['E'], lyrics: 'ฝนตกริมหน้าต่างวันนี้ยาวนานเหลือเกินจนใจอ่อนล้า' },
                            { chords: ['B'], lyrics: 'เสียงลมพัดแรงมากเหลือเกิน' },
                            { chords: ['C#m'], lyrics: 'ก้อนหินอยู่ไกลแสนไกล' },
                            { chords: ['A'], lyrics: 'ท้องฟ้าไร้แสงดาวสว่าง' },
                          ],
                        },
                        {
                          name: 'Chorus',
                          type: 'chorus',
                          bars: [
                            { chords: ['E'], lyrics: 'รักเธอเท่าเดิม' },
                            { chords: ['B'], lyrics: 'แม้ต้องยอมปล่อยไปไกลแสนไกลจนสุดขอบฟ้าวันนี้' },
                            { chords: ['C#m'], lyrics: 'เจ็บแค่ไหนไม่เคยหันหนี' },
                            { chords: ['A'], lyrics: 'ยังคงหวังดีเสมอมา' },
                          ],
                        },
                        {
                          name: 'Outro',
                          type: 'outro',
                          bars: [
                            { chords: ['A'], lyrics: 'เก็บคำนี้ไว้  ในใจ' },
                            { chords: ['E'], lyrics: 'ไม่ลืมเลือนหาย' },
                          ],
                        },
                      ],
                    }),
                  },
                ],
              },
            ],
            usage: { total_input_tokens: 300, total_output_tokens: 250, total_tokens: 550 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Polish call: shortens Verse 1 cleanly while trying to drop hookAnchor in Chorus Bar 1
      return new Response(
        JSON.stringify({
          id: 'arch_polish_p9',
          object: 'interaction',
          model: 'gemini-3.5-flash-lite',
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
                        sectionName: 'Verse 1',
                        lines: [
                          'ฝนตกริมหน้าต่าง  ใจหวั่น',
                          'นับคืนวัน  ผ่านไป',
                          'ไกลแค่ไหน  ไม่ลืม',
                          'ซึมความเศร้า  คนเดียว',
                        ],
                      },
                      {
                        sectionName: 'Chorus',
                        lines: [
                          'ลืมเธอไปเลย  สักวัน',
                          'ฝันที่สร้าง  พังลง',
                          'คงเหลือเพียง  เงาจาง',
                          'ว่างในใจ  วันนี้',
                        ],
                      },
                    ],
                  }),
                },
              ],
            },
          ],
          usage: { total_input_tokens: 120, total_output_tokens: 90, total_tokens: 210 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const archRes = await architectPost(
      new Request('http://localhost/api/advance/architect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stylePreset: 'warm-acoustic',
          vocalProfile: 'female',
          tempoFeel: 'slow',
          topic: 'ฝนตกริมหน้าต่างแล้วคิดถึงคนรักเก่า รักเธอเท่าเดิมแต่เดินต่อไม่ไหว',
          language: 'th',
          lyricDensity: 'balanced',
          storyBlueprint: {
            storyArcPreset: 'lonely-to-sting',
            openingAnchor: 'ฝนตกริมหน้าต่าง',
            hookAnchor: 'รักเธอเท่าเดิม',
            hookAnchorMode: 'exact',
          },
        }),
      })
    );

    assert.equal(archRes.status, 200);
    const archJson = (await archRes.json()) as {
      song: {
        bpm: number;
        sections: Array<{ name: string; type: string; bars: SongBar[] }>;
      };
      storyBlueprint?: { coreTheme: string; emotionalArcSummary: string };
      rhymeValidation: { polished: boolean };
    };

    // 1. BPM clamped around warm-acoustic slow (72 +- 8 -> [64, 80])
    assert.ok(archJson.song.bpm >= 64 && archJson.song.bpm <= 80, `Unexpected unclamped BPM ${archJson.song.bpm}`);
    // 2. StoryBlueprint returned
    assert.equal(archJson.storyBlueprint?.coreTheme, 'คิดถึงคนเก่าในค่ำคืนฝนพรำ');
    // 3. Verse 1 openingAnchor survived AND melodyNotes regenerated to match new shortened syllable count (6 syl != stale 16 syl)
    const v1 = archJson.song.sections.find((s) => s.type === 'verse')!;
    assert.ok(v1.bars[0].lyrics.includes('ฝนตกริมหน้าต่าง'));
    const expectedV1Bar0Syls = splitThaiLyricPhraseGroups(v1.bars[0].lyrics).flat().length;
    assert.equal(expectedV1Bar0Syls, 7);
    assert.equal(v1.bars[0].melodyNotes.length, expectedV1Bar0Syls);
    assert.ok(v1.bars[0].melodyNotes[v1.bars[0].melodyNotes.length - 1].step < 14);
    // 4. Exact hookAnchor was NOT deleted when polish tried to rewrite Chorus Bar 1
    const chorus = archJson.song.sections.find((s) => s.type === 'chorus')!;
    assert.ok(chorus.bars[0].lyrics.includes('รักเธอเท่าเดิม'));

    // Now test /api/advance/lyrics 1-pass LITE auto-trim on overflow + sectionAnchorPhrase protection
    let lyricsCallIdx = 0;
    globalThis.fetch = async () => {
      lyricsCallIdx += 1;
      if (lyricsCallIdx === 1) {
        return new Response(
          JSON.stringify({
            id: 'lyr_1',
            object: 'interaction',
            model: 'gemini-3.5-flash-lite',
            status: 'completed',
            steps: [
              {
                type: 'model_output',
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      lines: [
                        'ยังคงจดจำคำนี้ไว้ในหัวใจไม่เคยลืมเลือนตลอดกาล',
                        'นานเท่าไร  ไม่ลืม',
                        'คืนที่ฝน  โปรยปราย',
                        'สายลมพัด  เย็นใจ',
                      ],
                      rhymeNotes: ['คำเป็นท้ายวรรค'],
                      suggestedChords: ['C', 'G', 'Am', 'F'],
                    }),
                  },
                ],
              },
            ],
            usage: { total_input_tokens: 100, total_output_tokens: 80, total_tokens: 180 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          id: 'lyr_trim_2',
          object: 'interaction',
          model: 'gemini-3.5-flash-lite',
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
                        lines: [
                          'จำคำนี้ไว้  ในใจ',
                          'ไม่ลืมเลย  สักวัน',
                          'ฝันข้างกาย  ไม่จาง',
                          'ห่างเพียงตัว  ใกล้ใจ',
                        ],
                      },
                    ],
                  }),
                },
              ],
            },
          ],
          usage: { total_input_tokens: 80, total_output_tokens: 60, total_tokens: 140 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const lyrRes = await lyricsPost(
      new Request('http://localhost/api/advance/lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mood: 'ซึ้ง',
          topic: 'จำคำนี้ไว้',
          chordProgression: ['C', 'G', 'Am', 'F'],
          sectionType: 'verse',
          bpm: 72,
          timeSignature: '4/4',
          barCount: 4,
          lyricDensity: 'balanced',
          sectionAnchorPhrase: 'จำคำนี้ไว้',
        }),
      })
    );
    assert.equal(lyrRes.status, 200);
    assert.equal(lyricsCallIdx, 2, 'Expected overflowing bar to trigger 1-pass LITE auto-trim');
    const lyrJson = (await lyrRes.json()) as {
      lines: Array<{ text: string; syllables: number }>;
    };
    assert.ok(lyrJson.lines[0].text.includes('จำคำนี้ไว้'));
    assert.ok(lyrJson.lines[0].syllables <= 6);
  } finally {
    globalThis.fetch = origFetch;
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
    else delete process.env.GEMINI_API_KEY;
  }
});

// ───────────────────── Test 6: Story Blueprint Schema, Thai Syllables, AudioTrim & UI Contracts ─────────────────────

test('Phase 9.6: ARCHITECT_RESPONSE_SCHEMA puts storyBlueprint first, Thai syllable counter fixes hold, TTS separates by newline & i18n is symmetrical', () => {
  const schemaProps = ARCHITECT_RESPONSE_SCHEMA.properties as Record<string, unknown>;
  const propKeys = Object.keys(schemaProps);
  const sbIndex = propKeys.indexOf('storyBlueprint');
  const secIndex = propKeys.indexOf('sections');
  assert.ok(sbIndex >= 0 && secIndex > sbIndex, 'storyBlueprint must appear BEFORE sections in schema');

  // Verify Thai syllabification & syllable count fixes
  assert.equal(countThaiEnglishSyllables('ธรรมดา'), 3);
  assert.equal(countThaiEnglishSyllables('ธรรมชาติ'), 3);
  assert.equal(countThaiEnglishSyllables('สบายใจ'), 3);
  assert.equal(countThaiEnglishSyllables('ความทรงจำ'), 3);
  assert.equal(countThaiEnglishSyllables('เพชร'), 1);
  assert.equal(countThaiEnglishSyllables('แสงไฟนีออนส่องสะท้อนกระจกห้องเดิมยามค่ำคืน'), 14);
  assert.deepEqual(segmentThaiWordToSyllables('สบายใจ'), ['ส', 'บาย', 'ใจ']);
  assert.deepEqual(segmentThaiWordToSyllables('ความทรงจำ'), ['ความ', 'ทรง', 'จำ']);

  // Story blueprint prompt block + presets
  assert.equal(STORY_ARC_PRESETS.length, 6);
  const block = buildStoryBlueprintPromptBlock({
    storyArcPreset: 'lonely-to-sting',
    openingAnchor: 'ฝนตกริมหน้าต่าง',
    hookAnchor: 'รักเธอเท่าเดิม',
    hookAnchorMode: 'exact',
  });
  assert.ok(block.some((l) => l.includes('Scene Distribution')));
  assert.ok(block.some((l) => l.includes('รักเธอเท่าเดิม')));

  // Default TTS separator is newline '\n'
  const ttsPlan = buildSectionTtsTextPlan([makeBar('คำแรก'), makeBar('คำสอง')], 240);
  assert.equal(ttsPlan.text, 'คำแรก\nคำสอง');

  // Bilingual i18n keys must remain strictly symmetrical
  assert.deepEqual(Object.keys(translations.th).sort(), Object.keys(translations.en).sort());

  // Phase 9 audioTrim & UI breath/pacing contracts present in source
  const root = process.cwd();
  const audioTrimSrc = fs.readFileSync(path.join(root, 'src/lib/audioTrim.ts'), 'utf8');
  assert.match(audioTrimSrc, /Math\.min\(0\.45,\s*Math\.max\(0\.22,\s*barSec \* 0\.16\)\)/);
  assert.match(audioTrimSrc, /keepPauseMs:\s*120/);
  assert.match(audioTrimSrc, /maxSpeedRatio:\s*1\.18/);

  const teleprompterSrc = fs.readFileSync(path.join(root, 'src/components/KaraokeTeleprompter.tsx'), 'utf8');
  assert.match(teleprompterSrc, /split\(\/\\s\{2,\}\/\)/);

  const sectionBuilderSrc = fs.readFileSync(path.join(root, 'src/components/SectionBuilder.tsx'), 'utf8');
  assert.match(sectionBuilderSrc, /pacingSyllablesPerSec/);
});
