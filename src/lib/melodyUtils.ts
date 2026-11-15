/**
 * melodyUtils.ts — ฟังก์ชันช่วยเหลือสำหรับ Mini Piano Roll และ Melody Guide
 */

import type { MelodyNote, SectionType, TimeSignature } from '../types/song';
import { parseChord } from './chordUtils';
import { chordIntervals, classifyQuality } from './guitarVoicings';
import {
  analyzeThaiSyllablePhonetics,
  segmentThaiWordToSyllables,
  type ThaiSyllablePhonetics,
} from './thaiRhymeHelper';

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToNoteName(midi: number): string {
  const note = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

export function isBlackKey(midi: number): boolean {
  const pc = midi % 12;
  return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
}

export const ROOT_TO_INDEX: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11
};

export function getRootPitchClass(key: string): number {
  const clean = key.trim();
  const rootStr = clean.endsWith('m') ? clean.slice(0, -1) : clean;
  return ROOT_TO_INDEX[rootStr] ?? 0;
}

/** คืนค่า Pitch Classes (0–11) ของสเกลประจำคีย์ */
export function getScalePitchClasses(key: string, scale: 'major' | 'pentatonic' = 'major'): Set<number> {
  const clean = key.trim();
  const isMinor = clean.endsWith('m');
  const rootPc = getRootPitchClass(clean);

  const intervals = isMinor
    ? (scale === 'pentatonic' ? [0, 3, 5, 7, 10] : [0, 2, 3, 5, 7, 8, 10])
    : (scale === 'pentatonic' ? [0, 2, 4, 7, 9] : [0, 2, 4, 5, 7, 9, 11]);

  return new Set(intervals.map((iv) => (rootPc + iv) % 12));
}

/** คืนค่า Pitch Classes (0–11) ของโน้ตที่เป็นสมาชิกในคอร์ด */
export function getChordPitchClasses(chordSymbol: string): Set<number> {
  if (!chordSymbol) return new Set();
  const { root, quality } = parseChord(chordSymbol);
  const rootPc = ROOT_TO_INDEX[root] ?? 0;
  const q = classifyQuality(quality);
  const intervals = chordIntervals(q);
  return new Set(intervals.map((iv) => (rootPc + iv) % 12));
}

/** รายการโน้ต MIDI ในช่วงความถี่เสียงร้อง (Default Range: G3=55 ถึง E5=76) เรียงจากสูงไปต่ำ */
export function getPitchRange(minMidi = 55, maxMidi = 76): number[] {
  const list: number[] = [];
  for (let m = maxMidi; m >= minMidi; m--) {
    list.push(m);
  }
  return list;
}

export type GuideContourPattern = 'gentle-arch' | 'rising-hook' | 'call-response' | 'arpeggio';

export interface GenerateGuideMelodyOptions {
  chord1: string;
  chord2?: string | null;
  baseKey: string;
  totalSteps: number;
  stepsPerBeat?: number;
  pitchMin?: number;
  pitchMax?: number;
  pattern?: GuideContourPattern;
  vocalRegisterShift?: number;
}

function collectAllowedMidis(
  allowedPcs: Set<number>,
  minMidi: number,
  maxMidi: number
): number[] {
  const result: number[] = [];
  for (let midi = minMidi; midi <= maxMidi; midi += 1) {
    if (allowedPcs.has(midi % 12)) {
      result.push(midi);
    }
  }
  return result;
}

function pickNearestMidi(candidates: number[], targetMidi: number, fallbackMidi: number): number {
  if (candidates.length === 0) return fallbackMidi;
  let best = candidates[0];
  let bestDist = Math.abs(candidates[0] - targetMidi);
  for (let i = 1; i < candidates.length; i += 1) {
    const dist = Math.abs(candidates[i] - targetMidi);
    if (dist < bestDist) {
      best = candidates[i];
      bestDist = dist;
    }
  }
  return best;
}

