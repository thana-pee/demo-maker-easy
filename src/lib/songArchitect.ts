import { generateUniqueId } from './sectionUtils';
import { generateLyricAlignedGuideMelody } from './melodyUtils';
import { getChordEmotionalHint, resolveChordProgressionFormula } from './chordUtils';
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
  LyricDensityMode,
  MelodyNote,
  MelodySound,
  PianoStyle,
  SectionIntensity,
  SectionType,
  SongBar,
  SongProject,
  SongSection,
  StoryBlueprintInput,
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
  lyricDensity?: LyricDensityMode;
  storyBlueprint?: StoryBlueprintInput;
  customStructure?: Array<{ type: SectionType; bars: number; name?: string }>;
  chordProgressionPreset?: string;
  customChords?: string[];
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
  'nga-caravan',
  'kob-bigass',
  'fongbeer-rock',
  'fongbeer-pop',
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

export interface GuideMelodyContext {
  baseKey?: string;
  timeSignature?: TimeSignature;
  bpm?: number;
  vocalProfile?: VocalProfile;
  thaiGenre?: ThaiSongGenre;
  songwriterStyle?: ThaiSongwriterStyle;
  lyricDensity?: LyricDensityMode;
}

export function getVocalRegisterShift(vocalProfile?: VocalProfile): number {
  if (vocalProfile === 'female') return 3;
  if (vocalProfile === 'male') return -4;
  return 0;
}

export function getStepsGridForTimeSignature(timeSignature?: TimeSignature): {
  totalSteps: number;
  stepsPerBeat: number;
} {
  if (timeSignature === '6/8') return { totalSteps: 12, stepsPerBeat: 2 };
  if (timeSignature === '3/4') return { totalSteps: 12, stepsPerBeat: 4 };
  return { totalSteps: 16, stepsPerBeat: 4 };
}

