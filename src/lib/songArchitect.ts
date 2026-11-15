import { generateUniqueId } from './sectionUtils';
import { generateLyricAlignedGuideMelody } from './melodyUtils';
import { getChordEmotionalHint } from './chordUtils';
import { findThaiRhymes } from './thaiRhymeHelper';
import type {
  Ambience3DMode,
  BarPlayStyle,
  BassStyle,
  DrumStyle,
  GuitarModel,
  GuitarStyle,
  LeadGuitarDrive,
  LeadGuitarStyle,
  MelodyNote,
  MelodySound,
  PianoStyle,
  SectionIntensity,
  SectionType,
  SongBar,
  SongProject,
  SongSection,
  StringGauge,
  ThaiEmotionalResolution,
  ThaiLyricDialect,
  ThaiLyricEra,
  ThaiSongGenre,
  ThaiSongwriterStyle,
  TimeSignature,
} from '../types/song';

export type VocalProfile = 'female' | 'male' | 'neutral';
export type TempoFeel = 'slow' | 'medium' | 'fast';
export type BandDensityLevel = 'unplugged' | 'balanced' | 'full';

export interface EasyStylePresetConfig {
  id: string;
  nameTh: string;
  nameEn: string;
  descTh: string;
  descEn: string;
  guitarModel: GuitarModel;
  stringGauge: StringGauge;
  ambience3D: Ambience3DMode;
  defaultChords: string[];
  bpmByTempo: Record<TempoFeel, number>;
  verseRhythmStyle: GuitarStyle;
  chorusRhythmStyle: GuitarStyle;
  chorusDrumsStyle: DrumStyle;
  thaiGenre?: ThaiSongGenre;
}

export interface EasyArchitectInput {
  stylePreset: string;
  vocalProfile: VocalProfile;
  tempoFeel: TempoFeel;
  topic: string;
  language: 'th' | 'en';
  thaiGenre?: ThaiSongGenre;
  lyricEra?: ThaiLyricEra;
  lyricDialect?: ThaiLyricDialect;
  songwriterStyle?: ThaiSongwriterStyle;
  emotionalResolution?: ThaiEmotionalResolution;
}

export const EASY_STYLE_PRESETS: EasyStylePresetConfig[] = [
  {
    id: 'warm-acoustic',
    nameTh: 'Acoustic ร้านกาแฟ',
    nameEn: 'Warm Coffee-Shop Acoustic',
    descTh: 'กีตาร์ไนลอนอุ่นๆ เกาและตีคอร์ดนุ่มนวล ฟังสบาย',
    descEn: 'Intimate nylon warmth with gentle fingerpicking & brushed percussion',
    guitarModel: 'classical-nylon',
    stringGauge: 'standard-010',
    ambience3D: 'living-room',
    defaultChords: ['C', 'G', 'Am', 'F'],
    bpmByTempo: { slow: 72, medium: 88, fast: 112 },
    verseRhythmStyle: 'fingerpicking',
    chorusRhythmStyle: 'soft-strum',
    chorusDrumsStyle: 'shaker-cajon',
  },
  {
    id: 'sad-ballad',
    nameTh: 'Sad Pop เศร้าซึ้ง',
    nameEn: 'Emotional Sad Ballad',
    descTh: 'เปียโนและกีตาร์โปร่งอคูสติก สร้างจุดส่งอารมณ์ท่อนฮุค',
    descEn: 'Spacious piano pad & delicate acoustic swell into the chorus',
    guitarModel: 'dreadnought-steel',
    stringGauge: 'heavy-012',
    ambience3D: 'wood-studio',
    defaultChords: ['Am', 'F', 'C', 'G'],
    bpmByTempo: { slow: 68, medium: 82, fast: 104 },
    verseRhythmStyle: 'fingerpicking',
    chorusRhythmStyle: 'campfire-strum',
    chorusDrumsStyle: 'simple-kit',
  },
  {
    id: 'indie-folk',
    nameTh: 'Indie Folk ริมหน้าต่าง',
    nameEn: 'Breezy Indie Folk',
    descTh: 'คอร์ดโปร่งสว่าง โปรดิวซ์สะอาด เว้นช่องหายใจให้เสียงร้อง',
    descEn: 'Airy acoustic voicing with gentle piano arpeggios and tight pocket',
    guitarModel: 'ovation-roundback',
    stringGauge: 'standard-010',
    ambience3D: 'wood-studio',
    defaultChords: ['G', 'D', 'Em', 'C'],
    bpmByTempo: { slow: 76, medium: 94, fast: 118 },
    verseRhythmStyle: 'soft-strum',
    chorusRhythmStyle: 'campfire-strum',
    chorusDrumsStyle: 'shaker-cajon',
  },
  {
    id: 'upbeat-pop',
    nameTh: 'Pop สดใสติดหู',
    nameEn: 'Bright Catchy Pop',
    descTh: 'กรูฟสนุก จังหวะกระชับ ท่อนฮุคเปิดวงเต็มพร้อมเมโลดี้ร้องตามง่าย',
    descEn: 'Upbeat acoustic pop groove with full rhythm section lift in chorus',
    guitarModel: 'dreadnought-steel',
    stringGauge: 'standard-010',
    ambience3D: 'wood-studio',
    defaultChords: ['C', 'G', 'Am', 'F'],
    bpmByTempo: { slow: 82, medium: 106, fast: 126 },
    verseRhythmStyle: 'soft-strum',
    chorusRhythmStyle: 'campfire-strum',
    chorusDrumsStyle: 'simple-kit',
  },
  {
    id: 'soft-rock',
    nameTh: 'Acoustic Rock เวทีสด',
    nameEn: 'Unplugged Stage Rock',
    descTh: 'กีตาร์ไฟฟ้า Gibson Les Paul โทนอุ่นเสริมท่อนโซโล่และฮุค',
    descEn: 'Driving rhythm acoustic backed by warm overdrive electric lead solo',
    guitarModel: 'gibson-les-paul',
    stringGauge: 'heavy-012',
    ambience3D: 'unplugged-hall',
    defaultChords: ['Em', 'C', 'G', 'D'],
    bpmByTempo: { slow: 78, medium: 98, fast: 124 },
    verseRhythmStyle: 'soft-strum',
    chorusRhythmStyle: 'campfire-strum',
    chorusDrumsStyle: 'simple-kit',
    thaiGenre: 'thai-rock',
  },
  {
    id: 'thai-pop-hit',
    nameTh: 'ไทยป๊อป ฮิตติดหู (T-Pop)',
    nameEn: 'Contemporary Thai Pop',
    descTh: 'ภาษาพูดธรรมชาติ ท่อนฮุกจำติดหู ทางคอร์ดป๊อปมาตรฐานเล่นง่าย',
    descEn: 'Warm modern Thai Pop ballad/midtempo with memorable singable chorus',
    guitarModel: 'ovation-roundback',
    stringGauge: 'standard-010',
    ambience3D: 'wood-studio',
    defaultChords: ['C', 'G', 'Am', 'F'],
    bpmByTempo: { slow: 74, medium: 96, fast: 120 },
    verseRhythmStyle: 'fingerpicking',
    chorusRhythmStyle: 'soft-strum',
    chorusDrumsStyle: 'simple-kit',
    thaiGenre: 'thai-pop',
  },
  {
    id: 'thai-rock-90s',
    nameTh: 'ไทยร็อก พลังเต็มสูบ',
    nameEn: 'Thai Rock 90s / Modern',
    descTh: 'คำกระชับหนักแน่น ท่อนฮุคพุ่งแรง พร้อมกีตาร์ Gibson Overdrive',
    descEn: 'Powerful Thai alternative rock with driving groove and solo pocket',
    guitarModel: 'gibson-les-paul',
    stringGauge: 'heavy-012',
    ambience3D: 'unplugged-hall',
    defaultChords: ['Em', 'C', 'G', 'D'],
    bpmByTempo: { slow: 82, medium: 108, fast: 128 },
    verseRhythmStyle: 'soft-strum',
    chorusRhythmStyle: 'campfire-strum',
    chorusDrumsStyle: 'simple-kit',
    thaiGenre: 'thai-rock',
  },
  {
    id: 'phuea-chiwit-road',
    nameTh: 'เพื่อชีวิต เล่าเรื่องเดินทาง',
    nameEn: 'Phuea Chiwit Thai Folk',
    descTh: 'ถ้อยคำจริงใจ สายลม แสงดาว กีตาร์โปร่ง+คาฮองอุ่นๆ',
    descEn: 'Heartfelt storytelling Thai folk rock on dreadnought steel strings',
    guitarModel: 'dreadnought-steel',
    stringGauge: 'heavy-012',
    ambience3D: 'living-room',
    defaultChords: ['Am', 'G', 'F', 'E7'],
    bpmByTempo: { slow: 70, medium: 88, fast: 112 },
    verseRhythmStyle: 'fingerpicking',
    chorusRhythmStyle: 'campfire-strum',
    chorusDrumsStyle: 'shaker-cajon',
    thaiGenre: 'phuea-chiwit',
  },
  {
    id: 'luk-thung-heart',
    nameTh: 'ลูกทุ่งไทย อ้อนกินใจ',
    nameEn: 'Luk Thung Country Soul',
    descTh: 'เน้นคำเป็นสระเสียงยาวท้ายวรรค เปิดทางให้เอื้อนลูกคอหวานๆ',
    descEn: 'Classic Thai country storytelling tuned for expressive vocal vibrato',
    guitarModel: 'dreadnought-steel',
    stringGauge: 'standard-010',
    ambience3D: 'wood-studio',
    defaultChords: ['C', 'Am', 'Dm', 'G'],
    bpmByTempo: { slow: 66, medium: 84, fast: 116 },
    verseRhythmStyle: 'soft-strum',
    chorusRhythmStyle: 'campfire-strum',
    chorusDrumsStyle: 'simple-kit',
    thaiGenre: 'luk-thung',
  },
  {
    id: 'luk-krung-classic',
    nameTh: 'ลูกกรุง วินเทจคลาสสิก',
    nameEn: 'Luk Krung Vintage Ballad',
    descTh: 'ภาษากวีสละสลวย สัมผัสในพริ้วไหว กีตาร์ไนลอน+เปียโนคลาสสิก',
    descEn: 'Poetic vintage Bangkok ballroom ballad on warm nylon guitar',
    guitarModel: 'classical-nylon',
    stringGauge: 'standard-010',
    ambience3D: 'unplugged-hall',
    defaultChords: ['Cmaj7', 'Am7', 'Dm7', 'G7'],
    bpmByTempo: { slow: 64, medium: 76, fast: 94 },
    verseRhythmStyle: 'fingerpicking',
    chorusRhythmStyle: 'soft-strum',
    chorusDrumsStyle: 'shaker-cajon',
    thaiGenre: 'luk-krung',
  },
];

