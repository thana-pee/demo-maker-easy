'use client';

import React, { useEffect, useRef, useState } from 'react';
import { X, SlidersHorizontal, Play, Pause, Square } from 'lucide-react';
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
  VocalFxPreset,
} from '@/types/song';
import { VOCAL_FX_PRESETS } from '@/lib/vocalBoothUtils';
import { applyGenreBandArrangement } from '@/lib/songArchitect';
import { trackUsageEvent } from '@/lib/analytics';

type MixerTrackKey =
  | 'guitarRhythm'
  | 'guitarLead'
  | 'bass'
  | 'piano'
  | 'drums'
  | 'melody'
  | 'vocal';

const MIXER_TRACK_KEYS: MixerTrackKey[] = [
  'guitarRhythm',
  'guitarLead',
  'bass',
  'piano',
  'drums',
  'melody',
  'vocal',
];

interface SoundCustomizerPanelProps {
  song: SongProject;
  isOpen: boolean;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  onStop?: () => void;
  onUpdateSong: (updater: (prev: SongProject) => SongProject) => void;
  onClose: () => void;
}

export const SoundCustomizerPanel: React.FC<SoundCustomizerPanelProps> = ({
  song,
  isOpen,
  isPlaying = false,
  onTogglePlay,
  onStop,
  onUpdateSong,
  onClose,
}) => {
  const { lang } = useLanguage();
  const [soloTrackId, setSoloTrackId] = useState<MixerTrackKey | null>(null);
  const preSoloEnabledRef = useRef<Record<MixerTrackKey, boolean> | null>(null);

  const handleToggleSolo = (targetTrack: MixerTrackKey) => {
    if (soloTrackId === targetTrack) {
      const snapshot = preSoloEnabledRef.current;
      preSoloEnabledRef.current = null;
      setSoloTrackId(null);
      onUpdateSong((prev) => ({
        ...prev,
        mixer: {
          ...prev.mixer,
          guitarRhythm: { ...prev.mixer.guitarRhythm, enabled: snapshot?.guitarRhythm ?? true },
          guitarLead: { ...prev.mixer.guitarLead, enabled: snapshot?.guitarLead ?? true },
          bass: { ...prev.mixer.bass, enabled: snapshot?.bass ?? true },
          piano: { ...prev.mixer.piano, enabled: snapshot?.piano ?? true },
          drums: { ...prev.mixer.drums, enabled: snapshot?.drums ?? true },
          melody: {
            enabled: snapshot?.melody ?? true,
            volume: prev.mixer.melody?.volume ?? 56,
            sound: prev.mixer.melody?.sound ?? 'flute',
          },
          vocal: {
            ...prev.mixer.vocal,
            enabled: snapshot?.vocal ?? true,
            volume: prev.mixer.vocal?.volume ?? 95,
          },
        },
      }));
      return;
    }

    if (!soloTrackId) {
      preSoloEnabledRef.current = {
        guitarRhythm: song.mixer.guitarRhythm.enabled,
        guitarLead: song.mixer.guitarLead.enabled,
        bass: song.mixer.bass.enabled,
        piano: song.mixer.piano.enabled,
        drums: song.mixer.drums.enabled,
        melody: song.mixer.melody?.enabled ?? true,
        vocal: song.mixer.vocal?.enabled ?? true,
      };
    }

    setSoloTrackId(targetTrack);
    onUpdateSong((prev) => ({
      ...prev,
      mixer: {
        ...prev.mixer,
        guitarRhythm: { ...prev.mixer.guitarRhythm, enabled: targetTrack === 'guitarRhythm' },
        guitarLead: { ...prev.mixer.guitarLead, enabled: targetTrack === 'guitarLead' },
        bass: { ...prev.mixer.bass, enabled: targetTrack === 'bass' },
        piano: { ...prev.mixer.piano, enabled: targetTrack === 'piano' },
        drums: { ...prev.mixer.drums, enabled: targetTrack === 'drums' },
        melody: {
          enabled: targetTrack === 'melody',
          volume: prev.mixer.melody?.volume ?? 56,
          sound: prev.mixer.melody?.sound ?? 'flute',
        },
        vocal: {
          ...prev.mixer.vocal,
          enabled: targetTrack === 'vocal',
          volume: prev.mixer.vocal?.volume ?? 95,
        },
      },
    }));
  };

  const renderSoloButton = (trackKey: MixerTrackKey) => {
    const isSolo = soloTrackId === trackKey;
    return (
      <button
        type="button"
        onClick={() => handleToggleSolo(trackKey)}
        aria-pressed={isSolo}
        title={
          isSolo
            ? lang === 'th'
              ? 'ยกเลิก Solo (คืนค่าทุกแทร็ก)'
              : 'Un-solo track'
            : lang === 'th'
              ? 'Solo (ฟังเฉพาะแทร็กนี้)'
              : 'Solo track'
        }
        className={`px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
          isSolo
            ? 'bg-amber-500 text-white shadow-xs'
            : 'bg-surface-inset text-ink-700 hover:bg-amber-100 hover:text-amber-800'
        }`}
      >
        S
      </button>
    );
  };

  void MIXER_TRACK_KEYS;

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
  const melodyVolume = song.mixer.melody?.volume ?? 56;
  const melodySound = song.mixer.melody?.sound ?? 'flute';
  const vocalEnabled = song.mixer.vocal?.enabled ?? true;
  const vocalVolume = song.mixer.vocal?.volume ?? 95;
  const vocalFxPreset: VocalFxPreset = song.mixer.vocal?.fxPreset ?? 'studio-warm';
  const vocalAutoDucking = song.mixer.vocal?.autoDucking ?? true;
  const activeTakesCount = (song.vocalTakes || []).length;

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

          <div className="flex items-center gap-1.5 shrink-0">
            {onTogglePlay && (
              <button
                type="button"
                onClick={onTogglePlay}
                aria-label={isPlaying ? (lang === 'th' ? 'หยุดชั่วคราว' : 'Pause') : (lang === 'th' ? 'เล่นฟัง' : 'Play')}
                className={`h-8 px-2.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1 transition cursor-pointer ${
                  isPlaying
                    ? 'bg-accent-500 text-white'
                    : 'bg-accent-50 text-accent-text border border-accent-200 hover:bg-accent-200/70'
                }`}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                <span>{isPlaying ? (lang === 'th' ? 'พัก' : 'Pause') : (lang === 'th' ? 'เล่น' : 'Play')}</span>
              </button>
            )}
            {onStop && (
              <button
                type="button"
                onClick={onStop}
                aria-label={lang === 'th' ? 'หยุด' : 'Stop'}
                title={lang === 'th' ? 'หยุดและกลับต้นเพลง' : 'Stop'}
                className="w-8 h-8 rounded-xl bg-surface-2 hover:bg-surface-inset text-ink-700 inline-flex items-center justify-center transition cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={lang === 'th' ? 'ปิดหน้าต่างมิกเซอร์' : 'Close mixer'}
              className="w-9 h-9 rounded-xl hover:bg-surface-inset text-ink-700 hover:text-ink-900 inline-flex items-center justify-center transition cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {soloTrackId && (
          <div className="px-5 py-2 bg-amber-500/15 border-b border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs flex items-center justify-between gap-2">
            <span>
              {lang === 'th'
                ? `กำลัง Solo แทร็ก: ${soloTrackId}`
                : `Solo active: ${soloTrackId}`}
            </span>
            <button
              type="button"
              onClick={() => handleToggleSolo(soloTrackId)}
              className="px-2 py-0.5 rounded-md bg-amber-500 text-white font-semibold cursor-pointer"
            >
              {lang === 'th' ? 'ยกเลิก Solo' : 'Un-solo'}
            </button>
          </div>
        )}

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
                  : 'Compensate Bluetooth earphone and mic latency (-150ms to +250ms)'}
              </p>
              <input
                type="range"
                min="-150"
                max="250"
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
                <span>+250ms</span>
              </div>
            </div>
          </section>

          {/* 5. 7-Track Master Mixer */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-ink-400 uppercase tracking-wider">
                {lang === 'th' ? '5. มิกเซอร์ 7 แทร็ก (7-Track Master Mixer)' : '5. 7-Track Master Mixer'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  trackUsageEvent({
                    eventName: 'arranger_auto_arrange',
                    category: 'feature',
                    songwriterStyle: song.songwriterStyle,
                    thaiGenre: song.thaiGenre,
                    lyricDialect: song.lyricDialect,
                    featureVariant: 'sound_panel',
                  });
                  onUpdateSong((prev) => applyGenreBandArrangement(prev));
                }}
                title={
                  lang === 'th'
                    ? 'จัดสไตล์เครื่องดนตรีทั้ง 5 ชิ้น แอมป์ และวอลุ่มตามแนวเพลงให้อัตโนมัติ (0 เครดิต)'
                    : 'Auto-arrange all 5 instruments, amp drive, and mix volumes by song genre (0 credits)'
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent-500/10 hover:bg-accent-500/20 text-accent-text border border-accent-500/30 text-[11px] font-semibold transition cursor-pointer"
              >
                <span>
                  {lang === 'th'
                    ? '🎚️ จัดวงอัตโนมัติตามสไตล์เพลง (0 เครดิต)'
                    : '🎚️ Auto-Arrange Band by Genre (0 Credits)'}
                </span>
              </button>
            </div>

            {/* Track 1: Rhythm Guitar */}
            <div className="p-3.5 rounded-xl border border-hairline bg-surface-2 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-ink-900">
                  {lang === 'th' ? '1. กีตาร์ริทึ่ม (คอร์ด)' : '1. Rhythm Guitar'}
                </span>
                <div className="flex items-center gap-1.5">
                  {renderSoloButton('guitarRhythm')}
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
                  <option value="lukthung-bounce">
                    {lang === 'th' ? 'กระแทกขัดจังหวะลูกทุ่ง (Luk Thung Chop)' : 'Luk Thung Bounce Chop'}
                  </option>
                  <option value="rock-power">
                    {lang === 'th' ? 'ตีร็อกสับสายหนักแน่น (Rock Chug)' : 'Rock Power Chug'}
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
                <div className="flex items-center gap-1.5">
                  {renderSoloButton('guitarLead')}
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
                <div className="flex items-center gap-1.5">
                  {renderSoloButton('bass')}
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
                <option value="lukthung-groove">
                  {lang === 'th' ? 'เดินเบสเด้งลูกทุ่ง (Luk Thung Groove)' : 'Luk Thung Bounce Bass'}
                </option>
                <option value="rnb-syncopated">
                  {lang === 'th' ? 'เบส R&B ขัดจังหวะ (R&B Pocket)' : 'R&B Syncopated Pocket'}
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
                <div className="flex items-center gap-1.5">
                  {renderSoloButton('piano')}
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
                <option value="rnb-neo-chord">
                  {lang === 'th' ? 'คอร์ดแจ๊ส/R&B นุ่มลึก (Neo-Soul 9th)' : 'R&B Neo-Soul Extended Chords'}
                </option>
                <option value="rock-organ-pad">
                  {lang === 'th' ? 'คอร์ดออร์แกนร็อกอุ้มซาวด์ (Rock Organ)' : 'Rock Organ Sustain Pad'}
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
                <div className="flex items-center gap-1.5">
                  {renderSoloButton('drums')}
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
                <option value="lukthung-3cha">
                  {lang === 'th' ? 'กลองลูกทุ่ง/สามช่าสนุกๆ (3-Cha Kit)' : 'Luk Thung / 3-Cha Percussion'}
                </option>
                <option value="rnb-pocket">
                  {lang === 'th' ? 'กลอง R&B หนึบๆ นุ่มลึก (R&B Pocket)' : 'R&B Laid-Back Pocket'}
                </option>
                <option value="rock-drive">
                  {lang === 'th' ? 'กลองร็อกแน่นๆ พร้อมลูกส่งทอม (Rock Drive)' : 'Rock Drive Kit + Tom Fills'}
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
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-sm text-ink-900">
                    {lang === 'th' ? '6. ทำนองร้องไกด์ (Guide Melody)' : '6. Vocal Melody Guide'}
                  </span>
                  <div className="text-[10px] text-ink-500">
                    {melodyEnabled
                      ? lang === 'th'
                        ? 'กำลังเปิดเสียงทำนองไกด์คลอไปกับวง'
                        : 'Guide melody active with band'
                      : lang === 'th'
                        ? 'Backing Track Only (ปิดเสียงเมโลดี้ไกด์เพื่อร้องจริง)'
                        : 'Backing Track Only (Guide melody muted)'}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {renderSoloButton('melody')}
                  <button
                    type="button"
                    aria-pressed={!melodyEnabled}
                    onClick={() =>
                      onUpdateSong((prev) => ({
                        ...prev,
                        mixer: {
                          ...prev.mixer,
                          melody: {
                            enabled: !(prev.mixer.melody?.enabled ?? true),
                            volume: prev.mixer.melody?.volume ?? 56,
                            sound: prev.mixer.melody?.sound ?? 'flute',
                          },
                        },
                      }))
                    }
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                    melodyEnabled ? 'bg-accent-500 text-white' : 'bg-amber-600 text-white'
                  }`}
                >
                  {melodyEnabled
                    ? lang === 'th'
                      ? 'เปิดไกด์'
                      : 'Guide ON'
                    : lang === 'th'
                      ? 'Backing Only'
                      : 'Backing Only'}
                  </button>
                </div>
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
                        volume: prev.mixer.melody?.volume ?? 56,
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
            <div className="p-3.5 rounded-xl border border-hairline bg-surface-2 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-ink-900 inline-flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rec-500" />
                  <span>{lang === 'th' ? '7. เสียงร้องสด (ไมค์ & Booth)' : '7. Recorded Vocals (Mic & Booth)'}</span>
                </span>
                <div className="flex items-center gap-1.5">
                  {renderSoloButton('vocal')}
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSong((prev) => ({
                        ...prev,
                        mixer: {
                          ...prev.mixer,
                          vocal: {
                            ...prev.mixer.vocal,
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
              </div>
              <div className="text-xs text-ink-700 bg-surface-1 border border-hairline rounded-lg px-2.5 py-1.5 flex items-center justify-between">
                <span>
                  {lang === 'th' ? 'คลิปห้องเพลง & บูธอัดต่อเนื่อง' : 'Bar Clips & Vocal Booth Takes'}
                </span>
                <span className="font-mono-tabular font-semibold text-accent-text">
                  {activeTakesCount > 0
                    ? `${activeTakesCount} ${lang === 'th' ? 'เทค' : 'take(s)'}`
                    : lang === 'th'
                      ? 'ฟรี 0 เหรียญ'
                      : '0 Cr'}
                </span>
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
                          ...prev.mixer.vocal,
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

              {/* Vocal FX Preset Selector */}
              <div className="space-y-1.5 pt-1 border-t border-hairline">
                <div className="text-[11px] font-semibold text-ink-600">
                  {lang === 'th' ? 'เอฟเฟกต์เสียงร้อง (Studio FX Preset)' : 'Studio Vocal FX Preset'}
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {VOCAL_FX_PRESETS.map((preset) => {
                    const active = vocalFxPreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        title={lang === 'th' ? preset.descTh : preset.descEn}
                        onClick={() =>
                          onUpdateSong((prev) => ({
                            ...prev,
                            mixer: {
                              ...prev.mixer,
                              vocal: {
                                ...prev.mixer.vocal,
                                enabled: prev.mixer.vocal?.enabled ?? true,
                                volume: prev.mixer.vocal?.volume ?? 95,
                                fxPreset: preset.id,
                              },
                            },
                          }))
                        }
                        className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                          active
                            ? 'bg-accent-500 text-white border-accent-500 shadow-e1'
                            : 'bg-surface-1 text-ink-700 border-hairline hover:border-accent-200'
                        }`}
                      >
                        {lang === 'th' ? preset.labelTh : preset.labelEn}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Backing Auto-Ducking Toggle */}
              <label className="flex items-center justify-between gap-2 pt-1 text-xs text-ink-700 cursor-pointer">
                <span>
                  {lang === 'th'
                    ? 'Auto-Ducking (ลดดนตรี -2dB ตอนร้อง)'
                    : 'Auto-Ducking (-2dB Backing Dip)'}
                </span>
                <input
                  type="checkbox"
                  checked={vocalAutoDucking}
                  onChange={(e) =>
                    onUpdateSong((prev) => ({
                      ...prev,
                      mixer: {
                        ...prev.mixer,
                        vocal: {
                          ...prev.mixer.vocal,
                          enabled: prev.mixer.vocal?.enabled ?? true,
                          volume: prev.mixer.vocal?.volume ?? 95,
                          autoDucking: e.target.checked,
                        },
                      },
                    }))
                  }
                  className="accent-[#5B61EE] w-4 h-4 cursor-pointer"
                />
              </label>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
};
