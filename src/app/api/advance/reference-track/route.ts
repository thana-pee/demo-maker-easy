import {
  buildFullDemoMasterPrompt,
  buildLyriaReferencePrompt,
  type FullDemoBlueprintSummary,
} from '@/lib/aiPrompts';
import { CREDIT_COST_TABLE } from '@/lib/creditManager';
import {
  GEMINI_MODEL_MUSIC,
  callGeminiMusicAudio,
  type GeminiTokenUsage,
} from '@/lib/geminiClient';
import {
  refundServerBillingOnFailure,
  tryServerBillingPreDeduct,
  type WalletBalanceSummary,
} from '@/lib/serverWallet';
import { recordServerFeatureEvent } from '@/lib/serverAnalytics';
import type {
  Ambience3DMode,
  BarPlayStyle,
  GuitarModel,
  MelodyNote,
  SectionIntensity,
  SectionType,
  SongBar,
  SongProject,
  SongSection,
  StringGauge,
  ThaiEmotionalResolution,
  ThaiLyricDialect,
  ThaiLyricEra,
  ThaiSongGenre,
  ThaiSongwriterStyle,
  TimeSignature,
} from '@/types/song';

export const maxDuration = 60;

export const MAX_REFERENCE_NOTES_CHARS = 300;
export const MAX_LYRIA_PROMPT_CHARS = 6000;

const VALID_SECTION_TYPES = new Set<SectionType>([
  'intro',
  'verse',
  'pre-chorus',
  'chorus',
  'solo',
  'bridge',
  'outro',
]);
const VALID_INTENSITIES = new Set<SectionIntensity>(['low', 'medium', 'high']);
const VALID_PLAY_STYLES = new Set<BarPlayStyle>(['normal', 'let-ring', 'break']);

