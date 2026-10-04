import React, { createContext, useContext, useState, useCallback, useId } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  durationMs?: number;
}

interface ToastContextType {
  toast: (type: ToastType, title: string, message?: string, durationMs?: number) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: ToastType, title: string, message?: string, durationMs = 4000) => {
      const id = 'toast_' + Math.random().toString(36).substring(2, 9);
      const newToast: ToastItem = { id, type, title, message, durationMs };

      setToasts((prev) => [...prev, newToast]);

      if (durationMs > 0) {
        setTimeout(() => {
          removeToast(id);
        }, durationMs);
      }
    },
    [removeToast]
  );

  const success = useCallback(
    (title: string, message?: string) => addToast('success', title, message),
    [addToast]
  );
  const error = useCallback(
    (title: string, message?: string) => addToast('error', title, message, 6000),
    [addToast]
  );
  const info = useCallback(
    (title: string, message?: string) => addToast('info', title, message),
    [addToast]
  );

  return (
    <ToastContext.Provider value={{ toast: addToast, success, error, info }}>
      {children}

      {/* Accessible Toast Container with aria-live */}
      <div
        role="region"
        aria-label="Notifications"
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none p-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto p-4 rounded-2xl border shadow-xl flex items-start gap-3 transition-all duration-200 animate-in slide-in-from-bottom-2 ${
              t.type === 'success'
                ? 'bg-neutral-900 border-emerald-800/80 text-emerald-100'
                : t.type === 'error'
                ? 'bg-neutral-900 border-rose-800/80 text-rose-100'
                : 'bg-neutral-900 border-cyan-800/80 text-cyan-100'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {t.type === 'success' && (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" aria-hidden="true" />
              )}
              {t.type === 'error' && (
                <AlertCircle className="w-5 h-5 text-rose-400" aria-hidden="true" />
              )}
              {t.type === 'info' && (
                <Info className="w-5 h-5 text-cyan-400" aria-hidden="true" />
              )}
            </div>

            <div className="flex-1">
              <p className="text-sm font-semibold text-neutral-100">{t.title}</p>
              {t.message && (
                <p className="text-xs text-neutral-300 mt-0.5 leading-relaxed">{t.message}</p>
              )}
            </div>

            <button
              type="button"
              onClick={() => removeToast(t.id)}
              aria-label="Dismiss notification"
              className="min-w-[44px] min-h-[44px] -mr-2 -mt-2 flex items-center justify-center text-neutral-400 hover:text-neutral-100 rounded-lg cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
