import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { flattenSong } from '../src/lib/barPlanner';
import { createDefaultSong } from '../src/lib/defaultSong';
import {
  findLeadingSilenceSampleIndex,
  findTrailingSilenceEndSampleIndex,
  trimAudioBufferTrailingSilence,
  trimChannelsSilence,
} from '../src/lib/audioTrim';
import {
  computeVocalTakePlaybackPlan,
  hasActiveVocalAtBar,
  resolveVocalTakeBarSpan,
} from '../src/lib/vocalBoothUtils';
import { OFFLINE_IMMEDIATE_SCHEDULER } from '../src/lib/mp3Exporter';
import {
  classifyRhymeGroupId,
  validateThaiLyricCouplets,
} from '../src/lib/thaiRhymeHelper';
import {
  buildEasyArchitectSystemPrompt,
  buildRhymePolishPrompt,
  getSyllableBudgetForBpm,
  selectPrioritySectionsForPolish,
} from '../src/lib/aiPrompts';
import { buildSectionTtsTextPlan } from '../src/lib/sectionUtils';
import { POST as ttsCuePost } from '../src/app/api/advance/tts-cue/route';
import type { SectionInstruments, SongBar, SongProject, VocalTake } from '../src/types/song';

function makeBar(index: number, chord = 'C', lyrics = ''): SongBar {
  return {
    id: `bar-${index}-${Math.random().toString(36).slice(2, 6)}`,
    chordsPerBar: 1,
    chords: [chord],
    playStyle: 'normal',
    lyrics,
    melodyNotes: [],
  };
}

const DEFAULT_SECTION_INSTRUMENTS: SectionInstruments = {
  guitarRhythm: true,
  guitarLead: false,
  bass: true,
  piano: true,
  drums: true,
};

function makeThreeSectionSong(bpm = 108): SongProject {
  const song = createDefaultSong();
  song.bpm = bpm;
  song.timeSignature = '4/4';
  song.sections = [
    {
      id: 'sec-verse',
      name: 'Verse',
      type: 'verse',
      intensity: 'medium',
      instruments: { ...DEFAULT_SECTION_INSTRUMENTS },
      bars: [
        makeBar(0, 'Am', 'เดินลำพังในคืนเหงา'),
        makeBar(1, 'F', 'มองดาวพราวบนฟ้าไกล'),
        makeBar(2, 'C', 'ใจยังคงคิดถึงเธอ'),
        makeBar(3, 'G', 'ยังรอคอยเสมอมา'),
      ],
    },
    {
      id: 'sec-pre',
      name: 'Pre-Chorus',
      type: 'pre-chorus',
      intensity: 'medium',
      instruments: { ...DEFAULT_SECTION_INSTRUMENTS },
      bars: [
        makeBar(4, 'Dm', 'แต่เวลาไม่ย้อนคืน'),
        makeBar(5, 'G', 'ใจยังฝืนรอคำลา'),
      ],
    },
    {
      id: 'sec-chorus',
      name: 'Chorus',
      type: 'chorus',
      intensity: 'high',
      instruments: { ...DEFAULT_SECTION_INSTRUMENTS },
      bars: [
        makeBar(6, 'C', 'รักยังคงอยู่ตรงนี้'),
        makeBar(7, 'G', 'แม้คืนวันผ่านเลยไป'),
      ],
    },
  ];
  return song;
}

// ───────────────────── 1. Trailing + Leading Silence Trim ─────────────────────

test('Sprint B audioTrim: findTrailingSilenceEndSampleIndex, trimChannelsSilence & AudioBuffer trim', () => {
  const sampleRate = 1000;
  // 250ms silence + 400ms tone (amplitude 0.4) + 550ms trailing silence = 1200 samples
  const ch = new Float32Array(1200);
  for (let i = 250; i < 650; i++) {
    ch[i] = 0.4 * Math.sin(i * 0.1);
  }

  const leadIdx = findLeadingSilenceSampleIndex([ch], sampleRate, {
    safetyMarginMs: 15,
    minTrimMs: 20,
  });
  const endIdx = findTrailingSilenceEndSampleIndex([ch], sampleRate, {
    trailingMarginMs: 40,
    minTrimMs: 20,
  });

  assert.equal(leadIdx, 235);
  assert.equal(endIdx, 690); // 650 + 40ms margin

  const trimmed = trimChannelsSilence([ch], sampleRate, {
    safetyMarginMs: 15,
    trailingMarginMs: 40,
  });
  assert.equal(trimmed.channels[0].length, 690 - 235);
  assert.equal(trimmed.trimmedSamples, 235 + (1200 - 690));

  // Verify AudioBuffer trailing trim helper with lightweight Web Audio context mock
  const channelCopy = new Float32Array(ch);
  const mockInputBuf = {
    length: ch.length,
    sampleRate,
    numberOfChannels: 1,
    duration: ch.length / sampleRate,
    getChannelData: () => channelCopy,
  } as unknown as AudioBuffer;

  let createdLength = 0;
  const mockCtx = {
    createBuffer: (_nCh: number, len: number, sr: number) => {
      createdLength = len;
      const stored = new Float32Array(len);
      return {
        length: len,
        sampleRate: sr,
        numberOfChannels: 1,
        duration: len / sr,
        getChannelData: () => stored,
        copyToChannel: (src: Float32Array) => stored.set(src),
      } as unknown as AudioBuffer;
    },
  } as unknown as BaseAudioContext;

  const trimmedBuf = trimAudioBufferTrailingSilence(mockCtx, mockInputBuf, {
    trailingMarginMs: 40,
  });
  assert.equal(createdLength, 690);
  assert.equal(trimmedBuf.length, 690);
});

