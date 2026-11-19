import { ApiError, GoogleGenAI, Modality, type GenerateContentResponse, type GenerateContentResponseUsageMetadata } from '@google/genai';

/**
 * โมดูลเชื่อมต่อ @google/genai SDK ฝั่ง Server-Side (Interactions API)
 * ใช้โมเดลตระกูล Gemini 3.5 / 3.8 / 4 และ Lyria 3.5 ที่เป็น Public Model IDs
 * รองรับ Structured Output Schema, Thinking Level Normalization และ Usage Telemetry
 */

export const GEMINI_MODEL_LITE = 'gemini-3.5-flash-lite';
export const GEMINI_MODEL_FAST_LITE = 'gemini-3.1-flash-lite';
export const GEMINI_MODEL_FLASH = 'gemini-3.8-flash';
export const GEMINI_MODEL_MAIN = 'gemini-4-hydrogen';
export const GEMINI_MODEL_PRO = 'gemini-4-argon';
export const GEMINI_MODEL_CARBON = 'gemini-4-carbon';
export const GEMINI_MODEL_TRANSCRIBE = 'gemini-3.5-transcribe';
export const GEMINI_MODEL_TTS_LITE = 'gemini-3.8-flash-lite-tts';
export const GEMINI_MODEL_TTS = 'gemini-3.8-flash-tts';
export const GEMINI_MODEL_MUSIC = 'lyria-3.5';

export const DEFAULT_GEMINI_MODEL = GEMINI_MODEL_MAIN;

export type GeminiThinkingLevel = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export interface GeminiTokenUsage {
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  totalTokens: number;
}

export type GeminiFailureReason =
  | 'missing-key'
  | 'rate-limit'
  | 'auth-error'
  | 'http-error'
  | 'api-error'
  | 'incomplete-output'
  | 'parse-error'
  | 'network-error';

export type GeminiAudioMimeType =
  | 'audio/wav'
  | 'audio/mp3'
  | 'audio/aiff'
  | 'audio/aac'
  | 'audio/ogg'
  | 'audio/flac'
  | 'audio/mpeg'
  | 'audio/m4a'
  | 'audio/l16'
  | 'audio/opus'
  | 'audio/alaw'
  | 'audio/mulaw'
  | 'audio/webm';

export type GeminiInputPart =
  | { type: 'text'; text: string }
  | { type: 'audio'; data: string; mime_type: GeminiAudioMimeType };

export type GeminiFailureResult = {
  ok: false;
  model: string;
  modelUsed: string;
  reason: GeminiFailureReason;
  status?: number;
  failureReason: string;
  isSimulated: false;
};

export type GeminiJsonResult<T> =
  | {
      ok: true;
      model: string;
      modelUsed: string;
      data: T;
      usage: GeminiTokenUsage;
      isSimulated: false;
    }
  | GeminiFailureResult;

export type GeminiTranscribeResult =
  | {
      ok: true;
      model: string;
      modelUsed: string;
      transcript: string;
      usage: GeminiTokenUsage;
      isSimulated: false;
    }
  | GeminiFailureResult;

export type GeminiTtsResult =
  | {
      ok: true;
      model: string;
      modelUsed: string;
      audioBase64: string;
      mimeType: string;
      usage: GeminiTokenUsage;
      isSimulated: false;
    }
  | GeminiFailureResult;

export type GeminiMusicResult =
  | {
      ok: true;
      model: string;
      modelUsed: string;
      audioBase64: string;
      mimeType: string;
      lyricsOrNotes: string;
      usage: GeminiTokenUsage;
      isSimulated: false;
    }
  | GeminiFailureResult;

export interface GeminiJsonCallOptions {
  model?: string;
  fallbackModels?: string[];
  systemInstruction?: string;
  responseSchema?: Record<string, unknown>;
  maxOutputTokens?: number;
  thinkingLevel?: GeminiThinkingLevel;
  timeoutMs?: number;
}

export interface GeminiTtsCallOptions {
  model?: string;
  voice?: string;
  language?: string;
  styleHint?: string;
  mimeType?: 'audio/mp3' | 'audio/wav' | 'audio/ogg_opus';
  timeoutMs?: number;
}

