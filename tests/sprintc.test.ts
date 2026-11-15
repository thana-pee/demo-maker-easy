import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { getTransposedKeyName } from '../src/lib/chordUtils';
import { sanitizeArchitectSongProject } from '../src/lib/songArchitect';
import { createDefaultSong } from '../src/lib/defaultSong';
import {
  alignAndFitVocalPhrasesToBars,
  applyPeakHeadroom,
  compressChannelsInternalPauses,
  fitChannelsToDurationPitchPreserving,
  stripDetachedEdgeBreaths,
  timeScaleChannelsPitchPreserving,
} from '../src/lib/audioTrim';
import { computeVocalTakePlaybackPlan } from '../src/lib/vocalBoothUtils';
import { CREDIT_COST_TABLE } from '../src/lib/creditManager';
import { buildTtsCueStyleHint, getSyllableBudgetForBpm } from '../src/lib/aiPrompts';
import { POST as ttsCuePost } from '../src/app/api/advance/tts-cue/route';
import { importSongsJSON, STORAGE_KEY } from '../src/lib/storage';
import {
  getVocalBlob,
  makeVocalTakeBlobKey,
  resetAudioDbForTests,
} from '../src/lib/audioStorageIdb';
import type { SectionInstruments, SongBar, VocalTake } from '../src/types/song';

function makeBar(index: number, chord = 'C', lyrics = '', playStyle: SongBar['playStyle'] = 'normal'): SongBar {
  return {
    id: `bar-c-${index}`,
    chordsPerBar: 1,
    chords: [chord],
    playStyle,
    lyrics,
    melodyNotes: [],
  };
}

const DEFAULT_INSTRUMENTS: SectionInstruments = {
  guitarRhythm: true,
  guitarLead: false,
  bass: true,
  piano: true,
  drums: true,
};

function makeHarmonicVoiceSignal(
  sampleRate: number,
  freqHz: number,
  durationSec: number,
  amplitude = 0.55
): Float32Array {
  const n = Math.floor(sampleRate * durationSec);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, i / (sampleRate * 0.015), (n - i) / (sampleRate * 0.015));
    out[i] =
      amplitude *
      env *
      (0.75 * Math.sin(2 * Math.PI * freqHz * t) + 0.25 * Math.sin(2 * Math.PI * freqHz * 2 * t));
  }
  return out;
}

function estimateZeroCrossingHz(samples: Float32Array, sampleRate: number, startSec: number, spanSec: number): number {
  const start = Math.max(1, Math.floor(startSec * sampleRate));
  const end = Math.min(samples.length, Math.floor((startSec + spanSec) * sampleRate));
  let positiveCrossings = 0;
  for (let i = start; i < end; i++) {
    if (samples[i - 1] <= 0 && samples[i] > 0) {
      positiveCrossings++;
    }
  }
  const actualSec = Math.max(0.001, (end - start) / sampleRate);
  return positiveCrossings / actualSec;
}

// ───────────────────── 1. Key Transposition & UI Reset Contracts ─────────────────────

test('Sprint C-1 getTransposedKeyName fixes hardcoded Key C display bug across songs & minor keys', () => {
  assert.equal(getTransposedKeyName('E', 0), 'E');
  assert.equal(getTransposedKeyName('D', 0), 'D');
  assert.equal(getTransposedKeyName('C', 0), 'C');
  assert.equal(getTransposedKeyName(undefined, 0), 'C');

  assert.equal(getTransposedKeyName('E', -2), 'D');
  assert.equal(getTransposedKeyName('D', 2), 'E');
  assert.equal(getTransposedKeyName('C', 3), 'Eb');
  assert.equal(getTransposedKeyName('C', -2), 'Bb');
  assert.equal(getTransposedKeyName('Am', 2), 'Bm');
  assert.equal(getTransposedKeyName('F#m', 2), 'G#m');

  const root = process.cwd();
  const transportSrc = fs.readFileSync(path.join(root, 'src/components/TransportBar.tsx'), 'utf8');
  assert.match(transportSrc, /getTransposedKeyName\(song\.baseKey,\s*song\.transposeSemitones\)/);
  assert.doesNotMatch(transportSrc, /const baseIdx = 6;/);
});