function sanitizeFullSongInput(raw: unknown): SongProject | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  if (!Array.isArray(src.sections) || src.sections.length === 0) return null;

  const sections: SongSection[] = [];
  let totalBars = 0;

  for (let sIdx = 0; sIdx < Math.min(src.sections.length, 24); sIdx++) {
    const rawSec = src.sections[sIdx];
    if (!rawSec || typeof rawSec !== 'object') continue;
    const sObj = rawSec as Record<string, unknown>;
    const rawBars = Array.isArray(sObj.bars) ? sObj.bars : [];
    const bars: SongBar[] = [];

    for (let bIdx = 0; bIdx < Math.min(rawBars.length, 32); bIdx++) {
      const rawBar = rawBars[bIdx];
      if (!rawBar || typeof rawBar !== 'object') continue;
      const bObj = rawBar as Record<string, unknown>;
      const rawChords = Array.isArray(bObj.chords)
        ? bObj.chords.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
        : [];
      const chords = rawChords.length > 0 ? rawChords.slice(0, 2) : ['C'];
      const chordsPerBar: 1 | 2 = bObj.chordsPerBar === 2 && chords.length >= 2 ? 2 : 1;
      const playStyle: BarPlayStyle =
        typeof bObj.playStyle === 'string' && VALID_PLAY_STYLES.has(bObj.playStyle as BarPlayStyle)
          ? (bObj.playStyle as BarPlayStyle)
          : 'normal';
      const rawNotes = Array.isArray(bObj.melodyNotes) ? bObj.melodyNotes : [];
      const melodyNotes: MelodyNote[] = rawNotes
        .filter((n): n is Record<string, unknown> => Boolean(n && typeof n === 'object'))
        .slice(0, 32)
        .map((n) => ({
          step: typeof n.step === 'number' && Number.isFinite(n.step) ? Math.max(0, Math.min(15, Math.round(n.step))) : 0,
          midiPitch: typeof n.midiPitch === 'number' && Number.isFinite(n.midiPitch) ? Math.max(36, Math.min(96, Math.round(n.midiPitch))) : 60,
          durationSteps: typeof n.durationSteps === 'number' && Number.isFinite(n.durationSteps) ? Math.max(1, Math.min(16, Math.round(n.durationSteps))) : 2,
        }));

      bars.push({
        id: typeof bObj.id === 'string' && bObj.id ? bObj.id : `bar-${sIdx}-${bIdx}`,
        chordsPerBar,
        chords,
        playStyle,
        lyrics: typeof bObj.lyrics === 'string' ? bObj.lyrics : '',
        melodyNotes,
      });
      totalBars += 1;
    }

    if (bars.length === 0) continue;

    const secType: SectionType =
      typeof sObj.type === 'string' && VALID_SECTION_TYPES.has(sObj.type as SectionType)
        ? (sObj.type as SectionType)
        : 'verse';
    const intensity: SectionIntensity =
      typeof sObj.intensity === 'string' && VALID_INTENSITIES.has(sObj.intensity as SectionIntensity)
        ? (sObj.intensity as SectionIntensity)
        : secType === 'chorus' || secType === 'solo'
          ? 'high'
          : secType === 'intro' || secType === 'outro'
            ? 'low'
            : 'medium';

    const rawInst =
      sObj.instruments && typeof sObj.instruments === 'object'
        ? (sObj.instruments as Record<string, unknown>)
        : {};

    sections.push({
      id: typeof sObj.id === 'string' && sObj.id ? sObj.id : `sec-${sIdx}`,
      name: typeof sObj.name === 'string' && sObj.name.trim() ? sObj.name.trim() : secType,
      type: secType,
      intensity,
      instruments: {
        guitarRhythm: typeof rawInst.guitarRhythm === 'boolean' ? rawInst.guitarRhythm : true,
        guitarLead: typeof rawInst.guitarLead === 'boolean' ? rawInst.guitarLead : false,
        bass: typeof rawInst.bass === 'boolean' ? rawInst.bass : true,
        piano: typeof rawInst.piano === 'boolean' ? rawInst.piano : false,
        drums: typeof rawInst.drums === 'boolean' ? rawInst.drums : true,
        ...(typeof rawInst.guitarRhythmStyle === 'string' ? { guitarRhythmStyle: rawInst.guitarRhythmStyle as SongSection['instruments']['guitarRhythmStyle'] } : {}),
        ...(typeof rawInst.guitarLeadStyle === 'string' ? { guitarLeadStyle: rawInst.guitarLeadStyle as SongSection['instruments']['guitarLeadStyle'] } : {}),
        ...(typeof rawInst.guitarLeadDrive === 'string' ? { guitarLeadDrive: rawInst.guitarLeadDrive as SongSection['instruments']['guitarLeadDrive'] } : {}),
        ...(typeof rawInst.bassStyle === 'string' ? { bassStyle: rawInst.bassStyle as SongSection['instruments']['bassStyle'] } : {}),
        ...(typeof rawInst.pianoStyle === 'string' ? { pianoStyle: rawInst.pianoStyle as SongSection['instruments']['pianoStyle'] } : {}),
        ...(typeof rawInst.drumsStyle === 'string' ? { drumsStyle: rawInst.drumsStyle as SongSection['instruments']['drumsStyle'] } : {}),
      },
      bars,
    });
  }

  if (sections.length === 0 || totalBars === 0) return null;

  const rawMixer =
    src.mixer && typeof src.mixer === 'object' ? (src.mixer as Record<string, unknown>) : {};
  const readStyle = (key: string, fallback: string): string => {
    const part = rawMixer[key];
    if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).style === 'string') {
      return (part as Record<string, unknown>).style as string;
    }
    return fallback;
  };
  const readDrive = (): SongProject['mixer']['guitarLead']['drive'] => {
    const part = rawMixer.guitarLead;
    if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).drive === 'string') {
      return (part as Record<string, unknown>).drive as SongProject['mixer']['guitarLead']['drive'];
    }
    return 'clean';
  };
  const readTrackGuitarModel = (key: 'guitarRhythm' | 'guitarLead', fallback: GuitarModel): GuitarModel => {
    const part = rawMixer[key];
    if (part && typeof part === 'object') {
      const m = (part as Record<string, unknown>).model;
      if (
        m === 'classical-nylon' ||
        m === 'dreadnought-steel' ||
        m === 'ovation-roundback' ||
        m === 'gibson-les-paul'
      ) {
        return m;
      }
    }
    return fallback;
  };

  const rawBpm = typeof src.bpm === 'number' && Number.isFinite(src.bpm) ? Math.round(src.bpm) : 84;
  const timeSignature: TimeSignature =
    src.timeSignature === '3/4' || src.timeSignature === '6/8' ? src.timeSignature : '4/4';

  const guitarModel: GuitarModel =
    src.guitarModel === 'classical-nylon' ||
    src.guitarModel === 'ovation-roundback' ||
    src.guitarModel === 'gibson-les-paul'
      ? src.guitarModel
      : 'dreadnought-steel';
  const stringGauge: StringGauge =
    src.stringGauge === 'heavy-012' ? 'heavy-012' : 'standard-010';
  const ambience3D: Ambience3DMode =
    src.ambience3D === 'living-room' || src.ambience3D === 'unplugged-hall'
      ? src.ambience3D
      : 'wood-studio';

  return {
    id: typeof src.id === 'string' && src.id ? src.id : 'full-demo',
    version: typeof src.version === 'number' ? src.version : 1,
    title: typeof src.title === 'string' && src.title.trim() ? src.title.trim() : 'Demo Song',
    updatedAt: typeof src.updatedAt === 'string' ? src.updatedAt : new Date().toISOString(),
    bpm: Math.max(40, Math.min(220, rawBpm)),
    timeSignature,
    baseKey: typeof src.baseKey === 'string' && src.baseKey.trim() ? src.baseKey.trim() : 'C',
    transposeSemitones:
      typeof src.transposeSemitones === 'number' && Number.isFinite(src.transposeSemitones)
        ? Math.max(-12, Math.min(12, Math.round(src.transposeSemitones)))
        : 0,
    capoFret:
      typeof src.capoFret === 'number' && Number.isFinite(src.capoFret)
        ? Math.max(0, Math.min(12, Math.round(src.capoFret)))
        : 0,
    countInEnabled: Boolean(src.countInEnabled),
    guitarModel,
    stringGauge,
    ambience3D,
    mixer: {
      guitarRhythm: {
        enabled: true,
        volume: 85,
        style: readStyle('guitarRhythm', 'soft-strum') as SongProject['mixer']['guitarRhythm']['style'],
        model: readTrackGuitarModel('guitarRhythm', guitarModel),
      },
      guitarLead: {
        enabled: true,
        volume: 85,
        style: readStyle('guitarLead', 'melodic-solo') as SongProject['mixer']['guitarLead']['style'],
        model: readTrackGuitarModel('guitarLead', guitarModel),
        drive: readDrive(),
      },
      bass: {
        enabled: true,
        volume: 85,
        style: readStyle('bass', 'root-fifth') as SongProject['mixer']['bass']['style'],
      },
      piano: {
        enabled: true,
        volume: 80,
        style: readStyle('piano', 'warm-pad') as SongProject['mixer']['piano']['style'],
      },
      drums: {
        enabled: true,
        volume: 85,
        style: readStyle('drums', 'simple-kit') as SongProject['mixer']['drums']['style'],
      },
    },
    sections,
    ...(typeof src.thaiGenre === 'string' ? { thaiGenre: src.thaiGenre as ThaiSongGenre } : {}),
    ...(typeof src.lyricEra === 'string' ? { lyricEra: src.lyricEra as ThaiLyricEra } : {}),
    ...(typeof src.lyricDialect === 'string' ? { lyricDialect: src.lyricDialect as ThaiLyricDialect } : {}),
    ...(typeof src.songwriterStyle === 'string' ? { songwriterStyle: src.songwriterStyle as ThaiSongwriterStyle } : {}),
    ...(typeof src.emotionalResolution === 'string'
      ? { emotionalResolution: src.emotionalResolution as ThaiEmotionalResolution }
      : {}),
  };
}

