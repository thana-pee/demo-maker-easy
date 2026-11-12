'use client';

import React, { useState } from 'react';
import { getDiatonicChords } from '@/lib/chordUtils';

interface ChordPickerModalProps {
  isOpen: boolean;
  baseKey: string;
  currentChord: string;
  onSelectChord: (chord: string) => void;
  onClose: () => void;
}

export const ChordPickerModal: React.FC<ChordPickerModalProps> = ({
  isOpen,
  baseKey,
  currentChord,
  onSelectChord,
  onClose,
}) => {
  const [customInput, setCustomInput] = useState('');

  if (!isOpen) return null;

  const diatonicChords = getDiatonicChords(baseKey);

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customInput.trim()) {
      onSelectChord(customInput.trim());
      setCustomInput('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-bold text-lg text-slate-900">เลือกคอร์ดในคีย์ {baseKey}</h3>
            <p className="text-xs text-slate-500">คอร์ดมาตรฐานตามสเกล (Diatonic) เล่นแล้วไม่เพี้ยนแน่นอน</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold transition"
          >
            ✕
          </button>
        </div>

        {/* Diatonic Chord Grid */}
        <div className="grid grid-cols-4 gap-2.5">
          {diatonicChords.map((chord) => {
            const isSelected = chord === currentChord;
            return (
              <button
                key={chord}
                onClick={() => onSelectChord(chord)}
                className={`py-3 px-2 rounded-2xl font-black text-base transition flex flex-col items-center justify-center gap-0.5 border ${
                  isSelected
                    ? 'bg-[#1A73E8] text-white border-[#1A73E8] shadow-md shadow-blue-500/25 scale-102'
                    : 'bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-slate-800 border-slate-200'
                }`}
              >
                <span>{chord}</span>
              </button>
            );
          })}
        </div>

        {/* Custom Chord Input */}
        <form onSubmit={handleCustomSubmit} className="pt-2 border-t border-slate-100 space-y-2">
          <label className="text-xs font-semibold text-slate-600">หรือพิมพ์คอร์ดอื่นๆ ด้วยตนเอง:</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="เช่น Cadd9, G7, Bb, F#m, Dm7b5..."
              className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-[#1A73E8] focus:ring-2 focus:ring-blue-100"
            />
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-[#1A73E8] hover:bg-blue-700 text-white font-bold text-sm shadow-sm transition"
            >
              ตกลง
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
