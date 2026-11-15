import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createDefaultSong } from '../src/lib/defaultSong';
import {
  flattenSong,
  planBar,
  type PlannedEvent,
  type DrumVoice,
} from '../src/lib/barPlanner';
import {
  TRACK_PAN,
  DrumSynth,
  BassTrackGainNode,
  PianoTrackGainNode,
  createOfflineTrackBusSet,
} from '../src/lib/audioDspShared';
import {
  BassTrackGainNode as EngineBassTrackGainNode,
  PianoTrackGainNode as EnginePianoTrackGainNode,
  TRACK_PAN as ENGINE_TRACK_PAN,
} from '../src/lib/audioEngine';
import {
  applyGenreBandArrangement,
  sanitizeArchitectSongProject,
} from '../src/lib/songArchitect';
import { generateMidiFile } from '../src/lib/midiExport';
import type {
  SongProject,
  GuitarStyle,
  BassStyle,
  PianoStyle,
  DrumStyle,
  TimeSignature,
} from '../src/types/song';

function cloneSong(song: SongProject): SongProject {
  return JSON.parse(JSON.stringify(song)) as SongProject;
}

function makeTestSong(opts: {
  timeSignature?: TimeSignature;
  rhythm?: GuitarStyle;
  bass?: BassStyle;
  piano?: PianoStyle;
  drums?: DrumStyle;
  intensity?: 'low' | 'medium' | 'high';
  bassOn?: boolean;
  pianoOn?: boolean;
  drumsOn?: boolean;
  rhythmOn?: boolean;
  leadOn?: boolean;
  lyrics?: string;
  barsCount?: number;
} = {}): SongProject {
  const base = createDefaultSong();
  const ts = opts.timeSignature ?? '4/4';
  const rhythm = opts.rhythm ?? 'campfire-strum';
  const bass = opts.bass ?? 'root-fifth';
  const piano = opts.piano ?? 'warm-pad';
  const drums = opts.drums ?? 'simple-kit';
  const count = opts.barsCount ?? 2;

  base.timeSignature = ts;
  base.mixer.guitarRhythm = { ...base.mixer.guitarRhythm, enabled: opts.rhythmOn ?? true, style: rhythm };
  base.mixer.bass = { ...base.mixer.bass, enabled: opts.bassOn ?? true, style: bass };
  base.mixer.piano = { ...base.mixer.piano, enabled: opts.pianoOn ?? true, style: piano };
  base.mixer.drums = { ...base.mixer.drums, enabled: opts.drumsOn ?? true, style: drums };
  base.mixer.guitarLead = { ...base.mixer.guitarLead, enabled: opts.leadOn ?? false, style: 'riff-fills' };

  base.sections = [
    {
      id: 'sec-test-1',
      type: 'verse',
      name: 'Verse',
      intensity: opts.intensity ?? 'medium',
      instruments: {
        guitarRhythm: opts.rhythmOn ?? true,
        guitarRhythmStyle: rhythm,
        guitarLead: opts.leadOn ?? false,
        guitarLeadStyle: 'riff-fills',
        guitarLeadDrive: 'clean',
        bass: opts.bassOn ?? true,
        bassStyle: bass,
        piano: opts.pianoOn ?? true,
        pianoStyle: piano,
        drums: opts.drumsOn ?? true,
        drumsStyle: drums,
      },
      bars: Array.from({ length: count }, (_, i) => ({
        id: `bar-t-${i}`,
        chordsPerBar: 1,
        chords: i % 2 === 0 ? ['C'] : ['G'],
        playStyle: 'normal',
        lyrics: opts.lyrics ?? '',
        melodyNotes: [],
      })),
    },
    {
      id: 'sec-test-2',
      type: 'chorus',
      name: 'Chorus',
      intensity: 'high',
      instruments: {
        guitarRhythm: opts.rhythmOn ?? true,
        guitarRhythmStyle: rhythm,
        guitarLead: opts.leadOn ?? false,
        guitarLeadStyle: 'riff-fills',
        guitarLeadDrive: 'overdrive',
        bass: opts.bassOn ?? true,
        bassStyle: bass,
        piano: opts.pianoOn ?? true,
        pianoStyle: piano,
        drums: opts.drumsOn ?? true,
        drumsStyle: drums,
      },
      bars: [
        {
          id: 'bar-c-0',
          chordsPerBar: 1,
          chords: ['Am'],
          playStyle: 'normal',
          lyrics: '',
          melodyNotes: [],
        },
      ],
    },
  ];
  return base;
}

