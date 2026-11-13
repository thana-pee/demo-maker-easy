'use client';

import React, { useState } from 'react';
import {
  CloudSyncStatus,
  CloudUser,
  getCloudConfig,
  saveCloudConfig,
  isCloudConfigured,
  signInWithEmailOtp,
  verifyEmailOtp,
  signOutUser,
} from '@/lib/cloudSync';
import { useLanguage } from '@/context/LanguageContext';

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

  const handleSaveCloudSettings = (e: React.FormEvent) => {
    e.preventDefault();
    saveCloudConfig({
      supabaseUrl: supabaseUrl.trim(),
      supabaseAnonKey: supabaseAnonKey.trim(),
      autoSyncEnabled: Boolean(supabaseUrl.trim() && supabaseAnonKey.trim()),
    });
    setFeedback({
      ok: true,
      text:
        lang === 'th'
          ? 'บันทึกการตั้งค่า Supabase Cloud เรียบร้อยแล้ว'
          : 'Saved Supabase Cloud configuration.',
    });
    onAuthChange(user, Boolean(supabaseUrl.trim() && supabaseAnonKey.trim()) ? 'local-only' : 'local-only');
  };

  const avatarInitial =
    user.mode === 'authenticated'
      ? (user.email?.[0] || user.displayName[0] || 'U').toUpperCase()
      : '👤';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-black text-lg text-slate-900 flex items-center gap-2">
              {lang === 'th' ? '☁️ บัญชี & Cloud Sync' : '☁️ Account & Cloud Sync'}
            </h3>
            <p className="text-xs text-slate-500">
              {lang === 'th'
                ? 'ซิงค์เพลง โฟลเดอร์ และ Snapshots ระหว่าง iPad / iPhone / คอมพิวเตอร์'
                : 'Sync your songs, folders & snapshots across iPad, iPhone and desktop.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* User Profile Card + Live Status */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-base shrink-0 ${
                  user.mode === 'authenticated'
                    ? 'bg-[#1A73E8] text-white shadow-sm'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {avatarInitial}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-black text-sm text-slate-900 truncate">{user.displayName}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                      user.mode === 'authenticated'
                        ? 'bg-blue-50 text-[#1A73E8] border-blue-200'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    {user.mode === 'authenticated'
                      ? lang === 'th' ? 'บัญชี Cloud' : 'Cloud Member'
                      : 'Guest'}
                  </span>
                </div>
                <div className="text-xs text-slate-500 truncate">
                  {user.email ||
                    (lang === 'th'
                      ? 'ทำงานแบบ Offline-First (บันทึกในเครื่องอัตโนมัติ)'
                      : 'Offline-first mode (saved locally on device)')}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/70">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${statusMeta.badge}`}
            >
              <span className={`w-2 h-2 rounded-full ${statusMeta.dot}`} />
              <span>{lang === 'th' ? statusMeta.labelTh : statusMeta.labelEn}</span>
            </span>

            {lastSyncedAt && (
              <span className="text-[11px] text-slate-400">
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

        {/* 1-Click Sync Now Button */}
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

        {/* Auth Form (Email OTP / Magic Link) OR Sign Out */}
        {user.mode === 'authenticated' ? (
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
            <span className="text-xs text-slate-500">
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
          <div className="pt-2 border-t border-slate-100 space-y-2.5">
            <form onSubmit={handleSendMagicLink} className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                {lang === 'th'
                  ? 'เข้าสู่ระบบด้วยอีเมล (Magic Link / Email OTP)'
                  : 'Sign in with Email (Magic Link / OTP)'}
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="artist@example.com"
                  className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-[#1A73E8] focus:ring-2 focus:ring-blue-100"
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
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {lang === 'th'
                    ? 'โหมด Standalone: แอปทำงานแบบ Guest ได้เต็มรูปแบบ 100% หรือเพิ่ม Supabase Config ด้านล่างเพื่อเชื่อมต่อ Cloud'
                    : 'Standalone mode: App works 100% offline as Guest, or set Supabase credentials below to enable multi-device cloud.'}
                </p>
              )}
            </form>

            {otpSent && (
              <form onSubmit={handleVerifyOtp} className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 space-y-2">
                <label className="text-[11px] font-bold text-blue-900 block">
                  {lang === 'th' ? 'หรือกรอกรหัส OTP 6 หลักจากอีเมล:' : 'Or enter 6-digit OTP code from email:'}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={otpToken}
                    onChange={(e) => setOtpToken(e.target.value)}
                    placeholder="123456"
                    className="flex-1 px-3 py-1.5 rounded-lg border border-blue-300 text-sm bg-white tracking-widest font-mono focus:outline-none"
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

        {/* Collapsible Supabase Config */}
        <div className="pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-[11px] font-bold text-slate-400 hover:text-slate-700 cursor-pointer flex items-center gap-1"
          >
            <span>⚙️ {lang === 'th' ? 'ตั้งค่า Supabase Endpoint (ไม่บังคับ)' : 'Cloud Endpoint Settings (Optional)'}</span>
            <span>{showAdvanced ? '▲' : '▼'}</span>
          </button>

          {showAdvanced && (
            <form onSubmit={handleSaveCloudSettings} className="mt-2 space-y-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <input
                type="url"
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                placeholder="https://your-project.supabase.co"
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
              />
              <input
                type="password"
                value={supabaseAnonKey}
                onChange={(e) => setSupabaseAnonKey(e.target.value)}
                placeholder="Supabase Anon Key"
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
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
