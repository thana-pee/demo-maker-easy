'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { SongProject, SongBar, MelodyNote } from '@/types/song';
import {
  midiToNoteName,
  isBlackKey,
  getScalePitchClasses,
  getChordPitchClasses,
  getPitchRange,
  getRootPitchClass,
} from '@/lib/melodyUtils';
import { transposeChord } from '@/lib/chordUtils';
import { getAudioEngine } from '@/lib/audioEngine';
import { useLanguage } from '@/context/LanguageContext';

interface MiniPianoRollModalProps {
  isOpen: boolean;
  song: SongProject;
  sectionId: string;
  barId: string;
  globalBarIndex: number;
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
  onUpdateBarNotes,
  onNavigateBar,
  canPrev = false,
  canNext = false,
  onClose,
}) => {
  const { lang } = useLanguage();
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
    });
    return () => cancelAnimationFrame(rafId);
  }, [bar]);

  // Stop auditioning when closing
  useEffect(() => {
    if (!isOpen && isAuditioning) {
      getAudioEngine().stop();
      const rafId = requestAnimationFrame(() => {
        setIsAuditioning(false);
      });
      return () => cancelAnimationFrame(rafId);
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
