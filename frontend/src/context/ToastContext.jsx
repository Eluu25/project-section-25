import { createContext, useContext, useState, useCallback } from 'react';
import { useLanguage } from './LanguageContext.jsx';
import { translateError } from '../i18n/messages.js';

const ToastContext = createContext();

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

const localizeMessage = (message, language) => {
  if (!message) return message;
  if (typeof message === 'string') return translateError(message, language);
  return message;
};

export const ToastProvider = ({ children }) => {
  const { language } = useLanguage();
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now();
    const toast = { id, message: localizeMessage(message, language), type, duration };
    setToasts((prev) => [...prev, toast]);
    return id;
  }, [language]);

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const success = useCallback((message, duration) => showToast(message, 'success', duration), [showToast]);
  const error = useCallback((message, duration) => showToast(message, 'error', duration), [showToast]);
  const warning = useCallback((message, duration) => showToast(message, 'warning', duration), [showToast]);
  const info = useCallback((message, duration) => showToast(message, 'info', duration), [showToast]);

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast, success, error, warning, info }}>
      {children}
    </ToastContext.Provider>
  );
};
