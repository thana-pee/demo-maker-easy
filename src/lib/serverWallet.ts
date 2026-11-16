import type { CreditPackage, CreditTransaction } from './creditManager';
import {
  generatePromptPayPayload,
  generatePromptPayQrDataUrl,
  normalizePromptPayReceiver,
} from './promptpayQr';

export interface ServerBillingConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  serviceRoleKey: string;
  promptPayReceiverId: string;
  promptPayReceiverName: string;
  slipVerifyApiUrl: string;
  slipVerifyApiKey: string;
  billingMode: 'standalone' | 'production';
}

export interface VerifiedSupabaseUser {
  id: string;
  email?: string;
  displayName: string;
}

export type AuthVerificationResult =
  | { ok: true; user: VerifiedSupabaseUser; accessToken: string }
  | { ok: false; status: number; code: string; error: string };

export interface ServerWalletSnapshot {
  userId: string;
  balance: number;
  trialCredits: number;
  purchasedCredits: number;
  transactions: CreditTransaction[];
  source: 'supabase';
}

export interface TopUpOrderRecord {
  id: string;
  userId: string;
  packageId: string;
  expectedAmountThb: number;
  creditsToGrant: number;
  promptpayPayload: string;
  status: 'pending' | 'paid' | 'rejected' | 'expired';
  transRef?: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface NormalizedSlipData {
  success: boolean;
  transRef: string;
  amount: number;
  receiverIds: string[];
  receiverNames: string[];
  sendingBank?: string;
  timestampIso?: string;
  rawMessage?: string;
}

export interface SlipValidationResult {
  valid: boolean;
  status: number;
  code?:
    | 'SLIP_INVALID'
    | 'SLIP_RECEIVER_MISSING'
    | 'SLIP_RECEIVER_MISMATCH'
    | 'SLIP_AMOUNT_MISMATCH'
    | 'SLIP_DUPLICATE_REF'
    | 'SLIP_EXPIRED';
  error?: string;
}

export type FetchLike = typeof fetch;

export const MAX_SLIP_FILE_BYTES = 4 * 1024 * 1024; // 4 MB
export const ALLOWED_SLIP_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const SLIP_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SLIP_MAX_FUTURE_SKEW_MS = 15 * 60 * 1000;

export function getServerBillingConfig(
  env: Record<string, string | undefined> = process.env
): ServerBillingConfig {
  return {
    supabaseUrl: (env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, ''),
    supabaseAnonKey: (env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim(),
    serviceRoleKey: (env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
    promptPayReceiverId: (env.PROMPTPAY_RECEIVER_ID || '').trim(),
    promptPayReceiverName: (env.PROMPTPAY_RECEIVER_NAME || '').trim(),
    slipVerifyApiUrl: (env.SLIP_VERIFY_API_URL || '').trim(),
    slipVerifyApiKey: (env.SLIP_VERIFY_API_KEY || '').trim(),
    billingMode:
      (env.NEXT_PUBLIC_BILLING_MODE || '').trim().toLowerCase() === 'production'
        ? 'production'
        : 'standalone',
  };
}

export function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token ? token : null;
}

/** ยืนยันตัวตนผู้ใช้จาก Authorization: Bearer <Supabase JWT> ฝั่ง Server เท่านั้น */
export async function verifySupabaseUserFromRequest(
  request: Request,
  options?: { fetchFn?: FetchLike; config?: ServerBillingConfig }
): Promise<AuthVerificationResult> {
  const token = extractBearerToken(request);
  if (!token) {
    return {
      ok: false,
      status: 401,
      code: 'UNAUTHENTICATED',
      error: 'กรุณาเข้าสู่ระบบด้วย Google ก่อนทำรายการเครดิตหรือชำระเงิน (401 Unauthorized)',
    };
  }

  const config = options?.config ?? getServerBillingConfig();
  const apiKey = config.supabaseAnonKey || config.serviceRoleKey;
  if (!config.supabaseUrl || !apiKey) {
    return {
      ok: false,
      status: 503,
      code: 'BILLING_NOT_CONFIGURED',
      error:
        'ระบบ Supabase Auth/Wallet ฝั่งเซิร์ฟเวอร์ยังไม่ได้ตั้งค่า (กรุณาเพิ่ม NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY)',
    };
  }

  const fetchFn = options?.fetchFn ?? fetch;
  try {
    const res = await fetchFn(`${config.supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) {
      return {
        ok: false,
        status: 401,
        code: 'INVALID_SESSION',
        error: 'เซสชันหมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบด้วย Google ใหม่อีกครั้ง',
      };
    }

    const userJson = (await res.json()) as {
      id?: string;
      email?: string;
      user_metadata?: { full_name?: string; name?: string };
    };
    if (!userJson.id) {
      return {
        ok: false,
        status: 401,
        code: 'INVALID_USER_PAYLOAD',
        error: 'ไม่พบข้อมูลบัญชีผู้ใช้จาก Supabase Auth',
      };
    }

    const email = userJson.email || undefined;
    const displayName =
      userJson.user_metadata?.full_name ||
      userJson.user_metadata?.name ||
      (email ? email.split('@')[0] : 'Studio Member');

    return {
      ok: true,
      accessToken: token,
      user: {
        id: userJson.id,
        email,
        displayName,
      },
    };
  } catch {
    return {
      ok: false,
      status: 502,
      code: 'AUTH_UPSTREAM_ERROR',
      error: 'ไม่สามารถตรวจสอบสิทธิ์กับ Supabase Auth ได้ชั่วคราว',
    };
  }
}

export function getServiceRoleHeaders(config: ServerBillingConfig): Record<string, string> {
  if (!config.supabaseUrl || !config.serviceRoleKey) {
    throw new Error('SERVICE_ROLE_NOT_CONFIGURED');
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: config.serviceRoleKey,
  };
  // Legacy service_role keys are JWTs passed in Authorization; new Supabase sb_secret_* keys must NOT be sent as Bearer JWTs
  if (!config.serviceRoleKey.startsWith('sb_secret_')) {
    headers.Authorization = `Bearer ${config.serviceRoleKey}`;
  }
  return headers;
}

function mapDbTransactions(rows: unknown[]): CreditTransaction[] {
  return rows
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((row) => ({
      id: String(row.id || ''),
      type:
        row.tx_type === 'grant_trial' ||
        row.tx_type === 'topup' ||
        row.tx_type === 'spend' ||
        row.tx_type === 'refund'
          ? row.tx_type
          : 'spend',
      amount: Number(row.amount || 0),
      description: String(row.description || ''),
      createdAt: String(row.created_at || new Date().toISOString()),
    }));
}

function isRecoverableRpcSqlError(status: number, errText: string): boolean {
  if (status === 400 || status === 404) return true;
  const lower = errText.toLowerCase();
  return lower.includes('42702') || lower.includes('pgrst202') || lower.includes('ambiguous');
}

export async function fetchWalletRowViaRest(
  userId: string,
  config: ServerBillingConfig,
  fetchFn: FetchLike
): Promise<WalletBalanceSummary | null> {
  const headers = getServiceRoleHeaders(config);
  const res = await fetchFn(
    `${config.supabaseUrl}/rest/v1/user_wallets?user_id=eq.${encodeURIComponent(
      userId
    )}&select=user_id,trial_credits,purchased_credits,updated_at&limit=1`,
    { headers }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Wallet REST query failed (${res.status}): ${errText}`);
  }
  const rows = (await res.json()) as Array<{
    trial_credits?: number;
    purchased_credits?: number;
  }>;
  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (!row) return null;
  const trialCredits = Math.max(0, Number(row.trial_credits ?? 0));
  const purchasedCredits = Math.max(0, Number(row.purchased_credits ?? 0));
  return {
    trialCredits,
    purchasedCredits,
    balance: trialCredits + purchasedCredits,
  };
}

export async function insertCreditTransactionViaRest(
  payload: {
    user_id: string;
    tx_type: 'grant_trial' | 'topup' | 'spend' | 'refund';
    amount: number;
    description: string;
    model_id?: string | null;
    trans_ref?: string | null;
    metadata?: Record<string, unknown>;
  },
  config: ServerBillingConfig,
  fetchFn: FetchLike
): Promise<Response> {
  const headers = {
    ...getServiceRoleHeaders(config),
    Prefer: 'return=minimal',
  };
  return fetchFn(`${config.supabaseUrl}/rest/v1/credit_transactions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
}

export async function patchUserWalletViaRest(
  userId: string,
  patch: { trial_credits?: number; purchased_credits?: number },
  config: ServerBillingConfig,
  fetchFn: FetchLike
): Promise<void> {
  const headers = {
    ...getServiceRoleHeaders(config),
    Prefer: 'return=minimal',
  };
  const res = await fetchFn(
    `${config.supabaseUrl}/rest/v1/user_wallets?user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        ...patch,
        updated_at: new Date().toISOString(),
      }),
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Wallet REST update failed (${res.status}): ${errText}`);
  }
}

export async function ensureWalletViaRest(
  userId: string,
  config: ServerBillingConfig,
  fetchFn: FetchLike
): Promise<WalletBalanceSummary> {
  const existing = await fetchWalletRowViaRest(userId, config, fetchFn);
  if (existing) {
    return existing;
  }

  const headers = {
    ...getServiceRoleHeaders(config),
    Prefer: 'resolution=ignore-duplicates,return=representation',
  };
  const insertRes = await fetchFn(`${config.supabaseUrl}/rest/v1/user_wallets`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      user_id: userId,
      trial_credits: 15,
      purchased_credits: 0,
    }),
  });
  if (!insertRes.ok) {
    const errText = await insertRes.text();
    throw new Error(`Wallet REST init failed (${insertRes.status}): ${errText}`);
  }

  const inserted = (await insertRes.json().catch(() => [])) as Array<{
    trial_credits?: number;
    purchased_credits?: number;
  }>;
  if (Array.isArray(inserted) && inserted.length > 0) {
    await insertCreditTransactionViaRest(
      {
        user_id: userId,
        tx_type: 'grant_trial',
        amount: 15,
        description: 'Starter Trial Bonus (15 Credits) สำหรับทดลอง AI Lyrics / Director เบื้องต้น',
      },
      config,
      fetchFn
    ).catch(() => null);
    const trialCredits = Math.max(0, Number(inserted[0].trial_credits ?? 15));
    const purchasedCredits = Math.max(0, Number(inserted[0].purchased_credits ?? 0));
    return {
      trialCredits,
      purchasedCredits,
      balance: trialCredits + purchasedCredits,
    };
  }

  const raced = await fetchWalletRowViaRest(userId, config, fetchFn);
  if (raced) return raced;
  return { trialCredits: 15, purchasedCredits: 0, balance: 15 };
}

/** ดึงข้อมูล Wallet ปัจจุบันจาก Postgres (สร้าง Trial Credits 15 ให้อัตโนมัติครั้งแรก) */
export async function getOrInitWallet(
  userId: string,
  options?: { fetchFn?: FetchLike; config?: ServerBillingConfig }
): Promise<ServerWalletSnapshot> {
  const config = options?.config ?? getServerBillingConfig();
  const headers = getServiceRoleHeaders(config);
  const fetchFn = options?.fetchFn ?? fetch;

  let trialCredits = 0;
  let purchasedCredits = 0;
  let balance = 0;

  const rpcRes = await fetchFn(`${config.supabaseUrl}/rest/v1/rpc/init_user_wallet`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_user_id: userId }),
  });
  if (!rpcRes.ok) {
    const errText = await rpcRes.text();
    if (!isRecoverableRpcSqlError(rpcRes.status, errText)) {
      throw new Error(`Wallet RPC init failed (${rpcRes.status}): ${errText}`);
    }
    const restSummary = await ensureWalletViaRest(userId, config, fetchFn);
    trialCredits = restSummary.trialCredits;
    purchasedCredits = restSummary.purchasedCredits;
    balance = restSummary.balance;
  } else {
    const walletRows = (await rpcRes.json()) as Array<{
      user_id?: string;
      trial_credits?: number;
      purchased_credits?: number;
      balance?: number;
    }>;
    const walletRow = Array.isArray(walletRows) ? walletRows[0] : walletRows;
    trialCredits = Math.max(0, Number(walletRow?.trial_credits ?? 0));
    purchasedCredits = Math.max(0, Number(walletRow?.purchased_credits ?? 0));
    balance = Math.max(0, Number(walletRow?.balance ?? trialCredits + purchasedCredits));
  }

  let transactions: CreditTransaction[] = [];
  const txRes = await fetchFn(
    `${config.supabaseUrl}/rest/v1/credit_transactions?user_id=eq.${encodeURIComponent(
      userId
    )}&order=created_at.desc&limit=30`,
    { headers }
  );
  if (txRes.ok) {
    const rawTx = (await txRes.json()) as unknown[];
    if (Array.isArray(rawTx)) {
      transactions = mapDbTransactions(rawTx);
    }
  }

  return {
    userId,
    balance,
    trialCredits,
    purchasedCredits,
    transactions,
    source: 'supabase',
  };
}

/** หักเครดิตแบบ Row Lock ฝั่ง Postgres (ตัด Trial ก่อน Purchased เสมอ) */
export async function atomicDeductCredits(
  userId: string,
  amount: number,
  description: string,
  options?: {
    requirePurchased?: boolean;
    modelId?: string;
    fetchFn?: FetchLike;
    config?: ServerBillingConfig;
  }
): Promise<{
  success: boolean;
  errorCode?: string;
  trialCredits: number;
  purchasedCredits: number;
  balance: number;
}> {
  const config = options?.config ?? getServerBillingConfig();
  const headers = getServiceRoleHeaders(config);
  const fetchFn = options?.fetchFn ?? fetch;
  const roundedAmount = Math.round(amount);

  const rpcRes = await fetchFn(`${config.supabaseUrl}/rest/v1/rpc/atomic_deduct_credits`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      p_user_id: userId,
      p_amount: roundedAmount,
      p_description: description,
      p_require_purchased: Boolean(options?.requirePurchased),
      p_model_id: options?.modelId ?? null,
    }),
  });

  if (!rpcRes.ok) {
    const errText = await rpcRes.text();
    if (!isRecoverableRpcSqlError(rpcRes.status, errText)) {
      throw new Error(`Wallet deduction RPC failed (${rpcRes.status}): ${errText}`);
    }

    if (!Number.isFinite(roundedAmount) || roundedAmount <= 0) {
      return {
        success: false,
        errorCode: 'INVALID_AMOUNT',
        trialCredits: 0,
        purchasedCredits: 0,
        balance: 0,
      };
    }

    const current = await ensureWalletViaRest(userId, config, fetchFn);
    if (options?.requirePurchased) {
      if (current.purchasedCredits < roundedAmount) {
        return {
          success: false,
          errorCode: 'REQUIRES_PURCHASED_CREDITS',
          ...current,
        };
      }
      const nextPurchased = current.purchasedCredits - roundedAmount;
      await patchUserWalletViaRest(userId, { purchased_credits: nextPurchased }, config, fetchFn);
      await insertCreditTransactionViaRest(
        {
          user_id: userId,
          tx_type: 'spend',
          amount: -roundedAmount,
          description: description.trim() || 'AI Generation',
          model_id: options?.modelId ?? null,
          metadata: { from_trial: 0, from_purchased: roundedAmount },
        },
        config,
        fetchFn
      );
      return {
        success: true,
        trialCredits: current.trialCredits,
        purchasedCredits: nextPurchased,
        balance: current.trialCredits + nextPurchased,
      };
    }

    if (current.balance < roundedAmount) {
      return {
        success: false,
        errorCode: 'INSUFFICIENT_CREDITS',
        ...current,
      };
    }

    const fromTrial = Math.min(current.trialCredits, roundedAmount);
    const fromPurchased = roundedAmount - fromTrial;
    const nextTrial = current.trialCredits - fromTrial;
    const nextPurchased = current.purchasedCredits - fromPurchased;

    await patchUserWalletViaRest(
      userId,
      { trial_credits: nextTrial, purchased_credits: nextPurchased },
      config,
      fetchFn
    );
    await insertCreditTransactionViaRest(
      {
        user_id: userId,
        tx_type: 'spend',
        amount: -roundedAmount,
        description: description.trim() || 'AI Generation',
        model_id: options?.modelId ?? null,
        metadata: { from_trial: fromTrial, from_purchased: fromPurchased },
      },
      config,
      fetchFn
    );
    return {
      success: true,
      trialCredits: nextTrial,
      purchasedCredits: nextPurchased,
      balance: nextTrial + nextPurchased,
    };
  }

  const rows = (await rpcRes.json()) as Array<{
    success?: boolean;
    error_code?: string | null;
    trial_credits?: number;
    purchased_credits?: number;
    balance?: number;
  }>;
  const row = Array.isArray(rows) ? rows[0] : rows;

  return {
    success: Boolean(row?.success),
    errorCode: row?.error_code || undefined,
    trialCredits: Number(row?.trial_credits ?? 0),
    purchasedCredits: Number(row?.purchased_credits ?? 0),
    balance: Number(row?.balance ?? 0),
  };
}

/** คืนเครดิตอัตโนมัติฝั่ง Server เมื่อการเรียก Gemini API ล้มเหลวหลังหักเครดิต */
export async function atomicRefundCredits(
  userId: string,
  amount: number,
  description: string,
  options?: {
    toPurchased?: boolean;
    modelId?: string;
    fetchFn?: FetchLike;
    config?: ServerBillingConfig;
  }
): Promise<{
  success: boolean;
  trialCredits: number;
  purchasedCredits: number;
  balance: number;
}> {
  const config = options?.config ?? getServerBillingConfig();
  const headers = getServiceRoleHeaders(config);
  const fetchFn = options?.fetchFn ?? fetch;
  const roundedAmount = Math.round(amount);

  const rpcRes = await fetchFn(`${config.supabaseUrl}/rest/v1/rpc/atomic_refund_credits`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      p_user_id: userId,
      p_amount: roundedAmount,
      p_description: description,
      p_to_purchased: Boolean(options?.toPurchased),
      p_model_id: options?.modelId ?? null,
    }),
  });

  if (!rpcRes.ok) {
    const errText = await rpcRes.text();
    if (!isRecoverableRpcSqlError(rpcRes.status, errText)) {
      throw new Error(`Wallet refund RPC failed (${rpcRes.status}): ${errText}`);
    }

    if (!Number.isFinite(roundedAmount) || roundedAmount <= 0) {
      return { success: false, trialCredits: 0, purchasedCredits: 0, balance: 0 };
    }

    const current = await ensureWalletViaRest(userId, config, fetchFn);
    const nextTrial = options?.toPurchased
      ? current.trialCredits
      : current.trialCredits + roundedAmount;
    const nextPurchased = options?.toPurchased
      ? current.purchasedCredits + roundedAmount
      : current.purchasedCredits;

    await patchUserWalletViaRest(
      userId,
      { trial_credits: nextTrial, purchased_credits: nextPurchased },
      config,
      fetchFn
    );
    await insertCreditTransactionViaRest(
      {
        user_id: userId,
        tx_type: 'refund',
        amount: roundedAmount,
        description: description.trim() || 'AI Failure Auto-Refund',
        model_id: options?.modelId ?? null,
      },
      config,
      fetchFn
    );
    return {
      success: true,
      trialCredits: nextTrial,
      purchasedCredits: nextPurchased,
      balance: nextTrial + nextPurchased,
    };
  }

  const rows = (await rpcRes.json()) as Array<{
    success?: boolean;
    trial_credits?: number;
    purchased_credits?: number;
    balance?: number;
  }>;
  const row = Array.isArray(rows) ? rows[0] : rows;

  return {
    success: Boolean(row?.success),
    trialCredits: Number(row?.trial_credits ?? 0),
    purchasedCredits: Number(row?.purchased_credits ?? 0),
    balance: Number(row?.balance ?? 0),
  };
}

/** สร้างคำสั่งซื้อเติมเครดิต + PromptPay EMVCo QR Payload โดยใช้ราคาแพ็กเกจฝั่ง Server เท่านั้น */
export async function createPendingTopUpOrder(
  userId: string,
  pkg: CreditPackage,
  options?: { fetchFn?: FetchLike; config?: ServerBillingConfig }
): Promise<{
  order: TopUpOrderRecord;
  qrSvgDataUrl: string;
  receiverName: string;
  maskedReceiver: string;
}> {
  const config = options?.config ?? getServerBillingConfig();
  if (!config.promptPayReceiverId) {
    throw new Error('PROMPTPAY_NOT_CONFIGURED');
  }

  const normalizedReceiver = normalizePromptPayReceiver(config.promptPayReceiverId);
  const refLabel = `DME-${Date.now().toString(36).toUpperCase()}`.slice(0, 18);
  const payload = generatePromptPayPayload(config.promptPayReceiverId, pkg.priceThb, refLabel);
  const qrSvgDataUrl = await generatePromptPayQrDataUrl(payload);

  const headers = getServiceRoleHeaders(config);
  const fetchFn = options?.fetchFn ?? fetch;

  const insertRes = await fetchFn(`${config.supabaseUrl}/rest/v1/topup_orders`, {
    method: 'POST',
    headers: {
      ...headers,
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      user_id: userId,
      package_id: pkg.id,
      expected_amount_thb: pkg.priceThb,
      credits_to_grant: pkg.credits,
      promptpay_payload: payload,
      status: 'pending',
    }),
  });

  if (!insertRes.ok) {
    const errText = await insertRes.text();
    throw new Error(`Failed to create topup order (${insertRes.status}): ${errText}`);
  }

  const inserted = (await insertRes.json()) as Array<Record<string, unknown>>;
  const row = Array.isArray(inserted) ? inserted[0] : inserted;

  const order: TopUpOrderRecord = {
    id: String(row?.id || ''),
    userId: String(row?.user_id || userId),
    packageId: String(row?.package_id || pkg.id),
    expectedAmountThb: Number(row?.expected_amount_thb ?? pkg.priceThb),
    creditsToGrant: Number(row?.credits_to_grant ?? pkg.credits),
    promptpayPayload: String(row?.promptpay_payload || payload),
    status:
      row?.status === 'paid' || row?.status === 'rejected' || row?.status === 'expired'
        ? row.status
        : 'pending',
    transRef: (row?.trans_ref as string | null | undefined) ?? null,
    createdAt: String(row?.created_at || new Date().toISOString()),
    expiresAt: String(row?.expires_at || new Date(Date.now() + SLIP_MAX_AGE_MS).toISOString()),
  };

  return {
    order,
    qrSvgDataUrl,
    receiverName: config.promptPayReceiverName || 'Demo Maker Easy PromptPay',
    maskedReceiver: normalizedReceiver.maskedDisplay,
  };
}

export async function getTopUpOrderById(
  orderId: string,
  userId: string,
  options?: { fetchFn?: FetchLike; config?: ServerBillingConfig }
): Promise<TopUpOrderRecord | null> {
  const config = options?.config ?? getServerBillingConfig();
  const headers = getServiceRoleHeaders(config);
  const fetchFn = options?.fetchFn ?? fetch;

  const res = await fetchFn(
    `${config.supabaseUrl}/rest/v1/topup_orders?id=eq.${encodeURIComponent(
      orderId
    )}&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    { headers }
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch topup order (${res.status})`);
  }

  const rows = (await res.json()) as Array<Record<string, unknown>>;
  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (!row) return null;

  return {
    id: String(row.id),
    userId: String(row.user_id),
    packageId: String(row.package_id),
    expectedAmountThb: Number(row.expected_amount_thb),
    creditsToGrant: Number(row.credits_to_grant),
    promptpayPayload: String(row.promptpay_payload || ''),
    status:
      row.status === 'paid' || row.status === 'rejected' || row.status === 'expired'
        ? row.status
        : 'pending',
    transRef: (row.trans_ref as string | null | undefined) ?? null,
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
  };
}

function pushNonEmptyString(target: string[], value: unknown): void {
  if (typeof value === 'string' && value.trim()) {
    target.push(value.trim());
  }
}

/**
 * แปลง Response จากผู้ให้บริการตรวจสลิปธนาคารไทย (รองรับทั้งโครงสร้าง SlipOK / EasySlip / Custom JSON)
 */
export function normalizeSlipApiPayload(rawJson: unknown): NormalizedSlipData {
  if (!rawJson || typeof rawJson !== 'object') {
    return {
      success: false,
      transRef: '',
      amount: 0,
      receiverIds: [],
      receiverNames: [],
      rawMessage: 'Empty slip provider response',
    };
  }

  const root = rawJson as Record<string, unknown>;
  const data =
    root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : root;

  const explicitSuccess =
    root.success === true ||
    data.success === true ||
    (root.status === 200 && root.success !== false);
  const successFlag = root.success === false || data.success === false ? false : explicitSuccess;

  const transRef = String(
    data.transRef ?? data.trans_ref ?? data.refId ?? data.transactionId ?? ''
  ).trim();

  // Amount can be numeric or `{ amount: 49, local: ... }` (EasySlip)
  let amount = 0;
  if (typeof data.amount === 'number' || typeof data.amount === 'string') {
    amount = Number(data.amount);
  } else if (data.amount && typeof data.amount === 'object') {
    const amtObj = data.amount as Record<string, unknown>;
    amount = Number(amtObj.amount ?? amtObj.value ?? 0);
  } else if (data.paidAmount !== undefined) {
    amount = Number(data.paidAmount);
  }

  const receiver =
    data.receiver && typeof data.receiver === 'object'
      ? (data.receiver as Record<string, unknown>)
      : {};
  const proxy =
    receiver.proxy && typeof receiver.proxy === 'object'
      ? (receiver.proxy as Record<string, unknown>)
      : {};
  const account =
    receiver.account && typeof receiver.account === 'object'
      ? (receiver.account as Record<string, unknown>)
      : {};
  const accountProxy =
    account.proxy && typeof account.proxy === 'object'
      ? (account.proxy as Record<string, unknown>)
      : {};
  const accountBank =
    account.bank && typeof account.bank === 'object'
      ? (account.bank as Record<string, unknown>)
      : {};
  const receiverNameObj =
    receiver.name && typeof receiver.name === 'object'
      ? (receiver.name as Record<string, unknown>)
      : {};
  const accountNameObj =
    account.name && typeof account.name === 'object'
      ? (account.name as Record<string, unknown>)
      : {};

  const receiverIds: string[] = [];
  pushNonEmptyString(receiverIds, proxy.value);
  pushNonEmptyString(receiverIds, proxy.account);
  pushNonEmptyString(receiverIds, accountProxy.value);
  pushNonEmptyString(receiverIds, account.value);
  pushNonEmptyString(receiverIds, accountBank.account);
  pushNonEmptyString(receiverIds, data.receiverAccount);
  pushNonEmptyString(receiverIds, data.receiverPromptPay);

  const receiverNames: string[] = [];
  pushNonEmptyString(receiverNames, receiver.displayName);
  pushNonEmptyString(receiverNames, typeof receiver.name === 'string' ? receiver.name : undefined);
  pushNonEmptyString(receiverNames, receiverNameObj.th);
  pushNonEmptyString(receiverNames, receiverNameObj.en);
  pushNonEmptyString(receiverNames, accountNameObj.th);
  pushNonEmptyString(receiverNames, accountNameObj.en);
  pushNonEmptyString(receiverNames, data.receiverName);

  const sendingBankObj =
    data.sendingBank && typeof data.sendingBank === 'object'
      ? (data.sendingBank as Record<string, unknown>)
      : null;
  const sendingBank = sendingBankObj
    ? String(sendingBankObj.name ?? sendingBankObj.short ?? sendingBankObj.id ?? '')
    : typeof data.sendingBank === 'string'
    ? data.sendingBank
    : undefined;

  let timestampIso: string | undefined;
  const rawDateTime =
    data.dateTime ?? data.transTimestamp ?? data.date ?? data.timestamp ?? data.createdAt;
  if (typeof rawDateTime === 'string' && rawDateTime.trim()) {
    timestampIso = rawDateTime.trim();
  } else if (typeof data.transDate === 'string' && /^\d{8}$/.test(data.transDate)) {
    const y = data.transDate.slice(0, 4);
    const m = data.transDate.slice(4, 6);
    const d = data.transDate.slice(6, 8);
    const t =
      typeof data.transTime === 'string' && /^\d{2}:\d{2}(:\d{2})?/.test(data.transTime)
        ? data.transTime
        : '00:00:00';
    timestampIso = `${y}-${m}-${d}T${t}+07:00`;
  }

  return {
    success: successFlag,
    transRef,
    amount: Number.isFinite(amount) ? amount : 0,
    receiverIds,
    receiverNames,
    sendingBank: sendingBank?.trim() || undefined,
    timestampIso,
    rawMessage: typeof root.message === 'string' ? root.message : undefined,
  };
}

function normalizePersonName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^(นาย|นางสาว|นาง|น\.ส\.|คุณ|mr\.?|mrs\.?|ms\.?|miss)\s*/i, '')
    .replace(/[^a-z0-9\u0E00-\u0E7F]+/g, ' ')
    .trim();
}

function isReceiverIdMatch(candidate: string, expectedRawDigits: string, expectedFormattedId: string): boolean {
  const cleaned = candidate.trim();
  if (!cleaned) return false;

  const hasMask = /[xX*]/.test(cleaned);
  const digits = cleaned.replace(/\D/g, '');
  if (!digits) return false;

  if (!hasMask && digits.length >= 9) {
    // Unmasked PromptPay / Phone / ID must match full normalized identifier
    if (digits === expectedRawDigits || digits === expectedFormattedId) {
      return true;
    }
    // Accept leading 66 + 9 digits vs 0 + 9 digits equivalence
    if (
      expectedRawDigits.startsWith('0') &&
      digits === `66${expectedRawDigits.slice(1)}`
    ) {
      return true;
    }
    return false;
  }

  // Bank APIs frequently return masked strings like xxx-x-x5678-x or xxxxxx5678
  if (hasMask && digits.length >= 4) {
    // Check last 4 visible digits against expected digits suffix or 1-char shifted suffix (for trailing check digit x)
    const last4 = digits.slice(-4);
    if (expectedRawDigits.endsWith(last4)) return true;
    if (expectedRawDigits.slice(0, -1).endsWith(last4)) return true;
    if (expectedRawDigits.includes(digits) && digits.length >= 4) return true;
  }

  return false;
}

/**
 * ตรวจสอบความถูกต้องของสลิปธนาคาร 5 ชั้น (ป้องกันสลิปปลอม / โอนผิดบัญชี / โอนขาด / สลิปซ้ำ / สลิปเก่า)
 */
export function validateSlipAgainstOrder(
  slip: NormalizedSlipData,
  expectedOrder: Pick<TopUpOrderRecord, 'expectedAmountThb'>,
  config: Pick<ServerBillingConfig, 'promptPayReceiverId' | 'promptPayReceiverName'>,
  options?: { existingTransRefUsed?: boolean; nowMs?: number }
): SlipValidationResult {
  // 1. สลิปต้องผ่านการตรวจลายเซ็นธนาคาร/API จริง และมี transRef
  if (!slip.success || !slip.transRef.trim()) {
    return {
      valid: false,
      status: 400,
      code: 'SLIP_INVALID',
      error: slip.rawMessage || 'ไม่พบข้อมูลสลิปที่ถูกต้อง กรุณาอัปโหลดภาพสลิปที่มี QR Code ชัดเจน',
    };
  }

  // 2. ป้องกันการใช้สลิปซ้ำ (Replay Attack)
  if (options?.existingTransRefUsed) {
    return {
      valid: false,
      status: 409,
      code: 'SLIP_DUPLICATE_REF',
      error: `สลิปเลขอ้างอิง ${slip.transRef} ถูกใช้เติมเครดิตไปแล้ว ไม่สามารถใช้ซ้ำได้`,
    };
  }

  // 3. ยอดโอนเงินต้องตรงกับราคาแพ็กเกจ (ไม่อนุญาตให้โอนน้อยกว่า)
  if (!Number.isFinite(slip.amount) || slip.amount <= 0) {
    return {
      valid: false,
      status: 400,
      code: 'SLIP_AMOUNT_MISMATCH',
      error: 'ไม่พบยอดเงินในสลิปโอนเงิน',
    };
  }
  if (Math.abs(slip.amount - expectedOrder.expectedAmountThb) > 0.01) {
    return {
      valid: false,
      status: 400,
      code: 'SLIP_AMOUNT_MISMATCH',
      error: `ยอดเงินในสลิป (${slip.amount.toFixed(2)}฿) ไม่ตรงกับยอดแพ็กเกจ (${expectedOrder.expectedAmountThb.toFixed(2)}฿)`,
    };
  }

  // 4. บัญชีผู้รับเงินต้องตรงกับ PromptPay ID / ชื่อบัญชีร้าน
  if (config.promptPayReceiverId || config.promptPayReceiverName) {
    let expectedRawDigits = '';
    let expectedFormattedId = '';
    if (config.promptPayReceiverId) {
      const normalized = normalizePromptPayReceiver(config.promptPayReceiverId);
      expectedRawDigits = normalized.rawDigits;
      expectedFormattedId = normalized.formattedId;
    }

    const hasReceiverData = slip.receiverIds.length > 0 || slip.receiverNames.length > 0;
    if (!hasReceiverData) {
      return {
        valid: false,
        status: 400,
        code: 'SLIP_RECEIVER_MISSING',
        error: 'สลิปไม่มีข้อมูลบัญชีผู้รับเงิน จึงไม่สามารถยืนยันการโอนเข้าบัญชีร้านได้',
      };
    }

    if (config.promptPayReceiverId && slip.receiverIds.length > 0) {
      const matchedId = slip.receiverIds.some((id) =>
        isReceiverIdMatch(id, expectedRawDigits, expectedFormattedId)
      );
      if (!matchedId) {
        return {
          valid: false,
          status: 400,
          code: 'SLIP_RECEIVER_MISMATCH',
          error: 'บัญชี PromptPay ปลายทางในสลิปไม่ตรงกับบัญชีรับเงินของ Demo Maker Easy',
        };
      }
    }

    if (config.promptPayReceiverName) {
      const expectedName = normalizePersonName(config.promptPayReceiverName);
      if (expectedName && slip.receiverNames.length > 0) {
        const matchedName = slip.receiverNames.some((candidate) => {
          const cleanCandidate = normalizePersonName(candidate);
          return (
            Boolean(cleanCandidate) &&
            (cleanCandidate.includes(expectedName) || expectedName.includes(cleanCandidate))
          );
        });
        if (!matchedName) {
          return {
            valid: false,
            status: 400,
            code: 'SLIP_RECEIVER_MISMATCH',
            error: 'ชื่อบัญชีปลายทางในสลิปไม่ตรงกับผู้รับเงินที่ระบบกำหนด',
          };
        }
      } else if (!config.promptPayReceiverId || slip.receiverIds.length === 0) {
        return {
          valid: false,
          status: 400,
          code: 'SLIP_RECEIVER_MISMATCH',
          error: 'ไม่สามารถยืนยันชื่อบัญชีปลายทางบนสลิปได้',
        };
      }
    }
  }

  // 5. เวลาบนสลิปต้องไม่เก่าเกิน 24 ชั่วโมง
  if (!slip.timestampIso) {
    return {
      valid: false,
      status: 400,
      code: 'SLIP_EXPIRED',
      error: 'ไม่พบวันเวลาโอนเงินในสลิป',
    };
  }
  const slipMs = Date.parse(slip.timestampIso);
  const nowMs = options?.nowMs ?? Date.now();
  if (!Number.isFinite(slipMs)) {
    return {
      valid: false,
      status: 400,
      code: 'SLIP_EXPIRED',
      error: 'รูปแบบวันเวลาบนสลิปไม่ถูกต้อง',
    };
  }
  if (nowMs - slipMs > SLIP_MAX_AGE_MS || slipMs - nowMs > SLIP_MAX_FUTURE_SKEW_MS) {
    return {
      valid: false,
      status: 400,
      code: 'SLIP_EXPIRED',
      error: 'สลิปเกินระยะเวลาที่กำหนด (ต้องเป็นรายการโอนภายใน 24 ชั่วโมงล่าสุด)',
    };
  }

  return { valid: true, status: 200 };
}

/** ส่งรูปภาพสลิปไปยังผู้ให้บริการ Slip Verification API ภายนอก */
export async function verifySlipImageWithProvider(
  slipFile: { bytes: Uint8Array; mimeType: string; fileName: string; amountThb: number },
  config: ServerBillingConfig,
  fetchFn: FetchLike = fetch
): Promise<NormalizedSlipData> {
  if (!config.slipVerifyApiUrl || !config.slipVerifyApiKey) {
    throw new Error('SLIP_PROVIDER_NOT_CONFIGURED');
  }

  const lowerUrl = config.slipVerifyApiUrl.toLowerCase();
  const isEasySlip = lowerUrl.includes('easyslip.');
  const isSlipOk = lowerUrl.includes('slipok.');

  const formData = new FormData();
  const safeBuffer = new Uint8Array(slipFile.bytes);
  const blob = new Blob([safeBuffer], { type: slipFile.mimeType });
  if (isEasySlip) {
    formData.append('file', blob, slipFile.fileName);
  } else if (isSlipOk) {
    formData.append('files', blob, slipFile.fileName);
    formData.append('amount', String(slipFile.amountThb));
    formData.append('log', 'true');
  } else {
    formData.append('files', blob, slipFile.fileName);
    formData.append('file', blob, slipFile.fileName);
    formData.append('amount', String(slipFile.amountThb));
    formData.append('log', 'true');
  }

  const headers: Record<string, string> = isEasySlip
    ? { Authorization: `Bearer ${config.slipVerifyApiKey}` }
    : isSlipOk
    ? { 'x-authorization': config.slipVerifyApiKey }
    : {
        'x-authorization': config.slipVerifyApiKey,
        Authorization: `Bearer ${config.slipVerifyApiKey}`,
      };

  const res = await fetchFn(config.slipVerifyApiUrl, {
    method: 'POST',
    headers,
    body: formData,
  });

  const json = (await res.json().catch(() => ({}))) as unknown;
  if (!res.ok) {
    const parsed = normalizeSlipApiPayload(json);
    return {
      ...parsed,
      success: false,
      rawMessage: parsed.rawMessage || `Slip verification failed (${res.status})`,
    };
  }

  return normalizeSlipApiPayload(json);
}

export async function isTransRefAlreadyUsed(
  transRef: string,
  options?: { fetchFn?: FetchLike; config?: ServerBillingConfig }
): Promise<boolean> {
  const config = options?.config ?? getServerBillingConfig();
  const headers = getServiceRoleHeaders(config);
  const fetchFn = options?.fetchFn ?? fetch;

  const orderRes = await fetchFn(
    `${config.supabaseUrl}/rest/v1/topup_orders?trans_ref=eq.${encodeURIComponent(
      transRef
    )}&select=id&limit=1`,
    { headers }
  );
  if (orderRes.ok) {
    const rows = (await orderRes.json()) as unknown[];
    if (Array.isArray(rows) && rows.length > 0) return true;
  }

  const txRes = await fetchFn(
    `${config.supabaseUrl}/rest/v1/credit_transactions?trans_ref=eq.${encodeURIComponent(
      transRef
    )}&select=id&limit=1`,
    { headers }
  );
  if (txRes.ok) {
    const rows = (await txRes.json()) as unknown[];
    if (Array.isArray(rows) && rows.length > 0) return true;
  }

  return false;
}

export async function completeTopUpFromSlipInDb(
  params: {
    orderId: string;
    userId: string;
    transRef: string;
    credits: number;
    description: string;
    senderBank?: string;
  },
  options?: { fetchFn?: FetchLike; config?: ServerBillingConfig }
): Promise<{
  success: boolean;
  errorCode?: string;
  trialCredits: number;
  purchasedCredits: number;
  balance: number;
}> {
  const config = options?.config ?? getServerBillingConfig();
  const headers = getServiceRoleHeaders(config);
  const fetchFn = options?.fetchFn ?? fetch;

  const rpcRes = await fetchFn(`${config.supabaseUrl}/rest/v1/rpc/atomic_credit_topup_from_slip`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      p_order_id: params.orderId,
      p_user_id: params.userId,
      p_trans_ref: params.transRef,
      p_credits: params.credits,
      p_description: params.description,
      p_sender_bank: params.senderBank ?? null,
    }),
  });

  if (!rpcRes.ok) {
    const errText = await rpcRes.text();
    if (rpcRes.status === 409 || errText.includes('23505')) {
      return {
        success: false,
        errorCode: 'SLIP_DUPLICATE_REF',
        trialCredits: 0,
        purchasedCredits: 0,
        balance: 0,
      };
    }
    if (!isRecoverableRpcSqlError(rpcRes.status, errText)) {
      throw new Error(`Top-up credit RPC failed (${rpcRes.status}): ${errText}`);
    }

    const roundedCredits = Math.round(params.credits);
    const trimmedRef = params.transRef.trim();
    if (!Number.isFinite(roundedCredits) || roundedCredits <= 0 || !trimmedRef) {
      return {
        success: false,
        errorCode: 'INVALID_TOPUP_INPUT',
        trialCredits: 0,
        purchasedCredits: 0,
        balance: 0,
      };
    }

    const order = await getTopUpOrderById(params.orderId, params.userId, { config, fetchFn });
    if (!order) {
      return {
        success: false,
        errorCode: 'ORDER_NOT_FOUND',
        trialCredits: 0,
        purchasedCredits: 0,
        balance: 0,
      };
    }
    if (order.status !== 'pending') {
      return {
        success: false,
        errorCode: 'ORDER_ALREADY_SETTLED',
        trialCredits: 0,
        purchasedCredits: 0,
        balance: 0,
      };
    }

    const duplicate = await isTransRefAlreadyUsed(trimmedRef, { config, fetchFn });
    if (duplicate) {
      return {
        success: false,
        errorCode: 'SLIP_DUPLICATE_REF',
        trialCredits: 0,
        purchasedCredits: 0,
        balance: 0,
      };
    }

    const orderPatchRes = await fetchFn(
      `${config.supabaseUrl}/rest/v1/topup_orders?id=eq.${encodeURIComponent(
        params.orderId
      )}&user_id=eq.${encodeURIComponent(params.userId)}&status=eq.pending`,
      {
        method: 'PATCH',
        headers: {
          ...headers,
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          status: 'paid',
          trans_ref: trimmedRef,
          slip_sender_bank: params.senderBank ?? null,
          slip_verified_at: new Date().toISOString(),
        }),
      }
    );
    if (!orderPatchRes.ok) {
      const patchErr = await orderPatchRes.text();
      if (orderPatchRes.status === 409 || patchErr.includes('23505')) {
        return {
          success: false,
          errorCode: 'SLIP_DUPLICATE_REF',
          trialCredits: 0,
          purchasedCredits: 0,
          balance: 0,
        };
      }
      throw new Error(`Top-up order REST update failed (${orderPatchRes.status}): ${patchErr}`);
    }

    const current = await ensureWalletViaRest(params.userId, config, fetchFn);
    const nextPurchased = current.purchasedCredits + roundedCredits;
    await patchUserWalletViaRest(
      params.userId,
      { purchased_credits: nextPurchased },
      config,
      fetchFn
    );
    const txInsertRes = await insertCreditTransactionViaRest(
      {
        user_id: params.userId,
        tx_type: 'topup',
        amount: roundedCredits,
        description: params.description.trim() || 'PromptPay Top-Up',
        trans_ref: trimmedRef,
      },
      config,
      fetchFn
    );
    if (!txInsertRes.ok) {
      const txErr = await txInsertRes.text();
      if (txInsertRes.status === 409 || txErr.includes('23505')) {
        return {
          success: false,
          errorCode: 'SLIP_DUPLICATE_REF',
          trialCredits: 0,
          purchasedCredits: 0,
          balance: 0,
        };
      }
      throw new Error(`Top-up ledger REST insert failed (${txInsertRes.status}): ${txErr}`);
    }

    return {
      success: true,
      trialCredits: current.trialCredits,
      purchasedCredits: nextPurchased,
      balance: current.trialCredits + nextPurchased,
    };
  }

  const rows = (await rpcRes.json()) as Array<{
    success?: boolean;
    error_code?: string | null;
    trial_credits?: number;
    purchased_credits?: number;
    balance?: number;
  }>;
  const row = Array.isArray(rows) ? rows[0] : rows;

  return {
    success: Boolean(row?.success),
    errorCode: row?.error_code || undefined,
    trialCredits: Number(row?.trial_credits ?? 0),
    purchasedCredits: Number(row?.purchased_credits ?? 0),
    balance: Number(row?.balance ?? 0),
  };
}

export interface WalletBalanceSummary {
  balance: number;
  trialCredits: number;
  purchasedCredits: number;
}

export type ServerBillingPreDeductResult =
  | { active: false }
  | { active: true; userId: string; wallet: WalletBalanceSummary }
  | { active: true; errorStatus: number; error: string; errorCode?: string };

/**
 * Helper สำหรับ Advance AI routes:
 * - ในโหมด production: บังคับ Google Auth (401) และ Server Wallet (503) สำหรับทุกคำขอ AI เสียเครดิตเสมอ
 * - ในโหมด standalone: ทำงานร่วมกับ Postgres Wallet เมื่อส่ง Bearer Token + ตั้งค่า Service Role แล้ว มิฉะนั้น fallback ปลอดภัย
 */
export async function tryServerBillingPreDeduct(
  request: Request,
  cost: number,
  description: string,
  options?: { requirePurchased?: boolean; modelId?: string; fetchFn?: FetchLike; config?: ServerBillingConfig }
): Promise<ServerBillingPreDeductResult> {
  const config = options?.config ?? getServerBillingConfig();
  const hasServerWallet = Boolean(config.supabaseUrl && config.serviceRoleKey);
  if (!hasServerWallet) {
    if (config.billingMode === 'production') {
      return {
        active: true,
        errorStatus: 503,
        error: 'ระบบกระเป๋าเครดิตฝั่งเซิร์ฟเวอร์ยังไม่ได้ตั้งค่า (SUPABASE_SERVICE_ROLE_KEY)',
        errorCode: 'BILLING_NOT_CONFIGURED',
      };
    }
    return { active: false };
  }

  const token = extractBearerToken(request);
  if (!token) {
    if (config.billingMode === 'production') {
      return {
        active: true,
        errorStatus: 401,
        error: options?.requirePurchased
          ? 'โมเดล Pro ราคาสูงต้องเข้าสู่ระบบด้วย Google และเติมแพ็กเกจเครดิตก่อนใช้งาน'
          : 'กรุณาเข้าสู่ระบบด้วย Google ก่อนใช้งานฟีเจอร์ AI (401 Unauthorized)',
        errorCode: options?.requirePurchased ? 'AUTH_REQUIRED_FOR_PRO_MODEL' : 'AUTH_REQUIRED',
      };
    }
    return { active: false };
  }

  const auth = await verifySupabaseUserFromRequest(request, { config, fetchFn: options?.fetchFn });
  if (!auth.ok) {
    return {
      active: true,
      errorStatus: auth.status,
      error: auth.error,
      errorCode: auth.code,
    };
  }

  const deducted = await atomicDeductCredits(auth.user.id, cost, description, {
    requirePurchased: options?.requirePurchased,
    modelId: options?.modelId,
    config,
    fetchFn: options?.fetchFn,
  });

  if (!deducted.success) {
    return {
      active: true,
      errorStatus: 402,
      error:
        deducted.errorCode === 'REQUIRES_PURCHASED_CREDITS'
          ? 'ฟีเจอร์ Pro (Lyria 3.5 / Argon) ต้องใช้เครดิตจากการเติมแพ็กเกจ (Purchased Credits)'
          : 'เครดิตคงเหลือไม่เพียงพอ กรุณาเติมเครดิตผ่าน PromptPay',
      errorCode: deducted.errorCode || 'INSUFFICIENT_CREDITS',
    };
  }

  return {
    active: true,
    userId: auth.user.id,
    wallet: {
      balance: deducted.balance,
      trialCredits: deducted.trialCredits,
      purchasedCredits: deducted.purchasedCredits,
    },
  };
}

/** คืนเครดิตฝั่ง Server แบบปลอดภัยทันทีเมื่อ Gemini ล้มเหลว/คืนผลจำลอง */
export async function refundServerBillingOnFailure(
  billing: ServerBillingPreDeductResult,
  amount: number,
  description: string,
  options?: { toPurchased?: boolean; modelId?: string; fetchFn?: FetchLike; config?: ServerBillingConfig }
): Promise<WalletBalanceSummary | undefined> {
  if (!billing.active || 'errorStatus' in billing) {
    return undefined;
  }

  const refunded = await atomicRefundCredits(billing.userId, amount, description, options).catch(
    () => null
  );
  if (!refunded?.success) {
    return undefined;
  }

  return {
    balance: refunded.balance,
    trialCredits: refunded.trialCredits,
    purchasedCredits: refunded.purchasedCredits,
  };
}
