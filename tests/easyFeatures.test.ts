import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CREDIT_COST_TABLE,
  getEasyArchitectCreditCost,
} from '../src/lib/creditManager';
import {
  POPULAR_CHORD_FORMULAS,
  resolveChordProgressionFormula,
} from '../src/lib/chordUtils';
import {
  buildSimulatedArchitectSong,
  sanitizeArchitectSongProject,
} from '../src/lib/songArchitect';
import {
  buildEasyArchitectUserPrompt,
  buildCohesivePolishSystemPrompt,
  buildCohesivePolishUserPrompt,
  COHESIVE_POLISH_RESPONSE_SCHEMA,
} from '../src/lib/aiPrompts';
import { POST as cohesivePolishHandler } from '../src/app/api/advance/cohesive-polish/route';
import type { SectionType, SongProject } from '../src/types/song';

test('Feature 1: Credit Manager rates and getEasyArchitectCreditCost helper', () => {
  assert.equal(CREDIT_COST_TABLE.aiEasyWholeSong, 4);
  assert.equal(CREDIT_COST_TABLE.aiEasyMediumSong, 6);
  assert.equal(CREDIT_COST_TABLE.aiEasyExtendedSong, 8);
  assert.equal(CREDIT_COST_TABLE.aiCohesivePolishPartial, 2);
  assert.equal(CREDIT_COST_TABLE.aiCohesivePolishWhole, 3);

  // <= 5 sections -> 4
  assert.equal(getEasyArchitectCreditCost(3), 4);
  assert.equal(getEasyArchitectCreditCost(4), 4);
  assert.equal(getEasyArchitectCreditCost(5), 4);

  // 6–7 sections -> 6
  assert.equal(getEasyArchitectCreditCost(6), 6);
  assert.equal(getEasyArchitectCreditCost(7), 6);

  // 8–9 sections -> 8
  assert.equal(getEasyArchitectCreditCost(8), 8);
  assert.equal(getEasyArchitectCreditCost(9), 8);
});

test('Feature 1: Popular Chord Formulas and key-based auto transposition', () => {
  assert.equal(POPULAR_CHORD_FORMULAS.length, 5);

  // Key C
  const cStandard = resolveChordProgressionFormula('I-V-vi-IV', 'C');
  assert.deepEqual(cStandard, ['C', 'G', 'Am', 'F']);

  const cSad = resolveChordProgressionFormula('I-iii-vi-IV', 'C');
  assert.deepEqual(cSad, ['C', 'Em', 'Am', 'F']);

  const cRoyalRoad = resolveChordProgressionFormula('IV-V-iii-vi', 'C');
  assert.deepEqual(cRoyalRoad, ['F', 'G', 'Em', 'Am']);

  const cNeoCity = resolveChordProgressionFormula('ii7-V7-Imaj7-vi7', 'C');
  assert.deepEqual(cNeoCity, ['Dm7', 'G7', 'Cmaj7', 'Am7']);

  const cAndalusian = resolveChordProgressionFormula('vi-V-IV-III7', 'C');
  assert.deepEqual(cAndalusian, ['Am', 'G', 'F', 'E7']);

  // Key G transposition
  const gStandard = resolveChordProgressionFormula('I-V-vi-IV', 'G');
  assert.deepEqual(gStandard, ['G', 'D', 'Em', 'C']);

  const gRoyalRoad = resolveChordProgressionFormula('IV-V-iii-vi', 'G');
  assert.deepEqual(gRoyalRoad, ['C', 'D', 'Bm', 'Em']);
});

test('Feature 1: buildSimulatedArchitectSong respects customStructure and customChords (up to 9 sections)', () => {
  const customStructure: Array<{ type: SectionType; bars: number; name?: string }> = [
    { type: 'intro', bars: 2, name: 'Intro' },
    { type: 'verse', bars: 4, name: 'Verse 1' },
    { type: 'pre-chorus', bars: 2, name: 'Pre-Chorus' },
    { type: 'chorus', bars: 4, name: 'Chorus 1' },
    { type: 'verse', bars: 4, name: 'Verse 2' },
    { type: 'bridge', bars: 2, name: 'Bridge' },
    { type: 'solo', bars: 4, name: 'Solo' },
    { type: 'chorus', bars: 4, name: 'Chorus 2' },
    { type: 'outro', bars: 2, name: 'Outro' },
  ];

  const customChords = ['D', 'A', 'Bm', 'G'];

  const song = buildSimulatedArchitectSong({
    stylePreset: 'warm-acoustic',
    vocalProfile: 'neutral',
    tempoFeel: 'medium',
    topic: 'การเดินทางของดวงดาว',
    language: 'th',
    customStructure,
    customChords,
  });

  assert.equal(song.sections.length, 9);
  assert.equal(song.sections[0].type, 'intro');
  assert.equal(song.sections[0].bars.length, 2);
  assert.equal(song.sections[1].type, 'verse');
  assert.equal(song.sections[1].bars.length, 4);
  assert.equal(song.sections[5].type, 'bridge');
  assert.equal(song.sections[6].type, 'solo');
  assert.equal(song.sections[8].type, 'outro');

  // Verify chords match customChords
  assert.equal(song.sections[1].bars[0].chords[0], 'D');
  assert.equal(song.sections[1].bars[1].chords[0], 'A');
  assert.equal(song.sections[1].bars[2].chords[0], 'Bm');
  assert.equal(song.sections[1].bars[3].chords[0], 'G');
});

