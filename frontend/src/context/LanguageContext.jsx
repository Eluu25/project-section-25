import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { MESSAGES, translate, translateError, translateStatus } from '../i18n/messages.js';

const LanguageContext = createContext(null);

const STORAGE_KEY = 'lang';

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState('en');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (saved === 'en' || saved === 'am')) {
      setLanguage(saved);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language === 'am' ? 'am' : 'en';
  }, [language]);

  const t = useMemo(() => (key) => translate(language, key), [language]);
  const tError = useMemo(() => (message) => translateError(message, language), [language]);
  const tStatus = useMemo(() => (status) => translateStatus(status, language), [language]);

  const value = useMemo(
    () => ({ language, setLanguage, t, tError, tStatus, messages: MESSAGES[language] || MESSAGES.en }),
    [language, t, tError, tStatus]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return ctx;
};

