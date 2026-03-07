/**
 * TranslatePDF.tsx — AI PDF Translator
 * 
 * Features:
 * - Language selection (Source/Target)
 * - Page range selection
 * - Real-time progress tracking
 * - Side-by-side or preview view
 * - PDF Download & Text Copy
 */

import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    Languages, Upload, FileText, Download, Copy, Check,
    X, ArrowRight, Loader2, Sparkles, AlertCircle,
    Settings, FileDown, Layers, ArrowLeft, RefreshCw,
    ChevronDown, Info
} from 'lucide-react';
import {
    translatePdf, TranslationProgress, TranslationResult,
    LANGUAGES
} from '../services/translateService';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props { onBack?: () => void; }
interface Toast { id: string; type: 'success' | 'error' | 'info'; msg: string; }

const uid = () => Math.random().toString(36).slice(2, 10);

// ── Main Component ────────────────────────────────────────────────────────────

export const TranslatePDF: React.FC<Props> = ({ onBack }) => {
    const [file, setFile] = useState<File | null>(null);
    const [phase, setPhase] = useState<'upload' | 'config' | 'processing' | 'result'>('upload');
    const [sourceLang, setSourceLang] = useState('auto');
    const [targetLang, setTargetLang] = useState('es');
    const [pageRange, setPageRange] = useState('');
    const [progress, setProgress] = useState<TranslationProgress | null>(null);
    const [result, setResult] = useState<TranslationResult | null>(null);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [isDragOver, setIsDragOver] = useState(false);
    const [copied, setCopied] = useState(false);

    const toast = useCallback((type: Toast['type'], msg: string) => {
        setToasts(p => [...p, { id: uid(), type, msg }]);
        setTimeout(() => setToasts(p => p.filter(t => t.msg !== msg)), 4000);
    }, []);

    // ── Handlers ──────────────────────────────────────────────────────────────

    const handleFile = (f: File) => {
        if (f.type !== 'application/pdf') {
            toast('error', 'Only PDF files are supported.');
            return;
        }
        setFile(f);
        setPhase('config');
    };

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault(); setIsDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f) handleFile(f);
    }, []);

    const startTranslation = async () => {
        if (!file) return;
        setPhase('processing');
        setProgress({ pct: 0, stage: 'Initializing…' });

        try {
            const res = await translatePdf(file, targetLang, sourceLang, {
                pageRange,
                onProgress: (p) => setProgress(p)
            });
            setResult(res);
            setPhase('result');
            toast('success', `PDF translated to ${LANGUAGES.find(l => l.code === targetLang)?.name}!`);
        } catch (e: any) {
            toast('error', e.message || 'Translation failed.');
            setPhase('config');
        }
    };

    const downloadPdf = () => {
        if (!result?.pdfBlob) return;
        const url = URL.createObjectURL(result.pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const copyText = () => {
        if (!result?.fullTranslatedText) return;
        navigator.clipboard.writeText(result.fullTranslatedText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast('success', 'Full text copied to clipboard!');
    };

    const reset = () => {
        setFile(null); setPhase('upload'); setProgress(null); setResult(null); setPageRange('');
    };

    // ── Render Helpers ────────────────────────────────────────────────────────

    const renderToast = (t: Toast) => (
        <motion.div key={t.id} initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 50, opacity: 0 }}
            className={`px-4 py-2.5 rounded-lg shadow-lg text-white text-sm flex items-center gap-2 
                ${t.type === 'error' ? 'bg-red-500' : t.type === 'success' ? 'bg-emerald-500' : 'bg-blue-500'}`}>
            {t.type === 'error' ? <AlertCircle size={16} /> : t.type === 'success' ? <Check size={16} /> : <Info size={16} />}
            {t.msg}
        </motion.div>
    );

    // ── Main UI ───────────────────────────────────────────────────────────────

    return (
        <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-950 relative overflow-hidden">
            {/* Toasts */}
            <div className="fixed top-6 right-6 z-50 flex flex-col gap-3">
                <AnimatePresence>{toasts.map(renderToast)}</AnimatePresence>
            </div>

            {/* Header */}
            <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 backdrop-blur-md shrink-0">
                {onBack && (
                    <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <ArrowLeft size={18} className="text-gray-500" />
                    </button>
                )}
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                        <Languages size={18} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-sm font-bold text-gray-900 dark:text-white leading-tight">Translate PDF</h1>
                        {file && <p className="text-[10px] text-gray-500 uppercase tracking-wider">{file.name}</p>}
                    </div>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden">
                {/* ── Sidebar (Config) ────────────────────────────────────── */}
                <aside className={`w-80 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/40 p-6 flex flex-col gap-6 transition-all
                    ${(phase === 'config' || phase === 'result') ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 absolute'}`}>

                    <div>
                        <label className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3 block">Translation Settings</label>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-gray-500 mb-1.5 block">Source Language</label>
                                <div className="relative group">
                                    <select value={sourceLang} onChange={e => setSourceLang(e.target.value)}
                                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm appearance-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all">
                                        {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                                    </select>
                                    <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                </div>
                            </div>

                            <div className="flex justify-center -my-1">
                                <div className="p-1 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                                    <ArrowRight size={14} className="text-gray-400 rotate-90" />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs text-gray-500 mb-1.5 block">Target Language</label>
                                <div className="relative group">
                                    <select value={targetLang} onChange={e => setTargetLang(e.target.value)}
                                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm appearance-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all">
                                        {LANGUAGES.filter(l => l.code !== 'auto').map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                                    </select>
                                    <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs text-gray-500 mb-1.5 block flex items-center justify-between">
                                    <span>Page Range</span>
                                    <span className="text-[10px] text-gray-400 font-normal">Optional</span>
                                </label>
                                <input type="text" placeholder="e.g. 1-5, 8" value={pageRange} onChange={e => setPageRange(e.target.value)}
                                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
                                <p className="text-[10px] text-gray-400 mt-1 px-1">Leave empty for all pages.</p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-auto">
                        {phase === 'config' ? (
                            <button onClick={startTranslation}
                                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl py-3 text-sm font-bold shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 transition-all">
                                <Sparkles size={16} />
                                Start Translation
                            </button>
                        ) : (
                            <button onClick={reset}
                                className="w-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-2 transition-all">
                                <RefreshCw size={16} />
                                New Document
                            </button>
                        )}
                    </div>
                </aside>

                {/* ── Main Canvas ─────────────────────────────────────────── */}
                <main className="flex-1 overflow-y-auto p-4 md:p-8 flex items-center justify-center">
                    <AnimatePresence mode="wait">

                        {/* 1. Upload */}
                        {phase === 'upload' && (
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                                className="w-full max-w-xl text-center">
                                <div className="mb-8">
                                    <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-2xl text-white mb-6">
                                        <Languages size={36} />
                                    </div>
                                    <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white mb-3">AI PDF Translator</h2>
                                    <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">Translate your documents instantly while preserving the story. Powered by Gemini 2.0 Flash.</p>
                                </div>

                                <label onDragOver={e => { e.preventDefault(); setIsDragOver(true); }} onDragLeave={() => setIsDragOver(false)} onDrop={onDrop}
                                    className={`relative block border-2 border-dashed rounded-3xl p-12 cursor-pointer transition-all duration-300 group
                                        ${isDragOver
                                            ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20 scale-[1.02]'
                                            : 'border-gray-200 dark:border-gray-800 hover:border-indigo-400'}`}>
                                    <input type="file" accept=".pdf" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
                                    <Upload size={40} className={`mx-auto mb-4 transition-colors ${isDragOver ? 'text-indigo-500' : 'text-gray-300'}`} />
                                    <div className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wider">Drop your PDF here</div>
                                    <div className="text-xs text-gray-400">or click to browse from device</div>
                                </label>
                            </motion.div>
                        )}

                        {/* 2. Processing */}
                        {phase === 'processing' && progress && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="w-full max-w-md text-center">
                                <div className="relative w-24 h-24 mx-auto mb-6">
                                    <svg className="w-full h-full transform -rotate-90">
                                        <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-gray-200 dark:text-gray-800" />
                                        <motion.circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-indigo-500"
                                            strokeDasharray={251.2} animate={{ strokeDashoffset: 251.2 * (1 - progress.pct / 100) }} transition={{ duration: 0.5 }} />
                                    </svg>
                                    <div className="absolute inset-0 flex items-center justify-center font-bold text-lg dark:text-white">{progress.pct}%</div>
                                </div>
                                <h3 className="text-xl font-bold dark:text-white mb-2">{progress.stage}</h3>
                                {progress.currentPage && progress.totalPages && (
                                    <p className="text-sm text-gray-500">Page {progress.currentPage} of {progress.totalPages}</p>
                                )}
                                <div className="mt-8 flex items-center gap-2 justify-center text-[10px] text-gray-400 uppercase tracking-widest font-semibold">
                                    <Loader2 size={12} className="animate-spin text-indigo-500" />
                                    AI Engine Active
                                </div>
                            </motion.div>
                        )}

                        {/* 3. Result */}
                        {phase === 'result' && result && (
                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
                                className="w-full h-full max-w-5xl flex flex-col gap-6">

                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="text-xl font-bold dark:text-white flex items-center gap-2">
                                            <Check size={20} className="text-emerald-500" />
                                            Translation Ready
                                        </h2>
                                        <p className="text-sm text-gray-500">{result.pages.length} pages translated to {LANGUAGES.find(l => l.code === targetLang)?.name}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button onClick={copyText}
                                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-sm font-semibold hover:bg-gray-50 transition-all">
                                            {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                                            {copied ? 'Copied!' : 'Copy Text'}
                                        </button>
                                        <button onClick={downloadPdf}
                                            className="flex items-center gap-2 px-6 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition-all">
                                            <FileDown size={16} />
                                            Download PDF
                                        </button>
                                    </div>
                                </div>

                                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-hidden min-h-0">
                                    {/* Original Preview */}
                                    <div className="flex flex-col bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
                                        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Original Text</span>
                                            <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-[10px] text-gray-500 font-bold uppercase">Source</span>
                                        </div>
                                        <div className="flex-1 overflow-y-auto p-6 text-sm text-gray-600 dark:text-gray-400 leading-relaxed font-serif whitespace-pre-wrap">
                                            {result.pages.map(p => (
                                                <div key={p.pageNumber}>
                                                    <div className="text-[10px] text-indigo-500 font-bold mb-4 opacity-50">Page {p.pageNumber}</div>
                                                    {p.originalText}
                                                    <div className="h-10" />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Translated Preview */}
                                    <div className="flex flex-col bg-white dark:bg-gray-900 rounded-3xl border border-indigo-100 dark:border-indigo-900/30 overflow-hidden shadow-lg shadow-indigo-500/5">
                                        <div className="px-5 py-3 border-b border-indigo-50 dark:border-indigo-900/30 bg-indigo-50/30 dark:bg-indigo-950/20 flex items-center justify-between">
                                            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Translated Text</span>
                                            <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-[10px] text-white font-bold uppercase">{targetLang}</span>
                                        </div>
                                        <div className="flex-1 overflow-y-auto p-6 text-sm text-gray-800 dark:text-gray-200 leading-relaxed font-serif whitespace-pre-wrap">
                                            {result.pages.map(p => (
                                                <div key={p.pageNumber}>
                                                    <div className="text-[10px] text-indigo-500 font-bold mb-4">Translated Page {p.pageNumber}</div>
                                                    {p.translatedText}
                                                    <div className="h-10" />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* 4. Config State (Only shown if file exists but not processing/result) */}
                        {phase === 'config' && file && (
                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
                                className="w-full max-w-lg">
                                <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 p-8 shadow-xl">
                                    <div className="flex items-center gap-4 mb-8">
                                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-500">
                                            <FileText size={24} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold dark:text-white truncate max-w-[200px]">{file.name}</h3>
                                            <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB • Ready to translate</p>
                                        </div>
                                        <button onClick={reset} className="ml-auto p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors">
                                            <X size={20} />
                                        </button>
                                    </div>

                                    <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 flex gap-3 text-amber-700 dark:text-amber-400 text-xs">
                                        <Settings size={18} className="shrink-0 mt-0.5" />
                                        <p>Adjust translation settings in the sidebar to your preference, then click "Start Translation".</p>
                                    </div>

                                    <div className="mt-8 grid grid-cols-2 gap-4">
                                        <div className="p-4 rounded-2xl border border-gray-100 dark:border-gray-800 text-center">
                                            <div className="text-xs text-gray-400 mb-1">Source</div>
                                            <div className="font-bold dark:text-gray-200">{LANGUAGES.find(l => l.code === sourceLang)?.name}</div>
                                        </div>
                                        <div className="p-4 rounded-2xl border border-gray-100 dark:border-gray-800 text-center">
                                            <div className="text-xs text-gray-400 mb-1">Target</div>
                                            <div className="font-bold text-indigo-500">{LANGUAGES.find(l => l.code === targetLang)?.name}</div>
                                        </div>
                                    </div>

                                    <button onClick={startTranslation}
                                        className="w-full mt-8 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl py-4 font-bold shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2">
                                        <Sparkles size={18} />
                                        Translate Document
                                    </button>
                                </div>
                            </motion.div>
                        )}

                    </AnimatePresence>
                </main>
            </div>
        </div>
    );
};

export default TranslatePDF;