// ───────────────────── 2. Dynamic Bar Span + AI TTS Time-Fit + No Bleed ─────────────────────

test('Sprint B vocalBoothUtils: resolveVocalTakeBarSpan tracks sectionId dynamically after bar edits', () => {
  const song = makeThreeSectionSong(108);
  const chorusTake: VocalTake = {
    id: 'tk-chorus',
    name: 'Take 1 — Chorus (AI Guide)',
    scope: 'section',
    source: 'ai-tts',
    sectionId: 'sec-chorus',
    startGlobalBarIndex: 6,
    endGlobalBarIndex: 7,
    preRollOffsetSec: 0,
    audioDataUrl: 'data:audio/wav;base64,UklGRg==',
    fxPreset: 'studio-warm',
    isActive: true,
    createdAt: '2026-11-15T00:00:00.000Z',
  };

  // User inserts 2 extra bars into Verse => Chorus shifts from [6..7] to [8..9]
  song.sections[0].bars.push(makeBar(98, 'Em', 'เติมท่อน'), makeBar(99, 'G', 'อีกห้อง'));
  const resolved = resolveVocalTakeBarSpan(song, chorusTake);
  assert.deepEqual(resolved, { startGlobalBarIndex: 8, endGlobalBarIndex: 9 });

  song.vocalTakes = [chorusTake];
  const flatAfterInsert = flattenSong(song);
  // Bar 6 used to be Chorus, now Pre-Chorus -> no vocal!
  assert.equal(hasActiveVocalAtBar(song, flatAfterInsert[6], 6), false);
  // Bar 8 is now Chorus -> active vocal!
  assert.equal(hasActiveVocalAtBar(song, flatAfterInsert[8], 8), true);

  // Deleted section returns null cleanly
  const deletedTake: VocalTake = { ...chorusTake, sectionId: 'sec-deleted' };
  assert.equal(resolveVocalTakeBarSpan(song, deletedTake), null);
});

