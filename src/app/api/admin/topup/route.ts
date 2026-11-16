import { NextResponse } from 'next/server';
import {
  getServerBillingConfig,
  type FetchLike,
  type ServerBillingConfig,
} from '@/lib/serverWallet';
import { verifyAdminRequest } from '@/lib/serverAdminAuth';
import {
  executeAdminManualTopup,
  fetchAdminTopupDashboardData,
} from '@/lib/serverTopupAdmin';

export async function handleGetAdminTopupRequest(
  request: Request,
  options?: {
    adminKey?: string;
    adminEmails?: string;
    fetchFn?: FetchLike;
    config?: ServerBillingConfig;
  }
) {
  const config = options?.config ?? getServerBillingConfig();

  const auth = await verifyAdminRequest(request, {
    adminKey: options?.adminKey,
    adminEmails: options?.adminEmails,
    fetchFn: options?.fetchFn,
    config,
  });

  if (!auth.authorized) {
    return NextResponse.json(
      {
        error: auth.error || 'Unauthorized',
        code: auth.code || 'ANALYTICS_UNAUTHORIZED',
        ...(auth.viewerEmail ? { viewerEmail: auth.viewerEmail } : {}),
      },
      { status: auth.status }
    );
  }

  try {
    const data = await fetchAdminTopupDashboardData({
      config,
      fetchFn: options?.fetchFn,
    });

    return NextResponse.json({
      ok: true,
      authMethod: auth.authMethod,
      ...(auth.viewerEmail ? { viewerEmail: auth.viewerEmail } : {}),
      ...data,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Failed to load topup dashboard data',
        code: 'ADMIN_TOPUP_LOAD_FAILED',
      },
      { status: 500 }
    );
  }
}

export async function handlePostAdminTopupRequest(
  request: Request,
  options?: {
    adminKey?: string;
    adminEmails?: string;
    fetchFn?: FetchLike;
    config?: ServerBillingConfig;
  }
) {
  const config = options?.config ?? getServerBillingConfig();

  const auth = await verifyAdminRequest(request, {
    adminKey: options?.adminKey,
    adminEmails: options?.adminEmails,
    fetchFn: options?.fetchFn,
    config,
  });

  if (!auth.authorized) {
    return NextResponse.json(
      {
        error: auth.error || 'Unauthorized',
        code: auth.code || 'ANALYTICS_UNAUTHORIZED',
        ...(auth.viewerEmail ? { viewerEmail: auth.viewerEmail } : {}),
      },
      { status: auth.status }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: 'Invalid JSON payload in request body',
        code: 'INVALID_JSON',
      },
      { status: 400 }
    );
  }

  const payload = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const userIdOrEmail = String(payload.userIdOrEmail || payload.userId || payload.email || '').trim();
  const amount = Number(payload.amount);
  const creditType = payload.creditType === 'trial' ? 'trial' : 'purchased';
  const reason = String(payload.reason || '').trim();

  const result = await executeAdminManualTopup({
    targetUserIdOrEmail: userIdOrEmail,
    amount,
    creditType,
    reason,
    adminEmail: auth.viewerEmail,
    config,
    fetchFn: options?.fetchFn,
  });

  if (!result.success) {
    return NextResponse.json(
      {
        error: result.error || 'Failed to execute manual top-up',
        code: 'MANUAL_TOPUP_FAILED',
      },
      { status: result.status }
    );
  }

  return NextResponse.json({
    ok: true,
    message: result.message,
    targetUser: result.targetUser,
    wallet: result.wallet,
    authMethod: auth.authMethod,
    ...(auth.viewerEmail ? { viewerEmail: auth.viewerEmail } : {}),
  });
}

export async function GET(request: Request) {
  return handleGetAdminTopupRequest(request);
}

export async function POST(request: Request) {
  return handlePostAdminTopupRequest(request);
}
