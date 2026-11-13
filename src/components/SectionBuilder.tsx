'use client';

import React, { useState, useRef, useEffect } from 'react';
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
} from 'lucide-react';
import {
  SongProject,
  SongSection,
  SectionType,
  SectionIntensity,
  BarPlayStyle,
  SongBar,
} from '@/types/song';
import { transposeChord, getCapoFingeringChord } from '@/lib/chordUtils';
import {
  duplicateSectionInList,
  generateUniqueId,
  countThaiEnglishSyllables,
} from '@/lib/sectionUtils';
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
  onSwitchToArranger?: () => void;
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
  onSwitchToArranger,
}: SectionBuilderProps) {
  const { t, lang } = useLanguage();
  const [expandedInstrumentPanels, setExpandedInstrumentPanels] = useState<
    Record<string, boolean>
  >({});
  const [openBarPopoverId, setOpenBarPopoverId] = useState<string | null>(null);
  const [openSectionMenuId, setOpenSectionMenuId] = useState<string | null>(null);
  const [addSectionMenuOpen, setAddSectionMenuOpen] = useState(false);
  const [deletedUndo, setDeletedUndo] = useState<{
    section: SongSection;
    index: number;
  } | null>(null);

  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeBarRef = useRef<HTMLDivElement | null>(null);

  const isArranger = viewMode === 'arranger';
  let globalBarCounter = 0;

  // Close menus on outside click or Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenBarPopoverId(null);
        setOpenSectionMenuId(null);
        setAddSectionMenuOpen(false);
      }
    };
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest('[data-studio-menu-root]')) {
        setOpenBarPopoverId(null);
        setOpenSectionMenuId(null);
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

  const sectionTypesList: { type: SectionType; label: string }[] = [
    { type: 'intro', label: t.sectionIntro },
    { type: 'verse', label: t.sectionVerse },
    { type: 'pre-chorus', label: t.sectionPreChorus },
    { type: 'chorus', label: t.sectionChorus },
    { type: 'solo', label: t.sectionSolo },
    { type: 'bridge', label: lang === 'th' ? 'Bridge' : 'Bridge' },
    { type: 'outro', label: lang === 'th' ? 'Outro' : 'Outro' },
  ];

  return (
    <div className="space-y-5">
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

      {/* Sections List */}
      <div className="space-y-4">
        {song.sections.map((section, secIdx) => {
          const meta = SECTION_TYPE_META[section.type] || SECTION_TYPE_META.verse;
          const isInstPanelOpen =
            expandedInstrumentPanels[section.id] ?? false;

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
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
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
                    className="bg-transparent text-sm sm:text-[15px] font-semibold text-ink-900 focus:outline-none focus:bg-surface-2 px-1.5 py-0.5 rounded-lg min-w-[140px] w-full max-w-xs transition"
                    aria-label="Section Name"
                  />

                  <span className="hidden sm:inline-flex text-[11px] font-mono-tabular text-ink-400 shrink-0">
                    {section.bars.length} {lang === 'th' ? 'ห้อง' : 'bars'}
                  </span>

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
                <div className="flex items-center gap-1.5 shrink-0" data-studio-menu-root>
                  {onOpenAdvanceForSection && (
                    <button
                      type="button"
                      onClick={() => onOpenAdvanceForSection(section)}
                      title={`✨ ${
                        lang === 'th'
                          ? 'AI ช่วยแต่งเนื้อร้องและคอร์ดท่อนนี้'
                          : 'AI lyrics & chords for this section'
                      }`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-accent-50 hover:bg-accent-500 hover:text-white text-accent-text text-xs font-medium transition cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">AI</span>
                    </button>
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

              {/* Bars Grid */}
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                {section.bars.map((bar) => {
                  const thisGlobalIndex = globalBarCounter++;
                  const isActive = activeGlobalBarIndex === thisGlobalIndex;
                  const syllableCount = countThaiEnglishSyllables(bar.lyrics);
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
                          return (
                            <button
                              key={chordIdx}
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

                      {/* Bar Footer: Syllable Badge + Melody / Vocal Tools */}
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-surface-2 text-[11px] font-mono-tabular font-medium text-ink-400">
                          {syllableCount} {t.syllablesCount}
                        </span>

                        <div className="flex items-center gap-1.5">
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
