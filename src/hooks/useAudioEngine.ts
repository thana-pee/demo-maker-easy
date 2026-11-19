'use client';
/**
 * useAudioEngine.ts — React hook ครอบ AudioEngine singleton
 *
 * Returns:
 *   isLoading       — กำลังโหลดแซมเปิล
 *   isPlaying       — กำลังเล่นอยู่
 *   loadProgress    — 0–1
 *   activeBarIndex  — ห้องที่กำลังเล่น (-1 = หยุด)
 *   play(fromBar?)  — เริ่มเล่น
 *   stop()          — หยุด
 *   seekToBar(i)    — กระโดดห้อง
 *   initEngine()    — โหลด sample (เรียกอัตโนมัติเมื่อ song เปลี่ยนโมเดล)
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import type { SongProject, LeadGuitarDrive, VocalFxPreset } from '../types/song';
import type { TrackId } from '../lib/barPlanner';
import type { EngineStatus, LoopRange, PlayOptions } from '../lib/audioEngine';

export interface AudioEngineHookResult {
  isLoading: boolean;
  isReady: boolean;
  isPlaying: boolean;
  isCountIn: boolean;
  metronomeEnabled: boolean;
  loadProgress: number;
  activeBarIndex: number;
  loopRange: LoopRange | null;
  error: string | undefined;
  play: (fromBar?: number, songOverride?: SongProject, options?: PlayOptions) => void;
  playSectionOnce: (startBar: number, endBar: number, songOverride?: SongProject) => void;
  stop: () => void;
  seekToBar: (index: number) => void;
  initEngine: () => Promise<void>;
  setLoopRange: (range: LoopRange | null) => void;
  setMetronomeEnabled: (enabled: boolean) => void;
  previewChord: (chordSymbol: string) => void;
  setMixerVolume: (track: TrackId | 'vocal', vol: number) => void;
  setLeadDrive: (drive: LeadGuitarDrive) => void;
  setVocalFxPreset: (preset: VocalFxPreset) => void;
}

export function useAudioEngine(song: SongProject): AudioEngineHookResult {
  const engineRef = useRef<import('../lib/audioEngine').AudioEngine | null>(null);
  const pendingLoopRangeRef = useRef<LoopRange | null>(null);
  const [status, setStatus] = useState<EngineStatus>({
    state: 'idle',
    loadProgress: 0,
    activeBarIndex: -1,
    loopRange: null,
  });

  // โหลด audioEngine แบบ lazy (browser-only)
  useEffect(() => {
    let unsub: (() => void) | null = null;
    import('../lib/audioEngine')
      .then(({ getAudioEngine }) => {
        const engine = getAudioEngine();
        engineRef.current = engine;
        if (pendingLoopRangeRef.current) {
          engine.setLoopRange(pendingLoopRangeRef.current);
        }
        setStatus(engine.getState());
        unsub = engine.onStatusChange((s: EngineStatus) => setStatus(s));
      })
      .catch(() => {});
    return () => { unsub?.(); };
  }, []);

  // Reset loop & playback state automatically whenever user switches songs (prevents loopRange bleed across songs)
  const prevSongIdRef = useRef<string>(song.id);
  useEffect(() => {
    if (prevSongIdRef.current !== song.id) {
      prevSongIdRef.current = song.id;
      pendingLoopRangeRef.current = null;
      if (engineRef.current) {
        engineRef.current.stop();
        engineRef.current.setLoopRange(null);
      } else {
        setStatus((s) => ({ ...s, loopRange: null, activeBarIndex: -1 }));
      }
    }
  }, [song.id]);

  // Auto-reload เมื่อโมเดลกีตาร์เปลี่ยน (ล้างเครื่องดนตรีเดิมและตั้ง state เป็น idle เพื่อโหลดใหม่รอบถัดไป)
  const prevModelRef = useRef<string>(song.guitarModel);
  useEffect(() => {
    if (prevModelRef.current !== song.guitarModel && engineRef.current) {
      prevModelRef.current = song.guitarModel;
      engineRef.current.invalidateLoadedInstruments();
    }
  }, [song.guitarModel]);

  // Live drive tone change เมื่อปรับใน mixer
  const prevDriveRef = useRef<string | undefined>(song.mixer.guitarLead.drive);
  useEffect(() => {
    if (prevDriveRef.current !== song.mixer.guitarLead.drive && engineRef.current) {
      prevDriveRef.current = song.mixer.guitarLead.drive;
      if (song.mixer.guitarLead.drive) {
        engineRef.current.setLeadDrive(song.mixer.guitarLead.drive);
      }
    }
  }, [song.mixer.guitarLead.drive]);

  // ซิงก์มิกเซอร์ มิติห้อง 3D เสียงเมโลดี้ และเนื้อเสียงกีตาร์แบบ Real-time
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.setMixerVolume('guitarRhythm', song.mixer.guitarRhythm.enabled ? song.mixer.guitarRhythm.volume : 0);
    eng.setMixerVolume('guitarLead', song.mixer.guitarLead.enabled ? song.mixer.guitarLead.volume : 0);
    eng.setMixerVolume('bass', song.mixer.bass.enabled ? song.mixer.bass.volume : 0);
    eng.setMixerVolume('piano', song.mixer.piano.enabled ? song.mixer.piano.volume : 0);
    eng.setMixerVolume('drums', song.mixer.drums.enabled && song.mixer.drums.style !== 'off' ? song.mixer.drums.volume : 0);
    eng.setMixerVolume('melody', (song.mixer.melody?.enabled ?? true) ? (song.mixer.melody?.volume ?? 85) : 0);
    eng.setMixerVolume('vocal', (song.mixer.vocal?.enabled ?? true) ? (song.mixer.vocal?.volume ?? 95) : 0);
    if (song.mixer.vocal?.fxPreset) {
      eng.setVocalFxPreset(song.mixer.vocal.fxPreset);
    }
    if (song.mixer.melody?.sound) {
      eng.setMelodySound(song.mixer.melody.sound);
    }
    eng.setGuitarAcoustics(song.guitarModel, song.stringGauge);
    eng.setAmbience3D(song.ambience3D || 'wood-studio');
    eng.setMetronomeEnabled(Boolean(song.metronomeEnabled));
    eng.updateSong(song);
  }, [song]);

  const initEngine = useCallback(async () => {
    if (!engineRef.current) {
      const { getAudioEngine } = await import('../lib/audioEngine');
      engineRef.current = getAudioEngine();
    }
    await engineRef.current.init(song, (p: number) => {
      setStatus((s: EngineStatus) => ({ ...s, loadProgress: p }));
    });
  }, [song]);

  const play = useCallback(
    (fromBar = 0, songOverride?: SongProject, options?: PlayOptions) => {
      if (!engineRef.current) return;
      const targetSong = songOverride ?? song;
      if (
        engineRef.current.getState().state !== 'ready' &&
        engineRef.current.getState().state !== 'playing'
      ) {
        // Auto-init แล้ว play
        engineRef.current
          .init(targetSong)
          .then(() => {
            engineRef.current?.play(targetSong, fromBar, options);
          })
          .catch(() => {});
        return;
      }
      engineRef.current.play(targetSong, fromBar, options);
    },
    [song]
  );

  const playSectionOnce = useCallback(
    (startBar: number, endBar: number, songOverride?: SongProject) => {
      play(startBar, songOverride, {
        playRangeOnce: { startBar, endBar },
      });
    },
    [play]
  );

  const stop = useCallback(() => {
    engineRef.current?.stop();
  }, []);

  const seekToBar = useCallback((index: number) => {
    engineRef.current?.seekToBar(index);
  }, []);

  const setMixerVolume = useCallback((track: TrackId | 'vocal', vol: number) => {
    engineRef.current?.setMixerVolume(track, vol);
  }, []);

  const setLeadDrive = useCallback((drive: LeadGuitarDrive) => {
    engineRef.current?.setLeadDrive(drive);
  }, []);

  const setVocalFxPreset = useCallback((preset: VocalFxPreset) => {
    engineRef.current?.setVocalFxPreset(preset);
  }, []);

  const setLoopRange = useCallback((range: LoopRange | null) => {
    pendingLoopRangeRef.current = range;
    if (engineRef.current) {
      engineRef.current.setLoopRange(range);
    } else {
      setStatus((s) => ({ ...s, loopRange: range }));
    }
  }, []);

  const setMetronomeEnabled = useCallback((enabled: boolean) => {
    if (engineRef.current) {
      engineRef.current.setMetronomeEnabled(enabled);
    } else {
      setStatus((s) => ({ ...s, metronomeEnabled: enabled }));
    }
  }, []);

  const previewChord = useCallback(
    (chordSymbol: string) => {
      engineRef.current?.previewChord(chordSymbol, song);
    },
    [song]
  );

  return {
    isLoading:      status.state === 'loading',
    isReady:        status.state === 'ready' || status.state === 'playing',
    isPlaying:      status.state === 'playing',
    isCountIn:      Boolean(status.isCountIn),
    metronomeEnabled: Boolean(status.metronomeEnabled ?? song.metronomeEnabled),
    loadProgress:   status.loadProgress,
    activeBarIndex: status.activeBarIndex,
    loopRange:      status.loopRange ?? null,
    error:          status.error,
    play,
    playSectionOnce,
    stop,
    seekToBar,
    initEngine,
    setLoopRange,
    setMetronomeEnabled,
    previewChord,
    setMixerVolume,
    setLeadDrive,
    setVocalFxPreset,
  };
}
