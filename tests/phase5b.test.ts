/**
 * Phase 5B Verification Suite
 * ครอบคลุม: Whole-Song AI Architect (/api/advance/architect 4 Cr), Safe Enum Clamping & Producer Guards,
 * Thai Couplet Rhyme Validator + Max-1 Polish Pass, Deep Lyrics+Melody Mode (/api/advance/lyrics 2 Cr),
 * Free 0-Credit Band Density Presets & Lyric Auto-Splitter, และ Phase 5B UI Wiring Contracts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  EASY_STYLE_PRESETS,
  applyBandDensityToSong,
  buildSimulatedArchitectSong,
  clampMelodyNotesForBar,
  sanitizeArchitectSongProject,
  type EasyArchitectInput,
} from '../src/lib/songArchitect';
import {
  getRhymeGroupIdForWord,
  validateThaiLyricCouplets,
} from '../src/lib/thaiRhymeHelper';
import { splitLyricsToSectionBars } from '../src/lib/sectionUtils';
import { POST as architectPost } from '../src/app/api/advance/architect/route';
import { POST as lyricsPost } from '../src/app/api/advance/lyrics/route';
import { CREDIT_COST_TABLE } from '../src/lib/creditManager';
import type { SongBar } from '../src/types/song';

const SAMPLE_EASY_INPUT: EasyArchitectInput = {
  stylePreset: 'warm-acoustic',
  vocalProfile: 'female',
  tempoFeel: 'medium',
  topic: 'กาแฟอุ่นๆ ยามเช้าและหน้าต่างบานเดิม',
  language: 'th',
};

// ───────────────────────── 1. Safe Enum Clamping & Producer Guards ─────────────────────────

test('songArchitect: sanitizeArchitectSongProject clamps invalid enums, out-of-range BPM/Capo, chords, notes & keeps verse lead off', () => {
  assert.equal(EASY_STYLE_PRESETS.length >= 5, true);

  const clampedNotes = clampMelodyNotesForBar([
    { step: 0, midiPitch: 64, durationSteps: 2 },
    { step: 99, midiPitch: 120, durationSteps: 30 }, // step clamped to 15, pitch clamped to 84, duration clamped to 16
    { step: -5, midiPitch: 12, durationSteps: 2 },  // step clamped to 0, midiPitch clamped to 45 (note: 5 -> 45 in clampInt, check behavior)
  ]);
  assert.equal(clampedNotes.length, 3);
  assert.ok(clampedNotes.every((n) => n.step >= 0 && n.step <= 15));
  assert.ok(clampedNotes.every((n) => n.midiPitch >= 45 && n.midiPitch <= 84));
  assert.ok(clampedNotes.every((n) => n.durationSteps >= 1 && n.durationSteps <= 16));

  const dirtyPayload = {
    title: '  เพลงทดสอบ Enum Guard  ',
    bpm: 999,
    baseKey: 'NOT_A_KEY',
    capoFret: 99,
    timeSignature: '11/8',
    guitarModel: 'stratocaster-999',
    stringGauge: 'steel-100',
    ambience3D: 'football-stadium',
    sections: [
      {
        name: 'Intro Test',
        type: 'intro',
        intensity: 'extreme',
        instruments: { guitarRhythm: true, drumsStyle: 'double-kick' },
        bars: [{ chords: ['INVALID_CHORD'], playStyle: 'shred', lyrics: '' }],
      },
      {
        name: 'Verse Test',
        type: 'verse',
        intensity: 'low',
        instruments: {
          guitarRhythm: true,
          guitarLead: true, // Producer Guard MUST force false on Verse
          guitarLeadVolume: 250,
          drumsStyle: 'metal-blast',
        },
        bars: [
          {
            chords: ['C', 'G'],
            lyrics: 'แสงแดดอุ่นตอนเช้า',
            melodyNotes: [{ step: 0, midiPitch: 5, durationSteps: 2 }],
          },
          {
            chords: ['BAD_CHORD'],
            lyrics: 'เงาริมหน้าต่างใส',
          },
        ],
      },
    ],
  };

  const clean = sanitizeArchitectSongProject(dirtyPayload, SAMPLE_EASY_INPUT);
  assert.equal(clean.bpm, 160);
  assert.equal(clean.capoFret, 7);
  assert.equal(clean.baseKey, 'G'); // female vocal fallback key
  assert.equal(clean.timeSignature, '4/4');
  assert.equal(clean.guitarModel, 'classical-nylon');
  assert.equal(clean.ambience3D, 'living-room');
  assert.equal(clean.statusTag, 'draft');
  assert.equal(clean.easyConfig?.stylePreset, 'warm-acoustic');

  const verse = clean.sections.find((s) => s.type === 'verse');
  assert.ok(verse, 'Expected verse section');
  assert.equal(verse.instruments.guitarLead, false, 'Verse must silence guitarLead for vocal pocket');
  assert.equal(verse.instruments.guitarLeadVolume, 100);
  assert.equal(verse.instruments.drumsStyle, 'off');
  assert.equal(verse.bars[0].chordsPerBar, 2);
  assert.deepEqual(verse.bars[0].chords, ['C', 'G']);
  assert.equal(verse.bars[0].melodyNotes[0].midiPitch, 45);
  assert.equal(verse.bars[1].chords[0], 'G'); // fallback from warm-acoustic preset defaultChords[1]
});

// ───────────────────────── 2. Band Density Presets (0 Credits) ─────────────────────────

test('songArchitect: applyBandDensityToSong transforms unplugged / balanced / full cleanly with zero credits', () => {
  const baseSong = buildSimulatedArchitectSong(SAMPLE_EASY_INPUT);

  const unplugged = applyBandDensityToSong(baseSong, 'unplugged');
  assert.equal(unplugged.mixer.bass.enabled, false);
  assert.equal(unplugged.mixer.piano.enabled, false);
  assert.equal(unplugged.mixer.drums.enabled, false);
  assert.equal(unplugged.mixer.drums.style, 'off');
  assert.ok(
    unplugged.sections.every((s) => !s.instruments.bass && !s.instruments.drums && !s.instruments.piano)
  );

  const full = applyBandDensityToSong(baseSong, 'full');
  assert.equal(full.mixer.bass.enabled, true);
  assert.equal(full.mixer.piano.enabled, true);
  assert.equal(full.mixer.drums.enabled, true);
  assert.equal(full.mixer.drums.style, 'simple-kit');
  assert.equal(full.mixer.guitarLead.enabled, true);
  const chorus = full.sections.find((s) => s.type === 'chorus');
  assert.ok(chorus);
  assert.equal(chorus.intensity, 'high');
  assert.equal(chorus.instruments.drumsStyle, 'simple-kit');
  assert.equal(chorus.instruments.guitarLead, true);
});

// ───────────────────────── 3. Thai Rhyme Couplet Validator & Free Lyric Auto-Splitter ─────────────────────────

test('thaiRhymeHelper: validateThaiLyricCouplets checks end-rhyme & end-to-next coupling accurately', () => {
  assert.ok(getRhymeGroupIdForWord('หัวใจ'));

  const rhymed = validateThaiLyricCouplets([
    'แสงแดดอ่อนข้างหน้าต่างใจ',
    'แก้วกาแฟอุ่นวางไว้ใกล้กาย',
    'ลมยามเช้ายังพัดผ่านสบาย',
    'เก็บเรื่องราวของเราไม่จางหาย',
  ]);
  assert.equal(rhymed.passed, true);

  const mismatched = validateThaiLyricCouplets([
    'แสงแดดส่องผ่านหน้าต่างบ้าน',
    'เสียงรถไฟกำลังแล่นผ่านภูเขาสูง',
    'เธอหยิบร่มสีเหลืองเดินไปตลาด',
    'ฝนตกหนักจนเปียกหมดทั้งถนน',
  ]);
  assert.equal(mismatched.passed, false);
});

test('sectionUtils: splitLyricsToSectionBars distributes multiline & slash-separated lyrics while preserving chords, melodyNotes & vocalAudio', () => {
  const existingBars: SongBar[] = [
    {
      id: 'b1',
      chordsPerBar: 1,
      chords: ['C'],
      playStyle: 'normal',
      lyrics: 'เดิม 1',
      melodyNotes: [{ step: 0, midiPitch: 60, durationSteps: 4 }],
      vocalAudio: 'idb://vocal-test-v1',
    },
    {
      id: 'b2',
      chordsPerBar: 2,
      chords: ['G', 'G7'],
      playStyle: 'let-ring',
      lyrics: 'เดิม 2',
      melodyNotes: [{ step: 4, midiPitch: 67, durationSteps: 2 }],
    },
    {
      id: 'b3',
      chordsPerBar: 1,
      chords: ['Am'],
      playStyle: 'normal',
      lyrics: 'เดิม 3',
      melodyNotes: [],
    },
    {
      id: 'b4',
      chordsPerBar: 1,
      chords: ['F'],
      playStyle: 'break',
      lyrics: 'เดิม 4',
      melodyNotes: [],
    },
  ];

  const multiline = splitLyricsToSectionBars(
    'แสงแดดเช้า / ลมเย็นพัด\nฝากดาวน้อย\nรอเธอตรงนี้',
    existingBars
  );
  assert.equal(multiline.length, 4);
  assert.equal(multiline[0].lyrics, 'แสงแดดเช้า');
  assert.equal(multiline[1].lyrics, 'ลมเย็นพัด');
  assert.equal(multiline[2].lyrics, 'ฝากดาวน้อย');
  assert.equal(multiline[3].lyrics, 'รอเธอตรงนี้');

  // Verify zero data loss on existing musical metadata
  assert.equal(multiline[0].vocalAudio, 'idb://vocal-test-v1');
  assert.deepEqual(multiline[0].melodyNotes, existingBars[0].melodyNotes);
  assert.equal(multiline[1].chordsPerBar, 2);
  assert.deepEqual(multiline[1].chords, ['G', 'G7']);
  assert.equal(multiline[1].playStyle, 'let-ring');
  assert.equal(multiline[3].playStyle, 'break');
});

// ───────────────────────── 4. /api/advance/architect & /api/advance/lyrics (Deep Mode) ─────────────────────────

test('/api/advance/architect validates 400, falls back offline cleanly, and runs max-1 Thai rhyme polish pass with mocked Gemini SDK', async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  const origFetch = globalThis.fetch;

  try {
    // 1. Missing topic -> 400
    const badRes = await architectPost(
      new Request('http://localhost/api/advance/architect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stylePreset: 'warm-acoustic', topic: '   ' }),
      })
    );
    assert.equal(badRes.status, 400);

    // 2. Offline simulation without key -> isSimulated: true, full 5-section SongProject
    delete process.env.GEMINI_API_KEY;
    const simRes = await architectPost(
      new Request('http://localhost/api/advance/architect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(SAMPLE_EASY_INPUT),
      })
    );
    assert.equal(simRes.status, 200);
    const simJson = (await simRes.json()) as {
      isSimulated: boolean;
      song: { sections: Array<{ type: string; bars: SongBar[] }> };
    };
    assert.equal(simJson.isSimulated, true);
    assert.equal(simJson.song.sections.length, 5);
    assert.ok(simJson.song.sections.some((s) => s.type === 'chorus'));

    // 3. Mocked live @google/genai response returning unrhymed Thai verse -> triggers EXACTLY 1 polish pass
    process.env.GEMINI_API_KEY = 'AIza-secret-should-not-leak-in-architect-json';
    let geminiCallCount = 0;
    globalThis.fetch = async () => {
      geminiCallCount += 1;
      if (geminiCallCount === 1) {
        return new Response(
          JSON.stringify({
            id: 'v1_arch_1',
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
                      title: 'กาแฟริมหน้าต่าง',
                      bpm: 84,
                      baseKey: 'G',
                      capoFret: 2,
                      timeSignature: '4/4',
                      guitarModel: 'classical-nylon',
                      ambience3D: 'living-room',
                      sections: [
                        {
                          name: 'Intro',
                          type: 'intro',
                          intensity: 'low',
                          bars: [
                            { chords: ['G'], lyrics: '' },
                            { chords: ['D'], lyrics: '' },
                          ],
                        },
                        {
                          name: 'Verse 1',
                          type: 'verse',
                          intensity: 'low',
                          bars: [
                            { chords: ['G'], lyrics: 'แสงแดดส่องข้างหน้าต่างบ้าน' },
                            { chords: ['D'], lyrics: 'เสียงลมเปียกในยามเย็น' },
                            { chords: ['Em'], lyrics: 'ก้อนหินริมฝั่งทะเล' },
                            { chords: ['C'], lyrics: 'ดวงดาวส่องกลางความมืด' },
                          ],
                        },
                        {
                          name: 'Chorus',
                          type: 'chorus',
                          intensity: 'high',
                          bars: [
                            { chords: ['G'], lyrics: 'เก็บไว้ในใจ  เรื่อยมา' },
                            { chords: ['D'], lyrics: 'พายิ้มอบอุ่น  ในใจ' },
                            { chords: ['Em'], lyrics: 'แม้ค่ำคืนเหงา  ไม่ไกล' },
                            { chords: ['C'], lyrics: 'ยังรอขอบฟ้า  พบกัน' },
                          ],
                        },
                      ],
                      producerNotes: ['จัดกรูฟอะคูสติกโปร่งให้ Verse เว้นช่องเสียงร้องชัดเจน'],
                    }),
                  },
                ],
              },
            ],
            usage: { total_input_tokens: 400, total_output_tokens: 300, total_tokens: 700 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Second call: max-1 Rhyme Polish pass via gemini-3.5-flash-lite
      return new Response(
        JSON.stringify({
          id: 'v1_polish_2',
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
                          'แสงแดดอ่อนข้างหน้าต่างใจ',
                          'วางแก้วลงไว้  ใกล้กาย',
                          'ลมอุ่นพัดผ่าน  สบาย',
                          'เก็บภาพของเรา  ไม่หาย',
                        ],
                      },
                    ],
                  }),
                },
              ],
            },
          ],
          usage: { total_input_tokens: 120, total_output_tokens: 80, total_tokens: 200 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const liveRes = await architectPost(
      new Request('http://localhost/api/advance/architect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(SAMPLE_EASY_INPUT),
      })
    );
    assert.equal(liveRes.status, 200);
    assert.equal(geminiCallCount, 2, 'Expected architect call + exactly 1 rhyme polish call');

    const rawText = await liveRes.text();
    assert.ok(!rawText.includes('AIza-secret-should-not-leak-in-architect-json'));

    const liveJson = JSON.parse(rawText) as {
      isSimulated: boolean;
      rhymeValidation: { passed: boolean; polished: boolean };
      usage?: { totalTokens: number };
      song: { sections: Array<{ name: string; bars: SongBar[] }> };
    };
    assert.equal(liveJson.isSimulated, false);
    assert.equal(liveJson.rhymeValidation.polished, true);
    assert.equal(liveJson.rhymeValidation.passed, true);
    assert.equal(liveJson.usage?.totalTokens, 900);
    const verse1 = liveJson.song.sections.find((s) => s.name === 'Verse 1');
    assert.equal(verse1?.bars[0].lyrics, 'แสงแดดอ่อนข้างหน้าต่างใจ');
  } finally {
    globalThis.fetch = origFetch;
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
    else delete process.env.GEMINI_API_KEY;
  }
});

test('/api/advance/lyrics supports mode: deep (2 Credits) returning clamped guide melodyNotesPerBar', async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  const origFetch = globalThis.fetch;

  try {
    // 1. Offline simulation deep mode returns melodyNotesPerBar
    delete process.env.GEMINI_API_KEY;
    const simDeepRes = await lyricsPost(
      new Request('http://localhost/api/advance/lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mood: 'อบอุ่น',
          topic: 'ร้านกาแฟยามเช้า',
          chordProgression: ['C', 'G', 'Am', 'F'],
          sectionType: 'chorus',
          bpm: 88,
          mode: 'deep',
        }),
      })
    );
    assert.equal(simDeepRes.status, 200);
    const simDeepJson = (await simDeepRes.json()) as {
      isSimulated: boolean;
      melodyNotesPerBar?: unknown[][];
    };
    assert.equal(simDeepJson.isSimulated, true);
    assert.equal(simDeepJson.melodyNotesPerBar?.length, 4);

    // 2. Live deep mode clamps returned melodyNotesPerBar safely
    process.env.GEMINI_API_KEY = 'deep-test-key';
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          id: 'v1_lyrics_deep',
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
                    lines: [
                      'แสงแดดอุ่นตอนเช้าปลุกใจ',
                      'แก้วกาแฟวางไว้ข้างกาย',
                      'เดินจับมือเคียงข้างกันไป',
                      'เก็บเรื่องราวดีๆ ไม่หาย',
                    ],
                    rhymeNotes: ['ส่งสัมผัส -ไอ/-าย ต่อเนื่องทุกห้อง'],
                    suggestedChords: ['C', 'G', 'Am', 'F'],
                    melodyNotesPerBar: [
                      [{ step: 0, midiPitch: 120, durationSteps: 40 }],
                      [{ step: 2, midiPitch: 67, durationSteps: 4 }],
                      [{ step: 0, midiPitch: 69, durationSteps: 4 }],
                      [{ step: 0, midiPitch: 65, durationSteps: 4 }],
                    ],
                  }),
                },
              ],
            },
          ],
          usage: { total_input_tokens: 200, total_output_tokens: 150, total_tokens: 350 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );

    const liveDeepRes = await lyricsPost(
      new Request('http://localhost/api/advance/lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mood: 'อบอุ่น',
          topic: 'ร้านกาแฟ',
          chordProgression: ['C', 'G', 'Am', 'F'],
          sectionType: 'chorus',
          bpm: 88,
          mode: 'deep',
        }),
      })
    );
    assert.equal(liveDeepRes.status, 200);
    const liveDeepJson = (await liveDeepRes.json()) as {
      isSimulated: boolean;
      melodyNotesPerBar?: Array<Array<{ step: number; midiPitch: number; durationSteps: number }>>;
    };
    assert.equal(liveDeepJson.isSimulated, false);
    assert.equal(liveDeepJson.melodyNotesPerBar?.length, 4);
    assert.equal(liveDeepJson.melodyNotesPerBar?.[0][0].midiPitch, 84);
    assert.equal(liveDeepJson.melodyNotesPerBar?.[0][0].durationSteps, 16);
  } finally {
    globalThis.fetch = origFetch;
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
    else delete process.env.GEMINI_API_KEY;
  }
});

// ───────────────────────── 5. Phase 5B UI Wiring & Cost Guard Contracts ─────────────────────────

test('Phase 5B UI components wire Easy Mode (4 Cr), Inline AI (1 Cr / 2 Cr / 0 Cr Split), and 4-step workflow strip safely', () => {
  assert.equal(CREDIT_COST_TABLE.aiEasyWholeSong, 4);
  assert.equal(CREDIT_COST_TABLE.aiSectionDeepMelody, 2);

  const root = process.cwd();
  const easyModalSrc = fs.readFileSync(path.join(root, 'src/components/EasyModeStarterModal.tsx'), 'utf8');
  const sectionBuilderSrc = fs.readFileSync(path.join(root, 'src/components/SectionBuilder.tsx'), 'utf8');
  const advanceModalSrc = fs.readFileSync(path.join(root, 'src/components/AdvanceModeModal.tsx'), 'utf8');
  const pageSrc = fs.readFileSync(path.join(root, 'src/app/page.tsx'), 'utf8');

  // EasyModeStarterModal checks: calls /api/advance/architect, deducts ONLY when !data.isSimulated, 3-knob adjusters, Handoff CTA
  assert.match(easyModalSrc, /\/api\/advance\/architect/);
  assert.match(easyModalSrc, /if \(!data\.isSimulated\)/);
  assert.match(easyModalSrc, /applyBandDensityToSong/);
  assert.match(easyModalSrc, /EASY_WHOLE_SONG_COST/);

  // SectionBuilder checks: 4 workflow stage tokens, inline AI popover triggers (1 Cr / 2 Cr / 0 Cr splitLyricsToSectionBars)
  assert.match(sectionBuilderSrc, /splitLyricsToSectionBars/);
  assert.match(sectionBuilderSrc, /stageDraft/);
  assert.match(sectionBuilderSrc, /stageArranged/);
  assert.match(sectionBuilderSrc, /stageVocal/);
  assert.match(sectionBuilderSrc, /stageMastered/);
  assert.match(sectionBuilderSrc, /onOpenInlineAiSection/);

  // AdvanceModeModal checks: supports quick & deep modes + passes melodyNotesPerBar & preserves Uses 1 Credit contract
  assert.match(advanceModalSrc, /aiSectionDeepMelody/);
  assert.match(advanceModalSrc, /melodyNotesPerBar/);
  assert.match(advanceModalSrc, /Uses 1 Credit/);

  // page.tsx mounts EasyModeStarterModal and wires onOpenInlineAiSection
  assert.match(pageSrc, /EasyModeStarterModal/);
  assert.match(pageSrc, /onOpenInlineAiSection/);
});
