import { NextResponse } from 'next/server';
import { ANALYTICS_HEADER_ANON_ID, sanitizeAnalyticsEvent } from '@/lib/analytics';
import { recordUsageEventsServer } from '@/lib/serverAnalytics';
import {
  extractBearerToken,
  getServerBillingConfig,
  verifySupabaseUserFromRequest,
  type FetchLike,
  type ServerBillingConfig,
} from '@/lib/serverWallet';

const MAX_BATCH_SIZE = 20;

export async function handleTrackAnalyticsRequest(
  request: Request,
  options?: { fetchFn?: FetchLike; config?: ServerBillingConfig }
) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }

  if (!rawBody || typeof rawBody !== 'object') {
    return NextResponse.json({ error: 'Request payload must be a JSON object' }, { status: 400 });
  }

  const rawList = Array.isArray((rawBody as { events?: unknown }).events)
    ? (rawBody as { events: unknown[] }).events.slice(0, MAX_BATCH_SIZE)
    : [rawBody];

  const sanitizedEvents = rawList
    .map((item) => sanitizeAnalyticsEvent(item))
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (sanitizedEvents.length === 0) {
    return NextResponse.json({ error: 'No valid analytics events provided' }, { status: 400 });
  }

  const config = options?.config ?? getServerBillingConfig();
  const anonHeader = request.headers.get(ANALYTICS_HEADER_ANON_ID)?.trim() || undefined;
  let userId: string | undefined;

  if (config.supabaseUrl && extractBearerToken(request)) {
    const auth = await verifySupabaseUserFromRequest(request, {
      config,
      fetchFn: options?.fetchFn,
    });
    if (auth.ok) {
      userId = auth.user.id;
    }
  }

  const result = await recordUsageEventsServer(
    sanitizedEvents.map((event) => ({
      event,
      userId,
      anonIdFallback: anonHeader,
    })),
    { config, fetchFn: options?.fetchFn }
  );

  return NextResponse.json({
    ok: true,
    accepted: sanitizedEvents.length,
    stored: result.stored,
    ...(result.reason ? { reason: result.reason } : {}),
  });
}

export async function POST(request: Request) {
  return handleTrackAnalyticsRequest(request);
}