test('Sprint C-2 loopRange reset on song switch & low-credit TTS popover UX contracts', () => {
  const root = process.cwd();
  const hookSrc = fs.readFileSync(path.join(root, 'src/hooks/useAudioEngine.ts'), 'utf8');
  assert.match(hookSrc, /prevSongIdRef\s*=\s*useRef<string>\(song\.id\)/);
  assert.match(hookSrc, /pendingLoopRangeRef\.current\s*=\s*null/);
  assert.match(hookSrc, /engineRef\.current\.setLoopRange\(null\)/);

  const pageSrc = fs.readFileSync(path.join(root, 'src/app/page.tsx'), 'utf8');
  assert.match(pageSrc, /handleApplyEasySong[\s\S]*?engine\.setLoopRange\(null\)/);

  const builderSrc = fs.readFileSync(path.join(root, 'src/components/SectionBuilder.tsx'), 'utf8');
  assert.match(builderSrc, /if\s*\(!canAfford\(cost\)\)\s*\{\s*setSectionTtsConfirmId\(null\);\s*onOpenWallet\?\.\(\);/);
  assert.match(builderSrc, /setSectionTtsConfirmId\(null\);\s*onOpenWallet\(\);/);
  assert.match(builderSrc, /disabled=\{sectionTtsLoadingId === section\.id \|\| !canAfford\(CREDIT_COST_TABLE\.aiTtsCue\)\}/);
  assert.match(builderSrc, /id=\{`section-tts-voice-\$\{section\.id\}`\}/);
  assert.match(builderSrc, /name="sectionTtsVoice"/);
  assert.equal(CREDIT_COST_TABLE.aiTtsCue, 2);

  const easySrc = fs.readFileSync(path.join(root, 'src/components/EasyModeStarterModal.tsx'), 'utf8');
  assert.match(easySrc, /id="easy-lyric-dialect"/);
  assert.match(easySrc, /id="easy-song-topic"/);
  assert.match(easySrc, /id="easy-preview-bpm"/);
});

// ───────────────────── 2. Slow-Ballad Break Fix & Architect/TTS Tuning ─────────────────────

test('Sprint C-3 sanitizeArchitectSongProject converts slow-ballad (<78 BPM) break into let-ring to avoid dead-air holes', () => {
  const slowSong = createDefaultSong();
  slowSong.bpm = 68;
  slowSong.timeSignature = '4/4';
  slowSong.sections = [
    {
      id: 'pre',
      name: 'Pre-Chorus',
      type: 'pre-chorus',
      intensity: 'medium',
      instruments: { ...DEFAULT_INSTRUMENTS },
      bars: [
        makeBar(0, 'Bm', 'รู้ตัวดีว่าแพ้', 'normal'),
        makeBar(1, 'Em', 'ตั้งแต่ยังไม่เริ่ม', 'break'),
      ],
    },
    {
      id: 'chorus',
      name: 'Chorus',
      type: 'chorus',
      intensity: 'high',
      instruments: { ...DEFAULT_INSTRUMENTS },
      bars: [
        makeBar(2, 'G', 'รักเธอสุดหัวใจ', 'normal'),
        makeBar(3, 'A', 'แม้ไม่ได้ครอบครอง', 'normal'),
      ],
    },
  ];

  const sanitizedSlow = sanitizeArchitectSongProject(slowSong, {
    stylePreset: 'warm-acoustic',
    vocalProfile: 'female',
    tempoFeel: 'slow',
    topic: 'แพ้',
    language: 'th',
  });
  assert.equal(sanitizedSlow.sections[0].bars[1].playStyle, 'let-ring');

  // Faster rock/pop (>=78 BPM) keeps explicit punchy non-final 'break' intact
  const rockSong = createDefaultSong();
  rockSong.bpm = 108;
  rockSong.sections = slowSong.sections.map((s) => ({
    ...s,
    bars: s.bars.map((b) => ({ ...b })),
  }));
  const sanitizedFast = sanitizeArchitectSongProject(rockSong, {
    stylePreset: 'warm-acoustic',
    vocalProfile: 'male',
    tempoFeel: 'medium',
    topic: 'Rock',
    language: 'th',
  });
  assert.equal(sanitizedFast.sections[0].bars[1].playStyle, 'break');

  const root = process.cwd();
  const architectSrc = fs.readFileSync(path.join(root, 'src/app/api/advance/architect/route.ts'), 'utf8');
  assert.match(architectSrc, /selectPrioritySectionsForPolish\(evaluatedSections,\s*3\)/);
  assert.match(architectSrc, /const recheckFailed[\s\S]*minSyllables:\s*budget\.min,\s*maxSyllables:\s*budget\.max/);
});

test('Sprint C-3b tts-cue enforces musical anti-rush phrasing hint without calling live API', async () => {
  const compactHint = buildTtsCueStyleHint({
    language: 'th',
    vocalMode: 'singing-demo',
    bpm: 108,
    thaiGenre: 'thai-rock',
    targetDurationSec: 8.89,
  });
  assert.match(compactHint, /ไม่รัวคำ/);
  assert.doesNotMatch(compactHint, /ไม่เว้นช่วงเงียบคั่นระหว่างวรรค/);

  const slowHint = buildTtsCueStyleHint({
    language: 'th',
    vocalMode: 'singing-demo',
    bpm: 68,
    thaiGenre: 'thai-pop',
    targetDurationSec: 14.1,
  });
  assert.doesNotMatch(slowHint, /ไม่รัวคำ/);

  const prevKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const req = new Request('http://localhost/api/advance/tts-cue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'ทดสอบร้องกระชับท่อนฮุค',
        bpm: 108,
        targetDurationSec: 8.89,
        vocalMode: 'singing-demo',
        language: 'th',
      }),
    });
    const res = await ttsCuePost(req);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { isSimulated: boolean };
    assert.equal(body.isSimulated, true);
  } finally {
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
  }
});

