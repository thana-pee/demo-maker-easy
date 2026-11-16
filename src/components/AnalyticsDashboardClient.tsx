'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BarChart3,
  Check,
  Copy,
  Database,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Moon,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Sun,
  Users,
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
import type { AnalyticsSummaryReport } from '@/lib/serverAnalytics';
import {
  ADMIN_ANALYTICS_KEY_LOCAL_KEY,
  ADMIN_ANALYTICS_KEY_SESSION_KEY,
  ADMIN_ANALYTICS_UNLOCKED_KEY,
  ANALYTICS_MIGRATION_SQL,
  getReadableDialectLabel,
  getReadableFeatureInfo,
  getReadableGenreLabel,
  getReadableSongwriterLabel,
  getReadableViewModeLabel,
} from '@/lib/analyticsLabels';
import { AdminNavTabs } from './AdminNavTabs';

interface SummaryApiResponse {
  ok: boolean;
  authMethod?: 'admin-key' | 'google-admin';
  viewerEmail?: string;
  tableReady: boolean;
  windowDays: number;
  summary: AnalyticsSummaryReport;
  error?: string;
  code?: string;
}

type FeatureFilterTab = 'all' | 'ai' | 'free';

const WINDOW_OPTIONS = [7, 14, 30, 90] as const;

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
    // Ignore storage write restriction
  }
}

