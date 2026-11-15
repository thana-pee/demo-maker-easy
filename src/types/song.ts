export type AppViewMode = 'songwriter' | 'arranger' | 'karaoke';
export type SongStatusTag = 'draft' | 'arranged' | 'vocal-recorded' | 'mastered';

export type ThaiSongGenre =
  | 'thai-pop'
  | 'thai-rock'
  | 'phuea-chiwit'
  | 'luk-thung'
  | 'luk-krung'
  | 'acoustic-indie'
  | 'thai-rnb';

export type ThaiLyricEra = 'modern-indie' | 'era-80s' | 'era-90s' | 'era-2000s' | 'gen-z';

export type ThaiLyricDialect = 'standard' | 'northern' | 'isan' | 'suphan-central' | 'southern';

export type ThaiSongwriterStyle =
  | 'none'
  | 'boy-kosiyabong'
  | 'dee-nitipong'
  | 'seefa'
  | 'sek-loso'
  | 'suea-thanapol'
  | 'phaiboon-butkhan'
  | 'suraphon-sombatcharoen'
  | 'chali-intrawichit'
  | 'sala-khunawut'
  | 'chonlathi-thanthong'
  | 'wasu-haohan'
  | 'joey-boy'
  | 'stamp-apiwat'
  | 'the-toys'
  | 'tan-lipta'
  | 'aed-carabao'
  | 'asanee-chotikul'
  | 'nga-caravan'
  | 'kob-bigass';

export type ThaiEmotionalResolution =
  | 'auto'
  | 'piercing-sting'
  | 'fulfilling-warm'
  | 'empowering-anthem'
  | 'catchy-earworm'
  | 'nostalgic-fade';

export interface SongSnapshot {
  id: string;
  name: string;
  createdAt: string;
  songData: string; // JSON snapshot excluding snapshots/vocalAudio to stay lightweight
}
export type TimeSignature = '4/4' | '3/4' | '6/8';
export type SectionType = 'intro' | 'verse' | 'pre-chorus' | 'chorus' | 'solo' | 'bridge' | 'outro';
export type SectionIntensity = 'low' | 'medium' | 'high';
export type SoloMode = 'normal' | 'split-slow-fast';
export type BarPlayStyle = 'normal' | 'let-ring' | 'break';

export type GuitarModel =
  | 'classical-nylon'
  | 'dreadnought-steel'
  | 'ovation-roundback'
  | 'gibson-les-paul';

export type StringGauge = 'standard-010' | 'heavy-012';
export type Ambience3DMode = 'living-room' | 'wood-studio' | 'unplugged-hall';

export type GuitarStyle = 'campfire-strum' | 'soft-strum' | 'fingerpicking' | 'lukthung-bounce' | 'rock-power';
export type LeadGuitarStyle = 'melodic-solo' | 'riff-fills' | 'soft-arpeggio';
export type LeadGuitarDrive = 'clean' | 'crunch' | 'overdrive' | 'distortion' | 'fuzz';
export type BassStyle = 'root-fifth' | 'warm-sustain' | 'lukthung-groove' | 'rnb-syncopated';
export type PianoStyle = 'warm-pad' | 'gentle-arpeggio' | 'rnb-neo-chord' | 'rock-organ-pad';
export type DrumStyle = 'off' | 'shaker-cajon' | 'simple-kit' | 'lukthung-3cha' | 'rnb-pocket' | 'rock-drive';
export type MelodySound = 'flute' | 'piano' | 'bell';

export interface MelodyNote {
  step: number;       // ตำแหน่งเขบ็ตในห้อง (0 ถึง 7 หรือ 0 ถึง 15)
  midiPitch: number;  // เช่น 60 = C4
  durationSteps: number;
}

export interface SongBar {
  id: string;
  chordsPerBar: 1 | 2;
  chords: string[];                    // 1 หรือ 2 คอร์ดต่อห้อง (เก็บคอร์ดตาม Base Key)
  playStyle: BarPlayStyle;             // 'normal' | 'let-ring' | 'break'
  lyrics: string;                      // 1 ห้องต่อ 1 ช่องเนื้อร้องเสมอ
  melodyNotes: MelodyNote[];           // รองรับ Mini Piano Roll
  vocalAudio?: string;                 // Base64 Data URL สำหรับเสียงร้องประจำห้อง (Phase 2B)
}

export interface SectionInstruments {
  guitarRhythm: boolean;               // 🎸 กีตาร์คอร์ด (ริทึ่ม)
  guitarLead: boolean;                 // 🎸 กีตาร์ลีด / โซโล่ (เติมไลน์เมโลดี้)
  bass: boolean;                       // 🎻 เบส
  piano: boolean;                      // 🎹 เปียโน
  drums: boolean;                      // 🥁 เพอร์คัชชัน/กลอง