// ───────────────────── 3. Pitch-Preserving WSOLA + Internal Pause Squeeze ─────────────────────

test('Sprint C-4 compressChannelsInternalPauses & WSOLA fit overlong AI TTS takes to section span at 1.0x pitch', () => {
  const sampleRate = 24000;
  // Construct 4.0s harmonic vocal signal: 1.5s voice + 0.6s pause + 1.9s voice
  const p1 = makeHarmonicVoiceSignal(sampleRate, 220, 1.5, 0.6);
  const gap = new Float32Array(Math.floor(sampleRate * 0.6));
  const p2 = makeHarmonicVoiceSignal(sampleRate, 220, 1.9, 0.6);

  const mono = new Float32Array(p1.length + gap.length + p2.length);
  mono.set(p1, 0);
  mono.set(gap, p1.length);
  mono.set(p2, p1.length + gap.length);
  const stereo = [mono, new Float32Array(mono)];

  // 1) Internal pause compression alone cuts silent gap first without shifting frequency
  const compressed = compressChannelsInternalPauses(stereo, sampleRate, 3.6);
  assert.equal(compressed.pauseCount, 1);
  assert.ok(compressed.compressedSec >= 0.35);
  assert.ok(compressed.channels[0].length / sampleRate <= 3.65);

  // 2) WSOLA time-scale speeds up duration 1.5x while preserving 220 Hz fundamental (no +7 semitone shift!)
  const scaled = timeScaleChannelsPitchPreserving([p2], sampleRate, 1.5);
  const scaledDur = scaled[0].length / sampleRate;
  assert.ok(Math.abs(scaledDur - 1.9 / 1.5) < 0.05, `Expected ~1.27s, got ${scaledDur.toFixed(3)}s`);
  const measuredHz = estimateZeroCrossingHz(scaled[0], sampleRate, 0.15, 0.85);
  assert.ok(Math.abs(measuredHz - 220) < 15, `Pitch must stay near 220 Hz (not 330 Hz), got ${measuredHz.toFixed(1)} Hz`);

  // 3) Combined pipeline fits 4.0s down to 2.5s cleanly AND keeps computeVocalTakePlaybackPlan playbackRate === 1.0
  const fit = fitChannelsToDurationPitchPreserving(stereo, sampleRate, 2.5);
  assert.equal(fit.method, 'pause+wsola');
  const fitDur = fit.channels[0].length / sampleRate;
  assert.ok(Math.abs(fitDur - 2.5) < 0.05, `Expected fitted ~2.5s, got ${fitDur.toFixed(3)}s`);

  const song = createDefaultSong();
  song.bpm = 108; // bar = 2.2222s -> 4 bars = 8.8889s
  song.sections = [
    {
      id: 'v1',
      name: 'Verse',
      type: 'verse',
      intensity: 'medium',
      instruments: { ...DEFAULT_INSTRUMENTS },
      bars: [makeBar(0), makeBar(1), makeBar(2), makeBar(3)],
    },
  ];
  const take: VocalTake = {
    id: 'tk-wsola',
    name: 'AI Guide',
    scope: 'section',
    sectionId: 'v1',
    startGlobalBarIndex: 0,
    endGlobalBarIndex: 3,
    source: 'ai-tts',
    createdAt: '2026-11-15T08:00:00.000Z',
    isActive: true,
    audioDataUrl: 'data:audio/wav;base64,AA==',
    fxPreset: 'studio-warm',
    preRollOffsetSec: 0,
    latencyOffsetMs: 0,
  };
  const plan = computeVocalTakePlaybackPlan(song, take, [take], 8.75, 0, 0);
  assert.equal(plan.playbackRate, 1.0);
  assert.equal(plan.stopAfterDelaySec, null);
});

