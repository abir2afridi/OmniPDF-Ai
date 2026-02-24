/**
 * DeletePages — Production-ready delete pages module.
 * Visual per-page thumbnail grid with click-to-select, undo, range input,
 * odd/even shortcuts, animated deletion feedback, and custom output naming.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    Upload, X, FileText, Download, Trash2,
    AlertCircle, CheckCircle2, Loader2, Info,
    ArrowLeft, RotateCcw, Eraser, Settings2,
    ChevronDown, ChevronUp, FileDown, Eye, EyeOff,
    ZapIcon,
} from 'lucide-react';
import {
    getFilePageCount,
    deletePagesAdvanced,
    downloadBytes,
    type DeletePagesResult,
} from '../services/pdfService';

// ── Types ────────────────────────────────────────────────────────────────────

interface Toast {
    id: string;
    type: 'success' | 'error' | 'info';
    message: string;
}

interface PageThumb {
    index: number;
    dataUrl: string;
}

interface UndoSnapshot {
    deletedIndices: number[];
    label: string;
}

interface DeletePagesProps {
    onBack?: () => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_MB = 200;
const THUMB_LIMIT = 60; // max thumbnails to render
const uid = () => Math.random().toString(36).slice(2, 10);

const formatBytes = (b: number) => {
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(2)} MB`;
};

const sanitize = (s: string) =>
    s.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\s+/g, '_').slice(0, 100) || 'document';

// ── ToastItem ────────────────────────────────────────────────────────────────

const ToastItem = ({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) => (
    <motion.div
        layout
        initial={{ opacity: 0, x: 60, scale: 0.9 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 60, scale: 0.9 }}
        className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-xl max-w-xs text-sm font-medium border backdrop-blur-md pointer-events-auto
      ${toast.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/60 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
                : toast.type === 'error' ? 'bg-red-50 dark:bg-red-900/60 border-red-200 dark:border-red-500/30 text-red-800 dark:text-red-200'
                    : 'bg-blue-50 dark:bg-blue-900/60 border-blue-200 dark:border-blue-500/30 text-blue-800 dark:text-blue-200'}`}
    >
        {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
        {toast.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
        {toast.type === 'info' && <Info className="w-4 h-4 shrink-0 mt-0.5" />}
        <span className="flex-1 leading-snug">{toast.message}</span>
        <button onClick={onDismiss} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
            <X className="w-3.5 h-3.5" />
        </button>
    </motion.div>
);

// ── Page Grid ────────────────────────────────────────────────────────────────

const PageGrid = ({
    totalPages,
    thumbMap,
    markedForDeletion,
    loadingThumbs,
    onToggle,
}: {
    totalPages: number;
    thumbMap: Map<number, string>;
    markedForDeletion: Set<number>;
    loadingThumbs: boolean;
    onToggle: (i: number) => void;
}) => (
    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
        {Array.from({ length: totalPages }, (_, i) => {
            const marked = markedForDeletion.has(i);
            const src = thumbMap.get(i);
            return (
                <motion.button
                    key={i}
                    layout
                    whileHover={{ scale: 1.06 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onToggle(i)}
                    className={`relative aspect-[3/4] rounded-xl overflow-hidden border-2 transition-all duration-150 group
                        ${marked
                            ? 'border-red-500 ring-2 ring-red-400/40 shadow-lg shadow-red-500/20'
                            : 'border-gray-200 dark:border-white/10 hover:border-red-300 dark:hover:border-red-500/40'}`}
                >
                    {/* Thumbnail */}
                    {src ? (
                        <img src={src} alt={`Page ${i + 1}`}
                            className={`w-full h-full object-cover transition-all duration-200 ${marked ? 'brightness-50 saturate-0' : ''}`} />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-white/5">
                            {loadingThumbs
                                ? <Loader2 className="w-4 h-4 text-gray-300 animate-spin" />
                                : <FileText className="w-5 h-5 text-gray-300" />}
                        </div>
                    )}

                    {/* Deletion overlay */}
                    <AnimatePresence>
                        {marked && (
                            <motion.div
                                initial={{ opacity: 0, scale: 1.2 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 1.2 }}
                                className="absolute inset-0 flex items-center justify-center"
                            >
                                <div className="bg-red-500 rounded-full p-1.5 shadow-lg">
                                    <Trash2 className="w-4 h-4 text-white" />
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Page number */}
                    <div className={`absolute bottom-0 left-0 right-0 text-[9px] font-black text-center py-0.5
                        ${marked ? 'bg-red-600 text-white' : 'bg-black/40 text-white'}`}>
                        {i + 1}
                    </div>
                </motion.button>
            );
        })}
    </div>
);