function assertAllEventsFinite(events: PlannedEvent[]) {
  for (const ev of events) {
    assert.ok(Number.isFinite(ev.t) && ev.t >= 0, `Invalid event time t=${ev.t}`);
    if (ev.kind === 'note') {
      assert.ok(Number.isFinite(ev.dur) && ev.dur > 0, `Invalid note dur=${ev.dur}`);
      assert.ok(Number.isFinite(ev.vel) && ev.vel > 0, `Invalid note vel=${ev.vel}`);
      assert.ok(Number.isFinite(ev.midi) && ev.midi >= 0 && ev.midi <= 127, `Invalid midi=${ev.midi}`);
    } else if (ev.kind === 'drum') {
      assert.ok(Number.isFinite(ev.vel) && ev.vel >= 0, `Invalid drum vel=${ev.vel}`);
      assert.ok(Number.isFinite(ev.pan) && ev.pan >= -1 && ev.pan <= 1, `Invalid drum pan=${ev.pan}`);
    }
  }
}

function createMockAudioContext() {
  const createdBiquads: Array<{
    type: BiquadFilterType;
    frequency: { value: number; setValueAtTime: (v: number) => void };
    Q: { value: number };
    gain: { value: number };
    connections: unknown[];
    connect: (dest: unknown) => unknown;
    disconnect: () => void;
  }> = [];

  const createdOscs: Array<{ startedAt: number; stoppedAt: number }> = [];
  const createdNoiseSources: Array<{ startedAt: number; stoppedAt: number }> = [];

  const makeParam = (init = 0) => ({
    value: init,
    setValueAtTime(v: number) {
      this.value = v;
    },
    linearRampToValueAtTime(v: number) {
      this.value = v;
    },
    exponentialRampToValueAtTime(v: number) {
      this.value = v;
    },
    cancelScheduledValues() {},
  });

  const makeNode = <T extends Record<string, unknown>>(extra: T) => {
    return {
      connections: [] as unknown[],
      connect(dest: unknown) {
        (this.connections as unknown[]).push(dest);
        return dest;
      },
      disconnect(target?: unknown) {
        if (target) {
          this.connections = (this.connections as unknown[]).filter((c) => c !== target);
        } else {
          this.connections = [];
        }
      },
      ...extra,
    };
  };

  const ctx = {
    sampleRate: 44100,
    currentTime: 0,
    destination: makeNode({ name: 'destination' }),
    createGain: () => makeNode({ gain: makeParam(1) }),
    createStereoPanner: () => makeNode({ pan: makeParam(0) }),
    createDynamicsCompressor: () =>
      makeNode({
        threshold: makeParam(-18),
        knee: makeParam(12),
        ratio: makeParam(3),
        attack: makeParam(0.004),
        release: makeParam(0.18),
      }),
    createDelay: () => makeNode({ delayTime: makeParam(0) }),
    createWaveShaper: () => makeNode({ curve: null, oversample: 'none' }),
    createConvolver: () => makeNode({ buffer: null }),
    createBiquadFilter: () => {
      const bq = makeNode({
        type: 'lowpass' as BiquadFilterType,
        frequency: makeParam(350),
        Q: makeParam(1),
        gain: makeParam(0),
      });
      createdBiquads.push(bq);
      return bq;
    },
    createBuffer: (channels: number, length: number) => ({
      numberOfChannels: channels,
      length,
      getChannelData: () => new Float32Array(length),
    }),
    createOscillator: () => {
      const rec = { startedAt: 0, stoppedAt: 0 };
      createdOscs.push(rec);
      return makeNode({
        type: 'sine' as OscillatorType,
        frequency: makeParam(440),
        onended: null as null | (() => void),
        start(t = 0) {
          rec.startedAt = t;
        },
        stop(t = 0) {
          rec.stoppedAt = t;
        },
      });
    },
    createBufferSource: () => {
      const rec = { startedAt: 0, stoppedAt: 0 };
      createdNoiseSources.push(rec);
      return makeNode({
        buffer: null,
        onended: null as null | (() => void),
        start(t = 0) {
          rec.startedAt = t;
        },
        stop(t = 0) {
          rec.stoppedAt = t;
        },
      });
    },
  };

  return {
    ctx: ctx as unknown as BaseAudioContext,
    createdBiquads,
    createdOscs,
    createdNoiseSources,
  };
}

