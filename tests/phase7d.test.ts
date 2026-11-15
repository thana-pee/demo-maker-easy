import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { getChordEmotionalHint } from '../src/lib/chordUtils';
import {
  buildFullDemoMasterPrompt,
  buildLyriaReferencePrompt,
  buildSingleBarVariationsUserPrompt,
  SINGLE_BAR_VARIATIONS_SCHEMA,
} from '../src/lib/aiPrompts';
import { createDefaultSong } from '../src/lib/defaultSong';
import { buildSimulatedSingleBarVariations } from '../src/lib/songArchitect';
import { GEMINI_MODEL_LITE, GEMINI_MODEL_MUSIC } from '../src/lib/geminiClient';
import { POST as referenceTrackPost } from '../src/app/api/advance/reference-track/route';
import { POST as lyricsPost } from '../src/app/api/advance/lyrics/route';
import type { SongProject } from '../src/types/song';

function buildMultiSectionTestSong(): SongProject {
  const song = createDefaultSong();
  song.title = 'คืนฝนพรำที่โคราช';
  song.baseKey = 'C';
  song.bpm = 82;
  song.timeSignature = '4/4';
  song.transposeSemitones = 2; // C -> D
  song.capoFret = 2;
  song.guitarModel = 'dreadnought-steel';
  song.stringGauge = 'heavy-012';
  song.thaiGenre = 'thai-rock';
  song.lyricEra = 'era-90s';
  song.lyricDialect = 'isan';
  song.songwriterStyle = 'aed-carabao';
  song.emotionalResolution = 'fulfilling-warm';

  song.mixer.guitarRhythm.model = 'dreadnought-steel';
  song.mixer.guitarLead.model = 'gibson-les-paul';
  song.mixer.guitarLead.drive = 'overdrive';
  song.mixer.drums.style = 'rock-drive';

  song.sections = [
    {
      id: 'sec-verse-1',
      name: 'Verse 1',
      type: 'verse',
      intensity: 'medium',
      instruments: {
        guitarRhythm: true,
        guitarLead: false,
        bass: true,
        piano: false,
        drums: true,
        drumsStyle: 'rock-drive',
      },
      bars: [
        {
          id: 'v-b1',
          chordsPerBar: 1,
          chords: ['C'],
          playStyle: 'normal',
          lyrics: 'ลมหนาวพัดผ่านชายคา',
          melodyNotes: [{ step: 0, midiPitch: 60, durationSteps: 4 }],
        },
        {
          id: 'v-b2',
          chordsPerBar: 1,
          chords: ['Am7'],
          playStyle: 'normal',
          lyrics: 'มองฟ้าแล้วคิดถึงคนไกล',
          melodyNotes: [{ step: 2, midiPitch: 64, durationSteps: 4 }],
        },
      ],
    },
    {
      id: 'sec-chorus-1',
      name: 'Chorus',
      type: 'chorus',
      intensity: 'high',
      instruments: {
        guitarRhythm: true,
        guitarLead: true,
        guitarLeadDrive: 'overdrive',
        bass: true,
        piano: true,
        drums: true,
        drumsStyle: 'rock-drive',
      },
      bars: [
        {
          id: 'c-b1',
          chordsPerBar: 1,
          chords: ['Fmaj7'],
          playStyle: 'let-ring',
          lyrics: 'ต่อให้ทางจะแสนยาวไกล',
          melodyNotes: [{ step: 0, midiPitch: 69, durationSteps: 4 }],
        },
        {
          id: 'c-b2',
          chordsPerBar: 1,
          chords: ['G7'],
          playStyle: 'break',
          lyrics: 'หัวใจดวงนี้ยังเฝ้ารอเธอ',
          melodyNotes: [{ step: 4, midiPitch: 72, durationSteps: 6 }],
        },
      ],
    },
    {
      id: 'sec-solo-1',
      name: 'Guitar Solo',
      type: 'solo',
      intensity: 'high',
      instruments: {
        guitarRhythm: true,
        guitarLead: true,
        guitarLeadDrive: 'overdrive',
        bass: true,
        piano: false,
        drums: true,
        drumsStyle: 'rock-drive',
      },
      bars: [
        {
          id: 's-b1',
          chordsPerBar: 1,
          chords: ['Dm'],
          playStyle: 'normal',
          lyrics: '',
          melodyNotes: [],
        },
        {
          id: 's-b2',
          chordsPerBar: 1,
          chords: ['G'],
          playStyle: 'normal',
          lyrics: '',
          melodyNotes: [],
        },
      ],
    },
    {
      id: 'sec-outro-1',
      name: 'Outro',
      type: 'outro',
      intensity: 'low',
      instruments: {
        guitarRhythm: true,
        guitarLead: false,
        bass: true,
        piano: false,
        drums: false,
      },
      bars: [
        {
          id: 'o-b1',
          chordsPerBar: 1,
          chords: ['C'],
          playStyle: 'let-ring',
          lyrics: 'ฝากสายลมบอกเธอว่าคิดถึง',
          melodyNotes: [{ step: 0, midiPitch: 67, durationSteps: 8 }],
        },
      ],
    },
  ];

  return song;
}

