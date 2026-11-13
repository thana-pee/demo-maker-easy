'use client';

import React from 'react';
import { PROGRESSION_PRESETS, ProgressionPreset, transposeChord } from '@/lib/chordUtils';

interface ProgressionPresetsModalProps {
  isOpen: boolean;
  sectionName: string;
  transposeSemitones: number;
  onApplyPreset: (preset: ProgressionPreset) => void;
  onClose: () => void;
}

export const ProgressionPresetsModal: React.FC<ProgressionPresetsModalProps> = ({
  isOpen,
  sectionName,
  transposeSemitones,
  onApplyPreset,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-surface-1 rounded-3xl border border-hairline shadow-e3 max-w-xl w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-hairline pb-3">
          <div>
            <h3 className="font-bold text-lg text-ink-900">✨ สูตรทางคอร์ดสำเร็จรูป (Progression Presets)</h3>
            <p className="text-xs text-ink-400">เลือกชุดคอร์ดยอดฮิตเพื่อใส่ลงในท่อน &quot;{sectionName}&quot; ได้ในคลิกเดียว</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface-2 hover:bg-surface-inset text-ink-700 flex items-center justify-center font-bold transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto space-y-3 pr-1 flex-1">
          {PROGRESSION_PRESETS.map((preset) => {
            const displayChords = preset.chords.map((c) => transposeChord(c, transposeSemitones));

            return (
              <div
                key={preset.id}
                className="p-4 rounded-2xl border border-hairline hover:border-accent-500 bg-surface-2/60 hover:bg-accent-50/40 transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 group"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-ink-900">{preset.name}</span>
                    <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-surface-inset text-ink-700">
                      {preset.category}
                    </span>
                  </div>
                  <p className="text-xs text-ink-400">{preset.description}</p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {displayChords.map((chord, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-lg bg-surface-1 border border-hairline font-bold font-mono-tabular text-xs text-accent-text shadow-2xs"
                      >
                        {chord}
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => onApplyPreset(preset)}
                  className="px-4 py-2 rounded-xl bg-accent-500 hover:bg-accent-hover text-white font-semibold text-xs shadow-e1 transition whitespace-nowrap self-end sm:self-center cursor-pointer"
                >
                  ใช้ชุดคอร์ดนี้
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
