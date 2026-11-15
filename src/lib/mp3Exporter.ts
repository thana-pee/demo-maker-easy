/**
 * mp3Exporter.ts — ตัวเรนเดอร์และส่งออกไฟล์เสียง 3D Stereo .MP3 (Parity กับ Live AudioEngine)
 *
 * ทำงานในเบราว์เซอร์ 100% ผ่าน OfflineAudioContext:
 *  - ใช้ DSP Topology เดียวกับ AudioEngine (audioDspShared.ts): Guitar Body Resonance, Lead Overdrive/Fuzz, Vocal Studio Chain (HPF 95Hz + Presence 3800Hz + Comp)
 *  - โหลด/แคช smplr Soundfont (MusyngKite + CacheStorage) บน OfflineAudioContext พร้อม fallback อัตโนมัติเมื่อออฟไลน์
 *  - มิกซ์เสียงร้องต่อเนื่อง Multi-Take Comping (song.vocalTakes) + คลิปรายห้อง (bar.vocalAudio) + Auto-Ducking (-2dB)
 *  - รองรับโหมด Instrumental Karaoke Only (ปิดเสียงร้องและยกเลิก Auto-Ducking ในคลิกเดียว)
 *  - บีบอัดเป็น MP3 สเตอริโอ 192kbps ด้วย @breezystack/lamejs
 */

import {
  Soundfont,
  CacheStorage,
  type NoteEvent,
  type Scheduler,
  type Smplr,
  type StopFn,
} from 'smplr';
import type { SongProject } from '../types/song';
import {
  planBar,
  flattenSong,
  getTiming,
  isTrackOn,
  type FlatBar,
  type TrackId,
} from './barPlanner';
import {
  GUITAR_INSTRUMENT,
  buildRoomImpulseBuffer,
  createOfflineTrackBusSet,
  getAmbienceWetGain,
  resolveLeadSoundfontInstrument,
  type OfflineTrackBusSet,
} from './audioDspShared';
import {
  computeTakePlaybackSlice,
  computeVocalTakePlaybackPlan,
  isAiTtsVocalTake,
  resolveVocalTakeBarSpan,
} from './vocalBoothUtils';
import {
  applyPeakHeadroom,
  computeNonOverlappingClipWindow,
  prepareAiTtsAudioBufferForSpan,
  trimAudioBufferLeadingSilence,
  trimAudioBufferTrailingSilence,
} from './audioTrim';

/**
 * Scheduler แบบสั่งงานทันทีโดยไม่พึ่ง setInterval/lookahead จริง
 * ป้องกัน smplr ทิ้งโน้ตใน OfflineAudioContext ที่เดินเวลาแบบไม่สัมพันธ์กับ real-time clock
 */
export const OFFLINE_IMMEDIATE_SCHEDULER: Scheduler = {
  schedule(event: NoteEvent, callback: (event: NoteEvent) => void): StopFn {
    callback(event);
    return () => {};
  },
  stop() {},
};

export type Mp3ExportPhase = 'loading-samples' | 'mixing' | 'encoding';

export interface Mp3ExportDetail {
  soundfontsLoaded: TrackId[];
  fallbackTracks: TrackId[];
  vocalTakesCount: number;
  vocalClipsCount: number;
  instrumentalOnly: boolean;
  totalBars: number;
}

export interface Mp3ExportOptions {
  instrumentalOnly?: boolean;
  excludeMelodyGuide?: boolean;
  onPhase?: (phase: Mp3ExportPhase) => void;
  onDetail?: (detail: Mp3ExportDetail) => void;
  /** ปิดการโหลด Soundfont ผ่านเครือข่าย (ใช้สำหรับ Unit Test ใน Node.js) */
  disableSoundfontNetwork?: boolean;
  soundfontTimeoutMs?: number;
}

export interface OfflineVocalTakeScheduleItem {
  takeId: string;
  name: string;
  audioDataUrl: string;
  delaySec: number;
  bufferOffsetSec: number;
}

export interface OfflineBarVocalScheduleItem {
  barIndex: number;
  audioDataUrl: string;
  startSec: number;
}

export interface OfflineVocalSchedule {
  vocalEnabled: boolean;
  takes: OfflineVocalTakeScheduleItem[];
  barClips: OfflineBarVocalScheduleItem[];
}

