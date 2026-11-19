import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  HUM_TO_SONG_RESPONSE_SCHEMA,
  RHYME_POLISH_RESPONSE_SCHEMA,
  buildCohesivePolishSystemPrompt,
  buildDirectorSystemPrompt,
  buildEasyArchitectSystemPrompt,
  buildEasyArchitectUserPrompt,
  buildHumToSongSystemPrompt,
  buildRhymePolishPrompt,
  getSyllableBudgetForBpm,
} from '../src/lib/aiPrompts';
import { sanitizeArchitectSongProject, type EasyArchitectInput } from '../src/lib/songArchitect';
import { createDefaultSong } from '../src/lib/defaultSong';
import { POST as architectPost } from '../src/app/api/advance/architect/route';
import { POST as cohesivePolishPost } from '../src/app/api/advance/cohesive-polish/route';
import type { SongProject } from '../src/types/song';

async function readFetchReqInfo(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<{ url: string; method: string; bodyText: string }> {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof Request
        ? input.url
        : input.toString();
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
  let bodyText = '';
  if (typeof init?.body === 'string') {
    bodyText = init.body;
  } else if (input instanceof Request && method !== 'GET' && method !== 'HEAD') {
    bodyText = await input.clone().text();
  }
  return { url, method, bodyText };
}

function collectForbiddenSchemaKeys(
  node: unknown,
  currentPath = 'root',
  depth = 0
): string[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) {
    return node.flatMap((item, idx) =>
      collectForbiddenSchemaKeys(item, `${currentPath}[${idx}]`, depth + 1)
    );
  }
  const obj = node as Record<string, unknown>;
  const hits: string[] = [];
  if ('minimum' in obj) hits.push(`${currentPath}.minimum`);
  if ('maximum' in obj) hits.push(`${currentPath}.maximum`);
  if (depth >= 2) {
    if ('minItems' in obj) hits.push(`${currentPath}.minItems`);
    if ('maxItems' in obj) hits.push(`${currentPath}.maxItems`);
  }
  for (const [key, val] of Object.entries(obj)) {
    if (key === 'properties' && val && typeof val === 'object') {
      for (const [propName, propSchema] of Object.entries(val as Record<string, unknown>)) {
        hits.push(...collectForbiddenSchemaKeys(propSchema, `${currentPath}.${propName}`, depth + 1));
      }
    } else {
      hits.push(...collectForbiddenSchemaKeys(val, `${currentPath}.${key}`, depth));
    }
  }
  return hits;
}

// ───────── 1. Hum-to-Song 16-Step Prompts & Schema + Sanitizer Clamping ─────────

test('Phase 8B.1: Hum-to-Song uses 16-step 4/4 & 12-step 3/4-6/8 grid, aligned playStyle & array producerNotes', () => {
  const humSys = buildHumToSongSystemPrompt();
  assert.match(humSys, /0-15 สำหรับ 4\/4/);
  assert.match(humSys, /0-11 สำหรับ 3\/4 หรือ 6\/8/);
  assert.match(humSys, /durationSteps \(1-16\)/);

  const schemaProps = HUM_TO_SONG_RESPONSE_SCHEMA.properties as Record<string, unknown>;
  const sectionsSchema = schemaProps.sections as {
    items?: {
      properties?: {
        bars?: {
          items?: {
            properties?: {
              playStyle?: { enum?: string[] };
            };
          };
        };
      };
    };
  };
  const playStyleEnum =
    sectionsSchema.items?.properties?.bars?.items?.properties?.playStyle?.enum ?? [];
  assert.deepEqual(playStyleEnum, ['normal', 'let-ring', 'break']);

  const producerNotesSchema = schemaProps.producerNotes as {
    type?: string;
    items?: { type?: string };
  };
  assert.equal(producerNotesSchema.type, 'array');
  assert.equal(producerNotesSchema.items?.type, 'string');

  // Ensure no nested minItems/maxItems or minimum/maximum in HUM_TO_SONG & RHYME_POLISH schemas
  assert.deepEqual(collectForbiddenSchemaKeys(HUM_TO_SONG_RESPONSE_SCHEMA), []);
  assert.deepEqual(collectForbiddenSchemaKeys(RHYME_POLISH_RESPONSE_SCHEMA), []);
});

