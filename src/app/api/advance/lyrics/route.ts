import {
  analyzeThaiSyllablePhonetics,
  countThaiEnglishSyllables,
  validateThaiLyricCouplets,
  type ThaiLyricCoupletReport,
  type ThaiSyllablePhonetics,
} from '@/lib/thaiRhymeHelper';
import {
  buildLyricsSystemPrompt,
  buildLyricsUserPrompt,
  buildSingleBarVariationsUserPrompt,
  LYRICS_DEEP_RESPONSE_SCHEMA,
  LYRICS_RESPONSE_SCHEMA,
  SINGLE_BAR_VARIATIONS_SCHEMA,
} from '@/lib/aiPrompts';
import {
  callGeminiJson,
  GEMINI_MODEL_LITE,
  GEMINI_MODEL_MAIN,
  type GeminiTokenUsage,
} from '@/lib/geminiClient';
import { CREDIT_COST_TABLE } from '@/lib/creditManager';
import { generateLyricAlignedGuideMelody } from '@/lib/melodyUtils';
import {
  refundServerBillingOnFailure,
  tryServerBillingPreDeduct,
  type WalletBalanceSummary,
} from '@/lib/serverWallet';
import { recordServerFeatureEvent } from '@/lib/serverAnalytics';

export const maxDuration = 60;
import {
  buildDiatonicGuideNotesForChord,
  buildSimulatedSingleBarVariations,
  buildStyledSimulatedSongLyrics,
  clampMelodyNotesForBar,
} from '@/lib/songArchitect';
import type {
  MelodyNote,
  SectionType,
  ThaiEmotionalResolution,
  ThaiLyricDialect,
  ThaiLyricEra,
  ThaiSongGenre,
  ThaiSongwriterStyle,
  TimeSignature,
} from '@/types/song';

export interface AdvanceLyricsBarInput {
  chord: string;
  chord2?: string;
  chordsPerBar?: 1 | 2;
  existingLyrics?: string;
}

export interface AdvanceLyricsRequestBody {
  mood: string;
  topic: string;
  chordProgression: string[];
  existingLyrics?: string;
  sectionType: SectionType;
  bpm?: number;
  timeSignature?: TimeSignature;
  previousSectionLyrics?: string[];
  mode?: 'quick' | 'deep';
  barCount?: number;
  bars?: AdvanceLyricsBarInput[];
  thaiGenre?: ThaiSongGenre;
  lyricEra?: ThaiLyricEra;
  lyricDialect?: ThaiLyricDialect;
  songwriterStyle?: ThaiSongwriterStyle;
  emotionalResolution?: ThaiEmotionalResolution;
  songTitle?: string;
  allPriorSections?: Array<{ name: string; type: string; lyrics: string[] }>;
  polishExistingDraft?: boolean;
  singleBarIndex?: number;
}

export interface AdvanceLyricLine {
  chord: string;
  text: string;
  syllables: number;
  phonetics?: ThaiSyllablePhonetics;
}

export interface AdvanceLyricsResponseBody {
  isSimulated: boolean;
  model: string;
  sectionType: string;
  chordsUsed: string[];
  lines: AdvanceLyricLine[];
  fullLyrics: string;
  tip: string;
  variations?: string[];
  singleBarIndex?: number;
  rhymeNotes?: string[];
  suggestedChords?: string[];
  melodyNotesPerBar?: MelodyNote[][];
  rhymeValidation?: ThaiLyricCoupletReport;
  usage?: GeminiTokenUsage;
  wallet?: WalletBalanceSummary;
  failureReason?: string;
}

interface GeminiLyricsPayload {
  lines?: unknown;
  variations?: unknown;
  rhymeNotes?: unknown;
  suggestedChords?: unknown;
  melodyNotesPerBar?: unknown;
  tip?: unknown;
}

const VALID_SECTIONS = new Set<SectionType>([
  'intro',
  'verse',
  'pre-chorus',
  'chorus',
  'solo',
  'bridge',
  'outro',
]);

const VALID_TIME_SIGNATURES = new Set<TimeSignature>(['4/4', '3/4', '6/8']);

