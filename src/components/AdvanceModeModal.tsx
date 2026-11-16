'use client';

import React, { useState, useMemo } from 'react';
import {
  CREDIT_COST_TABLE,
  CREDIT_PACKAGES,
  type CreditPackage,
  type CreditTransaction,
  type WalletBreakdown,
  getCreditBalance,
  getCreditTransactions,
  getWalletBreakdown,
  applyServerWalletSnapshot,
  canAllowDemoTopUp,
  canAfford,
  canUsePaidOnlyModel,
  deductCredits,
  topUpCredits,
} from '@/lib/creditManager';
import {
  GUEST_USER,
  getAuthAccessToken,
  isCloudConfigured,
  signInWithGoogleOAuth,
  type CloudUser,
} from '@/lib/cloudSync';
import { getAnalyticsHeaders, trackUsageEvent } from '@/lib/analytics';
import {
  THAI_RHYME_GROUPS,
  analyzeThaiSyllablePhonetics,
  countThaiEnglishSyllables,
  filterThaiRhymes,
  findThaiRhymes,
  type ThaiToneName,
} from '@/lib/thaiRhymeHelper';
import {
  buildFullDemoMasterPrompt,
  EMOTIONAL_RESOLUTION_PROFILES,
  SECTION_ENERGY_ARC_BLUEPRINTS,
  SONGWRITER_STYLE_PROFILES,
  THAI_DIALECT_PROFILES,
  THAI_ERA_PROFILES,
  THAI_GENRE_PROFILES,
  type FullDemoBlueprintSummary,
} from '@/lib/aiPrompts';
import { useLanguage } from '@/context/LanguageContext';
import type {
  MelodyNote,
  SectionType,
  SongProject,
  ThaiEmotionalResolution,
  ThaiLyricDialect,
  ThaiLyricEra,
  ThaiSongGenre,
  ThaiSongwriterStyle,
} from '@/types/song';
import {
  applyNaturalPromptToSong,
  applyDirectorPatchToSong,
  buildSongDirectorSummary,
  classifyDirectorPromptMode,
  type AiDirectorPatch,
} from '@/lib/aiSongDirector';

import {
  POPULAR_CHORD_FORMULAS,
  resolveChordProgressionFormula,
} from '@/lib/chordUtils';

export interface AdvanceTargetSectionContext {
  sectionId: string;
  sectionName: string;
  sectionType: string;
  chords: string[];
  existingLyrics: string;
}

interface AdvanceModeModalProps {
  targetSection?: AdvanceTargetSectionContext | null;
  song?: SongProject;
  initialMode?: 'quick' | 'deep';
  initialTab?: 'rhyme' | 'ai-lyrics' | 'ai-director' | 'reference' | 'wallet';
  initialTopic?: string;
  cloudUser?: CloudUser;
  onOpenAccountModal?: () => void;
  onCreditsChange: (balance: number) => void;
  onApplyLyrics?: (
    sectionId: string,
    lines: string[],
    melodyNotesPerBar?: MelodyNote[][],
    suggestedChords?: string[],
    selectedBarIndices?: number[]
  ) => void;
  onApplySectionVocalAudio?: (
    sectionId: string,
    barIndex: number,
    audioDataUrl: string
  ) => void;
  onUpdateSongStyleMeta?: (meta: {
    thaiGenre?: ThaiSongGenre;
    lyricEra?: ThaiLyricEra;
    lyricDialect?: ThaiLyricDialect;
    songwriterStyle?: ThaiSongwriterStyle;
    emotionalResolution?: ThaiEmotionalResolution;
  }) => void;
  onApplySongUpdate?: (nextSong: SongProject) => void;
  onClose: () => void;
}

interface GeneratedLyricResult {
  isSimulated: boolean;
  model: string;
  lines: Array<{ chord: string; text: string; syllables: number }>;
  fullLyrics: string;
  tip: string;
  rhymeNotes?: string[];
  suggestedChords?: string[];
  melodyNotesPerBar?: MelodyNote[][];
  usage?: {
    totalTokens?: number;
  };
  failureReason?: string;
}

type AdvanceTab = 'rhyme' | 'ai-lyrics' | 'ai-director' | 'reference' | 'wallet';

const AI_DIRECTOR_PRESETS = [
  'ตั้งความเร็ว 95 bpm คีย์ G ท่อน Intro เกาเบาๆ 60% ท่อน Chorus ลีดแตกหนัก 100% กลองเป็นชุด เบส 80%',
  'อยากได้ฟีล Acoustic อุ่นๆ เหมือนเล่นในร้านกาแฟยามบ่าย ท่อน Chorus ค่อยๆ พุ่งขึ้นกว่า Verse',
  'ใช้กีตาร์สายไนลอน ห้องคอนเสิร์ต (Unplugged Hall) ท่อน Chorus ตีคอร์ดแคมป์ไฟ ลีดหยอดลูกส่งแบบคลีน คอร์ด C G Am F',
];

const MOOD_PRESETS = [
  { id: 'warm', th: 'อบอุ่น (Warm)', en: 'Warm & Cozy' },
  { id: 'nostalgic', th: 'คิดถึง (Nostalgic)', en: 'Nostalgic' },
  { id: 'crush', th: 'แอบรัก (Crush)', en: 'Sweet Crush' },
  { id: 'heartbreak', th: 'อกหัก (Heartbreak)', en: 'Heartbreak' },
  { id: 'hopeful', th: 'ให้กำลังใจ (Hopeful)', en: 'Hopeful' },
];

const AI_LYRICS_COST = CREDIT_COST_TABLE.aiLyricsQuick;
const AI_DIRECTOR_COST = CREDIT_COST_TABLE.aiDirectorComplex;
const AI_REFERENCE_COST = CREDIT_COST_TABLE.aiReferenceTrackLyria;

interface GeneratedReferenceResult {
  isSimulated: boolean;
  model: string;
  promptUsed: string;
  audioDataUrl: string | null;
  mimeType: string | null;
  lyricsOrNotes: string;
  tip: string;
  blueprintSummary?: FullDemoBlueprintSummary;
  failureReason?: string;
}

interface ActivePromptPayOrder {
  orderId: string;
  packageId: string;
  packageName: string;
  amountThb: number;
  creditsToGrant: number;
  promptpayPayload: string;
  qrSvgDataUrl: string;
  receiverName: string;
  maskedReceiver: string;
  expiresAt: string;
}

const MAX_SLIP_BYTES = 4 * 1024 * 1024;
const ALLOWED_SLIP_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