test('Phase 8B.2: sanitizeArchitectSongProject clamps melodyNotes cleanly across 4/4 (0..15) and 3/4-6/8 (0..11)', () => {
  const input: EasyArchitectInput = {
    stylePreset: 'warm-acoustic',
    vocalProfile: 'neutral',
    tempoFeel: 'medium',
    topic: 'ทดสอบเมโลดี้',
    language: 'th',
  };

  // 4/4 supports both 0..7 and 0..15 safely without exceeding 16 total steps
  const song44 = sanitizeArchitectSongProject(
    {
      title: 'Hum 4/4',
      bpm: 90,
      baseKey: 'C',
      timeSignature: '4/4',
      sections: [
        {
          type: 'verse',
          name: 'Verse',
          intensity: 'low',
          bars: [
            {
              chords: ['C'],
              lyrics: 'ทดสอบจังหวะสี่',
              melodyNotes: [
                { step: 2, midiPitch: 64, durationSteps: 4 },
                { step: 14, midiPitch: 67, durationSteps: 6 },
              ],
            },
            {
              chords: ['G'],
              lyrics: 'ลองฮัมเบาเบา',
              melodyNotes: [{ step: 7, midiPitch: 62, durationSteps: 4 }],
            },
          ],
        },
        {
          type: 'chorus',
          name: 'Chorus',
          intensity: 'high',
          bars: [
            { chords: ['Am'], lyrics: 'ท่อนฮุคสี่สี่' },
            { chords: ['F'], lyrics: 'ส่งท้ายพอดี' },
          ],
        },
      ],
    },
    input
  );
  const v44Notes = song44.sections[0].bars[0].melodyNotes;
  assert.equal(v44Notes[0].step, 2);
  assert.equal(v44Notes[0].durationSteps, 4);
  assert.equal(v44Notes[1].step, 14);
  assert.equal(v44Notes[1].durationSteps, 2); // 16 - 14 = 2 max duration

  // 3/4 and 6/8 re-synthesize cleanly into 0..11 with breath rest when AI notes exceed 12 steps (no step-11 pileup!)
  for (const ts of ['3/4', '6/8'] as const) {
    const songCompound = sanitizeArchitectSongProject(
      {
        title: `Hum ${ts}`,
        bpm: 84,
        baseKey: 'G',
        timeSignature: ts,
        sections: [
          {
            type: 'verse',
            name: 'Verse',
            intensity: 'low',
            bars: [
              {
                chords: ['G'],
                lyrics: 'จังหวะวอลทซ์',
                melodyNotes: [
                  { step: 10, midiPitch: 67, durationSteps: 8 },
                  { step: 15, midiPitch: 69, durationSteps: 4 },
                ],
              },
              { chords: ['D'], lyrics: 'หมุนไปเบาเบา' },
            ],
          },
          {
            type: 'chorus',
            name: 'Chorus',
            intensity: 'high',
            bars: [
              { chords: ['Em'], lyrics: 'คิดถึงวันวาน' },
              { chords: ['C'], lyrics: 'ไม่ลืมเลือนหาย' },
            ],
          },
        ],
      },
      input
    );
    const notes = songCompound.sections[0].bars[0].melodyNotes;
    assert.ok(notes.length >= 2);
    assert.ok(notes.every((n) => n.step >= 0 && n.step <= 11));
    assert.ok(notes.every((n) => n.step + n.durationSteps <= 10));
    assert.equal(notes.filter((n) => n.step === 11).length, 0);
  }
});

// ───────── 2. Dynamic Syllable Budgets, Non-Conflicting Melody Prompt & Director Phase 7C Enums ─────────

