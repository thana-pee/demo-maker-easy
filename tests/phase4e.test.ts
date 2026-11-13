/**
 * phase4e.test.ts — Automated Unit Tests for Phase 4E
 *
 * Tests:
 *   1. thaiRhymeHelper.ts — offline Thai rhyme groups & Thai/English syllable counting
 *   2. creditManager.ts — starter 30 credits, deductCredits, insufficient guard, topUpCredits & ledger
 *   3. /api/advance/lyrics POST Route Handler — 400 validation, simulated fallback, Gemini mock & no key leak
 *   4. UI Wiring Contract — TransportBar credit chip, SectionBuilder ✨ trigger, AdvanceModeModal & page.tsx
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  THAI_RHYME_GROUPS,
  findThaiRhymes,
  countThaiEnglishSyllables,
} from '../src/lib/thaiRhymeHelper';
import {
  DEFAULT_STARTER_CREDITS,
  CREDIT_PACKAGES,
  getCreditBalance,
  getCreditTransactions,
  canAfford,
  deductCredits,
  topUpCredits,
  resetCreditWalletForTests,
} from '../src/lib/creditManager';
import { POST as generateAdvanceLyrics } from '../src/app/api/advance/lyrics/route';

function installMockLocalStorage(): Map<string, string> {
  const store = new Map<string, string>();
  const g = globalThis as { localStorage?: Storage };
  g.localStorage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k: string) => store.get(k) ?? null,
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => {
      store.delete(k);
    },
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  };
  return store;
}

// ───────────────────────── 1. Thai Rhyme Helper ─────────────────────────

test('thaiRhymeHelper: นับพยางค์ไทย/อังกฤษ และจัดกลุ่มคำสัมผัสพื้นฐานได้แม่นยำ (0 Credits)', () => {
  assert.ok(THAI_RHYME_GROUPS.length >= 10);
  assert.ok(countThaiEnglishSyllables('รักเธอตลอดไป') >= 3);
  assert.ok(countThaiEnglishSyllables('hello world') >= 2);
  assert.equal(countThaiEnglishSyllables('   '), 0);

  const rAk = findThaiRhymes('รัก');
  assert.match(rAk.groupLabel, /-ัก/);
  assert.ok(rAk.suggestions.includes('ความรัก'));

  const rAn = findThaiRhymes('ความฝัน');
  assert.match(rAn.groupLabel, /-ัน/);
  assert.ok(rAn.suggestions.length > 0);

  const rOe = findThaiRhymes('เธอ');
  assert.match(rOe.groupLabel, /-เออ/);
  assert.ok(rOe.suggestions.length > 0);

  const rAi = findThaiRhymes('หัวใจ');
  assert.match(rAi.groupLabel, /-ใจ|-ไ-|-ใ-/);
  assert.ok(!rAi.suggestions.includes('หัวใจ'));

  const byId = findThaiRhymes('orn');
  assert.match(byId.groupLabel, /-อน/);
  assert.ok(byId.suggestions.length > 0);
});

// ───────────────────────── 2. Credit Wallet Manager ─────────────────────────

test('creditManager: เริ่มต้น 30 เครดิต หักเครดิต ป้องกันยอดติดลบ และเติมแพ็กเกจพร้อมประวัติได้', () => {
  const store = installMockLocalStorage();
  resetCreditWalletForTests();

  assert.equal(DEFAULT_STARTER_CREDITS, 30);
  assert.equal(getCreditBalance(), 30);
  assert.equal(canAfford(1), true);
  assert.equal(canAfford(30), true);
  assert.equal(canAfford(31), false);
  assert.equal(canAfford(-5), false);

  const starterTx = getCreditTransactions();
  assert.equal(starterTx.length, 1);
  assert.equal(starterTx[0].type, 'starter');
  assert.equal(starterTx[0].amount, 30);

  // Spend 1 credit for AI lyrics
  const spend = deductCredits(1, 'AI Lyric Co-Pilot: Chorus');
  assert.equal(spend.success, true);
  assert.equal(spend.balance, 29);
  assert.equal(spend.transaction?.amount, -1);

  // Prevent overdraft / negative balance
  const failSpend = deductCredits(99, 'Too expensive');
  assert.equal(failSpend.success, false);
  assert.equal(failSpend.balance, 29);

  // Invalid negative/zero spend rejected
  assert.equal(deductCredits(0, 'Zero').success, false);
  assert.equal(deductCredits(-2, 'Neg').success, false);

  // Top-up Starter Pack (+100 Credits)
  const topUp = topUpCredits(CREDIT_PACKAGES[0]);
  assert.equal(topUp.success, true);
  assert.equal(topUp.balance, 129);
  assert.equal(topUp.transaction.type, 'topup');
  assert.equal(topUp.transaction.amount, 100);

  const txs = getCreditTransactions();
  assert.equal(txs.length, 3);
  assert.equal(txs[0].type, 'topup');
  assert.equal(txs[1].type, 'spend');
  assert.equal(txs[2].type, 'starter');
  assert.ok(store.size > 0);

  resetCreditWalletForTests();
});

// ───────────────────────── 3. /api/advance/lyrics Route ─────────────────────────

test('/api/advance/lyrics POST: คืน 400 เมื่อ Payload ไม่ถูกต้อง และใช้ Simulation เมื่อไม่มี GEMINI_API_KEY', async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  try {
    // 1) Invalid JSON -> 400
    const badJsonReq = new Request('http://localhost/api/advance/lyrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid-json',
    });
    const badJsonRes = await generateAdvanceLyrics(badJsonReq);
    assert.equal(badJsonRes.status, 400);

    // 2) Missing required fields -> 400
    const missingReq = new Request('http://localhost/api/advance/lyrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mood: '', topic: 'ฝนตก', chordProgression: ['C'] }),
    });
    const missingRes = await generateAdvanceLyrics(missingReq);
    assert.equal(missingRes.status, 400);

    // 3) Valid request without GEMINI_API_KEY -> 200 simulated response
    const validReq = new Request('http://localhost/api/advance/lyrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mood: 'คิดถึง (Nostalgic)',
        topic: 'คืนฝนพรำ',
        chordProgression: ['C', 'G', 'Am', 'F'],
        sectionType: 'chorus',
      }),
    });
    const validRes = await generateAdvanceLyrics(validReq);
    assert.equal(validRes.status, 200);
    const data = (await validRes.json()) as {
      isSimulated: boolean;
      lines: Array<{ chord: string; text: string; syllables: number }>;
      fullLyrics: string;
    };
    assert.equal(data.isSimulated, true);
    assert.equal(data.lines.length, 4);
    assert.deepEqual(
      data.lines.map((l) => l.chord),
      ['C', 'G', 'Am', 'F']
    );
    assert.ok(data.lines.every((l) => l.text.length > 0 && l.syllables > 0));
    assert.ok(data.fullLyrics.includes('\n'));
  } finally {
    if (prevKey !== undefined) {
      process.env.GEMINI_API_KEY = prevKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  }
});

test('/api/advance/lyrics POST: เรียก Gemini 4 Hydrogen เมื่อมี Key โดยส่งผ่าน Header (ไม่รั่ว Secret)', async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  const origFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = 'secret-test-gemini-key-xyz';

  const captured: { url: string; apiKeyHeader: string | null } = { url: '', apiKeyHeader: null };

  try {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      captured.url = typeof input === 'string' ? input : input.toString();
      const headers = new Headers(init?.headers);
      captured.apiKeyHeader = headers.get('x-goog-api-key');

      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      lines: [
                        'แสงไฟริมทางส่องใจให้เดินต่อ',
                        'แม้คืนเหน็บหนาวก็ยังเฝ้ารอ',
                        'แค่มีเสียงเพลงปลอบโยนหัวใจ',
                        'พรุ่งนี้ท้องฟ้าจะสดใสกว่าเดิม',
                      ],
                      tip: 'เน้นจังหวะลงคำท้ายที่สระออและสระไอ',
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const req = new Request('http://localhost/api/advance/lyrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mood: 'ให้กำลังใจ',
        topic: 'แสงไฟยามค่ำ',
        chordProgression: ['G', 'D', 'Em', 'C'],
        sectionType: 'verse',
      }),
    });
    const res = await generateAdvanceLyrics(req);
    assert.equal(res.status, 200);
    const jsonText = await res.text();
    assert.ok(!jsonText.includes('secret-test-gemini-key-xyz'));
    assert.ok(!captured.url.includes('secret-test-gemini-key-xyz'));
    assert.equal(captured.apiKeyHeader, 'secret-test-gemini-key-xyz');

    const body = JSON.parse(jsonText) as {
      isSimulated: boolean;
      model: string;
      lines: Array<{ chord: string; text: string; syllables: number }>;
    };
    assert.equal(body.isSimulated, false);
    assert.equal(body.model, 'gemini-4-hydrogen');
    assert.ok(captured.url.includes('gemini-4-hydrogen'));
    assert.equal(body.lines.length, 4);
    assert.deepEqual(
      body.lines.map((l) => l.chord),
      ['G', 'D', 'Em', 'C']
    );

    // Also verify upstream HTTP 500 degrades gracefully to Simulation Mode (HTTP 200)
    globalThis.fetch = async () => new Response('Server Error', { status: 500 });
    const fallbackRes = await generateAdvanceLyrics(
      new Request('http://localhost/api/advance/lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mood: 'Warm',
          topic: 'สายลม',
          chordProgression: ['C', 'F'],
          sectionType: 'bridge',
        }),
      })
    );
    assert.equal(fallbackRes.status, 200);
    const fallbackBody = (await fallbackRes.json()) as { isSimulated: boolean };
    assert.equal(fallbackBody.isSimulated, true);
  } finally {
    globalThis.fetch = origFetch;
    if (prevKey !== undefined) {
      process.env.GEMINI_API_KEY = prevKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  }
});

// ───────────────────────── 4. UI Integration Contracts ─────────────────────────

test('Phase 4E UI Contracts: TransportBar, SectionBuilder, AdvanceModeModal และ page.tsx เชื่อมต่อครบ', () => {
  const root = process.cwd();
  const transportSrc = fs.readFileSync(path.join(root, 'src/components/TransportBar.tsx'), 'utf8');
  const sectionSrc = fs.readFileSync(path.join(root, 'src/components/SectionBuilder.tsx'), 'utf8');
  const modalSrc = fs.readFileSync(path.join(root, 'src/components/AdvanceModeModal.tsx'), 'utf8');
  const pageSrc = fs.readFileSync(path.join(root, 'src/app/page.tsx'), 'utf8');

  assert.match(transportSrc, /creditBalance/);
  assert.match(transportSrc, /onOpenAdvanceModal/);
  assert.match(transportSrc, /Credits/);

  assert.match(sectionSrc, /onOpenAdvanceForSection/);
  assert.match(sectionSrc, /✨/);

  assert.match(modalSrc, /Uses 1 Credit/);
  assert.match(modalSrc, /ใช้ 1 เครดิต/);
  assert.match(modalSrc, /PromptPay/i);
  assert.match(modalSrc, /findThaiRhymes/);
  assert.match(modalSrc, /\/api\/advance\/lyrics/);

  assert.match(pageSrc, /AdvanceModeModal/);
  assert.match(pageSrc, /handleApplyAiLyrics/);
  assert.match(pageSrc, /creditBalance/);
});