// ───────────────────── 4. MP3 Peak Headroom & DSP Wiring Contracts ─────────────────────

test('Sprint C-5 applyPeakHeadroom limits near-0dBFS signals to <= 0.94 while leaving quiet tracks untouched', () => {
  const hotL = new Float32Array([0.1, -0.998, 0.5]);
  const hotR = new Float32Array([0.2, 0.91, -0.4]);
  const limited = applyPeakHeadroom([hotL, hotR], 0.94);
  assert.ok(limited.gainApplied < 1.0);
  assert.ok(Math.abs(limited.peakAfter - 0.94) < 1e-4);
  assert.ok(Math.abs(limited.channels[0][1] + 0.94) < 1e-4);
  // Preserves stereo ratio between channels
  assert.ok(Math.abs(limited.channels[1][1] - 0.91 * limited.gainApplied) < 1e-5);

  const quiet = new Float32Array([0.1, -0.76, 0.4]);
  const untouched = applyPeakHeadroom([quiet], 0.94);
  assert.equal(untouched.gainApplied, 1.0);
  assert.equal(untouched.channels[0], quiet);

  const root = process.cwd();
  const engineSrc = fs.readFileSync(path.join(root, 'src/lib/audioEngine.ts'), 'utf8');
  assert.match(engineSrc, /prepareAiTtsAudioBufferForSpan/);
  const mp3Src = fs.readFileSync(path.join(root, 'src/lib/mp3Exporter.ts'), 'utf8');
  assert.match(mp3Src, /prepareAiTtsAudioBufferForSpan/);
  assert.match(mp3Src, /applyPeakHeadroom\(rawChannels,\s*0\.94\)/);
});

// ───────────────────── 5. Bar-Synchronized Phrase Alignment & Singable Budget ─────────────────────

