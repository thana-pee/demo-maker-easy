'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  History,
  Lock,
  Moon,
  PlusCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Sun,
  Trophy,
  User,
  Users,
  Wallet,
} from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import {
  consumeAuthCallbackFromUrl,
  getAuthAccessToken,
  getCurrentUser,
  isCloudConfigured,
  refreshAuthSession,
  signInWithGoogleOAuth,
  type CloudUser,
} from '@/lib/cloudSync';
import {
  ADMIN_ANALYTICS_KEY_LOCAL_KEY,
  ADMIN_ANALYTICS_KEY_SESSION_KEY,
} from '@/lib/analyticsLabels';
import { AdminNavTabs } from './AdminNavTabs';
import type {
  AdminTopupDashboardReport,
  AdminUserLookupItem,
} from '@/lib/serverTopupAdmin';

interface TopupApiResponse extends AdminTopupDashboardReport {
  ok: boolean;
  authMethod?: 'admin-key' | 'google-admin';
  viewerEmail?: string;
  error?: string;
  code?: string;
}

const PRESET_AMOUNTS = [50, 100, 300, 500, 1000] as const;
const PRESET_REASONS = [
  'ทดสอบระบบ',
  'ชดเชยระบบขัดข้อง',
  'โปรโมชั่นพิเศษ',
  'เติมเงินแมนนวลนอกระบบ',
] as const;

function readSavedAdminKey(): string {
  if (typeof window === 'undefined') return '';
  try {
    return (
      window.sessionStorage?.getItem(ADMIN_ANALYTICS_KEY_SESSION_KEY)?.trim() ||
      window.localStorage?.getItem(ADMIN_ANALYTICS_KEY_LOCAL_KEY)?.trim() ||
      ''
    );
  } catch {
    return '';
  }
}

function saveAdminKeyToBrowser(key: string, rememberAcrossSessions: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (!key) {
      window.sessionStorage?.removeItem(ADMIN_ANALYTICS_KEY_SESSION_KEY);
      window.localStorage?.removeItem(ADMIN_ANALYTICS_KEY_LOCAL_KEY);
      return;
    }
    window.sessionStorage?.setItem(ADMIN_ANALYTICS_KEY_SESSION_KEY, key);
    if (rememberAcrossSessions) {
      window.localStorage?.setItem(ADMIN_ANALYTICS_KEY_LOCAL_KEY, key);
    } else {
      window.localStorage?.removeItem(ADMIN_ANALYTICS_KEY_LOCAL_KEY);
    }
  } catch {
    // Ignore storage restriction
  }
}

