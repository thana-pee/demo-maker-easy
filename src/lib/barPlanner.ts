/**
 * barPlanner.ts — ตัววางแผน "ห้องเพลง → เหตุการณ์เสียง" (Pure / Deterministic)
 *
 * ไม่แตะ Web Audio เลย: รับ SongProject + ตำแหน่งห้อง แล้วคืนรายการเหตุการณ์
 * (โน้ต / กลอง / fade / restore) พร้อมเวลาสัมพัทธ์จากต้นห้อง (วินาที)
 *
 * ทำไมแยกออกมา:
 *  - ทดสอบอัตโนมัติได้โดยไม่ต้องมีเสียงจริง
 *  - ผล "ซ้ำได้เสมอ" (seeded random) → ฟังกี่รอบก็เหมือนเดิม และใช้ render MP3 ใน Phase 2B ได้ตรงกับที่ฟังสด
 *
 * ครอบคลุมสิ่งที่สัญญากับผู้ใช้:
 *  - Strum physics: หน่วงทีละสาย 18–32ms ตามทิศทางลง/ขึ้น + สุ่มน้ำหนักมือ
 *  - Let Ring / Break ประจำห้อง
 *  - เครื่องดนตรี + "วิธีเล่น" แยกตามท่อน
 *  - ลูกส่งก่อนเครื่องดนตรีเข้าท่อนใหม่ (กลอง crescendo, กีตาร์ลีด pickup)
 *  - ห้ามตัดหางเสียงดื้อๆ: เครื่องที่ออกจากท่อนถัดไปจะ ring-out + fade
 */

import type {
  SongProject,
  SongSection,
  SongBar,
  TimeSignature,
  GuitarStyle,
  LeadGuitarStyle,
  BassStyle,
  PianoStyle,
  DrumStyle,
} from '../types/song';
import { transposeChord } from './chordUtils';
import {
  getGuitarVoicing,
  parseChordSymbol,
  chordIntervals,
  type ParsedChord,
  type GuitarVoicing,
} from './guitarVoicings';

// ───────────────────────────── Types ─────────────────────────────

export type TrackId = 'guitarRhythm' | 'guitarLead' | 'bass' | 'piano' | 'drums' | 'melody';
export type PitchedTrackId = Exclude<TrackId, 'drums'>;
export const ALL_TRACKS: TrackId[] = ['guitarRhythm', 'guitarLead', 'bass', 'piano', 'drums', 'melody'];

export type DrumVoice =
  | 'shaker'
  | 'cajonThump'
  | 'cajonSlap'
  | 'kick'
  | 'snare'
  | 'hat'
  | 'crash'
  | 'click';

export type PlannedEvent =
  | { kind: 'note'; track: PitchedTrackId; t: number; midi: number; dur: number; vel: number; release: number }
  | { kind: 'drum'; voice: DrumVoice; t: number; vel: number; pan: number }
  | { kind: 'fade'; track: TrackId; t: number; dur: number }
  | { kind: 'restore'; track: TrackId; t: number };

export interface BarTiming {
  stepsPerBar: number; // ช่องย่อย 1/16
  stepsPerUiBeat: number;
  uiBeatsPerBar: number;
  stepSec: number;
  barSec: number;
}

export interface FlatBar {
  index: number;
  sectionIndex: number;
  barInSection: number;
  section: SongSection;
  bar: SongBar;
  isFirstOfSection: boolean;
  isLastOfSection: boolean;
}

export interface PlannedBar {
  index: number;
  timing: BarTiming;
  events: PlannedEvent[];
}

// ───────────────────────────── Tunables ─────────────────────────────

/** ช่วงหน่วงเวลาระหว่างสายที่ติดกัน (ms) — ต้องอยู่ใน 18–32 ตามสเปก Phase 1B */
export const STRUM_GAP_MS: Record<'campfire' | 'soft' | 'ring', [number, number]> = {
  campfire: [18, 24],
  soft: [24, 32],
  ring: [26, 32],
};

const INTENSITY_SCALE = { low: 0.72, medium: 0.86, high: 1 } as const;

// ───────────────────────────── Utilities ─────────────────────────────

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clampVel = (v: number) => clamp(Math.round(v), 1, 127);

export function getTiming(song: SongProject): BarTiming {
  const bpm = clamp(song.bpm || 74, 30, 240);
  const ts: TimeSignature = song.timeSignature;
  if (ts === '6/8') {
    // BPM = จังหวะ "โน้ตตัวคู่จุด" (2 จังหวะ/ห้อง), 1 ห้อง = 6 ตัวเขบ็ต
    const stepSec = 60 / bpm / 6;
    return { stepsPerBar: 12, stepsPerUiBeat: 2, uiBeatsPerBar: 6, stepSec, barSec: stepSec * 12 };
  }
  if (ts === '3/4') {
    const stepSec = 60 / bpm / 4;
    return { stepsPerBar: 12, stepsPerUiBeat: 4, uiBeatsPerBar: 3, stepSec, barSec: stepSec * 12 };
  }
  const stepSec = 60 / bpm / 4;
  return { stepsPerBar: 16, stepsPerUiBeat: 4, uiBeatsPerBar: 4, stepSec, barSec: stepSec * 16 };
}

