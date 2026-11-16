'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Info, CheckCircle2, X, Sparkles } from 'lucide-react';
import {
  SongProject,
  SongSection,
  MelodyNote,
  AppViewMode,
  ThaiSongGenre,
  ThaiLyricEra,
  ThaiLyricDialect,
  ThaiSongwriterStyle,
  ThaiEmotionalResolution,
} from '@/types/song';
import { createDefaultSong } from '@/lib/defaultSong';
import { generateUniqueId } from '@/lib/sectionUtils';
import { ProgressionPreset } from '@/lib/chordUtils';
import { useAudioEngine } from '@/hooks/useAudioEngine';
import type { LoopRange } from '@/lib/audioEngine';
import {
  getSavedSongs,
  saveSong,
  getActiveSongId,
  setActiveSongId,
  hydrateSongVocalsFromIdb,
} from '@/lib/storage';
import {
  saveVocalBlob,
  deleteVocalBlob,
  makeVocalBlobKey,
} from '@/lib/audioStorageIdb';
import { parseSongFromUrl } from '@/lib/shareUrl';
import { trackSessionStartOnce, trackUsageEvent } from '@/lib/analytics';

import { TransportBar } from '@/components/TransportBar';
import { SoundCustomizerPanel } from '@/components/SoundCustomizerPanel';
import { SectionBuilder } from '@/components/SectionBuilder';
import { KaraokeTeleprompter } from '@/components/KaraokeTeleprompter';
import { ChordPickerModal } from '@/components/ChordPickerModal';
import { ProgressionPresetsModal } from '@/components/ProgressionPresetsModal';
import { ExportModal } from '@/components/ExportModal';
import { SongLibraryModal } from '@/components/SongLibraryModal';
import { MiniPianoRollModal } from '@/components/MiniPianoRollModal';
import { VocalRecorderModal } from '@/components/VocalRecorderModal';
import { AccountSyncModal } from '@/components/AccountSyncModal';
import {
  AdvanceModeModal,
  type AdvanceTargetSectionContext,
} from '@/components/AdvanceModeModal';
import {
  ContinueStoryModal,
  type ContinueStoryConfig,
} from '@/components/ContinueStoryModal';
import { EasyModeStarterModal } from '@/components/EasyModeStarterModal';
import { PwaInstallPrompt } from '@/components/PwaInstallPrompt';
import {
  DEFAULT_STARTER_CREDITS,
  getCreditBalance,
  syncWalletFromServer,
} from '@/lib/creditManager';
import {
  GUEST_USER,
  type CloudUser,
  type CloudSyncStatus,
  getAuthAccessToken,
  getCurrentUser,
  getLastSyncedAt,
  isCloudConfigured,
  consumeAuthCallbackFromUrl,
  refreshAuthSession,
  syncLibraryNow,
} from '@/lib/cloudSync';
import { useLanguage } from '@/context/LanguageContext';

const MAX_HISTORY = 30;

function buildSongHistoryFingerprint(s: SongProject): string {
  return JSON.stringify({
    title: s.title,
    bpm: s.bpm,
    timeSignature: s.timeSignature,
    baseKey: s.baseKey,
    transposeSemitones: s.transposeSemitones,
    capoFret: s.capoFret,
    sections: s.sections,
    mixer: s.mixer,
    thaiGenre: s.thaiGenre,
    songwriterStyle: s.songwriterStyle,
    emotionalResolution: s.emotionalResolution,
  });
}

