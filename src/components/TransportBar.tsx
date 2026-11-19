'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Library,
  Play,
  Pause,
  Square,
  Timer,
  Sparkles,
  Cloud,
  Sun,
  Moon,
  Monitor,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Share2,
  SlidersHorizontal,
  Globe,
  Info,
  PenTool,
  Layers,
  MicVocal,
  Minus,
  Plus,
  Undo2,
  Redo2,
  Save,
  Camera,
  Loader2,
  Volume2,
  Wand2,
  FilePlus2,
} from 'lucide-react';
import { SongProject, TimeSignature, AppViewMode } from '@/types/song';
import type { CloudSyncStatus, CloudUser } from '@/lib/cloudSync';
import { getTransposedKeyName } from '@/lib/chordUtils';
import { DEFAULT_STARTER_CREDITS } from '@/lib/creditManager';
import { useLanguage } from '@/context/LanguageContext';
import { useTheme, type ThemePreference } from '@/context/ThemeContext';

export type LocalSaveState = 'saved' | 'dirty' | 'saving' | 'error';

interface TransportBarProps {
  song: SongProject;
  activeMode: AppViewMode;
  isPlaying: boolean;
  isLoading?: boolean;
  hasOpenModal?: boolean;
  currentBarIndex: number;
  currentBeat: number;
  isCountIn: boolean;
  isSoundPanelOpen: boolean;
  isZenMode?: boolean;
  cloudUser?: CloudUser;
  syncStatus?: CloudSyncStatus;
  creditBalance?: number;
  onTogglePlay: () => void;
  onStop: () => void;
  onToggleCountIn: () => void;
  onSwitchMode: (mode: AppViewMode) => void;
  onToggleSoundPanel: () => void;
  onToggleZenMode?: () => void;
  onOpenAccountModal?: () => void;
  onOpenAdvanceModal?: () => void;
  onOpenEasyMode?: () => void;
  onCreateNewSong?: () => void;
  onOpenExportModal: () => void;
  onOpenLibraryModal: () => void;
  onUpdateSong: (updater: (prev: SongProject) => SongProject) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  localSaveState?: LocalSaveState;
  lastLocalSavedAt?: string | null;
  onManualSave?: () => Promise<void> | void;
  onSaveCheckpoint?: () => void;
}

type HeaderPopover = null | 'ts' | 'bpm' | 'key' | 'capo' | 'more';

const SYNC_DOT_COLOR: Record<CloudSyncStatus, string> = {
  synced: 'bg-ok-500',
  syncing: 'bg-accent-500 animate-pulse',
  'local-only': 'bg-ink-400',
  offline: 'bg-warn-500',
  error: 'bg-rec-500',
};


