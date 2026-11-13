/**
 * creditManager.ts — จัดการ Credit Wallet & Transaction Ledger สำหรับ Advance Mode (Phase 4E)
 *
 * - เครดิตเริ่มต้น: 30 Credits (DEFAULT_STARTER_CREDITS)
 * - จัดเก็บใน localStorage อย่างปลอดภัย พร้อม in-memory fallback สำหรับ SSR / Node tests
 */

import { generateUniqueId } from './sectionUtils';

export interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  priceThb: number;
}

export interface CreditTransaction {
  id: string;
  type: 'starter' | 'topup' | 'spend';
  amount: number;
  description: string;
  createdAt: string;
}

interface CreditWalletState {
  balance: number;
  transactions: CreditTransaction[];
}

export const DEFAULT_STARTER_CREDITS = 30;
const WALLET_STORAGE_KEY = 'demo_maker_credit_wallet_v1';

export const CREDIT_PACKAGES: CreditPackage[] = [
  { id: 'pkg-starter', name: 'Starter Pack', credits: 100, priceThb: 99 },
  { id: 'pkg-pro', name: 'Pro Songwriter', credits: 300, priceThb: 249 },
  { id: 'pkg-studio', name: 'Studio Pack', credits: 700, priceThb: 499 },
];

let memoryWallet: CreditWalletState | null = null;

function getSafeStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== 'undefined') {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  }
  return null;
}

function createInitialWallet(): CreditWalletState {
  return {
    balance: DEFAULT_STARTER_CREDITS,
    transactions: [
      {
        id: generateUniqueId('tx'),
        type: 'starter',
        amount: DEFAULT_STARTER_CREDITS,
        description: 'Starter Welcome Credits (30 เครดิตเริ่มต้น)',
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

function readWallet(): CreditWalletState {
  const storage = getSafeStorage();
  if (storage) {
    try {
      const raw = storage.getItem(WALLET_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CreditWalletState;
        if (typeof parsed.balance === 'number' && Array.isArray(parsed.transactions)) {
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

/** ดึงประวัติรายการเครดิตทั้งหมด (ล่าสุดอยู่บนสุด) */
export function getCreditTransactions(): CreditTransaction[] {
  return [...readWallet().transactions];
}

/** ตรวจสอบว่าเครดิตเพียงพอสำหรับค่าใช้จ่ายที่ระบุหรือไม่ */
export function canAfford(cost: number): boolean {
  if (!Number.isFinite(cost) || cost < 0) return false;
  return getCreditBalance() >= cost;
}

/** หักเครดิตพร้อมบันทึกประวัติรายการ */
export function deductCredits(
  cost: number,
  description: string
): { success: boolean; balance: number; transaction?: CreditTransaction } {
  if (!Number.isFinite(cost) || cost <= 0) {
    return { success: false, balance: getCreditBalance() };
  }

  const wallet = readWallet();
  if (wallet.balance < cost) {
    return { success: false, balance: wallet.balance };
  }

  const tx: CreditTransaction = {
    id: generateUniqueId('tx'),
    type: 'spend',
    amount: -cost,
    description: description.trim() || 'AI Lyric Generation',
    createdAt: new Date().toISOString(),
  };

  const nextWallet: CreditWalletState = {
    balance: wallet.balance - cost,
    transactions: [tx, ...wallet.transactions].slice(0, 50),
  };
  writeWallet(nextWallet);

  return { success: true, balance: nextWallet.balance, transaction: tx };
}

/** เติมเครดิตตามแพ็กเกจที่เลือก */
export function topUpCredits(pkg: CreditPackage): {
  success: boolean;
  balance: number;
  transaction: CreditTransaction;
} {
  const wallet = readWallet();
  const creditsToAdd = Math.max(0, Math.round(pkg.credits));
  const tx: CreditTransaction = {
    id: generateUniqueId('tx'),
    type: 'topup',
    amount: creditsToAdd,
    description: `Top-up ${pkg.name} (+${creditsToAdd} Credits / ${pkg.priceThb}฿)`,
    createdAt: new Date().toISOString(),
  };

  const nextWallet: CreditWalletState = {
    balance: wallet.balance + creditsToAdd,
    transactions: [tx, ...wallet.transactions].slice(0, 50),
  };
  writeWallet(nextWallet);

  return { success: true, balance: nextWallet.balance, transaction: tx };
}