export function flattenSong(song: SongProject): FlatBar[] {
  const flat: FlatBar[] = [];
  song.sections.forEach((section, sectionIndex) => {
    section.bars.forEach((bar, barInSection) => {
      flat.push({
        index: flat.length,
        sectionIndex,
        barInSection,
        section,
        bar,
        isFirstOfSection: barInSection === 0,
        isLastOfSection: barInSection === section.bars.length - 1,
      });
    });
  });
  return flat;
}

/** เครื่องดนตรีนี้ "เล่นอยู่" ในท่อนนี้ไหม (ต้องเปิดทั้งมิกเซอร์รวม + สวิตช์ประจำท่อน) */
export function isTrackOn(song: SongProject, section: SongSection, track: TrackId): boolean {
  const m = song.mixer;
  const inst = section.instruments;
  if (!inst) return false;
  switch (track) {
    case 'guitarRhythm':
      return m.guitarRhythm.enabled && !!inst.guitarRhythm;
    case 'guitarLead':
      return m.guitarLead.enabled && !!inst.guitarLead;
    case 'bass':
      return m.bass.enabled && !!inst.bass;
    case 'piano':
      return m.piano.enabled && !!inst.piano;
    case 'drums': {
      const style = inst.drumsStyle ?? m.drums.style;
      return m.drums.enabled && m.drums.style !== 'off' && style !== 'off' && !!inst.drums;
    }
    case 'melody':
      return m.melody ? m.melody.enabled : true;
  }
}

// ───────────────────────────── Plan context ─────────────────────────────

interface Segment {
  chord: string;
  parsed: ParsedChord;
  startStep: number;
  endStep: number;
}

interface PlanCtx {
  song: SongProject;
  flat: FlatBar[];
  fb: FlatBar;
  prev?: FlatBar;
  next?: FlatBar;
  timing: BarTiming;
  segs: Segment[];
  rng: () => number;
  isBreak: boolean;
  isLetRing: boolean;
  cutT: number; // เวลาที่ตัดเสียงในห้อง Break (วินาที) ; ห้องปกติ = barSec
  intensity: number;
  gaugeDur: number;
  gaugeVel: number;
  tail: Record<TrackId, number>; // ความยาว ring-out ที่ต่อท้ายห้อง (วินาที)
  out: PlannedEvent[];
}

function buildSegments(song: SongProject, bar: SongBar, timing: BarTiming): Segment[] {
  const two = bar.chordsPerBar === 2;
  const half = timing.stepsPerBar / 2;
  const n = two ? 2 : 1;
  const segs: Segment[] = [];
  for (let i = 0; i < n; i++) {
    const raw = bar.chords[i] || bar.chords[0] || 'C';
    const chord = transposeChord(raw, song.transposeSemitones);
    segs.push({
      chord,
      parsed: parseChordSymbol(chord),
      startStep: i === 0 ? 0 : half,
      endStep: i === 0 ? (two ? half : timing.stepsPerBar) : timing.stepsPerBar,
    });
  }
  return segs;
}

function segIndexAt(segs: Segment[], step: number): number {
  for (let i = segs.length - 1; i >= 0; i--) if (step >= segs[i].startStep) return i;
  return 0;
}

function pushNote(
  ctx: PlanCtx,
  track: PitchedTrackId,
  t: number,
  midi: number,
  dur: number,
  vel: number,
  release: number
) {
  if (t < 0) t = 0;
  if (t >= ctx.cutT - 1e-6) return; // อยู่หลังจุดตัดของห้อง Break
  let end = t + dur;
  if (ctx.isBreak) {
    end = Math.min(end, ctx.cutT - 0.012); // ตัดเสียงสั้นๆ ตรงจุดหยุด
  } else if (ctx.tail[track] > 0 && end >= ctx.timing.barSec - 0.25) {
    end = ctx.timing.barSec + ctx.tail[track]; // ปล่อยหางเสียงข้ามเส้นห้อง
  }
  if (end - t < 0.04) end = t + 0.04;
  ctx.out.push({ kind: 'note', track, t, midi, dur: end - t, vel: clampVel(vel), release });
}

function pushDrum(ctx: PlanCtx, voice: DrumVoice, t: number, vel: number, pan: number) {
  if (t < 0) t = 0;
  if (t >= ctx.cutT - 1e-6) return;
  ctx.out.push({ kind: 'drum', voice, t, vel: clampVel(vel), pan });
}

const jitter = (ctx: PlanCtx, ms = 5) => ((ctx.rng() - 0.5) * 2 * ms) / 1000;

// ───────────────────────────── Rhythm guitar ─────────────────────────────

type StrumHit = { step: number; dir: 'D' | 'U'; vel: number };