/** แปลงชื่อโมเดลเก่า/Alias ให้เป็น Public Model ID ปัจจุบันใน @google/genai */
export function normalizeGeminiModel(rawModel?: string): string {
  const trimmed = rawModel?.trim();
  if (!trimmed) return DEFAULT_GEMINI_MODEL;

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('gemini-2.5') ||
    lower.startsWith('gemini-2.0') ||
    lower.startsWith('gemini-1.5')
  ) {
    return DEFAULT_GEMINI_MODEL;
  }

  return trimmed;
}

/** อ่าน GEMINI_API_KEY จากฝั่ง Server อย่างปลอดภัย (ไม่คืนค่าหรือ Log ออกไป) */
export function getGeminiApiKey(): string {
  return process.env.GEMINI_API_KEY?.trim() || '';
}

/** เลือกโมเดลที่จะใช้งาน โดยเคารพลำดับ: preferredModel -> env GEMINI_MODEL -> DEFAULT_GEMINI_MODEL */
export function resolveGeminiModel(preferredModel?: string): string {
  const preferred = preferredModel?.trim();
  if (preferred) {
    return normalizeGeminiModel(preferred);
  }
  const envModel = process.env.GEMINI_MODEL?.trim();
  if (envModel) {
    return normalizeGeminiModel(envModel);
  }
  return DEFAULT_GEMINI_MODEL;
}

/**
 * ปรับระดับการคิด (thinking_level) ให้ปลอดภัยตามข้อจำกัดของโมเดล:
 * - gemini-3.5-flash-lite / gemini-3.1-flash-lite รองรับ minimal | low | medium | high
 * - gemini-4-hydrogen รองรับ low | medium | high | xhigh (minimal -> low)
 * - gemini-4-argon / gemini-4-carbon / gemini-3.8-flash รองรับ low | medium | high (minimal -> low, xhigh -> high)
 */
export function resolveThinkingLevel(
  model: string,
  requested?: GeminiThinkingLevel
): GeminiThinkingLevel {
  const normalized = normalizeGeminiModel(model).toLowerCase();
  if (normalized === GEMINI_MODEL_LITE || normalized === GEMINI_MODEL_FAST_LITE) {
    if (!requested) return 'minimal';
    return requested === 'xhigh' ? 'high' : requested;
  }
  if (!requested || requested === 'minimal') {
    return 'low';
  }
  if (requested === 'xhigh' && normalized !== GEMINI_MODEL_MAIN) {
    return 'high';
  }
  return requested;
}

/** คำนวณ max_output_tokens ที่ปลอดภัยและไม่เกินลิมิตจริงของแต่ละโมเดล */
export function resolveMaxOutputTokens(model: string, requested?: number): number {
  const normalized = normalizeGeminiModel(model).toLowerCase();
  const isArgon = normalized === GEMINI_MODEL_PRO;
  const isCarbon = normalized === GEMINI_MODEL_CARBON;
  const isLite = normalized === GEMINI_MODEL_LITE || normalized === GEMINI_MODEL_FAST_LITE;
  const maxCap = isArgon || isCarbon ? 32768 : 65536;

  if (isArgon) {
    const minArgonBudget = 32768;
    if (typeof requested === 'number' && Number.isFinite(requested) && requested > 0) {
      return Math.min(maxCap, Math.max(minArgonBudget, Math.round(requested)));
    }
    return minArgonBudget;
  }

  if (typeof requested === 'number' && Number.isFinite(requested) && requested > 0) {
    return Math.min(maxCap, Math.round(requested));
  }

  if (isCarbon) return 32768;
  return isLite ? 2048 : 4096;
}

/** ดึง JSON ออกจากข้อความตอบกลับแม้โมเดลจะครอบ ```json ... ``` หรือมีข้อความอธิบายล้อมรอบ */
export function extractJsonFromText<T>(rawText: string): T | null {
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  if (!cleaned) return null;
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Fall through to balanced bracket recovery
  }

  for (let start = 0; start < rawText.length; start += 1) {
    const openChar = rawText[start];
    if (openChar !== '{' && openChar !== '[') continue;

    const stack: string[] = [openChar === '{' ? '}' : ']'];
    let inString = false;
    let escaped = false;

    for (let i = start + 1; i < rawText.length; i += 1) {
      const ch = rawText[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
      } else if (ch === '{') {
        stack.push('}');
      } else if (ch === '[') {
        stack.push(']');
      } else if (ch === '}' || ch === ']') {
        if (stack[stack.length - 1] !== ch) {
          break;
        }
        stack.pop();
        if (stack.length === 0) {
          const candidate = rawText.slice(start, i + 1);
          try {
            const parsed = JSON.parse(candidate) as unknown;
            if (parsed !== null && typeof parsed === 'object') {
              return parsed as T;
            }
          } catch {
            // Continue searching later brackets if prose contained stray braces
          }
          break;
        }
      }
    }
  }

  return null;
}

