'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { SongProject, SongBar, MelodyNote, ThaiSongGenre } from '@/types/song';
import {
  midiToNoteName,
  isBlackKey,
  getScalePitchClasses,
  getChordPitchClasses,
  getPitchRange,
  getRootPitchClass,
  generateChordGuideMelodyNotes,
  splitThaiLyricSyllables,
  generateLyricAlignedGuideMelody,
  type GuideContourPattern,
} from '@/lib/melodyUtils';
import { analyzeThaiSyllablePhonetics } from '@/lib/thaiRhymeHelper';
import { transposeChord } from '@/lib/chordUtils';
import { getAudioEngine } from '@/lib/audioEngine';
import { useLanguage } from '@/context/LanguageContext';
import {
  CREDIT_COST_TABLE,
  applyServerWalletSnapshot,
  deductCredits,
  getCreditBalance,
  type WalletBreakdown,
} from '@/lib/creditManager';
import { getAuthAccessToken } from '@/lib/cloudSync';
import { playAudioDataUrl } from '@/lib/micRecorder';
import { speakBrowserLyrics, isBrowserSpeechSupported } from '@/lib/browserSpeechCue';
import { trimAudioDataUrlLeadingSilence } from '@/lib/audioTrim';

const TTS_CUE_COST = CREDIT_COST_TABLE.aiTtsCue;

interface MiniPianoRollModalProps {
  isOpen: boolean;
  song: SongProject;
  sectionId: string;
  barId: string;
  globalBarIndex: number;
  creditBalance?: number;
  thaiGenre?: ThaiSongGenre;
  onCreditsChange?: (balance: number) => void;
  onSaveVocalToBar?: (audioDataUrl: string) => void;
  onUpdateBarNotes: (sectionId: string, barId: string, notes: MelodyNote[]) => void;
  onNavigateBar?: (direction: 'prev' | 'next') => void;
  canPrev?: boolean;
  canNext?: boolean;
  onClose: () => void;
}

