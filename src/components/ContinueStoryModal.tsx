'use client';

import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  Plus,
  X,
  BookOpen,
  Check,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import {
  POPULAR_CHORD_FORMULAS,
  resolveChordProgressionFormula,
} from '@/lib/chordUtils';
import type { SectionType, SongSection } from '@/types/song';

export interface ContinueStoryConfig {
  sectionType: SectionType;
  sectionName: string;
  barsCount: number;
  chords: string[];
  storyDirection: string;
  customTopic: string;
  actionType: 'ai-lyric' | 'blank';
}

interface ContinueStoryModalProps {
  isOpen: boolean;
  afterSection: SongSection;
  songKey?: string;
  existingSections?: SongSection[];
  onClose: () => void;
  onConfirm: (config: ContinueStoryConfig) => void;
}

interface SectionOption {
  type: SectionType;
  labelTh: string;
  labelEn: string;
  descTh: string;
  descEn: string;
  recommendedAfter: SectionType[];
  badgeTh?: string;
  badgeEn?: string;
  defaultBars: number;
  suggestedFormulaId: string;
}

const SECTION_OPTIONS: SectionOption[] = [
  {
    type: 'pre-chorus',
    labelTh: 'Pre-Chorus (ท่อนส่ง)',
    labelEn: 'Pre-Chorus (Build-up)',
    descTh: 'ไต่ระดับอารมณ์ เพิ่มความตึงเครียด ส่งพลังเข้าสู่ท่อนฮุก',
    descEn: 'Build up tension and energy driving into the chorus',
    recommendedAfter: ['verse', 'intro'],
    badgeTh: 'แนะนำต่อจาก Verse',
    badgeEn: 'Recommended after Verse',
    defaultBars: 4,
    suggestedFormulaId: 'IV-V-iii-vi',
  },
  {
    type: 'chorus',
    labelTh: 'Chorus (ท่อนฮุก)',
    labelEn: 'Chorus (Peak / Hook)',
    descTh: 'จุดระบายความรู้สึก เมโลดี้ติดหู ใจความสำคัญของเพลง',
    descEn: 'Emotional climax and memorable core message of the song',
    recommendedAfter: ['pre-chorus', 'verse', 'bridge', 'solo'],
    badgeTh: 'จุดไคลแมกซ์ฮิต',
    badgeEn: 'Hit Climax',
    defaultBars: 4,
    suggestedFormulaId: 'I-V-vi-IV',
  },
  {
    type: 'verse',
    labelTh: 'Verse (ท่อนร้อง/เล่าเรื่อง)',
    labelEn: 'Verse (Storyline)',
    descTh: 'เล่ารายละเอียด เหตุการณ์ เรื่องราว หรือมุมมองใหม่',
    descEn: 'Narrate new story details, scenery, and personal reflection',
    recommendedAfter: ['intro', 'chorus'],
    badgeTh: 'เล่าเรื่องต่อ',
    badgeEn: 'Continue Story',
    defaultBars: 4,
    suggestedFormulaId: 'I-V-vi-IV',
  },
  {
    type: 'bridge',
    labelTh: 'Bridge (ท่อนแยก)',
    labelEn: 'Bridge (Departure / Twist)',
    descTh: 'เปลี่ยนมู้ด คอร์ดใหม่ หักมุมความคิด หรือถามใจตัวเอง',
    descEn: 'Shift perspective with fresh chord motion or twist',
    recommendedAfter: ['chorus'],
    badgeTh: 'เปลี่ยนมุมมอง',
    badgeEn: 'Perspective Shift',
    defaultBars: 4,
    suggestedFormulaId: 'vi-V-IV-III7',
  },
  {
    type: 'solo',
    labelTh: 'Solo (ท่อนโซโล่ดนตรี)',
    labelEn: 'Solo (Instrumental)',
    descTh: 'พักเสียงร้อง ให้เครื่องดนตรีกีตาร์/เปียโนโชว์อารมณ์',
    descEn: 'Instrumental passage highlighting lead guitar or piano',
    recommendedAfter: ['chorus', 'bridge'],
    badgeTh: 'โซโล่ดนตรี',
    badgeEn: 'Instrumental',
    defaultBars: 4,
    suggestedFormulaId: 'I-V-vi-IV',
  },
  {
    type: 'outro',
    labelTh: 'Outro (ท่อนจบ)',
    labelEn: 'Outro (Ending / Resolution)',
    descTh: 'คลี่คลาย ปล่อยวาง สรุปข้อคิด ส่งท้ายเพลงอย่างละมุน',
    descEn: 'Gentle closure, fading emotion, and final resolution',
    recommendedAfter: ['chorus', 'solo'],
    badgeTh: 'ท่อนจบ',
    badgeEn: 'Ending',
    defaultBars: 4,
    suggestedFormulaId: 'IV-V-iii-vi',
  },
];

