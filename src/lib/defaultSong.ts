import { SongProject } from '@/types/song';

let nextId = 100;
function uid(prefix: string) {
  return `${prefix}-${nextId++}`;
}

export function createDefaultSong(): SongProject {
  return {
    id: 'demo-song-1',
    version: 1,
    title: 'เพลงรักริมระเบียง (Demo #1)',
    updatedAt: '2026-11-12T00:00:00.000Z',
    bpm: 74,
    timeSignature: '4/4',
    baseKey: 'C',
    transposeSemitones: 0,
    capoFret: 0,
    countInEnabled: true,
    guitarModel: 'dreadnought-steel',
    stringGauge: 'heavy-012',
    ambience3D: 'wood-studio',
    mixer: {
      guitarRhythm: { enabled: true, volume: 85, style: 'campfire-strum', model: 'dreadnought-steel' },
      guitarLead:   { enabled: true, volume: 80, style: 'melodic-solo', model: 'gibson-les-paul', drive: 'overdrive' },
      bass:         { enabled: true, volume: 70, style: 'root-fifth' },
      piano:        { enabled: true, volume: 55, style: 'warm-pad' },
      drums:        { enabled: true, volume: 65, style: 'shaker-cajon' },
      melody:       { enabled: true, volume: 85, sound: 'flute' }
    },
    sections: [
      {
        id: uid('sec'),
        name: 'Intro (เกริ่นนำ)',
        type: 'intro',
        intensity: 'low',
        instruments: {
          guitarRhythm: true,
          guitarRhythmStyle: 'fingerpicking',
          guitarLead: false,
          bass: false,
          piano: false,
          drums: false,
        },
        bars: [
          { id: uid('bar'), chordsPerBar: 1, chords: ['C'], playStyle: 'normal', lyrics: '(กีตาร์โปร่งเกาสายเบาๆ)', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 1, chords: ['Fmaj7'], playStyle: 'normal', lyrics: '(เริ่มมีเสียงเปียโนคลอ)', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 1, chords: ['Am7'], playStyle: 'normal', lyrics: '(เพิ่มเสียง Shaker)', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 1, chords: ['G'], playStyle: 'let-ring', lyrics: '(ดีดค้างคอร์ดส่งเข้าท่อนร้อง)', melodyNotes: [] }
        ]
      },
      {
        id: uid('sec'),
        name: 'Verse 1 (ท่อนร้อง 1)',
        type: 'verse',
        intensity: 'low',
        instruments: {
          guitarRhythm: true,
          guitarRhythmStyle: 'fingerpicking',
          guitarLead: false,
          bass: true,
          bassStyle: 'root-fifth',
          piano: false,
          drums: false,
        },
        bars: [
          { id: uid('bar'), chordsPerBar: 1, chords: ['C'], playStyle: 'normal', lyrics: 'ลมหนาวพัดมาเบาๆ...', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 1, chords: ['Fmaj7'], playStyle: 'normal', lyrics: 'นั่งมองดาวบนระเบียงไม้', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 1, chords: ['Am7'], playStyle: 'normal', lyrics: 'หยิบกีตาร์ตัวเก่าขึ้นมา', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 1, chords: ['G'], playStyle: 'normal', lyrics: 'ส่งใจไปหาเธอไกลแสนไกล', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 1, chords: ['C'], playStyle: 'normal', lyrics: 'นึกถึงรอยยิ้มวันวาน', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 1, chords: ['Fmaj7'], playStyle: 'normal', lyrics: 'ที่เธอเคยให้ไว้ตรงนี้', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 1, chords: ['Am7'], playStyle: 'normal', lyrics: 'ยังอบอุ่นในใจทุกนาที', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 1, chords: ['G'], playStyle: 'let-ring', lyrics: 'ไม่เคยจางหายไปเลยสักวัน', melodyNotes: [] }
        ]
      },
      {
        id: uid('sec'),
        name: 'Pre-Chorus (ท่อนส่ง)',
        type: 'pre-chorus',
        intensity: 'medium',
        instruments: {
          guitarRhythm: true,
          guitarRhythmStyle: 'soft-strum',
          guitarLead: false,
          bass: true,
          bassStyle: 'root-fifth',
          piano: true,
          pianoStyle: 'warm-pad',
          drums: false,
        },
        bars: [
          { id: uid('bar'), chordsPerBar: 1, chords: ['Dm'], playStyle: 'normal', lyrics: 'แม้คืนนี้จะเหงาจับใจ', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 1, chords: ['Em'], playStyle: 'normal', lyrics: 'แต่ใจฉันยังคงเฝ้ารอ', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 1, chords: ['F'], playStyle: 'normal', lyrics: 'วันที่สองเราจะได้พบกัน', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 1, chords: ['G'], playStyle: 'let-ring', lyrics: 'พร้อมคำนี้ที่อยากบอกเธอ...', melodyNotes: [] }
        ]
      },
      {
        id: uid('sec'),
        name: 'Chorus (ท่อนฮุก)',
        type: 'chorus',
        intensity: 'high',
        instruments: {
          guitarRhythm: true,
          guitarRhythmStyle: 'campfire-strum',
          guitarLead: true,
          guitarLeadStyle: 'riff-fills',
          guitarLeadDrive: 'crunch',
          bass: true,
          bassStyle: 'root-fifth',
          piano: true,
          pianoStyle: 'warm-pad',
          drums: true,
          drumsStyle: 'shaker-cajon',
        },
        bars: [
          { id: uid('bar'), chordsPerBar: 2, chords: ['C', 'G'], playStyle: 'normal', lyrics: 'อยากบอกว่ารักเธอเหมือนวันวาน', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 2, chords: ['Am', 'F'], playStyle: 'normal', lyrics: 'ไม่ว่าเวลาจะผ่านไปนานเท่าไร', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 2, chords: ['C', 'G'], playStyle: 'normal', lyrics: 'ดวงใจดวงนี้ยังมีแต่เธอเสมอไป', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 2, chords: ['F', 'G'], playStyle: 'normal', lyrics: 'ตราบลมหายใจยังคงมีเธอข้างกาย', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 2, chords: ['C', 'G'], playStyle: 'normal', lyrics: 'กอดเธอไว้ในความฝันทุกคืน', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 2, chords: ['Am', 'F'], playStyle: 'normal', lyrics: 'ตื่นขึ้นมาก็ยังคิดถึงเธอ', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 2, chords: ['C', 'G'], playStyle: 'normal', lyrics: 'คนเดียวคนนี้ที่ใจพร่ำเพ้อ', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 2, chords: ['F', 'G'], playStyle: 'let-ring', lyrics: 'รักเธอ... คนนี้ตลอดไป', melodyNotes: [] }
        ]
      },
      {
        id: uid('sec'),
        name: 'Guitar Solo (ท่อนโซโล่)',
        type: 'solo',
        intensity: 'high',
        soloMode: 'split-slow-fast',
        instruments: {
          guitarRhythm: true,
          guitarRhythmStyle: 'campfire-strum',
          guitarLead: true,
          guitarLeadStyle: 'melodic-solo',
          guitarLeadDrive: 'overdrive',
          bass: true,
          bassStyle: 'root-fifth',
          piano: true,
          pianoStyle: 'warm-pad',
          drums: true,
          drumsStyle: 'shaker-cajon',
        },
        bars: [
          { id: uid('bar'), chordsPerBar: 1, chords: ['Fmaj7'], playStyle: 'normal', lyrics: '(โซโล่ช้า: Gibson Les Paul ล้อทำนองหวานๆ)', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 1, chords: ['Em7'], playStyle: 'normal', lyrics: '(ดันสายค้าง Sustain นุ่มหนา)', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 1, chords: ['Dm7'], playStyle: 'normal', lyrics: '(ค่อยๆ เติมโน้ตเขบ็ต 1 ชั้น)', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 1, chords: ['G'], playStyle: 'normal', lyrics: '(ส่งจังหวะเข้าครึ่งหลัง)', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 1, chords: ['Fmaj7'], playStyle: 'normal', lyrics: '(โซโล่เร็ว: Les Paul ปล่อยลูกโซโล่พีคสะกดอารมณ์)', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 1, chords: ['Em7'], playStyle: 'normal', lyrics: '(โน้ตเขบ็ต 2 ชั้น วิ่งเมโลดี้เฉียบคม)', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 1, chords: ['Dm7'], playStyle: 'normal', lyrics: '(ส่งคอร์ดเตรียมเข้าท่อนบริดจ์)', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 1, chords: ['G'], playStyle: 'let-ring', lyrics: '(ดีดค้างกังวาน ปล่อยเสียงลอย)', melodyNotes: [] }
        ]
      },
      {
        id: uid('sec'),
        name: 'Bridge (ท่อนเชื่อม)',
        type: 'bridge',
        intensity: 'medium',
        instruments: {
          guitarRhythm: true,
          guitarRhythmStyle: 'soft-strum',
          guitarLead: false,
          bass: true,
          bassStyle: 'warm-sustain',
          piano: true,
          pianoStyle: 'gentle-arpeggio',
          drums: false,
        },
        bars: [
          { id: uid('bar'), chordsPerBar: 1, chords: ['Am'], playStyle: 'normal', lyrics: 'ต่อให้ระยะทางจะไกลแค่ไหน', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 1, chords: ['Em'], playStyle: 'normal', lyrics: 'หัวใจไม่เคยมีใครแทนที่เธอ', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 1, chords: ['F'], playStyle: 'normal', lyrics: 'สัญญาว่าจะรักเพียงแต่เธอ', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 1, chords: ['G'], playStyle: 'let-ring', lyrics: 'จนกว่าดาวบนฟ้าจะลับตา...', melodyNotes: [] }
        ]
      },
      {
        id: uid('sec'),
        name: 'Chorus สุดท้าย (จุดพีค)',
        type: 'chorus',
        intensity: 'high',
        instruments: {
          guitarRhythm: true,
          guitarRhythmStyle: 'campfire-strum',
          guitarLead: true,
          guitarLeadStyle: 'riff-fills',
          guitarLeadDrive: 'crunch',
          bass: true,
          bassStyle: 'root-fifth',
          piano: true,
          pianoStyle: 'warm-pad',
          drums: true,
          drumsStyle: 'shaker-cajon',
        },
        bars: [
          { id: uid('bar'), chordsPerBar: 2, chords: ['C', 'G'], playStyle: 'normal', lyrics: 'อยากบอกว่ารักเธอเหมือนวันวาน', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 2, chords: ['Am', 'F'], playStyle: 'normal', lyrics: 'ไม่ว่าเวลาจะผ่านไปนานเท่าไร', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 2, chords: ['C', 'G'], playStyle: 'normal', lyrics: 'ดวงใจดวงนี้ยังมีแต่เธอเสมอไป', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 2, chords: ['F', 'G'], playStyle: 'let-ring', lyrics: 'รักเธอคนนี้... ตลอดไป', melodyNotes: [] }
        ]
      },
      {
        id: uid('sec'),
        name: 'Outro (จบท้าย)',
        type: 'outro',
        intensity: 'low',
        instruments: {
          guitarRhythm: true,
          guitarRhythmStyle: 'fingerpicking',
          guitarLead: true,
          guitarLeadStyle: 'soft-arpeggio',
          bass: false,
          piano: false,
          drums: false,
        },
        bars: [
          { id: uid('bar'), chordsPerBar: 1, chords: ['C'], playStyle: 'normal', lyrics: '(กีตาร์เกาสายช้าลงเรื่อยๆ)', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 1, chords: ['Fmaj7'], playStyle: 'normal', lyrics: '(เสียงกระดิ่งลมแผ่วเบา)', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 1, chords: ['Am7'], playStyle: 'normal', lyrics: '(เสียงเบสค้างโน้ตต่ำ)', melodyNotes: [] },
          { id: uid('bar'), chordsPerBar: 1, chords: ['C'], playStyle: 'let-ring', lyrics: '(ดีดคอร์ด C ท้ายสุด ปล่อยเสียงกังวานจางหาย)', melodyNotes: [] }
        ]
      }
    ]
  };
}