/**
 * สร้างโน้ตเมโลดี้ไกด์ 1 ห้องให้ลงตัวกับคอร์ดและสเกลประจำคีย์โดยอัตโนมัติ (0 เครดิต)
 * จังหวะหลัก (Strong Beat) จะลงที่โน้ตในคอร์ดเสมอ ส่วนจังหวะเชื่อมจะใช้โน้ตในสเกลในช่วงเสียงร้อง
 */
export function generateChordGuideMelodyNotes(
  options: GenerateGuideMelodyOptions
): MelodyNote[] {
  const minMidi = Math.max(48, Math.min(72, options.pitchMin ?? 55));
  const maxMidi = Math.max(minMidi + 7, Math.min(84, options.pitchMax ?? 76));
  const totalSteps = Math.max(4, Math.min(16, Math.round(options.totalSteps)));
  const stepsPerBeat = Math.max(1, Math.min(4, Math.round(options.stepsPerBeat ?? 2)));
  const pattern: GuideContourPattern = options.pattern ?? 'gentle-arch';
  const shift = options.vocalRegisterShift ?? 0;

  const scalePcs = getScalePitchClasses(options.baseKey || 'C', 'major');
  const chord1Pcs = getChordPitchClasses(options.chord1 || options.baseKey || 'C');
  const chord2Pcs = options.chord2 ? getChordPitchClasses(options.chord2) : chord1Pcs;

  const midCenter = Math.max(minMidi + 2, Math.min(maxMidi - 2, 65 + shift));
  const splitPoint = Math.floor(totalSteps / 2);

  // กำหนดแผนผังตำแหน่ง (relativeStepRatio, offsetSemitonesFromCenter, durationFraction, preferChordTone)
  let blueprint: Array<{ ratio: number; offset: number; durSteps: number; chordTone: boolean }>;

  if (pattern === 'rising-hook') {
    blueprint = [
      { ratio: 0, offset: 0, durSteps: Math.max(1, stepsPerBeat), chordTone: true },
      { ratio: 0.25, offset: 4, durSteps: Math.max(1, stepsPerBeat), chordTone: true },
      { ratio: 0.5, offset: 7, durSteps: Math.max(1, stepsPerBeat), chordTone: true },
      { ratio: 0.75, offset: 9, durSteps: Math.max(1, stepsPerBeat), chordTone: false },
    ];
  } else if (pattern === 'call-response') {
    blueprint = [
      { ratio: 0, offset: 2, durSteps: Math.max(1, Math.floor(stepsPerBeat * 1.5)), chordTone: true },
      { ratio: 0.25, offset: 5, durSteps: Math.max(1, stepsPerBeat), chordTone: false },
      { ratio: 0.625, offset: 4, durSteps: Math.max(1, stepsPerBeat), chordTone: true },
      { ratio: 0.875, offset: 0, durSteps: Math.max(1, Math.floor(stepsPerBeat * 0.5)), chordTone: true },
    ];
  } else if (pattern === 'arpeggio') {
    blueprint = [
      { ratio: 0, offset: -2, durSteps: Math.max(1, stepsPerBeat), chordTone: true },
      { ratio: 0.25, offset: 2, durSteps: Math.max(1, stepsPerBeat), chordTone: true },
      { ratio: 0.5, offset: 6, durSteps: Math.max(1, stepsPerBeat), chordTone: true },
      { ratio: 0.75, offset: 2, durSteps: Math.max(1, stepsPerBeat), chordTone: true },
    ];
  } else {
    // 'gentle-arch': โค้งทำนองร้องง่ายแบบป๊อป/อะคูสติก
    blueprint = [
      { ratio: 0, offset: 0, durSteps: Math.max(1, stepsPerBeat), chordTone: true },
      { ratio: 0.25, offset: 3, durSteps: Math.max(1, stepsPerBeat), chordTone: false },
      { ratio: 0.5, offset: 5, durSteps: Math.max(1, stepsPerBeat), chordTone: true },
      { ratio: 0.75, offset: 2, durSteps: Math.max(1, stepsPerBeat), chordTone: true },
    ];
  }

  const notes: MelodyNote[] = [];
  const usedSteps = new Set<number>();

  for (let i = 0; i < blueprint.length; i += 1) {
    const slot = blueprint[i];
    const step = Math.max(0, Math.min(totalSteps - 1, Math.round(slot.ratio * totalSteps)));
    if (usedSteps.has(step)) continue;
    usedSteps.add(step);

    const activeChordPcs = step >= splitPoint ? chord2Pcs : chord1Pcs;
    const preferredPool = collectAllowedMidis(
      slot.chordTone && activeChordPcs.size > 0 ? activeChordPcs : scalePcs,
      minMidi,
      maxMidi
    );
    const scaleFallbackPool = collectAllowedMidis(scalePcs, minMidi, maxMidi);
    const candidates = preferredPool.length > 0 ? preferredPool : scaleFallbackPool;

    const targetMidi = Math.max(minMidi, Math.min(maxMidi, midCenter + slot.offset));
    const midiPitch = pickNearestMidi(candidates, targetMidi, midCenter);

    const nextRawRatio = blueprint[i + 1]?.ratio ?? 1;
    const nextStep = i + 1 < blueprint.length
      ? Math.max(step + 1, Math.min(totalSteps, Math.round(nextRawRatio * totalSteps)))
      : totalSteps;
    const maxAllowedDur = Math.max(1, nextStep - step);
    const durationSteps = Math.max(1, Math.min(maxAllowedDur, slot.durSteps));

    notes.push({ step, midiPitch, durationSteps });
  }

  return notes.sort((a, b) => a.step - b.step);
}

