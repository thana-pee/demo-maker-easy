/**
 * audioEngine.ts — เครื่องยนต์เสียงจริง (Web Audio + smplr Soundfont)
 *
 * Browser-only: ใช้ dynamic import เสมอ, ห้าม import ตรงจาก Server Component
 *
 * Public API:
 *   init(song, onProgress?)  → โหลดแซมเปิล (เรียกครั้งแรกหรือเมื่อโมเดลกีตาร์เปลี่ยน)
 *   play(song, fromBar?)     → เริ่มเล่นตั้งแต่ห้องที่กำหนด
 *   stop()                   → หยุดเล่นทันที
 *   seekToBar(index)         → กระโดดไปห้องที่ต้องการ (ระหว่างเล่น)
 *   setMixerVolume(track, v) → ปรับระดับเสียง live (0–127)
 *   onBarChange(cb)          → callback เมื่อห้องเพลงเปลี่ยน
 *   dispose()                → คืน resource ทั้งหมด
 *   getState()               → ดึง EngineState ปัจจุบัน
 */

import { Soundfont, type Smplr } from 'smplr';
import {
  planBar,
  planCountIn,
  flattenSong,
  getTiming,
  isTrackOn,
  type TrackId,
  type PlannedEvent,
  type FlatBar,
} from './barPlanner';
import type { SongProject, GuitarModel, LeadGuitarDrive, MelodySound, StringGauge, Ambience3DMode } from '../types/song';

// ─────────────────────────── Types ───────────────────────────

export type EngineState = 'idle' | 'loading' | 'ready' | 'playing' | 'error';

export interface EngineStatus {
  state: EngineState;
  loadProgress: number;    // 0–1
  activeBarIndex: number;  // -1 = ไม่ได้เล่น, 0+ = ห้องที่กำลังเล่น
  error?: string;
}

type BarChangeCb = (barIndex: number) => void;
type StatusChangeCb = (status: EngineStatus) => void;

// ─────────────────────────── Constants ───────────────────────────

/** แมปโมเดลกีตาร์ → ชื่อ instrument ใน smplr Soundfont */
const GUITAR_INSTRUMENT: Record<GuitarModel, string> = {
  'dreadnought-steel':  'acoustic_guitar_steel',
  'classical-nylon':    'acoustic_guitar_nylon',
  'ovation-roundback':  'acoustic_guitar_steel',
  'gibson-les-paul':    'overdriven_guitar',
};

/** Pan ประจำ track (ค่า smplr: -1 ถึง 1) */
const TRACK_PAN: Record<TrackId, number> = {
  guitarRhythm: -0.3,
  guitarLead:    0.4,
  bass:          0.0,
  piano:        -0.2,
  drums:         0.0,
  melody:        0.0,
};

/** ระดับเสียงเริ่มต้นสำหรับแต่ละ track (0–127) */
const TRACK_DEFAULT_VOL: Record<TrackId, number> = {
  guitarRhythm: 100,
  guitarLead:    90,
  bass:         100,
  piano:         85,
  drums:         95,
  melody:        90,
};

// ─────────────────────────── Drum Synthesis ───────────────────────────

/**
 * สร้างเสียงกลอง/เพอร์คัชชันด้วย Web Audio synthesis
 * เราไม่ใช้ smplr DrumMachine เพราะต้องการ cajon + shaker เฉพาะทาง
 */
class DrumSynth {
  private ctx: AudioContext;
  private out: GainNode;
  private noiseBuf: AudioBuffer;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(destination);

    // Pre-allocate shared noise buffer (1.0 sec) to eliminate GC spikes on every drum hit
    const len = Math.max(1, Math.floor(ctx.sampleRate * 1.0));
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  setVolume(v: number) {
    // v: 0–127
    this.out.gain.value = (v / 127) ** 1.5;
  }

  /** t = AudioContext absolute time */
  hit(voice: PlannedEvent & { kind: 'drum' }, t: number) {
    const ctx = this.ctx;
    const vel = voice.vel / 127;
    const pan = voice.pan;

    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(this.out);

    switch (voice.voice) {
      case 'kick':        this.kick(t, vel, panner); break;
      case 'snare':       this.snare(t, vel, panner); break;
      case 'hat':         this.hat(t, vel, panner); break;
      case 'crash':       this.crash(t, vel, panner); break;
      case 'cajonThump':  this.cajonThump(t, vel, panner); break;
      case 'cajonSlap':   this.cajonSlap(t, vel, panner); break;
      case 'shaker':      this.shaker(t, vel, panner); break;
      case 'click':       this.click(t, vel, panner); break;
    }
  }

