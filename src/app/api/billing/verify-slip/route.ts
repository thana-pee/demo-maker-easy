import { NextResponse } from 'next/server';
import { CREDIT_PACKAGES } from '@/lib/creditManager';
import {
  ALLOWED_SLIP_MIME_TYPES,
  MAX_SLIP_FILE_BYTES,
  completeTopUpFromSlipInDb,
  getOrInitWallet,
  getServerBillingConfig,
  getTopUpOrderById,
  isTransRefAlreadyUsed,
  validateSlipAgainstOrder,
  verifySlipImageWithProvider,
  verifySupabaseUserFromRequest,
  type FetchLike,
  type ServerBillingConfig,
} from '@/lib/serverWallet';
import { recordServerFeatureEvent } from '@/lib/serverAnalytics';

async function parseSlipUploadInput(request: Request): Promise<
  | {
      ok: true;
      orderId: string;
      bytes: Uint8Array;
      mimeType: string;
      fileName: string;
    }
  | { ok: false; status: number; code: string; error: string }
> {
  const contentType = (request.headers.get('content-type') || '').toLowerCase();

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const orderId = String(form.get('orderId') || '').trim();
    const file = form.get('file') ?? form.get('slip');

    if (!orderId) {
      return { ok: false, status: 400, code: 'MISSING_ORDER_ID', error: 'กรุณาระบุรหัสคำสั่งซื้อ (orderId)' };
    }
    if (!file || !(file instanceof Blob)) {
      return { ok: false, status: 400, code: 'MISSING_SLIP_FILE', error: 'กรุณาแนบไฟล์รูปภาพสลิปโอนเงิน' };
    }

    const mimeType = (file.type || 'image/jpeg').toLowerCase();
    if (!ALLOWED_SLIP_MIME_TYPES.has(mimeType)) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_FILE_TYPE',
        error: 'รองรับเฉพาะไฟล์รูปภาพสลิป JPG, PNG หรือ WebP เท่านั้น',
      };
    }

    if (file.size <= 0 || file.size > MAX_SLIP_FILE_BYTES) {
      return {
        ok: false,
        status: 400,
        code: 'SLIP_TOO_LARGE',
        error: 'ขนาดไฟล์สลิปต้องไม่เกิน 4MB',
      };
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const fileName = 'name' in file && typeof file.name === 'string' && file.name ? file.name : 'slip.jpg';
    return { ok: true, orderId, bytes, mimeType, fileName };
  }

  let body: {
    orderId?: unknown;
    slipBase64?: unknown;
    mimeType?: unknown;
    fileName?: unknown;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return { ok: false, status: 400, code: 'INVALID_BODY', error: 'Invalid JSON request body' };
  }

  const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
  const slipRaw = typeof body.slipBase64 === 'string' ? body.slipBase64.trim() : '';
  if (!orderId) {
    return { ok: false, status: 400, code: 'MISSING_ORDER_ID', error: 'กรุณาระบุรหัสคำสั่งซื้อ (orderId)' };
  }
  if (!slipRaw) {
    return { ok: false, status: 400, code: 'MISSING_SLIP_FILE', error: 'กรุณาแนบภาพสลิปโอนเงิน' };
  }

  let detectedMime = typeof body.mimeType === 'string' ? body.mimeType.toLowerCase() : 'image/jpeg';
  let base64Payload = slipRaw;
  const dataUrlMatch = slipRaw.match(/^data:([^;]+);base64,(.+)$/i);
  if (dataUrlMatch) {
    detectedMime = dataUrlMatch[1].toLowerCase();
    base64Payload = dataUrlMatch[2];
  }

  if (!ALLOWED_SLIP_MIME_TYPES.has(detectedMime)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_FILE_TYPE',
      error: 'รองรับเฉพาะไฟล์รูปภาพสลิป JPG, PNG หรือ WebP เท่านั้น',
    };
  }

  const buf = Buffer.from(base64Payload, 'base64');
  if (buf.byteLength <= 0 || buf.byteLength > MAX_SLIP_FILE_BYTES) {
    return {
      ok: false,
      status: 400,
      code: 'SLIP_TOO_LARGE',
      error: 'ขนาดไฟล์สลิปต้องไม่เกิน 4MB',
    };
  }

  return {
    ok: true,
    orderId,
    bytes: new Uint8Array(buf),
    mimeType: detectedMime,
    fileName: typeof body.fileName === 'string' && body.fileName ? body.fileName : 'slip.jpg',
  };
}