/** สร้างชุดโน้ตเมโลดี้ไกด์ให้ครบทั้งท่อน (สำหรับพรีวิว/ฮัมทำนอง) */
export function generateSectionGuideMelody(
  chords: string[],
  baseKey: string,
  timeSignature: TimeSignature = '4/4',
  vocalProfile: 'female' | 'male' | 'neutral' = 'neutral'
): MelodyNote[][] {
  const totalSteps = timeSignature === '4/4' ? 8 : 12;
  const stepsPerBeat = timeSignature === '4/4' ? 2 : timeSignature === '3/4' ? 4 : 2;
  const shift = vocalProfile === 'female' ? 3 : vocalProfile === 'male' ? -4 : 0;
  const patterns: GuideContourPattern[] = ['gentle-arch', 'call-response', 'rising-hook', 'gentle-arch'];

  return chords.map((chord, idx) =>
    generateChordGuideMelodyNotes({
      chord1: chord,
      baseKey,
      totalSteps,
      stepsPerBeat,
      pattern: patterns[idx % patterns.length],
      vocalRegisterShift: shift,
    })
  );
}

/**
 * แยก 1 วรรคเนื้อร้องเป็นพยางค์ร้องจริง (1–12 พยางค์) เพื่อใช้ผูกโน้ตเมโลดี้กับคำร้องและวรรณยุกต์
 */
export function splitThaiLyricSyllables(line: string): string[] {
  const cleaned = line
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .trim();
  if (!cleaned) return [];

  const tokens = segmentThaiWordToSyllables(cleaned).filter((t) => t.trim().length > 0);
  if (tokens.length <= 12) return tokens;

  // หากมีมากกว่า 12 พยางค์ ให้รวมคู่พยางค์ช่วงกลางเพื่อให้ลงใน 1 ห้องเพลงได้โดยไม่เกิน maxItems=12
  const compact: string[] = [...tokens];
  while (compact.length > 12) {
    const mid = Math.floor(compact.length / 2);
    compact.splice(mid, 2, `${compact[mid]}${compact[mid + 1]}`);
  }
  return compact;
}

export interface GenerateLyricAlignedMelodyOptions {
  lyrics: string;
  chord1: string;
  chord2?: string | null;
  chordsPerBar?: 1 | 2;
  baseKey?: string;
  totalSteps?: number;
  stepsPerBeat?: number;
  pitchMin?: number;
  pitchMax?: number;
  pattern?: GuideContourPattern;
  vocalRegisterShift?: number;
  barIndex?: number;
  sectionType?: SectionType;
}