function extractHttpErrorStatus(error: unknown): number | undefined {
  if (error instanceof ApiError) {
    return error.status;
  }
  if (error && typeof error === 'object') {
    const record = error as { status?: unknown; statusCode?: unknown };
    if (typeof record.status === 'number') return record.status;
    if (typeof record.statusCode === 'number') return record.statusCode;
  }
  return undefined;
}

function classifyHttpStatus(status: number | undefined): GeminiFailureReason {
  if (status === 429) return 'rate-limit';
  if (status === 401 || status === 403) return 'auth-error';
  return 'http-error';
}

function buildUsageTelemetry(rawUsage?: {
  total_input_tokens?: number;
  total_cached_tokens?: number;
  total_output_tokens?: number;
  total_thought_tokens?: number;
  total_tokens?: number;
}): GeminiTokenUsage {
  const inputTokens = rawUsage?.total_input_tokens ?? 0;
  const cachedTokens = rawUsage?.total_cached_tokens ?? 0;
  const outputTokens = rawUsage?.total_output_tokens ?? 0;
  const thoughtTokens = rawUsage?.total_thought_tokens ?? 0;
  const totalTokens = rawUsage?.total_tokens ?? inputTokens + outputTokens + thoughtTokens;
  return {
    inputTokens,
    cachedTokens,
    outputTokens,
    thoughtTokens,
    totalTokens,
  };
}

function buildMissingKeyFailure(model: string): GeminiFailureResult {
  return {
    ok: false,
    model,
    modelUsed: model,
    reason: 'missing-key',
    failureReason: 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์',
    isSimulated: false,
  };
}

function evaluateInteractionTerminalFailure(
  interaction: {
    model?: string;
    status?: string;
    errors?: Array<{ message?: string }>;
  },
  model: string
): GeminiFailureResult | null {
  const modelUsed = interaction.model || model;

  if (interaction.status === 'failed' || interaction.status === 'cancelled') {
    const firstErr = interaction.errors?.[0];
    return {
      ok: false,
      model,
      modelUsed,
      reason: 'api-error',
      failureReason: firstErr?.message || `โมเดลตอบกลับสถานะ ${interaction.status}`,
      isSimulated: false,
    };
  }

  if (interaction.status === 'incomplete' || interaction.status === 'budget_exceeded') {
    return {
      ok: false,
      model,
      modelUsed,
      reason: 'incomplete-output',
      failureReason: `ผลลัพธ์ไม่สมบูรณ์ (${interaction.status}) — อาจเกินงบประมาณ Token`,
      isSimulated: false,
    };
  }

  return null;
}

