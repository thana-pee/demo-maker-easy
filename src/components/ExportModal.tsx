'use client';

import React, { useEffect, useState } from 'react';
import { SongProject, type ThaiLyricDialect } from '@/types/song';
import { transposeChord } from '@/lib/chordUtils';
import { generateShareUrl } from '@/lib/shareUrl';
import { downloadMidiFile } from '@/lib/midiExport';
import { downloadLrcFile, downloadLyricsTxtFile } from '@/lib/lyricExport';
import {
  downloadSongMp3,
  type Mp3ExportDetail,
  type Mp3ExportPhase,
} from '@/lib/mp3Exporter';
import {
  buildFullDemoMasterPrompt,
  THAI_DIALECT_PROFILES,
  THAI_ERA_PROFILES,
  THAI_GENRE_PROFILES,
  type FullDemoBlueprintSummary,
} from '@/lib/aiPrompts';
import {
  applyServerWalletSnapshot,
  canUsePaidOnlyModel,
  CREDIT_COST_TABLE,
  deductCredits,
  getWalletBreakdown,
} from '@/lib/creditManager';
import { getAuthAccessToken } from '@/lib/cloudSync';
import { useLanguage } from '@/context/LanguageContext';
import { getAnalyticsHeaders, trackUsageEvent } from '@/lib/analytics';

const DIALECT_SUNO_HINTS: Record<ThaiLyricDialect, string> = {
  standard: '',
  northern: 'Northern Thai Lanna folk vocal nuance',
  isan: 'Isan Northeast Thai heartfelt vocal inflection',
  'suphan-central': 'Classic Central Thailand Luk Thung vocal inflections',
  southern: 'Southern Thai expressive folk vocal character',
};

export function generateSunoPrompt(
  song: SongProject,
  options?: { includeChords?: boolean }
): {
  stylePrompt: string;
  lyricsMetatags: string;
  fullSunoText: string;
} {
  const includeChords = options?.includeChords ?? false;

  const guitarName =
    song.guitarModel === 'classical-nylon'
      ? 'Classical Nylon Guitar'
      : song.guitarModel === 'ovation-roundback'
        ? 'Ovation Roundback Acoustic Guitar'
        : song.guitarModel === 'gibson-les-paul'
          ? 'Gibson Les Paul Electric Guitar (Warm Humbucker)'
          : 'Dreadnought Steel Acoustic Guitar';

  const gaugeName =
    song.stringGauge === 'heavy-012' ? '.012 Heavy Gauge Strings' : '.010 Standard Strings';
  const ambienceName =
    song.ambience3D === 'wood-studio'
      ? 'Warm Wood Studio Ambience'
      : song.ambience3D === 'living-room'
        ? 'Intimate Living Room Acoustics'
        : 'Unplugged Concert Hall Reverb';

  const genreProfile = song.thaiGenre
    ? THAI_GENRE_PROFILES.find((g) => g.id === song.thaiGenre)
    : undefined;
  const eraProfile = song.lyricEra
    ? THAI_ERA_PROFILES.find((e) => e.id === song.lyricEra)
    : undefined;
  const dialectProfile = song.lyricDialect
    ? THAI_DIALECT_PROFILES.find((d) => d.id === song.lyricDialect)
    : undefined;

  const styleParts = [
    genreProfile ? genreProfile.sunoTags : 'Warm Acoustic Folk Pop & Gibson Les Paul Solo',
    eraProfile?.sunoHint ? eraProfile.sunoHint : '',
    dialectProfile && dialectProfile.id !== 'standard'
      ? DIALECT_SUNO_HINTS[dialectProfile.id]
      : '',
    guitarName,
    gaugeName,
    song.mixer.bass.enabled ? 'Warm Bass' : '',
    song.mixer.piano.enabled ? 'Expressive Piano' : '',
    song.mixer.drums.style !== 'off' ? 'Studio Acoustic Drums & Percussion' : 'No Drums',
    ambienceName,
    `${song.bpm} BPM`,
    `Key ${song.baseKey}`,
  ].filter(Boolean);

  const stylePrompt = styleParts.join(', ');

  const lyricsMetatags = song.sections
    .map((sec) => {
      const instList: string[] = [];
      if (sec.instruments?.guitarRhythm) instList.push('Rhythm Guitar');
      if (sec.instruments?.guitarLead) {
        const drive = sec.instruments?.guitarLeadDrive || song.mixer.guitarLead.drive;
        const driveStr =
          drive === 'distortion'
            ? 'Distortion'
            : drive === 'overdrive'
              ? 'Overdrive'
              : drive === 'crunch'
                ? 'Crunch'
                : 'Clean';
        instList.push(`Gibson Les Paul ${driveStr} Lead`);
      }
      if (sec.instruments?.bass) instList.push('Bass');
      if (sec.instruments?.piano) instList.push('Piano');
      if (sec.instruments?.drums) instList.push('Drums');
      const instStr = instList.length > 0 ? ` - ${instList.join(', ')}` : '';

      let sectionLabel = sec.name;
      if (sec.type === 'verse') sectionLabel = 'Verse';
      if (sec.type === 'pre-chorus') sectionLabel = 'Pre-Chorus';
      if (sec.type === 'chorus') sectionLabel = 'Chorus';
      if (sec.type === 'bridge') sectionLabel = 'Bridge';
      if (sec.type === 'solo') sectionLabel = 'Guitar Solo';
      if (sec.type === 'intro') sectionLabel = 'Intro';
      if (sec.type === 'outro') sectionLabel = 'Outro';

      const tag = `[${sectionLabel}${instStr}]`;

      if (includeChords) {
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
      }

      const lyricLines = sec.bars
        .map((bar) => bar.lyrics.trim())
        .filter((line) => line.length > 0);
      if (lyricLines.length === 0) {
        return `${tag}\n[Instrumental]`;
      }
      return `${tag}\n${lyricLines.join('\n')}`;
    })
    .join('\n\n');

  return {
    stylePrompt,
    lyricsMetatags,
    fullSunoText: `Style of Music: ${stylePrompt}\n\n${lyricsMetatags}`,
  };
}

