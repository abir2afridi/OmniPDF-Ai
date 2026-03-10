/**
 * AISummary.tsx — AI Document Summary Module
 *
 * Amber/Orange brand color (distinct from all other modules).
 * Input: PDF · DOCX · TXT file upload or raw text paste
 * Output: 7 summary types · 4 tones · 3 lengths + keywords/topics/actions
 * Download: TXT · PDF
 * History: last 5 results cached in sessionStorage
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    Sparkles, Upload, FileText, AlignLeft, List, Lightbulb,
    Briefcase, ZapOff, Wand2, Loader2, Copy, Check, Download,
    X, ChevronDown, ChevronUp, Tag, Target, ArrowRight,
    RotateCcw, Clock, BookOpen, Info, AlertCircle,
} from 'lucide-react';
import {
    summariseDocument, validateSummaryFile, downloadSummaryAsTxt, downloadSummaryAsPdf,
    cleanText,
    type SummaryOptions, type SummaryResult, type SummaryType, type SummaryTone, type SummaryLength,
} from '../services/summaryService';
import { AppView } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface HistoryEntry {
    id: string;
    filename: string;
    type: SummaryType;
    result: SummaryResult;
    timestamp: number;
}

interface Toast { id: string; type: 'success' | 'error' | 'info' | 'warn'; msg: string; }
const uid = () => Math.random().toString(36).slice(2, 10);

const SUMMARY_TYPES: { id: SummaryType; label: string; icon: any; desc: string }[] = [
    { id: 'tldr', label: 'TL;DR', icon: ZapOff, desc: 'One-sentence essence' },
    { id: 'short', label: 'Short', icon: AlignLeft, desc: '3–5 lines overview' },
    { id: 'bullets', label: 'Bullet Points', icon: List, desc: 'Key points as bullets' },
    { id: 'insights', label: 'Key Insights', icon: Lightbulb, desc: '5–8 critical insights' },
    { id: 'detailed', label: 'Detailed', icon: BookOpen, desc: 'Comprehensive coverage' },
    { id: 'executive', label: 'Executive', icon: Briefcase, desc: 'C-suite ready format' },
    { id: 'custom', label: 'Custom Prompt', icon: Wand2, desc: 'Your own instructions' },
];

const TONES: { id: SummaryTone; label: string; emoji: string }[] = [
    { id: 'professional', label: 'Professional', emoji: '💼' },
    { id: 'simple', label: 'Simple', emoji: '💬' },
    { id: 'academic', label: 'Academic', emoji: '🎓' },
    { id: 'technical', label: 'Technical', emoji: '⚙️' },
];

const LENGTHS: { id: SummaryLength; label: string }[] = [
    { id: 'short', label: 'Short' },
    { id: 'medium', label: 'Medium' },
    { id: 'long', label: 'Long' },
];

// ── Toast component ───────────────────────────────────────────────────────────

const ToastItem = ({ t, onDismiss }: { t: Toast; onDismiss: () => void }) => (
    <motion.div layout initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 60 }}
        className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl max-w-sm text-sm font-medium border pointer-events-auto
      ${t.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/60 border-emerald-200 text-emerald-800 dark:text-emerald-200'
                : t.type === 'error' ? 'bg-red-50 dark:bg-red-900/60 border-red-200 text-red-800 dark:text-red-200'
                    : t.type === 'warn' ? 'bg-amber-50 dark:bg-amber-900/60 border-amber-200 text-amber-800 dark:text-amber-200'
                        : 'bg-blue-50 dark:bg-blue-900/60 border-blue-200 text-blue-800 dark:text-blue-200'}`}>
        <span className="flex-1 leading-snug">{t.msg}</span>
        <button onClick={onDismiss}><X className="w-3 h-3 opacity-50 hover:opacity-100" /></button>
    </motion.div>
);

// ── Main component ────────────────────────────────────────────────────────────

export const AISummary: React.FC = () => {
    // Input
    const [inputMode, setInputMode] = useState<'file' | 'text'>('file');
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [pastedText, setPastedText] = useState('');
    const [isDragOver, setIsDragOver] = useState(false);

    // Options
    const [summaryType, setSummaryType] = useState<SummaryType>('short');
    const [tone, setTone] = useState<SummaryTone>('professional');
    const [length, setLength] = useState<SummaryLength>('medium');
    const [customPrompt, setCustomPrompt] = useState('');
    const [inclKeywords, setInclKeywords] = useState(true);
    const [inclTopics, setInclTopics] = useState(true);
    const [inclActions, setInclActions] = useState(false);
    const [selectedModel, setSelectedModel] = useState<string>('auto');
    const [currentModelInUse, setCurrentModelInUse] = useState<string>('auto');

    // Processing
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressStage, setProgressStage] = useState('');

    // Results
    const [result, setResult] = useState<SummaryResult | null>(null);
    const [copiedMain, setCopiedMain] = useState(false);

    // History
    const [history, setHistory] = useState<HistoryEntry[]>(() => {
        try { return JSON.parse(sessionStorage.getItem('summary_history') ?? '[]'); } catch { return []; }
    });
    const [showHistory, setShowHistory] = useState(false);

    // Toasts
    const [toasts, setToasts] = useState<Toast[]>([]);
    const toast = useCallback((type: Toast['type'], msg: string) => {
        const id = uid();
        setToasts(p => [...p.slice(-3), { id, type, msg }]);
        setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 7000);
    }, []);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Save history to sessionStorage
    useEffect(() => {
        sessionStorage.setItem('summary_history', JSON.stringify(history.slice(0, 5)));
    }, [history]);

    // ── File handling ──────────────────────────────────────────────────────────

    const handleFileSelect = (file: File) => {
        const err = validateSummaryFile(file);
        if (err) { toast('error', err); return; }
        setUploadedFile(file);
        setResult(null);
    };

    const onFileDrop = (e: React.DragEvent) => {
        e.preventDefault(); setIsDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFileSelect(file);
    };

    // ── Generate summary ───────────────────────────────────────────────────────

    const handleGenerate = async () => {
        if (!pastedText && !uploadedFile) {
            toast('error', 'Please upload a file or paste text');
            return;
        }

        setIsProcessing(true);
        setProgress(0);
        setProgressStage('Initializing…');

        try {
            const result = await summariseDocument(
                uploadedFile || pastedText,
                {
                    type: summaryType,
                    tone,
                    length,
                    customPrompt: customPrompt || undefined,
                    includeKeywords: inclKeywords,
                    includeTopics: inclTopics,
                    includeActionItems: inclActions,
                    model: selectedModel,
                    onProgress: (pct, stage) => {
                        setProgress(pct);
                        setProgressStage(stage);
                    },
                    onModelUsed: (model) => {
                        setCurrentModelInUse(model);
                    }
                }
            );

            setResult(result);
            toast('success', 'Summary generated successfully!');
        } catch (error: any) {
            console.error('Summary generation failed:', error);
            toast('error', error.message || 'Failed to generate summary');
        } finally {
            setIsProcessing(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedMain(true);
        setTimeout(() => setCopiedMain(false), 2500);
        toast('info', 'Copied to clipboard!');
    };

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="flex-1 h-full flex flex-col bg-[#f3f1ea] dark:bg-[#1a1a28] overflow-hidden relative">

            {/* Toasts */}
            <div className="fixed top-6 right-6 z-[200] flex flex-col gap-2 pointer-events-none">
                <AnimatePresence>
                    {toasts.map(t => (
                        <div key={t.id} className="pointer-events-auto">
                            <ToastItem t={t} onDismiss={() => setToasts(p => p.filter(x => x.id !== t.id))} />
                        </div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Header */}
            <div className="shrink-0 px-8 py-5 bg-[#f3f1ea] dark:bg-[#21212f] border-b border-gray-100 dark:border-white/5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-2xl shadow-sm">
                            <Sparkles className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black dark:text-white tracking-tight">AI Summary</h1>
                            <p className="text-xs text-gray-400 font-medium">PDF · DOCX · TXT · Text paste → Intelligent summaries via AI</p>
                        </div>
                    </div>
                    <button onClick={() => setShowHistory(v => !v)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors border
              ${showHistory ? 'bg-amber-100 dark:bg-amber-900/30 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300'
                                : 'bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-500 hover:text-gray-700'}`}>
                        <Clock className="w-3.5 h-3.5" />
                        History ({history.length})
                    </button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">

                {/* ── LEFT: Config panel ── */}
                <div className="w-80 shrink-0 flex flex-col border-r border-gray-100 dark:border-white/5 bg-[#f3f1ea] dark:bg-[#21212f] overflow-y-auto">

                    {/* Input mode */}
                    <div className="p-5 border-b border-gray-100 dark:border-white/5">
                        <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-white/10">
                            {(['file', 'text'] as const).map(m => (
                                <button key={m} onClick={() => { setInputMode(m); setResult(null); }}
                                    className={`flex-1 py-2 text-xs font-black uppercase tracking-widest transition-colors
                    ${inputMode === m ? 'bg-amber-500 text-white' : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'}`}>
                                    {m === 'file' ? '📄 File Upload' : '✏️  Paste Text'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* File upload */}
                    {inputMode === 'file' && (
                        <div className="p-5 border-b border-gray-100 dark:border-white/5">
                            <div
                                onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                                onDragLeave={() => setIsDragOver(false)}
                                onDrop={onFileDrop}
                                onClick={() => fileInputRef.current?.click()}
                                className={`flex flex-col items-center gap-3 p-6 border-2 border-dashed rounded-2xl cursor-pointer transition-all
                  ${isDragOver ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 scale-[0.98]'
                                        : uploadedFile ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/10'
                                            : 'border-gray-200 dark:border-white/10 hover:border-amber-300'}`}>
                                <Upload className={`w-7 h-7 ${uploadedFile ? 'text-amber-500' : 'text-gray-300'}`} />
                                {uploadedFile ? (
                                    <div className="text-center">
                                        <p className="text-xs font-black text-amber-700 dark:text-amber-300 truncate max-w-[200px]">{uploadedFile.name}</p>
                                        <p className="text-[10px] text-gray-400 mt-0.5">{(uploadedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                                    </div>
                                ) : (
                                    <div className="text-center">
                                        <p className="text-xs font-bold text-gray-500 dark:text-gray-400">Drop file here or click</p>
                                        <p className="text-[10px] text-gray-400 mt-0.5">PDF · DOCX · TXT · Max 50 MB</p>
                                    </div>
                                )}
                            </div>
                            <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.docx,.doc,.txt"
                                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
                            {uploadedFile && (
                                <button onClick={() => { setUploadedFile(null); setResult(null); }}
                                    className="mt-2 w-full py-1.5 text-[11px] font-bold text-gray-400 hover:text-red-500 transition-colors flex items-center justify-center gap-1">
                                    <X className="w-3 h-3" /> Remove file
                                </button>
                            )}
                        </div>
                    )}

                    {/* Model Selection */}
                    <div className="p-5 border-b border-gray-100 dark:border-white/5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">AI Model</p>
                        <div className="flex gap-2">
                            {[
                                { id: 'auto', label: '🤖 Auto Select', desc: currentModelInUse === 'auto' ? 'Auto (Using GLM-4.5)' : 'Auto (Choosing best model)' },
                                { id: 'z-ai/glm-4.5-air:free', label: 'GLM-4.5 Air', desc: currentModelInUse === 'z-ai/glm-4.5-air:free' ? 'GLM-4.5 (In Use)' : 'Primary - Good performance' },
                                { id: 'stepfun/step-3.5-flash:free', label: 'Step-3.5 Flash', desc: currentModelInUse === 'stepfun/step-3.5-flash:free' ? 'Step-3.5 (In Use)' : 'Secondary - Reasoning support' }
                            ].map(model => (
                                <button key={model.id} onClick={() => setSelectedModel(model.id)}
                                    className={`flex-1 py-2 px-3 text-[10px] font-black border transition-colors rounded-xl
                      ${selectedModel === model.id 
                          ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                          : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'}`}>
                                    <div className="text-left">
                                        <div className="font-bold">{model.label}</div>
                                        <div className="text-[9px] text-gray-400 mt-0.5">{model.desc}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Text paste */}
                    {inputMode === 'text' && (
                        <div className="p-5 border-b border-gray-100 dark:border-white/5">
                            <textarea value={pastedText} onChange={e => setPastedText(e.target.value)}
                                placeholder="Paste document text here…"
                                className="w-full h-36 resize-none text-xs bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-3 outline-none focus:ring-2 focus:ring-amber-400 dark:text-white font-medium"
                            />
                            <p className="text-[10px] text-gray-400 mt-1">{pastedText.length.toLocaleString()} chars</p>
                        </div>
                    )}

                    {/* Summary type */}
                    <div className="p-5 border-b border-gray-100 dark:border-white/5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Summary Type</p>
                        <div className="grid grid-cols-2 gap-1.5">
                            {SUMMARY_TYPES.map(({ id, label, icon: Icon, desc }) => (
                                <button key={id} onClick={() => setSummaryType(id)}
                                    title={desc}
                                    className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-[10px] font-black border transition-all
                    ${summaryType === id
                                            ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                                            : 'text-gray-500 dark:text-gray-400 border-gray-100 dark:border-white/5 hover:border-amber-300 hover:text-amber-600'}`}>
                                    <Icon className="w-3 h-3 shrink-0" />
                                    <span className="truncate">{label}</span>
                                </button>
                            ))}
                        </div>

                        {summaryType === 'custom' && (
                            <motion.textarea initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 72 }}
                                value={customPrompt} onChange={e => setCustomPrompt(e.target.value)}
                                placeholder="Describe exactly what you want…"
                                className="mt-3 w-full resize-none text-xs bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-3 outline-none focus:ring-2 focus:ring-amber-400 dark:text-white" />
                        )}
                    </div>

                    {/* Tone */}
                    <div className="p-5 border-b border-gray-100 dark:border-white/5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Tone</p>
                        <div className="flex gap-1.5 flex-wrap">
                            {TONES.map(({ id, label, emoji }) => (
                                <button key={id} onClick={() => setTone(id)}
                                    className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-black border transition-all
                    ${tone === id
                                            ? 'bg-amber-500 text-white border-amber-500'
                                            : 'text-gray-500 dark:text-gray-400 border-gray-100 dark:border-white/5 hover:border-amber-300'}`}>
                                    {emoji} {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Length */}
                    <div className="p-5 border-b border-gray-100 dark:border-white/5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Length</p>
                        <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-white/10">
                            {LENGTHS.map(({ id, label }) => (
                                <button key={id} onClick={() => setLength(id)}
                                    className={`flex-1 py-1.5 text-[10px] font-black transition-colors
                    ${length === id ? 'bg-amber-500 text-white' : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'}`}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Extras */}
                    <div className="p-5 border-b border-gray-100 dark:border-white/5 space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Extras</p>
                        {[
                            [inclKeywords, setInclKeywords, '🏷️', 'Extract keywords'],
                            [inclTopics, setInclTopics, '🗂️', 'Identify topics'],
                            [inclActions, setInclActions, '✅', 'Action items'],
                        ].map(([val, setter, icon, label]) => (
                            <label key={label as string} className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={val as boolean} onChange={e => (setter as any)(e.target.checked)} className="accent-amber-500 w-3.5 h-3.5" />
                                <span className="text-xs font-bold dark:text-white">{icon as string} {label as string}</span>
                            </label>
                        ))}
                    </div>

                    {/* Generate button */}
                    <div className="p-5">
                        <button onClick={handleGenerate}
                            disabled={isProcessing || (!uploadedFile && !pastedText.trim())}
                            className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-white font-black rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 transition-all text-sm">
                            {isProcessing
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                                : <><Sparkles className="w-4 h-4" /> Generate Summary</>}
                        </button>

                        {isProcessing && (
                            <div className="mt-3 space-y-1.5">
                                <div className="h-1.5 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden">
                                    <motion.div className="h-full bg-amber-500 rounded-full" animate={{ width: `${progress}%` }} transition={{ duration: 0.4 }} />
                                </div>
                                <p className="text-[10px] text-gray-400 text-center truncate">{progressStage}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── RIGHT: Results panel ── */}
                <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                    <AnimatePresence mode="wait">

                        {/* History panel */}
                        {showHistory && (
                            <motion.div key="history" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                className="absolute top-0 right-0 w-96 h-full z-30 bg-white dark:bg-[#21212f] border-l border-gray-100 dark:border-white/5 flex flex-col shadow-2xl">
                                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-white/5">
                                    <p className="text-sm font-black dark:text-white">Summary History</p>
                                    <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                                    {history.length === 0 ? (
                                        <p className="text-xs text-gray-400 text-center py-8">No history yet.</p>
                                    ) : history.map(entry => (
                                        <button key={entry.id} onClick={() => { setResult(entry.result); setShowHistory(false); }}
                                            className="w-full text-left p-3 bg-gray-50 dark:bg-white/5 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-xl border border-gray-100 dark:border-white/5 transition-colors">
                                            <div className="flex items-center justify-between mb-1">
                                                <p className="text-[11px] font-black dark:text-white truncate max-w-[200px]">{entry.filename}</p>
                                                <span className="text-[9px] text-gray-400">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                                            </div>
                                            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold uppercase">{entry.type}</p>
                                            <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2">{entry.result.summary.slice(0, 100)}…</p>
                                        </button>
                                    ))}
                                </div>
                                {history.length > 0 && (
                                    <div className="p-4 border-t border-gray-100 dark:border-white/5">
                                        <button onClick={() => { setHistory([]); sessionStorage.removeItem('summary_history'); }}
                                            className="w-full py-2 text-xs font-bold text-red-400 hover:text-red-600 transition-colors">
                                            Clear History
                                        </button>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {/* Empty state */}
                        {!result && !isProcessing && (
                            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                className="flex-1 flex flex-col items-center justify-center gap-6 px-8">
                                <motion.div animate={{ y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 4 }}
                                    className="p-6 bg-amber-100 dark:bg-amber-900/30 rounded-3xl shadow-xl">
                                    <Sparkles className="w-12 h-12 text-amber-500" />
                                </motion.div>
                                <div className="text-center max-w-md">
                                    <h2 className="text-2xl font-black dark:text-white">AI Document Summary</h2>
                                    <p className="text-sm text-gray-400 mt-2 leading-relaxed">
                                        Upload a PDF, DOCX, or TXT file — or paste raw text — and choose your preferred summary style. The AI will extract, clean, chunk, and intelligently summarize your document.
                                    </p>
                                </div>
                                <div className="grid grid-cols-3 gap-3 w-full max-w-lg">
                                    {[
                                        ['📄 PDF + OCR', 'Text extraction with OCR fallback for scanned PDFs'],
                                        ['🧩 Smart Chunking', 'Large docs split into context-aware windows'],
                                        ['🤖 7 Summary Types', 'TL;DR, Bullets, Executive, Insights and more'],
                                    ].map(([t, d]) => (
                                        <div key={t} className="p-4 bg-white dark:bg-[#21212f] rounded-2xl border border-gray-100 dark:border-white/5 text-center shadow-sm">
                                            <p className="text-xs font-black dark:text-white mb-1">{t}</p>
                                            <p className="text-[10px] text-gray-400 leading-tight">{d}</p>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        {/* Processing state */}
                        {isProcessing && (
                            <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                className="flex-1 flex flex-col items-center justify-center gap-6">
                                <div className="relative">
                                    <svg className="w-24 h-24" viewBox="0 0 100 100">
                                        <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8" className="text-gray-200 dark:text-white/5" />
                                        <motion.circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8"
                                            strokeLinecap="round" strokeDasharray="264"
                                            animate={{ strokeDashoffset: 264 - (264 * progress) / 100 }}
                                            className="text-amber-500" transform="rotate(-90 50 50)" />
                                    </svg>
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <span className="text-xl font-black text-amber-600 dark:text-amber-400">{progress}%</span>
                                    </div>
                                </div>
                                <div className="text-center">
                                    <p className="text-base font-black dark:text-white">Processing document…</p>
                                    <p className="text-sm text-amber-600 dark:text-amber-400 mt-1 animate-pulse">{progressStage}</p>
                                </div>
                            </motion.div>
                        )}

                        {/* Results */}
                        {result && !isProcessing && (
                            <motion.div key="result" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                                className="flex-1 overflow-y-auto p-6 space-y-5">

                                {/* Stats bar */}
                                <div className="flex flex-wrap items-center gap-3 p-4 bg-white dark:bg-[#21212f] rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm">
                                    {[
                                        [`📄 ${result.pageCount} page${result.pageCount !== 1 ? 's' : ''}`, 'Source'],
                                        [`🧩 ${result.chunkCount} chunk${result.chunkCount !== 1 ? 's' : ''}`, 'Processed'],
                                        [`📝 ${result.wordCount} words`, 'Summary'],
                                        [`⚡ ${(result.processingMs / 1000).toFixed(1)}s`, 'Time'],
                                        [`🔍 ${result.extractMethod.toUpperCase()}`, 'Method'],
                                    ].map(([val, lbl]) => (
                                        <div key={lbl} className="flex flex-col">
                                            <span className="text-[10px] font-black dark:text-white">{val}</span>
                                            <span className="text-[9px] text-gray-400 uppercase tracking-widest">{lbl}</span>
                                        </div>
                                    ))}

                                    <div className="ml-auto flex items-center gap-2">
                                        <button onClick={() => copyToClipboard(result.summary)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl text-xs font-bold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-white/10 transition-colors">
                                            {copiedMain ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                            {copiedMain ? 'Copied!' : 'Copy'}
                                        </button>
                                        <button onClick={() => downloadSummaryAsTxt(result)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-white rounded-xl text-xs font-bold transition-colors">
                                            <Download className="w-3.5 h-3.5" /> TXT
                                        </button>
                                        <button onClick={() => downloadSummaryAsPdf(result)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-400 text-white rounded-xl text-xs font-bold transition-colors">
                                            <Download className="w-3.5 h-3.5" /> PDF
                                        </button>
                                        <button onClick={() => setResult(null)}
                                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-colors" title="Clear">
                                            <RotateCcw className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Main summary */}
                                <div className="bg-white dark:bg-[#21212f] rounded-2xl border border-gray-100 dark:border-white/5 overflow-hidden shadow-sm">
                                    <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100 dark:border-white/5 bg-amber-50/50 dark:bg-amber-900/10">
                                        <Sparkles className="w-4 h-4 text-amber-500" />
                                        <p className="text-xs font-black text-amber-700 dark:text-amber-300 uppercase tracking-widest">
                                            {SUMMARY_TYPES.find(t => t.id === summaryType)?.label ?? 'Summary'} · {selectedModel === 'auto' ? 'Auto' : selectedModel.split(':')[0]}
                                        </p>
                                        <span className="ml-auto text-[10px] text-gray-400 capitalize">{tone} · {length}</span>
                                    </div>
                                    <div className="p-6">
                                        {result.summary.includes('\n') || result.summary.includes('•') ? (
                                            <div className="space-y-2">
                                                {result.summary.split('\n').filter(l => l.trim()).map((line, i) => (
                                                    <p key={i} className={`text-sm dark:text-gray-200 leading-relaxed font-medium
                            ${line.startsWith('•') ? 'pl-1' : ''}`}>{line}</p>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-sm dark:text-gray-200 leading-relaxed font-medium whitespace-pre-wrap">{result.summary}</p>
                                        )}
                                    </div>
                                </div>

                                {/* Topics */}
                                {result.topics && result.topics.length > 0 && (
                                    <div className="bg-white dark:bg-[#21212f] rounded-2xl border border-gray-100 dark:border-white/5 p-5 shadow-sm">
                                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                            <Target className="w-3.5 h-3.5 text-amber-500" /> Key Topics
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {result.topics.map(topic => (
                                                <span key={topic} className="px-3 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-bold rounded-full">
                                                    {topic}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Keywords */}
                                {result.keywords && result.keywords.length > 0 && (
                                    <div className="bg-white dark:bg-[#21212f] rounded-2xl border border-gray-100 dark:border-white/5 p-5 shadow-sm">
                                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                            <Tag className="w-3.5 h-3.5 text-blue-500" /> Keywords
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {result.keywords.map(kw => (
                                                <span key={kw} className="px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 text-[11px] font-bold rounded-full border border-blue-100 dark:border-blue-500/20">
                                                    {kw}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Action items */}
                                {result.actionItems && result.actionItems.length > 0 && result.actionItems[0] !== 'No explicit action items found.' && (
                                    <div className="bg-white dark:bg-[#21212f] rounded-2xl border border-gray-100 dark:border-white/5 p-5 shadow-sm">
                                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                            <ArrowRight className="w-3.5 h-3.5 text-emerald-500" /> Action Items
                                        </p>
                                        <ul className="space-y-2">
                                            {result.actionItems.map((action, i) => (
                                                <li key={i} className="flex items-start gap-2 text-sm dark:text-gray-300 font-medium">
                                                    <span className="mt-0.5 w-4 h-4 shrink-0 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-[9px] font-black flex items-center justify-center">{i + 1}</span>
                                                    {action}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Info box */}
                                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-500/20 rounded-2xl">
                                    <p className="text-[10px] text-amber-700 dark:text-amber-300 leading-relaxed">
                                        <strong>AI Note:</strong> This summary is generated by AI and may not capture every nuance. Always review against the original document for critical decisions. The AI is instructed to only use information present in your document and not hallucinate facts.
                                    </p>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};