function normalizeSectionType(raw: unknown): SectionType {
  if (typeof raw === 'string') {
    const trimmed = raw.trim().toLowerCase() as SectionType;
    if (VALID_SECTIONS.has(trimmed)) {
      return trimmed;
    }
  }
  return 'verse';
}

function buildSimulatedLyrics(
  body: AdvanceLyricsRequestBody,
  tipOverride?: string,
  failureReason?: string
): AdvanceLyricsResponseBody {
  const expectedBars = Math.min(
    8,
    Math.max(2, body.barCount ?? (body.bars && body.bars.length >= 2 ? body.bars.length : 4))
  );
  const chords = body.chordProgression.length > 0 ? body.chordProgression : ['C', 'G', 'Am', 'F'];
  const topic = body.topic.trim();
  const sec = body.sectionType.toLowerCase();

  const bundle = buildStyledSimulatedSongLyrics({
    topic,
    mood: body.mood,
    thaiGenre: body.thaiGenre,
    lyricDialect: body.lyricDialect,
    songwriterStyle: body.songwriterStyle,
    emotionalResolution: body.emotionalResolution,
  });

  const primaryPool =
    sec === 'outro'
      ? bundle.outro
      : sec === 'pre-chorus'
        ? bundle['pre-chorus']
        : sec === 'bridge'
          ? bundle.bridge
          : sec === 'chorus'
            ? bundle.chorus
            : bundle.verse;

  const basePool =
    primaryPool.length >= expectedBars
      ? primaryPool
      : [...primaryPool, ...bundle.verse, ...bundle.chorus, ...bundle.outro];
  const rhymeNotes = [bundle.rhymeNote];

  const templates = basePool.slice(0, expectedBars);
  if (body.existingLyrics?.trim()) {
    templates[0] = `${body.existingLyrics.trim()} (${topic || 'สานต่อเรื่องราว'})`;
  }

  const lines: AdvanceLyricLine[] = templates.map((text, idx) => ({
    chord: body.bars?.[idx]?.chord || chords[idx % chords.length],
    text,
    syllables: countThaiEnglishSyllables(text),
    phonetics: analyzeThaiSyllablePhonetics(text),
  }));

  const melodyNotesPerBar: MelodyNote[][] | undefined =
    body.mode === 'deep'
      ? lines.map((line, idx) =>
          buildDiatonicGuideNotesForChord(
            line.chord,
            idx,
            line.text,
            body.bars?.[idx]?.chordsPerBar === 2 ? body.bars[idx].chord2 : undefined,
            body.sectionType
          )
        )
      : undefined;

  return {
    isSimulated: true,
    model: 'demo-offline-poet',
    sectionType: body.sectionType,
    chordsUsed: chords,
    lines,
    fullLyrics: lines.map((l) => l.text).join('\n'),
    rhymeNotes,
    suggestedChords: lines.map((l) => l.chord),
    rhymeValidation: validateThaiLyricCouplets(
      lines.map((l) => l.text),
      { bpm: body.bpm, timeSignature: body.timeSignature }
    ),
    ...(melodyNotesPerBar ? { melodyNotesPerBar } : {}),
    tip:
      tipOverride ??
      `โหมดจำลอง (ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์) — ระบบไม่หักเครดิตของคุณ สามารถตั้งคีย์เพื่อเปิดใช้ ${body.mode === 'deep' ? GEMINI_MODEL_MAIN : GEMINI_MODEL_LITE} ได้ทันที`,
    failureReason,
  };
}

