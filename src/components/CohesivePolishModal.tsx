'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  Lock,
  Unlock,
  X,
  Coins,
} from 'lucide-react';
import {
  CREDIT_COST_TABLE,
  applyServerWalletSnapshot,
  canAfford,
  deductCredits,
} from '@/lib/creditManager';
import { getAuthAccessToken, refreshAuthSession } from '@/lib/cloudSync';
import { trackUsageEvent } from '@/lib/analytics';
import { applyGenreBandArrangement } from '@/lib/songArchitect';
import { generateLyricAlignedGuideMelody } from '@/lib/melodyUtils';
import { useLanguage } from '@/context/LanguageContext';
import type { SongProject } from '@/types/song';

interface CohesivePolishModalProps {
  isOpen: boolean;
  song: SongProject;
  creditBalance: number;
  onClose: () => void;
  onApplySong: (updatedSong: SongProject) => void;
  onCreditsChange?: (balance: number) => void;
  onOpenWallet?: () => void;
}

export const CohesivePolishModal: React.FC<CohesivePolishModalProps> = ({
  isOpen,
  song,
  creditBalance,
  onClose,
  onApplySong,
  onCreditsChange,
  onOpenWallet,
}) => {
  const { lang } = useLanguage();

  const [lyricsRetentionPct, setLyricsRetentionPct] = useState<100 | 75 | 40>(75);
  const [chordsRetentionPct, setChordsRetentionPct] = useState<100 | 70 | 30>(100);
  const [lockedSectionIds, setLockedSectionIds] = useState<string[]>([]);
  const [rebalanceBand, setRebalanceBand] = useState<boolean>(true);
  const [isPolishing, setIsPolishing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const lockedSet = new Set(lockedSectionIds);
  const unlockedCount = song.sections.filter((s) => !lockedSet.has(s.id)).length;
  const isZeroCredit = lyricsRetentionPct === 100 && chordsRetentionPct === 100;
  const cost = isZeroCredit
    ? 0
    : unlockedCount <= 3
      ? CREDIT_COST_TABLE.aiCohesivePolishPartial
      : CREDIT_COST_TABLE.aiCohesivePolishWhole;
  const modelName = isZeroCredit
    ? 'Local Synth Engine'
    : unlockedCount <= 3
      ? 'Gemini 3.5 Flash Lite'
      : 'Gemini 4 Hydrogen';

  const toggleLockSection = (sectionId: string) => {
    setLockedSectionIds((prev) =>
      prev.includes(sectionId) ? prev.filter((id) => id !== sectionId) : [...prev, sectionId]
    );
  };

  const handleExecutePolish = async () => {
    setErrorMsg(null);

    // 0 Credit Local Execution: immediately apply genre arrangement + resync melody
    if (isZeroCredit) {
      let resultSong = song;
      if (rebalanceBand) {
        resultSong = applyGenreBandArrangement(resultSong);
      }
      resultSong = {
        ...resultSong,
        updatedAt: new Date().toISOString(),
        sections: resultSong.sections.map((sec) => {
          if (lockedSet.has(sec.id)) return sec;
          return {
            ...sec,
            bars: sec.bars.map((bar, bIdx) => ({
              ...bar,
              melodyNotes:
                sec.type === 'intro'
                  ? []
                  : generateLyricAlignedGuideMelody({
                      lyrics: bar.lyrics,
                      chord1: bar.chords[0] || 'C',
                      chord2: bar.chordsPerBar === 2 ? bar.chords[1] : undefined,
                      totalSteps: 16,
                      stepsPerBeat: 4,
                      barIndex: bIdx,
                      sectionType: sec.type,
                    }),
            })),
          };
        }),
      };

      trackUsageEvent({
        eventName: 'ai_whole_song_cohesive_polish',
        category: 'ai',
        featureVariant: 'local_zero_credit',
        creditsCost: 0,
      });

      onApplySong(resultSong);
      onClose();
      return;
    }

    // AI Execution (2 or 3 Credits)
    if (!canAfford(cost)) {
      setErrorMsg(
        lang === 'th'
          ? `เครดิตไม่เพียงพอ (ต้องการ ${cost} เครดิต แต่คงเหลือ ${creditBalance} เครดิต)`
          : `Insufficient credits (${cost} credits required, current balance: ${creditBalance}).`
      );
      return;
    }

    setIsPolishing(true);

    try {
      const token = getAuthAccessToken();
      const sendReq = (authHeader?: string) =>
        fetch('/api/advance/cohesive-polish', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authHeader ? { Authorization: `Bearer ${authHeader}` } : {}),
          },
          body: JSON.stringify({
            song,
            lyricsRetentionPct,
            chordsRetentionPct,
            lockedSectionIds,
            rebalanceBand,
          }),
        });

      let res = await sendReq(token || undefined);
      if (res.status === 401) {
        const refreshed = await refreshAuthSession();
        if (refreshed) {
          res = await sendReq(refreshed.accessToken);
        }
      }

      const data = (await res.json()) as {
        song?: SongProject;
        wallet?: { balance: number; trialCredits: number; purchasedCredits: number };
        isSimulated?: boolean;
        model?: string;
        error?: string;
      };

      if (!res.ok || !data.song) {
        if (data.wallet && onCreditsChange) {
          const synced = applyServerWalletSnapshot(data.wallet);
          onCreditsChange(synced.balance);
        }
        setErrorMsg(
          data.error ||
            (lang === 'th'
              ? 'ไม่สามารถเกลาเชื่อมเพลงได้ กรุณาลองใหม่อีกครั้ง'
              : 'Could not polish song. Please retry.')
        );
        return;
      }

      if (data.wallet && onCreditsChange) {
        const synced = applyServerWalletSnapshot(data.wallet);
        onCreditsChange(synced.balance);
      } else if (!data.isSimulated && onCreditsChange) {
        const deduction = deductCredits(
          cost,
          `Cohesive Polish (${data.model || modelName}): ${song.title.slice(0, 24)}`
        );
        if (deduction.success) {
          onCreditsChange(deduction.balance);
        }
      }

      trackUsageEvent({
        eventName: 'ai_whole_song_cohesive_polish',
        category: 'ai',
        featureVariant: unlockedCount <= 3 ? 'partial' : 'whole_song',
        creditsCost: cost,
      });

      onApplySong(data.song);
      onClose();
    } catch {
      setErrorMsg(
        lang === 'th'
          ? 'การเชื่อมต่อขัดข้อง ไม่หักเครดิต กรุณาลองใหม่อีกครั้ง'
          : 'Network error calling cohesive polish. 0 credits charged.'
      );
    } finally {
      setIsPolishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-surface-1 border border-hairline rounded-3xl shadow-e3 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-hairline flex items-center justify-between bg-surface-2/40">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-accent-50 text-accent-text border border-accent-200">
              <Sparkles className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-sm font-black text-ink-900">
                {lang === 'th'
                  ? '🪄 เกลาและเชื่อมทั้งเพลง (Whole-Song Polish)'
                  : '🪄 Whole-Song Cohesive Polish'}
              </h2>
              <p className="text-[11px] text-ink-500">
                {lang === 'th'
                  ? 'ปรับสัมผัสคำร้อง ความต่อเนื่องของอารมณ์ และทางคอร์ดให้ทุกท่อนเชื่อมโยงกันอย่างกลมกล่อม'
                  : 'Harmonize rhymes, emotional narrative, and chord transitions seamlessly.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-ink-400 hover:text-ink-900 hover:bg-surface-2 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Section 1: Lyrics Retention */}
          <div className="space-y-2">
            <label className="font-bold text-ink-900 block">
              {lang === 'th' ? '1. นโยบายคงคำร้องเดิม (Lyrics Retention):' : '1. Lyrics Retention:'}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { pct: 100 as const, labelTh: 'คงเดิม 100%', labelEn: 'Keep 100%', descTh: 'ไม่แก้คำร้อง' },
                { pct: 75 as const, labelTh: 'เกลาคำสัมผัส 75%', labelEn: 'Refine 75%', descTh: 'เกลาคำส่งสัมผัส' },
                { pct: 40 as const, labelTh: 'รีไรต์เชื่อมใหม่ 40%', labelEn: 'Rewrite 40%', descTh: 'รีไรต์คำคมชัด' },
              ].map((opt) => (
                <button
                  key={opt.pct}
                  type="button"
                  onClick={() => setLyricsRetentionPct(opt.pct)}
                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                    lyricsRetentionPct === opt.pct
                      ? 'bg-accent-50 border-accent-500 ring-2 ring-accent-500/20'
                      : 'bg-surface-2 border-hairline hover:border-accent-200'
                  }`}
                >
                  <div className="font-bold text-ink-900">
                    {lang === 'th' ? opt.labelTh : opt.labelEn}
                  </div>
                  <div className="text-[10px] text-ink-500 mt-0.5">{opt.descTh}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Section 2: Chords Retention */}
          <div className="space-y-2">
            <label className="font-bold text-ink-900 block">
              {lang === 'th' ? '2. นโยบายคงทางคอร์ดเดิม (Chords Retention):' : '2. Chords Retention:'}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { pct: 100 as const, labelTh: 'คงคอร์ดเดิม 100%', labelEn: 'Keep 100%', descTh: 'ไม่แตะต้องคอร์ด' },
                { pct: 70 as const, labelTh: 'คอร์ดส่งเชื่อม 70%', labelEn: 'Smooth Cadence 70%', descTh: 'เพิ่มคอร์ดส่งท่อน' },
                { pct: 30 as const, labelTh: 'Re-harmonize 30%', labelEn: 'Re-harmonize 30%', descTh: 'เรียบเรียงคอร์ดใหม่' },
              ].map((opt) => (
                <button
                  key={opt.pct}
                  type="button"
                  onClick={() => setChordsRetentionPct(opt.pct)}
                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                    chordsRetentionPct === opt.pct
                      ? 'bg-accent-50 border-accent-500 ring-2 ring-accent-500/20'
                      : 'bg-surface-2 border-hairline hover:border-accent-200'
                  }`}
                >
                  <div className="font-bold text-ink-900">
                    {lang === 'th' ? opt.labelTh : opt.labelEn}
                  </div>
                  <div className="text-[10px] text-ink-500 mt-0.5">{opt.descTh}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Section 3: Locked Sections */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-ink-900">
                {lang === 'th' ? '3. ล็อกท่อนที่ห้ามแก้ไข (🔒 Locked Sections):' : '3. Locked Sections:'}
              </label>
              <span className="text-[11px] text-ink-500">
                {lockedSectionIds.length} {lang === 'th' ? 'ท่อนที่ล็อก' : 'locked'}
              </span>
            </div>
            <p className="text-[11px] text-ink-500">
              {lang === 'th'
                ? 'ท่อนที่ล็อกไว้ AI จะไม่แตะต้องคำร้องและคอร์ดเลย แต่จะใช้อ้างอิงเพื่อแต่งท่อนอื่นให้เข้ากัน'
                : 'Locked sections will remain completely untouched and serve as anchor references.'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto p-1">
              {song.sections.map((sec, idx) => {
                const isLocked = lockedSectionIds.includes(sec.id);
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => toggleLockSection(sec.id)}
                    className={`flex items-center justify-between p-2 rounded-xl border text-left transition cursor-pointer ${
                      isLocked
                        ? 'bg-amber-50/80 border-amber-300 text-amber-950 font-bold'
                        : 'bg-surface-2 border-hairline text-ink-700 hover:border-accent-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {isLocked ? (
                        <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                      ) : (
                        <Unlock className="w-3.5 h-3.5 text-ink-400 shrink-0" />
                      )}
                      <span className="truncate">
                        {idx + 1}. {sec.name || sec.type} ({sec.bars.length} บาร์)
                      </span>
                    </div>
                    <span className="text-[10px] uppercase font-bold tracking-wider opacity-60 ml-1 shrink-0">
                      {sec.type}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 4: Rebalance Band Toggle */}
          <label className="flex items-center gap-2.5 p-3 rounded-2xl bg-surface-2/60 border border-hairline cursor-pointer">
            <input
              type="checkbox"
              checked={rebalanceBand}
              onChange={(e) => setRebalanceBand(e.target.checked)}
              className="w-4 h-4 rounded text-accent-500 focus:ring-accent-500"
            />
            <div>
              <div className="font-bold text-ink-900">
                {lang === 'th'
                  ? '🎚️ จัดไดนามิกวงดนตรีให้ส่งอารมณ์ตามลำดับท่อน (Auto-Rebalance Band)'
                  : '🎚️ Auto-Rebalance Dynamic Band Mix by Section Arc'}
              </div>
              <div className="text-[11px] text-ink-500 mt-0.5">
                {lang === 'th'
                  ? 'ปรับเครื่องดนตรี 5 ชิ้นให้เปิด-ปิดและปรับสไตล์ตามกราฟอารมณ์เพลงให้อัตโนมัติ'
                  : 'Automatically arrange instrument styles, rhythm strums, and intensities.'}
              </div>
            </div>
          </label>

          {/* Pricing Banner */}
          <div
            className={`p-3.5 rounded-2xl border flex items-center justify-between gap-2 flex-wrap ${
              isZeroCredit
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : 'bg-indigo-50 border-indigo-200 text-indigo-950'
            }`}
          >
            <div className="space-y-0.5">
              <div className="font-bold flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-accent-500" />
                <span>
                  {isZeroCredit
                    ? lang === 'th'
                      ? 'ทำงานในเครื่องทันที 0 เครดิต (ไม่เสียเหรียญ)'
                      : 'Client-side processing: 0 Credits'
                    : lang === 'th'
                      ? `ค่าบริการ AI: ${cost} เครดิต (${modelName})`
                      : `AI Cost: ${cost} Credits (${modelName})`}
                </span>
              </div>
              <p className="text-[11px] opacity-80">
                {isZeroCredit
                  ? lang === 'th'
                    ? 'คงเนื้อและคอร์ดเดิม 100% พร้อมจัดไดนามิกวงดนตรีและซิงค์โน้ตเมโลดี้ให้ตรงคอร์ด'
                    : 'Preserves 100% lyrics and chords while rebalancing band and synchronizing melody notes.'
                  : lang === 'th'
                    ? `เกลาเชื่อมโยง ${unlockedCount} ท่อนที่ปลดล็อก (คงเหลือหลังใช้ ${creditBalance - cost} เครดิต)`
                    : `Polishing ${unlockedCount} unlocked sections (${creditBalance - cost} credits remaining).`}
              </p>
            </div>
            <span
              className={`px-3 py-1 rounded-full font-black text-xs ${
                isZeroCredit
                  ? 'bg-emerald-200 text-emerald-950'
                  : 'bg-indigo-200 text-indigo-950'
              }`}
            >
              {cost} {lang === 'th' ? 'เหรียญ' : 'Credits'}
            </span>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-bold flex items-center justify-between gap-2">
              <span>{errorMsg}</span>
              {!canAfford(cost) && onOpenWallet && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenWallet();
                  }}
                  className="px-2.5 py-1 rounded-lg bg-amber-500 text-white text-[11px] font-black cursor-pointer shrink-0"
                >
                  {lang === 'th' ? 'เติมเครดิต' : 'Top Up'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-hairline bg-surface-2/30 flex gap-2">
          <button
            type="button"
            onClick={handleExecutePolish}
            disabled={isPolishing}
            className="flex-1 py-3 px-4 rounded-2xl bg-accent-500 hover:bg-accent-hover disabled:opacity-60 text-white font-bold text-xs sm:text-sm shadow-e1 transition cursor-pointer flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>
              {isPolishing
                ? lang === 'th'
                  ? 'กำลังวิเคราะห์และเกลาเชื่อมทั้งเพลง...'
                  : 'Polishing song cohesion...'
                : isZeroCredit
                  ? lang === 'th'
                    ? '🪄 ปรับจูนและจัดวงทันที (0 เครดิต)'
                    : '🪄 Apply Polish (0 Credits)'
                  : lang === 'th'
                    ? `🪄 ยืนยันเกลาเชื่อมเพลง (ใช้ ${cost} เครดิต)`
                    : `🪄 Confirm Polish (${cost} Credits)`}
            </span>
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isPolishing}
            className="px-5 py-3 rounded-2xl bg-surface-1 border border-hairline text-ink-700 hover:bg-surface-2 font-bold text-xs sm:text-sm transition cursor-pointer"
          >
            {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
};
