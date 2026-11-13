import type {
  SongProject,
  SongSection,
  SectionType,
  TimeSignature,
  GuitarModel,
  Ambience3DMode,
  GuitarStyle,
  LeadGuitarStyle,
  LeadGuitarDrive,
  BassStyle,
  PianoStyle,
  DrumStyle,
  SectionInstruments,
} from '../types/song';

export interface AiDirectorResult {
  updatedSong: SongProject;
  summaryActions: string[];
}

type InstrumentKey = 'guitarRhythm' | 'guitarLead' | 'bass' | 'piano' | 'drums';

const SECTION_TYPE_PATTERNS: Array<{ type: SectionType; regex: RegExp }> = [
  { type: 'pre-chorus', regex: /pre[\s-]?chorus|พรี[\s-]?คอรัส|ก่อนฮุค/i },
  { type: 'intro', regex: /\bintro\b|อินโทร|นำเข้า/i },
  { type: 'verse', regex: /\bverse\b|เวิร์ส|ท่อนร้อง/i },
  { type: 'chorus', regex: /\bchorus\b|คอรัส|ฮุค|ท่อนฮุค/i },
  { type: 'solo', regex: /\bsolo\b|โซโล่/i },
  { type: 'bridge', regex: /\bbridge\b|บริดจ์|ท่อนแยก/i },
  { type: 'outro', regex: /\boutro\b|เอาท์โทร|ท่อนจบ|จบเพลง/i },
];

const INSTRUMENT_PATTERNS: Array<{ key: InstrumentKey; regex: RegExp }> = [
  {
    key: 'guitarRhythm',
    regex: /กีตาร์คอร์ด|ริทึ่ม|rhythm|กีตาร์โปร่ง|อะคูสติก|acoustic|ตีคอร์ด|เกาสาย/i,
  },
  {
    key: 'guitarLead',
    regex: /กีตาร์ลีด|ลีด|\blead\b|les\s*paul|เลสพอล|โซโล่ทำนอง|ลูกส่ง|เสียงแตก|overdrive|distortion|fuzz|crunch|คลีน/i,
  },
  {
    key: 'bass',
    regex: /เบส|\bbass\b/i,
  },
  {
    key: 'piano',
    regex: /เปียโน|\bpiano\b|คีย์บอร์ด|\bkeys?\b/i,
  },
  {
    key: 'drums',
    regex: /เพอร์คัชชัน|percussion|กลอง|drums?|คาฮอง|cajon|shaker/i,
  },
];

const CHORD_TOKEN_REGEX = /^[A-G][#b]?(?:maj7|m7|min7|sus4|sus2|add9|dim|aug|m|7|9|6)?(?:\/[A-G][#b]?)?$/;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function cloneSong(song: SongProject): SongProject {
  return {
    ...song,
    mixer: {
      ...song.mixer,
      guitarRhythm: { ...song.mixer.guitarRhythm },
      guitarLead: { ...song.mixer.guitarLead },
      bass: { ...song.mixer.bass },
      piano: { ...song.mixer.piano },
      drums: { ...song.mixer.drums },
      ...(song.mixer.melody ? { melody: { ...song.mixer.melody } } : {}),
      ...(song.mixer.vocal ? { vocal: { ...song.mixer.vocal } } : {}),
    },
    sections: song.sections.map((sec) => ({
      ...sec,
      instruments: { ...sec.instruments },
      bars: sec.bars.map((b) => ({
        ...b,
        chords: [...b.chords],
        melodyNotes: b.melodyNotes.map((m) => ({ ...m })),
      })),
    })),
    ...(song.snapshots ? { snapshots: song.snapshots.map((s) => ({ ...s })) } : {}),
  };
}

/** แยกคำสั่งหลักตามท่อนหรือตัวคั่นประโยค */
function splitIntoClauses(prompt: string): string[] {
  const raw = prompt
    .replace(/[，、]/g, ',')
    .split(/(?:[\n;]|,(?!\s*\d)|(?:\s+แล้ว\s+)|(?=(?:ท่อน\s*)?(?:pre[\s-]?chorus|intro|verse|chorus|solo|bridge|outro|อินโทร|เวิร์ส|คอรัส|ฮุค|พรี[\s-]?คอรัส|บริดจ์|เอาท์โทร)\b))/gi)
    .map((s) => s.trim())
    .filter(Boolean);
  return raw;
}

