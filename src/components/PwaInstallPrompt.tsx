'use client';

import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/context/LanguageContext';

export const PwaInstallPrompt: React.FC = () => {
  const { lang, t } = useLanguage();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIosOrIpad, setIsIosOrIpad] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if dismissed before
    const dismissed = localStorage.getItem('demo_maker_pwa_dismissed') === 'true';
    if (dismissed) {
      setIsDismissed(true);
    }

    // Check if already running standalone
    const isStandaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(isStandaloneMode);

    // Detect iOS / iPadOS
    const ua = window.navigator.userAgent.toLowerCase();
    const isIos =
      /iphone|ipad|ipod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIosOrIpad(isIos);

    // Chromium install prompt listener
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      localStorage.setItem('demo_maker_pwa_dismissed', 'true');
    } catch (e) {
      // ignore
    }
  };

  if (isStandalone || isDismissed) {
    return null;
  }

  // Chromium Install Prompt Banner
  if (deferredPrompt) {
    return (
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2.5 text-xs sm:text-sm font-medium shadow-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-base sm:text-lg">📲</span>
          <span>
            {lang === 'th'
              ? 'ติดตั้ง Demo Maker Easy เป็นแอปบนอุปกรณ์นี้เพื่อความสะดวกและรวดเร็วสูงสุด'
              : 'Install Demo Maker Easy as a standalone app on your device for best performance'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleInstallClick}
            className="px-3 py-1 bg-white text-blue-700 hover:bg-blue-50 font-bold rounded-lg shadow-2xs transition cursor-pointer text-xs"
          >
            {t.installAppBtn}
          </button>
          <button
            onClick={handleDismiss}
            className="text-white/80 hover:text-white px-1.5 py-0.5 rounded cursor-pointer"
            title={t.close}
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  // iOS / iPad Safari instructions banner
  if (isIosOrIpad) {
    return (
      <div className="bg-gradient-to-r from-amber-50 to-blue-50 border-b border-blue-200/60 text-slate-800 px-4 py-2 text-xs sm:text-sm flex items-center justify-between gap-2 shadow-2xs">
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="text-base">📱</span>
          <span className="truncate sm:overflow-visible">
            {lang === 'th' ? (
              <>
                <strong className="text-blue-900">ติดตั้งบน iPad / iPhone:</strong> แตะปุ่มแชร์{' '}
                <span className="font-bold bg-white px-1.5 py-0.5 rounded border border-slate-300">📤</span> แล้วเลือก{' '}
                <span className="font-bold text-blue-700">"เพิ่มไปยังหน้าจอโฮม"</span> เพื่อเล่นแบบเต็มจอ 100%
              </>
            ) : (
              <>
                <strong className="text-blue-900">Install on iPad / iPhone:</strong> Tap Share{' '}
                <span className="font-bold bg-white px-1.5 py-0.5 rounded border border-slate-300">📤</span> and select{' '}
                <span className="font-bold text-blue-700">"Add to Home Screen"</span> for full screen teleprompter!
              </>
            )}
          </span>
        </div>
        <button
          onClick={handleDismiss}
          className="text-slate-400 hover:text-slate-700 px-2 py-0.5 rounded cursor-pointer shrink-0"
          title={t.close}
        >
          ✕
        </button>
      </div>
    );
  }

  return null;
};
