import {
  HUM_TO_SONG_RESPONSE_SCHEMA,
  buildHumToSongSystemPrompt,
  buildHumToSongUserPrompt,
  normalizeAudioMimeType,
} from '@/lib/aiPrompts';
import {
  GEMINI_MODEL_MAIN,
  GEMINI_MODEL_TRANSCRIBE,
  callGeminiJson,
  callGeminiTranscribeAudio,
  type GeminiInputPart,
  type GeminiTokenUsage,
} from '@/lib/geminiClient';
import { generateSectionGuideMelody } from '@/lib/melodyUtils';
import { CREDIT_COST_TABLE } from '@/lib/creditManager';
import {
  refundServerBillingOnFailure,
  tryServerBillingPreDeduct,
  type WalletBalanceSummary,
} from '@/lib/serverWallet';
import { recordServerFeatureEvent } from '@/lib/serverAnalytics';
import {
  buildSimulatedArchitectSong,
  getPresetConfig,
  sanitizeArchitectSongProject,
  type EasyArchitectInput,
  type VocalProfile,
} from '@/lib/songArchitect';
import type { SongProject, TimeSignature } from '@/types/song';

export const maxDuration = 60;

export const MAX_HUM_DURATION_SEC = 45;
export const MAX_HUM_BYTES = 8 * 1024 * 1024; // 8 MB decoded audio limit

export interface HumToSongResponseBody {
  isSimulated: boolean;
  model: string;
  detected: {
    bpm: number;
    timeSignature: TimeSignature;
    baseKey: string;
  };
  transcribedLyrics: string;
  confidenceNote: string;
  song: SongProject;
  producerNotes: string[];
  tip: string;
  usage?: GeminiTokenUsage;
  wallet?: WalletBalanceSummary;
  failureReason?: string;
}

const VALID_VOCALS = new Set<VocalProfile>(['female', 'male', 'neutral']);

function addUsageTelemetry(
  base: GeminiTokenUsage | undefined,
  extra: GeminiTokenUsage | undefined
): GeminiTokenUsage | undefined {
  if (!base && !extra) return undefined;
  if (!base) return extra;
  if (!extra) return base;
  return {
    inputTokens: base.inputTokens + extra.inputTokens,
    cachedTokens: base.cachedTokens + extra.cachedTokens,
    outputTokens: base.outputTokens + extra.outputTokens,
    thoughtTokens: base.thoughtTokens + extra.thoughtTokens,
    totalTokens: base.totalTokens + extra.totalTokens,
  };
}

function parseDataUrlAndBase64(rawAudio: string, explicitMime?: string): {
  base64: string;
  inferredMime: string;
} {
  const trimmed = rawAudio.trim();
  const match = trimmed.match(/^data:([^;]+)(?:;[^,]+)*;base64,(.+)$/i);
  if (match) {
    return {
      inferredMime: explicitMime?.trim() || match[1],
      base64: match[2].replace(/\s+/g, ''),
    };
  }
  return {
    inferredMime: explicitMime?.trim() || '',
    base64: trimmed.replace(/\s+/g, ''),
  };
}

function estimateDecodedByteLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function enrichMissingGuideNotes(
  song: SongProject,
  vocalProfile: VocalProfile
): SongProject {
  return {
    ...song,
    sections: song.sections.map((section) => {
      const generatedByBar = generateSectionGuideMelody(
        section.bars.map((b) => b.chords[0] ?? 'C'),
        song.baseKey,
        song.timeSignature,
        vocalProfile
      );
      return {
        ...section,
        bars: section.bars.map((bar, barIdx) => {
          if (bar.melodyNotes && bar.melodyNotes.length > 0) {
            return bar;
          }
          return {
            ...bar,
            melodyNotes: generatedByBar[barIdx] ?? [],
          };
        }),
      };
    }),
  };
}

