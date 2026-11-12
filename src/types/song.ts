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

export type GuitarStyle = 'campfire-strum' | 'soft-strum' | 'fingerpicking';
export type LeadGuitarStyle = 'melodic-solo' | 'riff-fills' | 'soft-arpeggio';
export type LeadGuitarDrive = 'clean' | 'crunch' | 'overdrive' | 'distortion';
export type BassStyle = 'root-fifth' | 'warm-sustain';
export type PianoStyle = 'warm-pad' | 'gentle-arpeggio';
export type DrumStyle = 'off' | 'shaker-cajon' | 'simple-kit';
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

export interface InstrumentMixerConfig {
  guitarRhythm: { enabled: boolean; volume: number; style: GuitarStyle; model: GuitarModel };
  guitarLead:   { enabled: boolean; volume: number; style: LeadGuitarStyle; model: GuitarModel; drive?: LeadGuitarDrive };
  bass:         { enabled: boolean; volume: number; style: BassStyle };
  piano:        { enabled: boolean; volume: number; style: PianoStyle };
  drums:        { enabled: boolean; volume: number; style: DrumStyle };
  melody?:      { enabled: boolean; volume: number; sound?: MelodySound };
  vocal?:       { enabled: boolean; volume: number };
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
  vocalLatencyOffsetMs?: number;       // -150 ถึง +150 ms สำหรับเฟส 2B
}
