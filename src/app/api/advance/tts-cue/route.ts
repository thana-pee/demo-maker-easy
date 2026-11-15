import { buildTtsCueStyleHint } from '@/lib/aiPrompts';
import { CREDIT_COST_TABLE } from '@/lib/creditManager';
import {
  GEMINI_MODEL_TTS,
  GEMINI_MODEL_TTS_LITE,
  callGeminiTtsAudio,
  type GeminiTokenUsage,
} from '@/lib/geminiClient';
import {
  refundServerBillingOnFailure,
  tryServerBillingPreDeduct,
  type WalletBalanceSummary,
} from '@/lib/serverWallet';
import { recordServerFeatureEvent } from '@/lib/serverAnalytics';

export const maxDuration = 60;

export const MAX_TTS_CUE_CHARS = 240;
export const MAX_TTS_DURATION_SEC = 30;

export interface TtsCueResponseBody {
  isSimulated: boolean;
  model: string;
  cueText: string;
  audioDataUrl: string | null;
  mimeType: string | null;
  tip: string;
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
  const rawText = typeof obj.text === 'string' ? obj.text.trim() : '';

  if (!rawText) {
    return Response.json(
      { error: 'Required field: text (short vocal phrasing or lyric cue)' },
      { status: 400 }
    );
  }

  if (rawText.length > MAX_TTS_CUE_CHARS) {
    return Response.json(
      {
        error: `Text length (${rawText.length}) exceeds maximum cap of ${MAX_TTS_CUE_CHARS} characters (~${MAX_TTS_DURATION_SEC}s limit)`,
      },
      { status: 400 }
    );
  }

  if (obj.durationSec !== undefined) {
    const reqDuration = typeof obj.durationSec === 'number' ? obj.durationSec : NaN;
    if (!Number.isFinite(reqDuration) || reqDuration <= 0 || reqDuration > MAX_TTS_DURATION_SEC) {
      return Response.json(
        {
          error: `durationSec must be between 0.5 and ${MAX_TTS_DURATION_SEC} seconds`,
        },
        { status: 400 }
      );
    }
  }

  const language: 'th' | 'en' = obj.language === 'en' ? 'en' : 'th';
  const rawBpm = typeof obj.bpm === 'number' && Number.isFinite(obj.bpm) ? Math.round(obj.bpm) : 85;
  const bpm = Math.max(50, Math.min(180, rawBpm));
  const includeCountIn = Boolean(obj.includeCountIn);
  const voice = typeof obj.voice === 'string' && obj.voice.trim() ? obj.voice.trim() : 'Kore';
  const requestedModel = obj.modelTier === 'pro-tts' ? GEMINI_MODEL_TTS : GEMINI_MODEL_TTS_LITE;
  const vocalMode = obj.vocalMode === 'singing-demo' ? 'singing-demo' : 'guide';
  const thaiGenre = typeof obj.thaiGenre === 'string' ? obj.thaiGenre.trim() : '';
  const sectionType = typeof obj.sectionType === 'string' ? obj.sectionType.trim() : '';
  const baseKey = typeof obj.baseKey === 'string' ? obj.baseKey.trim() : '';
  const rawTargetDuration =
    typeof obj.targetDurationSec === 'number' &&
    Number.isFinite(obj.targetDurationSec) &&
    obj.targetDurationSec >= 2 &&
    obj.targetDurationSec <= MAX_TTS_DURATION_SEC
      ? Number(obj.targetDurationSec.toFixed(1))
      : null;

  const countInPrefix = includeCountIn
    ? language === 'en'
      ? 'One, two, three, four. '
      : 'หนึ่ง, สอง, สาม, สี่... '
    : '';
  const spokenText = `${countInPrefix}${rawText}`;
  const styleHint = buildTtsCueStyleHint({
    language,
    vocalMode,
    bpm,
    thaiGenre,
    targetDurationSec: rawTargetDuration,
    sectionType,
    baseKey,
  });