export interface ReferenceTrackResponseBody {
  isSimulated: boolean;
  model: string;
  promptUsed: string;
  audioDataUrl: string | null;
  mimeType: string | null;
  lyricsOrNotes: string;
  tip: string;
  blueprintSummary?: FullDemoBlueprintSummary;
  usage?: GeminiTokenUsage;
  wallet?: WalletBalanceSummary;
  failureReason?: string;
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
  const rawSummary =
    obj.songSummary && typeof obj.songSummary === 'object'
      ? (obj.songSummary as Record<string, unknown>)
      : null;

  const userNotes = typeof obj.userNotes === 'string' ? obj.userNotes.trim() : '';
  if (userNotes.length > MAX_REFERENCE_NOTES_CHARS) {
    return Response.json(
      { error: `userNotes length exceeds cap of ${MAX_REFERENCE_NOTES_CHARS} characters` },
      { status: 400 }
    );
  }

  let sanitizedFullSong: SongProject | null = null;
  if (obj.fullSong !== undefined) {
    sanitizedFullSong = sanitizeFullSongInput(obj.fullSong);
    if (!sanitizedFullSong) {
      return Response.json(
        { error: 'Invalid fullSong object: must contain non-empty sections with bars' },
        { status: 400 }
      );
    }
  }

  const rawPromptOverride = typeof obj.prompt === 'string' ? obj.prompt.trim() : '';
  if (!sanitizedFullSong && !rawSummary && !rawPromptOverride) {
    return Response.json(
      { error: 'Required field: fullSong, songSummary object, or prompt string' },
      { status: 400 }
    );
  }