export interface ConversationalStepPlanOptions {
  hasSecondChord?: boolean;
  sectionType?: SectionType;
  barIndex?: number;
}

/**
 * วางตำแหน่งจังหวะพยางค์แบบกลุ่มคำพูดธรรมชาติ (Conversational Phrasing):
 * แบ่งคำร้องเป็น 2 วลีพูดพร้อมช่องพักหายใจกลางห้อง (Beats 1-2 และ Beats 3-4)
 * แทนการหารเฉลี่ยเท่ากันทุกพยางค์แบบหุ่นยนต์
 */
export function buildConversationalStepPlan(
  syllables: string[],
  phonetics: ThaiSyllablePhonetics[],
  totalSteps = 16,
  options?: ConversationalStepPlanOptions
): number[] {
  const safeTotal = Math.max(8, Math.min(16, Math.round(totalSteps)));
  const count = syllables.length;
  if (count <= 0) return [];
  if (count === 1) return [0];

  const splitPoint = Math.floor(safeTotal / 2);
  if (count === 2) {
    if (options?.hasSecondChord) return [0, splitPoint];
    return options?.sectionType === 'outro' ? [0, Math.min(splitPoint - 2, 6)] : [0, 4];
  }

  const firstCount = Math.ceil(count / 2);
  const secondCount = count - firstCount;

  // Group 1 (Beats 1-2): วางวลีแรกให้จบก่อน Beat 3 เพื่อเหลือช่องหายใจกลางห้อง
  const group1Pickup =
    !options?.hasSecondChord &&
    options?.sectionType === 'verse' &&
    typeof options.barIndex === 'number' &&
    options.barIndex % 2 === 1 &&
    count <= 7 &&
    splitPoint >= 8
      ? 1
      : 0;

  const group1MaxEnd = Math.max(firstCount - 1, splitPoint - (count <= 8 ? 3 : 2));
  const group1Steps: number[] = [group1Pickup];

  for (let i = 1; i < firstCount; i += 1) {
    const prevStep = group1Steps[i - 1];
    const prevPhon = phonetics[i - 1];
    const remainingSlots = firstCount - i;
    const availableRoom = group1MaxEnd - prevStep;
    const isQuickShort = !prevPhon?.isLiveSyllable && prevPhon?.vowelLength === 'short';
    const wantAdvance =
      firstCount >= 5 || isQuickShort || availableRoom <= remainingSlots ? 1 : 2;
    const nextStep = Math.min(group1MaxEnd - (remainingSlots - 1), prevStep + wantAdvance);
    group1Steps.push(Math.max(prevStep + 1, Math.min(splitPoint - 1, nextStep)));
  }

  const lastGroup1 = group1Steps[group1Steps.length - 1];

  // Group 2 (Beats 3-4): เข้าจังหวะ 3 (หรือ pickup ก่อน Beat 3 เล็กน้อยเมื่อคำหนาแน่นมาก)
  const rawGroup2Start =
    !options?.hasSecondChord && secondCount >= 5 && splitPoint >= 8
      ? Math.max(lastGroup1 + 2, splitPoint - 1)
      : Math.max(lastGroup1 + (count <= 10 ? 2 : 1), splitPoint);

  const lastPhon = phonetics[count - 1];
  const trailingReserve =
    options?.sectionType === 'outro'
      ? 3
      : lastPhon?.isLiveSyllable
        ? 2
        : 1;
  const group2MaxEnd = Math.max(
    rawGroup2Start + Math.max(0, secondCount - 1),
    safeTotal - trailingReserve
  );
  const clampedGroup2Start = Math.min(
    safeTotal - secondCount,
    Math.max(lastGroup1 + 1, rawGroup2Start)
  );

  const group2Steps: number[] = [clampedGroup2Start];
  for (let j = 1; j < secondCount; j += 1) {
    const globalIdx = firstCount + j;
    const prevStep = group2Steps[j - 1];
    const prevPhon = phonetics[globalIdx - 1];
    const remainingSlots = secondCount - j;
    const effectiveCeiling = Math.min(safeTotal - 1, group2MaxEnd);
    const availableRoom = effectiveCeiling - prevStep;
    const isQuickShort = !prevPhon?.isLiveSyllable && prevPhon?.vowelLength === 'short';
    const wantAdvance =
      secondCount >= 5 || isQuickShort || availableRoom <= remainingSlots ? 1 : 2;
    const candidate = Math.min(effectiveCeiling - (remainingSlots - 1), prevStep + wantAdvance);
    group2Steps.push(Math.max(prevStep + 1, Math.min(safeTotal - 1, candidate)));
  }

  return [...group1Steps, ...group2Steps];
}

