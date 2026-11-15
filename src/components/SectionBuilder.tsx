'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Plus,
  Sparkles,
  ListMusic,
  MoreHorizontal,
  Copy,
  ArrowUp,
  ArrowDown,
  Trash2,
  SlidersHorizontal,
  Layers,
  Guitar,
  Music,
  Piano,
  Drum,
  Mic,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  X,
  Zap,
  Scissors,
  CheckCircle2,
  Repeat,
  Volume2,
  FileText,
  CornerDownRight,
  Dices,
  Loader2,
  Play,
  Square,
} from 'lucide-react';
import {
  SongProject,
  SongSection,
  SectionType,
  SectionIntensity,
  BarPlayStyle,
  SongBar,
  SongStatusTag,
  VocalTake,
} from '@/types/song';
import {
  transposeChord,
  getCapoFingeringChord,
  getChordEmotionalHint,
} from '@/lib/chordUtils';
import { getAnalyticsHeaders, trackUsageEvent } from '@/lib/analytics';
import {
  applyServerWalletSnapshot,
  canAfford,
  CREDIT_COST_TABLE,
  deductCredits,
  getCreditBalance,
  type WalletBreakdown,
} from '@/lib/creditManager';
import { getAuthAccessToken } from '@/lib/cloudSync';
import {
  duplicateSectionInList,
  generateUniqueId,
  countThaiEnglishSyllables,
  splitLyricsToSectionBars,
  shiftLastTokenToNextBar,
  buildSectionTtsTextPlan,
} from '@/lib/sectionUtils';
import { getSyllableBudgetForBpm } from '@/lib/aiPrompts';
import { applyGenreBandArrangement } from '@/lib/songArchitect';
import { generateLyricAlignedGuideMelody } from '@/lib/melodyUtils';
import type { LoopRange } from '@/lib/audioEngine';
import { flattenSong, getTiming } from '@/lib/barPlanner';
import {
  speakBrowserLyrics,
  stopBrowserLyrics,
  isBrowserSpeechSupported,
} from '@/lib/browserSpeechCue';
import { trimAudioDataUrlLeadingSilence } from '@/lib/audioTrim';
import { addAndActivateVocalTake, formatNextTakeName } from '@/lib/vocalBoothUtils';
import { makeVocalTakeBlobKey, saveVocalBlob } from '@/lib/audioStorageIdb';
import { playAudioDataUrl } from '@/lib/micRecorder';
import {
  analyzeThaiSyllablePhonetics,
  filterThaiRhymes,
  findThaiRhymes,
  validateThaiLyricCouplets,
} from '@/lib/thaiRhymeHelper';
import { useLanguage } from '@/context/LanguageContext';

interface SectionBuilderProps {
  song: SongProject;
  viewMode?: 'songwriter' | 'arranger';
  activeGlobalBarIndex: number;
  onUpdateSong: (updater: (prev: SongProject) => SongProject) => void;
  onOpenChordPicker: (
    sectionId: string,
    barId: string,
    chordIndex: 0 | 1,
    currentChord: string
  ) => void;
  onOpenPresetsModal: (sectionId: string, sectionName: string) => void;
  onOpenMelodyPianoRoll: (
    sectionId: string,
    barId: string,
    globalBarIndex: number
  ) => void;
  onOpenVocalRecorder: (
    sectionId: string,
    barId: string,
    globalBarIndex: number
  ) => void;
  onOpenAdvanceForSection?: (section: SongSection) => void;
  onOpenInlineAiSection?: (section: SongSection, mode: 'quick' | 'deep') => void;
  onAddNextAiStorySection?: (afterSectionId: string) => void;
  onSwitchToArranger?: () => void;
  loopRange?: LoopRange | null;
  onToggleLoopRange?: (range: LoopRange | null) => void;
  onPlayBarFromIndex?: (globalBarIndex: number, songOverride?: SongProject) => void;
  onPlaySectionOnce?: (startBar: number, endBar: number, songOverride?: SongProject) => void;
  onOpenKaraoke?: () => void;
  onCreditsChange?: (newBalance: number) => void;
  onOpenWallet?: () => void;
}

const SECTION_TYPE_META: Record<
  SectionType,
  { tag: string; dotClass: string; badgeClass: string }
> = {
  intro: {
    tag: 'INTRO',
    dotClass: 'bg-sky-500',
    badgeClass: 'bg-surface-2 text-ink-700 border-hairline',
  },
  verse: {
    tag: 'VERSE',
    dotClass: 'bg-accent-500',
    badgeClass: 'bg-accent-50 text-accent-text border-accent-200',
  },
  'pre-chorus': {
    tag: 'PRE',
    dotClass: 'bg-amber-500',
    badgeClass: 'bg-surface-2 text-ink-700 border-hairline',
  },
  chorus: {
    tag: 'CHORUS',
    dotClass: 'bg-accent-500',
    badgeClass: 'bg-accent-50 text-accent-text border-accent-200',
  },
  solo: {
    tag: 'SOLO',
    dotClass: 'bg-violet-500',
    badgeClass: 'bg-surface-2 text-ink-700 border-hairline',
  },
  bridge: {
    tag: 'BRIDGE',
    dotClass: 'bg-emerald-500',
    badgeClass: 'bg-surface-2 text-ink-700 border-hairline',
  },
  outro: {
    tag: 'OUTRO',
    dotClass: 'bg-slate-400',
    badgeClass: 'bg-surface-2 text-ink-700 border-hairline',
  },
};

function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(48, el.scrollHeight)}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={2}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={className}
    />
  );
}

