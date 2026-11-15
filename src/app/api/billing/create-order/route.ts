import { NextResponse } from 'next/server';
import { CREDIT_PACKAGES } from '@/lib/creditManager';
import {
  createPendingTopUpOrder,
  getServerBillingConfig,
  verifySupabaseUserFromRequest,
  type FetchLike,
  type ServerBillingConfig,
} from '@/lib/serverWallet';

export async function handleCreateOrderRequest(
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

  if (!config.promptPayReceiverId) {
    return NextResponse.json(
      {
        error: 'ยังไม่ได้ตั้งค่า PROMPTPAY_RECEIVER_ID สำหรับรับชำระเงินบนเซิร์ฟเวอร์',
        code: 'PROMPTPAY_NOT_CONFIGURED',
      },
      { status: 503 }
    );
  }

  let body: { packageId?: unknown } = {};
  try {
    body = (await request.json()) as { packageId?: unknown };
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON request body', code: 'INVALID_BODY' },
      { status: 400 }
    );
  }

  const packageId = typeof body.packageId === 'string' ? body.packageId.trim() : '';
  const pkg = CREDIT_PACKAGES.find((item) => item.id === packageId);
  if (!pkg) {
    return NextResponse.json(
      { error: 'ไม่พบแพ็กเกจเครดิตที่เลือก', code: 'INVALID_PACKAGE' },
      { status: 400 }
    );
  }

  try {
    const created = await createPendingTopUpOrder(auth.user.id, pkg, {
      fetchFn: options?.fetchFn,
      config,
    });

    return NextResponse.json({
      orderId: created.order.id,
      packageId: pkg.id,
      packageName: pkg.name,
      amountThb: pkg.priceThb,
      baseCredits: pkg.baseCredits,
      bonusCredits: pkg.bonusCredits,
      creditsToGrant: pkg.credits,
      promptpayPayload: created.order.promptpayPayload,
      qrSvgDataUrl: created.qrSvgDataUrl,
      receiverName: created.receiverName,
      maskedReceiver: created.maskedReceiver,
      expiresAt: created.order.expiresAt,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Failed to create PromptPay order',
        code: 'ORDER_CREATE_FAILED',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return handleCreateOrderRequest(request);
}
