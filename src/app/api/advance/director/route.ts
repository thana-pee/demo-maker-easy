import {
  buildDirectorSystemPrompt,
  buildDirectorUserPrompt,
  DIRECTOR_RESPONSE_SCHEMA,
} from '@/lib/aiPrompts';
import {
  callGeminiJson,
  GEMINI_MODEL_LITE,
  type GeminiTokenUsage,
} from '@/lib/geminiClient';
import { CREDIT_COST_TABLE } from '@/lib/creditManager';
import {
  refundServerBillingOnFailure,
  tryServerBillingPreDeduct,
  type WalletBalanceSummary,
} from '@/lib/serverWallet';
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
  const billing = await tryServerBillingPreDeduct(
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
    systemInstruction,
    responseSchema: DIRECTOR_RESPONSE_SCHEMA,
    maxOutputTokens: 2048,
    thinkingLevel: 'minimal',
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
}