function sanitizeErrorDetail(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  let text = raw.trim();
  if (!text) return undefined;

  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as { error?: { message?: unknown }; message?: unknown };
      const nested = parsed?.error?.message ?? parsed?.message;
      if (typeof nested === 'string' && nested.trim()) {
        text = nested.trim();
      }
    } catch {
      // Keep original string if not valid JSON
    }
  }

  const sanitized = text
    .replace(/AIza[A-Za-z0-9_-]{8,}/g, '[REDACTED]')
    .replace(/([?&]key=)[^&\s"']+/gi, '$1[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/\s+/g, ' ')
    .trim();

  if (!sanitized) return undefined;
  return sanitized.length > 220 ? `${sanitized.slice(0, 217)}...` : sanitized;
}

function extractHttpErrorDetail(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const record = error as { error?: { message?: unknown }; message?: unknown };
  return (
    sanitizeErrorDetail(record.error?.message) ||
    sanitizeErrorDetail(record.message)
  );
}

function buildGenerateContentUsageTelemetry(
  rawUsage?: GenerateContentResponseUsageMetadata
): GeminiTokenUsage {
  const inputTokens = rawUsage?.promptTokenCount ?? 0;
  const cachedTokens = rawUsage?.cachedContentTokenCount ?? 0;
  const outputTokens = rawUsage?.candidatesTokenCount ?? 0;
  const thoughtTokens = rawUsage?.thoughtsTokenCount ?? 0;
  const totalTokens = rawUsage?.totalTokenCount ?? inputTokens + outputTokens + thoughtTokens;
  return {
    inputTokens,
    cachedTokens,
    outputTokens,
    thoughtTokens,
    totalTokens,
  };
}

function wrapL16PcmInWav(base64Data: string, mimeType: string): { data: string; mimeType: string } {
  const rawBytes = Buffer.from(base64Data, 'base64');
  const rateMatch = mimeType.match(/rate=(\d+)/i);
  const sampleRate = rateMatch ? Number.parseInt(rateMatch[1], 10) || 24000 : 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + rawBytes.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(rawBytes.length, 40);
  return {
    data: Buffer.concat([header, rawBytes]).toString('base64'),
    mimeType: 'audio/wav',
  };
}

function extractAudioFromGenerateContentResponse(
  response: GenerateContentResponse
): { data: string; mimeType: string } | null {
  const candidates = response.candidates ?? [];
  for (const candidate of candidates) {
    const parts = candidate.content?.parts ?? [];
    for (const part of parts) {
      const inlineData = part.inlineData;
      if (inlineData?.data && inlineData.data.trim()) {
        const mime = inlineData.mimeType || 'audio/wav';
        if (mime.toLowerCase().includes('l16')) {
          return wrapL16PcmInWav(inlineData.data.trim(), mime);
        }
        return { data: inlineData.data.trim(), mimeType: mime };
      }
    }
  }
  return null;
}

function isAbortOrTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { name?: unknown; message?: unknown };
  const name = typeof record.name === 'string' ? record.name.toLowerCase() : '';
  const message = typeof record.message === 'string' ? record.message.toLowerCase() : '';
  return (
    name.includes('abort') ||
    name.includes('timeout') ||
    name.includes('interrupted') ||
    message.includes('gemini_timeout') ||
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('aborted')
  );
}