const STORY_DIRECTIONS = [
  {
    id: 'build-up',
    emoji: '📈',
    labelTh: 'ไต่ระดับความรู้สึก ส่งเข้าฮุก (Build-up Tension)',
    labelEn: 'Build-up Tension (Lead into Hook)',
    descTh: 'เริ่มเก็บอาการไม่อยู่ ความรู้สึกพุ่งทะยาน ส่งต่อความรู้สึกแรงขึ้น',
    descEn: 'Emotions escalating towards the climax',
    bestFor: ['pre-chorus'],
  },
  {
    id: 'peak-hook',
    emoji: '💥',
    labelTh: 'ระบายความจริงในใจ ฮุกเด็ด (Peak Emotion & Hook)',
    labelEn: 'Peak Emotion & Hook (Full Release)',
    descTh: 'บอกความในใจชัดเจน คำร้องติดปาก ประโยคไฮไลต์ของเพลง',
    descEn: 'Raw emotional honesty and memorable hook phrases',
    bestFor: ['chorus'],
  },
  {
    id: 'continue-narrative',
    emoji: '📖',
    labelTh: 'เล่าเหตุการณ์ถัดไป เล่าเรื่องต่อ (Continue Story)',
    descTh: 'ขยายความว่าเกิดอะไรขึ้นต่อ มีดีเทลฉาก วันเวลา หรือการกระทำ',
    descEn: 'Moving the narrative forward with scene details',
    bestFor: ['verse'],
  },
  {
    id: 'twist-reflect',
    emoji: '🌧️',
    labelTh: 'เปลี่ยนมุมมอง ย้อนถามตัวเอง (Twist / Bridge)',
    descTh: 'ถ้าวันนั้นไม่เป็นแบบนี้... เราจะยังเหมือนเดิมไหม',
    descEn: 'Introspective doubt or turning-point realization',
    bestFor: ['bridge'],
  },
  {
    id: 'warm-resolution',
    emoji: '🌅',
    labelTh: 'คลี่คลาย ปล่อยวาง อวยพร (Warm Resolution)',
    descTh: 'ยอมรับความจริง อยู่กับความทรงจำอย่างอบอุ่นและเข้าใจ',
    descEn: 'Peaceful acceptance and warm closure',
    bestFor: ['outro'],
  },
];

