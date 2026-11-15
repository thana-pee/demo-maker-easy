'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Headphones,
  Mic,
  Play,
  Sliders,
  Square,
  Trash2,
  Volume2,
} from 'lucide-react';
import { MicRecorder, playAudioDataUrl } from '@/lib/micRecorder';
import { deleteVocalBlob, makeVocalTakeBlobKey, saveVocalBlob } from '@/lib/audioStorageIdb';
import { flattenSong } from '@/lib/barPlanner';
import {
  VOCAL_FX_PRESETS,
  activateVocalTake,
  addAndActivateVocalTake,
  clampVocalLatencyMs,
  computePreRollPlaybackPlan,
  formatNextTakeName,
  getSectionBarRange,
  removeVocalTake,
} from '@/lib/vocalBoothUtils';
import { useLanguage } from '@/context/LanguageContext';
import { SongProject, VocalFxPreset, VocalTake } from '@/types/song';

export interface VocalBoothControlsProps {
  song: SongProject;
  activeGlobalBarIndex: number;
  isPlaying: boolean;
  isCountIn: boolean;
  isEngineReady?: boolean;
  onInitEngine?: () => Promise<void>;
  onUpdateSong: (updater: (prev: SongProject) => SongProject) => void;
  onStartBoothPlayback?: (fromBar: number, songOverride?: SongProject) => void;
  onStopBoothPlayback?: () => void;
}

