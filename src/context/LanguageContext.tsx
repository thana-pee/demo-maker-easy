'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language, Translations, translations, getSavedLanguage, saveLanguage } from '@/lib/i18n';

interface LanguageContextType {
  lang: Language;
  t: Translations;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'th',
  t: translations.th,
  setLang: () => {},
  toggleLang: () => {},
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>('th');

  useEffect(() => {
    const saved = getSavedLanguage();
    setLangState(saved);
  }, []);

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    saveLanguage(newLang);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = newLang;
    }
  };

  const toggleLang = () => {
    setLang(lang === 'th' ? 'en' : 'th');
  };

  return (
    <LanguageContext.Provider value={{ lang, t: translations[lang], setLang, toggleLang }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  return useContext(LanguageContext);
};