  const rawBpm =
    sanitizedFullSong?.bpm ??
    (typeof rawSummary?.bpm === 'number' && Number.isFinite(rawSummary.bpm)
      ? Math.round(rawSummary.bpm)
      : typeof obj.bpm === 'number' && Number.isFinite(obj.bpm)
        ? Math.round(obj.bpm)
        : 84);
  const bpm = Math.max(40, Math.min(200, rawBpm));

  const rawTs = sanitizedFullSong?.timeSignature ?? rawSummary?.timeSignature ?? obj.timeSignature;
  const timeSignature: TimeSignature =
    rawTs === '3/4' || rawTs === '6/8' ? rawTs : '4/4';

  const baseKey =
    sanitizedFullSong?.baseKey ||
    (typeof rawSummary?.baseKey === 'string' && rawSummary.baseKey.trim()
      ? rawSummary.baseKey.trim()
      : 'C');

  const title =
    sanitizedFullSong?.title ||
    (typeof rawSummary?.title === 'string' && rawSummary.title.trim()
      ? rawSummary.title.trim()
      : 'Demo Song');

  const guitarModel =
    sanitizedFullSong?.guitarModel ??
    (typeof rawSummary?.guitarModel === 'string' ? rawSummary.guitarModel : undefined);
  const ambience3D =
    sanitizedFullSong?.ambience3D ??
    (typeof rawSummary?.ambience3D === 'string' ? rawSummary.ambience3D : undefined);

  const chordsSample = Array.isArray(rawSummary?.chordsSample)
    ? rawSummary!.chordsSample
        .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
        .slice(0, 8)
    : undefined;

  const lyricsSample = Array.isArray(rawSummary?.lyricsSample)
    ? rawSummary!.lyricsSample
        .filter((l): l is string => typeof l === 'string' && l.trim().length > 0)
        .slice(0, 4)
    : undefined;

  const language: 'th' | 'en' = obj.language === 'en' ? 'en' : 'th';
  const instrumental = Boolean(obj.instrumental);
  const thaiGenre =
    sanitizedFullSong?.thaiGenre ??
    (typeof rawSummary?.thaiGenre === 'string'
      ? (rawSummary.thaiGenre as ThaiSongGenre)
      : typeof obj.thaiGenre === 'string'
        ? (obj.thaiGenre as ThaiSongGenre)
        : undefined);
  const vocalGender =
    obj.vocalGender === 'female' || obj.vocalGender === 'male'
      ? obj.vocalGender
      : sanitizedFullSong?.easyConfig?.vocalProfile ?? 'neutral';

  let promptUsed: string;
  let blueprintSummary: FullDemoBlueprintSummary | undefined;

  if (rawPromptOverride) {
    promptUsed = rawPromptOverride.slice(0, MAX_LYRIA_PROMPT_CHARS);
  } else if (sanitizedFullSong) {
    const built = buildFullDemoMasterPrompt(sanitizedFullSong, {
      userNotes,
      instrumental,
      vocalGender,
      language,
    });
    promptUsed = built.promptUsed.slice(0, MAX_LYRIA_PROMPT_CHARS);
    blueprintSummary = built.blueprintSummary;
  } else {
    promptUsed = buildLyriaReferencePrompt({
      title,
      bpm,
      baseKey,
      timeSignature,
      guitarModel,
      ambience3D,
      chordsSample,
      lyricsSample,
      userNotes,
      language,
      instrumental,
      thaiGenre,
      vocalGender,
    }).slice(0, MAX_LYRIA_PROMPT_CHARS);
  }

  const lyriaCost = CREDIT_COST_TABLE.aiReferenceTrackLyria;
  const billing = await tryServerBillingPreDeduct(
    request,
    lyriaCost,
    `AI Reference Track (Lyria 3.5): ${title}`,
    { requirePurchased: true, modelId: GEMINI_MODEL_MUSIC }
  );
  if (billing.active && 'errorStatus' in billing) {
    return Response.json(
      { error: billing.error, code: billing.errorCode },
      { status: billing.errorStatus }
    );
  }