const STRUM_PATTERNS: Record<TimeSignature, Record<'campfire-strum' | 'soft-strum', StrumHit[]>> = {
  '4/4': {
    'campfire-strum': [
      { step: 0, dir: 'D', vel: 100 },
      { step: 4, dir: 'D', vel: 90 },
      { step: 6, dir: 'U', vel: 72 },
      { step: 10, dir: 'U', vel: 74 },
      { step: 12, dir: 'D', vel: 92 },
      { step: 14, dir: 'U', vel: 70 },
    ],
    'soft-strum': [
      { step: 0, dir: 'D', vel: 80 },
      { step: 4, dir: 'D', vel: 68 },
      { step: 6, dir: 'U', vel: 52 },
      { step: 10, dir: 'U', vel: 54 },
      { step: 12, dir: 'D', vel: 70 },
    ],
  },
  '3/4': {
    'campfire-strum': [
      { step: 0, dir: 'D', vel: 100 },
      { step: 4, dir: 'D', vel: 88 },
      { step: 6, dir: 'U', vel: 70 },
      { step: 8, dir: 'D', vel: 90 },
      { step: 10, dir: 'U', vel: 68 },
    ],
    'soft-strum': [
      { step: 0, dir: 'D', vel: 80 },
      { step: 4, dir: 'D', vel: 64 },
      { step: 8, dir: 'D', vel: 66 },
      { step: 10, dir: 'U', vel: 50 },
    ],
  },
  '6/8': {
    'campfire-strum': [
      { step: 0, dir: 'D', vel: 100 },
      { step: 4, dir: 'U', vel: 66 },
      { step: 6, dir: 'D', vel: 92 },
      { step: 8, dir: 'U', vel: 70 },
    ],
    'soft-strum': [
      { step: 0, dir: 'D', vel: 80 },
      { step: 6, dir: 'D', vel: 70 },
      { step: 8, dir: 'U', vel: 52 },
    ],
  },
};

const FINGER_PATTERNS: Record<TimeSignature, { steps: number[]; seq: Array<'R' | 'A' | '3' | '2' | '1'> }> = {
  '4/4': { steps: [0, 2, 4, 6, 8, 10, 12, 14], seq: ['R', '3', '2', '1', 'A', '3', '2', '1'] },
  '3/4': { steps: [0, 2, 4, 6, 8, 10], seq: ['R', '3', '2', 'A', '3', '2'] },
  '6/8': { steps: [0, 2, 4, 6, 8, 10], seq: ['R', '3', '2', '1', '2', '3'] },
};

function emitStrum(
  ctx: PlanCtx,
  voicing: GuitarVoicing,
  step: number,
  dir: 'D' | 'U',
  vel: number,
  gapRange: [number, number],
  durSec: number,
  release: number
) {
  const { stepSec } = ctx.timing;
  const strings = dir === 'D' ? voicing.strings : [...voicing.strings].reverse();
  const t0 = step * stepSec + jitter(ctx, 4);
  let acc = 0;
  strings.forEach((s, k) => {
    if (k > 0) acc += (gapRange[0] + ctx.rng() * (gapRange[1] - gapRange[0])) / 1000;
    // ดาวน์สโตรกเน้นสายเบส / อัปสโตรกเน้นสายแหลม
    const pos = k / Math.max(1, strings.length - 1);
    const weight = dir === 'D' ? 1.04 - 0.14 * pos : 0.9 + 0.1 * pos;
    const v = vel * weight + (ctx.rng() - 0.5) * 8;
    pushNote(ctx, 'guitarRhythm', t0 + acc, s.midi, durSec - acc, v, release);
  });
}

function planRhythm(ctx: PlanCtx) {
  const { song, fb, timing } = ctx;
  const style: GuitarStyle = fb.section.instruments.guitarRhythmStyle ?? song.mixer.guitarRhythm.style;
  const voicings = ctx.segs.map((s) => getGuitarVoicing(s.chord, song.capoFret));
  const release = song.stringGauge === 'heavy-012' ? 0.9 : 0.5;
  const vScale = ctx.intensity;

  // Let Ring: ดีดครั้งเดียวต่อคอร์ด แล้วปล่อยกังวานค้างจนจบ segment
  if (ctx.isLetRing) {
    ctx.segs.forEach((seg, i) => {
      const dur = (seg.endStep - seg.startStep) * timing.stepSec + 0.2;
      emitStrum(ctx, voicings[i], seg.startStep, 'D', 92 * vScale + ctx.gaugeVel, STRUM_GAP_MS.ring, dur * ctx.gaugeDur, release);
    });
    return;
  }

  if (style === 'fingerpicking') {
    const pat = FINGER_PATTERNS[song.timeSignature];
    pat.steps.forEach((step, i) => {
      const si = segIndexAt(ctx.segs, step);
      const seg = ctx.segs[si];
      const strs = voicings[si].strings;
      const n = strs.length;
      const pick = (k: 'R' | 'A' | '3' | '2' | '1') => {
        if (k === 'R') return strs[0];
        if (k === 'A') return strs[Math.min(1, n - 1)];
        if (k === '3') return strs[Math.max(0, n - 3)];
        if (k === '2') return strs[Math.max(0, n - 2)];
        return strs[n - 1];
      };
      const s = pick(pat.seq[i]);
      const base = pat.seq[i] === 'R' ? 84 : pat.seq[i] === 'A' ? 70 : 62;
      const v = base * vScale + ctx.gaugeVel + (ctx.rng() - 0.5) * 8;
      const dur = ((seg.endStep - step) * timing.stepSec + 0.15) * ctx.gaugeDur;
      pushNote(ctx, 'guitarRhythm', step * timing.stepSec + jitter(ctx), s.midi, dur, v, release);
    });
    return;
  }

  const pats = STRUM_PATTERNS[song.timeSignature][style === 'soft-strum' ? 'soft-strum' : 'campfire-strum'];
  const gap = style === 'soft-strum' ? STRUM_GAP_MS.soft : STRUM_GAP_MS.campfire;
  pats.forEach((hit, i) => {
    const nextStep = i + 1 < pats.length ? pats[i + 1].step : timing.stepsPerBar;
    const si = segIndexAt(ctx.segs, hit.step);
    const dur = ((nextStep - hit.step) * timing.stepSec + 0.1) * ctx.gaugeDur;
    emitStrum(ctx, voicings[si], hit.step, hit.dir, hit.vel * vScale + ctx.gaugeVel, gap, dur, release);
  });
}

