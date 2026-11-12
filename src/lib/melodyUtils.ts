/**
 * melodyUtils.ts — ฟังก์ชันช่วยเหลือสำหรับ Mini Piano Roll และ Melody Guide
 */

import { parseChord } from './chordUtils';
import { chordIntervals, classifyQuality } from './guitarVoicings';

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