async function runWithAbortTimeout<T>(
  timeoutMs: number,
  executor: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const err = new Error('GEMINI_TIMEOUT');
      controller.abort(err);
      reject(err);
    }, timeoutMs);
  });
  try {
    return await Promise.race([executor(controller.signal), timeoutPromise]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

function classifyInteractionError(error: unknown, model: string): GeminiFailureResult {
  const httpStatus = extractHttpErrorStatus(error);
  const detail = extractHttpErrorDetail(error);
  if (typeof httpStatus === 'number') {
    console.error(`[geminiClient] ${model} HTTP ${httpStatus}${detail ? `: ${detail}` : ''}`);
    const reason = classifyHttpStatus(httpStatus);
    const failureReason =
      reason === 'rate-limit'
        ? 'โควตาคำขอ Gemini API เต็มชั่วคราว (429 Rate Limit)'
        : reason === 'auth-error'
          ? 'GEMINI_API_KEY ไม่ถูกต้องหรือไม่มีสิทธิ์ใช้งานโมเดลนี้'
          : `Gemini API ตอบกลับ HTTP ${httpStatus}${detail ? `: ${detail}` : ''}`;
    return {
      ok: false,
      model,
      modelUsed: model,
      reason,
      status: httpStatus,
      failureReason,
      isSimulated: false,
    };
  }

  const timedOut = isAbortOrTimeoutError(error);
  if (timedOut) {
    console.error(`[geminiClient] ${model} request timed out`);
  }

  return {
    ok: false,
    model,
    modelUsed: model,
    reason: 'network-error',
    failureReason: timedOut
      ? 'Gemini API ใช้เวลาประมวลผลนานเกินกำหนดชั่วคราว (Timeout)'
      : 'ไม่สามารถเชื่อมต่อกับบริการ Gemini API ได้ชั่วคราว',
    isSimulated: false,
  };
}

function extractTextFromInteraction(interaction: {
  output_text?: string;
  steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
}): string {
  if (typeof interaction.output_text === 'string' && interaction.output_text.trim()) {
    return interaction.output_text.trim();
  }
  const chunks: string[] = [];
  for (const step of interaction.steps ?? []) {
    if (step.type !== 'model_output' || !Array.isArray(step.content)) continue;
    for (const part of step.content) {
      if (part.type === 'text' && typeof part.text === 'string' && part.text.trim()) {
        chunks.push(part.text.trim());
      }
    }
  }
  return chunks.join('\n').trim();
}

function extractAudioFromInteraction(interaction: {
  output_audio?: { data?: string; mime_type?: string };
  steps?: Array<{
    type?: string;
    content?: Array<{ type?: string; data?: string; mime_type?: string }>;
  }>;
}): { data: string; mimeType: string } | null {
  if (interaction.output_audio?.data) {
    return {
      data: interaction.output_audio.data,
      mimeType: interaction.output_audio.mime_type || 'audio/wav',
    };
  }
  const steps = interaction.steps ?? [];
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const step = steps[i];
    if (step.type !== 'model_output' || !Array.isArray(step.content)) continue;
    for (let j = step.content.length - 1; j >= 0; j -= 1) {
      const part = step.content[j];
      if (part.type === 'audio' && typeof part.data === 'string' && part.data.trim()) {
        return {
          data: part.data.trim(),
          mimeType: part.mime_type || 'audio/wav',
        };
      }
    }
  }
  return null;
}

const DEFAULT_GEMINI_TIMEOUT_MS = 42_000;

function isRetryableJsonFailure(failure: GeminiFailureResult): boolean {
  if (failure.reason === 'missing-key' || failure.reason === 'auth-error') {
    return false;
  }
  if (
    failure.reason === 'rate-limit' ||
    failure.reason === 'network-error' ||
    failure.reason === 'incomplete-output' ||
    failure.reason === 'parse-error'
  ) {
    return true;
  }
  if (failure.reason === 'http-error') {
    if (typeof failure.status !== 'number') return true;
    return failure.status >= 500 || failure.status === 404 || failure.status === 408;
  }
  return false;
}

/**
 * เรียก Gemini Interactions API ผ่าน official @google/genai SDK และรับ JSON ตาม Schema
 * รองรับทั้ง Prompt ข้อความเดี่ยว และ Multimodal Part Array (ข้อความ + ไฟล์เสียง Base64)
 * พร้อม Auto-Fallback Chain ข้ามโมเดลเมื่อเจอ Rate Limit / Timeout / 5xx / 404 / Parse Error
 */
export async function callGeminiJson<T>(
  promptOrInput: string | GeminiInputPart[],
  options?: GeminiJsonCallOptions
): Promise<GeminiJsonResult<T>> {
  const apiKey = getGeminiApiKey();
  const primaryModel = resolveGeminiModel(options?.model);

  if (!apiKey) {
    return buildMissingKeyFailure(primaryModel);
  }

  const candidateModels: string[] = [];
  for (const rawCandidate of [primaryModel, ...(options?.fallbackModels ?? [])]) {
    const normalized = normalizeGeminiModel(rawCandidate);
    if (normalized && !candidateModels.includes(normalized)) {
      candidateModels.push(normalized);
    }
  }

  const baseTimeoutMs =
    typeof options?.timeoutMs === 'number' && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? Math.round(options.timeoutMs)
      : DEFAULT_GEMINI_TIMEOUT_MS;

  const ai = new GoogleGenAI({ apiKey, apiVersion: 'v1beta' });
  let previousTimedOut = false;
  let lastFailure: GeminiFailureResult | null = null;

  for (let idx = 0; idx < candidateModels.length; idx += 1) {
    const candidateModel = candidateModels[idx];
    const thinkingLevel = resolveThinkingLevel(candidateModel, options?.thinkingLevel);
    const maxOutputTokens = resolveMaxOutputTokens(candidateModel, options?.maxOutputTokens);
    const attemptTimeoutMs =
      idx > 0 && previousTimedOut && baseTimeoutMs > 15_000
        ? Math.min(baseTimeoutMs, 15_000)
        : baseTimeoutMs;

    let attemptFailure: GeminiFailureResult;

    try {
      const interaction = await runWithAbortTimeout(attemptTimeoutMs, (signal) =>
        ai.interactions.create(
          {
            model: candidateModel,
            input: promptOrInput,
            ...(options?.systemInstruction ? { system_instruction: options.systemInstruction } : {}),
            response_format: {
              type: 'text',
              mime_type: 'application/json',
              ...(options?.responseSchema ? { schema: options.responseSchema } : {}),
            },
            generation_config: {
              max_output_tokens: maxOutputTokens,
              thinking_level: thinkingLevel,
            },
            store: false,
          },
          {
            retries: { strategy: 'none' },
            timeout_ms: attemptTimeoutMs,
            fetch_options: { signal },
          }
        )
      );

      const terminalFailure = evaluateInteractionTerminalFailure(interaction, candidateModel);
      if (terminalFailure) {
        attemptFailure = terminalFailure;
      } else {
        const modelUsed = interaction.model || candidateModel;
        const usage = buildUsageTelemetry(interaction.usage);
        const rawText = extractTextFromInteraction(
          interaction as Parameters<typeof extractTextFromInteraction>[0]
        );
        const parsed = extractJsonFromText<T>(rawText);
        if (!parsed) {
          attemptFailure = {
            ok: false,
            model: candidateModel,
            modelUsed,
            reason: 'parse-error',
            failureReason: 'รูปแบบ JSON ที่ได้จากโมเดลไม่ถูกต้อง',
            isSimulated: false,
          };
        } else {
          return {
            ok: true,
            model: candidateModel,
            modelUsed,
            data: parsed,
            usage,
            isSimulated: false,
          };
        }
      }
    } catch (error) {
      attemptFailure = classifyInteractionError(error, candidateModel);
    }

    lastFailure = attemptFailure;
    previousTimedOut =
      attemptFailure.reason === 'network-error' && attemptFailure.failureReason.includes('Timeout');

    if (idx < candidateModels.length - 1 && isRetryableJsonFailure(attemptFailure)) {
      continue;
    }

    return attemptFailure;
  }

  return lastFailure ?? buildMissingKeyFailure(primaryModel);
}

/**
 * ถอดข้อความคำร้อง/เสียงฮัมผ่านโมเดล gemini-3.5-transcribe (optional pre-pass สำหรับ Hum-to-Song)
 */
export async function callGeminiTranscribeAudio(
  audioBase64: string,
  mimeType: GeminiAudioMimeType,
  options?: { model?: string; timeoutMs?: number }
): Promise<GeminiTranscribeResult> {
  const apiKey = getGeminiApiKey();
  const model = normalizeGeminiModel(options?.model || GEMINI_MODEL_TRANSCRIBE);

  if (!apiKey) {
    return buildMissingKeyFailure(model);
  }

  const timeoutMs =
    typeof options?.timeoutMs === 'number' && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? Math.round(options.timeoutMs)
      : 12_000;

  const ai = new GoogleGenAI({ apiKey, apiVersion: 'v1beta' });
  let primaryFailure: GeminiFailureResult | null = null;

  try {
    const interaction = await runWithAbortTimeout(timeoutMs, (signal) =>
      ai.interactions.create(
        {
          model,
          input: [
            {
              type: 'audio',
              data: audioBase64,
              mime_type: mimeType,
            },
          ],
          store: false,
        },
        {
          retries: { strategy: 'none' },
          timeout_ms: timeoutMs,
          fetch_options: { signal },
        }
      )
    );

    const terminalFailure = evaluateInteractionTerminalFailure(interaction, model);
    if (!terminalFailure) {
      const modelUsed = interaction.model || model;
      const usage = buildUsageTelemetry(interaction.usage);
      const transcript = extractTextFromInteraction(
        interaction as Parameters<typeof extractTextFromInteraction>[0]
      );

      return {
        ok: true,
        model,
        modelUsed,
        transcript,
        usage,
        isSimulated: false,
      };
    }

    primaryFailure = terminalFailure;
  } catch (error) {
    const classified = classifyInteractionError(error, model);
    if (classified.status !== 400 && classified.status !== 404) {
      return classified;
    }
    primaryFailure = classified;
  }

  if (typeof ai.models?.generateContent === 'function') {
    try {
      const response = await runWithAbortTimeout(timeoutMs, (signal) =>
        ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [{ inlineData: { data: audioBase64, mimeType } }],
            },
          ],
          config: {
            abortSignal: signal,
          },
        })
      );
      const fallbackPartsText = (response.candidates ?? [])
        .flatMap((candidate) => candidate.content?.parts ?? [])
        .map((part) => (typeof part.text === 'string' ? part.text.trim() : ''))
        .filter(Boolean)
        .join('\n')
        .trim();
      const transcript = (response.text ?? fallbackPartsText).trim();
      if ((response.candidates?.length ?? 0) > 0 || transcript) {
        return {
          ok: true,
          model,
          modelUsed: response.modelVersion || model,
          transcript,
          usage: buildGenerateContentUsageTelemetry(response.usageMetadata),
          isSimulated: false,
        };
      }
    } catch (fallbackError) {
      return classifyInteractionError(fallbackError, model);
    }
  }

  return primaryFailure;
}