test('Phase 7D-1: getChordEmotionalHint covers Major, Minor, Maj7, m7, Dom7, Sus, Add9, Dim/Aug, slash & fallback in TH/EN', () => {
  assert.match(getChordEmotionalHint('C', 'th'), /สดใส|มั่นคง/);
  assert.match(getChordEmotionalHint('C', 'en'), /Bright|grounded/);

  assert.match(getChordEmotionalHint('Am', 'th'), /เศร้า|เหงา/);
  assert.match(getChordEmotionalHint('Am', 'en'), /Melancholic|deep feeling/);

  // Must distinguish maj7 vs minor
  assert.match(getChordEmotionalHint('Fmaj7', 'th'), /อบอุ่น|โรแมนติก/);
  assert.match(getChordEmotionalHint('Fmaj7', 'en'), /Warm|dreamy/);

  assert.match(getChordEmotionalHint('Am7', 'th'), /นุ่มนวล|เหงาลึกซึ้ง/);
  assert.match(getChordEmotionalHint('G7', 'th'), /ส่งแรง|ดึงดูด/);
  assert.match(getChordEmotionalHint('Csus2', 'th'), /โปร่ง|กังวาน/);
  assert.match(getChordEmotionalHint('Dsus4', 'th'), /รอคอย|คลี่คลาย/);
  assert.match(getChordEmotionalHint('Cadd9', 'th'), /สดใส|ละมุน/);
  assert.match(getChordEmotionalHint('Bdim', 'th'), /ตึงเครียด|บีบหัวใจ/);
  assert.match(getChordEmotionalHint('Bm7b5', 'en'), /Tense|dramatic/);
  assert.match(getChordEmotionalHint('Caug', 'en'), /Dreamy|unresolved/);

  // Slash chord strips bass note cleanly and reads D Major quality
  assert.equal(getChordEmotionalHint('D/F#', 'th'), getChordEmotionalHint('D', 'th'));

  // Empty/blank input returns safe empty string
  assert.equal(getChordEmotionalHint('', 'th'), '');
  assert.equal(getChordEmotionalHint('   ', 'en'), '');
});