export function SectionBuilder({
  song,
  viewMode = 'songwriter',
  activeGlobalBarIndex,
  onUpdateSong,
  onOpenChordPicker,
  onOpenPresetsModal,
  onOpenMelodyPianoRoll,
  onOpenVocalRecorder,
  onOpenAdvanceForSection,
  onOpenInlineAiSection,
  onAddNextAiStorySection,
  onSwitchToArranger,
  loopRange = null,
  onToggleLoopRange,
  onPlayBarFromIndex,
  onPlaySectionOnce,
  onOpenKaraoke,
  onCreditsChange,
  onOpenWallet,
}: SectionBuilderProps) {
  const { t, lang } = useLanguage();
  const [expandedInstrumentPanels, setExpandedInstrumentPanels] = useState<
    Record<string, boolean>
  >({});
  const [sheetModeSections, setSheetModeSections] = useState<
    Record<string, boolean>
  >({});
  const [openBarPopoverId, setOpenBarPopoverId] = useState<string | null>(null);
  const [openRhymeBarId, setOpenRhymeBarId] = useState<string | null>(null);
  const [openVariationBarId, setOpenVariationBarId] = useState<string | null>(null);
  const [variationLoadingBarId, setVariationLoadingBarId] = useState<string | null>(null);
  const [variationError, setVariationError] = useState<string | null>(null);
  const [variationResults, setVariationResults] = useState<
    Record<
      string,
      {
        variations: string[];
        rhymeNotes?: string[];
        tip: string;
        model: string;
        isSimulated: boolean;
      }
    >
  >({});
  const [openSectionMenuId, setOpenSectionMenuId] = useState<string | null>(null);
  const [openInlineAiSectionId, setOpenInlineAiSectionId] = useState<string | null>(null);
  const [splitLyricsState, setSplitLyricsState] = useState<{
    sectionId: string;
    rawText: string;
  } | null>(null);
  const [addSectionMenuOpen, setAddSectionMenuOpen] = useState(false);
  const [deletedUndo, setDeletedUndo] = useState<{
    section: SongSection;
    index: number;
  } | null>(null);
  const [speakingSectionId, setSpeakingSectionId] = useState<string | null>(null);
  const [sectionTtsConfirmId, setSectionTtsConfirmId] = useState<string | null>(null);
  const defaultVoiceForSong: 'Kore' | 'Aoede' | 'Puck' | 'Charon' | 'Fenrir' =
    song.easyConfig?.vocalProfile === 'male'
      ? song.thaiGenre === 'thai-rock' || song.thaiGenre === 'phuea-chiwit'
        ? 'Fenrir'
        : 'Charon'
      : 'Kore';
  const [voiceOverride, setVoiceOverride] = useState<{
    songId: string;
    voice: 'Kore' | 'Aoede' | 'Puck' | 'Charon' | 'Fenrir';
  } | null>(null);
  const sectionTtsVoice: 'Kore' | 'Aoede' | 'Puck' | 'Charon' | 'Fenrir' =
    voiceOverride && voiceOverride.songId === song.id ? voiceOverride.voice : defaultVoiceForSong;
  const setSectionTtsVoice = (voice: 'Kore' | 'Aoede' | 'Puck' | 'Charon' | 'Fenrir') =>
    setVoiceOverride({ songId: song.id, voice });
  const [sectionTtsLoadingId, setSectionTtsLoadingId] = useState<string | null>(null);
  const [sectionTtsNotice, setSectionTtsNotice] = useState<
    Record<string, { message: string; isError?: boolean; audioUrl?: string }>
  >({});
  const [fullSongTtsConfirmOpen, setFullSongTtsConfirmOpen] = useState(false);
  const [fullSongTtsLoading, setFullSongTtsLoading] = useState(false);
  const [fullSongTtsStatus, setFullSongTtsStatus] = useState<{
    message: string;
    isError?: boolean;
  } | null>(null);

  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeBarRef = useRef<HTMLDivElement | null>(null);
  const sectionTtsAudioRef = useRef<HTMLAudioElement | null>(null);

  const flatBarsMemo = useMemo(() => flattenSong(song), [song]);
  const lyricSectionsWithBounds = useMemo(() => {
    const items: Array<{
      section: SongSection;
      startGlobalIdx: number;
      endGlobalIdx: number;
    }> = [];
    let cursor = 0;
    for (const sec of song.sections) {
      const startGlobalIdx = cursor;
      const endGlobalIdx = cursor + sec.bars.length - 1;
      cursor += sec.bars.length;
      if (sec.bars.some((b) => b.lyrics.trim().length > 0)) {
        items.push({ section: sec, startGlobalIdx, endGlobalIdx });
      }
    }
    return items;
  }, [song.sections]);
  const missingVocalSections = useMemo(() => {
    const activeAiTakes = (song.vocalTakes || []).filter(
      (vt) => vt.isActive && vt.source === 'ai-tts' && !!vt.audioDataUrl
    );
    return lyricSectionsWithBounds.filter(
      ({ section, startGlobalIdx, endGlobalIdx }) =>
        !activeAiTakes.some(
          (vt) =>
            vt.sectionId === section.id ||
            (typeof vt.startGlobalBarIndex === 'number' &&
              typeof vt.endGlobalBarIndex === 'number' &&
              vt.startGlobalBarIndex <= endGlobalIdx &&
              vt.endGlobalBarIndex >= startGlobalIdx)
        )
    );
  }, [lyricSectionsWithBounds, song.vocalTakes]);
  const targetFullVocalSections =
    missingVocalSections.length > 0 ? missingVocalSections : lyricSectionsWithBounds;
  const activeFlatBar = activeGlobalBarIndex >= 0 ? flatBarsMemo[activeGlobalBarIndex] : undefined;
  const nextFlatBar = activeGlobalBarIndex >= 0 ? flatBarsMemo[activeGlobalBarIndex + 1] : undefined;

  const isArranger = viewMode === 'arranger';
  let globalBarCounter = 0;

  // Close menus on outside click or Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenBarPopoverId(null);
        setOpenRhymeBarId(null);
        setOpenVariationBarId(null);
        setOpenSectionMenuId(null);
        setOpenInlineAiSectionId(null);
        setAddSectionMenuOpen(false);
      }
    };
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest('[data-studio-menu-root]')) {
        setOpenBarPopoverId(null);
        setOpenSectionMenuId(null);
        setOpenInlineAiSectionId(null);
        setAddSectionMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('mousedown', handleClick);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('mousedown', handleClick);
    };
  }, []);

  // Auto-scroll active bar smoothly during playback
  useEffect(() => {
    if (activeGlobalBarIndex >= 0 && activeBarRef.current) {
      activeBarRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [activeGlobalBarIndex]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      stopBrowserLyrics();
      sectionTtsAudioRef.current?.pause();
    };
  }, []);

  const toggleSectionInstrumentPanel = (sectionId: string) => {
    setExpandedInstrumentPanels((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const toggleBarControlsPopover = (barId: string) => {
    setOpenBarPopoverId((prev) => (prev === barId ? null : barId));
    setOpenSectionMenuId(null);
  };

  const handleAddSection = (type: SectionType) => {
    const typeConfigs: Record<
      SectionType,
      {
        label: string;
        intensity: SectionIntensity;
        chords: string[];
        instruments: SongSection['instruments'];
      }
    > = {
      intro: {
        label: 'Intro (เกริ่นนำ)',
        intensity: 'low',
        chords: ['C', 'Fmaj7', 'Am7', 'G'],
        instruments: {
          guitarRhythm: true,
          guitarRhythmStyle: 'fingerpicking',
          guitarLead: false,
          bass: false,
          piano: false,
          drums: false,
        },
      },
      verse: {
        label: 'Verse (ท่อนร้อง)',
        intensity: 'low',
        chords: ['C', 'G/B', 'Am', 'F'],
        instruments: {
          guitarRhythm: true,
          guitarRhythmStyle: 'fingerpicking',
          guitarLead: false,
          bass: true,
          bassStyle: 'root-fifth',
          piano: false,
          drums: false,
        },
      },
      'pre-chorus': {
        label: 'Pre-Chorus (ท่อนส่ง)',
        intensity: 'medium',
        chords: ['Dm', 'Em', 'F', 'G'],
        instruments: {
          guitarRhythm: true,
          guitarRhythmStyle: 'soft-strum',
          guitarLead: false,
          bass: true,
          bassStyle: 'root-fifth',
          piano: true,
          pianoStyle: 'warm-pad',
          drums: false,
        },
      },
      chorus: {
        label: 'Chorus (ท่อนฮุก)',
        intensity: 'high',
        chords: ['C', 'G', 'Am', 'F'],
        instruments: {
          guitarRhythm: true,
          guitarRhythmStyle: 'campfire-strum',
          guitarLead: false,
          bass: true,
          bassStyle: 'root-fifth',
          piano: true,
          pianoStyle: 'warm-pad',
          drums: true,
          drumsStyle: 'shaker-cajon',
        },
      },
      solo: {
        label: 'Solo (โซโล่)',
        intensity: 'high',
        chords: ['F', 'G', 'Em', 'Am'],
        instruments: {
          guitarRhythm: true,
          guitarRhythmStyle: 'campfire-strum',
          guitarLead: true,
          guitarLeadStyle: 'melodic-solo',
          bass: true,
          bassStyle: 'root-fifth',
          piano: true,
          pianoStyle: 'warm-pad',
          drums: true,
          drumsStyle: 'simple-kit',
        },
      },
      bridge: {
        label: 'Bridge (ท่อนแยก)',
        intensity: 'medium',
        chords: ['Am', 'F', 'Dm', 'G'],
        instruments: {
          guitarRhythm: true,
          guitarRhythmStyle: 'soft-strum',
          guitarLead: false,
          bass: true,
          bassStyle: 'warm-sustain',
          piano: true,
          pianoStyle: 'gentle-arpeggio',
          drums: true,
          drumsStyle: 'shaker-cajon',
        },
      },
      outro: {
        label: 'Outro (ท่อนจบ)',
        intensity: 'low',
        chords: ['Fmaj7', 'G', 'C', 'C'],
        instruments: {
          guitarRhythm: true,
          guitarRhythmStyle: 'fingerpicking',
          guitarLead: false,
          bass: true,
          bassStyle: 'warm-sustain',
          piano: true,
          pianoStyle: 'warm-pad',
          drums: false,
        },
      },
    };

    const cfg = typeConfigs[type];
    const newSection: SongSection = {
      id: generateUniqueId('sec'),
      name: cfg.label,
      type,
      intensity: cfg.intensity,
      ...(type === 'solo' ? { soloMode: 'normal' as const } : {}),
      instruments: { ...cfg.instruments },
      bars: cfg.chords.map((ch) => ({
        id: generateUniqueId('bar'),
        chordsPerBar: 1,
        chords: [ch],
        playStyle: 'normal',
        lyrics: '',
        melodyNotes: [],
      })),
    };

    onUpdateSong((prev) => ({
      ...prev,
      sections: [...prev.sections, newSection],
    }));
    setAddSectionMenuOpen(false);
  };

  const handleDuplicateSection = (sectionId: string) => {
    onUpdateSong((prev) => ({
      ...prev,
      sections: duplicateSectionInList(prev.sections, sectionId),
    }));
    setOpenSectionMenuId(null);
  };

  const handleDeleteSection = (sectionId: string) => {
    if (song.sections.length <= 1) return;
    const idx = song.sections.findIndex((s) => s.id === sectionId);
    if (idx === -1) return;
    const target = song.sections[idx];

    onUpdateSong((prev) => ({
      ...prev,
      sections: prev.sections.filter((s) => s.id !== sectionId),
    }));
    setOpenSectionMenuId(null);

    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setDeletedUndo({ section: target, index: idx });
    undoTimerRef.current = setTimeout(() => {
      setDeletedUndo(null);
    }, 6000);
  };

  const handleUndoDeleteSection = () => {
    if (!deletedUndo) return;
    const { section, index } = deletedUndo;
    onUpdateSong((prev) => {
      const next = [...prev.sections];
      const insertAt = Math.min(index, next.length);
      next.splice(insertAt, 0, section);
      return { ...prev, sections: next };
    });
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setDeletedUndo(null);
  };

  const handleMoveSection = (index: number, direction: 'up' | 'down') => {
    onUpdateSong((prev) => {
      const next = [...prev.sections];
      const targetIdx = direction === 'up' ? index - 1 : index + 1;
      if (targetIdx < 0 || targetIdx >= next.length) return prev;
      [next[index], next[targetIdx]] = [next[targetIdx], next[index]];
      return { ...prev, sections: next };
    });
    setOpenSectionMenuId(null);
  };

  const handleUpdateSectionName = (sectionId: string, name: string) => {
    onUpdateSong((prev) => ({
      ...prev,
      sections: prev.sections.map((sec) =>
        sec.id === sectionId ? { ...sec, name } : sec
      ),
    }));
  };

  const handleUpdateSectionIntensity = (
    sectionId: string,
    intensity: SectionIntensity
  ) => {
    onUpdateSong((prev) => ({
      ...prev,
      sections: prev.sections.map((sec) =>
        sec.id === sectionId ? { ...sec, intensity } : sec
      ),
    }));
  };

  const handleToggleSoloMode = (sectionId: string) => {
    onUpdateSong((prev) => ({
      ...prev,
      sections: prev.sections.map((sec) =>
        sec.id === sectionId
          ? {
              ...sec,
              soloMode: sec.soloMode === 'split-slow-fast' ? 'normal' : 'split-slow-fast',
            }
          : sec
      ),
    }));
  };

  const handleAddBar = (sectionId: string) => {
    onUpdateSong((prev) => ({
      ...prev,
      sections: prev.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        const lastBar = sec.bars[sec.bars.length - 1];
        const fallbackChord = lastBar?.chords?.[0] || prev.baseKey || 'C';
        const newBar: SongBar = {
          id: generateUniqueId('bar'),
          chordsPerBar: 1,
          chords: [fallbackChord],
          playStyle: 'normal',
          lyrics: '',
          melodyNotes: [],
        };
        return { ...sec, bars: [...sec.bars, newBar] };
      }),
    }));
  };

  const toggleSectionInstrument = (
    sectionId: string,
    inst: 'guitarRhythm' | 'guitarLead' | 'bass' | 'piano' | 'drums'
  ) => {
    onUpdateSong((prev) => ({
      ...prev,
      sections: prev.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        const current = sec.instruments?.[inst] ?? false;
        return {
          ...sec,
          instruments: {
            ...sec.instruments,
            [inst]: !current,
          },
        };
      }),
    }));
  };

  const updateSectionInstrumentStyle = (
    sectionId: string,
    field:
      | 'guitarRhythmStyle'
      | 'guitarLeadStyle'
      | 'guitarLeadDrive'
      | 'bassStyle'
      | 'pianoStyle'
      | 'drumsStyle',
    style: string
  ) => {
    onUpdateSong((prev) => ({
      ...prev,
      sections: prev.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          instruments: {
            ...sec.instruments,
            [field]: style,
          },
        };
      }),
    }));
  };

  const updateSectionInstrumentVolume = (
    sectionId: string,
    field:
      | 'guitarRhythmVolume'
      | 'guitarLeadVolume'
      | 'bassVolume'
      | 'pianoVolume'
      | 'drumsVolume',
    volume: number
  ) => {
    onUpdateSong((prev) => ({
      ...prev,
      sections: prev.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          instruments: {
            ...sec.instruments,
            [field]: Math.max(0, Math.min(100, volume)),
          },
        };
      }),
    }));
  };

  const renderSectionVolumeSlider = (
    sectionId: string,
    field:
      | 'guitarRhythmVolume'
      | 'guitarLeadVolume'
      | 'bassVolume'
      | 'pianoVolume'
      | 'drumsVolume',
    currentVal?: number
  ) => {
    const val = currentVal ?? 100;
    return (
      <div className="pt-1.5 mt-1 border-t border-hairline flex items-center gap-2">
        <span className="text-[10px] font-semibold text-ink-400 shrink-0">
          {lang === 'th' ? 'ดัง' : 'Vol'}
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={val}
          onChange={(e) =>
            updateSectionInstrumentVolume(sectionId, field, Number(e.target.value))
          }
          className="w-full h-1.5 rounded-lg cursor-pointer accent-accent-500"
          title={lang === 'th' ? 'ความดังเฉพาะท่อนนี้ (0-100%)' : 'Section volume (0-100%)'}
        />
        <span className="text-[10px] font-mono-tabular font-semibold text-ink-700 w-8 text-right shrink-0">
          {val}%
        </span>
      </div>
    );
  };

  const handleDeleteBar = (sectionId: string, barId: string) => {
    onUpdateSong((prev) => ({
      ...prev,
      sections: prev.sections.map((sec) => {
        if (sec.id !== sectionId || sec.bars.length <= 1) return sec;
        return {
          ...sec,
          bars: sec.bars.filter((b) => b.id !== barId),
        };
      }),
    }));
    setOpenBarPopoverId(null);
  };

  const handleToggleChordsPerBar = (sectionId: string, barId: string) => {
    onUpdateSong((prev) => ({
      ...prev,
      sections: prev.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          bars: sec.bars.map((b) => {
            if (b.id !== barId) return b;
            const nextCount: 1 | 2 = b.chordsPerBar === 2 ? 1 : 2;
            const first = b.chords[0] || 'C';
            const second = b.chords[1] || first;
            return {
              ...b,
              chordsPerBar: nextCount,
              chords: nextCount === 2 ? [first, second] : [first],
            };
          }),
        };
      }),
    }));
  };

  const handleUpdateBarPlayStyle = (
    sectionId: string,
    barId: string,
    playStyle: BarPlayStyle
  ) => {
    onUpdateSong((prev) => ({
      ...prev,
      sections: prev.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          bars: sec.bars.map((b) =>
            b.id === barId ? { ...b, playStyle } : b
          ),
        };
      }),
    }));
  };

  const handleUpdateBarLyrics = (
    sectionId: string,
    barId: string,
    lyrics: string
  ) => {
    onUpdateSong((prev) => ({
      ...prev,
      sections: prev.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          bars: sec.bars.map((b) => (b.id === barId ? { ...b, lyrics } : b)),
        };
      }),
    }));
  };

  const handleFetchSingleBarVariations = async (
    section: SongSection,
    secIdx: number,
    bar: SongBar,
    barIndex: number
  ) => {
    const cost = CREDIT_COST_TABLE.aiLyricsQuick;
    if (!canAfford(cost)) {
      setVariationError(
        lang === 'th'
          ? `เครดิตไม่เพียงพอ (ต้องใช้ ${cost} เครดิต) กรุณาเติมเครดิตในกระเป๋า`
          : `Insufficient credits (requires ${cost} credit). Please top up in Wallet.`
      );
      return;
    }

    setVariationError(null);
    setVariationLoadingBarId(bar.id);

    try {
      const token = await getAuthAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...getAnalyticsHeaders(),
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const previousSectionLyrics =
        secIdx > 0
          ? song.sections[secIdx - 1].bars.map((b) => b.lyrics.trim()).filter(Boolean)
          : undefined;
      const allPriorSections =
        secIdx > 0
          ? song.sections.slice(0, secIdx).map((s) => ({
              name: s.name,
              type: s.type,
              lyrics: s.bars.map((b) => b.lyrics),
            }))
          : undefined;

      const targetSoundingChord = transposeChord(
        bar.chords[0] || song.baseKey || 'C',
        song.transposeSemitones
      );
      const inferredMood =
        getChordEmotionalHint(targetSoundingChord, 'th') ||
        song.thaiGenre ||
        'ซึ้ง/อารมณ์';
      const inferredTopic =
        bar.lyrics.trim() || song.title?.trim() || section.name || 'ความรู้สึกในใจ';

      const res = await fetch('/api/advance/lyrics', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mood: inferredMood,
          topic: inferredTopic,
          chordProgression: section.bars.map((b) =>
            transposeChord(b.chords[0] || 'C', song.transposeSemitones)
          ),
          sectionType: section.type,
          bpm: song.bpm,
          timeSignature: song.timeSignature,
          previousSectionLyrics,
          allPriorSections,
          mode: 'quick',
          barCount: section.bars.length,
          bars: section.bars.map((b) => ({
            chord: transposeChord(b.chords[0] || 'C', song.transposeSemitones),
            chord2:
              b.chordsPerBar === 2
                ? transposeChord(b.chords[1] || b.chords[0] || 'C', song.transposeSemitones)
                : undefined,
            chordsPerBar: b.chordsPerBar,
            existingLyrics: b.lyrics,
          })),
          thaiGenre: song.thaiGenre,
          lyricEra: song.lyricEra,
          lyricDialect: song.lyricDialect,
          songwriterStyle: song.songwriterStyle,
          emotionalResolution: song.emotionalResolution,
          songTitle: song.title,
          singleBarIndex: barIndex,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        isSimulated?: boolean;
        model?: string;
        variations?: string[];
        rhymeNotes?: string[];
        tip?: string;
        wallet?: { balance: number; trialCredits: number; purchasedCredits: number };
      };

      if (!res.ok) {
        if (data.wallet) {
          const synced = applyServerWalletSnapshot(data.wallet);
          onCreditsChange?.(synced.balance);
        }
        setVariationError(
          data.error ||
            (lang === 'th'
              ? 'ไม่สามารถสุ่มคำ 3 ตัวเลือกได้ชั่วคราว (ไม่หักเครดิต)'
              : 'Unable to generate 3 bar variations right now (0 credits charged)')
        );
        return;
      }

      if (data.wallet) {
        const synced = applyServerWalletSnapshot(data.wallet);
        onCreditsChange?.(synced.balance);
      } else if (!data.isSimulated) {
        const deduction = deductCredits(
          cost,
          `AI 3 Variations (${data.model || 'gemini-3.5-flash-lite'}): ${section.name} Bar ${barIndex + 1}`
        );
        if (deduction.success) {
          onCreditsChange?.(deduction.balance);
        }
      }

      const items = Array.isArray(data.variations)
        ? data.variations.filter((v) => typeof v === 'string' && v.trim().length > 0).slice(0, 3)
        : [];
      setVariationResults((prev) => ({
        ...prev,
        [bar.id]: {
          variations: items,
          rhymeNotes: Array.isArray(data.rhymeNotes) ? data.rhymeNotes : [],
          tip: data.tip || '',
          model: data.model || 'gemini-3.5-flash-lite',
          isSimulated: Boolean(data.isSimulated),
        },
      }));
    } catch {
      setVariationError(
        lang === 'th'
          ? 'เชื่อมต่อเซิร์ฟเวอร์ AI ไม่สำเร็จ (ไม่หักเครดิต)'
          : 'Network error calling AI variations (0 credits charged)'
      );
    } finally {
      setVariationLoadingBarId(null);
    }
  };

  const handleToggleSpeakSection = (section: SongSection) => {
    if (speakingSectionId === section.id) {
      stopBrowserLyrics();
      setSpeakingSectionId(null);
      return;
    }

    const lines = section.bars.map((b) => b.lyrics.trim()).filter(Boolean);
    if (lines.length === 0) return;

    if (!isBrowserSpeechSupported()) {
      setSectionTtsNotice((prev) => ({
        ...prev,
        [section.id]: {
          message:
            lang === 'th'
              ? 'เบราว์เซอร์นี้ไม่รองรับเสียงอ่าน Web Speech API — สามารถใช้ปุ่มเสียงร้องไกด์ AI แทนได้'
              : 'Web Speech API is not available in this browser — try AI Singing Guide instead.',
          isError: true,
        },
      }));
      return;
    }

    speakBrowserLyrics(lines, {
      bpm: song.bpm,
      lang: lang === 'en' ? 'en' : 'th',
      onStart: () => setSpeakingSectionId(section.id),
      onEnd: () => setSpeakingSectionId((cur) => (cur === section.id ? null : cur)),
      onError: () => setSpeakingSectionId((cur) => (cur === section.id ? null : cur)),
    });
  };

  const requestSectionAiVocalTake = async (
    section: SongSection,
    startGlobalIdx: number,
    endGlobalIdx: number
  ): Promise<{
    nextTake: VocalTake | null;
    cleanUrl: string | null;
    model?: string;
    isSimulated?: boolean;
    cueText?: string;
    tip?: string;
    wallet?: WalletBreakdown;
  }> => {
    const ttsPlan = buildSectionTtsTextPlan(section.bars, 240);
    const combinedLyrics = ttsPlan.text;
    if (!combinedLyrics) {
      return { nextTake: null, cleanUrl: null };
    }

    const sectionTargetDurationSec = Number(
      Math.max(2, Math.min(30, section.bars.length * getTiming(song).barSec)).toFixed(2)
    );
    const accessToken = getAuthAccessToken();
    const response = await fetch('/api/advance/tts-cue', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAnalyticsHeaders(),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        text: combinedLyrics,
        bpm: song.bpm,
        targetDurationSec: sectionTargetDurationSec,
        language: lang,
        includeCountIn: false,
        voice: sectionTtsVoice,
        modelTier: 'pro-tts',
        vocalMode: 'singing-demo',
        thaiGenre: song.thaiGenre,
        sectionType: section.type,
        baseKey: song.baseKey,
      }),
    });
    const data = (await response.json()) as {
      isSimulated?: boolean;
      audioDataUrl?: string | null;
      cueText?: string;
      tip?: string;
      model?: string;
      wallet?: WalletBreakdown;
      error?: string;
    };

    if (!response.ok) {
      throw new Error(data.error || 'TTS request failed');
    }

    if (!data.audioDataUrl) {
      return {
        nextTake: null,
        cleanUrl: null,
        model: data.model,
        isSimulated: data.isSimulated,
        cueText: data.cueText,
        tip: data.tip,
        wallet: data.wallet,
      };
    }

    const { dataUrl: cleanUrl } = await trimAudioDataUrlLeadingSilence(data.audioDataUrl, {
      trimTrailing: true,
    });
    const takeId = generateUniqueId('vtake');
    const nextTake: VocalTake = {
      id: takeId,
      name: `${formatNextTakeName(song, song.vocalTakes || [], 'section', section.id)} (AI Guide)`,
      scope: 'section',
      source: 'ai-tts',
      sectionId: section.id,
      startGlobalBarIndex: startGlobalIdx,
      endGlobalBarIndex: endGlobalIdx,
      audioDataUrl: cleanUrl,
      latencyOffsetMs: song.vocalLatencyOffsetMs ?? 0,
      preRollOffsetSec: 0,
      fxPreset: song.mixer.vocal?.fxPreset ?? 'studio-warm',
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    void saveVocalBlob(makeVocalTakeBlobKey(song.id, takeId), cleanUrl);

    return {
      nextTake,
      cleanUrl,
      model: data.model,
      isSimulated: data.isSimulated,
      cueText: data.cueText,
      tip: data.tip,
      wallet: data.wallet,
    };
  };

  const handleGenerateSectionAiVocal = async (
    section: SongSection,
    startGlobalIdx: number,
    endGlobalIdx: number
  ) => {
    const ttsPlan = buildSectionTtsTextPlan(section.bars, 240);
    if (!ttsPlan.text || sectionTtsLoadingId || fullSongTtsLoading) return;

    const cost = CREDIT_COST_TABLE.aiTtsCue;
    if (!canAfford(cost)) {
      setSectionTtsConfirmId(null);
      onOpenWallet?.();
      return;
    }

    setSectionTtsLoadingId(section.id);
    setSectionTtsNotice((prev) => {
      const copy = { ...prev };
      delete copy[section.id];
      return copy;
    });

    try {
      const res = await requestSectionAiVocalTake(section, startGlobalIdx, endGlobalIdx);

      if (res.wallet) {
        const synced = applyServerWalletSnapshot(res.wallet);
        onCreditsChange?.(synced.balance);
      } else if (!res.isSimulated) {
        const deduction = deductCredits(
          cost,
          `AI Singing Guide (gemini-3.8-flash-tts): ${section.name}`
        );
        if (deduction.success) {
          onCreditsChange?.(deduction.balance);
        }
      }

      setSectionTtsConfirmId(null);

      if (res.nextTake && res.cleanUrl) {
        const createdTake = res.nextTake;
        const cleanUrl = res.cleanUrl;
        onUpdateSong((prev) => {
          const totalBars = flattenSong(prev).length;
          const nextTakes = addAndActivateVocalTake(prev.vocalTakes || [], createdTake, totalBars);
          return {
            ...prev,
            vocalTakes: nextTakes,
            mixer: {
              ...prev.mixer,
              vocal: {
                ...(prev.mixer.vocal ?? { enabled: true, volume: 100 }),
                enabled: true,
              },
            },
            updatedAt: new Date().toISOString(),
          };
        });

        sectionTtsAudioRef.current?.pause();
        sectionTtsAudioRef.current = playAudioDataUrl(cleanUrl);
        setSectionTtsNotice((prev) => ({
          ...prev,
          [section.id]: {
            message:
              lang === 'th'
                ? `✅ สร้างเสียงร้องไกด์ AI (${res.model || 'gemini-3.8-flash-tts'}) และบันทึกเป็น Active Take ท่อนนี้แล้ว พร้อมกด ▶ เล่นท่อนนี้ หรือส่งออก MP3!`
                : `✅ AI singing guide (${res.model || 'gemini-3.8-flash-tts'}) trimmed & saved as active Vocal Take for this section!`,
            audioUrl: cleanUrl,
          },
        }));
      } else {
        if (res.cueText && isBrowserSpeechSupported()) {
          speakBrowserLyrics(res.cueText, { bpm: song.bpm, lang: lang === 'en' ? 'en' : 'th' });
        }
        setSectionTtsNotice((prev) => ({
          ...prev,
          [section.id]: {
            message:
              res.tip ||
              (lang === 'th'
                ? 'ใช้เสียงอ่านเบราว์เซอร์แทนชั่วคราว (ไม่หัก 2 เครดิต)'
                : 'Used browser speech cue fallback (0 credits charged).'),
          },
        }));
      }
    } catch (err) {
      setSectionTtsNotice((prev) => ({
        ...prev,
        [section.id]: {
          message:
            err instanceof Error
              ? err.message
              : lang === 'th'
                ? 'สร้างเสียงร้องไกด์ AI ไม่สำเร็จ (ไม่หักเครดิต)'
                : 'Failed to generate AI singing guide (0 credits charged)',
          isError: true,
        },
      }));
    } finally {
      setSectionTtsLoadingId(null);
    }
  };

  const handleGenerateFullSongAiVocals = async () => {
    if (fullSongTtsLoading || sectionTtsLoadingId || targetFullVocalSections.length === 0) return;

    const unitCost = CREDIT_COST_TABLE.aiTtsCue;
    const totalCost = targetFullVocalSections.length * unitCost;
    if (!canAfford(totalCost)) {
      onOpenWallet?.();
      return;
    }

    setFullSongTtsLoading(true);
    setFullSongTtsStatus(null);

    try {
      const settled = await Promise.allSettled(
        targetFullVocalSections.map(async ({ section, startGlobalIdx, endGlobalIdx }) => {
          const result = await requestSectionAiVocalTake(section, startGlobalIdx, endGlobalIdx);
          return { section, result };
        })
      );

      const createdTakes: VocalTake[] = [];
      let simulatedCount = 0;
      let latestWallet: WalletBreakdown | undefined;
      let failedCount = 0;

      for (const outcome of settled) {
        if (outcome.status === 'fulfilled') {
          const { section, result } = outcome.value;
          if (result.wallet) {
            if (!latestWallet || result.wallet.balance < latestWallet.balance) {
              latestWallet = result.wallet;
            }
          } else if (!result.isSimulated && result.nextTake) {
            const deduction = deductCredits(
              unitCost,
              `AI Full-Song Vocal Guide: ${section.name}`
            );
            if (deduction.success) {
              onCreditsChange?.(deduction.balance);
            }
          }
          if (result.isSimulated) simulatedCount++;
          if (result.nextTake) {
            createdTakes.push(result.nextTake);
          }
        } else {
          failedCount++;
        }
      }

      if (latestWallet) {
        const synced = applyServerWalletSnapshot(latestWallet);
        onCreditsChange?.(synced.balance);
      }

      if (createdTakes.length > 0) {
        onUpdateSong((prev) => {
          const totalBars = flattenSong(prev).length;
          let nextTakes = prev.vocalTakes || [];
          for (const tk of createdTakes) {
            nextTakes = addAndActivateVocalTake(nextTakes, tk, totalBars);
          }
          return {
            ...prev,
            vocalTakes: nextTakes,
            mixer: {
              ...prev.mixer,
              vocal: {
                ...(prev.mixer.vocal ?? { enabled: true, volume: 100 }),
                enabled: true,
              },
            },
            updatedAt: new Date().toISOString(),
          };
        });
      }

      setFullSongTtsConfirmOpen(false);
      if (createdTakes.length > 0 && failedCount === 0) {
        setFullSongTtsStatus({
          message:
            lang === 'th'
              ? `✅ สร้างเสียงร้องไกด์ AI ครบ ${createdTakes.length} ท่อนเรียบร้อย! กด ▶ เล่นทั้งเพลงหรือส่งออก .MP3 ได้เลย (ไม่มีท่อนแหว่ง)`
              : `✅ Generated AI singing guides for all ${createdTakes.length} sections! Ready to play or export .MP3.`,
        });
      } else if (createdTakes.length > 0) {
        setFullSongTtsStatus({
          message:
            lang === 'th'
              ? `⚠️ สร้างสำเร็จ ${createdTakes.length} ท่อน (ไม่สำเร็จ ${failedCount} ท่อน — เฉพาะท่อนที่ไม่สำเร็จจะไม่ถูกหักเครดิต)`
              : `⚠️ Generated ${createdTakes.length} sections (${failedCount} failed without credit charge).`,
          isError: true,
        });
      } else {
        setFullSongTtsStatus({
          message:
            simulatedCount > 0 && lang === 'th'
              ? 'โหมดจำลอง (ไม่มีคีย์ AI) จึงยังไม่สร้างไฟล์เสียงร้อง (ไม่หักเครดิต)'
              : lang === 'th'
                ? 'ไม่สามารถสร้างเสียงร้องไกด์ AI ได้ (ไม่หักเครดิต)'
                : 'Failed to generate AI singing guides (0 credits charged).',
          isError: createdTakes.length === 0 && simulatedCount === 0,
        });
      }
    } finally {
      setFullSongTtsLoading(false);
    }
  };

  const sectionTypesList: { type: SectionType; label: string }[] = [
    { type: 'intro', label: t.sectionIntro },
    { type: 'verse', label: t.sectionVerse },
    { type: 'pre-chorus', label: t.sectionPreChorus },
    { type: 'chorus', label: t.sectionChorus },
    { type: 'solo', label: t.sectionSolo },
    { type: 'bridge', label: lang === 'th' ? 'Bridge' : 'Bridge' },
    { type: 'outro', label: lang === 'th' ? 'Outro' : 'Outro' },
  ];

  const workflowStages: Array<{ id: SongStatusTag; label: string }> = [
    { id: 'draft', label: t.stageDraft },
    { id: 'arranged', label: t.stageArranged },
    { id: 'vocal-recorded', label: t.stageVocal },
    { id: 'mastered', label: t.stageMastered },
  ];
  const activeStageIndex = Math.max(
    0,
    workflowStages.findIndex((s) => s.id === (song.statusTag ?? 'draft'))
  );

  return (
    <div className="space-y-5">
      {/* 4-Step Studio Workflow Progress Strip */}
      <div
        aria-label={lang === 'th' ? 'ความคืบหน้าการทำเพลง' : 'Song workflow progress'}
        className="flex flex-wrap items-center justify-between gap-2 bg-surface-1 border border-hairline rounded-2xl px-3.5 py-2.5 shadow-2xs"
      >
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {workflowStages.map((stage, idx) => {
            const isCurrent = idx === activeStageIndex;
            const isCompleted = idx < activeStageIndex;
            return (
              <React.Fragment key={stage.id}>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSong((prev) => ({
                      ...prev,
                      statusTag: stage.id,
                      updatedAt: new Date().toISOString(),
                    }))
                  }
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition cursor-pointer ${
                    isCurrent
                      ? 'bg-accent-500 text-white border-accent-500 shadow-2xs'
                      : isCompleted
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-surface-2 text-ink-600 border-hairline hover:bg-surface-1'
                  }`}
                >
                  {isCompleted && <CheckCircle2 className="w-3 h-3 shrink-0" />}
                  <span>{stage.label}</span>
                </button>
                {idx < workflowStages.length - 1 && (
                  <span className="text-ink-300 text-xs select-none hidden sm:inline">→</span>
                )}
              </React.Fragment>
            );
          })}
        </div>
        <span className="text-[11px] text-ink-400">
          {lang === 'th'
            ? `${song.sections.length} ท่อน • ${song.sections.reduce((acc, s) => acc + s.bars.length, 0)} ห้อง`
            : `${song.sections.length} sections • ${song.sections.reduce((acc, s) => acc + s.bars.length, 0)} bars`}
        </span>
      </div>

      {/* Workspace Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-1 border border-hairline rounded-2xl px-4 py-3.5 shadow-e1">
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-ink-900 tracking-tight flex items-center gap-2">
            {isArranger ? (
              <Layers className="w-4 h-4 text-accent-text" />
            ) : (
              <Music className="w-4 h-4 text-accent-text" />
            )}
            <span>{isArranger ? t.arrangerTitle : t.songwriterTitle}</span>
          </h2>
          <p className="text-xs text-ink-400 mt-0.5">
            {isArranger ? t.arrangerSubtitle : t.songwriterSubtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {lyricSectionsWithBounds.length > 0 && (
            <button
              type="button"
              disabled={fullSongTtsLoading}
              onClick={() => setFullSongTtsConfirmOpen((cur) => !cur)}
              aria-expanded={fullSongTtsConfirmOpen}
              title={
                lang === 'th'
                  ? 'สร้างเสียงร้องไกด์ AI พร้อมกันทุกท่อนที่มีเนื้อร้อง (ขนาน 7-8 วินาที ไม่ต้องกดทีละท่อน)'
                  : 'Generate AI singing guide across all lyric sections in parallel'
              }
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer disabled:opacity-50 ${
                fullSongTtsConfirmOpen
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-2xs'
                  : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border-indigo-200'
              }`}
            >
              {fullSongTtsLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Mic className="w-3.5 h-3.5" />
              )}
              <span>
                {(() => {
                  const totalCost =
                    targetFullVocalSections.length * CREDIT_COST_TABLE.aiTtsCue;
                  if (
                    missingVocalSections.length > 0 &&
                    missingVocalSections.length < lyricSectionsWithBounds.length
                  ) {
                    return lang === 'th'
                      ? `🎤 เติมเสียงร้อง AI ให้ครบทุกท่อน (อีก ${missingVocalSections.length} ท่อน · ${totalCost} Cr)`
                      : `🎤 Fill Remaining AI Vocals (${missingVocalSections.length} · ${totalCost} Cr)`;
                  }
                  return lang === 'th'
                    ? `🎤 ร้องไกด์ AI ครบทุกท่อน (${targetFullVocalSections.length} ท่อน · ${totalCost} Cr)`
                    : `🎤 Full-Song AI Vocals (${targetFullVocalSections.length} · ${totalCost} Cr)`;
                })()}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              trackUsageEvent({
                eventName: 'arranger_auto_arrange',
                category: 'feature',
                songwriterStyle: song.songwriterStyle,
                thaiGenre: song.thaiGenre,
                lyricDialect: song.lyricDialect,
                featureVariant: 'section_builder',
              });
              onUpdateSong((prev) => applyGenreBandArrangement(prev));
            }}
            title={
              lang === 'th'
                ? 'จัดสไตล์เครื่องดนตรีทั้ง 5 ชิ้น แอมป์ และวอลุ่มตามแนวเพลงให้อัตโนมัติ (0 เครดิต)'
                : 'Auto-arrange all 5 instruments, amp drive, and mix volumes by song genre (0 credits)'
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent-500/10 hover:bg-accent-500/20 text-accent-text border border-accent-500/30 text-xs font-semibold transition cursor-pointer"
          >
            <span>
              {lang === 'th'
                ? '🎚️ จัดวงอัตโนมัติตามสไตล์เพลง (0 เครดิต)'
                : '🎚️ Auto-Arrange Band by Genre (0 Credits)'}
            </span>
          </button>

          {/* Clean + Add Section Menu */}
          <div className="relative" data-studio-menu-root>
            <button
              type="button"
              onClick={() => setAddSectionMenuOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-accent-500 hover:bg-accent-hover text-white text-xs font-semibold shadow-e1 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t.addSection}</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-80" />
            </button>

            {addSectionMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-48 rounded-xl bg-surface-1 border border-hairline shadow-e3 p-1.5 z-30">
                {sectionTypesList.map((item) => {
                  const meta = SECTION_TYPE_META[item.type];
                  return (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => handleAddSection(item.type)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-ink-900 hover:bg-surface-2 transition text-left cursor-pointer"
                    >
                      <span className={`w-2 h-2 rounded-full ${meta.dotClass}`} />
                      <span>+ {item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Full-Song Parallel AI Vocal Confirmation Strip (Sprint E) */}
      {fullSongTtsConfirmOpen && lyricSectionsWithBounds.length > 0 && (
        <div className="px-4 py-3 rounded-2xl bg-indigo-50/90 border border-indigo-200 shadow-2xs flex flex-col gap-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-bold text-indigo-950 flex items-center gap-1.5">
              <Mic className="w-4 h-4 text-indigo-600" />
              <span>
                {lang === 'th'
                  ? `สร้างเสียงร้องไกด์ AI ครบ ${targetFullVocalSections.length} ท่อนพร้อมกัน: ${targetFullVocalSections.map((x) => x.section.name).join(', ')}`
                  : `Generate AI vocals across ${targetFullVocalSections.length} section(s): ${targetFullVocalSections.map((x) => x.section.name).join(', ')}`}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="full-song-tts-voice" className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-900">
                <span>{lang === 'th' ? 'นักร้อง:' : 'Voice:'}</span>
                <select
                  id="full-song-tts-voice"
                  name="fullSongTtsVoice"
                  value={sectionTtsVoice}
                  onChange={(e) =>
                    setSectionTtsVoice(
                      e.target.value as 'Kore' | 'Aoede' | 'Puck' | 'Charon' | 'Fenrir'
                    )
                  }
                  className="px-2 py-1 rounded-lg bg-white border border-indigo-200 text-indigo-950 text-[11px] font-semibold"
                >
                  <option value="Kore">Kore ({lang === 'th' ? 'หญิง อบอุ่น' : 'Female Warm'})</option>
                  <option value="Aoede">Aoede ({lang === 'th' ? 'หญิง ใสโปร่ง' : 'Female Bright'})</option>
                  <option value="Puck">Puck ({lang === 'th' ? 'วัยรุ่น สดใส' : 'Youthful'})</option>
                  <option value="Charon">Charon ({lang === 'th' ? 'ชาย นุ่มลึก' : 'Male Deep'})</option>
                  <option value="Fenrir">Fenrir ({lang === 'th' ? 'ชาย หนักแน่น' : 'Male Rock'})</option>
                </select>
              </label>
              {(() => {
                const bal = getCreditBalance();
                const need = targetFullVocalSections.length * CREDIT_COST_TABLE.aiTtsCue;
                return bal >= need ? (
                  <span className="text-[11px] text-indigo-700 font-semibold">
                    {lang === 'th' ? `ใช้ ${need} เครดิต (คงเหลือ ${bal} Cr)` : `${need} Cr (Balance ${bal} Cr)`}
                  </span>
                ) : (
                  <span className="text-[11px] text-amber-800 bg-amber-100 border border-amber-300 rounded-md px-2 py-0.5 font-bold">
                    {lang === 'th' ? `⚠️ เครดิตไม่พอ (${bal}/${need} Cr)` : `⚠️ Insufficient (${bal}/${need} Cr)`}
                  </span>
                );
              })()}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setFullSongTtsConfirmOpen(false)}
              className="px-3 py-1.5 rounded-lg bg-white border border-indigo-200 text-indigo-700 font-semibold hover:bg-indigo-100 cursor-pointer"
            >
              {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
            </button>
            {!canAfford(targetFullVocalSections.length * CREDIT_COST_TABLE.aiTtsCue) && onOpenWallet && (
              <button
                type="button"
                onClick={() => {
                  setFullSongTtsConfirmOpen(false);
                  onOpenWallet();
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold cursor-pointer shadow-xs"
              >
                {lang === 'th' ? '💳 เติมเครดิต' : '💳 Top Up'}
              </button>
            )}
            <button
              type="button"
              disabled={
                fullSongTtsLoading ||
                Boolean(sectionTtsLoadingId) ||
                !canAfford(targetFullVocalSections.length * CREDIT_COST_TABLE.aiTtsCue)
              }
              onClick={handleGenerateFullSongAiVocals}
              className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold cursor-pointer shadow-xs"
            >
              {fullSongTtsLoading
                ? lang === 'th'
                  ? '⏳ กำลังสังเคราะห์ทุกท่อนพร้อมกัน...'
                  : '⏳ Synthesizing all sections...'
                : lang === 'th'
                  ? `ยืนยันสร้างครบทุกท่อน (${targetFullVocalSections.length * CREDIT_COST_TABLE.aiTtsCue} Cr)`
                  : `Confirm All Sections (${targetFullVocalSections.length * CREDIT_COST_TABLE.aiTtsCue} Cr)`}
            </button>
          </div>
        </div>
      )}

      {fullSongTtsStatus && (
        <div
          className={`px-4 py-2.5 rounded-2xl border text-xs flex items-center justify-between gap-2 ${
            fullSongTtsStatus.isError
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-900'
          }`}
        >
          <span className="font-medium">{fullSongTtsStatus.message}</span>
          <button
            type="button"
            onClick={() => setFullSongTtsStatus(null)}
            aria-label="Dismiss full-song vocal notice"
            className="text-current opacity-60 hover:opacity-100 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Sticky Live Lyric Strip (Phase 7E): แสดงเนื้อร้อง & คอร์ดแบบเรียลไทม์ขณะเล่นเพลง */}
      {activeFlatBar && (
        <div
          aria-label={lang === 'th' ? 'แถบเนื้อร้องสดขณะเล่น' : 'Live lyric strip'}
          className="sticky top-16 z-20 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-2xl bg-surface-1/95 backdrop-blur-md border border-accent-500/40 px-4 py-2.5 shadow-e2"
        >
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-accent-text">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-50 border border-accent-200">
                <Volume2 className="w-3 h-3 animate-pulse" />
                <span>{activeFlatBar.section.name}</span>
              </span>
              <span className="font-mono-tabular text-ink-600">
                Bar {activeGlobalBarIndex + 1}/{flatBarsMemo.length}
              </span>
              <span className="font-mono-tabular px-1.5 py-0.5 rounded-md bg-surface-2 text-ink-800 border border-hairline">
                {activeFlatBar.bar.chords
                  .slice(0, activeFlatBar.bar.chordsPerBar === 2 ? 2 : 1)
                  .map((c) => transposeChord(c, song.transposeSemitones))
                  .join(' / ')}
              </span>
            </div>
            <div className="text-sm sm:text-base font-bold text-ink-950 truncate">
              {activeFlatBar.bar.lyrics.trim() ||
                (lang === 'th' ? '♪ ดนตรีบรรเลง (Instrumental)' : '♪ Instrumental')}
            </div>
            {nextFlatBar && (
              <div className="text-[11px] text-ink-400 truncate">
                {lang === 'th' ? 'ถัดไป: ' : 'Next: '}
                {nextFlatBar.bar.lyrics.trim() || `[${nextFlatBar.section.name}]`}
              </div>
            )}
          </div>

          {onOpenKaraoke && (
            <button
              type="button"
              onClick={onOpenKaraoke}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer shrink-0 self-end sm:self-center"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>{lang === 'th' ? '🎤 คาราโอเกะเต็มจอ' : '🎤 Fullscreen Karaoke'}</span>
            </button>
          )}
        </div>
      )}

      {/* Sections List */}
      <div className="space-y-4">
        {song.sections.map((section, secIdx) => {
          const meta = SECTION_TYPE_META[section.type] || SECTION_TYPE_META.verse;
          const isInstPanelOpen =
            expandedInstrumentPanels[section.id] ?? false;
          const isSheetModeOpen = sheetModeSections[section.id] ?? false;
          const sectionStartGlobalIndex = globalBarCounter;
          const sectionEndGlobalIndex = sectionStartGlobalIndex + section.bars.length - 1;
          const isSectionLooped = Boolean(
            section.bars.length > 0 &&
              loopRange &&
              loopRange.startBar === sectionStartGlobalIndex &&
              loopRange.endBar === sectionEndGlobalIndex
          );

          // Real-Time Songwriter HUD: คำนวณงบพยางค์เฉพาะสไตล์ + ท่อนเพลง และผลตรวจสัมผัส 0 เครดิต
          const sectionBudget = getSyllableBudgetForBpm(song.bpm, song.timeSignature, {
            sectionType: section.type,
            songwriterStyle: song.songwriterStyle,
            thaiGenre: song.thaiGenre,
          });
          const nonEmptyBarsCount = section.bars.filter(
            (b) => b.lyrics.trim().length > 0
          ).length;
          const sectionRhymeStats =
            nonEmptyBarsCount >= 2
              ? validateThaiLyricCouplets(
                  section.bars.map((b) => b.lyrics),
                  {
                    bpm: song.bpm,
                    timeSignature: song.timeSignature,
                    minSyllables: sectionBudget.min,
                    maxSyllables: sectionBudget.max,
                  }
                )
              : null;
          const continuityPct = Math.round(
            (sectionRhymeStats?.chainContinuityRatio ?? 0) * 100
          );
          const weakPairsLabel = (sectionRhymeStats?.weakPairs ?? [])
            .map(([a, b]) => `${a + 1}-${b + 1}`)
            .join(', ');

          const instChips: {
            key: 'guitarRhythm' | 'guitarLead' | 'bass' | 'piano' | 'drums';
            label: string;
            enabled: boolean;
            icon: React.ReactNode;
          }[] = [
            {
              key: 'guitarRhythm',
              label: lang === 'th' ? 'ริทึ่ม' : 'Rhythm',
              enabled: Boolean(section.instruments?.guitarRhythm),
              icon: <Guitar className="w-3 h-3" />,
            },
            {
              key: 'guitarLead',
              label: lang === 'th' ? 'ลีด' : 'Lead',
              enabled: Boolean(section.instruments?.guitarLead),
              icon: <Zap className="w-3 h-3" />,
            },
            {
              key: 'bass',
              label: lang === 'th' ? 'เบส' : 'Bass',
              enabled: Boolean(section.instruments?.bass),
              icon: <Music className="w-3 h-3" />,
            },
            {
              key: 'piano',
              label: lang === 'th' ? 'เปียโน' : 'Piano',
              enabled: Boolean(section.instruments?.piano),
              icon: <Piano className="w-3 h-3" />,
            },
            {
              key: 'drums',
              label: lang === 'th' ? 'กลอง' : 'Drums',
              enabled: Boolean(section.instruments?.drums),
              icon: <Drum className="w-3 h-3" />,
            },
          ];

          return (
            <section
              key={section.id}
              className="bg-surface-1 border border-hairline rounded-2xl shadow-e1 overflow-visible transition-colors"
            >
              {/* Section Card Header */}
              <div className="px-4 py-3 border-b border-hairline flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0 basis-full sm:basis-auto sm:flex-1">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-mono-tabular font-semibold tracking-wider shrink-0 ${meta.badgeClass}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`} />
                    {meta.tag}
                  </span>

                  <input
                    type="text"
                    value={section.name}
                    onChange={(e) =>
                      handleUpdateSectionName(section.id, e.target.value)
                    }
                    className="bg-transparent text-sm sm:text-[15px] font-semibold text-ink-900 focus:outline-none focus:bg-surface-2 px-1.5 py-0.5 rounded-lg min-w-0 flex-1 sm:max-w-xs transition"
                    aria-label="Section Name"
                  />

                  <span className="inline-flex text-[11px] font-mono-tabular text-ink-400 shrink-0">
                    {section.bars.length} {lang === 'th' ? 'ห้อง' : 'bars'}
                  </span>

                  {/* Real-Time Section Rhyme & Flow Badge (0 เครดิต) */}
                  {sectionRhymeStats && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(sectionRhymeStats.chainContinuityRatio ?? 0) >= 0.67 ? (
                        <span
                          title={
                            lang === 'th'
                              ? `ความต่อเนื่องสัมผัสกลอนเพลง ${continuityPct}% (จับคู่สำเร็จ ${sectionRhymeStats.matchedPairs.length} คู่)`
                              : `Thai rhyme chain continuity ${continuityPct}%`
                          }
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold"
                        >
                          {lang === 'th'
                            ? `🔗 สัมผัสต่อเนื่อง ${continuityPct}%`
                            : `🔗 Rhyme ${continuityPct}%`}
                        </span>
                      ) : (
                        <span
                          title={
                            lang === 'th'
                              ? `แนะนำปรับคำสัมผัสช่วงห้อง: ${weakPairsLabel || 'ลองกด 🔗 สัมผัสต่อจากวรรคก่อน'}`
                              : `Check rhyme flow between bars ${weakPairsLabel}`
                          }
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-semibold"
                        >
                          {lang === 'th'
                            ? `⚠️ สัมผัสขาดวรรค ${weakPairsLabel ? `(${weakPairsLabel})` : ''}`
                            : `⚠️ Weak Rhyme ${weakPairsLabel}`}
                        </span>
                      )}

                      {(sectionRhymeStats.duplicateEndWords?.length ?? 0) > 0 && (
                        <span
                          title={
                            lang === 'th'
                              ? 'พบคำลงท้ายซ้ำกันในท่อนนี้ (แจ้งเตือนเพื่อเพิ่มความหลากหลายทางวรรณศิลป์)'
                              : 'Duplicate ending word(s) detected in this section'
                          }
                          className="inline-flex items-center px-2 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-700 text-[10px] font-medium"
                        >
                          {lang === 'th'
                            ? `คำท้ายซ้ำ: ${sectionRhymeStats.duplicateEndWords!.join(', ')}`
                            : `Dup end: ${sectionRhymeStats.duplicateEndWords!.join(', ')}`}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Intensity & Solo Mode Controls in Arranger Mode */}
                  {isArranger && (
                    <div className="hidden md:flex items-center gap-1.5 ml-1">
                      <select
                        value={section.intensity}
                        onChange={(e) =>
                          handleUpdateSectionIntensity(
                            section.id,
                            e.target.value as SectionIntensity
                          )
                        }
                        title={t.dynamicIntensity}
                        className="text-[11px] bg-surface-2 border border-hairline rounded-lg px-2 py-1 font-medium text-ink-700 focus:outline-none focus:border-accent-500 cursor-pointer"
                      >
                        <option value="low">{t.intensityLow}</option>
                        <option value="medium">{t.intensityMedium}</option>
                        <option value="high">{t.intensityHigh}</option>
                      </select>

                      {section.type === 'solo' && (
                        <button
                          type="button"
                          onClick={() => handleToggleSoloMode(section.id)}
                          className={`text-[11px] px-2 py-1 rounded-lg border font-medium transition cursor-pointer ${
                            section.soloMode === 'split-slow-fast'
                              ? 'bg-accent-50 border-accent-500 text-accent-text'
                              : 'bg-surface-2 border-hairline text-ink-700'
                          }`}
                        >
                          {section.soloMode === 'split-slow-fast'
                            ? lang === 'th'
                              ? 'ช้า → เร็ว'
                              : 'Slow → Fast'
                            : lang === 'th'
                              ? 'โซโล่ปกติ'
                              : 'Normal Solo'}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Max 3 Primary Ghost Actions + Overflow ⋯ Menu */}
                <div className="flex items-center gap-1.5 shrink-0 relative" data-studio-menu-root>
                  {(onOpenInlineAiSection || onOpenAdvanceForSection) && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          setOpenSectionMenuId(null);
                          setOpenInlineAiSectionId((cur) =>
                            cur === section.id ? null : section.id
                          );
                        }}
                        title={`✨ ${
                          lang === 'th'
                            ? 'AI ช่วยแต่งเนื้อร้องและแบ่งเนื้อเพลงท่อนนี้'
                            : 'Inline AI & Auto-split lyrics for this section'
                        }`}
                        aria-expanded={openInlineAiSectionId === section.id}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                          openInlineAiSectionId === section.id
                            ? 'bg-accent-500 text-white'
                            : 'bg-accent-50 hover:bg-accent-500 hover:text-white text-accent-text'
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">AI</span>
                      </button>

                      {openInlineAiSectionId === section.id && (
                        <div className="absolute right-0 top-full mt-1.5 z-30 w-64 sm:w-72 rounded-2xl bg-surface-1 border border-hairline shadow-e3 p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-100">
                          <button
                            type="button"
                            onClick={() => {
                              setOpenInlineAiSectionId(null);
                              if (onOpenInlineAiSection) {
                                onOpenInlineAiSection(section, 'quick');
                              } else {
                                onOpenAdvanceForSection?.(section);
                              }
                            }}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-medium text-ink-800 hover:bg-accent-50 hover:text-accent-text transition text-left cursor-pointer"
                          >
                            <span className="flex items-center gap-2">
                              <Sparkles className="w-3.5 h-3.5 text-accent-text shrink-0" />
                              <span>{t.inlineAiQuick}</span>
                            </span>
                            <span className="px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-bold shrink-0">
                              1 Cr
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setOpenInlineAiSectionId(null);
                              if (onOpenInlineAiSection) {
                                onOpenInlineAiSection(section, 'deep');
                              } else {
                                onOpenAdvanceForSection?.(section);
                              }
                            }}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-medium text-ink-800 hover:bg-accent-50 hover:text-accent-text transition text-left cursor-pointer"
                          >
                            <span className="flex items-center gap-2">
                              <Music className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                              <span>{t.inlineAiDeep}</span>
                            </span>
                            <span className="px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-700 text-[10px] font-bold shrink-0">
                              2 Cr
                            </span>
                          </button>

                          <div className="my-1 border-t border-hairline" />

                          <button
                            type="button"
                            onClick={() => {
                              setOpenInlineAiSectionId(null);
                              setSplitLyricsState({
                                sectionId: section.id,
                                rawText: section.bars
                                  .map((b) => b.lyrics)
                                  .filter(Boolean)
                                  .join('\n'),
                              });
                            }}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition text-left cursor-pointer"
                          >
                            <span className="flex items-center gap-2">
                              <Scissors className="w-3.5 h-3.5 shrink-0" />
                              <span>{t.inlineSplitLyrics}</span>
                            </span>
                            <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold shrink-0">
                              0 Cr
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      setSheetModeSections((prev) => ({
                        ...prev,
                        [section.id]: !prev[section.id],
                      }))
                    }
                    aria-pressed={isSheetModeOpen}
                    title={
                      lang === 'th'
                        ? 'สลับแก้เนื้อร้องทั้งท่อนแบบแผ่นเดียว (Sheet Mode)'
                        : 'Toggle Sheet Lyric Editor for this section'
                    }
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer ${
                      isSheetModeOpen
                        ? 'bg-accent-50 border-accent-500 text-accent-text font-semibold'
                        : 'border-hairline bg-surface-1 hover:bg-surface-2 text-ink-700'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span className="hidden lg:inline">
                      {lang === 'th' ? '📝 แก้แบบแผ่นเดียว' : '📝 Sheet'}
                    </span>
                  </button>

                  {onPlaySectionOnce && section.bars.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        onPlaySectionOnce(sectionStartGlobalIndex, sectionEndGlobalIndex, song)
                      }
                      title={
                        lang === 'th'
                          ? 'เล่นเฉพาะท่อนนี้ 1 รอบแล้วหยุดอัตโนมัติ (0 เครดิต)'
                          : 'Play this section once and stop automatically'
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-800 text-xs font-medium transition cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">
                        {lang === 'th' ? '▶ เล่นท่อนนี้' : '▶ Play Section'}
                      </span>
                    </button>
                  )}

                  {onToggleLoopRange && section.bars.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (isSectionLooped) {
                          onToggleLoopRange(null);
                        } else {
                          const nextRange = {
                            startBar: sectionStartGlobalIndex,
                            endBar: sectionEndGlobalIndex,
                          };
                          onToggleLoopRange(nextRange);
                          const isOutsideSection =
                            activeGlobalBarIndex < sectionStartGlobalIndex ||
                            activeGlobalBarIndex > sectionEndGlobalIndex;
                          if (isOutsideSection) {
                            onPlayBarFromIndex?.(sectionStartGlobalIndex, song);
                          }
                        }
                      }}
                      aria-pressed={isSectionLooped}
                      title={
                        isSectionLooped
                          ? lang === 'th'
                            ? 'คลิกเพื่อยกเลิกวนลูปท่อนนี้'
                            : 'Stop looping this section'
                          : lang === 'th'
                            ? 'เปิดวนลูปและเริ่มเล่นท่อนนี้ทันที'
                            : 'Loop and play this section immediately'
                      }
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer ${
                        isSectionLooped
                          ? 'bg-indigo-600 border-indigo-600 text-white font-semibold shadow-2xs'
                          : 'border-hairline bg-surface-1 hover:bg-surface-2 text-ink-700'
                      }`}
                    >
                      <Repeat className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">
                        {lang === 'th' ? '🔁 ลูปท่อนนี้' : '🔁 Loop'}
                      </span>
                    </button>
                  )}

                  {nonEmptyBarsCount > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleToggleSpeakSection(section)}
                        aria-pressed={speakingSectionId === section.id}
                        title={
                          lang === 'th'
                            ? 'อ่านเนื้อร้องทั้งท่อนด้วยเสียงในเบราว์เซอร์ตาม BPM (0 เครดิต)'
                            : 'Speak section lyrics via browser Web Speech API (0 Credits)'
                        }
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer ${
                          speakingSectionId === section.id
                            ? 'bg-amber-500 border-amber-500 text-white font-semibold'
                            : 'border-hairline bg-surface-1 hover:bg-surface-2 text-ink-700'
                        }`}
                      >
                        {speakingSectionId === section.id ? (
                          <Square className="w-3 h-3" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" />
                        )}
                        <span className="hidden xl:inline">
                          {speakingSectionId === section.id
                            ? lang === 'th'
                              ? 'หยุดอ่าน'
                              : 'Stop Read'
                            : lang === 'th'
                              ? '🗣️ อ่านเนื้อท่อนนี้ (0 Cr)'
                              : '🗣️ Read Section (0 Cr)'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setSectionTtsConfirmId((cur) =>
                            cur === section.id ? null : section.id
                          )
                        }
                        aria-expanded={sectionTtsConfirmId === section.id}
                        disabled={sectionTtsLoadingId === section.id}
                        title={
                          lang === 'th'
                            ? 'สร้างเสียงร้องไกด์ AI ด้วย gemini-3.8-flash-tts แล้วบันทึกเข้า Vocal Takes ท่อนนี้ (2 เครดิต)'
                            : 'Generate AI singing guide via gemini-3.8-flash-tts & save to Vocal Takes (2 Credits)'
                        }
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer disabled:opacity-50 ${
                          sectionTtsConfirmId === section.id
                            ? 'bg-indigo-600 border-indigo-600 text-white font-semibold'
                            : 'border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-800'
                        }`}
                      >
                        {sectionTtsLoadingId === section.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Mic className="w-3.5 h-3.5" />
                        )}
                        <span className="hidden xl:inline">
                          {lang === 'th'
                            ? `🎙️ เสียงร้องไกด์ AI (${CREDIT_COST_TABLE.aiTtsCue} Cr)`
                            : `🎙️ AI Guide Vocal (${CREDIT_COST_TABLE.aiTtsCue} Cr)`}
                        </span>
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => onOpenPresetsModal(section.id, section.name)}
                    title={t.chordPresets}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-hairline bg-surface-1 hover:bg-surface-2 text-ink-700 text-xs font-medium transition cursor-pointer"
                  >
                    <ListMusic className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{t.chordPresets}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddBar(section.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-hairline bg-surface-1 hover:bg-surface-2 text-ink-900 text-xs font-medium transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t.addBar}</span>
                  </button>

                  {/* Section Overflow Menu ⋯ (Duplicate, Move Up, Move Down, Delete) */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setOpenSectionMenuId((prev) =>
                          prev === section.id ? null : section.id
                        );
                        setOpenBarPopoverId(null);
                      }}
                      aria-label="Section actions"
                      className="p-1.5 rounded-lg border border-hairline bg-surface-1 hover:bg-surface-2 text-ink-700 transition cursor-pointer"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>

                    {openSectionMenuId === section.id && (
                      <div className="absolute right-0 mt-1.5 w-44 rounded-xl bg-surface-1 border border-hairline shadow-e3 p-1.5 z-30 space-y-0.5">
                        <button
                          type="button"
                          onClick={() => handleDuplicateSection(section.id)}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-ink-900 hover:bg-surface-2 transition text-left cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5 text-ink-400" />
                          <span>{t.duplicateSection}</span>
                        </button>
                        <button
                          type="button"
                          disabled={secIdx === 0}
                          onClick={() => handleMoveSection(secIdx, 'up')}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-ink-900 hover:bg-surface-2 disabled:opacity-40 disabled:pointer-events-none transition text-left cursor-pointer"
                        >
                          <ArrowUp className="w-3.5 h-3.5 text-ink-400" />
                          <span>{lang === 'th' ? 'ย้ายขึ้น' : 'Move Up'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={secIdx === song.sections.length - 1}
                          onClick={() => handleMoveSection(secIdx, 'down')}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-ink-900 hover:bg-surface-2 disabled:opacity-40 disabled:pointer-events-none transition text-left cursor-pointer"
                        >
                          <ArrowDown className="w-3.5 h-3.5 text-ink-400" />
                          <span>{lang === 'th' ? 'ย้ายลง' : 'Move Down'}</span>
                        </button>
                        <div className="my-1 border-t border-hairline" />
                        <button
                          type="button"
                          disabled={song.sections.length <= 1}
                          onClick={() => handleDeleteSection(section.id)}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-rec-500 hover:bg-surface-2 disabled:opacity-40 disabled:pointer-events-none transition text-left cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{t.delete}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Instrument Summary & Toggle Strip */}
              <div className="px-4 py-2 bg-surface-2/60 border-b border-hairline flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-medium text-ink-400 mr-1">
                    {t.activeInstrumentsLabel}
                  </span>
                  {instChips.map((chip) => (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={() => toggleSectionInstrument(section.id, chip.key)}
                      title={
                        chip.enabled
                          ? lang === 'th'
                            ? 'คลิกเพื่อปิดเสียงในท่อนนี้'
                            : 'Click to mute in section'
                          : lang === 'th'
                            ? 'คลิกเพื่อเปิดเสียงในท่อนนี้'
                            : 'Click to enable in section'
                      }
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border transition cursor-pointer ${
                        chip.enabled
                          ? 'bg-accent-50 border-accent-200 text-accent-text'
                          : 'bg-surface-1 border-hairline text-ink-400 opacity-70 hover:opacity-100'
                      }`}
                    >
                      {chip.icon}
                      <span>{chip.label}</span>
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => toggleSectionInstrumentPanel(section.id)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition cursor-pointer ${
                      isInstPanelOpen
                        ? 'bg-accent-50 border-accent-500 text-accent-text'
                        : 'bg-surface-1 border-hairline text-ink-700 hover:bg-surface-2'
                    }`}
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                    <span>
                      {isInstPanelOpen ? t.collapseInstruments : t.expandInstruments}
                    </span>
                    {isInstPanelOpen ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </button>

                  {!isArranger && onSwitchToArranger && (
                    <button
                      type="button"
                      onClick={onSwitchToArranger}
                      title={t.openArrangerHint}
                      className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-surface-1 border border-hairline text-ink-700 hover:text-accent-text hover:bg-surface-2 transition cursor-pointer"
                    >
                      <Layers className="w-3 h-3" />
                      <span>{t.openArrangerBtn}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* AI Singing Guide Confirmation Popover & Status Notice (Phase 7E) */}
              {sectionTtsConfirmId === section.id && nonEmptyBarsCount > 0 && (
                <div className="px-4 py-3 bg-indigo-50/90 border-b border-indigo-200 flex flex-col gap-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-bold text-indigo-950 flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5 text-indigo-600" />
                      <span>
                        {lang === 'th'
                          ? `ยืนยันสร้างเสียงร้องไกด์ AI ท่อน ${section.name} (gemini-3.8-flash-tts · ${CREDIT_COST_TABLE.aiTtsCue} เครดิต)`
                          : `Confirm AI Singing Guide for ${section.name} (gemini-3.8-flash-tts · ${CREDIT_COST_TABLE.aiTtsCue} Credits)`}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label htmlFor={`section-tts-voice-${section.id}`} className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-900">
                        <span>{lang === 'th' ? 'เสียงนักร้อง:' : 'Voice:'}</span>
                        <select
                          id={`section-tts-voice-${section.id}`}
                          name="sectionTtsVoice"
                          value={sectionTtsVoice}
                          onChange={(e) =>
                            setSectionTtsVoice(
                              e.target.value as 'Kore' | 'Aoede' | 'Puck' | 'Charon' | 'Fenrir'
                            )
                          }
                          className="px-2 py-1 rounded-lg bg-white border border-indigo-200 text-indigo-950 text-[11px] font-semibold"
                        >
                          <option value="Kore">Kore ({lang === 'th' ? 'หญิง อบอุ่น' : 'Female Warm'})</option>
                          <option value="Aoede">Aoede ({lang === 'th' ? 'หญิง ใสโปร่ง' : 'Female Bright'})</option>
                          <option value="Puck">Puck ({lang === 'th' ? 'วัยรุ่น สดใส' : 'Youthful'})</option>
                          <option value="Charon">Charon ({lang === 'th' ? 'ชาย นุ่มลึก' : 'Male Deep'})</option>
                          <option value="Fenrir">Fenrir ({lang === 'th' ? 'ชาย หนักแน่น' : 'Male Rock'})</option>
                        </select>
                      </label>
                      {(() => {
                        const bal = getCreditBalance();
                        const need = CREDIT_COST_TABLE.aiTtsCue;
                        return bal >= need ? (
                          <span className="text-[11px] text-indigo-700 font-medium">
                            {lang === 'th'
                              ? `คงเหลือ ${bal} Cr · ไม่คิดเงินหากจำลอง`
                              : `Balance ${bal} Cr · Free if simulated`}
                          </span>
                        ) : (
                          <span className="text-[11px] text-amber-800 bg-amber-100 border border-amber-300 rounded-md px-2 py-0.5 font-bold">
                            {lang === 'th'
                              ? `⚠️ เครดิตไม่พอ (${bal}/${need} Cr)`
                              : `⚠️ Insufficient (${bal}/${need} Cr)`}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[11px] text-indigo-800 bg-white/80 border border-indigo-200/80 rounded-xl px-3 py-1.5 flex-1 min-w-[200px]">
                      {(() => {
                        const ttsPlan = buildSectionTtsTextPlan(section.bars, 240);
                        return (
                          <>
                            <span className="font-medium">&ldquo;{ttsPlan.text}&rdquo;</span>
                            <span className="ml-2 text-indigo-500 font-mono-tabular">
                              ({ttsPlan.text.length}/240)
                            </span>
                            {ttsPlan.wasTruncated && (
                              <span className="ml-2 text-amber-700 font-semibold">
                                {lang === 'th'
                                  ? `• ตัดพอดีวรรค (ข้าม ${ttsPlan.omittedBarsCount} ห้องท้ายที่เกิน 240 ตัวอักษร)`
                                  : `• Trimmed cleanly on bar boundary (${ttsPlan.omittedBarsCount} trailing bar(s) omitted)`}
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setSectionTtsConfirmId(null)}
                        className="px-3 py-1.5 rounded-lg bg-white border border-indigo-200 text-indigo-700 font-semibold hover:bg-indigo-100 cursor-pointer"
                      >
                        {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
                      </button>
                      {!canAfford(CREDIT_COST_TABLE.aiTtsCue) && onOpenWallet && (
                        <button
                          type="button"
                          onClick={() => {
                            setSectionTtsConfirmId(null);
                            onOpenWallet();
                          }}
                          className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold cursor-pointer shadow-xs"
                        >
                          {lang === 'th' ? '💳 เติมเครดิต' : '💳 Top Up'}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={sectionTtsLoadingId === section.id || !canAfford(CREDIT_COST_TABLE.aiTtsCue)}
                        onClick={() =>
                          handleGenerateSectionAiVocal(
                            section,
                            sectionStartGlobalIndex,
                            sectionEndGlobalIndex
                          )
                        }
                        className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold cursor-pointer shadow-xs"
                      >
                        {sectionTtsLoadingId === section.id
                          ? lang === 'th'
                            ? '⏳ กำลังสร้าง...'
                            : '⏳ Synthesizing...'
                          : lang === 'th'
                            ? `ยืนยัน (${CREDIT_COST_TABLE.aiTtsCue} เครดิต)`
                            : `Confirm (${CREDIT_COST_TABLE.aiTtsCue} Cr)`}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {sectionTtsNotice[section.id] && (
                <div
                  className={`px-4 py-2 border-b text-xs flex flex-wrap items-center justify-between gap-2 ${
                    sectionTtsNotice[section.id].isError
                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  }`}
                >
                  <span className="font-medium">{sectionTtsNotice[section.id].message}</span>
                  <div className="flex items-center gap-2">
                    {sectionTtsNotice[section.id].audioUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          const url = sectionTtsNotice[section.id]?.audioUrl;
                          if (!url) return;
                          sectionTtsAudioRef.current?.pause();
                          sectionTtsAudioRef.current = playAudioDataUrl(url);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white border border-emerald-300 text-emerald-800 text-[11px] font-semibold hover:bg-emerald-100 cursor-pointer"
                      >
                        {lang === 'th' ? '🔊 ฟังเสียงร้องไกด์ซ้ำ' : '🔊 Replay AI Guide'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setSectionTtsNotice((prev) => {
                          const next = { ...prev };
                          delete next[section.id];
                          return next;
                        })
                      }
                      aria-label="Dismiss notification"
                      className="text-current opacity-60 hover:opacity-100 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Expanded Per-Section 5-Instrument Arranger Panel */}
              {isInstPanelOpen && (
                <div className="p-3.5 bg-surface-2/80 border-b border-hairline">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                    {/* 1. Rhythm Guitar */}
                    <div
                      className={`p-2.5 rounded-xl border flex flex-col gap-1.5 transition ${
                        section.instruments?.guitarRhythm
                          ? 'bg-surface-1 border-hairline shadow-e1'
                          : 'bg-surface-2/50 border-hairline opacity-65'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-ink-900 flex items-center gap-1.5">
                          <Guitar className="w-3.5 h-3.5 text-accent-text" />
                          {lang === 'th' ? 'ริทึ่ม (คอร์ด)' : 'Rhythm Guitar'}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            toggleSectionInstrument(section.id, 'guitarRhythm')
                          }
                          className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition cursor-pointer ${
                            section.instruments?.guitarRhythm
                              ? 'bg-accent-500 text-white'
                              : 'bg-surface-inset text-ink-400'
                          }`}
                        >
                          {section.instruments?.guitarRhythm
                            ? lang === 'th'
                              ? 'เปิด'
                              : 'ON'
                            : lang === 'th'
                              ? 'ปิด'
                              : 'OFF'}
                        </button>
                      </div>
                      {section.instruments?.guitarRhythm ? (
                        <>
                          <select
                            value={
                              section.instruments?.guitarRhythmStyle ||
                              song.mixer.guitarRhythm.style ||
                              'campfire-strum'
                            }
                            onChange={(e) =>
                              updateSectionInstrumentStyle(
                                section.id,
                                'guitarRhythmStyle',
                                e.target.value
                              )
                            }
                            className="w-full text-[11px] bg-surface-2 border border-hairline rounded-lg px-2 py-1 font-medium text-ink-900 focus:outline-none focus:border-accent-500"
                          >
                            <option value="campfire-strum">
                              {lang === 'th' ? 'ตีคอร์ดแคมป์ไฟ' : 'Campfire Strum'}
                            </option>
                            <option value="soft-strum">
                              {lang === 'th' ? 'ตีคอร์ดนุ่มนวล' : 'Soft Strum'}
                            </option>
                            <option value="fingerpicking">
                              {lang === 'th' ? 'เกาสายอะคูสติก' : 'Fingerpicking'}
                            </option>
                            <option value="lukthung-bounce">
                              {lang === 'th' ? 'กระแทกขัดจังหวะลูกทุ่ง (Chop)' : 'Luk Thung Chop'}
                            </option>
                            <option value="rock-power">
                              {lang === 'th' ? 'ตีร็อกสับสายหนักแน่น (Rock Chug)' : 'Rock Power Chug'}
                            </option>
                          </select>
                          {renderSectionVolumeSlider(
                            section.id,
                            'guitarRhythmVolume',
                            section.instruments?.guitarRhythmVolume
                          )}
                        </>
                      ) : (
                        <div className="text-[10px] text-ink-400 py-1 text-center font-medium">
                          {lang === 'th' ? 'ปิดเสียงในท่อนนี้' : 'Muted in this section'}
                        </div>
                      )}
                    </div>

                    {/* 2. Lead Guitar */}
                    <div
                      className={`p-2.5 rounded-xl border flex flex-col gap-1.5 transition ${
                        section.instruments?.guitarLead
                          ? 'bg-surface-1 border-hairline shadow-e1'
                          : 'bg-surface-2/50 border-hairline opacity-65'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-ink-900 flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-accent-text" />
                          {lang === 'th' ? 'ลีด (Les Paul)' : 'Lead (Les Paul)'}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            toggleSectionInstrument(section.id, 'guitarLead')
                          }
                          className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition cursor-pointer ${
                            section.instruments?.guitarLead
                              ? 'bg-accent-500 text-white'
                              : 'bg-surface-inset text-ink-400'
                          }`}
                        >
                          {section.instruments?.guitarLead
                            ? lang === 'th'
                              ? 'เปิด'
                              : 'ON'
                            : lang === 'th'
                              ? 'ปิด'
                              : 'OFF'}
                        </button>
                      </div>
                      {section.instruments?.guitarLead ? (
                        <div className="space-y-1 flex-1 flex flex-col">
                          <select
                            value={
                              section.instruments?.guitarLeadStyle || 'melodic-solo'
                            }
                            onChange={(e) =>
                              updateSectionInstrumentStyle(
                                section.id,
                                'guitarLeadStyle',
                                e.target.value
                              )
                            }
                            className="w-full text-[11px] bg-surface-2 border border-hairline rounded-lg px-2 py-1 font-medium text-ink-900 focus:outline-none focus:border-accent-500"
                          >
                            <option value="melodic-solo">
                              {lang === 'th' ? 'โซโล่ทำนอง (Solo)' : 'Melodic Solo'}
                            </option>
                            <option value="riff-fills">
                              {lang === 'th' ? 'หยอดลูกส่ง (Riff Fills)' : 'Riff Fills'}
                            </option>
                            <option value="soft-arpeggio">
                              {lang === 'th' ? 'เกาโน้ตสูงคลอ (Arp)' : 'Soft Arpeggio'}
                            </option>
                          </select>
                          <select
                            value={
                              (section.instruments?.guitarLeadDrive ||
                                song.mixer.guitarLead.drive ||
                                'overdrive') === 'fuzz'
                                ? 'distortion'
                                : section.instruments?.guitarLeadDrive ||
                                  song.mixer.guitarLead.drive ||
                                  'overdrive'
                            }
                            onChange={(e) =>
                              updateSectionInstrumentStyle(
                                section.id,
                                'guitarLeadDrive',
                                e.target.value
                              )
                            }
                            className="w-full text-[10px] bg-surface-2 border border-hairline rounded-lg px-2 py-0.5 font-medium text-ink-700 focus:outline-none focus:border-accent-500"
                            title="Overdrive / Tone"
                          >
                            <option value="clean">
                              {lang === 'th' ? 'คลีนหวาน (Clean)' : 'Clean'}
                            </option>
                            <option value="crunch">
                              {lang === 'th' ? 'ครันช์เบา (Crunch)' : 'Crunch'}
                            </option>
                            <option value="overdrive">
                              {lang === 'th'
                                ? 'แตกอุ่น (Warm Overdrive)'
                                : 'Warm Overdrive'}
                            </option>
                            <option value="distortion">
                              {lang === 'th'
                                ? 'แตกหนัก (Distortion / Fuzz)'
                                : 'Distortion / Fuzz'}
                            </option>
                          </select>
                          {renderSectionVolumeSlider(
                            section.id,
                            'guitarLeadVolume',
                            section.instruments?.guitarLeadVolume
                          )}
                        </div>
                      ) : (
                        <div className="text-[10px] text-ink-400 py-1 text-center font-medium">
                          {lang === 'th' ? 'ปิดเสียงในท่อนนี้' : 'Muted in this section'}
                        </div>
                      )}
                    </div>

                    {/* 3. Bass */}
                    <div
                      className={`p-2.5 rounded-xl border flex flex-col gap-1.5 transition ${
                        section.instruments?.bass
                          ? 'bg-surface-1 border-hairline shadow-e1'
                          : 'bg-surface-2/50 border-hairline opacity-65'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-ink-900 flex items-center gap-1.5">
                          <Music className="w-3.5 h-3.5 text-accent-text" />
                          {lang === 'th' ? 'เบสโปร่ง' : 'Acoustic Bass'}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleSectionInstrument(section.id, 'bass')}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition cursor-pointer ${
                            section.instruments?.bass
                              ? 'bg-accent-500 text-white'
                              : 'bg-surface-inset text-ink-400'
                          }`}
                        >
                          {section.instruments?.bass
                            ? lang === 'th'
                              ? 'เปิด'
                              : 'ON'
                            : lang === 'th'
                              ? 'ปิด'
                              : 'OFF'}
                        </button>
                      </div>
                      {section.instruments?.bass ? (
                        <>
                          <select
                            value={section.instruments?.bassStyle || 'root-fifth'}
                            onChange={(e) =>
                              updateSectionInstrumentStyle(
                                section.id,
                                'bassStyle',
                                e.target.value
                              )
                            }
                            className="w-full text-[11px] bg-surface-2 border border-hairline rounded-lg px-2 py-1 font-medium text-ink-900 focus:outline-none focus:border-accent-500"
                          >
                            <option value="root-fifth">
                              {lang === 'th'
                                ? 'Root-5th สลับจังหวะ'
                                : 'Root-5th Alternate'}
                            </option>
                            <option value="warm-sustain">
                              {lang === 'th'
                                ? 'ลากยาวอุ่นๆ (Sustain)'
                                : 'Warm Sustain'}
                            </option>
                            <option value="lukthung-groove">
                              {lang === 'th'
                                ? 'เบสเด้งลูกทุ่ง (3-Cha)'
                                : 'Luk Thung Bounce'}
                            </option>
                            <option value="rnb-syncopated">
                              {lang === 'th'
                                ? 'เบส R&B ขัดจังหวะ'
                                : 'R&B Syncopated'}
                            </option>
                          </select>
                          {renderSectionVolumeSlider(
                            section.id,
                            'bassVolume',
                            section.instruments?.bassVolume
                          )}
                        </>
                      ) : (
                        <div className="text-[10px] text-ink-400 py-1 text-center font-medium">
                          {lang === 'th' ? 'ปิดเสียงในท่อนนี้' : 'Muted in this section'}
                        </div>
                      )}
                    </div>

                    {/* 4. Piano */}
                    <div
                      className={`p-2.5 rounded-xl border flex flex-col gap-1.5 transition ${
                        section.instruments?.piano
                          ? 'bg-surface-1 border-hairline shadow-e1'
                          : 'bg-surface-2/50 border-hairline opacity-65'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-ink-900 flex items-center gap-1.5">
                          <Piano className="w-3.5 h-3.5 text-accent-text" />
                          {lang === 'th' ? 'เปียโน' : 'Piano'}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleSectionInstrument(section.id, 'piano')}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition cursor-pointer ${
                            section.instruments?.piano
                              ? 'bg-accent-500 text-white'
                              : 'bg-surface-inset text-ink-400'
                          }`}
                        >
                          {section.instruments?.piano
                            ? lang === 'th'
                              ? 'เปิด'
                              : 'ON'
                            : lang === 'th'
                              ? 'ปิด'
                              : 'OFF'}
                        </button>
                      </div>
                      {section.instruments?.piano ? (
                        <>
                          <select
                            value={section.instruments?.pianoStyle || 'warm-pad'}
                            onChange={(e) =>
                              updateSectionInstrumentStyle(
                                section.id,
                                'pianoStyle',
                                e.target.value
                              )
                            }
                            className="w-full text-[11px] bg-surface-2 border border-hairline rounded-lg px-2 py-1 font-medium text-ink-900 focus:outline-none focus:border-accent-500"
                          >
                            <option value="warm-pad">
                              {lang === 'th'
                                ? 'คอร์ดปูพื้น (Warm Pad)'
                                : 'Warm Pad'}
                            </option>
                            <option value="gentle-arpeggio">
                              {lang === 'th'
                                ? 'พรมนิ้วเบาๆ (Arp)'
                                : 'Gentle Arpeggio'}
                            </option>
                            <option value="rnb-neo-chord">
                              {lang === 'th'
                                ? 'คอร์ด Neo-Soul 9th'
                                : 'R&B Neo-Soul 9th'}
                            </option>
                            <option value="rock-organ-pad">
                              {lang === 'th'
                                ? 'ออร์แกนร็อกอุ้มซาวด์'
                                : 'Rock Organ Pad'}
                            </option>
                          </select>
                          {renderSectionVolumeSlider(
                            section.id,
                            'pianoVolume',
                            section.instruments?.pianoVolume
                          )}
                        </>
                      ) : (
                        <div className="text-[10px] text-ink-400 py-1 text-center font-medium">
                          {lang === 'th' ? 'ปิดเสียงในท่อนนี้' : 'Muted in this section'}
                        </div>
                      )}
                    </div>

                    {/* 5. Drums */}
                    <div
                      className={`p-2.5 rounded-xl border flex flex-col gap-1.5 transition ${
                        section.instruments?.drums
                          ? 'bg-surface-1 border-hairline shadow-e1'
                          : 'bg-surface-2/50 border-hairline opacity-65'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-ink-900 flex items-center gap-1.5">
                          <Drum className="w-3.5 h-3.5 text-accent-text" />
                          {lang === 'th' ? 'เพอร์คัชชัน' : 'Drums & Cajon'}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleSectionInstrument(section.id, 'drums')}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition cursor-pointer ${
                            section.instruments?.drums
                              ? 'bg-accent-500 text-white'
                              : 'bg-surface-inset text-ink-400'
                          }`}
                        >
                          {section.instruments?.drums
                            ? lang === 'th'
                              ? 'เปิด'
                              : 'ON'
                            : lang === 'th'
                              ? 'ปิด'
                              : 'OFF'}
                        </button>
                      </div>
                      {section.instruments?.drums ? (
                        <>
                          <select
                            value={section.instruments?.drumsStyle || 'shaker-cajon'}
                            onChange={(e) =>
                              updateSectionInstrumentStyle(
                                section.id,
                                'drumsStyle',
                                e.target.value
                              )
                            }
                            className="w-full text-[11px] bg-surface-2 border border-hairline rounded-lg px-2 py-1 font-medium text-ink-900 focus:outline-none focus:border-accent-500"
                          >
                            <option value="shaker-cajon">Shaker & Cajon</option>
                            <option value="simple-kit">
                              {lang === 'th' ? 'กลองชุดเรียบๆ (Kit)' : 'Simple Kit'}
                            </option>
                            <option value="lukthung-3cha">
                              {lang === 'th' ? 'กลองลูกทุ่ง/สามช่า (3-Cha)' : 'Luk Thung 3-Cha'}
                            </option>
                            <option value="rnb-pocket">
                              {lang === 'th' ? 'กลอง R&B นุ่มลึก (Pocket)' : 'R&B Pocket'}
                            </option>
                            <option value="rock-drive">
                              {lang === 'th' ? 'กลองร็อกแน่นๆ (Rock Drive)' : 'Rock Drive'}
                            </option>
                          </select>
                          {renderSectionVolumeSlider(
                            section.id,
                            'drumsVolume',
                            section.instruments?.drumsVolume
                          )}
                        </>
                      ) : (
                        <div className="text-[10px] text-ink-400 py-1 text-center font-medium">
                          {lang === 'th' ? 'ปิดเสียงในท่อนนี้' : 'Muted in this section'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Inline Free 0-Credit Paste & Auto-Split Lyrics Helper */}
              {splitLyricsState?.sectionId === section.id && (
                <div className="px-4 py-3 bg-emerald-50/70 border-b border-emerald-200 space-y-2.5 animate-in fade-in">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-emerald-950 flex items-center gap-1.5">
                      <Scissors className="w-3.5 h-3.5 text-emerald-700" />
                      <span>{t.inlineSplitLyrics}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setSplitLyricsState(null)}
                      className="p-1 rounded-lg text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                      aria-label={t.cancel}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-[11px] text-emerald-900/80">
                    {lang === 'th'
                      ? 'วางเนื้อร้องหลายบรรทัด (ขึ้นบรรทัดใหม่ หรือคั่นด้วย /) ระบบจะแบ่งลงห้องให้อัตโนมัติ โดยคงคอร์ด เมโลดี้ และเสียงร้องเดิมไว้ครบ'
                      : 'Paste multi-line or slash-separated (/) lyrics below to distribute them across bars cleanly while preserving chords, melody, and vocal recordings.'}
                  </p>
                  <textarea
                    rows={3}
                    value={splitLyricsState.rawText}
                    onChange={(e) =>
                      setSplitLyricsState((cur) =>
                        cur ? { ...cur, rawText: e.target.value } : null
                      )
                    }
                    placeholder={
                      lang === 'th'
                        ? 'แสงแดดอุ่นตอนเช้า\nแก้วกาแฟริมหน้าต่าง\nฝากลมช่วยบอกเธอ\nว่ายังรออยู่ที่เดิม'
                        : 'Morning sunlight on the floor\nWarm coffee by the window\nSending whispers in the breeze'
                    }
                    className="w-full px-3 py-2 rounded-xl bg-white border border-emerald-300 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setSplitLyricsState(null)}
                      className="px-3 py-1.5 rounded-lg bg-white border border-hairline text-xs font-medium text-ink-600 hover:bg-surface-2 cursor-pointer"
                    >
                      {t.cancel}
                    </button>
                    <button
                      type="button"
                      disabled={!splitLyricsState.rawText.trim()}
                      onClick={() => {
                        const updatedBars = splitLyricsToSectionBars(
                          splitLyricsState.rawText,
                          section.bars
                        );
                        onUpdateSong((prev) => ({
                          ...prev,
                          updatedAt: new Date().toISOString(),
                          sections: prev.sections.map((s) =>
                            s.id === section.id ? { ...s, bars: updatedBars } : s
                          ),
                        }));
                        setSplitLyricsState(null);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                    >
                      <Scissors className="w-3.5 h-3.5" />
                      <span>
                        {lang === 'th'
                          ? 'แบ่งลงห้องทันที (0 เครดิต)'
                          : 'Split Into Bars (0 Credits)'}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* Sheet Lyric Editor Mode (แก้เนื้อร้องทั้งท่อนแบบแผ่นเดียว 1 บรรทัด = 1 ห้อง) */}
              {isSheetModeOpen && (
                <div className="mx-4 mt-3.5 rounded-2xl border border-accent-200 bg-accent-50/40 p-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-ink-900">
                      <FileText className="w-3.5 h-3.5 text-accent-text" />
                      <span>
                        {lang === 'th'
                          ? `📝 แก้แบบแผ่นเดียว (${section.bars.length} บรรทัด = ${section.bars.length} ห้อง)`
                          : `📝 Sheet Lyric Editor (${section.bars.length} lines = ${section.bars.length} bars)`}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono-tabular text-ink-500">
                      {lang === 'th'
                        ? `เป้าหมายงบพยางค์: ${sectionBudget.min}-${sectionBudget.max} พยางค์/ห้อง`
                        : `Target: ${sectionBudget.min}-${sectionBudget.max} syl/bar`}
                    </span>
                  </div>
                  <textarea
                    rows={Math.max(section.bars.length, 3)}
                    value={section.bars.map((b) => b.lyrics).join('\n')}
                    onChange={(e) => {
                      const rawLines = e.target.value.split(/\r?\n/);
                      const updatedBars = section.bars.map((bar, idx) => {
                        if (idx === section.bars.length - 1 && rawLines.length > section.bars.length) {
                          return {
                            ...bar,
                            lyrics: rawLines.slice(idx).join(' '),
                          };
                        }
                        return {
                          ...bar,
                          lyrics: rawLines[idx] ?? '',
                        };
                      });
                      onUpdateSong((prev) => ({
                        ...prev,
                        updatedAt: new Date().toISOString(),
                        sections: prev.sections.map((s) =>
                          s.id === section.id ? { ...s, bars: updatedBars } : s
                        ),
                      }));
                    }}
                    placeholder={
                      lang === 'th'
                        ? 'พิมพ์เนื้อเพลงเรียงลงทีละบรรทัด (1 บรรทัด = 1 ห้อง)...'
                        : 'Type 1 line per bar...'
                    }
                    aria-label={`${section.name} Sheet Lyrics`}
                    className="w-full rounded-xl bg-surface-1 border border-hairline px-3 py-2.5 text-sm leading-7 text-ink-900 focus:outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-200 resize-y"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {section.bars.map((b, bIdx) => {
                      const cnt = countThaiEnglishSyllables(b.lyrics);
                      const slot = sectionBudget.barBudgets?.[bIdx];
                      const bMin = slot?.min ?? sectionBudget.min;
                      const bMax = slot?.max ?? sectionBudget.max;
                      return (
                        <span
                          key={b.id}
                          title={slot?.role ?? sectionBudget.guidance}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono-tabular font-semibold border ${
                            cnt > bMax
                              ? 'bg-amber-50 border-amber-200 text-amber-800'
                              : cnt >= bMin && cnt > 0
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                : 'bg-surface-1 border-hairline text-ink-500'
                          }`}
                        >
                          Bar {bIdx + 1}: {cnt}/{bMin}-{bMax}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Bars Grid */}
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                {section.bars.map((bar, barIndex) => {
                  const thisGlobalIndex = globalBarCounter++;
                  const isActive = activeGlobalBarIndex === thisGlobalIndex;
                  const isBarLooped = Boolean(
                    loopRange &&
                      loopRange.startBar === thisGlobalIndex &&
                      loopRange.endBar === thisGlobalIndex
                  );
                  const barSlot = sectionBudget.barBudgets?.[barIndex];
                  const barMin = barSlot?.min ?? sectionBudget.min;
                  const barMax = barSlot?.max ?? sectionBudget.max;
                  const syllableCount = countThaiEnglishSyllables(bar.lyrics);
                  const isOverBudget = syllableCount > barMax;
                  const barPhonetics =
                    bar.lyrics.trim().length > 0
                      ? analyzeThaiSyllablePhonetics(bar.lyrics)
                      : null;
                  const prevSectionLastBar =
                    secIdx > 0 && song.sections[secIdx - 1].bars.length > 0
                      ? song.sections[secIdx - 1].bars[
                          song.sections[secIdx - 1].bars.length - 1
                        ]
                      : null;
                  const prevBar =
                    barIndex > 0 ? section.bars[barIndex - 1] : prevSectionLastBar;
                  const prevHasLyrics = Boolean(prevBar?.lyrics?.trim());
                  const canShiftNextBar =
                    barIndex < section.bars.length - 1 &&
                    (bar.lyrics.trim().split(/\s+/).filter(Boolean).length >= 2 ||
                      syllableCount >= 2);
                  const prevPhonetics = prevHasLyrics
                    ? analyzeThaiSyllablePhonetics(prevBar!.lyrics)
                    : null;
                  const isRhymeOpen = openRhymeBarId === bar.id;
                  const rhymeSuggestions = isRhymeOpen && prevBar && prevPhonetics
                    ? (() => {
                        const filtered = filterThaiRhymes(prevBar.lyrics, {
                          liveness: prevPhonetics.isLiveSyllable ? 'live' : 'dead',
                        });
                        if (filtered.suggestions.length > 0) return filtered.suggestions.slice(0, 8);
                        return findThaiRhymes(prevBar.lyrics).suggestions.slice(0, 8);
                      })()
                    : [];
                  const noteCount = bar.melodyNotes?.length || 0;
                  const hasVocal = Boolean(bar.vocalAudio);
                  const isBarPopoverOpen = openBarPopoverId === bar.id;

                  return (
                    <div
                      key={bar.id}
                      ref={isActive ? activeBarRef : null}
                      className={`group relative rounded-2xl border p-3.5 flex flex-col gap-2.5 transition-all ${
                        isActive
                          ? 'bg-accent-50/70 border-accent-500 ring-2 ring-accent-200 shadow-e2'
                          : 'bg-surface-2/40 hover:bg-surface-1 border-hairline shadow-2xs'
                      }`}
                    >
                      {/* Bar Header */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs font-mono-tabular font-semibold ${
                              isActive ? 'text-accent-text' : 'text-ink-400'
                            }`}
                          >
                            {t.barLabel} {thisGlobalIndex + 1}
                          </span>
                          {bar.playStyle !== 'normal' && (
                            <span className="px-1.5 py-0.5 rounded bg-surface-2 border border-hairline text-[10px] font-medium text-ink-700">
                              {bar.playStyle === 'let-ring'
                                ? t.styleLetRing
                                : t.styleBreak}
                            </span>
                          )}
                        </div>

                        {isArranger ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                handleToggleChordsPerBar(section.id, bar.id)
                              }
                              className="px-1.5 py-0.5 rounded border border-hairline bg-surface-1 text-[10px] font-mono-tabular font-semibold text-ink-700 hover:bg-surface-2 cursor-pointer"
                            >
                              {bar.chordsPerBar}C
                            </button>
                            <select
                              value={bar.playStyle}
                              onChange={(e) =>
                                handleUpdateBarPlayStyle(
                                  section.id,
                                  bar.id,
                                  e.target.value as BarPlayStyle
                                )
                              }
                              className="text-[10px] bg-surface-1 border border-hairline rounded px-1.5 py-0.5 text-ink-700 focus:outline-none cursor-pointer"
                            >
                              <option value="normal">{t.styleNormal}</option>
                              <option value="let-ring">{t.styleLetRing}</option>
                              <option value="break">{t.styleBreak}</option>
                            </select>
                            <button
                              type="button"
                              disabled={section.bars.length <= 1}
                              onClick={() => handleDeleteBar(section.id, bar.id)}
                              className="p-1 rounded text-ink-400 hover:text-rec-500 disabled:opacity-30 cursor-pointer"
                              title={t.delete}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="relative" data-studio-menu-root>
                            <button
                              type="button"
                              onClick={() => toggleBarControlsPopover(bar.id)}
                              aria-label={t.barOptionsBtn}
                              className="p-1 rounded-lg text-ink-400 hover:text-ink-900 hover:bg-surface-2 transition cursor-pointer"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>

                            {isBarPopoverOpen && (
                              <div className="absolute right-0 top-7 w-44 rounded-xl bg-surface-1 border border-hairline shadow-e3 p-2 z-30 space-y-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleToggleChordsPerBar(section.id, bar.id)
                                  }
                                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium text-ink-900 hover:bg-surface-2 transition cursor-pointer"
                                >
                                  <span>
                                    {lang === 'th' ? 'จำนวนคอร์ด' : 'Chords'}
                                  </span>
                                  <span className="font-mono-tabular text-accent-text font-semibold">
                                    {bar.chordsPerBar === 2
                                      ? t.chordsPerBar2
                                      : t.chordsPerBar1}
                                  </span>
                                </button>

                                <div className="space-y-1 px-1">
                                  <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                                    {lang === 'th' ? 'สำเนียงห้อง' : 'Feel'}
                                  </span>
                                  <div className="grid grid-cols-3 gap-1">
                                    {(['normal', 'let-ring', 'break'] as BarPlayStyle[]).map(
                                      (st) => (
                                        <button
                                          key={st}
                                          type="button"
                                          onClick={() =>
                                            handleUpdateBarPlayStyle(
                                              section.id,
                                              bar.id,
                                              st
                                            )
                                          }
                                          className={`px-1.5 py-1 rounded text-[10px] font-medium border transition cursor-pointer ${
                                            bar.playStyle === st
                                              ? 'bg-accent-50 border-accent-500 text-accent-text'
                                              : 'bg-surface-2 border-hairline text-ink-700'
                                          }`}
                                        >
                                          {st === 'normal'
                                            ? t.styleNormal
                                            : st === 'let-ring'
                                              ? t.styleLetRing
                                              : t.styleBreak}
                                        </button>
                                      )
                                    )}
                                  </div>
                                </div>

                                <div className="border-t border-hairline pt-1">
                                  <button
                                    type="button"
                                    disabled={section.bars.length <= 1}
                                    onClick={() =>
                                      handleDeleteBar(section.id, bar.id)
                                    }
                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-rec-500 hover:bg-surface-2 disabled:opacity-40 cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>{t.delete}</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Chord Slot(s) */}
                      <div
                        className={`grid gap-1.5 ${
                          bar.chordsPerBar === 2 ? 'grid-cols-2' : 'grid-cols-1'
                        }`}
                      >
                        {(bar.chordsPerBar === 2
                          ? [bar.chords[0] || 'C', bar.chords[1] || bar.chords[0] || 'C']
                          : [bar.chords[0] || 'C']
                        ).map((rawChord, chordIdx) => {
                          const soundingChord = transposeChord(
                            rawChord,
                            song.transposeSemitones
                          );
                          const capoChord =
                            song.capoFret > 0
                              ? getCapoFingeringChord(soundingChord, song.capoFret)
                              : null;
                          const chordMoodHint = getChordEmotionalHint(
                            soundingChord,
                            lang
                          );
                          return (
                            <div key={chordIdx} className="min-w-0 space-y-1">
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenChordPicker(
                                    section.id,
                                    bar.id,
                                    chordIdx as 0 | 1,
                                    rawChord
                                  )
                                }
                                className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-surface-1 border border-hairline hover:border-accent-500 transition text-left cursor-pointer group/chord"
                              >
                                <div className="min-w-0">
                                  <span className="text-base font-bold font-mono-tabular text-ink-900 group-hover/chord:text-accent-text transition block truncate">
                                    {soundingChord}
                                  </span>
                                  {capoChord && (
                                    <span className="text-[10px] font-mono-tabular text-accent-text font-medium block">
                                      Capo {song.capoFret}: {capoChord}
                                    </span>
                                  )}
                                </div>
                                <ChevronDown className="w-3.5 h-3.5 text-ink-400 group-hover/chord:text-accent-text shrink-0 ml-1" />
                              </button>
                              {chordMoodHint && (
                                <span
                                  title={chordMoodHint}
                                  className="inline-flex items-center max-w-full px-1.5 py-0.5 rounded-md bg-accent-50/70 border border-accent-200/70 text-[10px] text-accent-text font-medium truncate"
                                >
                                  🎭 {chordMoodHint}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Auto-Grow Full Multi-Line Lyrics Box (Zero Truncation) */}
                      <AutoGrowTextarea
                        value={bar.lyrics}
                        onChange={(val) =>
                          handleUpdateBarLyrics(section.id, bar.id, val)
                        }
                        placeholder={t.lyricsPlaceholder}
                        ariaLabel={`${t.barLabel} ${thisGlobalIndex + 1} Lyrics`}
                        className="w-full bg-surface-1 border border-hairline rounded-xl px-3 py-2 text-[15px] leading-relaxed text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-200 resize-none overflow-hidden transition"
                      />

                      {/* Ending Syllable Phonology + Inline Previous-Bar Rhyme Helper + 3-Variations */}
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                        {barPhonetics && (
                          <span
                            title={barPhonetics.melodyAdvice}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50 border border-indigo-200/80 text-indigo-800 font-semibold"
                          >
                            <span>&ldquo;{barPhonetics.lastSyllable}&rdquo;</span>
                            <span>· วรรณยุกต์{barPhonetics.tone}</span>
                            <span
                              className={
                                barPhonetics.isLiveSyllable
                                  ? 'text-emerald-700'
                                  : 'text-amber-700'
                              }
                            >
                              ({barPhonetics.isLiveSyllable ? 'คำเป็น' : 'คำตาย'})
                            </span>
                          </span>
                        )}

                        {prevHasLyrics && (
                          <button
                            type="button"
                            onClick={() =>
                              setOpenRhymeBarId(isRhymeOpen ? null : bar.id)
                            }
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border font-semibold transition cursor-pointer ${
                              isRhymeOpen
                                ? 'bg-accent-500 text-white border-accent-500'
                                : 'bg-surface-1 border-hairline text-accent-text hover:bg-accent-50'
                            }`}
                          >
                            <span>
                              {lang === 'th'
                                ? '🔗 สัมผัสต่อจากวรรคก่อน'
                                : '🔗 Rhyme Prev'}
                            </span>
                          </button>
                        )}

                        {canShiftNextBar && (
                          <button
                            type="button"
                            onClick={() => {
                              const shiftedBars = shiftLastTokenToNextBar(
                                section.bars,
                                barIndex
                              );
                              onUpdateSong((prev) => ({
                                ...prev,
                                updatedAt: new Date().toISOString(),
                                sections: prev.sections.map((s) =>
                                  s.id === section.id
                                    ? { ...s, bars: shiftedBars }
                                    : s
                                ),
                              }));
                            }}
                            title={
                              lang === 'th'
                                ? 'ปัดคำ/พยางค์สุดท้ายลงไปไว้ต้นห้องถัดไป (0 เครดิต)'
                                : 'Move last word/syllable to next bar'
                            }
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-hairline bg-surface-1 hover:bg-surface-2 text-ink-700 font-semibold transition cursor-pointer"
                          >
                            <CornerDownRight className="w-2.5 h-2.5" />
                            <span>
                              {lang === 'th' ? '⤵ ปัดคำลง' : '⤵ Shift'}
                            </span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setVariationError(null);
                            setOpenVariationBarId(
                              openVariationBarId === bar.id ? null : bar.id
                            );
                          }}
                          title={
                            lang === 'th'
                              ? `สุ่ม 3 ตัวเลือกเฉพาะห้อง ${barIndex + 1} (${CREDIT_COST_TABLE.aiLyricsQuick} เครดิต)`
                              : `Generate 3 lyric options for bar ${barIndex + 1} (${CREDIT_COST_TABLE.aiLyricsQuick} Cr)`
                          }
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border font-semibold transition cursor-pointer ${
                            openVariationBarId === bar.id
                              ? 'bg-accent-500 text-white border-accent-500'
                              : 'bg-surface-1 border-accent-200 text-accent-text hover:bg-accent-50'
                          }`}
                        >
                          <Dices className="w-2.5 h-2.5" />
                          <span>
                            {lang === 'th' ? '🎲 3 ตัวเลือก' : '🎲 3 Options'}
                          </span>
                        </button>
                      </div>

                      {isRhymeOpen && prevBar && prevPhonetics && (
                        <div className="rounded-xl bg-surface-1 border border-accent-200 p-2 shadow-sm space-y-1.5 text-[11px]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-accent-text">
                              {lang === 'th'
                                ? `สัมผัสคำลงท้าย "${prevPhonetics.lastSyllable}" (${prevPhonetics.isLiveSyllable ? 'คำเป็น' : 'คำตาย'}):`
                                : `Rhymes with "${prevPhonetics.lastSyllable}":`}
                            </span>
                            <button
                              type="button"
                              onClick={() => setOpenRhymeBarId(null)}
                              className="text-ink-400 hover:text-ink-900 px-1 cursor-pointer"
                              aria-label={t.close}
                            >
                              ×
                            </button>
                          </div>
                          {rhymeSuggestions.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {rhymeSuggestions.map((word) => (
                                <button
                                  key={word}
                                  type="button"
                                  onClick={() => {
                                    const current = bar.lyrics.trim();
                                    const nextVal = current ? `${current} ${word}` : word;
                                    handleUpdateBarLyrics(section.id, bar.id, nextVal);
                                    setOpenRhymeBarId(null);
                                  }}
                                  className="px-2 py-0.5 rounded-lg bg-accent-50 hover:bg-accent-500 hover:text-white border border-accent-200 text-accent-text font-semibold transition cursor-pointer"
                                >
                                  +{word}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[10px] text-ink-400">
                              {lang === 'th'
                                ? 'ยังไม่มีคำแนะนำเฉพาะกลุ่ม — ลองเปิดหน้า AI Lyrics เพื่อวิเคราะห์สระละเอียดขึ้น'
                                : 'No exact suggestions yet — open AI Lyrics for deeper phonology matching.'}
                            </p>
                          )}
                        </div>
                      )}

                      {openVariationBarId === bar.id && (
                        <div className="rounded-xl bg-surface-1 border border-accent-300 p-2.5 shadow-sm space-y-2 text-[11px]">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="font-bold text-accent-text block truncate">
                                {lang === 'th'
                                  ? `🎲 3 ตัวเลือกเฉพาะห้อง ${barIndex + 1} (${barMin}-${barMax} พยางค์)`
                                  : `🎲 3 Options for Bar ${barIndex + 1} (${barMin}-${barMax} syllables)`}
                              </span>
                              <span className="text-[10px] text-ink-500 block truncate">
                                {getChordEmotionalHint(
                                  transposeChord(
                                    bar.chords[0] || 'C',
                                    song.transposeSemitones
                                  ),
                                  lang
                                )}
                                {prevPhonetics
                                  ? lang === 'th'
                                    ? ` · รับสัมผัส "${prevPhonetics.lastSyllable}"`
                                    : ` · Rhymes "${prevPhonetics.lastSyllable}"`
                                  : ''}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenVariationBarId(null);
                                setVariationError(null);
                              }}
                              className="text-ink-400 hover:text-ink-900 px-1 cursor-pointer shrink-0"
                              aria-label={t.close}
                            >
                              ×
                            </button>
                          </div>

                          {variationError && (
                            <div className="rounded-lg bg-red-50 border border-red-200 px-2 py-1.5 text-[10px] text-red-700 space-y-1">
                              <p>{variationError}</p>
                              {onOpenWallet && (
                                <button
                                  type="button"
                                  onClick={onOpenWallet}
                                  className="underline font-semibold text-red-800 cursor-pointer"
                                >
                                  {lang === 'th' ? 'เปิดกระเป๋าเครดิต' : 'Open Credit Wallet'}
                                </button>
                              )}
                            </div>
                          )}

                          {variationResults[bar.id]?.variations?.length ? (
                            <div className="space-y-1.5">
                              {variationResults[bar.id].variations.map((option, optIdx) => (
                                <button
                                  key={`${bar.id}-var-${optIdx}`}
                                  type="button"
                                  onClick={() => {
                                    handleUpdateBarLyrics(section.id, bar.id, option);
                                    setOpenVariationBarId(null);
                                  }}
                                  className="w-full text-left px-2.5 py-1.5 rounded-lg bg-accent-50/70 hover:bg-accent-500 hover:text-white border border-accent-200 text-ink-900 font-medium transition cursor-pointer flex items-start justify-between gap-2"
                                >
                                  <span className="leading-snug">
                                    <span className="font-mono-tabular font-bold mr-1">
                                      {optIdx + 1}.
                                    </span>
                                    {option}
                                  </span>
                                  <span className="text-[10px] font-mono-tabular opacity-75 shrink-0">
                                    {countThaiEnglishSyllables(option)}{' '}
                                    {lang === 'th' ? 'พยางค์' : 'syl'}
                                  </span>
                                </button>
                              ))}

                              <div className="flex items-center justify-between gap-2 pt-0.5 text-[10px] text-ink-500">
                                <span className="truncate">
                                  {variationResults[bar.id].isSimulated
                                    ? lang === 'th'
                                      ? 'โหมดจำลอง (0 เครดิต)'
                                      : 'Simulated (0 Cr)'
                                    : `${variationResults[bar.id].model} · 1 Cr`}
                                </span>
                                <button
                                  type="button"
                                  disabled={variationLoadingBarId === bar.id}
                                  onClick={() =>
                                    handleFetchSingleBarVariations(
                                      section,
                                      secIdx,
                                      bar,
                                      barIndex
                                    )
                                  }
                                  className="inline-flex items-center gap-1 font-semibold text-accent-text hover:underline disabled:opacity-50 cursor-pointer shrink-0"
                                >
                                  {variationLoadingBarId === bar.id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <RotateCcw className="w-3 h-3" />
                                  )}
                                  <span>
                                    {lang === 'th'
                                      ? `สุ่มใหม่ (${CREDIT_COST_TABLE.aiLyricsQuick} เครดิต)`
                                      : `Reroll (${CREDIT_COST_TABLE.aiLyricsQuick} Cr)`}
                                  </span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={variationLoadingBarId === bar.id}
                              onClick={() =>
                                handleFetchSingleBarVariations(
                                  section,
                                  secIdx,
                                  bar,
                                  barIndex
                                )
                              }
                              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-500 hover:bg-accent-600 text-white font-semibold transition disabled:opacity-60 cursor-pointer"
                            >
                              {variationLoadingBarId === bar.id ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>
                                    {lang === 'th' ? 'กำลังแต่ง 3 ตัวเลือก...' : 'Generating 3 options...'}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-3.5 h-3.5" />
                                  <span>
                                    {lang === 'th'
                                      ? `✨ สุ่ม 3 ตัวเลือก (${CREDIT_COST_TABLE.aiLyricsQuick} เครดิต)`
                                      : `✨ Generate 3 Options (${CREDIT_COST_TABLE.aiLyricsQuick} Cr)`}
                                  </span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Bar Footer: Syllable Badge + Style/Section Budget + Loop / Rhythm Preview / Melody / Vocal */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                        <div className="inline-flex items-center gap-1">
                          <span
                            title={
                              barSlot
                                ? `${barSlot.role} • ${sectionBudget.guidance}`
                                : sectionBudget.guidance
                            }
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono-tabular font-medium ${
                              isOverBudget
                                ? 'bg-amber-50 border border-amber-200 text-amber-800'
                                : 'bg-surface-2 text-ink-400'
                            }`}
                          >
                            {syllableCount} {t.syllablesCount}
                          </span>
                          <span
                            title={
                              barSlot
                                ? `${barSlot.role} (${barMin}-${barMax} พยางค์)`
                                : sectionBudget.guidance
                            }
                            className="text-[10px] font-mono-tabular text-ink-400"
                          >
                            /{barMin}-{barMax}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {onToggleLoopRange && (
                            <button
                              type="button"
                              onClick={() => {
                                if (isBarLooped) {
                                  onToggleLoopRange(null);
                                } else {
                                  onToggleLoopRange({
                                    startBar: thisGlobalIndex,
                                    endBar: thisGlobalIndex,
                                  });
                                  if (activeGlobalBarIndex !== thisGlobalIndex) {
                                    onPlayBarFromIndex?.(thisGlobalIndex, song);
                                  }
                                }
                              }}
                              aria-pressed={isBarLooped}
                              title={
                                isBarLooped
                                  ? lang === 'th'
                                    ? 'คลิกเพื่อยกเลิกวนลูปห้องนี้'
                                    : 'Stop looping bar'
                                  : lang === 'th'
                                    ? 'เปิดวนลูปและเริ่มเล่นห้องนี้ทันที'
                                    : 'Loop and play this bar immediately'
                              }
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition cursor-pointer ${
                                isBarLooped
                                  ? 'bg-indigo-600 border-indigo-600 text-white font-semibold'
                                  : 'bg-surface-1 border-hairline text-ink-700 hover:bg-surface-2'
                              }`}
                            >
                              <Repeat className="w-3 h-3" />
                              <span className="hidden sm:inline">
                                {lang === 'th' ? '🔁 ลูปห้องนี้' : 'Loop'}
                              </span>
                            </button>
                          )}

                          {onPlayBarFromIndex && bar.lyrics.trim().length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                let updatedSongForPlayback = song;
                                if (!bar.melodyNotes || bar.melodyNotes.length === 0) {
                                  const alignedNotes = generateLyricAlignedGuideMelody(
                                    bar.lyrics,
                                    bar.chords[0] || song.baseKey,
                                    {
                                      chord2:
                                        bar.chordsPerBar === 2
                                          ? bar.chords[1]
                                          : undefined,
                                      chordsPerBar: bar.chordsPerBar,
                                      sectionType: section.type,
                                      barIndex,
                                      totalBars: section.bars.length,
                                      baseKey: song.baseKey,
                                    }
                                  );
                                  updatedSongForPlayback = {
                                    ...song,
                                    updatedAt: new Date().toISOString(),
                                    sections: song.sections.map((s) =>
                                      s.id === section.id
                                        ? {
                                            ...s,
                                            bars: s.bars.map((b) =>
                                              b.id === bar.id
                                                ? { ...b, melodyNotes: alignedNotes }
                                                : b
                                            ),
                                          }
                                        : s
                                    ),
                                  };
                                  onUpdateSong(() => updatedSongForPlayback);
                                }
                                onToggleLoopRange?.({
                                  startBar: thisGlobalIndex,
                                  endBar: thisGlobalIndex,
                                });
                                onPlayBarFromIndex(
                                  thisGlobalIndex,
                                  updatedSongForPlayback
                                );
                              }}
                              title={
                                lang === 'th'
                                  ? 'สร้างไกด์เมโลดี้ตามพยางค์และเปิดลูปฟังจังหวะคำร้องทันที (0 เครดิต)'
                                  : 'Preview syllable rhythm guide loop (0 credits)'
                              }
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border border-emerald-200 bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 transition cursor-pointer"
                            >
                              <Volume2 className="w-3 h-3" />
                              <span>
                                {lang === 'th'
                                  ? '🔊 ฟังจังหวะคำร้อง'
                                  : '🔊 Rhythm'}
                              </span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              onOpenMelodyPianoRoll(
                                section.id,
                                bar.id,
                                thisGlobalIndex
                              )
                            }
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition cursor-pointer ${
                              noteCount > 0
                                ? 'bg-accent-50 border-accent-200 text-accent-text'
                                : 'bg-surface-1 border-hairline text-ink-700 hover:bg-surface-2'
                            }`}
                          >
                            <Music className="w-3 h-3" />
                            <span>
                              {noteCount > 0 ? noteCount : t.melodyNotesBtn}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              onOpenVocalRecorder(
                                section.id,
                                bar.id,
                                thisGlobalIndex
                              )
                            }
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition cursor-pointer ${
                              hasVocal
                                ? 'bg-accent-50 border-accent-200 text-accent-text'
                                : 'bg-surface-1 border-hairline text-ink-700 hover:bg-surface-2'
                            }`}
                          >
                            {hasVocal ? (
                              <span className="w-2 h-2 rounded-full bg-rec-500" />
                            ) : (
                              <Mic className="w-3 h-3" />
                            )}
                            <span>
                              {hasVocal ? t.vocalHasTrack : t.vocalRecordBtn}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {(onAddNextAiStorySection || onOpenAdvanceForSection) && (
                <div className="px-4 pb-3 pt-0.5 flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      onAddNextAiStorySection
                        ? onAddNextAiStorySection(section.id)
                        : onOpenAdvanceForSection?.(section)
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent-50 hover:bg-accent-100 border border-accent-200 text-accent-text text-xs font-semibold transition cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      {lang === 'th'
                        ? '✨ ต่อเรื่องราวท่อนถัดไป (AI Continue Story)'
                        : '✨ Continue Story Next Section (AI)'}
                    </span>
                  </button>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Bottom Dashed Add Verse/Chorus Quick Trigger */}
      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => handleAddSection('verse')}
          className="flex-1 min-w-[200px] border border-dashed border-hairline hover:border-accent-500 bg-surface-1/60 hover:bg-surface-1 text-ink-700 hover:text-accent-text rounded-2xl py-3 px-4 text-xs font-medium inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>
            {lang === 'th' ? 'เพิ่มท่อน Verse' : 'Add Verse Section'}
          </span>
        </button>
        <button
          type="button"
          onClick={() => handleAddSection('chorus')}
          className="flex-1 min-w-[200px] border border-dashed border-hairline hover:border-accent-500 bg-surface-1/60 hover:bg-surface-1 text-ink-700 hover:text-accent-text rounded-2xl py-3 px-4 text-xs font-medium inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>
            {lang === 'th' ? 'เพิ่มท่อน Chorus' : 'Add Chorus Section'}
          </span>
        </button>
      </div>

      {/* 6-Second Undo Delete Section Banner */}
      {deletedUndo && (
        <div className="fixed bottom-24 md:bottom-6 right-4 z-50 flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-ink-900 text-canvas shadow-e3 text-xs font-medium">
          <span>
            {lang === 'th'
              ? `ลบท่อน "${deletedUndo.section.name}" แล้ว`
              : `Deleted "${deletedUndo.section.name}"`}
          </span>
          <button
            type="button"
            onClick={handleUndoDeleteSection}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent-500 hover:bg-accent-hover text-white font-semibold cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>{lang === 'th' ? 'เลิกทำ' : 'Undo'}</span>
          </button>
          <button
            type="button"
            onClick={() => setDeletedUndo(null)}
            className="opacity-70 hover:opacity-100 p-0.5 cursor-pointer"
            aria-label={t.close}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default SectionBuilder;