/** แยก sub-clause รายชิ้นเครื่องดนตรีภายในท่อนเดียว เช่น "ลีดแตกหนัก 100% กลองเป็นชุด เบส 80%" */
function splitInstrumentChunks(clause: string): Array<{ key: InstrumentKey; text: string }> {
  const hits: Array<{ key: InstrumentKey; index: number }> = [];
  for (const pat of INSTRUMENT_PATTERNS) {
    const globalRe = new RegExp(pat.regex.source, pat.regex.flags.includes('i') ? 'gi' : 'g');
    let m: RegExpExecArray | null;
    while ((m = globalRe.exec(clause)) !== null) {
      hits.push({ key: pat.key, index: m.index });
    }
  }
  if (hits.length === 0) {
    if (/เกา|fingerpick/i.test(clause)) {
      return [{ key: 'guitarRhythm', text: clause }];
    }
    return [];
  }

  // เรียงตามตำแหน่งแล้วรวมตัวที่ซ้ำกันติดกันของเครื่องดนตรีเดียวกัน
  hits.sort((a, b) => a.index - b.index);
  const deduped: Array<{ key: InstrumentKey; index: number }> = [];
  for (const h of hits) {
    const prev = deduped[deduped.length - 1];
    if (!prev || prev.key !== h.key || h.index - prev.index > 60) {
      deduped.push(h);
    }
  }

  const out: Array<{ key: InstrumentKey; text: string }> = [];
  for (let i = 0; i < deduped.length; i++) {
    const start = i === 0 ? Math.max(0, deduped[i].index - 20) : deduped[i].index;
    const end = i + 1 < deduped.length ? deduped[i + 1].index : clause.length;
    out.push({
      key: deduped[i].key,
      text: clause.slice(start, end).trim(),
    });
  }
  return out;
}

