'use client';

import React, { useState } from 'react';
import {
  CREDIT_PACKAGES,
  type CreditPackage,
  type CreditTransaction,
  getCreditBalance,
  getCreditTransactions,
  canAfford,
  deductCredits,
  topUpCredits,
} from '@/lib/creditManager';
import {
  THAI_RHYME_GROUPS,
  findThaiRhymes,
  countThaiEnglishSyllables,
} from '@/lib/thaiRhymeHelper';
import { useLanguage } from '@/context/LanguageContext';
import type { SongProject } from '@/types/song';
import {
  applyNaturalPromptToSong,
  applyDirectorPatchToSong,
  buildSongDirectorSummary,
  type AiDirectorPatch,
} from '@/lib/aiSongDirector';

export interface AdvanceTargetSectionContext {
  sectionId: string;
  sectionName: string;
  sectionType: string;
  chords: string[];
  existingLyrics: string;
}

interface AdvanceModeModalProps {
  targetSection?: AdvanceTargetSectionContext | null;
  song?: SongProject;
  onCreditsChange: (balance: number) => void;
  onApplyLyrics?: (sectionId: string, lines: string[]) => void;
  onApplySongUpdate?: (nextSong: SongProject) => void;
  onClose: () => void;
}

interface GeneratedLyricResult {
  isSimulated: boolean;
  model: string;
  lines: Array<{ chord: string; text: string; syllables: number }>;
  fullLyrics: string;
  tip: string;
}

type AdvanceTab = 'rhyme' | 'ai-lyrics' | 'ai-director' | 'wallet';

const AI_DIRECTOR_PRESETS = [
  'ตั้งความเร็ว 95 bpm คีย์ G ท่อน Intro เกาเบาๆ 60% ท่อน Chorus ลีดแตกหนัก 100% กลองเป็นชุด เบส 80%',
  'เปลี่ยนเป็นเพลง Ballad ช้าๆ 72 bpm ท่อน Verse ปิดกลอง เหลือเปียโนเบาๆ 55% แล้วท่อน Solo ลีดแตกอุ่น 90%',
  'ใช้กีตาร์สายไนลอน ห้องคอนเสิร์ต (Unplugged Hall) ท่อน Chorus ตีคอร์ดแคมป์ไฟ ลีดหยอดลูกส่งแบบคลีน คอร์ด C G Am F',
];

const MOOD_PRESETS = [
  { id: 'warm', th: 'อบอุ่น (Warm)', en: 'Warm & Cozy' },
  { id: 'nostalgic', th: 'คิดถึง (Nostalgic)', en: 'Nostalgic' },
  { id: 'crush', th: 'แอบรัก (Crush)', en: 'Sweet Crush' },
  { id: 'heartbreak', th: 'อกหัก (Heartbreak)', en: 'Heartbreak' },
  { id: 'hopeful', th: 'ให้กำลังใจ (Hopeful)', en: 'Hopeful' },
];

const AI_LYRICS_COST = 1;

