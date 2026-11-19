import {
  buildDirectorSystemPrompt,
  buildDirectorUserPrompt,
  DIRECTOR_RESPONSE_SCHEMA,
} from '@/lib/aiPrompts';
import {
  callGeminiJson,
  GEMINI_MODEL_FLASH,
  GEMINI_MODEL_LITE,
  type GeminiTokenUsage,
} from '@/lib/geminiClient';
import { CREDIT_COST_TABLE } from '@/lib/creditManager';
import {
  refundServerBillingOnFailure,
  tryServerBillingPreDeduct,
  type ServerBillingPreDeductResult,
  type WalletBalanceSummary,
} from '@/lib/serverWallet';
import { recordServerFeatureEvent } from '@/lib/serverAnalytics';
import type { AiDirectorPatch, AiDirectorSongSummary } from '@/lib/aiSongDirector';

export const maxDuration = 60;

export interface AdvanceDirectorRequestBody {
  prompt: string;
  songSummary: AiDirectorSongSummary;
}

export interface AdvanceDirectorResponseBody {
  isSimulated: boolean;
  model: string;
  patch: AiDirectorPatch | null;
  tip: string;
  usage?: GeminiTokenUsage;
  wallet?: WalletBalanceSummary;
  failureReason?: string;
}

const ACTIONABLE_SECTION_PATCH_KEYS = [
  'intensity',
  'guitarRhythm',
  'guitarLead',
  'bass',
  'piano',
  'drums',
  'guitarRhythmStyle',
  'guitarLeadStyle',
  'guitarLeadDrive',
  'bassStyle',
  'pianoStyle',
  'drumsStyle',
  'guitarRhythmVolume',
  'guitarLeadVolume',
  'bassVolume',
  'pianoVolume',
  'drumsVolume',
] as const;

function isActionableSectionPatch(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const sp = raw as Record<string, unknown>;
  for (const key of ACTIONABLE_SECTION_PATCH_KEYS) {
    if (sp[key] !== undefined && sp[key] !== null) return true;
  }
  if (Array.isArray(sp.chords) && sp.chords.some((c) => typeof c === 'string' && c.trim().length > 0)) {
    return true;
  }
  return false;
}