export default function Home() {
  const { lang, t } = useLanguage();
  const [song, setSong] = useState<SongProject>(() => createDefaultSong());
  const songRef = useRef<SongProject>(song);
  const undoStackRef = useRef<SongProject[]>([]);
  const redoStackRef = useRef<SongProject[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    songRef.current = song;
  }, [song]);

  const updateSongWithHistory = useCallback(
    (updater: SongProject | ((prev: SongProject) => SongProject)) => {
      const prev = songRef.current;
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (next === prev) return;

      if (buildSongHistoryFingerprint(prev) !== buildSongHistoryFingerprint(next)) {
        const snapshot = structuredClone(prev);
        undoStackRef.current = [...undoStackRef.current, snapshot].slice(-MAX_HISTORY);
        redoStackRef.current = [];
        setCanUndo(undoStackRef.current.length > 0);
        setCanRedo(false);
      }

      songRef.current = next;
      setSong(next);
    },
    []
  );
  const [activeMode, setActiveMode] = useState<AppViewMode>('songwriter');
  const [isZenMode, setIsZenMode] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(1);
  const [isSoundPanelOpen, setIsSoundPanelOpen] = useState(false);
  const [showIosBanner, setShowIosBanner] = useState(true);

  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      try {
        if (localStorage.getItem('demo_maker_ios_tip_dismissed') === '1') {
          setShowIosBanner(false);
        }
      } catch {
        // Ignore storage access errors
      }
    });
    const handleShowTip = () => {
      setShowIosBanner(true);
      try {
        localStorage.removeItem('demo_maker_ios_tip_dismissed');
      } catch {
        // Ignore storage access errors
      }
    };
    window.addEventListener('demo-maker:show-ios-tip', handleShowTip);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('demo-maker:show-ios-tip', handleShowTip);
    };
  }, []);

  const handleDismissIosTip = useCallback(() => {
    setShowIosBanner(false);
    try {
      localStorage.setItem('demo_maker_ios_tip_dismissed', '1');
    } catch {
      // Ignore storage access errors
    }
  }, []);
  const [shareToastMsg, setShareToastMsg] = useState<string | null>(null);

  const handleUndo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const prevSnapshot = stack[stack.length - 1];
    undoStackRef.current = stack.slice(0, -1);
    const currentSnapshot = structuredClone(songRef.current);
    redoStackRef.current = [...redoStackRef.current, currentSnapshot].slice(-MAX_HISTORY);
    songRef.current = prevSnapshot;
    setSong(prevSnapshot);
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
    setShareToastMsg(lang === 'th' ? '↩ ย้อนกลับ 1 ขั้นแล้ว' : '↩ Undid last edit');
  }, [lang]);

  const handleRedo = useCallback(() => {
    const stack = redoStackRef.current;
    if (stack.length === 0) return;
    const nextSnapshot = stack[stack.length - 1];
    redoStackRef.current = stack.slice(0, -1);
    const currentSnapshot = structuredClone(songRef.current);
    undoStackRef.current = [...undoStackRef.current, currentSnapshot].slice(-MAX_HISTORY);
    songRef.current = nextSnapshot;
    setSong(nextSnapshot);
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
    setShareToastMsg(lang === 'th' ? '↪ ทำซ้ำ 1 ขั้นแล้ว' : '↪ Redid edit');
  }, [lang]);

  const selectSongWithVocals = useCallback((nextSong: SongProject) => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
    songRef.current = nextSong;
    setSong(nextSong);
    void hydrateSongVocalsFromIdb(nextSong).then((hydrated) => {
      if (hydrated !== nextSong) {
        setSong((cur) => (cur.id === hydrated.id ? hydrated : cur));
      }
    });
  }, []);

  // 1. ตรวจสอบเพลงจาก URL หรือจาก localStorage เมื่อเปิดเว็บครั้งแรก
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const rafId = requestAnimationFrame(() => {
      // ตรวจสอบ query string (?song= หรือ ?data=)
      if (window.location.search) {
        const shared = parseSongFromUrl(window.location.search);
        if (shared) {
          setSong(shared);
          saveSong(shared);
          setActiveSongId(shared.id);
          setShareToastMsg(`📥 โหลดเพลง "${shared.title}" จากลิงก์แชร์เรียบร้อยแล้ว! พร้อมเล่นและแต่งต่อได้ทันที`);
          // ล้าง query string ออกเพื่อไม่ให้ค้างในช่อง URL
          window.history.replaceState({}, document.title, window.location.pathname);
          return;
        }
      }

      // ถ้าไม่มีใน URL ให้โหลดเพลงล่าสุดที่บันทึกไว้ใน localStorage (และ hydrate เสียงร้องจาก IndexedDB)
      const saved = getSavedSongs();
      const activeId = getActiveSongId();
      const target = saved.find((s) => s.id === activeId) || saved[0];
      if (target) {
        selectSongWithVocals(target);
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [selectSongWithVocals]);

  // 2. Auto-save เพลงลง localStorage เมื่อมีการเปลี่ยนแปลง (Debounce 600ms)
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const timer = setTimeout(() => {
      saveSong(song);
    }, 600);
    return () => clearTimeout(timer);
  }, [song]);

  // ── Audio Engine (real smplr playback) ──
  const [previewAudioSong, setPreviewAudioSong] = useState<SongProject | null>(null);
  const engine = useAudioEngine(previewAudioSong ?? song);
  const isPlaying = engine.isPlaying;
  const currentBarIndex = engine.activeBarIndex >= 0 ? engine.activeBarIndex : 0;
  const isCountIn = false; // count-in handled internally by engine

  // Modals state
  const [chordPickerState, setChordPickerState] = useState<{
    isOpen: boolean;
    sectionId: string;
    barId: string;
    chordIndex: 0 | 1;
    currentChord: string;
  }>({
    isOpen: false,
    sectionId: '',
    barId: '',
    chordIndex: 0,
    currentChord: 'C',
  });

  const [presetsModalState, setPresetsModalState] = useState<{
    isOpen: boolean;
    sectionId: string;
    sectionName: string;
  }>({
    isOpen: false,
    sectionId: '',
    sectionName: '',
  });

  const [melodyModalState, setMelodyModalState] = useState<{
    isOpen: boolean;
    sectionId: string;
    barId: string;
    globalBarIndex: number;
  }>({
    isOpen: false,
    sectionId: '',
    barId: '',
    globalBarIndex: 0,
  });

  const [vocalModalState, setVocalModalState] = useState<{
    isOpen: boolean;
    sectionId: string;
    barId: string;
    globalBarIndex: number;
  }>({
    isOpen: false,
    sectionId: '',
    barId: '',
    globalBarIndex: 0,
  });

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isLibraryModalOpen, setIsLibraryModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isEasyModalOpen, setIsEasyModalOpen] = useState(false);
  const [creditBalance, setCreditBalance] = useState<number>(DEFAULT_STARTER_CREDITS);
  const [advanceModalState, setAdvanceModalState] = useState<{
    isOpen: boolean;
    targetSection: AdvanceTargetSectionContext | null;
    initialMode?: 'quick' | 'deep';
    initialTab?: 'rhyme' | 'ai-lyrics' | 'ai-director' | 'wallet';
    initialTopic?: string;
  }>({
    isOpen: false,
    targetSection: null,
    initialMode: 'quick',
  });
  const [continueStoryTarget, setContinueStoryTarget] = useState<SongSection | null>(null);
  const [cloudUser, setCloudUser] = useState<CloudUser>(GUEST_USER);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>('local-only');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  // 1b. โหลดสถานะผู้ใช้ Cloud + รับ Magic Link Hash + จับสถานะ Online/Offline
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let active = true;

    const initCloudState = async () => {
      const callbackUser = await consumeAuthCallbackFromUrl();
      if (!active) return;
      const resolvedUser = callbackUser || getCurrentUser();
      setCloudUser(resolvedUser);
      setLastSyncedAt(getLastSyncedAt());
      setCreditBalance(getCreditBalance());
      if (resolvedUser.mode === 'authenticated') {
        let token = getAuthAccessToken();
        if (token) {
          let syncedWallet = await syncWalletFromServer(token);
          if (active && !syncedWallet.ok && syncedWallet.status === 401) {
            const refreshed = await refreshAuthSession();
            if (active && refreshed?.accessToken) {
              token = refreshed.accessToken;
              setCloudUser(refreshed.user);
              syncedWallet = await syncWalletFromServer(token);
            } else if (active && !refreshed) {
              setCloudUser(getCurrentUser());
            }
          }
          if (active && syncedWallet.ok && syncedWallet.wallet) {
            setCreditBalance(syncedWallet.wallet.balance);
          }
        }
      }
      if (!navigator.onLine) {
        setSyncStatus('offline');
      } else if (resolvedUser.mode === 'authenticated' && isCloudConfigured()) {
        setSyncStatus('synced');
      } else {
        setSyncStatus('local-only');
      }
    };
    void initCloudState();

    const handleOnline = () => {
      const u = getCurrentUser();
      setSyncStatus(u.mode === 'authenticated' && isCloudConfigured() ? 'synced' : 'local-only');
    };
    const handleOffline = () => setSyncStatus('offline');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      active = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSyncNow = useCallback(async () => {
    setSyncStatus('syncing');
    const saved = getSavedSongs();
    const localList = saved.some((s) => s.id === song.id)
      ? saved.map((s) => (s.id === song.id ? song : s))
      : [song, ...saved];
    const res = await syncLibraryNow(localList);
    setSyncStatus(res.status);
    if (res.syncedAt) setLastSyncedAt(res.syncedAt);
    const updatedActive = res.mergedSongs.find((s) => s.id === song.id);
    if (updatedActive && Date.parse(updatedActive.updatedAt || '') > Date.parse(song.updatedAt || '')) {
      selectSongWithVocals(updatedActive);
    }
    return { success: res.success, message: res.message };
  }, [song, selectSongWithVocals]);

  // Beat ticker driven by bar timing & synced on every bar change
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      const rafId = requestAnimationFrame(() => setCurrentBeat(1));
      return () => cancelAnimationFrame(rafId);
    }
    const rafId = requestAnimationFrame(() => setCurrentBeat(1));
    const barSec = (60 / song.bpm) * (song.timeSignature === '3/4' ? 3 : song.timeSignature === '6/8' ? 3 : 4);
    const uiBeatsPerBar = song.timeSignature === '3/4' ? 3 : song.timeSignature === '6/8' ? 6 : 4;
    const intervalMs = (barSec / uiBeatsPerBar) * 1000;
    timerRef.current = setInterval(() => {
      setCurrentBeat((prev) => (prev < uiBeatsPerBar ? prev + 1 : 1));
    }, intervalMs);
    return () => {
      cancelAnimationFrame(rafId);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, currentBarIndex, song.bpm, song.timeSignature]);

  const handleTogglePlay = useCallback(() => {
    if (!isPlaying) {
      setCurrentBeat(1);
      engine.play(0);
    } else {
      engine.stop();
    }
  }, [isPlaying, engine]);

  const handleStop = useCallback(() => {
    engine.stop();
    setCurrentBeat(1);
  }, [engine]);

  const handleToggleLoopRange = useCallback(
    (range: LoopRange | null) => {
      engine.setLoopRange(range);
    },
    [engine]
  );

  const handlePlayBarFromIndex = useCallback(
    (globalBarIndex: number, songOverride?: SongProject) => {
      setCurrentBeat(1);
      engine.play(globalBarIndex, songOverride ?? song);
    },
    [engine, song]
  );

  const handlePlaySectionOnce = useCallback(
    (startBar: number, endBar: number, songOverride?: SongProject) => {
      setCurrentBeat(1);
      engine.playSectionOnce(startBar, endBar, songOverride ?? song);
    },
    [engine, song]
  );

  const handleToggleCountIn = useCallback(() => {
    updateSongWithHistory((prev) => ({ ...prev, countInEnabled: !prev.countInEnabled }));
  }, [updateSongWithHistory]);

  // Open Chord Picker
  const handleOpenChordPicker = useCallback((
    sectionId: string,
    barId: string,
    chordIndex: 0 | 1,
    currentChord: string
  ) => {
    setChordPickerState({
      isOpen: true,
      sectionId,
      barId,
      chordIndex,
      currentChord,
    });
  }, []);

  const handleSelectChord = useCallback((newChord: string) => {
    setChordPickerState((pickerState) => {
      const { sectionId, barId, chordIndex } = pickerState;
      updateSongWithHistory((prev) => ({
        ...prev,
        sections: prev.sections.map((sec) => {
          if (sec.id !== sectionId) return sec;
          return {
            ...sec,
            bars: sec.bars.map((bar) => {
              if (bar.id !== barId) return bar;
              const updatedChords = [...bar.chords];
              updatedChords[chordIndex] = newChord;
              return { ...bar, chords: updatedChords };
            }),
          };
        }),
      }));
      return { ...pickerState, isOpen: false };
    });
  }, [updateSongWithHistory]);

  // Open Progression Presets Modal
  const handleOpenPresetsModal = useCallback((sectionId: string, sectionName: string) => {
    setPresetsModalState({
      isOpen: true,
      sectionId,
      sectionName,
    });
  }, []);

  const handleApplyPreset = useCallback((preset: ProgressionPreset) => {
    setPresetsModalState((presetState) => {
      const { sectionId } = presetState;
      updateSongWithHistory((prev) => ({
        ...prev,
        sections: prev.sections.map((sec) => {
          if (sec.id !== sectionId) return sec;
          const newBars = preset.chords.map((chord, idx) => ({
            id: `bar-${Date.now()}-${idx}`,
            chordsPerBar: 1 as const,
            chords: [chord] as [string],
            playStyle: 'normal' as const,
            lyrics: sec.bars[idx] ? sec.bars[idx].lyrics : '',
            melodyNotes: [],
          }));
          return { ...sec, bars: newBars };
        }),
      }));
      return { ...presetState, isOpen: false };
    });
  }, [updateSongWithHistory]);

  // Open Mini Piano Roll Modal
  const handleOpenMelodyPianoRoll = useCallback((sectionId: string, barId: string, globalBarIndex: number) => {
    setMelodyModalState({
      isOpen: true,
      sectionId,
      barId,
      globalBarIndex,
    });
  }, []);

  const handleUpdateBarNotes = useCallback((sectionId: string, barId: string, notes: MelodyNote[]) => {
    updateSongWithHistory((prev) => ({
      ...prev,
      sections: prev.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          bars: sec.bars.map((bar) => (bar.id === barId ? { ...bar, melodyNotes: notes } : bar)),
        };
      }),
    }));
  }, [updateSongWithHistory]);

  // Flattened bars for smooth prev/next navigation inside Mini Piano Roll
  const flatBarsList = useMemo(() => {
    const list: Array<{ sectionId: string; barId: string; globalBarIndex: number }> = [];
    song.sections.forEach((s) => {
      s.bars.forEach((b) => {
        list.push({ sectionId: s.id, barId: b.id, globalBarIndex: list.length });
      });
    });
    return list;
  }, [song.sections]);

  const currentFlatBarIdx = flatBarsList.findIndex(
    (b) => b.sectionId === melodyModalState.sectionId && b.barId === melodyModalState.barId
  );

  const handleNavigateBar = useCallback((direction: 'prev' | 'next') => {
    if (currentFlatBarIdx === -1) return;
    const targetIdx = direction === 'prev' ? currentFlatBarIdx - 1 : currentFlatBarIdx + 1;
    if (targetIdx >= 0 && targetIdx < flatBarsList.length) {
      const target = flatBarsList[targetIdx];
      setMelodyModalState({
        isOpen: true,
        sectionId: target.sectionId,
        barId: target.barId,
        globalBarIndex: target.globalBarIndex,
      });
    }
  }, [currentFlatBarIdx, flatBarsList]);

  // Open Vocal Recorder Modal
  const handleOpenVocalRecorder = useCallback((sectionId: string, barId: string, globalBarIndex: number) => {
    setVocalModalState({
      isOpen: true,
      sectionId,
      barId,
      globalBarIndex,
    });
  }, []);

  const handleSaveVocal = useCallback((sectionId: string, barId: string, vocalAudio: string, latencyOffsetMs: number) => {
    void saveVocalBlob(makeVocalBlobKey(song.id, barId), vocalAudio);
    updateSongWithHistory((prev) => ({
      ...prev,
      vocalLatencyOffsetMs: latencyOffsetMs,
      statusTag:
        !prev.statusTag || prev.statusTag === 'draft' || prev.statusTag === 'arranged'
          ? 'vocal-recorded'
          : prev.statusTag,
      sections: prev.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          bars: sec.bars.map((bar) => (bar.id === barId ? { ...bar, vocalAudio } : bar)),
        };
      }),
    }));
  }, [song.id, updateSongWithHistory]);

  const handleClearVocal = useCallback((sectionId: string, barId: string) => {
    void deleteVocalBlob(makeVocalBlobKey(song.id, barId));
    updateSongWithHistory((prev) => ({
      ...prev,
      sections: prev.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          bars: sec.bars.map((bar) => {
            if (bar.id !== barId) return bar;
            const copy = { ...bar };
            delete copy.vocalAudio;
            return copy;
          }),
        };
      }),
    }));
  }, [song.id, updateSongWithHistory]);

  const openAdvanceSectionModal = useCallback(
    (section?: SongSection, mode: 'quick' | 'deep' = 'quick') => {
      if (!section) {
        setAdvanceModalState({ isOpen: true, targetSection: null, initialMode: mode });
        return;
      }
      const chords = section.bars
        .flatMap((bar) => bar.chords)
        .filter((c): c is string => Boolean(c && c.trim()));
      const existingLyrics = section.bars
        .map((bar) => bar.lyrics.trim())
        .filter(Boolean)
        .join(' / ');
      setAdvanceModalState({
        isOpen: true,
        initialMode: mode,
        targetSection: {
          sectionId: section.id,
          sectionName: section.name,
          sectionType: section.type,
          chords: chords.length > 0 ? chords.slice(0, 8) : ['C', 'G', 'Am', 'F'],
          existingLyrics,
        },
      });
    },
    []
  );

  const handleOpenAdvanceModal = useCallback(
    (section?: SongSection) => openAdvanceSectionModal(section, 'quick'),
    [openAdvanceSectionModal]
  );

  const handleOpenInlineAiSection = useCallback(
    (section: SongSection, mode: 'quick' | 'deep') => openAdvanceSectionModal(section, mode),
    [openAdvanceSectionModal]
  );

  const handleApplyAiLyrics = useCallback(
    (
      sectionId: string,
      lines: string[],
      melodyNotesPerBar?: MelodyNote[][],
      suggestedChords?: string[],
      selectedBarIndices?: number[]
    ) => {
      if (lines.length === 0) return;
      const allowedIndices = selectedBarIndices
        ? new Set(selectedBarIndices)
        : new Set(lines.map((_, i) => i));

      updateSongWithHistory((prev) => ({
        ...prev,
        updatedAt: new Date().toISOString(),
        sections: prev.sections.map((sec) => {
          if (sec.id !== sectionId) return sec;
          const updatedBars = sec.bars.map((bar, idx) => {
            if (!allowedIndices.has(idx) || idx >= lines.length) return bar;
            const nextNotes =
              melodyNotesPerBar &&
              Array.isArray(melodyNotesPerBar[idx]) &&
              melodyNotesPerBar[idx].length > 0
                ? melodyNotesPerBar[idx]
                : bar.melodyNotes;
            const suggestedChord = suggestedChords?.[idx]?.trim();
            return {
              ...bar,
              lyrics: lines[idx],
              melodyNotes: nextNotes,
              ...(suggestedChord
                ? { chords: [suggestedChord], chordsPerBar: 1 as const }
                : {}),
            };
          });

          // If user requested more bars than section currently has (e.g. 6-8 bars)
          for (let idx = sec.bars.length; idx < lines.length && idx < 8; idx++) {
            if (!allowedIndices.has(idx)) continue;
            const templateBar = sec.bars[idx % Math.max(1, sec.bars.length)];
            const suggestedChord = suggestedChords?.[idx]?.trim();
            const nextNotes =
              melodyNotesPerBar &&
              Array.isArray(melodyNotesPerBar[idx]) &&
              melodyNotesPerBar[idx].length > 0
                ? melodyNotesPerBar[idx]
                : [];
            updatedBars.push({
              id: generateUniqueId('bar'),
              chordsPerBar: suggestedChord ? 1 : (templateBar?.chordsPerBar ?? 1),
              chords: suggestedChord
                ? [suggestedChord]
                : templateBar?.chords?.length
                  ? [...templateBar.chords]
                  : ['C'],
              playStyle: 'normal',
              lyrics: lines[idx],
              melodyNotes: nextNotes,
            });
          }

          return {
            ...sec,
            bars: updatedBars,
          };
        }),
      }));
    },
    [updateSongWithHistory]
  );

  const handleApplySectionVocalAudio = useCallback(
    (sectionId: string, barIndex: number, audioDataUrl: string) => {
      const targetBar = song.sections.find((s) => s.id === sectionId)?.bars[barIndex];
      if (!targetBar) return;
      handleSaveVocal(sectionId, targetBar.id, audioDataUrl, song.vocalLatencyOffsetMs ?? 0);
    },
    [song.sections, song.vocalLatencyOffsetMs, handleSaveVocal]
  );

  const handleUpdateSongStyleMeta = useCallback(
    (meta: {
      thaiGenre?: ThaiSongGenre;
      lyricEra?: ThaiLyricEra;
      lyricDialect?: ThaiLyricDialect;
      songwriterStyle?: ThaiSongwriterStyle;
      emotionalResolution?: ThaiEmotionalResolution;
    }) => {
      if (meta.songwriterStyle && meta.songwriterStyle !== 'none') {
        trackUsageEvent({
          eventName: 'select_songwriter_style',
          category: 'style',
          songwriterStyle: meta.songwriterStyle,
          thaiGenre: meta.thaiGenre ?? song.thaiGenre,
          lyricDialect: meta.lyricDialect ?? song.lyricDialect,
          lyricEra: meta.lyricEra ?? song.lyricEra,
          emotionalResolution: meta.emotionalResolution ?? song.emotionalResolution,
          featureVariant: 'advance_meta',
        });
      }
      updateSongWithHistory((prev) => ({
        ...prev,
        ...meta,
        updatedAt: new Date().toISOString(),
      }));
    },
    [
      song.emotionalResolution,
      song.lyricDialect,
      song.lyricEra,
      song.thaiGenre,
      updateSongWithHistory,
    ]
  );

  useEffect(() => {
    trackSessionStartOnce(song, activeMode);
  }, [song, activeMode]);

  const handleAddNextAiStorySection = useCallback(
    (afterSectionId: string) => {
      const targetSec = song.sections.find((s) => s.id === afterSectionId);
      if (targetSec) {
        setContinueStoryTarget(targetSec);
      }
    },
    [song.sections]
  );

  const handleConfirmContinueStory = useCallback(
    (config: ContinueStoryConfig) => {
      if (!continueStoryTarget) return;
      const afterSectionId = continueStoryTarget.id;
      const chordsToUse = config.chords.length > 0 ? config.chords : ['C', 'G', 'Am', 'F'];
      const barCount = Math.max(1, Math.min(8, config.barsCount || 4));

      const newBars = Array.from({ length: barCount }, (_, idx) => ({
        id: generateUniqueId('bar'),
        chordsPerBar: 1 as const,
        chords: [chordsToUse[idx % chordsToUse.length]],
        playStyle: 'normal' as const,
        lyrics: '',
        melodyNotes: [],
      }));

      const newSection: SongSection = {
        id: generateUniqueId('sec'),
        type: config.sectionType,
        name: config.sectionName,
        intensity: config.sectionType === 'chorus' ? 'high' : config.sectionType === 'verse' ? 'low' : 'medium',
        bars: newBars,
        instruments: {
          guitarRhythm: true,
          guitarRhythmStyle: config.sectionType === 'chorus' ? 'campfire-strum' : 'soft-strum',
          guitarLead: config.sectionType === 'solo',
          bass: true,
          bassStyle: 'root-fifth',
          piano: config.sectionType !== 'verse',
          pianoStyle: 'warm-pad',
          drums: config.sectionType === 'chorus',
          drumsStyle: config.sectionType === 'chorus' ? 'simple-kit' : 'shaker-cajon',
        },
      };

      updateSongWithHistory((prev) => {
        const idx = prev.sections.findIndex((s) => s.id === afterSectionId);
        const insertAt = idx >= 0 ? idx + 1 : prev.sections.length;
        const nextSections = [...prev.sections];
        nextSections.splice(insertAt, 0, newSection);
        return {
          ...prev,
          updatedAt: new Date().toISOString(),
          sections: nextSections,
        };
      });

      setContinueStoryTarget(null);

      if (config.actionType === 'ai-lyric') {
        const combinedTopic = [config.storyDirection, config.customTopic].filter(Boolean).join(' • ');
        setAdvanceModalState({
          isOpen: true,
          initialMode: 'quick',
          initialTab: 'ai-lyrics',
          initialTopic: combinedTopic,
          targetSection: {
            sectionId: newSection.id,
            sectionName: newSection.name,
            sectionType: newSection.type,
            chords: newSection.bars.flatMap((b) => b.chords),
            existingLyrics: '',
          },
        });
      }
    },
    [continueStoryTarget, updateSongWithHistory]
  );

  const handlePreviewEasySongToggle = useCallback(
    (previewSong: SongProject) => {
      if (isPlaying) {
        engine.stop();
        setPreviewAudioSong(null);
        return;
      }
      setPreviewAudioSong(previewSong);
      setCurrentBeat(1);
      engine.play(0, previewSong);
    },
    [isPlaying, engine]
  );

  const handleStopEasyAudio = useCallback(() => {
    engine.stop();
    setPreviewAudioSong(null);
    setCurrentBeat(1);
  }, [engine]);

  const handleApplyEasySong = useCallback(
    (generatedSong: SongProject, targetView: 'songwriter' | 'arranger') => {
      engine.stop();
      engine.setLoopRange(null);
      setPreviewAudioSong(null);
      updateSongWithHistory(generatedSong);
      saveSong(generatedSong);
      setActiveSongId(generatedSong.id);
      setActiveMode(targetView);
      setIsEasyModalOpen(false);
    },
    [engine, updateSongWithHistory]
  );

  return (
    <div className="min-h-screen bg-canvas text-ink-900 pb-28 md:pb-20 safe-bottom transition-colors">
      {/* PWA Home Screen Install Prompt Banner */}
      <PwaInstallPrompt />

      {/* Floating Studio Toasts (Bottom-Left) */}
      {(showIosBanner && !isZenMode) || shareToastMsg ? (
        <div className="fixed left-4 bottom-24 md:bottom-6 z-40 flex flex-col gap-2 max-w-sm pointer-events-none">
          {shareToastMsg && (
            <div className="pointer-events-auto bg-surface-1 border border-hairline shadow-e3 rounded-2xl px-3.5 py-2.5 text-xs flex items-start justify-between gap-3">
              <div className="flex items-start gap-2 text-ink-900">
                <CheckCircle2 className="w-4 h-4 text-ok-500 shrink-0 mt-0.5" />
                <span className="font-medium leading-snug">{shareToastMsg}</span>
              </div>
              <button
                onClick={() => setShareToastMsg(null)}
                className="text-ink-400 hover:text-ink-900 p-0.5 rounded-md transition cursor-pointer shrink-0"
                aria-label={t.close}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {showIosBanner && !isZenMode && (
            <div className="pointer-events-auto bg-surface-1 border border-hairline shadow-e3 rounded-2xl px-3.5 py-2.5 text-xs flex items-start justify-between gap-3">
              <div className="flex items-start gap-2 text-ink-700">
                <Info className="w-4 h-4 text-accent-text shrink-0 mt-0.5" />
                <div className="leading-snug">
                  <span className="font-semibold text-ink-900 mr-1.5">
                    {lang === 'th' ? 'คำแนะนำสำหรับ iPad / iPhone:' : 'iPad / iPhone Tip:'}
                  </span>
                  <span>
                    {lang === 'th'
                      ? 'โปรดปิด Silent Mode ด้านข้างตัวเครื่องเพื่อให้เสียงจำลองอะคูสติก 3D ดังชัดเจน'
                      : 'Ensure side Silent Mode switch is OFF for full 3D acoustic audio.'}
                  </span>
                </div>
              </div>
              <button
                onClick={handleDismissIosTip}
                className="text-ink-400 hover:text-ink-900 p-0.5 rounded-md transition cursor-pointer shrink-0"
                aria-label={t.close}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      ) : null}

      {/* Top Sticky Transport Bar */}
      <TransportBar
        song={song}
        activeMode={activeMode}
        isPlaying={isPlaying}
        currentBarIndex={currentBarIndex}
        currentBeat={currentBeat}
        isCountIn={isCountIn}
        isSoundPanelOpen={isSoundPanelOpen}
        isZenMode={isZenMode}
        cloudUser={cloudUser}
        syncStatus={syncStatus}
        creditBalance={creditBalance}
        onTogglePlay={handleTogglePlay}
        onStop={handleStop}
        onToggleCountIn={handleToggleCountIn}
        onSwitchMode={(mode) => {
          setActiveMode(mode);
          trackUsageEvent({
            eventName: 'switch_view_mode',
            category: 'feature',
            viewMode: mode,
            featureVariant: mode,
          });
        }}
        onToggleSoundPanel={() => setIsSoundPanelOpen((prev) => !prev)}
        onToggleZenMode={() => setIsZenMode((prev) => !prev)}
        onOpenAccountModal={() => setIsAccountModalOpen(true)}
        onOpenAdvanceModal={() => handleOpenAdvanceModal()}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onOpenLibraryModal={() => setIsLibraryModalOpen(true)}
        onUpdateSong={updateSongWithHistory}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />

      {/* Main Content Area */}
      <main className={`max-w-7xl mx-auto px-3 sm:px-6 space-y-6 ${isZenMode ? 'mt-3' : 'mt-5'}`}>
        {/* Collapsible 3D Sound & Instrument Panel */}
        <SoundCustomizerPanel
          song={song}
          isOpen={isSoundPanelOpen}
          onUpdateSong={updateSongWithHistory}
          onClose={() => setIsSoundPanelOpen(false)}
        />

        {/* Easy Mode Starter CTA Banner (hidden in Zen & Karaoke modes) */}
        {!isZenMode && activeMode !== 'karaoke' && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-linear-to-r from-indigo-50 via-white to-amber-50/70 px-4 py-3 shadow-2xs">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-ink-900">
                  {t.easyModeTitle}
                </div>
                <p className="text-xs text-ink-600">
                  {t.easyModeSubtitle}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsEasyModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold shadow-e1 transition cursor-pointer shrink-0"
            >
              <Sparkles className="w-4 h-4" />
              <span>{t.easyModeBtn.replace(/^✨\s*/, '')}</span>
            </button>
          </div>
        )}

        {/* View Switching: Songwriter / Arranger / Stage (Karaoke) */}
        {activeMode !== 'karaoke' ? (
          <SectionBuilder
            song={song}
            viewMode={activeMode === 'arranger' ? 'arranger' : 'songwriter'}
            activeGlobalBarIndex={isPlaying ? currentBarIndex : -1}
            loopRange={engine.loopRange}
            onToggleLoopRange={handleToggleLoopRange}
            onPlayBarFromIndex={handlePlayBarFromIndex}
            onPlaySectionOnce={handlePlaySectionOnce}
            onOpenKaraoke={() => setActiveMode('karaoke')}
            onUpdateSong={updateSongWithHistory}
            onOpenChordPicker={handleOpenChordPicker}
            onOpenPresetsModal={handleOpenPresetsModal}
            onOpenMelodyPianoRoll={handleOpenMelodyPianoRoll}
            onOpenVocalRecorder={handleOpenVocalRecorder}
            onOpenAdvanceForSection={handleOpenAdvanceModal}
            onOpenInlineAiSection={handleOpenInlineAiSection}
            onAddNextAiStorySection={handleAddNextAiStorySection}
            onSwitchToArranger={() => setActiveMode('arranger')}
            onCreditsChange={setCreditBalance}
            onOpenWallet={() =>
              setAdvanceModalState({
                isOpen: true,
                targetSection: null,
                initialMode: 'quick',
                initialTab: 'wallet',
              })
            }
          />
        ) : (
          <KaraokeTeleprompter
            song={song}
            activeGlobalBarIndex={currentBarIndex}
            currentBeat={currentBeat}
            isPlaying={isPlaying}
            isCountIn={isCountIn}
            isEngineReady={engine.isReady}
            onInitEngine={engine.initEngine}
            onUpdateSong={updateSongWithHistory}
            onStartBoothPlayback={(fromBar, songOverride) => {
              setCurrentBeat(1);
              engine.play(fromBar, songOverride);
            }}
            onStopBoothPlayback={handleStop}
          />
        )}
      </main>

      {/* Modals */}
      <ChordPickerModal
        isOpen={chordPickerState.isOpen}
        baseKey={song.baseKey}
        currentChord={chordPickerState.currentChord}
        onSelectChord={handleSelectChord}
        onClose={() => setChordPickerState((prev) => ({ ...prev, isOpen: false }))}
      />

      <ProgressionPresetsModal
        isOpen={presetsModalState.isOpen}
        sectionName={presetsModalState.sectionName}
        transposeSemitones={song.transposeSemitones}
        onApplyPreset={handleApplyPreset}
        onClose={() => setPresetsModalState((prev) => ({ ...prev, isOpen: false }))}
      />

      <ExportModal
        isOpen={isExportModalOpen}
        song={song}
        onUpdateSong={updateSongWithHistory}
        onClose={() => setIsExportModalOpen(false)}
        onCreditsChange={setCreditBalance}
        onOpenTopUpWallet={() => {
          setIsExportModalOpen(false);
          setAdvanceModalState({
            isOpen: true,
            targetSection: null,
            initialMode: 'quick',
            initialTab: 'wallet',
          });
        }}
      />

      <SongLibraryModal
        isOpen={isLibraryModalOpen}
        currentSong={song}
        onSelectSong={selectSongWithVocals}
        onClose={() => setIsLibraryModalOpen(false)}
      />

      <AccountSyncModal
        isOpen={isAccountModalOpen}
        user={cloudUser}
        syncStatus={syncStatus}
        lastSyncedAt={lastSyncedAt}
        onSyncNow={handleSyncNow}
        onAuthChange={(nextUser, nextStatus) => {
          setCloudUser(nextUser);
          setSyncStatus(nextStatus);
          if (nextUser.mode === 'authenticated') {
            const token = getAuthAccessToken();
            if (token) {
              void syncWalletFromServer(token).then((synced) => {
                if (synced.ok && synced.wallet) {
                  setCreditBalance(synced.wallet.balance);
                }
              });
            }
          } else {
            setCreditBalance(getCreditBalance());
          }
        }}
        onClose={() => setIsAccountModalOpen(false)}
      />

      {melodyModalState.isOpen && (
        <MiniPianoRollModal
          key={`${melodyModalState.sectionId}-${melodyModalState.barId}`}
          isOpen={melodyModalState.isOpen}
          song={song}
          sectionId={melodyModalState.sectionId}
          barId={melodyModalState.barId}
          globalBarIndex={melodyModalState.globalBarIndex}
          creditBalance={creditBalance}
          thaiGenre={song.thaiGenre}
          onCreditsChange={setCreditBalance}
          onSaveVocalToBar={(audioDataUrl) =>
            handleSaveVocal(
              melodyModalState.sectionId,
              melodyModalState.barId,
              audioDataUrl,
              song.vocalLatencyOffsetMs ?? 0
            )
          }
          onUpdateBarNotes={handleUpdateBarNotes}
          onNavigateBar={handleNavigateBar}
          canPrev={currentFlatBarIdx > 0}
          canNext={currentFlatBarIdx >= 0 && currentFlatBarIdx < flatBarsList.length - 1}
          onClose={() => setMelodyModalState((prev) => ({ ...prev, isOpen: false }))}
        />
      )}

      {vocalModalState.isOpen && (
        <VocalRecorderModal
          key={`${vocalModalState.sectionId}-${vocalModalState.barId}`}
          isOpen={vocalModalState.isOpen}
          song={song}
          sectionId={vocalModalState.sectionId}
          barId={vocalModalState.barId}
          globalBarIndex={vocalModalState.globalBarIndex}
          onSaveVocal={handleSaveVocal}
          onClearVocal={handleClearVocal}
          onClose={() => setVocalModalState((prev) => ({ ...prev, isOpen: false }))}
        />
      )}

      {isEasyModalOpen && (
        <EasyModeStarterModal
          isOpen={isEasyModalOpen}
          creditBalance={creditBalance}
          isPlaying={isPlaying}
          onCreditsChange={setCreditBalance}
          onPreviewAudioToggle={handlePreviewEasySongToggle}
          onStopAudio={handleStopEasyAudio}
          onApplySong={handleApplyEasySong}
          onOpenWallet={() => {
            handleStopEasyAudio();
            setIsEasyModalOpen(false);
            setAdvanceModalState({
              isOpen: true,
              targetSection: null,
              initialMode: 'quick',
              initialTab: 'wallet',
            });
          }}
          onClose={() => {
            handleStopEasyAudio();
            setIsEasyModalOpen(false);
          }}
        />
      )}

      {advanceModalState.isOpen && (
        <AdvanceModeModal
          key={`${advanceModalState.targetSection?.sectionId ?? 'global'}-${advanceModalState.initialMode ?? 'quick'}-${advanceModalState.initialTab ?? 'auto'}`}
          targetSection={advanceModalState.targetSection}
          song={song}
          initialMode={advanceModalState.initialMode}
          initialTab={advanceModalState.initialTab}
          initialTopic={advanceModalState.initialTopic}
          cloudUser={cloudUser}
          onOpenAccountModal={() => setIsAccountModalOpen(true)}
          onCreditsChange={setCreditBalance}
          onApplyLyrics={handleApplyAiLyrics}
          onApplySectionVocalAudio={handleApplySectionVocalAudio}
          onUpdateSongStyleMeta={handleUpdateSongStyleMeta}
          onApplySongUpdate={updateSongWithHistory}
          onClose={() => setAdvanceModalState((prev) => ({ ...prev, isOpen: false }))}
        />
      )}

      {continueStoryTarget && (
        <ContinueStoryModal
          isOpen={Boolean(continueStoryTarget)}
          afterSection={continueStoryTarget}
          songKey={song.baseKey}
          existingSections={song.sections}
          onClose={() => setContinueStoryTarget(null)}
          onConfirm={handleConfirmContinueStory}
        />
      )}
    </div>
  );
}
