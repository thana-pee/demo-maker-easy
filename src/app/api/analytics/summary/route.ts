import { NextResponse } from 'next/server';
import { fetchAnalyticsSummaryServer } from '@/lib/serverAnalytics';
import {
  extractBearerToken,
  getServerBillingConfig,
  type FetchLike,
  type ServerBillingConfig,
} from '@/lib/serverWallet';

function isAuthorizedAdminRequest(
  request: Request,
  adminKey: string,
  serviceRoleKey: string
): boolean {
  const expectedKey = adminKey || serviceRoleKey;
  if (!expectedKey) return false;

  const headerKey = request.headers.get('x-analytics-key')?.trim() || '';
  const bearerKey = extractBearerToken(request) || '';
  return (Boolean(headerKey) && headerKey === expectedKey) || (Boolean(bearerKey) && bearerKey === expectedKey);
}

export async function handleGetAnalyticsSummaryRequest(
  request: Request,
  options?: {
    adminKey?: string;
    nowMs?: number;
    fetchFn?: FetchLike;
    config?: ServerBillingConfig;
  }
) {
  const config = options?.config ?? getServerBillingConfig();
  const adminKey = (options?.adminKey ?? process.env.ANALYTICS_ADMIN_KEY ?? '').trim();

  if (!isAuthorizedAdminRequest(request, adminKey, config.serviceRoleKey)) {
    return NextResponse.json(
      {
        error: 'Unauthorized: provide x-analytics-key or Bearer token matching ANALYTICS_ADMIN_KEY',
        code: 'ANALYTICS_UNAUTHORIZED',
      },
      { status: 401 }
    );
  }

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
