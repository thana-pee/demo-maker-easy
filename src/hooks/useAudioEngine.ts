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
import type { SongProject, LeadGuitarDrive } from '../types/song';
import type { TrackId } from '../lib/barPlanner';
import type { EngineStatus } from '../lib/audioEngine';

export interface AudioEngineHookResult {
  isLoading: boolean;
  isReady: boolean;
  isPlaying: boolean;
  loadProgress: number;
  activeBarIndex: number;
  error: string | undefined;
  play: (fromBar?: number) => void;
  stop: () => void;
  seekToBar: (index: number) => void;
  initEngine: () => Promise<void>;
  setMixerVolume: (track: TrackId, vol: number) => void;
  setLeadDrive: (drive: LeadGuitarDrive) => void;
}

export function useAudioEngine(song: SongProject): AudioEngineHookResult {
  const engineRef = useRef<import('../lib/audioEngine').AudioEngine | null>(null);
  const [status, setStatus] = useState<EngineStatus>({
    state: 'idle',
    loadProgress: 0,
    activeBarIndex: -1,
  });

  // โหลด audioEngine แบบ lazy (browser-only)
  useEffect(() => {
    let unsub: (() => void) | null = null;
    import('../lib/audioEngine').then(({ getAudioEngine }) => {
      const engine = getAudioEngine();
      engineRef.current = engine;
      setStatus(engine.getState());
      unsub = engine.onStatusChange((s: EngineStatus) => setStatus(s));
    });
    return () => { unsub?.(); };
  }, []);

  // Auto-reload เมื่อโมเดลกีตาร์เปลี่ยน (แค่ invalidate state ไม่ reload อัตโนมัติ)
  const prevModelRef = useRef<string>(song.guitarModel);
  useEffect(() => {
    if (prevModelRef.current !== song.guitarModel && engineRef.current) {
      prevModelRef.current = song.guitarModel;
      // reset state เพื่อให้ต้อง init ใหม่
      setStatus((s: EngineStatus) => ({ ...s, state: 'idle' as const }));
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

  const initEngine = useCallback(async () => {
    if (!engineRef.current) {
      const { getAudioEngine } = await import('../lib/audioEngine');
      engineRef.current = getAudioEngine();
    }
    await engineRef.current.init(song, (p: number) => {
      setStatus((s: EngineStatus) => ({ ...s, loadProgress: p }));
    });
  }, [song]);

  const play = useCallback((fromBar = 0) => {
    if (!engineRef.current) return;
    if (engineRef.current.getState().state !== 'ready' &&
        engineRef.current.getState().state !== 'playing') {
      // Auto-init แล้ว play
      engineRef.current.init(song).then(() => {
        engineRef.current?.play(song, fromBar);
      });
      return;
    }
    engineRef.current.play(song, fromBar);
  }, [song]);

  const stop = useCallback(() => {
    engineRef.current?.stop();
  }, []);

  const seekToBar = useCallback((index: number) => {
    engineRef.current?.seekToBar(index);
  }, []);

  const setMixerVolume = useCallback((track: TrackId, vol: number) => {
    engineRef.current?.setMixerVolume(track, vol);
  }, []);

  const setLeadDrive = useCallback((drive: LeadGuitarDrive) => {
    engineRef.current?.setLeadDrive(drive);
  }, []);

  return {
    isLoading:      status.state === 'loading',
    isReady:        status.state === 'ready' || status.state === 'playing',
    isPlaying:      status.state === 'playing',
    loadProgress:   status.loadProgress,
    activeBarIndex: status.activeBarIndex,
    error:          status.error,
    play,
    stop,
    seekToBar,
    initEngine,
    setMixerVolume,
    setLeadDrive,
  };
}