export const AdvanceModeModal: React.FC<AdvanceModeModalProps> = ({
  targetSection,
  song,
  onCreditsChange,
  onApplyLyrics,
  onApplySongUpdate,
  onClose,
}) => {
  const { lang } = useLanguage();
  const [activeTab, setActiveTab] = useState<AdvanceTab>(targetSection ? 'ai-lyrics' : 'rhyme');

  // Wallet State
  const [balance, setBalance] = useState<number>(() => getCreditBalance());
  const [transactions, setTransactions] = useState<CreditTransaction[]>(() => getCreditTransactions());
  const [selectedPromptPayPkg, setSelectedPromptPayPkg] = useState<CreditPackage | null>(null);
  const [walletFeedback, setWalletFeedback] = useState<string | null>(null);

  // Thai Rhyme Helper State (0 Credits)
  const [rhymeInput, setRhymeInput] = useState('หัวใจ');
  const [copiedWord, setCopiedWord] = useState<string | null>(null);

  // AI Lyric Co-Pilot State (1 Credit)
  const [mood, setMood] = useState('อบอุ่น (Warm)');
  const [topic, setTopic] = useState('');
  const [showCostConfirm, setShowCostConfirm] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<GeneratedLyricResult | null>(null);

  // AI Song Director State (0 Credits)
  const [directorPrompt, setDirectorPrompt] = useState('');
  const [isApplyingDirector, setIsApplyingDirector] = useState(false);
  const [directorActions, setDirectorActions] = useState<string[]>([]);
  const [directorEngineInfo, setDirectorEngineInfo] = useState<{
    model: string;
    isSimulated: boolean;
    tip: string;
  } | null>(null);
  const [directorNotice, setDirectorNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const handleApplyDirectorPrompt = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = directorPrompt.trim();
    if (!song || !onApplySongUpdate || !trimmed) return;

    setIsApplyingDirector(true);
    setDirectorNotice(null);
    setDirectorEngineInfo(null);

    const finalizeOffline = (tipText: string) => {
      const localRes = applyNaturalPromptToSong(trimmed, song);
      setDirectorEngineInfo({
        model: 'demo-offline-director',
        isSimulated: true,
        tip: tipText,
      });
      if (localRes.summaryActions.length === 0) {
        setDirectorActions([]);
        setDirectorNotice({
          ok: false,
          text:
            lang === 'th'
              ? 'ยังไม่พบคำสั่งตั้งค่าที่รู้จัก — ลองพิมพ์ เช่น "95 bpm คีย์ G ท่อน Intro เกาเบาๆ ท่อน Chorus ลีดแตกหนัก กลองเป็นชุด เบส 80%" หรือใส่ GEMINI_API_KEY ใน .env.local เพื่อใช้ Gemini 4 Hydrogen เข้าใจประโยคอิสระ'
              : 'No recognized offline commands matched — try e.g. "95 bpm Key G, Chorus lead distortion" or set GEMINI_API_KEY in .env.local for Gemini 4 Hydrogen.',
        });
        return;
      }
      onApplySongUpdate(localRes.updatedSong);
      setDirectorActions(localRes.summaryActions);
      setDirectorNotice({
        ok: true,
        text:
          lang === 'th'
            ? `นำคำสั่งไปปรับค่าในเพลงเรียบร้อย (${localRes.summaryActions.length} รายการ)`
            : `Applied ${localRes.summaryActions.length} configuration changes to your song!`,
      });
    };

    try {
      const res = await fetch('/api/advance/director', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: trimmed,
          songSummary: buildSongDirectorSummary(song),
        }),
      });

      if (!res.ok) {
        finalizeOffline('เชื่อมต่อ API ไม่สำเร็จ — ทำงานผ่านโหมดออฟไลน์แทนอัตโนมัติ');
        return;
      }

      const data = (await res.json()) as {
        isSimulated: boolean;
        model: string;
        patch: AiDirectorPatch | null;
        tip: string;
      };

      if (!data.isSimulated && data.patch) {
        const applied = applyDirectorPatchToSong(data.patch, song);
        if (applied.summaryActions.length > 0) {
          onApplySongUpdate(applied.updatedSong);
          setDirectorActions(applied.summaryActions);
          setDirectorEngineInfo({
            model: data.model,
            isSimulated: false,
            tip: data.tip,
          });
          setDirectorNotice({
            ok: true,
            text:
              lang === 'th'
                ? `${data.model} ปรับค่าในเพลงเรียบร้อย (${applied.summaryActions.length} รายการ)`
                : `${data.model} applied ${applied.summaryActions.length} updates to your song!`,
          });
          return;
        }
      }

      finalizeOffline(data.tip);
    } catch {
      finalizeOffline('ใช้งานแบบออฟไลน์อัตโนมัติ (ไม่ได้เชื่อมต่อเซิร์ฟเวอร์ AI)');
    } finally {
      setIsApplyingDirector(false);
    }
  };

  const rhymeResult = findThaiRhymes(rhymeInput);
  const rhymeSyllables = countThaiEnglishSyllables(rhymeInput);
  const activeChords = targetSection?.chords?.length ? targetSection.chords : ['C', 'G', 'Am', 'F'];

  const handleCopyRhyme = async (word: string) => {
    try {
      await navigator.clipboard?.writeText(word);
    } catch {
      // ignore clipboard restrictions
    }
    setCopiedWord(word);
    setTimeout(() => setCopiedWord((cur) => (cur === word ? null : cur)), 1500);
  };

  const handleRequestGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    setAiError(null);
    if (!topic.trim()) {
      setAiError(lang === 'th' ? 'กรุณาใส่หัวข้อหรือเรื่องราวของท่อนนี้ก่อนครับ' : 'Please enter a topic or story first.');
      return;
    }
    if (!canAfford(AI_LYRICS_COST)) {
      setShowCostConfirm(false);
      setAiError(
        lang === 'th'
          ? 'เครดิตไม่เพียงพอ (ต้องใช้ 1 เครดิต) กรุณาเติมเครดิตในแท็บ กระเป๋าเครดิต'
          : 'Insufficient credits (requires 1 credit). Please top up in Wallet.'
      );
      return;
    }
    setShowCostConfirm(true);
  };

  const handleConfirmGenerate = async () => {
    setShowCostConfirm(false);
    if (!canAfford(AI_LYRICS_COST)) {
      setAiError(lang === 'th' ? 'เครดิตไม่เพียงพอ กรุณาเติมเครดิต' : 'Insufficient credits');
      return;
    }

    setIsGenerating(true);
    setAiError(null);
    try {
      const res = await fetch('/api/advance/lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mood,
          topic: topic.trim(),
          chordProgression: activeChords,
          existingLyrics: targetSection?.existingLyrics || undefined,
          sectionType: targetSection?.sectionType || 'verse',
        }),
      });

      const data = (await res.json()) as GeneratedLyricResult & { error?: string };
      if (!res.ok) {
        setAiError(data.error || 'Failed to generate lyrics');
        setIsGenerating(false);
        return;
      }

      const deduction = deductCredits(
        AI_LYRICS_COST,
        `AI Lyrics: ${targetSection?.sectionName || 'Song'} (${topic.trim().slice(0, 24)})`
      );
      if (deduction.success) {
        setBalance(deduction.balance);
        setTransactions(getCreditTransactions());
        onCreditsChange(deduction.balance);
      }
      setAiResult(data);
    } catch {
      setAiError(lang === 'th' ? 'ไม่สามารถเชื่อมต่อบริการ AI ชั่วคราว' : 'Network error calling AI endpoint');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleConfirmMockPayment = (pkg: CreditPackage) => {
    const res = topUpCredits(pkg);
    if (res.success) {
      setBalance(res.balance);
      setTransactions(getCreditTransactions());
      onCreditsChange(res.balance);
      setSelectedPromptPayPkg(null);
      setWalletFeedback(
        lang === 'th'
          ? `เติมสำเร็จ +${pkg.credits} Credits (${pkg.priceThb}฿) — ยอดคงเหลือ ${res.balance} Credits`
          : `Topped up +${pkg.credits} Credits (${pkg.priceThb}฿)`
      );
      setTimeout(() => setWalletFeedback(null), 4000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full p-5 sm:p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col">
        {/* Header + Credit Chip */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 shrink-0">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-black text-lg text-slate-900">
                ⚡ {lang === 'th' ? 'Advance Mode & คลังคำสัมผัส' : 'Advance Mode & Lyric Studio'}
              </h3>
              <button
                type="button"
                onClick={() => setActiveTab('wallet')}
                className="px-2.5 py-0.5 rounded-full bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-900 font-black text-xs cursor-pointer transition"
              >
                ⚡ {balance} Credits
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {lang === 'th'
                ? 'ช่วยหาคำสัมผัสไทยฟรี (0 เครดิต) หรือแต่งเนื้อเพลงด้วย AI ตามคอร์ดจริง'
                : 'Free offline Thai rhyme lookup (0 credits) & credit-protected AI Lyric Co-Pilot'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs cursor-pointer shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Sub-Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl border border-slate-200 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('rhyme')}
            className={`flex-1 px-3 py-2 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer whitespace-nowrap ${
              activeTab === 'rhyme'
                ? 'bg-white text-[#1A73E8] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🎵 {lang === 'th' ? 'คำสัมผัสไทย (0 เครดิต)' : 'Thai Rhyme (0 Credits)'}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ai-lyrics')}
            className={`flex-1 px-3 py-2 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer whitespace-nowrap ${
              activeTab === 'ai-lyrics'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ✨ {lang === 'th' ? 'AI Lyric Co-Pilot (1 เครดิต)' : 'AI Lyrics (1 Credit)'}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ai-director')}
            className={`flex-1 px-3 py-2 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer whitespace-nowrap ${
              activeTab === 'ai-director'
                ? 'bg-white text-purple-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🪄 {lang === 'th' ? 'AI สั่งตั้งค่าแอป (0 เครดิต)' : 'AI Studio Director (0 Credits)'}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('wallet')}
            className={`flex-1 px-3 py-2 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer whitespace-nowrap ${
              activeTab === 'wallet'
                ? 'bg-white text-amber-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            💳 {lang === 'th' ? 'เติมเครดิต / ประวัติ' : 'Wallet & Top-Up'}
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-4">
          {/* ─── TAB 1: THAI RHYME LOOKUP (0 CREDITS) ─── */}
          {activeTab === 'rhyme' && (
            <div className="space-y-3.5">
              <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex items-center justify-between gap-2 text-xs">
                <span className="font-bold text-emerald-900">
                  ✓ {lang === 'th' ? 'ใช้ฟรี 0 เครดิต — ทำงานออฟไลน์ 100% บนอุปกรณ์' : 'Free Offline Tool (0 Credits)'}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-white text-emerald-800 border border-emerald-200 font-bold">
                  {rhymeSyllables} {lang === 'th' ? 'พยางค์' : 'syllables'}
                </span>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">
                  {lang === 'th' ? 'พิมพ์คำลงท้ายท่อนหรือประโยคที่ต้องการหาสัมผัส:' : 'Enter a Thai word or lyric ending:'}
                </label>
                <input
                  type="text"
                  value={rhymeInput}
                  onChange={(e) => setRhymeInput(e.target.value)}
                  placeholder="เช่น หัวใจ, ท้องฟ้า, ความฝัน, เธอ, คิดถึง..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-[#1A73E8] focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {/* Quick Rhyme Group Chips */}
              <div className="flex flex-wrap gap-1.5">
                {THAI_RHYME_GROUPS.slice(0, 10).map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setRhymeInput(g.examples[0])}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition cursor-pointer ${
                      rhymeResult.groupLabel === g.groupLabel
                        ? 'bg-[#1A73E8] text-white border-[#1A73E8]'
                        : 'bg-slate-50 hover:bg-blue-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    {g.examples[0]} ({g.groupLabel.split(' ')[0]})
                  </button>
                ))}
              </div>

              {/* Results Grid */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-black text-slate-800">
                    {lang === 'th' ? 'กลุ่มสัมผัส:' : 'Rhyme Family:'}{' '}
                    <span className="text-[#1A73E8]">{rhymeResult.groupLabel}</span>
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {lang === 'th' ? 'แตะที่คำเพื่อคัดลอก' : 'Tap any word to copy'}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {rhymeResult.suggestions.map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => handleCopyRhyme(w)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        copiedWord === w
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white hover:bg-blue-50 hover:border-blue-300 text-slate-800 border-slate-200 shadow-2xs'
                      }`}
                    >
                      {copiedWord === w ? `✓ ${w}` : w}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ─── TAB 2: AI LYRIC CO-PILOT (COST-PROTECTED) ─── */}
          {activeTab === 'ai-lyrics' && (
            <div className="space-y-3.5">
              {targetSection && (
                <div className="p-3 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-black text-indigo-950">
                      🎼 {lang === 'th' ? 'ท่อนเป้าหมาย:' : 'Target Section:'} {targetSection.sectionName} ({targetSection.sectionType})
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-white text-indigo-700 border border-indigo-200 font-bold text-[11px]">
                      {activeChords.join(' → ')}
                    </span>
                  </div>
                  {targetSection.existingLyrics && (
                    <div className="text-[11px] text-indigo-800/80 truncate">
                      {lang === 'th' ? 'เนื้อเดิม:' : 'Draft:'} &ldquo;{targetSection.existingLyrics}&rdquo;
                    </div>
                  )}
                </div>
              )}

              <form onSubmit={handleRequestGenerate} className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">
                    {lang === 'th' ? 'อารมณ์เพลง (Mood):' : 'Mood:'}
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {MOOD_PRESETS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMood(lang === 'th' ? m.th : m.en)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition cursor-pointer ${
                          mood === (lang === 'th' ? m.th : m.en) || mood.includes(m.id)
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-slate-50 hover:bg-indigo-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        {lang === 'th' ? m.th : m.en}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">
                    {lang === 'th' ? 'เรื่องราว / คีย์เวิร์ดของท่อนนี้ (Topic):' : 'Topic / Imagery:'}
                  </label>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder={
                      lang === 'th'
                        ? 'เช่น กาแฟอุ่นๆ ยามเช้า, แอบมองเธอข้างหน้าต่าง, คำสัญญาใต้แสงดาว...'
                        : 'e.g., Sunday morning coffee, watching the rain, stargazing promise...'
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>

                {aiError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center justify-between gap-2">
                    <span>{aiError}</span>
                    {!canAfford(AI_LYRICS_COST) && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('wallet')}
                        className="px-2.5 py-1 rounded-lg bg-amber-500 text-white text-[11px] font-black cursor-pointer shrink-0"
                      >
                        {lang === 'th' ? 'เติมเครดิต' : 'Top Up'}
                      </button>
                    )}
                  </div>
                )}

                {/* Cost Preview Confirmation Box before calling /api/advance/lyrics */}
                {showCostConfirm ? (
                  <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 space-y-2.5 animate-in fade-in">
                    <div className="flex items-center justify-between text-xs font-black text-amber-950">
                      <span>⚠️ ยืนยันการใช้เครดิต (Cost Preview Confirmation)</span>
                      <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-950">
                        ใช้ 1 เครดิต / Uses 1 Credit
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-900">
                      {lang === 'th'
                        ? `ระบบจะหัก 1 เครดิต (คงเหลือหลังใช้ ${balance - 1} Credits) เพื่อแต่งเนื้อร้องให้เข้ากับคอร์ด ${activeChords.join(' → ')}`
                        : `This action will deduct 1 credit (${balance - 1} remaining) to generate lyrics matching ${activeChords.join(' → ')}.`}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleConfirmGenerate}
                        className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs cursor-pointer transition"
                      >
                        ✓ {lang === 'th' ? 'ยืนยัน (ใช้ 1 เครดิต / Uses 1 Credit)' : 'Confirm (Uses 1 Credit)'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCostConfirm(false)}
                        className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                      >
                        {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="submit"
                    disabled={isGenerating}
                    className="w-full py-2.5 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-black text-sm shadow-sm transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>✨</span>
                    <span>
                      {isGenerating
                        ? lang === 'th' ? 'กำลังแต่งเนื้อเพลง...' : 'Composing lyrics...'
                        : lang === 'th'
                        ? 'สร้างเนื้อเพลง AI (ใช้ 1 เครดิต / Uses 1 Credit)'
                        : 'Generate AI Lyrics (Uses 1 Credit)'}
                    </span>
                  </button>
                )}
              </form>

              {/* AI Output */}
              {aiResult && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-black text-slate-900">
                      🎤 {lang === 'th' ? 'คำแนะนำเนื้อเพลง' : 'Generated Lyrics'} ({aiResult.model})
                    </span>
                    {aiResult.isSimulated && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                        Simulation Mode
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    {aiResult.lines.map((line, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white border border-slate-200 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="px-2 py-0.5 rounded-md bg-blue-50 text-[#1A73E8] font-black shrink-0">
                            {line.chord}
                          </span>
                          <span className="text-slate-800 font-medium">{line.text}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold shrink-0">
                          {line.syllables} {lang === 'th' ? 'พยางค์' : 'syl'}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                    <span className="text-[11px] text-slate-500">{aiResult.tip}</span>
                    {targetSection && onApplyLyrics && (
                      <button
                        type="button"
                        onClick={() => {
                          onApplyLyrics(
                            targetSection.sectionId,
                            aiResult.lines.map((l) => l.text)
                          );
                          onClose();
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition cursor-pointer"
                      >
                        ✓ {lang === 'th' ? 'นำเนื้อเพลงใส่ท่อนนี้' : 'Apply Lyrics to Section'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── TAB 3: CREDIT WALLET, PACKAGES & PROMPTPAY QR ─── */}
          {activeTab === 'wallet' && (
            <div className="space-y-4">
              {walletFeedback && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold">
                  ✓ {walletFeedback}
                </div>
              )}

              {/* Top-Up Packages */}
              <div className="space-y-2">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">
                  ⚡ {lang === 'th' ? 'แพ็กเกจเติมเครดิต (PromptPay Top-Up)' : 'Credit Top-Up Packages'}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {CREDIT_PACKAGES.map((pkg) => (
                    <div
                      key={pkg.id}
                      className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 hover:border-blue-300 transition flex flex-col justify-between gap-2"
                    >
                      <div>
                        <div className="text-xs font-bold text-slate-500">{pkg.name}</div>
                        <div className="text-lg font-black text-slate-900 mt-0.5">
                          {pkg.credits} Credits
                        </div>
                        <div className="text-sm font-black text-[#1A73E8]">{pkg.priceThb}฿</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedPromptPayPkg(pkg)}
                        className="w-full py-1.5 rounded-xl bg-slate-900 hover:bg-[#1A73E8] text-white text-xs font-bold transition cursor-pointer"
                      >
                        {lang === 'th' ? `เลือก ${pkg.priceThb}฿` : `Top Up ${pkg.priceThb}฿`}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* PromptPay QR Preview Dialog */}
              {selectedPromptPayPkg && (
                <div className="p-4 rounded-2xl bg-blue-50/80 border-2 border-[#1A73E8] space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-sm text-blue-950">
                      📱 PromptPay QR Preview — {selectedPromptPayPkg.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedPromptPayPkg(null)}
                      className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
                    {/* Crisp SVG PromptPay QR Preview */}
                    <div className="w-24 h-24 rounded-xl bg-white border border-blue-200 p-2 flex items-center justify-center shrink-0">
                      <svg viewBox="0 0 36 36" className="w-full h-full text-slate-900" aria-label="PromptPay QR Preview">
                        <rect x="2" y="2" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" />
                        <rect x="5" y="5" width="4" height="4" fill="currentColor" />
                        <rect x="24" y="2" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" />
                        <rect x="27" y="5" width="4" height="4" fill="currentColor" />
                        <rect x="2" y="24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" />
                        <rect x="5" y="27" width="4" height="4" fill="currentColor" />
                        <rect x="15" y="4" width="3" height="3" fill="currentColor" />
                        <rect x="15" y="10" width="6" height="3" fill="currentColor" />
                        <rect x="15" y="16" width="3" height="6" fill="currentColor" />
                        <rect x="21" y="16" width="5" height="3" fill="currentColor" />
                        <rect x="28" y="16" width="5" height="5" fill="currentColor" />
                        <rect x="16" y="26" width="4" height="4" fill="currentColor" />
                        <rect x="24" y="24" width="8" height="3" fill="currentColor" />
                        <rect x="24" y="30" width="4" height="4" fill="currentColor" />
                      </svg>
                    </div>
                    <div className="flex-1 space-y-2 text-xs">
                      <div className="font-bold text-slate-800">
                        {selectedPromptPayPkg.credits} Credits · {selectedPromptPayPkg.priceThb}฿ (THB)
                      </div>
                      <p className="text-[11px] text-slate-600">
                        {lang === 'th'
                          ? 'ตัวอย่างหน้าต่างชำระเงิน PromptPay QR (กดปุ่มด้านล่างเพื่อจำลองการเติมเครดิตทันที)'
                          : 'PromptPay QR payment preview dialog (click below to simulate instant top-up).'}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleConfirmMockPayment(selectedPromptPayPkg)}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition cursor-pointer"
                      >
                        ✓ {lang === 'th' ? `จำลองชำระ ${selectedPromptPayPkg.priceThb}฿ สำเร็จ` : `Complete Preview Top-Up (+${selectedPromptPayPkg.credits})`}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Transaction History */}
              <div className="space-y-2">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">
                  📜 {lang === 'th' ? 'ประวัติรายการเครดิต' : 'Transaction History'}
                </h4>
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
                  {transactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/80 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 truncate">{tx.description}</div>
                        <div className="text-[10px] text-slate-400">
                          {new Date(tx.createdAt).toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                      <span
                        className={`font-black shrink-0 ${
                          tx.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {tx.amount >= 0 ? `+${tx.amount}` : tx.amount}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ─── TAB 4: AI STUDIO DIRECTOR (0 CREDITS) ─── */}
          {activeTab === 'ai-director' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-purple-50/80 border border-purple-200 space-y-1">
                <div className="text-xs font-black text-purple-900 flex items-center gap-1.5">
                  🪄 {lang === 'th' ? 'สั่ง AI ตั้งค่าเพลงและมิกเซอร์ทั้งแอปด้วยภาษาธรรมชาติ (0 เครดิต)' : 'Natural-Language AI Studio Director (0 Credits)'}
                </div>
                <p className="text-[11px] text-purple-700 font-medium leading-relaxed">
                  {lang === 'th'
                    ? 'พิมพ์สิ่งที่ต้องการ เช่น ปรับความเร็ว BPM, เปลี่ยนคีย์, เลือกห้อง 3D, เปิด/ปิดเครื่องดนตรี, ปรับ % ความดังรายท่อน หรือสั่งแตกหนัก/แตกอุ่น แล้วกดให้ AI ลงค่าให้ทันที'
                    : 'Describe your desired tempo, key, room ambience, per-section instruments, overdrive/fuzz tone, % volumes, or chord changes and apply them in one click.'}
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-slate-600">
                  {lang === 'th' ? '💡 ตัวอย่างคำสั่งคลิกด่วน:' : '💡 Quick Prompt Examples:'}
                </div>
                <div className="flex flex-col gap-1.5">
                  {AI_DIRECTOR_PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setDirectorPrompt(preset);
                        setDirectorNotice(null);
                      }}
                      className="text-left text-[11px] font-medium px-3 py-2 rounded-xl bg-slate-50 hover:bg-purple-50 border border-slate-200 hover:border-purple-300 text-slate-700 transition cursor-pointer"
                    >
                      “{preset}”
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleApplyDirectorPrompt} className="space-y-3">
                <textarea
                  rows={3}
                  value={directorPrompt}
                  onChange={(e) => setDirectorPrompt(e.target.value)}
                  placeholder={
                    lang === 'th'
                      ? 'เช่น ตั้งความเร็ว 95 bpm คีย์ G ท่อน Intro เกาเบาๆ ท่อน Chorus ลีดแตกหนัก 100% กลองเป็นชุด เบส 80%...'
                      : 'e.g. Set 95 bpm key G, Intro soft fingerpicking, Chorus lead distortion 100%, drums kit, bass 80%...'
                  }
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-purple-200 bg-white text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
                <button
                  type="submit"
                  disabled={!song || !onApplySongUpdate || !directorPrompt.trim() || isApplyingDirector}
                  className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-black text-xs sm:text-sm shadow-xs transition cursor-pointer"
                >
                  {isApplyingDirector
                    ? lang === 'th'
                      ? '⏳ กำลังวิเคราะห์ด้วย Gemini 4 Hydrogen...'
                      : '⏳ Analyzing with Gemini 4 Hydrogen...'
                    : `🪄 ${lang === 'th' ? 'ให้ AI ลงค่าในแอปทันที (Gemini 4 Hydrogen / Offline)' : 'Apply Settings with Gemini 4 Hydrogen'}`}
                </button>
              </form>

              {directorEngineInfo && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-[11px]">
                  <span
                    className={`font-black px-2 py-0.5 rounded-full ${
                      directorEngineInfo.isSimulated
                        ? 'bg-slate-200 text-slate-700'
                        : 'bg-purple-600 text-white'
                    }`}
                  >
                    {directorEngineInfo.isSimulated
                      ? `⚡ ${directorEngineInfo.model}`
                      : `✨ ${directorEngineInfo.model}`}
                  </span>
                  <span className="text-slate-600 font-medium truncate" title={directorEngineInfo.tip}>
                    {directorEngineInfo.tip}
                  </span>
                </div>
              )}

              {directorNotice && (
                <div
                  className={`p-3 rounded-xl border text-xs font-bold ${
                    directorNotice.ok
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  {directorNotice.ok ? '✅ ' : '⚠️ '}
                  {directorNotice.text}
                </div>
              )}

              {directorActions.length > 0 && (
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="text-[11px] font-black text-slate-700">
                    {lang === 'th' ? 'รายการที่ AI ปรับแต่งให้ล่าสุด:' : 'Applied Changes:'}
                  </div>
                  <ul className="space-y-1 max-h-40 overflow-y-auto">
                    {directorActions.map((act, i) => (
                      <li key={i} className="text-[11px] font-medium text-slate-700 flex items-start gap-1.5">
                        <span className="text-purple-600 font-bold">•</span>
                        <span>{act}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
