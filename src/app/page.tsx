'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { SongProject, MelodyNote } from '@/types/song';
import { createDefaultSong } from '@/lib/defaultSong';
import { ProgressionPreset } from '@/lib/chordUtils';
import { useAudioEngine } from '@/hooks/useAudioEngine';
import { getSavedSongs, saveSong, getActiveSongId, setActiveSongId } from '@/lib/storage';
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
import { PwaInstallPrompt } from '@/components/PwaInstallPrompt';
import { useLanguage } from '@/context/LanguageContext';

export default function Home() {
  const { lang, t } = useLanguage();
  const [song, setSong] = useState<SongProject>(() => createDefaultSong());
  const [activeMode, setActiveMode] = useState<'edit' | 'karaoke'>('edit');
  const [currentBeat, setCurrentBeat] = useState(1);
  const [isSoundPanelOpen, setIsSoundPanelOpen] = useState(false);
  const [showIosBanner, setShowIosBanner] = useState(true);
  const [shareToastMsg, setShareToastMsg] = useState<string | null>(null);

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

    // ถ้าไม่มีใน URL ให้โหลดเพลงล่าสุดที่บันทึกไว้ใน localStorage
    const saved = getSavedSongs();
    const activeId = getActiveSongId();
    const target = saved.find((s) => s.id === activeId) || saved[0];
    if (target) {
      setSong(target);
    }
  }, []);

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

  // Beat ticker driven by BPM (UI only — bar timing from engine)
  const beatsPerBar = song.timeSignature === '3/4' ? 3 : song.timeSignature === '6/8' ? 6 : 4;
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      setCurrentBeat(1);
      return;
    }
    const intervalMs = (60 / song.bpm) * 1000;
    timerRef.current = setInterval(() => {
      setCurrentBeat((prev) => (prev < beatsPerBar ? prev + 1 : 1));
    }, intervalMs);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isPlaying, song.bpm, beatsPerBar]);

  const handleTogglePlay = () => {
    if (!isPlaying) {
      setCurrentBeat(1);
      engine.play(0);
    } else {
      engine.stop();
    }
  };

  const handleStop = () => {
    engine.stop();
    setCurrentBeat(1);
  };

  const handleToggleCountIn = () => {
    setSong((prev) => ({ ...prev, countInEnabled: !prev.countInEnabled }));
  };

  // Open Chord Picker
  const handleOpenChordPicker = (
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
  };

  const handleSelectChord = (newChord: string) => {
    const { sectionId, barId, chordIndex } = chordPickerState;
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
    setChordPickerState((prev) => ({ ...prev, isOpen: false }));
  };

  // Open Progression Presets Modal
  const handleOpenPresetsModal = (sectionId: string, sectionName: string) => {
    setPresetsModalState({
      isOpen: true,
      sectionId,
      sectionName,
    });
  };

  const handleApplyPreset = (preset: ProgressionPreset) => {
    const { sectionId } = presetsModalState;
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
    setPresetsModalState((prev) => ({ ...prev, isOpen: false }));
  };

  // Open Mini Piano Roll Modal
  const handleOpenMelodyPianoRoll = (sectionId: string, barId: string, globalBarIndex: number) => {
    setMelodyModalState({
      isOpen: true,
      sectionId,
      barId,
      globalBarIndex,
    });
  };

  const handleUpdateBarNotes = (sectionId: string, barId: string, notes: MelodyNote[]) => {
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
  };

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

  const handleNavigateBar = (direction: 'prev' | 'next') => {
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
  };

  // Open Vocal Recorder Modal
  const handleOpenVocalRecorder = (sectionId: string, barId: string, globalBarIndex: number) => {
    setVocalModalState({
      isOpen: true,
      sectionId,
      barId,
      globalBarIndex,
    });
  };

  const handleSaveVocal = (sectionId: string, barId: string, vocalAudio: string, latencyOffsetMs: number) => {
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
  };

  const handleClearVocal = (sectionId: string, barId: string) => {
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
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-20 safe-bottom">
      {/* PWA Home Screen Install Prompt Banner */}
      <PwaInstallPrompt />

      {/* iOS / iPad Audio Advice Banner */}
      {showIosBanner && (
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
        onTogglePlay={handleTogglePlay}
        onStop={handleStop}
        onToggleCountIn={handleToggleCountIn}
        onSwitchMode={(mode) => setActiveMode(mode)}
        onToggleSoundPanel={() => setIsSoundPanelOpen((prev) => !prev)}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onOpenLibraryModal={() => setIsLibraryModalOpen(true)}
        onUpdateSong={setSong}
      />

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 mt-5 space-y-6">
        {/* Collapsible 3D Sound & Instrument Panel */}
        <SoundCustomizerPanel
          song={song}
          isOpen={isSoundPanelOpen}
          onUpdateSong={setSong}
          onClose={() => setIsSoundPanelOpen(false)}
        />

        {/* View Switching */}
        {activeMode === 'edit' ? (
          <SectionBuilder
            song={song}
            activeGlobalBarIndex={isPlaying ? currentBarIndex : -1}
            onUpdateSong={setSong}
            onOpenChordPicker={handleOpenChordPicker}
            onOpenPresetsModal={handleOpenPresetsModal}
            onOpenMelodyPianoRoll={handleOpenMelodyPianoRoll}
            onOpenVocalRecorder={handleOpenVocalRecorder}
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
        onSelectSong={(newSong) => setSong(newSong)}
        onClose={() => setIsLibraryModalOpen(false)}
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
    </div>
  );
}