export function buildDiatonicGuideNotesForChord(
  chord: string,
  offsetIdx: number,
  lyrics?: string,
  chord2?: string,
  sectionType?: SectionType,
  ctx?: GuideMelodyContext
): MelodyNote[] {
  const { totalSteps, stepsPerBeat } = getStepsGridForTimeSignature(ctx?.timeSignature);
  const vocalRegisterShift = getVocalRegisterShift(ctx?.vocalProfile);

  if (lyrics && lyrics.trim().length > 0) {
    return generateLyricAlignedGuideMelody({
      lyrics,
      chord1: chord,
      chord2,
      baseKey: ctx?.baseKey || 'C',
      totalSteps,
      stepsPerBeat,
      vocalRegisterShift,
      barIndex: offsetIdx,
      sectionType,
      bpm: ctx?.bpm,
      timeSignature: ctx?.timeSignature,
      thaiGenre: ctx?.thaiGenre,
      songwriterStyle: ctx?.songwriterStyle,
      lyricDensity: ctx?.lyricDensity,
    });
  }

  const rootMatch = chord.match(/^([A-G][#b]?)/);
  const rootName = rootMatch ? rootMatch[1] : 'C';
  const rootMap: Record<string, number> = {
    C: 60, 'C#': 61, Db: 61, D: 62, 'D#': 63, Eb: 63,
    E: 64, F: 65, 'F#': 66, Gb: 66, G: 67, 'G#': 68, Ab: 68,
    A: 69, 'A#': 70, Bb: 70, B: 71,
  };
  const rootMidi = Math.max(48, Math.min(84, (rootMap[rootName] ?? 60) + vocalRegisterShift));
  const isMinor = /^[A-G][#b]?m(?!aj)/.test(chord);
  const thirdMidi = rootMidi + (isMinor ? 3 : 4);
  const fifthMidi = rootMidi + 7;

  if (totalSteps === 12) {
    return offsetIdx % 2 === 0
      ? [
          { step: 0, midiPitch: rootMidi, durationSteps: 4 },
          { step: 4, midiPitch: thirdMidi, durationSteps: 4 },
          { step: 8, midiPitch: fifthMidi, durationSteps: 4 },
        ]
      : [
          { step: 0, midiPitch: fifthMidi, durationSteps: 4 },
          { step: 4, midiPitch: thirdMidi, durationSteps: 4 },
          { step: 8, midiPitch: rootMidi, durationSteps: 4 },
        ];
  }

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
  sectionType?: SectionType,
  ctx?: GuideMelodyContext
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
  const { totalSteps } = getStepsGridForTimeSignature(ctx?.timeSignature);
  const isOddMeter = ctx?.timeSignature === '3/4' || ctx?.timeSignature === '6/8';
  const notesExceedMeter =
    isOddMeter &&
    clampedNotes.some(
      (n) => n.step >= totalSteps || n.step + n.durationSteps > totalSteps
    );

  // ล้าง melodyNotes บนท่อน intro เสมอ เพื่อกันเสียงขลุ่ย/เมโลดี้ไกด์ร้องนำโผล่ในอินโทร
  // และหากเป็น 3/4 หรือ 6/8 แล้วโน้ตเกิน 12 steps ให้สังเคราะห์ใหม่ทั้งหมดแทนการ clamp ไปกองที่ step 11
  const resolvedMelodyNotes =
    sectionType === 'intro'
      ? []
      : clampedNotes.length > 0 && !notesExceedMeter
        ? clampedNotes
        : lyrics
          ? buildDiatonicGuideNotesForChord(chords[0], barIdx, lyrics, chords[1], sectionType, ctx)
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
  secIdx: number,
  ctx?: GuideMelodyContext
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
      sanitizeBar(rawBars[i], preset.defaultChords[i % preset.defaultChords.length], i, type, ctx)
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
  const resolvedGenre: ThaiSongGenre = input.thaiGenre ?? preset.thaiGenre ?? 'thai-pop';
  const resolvedWriter = pickEnum(
    obj.songwriterStyle,
    VALID_SONGWRITER_STYLES,
    pickEnum(input.songwriterStyle, VALID_SONGWRITER_STYLES, 'none')
  );
  const melodyCtx: GuideMelodyContext = {
    baseKey,
    timeSignature,
    bpm,
    vocalProfile: input.vocalProfile,
    thaiGenre: resolvedGenre,
    songwriterStyle: resolvedWriter,
    lyricDensity: input.lyricDensity,
  };

  const rawSections = Array.isArray(obj.sections) ? obj.sections.slice(0, 9) : [];
  const baseSections =
    rawSections.length >= 2
      ? rawSections.map((sec, idx) => sanitizeSection(sec, preset, input.language, idx, melodyCtx))
      : buildSimulatedArchitectSong(input).sections;

  const totalBarSteps = timeSignature === '3/4' || timeSignature === '6/8' ? 12 : 16;
  const maxBarStep = totalBarSteps - 1;

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

      const nextMelodyNotes =
        sec.type === 'intro'
          ? []
          : bar.melodyNotes.map((note) => {
              const safeStep = Math.max(0, Math.min(maxBarStep, Math.round(note.step)));
              const maxDur = Math.max(1, totalBarSteps - safeStep);
              const safeDuration = Math.max(1, Math.min(maxDur, Math.round(note.durationSteps)));
              return {
                ...note,
                step: safeStep,
                durationSteps: safeDuration,
              };
            });

      return {
        ...bar,
        playStyle: nextPlayStyle,
        melodyNotes: nextMelodyNotes,
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
    ...(input.lyricDensity ? { lyricDensity: input.lyricDensity } : {}),
    easyConfig: {
      stylePreset: preset.id,
      vocalProfile: input.vocalProfile,
      tempoFeel: input.tempoFeel,
      ...(input.lyricDensity ? { lyricDensity: input.lyricDensity } : {}),
      ...(input.storyBlueprint ? { storyBlueprint: input.storyBlueprint } : {}),
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
  lyricDensity?: LyricDensityMode;
}

function resolveSimulatedOutroLines(
  resolution: ThaiEmotionalResolution | undefined,
  genre: ThaiSongGenre,
  writer: ThaiSongwriterStyle | undefined,
  isEn: boolean
): string[] {
  if (isEn) {
    if (resolution === 'piercing-sting') {
      return ['Alone in this night', 'Let go of the light'];
    }
    if (resolution === 'empowering-anthem') {
      return ['Rising through the sky', 'Watch our fire fly'];
    }
    if (resolution === 'fulfilling-warm') {
      return ['Warm inside your stay', 'Light along the way'];
    }
    if (resolution === 'catchy-earworm') {
      return ['Keep this line inside', 'Love will be our guide'];
    }
    if (resolution === 'nostalgic-fade') {
      return ['Softly fades the rain', 'Echoes still remain'];
    }
    return ['Soft the chord will stay', 'Till the break of day'];
  }

  if (resolution === 'piercing-sting') {
    return [
      'เหลือเพียงฉัน  ลำพัง',
      'ยังยอมถอย  เงียบงัน',
    ];
  }
  if (resolution === 'fulfilling-warm') {
    return [
      'ไม่ขอใด  จากฟ้า',
      'แค่เธอมา  ก็พอ',
    ];
  }
  if (resolution === 'empowering-anthem') {
    return [
      'ก้าวข้ามกลัว  วันวาน',
      'ผ่านพ้นทุก  เส้นทาง',
    ];
  }
  if (resolution === 'catchy-earworm') {
    return [
      'จำคำนี้  ในใจ',
      'ไม่ลืมรัก  วันนี้',
    ];
  }
  if (resolution === 'nostalgic-fade') {
    return [
      'ลมพัดกลิ่น  วันวาน',
      'ภาพยังหวาน  ในใจ',
    ];
  }

  if (writer === 'dee-nitipong' || writer === 'seefa') {
    return [
      'จบตรงนี้  เข้าใจ',
      'เดินต่อไป  คนเดียว',
    ];
  }
  if (genre === 'luk-thung' || writer === 'phaiboon-butkhan' || writer === 'sala-khunawut') {
    return [
      'ฝากลมอ้อน  ฟ้าไกล',
      'ใจยังรอ  บ้านนา',
    ];
  }
  if (genre === 'luk-krung' || writer === 'chali-intrawichit') {
    return [
      'จันทร์ผ่อง  ไม่จาง',
      'เคียงข้าง  ฤทัย',
    ];
  }
  if (writer === 'aed-carabao') {
    return [
      'เก็บศรัทธา  แผ่นดิน',
      'พิณปลอบใจ  ก้าวต่อ',
    ];
  }
  if (writer === 'asanee-chotikul') {
    return [
      'ได้ก็ดี  ยอมรับ',
      'ใจไม่กลับ  คำเดิม',
    ];
  }
  if (writer === 'nga-caravan') {
    return [
      'แสงดาวส่อง  ราตรี',
      'ยังมีหวัง  ในใจ',
    ];
  }
  if (writer === 'kob-bigass') {
    return [
      'เก็บแผลไว้  เป็นแรง',
      'แสงสว่าง  ก้าวต่อ',
    ];
  }
  if (writer === 'fongbeer-rock') {
    return [
      'ปากบอกไหว  รักเธอ',
      'เจอเธอที  ยังจำ',
    ];
  }
  if (writer === 'fongbeer-pop') {
    return [
      'ทุกนาที  มีเธอ',
      'เจอรักแท้  คุ้มพอ',
    ];
  }
  if (genre === 'thai-rock' || writer === 'sek-loso' || writer === 'suea-thanapol') {
    return [
      'ล้มกี่ครา  ไม่กลัว',
      'ตัวคนเดียว  ก้าวต่อ',
    ];
  }
  if (writer === 'joey-boy' || writer === 'the-toys') {
    return [
      'คืนนี้ปล่อย  ตามลม',
      'ชมแสงดาว  ด้วยกัน',
    ];
  }
  return [
    'เก็บความจำ  ไม่จาง',
    'ทางข้างหน้า  อุ่นใจ',
  ];
}

/**
 * สร้างชุดเนื้อเพลงจำลองที่เปลี่ยนตามแนวเพลง สไตล์นักแต่งเพลง โหมดจบเพลง และภาษาถิ่น
 * โดยคุมจำนวนพยางค์ตามมาตรฐาน Singable Pacing 6 กลุ่มสไตล์ พร้อมช่องหายใจกลางห้อง "  "
 * และบังคับสัมผัสส่งท้ายวรรคเข้าต้น/กลาง/ท้ายวรรคถัดไป
 */
export function buildStyledSimulatedSongLyrics(
  options: SimulatedLyricsInputOptions
): SimulatedSongLyricsBundle {
  const isEn = options.language === 'en';
  const genre: ThaiSongGenre = options.thaiGenre ?? 'thai-pop';
  const writer = options.songwriterStyle;
  const resolution = options.emotionalResolution;
  const moodLower = (options.mood ?? '').toLowerCase();

  if (isEn) {
    const outro = resolveSimulatedOutroLines(resolution, genre, writer, true);
    return {
      verse: [
        'Midnight shadows fall',
        'Calling down the hall',
        'Quiet streets still glow',
        'Slow the night will go',
        'Footsteps in the rain',
        'Pain begins to fade',
        'Shade beneath the pine',
        'Sign of yours and mine',
      ],
      'pre-chorus': [
        'Every breath climbs high',
        'Underneath the sky',
      ],
      chorus: [
        'Hold on through the night',
        'Light will find the way',
        'Stay inside this song',
        'Strong until the day',
      ],
      bridge: [
        'Time may bend the road',
        'Unload all the weight',
      ],
      outro,
      rhymeNote: 'Simulated English acoustic-pop phrasing with singable 4-5 syllable lines.',
    };
  }

  let verse: string[];
  let preChorus: string[];
  let chorus: string[];
  let bridge: string[];
  let rhymeNote: string;

  if (writer === 'aed-carabao') {
    verse = [
      'ออกเดินทาง  กลางแดด',
      'แผดเผาใจ  ไม่หวั่น',
      'ฝันยังมี  ในตา',
      'ฟ้าไม่เคย  ปิดทาง',
      'สร้างชีวิต  ด้วยมือ',
      'ถือความจริง  นำใจ',
      'ไทยทั้งผอง  ก้าวเดิน',
      'เชิญร่วมทาง  เสรี',
    ];
    preChorus = [
      'แม้ลมฝน  โหมแรง',
      'แกร่งกว่าหิน  แผ่นดิน',
    ];
    chorus = [
      'ข้ามทะเล  ฝ่าฟัน',
      'จับมือกัน  ไม่ท้อ',
      'รอวันฟ้า  เปลี่ยนสี',
      'มีพลัง  ก้าวต่อ',
    ];
    bridge = [
      'บทเรียนสอน  ให้แกร่ง',
      'แรงศรัทธา  ไม่คลาย',
    ];
    rhymeNote = 'สไตล์แอ๊ด คาราบาว (เพื่อชีวิต/สามช่า): คำคมกระชับ 4-6 พยางค์ พร้อมจุดหายใจกลางห้อง';
  } else if (writer === 'asanee-chotikul') {
    verse = [
      'บอกกับใจ  ไม่แคร์',
      'แพ้แค่เพียง  น้ำตา',
      'มาวันนี้  เข้าใจ',
      'ใครคนเดิม  เปลี่ยนไป',
      'ไม่เสียดาย  วันวาน',
      'ผ่านไปแล้ว  ช่างมัน',
      'ฉันก็ยัง  เหมือนเดิม',
      'เริ่มชีวิต  ใหม่ได้',
    ];
    preChorus = [
      'ได้ก็ดี  บอกใจ',
      'ไปเถิดเธอ  ไม่รั้ง',
    ];
    chorus = [
      'เคยสัญญา  ไม่ลืม',
      'ลืมกันไป  ง่ายดาย',
      'ปลายทางเหลือ  แค่ฉัน',
      'ได้ก็ดี  เท่านี้',
    ];
    bridge = [
      'ยินดีเธอ  เจอทาง',
      'วางหัวใจ  ลงพื้น',
    ];
    rhymeNote = 'สไตล์อัสนี โชติกุล (ร็อกคำซ้ำ/จิ๊กโก๋อกหัก): ซ้ำวลีคม 4-6 พยางค์ ลงบีตหนักแน่น';
  } else if (writer === 'nga-caravan') {
    verse = [
      'แสงดาวพราว  ฟ้าไกล',
      'ในคืนมืด  ยังเดิน',
      'เพลินมองทุ่ง  รวงทอง',
      'มองสายน้ำ  ไหลริน',
      'ดินอุดม  สมบูรณ์',
      'พูนความหวัง  ในใจ',
      'ไฟความดี  ไม่ดับ',
      'ขับขานเพลง  เสรี',
    ];
    preChorus = [
      'แม้หนทาง  แสนไกล',
      'ใจยังมั่น  ตะวัน',
    ];
    chorus = [
      'ฝากดอกไม้  คืนหนาว',
      'ดาวส่องทาง  แห่งฝัน',
      'วันพรุ่งนี้  มีหวัง',
      'ดังแสงทอง  ส่องดิน',
    ];
    bridge = [
      'ลมพัดทุ่ง  นากลางคืน',
      'ยืนหยัดด้วย  ศรัทธา',
    ];
    rhymeNote = 'สไตล์หงา คาราวาน (เพื่อชีวิต-โฟล์กกวี): กวีธรรมชาติ 4-6 พยางค์ ส่งสัมผัสต่อเนื่องละมุน';
  } else if (writer === 'kob-bigass') {
    verse = [
      'แบกความจริง  เดินลุย',
      'คุยกับเงา  ลำพัง',
      'หวังพังลง  ตรงหน้า',
      'ฟ้าไม่เห็น  ใจคน',
      'ทนบาดแผล  เรื่อยมา',
      'พาตัวเอง  ลุกยืน',
      'คืนที่มืด  ที่สุด',
      'หยุดไม่ได้  ต้องไป',
    ];
    preChorus = [
      'ล้มกี่ครั้ง  ลุกยืน',
      'ฝืนเจ็บปวด  เพื่อฝัน',
    ];
    chorus = [
      'โลกไม่เหลือ  ใครเลย',
      'เงยหน้ามอง  ขอบฟ้า',
      'ท้าพายุ  พัดแรง',
      'แสงปลายทาง  รออยู่',
    ];
    bridge = [
      'ยังมีลม  หายใจ',
      'ไฟในอก  ยังลุก',
    ];
    rhymeNote = 'สไตล์กบ บิ๊กแอส: คำกระแทกบีต 4-6 พยางค์ เปิดช่องหายใจท้ายห้อง';
  } else if (writer === 'fongbeer-rock') {
    verse = [
      'เก็บคำลา  ข้างใน',
      'ไม่พูดไป  สักคำ',
      'จำภาพเดิม  ฝังใจ',
      'ในวันนี้  ไม่มี',
      'ดีแค่ไหน  ไม่พอ',
      'รอตรงนี้  คนเดียว',
      'เปลี่ยวหัวใจ  เหลือเกิน',
      'เดินต่อไป  คนเดียว',
    ];
    preChorus = [
      'ปากบอกลืม  ได้แล้ว',
      'แววตายัง  สั่นไหว',
    ];
    chorus = [
      'ยังรักกัน  อยู่ไหม',
      'ให้เธอไป  หมดใจ',
      'ไกลแค่ไหน  ยังรอ',
      'ขอแค่คำ  ว่าลา',
    ];
    bridge = [
      'ถ้าไม่รัก  บอกมา',
      'ดีกว่าปล่อย  หลอกใจ',
    ];
    rhymeNote = 'สไตล์ฟองเบียร์ ร็อกพูดตรง 2000s: คำตรงจุดเจ็บ 4-6 พยางค์ กระชับเข้าบีตร็อก';
  } else if (writer === 'fongbeer-pop') {
    verse = [
      'มองเข็มเดิน  ช้าๆ',
      'พาใจคิด  ถึงเธอ',
      'เจอวันดี  มากมาย',
      'คลายความเหงา  ในใจ',
      'ใครสักคน  ข้างกาย',
      'คล้ายรอยยิ้ม  คุ้นตา',
      'พาให้ใจ  อุ่นดี',
      'มีแค่เธอ  คนเดียว',
    ];
    preChorus = [
      'แค่คำพูด  ธรรมดา',
      'ค่าของมัน  เต็มใจ',
    ];
    chorus = [
      'แสนล้านวัน  ไม่เปลี่ยน',
      'เวียนมาเจอ  ที่เดิม',
      'เติมหัวใจ  ให้อุ่น',
      'หนุนรักเรา  มั่นคง',
    ];
    bridge = [
      'เก็บความจำ  ข้างใจ',
      'ไม่ว่านาน  ไม่ลืม',
    ];
    rhymeNote = 'สไตล์ฟองเบียร์ ป๊อปซึ้งภาษาพูด: วลีเล่าเรื่องธรรมชาติ 5-6 พยางค์ ร้องสบาย';
  } else if (writer === 'joey-boy') {
    verse = [
      'หยิบมือถือขึ้นทัก  ส่งใจไป',
      'ไม่ต้องมัวอายเขิน  บอกมาเลย',
      'เคยแอบมองทุกเช้า  ที่หน้าซอย',
      'คอยรอยยิ้มคู่นั้น  มานานปี',
      'นาฬิกาหมุนไว  ใจเต้นรัว',
      'กลัวจะพลาดนาที  ที่พอดี',
      'มีคำพูดมากมาย  ในคืนนี้',
      'ชี้ชัดไปเลยว่า  ใจตรงกัน',
    ];
    preChorus = [
      'จังหวะใจเร่งบีต  ขึ้นทุกที',
      'มีเรื่องราวอยากบอก  ให้เธอฟัง',
    ];
    chorus = [
      'บอกมาเลย  อย่ามัวรอช้า',
      'กล้าพูดรัก  สักคำได้ไหม',
      'ในคืนนี้  มีเธอข้างกาย',
      'สายตาฟ้อง  ว่าใจตรงกัน',
    ];
    bridge = [
      'ไม่ต้องคิดมากมาย  ปล่อยตามใจ',
      'จับมือกันเต้นไป  ให้สุดคืน',
    ];
    rhymeNote = 'สไตล์โจอี้ บอย: โฟลว์ 6-8 พยางค์ สัมผัสในกระชั้น สลับช่องหายใจชัดเจน';
  } else if (writer === 'the-toys' || genre === 'thai-rnb') {
    verse = [
      'แสงนีออน  กระจกใส',
      'ในคืนเดิม  มีเสียงฝน',
      'วนทำนอง  ที่คุ้นตา',
      'พาใจลอย  ในความฝัน',
      'ฉันยังจำ  ได้ทุกคำ',
      'ฟังเสียงเพลง  ในห้องนอน',
      'ก่อนหลับตา  ยังคิดถึง',
      'ซึ้งในใจ  ไม่เคยลืม',
    ];
    preChorus = [
      'ยิ่งดึกนัก  ยิ่งคิดถึง',
      'ดึงใจลอย  ไปหาเธอ',
    ];
    chorus = [
      'แค่เธอผ่าน  ใจก็สั่น',
      'วันเหงาละลาย  ในสายตา',
      'พาใจลอย  ตามเสียงเพลง',
      'เกรงคืนนี้  หลงรักเธอ',
    ];
    bridge = [
      'ปล่อยราตรี  ไปช้าๆ',
      'ถ้ายังยิน  หันมองมา',
    ];
    rhymeNote = 'สไตล์ Melodic R&B / The TOYS: วลีต้นกระชับสลับสระเปิด 6-7 พยางค์';
  } else if (writer === 'dee-nitipong' || writer === 'seefa') {
    verse = [
      'มองหน้าต่าง  คืนเหงา',
      'เงาเวลา  พัดผ่าน',
      'กาลไม่รอ  หัวใจ',
      'ใครคนหนึ่ง  เดินไป',
      'ไม่เหลือคำ  อำลา',
      'พาความจริง  เงียบงัน',
      'ฉันทบทวน  กี่ครั้ง',
      'ยังหาเหตุ  ไม่เจอ',
    ];
    preChorus = [
      'เพิ่งเข้าใจ  วันนี้',
      'ดีแค่ไหน  ไม่พอ',
    ];
    chorus = [
      'รักเท่าไร  ก็แพ้',
      'แม้ทุ่มเท  ทั้งใจ',
      'ใกล้แค่ไหน  ยังไกล',
      'ไม่เคยรัก  กันเลย',
    ];
    bridge = [
      'เก็บเศษใจ  ที่ร้าว',
      'ก้าวเดินต่อ  ลำพัง',
    ];
    rhymeNote = 'สไตล์ดี้ นิติพงษ์ / สีฟ้า: Bar 1 หมัดฮุค 4-5 พยางค์ คมลึก ส่งสัมผัสต่อเนื่อง';
  } else if (
    writer === 'phaiboon-butkhan' ||
    writer === 'chali-intrawichit' ||
    genre === 'luk-krung'
  ) {
    verse = [
      'จันทร์แรมลอย  นภา',
      'พาดวงใจ  ถวิล',
      'กลิ่นลมโชย  รวยริน',
      'ถวิลคอย  คนดี',
      'ราตรีไร้  ดารา',
      'น้ำตาพรม  ดอกไม้',
      'ในคำนึง  ตราตรึง',
      'ซึ้งรักชั่ว  นิรันดร์',
    ];
    preChorus = [
      'ลมรำเพย  พรมใจ',
      'ไกลเพียงใด  ห่วงหา',
    ];
    chorus = [
      'ดุจหยาดเพชร  พร่างฟ้า',
      'พาดวงใจ  ละมุน',
      'อุ่นไอรัก  ไม่คลาย',
      'หมายปองเพียง  เคียงเธอ',
    ];
    bridge = [
      'กาลเวลา  ลับตา',
      'พาบทกลอน  กล่อมใจ',
    ];
    rhymeNote = 'สไตล์กวีลูกกรุง-ลูกทุ่งชั้นครู: สัมผัสต่อเนื่อง 4-5 พยางค์ เอื้อนสระยาวละมุน';
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
          'หอบความฝัน  บ้านนา',
          'มาสู้เมือง  ห่างไกล',
          'ใจคิดฮอด  อีแม่',
          'แคร์คำสอน  ไม่จาง',
          'ทางยังยาว  ไม่ท้อ',
          'รอเสียงแคน  ปลอบใจ',
          'ในคืนเหงา  นับดาว',
          'หนาวเพียงใด  สู้ต่อ',
        ]
      : [
          'ลมหนาวพัด  ท้องนา',
          'พาใจคิด  ถึงเธอ',
          'เจอความเหงา  เดียวดาย',
          'หมายอ้อนวอน  ขอบฟ้า',
          'ฟ้าจางฝน  ซาลง',
          'คงรีบคืน  บ้านนา',
          'มาเช็ดน้ำ  ตาใจ',
          'ในวันข้าว  สุกทอง',
        ];
    preChorus = isIsan
      ? ['เหนื่อยปานใด  บ่ท้อ', 'รอคืนฮัง  บ้านนา']
      : ['กี่คืนเหงา  เฝ้ารอ', 'ขอแสงเดือน  ส่องใจ'];
    chorus = isIsan
      ? [
          'ฮักเจ้าหลาย  เบิดใจ',
          'ไกลบ้านนา  บ่ลืม',
          'ปลื้มคำมั่น  สัญญา',
          'พาคืนฮัง  บ้านเฮา',
        ]
      : [
          'ฝากเสียงแคน  ก้องทุ่ง',
          'มุ่งถึงใจ  คนไกล',
          'ในคืนหนาว  แสงจันทร์',
          'ฝันคืนสู่  บ้านนา',
        ];
    bridge = [
      'เก็บความหวัง  ใส่ใจ',
      'ในสักวัน  สมหวัง',
    ];
    rhymeNote = isIsan
      ? 'สไตล์ลูกทุ่งอีสานสู้ชีวิต: 4-5 พยางค์ สระเสียงยาวเอื้อนลูกคอไพเราะ'
      : 'สไตล์ลูกทุ่งไทยคำหวาน: 4-5 พยางค์ เปิดช่องหายใจให้เอื้อนลูกคอชัดเจน';
  } else if (
    writer === 'sek-loso' ||
    writer === 'suea-thanapol' ||
    genre === 'thai-rock' ||
    genre === 'phuea-chiwit'
  ) {
    verse = [
      'แบกความฝัน  ลุยฝน',
      'คนเดียวบน  ทางยาว',
      'ก้าวข้ามคืน  เหน็บหนาว',
      'ร้าวในใจ  ไม่ถอย',
      'คอยบอกใจ  เสมอ',
      'เจอพายุ  ไม่กลัว',
      'ตัวคนเดียว  ยืนหยัด',
      'ซัดความกลัว  ทิ้งไป',
    ];
    preChorus = [
      'ล้มกี่ที  ลุกยืน',
      'ฝืนเจ็บปวด  เพื่อฝัน',
    ];
    chorus = [
      'ใจมันรัก  ไปแล้ว',
      'แน่วแน่เดิน  ต่อไป',
      'ไกลแค่ไหน  ไม่กลัว',
      'ตัวคนเดียว  ใจสู้',
    ];
    bridge = [
      'ไม่มีใด  จะเสีย',
      'เคลียร์หัวใจ  ทุ่มเท',
    ];
    rhymeNote = 'สไตล์ร็อกสามัญชน / เพื่อชีวิต: คำหนักแน่น 4-6 พยางค์ เปิดช่องหายใจท้ายห้อง';
  } else if (
    moodLower.includes('sad') ||
    moodLower.includes('เศร้า') ||
    moodLower.includes('อกหัก') ||
    moodLower.includes('break') ||
    resolution === 'piercing-sting'
  ) {
    verse = [
      'แสงไฟถนน  จางลง',
      'ตรงผนัง  เข็มเดิน',
      'เกินเวลา  คุ้นเคย',
      'เลยผ่านมุม  ถนน',
      'วนความจำ  ในใจ',
      'ไกลเกินเอื้อม  ถึงเธอ',
      'เบลอเลือนลาง  สัญญา',
      'พาความฝัน  พังลง',
    ];
    preChorus = [
      'ยิ่งอยากลืม  ยิ่งจำ',
      'ซ้ำยังรอ  คนไกล',
    ];
    chorus = [
      'เธอจากไป  ไม่มอง',
      'นองน้ำตา  ลำพัง',
      'พังความหวัง  หมดใจ',
      'ไม่มีเธอ  อีกแล้ว',
    ];
    bridge = [
      'ขอร้องไห้  คืนนี้',
      'พรุ่งนี้คง  ทำใจ',
    ];
    rhymeNote = 'โหมดอารมณ์เศร้าบาดลึก: 4-5 พยางค์ ส่งสัมผัสสระต่อเนื่อง ไม่รัวคำ';
  } else {
    // Thai Pop / Boy Kosiyabong / Stamp / Tan Lipta / Acoustic Indie
    verse = [
      'แดดยามเย็น  พัดผ่าน',
      'กาลเวลา  เดินต่อ',
      'รอข้อความ  ทักทาย',
      'คลายเหนื่อยล้า  ทั้งวัน',
      'ฉันแอบยิ้ม  เบาๆ',
      'เอาความเศร้า  ทิ้งไป',
      'ในโลกหมุน  รวดเร็ว',
      'เพียงข้างเธอ  อุ่นใจ',
    ];
    preChorus = [
      'แค่สบตา  วันนี้',
      'ดีเหลือเกิน  มีเธอ',
    ];
    chorus = [
      'โลกหยุดเดิน  พร้อมกัน',
      'ฉันยังเดิน  หาเธอ',
      'เจอเรื่องราว  ร้อยพัน',
      'มั่นใจมี  เพียงเธอ',
    ];
    bridge = [
      'พายุแรง  เพียงใด',
      'ในมือฉัน  กุมเธอ',
    ];
    rhymeNote = 'สไตล์ป๊อปร่วมสมัย: วลี 4-6 พยางค์ เว้นจังหวะหายใจกลางห้อง ร้องสบาย';
  }

  // Apply emotionalResolution overrides for chorus when explicit mode is requested
  if (resolution === 'piercing-sting') {
    chorus = [
      'รักเท่าไร  ก็แพ้',
      'แม้ทุ่มเท  ทั้งใจ',
      'ไปต่อไม่  ได้เลย',
      'คนไม่รัก  ต้องลา',
    ];
  } else if (resolution === 'fulfilling-warm') {
    chorus = [
      'มีเธออยู่ข้างกัน',
      'ทุกๆ วัน  ผูกพัน',
      'กี่เรื่องราว  ผ่านไป',
      'กุมมือไว้  อุ่นใจ',
    ];
  } else if (resolution === 'empowering-anthem') {
    chorus = [
      'ลุกขึ้นยืน  อีกครั้ง',
      'ส่งความหวัง  ก้องฟ้า',
      'ฝ่าลมฝน  พัดพา',
      'ใจกล้าสู้  ไม่ถอย',
    ];
  } else if (resolution === 'catchy-earworm') {
    chorus = [
      'บอกรักเลย  ตอนนี้',
      'อย่ารอรี  สายไป',
      'ใจตรงกัน  แค่ไหน',
      'บอกรักเลย  สักที',
    ];
  } else if (resolution === 'nostalgic-fade') {
    chorus = [
      'คิดถึงเธอ  ฝนโปรย',
      'ลมพัดโชย  วันเก่า',
      'เพลงข้างกาย  สองเรา',
      'เหลือเพียงเงา  ในใจ',
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
  
  const resolvedFormulaChords = input.chordProgressionPreset
    ? resolveChordProgressionFormula(input.chordProgressionPreset, baseKey)
    : [];
  const effectiveChords =
    input.customChords && input.customChords.length > 0
      ? input.customChords
      : resolvedFormulaChords.length > 0
        ? resolvedFormulaChords
        : preset.defaultChords;
  const effectiveGenre: ThaiSongGenre = input.thaiGenre ?? preset.thaiGenre ?? 'thai-pop';

  const isEn = input.language === 'en';
  const bundle = buildStyledSimulatedSongLyrics({
    topic: topicText,
    language: input.language,
    thaiGenre: effectiveGenre,
    lyricDialect: input.lyricDialect,
    songwriterStyle: input.songwriterStyle,
    emotionalResolution: input.emotionalResolution,
    lyricDensity: input.lyricDensity,
  });

  const verseLyrics = bundle.verse.slice(0, 4);
  const preChorusLyrics = bundle['pre-chorus'].slice(0, 2);
  const chorusLyrics = bundle.chorus.slice(0, 4);
  const outroLyrics = bundle.outro.slice(0, 2);

  const simMelodyCtx: GuideMelodyContext = {
    baseKey,
    timeSignature: '4/4',
    bpm,
    vocalProfile: input.vocalProfile,
    thaiGenre: effectiveGenre,
    songwriterStyle: input.songwriterStyle,
    lyricDensity: input.lyricDensity,
  };

  const mkBars = (
    lines: string[],
    sectionChords: string[],
    sectionType: SectionType,
    ringEnd = false
  ): SongBar[] =>
    lines.map((lyrics, idx) => {
      const chord = sectionChords[idx % sectionChords.length] || 'C';
      return {
        id: generateUniqueId('bar'),
        chordsPerBar: 1,
        chords: [chord],
        playStyle: ringEnd && idx === lines.length - 1 ? 'let-ring' : 'normal',
        lyrics,
        melodyNotes: lyrics
          ? buildDiatonicGuideNotesForChord(chord, idx, lyrics, undefined, sectionType, simMelodyCtx)
          : [],
      };
    });

  let simulatedSections;
  if (input.customStructure && input.customStructure.length > 0) {
    const rawStructure = input.customStructure.slice(0, 9);
    simulatedSections = rawStructure.map((structItem, sIdx) => {
      const type = structItem.type;
      const barCount = Math.max(1, Math.min(8, structItem.bars || (type === 'intro' || type === 'outro' ? 2 : 4)));
      const name = structItem.name?.trim() || defaultSectionTitle(type, input.language);
      const isIntro = type === 'intro';
      const isOutro = type === 'outro' || sIdx === rawStructure.length - 1;
      const isChorus = type === 'chorus';
      const isSolo = type === 'solo';
      const isPre = type === 'pre-chorus';
      const isBridge = type === 'bridge';

      let lines: string[] = [];
      if (isIntro || isSolo) {
        lines = Array(barCount).fill('');
      } else {
        const pool = (bundle[type] && bundle[type].length > 0)
          ? bundle[type]
          : type === 'bridge'
            ? bundle['pre-chorus'] || bundle.verse
            : bundle.verse;
        lines = Array.from({ length: barCount }, (_, i) => pool[i % pool.length] ?? '');
      }

      const secChords =
        input.customChords && input.customChords.length > 0
          ? input.customChords
          : resolvedFormulaChords.length > 0
            ? resolvedFormulaChords
            : isPre
              ? [effectiveChords[3] ?? 'F', effectiveChords[1] ?? 'G']
              : isOutro
                ? [effectiveChords[2] ?? 'Am', effectiveChords[0] ?? 'C']
                : effectiveChords;

      const intensity: SectionIntensity = isChorus ? 'high' : isPre || isSolo ? 'medium' : 'low';
      return {
        name,
        type,
        intensity,
        instruments: {
          guitarRhythm: true,
          guitarLead: isChorus && preset.id === 'soft-rock' ? true : isSolo,
          bass: !isIntro,
          piano: isPre || isChorus || isBridge || isSolo || isOutro,
          drums: isPre || isChorus || isBridge || isSolo,
          guitarRhythmStyle: isChorus ? preset.chorusRhythmStyle : isOutro ? 'fingerpicking' : preset.verseRhythmStyle,
          guitarLeadStyle: isSolo ? ('melodic-solo' as LeadGuitarStyle) : ('riff-fills' as LeadGuitarStyle),
          guitarLeadDrive: (preset.id === 'soft-rock' || isSolo ? 'overdrive' : 'clean') as LeadGuitarDrive,
          bassStyle: (isChorus ? 'root-fifth' : 'warm-sustain') as BassStyle,
          pianoStyle: 'warm-pad' as PianoStyle,
          drumsStyle: isChorus || isSolo ? preset.chorusDrumsStyle : isPre ? 'shaker-cajon' : 'off',
        },
        bars: mkBars(lines, secChords, type, isIntro || isOutro),
      };
    });
  } else {
    simulatedSections = [
      {
        name: defaultSectionTitle('intro', input.language),
        type: 'intro' as SectionType,
        intensity: 'low' as SectionIntensity,
        instruments: {
          guitarRhythm: true,
          guitarLead: false,
          bass: false,
          piano: false,
          drums: false,
          guitarRhythmStyle: preset.verseRhythmStyle,
          drumsStyle: 'off' as DrumStyle,
        },
        bars: mkBars(['', ''], effectiveChords.slice(0, 2), 'intro', true),
      },
      {
        name: defaultSectionTitle('verse', input.language),
        type: 'verse' as SectionType,
        intensity: 'low' as SectionIntensity,
        instruments: {
          guitarRhythm: true,
          guitarLead: false,
          bass: true,
          piano: false,
          drums: false,
          guitarRhythmStyle: preset.verseRhythmStyle,
          bassStyle: 'warm-sustain' as BassStyle,
          drumsStyle: 'off' as DrumStyle,
        },
        bars: mkBars(verseLyrics, effectiveChords, 'verse'),
      },
      {
        name: defaultSectionTitle('pre-chorus', input.language),
        type: 'pre-chorus' as SectionType,
        intensity: 'medium' as SectionIntensity,
        instruments: {
          guitarRhythm: true,
          guitarLead: false,
          bass: true,
          piano: true,
          drums: true,
          guitarRhythmStyle: 'soft-strum' as GuitarStyle,
          pianoStyle: 'warm-pad' as PianoStyle,
          drumsStyle: 'shaker-cajon' as DrumStyle,
        },
        bars: mkBars(preChorusLyrics, [effectiveChords[3] ?? 'F', effectiveChords[1] ?? 'G'], 'pre-chorus'),
      },
      {
        name: defaultSectionTitle('chorus', input.language),
        type: 'chorus' as SectionType,
        intensity: 'high' as SectionIntensity,
        instruments: {
          guitarRhythm: true,
          guitarLead: preset.id === 'soft-rock',
          bass: true,
          piano: true,
          drums: true,
          guitarRhythmStyle: preset.chorusRhythmStyle,
          guitarLeadStyle: 'riff-fills' as LeadGuitarStyle,
          guitarLeadDrive: preset.id === 'soft-rock' ? ('overdrive' as LeadGuitarDrive) : ('clean' as LeadGuitarDrive),
          bassStyle: 'root-fifth' as BassStyle,
          pianoStyle: 'warm-pad' as PianoStyle,
          drumsStyle: preset.chorusDrumsStyle,
        },
        bars: mkBars(chorusLyrics, effectiveChords, 'chorus', true),
      },
      {
        name: defaultSectionTitle('outro', input.language),
        type: 'outro' as SectionType,
        intensity: 'low' as SectionIntensity,
        instruments: {
          guitarRhythm: true,
          guitarLead: false,
          bass: true,
          piano: true,
          drums: false,
          guitarRhythmStyle: 'fingerpicking' as GuitarStyle,
          drumsStyle: 'off' as DrumStyle,
        },
        bars: mkBars(outroLyrics, [effectiveChords[2] ?? 'Am', effectiveChords[0] ?? 'C'], 'outro', true),
      },
    ];
  }

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
    sections: simulatedSections,
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
    writer !== 'nga-caravan' &&
    writer !== 'kob-bigass' &&
    writer !== 'fongbeer-rock' &&
    writer !== 'fongbeer-pop' &&
    (genre === 'luk-thung' ||
      genre === 'phuea-chiwit' ||
      writer === 'aed-carabao' ||
      writer === 'phaiboon-butkhan' ||
      writer === 'suraphon-sombatcharoen' ||
      writer === 'sala-khunawut' ||
      dialect === 'isan' ||
      dialect === 'suphan-central' ||
      preset.includes('luk-thung') ||
      preset.includes('phuea-chiwit'));

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
      writer === 'kob-bigass' ||
      writer === 'fongbeer-rock' ||
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
  const isAcoustic =
    genre === 'acoustic-indie' || genre === 'luk-krung' || writer === 'nga-caravan';
  const defaultRhythm: GuitarStyle =
    genre === 'acoustic-indie' ||
    writer === 'nga-caravan' ||
    (isSlowPopBallad && song.bpm <= 72)
      ? 'fingerpicking'
      : isSlowPopBallad
        ? 'soft-strum'
        : 'campfire-strum';
  const defaultBass: BassStyle =
    genre === 'luk-krung' || writer === 'nga-caravan' || isSlowPopBallad
      ? 'warm-sustain'
      : 'root-fifth';
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
