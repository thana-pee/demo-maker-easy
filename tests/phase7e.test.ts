import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createDefaultSong } from '../src/lib/defaultSong';
import { resolveNextBarIndex, resolvePlaybackNextBar } from '../src/lib/audioEngine';
import {
  buildLrcContent,
  buildPlainLyricsWithChords,
  formatLrcTimestamp,
  sanitizeExportFilename,
} from '../src/lib/lyricExport';
import {
  computeNonOverlappingClipWindow,
  encodePcmWavDataUrl,
  findLeadingSilenceSampleIndex,
  trimChannelsLeadingSilence,
} from '../src/lib/audioTrim';
import {
  computeSpeechRateForBpm,
  resolveSpeechLangTag,
} from '../src/lib/browserSpeechCue';
import { computeEffectiveBarMix, TRACK_DEFAULT_VOL } from '../src/lib/audioDspShared';
import { flattenSong, getTiming } from '../src/lib/barPlanner';
import {
  applyGenreBandArrangement,
  sanitizeArchitectSongProject,
  type EasyArchitectInput,
} from '../src/lib/songArchitect';
import { shiftLastTokenToNextBar } from '../src/lib/sectionUtils';
import {
  ARCHITECT_RESPONSE_SCHEMA,
  buildEasyArchitectSystemPrompt,
  buildEasyArchitectUserPrompt,
  buildRhymePolishPrompt,
  DIRECTOR_RESPONSE_SCHEMA,
  getSyllableBudgetForBpm,
  LYRICS_DEEP_RESPONSE_SCHEMA,
  RHYME_POLISH_RESPONSE_SCHEMA,
} from '../src/lib/aiPrompts';
import { validateThaiLyricCouplets } from '../src/lib/thaiRhymeHelper';
import { callGeminiJson } from '../src/lib/geminiClient';
import { POST as architectPost } from '../src/app/api/advance/architect/route';
import { POST as ttsCuePost } from '../src/app/api/advance/tts-cue/route';
import type { SongBar, SongProject } from '../src/types/song';