test('Phase 7C: all 9 original styles remain 100% pure, deterministic, and NaN-free across 4/4, 3/4, 6/8', () => {
  const barPlannerSrc = fs.readFileSync(path.join(process.cwd(), 'src/lib/barPlanner.ts'), 'utf8');
  assert.ok(!barPlannerSrc.includes('Math.random'), 'barPlanner.ts must never use Math.random()');

  const timeSignatures: TimeSignature[] = ['4/4', '3/4', '6/8'];
  const originalCombos: Array<{ rhythm: GuitarStyle; bass: BassStyle; piano: PianoStyle; drums: DrumStyle }> = [
    { rhythm: 'campfire-strum', bass: 'root-fifth', piano: 'warm-pad', drums: 'shaker-cajon' },
    { rhythm: 'soft-strum', bass: 'warm-sustain', piano: 'gentle-arpeggio', drums: 'simple-kit' },
    { rhythm: 'fingerpicking', bass: 'root-fifth', piano: 'warm-pad', drums: 'shaker-cajon' },
  ];

  for (const ts of timeSignatures) {
    for (const combo of originalCombos) {
      const song = makeTestSong({ timeSignature: ts, ...combo });
      const flat = flattenSong(song);
      const run1 = planBar(song, flat, 0);
      const run2 = planBar(song, flat, 0);
      assert.deepEqual(run1, run2);
      assertAllEventsFinite(run1.events);
      assert.ok(run1.events.some((e) => e.kind === 'note' && e.track === 'guitarRhythm'));
      assert.ok(run1.events.some((e) => e.kind === 'note' && e.track === 'bass'));
      assert.ok(run1.events.some((e) => e.kind === 'note' && e.track === 'piano'));
      assert.ok(run1.events.some((e) => e.kind === 'drum'));
    }
  }
});

