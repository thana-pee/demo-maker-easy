import { NextResponse } from 'next/server';
import { fetchAnalyticsSummaryServer } from '@/lib/serverAnalytics';
import {
  getServerBillingConfig,
  type FetchLike,
  type ServerBillingConfig,
} from '@/lib/serverWallet';
import {
  parseAdminEmails,
  verifyAdminRequest,
} from '@/lib/serverAdminAuth';

export { parseAdminEmails };

export async function handleGetAnalyticsSummaryRequest(
  request: Request,
  options?: {
    adminKey?: string;
    adminEmails?: string;
    nowMs?: number;
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

  const authMethod = auth.authMethod;
  const viewerEmail = auth.viewerEmail;

  let days = 30;
  try {
    const url = new URL(request.url);
    const parsedDays = Number(url.searchParams.get('days'));
    if (Number.isFinite(parsedDays) && parsedDays >= 1) {
      days = Math.min(90, Math.round(parsedDays));
    }
  } catch {
    days = 30;
  }

  try {
    const data = await fetchAnalyticsSummaryServer({
      days,
      nowMs: options?.nowMs,
      fetchFn: options?.fetchFn,
      config,
    });
    return NextResponse.json({
      ok: true,
      authMethod,
      ...(viewerEmail ? { viewerEmail } : {}),
      ...data,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Failed to load analytics summary',
        code: 'ANALYTICS_SUMMARY_FAILED',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return handleGetAnalyticsSummaryRequest(request);
}