// ───────────────────────────── Lead guitar ─────────────────────────────

interface LeadScale {
  notes: number[]; // เสียงเพนตาโทนิก 2 ออกเทฟ จากต่ำ→สูง
  chordIdx: number[]; // ตำแหน่งที่เป็นโน้ตในคอร์ด (root/3/5)
}

function leadScale(parsed: ParsedChord): LeadScale {
  const offs = parsed.isMinor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
  const chordPos = parsed.isMinor ? [0, 1, 3] : [0, 2, 3];
  const notes: number[] = [];
  const chordIdx: number[] = [];
  for (let oct = 0; oct < 2; oct++) {
    offs.forEach((o, i) => {
      if (chordPos.includes(i)) chordIdx.push(notes.length);
      notes.push(60 + parsed.pc + o + 12 * oct);
    });
  }
  return { notes, chordIdx };
}

function nearestIdx(arr: number[], midi: number): number {
  let best = 0;
  let bd = Infinity;
  arr.forEach((n, i) => {
    const d = Math.abs(n - midi);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

type LeadMode = 'slow' | 'med' | 'fast';
type Tpl = Array<[number, number]>; // [step, durSteps]

const LEAD_TEMPLATES: Record<number, Record<LeadMode, Tpl[]>> = {
  16: {
    slow: [
      [[0, 8], [8, 4], [12, 4]],
      [[0, 6], [6, 2], [8, 8]],
      [[0, 4], [4, 4], [8, 8]],
      [[0, 12], [12, 4]],
    ],
    med: [
      [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 4]],
      [[0, 3], [3, 1], [4, 4], [8, 2], [10, 2], [12, 4]],
    ],
    fast: [
      [[0, 4], [4, 1], [5, 1], [6, 1], [7, 1], [8, 4], [12, 1], [13, 1], [14, 1], [15, 1]],
      [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]],
      [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 4], [12, 2], [14, 2]],
    ],
  },
  12: {
    slow: [
      [[0, 8], [8, 4]],
      [[0, 4], [4, 4], [8, 4]],
      [[0, 6], [6, 6]],
    ],
    med: [
      [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2]],
      [[0, 3], [3, 1], [4, 2], [6, 6]],
    ],
    fast: [
      [[0, 2], [2, 1], [3, 1], [4, 2], [6, 1], [7, 1], [8, 4]],
      [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 2], [8, 2], [10, 2]],
    ],
  },
};

function leadMode(ctx: PlanCtx): LeadMode {
  const sec = ctx.fb.section;
  if (sec.type !== 'solo') return 'slow';
  if (sec.soloMode === 'split-slow-fast') {
    return ctx.fb.barInSection < Math.ceil(sec.bars.length / 2) ? 'slow' : 'fast';
  }
  return 'med';
}