test('Phase 7C: new groove styles & 4 drum voices are deterministic, rich, and compatible with MIDI export', () => {
  const timeSignatures: TimeSignature[] = ['4/4', '3/4', '6/8'];
  const newCombos: Array<{ rhythm: GuitarStyle; bass: BassStyle; piano: PianoStyle; drums: DrumStyle }> = [
    { rhythm: 'lukthung-bounce', bass: 'lukthung-groove', piano: 'warm-pad', drums: 'lukthung-3cha' },
    { rhythm: 'rock-power', bass: 'rnb-syncopated', piano: 'rnb-neo-chord', drums: 'rnb-pocket' },
    { rhythm: 'rock-power', bass: 'root-fifth', piano: 'rock-organ-pad', drums: 'rock-drive' },
  ];

  for (const ts of timeSignatures) {
    for (const combo of newCombos) {
      const song = makeTestSong({ timeSignature: ts, ...combo, intensity: 'high' });
      const flat = flattenSong(song);
      const bar0a = planBar(song, flat, 0);
      const bar0b = planBar(song, flat, 0);
      const bar1 = planBar(song, flat, 1); // last of section -> triggers drum fill too

      assert.deepEqual(bar0a, bar0b);
      assertAllEventsFinite(bar0a.events);
      assertAllEventsFinite(bar1.events);

      assert.ok(bar0a.events.some((e) => e.kind === 'note' && e.track === 'guitarRhythm'));
      assert.ok(bar0a.events.some((e) => e.kind === 'note' && e.track === 'bass'));
      assert.ok(bar0a.events.some((e) => e.kind === 'note' && e.track === 'piano'));
      assert.ok(bar0a.events.some((e) => e.kind === 'drum'));
    }
  }

  // Verify specific new drum voices appear in the matching styles
  const lukSong = makeTestSong({ drums: 'lukthung-3cha', rhythm: 'lukthung-bounce', bass: 'lukthung-groove' });
  const lukDrums = planBar(lukSong, flattenSong(lukSong), 0).events.filter(
    (e): e is Extract<PlannedEvent, { kind: 'drum' }> => e.kind === 'drum'
  );
  const lukVoices = new Set<DrumVoice>(lukDrums.map((d) => d.voice));
  assert.ok(lukVoices.has('woodblock'), 'lukthung-3cha must emit woodblock');
  assert.ok(lukVoices.has('openHat'), 'lukthung-3cha must emit openHat');

  const rnbSong = makeTestSong({ drums: 'rnb-pocket', bass: 'rnb-syncopated', piano: 'rnb-neo-chord' });
  const rnbDrums = planBar(rnbSong, flattenSong(rnbSong), 0).events.filter(
    (e): e is Extract<PlannedEvent, { kind: 'drum' }> => e.kind === 'drum'
  );
  assert.ok(rnbDrums.some((d) => d.voice === 'openHat'), 'rnb-pocket must emit openHat');

  const rockSong = makeTestSong({ drums: 'rock-drive', rhythm: 'rock-power', piano: 'rock-organ-pad' });
  const rockFlat = flattenSong(rockSong);
  const rockFillBar = planBar(rockSong, rockFlat, 1).events.filter(
    (e): e is Extract<PlannedEvent, { kind: 'drum' }> => e.kind === 'drum'
  );
  const rockFillVoices = new Set<DrumVoice>(rockFillBar.map((d) => d.voice));
  assert.ok(rockFillVoices.has('openHat'), 'rock-drive must emit openHat');
  assert.ok(rockFillVoices.has('tomHigh'), 'rock-drive section transition fill must emit tomHigh');
  assert.ok(rockFillVoices.has('tomLow'), 'rock-drive section transition fill must emit tomLow');

  // Ensure MIDI export runs cleanly across all new voices
  const midiBytes = generateMidiFile(lukSong);
  assert.ok(midiBytes.length > 64);
  assert.equal(String.fromCharCode(midiBytes[0], midiBytes[1], midiBytes[2], midiBytes[3]), 'MThd');
});

test('Phase 7C: rnb-neo-chord adds 9th extensions & Smart Low-End Yielding scales left-hand root cleanly', () => {
  const noBassSong = makeTestSong({
    piano: 'rnb-neo-chord',
    bassOn: false,
    intensity: 'medium',
  });
  const withBassSong = makeTestSong({
    piano: 'rnb-neo-chord',
    bassOn: true,
    intensity: 'medium',
  });
  const highIntensityNoBass = makeTestSong({
    piano: 'rock-organ-pad',
    bassOn: false,
    intensity: 'high',
  });
  const medIntensityNoBass = makeTestSong({
    piano: 'rock-organ-pad',
    bassOn: false,
    intensity: 'medium',
  });

  const getPianoNotes = (s: SongProject) =>
    planBar(s, flattenSong(s), 0).events.filter(
      (e): e is Extract<PlannedEvent, { kind: 'note' }> => e.kind === 'note' && e.track === 'piano'
    );

  const neoNoBassNotes = getPianoNotes(noBassSong);
  const neoWithBassNotes = getPianoNotes(withBassSong);

  // Chord bar 0 is 'C' -> 9th pitch class is D (midi % 12 === 2)
  assert.ok(neoNoBassNotes.some((n) => n.midi % 12 === 2), 'rnb-neo-chord must include 9th extension');

  // Lowest piano voice (left-hand root) yields to 0.65x when bass is active
  const lowNoBass = neoNoBassNotes.reduce((a, b) => (a.midi < b.midi ? a : b));
  const lowWithBass = neoWithBassNotes.reduce((a, b) => (a.midi < b.midi ? a : b));
  assert.equal(lowNoBass.midi, lowWithBass.midi);
  const ratio = lowWithBass.vel / lowNoBass.vel;
  assert.ok(ratio >= 0.6 && ratio <= 0.7, `Expected ~0.65 low-end yield ratio, got ${ratio}`);

  // High intensity rock-organ-pad also yields left-hand low note
  const organMedNotes = getPianoNotes(medIntensityNoBass);
  const organHighNotes = getPianoNotes(highIntensityNoBass);
  const organMedLow = organMedNotes.reduce((a, b) => (a.midi < b.midi ? a : b));
  const organHighLow = organHighNotes.reduce((a, b) => (a.midi < b.midi ? a : b));
  assert.ok(organHighLow.vel < organMedLow.vel * 0.9, 'High intensity piano should yield low-end velocity');
});

