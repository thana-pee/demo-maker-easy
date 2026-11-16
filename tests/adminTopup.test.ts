import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseAdminEmails,
  verifyAdminRequest,
} from '../src/lib/serverAdminAuth';
import {
  extractUserDisplayName,
  summarizeTopupDashboard,
  executeAdminManualTopup,
  type RawAuthUser,
  type RawOrderRow,
  type RawTxRow,
  type RawWalletRow,
} from '../src/lib/serverTopupAdmin';
import {
  handleGetAdminTopupRequest,
  handlePostAdminTopupRequest,
} from '../src/app/api/admin/topup/route';
import {
  getServerBillingConfig,
  type ServerBillingConfig,
} from '../src/lib/serverWallet';

function makeMockConfig(overrides?: Partial<ServerBillingConfig>): ServerBillingConfig {
  return {
    ...getServerBillingConfig(),
    supabaseUrl: 'https://mock-supabase.supabase.co',
    supabaseAnonKey: 'mock-anon-key',
    serviceRoleKey: 'mock-service-role-key',
    billingMode: 'standalone',
    ...overrides,
  };
}

test('serverAdminAuth: parseAdminEmails handles spaces, commas, semicolons and duplicates', () => {
  assert.equal(extractUserDisplayName({ id: 'u123', email: 'owner@studio.com' }), 'owner');
  const parsed = parseAdminEmails('Admin@Example.COM, dev@test.co ; admin@example.com, invalid-email');
  assert.equal(parsed.length, 2);
  assert.ok(parsed.includes('admin@example.com'));
  assert.ok(parsed.includes('dev@test.co'));
});

test('serverAdminAuth: verifyAdminRequest enforces static key and rejects unauthorized', async () => {
  const config = makeMockConfig();

  // 1. Missing header / token -> 401
  const reqUnauth = new Request('https://app.test/api/admin/topup');
  const resUnauth = await verifyAdminRequest(reqUnauth, { config, adminKey: 'secret-key-123' });
  assert.equal(resUnauth.authorized, false);
  assert.equal(resUnauth.status, 401);

  // 2. Matching x-analytics-key -> 200
  const reqKey = new Request('https://app.test/api/admin/topup', {
    headers: { 'x-analytics-key': 'secret-key-123' },
  });
  const resKey = await verifyAdminRequest(reqKey, { config, adminKey: 'secret-key-123' });
  assert.equal(resKey.authorized, true);
  assert.equal(resKey.authMethod, 'admin-key');
});