test('Phase 7D-2: buildFullDemoMasterPrompt extracts full song architecture, transposed chords, instruments, MIDI contour, and songwriter styles', () => {
  const song = buildMultiSectionTestSong();
  const res = buildFullDemoMasterPrompt(song, {
    userNotes: 'เน้นกีตาร์โปร่งนำในช่วงเปิดแล้วค่อยเร่งอารมณ์เข้าท่อนฮุก',
    vocalGender: 'male',
    language: 'th',
  });

  assert.equal(res.blueprintSummary.sectionCount, 4);
  assert.equal(res.blueprintSummary.totalBars, 7);
  assert.equal(res.blueprintSummary.lyricLinesCount, 5);
  assert.equal(res.blueprintSummary.melodyBarsCount, 5);

  // Transposition (+2 semitones: C->D, Am7->Bm7, Fmaj7->Gmaj7, G7->A7)
  assert.match(res.promptUsed, /\bD\b/);
  assert.match(res.promptUsed, /Bm7/);
  assert.match(res.promptUsed, /Gmaj7/);
  assert.match(res.promptUsed, /A7/);

  // Section tags & lyrics
  assert.match(res.promptUsed, /\[Verse\]/);
  assert.match(res.promptUsed, /\[Chorus\]/);
  assert.match(res.promptUsed, /\[Guitar Solo\]/);
  assert.match(res.promptUsed, /\[Outro\]/);
  assert.match(res.promptUsed, /ลมหนาวพัดผ่านชายคา/);
  assert.match(res.promptUsed, /หัวใจดวงนี้ยังเฝ้ารอเธอ/);

  // Instruments & Drive + MIDI pitch contour (60=C4 .. 72=C5)
  assert.match(res.promptUsed, /Gibson Les Paul/i);
  assert.match(res.promptUsed, /Overdrive/i);
  assert.match(res.promptUsed, /Rock Drive/i);
  assert.match(res.promptUsed, /C4/);
  assert.match(res.promptUsed, /C5/);
  assert.match(res.promptUsed, /Aed Carabao|คาราบาว/i);
  assert.match(res.promptUsed, /Capo fret 2/);
  assert.match(res.promptUsed, /82 BPM/);

  // Also test asanee-chotikul + instrumental flag
  song.songwriterStyle = 'asanee-chotikul';
  const instRes = buildFullDemoMasterPrompt(song, {
    instrumental: true,
    language: 'en',
  });
  assert.match(instRes.promptUsed, /Instrumental only — no vocals/i);
  assert.match(instRes.promptUsed, /Asanee Chotikul|อัสนี/i);

  // Backward compatibility check for buildLyriaReferencePrompt
  const legacyPrompt = buildLyriaReferencePrompt({
    title: 'ทางไกล',
    bpm: 78,
    baseKey: 'C Major',
    timeSignature: '4/4',
    chordsSample: ['C', 'G', 'Am', 'F'],
    songwriterStyle: 'aed-carabao',
  });
  assert.match(legacyPrompt, /Produce a studio-quality full vocal track/);
  assert.match(legacyPrompt, /78 BPM in 4\/4, Key of C Major/);
  assert.match(legacyPrompt, /C -> G -> Am -> F/);
});

test('Phase 7D-3: POST /api/advance/reference-track validates fullSong, returns blueprintSummary in simulated fallback, and executes mocked Lyria 3.5 safely', async () => {
  const prevApiKey = process.env.GEMINI_API_KEY;
  const prevFetch = globalThis.fetch;

  try {
    // 1. Validation: malformed/empty fullSong -> 400
    const badReq = new Request('http://localhost/api/advance/reference-track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mood: 'เศร้า',
        topic: 'ฝนตก',
        chordProgression: ['C', 'G'],
        fullSong: { title: 'Empty', sections: [] },
      }),
    });
    const badRes = await referenceTrackPost(badReq);
    assert.equal(badRes.status, 400);
    const badData = (await badRes.json()) as { error?: string };
    assert.match(badData.error || '', /fullSong/i);

    // 2. Simulated fallback (no GEMINI_API_KEY)
    delete process.env.GEMINI_API_KEY;
    const song = buildMultiSectionTestSong();
    const simReq = new Request('http://localhost/api/advance/reference-track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mood: 'เหงา คิดถึง แต่ยังมีหวัง',
        topic: 'ความคิดถึงบ้านเกิดใต้สายฝนยามค่ำคืน',
        chordProgression: ['C', 'G'],
        bpm: song.bpm,
        key: song.baseKey,
        fullSong: song,
      }),
    });
    const simRes = await referenceTrackPost(simReq);
    assert.equal(simRes.status, 200);
    const simData = (await simRes.json()) as {
      isSimulated: boolean;
      model: string;
      audioDataUrl: string | null;
      promptUsed: string;
      blueprintSummary?: {
        totalBars: number;
        sectionCount: number;
        lyricLinesCount: number;
        melodyBarsCount: number;
      };
    };
    assert.equal(simData.isSimulated, true);
    assert.equal(simData.model, GEMINI_MODEL_MUSIC);
    assert.equal(simData.audioDataUrl, null);
    assert.ok(simData.blueprintSummary);
    assert.equal(simData.blueprintSummary.sectionCount, 4);
    assert.equal(simData.blueprintSummary.totalBars, 7);
    assert.match(simData.promptUsed, /ลมหนาวพัดผ่านชายคา/);

    // 3. Mocked Live Lyria 3.5 Interaction call + zero secret leak
    const fakeKey = 'AIzaMockPhase7dSecretKeyNeverLeak';
    process.env.GEMINI_API_KEY = fakeKey;
    const fakeMp3Base64 = Buffer.from('ID3-mock-lyria-audio-bytes').toString('base64');
    let capturedBody = '';
    globalThis.fetch = (async (urlOrReq: string | URL | Request, init?: RequestInit) => {
      if (typeof init?.body === 'string') {
        capturedBody = init.body;
      } else if (urlOrReq instanceof Request) {
        capturedBody = await urlOrReq.clone().text();
      }
      return new Response(
        JSON.stringify({
          id: 'int-lyria-mock-7d',
          status: 'completed',
          model: GEMINI_MODEL_MUSIC,
          output_audio: {
            data: fakeMp3Base64,
            mime_type: 'audio/mp3',
          },
          steps: [
            {
              type: 'model_output',
              content: [
                {
                  type: 'audio',
                  data: fakeMp3Base64,
                  mime_type: 'audio/mp3',
                },
                {
                  type: 'text',
                  text: 'Mastered full song arrangement ready.',
                },
              ],
            },
          ],
          usage: {
            total_input_tokens: 340,
            total_output_tokens: 10,
            total_thought_tokens: 0,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof globalThis.fetch;

    const liveReq = new Request('http://localhost/api/advance/reference-track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mood: 'เหงา คิดถึง แต่ยังมีหวัง',
        topic: 'ความคิดถึงบ้านเกิดใต้สายฝนยามค่ำคืน',
        chordProgression: ['C', 'G'],
        fullSong: song,
      }),
    });
    const liveRes = await referenceTrackPost(liveReq);
    assert.equal(liveRes.status, 200);
    const liveData = (await liveRes.json()) as {
      isSimulated: boolean;
      model: string;
      mimeType: string;
      audioDataUrl: string | null;
      promptUsed: string;
      blueprintSummary?: { sectionCount: number; totalBars: number };
      usage?: { inputTokens: number };
    };
    assert.equal(liveData.isSimulated, false);
    assert.equal(liveData.model, GEMINI_MODEL_MUSIC);
    assert.equal(liveData.audioDataUrl, `data:audio/mp3;base64,${fakeMp3Base64}`);
    assert.equal(liveData.blueprintSummary?.sectionCount, 4);
    assert.equal(liveData.usage?.inputTokens, 340);
    assert.match(capturedBody, /lyria-3\.5/);
    assert.match(capturedBody, /\[Chorus\]/);
    assert.ok(!JSON.stringify(liveData).includes(fakeKey));
  } finally {
    globalThis.fetch = prevFetch;
    if (prevApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = prevApiKey;
    }
  }
});