test('Phase 7C: Vocal-Aware Call-and-Response Lead Guitar leaves steps 0..N-7 clear during lyrics', () => {
  const vocalSong = makeTestSong({
    leadOn: true,
    drumsOn: false,
    pianoOn: false,
    lyrics: 'ใจยังคงคอยเพียงแค่เธอหวนคืนมา',
    barsCount: 2,
  });
  const flatVocal = flattenSong(vocalSong);
  // Bar 0 starts song with guitarLead already on (no prev section transition pickup)
  const bar0Lead = planBar(vocalSong, flatVocal, 0).events.filter(
    (e): e is Extract<PlannedEvent, { kind: 'note' }> => e.kind === 'note' && e.track === 'guitarLead'
  );
  assert.equal(bar0Lead.length, 0, 'Even bar with lyrics should yield steps 0..15 to vocal when not entering from non-lead');

  // Bar 1 (odd bar) plays call-and-response fill strictly in steps 10..15 (N-6..N-1)
  const planned1 = planBar(vocalSong, flatVocal, 1);
  const bar1Lead = planned1.events.filter(
    (e): e is Extract<PlannedEvent, { kind: 'note' }> => e.kind === 'note' && e.track === 'guitarLead'
  );
  assert.equal(bar1Lead.length, 3, 'Call-and-response vocal bar should play 3 response notes at N-6, N-4, N-2');
  const thresholdT = 10 * planned1.timing.stepSec - 0.025;
  assert.ok(
    bar1Lead.every((n) => n.t >= thresholdT),
    'All call-and-response lead notes during lyrics must sit at steps N-6..N-1'
  );

  // Instrumental bar (no lyrics) still keeps full instrumental fill behavior (4 fill notes on 4/4)
  const instSong = makeTestSong({
    leadOn: true,
    lyrics: '',
    barsCount: 2,
  });
  const bar1InstLead = planBar(instSong, flattenSong(instSong), 1).events.filter(
    (e): e is Extract<PlannedEvent, { kind: 'note' }> => e.kind === 'note' && e.track === 'guitarLead'
  );
  assert.equal(bar1InstLead.length, 4, 'Non-lyric bar must preserve original 4-note riff-fills pattern');
});

