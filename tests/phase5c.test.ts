/**
 * Phase 5C Verification Suite
 * ครอบคลุม: 0-Cr Chord/Scale-Locked Guide Melody Generator, Multimodal Audio Mime Normalization,
 * /api/advance/hum-to-song (<= 45s cap, gemini-4-hydrogen + optional gemini-3.5-transcribe),
 * /api/advance/tts-cue (<= 240 chars / <= 30s cap, gemini-3.8-flash-lite-tts), และ UI Contracts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  generateChordGuideMelodyNotes,
  generateSectionGuideMelody,
  getChordPitchClasses,
  getScalePitchClasses,
  type GuideContourPattern,
} from '../src/lib/melodyUtils';
import {
  HUM_TO_SONG_RESPONSE_SCHEMA,
  buildHumToSongSystemPrompt,
  buildHumToSongUserPrompt,
  normalizeAudioMimeType,
} from '../src/lib/aiPrompts';
import { POST as humToSongPost } from '../src/app/api/advance/hum-to-song/route';
import { POST as ttsCuePost } from '../src/app/api/advance/tts-cue/route';

// ───────────────────────── 1. 0-Credit Chord/Scale-Locked Guide Melody ─────────────────────────

test('generateChordGuideMelodyNotes produces singable non-overlapping notes within range & scale across 4/4, 3/4, 6/8', () => {
  const patterns: GuideContourPattern[] = ['gentle-arch', 'rising-hook', 'call-response', 'arpeggio'];

  for (const pattern of patterns) {
    const notes44 = generateChordGuideMelodyNotes({
      chord1: 'C',
      chord2: 'G',
      baseKey: 'C',
      totalSteps: 8,
      stepsPerBeat: 2,
      pattern,
    });
    assert.ok(notes44.length >= 3, `Expected >= 3 notes for 4/4 pattern ${pattern}`);

    const scaleC = getScalePitchClasses('C', 'major');
    const chordC = getChordPitchClasses('C');
    const chordG = getChordPitchClasses('G');

    for (let i = 0; i < notes44.length; i += 1) {
      const n = notes44[i];
      assert.ok(n.midiPitch >= 55 && n.midiPitch <= 76, `Pitch ${n.midiPitch} out of vocal range`);
      assert.ok(n.step >= 0 && n.step < 8, `Step ${n.step} out of bounds for 4/4 8-step grid`);
      assert.ok(n.durationSteps >= 1 && n.step + n.durationSteps <= 8);

      const pc = n.midiPitch % 12;
      assert.ok(
        scaleC.has(pc) || chordC.has(pc) || chordG.has(pc),
        `Pitch class ${pc} should stay inside key C or active chord tones`
      );
      if (i > 0) {
        assert.ok(
          n.step >= notes44[i - 1].step + notes44[i - 1].durationSteps,
          'Consecutive guide notes must not overlap'
        );
      }
    }
  }

  // Verify 3/4 (12 steps) & 6/8 (12 steps)
  const waltz34 = generateChordGuideMelodyNotes({
    chord1: 'Am',
    baseKey: 'C',
    totalSteps: 12,
    stepsPerBeat: 4,
    pattern: 'call-response',
    vocalRegisterShift: 3,
  });
  assert.ok(waltz34.length >= 3);
  assert.ok(waltz34.every((n) => n.step >= 0 && n.step + n.durationSteps <= 12));
  assert.ok(waltz34.every((n) => n.midiPitch >= 58 && n.midiPitch <= 79));

  const comp68 = generateSectionGuideMelody(['G', 'Em', 'C', 'D'], 'G', '6/8', 'male');
  assert.equal(comp68.length, 4);
  for (const barNotes of comp68) {
    assert.ok(barNotes.length >= 3);
    assert.ok(barNotes.every((n) => n.step >= 0 && n.step + n.durationSteps <= 12));
  }
});

// ───────────────────────── 2. Audio Mime Normalization & Prompts ─────────────────────────

test('normalizeAudioMimeType normalizes browser codec parameters and blocks non-audio formats', () => {
  assert.equal(normalizeAudioMimeType('audio/webm;codecs=opus'), 'audio/webm');
  assert.equal(normalizeAudioMimeType('audio/mp4'), 'audio/m4a');
  assert.equal(normalizeAudioMimeType('audio/x-m4a; charset=binary'), 'audio/m4a');
  assert.equal(normalizeAudioMimeType('audio/x-wav'), 'audio/wav');
  assert.equal(normalizeAudioMimeType('AUDIO/MPEG'), 'audio/mpeg');
  assert.equal(normalizeAudioMimeType('audio/ogg; codecs=vorbis'), 'audio/ogg');

  assert.equal(normalizeAudioMimeType('video/mp4'), null);
  assert.equal(normalizeAudioMimeType('image/png'), null);
  assert.equal(normalizeAudioMimeType('text/plain'), null);
  assert.equal(normalizeAudioMimeType(''), null);

  const sysPrompt = buildHumToSongSystemPrompt();
  const userPrompt = buildHumToSongUserPrompt({
    stylePreset: 'warm-acoustic',
    vocalProfile: 'female',
    language: 'th',
    durationSec: 18.4,
    transcribedHint: 'คิดถึงวันเก่า',
  });
  assert.match(sysPrompt, /midiPitch/);
  assert.match(sysPrompt, /chords/);
  assert.match(userPrompt, /18\.4/);
  assert.match(userPrompt, /คิดถึงวันเก่า/);
  assert.ok(Array.isArray(HUM_TO_SONG_RESPONSE_SCHEMA.required));
});

// ───────────────────────── 3. /api/advance/hum-to-song Validation, Offline & Mocked Gemini ─────────────────────────

const SAMPLE_TINY_AUDIO_B64 = Buffer.from('RIFF....WAVEfmt ').toString('base64');

async function readMockFetchBody(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Record<string, unknown>> {
  if (typeof init?.body === 'string') {
    return JSON.parse(init.body) as Record<string, unknown>;
  }
  if (input instanceof Request) {
    const raw = await input.clone().text();
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  }
  return {};
}

test('/api/advance/hum-to-song enforces 45s cap, 8MB limit, audio MIME check, and returns offline fallback without key', async () => {
  // Invalid duration > 45s -> 400
  const overDurationRes = await humToSongPost(
    new Request('http://localhost/api/advance/hum-to-song', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioBase64: SAMPLE_TINY_AUDIO_B64,
        mimeType: 'audio/webm;codecs=opus',
        durationSec: 46,
      }),
    })
  );
  assert.equal(overDurationRes.status, 400);

  // Invalid MIME -> 400
  const badMimeRes = await humToSongPost(
    new Request('http://localhost/api/advance/hum-to-song', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioBase64: SAMPLE_TINY_AUDIO_B64,
        mimeType: 'video/mp4',
        durationSec: 15,
      }),
    })
  );
  assert.equal(badMimeRes.status, 400);

  // Oversized (> 8 MB decoded) -> 400
  const hugeBase64 = 'A'.repeat(11 * 1024 * 1024);
  const hugeRes = await humToSongPost(
    new Request('http://localhost/api/advance/hum-to-song', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioBase64: hugeBase64,
        mimeType: 'audio/wav',
        durationSec: 12,
      }),
    })
  );
  assert.equal(hugeRes.status, 400);

  // Missing key -> safe offline simulation (0 credits)
  const prevKey = process.env.GEMINI_API_KEY;
  try {
    delete process.env.GEMINI_API_KEY;
    const simRes = await humToSongPost(
      new Request('http://localhost/api/advance/hum-to-song', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: `data:audio/webm;codecs=opus;base64,${SAMPLE_TINY_AUDIO_B64}`,
          durationSec: 14.5,
          stylePreset: 'warm-acoustic',
          vocalProfile: 'neutral',
          language: 'th',
        }),
      })
    );
    assert.equal(simRes.status, 200);
    const body = (await simRes.json()) as {
      isSimulated: boolean;
      detected: { bpm: number; timeSignature: string; baseKey: string };
      song: { sections: Array<{ bars: Array<{ melodyNotes: unknown[] }> }> };
    };
    assert.equal(body.isSimulated, true);
    assert.ok(body.detected.bpm >= 55 && body.detected.bpm <= 160);
    assert.ok(body.song.sections.length >= 2);
    assert.ok(body.song.sections[0].bars[0].melodyNotes.length > 0);
  } finally {
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
  }
});

test('/api/advance/hum-to-song chains optional gemini-3.5-transcribe + multimodal gemini-4-hydrogen cleanly', async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  const origFetch = globalThis.fetch;
  const calledModels: string[] = [];
  let sawAudioPartMime = '';

  try {
    process.env.GEMINI_API_KEY = 'secret-unit-test-key-should-not-leak';
    globalThis.fetch = async (input, init) => {
      const payload = (await readMockFetchBody(input, init)) as {
        model?: string;
        input?: Array<{ type?: string; mime_type?: string }>;
      };
      calledModels.push(payload.model || '');

      if (payload.model === 'gemini-3.5-transcribe') {
        return new Response(
          JSON.stringify({
            id: 'inter-transcribe-1',
            model: 'gemini-3.5-transcribe',
            status: 'completed',
            steps: [
              {
                type: 'model_output',
                content: [{ type: 'text', text: 'นั่งมองฝนพรำข้างหน้าต่าง' }],
              },
            ],
            usage: { total_input_tokens: 120, total_output_tokens: 18, total_tokens: 138 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const audioPart = Array.isArray(payload.input)
        ? payload.input.find((p) => p.type === 'audio')
        : undefined;
      sawAudioPartMime = audioPart?.mime_type || '';

      const mockStructuredSong = {
        title: 'ฝนข้างหน้าต่าง (Hum Demo)',
        bpm: 84,
        baseKey: 'G',
        capoFret: 2,
        timeSignature: '4/4',
        transcribedLyrics: 'นั่งมองฝนพรำข้างหน้าต่าง คิดถึงคืนวันเก่า',
        confidenceNote: 'ทำนองชัดในจังหวะช้า 4/4 คีย์ G',
        sections: [
          {
            type: 'verse',
            name: 'Verse 1',
            intensity: 'low',
            bars: [
              {
                chords: ['G'],
                lyrics: 'นั่งมองฝนพรำข้างหน้าต่าง',
                playStyle: 'normal',
                melodyNotes: [{ step: 0, midiPitch: 67, durationSteps: 2 }],
              },
              { chords: ['Em'], lyrics: 'ปล่อยใจลอยไปกับสายลม', playStyle: 'normal' },
            ],
          },
          {
            type: 'chorus',
            name: 'Chorus',
            intensity: 'high',
            bars: [
              { chords: ['C'], lyrics: 'คิดถึงคืนวันเก่าของเรา', playStyle: 'accent' },
              { chords: ['D'], lyrics: 'ยังอบอุ่นในใจเสมอมา', playStyle: 'normal' },
            ],
          },
        ],
        producerNotes: 'คุมกีตาร์โปร่งโปร่งใน Verse แล้วเปิด Chorus ด้วยคอร์ด C-D',
      };

      return new Response(
        JSON.stringify({
          id: 'inter-hum-2',
          model: 'gemini-4-hydrogen',
          status: 'completed',
          steps: [
            {
              type: 'model_output',
              content: [{ type: 'text', text: JSON.stringify(mockStructuredSong) }],
            },
          ],
          usage: { total_input_tokens: 340, total_output_tokens: 210, total_tokens: 550 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const res = await humToSongPost(
      new Request('http://localhost/api/advance/hum-to-song', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: SAMPLE_TINY_AUDIO_B64,
          mimeType: 'audio/webm;codecs=opus',
          durationSec: 16,
          stylePreset: 'warm-acoustic',
          vocalProfile: 'female',
          language: 'th',
          includeTranscribePass: true,
        }),
      })
    );

    assert.equal(res.status, 200);
    const bodyText = await res.text();
    assert.ok(!bodyText.includes('secret-unit-test-key-should-not-leak'));

    const body = JSON.parse(bodyText) as {
      isSimulated: boolean;
      model: string;
      detected: { bpm: number; baseKey: string; timeSignature: string };
      transcribedLyrics: string;
      usage: { totalTokens: number };
      song: { sections: Array<{ bars: Array<{ melodyNotes: unknown[] }> }> };
    };

    assert.equal(body.isSimulated, false);
    assert.deepEqual(calledModels, ['gemini-3.5-transcribe', 'gemini-4-hydrogen']);
    assert.equal(sawAudioPartMime, 'audio/webm');
    assert.equal(body.detected.bpm, 84);
    assert.equal(body.detected.baseKey, 'G');
    assert.equal(body.usage.totalTokens, 138 + 550);
    assert.ok(body.transcribedLyrics.includes('ฝน'));
    // Second bar lacked AI melodyNotes -> enriched by chord-locked generator
    assert.ok(body.song.sections[0].bars[1].melodyNotes.length >= 3);
  } finally {
    globalThis.fetch = origFetch;
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
    else delete process.env.GEMINI_API_KEY;
  }
});

// ───────────────────────── 4. /api/advance/tts-cue Route Tests ─────────────────────────

test('/api/advance/tts-cue enforces 240-char / 30s limit, safe fallback, and Gemini 3.8 TTS audio synthesis', async () => {
  // Exceeds 240 chars -> 400
  const tooLongRes = await ttsCuePost(
    new Request('http://localhost/api/advance/tts-cue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'ก'.repeat(241), bpm: 84 }),
    })
  );
  assert.equal(tooLongRes.status, 400);

  // Exceeds 30s -> 400
  const overSecRes = await ttsCuePost(
    new Request('http://localhost/api/advance/tts-cue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'ร้องตามจังหวะ', durationSec: 31 }),
    })
  );
  assert.equal(overSecRes.status, 400);

  const prevKey = process.env.GEMINI_API_KEY;
  const origFetch = globalThis.fetch;

  try {
    // Missing key -> safe simulated fallback
    delete process.env.GEMINI_API_KEY;
    const simRes = await ttsCuePost(
      new Request('http://localhost/api/advance/tts-cue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'นั่งมองฝนพรำ', bpm: 84, language: 'th' }),
      })
    );
    assert.equal(simRes.status, 200);
    const simBody = (await simRes.json()) as { isSimulated: boolean; audioDataUrl: string | null };
    assert.equal(simBody.isSimulated, true);
    assert.equal(simBody.audioDataUrl, null);

    // Mocked Gemini 3.8 Flash-Lite TTS response
    process.env.GEMINI_API_KEY = 'tts-mock-key';
    let sawAudioResponseFormat = false;
    globalThis.fetch = async (input, init) => {
      const payload = (await readMockFetchBody(input, init)) as {
        response_format?: { type?: string };
      };
      sawAudioResponseFormat = payload.response_format?.type === 'audio';
      return new Response(
        JSON.stringify({
          id: 'inter-tts-1',
          model: 'gemini-3.8-flash-lite-tts',
          status: 'completed',
          steps: [
            {
              type: 'model_output',
              content: [
                {
                  type: 'audio',
                  data: SAMPLE_TINY_AUDIO_B64,
                  mime_type: 'audio/wav',
                },
              ],
            },
          ],
          usage: { total_input_tokens: 45, total_output_tokens: 320, total_tokens: 365 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const liveRes = await ttsCuePost(
      new Request('http://localhost/api/advance/tts-cue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'นั่งมองฝนพรำ', bpm: 84, language: 'th', includeCountIn: true }),
      })
    );
    assert.equal(liveRes.status, 200);
    assert.equal(sawAudioResponseFormat, true);
    const liveBody = (await liveRes.json()) as {
      isSimulated: boolean;
      model: string;
      audioDataUrl: string | null;
      mimeType: string | null;
      usage: { totalTokens: number };
    };
    assert.equal(liveBody.isSimulated, false);
    assert.equal(liveBody.model, 'gemini-3.8-flash-lite-tts');
    assert.equal(liveBody.mimeType, 'audio/wav');
    assert.equal(liveBody.audioDataUrl, `data:audio/wav;base64,${SAMPLE_TINY_AUDIO_B64}`);
    assert.equal(liveBody.usage.totalTokens, 365);
  } finally {
    globalThis.fetch = origFetch;
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
    else delete process.env.GEMINI_API_KEY;
  }
});

// ───────────────────────── 5. Phase 5C UI & Billing Safety Contracts ─────────────────────────

test('Phase 5C UI components wire guide generator, 45s hum capture, TTS confirmation, and non-simulated billing', () => {
  const root = process.cwd();
  const pianoRollSrc = fs.readFileSync(path.join(root, 'src/components/MiniPianoRollModal.tsx'), 'utf8');
  const easyModalSrc = fs.readFileSync(path.join(root, 'src/components/EasyModeStarterModal.tsx'), 'utf8');
  const pageSrc = fs.readFileSync(path.join(root, 'src/app/page.tsx'), 'utf8');

  // MiniPianoRollModal contracts
  assert.match(pianoRollSrc, /generateChordGuideMelodyNotes/);
  assert.match(pianoRollSrc, /t\.generateGuideBtn/);
  assert.match(pianoRollSrc, /t\.ttsCueBtn/);
  assert.match(pianoRollSrc, /\/api\/advance\/tts-cue/);
  assert.match(pianoRollSrc, /if \(!data\.isSimulated\)/);

  // page.tsx passes creditBalance + onCreditsChange to MiniPianoRollModal
  assert.match(pageSrc, /<MiniPianoRollModal[\s\S]*onCreditsChange=\{setCreditBalance\}/);

  // EasyModeStarterModal Hum Capture contracts
  assert.match(easyModalSrc, /t\.easyTabIdea/);
  assert.match(easyModalSrc, /t\.easyTabHum/);
  assert.match(easyModalSrc, /MicRecorder/);
  assert.match(easyModalSrc, /MAX_HUM_SECONDS\s*=\s*45/);
  assert.match(easyModalSrc, /\/api\/advance\/hum-to-song/);
  assert.match(easyModalSrc, /EASY_HUM_SONG_COST/);
  assert.match(easyModalSrc, /if \(!data\.isSimulated\)/);
});