interface ExportMasterResult {
  isSimulated: boolean;
  model: string;
  promptUsed: string;
  audioDataUrl: string | null;
  mimeType: string | null;
  tip: string;
  blueprintSummary?: FullDemoBlueprintSummary;
}

interface ExportModalProps {
  isOpen: boolean;
  song: SongProject;
  onUpdateSong?: (updater: (prev: SongProject) => SongProject) => void;
  onCreditsChange?: (newBalance: number) => void;
  onOpenTopUpWallet?: () => void;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  song,
  onUpdateSong,
  onCreditsChange,
  onOpenTopUpWallet,
  onClose,
}) => {
  const { lang } = useLanguage();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedSuno, setCopiedSuno] = useState(false);
  const [copiedStyleTags, setCopiedStyleTags] = useState(false);
  const [showSunoChords, setShowSunoChords] = useState(false);
  const [downloadedMidi, setDownloadedMidi] = useState(false);
  const [downloadedLrc, setDownloadedLrc] = useState(false);
  const [downloadedTxt, setDownloadedTxt] = useState(false);
  const [downloadedJson, setDownloadedJson] = useState(false);
  const [isRenderingMp3, setIsRenderingMp3] = useState(false);
  const [mp3Progress, setMp3Progress] = useState(0);
  const [mp3Phase, setMp3Phase] = useState<Mp3ExportPhase | null>(null);
  const [mp3Error, setMp3Error] = useState<string | null>(null);
  const [instrumentalOnly, setInstrumentalOnly] = useState(false);
  const [excludeMelodyGuide, setExcludeMelodyGuide] = useState(false);
  const [lastMixDetail, setLastMixDetail] = useState<Mp3ExportDetail | null>(null);

  // Phase 7D: AI Studio Master from Full Demo Blueprint (lyria-3.5 · 8 Credits)
  const [masterNotes, setMasterNotes] = useState('');
  const [masterInstrumental, setMasterInstrumental] = useState(false);
  const [showMasterBlueprint, setShowMasterBlueprint] = useState(false);
  const [showMasterConfirm, setShowMasterConfirm] = useState(false);
  const [isGeneratingMaster, setIsGeneratingMaster] = useState(false);
  const [masterError, setMasterError] = useState<string | null>(null);
  const [masterResult, setMasterResult] = useState<ExportMasterResult | null>(null);

  // ล้างสถานะการส่งออกเก่าเมื่อเปลี่ยนเพลงหรือแก้ไขโปรเจกต์ เพื่อป้องกันสถิติซ้ำค้างข้ามเพลง
  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      setLastMixDetail(null);
      setMp3Error(null);
      setMasterError(null);
      setMasterResult(null);
      setDownloadedMidi(false);
      setDownloadedLrc(false);
      setDownloadedTxt(false);
      setDownloadedJson(false);
    });
    return () => cancelAnimationFrame(rafId);
  }, [song.id, song.updatedAt]);

  if (!isOpen) return null;

  const masterCost = CREDIT_COST_TABLE.aiReferenceTrackLyria;
  const masterPaidGate = canUsePaidOnlyModel(masterCost);
  const walletBreakdown = getWalletBreakdown();
  const fullBlueprint = buildFullDemoMasterPrompt(song, {
    userNotes: masterNotes.trim(),
    instrumental: masterInstrumental,
    language: lang,
  });

  const handleGenerateFullMaster = async () => {
    const gate = canUsePaidOnlyModel(masterCost);
    if (!gate.allowed) {
      setShowMasterConfirm(false);
      setMasterError(
        gate.reason === 'paid-credits-required'
          ? lang === 'th'
            ? `โมเดล Lyria 3.5 (${masterCost} เหรียญ) สงวนเฉพาะเครดิตเติมเงิน (Purchased Credits)`
            : `Lyria 3.5 (${masterCost} Credits) requires purchased credits.`
          : lang === 'th'
            ? `เครดิตคงเหลือไม่พอสำหรับ ${masterCost} เหรียญ`
            : `Insufficient credits (${masterCost} required).`
      );
      return;
    }

    setShowMasterConfirm(false);
    setIsGeneratingMaster(true);
    setMasterError(null);

    try {
      const accessToken = getAuthAccessToken();
      const res = await fetch('/api/advance/reference-track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAnalyticsHeaders(),
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          fullSong: song,
          userNotes: masterNotes.trim(),
          instrumental: masterInstrumental,
          language: lang,
        }),
      });

      const data = (await res.json()) as ExportMasterResult & {
        error?: string;
        wallet?: { balance: number; trialCredits: number; purchasedCredits: number };
      };
      if (!res.ok) {
        setMasterError(
          data.error ||
            (lang === 'th'
              ? 'ไม่สามารถสร้าง AI Studio Master ได้'
              : 'Failed to generate AI Studio Master')
        );
        return;
      }

      if (data.wallet) {
        const synced = applyServerWalletSnapshot(data.wallet);
        onCreditsChange?.(synced.balance);
      } else if (!data.isSimulated && data.audioDataUrl) {
        const spend = deductCredits(
          masterCost,
          `AI Studio Master (Lyria 3.5): ${song.title || 'Demo'}`
        );
        if (spend.success) {
          onCreditsChange?.(spend.balance);
        }
      }

      setMasterResult(data);
    } catch {
      setMasterError(
        lang === 'th'
          ? 'เชื่อมต่อ API ไม่สำเร็จ (ยังไม่หัก 8 เหรียญ)'
          : 'Failed to reach API (0 credits deducted)'
      );
    } finally {
      setIsGeneratingMaster(false);
    }
  };

  const activeVocalTakesCount = (song.vocalTakes || []).filter(
    (t) => t.isActive && !!t.audioDataUrl
  ).length;
  const barVocalClipsCount = song.sections.reduce(
    (acc, sec) => acc + sec.bars.filter((b) => !!b.vocalAudio).length,
    0
  );
  const vocalTrackOn = song.mixer.vocal?.enabled ?? true;
  const activeInstCount = [
    song.mixer.guitarRhythm.enabled,
    song.mixer.guitarLead.enabled,
    song.mixer.bass.enabled,
    song.mixer.piano.enabled,
    song.mixer.drums.enabled && song.mixer.drums.style !== 'off',
    song.mixer.melody ? song.mixer.melody.enabled : true,
  ].filter(Boolean).length;

  const { stylePrompt, fullSunoText } = generateSunoPrompt(song, {
    includeChords: showSunoChords,
  });

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
      trackUsageEvent({
        eventName: 'share_link_copied',
        category: 'export',
        songwriterStyle: song.songwriterStyle,
        thaiGenre: song.thaiGenre,
        lyricDialect: song.lyricDialect,
      });
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const handleCopySuno = async () => {
    const ok = await copyToClipboard(fullSunoText);
    if (ok) {
      trackUsageEvent({
        eventName: 'suno_prompt_copied',
        category: 'export',
        featureVariant: showSunoChords ? 'with_chords' : 'clean_lyrics',
        songwriterStyle: song.songwriterStyle,
        thaiGenre: song.thaiGenre,
        lyricDialect: song.lyricDialect,
      });
      setCopiedSuno(true);
      setTimeout(() => setCopiedSuno(false), 2500);
    }
  };

  const handleCopyStyleTags = async () => {
    const ok = await copyToClipboard(stylePrompt);
    if (ok) {
      trackUsageEvent({
        eventName: 'suno_tags_copied',
        category: 'export',
        songwriterStyle: song.songwriterStyle,
        thaiGenre: song.thaiGenre,
        lyricDialect: song.lyricDialect,
      });
      setCopiedStyleTags(true);
      setTimeout(() => setCopiedStyleTags(false), 2500);
    }
  };

  const handleDownloadMidi = () => {
    downloadMidiFile(song);
    trackUsageEvent({
      eventName: 'export_midi',
      category: 'export',
      songwriterStyle: song.songwriterStyle,
      thaiGenre: song.thaiGenre,
      lyricDialect: song.lyricDialect,
    });
    setDownloadedMidi(true);
    setTimeout(() => setDownloadedMidi(false), 3000);
  };

  const handleDownloadLrc = () => {
    downloadLrcFile(song);
    trackUsageEvent({
      eventName: 'export_lrc',
      category: 'export',
      songwriterStyle: song.songwriterStyle,
      thaiGenre: song.thaiGenre,
      lyricDialect: song.lyricDialect,
    });
    setDownloadedLrc(true);
    setTimeout(() => setDownloadedLrc(false), 3000);
  };

  const handleDownloadTxt = () => {
    downloadLyricsTxtFile(song);
    trackUsageEvent({
      eventName: 'export_lyrics_txt',
      category: 'export',
      songwriterStyle: song.songwriterStyle,
      thaiGenre: song.thaiGenre,
      lyricDialect: song.lyricDialect,
    });
    setDownloadedTxt(true);
    setTimeout(() => setDownloadedTxt(false), 3000);
  };

  const effectiveExcludeMelodyGuide = excludeMelodyGuide || !(song.mixer.melody?.enabled ?? true);

  const handleToggleBackingTrackOnly = () => {
    if (onUpdateSong) {
      const nextEnabled = !((song.mixer.melody?.enabled ?? true) && !excludeMelodyGuide);
      onUpdateSong((prev) => ({
        ...prev,
        mixer: {
          ...prev.mixer,
          melody: {
            enabled: nextEnabled,
            volume: prev.mixer.melody?.volume ?? 56,
            sound: prev.mixer.melody?.sound ?? 'flute',
          },
        },
        updatedAt: new Date().toISOString(),
      }));
      setExcludeMelodyGuide(!nextEnabled);
    } else {
      setExcludeMelodyGuide((prev) => !prev);
    }
  };

  const handleDownloadMp3 = async () => {
    try {
      setIsRenderingMp3(true);
      setLastMixDetail(null);
      setMp3Error(null);
      setMp3Phase('loading-samples');
      setMp3Progress(5);
      await downloadSongMp3(song, (pct) => setMp3Progress(pct), {
        instrumentalOnly,
        excludeMelodyGuide: effectiveExcludeMelodyGuide,
        onPhase: (phase) => setMp3Phase(phase),
        onDetail: (detail) => setLastMixDetail(detail),
      });
      trackUsageEvent({
        eventName: 'export_mp3',
        category: 'export',
        featureVariant: instrumentalOnly ? 'instrumental' : 'full_mix',
        songwriterStyle: song.songwriterStyle,
        thaiGenre: song.thaiGenre,
        lyricDialect: song.lyricDialect,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMp3Error(
        (lang === 'th' ? 'เกิดข้อผิดพลาดในการเรนเดอร์ MP3: ' : 'Error rendering MP3: ') + msg
      );
    } finally {
      setIsRenderingMp3(false);
      setMp3Phase(null);
      setMp3Progress(0);
    }
  };

  const phaseLabel =
    mp3Phase === 'loading-samples'
      ? lang === 'th'
        ? '1/3 กำลังโหลด Soundfont สตูดิโอ...'
        : '1/3 Loading Samples...'
      : mp3Phase === 'mixing'
        ? lang === 'th'
          ? '2/3 กำลังมิกซ์วง + DSP เสียงร้อง...'
          : '2/3 Mixing Band & Vocals...'
        : mp3Phase === 'encoding'
          ? lang === 'th'
            ? '3/3 กำลังบีบอัด MP3 192 kbps...'
            : '3/3 Encoding MP3 192 kbps...'
          : '';

  const handleDownloadJSON = () => {
    const jsonString = JSON.stringify(song, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = (song.title || 'song').replace(/[^a-zA-Z0-9_\u0E00-\u0E7F-]/g, '_');
    a.download = `${safeTitle}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    trackUsageEvent({
      eventName: 'export_json_backup',
      category: 'export',
      songwriterStyle: song.songwriterStyle,
      thaiGenre: song.thaiGenre,
      lyricDialect: song.lyricDialect,
    });
    setDownloadedJson(true);
    setTimeout(() => setDownloadedJson(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-surface-1 rounded-3xl border border-hairline shadow-e3 max-w-xl w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-hairline pb-3">
          <div>
            <h3 className="font-bold text-lg text-ink-900">
              {lang === 'th' ? '📤 แชร์โปรเจกต์ & ส่งออกไฟล์เดโม่' : '📤 Export & Share Demo Project'}
            </h3>
            <p className="text-xs text-ink-400">
              {lang === 'th'
                ? 'ส่งต่อให้เพื่อนร่วมงาน หรือส่งเข้า AI และโปรแกรมทำเพลง'
                : 'Share with collaborators or export for DAWs & AI'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface-2 hover:bg-surface-inset text-ink-700 flex items-center justify-center font-bold text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3.5">
          {/* 1. LINE Share Link */}
          <div className="p-4 rounded-2xl bg-surface-2 border border-hairline flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="font-bold text-sm text-ink-900 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-ok-500" />
                {lang === 'th' ? 'คัดลอกลิงก์แชร์เพลง (ส่งเข้า LINE ได้ทันที)' : 'Copy LINE / Web Share Link'}
              </div>
              <div className="text-xs text-ink-700 mt-0.5">
                {lang === 'th'
                  ? 'ส่งให้เปิดฟังและแก้คอร์ดต่อบน iPad หรือมือถือได้ทันที (บีบอัดข้อมูลลง URL ปลอดภัย)'
                  : 'Plays and edits instantly on iPad or mobile (Lossless URL compression)'}
              </div>
            </div>
            <button
              onClick={handleCopyLink}
              className="px-4 py-2 rounded-xl bg-ok-500 hover:opacity-90 text-white font-semibold text-xs shadow-e1 transition whitespace-nowrap self-end sm:self-center cursor-pointer min-h-[38px]"
            >
              {copiedLink ? (lang === 'th' ? '✓ คัดลอกแล้ว!' : '✓ Copied!') : (lang === 'th' ? 'คัดลอกลิงก์' : 'Copy Link')}
            </button>
          </div>

          {/* 2. High-Quality 3D Stereo MP3 Mixdown (Phase 5E Parity Engine) */}
          <div className="p-4 rounded-2xl bg-accent-50 border border-accent-200 space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-bold text-sm text-ink-900 flex items-center gap-1.5">
                  <span>🎧</span>
                  <span>
                    {lang === 'th'
                      ? 'ดาวน์โหลดไฟล์เสียง 3D Stereo (.MP3 192 kbps)'
                      : 'Download 3D Stereo .MP3 (192 kbps)'}
                  </span>
                </div>
                <div className="text-xs text-accent-text mt-0.5">
                  {instrumentalOnly
                    ? lang === 'th'
                      ? `โหมด Karaoke Instrumental Only (ปิดเสียงร้อง — ดนตรีเต็มวง ${activeInstCount} ชิ้น)`
                      : `Karaoke Instrumental Only (Vocals muted — ${activeInstCount} instruments)`
                    : !vocalTrackOn
                      ? lang === 'th'
                        ? `Vocal ถูก Mute ในมิกเซอร์ — รวมวง ${activeInstCount} ชิ้น + DSP 3D`
                        : `Vocal muted in mixer — ${activeInstCount} instruments + 3D DSP`
                      : activeVocalTakesCount > 0 || barVocalClipsCount > 0
                        ? lang === 'th'
                          ? `รวม ${activeVocalTakesCount} Vocal Takes${barVocalClipsCount > 0 ? ` + ${barVocalClipsCount} คลิปรายห้อง` : ''} + วงเต็ม ${activeInstCount} ชิ้น`
                          : `Includes ${activeVocalTakesCount} vocal takes${barVocalClipsCount > 0 ? ` + ${barVocalClipsCount} bar clips` : ''} + ${activeInstCount} instruments`
                        : lang === 'th'
                          ? `วงเต็ม ${activeInstCount} ชิ้น (Soundfont + Overdrive/Body DSP + ห้อง 3D)`
                          : `${activeInstCount} instruments (Soundfont + Guitar DSP + 3D Ambience)`}
                </div>
              </div>
              <button
                type="button"
                disabled={isRenderingMp3}
                onClick={handleDownloadMp3}
                className="px-4 py-2 rounded-xl bg-accent-500 hover:bg-accent-hover disabled:opacity-50 text-white font-semibold text-xs shadow-e1 transition whitespace-nowrap self-end sm:self-center cursor-pointer flex items-center gap-1.5 min-h-[38px]"
              >
                {isRenderingMp3 ? (
                  <span>⏳ {mp3Progress}%</span>
                ) : (
                  <span>
                    {instrumentalOnly
                      ? lang === 'th'
                        ? 'ดาวน์โหลด Karaoke .MP3'
                        : 'Download Karaoke .MP3'
                      : lang === 'th'
                        ? 'ดาวน์โหลด .MP3'
                        : 'Download .MP3'}
                  </span>
                )}
              </button>
            </div>

            {/* Mixdown Controls: Instrumental Only Toggle, Backing Track Only & Phased Progress */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-accent-200/70">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-pressed={instrumentalOnly}
                  disabled={isRenderingMp3}
                  onClick={() => setInstrumentalOnly((prev) => !prev)}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer disabled:opacity-50 ${
                    instrumentalOnly
                      ? 'bg-accent-500 text-white border-accent-500 shadow-xs'
                      : 'bg-surface-1 text-ink-700 border-hairline hover:bg-surface-2'
                  }`}
                >
                  <span>{instrumentalOnly ? '✓' : '○'}</span>
                  <span>
                    {lang === 'th'
                      ? 'Instrumental Karaoke Only (ปิดเสียงร้อง)'
                      : 'Instrumental Karaoke Only (Mute Vocals)'}
                  </span>
                </button>

                <button
                  type="button"
                  aria-pressed={effectiveExcludeMelodyGuide}
                  disabled={isRenderingMp3}
                  onClick={handleToggleBackingTrackOnly}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer disabled:opacity-50 ${
                    effectiveExcludeMelodyGuide
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-surface-1 text-ink-700 border-hairline hover:bg-surface-2'
                  }`}
                >
                  <span>{effectiveExcludeMelodyGuide ? '✓' : '○'}</span>
                  <span>
                    {lang === 'th'
                      ? 'Backing Track Only (ปิดขลุ่ยเมโลดี้ไกด์)'
                      : 'Backing Track Only (Mute Guide Melody)'}
                  </span>
                </button>
              </div>

              <div className="text-[11px] font-medium text-ink-700 flex flex-wrap items-center gap-x-2">
                <span>
                  {lang === 'th'
                    ? `Vocal Sources พร้อมใช้งาน: ${activeVocalTakesCount + barVocalClipsCount}`
                    : `Vocal Sources Ready: ${activeVocalTakesCount + barVocalClipsCount}`}
                </span>
                {song.vocalTakes && song.vocalTakes.length > 0 && !instrumentalOnly && (
                  <span>
                    · FX: {song.mixer.vocal?.fxPreset || 'studio-warm'} · Latency {song.vocalLatencyOffsetMs || 0}ms
                  </span>
                )}
              </div>
            </div>

            {mp3Error && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
                ⚠️ {mp3Error}
              </div>
            )}

            {isRenderingMp3 && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-[11px] font-medium text-ink-700">
                  <span>{phaseLabel}</span>
                  <span className="font-mono-tabular">{mp3Progress}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-surface-1 overflow-hidden border border-hairline">
                  <div
                    className="h-full bg-accent-500 transition-all duration-200"
                    style={{ width: `${Math.max(4, Math.min(100, mp3Progress))}%` }}
                  />
                </div>
              </div>
            )}

            {!isRenderingMp3 && lastMixDetail && (
              <div className="text-[11px] text-ok-700 font-medium flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span>✓ {lang === 'th' ? 'ส่งออก MP3 สำเร็จ' : 'Export complete'}</span>
                <span>· Soundfonts {lastMixDetail.soundfontsLoaded.length}/4</span>
                {lastMixDetail.instrumentalOnly ? (
                  <span>· Karaoke Instrumental</span>
                ) : (
                  <span>· {lastMixDetail.vocalTakesCount + lastMixDetail.vocalClipsCount} Vocal Sources</span>
                )}
              </div>
            )}
          </div>

          {/* 2.5 AI Studio Master from Demo (Lyria 3.5 · Full Demo Blueprint · 8 Credits) */}
          <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-bold text-sm text-amber-950 flex items-center gap-1.5">
                  <span>✨</span>
                  <span>
                    {lang === 'th'
                      ? 'AI Studio Master: ต่อยอดเดโมนี้เป็นเพลงเต็ม'
                      : 'AI Studio Master: Full Song from Demo'}
                  </span>
                </div>
                <p className="text-[11px] text-amber-900 mt-0.5">
                  {lang === 'th'
                    ? 'ส่งพิมพ์เขียวเดโมทั้งเพลง (คอร์ดที่ Transpose + เนื้อร้องทุกท่อน + เมโลดี้ + สไตล์วง) ไปยัง Lyria 3.5'
                    : 'Sends your full demo blueprint (transposed chords, all lyrics, melody contour, band style) to Lyria 3.5.'}
                </p>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-white border border-amber-300 text-[11px] font-black text-amber-950 shrink-0">
                lyria-3.5 · {masterCost} {lang === 'th' ? 'เหรียญ' : 'Cr'}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold text-amber-950">
              <span className="px-2 py-0.5 rounded-lg bg-white border border-amber-200">
                {fullBlueprint.blueprintSummary.sectionCount} {lang === 'th' ? 'ท่อน' : 'Sections'}
              </span>
              <span className="px-2 py-0.5 rounded-lg bg-white border border-amber-200">
                {fullBlueprint.blueprintSummary.totalBars} {lang === 'th' ? 'ห้อง' : 'Bars'}
              </span>
              <span className="px-2 py-0.5 rounded-lg bg-white border border-amber-200">
                {fullBlueprint.blueprintSummary.lyricLinesCount} {lang === 'th' ? 'บรรทัดเนื้อร้อง' : 'Lyric Lines'}
              </span>
              <span className="px-2 py-0.5 rounded-lg bg-white border border-amber-200">
                {fullBlueprint.blueprintSummary.melodyBarsCount} {lang === 'th' ? 'ห้องเมโลดี้' : 'Melody Bars'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                id="export-master-notes"
                name="exportMasterNotes"
                maxLength={300}
                value={masterNotes}
                onChange={(e) => setMasterNotes(e.target.value)}
                placeholder={
                  lang === 'th'
                    ? 'กำกับโทนเสียงเพิ่มเติม เช่น ขอเสียงร้องอบอุ่น โซโลกีตาร์พุ่งในท่อนฮุค...'
                    : 'Optional tone notes (e.g. warm vocal, soaring chorus guitar)...'
                }
                className="flex-1 min-w-[180px] px-3 py-1.5 rounded-xl border border-amber-200 bg-white text-xs text-ink-900"
              />
              <button
                type="button"
                aria-pressed={masterInstrumental}
                onClick={() => setMasterInstrumental((v) => !v)}
                className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer transition ${
                  masterInstrumental
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-white text-ink-700 border-amber-200'
                }`}
              >
                {masterInstrumental ? '✓ ' : '○ '}
                {lang === 'th' ? 'เฉพาะดนตรี' : 'Instrumental'}
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowMasterBlueprint((v) => !v)}
                className="px-3 py-1.5 rounded-xl bg-white hover:bg-amber-100/60 border border-amber-200 text-amber-950 font-semibold text-xs cursor-pointer transition"
              >
                👁️ {showMasterBlueprint
                  ? lang === 'th'
                    ? 'ซ่อน Blueprint Preview (ฟรี)'
                    : 'Hide Blueprint Preview (Free)'
                  : lang === 'th'
                    ? 'ดู Mock Preview Summary / Blueprint (ฟรี 0 เครดิต)'
                    : 'Preview Blueprint Summary (0 Credits)'}
              </button>

              {masterPaidGate.allowed ? (
                showMasterConfirm ? (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      disabled={isGeneratingMaster}
                      onClick={handleGenerateFullMaster}
                      className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs cursor-pointer transition"
                    >
                      ✓ {lang === 'th' ? `ยืนยันใช้ ${masterCost} เหรียญ` : `Confirm (${masterCost} Cr)`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowMasterConfirm(false)}
                      className="px-2.5 py-1.5 rounded-xl bg-white border border-hairline text-ink-700 font-semibold text-xs cursor-pointer"
                    >
                      {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isGeneratingMaster}
                    onClick={() => setShowMasterConfirm(true)}
                    className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-black text-xs shadow-e1 cursor-pointer transition"
                  >
                    {isGeneratingMaster
                      ? lang === 'th'
                        ? '⏳ กำลังสังเคราะห์ด้วย Lyria 3.5...'
                        : '⏳ Synthesizing Lyria 3.5...'
                      : lang === 'th'
                        ? `✨ สร้างเพลงเต็ม Lyria 3.5 (${masterCost} เหรียญ)`
                        : `✨ Master with Lyria 3.5 (${masterCost} Cr)`}
                  </button>
                )
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-semibold text-rose-700">
                    🔒 {lang === 'th'
                      ? `ต้องมีเครดิตเติมเงิน ${masterCost} เหรียญ (มี ${walletBreakdown.purchasedCredits})`
                      : `Requires ${masterCost} purchased credits (${walletBreakdown.purchasedCredits} avail)`}
                  </span>
                  {onOpenTopUpWallet && (
                    <button
                      type="button"
                      onClick={onOpenTopUpWallet}
                      className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs cursor-pointer transition"
                    >
                      💳 {lang === 'th' ? 'เติมเครดิตปลดล็อก' : 'Top Up to Unlock'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {showMasterBlueprint && (
              <div className="p-3 rounded-xl bg-white border border-amber-200 space-y-1.5 text-[11px]">
                <div className="font-bold text-amber-950">
                  {lang === 'th'
                    ? '📋 Mock Preview Summary — Full Demo Blueprint (0 เครดิต)'
                    : '📋 Mock Preview Summary — Full Demo Blueprint (0 Credits)'}
                </div>
                <pre className="font-mono-tabular text-ink-700 whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed">
                  {fullBlueprint.promptUsed}
                </pre>
              </div>
            )}

            {masterError && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800">
                ⚠️ {masterError}
              </div>
            )}

            {masterResult && (
              <div className="p-3 rounded-xl bg-white border border-amber-200 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span
                    className={`px-2 py-0.5 rounded-full font-black text-[11px] ${
                      masterResult.isSimulated
                        ? 'bg-slate-200 text-slate-800'
                        : 'bg-amber-600 text-white'
                    }`}
                  >
                    {masterResult.isSimulated
                      ? `⚡ ${masterResult.model} (Mock Preview · 0 เครดิต)`
                      : `✨ ${masterResult.model} Studio Master`}
                  </span>
                  <span className="text-[11px] text-ink-700">{masterResult.tip}</span>
                </div>
                {masterResult.audioDataUrl && (
                  <div className="space-y-2">
                    <audio controls src={masterResult.audioDataUrl} className="w-full" />
                    <a
                      href={masterResult.audioDataUrl}
                      download={`${(song.title || 'master').replace(/[^a-zA-Z0-9_\u0E00-\u0E7F-]/g, '_')}_lyria_master.mp3`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-2 border border-hairline text-ink-900 font-bold text-xs hover:bg-surface-inset"
                    >
                      ⬇ {lang === 'th' ? 'ดาวน์โหลด Studio Master (.MP3)' : 'Download Studio Master (.MP3)'}
                    </a>
                  </div>
                )}
                <pre className="text-[11px] font-mono-tabular text-ink-700 bg-surface-2 p-2.5 rounded-lg border border-hairline whitespace-pre-wrap max-h-36 overflow-y-auto">
                  {masterResult.promptUsed}
                </pre>
              </div>
            )}
          </div>

          {/* 3. Suno AI Prompt Generator */}
          <div className="p-4 rounded-2xl bg-surface-2 border border-hairline space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-sm text-ink-900 flex items-center gap-1.5">
                <span>✨</span> Suno AI Style Prompt & Lyrics Metatags
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCopyStyleTags}
                  className="px-2.5 py-1.5 rounded-xl bg-accent-50 hover:bg-accent-100 border border-accent-200 text-accent-text font-semibold text-xs transition cursor-pointer min-h-[34px]"
                >
                  {copiedStyleTags
                    ? lang === 'th'
                      ? '✓ คัดลอก Style แล้ว'
                      : '✓ Style Copied'
                    : lang === 'th'
                      ? 'คัดลอก Style Tags'
                      : 'Copy Style Tags'}
                </button>
                <button
                  type="button"
                  onClick={handleCopySuno}
                  className="px-3.5 py-1.5 rounded-xl bg-ink-900 hover:opacity-90 text-canvas font-semibold text-xs transition cursor-pointer min-h-[34px]"
                >
                  {copiedSuno ? (lang === 'th' ? '✓ คัดลอกแล้ว!' : '✓ Copied!') : (lang === 'th' ? 'คัดลอกใส่ Suno' : 'Copy Suno Prompt')}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="text-ink-500">
                {lang === 'th'
                  ? 'แยกช่อง Style of Music พร้อมโหมดซ่อนคอร์ดเพื่อให้ AI ร้องภาษาไทยชัดที่สุด'
                  : 'Split Style of Music tags + clean lyrics mode for crisp AI singing.'}
              </span>
              <label className="inline-flex items-center gap-1.5 font-semibold text-ink-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showSunoChords}
                  onChange={(e) => setShowSunoChords(e.target.checked)}
                  className="accent-accent-500 rounded"
                />
                <span>{lang === 'th' ? 'แสดงคอร์ดในเนื้อร้อง' : 'Include chords in lyrics'}</span>
              </label>
            </div>

            <pre className="text-[11px] font-mono-tabular bg-surface-1 p-3 rounded-xl border border-hairline text-ink-700 overflow-x-auto max-h-40 whitespace-pre-wrap leading-relaxed">
              {fullSunoText}
            </pre>
          </div>

          {/* 4. MIDI, Lyrics (.LRC / .TXT) & JSON */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleDownloadMidi}
              className="flex-1 min-w-[140px] py-2.5 px-3 rounded-xl border border-accent-200 bg-accent-50 hover:bg-accent-500 hover:text-white text-xs font-semibold text-accent-text transition cursor-pointer text-center flex items-center justify-center gap-1.5 min-h-[40px]"
            >
              <span>🎹</span> {downloadedMidi ? (lang === 'th' ? '✓ ดาวน์โหลดแล้ว!' : '✓ Downloaded!') : (lang === 'th' ? 'ส่งออกไฟล์ .MID' : 'Export .MID')}
            </button>
            <button
              type="button"
              onClick={handleDownloadLrc}
              className="flex-1 min-w-[140px] py-2.5 px-3 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-600 hover:text-white text-xs font-semibold text-emerald-800 transition cursor-pointer text-center flex items-center justify-center gap-1.5 min-h-[40px]"
            >
              <span>🎤</span> {downloadedLrc ? (lang === 'th' ? '✓ ดาวน์โหลด .LRC แล้ว!' : '✓ Saved .LRC!') : (lang === 'th' ? 'ส่งออกเนื้อซิงค์ .LRC' : 'Lyrics .LRC')}
            </button>
            <button
              type="button"
              onClick={handleDownloadTxt}
              className="flex-1 min-w-[140px] py-2.5 px-3 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-600 hover:text-white text-xs font-semibold text-indigo-800 transition cursor-pointer text-center flex items-center justify-center gap-1.5 min-h-[40px]"
            >
              <span>📄</span> {downloadedTxt ? (lang === 'th' ? '✓ ดาวน์โหลด .TXT แล้ว!' : '✓ Saved .TXT!') : (lang === 'th' ? 'เนื้อ+คอร์ด .TXT' : 'Chords+Lyrics .TXT')}
            </button>
            <button
              type="button"
              onClick={handleDownloadJSON}
              className="flex-1 min-w-[140px] py-2.5 px-3 rounded-xl border border-hairline bg-surface-1 hover:bg-surface-2 text-xs font-semibold text-ink-700 transition cursor-pointer text-center flex items-center justify-center gap-1.5 min-h-[40px]"
            >
              <span>💾</span> {downloadedJson ? (lang === 'th' ? '✓ ดาวน์โหลด .JSON แล้ว!' : '✓ Saved .JSON!') : (lang === 'th' ? 'บันทึกโปรเจกต์ (.JSON)' : 'Save .JSON')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