async function handleSingleBarVariations(
  request: Request,
  body: AdvanceLyricsRequestBody,
  singleBarIndex: number
): Promise<Response> {
  const chords = body.chordProgression.length > 0 ? body.chordProgression : ['C', 'G', 'Am', 'F'];
  const targetBar = body.bars?.[singleBarIndex];
  const targetChord = targetBar?.chord || chords[singleBarIndex % chords.length] || 'C';

  const existingLines =
    body.bars && body.bars.length > 0
      ? body.bars.map((b) => (b.existingLyrics ?? '').trim())
      : body.existingLyrics
        ? body.existingLyrics.split('\n').map((l) => l.trim())
        : [];
  const prevSameSection = singleBarIndex > 0 ? existingLines[singleBarIndex - 1] : '';
  const prevCrossSection =
    !prevSameSection && body.previousSectionLyrics && body.previousSectionLyrics.length > 0
      ? [...body.previousSectionLyrics].reverse().find((l) => l.trim().length > 0)?.trim() || ''
      : '';
  const prevLine = prevSameSection || prevCrossSection;
  const nextLine =
    singleBarIndex + 1 < existingLines.length ? existingLines[singleBarIndex + 1] : '';
  const existingBarText = (targetBar?.existingLyrics ?? existingLines[singleBarIndex] ?? '').trim();

  const buildSimulatedFallback = (
    tipOverride?: string,
    failureReason?: string,
    wallet?: WalletBalanceSummary
  ): Response => {
    const sim = buildSimulatedSingleBarVariations({
      mood: body.mood,
      topic: body.topic,
      chord: targetChord,
      sectionType: body.sectionType,
      singleBarIndex,
      prevLine,
      nextLine,
      existingBarText,
      thaiGenre: body.thaiGenre,
      lyricDialect: body.lyricDialect,
      songwriterStyle: body.songwriterStyle,
      emotionalResolution: body.emotionalResolution,
    });
    const lines: AdvanceLyricLine[] = sim.variations.map((text) => ({
      chord: targetChord,
      text,
      syllables: countThaiEnglishSyllables(text),
      phonetics: analyzeThaiSyllablePhonetics(text),
    }));
    const resBody: AdvanceLyricsResponseBody = {
      isSimulated: true,
      model: 'demo-offline-poet',
      sectionType: body.sectionType,
      singleBarIndex,
      chordsUsed: [targetChord],
      variations: sim.variations,
      lines,
      fullLyrics: sim.variations.join('\n'),
      rhymeNotes: sim.rhymeNotes,
      suggestedChords: [targetChord],
      tip: tipOverride ?? sim.tip,
      ...(failureReason ? { failureReason } : {}),
      ...(wallet ? { wallet } : {}),
    };
    return Response.json(resBody, { status: 200 });
  };

  const targetModel = GEMINI_MODEL_LITE;
  const creditCost = CREDIT_COST_TABLE.aiLyricsQuick;

  const billing = await tryServerBillingPreDeduct(
    request,
    creditCost,
    `AI Lyrics [single-bar:${singleBarIndex + 1}] (${targetModel}): ${body.sectionType}`,
    { modelId: targetModel }
  );
  if (billing.active && 'errorStatus' in billing) {
    return Response.json(
      { error: billing.error, code: billing.errorCode },
      { status: billing.errorStatus }
    );
  }

  const systemInstruction = buildLyricsSystemPrompt({
    bpm: body.bpm,
    timeSignature: body.timeSignature,
    sectionType: body.sectionType,
    barCount: Math.max(2, body.bars?.length || body.barCount || 4),
    thaiGenre: body.thaiGenre,
    lyricEra: body.lyricEra,
    lyricDialect: body.lyricDialect,
    songwriterStyle: body.songwriterStyle,
    emotionalResolution: body.emotionalResolution,
    polishExistingDraft: Boolean(existingBarText),
  });

  const userPrompt = buildSingleBarVariationsUserPrompt({
    mood: body.mood,
    topic: body.topic,
    chordProgression: chords,
    existingLyrics: existingLines,
    sectionType: body.sectionType,
    bpm: body.bpm,
    timeSignature: body.timeSignature,
    previousSectionLyrics: body.previousSectionLyrics,
    mode: 'quick',
    barCount: body.bars?.length || body.barCount || 4,
    bars: body.bars,
    thaiGenre: body.thaiGenre,
    lyricEra: body.lyricEra,
    lyricDialect: body.lyricDialect,
    songwriterStyle: body.songwriterStyle,
    emotionalResolution: body.emotionalResolution,
    songTitle: body.songTitle,
    singleBarIndex,
  });

  const gemini = await callGeminiJson<GeminiLyricsPayload>(userPrompt, {
    model: targetModel,
    systemInstruction,
    responseSchema: SINGLE_BAR_VARIATIONS_SCHEMA,
    maxOutputTokens: 1024,
    thinkingLevel: 'minimal',
  });

  if (!gemini.ok) {
    let tipOverride: string | undefined;
    if (gemini.reason === 'rate-limit') {
      tipOverride =
        'โควตาคำขอ Gemini API เต็มชั่วคราว (429) — แสดงผล 3 ตัวเลือกจำลองแทนและไม่หักเครดิตของคุณ';
    } else if (gemini.reason === 'auth-error') {
      tipOverride =
        'GEMINI_API_KEY ไม่ถูกต้องหรือไม่มีสิทธิ์เข้าถึงโมเดล — แสดงผล 3 ตัวเลือกจำลองแทนและไม่หักเครดิต';
    } else if (gemini.reason !== 'missing-key') {
      tipOverride = `${gemini.failureReason} — แสดงผล 3 ตัวเลือกจำลองแทนอย่างปลอดภัย (ไม่หักเครดิต)`;
    }

    const refundedWallet = await refundServerBillingOnFailure(
      billing,
      creditCost,
      `Auto-refund Single-Bar Variations (${gemini.reason})`,
      { modelId: targetModel }
    );
    await recordServerFeatureEvent(
      request,
      {
        eventName: 'ai_lyrics_single_bar',
        category: 'ai',
        songwriterStyle: body.songwriterStyle,
        thaiGenre: body.thaiGenre,
        lyricDialect: body.lyricDialect,
        lyricEra: body.lyricEra,
        emotionalResolution: body.emotionalResolution,
        featureVariant: body.sectionType,
        isSimulated: true,
        creditsCost: 0,
        metadata: { mode: body.mode ?? 'quick', reason: gemini.reason },
      },
      {
        userId: billing.active && 'userId' in billing ? billing.userId : undefined,
        skipAuthLookup: billing.active,
      }
    );
    return buildSimulatedFallback(tipOverride, gemini.reason, refundedWallet);
  }

  const rawVariations = Array.isArray(gemini.data.variations)
    ? gemini.data.variations
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        .map((v) => v.trim())
    : [];

  const uniqueVariations: string[] = [];
  for (const v of rawVariations) {
    if (!uniqueVariations.includes(v)) uniqueVariations.push(v);
  }

  if (uniqueVariations.length === 0) {
    const refundedWallet = await refundServerBillingOnFailure(
      billing,
      creditCost,
      'Auto-refund Single-Bar Variations (parse-error)',
      { modelId: targetModel }
    );
    return buildSimulatedFallback(
      'ผลลัพธ์จาก AI ไม่พบตัวเลือกสำหรับห้องนี้ — สลับเป็น 3 ตัวเลือกจำลองอัตโนมัติ (ไม่หักเครดิต)',
      'parse-error',
      refundedWallet
    );
  }

  if (uniqueVariations.length < 3) {
    const simPad = buildSimulatedSingleBarVariations({
      mood: body.mood,
      topic: body.topic,
      chord: targetChord,
      sectionType: body.sectionType,
      singleBarIndex,
      prevLine,
      nextLine,
      existingBarText,
      thaiGenre: body.thaiGenre,
      lyricDialect: body.lyricDialect,
      songwriterStyle: body.songwriterStyle,
      emotionalResolution: body.emotionalResolution,
    });
    for (const candidate of simPad.variations) {
      if (uniqueVariations.length >= 3) break;
      if (!uniqueVariations.includes(candidate)) uniqueVariations.push(candidate);
    }
  }

  const finalVariations = uniqueVariations.slice(0, 3);
  const rhymeNotes = Array.isArray(gemini.data.rhymeNotes)
    ? gemini.data.rhymeNotes.filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
    : [];
  const summaryTip =
    typeof gemini.data.tip === 'string' && gemini.data.tip.trim().length > 0
      ? gemini.data.tip.trim()
      : `สร้าง 3 ตัวเลือกสำหรับห้อง ${singleBarIndex + 1} โดย ${gemini.modelUsed} แล้ว`;

  const lines: AdvanceLyricLine[] = finalVariations.map((text) => ({
    chord: targetChord,
    text,
    syllables: countThaiEnglishSyllables(text),
    phonetics: analyzeThaiSyllablePhonetics(text),
  }));

  const result: AdvanceLyricsResponseBody = {
    isSimulated: false,
    model: gemini.modelUsed,
    sectionType: body.sectionType,
    singleBarIndex,
    chordsUsed: [targetChord],
    variations: finalVariations,
    lines,
    fullLyrics: finalVariations.join('\n'),
    tip: summaryTip,
    rhymeNotes,
    suggestedChords: [targetChord],
    usage: gemini.usage,
    ...(billing.active ? { wallet: billing.wallet } : {}),
  };
  await recordServerFeatureEvent(
    request,
    {
      eventName: 'ai_lyrics_single_bar',
      category: 'ai',
      songwriterStyle: body.songwriterStyle,
      thaiGenre: body.thaiGenre,
      lyricDialect: body.lyricDialect,
      lyricEra: body.lyricEra,
      emotionalResolution: body.emotionalResolution,
      featureVariant: body.sectionType,
      isSimulated: false,
      creditsCost: creditCost,
      metadata: { mode: body.mode ?? 'quick', model: gemini.modelUsed },
    },
    {
      userId: billing.active && 'userId' in billing ? billing.userId : undefined,
      skipAuthLookup: billing.active,
    }
  );
  return Response.json(result, { status: 200 });
}

