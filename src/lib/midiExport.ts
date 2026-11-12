/**
 * midiExport.ts — ตัวแปลงโครงสร้างเพลงเป็นไฟล์ Standard MIDI File (SMF Format 1)
 *
 * ทำงาน 100% ในเบราว์เซอร์ด้วย Pure TypeScript ไม่ต้องใช้ไลบรารีภายนอก
 *
 * โครงสร้าง 5 Tracks:
 *   Track 0: Conductor (Tempo, Time Signature, Key Signature, Markers)
 *   Track 1: Rhythm Guitar (Ch. 1, Patch 25 = Acoustic Steel)
 *   Track 2: Lead Guitar   (Ch. 2, Patch 29 = Overdriven Guitar)
 *   Track 3: Bass          (Ch. 3, Patch 32 = Acoustic Bass)
 *   Track 4: Piano         (Ch. 4, Patch 0  = Acoustic Grand Piano)
 *   Track 5: Drums         (Ch. 10 / GM Percussion Map)
 */

import type { SongProject } from '../types/song';
import { planBar, flattenSong, getTiming, type TrackId, type DrumVoice } from './barPlanner';

const TICKS_PER_BEAT = 480;

/** แปลงตัวเลขเป็น Variable Length Quantity (VLQ) ตามสเปก MIDI */
function writeVLQ(value: number): number[] {
  let buffer = value & 0x7f;
  const bytes: number[] = [];
  while ((value >>= 7)) {
    buffer <<= 8;
    buffer |= (value & 0x7f) | 0x80;
  }
  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) buffer >>= 8;
    else break;
  }
  return bytes;
}

/** แปลงสตริงเป็น ASCII bytes */
function strToBytes(str: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    bytes.push(str.charCodeAt(i) & 0x7f);
  }
  return bytes;
}

/** แมป DrumVoice ของเราเป็น General MIDI Drum Note บน Channel 10 */
const GM_DRUM_MAP: Record<DrumVoice, number> = {
  kick: 36,       // Bass Drum 1
  cajonThump: 35, // Acoustic Bass Drum (เนื้อลึก)
  snare: 38,      // Acoustic Snare
  cajonSlap: 40,  // Electric Snare (แปร๊ดแหลมสไตล์สแลปคาฮอง)
  hat: 42,        // Closed Hi-Hat
  crash: 49,      // Crash Cymbal 1
  shaker: 69,     // Cabasa / Shaker
  click: 76,      // Hi Wood Block / Click
};

interface MidiNoteEvent {
  tick: number;
  type: 'on' | 'off';
  channel: number;
  pitch: number;
  velocity: number;
}

/** สร้าง Track Data ของ MIDI File */
function buildMidiTrack(events: MidiNoteEvent[], trackName: string, program: number): Uint8Array {
  // เรียงลำดับตาม Tick (ถ้าเวลาเท่ากัน Note Off เกิดก่อน Note On)
  events.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    if (a.type !== b.type) return a.type === 'off' ? -1 : 1;
    return a.pitch - b.pitch;
  });

  const bytes: number[] = [];

  // Track Name Meta Event
  const nameBytes = strToBytes(trackName);
  bytes.push(...writeVLQ(0), 0xff, 0x03, ...writeVLQ(nameBytes.length), ...nameBytes);

  // Program Change Event (ถ้าไม่ใช่ Channel 9/Drums)
  const channel = events.length > 0 ? events[0].channel : 0;
  if (channel !== 9) {
    bytes.push(...writeVLQ(0), 0xc0 | channel, program);
  }

  let lastTick = 0;
  for (const ev of events) {
    const delta = Math.max(0, ev.tick - lastTick);
    lastTick = ev.tick;

    bytes.push(...writeVLQ(delta));
    if (ev.type === 'on') {
      bytes.push(0x90 | ev.channel, Math.max(1, Math.min(127, ev.pitch)), Math.max(1, Math.min(127, ev.velocity)));
    } else {
      bytes.push(0x80 | ev.channel, Math.max(1, Math.min(127, ev.pitch)), 0);
    }
  }

  // End of Track Meta Event
  bytes.push(...writeVLQ(0), 0xff, 0x2f, 0x00);

  // ห่อหุ้ม Track Chunk Header (MTrk + 4-byte Length)
  const header = [
    0x4d, 0x54, 0x72, 0x6b, // 'MTrk'
    (bytes.length >> 24) & 0xff,
    (bytes.length >> 16) & 0xff,
    (bytes.length >> 8) & 0xff,
    bytes.length & 0xff,
  ];

  return new Uint8Array([...header, ...bytes]);
}

/** สร้าง Conductor Track (Tempo & Time Signature) */
function buildConductorTrack(song: SongProject): Uint8Array {
  const bytes: number[] = [];

  // Song Title
  const titleBytes = strToBytes(song.title || 'Demo Maker Easy');
  bytes.push(...writeVLQ(0), 0xff, 0x03, ...writeVLQ(titleBytes.length), ...titleBytes);

  // Time Signature: nn/2^dd, cc ticks per metronome click, bb 32nd notes per 24 MIDI clocks
  const [num, den] = song.timeSignature.split('/').map(Number);
  const denPower = Math.round(Math.log2(den || 4));
  bytes.push(...writeVLQ(0), 0xff, 0x58, 0x04, num || 4, denPower, 24, 8);

  // Set Tempo: Microseconds per quarter note = 60,000,000 / BPM
  const mpqn = Math.round(60000000 / (song.bpm || 74));
  bytes.push(...writeVLQ(0), 0xff, 0x51, 0x03, (mpqn >> 16) & 0xff, (mpqn >> 8) & 0xff, mpqn & 0xff);

  // End of Track
  bytes.push(...writeVLQ(0), 0xff, 0x2f, 0x00);

  const header = [
    0x4d, 0x54, 0x72, 0x6b,
    (bytes.length >> 24) & 0xff,
    (bytes.length >> 16) & 0xff,
    (bytes.length >> 8) & 0xff,
    bytes.length & 0xff,
  ];

  return new Uint8Array([...header, ...bytes]);
}