/**
 * สร้างโน้ตเมโลดี้ไกด์ 1 ห้องให้สอดคล้องทั้งคอร์ด (รองรับ 2 คอร์ด/ห้อง),
 * จำนวนพยางค์เนื้อร้องจริง และระดับเสียงวรรณยุกต์+คำเป็นคำตายของภาษาไทยแบบวลีพูดธรรมชาติ
 */
export function generateLyricAlignedGuideMelody(
  options: GenerateLyricAlignedMelodyOptions
): MelodyNote[];
export function generateLyricAlignedGuideMelody(
  lyrics: string,
  chord1: string,
  extra?: Omit<GenerateLyricAlignedMelodyOptions, 'lyrics' | 'chord1'> & {
    totalBars?: number;
  }
): MelodyNote[];
export function generateLyricAlignedGuideMelody(
  optionsOrLyrics: GenerateLyricAlignedMelodyOptions | string,
  chord1Arg?: string,
  extra?: Omit<GenerateLyricAlignedMelodyOptions, 'lyrics' | 'chord1'> & {
    totalBars?: number;
  }
): MelodyNote[] {
  const options: GenerateLyricAlignedMelodyOptions =
    typeof optionsOrLyrics === 'string'
      ? {
          ...(extra ?? {}),
          lyrics: optionsOrLyrics,
          chord1: chord1Arg ?? 'C',
        }
      : optionsOrLyrics;
  const totalSteps = Math.max(8, Math.min(16, Math.round(options.totalSteps ?? 16)));
  const stepsPerBeat = Math.max(1, Math.min(4, Math.round(options.stepsPerBeat ?? 4)));
  const minMidi = Math.max(48, Math.min(72, options.pitchMin ?? 55));
  const maxMidi = Math.max(minMidi + 7, Math.min(84, options.pitchMax ?? 76));
  const shift = options.vocalRegisterShift ?? 0;

  const syllables = splitThaiLyricSyllables(options.lyrics);
  if (syllables.length === 0) {
    return generateChordGuideMelodyNotes({
      chord1: options.chord1,
      chord2: options.chord2,
      baseKey: options.baseKey || 'C',
      totalSteps,
      stepsPerBeat,
      pitchMin: minMidi,
      pitchMax: maxMidi,
      pattern: options.pattern,
      vocalRegisterShift: shift,
    });
  }

  const baseKey = options.baseKey || 'C';
  const rootPc = getRootPitchClass(baseKey);
  const scalePcs = getScalePitchClasses(baseKey, 'major');
  const chord1Pcs = getChordPitchClasses(options.chord1 || baseKey);
  const chord2Pcs = options.chord2 ? getChordPitchClasses(options.chord2) : chord1Pcs;
  const splitPoint = Math.floor(totalSteps / 2);

  const syllablePhonetics = syllables.map((syl) => analyzeThaiSyllablePhonetics(syl));
  const stepPlan = buildConversationalStepPlan(syllables, syllablePhonetics, totalSteps, {
    hasSecondChord: Boolean(options.chord2),
    sectionType: options.sectionType,
    barIndex: options.barIndex,
  });

  const sectionShift =
    options.sectionType === 'chorus'
      ? 2
      : options.sectionType === 'bridge'
        ? 1
        : options.sectionType === 'outro'
          ? -1
          : 0;
  const midCenter = Math.max(minMidi + 3, Math.min(maxMidi - 2, 64 + shift + sectionShift));
  const notes: MelodyNote[] = [];

  let prevMidi = midCenter;
  const usedSteps = new Set<number>();

  for (let i = 0; i < syllables.length; i += 1) {
    let step = stepPlan[i] ?? Math.min(totalSteps - 1, i);
    step = Math.max(0, Math.min(totalSteps - 1, step));
    while (usedSteps.has(step) && step < totalSteps - 1) {
      step += 1;
    }
    if (usedSteps.has(step)) continue;
    usedSteps.add(step);

    const activeChordPcs = step >= splitPoint ? chord2Pcs : chord1Pcs;
    const isLastSyllable = i === syllables.length - 1;
    const isStrongBeat = step === 0 || step === splitPoint || step % stepsPerBeat === 0;
    const rootPool = collectAllowedMidis(new Set([rootPc]), minMidi, maxMidi);
    const chordPool = collectAllowedMidis(activeChordPcs, minMidi, maxMidi);
    const scalePool = collectAllowedMidis(scalePcs, minMidi, maxMidi);
    const pool =
      options.sectionType === 'outro' && isLastSyllable && rootPool.length > 0
        ? rootPool
        : (isStrongBeat || isLastSyllable) && chordPool.length > 0
          ? chordPool
          : scalePool.length > 0
            ? scalePool
            : chordPool;

    const phon = syllablePhonetics[i] ?? analyzeThaiSyllablePhonetics(syllables[i]);
    let targetOffset = 0;

    if (phon.tone === 'ตรี' || phon.pitchTarget === 'high') {
      targetOffset = 5;
    } else if (phon.tone === 'จัตวา' || phon.pitchTarget === 'rising') {
      targetOffset = Math.max(2, (prevMidi - midCenter) + 3);
    } else if (phon.tone === 'เอก' || phon.pitchTarget === 'low') {
      targetOffset = -3;
    } else if (phon.tone === 'โท') {
      targetOffset = isLastSyllable ? -1 : 2;
    } else {
      // สามัญ: เคลื่อนตามรูปทรงเมโลดี้ (gentle arch ตามตำแหน่งวรรค)
      const phrasePos = i / Math.max(1, syllables.length - 1);
      targetOffset = Math.round(Math.sin(phrasePos * Math.PI) * 3) + (options.barIndex && options.barIndex % 2 === 1 ? -1 : 1);
    }

    // Section Energy Contour adjustments: Pre-Chorus lifts up, Chorus emphasizes Bar 1 / climax, Outro resolves gently down
    if (options.sectionType === 'pre-chorus' && isLastSyllable) {
      targetOffset = Math.max(targetOffset, 4);
    } else if (options.sectionType === 'chorus' && (i === 0 || isLastSyllable)) {
      targetOffset = Math.max(targetOffset, 3);
    } else if (options.sectionType === 'outro' && isLastSyllable) {
      targetOffset = Math.min(targetOffset, 0);
    }

    const desiredMidi = Math.max(minMidi, Math.min(maxMidi, midCenter + targetOffset));
    const midiPitch = pickNearestMidi(pool, desiredMidi, midCenter);
    prevMidi = midiPitch;

    const nextPlannedStep =
      i + 1 < syllables.length
        ? Math.max(step + 1, Math.min(totalSteps, stepPlan[i + 1] ?? step + 1))
        : totalSteps;
    const gapToNext = Math.max(1, nextPlannedStep - step);

    // คำเป็นท้ายวลีหรือท้ายวรรคลากเสียงตามจังหวะหายใจธรรมชาติ คำตายสั้นคมชัด
    const durationSteps = isLastSyllable
      ? options.sectionType === 'outro'
        ? Math.max(3, totalSteps - step)
        : phon.isLiveSyllable
          ? Math.max(2, totalSteps - step)
          : Math.min(2, Math.max(1, totalSteps - step))
      : phon.isLiveSyllable
        ? Math.max(1, gapToNext)
        : 1;

    notes.push({
      step,
      midiPitch,
      durationSteps: Math.max(1, Math.min(totalSteps - step, durationSteps)),
    });
  }

  return notes.sort((a, b) => a.step - b.step);
}