/**
 * สร้างเสียงไกด์ร้อง/นับจังหวะผ่าน Gemini 3.8 TTS (gemini-3.8-flash-lite-tts / gemini-3.8-flash-tts)
 * ใช้รูปแบบ Current Interactions SDK (response_format: { type: 'audio' } + speech_metadata annotation)
 */
export async function callGeminiTtsAudio(
  spokenText: string,
  options?: GeminiTtsCallOptions
): Promise<GeminiTtsResult> {
  const apiKey = getGeminiApiKey();
  const model = normalizeGeminiModel(options?.model || GEMINI_MODEL_TTS_LITE);

  if (!apiKey) {
    return buildMissingKeyFailure(model);
  }

  const voice = options?.voice?.trim() || 'Kore';
  const styleHint = options?.styleHint?.trim();
  const timeoutMs =
    typeof options?.timeoutMs === 'number' && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? Math.round(options.timeoutMs)
      : 35_000;

  // Gemini 3.8 TTS & /interactions audio endpoints require v1beta in @google/genai@3.3 (defaults to v1)
  const ai = new GoogleGenAI({ apiKey, apiVersion: 'v1beta' });
  let primaryFailure: GeminiFailureResult | null = null;

  try {
    const interaction = await runWithAbortTimeout(timeoutMs, (signal) =>
      ai.interactions.create(
        {
          model,
          input: [
            {
              type: 'user_input',
              content: [
                {
                  type: 'text',
                  text: spokenText,
                  ...(styleHint
                    ? {
                        annotations: [
                          {
                            type: 'speech_metadata' as const,
                            style: styleHint,
                          },
                        ],
                      }
                    : {}),
                },
              ],
            },
          ],
          response_format: {
            type: 'audio',
            ...(options?.mimeType ? { mime_type: options.mimeType } : {}),
          },
          generation_config: {
            speech_config: [{ voice }],
          },
        },
        {
          retries: { strategy: 'none' },
          timeout_ms: timeoutMs,
          fetch_options: { signal },
        }
      )
    );

    const terminalFailure = evaluateInteractionTerminalFailure(interaction, model);
    if (!terminalFailure) {
      const modelUsed = interaction.model || model;
      const usage = buildUsageTelemetry(interaction.usage);
      const rawAudioBlock = extractAudioFromInteraction(
        interaction as Parameters<typeof extractAudioFromInteraction>[0]
      );

      if (!rawAudioBlock) {
        return {
          ok: false,
          model,
          modelUsed,
          reason: 'parse-error',
          failureReason: 'ไม่พบข้อมูลไฟล์เสียงจากการสังเคราะห์ TTS',
          isSimulated: false,
        };
      }

      const audioBlock = rawAudioBlock.mimeType.toLowerCase().includes('l16')
        ? wrapL16PcmInWav(rawAudioBlock.data, rawAudioBlock.mimeType)
        : rawAudioBlock;

      return {
        ok: true,
        model,
        modelUsed,
        audioBase64: audioBlock.data,
        mimeType: audioBlock.mimeType,
        usage,
        isSimulated: false,
      };
    }

    primaryFailure = terminalFailure;
  } catch (error) {
    const classified = classifyInteractionError(error, model);
    if (classified.status !== 400 && classified.status !== 404) {
      return classified;
    }
    primaryFailure = classified;
  }

  // Fallback ไปยัง models.generateContent เมื่อ Interactions endpoint คืน 400/404
  if (typeof ai.models?.generateContent === 'function') {
    try {
      const response = await runWithAbortTimeout(timeoutMs, (signal) =>
        ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [{ text: spokenText }],
            },
          ],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voice },
              },
            },
            abortSignal: signal,
          },
        })
      );
      const audioBlock = extractAudioFromGenerateContentResponse(response);
      if (audioBlock) {
        return {
          ok: true,
          model,
          modelUsed: response.modelVersion || model,
          audioBase64: audioBlock.data,
          mimeType: audioBlock.mimeType,
          usage: buildGenerateContentUsageTelemetry(response.usageMetadata),
          isSimulated: false,
        };
      }
    } catch (fallbackError) {
      return classifyInteractionError(fallbackError, model);
    }
  }

  return primaryFailure;
}

