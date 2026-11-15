import QRCode from 'qrcode';

export interface NormalizedPromptPayTarget {
  kind: 'mobile' | 'tax_id' | 'ewallet';
  subTag: '01' | '02' | '03';
  formattedId: string;
  rawDigits: string;
  maskedDisplay: string;
}

function formatTlv(tag: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${tag}${len}${value}`;
}

/** คำนวณ Checksum CRC-16/CCITT-FALSE (Polynomial 0x1021, Init 0xFFFF) ตามมาตรฐาน EMVCo */
export function crc16Ccitt(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= (data.charCodeAt(i) & 0xff) << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * แปลง PromptPay ID ให้เป็นรูปแบบมาตรฐานธนาคารแห่งประเทศไทย:
 * - เบอร์มือถือ 10 หลัก (08x...) หรือ +66... -> Tag 01 รูปแบบ 0066xxxxxxxxx (13 หลัก)
 * - เลขบัตรประชาชน / Tax ID 13 หลัก -> Tag 02
 * - e-Wallet ID 15 หลัก -> Tag 03
 */
export function normalizePromptPayReceiver(rawId: string): NormalizedPromptPayTarget {
  const cleaned = rawId.trim().replace(/[\s-]/g, '');
  if (!cleaned) {
    throw new Error('กรุณาระบุ PromptPay ID (PROMPTPAY_RECEIVER_ID)');
  }

  let digits = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;
  if (!/^\d+$/.test(digits)) {
    throw new Error('PromptPay ID ต้องเป็นตัวเลขเท่านั้น');
  }

  // เบอร์มือถือไทย 0xxxxxxxxx (10 หลัก) หรือ 66xxxxxxxxx (11 หลัก) หรือ 0066xxxxxxxxx (13 หลักขึ้นต้น 0066)
  if (digits.length === 10 && digits.startsWith('0')) {
    const mobile9 = digits.slice(1);
    return {
      kind: 'mobile',
      subTag: '01',
      formattedId: `0066${mobile9}`,
      rawDigits: digits,
      maskedDisplay: `${digits.slice(0, 3)}-xxx-${digits.slice(-4)}`,
    };
  }

  if (digits.length === 11 && digits.startsWith('66')) {
    const localDigits = `0${digits.slice(2)}`;
    return {
      kind: 'mobile',
      subTag: '01',
      formattedId: `00${digits}`,
      rawDigits: localDigits,
      maskedDisplay: `${localDigits.slice(0, 3)}-xxx-${localDigits.slice(-4)}`,
    };
  }

  if (digits.length === 13 && digits.startsWith('0066')) {
    const localDigits = `0${digits.slice(4)}`;
    return {
      kind: 'mobile',
      subTag: '01',
      formattedId: digits,
      rawDigits: localDigits,
      maskedDisplay: `${localDigits.slice(0, 3)}-xxx-${localDigits.slice(-4)}`,
    };
  }

  // เลขประจำตัวผู้เสียภาษี / บัตรประชาชน 13 หลัก
  if (digits.length === 13) {
    return {
      kind: 'tax_id',
      subTag: '02',
      formattedId: digits,
      rawDigits: digits,
      maskedDisplay: `x-xxxx-xxxxx-${digits.slice(-3)}`,
    };
  }

  // e-Wallet ID 15 หลัก
  if (digits.length === 15) {
    digits = digits.slice(0, 15);
    return {
      kind: 'ewallet',
      subTag: '03',
      formattedId: digits,
      rawDigits: digits,
      maskedDisplay: `xxx-xxxx-xxxx-${digits.slice(-4)}`,
    };
  }

  throw new Error('รูปแบบ PromptPay ID ไม่ถูกต้อง (รองรับเบอร์มือถือ 10 หลัก, บัตร/Tax ID 13 หลัก หรือ e-Wallet 15 หลัก)');
}

/**
 * สร้าง EMVCo PromptPay Payload String พร้อม CRC16 Checksum
 * สำหรับให้แอปธนาคารไทยทุกค่ายสแกนโอนด้วยยอดเงินที่ล็อกไว้ได้ทันที
 */
export function generatePromptPayPayload(
  receiverId: string,
  amountThb?: number,
  referenceLabel?: string
): string {
  const target = normalizePromptPayReceiver(receiverId);
  const hasAmount = typeof amountThb === 'number' && Number.isFinite(amountThb) && amountThb > 0;

  const merchantAccountValue =
    formatTlv('00', 'A000000677010111') +
    formatTlv(target.subTag, target.formattedId);

  const chunks: string[] = [
    formatTlv('00', '01'), // Payload Format Indicator
    formatTlv('01', hasAmount ? '12' : '11'), // 12 = Dynamic QR, 11 = Static QR
    formatTlv('29', merchantAccountValue), // PromptPay Merchant Account Info
    formatTlv('53', '764'), // Currency Code THB (ISO 4217)
  ];

  if (hasAmount) {
    chunks.push(formatTlv('54', amountThb.toFixed(2)));
  }

  chunks.push(formatTlv('58', 'TH')); // Country Code

  if (referenceLabel?.trim()) {
    const cleanRef = referenceLabel.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20);
    if (cleanRef) {
      chunks.push(formatTlv('62', formatTlv('05', cleanRef)));
    }
  }

  const unsignedPayload = `${chunks.join('')}6304`;
  const checksum = crc16Ccitt(unsignedPayload);
  return `${unsignedPayload}${checksum}`;
}

/** สร้าง Vector QR Code (SVG String) สำหรับแสดงบนหน้าเว็บ */
export async function generatePromptPayQrSvg(payload: string): Promise<string> {
  return QRCode.toString(payload, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 240,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
}

/** สร้าง SVG Data URL ที่ใช้กับ <img src="..." /> ได้ทันทีทั้งฝั่ง Server และ Client */
export async function generatePromptPayQrDataUrl(payload: string): Promise<string> {
  const svg = await generatePromptPayQrSvg(payload);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