test('Phase 7D-4: singleBarIndex mode & buildSimulatedSingleBarVariations return 3 unique options with rhyme & chord mood context', async () => {
  // Unit test for prompt builder (including optional existingLyrics omitted) & simulated fallback
  const userPrompt = buildSingleBarVariationsUserPrompt({
    singleBarIndex: 1,
    chordProgression: ['C', 'Am7', 'Fmaj7', 'G'],
    bars: [
      { chord: 'C', chordsPerBar: 1, existingLyrics: 'มองสายฝนโปรยปรายบนหลังคา' },
      { chord: 'Am7', chordsPerBar: 1, existingLyrics: '' },
      { chord: 'Fmaj7', chordsPerBar: 1, existingLyrics: 'หวังเพียงสักวันจะได้พบเธออีกครั้ง' },
      { chord: 'G', chordsPerBar: 1, existingLyrics: '' },
    ],
    existingLyrics: [],
    sectionType: 'verse',
    bpm: 80,
    timeSignature: '4/4',
    topic: 'คืนฝนตกและคิดถึงบ้าน',
    mood: 'เหงาซึ้ง',
    songwriterStyle: 'aed-carabao',
    thaiGenre: 'thai-rock',
  });
  assert.match(userPrompt, /Bar 2/);
  assert.match(userPrompt, /Am7/);
  assert.match(userPrompt, /มองสายฝนโปรยปรายบนหลังคา/);
  assert.match(userPrompt, /หวังเพียงสักวันจะได้พบเธออีกครั้ง/);
  assert.ok(
    (SINGLE_BAR_VARIATIONS_SCHEMA as { required?: string[] }).required?.includes('variations')
  );

  const promptWithoutBars = buildSingleBarVariationsUserPrompt({
    singleBarIndex: 0,
    chordProgression: ['C', 'G'],
    existingLyrics: ['ฟ้าครึ้มก่อนฝนตก'],
    sectionType: 'verse',
    topic: 'รอคนไกล',
    mood: 'คิดถึง',
  });
  assert.match(promptWithoutBars, /Bar 1/);

  const simUnit = buildSimulatedSingleBarVariations({
    singleBarIndex: 1,
    chord: 'Am7',
    sectionType: 'verse',
    topic: 'คืนฝนตก',
    mood: 'เหงา',
    prevLine: 'มองฟ้าเหงาใจ',
    songwriterStyle: 'the-toys',
    thaiGenre: 'acoustic-indie',
  });
  assert.equal(simUnit.variations.length, 3);
  assert.equal(new Set(simUnit.variations).size, 3);
  assert.ok(simUnit.rhymeNotes.length >= 1);

  const prevApiKey = process.env.GEMINI_API_KEY;
  const prevFetch = globalThis.fetch;

  try {
    // 1. Validation: negative / out-of-range singleBarIndex -> 400
    const negReq = new Request('http://localhost/api/advance/lyrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mood: 'เหงา',
        topic: 'ฝนตก',
        chordProgression: ['C', 'G'],
        sectionType: 'verse',
        singleBarIndex: -1,
      }),
    });
    assert.equal((await lyricsPost(negReq)).status, 400);

    const oobReq = new Request('http://localhost/api/advance/lyrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mood: 'เหงา',
        topic: 'ฝนตก',
        chordProgression: ['C', 'G'],
        sectionType: 'verse',
        bars: [{ chord: 'C' }, { chord: 'G' }],
        singleBarIndex: 2,
      }),
    });
    assert.equal((await lyricsPost(oobReq)).status, 400);

    // 2. Simulated fallback when GEMINI_API_KEY missing
    delete process.env.GEMINI_API_KEY;
    const simReq = new Request('http://localhost/api/advance/lyrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mood: 'เหงา คิดถึง',
        topic: 'คืนฝนตก',
        chordProgression: ['C', 'Am7', 'Fmaj7', 'G'],
        sectionType: 'verse',
        bpm: 80,
        timeSignature: '4/4',
        bars: [
          { chord: 'C', existingLyrics: 'นั่งมองฟ้าที่มืดหม่นในคืนนี้' },
          { chord: 'Am7', existingLyrics: '' },
          { chord: 'Fmaj7', existingLyrics: 'ยังคงรอเธอตรงที่เดิมเสมอ' },
          { chord: 'G', existingLyrics: '' },
        ],
        singleBarIndex: 1,
      }),
    });
    const simRes = await lyricsPost(simReq);
    assert.equal(simRes.status, 200);
    const simData = (await simRes.json()) as {
      isSimulated: boolean;
      model: string;
      singleBarIndex?: number;
      variations?: string[];
      lines: Array<{ chord: string; text: string }>;
    };
    assert.equal(simData.isSimulated, true);
    assert.equal(simData.model, 'demo-offline-poet');
    assert.equal(simData.singleBarIndex, 1);
    assert.equal(simData.variations?.length, 3);
    assert.equal(new Set(simData.variations).size, 3);
    assert.equal(simData.lines.length, 3);

    // 3. Mocked Live gemini-3.5-flash-lite Interaction call
    const fakeKey = 'AIzaMockPhase7dLyricsKey';
    process.env.GEMINI_API_KEY = fakeKey;
    const mockVariations = [
      'คิดถึงวันที่เราเคยเคียงข้างกัน',
      'เสียงฝนซาพาใจลอยย้อนคืนวัน',
      'ยังจำคำสัญญาก่อนที่เราจะลา',
    ];
    let capturedPrompt = '';
    globalThis.fetch = (async (urlOrReq: string | URL | Request, init?: RequestInit) => {
      if (typeof init?.body === 'string') {
        capturedPrompt = init.body;
      } else if (urlOrReq instanceof Request) {
        capturedPrompt = await urlOrReq.clone().text();
      }
      return new Response(
        JSON.stringify({
          id: 'int-lyrics-7d-mock',
          status: 'completed',
          model: GEMINI_MODEL_LITE,
          output_text: JSON.stringify({
            variations: mockVariations,
            rhymeNotes: ['ส่งสัมผัสสระอีจาก นี้ -> วัน/ลา อย่างนุ่มนวล'],
            tip: 'เลือกตัวเลือกที่ 1 หากต้องการเน้นโทนอุ่นเหงา',
          }),
          steps: [
            {
              type: 'model_output',
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    variations: mockVariations,
                    rhymeNotes: ['ส่งสัมผัสสระอีจาก นี้ -> วัน/ลา อย่างนุ่มนวล'],
                    tip: 'เลือกตัวเลือกที่ 1 หากต้องการเน้นโทนอุ่นเหงา',
                  }),
                },
              ],
            },
          ],
          usage: {
            total_input_tokens: 210,
            total_output_tokens: 68,
            total_thought_tokens: 0,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof globalThis.fetch;

    const liveReq = new Request('http://localhost/api/advance/lyrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mood: 'ซึ้ง/โหยหา',
        topic: 'ความทรงจำในฤดูฝน',
        chordProgression: ['C', 'Am7', 'Fmaj7', 'G'],
        sectionType: 'verse',
        bpm: 80,
        timeSignature: '4/4',
        bars: [
          { chord: 'C', existingLyrics: 'นั่งมองฟ้าที่มืดหม่นในคืนนี้' },
          { chord: 'Am7', existingLyrics: '' },
          { chord: 'Fmaj7', existingLyrics: 'ยังคงรอเธอตรงที่เดิมเสมอ' },
          { chord: 'G', existingLyrics: '' },
        ],
        singleBarIndex: 1,
      }),
    });
    const liveRes = await lyricsPost(liveReq);
    assert.equal(liveRes.status, 200);
    const liveData = (await liveRes.json()) as {
      isSimulated: boolean;
      model: string;
      singleBarIndex?: number;
      variations?: string[];
      tip: string;
      usage?: { inputTokens: number };
    };
    assert.equal(liveData.isSimulated, false);
    assert.equal(liveData.model, GEMINI_MODEL_LITE);
    assert.equal(liveData.singleBarIndex, 1);
    assert.deepEqual(liveData.variations, mockVariations);
    assert.equal(liveData.usage?.inputTokens, 210);
    assert.match(capturedPrompt, /นั่งมองฟ้าที่มืดหม่นในคืนนี้/);
    assert.match(capturedPrompt, /ยังคงรอเธอตรงที่เดิมเสมอ/);
    assert.ok(!JSON.stringify(liveData).includes(fakeKey));
  } finally {
    globalThis.fetch = prevFetch;
    if (prevApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = prevApiKey;
    }
  }
});