test('Sprint B computeVocalTakePlaybackPlan: 108 BPM AI TTS time-fits (<=1.35x), hard-clamps before Pre-Chorus, and keeps mic 1.0x', () => {
  const song = makeThreeSectionSong(108);
  // 108 BPM 4/4 -> beat = 0.5556s, barSec = 2.2222s, Verse (4 bars) = 8.8889s
  const verseTargetSpanSec = (4 * 4 * 60) / 108;

  const verseTtsTake: VocalTake = {
    id: 'tk-v-tts',
    name: 'Take 1 — Verse (AI Guide)',
    scope: 'section',
    source: 'ai-tts',
    sectionId: 'sec-verse',
    startGlobalBarIndex: 0,
    endGlobalBarIndex: 3,
    preRollOffsetSec: 0,
    audioDataUrl: 'data:audio/wav;base64,UklGRg==',
    fxPreset: 'studio-warm',
    isActive: true,
    createdAt: '2026-11-15T00:00:00.000Z',
  };

  // Case A: Moderate overflow (11.11s for 8.89s Verse = 1.25x <= 1.35x) -> time-fits smoothly
  const modPlan = computeVocalTakePlaybackPlan(song, verseTtsTake, [verseTtsTake], 11.1111, 0, 0);
  assert.equal(modPlan.shouldPlay, true);
  assert.ok(Math.abs(modPlan.playbackRate - 1.25) < 0.01);

  // Case B: Extreme overflow (16s for 8.89s Verse) -> caps playbackRate at 1.35x AND hard-stops near 9.07s (never reaches Chorus at 13.33s!)
  const extremePlan = computeVocalTakePlaybackPlan(song, verseTtsTake, [verseTtsTake], 16.0, 0, 0);
  assert.equal(extremePlan.shouldPlay, true);
  assert.equal(extremePlan.playbackRate, 1.35);
  assert.ok(extremePlan.stopAfterDelaySec !== null);
  assert.ok(extremePlan.stopAfterDelaySec! <= verseTargetSpanSec + 0.18 + 1e-6);
  assert.ok(extremePlan.fadeOutStartDelaySec !== null && extremePlan.fadeOutStartDelaySec! < extremePlan.stopAfterDelaySec!);

  // Case C: If Pre-Chorus ALSO has an active take starting at bar 4 (8.89s), Verse hard-stop stops before Pre-Chorus starts!
  const preTtsTake: VocalTake = {
    ...verseTtsTake,
    id: 'tk-pre-tts',
    sectionId: 'sec-pre',
    startGlobalBarIndex: 4,
    endGlobalBarIndex: 5,
  };
  const backToBackPlan = computeVocalTakePlaybackPlan(
    song,
    verseTtsTake,
    [verseTtsTake, preTtsTake],
    16.0,
    0,
    0
  );
  assert.ok(backToBackPlan.stopAfterDelaySec !== null);
  assert.ok(backToBackPlan.stopAfterDelaySec! <= verseTargetSpanSec - 0.029);

  // Case D: Real Mic take ALWAYS keeps playbackRate === 1.0 (zero chipmunk pitch shift)
  const verseMicTake: VocalTake = {
    id: 'tk-v-mic',
    name: 'Take 1 — Verse',
    scope: 'section',
    source: 'mic',
    sectionId: 'sec-verse',
    startGlobalBarIndex: 0,
    endGlobalBarIndex: 3,
    preRollOffsetSec: 1.0,
    audioDataUrl: 'data:audio/webm;base64,ZmFrZQ==',
    fxPreset: 'studio-warm',
    isActive: true,
    createdAt: '2026-11-15T00:00:00.000Z',
  };
  const micPlan = computeVocalTakePlaybackPlan(song, verseMicTake, [verseMicTake], 12.0, 0, 0);
  assert.equal(micPlan.playbackRate, 1.0);
  assert.equal(micPlan.isAiTts, false);

  // Case E: Seeking mid-Verse (bar 2) scales bufferOffsetSec by playbackRate
  const seekPlan = computeVocalTakePlaybackPlan(song, verseTtsTake, [verseTtsTake], 11.1111, 2, 0);
  assert.equal(seekPlan.delaySec, 0);
  const expectedOffset = (2 * (verseTargetSpanSec / 4)) * seekPlan.playbackRate;
  assert.ok(Math.abs(seekPlan.bufferOffsetSec - expectedOffset) < 0.05);
});

// ───────────────────── 3. Offline Soundfont Scheduler, AudioEngine & ExportModal Contracts ─────────────────────

