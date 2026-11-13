'use client';

import React, { useState } from 'react';
import {
  SongProject,
  SongSection,
  SectionType,
  SectionIntensity,
  BarPlayStyle,
  SoloMode,
} from '@/types/song';
import { transposeChord, getCapoFingeringChord } from '@/lib/chordUtils';
import {
  countThaiEnglishSyllables,
  duplicateSectionInList,
  generateUniqueId,
} from '@/lib/sectionUtils';
import { useLanguage } from '@/context/LanguageContext';

interface SectionBuilderProps {
  song: SongProject;
  viewMode?: 'songwriter' | 'arranger';
  activeGlobalBarIndex: number;
  onUpdateSong: (updater: (prev: SongProject) => SongProject) => void;
  onOpenChordPicker: (sectionId: string, barId: string, chordIndex: 0 | 1, currentChord: string) => void;
  onOpenPresetsModal: (sectionId: string, sectionName: string) => void;
  onOpenMelodyPianoRoll: (sectionId: string, barId: string, globalBarIndex: number) => void;
  onOpenVocalRecorder: (sectionId: string, barId: string, globalBarIndex: number) => void;
  onOpenAdvanceForSection?: (section: SongSection) => void;
  onSwitchToArranger?: () => void;
}

const SECTION_BADGE_COLORS: Record<SectionType, { bg: string; text: string; border: string }> = {
  intro: { bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-300' },
  verse: { bg: 'bg-blue-100', text: 'text-blue-900', border: 'border-blue-200' },
  'pre-chorus': { bg: 'bg-amber-100', text: 'text-amber-900', border: 'border-amber-300' },
  chorus: { bg: 'bg-rose-100', text: 'text-rose-900', border: 'border-rose-300' },
  solo: { bg: 'bg-purple-100', text: 'text-purple-900', border: 'border-purple-300' },
  bridge: { bg: 'bg-emerald-100', text: 'text-emerald-900', border: 'border-emerald-300' },
  outro: { bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-300' },
};

export const SectionBuilder: React.FC<SectionBuilderProps> = ({
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
}) => {
  const { lang, t } = useLanguage();
  const [expandedInstSections, setExpandedInstSections] = useState<Record<string, boolean>>({});
  const [openBarControls, setOpenBarControls] = useState<Record<string, boolean>>({});
  let globalBarCounter = 0;

  const isArranger = viewMode === 'arranger';

  const toggleSectionInstrumentPanel = (sectionId: string) => {
    setExpandedInstSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const toggleBarControlsPopover = (barId: string) => {
    setOpenBarControls((prev) => ({
      ...prev,
      [barId]: !prev[barId],
    }));
  };

  // Add new section
  const handleAddSection = (type: SectionType) => {
    const id = generateUniqueId('sec');
    const names: Record<SectionType, string> = {
      intro: lang === 'th' ? 'Intro (เกริ่นนำ)' : 'Intro',
      verse: lang === 'th' ? 'Verse (ท่อนร้อง)' : 'Verse',
      'pre-chorus': lang === 'th' ? 'Pre-Chorus (ท่อนส่ง)' : 'Pre-Chorus',
      chorus: lang === 'th' ? 'Chorus (ท่อนฮุก)' : 'Chorus',
      solo: lang === 'th' ? 'Guitar Solo (ท่อนโซโล่)' : 'Guitar Solo',
      bridge: lang === 'th' ? 'Bridge (ท่อนเชื่อม)' : 'Bridge',
      outro: lang === 'th' ? 'Outro (จบท้าย)' : 'Outro',
    };

    const newSection: SongSection = {
      id,
      name: names[type],
      type,
      intensity: type === 'chorus' || type === 'solo' ? 'high' : type === 'pre-chorus' ? 'medium' : 'low',
      soloMode: type === 'solo' ? 'split-slow-fast' : undefined,
      instruments: {
        guitarRhythm: true,
        guitarLead: type === 'solo' || type === 'chorus',
        bass: type !== 'intro' && type !== 'outro',
        piano: type === 'chorus' || type === 'solo' || type === 'bridge' || type === 'pre-chorus',
        drums: type === 'chorus' || type === 'solo',
      },
      bars: Array.from({ length: 4 }).map(() => ({
        id: generateUniqueId('bar'),
        chordsPerBar: 1,
        chords: ['C'],
        playStyle: 'normal',
        lyrics: '',
        melodyNotes: [],
      })),
    };

    onUpdateSong((prev) => ({
      ...prev,
      sections: [...prev.sections, newSection],
    }));
  };

  // Duplicate section right after the source section
  const handleDuplicateSection = (sectionId: string) => {
    onUpdateSong((prev) => ({
      ...prev,
      sections: duplicateSectionInList(prev.sections, sectionId),
    }));
  };

  // Delete section
  const handleDeleteSection = (sectionId: string) => {
    if (song.sections.length <= 1) {
      alert(lang === 'th' ? 'ต้องมีท่อนเพลงอย่างน้อย 1 ท่อนครับ' : 'At least one section is required');
      return;
    }
    onUpdateSong((prev) => ({
      ...prev,
      sections: prev.sections.filter((s) => s.id !== sectionId),
    }));
  };

  // Reorder section
  const handleMoveSection = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= song.sections.length) return;

    onUpdateSong((prev) => {
      const copy = [...prev.sections];
      const temp = copy[index];
      copy[index] = copy[targetIdx];
      copy[targetIdx] = temp;
      return { ...prev, sections: copy };
    });
  };

  // Add Bar to Section
  const handleAddBar = (sectionId: string) => {
    onUpdateSong((prev) => ({
      ...prev,
      sections: prev.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        const lastBar = sec.bars[sec.bars.length - 1];
        const newBar = {
          id: generateUniqueId('bar'),
          chordsPerBar: lastBar ? lastBar.chordsPerBar : 1,
          chords: lastBar ? [...lastBar.chords] : (['C'] as [string]),
          playStyle: 'normal' as BarPlayStyle,
          lyrics: '',
          melodyNotes: [],
        };
        return { ...sec, bars: [...sec.bars, newBar] };
      }),
    }));
  };

  // Toggle section instrument
  const toggleSectionInstrument = (
    sectionId: string,
    inst: 'guitarRhythm' | 'guitarLead' | 'bass' | 'piano' | 'drums'
  ) => {
    onUpdateSong((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => {
        if (s.id !== sectionId) return s;
        const current = s.instruments || {
          guitarRhythm: true,
          guitarLead: false,
          bass: true,
          piano: true,
          drums: true,
        };
        return {
          ...s,
          instruments: {
            ...current,
            [inst]: !current[inst],
          },
        };
      }),
    }));
  };

  // Update section instrument playing style
  const updateSectionInstrumentStyle = (
    sectionId: string,
    field: 'guitarRhythmStyle' | 'guitarLeadStyle' | 'guitarLeadDrive' | 'bassStyle' | 'pianoStyle' | 'drumsStyle',
    style: string
  ) => {
    onUpdateSong((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          instruments: {
            ...s.instruments,
            [field]: style,
          },
        };
      }),
    }));
  };

  // Update per-section instrument volume (0–100%)
  const updateSectionInstrumentVolume = (
    sectionId: string,
    field: 'guitarRhythmVolume' | 'guitarLeadVolume' | 'bassVolume' | 'pianoVolume' | 'drumsVolume',
    volume: number
  ) => {
    const clamped = Math.max(0, Math.min(100, Math.round(volume)));
    onUpdateSong((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          instruments: {
            ...s.instruments,
            [field]: clamped,
          },
        };
      }),
    }));
  };

  const renderSectionVolumeSlider = (
    sectionId: string,
    field: 'guitarRhythmVolume' | 'guitarLeadVolume' | 'bassVolume' | 'pianoVolume' | 'drumsVolume',
    currentVol: number | undefined,
    accentClass: string
  ) => {
    const vol = currentVol ?? 100;
    return (
      <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100 mt-auto">
        <span className="text-[10px] text-slate-400 shrink-0" title={lang === 'th' ? 'ความดังท่อนนี้' : 'Section volume'}>
          🔊
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={vol}
          onChange={(e) => updateSectionInstrumentVolume(sectionId, field, Number(e.target.value))}
          aria-label={`${field} ${lang === 'th' ? 'ความดังท่อนนี้' : 'section volume'}`}
          className={`w-full h-1.5 bg-slate-200 rounded-lg cursor-pointer ${accentClass}`}
        />
        <span className="text-[10px] font-bold text-slate-600 w-8 text-right shrink-0 tabular-nums">
          {vol}%
        </span>
      </div>
    );
  };

  // Delete Bar
  const handleDeleteBar = (sectionId: string, barId: string) => {
    onUpdateSong((prev) => ({
      ...prev,
      sections: prev.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        if (sec.bars.length <= 1) return sec;
        return { ...sec, bars: sec.bars.filter((b) => b.id !== barId) };
      }),
    }));
  };

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-black text-lg text-slate-900">
            {isArranger ? t.arrangerTitle : t.songwriterTitle}
          </h2>
          <p className="text-xs text-slate-500">
            {isArranger ? t.arrangerSubtitle : t.songwriterSubtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 mr-1">{t.addSection}:</span>
          {(['verse', 'pre-chorus', 'chorus', 'solo', 'bridge', 'outro'] as SectionType[]).map((st) => (
            <button
              type="button"
              key={st}
              onClick={() => handleAddSection(st)}
              className="px-2.5 py-1 rounded-xl bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 text-slate-700 text-xs font-bold transition cursor-pointer capitalize min-h-[36px]"
            >
              + {st}
            </button>
          ))}
        </div>
      </div>

      {/* Sections List */}
      <div className="space-y-5">
        {song.sections.map((section, sIdx) => {
          const badge = SECTION_BADGE_COLORS[section.type] || SECTION_BADGE_COLORS.verse;
          const isInstExpanded = isArranger || !!expandedInstSections[section.id];
          const inst = section.instruments || {
            guitarRhythm: true,
            guitarLead: false,
            bass: true,
            piano: true,
            drums: true,
          };
          const activeInstPills: string[] = [];
          if (inst.guitarRhythm) activeInstPills.push(`🎸 ${lang === 'th' ? 'ริทึ่ม' : 'Rhythm'}`);
          if (inst.guitarLead) activeInstPills.push(`🎸 ${lang === 'th' ? 'ลีด' : 'Lead'}`);
          if (inst.bass) activeInstPills.push(`🎻 ${lang === 'th' ? 'เบส' : 'Bass'}`);
          if (inst.piano) activeInstPills.push(`🎹 ${lang === 'th' ? 'เปียโน' : 'Piano'}`);
          if (inst.drums) activeInstPills.push(`🥁 ${lang === 'th' ? 'กลอง' : 'Drums'}`);

          return (
            <section
              key={section.id}
              className="bg-white rounded-3xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-4 transition"
            >
              {/* Section Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span
                    className={`px-3 py-1 rounded-full font-black text-xs border ${badge.bg} ${badge.text} ${badge.border}`}
                  >
                    {section.name}
                  </span>

                  {/* Arranger-only: Section Intensity & Solo Mode */}
                  {isArranger && (
                    <>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <span>{t.dynamicIntensity}</span>
                        <select
                          value={section.intensity}
                          onChange={(e) => {
                            const intensity = e.target.value as SectionIntensity;
                            onUpdateSong((prev) => ({
                              ...prev,
                              sections: prev.sections.map((s) => (s.id === section.id ? { ...s, intensity } : s)),
                            }));
                          }}
                          className="bg-slate-100 border border-slate-200 rounded-lg px-2 py-0.5 font-bold text-slate-800 text-xs min-h-[32px]"
                        >
                          <option value="low">{t.intensityLow}</option>
                          <option value="medium">{t.intensityMedium}</option>
                          <option value="high">{t.intensityHigh}</option>
                        </select>
                      </div>

                      {section.type === 'solo' && (
                        <div className="flex items-center gap-1.5 text-xs text-purple-900 bg-purple-50 px-2 py-0.5 rounded-lg border border-purple-200">
                          <span>{lang === 'th' ? 'โหมดโซโล่:' : 'Solo Mode:'}</span>
                          <select
                            value={section.soloMode || 'split-slow-fast'}
                            onChange={(e) => {
                              const soloMode = e.target.value as SoloMode;
                              onUpdateSong((prev) => ({
                                ...prev,
                                sections: prev.sections.map((s) => (s.id === section.id ? { ...s, soloMode } : s)),
                              }));
                            }}
                            className="bg-white rounded font-bold text-xs"
                          >
                            <option value="split-slow-fast">{lang === 'th' ? 'Split Slow-Fast (ครึ่งแรกช้า / ครึ่งหลังเร็ว)' : 'Split Slow-Fast'}</option>
                            <option value="normal">{lang === 'th' ? 'จังหวะปกติทั้งท่อน (Normal)' : 'Normal Pace'}</option>
                          </select>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Section Action Buttons */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {/* Subtle Advance Mode / Thai Rhyme & AI Lyric Co-Pilot Trigger */}
                  {onOpenAdvanceForSection && (
                    <button
                      type="button"
                      onClick={() => onOpenAdvanceForSection(section)}
                      title={lang === 'th' ? 'หาคำสัมผัสไทย (0 เครดิต) & AI ช่วยแต่งเนื้อ (1 เครดิต)' : 'Thai Rhyme (0 Credits) & AI Lyric Co-Pilot (1 Credit)'}
                      className="px-2.5 py-1.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-900 border border-violet-200 font-bold transition flex items-center gap-1 cursor-pointer min-h-[34px]"
                    >
                      <span>✨</span>
                    </button>
                  )}

                  {/* Presets Button */}
                  <button
                    type="button"
                    onClick={() => onOpenPresetsModal(section.id, section.name)}
                    className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-bold transition flex items-center gap-1 cursor-pointer min-h-[34px]"
                  >
                    <span>{t.chordPresets}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddBar(section.id)}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold transition cursor-pointer min-h-[34px]"
                  >
                    {t.addBar}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDuplicateSection(section.id)}
                    className="px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200/80 font-bold transition cursor-pointer min-h-[34px]"
                    title={t.duplicateSection}
                  >
                    {isArranger ? t.duplicateSection : '📋'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleMoveSection(sIdx, 'up')}
                    disabled={sIdx === 0}
                    className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold disabled:opacity-30 transition flex items-center justify-center cursor-pointer"
                    title={lang === 'th' ? 'เลื่อนขึ้น' : 'Move Up'}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveSection(sIdx, 'down')}
                    disabled={sIdx === song.sections.length - 1}
                    className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold disabled:opacity-30 transition flex items-center justify-center cursor-pointer"
                    title={lang === 'th' ? 'เลื่อนลง' : 'Move Down'}
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteSection(section.id)}
                    className="w-8 h-8 rounded-xl hover:bg-rose-100 text-rose-600 font-bold transition flex items-center justify-center cursor-pointer"
                    title={lang === 'th' ? 'ลบท่อนนี้' : 'Delete Section'}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Per-Section Instruments: Sleek Summary Row in Songwriter vs Full Grid in Arranger */}
              {!isInstExpanded ? (
                <div className="bg-slate-50/90 px-3.5 py-2 rounded-2xl border border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5 text-slate-700">
                    <span className="font-bold text-slate-600 mr-0.5">
                      🎼 {t.activeInstrumentsLabel}:
                    </span>
                    {activeInstPills.length > 0 ? (
                      activeInstPills.map((pillLabel, idx) => (
                        <React.Fragment key={pillLabel}>
                          {idx > 0 && <span className="text-slate-300">•</span>}
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white border border-slate-200/90 font-semibold text-slate-800 shadow-2xs text-[11px]">
                            {pillLabel}
                          </span>
                        </React.Fragment>
                      ))
                    ) : (
                      <span className="text-slate-400 italic text-[11px]">
                        {t.noActiveInstruments}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => toggleSectionInstrumentPanel(section.id)}
                      className="px-2.5 py-1 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-[11px] transition cursor-pointer"
                    >
                      {t.expandInstruments}
                    </button>
                    {onSwitchToArranger && (
                      <button
                        type="button"
                        onClick={onSwitchToArranger}
                        className="px-2.5 py-1 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[#1A73E8] font-bold text-[11px] transition cursor-pointer"
                        title={t.openArrangerHint}
                      >
                        {t.openArrangerBtn}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
              <div className="bg-slate-50/90 p-3.5 rounded-2xl border border-slate-200/80 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <span>🎼</span>
                    <span>
                      {lang === 'th'
                        ? 'เครื่องดนตรีและวิธีเล่นประจำท่อนนี้:'
                        : 'Instruments & Playing Styles for this Section:'}
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 italic hidden sm:inline">
                      {lang === 'th'
                        ? '*เปิด/ปิดและเลือกสไตล์การเล่นของแต่ละชิ้นได้อิสระในท่อนนี้'
                        : '*Mute or customize playing styles individually for this section'}
                    </span>
                    {!isArranger && (
                      <button
                        type="button"
                        onClick={() => toggleSectionInstrumentPanel(section.id)}
                        className="px-2.5 py-1 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-[11px] transition cursor-pointer"
                      >
                        {t.collapseInstruments}
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
                  {/* 1. Rhythm Guitar */}
                  <div
                    className={`p-2.5 rounded-xl border flex flex-col gap-1.5 transition ${
                      section.instruments?.guitarRhythm
                        ? 'bg-white border-blue-300 shadow-2xs'
                        : 'bg-slate-100/70 border-slate-200 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 flex items-center gap-1">
                        🎸 {lang === 'th' ? 'ริทึ่ม (คอร์ด)' : 'Rhythm Guitar'}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleSectionInstrument(section.id, 'guitarRhythm')}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                          section.instruments?.guitarRhythm
                            ? 'bg-[#1A73E8] text-white'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {section.instruments?.guitarRhythm ? (lang === 'th' ? 'เปิด' : 'ON') : (lang === 'th' ? 'ปิด' : 'OFF')}
                      </button>
                    </div>
                    {section.instruments?.guitarRhythm ? (
                      <>
                        <select
                          value={section.instruments?.guitarRhythmStyle || 'campfire-strum'}
                          onChange={(e) =>
                            updateSectionInstrumentStyle(section.id, 'guitarRhythmStyle', e.target.value)
                          }
                          className="w-full text-[11px] bg-blue-50 border border-blue-200 rounded-lg px-2 py-1 font-bold text-blue-950 focus:outline-none"
                        >
                          <option value="campfire-strum">{lang === 'th' ? 'ตีคอร์ดแคมป์ไฟ' : 'Campfire Strum'}</option>
                          <option value="soft-strum">{lang === 'th' ? 'ตีคอร์ดนุ่มนวล' : 'Soft Strum'}</option>
                          <option value="fingerpicking">{lang === 'th' ? 'เกาสายอะคูสติก' : 'Fingerpicking'}</option>
                        </select>
                        {renderSectionVolumeSlider(section.id, 'guitarRhythmVolume', section.instruments?.guitarRhythmVolume, 'accent-[#1A73E8]')}
                      </>
                    ) : (
                      <div className="text-[10px] text-slate-400 py-1 text-center font-medium">
                        {lang === 'th' ? 'ปิดเสียงในท่อนนี้' : 'Muted in this section'}
                      </div>
                    )}
                  </div>

                  {/* 2. Lead Guitar */}
                  <div
                    className={`p-2.5 rounded-xl border flex flex-col gap-1.5 transition ${
                      section.instruments?.guitarLead
                        ? 'bg-white border-purple-300 shadow-2xs'
                        : 'bg-slate-100/70 border-slate-200 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-purple-950 flex items-center gap-1">
                        🎸 {lang === 'th' ? 'ลีด (Les Paul)' : 'Lead (Les Paul)'}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleSectionInstrument(section.id, 'guitarLead')}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                          section.instruments?.guitarLead
                            ? 'bg-purple-600 text-white'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {section.instruments?.guitarLead ? (lang === 'th' ? 'เปิด' : 'ON') : (lang === 'th' ? 'ปิด' : 'OFF')}
                      </button>
                    </div>
                    {section.instruments?.guitarLead ? (
                      <div className="space-y-1 flex-1 flex flex-col">
                        <select
                          value={section.instruments?.guitarLeadStyle || 'melodic-solo'}
                          onChange={(e) =>
                            updateSectionInstrumentStyle(section.id, 'guitarLeadStyle', e.target.value)
                          }
                          className="w-full text-[11px] bg-purple-50 border border-purple-200 rounded-lg px-2 py-1 font-bold text-purple-950 focus:outline-none"
                        >
                          <option value="melodic-solo">{lang === 'th' ? 'โซโล่ทำนอง (Solo)' : 'Melodic Solo'}</option>
                          <option value="riff-fills">{lang === 'th' ? 'หยอดลูกส่ง (Riff Fills)' : 'Riff Fills'}</option>
                          <option value="soft-arpeggio">{lang === 'th' ? 'เกาโน้ตสูงคลอ (Arp)' : 'Soft Arpeggio'}</option>
                        </select>
                        <select
                          value={
                            (section.instruments?.guitarLeadDrive || song.mixer.guitarLead.drive || 'overdrive') === 'fuzz'
                              ? 'distortion'
                              : (section.instruments?.guitarLeadDrive || song.mixer.guitarLead.drive || 'overdrive')
                          }
                          onChange={(e) =>
                            updateSectionInstrumentStyle(section.id, 'guitarLeadDrive', e.target.value)
                          }
                          className="w-full text-[10px] bg-amber-50/70 border border-amber-200 rounded-lg px-2 py-0.5 font-bold text-amber-950 focus:outline-none"
                          title="Overdrive / Tone"
                        >
                          <option value="clean">{lang === 'th' ? 'คลีนหวาน (Clean)' : 'Clean'}</option>
                          <option value="crunch">{lang === 'th' ? 'ครันช์เบา (Crunch)' : 'Crunch'}</option>
                          <option value="overdrive">{lang === 'th' ? 'แตกอุ่น (Warm Overdrive)' : 'Warm Overdrive'}</option>
                          <option value="distortion">{lang === 'th' ? 'แตกหนัก (Distortion / Fuzz)' : 'Distortion / Fuzz'}</option>
                        </select>
                        {renderSectionVolumeSlider(section.id, 'guitarLeadVolume', section.instruments?.guitarLeadVolume, 'accent-purple-600')}
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 py-1 text-center font-medium">
                        {lang === 'th' ? 'ปิดเสียงในท่อนนี้' : 'Muted in this section'}
                      </div>
                    )}
                  </div>

                  {/* 3. Bass */}
                  <div
                    className={`p-2.5 rounded-xl border flex flex-col gap-1.5 transition ${
                      section.instruments?.bass
                        ? 'bg-white border-blue-300 shadow-2xs'
                        : 'bg-slate-100/70 border-slate-200 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 flex items-center gap-1">
                        🎻 {lang === 'th' ? 'เบสโปร่ง' : 'Acoustic Bass'}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleSectionInstrument(section.id, 'bass')}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                          section.instruments?.bass
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {section.instruments?.bass ? (lang === 'th' ? 'เปิด' : 'ON') : (lang === 'th' ? 'ปิด' : 'OFF')}
                      </button>
                    </div>
                    {section.instruments?.bass ? (
                      <>
                        <select
                          value={section.instruments?.bassStyle || 'root-fifth'}
                          onChange={(e) =>
                            updateSectionInstrumentStyle(section.id, 'bassStyle', e.target.value)
                          }
                          className="w-full text-[11px] bg-blue-50 border border-blue-200 rounded-lg px-2 py-1 font-bold text-blue-950 focus:outline-none"
                        >
                          <option value="root-fifth">{lang === 'th' ? 'Root-5th สลับจังหวะ' : 'Root-5th Alternate'}</option>
                          <option value="warm-sustain">{lang === 'th' ? 'ลากยาวอุ่นๆ (Sustain)' : 'Warm Sustain'}</option>
                        </select>
                        {renderSectionVolumeSlider(section.id, 'bassVolume', section.instruments?.bassVolume, 'accent-blue-600')}
                      </>
                    ) : (
                      <div className="text-[10px] text-slate-400 py-1 text-center font-medium">
                        {lang === 'th' ? 'ปิดเสียงในท่อนนี้' : 'Muted in this section'}
                      </div>
                    )}
                  </div>

                  {/* 4. Piano */}
                  <div
                    className={`p-2.5 rounded-xl border flex flex-col gap-1.5 transition ${
                      section.instruments?.piano
                        ? 'bg-white border-amber-300 shadow-2xs'
                        : 'bg-slate-100/70 border-slate-200 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 flex items-center gap-1">
                        🎹 {lang === 'th' ? 'เปียโน' : 'Piano'}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleSectionInstrument(section.id, 'piano')}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                          section.instruments?.piano
                            ? 'bg-amber-600 text-white'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {section.instruments?.piano ? (lang === 'th' ? 'เปิด' : 'ON') : (lang === 'th' ? 'ปิด' : 'OFF')}
                      </button>
                    </div>
                    {section.instruments?.piano ? (
                      <>
                        <select
                          value={section.instruments?.pianoStyle || 'warm-pad'}
                          onChange={(e) =>
                            updateSectionInstrumentStyle(section.id, 'pianoStyle', e.target.value)
                          }
                          className="w-full text-[11px] bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 font-bold text-amber-950 focus:outline-none"
                        >
                          <option value="warm-pad">{lang === 'th' ? 'คอร์ดปูพื้น (Warm Pad)' : 'Warm Pad'}</option>
                          <option value="gentle-arpeggio">{lang === 'th' ? 'พรมนิ้วเบาๆ (Arp)' : 'Gentle Arpeggio'}</option>
                        </select>
                        {renderSectionVolumeSlider(section.id, 'pianoVolume', section.instruments?.pianoVolume, 'accent-amber-600')}
                      </>
                    ) : (
                      <div className="text-[10px] text-slate-400 py-1 text-center font-medium">
                        {lang === 'th' ? 'ปิดเสียงในท่อนนี้' : 'Muted in this section'}
                      </div>
                    )}
                  </div>

                  {/* 5. Drums */}
                  <div
                    className={`p-2.5 rounded-xl border flex flex-col gap-1.5 transition ${
                      section.instruments?.drums
                        ? 'bg-white border-emerald-300 shadow-2xs'
                        : 'bg-slate-100/70 border-slate-200 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 flex items-center gap-1">
                        🥁 {lang === 'th' ? 'เพอร์คัชชัน' : 'Drums & Cajon'}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleSectionInstrument(section.id, 'drums')}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                          section.instruments?.drums
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {section.instruments?.drums ? (lang === 'th' ? 'เปิด' : 'ON') : (lang === 'th' ? 'ปิด' : 'OFF')}
                      </button>
                    </div>
                    {section.instruments?.drums ? (
                      <>
                        <select
                          value={section.instruments?.drumsStyle || 'shaker-cajon'}
                          onChange={(e) =>
                            updateSectionInstrumentStyle(section.id, 'drumsStyle', e.target.value)
                          }
                          className="w-full text-[11px] bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1 font-bold text-emerald-950 focus:outline-none"
                        >
                          <option value="shaker-cajon">Shaker & Cajon</option>
                          <option value="simple-kit">{lang === 'th' ? 'กลองชุดเรียบๆ (Kit)' : 'Simple Kit'}</option>
                        </select>
                        {renderSectionVolumeSlider(section.id, 'drumsVolume', section.instruments?.drumsVolume, 'accent-emerald-600')}
                      </>
                    ) : (
                      <div className="text-[10px] text-slate-400 py-1 text-center font-medium">
                        {lang === 'th' ? 'ปิดเสียงในท่อนนี้' : 'Muted in this section'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              )}

              {/* Bars Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {section.bars.map((bar) => {
                  const thisGlobalIndex = globalBarCounter++;
                  const isCurrentActive = thisGlobalIndex === activeGlobalBarIndex;
                  const isBarControlsOpen = isArranger || !!openBarControls[bar.id];
                  const syllableCount = countThaiEnglishSyllables(bar.lyrics);

                  // Transposed Sounding Chords
                  const chord1 = transposeChord(bar.chords[0] || 'C', song.transposeSemitones);
                  const capoChord1 = getCapoFingeringChord(chord1, song.capoFret);

                  const chord2 =
                    bar.chordsPerBar === 2 && bar.chords[1]
                      ? transposeChord(bar.chords[1], song.transposeSemitones)
                      : null;
                  const capoChord2 = chord2 ? getCapoFingeringChord(chord2, song.capoFret) : null;

                  return (
                    <div
                      key={bar.id}
                      className={`rounded-2xl p-3.5 space-y-3 transition border-2 ${
                        isCurrentActive
                          ? 'bg-[#E8F0FE] border-[#1A73E8] shadow-md shadow-blue-500/15'
                          : bar.playStyle === 'let-ring'
                          ? 'bg-amber-50/50 border-amber-200'
                          : bar.playStyle === 'break'
                          ? 'bg-slate-100 border-slate-300'
                          : 'bg-slate-50/70 border-slate-200'
                      }`}
                    >
                      {/* Bar Top Header */}
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`font-black ${
                              isCurrentActive ? 'text-[#1A73E8]' : 'text-slate-700'
                            }`}
                          >
                            {t.barLabel} {thisGlobalIndex + 1}
                          </span>
                          {isCurrentActive && (
                            <span className="px-1.5 py-0.2 bg-[#1A73E8] text-white font-bold rounded text-[10px]">
                              {lang === 'th' ? 'เล่นอยู่' : 'Playing'}
                            </span>
                          )}
                          {!isArranger && bar.playStyle === 'let-ring' && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                              🔔
                            </span>
                          )}
                          {!isArranger && bar.playStyle === 'break' && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-bold">
                              🔇
                            </span>
                          )}
                          {!isArranger && bar.melodyNotes.length > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-100 text-[#1A73E8] text-[10px] font-bold">
                              🎵 {bar.melodyNotes.length}
                            </span>
                          )}
                        </div>

                        {/* Arranger shows full inline controls; Songwriter shows compact popover toggle */}
                        {isArranger ? (
                          <div className="flex items-center gap-1">
                            <select
                              value={bar.playStyle}
                              onChange={(e) => {
                                const playStyle = e.target.value as BarPlayStyle;
                                onUpdateSong((prev) => ({
                                  ...prev,
                                  sections: prev.sections.map((s) => ({
                                    ...s,
                                    bars: s.bars.map((b) => (b.id === bar.id ? { ...b, playStyle } : b)),
                                  })),
                                }));
                              }}
                              className="bg-white border border-slate-200 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-slate-800"
                            >
                              <option value="normal">🎵 {t.styleNormal}</option>
                              <option value="let-ring">🔔 {t.styleLetRing}</option>
                              <option value="break">🔇 {t.styleBreak}</option>
                            </select>

                            <select
                              value={bar.chordsPerBar}
                              onChange={(e) => {
                                const count = parseInt(e.target.value, 10) as 1 | 2;
                                onUpdateSong((prev) => ({
                                  ...prev,
                                  sections: prev.sections.map((s) => {
                                    if (s.id !== section.id) return s;
                                    return {
                                      ...s,
                                      bars: s.bars.map((b) => {
                                        if (b.id !== bar.id) return b;
                                        const chords: string[] =
                                          count === 2
                                            ? [b.chords[0] || 'C', b.chords[1] || 'G']
                                            : [b.chords[0] || 'C'];
                                        return { ...b, chordsPerBar: count, chords };
                                      }),
                                    };
                                  }),
                                }));
                              }}
                              className="bg-white border border-slate-200 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-slate-800"
                            >
                              <option value={1}>{t.chordsPerBar1}</option>
                              <option value={2}>{t.chordsPerBar2}</option>
                            </select>

                            {section.bars.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleDeleteBar(section.id, bar.id)}
                                className="text-slate-400 hover:text-rose-600 px-1 font-bold text-xs cursor-pointer"
                                title={lang === 'th' ? 'ลบห้องนี้' : 'Delete Bar'}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleBarControlsPopover(bar.id)}
                            aria-expanded={isBarControlsOpen}
                            title={t.barOptionsBtn}
                            className={`px-2 py-0.5 rounded-lg border text-xs font-bold transition cursor-pointer ${
                              isBarControlsOpen
                                ? 'bg-slate-800 text-white border-slate-800'
                                : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            ⋯
                          </button>
                        )}
                      </div>

                      {/* Songwriter Secondary Bar Controls Popover/Drawer */}
                      {!isArranger && isBarControlsOpen && (
                        <div className="bg-white border border-slate-200 rounded-xl p-2.5 space-y-2 shadow-xs">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <select
                              value={bar.playStyle}
                              onChange={(e) => {
                                const playStyle = e.target.value as BarPlayStyle;
                                onUpdateSong((prev) => ({
                                  ...prev,
                                  sections: prev.sections.map((s) => ({
                                    ...s,
                                    bars: s.bars.map((b) => (b.id === bar.id ? { ...b, playStyle } : b)),
                                  })),
                                }));
                              }}
                              className="flex-1 min-w-[110px] bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-800"
                            >
                              <option value="normal">🎵 {t.styleNormal}</option>
                              <option value="let-ring">🔔 {t.styleLetRing}</option>
                              <option value="break">🔇 {t.styleBreak}</option>
                            </select>

                            <select
                              value={bar.chordsPerBar}
                              onChange={(e) => {
                                const count = parseInt(e.target.value, 10) as 1 | 2;
                                onUpdateSong((prev) => ({
                                  ...prev,
                                  sections: prev.sections.map((s) => {
                                    if (s.id !== section.id) return s;
                                    return {
                                      ...s,
                                      bars: s.bars.map((b) => {
                                        if (b.id !== bar.id) return b;
                                        const chords: string[] =
                                          count === 2
                                            ? [b.chords[0] || 'C', b.chords[1] || 'G']
                                            : [b.chords[0] || 'C'];
                                        return { ...b, chordsPerBar: count, chords };
                                      }),
                                    };
                                  }),
                                }));
                              }}
                              className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-800"
                            >
                              <option value={1}>{t.chordsPerBar1}</option>
                              <option value={2}>{t.chordsPerBar2}</option>
                            </select>
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 text-[11px]">
                            <button
                              type="button"
                              onClick={() => onOpenMelodyPianoRoll(section.id, bar.id, thisGlobalIndex)}
                              className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1A73E8] font-bold transition flex items-center gap-1 cursor-pointer"
                            >
                              <span>🎹 {t.melodyNotesBtn}</span>
                              {bar.melodyNotes.length > 0 && (
                                <span className="px-1.5 bg-blue-200/70 rounded-full text-[10px] font-black">
                                  {bar.melodyNotes.length}
                                </span>
                              )}
                            </button>

                            {section.bars.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleDeleteBar(section.id, bar.id)}
                                className="px-2 py-1 rounded-lg hover:bg-rose-50 text-rose-600 font-bold transition cursor-pointer"
                              >
                                ✕ {t.delete}
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Chord Buttons */}
                      <div className="flex gap-2">
                        {/* Chord 1 */}
                        <button
                          type="button"
                          onClick={() => onOpenChordPicker(section.id, bar.id, 0, bar.chords[0] || 'C')}
                          className={`flex-1 px-3 rounded-xl bg-white border border-slate-200 hover:border-[#1A73E8] text-left flex items-center justify-between shadow-2xs group transition cursor-pointer ${
                            isArranger ? 'py-2 min-h-[44px]' : 'py-2.5 min-h-[50px]'
                          }`}
                        >
                          <div>
                            <span
                              className={`font-black text-slate-900 group-hover:text-[#1A73E8] ${
                                isArranger ? 'text-lg' : 'text-xl'
                              }`}
                            >
                              {chord1}
                            </span>
                            {song.capoFret > 0 && (
                              <span className="ml-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md">
                                {lang === 'th' ? `จับ ${capoChord1}` : `Play ${capoChord1}`}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {bar.chordsPerBar === 2 ? (lang === 'th' ? 'จังหวะ 1-2' : 'Beat 1-2') : (lang === 'th' ? 'เปลี่ยน ▾' : 'Edit ▾')}
                          </span>
                        </button>

                        {/* Chord 2 if 2 chords */}
                        {bar.chordsPerBar === 2 && chord2 && (
                          <button
                            type="button"
                            onClick={() => onOpenChordPicker(section.id, bar.id, 1, bar.chords[1] || 'G')}
                            className={`flex-1 px-3 rounded-xl bg-white border border-slate-200 hover:border-[#1A73E8] text-left flex items-center justify-between shadow-2xs group transition cursor-pointer ${
                              isArranger ? 'py-2 min-h-[44px]' : 'py-2.5 min-h-[50px]'
                            }`}
                          >
                            <div>
                              <span
                                className={`font-black text-slate-900 group-hover:text-[#1A73E8] ${
                                  isArranger ? 'text-lg' : 'text-xl'
                                }`}
                              >
                                {chord2}
                              </span>
                              {song.capoFret > 0 && capoChord2 && (
                                <span className="ml-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md">
                                  {lang === 'th' ? `จับ ${capoChord2}` : `Play ${capoChord2}`}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400">
                              {lang === 'th' ? 'จังหวะ 3-4' : 'Beat 3-4'}
                            </span>
                          </button>
                        )}
                      </div>

                      {/* Lyrics Input with Live Thai/English Syllable Count Badge */}
                      <div className="flex items-center gap-1.5 w-full px-3 rounded-xl bg-white border border-slate-200 focus-within:border-[#1A73E8] focus-within:ring-2 focus-within:ring-blue-100 min-h-[42px]">
                        <input
                          type="text"
                          value={bar.lyrics}
                          onChange={(e) => {
                            const val = e.target.value;
                            onUpdateSong((prev) => ({
                              ...prev,
                              sections: prev.sections.map((s) => ({
                                ...s,
                                bars: s.bars.map((b) => (b.id === bar.id ? { ...b, lyrics: val } : b)),
                              })),
                            }));
                          }}
                          placeholder={t.lyricsPlaceholder}
                          className="flex-1 min-w-0 py-2 bg-transparent text-sm font-medium text-slate-900 focus:outline-none placeholder:text-slate-400"
                        />
                        {syllableCount > 0 && (
                          <span
                            className="shrink-0 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 border border-slate-200/80 text-[10px] font-bold select-none"
                            title={`${syllableCount} ${t.syllablesCount}`}
                          >
                            {syllableCount} {t.syllablesCount}
                          </span>
                        )}
                      </div>

                      {/* Bar Footer: Full Melody+Mic in Arranger, Clean Quick Mic in Songwriter */}
                      <div
                        className={`flex items-center pt-1 text-[11px] text-slate-500 ${
                          isArranger ? 'justify-between' : 'justify-end'
                        }`}
                      >
                        {isArranger && (
                          <button
                            type="button"
                            onClick={() => onOpenMelodyPianoRoll(section.id, bar.id, thisGlobalIndex)}
                            className="hover:text-[#1A73E8] font-bold transition flex items-center gap-1 cursor-pointer min-h-[30px]"
                            title={lang === 'th' ? 'เปิด Mini Piano Roll แต่งโน้ตร้องไกด์' : 'Open Mini Piano Roll'}
                          >
                            <span>🎹 {t.melodyNotesBtn}</span>
                            {bar.melodyNotes.length > 0 && (
                              <span className="px-1.5 py-0.2 bg-blue-100 text-[#1A73E8] rounded-full text-[10px] font-black">
                                {bar.melodyNotes.length}
                              </span>
                            )}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => onOpenVocalRecorder(section.id, bar.id, thisGlobalIndex)}
                          className={`font-bold transition flex items-center gap-1 cursor-pointer min-h-[30px] ${
                            bar.vocalAudio ? 'text-rose-600 hover:text-rose-700' : 'text-slate-500 hover:text-rose-600'
                          }`}
                          title={lang === 'th' ? 'อัดเสียงร้องสด / ฮัมทำนองในห้องนี้' : 'Record vocal scratchpad in this bar'}
                        >
                          <span>{bar.vocalAudio ? t.vocalHasTrack : t.vocalRecordBtn}</span>
                          {bar.vocalAudio && (
                            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" title="Recorded vocal available"></span>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};