function cloneSong(song: SongProject): SongProject {
  return JSON.parse(JSON.stringify(song)) as SongProject;
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

// ───────────────────── 1. Audio Playback Range & Play-Section-Once ─────────────────────

test('Phase 7E Audio Playback: resolvePlaybackNextBar supports playBounds (Play-Section-Once) and preserves loopRange', () => {
  const playBounds = { startBar: 2, endBar: 5 };
  const loopRange = { startBar: 0, endBar: 3 };

  assert.equal(resolvePlaybackNextBar(2, 12, loopRange, playBounds), 3);
  assert.equal(resolvePlaybackNextBar(4, 12, loopRange, playBounds), 5);
  // Reached end of section -> stop immediately (-1) even when loopRange is set
  assert.equal(resolvePlaybackNextBar(5, 12, loopRange, playBounds), -1);
  // Bar before playBounds jumps into section start
  assert.equal(resolvePlaybackNextBar(0, 12, loopRange, playBounds), 2);

  // Without playBounds, behaves identically to resolveNextBarIndex
  assert.equal(resolvePlaybackNextBar(3, 12, loopRange, null), resolveNextBarIndex(3, 12, loopRange));
  assert.equal(resolvePlaybackNextBar(3, 12, loopRange, null), 0);
  assert.equal(resolvePlaybackNextBar(11, 12, null, null), -1);
});

// ───────────────────── 2. Lyric Export (.LRC & .TXT) ─────────────────────

test('Phase 7E Lyric Export: buildLrcContent aligns [mm:ss.xx] tags with barSec and buildPlainLyricsWithChords formats chords', () => {
  const song = cloneSong(createDefaultSong());
  song.title = 'คืนฝนพรำ @2026!';
  song.bpm = 120; // 4/4 at 120 BPM => 2.00s per bar
  song.timeSignature = '4/4';
  song.baseKey = 'G';
  song.capoFret = 2;

  const { barSec } = getTiming(song);
  assert.equal(barSec, 2);

  song.sections = [
    {
      id: 'sec-intro',
      name: 'Intro (เกริ่นนำ)',
      type: 'intro',
      intensity: 'low',
      instruments: song.sections[0].instruments,
      bars: [
        { id: 'b0', chordsPerBar: 1, chords: ['G'], playStyle: 'normal', lyrics: '', melodyNotes: [] },
        { id: 'b1', chordsPerBar: 1, chords: ['Em'], playStyle: 'normal', lyrics: '', melodyNotes: [] },
      ],
    },
    {
      id: 'sec-verse',
      name: 'Verse 1',
      type: 'verse',
      intensity: 'medium',
      instruments: song.sections[0].instruments,
      bars: [
        { id: 'b2', chordsPerBar: 1, chords: ['G'], playStyle: 'normal', lyrics: 'สายฝนโปรยลงกลางใจ', melodyNotes: [] },
        { id: 'b3', chordsPerBar: 2, chords: ['Em', 'D'], playStyle: 'normal', lyrics: 'ยังคอยเธออยู่ไม่ไกล', melodyNotes: [] },
      ],
    },
  ];

  assert.equal(formatLrcTimestamp(0), '[00:00.00]');
  assert.equal(formatLrcTimestamp(4), '[00:04.00]');
  assert.equal(formatLrcTimestamp(65.25), '[01:05.25]');
  assert.ok(sanitizeExportFilename(song.title).includes('คืนฝนพรำ'));

  const lrc = buildLrcContent(song, { artist: 'Studio Artist' });
  assert.ok(lrc.includes('[ti:คืนฝนพรำ @2026!]'));
  assert.ok(lrc.includes('[ar:Studio Artist]'));
  assert.ok(lrc.includes('[00:00.00] [Intro (เกริ่นนำ)]'));
  assert.ok(lrc.includes('[00:04.00] สายฝนโปรยลงกลางใจ'));
  assert.ok(lrc.includes('[00:06.00] ยังคอยเธออยู่ไม่ไกล'));

  const txt = buildPlainLyricsWithChords(song);
  assert.ok(txt.includes('Key: G | Capo Fret 2 | Tempo: 120 BPM | Time: 4/4'));
  assert.ok(txt.includes('[Verse 1]'));
  assert.ok(txt.includes('[G]  สายฝนโปรยลงกลางใจ'));
  assert.ok(txt.includes('[Em / D]  ยังคอยเธออยู่ไม่ไกล'));
});

// ───────────────────── 3. Silence Trim, Non-Overlapping Clips, Browser Speech & Melody Balance ─────────────────────

test('Phase 7E Audio Trim & Export Windows: trims -45 dB leading silence safely and computes non-overlapping clip stop windows', () => {
  const sampleRate = 1000;
  // 200ms leading silence + 300ms vocal signal (amplitude 0.5)
  const mono = new Float32Array(500);
  for (let i = 200; i < 500; i++) {
    mono[i] = 0.5;
  }

  const trimIdx = findLeadingSilenceSampleIndex([mono], sampleRate);
  // Expect 200 - 15ms safety margin = 185 samples trimmed
  assert.equal(trimIdx, 185);

  const trimmed = trimChannelsLeadingSilence([mono], sampleRate);
  assert.equal(trimmed.trimmedSamples, 185);
  assert.equal(trimmed.channels[0].length, 315);

  const wavUrl = encodePcmWavDataUrl(trimmed.channels, sampleRate);
  assert.ok(wavUrl.startsWith('data:audio/wav;base64,'));

  // Non-overlapping clip windows with 20ms fade-out
  const clips = [
    { barIndex: 0, audioDataUrl: wavUrl, startSec: 0 },
    { barIndex: 1, audioDataUrl: wavUrl, startSec: 2.0 },
    { barIndex: 2, audioDataUrl: wavUrl, startSec: 4.0 },
  ];
  const win0 = computeNonOverlappingClipWindow(0, clips, 8.0);
  assert.equal(win0.startSec, 0);
  assert.equal(win0.stopSec, 2.0);
  assert.ok(Math.abs(win0.fadeOutStartSec - 1.98) < 1e-6);

  const winLast = computeNonOverlappingClipWindow(2, clips, 8.0);
  assert.equal(winLast.startSec, 4.0);
  assert.equal(winLast.stopSec, 8.0);

  // Browser speech helper checks
  assert.equal(computeSpeechRateForBpm(60), 0.75);
  assert.equal(computeSpeechRateForBpm(140), 1.25);
  assert.equal(resolveSpeechLangTag('คืนนี้มีดาว', 'en'), 'th-TH');
  assert.equal(resolveSpeechLangTag('Hello acoustic', 'en'), 'en-US');

  // Guide Melody default & Backing Track Only mute option
  assert.equal(TRACK_DEFAULT_VOL.melody, 56);
  const song = cloneSong(createDefaultSong());
  assert.equal(song.mixer.melody?.volume, 56);
  const flat = flattenSong(song);
  const normalMix = computeEffectiveBarMix(song, flat[1].section, flat[1], 1);
  assert.ok(normalMix.volumes.melody > 0);
  const backingOnlyMix = computeEffectiveBarMix(song, flat[1].section, flat[1], 1, {
    excludeMelodyGuide: true,
  });
  assert.equal(backingOnlyMix.volumes.melody, 0);
});

// ───────────────────── 4. Sanitizer: Intro Melody Clear, Outro Final Break -> Let-Ring & No Consecutive Breaks ─────────────────────

test('Phase 7E Sanitizer: clears intro melodyNotes, converts outro final break to let-ring, and stops consecutive lyric breaks', () => {
  const input: EasyArchitectInput = {
    stylePreset: 'warm-acoustic',
    vocalProfile: 'female',
    tempoFeel: 'slow',
    topic: 'คืนนี้มีดาว',
    language: 'th',
  };

  const payload = {
    title: 'ทดลองโครงเพลง',
    bpm: 70,
    baseKey: 'G',
    capoFret: 2,
    timeSignature: '4/4',
    sections: [
      {
        name: 'Intro',
        type: 'intro',
        intensity: 'low',
        bars: [
          {
            chords: ['G'],
            playStyle: 'normal',
            lyrics: '',
            melodyNotes: [{ step: 0, midiPitch: 67, durationSteps: 4 }],
          },
          {
            chords: ['Em'],
            playStyle: 'normal',
            lyrics: '',
            melodyNotes: [{ step: 0, midiPitch: 64, durationSteps: 4 }],
          },
        ],
      },
      {
        name: 'Chorus',
        type: 'chorus',
        intensity: 'high',
        bars: [
          { chords: ['G'], playStyle: 'break', lyrics: 'ยังคิดถึงเธอเสมอ' },
          { chords: ['D'], playStyle: 'break', lyrics: 'ไม่มีวันเลือนหายไป' },
          { chords: ['Em'], playStyle: 'normal', lyrics: 'ใต้แสงจันทร์คืนนั้น' },
          { chords: ['C'], playStyle: 'normal', lyrics: 'ยังคงจำได้ดี' },
        ],
      },
      {
        name: 'Outro',
        type: 'outro',
        intensity: 'low',
        bars: [
          { chords: ['G'], playStyle: 'normal', lyrics: 'ลาแล้วความทรงจำ' },
          { chords: ['G'], playStyle: 'break', lyrics: '' },
        ],
      },
    ],
  };

  const sanitized = sanitizeArchitectSongProject(payload, input);
  assert.equal(sanitized.mixer.melody?.volume, 56);

  const introSec = sanitized.sections[0];
  assert.equal(introSec.type, 'intro');
  assert.ok(introSec.bars.every((b) => b.melodyNotes.length === 0));

  const chorusSec = sanitized.sections[1];
  assert.equal(chorusSec.bars[0].playStyle, 'break');
  // Second consecutive break in lyric bar must be normalized
  assert.equal(chorusSec.bars[1].playStyle, 'normal');

  const outroSec = sanitized.sections[2];
  assert.equal(outroSec.bars[outroSec.bars.length - 1].playStyle, 'let-ring');
});

// ───────────────────── 5. BPM-Aware Genre Arrangement ─────────────────────

test('Phase 7E Arrangement: applyGenreBandArrangement avoids 3-Cha on 66 BPM Luk Thung and keeps clean guitar on 68-72 BPM Pop', () => {
  // 1) Slow Luk Thung (66 BPM) must NOT receive 'lukthung-3cha' or 'lukthung-bounce'
  const slowLuk = cloneSong(createDefaultSong());
  slowLuk.bpm = 66;
  slowLuk.thaiGenre = 'luk-thung';
  slowLuk.songwriterStyle = 'sala-khunawut';
  const slowLukArranged = applyGenreBandArrangement(slowLuk);
  assert.notEqual(slowLukArranged.mixer.drums.style, 'lukthung-3cha');
  assert.notEqual(slowLukArranged.mixer.guitarRhythm.style, 'lukthung-bounce');
  assert.ok(
    slowLukArranged.sections.every(
      (s) => s.instruments.drumsStyle !== 'lukthung-3cha' && s.instruments.guitarRhythmStyle !== 'lukthung-bounce'
    )
  );

  // Fast Luk Thung (110 BPM) STILL receives energetic 3-Cha + Bounce
  const fastLuk = cloneSong(createDefaultSong());
  fastLuk.bpm = 110;
  fastLuk.thaiGenre = 'luk-thung';
  const fastLukArranged = applyGenreBandArrangement(fastLuk);
  assert.equal(fastLukArranged.mixer.drums.style, 'lukthung-3cha');
  assert.equal(fastLukArranged.mixer.guitarRhythm.style, 'lukthung-bounce');

  // 2) Slow Thai Pop Ballad (68–72 BPM) keeps guitarLeadDrive strictly 'clean' even in Chorus
  const slowPop = cloneSong(createDefaultSong());
  slowPop.bpm = 68;
  slowPop.thaiGenre = 'thai-pop';
  slowPop.songwriterStyle = 'dee-nitipong';
  const slowPopArranged = applyGenreBandArrangement(slowPop);
  assert.equal(slowPopArranged.mixer.guitarLead.drive, 'clean');
  assert.ok(slowPopArranged.sections.every((s) => s.instruments.guitarLeadDrive === 'clean'));
});

// ───────────────────── 6. shiftLastTokenToNextBar Multi-Syllable Space Chunk Split ─────────────────────

test('Phase 7E Section Utils: shiftLastTokenToNextBar splits >2-syllable final spaced chunk by Thai syllable', () => {
  const makeBar = (id: string, lyrics: string): SongBar => ({
    id,
    chordsPerBar: 1,
    chords: ['C'],
    playStyle: 'normal',
    lyrics,
    melodyNotes: [],
  });

  // Case A: Last chunk has > 2 syllables -> move ONLY last syllable
  const longChunkBars = [
    makeBar('b1', 'ฝากความคิดถึง ไม่ลืมเลือนหาย'),
    makeBar('b2', 'ในคืนที่เหงา'),
  ];
  const shiftedLong = shiftLastTokenToNextBar(longChunkBars, 0);
  assert.equal(shiftedLong[0].lyrics, 'ฝากความคิดถึง ไม่ลืมเลือน');
  assert.equal(shiftedLong[1].lyrics, 'หาย ในคืนที่เหงา');

  // Case B: Last chunk has <= 2 syllables -> keep moving chunk intact (Phase 7A invariant)
  const shortChunkBars = [
    makeBar('b1', 'ยังคิดถึงเธอ เสมอ'),
    makeBar('b2', 'ในคืนเหงา'),
  ];
  const shiftedShort = shiftLastTokenToNextBar(shortChunkBars, 0);
  assert.equal(shiftedShort[0].lyrics, 'ยังคิดถึงเธอ');
  assert.equal(shiftedShort[1].lyrics, 'เสมอ ในคืนเหงา');
});

// ───────────────────── 7. Slow Budgets, Schema Hygiene & Architect Duplicate-End Polish ─────────────────────

test('Phase 7E AI Prompts & Schemas: tighter <=72 BPM budget, Phase 7C grooves in schemas, and zero nested bounds', () => {
  const slow68 = getSyllableBudgetForBpm(68, '4/4');
  assert.equal(slow68.tempoFeel, 'slow');
  assert.equal(slow68.min, 4);
  assert.equal(slow68.max, 6);

  // Singable Phrasing standard: <=76 BPM uses '4-6 พยางค์' with breath rests
  const slow74 = getSyllableBudgetForBpm(74, '4/4');
  assert.equal(slow74.min, 4);
  assert.equal(slow74.max, 6);
  assert.ok(slow74.guidance.includes('4-6 พยางค์'));

  // Key diversity & anti-break guidance in prompts
  const sysPrompt = buildEasyArchitectSystemPrompt({ bpm: 68, thaiGenre: 'thai-pop' });
  const usrPrompt = buildEasyArchitectUserPrompt({
    stylePreset: 'sad-ballad',
    vocalProfile: 'male',
    tempoFeel: 'slow',
    topic: 'รอเธอที่ปลายทาง',
    language: 'th',
    recommendedBpm: 68,
    recommendedGuitarModel: 'classical-nylon',
    recommendedAmbience: 'wood-studio',
  });
  assert.ok(sysPrompt.includes('D, E, F, G, A, Bb'));
  assert.ok(sysPrompt.includes("playStyle: 'break'"));
  assert.ok(usrPrompt.includes('let-ring'));

  // Build polish prompt forwards duplicateEndWords
  const polishPrompt = buildRhymePolishPrompt(
    [
      {
        sectionName: 'Chorus',
        chords: ['G', 'D'],
        lines: ['ยังคิดถึงเธอในหัวใจ', 'ไม่ว่านานสักเท่าไรก็ยังรักใจ'],
        duplicateEndWords: ['ใจ'],
      },
    ],
    68
  );
  assert.ok(polishPrompt.includes('ใจ'));
  assert.ok(polishPrompt.includes('ห้ามใช้คำลงท้ายวรรคซ้ำคำเดิม'));

  // Verify Phase 7C grooves unlocked in ARCHITECT_RESPONSE_SCHEMA & DIRECTOR_RESPONSE_SCHEMA
  const archSectionProps = (
    (
      ARCHITECT_RESPONSE_SCHEMA.properties as Record<
        string,
        { items?: { properties?: { instruments?: { properties?: Record<string, { enum?: string[] }> } } } }
      >
    ).sections.items?.properties?.instruments?.properties ?? {}
  );
  assert.ok((archSectionProps.guitarRhythmStyle?.enum ?? []).includes('lukthung-bounce'));
  assert.ok((archSectionProps.guitarRhythmStyle?.enum ?? []).includes('rock-power'));
  assert.ok((archSectionProps.drumsStyle?.enum ?? []).includes('lukthung-3cha'));
  assert.ok((archSectionProps.drumsStyle?.enum ?? []).includes('rnb-pocket'));
  assert.ok((archSectionProps.drumsStyle?.enum ?? []).includes('rock-drive'));
  assert.ok((archSectionProps.bassStyle?.enum ?? []).includes('lukthung-groove'));
  assert.ok((archSectionProps.pianoStyle?.enum ?? []).includes('rnb-neo-chord'));

  const dirPatchProps = (
    (
      DIRECTOR_RESPONSE_SCHEMA.properties as Record<
        string,
        { items?: { properties?: Record<string, { enum?: string[] }> } }
      >
    ).sectionPatches.items?.properties ?? {}
  );
  assert.ok((dirPatchProps.guitarRhythmStyle?.enum ?? []).includes('lukthung-bounce'));
  assert.ok((dirPatchProps.drumsStyle?.enum ?? []).includes('rock-drive'));

  // Verify NO minimum/maximum or nested minItems/maxItems anywhere in the 4 schemas
  for (const [name, schema] of [
    ['ARCHITECT_RESPONSE_SCHEMA', ARCHITECT_RESPONSE_SCHEMA],
    ['DIRECTOR_RESPONSE_SCHEMA', DIRECTOR_RESPONSE_SCHEMA],
    ['LYRICS_DEEP_RESPONSE_SCHEMA', LYRICS_DEEP_RESPONSE_SCHEMA],
    ['RHYME_POLISH_RESPONSE_SCHEMA', RHYME_POLISH_RESPONSE_SCHEMA],
  ] as const) {
    const violations = collectForbiddenSchemaKeys(schema);
    assert.deepEqual(violations, [], `${name} must not contain minimum/maximum or nested minItems/maxItems`);
  }
});

test('Phase 7E API Integration: /api/advance/architect triggers polish when duplicateEndWords detected & UI contracts hold', async () => {
  const origKey = process.env.GEMINI_API_KEY;
  const origFetch = globalThis.fetch;

  const initialVerseCouplet1 = 'ค่ำคืนนี้มองฟ้ายังจำใจ';
  const initialVerseCouplet2 = 'สายลมหนาวพัดผ่านมานานไกล';
  const dupChorus1 = 'อยากบอกว่ารักเธอสุดหัวใจ';
  const dupChorus2 = 'เก็บคำว่ารักไว้ในหัวใจ';

  // Ensure duplicateEndWords exists even though rhyme passes vowel/coda
  const dupCheck = validateThaiLyricCouplets([dupChorus1, dupChorus2], { bpm: 72, timeSignature: '4/4' });
  assert.ok((dupCheck.duplicateEndWords?.length ?? 0) > 0);

  let fetchCount = 0;
  let secondCallBody = '';

  process.env.GEMINI_API_KEY = 'test-fake-key-phase7e';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCount += 1;
    if (fetchCount === 1) {
      return new Response(
        JSON.stringify({
          id: 'v1_phase7e_arch_1',
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
                    title: 'เพลงรักใต้ดาว',
                    bpm: 72,
                    baseKey: 'D',
                    capoFret: 0,
                    timeSignature: '4/4',
                    guitarModel: 'warm-dreadnought',
                    ambience3D: 'studio-warm',
                    sections: [
                      {
                        name: 'Verse 1',
                        type: 'verse',
                        intensity: 'low',
                        bars: [
                          { chords: ['D'], playStyle: 'normal', lyrics: initialVerseCouplet1 },
                          { chords: ['Bm'], playStyle: 'normal', lyrics: initialVerseCouplet2 },
                        ],
                      },
                      {
                        name: 'Chorus',
                        type: 'chorus',
                        intensity: 'high',
                        bars: [
                          { chords: ['G'], playStyle: 'normal', lyrics: dupChorus1 },
                          { chords: ['A'], playStyle: 'normal', lyrics: dupChorus2 },
                        ],
                      },
                    ],
                    producerNotes: ['Arranged for acoustic warmth'],
                  }),
                },
              ],
            },
          ],
          usage: { total_input_tokens: 350, total_output_tokens: 240, total_tokens: 590 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    secondCallBody = input instanceof Request ? await input.clone().text() : String(init?.body ?? '');
    return new Response(
      JSON.stringify({
        id: 'v1_phase7e_polish_2',
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
                      sectionName: 'Chorus',
                      lines: ['อยากบอกว่ารักเธอสุดหัวใจ', 'ไม่ว่าเวลาผ่านไปเท่าไรยังรอ'],
                    },
                  ],
                }),
              },
            ],
          },
        ],
        usage: { total_input_tokens: 100, total_output_tokens: 70, total_tokens: 170 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  try {
    const req = new Request('http://localhost/api/advance/architect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stylePreset: 'warm-acoustic',
        vocalProfile: 'male',
        tempoFeel: 'slow',
        topic: 'รักใต้แสงดาว',
        language: 'th',
      }),
    });
    const res = await architectPost(req);
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      isSimulated: boolean;
      rhymeValidation: { passed: boolean; polished: boolean };
      song: SongProject;
    };
    assert.equal(json.isSimulated, false);
    assert.equal(fetchCount, 2);
    assert.equal(json.rhymeValidation.polished, true);
    assert.ok(secondCallBody.includes('ใจ'), 'Polish prompt should receive duplicateEndWords');
    assert.ok(
      json.song.sections[1].bars[1].lyrics.includes('ยังรอ'),
      'Polished lyrics should replace duplicate ending line'
    );
  } finally {
    globalThis.fetch = origFetch;
    if (origKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = origKey;
  }

  // Also test TTS cue with modelTier: 'pro-tts' & vocalMode: 'singing-demo' (simulated + mocked live)
  const origTtsKey = process.env.GEMINI_API_KEY;
  const origTtsFetch = globalThis.fetch;
  delete process.env.GEMINI_API_KEY;
  try {
    const ttsReqSim = new Request('http://localhost/api/advance/tts-cue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'ฝากความคิดถึงไว้ในสายลม',
        bpm: 68,
        language: 'th',
        voice: 'Kore',
        modelTier: 'pro-tts',
        vocalMode: 'singing-demo',
        thaiGenre: 'thai-pop',
      }),
    });
    const ttsResSim = await ttsCuePost(ttsReqSim);
    assert.equal(ttsResSim.status, 200);
    const ttsJsonSim = (await ttsResSim.json()) as { isSimulated: boolean; model: string; cueText: string };
    assert.equal(ttsJsonSim.isSimulated, true);
    assert.equal(ttsJsonSim.model, 'browser-speech-fallback');

    let capturedTtsUrl = '';
    let capturedTtsBody = '';
    process.env.GEMINI_API_KEY = 'test-fake-key-tts-phase7e';
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedTtsUrl = input instanceof Request ? input.url : String(input);
      capturedTtsBody = input instanceof Request ? await input.clone().text() : String(init?.body ?? '');
      return new Response(
        JSON.stringify({
          id: 'v1_phase7e_tts_1',
          object: 'interaction',
          model: 'gemini-3.8-flash-tts',
          status: 'completed',
          steps: [
            {
              type: 'model_output',
              content: [{ type: 'audio', data: Buffer.from('RIFFdemo').toString('base64'), mime_type: 'audio/wav' }],
            },
          ],
          usage: { total_input_tokens: 45, total_output_tokens: 180, total_tokens: 225 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const ttsReqLive = new Request('http://localhost/api/advance/tts-cue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'ฝากความคิดถึงไว้ในสายลม',
        bpm: 68,
        language: 'th',
        voice: 'Kore',
        modelTier: 'pro-tts',
        vocalMode: 'singing-demo',
        thaiGenre: 'thai-pop',
      }),
    });
    const ttsResLive = await ttsCuePost(ttsReqLive);
    assert.equal(ttsResLive.status, 200);
    const ttsJsonLive = (await ttsResLive.json()) as {
      isSimulated: boolean;
      model: string;
      audioDataUrl: string | null;
    };
    assert.equal(ttsJsonLive.isSimulated, false);
    assert.equal(ttsJsonLive.model, 'gemini-3.8-flash-tts');
    assert.ok(ttsJsonLive.audioDataUrl?.startsWith('data:audio/wav;base64,'));
    assert.ok(capturedTtsUrl.includes('/v1beta/interactions'));
    assert.ok(capturedTtsBody.includes('gemini-3.8-flash-tts'));
    assert.ok(capturedTtsBody.includes('ให้ขึ้นเสียงทันทีไม่ต้องเว้นเงียบ'));
    const parsedTtsReq = JSON.parse(capturedTtsBody) as {
      store?: boolean;
      generation_config?: { speech_config?: Array<{ voice?: string; language?: string }> };
    };
    assert.equal(parsedTtsReq.store, undefined);
    assert.equal(parsedTtsReq.generation_config?.speech_config?.[0]?.voice, 'Kore');
    assert.equal(parsedTtsReq.generation_config?.speech_config?.[0]?.language, undefined);

    // 404 from /interactions -> seamless fallback to :generateContent + L16 PCM wrapped to WAV
    const callUrls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const reqUrl = input instanceof Request ? input.url : String(input);
      callUrls.push(reqUrl);
      if (reqUrl.includes('/interactions')) {
        return new Response(
          JSON.stringify({
            error: { code: 404, message: 'Interaction model not found for key=AIzaFakeSecret987654321' },
          }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }
      const fakePcm = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]).toString('base64');
      return new Response(
        JSON.stringify({
          modelVersion: 'gemini-3.8-flash-tts',
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    inlineData: {
                      mimeType: 'audio/L16;codec=pcm;rate=24000',
                      data: fakePcm,
                    },
                  },
                ],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 12,
            candidatesTokenCount: 250,
            totalTokenCount: 262,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const resFallbackOk = await ttsCuePost(
      new Request('http://localhost/api/advance/tts-cue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'หยาดเหงื่อแลกฝัน',
          bpm: 66,
          language: 'th',
          voice: 'Kore',
          modelTier: 'pro-tts',
          vocalMode: 'singing-demo',
        }),
      })
    );
    assert.equal(resFallbackOk.status, 200);
    const jsonFallbackOk = (await resFallbackOk.json()) as {
      isSimulated: boolean;
      model: string;
      mimeType: string | null;
      audioDataUrl: string | null;
      usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
    };
    assert.equal(jsonFallbackOk.isSimulated, false);
    assert.equal(jsonFallbackOk.mimeType, 'audio/wav');
    assert.ok(jsonFallbackOk.audioDataUrl?.startsWith('data:audio/wav;base64,'));
    const decodedWavPrefix = Buffer.from(
      jsonFallbackOk.audioDataUrl!.replace('data:audio/wav;base64,', ''),
      'base64'
    )
      .subarray(0, 4)
      .toString('ascii');
    assert.equal(decodedWavPrefix, 'RIFF');
    assert.equal(jsonFallbackOk.usage?.inputTokens, 12);
    assert.equal(jsonFallbackOk.usage?.outputTokens, 250);
    assert.ok(callUrls.some((u) => u.includes('/interactions')));
    assert.ok(callUrls.some((u) => u.includes(':generateContent')));

    // Both endpoints return 404 -> sanitized detail included, secret redacted
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 404,
            message: 'Model gemini-3.8-flash-tts unavailable AIzaSecretABC123456',
          },
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )) as typeof fetch;

    const resBoth404 = await ttsCuePost(
      new Request('http://localhost/api/advance/tts-cue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'หยาดเหงื่อแลกฝัน',
          bpm: 66,
          language: 'th',
          voice: 'Kore',
          modelTier: 'pro-tts',
          vocalMode: 'singing-demo',
        }),
      })
    );
    assert.equal(resBoth404.status, 200);
    const jsonBoth404 = (await resBoth404.json()) as {
      isSimulated: boolean;
      tip: string;
      failureReason: string;
    };
    assert.equal(jsonBoth404.isSimulated, true);
    assert.equal(jsonBoth404.failureReason, 'http-error');
    assert.ok(jsonBoth404.tip.includes('HTTP 404'));
    assert.ok(jsonBoth404.tip.includes('[REDACTED]'));
    assert.ok(!jsonBoth404.tip.includes('AIzaSecret'));
  } finally {
    globalThis.fetch = origTtsFetch;
    if (origTtsKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = origTtsKey;
  }

  // UI integration contracts
  const root = process.cwd();
  const sectionSrc = fs.readFileSync(path.join(root, 'src/components/SectionBuilder.tsx'), 'utf8');
  const exportSrc = fs.readFileSync(path.join(root, 'src/components/ExportModal.tsx'), 'utf8');
  const pianoRollSrc = fs.readFileSync(path.join(root, 'src/components/MiniPianoRollModal.tsx'), 'utf8');
  const mp3Src = fs.readFileSync(path.join(root, 'src/lib/mp3Exporter.ts'), 'utf8');

  assert.match(sectionSrc, /onPlaySectionOnce/);
  assert.match(sectionSrc, /onOpenKaraoke/);
  assert.match(sectionSrc, /speakBrowserLyrics/);
  assert.match(sectionSrc, /addAndActivateVocalTake/);
  assert.match(exportSrc, /downloadLrcFile/);
  assert.match(exportSrc, /downloadLyricsTxtFile/);
  assert.match(exportSrc, /excludeMelodyGuide/);
  assert.match(exportSrc, /song\.updatedAt/);
  assert.match(pianoRollSrc, /trimAudioDataUrlLeadingSilence/);
  assert.match(pianoRollSrc, /ttsModelTier/);
  assert.match(mp3Src, /computeNonOverlappingClipWindow/);
  assert.match(mp3Src, /trimAudioBufferLeadingSilence/);
});