  private kick(t: number, vel: number, out: StereoPannerNode) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.08);
    gain.gain.setValueAtTime(vel * 1.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(gain); gain.connect(out);
    osc.onended = () => {
      try { osc.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
      try { out.disconnect(); } catch {}
    };
    osc.start(t); osc.stop(t + 0.36);
  }

  private snare(t: number, vel: number, out: StereoPannerNode) {
    const ctx = this.ctx;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuf;
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass'; hpf.frequency.value = 1800;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(vel * 0.8, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    noise.connect(hpf); hpf.connect(nGain); nGain.connect(out);

    noise.onended = () => {
      try { noise.disconnect(); } catch {}
      try { hpf.disconnect(); } catch {}
      try { nGain.disconnect(); } catch {}
      try { out.disconnect(); } catch {}
    };
    noise.start(t); noise.stop(t + 0.19);

    // body
    const osc = ctx.createOscillator();
    const oGain = ctx.createGain();
    osc.type = 'triangle'; osc.frequency.value = 220;
    oGain.gain.setValueAtTime(vel * 0.4, t);
    oGain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(oGain); oGain.connect(out);
    osc.onended = () => {
      try { osc.disconnect(); } catch {}
      try { oGain.disconnect(); } catch {}
    };
    osc.start(t); osc.stop(t + 0.08);
  }

  private hat(t: number, vel: number, out: StereoPannerNode) {
    const ctx = this.ctx;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuf;
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass'; hpf.frequency.value = 7000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vel * 0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    noise.connect(hpf); hpf.connect(gain); gain.connect(out);
    noise.onended = () => {
      try { noise.disconnect(); } catch {}
      try { hpf.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
      try { out.disconnect(); } catch {}
    };
    noise.start(t); noise.stop(t + 0.08);
  }

  private crash(t: number, vel: number, out: StereoPannerNode) {
    const ctx = this.ctx;
    const dur = 0.6;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuf;
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass'; hpf.frequency.value = 5000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vel * 0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise.connect(hpf); hpf.connect(gain); gain.connect(out);
    noise.onended = () => {
      try { noise.disconnect(); } catch {}
      try { hpf.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
      try { out.disconnect(); } catch {}
    };
    noise.start(t); noise.stop(t + dur + 0.01);
  }

  private cajonThump(t: number, vel: number, out: StereoPannerNode) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(130, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.1);
    gain.gain.setValueAtTime(vel * 1.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(gain); gain.connect(out);
    osc.onended = () => {
      try { osc.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
      try { out.disconnect(); } catch {}
    };
    osc.start(t); osc.stop(t + 0.29);
  }

  private cajonSlap(t: number, vel: number, out: StereoPannerNode) {
    const ctx = this.ctx;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuf;
    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass'; bpf.frequency.value = 900; bpf.Q.value = 1.4;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(vel * 0.9, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    noise.connect(bpf); bpf.connect(nGain); nGain.connect(out);
    noise.onended = () => {
      try { noise.disconnect(); } catch {}
      try { bpf.disconnect(); } catch {}
      try { nGain.disconnect(); } catch {}
      try { out.disconnect(); } catch {}
    };
    noise.start(t); noise.stop(t + 0.13);

    // attack click
    const osc = ctx.createOscillator();
    const oGain = ctx.createGain();
    osc.type = 'triangle'; osc.frequency.value = 400;
    oGain.gain.setValueAtTime(vel * 0.3, t);
    oGain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    osc.connect(oGain); oGain.connect(out);
    osc.onended = () => {
      try { osc.disconnect(); } catch {}
      try { oGain.disconnect(); } catch {}
    };
    osc.start(t); osc.stop(t + 0.04);
  }

  private shaker(t: number, vel: number, out: StereoPannerNode) {
    const ctx = this.ctx;
    const dur = 0.05;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuf;
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass'; hpf.frequency.value = 5500;
    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass'; bpf.frequency.value = 9000; bpf.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vel * 0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise.connect(hpf); hpf.connect(bpf); bpf.connect(gain); gain.connect(out);
    noise.onended = () => {
      try { noise.disconnect(); } catch {}
      try { hpf.disconnect(); } catch {}
      try { bpf.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
      try { out.disconnect(); } catch {}
    };
    noise.start(t); noise.stop(t + dur + 0.01);
  }

  private click(t: number, vel: number, out: StereoPannerNode) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = 1200;
    gain.gain.setValueAtTime(vel * 0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
    osc.connect(gain); gain.connect(out);
    osc.onended = () => {
      try { osc.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
      try { out.disconnect(); } catch {}
    };
    osc.start(t); osc.stop(t + 0.03);
  }

  dispose() {
    this.out.disconnect();
  }
}

// ─────────────────────────── Melody Synthesis ───────────────────────────

/**
 * MelodySynth — เครื่องยนต์สร้างเสียงทำนองไกด์ (Vocal Melody Guide Synth)
 *
 * ทำงานด้วย Web Audio oscillator + envelope คุณภาพสูง:
 *  - 'flute': เสียงขลุ่ย/ผิวปาก นุ่มนวล มี Vibrato อ่อนๆ นำเสียงร้องได้ชัด ไม่กลบอะคูสติก
 *  - 'piano': โทนเปียโนใส คมชัด
 *  - 'bell': เสียงกระดิ่งระฆังแก้ว กังวาน อบอุ่น
 */
class MelodySynth {
  private ctx: AudioContext;
  private out: GainNode;
  private currentSound: MelodySound = 'flute';

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 1.0;
    this.out.connect(destination);
  }

  setSound(sound: MelodySound) {
    this.currentSound = sound;
  }

  playNote(midi: number, vel: number, t: number, dur: number) {
    const ctx = this.ctx;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const v = (vel / 127) * 0.75;
    const endT = t + Math.max(0.08, dur);

    switch (this.currentSound) {
      case 'flute': {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(freq, t);

        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(freq, t);

        // Singing Vibrato LFO (4.8 Hz, ramp in after 80ms)
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.setValueAtTime(4.8, t);
        lfoGain.gain.setValueAtTime(0, t);
        lfoGain.gain.setValueAtTime(0, t + 0.08);
        lfoGain.gain.linearRampToValueAtTime(freq * 0.012, t + 0.22);
        lfo.connect(lfoGain);
        lfoGain.connect(osc1.frequency);
        lfoGain.connect(osc2.frequency);
        lfo.start(t);
        lfo.stop(endT + 0.15);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2800, t);

        const attack = 0.035;
        const release = 0.09;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(v * 0.85, t + attack);
        gain.gain.setValueAtTime(v * 0.85, Math.max(t + attack, endT - release));
        gain.gain.exponentialRampToValueAtTime(0.0001, endT + release);

        const osc1Gain = ctx.createGain();
        osc1Gain.gain.value = 0.7;
        const osc2Gain = ctx.createGain();
        osc2Gain.gain.value = 0.3;

        osc1.connect(osc1Gain);
        osc2.connect(osc2Gain);
        osc1Gain.connect(filter);
        osc2Gain.connect(filter);
        filter.connect(gain);
        gain.connect(this.out);

        osc1.onended = () => {
          try { osc1.disconnect(); } catch {}
          try { osc2.disconnect(); } catch {}
          try { osc1Gain.disconnect(); } catch {}
          try { osc2Gain.disconnect(); } catch {}
          try { lfo.disconnect(); } catch {}
          try { lfoGain.disconnect(); } catch {}
          try { filter.disconnect(); } catch {}
          try { gain.disconnect(); } catch {}
        };

        osc1.start(t);
        osc2.start(t);
        osc1.stop(endT + release + 0.05);
        osc2.stop(endT + release + 0.05);
        break;
      }
      case 'piano': {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(freq, t);
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(freq * 1.0015, t);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(3200, t);
        filter.frequency.exponentialRampToValueAtTime(800, endT);

        const attack = 0.008;
        const release = 0.12;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(v * 0.8, t + attack);
        gain.gain.exponentialRampToValueAtTime(v * 0.4, t + Math.min(dur * 0.5, 0.4));
        gain.gain.exponentialRampToValueAtTime(0.0001, endT + release);

        const m1 = ctx.createGain(); m1.gain.value = 0.65;
        const m2 = ctx.createGain(); m2.gain.value = 0.35;
        osc1.connect(m1); osc2.connect(m2);
        m1.connect(filter); m2.connect(filter);
        filter.connect(gain); gain.connect(this.out);

        osc1.onended = () => {
          try { osc1.disconnect(); } catch {}
          try { osc2.disconnect(); } catch {}
          try { m1.disconnect(); } catch {}
          try { m2.disconnect(); } catch {}
          try { filter.disconnect(); } catch {}
          try { gain.disconnect(); } catch {}
        };

        osc1.start(t); osc2.start(t);
        osc1.stop(endT + release + 0.05); osc2.stop(endT + release + 0.05);
        break;
      }
      case 'bell': {
        const ratios = [1.0, 2.76, 5.4];
        const weights = [0.7, 0.25, 0.1];
        ratios.forEach((r, idx) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq * r, t);
          const decay = Math.min(1.8, dur + 0.4) / (idx + 1);
          g.gain.setValueAtTime(v * weights[idx], t);
          g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
          osc.connect(g);
          g.connect(this.out);

          osc.onended = () => {
            try { osc.disconnect(); } catch {}
            try { g.disconnect(); } catch {}
          };

          osc.start(t);
          osc.stop(t + decay + 0.05);
        });
        break;
      }
    }
  }

  dispose() {
    this.out.disconnect();
  }
}

// ─────────────────────────── TrackGain ───────────────────────────

/** GainNode ต่อ track สำหรับ fade/restore/mixer volume */
export class TrackGainNode {
  protected masterGain: GainNode;
  protected fadeGain: GainNode;
  protected panner: StereoPannerNode;
  readonly input: GainNode; // ต่อกับ smplr destination หรือ DrumSynth

  constructor(ctx: AudioContext, destination: AudioNode, vol: number, pan: number) {
    this.masterGain = ctx.createGain();
    this.fadeGain   = ctx.createGain();
    this.input      = ctx.createGain();

    // เชื่อม: input → masterGain → fadeGain → panner → destination
    this.panner = ctx.createStereoPanner();
    this.panner.pan.value = pan;

    this.input.connect(this.masterGain);
    this.masterGain.connect(this.fadeGain);
    this.fadeGain.connect(this.panner);
    this.panner.connect(destination);

    this.setVolume(vol);
  }

  setVolume(v: number) {
    // v: 0–127
    this.masterGain.gain.value = (v / 127) ** 1.5;
  }

  fade(t: number, dur: number) {
    this.fadeGain.gain.cancelScheduledValues(t);
    this.fadeGain.gain.setValueAtTime(this.fadeGain.gain.value, t);
    this.fadeGain.gain.linearRampToValueAtTime(0, t + dur);
  }

  restore(t: number) {
    this.fadeGain.gain.cancelScheduledValues(t);
    this.fadeGain.gain.setValueAtTime(1, t);
  }

  disconnect() {
    try { this.input.disconnect(); } catch {}
    try { this.masterGain.disconnect(); } catch {}
    try { this.fadeGain.disconnect(); } catch {}
    try { this.panner.disconnect(); } catch {}
  }
}

/**
 * GuitarRhythmTrackGainNode — Channel กีตาร์โปร่งริทึ่มพร้อม Body Resonance EQ
 * จำลองขนาด Body ไม้ และ Soundboard ของกีตาร์แต่ละทรง
 */
class GuitarRhythmTrackGainNode extends TrackGainNode {
  private bodyResonance: BiquadFilterNode;
  private highAir: BiquadFilterNode;

  constructor(
    ctx: AudioContext,
    destination: AudioNode,
    vol: number,
    pan: number,
    model: GuitarModel,
    gauge: StringGauge = 'standard-010'
  ) {
    super(ctx, destination, vol, pan);

    // ปลด input -> masterGain ตรงๆ จาก constructor แม่ เพื่อต่อผ่าน EQ Chain
    this.input.disconnect(this.masterGain);

    this.bodyResonance = ctx.createBiquadFilter();
    this.highAir = ctx.createBiquadFilter();

    this.input.connect(this.bodyResonance);
    this.bodyResonance.connect(this.highAir);
    this.highAir.connect(this.masterGain);

    this.updateAcoustics(model, gauge);
  }

  updateAcoustics(model: GuitarModel, gauge: StringGauge) {
    const isHeavy = gauge === 'heavy-012';
    if (model === 'classical-nylon') {
      this.bodyResonance.type = 'peaking';
      this.bodyResonance.frequency.value = 230;
      this.bodyResonance.gain.value = 3.2;
      this.bodyResonance.Q.value = 1.0;

      this.highAir.type = 'lowpass';
      this.highAir.frequency.value = 6500;
      this.highAir.Q.value = 0.7;
    } else if (model === 'ovation-roundback') {
      this.bodyResonance.type = 'highpass';
      this.bodyResonance.frequency.value = 90;
      this.bodyResonance.Q.value = 0.7;

      this.highAir.type = 'peaking';
      this.highAir.frequency.value = 3800;
      this.highAir.gain.value = 3.5;
      this.highAir.Q.value = 1.4;
    } else {
      // dreadnought-steel default
      this.bodyResonance.type = 'peaking';
      this.bodyResonance.frequency.value = 115;
      this.bodyResonance.gain.value = isHeavy ? 3.0 : 2.2;
      this.bodyResonance.Q.value = 1.2;

      this.highAir.type = 'highshelf';
      this.highAir.frequency.value = 5200;
      this.highAir.gain.value = isHeavy ? 1.5 : 2.5;
    }
  }

  override disconnect() {
    super.disconnect();
    try { this.bodyResonance.disconnect(); } catch {}
    try { this.highAir.disconnect(); } catch {}
  }
}

/** สร้าง Curve จำลองเสียงแตกหลอดสุญญากาศ (Tube Saturation Curve with Soft-Knee) */
function makeGuitarDistortionCurve(samples = 4096): Float32Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(samples * 4);
  const curve = new Float32Array(buffer);
  for (let i = 0; i < samples; ++i) {
    const x = (i * 2) / samples - 1;
    // Slight asymmetric even-harmonic bias for tube-like warmth
    const biased = x + 0.08 * (x * x - 0.25);
    curve[i] = Math.tanh(biased * 2.2);
  }
  return curve;
}

