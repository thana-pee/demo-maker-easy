/**
 * creditManager.ts — จัดการ Credit Wallet, ตารางราคาเหรียญ & Transaction Ledger (Phase 5A)
 *
 * - เครดิตทดลองเริ่มต้น: 15 Credits (DEFAULT_STARTER_CREDITS) — คุ้มค่าและควบคุมต้นทุน CAC
 * - แยกกระเป๋า Trial Credits vs Purchased Credits เพื่อป้องกันการใช้งานโมเดลราคาสูงฟรี (Anti-Loss Guard)
 * - จัดเก็บใน localStorage อย่างปลอดภัย พร้อม in-memory fallback สำหรับ SSR / Node tests
 */

import { generateUniqueId } from './sectionUtils';

export interface CreditPackage {
  id: string;
  name: string;
  baseCredits: number;
  bonusCredits: number;
  credits: number;
  priceThb: number;
  badge?: string;
}

export interface CreditTransaction {
  id: string;
  type: 'starter' | 'grant_trial' | 'topup' | 'spend' | 'refund';
  amount: number;
  description: string;
  createdAt: string;
}

export interface WalletBreakdown {
  balance: number;
  trialCredits: number;
  purchasedCredits: number;
}

interface CreditWalletState {
  balance: number;
  trialCredits: number;
  purchasedCredits: number;
  transactions: CreditTransaction[];
}

export const DEFAULT_STARTER_CREDITS = 15;
const WALLET_STORAGE_KEY = 'demo_maker_credit_wallet_v1';

/**
 * ตารางราคาเหรียญกลางตามมาตรฐาน Phase 5 (คำนวณต้นทุนจริงกับโมเดลตระกูล Gemini / Lyria)
 * หมายเหตุ: 1 เหรียญในแพ็กเกจคุ้มสุดมีราคาพื้นราว 0.62 บาท และ Margin ปลอดภัยทุกปุ่ม
 */
export const CREDIT_COST_TABLE = {
  localTools: 0,            // Local Audio Synth, Rhyme Helper, Chord Palette, Local AI Director
  aiLyricsQuick: 1,         // gemini-3.5-flash-lite (แต่ง/ขัดเกลาเนื้อร้อง 1 ท่อน)
  aiDirectorComplex: 1,     // gemini-3.5-flash-lite (AI Song Director แบบวิเคราะห์อารมณ์ซับซ้อน)
  aiSectionDeepMelody: 2,   // gemini-4-hydrogen (แต่งเนื้อ + คอร์ด + โน้ตเมโลดี้ 1 ท่อน)
  aiTtsCue: 2,              // gemini-3.8-flash-lite-tts / gemini-3.8-flash-tts (เสียงไกด์/นับจังหวะ)
  aiHumToSong: 3,           // gemini-3.5-transcribe + gemini-4-hydrogen (ฮัมเพลงเป็นโครงเดโม)
  aiEasyWholeSong: 4,       // gemini-4-hydrogen (สร้างเพลงทั้งเพลงในโหมด Easy)
  aiReferenceTrackLyria: 8, // lyria-3.5 (Paid-Only Reference Track Preview ~30 วินาที)
  aiProArgonArranger: 10,   // gemini-4-argon (Paid-Only Deep Producer Arranger)
} as const;

export const CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: 'pkg-mini',
    name: 'Mini Pack',
    baseCredits: 50,
    bonusCredits: 0,
    credits: 50,
    priceThb: 49,
    badge: 'ทดลองคุ้ม',
  },
  {
    id: 'pkg-starter',
    name: 'Starter Pack',
    baseCredits: 100,
    bonusCredits: 10,
    credits: 110,
    priceThb: 99,
    badge: 'แถม +10',
  },
  {
    id: 'pkg-pro',
    name: 'Pro Songwriter',
    baseCredits: 300,
    bonusCredits: 40,
    credits: 340,
    priceThb: 249,
    badge: 'นิยม +40',
  },
  {
    id: 'pkg-studio',
    name: 'Studio Pack',
    baseCredits: 700,
    bonusCredits: 100,
    credits: 800,
    priceThb: 499,
    badge: 'คุ้มสุด +100',
  },
];