function formatThaiTimestamp(iso?: string): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('th-TH', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export const AnalyticsDashboardClient: React.FC = () => {
  const { resolvedTheme, toggleTheme } = useTheme();

  const [days, setDays] = useState<number>(30);
  const [featureTab, setFeatureTab] = useState<FeatureFilterTab>('all');

  const [cloudUser, setCloudUser] = useState<CloudUser | null>(null);
  const [cloudReady, setCloudReady] = useState<boolean>(false);

  const [activeKey, setActiveKey] = useState<string>('');
  const [keyInput, setKeyInput] = useState<string>('');
  const [showKeyText, setShowKeyText] = useState<boolean>(false);
  const [rememberKey, setRememberKey] = useState<boolean>(true);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [report, setReport] = useState<SummaryApiResponse | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);

  const [authErrorCode, setAuthErrorCode] = useState<string | null>(null);
  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null);
  const [viewerEmailHint, setViewerEmailHint] = useState<string | null>(null);

  const [copiedSql, setCopiedSql] = useState<boolean>(false);
  const [copiedEnvHint, setCopiedEnvHint] = useState<boolean>(false);
  const [showSqlPreview, setShowSqlPreview] = useState<boolean>(false);

  const loadSummary = useCallback(
    async (targetDays: number, overrideKey?: string) => {
      const effectiveKey = overrideKey !== undefined ? overrideKey.trim() : activeKey;
      const runFetch = async (jwtToken: string | null): Promise<Response> => {
        const headers: Record<string, string> = {};
        if (effectiveKey) {
          headers['x-analytics-key'] = effectiveKey;
        } else if (jwtToken) {
          headers.Authorization = `Bearer ${jwtToken}`;
        }
        return fetch(`/api/analytics/summary?days=${targetDays}`, {
          method: 'GET',
          headers,
          cache: 'no-store',
        });
      };

      setIsRefreshing(true);
      try {
        let token = getAuthAccessToken();
        if (!effectiveKey && !token) {
          setReport(null);
          setAuthErrorCode('NEED_AUTH');
          setAuthErrorMessage(null);
          return;
        }

        let res = await runFetch(token);
        if (res.status === 401 && !effectiveKey && token) {
          const refreshed = await refreshAuthSession();
          if (refreshed?.accessToken) {
            token = refreshed.accessToken;
            setCloudUser(refreshed.user);
            res = await runFetch(token);
          }
        }

        const data = (await res.json().catch(() => ({}))) as SummaryApiResponse;
        if (!res.ok || !data.ok) {
          setReport(null);
          setAuthErrorCode(data.code || `HTTP_${res.status}`);
          setAuthErrorMessage(
            data.error ||
              (res.status === 401
                ? 'รหัส Admin Key ไม่ถูกต้อง หรือ Session หมดอายุ'
                : 'ไม่สามารถโหลดข้อมูลสถิติได้')
          );
          if (data.viewerEmail) {
            setViewerEmailHint(data.viewerEmail);
          }
          if (res.status === 401 && effectiveKey) {
            saveAdminKeyToBrowser('', false);
            setActiveKey('');
          }
          return;
        }

        setReport(data);
        setAuthErrorCode(null);
        setAuthErrorMessage(null);
        if (data.viewerEmail) {
          setViewerEmailHint(data.viewerEmail);
        }
        setLastFetchedAt(new Date().toISOString());
        try {
          window.localStorage?.setItem(ADMIN_ANALYTICS_UNLOCKED_KEY, '1');
        } catch {
          // Ignore storage error
        }
      } catch (err) {
        setAuthErrorCode('NETWORK_ERROR');
        setAuthErrorMessage(
          err instanceof Error ? err.message : 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ'
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [activeKey]
  );

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      await consumeAuthCallbackFromUrl().catch(() => null);
      if (cancelled) return;

      const user = getCurrentUser();
      setCloudUser(user);
      setCloudReady(isCloudConfigured());
      if (user.mode === 'authenticated' && user.email) {
        setViewerEmailHint(user.email);
      }

      const savedKey = readSavedAdminKey();
      if (savedKey) {
        setActiveKey(savedKey);
        setKeyInput(savedKey);
      }

      await loadSummary(30, savedKey);
    };
    void bootstrap();
    return () => {
      cancelled = true;
    };
    // Initial mount bootstrap intentionally runs once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChangeWindow = (nextDays: number) => {
    setDays(nextDays);
    void loadSummary(nextDays);
  };

  const handleSubmitAdminKey = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = keyInput.trim();
    if (!cleaned) return;
    setActiveKey(cleaned);
    saveAdminKeyToBrowser(cleaned, rememberKey);
    setIsLoading(true);
    void loadSummary(days, cleaned);
  };

  const handleGoogleSignIn = () => {
    const redirectTo =
      typeof window !== 'undefined'
        ? `${window.location.origin}/admin/analytics`
        : undefined;
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
    setAuthErrorMessage('ออกจากหน้าต่างผู้ดูแลแล้ว');
  };

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(ANALYTICS_MIGRATION_SQL);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2500);
    } catch {
      // Ignore clipboard permission failure
    }
  };

  const handleCopyEnvLine = async (email: string) => {
    try {
      await navigator.clipboard.writeText(`ANALYTICS_ADMIN_EMAILS=${email}`);
      setCopiedEnvHint(true);
      setTimeout(() => setCopiedEnvHint(false), 2500);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleDownloadReportJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `demo-maker-analytics-${days}d.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const filteredFeatures = useMemo(() => {
    const list = report?.summary.topFeatures ?? [];
    if (featureTab === 'ai') return list.filter((f) => f.category === 'ai');
    if (featureTab === 'free') return list.filter((f) => f.category !== 'ai');
    return list;
  }, [featureTab, report?.summary.topFeatures]);

  const maxFeatureCount = useMemo(
    () => Math.max(1, ...filteredFeatures.map((f) => f.count)),
    [filteredFeatures]
  );

  const maxSongwriterCount = useMemo(
    () => Math.max(1, ...(report?.summary.topSongwriters ?? []).map((s) => s.totalCount)),
    [report?.summary.topSongwriters]
  );

  const aiVsFreeStats = useMemo(() => {
    const list = report?.summary.topFeatures ?? [];
    let aiCount = 0;
    let nonAiCount = 0;
    for (const item of list) {
      if (item.category === 'ai') aiCount += item.count;
      else if (item.category !== 'session') nonAiCount += item.count;
    }
    return { aiCount, nonAiCount };
  }, [report?.summary.topFeatures]);

  const guestSharePct = useMemo(() => {
    const total = report?.summary.totalEvents ?? 0;
    if (total === 0) return 0;
    return Math.round(((report?.summary.guestEvents ?? 0) / total) * 100);
  }, [report?.summary]);

  return (
    <div className="min-h-screen bg-canvas text-ink-900">
      {/* Top Admin Studio Header */}
      <header className="sticky top-0 z-30 border-b border-hairline studio-glass">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
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
                <BarChart3 className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-sm sm:text-base font-bold text-ink-900 leading-tight">
                  สถิติการใช้งาน Demo Maker Easy
                </h1>
                <p className="text-[11px] text-ink-400">
                  Admin Product Analytics · อันดับฟังก์ชัน & สไตล์นักแต่งเพลงยอดนิยม
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {report && (
              <>
                <div className="inline-flex items-center rounded-xl bg-surface-inset p-0.5 border border-hairline">
                  {WINDOW_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleChangeWindow(opt)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        days === opt
                          ? 'bg-surface-1 text-accent-text shadow-e1'
                          : 'text-ink-400 hover:text-ink-900'
                      }`}
                    >
                      {opt} วัน
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => void loadSummary(days)}
                  disabled={isRefreshing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent-500 hover:bg-accent-hover text-white text-xs font-semibold transition cursor-pointer disabled:opacity-60"
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
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-surface-1 hover:bg-surface-2 border border-hairline text-xs font-semibold text-ink-400 hover:text-rec-500 transition cursor-pointer"
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

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <AdminNavTabs activeTab="analytics" />
        </div>

        {/* Loading State */}
        {isLoading && !report && (
          <div className="rounded-3xl bg-surface-1 border border-hairline shadow-e1 p-10 text-center space-y-3">
            <RefreshCw className="w-7 h-7 text-accent-text animate-spin mx-auto" />
            <p className="text-sm font-semibold text-ink-700">
              กำลังตรวจสอบสิทธิ์และดึงข้อมูลสถิติ...
            </p>
          </div>
        )}

        {/* Auth / Unlock Gate */}
        {!isLoading && !report && (
          <div className="max-w-xl mx-auto space-y-4">
            <div className="rounded-3xl bg-surface-1 border border-hairline shadow-e2 p-6 sm:p-7 space-y-5">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-accent-50 text-accent-text flex items-center justify-center shrink-0">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-ink-900">
                    ยืนยันตัวตนเจ้าของระบบ (Admin Access)
                  </h2>
                  <p className="text-xs text-ink-400 mt-0.5 leading-relaxed">
                    เพื่อความเป็นส่วนตัว ข้อมูลการใช้งานของลูกค้าจะเปิดดูได้เฉพาะเจ้าของระบบเท่านั้น เลือกยืนยันได้ 2 วิธีด้านล่าง
                  </p>
                </div>
              </div>

              {authErrorMessage && authErrorCode !== 'NEED_AUTH' && (
                <div className="rounded-2xl p-3.5 bg-amber-500/10 border border-amber-500/30 text-xs text-ink-900 space-y-2">
                  <div className="flex items-start gap-2 font-semibold">
                    <ShieldAlert className="w-4 h-4 text-warn-500 shrink-0 mt-0.5" />
                    <span>{authErrorMessage}</span>
                  </div>

                  {viewerEmailHint && authErrorCode === 'ADMIN_EMAILS_NOT_CONFIGURED' && (
                    <div className="p-2.5 rounded-xl bg-surface-1 border border-hairline space-y-1.5">
                      <p className="text-[11px] text-ink-700">
                        ตอนนี้อีเมล Google ที่ล็อกอินอยู่คือ{' '}
                        <span className="font-mono font-bold text-accent-text">{viewerEmailHint}</span>
                        {' '}— หากอยากเปิดดูหน้านี้ด้วยบัญชี Google ได้เลย ให้เพิ่มตัวแปรนี้ใน Vercel → Settings → Environment Variables แล้ว Redeploy:
                      </p>
                      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-surface-inset font-mono text-[11px] text-ink-900">
                        <span className="truncate">ANALYTICS_ADMIN_EMAILS={viewerEmailHint}</span>
                        <button
                          type="button"
                          onClick={() => void handleCopyEnvLine(viewerEmailHint)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent-500 text-white font-sans text-[10px] font-semibold shrink-0 cursor-pointer"
                        >
                          {copiedEnvHint ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedEnvHint ? 'คัดลอกแล้ว' : 'Copy'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Option 1: Google Sign-In */}
              <div className="rounded-2xl bg-surface-2 border border-hairline p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-ink-900">
                    วิธีที่ 1: เข้าด้วยบัญชี Google ของเจ้าของ
                  </span>
                  {cloudUser?.mode === 'authenticated' && cloudUser.email && (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-accent-50 text-accent-text">
                      {cloudUser.email}
                    </span>
                  )}
                </div>
                {cloudUser?.mode === 'authenticated' ? (
                  <p className="text-[11px] text-ink-400">
                    คุณล็อกอิน Google ในเบราว์เซอร์นี้อยู่แล้ว — เมื่อเพิ่มอีเมลใน Vercel{' '}
                    <code className="font-mono text-ink-700">ANALYTICS_ADMIN_EMAILS</code> ระบบจะเปิดอัตโนมัติ หรือใช้วิธีที่ 2 ด้านล่างได้ทันที
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={!cloudReady}
                    className="w-full py-2.5 px-4 rounded-xl bg-surface-1 hover:bg-surface-inset border border-hairline text-xs font-bold text-ink-900 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 shadow-e1"
                  >
                    <span>🔐 เข้าสู่ระบบด้วย Google</span>
                  </button>
                )}
              </div>

              {/* Option 2: Admin Key */}
              <form onSubmit={handleSubmitAdminKey} className="rounded-2xl bg-surface-2 border border-hairline p-4 space-y-3">
                <div>
                  <label htmlFor="admin-analytics-key" className="text-xs font-bold text-ink-900 block">
                    วิธีที่ 2: กรอก Admin Key (<code className="font-mono">ANALYTICS_ADMIN_KEY</code>)
                  </label>
                  <p className="text-[11px] text-ink-400 mt-0.5">
                    ใช้รหัส <code className="font-mono">ANALYTICS_ADMIN_KEY</code> หรือ{' '}
                    <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> เพื่อเข้าดูทันที
                  </p>
                </div>

                <div className="relative">
                  <input
                    id="admin-analytics-key"
                    type={showKeyText ? 'text' : 'password'}
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="วาง Admin Key ของคุณที่นี่..."
                    className="w-full pr-10 pl-3.5 py-2.5 rounded-xl bg-surface-1 border border-hairline text-xs font-mono text-ink-900 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
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
                    เปิดดูสถิติเลย →
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Authenticated Dashboard View */}
        {report && (
          <>
            {/* Status Bar & SQL Migration Helper */}
            {!report.tableReady ? (
              <div className="rounded-3xl bg-amber-500/10 border border-amber-500/30 p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-warn-500 flex items-center justify-center shrink-0">
                      <Database className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-ink-900">
                        ยังไม่ได้สร้างตารางเก็บสถิติใน Supabase (ทำ 1 ครั้งเพื่อเริ่มเก็บข้อมูลจริง)
                      </h2>
                      <p className="text-xs text-ink-700 mt-0.5 leading-relaxed">
                        กดปุ่ม <strong>คัดลอก SQL</strong> ด้านขวา → เปิด{' '}
                        <strong>Supabase Dashboard → SQL Editor → New Query</strong> → วางแล้วกด <strong>Run</strong>{' '}
                        เสร็จแล้วกลับมากดปุ่ม <strong>รีเฟรช</strong> ด้านบนได้เลยครับ
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowSqlPreview((v) => !v)}
                      className="px-3 py-2 rounded-xl bg-surface-1 border border-hairline text-xs font-semibold text-ink-700 hover:text-ink-900 cursor-pointer"
                    >
                      {showSqlPreview ? 'ซ่อน SQL' : 'ดูโค้ด SQL'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopySql()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-accent-500 hover:bg-accent-hover text-white text-xs font-bold transition cursor-pointer"
                    >
                      {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedSql ? 'คัดลอก SQL แล้ว!' : 'คัดลอก SQL (1 คลิก)'}</span>
                    </button>
                  </div>
                </div>

                {showSqlPreview && (
                  <pre className="p-3 rounded-2xl bg-surface-1 border border-hairline text-[11px] font-mono text-ink-700 overflow-x-auto max-h-64">
                    {ANALYTICS_MIGRATION_SQL}
                  </pre>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-400 px-1">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-ok-500" />
                  <span>
                    เชื่อมต่อ Supabase พร้อมเก็บข้อมูลสด · ย้อนหลัง {report.windowDays} วัน
                    {report.viewerEmail ? ` · เข้าสู่ระบบโดย ${report.viewerEmail}` : ''}
                  </span>
                </div>
                {lastFetchedAt && (
                  <span className="font-mono-tabular text-[11px]">
                    อัปเดตล่าสุด: {formatThaiTimestamp(lastFetchedAt)}
                  </span>
                )}
              </div>
            )}

            {/* 4 KPI Summary Cards */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="rounded-2xl bg-surface-1 border border-hairline shadow-e1 p-4 space-y-1">
                <p className="text-[11px] font-semibold text-ink-400">การใช้งานทั้งหมด</p>
                <p className="text-2xl sm:text-3xl font-bold font-mono-tabular text-ink-900">
                  {report.summary.totalEvents.toLocaleString()}
                </p>
                <p className="text-[11px] text-ink-400">Events ใน {report.windowDays} วัน</p>
              </div>

              <div className="rounded-2xl bg-surface-1 border border-hairline shadow-e1 p-4 space-y-1">
                <p className="text-[11px] font-semibold text-ink-400 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-accent-text" />
                  <span>ผู้ใช้งานไม่ซ้ำ</span>
                </p>
                <p className="text-2xl sm:text-3xl font-bold font-mono-tabular text-accent-text">
                  {report.summary.uniqueActors.toLocaleString()}
                </p>
                <p className="text-[11px] text-ink-400">บัญชี + อุปกรณ์ Guest</p>
              </div>

              <div className="rounded-2xl bg-surface-1 border border-hairline shadow-e1 p-4 space-y-1.5">
                <p className="text-[11px] font-semibold text-ink-400">สัดส่วน Guest vs ล็อกอิน</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl sm:text-2xl font-bold font-mono-tabular text-ink-900">
                    {guestSharePct}%
                  </span>
                  <span className="text-xs text-ink-400">Guest</span>
                  <span className="text-xs text-ink-400">·</span>
                  <span className="text-sm font-bold font-mono-tabular text-ok-500">
                    {100 - guestSharePct}%
                  </span>
                  <span className="text-xs text-ink-400">Login</span>
                </div>
                <p className="text-[11px] text-ink-400 font-mono-tabular">
                  {report.summary.guestEvents.toLocaleString()} / {report.summary.authenticatedEvents.toLocaleString()} ครั้ง
                </p>
              </div>

              <div className="rounded-2xl bg-surface-1 border border-hairline shadow-e1 p-4 space-y-1.5">
                <p className="text-[11px] font-semibold text-ink-400 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-warn-500" />
                  <span>AI vs เครื่องมือสตูดิโอ</span>
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl sm:text-2xl font-bold font-mono-tabular text-ink-900">
                    {aiVsFreeStats.aiCount.toLocaleString()}
                  </span>
                  <span className="text-xs text-ink-400">AI</span>
                  <span className="text-xs text-ink-400">/</span>
                  <span className="text-lg font-bold font-mono-tabular text-ink-700">
                    {aiVsFreeStats.nonAiCount.toLocaleString()}
                  </span>
                  <span className="text-xs text-ink-400">เครื่องมืออื่นๆ</span>
                </div>
                <p className="text-[11px] text-ink-400">เปรียบเทียบการใช้เครดิตกับฟรี</p>
              </div>
            </section>

            {/* Main 2-Column Rankings */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Top Features */}
              <div className="rounded-3xl bg-surface-1 border border-hairline shadow-e1 p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline pb-3">
                  <div>
                    <h2 className="text-base font-bold text-ink-900">
                      🏆 ฟังก์ชันที่มีคนใช้งานมากที่สุด
                    </h2>
                    <p className="text-[11px] text-ink-400">
                      เรียงตามจำนวนครั้งที่กดใช้จริง (รวม Guest + Google Login)
                    </p>
                  </div>

                  <div className="inline-flex rounded-xl bg-surface-inset p-0.5 border border-hairline">
                    {(
                      [
                        ['all', 'ทั้งหมด'],
                        ['ai', 'เฉพาะ AI'],
                        ['free', 'ฟรี & Export'],
                      ] as const
                    ).map(([tabId, label]) => (
                      <button
                        key={tabId}
                        type="button"
                        onClick={() => setFeatureTab(tabId)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                          featureTab === tabId
                            ? 'bg-surface-1 text-accent-text shadow-e1'
                            : 'text-ink-400 hover:text-ink-900'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredFeatures.length === 0 ? (
                  <div className="py-10 text-center text-xs text-ink-400">
                    ยังไม่มีข้อมูลการใช้งานในหมวดนี้ (ลองใช้งานแอปสัก 1–2 ปุ่มแล้วกด รีเฟรช)
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredFeatures.map((item, idx) => {
                      const info = getReadableFeatureInfo(item.eventName, item.category);
                      const pct = Math.max(4, Math.round((item.count / maxFeatureCount) * 100));
                      return (
                        <div key={`${item.eventName}-${item.category}`} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`w-6 h-6 rounded-lg text-[11px] font-bold font-mono-tabular flex items-center justify-center shrink-0 ${
                                  idx === 0
                                    ? 'bg-amber-500/20 text-warn-500'
                                    : idx === 1
                                      ? 'bg-accent-50 text-accent-text'
                                      : 'bg-surface-inset text-ink-700'
                                }`}
                              >
                                #{idx + 1}
                              </span>
                              <span className="text-sm" aria-hidden="true">
                                {info.icon}
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-ink-900 truncate">
                                  {info.titleTh}
                                </p>
                                <p className="text-[10px] text-ink-400 font-mono truncate">
                                  {info.badgeTh} · {item.eventName} · {item.uniqueActors} คน/เครื่อง (Guest {item.guestCount} / Login {item.authenticatedCount})
                                </p>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="text-sm font-bold font-mono-tabular text-ink-900">
                                {item.count.toLocaleString()}
                              </span>
                              <span className="text-[10px] text-ink-400 ml-1">ครั้ง</span>
                            </div>
                          </div>

                          <div className="h-2 w-full rounded-full bg-surface-inset overflow-hidden">
                            <div
                              className="h-full rounded-full bg-accent-500 transition-all duration-300"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Top Songwriters */}
              <div className="rounded-3xl bg-surface-1 border border-hairline shadow-e1 p-5 space-y-4">
                <div className="border-b border-hairline pb-3">
                  <h2 className="text-base font-bold text-ink-900">
                    ✍️ สไตล์นักแต่งเพลงที่คนเลือกใช้มากที่สุด
                  </h2>
                  <p className="text-[11px] text-ink-400">
                    นับทั้งตอนเลือกใน Picker และตอนนำไปกดให้ AI สร้างเพลงจริง (รวม หงา คาราวาน, กบ บิ๊กแอส ฯลฯ)
                  </p>
                </div>

                {(report.summary.topSongwriters ?? []).length === 0 ? (
                  <div className="py-10 text-center text-xs text-ink-400">
                    ยังไม่มีสถิติการเลือกสไตล์นักแต่งเพลงในช่วง {report.windowDays} วันนี้
                  </div>
                ) : (
                  <div className="space-y-3">
                    {report.summary.topSongwriters.map((sw, idx) => {
                      const pct = Math.max(4, Math.round((sw.totalCount / maxSongwriterCount) * 100));
                      const readable = getReadableSongwriterLabel(sw.songwriterStyle, sw.label);
                      return (
                        <div key={sw.songwriterStyle} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`w-6 h-6 rounded-lg text-[11px] font-bold font-mono-tabular flex items-center justify-center shrink-0 ${
                                  idx === 0
                                    ? 'bg-amber-500/20 text-warn-500'
                                    : idx === 1
                                      ? 'bg-accent-50 text-accent-text'
                                      : 'bg-surface-inset text-ink-700'
                                }`}
                              >
                                #{idx + 1}
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-ink-900 truncate">
                                  {readable}
                                </p>
                                <p className="text-[10px] text-ink-400 font-mono truncate">
                                  AI สร้างจริง {sw.aiGenerationCount} · กดเลือก {sw.pickerSelectCount} · {sw.uniqueActors} คน/เครื่อง
                                </p>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="text-sm font-bold font-mono-tabular text-ink-900">
                                {sw.totalCount.toLocaleString()}
                              </span>
                              <span className="text-[10px] text-ink-400 ml-1">ครั้ง</span>
                            </div>
                          </div>

                          <div className="h-2 w-full rounded-full bg-surface-inset overflow-hidden">
                            <div
                              className="h-full rounded-full bg-ok-500 transition-all duration-300"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            {/* 3-Column Secondary Breakdowns */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Top Genres */}
              <div className="rounded-2xl bg-surface-1 border border-hairline shadow-e1 p-4 space-y-3">
                <h3 className="text-sm font-bold text-ink-900">🎵 แนวเพลงยอดนิยม</h3>
                {report.summary.topGenres.length === 0 ? (
                  <p className="text-xs text-ink-400">ยังไม่มีข้อมูล</p>
                ) : (
                  <div className="space-y-2">
                    {report.summary.topGenres.map((g) => (
                      <div key={g.thaiGenre} className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-ink-700 truncate">
                          {getReadableGenreLabel(g.thaiGenre)}
                        </span>
                        <span className="font-mono-tabular font-bold text-ink-900 shrink-0">
                          {g.count.toLocaleString()} ({g.uniqueActors} คน)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top Dialects */}
              <div className="rounded-2xl bg-surface-1 border border-hairline shadow-e1 p-4 space-y-3">
                <h3 className="text-sm font-bold text-ink-900">🗣️ ภาษาถิ่นยอดนิยม</h3>
                {report.summary.topDialects.length === 0 ? (
                  <p className="text-xs text-ink-400">ยังไม่มีข้อมูล</p>
                ) : (
                  <div className="space-y-2">
                    {report.summary.topDialects.map((d) => (
                      <div key={d.lyricDialect} className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-ink-700 truncate">
                          {getReadableDialectLabel(d.lyricDialect)}
                        </span>
                        <span className="font-mono-tabular font-bold text-ink-900 shrink-0">
                          {d.count.toLocaleString()} ({d.uniqueActors} คน)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top View Modes */}
              <div className="rounded-2xl bg-surface-1 border border-hairline shadow-e1 p-4 space-y-3">
                <h3 className="text-sm font-bold text-ink-900">🖥️ โหมดหน้าจอยอดนิยม</h3>
                {report.summary.topViewModes.length === 0 ? (
                  <p className="text-xs text-ink-400">ยังไม่มีข้อมูล</p>
                ) : (
                  <div className="space-y-2">
                    {report.summary.topViewModes.map((vm) => (
                      <div key={vm.viewMode} className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-ink-700 truncate">
                          {getReadableViewModeLabel(vm.viewMode)}
                        </span>
                        <span className="font-mono-tabular font-bold text-ink-900 shrink-0">
                          {vm.count.toLocaleString()} ({vm.uniqueActors} คน)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
};
