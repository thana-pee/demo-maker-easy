import { NextResponse } from 'next/server';
import {
  getOrInitWallet,
  getServerBillingConfig,
  verifySupabaseUserFromRequest,
  type FetchLike,
  type ServerBillingConfig,
} from '@/lib/serverWallet';

export async function handleGetWalletRequest(
  request: Request,
  options?: { fetchFn?: FetchLike; config?: ServerBillingConfig }
) {
  const config = options?.config ?? getServerBillingConfig();
  const auth = await verifySupabaseUserFromRequest(request, {
    fetchFn: options?.fetchFn,
    config,
  });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status });
  }

  if (!config.serviceRoleKey) {
    return NextResponse.json(
      {
        error: 'ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY บนเซิร์ฟเวอร์',
        code: 'SERVICE_ROLE_NOT_CONFIGURED',
      },
      { status: 503 }
    );
  }

  try {
    const wallet = await getOrInitWallet(auth.user.id, {
      fetchFn: options?.fetchFn,
      config,
    });
    return NextResponse.json({
      wallet,
      user: auth.user,
      billingMode: config.billingMode,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Failed to load server wallet',
        code: 'WALLET_FETCH_FAILED',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return handleGetWalletRequest(request);
}
