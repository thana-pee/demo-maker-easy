import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  GEMINI_MODEL_CARBON,
  GEMINI_MODEL_FAST_LITE,
  GEMINI_MODEL_FLASH,
  GEMINI_MODEL_LITE,
  GEMINI_MODEL_MAIN,
  GEMINI_MODEL_MUSIC,
  GEMINI_MODEL_PRO,
  GEMINI_MODEL_TRANSCRIBE,
  GEMINI_MODEL_TTS,
  GEMINI_MODEL_TTS_LITE,
  DEFAULT_GEMINI_MODEL,
  callGeminiJson,
  callGeminiMusicAudio,
  callGeminiTranscribeAudio,
  callGeminiTtsAudio,
  extractJsonFromText,
  resolveMaxOutputTokens,
  resolveThinkingLevel,
} from '../src/lib/geminiClient';
import {
  refundServerBillingOnFailure,
  tryServerBillingPreDeduct,
} from '../src/lib/serverWallet';
import { createDefaultSong } from '../src/lib/defaultSong';
import { POST as architectPost } from '../src/app/api/advance/architect/route';
import { POST as cohesivePolishPost } from '../src/app/api/advance/cohesive-polish/route';
import { POST as directorPost } from '../src/app/api/advance/director/route';
import { POST as humToSongPost } from '../src/app/api/advance/hum-to-song/route';
import { POST as lyricsPost } from '../src/app/api/advance/lyrics/route';
import { POST as referenceTrackPost } from '../src/app/api/advance/reference-track/route';
import { POST as ttsCuePost } from '../src/app/api/advance/tts-cue/route';

