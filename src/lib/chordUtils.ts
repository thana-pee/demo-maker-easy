const CHROMATIC_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CHROMATIC_FLAT  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Map note names to chromatic index (0..11)
const NOTE_TO_INDEX: Record<string, number> = {
  'C': 0, 'B#': 0,
  'C#': 1, 'DB': 1, 'Db': 1,
  'D': 2,
  'D#': 3, 'EB': 3, 'Eb': 3,
  'E': 4, 'FB': 4,
  'F': 5, 'E#': 5,
  'F#': 6, 'GB': 6, 'Gb': 6,
  'G': 7,
  'G#': 8, 'AB': 8, 'Ab': 8,
  'A': 9,
  'A#': 10, 'BB': 10, 'Bb': 10,
  'B': 11, 'CB': 11
};

export function parseChord(chordString: string): { root: string; quality: string } {
  const clean = chordString.trim();
  if (!clean) return { root: 'C', quality: '' };

  let root = clean.slice(0, 1).toUpperCase();
  let qualityIndex = 1;

  if (clean.length > 1 && (clean[1] === '#' || clean[1] === 'b' || clean[1] === 'B')) {
    root += clean[1] === 'B' ? 'b' : clean[1];
    qualityIndex = 2;
  }

  const quality = clean.slice(qualityIndex);
  return { root, quality };
}

export function transposeChord(chord: string, semitones: number, preferFlats = false): string {
  if (semitones === 0) return chord;
  const { root, quality } = parseChord(chord);
  const idx = NOTE_TO_INDEX[root];
  if (idx === undefined) return chord;

  const newIdx = (idx + semitones + 120) % 12;
  const noteList = preferFlats ? CHROMATIC_FLAT : CHROMATIC_SHARP;
  return noteList[newIdx] + quality;
}

/**
 * Calculates the fingering chord shape to play when a Capo is clamped.
 * Fingering Chord = Sounding Chord transposed by -capoFret semitones.
 * e.g., If the sounding chord is D and Capo is at fret 2, fingering is C.
 */
export function getCapoFingeringChord(soundingChord: string, capoFret: number): string {
  if (capoFret <= 0) return soundingChord;
  return transposeChord(soundingChord, -capoFret, false);
}

export function getDiatonicChords(key: string): string[] {
  const rootIdx = NOTE_TO_INDEX[key.toUpperCase()] ?? 0;
  // Major scale intervals: 0, 2, 4, 5, 7, 9, 11
  // Diatonic chord types: I, ii, iii, IV, V, vi, vii° + common 7th extensions
  const intervals = [0, 2, 4, 5, 7, 9];
  const list = CHROMATIC_SHARP;

  const I = list[(rootIdx + intervals[0]) % 12];
  const ii = list[(rootIdx + intervals[1]) % 12] + 'm';
  const iii = list[(rootIdx + intervals[2]) % 12] + 'm';
  const IV = list[(rootIdx + intervals[3]) % 12];
  const IVmaj7 = list[(rootIdx + intervals[3]) % 12] + 'maj7';
  const V = list[(rootIdx + intervals[4]) % 12];
  const vi = list[(rootIdx + intervals[5]) % 12] + 'm';
  const vi7 = list[(rootIdx + intervals[5]) % 12] + 'm7';

  return [I, ii, iii, IV, IVmaj7, V, vi, vi7];
}

export interface ProgressionPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  chords: string[]; // Relative to Key C
}

export const PROGRESSION_PRESETS: ProgressionPreset[] = [
  {
    id: 'folk-acoustic',
    name: 'โฟล์คอะคูสติกฟังสบาย',
    category: 'Acoustic / Folk',
    description: 'ทางคอร์ดฟังสบาย นุ่มนวล เหมาะกับเพลงเล่าเรื่อง (Verse)',
    chords: ['C', 'Fmaj7', 'Am7', 'G']
  },
  {
    id: 'pop-warm',
    name: 'ป๊อปอบอุ่นยอดฮิต',
    category: 'Pop Standard',
    description: 'ทางคอร์ดฮิตติดหูตลอดกาล ใช้ได้ทั้งท่อนร้องและท่อนฮุก (Chorus)',
    chords: ['C', 'G', 'Am', 'F']
  },
  {
    id: 'nostalgic-90s',
    name: 'บัลลาด 90s อารมณ์ซึ้ง',
    category: '90s Thai Ballad',
    description: 'ขึ้นด้วยคอร์ดไมเนอร์สร้างอารมณ์เหงา ลึกซึ้ง เหมาะกับเพลงช้า',
    chords: ['Am', 'Em', 'F', 'G']
  },
  {
    id: 'pre-chorus-lift',
    name: 'ทางคอร์ดส่งเข้าท่อนฮุก (Pre-Chorus Lift)',
    category: 'Build Up',
    description: 'ไต่ระดับความรู้สึกจากสอง-สาม-สี่-ห้า เพื่อส่งพลังเข้าหาท่อนฮุก',
    chords: ['Dm', 'Em', 'F', 'G']
  },
  {
    id: 'hook-split',
    name: 'ท่อนฮุกแบบห้องละ 2 คอร์ด',
    category: 'Chorus Split',
    description: 'คอร์ดละ 2 จังหวะ เคลื่อนไหวเร็ว กระชับ มีพลัง',
    chords: ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G']
  },
  {
    id: 'canon-acoustic',
    name: 'แคนอนป๊อปอะคูสติก (Canon Chord)',
    category: 'Classic Pop',
    description: 'สายเบสเดินลงแบบคลาสสิก นุ่ม ละมุน ร้องตามง่าย',
    chords: ['C', 'G', 'Am', 'Em', 'F', 'C', 'F', 'G']
  },
  {
    id: 'sweet-jazz-pop',
    name: 'แจ๊ส-ป๊อปนุ่มนวล (Smooth Soul)',
    category: 'Jazz / R&B',
    description: 'เพิ่มสีสันคอร์ด 7th ให้เพลงฟังดูหรู มีระดับ',
    chords: ['Fmaj7', 'Em7', 'Dm7', 'G']
  }
];
