/**
 * guitarVoicings.ts — ตารางจับคอร์ดกีตาร์ 6 สาย (Guitar Chord Voicing Dictionary)
 *
 * หน้าที่: แปลงชื่อคอร์ด (เช่น "Am7", "F#m", "Bb") เป็นโน้ต MIDI ของแต่ละสายกีตาร์จริง
 * เพื่อให้ engine ดีดทีละสายได้เหมือนคนจับคอร์ด (ไม่ใช่กดโน้ตแบบเปียโน)
 *
 * หลักการ:
 *  1) ถ้าเป็นคอร์ดเปิดยอดนิยม (C D E F G A, Dm Em Am, Fmaj7 ฯลฯ) ใช้ฟอร์มเปิดจริง
 *  2) ถ้าไม่ใช่ ใช้ฟอร์มทาบเลื่อนได้ (E-form / A-form) เลือกเฟร็ตที่ต่ำกว่า
 *  3) Capo: ใช้ฟอร์มของ "คอร์ดที่จับ" (fingering) แล้วบวกเฟร็ต capo ทำให้เสียงจริงตรงกับคอร์ดต้นฉบับ
 *     และได้คาแรกเตอร์เสียงสายเปิดเหมือนคนคาด capo เล่นจริง
 */

import { transposeChord, parseChord } from './chordUtils';

export type ChordQuality = 'maj' | 'm' | '7' | 'm7' | 'maj7' | 'sus4' | 'sus2' | 'add9';

/** จูนมาตรฐาน สาย 6 → สาย 1 (E2 A2 D3 G3 B3 E4) */
export const OPEN_STRING_MIDI = [40, 45, 50, 55, 59, 64] as const;

const PITCH_CLASS: Record<string, number> = {
  C: 0, 'B#': 0,
  'C#': 1, Db: 1,
  D: 2,
  'D#': 3, Eb: 3,
  E: 4, Fb: 4,
  F: 5, 'E#': 5,
  'F#': 6, Gb: 6,
  G: 7,
  'G#': 8, Ab: 8,
  A: 9,
  'A#': 10, Bb: 10,
  B: 11, Cb: 11,
};