  // สไตล์/วิธีเล่นเฉพาะท่อนนี้ (Per-Section Playing Style Overrides)
  guitarRhythmStyle?: GuitarStyle;
  guitarLeadStyle?: LeadGuitarStyle;
  guitarLeadDrive?: LeadGuitarDrive;
  bassStyle?: BassStyle;
  pianoStyle?: PianoStyle;
  drumsStyle?: DrumStyle;

  // ความดังเฉพาะท่อนนี้ 0–100 (Per-Section Instrument Volume Overrides, default 100)
  guitarRhythmVolume?: number;
  guitarLeadVolume?: number;
  bassVolume?: number;
  pianoVolume?: number;
  drumsVolume?: number;
}

export interface SongSection {
  id: string;
  name: string;
  type: SectionType;
  intensity: SectionIntensity;
  soloMode?: SoloMode;
  instruments: SectionInstruments;     // กำหนดเครื่องดนตรีที่จะเล่นในท่อนนี้ (เปิด/ปิดอิสระ)
  bars: SongBar[];
}

export type VocalFxPreset = 'dry-natural' | 'studio-warm' | 'wide-chorus';

export interface VocalTake {
  id: string;
  name: string;
  scope: 'full-song' | 'section';
  source?: 'mic' | 'ai-tts';
  sectionId?: string;
  startGlobalBarIndex: number;
  endGlobalBarIndex?: number;
  preRollOffsetSec: number;
  latencyOffsetMs?: number;
  audioDataUrl?: string;
  fxPreset: VocalFxPreset;
  isActive: boolean;
  createdAt: string;
}

export interface InstrumentMixerConfig {
  guitarRhythm: { enabled: boolean; volume: number; style: GuitarStyle; model: GuitarModel };
  guitarLead:   { enabled: boolean; volume: number; style: LeadGuitarStyle; model: GuitarModel; drive?: LeadGuitarDrive };
  bass:         { enabled: boolean; volume: number; style: BassStyle };
  piano:        { enabled: boolean; volume: number; style: PianoStyle };
  drums:        { enabled: boolean; volume: number; style: DrumStyle };
  melody?:      { enabled: boolean; volume: number; sound?: MelodySound };
  vocal?:       { enabled: boolean; volume: number; fxPreset?: VocalFxPreset; autoDucking?: boolean };
}

export interface SongProject {
  id: string;
  version: number;                     // เริ่มที่ 1 สำหรับตรวจสอบความเข้ากันได้ของลิงก์แชร์
  title: string;
  updatedAt: string;
  bpm: number;                         // 50 - 160 (ค่าเริ่มต้น 74)
  timeSignature: TimeSignature;        // ค่าเริ่มต้น '4/4'
  baseKey: string;                     // ค่าเริ่มต้น 'C'
  transposeSemitones: number;          // -6 ถึง +6 (เปลี่ยนระดับเสียงจริง)
  capoFret: number;                    // 0 ถึง 7 (เปลี่ยนการแสดงผลฟอร์มคอร์ดสำหรับเล่นกีตาร์ตาม)
  countInEnabled: boolean;             // เปิด/ปิดเสียงเคาะนับเข้าเพลง 1 ห้อง
  guitarModel: GuitarModel;
  stringGauge: StringGauge;
  ambience3D: Ambience3DMode;
  mixer: InstrumentMixerConfig;
  sections: SongSection[];
  vocalLatencyOffsetMs?: number;       // -150 ถึง +250 ms สำหรับเฟส 2B / 5D
  vocalTakes?: VocalTake[];            // เทคเสียงร้องต่อเนื่องในบูธอัดเสียงจริง (Phase 5D)
  folder?: string;                     // ชื่อโฟลเดอร์/อัลบั้มสำหรับจัดหมวดหมู่เพลง (Phase 4C)
  statusTag?: SongStatusTag;           // สถานะของเพลงในเวิร์กโฟลว์ (Phase 4C)
  snapshots?: SongSnapshot[];          // ประวัติเวอร์ชัน (Version Snapshots) ของเพลง (Phase 4C)
  thaiGenre?: ThaiSongGenre;           // แนวเพลงไทย (ไทยป๊อป/ไทยร็อก/เพื่อชีวิต/ลูกทุ่ง/ลูกกรุง ฯลฯ)
  lyricEra?: ThaiLyricEra;             // ยุคสมัยของภาษาเพลง
  lyricDialect?: ThaiLyricDialect;     // กลิ่นอายภาษาถิ่น (กลาง/เหนือ/อีสาน/สุพรรณ/ใต้)
  songwriterStyle?: ThaiSongwriterStyle; // แรงบันดาลใจสไตล์นักแต่งเพลง
  emotionalResolution?: ThaiEmotionalResolution; // รูปแบบการปิดอารมณ์ท่อนจบ / พลังท่อนฮุค
  easyConfig?: {                       // ข้อมูลตั้งต้นจาก Easy Mode AI Architect (Phase 5B)
    stylePreset: string;
    vocalProfile: 'female' | 'male' | 'neutral';
    tempoFeel: 'slow' | 'medium' | 'fast';
    generatedAt?: string;
  };
}