test('Phase 7C: TRACK_PAN, BassTrackGainNode, PianoTrackGainNode, DrumSynth & live/offline parity', () => {
  // 1. Stereo panning parity between audioDspShared and audioEngine
  assert.equal(TRACK_PAN.guitarRhythm, -0.32);
  assert.equal(TRACK_PAN.guitarLead, 0.38);
  assert.equal(TRACK_PAN.piano, 0.28);
  assert.equal(TRACK_PAN.bass, 0);
  assert.equal(TRACK_PAN.drums, 0);
  assert.equal(TRACK_PAN.melody, 0);
  assert.deepEqual(ENGINE_TRACK_PAN, TRACK_PAN);

  // Re-export identity parity
  assert.equal(EngineBassTrackGainNode, BassTrackGainNode);
  assert.equal(EnginePianoTrackGainNode, PianoTrackGainNode);

  // 2. BassTrackGainNode EQ inspection
  const bassMock = createMockAudioContext();
  const bassNode = new BassTrackGainNode(bassMock.ctx, bassMock.ctx.destination, 90, TRACK_PAN.bass);
  assert.equal(bassMock.createdBiquads.length, 2);
  assert.equal(bassMock.createdBiquads[0].type, 'lowshelf');
  assert.equal(bassMock.createdBiquads[0].frequency.value, 75);
  assert.equal(bassMock.createdBiquads[0].gain.value, 2.5);
  assert.equal(bassMock.createdBiquads[1].type, 'peaking');
  assert.equal(bassMock.createdBiquads[1].frequency.value, 320);
  assert.equal(bassMock.createdBiquads[1].Q.value, 1.1);
  assert.equal(bassMock.createdBiquads[1].gain.value, -2.5);
  bassNode.disconnect();

  // 3. PianoTrackGainNode EQ inspection
  const pianoMock = createMockAudioContext();
  const pianoNode = new PianoTrackGainNode(pianoMock.ctx, pianoMock.ctx.destination, 85, TRACK_PAN.piano);
  assert.equal(pianoMock.createdBiquads.length, 2);
  assert.equal(pianoMock.createdBiquads[0].type, 'highpass');
  assert.equal(pianoMock.createdBiquads[0].frequency.value, 140);
  assert.ok(Math.abs(pianoMock.createdBiquads[0].Q.value - 0.707) < 0.001);
  assert.equal(pianoMock.createdBiquads[1].type, 'highshelf');
  assert.equal(pianoMock.createdBiquads[1].frequency.value, 4500);
  assert.equal(pianoMock.createdBiquads[1].gain.value, 1.5);
  pianoNode.disconnect();

  // 4. Offline bus wiring matches live AudioEngine
  const offlineMock = createMockAudioContext();
  const song = makeTestSong();
  const busSet = createOfflineTrackBusSet(offlineMock.ctx, song, offlineMock.ctx.destination, {
    instrumentalOnly: false,
  });
  assert.ok(busSet.trackGains.bass instanceof BassTrackGainNode);
  assert.ok(busSet.trackGains.piano instanceof PianoTrackGainNode);
  const engineSrc = fs.readFileSync(path.join(process.cwd(), 'src/lib/audioEngine.ts'), 'utf8');
  assert.ok(engineSrc.includes('new BassTrackGainNode('));
  assert.ok(engineSrc.includes('new PianoTrackGainNode('));

  // 5. DrumSynth synthesizes all 4 new voices cleanly
  const drumMock = createMockAudioContext();
  const drumSynth = new DrumSynth(drumMock.ctx, drumMock.ctx.destination);
  const newVoices: DrumVoice[] = ['openHat', 'tomHigh', 'tomLow', 'woodblock'];
  newVoices.forEach((voice, i) => {
    drumSynth.hit({ kind: 'drum', voice, t: i * 0.25, vel: 96, pan: 0.1 }, i * 0.25);
  });
  assert.equal(drumMock.createdNoiseSources.length, 1); // openHat
  assert.equal(drumMock.createdOscs.length, 3); // tomHigh, tomLow, woodblock
  drumSynth.dispose();
});

