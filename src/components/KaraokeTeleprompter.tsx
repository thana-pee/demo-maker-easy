'use client';

import React, { useEffect, useRef } from 'react';
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

export const KaraokeTeleprompter: React.FC<KaraokeTeleprompterProps> = ({
  song,
  activeGlobalBarIndex,
  currentBeat,
  isPlaying,
  isCountIn,
}) => {
  const { lang, t } = useLanguage();
  const activeLineRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll active line into center of viewport when bar changes
  useEffect(() => {
    if (isPlaying && activeLineRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeGlobalBarIndex, isPlaying]);

  // Flatten all bars across all sections with section context
  let globalIndex = 0;
  const flatBars: Array<{
    globalIdx: number;
    sectionName: string;
    sectionType: string;
    chord1: string;
    capoChord1: string;
    chord2: string | null;
    capoChord2: string | null;
    lyrics: string;
    playStyle: string;
    instruments: {
      guitarRhythm: boolean;
      guitarLead: boolean;
      bass: boolean;
      piano: boolean;
      drums: boolean;
    };
  }> = [];

  song.sections.forEach((sec) => {
    const inst = sec.instruments || {
      guitarRhythm: true,
      guitarLead: false,
      bass: true,
      piano: true,
      drums: true,
    };
    sec.bars.forEach((bar) => {
      const c1 = transposeChord(bar.chords[0] || 'C', song.transposeSemitones);
      const capo1 = getCapoFingeringChord(c1, song.capoFret);

      let c2: string | null = null;
      let capo2: string | null = null;
      if (bar.chordsPerBar === 2 && bar.chords[1]) {
        c2 = transposeChord(bar.chords[1], song.transposeSemitones);
        capo2 = getCapoFingeringChord(c2, song.capoFret);
      }

      flatBars.push({
        globalIdx: globalIndex++,
        sectionName: sec.name,
        sectionType: sec.type,
        instruments: inst,
        chord1: c1,
        capoChord1: capo1,
        chord2: c2,
        capoChord2: capo2,
        lyrics: bar.lyrics,
        playStyle: bar.playStyle,
      });
    });
  });

  return (
    <div className="space-y-6">
      {/* Top Prompter Status Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="px-3.5 py-1 rounded-full bg-blue-100 text-[#1A73E8] font-black text-xs">
            {t.modeKaraoke} (Teleprompter)
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mt-2">
            {song.title}
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-slate-600 mt-1">
            <span>{t.tempo} <strong>{song.bpm} BPM</strong></span>
            <span>•</span>
            <span>{t.timeSignature} <strong>{song.timeSignature}</strong></span>
            {song.capoFret > 0 && (
              <>
                <span>•</span>
                <span className="text-indigo-800 font-bold bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-200">
                  {lang === 'th'
                    ? `🎸 คาด Capo ช่อง ${song.capoFret} (ดูคอร์ดในวงเล็บ)`
                    : `🎸 Capo Fret ${song.capoFret} (Play shape in brackets)`}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Live Active Status */}
        <div className="text-right">
          {isCountIn ? (
            <div className="px-4 py-2.5 rounded-2xl bg-amber-500 text-white font-black text-base animate-pulse shadow-md">
              {lang === 'th' ? `🥁 เคาะนับเข้าจังหวะ... (${currentBeat})` : `🥁 Counting in... (${currentBeat})`}
            </div>
          ) : (
            <div className="px-5 py-2.5 rounded-2xl bg-slate-100 text-slate-800 font-bold text-sm">
              {lang === 'th' ? 'ห้องปัจจุบัน:' : 'Current Bar:'}{' '}
              <span className="text-[#1A73E8] font-black text-lg">{activeGlobalBarIndex + 1}</span> / {flatBars.length}
            </div>
          )}
        </div>
      </div>

      {/* Prompter Lines List */}
      <div className="space-y-4">
        {flatBars.map((item) => {
          const isActive = !isCountIn && item.globalIdx === activeGlobalBarIndex;
          const isPast = !isCountIn && item.globalIdx < activeGlobalBarIndex;

          return (
            <div
              key={item.globalIdx}
              ref={isActive ? activeLineRef : null}
              className={`p-5 sm:p-7 rounded-3xl transition-all duration-200 border-2 ${
                isActive
                  ? 'bg-[#E8F0FE] border-[#1A73E8] shadow-lg shadow-blue-500/20 scale-101'
                  : isPast
                  ? 'bg-white/60 border-slate-200/60 opacity-60'
                  : 'bg-white border-slate-200'
              }`}
            >
              {/* Line Meta (Section & Bar number) */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-bold">
                    {item.sectionName}
                  </span>
                  <span className="text-xs font-semibold text-slate-400">
                    {t.barLabel} {item.globalIdx + 1}
                  </span>
                  {item.playStyle === 'let-ring' && (
                    <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                      🔔 {t.styleLetRing}
                    </span>
                  )}
                  {item.playStyle === 'break' && (
                    <span className="text-xs font-bold text-slate-700 bg-slate-200 px-2 py-0.5 rounded-md">
                      🔇 {t.styleBreak}
                    </span>
                  )}
                  <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                    {item.instruments.guitarRhythm && <span title="Rhythm Guitar">🎸 {lang === 'th' ? 'ริทึ่ม' : 'Rhythm'}</span>}
                    {item.instruments.guitarLead && (
                      <span title="Lead Guitar (Les Paul)" className="text-purple-700 font-bold">
                        🎸 {lang === 'th' ? 'ลีด' : 'Lead'}
                      </span>
                    )}
                    {item.instruments.bass && <span title="Bass">🎻</span>}
                    {item.instruments.piano && <span title="Piano">🎹</span>}
                    {item.instruments.drums && <span title="Cajon / Drums">🥁</span>}
                  </div>
                </div>

                {isActive && (
                  <span className="px-3 py-1 rounded-full bg-[#1A73E8] text-white font-black text-xs sm:text-sm animate-pulse">
                    {lang === 'th' ? `กำลังร้องห้องนี้ • จังหวะที่ ${currentBeat}` : `Singing Bar • Beat ${currentBeat}`}
                  </span>
                )}
              </div>

              {/* Chords Display */}
              <div className="flex flex-wrap items-baseline gap-4 mb-2">
                {/* Chord 1 */}
                <div className="flex items-baseline gap-2">
                  <span
                    className={`font-black tracking-tight ${
                      isActive
                        ? 'text-3xl sm:text-5xl text-[#1A73E8]'
                        : 'text-2xl sm:text-4xl text-slate-800'
                    }`}
                  >
                    [ {item.chord1} ]
                  </span>
                  {song.capoFret > 0 && (
                    <span className="text-sm sm:text-lg font-bold text-indigo-700 bg-indigo-100/80 px-2 py-0.5 rounded-lg">
                      {lang === 'th' ? `จับรูป ${item.capoChord1}` : `Play ${item.capoChord1}`}
                    </span>
                  )}
                </div>

                {/* Chord 2 if present */}
                {item.chord2 && (
                  <div className="flex items-baseline gap-2 border-l-2 border-slate-300 pl-4">
                    <span
                      className={`font-black tracking-tight ${
                        isActive
                          ? 'text-3xl sm:text-5xl text-[#1A73E8]'
                          : 'text-2xl sm:text-4xl text-slate-800'
                      }`}
                    >
                      [ {item.chord2} ]
                    </span>
                    {song.capoFret > 0 && item.capoChord2 && (
                      <span className="text-sm sm:text-lg font-bold text-indigo-700 bg-indigo-100/80 px-2 py-0.5 rounded-lg">
                        {lang === 'th' ? `จับรูป ${item.capoChord2}` : `Play ${item.capoChord2}`}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Lyrics Display */}
              <p
                className={`leading-relaxed font-bold ${
                  isActive
                    ? 'text-2xl sm:text-4xl text-slate-950 font-black'
                    : 'text-xl sm:text-2xl text-slate-700 font-semibold'
                }`}
              >
                {item.lyrics || (
                  <span className="text-slate-300 italic">
                    {lang === 'th' ? '(ไม่มีเนื้อร้องในห้องนี้)' : '(No lyrics in this bar)'}
                  </span>
                )}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