export function VocalBoothControls({
  song,
  activeGlobalBarIndex,
  isPlaying,
  isCountIn,
  isEngineReady = false,
  onInitEngine,
  onUpdateSong,
  onStartBoothPlayback,
  onStopBoothPlayback,
}: VocalBoothControlsProps) {
  const { t, lang } = useLanguage();

  const [isExpanded, setIsExpanded] = useState(true);
  const [micSupported, setMicSupported] = useState(true);
  const [scope, setScope] = useState<'full-song' | 'section'>('full-song');
  const [selectedSectionId, setSelectedSectionId] = useState<string>(song.sections[0]?.id || '');
  const [usePreRoll, setUsePreRoll] = useState(true);
  const [rawStudioMic, setRawStudioMic] = useState(true);

  const [boothPhase, setBoothPhase] = useState<'idle' | 'preparing' | 'recording' | 'saving'>('idle');
  const [vuLevel, setVuLevel] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [boothError, setBoothError] = useState<string | null>(null);
  const [auditionTakeId, setAuditionTakeId] = useState<string | null>(null);
  const [isCalibratingBeep, setIsCalibratingBeep] = useState(false);

  const recorderRef = useRef<MicRecorder | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const auditionAudioRef = useRef<HTMLAudioElement | null>(null);
  const calibCtxRef = useRef<AudioContext | null>(null);
  const calibTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSessionRef = useRef<{
    scope: 'full-song' | 'section';
    sectionId?: string;
    startGlobalBarIndex: number;
    endGlobalBarIndex: number;
    preRollOffsetSec: number;
    playbackSawRunning: boolean;
  } | null>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setMicSupported(MicRecorder.isSupported());
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const effectiveSectionId = useMemo(() => {
    if (song.sections.some((s) => s.id === selectedSectionId)) return selectedSectionId;
    return song.sections[0]?.id || '';
  }, [song.sections, selectedSectionId]);

  const flatBars = useMemo(() => flattenSong(song), [song]);
  const totalBars = flatBars.length;
  const activeTakeScopeRange = useMemo(
    () => getSectionBarRange(song, scope, effectiveSectionId),
    [song, scope, effectiveSectionId]
  );

  const fxPreset: VocalFxPreset = song.mixer.vocal?.fxPreset ?? 'studio-warm';
  const autoDucking = song.mixer.vocal?.autoDucking ?? true;
  const latencyMs = clampVocalLatencyMs(song.vocalLatencyOffsetMs ?? 0);
  const vocalTakes = useMemo(() => song.vocalTakes || [], [song.vocalTakes]);

  const stopAudition = useCallback(() => {
    if (auditionAudioRef.current) {
      auditionAudioRef.current.pause();
      auditionAudioRef.current = null;
    }
    setAuditionTakeId(null);
  }, []);

  const stopElapsedTimer = useCallback(() => {
    if (elapsedTimerRef.current !== null) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }, []);

  const finalizeTakeRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    const session = activeSessionRef.current;
    if (!recorder || !session) return;

    setBoothPhase('saving');
    stopElapsedTimer();
    onStopBoothPlayback?.();

    try {
      const result = await recorder.stop();
      recorderRef.current = null;
      activeSessionRef.current = null;
      setVuLevel(0);

      if (!result || !result.dataUrl) {
        setBoothPhase('idle');
        return;
      }

      const takeId = `take_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const currentLatency = clampVocalLatencyMs(song.vocalLatencyOffsetMs ?? 0);
      const currentFx: VocalFxPreset = song.mixer.vocal?.fxPreset ?? 'studio-warm';

      const newTake: VocalTake = {
        id: takeId,
        name: formatNextTakeName(song, song.vocalTakes || [], session.scope, session.sectionId),
        scope: session.scope,
        ...(session.scope === 'section' && session.sectionId ? { sectionId: session.sectionId } : {}),
        startGlobalBarIndex: session.startGlobalBarIndex,
        endGlobalBarIndex: session.endGlobalBarIndex,
        preRollOffsetSec: session.preRollOffsetSec,
        latencyOffsetMs: currentLatency,
        audioDataUrl: result.dataUrl,
        fxPreset: currentFx,
        isActive: true,
        createdAt: new Date().toISOString(),
      };

      void saveVocalBlob(makeVocalTakeBlobKey(song.id, takeId), result.dataUrl);

      onUpdateSong((prev) => {
        const nextStatus =
          !prev.statusTag || prev.statusTag === 'draft' || prev.statusTag === 'arranged'
            ? 'vocal-recorded'
            : prev.statusTag;
        return {
          ...prev,
          updatedAt: new Date().toISOString(),
          statusTag: nextStatus,
          vocalTakes: addAndActivateVocalTake(prev.vocalTakes || [], newTake, flattenSong(prev).length),
          mixer: {
            ...prev.mixer,
            vocal: {
              ...prev.mixer.vocal,
              enabled: true,
              volume: prev.mixer.vocal?.volume ?? 95,
              fxPreset: prev.mixer.vocal?.fxPreset ?? 'studio-warm',
              autoDucking: prev.mixer.vocal?.autoDucking ?? true,
            },
          },
        };
      });
    } catch (err) {
      setBoothError(err instanceof Error ? err.message : 'Unable to save vocal recording.');
    } finally {
      setBoothPhase('idle');
      setElapsedSec(0);
    }
  }, [onStopBoothPlayback, onUpdateSong, song, stopElapsedTimer]);

  // Monitor playback start/end so reaching end-of-song auto-finalizes a full take cleanly
  useEffect(() => {
    const session = activeSessionRef.current;
    if (boothPhase !== 'recording' || !session) return;
    if (isPlaying || isCountIn) {
      session.playbackSawRunning = true;
      return;
    }
    if (session.playbackSawRunning && !isPlaying && !isCountIn) {
      const raf = requestAnimationFrame(() => {
        void finalizeTakeRecording();
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [boothPhase, isPlaying, isCountIn, finalizeTakeRecording]);

  useEffect(() => {
    return () => {
      stopElapsedTimer();
      stopAudition();
      if (calibTimerRef.current !== null) clearTimeout(calibTimerRef.current);
      try { calibCtxRef.current?.close(); } catch {}
      recorderRef.current?.cancel();
    };
  }, [stopAudition, stopElapsedTimer]);

  const handleStartBoothRecording = async () => {
    if (boothPhase !== 'idle') return;
    setBoothError(null);
    stopAudition();

    if (!micSupported) {
      setBoothError(lang === 'th' ? 'เบราว์เซอร์นี้ไม่รองรับการอัดไมค์' : 'Microphone recording is not supported.');
      return;
    }

    setBoothPhase('preparing');
    try {
      if (!isEngineReady && onInitEngine) {
        await onInitEngine();
      }

      const plan = computePreRollPlaybackPlan(song, scope, effectiveSectionId, usePreRoll);
      const recorder = new MicRecorder();
      await recorder.start((lvl) => setVuLevel(lvl), { rawStudioMic });
      recorderRef.current = recorder;

      activeSessionRef.current = {
        scope,
        sectionId: scope === 'section' ? effectiveSectionId : undefined,
        startGlobalBarIndex: plan.targetStartBarIndex,
        endGlobalBarIndex: plan.targetEndBarIndex,
        preRollOffsetSec: plan.preRollOffsetSec,
        playbackSawRunning: false,
      };

      setElapsedSec(0);
      stopElapsedTimer();
      const startedAt = Date.now();
      elapsedTimerRef.current = setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
      }, 250);

      setBoothPhase('recording');

      // Mute active takes overlapping the newly recorded range so monitor stays clean
      const songForBooth: SongProject = {
        ...song,
        countInEnabled: plan.useCountIn,
        vocalTakes: (song.vocalTakes || []).map((t) => {
          const tEnd = t.endGlobalBarIndex ?? Math.max(0, totalBars - 1);
          const overlaps = t.startGlobalBarIndex <= plan.targetEndBarIndex && plan.targetStartBarIndex <= tEnd;
          return overlaps ? { ...t, isActive: false } : t;
        }),
      };

      onStartBoothPlayback?.(plan.playbackStartBarIndex, songForBooth);
    } catch (err) {
      recorderRef.current?.cancel();
      recorderRef.current = null;
      activeSessionRef.current = null;
      setBoothPhase('idle');
      setBoothError(
        err instanceof Error
          ? err.message
          : lang === 'th'
            ? 'ไม่สามารถเข้าถึงไมโครโฟนได้'
            : 'Microphone permission denied or unavailable.'
      );
    }
  };

  const handlePlayCalibrationClicks = () => {
    if (isCalibratingBeep) return;
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    setIsCalibratingBeep(true);
    const ctx = new AudioCtx();
    calibCtxRef.current = ctx;
    const beatSec = 60 / Math.max(40, song.bpm || 80);

    for (let i = 0; i < 4; i++) {
      const when = ctx.currentTime + 0.05 + i * beatSec;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = i === 0 ? 1100 : 780;
      gain.gain.setValueAtTime(0.001, when);
      gain.gain.exponentialRampToValueAtTime(0.28, when + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, when + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(when);
      osc.stop(when + 0.1);
    }

    calibTimerRef.current = setTimeout(() => {
      try { ctx.close(); } catch {}
      calibCtxRef.current = null;
      setIsCalibratingBeep(false);
    }, Math.round((4 * beatSec + 0.2) * 1000));
  };

  const handleNudgeLatency = (newVal: number) => {
    const clamped = clampVocalLatencyMs(newVal);
    onUpdateSong((prev) => ({
      ...prev,
      vocalLatencyOffsetMs: clamped,
      vocalTakes: (prev.vocalTakes || []).map((tk) =>
        tk.isActive ? { ...tk, latencyOffsetMs: clamped } : tk
      ),
    }));
  };

  const handleToggleAudition = (take: VocalTake) => {
    if (!take.audioDataUrl) return;
    if (auditionTakeId === take.id) {
      stopAudition();
      return;
    }
    stopAudition();
    const audio = playAudioDataUrl(take.audioDataUrl, {
      onEnd: () => {
        setAuditionTakeId(null);
        auditionAudioRef.current = null;
      },
    });
    auditionAudioRef.current = audio;
    setAuditionTakeId(take.id);
  };

  const inBackingPreRoll =
    boothPhase === 'recording' &&
    usePreRoll &&
    (isCountIn ||
      (activeGlobalBarIndex >= 0 &&
        activeGlobalBarIndex < activeTakeScopeRange.startGlobalBarIndex));

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <section
      data-testid="vocal-booth-panel"
      className="mb-6 bg-surface-2 border border-hairline rounded-2xl p-3.5 sm:p-4 space-y-3"
    >
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <h3 className="text-sm sm:text-base font-bold text-ink-900">
            {t.vocalBoothTitle}
          </h3>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-ok-bg text-ok-text border border-ok-border">
            {t.vocalBoothFreeBadge}
          </span>
          {vocalTakes.length > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono-tabular font-semibold bg-accent-50 text-accent-text border border-accent-200">
              {vocalTakes.length} {lang === 'th' ? 'เทค' : 'Take(s)'}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-ink-700 hover:text-ink-900 bg-surface-1 border border-hairline px-2.5 py-1.5 rounded-xl cursor-pointer"
        >
          <span>{isExpanded ? (lang === 'th' ? 'ย่อบูธ' : 'Collapse') : (lang === 'th' ? 'เปิดบูธ' : 'Expand')}</span>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-3 pt-1">
          {/* Row 1: Scope + Pre-Roll + Studio Mic Toggle */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {/* Scope Selector */}
            <div className="bg-surface-1 border border-hairline rounded-xl p-2.5 space-y-2">
              <div className="text-[11px] font-semibold text-ink-400 uppercase tracking-wider">
                {lang === 'th' ? 'ขอบเขตการอัดต่อเนื่อง' : 'Recording Scope'}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={boothPhase !== 'idle'}
                  onClick={() => setScope('full-song')}
                  className={`flex-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer disabled:opacity-50 ${
                    scope === 'full-song'
                      ? 'bg-accent-500 text-white border-accent-500'
                      : 'bg-surface-2 text-ink-700 border-hairline hover:border-accent-200'
                  }`}
                >
                  {t.scopeFullSong}
                </button>
                <button
                  type="button"
                  disabled={boothPhase !== 'idle'}
                  onClick={() => setScope('section')}
                  className={`flex-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer disabled:opacity-50 ${
                    scope === 'section'
                      ? 'bg-accent-500 text-white border-accent-500'
                      : 'bg-surface-2 text-ink-700 border-hairline hover:border-accent-200'
                  }`}
                >
                  {t.scopeSelectedSection}
                </button>
              </div>
              {scope === 'section' ? (
                <select
                  aria-label="Section scope"
                  disabled={boothPhase !== 'idle'}
                  value={effectiveSectionId}
                  onChange={(e) => setSelectedSectionId(e.target.value)}
                  className="w-full text-xs bg-surface-2 border border-hairline rounded-lg px-2 py-1.5 text-ink-900 font-medium"
                >
                  {song.sections.map((sec) => (
                    <option key={sec.id} value={sec.id}>
                      {sec.name} ({sec.bars.length} {lang === 'th' ? 'ห้อง' : 'bars'})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-[11px] text-ink-600 font-mono-tabular">
                  {lang === 'th'
                    ? `ห้องที่ ${activeTakeScopeRange.startGlobalBarIndex + 1}–${activeTakeScopeRange.endGlobalBarIndex + 1} (${activeTakeScopeRange.barCount} ห้อง)`
                    : `Bars ${activeTakeScopeRange.startGlobalBarIndex + 1}–${activeTakeScopeRange.endGlobalBarIndex + 1} (${activeTakeScopeRange.barCount} bars)`}
                </div>
              )}
            </div>

            {/* Pre-Roll & Auto-Ducking */}
            <div className="bg-surface-1 border border-hairline rounded-xl p-2.5 space-y-2">
              <div className="text-[11px] font-semibold text-ink-400 uppercase tracking-wider">
                {lang === 'th' ? 'คิวเข้าจังหวะ & มิกซ์อัตโนมัติ' : 'Cue & Auto Mix'}
              </div>
              <label className="flex items-center justify-between gap-2 text-xs text-ink-900 cursor-pointer">
                <span className="font-medium">{t.preRollToggle}</span>
                <input
                  type="checkbox"
                  disabled={boothPhase !== 'idle'}
                  checked={usePreRoll}
                  onChange={(e) => setUsePreRoll(e.target.checked)}
                  className="accent-[#5B61EE] w-4 h-4 cursor-pointer"
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-xs text-ink-700 cursor-pointer pt-1 border-t border-hairline">
                <span>{t.autoDuckingLabel}</span>
                <input
                  type="checkbox"
                  checked={autoDucking}
                  onChange={(e) =>
                    onUpdateSong((prev) => ({
                      ...prev,
                      mixer: {
                        ...prev.mixer,
                        vocal: {
                          ...prev.mixer.vocal,
                          enabled: prev.mixer.vocal?.enabled ?? true,
                          volume: prev.mixer.vocal?.volume ?? 95,
                          autoDucking: e.target.checked,
                        },
                      },
                    }))
                  }
                  className="accent-[#5B61EE] w-4 h-4 cursor-pointer"
                />
              </label>
            </div>

            {/* Raw Studio Mic Mode & FX Preset */}
            <div className="bg-surface-1 border border-hairline rounded-xl p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-900">
                  <Headphones className="w-3.5 h-3.5 text-accent-text" />
                  <span>{t.studioMicToggle}</span>
                </span>
                <input
                  type="checkbox"
                  disabled={boothPhase !== 'idle'}
                  checked={rawStudioMic}
                  onChange={(e) => setRawStudioMic(e.target.checked)}
                  className="accent-[#5B61EE] w-4 h-4 cursor-pointer"
                />
              </div>
              <p className="text-[11px] text-ink-600 leading-snug">
                {rawStudioMic
                  ? t.headphoneTip
                  : lang === 'th'
                    ? 'โหมดลำโพง iPad/มือถือ: เปิดระบบกันเสียงหอนและตัดเสียงรบกวน'
                    : 'Speaker mode: echo cancellation & noise suppression enabled'}
              </p>
              <div className="flex flex-wrap gap-1 pt-1">
                {VOCAL_FX_PRESETS.map((p) => {
                  const active = fxPreset === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        onUpdateSong((prev) => ({
                          ...prev,
                          mixer: {
                            ...prev.mixer,
                            vocal: {
                              ...prev.mixer.vocal,
                              enabled: prev.mixer.vocal?.enabled ?? true,
                              volume: prev.mixer.vocal?.volume ?? 95,
                              fxPreset: p.id,
                            },
                          },
                        }))
                      }
                      className={`flex-1 whitespace-nowrap px-2 py-1 rounded-lg text-[10px] font-semibold border transition cursor-pointer ${
                        active
                          ? 'bg-accent-500 text-white border-accent-500'
                          : 'bg-surface-2 text-ink-700 border-hairline hover:border-accent-200'
                      }`}
                    >
                      {lang === 'th' ? p.labelTh : p.labelEn}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Row 2: Action Bar + VU Meter + Latency Calibrator */}
          <div className="bg-surface-1 border border-hairline rounded-xl p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              {boothPhase !== 'recording' ? (
                <button
                  type="button"
                  disabled={boothPhase === 'preparing' || boothPhase === 'saving'}
                  onClick={handleStartBoothRecording}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rec-500 hover:bg-rec-600 text-white text-xs sm:text-sm font-bold shadow-e1 transition cursor-pointer disabled:opacity-60"
                >
                  <Mic className="w-4 h-4" />
                  <span>
                    {boothPhase === 'preparing'
                      ? lang === 'th'
                        ? 'กำลังเตรียมวงและไมค์...'
                        : 'Preparing Band & Mic...'
                      : boothPhase === 'saving'
                        ? lang === 'th'
                          ? 'กำลังบันทึกเทค...'
                          : 'Saving Take...'
                        : t.startRecBooth}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void finalizeTakeRecording()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-ink-900 hover:opacity-90 text-white text-xs sm:text-sm font-bold shadow-e1 transition cursor-pointer animate-pulse"
                >
                  <Square className="w-4 h-4 fill-rec-500 text-rec-500" />
                  <span>{t.stopRecBooth}</span>
                  <span className="font-mono-tabular px-1.5 py-0.5 rounded bg-white/15">
                    {formatTimer(elapsedSec)}
                  </span>
                </button>
              )}

              {/* Live VU Meter & Pre-Roll Cue Banner */}
              <div className="flex items-center gap-2 min-w-[140px]">
                <Volume2 className={`w-4 h-4 ${boothPhase === 'recording' ? 'text-rec-500' : 'text-ink-400'}`} />
                <div className="w-28 sm:w-32 h-2.5 rounded-full bg-surface-inset overflow-hidden border border-hairline">
                  <div
                    className={`h-full transition-all duration-75 ${
                      vuLevel > 80 ? 'bg-rec-500' : vuLevel > 40 ? 'bg-ok-text' : 'bg-accent-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(boothPhase === 'recording' ? 8 : 0, vuLevel))}%` }}
                  />
                </div>
                {inBackingPreRoll && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-warn-bg text-warn-text border border-warn-border animate-pulse">
                    {lang === 'th' ? '⏳ Pre-Roll เข้าท่อนในอีก 1 ห้อง...' : '⏳ 1-Bar Pre-Roll Cue...'}
                  </span>
                )}
              </div>
            </div>

            {/* One-Tap Latency Calibrator + Nudge Slider */}
            <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0 border-t lg:border-t-0 border-hairline">
              <button
                type="button"
                onClick={handlePlayCalibrationClicks}
                disabled={isCalibratingBeep || boothPhase === 'recording'}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-surface-2 hover:bg-surface-inset text-ink-800 border border-hairline cursor-pointer disabled:opacity-50"
              >
                <Sliders className="w-3.5 h-3.5 text-accent-text" />
                <span>
                  {isCalibratingBeep
                    ? lang === 'th'
                      ? 'ติ๊ก-ต็อก 1-2-3-4...'
                      : 'Click 1-2-3-4...'
                    : lang === 'th'
                      ? 'เช็กจังหวะ Sync'
                      : 'Sync Click'}
                </span>
              </button>

              <div className="flex items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => handleNudgeLatency(latencyMs - 10)}
                  className="px-2 py-1 rounded-lg bg-surface-2 border border-hairline font-mono-tabular hover:border-accent-200 cursor-pointer"
                >
                  -10
                </button>
                <input
                  aria-label="Vocal Latency Offset ms"
                  type="range"
                  min="-150"
                  max="250"
                  step="5"
                  value={latencyMs}
                  onChange={(e) => handleNudgeLatency(parseInt(e.target.value, 10))}
                  className="w-24 sm:w-28 accent-[#5B61EE] cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => handleNudgeLatency(latencyMs + 10)}
                  className="px-2 py-1 rounded-lg bg-surface-2 border border-hairline font-mono-tabular hover:border-accent-200 cursor-pointer"
                >
                  +10
                </button>
                <span className="font-mono-tabular text-[11px] font-semibold text-accent-text w-14 text-right">
                  {latencyMs > 0 ? `+${latencyMs}` : latencyMs}ms
                </span>
              </div>
            </div>
          </div>

          {boothError && (
            <div className="text-xs font-medium text-rec-600 bg-rec-50 border border-rec-200 rounded-xl px-3 py-2">
              {boothError}
            </div>
          )}

          {/* Row 3: Multi-Take Comping List */}
          {vocalTakes.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-ink-400 uppercase tracking-wider">
                {lang === 'th'
                  ? 'เทคเสียงร้องที่อัดไว้ (Multi-Take Comping — กดเลือกเทคเพื่อเปิดฟังพร้อมวง)'
                  : 'Recorded Vocal Takes (Click to activate for mix playback)'}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {vocalTakes.map((take) => {
                  const rangeLabel = `${lang === 'th' ? 'ห้อง' : 'Bar'} ${take.startGlobalBarIndex + 1}–${
                    (take.endGlobalBarIndex ?? Math.max(0, totalBars - 1)) + 1
                  }`;
                  const isAuditioning = auditionTakeId === take.id;
                  return (
                    <div
                      key={take.id}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition ${
                        take.isActive
                          ? 'bg-accent-50 border-accent-300'
                          : 'bg-surface-1 border-hairline opacity-80'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSong((prev) => ({
                            ...prev,
                            vocalTakes: activateVocalTake(
                              prev.vocalTakes || [],
                              take.id,
                              flattenSong(prev).length
                            ),
                          }))
                        }
                        className="flex items-center gap-2 text-left min-w-0 flex-1 cursor-pointer"
                      >
                        <CheckCircle2
                          className={`w-4 h-4 shrink-0 ${
                            take.isActive ? 'text-accent-500' : 'text-ink-300'
                          }`}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-ink-900 truncate">{take.name}</div>
                          <div className="text-[11px] text-ink-600 font-mono-tabular truncate">
                            {rangeLabel} • {take.fxPreset}
                          </div>
                        </div>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          title={lang === 'th' ? 'ฟังเฉพาะเสียงร้อง' : 'Solo audition vocal take'}
                          onClick={() => handleToggleAudition(take)}
                          disabled={!take.audioDataUrl}
                          className="p-1.5 rounded-lg bg-surface-2 border border-hairline hover:border-accent-300 text-ink-800 cursor-pointer disabled:opacity-40"
                        >
                          {isAuditioning ? (
                            <Square className="w-3.5 h-3.5 text-rec-500" />
                          ) : (
                            <Play className="w-3.5 h-3.5 text-accent-text" />
                          )}
                        </button>
                        <button
                          type="button"
                          title={lang === 'th' ? 'ลบเทคนี้' : 'Delete take'}
                          onClick={() => {
                            if (auditionTakeId === take.id) stopAudition();
                            void deleteVocalBlob(makeVocalTakeBlobKey(song.id, take.id));
                            onUpdateSong((prev) => ({
                              ...prev,
                              vocalTakes: removeVocalTake(prev.vocalTakes || [], take.id),
                            }));
                          }}
                          className="p-1.5 rounded-lg bg-surface-2 border border-hairline hover:bg-rec-50 hover:border-rec-200 text-ink-500 hover:text-rec-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
