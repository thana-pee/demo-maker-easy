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

import { Soundfont, CacheStorage, type Smplr } from 'smplr';
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
import type {
  SongProject,
  SongSection,
  GuitarModel,
  LeadGuitarDrive,
  MelodySound,
  StringGauge,
  Ambience3DMode,
  VocalFxPreset,
} from '../types/song';
import {
  computeAutoDuckFactor,
  computeTakePlaybackSlice,
  computeVocalTakePlaybackPlan,
  isAiTtsVocalTake,
  resolveVocalTakeBarSpan,
} from './vocalBoothUtils';
import {
  trimAudioBufferLeadingSilence,
  trimAudioBufferTrailingSilence,
  prepareAiTtsAudioBufferForSpan,
} from './audioTrim';
import {
  GUITAR_INSTRUMENT,
  TRACK_PAN,
  TRACK_DEFAULT_VOL,
  resolveLeadSoundfontInstrument,
  getAmbienceWetGain,
  buildRoomImpulseBuffer,
  DrumSynth,
  MelodySynth,
  TrackGainNode,
  GuitarRhythmTrackGainNode,
  makeGuitarDistortionCurve,
  makeGuitarFuzzCurve,
  getLeadDriveDSPParams,
  LeadGuitarTrackGainNode,
  BassTrackGainNode,
  PianoTrackGainNode,
  VocalStudioTrackGainNode,
  computeEffectiveBarMix,
  type LeadDriveDSPParams,
} from './audioDspShared';

export {
  GUITAR_INSTRUMENT,
  TRACK_PAN,
  TRACK_DEFAULT_VOL,
  resolveLeadSoundfontInstrument,
  getAmbienceWetGain,
  buildRoomImpulseBuffer,
  DrumSynth,
  MelodySynth,
  TrackGainNode,
  GuitarRhythmTrackGainNode,
  makeGuitarDistortionCurve,
  makeGuitarFuzzCurve,
  getLeadDriveDSPParams,
  LeadGuitarTrackGainNode,
  BassTrackGainNode,
  PianoTrackGainNode,
  VocalStudioTrackGainNode,
  type LeadDriveDSPParams,
};
export { computeAutoDuckFactor };

// ─────────────────────────── Types ───────────────────────────

export type EngineState = 'idle' | 'loading' | 'ready' | 'playing' | 'error';

export interface LoopRange {
  startBar: number;
  endBar: number; // inclusive 0-based global bar index
}

export interface EngineStatus {
  state: EngineState;
  loadProgress: number;    // 0–1
  activeBarIndex: number;  // -1 = ไม่ได้เล่น, 0+ = ห้องที่กำลังเล่น
  loopRange?: LoopRange | null;
  error?: string;
}

export interface PlayOptions {
  /** เล่นเฉพาะช่วงท่อนนี้แล้วหยุดอัตโนมัติ (ไม่วนลูป) */
  playRangeOnce?: LoopRange | null;
}

/** คำนวณ index ของห้องถัดไปแบบ Pure (รองรับ Single-Bar / Section Loop) */
export function resolveNextBarIndex(
  currentBar: number,
  totalBars: number,
  loopRange?: LoopRange | null
): number {
  if (totalBars <= 0) return -1;
  if (
    loopRange &&
    loopRange.startBar >= 0 &&
    loopRange.startBar < totalBars &&
    loopRange.endBar >= loopRange.startBar
  ) {
    const effectiveEnd = Math.min(loopRange.endBar, totalBars - 1);
    if (currentBar >= effectiveEnd) {
      return loopRange.startBar;
    }
    if (currentBar < loopRange.startBar) {
      return loopRange.startBar;
    }
    return currentBar + 1;
  }
  const next = currentBar + 1;
  return next < totalBars ? next : -1;
}

