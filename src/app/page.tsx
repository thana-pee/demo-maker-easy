'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { SongProject, SongSection, MelodyNote, AppViewMode } from '@/types/song';
import { createDefaultSong } from '@/lib/defaultSong';
import { ProgressionPreset } from '@/lib/chordUtils';
import { getTiming } from '@/lib/barPlanner';
import { useAudioEngine } from '@/hooks/useAudioEngine';
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
import { PwaInstallPrompt } from '@/components/PwaInstallPrompt';
import {
  DEFAULT_STARTER_CREDITS,
  getCreditBalance,
} from '@/lib/creditManager';
import {
  GUEST_USER,
  type CloudUser,
  type CloudSyncStatus,
  getCurrentUser,
  getLastSyncedAt,
  isCloudConfigured,
  consumeAuthCallbackFromUrl,
  syncLibraryNow,
} from '@/lib/cloudSync';
import { useLanguage } from '@/context/LanguageContext';

export default function Home() {
  const { lang, t } = useLanguage();
  const [song, setSong] = useState<SongProject>(() => createDefaultSong());
  const [activeMode, setActiveMode] = useState<AppViewMode>('songwriter');
  const [isZenMode, setIsZenMode] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(1);
  const [isSoundPanelOpen, setIsSoundPanelOpen] = useState(false);
  const [showIosBanner, setShowIosBanner] = useState(true);
  const [shareToastMsg, setShareToastMsg] = useState<string | null>(null);

  const selectSongWithVocals = useCallback((nextSong: SongProject) => {
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
  const engine = useAudioEngine(song);
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
  const [creditBalance, setCreditBalance] = useState<number>(DEFAULT_STARTER_CREDITS);
  const [advanceModalState, setAdvanceModalState] = useState<{
    isOpen: boolean;
    targetSection: AdvanceTargetSectionContext | null;
  }>({
    isOpen: false,
    targetSection: null,
  });
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
      setCurrentBeat(1);
      return;
    }
    setCurrentBeat(1);
    const timing = getTiming(song);
    const intervalMs = (timing.barSec / timing.uiBeatsPerBar) * 1000;
    timerRef.current = setInterval(() => {
      setCurrentBeat((prev) => (prev < timing.uiBeatsPerBar ? prev + 1 : 1));
    }, intervalMs);
    return () => {
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

  const handleToggleCountIn = useCallback(() => {
    setSong((prev) => ({ ...prev, countInEnabled: !prev.countInEnabled }));
  }, []);

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
      setSong((prev) => ({
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
  }, []);

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
      setSong((prev) => ({
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
  }, []);

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
    setSong((prev) => ({
      ...prev,
      sections: prev.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          bars: sec.bars.map((bar) => (bar.id === barId ? { ...bar, melodyNotes: notes } : bar)),
        };
      }),
    }));
  }, []);

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
    setSong((prev) => ({
      ...prev,
      vocalLatencyOffsetMs: latencyOffsetMs,
      sections: prev.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          bars: sec.bars.map((bar) => (bar.id === barId ? { ...bar, vocalAudio } : bar)),
        };
      }),
    }));
  }, [song.id]);

  const handleClearVocal = useCallback((sectionId: string, barId: string) => {
    void deleteVocalBlob(makeVocalBlobKey(song.id, barId));
    setSong((prev) => ({
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
  }, [song.id]);

  const handleOpenAdvanceModal = useCallback((section?: SongSection) => {
    if (!section) {
      setAdvanceModalState({ isOpen: true, targetSection: null });
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
      targetSection: {
        sectionId: section.id,
        sectionName: section.name,
        sectionType: section.type,
        chords: chords.length > 0 ? chords.slice(0, 8) : ['C', 'G', 'Am', 'F'],
        existingLyrics,
      },
    });
  }, []);

  const handleApplyAiLyrics = useCallback((sectionId: string, lines: string[]) => {
    if (lines.length === 0) return;
    setSong((prev) => ({
      ...prev,
      sections: prev.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          bars: sec.bars.map((bar, idx) => {
            if (idx < lines.length) {
              return { ...bar, lyrics: lines[idx] };
            }
            if (idx === sec.bars.length - 1 && lines.length > sec.bars.length) {
              return { ...bar, lyrics: lines.slice(idx).join(' ') };
            }
            return bar;
          }),
        };
      }),
    }));
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-20 safe-bottom">
      {/* PWA Home Screen Install Prompt Banner */}
      <PwaInstallPrompt />

      {/* iOS / iPad Audio Advice Banner (hidden in Zen Focus Mode) */}
      {showIosBanner && !isZenMode && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-900 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-block px-2.5 py-0.5 bg-amber-200 text-amber-950 font-black rounded-full text-[10px]">
              {lang === 'th' ? 'คำแนะนำสำหรับ iPad / iPhone' : 'iPad / iPhone Sound Tip'}
            </span>
            <span className="font-medium">
              {lang === 'th'
                ? 'หากเปิดบน iPad กรุณาเปิดสวิตช์เสียงด้านข้างตัวเครื่อง (ไม่ปิด Silent Mode) เพื่อให้เสียงจำลองอะคูสติก 3D ดังชัดเจน'
                : 'On iPad, ensure the side mute switch is OFF (Silent Mode disabled) for full 3D stereo acoustic audio.'}
            </span>
          </div>
          <button
            onClick={() => setShowIosBanner(false)}
            className="text-amber-800 hover:text-amber-950 font-bold px-2 py-0.5 hover:bg-amber-100 rounded-md transition cursor-pointer"
          >
            ✕ {t.close}
          </button>
        </div>
      )}

      {/* Shared Song Loaded Toast */}
      {shareToastMsg && (
        <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-bold flex items-center justify-between gap-3 shadow-sm animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <span>🎉</span>
            <span>{shareToastMsg}</span>
          </div>
          <button
            onClick={() => setShareToastMsg(null)}
            className="px-2 py-0.5 hover:bg-emerald-700 rounded-md transition cursor-pointer text-xs"
          >
            ✕ {t.close}
          </button>
        </div>
      )}

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
        onSwitchMode={(mode) => setActiveMode(mode)}
        onToggleSoundPanel={() => setIsSoundPanelOpen((prev) => !prev)}
        onToggleZenMode={() => setIsZenMode((prev) => !prev)}
        onOpenAccountModal={() => setIsAccountModalOpen(true)}
        onOpenAdvanceModal={() => handleOpenAdvanceModal()}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onOpenLibraryModal={() => setIsLibraryModalOpen(true)}
        onUpdateSong={setSong}
      />

      {/* Main Content Area */}
      <main className={`max-w-7xl mx-auto px-3 sm:px-6 space-y-6 ${isZenMode ? 'mt-3' : 'mt-5'}`}>
        {/* Collapsible 3D Sound & Instrument Panel */}
        <SoundCustomizerPanel
          song={song}
          isOpen={isSoundPanelOpen && !isZenMode}
          onUpdateSong={setSong}
          onClose={() => setIsSoundPanelOpen(false)}
        />

        {/* View Switching: Songwriter / Arranger / Stage (Karaoke) */}
        {activeMode !== 'karaoke' ? (
          <SectionBuilder
            song={song}
            viewMode={activeMode === 'arranger' ? 'arranger' : 'songwriter'}
            activeGlobalBarIndex={isPlaying ? currentBarIndex : -1}
            onUpdateSong={setSong}
            onOpenChordPicker={handleOpenChordPicker}
            onOpenPresetsModal={handleOpenPresetsModal}
            onOpenMelodyPianoRoll={handleOpenMelodyPianoRoll}
            onOpenVocalRecorder={handleOpenVocalRecorder}
            onOpenAdvanceForSection={handleOpenAdvanceModal}
            onSwitchToArranger={() => setActiveMode('arranger')}
          />
        ) : (
          <KaraokeTeleprompter
            song={song}
            activeGlobalBarIndex={currentBarIndex}
            currentBeat={currentBeat}
            isPlaying={isPlaying}
            isCountIn={isCountIn}
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
        onClose={() => setIsExportModalOpen(false)}
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
        }}
        onClose={() => setIsAccountModalOpen(false)}
      />

      {melodyModalState.isOpen && (
        <MiniPianoRollModal
          isOpen={melodyModalState.isOpen}
          song={song}
          sectionId={melodyModalState.sectionId}
          barId={melodyModalState.barId}
          globalBarIndex={melodyModalState.globalBarIndex}
          onUpdateBarNotes={handleUpdateBarNotes}
          onNavigateBar={handleNavigateBar}
          canPrev={currentFlatBarIdx > 0}
          canNext={currentFlatBarIdx >= 0 && currentFlatBarIdx < flatBarsList.length - 1}
          onClose={() => setMelodyModalState((prev) => ({ ...prev, isOpen: false }))}
        />
      )}

      {vocalModalState.isOpen && (
        <VocalRecorderModal
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

      {advanceModalState.isOpen && (
        <AdvanceModeModal
          targetSection={advanceModalState.targetSection}
          onCreditsChange={setCreditBalance}
          onApplyLyrics={handleApplyAiLyrics}
          onClose={() => setAdvanceModalState((prev) => ({ ...prev, isOpen: false }))}
        />
      )}
    </div>
  );
}