test('Sprint D-1 alignAndFitVocalPhrasesToBars anchors 4 phrases to Bar 1..4 downbeats cleanly', () => {
  const sampleRate = 24000;
  // Simulate a slow 68 BPM 4-bar section (barSec = 3.529s -> span = 14.118s),
  // where raw TTS spoke all 4 short 1.6s phrases back-to-back in ~7.3s
  const seg = makeHarmonicVoiceSignal(sampleRate, 260, 1.6, 0.55);
  const gap = new Float32Array(Math.floor(sampleRate * 0.3));
  const rawLen = seg.length * 4 + gap.length * 3;
  const rawMono = new Float32Array(rawLen);
  let pos = 0;
  for (let b = 0; b < 4; b++) {
    rawMono.set(seg, pos);
    pos += seg.length;
    if (b < 3) {
      rawMono.set(gap, pos);
      pos += gap.length;
    }
  }

  const targetSpanSec = 14.1176;
  const aligned = alignAndFitVocalPhrasesToBars([rawMono, new Float32Array(rawMono)], sampleRate, targetSpanSec, 4);
  assert.ok(aligned !== null, 'Expected 4-bar alignment to detect 3 inter-line pauses');
  const out = aligned[0];
  assert.ok(out.length / sampleRate <= targetSpanSec, 'Output must fit inside targetSpanSec for 1.0x playback');

  const barSec = targetSpanSec / 4;
  // Each bar starts with vocal energy around bar k * barSec + 0.02..0.5s, and rests silently before next bar
  const rmsWindow = (startSec: number, durSec: number): number => {
    const s0 = Math.max(0, Math.floor(startSec * sampleRate));
    const s1 = Math.min(out.length, Math.floor((startSec + durSec) * sampleRate));
    let sum = 0;
    for (let i = s0; i < s1; i++) sum += out[i] * out[i];
    return Math.sqrt(sum / Math.max(1, s1 - s0));
  };

  for (let b = 0; b < 4; b++) {
    const barStart = b * barSec;
    assert.ok(rmsWindow(barStart + 0.1, 0.5) > 0.1, `Expected bar ${b + 1} onset audio`);
    assert.ok(rmsWindow(barStart + 2.2, 0.5) < 0.01, `Expected breath room before bar ${b + 2}`);
  }

  // Singable budgets for 108 BPM asanee-chotikul and 68 BPM dee-nitipong sections must stay <= 6 syllables/bar
  const asanee108 = getSyllableBudgetForBpm(108, '4/4', {
    sectionType: 'chorus',
    songwriterStyle: 'asanee-chotikul',
    thaiGenre: 'thai-rock',
  });
  assert.ok(asanee108.max <= 6, `Expected <= 6 max syllables at 108 BPM rock, got ${asanee108.max}`);

  const dee68Section = getSyllableBudgetForBpm(68, '4/4', {
    sectionType: 'verse',
    songwriterStyle: 'dee-nitipong',
    thaiGenre: 'thai-pop',
  });
  assert.ok(dee68Section.max <= 6, `Expected <= 6 max syllables for 68 BPM slow section, got ${dee68Section.max}`);
});

