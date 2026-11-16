/**
 * phase5f.test.ts — Automated Unit Tests for Phase 5F
 *
 * Tests:
 *   1. EMVCo Thai PromptPay QR payload generation + CCITT CRC16 vectors + vector SVG QR output
 *   2. Google OAuth Sign-In URL builder & Guest fallback (`cloudSync.ts`) + `syncWalletFromServer`
 *   3. 5-Layer Slip Validation Matrix (`validateSlipAgainstOrder` & `normalizeSlipApiPayload`)
 *   4. Billing Route Handlers (`/api/billing/wallet`, `/api/billing/create-order`, `/api/billing/verify-slip`):
 *      - Non-auth `401` rejections
 *      - Server-authoritative pricing & QR creation
 *      - >4MB & bad MIME rejection + happy path credit grant + `409` duplicate `transRef` rejection
 *   5. SQL Migration, `.env.example` & Phase 5F UI/Gate Contracts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  crc16Ccitt,
  generatePromptPayPayload,
  generatePromptPayQrDataUrl,
  generatePromptPayQrSvg,
  normalizePromptPayReceiver,
} from '../src/lib/promptpayQr';
import {
  GUEST_USER,
  getAuthAccessToken,
  getGoogleOAuthAuthorizeUrl,
  refreshAuthSession,
  saveCloudConfig,
  signInWithGoogleOAuth,
} from '../src/lib/cloudSync';
import {
  applyServerWalletSnapshot,
  canAllowDemoTopUp,
  getCreditBalance,
  getWalletBreakdown,
  isProductionBillingEnabled,
  resetCreditWalletForTests,
  syncWalletFromServer,
} from '../src/lib/creditManager';
import {
  MAX_SLIP_FILE_BYTES,
  atomicDeductCredits,
  atomicRefundCredits,
  getOrInitWallet,
  normalizeSlipApiPayload,
  refundServerBillingOnFailure,
  tryServerBillingPreDeduct,
  validateSlipAgainstOrder,
  verifySlipImageWithProvider,
  type ServerBillingConfig,
} from '../src/lib/serverWallet';
import { POST as architectPOST } from '../src/app/api/advance/architect/route';
import { POST as directorPOST } from '../src/app/api/advance/director/route';
import { POST as humPOST } from '../src/app/api/advance/hum-to-song/route';
import { POST as lyricsPOST } from '../src/app/api/advance/lyrics/route';
import { POST as refPOST } from '../src/app/api/advance/reference-track/route';
import { POST as ttsPOST } from '../src/app/api/advance/tts-cue/route';
import { GET as walletGET, handleGetWalletRequest } from '../src/app/api/billing/wallet/route';
import { POST as createOrderPOST, handleCreateOrderRequest } from '../src/app/api/billing/create-order/route';
import { POST as verifySlipPOST, handleVerifySlipRequest } from '../src/app/api/billing/verify-slip/route';
import { handleHealthRequest } from '../src/app/api/health/route';
import { evaluateProductionReadiness } from '../src/lib/productionReadiness';

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

const TEST_BILLING_CONFIG: ServerBillingConfig = {
  supabaseUrl: 'https://test-project.supabase.co',
  supabaseAnonKey: 'test-anon-key',
  serviceRoleKey: 'test-service-role-key',
  promptPayReceiverId: '0812345678',
  promptPayReceiverName: 'Demo Maker Studio',
  slipVerifyApiUrl: 'https://api.slip-provider.test/v1/verify',
  slipVerifyApiKey: 'test-slip-secret',
  billingMode: 'production',
};

// ───────────────────────── 1. PromptPay EMVCo & CRC16 ─────────────────────────

test('PromptPay QR: คำนวณ CRC16-CCITT ถูกต้องและสร้าง EMVCo Payload + SVG ได้แม่นยำ', async () => {
  // Standard CCITT-FALSE reference test vector
  assert.equal(crc16Ccitt('123456789'), '29B1');

  const mobileTarget = normalizePromptPayReceiver('081-234-5678');
  assert.equal(mobileTarget.kind, 'mobile');
  assert.equal(mobileTarget.subTag, '01');
  assert.equal(mobileTarget.formattedId, '0066812345678');

  const payload = generatePromptPayPayload('0812345678', 49);
  assert.ok(payload.startsWith('00020101021229370016A000000677010111011300668123456785303764540549.005802TH6304'));
  const expectedCrc = crc16Ccitt(payload.slice(0, -4));
  assert.equal(payload.slice(-4), expectedCrc);

  const taxTarget = normalizePromptPayReceiver('1234567890123');
  assert.equal(taxTarget.subTag, '02');
  const taxPayload = generatePromptPayPayload('1234567890123', 249, 'ORD99');
  assert.ok(taxPayload.includes('5406249.00'));
  assert.ok(taxPayload.includes('62090505ORD99'));
  assert.equal(taxPayload.slice(-4), crc16Ccitt(taxPayload.slice(0, -4)));

  const ewalletTarget = normalizePromptPayReceiver('123456789012345');
  assert.equal(ewalletTarget.subTag, '03');

  assert.throws(() => normalizePromptPayReceiver('12345'), /PromptPay/);

  const svg = await generatePromptPayQrSvg(payload);
  assert.ok(svg.includes('<svg') && svg.includes('</svg>'));
  const dataUrl = await generatePromptPayQrDataUrl(payload);
  assert.ok(dataUrl.startsWith('data:image/svg+xml;charset=utf-8,'));
});

// ───────────────────────── 2. Google OAuth & Server Wallet Sync ─────────────────────────

test('cloudSync Google OAuth & creditManager server sync: ปลอดภัยเมื่อยังไม่ตั้งค่า และซิงค์ Wallet สำเร็จ', async () => {
  installMockLocalStorage();
  resetCreditWalletForTests();

  // Unconfigured fallback keeps Guest free
  assert.equal(getGoogleOAuthAuthorizeUrl('https://app.example.com'), null);
  const unconfigured = signInWithGoogleOAuth({ redirectTo: 'https://app.example.com' });
  assert.equal(unconfigured.success, false);
  assert.equal(unconfigured.user.mode, 'guest');

  // Configured Google OAuth redirects to Supabase /auth/v1/authorize?provider=google
  saveCloudConfig({
    supabaseUrl: 'https://demo-project.supabase.co',
    supabaseAnonKey: 'anon-123',
    autoSyncEnabled: true,
  });
  let redirectedUrl = '';
  const oauthRes = signInWithGoogleOAuth({
    redirectTo: 'https://app.example.com/studio',
    navigate: (url) => {
      redirectedUrl = url;
    },
  });
  assert.equal(oauthRes.success, true);
  assert.ok(redirectedUrl.includes('https://demo-project.supabase.co/auth/v1/authorize?'));
  assert.ok(redirectedUrl.includes('provider=google'));
  assert.ok(redirectedUrl.includes(encodeURIComponent('https://app.example.com/studio')));

  // Production billing mode disables demo instant topup helper
  const prevBillingMode = process.env.NEXT_PUBLIC_BILLING_MODE;
  process.env.NEXT_PUBLIC_BILLING_MODE = 'production';
  assert.equal(canAllowDemoTopUp(), false);
  process.env.NEXT_PUBLIC_BILLING_MODE = prevBillingMode;

  // Sync wallet snapshot from server endpoint
  const syncRes = await syncWalletFromServer('jwt-token-123', async (input, init) => {
    assert.equal(String(input), '/api/billing/wallet');
    const authHeader = (init?.headers as Record<string, string>)?.Authorization;
    assert.equal(authHeader, 'Bearer jwt-token-123');
    return new Response(
      JSON.stringify({
        wallet: {
          balance: 125,
          trialCredits: 15,
          purchasedCredits: 110,
          transactions: [
            {
              id: 'tx-srv-1',
              type: 'topup',
              amount: 110,
              description: 'PromptPay Starter Pack',
              createdAt: '2026-11-14T00:00:00.000Z',
            },
          ],
        },
      }),
      { status: 200 }
    );
  });
  assert.equal(syncRes.ok, true);
  assert.equal(getCreditBalance(), 125);
  assert.deepEqual(getWalletBreakdown(), {
    balance: 125,
    trialCredits: 15,
    purchasedCredits: 110,
  });

  // applyServerWalletSnapshot keeps consistency
  applyServerWalletSnapshot({ balance: 115, trialCredits: 5, purchasedCredits: 110 });
  assert.equal(getCreditBalance(), 115);
  assert.equal(GUEST_USER.mode, 'guest');
});

// ───────────────────────── 3. 5-Layer Slip Validation Matrix ─────────────────────────

test('5-Layer Slip Security: ยอมรับสลิปถูกต้องและปฏิเสธสลิปปลอม/โอนผิดบัญชี/โอนขาด/ซ้ำ/หมดอายุ', () => {
  const nowMs = Date.parse('2026-11-14T10:00:00.000Z');
  const order = { expectedAmountThb: 99 };

  // EasySlip / SlipOK style normalization + Masked PromptPay matching (`xxx-xxx-5678`)
  const validRaw = {
    success: true,
    data: {
      transRef: '20261114ABC998877',
      amount: { amount: 99 },
      dateTime: '2026-11-14T09:50:00.000Z',
      sendingBank: { short: 'KBANK' },
      receiver: {
        proxy: { value: 'xxx-xxx-5678' },
        account: { name: { en: 'Demo Maker Studio' } },
      },
    },
  };
  const validSlip = normalizeSlipApiPayload(validRaw);
  assert.equal(validSlip.success, true);
  assert.equal(validSlip.amount, 99);
  assert.equal(validSlip.sendingBank, 'KBANK');
  assert.equal(
    validateSlipAgainstOrder(validSlip, order, TEST_BILLING_CONFIG, { nowMs }).valid,
    true
  );

  // 1. Invalid slip
  const badSlip = validateSlipAgainstOrder(
    { ...validSlip, success: false },
    order,
    TEST_BILLING_CONFIG,
    { nowMs }
  );
  assert.equal(badSlip.valid, false);
  assert.equal(badSlip.code, 'SLIP_INVALID');

  // 2. Wrong receiver PromptPay
  const wrongReceiver = validateSlipAgainstOrder(
    { ...validSlip, receiverIds: ['0899999999'] },
    order,
    TEST_BILLING_CONFIG,
    { nowMs }
  );
  assert.equal(wrongReceiver.valid, false);
  assert.equal(wrongReceiver.code, 'SLIP_RECEIVER_MISMATCH');

  // Wrong masked suffix
  const wrongMasked = validateSlipAgainstOrder(
    { ...validSlip, receiverIds: ['xxx-xxx-9999'] },
    order,
    TEST_BILLING_CONFIG,
    { nowMs }
  );
  assert.equal(wrongMasked.valid, false);
  assert.equal(wrongMasked.code, 'SLIP_RECEIVER_MISMATCH');

  // Wrong receiver name
  const wrongName = validateSlipAgainstOrder(
    { ...validSlip, receiverNames: ['Scammer Account'] },
    order,
    TEST_BILLING_CONFIG,
    { nowMs }
  );
  assert.equal(wrongName.valid, false);
  assert.equal(wrongName.code, 'SLIP_RECEIVER_MISMATCH');

  // 3. Underpaid amount
  const underpaid = validateSlipAgainstOrder(
    { ...validSlip, amount: 49 },
    order,
    TEST_BILLING_CONFIG,
    { nowMs }
  );
  assert.equal(underpaid.valid, false);
  assert.equal(underpaid.code, 'SLIP_AMOUNT_MISMATCH');

  // 4. Duplicate transRef replay attack -> 409
  const duplicate = validateSlipAgainstOrder(validSlip, order, TEST_BILLING_CONFIG, {
    existingTransRefUsed: true,
    nowMs,
  });
  assert.equal(duplicate.valid, false);
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.code, 'SLIP_DUPLICATE_REF');

  // 5. Expired slip (> 24h)
  const expired = validateSlipAgainstOrder(
    { ...validSlip, timestampIso: '2026-11-12T08:00:00.000Z' },
    order,
    TEST_BILLING_CONFIG,
    { nowMs }
  );
  assert.equal(expired.valid, false);
  assert.equal(expired.code, 'SLIP_EXPIRED');
});

// ───────────────────────── 4. Billing Endpoints & Auth 401 Gate ─────────────────────────

test('Billing API Routes: ปฏิเสธ 401 เมื่อยังไม่ล็อกอิน และผ่าน Flow สร้าง QR -> อัปโหลดสลิป -> ป้องกันใช้ซ้ำ', async () => {
  // 401 on all 3 unauthenticated endpoints
  const unauthWallet = await walletGET(new Request('http://localhost/api/billing/wallet'));
  assert.equal(unauthWallet.status, 401);

  const unauthOrder = await createOrderPOST(
    new Request('http://localhost/api/billing/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packageId: 'pkg-starter' }),
    })
  );
  assert.equal(unauthOrder.status, 401);

  const unauthSlip = await verifySlipPOST(
    new Request('http://localhost/api/billing/verify-slip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: 'ord-1', slipBase64: 'AAAA' }),
    })
  );
  assert.equal(unauthSlip.status, 401);

  const nowMs = Date.parse('2026-11-14T10:00:00.000Z');
  let orderStatus: 'pending' | 'paid' = 'pending';
  const usedRefs = new Set<string>();

  const mockFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url === 'https://test-project.supabase.co/auth/v1/user') {
      const authHeader = (init?.headers as Record<string, string>)?.Authorization;
      if (authHeader === 'Bearer valid-google-jwt') {
        return new Response(
          JSON.stringify({
            id: '11111111-1111-4111-8111-111111111111',
            email: 'artist@gmail.com',
            user_metadata: { full_name: 'Indie Artist' },
          }),
          { status: 200 }
        );
      }
      return new Response('Unauthorized', { status: 401 });
    }

    if (url.endsWith('/rest/v1/rpc/init_user_wallet')) {
      return new Response(
        JSON.stringify([
          {
            user_id: '11111111-1111-4111-8111-111111111111',
            trial_credits: 15,
            purchased_credits: orderStatus === 'paid' ? 110 : 0,
            balance: orderStatus === 'paid' ? 125 : 15,
          },
        ]),
        { status: 200 }
      );
    }

    if (url.includes('/rest/v1/credit_transactions?trans_ref=eq.')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }

    if (url.includes('/rest/v1/credit_transactions?user_id=eq.')) {
      return new Response(
        JSON.stringify(
          orderStatus === 'paid'
            ? [
                {
                  id: 'tx-2',
                  tx_type: 'topup',
                  amount: 110,
                  description: 'PromptPay Starter Pack',
                  created_at: '2026-11-14T09:59:00.000Z',
                },
              ]
            : []
        ),
        { status: 200 }
      );
    }

    if (url === 'https://test-project.supabase.co/rest/v1/topup_orders' && init?.method === 'POST') {
      const payload = JSON.parse(String(init.body || '{}')) as Record<string, unknown>;
      return new Response(
        JSON.stringify([
          {
            id: 'ord-999',
            ...payload,
            created_at: '2026-11-14T09:45:00.000Z',
            expires_at: '2026-11-15T09:45:00.000Z',
          },
        ]),
        { status: 201 }
      );
    }

    if (url.includes('/rest/v1/topup_orders?id=eq.ord-999')) {
      return new Response(
        JSON.stringify([
          {
            id: 'ord-999',
            user_id: '11111111-1111-4111-8111-111111111111',
            package_id: 'pkg-starter',
            expected_amount_thb: 99,
            credits_to_grant: 110,
            promptpay_payload: '000201...',
            status: orderStatus,
            trans_ref: orderStatus === 'paid' ? 'REF-OK-99' : null,
            created_at: '2026-11-14T09:45:00.000Z',
            expires_at: '2026-11-15T09:45:00.000Z',
          },
        ]),
        { status: 200 }
      );
    }

    if (url.includes('/rest/v1/topup_orders?trans_ref=eq.')) {
      const ref = decodeURIComponent(url.split('trans_ref=eq.')[1].split('&')[0]);
      return new Response(
        JSON.stringify(usedRefs.has(ref) ? [{ id: 'ord-999' }] : []),
        { status: 200 }
      );
    }

    if (url === 'https://api.slip-provider.test/v1/verify') {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            transRef: 'REF-OK-99',
            amount: 99,
            dateTime: '2026-11-14T09:58:00.000Z',
            sendingBank: 'SCB',
            receiver: {
              proxy: { value: '0812345678' },
              displayName: 'Demo Maker Studio',
            },
          },
        }),
        { status: 200 }
      );
    }

    if (url.endsWith('/rest/v1/rpc/atomic_credit_topup_from_slip')) {
      const body = JSON.parse(String(init?.body || '{}')) as { p_trans_ref?: string };
      if (body.p_trans_ref && usedRefs.has(body.p_trans_ref)) {
        return new Response(
          JSON.stringify([{ success: false, error_code: 'SLIP_DUPLICATE_REF' }]),
          { status: 200 }
        );
      }
      if (body.p_trans_ref) usedRefs.add(body.p_trans_ref);
      orderStatus = 'paid';
      return new Response(
        JSON.stringify([
          {
            success: true,
            trial_credits: 15,
            purchased_credits: 110,
            balance: 125,
          },
        ]),
        { status: 200 }
      );
    }

    return new Response('Unhandled mock route: ' + url, { status: 404 });
  };

  // Wallet endpoint happy path
  const walletRes = await handleGetWalletRequest(
    new Request('http://localhost/api/billing/wallet', {
      headers: { Authorization: 'Bearer valid-google-jwt' },
    }),
    { fetchFn: mockFetch as typeof fetch, config: TEST_BILLING_CONFIG }
  );
  assert.equal(walletRes.status, 200);
  const walletJson = (await walletRes.json()) as { wallet: { balance: number } };
  assert.equal(walletJson.wallet.balance, 15);

  // Create order rejects unknown package
  const badPkgRes = await handleCreateOrderRequest(
    new Request('http://localhost/api/billing/create-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-google-jwt',
      },
      body: JSON.stringify({ packageId: 'pkg-hacker', priceThb: 1 }),
    }),
    { fetchFn: mockFetch as typeof fetch, config: TEST_BILLING_CONFIG }
  );
  assert.equal(badPkgRes.status, 400);

  // Create order uses server authoritative Starter Pack price (99 THB / 110 Credits)
  const orderRes = await handleCreateOrderRequest(
    new Request('http://localhost/api/billing/create-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-google-jwt',
      },
      body: JSON.stringify({ packageId: 'pkg-starter', priceThb: 1 }),
    }),
    { fetchFn: mockFetch as typeof fetch, config: TEST_BILLING_CONFIG }
  );
  assert.equal(orderRes.status, 200);
  const orderJson = (await orderRes.json()) as {
    orderId: string;
    amountThb: number;
    creditsToGrant: number;
    qrSvgDataUrl: string;
    promptpayPayload: string;
  };
  assert.equal(orderJson.amountThb, 99);
  assert.equal(orderJson.creditsToGrant, 110);
  assert.ok(orderJson.qrSvgDataUrl.startsWith('data:image/svg+xml'));
  assert.ok(orderJson.promptpayPayload.includes('540599.00'));

  // Reject oversized slip (> 4MB)
  const hugeBytes = new Uint8Array(MAX_SLIP_FILE_BYTES + 128);
  const bigRes = await handleVerifySlipRequest(
    new Request('http://localhost/api/billing/verify-slip', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-google-jwt',
      },
      body: JSON.stringify({
        orderId: 'ord-999',
        mimeType: 'image/png',
        slipBase64: Buffer.from(hugeBytes).toString('base64'),
      }),
    }),
    { fetchFn: mockFetch as typeof fetch, config: TEST_BILLING_CONFIG, nowMs }
  );
  assert.equal(bigRes.status, 400);

  // Verify valid slip grants 110 credits
  const smallPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const form = new FormData();
  form.append('orderId', 'ord-999');
  form.append('file', new Blob([smallPng], { type: 'image/png' }), 'slip.png');

  const verifyRes = await handleVerifySlipRequest(
    new Request('http://localhost/api/billing/verify-slip', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-google-jwt' },
      body: form,
    }),
    { fetchFn: mockFetch as typeof fetch, config: TEST_BILLING_CONFIG, nowMs }
  );
  assert.equal(verifyRes.status, 200);
  const verifyJson = (await verifyRes.json()) as {
    success: boolean;
    creditedAmount: number;
    transRef: string;
    wallet: { balance: number; purchasedCredits: number };
  };
  assert.equal(verifyJson.success, true);
  assert.equal(verifyJson.creditedAmount, 110);
  assert.equal(verifyJson.transRef, 'REF-OK-99');
  assert.equal(verifyJson.wallet.balance, 125);
  assert.equal(verifyJson.wallet.purchasedCredits, 110);

  // Re-submitting against settled order must fail with 409 Conflict
  const replayForm = new FormData();
  replayForm.append('orderId', 'ord-999');
  replayForm.append('file', new Blob([smallPng], { type: 'image/png' }), 'slip.png');
  const replayRes = await handleVerifySlipRequest(
    new Request('http://localhost/api/billing/verify-slip', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-google-jwt' },
      body: replayForm,
    }),
    { fetchFn: mockFetch as typeof fetch, config: TEST_BILLING_CONFIG, nowMs }
  );
  assert.equal(replayRes.status, 409);
});

// ───────────────────────── 5. SQL Migration, .env & UI Contracts ─────────────────────────

test('Phase 5F Migration, Env & UI Contracts: ครบถ้วนทุกไฟล์และ Security Gates', () => {
  const root = process.cwd();
  const migrationSql = fs.readFileSync(
    path.join(root, 'supabase', 'migrations', '20261114_phase5f_wallet_billing.sql'),
    'utf-8'
  );
  assert.ok(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.user_wallets'));
  assert.ok(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.credit_transactions'));
  assert.ok(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.topup_orders'));
  assert.ok(migrationSql.includes('trans_ref text UNIQUE'));
  assert.ok(migrationSql.includes('ENABLE ROW LEVEL SECURITY'));
  assert.ok(migrationSql.includes('atomic_deduct_credits'));
  assert.ok(migrationSql.includes('atomic_credit_topup_from_slip'));

  const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf-8');
  assert.ok(envExample.includes('SUPABASE_SERVICE_ROLE_KEY='));
  assert.ok(envExample.includes('PROMPTPAY_RECEIVER_ID='));
  assert.ok(envExample.includes('SLIP_VERIFY_API_URL='));
  assert.ok(envExample.includes('SLIP_VERIFY_API_KEY='));
  assert.ok(envExample.includes('NEXT_PUBLIC_BILLING_MODE='));

  const accountModalSrc = fs.readFileSync(
    path.join(root, 'src', 'components', 'AccountSyncModal.tsx'),
    'utf-8'
  );
  assert.ok(accountModalSrc.includes('signInWithGoogleOAuth'));
  assert.ok(accountModalSrc.includes('เข้าสู่ระบบด้วย Google'));
  assert.ok(accountModalSrc.includes('Vocal Booth'));

  const advanceModalSrc = fs.readFileSync(
    path.join(root, 'src', 'components', 'AdvanceModeModal.tsx'),
    'utf-8'
  );
  assert.ok(advanceModalSrc.includes('เข้าสู่ระบบด้วย Google เพื่อเติมเครดิต'));
  assert.ok(advanceModalSrc.includes('/api/billing/create-order'));
  assert.ok(advanceModalSrc.includes('/api/billing/verify-slip'));
  assert.ok(advanceModalSrc.includes('4MB'));
  assert.ok(advanceModalSrc.includes('demoTopUpAllowed'));
});

// ───────────────────────── 6. Pre-Production Hardening Audit ─────────────────────────

test('Pre-Production Hardening: Production mode บังคับ Auth/Billing ครบทั้ง 6 AI routes + Auto-Refund + Songs SQL Migration', async () => {
  // 6a. Production mode without Supabase keys fails closed with 503
  const missingServerCfg: ServerBillingConfig = {
    ...TEST_BILLING_CONFIG,
    supabaseUrl: '',
    serviceRoleKey: '',
    billingMode: 'production',
  };
  const missingRes = await tryServerBillingPreDeduct(
    new Request('http://localhost/api/advance/lyrics', { method: 'POST' }),
    1,
    'test',
    { config: missingServerCfg }
  );
  assert.equal(missingRes.active, true);
  if (missingRes.active && 'errorStatus' in missingRes) {
    assert.equal(missingRes.errorStatus, 503);
    assert.equal(missingRes.errorCode, 'BILLING_NOT_CONFIGURED');
  }

  // 6b. Production mode without Bearer token rejects ALL 6 AI routes with HTTP 401
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevSrv = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const prevMode = process.env.NEXT_PUBLIC_BILLING_MODE;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test-project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  process.env.NEXT_PUBLIC_BILLING_MODE = 'production';

  try {
    const rArchitect = await architectPOST(
      new Request('http://localhost/api/advance/architect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: 'กาแฟยามเช้า' }),
      })
    );
    assert.equal(rArchitect.status, 401, 'architect must reject unauthenticated callers in production');

    const rDirector = await directorPOST(
      new Request('http://localhost/api/advance/director', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'ทำให้ท่อน chorus เร้าอารมณ์ขึ้น',
          songSummary: { bpm: 84, baseKey: 'C', timeSignature: '4/4', sections: [] },
        }),
      })
    );
    assert.equal(rDirector.status, 401, 'director must reject unauthenticated callers in production');

    const rHum = await humPOST(
      new Request('http://localhost/api/advance/hum-to-song', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: 'UklGRg==',
          mimeType: 'audio/wav',
          durationSec: 4,
        }),
      })
    );
    assert.equal(rHum.status, 401, 'hum-to-song must reject unauthenticated callers in production');

    const rLyrics = await lyricsPOST(
      new Request('http://localhost/api/advance/lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mood: 'warm',
          topic: 'สายลม',
          chordProgression: ['C', 'G'],
          sectionType: 'verse',
        }),
      })
    );
    assert.equal(rLyrics.status, 401, 'lyrics must reject unauthenticated callers in production');

    const rRef = await refPOST(
      new Request('http://localhost/api/advance/reference-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Acoustic ballad C G Am F' }),
      })
    );
    assert.equal(rRef.status, 401, 'reference-track must reject unauthenticated callers in production');

    const rTts = await ttsPOST(
      new Request('http://localhost/api/advance/tts-cue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'สวัสดีครับ', bpm: 84 }),
      })
    );
    assert.equal(rTts.status, 401, 'tts-cue must reject unauthenticated callers in production');
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = prevSrv;
    process.env.NEXT_PUBLIC_BILLING_MODE = prevMode;
  }

  // 6c. Shared refundServerBillingOnFailure refunds credits cleanly after pre-deduct
  const mockBillingFetch = async (input: string | URL | Request): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: 'user-uuid-1', email: 'test@gmail.com' }), {
        status: 200,
      });
    }
    if (url.endsWith('/rest/v1/rpc/atomic_deduct_credits')) {
      return new Response(
        JSON.stringify([{ success: true, trial_credits: 11, purchased_credits: 0, balance: 11 }]),
        { status: 200 }
      );
    }
    if (url.endsWith('/rest/v1/rpc/atomic_refund_credits')) {
      return new Response(
        JSON.stringify([{ success: true, trial_credits: 15, purchased_credits: 0, balance: 15 }]),
        { status: 200 }
      );
    }
    return new Response('Not found', { status: 404 });
  };

  const preDeducted = await tryServerBillingPreDeduct(
    new Request('http://localhost/api/advance/architect', {
      method: 'POST',
      headers: { Authorization: 'Bearer jwt-abc' },
    }),
    4,
    'Architect test',
    { config: TEST_BILLING_CONFIG, fetchFn: mockBillingFetch as typeof fetch }
  );
  assert.equal(preDeducted.active, true);
  if (preDeducted.active && 'wallet' in preDeducted) {
    assert.equal(preDeducted.wallet.balance, 11);
  }
  const refunded = await refundServerBillingOnFailure(
    preDeducted,
    4,
    'Refund Architect failure',
    { config: TEST_BILLING_CONFIG, fetchFn: mockBillingFetch as typeof fetch }
  );
  assert.deepEqual(refunded, { balance: 15, trialCredits: 15, purchasedCredits: 0 });

  // 6d. Cloud Songs SQL migration & all frontend AI caller wiring contracts
  const root = process.cwd();
  const songsMigrationSql = fs.readFileSync(
    path.join(root, 'supabase', 'migrations', '20261114_phase4d_cloud_songs.sql'),
    'utf-8'
  );
  assert.ok(songsMigrationSql.includes('CREATE TABLE IF NOT EXISTS public.songs'));
  assert.ok(songsMigrationSql.includes('PRIMARY KEY (user_id, id)'));
  assert.ok(songsMigrationSql.includes('ENABLE ROW LEVEL SECURITY'));

  for (const componentName of ['EasyModeStarterModal.tsx', 'MiniPianoRollModal.tsx', 'AdvanceModeModal.tsx']) {
    const src = fs.readFileSync(path.join(root, 'src', 'components', componentName), 'utf-8');
    assert.ok(src.includes('getAuthAccessToken'), `${componentName} must attach Bearer token`);
    assert.ok(src.includes('applyServerWalletSnapshot'), `${componentName} must sync server wallet response`);
  }

  for (const routeName of ['architect', 'director', 'hum-to-song', 'lyrics', 'reference-track', 'tts-cue']) {
    const src = fs.readFileSync(
      path.join(root, 'src', 'app', 'api', 'advance', routeName, 'route.ts'),
      'utf-8'
    );
    assert.ok(src.includes('tryServerBillingPreDeduct'), `${routeName}/route.ts must enforce tryServerBillingPreDeduct`);
    assert.ok(src.includes('refundServerBillingOnFailure'), `${routeName}/route.ts must auto-refund via refundServerBillingOnFailure`);
  }
});

// ───────────────────────── 7. Production Readiness, /api/health & Token Refresh ─────────────────────────

test('Activation Readiness: evaluateProductionReadiness, /api/health, ALL_IN_ONE_SETUP.sql & OAuth Token Refresh', async () => {
  // 7a. evaluateProductionReadiness flags missing vars without exposing secret strings
  const incomplete = evaluateProductionReadiness({
    GEMINI_API_KEY: 'secret-gemini-should-not-appear',
    NEXT_PUBLIC_BILLING_MODE: 'standalone',
  });
  assert.equal(incomplete.billingMode, 'standalone');
  assert.equal(incomplete.productionReady, false);
  assert.equal(incomplete.checks.geminiApiKey, true);
  assert.ok(incomplete.missingForProduction.includes('NEXT_PUBLIC_SUPABASE_URL'));
  assert.ok(!JSON.stringify(incomplete).includes('secret-gemini-should-not-appear'));

  // Catches invalid PromptPay digits & duplicate anon/service role key
  const badKeys = evaluateProductionReadiness({
    GEMINI_API_KEY: 'g-key',
    NEXT_PUBLIC_SUPABASE_URL: 'https://demo.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'same-key',
    SUPABASE_SERVICE_ROLE_KEY: 'same-key',
    PROMPTPAY_RECEIVER_ID: '123',
    PROMPTPAY_RECEIVER_NAME: 'Demo Maker',
    SLIP_VERIFY_API_URL: 'https://api.slipok.com/verify',
    SLIP_VERIFY_API_KEY: 'slip-key',
    NEXT_PUBLIC_BILLING_MODE: 'production',
  });
  assert.equal(badKeys.productionReady, false);
  assert.equal(badKeys.checks.supabaseKeysDistinct, false);
  assert.equal(badKeys.checks.promptPayReceiverValid, false);

  // Valid complete production env
  const healthRes = handleHealthRequest({
    GEMINI_API_KEY: 'g-secret',
    GEMINI_MODEL: 'gemini-3.8-flash',
    NEXT_PUBLIC_SUPABASE_URL: 'https://demo.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    PROMPTPAY_RECEIVER_ID: '0812345678',
    PROMPTPAY_RECEIVER_NAME: 'Demo Maker Studio',
    SLIP_VERIFY_API_URL: 'https://api.slipok.com/verify',
    SLIP_VERIFY_API_KEY: 'slip-secret',
    NEXT_PUBLIC_BILLING_MODE: 'production',
  });
  assert.equal(healthRes.status, 200);
  const healthJson = (await healthRes.json()) as {
    ok: boolean;
    productionReady: boolean;
    billingReady: boolean;
    missingForProduction: string[];
  };
  assert.equal(healthJson.ok, true);
  assert.equal(healthJson.productionReady, true);
  assert.equal(healthJson.billingReady, true);
  assert.deepEqual(healthJson.missingForProduction, []);

  // 7b. isProductionBillingEnabled trims/lowercases env safely
  const prevBilling = process.env.NEXT_PUBLIC_BILLING_MODE;
  process.env.NEXT_PUBLIC_BILLING_MODE = ' Production ';
  assert.equal(isProductionBillingEnabled(), true);
  process.env.NEXT_PUBLIC_BILLING_MODE = prevBilling;

  // 7c. ALL_IN_ONE_SETUP.sql combines Phase 4D songs + Phase 5F billing/RPCs
  const root = process.cwd();
  const allInOneSql = fs.readFileSync(path.join(root, 'supabase', 'ALL_IN_ONE_SETUP.sql'), 'utf-8');
  for (const snippet of [
    'CREATE TABLE IF NOT EXISTS public.songs',
    'PRIMARY KEY (user_id, id)',
    'CREATE TABLE IF NOT EXISTS public.user_wallets',
    'CREATE TABLE IF NOT EXISTS public.credit_transactions',
    'CREATE TABLE IF NOT EXISTS public.topup_orders',
    'atomic_deduct_credits',
    'atomic_refund_credits',
    'atomic_credit_topup_from_slip',
  ]) {
    assert.ok(allInOneSql.includes(snippet), `ALL_IN_ONE_SETUP.sql missing ${snippet}`);
  }

  // 7d. refreshAuthSession renews expired access_token cleanly using stored refresh_token
  const storage = installMockLocalStorage();
  saveCloudConfig({
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    autoSyncEnabled: true,
  });
  storage.set(
    'demo_maker_cloud_auth_v1',
    JSON.stringify({
      accessToken: 'expired-jwt',
      refreshToken: 'refresh-123',
      user: { id: 'u1', email: 'artist@gmail.com', displayName: 'Artist', mode: 'authenticated' },
    })
  );

  const refreshed = await refreshAuthSession((async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    assert.ok(url.endsWith('/auth/v1/token?grant_type=refresh_token'));
    assert.equal(JSON.parse(String(init?.body || '{}')).refresh_token, 'refresh-123');
    return new Response(
      JSON.stringify({
        access_token: 'fresh-jwt-999',
        refresh_token: 'refresh-456',
        user: {
          id: 'u1',
          email: 'artist@gmail.com',
          app_metadata: { provider: 'google' },
          user_metadata: { full_name: 'Thai Songwriter' },
        },
      }),
      { status: 200 }
    );
  }) as typeof fetch);

  assert.ok(refreshed);
  assert.equal(refreshed.accessToken, 'fresh-jwt-999');
  assert.equal(refreshed.user.displayName, 'Thai Songwriter');
  assert.equal(getAuthAccessToken(), 'fresh-jwt-999');

  // syncWalletFromServer exposes HTTP status (401) for auto-refresh fallback
  const expiredWalletRes = await syncWalletFromServer('expired-jwt', (async () =>
    new Response(JSON.stringify({ error: 'Token expired' }), { status: 401 })) as typeof fetch);
  assert.equal(expiredWalletRes.ok, false);
  assert.equal(expiredWalletRes.status, 401);

  // 7e. Modern Supabase sb_publishable_* & sb_secret_* keys never send sb_secret_* as Authorization Bearer JWT
  let observedRpcHeaders: Record<string, string> = {};
  const sbKeyConfig: ServerBillingConfig = {
    ...TEST_BILLING_CONFIG,
    supabaseAnonKey: 'sb_publishable_demo_key',
    serviceRoleKey: 'sb_secret_demo_key',
  };
  const sbWalletRes = await handleGetWalletRequest(
    new Request('http://localhost/api/billing/wallet', {
      headers: { Authorization: 'Bearer user-google-jwt' },
    }),
    {
      config: sbKeyConfig,
      fetchFn: (async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const hdrs = (init?.headers || {}) as Record<string, string>;
        if (url.endsWith('/auth/v1/user')) {
          return new Response(JSON.stringify({ id: 'u1', email: 'test@gmail.com' }), { status: 200 });
        }
        if (url.endsWith('/rest/v1/rpc/init_user_wallet')) {
          observedRpcHeaders = hdrs;
          return new Response(JSON.stringify([{ trial_credits: 15, purchased_credits: 0, balance: 15 }]), {
            status: 200,
          });
        }
        if (url.includes('/rest/v1/credit_transactions')) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        return new Response('Not found', { status: 404 });
      }) as typeof fetch,
    }
  );
  assert.equal(sbWalletRes.status, 200);
  assert.equal(observedRpcHeaders.apikey, 'sb_secret_demo_key');
  assert.equal(observedRpcHeaders.Authorization, undefined);

  // 7f. Provider-specific slip multipart dispatch (EasySlip vs SlipOK)
  const tinyBytes = new Uint8Array([1, 2, 3, 4]);
  let easyHeaders: Record<string, string> = {};
  let easyKeys: string[] = [];
  await verifySlipImageWithProvider(
    { bytes: tinyBytes, mimeType: 'image/png', fileName: 'slip.png', amountThb: 99 },
    { ...TEST_BILLING_CONFIG, slipVerifyApiUrl: 'https://api.easyslip.com/v1/verify', slipVerifyApiKey: 'es-key' },
    (async (_url: string | URL | Request, init?: RequestInit) => {
      easyHeaders = (init?.headers || {}) as Record<string, string>;
      easyKeys = Array.from((init?.body as FormData).keys());
      return new Response(JSON.stringify({ status: 200, data: { transRef: 'ES-1', amount: { amount: 99 } } }), { status: 200 });
    }) as typeof fetch
  );
  assert.equal(easyHeaders.Authorization, 'Bearer es-key');
  assert.deepEqual(easyKeys, ['file']);

  let slipOkHeaders: Record<string, string> = {};
  let slipOkKeys: string[] = [];
  await verifySlipImageWithProvider(
    { bytes: tinyBytes, mimeType: 'image/png', fileName: 'slip.png', amountThb: 99 },
    { ...TEST_BILLING_CONFIG, slipVerifyApiUrl: 'https://api.slipok.com/api/line/apikey/123', slipVerifyApiKey: 'ok-key' },
    (async (_url: string | URL | Request, init?: RequestInit) => {
      slipOkHeaders = (init?.headers || {}) as Record<string, string>;
      slipOkKeys = Array.from((init?.body as FormData).keys());
      return new Response(JSON.stringify({ success: true, data: { transRef: 'OK-1', amount: 99 } }), { status: 200 });
    }) as typeof fetch
  );
  assert.equal(slipOkHeaders['x-authorization'], 'ok-key');
  assert.deepEqual(slipOkKeys, ['files', 'amount', 'log']);
});

test('Phase 5F Fallback: serverWallet falls back cleanly to PostgREST tables when RPC hits SQL 42702 ambiguity', async () => {
  const walletState = new Map<string, { trial_credits: number; purchased_credits: number }>();
  const ledgerRows: Array<Record<string, unknown>> = [];

  const mock42702Fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString();
    const method = (init?.method || 'GET').toUpperCase();
    const bodyText = typeof init?.body === 'string' ? init.body : '';

    if (url.includes('/rest/v1/rpc/')) {
      return new Response(
        JSON.stringify({
          code: '42702',
          details: 'It could refer to either a PL/pgSQL variable or a table column.',
          message: 'column reference "user_id" is ambiguous',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.includes('/rest/v1/user_wallets')) {
      const uidMatch = url.match(/user_id=eq\.([^&]+)/);
      const uid = uidMatch ? decodeURIComponent(uidMatch[1]) : 'u-fallback-1';
      if (method === 'GET') {
        const row = walletState.get(uid);
        return new Response(
          JSON.stringify(row ? [{ user_id: uid, ...row, updated_at: '2026-11-16T03:00:00Z' }] : []),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (method === 'POST') {
        const parsed = JSON.parse(bodyText) as { user_id: string; trial_credits: number; purchased_credits: number };
        if (!walletState.has(parsed.user_id)) {
          walletState.set(parsed.user_id, {
            trial_credits: parsed.trial_credits,
            purchased_credits: parsed.purchased_credits,
          });
          return new Response(JSON.stringify([parsed]), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (method === 'PATCH') {
        const patch = JSON.parse(bodyText) as { trial_credits?: number; purchased_credits?: number };
        const existing = walletState.get(uid) ?? { trial_credits: 15, purchased_credits: 0 };
        walletState.set(uid, {
          trial_credits: patch.trial_credits ?? existing.trial_credits,
          purchased_credits: patch.purchased_credits ?? existing.purchased_credits,
        });
        return new Response(null, { status: 204 });
      }
    }

    if (url.includes('/rest/v1/credit_transactions')) {
      if (method === 'POST') {
        ledgerRows.push(JSON.parse(bodyText) as Record<string, unknown>);
        return new Response('', { status: 201 });
      }
      if (method === 'GET') {
        return new Response(JSON.stringify(ledgerRows), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response('Not found', { status: 404 });
  }) as typeof fetch;

  const initialized = await getOrInitWallet('u-fallback-1', {
    config: TEST_BILLING_CONFIG,
    fetchFn: mock42702Fetch,
  });
  assert.equal(initialized.balance, 15);
  assert.equal(initialized.trialCredits, 15);
  assert.equal(initialized.transactions.length, 1);
  assert.equal(initialized.transactions[0].type, 'grant_trial');

  const deducted = await atomicDeductCredits('u-fallback-1', 4, 'Easy Mode Test', {
    modelId: 'gemini-4-hydrogen',
    config: TEST_BILLING_CONFIG,
    fetchFn: mock42702Fetch,
  });
  assert.equal(deducted.success, true);
  assert.equal(deducted.balance, 11);
  assert.equal(deducted.trialCredits, 11);

  const refunded = await atomicRefundCredits('u-fallback-1', 4, 'Auto-refund Test', {
    modelId: 'gemini-4-hydrogen',
    config: TEST_BILLING_CONFIG,
    fetchFn: mock42702Fetch,
  });
  assert.equal(refunded.success, true);
  assert.equal(refunded.balance, 15);
  assert.equal(refunded.trialCredits, 15);
  assert.equal(ledgerRows.length, 3);
});
