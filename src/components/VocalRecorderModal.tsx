'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SongProject } from '@/types/song';
import { MicRecorder, playAudioDataUrl } from '@/lib/micRecorder';
import { getAudioEngine } from '@/lib/audioEngine';
import { transposeChord } from '@/lib/chordUtils';
import { useLanguage } from '@/context/LanguageContext';

interface VocalRecorderModalProps {
  isOpen: boolean;
  song: SongProject;
  sectionId: string;
  barId: string;
  globalBarIndex: number;
  onSaveVocal: (sectionId: string, barId: string, vocalAudio: string, latencyOffsetMs: number) => void;
  onClearVocal: (sectionId: string, barId: string) => void;
  onClose: () => void;
}

export const VocalRecorderModal: React.FC<VocalRecorderModalProps> = ({
  isOpen,
  song,
  sectionId,
  barId,
  globalBarIndex,
  onSaveVocal,
  onClearVocal,
  onClose,
}) => {
  const { lang } = useLanguage();
  const section = song.sections.find((s) => s.id === sectionId);
  const bar = section?.bars.find((b) => b.id === barId);

  const [isRecording, setIsRecording] = useState(false);
  const [recordDurationSec, setRecordDurationSec] = useState(0);
  const [vuLevel, setVuLevel] = useState(0); // 0-100%
  const [recordedDataUrl, setRecordedDataUrl] = useState<string | null>(bar?.vocalAudio || null);
  const [isPlayingVocalOnly, setIsPlayingVocalOnly] = useState(false);
  const [isPlayingWithBacking, setIsPlayingWithBacking] = useState(false);
  const [latencyOffsetMs, setLatencyOffsetMs] = useState<number>(song.vocalLatencyOffsetMs ?? 0);
  const [countdownNum, setCountdownNum] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recorderRef = useRef<MicRecorder | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Stop playback cleanly
  const handleStopAllPlayback = useCallback(() => {
    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
      audioPreviewRef.current = null;
    }
    getAudioEngine().stop();
    setIsPlayingVocalOnly(false);
    setIsPlayingWithBacking(false);
  }, [setIsPlayingVocalOnly, setIsPlayingWithBacking]);

  // Sync initial state when bar changes
  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      if (bar) {
        setRecordedDataUrl(bar.vocalAudio || null);
      }
      setLatencyOffsetMs(song.vocalLatencyOffsetMs ?? 0);
      setErrorMessage(null);
    });
    return () => cancelAnimationFrame(rafId);
  }, [bar, song.vocalLatencyOffsetMs]);

  // Clean up when closing
  useEffect(() => {
    if (!isOpen) {
      if (recorderRef.current) {
        recorderRef.current.cancel();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      const rafId = requestAnimationFrame(() => {
        handleStopAllPlayback();
        setIsRecording(false);
        setCountdownNum(null);
      });
      return () => cancelAnimationFrame(rafId);
    }
  }, [isOpen, handleStopAllPlayback]);

  if (!isOpen || !section || !bar) return null;

  const chord1 = bar.chords[0] ? transposeChord(bar.chords[0], song.transposeSemitones) : 'C';
  const chord2 = bar.chordsPerBar === 2 && bar.chords[1] ? transposeChord(bar.chords[1], song.transposeSemitones) : null;

  // Start Countdown then Start Recording
  const handleStartRecording = async () => {
    handleStopAllPlayback();
    setErrorMessage(null);

    // Initial countdown 3, 2, 1
    setCountdownNum(3);
    let count = 3;
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = setInterval(async () => {
      count--;
      if (count > 0) {
        setCountdownNum(count);
      } else {
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        setCountdownNum(null);
        await proceedRecording();
      }
    }, 600);
  };

  const proceedRecording = async () => {
    try {
      const recorder = new MicRecorder();
      recorderRef.current = recorder;

      await recorder.start((level) => {
        setVuLevel(level);
      });

      setIsRecording(true);
      setRecordDurationSec(0);

      // Start backing track auditioning for this bar so singer can hear chords
      getAudioEngine().playBarAudition(song, globalBarIndex);

      timerRef.current = setInterval(() => {
        setRecordDurationSec((prev) => prev + 0.1);
      }, 100);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      setErrorMessage(
        msg ||
          (lang === 'th'
            ? 'ไม่สามารถเปิดไมโครโฟนได้ กรุณาอนุญาตการเข้าถึงไมค์ในเบราว์เซอร์'
            : 'Cannot access microphone. Please grant mic permission in your browser.')
      );
      setIsRecording(false);
    }
  };

  // Stop Recording
  const handleStopRecording = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    getAudioEngine().stop();
    setVuLevel(0);
    setIsRecording(false);

    if (recorderRef.current) {
      try {
        const result = await recorderRef.current.stop();
        setRecordedDataUrl(result.dataUrl);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '';
        setErrorMessage(
          msg || (lang === 'th' ? 'เกิดข้อผิดพลาดในการบันทึกเสียง' : 'Error saving vocal recording.')
        );
      }
    }
  };

  // Play Vocal Isolated
  const handlePlayVocalOnly = () => {
    if (isPlayingVocalOnly) {
      handleStopAllPlayback();
      return;
    }
    if (!recordedDataUrl) return;

    handleStopAllPlayback();
    setIsPlayingVocalOnly(true);
    audioPreviewRef.current = playAudioDataUrl(recordedDataUrl, {
      volume: 1.0,
      onEnd: () => setIsPlayingVocalOnly(false),
    });
  };

  // Audition Vocal with Backing Track
  const handleAuditionWithBacking = () => {
    if (isPlayingWithBacking) {
      handleStopAllPlayback();
      return;
    }
    if (!recordedDataUrl) return;

    handleStopAllPlayback();
    setIsPlayingWithBacking(true);

    // Play backing track
    getAudioEngine().playBarAudition(song, globalBarIndex, () => {
      setIsPlayingWithBacking(false);
    });

    // Schedule vocal with latency offset
    const delayMs = Math.max(0, latencyOffsetMs);
    setTimeout(() => {
      audioPreviewRef.current = playAudioDataUrl(recordedDataUrl, {
        volume: 0.95,
        onEnd: () => setIsPlayingWithBacking(false),
      });
    }, delayMs);
  };

  // Save and Close
  const handleSave = () => {
    if (recordedDataUrl) {
      onSaveVocal(sectionId, barId, recordedDataUrl, latencyOffsetMs);
    }
    onClose();
  };

  // Delete Vocal
  const handleDeleteVocal = () => {
    if (confirm(lang === 'th' ? 'ต้องการลบเสียงร้องในห้องนี้ใช่หรือไม่?' : 'Delete recorded vocal for this bar?')) {
      handleStopAllPlayback();
      setRecordedDataUrl(null);
      onClearVocal(sectionId, barId);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/65 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-rose-50/70 via-amber-50/40 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center text-lg shadow-sm font-black">
              🎙️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base sm:text-lg text-slate-900">
                  {lang === 'th' ? 'อัดเสียงร้องสด / ฮัมไกด์ (Vocal Scratchpad)' : 'Vocal Scratchpad (Mic Recording)'}
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 font-black text-xs">
                  {lang === 'th' ? `ห้องที่ ${globalBarIndex + 1}` : `Bar ${globalBarIndex + 1}`}
                </span>
              </div>
              <div className="text-xs text-slate-500 font-medium">
                {section.name} • {lang === 'th' ? 'คอร์ด: ' : 'Chord: '}{' '}
                <span className="font-bold text-slate-800">
                  {chord1} {chord2 ? `→ ${chord2}` : ''}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-sm transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6">
          {/* Lyrics Prompt Box */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-1">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              {lang === 'th' ? 'เนื้อร้องประจำห้องนี้' : 'Bar Lyrics'}
            </div>
            <div className="text-base sm:text-lg font-bold text-slate-800">
              {bar.lyrics ? (
                `“${bar.lyrics}”`
              ) : (
                <span className="text-slate-400 italic">
                  {lang === 'th' ? 'ยังไม่มีเนื้อร้อง (ฮัมทำนองได้ตามใจชอบ)' : 'No lyrics (feel free to hum or sing)'}
                </span>
              )}
            </div>
          </div>

          {/* Error Message if any */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700 flex items-center gap-2">
              <span>⚠️</span>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Recording & VU Meter Center Stage */}
          <div className="flex flex-col items-center justify-center p-6 rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50/50 to-white space-y-4">
            {/* Countdown Overlay */}
            {countdownNum !== null ? (
              <div className="text-5xl font-black text-rose-600 animate-ping">{countdownNum}</div>
            ) : isRecording ? (
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-2 text-rose-600 font-bold text-sm animate-pulse">
                  <span className="w-3 h-3 rounded-full bg-rose-600 inline-block"></span>
                  <span>
                    {lang === 'th' ? 'กำลังอัดเสียง... ' : 'Recording... '}
                    {recordDurationSec.toFixed(1)}s
                  </span>
                </div>
                {/* Live VU Meter Bar */}
                <div className="w-48 sm:w-64 h-3 bg-slate-200 rounded-full overflow-hidden p-0.5 border border-slate-300">
                  <div
                    style={{ width: `${vuLevel}%` }}
                    className={`h-full rounded-full transition-all duration-75 ${
                      vuLevel > 80 ? 'bg-rose-500' : vuLevel > 50 ? 'bg-amber-400' : 'bg-emerald-500'
                    }`}
                  />
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div className="text-xs text-slate-500 font-medium">
                  {recordedDataUrl
                    ? lang === 'th'
                      ? '✨ มีเสียงร้องบันทึกอยู่ในห้องนี้แล้ว สามารถกดฟังหรือกดอัดทับใหม่ได้'
                      : '✨ Vocal recorded. Play back or re-record over it.'
                    : lang === 'th'
                    ? 'ใส่หูฟังแล้วกดปุ่มเพื่อเริ่มอัดเสียงร้องฮัมคลอไปกับเสียงดนตรี'
                    : 'Plug in headphones and tap to sing or hum along.'}
                </div>
              </div>
            )}

            {/* Record / Stop Button */}
            <div>
              {isRecording ? (
                <button
                  type="button"
                  onClick={handleStopRecording}
                  className="px-6 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black text-sm transition shadow-lg flex items-center gap-2 cursor-pointer"
                >
                  <span className="w-3 h-3 rounded-xs bg-rose-500 inline-block"></span>
                  <span>{lang === 'th' ? '⏹ หยุดบันทึก' : '⏹ Stop Recording'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartRecording}
                  className="px-6 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-sm transition shadow-lg shadow-rose-600/20 flex items-center gap-2 cursor-pointer active:scale-95"
                >
                  <span className="w-3 h-3 rounded-full bg-white inline-block"></span>
                  <span>
                    {recordedDataUrl
                      ? lang === 'th'
                        ? '🔴 อัดเสียงใหม่ทับ'
                        : '🔴 Re-record Over'
                      : lang === 'th'
                      ? '🔴 เริ่มอัดเสียงร้อง'
                      : '🔴 Start Recording'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Review & Audition Controls (Shown when recording exists) */}
          {recordedDataUrl && !isRecording && (
            <div className="space-y-4 pt-2 border-t border-slate-100">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700">
                  {lang === 'th' ? '🎧 ทดลองฟังเสียงร้อง:' : '🎧 Audition Vocals:'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePlayVocalOnly}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      isPlayingVocalOnly
                        ? 'bg-rose-100 border-rose-300 text-rose-800'
                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span>
                      {isPlayingVocalOnly
                        ? lang === 'th'
                          ? '⏹ หยุด'
                          : '⏹ Stop'
                        : lang === 'th'
                        ? '▶ เสียงร้องเดี่ยว'
                        : '▶ Solo Vocal'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAuditionWithBacking}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                      isPlayingWithBacking
                        ? 'bg-indigo-600 text-white animate-pulse'
                        : 'bg-[#1A73E8] hover:bg-blue-700 text-white'
                    }`}
                  >
                    <span>
                      {isPlayingWithBacking
                        ? lang === 'th'
                          ? '⏹ หยุด'
                          : '⏹ Stop'
                        : lang === 'th'
                        ? '▶ ฟังคู่ดนตรี'
                        : '▶ Vocal + Backing'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDeleteVocal}
                    className="p-1.5 text-slate-400 hover:text-rose-600 transition"
                    title={lang === 'th' ? 'ลบเสียงร้องห้องนี้' : 'Delete vocal'}
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {/* Latency Offset Slider */}
              <div className="p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-100 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-indigo-950 flex items-center gap-1">
                    {lang === 'th' ? '⚡ ชดเชยเสียงหน่วง (Latency Offset)' : '⚡ Latency Offset'}
                  </span>
                  <span className="font-mono font-bold text-indigo-700">
                    {latencyOffsetMs > 0 ? `+${latencyOffsetMs}` : latencyOffsetMs} ms
                  </span>
                </div>
                <input
                  type="range"
                  min="-150"
                  max="150"
                  step="5"
                  value={latencyOffsetMs}
                  onChange={(e) => setLatencyOffsetMs(parseInt(e.target.value, 10))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
                <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium">
                  <span>{lang === 'th' ? '◀ ขยับให้เร็วขึ้น (-150ms)' : '◀ Earlier (-150ms)'}</span>
                  <span className="text-slate-400">{lang === 'th' ? '0ms ตรงบีท' : '0ms On-beat'}</span>
                  <span>{lang === 'th' ? 'ขยับให้ช้าลง (+150ms) ▶' : 'Later (+150ms) ▶'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-white transition cursor-pointer text-xs"
          >
            {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={!recordedDataUrl}
            className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white font-bold transition shadow-sm cursor-pointer text-xs flex items-center gap-1.5"
          >
            <span>{lang === 'th' ? '✓ บันทึกเสียงลงเพลง' : '✓ Save Vocal'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