/** สร้างและคืนค่า Uint8Array ของไฟล์ .MID ทั้งเพลง */
export function generateMidiFile(song: SongProject): Uint8Array {
  const flat = flattenSong(song);
  const timing = getTiming(song);
  const secondsPerBeat = 60 / song.bpm;

  const trackEvents: Record<TrackId, MidiNoteEvent[]> = {
    guitarRhythm: [],
    guitarLead: [],
    bass: [],
    piano: [],
    drums: [],
    melody: [],
  };

  const channelMap: Record<TrackId, number> = {
    guitarRhythm: 0,
    guitarLead: 1,
    bass: 2,
    piano: 3,
    drums: 9, // Channel 10 ใน MIDI
    melody: 4, // Channel 5 ใน MIDI (Melody Guide)
  };

  // วนลูปวางแผนทีละห้องตาม barPlanner
  let barStartSec = 0;
  for (let barIdx = 0; barIdx < flat.length; barIdx++) {
    const planned = planBar(song, flat, barIdx);

    for (const ev of planned.events) {
      if (ev.kind === 'note') {
        const absTime = barStartSec + ev.t;
        const tickOn = Math.round((absTime / secondsPerBeat) * TICKS_PER_BEAT);
        const tickOff = Math.round(((absTime + ev.dur) / secondsPerBeat) * TICKS_PER_BEAT);
        const ch = channelMap[ev.track];

        trackEvents[ev.track].push(
          { tick: tickOn, type: 'on', channel: ch, pitch: ev.midi, velocity: ev.vel },
          { tick: tickOff, type: 'off', channel: ch, pitch: ev.midi, velocity: 0 }
        );
      } else if (ev.kind === 'drum') {
        const absTime = barStartSec + ev.t;
        const tickOn = Math.round((absTime / secondsPerBeat) * TICKS_PER_BEAT);
        const tickOff = tickOn + 120; // 1/16 beat duration for drum hit
        const pitch = GM_DRUM_MAP[ev.voice] || 38;

        trackEvents.drums.push(
          { tick: tickOn, type: 'on', channel: 9, pitch, velocity: ev.vel },
          { tick: tickOff, type: 'off', channel: 9, pitch, velocity: 0 }
        );
      }
    }

    barStartSec += timing.barSec;
  }

  // สร้าง Track Chunks
  const conductor = buildConductorTrack(song);
  const leadProgram = song.mixer.guitarLead.drive === 'clean' ? 27 : 29; // 27=Clean Electric, 29=Overdriven
  const melodyProgram = song.mixer.melody?.sound === 'piano' ? 0 : song.mixer.melody?.sound === 'bell' ? 14 : 73; // 73=Flute, 14=Tubular Bells, 0=Piano

  const tracks: Uint8Array[] = [
    conductor,
    buildMidiTrack(trackEvents.guitarRhythm, 'Rhythm Guitar', 25), // Steel Acoustic
    buildMidiTrack(trackEvents.guitarLead, 'Lead Guitar (Les Paul)', leadProgram),
    buildMidiTrack(trackEvents.bass, 'Acoustic Bass', 32),
    buildMidiTrack(trackEvents.piano, 'Acoustic Piano', 0),
    buildMidiTrack(trackEvents.drums, 'Acoustic Percussion / Cajon', 0),
  ];

  // ถ้ามีโน้ต melody อย่างน้อย 1 โน้ต ให้ใส่ Track 6 Melody Guide
  if (trackEvents.melody.length > 0) {
    tracks.push(buildMidiTrack(trackEvents.melody, 'Melody Guide (Vocal)', melodyProgram));
  }

  // MIDI Header Chunk (MThd): Type 1, 6 tracks, TICKS_PER_BEAT
  const numTracks = tracks.length;
  const header = new Uint8Array([
    0x4d, 0x54, 0x68, 0x64, // 'MThd'
    0x00, 0x00, 0x00, 0x06, // length = 6
    0x00, 0x01,             // Format = 1 (Multi-track)
    (numTracks >> 8) & 0xff, numTracks & 0xff,
    (TICKS_PER_BEAT >> 8) & 0xff, TICKS_PER_BEAT & 0xff,
  ]);

  // รวมทุก chunks เข้าด้วยกัน
  const totalLength = header.length + tracks.reduce((acc, t) => acc + t.length, 0);
  const out = new Uint8Array(totalLength);
  let offset = 0;
  out.set(header, offset);
  offset += header.length;

  for (const tr of tracks) {
    out.set(tr, offset);
    offset += tr.length;
  }

  return out;
}

/** ดาวน์โหลดไฟล์ .MID ลงเครื่องทันที */
export function downloadMidiFile(song: SongProject): void {
  if (typeof window === 'undefined') return;
  const midiBytes = generateMidiFile(song);
  const blob = new Blob([midiBytes.buffer as ArrayBuffer], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeTitle = (song.title || 'song').replace(/[^a-zA-Z0-9_\u0E00-\u0E7F-]/g, '_');
  a.download = `${safeTitle}.mid`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