export async function POST(request: Request): Promise<Response> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }

  if (!rawBody || typeof rawBody !== 'object') {
    return Response.json({ error: 'Request payload must be a JSON object' }, { status: 400 });
  }

  const obj = rawBody as Record<string, unknown>;
  const mood = typeof obj.mood === 'string' ? obj.mood.trim() : '';
  const topic = typeof obj.topic === 'string' ? obj.topic.trim() : '';
  const sectionType = normalizeSectionType(obj.sectionType);
  const existingLyrics =
    typeof obj.existingLyrics === 'string' ? obj.existingLyrics.trim() : undefined;
  const chordProgression = Array.isArray(obj.chordProgression)
    ? obj.chordProgression.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
    : null;

  if (!mood || !topic || chordProgression === null) {
    return Response.json(
      { error: 'Required fields: mood (string), topic (string), chordProgression (string[])' },
      { status: 400 }
    );
  }

  const bpm =
    typeof obj.bpm === 'number' && Number.isFinite(obj.bpm)
      ? Math.max(40, Math.min(220, Math.round(obj.bpm)))
      : 85;
  const timeSignature: TimeSignature =
    typeof obj.timeSignature === 'string' &&
    VALID_TIME_SIGNATURES.has(obj.timeSignature as TimeSignature)
      ? (obj.timeSignature as TimeSignature)
      : '4/4';
  const previousSectionLyrics = Array.isArray(obj.previousSectionLyrics)
    ? obj.previousSectionLyrics.filter((l): l is string => typeof l === 'string')
    : undefined;
  const mode: 'quick' | 'deep' = obj.mode === 'deep' ? 'deep' : 'quick';

  let singleBarIndex: number | undefined;
  if (obj.singleBarIndex !== undefined) {
    if (
      typeof obj.singleBarIndex !== 'number' ||
      !Number.isFinite(obj.singleBarIndex) ||
      !Number.isInteger(obj.singleBarIndex) ||
      obj.singleBarIndex < 0 ||
      obj.singleBarIndex >= 16
    ) {
      return Response.json(
        { error: 'singleBarIndex must be a non-negative integer (< 16)' },
        { status: 400 }
      );
    }
    singleBarIndex = obj.singleBarIndex;
  }

  const maxBarsAllowed = singleBarIndex !== undefined ? 16 : 8;
  const bars: AdvanceLyricsBarInput[] | undefined = Array.isArray(obj.bars)
    ? obj.bars
        .filter((b): b is Record<string, unknown> => Boolean(b && typeof b === 'object'))
        .slice(0, maxBarsAllowed)
        .map((b, i) => ({
          chord:
            typeof b.chord === 'string' && b.chord.trim()
              ? b.chord.trim()
              : chordProgression[i % Math.max(1, chordProgression.length)] || 'C',
          chord2: typeof b.chord2 === 'string' && b.chord2.trim() ? b.chord2.trim() : undefined,
          chordsPerBar: b.chordsPerBar === 2 ? 2 : 1,
          existingLyrics: typeof b.existingLyrics === 'string' ? b.existingLyrics.trim() : undefined,
        }))
    : undefined;

  if (singleBarIndex !== undefined && bars && bars.length > 0 && singleBarIndex >= bars.length) {
    return Response.json(
      { error: `singleBarIndex (${singleBarIndex}) exceeds bars length (${bars.length})` },
      { status: 400 }
    );
  }

  const expectedBars = Math.min(
    8,
    Math.max(
      2,
      typeof obj.barCount === 'number' && Number.isFinite(obj.barCount)
        ? Math.round(obj.barCount)
        : bars && bars.length >= 2
          ? bars.length
          : 4
    )
  );

  const thaiGenre = typeof obj.thaiGenre === 'string' ? (obj.thaiGenre as ThaiSongGenre) : undefined;
  const lyricEra = typeof obj.lyricEra === 'string' ? (obj.lyricEra as ThaiLyricEra) : undefined;
  const lyricDialect =
    typeof obj.lyricDialect === 'string' ? (obj.lyricDialect as ThaiLyricDialect) : undefined;
  const songwriterStyle =
    typeof obj.songwriterStyle === 'string'
      ? (obj.songwriterStyle as ThaiSongwriterStyle)
      : undefined;
  const emotionalResolution =
    typeof obj.emotionalResolution === 'string'
      ? (obj.emotionalResolution as ThaiEmotionalResolution)
      : undefined;
  const songTitle = typeof obj.songTitle === 'string' ? obj.songTitle.trim() : undefined;
  const polishExistingDraft = Boolean(obj.polishExistingDraft);
  const allPriorSections = Array.isArray(obj.allPriorSections)
    ? obj.allPriorSections
        .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === 'object'))
        .map((s) => ({
          name: typeof s.name === 'string' ? s.name : 'Section',
          type: typeof s.type === 'string' ? s.type : 'verse',
          lyrics: Array.isArray(s.lyrics)
            ? s.lyrics.filter((l): l is string => typeof l === 'string')
            : [],
        }))
    : undefined;

  const payload: AdvanceLyricsRequestBody = {
    mood,
    topic,
    chordProgression,
    existingLyrics,
    sectionType,
    bpm,
    timeSignature,
    previousSectionLyrics,
    mode,
    barCount: expectedBars,
    bars,
    thaiGenre,
    lyricEra,
    lyricDialect,
    songwriterStyle,
    emotionalResolution,
    songTitle,
    allPriorSections,
    polishExistingDraft,
    ...(singleBarIndex !== undefined ? { singleBarIndex } : {}),
  };

  if (singleBarIndex !== undefined) {
    return handleSingleBarVariations(request, payload, singleBarIndex);
  }

  const targetModel = mode === 'deep' ? GEMINI_MODEL_MAIN : GEMINI_MODEL_LITE;
  const creditCost =
    mode === 'deep' ? CREDIT_COST_TABLE.aiSectionDeepMelody : CREDIT_COST_TABLE.aiLyricsQuick;

  const billing = await tryServerBillingPreDeduct(
    request,
    creditCost,
    `AI Lyrics [${mode}] (${targetModel}): ${sectionType}`,
    { modelId: targetModel }
  );
  if (billing.active && 'errorStatus' in billing) {
    return Response.json(
      { error: billing.error, code: billing.errorCode },
      { status: billing.errorStatus }
    );
  }

  const systemInstruction = buildLyricsSystemPrompt({
    bpm,
    timeSignature,
    sectionType,
    barCount: expectedBars,
    thaiGenre,
    lyricEra,
    lyricDialect,
    songwriterStyle,
    emotionalResolution,
    polishExistingDraft,
  });
  const userPrompt = buildLyricsUserPrompt({
    mood,
    topic,
    chordProgression,
    existingLyrics:
      bars && bars.some((b) => b.existingLyrics)
        ? bars.map((b) => b.existingLyrics || '')
        : existingLyrics
          ? existingLyrics.split('\n')
          : [],
    sectionType,
    bpm,
    timeSignature,
    previousSectionLyrics,
    mode,
    barCount: expectedBars,
    bars,
    thaiGenre,
    lyricEra,
    lyricDialect,
    songwriterStyle,
    emotionalResolution,
    songTitle,
    allPriorSections,
    polishExistingDraft,
  });

  const gemini = await callGeminiJson<GeminiLyricsPayload>(userPrompt, {
    model: targetModel,
    systemInstruction,
    responseSchema: mode === 'deep' ? LYRICS_DEEP_RESPONSE_SCHEMA : LYRICS_RESPONSE_SCHEMA,
    maxOutputTokens: mode === 'deep' ? 4096 : 2048,
    thinkingLevel: mode === 'deep' ? 'low' : 'minimal',
  });

  if (!gemini.ok) {
    let tipOverride: string | undefined;
    if (gemini.reason === 'rate-limit') {
      tipOverride =
        'โควตาคำขอ Gemini API เต็มชั่วคราว (429) — แสดงผลโหมดจำลองแทนและไม่หักเครดิตของคุณ';
    } else if (gemini.reason === 'auth-error') {
      tipOverride =
        'GEMINI_API_KEY ไม่ถูกต้องหรือไม่มีสิทธิ์เข้าถึงโมเดล — แสดงผลโหมดจำลองแทนและไม่หักเครดิต';
    } else if (gemini.reason !== 'missing-key') {
      tipOverride = `${gemini.failureReason} — แสดงผลโหมดจำลองแทนอย่างปลอดภัย (ไม่หักเครดิต)`;
    }

    const refundedWallet = await refundServerBillingOnFailure(
      billing,
      creditCost,
      `Auto-refund AI Lyrics (${gemini.reason})`,
      { modelId: targetModel }
    );

    await recordServerFeatureEvent(
      request,
      {
        eventName: mode === 'deep' ? 'ai_lyrics_deep' : 'ai_lyrics_quick',
        category: 'ai',
        songwriterStyle,
        thaiGenre,
        lyricDialect,
        lyricEra,
        emotionalResolution,
        featureVariant: sectionType,
        isSimulated: true,
        creditsCost: 0,
        metadata: { mode, reason: gemini.reason },
      },
      {
        userId: billing.active && 'userId' in billing ? billing.userId : undefined,
        skipAuthLookup: billing.active,
      }
    );

    return Response.json(
      {
        ...buildSimulatedLyrics(payload, tipOverride, gemini.reason),
        ...(refundedWallet ? { wallet: refundedWallet } : {}),
      },
      { status: 200 }
    );
  }

  const rawLines = Array.isArray(gemini.data.lines)
    ? gemini.data.lines.filter((l): l is string => typeof l === 'string' && l.trim().length > 0)
    : [];

  if (rawLines.length === 0) {
    const refundedWallet = await refundServerBillingOnFailure(
      billing,
      creditCost,
      'Auto-refund AI Lyrics (parse-error)',
      { modelId: targetModel }
    );

    await recordServerFeatureEvent(
      request,
      {
        eventName: mode === 'deep' ? 'ai_lyrics_deep' : 'ai_lyrics_quick',
        category: 'ai',
        songwriterStyle,
        thaiGenre,
        lyricDialect,
        lyricEra,
        emotionalResolution,
        featureVariant: sectionType,
        isSimulated: true,
        creditsCost: 0,
        metadata: { mode, reason: 'parse-error' },
      },
      {
        userId: billing.active && 'userId' in billing ? billing.userId : undefined,
        skipAuthLookup: billing.active,
      }
    );

    return Response.json(
      {
        ...buildSimulatedLyrics(
          payload,
          'ผลลัพธ์จาก AI ไม่ครบ 4 วรรค — สลับเป็นโหมดจำลองอัตโนมัติ (ไม่หักเครดิต)',
          'parse-error'
        ),
        ...(refundedWallet ? { wallet: refundedWallet } : {}),
      },
      { status: 200 }
    );
  }

  const suggestedChords = Array.isArray(gemini.data.suggestedChords)
    ? gemini.data.suggestedChords.filter(
        (c): c is string => typeof c === 'string' && c.trim().length > 0
      )
    : [];
  const rhymeNotes = Array.isArray(gemini.data.rhymeNotes)
    ? gemini.data.rhymeNotes.filter(
        (n): n is string => typeof n === 'string' && n.trim().length > 0
      )
    : [];

  const chords = chordProgression.length > 0 ? chordProgression : ['C', 'G', 'Am', 'F'];
  const lines: AdvanceLyricLine[] = rawLines.slice(0, expectedBars).map((text, idx) => {
    const cleanText = text.trim();
    return {
      chord: bars?.[idx]?.chord || chords[idx % chords.length],
      text: cleanText,
      syllables: countThaiEnglishSyllables(cleanText),
      phonetics: analyzeThaiSyllablePhonetics(cleanText),
    };
  });

  const summaryTip =
    rhymeNotes.length > 0
      ? rhymeNotes.join(' • ')
      : typeof gemini.data.tip === 'string' && gemini.data.tip.trim().length > 0
        ? gemini.data.tip.trim()
        : `สร้างโดย ${gemini.modelUsed} ให้เข้ากับคอร์ดและจังหวะ ${bpm} BPM แล้ว`;

  let melodyNotesPerBar: MelodyNote[][] | undefined;
  if (mode === 'deep') {
    const rawGroups = Array.isArray(gemini.data.melodyNotesPerBar)
      ? gemini.data.melodyNotesPerBar
      : [];
    melodyNotesPerBar = lines.map((line, idx) => {
      const clamped = clampMelodyNotesForBar(rawGroups[idx]);
      const chord2 = bars?.[idx]?.chordsPerBar === 2 ? bars[idx].chord2 : undefined;
      if (clamped.length > 0) {
        return clamped;
      }
      return generateLyricAlignedGuideMelody({
        lyrics: line.text,
        chord1: line.chord,
        chord2,
        totalSteps: 16,
        stepsPerBeat: 4,
        barIndex: idx,
        sectionType,
      });
    });
  }

  const result: AdvanceLyricsResponseBody = {
    isSimulated: false,
    model: gemini.modelUsed,
    sectionType,
    chordsUsed: chords,
    lines,
    fullLyrics: lines.map((l) => l.text).join('\n'),
    tip: summaryTip,
    rhymeNotes,
    suggestedChords: suggestedChords.length > 0 ? suggestedChords : lines.map((l) => l.chord),
    rhymeValidation: validateThaiLyricCouplets(
      lines.map((l) => l.text),
      { bpm, timeSignature }
    ),
    ...(melodyNotesPerBar ? { melodyNotesPerBar } : {}),
    usage: gemini.usage,
    ...(billing.active ? { wallet: billing.wallet } : {}),
  };
  await recordServerFeatureEvent(
    request,
    {
      eventName: mode === 'deep' ? 'ai_lyrics_deep' : 'ai_lyrics_quick',
      category: 'ai',
      songwriterStyle,
      thaiGenre,
      lyricDialect,
      lyricEra,
      emotionalResolution,
      featureVariant: sectionType,
      isSimulated: false,
      creditsCost: mode === 'deep' ? 2 : 1,
      metadata: {
        mode,
        barCount: expectedBars,
        polishExistingDraft,
        model: gemini.modelUsed,
      },
    },
    {
      userId: billing.active && 'userId' in billing ? billing.userId : undefined,
      skipAuthLookup: billing.active,
    }
  );
  return Response.json(result, { status: 200 });
}