test('Sprint E-1 stripDetachedEdgeBreaths removes trailing breath gasps & buildTtsCueStyleHint differentiates Chorus vs Verse', () => {
  const sampleRate = 24000;
  // Build a phrase: 0.7s main harmonic voice (amplitude 0.6), 0.06s silence gap, 0.14s quiet breath gasp (amp 0.06)
  const mainVoice = makeHarmonicVoiceSignal(sampleRate, 240, 0.7, 0.6);
  const gap = new Float32Array(Math.floor(0.06 * sampleRate));
  const breath = makeHarmonicVoiceSignal(sampleRate, 620, 0.14, 0.06);
  const raw = new Float32Array(mainVoice.length + gap.length + breath.length);
  raw.set(mainVoice, 0);
  raw.set(gap, mainVoice.length);
  raw.set(breath, mainVoice.length + gap.length);

  const cleaned = stripDetachedEdgeBreaths([raw], sampleRate);
  assert.ok(cleaned[0].length <= mainVoice.length + Math.floor(0.02 * sampleRate), 'Detached trailing breath island must be trimmed');
  assert.ok(cleaned[0].length >= mainVoice.length - Math.floor(0.03 * sampleRate), 'Main sung phrase must stay intact');

  // Lead detached breath gasp before main voice must also be trimmed
  const rawLeadBreath = new Float32Array(breath.length + gap.length + mainVoice.length);
  rawLeadBreath.set(breath, 0);
  rawLeadBreath.set(gap, breath.length);
  rawLeadBreath.set(mainVoice, breath.length + gap.length);
  const cleanedLead = stripDetachedEdgeBreaths([rawLeadBreath], sampleRate);
  assert.ok(cleanedLead[0].length <= mainVoice.length + Math.floor(0.02 * sampleRate), 'Detached leading breath island must be trimmed');

  const chorusHint = buildTtsCueStyleHint({
    language: 'th',
    vocalMode: 'singing-demo',
    bpm: 108,
    thaiGenre: 'thai-rock',
    targetDurationSec: 8.9,
    sectionType: 'chorus',
    baseKey: 'Em',
  });
  const verseHint = buildTtsCueStyleHint({
    language: 'th',
    vocalMode: 'singing-demo',
    bpm: 108,
    thaiGenre: 'thai-rock',
    targetDurationSec: 8.9,
    sectionType: 'verse',
    baseKey: 'Em',
  });
  assert.match(chorusHint, /ท่อนฮุก|Chorus/);
  assert.match(chorusHint, /ไม่รัวคำ/);
  assert.match(chorusHint, /ห้ามถอนหายใจ|ไม่ถอนหายใจ/);
  assert.match(verseHint, /ท่อนเล่าเรื่อง|Verse/);
  assert.notEqual(chorusHint, verseHint, 'Chorus and Verse cues must provide distinct melodic contour guidance');
});

test('Sprint E-2 importSongsJSON offloads heavy vocals to storage helper on QuotaExceededError without failing', async () => {
  resetAudioDbForTests();
  const baseSong = createDefaultSong();
  const heavyAudio = `data:audio/wav;base64,${'A'.repeat(2400)}`;
  const importedSong = {
    ...baseSong,
    id: 'song-import-heavy-e2',
    title: 'Imported Heavy Vocal Demo',
    vocalTakes: [
      {
        id: 'vt-heavy-1',
        name: 'Take 1 — Chorus',
        scope: 'section' as const,
        source: 'ai-tts' as const,
        sectionId: baseSong.sections[0]?.id,
        startGlobalBarIndex: 0,
        endGlobalBarIndex: 3,
        audioDataUrl: heavyAudio,
        latencyOffsetMs: 0,
        preRollOffsetSec: 0,
        fxPreset: 'studio-warm' as const,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    ],
  };

  const store = new Map<string, string>();
  const mockStorage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, val: string) {
      if (key === STORAGE_KEY && val.includes('A'.repeat(1000))) {
        const err = new Error('QuotaExceededError') as Error & { name: string; code: number };
        err.name = 'QuotaExceededError';
        err.code = 22;
        throw err;
      }
      store.set(key, val);
    },
  };

  const g = globalThis as { localStorage?: Storage };
  const prevStorage = g.localStorage;
  g.localStorage = mockStorage;
  try {
    const result = importSongsJSON(JSON.stringify(importedSong));
    assert.ok(result !== null && result.length >= 1, 'Expected importSongsJSON to succeed after QuotaExceededError pruning');
    assert.equal(result[0].vocalTakes?.[0]?.audioDataUrl, heavyAudio, 'Returned in-memory song should still contain vocal audio for immediate playback');
    const persistedRaw = store.get(STORAGE_KEY) || '';
    assert.ok(!persistedRaw.includes('A'.repeat(1000)), 'localStorage payload must have heavy audioDataUrl stripped after quota fallback');

    const storedBlob = await getVocalBlob(makeVocalTakeBlobKey(result[0].id, 'vt-heavy-1'));
    assert.equal(storedBlob, heavyAudio, 'Offloaded vocal blob must remain retrievable from IDB/memory vocal store');
  } finally {
    g.localStorage = prevStorage;
    resetAudioDbForTests();
  }
});