function hasUsableDirectorPatch(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const p = data as Record<string, unknown>;
  if (typeof p.bpm === 'number' && Number.isFinite(p.bpm)) return true;
  if (typeof p.baseKey === 'string' && /^[A-G][#b]?m?$/.test(p.baseKey.trim())) return true;
  if (p.timeSignature === '4/4' || p.timeSignature === '3/4' || p.timeSignature === '6/8') return true;
  if (typeof p.transposeSemitones === 'number' && Number.isFinite(p.transposeSemitones)) return true;
  if (typeof p.capoFret === 'number' && Number.isFinite(p.capoFret)) return true;
  if (typeof p.guitarModel === 'string' && p.guitarModel.trim().length > 0) return true;
  if (typeof p.stringGauge === 'string' && p.stringGauge.trim().length > 0) return true;
  if (typeof p.ambience3D === 'string' && p.ambience3D.trim().length > 0) return true;
  if (p.mixerPatch && typeof p.mixerPatch === 'object' && Object.keys(p.mixerPatch).length > 0) {
    return true;
  }
  if (Array.isArray(p.sectionPatches) && p.sectionPatches.some((sp) => isActionableSectionPatch(sp))) {
    return true;
  }
  return false;
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
  const prompt = typeof obj.prompt === 'string' ? obj.prompt.trim() : '';
  const songSummary =
    obj.songSummary && typeof obj.songSummary === 'object'
      ? (obj.songSummary as AiDirectorSongSummary)
      : null;

  if (!prompt || !songSummary || !Array.isArray(songSummary.sections)) {
    return Response.json(
      { error: 'Required fields: prompt (string), songSummary (object with sections[])' },
      { status: 400 }
    );
  }

  const directorCost = CREDIT_COST_TABLE.aiDirectorComplex;
  let billing: ServerBillingPreDeductResult = { active: false };
  let billingRefunded = false;

  try {
    billing = await tryServerBillingPreDeduct(
      request,
      directorCost,
      `AI Director (${GEMINI_MODEL_LITE}): ${prompt.slice(0, 28)}`,
      { modelId: GEMINI_MODEL_LITE }
    );
    if (billing.active && 'errorStatus' in billing) {
      return Response.json(
        { error: billing.error, code: billing.errorCode },
        { status: billing.errorStatus }
      );
    }

    const systemInstruction = buildDirectorSystemPrompt();
    const userPrompt = buildDirectorUserPrompt(prompt, songSummary);

    const gemini = await callGeminiJson<AiDirectorPatch>(userPrompt, {
      model: GEMINI_MODEL_LITE,
      fallbackModels: [GEMINI_MODEL_FLASH],
      systemInstruction,
      responseSchema: DIRECTOR_RESPONSE_SCHEMA,
      maxOutputTokens: 2048,
      thinkingLevel: 'low',
      timeoutMs: 20_000,
    });

    if (!gemini.ok) {
      let tip: string;
      if (gemini.reason === 'missing-key') {
        tip = `โหมดออฟไลน์ในเครื่อง (ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน .env.local) — ใช้ตัววิเคราะห์ในเครื่องแทนโดยไม่หักเครดิต (ใส่คีย์เพื่อใช้ ${GEMINI_MODEL_LITE})`;
      } else if (gemini.reason === 'rate-limit') {
        tip = 'โควตาคำขอ Gemini API เต็มชั่วคราว (429) — ใช้ตัววิเคราะห์ในเครื่องแทนโดยไม่หักเครดิต';
      } else if (gemini.reason === 'auth-error') {
        tip = 'GEMINI_API_KEY ไม่ถูกต้องหรือไม่มีสิทธิ์เข้าถึงโมเดล — ใช้ตัววิเคราะห์ในเครื่องแทนและไม่หักเครดิต';
      } else {
        tip = `${gemini.failureReason} — ใช้ตัววิเคราะห์ในเครื่องแทนอย่างปลอดภัย (ไม่หักเครดิต)`;
      }

      const refundedWallet = await refundServerBillingOnFailure(
        billing,
        directorCost,
        `Auto-refund AI Director (${gemini.reason})`,
        { modelId: GEMINI_MODEL_LITE }
      );
      billingRefunded = true;

      await recordServerFeatureEvent(
        request,
        {
          eventName: 'ai_studio_director',
          category: 'ai',
          isSimulated: true,
          creditsCost: 0,
        },
        { userId: billing.active && 'userId' in billing ? billing.userId : undefined, skipAuthLookup: billing.active }
      );

      return Response.json(
        {
          isSimulated: true,
          model: 'demo-offline-director',
          patch: null,
          tip,
          ...(refundedWallet ? { wallet: refundedWallet } : {}),
          failureReason: gemini.reason,
        } satisfies AdvanceDirectorResponseBody,
        { status: 200 }
      );
    }

    if (!hasUsableDirectorPatch(gemini.data)) {
      const refundedWallet = await refundServerBillingOnFailure(
        billing,
        directorCost,
        'Auto-refund AI Director (empty-patch)',
        { modelId: GEMINI_MODEL_LITE }
      );
      billingRefunded = true;

      await recordServerFeatureEvent(
        request,
        {
          eventName: 'ai_studio_director',
          category: 'ai',
          isSimulated: true,
          creditsCost: 0,
        },
        { userId: billing.active && 'userId' in billing ? billing.userId : undefined, skipAuthLookup: billing.active }
      );

      return Response.json(
        {
          isSimulated: true,
          model: 'demo-offline-director',
          patch: null,
          tip: 'AI ไม่ได้ส่งคำสั่งปรับแต่งที่ใช้งานได้ — สลับเป็นโหมดในเครื่องแทน (ไม่หักเครดิต)',
          ...(refundedWallet ? { wallet: refundedWallet } : {}),
          failureReason: 'parse-error',
        } satisfies AdvanceDirectorResponseBody,
        { status: 200 }
      );
    }

    await recordServerFeatureEvent(
      request,
      {
        eventName: 'ai_studio_director',
        category: 'ai',
        isSimulated: false,
        creditsCost: directorCost,
      },
      { userId: billing.active && 'userId' in billing ? billing.userId : undefined, skipAuthLookup: billing.active }
    );

    return Response.json(
      {
        isSimulated: false,
        model: gemini.modelUsed,
        patch: gemini.data,
        tip: `จัดมิกซ์และเรียบเรียงดนตรีด้วย ${gemini.modelUsed} เรียบร้อยแล้ว`,
        usage: gemini.usage,
        ...(billing.active ? { wallet: billing.wallet } : {}),
      } satisfies AdvanceDirectorResponseBody,
      { status: 200 }
    );
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const safeMsg = rawMsg
      .replace(/AIza[A-Za-z0-9_-]{8,}/g, '[REDACTED]')
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
    console.error('[director] unexpected failure:', safeMsg);

    const refundedWallet = !billingRefunded
      ? await refundServerBillingOnFailure(
          billing,
          directorCost,
          'Auto-refund AI Director (internal-error)',
          { modelId: GEMINI_MODEL_LITE }
        )
      : undefined;

    return Response.json(
      {
        error: refundedWallet
          ? `เซิร์ฟเวอร์ขัดข้องชั่วคราวระหว่างสั่งงาน AI Director (คืน ${directorCost} เครดิตให้แล้วอัตโนมัติ)`
          : 'เซิร์ฟเวอร์ขัดข้องชั่วคราวระหว่างสั่งงาน AI Director (ไม่หักเครดิต) กรุณาลองใหม่อีกครั้ง',
        code: 'DIRECTOR_INTERNAL_ERROR',
        ...(refundedWallet ? { wallet: refundedWallet } : {}),
      },
      { status: 500 }
    );
  }
}
