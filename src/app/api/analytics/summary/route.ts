import { NextResponse } from 'next/server';
import { fetchAnalyticsSummaryServer } from '@/lib/serverAnalytics';
import {
  extractBearerToken,
  getServerBillingConfig,
  verifySupabaseUserFromRequest,
  type FetchLike,
  type ServerBillingConfig,
} from '@/lib/serverWallet';

export function parseAdminEmails(raw?: string): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(/[\s,;]+/)) {
    const clean = part.trim().toLowerCase();
    if (clean && clean.includes('@')) {
      seen.add(clean);
    }
  }
  return Array.from(seen);
}

function isStaticKeyAuthorized(
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

function looksLikeJwt(token: string): boolean {
  return token.split('.').length === 3;
}

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
  const adminKey = (options?.adminKey ?? process.env.ANALYTICS_ADMIN_KEY ?? '').trim();
  const adminEmails = parseAdminEmails(
    options?.adminEmails ?? process.env.ANALYTICS_ADMIN_EMAILS ?? process.env.ADMIN_EMAILS
  );

  let authMethod: 'admin-key' | 'google-admin' | null = null;
  let viewerEmail: string | undefined;

  if (isStaticKeyAuthorized(request, adminKey, config.serviceRoleKey)) {
    authMethod = 'admin-key';
  } else {
    const bearerToken = extractBearerToken(request) || '';
    if (bearerToken && looksLikeJwt(bearerToken)) {
      const auth = await verifySupabaseUserFromRequest(request, {
        config,
        fetchFn: options?.fetchFn,
      });
      if (auth.ok) {
        viewerEmail = auth.user.email;
        const normalizedEmail = auth.user.email?.trim().toLowerCase() || '';
        if (adminEmails.length === 0) {
          return NextResponse.json(
            {
              error:
                'ยังไม่ได้ตั้งค่า ANALYTICS_ADMIN_EMAILS บนเซิร์ฟเวอร์ (เพิ่มอีเมลของคุณใน Vercel หรือกรอก ANALYTICS_ADMIN_KEY)',
              code: 'ADMIN_EMAILS_NOT_CONFIGURED',
              ...(viewerEmail ? { viewerEmail } : {}),
            },
            { status: 403 }
          );
        }
        if (!normalizedEmail || !adminEmails.includes(normalizedEmail)) {
          return NextResponse.json(
            {
              error: 'บัญชี Google นี้ไม่ได้อยู่ในรายชื่อผู้ดูแลระบบ (ANALYTICS_ADMIN_EMAILS)',
              code: 'ANALYTICS_FORBIDDEN',
              ...(viewerEmail ? { viewerEmail } : {}),
            },
            { status: 403 }
          );
        }
        authMethod = 'google-admin';
      }
    }
  }

  if (!authMethod) {
    return NextResponse.json(
      {
        error: 'Unauthorized: provide x-analytics-key or sign in with an authorized Google admin email',
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