// ── Main Component ────────────────────────────────────────────────────────────

export const DeletePages: React.FC<DeletePagesProps> = ({ onBack }) => {
    // ── File state
    const [file, setFile] = useState<File | null>(null);
    const [totalPages, setTotalPages] = useState(0);
    const [thumbs, setThumbs] = useState<PageThumb[]>([]);
    const [loadingFile, setLoadingFile] = useState(false);
    const [loadingThumbs, setLoadingThumbs] = useState(false);

    // ── UI state
    const [isDragOver, setIsDragOver] = useState(false);
    const [showGrid, setShowGrid] = useState(true);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [toasts, setToasts] = useState<Toast[]>([]);

    // ── Selection state
    const [markedForDeletion, setMarkedForDeletion] = useState<Set<number>>(new Set());
    const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);
    const [rangeInput, setRangeInput] = useState('');

    // ── Output options
    const [outputPrefix, setOutputPrefix] = useState('');

    // ── Processing
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressLabel, setProgressLabel] = useState('');
    const [lastResult, setLastResult] = useState<DeletePagesResult | null>(null);
    const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);

    const dropZoneRef = useRef<HTMLDivElement>(null);
    const uploadInputRef = useRef<HTMLInputElement>(null);
    const circumference = 2 * Math.PI * 40;

    // ── Toast helpers ────────────────────────────────────────────────────────

    const toast = useCallback((type: Toast['type'], message: string) => {
        const id = uid();
        setToasts(prev => [...prev.slice(-4), { id, type, message }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
    }, []);

    const dismissToast = useCallback((id: string) =>
        setToasts(prev => prev.filter(t => t.id !== id)), []);

    // ── Thumbnail generator ──────────────────────────────────────────────────

    const generatePageThumb = useCallback(async (f: File, pageIndex: number): Promise<string> => {
        try {
            const { GlobalWorkerOptions, getDocument } = await import('pdfjs-dist');
            if (GlobalWorkerOptions) {
                GlobalWorkerOptions.workerSrc =
                    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            }
            const bytes = await f.arrayBuffer();
            const pdf = await getDocument({ data: new Uint8Array(bytes) }).promise;
            const page = await pdf.getPage(pageIndex + 1);
            const naturalVP = page.getViewport({ scale: 1 });
            const scale = 120 / naturalVP.width;
            const vp = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(vp.width);
            canvas.height = Math.round(vp.height);
            await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
            return canvas.toDataURL('image/jpeg', 0.68);
        } catch {
            return '';
        }
    }, []);

    // ── File loading ─────────────────────────────────────────────────────────

    const loadFile = useCallback(async (f: File) => {
        if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
            toast('error', `"${f.name}" is not a valid PDF.`);
            return;
        }
        if (f.size > MAX_FILE_MB * 1024 * 1024) {
            toast('error', `File exceeds the ${MAX_FILE_MB} MB limit.`);
            return;
        }

        setFile(f);
        setThumbs([]);
        setMarkedForDeletion(new Set());
        setUndoStack([]);
        setTotalPages(0);
        setLastResult(null);
        setResultBytes(null);
        setRangeInput('');
        setLoadingFile(true);

        const count = await getFilePageCount(f);
        setTotalPages(count);
        setOutputPrefix(f.name.replace(/\.pdf$/i, ''));
        setLoadingFile(false);

        if (count === 0) {
            toast('error', 'Could not read page count — file may be corrupted.');
            return;
        }

        toast('info', `Loaded ${count} pages. Generating previews…`);
        setLoadingThumbs(true);
        const limit = Math.min(count, THUMB_LIMIT);
        for (let i = 0; i < limit; i++) {
            const dataUrl = await generatePageThumb(f, i);
            if (dataUrl) setThumbs(prev => [...prev, { index: i, dataUrl }]);
        }
        setLoadingThumbs(false);
    }, [toast, generatePageThumb]);

    // ── Drag & Drop ──────────────────────────────────────────────────────────

    const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); }, []);
    const onDragLeave = useCallback((e: React.DragEvent) => {
        if (!dropZoneRef.current?.contains(e.relatedTarget as Node)) setIsDragOver(false);
    }, []);
    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault(); setIsDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f) loadFile(f);
    }, [loadFile]);

    // ── Page selection ───────────────────────────────────────────────────────

    const pushUndo = useCallback((label: string) => {
        setUndoStack(prev => [...prev.slice(-9), { deletedIndices: [...markedForDeletion], label }]);
    }, [markedForDeletion]);

    const togglePage = useCallback((i: number) => {
        setMarkedForDeletion(prev => {
            const next = new Set(prev);
            if (next.has(i)) next.delete(i); else next.add(i);
            return next;
        });
        // Clear processed result when selection changes
        setLastResult(null);
        setResultBytes(null);
    }, []);

    const applyRangeInput = useCallback(() => {
        if (!rangeInput.trim() || totalPages === 0) return;
        const text = rangeInput.trim();

        // Parse comma+range format
        const indices: Set<number> = new Set();
        for (const part of text.split(',')) {
            const trimmed = part.trim();
            if (!trimmed) continue;
            if (trimmed.includes('-')) {
                const [a, b] = trimmed.split('-').map(s => parseInt(s.trim(), 10));
                if (!isNaN(a) && !isNaN(b)) {
                    for (let n = Math.max(1, a); n <= Math.min(totalPages, b); n++) indices.add(n - 1);
                }
            } else {
                const n = parseInt(trimmed, 10);
                if (!isNaN(n) && n >= 1 && n <= totalPages) indices.add(n - 1);
            }
        }

        if (indices.size === 0) { toast('error', 'No valid pages found in range.'); return; }
        if (indices.size >= totalPages) { toast('error', 'Cannot delete all pages.'); return; }

        pushUndo('range input');
        setMarkedForDeletion(indices);
        setLastResult(null);
        setResultBytes(null);
        toast('info', `${indices.size} page(s) marked for deletion.`);
    }, [rangeInput, totalPages, pushUndo, toast]);

    const markOdd = useCallback(() => {
        if (!totalPages) return;
        pushUndo('odd pages');
        setMarkedForDeletion(new Set(Array.from({ length: totalPages }, (_, i) => i).filter(i => i % 2 === 0)));
        setLastResult(null); setResultBytes(null);
        toast('info', 'Odd pages marked for deletion.');
    }, [totalPages, pushUndo, toast]);

    const markEven = useCallback(() => {
        if (!totalPages) return;
        pushUndo('even pages');
        setMarkedForDeletion(new Set(Array.from({ length: totalPages }, (_, i) => i).filter(i => i % 2 !== 0)));
        setLastResult(null); setResultBytes(null);
        toast('info', 'Even pages marked for deletion.');
    }, [totalPages, pushUndo, toast]);

    const selectAll = useCallback(() => {
        if (!totalPages) return;
        setMarkedForDeletion(new Set(Array.from({ length: totalPages }, (_, i) => i)));
    }, [totalPages]);

    const clearAll = useCallback(() => {
        pushUndo('clear all');
        setMarkedForDeletion(new Set());
        setLastResult(null); setResultBytes(null);
    }, [pushUndo]);

    const undo = useCallback(() => {
        setUndoStack(prev => {
            if (prev.length === 0) return prev;
            const last = prev[prev.length - 1];
            setMarkedForDeletion(new Set(last.deletedIndices));
            setLastResult(null); setResultBytes(null);
            toast('info', `Undo: restored "${last.label}" selection.`);
            return prev.slice(0, -1);
        });
    }, [toast]);

    // Sync rangeInput → markedForDeletion highlight automatically when range text changes
    // (Live preview of range, but only apply on button click)

    // ── Delete handler ───────────────────────────────────────────────────────

    const handleDelete = useCallback(async () => {
        if (!file || isProcessing) return;
        if (markedForDeletion.size === 0) {
            toast('error', 'Select at least one page to delete.');
            return;
        }
        if (markedForDeletion.size >= totalPages) {
            toast('error', 'Cannot delete all pages from the PDF.');
            return;
        }

        setIsProcessing(true);
        setProgress(0);
        setProgressLabel('Preparing…');

        try {
            const result = await deletePagesAdvanced(file, {
                deleteIndices: [...markedForDeletion],
                outputPrefix: sanitize(outputPrefix || file.name.replace(/\.pdf$/i, '')),
                onProgress: (p) => {
                    setProgress(p);
                    if (p < 10) setProgressLabel('Loading PDF…');
                    else if (p < 80) setProgressLabel(`Rebuilding ${totalPages - markedForDeletion.size} pages…`);
                    else setProgressLabel('Saving output…');
                },
            });

            setLastResult(result);
            setResultBytes(result.bytes);
            setProgress(100);
            setProgressLabel('Done!');
            toast('success', `Deleted ${result.deletedIndices.length} page(s). ${result.keptPageCount} pages remain.`);

            setTimeout(() => {
                setIsProcessing(false);
                setProgress(0);
                setProgressLabel('');
            }, 1400);
        } catch (err: any) {
            toast('error', err?.message || 'Deletion failed. Please try again.');
            setIsProcessing(false);
            setProgress(0);
            setProgressLabel('');
        }
    }, [file, isProcessing, markedForDeletion, totalPages, outputPrefix, toast]);

    const handleDownload = useCallback(() => {
        if (!resultBytes || !lastResult) return;
        downloadBytes(resultBytes, lastResult.outputName);
        toast('success', `Downloaded: ${lastResult.outputName}`);
    }, [resultBytes, lastResult, toast]);

    // Derived thumb map
    const thumbMap = new Map<number, string>(thumbs.map(t => [t.index, t.dataUrl]));

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="flex-1 flex flex-col h-full bg-[#f3f1ea] dark:bg-[#1e1e2e] overflow-hidden relative">

            {/* ── Toast Portal ── */}
            <div className="fixed top-6 right-6 z-[200] flex flex-col gap-2 items-end pointer-events-none">
                <AnimatePresence>
                    {toasts.map(t => (
                        <div key={t.id}>
                            <ToastItem toast={t} onDismiss={() => dismissToast(t.id)} />
                        </div>
                    ))}
                </AnimatePresence>
            </div>

            {/* ── Progress Overlay ── */}
            <AnimatePresence>
                {isProcessing && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                        <motion.div
                            initial={{ scale: 0.85, y: 20, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.85, y: 20, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                            className="bg-white dark:bg-[#1e1e2e] rounded-3xl shadow-2xl p-10 max-w-sm w-full text-center border border-gray-100 dark:border-white/10"
                        >
                            <div className="relative w-28 h-28 mx-auto mb-6">
                                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                                    <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor"
                                        strokeWidth="8" className="text-gray-100 dark:text-white/10" />
                                    <motion.circle cx="50" cy="50" r="40" fill="none"
                                        stroke="url(#delGrad)" strokeWidth="8" strokeLinecap="round"
                                        strokeDasharray={circumference}
                                        animate={{ strokeDashoffset: circumference - (circumference * progress) / 100 }}
                                        transition={{ duration: 0.4, ease: 'easeOut' }}
                                    />
                                    <defs>
                                        <linearGradient id="delGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                            <stop offset="0%" stopColor="#ef4444" />
                                            <stop offset="100%" stopColor="#f97316" />
                                        </linearGradient>
                                    </defs>
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    {progress === 100
                                        ? <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                                        : <span className="text-lg font-black dark:text-white">{progress}%</span>
                                    }
                                </div>
                            </div>
                            <h3 className="text-xl font-bold dark:text-white mb-1">
                                {progress === 100 ? '✅ Pages Deleted!' : 'Deleting Pages…'}
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{progressLabel || 'Please wait…'}</p>
                            <div className="mt-4 w-full h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                                <motion.div
                                    className="h-full bg-gradient-to-r from-red-500 to-orange-500 rounded-full"
                                    animate={{ width: `${progress}%` }}
                                    transition={{ duration: 0.35, ease: 'easeOut' }}
                                />
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Header ── */}
            <div className="shrink-0 flex items-center justify-between px-6 py-4 bg-[#f3f1ea] dark:bg-[#262636] border-b border-gray-100 dark:border-white/5 shadow-sm">
                <div className="flex items-center gap-3">
                    {onBack && (
                        <button onClick={onBack}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-colors text-gray-500 dark:text-gray-400">
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}
                    <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-xl">
                        <Eraser className="w-5 h-5 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                        <h1 className="text-lg font-black dark:text-white tracking-tight">Delete Pages</h1>
                        <p className="text-[11px] text-gray-400 font-medium">
                            {file
                                ? `${file.name} · ${totalPages} pages · ${formatBytes(file.size)}`
                                : 'Remove unwanted pages from your PDF'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {file && (
                        <>
                            {undoStack.length > 0 && (
                                <button onClick={undo}
                                    title={`Undo: ${undoStack[undoStack.length - 1]?.label}`}
                                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-colors">
                                    <RotateCcw className="w-3.5 h-3.5" /> Undo
                                </button>
                            )}
                            <button onClick={() => setShowGrid(v => !v)} title={showGrid ? 'Hide page grid' : 'Show page grid'}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-colors text-gray-400">
                                {showGrid ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                            <button
                                onClick={() => { setFile(null); setThumbs([]); setTotalPages(0); setMarkedForDeletion(new Set()); setUndoStack([]); setLastResult(null); setResultBytes(null); }}
                                className="px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors flex items-center gap-1.5">
                                <Trash2 className="w-3.5 h-3.5" /> Remove
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 flex overflow-hidden">

                {/* ── LEFT: Upload + Page Grid ── */}
                <div className="flex-1 flex flex-col overflow-hidden p-4 lg:p-6 gap-4 min-w-0">

                    {/* Drop Zone */}
                    {!file ? (
                        <div ref={dropZoneRef} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                            onClick={() => uploadInputRef.current?.click()}
                            className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-2xl transition-all duration-200 cursor-pointer
                              ${isDragOver ? 'border-red-500 bg-red-500/5 scale-[0.99]'
                                    : 'border-gray-200 dark:border-white/10 bg-white dark:bg-[#262636]'}
                              hover:border-red-400 dark:hover:border-red-500/50 hover:bg-red-50/30 dark:hover:bg-red-900/10`}
                        >
                            <input ref={uploadInputRef} type="file" accept=".pdf,application/pdf" className="hidden"
                                onChange={e => e.target.files?.[0] && loadFile(e.target.files[0])} />
                            <motion.div animate={{ y: [0, -7, 0] }} transition={{ repeat: Infinity, duration: 2.6, ease: 'easeInOut' }}
                                className="p-5 bg-red-100 dark:bg-red-900/30 rounded-2xl mb-5 shadow-lg shadow-red-200 dark:shadow-red-900/30">
                                <Upload className="w-10 h-10 text-red-600 dark:text-red-400" />
                            </motion.div>
                            <h2 className="text-lg font-black dark:text-white mb-1">Drop a PDF here</h2>
                            <p className="text-sm text-gray-400 mb-3">
                                or <span className="text-red-500 font-bold underline underline-offset-2">click to browse</span>
                            </p>
                            <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-gray-300 dark:text-gray-600">
                                <span>PDF only</span><span>·</span><span>Max {MAX_FILE_MB} MB</span>
                            </div>
                        </div>
                    ) : (
                        <>
                            {loadingFile && (
                                <div className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-500/20">
                                    <Loader2 className="w-4 h-4 text-red-500 animate-spin" />
                                    <span className="text-sm text-red-700 dark:text-red-300 font-medium">Reading PDF…</span>
                                </div>
                            )}

                            {/* Summary bar */}
                            {totalPages > 0 && markedForDeletion.size > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, y: -8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-500/20 rounded-xl text-sm"
                                >
                                    <Trash2 className="w-4 h-4 text-red-500 shrink-0" />
                                    <span className="text-red-700 dark:text-red-300 font-bold">
                                        {markedForDeletion.size} page{markedForDeletion.size !== 1 ? 's' : ''} marked for deletion
                                    </span>
                                    <span className="text-red-400 dark:text-red-500 text-xs">
                                        ({totalPages - markedForDeletion.size} will remain)
                                    </span>
                                    <button onClick={clearAll} className="ml-auto text-xs text-red-500 hover:text-red-700 dark:hover:text-red-300 font-bold transition-colors">
                                        Clear all
                                    </button>
                                </motion.div>
                            )}

                            {/* Result summary after deletion */}
                            {lastResult && !isProcessing && (
                                <motion.div
                                    initial={{ opacity: 0, y: -8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex items-center gap-3 px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-500/20 rounded-xl"
                                >
                                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">
                                            Deletion complete — {lastResult.keptPageCount} pages remaining
                                        </p>
                                        <p className="text-xs text-emerald-600 dark:text-emerald-400">
                                            {lastResult.outputName} · {formatBytes(lastResult.bytes.byteLength)}
                                        </p>
                                    </div>
                                    <button onClick={handleDownload}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors">
                                        <Download className="w-3.5 h-3.5" /> Download
                                    </button>
                                </motion.div>
                            )}

                            {/* Page Grid */}
                            {showGrid && totalPages > 0 && (
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                    className="flex-1 flex flex-col min-h-0 bg-white dark:bg-[#262636] rounded-2xl border border-gray-100 dark:border-white/5 overflow-hidden">
                                    {/* Grid toolbar */}
                                    <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/5 flex-wrap gap-2">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                                            Pages · {markedForDeletion.size > 0
                                                ? <span className="text-red-500">{markedForDeletion.size} marked · </span>
                                                : null}{totalPages} total
                                        </span>
                                        <div className="flex items-center gap-1">
                                            {[
                                                { label: 'Odd', fn: markOdd, title: 'Mark odd pages (1,3,5…)' },
                                                { label: 'Even', fn: markEven, title: 'Mark even pages (2,4,6…)' },
                                                { label: 'Clear', fn: clearAll, title: 'Clear all selections' },
                                            ].map(({ label, fn, title }) => (
                                                <button key={label} onClick={fn} title={title}
                                                    className="px-2 py-1 text-[10px] font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                                                    {label}
                                                </button>
                                            ))}
                                            {loadingThumbs && (
                                                <span className="flex items-center gap-1 text-[10px] text-gray-400 ml-2">
                                                    <Loader2 className="w-3 h-3 animate-spin" /> Loading…
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {/* Grid */}
                                    <div className="flex-1 overflow-y-auto p-4">
                                        <PageGrid
                                            totalPages={totalPages}
                                            thumbMap={thumbMap}
                                            markedForDeletion={markedForDeletion}
                                            loadingThumbs={loadingThumbs}
                                            onToggle={(i) => { pushUndo(`toggle page ${i + 1}`); togglePage(i); }}
                                        />
                                        {totalPages > THUMB_LIMIT && (
                                            <p className="text-center text-[10px] text-gray-400 mt-3">
                                                Thumbnails shown for first {THUMB_LIMIT} pages. All {totalPages} pages are selectable via Range Input.
                                            </p>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </>
                    )}
                </div>

                {/* ── RIGHT: Options + Action ── */}
                <div className="w-80 shrink-0 flex flex-col border-l border-gray-100 dark:border-white/5 bg-[#f3f1ea] dark:bg-[#262636] overflow-y-auto">

                    {/* File summary */}
                    {file && totalPages > 0 && (
                        <div className="p-5 border-b border-gray-100 dark:border-white/5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">File Summary</p>
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { label: 'Pages', value: totalPages, color: 'text-gray-700 dark:text-gray-200' },
                                    { label: 'Removing', value: markedForDeletion.size, color: 'text-red-600 dark:text-red-400' },
                                    { label: 'Remaining', value: totalPages - markedForDeletion.size, color: 'text-emerald-600 dark:text-emerald-400' },
                                ].map(stat => (
                                    <div key={stat.label} className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 text-center">
                                        <p className={`text-base font-black ${stat.color}`}>{stat.value}</p>
                                        <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mt-0.5">{stat.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Quick selectors */}
                    {file && totalPages > 0 && (
                        <div className="p-5 border-b border-gray-100 dark:border-white/5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Quick Select</p>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    {
                                        label: 'Odd Pages',
                                        sub: '1, 3, 5…',
                                        icon: <ZapIcon className="w-3.5 h-3.5" />,
                                        fn: markOdd,
                                    },
                                    {
                                        label: 'Even Pages',
                                        sub: '2, 4, 6…',
                                        icon: <ZapIcon className="w-3.5 h-3.5 rotate-180" />,
                                        fn: markEven,
                                    },
                                ].map(item => (
                                    <button key={item.label} onClick={item.fn}
                                        className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-gray-100 dark:border-white/10 hover:border-red-200 dark:hover:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-900/10 transition-all group">
                                        <span className="text-gray-400 group-hover:text-red-500 dark:group-hover:text-red-400 transition-colors">
                                            {item.icon}
                                        </span>
                                        <p className="text-xs font-bold dark:text-gray-200 group-hover:text-red-700 dark:group-hover:text-red-300 transition-colors">
                                            {item.label}
                                        </p>
                                        <p className="text-[9px] text-gray-400">{item.sub}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Range input */}
                    {file && totalPages > 0 && (
                        <div className="p-5 border-b border-gray-100 dark:border-white/5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Range Input</p>
                            <div className="space-y-2">
                                <input
                                    type="text"
                                    value={rangeInput}
                                    onChange={e => setRangeInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && applyRangeInput()}
                                    placeholder="e.g. 2,4,6-10"
                                    className="w-full font-mono text-xs px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-red-400 focus:border-red-400 outline-none dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600"
                                />
                                <button onClick={applyRangeInput}
                                    className="w-full py-2 text-xs font-bold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/30 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                                    Apply Range
                                </button>
                            </div>
                            <div className="mt-3 p-3 bg-gray-50 dark:bg-white/5 rounded-xl">
                                <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1">
                                    <Info className="w-3 h-3" /> Format
                                </p>
                                <div className="space-y-0.5 text-[10px] text-gray-400 font-mono">
                                    <p><span className="font-bold text-gray-500">2,4,6</span> — specific pages</p>
                                    <p><span className="font-bold text-gray-500">3-8</span> — page range</p>
                                    <p><span className="font-bold text-gray-500">1,5-8,12</span> — mixed</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Undo stack */}
                    {undoStack.length > 0 && (
                        <div className="p-5 border-b border-gray-100 dark:border-white/5">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">History</p>
                                <button onClick={undo}
                                    className="flex items-center gap-1 text-[10px] font-bold text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">
                                    <RotateCcw className="w-2.5 h-2.5" /> Undo
                                </button>
                            </div>
                            <div className="space-y-1 max-h-28 overflow-y-auto">
                                {undoStack.slice().reverse().slice(0, 5).map((s, i) => (
                                    <div key={i} className="flex items-center gap-2 text-[10px] text-gray-400 px-2 py-1 rounded-lg bg-gray-50 dark:bg-white/5">
                                        <RotateCcw className="w-2.5 h-2.5 shrink-0" />
                                        <span className="truncate">{s.label}</span>
                                        <span className="ml-auto font-mono shrink-0">{s.deletedIndices.length}pg</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Advanced options */}
                    <div className="border-b border-gray-100 dark:border-white/5">
                        <button onClick={() => setAdvancedOpen(v => !v)}
                            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                            <span className="flex items-center gap-2 text-xs font-bold text-gray-600 dark:text-gray-300">
                                <Settings2 className="w-3.5 h-3.5" /> Advanced Options
                            </span>
                            {advancedOpen ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                        </button>
                        <AnimatePresence>
                            {advancedOpen && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                    <div className="px-5 pb-5 space-y-4">
                                        {/* Output prefix */}
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">
                                                Output Filename
                                            </label>
                                            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl focus-within:ring-2 focus-within:ring-red-400 transition-all">
                                                <FileDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                                <input type="text" value={outputPrefix}
                                                    onChange={e => setOutputPrefix(e.target.value)}
                                                    placeholder="document"
                                                    className="flex-1 bg-transparent text-sm font-bold dark:text-gray-200 outline-none placeholder-gray-300 dark:placeholder-gray-600" />
                                            </div>
                                            <p className="text-[10px] text-gray-400 mt-1">
                                                → <span className="font-mono">{sanitize(outputPrefix || 'document')}_deleted.pdf</span>
                                            </p>
                                        </div>

                                        {/* Privacy note */}
                                        <div className="flex items-start gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-500/20 rounded-xl">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                                            <p className="text-[10px] text-emerald-700 dark:text-emerald-300 leading-relaxed">
                                                All processing happens <strong>in your browser</strong>. Files are never uploaded to any server.
                                            </p>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className="flex-1" />

                    {/* ── Action Buttons ── */}
                    <div className="p-5 border-t border-gray-100 dark:border-white/5 bg-white/80 dark:bg-[#262636]/80 backdrop-blur-sm space-y-3">
                        {/* Delete button */}
                        <button
                            onClick={handleDelete}
                            disabled={!file || isProcessing || markedForDeletion.size === 0 || loadingFile}
                            className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-sm transition-all duration-200 shadow-lg
                              ${!file || markedForDeletion.size === 0 || loadingFile
                                    ? 'bg-gray-200 dark:bg-white/5 text-gray-400 cursor-not-allowed shadow-none'
                                    : 'bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white shadow-red-500/30 hover:-translate-y-0.5 active:translate-y-0'}`}
                        >
                            {isProcessing ? (
                                <><Loader2 className="w-5 h-5 animate-spin" /> Deleting…</>
                            ) : (
                                <><Trash2 className="w-5 h-5" />
                                    {markedForDeletion.size > 0
                                        ? `Delete ${markedForDeletion.size} Page${markedForDeletion.size !== 1 ? 's' : ''}`
                                        : 'Select Pages to Delete'}</>
                            )}
                        </button>

                        {/* Download button — shows after successful deletion */}
                        <AnimatePresence>
                            {lastResult && !isProcessing && resultBytes && (
                                <motion.button
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 8 }}
                                    onClick={handleDownload}
                                    className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl font-black text-sm bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-lg shadow-emerald-500/30 hover:-translate-y-0.5 active:translate-y-0 transition-all"
                                >
                                    <Download className="w-5 h-5" /> Download Result
                                </motion.button>
                            )}
                        </AnimatePresence>

                        {!file && (
                            <p className="text-center text-[10px] text-gray-400">Upload a PDF to begin</p>
                        )}
                        {file && markedForDeletion.size === 0 && !loadingFile && (
                            <p className="text-center text-[10px] text-gray-500 dark:text-gray-400">
                                Click pages in the grid or use range input
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