export const MiniPianoRollModal: React.FC<MiniPianoRollModalProps> = ({
  isOpen,
  song,
  sectionId,
  barId,
  globalBarIndex,
  creditBalance,
  thaiGenre,
  onCreditsChange,
  onSaveVocalToBar,
  onUpdateBarNotes,
  onNavigateBar,
  canPrev = false,
  canNext = false,
  onClose,
}) => {
  const { lang, t } = useLanguage();
  // Find section & bar
  const section = song.sections.find((s) => s.id === sectionId);
  const bar = section?.bars.find((b) => b.id === barId);

  // Local draft of notes so user can cancel or commit
  const [draftNotes, setDraftNotes] = useState<MelodyNote[]>(() =>
    bar ? [...bar.melodyNotes] : []
  );
  const [keySnapOnly, setKeySnapOnly] = useState<boolean>(true); // Default to in-key for fast folk/pop writing
  const [resolution16, setResolution16] = useState<boolean>(false); // 8 steps (false) or 16 steps (true)
  const [defaultDuration, setDefaultDuration] = useState<number>(2); // 2 steps default (quarter/eighth depending on grid)
  const [isAuditioning, setIsAuditioning] = useState<boolean>(false);
  const [guidePattern, setGuidePattern] = useState<GuideContourPattern>('gentle-arch');
  const [ttsConfirmOpen, setTtsConfirmOpen] = useState<boolean>(false);
  const [isGeneratingTts, setIsGeneratingTts] = useState<boolean>(false);
  const [ttsStatusMsg, setTtsStatusMsg] = useState<string | null>(null);
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);
  const [ttsVoice, setTtsVoice] = useState<'Kore' | 'Aoede' | 'Puck' | 'Charon' | 'Fenrir'>('Kore');
  const [ttsModelTier, setTtsModelTier] = useState<'pro-tts' | 'lite-tts'>('pro-tts');
  const [autoSaveVocalToBar, setAutoSaveVocalToBar] = useState<boolean>(true);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

  const currentCredits = creditBalance ?? getCreditBalance();

  // Pitch Classes for scale and chords (All hooks must be declared before any return)
  const effectiveKey = song.baseKey || 'C';
  const rootPc = useMemo(() => getRootPitchClass(effectiveKey), [effectiveKey]);
  const scalePcs = useMemo(() => getScalePitchClasses(effectiveKey, 'major'), [effectiveKey]);

  // Transposed chord for this bar
  const chord1 = bar?.chords?.[0] ? transposeChord(bar.chords[0], song.transposeSemitones) : 'C';
  const chord2 = bar?.chordsPerBar === 2 && bar?.chords?.[1] ? transposeChord(bar.chords[1], song.transposeSemitones) : null;
  const chord1Pcs = useMemo(() => getChordPitchClasses(chord1), [chord1]);
  const chord2Pcs = useMemo(() => (chord2 ? getChordPitchClasses(chord2) : new Set<number>()), [chord2]);

  // Full pitch range (G3=55 to E5=76)
  const fullPitchRange = useMemo(() => getPitchRange(55, 76), []);

  // Filtered pitches if keySnapOnly is active
  const visiblePitches = useMemo(() => {
    if (!keySnapOnly) return fullPitchRange;
    return fullPitchRange.filter((m) => scalePcs.has(m % 12));
  }, [keySnapOnly, fullPitchRange, scalePcs]);

  // Sync draftNotes whenever bar changes
  useEffect(() => {
    if (!bar) return;
    const rafId = requestAnimationFrame(() => {
      setDraftNotes([...bar.melodyNotes]);
      if (
        song.timeSignature === '4/4' &&
        bar.melodyNotes.some((n) => n.step >= 8 || n.step % 2 === 1 || n.durationSteps % 2 === 1)
      ) {
        setResolution16(true);
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [bar, song.timeSignature]);

  // Reset TTS preview URL when navigating to a different bar
  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      setTtsAudioUrl(null);
      setTtsStatusMsg(null);
      setTtsConfirmOpen(false);
    });
    return () => cancelAnimationFrame(rafId);
  }, [barId]);

  const lyricSyllableGuides = useMemo(() => {
    const text = bar?.lyrics?.trim() || '';
    if (!text) return [];
    return splitThaiLyricSyllables(text).map((syllable) => ({
      syllable,
      phonetics: analyzeThaiSyllablePhonetics(syllable),
    }));
  }, [bar?.lyrics]);

  // Stop auditioning and TTS audio when closing
  useEffect(() => {
    if (!isOpen) {
      ttsAudioRef.current?.pause();
      if (isAuditioning) {
        getAudioEngine().stop();
        const rafId = requestAnimationFrame(() => {
          setIsAuditioning(false);
        });
        return () => cancelAnimationFrame(rafId);
      }
    }
  }, [isOpen, isAuditioning]);

  // Early return ONLY after all hooks have been called
  if (!isOpen || !section || !bar) return null;

  // Grid steps count
  const is44 = song.timeSignature === '4/4';
  const is34 = song.timeSignature === '3/4';
  const is68 = song.timeSignature === '6/8';

  const totalSteps = is68 ? 12 : is34 ? 12 : resolution16 ? 16 : 8;
  const uiBeats = is68 ? 6 : is34 ? 3 : 4;
  const stepsPerBeat = totalSteps / uiBeats;

  // Handle Note Toggle (Add / Remove)
  const handleCellClick = (pitch: number, step: number) => {
    // Play sound preview immediately on tap
    getAudioEngine().previewNote(pitch, 0.4);

    setDraftNotes((prev) => {
      // Check if clicking on an existing note's head
      const existingIdx = prev.findIndex((n) => n.midiPitch === pitch && n.step === step);
      if (existingIdx !== -1) {
        // Remove note
        return prev.filter((_, i) => i !== existingIdx);
      }

      // Check if clicking inside another note's span on the same pitch
      const overlapping = prev.find(
        (n) => n.midiPitch === pitch && step >= n.step && step < n.step + n.durationSteps
      );
      if (overlapping) {
        // Remove that overlapping note
        return prev.filter((n) => n !== overlapping);
      }

      // Add new note with selected duration (clamped to not exceed totalSteps)
      const dur = Math.min(defaultDuration, totalSteps - step);
      const newNote: MelodyNote = {
        step,
        midiPitch: pitch,
        durationSteps: Math.max(1, dur),
      };
      return [...prev, newNote].sort((a, b) => a.step - b.step);
    });
  };

  // Change duration of a note
  const handleChangeDuration = (e: React.MouseEvent, note: MelodyNote, delta: number) => {
    e.stopPropagation();
    setDraftNotes((prev) =>
      prev.map((n) => {
        if (n.step === note.step && n.midiPitch === note.midiPitch) {
          const newDur = Math.max(1, Math.min(totalSteps - n.step, n.durationSteps + delta));
          return { ...n, durationSteps: newDur };
        }
        return n;
      })
    );
  };

  // Audition Bar
  const handleToggleAudition = () => {
    if (isAuditioning) {
      getAudioEngine().stop();
      setIsAuditioning(false);
      return;
    }
    // Commit current draft into song copy and audition
    const songCopy: SongProject = {
      ...song,
      sections: song.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          bars: sec.bars.map((b) => (b.id === barId ? { ...b, melodyNotes: draftNotes } : b)),
        };
      }),
    };

    setIsAuditioning(true);
    getAudioEngine().playBarAudition(songCopy, globalBarIndex, () => {
      setIsAuditioning(false);
    });
  };

  // Save and Close
  const handleSave = () => {
    onUpdateBarNotes(sectionId, barId, draftNotes);
    onClose();
  };

  // Clear all notes in bar
  const handleClear = () => {
    if (draftNotes.length === 0) return;
    if (confirm(lang === 'th' ? 'ต้องการล้างโน้ตเมโลดี้ทั้งหมดในห้องนี้ใช่หรือไม่?' : 'Clear all melody notes in this bar?')) {
      setDraftNotes([]);
    }
  };

  // Copy notes from previous bar if empty
  const handleCopyPrevNotes = () => {
    const barIdx = section.bars.findIndex((b) => b.id === barId);
    let prevBar: SongBar | undefined;
    if (barIdx > 0) {
      prevBar = section.bars[barIdx - 1];
    } else {
      const secIdx = song.sections.findIndex((s) => s.id === sectionId);
      if (secIdx > 0) {
        const prevSec = song.sections[secIdx - 1];
        prevBar = prevSec.bars[prevSec.bars.length - 1];
      }
    }
    if (prevBar && prevBar.melodyNotes.length > 0) {
      setDraftNotes([...prevBar.melodyNotes]);
    } else {
      alert(lang === 'th' ? 'ห้องก่อนหน้าไม่มีโน้ตเมโลดี้ครับ' : 'Previous bar has no melody notes.');
    }
  };

  // Phase 5C / 6 (0 Credits): Generate singable guide notes locked to active bar chords + Thai lyric syllables & tones
  const handleGenerateGuideNotes = () => {
    const trimmedLyrics = bar.lyrics.trim();
    const effectiveTotalSteps = is68 || is34 ? 12 : 16;
    const effectiveStepsPerBeat = effectiveTotalSteps / uiBeats;

    if (is44 && !resolution16) {
      setResolution16(true);
    }

    const generated =
      trimmedLyrics.length > 0
        ? generateLyricAlignedGuideMelody({
            lyrics: trimmedLyrics,
            chord1,
            chord2,
            baseKey: effectiveKey,
            totalSteps: effectiveTotalSteps,
            stepsPerBeat: effectiveStepsPerBeat,
            pattern: guidePattern,
            barIndex: globalBarIndex,
            sectionType: section.type,
          })
        : generateChordGuideMelodyNotes({
            chord1,
            chord2,
            baseKey: effectiveKey,
            totalSteps: effectiveTotalSteps,
            stepsPerBeat: effectiveStepsPerBeat,
            pattern: guidePattern,
          });

    setDraftNotes(generated);
    if (generated[0]) {
      getAudioEngine().previewNote(generated[0].midiPitch, 0.35);
    }
    setTtsStatusMsg(
      lang === 'th'
        ? trimmedLyrics.length > 0
          ? `สร้างโน้ตไกด์ ${generated.length} ตัวตามพยางค์และวรรณยุกต์ไทยตรงคอร์ด ${chord1}${chord2 ? ` → ${chord2}` : ''} (ฟรี 0 เหรียญ)`
          : `สร้างโน้ตไกด์ ${generated.length} ตัวตรงคอร์ด ${chord1}${chord2 ? ` → ${chord2}` : ''} เรียบร้อย (ฟรี 0 เหรียญ)`
        : `Generated ${generated.length} ${trimmedLyrics.length > 0 ? 'lyric-aligned' : 'chord-locked'} guide notes for ${chord1}${chord2 ? ` → ${chord2}` : ''} (Free)`
    );
  };

  const speakBrowserCueFallback = (cueText: string) => {
    speakBrowserLyrics(cueText, {
      bpm: song.bpm,
      lang: lang === 'en' ? 'en' : 'th',
    });
  };

  // Phase 5C / 7E (2 Credits): Request Gemini 3.8 TTS singing/phrasing guide for this bar
  const handleConfirmTtsCue = async () => {
    const lyricText = bar.lyrics.trim().slice(0, 240);
    if (!lyricText || isGeneratingTts) return;

    setIsGeneratingTts(true);
    setTtsStatusMsg(null);

    try {
      const accessToken = getAuthAccessToken();
      const response = await fetch('/api/advance/tts-cue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          text: lyricText,
          bpm: song.bpm,
          language: lang,
          includeCountIn: true,
          voice: ttsVoice,
          modelTier: ttsModelTier,
          vocalMode: 'singing-demo',
          thaiGenre: thaiGenre ?? song.thaiGenre,
        }),
      });
      const data = (await response.json()) as {
        isSimulated?: boolean;
        audioDataUrl?: string | null;
        cueText?: string;
        tip?: string;
        wallet?: WalletBreakdown;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || 'TTS request failed');
      }

      if (data.wallet) {
        const synced = applyServerWalletSnapshot(data.wallet);
        onCreditsChange?.(synced.balance);
      } else if (!data.isSimulated) {
        const spend = deductCredits(
          TTS_CUE_COST,
          `TTS vocal phrasing cue (${song.bpm} BPM): "${lyricText.slice(0, 24)}"`
        );
        if (spend.success) {
          onCreditsChange?.(spend.balance);
        }
      }

      setTtsConfirmOpen(false);
      let nextStatus = data.tip || null;

      if (data.audioDataUrl) {
        ttsAudioRef.current?.pause();
        const { dataUrl: cleanAudioUrl } = await trimAudioDataUrlLeadingSilence(data.audioDataUrl);
        setTtsAudioUrl(cleanAudioUrl);
        ttsAudioRef.current = playAudioDataUrl(cleanAudioUrl);
        if (autoSaveVocalToBar && onSaveVocalToBar) {
          onSaveVocalToBar(cleanAudioUrl);
          nextStatus =
            lang === 'th'
              ? '✅ สังเคราะห์และบันทึกเสียงร้องไกด์ AI ลงในห้องนี้แล้ว พร้อมฟังพรีวิวและส่งออก MP3!'
              : '✅ AI vocal guide trimmed & auto-saved to this bar for playback & MP3 export!';
        }
      } else if (data.cueText) {
        speakBrowserCueFallback(data.cueText);
      }
      setTtsStatusMsg(nextStatus);
    } catch (err) {
      setTtsStatusMsg(
        err instanceof Error
          ? err.message
          : lang === 'th'
            ? 'สร้างเสียงไกด์ไม่สำเร็จ'
            : 'Unable to generate TTS cue'
      );
    } finally {
      setIsGeneratingTts(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-4xl max-h-[92vh] rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#1A73E8] text-white flex items-center justify-center text-lg shadow-sm font-black">
              🎹
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base sm:text-lg text-slate-900">
                  {lang === 'th' ? 'เมโลดี้ไกด์เสียงร้อง (Vocal Melody Guide)' : 'Vocal Melody Guide'}
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-[#1A73E8] font-black text-xs">
                  {lang === 'th' ? `ห้องที่ ${globalBarIndex + 1}` : `Bar ${globalBarIndex + 1}`}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                <span>{section.name}</span>
                <span>•</span>
                <span className="font-bold text-slate-800">
                  {lang === 'th' ? 'คอร์ด: ' : 'Chord: '}{chord1} {chord2 ? `→ ${chord2}` : ''}
                </span>
                {song.capoFret > 0 && (
                  <span className="text-[11px] text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded font-bold">
                    Capo {song.capoFret}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Prev / Next bar buttons */}
            {onNavigateBar && (
              <div className="flex items-center bg-slate-100 p-0.5 rounded-xl text-xs font-bold text-slate-700">
                <button
                  type="button"
                  disabled={!canPrev}
                  onClick={() => {
                    onUpdateBarNotes(sectionId, barId, draftNotes);
                    onNavigateBar('prev');
                  }}
                  className="px-2 py-1 rounded-lg hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
                  title={lang === 'th' ? 'บันทึกแล้วไปห้องก่อนหน้า' : 'Save & go to previous bar'}
                >
                  {lang === 'th' ? '◀ ก่อนหน้า' : '◀ Prev'}
                </button>
                <button
                  type="button"
                  disabled={!canNext}
                  onClick={() => {
                    onUpdateBarNotes(sectionId, barId, draftNotes);
                    onNavigateBar('next');
                  }}
                  className="px-2 py-1 rounded-lg hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
                  title={lang === 'th' ? 'บันทึกแล้วไปห้องถัดไป' : 'Save & go to next bar'}
                >
                  {lang === 'th' ? 'ถัดไป ▶' : 'Next ▶'}
                </button>
              </div>
            )}

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-sm transition cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Toolbar & Controls */}
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Left toolbar items */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Audition Button */}
            <button
              type="button"
              onClick={handleToggleAudition}
              className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer ${
                isAuditioning
                  ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse'
                  : 'bg-[#1A73E8] hover:bg-blue-700 text-white'
              }`}
            >
              <span>
                {isAuditioning
                  ? (lang === 'th' ? '⏹ หยุดฟัง' : '⏹ Stop')
                  : (lang === 'th' ? '▶ ลองฟังเฉพาะห้องนี้' : '▶ Audition Bar')}
              </span>
            </button>

            {/* Scale Snap Toggle */}
            <button
              type="button"
              onClick={() => setKeySnapOnly(!keySnapOnly)}
              className={`px-2.5 py-1.5 rounded-xl font-bold transition border flex items-center gap-1 cursor-pointer ${
                keySnapOnly
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-2xs'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
              title={lang === 'th' ? 'ซ่อนโน้ตเพี้ยนนอกคีย์ เพื่อให้กดง่ายและกันเพี้ยน' : 'Hide out-of-key notes'}
            >
              <span>🎯</span>
              <span>
                {keySnapOnly
                  ? (lang === 'th' ? `คีย์ ${effectiveKey} (กันเพี้ยน)` : `Key ${effectiveKey} (Snap)`)
                  : (lang === 'th' ? 'โครมาติก (12 โน้ต)' : 'Chromatic (12)')}
              </span>
            </button>

            {/* Note Duration Selector */}
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 text-[11px] font-bold text-slate-700">
              <span className="text-slate-400 px-1">{lang === 'th' ? 'ความยาว:' : 'Dur:'}</span>
              {[1, 2, 4].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDefaultDuration(d)}
                  className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                    defaultDuration === d ? 'bg-[#1A73E8] text-white' : 'hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  {d === 1 ? '1/16' : d === 2 ? '1/8' : '1/4'}
                </button>
              ))}
            </div>

            {/* 16-step toggle (for 4/4) */}
            {is44 && (
              <button
                type="button"
                onClick={() => setResolution16(!resolution16)}
                className={`px-2.5 py-1.5 rounded-xl font-bold transition border cursor-pointer ${
                  resolution16
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                    : 'bg-white border-slate-200 text-slate-600'
                }`}
                title={lang === 'th' ? 'สลับความละเอียดตารางจังหวะ' : 'Toggle step resolution'}
              >
                {resolution16 ? (lang === 'th' ? 'ตาราง 16 ช่อง' : '16th Grid') : (lang === 'th' ? 'ตาราง 8 ช่อง' : '8th Grid')}
              </button>
            )}
          </div>

          {/* Right toolbar items */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyPrevNotes}
              className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold transition cursor-pointer"
              title={lang === 'th' ? 'ดึงโน้ตจากห้องก่อนหน้ามาใช้' : 'Copy notes from previous bar'}
            >
              {lang === 'th' ? '📋 ก็อปจากห้องก่อน' : '📋 Copy Prev Bar'}
            </button>

            <button
              type="button"
              onClick={handleClear}
              disabled={draftNotes.length === 0}
              className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 hover:text-rose-600 disabled:opacity-40 disabled:hover:text-slate-700 text-slate-600 font-bold transition cursor-pointer"
            >
              {lang === 'th' ? `🗑️ ล้างโน้ต (${draftNotes.length})` : `🗑️ Clear (${draftNotes.length})`}
            </button>
          </div>

          {/* Phase 5C Guide Helpers: 0-Cr Chord Guide Melody + Optional 2-Cr AI Phrasing TTS */}
          <div className="w-full pt-2 border-t border-slate-200/70 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                <span>{lang === 'th' ? 'ทรงเมโลดี้:' : 'Contour:'}</span>
                <select
                  value={guidePattern}
                  onChange={(e) => setGuidePattern(e.target.value as GuideContourPattern)}
                  className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 text-[11px] font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                >
                  <option value="gentle-arch">{lang === 'th' ? 'โค้งป๊อปนุ่ม' : 'Gentle Arch'}</option>
                  <option value="rising-hook">{lang === 'th' ? 'ไต่ส่งฮุค' : 'Rising Hook'}</option>
                  <option value="call-response">{lang === 'th' ? 'ถาม-ตอบ' : 'Call & Response'}</option>
                  <option value="arpeggio">{lang === 'th' ? 'ไล่คอร์ด' : 'Chord Arpeggio'}</option>
                </select>
              </label>

              <button
                type="button"
                onClick={handleGenerateGuideNotes}
                className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 font-bold transition cursor-pointer flex items-center gap-1"
              >
                <span>{t.generateGuideBtn}</span>
              </button>
            </div>

            {bar.lyrics.trim().length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {isBrowserSpeechSupported() && (
                  <button
                    type="button"
                    onClick={() => speakBrowserCueFallback(bar.lyrics.trim())}
                    title={
                      lang === 'th'
                        ? 'ให้เบราว์เซอร์อ่านเนื้อร้องห้องนี้ตามจังหวะ (ฟรี 0 เครดิต)'
                        : 'Read bar lyrics aloud via browser Web Speech API (0 Credits)'
                    }
                    className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 text-[11px] font-bold transition cursor-pointer"
                  >
                    {lang === 'th' ? '🗣️ อ่านเนื้อห้องนี้ (0 Cr)' : '🗣️ Read Bar (0 Cr)'}
                  </button>
                )}

                <label className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600">
                  <span>{lang === 'th' ? 'โมเดล:' : 'Model:'}</span>
                  <select
                    value={ttsModelTier}
                    onChange={(e) => setTtsModelTier(e.target.value as 'pro-tts' | 'lite-tts')}
                    className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 text-[11px] font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  >
                    <option value="pro-tts">
                      {lang === 'th' ? 'gemini-3.8-flash-tts (Pro ร้องไกด์)' : 'gemini-3.8-flash-tts (Pro)'}
                    </option>
                    <option value="lite-tts">
                      {lang === 'th' ? 'gemini-3.8-flash-lite-tts (Lite)' : 'gemini-3.8-flash-lite-tts (Lite)'}
                    </option>
                  </select>
                </label>

                <label className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600">
                  <span>{lang === 'th' ? 'เสียงร้อง AI:' : 'AI Voice:'}</span>
                  <select
                    value={ttsVoice}
                    onChange={(e) =>
                      setTtsVoice(
                        e.target.value as 'Kore' | 'Aoede' | 'Puck' | 'Charon' | 'Fenrir'
                      )
                    }
                    className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 text-[11px] font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  >
                    <option value="Kore">Kore ({lang === 'th' ? 'หญิง อบอุ่น' : 'Female Warm'})</option>
                    <option value="Aoede">Aoede ({lang === 'th' ? 'หญิง ใสโปร่ง' : 'Female Bright'})</option>
                    <option value="Puck">Puck ({lang === 'th' ? 'วัยรุ่น สดใส' : 'Youthful'})</option>
                    <option value="Charon">Charon ({lang === 'th' ? 'ชาย นุ่มลึก' : 'Male Deep'})</option>
                    <option value="Fenrir">Fenrir ({lang === 'th' ? 'ชาย หนักแน่น' : 'Male Rock'})</option>
                  </select>
                </label>

                {onSaveVocalToBar && (
                  <label className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50/80 border border-emerald-200 rounded-lg px-2 py-1 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autoSaveVocalToBar}
                      onChange={(e) => setAutoSaveVocalToBar(e.target.checked)}
                      className="accent-emerald-600 rounded"
                    />
                    <span>{lang === 'th' ? 'บันทึกเข้าห้องนี้อัตโนมัติ' : 'Auto-save to bar'}</span>
                  </label>
                )}

                {ttsAudioUrl && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        ttsAudioRef.current?.pause();
                        ttsAudioRef.current = playAudioDataUrl(ttsAudioUrl);
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 font-bold transition cursor-pointer"
                    >
                      {lang === 'th' ? '🔊 ฟังซ้ำ' : '🔊 Replay TTS'}
                    </button>
                    {onSaveVocalToBar && (
                      <button
                        type="button"
                        onClick={() => {
                          onSaveVocalToBar(ttsAudioUrl);
                          setTtsStatusMsg(
                            lang === 'th'
                              ? '✅ บันทึกเสียงร้อง AI ประจำห้องนี้แล้ว พร้อมฟังพรีวิวและมิกซ์ส่งออก!'
                              : '✅ Saved AI vocal take to this bar for playback & export!'
                          );
                        }}
                        className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition cursor-pointer shadow-xs"
                      >
                        {lang === 'th'
                          ? bar.vocalAudio === ttsAudioUrl
                            ? '✓ บันทึกเป็นเสียงร้องประจำห้องแล้ว'
                            : '💾 ใช้เสียง AI นี้เป็นเสียงร้องประจำห้อง'
                          : bar.vocalAudio === ttsAudioUrl
                            ? '✓ Saved as Bar Vocal'
                            : '💾 Save as Bar Vocal'}
                      </button>
                    )}
                  </>
                )}

                <button
                  type="button"
                  onClick={() => setTtsConfirmOpen((prev) => !prev)}
                  disabled={isGeneratingTts}
                  className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 font-bold transition cursor-pointer disabled:opacity-50"
                >
                  {isGeneratingTts
                    ? (lang === 'th' ? '⏳ กำลังสังเคราะห์...' : '⏳ Generating...')
                    : t.ttsCueBtn}
                </button>
              </div>
            )}

            {ttsConfirmOpen && bar.lyrics.trim().length > 0 && (
              <div className="w-full rounded-2xl bg-indigo-50/90 border border-indigo-200 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="text-indigo-950 font-medium min-w-0">
                  <span className="font-bold">
                    {lang === 'th'
                      ? `ยืนยันให้ ${ttsModelTier === 'pro-tts' ? 'gemini-3.8-flash-tts' : 'gemini-3.8-flash-lite-tts'} ร้องไกด์/แบ่งจังหวะ (${TTS_CUE_COST} เหรียญ):`
                      : `Confirm ${ttsModelTier === 'pro-tts' ? 'gemini-3.8-flash-tts' : 'gemini-3.8-flash-lite-tts'} singing cue (${TTS_CUE_COST} Credits):`}
                  </span>{' '}
                  <span className="text-indigo-700">&ldquo;{bar.lyrics.trim().slice(0, 60)}&rdquo;</span>{' '}
                  <span className="text-slate-500">
                    ({lang === 'th' ? `คงเหลือ ${currentCredits} เหรียญ · ไม่คิดเงินหากจำลอง` : `Balance ${currentCredits} Cr · Free if simulated`})
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setTtsConfirmOpen(false)}
                    className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-100 cursor-pointer"
                  >
                    {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    disabled={isGeneratingTts || currentCredits < TTS_CUE_COST}
                    onClick={handleConfirmTtsCue}
                    className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-bold cursor-pointer"
                  >
                    {lang === 'th' ? `ยืนยันใช้ ${TTS_CUE_COST} เหรียญ` : `Confirm (${TTS_CUE_COST} Cr)`}
                  </button>
                </div>
              </div>
            )}

            {ttsStatusMsg && (
              <div className="w-full text-[11px] font-medium text-emerald-800 bg-emerald-50/80 border border-emerald-200 rounded-xl px-3 py-1.5">
                {ttsStatusMsg}
              </div>
            )}
          </div>
        </div>

        {/* Legend / Helper Info */}
        <div className="px-5 py-1.5 bg-slate-100/70 border-b border-slate-200/60 flex flex-wrap items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span>
              <span>{lang === 'th' ? `โน้ตในคอร์ด (${chord1})` : `Chord Tone (${chord1})`}</span>
            </span>
            <span className="flex items-center gap-1 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span>
              <span>{lang === 'th' ? 'โน้ตร้องไกด์' : 'Melody Guide'}</span>
            </span>
            <span className="text-slate-400">
              {lang === 'th'
                ? '💡 คลิกเพื่อเพิ่ม/ลบโน้ต • กดคีย์เปียโนซ้ายเพื่อลองฟังเสียง'
                : '💡 Click cell to toggle note • Click left piano keys to preview'}
            </span>
          </div>
          {bar.lyrics && (
            <div className="font-bold text-slate-700 truncate max-w-xs sm:max-w-md">
              {lang === 'th' ? 'เนื้อร้อง:' : 'Lyrics:'} &ldquo;{bar.lyrics}&rdquo;
            </div>
          )}
        </div>

        {/* Piano Roll Grid Area */}
        <div className="flex-1 overflow-y-auto max-h-[58vh] bg-slate-50 relative select-none">
          <div className="flex min-w-[500px]">
            {/* Left Keys Column */}
            <div className="w-20 sm:w-24 shrink-0 sticky left-0 z-20 bg-white border-r border-slate-300 shadow-xs">
              {/* Pitch Row Header Placeholder */}
              <div className="h-8 border-b border-slate-300 bg-slate-100 flex items-center justify-center font-bold text-[10px] text-slate-500 uppercase">
                Pitch
              </div>
              {lyricSyllableGuides.length > 0 && (
                <div className="h-9 border-b border-blue-200 bg-blue-50/90 flex items-center justify-center font-bold text-[10px] text-blue-700 px-1 text-center">
                  {lang === 'th' ? 'พยางค์/เสียง' : 'Syllable/Tone'}
                </div>
              )}
              {visiblePitches.map((pitch) => {
                const isBlack = isBlackKey(pitch);
                const noteName = midiToNoteName(pitch);
                const pc = pitch % 12;
                const isChordTone = chord1Pcs.has(pc) || chord2Pcs.has(pc);
                const isRoot = pc === rootPc;

                return (
                  <button
                    key={pitch}
                    type="button"
                    onClick={() => getAudioEngine().previewNote(pitch, 0.45)}
                    className={`w-full h-8 px-2 flex items-center justify-between border-b text-xs font-bold transition active:bg-blue-200 cursor-pointer ${
                      isBlack
                        ? 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
                        : 'bg-white text-slate-800 border-slate-200 hover:bg-blue-50'
                    }`}
                    title={`กดเพื่อฟังเสียง ${noteName}`}
                  >
                    <span className="font-mono text-[11px]">{noteName}</span>
                    <div className="flex items-center gap-0.5">
                      {isChordTone && (
                        <span className="w-2 h-2 rounded-full bg-amber-400 shadow-2xs" title="โน้ตในคอร์ด"></span>
                      )}
                      {isRoot && (
                        <span className="w-2 h-2 rounded-full bg-blue-500 shadow-2xs" title="โน้ต Root"></span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Grid Columns (Beats & Steps) */}
            <div className="flex-1 flex flex-col">
              {/* Beat Headers */}
              <div className="h-8 border-b border-slate-300 bg-slate-100 flex sticky top-0 z-10">
                {Array.from({ length: totalSteps }).map((_, step) => {
                  const isBeatStart = step % stepsPerBeat === 0;
                  const beatNum = Math.floor(step / stepsPerBeat) + 1;
                  return (
                    <div
                      key={step}
                      className={`flex-1 border-r flex items-center justify-center text-[10px] font-bold ${
                        isBeatStart
                          ? 'border-r-slate-400 bg-slate-200/80 text-slate-800'
                          : 'border-r-slate-200/80 text-slate-400'
                      }`}
                    >
                      {isBeatStart ? `จังหวะ ${beatNum}` : ''}
                    </div>
                  );
                })}
              </div>

              {/* Aligned Thai Syllable + Tone & Liveness Strip */}
              {lyricSyllableGuides.length > 0 && (
                <div className="h-9 border-b border-blue-200 bg-blue-50/80 flex items-stretch sticky top-8 z-10 overflow-hidden">
                  {lyricSyllableGuides.map((g, idx) => (
                    <div
                      key={`${g.syllable}-${idx}`}
                      title={`${g.syllable} • วรรณยุกต์${g.phonetics.tone} • ${g.phonetics.livenessLabel} (${g.phonetics.codaFamily}) • ${g.phonetics.melodyAdvice}`}
                      className="flex-1 min-w-0 border-r border-blue-200/70 px-1 flex flex-col items-center justify-center leading-tight"
                    >
                      <span className="text-[11px] font-bold text-slate-900 truncate max-w-full">
                        {g.syllable}
                      </span>
                      <span className="text-[9px] font-semibold text-blue-700 truncate max-w-full">
                        {g.phonetics.tone}·{g.phonetics.isLiveSyllable ? 'เป็น' : 'ตาย'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Grid Rows for each pitch */}
              {visiblePitches.map((pitch) => {
                const isBlack = isBlackKey(pitch);
                return (
                  <div
                    key={pitch}
                    className={`h-8 border-b flex relative ${
                      isBlack ? 'bg-slate-100/70 border-slate-200/80' : 'bg-white border-slate-200'
                    }`}
                  >
                    {/* Background Beat Vertical Columns */}
                    {Array.from({ length: totalSteps }).map((_, step) => {
                      const isBeatStart = step % stepsPerBeat === 0;
                      return (
                        <div
                          key={step}
                          onClick={() => handleCellClick(pitch, step)}
                          className={`flex-1 h-full border-r transition cursor-pointer hover:bg-blue-100/50 ${
                            isBeatStart ? 'border-r-slate-300/80' : 'border-r-slate-100'
                          }`}
                        />
                      );
                    })}

                    {/* Placed Notes on this Pitch */}
                    {draftNotes
                      .filter((n) => n.midiPitch === pitch)
                      .map((note) => {
                        const leftPercent = (note.step / totalSteps) * 100;
                        const widthPercent = (note.durationSteps / totalSteps) * 100;
                        const noteName = midiToNoteName(note.midiPitch);

                        return (
                          <div
                            key={`${note.midiPitch}-${note.step}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCellClick(note.midiPitch, note.step);
                            }}
                            style={{
                              left: `${leftPercent}%`,
                              width: `${widthPercent}%`,
                            }}
                            className="absolute top-0.5 bottom-0.5 rounded-lg bg-gradient-to-r from-[#1A73E8] to-indigo-600 text-white font-black text-[10px] shadow-sm flex items-center justify-between px-1.5 z-10 border border-blue-400 cursor-pointer hover:brightness-110 active:brightness-95 group transition"
                            title={`โน้ต ${noteName} (เริ่มจังหวะที่ ${(note.step / stepsPerBeat) + 1}, ยาว ${note.durationSteps} ช่อง)`}
                          >
                            <span className="truncate">{noteName}</span>

                            {/* Duration modifier buttons on hover */}
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
                              <button
                                type="button"
                                onClick={(e) => handleChangeDuration(e, note, -1)}
                                disabled={note.durationSteps <= 1}
                                className="w-4 h-4 rounded bg-white/20 hover:bg-white/40 flex items-center justify-center text-[10px] disabled:opacity-30"
                                title="ลดความยาวโน้ต"
                              >
                                -
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleChangeDuration(e, note, 1)}
                                disabled={note.step + note.durationSteps >= totalSteps}
                                className="w-4 h-4 rounded bg-white/20 hover:bg-white/40 flex items-center justify-center text-[10px] disabled:opacity-30"
                                title="เพิ่มความยาวโน้ต"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom Lyrics Sync Bar */}
        {bar.lyrics && (
          <div className="px-5 py-2 bg-blue-50/50 border-t border-blue-100 flex items-center gap-2 text-xs">
            <span className="font-bold text-[#1A73E8]">🎤 {lang === 'th' ? 'เนื้อร้อง:' : 'Lyrics:'}</span>
            <span className="font-medium text-slate-800">{bar.lyrics}</span>
            <span className="text-[11px] text-slate-400 ml-auto">
              ({lang === 'th' ? 'จัดวางตำแหน่งโน้ตให้สอดคล้องกับพยางค์ของเนื้อร้อง' : 'Align notes to match lyrics'})
            </span>
          </div>
        )}

        {/* Modal Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-white flex items-center justify-between">
          <div className="text-xs text-slate-500 font-medium">
            {lang === 'th' ? 'มีโน้ตในห้องนี้:' : 'Notes in this bar:'}{' '}
            <span className="font-bold text-slate-800">
              {draftNotes.length} {lang === 'th' ? 'โน้ต' : 'notes'}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition cursor-pointer text-xs"
            >
              {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 rounded-xl bg-[#1A73E8] hover:bg-blue-700 text-white font-bold transition shadow-sm cursor-pointer text-xs flex items-center gap-1.5"
            >
              <span>{lang === 'th' ? '✓ บันทึกโน้ตทำนอง' : '✓ Save Melody'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