test('Phase 8B.3: Architect/Cohesive prompts use dynamic syllable budgets, drop conflicting melodyNotes instruction & Director lists Phase 7C styles', () => {
  const budgetSlow74 = getSyllableBudgetForBpm(74, '4/4');
  assert.ok(budgetSlow74.guidance.includes('4-6 พยางค์'));

  const archSysRock = buildEasyArchitectSystemPrompt({
    bpm: 120,
    timeSignature: '4/4',
    songwriterStyle: 'aed-carabao',
    thaiGenre: 'phuea-chiwit',
  });
  assert.doesNotMatch(archSysRock, /ห้ามแต่งประโยคยาว 8-12 พยางค์เด็ดขาด/);
  assert.match(archSysRock, /ไม่ต้องสร้าง array melodyNotes รายโน้ต/);
  assert.match(archSysRock, /5-7 พยางค์/);

  const archUserRock = buildEasyArchitectUserPrompt({
    stylePreset: 'phuea-chiwit-road',
    vocalProfile: 'male',
    tempoFeel: 'fast',
    topic: 'เดินทางไกล',
    language: 'th',
    recommendedBpm: 120,
    recommendedGuitarModel: 'dreadnought-steel',
    recommendedAmbience: 'living-room',
    songwriterStyle: 'aed-carabao',
    thaiGenre: 'phuea-chiwit',
  });
  assert.doesNotMatch(archUserRock, /เพียง 4-6 พยางค์ต่อห้องเท่านั้น/);
  assert.doesNotMatch(archUserRock, /และ melodyNotes ไกด์ \(step 0\.\.15\) ที่ร้องได้จริง/);
  assert.match(archUserRock, /5-7 พยางค์/);

  const cohesiveSys = buildCohesivePolishSystemPrompt({
    bpm: 100,
    timeSignature: '4/4',
    songwriterStyle: 'aed-carabao',
    thaiGenre: 'phuea-chiwit',
  });
  assert.doesNotMatch(cohesiveSys, /รักษาจำนวนพยางค์ 4-6 พยางค์ต่อห้อง/);
  assert.match(cohesiveSys, /5-7 พยางค์/);

  const directorSys = buildDirectorSystemPrompt();
  for (const styleToken of [
    'lukthung-bounce',
    'rock-power',
    'fuzz',
    'lukthung-groove',
    'rnb-syncopated',
    'rnb-neo-chord',
    'rock-organ-pad',
    'lukthung-3cha',
    'rnb-pocket',
    'rock-drive',
  ]) {
    assert.ok(directorSys.includes(styleToken), `Director system prompt must include ${styleToken}`);
  }

  // Verify lyrics/route.ts enforces section syllable budget on validateThaiLyricCouplets
  const lyricsRouteSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/app/api/advance/lyrics/route.ts'),
    'utf8'
  );
  assert.match(lyricsRouteSrc, /enforceSyllableBudget:\s*true/);
  assert.match(lyricsRouteSrc, /minSyllables:\s*sectionBudget\.min/);
  assert.match(lyricsRouteSrc, /maxSyllables:\s*sectionBudget\.max/);
});

// ───────── 3. Architect Rhyme Polish Matches Duplicate Section Names by sectionId ─────────

