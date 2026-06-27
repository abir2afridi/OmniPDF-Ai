import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ToastItem {
    id: string;
    type: 'success' | 'error' | 'info' | 'warn';
    message: string;
}

interface ToastContextValue {
    toast: (type: ToastItem['type'], message: string) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });
export const useToast = () => useContext(ToastContext);

// ── Helpers ───────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 10);

const ICON_MAP = {
    success: CheckCircle2,
    error: AlertCircle,
    info: Info,
    warn: AlertTriangle,
};

const STYLE_MAP = {
    success: {
        accent: 'bg-emerald-500',
        bg: 'bg-emerald-50 dark:bg-emerald-950/70',
        border: 'border-emerald-200 dark:border-emerald-800/50',
        text: 'text-emerald-900 dark:text-emerald-100',
        icon: 'text-emerald-500',
        progress: 'bg-emerald-400 dark:bg-emerald-600',
    },
    error: {
        accent: 'bg-red-500',
        bg: 'bg-red-50 dark:bg-red-950/70',
        border: 'border-red-200 dark:border-red-800/50',
        text: 'text-red-900 dark:text-red-100',
        icon: 'text-red-500',
        progress: 'bg-red-400 dark:bg-red-600',
    },
    info: {
        accent: 'bg-indigo-500',
        bg: 'bg-indigo-50 dark:bg-indigo-950/70',
        border: 'border-indigo-200 dark:border-indigo-800/50',
        text: 'text-indigo-900 dark:text-indigo-100',
        icon: 'text-indigo-500',
        progress: 'bg-indigo-400 dark:bg-indigo-600',
    },
    warn: {
        accent: 'bg-amber-500',
        bg: 'bg-amber-50 dark:bg-amber-950/70',
        border: 'border-amber-200 dark:border-amber-800/50',
        text: 'text-amber-900 dark:text-amber-100',
        icon: 'text-amber-500',
        progress: 'bg-amber-400 dark:bg-amber-600',
    },
};

// ── Toast Item Component ──────────────────────────────────────────────────────

const ToastCard = ({ t, onDismiss, duration }: { t: ToastItem; onDismiss: () => void; duration: number }) => {
    const s = STYLE_MAP[t.type];
    const Icon = ICON_MAP[t.type];
    const startTime = useRef(Date.now());
    const [progress, setProgress] = useState(100);
    const frameRef = useRef<number>(0);

    useEffect(() => {
        const animate = () => {
            const elapsed = Date.now() - startTime.current;
            const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
            setProgress(remaining);
            if (remaining > 0) frameRef.current = requestAnimationFrame(animate);
        };
        frameRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(frameRef.current);
    }, [duration]);

    return (
        <motion.div layout
            initial={{ opacity: 0, x: 80, scale: 0.92 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 80, scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className={`relative flex items-start gap-3 pl-0 pr-4 py-3 rounded-[5px] shadow-xl max-w-sm text-sm font-medium border backdrop-blur-xl pointer-events-auto overflow-hidden ${s.bg} ${s.border} ${s.text}`}>
            {/* Accent bar */}
            <div className={`w-1 h-full shrink-0 rounded-l-[5px] ${s.accent}`} />

            {/* Progress bar at bottom */}
            <div className={`absolute bottom-0 left-0 h-0.5 ${s.progress} transition-none`} style={{ width: `${progress}%` }} />

            <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${s.icon}`} />
            <span className="flex-1 leading-snug">{t.message}</span>
            <button onClick={onDismiss} className="shrink-0 p-0.5 rounded-[5px] hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                <X className="w-3.5 h-3.5 opacity-60 hover:opacity-100" />
            </button>
        </motion.div>
    );
};

// ── Provider ──────────────────────────────────────────────────────────────────

const DEFAULT_DURATION = 5000;

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const durationRef = useRef(DEFAULT_DURATION);

    const toastFn = useCallback((type: ToastItem['type'], message: string) => {
        const id = uid();
        setToasts(prev => [...prev.slice(-4), { id, type, message }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, durationRef.current);
    }, []);

    const dismiss = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ toast: toastFn }}>
            {children}
            <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none max-w-sm w-full">
                <AnimatePresence>
                    {toasts.map(t => (
                        <ToastCard key={t.id} t={t} onDismiss={() => dismiss(t.id)} duration={durationRef.current} />
                    ))}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
};
