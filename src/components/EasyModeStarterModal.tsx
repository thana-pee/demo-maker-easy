'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  Play,
  Square,
  SlidersHorizontal,
  ArrowLeft,
  X,
  Music2,
  Mic2,
  Coins,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Volume2,
} from 'lucide-react';
import {
  CREDIT_COST_TABLE,
  applyServerWalletSnapshot,
  canAfford,
  deductCredits,
  getCreditBalance,
  type WalletBreakdown,
} from '@/lib/creditManager';
import { getAuthAccessToken, refreshAuthSession } from '@/lib/cloudSync';
import { getAnalyticsHeaders, trackUsageEvent } from '@/lib/analytics';
import {
  EASY_STYLE_PRESETS,
  getPresetConfig,
  applyBandDensityToSong,
  type BandDensityLevel,
  type TempoFeel,
  type VocalProfile,
} from '@/lib/songArchitect';
import {
  EMOTIONAL_RESOLUTION_PROFILES,
  THAI_DIALECT_PROFILES,
  THAI_ERA_PROFILES,
  SONGWRITER_STYLE_PROFILES,
} from '@/lib/aiPrompts';
import { transposeChord } from '@/lib/chordUtils';
import { useLanguage } from '@/context/LanguageContext';
import { MicRecorder, playAudioDataUrl } from '@/lib/micRecorder';
import type {
  SongProject,
  ThaiEmotionalResolution,
  ThaiLyricDialect,
  ThaiLyricEra,
  ThaiSongwriterStyle,
} from '@/types/song';

interface EasyModeStarterModalProps {
  isOpen: boolean;
  creditBalance: number;
  isPlaying: boolean;
  onCreditsChange: (balance: number) => void;
  onPreviewAudioToggle: (previewSong: SongProject) => void;
  onStopAudio: () => void;
  onApplySong: (song: SongProject, targetView: 'songwriter' | 'arranger') => void;
  onOpenWallet: () => void;
  onClose: () => void;
}

interface ArchitectApiResult {
  isSimulated: boolean;
  model: string;
  song: SongProject;
  producerNotes: string[];
  rhymeValidation?: { passed: boolean; polished: boolean };
  transcribedLyrics?: string;
  confidenceNote?: string;
  tip: string;
  usage?: { totalTokens?: number };
  wallet?: WalletBreakdown;
}

interface HumClipState {
  dataUrl: string;
  base64: string;
  mimeType: string;
  durationSec: number;
  sourceName?: string;
}

const EASY_WHOLE_SONG_COST = CREDIT_COST_TABLE.aiEasyWholeSong;
const EASY_HUM_SONG_COST = CREDIT_COST_TABLE.aiHumToSong;
const MAX_HUM_SECONDS = 45;
const MAX_HUM_BYTES = 8 * 1024 * 1024;

type EasyApiParsedResult = ArchitectApiResult & { error?: string };

async function postEasyApiJson(
  url: string,
  payload: Record<string, unknown>
): Promise<{ res: Response; data: EasyApiParsedResult | null }> {
  const sendWithToken = (token: string | null) =>
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAnalyticsHeaders(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });

  const initialToken = getAuthAccessToken();
  let res = await sendWithToken(initialToken);
  if (res.status === 401 && initialToken) {
    const refreshed = await refreshAuthSession().catch(() => null);
    if (refreshed?.accessToken) {
      res = await sendWithToken(refreshed.accessToken);
    }
  }

  const rawText = await res.text();
  let data: EasyApiParsedResult | null = null;
  if (rawText.trim()) {
    try {
      data = JSON.parse(rawText) as EasyApiParsedResult;
    } catch {
      data = null;
    }
  }
  return { res, data };
}

function formatEasyApiFailureMessage(
  status: number | null,
  dataError: string | undefined,
  feature: 'architect' | 'hum',
  lang: string
): string {
  if (dataError && dataError.trim()) {
    return dataError.trim();
  }
  const featureLabel = feature === 'hum' ? 'Hum-to-Song' : 'Easy Mode';
  if (status === 504 || status === 524) {
    return lang === 'th'
      ? `เซิร์ฟเวอร์ประมวลผลไม่ทันเวลา (HTTP ${status} — ไม่หักเครดิต) กรุณาลองกดใหม่อีกครั้งครับ`
      : `${featureLabel} timed out on server (HTTP ${status}, 0 credits charged). Please retry.`;
  }
  if (status !== null) {
    return lang === 'th'
      ? `บริการ ${featureLabel} ขัดข้องชั่วคราว (HTTP ${status} — ไม่หักเครดิต) กรุณาลองใหม่อีกครั้ง`
      : `${featureLabel} server error (HTTP ${status}, 0 credits charged).`;
  }
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (isOffline) {
    return lang === 'th'
      ? 'อุปกรณ์ไม่ได้เชื่อมต่ออินเทอร์เน็ต (ไม่หักเครดิต) กรุณาเช็กสัญญาณแล้วลองใหม่'
      : 'Device appears offline (0 credits charged).';
  }
  return lang === 'th'
    ? `ไม่สามารถเชื่อมต่อบริการ ${featureLabel} ได้ชั่วคราว (สัญญาณขาดระหว่างรอผล — ไม่หักเครดิต)`
    : `Network error calling ${featureLabel} API (0 credits charged).`;
}