  const musicRes = await callGeminiMusicAudio(promptUsed, { mimeType: 'audio/mp3' });

  if (!musicRes.ok) {
    let tip: string;
    if (musicRes.reason === 'missing-key') {
      tip =
        'โหมดจำลอง (ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์) — ไม่หัก 8 เหรียญของคุณ และแสดง Prompt พร้อมเทียบกับไฟล์ MP3 ของวงดนตรีจริงได้ฟรี';
    } else if (musicRes.reason === 'rate-limit') {
      tip = 'โควตาคำขอ Lyria 3.5 API เต็มชั่วคราว (429) — ระบบไม่หัก 8 เหรียญ กรุณาลองใหม่ภายหลัง';
    } else if (musicRes.reason === 'auth-error') {
      tip = 'GEMINI_API_KEY ไม่มีสิทธิ์เรียก Lyria 3.5 — ระบบไม่หัก 8 เหรียญ';
    } else {
      tip = `${musicRes.failureReason} — ระบบคืนสิทธิ์เต็มโดยไม่หัก 8 เหรียญ`;
    }

    const refundedWallet = await refundServerBillingOnFailure(
      billing,
      lyriaCost,
      `Auto-refund Lyria 3.5 (${musicRes.reason})`,
      { toPurchased: true, modelId: GEMINI_MODEL_MUSIC }
    );

    const body: ReferenceTrackResponseBody = {
      isSimulated: true,
      model: GEMINI_MODEL_MUSIC,
      promptUsed,
      audioDataUrl: null,
      mimeType: null,
      lyricsOrNotes: '',
      tip,
      ...(blueprintSummary ? { blueprintSummary } : {}),
      ...(refundedWallet ? { wallet: refundedWallet } : {}),
      failureReason: musicRes.reason,
    };
    const isSim = Boolean((body as { isSimulated?: boolean }).isSimulated);
  await recordServerFeatureEvent(
    request,
    {
      eventName: 'ai_reference_track_lyria',
      category: 'ai',
      songwriterStyle: sanitizedFullSong?.songwriterStyle,
      thaiGenre: thaiGenre ?? sanitizedFullSong?.thaiGenre,
      lyricDialect: sanitizedFullSong?.lyricDialect,
      lyricEra: sanitizedFullSong?.lyricEra,
      emotionalResolution: sanitizedFullSong?.emotionalResolution,
      featureVariant: obj.instrumental ? 'instrumental' : 'vocal_mix',
      isSimulated: isSim,
      creditsCost: isSim ? 0 : lyriaCost,
    },
    {
      userId: billing.active && 'userId' in billing ? billing.userId : undefined,
      skipAuthLookup: billing.active,
    }
  );
  return Response.json(body);
  }

  const audioDataUrl = `data:${musicRes.mimeType};base64,${musicRes.audioBase64}`;
  const body: ReferenceTrackResponseBody = {
    isSimulated: false,
    model: musicRes.modelUsed || GEMINI_MODEL_MUSIC,
    promptUsed,
    audioDataUrl,
    mimeType: musicRes.mimeType,
    lyricsOrNotes: musicRes.lyricsOrNotes,
    ...(blueprintSummary ? { blueprintSummary } : {}),
    usage: musicRes.usage,
    ...(billing.active ? { wallet: billing.wallet } : {}),
    tip: 'สร้างแทร็กเสียงอ้างอิงจาก Lyria 3.5 สำเร็จ! ลองกดฟังเทียบมิติและโทนกับไฟล์ Export .MP3 ของวงคุณได้ทันที',
  };
  const isSim = Boolean((body as { isSimulated?: boolean }).isSimulated);
  await recordServerFeatureEvent(
    request,
    {
      eventName: 'ai_reference_track_lyria',
      category: 'ai',
      songwriterStyle: sanitizedFullSong?.songwriterStyle,
      thaiGenre: thaiGenre ?? sanitizedFullSong?.thaiGenre,
      lyricDialect: sanitizedFullSong?.lyricDialect,
      lyricEra: sanitizedFullSong?.lyricEra,
      emotionalResolution: sanitizedFullSong?.emotionalResolution,
      featureVariant: obj.instrumental ? 'instrumental' : 'vocal_mix',
      isSimulated: isSim,
      creditsCost: isSim ? 0 : lyriaCost,
    },
    {
      userId: billing.active && 'userId' in billing ? billing.userId : undefined,
      skipAuthLookup: billing.active,
    }
  );
  return Response.json(body);
}