/**
 * สร้างแทร็กดนตรีอ้างอิงคุณภาพสูงผ่าน Lyria 3.5 (`lyria-3.5` · $0.08/song)
 * คืนค่าเสียง MP3 (`output_audio`) พร้อมคำอธิบาย/เนื้อเพลง (`output_text`)
 */
export async function callGeminiMusicAudio(
  prompt: string,
  options?: { mimeType?: 'audio/mp3' | 'audio/wav'; timeoutMs?: number }
): Promise<GeminiMusicResult> {
  const apiKey = getGeminiApiKey();
  const model = GEMINI_MODEL_MUSIC;

  if (!apiKey) {
    return buildMissingKeyFailure(model);
  }

  const timeoutMs =
    typeof options?.timeoutMs === 'number' && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? Math.round(options.timeoutMs)
      : 50_000;

  const ai = new GoogleGenAI({ apiKey, apiVersion: 'v1beta' });
  let primaryFailure: GeminiFailureResult | null = null;

  try {
    const interaction = await runWithAbortTimeout(timeoutMs, (signal) =>
      ai.interactions.create(
        {
          model,
          input: prompt,
          ...(options?.mimeType
            ? {
                response_format: {
                  type: 'audio',
                  mime_type: options.mimeType,
                },
              }
            : {}),
          store: false,
        },
        {
          retries: { strategy: 'none' },
          timeout_ms: timeoutMs,
          fetch_options: { signal },
        }
      )
    );

    const terminalFailure = evaluateInteractionTerminalFailure(interaction, model);
    if (!terminalFailure) {
      const modelUsed = interaction.model || model;
      const usage = buildUsageTelemetry(interaction.usage);
      const audioBlock = extractAudioFromInteraction(
        interaction as Parameters<typeof extractAudioFromInteraction>[0]
      );
      const lyricsOrNotes = extractTextFromInteraction(
        interaction as Parameters<typeof extractTextFromInteraction>[0]
      );

      if (!audioBlock) {
        return {
          ok: false,
          model,
          modelUsed,
          reason: 'parse-error',
          failureReason: 'ไม่พบไฟล์เสียงอ้างอิงจากการตอบกลับของ Lyria 3.5',
          isSimulated: false,
        };
      }

      return {
        ok: true,
        model,
        modelUsed,
        audioBase64: audioBlock.data,
        mimeType: audioBlock.mimeType || 'audio/mp3',
        lyricsOrNotes,
        usage,
        isSimulated: false,
      };
    }

    primaryFailure = terminalFailure;
  } catch (error) {
    const classified = classifyInteractionError(error, model);
    if (classified.status !== 400 && classified.status !== 404) {
      return classified;
    }
    primaryFailure = classified;
  }

  if (typeof ai.models?.generateContent === 'function') {
    try {
      const response = await runWithAbortTimeout(timeoutMs, (signal) =>
        ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          config: {
            responseModalities: [Modality.AUDIO, Modality.TEXT],
            abortSignal: signal,
          },
        })
      );
      const audioBlock = extractAudioFromGenerateContentResponse(response);
      if (audioBlock) {
        const lyricsOrNotes = (response.text ?? '').trim();
        return {
          ok: true,
          model,
          modelUsed: response.modelVersion || model,
          audioBase64: audioBlock.data,
          mimeType: audioBlock.mimeType || options?.mimeType || 'audio/mp3',
          lyricsOrNotes,
          usage: buildGenerateContentUsageTelemetry(response.usageMetadata),
          isSimulated: false,
        };
      }
    } catch (fallbackError) {
      return classifyInteractionError(fallbackError, model);
    }
  }

  return primaryFailure;
}