export async function handleVerifySlipRequest(
  request: Request,
  options?: { fetchFn?: FetchLike; config?: ServerBillingConfig; nowMs?: number }
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

  if (!config.slipVerifyApiUrl || !config.slipVerifyApiKey) {
    return NextResponse.json(
      {
        error: 'ยังไม่ได้ตั้งค่า SLIP_VERIFY_API_URL / SLIP_VERIFY_API_KEY สำหรับตรวจสลิปอัตโนมัติ',
        code: 'SLIP_PROVIDER_NOT_CONFIGURED',
      },
      { status: 503 }
    );
  }

  const parsedInput = await parseSlipUploadInput(request);
  if (!parsedInput.ok) {
    return NextResponse.json(
      { error: parsedInput.error, code: parsedInput.code },
      { status: parsedInput.status }
    );
  }

  try {
    const order = await getTopUpOrderById(parsedInput.orderId, auth.user.id, {
      fetchFn: options?.fetchFn,
      config,
    });
    if (!order) {
      return NextResponse.json(
        { error: 'ไม่พบคำสั่งซื้อ PromptPay นี้ในบัญชีของคุณ', code: 'ORDER_NOT_FOUND' },
        { status: 404 }
      );
    }

    if (order.status !== 'pending') {
      return NextResponse.json(
        { error: 'คำสั่งซื้อนี้ได้รับการชำระเงินหรือยกเลิกไปแล้ว', code: 'ORDER_ALREADY_SETTLED' },
        { status: 409 }
      );
    }

    const nowMs = options?.nowMs ?? Date.now();
    const expiresMs = Date.parse(order.expiresAt);
    if (Number.isFinite(expiresMs) && nowMs > expiresMs) {
      return NextResponse.json(
        { error: 'QR คำสั่งซื้อนี้หมดอายุแล้ว กรุณากดสร้าง QR ใหม่อีกครั้ง', code: 'ORDER_EXPIRED' },
        { status: 400 }
      );
    }

    const pkg = CREDIT_PACKAGES.find((item) => item.id === order.packageId);
    const serverCredits = pkg ? pkg.credits : order.creditsToGrant;
    const expectedAmount = pkg ? pkg.priceThb : order.expectedAmountThb;

    const slipData = await verifySlipImageWithProvider(
      {
        bytes: parsedInput.bytes,
        mimeType: parsedInput.mimeType,
        fileName: parsedInput.fileName,
        amountThb: expectedAmount,
      },
      config,
      options?.fetchFn
    );

    const existingTransRefUsed = slipData.transRef
      ? await isTransRefAlreadyUsed(slipData.transRef, {
          fetchFn: options?.fetchFn,
          config,
        })
      : false;

    const validation = validateSlipAgainstOrder(
      slipData,
      { expectedAmountThb: expectedAmount },
      config,
      { existingTransRefUsed, nowMs }
    );
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error, code: validation.code },
        { status: validation.status }
      );
    }

    const bonusLabel =
      pkg && pkg.bonusCredits > 0 ? ` (${pkg.baseCredits} + แถม ${pkg.bonusCredits})` : '';
    const pkgName = pkg?.name || order.packageId;
    const txDesc = `PromptPay Top-Up ${pkgName} (+${serverCredits} Credits${bonusLabel} / ${expectedAmount}฿) [Ref: ${slipData.transRef}]`;

    const credited = await completeTopUpFromSlipInDb(
      {
        orderId: order.id,
        userId: auth.user.id,
        transRef: slipData.transRef,
        credits: serverCredits,
        description: txDesc,
        senderBank: slipData.sendingBank,
      },
      { fetchFn: options?.fetchFn, config }
    );

    if (!credited.success) {
      const status =
        credited.errorCode === 'SLIP_DUPLICATE_REF' || credited.errorCode === 'ORDER_ALREADY_SETTLED'
          ? 409
          : 400;
      const errMsg =
        credited.errorCode === 'SLIP_DUPLICATE_REF'
          ? `สลิปเลขอ้างอิง ${slipData.transRef} ถูกใช้ไปแล้ว ไม่สามารถใช้ซ้ำได้`
          : credited.errorCode === 'ORDER_ALREADY_SETTLED'
          ? 'คำสั่งซื้อนี้ถูกเติมเครดิตไปแล้ว'
          : 'ไม่สามารถปรับยอดเครดิตได้ กรุณาติดต่อผู้ดูแลระบบ';
      return NextResponse.json(
        { error: errMsg, code: credited.errorCode || 'TOPUP_FAILED' },
        { status }
      );
    }

    const wallet = await getOrInitWallet(auth.user.id, {
      fetchFn: options?.fetchFn,
      config,
    });

    await recordServerFeatureEvent(
      request,
      {
        eventName: 'billing_topup_verified',
        category: 'billing',
        featureVariant: order.packageId,
        creditsCost: serverCredits,
        isSimulated: false,
        metadata: {
          packageId: order.packageId,
          creditsGranted: serverCredits,
        },
      },
      {
        userId: auth.user.id,
        skipAuthLookup: true,
        fetchFn: options?.fetchFn,
        config,
      }
    );

    return NextResponse.json({
      success: true,
      transRef: slipData.transRef,
      creditedAmount: serverCredits,
      senderBank: slipData.sendingBank,
      wallet,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดระหว่างตรวจสอบสลิป',
        code: 'SLIP_VERIFY_ERROR',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return handleVerifySlipRequest(request);
}