function planLead(ctx: PlanCtx) {
  const { song, fb, timing } = ctx;
  const style: LeadGuitarStyle = fb.section.instruments.guitarLeadStyle ?? song.mixer.guitarLead.style;
  const N = timing.stepsPerBar;
  const rel = 0.8;
  const entering = !ctx.prev || !isTrackOn(song, ctx.prev.section, 'guitarLead');

  // Let Ring: โน้ตยาวโน้ตเดียวต่อคอร์ด
  if (ctx.isLetRing) {
    ctx.segs.forEach((seg) => {
      const sc = leadScale(seg.parsed);
      const dur = (seg.endStep - seg.startStep) * timing.stepSec + 0.2;
      pushNote(ctx, 'guitarLead', seg.startStep * timing.stepSec, sc.notes[sc.chordIdx[2]], dur * ctx.gaugeDur, 72 * ctx.intensity + ctx.gaugeVel, rel);
    });
    return;
  }

  if (style === 'soft-arpeggio') {
    const steps = song.timeSignature === '4/4' ? [0, 2, 4, 6, 8, 10, 12, 14] : [0, 2, 4, 6, 8, 10];
    const seq = [0, 2, 1, 2, 0, 2, 1, 2];
    steps.forEach((step, i) => {
      const seg = ctx.segs[segIndexAt(ctx.segs, step)];
      const tones = chordIntervals(seg.parsed.quality).map((iv) => {
        let m = 72 + seg.parsed.pc + iv;
        while (m >= 88) m -= 12;
        return m;
      });
      const midi = tones[seq[i] % tones.length];
      const v = 50 * ctx.intensity + ctx.gaugeVel + (ctx.rng() - 0.5) * 8;
      pushNote(ctx, 'guitarLead', step * timing.stepSec + jitter(ctx), midi, 4 * timing.stepSec * ctx.gaugeDur, v, rel);
    });
    return;
  }

  if (style === 'riff-fills') {
    const sc0 = leadScale(ctx.segs[ctx.segs.length - 1].parsed);
    if (entering) {
      const sc = leadScale(ctx.segs[0].parsed);
      pushNote(ctx, 'guitarLead', 0, sc.notes[sc.chordIdx[2]], 8 * timing.stepSec * ctx.gaugeDur, 88 * ctx.intensity + ctx.gaugeVel, rel);
    }
    if (fb.barInSection % 2 === 1) {
      const fillSteps = N === 16 ? [N - 8, N - 6, N - 4, N - 2] : [N - 6, N - 4, N - 2];
      let idx = 7 - Math.floor(ctx.rng() * 2);
      fillSteps.forEach((step, i) => {
        const last = i === fillSteps.length - 1;
        if (last) idx = sc0.chordIdx.reduce((b, c) => (Math.abs(c - idx) < Math.abs(b - idx) ? c : b), sc0.chordIdx[0]);
        const dur = last ? (N - step) * timing.stepSec : 2 * timing.stepSec;
        const v = (84 + i * 4) * ctx.intensity + ctx.gaugeVel;
        pushNote(ctx, 'guitarLead', step * timing.stepSec + jitter(ctx, 3), sc0.notes[clamp(idx, 0, 9)], dur * ctx.gaugeDur, v, rel);
        idx -= 1 + (ctx.rng() < 0.4 ? 1 : 0);
        idx = Math.max(idx, 2);
      });
    }
    return;
  }

  // melodic-solo : เมโลดี้สร้างจากเพนตาโทนิกของคอร์ดปัจจุบัน (ซ้ำได้เสมอ ไม่สุ่มใหม่ทุกครั้ง)
  const mode = leadMode(ctx);
  const tpls = LEAD_TEMPLATES[N][mode];
  const tpl = tpls[Math.floor(ctx.rng() * tpls.length)];
  const window: [number, number] = mode === 'fast' ? [0, 9] : [2, 7];
  let lastMidi: number | null = null;
  let dir = ctx.rng() < 0.5 ? 1 : -1;

  tpl.forEach(([step, durSteps], i) => {
    const seg = ctx.segs[segIndexAt(ctx.segs, step)];
    const sc = leadScale(seg.parsed);
    const strong = i === 0 || step === seg.startStep || i === tpl.length - 1;
    let idx: number;
    if (lastMidi === null) {
      const cands = sc.chordIdx.filter((c) => c >= window[0] && c <= window[1]);
      idx = cands[Math.floor(ctx.rng() * cands.length)];
    } else {
      const base = nearestIdx(sc.notes, lastMidi);
      if (mode === 'fast') {
        if (ctx.rng() < 0.2 || base + dir > window[1] || base + dir < window[0]) dir = -dir;
        idx = base + dir * (ctx.rng() < 0.25 ? 2 : 1);
      } else {
        const deltas = [-2, -1, -1, 0, 1, 1, 2];
        idx = base + deltas[Math.floor(ctx.rng() * deltas.length)];
      }
      idx = clamp(idx, window[0], window[1]);
    }
    if (strong) {
      const inWin = sc.chordIdx.filter((c) => c >= window[0] && c <= window[1]);
      idx = inWin.reduce((b, c) => (Math.abs(c - idx) < Math.abs(b - idx) ? c : b), inWin[0]);
    }
    const midi = sc.notes[idx];
    lastMidi = midi;
    const isFirstInPhrase = i === 0 || step === seg.startStep;
    // Human Guitar Articulation:
    // โน้ตแรกของประโยคเป็น Pick Strike ดีดเต็มน้ำหนัก
    // โน้ตตามมาในลูกเป็น Hammer-on / Pull-off นุ่มนวลกว่า ไม่ดีดแข็งต๊อกๆ ทุกตัวเหมือนคีย์บอร์ด
    const base = mode === 'fast'
      ? (isFirstInPhrase ? 92 : 72)
      : mode === 'med'
      ? (isFirstInPhrase ? 86 : 74)
      : 84;
    const v = (base + (isFirstInPhrase ? 4 : 0)) * ctx.intensity + ctx.gaugeVel + (ctx.rng() - 0.5) * 5;
    // Legato overlap: ปลายเสียงเกยเข้าหัวโน้ตถัดไป 0.025s ให้การเคลื่อนนิ้วต่อเนื่องเป็นเส้นเดียวกัน
    const legatoOverlap = (!isFirstInPhrase && durSteps <= 2) ? 0.025 : 0;
    pushNote(ctx, 'guitarLead', step * timing.stepSec + (step === 0 ? 0 : jitter(ctx, 3)), midi, (durSteps * timing.stepSec + legatoOverlap) * ctx.gaugeDur, v, rel);

    // Double-stop บนท่อนพีคของโซโล่ (คู่สายบลูส์/ร็อกสไตล์ Gibson Les Paul)
    if (mode === 'fast' && durSteps >= 4 && isFirstInPhrase && ctx.fb.section.intensity === 'high') {
      const harmMidi = midi >= 76 ? midi - 5 : midi + 7;
      pushNote(ctx, 'guitarLead', step * timing.stepSec, harmMidi, durSteps * timing.stepSec * ctx.gaugeDur, v * 0.72, rel);
    }
  });
}