function formatThaiTimestamp(iso?: string | null): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('th-TH', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export const AdminTopupClient: React.FC = () => {
  const { resolvedTheme, toggleTheme } = useTheme();

  // Cloud & Auth states
  const [cloudUser, setCloudUser] = useState<CloudUser | null>(null);
  const [cloudReady, setCloudReady] = useState<boolean>(false);

  const [activeKey, setActiveKey] = useState<string>('');
  const [keyInput, setKeyInput] = useState<string>('');
  const [showKeyText, setShowKeyText] = useState<boolean>(false);
  const [rememberKey, setRememberKey] = useState<boolean>(true);

  // Data states
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [report, setReport] = useState<TopupApiResponse | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);

  // Error states
  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null);
  const [authErrorCode, setAuthErrorCode] = useState<string | null>(null);
  const [viewerEmail, setViewerEmail] = useState<string | null>(null);

  // Manual Topup Form states
  const [selectedUserInput, setSelectedUserInput] = useState<string>('');
  const [amountInput, setAmountInput] = useState<number>(100);
  const [creditType, setCreditType] = useState<'purchased' | 'trial'>('purchased');
  const [reasonInput, setReasonInput] = useState<string>('ทดสอบระบบ');
  const [isSubmittingTopup, setIsSubmittingTopup] = useState<boolean>(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);

  // Ledger Filter states
  const [ledgerSearchQuery, setLedgerSearchQuery] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Ignore
    }
  };

  const loadDashboardData = useCallback(
    async (overrideKey?: string) => {
      setIsRefreshing(true);
      setAuthErrorMessage(null);
      setAuthErrorCode(null);

      const keyToUse = (overrideKey !== undefined ? overrideKey : activeKey).trim();
      const headers: Record<string, string> = {};

      if (keyToUse) {
        headers['x-analytics-key'] = keyToUse;
      }

      const token = getAuthAccessToken();
      if (token && !headers['x-analytics-key']) {
        headers.Authorization = `Bearer ${token}`;
      }

      try {
        const res = await fetch('/api/admin/topup', {
          method: 'GET',
          headers,
          cache: 'no-store',
        });

        const json = (await res.json().catch(() => ({}))) as TopupApiResponse;

        if (json.viewerEmail) {
          setViewerEmail(json.viewerEmail);
        }

        if (!res.ok || !json.ok) {
          if (res.status === 401 && token) {
            const refreshed = await refreshAuthSession();
            if (refreshed?.accessToken) {
              const retryRes = await fetch('/api/admin/topup', {
                method: 'GET',
                headers: {
                  ...headers,
                  Authorization: `Bearer ${refreshed.accessToken}`,
                },
                cache: 'no-store',
              });
              const retryJson = (await retryRes.json().catch(() => ({}))) as TopupApiResponse;
              if (retryRes.ok && retryJson.ok) {
                setReport(retryJson);
                setLastFetchedAt(new Date().toISOString());
                setIsLoading(false);
                setIsRefreshing(false);
                return;
              }
            }
          }

          setReport(null);
          setAuthErrorCode(json.code || `HTTP_${res.status}`);
          setAuthErrorMessage(json.error || 'ไม่สามารถโหลดข้อมูลสถิติการเติมเงินได้');
        } else {
          setReport(json);
          setLastFetchedAt(new Date().toISOString());
        }
      } catch (err) {
        setReport(null);
        setAuthErrorCode('NETWORK_ERROR');
        setAuthErrorMessage(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [activeKey]
  );

  // Sync Auth session & initial data load
  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      await consumeAuthCallbackFromUrl().catch(() => null);
      if (cancelled) return;

      setCloudReady(isCloudConfigured());
      const saved = readSavedAdminKey();
      if (saved) {
        setActiveKey(saved);
        setKeyInput(saved);
      }
      const current = getCurrentUser();
      if (current) {
        setCloudUser(current);
      }

      await loadDashboardData(saved);
    };
    void bootstrap();
    return () => {
      cancelled = true;
    };
    // Initial mount bootstrap intentionally runs once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmitAdminKey = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = keyInput.trim();
    if (!cleaned) return;
    setActiveKey(cleaned);
    saveAdminKeyToBrowser(cleaned, rememberKey);
    setIsLoading(true);
    void loadDashboardData(cleaned);
  };

  const handleGoogleSignIn = () => {
    const redirectTo =
      typeof window !== 'undefined' ? `${window.location.origin}/admin/topup` : undefined;
    const res = signInWithGoogleOAuth({ redirectTo });
    if (!res.success) {
      setAuthErrorMessage(res.message);
    }
  };

  const handleLockDashboard = () => {
    saveAdminKeyToBrowser('', false);
    setActiveKey('');
    setKeyInput('');
    setReport(null);
    setAuthErrorCode('NEED_AUTH');
    setAuthErrorMessage('ออกจากหน้าต่างผู้ดูแลระบบแล้ว');
  };

  const handleDownloadReportJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `demo-maker-topup-report-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Find target user candidate from input
  const reportUsers = report?.users;
  const matchedUser = useMemo<AdminUserLookupItem | undefined>(() => {
    if (!reportUsers || !selectedUserInput.trim()) return undefined;
    const search = selectedUserInput.trim().toLowerCase();
    return reportUsers.find(
      (u) =>
        u.email?.toLowerCase() === search ||
        u.id.toLowerCase() === search ||
        u.displayName?.toLowerCase() === search
    );
  }, [reportUsers, selectedUserInput]);

  // Execute manual top-up
  const handleExecuteTopup = async () => {
    setShowConfirmModal(false);
    setActionSuccessMessage(null);
    setActionErrorMessage(null);
    setIsSubmittingTopup(true);

    const target = selectedUserInput.trim();
    if (!target) {
      setActionErrorMessage('กรุณาระบุอีเมล หรือ User ID ของผู้ใช้');
      setIsSubmittingTopup(false);
      return;
    }

    if (!amountInput || amountInput <= 0) {
      setActionErrorMessage('กรุณาระบุจำนวนเครดิตที่มากกว่า 0');
      setIsSubmittingTopup(false);
      return;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (activeKey) {
      headers['x-analytics-key'] = activeKey;
    }
    const token = getAuthAccessToken();
    if (token && !headers['x-analytics-key']) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const res = await fetch('/api/admin/topup', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userIdOrEmail: target,
          amount: amountInput,
          creditType,
          reason: reasonInput,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        error?: string;
        wallet?: { balance: number; purchasedCredits: number; trialCredits: number };
      };

      if (!res.ok || !json.ok) {
        setActionErrorMessage(json.error || 'การเติมเครดิตไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      } else {
        setActionSuccessMessage(
          json.message || `เติมเครดิต +${amountInput.toLocaleString()} เหรียญ สำเร็จแล้ว!`
        );
        // Refresh dashboard data to reflect latest balance and transactions
        void loadDashboardData();
      }
    } catch (err) {
      setActionErrorMessage(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setIsSubmittingTopup(false);
    }
  };

  // Pre-fill user from Top Spenders or User List
  const handleSelectUserForTopup = (user: { email?: string; userId?: string; id?: string; displayName?: string }) => {
    setSelectedUserInput(user.email || user.userId || user.id || '');
    setActionSuccessMessage(null);
    setActionErrorMessage(null);
    window.scrollTo({ top: 180, behavior: 'smooth' });
  };

  // Filtered Recent Topups
  const reportRecentTopups = report?.recentTopups;
  const filteredRecentTopups = useMemo(() => {
    const list = reportRecentTopups ?? [];
    if (!ledgerSearchQuery.trim()) return list;
    const q = ledgerSearchQuery.trim().toLowerCase();
    return list.filter(
      (tx) =>
        tx.email?.toLowerCase().includes(q) ||
        tx.displayName?.toLowerCase().includes(q) ||
        tx.userId.toLowerCase().includes(q) ||
        tx.description?.toLowerCase().includes(q) ||
        tx.transRef?.toLowerCase().includes(q)
    );
  }, [ledgerSearchQuery, reportRecentTopups]);

  return (
    <div className="min-h-screen bg-surface-0 text-ink-900 pb-16">
      {/* Header Bar */}
      <header className="sticky top-0 z-30 bg-surface-0/90 backdrop-blur-md border-b border-hairline">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-1 hover:bg-surface-2 border border-hairline text-xs font-semibold text-ink-700 transition shadow-e1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>กลับเข้า Studio</span>
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-accent-500 text-white flex items-center justify-center shadow-e1">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-sm sm:text-base font-bold text-ink-900 leading-tight">
                  ระบบจัดการเครดิต & Top Spenders
                </h1>
                <p className="text-[11px] text-ink-400">
                  Admin Credit Console · เติมเครดิตแมนนวล & ดูอันดับผู้เติมเงินสูงสุด
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {report && (
              <>
                <button
                  type="button"
                  onClick={() => void loadDashboardData()}
                  disabled={isRefreshing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent-500 hover:bg-accent-hover text-white text-xs font-semibold transition cursor-pointer disabled:opacity-60 shadow-e1"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span>รีเฟรช</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadReportJson}
                  title="ดาวน์โหลดรายงาน JSON"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-1 hover:bg-surface-2 border border-hairline text-xs font-semibold text-ink-700 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">JSON</span>
                </button>

                <button
                  type="button"
                  onClick={handleLockDashboard}
                  title="ล็อกหน้าจอ / ล้างคีย์จากเบราว์เซอร์"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-surface-1 hover:bg-surface-2 border border-hairline text-xs font-semibold text-ink-400 hover:text-red-500 transition cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5" />
                </button>
              </>
            )}

            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle color theme"
              className="w-8 h-8 rounded-xl bg-surface-1 hover:bg-surface-2 border border-hairline flex items-center justify-center text-ink-700 transition cursor-pointer"
            >
              {resolvedTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <AdminNavTabs activeTab="topup" />
          {report && (
            <div className="flex items-center gap-2 text-xs text-ink-500">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>
                ผู้ดูแลระบบ:{' '}
                <strong className="text-ink-800">
                  {viewerEmail || cloudUser?.email || report.authMethod}
                </strong>
              </span>
              <span className="text-ink-300">·</span>
              <span>อัปเดต: {formatThaiTimestamp(lastFetchedAt)}</span>
            </div>
          )}
        </div>

        {/* Loading State */}
        {isLoading && !report && (
          <div className="rounded-3xl bg-surface-1 border border-hairline shadow-e1 p-10 text-center space-y-3">
            <RefreshCw className="w-7 h-7 text-accent-text animate-spin mx-auto" />
            <p className="text-sm font-semibold text-ink-700">
              กำลังตรวจสอบสิทธิ์ผู้ดูแลระบบและดึงข้อมูลเครดิต...
            </p>
          </div>
        )}

        {/* Auth / Unlock Gate */}
        {!isLoading && !report && (
          <div className="max-w-xl mx-auto space-y-4">
            <div className="rounded-3xl bg-surface-1 border border-hairline shadow-e2 p-6 sm:p-7 space-y-5">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-base font-bold text-ink-900">
                    พื้นที่เฉพาะผู้ดูแลระบบ (Admin Only)
                  </h2>
                  <p className="text-xs text-ink-500 leading-relaxed">
                    ระบบเติมเครดิตและสถิติรายได้สงวนสิทธิ์เฉพาะบัญชีอีเมลที่ได้รับอนุญาตใน{' '}
                    <code className="px-1.5 py-0.5 rounded bg-surface-inset font-mono text-[11px]">
                      ANALYTICS_ADMIN_EMAILS
                    </code>{' '}
                    หรือกรอก Admin Key เพื่อปลดล็อก
                  </p>
                </div>
              </div>

              {authErrorMessage && (
                <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-semibold">{authErrorMessage}</p>
                    <div className="flex items-center gap-2 text-[11px] opacity-80">
                      {authErrorCode && <span>รหัส: {authErrorCode}</span>}
                      {viewerEmail && <span>· อีเมลปัจจุบัน: {viewerEmail}</span>}
                    </div>
                  </div>
                </div>
              )}

              {/* Option A: Google Login */}
              {cloudReady && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    className="w-full py-2.5 px-4 rounded-xl bg-accent-500 hover:bg-accent-hover text-white text-xs sm:text-sm font-bold transition shadow-e1 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <User className="w-4 h-4" />
                    <span>เข้าสู่ระบบด้วย Google ผู้ดูแลระบบ</span>
                  </button>
                  <p className="text-[11px] text-ink-400 text-center">
                    ต้องเป็นบัญชีอีเมลที่ตั้งค่าไว้ใน Vercel Environment Variables
                  </p>
                </div>
              )}

              <div className="relative flex items-center justify-center">
                <div className="border-t border-hairline w-full"></div>
                <span className="bg-surface-1 px-3 text-[11px] font-semibold text-ink-400 uppercase tracking-wider relative">
                  หรือใช้ Admin Key
                </span>
              </div>

              {/* Option B: Admin Key */}
              <form onSubmit={handleSubmitAdminKey} className="space-y-3">
                <div className="relative">
                  <input
                    type={showKeyText ? 'text' : 'password'}
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="วาง Admin Key หรือ Service Role Key ที่นี่..."
                    className="w-full pr-10 pl-3.5 py-2.5 rounded-xl bg-surface-2 border border-hairline text-xs font-mono text-ink-900 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKeyText((v) => !v)}
                    aria-label="Show or hide key"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-900 p-1 cursor-pointer"
                  >
                    {showKeyText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <label className="inline-flex items-center gap-2 text-xs text-ink-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberKey}
                      onChange={(e) => setRememberKey(e.target.checked)}
                      className="rounded accent-indigo-600"
                    />
                    <span>จำคีย์ไว้บนเครื่องนี้</span>
                  </label>

                  <button
                    type="submit"
                    disabled={!keyInput.trim()}
                    className="px-4 py-2 rounded-xl bg-accent-500 hover:bg-accent-hover text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
                  >
                    ปลดล็อกหน้าต่างจัดการเครดิต →
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Authenticated Dashboard Content */}
        {report && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Revenue */}
              <div className="rounded-3xl bg-surface-1 border border-hairline shadow-e1 p-5 space-y-2">
                <div className="flex items-center justify-between text-ink-400 text-xs font-medium">
                  <span>ยอดเติมเงินสะสม (THB)</span>
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    💰
                  </div>
                </div>
                <div className="text-2xl font-black text-ink-900 tracking-tight">
                  ฿{report.kpi.totalTopupRevenueThb.toLocaleString()}
                </div>
                <p className="text-[11px] text-ink-400">
                  รายได้จากสลิป PromptPay ที่ตรวจสอบแล้ว
                </p>
              </div>

              {/* Card 2: Total Topup Credits */}
              <div className="rounded-3xl bg-surface-1 border border-hairline shadow-e1 p-5 space-y-2">
                <div className="flex items-center justify-between text-ink-400 text-xs font-medium">
                  <span>เครดิตที่เติมทั้งหมด</span>
                  <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    🪙
                  </div>
                </div>
                <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 tracking-tight">
                  +{report.kpi.totalTopupCreditsGranted.toLocaleString()}
                </div>
                <p className="text-[11px] text-ink-400">
                  รวมทั้งผ่านสลิปอัตโนมัติและแมนนวล
                </p>
              </div>

              {/* Card 3: Paying Users */}
              <div className="rounded-3xl bg-surface-1 border border-hairline shadow-e1 p-5 space-y-2">
                <div className="flex items-center justify-between text-ink-400 text-xs font-medium">
                  <span>ผู้ใช้ที่เติมเงินแล้ว</span>
                  <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                    <Users className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-ink-900 tracking-tight">
                  {report.kpi.totalPayingUsers.toLocaleString()}
                  <span className="text-xs font-normal text-ink-400 ml-1.5">
                    / {report.kpi.totalRegisteredUsers.toLocaleString()} บัญชี
                  </span>
                </div>
                <p className="text-[11px] text-ink-400">
                  สัดส่วนผู้เติมเงิน{' '}
                  {report.kpi.totalRegisteredUsers > 0
                    ? Math.round(
                        (report.kpi.totalPayingUsers / report.kpi.totalRegisteredUsers) * 100
                      )
                    : 0}
                  % ของผู้ใช้ทั้งหมด
                </p>
              </div>

              {/* Card 4: Circulation Balance */}
              <div className="rounded-3xl bg-surface-1 border border-hairline shadow-e1 p-5 space-y-2">
                <div className="flex items-center justify-between text-ink-400 text-xs font-medium">
                  <span>เครดิตคงเหลือในระบบ</span>
                  <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                    <Wallet className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-ink-900 tracking-tight">
                  {(
                    report.kpi.totalPurchasedCreditsInCirculation +
                    report.kpi.totalTrialCreditsInCirculation
                  ).toLocaleString()}
                </div>
                <p className="text-[11px] text-ink-400">
                  {report.kpi.totalPurchasedCreditsInCirculation.toLocaleString()} ซื้อ ·{' '}
                  {report.kpi.totalTrialCreditsInCirculation.toLocaleString()} ทดลอง
                </p>
              </div>
            </div>

            {/* Section: Manual Top-Up Console */}
            <div className="rounded-3xl bg-surface-1 border border-hairline shadow-e2 p-5 sm:p-7 space-y-5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-2xl bg-accent-500 text-white flex items-center justify-center shadow-e1">
                    <PlusCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-ink-900">
                      คอนโซลเติมเครดิตแบบแมนนวล (Manual Top-Up)
                    </h2>
                    <p className="text-xs text-ink-500">
                      เติมเครดิตให้กับผู้ใช้โดยตรงแบบเรียลไทม์ พร้อมบันทึกหลักฐาน Audit Trail
                    </p>
                  </div>
                </div>
              </div>

              {/* Alert Feedback Messages */}
              {actionSuccessMessage && (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-700 dark:text-emerald-300 flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-bold text-sm">ทำรายการสำเร็จ!</p>
                    <p>{actionSuccessMessage}</p>
                  </div>
                </div>
              )}

              {actionErrorMessage && (
                <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/25 text-xs text-red-700 dark:text-red-300 flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-bold text-sm">เกิดข้อผิดพลาด</p>
                    <p>{actionErrorMessage}</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Column 1: Target User Search & Selection */}
                <div className="space-y-3 lg:col-span-1">
                  <label className="block text-xs font-bold text-ink-800">
                    1. บัญชีผู้ใช้เป้าหมาย (Email หรือ User ID)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={selectedUserInput}
                      onChange={(e) => {
                        setSelectedUserInput(e.target.value);
                        setActionSuccessMessage(null);
                        setActionErrorMessage(null);
                      }}
                      placeholder="พิมพ์อีเมล เช่น user@gmail.com หรือ User ID..."
                      className="w-full pr-3 pl-9 py-2.5 rounded-xl bg-surface-2 border border-hairline text-xs font-medium text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
                    />
                    <Search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>

                  {/* Quick User Suggestions Dropdown */}
                  {selectedUserInput.trim() && !matchedUser && (
                    <div className="max-h-48 overflow-y-auto rounded-xl bg-surface-2 border border-hairline p-1 space-y-1 text-xs">
                      {report.users
                        .filter(
                          (u) =>
                            u.email?.toLowerCase().includes(selectedUserInput.toLowerCase()) ||
                            u.displayName?.toLowerCase().includes(selectedUserInput.toLowerCase()) ||
                            u.id.toLowerCase().includes(selectedUserInput.toLowerCase())
                        )
                        .slice(0, 5)
                        .map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => setSelectedUserInput(u.email || u.id)}
                            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-surface-1 flex items-center justify-between transition cursor-pointer"
                          >
                            <span className="font-medium text-ink-900 truncate">
                              {u.email || u.displayName}
                            </span>
                            <span className="text-[11px] text-accent-text font-bold shrink-0 ml-2">
                              {u.currentBalance} Cr
                            </span>
                          </button>
                        ))}
                    </div>
                  )}

                  {/* Matched User Card */}
                  {matchedUser && (
                    <div className="p-3.5 rounded-2xl bg-surface-2 border border-accent-500/30 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-accent-text uppercase tracking-wider">
                          ✓ พบบัญชีในระบบ
                        </span>
                        <span className="text-xs font-black text-ink-900">
                          คงเหลือ: {matchedUser.currentBalance.toLocaleString()} Cr
                        </span>
                      </div>
                      <div className="text-xs">
                        <p className="font-bold text-ink-900">{matchedUser.displayName}</p>
                        <p className="text-ink-500 text-[11px]">{matchedUser.email || '-'}</p>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-ink-400 border-t border-hairline pt-1.5">
                        <span>ซื้อ: {matchedUser.purchasedCredits} Cr</span>
                        <span>ทดลอง: {matchedUser.trialCredits} Cr</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Column 2: Amount & Credit Type */}
                <div className="space-y-3 lg:col-span-1">
                  <label className="block text-xs font-bold text-ink-800">
                    2. จำนวนเครดิตที่ต้องการเติม
                  </label>

                  {/* Quick Amount Chips */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {PRESET_AMOUNTS.map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setAmountInput(amt)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                          amountInput === amt
                            ? 'bg-accent-500 text-white shadow-e1'
                            : 'bg-surface-2 hover:bg-surface-3 text-ink-700 border border-hairline'
                        }`}
                      >
                        +{amt}
                      </button>
                    ))}
                  </div>

                  {/* Custom Amount Input */}
                  <div className="relative">
                    <input
                      type="number"
                      min={1}
                      max={100000}
                      value={amountInput}
                      onChange={(e) => setAmountInput(Math.max(1, Number(e.target.value)))}
                      placeholder="ระบุจำนวนเครดิต..."
                      className="w-full pr-12 pl-3.5 py-2.5 rounded-xl bg-surface-2 border border-hairline text-xs font-bold text-ink-900 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-400">
                      เหรียญ
                    </span>
                  </div>

                  {/* Credit Type Selector */}
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[11px] font-semibold text-ink-500">ประเภทเครดิต:</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setCreditType('purchased')}
                        className={`p-2 rounded-xl text-left border text-xs transition cursor-pointer ${
                          creditType === 'purchased'
                            ? 'border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-bold'
                            : 'border-hairline bg-surface-2 text-ink-600 hover:bg-surface-3'
                        }`}
                      >
                        <p className="font-bold">💳 เติมเงิน (Purchased)</p>
                        <p className="text-[10px] opacity-75">ถาวร ไม่มีวันหมดอายุ</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCreditType('trial')}
                        className={`p-2 rounded-xl text-left border text-xs transition cursor-pointer ${
                          creditType === 'trial'
                            ? 'border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-bold'
                            : 'border-hairline bg-surface-2 text-ink-600 hover:bg-surface-3'
                        }`}
                      >
                        <p className="font-bold">🎁 ทดลอง (Trial)</p>
                        <p className="text-[10px] opacity-75">เครดิตโบนัสทดลองใช้</p>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Column 3: Reason & Action Button */}
                <div className="space-y-3 lg:col-span-1 flex flex-col justify-between">
                  <div className="space-y-3">
                    <label className="block text-xs font-bold text-ink-800">
                      3. เหตุผล / หมายเหตุบันทึก Audit
                    </label>

                    {/* Quick Reason Chips */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {PRESET_REASONS.map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setReasonInput(r)}
                          className={`px-2 py-0.5 rounded-lg text-[11px] transition cursor-pointer ${
                            reasonInput === r
                              ? 'bg-accent-500/15 text-accent-text font-bold border border-accent-500/40'
                              : 'bg-surface-2 hover:bg-surface-3 text-ink-600 border border-hairline'
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>

                    <input
                      type="text"
                      value={reasonInput}
                      onChange={(e) => setReasonInput(e.target.value)}
                      placeholder="ระบุเหตุผลในการเติม เช่น ทดสอบระบบ..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-hairline text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      disabled={!selectedUserInput.trim() || !amountInput || isSubmittingTopup}
                      onClick={() => setShowConfirmModal(true)}
                      className="w-full py-3 px-4 rounded-2xl bg-accent-500 hover:bg-accent-hover text-white text-xs sm:text-sm font-bold transition shadow-e1 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmittingTopup ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>กำลังบันทึกเครดิต...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>
                            เติมเครดิต +{amountInput.toLocaleString()} เหรียญ ให้ผู้ใช้นี้
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Confirmation Modal */}
            {showConfirmModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
                <div className="max-w-md w-full rounded-3xl bg-surface-1 border border-hairline shadow-e3 p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-accent-500/15 text-accent-text flex items-center justify-center shrink-0">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-ink-900">ยืนยันการเติมเครดิต</h3>
                      <p className="text-xs text-ink-400">กรุณาตรวจสอบรายละเอียดก่อนดำเนินการ</p>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-surface-2 border border-hairline p-4 space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-hairline">
                      <span className="text-ink-500">ผู้รับเครดิต:</span>
                      <strong className="text-ink-900 font-mono">
                        {matchedUser?.email || selectedUserInput}
                      </strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-hairline">
                      <span className="text-ink-500">จำนวนเครดิต:</span>
                      <strong className="text-accent-text font-black text-sm">
                        +{amountInput.toLocaleString()} เหรียญ
                      </strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-hairline">
                      <span className="text-ink-500">ประเภท:</span>
                      <span className="font-semibold text-ink-800">
                        {creditType === 'trial' ? '🎁 เครดิตทดลอง (Trial)' : '💳 เติมเงิน (Purchased)'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-ink-500">เหตุผล / หมายเหตุ:</span>
                      <span className="text-ink-800 font-medium">{reasonInput || '-'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowConfirmModal(false)}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-hairline text-xs font-semibold text-ink-700 transition cursor-pointer"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleExecuteTopup()}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-accent-500 hover:bg-accent-hover text-white text-xs font-bold transition shadow-e1 cursor-pointer"
                    >
                      ยืนยันเติมเครดิตทันที
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Section: Top Spenders Leaderboard */}
            <div className="rounded-3xl bg-surface-1 border border-hairline shadow-e1 p-5 sm:p-7 space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                    <Trophy className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-ink-900">
                      อันดับผู้เติมเงินสูงสุด (Top Spenders Leaderboard)
                    </h2>
                    <p className="text-[11px] text-ink-400">
                      เรียงตามจำนวนเครดิตที่เติมสะสมและยอดชำระเงินรวมทั้งหมด
                    </p>
                  </div>
                </div>
                <div className="text-xs text-ink-400 font-medium">
                  พบทั้งหมด {report.topSpenders.length} บัญชี
                </div>
              </div>

              {report.topSpenders.length === 0 ? (
                <div className="p-8 text-center text-xs text-ink-400 rounded-2xl bg-surface-inset">
                  ยังไม่มีประวัติการเติมเงินในระบบ
                </div>
              ) : (
                <div className="overflow-x-auto -mx-2 sm:mx-0">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-hairline text-ink-400 font-semibold text-[11px] uppercase tracking-wider">
                        <th className="py-2.5 px-3">อันดับ</th>
                        <th className="py-2.5 px-3">ผู้ใช้</th>
                        <th className="py-2.5 px-3 text-right">ยอดชำระรวม (THB)</th>
                        <th className="py-2.5 px-3 text-right">เครดิตที่เติม</th>
                        <th className="py-2.5 px-3 text-right">เครดิตคงเหลือ</th>
                        <th className="py-2.5 px-3 text-center">เติมล่าสุด</th>
                        <th className="py-2.5 px-3 text-right">ดำเนินการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {report.topSpenders.map((spender) => {
                        const isTop1 = spender.rank === 1;
                        const isTop2 = spender.rank === 2;
                        const isTop3 = spender.rank === 3;

                        return (
                          <tr
                            key={spender.userId}
                            className="hover:bg-surface-2 transition group"
                          >
                            {/* Rank */}
                            <td className="py-3 px-3 font-bold">
                              <span
                                className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs ${
                                  isTop1
                                    ? 'bg-amber-500 text-white shadow-e1 font-black'
                                    : isTop2
                                    ? 'bg-slate-400 text-white font-bold'
                                    : isTop3
                                    ? 'bg-amber-700/60 text-white font-bold'
                                    : 'text-ink-400'
                                }`}
                              >
                                #{spender.rank}
                              </span>
                            </td>

                            {/* User details */}
                            <td className="py-3 px-3">
                              <div className="space-y-0.5">
                                <p className="font-bold text-ink-900 leading-tight">
                                  {spender.displayName}
                                </p>
                                <p className="text-[11px] text-ink-400 font-mono">
                                  {spender.email || spender.userId.slice(0, 12)}
                                </p>
                              </div>
                            </td>

                            {/* Revenue THB */}
                            <td className="py-3 px-3 text-right font-black text-ink-900">
                              {spender.totalPaidThb > 0
                                ? `฿${spender.totalPaidThb.toLocaleString()}`
                                : '-'}
                            </td>

                            {/* Credits Topped Up */}
                            <td className="py-3 px-3 text-right">
                              <span className="inline-block px-2 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-bold font-mono">
                                +{spender.totalCreditsToppedUp.toLocaleString()} Cr
                              </span>
                            </td>

                            {/* Current Balance */}
                            <td className="py-3 px-3 text-right">
                              <div className="font-bold text-ink-900">
                                {spender.currentBalance.toLocaleString()} Cr
                              </div>
                              <div className="text-[10px] text-ink-400">
                                {spender.currentPurchased} ซื้อ / {spender.currentTrial} ฟรี
                              </div>
                            </td>

                            {/* Last Topup Date */}
                            <td className="py-3 px-3 text-center text-ink-500 text-[11px]">
                              {formatThaiTimestamp(spender.lastTopupAt)}
                            </td>

                            {/* Action Button */}
                            <td className="py-3 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleSelectUserForTopup(spender)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-surface-2 hover:bg-accent-500 hover:text-white border border-hairline text-ink-700 text-xs font-semibold transition cursor-pointer shadow-e1"
                              >
                                <Sparkles className="w-3 h-3" />
                                <span>เติมเงินให้คนนี้</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Section: Recent Top-Up Ledger / Audit Log */}
            <div className="rounded-3xl bg-surface-1 border border-hairline shadow-e1 p-5 sm:p-7 space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                    <History className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-ink-900">
                      ประวัติรายการเติมเงินล่าสุด (Recent Top-Up Ledger)
                    </h2>
                    <p className="text-[11px] text-ink-400">
                      บันทึกการเติมเงินทุกรายการย้อนหลัง ทั้งสลิป PromptPay และแมนนวล
                    </p>
                  </div>
                </div>

                {/* Search in Ledger */}
                <div className="relative w-full sm:w-64">
                  <input
                    type="text"
                    value={ledgerSearchQuery}
                    onChange={(e) => setLedgerSearchQuery(e.target.value)}
                    placeholder="ค้นหาตามอีเมล, หมายเหตุ, Ref..."
                    className="w-full pr-3 pl-8 py-1.5 rounded-xl bg-surface-2 border border-hairline text-xs text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
                  />
                  <Search className="w-3.5 h-3.5 text-ink-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              {filteredRecentTopups.length === 0 ? (
                <div className="p-8 text-center text-xs text-ink-400 rounded-2xl bg-surface-inset">
                  ไม่พบรายการเติมเงินที่ตรงกับคำค้นหา
                </div>
              ) : (
                <div className="overflow-x-auto -mx-2 sm:mx-0">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-hairline text-ink-400 font-semibold text-[11px] uppercase tracking-wider">
                        <th className="py-2.5 px-3">วัน-เวลา</th>
                        <th className="py-2.5 px-3">ผู้ใช้</th>
                        <th className="py-2.5 px-3 text-right">จำนวน (+Cr)</th>
                        <th className="py-2.5 px-3 text-center">ช่องทาง / รูปแบบ</th>
                        <th className="py-2.5 px-3">รายละเอียด / หมายเหตุ</th>
                        <th className="py-2.5 px-3 text-right">Ref Code</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {filteredRecentTopups.map((tx) => (
                        <tr key={tx.id} className="hover:bg-surface-2 transition">
                          <td className="py-3 px-3 text-ink-500 text-[11px] whitespace-nowrap">
                            {formatThaiTimestamp(tx.createdAt)}
                          </td>
                          <td className="py-3 px-3">
                            <p className="font-semibold text-ink-900">{tx.displayName}</p>
                            <p className="text-[11px] text-ink-400 font-mono">
                              {tx.email || tx.userId.slice(0, 10)}
                            </p>
                          </td>
                          <td className="py-3 px-3 text-right font-black text-emerald-600 dark:text-emerald-400">
                            +{tx.amount.toLocaleString()} Cr
                          </td>
                          <td className="py-3 px-3 text-center">
                            {tx.isManual ? (
                              <span className="inline-block px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold text-[10px]">
                                🛠️ Admin Manual
                              </span>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold text-[10px]">
                                ⚡ PromptPay Slip
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-ink-700 max-w-xs truncate" title={tx.description}>
                            {tx.description}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-[11px] text-ink-400">
                            {tx.transRef ? (
                              <button
                                type="button"
                                onClick={() => copyToClipboard(tx.transRef!, tx.id)}
                                title="คัดลอกรหัสอ้างอิง"
                                className="inline-flex items-center gap-1 hover:text-ink-900 cursor-pointer"
                              >
                                <span>{tx.transRef.slice(0, 12)}...</span>
                                {copiedId === tx.id ? (
                                  <Check className="w-3 h-3 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3 h-3 opacity-60" />
                                )}
                              </button>
                            ) : (
                              '-'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