test('Phase 8B.4: /api/advance/architect matches Rhyme Polish results by sectionId without overwriting duplicate Chorus names', async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  const origFetch = globalThis.fetch;
  let polishPromptCaptured = '';
  let callCount = 0;

  // Verify buildRhymePolishPrompt & schema carry sectionId
  const samplePrompt = buildRhymePolishPrompt(
    [
      {
        sectionId: 'sec-ch-1',
        sectionName: 'Chorus',
        chords: ['C', 'G'],
        lines: ['วรรคหนึ่งใจ', 'วรรคสองใจ'],
        duplicateEndWords: ['ใจ'],
      },
    ],
    84
  );
  assert.match(samplePrompt, /sec-ch-1/);
  const polishItemProps = (
    RHYME_POLISH_RESPONSE_SCHEMA.properties as {
      polishedSections?: { items?: { properties?: Record<string, unknown> } };
    }
  ).polishedSections?.items?.properties;
  assert.ok(polishItemProps && 'sectionId' in polishItemProps);

  try {
    process.env.GEMINI_API_KEY = 'test-fake-key-phase8b-arch';
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      callCount += 1;
      const info = await readFetchReqInfo(input, init);
      if (callCount === 1) {
        return new Response(
          JSON.stringify({
            id: 'arch-dup-1',
            model: 'gemini-4-hydrogen',
            status: 'completed',
            steps: [
              {
                type: 'model_output',
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      title: 'สองฮุคต่างอารมณ์',
                      bpm: 74,
                      baseKey: 'G',
                      capoFret: 0,
                      timeSignature: '4/4',
                      sections: [
                        {
                          type: 'chorus',
                          name: 'Chorus',
                          intensity: 'high',
                          bars: [
                            { chords: ['G'], lyrics: 'รักเธอคนเดียวในใจ' },
                            { chords: ['D'], lyrics: 'ไม่เคยมีใครในใจ' },
                          ],
                        },
                        {
                          type: 'chorus',
                          name: 'Chorus',
                          intensity: 'high',
                          bars: [
                            { chords: ['Em'], lyrics: 'แม้คืนวันผ่านพ้นใจ' },
                            { chords: ['C'], lyrics: 'ยังคงมีเธอในใจ' },
                          ],
                        },
                      ],
                    }),
                  },
                ],
              },
            ],
            usage: { total_input_tokens: 100, total_output_tokens: 120, total_tokens: 220 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      polishPromptCaptured = info.bodyText;
      const parsedBody = JSON.parse(info.bodyText) as { input?: string };
      const inputStr = typeof parsedBody.input === 'string' ? parsedBody.input : '';
      const jsonMatch = inputStr.match(/\[\{[\s\S]*?\}\]/);
      const sentItems = jsonMatch
        ? (JSON.parse(jsonMatch[0]) as Array<{ sectionId?: string; sectionName?: string }>)
        : [];
      assert.equal(sentItems.length, 2);
      assert.ok(sentItems[0].sectionId && sentItems[1].sectionId);
      assert.notEqual(sentItems[0].sectionId, sentItems[1].sectionId);

      // Return in reverse order with exact sectionIds to verify strict sectionId mapping
      return new Response(
        JSON.stringify({
          id: 'arch-dup-polish-2',
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
                        sectionId: sentItems[1].sectionId,
                        sectionName: 'Chorus',
                        lines: ['ฮุคสองปรับใหม่สดใส', 'ฝากรักไว้ไกลแสนไกล'],
                      },
                      {
                        sectionId: sentItems[0].sectionId,
                        sectionName: 'Chorus',
                        lines: ['ฮุคแรกปรับคำซึ้งใจ', 'ตราบชั่วนิรันดร์ไม่เปลี่ยนไป'],
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
    }) as typeof fetch;

    const res = await architectPost(
      new Request('http://localhost/api/advance/architect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stylePreset: 'warm-acoustic',
          vocalProfile: 'male',
          tempoFeel: 'slow',
          topic: 'สองท่อนฮุค',
          language: 'th',
        }),
      })
    );
    assert.equal(res.status, 200);
    assert.equal(callCount, 2);
    assert.ok(polishPromptCaptured.includes('sectionId'));

    const body = (await res.json()) as { song: SongProject };
    assert.equal(body.song.sections[0].bars[0].lyrics, 'ฮุคแรกปรับคำซึ้งใจ');
    assert.equal(body.song.sections[1].bars[0].lyrics, 'ฮุคสองปรับใหม่สดใส');
  } finally {
    globalThis.fetch = origFetch;
    if (prevKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prevKey;
  }
});

// ───────── 4. Cohesive Polish: Locked Sections 100%, Slash Chords, Unlocked Index Alignment & Payload Strip ─────────