const VALID_TIME_SIGNATURES = new Set<TimeSignature>(['4/4', '3/4', '6/8']);
const VALID_GUITAR_MODELS = new Set<GuitarModel>([
  'classical-nylon',
  'dreadnought-steel',
  'ovation-roundback',
  'gibson-les-paul',
]);
const VALID_STRING_GAUGES = new Set<StringGauge>(['standard-010', 'heavy-012']);
const VALID_AMBIENCES = new Set<Ambience3DMode>(['living-room', 'wood-studio', 'unplugged-hall']);
const VALID_SECTION_TYPES = new Set<SectionType>([
  'intro',
  'verse',
  'pre-chorus',
  'chorus',
  'solo',
  'bridge',
  'outro',
]);
const VALID_INTENSITIES = new Set<SectionIntensity>(['low', 'medium', 'high']);
const VALID_BAR_PLAY_STYLES = new Set<BarPlayStyle>(['normal', 'let-ring', 'break']);
const VALID_RHYTHM_STYLES = new Set<GuitarStyle>(['campfire-strum', 'soft-strum', 'fingerpicking', 'lukthung-bounce', 'rock-power']);
const VALID_LEAD_STYLES = new Set<LeadGuitarStyle>(['melodic-solo', 'riff-fills', 'soft-arpeggio']);
const VALID_LEAD_DRIVES = new Set<LeadGuitarDrive>(['clean', 'crunch', 'overdrive', 'distortion', 'fuzz']);
const VALID_BASS_STYLES = new Set<BassStyle>(['root-fifth', 'warm-sustain', 'lukthung-groove', 'rnb-syncopated']);
const VALID_PIANO_STYLES = new Set<PianoStyle>(['warm-pad', 'gentle-arpeggio', 'rnb-neo-chord', 'rock-organ-pad']);
const VALID_DRUM_STYLES = new Set<DrumStyle>(['off', 'shaker-cajon', 'simple-kit', 'lukthung-3cha', 'rnb-pocket', 'rock-drive']);
const VALID_MELODY_SOUNDS = new Set<MelodySound>(['flute', 'piano', 'bell']);
export const VALID_SONGWRITER_STYLES = new Set<ThaiSongwriterStyle>([
  'none',
  'boy-kosiyabong',
  'dee-nitipong',
  'seefa',
  'sek-loso',
  'suea-thanapol',
  'phaiboon-butkhan',
  'suraphon-sombatcharoen',
  'chali-intrawichit',
  'sala-khunawut',
  'chonlathi-thanthong',
  'wasu-haohan',
  'joey-boy',
  'stamp-apiwat',
  'the-toys',
  'tan-lipta',
  'aed-carabao',
  'asanee-chotikul',
]);

const CHORD_TOKEN_REGEX =
  /^[A-G][#b]?(?:maj7|m7|min7|sus4|sus2|add9|dim|aug|m|7|9|6)?(?:\/[A-G][#b]?)?$/;

function clampInt(val: unknown, min: number, max: number, fallback: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.max(min, Math.min(max, Math.round(val)));
}

function pickEnum<T extends string>(val: unknown, validSet: Set<T>, fallback: T): T {
  if (typeof val === 'string' && validSet.has(val as T)) {
    return val as T;
  }
  return fallback;
}

export function getPresetConfig(stylePresetId: string): EasyStylePresetConfig {
  return EASY_STYLE_PRESETS.find((p) => p.id === stylePresetId) ?? EASY_STYLE_PRESETS[0];
}

/** ตรวจสอบและบีบช่วงตัวเลขโน้ตเมโลดี้ไกด์ให้ปลอดภัยสำหรับ Audio Engine */
export function clampMelodyNotesForBar(rawNotes: unknown): MelodyNote[] {
  if (!Array.isArray(rawNotes)) return [];
  const sanitized: MelodyNote[] = [];

  for (const item of rawNotes.slice(0, 12)) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const step = clampInt(obj.step, 0, 15, -1);
    const midiPitch = clampInt(obj.midiPitch, 45, 84, -1);
    const durationSteps = clampInt(obj.durationSteps, 1, 16, 2);
    if (step >= 0 && midiPitch >= 45) {
      sanitized.push({ step, midiPitch, durationSteps });
    }
  }

  return sanitized.sort((a, b) => a.step - b.step);
}

