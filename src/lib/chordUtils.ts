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

export function parseChord(chordString: string): { root: string; quality: string; bass?: string } {
  const clean = chordString.trim();
  if (!clean) return { root: 'C', quality: '' };

  const slashIdx = clean.indexOf('/');
  const mainPart = slashIdx >= 0 ? clean.slice(0, slashIdx).trim() : clean;
  const rawBass = slashIdx >= 0 ? clean.slice(slashIdx + 1).trim() : '';

  if (!mainPart) return { root: 'C', quality: '' };

  let root = mainPart.slice(0, 1).toUpperCase();
  let qualityIndex = 1;

  if (mainPart.length > 1 && (mainPart[1] === '#' || mainPart[1] === 'b' || mainPart[1] === 'B')) {
    root += mainPart[1] === 'B' ? 'b' : mainPart[1];
    qualityIndex = 2;
  }

  const quality = mainPart.slice(qualityIndex);

  let bass: string | undefined;
  if (rawBass) {
    let b = rawBass.slice(0, 1).toUpperCase();
    if (rawBass.length > 1 && (rawBass[1] === '#' || rawBass[1] === 'b' || rawBass[1] === 'B')) {
      b += rawBass[1] === 'B' ? 'b' : rawBass[1];
    }
    bass = b;
  }

  return bass ? { root, quality, bass } : { root, quality };
}

function transposeNoteName(note: string, semitones: number, preferFlats: boolean): string | null {
  const idx = NOTE_TO_INDEX[note];
  if (idx === undefined) return null;
  const newIdx = (idx + semitones + 120) % 12;
  const noteList = preferFlats ? CHROMATIC_FLAT : CHROMATIC_SHARP;
  return noteList[newIdx];
}

export function transposeChord(chord: string, semitones: number, preferFlats = false): string {
  if (semitones === 0) return chord;
  const { root, quality, bass } = parseChord(chord);
  const newRoot = transposeNoteName(root, semitones, preferFlats);
  if (!newRoot) return chord;

  let result = newRoot + quality;
  if (bass) {
    const newBass = transposeNoteName(bass, semitones, preferFlats);
    result += '/' + (newBass ?? bass);
  }
  return result;
}

const DISPLAY_KEYS_MAJOR = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const DISPLAY_KEYS_MINOR = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

/** คำนวณคีย์ปัจจุบันของเพลงจาก `song.baseKey` และ `song.transposeSemitones` */
export function getTransposedKeyName(baseKey?: string, transposeSemitones = 0): string {
  const cleaned = (baseKey || '').trim() || 'C';
  const parsed = parseChord(cleaned);
  const rootIdx = NOTE_TO_INDEX[parsed.root];
  if (rootIdx === undefined) return 'C';

  const isMinor = parsed.quality.toLowerCase().startsWith('m') && !parsed.quality.toLowerCase().startsWith('maj');
  const suffix = isMinor ? 'm' : '';
  if (!transposeSemitones) {
    return `${parsed.root}${suffix}`;
  }

  const targetIdx = (rootIdx + transposeSemitones + 120) % 12;
  const palette = isMinor && !parsed.root.includes('b') ? DISPLAY_KEYS_MINOR : DISPLAY_KEYS_MAJOR;
  return `${palette[targetIdx]}${suffix}`;
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

/**
 * แปลคุณภาพคอร์ด (Major, Minor, maj7, m7, dom7, sus2/sus4, add9, dim)
 * เป็นคำบรรยายอารมณ์สั้นๆ เพื่อช่วยคนแต่งเนื้อเพลง
 */
export function getChordEmotionalHint(chordSymbol: string, lang: 'th' | 'en' = 'th'): string {
  const trimmed = (chordSymbol || '').trim();
  if (!trimmed) return '';

  const { quality } = parseChord(trimmed);
  const q = quality.trim();
  const isEn = lang === 'en';

  if (/^(dim|°|m7b5)/i.test(q)) {
    return isEn ? 'Tense, dramatic pull' : 'ตึงเครียด ลุ้นระทึก บีบหัวใจ';
  }
  if (/^(aug|\+)/i.test(q)) {
    return isEn ? 'Dreamy, unresolved lift' : 'ล่องลอย ชวนฝัน รอเปลี่ยนฉาก';
  }
  if (/^(maj|M)(7|9|11|13)|^Δ/.test(q)) {
    return isEn ? 'Warm, dreamy romantic' : 'ละมุน อบอุ่น โรแมนติกชวนฝัน';
  }
  if (/^(m|min|-)/.test(q) && !/^maj/i.test(q)) {
    if (/(7|9|11|13)/.test(q)) {
      return isEn ? 'Mellow, soulful longing' : 'เหงาลึกซึ้ง นุ่มนวล คิดถึง';
    }
    return isEn ? 'Melancholic, deep feeling' : 'เศร้า เหงา จริงจังลึกซึ้ง';
  }
  if (/^sus2/i.test(q)) {
    return isEn ? 'Open, airy, hopeful' : 'โปร่งโล่ง กังวาน ค้างความหวัง';
  }
  if (/^sus(4)?/i.test(q)) {
    return isEn ? 'Yearning, waiting to resolve' : 'รอคอย ค้างคา รอคลี่คลาย';
  }
  if (/^add(9|2)/i.test(q)) {
    return isEn ? 'Bright, lush warmth' : 'สดใส ละมุน อบอุ่นร่วมสมัย';
  }
  if (/^(7|9|11|13)/.test(q)) {
    return isEn ? 'Driving, bluesy momentum' : 'ส่งแรง ดึงดูด รอส่งเข้าคอร์ดถัดไป';
  }

  return isEn ? 'Bright, grounded warmth' : 'สดใส มั่นคง อบอุ่นชัดเจน';
}
