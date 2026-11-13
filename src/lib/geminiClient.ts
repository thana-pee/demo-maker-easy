/**
 * geminiClient.ts — Shared server-side client for Google Gemini API
 *
 * Defaults to `gemini-4-hydrogen` (override via `GEMINI_MODEL` env var).
 * Reads secret `GEMINI_API_KEY` from process.env and passes it via `x-goog-api-key` header only.
 */

export const DEFAULT_GEMINI_MODEL = 'gemini-4-hydrogen';

export function resolveGeminiModel(): string {
  const custom = process.env.GEMINI_MODEL?.trim();
  return custom && custom.length > 0 ? custom : DEFAULT_GEMINI_MODEL;
}

export function getGeminiApiKey(): string | undefined {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key && key.length > 0 ? key : undefined;
}

export type GeminiJsonCallResult<T> =
  | {
      ok: true;
      model: string;
      data: T;
    }
  | {
      ok: false;
      model: string;
      reason: 'missing-key' | 'http-error' | 'parse-error' | 'network-error';
      status?: number;
    };

function stripJsonCodeFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

/**
 * Calls Gemini `generateContent` expecting a JSON payload back.
 * Never exposes `GEMINI_API_KEY` in URLs or returned error structures.
 */
export async function callGeminiJson<T>(
  promptText: string,
  options?: { temperature?: number }
): Promise<GeminiJsonCallResult<T>> {
  const model = resolveGeminiModel();
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return { ok: false, model, reason: 'missing-key' };
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: options?.temperature ?? 0.7,
          },
        }),
      }
    );

    if (!res.ok) {
      return { ok: false, model, reason: 'http-error', status: res.status };
    }

    const payload = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = payload.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = stripJsonCodeFences(rawText);
    if (!cleaned) {
      return { ok: false, model, reason: 'parse-error' };
    }

    const parsed = JSON.parse(cleaned) as T;
    return { ok: true, model, data: parsed };
  } catch (err) {
    if (err instanceof SyntaxError) {
      return { ok: false, model, reason: 'parse-error' };
    }
    return { ok: false, model, reason: 'network-error' };
  }
}
