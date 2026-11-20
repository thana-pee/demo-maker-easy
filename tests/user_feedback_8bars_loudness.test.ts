/**
 * user_feedback_8bars_loudness.test.ts — Verification for:
 *   1. Easy Mode bar counts supporting up to 8 bars (2 / 4 / 6 / 8 cycle + AI prompt/schema/route/UI)
 *   2. Studio Loudness Gain Staging (mixerVolumeToGain, TRACK_GAIN_TRIM, createMasterBusChain,
 *      smplr volume: 127, barPlanner velocity non-crush, and Master Output 0–150% UI control)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  EASY_SECTION_BAR_STEPS,
  buildSimulatedArchitectSong,
  cycleEasySectionBars,
  sanitizeArchitectSongProject,
  type EasyArchitectInput,
} from '../src/lib/songArchitect';
import {
  ARCHITECT_RESPONSE_SCHEMA,
  buildEasyArchitectSystemPrompt,
  buildEasyArchitectUserPrompt,
} from '../src/lib/aiPrompts';
import { POST as architectPost } from '../src/app/api/advance/architect/route';
import {
  MASTER_LIMITER_THRESHOLD_DB,
  MASTER_MAKEUP_GAIN,
  TRACK_GAIN_TRIM,
  TRACK_PAN,
  VocalStudioTrackGainNode,
  GuitarRhythmTrackGainNode,
  LeadGuitarTrackGainNode,
  BassTrackGainNode,
  PianoTrackGainNode,
  TrackGainNode,
  createMasterBusChain,
  masterVolumeToGain,
  mixerVolumeToGain,
} from '../src/lib/audioDspShared';
import { createDefaultSong } from '../src/lib/defaultSong';
import { flattenSong, planBar, type PlannedEvent } from '../src/lib/barPlanner';
import type { SectionType, SongProject } from '../src/types/song';

function createMockMasterAudioCtx() {
  const created = {
    gains: [] as Array<{
      kind: 'gain';
      gain: { value: number; scheduled: Array<{ fn: string; v: number; t: number }> };
      connections: string[];
      disconnected: boolean;
    }>,
    panners: [] as Array<{ kind: 'panner'; pan: { value: number }; connections: string[]; disconnected: boolean }>,
    biquads: [] as Array<{
      kind: 'biquad';
      type: string;
      frequency: { value: number };
      gain: { value: number };
      Q: { value: number };
      connections: string[];
      disconnected: boolean;
    }>,
    compressors: [] as Array<{
      kind: 'compressor';
      threshold: { value: number; scheduled: Array<{ fn: string; v: number; t: number }> };
      knee: { value: number; scheduled: Array<{ fn: string; v: number; t: number }> };
      ratio: { value: number; scheduled: Array<{ fn: string; v: number; t: number }> };
      attack: { value: number; scheduled: Array<{ fn: string; v: number; t: number }> };
      release: { value: number; scheduled: Array<{ fn: string; v: number; t: number }> };
      connections: string[];
      disconnected: boolean;
    }>,
    convolvers: [] as Array<{ kind: 'convolver'; buffer: unknown; connections: string[]; disconnected: boolean }>,
    delays: [] as Array<{ kind: 'delay'; delayTime: { value: number }; connections: string[]; disconnected: boolean }>,
    waveShapers: [] as Array<{ kind: 'waveshaper'; curve: unknown; oversample: string; connections: string[]; disconnected: boolean }>,
    edges: [] as Array<[unknown, unknown]>,
  };

  const makeParam = (init = 0) => {
    const param = {
      value: init,
      scheduled: [] as Array<{ fn: string; v: number; t: number }>,
      setValueAtTime(v: number, t: number) {
        param.value = v;
        param.scheduled.push({ fn: 'setValueAtTime', v, t });
      },
      setTargetAtTime(v: number, t: number) {
        param.value = v;
        param.scheduled.push({ fn: 'setTargetAtTime', v, t });
      },
      linearRampToValueAtTime(v: number, t: number) {
        param.value = v;
        param.scheduled.push({ fn: 'linearRampToValueAtTime', v, t });
      },
      exponentialRampToValueAtTime(v: number, t: number) {
        param.value = v;
        param.scheduled.push({ fn: 'exponentialRampToValueAtTime', v, t });
      },
      cancelScheduledValues(t: number) {
        param.scheduled.push({ fn: 'cancelScheduledValues', v: 0, t });
      },
    };
    return param;
  };

  const destination = {
    kind: 'destination',
    connections: [] as string[],
    disconnected: false,
    connect: (d: unknown) => d,
    disconnect: () => {},
  };

  const attachMethods = <T extends { kind: string; connections: string[]; disconnected: boolean }>(node: T) => {
    const wrapped = Object.assign(node, {
      connect(dest: unknown) {
        const destKind = (dest as { kind?: string })?.kind ?? 'external';
        wrapped.connections.push(destKind);
        created.edges.push([wrapped, dest]);
        return dest;
      },
      disconnect() {
        wrapped.disconnected = true;
      },
    });
    return wrapped;
  };

  const ctx = {
    currentTime: 0,
    sampleRate: 44100,
    destination,
    createGain() {
      const node = attachMethods({
        kind: 'gain' as const,
        gain: makeParam(1),
        connections: [],
        disconnected: false,
      });
      created.gains.push(node);
      return node;
    },
    createStereoPanner() {
      const node = attachMethods({
        kind: 'panner' as const,
        pan: makeParam(0),
        connections: [],
        disconnected: false,
      });
      created.panners.push(node);
      return node;
    },
    createBiquadFilter() {
      const node = attachMethods({
        kind: 'biquad' as const,
        type: 'lowpass',
        frequency: makeParam(0),
        gain: makeParam(0),
        Q: makeParam(0),
        connections: [],
        disconnected: false,
      });
      created.biquads.push(node);
      return node;
    },
    createDynamicsCompressor() {
      const node = attachMethods({
        kind: 'compressor' as const,
        threshold: makeParam(-24),
        knee: makeParam(30),
        ratio: makeParam(12),
        attack: makeParam(0.003),
        release: makeParam(0.25),
        connections: [],
        disconnected: false,
      });
      created.compressors.push(node);
      return node;
    },
    createConvolver() {
      const node = attachMethods({
        kind: 'convolver' as const,
        buffer: null as unknown,
        connections: [],
        disconnected: false,
      });
      created.convolvers.push(node);
      return node;
    },
    createDelay() {
      const node = attachMethods({
        kind: 'delay' as const,
        delayTime: makeParam(0),
        connections: [],
        disconnected: false,
      });
      created.delays.push(node);
      return node;
    },
    createWaveShaper() {
      const node = attachMethods({
        kind: 'waveshaper' as const,
        curve: null as unknown,
        oversample: 'none',
        connections: [],
        disconnected: false,
      });
      created.waveShapers.push(node);
      return node;
    },
    createOscillator() {
      return attachMethods({
        kind: 'oscillator' as const,
        type: 'sine',
        frequency: makeParam(440),
        start() {},
        stop() {},
        connections: [],
        disconnected: false,
      });
    },
    createBuffer(channels: number, length: number, sampleRate: number) {
      const channelData = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        numberOfChannels: channels,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: (c: number) => channelData[c] || channelData[0],
      };
    },
  };

  return { ctx: ctx as unknown as BaseAudioContext, created, destination };
}

// ───────────────────────── Part 1: Easy Mode Up to 8 Bars ─────────────────────────

test('1.1 cycleEasySectionBars cycles 2 -> 4 -> 6 -> 8 -> 2 cleanly and handles edge values', () => {
  assert.deepEqual([...EASY_SECTION_BAR_STEPS], [2, 4, 6, 8]);
  assert.equal(cycleEasySectionBars(2), 4);
  assert.equal(cycleEasySectionBars(4), 6);
  assert.equal(cycleEasySectionBars(6), 8);
  assert.equal(cycleEasySectionBars(8), 2);

  // Edge values
  assert.equal(cycleEasySectionBars(1), 4);
  assert.equal(cycleEasySectionBars(3), 4);
  assert.equal(cycleEasySectionBars(5), 6);
  assert.equal(cycleEasySectionBars(7), 8);
  assert.equal(cycleEasySectionBars(10), 2);
  assert.equal(cycleEasySectionBars(Number.NaN), 4);
  assert.equal(cycleEasySectionBars(Number.POSITIVE_INFINITY), 4);
});

test('1.2 buildSimulatedArchitectSong supports 6-bar and 8-bar customStructure sections accurately', () => {
  const customStructure: Array<{ type: SectionType; bars: number; name?: string }> = [
    { type: 'intro', bars: 2, name: 'Intro' },
    { type: 'verse', bars: 8, name: 'Verse 1' },
    { type: 'chorus', bars: 8, name: 'Chorus 1' },
    { type: 'solo', bars: 6, name: 'Guitar Solo' },
    { type: 'outro', bars: 2, name: 'Outro' },
  ];

  const song = buildSimulatedArchitectSong({
    stylePreset: 'thai-pop-hit',
    vocalProfile: 'female',
    tempoFeel: 'medium',
    topic: 'คิดถึงวันฝนตกที่ริมหน้าต่าง',
    language: 'th',
    customStructure,
  });

  assert.equal(song.sections.length, 5);
  assert.deepEqual(
    song.sections.map((s) => s.bars.length),
    [2, 8, 8, 6, 2]
  );

  // Intro & Solo must have empty lyrics; Verse & Chorus must have lyrics on all 8 bars
  assert.ok(song.sections[0].bars.every((b) => b.lyrics === ''));
  assert.ok(song.sections[1].bars.every((b) => b.lyrics.trim().length > 0 && b.chords.length > 0 && b.melodyNotes.length > 0));
  assert.ok(song.sections[2].bars.every((b) => b.lyrics.trim().length > 0 && b.chords.length > 0 && b.melodyNotes.length > 0));
  assert.ok(song.sections[3].bars.every((b) => b.lyrics === '' && b.chords.length > 0));
  assert.ok(song.sections[4].bars.every((b) => b.lyrics.trim().length > 0));
});

test('1.3 sanitizeArchitectSongProject honors customStructure 8-bar count (pads short AI output & preserves full 8-bar output)', () => {
  const input: EasyArchitectInput = {
    stylePreset: 'warm-acoustic',
    vocalProfile: 'neutral',
    tempoFeel: 'medium',
    topic: 'สายลมยามเย็น',
    language: 'th',
    customStructure: [
      { type: 'intro', bars: 2, name: 'Intro' },
      { type: 'verse', bars: 8, name: 'Verse 1' },
      { type: 'chorus', bars: 8, name: 'Chorus 1' },
      { type: 'outro', bars: 2, name: 'Outro' },
    ],
  };

  // Case A: AI returns only 4 bars for Verse & Chorus -> sanitizer must pad cleanly to 8 cycling section chords
  const shortPayload = {
    title: 'Short Return Padded',
    bpm: 88,
    baseKey: 'G',
    sections: [
      { type: 'intro', intensity: 'low', bars: [{ chords: ['G'], lyrics: '' }, { chords: ['D'], lyrics: '' }] },
      {
        type: 'verse',
        intensity: 'low',
        bars: [
          { chords: ['G'], lyrics: 'บรรทัด 1' },
          { chords: ['D'], lyrics: 'บรรทัด 2' },
          { chords: ['Em'], lyrics: 'บรรทัด 3' },
          { chords: ['C'], lyrics: 'บรรทัด 4' },
        ],
      },
      {
        type: 'chorus',
        intensity: 'high',
        bars: [
          { chords: ['C'], lyrics: 'ฮุค 1' },
          { chords: ['G'], lyrics: 'ฮุค 2' },
          { chords: ['D'], lyrics: 'ฮุค 3' },
          { chords: ['Em'], lyrics: 'ฮุค 4' },
        ],
      },
      { type: 'outro', intensity: 'low', bars: [{ chords: ['G'], lyrics: 'จบ 1' }, { chords: ['G'], lyrics: 'จบ 2' }] },
    ],
  };

  const paddedSong = sanitizeArchitectSongProject(shortPayload, input);
  assert.deepEqual(
    paddedSong.sections.map((s) => s.bars.length),
    [2, 8, 8, 2]
  );
  // Bars 4..7 in Verse cycle its own sanitized chords ['G', 'D', 'Em', 'C']
  assert.deepEqual(
    paddedSong.sections[1].bars.map((b) => b.chords[0]),
    ['G', 'D', 'Em', 'C', 'G', 'D', 'Em', 'C']
  );

  // Case B: Full 8-bar payload preserved intact
  const fullPayload = {
    title: 'Full 8-Bar Payload',
    bpm: 88,
    baseKey: 'G',
    sections: [
      { type: 'intro', intensity: 'low', bars: [{ chords: ['G'], lyrics: '' }, { chords: ['D'], lyrics: '' }] },
      {
        type: 'verse',
        intensity: 'low',
        bars: Array.from({ length: 8 }, (_, idx) => ({ chords: ['G'], lyrics: `คำร้องท่อนแรก ${idx + 1}` })),
      },
      {
        type: 'chorus',
        intensity: 'high',
        bars: Array.from({ length: 8 }, (_, idx) => ({ chords: ['C'], lyrics: `ฮุคท่อนเต็ม ${idx + 1}` })),
      },
      { type: 'outro', intensity: 'low', bars: [{ chords: ['G'], lyrics: 'จบ 1' }, { chords: ['G'], lyrics: 'จบ 2' }] },
    ],
  };

  const fullSong = sanitizeArchitectSongProject(fullPayload, input);
  assert.deepEqual(
    fullSong.sections.map((s) => s.bars.length),
    [2, 8, 8, 2]
  );
  assert.equal(fullSong.sections[1].bars[7].lyrics, 'คำร้องท่อนแรก 8');
  assert.equal(fullSong.sections[2].bars[7].lyrics, 'ฮุคท่อนเต็ม 8');
});

test('1.4 ARCHITECT_RESPONSE_SCHEMA & Easy prompts cover 2-to-8 bars cleanly', () => {
  const sectionsSchema = (
    ARCHITECT_RESPONSE_SCHEMA.properties as Record<string, { items?: { properties?: { bars?: { description?: string } } } }>
  ).sections;
  const barsDesc = sectionsSchema?.items?.properties?.bars?.description ?? '';
  assert.match(barsDesc, /2 to 8 bars/);

  const sysPrompt = buildEasyArchitectSystemPrompt({ bpm: 88, timeSignature: '4/4' });
  assert.match(sysPrompt, /รองรับ 2–8 ห้อง/);

  const usrPrompt8 = buildEasyArchitectUserPrompt({
    stylePreset: 'warm-acoustic',
    vocalProfile: 'female',
    tempoFeel: 'medium',
    topic: 'เดินเล่นยามเช้า',
    language: 'th',
    recommendedBpm: 88,
    recommendedGuitarModel: 'classical-nylon',
    recommendedAmbience: 'living-room',
    customStructure: [
      { type: 'intro', bars: 2, name: 'Intro' },
      { type: 'verse', bars: 8, name: 'Verse 1' },
      { type: 'chorus', bars: 6, name: 'Chorus 1' },
      { type: 'outro', bars: 2, name: 'Outro' },
    ],
  });
  assert.match(usrPrompt8, /สำหรับท่อนที่กำหนด 6 หรือ 8 ห้อง/);
  assert.match(usrPrompt8, /จำนวน: 8 ห้อง/);
});

test('1.5 POST /api/advance/architect clamps customStructure bar counts (2..8) and returns exact requested bars offline', async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  try {
    const req = new Request('http://localhost/api/advance/architect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stylePreset: 'thai-pop-hit',
        vocalProfile: 'neutral',
        tempoFeel: 'medium',
        topic: 'เรื่องราวริมทะเล',
        language: 'th',
        customStructure: [
          { type: 'intro', bars: 1, name: 'Intro' }, // clamped -> 2
          { type: 'verse', bars: 8, name: 'Verse' }, // stays 8
          { type: 'chorus', bars: 12, name: 'Chorus' }, // clamped -> 8
          { type: 'outro', bars: 6, name: 'Outro' }, // stays 6
        ],
      }),
    });

    const res = await architectPost(req);
    assert.equal(res.status, 200);
    const data = (await res.json()) as { isSimulated: boolean; song: SongProject };
    assert.equal(data.isSimulated, true);
    assert.deepEqual(
      data.song.sections.map((s) => s.bars.length),
      [2, 8, 8, 6]
    );
  } finally {
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
    else delete process.env.GEMINI_API_KEY;
  }
});

test('1.6 EasyModeStarterModal UI contracts expose 2/4/6/8 cycling, totalActiveBars, and 8-bar helper button', () => {
  const easySrc = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'EasyModeStarterModal.tsx'),
    'utf8'
  );
  assert.match(easySrc, /cycleEasySectionBars/);
  assert.match(easySrc, /2 \/ 4 \/ 6 \/ 8/);
  assert.match(easySrc, /totalActiveBars/);
  assert.match(easySrc, /ตั้งท่อนร้อง\/โซโล่เป็น 8 บาร์/);
  assert.match(easySrc, /sec\.bars\.length/);
});

// ───────────────────────── Part 2: Studio Loudness Gain Staging ─────────────────────────

test('2.1 mixerVolumeToGain & masterVolumeToGain deliver higher calibrated gain than legacy 0-127 curve', () => {
  assert.equal(mixerVolumeToGain(0), 0);
  assert.equal(mixerVolumeToGain(-10), 0);
  assert.equal(mixerVolumeToGain(Number.NaN), 0);
  assert.ok(Math.abs(mixerVolumeToGain(100, 1.0) - 1.0) < 1e-9);
  assert.ok(Math.abs(mixerVolumeToGain(100, TRACK_GAIN_TRIM.guitarRhythm) - TRACK_GAIN_TRIM.guitarRhythm) < 1e-9);

  // Across active UI range 10..100, mixerVolumeToGain(..., 1.0) is strictly louder than legacy (v/127)^1.5
  for (let v = 10; v <= 100; v += 10) {
    const legacy = (v / 127) ** 1.5;
    const next = mixerVolumeToGain(v, 1.0);
    assert.ok(next > legacy, `Expected gain at v=${v} (${next.toFixed(4)}) > legacy (${legacy.toFixed(4)})`);
  }

  assert.equal(masterVolumeToGain(0), 0);
  assert.ok(Math.abs(masterVolumeToGain(100) - 1.0) < 1e-9);
  assert.ok(masterVolumeToGain(150) > 1.4, `Expected 150% master gain > 1.4, got ${masterVolumeToGain(150)}`);
});

test('2.2 createMasterBusChain builds glueCompressor -> masterMakeupGain -> masterLimiter -> destination + parallel reverb', () => {
  const { ctx, created, destination } = createMockMasterAudioCtx();
  const chain = createMasterBusChain(ctx, 'wood-studio', 100);

  // 2 compressors: glue (-14dB, 3:1) + brickwall limiter (-1.5dB, 20:1, 1ms attack)
  assert.equal(created.compressors.length, 2);
  assert.equal(chain.glueCompressor.threshold.value, -14);
  assert.equal(chain.glueCompressor.ratio.value, 3.0);
  assert.equal(chain.masterLimiter.threshold.value, MASTER_LIMITER_THRESHOLD_DB);
  assert.equal(chain.masterLimiter.ratio.value, 20);
  assert.equal(chain.masterLimiter.attack.value, 0.001);
  assert.ok(Math.abs(chain.masterMakeupGain.gain.value - MASTER_MAKEUP_GAIN) < 1e-6);

  // Verify routing graph edges
  const hasEdge = (from: unknown, to: unknown) =>
    created.edges.some(([a, b]) => a === from && b === to);
  assert.ok(hasEdge(chain.masterBus, chain.glueCompressor));
  assert.ok(hasEdge(chain.masterBus, chain.reverbConvolver));
  assert.ok(hasEdge(chain.reverbConvolver, chain.reverbWetGain));
  assert.ok(hasEdge(chain.reverbWetGain, chain.glueCompressor));
  assert.ok(hasEdge(chain.glueCompressor, chain.masterMakeupGain));
  assert.ok(hasEdge(chain.masterMakeupGain, chain.masterLimiter));
  assert.ok(hasEdge(chain.masterLimiter, destination));

  // Dynamic updates
  chain.setMasterVolume(150, 0);
  assert.ok(chain.masterBus.gain.value > 1.4);
  chain.setAmbience('unplugged-hall');
  assert.ok(chain.reverbWetGain.gain.value > 0.3);

  chain.disconnect();
  assert.equal(created.gains.every((g) => g.disconnected), true);
  assert.equal(created.compressors.every((c) => c.disconnected), true);
  assert.equal(created.convolvers.every((c) => c.disconnected), true);
});

test('2.3 TrackGainNode subclasses apply TRACK_GAIN_TRIM without adding extra audio nodes', () => {
  const { ctx, created, destination } = createMockMasterAudioCtx();

  const vocal = new VocalStudioTrackGainNode(ctx, destination as unknown as AudioNode, 100, 0);
  assert.equal(created.biquads.length, 2, 'VocalStudioTrackGainNode must keep exactly 2 biquads (HPF + Presence)');
  assert.equal(created.compressors.length, 1, 'VocalStudioTrackGainNode must keep exactly 1 compressor');
  // masterGain is the first GainNode created by TrackGainNode constructor
  assert.ok(Math.abs(created.gains[0].gain.value - TRACK_GAIN_TRIM.vocal) < 1e-6);
  vocal.disconnect();

  const r = new GuitarRhythmTrackGainNode(ctx, destination as unknown as AudioNode, 100, TRACK_PAN.guitarRhythm, 'dreadnought-steel');
  const l = new LeadGuitarTrackGainNode(ctx, destination as unknown as AudioNode, 100, TRACK_PAN.guitarLead);
  const b = new BassTrackGainNode(ctx, destination as unknown as AudioNode, 100, TRACK_PAN.bass);
  const p = new PianoTrackGainNode(ctx, destination as unknown as AudioNode, 100, TRACK_PAN.piano);
  const d = new TrackGainNode(ctx, destination as unknown as AudioNode, 100, TRACK_PAN.drums, TRACK_GAIN_TRIM.drums);

  // Verify each subclass masterGain holds its respective trim at 100%
  const masterGains = created.gains.filter((g) => Math.abs(g.gain.value - 1) > 0.01);
  assert.ok(masterGains.some((g) => Math.abs(g.gain.value - TRACK_GAIN_TRIM.guitarRhythm) < 1e-6));
  assert.ok(masterGains.some((g) => Math.abs(g.gain.value - TRACK_GAIN_TRIM.guitarLead) < 1e-6));
  assert.ok(masterGains.some((g) => Math.abs(g.gain.value - TRACK_GAIN_TRIM.bass) < 1e-6));
  assert.ok(masterGains.some((g) => Math.abs(g.gain.value - TRACK_GAIN_TRIM.piano) < 1e-6));

  r.disconnect();
  l.disconnect();
  b.disconnect();
  p.disconnect();
  d.disconnect();
});

test('2.4 barPlanner uses gentle touch curve for secVol (avoids double attenuation) and preserves low < medium < high', () => {
  const song = createDefaultSong();
  const chorusIdx = song.sections.findIndex((s) => s.type === 'chorus');
  assert.ok(chorusIdx >= 0);

  const flatFull = flattenSong(song);
  const chorusBar = flatFull.findIndex((f) => f.sectionIndex === chorusIdx);
  const fullNotes = planBar(song, flatFull, chorusBar).events.filter(
    (e): e is Extract<PlannedEvent, { kind: 'note' }> => e.kind === 'note' && e.track === 'guitarRhythm'
  );

  // secVol = 75 -> 0.7 + 0.3 * 0.75 = 0.925 (much stronger than legacy 0.75 double attenuation)
  const song75 = createDefaultSong();
  song75.sections[chorusIdx].instruments.guitarRhythmVolume = 75;
  const notes75 = planBar(song75, flattenSong(song75), chorusBar).events.filter(
    (e): e is Extract<PlannedEvent, { kind: 'note' }> => e.kind === 'note' && e.track === 'guitarRhythm'
  );
  const ratio75 = notes75[0].vel / fullNotes[0].vel;
  assert.ok(ratio75 >= 0.88 && ratio75 <= 0.96, `Expected ~0.925 velocity ratio at secVol=75%, got ${ratio75}`);

  // secVol = 50 still lowers velocity vs 100%, secVol = 0 mutes
  const song50 = createDefaultSong();
  song50.sections[chorusIdx].instruments.guitarRhythmVolume = 50;
  const notes50 = planBar(song50, flattenSong(song50), chorusBar).events.filter(
    (e): e is Extract<PlannedEvent, { kind: 'note' }> => e.kind === 'note' && e.track === 'guitarRhythm'
  );
  assert.ok(notes50[0].vel < fullNotes[0].vel);

  const song0 = createDefaultSong();
  song0.sections[chorusIdx].instruments.guitarRhythmVolume = 0;
  const notes0 = planBar(song0, flattenSong(song0), chorusBar).events.filter(
    (e): e is Extract<PlannedEvent, { kind: 'note' }> => e.kind === 'note' && e.track === 'guitarRhythm'
  );
  assert.equal(notes0.length, 0);

  // Intensity ordering low (0.82) < medium (0.91) < high (1.0)
  const makeIntensityAvg = (intensity: 'low' | 'medium' | 'high') => {
    const s = createDefaultSong();
    s.sections[chorusIdx].intensity = intensity;
    const evs = planBar(s, flattenSong(s), chorusBar).events.filter(
      (e): e is Extract<PlannedEvent, { kind: 'note' }> => e.kind === 'note' && e.track === 'guitarRhythm'
    );
    return evs.reduce((sum, e) => sum + e.vel, 0) / evs.length;
  };
  const avgLow = makeIntensityAvg('low');
  const avgMed = makeIntensityAvg('medium');
  const avgHigh = makeIntensityAvg('high');
  assert.ok(avgLow < avgMed && avgMed < avgHigh, `Expected low(${avgLow}) < med(${avgMed}) < high(${avgHigh})`);
});

test('2.5 Live audioEngine, mp3Exporter, useAudioEngine, and SoundCustomizerPanel share studio loudness parity', () => {
  const root = process.cwd();
  const engineSrc = fs.readFileSync(path.join(root, 'src', 'lib', 'audioEngine.ts'), 'utf8');
  const exporterSrc = fs.readFileSync(path.join(root, 'src', 'lib', 'mp3Exporter.ts'), 'utf8');
  const hookSrc = fs.readFileSync(path.join(root, 'src', 'hooks', 'useAudioEngine.ts'), 'utf8');
  const panelSrc = fs.readFileSync(path.join(root, 'src', 'components', 'SoundCustomizerPanel.tsx'), 'utf8');

  assert.match(engineSrc, /volume:\s*127/);
  assert.match(exporterSrc, /volume:\s*127/);
  assert.match(engineSrc, /createMasterBusChain\(/);
  assert.match(exporterSrc, /createMasterBusChain\(/);
  assert.match(hookSrc, /setMasterVolume\(/);
  assert.match(panelSrc, /masterVolume/);
  assert.match(panelSrc, /max="150"/);
  assert.match(panelSrc, /Studio Limiter ON/);
});