export const AdvanceModeModal: React.FC<AdvanceModeModalProps> = ({
  targetSection,
  song,
  initialMode,
  initialTab,
  initialTopic,
  cloudUser = GUEST_USER,
  onOpenAccountModal,
  onCreditsChange,
  onApplyLyrics,
  onApplySectionVocalAudio,
  onUpdateSongStyleMeta,
  onApplySongUpdate,
  onClose,
}) => {
  const { lang } = useLanguage();
  const [activeTab, setActiveTab] = useState<AdvanceTab>(
    initialTab ?? (targetSection ? 'ai-lyrics' : 'rhyme')
  );
  const [lyricMode, setLyricMode] = useState<'quick' | 'deep'>(initialMode ?? 'quick');
  const activeLyricCost =
    lyricMode === 'deep' ? CREDIT_COST_TABLE.aiSectionDeepMelody : AI_LYRICS_COST;

  // Wallet & PromptPay Auto-Slip State
  const [balance, setBalance] = useState<number>(() => getCreditBalance());
  const [walletBreakdown, setWalletBreakdown] = useState<WalletBreakdown>(() => getWalletBreakdown());
  const [transactions, setTransactions] = useState<CreditTransaction[]>(() => getCreditTransactions());
  const [selectedPromptPayPkg, setSelectedPromptPayPkg] = useState<CreditPackage | null>(null);
  const [activeOrder, setActiveOrder] = useState<ActivePromptPayOrder | null>(null);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreviewUrl, setSlipPreviewUrl] = useState<string | null>(null);
  const [isVerifyingSlip, setIsVerifyingSlip] = useState(false);
  const [slipError, setSlipError] = useState<string | null>(null);
  const [walletFeedback, setWalletFeedback] = useState<string | null>(null);

  const isAuthenticatedUser =
    cloudUser.mode === 'authenticated' && Boolean(getAuthAccessToken());
  const demoTopUpAllowed = canAllowDemoTopUp();

  const syncWalletUi = (overrideBalance?: number) => {
    const breakdown = getWalletBreakdown();
    setWalletBreakdown(breakdown);
    const nextBalance = overrideBalance ?? breakdown.balance;
    setBalance(nextBalance);
    setTransactions(getCreditTransactions());
    onCreditsChange(nextBalance);
  };

  // Thai Rhyme Helper State (0 Credits)
  const [rhymeInput, setRhymeInput] = useState('หัวใจ');
  const [rhymeLivenessFilter, setRhymeLivenessFilter] = useState<'all' | 'live' | 'dead'>('all');
  const [rhymeToneFilter, setRhymeToneFilter] = useState<ThaiToneName | 'all'>('all');
  const [copiedWord, setCopiedWord] = useState<string | null>(null);

  // AI Lyric Co-Pilot State (1 Credit / 2 Credits Deep)
  const [selectedSectionId, setSelectedSectionId] = useState<string>(
    targetSection?.sectionId ?? song?.sections[0]?.id ?? ''
  );
  const [customChords, setCustomChords] = useState<string[] | null>(null);
  const [isEditingChords, setIsEditingChords] = useState<boolean>(false);
  const [customChordsText, setCustomChordsText] = useState<string>('');

  const [mood, setMood] = useState('อบอุ่น (Warm)');
  const [topic, setTopic] = useState(() => {
    if (initialTopic?.trim()) return initialTopic.trim();
    const t = song?.title?.trim() || '';
    if (t && !t.startsWith('New Song') && !t.startsWith('เพลงใหม่')) return t;
    return '';
  });
  const [thaiGenre, setThaiGenre] = useState<ThaiSongGenre>(song?.thaiGenre ?? 'thai-pop');
  const [lyricEra, setLyricEra] = useState<ThaiLyricEra>(song?.lyricEra ?? 'modern-indie');
  const [lyricDialect, setLyricDialect] = useState<ThaiLyricDialect>(
    song?.lyricDialect ?? 'standard'
  );
  const [songwriterStyle, setSongwriterStyle] = useState<ThaiSongwriterStyle>(
    song?.songwriterStyle ?? 'none'
  );
  const [emotionalResolution, setEmotionalResolution] = useState<ThaiEmotionalResolution>(
    song?.emotionalResolution ?? 'auto'
  );
  const [polishExistingDraft, setPolishExistingDraft] = useState(false);
  const [showCostConfirm, setShowCostConfirm] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<GeneratedLyricResult | null>(null);
  const [editableLines, setEditableLines] = useState<string[]>([]);
  const [selectedBars, setSelectedBars] = useState<boolean[]>([]);
  const [applySuggestedChords, setApplySuggestedChords] = useState(false);
  const [aiVocalVoice, setAiVocalVoice] = useState<'Kore' | 'Aoede' | 'Puck' | 'Charon' | 'Fenrir'>('Kore');
  const [singingBarIdx, setSingingBarIdx] = useState<number | null>(null);
  const [barVocalUrls, setBarVocalUrls] = useState<Record<number, string>>({});
  const [vocalDemoNotice, setVocalDemoNotice] = useState<string | null>(null);

  // AI Song Director State (0 Credits Local vs 1 Credit AI Producer)
  const [directorPrompt, setDirectorPrompt] = useState('');
  const [showDirectorCostConfirm, setShowDirectorCostConfirm] = useState(false);
  const [isApplyingDirector, setIsApplyingDirector] = useState(false);
  const [directorActions, setDirectorActions] = useState<string[]>([]);
  const [directorEngineInfo, setDirectorEngineInfo] = useState<{
    model: string;
    isSimulated: boolean;
    tip: string;
    totalTokens?: number;
  } | null>(null);
  const [directorNotice, setDirectorNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // AI Reference Track State (lyria-3.5 · 8 Credits · Paid Credits Only)
  const [refNotes, setRefNotes] = useState('');
  const [refInstrumental, setRefInstrumental] = useState(false);
  const [useFullDemoBlueprint, setUseFullDemoBlueprint] = useState(true);
  const [showRefBlueprintPreview, setShowRefBlueprintPreview] = useState(false);
  const [showRefCostConfirm, setShowRefCostConfirm] = useState(false);
  const [isGeneratingRef, setIsGeneratingRef] = useState(false);
  const [refError, setRefError] = useState<string | null>(null);
  const [refResult, setRefResult] = useState<GeneratedReferenceResult | null>(null);

  const fullDemoBlueprint = song
    ? buildFullDemoMasterPrompt(song, {
        userNotes: refNotes.trim(),
        instrumental: refInstrumental,
        language: lang,
      })
    : null;

  const refPaidGate = canUsePaidOnlyModel(AI_REFERENCE_COST);
  const getPaidGateMessage = (reason?: 'paid-credits-required' | 'insufficient-credits') =>
    reason === 'paid-credits-required'
      ? lang === 'th'
        ? `โมเดล Lyria 3.5 (ใช้ ${AI_REFERENCE_COST} เหรียญ) สงวนเฉพาะเครดิตที่เติมเงิน (Purchased Credits > 0) กรุณาเติมแพ็กเกจ Mini 49฿ เพื่อปลดล็อก`
        : `Lyria 3.5 (${AI_REFERENCE_COST} Credits) requires purchased credits. Top up Mini Pack (49 THB) to unlock.`
      : lang === 'th'
        ? `ยอดเครดิตคงเหลือไม่พอสำหรับใช้ ${AI_REFERENCE_COST} เหรียญ`
        : `Insufficient credits (requires ${AI_REFERENCE_COST} credits).`;

  const handleGenerateReferenceTrack = async () => {
    const gate = canUsePaidOnlyModel(AI_REFERENCE_COST);
    if (!gate.allowed) {
      setShowRefCostConfirm(false);
      setRefError(getPaidGateMessage(gate.reason));
      return;
    }

    setShowRefCostConfirm(false);
    setIsGeneratingRef(true);
    setRefError(null);

    try {
      const chordsSample = song
        ? song.sections
            .flatMap((sec) => sec.bars.flatMap((bar) => bar.chords))
            .filter(Boolean)
            .slice(0, 8)
        : targetSection?.chords?.slice(0, 8) || ['C', 'G', 'Am', 'F'];

      const lyricsSample = song
        ? song.sections
            .flatMap((sec) => sec.bars.map((bar) => bar.lyrics || ''))
            .map((l) => l.trim())
            .filter(Boolean)
            .slice(0, 4)
        : targetSection?.existingLyrics
          ? targetSection.existingLyrics.split('\n').slice(0, 4)
          : [];

      const accessToken = getAuthAccessToken();
      const requestPayload =
        song && useFullDemoBlueprint
          ? {
              fullSong: song,
              userNotes: refNotes.trim(),
              instrumental: refInstrumental,
              language: lang,
            }
          : {
              songSummary: {
                title: song?.title || 'Demo Song',
                bpm: song?.bpm || 84,
                baseKey: song?.baseKey || 'C',
                timeSignature: song?.timeSignature || '4/4',
                guitarModel: song?.guitarModel || 'dreadnought-steel',
                ambience3D: song?.ambience3D || 'wood-studio',
                thaiGenre,
                chordsSample,
                lyricsSample,
              },
              userNotes: refNotes.trim(),
              instrumental: refInstrumental,
              language: lang,
            };

      const res = await fetch('/api/advance/reference-track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAnalyticsHeaders(),
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(requestPayload),
      });

      const data = (await res.json()) as GeneratedReferenceResult & {
        error?: string;
        wallet?: { balance: number; trialCredits: number; purchasedCredits: number };
      };
      if (!res.ok) {
        setRefError(data.error || 'สร้างแทร็กเสียงอ้างอิงไม่สำเร็จ');
        return;
      }

      if (data.wallet) {
        const synced = applyServerWalletSnapshot(data.wallet);
        syncWalletUi(synced.balance);
      } else if (!data.isSimulated && data.audioDataUrl) {
        // หลักประกันความคุ้มค่า (Phase 5A/5E): หัก 8 เหรียญเฉพาะเมื่อ Lyria 3.5 คืนไฟล์เสียงจริงที่ไม่ใช่โหมดจำลอง
        const spend = deductCredits(
          AI_REFERENCE_COST,
          `AI Reference Track (Lyria 3.5): ${song?.title || 'Demo'}`
        );
        if (spend.success) {
          syncWalletUi(spend.balance);
        }
      }

      setRefResult(data);
    } catch {
      setRefError('ไม่สามารถเชื่อมต่อ API สำหรับสร้างแทร็กเทียบเสียงได้ (ยังไม่หัก 8 เหรียญ)');
    } finally {
      setIsGeneratingRef(false);
    }
  };

  const directorClassification =
    song && directorPrompt.trim() ? classifyDirectorPromptMode(directorPrompt, song) : null;

  const executeDirectorLocal = (tipOverride?: string) => {
    const trimmed = directorPrompt.trim();
    if (!song || !onApplySongUpdate || !trimmed) return;
    setShowDirectorCostConfirm(false);
    const localRes = applyNaturalPromptToSong(trimmed, song);
    setDirectorEngineInfo({
      model: 'demo-offline-director',
      isSimulated: true,
      tip:
        tipOverride ??
        'โหมดด่วนในเครื่อง (0 เหรียญ) — ประมวลผลคำสั่งทันทีโดยไม่หักเครดิต',
    });

    if (localRes.summaryActions.length === 0) {
      setDirectorActions([]);
      setDirectorNotice({
        ok: false,
        text:
          lang === 'th'
            ? 'ไม่พบคำสั่งตั้งค่าแบบกำหนดเองในโหมดในเครื่อง — ลองกด "ให้ AI โปรดิวเซอร์วิเคราะห์ (1 เครดิต)" หรือระบุค่า เช่น "95 bpm คีย์ G ท่อน Chorus ลีดแตกหนัก"'
            : 'No direct studio keywords matched locally — try AI Producer analysis (1 Credit) or specify e.g. "95 bpm Key G, Chorus lead distortion".',
      });
      return;
    }

    onApplySongUpdate(localRes.updatedSong);
    setDirectorActions(localRes.summaryActions);
    setDirectorNotice({
      ok: true,
      text:
        lang === 'th'
          ? `ปรับค่าในเครื่องสำเร็จ (0 เครดิต · ${localRes.summaryActions.length} รายการ)`
          : `Applied locally at 0 credits (${localRes.summaryActions.length} updates)!`,
    });
  };

  const executeDirectorAi = async () => {
    const trimmed = directorPrompt.trim();
    if (!song || !onApplySongUpdate || !trimmed) return;

    setShowDirectorCostConfirm(false);
    if (!canAfford(AI_DIRECTOR_COST)) {
      setDirectorNotice({
        ok: false,
        text:
          lang === 'th'
            ? 'เครดิตไม่เพียงพอ (ต้องใช้ 1 เครดิตสำหรับโหมด AI วิเคราะห์) สามารถเติมเครดิตหรือกดปุ่มโหมดในเครื่องฟรีแทนได้'
            : 'Insufficient credits (requires 1 credit for AI Producer). Top up in Wallet or use free local mode.',
      });
      return;
    }

    setIsApplyingDirector(true);
    setDirectorNotice(null);
    setDirectorEngineInfo(null);

    try {
      const accessToken = getAuthAccessToken();
      const res = await fetch('/api/advance/director', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAnalyticsHeaders(),
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          prompt: trimmed,
          songSummary: buildSongDirectorSummary(song),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        isSimulated?: boolean;
        model?: string;
        patch?: AiDirectorPatch | null;
        tip?: string;
        usage?: { totalTokens?: number };
        wallet?: WalletBreakdown;
        error?: string;
        failureReason?: string;
      };

      if (!res.ok) {
        if (res.status === 401 || res.status === 402 || res.status === 503) {
          setDirectorNotice({
            ok: false,
            text: data.error || 'กรุณาเข้าสู่ระบบด้วย Google หรือเติมเครดิตก่อนใช้ AI Director',
          });
          return;
        }
        executeDirectorLocal('เชื่อมต่อ AI ไม่สำเร็จ (ไม่หักเครดิต) — สลับใช้ตัววิเคราะห์ในเครื่องแทน');
        return;
      }

      if (data.wallet) {
        const synced = applyServerWalletSnapshot(data.wallet);
        syncWalletUi(synced.balance);
      }

      if (!data.isSimulated && data.patch && data.model) {
        const applied = applyDirectorPatchToSong(data.patch, song);
        if (applied.summaryActions.length > 0) {
          if (!data.wallet) {
            const deduction = deductCredits(
              AI_DIRECTOR_COST,
              `AI Director (${data.model}): ${trimmed.slice(0, 28)}`
            );
            if (deduction.success) {
              syncWalletUi(deduction.balance);
            }
          }
          onApplySongUpdate(applied.updatedSong);
          setDirectorActions(applied.summaryActions);
          setDirectorEngineInfo({
            model: data.model,
            isSimulated: false,
            tip: data.tip || '',
            totalTokens: data.usage?.totalTokens,
          });
          setDirectorNotice({
            ok: true,
            text:
              lang === 'th'
                ? `${data.model} ปรับค่าในเพลงเรียบร้อย (${applied.summaryActions.length} รายการ · ใช้ 1 เครดิต)`
                : `${data.model} applied ${applied.summaryActions.length} updates (1 Credit used)!`,
          });
          return;
        }
      }

      executeDirectorLocal(data.tip);
    } catch {
      executeDirectorLocal('ไม่สามารถเชื่อมต่อ AI ได้ชั่วคราว (ไม่หักเครดิต) — ใช้โหมดในเครื่องแทน');
    } finally {
      setIsApplyingDirector(false);
    }
  };

  const handleApplyDirectorPrompt = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = directorPrompt.trim();
    if (!song || !onApplySongUpdate || !trimmed) return;

    const classification = classifyDirectorPromptMode(trimmed, song);
    if (classification.mode === 'local') {
      executeDirectorLocal();
      return;
    }

    if (!canAfford(AI_DIRECTOR_COST)) {
      setDirectorNotice({
        ok: false,
        text:
          lang === 'th'
            ? 'คำสั่งนี้ต้องใช้ AI โปรดิวเซอร์ (1 เครดิต) แต่เครดิตไม่เพียงพอ — กดปุ่ม "ลองปรับในเครื่อง (0 เครดิต)" หรือเติมเครดิต'
            : 'This creative prompt requires AI Producer (1 Credit), but balance is insufficient.',
      });
      return;
    }
    setShowDirectorCostConfirm(true);
  };

  const baseRhyme = findThaiRhymes(rhymeInput);
  const rhymeFiltered = filterThaiRhymes(rhymeInput, {
    liveness: rhymeLivenessFilter,
    tone: rhymeToneFilter,
  });
  const rhymeResult =
    rhymeLivenessFilter === 'all' && rhymeToneFilter === 'all'
      ? baseRhyme
      : {
          groupLabel: rhymeFiltered.groupLabel || baseRhyme.groupLabel,
          suggestions: rhymeFiltered.suggestions,
        };
  const rhymePhonetics = rhymeFiltered.inputPhonetics;
  const rhymeSyllables = countThaiEnglishSyllables(rhymeInput);
  const songSections = song?.sections;
  const activeSongSection = useMemo(() => {
    if (!songSections?.length) return undefined;
    return songSections.find((s) => s.id === selectedSectionId) ?? songSections[0];
  }, [songSections, selectedSectionId]);

  const currentSectionName = activeSongSection?.name || targetSection?.sectionName || 'Section';
  const currentSectionType = (activeSongSection?.type || targetSection?.sectionType || 'verse') as SectionType;

  const activeChords = useMemo(() => {
    if (customChords && customChords.length > 0) return customChords;
    if (activeSongSection?.bars?.length) {
      const bChords = activeSongSection.bars.flatMap((b) => b.chords).filter(Boolean);
      if (bChords.length > 0) return bChords;
    }
    return targetSection?.chords?.length ? targetSection.chords : ['C', 'G', 'Am', 'F'];
  }, [customChords, activeSongSection, targetSection]);

  const handleSwitchTargetSection = (nextSecId: string) => {
    setSelectedSectionId(nextSecId);
    setCustomChords(null);
    setIsEditingChords(false);
    const nextSec = song?.sections.find((s) => s.id === nextSecId);
    if (nextSec) {
      const bChords = nextSec.bars.flatMap((b) => b.chords).filter(Boolean);
      setCustomChordsText(bChords.join(', '));
    }
  };

  const handleChangeSectionType = (newType: SectionType) => {
    if (!song || !onApplySongUpdate || !activeSongSection) return;
    const typeLabel =
      newType === 'verse'
        ? 'Verse'
        : newType === 'chorus'
        ? 'Chorus'
        : newType === 'pre-chorus'
        ? 'Pre-Chorus'
        : newType === 'bridge'
        ? 'Bridge'
        : newType === 'solo'
        ? 'Solo'
        : 'Outro';
    const nextSections = song.sections.map((s) => {
      if (s.id !== activeSongSection.id) return s;
      return {
        ...s,
        type: newType,
        name: s.name.includes(' ') ? `${typeLabel} ${s.name.split(' ').slice(1).join(' ')}` : typeLabel,
      };
    });
    onApplySongUpdate({
      ...song,
      updatedAt: new Date().toISOString(),
      sections: nextSections,
    });
  };

  const handleApplyCustomChords = (newChords: string[]) => {
    if (newChords.length === 0) return;
    setCustomChords(newChords);
    setCustomChordsText(newChords.join(', '));
    setIsEditingChords(false);
    if (song && onApplySongUpdate && activeSongSection) {
      const updatedSections = song.sections.map((s) => {
        if (s.id !== activeSongSection.id) return s;
        const updatedBars = s.bars.map((bar, idx) => {
          const chord = newChords[idx % newChords.length];
          return {
            ...bar,
            chords: [chord],
            chordsPerBar: 1 as const,
          };
        });
        return {
          ...s,
          bars: updatedBars,
        };
      });
      onApplySongUpdate({
        ...song,
        updatedAt: new Date().toISOString(),
        sections: updatedSections,
      });
    }
  };

  const handleStyleMetaChange = (next: {
    thaiGenre?: ThaiSongGenre;
    lyricEra?: ThaiLyricEra;
    lyricDialect?: ThaiLyricDialect;
    songwriterStyle?: ThaiSongwriterStyle;
    emotionalResolution?: ThaiEmotionalResolution;
  }) => {
    if (next.thaiGenre !== undefined) setThaiGenre(next.thaiGenre);
    if (next.lyricEra !== undefined) setLyricEra(next.lyricEra);
    if (next.lyricDialect !== undefined) setLyricDialect(next.lyricDialect);
    if (next.songwriterStyle !== undefined) setSongwriterStyle(next.songwriterStyle);
    if (next.emotionalResolution !== undefined) {
      setEmotionalResolution(next.emotionalResolution);
    }
    onUpdateSongStyleMeta?.(next);
  };

  const inferFallbackTopic = () => {
    const cleanTitle = song?.title?.trim() || '';
    if (cleanTitle && !cleanTitle.startsWith('New Song') && !cleanTitle.startsWith('เพลงใหม่')) {
      return cleanTitle;
    }
    const draft = targetSection?.existingLyrics?.trim();
    if (draft) return draft.slice(0, 48);
    const anyPrior = song?.sections
      .flatMap((s) => s.bars.map((b) => b.lyrics.trim()))
      .find(Boolean);
    if (anyPrior) return anyPrior.slice(0, 48);
    return lang === 'th' ? 'ความทรงจำและเสียงเพลงของเรา' : 'Warm acoustic memory';
  };

  const handleCopyRhyme = async (word: string) => {
    try {
      await navigator.clipboard?.writeText(word);
    } catch {
      // ignore clipboard restrictions
    }
    setCopiedWord(word);
    setTimeout(() => setCopiedWord((cur) => (cur === word ? null : cur)), 1500);
  };

  const handleRequestGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    setAiError(null);
    let effectiveTopic = topic.trim();
    if (!effectiveTopic) {
      effectiveTopic = inferFallbackTopic();
      setTopic(effectiveTopic);
    }
    if (!effectiveTopic) {
      setAiError(lang === 'th' ? 'กรุณาใส่หัวข้อหรือเรื่องราวของท่อนนี้ก่อนครับ' : 'Please enter a topic or story first.');
      return;
    }
    if (!canAfford(activeLyricCost)) {
      setShowCostConfirm(false);
      setAiError(
        lang === 'th'
          ? `เครดิตไม่เพียงพอ (ต้องใช้ ${activeLyricCost} เครดิต) กรุณาเติมเครดิตในแท็บ กระเป๋าเครดิต`
          : `Insufficient credits (requires ${activeLyricCost} credits). Please top up in Wallet.`
      );
      return;
    }
    setShowCostConfirm(true);
  };

  const handleConfirmGenerate = async () => {
    setShowCostConfirm(false);
    if (!canAfford(activeLyricCost)) {
      setAiError(lang === 'th' ? 'เครดิตไม่เพียงพอ กรุณาเติมเครดิต' : 'Insufficient credits');
      return;
    }

    const effectiveTopic = topic.trim() || inferFallbackTopic();
    if (!topic.trim()) setTopic(effectiveTopic);

    let previousSectionLyrics: string[] | undefined;
    let allPriorSections: Array<{ name: string; type: string; lyrics: string[] }> | undefined;
    if (song && targetSection) {
      const idx = song.sections.findIndex((s) => s.id === targetSection.sectionId);
      if (idx > 0) {
        previousSectionLyrics = song.sections[idx - 1].bars
          .map((b) => b.lyrics.trim())
          .filter(Boolean);
        allPriorSections = song.sections
          .slice(0, idx)
          .map((s) => ({
            name: s.name,
            type: s.type,
            lyrics: s.bars.map((b) => b.lyrics.trim()),
          }))
          .filter((s) => s.lyrics.some(Boolean));
      }
    }

    const barCount = activeSongSection ? activeSongSection.bars.length : Math.max(2, Math.min(8, activeChords.length || 4));
    const barsPayload = activeChords.slice(0, barCount).map((c, idx) => {
      const origBar = activeSongSection?.bars[idx];
      return {
        chord: c,
        chord2: origBar?.chordsPerBar === 2 ? origBar.chords[1] : undefined,
        chordsPerBar: origBar?.chordsPerBar ?? (1 as const),
        existingLyrics: origBar?.lyrics || '',
      };
    });

    setIsGenerating(true);
    setAiError(null);
    setVocalDemoNotice(null);
    try {
      const accessToken = getAuthAccessToken();
      const res = await fetch('/api/advance/lyrics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAnalyticsHeaders(),
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          mood,
          topic: effectiveTopic,
          chordProgression: activeChords,
          existingLyrics: targetSection?.existingLyrics || undefined,
          sectionType: currentSectionType,
          bpm: song?.bpm,
          timeSignature: song?.timeSignature,
          previousSectionLyrics,
          allPriorSections,
          barCount,
          bars: barsPayload,
          thaiGenre,
          lyricEra,
          lyricDialect,
          songwriterStyle,
          emotionalResolution,
          songTitle: song?.title,
          polishExistingDraft,
          mode: lyricMode,
        }),
      });

      const data = (await res.json()) as GeneratedLyricResult & {
        error?: string;
        wallet?: { balance: number; trialCredits: number; purchasedCredits: number };
      };
      if (!res.ok) {
        setAiError(data.error || 'Failed to generate lyrics');
        setIsGenerating(false);
        return;
      }

      if (data.wallet) {
        const synced = applyServerWalletSnapshot(data.wallet);
        syncWalletUi(synced.balance);
      } else if (!data.isSimulated) {
        const deduction = deductCredits(
          activeLyricCost,
          `AI Lyrics [${lyricMode}] (${data.model}): ${targetSection?.sectionName || 'Song'} (${effectiveTopic.slice(0, 24)})`
        );
        if (deduction.success) {
          syncWalletUi(deduction.balance);
        }
      }
      setAiResult(data);
      setEditableLines(data.lines.map((l) => l.text));
      setSelectedBars(data.lines.map(() => true));
      setBarVocalUrls({});
    } catch {
      setAiError(lang === 'th' ? 'ไม่สามารถเชื่อมต่อบริการ AI ชั่วคราว (ไม่หักเครดิต)' : 'Network error calling AI endpoint (0 credits charged)');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSingLineWithAi = async (barIdx: number, text: string) => {
    const cleanText = text.trim();
    if (!cleanText || singingBarIdx !== null) return;
    const ttsCost = CREDIT_COST_TABLE.aiTtsCue;
    if (!canAfford(ttsCost)) {
      setVocalDemoNotice(
        lang === 'th'
          ? `เครดิตไม่พอสำหรับสร้างเสียง AI ร้อง (ใช้ ${ttsCost} เครดิต)`
          : `Insufficient credits (requires ${ttsCost} credits).`
      );
      return;
    }

    setSingingBarIdx(barIdx);
    setVocalDemoNotice(null);
    try {
      const accessToken = getAuthAccessToken();
      const res = await fetch('/api/advance/tts-cue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAnalyticsHeaders(),
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          text: cleanText,
          bpm: song?.bpm ?? 85,
          language: /[ก-๙]/.test(cleanText) ? 'th' : 'en',
          voice: aiVocalVoice,
          vocalMode: 'singing-demo',
          thaiGenre,
        }),
      });
      const data = (await res.json()) as {
        isSimulated?: boolean;
        audioDataUrl?: string | null;
        tip?: string;
        error?: string;
        wallet?: { balance: number; trialCredits: number; purchasedCredits: number };
      };
      if (!res.ok) {
        setVocalDemoNotice(data.error || 'สร้างเสียง AI ร้องไม่สำเร็จ');
        return;
      }
      if (data.wallet) {
        const synced = applyServerWalletSnapshot(data.wallet);
        syncWalletUi(synced.balance);
      } else if (!data.isSimulated && data.audioDataUrl) {
        const spend = deductCredits(ttsCost, `AI Vocal Guide (${aiVocalVoice}): ${cleanText.slice(0, 20)}`);
        if (spend.success) syncWalletUi(spend.balance);
      }

      if (data.audioDataUrl) {
        setBarVocalUrls((prev) => ({ ...prev, [barIdx]: data.audioDataUrl! }));
        if (targetSection && onApplySectionVocalAudio) {
          onApplySectionVocalAudio(targetSection.sectionId, barIdx, data.audioDataUrl);
        }
        try {
          const audio = new Audio(data.audioDataUrl);
          void audio.play();
        } catch {
          // ignore autoplay restriction
        }
        setVocalDemoNotice(
          lang === 'th'
            ? `✓ สร้างและบันทึกเสียง AI ร้องลงในห้องที่ ${barIdx + 1} แล้ว (เล่นร่วมกับดนตรี & Export MP3 ได้เลย!)`
            : `✓ AI vocal saved to Bar ${barIdx + 1}!`
        );
      } else {
        setVocalDemoNotice(data.tip || 'โหมดจำลองออฟไลน์ — ใช้ Gemini Key บนเซิร์ฟเวอร์เพื่อสังเคราะห์เสียงร้อง AI จริง (ไม่หักเครดิต)');
      }
    } catch {
      setVocalDemoNotice(lang === 'th' ? 'เชื่อมต่อ AI Vocal ไม่ได้ชั่วคราว (ไม่หักเครดิต)' : 'Network error.');
    } finally {
      setSingingBarIdx(null);
    }
  };

  const resetSlipUploadState = () => {
    setSlipFile(null);
    setSlipPreviewUrl(null);
    setSlipError(null);
  };

  const handleSelectTopUpPackage = async (pkg: CreditPackage) => {
    setSelectedPromptPayPkg(pkg);
    setActiveOrder(null);
    setOrderError(null);
    resetSlipUploadState();

    const accessToken = getAuthAccessToken();
    if (cloudUser.mode !== 'authenticated' || !accessToken) {
      return;
    }

    setIsCreatingOrder(true);
    try {
      const res = await fetch('/api/billing/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ packageId: pkg.id }),
      });
      const data = (await res.json()) as ActivePromptPayOrder & { error?: string };
      if (!res.ok) {
        setOrderError(data.error || 'ไม่สามารถสร้าง PromptPay QR ได้ในขณะนี้');
        return;
      }
      setActiveOrder(data);
    } catch {
      setOrderError('ไม่สามารถเชื่อมต่อระบบสร้าง PromptPay QR ได้ชั่วคราว');
    } finally {
      setIsCreatingOrder(false);
    }
  };

  const handleSlipFileSelected = (file: File | null) => {
    setSlipError(null);
    if (!file) {
      resetSlipUploadState();
      return;
    }

    if (!ALLOWED_SLIP_MIMES.has(file.type.toLowerCase())) {
      setSlipFile(null);
      setSlipPreviewUrl(null);
      setSlipError(
        lang === 'th'
          ? 'รองรับเฉพาะไฟล์รูปภาพ JPG, PNG หรือ WebP เท่านั้น'
          : 'Only JPG, PNG or WebP receipt images are supported.'
      );
      return;
    }

    if (file.size > MAX_SLIP_BYTES) {
      setSlipFile(null);
      setSlipPreviewUrl(null);
      setSlipError(
        lang === 'th'
          ? 'ขนาดไฟล์สลิปต้องไม่เกิน 4MB กรุณาเลือกไฟล์ที่เล็กลง'
          : 'Slip image must be 4MB or smaller.'
      );
      return;
    }

    setSlipFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSlipPreviewUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitSlipVerification = async () => {
    if (!activeOrder || !slipFile) return;
    const accessToken = getAuthAccessToken();
    if (!accessToken) {
      setSlipError(lang === 'th' ? 'กรุณาเข้าสู่ระบบด้วย Google ใหม่อีกครั้ง' : 'Please sign in again.');
      return;
    }

    setIsVerifyingSlip(true);
    setSlipError(null);
    try {
      const form = new FormData();
      form.append('orderId', activeOrder.orderId);
      form.append('file', slipFile);

      const res = await fetch('/api/billing/verify-slip', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: form,
      });

      const data = (await res.json()) as {
        success?: boolean;
        creditedAmount?: number;
        transRef?: string;
        wallet?: {
          balance: number;
          trialCredits: number;
          purchasedCredits: number;
          transactions?: CreditTransaction[];
        };
        error?: string;
      };

      if (!res.ok || !data.wallet) {
        setSlipError(data.error || 'ตรวจสอบสลิปไม่ผ่าน กรุณาตรวจสอบข้อมูลแล้วลองใหม่');
        return;
      }

      const updated = applyServerWalletSnapshot(data.wallet);
      syncWalletUi(updated.balance);
      setSelectedPromptPayPkg(null);
      setActiveOrder(null);
      resetSlipUploadState();
      setWalletFeedback(
        lang === 'th'
          ? `ตรวจสลิปสำเร็จ! เติม +${data.creditedAmount ?? updated.balance} Credits เข้าบัญชีแล้ว (Ref: ${data.transRef || '-'})`
          : `Slip verified! Added +${data.creditedAmount ?? updated.balance} Credits (Ref: ${data.transRef || '-'})`
      );
      setTimeout(() => setWalletFeedback(null), 6000);
    } catch {
      setSlipError(
        lang === 'th'
          ? 'ไม่สามารถเชื่อมต่อระบบตรวจสลิปได้ชั่วคราว กรุณาลองใหม่อีกครั้ง'
          : 'Network error verifying slip.'
      );
    } finally {
      setIsVerifyingSlip(false);
    }
  };

  const handleGoogleTopUpSignIn = () => {
    if (isCloudConfigured()) {
      const res = signInWithGoogleOAuth();
      if (!res.success && onOpenAccountModal) {
        onOpenAccountModal();
      } else if (!res.success) {
        setOrderError(res.message);
      }
      return;
    }
    if (onOpenAccountModal) {
      onOpenAccountModal();
    } else {
      setOrderError('กรุณาตั้งค่า Supabase Cloud และเข้าสู่ระบบด้วย Google ก่อนเติมเครดิต');
    }
  };

  const handleConfirmMockPayment = (pkg: CreditPackage) => {
    if (!demoTopUpAllowed) return;
    const res = topUpCredits(pkg);
    if (res.success) {
      syncWalletUi(res.balance);
      setSelectedPromptPayPkg(null);
      setActiveOrder(null);
      resetSlipUploadState();
      setWalletFeedback(
        lang === 'th'
          ? `เติมสำเร็จ (โหมดทดสอบออฟไลน์) +${pkg.credits} Credits (${pkg.priceThb}฿) — ยอดคงเหลือ ${res.balance} Credits`
          : `Offline preview top-up +${pkg.credits} Credits (${pkg.priceThb}฿)`
      );
      setTimeout(() => setWalletFeedback(null), 4000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full p-5 sm:p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col">
        {/* Header + Credit Chip */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 shrink-0">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-black text-lg text-slate-900">
                ⚡ {lang === 'th' ? 'Advance Mode & คลังคำสัมผัส' : 'Advance Mode & Lyric Studio'}
              </h3>
              <button
                type="button"
                onClick={() => setActiveTab('wallet')}
                className="px-2.5 py-0.5 rounded-full bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-900 font-black text-xs cursor-pointer transition"
              >
                ⚡ {balance} Credits
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {lang === 'th'
                ? 'ช่วยหาคำสัมผัสไทยฟรี (0 เครดิต) หรือแต่งเนื้อเพลงด้วย AI ตามคอร์ดจริง'
                : 'Free offline Thai rhyme lookup (0 credits) & credit-protected AI Lyric Co-Pilot'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs cursor-pointer shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Sub-Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl border border-slate-200 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('rhyme')}
            className={`flex-1 px-3 py-2 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer whitespace-nowrap ${
              activeTab === 'rhyme'
                ? 'bg-white text-[#1A73E8] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🎵 {lang === 'th' ? 'คำสัมผัสไทย (0 เครดิต)' : 'Thai Rhyme (0 Credits)'}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ai-lyrics')}
            className={`flex-1 px-3 py-2 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer whitespace-nowrap ${
              activeTab === 'ai-lyrics'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ✨ {lang === 'th' ? 'AI Lyric Co-Pilot (1 เครดิต)' : 'AI Lyrics (1 Credit)'}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ai-director')}
            className={`shrink-0 px-3 py-2 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer whitespace-nowrap ${
              activeTab === 'ai-director'
                ? 'bg-white text-purple-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🪄 {lang === 'th' ? 'AI สั่งตั้งค่าแอป (0-1 เครดิต)' : 'AI Studio Director (0-1 Cr)'}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('reference')}
            className={`shrink-0 px-3 py-2 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer whitespace-nowrap ${
              activeTab === 'reference'
                ? 'bg-white text-amber-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🎧 {lang === 'th' ? 'AI เทียบเสียง (8 เหรียญ)' : 'AI Reference (8 Cr)'}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('wallet')}
            className={`shrink-0 px-3 py-2 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer whitespace-nowrap ${
              activeTab === 'wallet'
                ? 'bg-white text-amber-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            💳 {lang === 'th' ? 'เติมเครดิต / ประวัติ' : 'Wallet & Top-Up'}
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-4">
          {/* ─── TAB 1: THAI RHYME LOOKUP (0 CREDITS) ─── */}
          {activeTab === 'rhyme' && (
            <div className="space-y-3.5">
              <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex items-center justify-between gap-2 text-xs">
                <span className="font-bold text-emerald-900">
                  ✓ {lang === 'th' ? 'ใช้ฟรี 0 เครดิต — ทำงานออฟไลน์ 100% บนอุปกรณ์' : 'Free Offline Tool (0 Credits)'}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-white text-emerald-800 border border-emerald-200 font-bold">
                  {rhymeSyllables} {lang === 'th' ? 'พยางค์' : 'syllables'}
                </span>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">
                  {lang === 'th' ? 'พิมพ์คำลงท้ายท่อนหรือประโยคที่ต้องการหาสัมผัส:' : 'Enter a Thai word or lyric ending:'}
                </label>
                <input
                  type="text"
                  value={rhymeInput}
                  onChange={(e) => setRhymeInput(e.target.value)}
                  placeholder="เช่น หัวใจ, ท้องฟ้า, ความฝัน, เธอ, คิดถึง..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-[#1A73E8] focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {/* Quick Rhyme Group Chips */}
              <div className="flex flex-wrap gap-1.5">
                {THAI_RHYME_GROUPS.slice(0, 14).map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setRhymeInput(g.examples[0])}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition cursor-pointer ${
                      rhymeResult.groupLabel === g.groupLabel
                        ? 'bg-[#1A73E8] text-white border-[#1A73E8]'
                        : 'bg-slate-50 hover:bg-blue-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    {g.examples[0]} ({g.groupLabel.split(' ')[0]})
                  </button>
                ))}
              </div>

              {/* Thai Phonology Analysis Card */}
              {rhymeInput.trim() && (
                <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200/80 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-black text-indigo-950">
                      🔬 วิเคราะห์พยางค์ท้าย &ldquo;{rhymePhonetics.lastSyllable}&rdquo;
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                          rhymePhonetics.isLiveSyllable
                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                            : 'bg-amber-100 text-amber-900 border border-amber-300'
                        }`}
                      >
                        {rhymePhonetics.livenessLabel}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-white text-indigo-800 border border-indigo-200 text-[11px] font-bold">
                        วรรณยุกต์: {rhymePhonetics.tone}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px] text-indigo-900/90">
                    <span className="px-2 py-0.5 rounded-lg bg-white/80 border border-indigo-100">
                      {rhymePhonetics.consonantClassLabel}
                    </span>
                    <span className="px-2 py-0.5 rounded-lg bg-white/80 border border-indigo-100">
                      {rhymePhonetics.vowelLengthLabel}
                    </span>
                    <span className="px-2 py-0.5 rounded-lg bg-white/80 border border-indigo-100">
                      มาตรา{rhymePhonetics.codaFamily}
                    </span>
                  </div>
                  <div className="text-[11px] font-semibold text-indigo-800">
                    🎵 {rhymePhonetics.melodyAdvice}
                  </div>
                </div>
              )}

              {/* Filters (คำเป็น/คำตาย & วรรณยุกต์) + Results Grid */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                <div className="flex items-center justify-between text-xs gap-2 flex-wrap">
                  <span className="font-black text-slate-800">
                    {lang === 'th' ? 'กลุ่มสัมผัส:' : 'Rhyme Family:'}{' '}
                    <span className="text-[#1A73E8]">{rhymeResult.groupLabel}</span>
                  </span>
                  <div className="flex items-center gap-1 flex-wrap">
                    {(['all', 'live', 'dead'] as const).map((lv) => (
                      <button
                        key={lv}
                        type="button"
                        onClick={() => setRhymeLivenessFilter(lv)}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border cursor-pointer transition ${
                          rhymeLivenessFilter === lv
                            ? 'bg-slate-800 text-white border-slate-800'
                            : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        {lv === 'all' ? 'ทั้งหมด' : lv === 'live' ? 'คำเป็น (ลากเสียง)' : 'คำตาย (สั้นคม)'}
                      </button>
                    ))}
                    <select
                      aria-label="Filter by Thai tone"
                      value={rhymeToneFilter}
                      onChange={(e) => setRhymeToneFilter(e.target.value as ThaiToneName | 'all')}
                      className="px-2 py-0.5 rounded-lg text-[10px] font-bold border border-slate-200 bg-white text-slate-700"
                    >
                      <option value="all">ทุกวรรณยุกต์</option>
                      <option value="สามัญ">เสียงสามัญ</option>
                      <option value="เอก">เสียงเอก</option>
                      <option value="โท">เสียงโท</option>
                      <option value="ตรี">เสียงตรี</option>
                      <option value="จัตวา">เสียงจัตวา</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {rhymeFiltered.filteredSuggestions.length === 0 ? (
                    <span className="text-[11px] text-slate-400">
                      ไม่พบคำที่ตรงตัวกรอง ลองเปลี่ยนเป็น &ldquo;ทั้งหมด&rdquo;
                    </span>
                  ) : (
                    rhymeFiltered.filteredSuggestions.map(({ word: w, phonetics }) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => handleCopyRhyme(w)}
                        title={`${phonetics.livenessLabel} · เสียง${phonetics.tone} (${phonetics.codaFamily})`}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                          copiedWord === w
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white hover:bg-blue-50 hover:border-blue-300 text-slate-800 border-slate-200 shadow-2xs'
                        }`}
                      >
                        <span>{copiedWord === w ? `✓ ${w}` : w}</span>
                        <span
                          className={`text-[9px] px-1 rounded ${
                            copiedWord === w
                              ? 'bg-emerald-700 text-white'
                              : phonetics.isLiveSyllable
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {phonetics.tone}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── TAB 2: AI LYRIC CO-PILOT (COST-PROTECTED) ─── */}
          {activeTab === 'ai-lyrics' && (
            <div className="space-y-3.5">
              {(targetSection || (song?.sections && song.sections.length > 0)) && (
                <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-2.5">
                  <div className="flex items-center justify-between gap-2.5 flex-wrap text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-indigo-950 flex items-center gap-1.5 shrink-0">
                        🎼 {lang === 'th' ? 'ท่อนเป้าหมาย:' : 'Target Section:'}
                      </span>

                      {/* Section Selector Dropdown (if song has multiple sections) */}
                      {song?.sections && song.sections.length > 1 ? (
                        <select
                          value={selectedSectionId}
                          onChange={(e) => handleSwitchTargetSection(e.target.value)}
                          className="px-2.5 py-1 rounded-xl bg-white border border-indigo-200 text-indigo-950 text-xs font-bold cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-xs"
                          aria-label="Target Section"
                        >
                          {song.sections.map((sec) => (
                            <option key={sec.id} value={sec.id}>
                              {sec.name} ({sec.type}) · {sec.bars.length} {lang === 'th' ? 'ห้อง' : 'bars'}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="font-bold text-indigo-900 bg-white px-2.5 py-1 rounded-xl border border-indigo-200 shadow-xs">
                          {currentSectionName}
                        </span>
                      )}

                      {/* Change Section Type Selector */}
                      <select
                        value={currentSectionType}
                        onChange={(e) => handleChangeSectionType(e.target.value as SectionType)}
                        className="px-2 py-1 rounded-xl bg-white border border-indigo-200 text-indigo-800 text-[11px] font-semibold cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-xs"
                        aria-label="Section Type"
                      >
                        <option value="verse">Verse (ท่อนร้อง)</option>
                        <option value="pre-chorus">Pre-Chorus (ท่อนส่ง)</option>
                        <option value="chorus">Chorus (ท่อนฮุก)</option>
                        <option value="bridge">Bridge (ท่อนแยก)</option>
                        <option value="solo">Solo (โซโล่)</option>
                        <option value="outro">Outro (ท่อนจบ)</option>
                      </select>
                    </div>

                    {/* Chords Display & Edit Button */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="px-2.5 py-1 rounded-xl bg-white text-indigo-700 border border-indigo-200 font-bold font-mono text-[11px] shadow-xs">
                        {activeChords.slice(0, 8).join(' → ')}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingChords((prev) => !prev);
                          if (!customChordsText) {
                            setCustomChordsText(activeChords.join(', '));
                          }
                        }}
                        className="px-2.5 py-1 rounded-xl bg-white hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-[11px] font-bold transition cursor-pointer shadow-xs"
                      >
                        ✏️ {isEditingChords ? (lang === 'th' ? 'ปิด' : 'Close') : (lang === 'th' ? 'เปลี่ยนคอร์ด' : 'Edit Chords')}
                      </button>
                    </div>
                  </div>

                  {/* Expandable Chords Editor */}
                  {isEditingChords && (
                    <div className="p-3 rounded-xl bg-white border border-indigo-200 space-y-2 text-xs animate-fadeIn">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                        <span>{lang === 'th' ? 'เลือกสูตรคอร์ดฮิต หรือพิมพ์คอร์ดเอง:' : 'Select Formula or Type Custom Chords:'}</span>
                        <span className="text-[10px] text-slate-400 font-mono">(Key {song?.baseKey || 'C'})</span>
                      </div>

                      {/* Formula Chips */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {POPULAR_CHORD_FORMULAS.map((formula) => {
                          const resolved = resolveChordProgressionFormula(formula.id, song?.baseKey || 'C');
                          return (
                            <button
                              key={formula.id}
                              type="button"
                              onClick={() => handleApplyCustomChords(resolved)}
                              className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 text-[11px] font-bold transition cursor-pointer"
                            >
                              {formula.formula} ({resolved.slice(0, 4).join('-')})
                            </button>
                          );
                        })}
                      </div>

                      {/* Custom Chords Text Input */}
                      <div className="flex items-center gap-1.5 pt-1">
                        <input
                          type="text"
                          value={customChordsText}
                          onChange={(e) => setCustomChordsText(e.target.value)}
                          placeholder="พิมพ์คอร์ดคั่นด้วยจุลภาค เช่น C, G, Am, F หรือ G, Em7, Cmaj7, D..."
                          className="flex-1 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 font-mono text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const parsed = customChordsText
                              .split(/[,;\s]+/)
                              .map((c) => c.trim())
                              .filter(Boolean);
                            if (parsed.length > 0) {
                              handleApplyCustomChords(parsed);
                            }
                          }}
                          className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition cursor-pointer"
                        >
                          {lang === 'th' ? 'ใช้คอร์ดนี้' : 'Apply'}
                        </button>
                      </div>
                    </div>
                  )}

                  {activeSongSection?.bars?.some((b) => b.lyrics?.trim()) && (
                    <div className="text-[11px] text-indigo-800/80 truncate">
                      {lang === 'th' ? 'เนื้อเดิม:' : 'Draft:'} &ldquo;
                      {activeSongSection.bars
                        .map((b) => b.lyrics.trim())
                        .filter(Boolean)
                        .slice(0, 2)
                        .join(' / ')}
                      &rdquo;
                    </div>
                  )}
                </div>
              )}

              <form onSubmit={handleRequestGenerate} className="space-y-3">
                {/* Quick (1 Cr) vs Deep + Melody (2 Cr) Mode Selector */}
                <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-100 border border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      setLyricMode('quick');
                      setShowCostConfirm(false);
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
                      lyricMode === 'quick'
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    ✨ {lang === 'th' ? 'แต่งเนื้อด่วน (1 เครดิต)' : 'Quick Lyrics (1 Credit)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLyricMode('deep');
                      setShowCostConfirm(false);
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
                      lyricMode === 'deep'
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    🎼 {lang === 'th' ? '+ เมโลดี้ไกด์ (2 เครดิต)' : '+ Guide Melody (2 Credits)'}
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">
                    {lang === 'th' ? 'อารมณ์เพลง (Mood):' : 'Mood:'}
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {MOOD_PRESETS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMood(lang === 'th' ? m.th : m.en)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition cursor-pointer ${
                          mood === (lang === 'th' ? m.th : m.en) || mood.includes(m.id)
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-slate-50 hover:bg-indigo-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        {lang === 'th' ? m.th : m.en}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-bold text-slate-700 block">
                      {lang === 'th' ? 'เรื่องราว / คีย์เวิร์ดของท่อนนี้ (Topic):' : 'Topic / Imagery:'}
                    </label>
                    <button
                      type="button"
                      onClick={() => setTopic(inferFallbackTopic())}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                    >
                      ✨ {lang === 'th' ? 'ดึงจากชื่อเพลง/ท่อนเดิม' : 'Auto-fill from Song'}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder={
                      lang === 'th'
                        ? 'เว้นว่างได้ระบบจะดึงจากชื่อเพลง หรือระบุเพิ่ม เช่น กาแฟอุ่นๆ ยามเช้า...'
                        : 'e.g., Sunday morning coffee, watching the rain, stargazing promise...'
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>

                {/* Thai Genre, Era, Dialect & Songwriter Inspiration Controls */}
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">
                        🎸 {lang === 'th' ? 'แนวเพลงไทย (Genre)' : 'Thai Genre'}
                      </label>
                      <select
                        value={thaiGenre}
                        onChange={(e) =>
                          handleStyleMetaChange({ thaiGenre: e.target.value as ThaiSongGenre })
                        }
                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800"
                      >
                        {THAI_GENRE_PROFILES.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">
                        🗣️ {lang === 'th' ? 'กลิ่นอายภาษาถิ่น (Dialect)' : 'Regional Dialect'}
                      </label>
                      <select
                        value={lyricDialect}
                        onChange={(e) =>
                          handleStyleMetaChange({ lyricDialect: e.target.value as ThaiLyricDialect })
                        }
                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800"
                      >
                        {THAI_DIALECT_PROFILES.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">
                        📻 {lang === 'th' ? 'ยุคสมัย (Era)' : 'Songwriting Era'}
                      </label>
                      <select
                        value={lyricEra}
                        onChange={(e) =>
                          handleStyleMetaChange({ lyricEra: e.target.value as ThaiLyricEra })
                        }
                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800"
                      >
                        {THAI_ERA_PROFILES.map((er) => (
                          <option key={er.id} value={er.id}>
                            {er.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">
                        ✍️ {lang === 'th' ? 'สไตล์นักแต่งเพลง' : 'Songwriter Inspiration'}
                      </label>
                      <select
                        value={songwriterStyle}
                        onChange={(e) => {
                          const nextVal = e.target.value as ThaiSongwriterStyle;
                          handleStyleMetaChange({
                            songwriterStyle: nextVal,
                          });
                          if (nextVal !== 'none') {
                            trackUsageEvent({
                              eventName: 'select_songwriter_style',
                              category: 'style',
                              songwriterStyle: nextVal,
                              thaiGenre,
                              lyricDialect,
                              lyricEra,
                              emotionalResolution,
                              featureVariant: 'advance_mode',
                            });
                          }
                        }}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800"
                      >
                        {SONGWRITER_STYLE_PROFILES.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">
                        🎯 กลยุทธ์พลังท่อนฮุก &amp; การปิดอารมณ์จบเพลง (Emotional Arc &amp; Ending)
                      </label>
                      <select
                        value={emotionalResolution}
                        onChange={(e) =>
                          handleStyleMetaChange({
                            emotionalResolution: e.target.value as ThaiEmotionalResolution,
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800"
                      >
                        {EMOTIONAL_RESOLUTION_PROFILES.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {(() => {
                    const activeSectionType =
                      (targetSection?.sectionType as SectionType | undefined) ?? 'verse';
                    const activeBlueprint =
                      SECTION_ENERGY_ARC_BLUEPRINTS[activeSectionType] ??
                      SECTION_ENERGY_ARC_BLUEPRINTS.verse;
                    const activeResolution =
                      EMOTIONAL_RESOLUTION_PROFILES.find((r) => r.id === emotionalResolution) ??
                      EMOTIONAL_RESOLUTION_PROFILES[0];
                    return (
                      <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-2 space-y-1 text-[11px] text-amber-950">
                        <div className="flex flex-wrap items-center justify-between gap-1.5 font-extrabold">
                          <span>
                            ⚡ พลังงานท่อน {activeSectionType.toUpperCase()}: {activeBlueprint.energyScore} —{' '}
                            {activeBlueprint.roleTitle}
                          </span>
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                            {activeResolution.label}
                          </span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-amber-900">
                          {activeBlueprint.barByBarPlan}
                        </p>
                        <p className="text-[10px] leading-relaxed text-amber-800">
                          <span className="font-bold">Hook &amp; จบเพลง:</span>{' '}
                          {activeResolution.hookRule} · {activeResolution.endingRule}
                        </p>
                      </div>
                    );
                  })()}
                  {Boolean(targetSection?.existingLyrics?.trim()) && (
                    <label className="flex items-center gap-2 text-[11px] font-bold text-indigo-900 cursor-pointer pt-0.5">
                      <input
                        type="checkbox"
                        checked={polishExistingDraft}
                        onChange={(e) => setPolishExistingDraft(e.target.checked)}
                        className="rounded border-indigo-300 text-indigo-600"
                      />
                      <span>
                        ✨ เกลาเนื้อเดิมในท่อนนี้ให้สัมผัสสระ+คำเป็น/คำตายลื่นไหลขึ้น (Polish Draft)
                      </span>
                    </label>
                  )}
                </div>

                {aiError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center justify-between gap-2">
                    <span>{aiError}</span>
                    {!canAfford(activeLyricCost) && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('wallet')}
                        className="px-2.5 py-1 rounded-lg bg-amber-500 text-white text-[11px] font-black cursor-pointer shrink-0"
                      >
                        {lang === 'th' ? 'เติมเครดิต' : 'Top Up'}
                      </button>
                    )}
                  </div>
                )}

                {/* Cost Preview Confirmation Box before calling /api/advance/lyrics */}
                {showCostConfirm ? (
                  <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 space-y-2.5 animate-in fade-in">
                    <div className="flex items-center justify-between text-xs font-black text-amber-950">
                      <span>⚠️ ยืนยันการใช้เครดิต (Cost Preview Confirmation)</span>
                      <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-950">
                        {lyricMode === 'deep'
                          ? 'ใช้ 2 เครดิต / Uses 2 Credits'
                          : 'ใช้ 1 เครดิต / Uses 1 Credit'}
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-900">
                      {lang === 'th'
                        ? `ระบบจะหัก ${activeLyricCost} เครดิต (คงเหลือหลังใช้ ${balance - activeLyricCost} Credits) เพื่อ${lyricMode === 'deep' ? 'แต่งเนื้อร้อง + โน้ตเมโลดี้ไกด์' : 'แต่งเนื้อร้อง'}ให้เข้ากับคอร์ด ${activeChords.join(' → ')}`
                        : `This action will deduct ${activeLyricCost} credit(s) (${balance - activeLyricCost} remaining) to generate ${lyricMode === 'deep' ? 'lyrics + guide melody notes' : 'lyrics'} matching ${activeChords.join(' → ')}.`}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleConfirmGenerate}
                        className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs cursor-pointer transition"
                      >
                        ✓{' '}
                        {lyricMode === 'deep'
                          ? lang === 'th'
                            ? 'ยืนยัน (ใช้ 2 เครดิต / Uses 2 Credits)'
                            : 'Confirm (Uses 2 Credits)'
                          : lang === 'th'
                          ? 'ยืนยัน (ใช้ 1 เครดิต / Uses 1 Credit)'
                          : 'Confirm (Uses 1 Credit)'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCostConfirm(false)}
                        className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                      >
                        {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="submit"
                    disabled={isGenerating}
                    className="w-full py-2.5 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-black text-sm shadow-sm transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>{lyricMode === 'deep' ? '🎼' : '✨'}</span>
                    <span>
                      {isGenerating
                        ? lang === 'th'
                          ? 'กำลังแต่งเนื้อเพลง...'
                          : 'Composing lyrics...'
                        : lyricMode === 'deep'
                        ? lang === 'th'
                          ? 'สร้างเนื้อ + เมโลดี้ AI (ใช้ 2 เครดิต / Uses 2 Credits)'
                          : 'Generate AI Lyrics + Melody (Uses 2 Credits)'
                        : lang === 'th'
                        ? 'สร้างเนื้อเพลง AI (ใช้ 1 เครดิต / Uses 1 Credit)'
                        : 'Generate AI Lyrics (Uses 1 Credit)'}
                    </span>
                  </button>
                )}
              </form>

              {/* AI Output */}
              {aiResult && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between gap-2 text-xs flex-wrap">
                    <span className="font-black text-slate-900">
                      🎤 {lang === 'th' ? 'คำแนะนำเนื้อเพลง (แก้ไขก่อนใส่เพลงได้)' : 'Generated Lyrics (Editable)'} ({aiResult.model})
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <select
                        aria-label="AI Singing Voice"
                        value={aiVocalVoice}
                        onChange={(e) =>
                          setAiVocalVoice(e.target.value as 'Kore' | 'Aoede' | 'Puck' | 'Charon' | 'Fenrir')
                        }
                        className="px-2 py-0.5 rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-700"
                      >
                        <option value="Kore">🎤 หญิงใส (Kore)</option>
                        <option value="Aoede">🎤 หญิงนุ่ม (Aoede)</option>
                        <option value="Puck">🎤 ชายอบอุ่น (Puck)</option>
                        <option value="Charon">🎤 ชายทุ้มร็อก (Charon)</option>
                        <option value="Fenrir">🎤 เท่ร่วมสมัย (Fenrir)</option>
                      </select>
                      {typeof aiResult.usage?.totalTokens === 'number' && !aiResult.isSimulated && (
                        <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-bold">
                          {aiResult.usage.totalTokens} tokens
                        </span>
                      )}
                      {aiResult.isSimulated && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                          Simulation Mode (0 เครดิต)
                        </span>
                      )}
                    </div>
                  </div>

                  {vocalDemoNotice && (
                    <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-[11px] font-bold">
                      {vocalDemoNotice}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    {aiResult.lines.map((line, i) => {
                      const barMelodyCount = aiResult.melodyNotesPerBar?.[i]?.length ?? 0;
                      const currentText = editableLines[i] ?? line.text;
                      const phon = analyzeThaiSyllablePhonetics(currentText);
                      const isChecked = selectedBars[i] ?? true;
                      const hasSavedAudio = Boolean(barVocalUrls[i]);
                      return (
                        <div
                          key={i}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-white border border-slate-200 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) =>
                                setSelectedBars((prev) => {
                                  const next = [...prev];
                                  next[i] = e.target.checked;
                                  return next;
                                })
                              }
                              title="เลือกนำห้องนี้ไปใช้งาน"
                              className="rounded border-slate-300 text-indigo-600 shrink-0"
                            />
                            <span className="px-2 py-0.5 rounded-md bg-blue-50 text-[#1A73E8] font-black shrink-0">
                              {line.chord}
                            </span>
                            <input
                              type="text"
                              value={currentText}
                              onChange={(e) =>
                                setEditableLines((prev) => {
                                  const next = [...prev];
                                  next[i] = e.target.value;
                                  return next;
                                })
                              }
                              className="w-full min-w-0 px-2 py-1 rounded-lg border border-transparent hover:border-slate-200 focus:border-indigo-400 focus:outline-none text-slate-800 font-medium bg-transparent focus:bg-white"
                            />
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                            <span
                              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                phon.isLiveSyllable
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-amber-50 text-amber-800 border-amber-200'
                              }`}
                            >
                              {phon.livenessLabel} · {phon.tone}
                            </span>
                            {barMelodyCount > 0 && (
                              <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold">
                                🎼 {barMelodyCount}
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold">
                              {countThaiEnglishSyllables(currentText)} {lang === 'th' ? 'พยางค์' : 'syl'}
                            </span>
                            <button
                              type="button"
                              disabled={singingBarIdx !== null}
                              onClick={() => void handleSingLineWithAi(i, currentText)}
                              title="ให้ AI ร้องวรรคนี้และบันทึกลงห้องเพลง (2 เครดิต)"
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-black border cursor-pointer transition ${
                                hasSavedAudio
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
                              }`}
                            >
                              {singingBarIdx === i
                                ? '⏳...'
                                : hasSavedAudio
                                  ? '✓ AI ร้องแล้ว'
                                  : '🎤 AI ร้อง'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {aiResult.suggestedChords && aiResult.suggestedChords.length > 0 && (
                    <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={applySuggestedChords}
                        onChange={(e) => setApplySuggestedChords(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600"
                      />
                      <span>
                        🎸 ใช้ทางคอร์ดแนะนำด้วย ({aiResult.suggestedChords.join(' → ')})
                      </span>
                    </label>
                  )}

                  <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                    <span className="text-[11px] text-slate-500">{aiResult.tip}</span>
                    {(targetSection || selectedSectionId) && onApplyLyrics && (
                      <button
                        type="button"
                        onClick={() => {
                          const finalLines = aiResult.lines.map((l, idx) => editableLines[idx] ?? l.text);
                          const chosenIndices = finalLines
                            .map((_, idx) => ((selectedBars[idx] ?? true) ? idx : -1))
                            .filter((idx) => idx >= 0);
                          onApplyLyrics(
                            selectedSectionId || targetSection?.sectionId || '',
                            finalLines,
                            aiResult.melodyNotesPerBar,
                            applySuggestedChords ? aiResult.suggestedChords : (customChords ? customChords : undefined),
                            chosenIndices
                          );
                          onClose();
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition cursor-pointer"
                      >
                        ✓{' '}
                        {aiResult.melodyNotesPerBar?.length
                          ? lang === 'th'
                            ? 'นำเนื้อ + เมโลดี้ไกด์ใส่ท่อนนี้'
                            : 'Apply Lyrics & Melody to Section'
                          : lang === 'th'
                          ? 'นำเนื้อเพลงใส่ท่อนนี้'
                          : 'Apply Lyrics to Section'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── TAB 3: CREDIT WALLET, PACKAGES & PROMPTPAY QR ─── */}
          {activeTab === 'wallet' && (
            <div className="space-y-4">
              {walletFeedback && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold">
                  ✓ {walletFeedback}
                </div>
              )}

              {/* Wallet Breakdown & Rate Reference */}
              <div className="p-3 rounded-2xl bg-amber-50/80 border border-amber-200 flex items-center justify-between gap-2 flex-wrap text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-amber-950">
                    ⚡ {lang === 'th' ? 'ยอดคงเหลือรวม:' : 'Balance:'} {walletBreakdown.balance} Credits
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-white border border-amber-200 text-amber-900 text-[11px] font-bold">
                    {lang === 'th' ? 'ทดลองฟรี' : 'Trial'}: {walletBreakdown.trialCredits}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-900 text-[11px] font-bold">
                    {lang === 'th' ? 'เครดิตที่เติม' : 'Purchased'}: {walletBreakdown.purchasedCredits}
                  </span>
                </div>
                <span className="text-[10px] text-amber-800 font-semibold">
                  {lang === 'th'
                    ? `AI Lyrics/Director ${CREDIT_COST_TABLE.aiLyricsQuick} Cr · Lyria ${CREDIT_COST_TABLE.aiReferenceTrackLyria} Cr · Argon ${CREDIT_COST_TABLE.aiProArgonArranger} Cr`
                    : `Lyrics/Director ${CREDIT_COST_TABLE.aiLyricsQuick} Cr · Lyria ${CREDIT_COST_TABLE.aiReferenceTrackLyria} Cr · Argon ${CREDIT_COST_TABLE.aiProArgonArranger} Cr`}
                </span>
              </div>

              {/* Top-Up Packages */}
              <div className="space-y-2">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">
                  ⚡ {lang === 'th' ? 'แพ็กเกจเติมเครดิต (PromptPay Top-Up)' : 'Credit Top-Up Packages'}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {CREDIT_PACKAGES.map((pkg) => (
                    <div
                      key={pkg.id}
                      className="p-3 rounded-2xl border border-slate-200 bg-slate-50/70 hover:border-blue-300 transition flex flex-col justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-slate-600">{pkg.name}</span>
                          {pkg.badge && (
                            <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-black shrink-0">
                              {pkg.badge}
                            </span>
                          )}
                        </div>
                        <div className="text-lg font-black text-slate-900 mt-0.5">
                          {pkg.credits} Credits
                        </div>
                        {pkg.bonusCredits > 0 && (
                          <div className="text-[10px] font-bold text-emerald-700">
                            {pkg.baseCredits} + {lang === 'th' ? 'แถม' : 'bonus'} {pkg.bonusCredits}
                          </div>
                        )}
                        <div className="text-sm font-black text-[#1A73E8] mt-0.5">{pkg.priceThb}฿</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleSelectTopUpPackage(pkg)}
                        className="w-full py-1.5 rounded-xl bg-slate-900 hover:bg-[#1A73E8] text-white text-xs font-bold transition cursor-pointer"
                      >
                        {lang === 'th' ? `เลือก ${pkg.priceThb}฿` : `Top Up ${pkg.priceThb}฿`}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* PromptPay Auto-Slip Checkout Panel OR Google Sign-In Gate */}
              {selectedPromptPayPkg && (
                <div className="p-4 rounded-2xl bg-blue-50/80 border-2 border-[#1A73E8] space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-sm text-blue-950">
                      📱 PromptPay QR Top-Up — {selectedPromptPayPkg.name} ({selectedPromptPayPkg.priceThb}฿)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPromptPayPkg(null);
                        setActiveOrder(null);
                        setOrderError(null);
                        resetSlipUploadState();
                      }}
                      className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  {!isAuthenticatedUser ? (
                    <div className="p-3.5 rounded-xl bg-white border border-blue-200 space-y-2.5 text-xs">
                      <div className="font-black text-slate-900">
                        🔐 {lang === 'th' ? 'กรุณาเข้าสู่ระบบด้วย Google เพื่อเติมเครดิต' : 'Sign in with Google to Top Up Credits'}
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        {lang === 'th'
                          ? 'เพื่อความปลอดภัยของยอดเหรียญและบันทึกประวัติสลิปโอนเงินเข้ากับบัญชีของคุณอย่างถาวร (ใช้งานแต่งเพลง อัดเสียงร้อง และ Export MP3/MIDI ในโหมด Guest ได้ฟรีไม่ต้องล็อกอิน)'
                          : 'Sign in so your purchased credits and verified PromptPay receipts are safely tied to your account. (Songwriting, Vocal Booth & MP3/MIDI export remain 100% free in Guest mode.)'}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        <button
                          type="button"
                          onClick={handleGoogleTopUpSignIn}
                          className="px-4 py-2 rounded-xl bg-[#1A73E8] hover:bg-blue-700 text-white font-black text-xs shadow-xs transition cursor-pointer"
                        >
                          🔑 {lang === 'th' ? 'เข้าสู่ระบบด้วย Google เพื่อเติมเครดิต' : 'Sign in with Google to Top Up'}
                        </button>
                        {demoTopUpAllowed && (
                          <button
                            type="button"
                            onClick={() => handleConfirmMockPayment(selectedPromptPayPkg)}
                            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition cursor-pointer"
                          >
                            🧪 {lang === 'th' ? `จำลองโหมดทดสอบ (+${selectedPromptPayPkg.credits})` : `Standalone Demo (+${selectedPromptPayPkg.credits})`}
                          </button>
                        )}
                      </div>
                    </div>
                  ) : isCreatingOrder ? (
                    <div className="p-4 rounded-xl bg-white border border-blue-200 text-xs font-bold text-blue-900">
                      ⏳ {lang === 'th' ? 'กำลังสร้าง PromptPay QR สำหรับยอดชำระที่ล็อกไว้...' : 'Generating locked-amount PromptPay QR...'}
                    </div>
                  ) : orderError ? (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-2">
                      <div className="font-bold">⚠️ {orderError}</div>
                      {demoTopUpAllowed && (
                        <button
                          type="button"
                          onClick={() => handleConfirmMockPayment(selectedPromptPayPkg)}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-[11px] font-bold cursor-pointer"
                        >
                          🧪 {lang === 'th' ? `จำลองโหมดทดสอบออฟไลน์ (+${selectedPromptPayPkg.credits})` : `Fallback Demo (+${selectedPromptPayPkg.credits})`}
                        </button>
                      )}
                    </div>
                  ) : activeOrder ? (
                    <div className="space-y-3">
                      <div className="flex items-start gap-4 flex-wrap sm:flex-nowrap bg-white p-3.5 rounded-xl border border-blue-200">
                        {/* Scannable EMVCo PromptPay QR SVG */}
                        <div className="w-32 h-32 rounded-xl bg-white border border-slate-200 p-1.5 flex items-center justify-center shrink-0 shadow-xs">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={activeOrder.qrSvgDataUrl}
                            alt={`PromptPay QR ${activeOrder.amountThb} THB`}
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="flex-1 min-w-0 space-y-1.5 text-xs">
                          <div className="font-black text-slate-900 text-sm">
                            {activeOrder.creditsToGrant} Credits · {activeOrder.amountThb.toFixed(2)}฿
                          </div>
                          <div className="text-[11px] text-slate-600">
                            {lang === 'th' ? 'ชื่อบัญชีผู้รับ:' : 'Receiver:'}{' '}
                            <span className="font-bold text-slate-900">{activeOrder.receiverName}</span>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            PromptPay: <span className="font-mono font-bold">{activeOrder.maskedReceiver}</span>
                          </div>
                          <p className="text-[11px] text-blue-800 bg-blue-50 rounded-lg px-2.5 py-1.5 leading-relaxed">
                            {lang === 'th'
                              ? '1) เปิดแอปธนาคารสแกน QR นี้ (ยอดเงินถูกล็อกตรงตามแพ็กเกจ) 2) อัปโหลดสลิปที่มี QR Code ด้านล่าง ระบบตรวจสลิปและเติมเหรียญให้อัตโนมัติภายใน 3 วินาที'
                              : '1) Scan with any Thai banking app 2) Upload the receipt slip below for automatic verification & instant credit grant.'}
                          </p>
                        </div>
                      </div>

                      {/* Auto-Slip Upload Dropzone */}
                      <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2.5 text-xs">
                        <label htmlFor="promptpay-slip-file" className="font-black text-slate-800 block">
                          📎 {lang === 'th' ? 'อัปโหลดสลิปโอนเงินเพื่อรับเหรียญอัตโนมัติ (JPG / PNG / WebP ≤ 4MB)' : 'Upload Transfer Slip (JPG / PNG / WebP ≤ 4MB)'}
                        </label>
                        <input
                          id="promptpay-slip-file"
                          name="promptpaySlipFile"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) => handleSlipFileSelected(e.target.files?.[0] ?? null)}
                          className="block w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-[#1A73E8] hover:file:bg-blue-100 cursor-pointer"
                        />

                        {slipPreviewUrl && (
                          <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-50 border border-slate-200">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={slipPreviewUrl}
                              alt="Slip preview"
                              className="w-14 h-16 object-cover rounded-lg border border-slate-200 shrink-0"
                            />
                            <div className="min-w-0 flex-1 text-[11px]">
                              <div className="font-bold text-slate-800 truncate">{slipFile?.name}</div>
                              <div className="text-slate-500">
                                {slipFile ? `${(slipFile.size / 1024).toFixed(1)} KB` : ''}
                              </div>
                            </div>
                          </div>
                        )}

                        {slipError && (
                          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-bold">
                            ⚠️ {slipError}
                          </div>
                        )}

                        <button
                          type="button"
                          disabled={!slipFile || isVerifyingSlip}
                          onClick={() => void handleSubmitSlipVerification()}
                          className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-black text-xs transition cursor-pointer"
                        >
                          {isVerifyingSlip
                            ? lang === 'th'
                              ? '⏳ กำลังตรวจสอบสลิปและปรับยอดเครดิต...'
                              : '⏳ Verifying slip & crediting...'
                            : lang === 'th'
                            ? `✓ ยืนยันสลิป & เติม +${activeOrder.creditsToGrant} Credits ทันที`
                            : `✓ Verify Slip & Add +${activeOrder.creditsToGrant} Credits`}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Transaction History */}
              <div className="space-y-2">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">
                  📜 {lang === 'th' ? 'ประวัติรายการเครดิต' : 'Transaction History'}
                </h4>
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
                  {transactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/80 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 truncate">{tx.description}</div>
                        <div className="text-[10px] text-slate-400">
                          {new Date(tx.createdAt).toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                      <span
                        className={`font-black shrink-0 ${
                          tx.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {tx.amount >= 0 ? `+${tx.amount}` : tx.amount}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ─── TAB 4: AI STUDIO DIRECTOR (0 CREDITS LOCAL / 1 CREDIT GEMINI AI) ─── */}
          {activeTab === 'ai-director' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-purple-50/80 border border-purple-200 space-y-1">
                <div className="text-xs font-black text-purple-900 flex items-center justify-between gap-2 flex-wrap">
                  <span>
                    🪄{' '}
                    {lang === 'th'
                      ? 'AI Studio Director — ปรับค่าเพลงด้วยภาษาธรรมชาติ'
                      : 'Natural-Language AI Studio Director'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-white border border-purple-200 text-purple-800 text-[10px] font-bold">
                    {lang === 'th'
                      ? '0 เครดิต (ในเครื่อง) · 1 เครดิต (Gemini AI)'
                      : '0 Cr Local · 1 Cr Gemini AI'}
                  </span>
                </div>
                <p className="text-[11px] text-purple-700 font-medium leading-relaxed">
                  {lang === 'th'
                    ? 'คำสั่งระบุค่าตรงๆ (เช่น BPM, คีย์, เปิด/ปิดเครื่องดนตรี) ทำงานฟรีในเครื่อง 0 เครดิต ส่วนคำสั่งปรับฟีล/เรียบเรียงทั้งเพลงจะใช้ AI โปรดิวเซอร์ (1 เครดิต)'
                    : 'Direct parameter commands run locally at 0 Credits. Creative mood/arrangement prompts use Gemini AI Producer (1 Credit).'}
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-slate-600">
                  {lang === 'th' ? '💡 ตัวอย่างคำสั่งคลิกด่วน:' : '💡 Quick Prompt Examples:'}
                </div>
                <div className="flex flex-col gap-1.5">
                  {AI_DIRECTOR_PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setDirectorPrompt(preset);
                        setDirectorNotice(null);
                        setShowDirectorCostConfirm(false);
                      }}
                      className="text-left text-[11px] font-medium px-3 py-2 rounded-xl bg-slate-50 hover:bg-purple-50 border border-slate-200 hover:border-purple-300 text-slate-700 transition cursor-pointer"
                    >
                      “{preset}”
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleApplyDirectorPrompt} className="space-y-3">
                <textarea
                  rows={3}
                  value={directorPrompt}
                  onChange={(e) => {
                    setDirectorPrompt(e.target.value);
                    setShowDirectorCostConfirm(false);
                  }}
                  placeholder={
                    lang === 'th'
                      ? 'เช่น ตั้งความเร็ว 95 bpm คีย์ G (0 เครดิต) หรือ "อยากได้ฟีล Acoustic อุ่นๆ เหมือนร้านกาแฟ" (1 เครดิต)...'
                      : 'e.g. Set 95 bpm key G (0 Cr) or "Warm coffee-shop acoustic feel with lifted chorus" (1 Cr)...'
                  }
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-purple-200 bg-white text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-400"
                />

                {directorClassification && (
                  <div className="flex items-center justify-between gap-2 text-[11px] px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="font-semibold text-slate-600">
                      {directorClassification.reason}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full font-black shrink-0 ${
                        directorClassification.mode === 'local'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}
                    >
                      {directorClassification.mode === 'local' ? '0 Credits' : '1 Credit'}
                    </span>
                  </div>
                )}

                {showDirectorCostConfirm ? (
                  <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 space-y-2.5 animate-in fade-in">
                    <div className="flex items-center justify-between text-xs font-black text-amber-950">
                      <span>⚠️ {lang === 'th' ? 'ยืนยันใช้ AI โปรดิวเซอร์' : 'Confirm AI Producer Call'}</span>
                      <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-950">
                        ใช้ 1 เครดิต / Uses 1 Credit
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-900">
                      {lang === 'th'
                        ? 'จะเรียกใช้ Gemini 3.5 Flash Lite เพื่อออกแบบ Arrangement ให้ทั้งเพลง (หัก 1 เครดิตเฉพาะเมื่อสำเร็จ)'
                        : 'Calls Gemini 3.5 Flash Lite to arrange your song patch (charged 1 credit only on non-simulated success).'}
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={executeDirectorAi}
                        disabled={isApplyingDirector}
                        className="flex-1 py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-black text-xs cursor-pointer transition"
                      >
                        ✓ {lang === 'th' ? 'ยืนยันใช้ AI (1 เครดิต)' : 'Confirm AI (1 Credit)'}
                      </button>
                      <button
                        type="button"
                        onClick={() => executeDirectorLocal()}
                        className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                      >
                        {lang === 'th' ? 'ลองปรับในเครื่อง (0 เครดิต)' : 'Run Local (0 Cr)'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDirectorCostConfirm(false)}
                        className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-500 font-bold text-xs cursor-pointer"
                      >
                        {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 flex-col sm:flex-row">
                    <button
                      type="submit"
                      disabled={!song || !onApplySongUpdate || !directorPrompt.trim() || isApplyingDirector}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-black text-xs sm:text-sm shadow-xs transition cursor-pointer"
                    >
                      {isApplyingDirector
                        ? lang === 'th'
                          ? '⏳ กำลังวิเคราะห์ด้วย Gemini AI...'
                          : '⏳ Analyzing with Gemini AI...'
                        : directorClassification?.mode === 'ai'
                          ? `✨ ${lang === 'th' ? 'ให้ AI โปรดิวเซอร์วิเคราะห์ (1 เครดิต)' : 'Analyze with AI Producer (1 Credit)'}`
                          : `⚡ ${lang === 'th' ? 'ปรับค่าในเครื่องทันที (0 เครดิต)' : 'Apply Locally Now (0 Credits)'}`}
                    </button>
                    {directorClassification?.mode === 'local' && (
                      <button
                        type="button"
                        disabled={!song || !onApplySongUpdate || !directorPrompt.trim() || isApplyingDirector}
                        onClick={() => setShowDirectorCostConfirm(true)}
                        className="px-3.5 py-2.5 rounded-xl border border-purple-300 bg-purple-50 hover:bg-purple-100 text-purple-800 font-bold text-xs cursor-pointer transition shrink-0"
                      >
                        ✨ {lang === 'th' ? 'ใช้ AI วิเคราะห์ (1 เครดิต)' : 'Use AI (1 Cr)'}
                      </button>
                    )}
                  </div>
                )}
              </form>

              {directorEngineInfo && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-[11px] flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`font-black px-2 py-0.5 rounded-full ${
                        directorEngineInfo.isSimulated
                          ? 'bg-slate-200 text-slate-700'
                          : 'bg-purple-600 text-white'
                      }`}
                    >
                      {directorEngineInfo.isSimulated
                        ? `⚡ ${directorEngineInfo.model}`
                        : `✨ ${directorEngineInfo.model}`}
                    </span>
                    {typeof directorEngineInfo.totalTokens === 'number' && !directorEngineInfo.isSimulated && (
                      <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600 font-bold">
                        {directorEngineInfo.totalTokens} tokens
                      </span>
                    )}
                  </div>
                  <span className="text-slate-600 font-medium truncate" title={directorEngineInfo.tip}>
                    {directorEngineInfo.tip}
                  </span>
                </div>
              )}

              {directorNotice && (
                <div
                  className={`p-3 rounded-xl border text-xs font-bold ${
                    directorNotice.ok
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  {directorNotice.ok ? '✅ ' : '⚠️ '}
                  {directorNotice.text}
                </div>
              )}

              {directorActions.length > 0 && (
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="text-[11px] font-black text-slate-700">
                    {lang === 'th' ? 'รายการที่ AI ปรับแต่งให้ล่าสุด:' : 'Applied Changes:'}
                  </div>
                  <ul className="space-y-1 max-h-40 overflow-y-auto">
                    {directorActions.map((act, i) => (
                      <li key={i} className="text-[11px] font-medium text-slate-700 flex items-start gap-1.5">
                        <span className="text-purple-600 font-bold">•</span>
                        <span>{act}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ─── TAB: AI REFERENCE TRACK (LYRIA 3.5 · 8 CREDITS · PAID CREDITS ONLY) ─── */}
          {activeTab === 'reference' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-2 text-xs flex-wrap">
                <div>
                  <div className="font-bold text-amber-950">
                    🎧 {lang === 'th' ? 'AI Studio Master: ต่อยอดเดโมนี้เป็นเพลงเต็ม (Lyria 3.5)' : 'AI Studio Master: Full Song from Demo (Lyria 3.5)'}
                  </div>
                  <div className="text-[11px] text-amber-800">
                    {lang === 'th'
                      ? 'สังเคราะห์ไฟล์เสียง Reference ระดับสตูดิโอจากคอร์ด + เนื้อร้อง + เมโลดี้ + สไตล์วงทั้งเพลง เพื่อฟังเทียบกับไฟล์ Export .MP3'
                      : 'Synthesize a studio AI master reference from your full demo chords, lyrics, melody, and band style.'}
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-white border border-amber-300 text-amber-950 font-black shrink-0">
                  ใช้ {AI_REFERENCE_COST} เหรียญ · Pro
                </span>
              </div>

              {fullDemoBlueprint && (
                <div className="p-3 rounded-2xl bg-white border border-amber-200/80 space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-slate-800">
                      ✨ {lang === 'th' ? 'พิมพ์เขียวเดโมทั้งเพลง (Full Demo Blueprint)' : 'Full Demo Blueprint'}
                    </span>
                    <button
                      type="button"
                      aria-pressed={useFullDemoBlueprint}
                      onClick={() => setUseFullDemoBlueprint((v) => !v)}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition ${
                        useFullDemoBlueprint
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {useFullDemoBlueprint ? '✓ ' : '○ '}
                      {lang === 'th' ? 'ส่งข้อมูลครบทั้งเพลง' : 'Use Full Song Blueprint'}
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold text-amber-950">
                    <span className="px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200">
                      {fullDemoBlueprint.blueprintSummary.sectionCount} {lang === 'th' ? 'ท่อน' : 'Sections'}
                    </span>
                    <span className="px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200">
                      {fullDemoBlueprint.blueprintSummary.totalBars} {lang === 'th' ? 'ห้อง' : 'Bars'}
                    </span>
                    <span className="px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200">
                      {fullDemoBlueprint.blueprintSummary.lyricLinesCount} {lang === 'th' ? 'บรรทัดเนื้อร้อง' : 'Lyric Lines'}
                    </span>
                    <span className="px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200">
                      {fullDemoBlueprint.blueprintSummary.melodyBarsCount} {lang === 'th' ? 'ห้องเมโลดี้' : 'Melody Bars'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowRefBlueprintPreview((v) => !v)}
                    className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-700 cursor-pointer transition"
                  >
                    👁️ {showRefBlueprintPreview
                      ? lang === 'th'
                        ? 'ซ่อน Mock Preview Summary (ฟรี)'
                        : 'Hide Preview (Free)'
                      : lang === 'th'
                        ? 'ดู Mock Preview Summary / Blueprint Prompt (ฟรี 0 เครดิต)'
                        : 'Preview Blueprint Prompt (0 Credits)'}
                  </button>

                  {showRefBlueprintPreview && (
                    <pre className="text-[11px] font-mono-tabular text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-200 whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed">
                      {fullDemoBlueprint.promptUsed}
                    </pre>
                  )}
                </div>
              )}

              {!refPaidGate.allowed ? (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 space-y-2.5 text-xs">
                  <div className="font-black text-rose-900">
                    🔒 {lang === 'th' ? 'สงวนเฉพาะเครดิตเติมเงิน (Paid Credits Only)' : 'Paid Credits Required'}
                  </div>
                  <p className="text-rose-800 leading-relaxed">{getPaidGateMessage(refPaidGate.reason)}</p>
                  <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                    <span className="text-[11px] font-bold text-rose-700">
                      เครดิตทดลอง: {walletBreakdown.trialCredits} · เครดิตเติมเงิน: {walletBreakdown.purchasedCredits}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('wallet')}
                      className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs cursor-pointer transition"
                    >
                      💳 {lang === 'th' ? 'เติมเครดิต Mini 49฿ เพื่อปลดล็อก' : 'Top Up Mini Pack to Unlock'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      {lang === 'th' ? 'คำแนะนำโทนเสียงเพิ่มเติม (ไม่บังคับ)' : 'Optional Tone Direction'}
                    </label>
                    <input
                      type="text"
                      maxLength={300}
                      value={refNotes}
                      onChange={(e) => setRefNotes(e.target.value)}
                      placeholder={
                        lang === 'th'
                          ? 'เช่น กีตาร์โปร่งอุ่นๆ คล้ายวงอินดี้โฟล์ค เคาะคาฮอนเบาๆ'
                          : 'e.g. Warm intimate coffee-shop acoustic pop with brushed cajon'
                      }
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 bg-white"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <button
                      type="button"
                      aria-pressed={refInstrumental}
                      onClick={() => setRefInstrumental((v) => !v)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition ${
                        refInstrumental
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      {refInstrumental ? '✓ ' : '○ '}
                      {lang === 'th' ? 'เฉพาะดนตรี (ไม่มีเสียงร้อง AI)' : 'Instrumental Only'}
                    </button>

                    <span className="text-[11px] font-semibold text-slate-500">
                      เครดิตเติมเงินคงเหลือ: {walletBreakdown.purchasedCredits} เหรียญ
                    </span>
                  </div>

                  {showRefCostConfirm ? (
                    <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 space-y-2.5 animate-in fade-in">
                      <div className="flex items-center justify-between text-xs font-black text-amber-950">
                        <span>⚠️ {lang === 'th' ? 'ยืนยันสร้างแทร็ก Lyria 3.5' : 'Confirm Lyria 3.5 Generation'}</span>
                        <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-950">
                          ใช้ 8 เหรียญ / Uses 8 Credits
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-900">
                        {lang === 'th'
                          ? 'จะเรียกใช้โมเดล Google Lyria 3.5 สังเคราะห์เสียง MP3 อ้างอิงจากโครงเพลงของคุณ (หัก 8 เหรียญเฉพาะเมื่อได้ไฟล์เสียงจริง)'
                          : 'Calls Lyria 3.5 to synthesize an MP3 reference demo (charged 8 credits only if non-simulated audio returns).'}
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleGenerateReferenceTrack}
                          disabled={isGeneratingRef}
                          className="flex-1 py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs cursor-pointer transition"
                        >
                          ✓ {lang === 'th' ? 'ยืนยันใช้ 8 เหรียญ' : 'Confirm (8 Credits)'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowRefCostConfirm(false)}
                          className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold text-xs cursor-pointer"
                        >
                          {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={isGeneratingRef}
                      onClick={() => setShowRefCostConfirm(true)}
                      className="w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-black text-xs sm:text-sm cursor-pointer transition"
                    >
                      {isGeneratingRef
                        ? lang === 'th'
                          ? '⏳ กำลังสังเคราะห์เสียงด้วย Lyria 3.5...'
                          : '⏳ Generating Lyria 3.5 audio...'
                        : `🎧 ${lang === 'th' ? 'สร้างแทร็กเสียงอ้างอิง Lyria 3.5 (ใช้ 8 เหรียญ)' : 'Generate Reference Track (Use 8 Credits)'}`}
                    </button>
                  )}
                </div>
              )}

              {refError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-800">
                  ⚠️ {refError}
                </div>
              )}

              {refResult && (
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span
                      className={`px-2 py-0.5 rounded-full font-black ${
                        refResult.isSimulated
                          ? 'bg-slate-200 text-slate-700'
                          : 'bg-amber-600 text-white'
                      }`}
                    >
                      {refResult.isSimulated ? `⚡ ${refResult.model} (จำลอง)` : `✨ ${refResult.model}`}
                    </span>
                    <span className="text-[11px] font-medium text-slate-600">{refResult.tip}</span>
                  </div>

                  {refResult.blueprintSummary && (
                    <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold text-amber-950">
                      <span className="px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200">
                        {refResult.blueprintSummary.sectionCount} {lang === 'th' ? 'ท่อน' : 'Sections'}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200">
                        {refResult.blueprintSummary.totalBars} {lang === 'th' ? 'ห้อง' : 'Bars'}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200">
                        {refResult.blueprintSummary.lyricLinesCount} {lang === 'th' ? 'บรรทัดเนื้อร้อง' : 'Lyric Lines'}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200">
                        {refResult.blueprintSummary.melodyBarsCount} {lang === 'th' ? 'ห้องเมโลดี้' : 'Melody Bars'}
                      </span>
                    </div>
                  )}

                  {refResult.audioDataUrl && (
                    <div className="space-y-2 pt-1">
                      <audio controls src={refResult.audioDataUrl} className="w-full" />
                      <a
                        href={refResult.audioDataUrl}
                        download={`${(song?.title || 'reference').replace(/[^a-zA-Z0-9_\u0E00-\u0E7F-]/g, '_')}_lyria_ref.mp3`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-slate-800 font-bold text-xs hover:bg-slate-100"
                      >
                        ⬇ {lang === 'th' ? 'ดาวน์โหลด Reference (.MP3)' : 'Download Reference (.MP3)'}
                      </a>
                    </div>
                  )}

                  {refResult.promptUsed && (
                    <div className="text-[11px] text-slate-600 bg-white p-2.5 rounded-xl border border-slate-200">
                      <span className="font-bold text-slate-700">Prompt: </span>
                      {refResult.promptUsed}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