test('Phase 8B.5: cohesive-polish preserves locked sections 100% (even with rebalanceBand), preserves Slash Chords, avoids index shift & empty-lyric overwrite', async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  const origFetch = globalThis.fetch;

  const baseSong = createDefaultSong();
  baseSong.bpm = 88;
  baseSong.thaiGenre = 'thai-rock';
  baseSong.sections = [
    {
      id: 'sec-lock-verse',
      name: 'Verse 1 (Locked)',
      type: 'verse',
      intensity: 'low',
      instruments: {
        guitarRhythm: true,
        guitarRhythmStyle: 'fingerpicking',
        guitarLead: false,
        bass: false,
        piano: true,
        pianoStyle: 'gentle-arpeggio',
        drums: false,
        drumsStyle: 'off',
      },
      bars: [
        {
          id: 'b-lock-1',
          chordsPerBar: 1,
          chords: ['D/F#'],
          playStyle: 'let-ring',
          lyrics: 'ห้ามแตะท่อนนี้เด็ดขาด',
          melodyNotes: [{ step: 0, midiPitch: 62, durationSteps: 4 }],
        },
        {
          id: 'b-lock-2',
          chordsPerBar: 1,
          chords: ['G/B'],
          playStyle: 'normal',
          lyrics: 'รักษาเครื่องดนตรีเดิมไว้',
          melodyNotes: [{ step: 4, midiPitch: 67, durationSteps: 4 }],
        },
      ],
    },
    {
      id: 'sec-open-chorus',
      name: 'Chorus (Unlocked)',
      type: 'chorus',
      intensity: 'medium',
      instruments: {
        guitarRhythm: true,
        guitarLead: false,
        bass: true,
        piano: true,
        drums: true,
      },
      bars: [
        {
          id: 'b-open-1',
          chordsPerBar: 1,
          chords: ['C'],
          playStyle: 'normal',
          lyrics: 'ท่อนฮุคเดิมที่ต้องไม่หาย',
          melodyNotes: [],
        },
        {
          id: 'b-open-2',
          chordsPerBar: 1,
          chords: ['G'],
          playStyle: 'normal',
          lyrics: 'ส่งต่อความหมายต่อไป',
          melodyNotes: [],
        },
      ],
    },
  ];

  try {
    // 1) 100% retention + rebalanceBand: locked section must stay 100% untouched
    const zeroRes = await cohesivePolishPost(
      new Request('http://localhost/api/advance/cohesive-polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          song: baseSong,
          lyricsRetentionPct: 100,
          chordsRetentionPct: 100,
          lockedSectionIds: ['sec-lock-verse'],
          rebalanceBand: true,
        }),
      })
    );
    assert.equal(zeroRes.status, 200);
    const zeroData = (await zeroRes.json()) as { song: SongProject };
    assert.deepEqual(zeroData.song.sections[0], baseSong.sections[0]);

    // 2) Live AI polish with locked section[0], slash chords, invalid N.C., empty lyrics, and omitted ID in AI response
    process.env.GEMINI_API_KEY = 'test-fake-key-phase8b-cohesive';
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          id: 'coh-live-1',
          model: 'gemini-3.5-flash-lite',
          status: 'completed',
          steps: [
            {
              type: 'model_output',
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    // Notice: only 1 unlocked section returned, WITHOUT id -> must match sec-open-chorus (no index shift!)
                    sections: [
                      {
                        bars: [
                          {
                            lyrics: '', // Empty string must NOT overwrite existing lyric
                            chords: ['G/B', 'D/F#'],
                            playStyle: 'let-ring',
                          },
                          {
                            lyrics: 'กลมกลืนไปพร้อมเสียงเพลง',
                            chords: ['N.C.'], // Invalid token must be ignored (keep ['G'])
                            playStyle: 'normal',
                          },
                        ],
                      },
                    ],
                    producerSummary: 'รักษา Slash Chords และท่อนล็อก 100%',
                  }),
                },
              ],
            },
          ],
          usage: { total_input_tokens: 150, total_output_tokens: 90, total_tokens: 240 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )) as typeof fetch;

    const liveRes = await cohesivePolishPost(
      new Request('http://localhost/api/advance/cohesive-polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          song: baseSong,
          lyricsRetentionPct: 75,
          chordsRetentionPct: 70,
          lockedSectionIds: ['sec-lock-verse'],
          rebalanceBand: true,
        }),
      })
    );
    assert.equal(liveRes.status, 200);
    const liveData = (await liveRes.json()) as { isSimulated: boolean; song: SongProject };
    assert.equal(liveData.isSimulated, false);

    // Locked section remains 100% identical (including fingerpicking, guitarLead: false, bass: false, intensity: 'low')
    assert.deepEqual(liveData.song.sections[0], baseSong.sections[0]);

    // Unlocked Chorus matched cleanly without index shift, slash chords preserved, empty lyric ignored, N.C. rejected
    const polishedChorus = liveData.song.sections[1];
    assert.equal(polishedChorus.bars[0].lyrics, 'ท่อนฮุคเดิมที่ต้องไม่หาย');
    assert.deepEqual(polishedChorus.bars[0].chords, ['G/B', 'D/F#']);
    assert.equal(polishedChorus.bars[0].chordsPerBar, 2);
    assert.equal(polishedChorus.bars[0].playStyle, 'let-ring');
    assert.equal(polishedChorus.bars[1].lyrics, 'กลมกลืนไปพร้อมเสียงเพลง');
    assert.deepEqual(polishedChorus.bars[1].chords, ['G']);

    // Verify CohesivePolishModal strips vocals & snapshots before sending and restores them on apply
    const modalSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/components/CohesivePolishModal.tsx'),
      'utf8'
    );
    assert.match(modalSrc, /stripVocalsFromSong\(song\)/);
    assert.match(modalSrc, /snapshots:\s*undefined/);
    assert.match(modalSrc, /restoreVocalsAndLocked/);
  } finally {
    globalThis.fetch = origFetch;
    if (prevKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prevKey;
  }
});