export const ContinueStoryModal: React.FC<ContinueStoryModalProps> = ({
  isOpen,
  afterSection,
  songKey = 'C',
  existingSections = [],
  onClose,
  onConfirm,
}) => {
  const { lang } = useLanguage();

  // Inferred default next section based on afterSection
  const initialSectionType = useMemo<SectionType>(() => {
    if (afterSection.type === 'verse') return 'pre-chorus';
    if (afterSection.type === 'pre-chorus') return 'chorus';
    if (afterSection.type === 'chorus') return 'bridge';
    if (afterSection.type === 'bridge') return 'chorus';
    if (afterSection.type === 'intro') return 'verse';
    return 'chorus';
  }, [afterSection.type]);

  const [sectionType, setSectionType] = useState<SectionType>(initialSectionType);

  // Auto-calculated smart default section name
  const defaultSectionName = useMemo(() => {
    const typeCount = existingSections.filter((s) => s.type === sectionType).length;
    const typeLabel =
      sectionType === 'verse'
        ? 'Verse'
        : sectionType === 'chorus'
        ? 'Chorus'
        : sectionType === 'pre-chorus'
        ? 'Pre-Chorus'
        : sectionType === 'bridge'
        ? 'Bridge'
        : sectionType === 'solo'
        ? 'Solo'
        : 'Outro';

    if (sectionType === 'pre-chorus' || sectionType === 'bridge' || sectionType === 'outro') {
      return typeCount > 0 ? `${typeLabel} ${typeCount + 1}` : typeLabel;
    }
    return `${typeLabel} ${typeCount + 1}`;
  }, [existingSections, sectionType]);

  const [sectionName, setSectionName] = useState<string>(defaultSectionName);
  const [hasCustomName, setHasCustomName] = useState<boolean>(false);

  // Bars count selection
  const [barsCount, setBarsCount] = useState<number>(4);

  // Chords mode: 'inherit' | formulaId | 'custom'
  const inheritChords = useMemo(() => {
    const chords = afterSection.bars.flatMap((b) => b.chords).filter(Boolean);
    return chords.length > 0 ? chords : ['C', 'G', 'Am', 'F'];
  }, [afterSection.bars]);

  const [chordMode, setChordMode] = useState<string>('inherit');
  const [customChordsInput, setCustomChordsInput] = useState<string>(inheritChords.join(', '));

  // Story direction & custom topic
  const initialStoryDir = useMemo(() => {
    const matched = STORY_DIRECTIONS.find((d) => d.bestFor.includes(sectionType));
    return matched?.id || 'build-up';
  }, [sectionType]);

  const [storyDirectionId, setStoryDirectionId] = useState<string>(initialStoryDir);
  const [customTopic, setCustomTopic] = useState<string>('');

  // Extract last lyrics line from previous section for context
  const previousLyricsPreview = useMemo(() => {
    const lines = afterSection.bars
      .map((b) => b.lyrics.trim())
      .filter(Boolean);
    if (lines.length === 0) return '';
    return lines.slice(-2).join(' / ');
  }, [afterSection.bars]);

  // Handle switching section type
  const handleSelectSectionType = (type: SectionType) => {
    setSectionType(type);
    if (!hasCustomName) {
      const typeCount = existingSections.filter((s) => s.type === type).length;
      const typeLabel =
        type === 'verse'
          ? 'Verse'
          : type === 'chorus'
          ? 'Chorus'
          : type === 'pre-chorus'
          ? 'Pre-Chorus'
          : type === 'bridge'
          ? 'Bridge'
          : type === 'solo'
          ? 'Solo'
          : 'Outro';
      setSectionName(typeCount > 0 ? `${typeLabel} ${typeCount + 1}` : typeLabel);
    }
    // Update story direction to match new section type if not explicitly overridden
    const matched = STORY_DIRECTIONS.find((d) => d.bestFor.includes(type));
    if (matched) {
      setStoryDirectionId(matched.id);
    }
  };

  // Compute active chords based on chordMode
  const activeChords = useMemo(() => {
    if (chordMode === 'inherit') {
      return inheritChords;
    }
    if (chordMode === 'custom') {
      const parts = customChordsInput
        .split(/[,;\s]+/)
        .map((c) => c.trim())
        .filter(Boolean);
      return parts.length > 0 ? parts : inheritChords;
    }
    const resolved = resolveChordProgressionFormula(chordMode, songKey || 'C');
    return resolved.length > 0 ? resolved : inheritChords;
  }, [chordMode, customChordsInput, inheritChords, songKey]);

  if (!isOpen) return null;

  const handleAction = (actionType: 'ai-lyric' | 'blank') => {
    const selectedDir = STORY_DIRECTIONS.find((d) => d.id === storyDirectionId);
    const dirLabel = (selectedDir ? (lang === 'th' ? selectedDir.labelTh : (selectedDir.labelEn || selectedDir.labelTh)) : '') || '';
    onConfirm({
      sectionType,
      sectionName: sectionName.trim() || defaultSectionName,
      barsCount,
      chords: activeChords,
      storyDirection: dirLabel,
      customTopic: customTopic.trim(),
      actionType,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto animate-fadeIn">
      <div className="max-w-2xl w-full my-8 rounded-3xl bg-surface-1 border border-hairline shadow-e3 p-5 sm:p-7 space-y-5">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 border-b border-hairline pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-accent-500 text-white flex items-center justify-center shadow-e1 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-ink-900 leading-tight">
                {lang === 'th' ? 'เลือกรูปแบบการต่อเรื่องราวท่อนถัดไป' : 'Choose How to Continue the Next Section'}
              </h2>
              <p className="text-xs text-ink-500">
                {lang === 'th'
                  ? `ต่อเรื่องราวจาก "${afterSection.name}" (${afterSection.type}) ให้ลื่นไหลและตรงตามโครงสร้างเพลงที่คุณต้องการ`
                  : `Continue the story from "${afterSection.name}" (${afterSection.type}) exactly the way you want`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-surface-2 text-ink-400 hover:text-ink-900 transition cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Previous Section Context Preview */}
        <div className="p-3.5 rounded-2xl bg-surface-2 border border-hairline text-xs space-y-1.5">
          <div className="flex items-center justify-between text-ink-500 font-medium">
            <span className="flex items-center gap-1.5 font-bold text-ink-800">
              <BookOpen className="w-3.5 h-3.5 text-accent-text" />
              <span>{lang === 'th' ? 'ท่อนเดิมก่อนหน้า:' : 'Preceding Section:'} {afterSection.name}</span>
            </span>
            <span className="font-mono text-[11px] text-ink-400">
              {afterSection.bars.length} {lang === 'th' ? 'ห้อง' : 'bars'} · คอร์ด: {inheritChords.slice(0, 4).join(' → ')}
            </span>
          </div>
          {previousLyricsPreview && (
            <p className="text-ink-700 italic truncate pl-5 border-l-2 border-accent-500/40">
              &ldquo;{previousLyricsPreview}&rdquo;
            </p>
          )}
        </div>

        {/* 1. Section Type Selector */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-ink-900 flex items-center gap-1.5">
              <span>1. {lang === 'th' ? 'เลือกประเภทท่อนที่ต้องการแต่งต่อ:' : 'Choose Next Section Type:'}</span>
            </label>
            <span className="text-[11px] text-ink-400">
              {lang === 'th' ? 'คลิกเปลี่ยนได้อิสระ' : 'Select freely'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SECTION_OPTIONS.map((opt) => {
              const isSelected = sectionType === opt.type;
              const isRecommended = opt.recommendedAfter.includes(afterSection.type);

              return (
                <button
                  key={opt.type}
                  type="button"
                  onClick={() => handleSelectSectionType(opt.type)}
                  className={`p-3 rounded-2xl text-left border transition relative cursor-pointer ${
                    isSelected
                      ? 'bg-accent-500/10 border-accent-500 text-ink-900 shadow-e1 font-bold'
                      : 'bg-surface-2 hover:bg-surface-3 border-hairline text-ink-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-ink-900">
                      {lang === 'th' ? opt.labelTh : opt.labelEn}
                    </span>
                    {isSelected && <Check className="w-4 h-4 text-accent-text shrink-0" />}
                  </div>
                  <p className="text-[10px] text-ink-500 line-clamp-2 leading-relaxed">
                    {lang === 'th' ? opt.descTh : opt.descEn}
                  </p>
                  {isRecommended && (
                    <span className="inline-block mt-1.5 px-1.5 py-0.5 rounded-md bg-accent-500/15 text-accent-text font-bold text-[9px] uppercase tracking-wider">
                      ★ {lang === 'th' ? opt.badgeTh : opt.badgeEn}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Section Name Input */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[11px] font-semibold text-ink-500 shrink-0">
              {lang === 'th' ? 'ชื่อท่อน:' : 'Section Name:'}
            </span>
            <input
              type="text"
              value={sectionName}
              onChange={(e) => {
                setSectionName(e.target.value);
                setHasCustomName(true);
              }}
              placeholder="ระบุชื่อท่อน เช่น Verse 2, Pre-Chorus..."
              className="flex-1 px-3 py-1.5 rounded-xl bg-surface-2 border border-hairline text-xs font-semibold text-ink-900 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
            />
          </div>
        </div>

        {/* 2. Bars Count & Chords Progression */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          {/* Bars Count */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-ink-900 block">
              2. {lang === 'th' ? 'จำนวนห้อง (Bars):' : 'Number of Bars:'}
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {[2, 4, 8].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setBarsCount(num)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer border ${
                    barsCount === num
                      ? 'bg-accent-500 text-white border-accent-500 shadow-e1'
                      : 'bg-surface-2 hover:bg-surface-3 text-ink-700 border-hairline'
                  }`}
                >
                  {num} {lang === 'th' ? 'ห้อง' : 'Bars'}
                  <span className="block text-[9px] font-normal opacity-80">
                    {num === 2 ? 'กระชับ' : num === 4 ? 'มาตรฐาน' : 'เต็มอารมณ์'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Chords Selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-ink-900 block">
              3. {lang === 'th' ? 'ทางคอร์ดของท่อนใหม่:' : 'Chord Progression:'}
            </label>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setChordMode('inherit')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer border ${
                  chordMode === 'inherit'
                    ? 'bg-accent-500 text-white border-accent-500 shadow-e1'
                    : 'bg-surface-2 hover:bg-surface-3 text-ink-700 border-hairline'
                }`}
              >
                🔄 {lang === 'th' ? 'คอร์ดตามท่อนเดิม' : 'Follow Previous'}
              </button>

              {POPULAR_CHORD_FORMULAS.map((formula) => {
                const isSelected = chordMode === formula.id;
                return (
                  <button
                    key={formula.id}
                    type="button"
                    onClick={() => setChordMode(formula.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer border ${
                      isSelected
                        ? 'bg-accent-500 text-white border-accent-500 shadow-e1'
                        : 'bg-surface-2 hover:bg-surface-3 text-ink-700 border-hairline'
                    }`}
                  >
                    {formula.formula}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setChordMode('custom')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer border ${
                  chordMode === 'custom'
                    ? 'bg-accent-500 text-white border-accent-500 shadow-e1'
                    : 'bg-surface-2 hover:bg-surface-3 text-ink-700 border-hairline'
                }`}
              >
                ✏️ {lang === 'th' ? 'พิมพ์คอร์ดเอง' : 'Custom'}
              </button>
            </div>

            {/* Chords Preview / Custom Input */}
            {chordMode === 'custom' ? (
              <input
                type="text"
                value={customChordsInput}
                onChange={(e) => setCustomChordsInput(e.target.value)}
                placeholder="ระบุคอร์ดคั่นด้วยจุลภาค เช่น C, G, Am, F..."
                className="w-full px-3 py-1.5 rounded-xl bg-surface-2 border border-hairline text-xs font-mono text-ink-900 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
              />
            ) : (
              <div className="p-2 rounded-xl bg-surface-inset border border-hairline text-xs font-mono font-bold text-accent-text flex items-center justify-between">
                <span>คอร์ดที่ใช้: {activeChords.join(' → ')}</span>
                <span className="text-[10px] text-ink-400 font-sans font-normal">
                  (Key {songKey})
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 4. Story Direction & Emotion Arc */}
        <div className="space-y-2.5 pt-1">
          <label className="text-xs font-bold text-ink-900 block">
            4. {lang === 'th' ? 'ทิศทางอารมณ์ & การต่อเรื่องราว (Story Arc):' : 'Story Arc & Narrative Flow:'}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {STORY_DIRECTIONS.map((dir) => {
              const isSelected = storyDirectionId === dir.id;
              return (
                <button
                  key={dir.id}
                  type="button"
                  onClick={() => setStoryDirectionId(dir.id)}
                  className={`p-2.5 rounded-2xl text-left border transition cursor-pointer flex items-start gap-2.5 ${
                    isSelected
                      ? 'bg-accent-500/10 border-accent-500 text-ink-900 font-bold shadow-e1'
                      : 'bg-surface-2 hover:bg-surface-3 border-hairline text-ink-700'
                  }`}
                >
                  <span className="text-base leading-none shrink-0 mt-0.5">{dir.emoji}</span>
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-xs font-bold leading-tight">
                      {lang === 'th' ? dir.labelTh : dir.labelEn}
                    </p>
                    <p className="text-[10px] text-ink-500 leading-normal line-clamp-1">
                      {lang === 'th' ? dir.descTh : dir.descEn}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Custom Topic / Cue */}
          <div className="pt-1">
            <input
              type="text"
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              placeholder={
                lang === 'th'
                  ? 'คีย์เวิร์ดเพิ่มเติมสำหรับท่อนนี้ (ไม่บังคับ) เช่น พูดถึงรถไฟ, กลิ่นฝน, สัญญาใจ...'
                  : 'Additional topic or keywords (optional)...'
              }
              className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-hairline text-xs text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-3 border-t border-hairline flex-wrap">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-hairline text-xs font-semibold text-ink-700 transition cursor-pointer"
          >
            {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
          </button>

          <button
            type="button"
            onClick={() => handleAction('blank')}
            className="flex-1 py-2.5 px-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-hairline text-xs font-bold text-ink-800 transition cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4 text-ink-500" />
            <span>{lang === 'th' ? '+ เพิ่มท่อนเปล่า (แต่งเอง)' : '+ Add Blank Section'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleAction('ai-lyric')}
            className="flex-1 py-2.5 px-4 rounded-xl bg-accent-500 hover:bg-accent-hover text-white text-xs sm:text-sm font-bold transition shadow-e1 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>
              {lang === 'th' ? '✨ เสกเนื้อเพลงท่อนนี้ด้วย AI' : '✨ Generate Lyrics with AI'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