test('Feature 1: sanitizeArchitectSongProject supports up to 9 sections', () => {
  const dummySections = Array.from({ length: 9 }, (_, i) => ({
    name: `Section ${i + 1}`,
    type: i === 0 ? 'intro' : i === 8 ? 'outro' : 'verse',
    intensity: 'medium',
    bars: [
      { chords: ['C'], lyrics: 'คำร้องตัวอย่าง', playStyle: 'normal' },
      { chords: ['G'], lyrics: 'อีกคำร้องหนึ่ง', playStyle: 'normal' },
    ],
  }));

  const sanitized = sanitizeArchitectSongProject(
    {
      title: '9 Section Song',
      bpm: 80,
      baseKey: 'C',
      sections: dummySections,
    },
    {
      stylePreset: 'warm-acoustic',
      vocalProfile: 'male',
      tempoFeel: 'medium',
      topic: 'Nine sections',
      language: 'th',
    }
  );

  assert.equal(sanitized.sections.length, 9);
});

test('Feature 1: buildEasyArchitectUserPrompt includes custom structure and chords constraints', () => {
  const prompt = buildEasyArchitectUserPrompt({
    stylePreset: 'warm-acoustic',
    vocalProfile: 'female',
    tempoFeel: 'medium',
    topic: 'ดวงจันทร์ในคืนหนาว',
    language: 'th',
    recommendedBpm: 85,
    recommendedGuitarModel: 'classical-nylon',
    recommendedAmbience: 'living-room',
    customStructure: [
      { type: 'intro', bars: 2, name: 'Intro' },
      { type: 'verse', bars: 4, name: 'Verse 1' },
      { type: 'chorus', bars: 4, name: 'Chorus' },
      { type: 'verse', bars: 4, name: 'Verse 2' },
      { type: 'chorus', bars: 4, name: 'Chorus' },
      { type: 'outro', bars: 2, name: 'Outro' },
    ],
    chordProgressionPreset: 'IV-V-iii-vi',
  });

  assert.match(prompt, /6 ท่อน/);
  assert.match(prompt, /IV-V-iii-vi/);
  assert.match(prompt, /Verse 1/);
});

test('Feature 2: buildCohesivePolishUserPrompt and schema contracts', () => {
  const sampleSong = buildSimulatedArchitectSong({
    stylePreset: 'warm-acoustic',
    vocalProfile: 'male',
    tempoFeel: 'medium',
    topic: 'เพลงรักริมหาด',
    language: 'th',
  });

  const prompt = buildCohesivePolishUserPrompt({
    song: sampleSong,
    lyricsRetentionPct: 75,
    chordsRetentionPct: 70,
    lockedSectionIds: [sampleSong.sections[0].id],
    rebalanceBand: true,
  });

  const sysPrompt = buildCohesivePolishSystemPrompt({
    thaiGenre: 'thai-pop',
    bpm: 80,
  });

  assert.match(prompt, /75%/);
  assert.match(prompt, /70%/);
  assert.match(prompt, /isLocked/);
  assert.match(sysPrompt, /Whole-Song Cohesive Polish/);
  assert.ok(COHESIVE_POLISH_RESPONSE_SCHEMA.properties);
});

test('Feature 2: POST /api/advance/cohesive-polish with 100/100 retention runs 0 credit local path', async () => {
  const sampleSong = buildSimulatedArchitectSong({
    stylePreset: 'warm-acoustic',
    vocalProfile: 'male',
    tempoFeel: 'medium',
    topic: 'ทางเดินของความฝัน',
    language: 'th',
  });

  const req = new Request('http://localhost:3000/api/advance/cohesive-polish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      song: sampleSong,
      lyricsRetentionPct: 100,
      chordsRetentionPct: 100,
      lockedSectionIds: [sampleSong.sections[0].id],
      rebalanceBand: true,
    }),
  });

  const res = await cohesivePolishHandler(req);
  assert.equal(res.status, 200);

  const data = (await res.json()) as {
    model: string;
    song: SongProject;
    tip: string;
  };

  assert.equal(data.model, 'local-rebalance');
  assert.equal(data.song.sections.length, sampleSong.sections.length);
  assert.match(data.tip, /0 เหรียญ/);
});

test('Feature 2: POST /api/advance/cohesive-polish degrades gracefully in simulated mode without API key', async () => {
  const prevApiKey = process.env.GEMINI_API_KEY;
  const prevBillingMode = process.env.NEXT_PUBLIC_BILLING_MODE;
  delete process.env.GEMINI_API_KEY;
  process.env.NEXT_PUBLIC_BILLING_MODE = 'standalone';

  try {
    const sampleSong = buildSimulatedArchitectSong({
      stylePreset: 'warm-acoustic',
      vocalProfile: 'female',
      tempoFeel: 'slow',
      topic: 'แสงดาวเมื่อวันวาน',
      language: 'th',
    });

    const req = new Request('http://localhost:3000/api/advance/cohesive-polish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        song: sampleSong,
        lyricsRetentionPct: 75,
        chordsRetentionPct: 70,
        lockedSectionIds: [sampleSong.sections[0].id],
        rebalanceBand: true,
      }),
    });

    const res = await cohesivePolishHandler(req);
    assert.equal(res.status, 200);

    const data = (await res.json()) as {
      isSimulated: boolean;
      song: SongProject;
      tip: string;
    };

    assert.equal(data.isSimulated, true);
    assert.equal(data.song.sections[0].id, sampleSong.sections[0].id);
    assert.equal(data.song.sections[0].bars[0].lyrics, sampleSong.sections[0].bars[0].lyrics);
  } finally {
    if (prevApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = prevApiKey;
    }
    if (prevBillingMode === undefined) {
      delete process.env.NEXT_PUBLIC_BILLING_MODE;
    } else {
      process.env.NEXT_PUBLIC_BILLING_MODE = prevBillingMode;
    }
  }
});
