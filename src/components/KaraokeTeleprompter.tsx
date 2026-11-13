'use client';

import React, { useEffect, useRef } from 'react';
import { MicVocal, Music, Radio } from 'lucide-react';
import { SongProject } from '@/types/song';
import { transposeChord, getCapoFingeringChord } from '@/lib/chordUtils';
import { useLanguage } from '@/context/LanguageContext';

interface KaraokeTeleprompterProps {
  song: SongProject;
  activeGlobalBarIndex: number;
  currentBeat: number;
  isPlaying: boolean;
  isCountIn: boolean;
}

export function KaraokeTeleprompter({
  song,
  activeGlobalBarIndex,
  currentBeat,
  isPlaying,
  isCountIn,
}: KaraokeTeleprompterProps) {
  const { t, lang } = useLanguage();
  const activeLineRef = useRef<HTMLDivElement | null>(null);

  const flatBars: {
    globalIndex: number;
    sectionName: string;
    chord1: string;
    chord2?: string;
    capoChord1?: string;
    capoChord2?: string;
    lyrics: string;
    hasVocal: boolean;
  }[] = [];

  let counter = 0;
  for (const sec of song.sections) {
    for (const bar of sec.bars) {
      const c1 = transposeChord(bar.chords[0] || 'C', song.transposeSemitones);
      const c2 =
        bar.chordsPerBar === 2
          ? transposeChord(bar.chords[1] || bar.chords[0] || 'C', song.transposeSemitones)
          : undefined;

      flatBars.push({
        globalIndex: counter++,
        sectionName: sec.name,
        chord1: c1,
        chord2: c2,
        capoChord1:
          song.capoFret > 0 ? getCapoFingeringChord(c1, song.capoFret) : undefined,
        capoChord2:
          song.capoFret > 0 && c2
            ? getCapoFingeringChord(c2, song.capoFret)
            : undefined,
        lyrics: bar.lyrics,
        hasVocal: Boolean(bar.vocalAudio),
      });
    }
  }

  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeGlobalBarIndex]);

  const beatsPerBar =
    song.timeSignature === '3/4' ? 3 : song.timeSignature === '6/8' ? 6 : 4;

  const statusText = isCountIn
    ? lang === 'th'
      ? 'เตรียมนับเข้าจังหวะ...'
      : 'Count-In Ready...'
    : isPlaying
      ? `${t.barLabel} ${Math.max(1, activeGlobalBarIndex + 1)} / ${flatBars.length}`
      : lang === 'th'
        ? 'พร้อมร้อง (กด Space หรือ ปุ่มเล่น)'
        : 'Ready (Press Space or Play)';

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-16">
      {/* Top Status Card */}
      <div className="bg-surface-1 rounded-3xl border border-hairline p-5 sm:p-6 shadow-e1 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent-text">
            <MicVocal className="w-3.5 h-3.5" />
            <span>{t.modeKaraoke}</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-ink-900 tracking-tight">
            {song.title}
          </h2>
          <p className="text-xs text-ink-400 font-medium">{statusText}</p>
        </div>

        {/* Beat Indicator & Tempo Pill */}
        <div className="flex items-center gap-3 self-start sm:self-center">
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-surface-2 border border-hairline">
            {Array.from({ length: beatsPerBar }).map((_, bIdx) => {
              const isCurrentBeat =
                (isPlaying || isCountIn) && currentBeat === bIdx + 1;
              return (
                <span
                  key={bIdx}
                  className={`w-2.5 h-2.5 rounded-full transition-transform ${
                    isCurrentBeat
                      ? isCountIn
                        ? 'bg-warn-500 scale-125'
                        : 'bg-accent-500 scale-125'
                      : 'bg-surface-inset'
                  }`}
                />
              );
            })}
          </div>
          <div className="px-3 py-2 rounded-2xl bg-surface-2 border border-hairline text-xs font-mono-tabular font-semibold text-ink-700">
            {song.bpm} BPM
          </div>
        </div>
      </div>

      {/* Prompter Lines List */}
      <div className="space-y-3">
        {flatBars.map((item, idx) => {
          const isActive = activeGlobalBarIndex === item.globalIndex;
          const isPast =
            activeGlobalBarIndex > -1 && item.globalIndex < activeGlobalBarIndex;
          const showSectionHeader =
            idx === 0 || flatBars[idx - 1].sectionName !== item.sectionName;

          return (
            <React.Fragment key={item.globalIndex}>
              {showSectionHeader && (
                <div className="pt-3 pb-1 px-1 flex items-center gap-2">
                  <span className="text-[11px] font-mono-tabular font-semibold uppercase tracking-wider text-accent-text bg-accent-50 border border-accent-200 px-2.5 py-0.5 rounded-full">
                    {item.sectionName}
                  </span>
                  <div className="flex-1 border-t border-hairline" />
                </div>
              )}

              <div
                ref={isActive ? activeLineRef : null}
                className={`rounded-2xl border p-4 sm:p-5 transition-all duration-200 ${
                  isActive
                    ? 'bg-accent-50 border-accent-500 ring-2 ring-accent-200 shadow-e2 scale-[1.01]'
                    : isPast
                      ? 'bg-surface-2/60 border-hairline opacity-55'
                      : 'bg-surface-1 border-hairline shadow-2xs'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-xs font-mono-tabular font-semibold px-2 py-0.5 rounded-md ${
                        isActive
                          ? 'bg-accent-500 text-white'
                          : 'bg-surface-2 text-ink-400'
                      }`}
                    >
                      #{item.globalIndex + 1}
                    </span>

                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-surface-2 border border-hairline font-mono-tabular text-sm font-bold text-ink-900">
                      <span>[ {item.chord1} ]</span>
                      {item.chord2 && (
                        <>
                          <span className="text-ink-400">·</span>
                          <span>[ {item.chord2} ]</span>
                        </>
                      )}
                    </div>

                    {item.capoChord1 && (
                      <span className="text-[11px] font-mono-tabular font-medium text-accent-text">
                        Capo {song.capoFret}: {item.capoChord1}
                        {item.capoChord2 ? ` · ${item.capoChord2}` : ''}
                      </span>
                    )}
                  </div>

                  {item.hasVocal && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-700 bg-surface-2 border border-hairline px-2 py-0.5 rounded-full">
                      <Radio className="w-3 h-3 text-rec-500" />
                      <span>{t.vocalHasTrack}</span>
                    </span>
                  )}
                </div>

                <p
                  className={`leading-relaxed break-words ${
                    isActive
                      ? 'text-xl sm:text-2xl font-bold text-ink-900'
                      : 'text-base sm:text-lg font-medium text-ink-700'
                  }`}
                >
                  {item.lyrics?.trim() ? (
                    item.lyrics
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-sm italic text-ink-400 font-normal">
                      <Music className="w-3.5 h-3.5" />
                      {lang === 'th'
                        ? '(เพลงบรรเลง / เว้นวรรคหายใจ)'
                        : '(Instrumental / Breath pause)'}
                    </span>
                  )}
                </p>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

export default KaraokeTeleprompter;