/** ช่วงเสียงของแต่ละคุณภาพคอร์ด (semitone จาก root) */
const INTERVALS: Record<ChordQuality, number[]> = {
  maj: [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
  add9: [0, 4, 7, 14],
};

export function classifyQuality(raw: string): ChordQuality {
  const s = raw.trim();
  if (/^(maj|M)(7|9|11|13)/.test(s)) return 'maj7';
  if (/^sus2/.test(s)) return 'sus2';
  if (/^sus/.test(s)) return 'sus4';
  if (/^add(9|2)/.test(s)) return 'add9';
  if (/^(m|min|-)/.test(s) && !/^maj/.test(s)) {
    return /(7|9|11)/.test(s) ? 'm7' : 'm';
  }
  if (/^dim/.test(s)) return 'm';
  if (/^(aug|\+)/.test(s)) return 'maj';
  if (/^(7|9|11|13)/.test(s)) return '7';
  return 'maj'; // '', '6', '5' ฯลฯ
}

export interface ParsedChord {
  pc: number; // pitch class 0..11 ของ root (C=0)
  quality: ChordQuality;
  isMinor: boolean;
  /** pitch class 0..11 ของโน้ตเบสใน Slash Chord เช่น D/F# -> bassPc = 6 */
  bassPc?: number;
}

export function parseChordSymbol(chord: string): ParsedChord {
  const { root, quality, bass } = parseChord(chord);
  const pc = PITCH_CLASS[root] ?? 0;
  const q = classifyQuality(quality);
  const bassPc = bass !== undefined ? PITCH_CLASS[bass] : undefined;
  return {
    pc,
    quality: q,
    isMinor: q === 'm' || q === 'm7',
    ...(bassPc !== undefined ? { bassPc } : {}),
  };
}

export function chordIntervals(quality: ChordQuality): number[] {
  return INTERVALS[quality];
}

type Frets = (number | null)[]; // index 0 = สาย 6 ... index 5 = สาย 1

// ฟอร์มเปิดจริง [pitchClass, quality, frets]
const OPEN_SHAPES: Array<[number, ChordQuality, Frets]> = [
  [0, 'maj', [null, 3, 2, 0, 1, 0]], // C
  [2, 'maj', [null, null, 0, 2, 3, 2]], // D
  [4, 'maj', [0, 2, 2, 1, 0, 0]], // E
  [5, 'maj', [1, 3, 3, 2, 1, 1]], // F (ทาบเต็ม)
  [7, 'maj', [3, 2, 0, 0, 0, 3]], // G
  [9, 'maj', [null, 0, 2, 2, 2, 0]], // A
  [2, 'm', [null, null, 0, 2, 3, 1]], // Dm
  [4, 'm', [0, 2, 2, 0, 0, 0]], // Em
  [9, 'm', [null, 0, 2, 2, 1, 0]], // Am
  [5, 'maj7', [null, null, 3, 2, 1, 0]], // Fmaj7
  [0, 'maj7', [null, 3, 2, 0, 0, 0]], // Cmaj7
  [7, 'maj7', [3, 2, 0, 0, 0, 2]], // Gmaj7
  [9, 'm7', [null, 0, 2, 0, 1, 0]], // Am7
  [4, 'm7', [0, 2, 0, 0, 0, 0]], // Em7
  [2, 'm7', [null, null, 0, 2, 1, 1]], // Dm7
  [7, '7', [3, 2, 0, 0, 0, 1]], // G7
  [0, '7', [null, 3, 2, 3, 1, 0]], // C7
  [2, '7', [null, null, 0, 2, 1, 2]], // D7
  [4, '7', [0, 2, 0, 1, 0, 0]], // E7
  [9, '7', [null, 0, 2, 0, 2, 0]], // A7
  [0, 'add9', [null, 3, 2, 0, 3, 0]], // Cadd9
  [2, 'sus4', [null, null, 0, 2, 3, 3]], // Dsus4
  [2, 'sus2', [null, null, 0, 2, 3, 0]], // Dsus2
  [9, 'sus4', [null, 0, 2, 2, 3, 0]], // Asus4
  [9, 'sus2', [null, 0, 2, 2, 0, 0]], // Asus2
];

// ฟอร์มเลื่อนได้ (r = เฟร็ตของ root)
const E_FORM: Partial<Record<ChordQuality, (r: number) => Frets>> = {
  maj: (r) => [r, r + 2, r + 2, r + 1, r, r],
  m: (r) => [r, r + 2, r + 2, r, r, r],
  '7': (r) => [r, r + 2, r, r + 1, r, r],
  m7: (r) => [r, r + 2, r, r, r, r],
  maj7: (r) => [r, null, r + 1, r + 1, r, null],
  sus4: (r) => [r, r + 2, r + 2, r + 2, r, r],
};

const A_FORM: Partial<Record<ChordQuality, (r: number) => Frets>> = {
  maj: (r) => [null, r, r + 2, r + 2, r + 2, r],
  m: (r) => [null, r, r + 2, r + 2, r + 1, r],
  '7': (r) => [null, r, r + 2, r, r + 2, r],
  m7: (r) => [null, r, r + 2, r, r + 1, r],
  maj7: (r) => [null, r, r + 2, r + 1, r + 2, r],
  sus4: (r) => [null, r, r + 2, r + 2, r + 3, r],
  sus2: (r) => [null, r, r + 2, r + 2, r, r],
};

/** add9 ใช้ฟอร์ม maj แทน (ไม่มีโน้ต 9 ถ้าไม่ใช่ฟอร์มเปิด) */
function formQuality(q: ChordQuality): ChordQuality {
  return q === 'add9' ? 'maj' : q;
}

function pickFrets(pc: number, quality: ChordQuality): Frets {
  const open = OPEN_SHAPES.find(([p, q]) => p === pc && q === quality);
  if (open) return open[2];

  const fq = formQuality(quality);
  const rE = (pc - 4 + 12) % 12; // root บนสาย 6 (E)
  const rA = (pc - 9 + 12) % 12; // root บนสาย 5 (A)
  const eForm = E_FORM[fq];
  const aForm = A_FORM[fq];

  if (eForm && aForm) return rE <= rA ? eForm(rE) : aForm(rA);
  if (eForm) return eForm(rE);
  if (aForm) return aForm(rA);
  return A_FORM.maj!(rA);
}

export interface GuitarVoicingString {
  /** 0 = สาย 6 (ต่ำสุด) ... 5 = สาย 1 (สูงสุด) */
  stringIndex: number;
  midi: number;
}

export interface GuitarVoicing {
  /** เรียงจากสายต่ำ → สายสูง */
  strings: GuitarVoicingString[];
  /** ชื่อคอร์ดที่ "จับ" จริงบนฟิงเกอร์บอร์ด (ต่างจากเสียงจริงเมื่อคาด capo) */
  fingering: string;
}

/**
 * @param soundingChord คอร์ด "เสียงจริง" (หลัง transpose แล้ว)
 * @param capoFret 0..7 — ถ้า > 0 จะใช้ฟอร์มของคอร์ดที่จับแล้วบวกเฟร็ต capo
 */
export function getGuitarVoicing(soundingChord: string, capoFret = 0): GuitarVoicing {
  const capo = Math.max(0, Math.min(12, Math.round(capoFret)));
  const fingering = capo > 0 ? transposeChord(soundingChord, -capo) : soundingChord;
  const { pc, quality } = parseChordSymbol(fingering);
  const soundingParsed = parseChordSymbol(soundingChord);
  const frets = pickFrets(pc, quality);

  let strings: GuitarVoicingString[] = [];
  frets.forEach((fret, i) => {
    if (fret === null) return;
    strings.push({ stringIndex: i, midi: OPEN_STRING_MIDI[i] + fret + capo });
  });

  if (soundingParsed.bassPc !== undefined) {
    const slashMidi = 40 + ((soundingParsed.bassPc - 4 + 12) % 12); // E2 (40) .. D#3 (51)
    const bassStringIndex = slashMidi < 45 ? 0 : slashMidi < 50 ? 1 : 2;
    const filtered = strings.filter(
      (s) => s.midi > slashMidi && s.stringIndex > bassStringIndex
    );
    const upper =
      filtered.length >= 3 ? filtered : strings.filter((s) => s.midi > slashMidi);
    strings = [{ stringIndex: bassStringIndex, midi: slashMidi }, ...upper].sort(
      (a, b) => a.midi - b.midi || a.stringIndex - b.stringIndex
    );
  }

  return { strings, fingering };
}