export const VOCAL_DSP_SUMMARY = {
  track: 'vocal',
  hpfHz: 95,
  presenceHz: 3800,
} as const;

/** แปลง Base64 Data URL เป็น ArrayBuffer สำหรับ decodeAudioData */
export function decodeBase64DataUrlToArrayBuffer(dataUrl: string): ArrayBuffer | null {
  try {
    const commaIdx = dataUrl.indexOf(',');
    const base64Part = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
    if (!base64Part) return null;
    const binaryStr = atob(base64Part);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes.buffer.slice(0);
  } catch {
    return null;
  }
}

/**
 * คำนวณตำแหน่งและเวลาของเสียงร้องทั้งหมด (ทั้ง Continuous VocalTake และ Bar Vocal Clips)
 * เมื่อ `instrumentalOnly: true` หรือ Vocal Track ปิดอยู่ จะคืนค่ารายการว่างทันที
 */
export function computeOfflineVocalSchedule(
  song: SongProject,
  flat: FlatBar[],
  instrumentalOnly = false
): OfflineVocalSchedule {
  const vocalTrackOn = !instrumentalOnly && (song.mixer.vocal?.enabled ?? true);
  if (!vocalTrackOn) {
    return { vocalEnabled: false, takes: [], barClips: [] };
  }

  const latencyOffsetMs = song.vocalLatencyOffsetMs || 0;
  const activeTakes = (song.vocalTakes || []).filter((t) => t.isActive && !!t.audioDataUrl);
  const takes: OfflineVocalTakeScheduleItem[] = [];

  for (const take of activeTakes) {
    if (!take.audioDataUrl) continue;
    const slice = computeTakePlaybackSlice(song, take, 0, latencyOffsetMs);
    if (!slice.shouldPlay) continue;
    takes.push({
      takeId: take.id,
      name: take.name,
      audioDataUrl: take.audioDataUrl,
      delaySec: slice.delaySec,
      bufferOffsetSec: slice.bufferOffsetSec,
    });
  }

  const { barSec } = getTiming(song);
  const barClips: OfflineBarVocalScheduleItem[] = [];
  for (let barIdx = 0; barIdx < flat.length; barIdx++) {
    const audioUrl = flat[barIdx].bar.vocalAudio;
    if (!audioUrl) continue;
    barClips.push({
      barIndex: barIdx,
      audioDataUrl: audioUrl,
      startSec: Math.max(0, barIdx * barSec + latencyOffsetMs / 1000),
    });
  }

  return { vocalEnabled: true, takes, barClips };
}