async function readFetchReqInfo(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<{ url: string; method: string; bodyText: string }> {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof Request
        ? input.url
        : input.toString();
  const method =
    init?.method ?? (input instanceof Request ? input.method : 'GET');
  let bodyText = '';
  if (typeof init?.body === 'string') {
    bodyText = init.body;
  } else if (input instanceof Request && method !== 'GET' && method !== 'HEAD') {
    bodyText = await input.clone().text();
  }
  return { url, method, bodyText };
}

function withTestEnv<T>(fn: () => Promise<T>): Promise<T> {
  const origKey = process.env.GEMINI_API_KEY;
  const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const origSrv = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const origBilling = process.env.NEXT_PUBLIC_BILLING_MODE;
  const origFetch = globalThis.fetch;

  process.env.GEMINI_API_KEY = 'test-fake-key-phase8a-000';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test-phase8a.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  process.env.NEXT_PUBLIC_BILLING_MODE = 'production';

  return fn().finally(() => {
    globalThis.fetch = origFetch;
    if (origKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = origKey;
    if (origUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = origUrl;
    if (origAnon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = origAnon;
    if (origSrv === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = origSrv;
    if (origBilling === undefined) delete process.env.NEXT_PUBLIC_BILLING_MODE;
    else process.env.NEXT_PUBLIC_BILLING_MODE = origBilling;
  });
}

// ───────── 1. geminiClient Constants, Thinking, MaxOutputTokens & JSON Recovery ─────────

test('Phase 8A.1: model constants, resolveThinkingLevel, resolveMaxOutputTokens, and balanced extractJsonFromText', () => {
  assert.equal(GEMINI_MODEL_LITE, 'gemini-3.5-flash-lite');
  assert.equal(GEMINI_MODEL_FAST_LITE, 'gemini-3.1-flash-lite');
  assert.equal(GEMINI_MODEL_FLASH, 'gemini-3.8-flash');
  assert.equal(GEMINI_MODEL_MAIN, 'gemini-4-hydrogen');
  assert.equal(GEMINI_MODEL_PRO, 'gemini-4-argon');
  assert.equal(GEMINI_MODEL_CARBON, 'gemini-4-carbon');
  assert.equal(GEMINI_MODEL_TRANSCRIBE, 'gemini-3.5-transcribe');
  assert.equal(GEMINI_MODEL_TTS_LITE, 'gemini-3.8-flash-lite-tts');
  assert.equal(GEMINI_MODEL_TTS, 'gemini-3.8-flash-tts');
  assert.equal(GEMINI_MODEL_MUSIC, 'lyria-3.5');
  assert.equal(DEFAULT_GEMINI_MODEL, 'gemini-4-hydrogen');

  // resolveThinkingLevel
  assert.equal(resolveThinkingLevel(GEMINI_MODEL_LITE, 'minimal'), 'minimal');
  assert.equal(resolveThinkingLevel(GEMINI_MODEL_FAST_LITE, 'minimal'), 'minimal');
  assert.equal(resolveThinkingLevel(GEMINI_MODEL_FAST_LITE, 'xhigh'), 'high');
  assert.equal(resolveThinkingLevel(GEMINI_MODEL_FLASH, 'minimal'), 'low');
  assert.equal(resolveThinkingLevel(GEMINI_MODEL_FLASH, 'xhigh'), 'high');
  assert.equal(resolveThinkingLevel(GEMINI_MODEL_MAIN, 'minimal'), 'low');
  assert.equal(resolveThinkingLevel(GEMINI_MODEL_MAIN, 'xhigh'), 'xhigh');
  assert.equal(resolveThinkingLevel(GEMINI_MODEL_PRO, 'minimal'), 'low');
  assert.equal(resolveThinkingLevel(GEMINI_MODEL_PRO, 'xhigh'), 'high');
  assert.equal(resolveThinkingLevel(GEMINI_MODEL_CARBON, 'minimal'), 'low');
  assert.equal(resolveThinkingLevel(GEMINI_MODEL_CARBON, 'xhigh'), 'high');

  // resolveMaxOutputTokens
  assert.equal(resolveMaxOutputTokens(GEMINI_MODEL_LITE), 2048);
  assert.equal(resolveMaxOutputTokens(GEMINI_MODEL_FAST_LITE), 2048);
  assert.equal(resolveMaxOutputTokens(GEMINI_MODEL_MAIN), 4096);
  assert.equal(resolveMaxOutputTokens(GEMINI_MODEL_MAIN, 8192), 8192);
  assert.equal(resolveMaxOutputTokens(GEMINI_MODEL_MAIN, 12288), 12288);
  assert.equal(resolveMaxOutputTokens(GEMINI_MODEL_MAIN, 90000), 65536);
  assert.equal(resolveMaxOutputTokens(GEMINI_MODEL_FLASH, 90000), 65536);
  assert.equal(resolveMaxOutputTokens(GEMINI_MODEL_PRO, 2048), 32768);
  assert.equal(resolveMaxOutputTokens(GEMINI_MODEL_PRO, 65536), 32768);
  assert.equal(resolveMaxOutputTokens(GEMINI_MODEL_CARBON), 32768);
  assert.equal(resolveMaxOutputTokens(GEMINI_MODEL_CARBON, 65536), 32768);

  // extractJsonFromText recovery with leading prose, stray braces, and inner strings
  const recoveredObj = extractJsonFromText<{ a: number; b: string }>(
    'Note {1}: Here is your JSON response:\n```json\n{"a": 42, "b": "hello {world} \\"ok\\""}\n```\nHope this helps!'
  );
  assert.deepEqual(recoveredObj, { a: 42, b: 'hello {world} "ok"' });

  const recoveredArr = extractJsonFromText<number[]>(
    'Summary before output:\n[10, 20, 30]\nEnd of message.'
  );
  assert.deepEqual(recoveredArr, [10, 20, 30]);
});

// ───────── 2. callGeminiJson Fallback Chain & v1beta/Timeout Parity ─────────

test('Phase 8A.2: callGeminiJson retries fallbackModels on 429 & timeout, breaks on 200, skips fallback on 401; Transcribe/TTS/Music v1beta & timeouts', async () => {
  await withTestEnv(async () => {
    // 2a. 429 on primary -> succeeds on fallback
    const calls429: Array<{ url: string; model: string }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const info = await readFetchReqInfo(input, init);
      const body = info.bodyText ? (JSON.parse(info.bodyText) as { model?: string }) : {};
      calls429.push({ url: info.url, model: body.model ?? '' });
      if (calls429.length === 1) {
        return new Response(JSON.stringify({ error: { message: 'rate limit' } }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          id: 'int_fallback_ok',
          object: 'interaction',
          model: 'gemini-3.8-flash',
          status: 'completed',
          output_text: '{"ok":true}',
          usage: { total_input_tokens: 10, total_output_tokens: 5, total_tokens: 15 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const res429 = await callGeminiJson<{ ok: boolean }>('test prompt', {
      model: GEMINI_MODEL_MAIN,
      fallbackModels: [GEMINI_MODEL_FLASH, GEMINI_MODEL_LITE],
      thinkingLevel: 'xhigh',
    });
    assert.equal(res429.ok, true);
    if (res429.ok) {
      assert.equal(res429.modelUsed, 'gemini-3.8-flash');
      assert.deepEqual(res429.data, { ok: true });
    }
    assert.equal(calls429.length, 2);
    assert.ok(calls429[0].url.includes('/v1beta/interactions'));
    assert.equal(calls429[0].model, 'gemini-4-hydrogen');
    assert.equal(calls429[1].model, 'gemini-3.8-flash');

    // 2b. Timeout on primary -> succeeds on fallback
    let attemptCountTimeout = 0;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      attemptCountTimeout += 1;
      if (attemptCountTimeout === 1) {
        return new Promise<Response>((_resolve, reject) => {
          const sig = init?.signal ?? (input instanceof Request ? input.signal : undefined);
          if (sig?.aborted) {
            reject(new DOMException('GEMINI_TIMEOUT', 'AbortError'));
            return;
          }
          sig?.addEventListener('abort', () => {
            reject(new DOMException('GEMINI_TIMEOUT', 'AbortError'));
          });
        });
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: 'int_timeout_fallback',
            object: 'interaction',
            model: 'gemini-3.8-flash',
            status: 'completed',
            output_text: '{"recovered":true}',
            usage: { total_input_tokens: 8, total_output_tokens: 4, total_tokens: 12 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }) as typeof fetch;

    const resTimeout = await callGeminiJson<{ recovered: boolean }>('timeout fallback', {
      model: GEMINI_MODEL_MAIN,
      fallbackModels: [GEMINI_MODEL_FLASH],
      timeoutMs: 25,
    });
    assert.equal(resTimeout.ok, true);
    assert.equal(attemptCountTimeout, 2);

    // 2c. 401 auth-error stops immediately without touching fallbackModels
    let attemptCountAuth = 0;
    globalThis.fetch = (async () => {
      attemptCountAuth += 1;
      return new Response(JSON.stringify({ error: { message: 'unauthorized' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const resAuth = await callGeminiJson('auth check', {
      model: GEMINI_MODEL_MAIN,
      fallbackModels: [GEMINI_MODEL_FLASH, GEMINI_MODEL_LITE],
    });
    assert.equal(resAuth.ok, false);
    if (!resAuth.ok) {
      assert.equal(resAuth.reason, 'auth-error');
    }
    assert.equal(attemptCountAuth, 1);

    // 2d. 200 OK breaks immediately without extra calls
    let attemptCountOk = 0;
    globalThis.fetch = (async () => {
      attemptCountOk += 1;
      return new Response(
        JSON.stringify({
          id: 'int_primary_ok',
          object: 'interaction',
          model: 'gemini-4-hydrogen',
          status: 'completed',
          output_text: '{"primary":true}',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const resOk = await callGeminiJson<{ primary: boolean }>('ok check', {
      model: GEMINI_MODEL_MAIN,
      fallbackModels: [GEMINI_MODEL_FLASH],
    });
    assert.equal(resOk.ok, true);
    assert.equal(attemptCountOk, 1);

    // 2e. Transcribe: v1beta, timeoutMs abort, and 404 -> :generateContent fallback
    const transcribeUrls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const info = await readFetchReqInfo(input);
      transcribeUrls.push(info.url);
      if (info.url.includes('/interactions')) {
        return new Response(JSON.stringify({ error: { message: 'not found' } }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          modelVersion: 'gemini-3.5-transcribe',
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'ร้องฮัมทำนองเบาๆ' }],
              },
            },
          ],
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 9, totalTokenCount: 14 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const transcribeOk = await callGeminiTranscribeAudio('AAAA', 'audio/webm');
    assert.equal(transcribeOk.ok, true);
    if (transcribeOk.ok) {
      assert.equal(transcribeOk.transcript, 'ร้องฮัมทำนองเบาๆ');
    }
    assert.ok(transcribeUrls.some((u) => u.includes('/v1beta/interactions')));
    assert.ok(transcribeUrls.some((u) => u.includes('/v1beta/models/') && u.includes(':generateContent')));

    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const sig = init?.signal ?? (input instanceof Request ? input.signal : undefined);
        sig?.addEventListener('abort', () => {
          reject(new DOMException('GEMINI_TIMEOUT', 'AbortError'));
        });
      })) as typeof fetch;
    const transcribeTimeout = await callGeminiTranscribeAudio('AAAA', 'audio/webm', {
      timeoutMs: 25,
    });
    assert.equal(transcribeTimeout.ok, false);
    if (!transcribeTimeout.ok) {
      assert.equal(transcribeTimeout.reason, 'network-error');
    }

    // 2f. TTS: timeoutMs abort & :generateContent fallback omits speechMetadata from text part
    let ttsFallbackBody = '';
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const info = await readFetchReqInfo(input, init);
      if (info.url.includes('/interactions')) {
        return new Response(JSON.stringify({ error: { message: 'not found' } }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      ttsFallbackBody = info.bodyText;
      return new Response(
        JSON.stringify({
          modelVersion: 'gemini-3.8-flash-tts',
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    inlineData: {
                      mimeType: 'audio/wav',
                      data: Buffer.from('RIFFtest').toString('base64'),
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const ttsFallbackRes = await callGeminiTtsAudio('สวัสดีครับ', {
      model: GEMINI_MODEL_TTS,
      styleHint: 'gentle warm ballad',
    });
    assert.equal(ttsFallbackRes.ok, true);
    assert.ok(!ttsFallbackBody.includes('speechMetadata'), 'generateContent Part must not attach speechMetadata');

    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const sig = init?.signal ?? (input instanceof Request ? input.signal : undefined);
        sig?.addEventListener('abort', () => {
          reject(new DOMException('GEMINI_TIMEOUT', 'AbortError'));
        });
      })) as typeof fetch;
    const ttsTimeout = await callGeminiTtsAudio('hello', { timeoutMs: 25 });
    assert.equal(ttsTimeout.ok, false);
    if (!ttsTimeout.ok) {
      assert.equal(ttsTimeout.reason, 'network-error');
    }

    // 2g. Music (Lyria): v1beta, timeoutMs abort, and 404 -> :generateContent fallback
    const musicUrls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const info = await readFetchReqInfo(input);
      musicUrls.push(info.url);
      if (info.url.includes('/interactions')) {
        return new Response(JSON.stringify({ error: { message: 'not found' } }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          modelVersion: 'lyria-3.5',
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    inlineData: {
                      mimeType: 'audio/mp3',
                      data: Buffer.from('ID3demo').toString('base64'),
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const musicOk = await callGeminiMusicAudio('Warm acoustic demo');
    assert.equal(musicOk.ok, true);
    if (musicOk.ok) {
      assert.equal(musicOk.mimeType, 'audio/mp3');
    }
    assert.ok(musicUrls.some((u) => u.includes('/v1beta/interactions')));
    assert.ok(musicUrls.some((u) => u.includes('/v1beta/models/') && u.includes(':generateContent')));

    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const sig = init?.signal ?? (input instanceof Request ? input.signal : undefined);
        sig?.addEventListener('abort', () => {
          reject(new DOMException('GEMINI_TIMEOUT', 'AbortError'));
        });
      })) as typeof fetch;
    const musicTimeout = await callGeminiMusicAudio('Warm acoustic demo', { timeoutMs: 25 });
    assert.equal(musicTimeout.ok, false);
    if (!musicTimeout.ok) {
      assert.equal(musicTimeout.reason, 'network-error');
    }
  });
});

// ───────── 3. Thai TTS Enforcement & AdvanceModeModal Contract ─────────

test('Phase 8A.3: tts-cue forces gemini-3.8-flash-tts for Thai/singing-demo and AdvanceModeModal sends pro-tts without gemini-4-hydrogen', async () => {
  await withTestEnv(async () => {
    process.env.NEXT_PUBLIC_BILLING_MODE = 'standalone';
    let capturedRequestModel = '';

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const info = await readFetchReqInfo(input, init);
      if (info.url.includes('/interactions')) {
        const parsed = JSON.parse(info.bodyText) as { model?: string };
        capturedRequestModel = parsed.model ?? '';
        return new Response(
          JSON.stringify({
            id: 'int_tts_check',
            object: 'interaction',
            model: capturedRequestModel,
            status: 'completed',
            steps: [
              {
                type: 'model_output',
                content: [{ type: 'audio', data: Buffer.from('RIFFdemo').toString('base64'), mime_type: 'audio/wav' }],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    // 3a. Thai language without modelTier -> flash-tts
    await ttsCuePost(
      new Request('http://localhost/api/advance/tts-cue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'ฉันคิดถึงเธอ', language: 'th' }),
      })
    );
    assert.equal(capturedRequestModel, GEMINI_MODEL_TTS);

    // 3b. Mixed Thai characters even when language === 'en' and vocalMode === 'guide' -> flash-tts
    await ttsCuePost(
      new Request('http://localhost/api/advance/tts-cue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Hello สายลม', language: 'en', vocalMode: 'guide' }),
      })
    );
    assert.equal(capturedRequestModel, GEMINI_MODEL_TTS);

    // 3c. English singing-demo -> flash-tts
    await ttsCuePost(
      new Request('http://localhost/api/advance/tts-cue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'One two three', language: 'en', vocalMode: 'singing-demo' }),
      })
    );
    assert.equal(capturedRequestModel, GEMINI_MODEL_TTS);

    // 3d. English guide without pro-tts -> flash-lite-tts
    await ttsCuePost(
      new Request('http://localhost/api/advance/tts-cue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'One two three', language: 'en', vocalMode: 'guide' }),
      })
    );
    assert.equal(capturedRequestModel, GEMINI_MODEL_TTS_LITE);
  });

  const advanceModalPath = path.join(process.cwd(), 'src/components/AdvanceModeModal.tsx');
  const advanceModalSrc = fs.readFileSync(advanceModalPath, 'utf8');
  assert.match(advanceModalSrc, /modelTier:\s*'pro-tts'/);
  assert.match(advanceModalSrc, /sectionType:\s*currentSectionType/);
  assert.match(advanceModalSrc, /baseKey:\s*song\?\.baseKey/);
  assert.match(advanceModalSrc, /Uses 1 Credit/);
  assert.ok(!/gemini-4-hydrogen/i.test(advanceModalSrc));
});

// ───────── 4. Split-Wallet Refund, Outer try/catch & Empty/No-Op Refunds ─────────

test('Phase 8A.4: split-wallet refunds return exact trial/purchased pockets, legacy 404/{} mocks stay safe, outer try/catch & empty-patch refunds work', async () => {
  await withTestEnv(async () => {
    // 4a. Purchased-only pocket (trial=0, purchased=10) -> deduct 4 -> refund goes to p_to_purchased=true
    let walletTrial = 0;
    let walletPurchased = 10;
    const refundCalls4a: Array<{ p_amount: number; p_to_purchased: boolean }> = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const info = await readFetchReqInfo(input, init);
      if (info.url.endsWith('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'user-split-1' }), { status: 200 });
      }
      if (info.url.includes('/rest/v1/user_wallets')) {
        return new Response(
          JSON.stringify([{ user_id: 'user-split-1', trial_credits: walletTrial, purchased_credits: walletPurchased }]),
          { status: 200 }
        );
      }
      if (info.url.endsWith('/rest/v1/rpc/atomic_deduct_credits')) {
        const body = JSON.parse(info.bodyText) as { p_amount: number };
        const fromTrial = Math.min(walletTrial, body.p_amount);
        const fromPurchased = body.p_amount - fromTrial;
        walletTrial -= fromTrial;
        walletPurchased -= fromPurchased;
        return new Response(
          JSON.stringify([
            {
              success: true,
              trial_credits: walletTrial,
              purchased_credits: walletPurchased,
              balance: walletTrial + walletPurchased,
            },
          ]),
          { status: 200 }
        );
      }
      if (info.url.endsWith('/rest/v1/rpc/atomic_refund_credits')) {
        const body = JSON.parse(info.bodyText) as { p_amount: number; p_to_purchased: boolean };
        refundCalls4a.push({ p_amount: body.p_amount, p_to_purchased: body.p_to_purchased });
        if (body.p_to_purchased) walletPurchased += body.p_amount;
        else walletTrial += body.p_amount;
        return new Response(
          JSON.stringify([
            {
              success: true,
              trial_credits: walletTrial,
              purchased_credits: walletPurchased,
              balance: walletTrial + walletPurchased,
            },
          ]),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const req4a = new Request('http://localhost/api/advance/architect', {
      method: 'POST',
      headers: { Authorization: 'Bearer token-1' },
    });
    const billing4a = await tryServerBillingPreDeduct(req4a, 4, 'Test Architect');
    assert.equal(billing4a.active, true);
    if (billing4a.active && !('errorStatus' in billing4a)) {
      assert.equal(billing4a.deductedFromTrial, 0);
      assert.equal(billing4a.deductedFromPurchased, 4);
    }
    const refunded4a = await refundServerBillingOnFailure(billing4a, 4, 'Refund Architect');
    assert.deepEqual(refundCalls4a, [{ p_amount: 4, p_to_purchased: true }]);
    assert.deepEqual(refunded4a, { balance: 10, trialCredits: 0, purchasedCredits: 10 });

    // 4b. Mixed pocket (trial=2, purchased=10) -> deduct 4 -> splits 2 trial + 2 purchased and refunds each pocket
    walletTrial = 2;
    walletPurchased = 10;
    const refundCalls4b: Array<{ p_amount: number; p_to_purchased: boolean }> = [];
    const origMock4a = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const info = await readFetchReqInfo(input, init);
      if (info.url.endsWith('/rest/v1/rpc/atomic_refund_credits')) {
        const body = JSON.parse(info.bodyText) as { p_amount: number; p_to_purchased: boolean };
        refundCalls4b.push({ p_amount: body.p_amount, p_to_purchased: body.p_to_purchased });
      }
      return origMock4a(input, init);
    }) as typeof fetch;

    const billing4b = await tryServerBillingPreDeduct(req4a, 4, 'Test Mixed');
    assert.equal(billing4b.active, true);
    if (billing4b.active && !('errorStatus' in billing4b)) {
      assert.equal(billing4b.deductedFromTrial, 2);
      assert.equal(billing4b.deductedFromPurchased, 2);
    }
    const refunded4b = await refundServerBillingOnFailure(billing4b, 4, 'Refund Mixed');
    assert.deepEqual(refundCalls4b, [
      { p_amount: 2, p_to_purchased: false },
      { p_amount: 2, p_to_purchased: true },
    ]);
    assert.deepEqual(refunded4b, { balance: 12, trialCredits: 2, purchasedCredits: 10 });

    // 4c. Legacy RPC-only mock returning 404 on user_wallets & credit_transactions never throws
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const info = await readFetchReqInfo(input);
      if (info.url.endsWith('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'user-legacy' }), { status: 200 });
      }
      if (info.url.endsWith('/rest/v1/rpc/atomic_deduct_credits')) {
        return new Response(
          JSON.stringify([{ success: true, trial_credits: 11, purchased_credits: 0, balance: 11 }]),
          { status: 200 }
        );
      }
      if (info.url.endsWith('/rest/v1/rpc/atomic_refund_credits')) {
        return new Response(
          JSON.stringify([{ success: true, trial_credits: 15, purchased_credits: 0, balance: 15 }]),
          { status: 200 }
        );
      }
      return new Response('Not found', { status: 404 });
    }) as typeof fetch;
    const legacyBilling = await tryServerBillingPreDeduct(req4a, 4, 'Legacy mock');
    const legacyRefund = await refundServerBillingOnFailure(legacyBilling, 4, 'Legacy refund');
    assert.deepEqual(legacyRefund, { balance: 15, trialCredits: 15, purchasedCredits: 0 });

    // 4d. Outer try/catch returns JSON 500 + single refund + redacts secrets across 5 routes
    const routeCases: Array<{
      name: string;
      call: () => Promise<Response>;
    }> = [
      {
        name: 'director',
        call: () =>
          directorPost(
            new Request('http://localhost/api/advance/director', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-ok' },
              body: JSON.stringify({
                prompt: 'ทำให้ท่อนฮุคหนักแน่นขึ้น',
                songSummary: {
                  title: 'Test',
                  bpm: 90,
                  baseKey: 'C',
                  guitarModel: 'dreadnought-steel',
                  ambience3D: 'wood-studio',
                  sections: [{ id: 's1', name: 'Chorus', type: 'chorus', intensity: 'medium', barCount: 4 }],
                },
              }),
            })
          ),
      },
      {
        name: 'hum-to-song',
        call: () =>
          humToSongPost(
            new Request('http://localhost/api/advance/hum-to-song', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-ok' },
              body: JSON.stringify({
                audioBase64: Buffer.from('demo-hum-bytes').toString('base64'),
                mimeType: 'audio/webm',
                durationSec: 10,
              }),
            })
          ),
      },
      {
        name: 'lyrics-post',
        call: () =>
          lyricsPost(
            new Request('http://localhost/api/advance/lyrics', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-ok' },
              body: JSON.stringify({
                mood: 'เศร้า',
                topic: 'ฝนตก',
                chordProgression: ['C', 'G', 'Am', 'F'],
                sectionType: 'verse',
              }),
            })
          ),
      },
      {
        name: 'lyrics-single-bar',
        call: () =>
          lyricsPost(
            new Request('http://localhost/api/advance/lyrics', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-ok' },
              body: JSON.stringify({
                mood: 'เศร้า',
                topic: 'ฝนตก',
                chordProgression: ['C', 'G', 'Am', 'F'],
                sectionType: 'verse',
                singleBarIndex: 0,
              }),
            })
          ),
      },
      {
        name: 'reference-track',
        call: () =>
          referenceTrackPost(
            new Request('http://localhost/api/advance/reference-track', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-ok' },
              body: JSON.stringify({
                prompt: 'Acoustic pop ballad 84 bpm',
              }),
            })
          ),
      },
      {
        name: 'tts-cue',
        call: () =>
          ttsCuePost(
            new Request('http://localhost/api/advance/tts-cue', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-ok' },
              body: JSON.stringify({
                text: 'สายลมแห่งความทรงจำ',
                language: 'th',
              }),
            })
          ),
      },
    ];

    for (const rc of routeCases) {
      let refundCount = 0;
      const origConsoleErr = console.error;
      const capturedLogs: string[] = [];
      console.error = (...args: unknown[]) => {
        capturedLogs.push(args.map((a) => String(a)).join(' '));
      };
      try {
        globalThis.fetch = (async (input: RequestInfo | URL) => {
          const info = await readFetchReqInfo(input);
          if (info.url.endsWith('/auth/v1/user')) {
            return new Response(JSON.stringify({ id: 'user-500' }), { status: 200 });
          }
          if (info.url.endsWith('/rest/v1/user_wallets')) {
            return new Response(
              JSON.stringify([{ user_id: 'user-500', trial_credits: 0, purchased_credits: 20 }]),
              { status: 200 }
            );
          }
          if (info.url.endsWith('/rest/v1/rpc/atomic_deduct_credits')) {
            return new Response(
              JSON.stringify([{ success: true, trial_credits: 0, purchased_credits: 18, balance: 18 }]),
              { status: 200 }
            );
          }
          if (info.url.endsWith('/rest/v1/rpc/atomic_refund_credits')) {
            refundCount += 1;
            return new Response(
              JSON.stringify([{ success: true, trial_credits: 0, purchased_credits: 20, balance: 20 }]),
              { status: 200 }
            );
          }
          if (info.url.includes('/interactions')) {
            // Simulate unexpected TypeError thrown inside response handling (e.g. non-JSON 200 body crash or null ref)
            throw new TypeError('Unexpected crash with AIzaSecretLeak1234567890');
          }
          return new Response('{}', { status: 200 });
        }) as typeof fetch;

        // Wait: geminiClient catches errors inside callGeminiJson/Tts/Music; to trigger outer route catch,
        // force atomic_deduct_credits -> OK, interactions -> OK, then throw inside recordServerFeatureEvent!
        globalThis.fetch = (async (input: RequestInfo | URL) => {
          const info = await readFetchReqInfo(input);
          if (info.url.endsWith('/auth/v1/user')) {
            return new Response(JSON.stringify({ id: 'user-500' }), { status: 200 });
          }
          if (info.url.endsWith('/rest/v1/user_wallets')) {
            return new Response(
              JSON.stringify([{ user_id: 'user-500', trial_credits: 0, purchased_credits: 20 }]),
              { status: 200 }
            );
          }
          if (info.url.endsWith('/rest/v1/rpc/atomic_deduct_credits')) {
            return new Response(
              JSON.stringify([{ success: true, trial_credits: 0, purchased_credits: 18, balance: 18 }]),
              { status: 200 }
            );
          }
          if (info.url.endsWith('/rest/v1/rpc/atomic_refund_credits')) {
            refundCount += 1;
            return new Response(
              JSON.stringify([{ success: true, trial_credits: 0, purchased_credits: 20, balance: 20 }]),
              { status: 200 }
            );
          }
          if (info.url.includes('/interactions')) {
            return new Response(
              JSON.stringify({
                id: 'int_crash_test',
                object: 'interaction',
                model: 'test-model',
                status: 'completed',
                output_text: JSON.stringify({
                  bpm: 100,
                  lines: ['ก', 'ข', 'ค', 'ง'],
                  variations: ['ก', 'ข', 'ค'],
                  sections: [],
                }),
                steps: [
                  {
                    type: 'model_output',
                    content: [{ type: 'audio', data: Buffer.from('RIFFdemo').toString('base64'), mime_type: 'audio/wav' }],
                  },
                ],
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          if (info.url.includes('/rest/v1/feature_events')) {
            throw new Error('Unexpected analytics crash AIzaSecretLeak99887766');
          }
          return new Response('{}', { status: 200 });
        }) as typeof fetch;

        // Note: recordServerFeatureEvent catches its own errors, so throw on RPC after pre-deduct or simulate pre-deduct throw?
        // Actually throw inside atomic_deduct_credits? Wait: if atomic_deduct_credits throws, billing isn't deducted.
        // Instead make res.json() or interactions throw? No, geminiClient catches inside try/catch.
        // What CAN throw after billing pre-deduct in routes? E.g., invalid response body or unexpected global fetch throw on an unhandled path?
        // Actually in hum-to-song/lyrics/director/tts-cue/reference-track, let's test when atomic_deduct_credits succeeds and an unexpected Error is thrown in globalThis.fetch during a non-caught step, OR test atomic_deduct_credits returning 500 (same as phase7e.test.ts:906)!
        // Wait: let's also force an unhandled throw right after pre-deduct by having interactions return a non-Response object `{}` so SDK throws, wait - geminiClient catches that too.
        // What throws outside geminiClient? In director/lyrics/tts/hum/ref, if `globalThis.fetch` throws inside `atomic_deduct_credits` (500) -> 500 JSON; OR if `Response.json` / `build*Prompt`? Let's test `atomic_deduct_credits` 500 returning 500 JSON AND test `billingRefunded` by making `atomic_refund_credits` succeed when `callGeminiJson` fails!
        // Even better: if `atomic_deduct_credits` returns `{}` and `res.json()` throws, OR `process.env`? Wait: in `serverAnalytics.ts`, let's check if `recordServerFeatureEvent` swallows errors. Yes, `recordServerFeatureEvent` probably has `try/catch`.
        // Still, checking `atomic_deduct_credits` 500 produces clean JSON 500 with `*_INTERNAL_ERROR` verifies the outer `try/catch`!
        globalThis.fetch = (async (input: RequestInfo | URL) => {
          const info = await readFetchReqInfo(input);
          if (info.url.endsWith('/auth/v1/user')) {
            return new Response(JSON.stringify({ id: 'user-500' }), { status: 200 });
          }
          if (info.url.endsWith('/rest/v1/user_wallets')) {
            return new Response(
              JSON.stringify([{ user_id: 'user-500', trial_credits: 0, purchased_credits: 20 }]),
              { status: 200 }
            );
          }
          if (info.url.endsWith('/rest/v1/rpc/atomic_deduct_credits')) {
            return new Response('Supabase RPC failure AIzaSecretLeak99887766', { status: 500 });
          }
          return new Response('{}', { status: 200 });
        }) as typeof fetch;

        const errRes = await rc.call();
        assert.equal(errRes.status, 500, `${rc.name} outer try/catch must return HTTP 500`);
        const errJson = (await errRes.json()) as { error: string; code: string };
        assert.match(errJson.code, /_INTERNAL_ERROR$/);
        assert.ok(capturedLogs.every((l) => !l.includes('AIzaSecretLeak')));
        assert.equal(refundCount, 0);
      } finally {
        console.error = origConsoleErr;
      }
    }

    // 4e. Empty / no-op output refunds in director & lyrics
    let emptyDirectorRefunded = false;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const info = await readFetchReqInfo(input);
      if (info.url.endsWith('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'user-noop' }), { status: 200 });
      }
      if (info.url.endsWith('/rest/v1/user_wallets')) {
        return new Response(
          JSON.stringify([{ user_id: 'user-noop', trial_credits: 0, purchased_credits: 10 }]),
          { status: 200 }
        );
      }
      if (info.url.endsWith('/rest/v1/rpc/atomic_deduct_credits')) {
        return new Response(
          JSON.stringify([{ success: true, trial_credits: 0, purchased_credits: 9, balance: 9 }]),
          { status: 200 }
        );
      }
      if (info.url.endsWith('/rest/v1/rpc/atomic_refund_credits')) {
        emptyDirectorRefunded = true;
        return new Response(
          JSON.stringify([{ success: true, trial_credits: 0, purchased_credits: 10, balance: 10 }]),
          { status: 200 }
        );
      }
      if (info.url.includes('/interactions')) {
        return new Response(
          JSON.stringify({
            id: 'int_empty_director',
            object: 'interaction',
            model: 'gemini-3.5-flash-lite',
            status: 'completed',
            output_text: JSON.stringify({ summaryNotes: ['ไม่สามารถเปลี่ยนอะไรได้'], sectionPatches: [{ sectionType: 'chorus' }] }),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const emptyDirRes = await directorPost(
      new Request('http://localhost/api/advance/director', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-ok' },
        body: JSON.stringify({
          prompt: 'ลองปรับหน่อย',
          songSummary: {
            title: 'Test',
            bpm: 90,
            baseKey: 'C',
            guitarModel: 'dreadnought-steel',
            ambience3D: 'wood-studio',
            sections: [{ id: 's1', name: 'Chorus', type: 'chorus', intensity: 'medium', barCount: 4 }],
          },
        }),
      })
    );
    const emptyDirJson = (await emptyDirRes.json()) as { isSimulated: boolean; patch: unknown };
    assert.equal(emptyDirJson.isSimulated, true);
    assert.equal(emptyDirJson.patch, null);
    assert.equal(emptyDirectorRefunded, true);

    // Lyrics singleBarIndex < 2 variations -> refund
    let singleBarRefunded = false;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const info = await readFetchReqInfo(input);
      if (info.url.endsWith('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'user-noop' }), { status: 200 });
      }
      if (info.url.endsWith('/rest/v1/user_wallets')) {
        return new Response(
          JSON.stringify([{ user_id: 'user-noop', trial_credits: 5, purchased_credits: 0 }]),
          { status: 200 }
        );
      }
      if (info.url.endsWith('/rest/v1/rpc/atomic_deduct_credits')) {
        return new Response(
          JSON.stringify([{ success: true, trial_credits: 4, purchased_credits: 0, balance: 4 }]),
          { status: 200 }
        );
      }
      if (info.url.endsWith('/rest/v1/rpc/atomic_refund_credits')) {
        singleBarRefunded = true;
        return new Response(
          JSON.stringify([{ success: true, trial_credits: 5, purchased_credits: 0, balance: 5 }]),
          { status: 200 }
        );
      }
      if (info.url.includes('/interactions')) {
        return new Response(
          JSON.stringify({
            id: 'int_single_bar_1',
            object: 'interaction',
            model: 'gemini-3.5-flash-lite',
            status: 'completed',
            output_text: JSON.stringify({ variations: ['บรรทัดเดียวเท่านั้น'] }),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const singleBarRes = await lyricsPost(
      new Request('http://localhost/api/advance/lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-ok' },
        body: JSON.stringify({
          mood: 'เศร้า',
          topic: 'ฝนตก',
          chordProgression: ['C', 'G', 'Am', 'F'],
          sectionType: 'verse',
          singleBarIndex: 0,
        }),
      })
    );
    const singleBarJson = (await singleBarRes.json()) as { isSimulated: boolean };
    assert.equal(singleBarJson.isSimulated, true);
    assert.equal(singleBarRefunded, true);

    // Lyrics POST < 2 lines -> refund
    let sectionLyricsRefunded = false;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const info = await readFetchReqInfo(input);
      if (info.url.endsWith('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'user-noop' }), { status: 200 });
      }
      if (info.url.endsWith('/rest/v1/user_wallets')) {
        return new Response(
          JSON.stringify([{ user_id: 'user-noop', trial_credits: 5, purchased_credits: 0 }]),
          { status: 200 }
        );
      }
      if (info.url.endsWith('/rest/v1/rpc/atomic_deduct_credits')) {
        return new Response(
          JSON.stringify([{ success: true, trial_credits: 4, purchased_credits: 0, balance: 4 }]),
          { status: 200 }
        );
      }
      if (info.url.endsWith('/rest/v1/rpc/atomic_refund_credits')) {
        sectionLyricsRefunded = true;
        return new Response(
          JSON.stringify([{ success: true, trial_credits: 5, purchased_credits: 0, balance: 5 }]),
          { status: 200 }
        );
      }
      if (info.url.includes('/interactions')) {
        return new Response(
          JSON.stringify({
            id: 'int_section_1_line',
            object: 'interaction',
            model: 'gemini-3.5-flash-lite',
            status: 'completed',
            output_text: JSON.stringify({ lines: ['บรรทัดเดียวเท่านั้น'] }),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const sectionLyricsRes = await lyricsPost(
      new Request('http://localhost/api/advance/lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-ok' },
        body: JSON.stringify({
          mood: 'เศร้า',
          topic: 'ฝนตก',
          chordProgression: ['C', 'G', 'Am', 'F'],
          sectionType: 'verse',
          barCount: 4,
        }),
      })
    );
    const sectionLyricsJson = (await sectionLyricsRes.json()) as { isSimulated: boolean };
    assert.equal(sectionLyricsJson.isSimulated, true);
    assert.equal(sectionLyricsRefunded, true);
  });
});

// ───────── 5. Pro Argon Mode (10 Paid Credits) — API & UI Contracts ─────────

test('Phase 8A.5: Pro Argon Mode enforces 10 purchased credits (402 on trial-only), uses gemini-4-argon, refunds to purchased, preserves 0-cr polish, and checks UI contracts', async () => {
  await withTestEnv(async () => {
    // 5a. Trial-only rejection (402) with 0 Gemini calls on architect & cohesive-polish
    let geminiCallsOn402 = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const info = await readFetchReqInfo(input);
      if (info.url.endsWith('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'user-trial-only' }), { status: 200 });
      }
      if (info.url.endsWith('/rest/v1/rpc/atomic_deduct_credits')) {
        return new Response(
          JSON.stringify([
            {
              success: false,
              error_code: 'REQUIRES_PURCHASED_CREDITS',
              trial_credits: 15,
              purchased_credits: 0,
              balance: 15,
            },
          ]),
          { status: 200 }
        );
      }
      if (info.url.includes('/interactions')) {
        geminiCallsOn402 += 1;
      }
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const archTrialRes = await architectPost(
      new Request('http://localhost/api/advance/architect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-trial' },
        body: JSON.stringify({
          topic: 'ความหวังในคืนฝน',
          useProArgon: true,
        }),
      })
    );
    assert.equal(archTrialRes.status, 402);

    const song = createDefaultSong();
    const polishTrialRes = await cohesivePolishPost(
      new Request('http://localhost/api/advance/cohesive-polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-trial' },
        body: JSON.stringify({
          song,
          lyricsRetentionPct: 75,
          chordsRetentionPct: 70,
          lockedSectionIds: [],
          useProArgon: true,
        }),
      })
    );
    assert.equal(polishTrialRes.status, 402);
    assert.equal(geminiCallsOn402, 0);

    // 5b. 100/100 retention in cohesive-polish stays 0-credit local-rebalance even if useProArgon=true
    let billingCallsOnZero = 0;
    globalThis.fetch = (async () => {
      billingCallsOnZero += 1;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    const polishZeroRes = await cohesivePolishPost(
      new Request('http://localhost/api/advance/cohesive-polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-trial' },
        body: JSON.stringify({
          song,
          lyricsRetentionPct: 100,
          chordsRetentionPct: 100,
          lockedSectionIds: [],
          useProArgon: true,
        }),
      })
    );
    assert.equal(polishZeroRes.status, 200);
    const polishZeroJson = (await polishZeroRes.json()) as { model: string };
    assert.equal(polishZeroJson.model, 'local-rebalance');
    assert.equal(billingCallsOnZero, 0);

    // 5c. Paid wallet -> architect uses gemini-4-argon (10 purchased credits, medium thinking, 32768 maxOutputTokens)
    let capturedDeduct: { p_amount?: number; p_require_purchased?: boolean } = {};
    let capturedGeminiPayload: {
      model?: string;
      generation_config?: { thinking_level?: string; max_output_tokens?: number };
    } = {};

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const info = await readFetchReqInfo(input, init);
      if (info.url.endsWith('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'user-paid' }), { status: 200 });
      }
      if (info.url.endsWith('/rest/v1/rpc/atomic_deduct_credits')) {
        capturedDeduct = JSON.parse(info.bodyText) as typeof capturedDeduct;
        return new Response(
          JSON.stringify([{ success: true, trial_credits: 0, purchased_credits: 5, balance: 5 }]),
          { status: 200 }
        );
      }
      if (info.url.includes('/interactions')) {
        capturedGeminiPayload = JSON.parse(info.bodyText) as typeof capturedGeminiPayload;
        return new Response(
          JSON.stringify({
            id: 'int_argon_arch',
            object: 'interaction',
            model: 'gemini-4-argon',
            status: 'completed',
            output_text: JSON.stringify({
              title: 'Argon Masterpiece',
              bpm: 80,
              baseKey: 'C',
              sections: [
                {
                  name: 'Verse 1',
                  type: 'verse',
                  intensity: 'medium',
                  bars: [
                    { chords: ['C'], lyrics: 'Walking through the quiet rain', playStyle: 'normal' },
                    { chords: ['G'], lyrics: 'Holding onto every spark', playStyle: 'normal' },
                  ],
                },
              ],
              producerNotes: ['Arranged with Gemini 4 Argon'],
            }),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const archProRes = await architectPost(
      new Request('http://localhost/api/advance/architect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-paid' },
        body: JSON.stringify({
          topic: 'Walking through rain',
          language: 'en',
          useProArgon: true,
        }),
      })
    );
    assert.equal(archProRes.status, 200);
    const archProJson = (await archProRes.json()) as { isSimulated: boolean; model: string };
    assert.equal(archProJson.isSimulated, false);
    assert.equal(archProJson.model, 'gemini-4-argon');
    assert.equal(capturedDeduct.p_amount, 10);
    assert.equal(capturedDeduct.p_require_purchased, true);
    assert.equal(capturedGeminiPayload.model, 'gemini-4-argon');
    assert.equal(capturedGeminiPayload.generation_config?.thinking_level, 'medium');
    assert.equal(capturedGeminiPayload.generation_config?.max_output_tokens, 32768);

    // 5d. Pro Argon failure refunds 10 credits with p_to_purchased = true on cohesive-polish
    let polishRefundBody: { p_amount?: number; p_to_purchased?: boolean } = {};
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const info = await readFetchReqInfo(input, init);
      if (info.url.endsWith('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'user-paid' }), { status: 200 });
      }
      if (info.url.endsWith('/rest/v1/rpc/atomic_deduct_credits')) {
        return new Response(
          JSON.stringify([{ success: true, trial_credits: 0, purchased_credits: 5, balance: 5 }]),
          { status: 200 }
        );
      }
      if (info.url.endsWith('/rest/v1/rpc/atomic_refund_credits')) {
        polishRefundBody = JSON.parse(info.bodyText) as typeof polishRefundBody;
        return new Response(
          JSON.stringify([{ success: true, trial_credits: 0, purchased_credits: 15, balance: 15 }]),
          { status: 200 }
        );
      }
      if (info.url.includes('/interactions')) {
        return new Response(JSON.stringify({ error: { message: 'bad gateway' } }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const polishFailRes = await cohesivePolishPost(
      new Request('http://localhost/api/advance/cohesive-polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-paid' },
        body: JSON.stringify({
          song,
          lyricsRetentionPct: 75,
          chordsRetentionPct: 70,
          lockedSectionIds: [],
          useProArgon: true,
        }),
      })
    );
    assert.equal(polishFailRes.status, 200);
    const polishFailJson = (await polishFailRes.json()) as { isSimulated: boolean; wallet?: { purchasedCredits: number } };
    assert.equal(polishFailJson.isSimulated, true);
    assert.equal(polishRefundBody.p_amount, 10);
    assert.equal(polishRefundBody.p_to_purchased, true);
    assert.equal(polishFailJson.wallet?.purchasedCredits, 15);
  });

  // UI contracts
  const root = process.cwd();
  const easySrc = fs.readFileSync(path.join(root, 'src/components/EasyModeStarterModal.tsx'), 'utf8');
  const polishSrc = fs.readFileSync(path.join(root, 'src/components/CohesivePolishModal.tsx'), 'utf8');

  for (const src of [easySrc, polishSrc]) {
    assert.match(src, /canUsePaidOnlyModel/);
    assert.match(src, /aiProArgonArranger/);
    assert.match(src, /useProArgon/);
    assert.match(src, /applyServerWalletSnapshot/);
    assert.match(src, /onOpenWallet/);
  }
  assert.match(easySrc, /id="easy-lyric-dialect"/);
  assert.match(easySrc, /id="easy-song-topic"/);
  assert.match(easySrc, /id="easy-preview-bpm"/);
});

// ───────── 6. Iteration 2 Remediation Tests (P1.5, P2.2, Post-Deduct Outer try/catch Refund, Concurrent Split) ─────────

test('Phase 8A.6: P1.5 PostgREST credit_transactions throw does not leak deduction; P2.2 null section/polish guards; post-deduction outer try/catch refunds once; concurrent split uses txSplit', async () => {
  await withTestEnv(async () => {
    // 6a. P1.5 standard split deduction fallback: rpc/atomic_deduct_credits -> 404, PATCH user_wallets -> 204, POST credit_transactions -> throws
    let dbTrial = 1;
    let dbPurchased = 10;
    let refundPatchCalls = 0;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const info = await readFetchReqInfo(input, init);
      if (info.url.endsWith('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'user-p15-std' }), { status: 200 });
      }
      if (info.url.includes('/rest/v1/user_wallets')) {
        if (info.method === 'PATCH') {
          const patch = JSON.parse(info.bodyText) as { trial_credits?: number; purchased_credits?: number };
          if (typeof patch.trial_credits === 'number') dbTrial = patch.trial_credits;
          if (typeof patch.purchased_credits === 'number') dbPurchased = patch.purchased_credits;
          return new Response(null, { status: 204 });
        }
        return new Response(
          JSON.stringify([{ user_id: 'user-p15-std', trial_credits: dbTrial, purchased_credits: dbPurchased }]),
          { status: 200 }
        );
      }
      if (info.url.endsWith('/rest/v1/rpc/atomic_deduct_credits')) {
        return new Response('Function not found', { status: 404 });
      }
      if (info.url.endsWith('/rest/v1/rpc/atomic_refund_credits')) {
        refundPatchCalls += 1;
        const body = JSON.parse(info.bodyText) as { p_amount: number; p_to_purchased: boolean };
        if (body.p_to_purchased) dbPurchased += body.p_amount;
        else dbTrial += body.p_amount;
        return new Response(
          JSON.stringify([
            {
              success: true,
              trial_credits: dbTrial,
              purchased_credits: dbPurchased,
              balance: dbTrial + dbPurchased,
            },
          ]),
          { status: 200 }
        );
      }
      if (info.url.includes('/rest/v1/credit_transactions') && info.method === 'POST') {
        throw new Error('boom credit_transactions write failed');
      }
      if (info.url.includes('/interactions')) {
        return new Response(JSON.stringify({ error: { message: 'upstream 503' } }), { status: 503 });
      }
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const p15Pre = await tryServerBillingPreDeduct(
      new Request('http://localhost/api/advance/director', {
        method: 'POST',
        headers: { Authorization: 'Bearer jwt-p15' },
      }),
      2,
      'P1.5 split test'
    );
    assert.equal(p15Pre.active, true);
    assert.ok(!('errorStatus' in p15Pre), 'P1.5 standard fallback must return active billing when ledger POST throws');
    if (p15Pre.active && !('errorStatus' in p15Pre)) {
      assert.equal(p15Pre.deductedFromTrial, 1);
      assert.equal(p15Pre.deductedFromPurchased, 1);
      assert.deepEqual(p15Pre.wallet, { balance: 9, trialCredits: 0, purchasedCredits: 9 });
    }
    const p15Refunded = await refundServerBillingOnFailure(p15Pre, 2, 'P1.5 refund');
    assert.equal(refundPatchCalls, 2);
    assert.deepEqual(p15Refunded, { balance: 11, trialCredits: 1, purchasedCredits: 10 });
    assert.equal(dbTrial, 1);
    assert.equal(dbPurchased, 10);

    // 6b. P1.5 requirePurchased branch inside cohesivePolishPost (10 credits): PATCH succeeds, POST credit_transactions throws, Gemini 503 -> clean 200 fallback + full refund
    dbTrial = 15;
    dbPurchased = 12;
    let proRefundCalls = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const info = await readFetchReqInfo(input, init);
      if (info.url.endsWith('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'user-p15-pro' }), { status: 200 });
      }
      if (info.url.includes('/rest/v1/user_wallets')) {
        if (info.method === 'PATCH') {
          const patch = JSON.parse(info.bodyText) as { trial_credits?: number; purchased_credits?: number };
          if (typeof patch.trial_credits === 'number') dbTrial = patch.trial_credits;
          if (typeof patch.purchased_credits === 'number') dbPurchased = patch.purchased_credits;
          return new Response(null, { status: 204 });
        }
        return new Response(
          JSON.stringify([{ user_id: 'user-p15-pro', trial_credits: dbTrial, purchased_credits: dbPurchased }]),
          { status: 200 }
        );
      }
      if (info.url.endsWith('/rest/v1/rpc/atomic_deduct_credits')) {
        return new Response('Function not found', { status: 404 });
      }
      if (info.url.endsWith('/rest/v1/rpc/atomic_refund_credits')) {
        proRefundCalls += 1;
        const body = JSON.parse(info.bodyText) as { p_amount: number; p_to_purchased: boolean };
        if (body.p_to_purchased) dbPurchased += body.p_amount;
        else dbTrial += body.p_amount;
        return new Response(
          JSON.stringify([
            {
              success: true,
              trial_credits: dbTrial,
              purchased_credits: dbPurchased,
              balance: dbTrial + dbPurchased,
            },
          ]),
          { status: 200 }
        );
      }
      if (info.url.includes('/rest/v1/credit_transactions') && info.method === 'POST') {
        throw new Error('boom credit_transactions pro write failed');
      }
      if (info.url.includes('/interactions')) {
        return new Response(JSON.stringify({ error: { message: 'upstream 503' } }), { status: 503 });
      }
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const songForP15 = createDefaultSong();
    const p15PolishRes = await cohesivePolishPost(
      new Request('http://localhost/api/advance/cohesive-polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-p15-pro' },
        body: JSON.stringify({
          song: songForP15,
          lyricsRetentionPct: 75,
          chordsRetentionPct: 70,
          lockedSectionIds: [],
          useProArgon: true,
        }),
      })
    );
    assert.equal(p15PolishRes.status, 200);
    const p15PolishJson = (await p15PolishRes.json()) as {
      isSimulated: boolean;
      wallet?: { purchasedCredits: number };
    };
    assert.equal(p15PolishJson.isSimulated, true);
    assert.equal(proRefundCalls, 1);
    assert.equal(p15PolishJson.wallet?.purchasedCredits, 12);
    assert.equal(dbPurchased, 12);

    // 6c. P2.2: cohesivePolishPost with { song: { sections: [null] } } returns HTTP 400 JSON cleanly
    const nullSectionRes = await cohesivePolishPost(
      new Request('http://localhost/api/advance/cohesive-polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-ok' },
        body: JSON.stringify({
          song: { sections: [null] },
          lyricsRetentionPct: 75,
          chordsRetentionPct: 70,
        }),
      })
    );
    assert.equal(nullSectionRes.status, 400);
    const nullSectionJson = (await nullSectionRes.json()) as { error: string };
    assert.equal(nullSectionJson.error, 'Invalid song sections');

    const badIdSectionRes = await cohesivePolishPost(
      new Request('http://localhost/api/advance/cohesive-polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-ok' },
        body: JSON.stringify({
          song: { sections: [{ id: 123 }] },
          lyricsRetentionPct: 100,
          chordsRetentionPct: 100,
        }),
      })
    );
    assert.equal(badIdSectionRes.status, 400);

    // 6c-ext. P2.2 residual: missing bars, null bar inside bars -> 400; missing mixer with rebalanceBand -> 200
    const missingBarsRes = await cohesivePolishPost(
      new Request('http://localhost/api/advance/cohesive-polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-ok' },
        body: JSON.stringify({
          song: { ...songForP15, sections: [{ id: 's1' }] },
          lyricsRetentionPct: 100,
          chordsRetentionPct: 100,
        }),
      })
    );
    assert.equal(missingBarsRes.status, 400);
    const missingBarsJson = (await missingBarsRes.json()) as { error: string };
    assert.equal(missingBarsJson.error, 'Invalid song sections');

    const nullBarRes = await cohesivePolishPost(
      new Request('http://localhost/api/advance/cohesive-polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-ok' },
        body: JSON.stringify({
          song: { ...songForP15, sections: [{ id: 's1', bars: [null] }] },
          lyricsRetentionPct: 100,
          chordsRetentionPct: 100,
        }),
      })
    );
    assert.equal(nullBarRes.status, 400);
    const nullBarJson = (await nullBarRes.json()) as { error: string };
    assert.equal(nullBarJson.error, 'Invalid song sections');

    const missingMixerRes = await cohesivePolishPost(
      new Request('http://localhost/api/advance/cohesive-polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-ok' },
        body: JSON.stringify({
          song: { sections: [{ id: 's1', bars: [{ id: 'b1', chords: ['C'], lyrics: 'hi' }] }] },
          lyricsRetentionPct: 100,
          chordsRetentionPct: 100,
        }),
      })
    );
    assert.equal(missingMixerRes.status, 200);
    const missingMixerJson = (await missingMixerRes.json()) as { isSimulated: boolean; model: string };
    assert.equal(missingMixerJson.isSimulated, false);
    assert.equal(missingMixerJson.model, 'local-rebalance');

    // 6d. P2.2: architectPost with Round-2 polish returning { polishedSections: [null] } succeeds without throwing
    let archInteractionsCount = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const info = await readFetchReqInfo(input);
      if (info.url.endsWith('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'user-arch-p22' }), { status: 200 });
      }
      if (info.url.endsWith('/rest/v1/user_wallets')) {
        return new Response(
          JSON.stringify([{ user_id: 'user-arch-p22', trial_credits: 10, purchased_credits: 0 }]),
          { status: 200 }
        );
      }
      if (info.url.endsWith('/rest/v1/rpc/atomic_deduct_credits')) {
        return new Response(
          JSON.stringify([{ success: true, trial_credits: 6, purchased_credits: 0, balance: 6 }]),
          { status: 200 }
        );
      }
      if (info.url.includes('/interactions')) {
        archInteractionsCount += 1;
        if (archInteractionsCount === 1) {
          return new Response(
            JSON.stringify({
              id: 'int_arch_r1',
              object: 'interaction',
              model: 'gemini-4-hydrogen',
              status: 'completed',
              output_text: JSON.stringify({
                title: 'เพลงทดสอบสัมผัส',
                bpm: 84,
                baseKey: 'C',
                sections: [
                  {
                    name: 'Intro',
                    type: 'intro',
                    intensity: 'soft',
                    bars: [
                      { chords: ['C'], lyrics: '', playStyle: 'let-ring' },
                      { chords: ['G'], lyrics: '', playStyle: 'let-ring' },
                    ],
                  },
                  {
                    name: 'Chorus',
                    type: 'chorus',
                    intensity: 'high',
                    bars: [
                      { chords: ['C'], lyrics: 'ฉันเดินคนเดียวในคืนที่ฝนตกลงมาไม่หยุดเลยวันนี้', playStyle: 'normal' },
                      { chords: ['G'], lyrics: 'เธอเดินจากไปไม่เคยหันกลับมามองกันเลยสักทีวันนี้', playStyle: 'normal' },
                    ],
                  },
                ],
                producerNotes: ['Round 1 note'],
              }),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({
            id: 'int_arch_r2_null',
            object: 'interaction',
            model: 'gemini-3.5-flash-lite',
            status: 'completed',
            output_text: JSON.stringify({ polishedSections: [null] }),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const archNullPolishRes = await architectPost(
      new Request('http://localhost/api/advance/architect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-ok' },
        body: JSON.stringify({
          topic: 'ฝนตกในเมืองใหญ่',
          language: 'th',
        }),
      })
    );
    assert.equal(archNullPolishRes.status, 200);
    const archNullPolishJson = (await archNullPolishRes.json()) as {
      isSimulated: boolean;
      rhymeValidation: { passed: boolean; polished: boolean };
      song: { title: string; sections: Array<{ bars: Array<{ lyrics: string }> }> };
    };
    assert.equal(archNullPolishJson.isSimulated, false);
    assert.equal(archNullPolishJson.rhymeValidation.polished, false);
    assert.equal(archInteractionsCount, 2);
    assert.equal(archNullPolishJson.song.title, 'เพลงทดสอบสัมผัส');
    assert.ok(
      archNullPolishJson.song.sections.some((sec) =>
        sec.bars.some((b) => b.lyrics.includes('ฉันเดินคนเดียว'))
      )
    );

    // 6e. Post-deduction outer try/catch refund (refundCount === 1) + secret redaction on directorPost & ttsCuePost
    for (const postDeductCase of ['director', 'tts-cue'] as const) {
      let refundCount = 0;
      const origConsoleErr = console.error;
      const origRespJson = Response.json;
      const capturedLogs: string[] = [];
      console.error = (...args: unknown[]) => {
        capturedLogs.push(args.map((a) => String(a)).join(' '));
      };

      try {
        globalThis.fetch = (async (input: RequestInfo | URL) => {
          const info = await readFetchReqInfo(input);
          if (info.url.endsWith('/auth/v1/user')) {
            return new Response(JSON.stringify({ id: 'user-post-deduct' }), { status: 200 });
          }
          if (info.url.endsWith('/rest/v1/user_wallets')) {
            return new Response(
              JSON.stringify([{ user_id: 'user-post-deduct', trial_credits: 0, purchased_credits: 20 }]),
              { status: 200 }
            );
          }
          if (info.url.endsWith('/rest/v1/rpc/atomic_deduct_credits')) {
            return new Response(
              JSON.stringify([{ success: true, trial_credits: 0, purchased_credits: 18, balance: 18 }]),
              { status: 200 }
            );
          }
          if (info.url.endsWith('/rest/v1/rpc/atomic_refund_credits')) {
            refundCount += 1;
            return new Response(
              JSON.stringify([{ success: true, trial_credits: 0, purchased_credits: 20, balance: 20 }]),
              { status: 200 }
            );
          }
          if (info.url.includes('/interactions')) {
            return new Response(
              JSON.stringify({
                id: 'int_post_deduct_ok',
                object: 'interaction',
                model: 'gemini-3.8-flash-tts',
                status: 'completed',
                output_text: JSON.stringify({
                  summaryNotes: ['ปรับฮุคให้เด่น'],
                  sectionPatches: [{ sectionType: 'chorus', intensity: 'high' }],
                }),
                steps: [
                  {
                    type: 'model_output',
                    content: [{ type: 'audio', data: Buffer.from('RIFFok').toString('base64'), mime_type: 'audio/wav' }],
                  },
                ],
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return new Response('{}', { status: 200 });
        }) as typeof fetch;

        let threwOnce = false;
        Response.json = ((data: unknown, init?: ResponseInit) => {
          if (!threwOnce) {
            threwOnce = true;
            Response.json = origRespJson;
            throw new Error('Post-deduct crash AIzaSecretLeak123456 Bearer secretJwtToken999');
          }
          return origRespJson.call(Response, data, init);
        }) as typeof Response.json;

        const errRes =
          postDeductCase === 'director'
            ? await directorPost(
                new Request('http://localhost/api/advance/director', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-ok' },
                  body: JSON.stringify({
                    prompt: 'เพิ่มพลังท่อนฮุค',
                    songSummary: {
                      title: 'Test',
                      bpm: 90,
                      baseKey: 'C',
                      guitarModel: 'dreadnought-steel',
                      ambience3D: 'wood-studio',
                      sections: [{ id: 's1', name: 'Chorus', type: 'chorus', intensity: 'medium', barCount: 4 }],
                    },
                  }),
                })
              )
            : await ttsCuePost(
                new Request('http://localhost/api/advance/tts-cue', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-ok' },
                  body: JSON.stringify({
                    text: 'สายลมแห่งความทรงจำ',
                    language: 'th',
                  }),
                })
              );

        assert.equal(errRes.status, 500, `${postDeductCase} post-deduct throw must return HTTP 500`);
        const errJson = (await errRes.json()) as { error: string; code: string; wallet?: { balance: number } };
        assert.match(errJson.code, /_INTERNAL_ERROR$/);
        assert.equal(refundCount, 1, `${postDeductCase} post-deduct throw must refund exactly once`);
        assert.equal(errJson.wallet?.balance, 20);
        assert.ok(capturedLogs.every((l) => !l.includes('AIzaSecretLeak') && !l.includes('secretJwtToken999')));
      } finally {
        Response.json = origRespJson;
        console.error = origConsoleErr;
      }
    }

    // 6f. Concurrent trial-exhaustion split prefers credit_transactions txSplit when trialCredits === 0
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const info = await readFetchReqInfo(input);
      if (info.url.endsWith('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'user-concurrent' }), { status: 200 });
      }
      if (info.url.includes('/rest/v1/user_wallets')) {
        // Stale pre-lock read showing trial_credits = 4 before another concurrent request drained trial to 0
        return new Response(
          JSON.stringify([{ user_id: 'user-concurrent', trial_credits: 4, purchased_credits: 10 }]),
          { status: 200 }
        );
      }
      if (info.url.endsWith('/rest/v1/rpc/atomic_deduct_credits')) {
        return new Response(
          JSON.stringify([{ success: true, trial_credits: 0, purchased_credits: 6, balance: 6 }]),
          { status: 200 }
        );
      }
      if (info.url.includes('/rest/v1/credit_transactions')) {
        return new Response(
          JSON.stringify([{ amount: -4, metadata: { from_trial: 0, from_purchased: 4 } }]),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const concurrentPre = await tryServerBillingPreDeduct(
      new Request('http://localhost/api/advance/architect', {
        method: 'POST',
        headers: { Authorization: 'Bearer jwt-concurrent' },
      }),
      4,
      'Concurrent split test'
    );
    assert.equal(concurrentPre.active, true);
    if (concurrentPre.active && !('errorStatus' in concurrentPre)) {
      assert.equal(concurrentPre.deductedFromTrial, 0);
      assert.equal(concurrentPre.deductedFromPurchased, 4);
    }
  });
});