/** โน้ตส่งเข้า (pickup) ปลายห้องก่อนกีตาร์ลีดเข้าท่อนใหม่ — เกี่ยวเข้าหาโน้ตแรกจริงของลีดในห้องถัดไปแบบ chromatic */
function planLeadPickup(ctx: PlanCtx) {
  const { next, timing } = ctx;
  if (!next) return;
  // ห้องถัดไปมีกีตาร์ลีดเปิดอยู่ จึงไม่เรียก pickup ซ้ำ (ไม่วนลูป)
  const nextPlan = planBar(ctx.song, ctx.flat, next.index);
  const first = nextPlan.events.find((e) => e.kind === 'note' && e.track === 'guitarLead' && e.t < 0.2);
  const target =
    first && first.kind === 'note' ? first.midi : 72 + buildSegments(ctx.song, next.bar, timing)[0].parsed.pc;
  const N = timing.stepsPerBar;
  const hit = (step: number, midi: number, vel: number) =>
    pushNote(ctx, 'guitarLead', step * timing.stepSec, midi, 2 * timing.stepSec, vel * ctx.intensity, 0.5);
  hit(N - 4, target - 2, 62);
  hit(N - 2, target - 1, 78);
}

// ───────────────────────────── Bass ─────────────────────────────

function bassRoot(pc: number): number {
  return 28 + ((pc - 4 + 12) % 12); // E1..D#2
}

function planBass(ctx: PlanCtx) {
  const { song, fb, timing } = ctx;
  const style: BassStyle = fb.section.instruments.bassStyle ?? song.mixer.bass.style;
  const rel = 0.45;
  const base = 80 * ctx.intensity;

  ctx.segs.forEach((seg) => {
    const root = bassRoot(seg.parsed.pc);
    const fifth = root + 7 <= 43 ? root + 7 : root - 5;
    const len = seg.endStep - seg.startStep;
    const t0 = seg.startStep * timing.stepSec;

    if (ctx.isLetRing || style === 'warm-sustain') {
      pushNote(ctx, 'bass', t0, root, (len * timing.stepSec + 0.2), base, rel);
      return;
    }
    if (len >= 12) {
      const fifthOffset = song.timeSignature === '3/4' ? 8 : Math.floor(len / 2);
      pushNote(ctx, 'bass', t0, root, fifthOffset * timing.stepSec * 0.95, base + 4, rel);
      pushNote(ctx, 'bass', t0 + fifthOffset * timing.stepSec + jitter(ctx, 3), fifth, (len - fifthOffset) * timing.stepSec + 0.1, base - 6, rel);
    } else {
      pushNote(ctx, 'bass', t0, root, len * timing.stepSec + 0.1, base, rel);
    }
  });
}

// ───────────────────────────── Piano ─────────────────────────────

function pianoChord(parsed: ParsedChord): { low: number; high: number[] } {
  const low = 43 + ((parsed.pc - 7 + 12) % 12); // G2..F#3
  const high = chordIntervals(parsed.quality)
    .map((iv) => {
      let m = 60 + parsed.pc + iv;
      while (m >= 72) m -= 12;
      while (m < 58) m += 12;
      return m;
    })
    .sort((a, b) => a - b);
  return { low, high };
}

function planPiano(ctx: PlanCtx) {
  const { song, fb, timing } = ctx;
  const style: PianoStyle = fb.section.instruments.pianoStyle ?? song.mixer.piano.style;
  const rel = 0.6;
  const vs = ctx.intensity;

  if (style === 'gentle-arpeggio' && !ctx.isLetRing) {
    const steps = song.timeSignature === '4/4' ? [0, 2, 4, 6, 8, 10, 12, 14] : [0, 2, 4, 6, 8, 10];
    const seq = [0, 1, 2, 3, 2, 1, 2, 1];
    steps.forEach((step, i) => {
      const si = segIndexAt(ctx.segs, step);
      const pc = pianoChord(ctx.segs[si].parsed);
      const tones = [...pc.high, pc.high[0] + 12];
      const seg = ctx.segs[si];
      if (step === seg.startStep) {
        pushNote(ctx, 'piano', step * timing.stepSec, pc.low, (seg.endStep - step) * timing.stepSec + 0.15, 52 * vs, rel);
      }
      const v = 46 * vs + (ctx.rng() - 0.5) * 8;
      pushNote(ctx, 'piano', step * timing.stepSec + jitter(ctx), tones[seq[i] % tones.length], 4 * timing.stepSec + 0.1, v, rel);
    });
    return;
  }

  // Warm Pad / Let Ring: กดคอร์ดค้าง กระจายเสียงขึ้นเบาๆ
  ctx.segs.forEach((seg) => {
    const pc = pianoChord(seg.parsed);
    const t0 = seg.startStep * timing.stepSec;
    const dur = (seg.endStep - seg.startStep) * timing.stepSec + (ctx.isLetRing ? 0.2 : 0.15);
    pushNote(ctx, 'piano', t0, pc.low, dur, 56 * vs, rel);
    pc.high.forEach((m, k) => {
      pushNote(ctx, 'piano', t0 + (k + 1) * 0.014, m, dur - (k + 1) * 0.014, 50 * vs + (ctx.rng() - 0.5) * 6, rel);
    });
  });
}