test('serverAdminAuth: verifyAdminRequest checks Google JWT against admin emails', async () => {
  const config = makeMockConfig();
  const mockJwt = 'mock.jwt.header';

  const mockFetch = (async (url: string | URL | Request) => {
    const urlStr = String(url);
    if (urlStr.includes('/auth/v1/user')) {
      return new Response(
        JSON.stringify({
          id: 'user-admin-1',
          email: 'admin@studio.com',
          user_metadata: { full_name: 'Studio Owner' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;

  // Matching admin email
  const reqAuthorized = new Request('https://app.test/api/admin/topup', {
    headers: { Authorization: `Bearer ${mockJwt}` },
  });
  const authOk = await verifyAdminRequest(reqAuthorized, {
    config,
    adminEmails: 'admin@studio.com, other@studio.com',
    fetchFn: mockFetch,
  });
  assert.equal(authOk.authorized, true);
  assert.equal(authOk.authMethod, 'google-admin');
  assert.equal(authOk.viewerEmail, 'admin@studio.com');

  // Forbidden non-admin email
  const authForbidden = await verifyAdminRequest(reqAuthorized, {
    config,
    adminEmails: 'someone-else@studio.com',
    fetchFn: mockFetch,
  });
  assert.equal(authForbidden.authorized, false);
  assert.equal(authForbidden.status, 403);
});

test('serverTopupAdmin: summarizeTopupDashboard aggregates KPIs, Top Spenders, and Recent Topups', () => {
  const users: RawAuthUser[] = [
    { id: 'u1', email: 'alice@test.com', user_metadata: { full_name: 'Alice Songwriter' } },
    { id: 'u2', email: 'bob@test.com', user_metadata: { full_name: 'Bob Producer' } },
    { id: 'u3', email: 'charlie@test.com', user_metadata: { full_name: 'Charlie Guest' } },
  ];

  const wallets: RawWalletRow[] = [
    { user_id: 'u1', trial_credits: 5, purchased_credits: 500 },
    { user_id: 'u2', trial_credits: 15, purchased_credits: 100 },
    { user_id: 'u3', trial_credits: 15, purchased_credits: 0 },
  ];

  const transactions: RawTxRow[] = [
    {
      id: 'tx-1',
      user_id: 'u1',
      tx_type: 'topup',
      amount: 500,
      description: '[Admin Manual Topup] VIP Test',
      created_at: '2026-11-16T10:00:00.000Z',
    },
    {
      id: 'tx-2',
      user_id: 'u2',
      tx_type: 'topup',
      amount: 100,
      description: 'PromptPay Topup package 100 Cr',
      trans_ref: 'SLIP-999888',
      created_at: '2026-11-16T11:00:00.000Z',
    },
  ];

  const orders: RawOrderRow[] = [
    {
      id: 'ord-1',
      user_id: 'u2',
      expected_amount_thb: 99,
      credits_to_grant: 100,
      status: 'paid',
      created_at: '2026-11-16T11:00:00.000Z',
    },
  ];

  const report = summarizeTopupDashboard({ users, wallets, transactions, orders });

  // KPI checks
  assert.equal(report.kpi.totalTopupRevenueThb, 99);
  assert.equal(report.kpi.totalTopupCreditsGranted, 600);
  assert.equal(report.kpi.totalPurchasedCreditsInCirculation, 600);
  assert.equal(report.kpi.totalTrialCreditsInCirculation, 35);
  assert.equal(report.kpi.totalPayingUsers, 2);
  assert.equal(report.kpi.totalRegisteredUsers, 3);

  // Top Spenders checks (Alice topped up 500 Cr, Bob topped up 100 Cr)
  assert.equal(report.topSpenders.length, 2);
  assert.equal(report.topSpenders[0].userId, 'u1');
  assert.equal(report.topSpenders[0].rank, 1);
  assert.equal(report.topSpenders[0].totalCreditsToppedUp, 500);
  assert.equal(report.topSpenders[0].displayName, 'Alice Songwriter');

  assert.equal(report.topSpenders[1].userId, 'u2');
  assert.equal(report.topSpenders[1].rank, 2);
  assert.equal(report.topSpenders[1].totalCreditsToppedUp, 100);
  assert.equal(report.topSpenders[1].totalPaidThb, 99);

  // Recent Topups checks
  assert.equal(report.recentTopups.length, 2);
  // Sort order is desc by created_at: tx-2 is 11:00, tx-1 is 10:00
  assert.equal(report.recentTopups[0].id, 'tx-2');
  assert.equal(report.recentTopups[0].isManual, false);
  assert.equal(report.recentTopups[1].id, 'tx-1');
  assert.equal(report.recentTopups[1].isManual, true);
});

test('serverTopupAdmin: executeAdminManualTopup validates inputs and updates wallet', async () => {
  const config = makeMockConfig();

  // Test invalid amount
  const resBadAmt = await executeAdminManualTopup({
    targetUserIdOrEmail: 'u1',
    amount: -10,
    config,
  });
  assert.equal(resBadAmt.success, false);
  assert.equal(resBadAmt.status, 400);

  // Test mock user topup
  let patchedWalletBody: Record<string, unknown> | null = null;
  let insertedTxBody: Record<string, unknown> | null = null;

  const mockFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = String(url);
    if (urlStr.includes('/auth/v1/admin/users')) {
      return new Response(
        JSON.stringify({
          users: [
            {
              id: 'u-target-123',
              email: 'producer@studio.com',
              user_metadata: { full_name: 'Super Producer' },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (urlStr.includes('/rest/v1/user_wallets') && init?.method === 'PATCH') {
      patchedWalletBody = JSON.parse(String(init.body));
      return new Response(null, { status: 204 });
    }
    if (urlStr.includes('/rest/v1/user_wallets')) {
      return new Response(
        JSON.stringify([{ user_id: 'u-target-123', trial_credits: 10, purchased_credits: 50 }]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (urlStr.includes('/rest/v1/credit_transactions')) {
      insertedTxBody = JSON.parse(String(init?.body));
      return new Response('{}', { status: 201 });
    }
    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;

  const topupRes = await executeAdminManualTopup({
    targetUserIdOrEmail: 'producer@studio.com',
    amount: 300,
    creditType: 'purchased',
    reason: 'Special Promotion Grant',
    adminEmail: 'admin@studio.com',
    config,
    fetchFn: mockFetch,
  });

  assert.equal(topupRes.success, true);
  assert.equal(topupRes.status, 200);
  assert.equal(topupRes.targetUser?.id, 'u-target-123');
  assert.equal(topupRes.wallet?.purchasedCredits, 350); // 50 + 300
  assert.equal(topupRes.wallet?.balance, 360); // 10 trial + 350 purchased
  assert.ok(patchedWalletBody);
  const patched = patchedWalletBody as Record<string, unknown>;
  assert.equal(patched.purchased_credits, 350);
  assert.ok(insertedTxBody);
  const inserted = insertedTxBody as Record<string, unknown>;
  assert.equal(inserted.tx_type, 'topup');
  assert.equal(inserted.amount, 300);
  assert.ok(String(inserted.description).includes('Special Promotion Grant'));
});

test('API routes: handleGetAdminTopupRequest and handlePostAdminTopupRequest enforce auth', async () => {
  const config = makeMockConfig();

  // GET unauth
  const getReqUnauth = new Request('https://app.test/api/admin/topup');
  const getResUnauth = await handleGetAdminTopupRequest(getReqUnauth, {
    config,
    adminKey: 'test-admin-key',
  });
  assert.equal(getResUnauth.status, 401);

  // POST unauth
  const postReqUnauth = new Request('https://app.test/api/admin/topup', {
    method: 'POST',
    body: JSON.stringify({ userIdOrEmail: 'user@test.com', amount: 100 }),
  });
  const postResUnauth = await handlePostAdminTopupRequest(postReqUnauth, {
    config,
    adminKey: 'test-admin-key',
  });
  assert.equal(postResUnauth.status, 401);
});