test('Sprint B Audio & Export: OFFLINE_IMMEDIATE_SCHEDULER runs synchronously and resource cleanup / Blob contracts exist', () => {
  let dispatchedNote: number | null = null;
  const cancelFn = OFFLINE_IMMEDIATE_SCHEDULER.schedule(
    { note: 60, time: 12.5, duration: 0.5 },
    (ev) => {
      dispatchedNote =
        typeof ev === 'object' && ev !== null && 'note' in ev && typeof ev.note === 'number'
          ? ev.note
          : null;
    }
  );
  assert.equal(dispatchedNote, 60);
  assert.equal(typeof cancelFn, 'function');
  cancelFn();
  OFFLINE_IMMEDIATE_SCHEDULER.stop();

  const root = process.cwd();
  const mp3Src = fs.readFileSync(path.join(root, 'src/lib/mp3Exporter.ts'), 'utf8');
  assert.match(mp3Src, /scheduler:\s*OFFLINE_IMMEDIATE_SCHEDULER/);
  assert.match(mp3Src, /sf\.ready\.catch/);
  assert.match(mp3Src, /sf\?\.dispose\(\)/);
  assert.match(mp3Src, /trimAudioBufferTrailingSilence/);
  assert.match(mp3Src, /computeVocalTakePlaybackPlan/);

  const engineSrc = fs.readFileSync(path.join(root, 'src/lib/audioEngine.ts'), 'utf8');
  assert.match(engineSrc, /invalidateLoadedInstruments\(\)/);
  assert.match(engineSrc, /activeInitPromise/);
  assert.match(engineSrc, /computeVocalTakePlaybackPlan/);
  assert.match(engineSrc, /trimAudioBufferTrailingSilence/);

  const hookSrc = fs.readFileSync(path.join(root, 'src/hooks/useAudioEngine.ts'), 'utf8');
  assert.match(hookSrc, /invalidateLoadedInstruments\(\)/);

  const exportModalSrc = fs.readFileSync(path.join(root, 'src/components/ExportModal.tsx'), 'utf8');
  assert.ok(!exportModalSrc.includes('data:text/json;charset=utf-8,'));
  assert.match(exportModalSrc, /new Blob\(\[jsonString\],\s*\{\s*type:\s*'application\/json/);
  assert.match(exportModalSrc, /URL\.createObjectURL\(blob\)/);
});

// ───────────────────── 4. Thai Rhyme Helper Vowel Extensions ─────────────────────

test('Sprint B thaiRhymeHelper: classifies -ือ, เ-าะ, -ุย, เ-อะ, โ-ะ, เ-ะ, and -ะ without falling back to or/other', () => {
  // -ือ must NEVER fall into 'or' (/อ$/)
  assert.equal(classifyRhymeGroupId('มือ'), 'ue');
  assert.equal(classifyRhymeGroupId('ถือ'), 'ue');
  assert.equal(classifyRhymeGroupId('คือ'), 'ue');
  assert.equal(classifyRhymeGroupId('จับมือ'), 'ue');
  assert.equal(classifyRhymeGroupId('รอ'), 'or');
  assert.notEqual(classifyRhymeGroupId('มือ'), classifyRhymeGroupId('รอ'));

  // -ือ with เ-ือ remains 'uea'
  assert.equal(classifyRhymeGroupId('เหลือ'), 'uea');

  // Compound/multi-syllable pop words like หัวเราะ & เพราะ share oh_short
  assert.equal(classifyRhymeGroupId('หัวเราะ'), 'oh_short');
  assert.equal(classifyRhymeGroupId('เพราะ'), 'oh_short');
  assert.equal(classifyRhymeGroupId('คุย'), 'ui');
  assert.equal(classifyRhymeGroupId('เยอะ'), 'oe_short');
  assert.equal(classifyRhymeGroupId('โต๊ะ'), 'o_short');
  assert.equal(classifyRhymeGroupId('เตะ'), 'eh_short');
  assert.equal(classifyRhymeGroupId('นะ'), 'a_short');

  const couplet = validateThaiLyricCouplets([
    'ได้ยินเสียงเธอหัวเราะ',
    'แต่ในใจสั่นไหวเพราะรักเธอ',
    'อยากจับมือเธอไว้ไม่ห่าง',
    'เดินเคียงข้างกันทุกเวลา',
  ]);
  assert.ok(couplet.matchedPairs.some((p) => p.sharedGroupId === 'oh_short'));
});

// ───────────────────── 5. Slow Pop Budget, Outro Guard & Priority Polish ─────────────────────

test('Sprint B aiPrompts & architect: slow Thai Pop/R&B budget, Outro rule, and Chorus-first priority polish', () => {
  // Invariant check: default 68 BPM stays 4-6
  const default68 = getSyllableBudgetForBpm(68, '4/4');
  assert.equal(default68.min, 4);
  assert.equal(default68.max, 6);

  // Slow Pop/R&B at 68 BPM uses singable 4-6 phrasing with trailing breath rest
  const dee68 = getSyllableBudgetForBpm(68, '4/4', {
    thaiGenre: 'thai-pop',
    songwriterStyle: 'dee-nitipong',
  });
  assert.equal(dee68.tempoFeel, 'slow');
  assert.equal(dee68.max, 6);
  assert.ok(dee68.restSteps >= 2);

  // Heritage Luk-Thung / Luk-Krung stays tighter
  const lukThung68 = getSyllableBudgetForBpm(68, '4/4', {
    thaiGenre: 'luk-thung',
    songwriterStyle: 'sala-khunawut',
  });
  assert.ok(lukThung68.max <= 6);

  // Outro Bar 1 conciseness rule in Easy Architect system prompt
  const sysPrompt = buildEasyArchitectSystemPrompt({ bpm: 68, thaiGenre: 'thai-pop' });
  assert.match(sysPrompt, /Outro Bar 1/);

  // Priority selector picks Chorus + Pre-Chorus ahead of Verse when maxCount = 2
  const selected = selectPrioritySectionsForPolish(
    [
      { item: 'Verse', sectionType: 'verse', passed: false, hasDuplicates: false, syllableOverflowCount: 1 },
      { item: 'Pre-Chorus', sectionType: 'pre-chorus', passed: false, hasDuplicates: false },
      { item: 'Chorus', sectionType: 'chorus', passed: false, hasDuplicates: true },
      { item: 'Outro', sectionType: 'outro', passed: true, hasDuplicates: false, syllableOverflowCount: 2 },
    ],
    2
  );
  assert.deepEqual(
    selected.map((s) => s.item),
    ['Chorus', 'Pre-Chorus']
  );

  // buildRhymePolishPrompt includes weakPairs + outOfBudgetBars details cleanly
  const polishPrompt = buildRhymePolishPrompt(
    [
      {
        sectionName: 'Chorus',
        chords: ['C', 'G'],
        lines: ['วันนี้เธอหัวเราะ', 'แต่ฉันยังเก็บอาการเอาไว้ลำพังคนเดียว'],
        weakPairs: [[0, 1]],
        outOfBudgetBars: [{ barIndex: 1, syllables: 11, expectedMax: 6 }],
      },
    ],
    68
  );
  assert.match(polishPrompt, /วรรค 1 -> วรรค 2/);
  assert.match(polishPrompt, /11 พยางค์ เกินงบ/);
});

// ───────────────────── 6. Word-Boundary Section TTS Plan + targetDurationSec API ─────────────────────

test('Sprint B sectionUtils & tts-cue: buildSectionTtsTextPlan prevents mid-word slicing and tts-cue accepts targetDurationSec', async () => {
  const shortBars: SongBar[] = [
    makeBar(0, 'C', 'รักเธอเสมอ'),
    makeBar(1, 'G', 'ไม่เคยเปลี่ยนไป'),
  ];
  const shortPlan = buildSectionTtsTextPlan(shortBars, 240);
  assert.equal(shortPlan.wasTruncated, false);
  assert.equal(shortPlan.omittedBarsCount, 0);
  assert.equal(shortPlan.text, 'รักเธอเสมอ\nไม่เคยเปลี่ยนไป');

  const longBars: SongBar[] = [
    makeBar(0, 'C', 'ฉันเดินอยู่บนถนนเส้นเดิมที่แสนยาวไกลใต้แสงดาวในยามค่ำคืนที่เงียบงัน'),
    makeBar(1, 'G', 'ความทรงจำยังวนเวียนกลับมาทุกครั้งที่สายลมพัดผ่านหน้าต่างห้องนอนเก่า'),
    makeBar(2, 'Am', 'ต่อให้เวลาผ่านไปอีกสักกี่สิบปีฉันก็ยังจำรอยยิ้มอบอุ่นของเธอได้เสมอไม่เคยลืมเลือน'),
    makeBar(3, 'F', 'ฝากเพลงนี้ลอยไปถึงขอบฟ้าเพื่อบอกให้รู้ว่าหัวใจดวงนี้ยังรอคอยเธออยู่ตรงที่เดิม'),
  ];
  const truncatedPlan = buildSectionTtsTextPlan(longBars, 240);
  assert.equal(truncatedPlan.wasTruncated, true);
  assert.ok(truncatedPlan.text.length <= 240);
  assert.equal(truncatedPlan.includedBarsCount, 3);
  assert.equal(truncatedPlan.omittedBarsCount, 1);
  // Stops on complete 3rd bar boundary cleanly without partial fragments
  assert.ok(truncatedPlan.text.endsWith(longBars[2].lyrics));

  // Verify tts-cue handles targetDurationSec in offline simulated mode (0 API calls!)
  const prevKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const req = new Request('http://localhost/api/advance/tts-cue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'ทดสอบจังหวะร้องภาษาไทย',
        bpm: 108,
        targetDurationSec: 8.89,
        vocalMode: 'singing-demo',
        language: 'th',
      }),
    });
    const res = await ttsCuePost(req);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { isSimulated: boolean; cueText: string };
    assert.equal(body.isSimulated, true);
    assert.equal(body.cueText, 'ทดสอบจังหวะร้องภาษาไทย');
  } finally {
    if (prevKey !== undefined) {
      process.env.GEMINI_API_KEY = prevKey;
    }
  }

  const root = process.cwd();
  const builderSrc = fs.readFileSync(path.join(root, 'src/components/SectionBuilder.tsx'), 'utf8');
  assert.match(builderSrc, /buildSectionTtsTextPlan/);
  assert.match(builderSrc, /targetDurationSec:/);
  assert.match(builderSrc, /trimTrailing:\s*true/);
  assert.match(builderSrc, /source:\s*'ai-tts'/);
});