// ───────────────────────────── Drums ─────────────────────────────

const HIT_PAN = { shaker: 0.45, cajonThump: -0.2, cajonSlap: -0.3, kick: 0, snare: -0.1, hat: 0.3, crash: 0.15 };

function planDrums(ctx: PlanCtx) {
  const { song, fb, timing } = ctx;
  const style: DrumStyle = fb.section.instruments.drumsStyle ?? song.mixer.drums.style;
  if (style === 'off') return;
  const ts = song.timeSignature;
  const N = timing.stepsPerBar;
  const high = fb.section.intensity === 'high';
  const iv = ctx.intensity;
  const entering = !ctx.prev || !isTrackOn(song, ctx.prev.section, 'drums');
  const at = (step: number) => step * timing.stepSec + jitter(ctx, 4);

  if (ctx.isLetRing) {
    if (style === 'simple-kit') pushDrum(ctx, 'crash', 0, 75 * iv, HIT_PAN.crash);
    else pushDrum(ctx, 'shaker', 0, 70 * iv, HIT_PAN.shaker);
    return;
  }

  const evenSteps = Array.from({ length: N / 2 }, (_, i) => i * 2);
  if (style === 'simple-kit') {
    evenSteps.forEach((s) => pushDrum(ctx, 'hat', at(s), (s % 4 === 0 ? 46 : 34) * iv, HIT_PAN.hat));
    const kicks = ts === '4/4' ? [0, 8, ...(high ? [10] : [])] : [0];
    const snares = ts === '4/4' ? [4, 12] : ts === '3/4' ? [4, 8] : [6];
    kicks.forEach((s) => pushDrum(ctx, 'kick', at(s), 86 * iv, HIT_PAN.kick));
    snares.forEach((s) => pushDrum(ctx, 'snare', at(s), 58 * iv, HIT_PAN.snare));
  } else {
    evenSteps.forEach((s) => pushDrum(ctx, 'shaker', at(s), (s % 4 === 0 ? 50 : 38) * iv, HIT_PAN.shaker));
    if (high) {
      for (let s = 3; s < N; s += 4) pushDrum(ctx, 'shaker', at(s), 20 * iv, HIT_PAN.shaker);
    }
    const thumps = ts === '4/4' ? [0, 8, ...(high ? [10] : [])] : [0];
    const slaps = ts === '4/4' ? [4, 12] : ts === '3/4' ? [4, 8] : [6];
    thumps.forEach((s) => pushDrum(ctx, 'cajonThump', at(s), 84 * iv, HIT_PAN.cajonThump));
    slaps.forEach((s) => pushDrum(ctx, 'cajonSlap', at(s), 66 * iv, HIT_PAN.cajonSlap));
  }

  // กลองเข้าท่อนใหม่: เน้นจังหวะ 1 ให้ชัด (ไม่โผล่มาเบาๆ)
  if (entering) {
    if (style === 'simple-kit') pushDrum(ctx, 'crash', 0, 88, HIT_PAN.crash);
    else pushDrum(ctx, 'shaker', 0, 95, HIT_PAN.shaker);
  }
}

/** ลูกส่งกลอง/เพอร์คัชชันท้ายห้อง ก่อนกลองเข้าท่อนถัดไป */
function planDrumFill(ctx: PlanCtx) {
  const { next, song, timing } = ctx;
  if (!next) return;
  const style: DrumStyle = next.section.instruments.drumsStyle ?? song.mixer.drums.style;
  const N = timing.stepsPerBar;
  const H = song.timeSignature === '4/4' ? 8 : 6;
  const start = N - H;
  const at = (step: number) => step * timing.stepSec;

  if (style === 'simple-kit') {
    for (let s = start; s < N - 4; s += 2) pushDrum(ctx, 'hat', at(s), 36, HIT_PAN.hat);
    for (let s = N - 4; s < N; s++) pushDrum(ctx, 'snare', at(s), 40 + (s - (N - 4)) * 18, HIT_PAN.snare);
    pushDrum(ctx, 'kick', at(N - 4), 72, HIT_PAN.kick);
    return;
  }
  // Shaker crescendo (ถี่ขึ้น+ดังขึ้น) + Cajon slap นำ 2 แปะ
  for (let s = start; s < N; s += s < N - 4 ? 2 : 1) {
    const p = (s - start) / H;
    pushDrum(ctx, 'shaker', at(s), 26 + 62 * p, HIT_PAN.shaker);
  }
  pushDrum(ctx, 'cajonSlap', at(N - 4), 60, HIT_PAN.cajonSlap);
  pushDrum(ctx, 'cajonSlap', at(N - 2), 78, HIT_PAN.cajonSlap);
}