function buildSimulatedHumResponse(
  input: EasyArchitectInput,
  vocalProfile: VocalProfile,
  durationSec: number,
  reason: string,
  failureDetail: string
): HumToSongResponseBody {
  const preset = getPresetConfig(input.stylePreset);
  const simulated = enrichMissingGuideNotes(buildSimulatedArchitectSong(input), vocalProfile);

  let tip: string;
  if (reason === 'missing-key') {
    tip = 'โหมดจำลอง Hum-to-Song (ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์) — ไม่หัก 3 เครดิต สร้างโครงเพลงพร้อมโน้ตไกด์ให้ลองเล่นแทน';
  } else if (reason === 'rate-limit') {
    tip = 'โควตาคำขอ Gemini API เต็มชั่วคราว (429) — จัดเตรียมโครงเพลงพร้อมโน้ตไกด์จำลองให้แทนโดยไม่หัก 3 เครดิต';
  } else if (reason === 'auth-error') {
    tip = 'GEMINI_API_KEY ไม่ถูกต้องหรือไม่มีสิทธิ์เข้าถึงโมเดล — จัดโครงเพลงจำลองแทนโดยไม่หัก 3 เครดิต';
  } else {
    tip = `${failureDetail} — จัดโครงเพลงจำลองให้ลองต่อยอดโดยไม่หัก 3 เครดิต`;
  }

  return {
    isSimulated: true,
    model: 'demo-offline-hum-transcriber',
    detected: {
      bpm: simulated.bpm,
      timeSignature: simulated.timeSignature,
      baseKey: simulated.baseKey,
    },
    transcribedLyrics: input.topic,
    confidenceNote:
      input.language === 'en'
        ? `Offline draft starter for ${durationSec.toFixed(1)}s clip (${simulated.baseKey}, ${simulated.bpm} BPM).`
        : `โครงร่างออฟไลน์อ้างอิงจากคลิปเสียง ${durationSec.toFixed(1)} วิ (คีย์ ${simulated.baseKey} · ${simulated.bpm} BPM)`,
    song: simulated,
    producerNotes: [
      `จัดสไตล์ ${preset.nameTh} (${simulated.bpm} BPM · ${simulated.timeSignature} · คีย์ ${simulated.baseKey})`,
      'วางโน้ตไกด์บน Mini Piano Roll ให้ครบทุกห้อง พร้อมปรับแก้ต่อใน Arranger ทันที',
    ],
    tip,
    failureReason: reason,
  };
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
  const rawAudio = typeof obj.audioBase64 === 'string' ? obj.audioBase64 : '';
  const explicitMime = typeof obj.mimeType === 'string' ? obj.mimeType : '';

  if (!rawAudio.trim()) {
    return Response.json(
      { error: 'Required field: audioBase64 (non-empty base64 or audio data URL)' },
      { status: 400 }
    );
  }

  const { base64, inferredMime } = parseDataUrlAndBase64(rawAudio, explicitMime);
  if (!base64 || !/^[A-Za-z0-9+/=]+$/.test(base64)) {
    return Response.json(
      { error: 'Invalid base64 encoding in audioBase64 payload' },
      { status: 400 }
    );
  }

  const decodedBytes = estimateDecodedByteLength(base64);
  if (decodedBytes <= 0 || decodedBytes > MAX_HUM_BYTES) {
    return Response.json(
      {
        error: `Audio file exceeds maximum size limit of ${Math.round(MAX_HUM_BYTES / (1024 * 1024))} MB`,
      },
      { status: 400 }
    );
  }

  const normalizedMime = normalizeAudioMimeType(inferredMime);
  if (!normalizedMime) {
    return Response.json(
      {
        error: `Unsupported audio MIME type: "${inferredMime || 'unknown'}". Use webm, wav, mp3, m4a, ogg, aac, or flac.`,
      },
      { status: 400 }
    );
  }

  const durationSec = typeof obj.durationSec === 'number' ? obj.durationSec : NaN;
  if (!Number.isFinite(durationSec) || durationSec <= 0 || durationSec > MAX_HUM_DURATION_SEC) {
    return Response.json(
      {
        error: `durationSec must be between 0.1 and ${MAX_HUM_DURATION_SEC} seconds`,
      },
      { status: 400 }
    );
  }

  const stylePreset =
    typeof obj.stylePreset === 'string' && obj.stylePreset.trim()
      ? obj.stylePreset.trim()
      : 'warm-acoustic';
  const vocalProfile: VocalProfile =
    typeof obj.vocalProfile === 'string' && VALID_VOCALS.has(obj.vocalProfile as VocalProfile)
      ? (obj.vocalProfile as VocalProfile)
      : 'neutral';
  const language: 'th' | 'en' = obj.language === 'en' ? 'en' : 'th';
  const includeTranscribePass = Boolean(obj.includeTranscribePass);

  const humCost = CREDIT_COST_TABLE.aiHumToSong;
  const billing = await tryServerBillingPreDeduct(
    request,
    humCost,
    `Hum-to-Song (${GEMINI_MODEL_MAIN}): ${durationSec.toFixed(1)}s`,
    { modelId: GEMINI_MODEL_MAIN }
  );
  if (billing.active && 'errorStatus' in billing) {
    return Response.json(
      { error: billing.error, code: billing.errorCode },
      { status: billing.errorStatus }
    );
  }

  let totalUsage: GeminiTokenUsage | undefined;
  let transcribedHint = '';
  let usedTranscribeModel = false;

  if (includeTranscribePass) {
    const transcribeRes = await callGeminiTranscribeAudio(base64, normalizedMime, {
      model: GEMINI_MODEL_TRANSCRIBE,
    });
    if (!transcribeRes.ok && transcribeRes.reason === 'missing-key') {
      const refundedWallet = await refundServerBillingOnFailure(
        billing,
        humCost,
        `Auto-refund Hum-to-Song (${transcribeRes.reason})`,
        { modelId: GEMINI_MODEL_MAIN }
      );
      const fallbackInput: EasyArchitectInput = {
        stylePreset,
        vocalProfile,
        tempoFeel: durationSec >= 24 ? 'slow' : 'medium',
        topic: language === 'en' ? 'Hummed melody starter' : 'ไอเดียจากเสียงฮัมทำนอง',
        language,
      };
      await recordServerFeatureEvent(request, {
        eventName: 'ai_hum_to_song',
        category: 'ai',
        songwriterStyle: typeof obj.songwriterStyle === 'string' ? obj.songwriterStyle : undefined,
        thaiGenre: getPresetConfig(stylePreset).thaiGenre,
        featureVariant: stylePreset,
        isSimulated: true,
        creditsCost: 0,
        metadata: { vocalProfile, language, stage: 'transcribe-fallback' },
      });
      return Response.json(
        {
          ...buildSimulatedHumResponse(
            fallbackInput,
            vocalProfile,
            durationSec,
            transcribeRes.reason,
            transcribeRes.failureReason
          ),
          ...(refundedWallet ? { wallet: refundedWallet } : {}),
        },
        { status: 200 }
      );
    }
    if (transcribeRes.ok) {
      totalUsage = addUsageTelemetry(totalUsage, transcribeRes.usage);
      transcribedHint = transcribeRes.transcript.trim().slice(0, 320);
      usedTranscribeModel = true;
    }
  }

  const userPrompt = buildHumToSongUserPrompt({
    stylePreset,
    vocalProfile,
    language,
    durationSec,
    transcribedHint,
  });

  const promptParts: GeminiInputPart[] = [
    { type: 'text', text: userPrompt },
    { type: 'audio', data: base64, mime_type: normalizedMime },
  ];

  const gemini = await callGeminiJson<Record<string, unknown>>(promptParts, {
    model: GEMINI_MODEL_MAIN,
    systemInstruction: buildHumToSongSystemPrompt(),
    responseSchema: HUM_TO_SONG_RESPONSE_SCHEMA,
    maxOutputTokens: 8192,
    thinkingLevel: 'low',
  });

  const architectInput: EasyArchitectInput = {
    stylePreset,
    vocalProfile,
    tempoFeel: durationSec >= 24 ? 'slow' : 'medium',
    topic:
      transcribedHint ||
      (language === 'en' ? 'Hummed melody starter' : 'ไอเดียจากเสียงฮัมทำนอง'),
    language,
  };

  if (!gemini.ok) {
    const refundedWallet = await refundServerBillingOnFailure(
      billing,
      humCost,
      `Auto-refund Hum-to-Song (${gemini.reason})`,
      { modelId: GEMINI_MODEL_MAIN }
    );
    await recordServerFeatureEvent(
      request,
      {
        eventName: 'ai_hum_to_song',
        category: 'ai',
        songwriterStyle: typeof obj.songwriterStyle === 'string' ? obj.songwriterStyle : undefined,
        thaiGenre: getPresetConfig(stylePreset).thaiGenre,
        featureVariant: stylePreset,
        isSimulated: true,
        creditsCost: 0,
        metadata: { vocalProfile, language, reason: gemini.reason },
      },
      {
        userId: billing.active && 'userId' in billing ? billing.userId : undefined,
        skipAuthLookup: billing.active,
      }
    );
    return Response.json(
      {
        ...buildSimulatedHumResponse(
          architectInput,
          vocalProfile,
          durationSec,
          gemini.reason,
          gemini.failureReason
        ),
        ...(refundedWallet ? { wallet: refundedWallet } : {}),
      },
      { status: 200 }
    );
  }

  totalUsage = addUsageTelemetry(totalUsage, gemini.usage);
  const rawTranscribed =
    typeof gemini.data.transcribedLyrics === 'string' && gemini.data.transcribedLyrics.trim()
      ? gemini.data.transcribedLyrics.trim()
      : transcribedHint;
  const rawConfidence =
    typeof gemini.data.confidenceNote === 'string' && gemini.data.confidenceNote.trim()
      ? gemini.data.confidenceNote.trim()
      : `วิเคราะห์จากเสียงฮัม ${durationSec.toFixed(1)} วินาที`;

  const sanitized = sanitizeArchitectSongProject(gemini.data, {
    ...architectInput,
    topic: rawTranscribed || architectInput.topic,
  });
  const song = enrichMissingGuideNotes(sanitized, vocalProfile);

  const rawProducerNotes = gemini.data.producerNotes;
  const producerNotes = Array.isArray(rawProducerNotes)
    ? rawProducerNotes.filter((n): n is string => typeof n === 'string' && n.trim().length > 0).slice(0, 4)
    : typeof rawProducerNotes === 'string' && rawProducerNotes.trim()
      ? [rawProducerNotes.trim()]
      : [`ถอดแนวทำนองและคีย์ ${song.baseKey} (${song.bpm} BPM) จากเสียงฮัมด้วย ${gemini.modelUsed}`];

  const modelLabel = usedTranscribeModel
    ? `${GEMINI_MODEL_TRANSCRIBE} + ${gemini.modelUsed}`
    : gemini.modelUsed;

  await recordServerFeatureEvent(
    request,
    {
      eventName: 'ai_hum_to_song',
      category: 'ai',
      songwriterStyle: typeof obj.songwriterStyle === 'string' ? obj.songwriterStyle : undefined,
      thaiGenre: getPresetConfig(stylePreset).thaiGenre,
      featureVariant: stylePreset,
      isSimulated: false,
      creditsCost: humCost,
      metadata: {
        vocalProfile,
        language,
        usedTranscribeModel,
        model: modelLabel,
      },
    },
    {
      userId: billing.active && 'userId' in billing ? billing.userId : undefined,
      skipAuthLookup: billing.active,
    }
  );

  return Response.json(
    {
      isSimulated: false,
      model: modelLabel,
      detected: {
        bpm: song.bpm,
        timeSignature: song.timeSignature,
        baseKey: song.baseKey,
      },
      transcribedLyrics: rawTranscribed,
      confidenceNote: rawConfidence,
      song,
      producerNotes,
      tip: `แกะเสียงฮัมเป็นโครงเพลง "${song.title}" (${song.baseKey} · ${song.bpm} BPM · ${song.timeSignature}) สำเร็จแล้ว`,
      usage: totalUsage,
      ...(billing.active ? { wallet: billing.wallet } : {}),
    } satisfies HumToSongResponseBody,
    { status: 200 }
  );
}