function extractChordsFromText(text: string): string[] {
  const explicitMatch = text.match(/(?:คอร์ด|chord[s]?)\s*[:=\-]?\s*([A-G][^\n,;]+)/i);
  const source = explicitMatch ? explicitMatch[1] : text;
  if (!explicitMatch && !/[-–→>]/.test(text)) return [];

  const tokens = source
    .replace(/[-–→>|,]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const chords: string[] = [];
  for (const tok of tokens) {
    if (CHORD_TOKEN_REGEX.test(tok)) {
      chords.push(tok);
    } else if (chords.length > 0) {
      break; // หยุดเมื่อเจอคำไทย/อังกฤษที่ไม่ใช่คอร์ดต่อท้าย
    }
  }
  return chords;
}

function parseExplicitVolume(text: string): number | undefined {
  const pctMatch = text.match(/(?:ความดัง|ดัง|vol(?:ume)?\s*[:=]?\s*)?(\d{1,3})\s*%/i);
  if (pctMatch) {
    return clamp(Number(pctMatch[1]), 0, 100);
  }
  const numAfterVol = text.match(/(?:ความดัง|vol(?:ume)?)\s*[:=]?\s*(\d{1,3})/i);
  if (numAfterVol) {
    return clamp(Number(numAfterVol[1]), 0, 100);
  }
  if (/เบาๆ|แผ่ว|นุ่มๆ|คลอ|subtle|quiet|soft/i.test(text)) return 55;
  if (/ปานกลาง|กลางๆ|medium|moderate/i.test(text)) return 75;
  if (/จัดเต็ม|ดังสุด|เต็มที่|กระหึ่ม|full\s*blast|loud/i.test(text)) return 100;
  return undefined;
}

function detectMuteOrEnable(text: string): 'mute' | 'enable' | undefined {
  if (/ปิด|ไม่ต้องเล่น|งด|เงียบ|เอา.*ออก|ตัด.*ออก|\bmute\b|\boff\b|ไม่มี/i.test(text)) {
    return 'mute';
  }
  if (/เปิด|ใส่|เพิ่ม|เล่น|\benable\b|\bon\b/i.test(text)) {
    return 'enable';
  }
  return undefined;
}

function applyInstrumentDirectives(
  ins: SectionInstruments,
  key: InstrumentKey,
  chunkText: string,
  sectionName: string,
  actions: string[]
) {
  const actionLabel = (msg: string) => actions.push(`[${sectionName}] ${msg}`);
  const muteState = detectMuteOrEnable(chunkText);
  const vol = parseExplicitVolume(chunkText);

  if (muteState === 'mute') {
    ins[key] = false;
    actionLabel(`ปิด ${key}`);
    return;
  }

  let modified = false;

  if (muteState === 'enable') {
    ins[key] = true;
    modified = true;
    actionLabel(`เปิด ${key}`);
  }

  if (key === 'guitarRhythm') {
    let style: GuitarStyle | undefined;
    if (/เกา|fingerpick|arpeggio/i.test(chunkText)) style = 'fingerpicking';
    else if (/นุ่ม|เบา|soft/i.test(chunkText)) style = 'soft-strum';
    else if (/ตีคอร์ด|แคมป์ไฟ|มัน|strum|campfire/i.test(chunkText)) style = 'campfire-strum';
    if (style) {
      ins.guitarRhythm = true;
      ins.guitarRhythmStyle = style;
      modified = true;
      actionLabel(`กีตาร์คอร์ด -> ${style}`);
    }
    if (vol !== undefined) {
      ins.guitarRhythmVolume = vol;
      if (vol > 0) ins.guitarRhythm = true;
      modified = true;
      actionLabel(`ความดังกีตาร์คอร์ด -> ${vol}%`);
    }
  } else if (key === 'guitarLead') {
    let style: LeadGuitarStyle | undefined;
    if (/ลูกส่ง|riff|fill/i.test(chunkText)) style = 'riff-fills';
    else if (/เกา|arp/i.test(chunkText)) style = 'soft-arpeggio';
    else if (/โซโล่|ทำนอง|solo|melod/i.test(chunkText)) style = 'melodic-solo';
    if (style) {
      ins.guitarLead = true;
      ins.guitarLeadStyle = style;
      modified = true;
      actionLabel(`ลีดสไตล์ -> ${style}`);
    }

    let drive: LeadGuitarDrive | undefined;
    if (/คลีน|\bclean\b/i.test(chunkText)) drive = 'clean';
    else if (/ครันช์|\bcrunch\b/i.test(chunkText)) drive = 'crunch';
    else if (/แตกอุ่น|อุ่น|overdrive|warm/i.test(chunkText)) drive = 'overdrive';
    else if (/แตกหนัก|แตกมาก|distortion|fuzz|heavy|เมทัล|metal|ร็อค/i.test(chunkText)) drive = 'distortion';
    if (drive) {
      ins.guitarLead = true;
      ins.guitarLeadDrive = drive;
      modified = true;
      actionLabel(`โทนลีด -> ${drive}`);
    }

    if (vol !== undefined) {
      ins.guitarLeadVolume = vol;
      if (vol > 0) ins.guitarLead = true;
      modified = true;
      actionLabel(`ความดังลีด -> ${vol}%`);
    }
  } else if (key === 'bass') {
    let style: BassStyle | undefined;
    if (/ลากยาว|อุ่น|sustain|แช่/i.test(chunkText)) style = 'warm-sustain';
    else if (/สลับ|root|เดิน/i.test(chunkText)) style = 'root-fifth';
    if (style) {
      ins.bass = true;
      ins.bassStyle = style;
      modified = true;
      actionLabel(`เบส -> ${style}`);
    }
    if (vol !== undefined) {
      ins.bassVolume = vol;
      if (vol > 0) ins.bass = true;
      modified = true;
      actionLabel(`ความดังเบส -> ${vol}%`);
    }
  } else if (key === 'piano') {
    let style: PianoStyle | undefined;
    if (/พรมนิ้ว|เกา|arp/i.test(chunkText)) style = 'gentle-arpeggio';
    else if (/ปูพื้น|pad|แช่|warm/i.test(chunkText)) style = 'warm-pad';
    if (style) {
      ins.piano = true;
      ins.pianoStyle = style;
      modified = true;
      actionLabel(`เปียโน -> ${style}`);
    }
    if (vol !== undefined) {
      ins.pianoVolume = vol;
      if (vol > 0) ins.piano = true;
      modified = true;
      actionLabel(`ความดังเปียโน -> ${vol}%`);
    }
  } else if (key === 'drums') {
    let style: DrumStyle | undefined;
    if (/กลองชุด|เป็นชุด|\bkit\b|ร็อค|rock|หนัก|full/i.test(chunkText)) style = 'simple-kit';
    else if (/คาฮอง|cajon|shaker|เชคเกอร์|อะคูสติก|เบา/i.test(chunkText)) style = 'shaker-cajon';
    if (style) {
      ins.drums = true;
      ins.drumsStyle = style;
      modified = true;
      actionLabel(`กลอง -> ${style}`);
    }
    if (vol !== undefined) {
      ins.drumsVolume = vol;
      if (vol > 0) ins.drums = true;
      modified = true;
      actionLabel(`ความดังกลอง -> ${vol}%`);
    }
  }

  if (!modified && vol === undefined && !muteState) {
    ins[key] = true;
  }
}

function applyGlobalSettings(prompt: string, song: SongProject, actions: string[]) {
  // 1. BPM
  const bpmMatch =
    prompt.match(/(?:bpm|tempo|ความเร็ว|เทมโป)\s*[:=]?\s*(\d{2,3})/i) ??
    prompt.match(/(\d{2,3})\s*(?:bpm|บีพีเอ็ม)/i);
  if (bpmMatch) {
    const nextBpm = clamp(Number(bpmMatch[1]), 40, 220);
    if (nextBpm !== song.bpm) {
      song.bpm = nextBpm;
      actions.push(`ความเร็ว (BPM) -> ${nextBpm}`);
    }
  } else if (/ช้าลง/i.test(prompt)) {
    song.bpm = clamp(song.bpm - 12, 40, 220);
    actions.push(`ความเร็ว (BPM) ช้าลง -> ${song.bpm}`);
  } else if (/เร็วขึ้น/i.test(prompt)) {
    song.bpm = clamp(song.bpm + 12, 40, 220);
    actions.push(`ความเร็ว (BPM) เร็วขึ้น -> ${song.bpm}`);
  } else if (/บัลลาด|ballad|ช้าๆ/i.test(prompt) && !/ช้าๆ.*ท่อน/i.test(prompt)) {
    song.bpm = 72;
    actions.push(`ตั้งความเร็ว Ballad -> 72 BPM`);
  }

  // 2. Base Key
  const keyMatch = prompt.match(/(?:คีย์|key|\bin\s+key)\s*[:=]?\s*([A-G][#b]?m?)\b/i);
  if (keyMatch) {
    const rawKey = keyMatch[1];
    const formatted = rawKey[0].toUpperCase() + rawKey.slice(1);
    song.baseKey = formatted;
    actions.push(`คีย์เพลง -> ${formatted}`);
  }

  // 3. Time Signature
  const tsMatch = prompt.match(/\b(4\/4|3\/4|6\/8)\b/);
  if (tsMatch) {
    song.timeSignature = tsMatch[1] as TimeSignature;
    actions.push(`จังหวะ (Time Signature) -> ${song.timeSignature}`);
  } else if (/วอลทซ์|waltz/i.test(prompt)) {
    song.timeSignature = '3/4';
    actions.push('จังหวะ Waltz -> 3/4');
  }

  // 4. Guitar Model
  let guitarModel: GuitarModel | undefined;
  if (/ไนลอน|nylon|คลาสสิก|classical/i.test(prompt)) guitarModel = 'classical-nylon';
  else if (/dreadnought|สายเหล็ก|โฟล์ค|folk|steel/i.test(prompt)) guitarModel = 'dreadnought-steel';
  else if (/ovation|หลังเต่า/i.test(prompt)) guitarModel = 'ovation-roundback';
  else if (/les\s*paul|เลสพอล/i.test(prompt)) guitarModel = 'gibson-les-paul';
  if (guitarModel) {
    song.guitarModel = guitarModel;
    actions.push(`รุ่นกีตาร์หลัก -> ${guitarModel}`);
  }

  // 5. 3D Room Ambience
  let ambience: Ambience3DMode | undefined;
  if (/ห้องนั่งเล่น|living[\s-]?room|intimate/i.test(prompt)) ambience = 'living-room';
  else if (/ห้องไม้|wood[\s-]?studio|สตูดิโอ/i.test(prompt)) ambience = 'wood-studio';
  else if (/ฮอลล์|hall|คอนเสิร์ต|unplugged|ก้องกว้าง/i.test(prompt)) ambience = 'unplugged-hall';
  if (ambience) {
    song.ambience3D = ambience;
    actions.push(`มิติห้อง (3D Room) -> ${ambience}`);
  }
}

function detectTargetSections(clause: string, sections: SongSection[]): SongSection[] {
  const matched: SongSection[] = [];
  for (const pat of SECTION_TYPE_PATTERNS) {
    if (pat.regex.test(clause)) {
      for (const sec of sections) {
        if (sec.type === pat.type || pat.regex.test(sec.name)) {
          if (!matched.includes(sec)) matched.push(sec);
        }
      }
    }
  }
  return matched;
}

/**
 * ตีความคำสั่งภาษาธรรมชาติ (ไทย/อังกฤษ) แล้วแปลงเป็นการตั้งค่าทั้งหมดของ SongProject
 */
export function applyNaturalPromptToSong(prompt: string, currentSong: SongProject): AiDirectorResult {
  const trimmed = prompt.trim();
  const updatedSong = cloneSong(currentSong);
  const actions: string[] = [];

  if (!trimmed) {
    return { updatedSong, summaryActions: [] };
  }

  applyGlobalSettings(trimmed, updatedSong, actions);

  const clauses = splitIntoClauses(trimmed);
  for (const clause of clauses) {
    const targetedSections = detectTargetSections(clause, updatedSong.sections);
    const applyTo = targetedSections.length > 0 ? targetedSections : updatedSong.sections;

    // 1. Chord progression override if explicitly requested
    const chords = extractChordsFromText(clause);
    if (chords.length > 0) {
      for (const sec of applyTo) {
        sec.bars.forEach((bar, idx) => {
          bar.chords = [chords[idx % chords.length]];
          bar.chordsPerBar = 1;
        });
      }
      const scopeLabel = targetedSections.length > 0 ? targetedSections.map((s) => s.name).join(', ') : 'ทั้งเพลง';
      actions.push(`[${scopeLabel}] คอร์ด -> ${chords.join(' - ')}`);
    }

    // 2. Intensity cues per targeted section
    if (targetedSections.length > 0) {
      if (/เบา|ละมุน|ชิล|แผ่ว|low/i.test(clause) && !/\d+%/.test(clause)) {
        targetedSections.forEach((s) => {
          s.intensity = 'low';
        });
      } else if (/พีค|จัดเต็ม|เดือด|มันส์|high|climax/i.test(clause)) {
        targetedSections.forEach((s) => {
          s.intensity = 'high';
        });
      }
    }

    // 3. Per-instrument ON/OFF, styles, drive, volumes
    const chunks = splitInstrumentChunks(clause);
    for (const chunk of chunks) {
      for (const sec of applyTo) {
        applyInstrumentDirectives(sec.instruments, chunk.key, chunk.text, sec.name, actions);
      }
    }
  }

  return {
    updatedSong,
    summaryActions: Array.from(new Set(actions)),
  };
}

export interface AiDirectorSectionPatch {
  sectionId?: string;
  sectionType?: SectionType;
  intensity?: 'low' | 'medium' | 'high';
  guitarRhythm?: boolean;
  guitarLead?: boolean;
  bass?: boolean;
  piano?: boolean;
  drums?: boolean;
  guitarRhythmStyle?: GuitarStyle;
  guitarLeadStyle?: LeadGuitarStyle;
  guitarLeadDrive?: LeadGuitarDrive;
  bassStyle?: BassStyle;
  pianoStyle?: PianoStyle;
  drumsStyle?: DrumStyle;
  guitarRhythmVolume?: number;
  guitarLeadVolume?: number;
  bassVolume?: number;
  pianoVolume?: number;
  drumsVolume?: number;
  chords?: string[];
}

export interface AiDirectorPatch {
  bpm?: number;
  baseKey?: string;
  timeSignature?: TimeSignature;
  guitarModel?: GuitarModel;
  ambience3D?: Ambience3DMode;
  sectionPatches?: AiDirectorSectionPatch[];
  summaryNotes?: string[];
}

export interface AiDirectorSongSummary {
  bpm: number;
  baseKey: string;
  timeSignature: TimeSignature;
  guitarModel: GuitarModel;
  ambience3D: Ambience3DMode;
  sections: Array<{
    id: string;
    name: string;
    type: SectionType;
    intensity: 'low' | 'medium' | 'high';
    barCount: number;
    sampleChords: string[];
    instruments: SectionInstruments;
  }>;
}

const VALID_TIME_SIGNATURES = new Set<TimeSignature>(['4/4', '3/4', '6/8']);
const VALID_GUITAR_MODELS = new Set<GuitarModel>([
  'classical-nylon',
  'dreadnought-steel',
  'ovation-roundback',
  'gibson-les-paul',
]);
const VALID_AMBIENCES = new Set<Ambience3DMode>(['living-room', 'wood-studio', 'unplugged-hall']);
const VALID_INTENSITIES = new Set(['low', 'medium', 'high']);
const VALID_RHYTHM_STYLES = new Set<GuitarStyle>(['campfire-strum', 'soft-strum', 'fingerpicking']);
const VALID_LEAD_STYLES = new Set<LeadGuitarStyle>(['melodic-solo', 'riff-fills', 'soft-arpeggio']);
const VALID_LEAD_DRIVES = new Set<LeadGuitarDrive>(['clean', 'crunch', 'overdrive', 'distortion', 'fuzz']);
const VALID_BASS_STYLES = new Set<BassStyle>(['root-fifth', 'warm-sustain']);
const VALID_PIANO_STYLES = new Set<PianoStyle>(['warm-pad', 'gentle-arpeggio']);
const VALID_DRUM_STYLES = new Set<DrumStyle>(['off', 'shaker-cajon', 'simple-kit']);

const TRACK_KEYS: readonly InstrumentKey[] = ['guitarRhythm', 'guitarLead', 'bass', 'piano', 'drums'];
const VOLUME_FIELDS: Record<InstrumentKey, keyof SectionInstruments> = {
  guitarRhythm: 'guitarRhythmVolume',
  guitarLead: 'guitarLeadVolume',
  bass: 'bassVolume',
  piano: 'pianoVolume',
  drums: 'drumsVolume',
};

/** สร้างข้อมูลสรุปขนาดกะทัดรัดของ SongProject เพื่อส่งให้ Gemini 4 Hydrogen ประมวลผลประหยัด Token */
export function buildSongDirectorSummary(song: SongProject): AiDirectorSongSummary {
  return {
    bpm: song.bpm,
    baseKey: song.baseKey,
    timeSignature: song.timeSignature,
    guitarModel: song.guitarModel,
    ambience3D: song.ambience3D,
    sections: song.sections.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      intensity: s.intensity,
      barCount: s.bars.length,
      sampleChords: s.bars.slice(0, 4).map((b) => b.chords.join('/')),
      instruments: { ...s.instruments },
    })),
  };
}

/** นำ Patch JSON ที่ได้จาก Gemini 4 Hydrogen มาตรวจสอบความถูกต้องแล้วอัปเดตลงใน SongProject */
export function applyDirectorPatchToSong(
  patch: AiDirectorPatch,
  currentSong: SongProject
): AiDirectorResult {
  const updatedSong = cloneSong(currentSong);
  const actions: string[] = [];

  if (typeof patch.bpm === 'number' && Number.isFinite(patch.bpm)) {
    const nextBpm = clamp(Math.round(patch.bpm), 40, 220);
    if (nextBpm !== updatedSong.bpm) {
      updatedSong.bpm = nextBpm;
      actions.push(`ความเร็ว (BPM) -> ${nextBpm}`);
    }
  }

  if (typeof patch.baseKey === 'string') {
    const k = patch.baseKey.trim();
    if (/^[A-G][#b]?m?$/.test(k)) {
      updatedSong.baseKey = k;
      actions.push(`คีย์เพลง -> ${k}`);
    }
  }

  if (patch.timeSignature && VALID_TIME_SIGNATURES.has(patch.timeSignature)) {
    updatedSong.timeSignature = patch.timeSignature;
    actions.push(`จังหวะ -> ${patch.timeSignature}`);
  }

  if (patch.guitarModel && VALID_GUITAR_MODELS.has(patch.guitarModel)) {
    updatedSong.guitarModel = patch.guitarModel;
    actions.push(`รุ่นกีตาร์หลัก -> ${patch.guitarModel}`);
  }

  if (patch.ambience3D && VALID_AMBIENCES.has(patch.ambience3D)) {
    updatedSong.ambience3D = patch.ambience3D;
    actions.push(`มิติห้อง (3D Room) -> ${patch.ambience3D}`);
  }

  if (Array.isArray(patch.sectionPatches)) {
    for (const sp of patch.sectionPatches) {
      if (!sp || typeof sp !== 'object') continue;
      let targets = updatedSong.sections;
      if (sp.sectionId) {
        targets = updatedSong.sections.filter((s) => s.id === sp.sectionId);
      } else if (sp.sectionType) {
        targets = updatedSong.sections.filter((s) => s.type === sp.sectionType);
      }
      if (targets.length === 0) continue;

      for (const sec of targets) {
        if (sp.intensity && VALID_INTENSITIES.has(sp.intensity)) {
          sec.intensity = sp.intensity;
          actions.push(`[${sec.name}] ความหนักแน่น -> ${sp.intensity}`);
        }

        for (const tk of TRACK_KEYS) {
          const boolVal = sp[tk];
          if (typeof boolVal === 'boolean') {
            sec.instruments[tk] = boolVal;
            actions.push(`[${sec.name}] ${boolVal ? 'เปิด' : 'ปิด'} ${tk}`);
          }
          const volField = VOLUME_FIELDS[tk];
          const volVal = sp[volField as keyof AiDirectorSectionPatch];
          if (typeof volVal === 'number' && Number.isFinite(volVal)) {
            const clampedVol = clamp(Math.round(volVal), 0, 100);
            (sec.instruments as unknown as Record<string, number>)[volField] = clampedVol;
            if (clampedVol > 0 && typeof boolVal !== 'boolean') {
              sec.instruments[tk] = true;
            }
            actions.push(`[${sec.name}] ความดัง ${tk} -> ${clampedVol}%`);
          }
        }

        if (sp.guitarRhythmStyle && VALID_RHYTHM_STYLES.has(sp.guitarRhythmStyle)) {
          sec.instruments.guitarRhythm = true;
          sec.instruments.guitarRhythmStyle = sp.guitarRhythmStyle;
          actions.push(`[${sec.name}] กีตาร์คอร์ด -> ${sp.guitarRhythmStyle}`);
        }
        if (sp.guitarLeadStyle && VALID_LEAD_STYLES.has(sp.guitarLeadStyle)) {
          sec.instruments.guitarLead = true;
          sec.instruments.guitarLeadStyle = sp.guitarLeadStyle;
          actions.push(`[${sec.name}] ลีดสไตล์ -> ${sp.guitarLeadStyle}`);
        }
        if (sp.guitarLeadDrive && VALID_LEAD_DRIVES.has(sp.guitarLeadDrive)) {
          const normalized = sp.guitarLeadDrive === 'fuzz' ? 'distortion' : sp.guitarLeadDrive;
          sec.instruments.guitarLead = true;
          sec.instruments.guitarLeadDrive = normalized;
          actions.push(`[${sec.name}] โทนลีด -> ${normalized}`);
        }
        if (sp.bassStyle && VALID_BASS_STYLES.has(sp.bassStyle)) {
          sec.instruments.bass = true;
          sec.instruments.bassStyle = sp.bassStyle;
          actions.push(`[${sec.name}] เบส -> ${sp.bassStyle}`);
        }
        if (sp.pianoStyle && VALID_PIANO_STYLES.has(sp.pianoStyle)) {
          sec.instruments.piano = true;
          sec.instruments.pianoStyle = sp.pianoStyle;
          actions.push(`[${sec.name}] เปียโน -> ${sp.pianoStyle}`);
        }
        if (sp.drumsStyle && VALID_DRUM_STYLES.has(sp.drumsStyle)) {
          if (sp.drumsStyle !== 'off') sec.instruments.drums = true;
          sec.instruments.drumsStyle = sp.drumsStyle;
          actions.push(`[${sec.name}] กลอง -> ${sp.drumsStyle}`);
        }

        if (Array.isArray(sp.chords) && sp.chords.length > 0) {
          const validChords = sp.chords
            .filter((c): c is string => typeof c === 'string')
            .map((c) => c.trim())
            .filter((c) => CHORD_TOKEN_REGEX.test(c));
          if (validChords.length > 0) {
            sec.bars.forEach((bar, idx) => {
              bar.chords = [validChords[idx % validChords.length]];
              bar.chordsPerBar = 1;
            });
            actions.push(`[${sec.name}] คอร์ด -> ${validChords.join(' - ')}`);
          }
        }
      }
    }
  }

  const finalNotes =
    Array.isArray(patch.summaryNotes) && patch.summaryNotes.length > 0 && actions.length > 0
      ? patch.summaryNotes.filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
      : actions;

  return {
    updatedSong,
    summaryActions: Array.from(new Set(finalNotes.length > 0 ? finalNotes : actions)),
  };
}
