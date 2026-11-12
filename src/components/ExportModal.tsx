'use client';

import React, { useState } from 'react';
import { SongProject } from '@/types/song';
import { transposeChord } from '@/lib/chordUtils';
import { generateShareUrl } from '@/lib/shareUrl';
import { downloadMidiFile } from '@/lib/midiExport';
import { downloadSongMp3 } from '@/lib/mp3Exporter';
import { useLanguage } from '@/context/LanguageContext';

interface ExportModalProps {
  isOpen: boolean;
  song: SongProject;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, song, onClose }) => {
  const { lang, t } = useLanguage();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedSuno, setCopiedSuno] = useState(false);
  const [downloadedMidi, setDownloadedMidi] = useState(false);
  const [isRenderingMp3, setIsRenderingMp3] = useState(false);
  const [mp3Progress, setMp3Progress] = useState(0);

  if (!isOpen) return null;

  // Generate Suno AI Prompt and Metatags
  const guitarName =
    song.guitarModel === 'classical-nylon'
      ? 'Classical Nylon Guitar'
      : song.guitarModel === 'ovation-roundback'
      ? 'Ovation Roundback Acoustic Guitar'
      : song.guitarModel === 'gibson-les-paul'
      ? 'Gibson Les Paul Electric Guitar (Warm Humbucker)'
      : 'Dreadnought Steel Acoustic Guitar';

  const gaugeName = song.stringGauge === 'heavy-012' ? '.012 Heavy Gauge Strings' : '.010 Standard Strings';
  const ambienceName =
    song.ambience3D === 'wood-studio'
      ? 'Warm Wood Studio Ambience'
      : song.ambience3D === 'living-room'
      ? 'Intimate Living Room Acoustics'
      : 'Unplugged Concert Hall Reverb';

  const stylePrompt = `Style: Warm Acoustic Folk Pop & Gibson Les Paul Solo, ${guitarName}, ${gaugeName}, Acoustic Bass, Gentle Piano, ${
    song.mixer.drums.style !== 'off' ? 'Subtle Shaker & Cajon' : 'No Drums'
  }, ${ambienceName}, ${song.bpm} BPM, Key ${song.baseKey}`;

  const lyricsMetatags = song.sections
    .map((sec) => {
      const instList: string[] = [];
      if (sec.instruments?.guitarRhythm) instList.push('Rhythm Guitar');
      if (sec.instruments?.guitarLead) {
        const drive = sec.instruments?.guitarLeadDrive || song.mixer.guitarLead.drive;
        const driveStr = drive === 'distortion' ? 'Distortion' : drive === 'overdrive' ? 'Overdrive' : drive === 'crunch' ? 'Crunch' : 'Clean';
        instList.push(`Gibson Les Paul ${driveStr} Lead`);
      }
      if (sec.instruments?.bass) instList.push('Acoustic Bass');
      if (sec.instruments?.piano) instList.push('Piano');
      if (sec.instruments?.drums) instList.push('Cajon & Shaker');
      const instStr = instList.length > 0 ? ` - ${instList.join(', ')}` : '';

      let tag = `[${sec.name}${instStr}]`;
      if (sec.type === 'verse') tag = `[Verse${instStr}]`;
      if (sec.type === 'chorus') tag = `[Chorus${instStr}]`;
      if (sec.type === 'solo') tag = `[Guitar Solo${instStr}]`;
      if (sec.type === 'intro') tag = `[Intro${instStr}]`;
      if (sec.type === 'outro') tag = `[Outro${instStr}]`;

      const lines = sec.bars.map((bar) => {
        const chord1 = transposeChord(bar.chords[0] || 'C', song.transposeSemitones);
        const chord2 =
          bar.chordsPerBar === 2 && bar.chords[1]
            ? transposeChord(bar.chords[1], song.transposeSemitones)
            : '';
        const chordsPart = chord2 ? `(${chord1} ${chord2})` : `(${chord1})`;
        return `${chordsPart} ${bar.lyrics || '...'}`;
      });

      return `${tag}\n${lines.join('\n')}`;
    })
    .join('\n\n');

  const fullSunoText = `${stylePrompt}\n\n${lyricsMetatags}`;

  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      throw new Error('Clipboard API unavailable');
    } catch {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        textArea.remove();
        return successful;
      } catch {
        return false;
      }
    }
  };

  const handleCopyLink = async () => {
    const shareUrl = generateShareUrl(song);
    const ok = await copyToClipboard(shareUrl);
    if (ok) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const handleCopySuno = async () => {
    const ok = await copyToClipboard(fullSunoText);
    if (ok) {
      setCopiedSuno(true);
      setTimeout(() => setCopiedSuno(false), 2500);
    }
  };

  const handleDownloadMidi = () => {
    downloadMidiFile(song);
    setDownloadedMidi(true);
    setTimeout(() => setDownloadedMidi(false), 3000);
  };

  const handleDownloadMp3 = async () => {
    try {
      setIsRenderingMp3(true);
      setMp3Progress(5);
      await downloadSongMp3(song, (pct) => setMp3Progress(pct));
    } catch (err: any) {
      alert((lang === 'th' ? 'เกิดข้อผิดพลาดในการเรนเดอร์ MP3: ' : 'Error rendering MP3: ') + err.message);
    } finally {
      setIsRenderingMp3(false);
      setMp3Progress(0);
    }
  };

  const handleDownloadJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(song, null, 2));
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    const safeTitle = (song.title || 'song').replace(/[^a-zA-Z0-9_\u0E00-\u0E7F-]/g, '_');
    a.setAttribute('download', `${safeTitle}.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-xl w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-black text-lg text-slate-900">
              {lang === 'th' ? '📤 แชร์โปรเจกต์ & ส่งออกไฟล์เดโม่' : '📤 Export & Share Demo Project'}
            </h3>
            <p className="text-xs text-slate-500">
              {lang === 'th'
                ? 'ส่งต่อให้เพื่อนร่วมงาน หรือส่งเข้า AI และโปรแกรมทำเพลง'
                : 'Share with collaborators or export for DAWs & AI'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3.5">
          {/* 1. LINE Share Link */}
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="font-black text-sm text-emerald-950 flex items-center gap-1.5">
                <span>💬</span> {lang === 'th' ? 'คัดลอกลิงก์แชร์เพลง (ส่งเข้า LINE ได้ทันที)' : 'Copy LINE / Web Share Link'}
              </div>
              <div className="text-xs text-emerald-800 mt-0.5">
                {lang === 'th'
                  ? 'ส่งให้เปิดฟังและแก้คอร์ดต่อบน iPad หรือมือถือได้ทันที (บีบอัดข้อมูลลง URL ปลอดภัย)'
                  : 'Plays and edits instantly on iPad or mobile (Lossless URL compression)'}
              </div>
            </div>
            <button
              onClick={handleCopyLink}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition whitespace-nowrap self-end sm:self-center cursor-pointer min-h-[38px]"
            >
              {copiedLink ? (lang === 'th' ? '✓ คัดลอกแล้ว!' : '✓ Copied!') : (lang === 'th' ? 'คัดลอกลิงก์' : 'Copy Link')}
            </button>
          </div>

          {/* 2. High-Quality 3D Stereo MP3 Mixdown (Phase 2B) */}
          <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="font-black text-sm text-blue-950 flex items-center gap-1.5">
                <span>🎧</span> {lang === 'th' ? 'ดาวน์โหลดไฟล์เสียง 3D Stereo (.MP3 192 kbps)' : 'Download 3D Stereo .MP3 (192 kbps)'}
              </div>
              <div className="text-xs text-blue-800 mt-0.5">
                {lang === 'th'
                  ? 'มิกซ์รวม 7 เครื่องดนตรี + มิติห้อง 3D + เสียงร้องจริงจากไมค์'
                  : 'Mixes 7 instruments + 3D room reverb + recorded vocal clips'}
              </div>
            </div>
            <button
              type="button"
              disabled={isRenderingMp3}
              onClick={handleDownloadMp3}
              className="px-4 py-2 rounded-xl bg-[#1A73E8] hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs shadow-sm transition whitespace-nowrap self-end sm:self-center cursor-pointer flex items-center gap-1.5 min-h-[38px]"
            >
              {isRenderingMp3 ? (
                <span>⏳ {lang === 'th' ? `เรนเดอร์ (${mp3Progress}%)...` : `Rendering (${mp3Progress}%)...`}</span>
              ) : (
                <span>{lang === 'th' ? 'ดาวน์โหลด .MP3' : 'Download .MP3'}</span>
              )}
            </button>
          </div>

          {/* 3. Suno AI Prompt Generator */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-black text-sm text-slate-900 flex items-center gap-1.5">
                <span>✨</span> Suno AI Style Prompt & Lyrics Metatags
              </span>
              <button
                onClick={handleCopySuno}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs transition cursor-pointer min-h-[34px]"
              >
                {copiedSuno ? (lang === 'th' ? '✓ คัดลอกแล้ว!' : '✓ Copied!') : (lang === 'th' ? 'คัดลอกใส่ Suno' : 'Copy Suno Prompt')}
              </button>
            </div>
            <pre className="text-[11px] font-mono bg-white p-3 rounded-xl border border-slate-200 text-slate-700 overflow-x-auto max-h-40 whitespace-pre-wrap leading-relaxed">
              {fullSunoText}
            </pre>
          </div>

          {/* 4. MIDI & JSON */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              onClick={handleDownloadMidi}
              className="flex-1 py-2.5 px-3 rounded-xl border border-purple-200 bg-purple-50/60 hover:bg-purple-100 text-xs font-bold text-purple-950 transition cursor-pointer text-center flex items-center justify-center gap-1.5 min-h-[40px]"
            >
              <span>🎹</span> {downloadedMidi ? (lang === 'th' ? '✓ ดาวน์โหลดแล้ว!' : '✓ Downloaded!') : (lang === 'th' ? 'ส่งออกไฟล์ .MID (MIDI)' : 'Export .MID (MIDI)')}
            </button>
            <button
              onClick={handleDownloadJSON}
              className="flex-1 py-2.5 px-3 rounded-xl border border-slate-200 hover:bg-slate-100 text-xs font-bold text-slate-700 transition cursor-pointer text-center flex items-center justify-center gap-1.5 min-h-[40px]"
            >
              <span>💾</span> {lang === 'th' ? 'บันทึกไฟล์โปรเจกต์ (.JSON)' : 'Save Project (.JSON)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
