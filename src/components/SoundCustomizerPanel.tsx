'use client';

import React from 'react';
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

  return (
    <section className="bg-white rounded-3xl border border-slate-200 shadow-md p-5 sm:p-6 space-y-6 animate-in fade-in duration-150">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h2 className="font-bold text-base sm:text-lg text-slate-900">
            {lang === 'th'
              ? 'ปรับแต่งเนื้อเสียงกีตาร์ • มิติห้อง 3D • และมิกเซอร์ 7 แทร็ก'
              : '3D Acoustic Tone • Ambience • 7-Track Mixer'}
          </h2>
          <p className="text-xs text-slate-500">
            {lang === 'th'
              ? 'ใช้ชุดแซมเพิล Soundfont ร่วมกับ Web Audio DSP EQ และระบบจำลองเวทีเสียง 3 มิติ'
              : 'Web Audio DSP EQ with acoustic soundfonts and binaural 3D stage rendering'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-block px-3 py-1 rounded-full bg-blue-50 text-[#1A73E8] font-bold text-xs">
            3D Acoustic DSP Ready
          </span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Row 1: 3 Acoustic Sound Controls + Latency Offset */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Guitar Model */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-2.5">
          <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            {lang === 'th' ? '1. ทรงกีตาร์และชนิดสาย (Guitar Model)' : '1. Acoustic Guitar Body & Tone'}
          </div>
          <div className="space-y-2">
            <label
              className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition cursor-pointer ${
                song.guitarModel === 'dreadnought-steel'
                  ? 'bg-white border-[#1A73E8] shadow-xs'
                  : 'bg-white/80 border-slate-200 hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="guitarModel"
                checked={song.guitarModel === 'dreadnought-steel'}
                onChange={() => setGuitarModel('dreadnought-steel')}
                className="mt-1 accent-[#1A73E8]"
              />
              <div>
                <div className="font-bold text-xs text-slate-900">Acoustic Dreadnought (โปร่งไม้สายลวด)</div>
                <div className="text-[11px] text-slate-500">เบสอิ่มกังวาน บูสต์บอดี้ไม้ 150Hz & ประกายสาย 8kHz</div>
              </div>
            </label>

            <label
              className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition cursor-pointer ${
                song.guitarModel === 'classical-nylon'
                  ? 'bg-white border-[#1A73E8] shadow-xs'
                  : 'bg-white/80 border-slate-200 hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="guitarModel"
                checked={song.guitarModel === 'classical-nylon'}
                onChange={() => setGuitarModel('classical-nylon')}
                className="mt-1 accent-[#1A73E8]"
              />
              <div>
                <div className="font-bold text-xs text-slate-900">Classical Nylon (คลาสสิกสายเอ็น)</div>
                <div className="text-[11px] text-slate-500">โทนอุ่นนุ่มนวล ลดแหลมจัด (LPF 4.5kHz) หัวโน้ตมนฟังสบาย</div>
              </div>
            </label>

            <label
              className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition cursor-pointer ${
                song.guitarModel === 'ovation-roundback'
                  ? 'bg-white border-[#1A73E8] shadow-xs'
                  : 'bg-white/80 border-slate-200 hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="guitarModel"
                checked={song.guitarModel === 'ovation-roundback'}
                onChange={() => setGuitarModel('ovation-roundback')}
                className="mt-1 accent-[#1A73E8]"
              />
              <div>
                <div className="font-bold text-xs text-slate-900">Ovation Roundback (หลังเต่าสายลวด)</div>
                <div className="text-[11px] text-slate-500">ตัดเบสบวม (HPF 95Hz) เสียงกลางพุ่ง คมชัดทุกเม็ดโน้ต</div>
              </div>
            </label>

            <label
              className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition cursor-pointer ${
                song.guitarModel === 'gibson-les-paul'
                  ? 'bg-white border-[#1A73E8] shadow-xs'
                  : 'bg-white/80 border-slate-200 hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="guitarModel"
                checked={song.guitarModel === 'gibson-les-paul'}
                onChange={() => setGuitarModel('gibson-les-paul')}
                className="mt-1 accent-[#1A73E8]"
              />
              <div>
                <div className="font-bold text-xs text-slate-900">Gibson Les Paul (กีตาร์ไฟฟ้า Humbucker)</div>
                <div className="text-[11px] text-slate-500">โทนวอร์ม อิ่มหนา Sustain ยาว โซโล่หวานหรือสับคอร์ดแน่น</div>
              </div>
            </label>
          </div>
        </div>

        {/* 2. String Gauge */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-2.5">
          <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            {lang === 'th' ? '2. เบอร์สายกีตาร์ (String Gauge DSP)' : '2. String Gauge & Sustain'}
          </div>
          <div className="space-y-2">
            <label
              className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition cursor-pointer ${
                song.stringGauge === 'standard-010'
                  ? 'bg-white border-[#1A73E8] shadow-xs'
                  : 'bg-white/80 border-slate-200 hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="stringGauge"
                checked={song.stringGauge === 'standard-010'}
                onChange={() => setStringGauge('standard-010')}
                className="mt-1 accent-[#1A73E8]"
              />
              <div>
                <div className="font-bold text-xs text-slate-900">สายเบอร์ปกติ (.010 / .011 Standard)</div>
                <div className="text-[11px] text-slate-500">หัวโน้ตใส เบาสบาย ให้ความรู้สึกตีคอร์ดพริ้วเบา</div>
              </div>
            </label>

            <label
              className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition cursor-pointer ${
                song.stringGauge === 'heavy-012'
                  ? 'bg-white border-[#1A73E8] shadow-xs'
                  : 'bg-white/80 border-slate-200 hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="stringGauge"
                checked={song.stringGauge === 'heavy-012'}
                onChange={() => setStringGauge('heavy-012')}
                className="mt-1 accent-[#1A73E8]"
              />
              <div>
                <div className="font-bold text-xs text-slate-900">สายเบอร์ใหญ่ (.012 Heavy Gauge)</div>
                <div className="text-[11px] text-slate-500">บูสต์ Low-Mid +3dB หางเสียง Sustain ยาวขึ้น +25% หัวโน้ตแน่น</div>
              </div>
            </label>
          </div>
        </div>

        {/* 3. 3D Ambience */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-2.5">
          <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            {lang === 'th' ? '3. มิติเสียง 3D รอบทิศทาง (3D Soundstage)' : '3. 3D Stereo Soundstage & Reverb'}
          </div>
          <div className="space-y-2">
            <label
              className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition cursor-pointer ${
                song.ambience3D === 'wood-studio'
                  ? 'bg-white border-[#1A73E8] shadow-xs'
                  : 'bg-white/80 border-slate-200 hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="ambience3D"
                checked={song.ambience3D === 'wood-studio'}
                onChange={() => setAmbience3D('wood-studio')}
                className="mt-1 accent-[#1A73E8]"
              />
              <div>
                <div className="font-bold text-xs text-slate-900">🎙️ ห้องอัดไม้ (Warm Wood Studio 3D)</div>
                <div className="text-[11px] text-slate-500">แยกมิติกีตาร์โอบล้อม เสียงร้องและเบสอยู่ตรงกลางคมชัด</div>
              </div>
            </label>

            <label
              className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition cursor-pointer ${
                song.ambience3D === 'living-room'
                  ? 'bg-white border-[#1A73E8] shadow-xs'
                  : 'bg-white/80 border-slate-200 hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="ambience3D"
                checked={song.ambience3D === 'living-room'}
                onChange={() => setAmbience3D('living-room')}
                className="mt-1 accent-[#1A73E8]"
              />
              <div>
                <div className="font-bold text-xs text-slate-900">🏠 ห้องนั่งเล่นอบอุ่น (Intimate Living Room)</div>
                <div className="text-[11px] text-slate-500">มิติใกล้ชิดเหมือนนั่งเล่นกีตาร์อยู่ตรงหน้าโซฟา</div>
              </div>
            </label>

            <label
              className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition cursor-pointer ${
                song.ambience3D === 'unplugged-hall'
                  ? 'bg-white border-[#1A73E8] shadow-xs'
                  : 'bg-white/80 border-slate-200 hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="ambience3D"
                checked={song.ambience3D === 'unplugged-hall'}
                onChange={() => setAmbience3D('unplugged-hall')}
                className="mt-1 accent-[#1A73E8]"
              />
              <div>
                <div className="font-bold text-xs text-slate-900">🎭 เวทีคอนเสิร์ต (Unplugged Hall)</div>
                <div className="text-[11px] text-slate-500">หางเสียง Reverb กว้างและลึก เพิ่มบรรยากาศสะกดอารมณ์</div>
              </div>
            </label>
          </div>
        </div>

        {/* 4. Vocal Latency Offset */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-2.5 flex flex-col justify-between">
          <div className="space-y-1">
            <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
              <span>{lang === 'th' ? '4. ชดเชยเสียงหน่วง (Latency)' : '4. Vocal Latency Offset'}</span>
              <span className="font-mono text-xs text-rose-600 font-bold">
                {(song.vocalLatencyOffsetMs ?? 0) > 0 ? `+${song.vocalLatencyOffsetMs}` : (song.vocalLatencyOffsetMs ?? 0)} ms
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              {lang === 'th'
                ? 'ขยับไทม์มิ่งเสียงร้องสดให้ตรงจังหวะบีทพอดี (แก้ดีเลย์จากหูฟังบลูทูธ/ไมค์)'
                : 'Compensate Bluetooth earphone and mic latency (-150ms to +150ms)'}
            </p>
          </div>

          <div className="space-y-1.5 bg-white p-3 rounded-xl border border-slate-200">
            <input
              type="range"
              min="-150"
              max="150"
              step="5"
              value={song.vocalLatencyOffsetMs ?? 0}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                onUpdateSong((prev) => ({ ...prev, vocalLatencyOffsetMs: val }));
              }}
              className="w-full accent-rose-600 cursor-pointer"
            />
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold">
              <span>{lang === 'th' ? '◀ เร็วขึ้น (-150ms)' : '◀ Earlier (-150ms)'}</span>
              <span>{lang === 'th' ? '0ms ตรงเป๊ะ' : '0ms Perfect'}</span>
              <span>{lang === 'th' ? 'ช้าลง (+150ms) ▶' : 'Later (+150ms) ▶'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: 7-Track Instrument & Vocal Mixer */}
      <div className="space-y-2.5">
        <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          {lang === 'th'
            ? 'มิกเซอร์ดนตรี & เสียงร้อง (7-Track Mixer) — กีตาร์ 2 ตัว, เบส, เปียโน, กลอง, ไกด์ทำนอง และเสียงร้องจริง'
            : '7-Track Instrument & Vocal Mixer — 2 Guitars, Bass, Piano, Percussion, Melody & Vocals'}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-3">
          {/* Track 1: Rhythm Guitar */}
          <div className="p-3.5 rounded-2xl border border-blue-200 bg-blue-50/50 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-slate-900">
                {lang === 'th' ? '🎸 1. กีตาร์ริทึ่ม (คอร์ด)' : '🎸 1. Rhythm Guitar'}
              </span>
              <button
                onClick={() =>
                  onUpdateSong((prev) => ({
                    ...prev,
                    mixer: {
                      ...prev.mixer,
                      guitarRhythm: { ...prev.mixer.guitarRhythm, enabled: !prev.mixer.guitarRhythm.enabled },
                    },
                  }))
                }
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition ${
                  song.mixer.guitarRhythm.enabled ? 'bg-[#1A73E8] text-white' : 'bg-slate-200 text-slate-600'
                }`}
              >
                {song.mixer.guitarRhythm.enabled ? (lang === 'th' ? 'เปิด' : 'ON') : (lang === 'th' ? 'ปิด' : 'OFF')}
              </button>
            </div>
            <select
              value={song.mixer.guitarRhythm.model}
              onChange={(e) =>
                onUpdateSong((prev) => ({
                  ...prev,
                  mixer: {
                    ...prev.mixer,
                    guitarRhythm: { ...prev.mixer.guitarRhythm, model: e.target.value as GuitarModel },
                  },
                }))
              }
              className="w-full text-xs bg-white border border-slate-200 rounded-xl px-2 py-1 font-bold text-slate-800"
            >
              <option value="dreadnought-steel">{lang === 'th' ? 'โปร่งไม้ Dreadnought' : 'Dreadnought Steel'}</option>
              <option value="classical-nylon">{lang === 'th' ? 'คลาสสิกสายเอ็น Nylon' : 'Classical Nylon'}</option>
              <option value="ovation-roundback">{lang === 'th' ? 'หลังเต่า Ovation' : 'Ovation Roundback'}</option>
              <option value="gibson-les-paul">Gibson Les Paul</option>
            </select>
            <select
              value={song.mixer.guitarRhythm.style}
              onChange={(e) =>
                onUpdateSong((prev) => ({
                  ...prev,
                  mixer: {
                    ...prev.mixer,
                    guitarRhythm: { ...prev.mixer.guitarRhythm, style: e.target.value as GuitarStyle },
                  },
                }))
              }
              className="w-full text-xs bg-white border border-slate-200 rounded-xl px-2 py-1 font-medium"
            >
              <option value="campfire-strum">{lang === 'th' ? 'ตีคอร์ดแคมป์ไฟ' : 'Campfire Strum'}</option>
              <option value="soft-strum">{lang === 'th' ? 'ตีคอร์ดนุ่มนวล' : 'Soft Strum'}</option>
              <option value="fingerpicking">{lang === 'th' ? 'เกาสายอะคูสติก' : 'Fingerpicking'}</option>
            </select>
            <div className="flex items-center gap-2 text-[11px] text-slate-600">
              <span>{lang === 'th' ? 'ดัง' : 'Vol'}</span>
              <input
                type="range"
                min="0"
                max="100"
                value={song.mixer.guitarRhythm.volume}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  onUpdateSong((prev) => ({
                    ...prev,
                    mixer: { ...prev.mixer, guitarRhythm: { ...prev.mixer.guitarRhythm, volume: val } },
                  }));
                }}
                className="w-full accent-[#1A73E8]"
              />
              <span className="font-mono text-xs w-7">{song.mixer.guitarRhythm.volume}%</span>
            </div>
          </div>

          {/* Track 2: Lead / Solo Guitar (Gibson Les Paul) */}
          <div className="p-3.5 rounded-2xl border border-purple-200 bg-purple-50/50 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-purple-950">
                {lang === 'th' ? '🎸 2. กีตาร์ลีด / โซโล่' : '🎸 2. Lead / Solo Guitar'}
              </span>
              <button
                onClick={() =>
                  onUpdateSong((prev) => ({
                    ...prev,
                    mixer: {
                      ...prev.mixer,
                      guitarLead: { ...prev.mixer.guitarLead, enabled: !prev.mixer.guitarLead.enabled },
                    },
                  }))
                }
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition ${
                  song.mixer.guitarLead.enabled ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-600'
                }`}
              >
                {song.mixer.guitarLead.enabled ? (lang === 'th' ? 'เปิด' : 'ON') : (lang === 'th' ? 'ปิด' : 'OFF')}
              </button>
            </div>
            <select
              value={song.mixer.guitarLead.model}
              onChange={(e) =>
                onUpdateSong((prev) => ({
                  ...prev,
                  mixer: {
                    ...prev.mixer,
                    guitarLead: { ...prev.mixer.guitarLead, model: e.target.value as GuitarModel },
                  },
                }))
              }
              className="w-full text-xs bg-white border border-purple-200 rounded-xl px-2 py-1 font-bold text-purple-900"
            >
              <option value="gibson-les-paul">Gibson Les Paul</option>
              <option value="dreadnought-steel">{lang === 'th' ? 'โปร่งไม้ Dreadnought' : 'Dreadnought Steel'}</option>
              <option value="classical-nylon">{lang === 'th' ? 'คลาสสิกสายเอ็น Nylon' : 'Classical Nylon'}</option>
              <option value="ovation-roundback">{lang === 'th' ? 'หลังเต่า Ovation' : 'Ovation Roundback'}</option>
            </select>
            <select
              value={song.mixer.guitarLead.style}
              onChange={(e) =>
                onUpdateSong((prev) => ({
                  ...prev,
                  mixer: {
                    ...prev.mixer,
                    guitarLead: { ...prev.mixer.guitarLead, style: e.target.value as LeadGuitarStyle },
                  },
                }))
              }
              className="w-full text-xs bg-white border border-purple-200 rounded-xl px-2 py-1 font-medium"
            >
              <option value="melodic-solo">{lang === 'th' ? 'โซโล่ทำนอง (Melodic Solo)' : 'Melodic Solo'}</option>
              <option value="riff-fills">{lang === 'th' ? 'หยอดลูกส่ง (Riff Fills)' : 'Riff Fills'}</option>
              <option value="soft-arpeggio">{lang === 'th' ? 'เกาโน้ตสูงคลอ (Arpeggio)' : 'Soft Arpeggio'}</option>
            </select>
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-purple-900 block">
                {lang === 'th' ? '🎛️ เสียงแตก (Overdrive):' : '🎛️ Drive Mode:'}
              </span>
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
                className="w-full text-xs bg-white border border-purple-300 rounded-xl px-2 py-1 font-bold text-purple-900"
              >
                <option value="clean">{lang === 'th' ? '🧊 คลีนใส (Clean)' : '🧊 Clean'}</option>
                <option value="crunch">{lang === 'th' ? '⚡ เสียงแตกอ่อน (Crunch)' : '⚡ Crunch'}</option>
                <option value="overdrive">{lang === 'th' ? '🔥 แตกหวาน (Tube Overdrive)' : '🔥 Tube Overdrive'}</option>
                <option value="distortion">{lang === 'th' ? '💥 แตกดุดัน (Heavy Distortion)' : '💥 Saturated Fuzz'}</option>
              </select>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-600">
              <span>{lang === 'th' ? 'ดัง' : 'Vol'}</span>
              <input
                type="range"
                min="0"
                max="100"
                value={song.mixer.guitarLead.volume}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  onUpdateSong((prev) => ({
                    ...prev,
                    mixer: { ...prev.mixer, guitarLead: { ...prev.mixer.guitarLead, volume: val } },
                  }));
                }}
                className="w-full accent-purple-600"
              />
              <span className="font-mono text-xs w-7">{song.mixer.guitarLead.volume}%</span>
            </div>
          </div>

          {/* Track 3: Bass */}
          <div className="p-3.5 rounded-2xl border border-slate-200 bg-white space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-slate-900">
                {lang === 'th' ? '🎻 3. เบสอะคูสติก' : '🎻 3. Acoustic Bass'}
              </span>
              <button
                onClick={() =>
                  onUpdateSong((prev) => ({
                    ...prev,
                    mixer: {
                      ...prev.mixer,
                      bass: { ...prev.mixer.bass, enabled: !prev.mixer.bass.enabled },
                    },
                  }))
                }
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition ${
                  song.mixer.bass.enabled ? 'bg-[#1A73E8] text-white' : 'bg-slate-200 text-slate-600'
                }`}
              >
                {song.mixer.bass.enabled ? (lang === 'th' ? 'เปิด' : 'ON') : (lang === 'th' ? 'ปิด' : 'OFF')}
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
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 font-medium"
            >
              <option value="root-fifth">{lang === 'th' ? 'เดินเบส Root-Fifth นุ่มๆ' : 'Root-Fifth Walk'}</option>
              <option value="warm-sustain">{lang === 'th' ? 'เดินเบสค้างโน้ตต่ำ (Warm Sustain)' : 'Warm Sustain'}</option>
            </select>
            <div className="flex items-center gap-2 text-[11px] text-slate-600">
              <span>{lang === 'th' ? 'ดัง' : 'Vol'}</span>
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
                className="w-full accent-[#1A73E8]"
              />
              <span className="font-mono text-xs w-7">{song.mixer.bass.volume}%</span>
            </div>
          </div>

          {/* Track 4: Piano */}
          <div className="p-3.5 rounded-2xl border border-slate-200 bg-white space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-slate-900">
                {lang === 'th' ? '🎹 4. เปียโนคลอ' : '🎹 4. Piano Chords'}
              </span>
              <button
                onClick={() =>
                  onUpdateSong((prev) => ({
                    ...prev,
                    mixer: {
                      ...prev.mixer,
                      piano: { ...prev.mixer.piano, enabled: !prev.mixer.piano.enabled },
                    },
                  }))
                }
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition ${
                  song.mixer.piano.enabled ? 'bg-[#1A73E8] text-white' : 'bg-slate-200 text-slate-600'
                }`}
              >
                {song.mixer.piano.enabled ? (lang === 'th' ? 'เปิด' : 'ON') : (lang === 'th' ? 'ปิด' : 'OFF')}
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
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 font-medium"
            >
              <option value="warm-pad">{lang === 'th' ? 'กดคอร์ดปูพื้นอุ่นๆ (Warm Pad)' : 'Warm Pad Chords'}</option>
              <option value="gentle-arpeggio">{lang === 'th' ? 'พรมนิ้วเบาๆ (Gentle Arpeggio)' : 'Gentle Arpeggio'}</option>
            </select>
            <div className="flex items-center gap-2 text-[11px] text-slate-600">
              <span>{lang === 'th' ? 'ดัง' : 'Vol'}</span>
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
                className="w-full accent-[#1A73E8]"
              />
              <span className="font-mono text-xs w-7">{song.mixer.piano.volume}%</span>
            </div>
          </div>

          {/* Track 5: Drums */}
          <div className="p-3.5 rounded-2xl border border-slate-200 bg-white space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-slate-900">
                {lang === 'th' ? '🥁 5. เพอร์คัชชัน / กลอง' : '🥁 5. Percussion / Drums'}
              </span>
              <button
                onClick={() =>
                  onUpdateSong((prev) => ({
                    ...prev,
                    mixer: {
                      ...prev.mixer,
                      drums: {
                        ...prev.mixer.drums,
                        enabled: !prev.mixer.drums.enabled,
                      },
                    },
                  }))
                }
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition ${
                  song.mixer.drums.enabled && song.mixer.drums.style !== 'off'
                    ? 'bg-[#1A73E8] text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {song.mixer.drums.enabled && song.mixer.drums.style !== 'off'
                  ? (lang === 'th' ? 'เปิด' : 'ON')
                  : (lang === 'th' ? 'ปิด' : 'OFF')}
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
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 font-medium"
            >
              <option value="shaker-cajon">{lang === 'th' ? 'เขย่า Shaker & เคาะ Cajon' : 'Shaker & Cajon'}</option>
              <option value="off">{lang === 'th' ? 'ปิดกลอง (Off — ดนตรีล้วน)' : 'Off (Acoustic Only)'}</option>
              <option value="simple-kit">{lang === 'th' ? 'กลองชุดอะคูสติกเรียบๆ (Simple Kit)' : 'Simple Drum Kit'}</option>
            </select>
            <div className="flex items-center gap-2 text-[11px] text-slate-600">
              <span>{lang === 'th' ? 'ดัง' : 'Vol'}</span>
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
                className="w-full accent-[#1A73E8]"
              />
              <span className="font-mono text-xs w-7">{song.mixer.drums.volume}%</span>
            </div>
          </div>

          {/* Track 6: Vocal Melody Guide */}
          <div className="p-3.5 rounded-2xl border border-indigo-200 bg-indigo-50/40 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-indigo-950">
                {lang === 'th' ? '🎤 6. ทำนองร้องไกด์' : '🎤 6. Vocal Melody Guide'}
              </span>
              <button
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
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition ${
                  song.mixer.melody?.enabled ?? true
                    ? 'bg-[#1A73E8] text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {song.mixer.melody?.enabled ?? true ? (lang === 'th' ? 'เปิด' : 'ON') : (lang === 'th' ? 'ปิด' : 'OFF')}
              </button>
            </div>
            <select
              value={song.mixer.melody?.sound ?? 'flute'}
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
              className="w-full text-xs bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-bold text-slate-800"
            >
              <option value="flute">{lang === 'th' ? '🎵 ขลุ่ย/ฮัมร้อง (Flute)' : '🎵 Flute Vibrato'}</option>
              <option value="piano">{lang === 'th' ? '🎹 เปียโนทำนอง (Lead Piano)' : '🎹 Lead Piano'}</option>
              <option value="bell">{lang === 'th' ? '🔔 ระฆังแก้ว (Warm Bell)' : '🔔 Warm Glass Bell'}</option>
            </select>
            <div className="flex items-center gap-2 text-[11px] text-slate-600">
              <span>{lang === 'th' ? 'ดัง' : 'Vol'}</span>
              <input
                type="range"
                min="0"
                max="100"
                value={song.mixer.melody?.volume ?? 85}
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
                className="w-full accent-indigo-600"
              />
              <span className="font-mono text-xs w-7">{song.mixer.melody?.volume ?? 85}%</span>
            </div>
          </div>

          {/* Track 7: Recorded Vocals */}
          <div className="p-3.5 rounded-2xl border border-rose-200 bg-rose-50/40 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-rose-950">
                {lang === 'th' ? '🎙️ 7. เสียงร้องสด (ไมค์)' : '🎙️ 7. Recorded Vocals (Mic)'}
              </span>
              <button
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
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition ${
                  song.mixer.vocal?.enabled ?? true
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {song.mixer.vocal?.enabled ?? true ? (lang === 'th' ? 'เปิด' : 'ON') : (lang === 'th' ? 'ปิด' : 'OFF')}
              </button>
            </div>
            <div className="text-[11px] text-rose-800 bg-white border border-rose-200 rounded-xl px-2 py-1.5 font-bold">
              {lang === 'th' ? '🎤 คลิปเสียงร้องจากห้องเพลง' : '🎤 Bar Vocal Scratchpad'}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-600">
              <span>{lang === 'th' ? 'ดัง' : 'Vol'}</span>
              <input
                type="range"
                min="0"
                max="100"
                value={song.mixer.vocal?.volume ?? 95}
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
                className="w-full accent-rose-600"
              />
              <span className="font-mono text-xs w-7">{song.mixer.vocal?.volume ?? 95}%</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