test('Phase 7D-5: UI components wire AI Studio Master, 3-Variations, Chord Mood Hints, Auth Bearer & Wallet Snapshots', () => {
  const exportModalSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/ExportModal.tsx'),
    'utf8'
  );
  const advanceModalSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/AdvanceModeModal.tsx'),
    'utf8'
  );
  const sectionBuilderSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/SectionBuilder.tsx'),
    'utf8'
  );
  const pageSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/app/page.tsx'),
    'utf8'
  );

  // ExportModal contracts
  assert.match(exportModalSrc, /buildFullDemoMasterPrompt/);
  assert.match(exportModalSrc, /\/api\/advance\/reference-track/);
  assert.match(exportModalSrc, /fullSong:\s*song/);
  assert.match(exportModalSrc, /canUsePaidOnlyModel/);
  assert.match(exportModalSrc, /getAuthAccessToken/);
  assert.match(exportModalSrc, /applyServerWalletSnapshot/);

  // AdvanceModeModal contracts
  assert.match(advanceModalSrc, /buildFullDemoMasterPrompt/);
  assert.match(advanceModalSrc, /fullSong:\s*song/);
  assert.match(advanceModalSrc, /blueprintSummary/);

  // SectionBuilder contracts
  assert.match(sectionBuilderSrc, /getChordEmotionalHint/);
  assert.match(sectionBuilderSrc, /singleBarIndex:\s*barIndex/);
  assert.match(sectionBuilderSrc, /🎲 3 ตัวเลือก/);
  assert.match(sectionBuilderSrc, /getAuthAccessToken/);
  assert.match(sectionBuilderSrc, /applyServerWalletSnapshot/);

  // Page wiring
  assert.match(pageSrc, /onCreditsChange=\{setCreditBalance\}/);
  assert.match(pageSrc, /onOpenTopUpWallet=\{/);
  assert.match(pageSrc, /onOpenWallet=\{/);
});