let memoryWallet: CreditWalletState | null = null;

function getSafeStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof globalThis !== 'undefined') {
      const globalStorage = (globalThis as { localStorage?: Storage }).localStorage;
      if (globalStorage) {
        return globalStorage;
      }
    }
  } catch {
    // ignore SSR or sandboxed storage errors
  }
  return null;
}

function createInitialWallet(): CreditWalletState {
  return {
    balance: DEFAULT_STARTER_CREDITS,
    trialCredits: DEFAULT_STARTER_CREDITS,
    purchasedCredits: 0,
    transactions: [
      {
        id: generateUniqueId('tx'),
        type: 'starter',
        amount: DEFAULT_STARTER_CREDITS,
        description: `Starter Welcome Credits (${DEFAULT_STARTER_CREDITS} เครดิตทดลองใช้งาน)`,
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

/** แปลงข้อมูล Wallet รุ่นเก่า (Phase 4) ให้รองรับฟิลด์ trialCredits / purchasedCredits */
function normalizeWalletState(raw: Partial<CreditWalletState>): CreditWalletState | null {
  if (typeof raw.balance !== 'number' || !Array.isArray(raw.transactions)) {
    return null;
  }
  const safeBalance = Math.max(0, Math.round(raw.balance));
  if (
    typeof raw.trialCredits === 'number' &&
    typeof raw.purchasedCredits === 'number' &&
    raw.trialCredits + raw.purchasedCredits === safeBalance
  ) {
    return {
      balance: safeBalance,
      trialCredits: Math.max(0, Math.round(raw.trialCredits)),
      purchasedCredits: Math.max(0, Math.round(raw.purchasedCredits)),
      transactions: raw.transactions,
    };
  }

  const totalTopup = raw.transactions
    .filter((tx) => tx.type === 'topup' && tx.amount > 0)
    .reduce((sum, tx) => sum + tx.amount, 0);
  const purchasedCredits = Math.min(safeBalance, Math.round(totalTopup));
  const trialCredits = Math.max(0, safeBalance - purchasedCredits);

  return {
    balance: safeBalance,
    trialCredits,
    purchasedCredits,
    transactions: raw.transactions,
  };
}

function readWallet(): CreditWalletState {
  const storage = getSafeStorage();
  if (storage) {
    try {
      const raw = storage.getItem(WALLET_STORAGE_KEY);
      if (raw) {
        const parsed = normalizeWalletState(JSON.parse(raw) as Partial<CreditWalletState>);
        if (parsed) {
          return parsed;
        }
      }
      const initial = createInitialWallet();
      storage.setItem(WALLET_STORAGE_KEY, JSON.stringify(initial));
      return initial;
    } catch {
      // fall back to memoryWallet below
    }
  }

  if (!memoryWallet) {
    memoryWallet = createInitialWallet();
  }
  return memoryWallet;
}

function writeWallet(wallet: CreditWalletState): void {
  memoryWallet = wallet;
  const storage = getSafeStorage();
  if (storage) {
    try {
      storage.setItem(WALLET_STORAGE_KEY, JSON.stringify(wallet));
    } catch {
      // ignore storage quota errors cleanly
    }
  }
}

/** รีเซ็ตกระเป๋าเครดิต (สำหรับ unit tests) */
export function resetCreditWalletForTests(): void {
  memoryWallet = null;
  const storage = getSafeStorage();
  if (storage) {
    try {
      storage.removeItem(WALLET_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

/** ดึงยอดเครดิตคงเหลือปัจจุบัน */
export function getCreditBalance(): number {
  return readWallet().balance;
}

/** ดึงรายละเอียดยอดคงเหลือแยกตาม Trial Credits และ Purchased Credits */
export function getWalletBreakdown(): WalletBreakdown {
  const wallet = readWallet();
  return {
    balance: wallet.balance,
    trialCredits: wallet.trialCredits,
    purchasedCredits: wallet.purchasedCredits,
  };
}

/** ดึงประวัติรายการเครดิตทั้งหมด (ล่าสุดอยู่บนสุด) */
export function getCreditTransactions(): CreditTransaction[] {
  return [...readWallet().transactions];
}

/** ตรวจสอบว่าเครดิตเพียงพอสำหรับค่าใช้จ่ายที่ระบุหรือไม่ */
export function canAfford(cost: number): boolean {
  if (!Number.isFinite(cost) || cost < 0) return false;
  return getCreditBalance() >= cost;
}

/**
 * ตรวจสอบสิทธิ์ใช้งานโมเดล Pro ราคาสูง (เช่น gemini-4-argon, lyria-3.5)
 * เพื่อป้องกันการนำ Trial Credits ฟรีมาเผาเรียก API ต้นทุนสูงก่อนมีการเติมแพ็กเกจจริง
 */
export function canUsePaidOnlyModel(cost: number): {
  allowed: boolean;
  reason?: 'insufficient-credits' | 'paid-credits-required';
  purchasedCredits: number;
  balance: number;
} {
  const wallet = readWallet();
  const safeCost = Number.isFinite(cost) && cost > 0 ? Math.round(cost) : 0;

  if (wallet.balance < safeCost) {
    return {
      allowed: false,
      reason: 'insufficient-credits',
      purchasedCredits: wallet.purchasedCredits,
      balance: wallet.balance,
    };
  }

  if (wallet.purchasedCredits < safeCost) {
    return {
      allowed: false,
      reason: 'paid-credits-required',
      purchasedCredits: wallet.purchasedCredits,
      balance: wallet.balance,
    };
  }

  return {
    allowed: true,
    purchasedCredits: wallet.purchasedCredits,
    balance: wallet.balance,
  };
}

/** หักเครดิตพร้อมบันทึกประวัติรายการ (ตัดจาก Trial Credits ก่อน Purchased Credits เสมอ) */
export function deductCredits(
  cost: number,
  description: string
): { success: boolean; balance: number; transaction?: CreditTransaction } {
  if (!Number.isFinite(cost) || cost <= 0) {
    return { success: false, balance: getCreditBalance() };
  }

  const roundedCost = Math.round(cost);
  const wallet = readWallet();
  if (wallet.balance < roundedCost) {
    return { success: false, balance: wallet.balance };
  }

  const deductedFromTrial = Math.min(wallet.trialCredits, roundedCost);
  const deductedFromPurchased = roundedCost - deductedFromTrial;

  const tx: CreditTransaction = {
    id: generateUniqueId('tx'),
    type: 'spend',
    amount: -roundedCost,
    description: description.trim() || 'AI Generation',
    createdAt: new Date().toISOString(),
  };

  const nextWallet: CreditWalletState = {
    balance: wallet.balance - roundedCost,
    trialCredits: wallet.trialCredits - deductedFromTrial,
    purchasedCredits: Math.max(0, wallet.purchasedCredits - deductedFromPurchased),
    transactions: [tx, ...wallet.transactions].slice(0, 50),
  };
  writeWallet(nextWallet);

  return { success: true, balance: nextWallet.balance, transaction: tx };
}

/** คืนเครดิตอัตโนมัติหากการเรียก AI ล้มเหลวภายหลังหักเครดิต */
export function refundCredits(
  amount: number,
  description: string,
  options?: { toPurchased?: boolean }
): { success: boolean; balance: number; transaction?: CreditTransaction } {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, balance: getCreditBalance() };
  }

  const roundedAmount = Math.round(amount);
  const wallet = readWallet();
  const tx: CreditTransaction = {
    id: generateUniqueId('tx'),
    type: 'refund',
    amount: roundedAmount,
    description: description.trim() || 'AI Failure Auto-Refund',
    createdAt: new Date().toISOString(),
  };

  const toPurchased = options?.toPurchased ?? false;
  const nextWallet: CreditWalletState = {
    balance: wallet.balance + roundedAmount,
    trialCredits: toPurchased ? wallet.trialCredits : wallet.trialCredits + roundedAmount,
    purchasedCredits: toPurchased ? wallet.purchasedCredits + roundedAmount : wallet.purchasedCredits,
    transactions: [tx, ...wallet.transactions].slice(0, 50),
  };
  writeWallet(nextWallet);

  return { success: true, balance: nextWallet.balance, transaction: tx };
}

/** เติมเครดิตตามแพ็กเกจที่เลือก (นับเป็น Purchased Credits ทั้ง base + bonus) */
export function topUpCredits(pkg: CreditPackage): {
  success: boolean;
  balance: number;
  transaction: CreditTransaction;
} {
  const wallet = readWallet();
  const creditsToAdd = Math.max(0, Math.round(pkg.credits));
  const bonusLabel = pkg.bonusCredits > 0 ? ` (${pkg.baseCredits} + แถม ${pkg.bonusCredits})` : '';
  const tx: CreditTransaction = {
    id: generateUniqueId('tx'),
    type: 'topup',
    amount: creditsToAdd,
    description: `Top-up ${pkg.name} (+${creditsToAdd} Credits${bonusLabel} / ${pkg.priceThb}฿)`,
    createdAt: new Date().toISOString(),
  };

  const nextWallet: CreditWalletState = {
    balance: wallet.balance + creditsToAdd,
    trialCredits: wallet.trialCredits,
    purchasedCredits: wallet.purchasedCredits + creditsToAdd,
    transactions: [tx, ...wallet.transactions].slice(0, 50),
  };
  writeWallet(nextWallet);

  return { success: true, balance: nextWallet.balance, transaction: tx };
}

/** ตรวจสอบว่าเปิดใช้งานโหมด Production Billing (ห้ามจำลองเติมเงินฝั่ง Client) หรือไม่ */
export function isProductionBillingEnabled(): boolean {
  return (process.env.NEXT_PUBLIC_BILLING_MODE || '').trim().toLowerCase() === 'production';
}

export function canAllowDemoTopUp(): boolean {
  return !isProductionBillingEnabled();
}

/** อัปเดตยอด Wallet ในแอปให้ตรงกับข้อมูลล่าสุดจาก Server (Supabase Postgres) */
export function applyServerWalletSnapshot(snapshot: {
  balance: number;
  trialCredits: number;
  purchasedCredits: number;
  transactions?: CreditTransaction[];
}): WalletBreakdown & { transactions: CreditTransaction[] } {
  const trialCredits = Math.max(0, Math.round(snapshot.trialCredits));
  const purchasedCredits = Math.max(0, Math.round(snapshot.purchasedCredits));
  const balance = Math.max(0, Math.round(snapshot.balance ?? trialCredits + purchasedCredits));
  const existing = readWallet();
  const transactions = Array.isArray(snapshot.transactions)
    ? snapshot.transactions.slice(0, 50)
    : existing.transactions;

  writeWallet({
    balance,
    trialCredits,
    purchasedCredits,
    transactions,
  });

  return { balance, trialCredits, purchasedCredits, transactions };
}

/** ซิงค์ยอดเครดิตจริงจาก Server Wallet (/api/billing/wallet) เมื่อล็อกอินแล้ว */
export async function syncWalletFromServer(
  accessToken: string,
  fetchFn: typeof fetch = fetch
): Promise<{
  ok: boolean;
  status?: number;
  wallet?: WalletBreakdown & { transactions: CreditTransaction[] };
  error?: string;
}> {
  if (!accessToken.trim()) {
    return { ok: false, status: 401, error: 'Missing access token' };
  }

  try {
    const res = await fetchFn('/api/billing/wallet', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const data = (await res.json()) as {
      wallet?: {
        balance: number;
        trialCredits: number;
        purchasedCredits: number;
        transactions?: CreditTransaction[];
      };
      error?: string;
    };
    if (!res.ok || !data.wallet) {
      return { ok: false, status: res.status, error: data.error || `Wallet sync error (${res.status})` };
    }

    const synced = applyServerWalletSnapshot(data.wallet);
    return { ok: true, status: res.status, wallet: synced };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error syncing wallet' };
  }
}