export const EasyModeStarterModal: React.FC<EasyModeStarterModalProps> = ({
  isOpen,
  creditBalance,
  isPlaying,
  onCreditsChange,
  onPreviewAudioToggle,
  onStopAudio,
  onApplySong,
  onOpenWallet,
  onClose,
}) => {
  const { lang, t } = useLanguage();

  const [starterTab, setStarterTab] = useState<'idea' | 'hum'>('idea');
  const [stylePreset, setStylePreset] = useState<string>('warm-acoustic');
  const [vocalProfile, setVocalProfile] = useState<VocalProfile>('neutral');
  const [tempoFeel, setTempoFeel] = useState<TempoFeel>('medium');
  const [songLanguage, setSongLanguage] = useState<'th' | 'en'>(lang === 'en' ? 'en' : 'th');
  const [lyricDialect, setLyricDialect] = useState<ThaiLyricDialect>('standard');
  const [songwriterStyle, setSongwriterStyle] = useState<ThaiSongwriterStyle>('none');
  const [lyricEra, setLyricEra] = useState<ThaiLyricEra>('modern-indie');
  const [emotionalResolution, setEmotionalResolution] =
    useState<ThaiEmotionalResolution>('auto');
  const [topic, setTopic] = useState<string>('');

  const [showCostConfirm, setShowCostConfirm] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Phase 5C: Hum-to-Song Capture State
  const [humSupported, setHumSupported] = useState<boolean>(false);
  const [isRecordingHum, setIsRecordingHum] = useState<boolean>(false);
  const [humElapsedSec, setHumElapsedSec] = useState<number>(0);
  const [humVuLevel, setHumVuLevel] = useState<number>(0);
  const [humClip, setHumClip] = useState<HumClipState | null>(null);
  const [isPlayingHumClip, setIsPlayingHumClip] = useState<boolean>(false);
  const [includeTranscribePass, setIncludeTranscribePass] = useState<boolean>(false);
  const [showHumCostConfirm, setShowHumCostConfirm] = useState<boolean>(false);
  const [transcribedLyricsPreview, setTranscribedLyricsPreview] = useState<string>('');
  const [confidenceNotePreview, setConfidenceNotePreview] = useState<string>('');

  const [generatedResult, setGeneratedResult] = useState<ArchitectApiResult | null>(null);
  const [previewSong, setPreviewSong] = useState<SongProject | null>(null);
  const [bandDensity, setBandDensity] = useState<BandDensityLevel>('balanced');

  const recorderRef = useRef<MicRecorder | null>(null);
  const humTimerRef = useRef<number | null>(null);
  const humStartMsRef = useRef<number>(0);
  const humFinishingRef = useRef<boolean>(false);
  const humPlaybackRef = useRef<HTMLAudioElement | null>(null);

  const clearHumTimer = useCallback(() => {
    if (humTimerRef.current !== null) {
      window.clearInterval(humTimerRef.current);
      humTimerRef.current = null;
    }
  }, []);

  const stopHumPlayback = useCallback(() => {
    if (humPlaybackRef.current) {
      humPlaybackRef.current.pause();
      humPlaybackRef.current = null;
    }
    setIsPlayingHumClip(false);
  }, []);

  const cancelActiveRecorder = useCallback(() => {
    clearHumTimer();
    if (recorderRef.current) {
      recorderRef.current.cancel();
      recorderRef.current = null;
    }
    humFinishingRef.current = false;
    setIsRecordingHum(false);
    setHumVuLevel(0);
  }, [clearHumTimer]);

  const finishHumRecording = useCallback(async () => {
    if (humFinishingRef.current || !recorderRef.current) return;
    humFinishingRef.current = true;
    clearHumTimer();
    const activeRecorder = recorderRef.current;
    recorderRef.current = null;

    try {
      const recorded = await activeRecorder.stop();
      const commaIdx = recorded.dataUrl.indexOf(',');
      const base64 = commaIdx >= 0 ? recorded.dataUrl.slice(commaIdx + 1) : '';
      const dataUrlMime = recorded.dataUrl.match(/^data:([^;]+)/i)?.[1];
      const resolvedMime =
        recorded.blob.type ||
        dataUrlMime ||
        MicRecorder.getSupportedMimeType() ||
        'audio/webm';
      const cappedDuration = Math.min(MAX_HUM_SECONDS, Math.max(0.5, recorded.durationSec));
      setHumClip({
        dataUrl: recorded.dataUrl,
        base64,
        mimeType: resolvedMime,
        durationSec: cappedDuration,
        sourceName: lang === 'th' ? 'เสียงฮัมจากไมโครโฟน' : 'Microphone Hum Capture',
      });
      setShowHumCostConfirm(false);
    } catch {
      setErrorMsg(
        lang === 'th'
          ? 'ไม่สามารถบันทึกเสียงฮัมได้ กรุณาลองใหม่อีกครั้ง'
          : 'Could not finalize microphone recording.'
      );
    } finally {
      humFinishingRef.current = false;
      setIsRecordingHum(false);
      setHumVuLevel(0);
    }
  }, [clearHumTimer, lang]);

  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      setHumSupported(MicRecorder.isSupported());
    });
    return () => {
      cancelAnimationFrame(rafId);
      if (humTimerRef.current !== null) {
        window.clearInterval(humTimerRef.current);
        humTimerRef.current = null;
      }
      recorderRef.current?.cancel();
      recorderRef.current = null;
      humPlaybackRef.current?.pause();
      humPlaybackRef.current = null;
    };
  }, []);

  if (!isOpen) return null;

  const currentBalance = Math.max(0, creditBalance ?? getCreditBalance());

  const handleRequestGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!topic.trim()) {
      setErrorMsg(
        lang === 'th'
          ? 'กรุณาเล่าไอเดียหรือเรื่องราวของเพลงสั้นๆ อย่างน้อย 1 ประโยคครับ'
          : 'Please enter a short 1-sentence song idea first.'
      );
      return;
    }
    if (!canAfford(EASY_WHOLE_SONG_COST)) {
      setShowCostConfirm(false);
      setErrorMsg(
        lang === 'th'
          ? `เครดิตไม่เพียงพอ (ต้องใช้ ${EASY_WHOLE_SONG_COST} เหรียญ) กรุณาเติมเครดิตก่อนครับ`
          : `Insufficient credits (requires ${EASY_WHOLE_SONG_COST} credits). Please top up in Wallet.`
      );
      return;
    }
    setShowCostConfirm(true);
  };

  const handleConfirmGenerate = async () => {
    setShowCostConfirm(false);
    if (!canAfford(EASY_WHOLE_SONG_COST)) {
      setErrorMsg(lang === 'th' ? 'เครดิตไม่เพียงพอ' : 'Insufficient credits');
      return;
    }

    setIsGenerating(true);
    setErrorMsg(null);
    try {
      const { res, data } = await postEasyApiJson('/api/advance/architect', {
        stylePreset,
        vocalProfile,
        tempoFeel,
        topic: topic.trim(),
        language: songLanguage,
        thaiGenre: getPresetConfig(stylePreset).thaiGenre,
        lyricEra,
        lyricDialect,
        songwriterStyle,
        emotionalResolution,
      });

      if (!res.ok || !data?.song) {
        if (data?.wallet) {
          const synced = applyServerWalletSnapshot(data.wallet);
          onCreditsChange(synced.balance);
        }
        setErrorMsg(formatEasyApiFailureMessage(res.status, data?.error, 'architect', lang));
        return;
      }

      if (data.wallet) {
        const synced = applyServerWalletSnapshot(data.wallet);
        onCreditsChange(synced.balance);
      } else if (!data.isSimulated) {
        const deduction = deductCredits(
          EASY_WHOLE_SONG_COST,
          `Easy Mode Architect (${data.model}): ${topic.trim().slice(0, 24)}`
        );
        if (deduction.success) {
          onCreditsChange(deduction.balance);
        }
      }

      setGeneratedResult(data);
      setPreviewSong(data.song);
      setTranscribedLyricsPreview('');
      setConfidenceNotePreview('');
      setBandDensity('balanced');
    } catch {
      setErrorMsg(formatEasyApiFailureMessage(null, undefined, 'architect', lang));
    } finally {
      setIsGenerating(false);
    }
  };

  // Phase 5C: Start recording user's hum / vocal guide (up to 45 seconds)
  const handleStartHumRecording = async () => {
    setErrorMsg(null);
    stopHumPlayback();
    setShowHumCostConfirm(false);
    setHumClip(null);
    setHumElapsedSec(0);

    try {
      const recorder = new MicRecorder();
      recorderRef.current = recorder;
      await recorder.start((vol) => setHumVuLevel(vol));
      humStartMsRef.current = Date.now();
      setIsRecordingHum(true);

      clearHumTimer();
      humTimerRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - humStartMsRef.current) / 1000;
        setHumElapsedSec(Math.min(MAX_HUM_SECONDS, elapsed));
        if (elapsed >= MAX_HUM_SECONDS) {
          void finishHumRecording();
        }
      }, 200);
    } catch (err) {
      cancelActiveRecorder();
      setErrorMsg(
        err instanceof Error
          ? err.message
          : lang === 'th'
            ? 'กรุณาอนุญาตการใช้งานไมโครโฟน หรือเลือกอัปโหลดไฟล์เสียงแทนครับ'
            : 'Microphone permission denied or unavailable. You can upload an audio clip instead.'
      );
    }
  };

  // Phase 5C: Upload short hum/singing clip (<= 45 sec, <= 8 MB)
  const handleUploadHumFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setErrorMsg(null);
    stopHumPlayback();
    cancelActiveRecorder();
    setShowHumCostConfirm(false);

    if (file.size > MAX_HUM_BYTES) {
      setErrorMsg(
        lang === 'th'
          ? 'ไฟล์เสียงมีขนาดเกิน 8 MB กรุณาตัดให้สั้นลงไม่เกิน 45 วินาทีครับ'
          : 'Audio file exceeds 8 MB limit. Please keep clips under 45 seconds.'
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = dataUrl.indexOf(',');
      if (!dataUrl || commaIdx < 0) {
        setErrorMsg(lang === 'th' ? 'อ่านไฟล์เสียงไม่สำเร็จ' : 'Could not read audio file');
        return;
      }

      const probe = new Audio(dataUrl);
      const handleLoaded = () => {
        const duration = Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : 12;
        if (duration > MAX_HUM_SECONDS) {
          setErrorMsg(
            lang === 'th'
              ? `คลิปเสียงยาว ${duration.toFixed(1)} วินาที (เกินกำหนดสูงสุด ${MAX_HUM_SECONDS} วินาที)`
              : `Audio clip is ${duration.toFixed(1)}s long (max ${MAX_HUM_SECONDS}s allowed).`
          );
          return;
        }
        setHumClip({
          dataUrl,
          base64: dataUrl.slice(commaIdx + 1),
          mimeType: file.type || 'audio/mp3',
          durationSec: duration,
          sourceName: file.name,
        });
      };

      probe.onloadedmetadata = handleLoaded;
      probe.onerror = () => {
        setErrorMsg(
          lang === 'th'
            ? 'ไม่สามารถตรวจความยาวไฟล์เสียงได้ กรุณาใช้ไฟล์ .mp3, .wav, .m4a หรือ .webm'
            : 'Unsupported audio format. Please upload .mp3, .wav, .m4a, or .webm.'
        );
      };
    };
    reader.readAsDataURL(file);
  };

  const handleToggleHumPlayback = () => {
    if (!humClip) return;
    if (isPlayingHumClip) {
      stopHumPlayback();
      return;
    }
    setIsPlayingHumClip(true);
    humPlaybackRef.current = playAudioDataUrl(humClip.dataUrl, {
      onEnd: () => setIsPlayingHumClip(false),
    });
  };

  const handleRequestHumSubmit = () => {
    setErrorMsg(null);
    if (!humClip) {
      setErrorMsg(
        lang === 'th'
          ? 'กรุณาฮัมทำนอง 10–45 วิ หรือเลือกไฟล์เสียงสั้นๆ ก่อนครับ'
          : 'Please record a 10–45s hum or upload a short audio clip first.'
      );
      return;
    }
    if (!canAfford(EASY_HUM_SONG_COST)) {
      setShowHumCostConfirm(false);
      setErrorMsg(
        lang === 'th'
          ? `เครดิตไม่เพียงพอ (ต้องใช้ ${EASY_HUM_SONG_COST} เหรียญ) กรุณาเติมเครดิตก่อนครับ`
          : `Insufficient credits (requires ${EASY_HUM_SONG_COST} credits). Please top up in Wallet.`
      );
      return;
    }
    setShowHumCostConfirm(true);
  };

  const handleConfirmHumSubmit = async () => {
    setShowHumCostConfirm(false);
    if (!humClip || !canAfford(EASY_HUM_SONG_COST)) {
      setErrorMsg(lang === 'th' ? 'เครดิตไม่เพียงพอ' : 'Insufficient credits');
      return;
    }

    stopHumPlayback();
    setIsGenerating(true);
    setErrorMsg(null);

    try {
      const { res, data } = await postEasyApiJson('/api/advance/hum-to-song', {
        audioBase64: humClip.base64,
        mimeType: humClip.mimeType,
        durationSec: Math.min(MAX_HUM_SECONDS, Math.max(1, humClip.durationSec)),
        stylePreset,
        vocalProfile,
        language: songLanguage,
        includeTranscribePass,
      });

      if (!res.ok || !data?.song) {
        if (data?.wallet) {
          const synced = applyServerWalletSnapshot(data.wallet);
          onCreditsChange(synced.balance);
        }
        setErrorMsg(formatEasyApiFailureMessage(res.status, data?.error, 'hum', lang));
        return;
      }

      if (data.wallet) {
        const synced = applyServerWalletSnapshot(data.wallet);
        onCreditsChange(synced.balance);
      } else if (!data.isSimulated) {
        const deduction = deductCredits(
          EASY_HUM_SONG_COST,
          `Hum-to-Song (${data.model}): ${humClip.durationSec.toFixed(1)}s`
        );
        if (deduction.success) {
          onCreditsChange(deduction.balance);
        }
      }

      setTranscribedLyricsPreview(data.transcribedLyrics || '');
      setConfidenceNotePreview(data.confidenceNote || '');
      setGeneratedResult(data);
      setPreviewSong(data.song);
      setBandDensity('balanced');
    } catch {
      setErrorMsg(formatEasyApiFailureMessage(null, undefined, 'hum', lang));
    } finally {
      setIsGenerating(false);
    }
  };

  const updatePreviewSong = (updater: (prev: SongProject) => SongProject) => {
    setPreviewSong((prev) => {
      if (!prev) return prev;
      return updater(prev);
    });
  };

  const handleChangeDensity = (nextDensity: BandDensityLevel) => {
    setBandDensity(nextDensity);
    updatePreviewSong((prev) => applyBandDensityToSong(prev, nextDensity));
  };

  const handleCloseModal = () => {
    cancelActiveRecorder();
    stopHumPlayback();
    onStopAudio();
    onClose();
  };

  const displayedKey = previewSong
    ? transposeChord(previewSong.baseKey, previewSong.transposeSemitones)
    : 'C';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-surface-1 rounded-3xl border border-hairline shadow-e3 max-w-2xl w-full p-4 sm:p-6 flex flex-col max-h-[92vh] space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-hairline pb-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-base sm:text-lg text-ink-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-accent-text shrink-0" />
                <span>{lang === 'th' ? 'Easy Mode — เสกโครงเพลงทั้งเพลง' : 'Easy Mode — 1-Click Song Starter'}</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  onStopAudio();
                  onClose();
                  onOpenWallet();
                }}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-950 font-bold text-xs cursor-pointer transition"
              >
                <Coins className="w-3 h-3" />
                <span>{currentBalance} Credits</span>
              </button>
            </div>
            <p className="text-xs text-ink-400 mt-0.5">
              {lang === 'th'
                ? 'เลือกแนวเพลง โทนเสียงร้อง และเล่าไอเดีย 1 ประโยค AI จะจัดคอร์ด เนื้อร้อง เมโลดี้ และวงดนตรีให้ฟังทันที'
                : 'Pick mood, vocal range, and 1-sentence story — AI generates full chords, lyrics, guide melody, and band mix.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCloseModal}
            aria-label="Close Easy Mode"
            className="w-8 h-8 rounded-full bg-surface-2 hover:bg-surface-3 text-ink-700 flex items-center justify-center cursor-pointer shrink-0 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-4">
          {!previewSong || !generatedResult ? (
            /* ─── STAGE 1: EASY MODE TABS (IDEA 4-CR vs HUM-TO-SONG 3-CR) ─── */
            <div className="space-y-4">
              {/* Segmented Tabs: Text Idea vs Hum Capture */}
              <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-surface-2 border border-hairline">
                <button
                  type="button"
                  onClick={() => {
                    cancelActiveRecorder();
                    stopHumPlayback();
                    setErrorMsg(null);
                    setShowHumCostConfirm(false);
                    setStarterTab('idea');
                  }}
                  className={`py-2 px-3 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    starterTab === 'idea'
                      ? 'bg-accent-500 text-white shadow-2xs'
                      : 'text-ink-700 hover:bg-surface-1'
                  }`}
                >
                  <span>{t.easyTabIdea}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setShowCostConfirm(false);
                    setStarterTab('hum');
                  }}
                  className={`py-2 px-3 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    starterTab === 'hum'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-ink-700 hover:bg-surface-1'
                  }`}
                >
                  <span>{t.easyTabHum}</span>
                </button>
              </div>

              {/* Shared Step 1: Style Preset */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-ink-900 flex items-center gap-1.5">
                  <Music2 className="w-3.5 h-3.5 text-accent-text" />
                  <span>{lang === 'th' ? '1. เลือกสไตล์เพลง (Style Vibe)' : '1. Pick Style Preset'}</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {EASY_STYLE_PRESETS.map((preset) => {
                    const selected = stylePreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setStylePreset(preset.id)}
                        className={`p-3 rounded-2xl border text-left transition cursor-pointer ${
                          selected
                            ? 'bg-accent-50 border-accent-500 ring-1 ring-accent-500'
                            : 'bg-surface-2/60 border-hairline hover:border-accent-200'
                        }`}
                      >
                        <div className="font-bold text-xs sm:text-sm text-ink-900">
                          {lang === 'th' ? preset.nameTh : preset.nameEn}
                        </div>
                        <div className="text-[11px] text-ink-400 mt-0.5 line-clamp-2">
                          {lang === 'th' ? preset.descTh : preset.descEn}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Shared Step 2: Vocal Range & Language (+ Tempo Feel on Idea Tab) */}
              <div className={`grid grid-cols-1 ${starterTab === 'idea' ? 'sm:grid-cols-2' : ''} gap-3`}>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-ink-900 flex items-center gap-1.5">
                    <Mic2 className="w-3.5 h-3.5 text-accent-text" />
                    <span>{lang === 'th' ? '2. คีย์เสียงร้อง & ภาษา' : '2. Vocal Range & Language'}</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { id: 'female' as const, label: lang === 'th' ? 'เสียงผู้หญิง' : 'Female' },
                      { id: 'male' as const, label: lang === 'th' ? 'เสียงผู้ชาย' : 'Male' },
                      { id: 'neutral' as const, label: lang === 'th' ? 'กลาง / คู่' : 'Neutral' },
                    ].map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setVocalProfile(v.id)}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                          vocalProfile === v.id
                            ? 'bg-accent-500 text-white border-accent-500'
                            : 'bg-surface-2 text-ink-700 border-hairline hover:border-accent-200'
                        }`}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1.5 pt-1">
                    {[
                      { id: 'th' as const, label: '🇹🇭 เนื้อไทย' },
                      { id: 'en' as const, label: '🇬🇧 English' },
                    ].map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => setSongLanguage(l.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                          songLanguage === l.id
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-surface-2 text-ink-700 border-hairline'
                        }`}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>

                {starterTab === 'idea' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-ink-900 block">
                      {lang === 'th' ? 'ความเร็วเพลง (Tempo Feel)' : 'Tempo Feel'}
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { id: 'slow' as const, label: lang === 'th' ? 'ช้าซึ้ง (~72)' : 'Slow' },
                        { id: 'medium' as const, label: lang === 'th' ? 'กลาง (~90)' : 'Medium' },
                        { id: 'fast' as const, label: lang === 'th' ? 'เร็วสนุก (~116)' : 'Upbeat' },
                      ].map((tf) => (
                        <button
                          key={tf.id}
                          type="button"
                          onClick={() => setTempoFeel(tf.id)}
                          className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                            tempoFeel === tf.id
                              ? 'bg-accent-500 text-white border-accent-500'
                              : 'bg-surface-2 text-ink-700 border-hairline hover:border-accent-200'
                          }`}
                        >
                          {tf.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {starterTab === 'idea' ? (
                <form onSubmit={handleRequestGenerate} className="space-y-4">
                  {/* Phase 6: Thai Dialect, Songwriter Inspiration, Era & Hook/Ending Feel */}
                  {songLanguage === 'th' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 rounded-2xl bg-indigo-50/60 border border-indigo-200/70">
                      <label htmlFor="easy-lyric-dialect" className="space-y-1 text-[11px] font-bold text-indigo-950 block">
                        <span>{lang === 'th' ? 'สำเนียง / ภาษาถิ่น' : 'Thai Dialect'}</span>
                        <select
                          id="easy-lyric-dialect"
                          name="lyricDialect"
                          value={lyricDialect}
                          onChange={(e) => setLyricDialect(e.target.value as ThaiLyricDialect)}
                          className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-indigo-200 text-xs font-semibold text-ink-900 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
                        >
                          {THAI_DIALECT_PROFILES.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label htmlFor="easy-songwriter-style" className="space-y-1 text-[11px] font-bold text-indigo-950 block">
                        <span>{lang === 'th' ? 'กลิ่นอายนักแต่งเพลง' : 'Lyricist Vibe'}</span>
                        <select
                          id="easy-songwriter-style"
                          name="songwriterStyle"
                          value={songwriterStyle}
                          onChange={(e) => {
                            const nextVal = e.target.value as ThaiSongwriterStyle;
                            setSongwriterStyle(nextVal);
                            if (nextVal !== 'none') {
                              trackUsageEvent({
                                eventName: 'select_songwriter_style',
                                category: 'style',
                                songwriterStyle: nextVal,
                                thaiGenre: getPresetConfig(stylePreset).thaiGenre,
                                lyricDialect,
                                lyricEra,
                                emotionalResolution,
                                featureVariant: 'easy_mode',
                              });
                            }
                          }}
                          className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-indigo-200 text-xs font-semibold text-ink-900 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
                        >
                          {SONGWRITER_STYLE_PROFILES.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label htmlFor="easy-lyric-era" className="space-y-1 text-[11px] font-bold text-indigo-950 block">
                        <span>{lang === 'th' ? 'ยุคสมัยของเพลง' : 'Era'}</span>
                        <select
                          id="easy-lyric-era"
                          name="lyricEra"
                          value={lyricEra}
                          onChange={(e) => setLyricEra(e.target.value as ThaiLyricEra)}
                          className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-indigo-200 text-xs font-semibold text-ink-900 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
                        >
                          {THAI_ERA_PROFILES.map((er) => (
                            <option key={er.id} value={er.id}>
                              {er.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label htmlFor="easy-emotional-resolution" className="space-y-1 text-[11px] font-bold text-indigo-950 block">
                        <span>{lang === 'th' ? 'ทิศทางฮุค & ท่อนจบ' : 'Hook & Ending Feel'}</span>
                        <select
                          id="easy-emotional-resolution"
                          name="emotionalResolution"
                          value={emotionalResolution}
                          onChange={(e) =>
                            setEmotionalResolution(e.target.value as ThaiEmotionalResolution)
                          }
                          className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-indigo-200 text-xs font-semibold text-ink-900 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
                        >
                          {EMOTIONAL_RESOLUTION_PROFILES.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}

                  {/* Step 3: 1-Sentence Idea */}
                  <div className="space-y-1.5">
                    <label htmlFor="easy-song-topic" className="text-xs font-bold text-ink-900 block">
                      {lang === 'th' ? '3. เล่าไอเดียเพลงสั้นๆ (1 ประโยค):' : '3. Describe your song idea (1 sentence):'}
                    </label>
                    <textarea
                      id="easy-song-topic"
                      name="songTopic"
                      rows={2}
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder={
                        lang === 'th'
                          ? 'เช่น นั่งจิบกาแฟริมหน้าต่างตอนฝนตกแล้วคิดถึงคนรักเก่า...'
                          : 'e.g., Drinking morning coffee by a rainy window thinking of a fresh start...'
                      }
                      className="w-full px-3.5 py-2.5 rounded-2xl border border-hairline bg-surface-2/60 text-sm text-ink-900 focus:outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                    />
                  </div>

                  {errorMsg && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center justify-between gap-2">
                      <span>{errorMsg}</span>
                      {!canAfford(EASY_WHOLE_SONG_COST) && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenWallet();
                          }}
                          className="px-2.5 py-1 rounded-lg bg-amber-500 text-white text-[11px] font-black cursor-pointer shrink-0"
                        >
                          {lang === 'th' ? 'เติมเครดิต' : 'Top Up'}
                        </button>
                      )}
                    </div>
                  )}

                  {showCostConfirm ? (
                    <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 space-y-2.5 animate-in fade-in">
                      <div className="flex items-center justify-between text-xs font-black text-amber-950 flex-wrap gap-1.5">
                        <span className="flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-amber-700" />
                          {lang === 'th' ? 'ยืนยันสร้างเพลงเต็มด้วย AI' : 'Confirm Full-Song AI Generation'}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-200 text-amber-950">
                          ใช้ {EASY_WHOLE_SONG_COST} เหรียญ / {EASY_WHOLE_SONG_COST} Credits
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-900">
                        {lang === 'th'
                          ? `เรียกใช้ Gemini 3.8 Flash เสก 5 ท่อน (คอร์ด + เนื้อเพลงมีสัมผัส + เมโลดี้ไกด์ + มิกซ์) คงเหลือหลังใช้ ${currentBalance - EASY_WHOLE_SONG_COST} Credits (ตัดเฉพาะเมื่อผลลัพธ์ไม่จำลอง)`
                          : `Calls Gemini 3.8 Flash to compose a complete 5-section song (${currentBalance - EASY_WHOLE_SONG_COST} credits remaining on live success).`}
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleConfirmGenerate}
                          disabled={isGenerating}
                          className="flex-1 py-2.5 rounded-xl bg-accent-500 hover:bg-accent-hover text-white font-black text-xs cursor-pointer transition"
                        >
                          ✓ {lang === 'th' ? `ยืนยันเสกทั้งเพลง (${EASY_WHOLE_SONG_COST} เหรียญ)` : `Generate (${EASY_WHOLE_SONG_COST} Credits)`}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowCostConfirm(false)}
                          className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                        >
                          {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="submit"
                      disabled={isGenerating}
                      className="w-full py-3 px-4 rounded-2xl bg-accent-500 hover:bg-accent-hover disabled:opacity-60 text-white font-bold text-sm shadow-e1 transition cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>
                        {isGenerating
                          ? lang === 'th'
                            ? 'กำลังแต่งทั้งเพลง + เช็กสัมผัสไทย...'
                            : 'Composing full song...'
                          : lang === 'th'
                            ? `✨ เสกทั้งเพลง (ใช้ ${EASY_WHOLE_SONG_COST} เหรียญ)`
                            : `✨ Generate Full Song (${EASY_WHOLE_SONG_COST} Credits)`}
                      </span>
                    </button>
                  )}
                </form>
              ) : (
                /* ─── PHASE 5C: HUM-TO-SONG CAPTURE PANEL (<= 45s, 3 CREDITS) ─── */
                <div className="space-y-3">
                  <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-200 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <div className="text-xs font-bold text-emerald-950">
                          {lang === 'th'
                            ? '3. ฮัมทำนองหรือร้องไกด์สั้นๆ (10–45 วินาที)'
                            : '3. Hum a melody or short vocal guide (10–45s)'}
                        </div>
                        <p className="text-[11px] text-emerald-800/80 mt-0.5">
                          {lang === 'th'
                            ? 'AI จะจับ BPM, คีย์, ทางคอร์ดที่จับง่าย และวางโน้ตไกด์ลง Piano Roll ให้อัตโนมัติ'
                            : 'AI infers BPM, musical key, acoustic chords, and Piano Roll guide notes automatically.'}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-white border border-emerald-200 font-mono-tabular text-[11px] font-bold text-emerald-800">
                        {isRecordingHum
                          ? `${humElapsedSec.toFixed(1)}s / ${MAX_HUM_SECONDS}s`
                          : humClip
                            ? `${humClip.durationSec.toFixed(1)}s`
                            : `Max ${MAX_HUM_SECONDS}s`}
                      </span>
                    </div>

                    {/* Mic Recorder & File Upload Row */}
                    <div className="flex flex-wrap items-center gap-2">
                      {!isRecordingHum ? (
                        <button
                          type="button"
                          disabled={!humSupported || isGenerating}
                          onClick={handleStartHumRecording}
                          className="flex-1 min-w-[160px] py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition shadow-2xs"
                        >
                          <Mic2 className="w-4 h-4" />
                          <span>{t.humRecordBtn}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void finishHumRecording()}
                          className="flex-1 min-w-[160px] py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition animate-pulse"
                        >
                          <Square className="w-4 h-4" />
                          <span>{t.humStopBtn} ({Math.max(0, MAX_HUM_SECONDS - Math.floor(humElapsedSec))}s)</span>
                        </button>
                      )}

                      <label className="px-3 py-2.5 rounded-xl bg-white hover:bg-emerald-100/70 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{lang === 'th' ? 'อัปโหลดไฟล์ (≤45 วิ)' : 'Upload Audio (≤45s)'}</span>
                        <input
                          type="file"
                          accept="audio/*"
                          onChange={handleUploadHumFile}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {/* VU Meter during recording */}
                    {isRecordingHum && (
                      <div className="space-y-1">
                        <div className="h-2 w-full rounded-full bg-emerald-200/70 overflow-hidden">
                          <div
                            className="h-full bg-emerald-600 transition-all duration-75"
                            style={{ width: `${Math.max(6, Math.min(100, Math.round(humVuLevel)))}%` }}
                          />
                        </div>
                        <div className="text-[10px] font-medium text-emerald-800">
                          {lang === 'th' ? 'กำลังอัดเสียงฮัม... จะหยุดอัตโนมัติที่ 45 วินาที' : 'Recording hum... auto-stops cleanly at 45s.'}
                        </div>
                      </div>
                    )}

                    {/* Recorded / Uploaded Clip Preview */}
                    {humClip && !isRecordingHum && (
                      <div className="p-2.5 rounded-xl bg-white border border-emerald-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <div className="font-bold text-ink-900 truncate">
                            🎵 {humClip.sourceName || 'Hum Clip'}
                          </div>
                          <div className="text-[11px] text-ink-400">
                            {humClip.durationSec.toFixed(1)}s · {humClip.mimeType}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={handleToggleHumPlayback}
                            className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold flex items-center gap-1 cursor-pointer"
                          >
                            {isPlayingHumClip ? <Square className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                            <span>
                              {isPlayingHumClip
                                ? lang === 'th' ? 'หยุด' : 'Stop'
                                : lang === 'th' ? 'ฟังเสียงฮัม' : 'Preview'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              stopHumPlayback();
                              setHumClip(null);
                              setShowHumCostConfirm(false);
                            }}
                            className="px-2 py-1 rounded-lg border border-slate-200 text-slate-600 hover:text-rose-600 font-bold cursor-pointer"
                          >
                            {lang === 'th' ? 'ล้าง' : 'Clear'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Optional Thai Transcribe Pre-Pass Toggle */}
                    <label className="flex items-center gap-2 text-[11px] text-emerald-950 font-medium cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={includeTranscribePass}
                        onChange={(e) => setIncludeTranscribePass(e.target.checked)}
                        className="rounded border-emerald-400 accent-emerald-600"
                      />
                      <span>
                        {lang === 'th'
                          ? 'เปิดใช้ gemini-3.5-transcribe ช่วยถอดคำร้องไทยก่อนเรียบเรียง (ถ้ามีคำร้องปนในฮัม)'
                          : 'Run gemini-3.5-transcribe pre-pass when singing rough lyrics inside your hum'}
                      </span>
                    </label>
                  </div>

                  {errorMsg && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center justify-between gap-2">
                      <span>{errorMsg}</span>
                      {!canAfford(EASY_HUM_SONG_COST) && (
                        <button
                          type="button"
                          onClick={() => {
                            handleCloseModal();
                            onOpenWallet();
                          }}
                          className="px-2.5 py-1 rounded-lg bg-amber-500 text-white text-[11px] font-black cursor-pointer shrink-0"
                        >
                          {lang === 'th' ? 'เติมเครดิต' : 'Top Up'}
                        </button>
                      )}
                    </div>
                  )}

                  {showHumCostConfirm ? (
                    <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 space-y-2.5 animate-in fade-in">
                      <div className="flex items-center justify-between text-xs font-black text-amber-950 flex-wrap gap-1.5">
                        <span className="flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-amber-700" />
                          {lang === 'th' ? 'ยืนยันแกะเสียงฮัมเป็นโครงเพลง' : 'Confirm Hum-to-Song Transcription'}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-200 text-amber-950">
                          ใช้ {EASY_HUM_SONG_COST} เหรียญ / {EASY_HUM_SONG_COST} Credits
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-900">
                        {lang === 'th'
                          ? `ส่งคลิปฮัม (${humClip?.durationSec.toFixed(1) ?? '0'} วิ) ให้ Gemini 3.8 Flash ถอด BPM, คีย์, คอร์ด และโน้ตไกด์ คงเหลือหลังใช้ ${currentBalance - EASY_HUM_SONG_COST} Credits (ไม่คิดเงินหากจำลอง)`
                          : `Analyzes your ${humClip?.durationSec.toFixed(1) ?? '0'}s clip with Gemini 3.8 Flash (${currentBalance - EASY_HUM_SONG_COST} credits left on live success).`}
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleConfirmHumSubmit}
                          disabled={isGenerating}
                          className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs cursor-pointer transition"
                        >
                          ✓ {lang === 'th' ? `ยืนยันแกะฮัม (${EASY_HUM_SONG_COST} เหรียญ)` : `Transcribe (${EASY_HUM_SONG_COST} Credits)`}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowHumCostConfirm(false)}
                          className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                        >
                          {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={isGenerating || isRecordingHum || !humClip}
                      onClick={handleRequestHumSubmit}
                      className="w-full py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold text-sm shadow-e1 transition cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Mic2 className="w-4 h-4" />
                      <span>
                        {isGenerating
                          ? lang === 'th'
                            ? 'กำลังแกะโน้ตฮัมและจัดโครงเพลง...'
                            : 'Transcribing hum into demo...'
                          : t.humSubmitBtn}
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* ─── STAGE 2: EASY PREVIEW CARD (3-KNOB CONTROLS @ 0 CREDITS) ─── */
            <div className="space-y-4 animate-in fade-in">
              <div className="p-4 rounded-2xl bg-surface-2/80 border border-hairline space-y-3">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <div className="text-sm sm:text-base font-bold text-ink-900">{previewSong.title}</div>
                    <div className="text-xs text-ink-400 mt-0.5">
                      {previewSong.sections.length} {lang === 'th' ? 'ท่อน' : 'sections'} · Key {displayedKey}
                      {previewSong.capoFret > 0 ? ` (Capo ${previewSong.capoFret})` : ''} · {previewSong.bpm} BPM · {previewSong.guitarModel}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full bg-surface-1 border border-hairline text-[10px] font-bold text-ink-700">
                      {generatedResult.model}
                    </span>
                    {generatedResult.isSimulated ? (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                        Simulation (0 เครดิต)
                      </span>
                    ) : (
                      typeof generatedResult.usage?.totalTokens === 'number' && (
                        <span className="px-2 py-0.5 rounded-full bg-accent-50 text-accent-text text-[10px] font-bold">
                          {generatedResult.usage.totalTokens} tokens
                        </span>
                      )
                    )}
                  </div>
                </div>

                {/* Live Audio Preview Button */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onPreviewAudioToggle(previewSong)}
                    className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer ${
                      isPlaying
                        ? 'bg-rose-600 hover:bg-rose-700 text-white'
                        : 'bg-slate-900 hover:bg-slate-800 text-white'
                    }`}
                  >
                    {isPlaying ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    <span>
                      {isPlaying
                        ? lang === 'th' ? 'หยุดพรีวิวเดโม' : 'Stop Demo Preview'
                        : lang === 'th' ? '▶ ฟังเดโมทั้งเพลง' : '▶ Listen to Demo'}
                    </span>
                  </button>
                </div>

                {(transcribedLyricsPreview || confidenceNotePreview) && (
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] space-y-1">
                    {confidenceNotePreview && (
                      <div className="font-bold text-emerald-900">🎙️ {confidenceNotePreview}</div>
                    )}
                    {transcribedLyricsPreview && (
                      <div className="text-emerald-800">
                        {lang === 'th' ? 'คำ/ทำนองที่ถอดได้:' : 'Transcribed:'} &ldquo;{transcribedLyricsPreview}&rdquo;
                      </div>
                    )}
                  </div>
                )}

                {/* Section Lyrics Quick Glance */}
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 pt-1">
                  {previewSong.sections.map((sec) => {
                    const snippet = sec.bars.map((b) => b.lyrics).filter(Boolean).slice(0, 2).join(' / ');
                    const chordsStr = sec.bars.map((b) => b.chords[0]).join(' ');
                    return (
                      <div key={sec.id} className="px-2.5 py-1.5 rounded-xl bg-surface-1 border border-hairline text-[11px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-ink-900">{sec.name}</span>
                          <span className="font-mono-tabular text-accent-text font-semibold">{chordsStr}</span>
                        </div>
                        {snippet && <div className="text-ink-400 truncate mt-0.5">{snippet}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3 Easy Streamlined Knobs (0 Credits) */}
              <div className="p-4 rounded-2xl bg-surface-1 border border-hairline space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-ink-900">
                  <span>{lang === 'th' ? '🎛️ ปรับ 3 จุดแบบง่าย (ฟรี 0 เครดิต)' : '🎛️ 3-Knob Quick Fine-Tune (0 Credits)'}</span>
                  <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {generatedResult.rhymeValidation?.polished
                      ? lang === 'th' ? 'คัดสัมผัสไทยแล้ว' : 'Rhyme Polished'
                      : lang === 'th' ? 'พร้อมฟัง' : 'Ready'}
                  </span>
                </div>

                {/* Knob 1: Vocal Key Fit (Transpose / Capo) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-ink-400 block">
                      {lang === 'th' ? `1. คีย์ร้อง (${displayedKey})` : `1. Vocal Key Fit (${displayedKey})`}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          updatePreviewSong((s) => ({
                            ...s,
                            transposeSemitones: Math.max(-6, s.transposeSemitones - 1),
                          }))
                        }
                        className="px-2.5 py-1 rounded-lg bg-surface-2 border border-hairline font-bold cursor-pointer"
                      >
                        -1
                      </button>
                      <span className="px-2 font-mono-tabular font-bold text-ink-900">
                        {previewSong.transposeSemitones > 0
                          ? `+${previewSong.transposeSemitones}`
                          : previewSong.transposeSemitones}{' '}
                        st
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updatePreviewSong((s) => ({
                            ...s,
                            transposeSemitones: Math.min(6, s.transposeSemitones + 1),
                          }))
                        }
                        className="px-2.5 py-1 rounded-lg bg-surface-2 border border-hairline font-bold cursor-pointer"
                      >
                        +1
                      </button>
                      <select
                        id="easy-preview-capo"
                        name="previewCapoFret"
                        value={previewSong.capoFret}
                        onChange={(e) =>
                          updatePreviewSong((s) => ({
                            ...s,
                            capoFret: Number(e.target.value) || 0,
                          }))
                        }
                        aria-label="Capo Fret"
                        className="ml-auto px-2 py-1 rounded-lg bg-surface-2 border border-hairline text-xs font-semibold cursor-pointer"
                      >
                        {[0, 1, 2, 3, 4, 5].map((f) => (
                          <option key={f} value={f}>
                            Capo {f}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Knob 3: Tempo Slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-semibold text-ink-400">
                      <label htmlFor="easy-preview-bpm">{lang === 'th' ? '3. ความเร็ว (Tempo)' : '3. Tempo'}</label>
                      <span className="font-mono-tabular text-ink-900 font-bold">{previewSong.bpm} BPM</span>
                    </div>
                    <input
                      id="easy-preview-bpm"
                      name="previewBpm"
                      type="range"
                      min={55}
                      max={150}
                      value={previewSong.bpm}
                      onChange={(e) =>
                        updatePreviewSong((s) => ({ ...s, bpm: Number(e.target.value) }))
                      }
                      className="w-full accent-accent-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Knob 2: Band Density */}
                <div className="space-y-1.5 text-xs">
                  <span className="text-[11px] font-semibold text-ink-400 block">
                    {lang === 'th' ? '2. ความแน่นของวงดนตรี (Band Density)' : '2. Band Density'}
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'unplugged' as const, label: lang === 'th' ? '🎸 โปร่งเดี่ยว' : 'Unplugged' },
                      { id: 'balanced' as const, label: lang === 'th' ? '🎹 วงกำลังดี' : 'Balanced' },
                      { id: 'full' as const, label: lang === 'th' ? '🥁 เต็มวง' : 'Full Band' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleChangeDensity(opt.id)}
                        className={`py-1.5 px-2 rounded-xl border text-xs font-bold transition cursor-pointer ${
                          bandDensity === opt.id
                            ? 'bg-accent-50 border-accent-500 text-accent-text'
                            : 'bg-surface-2 border-hairline text-ink-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-ink-400 px-1">{generatedResult.tip}</div>
            </div>
          )}
        </div>

        {/* Footer CTAs in Preview Stage */}
        {previewSong && generatedResult && (
          <div className="border-t border-hairline pt-3 flex flex-col sm:flex-row gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                onStopAudio();
                setPreviewSong(null);
                setGeneratedResult(null);
                setTranscribedLyricsPreview('');
                setConfidenceNotePreview('');
              }}
              className="px-3.5 py-2.5 rounded-xl border border-hairline bg-surface-2 hover:bg-surface-3 text-ink-700 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{lang === 'th' ? 'สร้างใหม่' : 'Regenerate'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onStopAudio();
                onApplySong(previewSong, 'songwriter');
              }}
              className="flex-1 py-2.5 px-4 rounded-xl bg-accent-500 hover:bg-accent-hover text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition shadow-e1"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>
                {lang === 'th'
                  ? '🎛️ เข้าโหมดปรับละเอียด (Songwriter / Arranger)'
                  : '🎛️ Open in Fine-Tune Studio'}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