/**
 * LeadGuitarTrackGainNode — Channel กีตาร์ลีดพร้อมเอฟเฟกต์ Overdrive / Distortion + Cabinet Sim
 *
 * Signal Chain:
 *   input -> dryGain -----------------------------------------------------> masterGain -> fadeGain -> panner -> destination
 *         \-> preFilter (HPF 100Hz) -> preGain -> waveShaper -> cabFilter -> postGain -> wetGain -/
 */
class LeadGuitarTrackGainNode extends TrackGainNode {
  private preFilter: BiquadFilterNode;
  private preGain: GainNode;
  private waveShaper: WaveShaperNode;
  private cabFilter: BiquadFilterNode;
  private postGain: GainNode;
  private wetGain: GainNode;
  private dryGain: GainNode;
  private currentDrive: LeadGuitarDrive = 'clean';

  constructor(ctx: AudioContext, destination: AudioNode, vol: number, pan: number) {
    super(ctx, destination, vol, pan);

    // ปลด input -> masterGain ตรงๆ จาก constructor แม่ เพื่อให้ผ่าน drive circuit
    this.input.disconnect(this.masterGain);

    // 1. Pre-filter: ตัด sub-bass rumble ก่อนอัดเข้า WaveShaper
    this.preFilter = ctx.createBiquadFilter();
    this.preFilter.type = 'highpass';
    this.preFilter.frequency.value = 110;

    // 2. Drive Pre-Gain: อัดสัญญาณเข้าจุดอิ่มตัว
    this.preGain = ctx.createGain();
    this.preGain.gain.value = 1.0;

    // 3. WaveShaper: จำลองหลอดสุญญากาศ (พร้อม 4x oversampling ลด aliasing noise)
    this.waveShaper = ctx.createWaveShaper();
    this.waveShaper.curve = makeGuitarDistortionCurve(4096);
    this.waveShaper.oversample = '4x';

    // 4. Cabinet Filter: จำลองตู้แอมป์กีตาร์ (Celestion V30 roll-off ~4.2kHz) เพื่อให้เสียงหนา อบอุ่น ไม่แหลมสาก
    this.cabFilter = ctx.createBiquadFilter();
    this.cabFilter.type = 'lowpass';
    this.cabFilter.frequency.value = 4500;
    this.cabFilter.Q.value = 1.1;

    // 5. Post Gain: ชดเชยระดับเสียงไม่ให้โดดหลังแตก
    this.postGain = ctx.createGain();
    this.postGain.gain.value = 0.55;

    // 6. Wet / Dry blend
    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = 0.0;

    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1.0;

    // 7. Vibrato & Singing Sustain circuit (BBD modulated analog delay)
    // เลียนแบบวงจรเอฟเฟกต์ก้อน Chorus/Vibrato ของมือกีตาร์ (เช่น Boss CE-2 / VB-2)
    // ทำให้นักกีตาร์ที่ลากโน้ตยาว มีการสั่นนิ้ว (Vibrato 5.0 Hz) อบอุ่น มีมิติ ไม่แข็งทื่อเป็นอีเล็กโทน
    this.vibratoDelay = ctx.createDelay();
    this.vibratoDelay.delayTime.value = 0.0035; // 3.5ms baseline delay

    this.vibratoLfo = ctx.createOscillator();
    this.vibratoLfo.type = 'sine';
    this.vibratoLfo.frequency.value = 5.0; // 5 Hz อัตราการสั่นข้อมือมือกีตาร์จริง

    this.vibratoDepth = ctx.createGain();
    this.vibratoDepth.gain.value = 0.00055; // ความลึกในการสั่นสาย (~20-25 cents)

    this.vibratoLfo.connect(this.vibratoDepth);
    this.vibratoDepth.connect(this.vibratoDelay.delayTime);
    this.vibratoLfo.start();

    // 8. Junction sum & stereo-like blend
    this.sumNode = ctx.createGain();
    this.vibratoDirect = ctx.createGain();
    this.vibratoDirect.gain.value = 0.4;
    this.vibratoWet = ctx.createGain();
    this.vibratoWet.gain.value = 0.65;

    // ต่อสายวงจร Wet
    this.input.connect(this.preFilter);
    this.preFilter.connect(this.preGain);
    this.preGain.connect(this.waveShaper);
    this.waveShaper.connect(this.cabFilter);
    this.cabFilter.connect(this.postGain);
    this.postGain.connect(this.wetGain);
    this.wetGain.connect(this.sumNode);

    // ต่อสายวงจร Dry
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.sumNode);

