/**
 * audioDspShared.ts — Shared Isomorphic Web Audio DSP Chains (Live AudioContext + OfflineAudioContext)
 *
 * ใช้ร่วมกันระหว่าง `audioEngine.ts` (Real-time playback) และ `mp3Exporter.ts` (Offline bounce)
 * เพื่อรับประกันว่า Guitar Body Resonance, Lead Overdrive/Fuzz, Vocal Studio EQ/Compressor,
 * Synth Drums/Melody, 3D Room Impulse และ Auto-Ducking ให้เสียงตรงกัน 100%
 */

import {
  getSectionTrackVolume,
  type FlatBar,
  type PlannedEvent,
  type TrackId,
} from './barPlanner';
import { computeAutoDuckFactor } from './vocalBoothUtils';
import type {
  Ambience3DMode,
  GuitarModel,
  LeadGuitarDrive,
  MelodySound,
  SongProject,
  SongSection,
  StringGauge,
  VocalFxPreset,
} from '../types/song';

// ─────────────────────────── Constants & Mappings ───────────────────────────

/** แมปโมเดลกีตาร์ → ชื่อ instrument ใน smplr Soundfont */
export const GUITAR_INSTRUMENT: Record<GuitarModel, string> = {
  'dreadnought-steel': 'acoustic_guitar_steel',
  'classical-nylon': 'acoustic_guitar_nylon',
  'ovation-roundback': 'acoustic_guitar_steel',
  'gibson-les-paul': 'overdriven_guitar',
};

/** Pan ประจำ track (ค่า StereoPanner: -1 ถึง 1) */
export const TRACK_PAN: Record<TrackId, number> = {
  guitarRhythm: -0.32,
  guitarLead: 0.38,
  bass: 0.0,
  piano: 0.28,
  drums: 0.0,
  melody: 0.0,
};

/** ระดับเสียงเริ่มต้นสำหรับแต่ละ track (0–127) */
export const TRACK_DEFAULT_VOL: Record<TrackId, number> = {
  guitarRhythm: 100,
  guitarLead: 90,
  bass: 100,
  piano: 85,
  drums: 95,
  melody: 56,
};

/** เลือกชื่อ Soundfont ของกีตาร์ลีดตามโมเดลและค่า Drive */
export function resolveLeadSoundfontInstrument(song: SongProject): string {
  const leadModel = song.mixer.guitarLead.model || 'gibson-les-paul';
  if (leadModel === 'gibson-les-paul') {
    return song.mixer.guitarLead.drive === 'clean'
      ? 'electric_guitar_clean'
      : 'overdriven_guitar';
  }
  return GUITAR_INSTRUMENT[leadModel];
}

/** ระดับ Wet Gain ของ Reverb จำลองห้อง 3D */
export function getAmbienceWetGain(mode: Ambience3DMode): number {
  if (mode === 'unplugged-hall') return 0.36;
  if (mode === 'wood-studio') return 0.22;
  return 0.12;
}