  const ttsCost = CREDIT_COST_TABLE.aiTtsCue;
  const billing = await tryServerBillingPreDeduct(
    request,
    ttsCost,
    `TTS Cue (${requestedModel}): ${rawText.slice(0, 24)}`,
    { modelId: requestedModel }
  );
  if (billing.active && 'errorStatus' in billing) {
    return Response.json(
      { error: billing.error, code: billing.errorCode },
      { status: billing.errorStatus }
    );
  }

  const ttsResult = await callGeminiTtsAudio(spokenText, {
    model: requestedModel,
    voice,
    language: language === 'en' ? 'en-US' : 'th-TH',
    styleHint,
  });

  if (!ttsResult.ok) {
    let tip: string;
    if (ttsResult.reason === 'missing-key') {
      tip = 'โหมดจำลองเสียงไกด์ TTS (ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์) — ใช้เสียงอ่านในเบราว์เซอร์แทนโดยไม่หัก 2 เครดิต';
    } else if (ttsResult.reason === 'rate-limit') {
      tip = 'โควตาคำขอ Gemini API เต็มชั่วคราว (429) — ใช้เสียงอ่านในเบราว์เซอร์แทนโดยไม่หัก 2 เครดิต';
    } else if (ttsResult.reason === 'auth-error') {
      tip = 'GEMINI_API_KEY ไม่ถูกต้องหรือไม่มีสิทธิ์เข้าถึง TTS — ใช้เสียงอ่านในเบราว์เซอร์แทนโดยไม่หัก 2 เครดิต';
    } else {
      tip = `${ttsResult.failureReason} — ใช้เสียงอ่านในเบราว์เซอร์แทนโดยไม่หัก 2 เครดิต`;
    }

    const refundedWallet = await refundServerBillingOnFailure(
      billing,
      ttsCost,
      `Auto-refund TTS Cue (${ttsResult.reason})`,
      { modelId: requestedModel }
    );

    await recordServerFeatureEvent(
      request,
      {
        eventName: 'ai_tts_vocal_cue',
        category: 'ai',
        songwriterStyle: typeof obj.songwriterStyle === 'string' ? obj.songwriterStyle : undefined,
        thaiGenre,
        featureVariant: vocalMode,
        isSimulated: true,
        creditsCost: 0,
        metadata: {
          model: requestedModel,
          vocalMode,
          language,
          voice,
          reason: ttsResult.reason,
        },
      },
      {
        userId: billing.active && 'userId' in billing ? billing.userId : undefined,
        skipAuthLookup: billing.active,
      }
    );

    return Response.json(
      {
        isSimulated: true,
        model: 'browser-speech-fallback',
        cueText: spokenText,
        audioDataUrl: null,
        mimeType: null,
        tip,
        ...(refundedWallet ? { wallet: refundedWallet } : {}),
        failureReason: ttsResult.reason,
      } satisfies TtsCueResponseBody,
      { status: 200 }
    );
  }

  const audioDataUrl = `data:${ttsResult.mimeType};base64,${ttsResult.audioBase64}`;

  await recordServerFeatureEvent(
    request,
    {
      eventName: 'ai_tts_vocal_cue',
      category: 'ai',
      songwriterStyle: typeof obj.songwriterStyle === 'string' ? obj.songwriterStyle : undefined,
      thaiGenre,
      featureVariant: vocalMode,
      isSimulated: false,
      creditsCost: ttsCost,
      metadata: {
        model: requestedModel,
        vocalMode,
        language,
        voice,
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
      model: ttsResult.modelUsed,
      cueText: spokenText,
      audioDataUrl,
      mimeType: ttsResult.mimeType,
      tip: `สร้างเสียงไกด์แบ่งจังหวะ (${bpm} BPM) ด้วย ${ttsResult.modelUsed} สำเร็จแล้ว`,
      usage: ttsResult.usage,
      ...(billing.active ? { wallet: billing.wallet } : {}),
    } satisfies TtsCueResponseBody,
    { status: 200 }
  );
}