/** คำนวณ index ของห้องถัดไป โดยเคารพ playBounds (Play-Section-Once) ก่อน loopRange */
export function resolvePlaybackNextBar(
  currentBar: number,
  totalBars: number,
  loopRange?: LoopRange | null,
  playBounds?: LoopRange | null
): number {
  if (totalBars <= 0) return -1;
  if (
    playBounds &&
    playBounds.startBar >= 0 &&
    playBounds.startBar < totalBars &&
    playBounds.endBar >= playBounds.startBar
  ) {
    const effectiveEnd = Math.min(playBounds.endBar, totalBars - 1);
    if (currentBar >= effectiveEnd) {
      return -1;
    }
    if (currentBar < playBounds.startBar) {
      return playBounds.startBar;
    }
    return currentBar + 1;
  }
  return resolveNextBarIndex(currentBar, totalBars, loopRange);
}

type BarChangeCb = (barIndex: number) => void;
type StatusChangeCb = (status: EngineStatus) => void;

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
  private activeTakeSources: Set<AudioBufferSourceNode> = new Set();
  private activeTakeGains: Set<GainNode> = new Set();
  private activeInitPromise: Promise<void> | null = null;
  private takePlaybackEpoch = 0;
  private nextBarAudioTime = 0;

  private barChangeCbs: Set<BarChangeCb> = new Set();
  private statusChangeCbs: Set<StatusChangeCb> = new Set();
  private loopRange: LoopRange | null = null;
  private playBounds: LoopRange | null = null;

  // ─── Status helpers ───

  private emitStatus() {
    const s: EngineStatus = {
      state: this.state,
      loadProgress: this.loadProgress,
      activeBarIndex: this.activeBarIndex,
      loopRange: this.loopRange,
    };
    this.statusChangeCbs.forEach((cb) => cb(s));
  }

  getState(): EngineStatus {
    return {
      state: this.state,
      loadProgress: this.loadProgress,
      activeBarIndex: this.activeBarIndex,
      loopRange: this.loopRange,
    };
  }

  setLoopRange(range: LoopRange | null) {
    if (range && Number.isFinite(range.startBar) && Number.isFinite(range.endBar) && range.startBar >= 0 && range.endBar >= range.startBar) {
      this.loopRange = {
        startBar: Math.floor(range.startBar),
        endBar: Math.floor(range.endBar),
      };
    } else {
      this.loopRange = null;
    }
    this.emitStatus();
  }

  getLoopRange(): LoopRange | null {
    return this.loopRange;
  }

  onBarChange(cb: BarChangeCb): () => void {
    this.barChangeCbs.add(cb);
    return () => this.barChangeCbs.delete(cb);
  }

  onStatusChange(cb: StatusChangeCb): () => void {
    this.statusChangeCbs.add(cb);
    return () => this.statusChangeCbs.delete(cb);
  }

  // ─── Init / Load ───

  async init(song: SongProject, onProgress?: (p: number) => void): Promise<void> {
    if (this.activeInitPromise) {
      await this.activeInitPromise.catch(() => {});
    }

    const runInit = (async () => {
      // เปิด AudioContext ถ้ายังไม่มี
      if (!this.ctx) {
        this.ctx = new AudioContext({ sampleRate: 44100, latencyHint: 'interactive' });
      }
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume().catch(() => {});
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
        } else if (tr === 'bass') {
          this.trackGains[tr] = new BassTrackGainNode(ctx, dest, mixVol ?? TRACK_DEFAULT_VOL[tr], TRACK_PAN[tr]);
        } else if (tr === 'piano') {
          this.trackGains[tr] = new PianoTrackGainNode(ctx, dest, mixVol ?? TRACK_DEFAULT_VOL[tr], TRACK_PAN[tr]);
        } else {
          this.trackGains[tr] = new TrackGainNode(ctx, dest, mixVol ?? TRACK_DEFAULT_VOL[tr], TRACK_PAN[tr]);
        }
      }

      // Vocal Track Gain Node (Studio HPF + Warmth + Presence EQ + Compressor + Chorus/Width)
      this.vocalGain?.disconnect();
      const vocalVol = song.mixer.vocal?.volume ?? 95;
      this.vocalGain = new VocalStudioTrackGainNode(
        ctx,
        dest,
        (song.mixer.vocal?.enabled ?? true) ? vocalVol : 0,
        0.0,
        song.mixer.vocal?.fxPreset ?? 'studio-warm'
      );

      // DrumSynth ต่อเข้า drumsGain.input
      this.drumSynth?.dispose();
      this.drumSynth = new DrumSynth(ctx, this.trackGains['drums']!.input);

      // MelodySynth ต่อเข้า melodyGain.input
      this.melodySynth?.dispose();
      this.melodySynth = new MelodySynth(ctx, this.trackGains['melody']!.input);
      this.melodySynth.setSound(song.mixer.melody?.sound ?? 'flute');

      // คืน Soundfont เดิมก่อนโหลดชุดใหม่ ป้องกัน Leak เมื่อสลับรุ่นกีตาร์
      for (const prevInst of Object.values(this.instruments)) {
        try {
          prevInst?.dispose();
        } catch {}
      }
      this.instruments = {};

      const leadInst = resolveLeadSoundfontInstrument(song);
      const cacheStorage =
        typeof caches !== 'undefined' ? new CacheStorage('demo_maker_smplr_v1') : undefined;

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
          ...(cacheStorage ? { storage: cacheStorage } : {}),
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
    })();

    this.activeInitPromise = runInit;
    try {
      await runInit;
    } finally {
      if (this.activeInitPromise === runInit) {
        this.activeInitPromise = null;
      }
    }
  }

  /** ล้างแซมเปิลเดิมเมื่อผู้ใช้เปลี่ยนโมเดลกีตาร์เพื่อให้ init โหลดเสียงรุ่นใหม่อย่างสะอาด */
  invalidateLoadedInstruments() {
    if (this.state === 'playing') {
      this.stop();
    }
    for (const inst of Object.values(this.instruments)) {
      try {
        inst?.dispose();
      } catch {}
    }
    this.instruments = {};
    this.loadedGuitarModel = null;
    this.state = 'idle';
    this.loadProgress = 0;
    this.emitStatus();
  }

  // ─── Mixer volume ───

  setMixerVolume(track: TrackId | 'vocal', vol: number) {
    if (track === 'vocal') {
      this.vocalGain?.setVolume(vol);
      return;
    }
    this.trackGains[track]?.setVolume(vol);
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
    this.reverbConvolver.buffer = buildRoomImpulseBuffer(this.ctx, mode);
    const wet = getAmbienceWetGain(mode);
    this.reverbWetGain.gain.setTargetAtTime(wet, this.ctx.currentTime, 0.05);
  }

  setVocalFxPreset(preset: VocalFxPreset) {
    const validPreset: VocalFxPreset =
      preset === 'dry-natural' || preset === 'wide-chorus' ? preset : 'studio-warm';
    if (this.vocalGain instanceof VocalStudioTrackGainNode) {
      this.vocalGain.setFxPreset(validPreset);
    }
  }

  /** Alias เพื่อความเข้ากันได้กับการเรียกตรงบน AudioEngine */
  setFxPreset(preset: VocalFxPreset) {
    this.setVocalFxPreset(preset);
  }

  /** อัปเดตความดังเฉพาะท่อน โทนเสียงแตกกีตาร์ลีด และ Auto-Ducking ขณะมีเสียงร้องจริง */
  private _applySectionMixAndDrive(
    song: SongProject,
    section: SongSection | undefined,
    nowTime: number,
    flatBar?: FlatBar,
    barIndex?: number
  ) {
    const mix = computeEffectiveBarMix(song, section, flatBar, barIndex);
    const allTracks: TrackId[] = ['guitarRhythm', 'guitarLead', 'bass', 'piano', 'drums', 'melody'];
    for (const track of allTracks) {
      this.setMixerVolume(track, mix.volumes[track]);
    }

    const leadNode = this.trackGains['guitarLead'];
    if (leadNode instanceof LeadGuitarTrackGainNode) {
      leadNode.setDrive(mix.leadDrive, nowTime);
    }
  }

  updateSong(song: SongProject) {
    this._currentSong = song;
    if (this.isPlayingFlag) {
      this.playbackFlat = flattenSong(song);
    }
    if (this.ctx) {
      const activeFlatBar = this.activeBarIndex >= 0 ? this.playbackFlat[this.activeBarIndex] : undefined;
      const activeSection = activeFlatBar?.section ?? song.sections[0];
      this._applySectionMixAndDrive(
        song,
        activeSection,
        this.ctx.currentTime,
        activeFlatBar,
        this.activeBarIndex >= 0 ? this.activeBarIndex : undefined
      );
      if (song.mixer.vocal?.fxPreset) {
        this.setVocalFxPreset(song.mixer.vocal.fxPreset);
      }
    }
  }

  /** เล่นเสียงพรีวิวโน้ตเดี่ยวทันที (สำหรับกดคีย์เปียโนใน Mini Piano Roll) */
  previewNote(midiPitch: number, durationSec = 0.45) {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: 44100, latencyHint: 'interactive' });
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
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
      this.ctx.resume().catch(() => {});
    }

    this.activeBarIndex = barIndex;
    this.emitStatus();
    this.barChangeCbs.forEach((cb) => cb(barIndex));

    const planned = planBar(song, flat, barIndex);
    const now = (this.ctx?.currentTime ?? 0) + 0.05;
    this._applySectionMixAndDrive(song, flat[barIndex].section, now);

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

  play(song: SongProject, fromBar = 0, options?: PlayOptions) {
    if (this.state !== 'ready' && this.state !== 'playing') return;
    this.stop();

    const flat = flattenSong(song);
    if (flat.length === 0) return;

    this.playBounds = options?.playRangeOnce ?? null;
    this.playbackFlat = flat;
    this.isPlayingFlag = true;
    this.state = 'playing';
    this._currentSong = song;

    if (this.ctx?.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    const startAudioTime = (this.ctx?.currentTime ?? 0) + 0.08;
    this.nextBarAudioTime = startAudioTime;

    const effectiveFromBar =
      this.playBounds && this.playBounds.startBar >= 0 && this.playBounds.startBar < flat.length
        ? Math.max(this.playBounds.startBar, Math.min(this.playBounds.endBar, fromBar))
        : fromBar;

    // Count-in (ข้าม Count-in เมื่อเล่นเฉพาะท่อน Play-Section-Once)
    if (song.countInEnabled && effectiveFromBar === 0 && !this.playBounds) {
      this._scheduleCountIn(song, () => {
        if (!this.isPlayingFlag) return;
        this.nextBarAudioTime = Math.max((this.ctx?.currentTime ?? 0) + 0.04, this.nextBarAudioTime);
        this._playFromBar(song, effectiveFromBar, true);
      });
    } else {
      this._playFromBar(song, effectiveFromBar, true);
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
    this._stopAllVocals();
    this.nextBarAudioTime = (this.ctx?.currentTime ?? 0) + 0.05;
    this._playFromBar(song, index, true);
  }

  private _stopAllVocals() {
    this.takePlaybackEpoch += 1;
    if (this.activeVocalSource) {
      try {
        this.activeVocalSource.stop();
        this.activeVocalSource.disconnect();
      } catch {}
      this.activeVocalSource = null;
    }
    this.activeTakeSources.forEach((src) => {
      try {
        src.stop();
        src.disconnect();
      } catch {}
    });
    this.activeTakeSources.clear();
    this.activeTakeGains.forEach((gainNode) => {
      try {
        gainNode.disconnect();
      } catch {}
    });
    this.activeTakeGains.clear();
  }

  private async _scheduleActiveVocalTakes(song: SongProject, fromBar: number, fromBarAudioTime: number) {
    if (!this.ctx || !this.vocalGain) return;
    if (!(song.mixer.vocal?.enabled ?? true)) return;

    const activeTakes = (song.vocalTakes || []).filter((t) => t.isActive && !!t.audioDataUrl);
    if (activeTakes.length === 0) return;

    const epoch = this.takePlaybackEpoch;
    const presetToApply = song.mixer.vocal?.fxPreset ?? activeTakes[0].fxPreset ?? 'studio-warm';
    this.setVocalFxPreset(presetToApply);

    await Promise.all(
      activeTakes.map(async (take) => {
        if (!take.audioDataUrl) return;
        const quickSlice = computeTakePlaybackSlice(song, take, fromBar, song.vocalLatencyOffsetMs || 0);
        if (!quickSlice.shouldPlay) return;

        const isAiTts = isAiTtsVocalTake(take);
        const span = isAiTts ? resolveVocalTakeBarSpan(song, take) : null;
        const barCount = span ? span.endGlobalBarIndex - span.startGlobalBarIndex + 1 : 4;
        const buffer = await this.getVocalBuffer(
          take.audioDataUrl,
          isAiTts,
          isAiTts ? quickSlice.targetSpanSec : undefined,
          barCount
        );
        if (!buffer || epoch !== this.takePlaybackEpoch || !this.isPlayingFlag || !this.ctx || !this.vocalGain) {
          return;
        }

        const plan = computeVocalTakePlaybackPlan(
          song,
          take,
          activeTakes,
          buffer.duration,
          fromBar,
          song.vocalLatencyOffsetMs || 0
        );
        if (!plan.shouldPlay) return;

        const nowAfterDecode = this.ctx.currentTime;
        const desiredStartTime = fromBarAudioTime + plan.delaySec;
        let actualWhen = desiredStartTime;
        let offset = plan.bufferOffsetSec;

        if (desiredStartTime < nowAfterDecode) {
          offset += (nowAfterDecode - desiredStartTime) * plan.playbackRate;
          actualWhen = nowAfterDecode;
        }

        if (offset >= buffer.duration - 0.01) return;

        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        if (plan.playbackRate !== 1.0 && src.playbackRate) {
          if (typeof src.playbackRate.setValueAtTime === 'function') {
            src.playbackRate.setValueAtTime(plan.playbackRate, actualWhen);
          } else {
            src.playbackRate.value = plan.playbackRate;
          }
        }

        const takeGain = this.ctx.createGain();
        src.connect(takeGain);
        takeGain.connect(this.vocalGain.input);

        let stopAtTime: number | null = null;
        if (plan.stopAfterDelaySec !== null) {
          const plannedStopTime = fromBarAudioTime + plan.stopAfterDelaySec;
          if (plannedStopTime <= actualWhen + 0.02) {
            try {
              src.disconnect();
              takeGain.disconnect();
            } catch {}
            return;
          }
          stopAtTime = plannedStopTime;
          const plannedFadeStart =
            plan.fadeOutStartDelaySec !== null
              ? Math.max(actualWhen, Math.min(plannedStopTime - 0.01, fromBarAudioTime + plan.fadeOutStartDelaySec))
              : Math.max(actualWhen, plannedStopTime - 0.04);
          takeGain.gain.setValueAtTime(1.0, actualWhen);
          takeGain.gain.setValueAtTime(1.0, plannedFadeStart);
          takeGain.gain.linearRampToValueAtTime(0.0, plannedStopTime);
        }

        src.onended = () => {
          try {
            src.disconnect();
            takeGain.disconnect();
          } catch {}
          this.activeTakeSources.delete(src);
          this.activeTakeGains.delete(takeGain);
        };
        this.activeTakeSources.add(src);
        this.activeTakeGains.add(takeGain);
        src.start(actualWhen, Math.max(0, offset));
        if (stopAtTime !== null) {
          src.stop(stopAtTime + 0.005);
        }
      })
    );
  }

  private async getVocalBuffer(
    dataUrl: string,
    trimTrailing = false,
    targetSpanSec?: number,
    barCount = 4
  ): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    const spanKey =
      trimTrailing && targetSpanSec && targetSpanSec > 0
        ? `${targetSpanSec.toFixed(2)}:b${barCount}`
        : trimTrailing
          ? 'raw'
          : 'lead';
    const cacheKey = `${spanKey}:${dataUrl}`;
    const cached = this.vocalBufferCache.get(cacheKey);
    if (cached) return cached;

    try {
      const base64Part = dataUrl.split(',')[1];
      if (!base64Part) return null;
      const binaryStr = atob(base64Part);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const decoded = await this.ctx.decodeAudioData(bytes.buffer.slice(0));
      const leadingTrimmed = trimAudioBufferLeadingSilence(this.ctx, decoded);
      const trailingTrimmed = trimTrailing
        ? trimAudioBufferTrailingSilence(this.ctx, leadingTrimmed)
        : leadingTrimmed;
      const buffer =
        trimTrailing && targetSpanSec && targetSpanSec > 0
          ? prepareAiTtsAudioBufferForSpan(this.ctx, trailingTrimmed, targetSpanSec, barCount)
          : trailingTrimmed;
      // Bounded cache ป้องกัน Memory Leaks จากการอัดหลายสิบคลิป
      if (this.vocalBufferCache.size > 40) {
        const firstKey = this.vocalBufferCache.keys().next().value;
        if (firstKey) this.vocalBufferCache.delete(firstKey);
      }
      this.vocalBufferCache.set(cacheKey, buffer);
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

  private _playFromBar(song: SongProject, barIndex: number, scheduleContinuousTakes = false) {
    const activeSong = this._currentSong || song;
    this._currentSong = activeSong;
    this.playbackFlat = flattenSong(activeSong);
    const ctx = this.ctx!;
    const flat = this.playbackFlat;

    if (barIndex >= flat.length) {
      // จบเพลง
      this._stopAllVocals();
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

    if (scheduleContinuousTakes) {
      void this._scheduleActiveVocalTakes(activeSong, barIndex, now);
    }

    // ปรับความดังเฉพาะท่อน โทนเสียงแตกกีตาร์ลีด และ Auto-Ducking ตามท่อน
    this._applySectionMixAndDrive(activeSong, flat[barIndex].section, now, flat[barIndex], barIndex);

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

    // กำหนดเวลาตื่นเพื่อ schedule ห้องถัดไปล่วงหน้า 50ms ก่อนบาร์จบ (รองรับ Single-Bar/Section Loop และ Play-Section-Once)
    const msUntilNext = Math.max(20, (this.nextBarAudioTime - ctx.currentTime - 0.05) * 1000);
    this.currentBarTimer = setTimeout(() => {
      if (!this.isPlayingFlag) return;
      const nextBar = resolvePlaybackNextBar(
        barIndex,
        flat.length,
        this.loopRange,
        this.playBounds
      );
      if (nextBar < 0) {
        this._playFromBar(activeSong, flat.length);
      } else {
        const isLoopWrap = nextBar <= barIndex;
        if (isLoopWrap) {
          this._stopAllVocals();
        }
        this._playFromBar(activeSong, nextBar, isLoopWrap);
      }
    }, msUntilNext);
  }

  stop() {
    this._clearTimer();
    this.isPlayingFlag = false;
    this.playBounds = null;
    this.nextBarAudioTime = 0;
    this._currentSong = null;

    this._stopAllVocals();

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
    for (const inst of Object.values(this.instruments)) {
      try {
        inst?.dispose();
      } catch {}
    }
    this.drumSynth?.dispose();
    this.melodySynth?.dispose();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.loadedGuitarModel = null;
    this.activeInitPromise = null;
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