/** สร้าง Impulse Response Buffer สำหรับ 3D Room Reverb (ใช้ได้ทั้ง AudioContext และ OfflineAudioContext) */
export function buildRoomImpulseBuffer(
  ctx: BaseAudioContext,
  mode: Ambience3DMode
): AudioBuffer {
  const rate = ctx.sampleRate || 44100;
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

function setParamAtTimeOrValue(param: AudioParam, value: number, t: number) {
  if (t <= 0 || typeof param.setValueAtTime !== 'function') {
    param.value = value;
    if (typeof param.setValueAtTime === 'function') {
      param.setValueAtTime(value, 0);
    }
    return;
  }
  param.setValueAtTime(value, t);
}

function setSmoothParamOrImmediate(
  param: AudioParam,
  value: number,
  t: number,
  rampSec = 0.04
) {
  if (t <= 0) {
    param.value = value;
    if (typeof param.setValueAtTime === 'function') {
      param.setValueAtTime(value, 0);
    }
    return;
  }
  if (typeof param.setTargetAtTime === 'function') {
    param.setTargetAtTime(value, t, rampSec);
  } else {
    param.value = value;
  }
}

// ─────────────────────────── Drum Synthesis ───────────────────────────

/**
 * สร้างเสียงกลอง/เพอร์คัชชันด้วย Web Audio synthesis (Isomorphic BaseAudioContext)
 * รองรับทั้ง Cajon/Shaker และ Acoustic Drum Kit ทั้งในการเล่นสดและเรนเดอร์ MP3
 */
export class DrumSynth {
  private ctx: BaseAudioContext;
  private out: GainNode;
  private noiseBuf: AudioBuffer;

  constructor(ctx: BaseAudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(destination);

    // Pre-allocate shared noise buffer (1.0 sec) to eliminate GC spikes on every drum hit
    const rate = ctx.sampleRate || 44100;
    const len = Math.max(1, Math.floor(rate * 1.0));
    this.noiseBuf = ctx.createBuffer(1, len, rate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  setVolume(v: number) {
    // v: 0–127
    this.out.gain.value = (Math.max(0, Math.min(127, v)) / 127) ** 1.5;
  }

  /** t = BaseAudioContext absolute time */
  hit(voice: PlannedEvent & { kind: 'drum' }, t: number) {
    const ctx = this.ctx;
    const vel = voice.vel / 127;
    const pan = voice.pan;

    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(this.out);

    switch (voice.voice) {
      case 'kick':
        this.kick(t, vel, panner);
        break;
      case 'snare':
        this.snare(t, vel, panner);
        break;
      case 'hat':
        this.hat(t, vel, panner);
        break;
      case 'openHat':
        this.openHat(t, vel, panner);
        break;
      case 'tomHigh':
        this.tomHigh(t, vel, panner);
        break;
      case 'tomLow':
        this.tomLow(t, vel, panner);
        break;
      case 'woodblock':
        this.woodblock(t, vel, panner);
        break;
      case 'crash':
        this.crash(t, vel, panner);
        break;
      case 'cajonThump':
        this.cajonThump(t, vel, panner);
        break;
      case 'cajonSlap':
        this.cajonSlap(t, vel, panner);
        break;
      case 'shaker':
        this.shaker(t, vel, panner);
        break;
      case 'click':
        this.click(t, vel, panner);
        break;
    }
  }

  private kick(t: number, vel: number, out: StereoPannerNode) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.08);
    gain.gain.setValueAtTime(Math.max(0.001, vel * 1.4), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(gain);
    gain.connect(out);
    osc.onended = () => {
      try { osc.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
      try { out.disconnect(); } catch {}
    };
    osc.start(t);
    osc.stop(t + 0.36);
  }

  private snare(t: number, vel: number, out: StereoPannerNode) {
    const ctx = this.ctx;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuf;
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 1800;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(Math.max(0.001, vel * 0.8), t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    noise.connect(hpf);
    hpf.connect(nGain);
    nGain.connect(out);

    noise.onended = () => {
      try { noise.disconnect(); } catch {}
      try { hpf.disconnect(); } catch {}
      try { nGain.disconnect(); } catch {}
      try { out.disconnect(); } catch {}
    };
    noise.start(t);
    noise.stop(t + 0.19);

    const osc = ctx.createOscillator();
    const oGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 220;
    oGain.gain.setValueAtTime(Math.max(0.001, vel * 0.4), t);
    oGain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(oGain);
    oGain.connect(out);
    osc.onended = () => {
      try { osc.disconnect(); } catch {}
      try { oGain.disconnect(); } catch {}
    };
    osc.start(t);
    osc.stop(t + 0.08);
  }

  private hat(t: number, vel: number, out: StereoPannerNode) {
    const ctx = this.ctx;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuf;
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 7000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.001, vel * 0.5), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    noise.connect(hpf);
    hpf.connect(gain);
    gain.connect(out);
    noise.onended = () => {
      try { noise.disconnect(); } catch {}
      try { hpf.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
      try { out.disconnect(); } catch {}
    };
    noise.start(t);
    noise.stop(t + 0.08);
  }

  private crash(t: number, vel: number, out: StereoPannerNode) {
    const ctx = this.ctx;
    const dur = 0.6;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuf;
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 5000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.001, vel * 0.6), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise.connect(hpf);
    hpf.connect(gain);
    gain.connect(out);
    noise.onended = () => {
      try { noise.disconnect(); } catch {}
      try { hpf.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
      try { out.disconnect(); } catch {}
    };
    noise.start(t);
    noise.stop(t + dur + 0.01);
  }

  private cajonThump(t: number, vel: number, out: StereoPannerNode) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.1);
    gain.gain.setValueAtTime(Math.max(0.001, vel * 1.2), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(gain);
    gain.connect(out);
    osc.onended = () => {
      try { osc.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
      try { out.disconnect(); } catch {}
    };
    osc.start(t);
    osc.stop(t + 0.29);
  }

  private cajonSlap(t: number, vel: number, out: StereoPannerNode) {
    const ctx = this.ctx;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuf;
    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = 900;
    bpf.Q.value = 1.4;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(Math.max(0.001, vel * 0.9), t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    noise.connect(bpf);
    bpf.connect(nGain);
    nGain.connect(out);
    noise.onended = () => {
      try { noise.disconnect(); } catch {}
      try { bpf.disconnect(); } catch {}
      try { nGain.disconnect(); } catch {}
      try { out.disconnect(); } catch {}
    };
    noise.start(t);
    noise.stop(t + 0.13);

    const osc = ctx.createOscillator();
    const oGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 400;
    oGain.gain.setValueAtTime(Math.max(0.001, vel * 0.3), t);
    oGain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    osc.connect(oGain);
    oGain.connect(out);
    osc.onended = () => {
      try { osc.disconnect(); } catch {}
      try { oGain.disconnect(); } catch {}
    };
    osc.start(t);
    osc.stop(t + 0.04);
  }

  private shaker(t: number, vel: number, out: StereoPannerNode) {
    const ctx = this.ctx;
    const dur = 0.05;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuf;
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 5500;
    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = 9000;
    bpf.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.001, vel * 0.4), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise.connect(hpf);
    hpf.connect(bpf);
    bpf.connect(gain);
    gain.connect(out);
    noise.onended = () => {
      try { noise.disconnect(); } catch {}
      try { hpf.disconnect(); } catch {}
      try { bpf.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
      try { out.disconnect(); } catch {}
    };
    noise.start(t);
    noise.stop(t + dur + 0.01);
  }

  private click(t: number, vel: number, out: StereoPannerNode) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1200;
    gain.gain.setValueAtTime(Math.max(0.001, vel * 0.6), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
    osc.connect(gain);
    gain.connect(out);
    osc.onended = () => {
      try { osc.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
      try { out.disconnect(); } catch {}
    };
    osc.start(t);
    osc.stop(t + 0.03);
  }

  private openHat(t: number, vel: number, out: StereoPannerNode) {
    const ctx = this.ctx;
    const dur = 0.24;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuf;
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 6200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.001, vel * 0.48), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise.connect(hpf);
    hpf.connect(gain);
    gain.connect(out);
    noise.onended = () => {
      try { noise.disconnect(); } catch {}
      try { hpf.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
      try { out.disconnect(); } catch {}
    };
    noise.start(t);
    noise.stop(t + dur + 0.01);
  }

  private tomHigh(t: number, vel: number, out: StereoPannerNode) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(195, t);
    osc.frequency.exponentialRampToValueAtTime(105, t + 0.16);
    gain.gain.setValueAtTime(Math.max(0.001, vel * 0.78), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.20);
    osc.connect(gain);
    gain.connect(out);
    osc.onended = () => {
      try { osc.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
      try { out.disconnect(); } catch {}
    };
    osc.start(t);
    osc.stop(t + 0.21);
  }

  private tomLow(t: number, vel: number, out: StereoPannerNode) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, t);
    osc.frequency.exponentialRampToValueAtTime(68, t + 0.22);
    gain.gain.setValueAtTime(Math.max(0.001, vel * 0.84), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    osc.connect(gain);
    gain.connect(out);
    osc.onended = () => {
      try { osc.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
      try { out.disconnect(); } catch {}
    };
    osc.start(t);
    osc.stop(t + 0.27);
  }

  private woodblock(t: number, vel: number, out: StereoPannerNode) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const bpf = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1850, t);
    osc.frequency.exponentialRampToValueAtTime(950, t + 0.04);
    bpf.type = 'bandpass';
    bpf.frequency.value = 950;
    bpf.Q.value = 3.5;
    gain.gain.setValueAtTime(Math.max(0.001, vel * 0.65), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(bpf);
    bpf.connect(gain);
    gain.connect(out);
    osc.onended = () => {
      try { osc.disconnect(); } catch {}
      try { bpf.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
      try { out.disconnect(); } catch {}
    };
    osc.start(t);
    osc.stop(t + 0.07);
  }

  dispose() {
    try { this.out.disconnect(); } catch {}
  }
}

// ─────────────────────────── Melody Synthesis ───────────────────────────

/**
 * MelodySynth — เครื่องยนต์สร้างเสียงทำนองไกด์ (Vocal Melody Guide Synth, Isomorphic BaseAudioContext)
 * รองรับเสียง 'flute' (Vibrato), 'piano', 'bell'
 */
export class MelodySynth {
  private ctx: BaseAudioContext;
  private out: GainNode;
  private currentSound: MelodySound = 'flute';

  constructor(ctx: BaseAudioContext, destination: AudioNode) {
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
    const v = Math.max(0.001, (vel / 127) * 0.75);
    const safeDur = Math.max(0.08, dur);
    const endT = t + safeDur;

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
        filter.frequency.setValueAtTime(1850, t);

        const attack = 0.04;
        const release = 0.095;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(v * 0.62, t + attack);
        gain.gain.setValueAtTime(v * 0.62, Math.max(t + attack, endT - release));
        gain.gain.exponentialRampToValueAtTime(0.0001, endT + release);

        const osc1Gain = ctx.createGain();
        osc1Gain.gain.value = 0.82;
        const osc2Gain = ctx.createGain();
        osc2Gain.gain.value = 0.18;

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
        gain.gain.exponentialRampToValueAtTime(
          Math.max(0.001, v * 0.4),
          t + Math.max(attack + 0.02, Math.min(safeDur * 0.5, 0.4))
        );
        gain.gain.exponentialRampToValueAtTime(0.0001, endT + release);

        const m1 = ctx.createGain();
        m1.gain.value = 0.65;
        const m2 = ctx.createGain();
        m2.gain.value = 0.35;
        osc1.connect(m1);
        osc2.connect(m2);
        m1.connect(filter);
        m2.connect(filter);
        filter.connect(gain);
        gain.connect(this.out);

        osc1.onended = () => {
          try { osc1.disconnect(); } catch {}
          try { osc2.disconnect(); } catch {}
          try { m1.disconnect(); } catch {}
          try { m2.disconnect(); } catch {}
          try { filter.disconnect(); } catch {}
          try { gain.disconnect(); } catch {}
        };

        osc1.start(t);
        osc2.start(t);
        osc1.stop(endT + release + 0.05);
        osc2.stop(endT + release + 0.05);
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
          const decay = Math.min(1.8, safeDur + 0.4) / (idx + 1);
          g.gain.setValueAtTime(Math.max(0.0002, v * weights[idx]), t);
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
    try { this.out.disconnect(); } catch {}
  }
}

// ─────────────────────────── TrackGain DSP Nodes ───────────────────────────

/** GainNode ต่อ track สำหรับ fade/restore/mixer volume (ใช้ได้ทั้ง Live และ Offline) */
export class TrackGainNode {
  protected masterGain: GainNode;
  protected fadeGain: GainNode;
  protected panner: StereoPannerNode;
  readonly input: GainNode;

  constructor(ctx: BaseAudioContext, destination: AudioNode, vol: number, pan: number) {
    this.masterGain = ctx.createGain();
    this.fadeGain = ctx.createGain();
    this.input = ctx.createGain();

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
    this.masterGain.gain.value = (Math.max(0, Math.min(127, v)) / 127) ** 1.5;
  }

  /** ตั้งระดับเสียง ณ เวลาเจาะจงบน timeline (สำคัญสำหรับ OfflineAudioContext Section Mix & Auto-Ducking) */
  setVolumeAt(v: number, t: number) {
    const gainVal = (Math.max(0, Math.min(127, v)) / 127) ** 1.5;
    setParamAtTimeOrValue(this.masterGain.gain, gainVal, t);
  }

  fade(t: number, dur: number) {
    this.fadeGain.gain.cancelScheduledValues(t);
    this.fadeGain.gain.setValueAtTime(this.fadeGain.gain.value, t);
    this.fadeGain.gain.linearRampToValueAtTime(0, t + Math.max(0.01, dur));
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
export class GuitarRhythmTrackGainNode extends TrackGainNode {
  private bodyResonance: BiquadFilterNode;
  private highAir: BiquadFilterNode;

  constructor(
    ctx: BaseAudioContext,
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
export function makeGuitarDistortionCurve(samples = 4096): Float32Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(samples * 4);
  const curve = new Float32Array(buffer);
  for (let i = 0; i < samples; ++i) {
    const x = (i * 2) / samples - 1;
    const biased = x + 0.08 * (x * x - 0.25);
    curve[i] = Math.tanh(biased * 2.2);
  }
  return curve;
}

/** สร้าง Curve จำลองเสียงแตก Fuzz / High-Gain Hard-Clip (Sharp Harmonic Crunch) */
export function makeGuitarFuzzCurve(samples = 4096): Float32Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(samples * 4);
  const curve = new Float32Array(buffer);
  for (let i = 0; i < samples; ++i) {
    const x = (i * 2) / samples - 1;
    const driven = x * 6.5;
    const clipped = Math.max(-0.92, Math.min(0.92, driven / (1 + 0.35 * Math.abs(driven))));
    curve[i] = Math.tanh(clipped * 1.85 + 0.14 * x * x);
  }
  return curve;
}

export interface LeadDriveDSPParams {
  normalizedDrive: 'clean' | 'crunch' | 'overdrive' | 'distortion';
  curveType: 'tube' | 'fuzz';
  dry: number;
  wet: number;
  pre: number;
  cabFreq: number;
  cabQ: number;
  toneFreq: number;
  toneGainDb: number;
  post: number;
  vibDepth: number;
}

/** แมปค่า LeadGuitarDrive (รวม alias 'fuzz') เป็นพารามิเตอร์ DSP ที่แยกคาแรกเตอร์ชัดเจน */
export function getLeadDriveDSPParams(drive: LeadGuitarDrive): LeadDriveDSPParams {
  const normalized = drive === 'fuzz' ? 'distortion' : drive;
  switch (normalized) {
    case 'clean':
      return {
        normalizedDrive: 'clean',
        curveType: 'tube',
        dry: 1.0,
        wet: 0.0,
        pre: 1.0,
        cabFreq: 6200,
        cabQ: 0.9,
        toneFreq: 2500,
        toneGainDb: 0.5,
        post: 0.78,
        vibDepth: 0.0003,
      };
    case 'crunch':
      return {
        normalizedDrive: 'crunch',
        curveType: 'tube',
        dry: 0.25,
        wet: 0.85,
        pre: 3.2,
        cabFreq: 4800,
        cabQ: 1.1,
        toneFreq: 1400,
        toneGainDb: 2.5,
        post: 0.58,
        vibDepth: 0.0005,
      };
    case 'overdrive':
      return {
        normalizedDrive: 'overdrive',
        curveType: 'tube',
        dry: 0.05,
        wet: 1.0,
        pre: 7.2,
        cabFreq: 4100,
        cabQ: 1.25,
        toneFreq: 950,
        toneGainDb: 4.5,
        post: 0.45,
        vibDepth: 0.0007,
      };
    case 'distortion':
    default:
      return {
        normalizedDrive: 'distortion',
        curveType: 'fuzz',
        dry: 0.0,
        wet: 1.3,
        pre: 16.0,
        cabFreq: 4900,
        cabQ: 1.85,
        toneFreq: 2150,
        toneGainDb: 7.0,
        post: 0.34,
        vibDepth: 0.00085,
      };
  }
}

/**
 * LeadGuitarTrackGainNode — Channel กีตาร์ลีดพร้อมเอฟเฟกต์ Overdrive / Distortion + Tone EQ + Cabinet Sim
 * Signal Chain:
 *   input -> dryGain -----------------------------------------------------------------> sumNode -> vibrato -> masterGain
 *         \-> preFilter (HPF 110Hz) -> preGain -> waveShaper -> toneFilter -> cabFilter -> postGain -> wetGain -/
 */
export class LeadGuitarTrackGainNode extends TrackGainNode {
  private ctx: BaseAudioContext;
  private preFilter: BiquadFilterNode;
  private preGain: GainNode;
  private waveShaper: WaveShaperNode;
  private toneFilter: BiquadFilterNode;
  private cabFilter: BiquadFilterNode;
  private postGain: GainNode;
  private wetGain: GainNode;
  private dryGain: GainNode;
  private tubeCurve: Float32Array<ArrayBuffer>;
  private fuzzCurve: Float32Array<ArrayBuffer>;
  private currentDrive: 'clean' | 'crunch' | 'overdrive' | 'distortion' = 'clean';

  private vibratoDelay: DelayNode;
  private vibratoLfo: OscillatorNode;
  private vibratoDepth: GainNode;
  private sumNode: GainNode;
  private vibratoDirect: GainNode;
  private vibratoWet: GainNode;

  constructor(ctx: BaseAudioContext, destination: AudioNode, vol: number, pan: number) {
    super(ctx, destination, vol, pan);
    this.ctx = ctx;

    this.input.disconnect(this.masterGain);

    this.tubeCurve = makeGuitarDistortionCurve(4096);
    this.fuzzCurve = makeGuitarFuzzCurve(4096);

    // 1. Pre-filter: ตัด sub-bass rumble ก่อนอัดเข้า WaveShaper
    this.preFilter = ctx.createBiquadFilter();
    this.preFilter.type = 'highpass';
    this.preFilter.frequency.value = 110;

    // 2. Drive Pre-Gain
    this.preGain = ctx.createGain();
    this.preGain.gain.value = 1.0;

    // 3. WaveShaper: Tube / Fuzz
    this.waveShaper = ctx.createWaveShaper();
    this.waveShaper.curve = this.tubeCurve;
    this.waveShaper.oversample = '4x';

    // 4. Tone EQ (Peaking)
    this.toneFilter = ctx.createBiquadFilter();
    this.toneFilter.type = 'peaking';
    this.toneFilter.frequency.value = 2500;
    this.toneFilter.Q.value = 1.2;
    this.toneFilter.gain.value = 0.5;

    // 5. Cabinet Filter
    this.cabFilter = ctx.createBiquadFilter();
    this.cabFilter.type = 'lowpass';
    this.cabFilter.frequency.value = 6200;
    this.cabFilter.Q.value = 0.9;

    // 6. Post Gain
    this.postGain = ctx.createGain();
    this.postGain.gain.value = 0.78;

    // 7. Wet / Dry blend
    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = 0.0;

    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1.0;

    // 8. Vibrato & Singing Sustain circuit
    this.vibratoDelay = ctx.createDelay();
    this.vibratoDelay.delayTime.value = 0.0035;

    this.vibratoLfo = ctx.createOscillator();
    this.vibratoLfo.type = 'sine';
    this.vibratoLfo.frequency.value = 5.0;

    this.vibratoDepth = ctx.createGain();
    this.vibratoDepth.gain.value = 0.00055;

    this.vibratoLfo.connect(this.vibratoDepth);
    this.vibratoDepth.connect(this.vibratoDelay.delayTime);
    this.vibratoLfo.start();

    // 9. Junction sum & stereo blend
    this.sumNode = ctx.createGain();
    this.vibratoDirect = ctx.createGain();
    this.vibratoDirect.gain.value = 0.4;
    this.vibratoWet = ctx.createGain();
    this.vibratoWet.gain.value = 0.65;

    // Wet chain
    this.input.connect(this.preFilter);
    this.preFilter.connect(this.preGain);
    this.preGain.connect(this.waveShaper);
    this.waveShaper.connect(this.toneFilter);
    this.toneFilter.connect(this.cabFilter);
    this.cabFilter.connect(this.postGain);
    this.postGain.connect(this.wetGain);
    this.wetGain.connect(this.sumNode);

    // Dry chain
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.sumNode);

    // Sum -> Vibrato -> Master
    this.sumNode.connect(this.vibratoDirect);
    this.vibratoDirect.connect(this.masterGain);

    this.sumNode.connect(this.vibratoDelay);
    this.vibratoDelay.connect(this.vibratoWet);
    this.vibratoWet.connect(this.masterGain);
  }

  setDrive(drive: LeadGuitarDrive, t: number = 0) {
    const params = getLeadDriveDSPParams(drive);
    if (this.currentDrive === params.normalizedDrive) return;
    this.currentDrive = params.normalizedDrive;

    const ctxTime = t > 0 ? t : this.ctx.currentTime;
    const ramp = 0.04;

    this.waveShaper.curve = params.curveType === 'fuzz' ? this.fuzzCurve : this.tubeCurve;

    setSmoothParamOrImmediate(this.dryGain.gain, params.dry, ctxTime, ramp);
    setSmoothParamOrImmediate(this.wetGain.gain, params.wet, ctxTime, ramp);
    setSmoothParamOrImmediate(this.preGain.gain, params.pre, ctxTime, ramp);
    setSmoothParamOrImmediate(this.toneFilter.frequency, params.toneFreq, ctxTime, ramp);
    setSmoothParamOrImmediate(this.toneFilter.gain, params.toneGainDb, ctxTime, ramp);
    setSmoothParamOrImmediate(this.cabFilter.frequency, params.cabFreq, ctxTime, ramp);
    setSmoothParamOrImmediate(this.cabFilter.Q, params.cabQ, ctxTime, ramp);
    setSmoothParamOrImmediate(this.postGain.gain, params.post, ctxTime, ramp);
    setSmoothParamOrImmediate(this.vibratoDepth.gain, params.vibDepth, ctxTime, ramp);
  }

  override disconnect() {
    super.disconnect();
    try { this.preFilter.disconnect(); } catch {}
    try { this.preGain.disconnect(); } catch {}
    try { this.waveShaper.disconnect(); } catch {}
    try { this.toneFilter.disconnect(); } catch {}
    try { this.cabFilter.disconnect(); } catch {}
    try { this.postGain.disconnect(); } catch {}
    try { this.wetGain.disconnect(); } catch {}
    try { this.dryGain.disconnect(); } catch {}
    try {
      this.vibratoLfo.stop();
      this.vibratoLfo.disconnect();
    } catch {}
    try { this.vibratoDepth.disconnect(); } catch {}
    try { this.vibratoDelay.disconnect(); } catch {}
    try { this.vibratoDirect.disconnect(); } catch {}
    try { this.vibratoWet.disconnect(); } catch {}
    try { this.sumNode.disconnect(); } catch {}
  }
}

/**
 * VocalStudioTrackGainNode — Vocal Studio DSP Chain:
 *  input -> hpf (95Hz highpass) -> presenceEq (3.8kHz +2.5dB peaking, Q: 1.1)
 *        -> vocalComp (-18dB, 4:1, 8ms/120ms) -> masterGain -> fadeGain -> panner -> destination
 */
export class VocalStudioTrackGainNode extends TrackGainNode {
  private audioCtx: BaseAudioContext;
  private hpf: BiquadFilterNode;
  private presenceEq: BiquadFilterNode;
  private vocalComp: DynamicsCompressorNode;
  private chorusDelay: DelayNode | null = null;
  private chorusWetGain: GainNode | null = null;
  private currentPreset: VocalFxPreset = 'studio-warm';

  constructor(
    ctx: BaseAudioContext,
    destination: AudioNode,
    vol: number,
    pan: number,
    preset: VocalFxPreset = 'studio-warm'
  ) {
    super(ctx, destination, vol, pan);
    this.audioCtx = ctx;

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

    if (typeof ctx.createDelay === 'function') {
      this.chorusDelay = ctx.createDelay(0.1);
      this.chorusDelay.delayTime.value = 0.018;
      this.chorusWetGain = ctx.createGain();
      this.chorusWetGain.gain.value = 0.10;
      this.vocalComp.connect(this.chorusDelay);
      this.chorusDelay.connect(this.chorusWetGain);
      this.chorusWetGain.connect(this.masterGain);
    }

    if (preset !== 'studio-warm') {
      this.setFxPreset(preset);
    }
  }

  setFxPreset(preset: VocalFxPreset, t?: number) {
    if (this.currentPreset === preset) return;
    this.currentPreset = preset;
    const now = t !== undefined ? t : this.audioCtx.currentTime;

    if (preset === 'dry-natural') {
      setSmoothParamOrImmediate(this.hpf.frequency, 95, now, 0.02);
      setSmoothParamOrImmediate(this.presenceEq.gain, 0.8, now, 0.02);
      setSmoothParamOrImmediate(this.vocalComp.threshold, -14, now, 0.02);
      setSmoothParamOrImmediate(this.vocalComp.ratio, 2.5, now, 0.02);
      if (this.chorusWetGain) setSmoothParamOrImmediate(this.chorusWetGain.gain, 0, now, 0.02);
    } else if (preset === 'wide-chorus') {
      setSmoothParamOrImmediate(this.hpf.frequency, 105, now, 0.02);
      setSmoothParamOrImmediate(this.presenceEq.gain, 3.6, now, 0.02);
      setSmoothParamOrImmediate(this.vocalComp.threshold, -20, now, 0.02);
      setSmoothParamOrImmediate(this.vocalComp.ratio, 4.5, now, 0.02);
      if (this.chorusWetGain) setSmoothParamOrImmediate(this.chorusWetGain.gain, 0.28, now, 0.02);
    } else {
      // studio-warm
      setSmoothParamOrImmediate(this.hpf.frequency, 95, now, 0.02);
      setSmoothParamOrImmediate(this.presenceEq.gain, 2.5, now, 0.02);
      setSmoothParamOrImmediate(this.vocalComp.threshold, -18, now, 0.02);
      setSmoothParamOrImmediate(this.vocalComp.ratio, 4, now, 0.02);
      if (this.chorusWetGain) setSmoothParamOrImmediate(this.chorusWetGain.gain, 0.10, now, 0.02);
    }
  }

  override disconnect() {
    super.disconnect();
    try { this.hpf.disconnect(); } catch {}
    try { this.presenceEq.disconnect(); } catch {}
    try { this.vocalComp.disconnect(); } catch {}
    try { this.chorusDelay?.disconnect(); } catch {}
    try { this.chorusWetGain?.disconnect(); } catch {}
  }
}

/**
 * BassTrackGainNode — Studio Bass Channel EQ (Isomorphic BaseAudioContext)
 * เติม Sub-bass warmth (75 Hz +2.5 dB) และคัตย่านโคลน (320 Hz -2.5 dB) ให้เบสแน่นไม่ทับกีตาร์
 */
export class BassTrackGainNode extends TrackGainNode {
  private subShelf: BiquadFilterNode;
  private mudCut: BiquadFilterNode;

  constructor(ctx: BaseAudioContext, destination: AudioNode, vol: number, pan: number) {
    super(ctx, destination, vol, pan);

    this.input.disconnect(this.masterGain);

    this.subShelf = ctx.createBiquadFilter();
    this.subShelf.type = 'lowshelf';
    this.subShelf.frequency.value = 75;
    this.subShelf.gain.value = 2.5;

    this.mudCut = ctx.createBiquadFilter();
    this.mudCut.type = 'peaking';
    this.mudCut.frequency.value = 320;
    this.mudCut.Q.value = 1.1;
    this.mudCut.gain.value = -2.5;

    this.input.connect(this.subShelf);
    this.subShelf.connect(this.mudCut);
    this.mudCut.connect(this.masterGain);
  }

  override disconnect() {
    super.disconnect();
    try { this.subShelf.disconnect(); } catch {}
    try { this.mudCut.disconnect(); } catch {}
  }
}

/**
 * PianoTrackGainNode — Studio Piano / Keys Channel EQ (Isomorphic BaseAudioContext)
 * กรองย่านต่ำ (< 140 Hz) หลีกทางให้ Bass & Kick พร้อมยก Air Sparkle (4.5 kHz +1.5 dB)
 */
export class PianoTrackGainNode extends TrackGainNode {
  private hpf: BiquadFilterNode;
  private airShelf: BiquadFilterNode;

  constructor(ctx: BaseAudioContext, destination: AudioNode, vol: number, pan: number) {
    super(ctx, destination, vol, pan);

    this.input.disconnect(this.masterGain);

    this.hpf = ctx.createBiquadFilter();
    this.hpf.type = 'highpass';
    this.hpf.frequency.value = 140;
    this.hpf.Q.value = 0.707;

    this.airShelf = ctx.createBiquadFilter();
    this.airShelf.type = 'highshelf';
    this.airShelf.frequency.value = 4500;
    this.airShelf.gain.value = 1.5;

    this.input.connect(this.hpf);
    this.hpf.connect(this.airShelf);
    this.airShelf.connect(this.masterGain);
  }

  override disconnect() {
    super.disconnect();
    try { this.hpf.disconnect(); } catch {}
    try { this.airShelf.disconnect(); } catch {}
  }
}

// ─────────────────────────── Shared Section Mix & Offline Bus Builder ───────────────────────────

export interface EffectiveBarMix {
  volumes: Record<TrackId, number>;
  leadDrive: LeadGuitarDrive;
  duckFactor: number;
}

/**
 * คำนวณระดับความดังจริงรายท่อน + Auto-Ducking (-2dB เมื่อมีเสียงร้อง Active)
 * ใช้สูตรเดียวกันทั้งระหว่างเล่นสด (audioEngine) และส่งออก MP3 (mp3Exporter)
 */
export function computeEffectiveBarMix(
  song: SongProject,
  section: SongSection | undefined,
  flatBar?: FlatBar,
  barIndex?: number,
  options?: { instrumentalOnly?: boolean; excludeMelodyGuide?: boolean }
): EffectiveBarMix {
  const duckFactor = options?.instrumentalOnly
    ? 1.0
    : flatBar && barIndex !== undefined
      ? computeAutoDuckFactor(song, flatBar, barIndex)
      : 1.0;

  const volumes = {} as Record<TrackId, number>;
  const tracks: TrackId[] = ['guitarRhythm', 'guitarLead', 'bass', 'piano', 'drums', 'melody'];

  for (const track of tracks) {
    if (track === 'melody') {
      const mCfg = song.mixer.melody;
      const mEnabled = !options?.excludeMelodyGuide && (mCfg ? mCfg.enabled : true);
      const secVol = section ? getSectionTrackVolume(section, 'melody') : 100;
      volumes.melody = mEnabled
        ? Math.round(((mCfg?.volume ?? TRACK_DEFAULT_VOL.melody) * secVol) / 100)
        : 0;
      continue;
    }

    const mixerConf = song.mixer[track];
    const baseEnabled =
      track === 'drums' ? mixerConf.enabled && mixerConf.style !== 'off' : mixerConf.enabled;
    const secEnabled = section ? section.instruments[track] : true;
    const secVol = section ? getSectionTrackVolume(section, track) : 100;
    const trackDuck = track === 'guitarRhythm' || track === 'piano' ? duckFactor : 1.0;
    volumes[track] =
      baseEnabled && secEnabled
        ? Math.round((mixerConf.volume * secVol * trackDuck) / 100)
        : 0;
  }

  const leadDrive = section?.instruments.guitarLeadDrive ?? song.mixer.guitarLead.drive ?? 'overdrive';
  return { volumes, leadDrive, duckFactor };
}

export interface OfflineTrackBusSet {
  trackGains: Record<TrackId, TrackGainNode>;
  vocalGain: VocalStudioTrackGainNode;
  drumSynth: DrumSynth;
  melodySynth: MelodySynth;
  applyBarMix: (fb: FlatBar, barIndex: number, barStartSec: number) => EffectiveBarMix;
  disconnectAll: () => void;
}

/**
 * สร้างโครงสร้าง Bus & DSP ทั้งหมดสำหรับ OfflineAudioContext (Parity 100% กับ Live AudioEngine)
 */
export function createOfflineTrackBusSet(
  ctx: BaseAudioContext,
  song: SongProject,
  destination: AudioNode,
  options?: { instrumentalOnly?: boolean; excludeMelodyGuide?: boolean }
): OfflineTrackBusSet {
  const isInstrumental = Boolean(options?.instrumentalOnly);
  const excludeMelodyGuide = Boolean(options?.excludeMelodyGuide);

  const trackGains: Record<TrackId, TrackGainNode> = {
    guitarRhythm: new GuitarRhythmTrackGainNode(
      ctx,
      destination,
      song.mixer.guitarRhythm.volume ?? TRACK_DEFAULT_VOL.guitarRhythm,
      TRACK_PAN.guitarRhythm,
      song.guitarModel,
      song.stringGauge
    ),
    guitarLead: new LeadGuitarTrackGainNode(
      ctx,
      destination,
      song.mixer.guitarLead.volume ?? TRACK_DEFAULT_VOL.guitarLead,
      TRACK_PAN.guitarLead
    ),
    bass: new BassTrackGainNode(
      ctx,
      destination,
      song.mixer.bass.volume ?? TRACK_DEFAULT_VOL.bass,
      TRACK_PAN.bass
    ),
    piano: new PianoTrackGainNode(
      ctx,
      destination,
      song.mixer.piano.volume ?? TRACK_DEFAULT_VOL.piano,
      TRACK_PAN.piano
    ),
    drums: new TrackGainNode(
      ctx,
      destination,
      song.mixer.drums.volume ?? TRACK_DEFAULT_VOL.drums,
      TRACK_PAN.drums
    ),
    melody: new TrackGainNode(
      ctx,
      destination,
      excludeMelodyGuide ? 0 : (song.mixer.melody?.volume ?? TRACK_DEFAULT_VOL.melody),
      TRACK_PAN.melody
    ),
  };

  (trackGains.guitarLead as LeadGuitarTrackGainNode).setDrive(
    song.mixer.guitarLead.drive ?? 'overdrive',
    0
  );

  const vocalEnabled = !isInstrumental && (song.mixer.vocal?.enabled ?? true);
  const vocalVol = vocalEnabled ? (song.mixer.vocal?.volume ?? 95) : 0;
  const activeTakePreset = (song.vocalTakes || []).find((t) => t.isActive && !!t.audioDataUrl)?.fxPreset;
  const vocalPreset = song.mixer.vocal?.fxPreset ?? activeTakePreset ?? 'studio-warm';

  const vocalGain = new VocalStudioTrackGainNode(ctx, destination, vocalVol, 0.0, vocalPreset);
  const drumSynth = new DrumSynth(ctx, trackGains.drums.input);
  const melodySynth = new MelodySynth(ctx, trackGains.melody.input);
  melodySynth.setSound(song.mixer.melody?.sound ?? 'flute');

  const applyBarMix = (fb: FlatBar, barIndex: number, barStartSec: number): EffectiveBarMix => {
    const mix = computeEffectiveBarMix(song, fb.section, fb, barIndex, {
      instrumentalOnly: isInstrumental,
      excludeMelodyGuide,
    });
    const allTracks: TrackId[] = ['guitarRhythm', 'guitarLead', 'bass', 'piano', 'drums', 'melody'];
    for (const tr of allTracks) {
      trackGains[tr].setVolumeAt(mix.volumes[tr], barStartSec);
    }
    (trackGains.guitarLead as LeadGuitarTrackGainNode).setDrive(mix.leadDrive, barStartSec);
    return mix;
  };

  const disconnectAll = () => {
    for (const tg of Object.values(trackGains)) {
      tg.disconnect();
    }
    vocalGain.disconnect();
    drumSynth.dispose();
    melodySynth.dispose();
  };

  return {
    trackGains,
    vocalGain,
    drumSynth,
    melodySynth,
    applyBarMix,
    disconnectAll,
  };
}