    // ส่งสัญญาณผ่านวงจร Vibrato ก่อนเข้า Master
    this.sumNode.connect(this.vibratoDirect);
    this.vibratoDirect.connect(this.masterGain);

    this.sumNode.connect(this.vibratoDelay);
    this.vibratoDelay.connect(this.vibratoWet);
    this.vibratoWet.connect(this.masterGain);
  }

  private vibratoDelay: DelayNode;
  private vibratoLfo: OscillatorNode;
  private vibratoDepth: GainNode;
  private sumNode: GainNode;
  private vibratoDirect: GainNode;
  private vibratoWet: GainNode;

  setDrive(drive: LeadGuitarDrive, t: number = 0) {
    if (this.currentDrive === drive) return;
    this.currentDrive = drive;

    const ctxTime = t || this.input.context.currentTime;
    const ramp = 0.04;

    let dry = 1.0;
    let wet = 0.0;
    let pre = 1.0;
    let cabFreq = 6000;
    let cabQ = 1.0;
    let post = 0.75;
    let vibDepth = 0.0003;

    switch (drive) {
      case 'clean':
        dry = 1.0;
        wet = 0.0;
        pre = 1.0;
        cabFreq = 6000;
        cabQ = 0.9;
        post = 0.75;
        vibDepth = 0.0003;
        break;
      case 'crunch':
        dry = 0.25;
        wet = 0.85;
        pre = 3.2;
        cabFreq = 4800;
        cabQ = 1.1;
        post = 0.58;
        vibDepth = 0.0005;
        break;
      case 'overdrive':
        dry = 0.05;
        wet = 1.0;
        pre = 7.0;
        cabFreq = 4200;
        cabQ = 1.3;
        post = 0.45;
        vibDepth = 0.0007;
        break;
      case 'distortion':
        dry = 0.0;
        wet = 1.15;
        pre = 13.0;
        cabFreq = 3700;
        cabQ = 1.5;
        post = 0.32;
        vibDepth = 0.00085;
        break;
    }

    this.dryGain.gain.setTargetAtTime(dry, ctxTime, ramp);
    this.wetGain.gain.setTargetAtTime(wet, ctxTime, ramp);
    this.preGain.gain.setTargetAtTime(pre, ctxTime, ramp);
    this.cabFilter.frequency.setTargetAtTime(cabFreq, ctxTime, ramp);
    this.cabFilter.Q.setTargetAtTime(cabQ, ctxTime, ramp);
    this.postGain.gain.setTargetAtTime(post, ctxTime, ramp);
    this.vibratoDepth.gain.setTargetAtTime(vibDepth, ctxTime, ramp);
  }

  override disconnect() {
    super.disconnect();
    this.preFilter.disconnect();
    this.preGain.disconnect();
    this.waveShaper.disconnect();
    this.cabFilter.disconnect();
    this.postGain.disconnect();
    this.wetGain.disconnect();
    this.dryGain.disconnect();
    try {
      this.vibratoLfo.stop();
      this.vibratoLfo.disconnect();
    } catch {
      // ignore if already stopped
    }
    this.vibratoDepth.disconnect();
    this.vibratoDelay.disconnect();
    this.vibratoDirect.disconnect();
    this.vibratoWet.disconnect();
    this.sumNode.disconnect();
  }
}

