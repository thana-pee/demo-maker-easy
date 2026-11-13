'use client';

import React, { useEffect } from 'react';
import { X, SlidersHorizontal } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import {
  SongProject,
  GuitarModel,
  StringGauge,
  Ambience3DMode,
  GuitarStyle,
  LeadGuitarStyle,
  LeadGuitarDrive,
  BassStyle,
  PianoStyle,
  DrumStyle,
  MelodySound,
} from '@/types/song';

interface SoundCustomizerPanelProps {
  song: SongProject;
  isOpen: boolean;
  onUpdateSong: (updater: (prev: SongProject) => SongProject) => void;
  onClose: () => void;
}

export const SoundCustomizerPanel: React.FC<SoundCustomizerPanelProps> = ({
  song,
  isOpen,
  onUpdateSong,
  onClose,
}) => {
  const { lang } = useLanguage();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const setGuitarModel = (model: GuitarModel) => {
    onUpdateSong((prev) => ({ ...prev, guitarModel: model }));
  };

  const setStringGauge = (gauge: StringGauge) => {
    onUpdateSong((prev) => ({ ...prev, stringGauge: gauge }));
  };

  const setAmbience3D = (ambience: Ambience3DMode) => {
    onUpdateSong((prev) => ({ ...prev, ambience3D: ambience }));
  };

  const guitarModels: Array<{ id: GuitarModel; title: string; desc: string }> = [
    {
      id: 'dreadnought-steel',
      title: 'Acoustic Dreadnought (โปร่งไม้สายลวด)',
      desc: 'เบสอิ่มกังวาน บูสต์บอดี้ไม้ 150Hz & ประกายสาย 8kHz',
    },
    {
      id: 'classical-nylon',
      title: 'Classical Nylon (คลาสสิกสายเอ็น)',
      desc: 'โทนอุ่นนุ่มนวล ลดแหลมจัด (LPF 4.5kHz) หัวโน้ตมนฟังสบาย',
    },
    {
      id: 'ovation-roundback',
      title: 'Ovation Roundback (หลังเต่าสายลวด)',
      desc: 'ตัดเบสบวม (HPF 95Hz) เสียงกลางพุ่ง คมชัดทุกเม็ดโน้ต',
    },
    {
      id: 'gibson-les-paul',
      title: 'Gibson Les Paul (กีตาร์ไฟฟ้า Humbucker)',
      desc: 'โทนวอร์ม อิ่มหนา Sustain ยาว โซโล่หวานหรือสับคอร์ดแน่น',
    },
  ];

  const stringGauges: Array<{ id: StringGauge; title: string; desc: string }> = [
    {
      id: 'standard-010',
      title: 'สายเบอร์ปกติ (.010 / .011 Standard)',
      desc: 'หัวโน้ตใส เบาสบาย ให้ความรู้สึกตีคอร์ดพริ้วเบา',
    },
    {
      id: 'heavy-012',
      title: 'สายเบอร์ใหญ่ (.012 Heavy Gauge)',
      desc: 'บูสต์ Low-Mid +3dB หางเสียง Sustain ยาวขึ้น +25% หัวโน้ตแน่น',
    },
  ];

  const ambienceModes: Array<{ id: Ambience3DMode; title: string; desc: string }> = [
    {
      id: 'wood-studio',
      title: 'ห้องอัดไม้ (Warm Wood Studio 3D)',
      desc: 'แยกมิติกีตาร์โอบล้อม เสียงร้องและเบสอยู่ตรงกลางคมชัด',
    },
    {
      id: 'living-room',
      title: 'ห้องนั่งเล่นอบอุ่น (Intimate Living Room)',
      desc: 'มิติใกล้ชิดเหมือนนั่งเล่นกีตาร์อยู่ตรงหน้าโซฟา',
    },
    {
      id: 'unplugged-hall',
      title: 'เวทีคอนเสิร์ต (Unplugged Hall)',
      desc: 'หางเสียง Reverb กว้างและลึก เพิ่มบรรยากาศสะกดอารมณ์',
    },
  ];

  const latencyMs = song.vocalLatencyOffsetMs ?? 0;
  const melodyEnabled = song.mixer.melody?.enabled ?? true;
  const melodyVolume = song.mixer.melody?.volume ?? 85;
  const melodySound = song.mixer.melody?.sound ?? 'flute';
  const vocalEnabled = song.mixer.vocal?.enabled ?? true;
  const vocalVolume = song.mixer.vocal?.volume ?? 95;

  return (
    <div className="fixed inset-0 z-50 flex justify-end items-end md:items-stretch">
      {/* Backdrop Scrim */}
      <div
        className="fixed inset-0 bg-[var(--scrim)] backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Right Sheet (Desktop/iPad) / Bottom Sheet (Mobile) */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={lang === 'th' ? 'Mixer & Tone' : 'Mixer & Tone'}
        className="relative z-10 w-full md:w-[460px] h-[85vh] md:h-[calc(100vh-1.5rem)] md:my-3 md:mr-3 bg-surface-1 text-ink-900 rounded-t-3xl md:rounded-2xl shadow-e3 border border-hairline flex flex-col overflow-hidden"
      >
        {/* Sheet Header */}
        <div className="px-5 py-4 border-b border-hairline flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-accent-50 text-accent-text inline-flex items-center justify-center shrink-0">
              <SlidersHorizontal className="w-4 h-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <h2 className="font-semibold text-base text-ink-900 truncate">
                {lang === 'th' ? 'Mixer & Tone 3D' : '3D Acoustic Tone & Mixer'}
              </h2>
              <p className="text-xs text-ink-400 truncate">
                {lang === 'th'
                  ? 'Web Audio DSP EQ • Soundstage 3D • มิกเซอร์ 7 แทร็ก'
                  : 'Web Audio DSP EQ • 3D Soundstage • 7-Track Mixer'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={lang === 'th' ? 'ปิดหน้าต่างมิกเซอร์' : 'Close mixer'}
            className="w-9 h-9 rounded-xl hover:bg-surface-inset text-ink-700 hover:text-ink-900 inline-flex items-center justify-center transition cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sheet Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* 1. Guitar Model */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-semibold text-ink-400 uppercase tracking-wider">
              {lang === 'th' ? '1. ทรงกีตาร์ (Guitar Model)' : '1. Acoustic Guitar Body'}
            </h3>
            <div className="space-y-2">
              {guitarModels.map((item) => {
                const selected = song.guitarModel === item.id;
                return (
                  <label
                    key={item.id}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border transition cursor-pointer ${
                      selected
                        ? 'bg-accent-50 border-accent-500'
                        : 'bg-surface-2 border-hairline hover:border-accent-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="guitarModel"
                      checked={selected}
                      onChange={() => setGuitarModel(item.id)}
                      className="mt-1 accent-[#5B61EE]"
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-xs text-ink-900">{item.title}</div>
                      <div className="text-xs text-ink-700 mt-0.5">{item.desc}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </section>

          {/* 2. String Gauge */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-semibold text-ink-400 uppercase tracking-wider">
              {lang === 'th' ? '2. เบอร์สายกีตาร์ (String Gauge)' : '2. String Gauge & Sustain'}
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {stringGauges.map((item) => {
                const selected = song.stringGauge === item.id;
                return (
                  <label
                    key={item.id}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border transition cursor-pointer ${
                      selected
                        ? 'bg-accent-50 border-accent-500'
                        : 'bg-surface-2 border-hairline hover:border-accent-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="stringGauge"
                      checked={selected}
                      onChange={() => setStringGauge(item.id)}
                      className="mt-1 accent-[#5B61EE]"
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-xs text-ink-900">{item.title}</div>
                      <div className="text-xs text-ink-700 mt-0.5">{item.desc}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </section>

          {/* 3. 3D Ambience */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-semibold text-ink-400 uppercase tracking-wider">
              {lang === 'th' ? '3. มิติเสียงห้อง 3D (Room Ambience)' : '3. 3D Stereo Soundstage'}
            </h3>
            <div className="space-y-2">
              {ambienceModes.map((item) => {
                const selected = song.ambience3D === item.id;
                return (
                  <label
                    key={item.id}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border transition cursor-pointer ${
                      selected
                        ? 'bg-accent-50 border-accent-500'
                        : 'bg-surface-2 border-hairline hover:border-accent-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="ambience3D"
                      checked={selected}
                      onChange={() => setAmbience3D(item.id)}
                      className="mt-1 accent-[#5B61EE]"
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-xs text-ink-900">{item.title}</div>
                      <div className="text-xs text-ink-700 mt-0.5">{item.desc}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </section>

          {/* 4. Vocal Latency Offset */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-ink-400 uppercase tracking-wider">
                {lang === 'th' ? '4. ชดเชยดีเลย์เสียงร้อง (Latency)' : '4. Vocal Latency Offset'}
              </h3>
              <span className="font-mono-tabular text-xs font-semibold text-accent-text">
                {latencyMs > 0 ? `+${latencyMs}` : latencyMs} ms
              </span>
            </div>
            <div className="bg-surface-2 border border-hairline rounded-xl p-3 space-y-2">
              <p className="text-xs text-ink-700">
                {lang === 'th'
                  ? 'ขยับไทม์มิ่งเสียงร้องสดให้ตรงจังหวะบีทพอดี (แก้ดีเลย์จากหูฟังบลูทูธ/ไมค์)'
                  : 'Compensate Bluetooth earphone and mic latency (-150ms to +150ms)'}
              </p>
              <input
                type="range"
                min="-150"
                max="150"
                step="5"
                value={latencyMs}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  onUpdateSong((prev) => ({ ...prev, vocalLatencyOffsetMs: val }));
                }}
                className="w-full accent-[#5B61EE] cursor-pointer"
              />
              <div className="flex items-center justify-between text-xs text-ink-400 font-mono-tabular">
                <span>-150ms</span>
                <span>0ms</span>
                <span>+150ms</span>
              </div>
            </div>
          </section>

          {/* 5. 7-Track Master Mixer */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-ink-400 uppercase tracking-wider">
              {lang === 'th' ? '5. มิกเซอร์ 7 แทร็ก (7-Track Master Mixer)' : '5. 7-Track Master Mixer'}
            </h3>

            {/* Track 1: Rhythm Guitar */}
            <div className="p-3.5 rounded-xl border border-hairline bg-surface-2 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-ink-900">
                  {lang === 'th' ? '1. กีตาร์ริทึ่ม (คอร์ด)' : '1. Rhythm Guitar'}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSong((prev) => ({
                      ...prev,
                      mixer: {
                        ...prev.mixer,
                        guitarRhythm: {
                          ...prev.mixer.guitarRhythm,
                          enabled: !prev.mixer.guitarRhythm.enabled,
                        },
                      },
                    }))
                  }
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    song.mixer.guitarRhythm.enabled
                      ? 'bg-accent-500 text-white'
                      : 'bg-surface-inset text-ink-400'
                  }`}
                >
                  {song.mixer.guitarRhythm.enabled
                    ? lang === 'th'
                      ? 'เปิด'
                      : 'ON'
                    : lang === 'th'
                    ? 'ปิด'
                    : 'OFF'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={song.mixer.guitarRhythm.model}
                  onChange={(e) =>
                    onUpdateSong((prev) => ({
                      ...prev,
                      mixer: {
                        ...prev.mixer,
                        guitarRhythm: {
                          ...prev.mixer.guitarRhythm,
                          model: e.target.value as GuitarModel,
                        },
                      },
                    }))
                  }
                  className="w-full text-xs bg-surface-1 border border-hairline rounded-lg px-2 py-1.5 text-ink-900 font-medium"
                >
                  <option value="dreadnought-steel">
                    {lang === 'th' ? 'โปร่งไม้ Dreadnought' : 'Dreadnought Steel'}
                  </option>
                  <option value="classical-nylon">
                    {lang === 'th' ? 'คลาสสิกสายเอ็น Nylon' : 'Classical Nylon'}
                  </option>
                  <option value="ovation-roundback">
                    {lang === 'th' ? 'หลังเต่า Ovation' : 'Ovation Roundback'}
                  </option>
                  <option value="gibson-les-paul">Gibson Les Paul</option>
                </select>
                <select
                  value={song.mixer.guitarRhythm.style}
                  onChange={(e) =>
                    onUpdateSong((prev) => ({
                      ...prev,
                      mixer: {
                        ...prev.mixer,
                        guitarRhythm: {
                          ...prev.mixer.guitarRhythm,
                          style: e.target.value as GuitarStyle,
                        },
                      },
                    }))
                  }
                  className="w-full text-xs bg-surface-1 border border-hairline rounded-lg px-2 py-1.5 text-ink-900 font-medium"
                >
                  <option value="campfire-strum">
                    {lang === 'th' ? 'ตีคอร์ดแคมป์ไฟ' : 'Campfire Strum'}
                  </option>
                  <option value="soft-strum">
                    {lang === 'th' ? 'ตีคอร์ดนุ่มนวล' : 'Soft Strum'}
                  </option>
                  <option value="fingerpicking">
                    {lang === 'th' ? 'เกาสายอะคูสติก' : 'Fingerpicking'}
                  </option>
                </select>
              </div>
              <div className="flex items-center gap-2 text-xs text-ink-700">
                <span className="w-7">{lang === 'th' ? 'ดัง' : 'Vol'}</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={song.mixer.guitarRhythm.volume}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    onUpdateSong((prev) => ({
                      ...prev,
                      mixer: {
                        ...prev.mixer,
                        guitarRhythm: { ...prev.mixer.guitarRhythm, volume: val },
                      },
                    }));
                  }}
                  className="w-full accent-[#5B61EE] cursor-pointer"
                />
                <span className="font-mono-tabular w-9 text-right">
                  {song.mixer.guitarRhythm.volume}%
                </span>
              </div>
            </div>

            {/* Track 2: Lead Guitar */}
            <div className="p-3.5 rounded-xl border border-hairline bg-surface-2 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-ink-900">
                  {lang === 'th' ? '2. กีตาร์ลีด / โซโล่' : '2. Lead / Solo Guitar'}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSong((prev) => ({
                      ...prev,
                      mixer: {
                        ...prev.mixer,
                        guitarLead: {
                          ...prev.mixer.guitarLead,
                          enabled: !prev.mixer.guitarLead.enabled,
                        },
                      },
                    }))
                  }
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    song.mixer.guitarLead.enabled
                      ? 'bg-accent-500 text-white'
                      : 'bg-surface-inset text-ink-400'
                  }`}
                >
                  {song.mixer.guitarLead.enabled
                    ? lang === 'th'
                      ? 'เปิด'
                      : 'ON'
                    : lang === 'th'
                    ? 'ปิด'
                    : 'OFF'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={song.mixer.guitarLead.model}
                  onChange={(e) =>
                    onUpdateSong((prev) => ({
                      ...prev,
                      mixer: {
                        ...prev.mixer,
                        guitarLead: {
                          ...prev.mixer.guitarLead,
                          model: e.target.value as GuitarModel,
                        },
                      },
                    }))
                  }
                  className="w-full text-xs bg-surface-1 border border-hairline rounded-lg px-2 py-1.5 text-ink-900 font-medium"
                >
                  <option value="gibson-les-paul">Gibson Les Paul</option>
                  <option value="dreadnought-steel">
                    {lang === 'th' ? 'โปร่งไม้ Dreadnought' : 'Dreadnought Steel'}
                  </option>
                  <option value="classical-nylon">
                    {lang === 'th' ? 'คลาสสิกสายเอ็น Nylon' : 'Classical Nylon'}
                  </option>
                  <option value="ovation-roundback">
                    {lang === 'th' ? 'หลังเต่า Ovation' : 'Ovation Roundback'}
                  </option>
                </select>
                <select
                  value={song.mixer.guitarLead.style}
                  onChange={(e) =>
                    onUpdateSong((prev) => ({
                      ...prev,
                      mixer: {
                        ...prev.mixer,
                        guitarLead: {
                          ...prev.mixer.guitarLead,
                          style: e.target.value as LeadGuitarStyle,
                        },
                      },
                    }))
                  }
                  className="w-full text-xs bg-surface-1 border border-hairline rounded-lg px-2 py-1.5 text-ink-900 font-medium"
                >
                  <option value="melodic-solo">
                    {lang === 'th' ? 'โซโล่ทำนอง (Melodic)' : 'Melodic Solo'}
                  </option>
                  <option value="riff-fills">
                    {lang === 'th' ? 'หยอดลูกส่ง (Riff Fills)' : 'Riff Fills'}
                  </option>
                  <option value="soft-arpeggio">
                    {lang === 'th' ? 'เกาโน้ตสูงคลอ (Arpeggio)' : 'Soft Arpeggio'}
                  </option>
                </select>
              </div>
              <select
                value={song.mixer.guitarLead.drive || 'overdrive'}
                onChange={(e) =>
                  onUpdateSong((prev) => ({
                    ...prev,
                    mixer: {
                      ...prev.mixer,
                      guitarLead: {
                        ...prev.mixer.guitarLead,
                        drive: e.target.value as LeadGuitarDrive,
                      },
                    },
                  }))
                }
                aria-label={lang === 'th' ? 'เสียงแตก (Drive Mode)' : 'Drive Mode'}
                className="w-full text-xs bg-surface-1 border border-hairline rounded-lg px-2.5 py-1.5 text-ink-900 font-medium"
              >
                <option value="clean">{lang === 'th' ? 'คลีนใส (Clean)' : 'Clean'}</option>
                <option value="crunch">
                  {lang === 'th' ? 'เสียงแตกอ่อน (Crunch)' : 'Crunch'}
                </option>
                <option value="overdrive">
                  {lang === 'th' ? 'แตกหวาน (Tube Overdrive)' : 'Tube Overdrive'}
                </option>
                <option value="distortion">
                  {lang === 'th' ? 'แตกดุดัน (Heavy Distortion)' : 'Heavy Distortion'}
                </option>
              </select>
              <div className="flex items-center gap-2 text-xs text-ink-700">
                <span className="w-7">{lang === 'th' ? 'ดัง' : 'Vol'}</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={song.mixer.guitarLead.volume}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    onUpdateSong((prev) => ({
                      ...prev,
                      mixer: {
                        ...prev.mixer,
                        guitarLead: { ...prev.mixer.guitarLead, volume: val },
                      },
                    }));
                  }}
                  className="w-full accent-[#5B61EE] cursor-pointer"
                />
                <span className="font-mono-tabular w-9 text-right">
                  {song.mixer.guitarLead.volume}%
                </span>
              </div>
            </div>

            {/* Track 3: Acoustic Bass */}
            <div className="p-3.5 rounded-xl border border-hairline bg-surface-2 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-ink-900">
                  {lang === 'th' ? '3. เบสอะคูสติก' : '3. Acoustic Bass'}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSong((prev) => ({
                      ...prev,
                      mixer: {
                        ...prev.mixer,
                        bass: { ...prev.mixer.bass, enabled: !prev.mixer.bass.enabled },
                      },
                    }))
                  }
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    song.mixer.bass.enabled
                      ? 'bg-accent-500 text-white'
                      : 'bg-surface-inset text-ink-400'
                  }`}
                >
                  {song.mixer.bass.enabled
                    ? lang === 'th'
                      ? 'เปิด'
                      : 'ON'
                    : lang === 'th'
                    ? 'ปิด'
                    : 'OFF'}
                </button>
              </div>
              <select
                value={song.mixer.bass.style}
                onChange={(e) =>
                  onUpdateSong((prev) => ({
                    ...prev,
                    mixer: {
                      ...prev.mixer,
                      bass: { ...prev.mixer.bass, style: e.target.value as BassStyle },
                    },
                  }))
                }
                className="w-full text-xs bg-surface-1 border border-hairline rounded-lg px-2.5 py-1.5 text-ink-900 font-medium"
              >
                <option value="root-fifth">
                  {lang === 'th' ? 'เดินเบส Root-Fifth นุ่มๆ' : 'Root-Fifth Walk'}
                </option>
                <option value="warm-sustain">
                  {lang === 'th' ? 'เดินเบสค้างโน้ตต่ำ (Warm Sustain)' : 'Warm Sustain'}
                </option>
              </select>
              <div className="flex items-center gap-2 text-xs text-ink-700">
                <span className="w-7">{lang === 'th' ? 'ดัง' : 'Vol'}</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={song.mixer.bass.volume}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    onUpdateSong((prev) => ({
                      ...prev,
                      mixer: { ...prev.mixer, bass: { ...prev.mixer.bass, volume: val } },
                    }));
                  }}
                  className="w-full accent-[#5B61EE] cursor-pointer"
                />
                <span className="font-mono-tabular w-9 text-right">{song.mixer.bass.volume}%</span>
              </div>
            </div>

            {/* Track 4: Piano */}
            <div className="p-3.5 rounded-xl border border-hairline bg-surface-2 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-ink-900">
                  {lang === 'th' ? '4. เปียโนคลอ' : '4. Piano Chords'}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSong((prev) => ({
                      ...prev,
                      mixer: {
                        ...prev.mixer,
                        piano: { ...prev.mixer.piano, enabled: !prev.mixer.piano.enabled },
                      },
                    }))
                  }
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    song.mixer.piano.enabled
                      ? 'bg-accent-500 text-white'
                      : 'bg-surface-inset text-ink-400'
                  }`}
                >
                  {song.mixer.piano.enabled
                    ? lang === 'th'
                      ? 'เปิด'
                      : 'ON'
                    : lang === 'th'
                    ? 'ปิด'
                    : 'OFF'}
                </button>
              </div>
              <select
                value={song.mixer.piano.style}
                onChange={(e) =>
                  onUpdateSong((prev) => ({
                    ...prev,
                    mixer: {
                      ...prev.mixer,
                      piano: { ...prev.mixer.piano, style: e.target.value as PianoStyle },
                    },
                  }))
                }
                className="w-full text-xs bg-surface-1 border border-hairline rounded-lg px-2.5 py-1.5 text-ink-900 font-medium"
              >
                <option value="warm-pad">
                  {lang === 'th' ? 'กดคอร์ดปูพื้นอุ่นๆ (Warm Pad)' : 'Warm Pad Chords'}
                </option>
                <option value="gentle-arpeggio">
                  {lang === 'th' ? 'พรมนิ้วเบาๆ (Gentle Arpeggio)' : 'Gentle Arpeggio'}
                </option>
              </select>
              <div className="flex items-center gap-2 text-xs text-ink-700">
                <span className="w-7">{lang === 'th' ? 'ดัง' : 'Vol'}</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={song.mixer.piano.volume}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    onUpdateSong((prev) => ({
                      ...prev,
                      mixer: { ...prev.mixer, piano: { ...prev.mixer.piano, volume: val } },
                    }));
                  }}
                  className="w-full accent-[#5B61EE] cursor-pointer"
                />
                <span className="font-mono-tabular w-9 text-right">{song.mixer.piano.volume}%</span>
              </div>
            </div>

            {/* Track 5: Drums */}
            <div className="p-3.5 rounded-xl border border-hairline bg-surface-2 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-ink-900">
                  {lang === 'th' ? '5. เพอร์คัชชัน / กลอง' : '5. Percussion / Drums'}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSong((prev) => ({
                      ...prev,
                      mixer: {
                        ...prev.mixer,
                        drums: { ...prev.mixer.drums, enabled: !prev.mixer.drums.enabled },
                      },
                    }))
                  }
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    song.mixer.drums.enabled && song.mixer.drums.style !== 'off'
                      ? 'bg-accent-500 text-white'
                      : 'bg-surface-inset text-ink-400'
                  }`}
                >
                  {song.mixer.drums.enabled && song.mixer.drums.style !== 'off'
                    ? lang === 'th'
                      ? 'เปิด'
                      : 'ON'
                    : lang === 'th'
                    ? 'ปิด'
                    : 'OFF'}
                </button>
              </div>
              <select
                value={song.mixer.drums.style}
                onChange={(e) =>
                  onUpdateSong((prev) => ({
                    ...prev,
                    mixer: {
                      ...prev.mixer,
                      drums: {
                        ...prev.mixer.drums,
                        style: e.target.value as DrumStyle,
                        enabled: e.target.value !== 'off',
                      },
                    },
                  }))
                }
                className="w-full text-xs bg-surface-1 border border-hairline rounded-lg px-2.5 py-1.5 text-ink-900 font-medium"
              >
                <option value="shaker-cajon">
                  {lang === 'th' ? 'เขย่า Shaker & เคาะ Cajon' : 'Shaker & Cajon'}
                </option>
                <option value="off">
                  {lang === 'th' ? 'ปิดกลอง (Off — ดนตรีล้วน)' : 'Off (Acoustic Only)'}
                </option>
                <option value="simple-kit">
                  {lang === 'th' ? 'กลองชุดอะคูสติกเรียบๆ (Simple Kit)' : 'Simple Drum Kit'}
                </option>
              </select>
              <div className="flex items-center gap-2 text-xs text-ink-700">
                <span className="w-7">{lang === 'th' ? 'ดัง' : 'Vol'}</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={song.mixer.drums.volume}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    onUpdateSong((prev) => ({
                      ...prev,
                      mixer: { ...prev.mixer, drums: { ...prev.mixer.drums, volume: val } },
                    }));
                  }}
                  className="w-full accent-[#5B61EE] cursor-pointer"
                />
                <span className="font-mono-tabular w-9 text-right">{song.mixer.drums.volume}%</span>
              </div>
            </div>

            {/* Track 6: Vocal Melody Guide */}
            <div className="p-3.5 rounded-xl border border-hairline bg-surface-2 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-ink-900">
                  {lang === 'th' ? '6. ทำนองร้องไกด์' : '6. Vocal Melody Guide'}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSong((prev) => ({
                      ...prev,
                      mixer: {
                        ...prev.mixer,
                        melody: {
                          enabled: !(prev.mixer.melody?.enabled ?? true),
                          volume: prev.mixer.melody?.volume ?? 85,
                          sound: prev.mixer.melody?.sound ?? 'flute',
                        },
                      },
                    }))
                  }
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    melodyEnabled ? 'bg-accent-500 text-white' : 'bg-surface-inset text-ink-400'
                  }`}
                >
                  {melodyEnabled ? (lang === 'th' ? 'เปิด' : 'ON') : lang === 'th' ? 'ปิด' : 'OFF'}
                </button>
              </div>
              <select
                value={melodySound}
                onChange={(e) =>
                  onUpdateSong((prev) => ({
                    ...prev,
                    mixer: {
                      ...prev.mixer,
                      melody: {
                        enabled: prev.mixer.melody?.enabled ?? true,
                        volume: prev.mixer.melody?.volume ?? 85,
                        sound: e.target.value as MelodySound,
                      },
                    },
                  }))
                }
                className="w-full text-xs bg-surface-1 border border-hairline rounded-lg px-2.5 py-1.5 text-ink-900 font-medium"
              >
                <option value="flute">
                  {lang === 'th' ? 'ขลุ่ย/ฮัมร้อง (Flute)' : 'Flute Vibrato'}
                </option>
                <option value="piano">
                  {lang === 'th' ? 'เปียโนทำนอง (Lead Piano)' : 'Lead Piano'}
                </option>
                <option value="bell">
                  {lang === 'th' ? 'ระฆังแก้ว (Warm Bell)' : 'Warm Glass Bell'}
                </option>
              </select>
              <div className="flex items-center gap-2 text-xs text-ink-700">
                <span className="w-7">{lang === 'th' ? 'ดัง' : 'Vol'}</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={melodyVolume}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    onUpdateSong((prev) => ({
                      ...prev,
                      mixer: {
                        ...prev.mixer,
                        melody: {
                          enabled: prev.mixer.melody?.enabled ?? true,
                          volume: val,
                          sound: prev.mixer.melody?.sound ?? 'flute',
                        },
                      },
                    }));
                  }}
                  className="w-full accent-[#5B61EE] cursor-pointer"
                />
                <span className="font-mono-tabular w-9 text-right">{melodyVolume}%</span>
              </div>
            </div>

            {/* Track 7: Recorded Vocals */}
            <div className="p-3.5 rounded-xl border border-hairline bg-surface-2 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-ink-900 inline-flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rec-500" />
                  <span>{lang === 'th' ? '7. เสียงร้องสด (ไมค์)' : '7. Recorded Vocals (Mic)'}</span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSong((prev) => ({
                      ...prev,
                      mixer: {
                        ...prev.mixer,
                        vocal: {
                          enabled: !(prev.mixer.vocal?.enabled ?? true),
                          volume: prev.mixer.vocal?.volume ?? 95,
                        },
                      },
                    }))
                  }
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    vocalEnabled ? 'bg-accent-500 text-white' : 'bg-surface-inset text-ink-400'
                  }`}
                >
                  {vocalEnabled ? (lang === 'th' ? 'เปิด' : 'ON') : lang === 'th' ? 'ปิด' : 'OFF'}
                </button>
              </div>
              <div className="text-xs text-ink-700 bg-surface-1 border border-hairline rounded-lg px-2.5 py-1.5">
                {lang === 'th' ? 'คลิปเสียงร้องจากห้องเพลง' : 'Bar Vocal Scratchpad'}
              </div>
              <div className="flex items-center gap-2 text-xs text-ink-700">
                <span className="w-7">{lang === 'th' ? 'ดัง' : 'Vol'}</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={vocalVolume}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    onUpdateSong((prev) => ({
                      ...prev,
                      mixer: {
                        ...prev.mixer,
                        vocal: {
                          enabled: prev.mixer.vocal?.enabled ?? true,
                          volume: val,
                        },
                      },
                    }));
                  }}
                  className="w-full accent-[#5B61EE] cursor-pointer"
                />
                <span className="font-mono-tabular w-9 text-right">{vocalVolume}%</span>
              </div>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
};