test('Architect Reliability: Gemini timeoutMs aborts cleanly, refunds billing on timeout/error, returns JSON 500 on RPC failure & slims melodyNotes prompt', async () => {
  const promptText = buildEasyArchitectSystemPrompt({ songwriterStyle: 'fongbeer-rock' });
  assert.match(promptText, /ไม่ต้องสร้าง array melodyNotes รายโน้ต/);

  const origKey = process.env.GEMINI_API_KEY;
  const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const origSrv = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const origBillingMode = process.env.NEXT_PUBLIC_BILLING_MODE;
  const origFetch = globalThis.fetch;

  process.env.GEMINI_API_KEY = 'test-fake-key-timeout';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test-project.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  process.env.NEXT_PUBLIC_BILLING_MODE = 'production';

  try {
    // 1. callGeminiJson aborts stalled request at timeoutMs (inspecting Request.signal or init.signal)
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const sig = init?.signal ?? (input instanceof Request ? input.signal : undefined);
        if (sig?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        sig?.addEventListener('abort', () => {
          reject(new DOMException('GEMINI_TIMEOUT', 'AbortError'));
        });
      })) as typeof fetch;

    const timedOutRes = await callGeminiJson('hello', { timeoutMs: 25 });
    assert.equal(timedOutRes.ok, false);
    if (!timedOutRes.ok) {
      assert.equal(timedOutRes.reason, 'network-error');
      assert.match(timedOutRes.failureReason, /Timeout/);
    }

    // 2. /api/advance/architect refunds credits cleanly when Gemini aborts/errors
    let refundCalled = false;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : input.toString();
      if (url.endsWith('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'user-1', email: 'user@example.com' }), { status: 200 });
      }
      if (url.endsWith('/rest/v1/rpc/atomic_deduct_credits')) {
        return new Response(
          JSON.stringify([{ success: true, trial_credits: 11, purchased_credits: 0, balance: 11 }]),
          { status: 200 }
        );
      }
      if (url.endsWith('/rest/v1/rpc/atomic_refund_credits')) {
        refundCalled = true;
        return new Response(
          JSON.stringify([{ success: true, trial_credits: 15, purchased_credits: 0, balance: 15 }]),
          { status: 200 }
        );
      }
      if (url.includes('interactions')) {
        throw new DOMException('GEMINI_TIMEOUT', 'AbortError');
      }
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const timeoutFallbackRes = await architectPost(
      new Request('http://localhost/api/advance/architect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-ok' },
        body: JSON.stringify({
          stylePreset: 'soft-rock',
          vocalProfile: 'male',
          tempoFeel: 'medium',
          topic: 'ทดสอบ Timeout',
          songwriterStyle: 'fongbeer-rock',
        }),
      })
    );
    assert.equal(timeoutFallbackRes.status, 200);
    const timeoutJson = (await timeoutFallbackRes.json()) as {
      isSimulated: boolean;
      tip: string;
      wallet?: { balance: number };
    };
    assert.equal(timeoutJson.isSimulated, true);
    assert.equal(refundCalled, true, 'Must auto-refund credits on Gemini timeout/error');
    assert.equal(timeoutJson.wallet?.balance, 15);
    assert.match(timeoutJson.tip, /Timeout/);

    // 3. Unhandled wallet RPC failure returns clean JSON 500 instead of non-JSON crash
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : input.toString();
      if (url.endsWith('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'user-1', email: 'user@example.com' }), { status: 200 });
      }
      if (url.endsWith('/rest/v1/rpc/atomic_deduct_credits')) {
        return new Response('Supabase RPC internal failure', { status: 500 });
      }
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const rpcErrRes = await architectPost(
      new Request('http://localhost/api/advance/architect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-ok' },
        body: JSON.stringify({ topic: 'ทดสอบ RPC พัง' }),
      })
    );
    assert.equal(rpcErrRes.status, 500);
    const rpcErrJson = (await rpcErrRes.json()) as { error: string; code: string };
    assert.equal(rpcErrJson.code, 'ARCHITECT_INTERNAL_ERROR');
    assert.ok(rpcErrJson.error.includes('ไม่หักเครดิต'));
  } finally {
    globalThis.fetch = origFetch;
    if (origKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = origKey;
    if (origUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = origUrl;
    if (origAnon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = origAnon;
    if (origSrv === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = origSrv;
    if (origBillingMode === undefined) delete process.env.NEXT_PUBLIC_BILLING_MODE;
    else process.env.NEXT_PUBLIC_BILLING_MODE = origBillingMode;
  }

  // 4. EasyModeStarterModal client contract: safe text parsing, HTTP 504 diagnostics & 401 refresh
  const modalSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/EasyModeStarterModal.tsx'),
    'utf8'
  );
  assert.match(modalSrc, /postEasyApiJson/);
  assert.match(modalSrc, /formatEasyApiFailureMessage/);
  assert.match(modalSrc, /refreshAuthSession/);
  assert.match(modalSrc, /HTTP 504|status === 504/);
});