/**
 * VocalStudioTrackGainNode — Vocal Studio DSP Chain:
 *  input -> hpf (95Hz highpass) -> presenceEq (3.8kHz +2.5dB peaking, Q: 1.1)
 *        -> vocalComp (-18dB, 4:1, 8ms/120ms) -> masterGain -> fadeGain -> panner -> destination
 */
export class VocalStudioTrackGainNode extends TrackGainNode {
  private hpf: BiquadFilterNode;
  private presenceEq: BiquadFilterNode;
  private vocalComp: DynamicsCompressorNode;

  constructor(ctx: AudioContext, destination: AudioNode, vol: number, pan: number) {
    super(ctx, destination, vol, pan);

    // ปลดสายตรง input -> masterGain จากคลาสแม่ แล้วส่งผ่าน Studio Vocal DSP Chain
    this.input.disconnect(this.masterGain);

    this.hpf = ctx.createBiquadFilter();
    this.hpf.type = 'highpass';
    this.hpf.frequency.value = 95;
    this.hpf.Q.value = 0.707;

    this.presenceEq = ctx.createBiquadFilter();
    this.presenceEq.type = 'peaking';
    this.presenceEq.frequency.value = 3800;
    this.presenceEq.gain.value = 2.5;
    this.presenceEq.Q.value = 1.1;

    this.vocalComp = ctx.createDynamicsCompressor();
    this.vocalComp.threshold.setValueAtTime(-18, ctx.currentTime);
    this.vocalComp.knee.setValueAtTime(6, ctx.currentTime);
    this.vocalComp.ratio.setValueAtTime(4, ctx.currentTime);
    this.vocalComp.attack.setValueAtTime(0.008, ctx.currentTime);
    this.vocalComp.release.setValueAtTime(0.12, ctx.currentTime);

    this.input.connect(this.hpf);
    this.hpf.connect(this.presenceEq);
    this.presenceEq.connect(this.vocalComp);
    this.vocalComp.connect(this.masterGain);
  }

  override disconnect() {
    super.disconnect();
    try { this.hpf.disconnect(); } catch {}
    try { this.presenceEq.disconnect(); } catch {}
    try { this.vocalComp.disconnect(); } catch {}
  }
}

