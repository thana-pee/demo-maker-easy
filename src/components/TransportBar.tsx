'use client';

import React from 'react';
import { SongProject, TimeSignature } from '@/types/song';
import { useLanguage } from '@/context/LanguageContext';

interface TransportBarProps {
  song: SongProject;
  activeMode: 'edit' | 'karaoke';
  isPlaying: boolean;
  currentBarIndex: number;
  currentBeat: number;
  isCountIn: boolean;
  isSoundPanelOpen: boolean;
  onTogglePlay: () => void;
  onStop: () => void;
  onToggleCountIn: () => void;
  onSwitchMode: (mode: 'edit' | 'karaoke') => void;
  onToggleSoundPanel: () => void;
  onOpenExportModal: () => void;
  onOpenLibraryModal: () => void;
  onUpdateSong: (updater: (prev: SongProject) => SongProject) => void;
}

const CHROMATIC_KEYS = ['F#', 'G', 'Ab', 'A', 'Bb', 'B', 'C', 'C#', 'D', 'Eb', 'E', 'F'];

export const TransportBar: React.FC<TransportBarProps> = ({
  song,
  activeMode,
  isPlaying,
  currentBarIndex,
  currentBeat,
  isCountIn,
  isSoundPanelOpen,
  onTogglePlay,
  onStop,
  onToggleCountIn,
  onSwitchMode,
  onToggleSoundPanel,
  onOpenExportModal,
  onOpenLibraryModal,
  onUpdateSong,
}) => {
  const { lang, t, toggleLang } = useLanguage();
  const beatsPerBar = song.timeSignature === '3/4' ? 3 : song.timeSignature === '6/8' ? 6 : 4;

  const currentKeyName = () => {
    // baseKey is C (index 6 in CHROMATIC_KEYS)
    const baseIdx = 6;
    const targetIdx = (baseIdx + song.transposeSemitones + 120) % 12;
    return CHROMATIC_KEYS[targetIdx];
  };

  const changeTranspose = (delta: number) => {
    onUpdateSong((prev) => ({
      ...prev,
      transposeSemitones: Math.max(-6, Math.min(6, prev.transposeSemitones + delta)),
    }));
  };

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 shadow-xs px-3 sm:px-6 py-2.5 sm:py-3 safe-top">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
        {/* Left: Song Library & Editable Title */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          <button
            onClick={onOpenLibraryModal}
            className="flex items-center gap-1.5 sm:gap-2 px-3 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs sm:text-sm transition cursor-pointer min-h-[40px]"
          >
            <span>{t.mySongs}</span>
          </button>
          <div>
            <input
              type="text"
              value={song.title}
              onChange={(e) => {
                const newTitle = e.target.value;
                onUpdateSong((prev) => ({ ...prev, title: newTitle }));
              }}
              className="font-black text-sm sm:text-base text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-[#1A73E8] focus:outline-none px-1"
            />
            <div className="text-[11px] text-slate-400 px-1 flex items-center gap-2">
              <span>{t.autoSaved}</span>
              <span>•</span>
              <span className="text-emerald-600 font-medium">{t.audioEngineBadge}</span>
            </div>
          </div>
        </div>

        {/* Center: Transport & Beat Ticker */}
        <div className="flex items-center gap-1.5 sm:gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-1 sm:p-1.5 shadow-2xs">
          <button
            onClick={onTogglePlay}
            className={`flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2 rounded-xl text-white font-black text-xs sm:text-sm shadow-xs transition cursor-pointer min-h-[40px] ${
              isPlaying ? 'bg-amber-600 hover:bg-amber-700' : 'bg-[#1A73E8] hover:bg-blue-700'
            }`}
          >
            <span>{isPlaying ? '⏸' : '▶'}</span>
            <span>{isPlaying ? t.pause : t.playDemo}</span>
          </button>
          <button
            onClick={onStop}
            className="px-2.5 sm:px-3 py-2 rounded-xl hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm transition cursor-pointer min-h-[40px]"
            title={lang === 'th' ? 'หยุดและกลับไปต้นเพลง' : 'Stop and rewind to start'}
          >
            {t.stop}
          </button>

          {/* Count-in Toggle */}
          <button
            onClick={onToggleCountIn}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer hidden md:inline-block min-h-[36px] ${
              song.countInEnabled
                ? 'bg-blue-100 text-[#1A73E8] border border-blue-200'
                : 'bg-slate-100 text-slate-500 border border-slate-200'
            }`}
          >
            {song.countInEnabled ? t.countInOn : t.countInOff}
          </button>

          {/* Live Bar & Beat Indicator */}
          <div className="flex items-center gap-1 sm:gap-1.5 pl-1.5 sm:pl-2 pr-1.5 sm:pr-2 border-l border-slate-200">
            <div className="text-right text-[11px] text-slate-500 mr-1 leading-tight">
              {isCountIn ? (
                <div className="text-amber-600 font-bold text-xs animate-pulse">{t.countInBadge}</div>
              ) : (
                <div>{t.barLabel} <span className="font-black text-slate-900 text-xs sm:text-sm">{currentBarIndex + 1}</span></div>
              )}
            </div>

            {Array.from({ length: beatsPerBar }).map((_, idx) => {
              const b = idx + 1;
              const isActive = isPlaying && currentBeat === b;
              return (
                <div
                  key={b}
                  className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg font-bold text-xs flex items-center justify-center transition ${
                    isActive
                      ? isCountIn
                        ? 'bg-amber-500 text-white scale-110 shadow-sm'
                        : 'bg-[#1A73E8] text-white scale-110 shadow-md shadow-blue-500/30'
                      : 'bg-slate-200/80 text-slate-600'
                  }`}
                >
                  {b}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Clean Mode Switcher, Language Toggle & Export */}
        <div className="flex items-center gap-2">
          {/* Language Toggle (🇹🇭 / 🇬🇧) */}
          <button
            onClick={toggleLang}
            className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200/80 text-slate-800 font-bold text-xs sm:text-sm transition cursor-pointer min-h-[38px]"
            title={lang === 'th' ? 'Switch to English' : 'เปลี่ยนเป็นภาษาไทย'}
          >
            <span>{lang === 'th' ? '🇹🇭 ไทย' : '🇬🇧 EN'}</span>
          </button>

          {/* Mode Switcher */}
          <div className="bg-slate-100 p-1 rounded-2xl flex items-center border border-slate-200">
            <button
              onClick={() => onSwitchMode('edit')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer min-h-[36px] ${
                activeMode === 'edit'
                  ? 'bg-white text-[#1A73E8] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.modeSongwriting}
            </button>
            <button
              onClick={() => onSwitchMode('karaoke')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer min-h-[36px] ${
                activeMode === 'karaoke'
                  ? 'bg-white text-[#1A73E8] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.modeKaraoke}
            </button>
          </div>

          <button
            onClick={onOpenExportModal}
            className="px-3 sm:px-3.5 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-xs transition cursor-pointer min-h-[40px]"
          >
            {t.exportShare}
          </button>
        </div>
      </div>

      {/* SECOND ROW: Musical Parameters Bar */}
      <div className="max-w-7xl mx-auto mt-2 sm:mt-2.5 pt-2 sm:pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 text-xs sm:text-sm">
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-4">
          {/* Time Signature */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-medium">{t.timeSignature}</span>
            <select
              value={song.timeSignature}
              onChange={(e) => {
                const ts = e.target.value as TimeSignature;
                onUpdateSong((prev) => ({ ...prev, timeSignature: ts }));
              }}
              className="bg-slate-100 border border-slate-200 rounded-xl px-2.5 py-1 font-bold text-slate-800"
            >
              <option value="4/4">4/4 {lang === 'th' ? '(ป๊อป/โฟล์คทั่วไป)' : '(Pop/Folk)'}</option>
              <option value="3/4">3/4 {lang === 'th' ? '(วอลทซ์ 1-2-3)' : '(Waltz 1-2-3)'}</option>
              <option value="6/8">6/8 {lang === 'th' ? '(เพลงช้าซึ้งยุค 90)' : '(Slow 6/8)'}</option>
            </select>
          </div>

          {/* BPM */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-slate-500 font-medium">{t.tempo}</span>
            <input
              type="range"
              min="50"
              max="160"
              value={song.bpm}
              onChange={(e) => {
                const bpm = parseInt(e.target.value, 10);
                onUpdateSong((prev) => ({ ...prev, bpm }));
              }}
              className="w-18 sm:w-24 accent-[#1A73E8]"
            />
            <span className="font-bold text-[#1A73E8] bg-blue-50 px-2 py-0.5 rounded-lg text-xs">
              {song.bpm} BPM
            </span>
          </div>

          {/* Key & Transpose */}
          <div className="flex items-center gap-1">
            <span className="text-slate-500 font-medium">{t.keyLabel}</span>
            <button
              onClick={() => changeTranspose(-1)}
              className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 flex items-center justify-center cursor-pointer"
            >
              -
            </button>
            <span className="font-black text-slate-900 px-1.5">
              Key {currentKeyName()}{' '}
              <span className="text-slate-400 text-xs font-normal">
                ({song.transposeSemitones >= 0 ? `+${song.transposeSemitones}` : song.transposeSemitones})
              </span>
            </span>
            <button
              onClick={() => changeTranspose(1)}
              className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 flex items-center justify-center cursor-pointer"
            >
              +
            </button>
          </div>

          {/* Capo Helper */}
          <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-xl">
            <span className="text-indigo-900 font-bold text-xs">{t.capoLabel}</span>
            <select
              value={song.capoFret}
              onChange={(e) => {
                const fret = parseInt(e.target.value, 10);
                onUpdateSong((prev) => ({ ...prev, capoFret: fret }));
              }}
              className="bg-white border border-indigo-200 rounded-lg px-2 py-0.5 font-bold text-indigo-950 text-xs"
            >
              <option value="0">{t.capoNone}</option>
              <option value="1">{t.capoFret} 1</option>
              <option value="2">{t.capoFret} 2</option>
              <option value="3">{t.capoFret} 3</option>
              <option value="4">{t.capoFret} 4</option>
              <option value="5">{t.capoFret} 5</option>
              <option value="6">{t.capoFret} 6</option>
              <option value="7">{t.capoFret} 7</option>
            </select>
          </div>
        </div>

        {/* Toggle Sound Customizer Panel */}
        <button
          onClick={onToggleSoundPanel}
          className="text-[#1A73E8] hover:text-blue-800 font-bold flex items-center gap-1.5 transition cursor-pointer"
        >
          <span>{t.soundPanelToggle}</span>
          <span className="text-xs">{isSoundPanelOpen ? '▲' : '▼'}</span>
        </button>
      </div>
    </header>
  );
};