export const TransportBar: React.FC<TransportBarProps> = ({
  song,
  activeMode,
  isPlaying,
  isLoading = false,
  hasOpenModal = false,
  currentBarIndex,
  currentBeat,
  isCountIn,
  isSoundPanelOpen,
  isZenMode = false,
  cloudUser,
  syncStatus = 'local-only',
  creditBalance = DEFAULT_STARTER_CREDITS,
  onTogglePlay,
  onStop,
  onToggleCountIn,
  onSwitchMode,
  onToggleSoundPanel,
  onToggleZenMode,
  onOpenAccountModal,
  onOpenAdvanceModal,
  onOpenEasyMode,
  onCreateNewSong,
  onOpenExportModal,
  onOpenLibraryModal,
  onUpdateSong,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  localSaveState = 'saved',
  lastLocalSavedAt = null,
  onManualSave,
  onSaveCheckpoint,
}) => {
  const { lang, t, toggleLang } = useLanguage();
  const { themePref, resolvedTheme, setThemePref, toggleTheme } = useTheme();
  const [openPopover, setOpenPopover] = useState<HeaderPopover>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const tapTimesRef = useRef<number[]>([]);

  const beatsPerBar = song.timeSignature === '3/4' ? 3 : song.timeSignature === '6/8' ? 6 : 4;

  const currentKeyName = () => {
    return getTransposedKeyName(song.baseKey, song.transposeSemitones);
  };

  const changeTranspose = (delta: number) => {
    onUpdateSong((prev) => ({
      ...prev,
      transposeSemitones: Math.max(-6, Math.min(6, prev.transposeSemitones + delta)),
    }));
  };

  const changeBpm = (nextBpm: number) => {
    if (!Number.isFinite(nextBpm)) return;
    const clamped = Math.max(50, Math.min(180, Math.round(nextBpm)));
    onUpdateSong((prev) => ({ ...prev, bpm: clamped }));
  };

  const handleTapTempo = () => {
    const now = Date.now();
    const recent = tapTimesRef.current.filter((tMs) => now - tMs <= 2200);
    const updated = [...recent, now].slice(-5);
    tapTimesRef.current = updated;
    if (updated.length >= 2) {
      let totalInterval = 0;
      for (let i = 1; i < updated.length; i++) {
        totalInterval += updated[i] - updated[i - 1];
      }
      const avgInterval = totalInterval / (updated.length - 1);
      if (avgInterval > 0) {
        changeBpm(Math.round(60000 / avgInterval));
      }
    }
  };

  // Click outside closes active popover
  useEffect(() => {
    if (!openPopover) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideHeader = headerRef.current?.contains(target);
      const insideDock = dockRef.current?.contains(target);
      if (!insideHeader && !insideDock) {
        setOpenPopover(null);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [openPopover]);

  // Global keyboard shortcuts: Ctrl+S / Ctrl+Shift+S (works even in inputs), Space = Play/Pause, Esc = Close popover or Stop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (e.shiftKey) {
          onSaveCheckpoint?.();
        } else {
          void onManualSave?.();
        }
        return;
      }

      const activeEl = document.activeElement;
      const isTyping =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl instanceof HTMLSelectElement ||
        (activeEl instanceof HTMLElement && activeEl.isContentEditable);

      if (e.key === 'Escape') {
        if (openPopover) {
          setOpenPopover(null);
          return;
        }
        const hasDomModal =
          typeof document !== 'undefined' &&
          Boolean(document.querySelector('[role="dialog"], .fixed.inset-0'));
        if (!isTyping && !isSoundPanelOpen && !hasOpenModal && !hasDomModal && isPlaying) {
          onStop();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.altKey && !isTyping) {
        const keyLower = e.key.toLowerCase();
        if (keyLower === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            onRedo?.();
          } else {
            onUndo?.();
          }
          return;
        }
        if (keyLower === 'y') {
          e.preventDefault();
          onRedo?.();
          return;
        }
      }

      if (e.code === 'Space' && !isTyping && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        onTogglePlay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openPopover, isSoundPanelOpen, hasOpenModal, isPlaying, onStop, onTogglePlay, onUndo, onRedo, onManualSave, onSaveCheckpoint]);

  const togglePopover = (key: Exclude<HeaderPopover, null>) => {
    setOpenPopover((prev) => (prev === key ? null : key));
  };

  const modeOptions: Array<{
    id: AppViewMode;
    label: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'songwriter',
      label: lang === 'th' ? 'แต่งเพลง' : 'Songwriter',
      icon: <PenTool className="w-3.5 h-3.5" strokeWidth={1.75} />,
    },
    {
      id: 'arranger',
      label: lang === 'th' ? 'เรียบเรียง' : 'Arranger',
      icon: <Layers className="w-3.5 h-3.5" strokeWidth={1.75} />,
    },
    {
      id: 'karaoke',
      label: lang === 'th' ? 'คาราโอเกะ' : 'Stage',
      icon: <MicVocal className="w-3.5 h-3.5" strokeWidth={1.75} />,
    },
  ];

  const themeOptions: Array<{ id: ThemePreference; label: string; icon: React.ReactNode }> = [
    { id: 'light', label: lang === 'th' ? 'สว่าง' : 'Light', icon: <Sun className="w-3.5 h-3.5" /> },
    { id: 'dark', label: lang === 'th' ? 'มืด' : 'Dark', icon: <Moon className="w-3.5 h-3.5" /> },
    { id: 'system', label: lang === 'th' ? 'ระบบ' : 'Auto', icon: <Monitor className="w-3.5 h-3.5" /> },
  ];

  const barNumberDisplay = String(currentBarIndex + 1).padStart(2, '0');
  const transposeStr =
    song.transposeSemitones >= 0 ? `+${song.transposeSemitones}` : `${song.transposeSemitones}`;

  const formattedSavedTime = React.useMemo(() => {
    if (!lastLocalSavedAt) return '';
    const ms = Date.parse(lastLocalSavedAt);
    if (!Number.isFinite(ms)) return '';
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }, [lastLocalSavedAt]);

  const saveDotClass =
    localSaveState === 'dirty' || localSaveState === 'saving'
      ? 'bg-warn-500 animate-pulse'
      : localSaveState === 'error'
        ? 'bg-rec-500'
        : 'bg-ok-500';

  const saveStatusText =
    localSaveState === 'dirty' || localSaveState === 'saving'
      ? t.saveStateSaving
      : localSaveState === 'error'
        ? t.saveStateError
        : `${t.saveStateSaved}${formattedSavedTime ? ` ${formattedSavedTime}` : ''}`;

  return (
    <>
      <header
        ref={headerRef}
        className="sticky top-0 z-30 studio-glass border-b border-hairline shadow-e2 safe-top transition-all"
      >
        {/* ROW 1: AppTopBar (hidden in Zen Mode) */}
        {!isZenMode && (
          <div className="max-w-7xl mx-auto h-14 px-3 sm:px-6 flex items-center justify-between gap-2 lg:gap-3">
            {/* Left: Library + Inline Editable Title + Save Status */}
            <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 flex-1 overflow-hidden">
              <button
                type="button"
                onClick={onOpenLibraryModal}
                title={t.mySongs}
                aria-label={t.mySongs}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-ink-700 hover:text-ink-900 hover:bg-surface-inset transition cursor-pointer shrink-0"
              >
                <Library className="w-[18px] h-[18px]" strokeWidth={1.75} />
              </button>

              <input
                type="text"
                value={song.title}
                onChange={(e) => {
                  const newTitle = e.target.value;
                  onUpdateSong((prev) => ({ ...prev, title: newTitle }));
                }}
                aria-label={lang === 'th' ? 'ชื่อเพลง' : 'Song title'}
                className="font-semibold text-sm sm:text-base tracking-[-0.01em] text-ink-900 bg-transparent hover:bg-surface-inset focus:bg-surface-1 focus:outline-none focus:ring-2 focus:ring-accent-200 rounded-lg px-2 py-1 min-w-0 flex-1 max-w-[155px] xl:max-w-[165px] truncate transition"
              />

              <span
                className={`hidden sm:inline-flex items-center gap-1.5 text-[11px] whitespace-nowrap shrink-0 ${
                  localSaveState === 'error'
                    ? 'text-rec-500 font-semibold'
                    : localSaveState === 'dirty' || localSaveState === 'saving'
                      ? 'text-warn-600 font-medium'
                      : 'text-ink-400'
                }`}
                title={`${saveStatusText} • ${t.autoSaved} • ${t.audioEngineBadge}`}
                data-save-state={localSaveState}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${saveDotClass}`} />
                <span className="hidden xl:inline max-w-[104px] truncate">{saveStatusText}</span>
              </span>

              {onManualSave && (
                <button
                  type="button"
                  onClick={() => void onManualSave()}
                  title={lang === 'th' ? 'บันทึกทันที (Ctrl+S)' : 'Save now (Ctrl+S)'}
                  aria-label={lang === 'th' ? 'บันทึกทันที (Ctrl+S)' : 'Save now (Ctrl+S)'}
                  className={`w-8 h-8 rounded-lg inline-flex items-center justify-center transition cursor-pointer shrink-0 ${
                    localSaveState === 'dirty'
                      ? 'bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100'
                      : 'text-ink-700 hover:text-ink-900 hover:bg-surface-inset'
                  }`}
                >
                  <Save className="w-3.5 h-3.5" strokeWidth={1.75} />
                </button>
              )}

              {onSaveCheckpoint && (
                <button
                  type="button"
                  onClick={() => onSaveCheckpoint()}
                  title={lang === 'th' ? 'ปักหมุดเวอร์ชัน (Ctrl+Shift+S)' : 'Save Checkpoint (Ctrl+Shift+S)'}
                  aria-label={lang === 'th' ? 'ปักหมุดเวอร์ชัน (Ctrl+Shift+S)' : 'Save Checkpoint (Ctrl+Shift+S)'}
                  className="hidden lg:inline-flex w-8 h-8 rounded-lg text-ink-700 hover:text-ink-900 hover:bg-surface-inset items-center justify-center transition cursor-pointer shrink-0"
                >
                  <Camera className="w-3.5 h-3.5" strokeWidth={1.75} />
                </button>
              )}
            </div>

            {/* Center: 3-Mode Segmented Control (Desktop & iPad) */}
            <div
              className="hidden md:flex bg-surface-inset p-1 rounded-xl items-center gap-0.5 shrink-0"
              role="tablist"
              aria-label="Workspace modes"
            >
              {modeOptions.map((mode) => {
                const isSelected = activeMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => onSwitchMode(mode.id)}
                    className={`h-8 px-2.5 lg:px-3 rounded-[9px] text-xs lg:text-sm font-medium inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                      isSelected
                        ? 'bg-surface-1 text-accent-text font-semibold shadow-xs'
                        : 'text-ink-700 hover:text-ink-900'
                    }`}
                  >
                    {mode.icon}
                    <span>{mode.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Right: Actions Cluster */}
            <div className="flex items-center justify-end gap-1 shrink-0">
              {/* Studio History Undo / Redo (Ctrl+Z / Ctrl+Y) */}
              {(onUndo || onRedo) && (
                <div className="hidden lg:inline-flex items-center gap-0.5">
                  <button
                    type="button"
                    disabled={!canUndo}
                    onClick={() => onUndo?.()}
                    title={lang === 'th' ? 'ย้อนกลับ (Ctrl+Z)' : 'Undo (Ctrl+Z)'}
                    aria-label={lang === 'th' ? 'ย้อนกลับ (Ctrl+Z)' : 'Undo (Ctrl+Z)'}
                    className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-ink-700 hover:text-ink-900 hover:bg-surface-inset disabled:opacity-35 disabled:pointer-events-none transition cursor-pointer"
                  >
                    <Undo2 className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    disabled={!canRedo}
                    onClick={() => onRedo?.()}
                    title={lang === 'th' ? 'ทำซ้ำ (Ctrl+Y)' : 'Redo (Ctrl+Y)'}
                    aria-label={lang === 'th' ? 'ทำซ้ำ (Ctrl+Y)' : 'Redo (Ctrl+Y)'}
                    className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-ink-700 hover:text-ink-900 hover:bg-surface-inset disabled:opacity-35 disabled:pointer-events-none transition cursor-pointer"
                  >
                    <Redo2 className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                </div>
              )}

              {onOpenEasyMode && (
                <button
                  type="button"
                  onClick={onOpenEasyMode}
                  title={lang === 'th' ? 'สร้างเพลงง่าย ๆ ใน 30 วินาที (Easy Mode)' : 'Quick Start Wizard (Easy Mode)'}
                  aria-label={lang === 'th' ? 'สร้างเพลงง่าย ๆ ใน 30 วินาที (Easy Mode)' : 'Quick Start Wizard (Easy Mode)'}
                  className="hidden xl:inline-flex w-8 h-8 rounded-lg bg-accent-50 hover:bg-accent-200/60 text-accent-text items-center justify-center border border-accent-200 transition cursor-pointer shrink-0"
                >
                  <Wand2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                </button>
              )}

              {onCreateNewSong && (
                <button
                  type="button"
                  onClick={onCreateNewSong}
                  title={lang === 'th' ? 'สร้างเพลงใหม่' : 'New Song'}
                  aria-label={lang === 'th' ? 'สร้างเพลงใหม่' : 'New Song'}
                  className="hidden xl:inline-flex w-8 h-8 rounded-lg hover:bg-surface-inset text-ink-700 hover:text-ink-900 items-center justify-center transition cursor-pointer shrink-0"
                >
                  <FilePlus2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                </button>
              )}

              {/* AI & Advance Mode Credits Pill */}
              {onOpenAdvanceModal && (
                <button
                  type="button"
                  onClick={onOpenAdvanceModal}
                  title={
                    lang === 'th'
                      ? 'เปิด Advance Mode / AI สั่งตั้งค่าแอป & คลังเครดิต (Credits)'
                      : 'Open Advance Mode / AI Director & Credits'
                  }
                  className="h-8 px-2 rounded-xl hover:bg-surface-inset text-ink-900 font-medium text-xs sm:text-sm inline-flex items-center gap-1 transition cursor-pointer shrink-0"
                >
                  <Sparkles className="w-4 h-4 text-accent-500" strokeWidth={1.75} />
                  <span className="hidden xl:inline text-ink-700">AI</span>
                  <span className="font-mono-tabular font-semibold text-xs sm:text-sm">
                    {creditBalance}
                  </span>
                </button>
              )}

              {/* Account & Cloud Sync */}
              {onOpenAccountModal && (
                <button
                  type="button"
                  onClick={onOpenAccountModal}
                  title={
                    cloudUser?.mode === 'authenticated' && cloudUser.displayName
                      ? `${lang === 'th' ? 'บัญชีผู้ใช้ & ซิงค์ Cloud' : 'Account & Cloud Sync'}: ${cloudUser.displayName}`
                      : lang === 'th'
                        ? 'บัญชีผู้ใช้ & ซิงค์ Cloud'
                        : 'Account & Cloud Sync'
                  }
                  className="hidden lg:inline-flex w-8 h-8 rounded-xl hover:bg-surface-inset text-ink-700 hover:text-ink-900 items-center justify-center transition cursor-pointer relative shrink-0"
                >
                  <span className="relative inline-flex items-center">
                    <Cloud className="w-[18px] h-[18px]" strokeWidth={1.75} />
                    <span
                      className={`w-2 h-2 rounded-full ${SYNC_DOT_COLOR[syncStatus]} absolute -right-0.5 -bottom-0.5 ring-2 ring-surface-1`}
                    />
                  </span>
                </button>
              )}

              {/* Quick Theme Toggle */}
              <button
                type="button"
                onClick={toggleTheme}
                title={
                  resolvedTheme === 'dark'
                    ? lang === 'th'
                      ? 'สลับเป็นโหมดสว่าง'
                      : 'Switch to Light theme'
                    : lang === 'th'
                    ? 'สลับเป็นโหมดมืด'
                    : 'Switch to Dark theme'
                }
                aria-label="Toggle theme"
                className="w-8 h-8 rounded-xl inline-flex items-center justify-center text-ink-700 hover:text-ink-900 hover:bg-surface-inset transition cursor-pointer shrink-0"
              >
                {resolvedTheme === 'dark' ? (
                  <Moon className="w-[18px] h-[18px]" strokeWidth={1.75} />
                ) : (
                  <Sun className="w-[18px] h-[18px]" strokeWidth={1.75} />
                )}
              </button>

              {/* Zen Focus Mode Toggle */}
              {onToggleZenMode && (
                <button
                  type="button"
                  aria-pressed={isZenMode}
                  onClick={onToggleZenMode}
                  title={t.zenModeHint}
                  aria-label="Zen Focus Mode"
                  className="hidden xl:inline-flex w-8 h-8 rounded-xl items-center justify-center text-ink-700 hover:text-ink-900 hover:bg-surface-inset transition cursor-pointer shrink-0"
                >
                  <Maximize2 className="w-[18px] h-[18px]" strokeWidth={1.75} />
                </button>
              )}

              {/* Overflow ⋯ Menu */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => togglePopover('more')}
                  aria-expanded={openPopover === 'more'}
                  aria-label={lang === 'th' ? 'เมนูเพิ่มเติม' : 'More options'}
                  className={`w-8 h-8 rounded-xl inline-flex items-center justify-center transition cursor-pointer ${
                    openPopover === 'more'
                      ? 'bg-accent-50 text-accent-text'
                      : 'text-ink-700 hover:text-ink-900 hover:bg-surface-inset'
                  }`}
                >
                  <MoreHorizontal className="w-[18px] h-[18px]" strokeWidth={1.75} />
                </button>

                {openPopover === 'more' && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-64 bg-surface-1 border border-hairline rounded-2xl shadow-e3 p-2 z-50 space-y-1 text-sm text-ink-900"
                  >
                    <div className="px-2 pt-1 pb-1.5">
                      <div className="text-xs font-medium text-ink-400 mb-1.5">
                        {lang === 'th' ? 'ธีมหน้าจอ' : 'Appearance'}
                      </div>
                      <div className="grid grid-cols-3 bg-surface-inset p-1 rounded-xl gap-1">
                        {themeOptions.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setThemePref(opt.id);
                              setOpenPopover(null);
                            }}
                            className={`h-8 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1 transition cursor-pointer ${
                              themePref === opt.id
                                ? 'bg-surface-1 text-accent-text font-semibold shadow-xs'
                                : 'text-ink-700 hover:text-ink-900'
                            }`}
                          >
                            {opt.icon}
                            <span>{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="h-px bg-hairline my-1" />

                    {(onUndo || onRedo) && (
                      <div className="lg:hidden grid grid-cols-2 gap-1 px-1 pb-1">
                        {onUndo && (
                          <button
                            type="button"
                            disabled={!canUndo}
                            onClick={() => {
                              onUndo();
                              setOpenPopover(null);
                            }}
                            className="h-8 px-2 rounded-xl hover:bg-surface-inset disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-1.5 text-xs font-medium transition cursor-pointer"
                          >
                            <Undo2 className="w-3.5 h-3.5 text-ink-700" />
                            <span>{lang === 'th' ? 'ย้อนกลับ' : 'Undo'}</span>
                          </button>
                        )}
                        {onRedo && (
                          <button
                            type="button"
                            disabled={!canRedo}
                            onClick={() => {
                              onRedo();
                              setOpenPopover(null);
                            }}
                            className="h-8 px-2 rounded-xl hover:bg-surface-inset disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-1.5 text-xs font-medium transition cursor-pointer"
                          >
                            <Redo2 className="w-3.5 h-3.5 text-ink-700" />
                            <span>{lang === 'th' ? 'ทำซ้ำ' : 'Redo'}</span>
                          </button>
                        )}
                      </div>
                    )}

                    {onOpenEasyMode && (
                      <button
                        type="button"
                        onClick={() => {
                          onOpenEasyMode();
                          setOpenPopover(null);
                        }}
                        className="w-full h-9 px-2.5 rounded-xl hover:bg-surface-inset flex items-center gap-2.5 text-left transition cursor-pointer"
                      >
                        <Wand2 className="w-4 h-4 text-accent-text" />
                        <span className="font-medium">{lang === 'th' ? '✨ Easy Mode (ตัวช่วยสร้างเพลง)' : '✨ Easy Mode Wizard'}</span>
                      </button>
                    )}

                    {onCreateNewSong && (
                      <button
                        type="button"
                        onClick={() => {
                          onCreateNewSong();
                          setOpenPopover(null);
                        }}
                        className="w-full h-9 px-2.5 rounded-xl hover:bg-surface-inset flex items-center gap-2.5 text-left transition cursor-pointer"
                      >
                        <FilePlus2 className="w-4 h-4 text-ink-700" />
                        <span>{lang === 'th' ? '➕ สร้างเพลงใหม่' : '➕ Create New Song'}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        toggleLang();
                        setOpenPopover(null);
                      }}
                      className="w-full h-9 px-2.5 rounded-xl hover:bg-surface-inset flex items-center justify-between text-left transition cursor-pointer"
                    >
                      <span className="inline-flex items-center gap-2.5 text-ink-900">
                        <Globe className="w-4 h-4 text-ink-700" />
                        <span>{lang === 'th' ? 'ภาษา / Language' : 'Language / ภาษา'}</span>
                      </span>
                      <span className="font-mono-tabular text-xs font-semibold text-accent-text">
                        {lang === 'th' ? 'TH → EN' : 'EN → TH'}
                      </span>
                    </button>

                    {onToggleZenMode && (
                      <button
                        type="button"
                        onClick={() => {
                          onToggleZenMode();
                          setOpenPopover(null);
                        }}
                        className="w-full h-9 px-2.5 rounded-xl hover:bg-surface-inset flex items-center gap-2.5 text-left transition cursor-pointer"
                      >
                        <Maximize2 className="w-4 h-4 text-ink-700" />
                        <span>{lang === 'th' ? 'Zen Mode (โฟกัส)' : 'Zen Focus Mode'}</span>
                      </button>
                    )}

                    {onOpenAccountModal && (
                      <button
                        type="button"
                        onClick={() => {
                          onOpenAccountModal();
                          setOpenPopover(null);
                        }}
                        className="w-full h-9 px-2.5 rounded-xl hover:bg-surface-inset flex items-center justify-between text-left transition cursor-pointer lg:hidden"
                      >
                        <span className="inline-flex items-center gap-2.5">
                          <Cloud className="w-4 h-4 text-ink-700" />
                          <span>{lang === 'th' ? 'บัญชี & Cloud Sync' : 'Account & Cloud'}</span>
                        </span>
                        <span className={`w-2 h-2 rounded-full ${SYNC_DOT_COLOR[syncStatus]}`} />
                      </button>
                    )}

                    {onManualSave && (
                      <button
                        type="button"
                        onClick={() => {
                          void onManualSave();
                          setOpenPopover(null);
                        }}
                        className="w-full h-9 px-2.5 rounded-xl hover:bg-surface-inset flex items-center justify-between text-left transition cursor-pointer"
                      >
                        <span className="inline-flex items-center gap-2.5 text-ink-900">
                          <Save className="w-4 h-4 text-ink-700" />
                          <span>{t.manualSaveBtn}</span>
                        </span>
                        <span className="font-mono-tabular text-[11px] text-ink-400">Ctrl+S</span>
                      </button>
                    )}

                    {onSaveCheckpoint && (
                      <button
                        type="button"
                        onClick={() => {
                          onSaveCheckpoint();
                          setOpenPopover(null);
                        }}
                        className="w-full h-9 px-2.5 rounded-xl hover:bg-surface-inset flex items-center justify-between text-left transition cursor-pointer"
                      >
                        <span className="inline-flex items-center gap-2.5 text-ink-900">
                          <Camera className="w-4 h-4 text-ink-700" />
                          <span>{t.saveCheckpointBtn}</span>
                        </span>
                        <span className="font-mono-tabular text-[11px] text-ink-400">Ctrl+⇧+S</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('demo-maker:show-ios-tip'));
                        setOpenPopover(null);
                      }}
                      className="w-full h-9 px-2.5 rounded-xl hover:bg-surface-inset flex items-center gap-2.5 text-left transition cursor-pointer"
                    >
                      <Info className="w-4 h-4 text-ink-700" />
                      <span>{lang === 'th' ? 'คำแนะนำเสียง iPad / iPhone' : 'iPad / iPhone Sound Tip'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Primary Export CTA */}
              <button
                type="button"
                onClick={onOpenExportModal}
                aria-label={lang === 'th' ? 'แชร์ / ส่งออก' : 'Export / Share'}
                title={lang === 'th' ? 'แชร์ / ส่งออก' : 'Export / Share'}
                className="h-8 sm:h-9 px-2.5 lg:px-3 rounded-xl bg-accent-500 hover:bg-accent-hover text-white font-semibold text-xs lg:text-sm inline-flex items-center gap-1.5 shadow-xs transition cursor-pointer shrink-0"
              >
                <Share2 className="w-4 h-4" strokeWidth={1.75} />
                <span className="hidden lg:inline">
                  {lang === 'th' ? 'แชร์ / ส่งออก' : 'Export / Share'}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* ROW 2: ControlStrip (Desktop & iPad) */}
        <div
          className={`hidden md:flex max-w-7xl mx-auto px-3 sm:px-6 items-center justify-between gap-3 ${
            isZenMode ? 'h-12' : 'h-[52px] border-t border-hairline'
          }`}
        >
          {/* Left: Transport + Beat LEDs */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onTogglePlay}
              title={
                isPlaying
                  ? lang === 'th'
                    ? 'หยุดชั่วคราว (Space)'
                    : 'Pause (Space)'
                  : lang === 'th'
                  ? 'เล่นเดโม่ (Space)'
                  : 'Play Demo (Space)'
              }
              aria-label={
                isLoading
                  ? lang === 'th'
                    ? 'กำลังโหลดเสียงเครื่องดนตรี...'
                    : 'Loading instruments...'
                  : isPlaying
                    ? t.pause
                    : t.playDemo
              }
              className={`w-10 h-10 rounded-full bg-accent-500 hover:bg-accent-hover text-white inline-flex items-center justify-center transition cursor-pointer shrink-0 ${
                isPlaying ? 'ring-4 ring-accent-200' : ''
              }`}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current translate-x-[1px]" />
              )}
            </button>

            {isLoading && (
              <span className="text-[11px] font-medium text-accent-text bg-accent-50 border border-accent-200 px-2 py-1 rounded-lg whitespace-nowrap animate-pulse">
                {lang === 'th' ? 'กำลังโหลดเสียงเครื่องดนตรี...' : 'Loading instruments...'}
              </span>
            )}

            <button
              type="button"
              onClick={onStop}
              title={lang === 'th' ? 'หยุดและกลับต้นเพลง (Esc)' : 'Stop and rewind (Esc)'}
              aria-label={t.stop}
              className="w-9 h-9 rounded-xl inline-flex items-center justify-center text-ink-700 hover:text-ink-900 hover:bg-surface-inset transition cursor-pointer"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>

            <button
              type="button"
              onClick={onToggleCountIn}
              aria-pressed={song.countInEnabled}
              title={song.countInEnabled ? t.countInOn : t.countInOff}
              className={`h-9 px-2.5 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 transition cursor-pointer ${
                song.countInEnabled
                  ? 'bg-accent-50 text-accent-text font-semibold'
                  : 'text-ink-700 hover:text-ink-900 hover:bg-surface-inset'
              }`}
            >
              <Timer className="w-4 h-4" strokeWidth={1.75} />
              <span className="hidden lg:inline">
                {lang === 'th' ? 'นับเข้า' : 'Count-in'}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                onUpdateSong((prev) => ({
                  ...prev,
                  metronomeEnabled: !prev.metronomeEnabled,
                }))
              }
              aria-pressed={Boolean(song.metronomeEnabled)}
              title={
                song.metronomeEnabled
                  ? lang === 'th'
                    ? 'ปิดคลิกจังหวะต่อเนื่องระหว่างเล่น'
                    : 'Turn off playback metronome click'
                  : lang === 'th'
                    ? 'เปิดคลิกจังหวะต่อเนื่องทุกจังหวะระหว่างเล่น'
                    : 'Enable metronome click during playback'
              }
              className={`h-9 px-2.5 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 transition cursor-pointer ${
                song.metronomeEnabled
                  ? 'bg-accent-50 text-accent-text font-semibold'
                  : 'text-ink-700 hover:text-ink-900 hover:bg-surface-inset'
              }`}
            >
              <Volume2 className="w-4 h-4" strokeWidth={1.75} />
              <span className="hidden xl:inline">
                {lang === 'th' ? 'คลิกจังหวะ' : 'Click'}
              </span>
            </button>

            {/* Bar & Beat LEDs Readout */}
            <div className="h-9 px-3 rounded-xl bg-surface-inset inline-flex items-center gap-2.5 ml-1">
              <span className="text-xs font-mono-tabular text-ink-400 tracking-wider">
                {isCountIn ? 'COUNT' : 'BAR'}
              </span>
              <span className="text-sm font-mono-tabular font-semibold text-ink-900 min-w-[22px]">
                {barNumberDisplay}
              </span>
              <div className="flex items-center gap-1.5" aria-hidden="true">
                {Array.from({ length: beatsPerBar }).map((_, idx) => {
                  const beatNum = idx + 1;
                  const isActive = isPlaying && currentBeat === beatNum;
                  return (
                    <span
                      key={beatNum}
                      className={`rounded-full transition-all ${
                        idx === 0 ? 'w-2.5 h-2.5' : 'w-2 h-2'
                      } ${
                        isActive
                          ? isCountIn
                            ? 'bg-warn-500 ring-3 ring-warn-500/30 scale-110'
                            : 'bg-accent-500 ring-3 ring-accent-200 scale-110'
                          : 'bg-ink-400/35'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-hairline mx-1" />

            {/* Song Params LCD Readout (4 Popovers) */}
            <div
              className="bg-surface-inset p-1 rounded-xl inline-flex items-center gap-0.5 relative"
              role="group"
              aria-label="Song parameters"
            >
              {/* Time Signature */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => togglePopover('ts')}
                  className={`h-7 px-2.5 rounded-lg inline-flex items-baseline gap-1.5 text-sm transition cursor-pointer ${
                    openPopover === 'ts'
                      ? 'bg-surface-1 text-accent-text shadow-xs'
                      : 'hover:bg-surface-1 text-ink-900'
                  }`}
                >
                  <span className="hidden xl:inline text-xs text-ink-400">
                    {lang === 'th' ? 'จังหวะ' : 'Meter'}
                  </span>
                  <span className="font-mono-tabular font-semibold">{song.timeSignature}</span>
                </button>

                {openPopover === 'ts' && (
                  <div className="absolute left-0 mt-2 w-56 bg-surface-1 border border-hairline rounded-2xl shadow-e3 p-2 z-50 space-y-1">
                    <div className="px-2 py-1 text-xs font-medium text-ink-400 uppercase tracking-wider">
                      Time Signature
                    </div>
                    {(
                      [
                        ['4/4', lang === 'th' ? 'ป๊อป / โฟล์คทั่วไป' : 'Pop / Folk'],
                        ['3/4', lang === 'th' ? 'วอลทซ์ 1-2-3' : 'Waltz 1-2-3'],
                        ['6/8', lang === 'th' ? 'เพลงช้าซึ้งยุค 90' : 'Slow 6/8'],
                      ] as Array<[TimeSignature, string]>
                    ).map(([val, desc]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => {
                          onUpdateSong((prev) => ({ ...prev, timeSignature: val }));
                          setOpenPopover(null);
                        }}
                        className={`w-full px-2.5 py-2 rounded-xl flex items-center justify-between text-sm transition cursor-pointer ${
                          song.timeSignature === val
                            ? 'bg-accent-50 text-accent-text font-semibold'
                            : 'hover:bg-surface-inset text-ink-900'
                        }`}
                      >
                        <span className="font-mono-tabular font-semibold">{val}</span>
                        <span className="text-xs text-ink-700">{desc}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <span className="w-px h-4 bg-hairline" />

              {/* BPM */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => togglePopover('bpm')}
                  className={`h-7 px-2.5 rounded-lg inline-flex items-baseline gap-1 text-sm transition cursor-pointer ${
                    openPopover === 'bpm'
                      ? 'bg-surface-1 text-accent-text shadow-xs'
                      : 'hover:bg-surface-1 text-ink-900'
                  }`}
                >
                  <span className="hidden xl:inline text-xs text-ink-400">Tempo</span>
                  <span className="font-mono-tabular font-semibold">{song.bpm}</span>
                  <span className="text-xs text-ink-400">BPM</span>
                </button>

                {openPopover === 'bpm' && (
                  <div className="absolute left-0 mt-2 w-72 bg-surface-1 border border-hairline rounded-2xl shadow-e3 p-3.5 z-50 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-ink-400 uppercase tracking-wider">
                        Tempo (BPM)
                      </span>
                      <button
                        type="button"
                        onClick={handleTapTempo}
                        className="px-2.5 py-1 rounded-lg bg-accent-50 hover:bg-accent-200/70 text-accent-text border border-accent-200 text-xs font-semibold transition cursor-pointer"
                      >
                        🥁 Tap Tempo
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => changeBpm(song.bpm - 1)}
                        className="w-9 h-9 rounded-xl bg-surface-inset hover:bg-accent-50 hover:text-accent-text inline-flex items-center justify-center transition cursor-pointer shrink-0"
                        aria-label="Decrease BPM"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <div className="flex items-baseline justify-center gap-1">
                        <input
                          type="number"
                          min={50}
                          max={180}
                          value={song.bpm}
                          onChange={(e) => changeBpm(parseInt(e.target.value, 10))}
                          aria-label="Direct BPM Input"
                          className="w-16 text-center font-mono-tabular text-2xl font-semibold text-ink-900 bg-surface-inset rounded-lg py-0.5 border border-hairline focus:outline-none focus:border-accent-500"
                        />
                        <span className="text-xs text-ink-400">BPM</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => changeBpm(song.bpm + 1)}
                        className="w-9 h-9 rounded-xl bg-surface-inset hover:bg-accent-50 hover:text-accent-text inline-flex items-center justify-center transition cursor-pointer shrink-0"
                        aria-label="Increase BPM"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="180"
                      value={song.bpm}
                      onChange={(e) => changeBpm(parseInt(e.target.value, 10))}
                      className="w-full accent-[#5B61EE] cursor-pointer"
                    />
                    <div className="flex justify-between text-xs font-mono-tabular text-ink-400">
                      <span>50</span>
                      <span>180</span>
                    </div>
                  </div>
                )}
              </div>

              <span className="w-px h-4 bg-hairline" />

              {/* Key & Transpose */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => togglePopover('key')}
                  className={`h-7 px-2.5 rounded-lg inline-flex items-baseline gap-1 text-sm transition cursor-pointer ${
                    openPopover === 'key'
                      ? 'bg-surface-1 text-accent-text shadow-xs'
                      : 'hover:bg-surface-1 text-ink-900'
                  }`}
                >
                  <span className="hidden xl:inline text-xs text-ink-400">Key</span>
                  <span className="font-mono-tabular font-semibold">{currentKeyName()}</span>
                  <span className="font-mono-tabular text-xs text-ink-400">{transposeStr}</span>
                </button>

                {openPopover === 'key' && (
                  <div className="absolute left-0 mt-2 w-60 bg-surface-1 border border-hairline rounded-2xl shadow-e3 p-3.5 z-50 space-y-2.5">
                    <div className="text-xs font-medium text-ink-400 uppercase tracking-wider">
                      Key / Transpose
                    </div>
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => changeTranspose(-1)}
                        className="w-9 h-9 rounded-xl bg-surface-inset hover:bg-accent-50 hover:text-accent-text inline-flex items-center justify-center transition cursor-pointer"
                        aria-label="Transpose down"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <div className="text-center">
                        <div className="font-mono-tabular text-2xl font-semibold text-ink-900">
                          {currentKeyName()}
                        </div>
                        <div className="font-mono-tabular text-xs text-ink-400">
                          {transposeStr} semitone
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => changeTranspose(1)}
                        className="w-9 h-9 rounded-xl bg-surface-inset hover:bg-accent-50 hover:text-accent-text inline-flex items-center justify-center transition cursor-pointer"
                        aria-label="Transpose up"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-xs text-ink-400">
                      {lang === 'th'
                        ? 'ช่วง -6 ถึง +6 · คอร์ดทุกห้องเปลี่ยนตามอัตโนมัติ'
                        : 'Range -6 to +6 · All bar chords transpose live'}
                    </p>
                  </div>
                )}
              </div>

              <span className="w-px h-4 bg-hairline" />

              {/* Capo */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => togglePopover('capo')}
                  className={`h-7 px-2.5 rounded-lg inline-flex items-baseline gap-1 text-sm transition cursor-pointer ${
                    openPopover === 'capo'
                      ? 'bg-surface-1 text-accent-text shadow-xs'
                      : song.capoFret > 0
                      ? 'bg-accent-50 text-accent-text font-semibold'
                      : 'hover:bg-surface-1 text-ink-900'
                  }`}
                >
                  <span className="font-mono-tabular font-semibold">
                    {song.capoFret > 0 ? `Capo ${song.capoFret}` : 'Capo —'}
                  </span>
                </button>

                {openPopover === 'capo' && (
                  <div className="absolute right-0 mt-2 w-60 bg-surface-1 border border-hairline rounded-2xl shadow-e3 p-3.5 z-50 space-y-2.5">
                    <div className="text-xs font-medium text-ink-400 uppercase tracking-wider">
                      Capo Fret
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[0, 1, 2, 3, 4, 5, 6, 7].map((fret) => {
                        const isSelected = song.capoFret === fret;
                        return (
                          <button
                            key={fret}
                            type="button"
                            onClick={() => {
                              onUpdateSong((prev) => ({ ...prev, capoFret: fret }));
                              setOpenPopover(null);
                            }}
                            className={`h-9 rounded-xl font-mono-tabular text-sm font-semibold transition cursor-pointer ${
                              isSelected
                                ? 'bg-accent-500 text-white'
                                : 'bg-surface-2 hover:bg-accent-50 hover:text-accent-text text-ink-900 border border-hairline'
                            }`}
                          >
                            {fret === 0 ? '—' : fret}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-ink-400">
                      {lang === 'th' ? '— = ไม่คาด (แสดงคอร์ดจริง)' : '— = None (Actual chords)'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Zen Exit + Mixer & Tone Trigger */}
          <div className="flex items-center gap-1.5">
            {isZenMode && onToggleZenMode && (
              <button
                type="button"
                onClick={onToggleZenMode}
                className="h-9 px-3 rounded-xl bg-accent-50 text-accent-text hover:bg-accent-200/50 text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                <span>{lang === 'th' ? 'ออกจาก Zen' : 'Exit Zen'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onToggleSoundPanel}
              aria-expanded={isSoundPanelOpen}
              className={`h-9 px-3 rounded-xl text-sm font-medium inline-flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
                isSoundPanelOpen
                  ? 'bg-accent-50 text-accent-text font-semibold'
                  : 'text-ink-700 hover:text-ink-900 hover:bg-surface-inset'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" strokeWidth={1.75} />
              <span>{lang === 'th' ? 'Mixer & Tone' : 'Mixer & Tone'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* MOBILE FLOATING TRANSPORT DOCK (< 768px) */}
      <div
        ref={dockRef}
        className="md:hidden fixed bottom-[68px] inset-x-3 z-40 studio-glass border border-hairline rounded-2xl shadow-e3 px-3 py-2 flex items-center justify-between gap-2"
      >
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={
              isLoading
                ? lang === 'th'
                  ? 'กำลังโหลดเสียงเครื่องดนตรี...'
                  : 'Loading instruments...'
                : isPlaying
                  ? t.pause
                  : t.playDemo
            }
            className={`w-10 h-10 rounded-full bg-accent-500 text-white inline-flex items-center justify-center shrink-0 cursor-pointer ${
              isPlaying ? 'ring-3 ring-accent-200' : ''
            }`}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current translate-x-[1px]" />
            )}
          </button>

          <button
            type="button"
            onClick={onStop}
            aria-label={t.stop}
            className="w-9 h-9 rounded-xl inline-flex items-center justify-center text-ink-700 hover:bg-surface-inset cursor-pointer"
          >
            <Square className="w-4 h-4 fill-current" />
          </button>

          <div className="h-9 px-2.5 rounded-xl bg-surface-inset inline-flex items-center gap-2">
            <span className="font-mono-tabular text-xs font-semibold text-ink-900">
              {barNumberDisplay}
            </span>
            <div className="flex items-center gap-1" aria-hidden="true">
              {Array.from({ length: beatsPerBar }).map((_, idx) => {
                const isActive = isPlaying && currentBeat === idx + 1;
                return (
                  <span
                    key={idx}
                    className={`w-1.5 h-1.5 rounded-full ${
                      isActive ? 'bg-accent-500 scale-125' : 'bg-ink-400/40'
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 relative">
          {isZenMode && onToggleZenMode && (
            <button
              type="button"
              onClick={onToggleZenMode}
              aria-label={lang === 'th' ? 'ออกจาก Zen' : 'Exit Zen'}
              className="w-9 h-9 rounded-xl bg-accent-50 text-accent-text inline-flex items-center justify-center cursor-pointer"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => togglePopover('bpm')}
            className="h-9 px-2.5 rounded-xl bg-surface-inset font-mono-tabular text-xs font-semibold text-ink-900 cursor-pointer"
          >
            ♩{song.bpm} · {currentKeyName()}
          </button>

          {openPopover === 'bpm' && (
            <div className="absolute right-0 bottom-12 w-64 bg-surface-1 border border-hairline rounded-2xl shadow-e3 p-3.5 z-50 space-y-3">
              <div className="flex items-center justify-between text-xs font-medium text-ink-400">
                <span>TEMPO / KEY / CAPO</span>
                <select
                  value={song.timeSignature}
                  onChange={(e) =>
                    onUpdateSong((prev) => ({
                      ...prev,
                      timeSignature: e.target.value as TimeSignature,
                    }))
                  }
                  className="bg-surface-inset rounded-lg px-2 py-1 text-ink-900 font-mono-tabular font-semibold"
                >
                  <option value="4/4">4/4</option>
                  <option value="3/4">3/4</option>
                  <option value="6/8">6/8</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm gap-2">
                  <span className="text-ink-700">Tempo</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleTapTempo}
                      className="px-2 py-0.5 rounded-md bg-accent-50 text-accent-text border border-accent-200 text-[11px] font-semibold cursor-pointer"
                    >
                      🥁 Tap
                    </button>
                    <input
                      type="number"
                      min={50}
                      max={180}
                      value={song.bpm}
                      onChange={(e) => changeBpm(parseInt(e.target.value, 10))}
                      className="w-14 text-right font-mono-tabular text-xs font-semibold bg-surface-inset px-1.5 py-0.5 rounded border border-hairline text-ink-900"
                    />
                    <span className="text-xs text-ink-400">BPM</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="50"
                  max="180"
                  value={song.bpm}
                  onChange={(e) => changeBpm(parseInt(e.target.value, 10))}
                  className="w-full accent-[#5B61EE]"
                />
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-ink-700">
                    {lang === 'th' ? 'คลิกจังหวะต่อเนื่อง' : 'Metronome Click'}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSong((prev) => ({
                        ...prev,
                        metronomeEnabled: !prev.metronomeEnabled,
                      }))
                    }
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                      song.metronomeEnabled
                        ? 'bg-accent-500 text-white'
                        : 'bg-surface-inset text-ink-700'
                    }`}
                  >
                    {song.metronomeEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-700">Key ({currentKeyName()} {transposeStr})</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => changeTranspose(-1)}
                    className="w-8 h-8 rounded-lg bg-surface-inset inline-flex items-center justify-center"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => changeTranspose(1)}
                    className="w-8 h-8 rounded-lg bg-surface-inset inline-flex items-center justify-center"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-700">Capo</span>
                <select
                  value={song.capoFret}
                  onChange={(e) =>
                    onUpdateSong((prev) => ({ ...prev, capoFret: parseInt(e.target.value, 10) }))
                  }
                  className="bg-surface-inset rounded-lg px-2 py-1 text-ink-900 font-mono-tabular text-xs font-semibold"
                >
                  <option value="0">{t.capoNone}</option>
                  {[1, 2, 3, 4, 5, 6, 7].map((f) => (
                    <option key={f} value={f}>
                      {t.capoFret} {f}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={onToggleSoundPanel}
            aria-label="Mixer & Tone"
            className={`w-9 h-9 rounded-xl inline-flex items-center justify-center cursor-pointer ${
              isSoundPanelOpen ? 'bg-accent-50 text-accent-text' : 'text-ink-700 hover:bg-surface-inset'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* MOBILE BOTTOM TAB BAR (< 768px) */}
      <nav
        aria-label="Workspace modes"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 h-16 studio-glass border-t border-hairline grid grid-cols-3 safe-bottom"
      >
        {modeOptions.map((mode) => {
          const isSelected = activeMode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => onSwitchMode(mode.id)}
              className={`flex flex-col items-center justify-center gap-0.5 text-xs transition cursor-pointer ${
                isSelected ? 'text-accent-text font-semibold' : 'text-ink-400 hover:text-ink-700'
              }`}
            >
              {mode.icon}
              <span>{mode.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
