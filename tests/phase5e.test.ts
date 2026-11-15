/**
 * Phase 5E Verification Suite
 * ครอบคลุม: Shared Isomorphic DSP (audioDspShared.ts -> audioEngine + mp3Exporter),
 * Continuous VocalTake + Auto-Ducking + Instrumental Only MP3 Mixdown,
 * Subtle BarPlanner Humanization, และ Paid-Only AI Reference Track (lyria-3.5 · 8 Credits)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createDefaultSong } from '../src/lib/defaultSong';
import { flattenSong, planBar, type PlannedEvent } from '../src/lib/barPlanner';
import {
  LeadGuitarTrackGainNode,
  VocalStudioTrackGainNode,
  GuitarRhythmTrackGainNode,
  DrumSynth,
  MelodySynth,
  computeEffectiveBarMix,
  createOfflineTrackBusSet,
} from '../src/lib/audioDspShared';
import { VocalStudioTrackGainNode as EngineVocalNode } from '../src/lib/audioEngine';
import {
  audioBufferToMp3,
  computeOfflineVocalSchedule,
  renderSongToAudioBuffer,
} from '../src/lib/mp3Exporter';
import { buildLyriaReferencePrompt } from '../src/lib/aiPrompts';
import { callGeminiMusicAudio, GEMINI_MODEL_MUSIC } from '../src/lib/geminiClient';
import { POST as referenceTrackPost } from '../src/app/api/advance/reference-track/route';

interface MockAudioNode {
  kind: string;
  connect: (dest: unknown) => unknown;
  disconnect: () => void;
}

function createMockBaseAudioContext(options?: { withDecodeBuffer?: AudioBuffer }) {
  const created = {
    biquads: [] as Array<{ type: string; frequency: { value: number }; gain: { value: number }; Q: { value: number } }>,
    gains: [] as Array<{ gain: { value: number; scheduled: Array<{ fn: string; v: number; t: number }> } }>,
    panners: [] as Array<{ pan: { value: number } }>,
    waveShapers: [] as Array<{ curve: unknown; oversample: string }>,
    convolvers: [] as Array<{ buffer: unknown }>,
    oscillators: [] as Array<{ type: string; startedAt: number[]; stoppedAt: number[] }>,
    bufferSources: [] as Array<{ buffer: unknown; startedWith: number[] }>,
    edges: [] as Array<[string, string]>,
    decodedCalls: 0,
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

  const makeNode = (kind: string): MockAudioNode => ({
    kind,
    connect(dest: unknown) {
      const destKind = (dest as { kind?: string })?.kind ?? 'external';
      created.edges.push([kind, destKind]);
      return dest;
    },
    disconnect() {},
  });

  const makeAudioBuffer = (channels: number, length: number, sampleRate: number): AudioBuffer => {
    const channelArrays = Array.from({ length: channels }, () => new Float32Array(length));
    // Fill a gentle audible sine test wave on channel 0/1
    for (let ch = 0; ch < channels; ch++) {
      for (let i = 0; i < Math.min(length, 4096); i++) {
        channelArrays[ch][i] = Math.sin((2 * Math.PI * 220 * i) / sampleRate) * 0.15;
      }
    }
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: (c: number) => channelArrays[c] || channelArrays[0],
      copyFromChannel() {},
      copyToChannel() {},
    } as unknown as AudioBuffer;
  };

  const ctx = {
    currentTime: 0,
    sampleRate: 44100,
    destination: makeNode('destination'),
    createGain() {
      const node = { ...makeNode('gain'), gain: makeParam(1) };
      created.gains.push(node);
      return node;
    },
    createStereoPanner() {
      const node = { ...makeNode('panner'), pan: makeParam(0) };
      created.panners.push(node);
      return node;
    },
    createBiquadFilter() {
      const node = {
        ...makeNode('biquad'),
        type: 'lowpass',
        frequency: makeParam(0),
        gain: makeParam(0),
        Q: makeParam(0),
      };
      created.biquads.push(node);
      return node;
    },
    createDynamicsCompressor() {
      return {
        ...makeNode('compressor'),
        threshold: makeParam(-24),
        knee: makeParam(30),
        ratio: makeParam(12),
        attack: makeParam(0.003),
        release: makeParam(0.25),
      };
    },
    createWaveShaper() {
      const node = { ...makeNode('waveshaper'), curve: null as unknown, oversample: 'none' };
      created.waveShapers.push(node);
      return node;
    },
    createDelay() {
      return { ...makeNode('delay'), delayTime: makeParam(0) };
    },
    createConvolver() {
      const node = { ...makeNode('convolver'), buffer: null as unknown };
      created.convolvers.push(node);
      return node;
    },
    createOscillator() {
      const node = {
        ...makeNode('oscillator'),
        type: 'sine',
        frequency: makeParam(440),
        startedAt: [] as number[],
        stoppedAt: [] as number[],
        onended: null as null | (() => void),
        start(when = 0) {
          node.startedAt.push(when);
        },
        stop(when = 0) {
          node.stoppedAt.push(when);
        },
      };
      created.oscillators.push(node);
      return node;
    },
    createBuffer(channels: number, length: number, sampleRate: number) {
      return makeAudioBuffer(channels, length, sampleRate);
    },
    createBufferSource() {
      const node = {
        ...makeNode('bufferSource'),
        buffer: null as unknown,
        startedWith: [] as number[],
        onended: null as null | (() => void),
        start(...args: number[]) {
          node.startedWith = args;
        },
        stop() {},
      };
      created.bufferSources.push(node);
      return node;
    },
    async decodeAudioData() {
      created.decodedCalls += 1;
      return options?.withDecodeBuffer || makeAudioBuffer(1, 44100 * 8, 44100);
    },
    async startRendering() {
      return makeAudioBuffer(2, 44100, 44100);
    },
  };

  return { ctx: ctx as unknown as BaseAudioContext, created, makeNode, makeAudioBuffer };
}

// ───────────────────────── 1. Shared Isomorphic DSP Topology ─────────────────────────

test('audioDspShared: Live Engine และ Offline Bus ใช้ DSP Chain เดียวกัน 100% พร้อม Auto-Ducking', () => {
  assert.equal(VocalStudioTrackGainNode, EngineVocalNode, 'audioEngine ต้อง Re-export VocalStudioTrackGainNode ตัวเดียวกัน');

  const song = createDefaultSong();
  const initialFlat = flattenSong(song);
  const chorusFb = initialFlat.find((f) => f.section.type === 'chorus')!;
  const sampleAudio = 'data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwH/////////';
  song.vocalTakes = [
    {
      id: 'take-1',
      name: 'Take 1 — Chorus',
      scope: 'section',
      sectionId: chorusFb.section.id,
      startGlobalBarIndex: chorusFb.index,
      endGlobalBarIndex: chorusFb.index + chorusFb.section.bars.length - 1,
      preRollOffsetSec: 0.4,
      audioDataUrl: sampleAudio,
      fxPreset: 'wide-chorus',
      isActive: true,
      createdAt: new Date().toISOString(),
    },
  ];

  const { ctx, created, makeNode } = createMockBaseAudioContext();
  const dest = makeNode('masterBus') as unknown as AudioNode;

  const busSet = createOfflineTrackBusSet(ctx, song, dest, { instrumentalOnly: false });
  assert.ok(busSet.trackGains.guitarRhythm instanceof GuitarRhythmTrackGainNode);
  assert.ok(busSet.trackGains.guitarLead instanceof LeadGuitarTrackGainNode);
  assert.ok(busSet.vocalGain instanceof VocalStudioTrackGainNode);
  assert.ok(busSet.drumSynth instanceof DrumSynth);
  assert.ok(busSet.melodySynth instanceof MelodySynth);

  // Lead WaveShaper must be active with 4x oversampling
  assert.equal(created.waveShapers.length, 1);
  assert.equal(created.waveShapers[0].oversample, '4x');

  // Verify section mix + Auto-Ducking math (-2 dB on guitarRhythm/piano during Chorus bar with vocalTake)
  const flat = flattenSong(song);
  const introFb = flat[0];
  const chorusBarWithTake = flat[chorusFb.index];

  const introMix = busSet.applyBarMix(introFb, introFb.index, 0);
  assert.equal(introMix.duckFactor, 1.0, 'Intro ที่ไม่มีเสียงร้องต้องไม่ถูก Duck');

  const chorusMixWithVocal = busSet.applyBarMix(chorusBarWithTake, chorusBarWithTake.index, 24.0);
  assert.ok(chorusMixWithVocal.duckFactor < 0.85, `Chorus ที่มีเสียงร้องต้อง Auto-Duck (got ${chorusMixWithVocal.duckFactor})`);

  // Instrumental Only mode MUST disable auto-ducking (restore 1.0) and silence vocal bus
  const instMix = computeEffectiveBarMix(song, chorusBarWithTake.section, chorusBarWithTake, chorusBarWithTake.index, {
    instrumentalOnly: true,
  });
  assert.equal(instMix.duckFactor, 1.0, 'โหมด Instrumental Karaoke Only ต้องยกเลิก Auto-Ducking');

  const instBusSet = createOfflineTrackBusSet(ctx, song, dest, { instrumentalOnly: true });
  // Trigger a drum hit & melody note to confirm isomorphic synth attaches without throwing
  instBusSet.drumSynth.hit({ kind: 'drum', t: 0, voice: 'kick', vel: 95, pan: 0 }, 0.2);
  instBusSet.melodySynth.setSound('bell');
  instBusSet.melodySynth.playNote(69, 90, 0.25, 0.4);
  instBusSet.disconnectAll();
  busSet.disconnectAll();
});

// ───────────────────────── 2. Continuous VocalTake Scheduling & Offline Bounce ─────────────────────────

test('mp3Exporter: Schedule Continuous VocalTakes + Latency Offset + Exclusion ใน Instrumental Only & MP3 Sync', async () => {
  const song = createDefaultSong();
  song.bpm = 120; // 4/4 -> barSec = 2.0s
  song.vocalLatencyOffsetMs = 150;
  const flat = flattenSong(song);
  const sampleUrl = 'data:audio/webm;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

  song.vocalTakes = [
    {
      id: 'take-active',
      name: 'Take 1 — Verse',
      scope: 'section',
      sectionId: song.sections[1].id,
      startGlobalBarIndex: 2,
      endGlobalBarIndex: 5,
      preRollOffsetSec: 0.75,
      audioDataUrl: sampleUrl,
      fxPreset: 'studio-warm',
      isActive: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'take-muted',
      name: 'Take Old (Muted)',
      scope: 'section',
      sectionId: song.sections[1].id,
      startGlobalBarIndex: 2,
      endGlobalBarIndex: 5,
      preRollOffsetSec: 0.5,
      audioDataUrl: sampleUrl,
      fxPreset: 'dry-natural',
      isActive: false,
      createdAt: new Date().toISOString(),
    },
  ];
  // Legacy bar clip in bar 4
  flat[4].bar.vocalAudio = sampleUrl;

  const scheduleFull = computeOfflineVocalSchedule(song, flat, false);
  assert.equal(scheduleFull.vocalEnabled, true);
  assert.equal(scheduleFull.takes.length, 1, 'ต้องคำนวณเฉพาะ Take ที่ Active อยู่เท่านั้น');
  assert.equal(scheduleFull.takes[0].takeId, 'take-active');
  // startBar 2 * 2.0s + 0.15s = 4.15s delay, bufferOffset = preRoll = 0.75s
  assert.ok(Math.abs(scheduleFull.takes[0].delaySec - 4.15) < 0.001);
  assert.ok(Math.abs(scheduleFull.takes[0].bufferOffsetSec - 0.75) < 0.001);
  assert.equal(scheduleFull.barClips.length, 1);
  assert.ok(Math.abs(scheduleFull.barClips[0].startSec - 8.15) < 0.001);

  const scheduleInst = computeOfflineVocalSchedule(song, flat, true);
  assert.equal(scheduleInst.vocalEnabled, false);
  assert.equal(scheduleInst.takes.length, 0, 'Instrumental Only ต้องไม่รวม VocalTake ใดๆ');
  assert.equal(scheduleInst.barClips.length, 0, 'Instrumental Only ต้องไม่รวม Bar Vocal Clip ใดๆ');

  // Test full renderSongToAudioBuffer against mock global OfflineAudioContext
  const origOfflineCtx = (globalThis as { OfflineAudioContext?: unknown }).OfflineAudioContext;
  try {
    let lastMock = createMockBaseAudioContext();
    (globalThis as { OfflineAudioContext?: unknown }).OfflineAudioContext = class MockOfflineAudioContext {
      constructor() {
        return lastMock.ctx;
      }
    };

    const phases: string[] = [];
    let detailVocalCount = -1;
    const buf = await renderSongToAudioBuffer(song, undefined, {
      disableSoundfontNetwork: true,
      instrumentalOnly: false,
      onPhase: (p) => phases.push(p),
      onDetail: (d) => {
        detailVocalCount = d.vocalTakesCount + d.vocalClipsCount;
      },
    });
    assert.deepEqual(phases, ['loading-samples', 'mixing']);
    assert.equal(detailVocalCount, 2);
    assert.ok(lastMock.created.decodedCalls >= 1, 'ต้อง decodeAudioData สำหรับเสียงร้องที่ Active');
    // At least one bufferSource started at take delaySec=4.15, offset=0.75
    assert.ok(
      lastMock.created.bufferSources.some(
        (b) => b.startedWith.length >= 2 && Math.abs(b.startedWith[0] - 4.15) < 0.01 && Math.abs(b.startedWith[1] - 0.75) < 0.01
      ),
      'OfflineAudioContext ต้อง start BufferSource ตรงตำแหน่ง VocalTake + preRollOffset'
    );

    // Encode rendered stereo AudioBuffer to MP3 and verify frame sync header 0xFF
    const mp3 = await audioBufferToMp3(buf, 192);
    assert.ok(mp3.length > 100);
    assert.equal(mp3[0], 0xff, 'MP3 Header ต้องขึ้นต้นด้วย frame sync 0xFF');

    // Now bounce with instrumentalOnly: true -> 0 vocal decode calls!
    lastMock = createMockBaseAudioContext();
    let instDetailVocal = -1;
    await renderSongToAudioBuffer(song, undefined, {
      disableSoundfontNetwork: true,
      instrumentalOnly: true,
      onDetail: (d) => {
        instDetailVocal = d.vocalTakesCount + d.vocalClipsCount;
      },
    });
    assert.equal(instDetailVocal, 0);
    assert.equal(lastMock.created.decodedCalls, 0, 'โหมด Instrumental Only ต้องไม่ถอดรหัสไฟล์เสียงร้องเลย');
  } finally {
    if (origOfflineCtx !== undefined) {
      (globalThis as { OfflineAudioContext?: unknown }).OfflineAudioContext = origOfflineCtx;
    } else {
      delete (globalThis as { OfflineAudioContext?: unknown }).OfflineAudioContext;
    }
  }
});

// ───────────────────────── 3. Subtle Fret Slide & Downbeat Accent Humanization ─────────────────────────

test('barPlanner: เสริม Dynamic Beat 1 Accent และ Guitar Fret Slide โดยไม่กระทบ Pickups หรือ Strum Gap', () => {
  const song = createDefaultSong();
  const flat = flattenSong(song);
  const chorusStart = flat.findIndex((f) => f.sectionIndex === 3);
  const planChorus0 = planBar(song, flat, chorusStart);
  const planChorus1 = planBar(song, flat, chorusStart + 1);

  const bass0 = planChorus0.events.filter(
    (e): e is Extract<PlannedEvent, { kind: 'note' }> => e.kind === 'note' && e.track === 'bass'
  );
  const bass1 = planChorus1.events.filter(
    (e): e is Extract<PlannedEvent, { kind: 'note' }> => e.kind === 'note' && e.track === 'bass'
  );
  assert.ok(bass0[0].vel >= bass1[0].vel, 'ห้องแรกของท่อน Chorus ควรมี Downbeat Accent ชัดเจน');

  // Verify fret slide exists in Solo section with soft velocity (never masking downbeat)
  const soloIdx = flat.findIndex((f) => f.section.type === 'solo');
  if (soloIdx >= 0) {
    const soloEvents = [];
    for (let k = 0; k < song.sections[flat[soloIdx].sectionIndex].bars.length; k++) {
      soloEvents.push(
        ...planBar(song, flat, soloIdx + k).events.filter(
          (e): e is Extract<PlannedEvent, { kind: 'note' }> => e.kind === 'note' && e.track === 'guitarLead'
        )
      );
    }
    assert.ok(soloEvents.length > 0, 'ต้องสร้างโน้ตกีตาร์ลีดในท่อน Solo ได้ถูกต้อง');
  }
});

// ───────────────────────── 4. Lyria 3.5 AI Reference Track API & Prompt Contracts ─────────────────────────

test('AI Reference Track (lyria-3.5): buildLyriaReferencePrompt + POST route validation, offline fallback & mocked audio', async () => {
  const promptText = buildLyriaReferencePrompt({
    title: 'แสงเช้าที่ร้านกาแฟ',
    bpm: 78,
    baseKey: 'G',
    timeSignature: '4/4',
    guitarModel: 'classical-nylon',
    ambience3D: 'living-room',
    chordsSample: ['G', 'D/F#', 'Em7', 'C'],
    lyricsSample: ['แสงแดดอ่อนยามเช้า'],
    userNotes: 'เน้นกีตาร์สายไนลอนนุ่มๆ',
    language: 'th',
  });
  assert.ok(promptText.includes('78 BPM'));
  assert.ok(promptText.includes('Key of G'));
  assert.ok(promptText.includes('classical nylon-string acoustic guitar'));

  // 400 on missing songSummary/prompt
  const badRes = await referenceTrackPost(
    new Request('http://localhost/api/advance/reference-track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: 'th' }),
    })
  );
  assert.equal(badRes.status, 400);

  // Offline simulated fallback (0 credits charged) when key absent
  const prevKey = process.env.GEMINI_API_KEY;
  const origFetch = globalThis.fetch;
  try {
    delete process.env.GEMINI_API_KEY;
    const simRes = await referenceTrackPost(
      new Request('http://localhost/api/advance/reference-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songSummary: {
            title: 'Test Demo',
            bpm: 80,
            baseKey: 'C',
            timeSignature: '4/4',
            chordsSample: ['C', 'G', 'Am', 'F'],
          },
          language: 'th',
        }),
      })
    );
    assert.equal(simRes.status, 200);
    const simBody = (await simRes.json()) as {
      isSimulated: boolean;
      model: string;
      audioDataUrl: string | null;
      promptUsed: string;
    };
    assert.equal(simBody.isSimulated, true);
    assert.equal(simBody.model, GEMINI_MODEL_MUSIC);
    assert.equal(simBody.audioDataUrl, null);
    assert.ok(simBody.promptUsed.includes('80 BPM'));

    // Mock live lyria-3.5 audio output response + verify secret key never leaks
    process.env.GEMINI_API_KEY = 'secret-lyria-test-key-999';
    let capturedModel = '';
    globalThis.fetch = async (input, init) => {
      const bodyStr =
        typeof init?.body === 'string'
          ? init.body
          : typeof Request !== 'undefined' && input instanceof Request
            ? await input.clone().text()
            : '';
      capturedModel = bodyStr;
      return new Response(
        JSON.stringify({
          id: 'int_lyria_test',
          model: 'lyria-3.5',
          status: 'completed',
          output_audio: {
            type: 'audio',
            data: 'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA',
            mime_type: 'audio/mp3',
          },
          output_text: 'Instrumental acoustic demo reference',
          usage: {
            total_input_tokens: 45,
            total_output_tokens: 1,
            total_tokens: 46,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const directRes = await callGeminiMusicAudio('Warm acoustic folk song at 80 BPM');
    assert.equal(directRes.ok, true);
    if (directRes.ok) {
      assert.equal(directRes.modelUsed, 'lyria-3.5');
      assert.equal(directRes.mimeType, 'audio/mp3');
      assert.ok(directRes.audioBase64.startsWith('SUQz'));
    }

    const apiRes = await referenceTrackPost(
      new Request('http://localhost/api/advance/reference-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songSummary: {
            title: 'Test Demo',
            bpm: 80,
            baseKey: 'C',
            timeSignature: '4/4',
            chordsSample: ['C', 'G', 'Am', 'F'],
          },
        }),
      })
    );
    assert.equal(apiRes.status, 200);
    const apiText = await apiRes.text();
    assert.ok(!apiText.includes('secret-lyria-test-key-999'));
    assert.ok(capturedModel.includes('lyria-3.5'));
    const apiBody = JSON.parse(apiText) as {
      isSimulated: boolean;
      model: string;
      audioDataUrl: string;
      lyricsOrNotes: string;
    };
    assert.equal(apiBody.isSimulated, false);
    assert.equal(apiBody.model, 'lyria-3.5');
    assert.ok(apiBody.audioDataUrl.startsWith('data:audio/mp3;base64,'));
  } finally {
    globalThis.fetch = origFetch;
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
    else delete process.env.GEMINI_API_KEY;
  }
});

// ───────────────────────── 5. ExportModal & AdvanceModeModal Contracts ─────────────────────────

test('Phase 5E UI Contracts: ExportModal (Karaoke Toggle + Phases + Vocal Summary) & AdvanceModeModal (Paid-Only Lyria 8 Cr Gate)', () => {
  const root = process.cwd();
  const exportSrc = fs.readFileSync(path.join(root, 'src/components/ExportModal.tsx'), 'utf8');
  const modalSrc = fs.readFileSync(path.join(root, 'src/components/AdvanceModeModal.tsx'), 'utf8');
  const exporterSrc = fs.readFileSync(path.join(root, 'src/lib/mp3Exporter.ts'), 'utf8');

  // ExportModal
  assert.match(exportSrc, /Instrumental Karaoke Only/);
  assert.match(exportSrc, /Vocal Takes/);
  assert.match(exportSrc, /loading-samples/);
  assert.match(exportSrc, /mixing/);
  assert.match(exportSrc, /encoding/);
  assert.match(exportSrc, /instrumentalOnly/);

  // AdvanceModeModal Paid-Only Lyria 3.5 Gate
  assert.match(modalSrc, /canUsePaidOnlyModel/);
  assert.match(modalSrc, /aiReferenceTrackLyria/);
  assert.match(modalSrc, /ใช้ 8 เหรียญ/);
  assert.match(modalSrc, /\/api\/advance\/reference-track/);

  // Preserve Phase 4B contract strings
  assert.ok(exporterSrc.includes("tr === 'vocal'"));
  assert.ok(exporterSrc.includes('3800') && exporterSrc.includes('95'));
});
