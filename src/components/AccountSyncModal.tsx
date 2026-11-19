'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  CloudSyncStatus,
  CloudUser,
  getCloudConfig,
  saveCloudConfig,
  isCloudConfigured,
  signInWithGoogleOAuth,
  signInWithEmailOtp,
  verifyEmailOtp,
  signOutUser,
} from '@/lib/cloudSync';
import { useLanguage } from '@/context/LanguageContext';
import { isAdminAnalyticsUnlocked } from '@/lib/analyticsLabels';

interface AccountSyncModalProps {
  isOpen: boolean;
  user: CloudUser;
  syncStatus: CloudSyncStatus;
  lastSyncedAt?: string | null;
  onSyncNow: () => Promise<{ success: boolean; message: string }>;
  onAuthChange: (user: CloudUser, status: CloudSyncStatus) => void;
  onClose: () => void;
}

const SYNC_STATUS_STYLE: Record<
  CloudSyncStatus,
  { dot: string; badge: string; labelTh: string; labelEn: string }
> = {
  synced: {
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    labelTh: 'ซิงค์แล้ว (Synced)',
    labelEn: 'Synced',
  },
  syncing: {
    dot: 'bg-blue-500 animate-pulse',
    badge: 'bg-blue-50 text-[#1A73E8] border-blue-200',
    labelTh: 'กำลังซิงค์...',
    labelEn: 'Syncing...',
  },
  'local-only': {
    dot: 'bg-slate-400',
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    labelTh: 'บันทึกในเครื่อง (Local Only)',
    labelEn: 'Local Only',
  },
  offline: {
    dot: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-800 border-amber-200',
    labelTh: 'ออฟไลน์ (Offline)',
    labelEn: 'Offline',
  },
  error: {
    dot: 'bg-rose-500',
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    labelTh: 'ซิงค์ขัดข้อง (Error)',
    labelEn: 'Sync Error',
  },
};