export function buildDiatonicGuideNotesForChord(
  chord: string,
  offsetIdx: number,
  lyrics?: string,
  chord2?: string,
  sectionType?: SectionType
): MelodyNote[] {
  if (lyrics && lyrics.trim().length > 0) {
    return generateLyricAlignedGuideMelody({
      lyrics,
      chord1: chord,
      chord2,
      totalSteps: 16,
      stepsPerBeat: 4,
      barIndex: offsetIdx,
      sectionType,
    });
  }

  const rootMatch = chord.match(/^([A-G][#b]?)/);
  const rootName = rootMatch ? rootMatch[1] : 'C';
  const rootMap: Record<string, number> = {
    C: 60, 'C#': 61, Db: 61, D: 62, 'D#': 63, Eb: 63,
    E: 64, F: 65, 'F#': 66, Gb: 66, G: 67, 'G#': 68, Ab: 68,
    A: 69, 'A#': 70, Bb: 70, B: 71,
  };
  const rootMidi = rootMap[rootName] ?? 60;
  const isMinor = /^[A-G][#b]?m(?!aj)/.test(chord);
  const thirdMidi = rootMidi + (isMinor ? 3 : 4);
  const fifthMidi = rootMidi + 7;

  return offsetIdx % 2 === 0
    ? [
        { step: 0, midiPitch: rootMidi, durationSteps: 4 },
        { step: 4, midiPitch: thirdMidi, durationSteps: 4 },
        { step: 8, midiPitch: fifthMidi, durationSteps: 4 },
        { step: 12, midiPitch: thirdMidi, durationSteps: 4 },
      ]
    : [
        { step: 0, midiPitch: fifthMidi, durationSteps: 4 },
        { step: 4, midiPitch: thirdMidi, durationSteps: 4 },
        { step: 8, midiPitch: rootMidi, durationSteps: 8 },
      ];
}

function sanitizeBar(
  rawBar: unknown,
  fallbackChord: string,
  barIdx: number,
  sectionType?: SectionType
): SongBar {
  const obj = rawBar && typeof rawBar === 'object' ? (rawBar as Record<string, unknown>) : {};
  const rawChords = Array.isArray(obj.chords)
    ? obj.chords
        .filter((c): c is string => typeof c === 'string')
        .map((c) => c.trim())
        .filter((c) => CHORD_TOKEN_REGEX.test(c))
        .slice(0, 2)
    : [];

  const chords = rawChords.length > 0 ? rawChords : [fallbackChord];
  const chordsPerBar: 1 | 2 = chords.length >= 2 ? 2 : 1;
  const playStyle = pickEnum(obj.playStyle, VALID_BAR_PLAY_STYLES, 'normal');
  const lyrics = typeof obj.lyrics === 'string' ? obj.lyrics.trim() : '';
  const clampedNotes = clampMelodyNotesForBar(obj.melodyNotes);

  // ล้าง melodyNotes บนท่อน intro เสมอ เพื่อกันเสียงขลุ่ย/เมโลดี้ไกด์ร้องนำโผล่ในอินโทร
  const resolvedMelodyNotes =
    sectionType === 'intro'
      ? []
      : clampedNotes.length > 0
        ? clampedNotes
        : lyrics
          ? buildDiatonicGuideNotesForChord(chords[0], barIdx, lyrics, chords[1], sectionType)
          : [];

  return {
    id: generateUniqueId('bar'),
    chordsPerBar,
    chords,
    playStyle,
    lyrics,
    melodyNotes: resolvedMelodyNotes,
  };
}

function defaultSectionTitle(type: SectionType, lang: 'th' | 'en'): string {
  const titles: Record<SectionType, { th: string; en: string }> = {
    intro: { th: 'Intro (เกริ่นนำ)', en: 'Intro' },
    verse: { th: 'Verse (ท่อนเล่าเรื่อง)', en: 'Verse' },
    'pre-chorus': { th: 'Pre-Chorus (ส่งอารมณ์)', en: 'Pre-Chorus' },
    chorus: { th: 'Chorus (ท่อนฮุค)', en: 'Chorus' },
    solo: { th: 'Solo (โซโล่)', en: 'Guitar Solo' },
    bridge: { th: 'Bridge (ท่อนแยก)', en: 'Bridge' },
    outro: { th: 'Outro (ท่อนจบ)', en: 'Outro' },
  };
  return titles[type][lang];
}

function sanitizeSection(
  rawSection: unknown,
  preset: EasyStylePresetConfig,
  lang: 'th' | 'en',
  secIdx: number
): SongSection {
  const obj =
    rawSection && typeof rawSection === 'object' ? (rawSection as Record<string, unknown>) : {};
  const type = pickEnum(obj.type, VALID_SECTION_TYPES, secIdx === 0 ? 'intro' : 'verse');
  const defaultInt: SectionIntensity =
    type === 'chorus' || type === 'solo'
      ? 'high'
      : type === 'pre-chorus' || type === 'bridge'
        ? 'medium'
        : 'low';
  const intensity = pickEnum(obj.intensity, VALID_INTENSITIES, defaultInt);
  const name =
    typeof obj.name === 'string' && obj.name.trim()
      ? obj.name.trim()
      : defaultSectionTitle(type, lang);

  const rawInst =
    obj.instruments && typeof obj.instruments === 'object'
      ? (obj.instruments as Record<string, unknown>)
      : {};

  const isQuietVocalPocket = type === 'verse' || type === 'intro' || type === 'outro';
  const defaultRhythmStyle =
    type === 'chorus' || type === 'solo' ? preset.chorusRhythmStyle : preset.verseRhythmStyle;

  const rawBars = Array.isArray(obj.bars) ? obj.bars : [];
  const barCount = Math.max(2, Math.min(8, rawBars.length || (type === 'intro' || type === 'outro' ? 2 : 4)));
  const bars: SongBar[] = [];
  for (let i = 0; i < barCount; i += 1) {
    bars.push(
      sanitizeBar(rawBars[i], preset.defaultChords[i % preset.defaultChords.length], i, type)
    );
  }

  return {
    id: generateUniqueId('sec'),
    name,
    type,
    intensity,
    instruments: {
      guitarRhythm: typeof rawInst.guitarRhythm === 'boolean' ? rawInst.guitarRhythm : true,
      // ป้องกันเสียง Lead แย่งเสียงร้องในท่อน Verse / Intro ตามกฎ Producer Spacing
      guitarLead:
        type === 'verse'
          ? false
          : typeof rawInst.guitarLead === 'boolean'
            ? rawInst.guitarLead
            : type === 'solo',
      bass:
        typeof rawInst.bass === 'boolean'
          ? rawInst.bass
          : type !== 'intro',
      piano:
        typeof rawInst.piano === 'boolean'
          ? rawInst.piano
          : type === 'pre-chorus' || type === 'chorus' || type === 'bridge',
      drums:
        typeof rawInst.drums === 'boolean'
          ? rawInst.drums
          : type === 'chorus' || type === 'solo' || type === 'pre-chorus',
      guitarRhythmStyle: pickEnum(rawInst.guitarRhythmStyle, VALID_RHYTHM_STYLES, defaultRhythmStyle),
      guitarLeadStyle: pickEnum(
        rawInst.guitarLeadStyle,
        VALID_LEAD_STYLES,
        type === 'solo' ? 'melodic-solo' : 'riff-fills'
      ),
      guitarLeadDrive: pickEnum(
        rawInst.guitarLeadDrive,
        VALID_LEAD_DRIVES,
        preset.id === 'soft-rock' ? 'overdrive' : 'clean'
      ),
      bassStyle: pickEnum(
        rawInst.bassStyle,
        VALID_BASS_STYLES,
        preset.id === 'warm-acoustic' || preset.id === 'sad-ballad' ? 'warm-sustain' : 'root-fifth'
      ),
      pianoStyle: pickEnum(rawInst.pianoStyle, VALID_PIANO_STYLES, 'warm-pad'),
      drumsStyle: pickEnum(
        rawInst.drumsStyle,
        VALID_DRUM_STYLES,
        isQuietVocalPocket ? 'off' : preset.chorusDrumsStyle
      ),
      guitarRhythmVolume: clampInt(rawInst.guitarRhythmVolume, 0, 100, 92),
      guitarLeadVolume: clampInt(rawInst.guitarLeadVolume, 0, 100, type === 'solo' ? 88 : 50),
      bassVolume: clampInt(rawInst.bassVolume, 0, 100, 82),
      pianoVolume: clampInt(rawInst.pianoVolume, 0, 100, 72),
      drumsVolume: clampInt(rawInst.drumsVolume, 0, 100, type === 'chorus' ? 90 : 65),
    },
    bars,
  };
}

/**
 * ตรวจสอบผลลัพธ์ JSON จาก Gemini AI Architect และแปลงเป็น SongProject ที่ถูกต้อง 100%
 * ทุก enum จะถูก clamp กับ src/types/song.ts เพื่อป้องกัน runtime errors
 */
export function sanitizeArchitectSongProject(
  rawPayload: unknown,
  input: EasyArchitectInput
): SongProject {
  const preset = getPresetConfig(input.stylePreset);
  const obj = rawPayload && typeof rawPayload === 'object' ? (rawPayload as Record<string, unknown>) : {};
  const rawMixer =
    obj.mixer && typeof obj.mixer === 'object' ? (obj.mixer as Record<string, unknown>) : {};

  const defaultKey =
    input.vocalProfile === 'female' ? 'G' : input.vocalProfile === 'male' ? 'C' : 'G';
  const rawKey = typeof obj.baseKey === 'string' ? obj.baseKey.trim() : '';
  const baseKey = /^[A-G][#b]?m?$/.test(rawKey) ? rawKey : defaultKey;

  const guitarModel = pickEnum(obj.guitarModel, VALID_GUITAR_MODELS, preset.guitarModel);
  const stringGauge = pickEnum(obj.stringGauge, VALID_STRING_GAUGES, preset.stringGauge);
  const ambience3D = pickEnum(obj.ambience3D, VALID_AMBIENCES, preset.ambience3D);
  const timeSignature = pickEnum(obj.timeSignature, VALID_TIME_SIGNATURES, '4/4');
  const bpm = clampInt(obj.bpm, 55, 160, preset.bpmByTempo[input.tempoFeel]);
  const defaultCapo = input.vocalProfile === 'female' ? 2 : 0;
  const capoFret = clampInt(obj.capoFret, 0, 7, defaultCapo);
  const title =
    typeof obj.title === 'string' && obj.title.trim()
      ? obj.title.trim().slice(0, 80)
      : input.topic.trim().slice(0, 50) || preset.nameTh;

  const rawSections = Array.isArray(obj.sections) ? obj.sections.slice(0, 7) : [];
  const baseSections =
    rawSections.length >= 2
      ? rawSections.map((sec, idx) => sanitizeSection(sec, preset, input.language, idx))
      : buildSimulatedArchitectSong(input).sections;

  const sections: SongSection[] = baseSections.map((sec, secIdx) => {
    const isOutroSec = sec.type === 'outro' || secIdx === baseSections.length - 1;
    let prevBarWasBreak = false;
    const cleanedBars: SongBar[] = sec.bars.map((bar, barIdx) => {
      let nextPlayStyle = bar.playStyle;
      const isFinalBarOfOutro = isOutroSec && barIdx === sec.bars.length - 1;
      const isSlowBalladBreak =
        nextPlayStyle === 'break' &&
        bpm < 78 &&
        (sec.type === 'pre-chorus' || barIdx === sec.bars.length - 1);
      if ((isFinalBarOfOutro || isSlowBalladBreak) && nextPlayStyle === 'break') {
        nextPlayStyle = 'let-ring';
      } else if (nextPlayStyle === 'break' && prevBarWasBreak && bar.lyrics.trim().length > 0) {
        nextPlayStyle = 'normal';
      }
      prevBarWasBreak = nextPlayStyle === 'break';

      return {
        ...bar,
        playStyle: nextPlayStyle,
        melodyNotes: sec.type === 'intro' ? [] : bar.melodyNotes,
      };
    });

    return {
      ...sec,
      bars: cleanedBars,
    };
  });

  const leadDriveRaw = pickEnum(rawMixer.guitarLeadDrive, VALID_LEAD_DRIVES, 'clean');
  const normalizedLeadDrive = leadDriveRaw === 'fuzz' ? 'distortion' : leadDriveRaw;

  return {
    id: generateUniqueId('song'),
    version: 1,
    title,
    updatedAt: new Date().toISOString(),
    bpm,
    timeSignature,
    baseKey,
    transposeSemitones: 0,
    capoFret,
    countInEnabled: true,
    guitarModel,
    stringGauge,
    ambience3D,
    statusTag: 'draft',
    thaiGenre: input.thaiGenre ?? preset.thaiGenre ?? 'thai-pop',
    lyricEra: input.lyricEra ?? 'modern-indie',
    lyricDialect: input.lyricDialect ?? 'standard',
    songwriterStyle: pickEnum(
      obj.songwriterStyle,
      VALID_SONGWRITER_STYLES,
      pickEnum(input.songwriterStyle, VALID_SONGWRITER_STYLES, 'none')
    ),
    emotionalResolution: input.emotionalResolution ?? 'auto',
    easyConfig: {
      stylePreset: preset.id,
      vocalProfile: input.vocalProfile,
      tempoFeel: input.tempoFeel,
      generatedAt: new Date().toISOString(),
    },
    mixer: {
      guitarRhythm: {
        enabled: true,
        volume: clampInt(rawMixer.guitarRhythmVolume, 0, 100, 92),
        style: pickEnum(rawMixer.guitarRhythmStyle, VALID_RHYTHM_STYLES, preset.verseRhythmStyle),
        model: guitarModel,
      },
      guitarLead: {
        enabled: preset.id === 'soft-rock',
        volume: clampInt(rawMixer.guitarLeadVolume, 0, 100, 68),
        style: pickEnum(rawMixer.guitarLeadStyle, VALID_LEAD_STYLES, 'riff-fills'),
        model: guitarModel,
        drive: normalizedLeadDrive,
      },
      bass: {
        enabled: true,
        volume: clampInt(rawMixer.bassVolume, 0, 100, 80),
        style: pickEnum(rawMixer.bassStyle, VALID_BASS_STYLES, 'warm-sustain'),
      },
      piano: {
        enabled: true,
        volume: clampInt(rawMixer.pianoVolume, 0, 100, 70),
        style: pickEnum(rawMixer.pianoStyle, VALID_PIANO_STYLES, 'warm-pad'),
      },
      drums: {
        enabled: true,
        volume: clampInt(rawMixer.drumsVolume, 0, 100, 78),
        style: pickEnum(rawMixer.drumsStyle, VALID_DRUM_STYLES, preset.chorusDrumsStyle),
      },
      melody: {
        enabled: true,
        volume: clampInt(rawMixer.melodyVolume, 0, 100, 56),
        sound: pickEnum(rawMixer.melodySound, VALID_MELODY_SOUNDS, 'flute'),
      },
      vocal: {
        enabled: true,
        volume: 100,
      },
    },
    sections,
  };
}

export interface SimulatedSongLyricsBundle {
  verse: string[];
  'pre-chorus': string[];
  chorus: string[];
  bridge: string[];
  outro: string[];
  rhymeNote: string;
}

export interface SimulatedLyricsInputOptions {
  topic?: string;
  mood?: string;
  language?: 'th' | 'en';
  thaiGenre?: ThaiSongGenre;
  lyricDialect?: ThaiLyricDialect;
  songwriterStyle?: ThaiSongwriterStyle;
  emotionalResolution?: ThaiEmotionalResolution;
}

function resolveSimulatedOutroLines(
  resolution: ThaiEmotionalResolution | undefined,
  genre: ThaiSongGenre,
  writer: ThaiSongwriterStyle | undefined,
  isEn: boolean
): string[] {
  if (isEn) {
    if (resolution === 'piercing-sting') {
      return ['In the end I stand alone tonight', 'Holding love you never wanted in your life'];
    }
    if (resolution === 'empowering-anthem') {
      return ['Rising higher through the open sky', 'No more fear can dim the fire inside'];
    }
    if (resolution === 'fulfilling-warm') {
      return ['Nothing else is missing when you stay', 'Holding hands into the light of day'];
    }
    return ['Let the final chord ring soft and true', 'Every quiet note belongs to you'];
  }

  if (resolution === 'piercing-sting') {
    return [
      'สุดท้ายก็เหลือแค่ฉันลำพัง',
      'หวังแค่ลืมเรื่องเธอได้สักวัน',
    ];
  }
  if (resolution === 'fulfilling-warm') {
    return [
      'ไม่ต้องขออะไรจากฟ้าไกล',
      'แค่มีเธอก็เพียงพอแล้วในใจ',
    ];
  }
  if (resolution === 'empowering-anthem') {
    return [
      'ก้าวข้ามคืนวันอันหวั่นไหว',
      'ใจดวงนี้ชนะแล้วทุกเส้นทาง',
    ];
  }
  if (resolution === 'catchy-earworm') {
    return [
      'จำคำนี้เอาไว้ในหัวใจ',
      'ในวันที่คิดถึงกันอย่าลืมโทรมา',
    ];
  }
  if (resolution === 'nostalgic-fade') {
    return [
      'ลมเย็นยังพัดกลิ่นวันวานกลับมา',
      'พาภาพเธอค้างไว้ในความทรงจำ',
    ];
  }

  if (writer === 'dee-nitipong' || writer === 'seefa') {
    return [
      'จบลงตรงความจริงที่ไม่อาจฝืน',
      'คืนหัวใจให้เธอก้าวเดินต่อไป',
    ];
  }
  if (genre === 'luk-thung' || writer === 'phaiboon-butkhan' || writer === 'sala-khunawut') {
    return [
      'ฝากสายลมอ้อนฟ้าถึงคนไกล',
      'ใจดวงนี้ยังคอยเจ้าคืนบ้านนา',
    ];
  }
  if (genre === 'luk-krung' || writer === 'chali-intrawichit') {
    return [
      'ตราบแสงจันทร์ยังส่องฟ้าไม่เลือนลาง',
      'นางในฝันยังเคียงข้างห้วงฤทัย',
    ];
  }
  if (writer === 'aed-carabao') {
    return [
      'เก็บหยาดเหงื่อและศรัทธาไว้บนแผ่นดิน',
      'ได้ยินเสียงเพลงชีวิตขับขานต่อไป',
    ];
  }
  if (writer === 'asanee-chotikul') {
    return [
      'ได้ก็ดีแค่ไหนหัวใจก็ยอมรับมัน',
      'จำไว้ทุกวันว่าฉันไม่เคยเปลี่ยนใจ',
    ];
  }
  if (genre === 'thai-rock' || writer === 'sek-loso' || writer === 'suea-thanapol') {
    return [
      'ไม่ว่าจะล้มสักกี่ครา',
      'พาสองเท้าก้าวไปให้ถึงปลายทาง',
    ];
  }
  if (writer === 'joey-boy' || writer === 'the-toys') {
    return [
      'คืนนี้ปล่อยทำนองลอยตามลมไป',
      'ใจยังยิ้มได้ทุกทีที่นึกถึงเธอ',
    ];
  }
  return [
    'เก็บความทรงจำนี้ไว้ไม่เลือนราง',
    'ทางข้างหน้ายังมีเพลงคอยปลอบใจ',
  ];
}

/**
 * สร้างชุดเนื้อเพลงจำลองที่เปลี่ยนตามแนวเพลง สไตล์นักแต่งเพลง โหมดจบเพลง และภาษาถิ่น
 * โดยบังคับสัมผัสส่งท้ายวรรคเข้าต้น/กลางวรรคถัดไป และมีเนื้อท่อน Outro เสมอ
 */
export function buildStyledSimulatedSongLyrics(
  options: SimulatedLyricsInputOptions
): SimulatedSongLyricsBundle {
  const isEn = options.language === 'en';
  const rawTopic = (options.topic ?? '').trim();
  const topicShort = rawTopic.slice(0, 18);
  const genre: ThaiSongGenre = options.thaiGenre ?? 'thai-pop';
  const writer = options.songwriterStyle;
  const resolution = options.emotionalResolution;
  const moodLower = (options.mood ?? '').toLowerCase();

  if (isEn) {
    const topicEn = rawTopic || 'our story';
    const outro = resolveSimulatedOutroLines(resolution, genre, writer, true);
    return {
      verse: [
        `Midnight shadows frame the thought of ${topicEn}`,
        `Quiet streetlights trace the miles we used to ride`,
        `Side by side we spoke without a single fear`,
        `Clearer now I feel your echo waiting here`,
      ],
      'pre-chorus': [
        `Every breath rises as the skyline glows`,
        `Knowing well the truth that only silence knows`,
      ],
      chorus: [
        `Hold on tight before the night slips out of view`,
        `Through the storm my honest heart still turns to you`,
        `Every melody remembers how we fell`,
        `Tell me this song can break the quiet spell`,
      ],
      bridge: [
        `Maybe time will bend the road back to your door`,
        `More than words could ever promise once before`,
      ],
      outro,
      rhymeNote: 'Simulated English acoustic-pop phrasing with couplet rhymes and outro resolution.',
    };
  }

  let verse: string[];
  let preChorus: string[];
  let chorus: string[];
  let bridge: string[];
  let rhymeNote: string;

  if (writer === 'aed-carabao') {
    verse = [
      `${topicShort ? `เล่าเรื่อง${topicShort}` : 'ออกเดินทาง'}บนแผ่นดินกว้าง`,
      'ก้าวไปตามทางไม่เคยหวั่นไหว',
      'สู้ด้วยหัวใจแม้เหนื่อยทุกวัน',
      'จุดไฟแห่งฝันให้คนเดินทาง',
      'แบกหยาดเหงื่อสร้างชีวิตบนผืนนา',
      'เวลาผันผ่านศรัทธาไม่จาง',
      'ยืนเคียงข้างพี่น้องร่วมแผ่นดิน',
      'ได้ยินเสียงพิณปลุกใจให้ก้าวเดิน',
    ];
    preChorus = [
      'แม้คลื่นลมโหมกระหน่ำกลางหนทาง',
      'ยังไม่วางศักดิ์ศรีที่เคยตั้งไว้',
    ];
    chorus = [
      'ข้ามทะเลใจไปให้ถึงฝั่งฝัน',
      'จับมือกันฟันฝ่าไม่ยอมถอดใจ',
      'ปลุกพลังคนไทยสู้ไม่เคยถอย',
      'ร้อยเรื่องราวชีวิตสร้างวันใหม่',
    ];
    bridge = [
      'สัจธรรมชีวิตสอนเราให้แกร่ง',
      'เติมเรี่ยวแรงด้วยใจที่ไม่ยอมแพ้',
    ];
    rhymeNote = 'สไตล์แอ๊ด คาราบาว (เพื่อชีวิต/สามช่า): ภาษาชาวบ้านคมคาย สโลแกนจำแม่น ส่งสัมผัสทุกวรรค';
  } else if (writer === 'asanee-chotikul') {
    verse = [
      `${topicShort ? `เรื่อง${topicShort}` : 'บอกใคร'}บอกใจว่าไม่เป็นไร`,
      'ในใจลึกๆ ยังจำคำของเธอ',
      'ได้แต่มองเงาเธอในคืนเหงา',
      'เก็บเรื่องของเราไว้ในหัวใจ',
      'ปากบอกไม่แคร์แต่ยังห่วงใย',
      'ทั้งหัวใจยังรอเธอเสมอ',
      'แค่ได้เจอหน้ากันก็ดีใจ',
      'ไม่มีอะไรเสียดายเลยสักวัน',
    ];
    preChorus = [
      'ได้ก็ดี ได้ก็ดี บอกใจอย่างนี้',
      'ทั้งที่ใจดวงนี้ยังลืมไม่ลง',
    ];
    chorus = [
      'ก็เคยสัญญา สัญญาไม่ลืมกัน',
      'แต่วันนั้นเธอกลับเป็นคนเปลี่ยนใจ',
      'อยากได้ยินว่ารักกันอีกสักที',
      'ได้ก็ดี ได้ก็ดี แค่ไม่ลืมกัน',
    ];
    bridge = [
      'ยินดีไม่มีปัญหาถ้าเธอจะไป',
      'เจ็บแค่ไหนหัวใจก็ยอมรับมัน',
    ];
    rhymeNote = 'สไตล์อัสนี โชติกุล (ร็อกคำซ้ำ/จิ๊กโก๋อกหัก): ซ้ำวลีสั้นตอกย้ำใน Bar 1 & Bar 4 ส่งสัมผัสต่อเนื่อง';
  } else if (writer === 'joey-boy') {
    verse = [
      `คิดถึงจัดเลยหยิบโทรศัพท์มากดทัก${topicShort ? `เรื่อง${topicShort}` : ''}`,
      'รักก็บอกรักอย่ามัวกั๊กเดี๋ยวไม่ทัน',
      'ปั่นจักรยานฝ่าไฟแดงมาหาทุกวัน',
      'มันจะฟินแค่ไหนถ้าคืนนี้ได้กอดกัน',
      'หันมองนาฬิกาเวลาเดินไวเหลือเกิน',
      'เดินยิ้มคนเดียวกลางถนนไม่เขินใคร',
      'ใจมันเต้นตึกตักตั้งแต่เธอตอบข้อความ',
      'ถามจริงคืนนี้ว่างไหมอยากชวนคุยยาว',
    ];
    preChorus = [
      'จังหวะหัวใจมันเร่งบีตขึ้นทุกที',
      'มีคำพูดในใจอยากส่งให้เธอฟัง',
    ];
    chorus = [
      'บอกมาเลยไม่ต้องเขินกันอีกต่อไป',
      'ใจตรงกันแล้วจะรอเวลาไปทำไม',
      'ใครจะมองยังไงก็ปล่อยให้เขามองไป',
      'ในคืนนี้ขอแค่มีเธอข้างกันก็พอ',
    ];
    bridge = [
      'ไม่ต้องคิดเยอะให้ปวดหัวไปทั้งคืน',
      'ยื่นมือมาจับไว้แล้วเต้นไปด้วยกัน',
    ];
    rhymeNote = 'สไตล์โจอี้ บอย: สัมผัสในรัวกระชั้น คำตายลงจังหวะเด้งสนุก';
  } else if (writer === 'the-toys' || genre === 'thai-rnb') {
    verse = [
      `ไฟนีออนสะท้อนบนกระจกยามค่ำคืน${topicShort ? `นึกถึง${topicShort}` : ''}`,
      'ตื่นจากฝันเดิมแต่เสียงเธอยังวนเวียน',
      'เขียนข้อความค้างไว้ไม่กล้ากดส่งไป',
      'ในหัวใจยังติดอยู่ในท่วงทำนองเดิม',
      'เพิ่มเสียงเพลงเบาๆ กลางห้องที่เงียบงัน',
      'วันเวลาผ่านไปใจยังสั่นเมื่อพบเธอ',
      'เผลอหลับตาลงก็เห็นเพียงภาพคนเดิม',
      'เริ่มใหม่ไม่ได้เลยเพราะใจยังผูกพัน',
    ];
    preChorus = [
      'ยิ่งดึกเท่าไรภาพเธอยิ่งลอยเข้ามา',
      'พาใจดวงนี้หลุดลอยไปในคืนเหงา',
    ];
    chorus = [
      'แค่ได้เห็นเธอเดินผ่านคืนนี้ใจก็สั่นไหว',
      'ไม่รู้ทำไมต้องคอยแอบมองอยู่ตรงนี้ทุกที',
      'มีภาพเธอยังวนในใจจนแทบละลาย',
      'สายลมเอยช่วยพาใจลอยไปหาเธอ',
    ];
    bridge = [
      'ปล่อยให้คืนนี้พัดผ่านไปอย่างช้าๆ',
      'ถ้าเธอยังจำเสียงนี้ได้ก็หันมองมา',
    ];
    rhymeNote = 'สไตล์ Melodic R&B / The TOYS: คำรัวพยางค์ชิดช่วงต้นสลับสระเปิดเอื้อนท้ายห้อง';
  } else if (writer === 'dee-nitipong' || writer === 'seefa') {
    verse = [
      `นั่งมองหน้าต่างในคืนที่ไม่มีคำลา${topicShort ? `กับ${topicShort}` : ''}`,
      'นาฬิกายังเดินต่อโดยไม่รอหัวใจ',
      'ใครคนหนึ่งเก็บกระเป๋าเดินออกจากชีวิต',
      'คิดทบทวนเท่าไรก็ยังหาเหตุผลไม่เจอ',
      'เสมอมาฉันทุ่มเทให้เธอจนหมดหน้าตัก',
      'รักมากเพียงใดสุดท้ายก็ต้องยอมปล่อยไป',
      'ในความจริงที่แสนเงียบงันคืนนี้',
      'มีเพียงเงาตัวเองคอยนั่งปลอบใจ',
    ];
    preChorus = [
      'เพิ่งเข้าใจวันนี้ว่าความดีไม่พอ',
      'รอให้ตายเธอก็คงไม่หันกลับมอง',
    ];
    chorus = [
      'รักเท่าไรก็แพ้',
      'แม้ทุ่มเทให้เธอหมดใจ',
      'ยิ่งรั้งไว้ยิ่งเห็นเธอไป',
      'คนไม่รักทำดีแค่ไหนก็สูญเปล่า',
    ];
    bridge = [
      'เก็บเศษใจที่ร้าวเอาไว้เงียบๆ',
      'เปรียบเทียบตัวเองแล้วก็ยอมรับความจริง',
    ];
    rhymeNote = 'สไตล์ดี้ นิติพงษ์ / สีฟ้า: Bar 1 หมัดฮุคสั้นคมแทงใจ ส่งสัมผัสต่อทุกวรรค';
  } else if (
    writer === 'phaiboon-butkhan' ||
    writer === 'chali-intrawichit' ||
    genre === 'luk-krung'
  ) {
    verse = [
      `จันทร์แรมลอยเด่นกลางห้วงนภา${topicShort ? `ฝาก${topicShort}` : ''}`,
      'พาดวงฤทัยถวิลหาไม่คลาย',
      'สายลมอ่อนพัดผ่านทุ่งรวงทอง',
      'มองฟ้าไกลใจยังรอคนดี',
      'ราตรีนี้มืดมิดไร้แสงดารา',
      'น้ำตาพร่างพรมบนกลีบดอกไม้',
      'ในห้วงคำนึงยังตราตรึงมิเลือน',
      'เตือนใจให้มั่นรักตราบชั่วนิรันดร์',
    ];
    preChorus = [
      'ยามสายลมโชยพรมหัวใจหวั่นไหว',
      'ไกลเพียงใดไม่อาจพรากรักจากทรวง',
    ];
    chorus = [
      'ดุจหยาดเพชรพราวพร่างกลางนภา',
      'พาหัวใจละมุนอุ่นในไมตรี',
      'กี่ราตรีผันผ่านมิเคยเปลี่ยนผัน',
      'มั่นในคำสัญญาที่เคยเอื้อนเอ่ย',
    ];
    bridge = [
      'แม้นกาลเวลาจะพาล่วงเลยลับตา',
      'ฝากบทกวีนี้กล่อมนิทราให้ชื่นบาน',
    ];
    rhymeNote = 'สไตล์กวีลูกกรุง-ลูกทุ่งชั้นครู: สัมผัสต่อเนื่องและคำเป็นสระเสียงยาวเอื้อนละมุน';
  } else if (
    writer === 'sala-khunawut' ||
    writer === 'chonlathi-thanthong' ||
    writer === 'suraphon-sombatcharoen' ||
    genre === 'luk-thung' ||
    options.lyricDialect === 'isan'
  ) {
    const isIsan = options.lyricDialect === 'isan' || writer === 'sala-khunawut';
    verse = isIsan
      ? [
          `หอบความฝันจากบ้านนามาสู้เมืองไกล${topicShort ? `เพื่อ${topicShort}` : ''}`,
          'ใจคิดฮอดอีแม่ยามลมหนาวมา',
          'ท้อกี่ครายังกอดคำสอนไม่จาง',
          'ทางยังยาวบ่ยอมถอดใจคืนถิ่น',
          'ยินเสียงแคนแว่วมาพาใจสะท้อน',
          'นอนนับดาวริมห้องเช่าเหงาใจ',
          'ในกระเป๋าเหลือเพียงรูปถ่ายเก่าๆ',
          'เอาแรงใจจากบ้านเป็นไฟสู้ต่อ',
        ]
      : [
          `ลมหนาวพัดผ่านท้องนาพาใจคนึง${topicShort ? `ถึง${topicShort}` : ''}`,
          'คิดถึงคนดีที่เคยร่วมเรียงเคียงหมอน',
          'อ้อนวอนฟ้าช่วยส่งข่าวข้ามขอบฟ้า',
          'หากวันใดฝนซาจะรีบคืนบ้านนา',
          'มาเช็ดน้ำตาให้คนรออยู่ริมคันนา',
          'สัญญาใจที่ให้ไว้ไม่เคยเสื่อมคลาย',
          'สายลมหนาวพัดมาเตือนให้รีบกลับ',
          'รับขวัญเจ้าในวันที่ข้าวสุกเต็มทุ่ง',
        ];
    preChorus = isIsan
      ? ['เหนื่อยปานใดบ่เคยเอ่ยคำท้อถอย', 'คอยวันได้หวนคืนไปกอดคนรอ']
      : ['กี่คืนเหงาเฝ้ารอแสงเดือนส่องทาง', 'กลางทุ่งนากว้างยังคิดถึงคำสัญญา'];
    chorus = isIsan
      ? [
          'ฮักเจ้าหลายจนเบิดใจอ้ายบ่ลืม',
          'ปลื้มคำสัญญาที่เคยให้กันไว้',
          'ไกลบ้านนานับปีบ่เคยเปลี่ยนใจ',
          'ในมื้อหน้าสิคืนเมือซบอ้อมกอดเดิม',
        ]
      : [
          'ฝากเสียงแคนก้องทุ่งส่งถึงคนไกล',
          'ใจดวงนี้ยังคอยเจ้าคืนบ้านเรา',
          'เงาจันทร์นวลส่องทางให้หายเหน็บหนาว',
          'คราวใดท้อขอให้จำรักแท้บ้านนา',
        ];
    bridge = [
      'เก็บความหวังใส่เป้เดินสู้ต่อไป',
      'ใจยังมั่นสักวันคงได้สมหวัง',
    ];
    rhymeNote = isIsan
      ? 'สไตล์ลูกทุ่งอีสานสู้ชีวิต: คำเป็นสระเสียงยาวเอื้อนลูกคอ ผสมคำอีสานกินใจ'
      : 'สไตล์ลูกทุ่งไทยคำหวาน: ท้ายวรรคคำเป็นเปิดช่องเอื้อนลูกคอไพเราะ';
  } else if (
    writer === 'sek-loso' ||
    writer === 'suea-thanapol' ||
    genre === 'thai-rock' ||
    genre === 'phuea-chiwit'
  ) {
    verse = [
      `แบกความฝันเดินฝ่าลมฝนบนถนนยาว${topicShort ? `เพื่อ${topicShort}` : ''}`,
      'ก้าวผ่านคืนหนาวที่ไม่มีใครหันมอง',
      'สองมือเปล่าแต่หัวใจยังสู้ไม่ถอย',
      'คอยบอกตัวเองว่าสักวันต้องเป็นวันของเรา',
      'เงาแสงไฟข้างทางส่องให้เห็นรอยเท้า',
      'เก่าแค่ไหนเสื้อตัวนี้ยังมีศักดิ์ศรี',
      'กี่บาดแผลที่เจอไม่เคยทำให้กลัว',
      'ตัวคนเดียวก็พร้อมยืนหยัดต่อไป',
    ];
    preChorus = [
      'ล้มลงกี่ทีก็ลุกขึ้นยืนใหม่',
      'ไฟในอกดวงนี้ไม่เคยมอดดับ',
    ];
    chorus = [
      'ใจมันรักไปแล้วจะให้ทำยังไง',
      'เจ็บแค่ไหนก็ยังจะยอมเดินต่อ',
      'รอไม่ไหวถ้าเธอไม่เคยหันมอง',
      'ร้องตะโกนให้รู้ว่ารักเธอสุดใจ',
    ];
    bridge = [
      'ไม่มีอะไรจะเสียอีกแล้ววันนี้',
      'มีเพียงชีวิตนี้ที่ทุ่มให้เธอ',
    ];
    rhymeNote = 'สไตล์ร็อกสามัญชน / เพื่อชีวิต: คำหนักแน่นลงบีตคม ส่งสัมผัสต่อเนื่อง';
  } else if (
    moodLower.includes('sad') ||
    moodLower.includes('เศร้า') ||
    moodLower.includes('อกหัก') ||
    moodLower.includes('break') ||
    resolution === 'piercing-sting'
  ) {
    verse = [
      `แสงไฟข้างถนนจางลงในคืนฝนซา${topicShort ? `นึกถึง${topicShort}` : ''}`,
      'นาฬิกาบนผนังเดินช้ากว่าที่เคย',
      'เลยผ่านมุมเดิมที่เคยเดินจับมือกัน',
      'วันเวลาไม่ช่วยลบภาพจำในใจ',
      'ในห้องว่างเปล่ามีเพียงเสียงลมหายใจ',
      'ไกลเกินเอื้อมถึงแม้ยังรักหมดหัวใจ',
      'ไม่เหลือร่องรอยของคำสัญญาวันนั้น',
      'ฝันที่วาดไว้พังลงต่อหน้าต่อตา',
    ];
    preChorus = [
      'ยิ่งพยายามลืมกลับยิ่งจำฝังใจ',
      'ไม่เข้าใจทำไมยังรอคนที่ไม่กลับมา',
    ];
    chorus = [
      'เธอเดินจากไปโดยไม่หันมอง',
      'ปล่อยน้ำตานองบนทางเดิมลำพัง',
      'พังลงหมดแล้วความหวังที่เคยสร้าง',
      'ว่างเปล่าไปทั้งใจเมื่อไม่มีเธอ',
    ];
    bridge = [
      'ขอแค่ได้ร้องไห้ให้พอคืนนี้',
      'พรุ่งนี้ค่อยลืมว่าเคยรักเธอมากเพียงใด',
    ];
    rhymeNote = 'โหมดอารมณ์เศร้าบาดลึก: ส่งสัมผัสข้ามสระ (-า -> -ไอ -> -อง -> -าง) ไม่ซ้ำคำ';
  } else {
    // Thai Pop / Boy Kosiyabong / Stamp / Tan Lipta / Acoustic Indie
    verse = [
      `แสงแดดยามเย็นทอดเงาผ่านชานชาลา${topicShort ? `เรื่อง${topicShort}` : ''}`,
      'เวลาหมุนไปพาเรื่องราวของเราเดินต่อ',
      'รอข้อความสั้นๆ ที่เธอส่งมาทักทาย',
      'คลายความเหนื่อยล้าที่แบกไว้มาทั้งวัน',
      'ฉันแอบยิ้มทุกครั้งที่ได้ยินเสียงเธอ',
      'เจอเรื่องหนักแค่ไหนก็พร้อมจะผ่านไป',
      'ในโลกที่หมุนเร็วและวุ่นวายเหลือเกิน',
      'เดินเคียงข้างกันแบบนี้ก็อุ่นใจพอ',
    ];
    preChorus = [
      'แค่ได้สบตากันในวินาทีนี้',
      'ดีใจเหลือเกินที่ยังมีเธออยู่ข้างกาย',
    ];
    chorus = [
      'ต่อให้นาฬิกาทั้งโลกหยุดเดินพร้อมกัน',
      'ฉันก็ยังหาวิธีเดินไปรักเธออยู่ดี',
      'มีเหตุผลร้อยข้อที่ดูไม่เข้าที',
      'ที่ใจเลือกแล้วก็คือเธอคนนี้คนเดียว',
    ];
    bridge = [
      'ไม่ว่าจะเจอลมพายุพัดแรงแค่ไหน',
      'ในมือฉันยังจับมือเธอไว้ไม่ปล่อยเลย',
    ];
    rhymeNote = 'สไตล์ป๊อปร่วมสมัย: สัมผัสส่งท้ายวรรคเข้าต้นวรรคถัดไป และสลับสระ -า/-ไอ/-ัน/-ี ต่อเนื่อง';
  }

  // Apply emotionalResolution overrides for chorus when explicit mode is requested
  if (resolution === 'piercing-sting') {
    chorus = [
      'รักเท่าไรก็แพ้',
      'แม้ทุ่มเทให้เธอหมดใจ',
      'ยิ่งรั้งไว้ยิ่งเห็นเธอไป',
      'คนไม่รักทำดีแค่ไหนก็สูญเปล่า',
    ];
  } else if (resolution === 'fulfilling-warm') {
    chorus = [
      'แค่มีเธออยู่ตรงนี้ข้างกัน',
      'วันธรรมดาก็กลายเป็นวันแสนดี',
      'กี่พายุที่พัดผ่านในชีวิตนี้',
      'ที่ใจต้องการก็มีแค่เธอคนเดียว',
    ];
  } else if (resolution === 'empowering-anthem') {
    chorus = [
      'ลุกขึ้นยืนอีกครั้งแม้ล้มลง',
      'ส่งเสียงหัวใจให้ก้องฟ้าไกล',
      'ไม่มีกำแพงไหนขวางทางฝันได้',
      'ในวันที่ใจยังสู้ไม่ยอมแพ้ใคร',
    ];
  } else if (resolution === 'catchy-earworm') {
    chorus = [
      'บอกรักกันเลยได้ไหมตอนนี้',
      'มีใจให้กันอย่ามัวรอรีบพูดมา',
      'สายตาคู่นี้มันฟ้องอยู่ตลอดเวลา',
      'ท้าให้ลองเปิดใจรักกันสักที',
    ];
  } else if (resolution === 'nostalgic-fade') {
    chorus = [
      'ยังคิดถึงเธอเสมอเมื่อฝนโปรย',
      'โรยราไปตามกาลเวลาที่ผ่านพ้น',
      'บนทางเดินเดิมที่เคยมีสองคน',
      'ฝนซาฟ้าสางใจยังค้างเพียงเงาเธอ',
    ];
  }

  const outro = resolveSimulatedOutroLines(resolution, genre, writer, false);

  return {
    verse,
    'pre-chorus': preChorus,
    chorus,
    bridge,
    outro,
    rhymeNote,
  };
}

/**
 * สร้าง SongProject ทั้งเพลงแบบ Simulation Mode (เมื่อไม่มี API Key หรือ Offline)
 * โดยคุมสัมผัสภาษาไทยให้คล้องจอง เปลี่ยนตามสไตล์ที่เลือก และมีเนื้อท่อน Outro พร้อมโน้ตไกด์ที่ตรงคอร์ด
 */
export function buildSimulatedArchitectSong(input: EasyArchitectInput): SongProject {
  const preset = getPresetConfig(input.stylePreset);
  const topicText = input.topic.trim() || (input.language === 'th' ? 'เรื่องราวของเรา' : 'Morning light');
  const bpm = preset.bpmByTempo[input.tempoFeel];
  const baseKey = input.vocalProfile === 'female' ? 'G' : 'C';
  const capoFret = input.vocalProfile === 'female' ? 2 : input.vocalProfile === 'neutral' ? 1 : 0;
  const chords = preset.defaultChords;
  const effectiveGenre: ThaiSongGenre = input.thaiGenre ?? preset.thaiGenre ?? 'thai-pop';

  const isEn = input.language === 'en';
  const bundle = buildStyledSimulatedSongLyrics({
    topic: topicText,
    language: input.language,
    thaiGenre: effectiveGenre,
    lyricDialect: input.lyricDialect,
    songwriterStyle: input.songwriterStyle,
    emotionalResolution: input.emotionalResolution,
  });

  const verseLyrics = bundle.verse.slice(0, 4);
  const preChorusLyrics = bundle['pre-chorus'].slice(0, 2);
  const chorusLyrics = bundle.chorus.slice(0, 4);
  const outroLyrics = bundle.outro.slice(0, 2);

  const mkBars = (
    lines: string[],
    sectionChords: string[],
    sectionType: SectionType,
    ringEnd = false
  ): SongBar[] =>
    lines.map((lyrics, idx) => {
      const chord = sectionChords[idx % sectionChords.length];
      return {
        id: generateUniqueId('bar'),
        chordsPerBar: 1,
        chords: [chord],
        playStyle: ringEnd && idx === lines.length - 1 ? 'let-ring' : 'normal',
        lyrics,
        melodyNotes: lyrics
          ? buildDiatonicGuideNotesForChord(chord, idx, lyrics, undefined, sectionType)
          : [],
      };
    });

  const rawSimulated = {
    title: isEn
      ? `Easy Demo: ${topicText.slice(0, 32)}`
      : `เดโม: ${topicText.slice(0, 32)}`,
    bpm,
    baseKey,
    capoFret,
    timeSignature: '4/4',
    guitarModel: preset.guitarModel,
    stringGauge: preset.stringGauge,
    ambience3D: preset.ambience3D,
    sections: [
      {
        name: defaultSectionTitle('intro', input.language),
        type: 'intro',
        intensity: 'low',
        instruments: {
          guitarRhythm: true,
          guitarLead: false,
          bass: false,
          piano: false,
          drums: false,
          guitarRhythmStyle: preset.verseRhythmStyle,
          drumsStyle: 'off',
        },
        bars: mkBars(['', ''], chords.slice(0, 2), 'intro', true),
      },
      {
        name: defaultSectionTitle('verse', input.language),
        type: 'verse',
        intensity: 'low',
        instruments: {
          guitarRhythm: true,
          guitarLead: false,
          bass: true,
          piano: false,
          drums: false,
          guitarRhythmStyle: preset.verseRhythmStyle,
          bassStyle: 'warm-sustain',
          drumsStyle: 'off',
        },
        bars: mkBars(verseLyrics, chords, 'verse'),
      },
      {
        name: defaultSectionTitle('pre-chorus', input.language),
        type: 'pre-chorus',
        intensity: 'medium',
        instruments: {
          guitarRhythm: true,
          guitarLead: false,
          bass: true,
          piano: true,
          drums: true,
          guitarRhythmStyle: 'soft-strum',
          pianoStyle: 'warm-pad',
          drumsStyle: 'shaker-cajon',
        },
        bars: mkBars(preChorusLyrics, [chords[3] ?? 'F', chords[1] ?? 'G'], 'pre-chorus'),
      },
      {
        name: defaultSectionTitle('chorus', input.language),
        type: 'chorus',
        intensity: 'high',
        instruments: {
          guitarRhythm: true,
          guitarLead: preset.id === 'soft-rock',
          bass: true,
          piano: true,
          drums: true,
          guitarRhythmStyle: preset.chorusRhythmStyle,
          guitarLeadStyle: 'riff-fills',
          guitarLeadDrive: preset.id === 'soft-rock' ? 'overdrive' : 'clean',
          bassStyle: 'root-fifth',
          pianoStyle: 'warm-pad',
          drumsStyle: preset.chorusDrumsStyle,
        },
        bars: mkBars(chorusLyrics, chords, 'chorus', true),
      },
      {
        name: defaultSectionTitle('outro', input.language),
        type: 'outro',
        intensity: 'low',
        instruments: {
          guitarRhythm: true,
          guitarLead: false,
          bass: true,
          piano: true,
          drums: false,
          guitarRhythmStyle: 'fingerpicking',
          drumsStyle: 'off',
        },
        bars: mkBars(outroLyrics, [chords[2] ?? 'Am', chords[0] ?? 'C'], 'outro', true),
      },
    ],
  };

  return sanitizeArchitectSongProject(rawSimulated, input);
}

/**
 * ปรับความแน่นของวงดนตรี (Band Density 3 ระดับ) แบบ Real-Time 0 เหรียญในการ์ด Easy Preview
 */
export function applyBandDensityToSong(
  song: SongProject,
  density: BandDensityLevel
): SongProject {
  const nextSections = song.sections.map((sec) => {
    const isBigSection = sec.type === 'chorus' || sec.type === 'solo';
    if (density === 'unplugged') {
      return {
        ...sec,
        intensity: isBigSection ? ('medium' as const) : ('low' as const),
        instruments: {
          ...sec.instruments,
          guitarRhythm: true,
          guitarLead: false,
          bass: false,
          piano: false,
          drums: false,
          drumsStyle: 'off' as const,
        },
      };
    }

    if (density === 'balanced') {
      return {
        ...sec,
        intensity: sec.type === 'chorus' ? ('high' as const) : sec.type === 'intro' ? ('low' as const) : ('medium' as const),
        instruments: {
          ...sec.instruments,
          guitarRhythm: true,
          guitarLead: sec.type === 'solo',
          bass: sec.type !== 'intro',
          piano: sec.type === 'chorus' || sec.type === 'pre-chorus' || sec.type === 'bridge',
          drums: sec.type === 'chorus' || sec.type === 'solo',
          drumsStyle: sec.type === 'chorus' ? ('shaker-cajon' as const) : ('off' as const),
        },
      };
    }

    // Full band arrangement
    return {
      ...sec,
      intensity: isBigSection ? ('high' as const) : sec.type === 'intro' || sec.type === 'outro' ? ('low' as const) : ('medium' as const),
      instruments: {
        ...sec.instruments,
        guitarRhythm: true,
        guitarLead: isBigSection || sec.type === 'bridge',
        bass: sec.type !== 'intro',
        piano: sec.type !== 'intro',
        drums: sec.type !== 'intro' && sec.type !== 'outro',
        drumsStyle: isBigSection ? ('simple-kit' as const) : ('shaker-cajon' as const),
      },
    };
  });

  return {
    ...song,
    mixer: {
      ...song.mixer,
      guitarRhythm: { ...song.mixer.guitarRhythm, enabled: true },
      bass: { ...song.mixer.bass, enabled: density !== 'unplugged' },
      piano: { ...song.mixer.piano, enabled: density !== 'unplugged' },
      drums: {
        ...song.mixer.drums,
        enabled: density !== 'unplugged',
        style: density === 'full' ? 'simple-kit' : density === 'balanced' ? 'shaker-cajon' : 'off',
      },
      guitarLead: { ...song.mixer.guitarLead, enabled: density === 'full' },
    },
    sections: nextSections,
  };
}

/**
 * จัดวง Backing Band อัตโนมัติตามแนวเพลงและบุคลิกศิลปิน (0 เครดิต, Pure & Deterministic)
 * ใช้ข้อมูล thaiGenre, songwriterStyle, lyricDialect และ easyConfig.stylePreset เพื่อจับคู่
 * สไตล์เครื่องดนตรีทั้ง 5 ชิ้น ไดนามิกลีด Drive และ Balance Volume ในแต่ละท่อน
 */
export function applyGenreBandArrangement(song: SongProject): SongProject {
  const genre = song.thaiGenre ?? 'thai-pop';
  const writer = song.songwriterStyle;
  const preset = song.easyConfig?.stylePreset?.toLowerCase() ?? '';
  const dialect = song.lyricDialect;

  const isLukThung =
    genre === 'luk-thung' ||
    genre === 'phuea-chiwit' ||
    writer === 'aed-carabao' ||
    writer === 'phaiboon-butkhan' ||
    writer === 'suraphon-sombatcharoen' ||
    writer === 'sala-khunawut' ||
    dialect === 'isan' ||
    dialect === 'suphan-central' ||
    preset.includes('luk-thung') ||
    preset.includes('phuea-chiwit');

  const isRnB =
    !isLukThung &&
    (genre === 'thai-rnb' ||
      writer === 'the-toys' ||
      writer === 'tan-lipta' ||
      writer === 'joey-boy' ||
      preset.includes('rnb'));

  const isRock =
    !isLukThung &&
    !isRnB &&
    (genre === 'thai-rock' ||
      writer === 'sek-loso' ||
      writer === 'asanee-chotikul' ||
      writer === 'suea-thanapol' ||
      preset.includes('rock'));

  if (isLukThung) {
    const isSlowLukThung =
      song.bpm <= 72 || (song.bpm < 90 && song.easyConfig?.tempoFeel === 'slow');
    const nextSections = song.sections.map((sec) => {
      const isPeak = sec.type === 'chorus' || sec.type === 'solo';
      const isBridgeOrPre = sec.type === 'pre-chorus' || sec.type === 'bridge';
      const isIntro = sec.type === 'intro';
      const rhythmStyle: GuitarStyle = isSlowLukThung
        ? isIntro || isPeak || isBridgeOrPre
          ? 'soft-strum'
          : 'fingerpicking'
        : isIntro
          ? 'soft-strum'
          : 'lukthung-bounce';
      const drumStyle: DrumStyle = isSlowLukThung
        ? sec.type === 'outro' || (!isPeak && sec.type !== 'pre-chorus')
          ? 'shaker-cajon'
          : 'simple-kit'
        : sec.type === 'outro'
          ? 'shaker-cajon'
          : 'lukthung-3cha';
      const bassStyle: BassStyle = isSlowLukThung ? 'warm-sustain' : 'lukthung-groove';

      return {
        ...sec,
        intensity: isPeak ? ('high' as const) : isIntro || sec.type === 'outro' ? ('low' as const) : ('medium' as const),
        instruments: {
          ...sec.instruments,
          guitarRhythm: true,
          guitarRhythmStyle: rhythmStyle,
          guitarRhythmVolume: isPeak ? 90 : 84,
          bass: !isIntro,
          bassStyle,
          bassVolume: isPeak ? 94 : 86,
          piano: isBridgeOrPre || sec.type === 'outro' || isSlowLukThung,
          pianoStyle: 'warm-pad' as PianoStyle,
          pianoVolume: 68,
          drums: !isIntro,
          drumsStyle: drumStyle,
          drumsVolume: isSlowLukThung
            ? isPeak
              ? 84
              : 72
            : isPeak
              ? 96
              : isIntro
                ? 65
                : 86,
          guitarLead: isIntro || isPeak || sec.type === 'pre-chorus',
          guitarLeadStyle: (isIntro || sec.type === 'solo' ? 'melodic-solo' : 'riff-fills') as LeadGuitarStyle,
          guitarLeadDrive: 'clean' as LeadGuitarDrive,
          guitarLeadVolume: sec.type === 'solo' ? 100 : isIntro ? 86 : 82,
        },
      };
    });
    return {
      ...song,
      mixer: {
        ...song.mixer,
        guitarRhythm: {
          ...song.mixer.guitarRhythm,
          enabled: true,
          style: isSlowLukThung ? 'soft-strum' : 'lukthung-bounce',
        },
        bass: {
          ...song.mixer.bass,
          enabled: true,
          style: isSlowLukThung ? 'warm-sustain' : 'lukthung-groove',
        },
        piano: { ...song.mixer.piano, enabled: true, style: 'warm-pad' },
        drums: {
          ...song.mixer.drums,
          enabled: true,
          style: isSlowLukThung ? 'simple-kit' : 'lukthung-3cha',
        },
        guitarLead: { ...song.mixer.guitarLead, enabled: true, style: 'riff-fills', drive: 'clean' },
      },
      sections: nextSections,
    };
  }

  if (isRnB) {
    const nextSections = song.sections.map((sec) => {
      const isPeak = sec.type === 'chorus' || sec.type === 'solo';
      const isVerse = sec.type === 'verse';
      const isIntro = sec.type === 'intro';
      return {
        ...sec,
        intensity: isPeak ? ('high' as const) : isIntro || sec.type === 'outro' ? ('low' as const) : ('medium' as const),
        instruments: {
          ...sec.instruments,
          guitarRhythm: !isVerse,
          guitarRhythmStyle: 'fingerpicking' as GuitarStyle,
          guitarRhythmVolume: 76,
          bass: !isIntro,
          bassStyle: 'rnb-syncopated' as BassStyle,
          bassVolume: isPeak ? 95 : 88,
          piano: true,
          pianoStyle: 'rnb-neo-chord' as PianoStyle,
          pianoVolume: isPeak ? 94 : 88,
          drums: !isIntro && sec.type !== 'outro',
          drumsStyle: 'rnb-pocket' as DrumStyle,
          drumsVolume: isPeak ? 92 : 82,
          guitarLead: isPeak || sec.type === 'pre-chorus',
          guitarLeadStyle: (sec.type === 'solo' ? 'melodic-solo' : 'riff-fills') as LeadGuitarStyle,
          guitarLeadDrive: 'clean' as LeadGuitarDrive,
          guitarLeadVolume: sec.type === 'solo' ? 96 : 80,
        },
      };
    });
    return {
      ...song,
      mixer: {
        ...song.mixer,
        guitarRhythm: { ...song.mixer.guitarRhythm, enabled: true, style: 'fingerpicking' },
        bass: { ...song.mixer.bass, enabled: true, style: 'rnb-syncopated' },
        piano: { ...song.mixer.piano, enabled: true, style: 'rnb-neo-chord' },
        drums: { ...song.mixer.drums, enabled: true, style: 'rnb-pocket' },
        guitarLead: { ...song.mixer.guitarLead, enabled: true, style: 'riff-fills', drive: 'clean' },
      },
      sections: nextSections,
    };
  }

  if (isRock) {
    const isSlowRockBallad =
      song.bpm <= 72 || (song.bpm < 80 && song.easyConfig?.tempoFeel === 'slow');
    const nextSections = song.sections.map((sec) => {
      const isPeak = sec.type === 'chorus' || sec.type === 'solo' || sec.type === 'bridge';
      const isVerse = sec.type === 'verse';
      const isIntro = sec.type === 'intro';
      return {
        ...sec,
        intensity: isPeak ? ('high' as const) : sec.type === 'outro' ? ('low' as const) : ('medium' as const),
        instruments: {
          ...sec.instruments,
          guitarRhythm: true,
          guitarRhythmStyle: (isSlowRockBallad && !isPeak ? 'soft-strum' : 'rock-power') as GuitarStyle,
          guitarRhythmVolume: isPeak ? 94 : isVerse ? 82 : 88,
          bass: true,
          bassStyle: (isSlowRockBallad && !isPeak ? 'warm-sustain' : 'root-fifth') as BassStyle,
          bassVolume: isPeak ? 92 : 84,
          piano: !isIntro,
          pianoStyle: 'rock-organ-pad' as PianoStyle,
          pianoVolume: isPeak ? 78 : 68,
          drums: sec.type !== 'outro',
          drumsStyle: (isSlowRockBallad ? (isPeak ? 'simple-kit' : 'shaker-cajon') : 'rock-drive') as DrumStyle,
          drumsVolume: isPeak ? (isSlowRockBallad ? 88 : 100) : isIntro ? 74 : 84,
          guitarLead: isPeak || isIntro || sec.type === 'pre-chorus',
          guitarLeadStyle: (sec.type === 'solo' || isIntro ? 'melodic-solo' : 'riff-fills') as LeadGuitarStyle,
          guitarLeadDrive: (isSlowRockBallad
            ? isPeak
              ? 'overdrive'
              : 'clean'
            : isPeak
              ? 'distortion'
              : 'overdrive') as LeadGuitarDrive,
          guitarLeadVolume: sec.type === 'solo' ? 100 : isPeak ? 95 : 84,
        },
      };
    });
    return {
      ...song,
      mixer: {
        ...song.mixer,
        guitarRhythm: { ...song.mixer.guitarRhythm, enabled: true, style: 'rock-power' },
        bass: { ...song.mixer.bass, enabled: true, style: 'root-fifth' },
        piano: { ...song.mixer.piano, enabled: true, style: 'rock-organ-pad' },
        drums: {
          ...song.mixer.drums,
          enabled: true,
          style: isSlowRockBallad ? 'simple-kit' : 'rock-drive',
        },
        guitarLead: {
          ...song.mixer.guitarLead,
          enabled: true,
          style: 'melodic-solo',
          drive: isSlowRockBallad ? 'clean' : 'overdrive',
        },
      },
      sections: nextSections,
    };
  }

  // Default: Thai Pop / Luk Krung / Acoustic Indie
  const isSlowPopBallad =
    song.bpm <= 72 || (song.bpm < 82 && song.easyConfig?.tempoFeel === 'slow');
  const isAcoustic = genre === 'acoustic-indie' || genre === 'luk-krung';
  const defaultRhythm: GuitarStyle =
    genre === 'acoustic-indie' || (isSlowPopBallad && song.bpm <= 72)
      ? 'fingerpicking'
      : isSlowPopBallad
        ? 'soft-strum'
        : 'campfire-strum';
  const defaultBass: BassStyle =
    genre === 'luk-krung' || isSlowPopBallad ? 'warm-sustain' : 'root-fifth';
  const defaultPiano: PianoStyle =
    genre === 'luk-krung' || isSlowPopBallad ? 'gentle-arpeggio' : 'warm-pad';
  const defaultDrums: DrumStyle =
    isAcoustic || (isSlowPopBallad && song.bpm <= 70) ? 'shaker-cajon' : 'simple-kit';

  const nextSections = song.sections.map((sec) => {
    const isPeak = sec.type === 'chorus' || sec.type === 'solo';
    const isIntro = sec.type === 'intro';
    return {
      ...sec,
      intensity: isPeak ? ('high' as const) : isIntro || sec.type === 'outro' ? ('low' as const) : ('medium' as const),
      instruments: {
        ...sec.instruments,
        guitarRhythm: true,
        guitarRhythmStyle: (isIntro ? 'soft-strum' : defaultRhythm) as GuitarStyle,
        guitarRhythmVolume: isPeak ? 90 : 84,
        bass: !isIntro,
        bassStyle: defaultBass,
        bassVolume: isPeak ? 88 : 80,
        piano: true,
        pianoStyle: defaultPiano,
        pianoVolume: isPeak ? 82 : 76,
        drums: !isIntro && sec.type !== 'outro',
        drumsStyle: (isPeak ? defaultDrums : 'shaker-cajon') as DrumStyle,
        drumsVolume: isSlowPopBallad ? (isPeak ? 82 : 70) : isPeak ? 90 : 78,
        guitarLead: isPeak || sec.type === 'bridge',
        guitarLeadStyle: (sec.type === 'solo' ? 'melodic-solo' : 'riff-fills') as LeadGuitarStyle,
        guitarLeadDrive: (isPeak && !isAcoustic && !isSlowPopBallad ? 'overdrive' : 'clean') as LeadGuitarDrive,
        guitarLeadVolume: sec.type === 'solo' ? 96 : 82,
      },
    };
  });

  return {
    ...song,
    mixer: {
      ...song.mixer,
      guitarRhythm: { ...song.mixer.guitarRhythm, enabled: true, style: defaultRhythm },
      bass: { ...song.mixer.bass, enabled: true, style: defaultBass },
      piano: { ...song.mixer.piano, enabled: true, style: defaultPiano },
      drums: { ...song.mixer.drums, enabled: true, style: defaultDrums },
      guitarLead: { ...song.mixer.guitarLead, enabled: true, style: 'riff-fills', drive: 'clean' },
    },
    sections: nextSections,
  };
}

export interface SimulatedSingleBarInput {
  mood: string;
  topic: string;
  chord: string;
  sectionType: SectionType;
  singleBarIndex: number;
  prevLine?: string;
  nextLine?: string;
  existingBarText?: string;
  thaiGenre?: ThaiSongGenre;
  lyricDialect?: ThaiLyricDialect;
  songwriterStyle?: ThaiSongwriterStyle;
  emotionalResolution?: ThaiEmotionalResolution;
}

export interface SimulatedSingleBarResult {
  variations: [string, string, string];
  rhymeNotes: string[];
  tip: string;
}

/**
 * สร้าง 3 ตัวเลือกเนื้อร้องจำลองสำหรับห้องเดียว (Phase 7D Simulated Fallback)
 * คัดวลีตรงสไตล์ + อารมณ์คอร์ด + เชื่อมสัมผัสจากวรรคก่อนโดยไม่ซ้ำกัน
 */
export function buildSimulatedSingleBarVariations(
  input: SimulatedSingleBarInput
): SimulatedSingleBarResult {
  const bundle = buildStyledSimulatedSongLyrics({
    topic: input.topic,
    mood: input.mood,
    thaiGenre: input.thaiGenre,
    lyricDialect: input.lyricDialect,
    songwriterStyle: input.songwriterStyle,
    emotionalResolution: input.emotionalResolution,
  });

  const sec = input.sectionType;
  const primaryPool =
    sec === 'outro'
      ? bundle.outro
      : sec === 'pre-chorus'
        ? bundle['pre-chorus']
        : sec === 'bridge'
          ? bundle.bridge
          : sec === 'chorus'
            ? bundle.chorus
            : bundle.verse;

  const combinedPool = [
    ...primaryPool,
    ...bundle.verse,
    ...bundle.chorus,
    ...bundle['pre-chorus'],
    ...bundle.bridge,
    ...bundle.outro,
  ]
    .map((line) => line.trim())
    .filter(Boolean);

  const prevTrimmed = input.prevLine?.trim() || '';
  const prevRhymeWord = prevTrimmed ? findThaiRhymes(prevTrimmed).suggestions[0] : undefined;
  const topicShort = input.topic.trim().slice(0, 28) || 'ความทรงจำ';
  const chordMood = getChordEmotionalHint(input.chord, 'th');
  const existingTrimmed = input.existingBarText?.trim() || '';

  const candidates: string[] = [];
  const startIdx = Math.max(0, input.singleBarIndex);
  for (let offset = 0; offset < combinedPool.length; offset++) {
    const line = combinedPool[(startIdx + offset) % combinedPool.length];
    if (line && line !== existingTrimmed && !candidates.includes(line)) {
      candidates.push(line);
    }
    if (candidates.length >= 2) break;
  }

  const thirdCandidate = prevRhymeWord
    ? `${prevRhymeWord}ในใจยังจำไม่จาง (${topicShort})`
    : `เก็บเรื่อง${topicShort}ไว้ในใจไม่เลือนหาย`;

  if (!candidates.includes(thirdCandidate) && thirdCandidate !== existingTrimmed) {
    candidates.push(thirdCandidate);
  }

  for (const fallbackLine of combinedPool) {
    if (candidates.length >= 3) break;
    if (!candidates.includes(fallbackLine)) {
      candidates.push(fallbackLine);
    }
  }

  const v1 = candidates[0] || `ยังคงเก็บภาพ${topicShort}เอาไว้ในใจ`;
  const v2 = candidates[1] || `ปล่อยให้เวลาพาใจก้าวผ่านคืนเหงา`;
  const v3 = candidates[2] || `แสงเดิมยังคอยปลอบใจในวันอ่อนล้า`;

  const rhymeNotes = [
    bundle.rhymeNote,
    ...(prevTrimmed && prevRhymeWord
      ? [`ลองเชื่อมสัมผัสจากท้ายวรรคก่อนด้วยคำกลุ่ม "${prevRhymeWord}"`]
      : []),
    ...(chordMood ? [`คอร์ด ${input.chord || 'C'} ให้ฟีล: ${chordMood}`] : []),
  ];

  return {
    variations: [v1, v2, v3],
    rhymeNotes: rhymeNotes.slice(0, 3),
    tip: `โหมดจำลอง (0 เครดิต): คัด 3 ตัวเลือกเฉพาะห้อง ${input.singleBarIndex + 1} ตามคอร์ด ${input.chord || 'C'}`,
  };
}