// ─────────────────────────── AudioEngine ───────────────────────────

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterCompressor: DynamicsCompressorNode | null = null;
  private masterBus: GainNode | null = null;
  private reverbConvolver: ConvolverNode | null = null;
  private reverbWetGain: GainNode | null = null;
  private currentAmbience: Ambience3DMode | null = null;
  private instruments: Partial<Record<TrackId, Smplr>> = {};
  private drumSynth: DrumSynth | null = null;
  private melodySynth: MelodySynth | null = null;
  private trackGains: Partial<Record<TrackId, TrackGainNode>> = {};
  private vocalGain: TrackGainNode | null = null;

  private state: EngineState = 'idle';
  private loadProgress = 0;
  private activeBarIndex = -1;
  private loadedGuitarModel: GuitarModel | null = null;

  private playbackFlat: FlatBar[] = [];
  private currentBarTimer: ReturnType<typeof setTimeout> | null = null;
  private isPlayingFlag = false;
  private vocalBufferCache: Map<string, AudioBuffer> = new Map();
  private activeVocalSource: AudioBufferSourceNode | null = null;
  private nextBarAudioTime = 0;

  private barChangeCbs: Set<BarChangeCb> = new Set();
  private statusChangeCbs: Set<StatusChangeCb> = new Set();

  // ─── Status helpers ───

  private emitStatus() {
    const s: EngineStatus = {
      state: this.state,
      loadProgress: this.loadProgress,
      activeBarIndex: this.activeBarIndex,
    };
    this.statusChangeCbs.forEach((cb) => cb(s));
  }

  getState(): EngineStatus {
    return {
      state: this.state,
      loadProgress: this.loadProgress,
      activeBarIndex: this.activeBarIndex,
    };
  }

  onBarChange(cb: BarChangeCb): () => void {
    this.barChangeCbs.add(cb);
    return () => this.barChangeCbs.delete(cb);
  }

  onStatusChange(cb: StatusChangeCb): () => void {
    this.statusChangeCbs.add(cb);
    return () => this.statusChangeCbs.delete(cb);
  }

  // ─── Helpers ───

  private buildRoomImpulse(ctx: AudioContext, mode: Ambience3DMode): AudioBuffer {
    const rate = ctx.sampleRate;
    let decaySec = 1.25;
    let preDelaySec = 0.015;
    if (mode === 'living-room') {
      decaySec = 0.75;
      preDelaySec = 0.008;
    } else if (mode === 'unplugged-hall') {
      decaySec = 2.3;
      preDelaySec = 0.028;
    }
    const length = Math.max(1, Math.floor(rate * decaySec));
    const impulse = ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      if (t < preDelaySec) {
        left[i] = 0;
        right[i] = 0;
      } else {
        const factor = Math.exp(-(t - preDelaySec) * (3.5 / decaySec));
        left[i] = (Math.random() * 2 - 1) * factor;
        right[i] = (Math.random() * 2 - 1) * factor;
      }
    }
    return impulse;
  }

  // ─── Init / Load ───

  async init(song: SongProject, onProgress?: (p: number) => void): Promise<void> {
    // เปิด AudioContext ถ้ายังไม่มี
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: 44100, latencyHint: 'interactive' });
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    const needGuitar =
      this.loadedGuitarModel !== song.guitarModel ||
      !this.instruments['guitarRhythm'];

    if (!needGuitar && this.state === 'ready') {
      return; // โหลดแล้ว ไม่ต้องโหลดซ้ำ
    }

    this.state = 'loading';
    this.loadProgress = 0;
    this.emitStatus();

    const ctx = this.ctx;

    // Master Bus & Mastering Compressor (ป้องกันเสียงแตกพร่า พร้อม Glue ความนวลสไตล์แผ่นเสียง)
    if (!this.masterCompressor) {
      this.masterCompressor = ctx.createDynamicsCompressor();
      this.masterCompressor.threshold.setValueAtTime(-12, ctx.currentTime);
      this.masterCompressor.knee.setValueAtTime(8, ctx.currentTime);
      this.masterCompressor.ratio.setValueAtTime(3.5, ctx.currentTime);
      this.masterCompressor.attack.setValueAtTime(0.015, ctx.currentTime);
      this.masterCompressor.release.setValueAtTime(0.12, ctx.currentTime);
      this.masterCompressor.connect(ctx.destination);
    }
    if (!this.masterBus) {
      this.masterBus = ctx.createGain();
      this.masterBus.gain.value = 1.0;
      this.masterBus.connect(this.masterCompressor);
    }
    if (!this.reverbConvolver || !this.reverbWetGain) {
      this.reverbConvolver = ctx.createConvolver();
      this.reverbWetGain = ctx.createGain();
      this.masterBus.connect(this.reverbConvolver);
      this.reverbConvolver.connect(this.reverbWetGain);
      this.reverbWetGain.connect(this.masterCompressor);
    }
    this.setAmbience3D(song.ambience3D || 'wood-studio');
    const dest = this.masterBus;

    // สร้าง TrackGainNode สำหรับทุก track
    const tracks: TrackId[] = ['guitarRhythm', 'guitarLead', 'bass', 'piano', 'drums', 'melody'];
    for (const tr of tracks) {
      this.trackGains[tr]?.disconnect();
      const mixVol = tr === 'drums'
        ? song.mixer.drums.volume
        : tr === 'bass'
        ? song.mixer.bass.volume
        : tr === 'piano'
        ? song.mixer.piano.volume
        : tr === 'guitarLead'
        ? song.mixer.guitarLead.volume
        : tr === 'melody'
        ? (song.mixer.melody?.volume ?? 85)
        : song.mixer.guitarRhythm.volume;

      if (tr === 'guitarLead') {
        const leadNode = new LeadGuitarTrackGainNode(ctx, dest, mixVol ?? TRACK_DEFAULT_VOL[tr], TRACK_PAN[tr]);
        leadNode.setDrive(song.mixer.guitarLead.drive ?? 'overdrive');
        this.trackGains[tr] = leadNode;
      } else if (tr === 'guitarRhythm') {
        this.trackGains[tr] = new GuitarRhythmTrackGainNode(
          ctx,
          dest,
          mixVol ?? TRACK_DEFAULT_VOL[tr],
          TRACK_PAN[tr],
          song.guitarModel,
          song.stringGauge
        );
      } else {
        this.trackGains[tr] = new TrackGainNode(ctx, dest, mixVol ?? TRACK_DEFAULT_VOL[tr], TRACK_PAN[tr]);
      }
    }

    // Vocal Track Gain Node (Studio HPF + Presence EQ + Vocal Compressor)
    this.vocalGain?.disconnect();
    const vocalVol = song.mixer.vocal?.volume ?? 95;
    this.vocalGain = new VocalStudioTrackGainNode(
      ctx,
      dest,
      (song.mixer.vocal?.enabled ?? true) ? vocalVol : 0,
      0.0
    );

    // DrumSynth ต่อเข้า drumsGain.input
    this.drumSynth?.dispose();
    this.drumSynth = new DrumSynth(ctx, this.trackGains['drums']!.input);

    // MelodySynth ต่อเข้า melodyGain.input
    this.melodySynth?.dispose();
    this.melodySynth = new MelodySynth(ctx, this.trackGains['melody']!.input);
    this.melodySynth.setSound(song.mixer.melody?.sound ?? 'flute');

    const leadModel = song.mixer.guitarLead.model || 'gibson-les-paul';
    const leadInst = leadModel === 'gibson-les-paul'
      ? (song.mixer.guitarLead.drive === 'clean' ? 'electric_guitar_clean' : 'overdriven_guitar')
      : GUITAR_INSTRUMENT[leadModel];

    // โหลด Soundfont — 4 tracks (ไม่รวม drums)
    const pitchedTracks: Array<{ id: TrackId; instrument: string }> = [
      { id: 'guitarRhythm', instrument: GUITAR_INSTRUMENT[song.guitarModel] },
      { id: 'guitarLead',   instrument: leadInst },
      { id: 'bass',         instrument: 'acoustic_bass' },
      { id: 'piano',        instrument: 'acoustic_grand_piano' },
    ];

    const total = pitchedTracks.length;
    let loaded = 0;

    const loadPromises = pitchedTracks.map(async ({ id, instrument }) => {
      const sf = Soundfont(ctx, {
        instrument,
        kit: 'MusyngKite',
        destination: this.trackGains[id]!.input,
        volume: 100,
        onLoadProgress: () => {
          // เรียกทุกครั้งที่ sample โหลดเสร็จ — ใช้สำหรับ per-instrument progress
        },
      });
      await sf.ready;
      this.instruments[id] = sf;
      loaded++;
      this.loadProgress = loaded / total;
      onProgress?.(this.loadProgress);
      this.emitStatus();
    });

    try {
      await Promise.all(loadPromises);
      this.loadedGuitarModel = song.guitarModel;
      this.state = 'ready';
      this.loadProgress = 1;
      this.emitStatus();
    } catch (err) {
      this.state = 'error';
      this.emitStatus();
      throw err;
    }
  }

  // ─── Mixer volume ───

  setMixerVolume(track: TrackId | 'vocal', vol: number) {
    if (track === 'vocal') {
      this.vocalGain?.setVolume(vol);
      return;
    }
    this.trackGains[track]?.setVolume(vol);
    if (track === 'drums') {
      this.drumSynth?.setVolume(vol);
    }
  }

  setLeadDrive(drive: LeadGuitarDrive) {
    const leadNode = this.trackGains['guitarLead'];
    if (leadNode instanceof LeadGuitarTrackGainNode) {
      leadNode.setDrive(drive);
    }
  }

  setMelodySound(sound: MelodySound) {
    this.melodySynth?.setSound(sound);
  }

  setGuitarAcoustics(model: GuitarModel, gauge: StringGauge) {
    const node = this.trackGains['guitarRhythm'];
    if (node instanceof GuitarRhythmTrackGainNode) {
      node.updateAcoustics(model, gauge);
    }
  }

  setAmbience3D(mode: Ambience3DMode) {
    if (!this.ctx || !this.reverbConvolver || !this.reverbWetGain) return;
    if (this.currentAmbience === mode) return;
    this.currentAmbience = mode;
    this.reverbConvolver.buffer = this.buildRoomImpulse(this.ctx, mode);
    const wet = mode === 'unplugged-hall' ? 0.36 : mode === 'wood-studio' ? 0.22 : 0.12;
    this.reverbWetGain.gain.setTargetAtTime(wet, this.ctx.currentTime, 0.05);
  }

  updateSong(song: SongProject) {
    this._currentSong = song;
    if (this.isPlayingFlag) {
      this.playbackFlat = flattenSong(song);
    }
  }

  /** เล่นเสียงพรีวิวโน้ตเดี่ยวทันที (สำหรับกดคีย์เปียโนใน Mini Piano Roll) */
  previewNote(midiPitch: number, durationSec = 0.45) {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: 44100, latencyHint: 'interactive' });
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    const dest = this.masterBus || this.ctx.destination;
    if (!this.trackGains['melody']) {
      this.trackGains['melody'] = new TrackGainNode(this.ctx, dest, 95, 0.0);
    }
    if (!this.melodySynth) {
      this.melodySynth = new MelodySynth(this.ctx, this.trackGains['melody'].input);
    }
    const now = this.ctx.currentTime + 0.01;
    this.melodySynth.playNote(midiPitch, 100, now, durationSec);
  }

  /** เล่นฟังเสียงเฉพาะห้องนี้ห้องเดียว (Audition Bar) */
  playBarAudition(song: SongProject, barIndex: number, onComplete?: () => void) {
    if (this.state !== 'ready' && this.state !== 'playing') {
      this.init(song).then(() => this.playBarAudition(song, barIndex, onComplete)).catch(() => {});
      return;
    }
    this.stop();
    const flat = flattenSong(song);
    if (barIndex < 0 || barIndex >= flat.length) return;

    this.playbackFlat = flat;
    this.isPlayingFlag = true;
    this.state = 'playing';

    if (this.ctx?.state === 'suspended') {
      this.ctx.resume();
    }

    this.activeBarIndex = barIndex;
    this.emitStatus();
    this.barChangeCbs.forEach((cb) => cb(barIndex));

    const planned = planBar(song, flat, barIndex);
    const now = (this.ctx?.currentTime ?? 0) + 0.05;

    for (const ev of planned.events) {
      const t = now + ev.t;
      if (ev.kind === 'note') {
        if (ev.track === 'melody') {
          if (isTrackOn(song, flat[barIndex].section, 'melody')) {
            this.melodySynth?.playNote(ev.midi, ev.vel, t, ev.dur);
          }
        } else {
          const inst = this.instruments[ev.track];
          if (inst && isTrackOn(song, flat[barIndex].section, ev.track)) {
            inst.start({
              note: ev.midi,
              velocity: ev.vel,
              time: t,
              duration: ev.dur,
              ampRelease: ev.release,
            });
          }
        }
      } else if (ev.kind === 'drum') {
        if (isTrackOn(song, flat[barIndex].section, 'drums')) {
          this.drumSynth?.hit(ev, t);
        }
      }
    }

    const barMs = planned.timing.barSec * 1000;
    this.currentBarTimer = setTimeout(() => {
      this.stop();
      onComplete?.();
    }, barMs + 250);
  }

  // ─── Playback ───

  play(song: SongProject, fromBar = 0) {
    if (this.state !== 'ready' && this.state !== 'playing') return;
    this.stop();

    const flat = flattenSong(song);
    if (flat.length === 0) return;

    this.playbackFlat = flat;
    this.isPlayingFlag = true;
    this.state = 'playing';

    if (this.ctx?.state === 'suspended') {
      this.ctx.resume();
    }

    const startAudioTime = (this.ctx?.currentTime ?? 0) + 0.08;
    this.nextBarAudioTime = startAudioTime;

    // Count-in
    if (song.countInEnabled && fromBar === 0) {
      this._scheduleCountIn(song, () => {
        this.nextBarAudioTime = Math.max((this.ctx?.currentTime ?? 0) + 0.04, this.nextBarAudioTime);
        this._playFromBar(song, fromBar);
      });
    } else {
      this._playFromBar(song, fromBar);
    }
  }

  private _scheduleCountIn(song: SongProject, onDone: () => void) {
    const ctx = this.ctx!;
    const events = planCountIn(song);
    const timing = getTiming(song);
    const now = ctx.currentTime + 0.05;

    events.forEach((e) => {
      if (e.kind === 'drum' && e.voice === 'click') {
        this.drumSynth?.hit(e as PlannedEvent & { kind: 'drum' }, now + e.t);
      }
    });

    this.nextBarAudioTime = now + timing.barSec;
    this.currentBarTimer = setTimeout(onDone, timing.barSec * 1000 + 40);
  }

  seekToBar(index: number) {
    if (!this.isPlayingFlag) return;
    const song = this._currentSong;
    if (!song) return;
    this._clearTimer();
    this.nextBarAudioTime = (this.ctx?.currentTime ?? 0) + 0.05;
    this._playFromBar(song, index);
  }

  private async getVocalBuffer(dataUrl: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    const cached = this.vocalBufferCache.get(dataUrl);
    if (cached) return cached;

    try {
      const base64Part = dataUrl.split(',')[1];
      if (!base64Part) return null;
      const binaryStr = atob(base64Part);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const buffer = await this.ctx.decodeAudioData(bytes.buffer.slice(0));
      // Bounded cache ป้องกัน Memory Leaks จากการอัดหลายสิบคลิป
      if (this.vocalBufferCache.size > 40) {
        const firstKey = this.vocalBufferCache.keys().next().value;
        if (firstKey) this.vocalBufferCache.delete(firstKey);
      }
      this.vocalBufferCache.set(dataUrl, buffer);
      return buffer;
    } catch {
      return null;
    }
  }

  private async playVocalClip(dataUrl: string, barAudioTime: number, offsetMs: number) {
    if (!this.ctx || !this.vocalGain) return;
    const buffer = await this.getVocalBuffer(dataUrl);
    if (!buffer || !this.isPlayingFlag || !this.ctx) return;

    if (this.activeVocalSource) {
      try {
        this.activeVocalSource.stop();
        this.activeVocalSource.disconnect();
      } catch {}
      this.activeVocalSource = null;
    }

    const vocalStartAudioTime = Math.max(this.ctx.currentTime, barAudioTime + (offsetMs / 1000));
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.vocalGain.input);
    src.onended = () => {
      try { src.disconnect(); } catch {}
      if (this.activeVocalSource === src) {
        this.activeVocalSource = null;
      }
    };
    this.activeVocalSource = src;
    src.start(vocalStartAudioTime);
  }

  private _currentSong: SongProject | null = null;

  private _playFromBar(song: SongProject, barIndex: number) {
    const activeSong = this._currentSong || song;
    this._currentSong = activeSong;
    this.playbackFlat = flattenSong(activeSong);
    const ctx = this.ctx!;
    const flat = this.playbackFlat;

    if (barIndex >= flat.length) {
      // จบเพลง
      this.isPlayingFlag = false;
      this.state = 'ready';
      this.activeBarIndex = -1;
      this.emitStatus();
      this.barChangeCbs.forEach((cb) => cb(-1));
      return;
    }

    this.activeBarIndex = barIndex;
    this.barChangeCbs.forEach((cb) => cb(barIndex));
    this.emitStatus();

    const planned = planBar(activeSong, flat, barIndex);
    const timing = planned.timing;

    // ล็อคเวลาบาร์ด้วย AudioContext clock โดยตรง ป้องกัน setTimeout jitter สะสม
    const now = Math.max(ctx.currentTime + 0.04, this.nextBarAudioTime);
    this.nextBarAudioTime = now + timing.barSec;

    // ปรับเสียงแตกกีตาร์ลีดตามท่อน (Per-Section Drive Override หรือค่าจากมิกเซอร์)
    const leadNode = this.trackGains['guitarLead'];
    if (leadNode instanceof LeadGuitarTrackGainNode) {
      const secDrive = flat[barIndex].section.instruments.guitarLeadDrive ?? activeSong.mixer.guitarLead.drive ?? 'overdrive';
      leadNode.setDrive(secDrive, now);
    }

    // Schedule events
    for (const ev of planned.events) {
      const t = now + ev.t;
      switch (ev.kind) {
        case 'note': {
          if (ev.track === 'melody') {
            if (!isTrackOn(activeSong, flat[barIndex].section, 'melody')) break;
            this.melodySynth?.playNote(ev.midi, ev.vel, t, ev.dur);
            break;
          }
          const inst = this.instruments[ev.track];
          if (!inst) break;
          if (!isTrackOn(activeSong, flat[barIndex].section, ev.track)) break;
          inst.start({
            note: ev.midi,
            velocity: ev.vel,
            time: t,
            duration: ev.dur,
            ampRelease: ev.release,
          });
          break;
        }
        case 'drum': {
          if (!isTrackOn(activeSong, flat[barIndex].section, 'drums')) break;
          this.drumSynth?.hit(ev, t);
          break;
        }
        case 'fade': {
          const tg = this.trackGains[ev.track];
          if (tg) tg.fade(t, ev.dur);
          break;
        }
        case 'restore': {
          const tg = this.trackGains[ev.track];
          if (tg) tg.restore(t);
          break;
        }
      }
    }

    // เล่นคลิปเสียงร้องสดประจำห้องนี้ (ถ้ามีบันทึกไว้) ด้วย Web Audio Buffer ที่เที่ยงตรงระดับ sample
    const vocalAudio = flat[barIndex].bar.vocalAudio;
    if (vocalAudio && (activeSong.mixer.vocal?.enabled ?? true)) {
      this.playVocalClip(vocalAudio, now, activeSong.vocalLatencyOffsetMs || 0);
    }

    // กำหนดเวลาตื่นเพื่อ schedule ห้องถัดไปล่วงหน้า 50ms ก่อนบาร์จบ
    const msUntilNext = Math.max(20, (this.nextBarAudioTime - ctx.currentTime - 0.05) * 1000);
    this.currentBarTimer = setTimeout(() => {
      if (!this.isPlayingFlag) return;
      this._playFromBar(activeSong, barIndex + 1);
    }, msUntilNext);
  }

  stop() {
    this._clearTimer();
    this.isPlayingFlag = false;
    this.nextBarAudioTime = 0;
    this._currentSong = null;

    if (this.activeVocalSource) {
      try {
        this.activeVocalSource.stop();
        this.activeVocalSource.disconnect();
      } catch {}
      this.activeVocalSource = null;
    }

    // หยุดเสียง smplr ทั้งหมด
    for (const inst of Object.values(this.instruments)) {
      inst?.stop();
    }

    // restore gain ทุก track (ป้องกันกรณีที่ fade ค้างอยู่)
    for (const tg of Object.values(this.trackGains)) {
      tg?.restore(this.ctx?.currentTime ?? 0);
    }

    if (this.state === 'playing') {
      this.state = 'ready';
    }
    this.activeBarIndex = -1;
    this.emitStatus();
    this.barChangeCbs.forEach((cb) => cb(-1));
  }

  private _clearTimer() {
    if (this.currentBarTimer !== null) {
      clearTimeout(this.currentBarTimer);
      this.currentBarTimer = null;
    }
  }

  dispose() {
    this.stop();
    for (const tg of Object.values(this.trackGains)) tg?.disconnect();
    this.vocalGain?.disconnect();
    this.vocalGain = null;
    this.reverbConvolver?.disconnect();
    this.reverbConvolver = null;
    this.reverbWetGain?.disconnect();
    this.reverbWetGain = null;
    this.currentAmbience = null;
    this.masterBus?.disconnect();
    this.masterBus = null;
    this.masterCompressor?.disconnect();
    this.masterCompressor = null;
    this.vocalBufferCache.clear();
    this.drumSynth?.dispose();
    this.melodySynth?.dispose();
    this.ctx?.close();
    this.ctx = null;
    this.instruments = {};
    this.trackGains = {};
    this.drumSynth = null;
    this.melodySynth = null;
    this.state = 'idle';
    this.emitStatus();
  }
}

// ─────────────────────────── Singleton ───────────────────────────

let _instance: AudioEngine | null = null;

export function getAudioEngine(): AudioEngine {
  if (!_instance) _instance = new AudioEngine();
  return _instance;
}

export type { AudioEngine };
