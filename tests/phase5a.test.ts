/**
 * Phase 5A Verification Suite
 * ครอบคลุม: @google/genai SDK (Interactions API), Producer Prompts & JSON Schemas,
 * Updated Credit Packages / Cost Table / Anti-Loss Guards, และ 0-Cr vs 1-Cr AI Director Routing
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  ANTI_CLICHE_THAI_PHRASES,
  DIRECTOR_RESPONSE_SCHEMA,
  LYRICS_RESPONSE_SCHEMA,
  buildDirectorSystemPrompt,
  buildLyricsSystemPrompt,
  buildLyricsUserPrompt,
  getSyllableBudgetForBpm,
} from '../src/lib/aiPrompts';
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODEL_LITE,
  GEMINI_MODEL_MAIN,
  GEMINI_MODEL_MUSIC,
  GEMINI_MODEL_PRO,
  callGeminiJson,
  normalizeGeminiModel,
  resolveGeminiModel,
  resolveMaxOutputTokens,
  resolveThinkingLevel,
} from '../src/lib/geminiClient';
import {
  CREDIT_COST_TABLE,
  CREDIT_PACKAGES,
  DEFAULT_STARTER_CREDITS,
  canUsePaidOnlyModel,
  deductCredits,
  getCreditBalance,
  getCreditTransactions,
  getWalletBreakdown,
  refundCredits,
  resetCreditWalletForTests,
  topUpCredits,
} from '../src/lib/creditManager';
import { classifyDirectorPromptMode } from '../src/lib/aiSongDirector';
import { createDefaultSong } from '../src/lib/defaultSong';
import { POST as lyricsPost } from '../src/app/api/advance/lyrics/route';

function setupMemoryStorage(): Map<string, string> {
  const store = new Map<string, string>();
  const mockStorage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
  (globalThis as unknown as { window?: { localStorage: Storage } }).window = {
    localStorage: mockStorage,
  };
  return store;
}

// ───────────────────────── 1. Producer Prompts & Syllable Budgets ─────────────────────────

test('aiPrompts: syllable budget, anti-cliche rules, few-shot context, and schemas', () => {
  const slow = getSyllableBudgetForBpm(72, '4/4');
  assert.equal(slow.tempoFeel, 'slow');
  assert.ok(slow.min >= 4 && slow.max <= 8);

  const waltzSlow = getSyllableBudgetForBpm(68, '3/4');
  assert.equal(waltzSlow.min, 4);
  assert.equal(waltzSlow.max, 5);

  const medium = getSyllableBudgetForBpm(95, '4/4');
  assert.equal(medium.tempoFeel, 'medium');
  assert.equal(medium.min, 5);
  assert.equal(medium.max, 7);

  const fast = getSyllableBudgetForBpm(136, '4/4');
  assert.equal(fast.tempoFeel, 'fast');
  assert.ok(fast.max <= 7);

  const lyricSys = buildLyricsSystemPrompt({ bpm: 74, timeSignature: '4/4', sectionType: 'chorus' });
  assert.ok(lyricSys.includes('4-6 พยางค์'));
  assert.ok(lyricSys.includes('Hook'));
  for (const banned of ANTI_CLICHE_THAI_PHRASES.slice(0, 3)) {
    assert.ok(lyricSys.includes(banned));
  }

  const lyricUser = buildLyricsUserPrompt({
    mood: 'อบอุ่น',
    topic: 'ร้านกาแฟยามเช้า',
    chordProgression: ['C', 'G', 'Am', 'F'],
    existingLyrics: [],
    sectionType: 'chorus',
    bpm: 74,
    timeSignature: '4/4',
    previousSectionLyrics: ['ลมอุ่นพัดผ่านหน้าต่างบานเก่า'],
  });
  assert.ok(lyricUser.includes('ลมอุ่นพัดผ่านหน้าต่างบานเก่า'));
  assert.ok(lyricUser.includes('74 BPM'));

  const dirSys = buildDirectorSystemPrompt();
  assert.ok(dirSys.includes('guitarLead'));
  assert.ok(dirSys.includes('classical-nylon'));
  assert.ok(dirSys.includes('unplugged-hall'));

  assert.equal(LYRICS_RESPONSE_SCHEMA.type, 'object');
  assert.ok(Array.isArray(LYRICS_RESPONSE_SCHEMA.required));
  assert.equal(DIRECTOR_RESPONSE_SCHEMA.type, 'object');
});

// ───────────────────────── 2. @google/genai Client & Normalization ─────────────────────────

test('geminiClient: normalizes legacy models, thinking_level, max_output_tokens & usage telemetry', async () => {
  assert.equal(GEMINI_MODEL_LITE, 'gemini-3.5-flash-lite');
  assert.equal(GEMINI_MODEL_MAIN, 'gemini-4-hydrogen');
  assert.equal(GEMINI_MODEL_PRO, 'gemini-4-argon');
  assert.equal(GEMINI_MODEL_MUSIC, 'lyria-3.5');
  assert.equal(DEFAULT_GEMINI_MODEL, 'gemini-4-hydrogen');

  assert.equal(normalizeGeminiModel('gemini-4-hydrogen'), 'gemini-4-hydrogen');
  assert.equal(normalizeGeminiModel('gemini-3.8-flash'), 'gemini-3.8-flash');
  assert.equal(normalizeGeminiModel('gemini-2.5-flash'), 'gemini-4-hydrogen');
  assert.equal(normalizeGeminiModel('gemini-2.0-flash-exp'), 'gemini-4-hydrogen');
  assert.equal(normalizeGeminiModel('gemini-4-argon'), 'gemini-4-argon');

  // thinking_level guard: minimal allowed on 3.5-flash-lite, upgraded to low on 4-hydrogen/3.8-flash/4-argon; xhigh allowed on Gemini 4
  assert.equal(resolveThinkingLevel(GEMINI_MODEL_LITE, 'minimal'), 'minimal');
  assert.equal(resolveThinkingLevel(GEMINI_MODEL_MAIN, 'minimal'), 'low');
  assert.equal(resolveThinkingLevel(GEMINI_MODEL_MAIN, 'xhigh'), 'xhigh');
  assert.equal(resolveThinkingLevel('gemini-3.8-flash', 'xhigh'), 'high');
  assert.equal(resolveThinkingLevel(GEMINI_MODEL_PRO, 'minimal'), 'low');
  assert.equal(resolveThinkingLevel(GEMINI_MODEL_PRO, 'high'), 'high');

  // max_output_tokens guard: Argon enforces >= 32768
  assert.equal(resolveMaxOutputTokens(GEMINI_MODEL_LITE), 2048);
  assert.equal(resolveMaxOutputTokens(GEMINI_MODEL_MAIN), 4096);
  assert.ok(resolveMaxOutputTokens(GEMINI_MODEL_PRO, 2048) >= 32768);

  const prevKey = process.env.GEMINI_API_KEY;
  const prevModel = process.env.GEMINI_MODEL;
  const origFetch = globalThis.fetch;

  try {
    delete process.env.GEMINI_API_KEY;
    const missing = await callGeminiJson('hello');
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.reason, 'missing-key');
    }

    process.env.GEMINI_API_KEY = 'phase5a-secret-key';
    process.env.GEMINI_MODEL = 'gemini-4-hydrogen';
    assert.equal(resolveGeminiModel(), 'gemini-4-hydrogen');
    process.env.GEMINI_MODEL = 'gemini-3.8-flash';
    assert.equal(resolveGeminiModel(), 'gemini-3.8-flash');
    process.env.GEMINI_MODEL = 'gemini-2.5-flash';
    assert.equal(resolveGeminiModel(), 'gemini-4-hydrogen');

    let capturedBody = '';
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = input instanceof Request ? await input.clone().text() : String(init?.body ?? '');
      return new Response(
        JSON.stringify({
          id: 'v1_test_5a',
          object: 'interaction',
          model: GEMINI_MODEL_LITE,
          status: 'completed',
          steps: [
            {
              type: 'model_output',
              content: [{ type: 'text', text: '{"lines":["a","b","c","d"],"rhymeNotes":["ok"],"suggestedChords":["C","G"]}' }],
            },
          ],
          usage: {
            total_input_tokens: 111,
            total_cached_tokens: 22,
            total_output_tokens: 44,
            total_thought_tokens: 5,
            total_tokens: 182,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const okRes = await callGeminiJson<{ lines: string[] }>('Test prompt', {
      model: GEMINI_MODEL_LITE,
      systemInstruction: 'System rule',
      responseSchema: LYRICS_RESPONSE_SCHEMA,
      thinkingLevel: 'minimal',
    });
    assert.equal(okRes.ok, true);
    if (okRes.ok) {
      assert.equal(okRes.modelUsed, GEMINI_MODEL_LITE);
      assert.equal(okRes.usage.inputTokens, 111);
      assert.equal(okRes.usage.cachedTokens, 22);
      assert.equal(okRes.usage.outputTokens, 44);
      assert.equal(okRes.usage.thoughtTokens, 5);
      assert.equal(okRes.usage.totalTokens, 182);
    }
    const reqJson = JSON.parse(capturedBody) as Record<string, unknown>;
    assert.equal(reqJson.store, false);
    assert.equal(reqJson.system_instruction, 'System rule');
    assert.ok(reqJson.response_format);

    // Rate limit 429 classification
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: { code: 429, message: 'Quota exceeded' } }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    const rateRes = await callGeminiJson('Rate test', { model: GEMINI_MODEL_LITE });
    assert.equal(rateRes.ok, false);
    if (!rateRes.ok) {
      assert.equal(rateRes.reason, 'rate-limit');
      assert.equal(rateRes.status, 429);
    }
  } finally {
    globalThis.fetch = origFetch;
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
    else delete process.env.GEMINI_API_KEY;
    if (prevModel !== undefined) process.env.GEMINI_MODEL = prevModel;
    else delete process.env.GEMINI_MODEL;
  }
});

// ───────────────────────── 3. Credit Packages, Cost Table & Anti-Loss Guards ─────────────────────────

test('creditManager: 15 starter credits, 4 packages, cost table, trial vs purchased gating & refund', () => {
  const store = setupMemoryStorage();
  resetCreditWalletForTests();

  assert.equal(DEFAULT_STARTER_CREDITS, 15);
  assert.equal(CREDIT_COST_TABLE.localTools, 0);
  assert.equal(CREDIT_COST_TABLE.aiLyricsQuick, 1);
  assert.equal(CREDIT_COST_TABLE.aiDirectorComplex, 1);
  assert.equal(CREDIT_COST_TABLE.aiReferenceTrackLyria, 8);
  assert.equal(CREDIT_COST_TABLE.aiProArgonArranger, 10);

  // Verify updated 4 packages
  assert.equal(CREDIT_PACKAGES.length, 4);
  assert.deepEqual(
    CREDIT_PACKAGES.map((p) => ({ priceThb: p.priceThb, base: p.baseCredits, bonus: p.bonusCredits, credits: p.credits })),
    [
      { priceThb: 49, base: 50, bonus: 0, credits: 50 },
      { priceThb: 99, base: 100, bonus: 10, credits: 110 },
      { priceThb: 249, base: 300, bonus: 40, credits: 340 },
      { priceThb: 499, base: 700, bonus: 100, credits: 800 },
    ]
  );

  // Trial wallet starts at 15 trialCredits / 0 purchasedCredits
  const initialBreakdown = getWalletBreakdown();
  assert.equal(initialBreakdown.balance, 15);
  assert.equal(initialBreakdown.trialCredits, 15);
  assert.equal(initialBreakdown.purchasedCredits, 0);

  // Paid-only models (lyria=8, argon=10) MUST be blocked on free trial credits alone
  const lyriaGate = canUsePaidOnlyModel(CREDIT_COST_TABLE.aiReferenceTrackLyria);
  assert.equal(lyriaGate.allowed, false);
  assert.equal(lyriaGate.reason, 'paid-credits-required');

  const argonGate = canUsePaidOnlyModel(CREDIT_COST_TABLE.aiProArgonArranger);
  assert.equal(argonGate.allowed, false);
  assert.equal(argonGate.reason, 'paid-credits-required');

  // Top up Mini Pack (49 THB -> +50 purchased credits) -> paid-only models unlocked
  topUpCredits(CREDIT_PACKAGES[0]);
  const afterTopUp = getWalletBreakdown();
  assert.equal(afterTopUp.balance, 65);
  assert.equal(afterTopUp.trialCredits, 15);
  assert.equal(afterTopUp.purchasedCredits, 50);

  assert.equal(canUsePaidOnlyModel(CREDIT_COST_TABLE.aiReferenceTrackLyria).allowed, true);
  assert.equal(canUsePaidOnlyModel(CREDIT_COST_TABLE.aiProArgonArranger).allowed, true);

  // Spending deducts trialCredits FIRST before touching purchasedCredits
  deductCredits(10, 'Test trial-first spend');
  const afterSpend = getWalletBreakdown();
  assert.equal(afterSpend.trialCredits, 5);
  assert.equal(afterSpend.purchasedCredits, 50);

  // Refund restores credit cleanly
  refundCredits(1, 'API failure auto-refund');
  assert.equal(getCreditBalance(), 56);
  assert.equal(getCreditTransactions()[0].type, 'refund');
  assert.ok(store.size > 0);

  // Legacy wallet migration compatibility
  store.set(
    'demo_maker_credit_wallet_v1',
    JSON.stringify({
      balance: 120,
      transactions: [
        { id: 't1', type: 'topup', amount: 100, description: 'Legacy topup', createdAt: new Date().toISOString() },
        { id: 't2', type: 'starter', amount: 20, description: 'Legacy starter', createdAt: new Date().toISOString() },
      ],
    })
  );
  const migrated = getWalletBreakdown();
  assert.equal(migrated.balance, 120);
  assert.equal(migrated.purchasedCredits, 100);
  assert.equal(migrated.trialCredits, 20);

  resetCreditWalletForTests();
});

// ───────────────────────── 4. Local vs AI Director Routing & Phase 5A UI Contracts ─────────────────────────

test('classifyDirectorPromptMode separates 0-credit deterministic commands from 1-credit AI creative prompts', () => {
  const song = createDefaultSong();

  const localTempo = classifyDirectorPromptMode('ตั้งความเร็ว 95 bpm เปลี่ยนคีย์เป็น G ปิดกลอง', song);
  assert.equal(localTempo.mode, 'local');
  assert.ok(localTempo.localResult.summaryActions.length >= 2);

  const aiCoffee = classifyDirectorPromptMode('อยากได้ฟีล Acoustic อุ่นๆ เหมือนร้านกาแฟยามบ่าย', song);
  assert.equal(aiCoffee.mode, 'ai');

  const aiUnknown = classifyDirectorPromptMode('ทำให้ฟังดูเหงาเหมือนฝนตกตอนดึก', song);
  assert.equal(aiUnknown.mode, 'ai');
});

test('/api/advance/lyrics rate-limit handling + Phase 5A UI free-of-hydrogen & non-simulated-only billing contracts', async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  const origFetch = globalThis.fetch;

  try {
    process.env.GEMINI_API_KEY = 'rate-limit-test-key';
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: { code: 429, message: 'Quota full' } }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });

    const res = await lyricsPost(
      new Request('http://localhost/api/advance/lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mood: 'อบอุ่น',
          topic: 'สายฝน',
          chordProgression: ['C', 'G', 'Am', 'F'],
          sectionType: 'chorus',
          bpm: 76,
          timeSignature: '4/4',
          previousSectionLyrics: ['ลมพัดเบาๆ ข้างหน้าต่าง'],
        }),
      })
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as { isSimulated: boolean; failureReason?: string; tip: string };
    assert.equal(body.isSimulated, true);
    assert.equal(body.failureReason, 'rate-limit');
    assert.ok(body.tip.includes('429'));
  } finally {
    globalThis.fetch = origFetch;
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
    else delete process.env.GEMINI_API_KEY;
  }

  const root = process.cwd();
  const modalSrc = fs.readFileSync(path.join(root, 'src/components/AdvanceModeModal.tsx'), 'utf8');
  const transportSrc = fs.readFileSync(path.join(root, 'src/components/TransportBar.tsx'), 'utf8');

  assert.ok(!/gemini-4-hydrogen/i.test(modalSrc), 'AdvanceModeModal should rely on server telemetry instead of hardcoded model IDs');
  assert.match(modalSrc, /if \(!data\.isSimulated\)/);
  assert.match(modalSrc, /classifyDirectorPromptMode/);
  assert.match(transportSrc, /DEFAULT_STARTER_CREDITS/);
});