// ───────────────────────────── Melody Guide ─────────────────────────────

function planMelody(ctx: PlanCtx) {
  const { fb, timing, isBreak, cutT, song } = ctx;
  if (!fb.bar.melodyNotes || fb.bar.melodyNotes.length === 0) return;
  const rel = 0.12;
  const vs = ctx.intensity;
  fb.bar.melodyNotes.forEach((n) => {
    const t0 = n.step * timing.stepSec;
    let dur = Math.max(0.08, n.durationSteps * timing.stepSec);
    if (isBreak && t0 >= cutT) return;
    if (isBreak && t0 + dur > cutT) dur = Math.max(0.08, cutT - t0);
    const pitch = n.midiPitch + (song.transposeSemitones || 0);
    pushNote(ctx, 'melody', t0, pitch, dur, 94 * vs, rel);
  });
}

// ───────────────────────────── planBar ─────────────────────────────

export function planBar(song: SongProject, flat: FlatBar[], index: number): PlannedBar {
  const fb = flat[index];
  const timing = getTiming(song);
  const prev = flat[index - 1];
  const next = flat[index + 1];
  const isSongEnd = index === flat.length - 1;

  const isBreak = fb.bar.playStyle === 'break';
  const isLetRing = fb.bar.playStyle === 'let-ring';
  const breakCutSteps = song.timeSignature === '4/4' ? 8 : song.timeSignature === '3/4' ? 4 : 6;
  const cutT = isBreak ? (timing.stepsPerBar - breakCutSteps) * timing.stepSec : timing.barSec;

  const heavy = song.stringGauge === 'heavy-012';
  const ringBase = Math.min(1.8, timing.barSec * 0.9);

  const tail = {} as Record<TrackId, number>;
  const exiting = {} as Record<TrackId, boolean>;
  for (const tr of ALL_TRACKS) {
    const nowOn = isTrackOn(song, fb.section, tr);
    const leaving = nowOn && (isSongEnd || (!!next && !isTrackOn(song, next.section, tr)));
    exiting[tr] = leaving;
    tail[tr] = isSongEnd && nowOn ? 2.6 : leaving ? ringBase : 0;
  }

  const ctx: PlanCtx = {
    song,
    flat,
    fb,
    prev,
    next,
    timing,
    segs: buildSegments(song, fb.bar, timing),
    rng: mulberry32(index * 7919 + 17),
    isBreak,
    isLetRing,
    cutT,
    intensity: INTENSITY_SCALE[fb.section.intensity] ?? 0.86,
    gaugeDur: heavy ? 1.25 : 0.9, // สายใหญ่: หางเสียงยาวขึ้น +25%, สายเล็ก: สั้นลงเล็กน้อย
    gaugeVel: heavy ? 5 : -3, // สายใหญ่: หัวโน้ตหนักขึ้น
    tail,
    out: [],
  };

  const on = (tr: TrackId) => isTrackOn(song, fb.section, tr);
  const nextOn = (tr: TrackId) => (next ? isTrackOn(song, next.section, tr) : false);

  if (on('guitarRhythm')) planRhythm(ctx);
  if (on('guitarLead')) planLead(ctx);
  else if (nextOn('guitarLead')) planLeadPickup(ctx);
  if (on('bass')) planBass(ctx);
  if (on('piano')) planPiano(ctx);
  if (on('drums')) planDrums(ctx);
  else if (nextOn('drums')) planDrumFill(ctx);
  if (on('melody')) planMelody(ctx);

  // restore: เครื่องที่เพิ่งกลับเข้ามาต้องเปิดเสียงเต็ม (หลัง fade ของครั้งก่อน)
  const used = new Set<TrackId>();
  ctx.out.forEach((e) => {
    if (e.kind === 'note' || e.kind === 'drum') used.add(e.kind === 'note' ? e.track : 'drums');
  });
  for (const tr of used) {
    const prevOn = prev ? isTrackOn(song, prev.section, tr) : false;
    if (!prevOn) ctx.out.push({ kind: 'restore', track: tr, t: 0 });
  }
  // fade-out: เครื่องที่ออกในท่อนถัดไป จางหายตามธรรมชาติ ไม่ตัดดื้อๆ
  for (const tr of ALL_TRACKS) {
    if (exiting[tr] && used.has(tr)) {
      ctx.out.push({ kind: 'fade', track: tr, t: Math.max(0, timing.barSec - 0.02), dur: tail[tr] * 0.92 });
    }
  }

  ctx.out.sort((a, b) => a.t - b.t);
  return { index, timing, events: ctx.out };
}

/** เคาะนับเข้า 1 ห้อง (Count-in) */
export function planCountIn(song: SongProject): PlannedEvent[] {
  const timing = getTiming(song);
  const ts = song.timeSignature;
  const steps = ts === '4/4' ? [0, 4, 8, 12] : ts === '3/4' ? [0, 4, 8] : [0, 2, 4, 6, 8, 10];
  const accents = ts === '6/8' ? [0, 6] : [0];
  return steps.map((s) => ({
    kind: 'drum' as const,
    voice: 'click' as const,
    t: s * timing.stepSec,
    vel: accents.includes(s) ? 120 : 84,
    pan: 0,
  }));
}