export const AccountSyncModal: React.FC<AccountSyncModalProps> = ({
  isOpen,
  user,
  syncStatus,
  lastSyncedAt,
  onSyncNow,
  onAuthChange,
  onClose,
}) => {
  const { lang } = useLanguage();
  const [emailInput, setEmailInput] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const initialConfig = getCloudConfig();
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(initialConfig.autoSyncEnabled);
  const [supabaseUrl, setSupabaseUrl] = useState(initialConfig.supabaseUrl || '');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState(initialConfig.supabaseAnonKey || '');

  if (!isOpen) return null;

  const statusMeta = SYNC_STATUS_STYLE[syncStatus];
  const cloudReady = isCloudConfigured();

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) return;
    setIsSubmitting(true);
    setFeedback(null);
    const res = await signInWithEmailOtp(emailInput);
    setIsSubmitting(false);
    setFeedback({ ok: res.success, text: res.message });
    if (res.otpSent) setOtpSent(true);
    onAuthChange(res.user, res.status);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpToken.trim()) return;
    setIsSubmitting(true);
    const res = await verifyEmailOtp(emailInput, otpToken);
    setIsSubmitting(false);
    setFeedback({ ok: res.success, text: res.message });
    if (res.success) {
      setOtpSent(false);
      setOtpToken('');
      onAuthChange(res.user, res.status);
    }
  };

  const handleSignOut = async () => {
    setIsSubmitting(true);
    const res = await signOutUser();
    setIsSubmitting(false);
    setOtpSent(false);
    setFeedback({
      ok: true,
      text: lang === 'th' ? 'ออกจากระบบกลับสู่โหมด Guest แล้ว' : 'Signed out to Guest mode.',
    });
    onAuthChange(res.user, res.status);
  };

  const handleSyncClick = async () => {
    setIsSubmitting(true);
    const res = await onSyncNow();
    setIsSubmitting(false);
    setFeedback({ ok: res.success, text: res.message });
  };

  const handleGoogleSignIn = () => {
    setFeedback(null);
    const res = signInWithGoogleOAuth();
    setFeedback({ ok: res.success, text: res.message });
    if (res.status) {
      onAuthChange(res.user, res.status);
    }
  };

  const handleToggleAutoSync = () => {
    const nextVal = !autoSyncEnabled;
    setAutoSyncEnabled(nextVal);
    const cur = getCloudConfig();
    saveCloudConfig({
      ...cur,
      autoSyncEnabled: nextVal,
    });
    setFeedback({
      ok: true,
      text: nextVal
        ? lang === 'th'
          ? 'เปิดซิงค์อัตโนมัติขึ้น Cloud หลังบันทึกเพลงแล้ว'
          : 'Auto-sync on local save enabled.'
        : lang === 'th'
          ? 'ปิดซิงค์อัตโนมัติชั่วคราว (กด Sync Now เมื่อต้องการ)'
          : 'Auto-sync paused (use Sync Now anytime).',
    });
  };

  const handleSaveCloudSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const nextAutoSync = Boolean(supabaseUrl.trim() && supabaseAnonKey.trim())
      ? autoSyncEnabled
      : false;
    saveCloudConfig({
      supabaseUrl: supabaseUrl.trim(),
      supabaseAnonKey: supabaseAnonKey.trim(),
      autoSyncEnabled: nextAutoSync,
    });
    setFeedback({
      ok: true,
      text:
        lang === 'th'
          ? 'บันทึกการตั้งค่า Supabase Cloud เรียบร้อยแล้ว'
          : 'Saved Supabase Cloud configuration.',
    });
    onAuthChange(user, 'local-only');
  };

  const avatarInitial =
    user.mode === 'authenticated'
      ? (user.email?.[0] || user.displayName[0] || 'U').toUpperCase()
      : '👤';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="bg-surface-1 text-ink-900 rounded-3xl border border-hairline shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-hairline pb-3">
          <div>
            <h3 className="font-black text-lg text-ink-900 flex items-center gap-2">
              {lang === 'th' ? '☁️ บัญชี & Cloud Sync' : '☁️ Account & Cloud Sync'}
            </h3>
            <p className="text-xs text-ink-400">
              {lang === 'th'
                ? 'ซิงค์เพลง โฟลเดอร์ และ Snapshots ระหว่าง iPad / iPhone / คอมพิวเตอร์'
                : 'Sync your songs, folders & snapshots across iPad, iPhone and desktop.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface-2 hover:bg-surface-inset text-ink-700 flex items-center justify-center font-bold text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* User Profile Card + Live Status */}
        <div className="p-4 rounded-2xl bg-surface-2 border border-hairline space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-base shrink-0 ${
                  user.mode === 'authenticated'
                    ? 'bg-[#1A73E8] text-white shadow-sm'
                    : 'bg-surface-inset text-ink-700'
                }`}
              >
                {avatarInitial}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-black text-sm text-ink-900 truncate">{user.displayName}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                      user.mode === 'authenticated'
                        ? 'bg-accent-50 text-accent-text border-accent-200'
                        : 'bg-surface-1 text-ink-700 border-hairline'
                    }`}
                  >
                    {user.mode === 'authenticated'
                      ? lang === 'th' ? 'บัญชี Cloud' : 'Cloud Member'
                      : 'Guest'}
                  </span>
                </div>
                <div className="text-xs text-ink-400 truncate">
                  {user.email ||
                    (lang === 'th'
                      ? 'ทำงานแบบ Offline-First (บันทึกในเครื่องอัตโนมัติ)'
                      : 'Offline-first mode (saved locally on device)')}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-hairline">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${statusMeta.badge}`}
            >
              <span className={`w-2 h-2 rounded-full ${statusMeta.dot}`} />
              <span>{lang === 'th' ? statusMeta.labelTh : statusMeta.labelEn}</span>
            </span>

            {lastSyncedAt && (
              <span className="text-[11px] text-ink-400">
                {lang === 'th' ? 'ซิงค์ล่าสุด: ' : 'Last sync: '}
                {new Date(lastSyncedAt).toLocaleTimeString(lang === 'th' ? 'th-TH' : 'en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`px-3.5 py-2.5 rounded-xl border text-xs font-bold animate-in fade-in ${
              feedback.ok
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {feedback.text}
          </div>
        )}

        {/* 1-Click Sync Now Button + Auto-Sync Toggle */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleSyncClick}
            disabled={isSubmitting || syncStatus === 'syncing'}
            className="w-full py-2.5 px-4 rounded-2xl bg-[#1A73E8] hover:bg-blue-700 disabled:opacity-60 text-white font-black text-sm shadow-sm transition cursor-pointer flex items-center justify-center gap-2"
          >
            <span>{syncStatus === 'syncing' ? '⏳' : '☁️'}</span>
            <span>
              {syncStatus === 'syncing'
                ? lang === 'th' ? 'กำลังดึงและอัปโหลดเพลง...' : 'Syncing library...'
                : lang === 'th' ? 'ซิงค์ข้อมูลทันที (Sync Now)' : 'Sync Now'}
            </span>
          </button>

          <label className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-surface-2 border border-hairline text-xs cursor-pointer">
            <span className="font-semibold text-ink-700">
              {lang === 'th'
                ? 'ซิงค์อัตโนมัติเมื่อบันทึกเพลง (Auto-Sync)'
                : 'Auto-Sync on Local Save'}
            </span>
            <input
              type="checkbox"
              checked={autoSyncEnabled}
              onChange={handleToggleAutoSync}
              className="w-4 h-4 accent-[#1A73E8] cursor-pointer"
            />
          </label>
        </div>

        {/* Honest Vocal Assets Cross-Device Notice */}
        <div className="px-3.5 py-2.5 rounded-2xl bg-amber-50/80 border border-amber-200/80 text-[11px] text-amber-950 leading-relaxed">
          <span className="font-bold">🎙️ {lang === 'th' ? 'หมายเหตุไฟล์เสียงร้อง (IndexedDB):' : 'Vocal Audio Storage Note:'}</span>{' '}
          {lang === 'th'
            ? 'คอร์ด เนื้อร้อง โครงสร้างเพลง โฟลเดอร์ และ Snapshots จะซิงค์ขึ้น Cloud อัตโนมัติ ส่วนไฟล์เสียงร้อง (IndexedDB) เก็บในเครื่องเพื่อความรวดเร็ว — หากต้องการย้ายเสียงร้องข้ามเครื่อง แนะนำให้ Export ไฟล์สำรอง .JSON จากคลังเพลงครับ'
            : 'Chords, lyrics, arrangement, folders & snapshots sync to Cloud. Recorded vocal audio (IndexedDB) stays on-device for speed — use .JSON Export/Import in My Songs Library to transfer vocal audio across devices.'}
        </div>

        {/* Auth Form (Email OTP / Magic Link) OR Sign Out */}
        {user.mode === 'authenticated' ? (
          <div className="pt-2 border-t border-hairline flex items-center justify-between gap-2">
            <span className="text-xs text-ink-400">
              {lang === 'th' ? 'เชื่อมต่อบัญชีเรียบร้อยแล้ว' : 'Signed in across devices'}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs border border-rose-200 transition cursor-pointer"
            >
              {lang === 'th' ? 'ออกจากระบบ (Sign Out)' : 'Sign Out'}
            </button>
          </div>
        ) : (
          <div className="pt-2 border-t border-hairline space-y-3">
            {/* 1-Click Google OAuth Sign-In CTA */}
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 rounded-2xl bg-surface-2 hover:bg-surface-inset border border-hairline shadow-xs text-ink-900 font-black text-sm transition cursor-pointer flex items-center justify-center gap-2.5"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                </svg>
                <span>{lang === 'th' ? 'เข้าสู่ระบบด้วย Google' : 'Continue with Google'}</span>
              </button>
              <p className="text-[11px] text-emerald-700 bg-emerald-50/70 border border-emerald-200/80 rounded-xl px-3 py-1.5 leading-relaxed">
                {lang === 'th'
                  ? '🎵 โหมด Guest ใช้งานแต่งเพลง อัดร้อง (Vocal Booth) และ Export MP3 / MIDI ได้ฟรี 100% — ล็อกอินเมื่อต้องการซิงค์ข้ามเครื่องหรือเติมเครดิต'
                  : '🎵 Guest Mode is 100% free for songwriting, Vocal Booth & MP3/MIDI export. Sign in to sync across devices or top up AI credits.'}
              </p>
            </div>

            <form onSubmit={handleSendMagicLink} className="space-y-2 pt-1 border-t border-hairline">
              <label htmlFor="account-email-input" className="text-xs font-bold text-ink-700 block">
                {lang === 'th'
                  ? 'หรือเข้าสู่ระบบด้วยอีเมล (Magic Link / Email OTP)'
                  : 'Or sign in with Email (Magic Link / OTP)'}
              </label>
              <div className="flex gap-2">
                <input
                  id="account-email-input"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="artist@example.com"
                  className="flex-1 px-3.5 py-2 rounded-xl border border-hairline bg-surface-2 text-ink-900 placeholder:text-ink-400 text-sm focus:outline-none focus:border-[#1A73E8] focus:ring-2 focus:ring-blue-100"
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-bold text-xs whitespace-nowrap transition cursor-pointer"
                >
                  {lang === 'th' ? 'ส่ง Magic Link' : 'Send Link'}
                </button>
              </div>
              {!cloudReady && (
                <p className="text-[11px] text-ink-400 leading-relaxed">
                  {lang === 'th'
                    ? 'โหมด Standalone: แอปทำงานแบบ Guest ได้เต็มรูปแบบ 100% หรือเพิ่ม Supabase Config ด้านล่างเพื่อเชื่อมต่อ Cloud'
                    : 'Standalone mode: App works 100% offline as Guest, or set Supabase credentials below to enable multi-device cloud.'}
                </p>
              )}
            </form>

            {otpSent && (
              <form onSubmit={handleVerifyOtp} className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 space-y-2">
                <label htmlFor="account-otp-input" className="text-[11px] font-bold text-blue-900 block">
                  {lang === 'th' ? 'หรือกรอกรหัส OTP 6 หลักจากอีเมล:' : 'Or enter 6-digit OTP code from email:'}
                </label>
                <div className="flex gap-2">
                  <input
                    id="account-otp-input"
                    name="otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={otpToken}
                    onChange={(e) => setOtpToken(e.target.value)}
                    placeholder="123456"
                    className="flex-1 px-3 py-1.5 rounded-lg border border-blue-300 text-sm bg-white text-slate-900 tracking-widest font-mono focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-3.5 py-1.5 rounded-lg bg-[#1A73E8] text-white text-xs font-bold cursor-pointer"
                  >
                    {lang === 'th' ? 'ยืนยัน OTP' : 'Verify'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Admin Analytics Shortcut (visible only on browsers unlocked as admin) */}
        {isAdminAnalyticsUnlocked() && (
          <div className="pt-2 border-t border-hairline">
            <Link
              href="/admin/analytics"
              onClick={onClose}
              className="w-full py-2 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-xs font-bold text-indigo-800 flex items-center justify-between transition"
            >
              <span>📊 {lang === 'th' ? 'เปิดหน้าจอสถิติการใช้งาน (Admin)' : 'Open Admin Analytics Dashboard'}</span>
              <span>→</span>
            </Link>
          </div>
        )}

        {/* Collapsible Supabase Config */}
        <div className="pt-2 border-t border-hairline">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-[11px] font-bold text-ink-400 hover:text-ink-900 cursor-pointer flex items-center gap-1"
          >
            <span>⚙️ {lang === 'th' ? 'ตั้งค่า Supabase Endpoint (ไม่บังคับ)' : 'Cloud Endpoint Settings (Optional)'}</span>
            <span>{showAdvanced ? '▲' : '▼'}</span>
          </button>

          {showAdvanced && (
            <form onSubmit={handleSaveCloudSettings} className="mt-2 space-y-2 p-3 rounded-xl bg-surface-2 border border-hairline">
              <input
                id="supabase-url-input"
                name="supabaseUrl"
                type="url"
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                placeholder="https://your-project.supabase.co"
                className="w-full px-3 py-1.5 rounded-lg border border-hairline text-xs bg-surface-1 text-ink-900"
              />
              <input
                id="supabase-anon-key-input"
                name="supabaseAnonKey"
                type="password"
                value={supabaseAnonKey}
                onChange={(e) => setSupabaseAnonKey(e.target.value)}
                placeholder="Supabase Anon Key"
                className="w-full px-3 py-1.5 rounded-lg border border-hairline text-xs bg-surface-1 text-ink-900"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-bold cursor-pointer"
              >
                {lang === 'th' ? 'บันทึกการตั้งค่า Cloud' : 'Save Cloud Config'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
