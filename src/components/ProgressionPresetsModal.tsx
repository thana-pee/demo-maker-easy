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
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-xl w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-bold text-lg text-slate-900">✨ สูตรทางคอร์ดสำเร็จรูป (Progression Presets)</h3>
            <p className="text-xs text-slate-500">เลือกชุดคอร์ดยอดฮิตเพื่อใส่ลงในท่อน &quot;{sectionName}&quot; ได้ในคลิกเดียว</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold transition"
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
                className="p-4 rounded-2xl border border-slate-200 hover:border-blue-400 bg-slate-50/60 hover:bg-blue-50/30 transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 group"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900">{preset.name}</span>
                    <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                      {preset.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{preset.description}</p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {displayChords.map((chord, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 font-black text-xs text-[#1A73E8] shadow-2xs"
                      >
                        {chord}
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => onApplyPreset(preset)}
                  className="px-4 py-2 rounded-xl bg-[#1A73E8] hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition whitespace-nowrap self-end sm:self-center"
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