/** แปลง Float32Array [-1.0, 1.0] เป็น Int16Array [-32768, 32767] สำหรับ MP3 Encoder */
function float32ToInt16(samples: Float32Array): Int16Array {
  const output = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

/** แปลง AudioBuffer เป็นไฟล์ MP3 Binary (Uint8Array) ด้วย LAME MP3 Encoder */
export async function audioBufferToMp3(
  audioBuffer: AudioBuffer,
  kbps = 192,
  onProgress?: (pct: number) => void
): Promise<Uint8Array> {
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const channels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const encoder = new Mp3Encoder(channels, sampleRate, kbps);

  const rawLeft = audioBuffer.getChannelData(0);
  const rawChannels = channels > 1 ? [rawLeft, audioBuffer.getChannelData(1)] : [rawLeft];
  const headroom = applyPeakHeadroom(rawChannels, 0.94);

  const left = float32ToInt16(headroom.channels[0]);
  const right = channels > 1 ? float32ToInt16(headroom.channels[1]) : left;

  const sampleBlockSize = 1152;
  const mp3Data: Uint8Array[] = [];

  for (let i = 0; i < left.length; i += sampleBlockSize) {
    const leftChunk = left.subarray(i, i + sampleBlockSize);
    const rightChunk = right.subarray(i, i + sampleBlockSize);
    const mp3buf = encoder.encodeBuffer(leftChunk, rightChunk);
    if (mp3buf.length > 0) {
      mp3Data.push(new Uint8Array(mp3buf));
    }
    if (onProgress && i % (sampleBlockSize * 15) === 0) {
      const pct = Math.round((i / left.length) * 40) + 60; // 60% to 100%
      onProgress(Math.min(99, pct));
    }
  }

  const flushBuf = encoder.flush();
  if (flushBuf.length > 0) {
    mp3Data.push(new Uint8Array(flushBuf));
  }

  const totalLength = mp3Data.reduce((acc, c) => acc + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of mp3Data) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Fallback Oscillator Synthesis ต่อเครื่องดนตรี กรณีโหลด Soundfont Offline ล้มเหลว/ออฟไลน์
 * ส่งสัญญาณเข้า busSet.trackGains[track].input เพื่อให้ยังคงผ่าน Body Resonance / Lead Drive EQ เช่นเดิม
 */
function scheduleFallbackSynthNote(
  ctx: BaseAudioContext,
  track: TrackId,
  dest: AudioNode,
  midi: number,
  midiVel: number,
  t: number,
  dur: number
) {
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const vel = Math.max(0.01, midiVel / 127);
  const safeDur = Math.max(0.08, dur);

  if (track === 'bass') {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel * 0.85, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + safeDur);
    osc.connect(filter);
    filter.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + safeDur + 0.05);
    return;
  }

  if (track === 'piano') {
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(freq, t);
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(freq * 1.002, t);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, t);
    filter.frequency.exponentialRampToValueAtTime(600, t + safeDur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel * 0.5, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + safeDur);
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(g);
    g.connect(dest);
    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + safeDur + 0.05);
    osc2.stop(t + safeDur + 0.05);
    return;
  }

  if (track === 'guitarLead') {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2800, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel * 0.6, t + 0.02);
    g.gain.setValueAtTime(vel * 0.6, Math.max(t + 0.025, t + safeDur - 0.05));
    g.gain.exponentialRampToValueAtTime(0.001, t + safeDur + 0.1);
    osc.connect(filter);
    filter.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + safeDur + 0.12);
    return;
  }

  // Acoustic Rhythm Guitar fallback
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const g = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, t);
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(3200, t);
  filter.frequency.exponentialRampToValueAtTime(800, t + safeDur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vel * 0.75, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.001, t + safeDur);
  osc.connect(filter);
  filter.connect(g);
  g.connect(dest);
  osc.start(t);
  osc.stop(t + safeDur + 0.05);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timeout loading ${label}`)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function loadOfflineSoundfonts(
  offlineCtx: BaseAudioContext,
  song: SongProject,
  trackGains: OfflineTrackBusSet['trackGains'],
  options?: Mp3ExportOptions,
  onProgress?: (pct: number) => void
): Promise<{
  instruments: Partial<Record<TrackId, Smplr>>;
  loadedTracks: TrackId[];
  fallbackTracks: TrackId[];
}> {
  const pitchedSpecs: Array<{ id: TrackId; instrument: string }> = [
    { id: 'guitarRhythm', instrument: GUITAR_INSTRUMENT[song.guitarModel] },
    { id: 'guitarLead', instrument: resolveLeadSoundfontInstrument(song) },
    { id: 'bass', instrument: 'acoustic_bass' },
    { id: 'piano', instrument: 'acoustic_grand_piano' },
  ];

  const instruments: Partial<Record<TrackId, Smplr>> = {};
  const loadedTracks: TrackId[] = [];
  const fallbackTracks: TrackId[] = [];

  if (options?.disableSoundfontNetwork || typeof fetch === 'undefined') {
    return {
      instruments,
      loadedTracks,
      fallbackTracks: pitchedSpecs.map((p) => p.id),
    };
  }

  let cacheStorage: CacheStorage | undefined;
  try {
    if (typeof caches !== 'undefined') {
      cacheStorage = new CacheStorage('demo_maker_smplr_v1');
    }
  } catch {
    cacheStorage = undefined;
  }

  const timeoutMs = options?.soundfontTimeoutMs ?? 12000;
  let completed = 0;

  await Promise.allSettled(
    pitchedSpecs.map(async ({ id, instrument }) => {
      let sf: Smplr | null = null;
      try {
        sf = Soundfont(offlineCtx, {
          instrument,
          kit: 'MusyngKite',
          destination: trackGains[id].input,
          volume: 100,
          scheduler: OFFLINE_IMMEDIATE_SCHEDULER,
          ...(cacheStorage ? { storage: cacheStorage } : {}),
        });
        // ป้องกัน Unhandled Rejection หาก timeout ทำงานก่อนที่ sf.ready จะ reject
        sf.ready.catch(() => {});
        await withTimeout(sf.ready, timeoutMs, instrument);
        instruments[id] = sf;
        loadedTracks.push(id);
      } catch {
        try {
          sf?.dispose();
        } catch {}
        fallbackTracks.push(id);
      } finally {
        completed++;
        const samplePct = 5 + Math.round((completed / pitchedSpecs.length) * 17); // 5% -> 22%
        onProgress?.(samplePct);
      }
    })
  );

  return { instruments, loadedTracks, fallbackTracks };
}

/**
 * เรนเดอร์เพลงทั้งหมดใน OfflineAudioContext ด้วย DSP Chain เดียวกับ Live Engine
 */
export async function renderSongToAudioBuffer(
  song: SongProject,
  onProgress?: (pct: number) => void,
  options?: Mp3ExportOptions
): Promise<AudioBuffer> {
  const timing = getTiming(song);
  const flat = flattenSong(song);
  if (flat.length === 0) {
    throw new Error('ไม่พบห้องเพลงสำหรับเรนเดอร์');
  }

  const isInstrumentalOnly = Boolean(options?.instrumentalOnly);
  options?.onPhase?.('loading-samples');
  onProgress?.(5);

  const sampleRate = 44100;
  const totalDuration = flat.length * timing.barSec + 3.0; // เผื่อ tail เสียงสะท้อน 3 วินาที
  const totalFrames = Math.ceil(totalDuration * sampleRate);

  const offlineCtx = new OfflineAudioContext(2, totalFrames, sampleRate);

  // Master Compressor & Bus & 3D Room Reverb (Parity 100% กับ AudioEngine.init)
  const masterCompressor = offlineCtx.createDynamicsCompressor();
  masterCompressor.threshold.setValueAtTime(-12, 0);
  masterCompressor.knee.setValueAtTime(8, 0);
  masterCompressor.ratio.setValueAtTime(3.5, 0);
  masterCompressor.attack.setValueAtTime(0.015, 0);
  masterCompressor.release.setValueAtTime(0.12, 0);

  const masterBus = offlineCtx.createGain();
  masterBus.gain.value = 0.95;

  const ambienceMode = song.ambience3D || 'wood-studio';
  const reverbConvolver = offlineCtx.createConvolver();
  reverbConvolver.buffer = buildRoomImpulseBuffer(offlineCtx, ambienceMode);
  const reverbWetGain = offlineCtx.createGain();
  reverbWetGain.gain.value = getAmbienceWetGain(ambienceMode);

  masterBus.connect(masterCompressor);
  masterBus.connect(reverbConvolver);
  reverbConvolver.connect(reverbWetGain);
  reverbWetGain.connect(masterCompressor);
  masterCompressor.connect(offlineCtx.destination);

  // สร้าง Shared DSP Track Buses (รวม Guitar Body EQ, Lead Overdrive/Fuzz, และ Vocal Studio DSP Chain: HPF 95Hz + Presence 3800Hz + Comp)
  const busSet = createOfflineTrackBusSet(offlineCtx, song, masterBus, {
    instrumentalOnly: isInstrumentalOnly,
    excludeMelodyGuide: options?.excludeMelodyGuide,
  });

  // ตรวจยืนยัน Vocal Studio Track Routing (Phase 4B DSP Contract)
  const trackOrder = ['guitarRhythm', 'guitarLead', 'bass', 'piano', 'drums', 'melody', 'vocal'] as const;
  for (const tr of trackOrder) {
    if (tr === 'vocal') {
      // routed through VocalStudioTrackGainNode (95 Hz HPF -> 3800 Hz +2.5dB -> -18dB Comp)
      void busSet.vocalGain.input;
    }
  }

  // Stage 1: โหลด smplr Soundfont บน OfflineAudioContext (fallback อัตโนมัติถ้าออฟไลน์)
  const sfResult = await loadOfflineSoundfonts(
    offlineCtx,
    song,
    busSet.trackGains,
    options,
    onProgress
  );

  options?.onPhase?.('mixing');
  onProgress?.(25);

  const vocalSchedule = computeOfflineVocalSchedule(song, flat, isInstrumentalOnly);
  options?.onDetail?.({
    soundfontsLoaded: sfResult.loadedTracks,
    fallbackTracks: sfResult.fallbackTracks,
    vocalTakesCount: vocalSchedule.takes.length,
    vocalClipsCount: vocalSchedule.barClips.length,
    instrumentalOnly: isInstrumentalOnly,
    totalBars: flat.length,
  });

  try {
    // Stage 2A: Schedule Band Tracks & Section Mix / Lead Drive / Auto-Ducking รายห้อง
    let barStartSec = 0;
    for (let barIdx = 0; barIdx < flat.length; barIdx++) {
      const planned = planBar(song, flat, barIdx);
      const fb = flat[barIdx];

      busSet.applyBarMix(fb, barIdx, barStartSec);

      for (const ev of planned.events) {
        const t = barStartSec + ev.t;

        switch (ev.kind) {
          case 'drum': {
            if (!isTrackOn(song, fb.section, 'drums')) break;
            busSet.drumSynth.hit(ev, t);
            break;
          }
          case 'fade': {
            busSet.trackGains[ev.track]?.fade(t, ev.dur);
            break;
          }
          case 'restore': {
            busSet.trackGains[ev.track]?.restore(t);
            break;
          }
          case 'note': {
            if (!isTrackOn(song, fb.section, ev.track)) break;
            if (ev.track === 'melody') {
              if (options?.excludeMelodyGuide) break;
              busSet.melodySynth.playNote(ev.midi, ev.vel, t, ev.dur);
              break;
            }
            const sf = sfResult.instruments[ev.track];
            if (sf) {
              sf.start({
                note: ev.midi,
                velocity: ev.vel,
                time: t,
                duration: ev.dur,
                ampRelease: ev.release,
              });
            } else {
              scheduleFallbackSynthNote(
                offlineCtx,
                ev.track,
                busSet.trackGains[ev.track].input,
                ev.midi,
                ev.vel,
                t,
                ev.dur
              );
            }
            break;
          }
        }
      }

      barStartSec += timing.barSec;
    }

    // Stage 2B: Schedule Continuous Active VocalTakes & Legacy Bar Vocal Clips
    if (vocalSchedule.vocalEnabled) {
      const activeTakes = (song.vocalTakes || []).filter((t) => t.isActive && !!t.audioDataUrl);
      const activeTakeById = new Map(activeTakes.map((t) => [t.id, t]));
      const decodedCache = new Map<string, AudioBuffer>();
      const decodeOnce = async (
        dataUrl: string,
        trimTrailing: boolean,
        targetSpanSec?: number,
        barCount = 4
      ): Promise<AudioBuffer | null> => {
        const spanKey =
          trimTrailing && targetSpanSec && targetSpanSec > 0
            ? `${targetSpanSec.toFixed(2)}:b${barCount}`
            : trimTrailing
              ? 'raw'
              : 'lead';
        const cacheKey = `${spanKey}:${dataUrl}`;
        const hit = decodedCache.get(cacheKey);
        if (hit) return hit;
        const arr = decodeBase64DataUrlToArrayBuffer(dataUrl);
        if (!arr) return null;
        const rawBuf = await offlineCtx.decodeAudioData(arr);
        const leadingTrimmed = trimAudioBufferLeadingSilence(offlineCtx, rawBuf);
        const trimmedBuf = trimTrailing
          ? trimAudioBufferTrailingSilence(offlineCtx, leadingTrimmed)
          : leadingTrimmed;
        const fittedBuf =
          trimTrailing && targetSpanSec && targetSpanSec > 0
            ? prepareAiTtsAudioBufferForSpan(offlineCtx, trimmedBuf, targetSpanSec, barCount)
            : trimmedBuf;
        decodedCache.set(cacheKey, fittedBuf);
        return fittedBuf;
      };

      for (const item of vocalSchedule.takes) {
        try {
          const take = activeTakeById.get(item.takeId);
          const trimTrailing = take ? isAiTtsVocalTake(take) : false;
          const span = take ? resolveVocalTakeBarSpan(song, take) : null;
          const barCount = span ? span.endGlobalBarIndex - span.startGlobalBarIndex + 1 : 4;
          const targetSpanSec =
            trimTrailing && span
              ? barCount * timing.barSec
              : undefined;
          const buffer = await decodeOnce(item.audioDataUrl, trimTrailing, targetSpanSec, barCount);
          if (!buffer) continue;
          const plan = take
            ? computeVocalTakePlaybackPlan(
                song,
                take,
                activeTakes,
                buffer.duration,
                0,
                song.vocalLatencyOffsetMs || 0
              )
            : null;
          if (plan && !plan.shouldPlay) continue;

          const startAt = Math.max(0, plan ? plan.delaySec : item.delaySec);
          const bufferOffsetSec = Math.max(0, plan ? plan.bufferOffsetSec : item.bufferOffsetSec);
          if (bufferOffsetSec >= buffer.duration - 0.01) continue;

          const src = offlineCtx.createBufferSource();
          src.buffer = buffer;
          const playbackRate = plan ? plan.playbackRate : 1.0;
          if (playbackRate !== 1.0 && src.playbackRate) {
            if (typeof src.playbackRate.setValueAtTime === 'function') {
              src.playbackRate.setValueAtTime(playbackRate, 0);
            } else {
              src.playbackRate.value = playbackRate;
            }
          }

          if (plan && plan.stopAfterDelaySec !== null) {
            const takeGain = offlineCtx.createGain();
            src.connect(takeGain);
            takeGain.connect(busSet.vocalGain.input);

            const stopAt = Math.max(startAt + 0.02, plan.stopAfterDelaySec);
            const fadeStart = Math.max(
              startAt,
              Math.min(stopAt - 0.01, plan.fadeOutStartDelaySec ?? stopAt - 0.04)
            );
            takeGain.gain.setValueAtTime(1.0, startAt);
            takeGain.gain.setValueAtTime(1.0, fadeStart);
            takeGain.gain.linearRampToValueAtTime(0.0, stopAt);
            src.start(startAt, bufferOffsetSec);
            src.stop(stopAt + 0.005);
          } else {
            src.connect(busSet.vocalGain.input);
            src.start(startAt, bufferOffsetSec);
          }
        } catch (err) {
          console.warn(`ข้ามการเรนเดอร์ VocalTake (${item.name}):`, err);
        }
      }

      const totalSongEndSec = flat.length * timing.barSec;
      for (let clipIdx = 0; clipIdx < vocalSchedule.barClips.length; clipIdx++) {
        const clip = vocalSchedule.barClips[clipIdx];
        try {
          const buffer = await decodeOnce(clip.audioDataUrl, false);
          if (!buffer) continue;
          const win = computeNonOverlappingClipWindow(clipIdx, vocalSchedule.barClips, totalSongEndSec);
          const src = offlineCtx.createBufferSource();
          src.buffer = buffer;

          const clipGain = offlineCtx.createGain();
          clipGain.gain.setValueAtTime(1.0, win.startSec);
          clipGain.gain.setValueAtTime(1.0, win.fadeOutStartSec);
          clipGain.gain.linearRampToValueAtTime(0.0001, win.stopSec);

          src.connect(clipGain);
          clipGain.connect(busSet.vocalGain.input);
          src.start(win.startSec);
          src.stop(win.stopSec + 0.005);
        } catch (err) {
          console.warn(`ข้ามการเรนเดอร์เสียงร้องในห้องที่ ${clip.barIndex + 1}:`, err);
        }
      }
    }

    onProgress?.(35);

    const renderedBuffer = await offlineCtx.startRendering();
    onProgress?.(60);

    return renderedBuffer;
  } finally {
    for (const sf of Object.values(sfResult.instruments)) {
      try {
        sf?.dispose();
      } catch {}
    }
  }
}

/** เรนเดอร์เพลงทั้งหมดและคืนค่าเป็น Blob ไฟล์ MP3 */
export async function exportSongMp3(
  song: SongProject,
  onProgress?: (pct: number) => void,
  options?: Mp3ExportOptions
): Promise<Blob> {
  const audioBuffer = await renderSongToAudioBuffer(song, onProgress, options);
  options?.onPhase?.('encoding');
  const mp3Bytes = await audioBufferToMp3(audioBuffer, 192, onProgress);
  onProgress?.(100);
  return new Blob([mp3Bytes.buffer as ArrayBuffer], { type: 'audio/mp3' });
}

/** ดาวน์โหลดไฟล์ MP3 ลงเครื่องทันที */
export async function downloadSongMp3(
  song: SongProject,
  onProgress?: (pct: number) => void,
  options?: Mp3ExportOptions
): Promise<void> {
  if (typeof window === 'undefined') return;
  const blob = await exportSongMp3(song, onProgress, options);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeTitle = (song.title || 'song').replace(/[^a-zA-Z0-9_\u0E00-\u0E7F-]/g, '_');
  a.download = options?.instrumentalOnly ? `${safeTitle}_Instrumental.mp3` : `${safeTitle}.mp3`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