test('Phase 7C: applyGenreBandArrangement, style sanitizer, and SectionBuilder/SoundCustomizerPanel UI contracts', () => {
  // 1. Luk Thung / Carabao
  const lukBase = cloneSong(createDefaultSong());
  lukBase.thaiGenre = 'luk-thung';
  lukBase.songwriterStyle = 'aed-carabao';
  const lukSnapshot = cloneSong(lukBase);
  const lukArranged = applyGenreBandArrangement(lukBase);
  assert.deepEqual(lukBase, lukSnapshot, 'applyGenreBandArrangement must not mutate input song');
  assert.equal(lukArranged.mixer.guitarRhythm.style, 'lukthung-bounce');
  assert.equal(lukArranged.mixer.bass.style, 'lukthung-groove');
  assert.equal(lukArranged.mixer.drums.style, 'lukthung-3cha');
  assert.equal(lukArranged.mixer.guitarLead.drive, 'clean');
  const lukChorus = lukArranged.sections.find((s) => s.type === 'chorus');
  assert.ok(lukChorus);
  assert.equal(lukChorus.instruments.drumsStyle, 'lukthung-3cha');
  assert.equal(lukChorus.instruments.bassStyle, 'lukthung-groove');

  // 2. Thai R&B / The Toys
  const rnbBase = cloneSong(createDefaultSong());
  rnbBase.thaiGenre = 'thai-rnb';
  rnbBase.songwriterStyle = 'the-toys';
  const rnbArranged = applyGenreBandArrangement(rnbBase);
  assert.equal(rnbArranged.mixer.piano.style, 'rnb-neo-chord');
  assert.equal(rnbArranged.mixer.bass.style, 'rnb-syncopated');
  assert.equal(rnbArranged.mixer.drums.style, 'rnb-pocket');
  assert.equal(rnbArranged.mixer.guitarLead.drive, 'clean');

  // 3. Thai Rock / Asanee Chotikul
  const rockBase = cloneSong(createDefaultSong());
  rockBase.thaiGenre = 'thai-rock';
  rockBase.songwriterStyle = 'asanee-chotikul';
  const rockArranged = applyGenreBandArrangement(rockBase);
  assert.equal(rockArranged.mixer.guitarRhythm.style, 'rock-power');
  assert.equal(rockArranged.mixer.piano.style, 'rock-organ-pad');
  assert.equal(rockArranged.mixer.drums.style, 'rock-drive');
  const rockChorus = rockArranged.sections.find((s) => s.type === 'chorus');
  assert.ok(rockChorus);
  assert.equal(rockChorus.instruments.guitarLeadDrive, 'distortion');

  // 4. Sanitizer preserves Phase 7C styles from AI JSON payload without downgrading them
  const aiRockPayload = {
    bpm: 132,
    baseKey: 'E',
    mixer: {
      guitarRhythmStyle: 'rock-power',
      bassStyle: 'rnb-syncopated',
      pianoStyle: 'rock-organ-pad',
      drumsStyle: 'rock-drive',
      guitarLeadDrive: 'overdrive',
    },
    sections: rockArranged.sections.map((s) => ({
      type: s.type,
      name: s.name,
      intensity: s.intensity,
      instruments: s.instruments,
      bars: s.bars.map((b) => ({
        chords: b.chords,
        playStyle: b.playStyle,
        lyrics: b.lyrics,
        melodyNotes: b.melodyNotes,
      })),
    })),
  };
  const sanitizedRock = sanitizeArchitectSongProject(aiRockPayload, {
    thaiGenre: 'thai-rock',
    stylePreset: 'soft-rock',
    vocalProfile: 'male',
    tempoFeel: 'medium',
    topic: 'ชีวิต',
    language: 'th',
  });
  assert.equal(sanitizedRock.mixer.drums.style, 'rock-drive');
  assert.equal(sanitizedRock.mixer.guitarRhythm.style, 'rock-power');
  assert.equal(sanitizedRock.mixer.bass.style, 'rnb-syncopated');
  assert.equal(sanitizedRock.mixer.piano.style, 'rock-organ-pad');

  // 5. UI component contracts
  const customizerSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/SoundCustomizerPanel.tsx'),
    'utf8'
  );
  const builderSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/SectionBuilder.tsx'),
    'utf8'
  );

  const requiredStyles = [
    'lukthung-bounce',
    'rock-power',
    'lukthung-groove',
    'rnb-syncopated',
    'rnb-neo-chord',
    'rock-organ-pad',
    'lukthung-3cha',
    'rnb-pocket',
    'rock-drive',
  ];
  for (const st of requiredStyles) {
    assert.ok(customizerSrc.includes(`value="${st}"`), `SoundCustomizerPanel missing option ${st}`);
    assert.ok(builderSrc.includes(`value="${st}"`), `SectionBuilder missing option ${st}`);
  }
  assert.ok(customizerSrc.includes('applyGenreBandArrangement'));
  assert.ok(builderSrc.includes('applyGenreBandArrangement'));
  assert.ok(customizerSrc.includes('จัดวงอัตโนมัติตามสไตล์เพลง (0 เครดิต)'));
  assert.ok(builderSrc.includes('จัดวงอัตโนมัติตามสไตล์เพลง (0 เครดิต)'));
});
