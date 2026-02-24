/**
 * SplitPDF — Production-ready Split PDF module
 * Self-contained: manages its own file, page selection, split modes & download pipeline.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    Upload, X, FileText, Download, Scissors,
    AlertCircle, CheckCircle2, Loader2, Info,
    ArrowLeft, Trash2, ChevronDown, ChevronUp,
    Settings2, Grid3x3, Layers, ArchiveIcon,
    FileDown, ZapIcon, BookOpen, Eye, EyeOff,
} from 'lucide-react';
import {
    getFilePageCount,
    generatePDFThumbnail,
    splitPDFAdvanced,
    type SplitMode,
} from '../services/pdfService';

// ── Types ───────────────────────────────────────────────────────────────────────

interface Toast {
    id: string;
    type: 'success' | 'error' | 'info';
    message: string;
}

interface PageThumb {
    index: number;   // 0-based
    dataUrl: string; // JPEG thumbnail
}

interface SplitPDFProps {
    onBack?: () => void;
}

// ── Constants ───────────────────────────────────────────────────────────────────

const MAX_FILE_MB = 200;
const uid = () => Math.random().toString(36).slice(2, 10);
const sanitize = (s: string) =>
    s.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\s+/g, '_').slice(0, 80) || 'split';

const formatBytes = (b: number) => {
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(2)} MB`;
};

const MODE_META: Record<SplitMode, { label: string; hint: string; icon: React.ReactNode }> = {
    'each-page': { label: 'Each Page', hint: 'One PDF per page — e.g. 20 pages → 20 files', icon: <Grid3x3 className="w-4 h-4" /> },
    'every-n': { label: 'Every N Pages', hint: 'Split into chunks of N pages each', icon: <Layers className="w-4 h-4" /> },
    'ranges': { label: 'Custom Ranges', hint: 'Define each output file with semicolons: 1-3;4-7;8', icon: <Scissors className="w-4 h-4" /> },
    'odd-even': { label: 'Odd / Even', hint: 'Two files: odd-numbered pages and even-numbered pages', icon: <ZapIcon className="w-4 h-4" /> },
    'bookmarks': { label: 'By Bookmarks', hint: 'Split at top-level bookmarks (best-effort)', icon: <BookOpen className="w-4 h-4" /> },
};

// ── Toast sub-component ─────────────────────────────────────────────────────────

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

// ── Page thumbnail grid ─────────────────────────────────────────────────────────

const PageGrid = ({
    thumbs,
    totalPages,
    selectedPages,
    onTogglePage,
    loadingThumbs,
}: {
    thumbs: PageThumb[];
    totalPages: number;
    selectedPages: Set<number>;
    onTogglePage: (i: number) => void;
    loadingThumbs: boolean;
}) => {
    const thumbMap = new Map(thumbs.map(t => [t.index, t.dataUrl]));

    return (
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {Array.from({ length: totalPages }, (_, i) => {
                const selected = selectedPages.has(i);
                const src = thumbMap.get(i);
                return (
                    <motion.button
                        key={i}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => onTogglePage(i)}
                        className={`relative aspect-[3/4] rounded-xl overflow-hidden border-2 transition-all duration-150 group
                            ${selected
                                ? 'border-violet-500 shadow-lg shadow-violet-500/20 ring-2 ring-violet-400/40'
                                : 'border-gray-200 dark:border-white/10 hover:border-violet-300 dark:hover:border-violet-500/40'}`}
                    >
                        {/* Thumbnail or placeholder */}
                        {src ? (
                            <img src={src} alt={`Page ${i + 1}`} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-white/5">
                                {loadingThumbs
                                    ? <Loader2 className="w-4 h-4 text-gray-300 animate-spin" />
                                    : <FileText className="w-5 h-5 text-gray-300" />
                                }
                            </div>
                        )}

                        {/* Selection overlay */}
                        <AnimatePresence>
                            {selected && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 bg-violet-500/15 flex items-start justify-end p-1"
                                >
                                    <div className="w-4 h-4 rounded-full bg-violet-500 flex items-center justify-center">
                                        <CheckCircle2 className="w-3 h-3 text-white" />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Page number */}
                        <div className="absolute bottom-0 left-0 right-0 text-[9px] font-black text-center py-0.5 bg-black/40 text-white">
                            {i + 1}
                        </div>
                    </motion.button>
                );
            })}
        </div>
    );
};

// ── Main Component ──────────────────────────────────────────────────────────────

export const SplitPDF: React.FC<SplitPDFProps> = ({ onBack }) => {
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

    // ── Split options
    const [mode, setMode] = useState<SplitMode>('each-page');
    const [everyN, setEveryN] = useState(2);
    const [customRanges, setCustomRanges] = useState('');
    const [outputPrefix, setOutputPrefix] = useState('');
    const [singleZip, setSingleZip] = useState(true);

    // ── Selected pages (for custom range visual aid)
    const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());

    // ── Processing
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressLabel, setProgressLabel] = useState('');

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
        setSelectedPages(new Set());
        setTotalPages(0);
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

        // Generate thumbnails progressively
        setLoadingThumbs(true);
        // Generate first 30 thumbs max to keep it snappy; more on scroll could be added
        const limit = Math.min(count, 40);
        for (let i = 0; i < limit; i++) {
            const dataUrl = await generatePDFThumbnail(f, 120);
            // pdfjs renders page 1 by default; for multi-page we'd need page index injection
            // generatePDFThumbnail always renders page 0; we mark them all with same thumb for now
            // (In production you'd pass the page index — we'll handle it with a page-specific call)
            setThumbs(prev => {
                if (prev.some(t => t.index === i)) return prev;
                return [...prev, { index: i, dataUrl }];
            });
        }
        setLoadingThumbs(false);
    }, [toast]);

    // We need a page-index-aware thumbnail generator
    const generatePageThumbnail = useCallback(async (f: File, pageIndex: number): Promise<string> => {
        try {
            const { GlobalWorkerOptions, getDocument } = await import('pdfjs-dist');
            if (GlobalWorkerOptions) {
                GlobalWorkerOptions.workerSrc =
                    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            }
            const bytes = await f.arrayBuffer();
            const pdf = await getDocument({ data: new Uint8Array(bytes) }).promise;
            const page = await pdf.getPage(pageIndex + 1); // pdfjs is 1-indexed
            const naturalVP = page.getViewport({ scale: 1 });
            const scale = 120 / naturalVP.width;
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(viewport.width);
            canvas.height = Math.round(viewport.height);
            const ctx = canvas.getContext('2d')!;
            await page.render({ canvasContext: ctx, viewport }).promise;
            return canvas.toDataURL('image/jpeg', 0.7);
        } catch {
            return '';
        }
    }, []);

    const loadFileFull = useCallback(async (f: File) => {
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
        setSelectedPages(new Set());
        setTotalPages(0);
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

        const limit = Math.min(count, 48);
        for (let i = 0; i < limit; i++) {
            const dataUrl = await generatePageThumbnail(f, i);
            if (dataUrl) {
                setThumbs(prev => [...prev, { index: i, dataUrl }]);
            }
        }
        setLoadingThumbs(false);
    }, [toast, generatePageThumbnail]);

    // ── Drag & Drop ──────────────────────────────────────────────────────────

    const onDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault(); setIsDragOver(true);
    }, []);

    const onDragLeave = useCallback((e: React.DragEvent) => {
        if (!dropZoneRef.current?.contains(e.relatedTarget as Node)) setIsDragOver(false);
    }, []);

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault(); setIsDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f) loadFileFull(f);
    }, [loadFileFull]);

    // ── Page selection ───────────────────────────────────────────────────────

    const togglePage = useCallback((i: number) => {
        setSelectedPages(prev => {
            const next = new Set(prev);
            if (next.has(i)) next.delete(i); else next.add(i);
            return next;
        });
    }, []);

    const selectAll = useCallback(() =>
        setSelectedPages(new Set(Array.from({ length: totalPages }, (_, i) => i))), [totalPages]);

    const selectNone = useCallback(() => setSelectedPages(new Set()), []);

    const selectOdd = useCallback(() =>
        setSelectedPages(new Set(Array.from({ length: totalPages }, (_, i) => i).filter(i => i % 2 === 0))), [totalPages]);

    const selectEven = useCallback(() =>
        setSelectedPages(new Set(Array.from({ length: totalPages }, (_, i) => i).filter(i => i % 2 !== 0))), [totalPages]);

    // Sync selected pages → custom ranges text when grid is used
    useEffect(() => {
        if (mode !== 'ranges' || selectedPages.size === 0) return;
        const sorted = [...selectedPages].sort((a, b) => a - b);
        // Collapse into ranges
        const ranges: string[] = [];
        let start = sorted[0], prev = sorted[0];
        for (let i = 1; i <= sorted.length; i++) {
            if (i === sorted.length || sorted[i] !== prev + 1) {
                ranges.push(start === prev ? `${start + 1}` : `${start + 1}-${prev + 1}`);
                if (i < sorted.length) { start = sorted[i]; prev = sorted[i]; }
            } else { prev = sorted[i]; }
        }
        setCustomRanges(ranges.join(';'));
    }, [selectedPages, mode]);

    // ── Derived preview of what split will produce ────────────────────────────

    const previewParts = (() => {
        if (!totalPages) return [];
        if (mode === 'each-page') return [`${totalPages} individual PDFs (1 page each)`];
        if (mode === 'odd-even') return ['odd_pages.pdf', 'even_pages.pdf'];
        if (mode === 'every-n') {
            const n = Math.max(1, everyN);
            const count = Math.ceil(totalPages / n);
            return [`${count} PDFs (${n} pages each)`];
        }
        if (mode === 'ranges') {
            const parts = customRanges.split(';').map(r => r.trim()).filter(Boolean);
            return parts.length ? parts.map((r, i) => `part_${i + 1}: pages ${r}`) : ['Define ranges above'];
        }
        if (mode === 'bookmarks') return ['Split at each bookmark (best-effort fallback to per-page)'];
        return [];
    })();

    // ── Split handler ────────────────────────────────────────────────────────

    const handleSplit = useCallback(async () => {
        if (!file || isProcessing) return;
        if (totalPages === 0) { toast('error', 'File has no pages.'); return; }
        if (mode === 'ranges' && !customRanges.trim()) {
            toast('error', 'Define at least one range (e.g. "1-3;4-6").');
            return;
        }

        setIsProcessing(true);
        setProgress(0);
        setProgressLabel('Preparing…');

        try {
            await splitPDFAdvanced(file, {
                mode,
                ranges: customRanges,
                everyN: Math.max(1, everyN),
                outputPrefix: sanitize(outputPrefix || file.name.replace(/\.pdf$/i, '')),
                singleZip,
                onProgress: (p) => {
                    setProgress(p);
                    if (p < 15) setProgressLabel('Loading PDF…');
                    else if (p < 90) setProgressLabel(`Generating part ${Math.round((p / 90) * (previewParts.length || 1))} of ${previewParts.length || '?'}…`);
                    else if (p < 98) setProgressLabel('Compressing ZIP…');
                    else setProgressLabel('Preparing download…');
                },
            });

            setProgress(100);
            setProgressLabel('Done!');
            toast('success', `Split complete! ${singleZip ? 'ZIP downloaded.' : 'Files downloaded.'}`);

            setTimeout(() => {
                setIsProcessing(false);
                setProgress(0);
                setProgressLabel('');
            }, 1400);
        } catch (err: any) {
            toast('error', err?.message || 'Split failed. Please try again.');
            setIsProcessing(false);
            setProgress(0);
            setProgressLabel('');
        }
    }, [file, isProcessing, totalPages, mode, customRanges, everyN, outputPrefix, singleZip, toast, previewParts.length]);

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

            {/* ── Processing Overlay ── */}
            <AnimatePresence>
                {isProcessing && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
                    >
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
                                    <motion.circle
                                        cx="50" cy="50" r="40" fill="none"
                                        stroke="url(#splitGrad)" strokeWidth="8" strokeLinecap="round"
                                        strokeDasharray={circumference}
                                        animate={{ strokeDashoffset: circumference - (circumference * progress) / 100 }}
                                        transition={{ duration: 0.4, ease: 'easeOut' }}
                                    />
                                    <defs>
                                        <linearGradient id="splitGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                            <stop offset="0%" stopColor="#8b5cf6" />
                                            <stop offset="100%" stopColor="#ec4899" />
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
                                {progress === 100 ? '✅ Split Complete!' : 'Splitting PDF…'}
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{progressLabel || 'Please wait…'}</p>
                            <div className="mt-4 w-full h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                                <motion.div
                                    className="h-full bg-gradient-to-r from-violet-500 to-pink-500 rounded-full"
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
                    <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-xl">
                        <Scissors className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div>
                        <h1 className="text-lg font-black dark:text-white tracking-tight">Split PDF</h1>
                        <p className="text-[11px] text-gray-400 font-medium">
                            {file
                                ? `${file.name} · ${totalPages} pages · ${formatBytes(file.size)}`
                                : 'Extract pages or split into multiple files'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {file && (
                        <>
                            <button
                                onClick={() => setShowGrid(v => !v)}
                                title={showGrid ? 'Hide page grid' : 'Show page grid'}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-colors text-gray-400"
                            >
                                {showGrid ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                            <button
                                onClick={() => { setFile(null); setThumbs([]); setTotalPages(0); setSelectedPages(new Set()); }}
                                className="px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors flex items-center gap-1.5"
                            >
                                <Trash2 className="w-3.5 h-3.5" /> Remove
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 flex overflow-hidden">

                {/* ── LEFT: Upload + Page Grid ── */}
                <div className="flex-1 flex flex-col overflow-hidden p-4 lg:p-6 gap-4">

                    {/* Drop Zone */}
                    {!file ? (
                        <div
                            ref={dropZoneRef}
                            onDragOver={onDragOver}
                            onDragLeave={onDragLeave}
                            onDrop={onDrop}
                            onClick={() => uploadInputRef.current?.click()}
                            className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-2xl transition-all duration-200 cursor-pointer
                              ${isDragOver
                                    ? 'border-violet-500 bg-violet-500/5 scale-[0.99]'
                                    : 'border-gray-200 dark:border-white/10 bg-white dark:bg-[#262636]'}
                              hover:border-violet-400 dark:hover:border-violet-500/50 hover:bg-violet-50/30 dark:hover:bg-violet-900/10`}
                        >
                            <input
                                ref={uploadInputRef}
                                type="file"
                                accept=".pdf,application/pdf"
                                className="hidden"
                                onChange={e => e.target.files?.[0] && loadFileFull(e.target.files[0])}
                            />
                            <motion.div
                                animate={{ y: [0, -7, 0] }}
                                transition={{ repeat: Infinity, duration: 2.6, ease: 'easeInOut' }}
                                className="p-5 bg-violet-100 dark:bg-violet-900/30 rounded-2xl mb-5 shadow-lg shadow-violet-200 dark:shadow-violet-900/30"
                            >
                                <Upload className="w-10 h-10 text-violet-600 dark:text-violet-400" />
                            </motion.div>
                            <h2 className="text-lg font-black dark:text-white mb-1">Drop a PDF here</h2>
                            <p className="text-sm text-gray-400 mb-3">
                                or <span className="text-violet-500 font-bold underline underline-offset-2">click to browse</span>
                            </p>
                            <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-gray-300 dark:text-gray-600">
                                <span>PDF only</span><span>·</span>
                                <span>Max {MAX_FILE_MB} MB</span><span>·</span>
                                <span>Single file</span>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Loading indicator */}
                            {loadingFile && (
                                <div className="flex items-center gap-3 px-4 py-3 bg-violet-50 dark:bg-violet-900/20 rounded-xl border border-violet-100 dark:border-violet-500/20">
                                    <Loader2 className="w-4 h-4 text-violet-500 animate-spin" />
                                    <span className="text-sm text-violet-700 dark:text-violet-300 font-medium">Reading PDF…</span>
                                </div>
                            )}

                            {/* Page Grid */}
                            {showGrid && totalPages > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex-1 flex flex-col min-h-0 bg-white dark:bg-[#262636] rounded-2xl border border-gray-100 dark:border-white/5 overflow-hidden"
                                >
                                    {/* Grid toolbar */}
                                    <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/5">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                                                Page Preview · {selectedPages.size > 0 ? `${selectedPages.size} selected` : `${totalPages} total`}
                                            </span>
                                            {loadingThumbs && (
                                                <span className="flex items-center gap-1 text-[10px] text-violet-500 font-bold">
                                                    <Loader2 className="w-3 h-3 animate-spin" /> Loading thumbnails…
                                                </span>
                                            )}
                                        </div>
                                        {mode === 'ranges' && (
                                            <div className="flex items-center gap-1.5">
                                                {[
                                                    { label: 'All', fn: selectAll },
                                                    { label: 'None', fn: selectNone },
                                                    { label: 'Odd', fn: selectOdd },
                                                    { label: 'Even', fn: selectEven },
                                                ].map(({ label, fn }) => (
                                                    <button key={label} onClick={fn}
                                                        className="px-2 py-1 text-[10px] font-bold text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-lg transition-colors">
                                                        {label}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Grid */}
                                    <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                                        <PageGrid
                                            thumbs={thumbs}
                                            totalPages={totalPages}
                                            selectedPages={selectedPages}
                                            onTogglePage={togglePage}
                                            loadingThumbs={loadingThumbs}
                                        />
                                        {totalPages > 48 && (
                                            <p className="text-center text-[10px] text-gray-400 mt-3">
                                                Previews shown for first 48 pages. All pages will be included in split.
                                            </p>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </>
                    )}
                </div>

                {/* ── RIGHT: Options + Action ── */}
                <div className="w-80 shrink-0 flex flex-col border-l border-gray-100 dark:border-white/5 bg-[#f3f1ea] dark:bg-[#262636] overflow-y-auto custom-scrollbar">

                    {/* File summary */}
                    {file && totalPages > 0 && (
                        <div className="p-5 border-b border-gray-100 dark:border-white/5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">File Summary</p>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { label: 'Pages', value: totalPages },
                                    { label: 'Size', value: formatBytes(file.size) },
                                ].map(stat => (
                                    <div key={stat.label} className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 text-center">
                                        <p className="text-base font-black text-violet-600 dark:text-violet-400">{stat.value}</p>
                                        <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mt-0.5">{stat.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Split Mode */}
                    <div className="p-5 border-b border-gray-100 dark:border-white/5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Split Mode</p>
                        <div className="space-y-1.5">
                            {(Object.keys(MODE_META) as SplitMode[]).map(m => {
                                const meta = MODE_META[m];
                                const active = mode === m;
                                return (
                                    <button
                                        key={m}
                                        onClick={() => setMode(m)}
                                        className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all duration-150
                                            ${active
                                                ? 'border-violet-400 bg-violet-50 dark:bg-violet-900/20 dark:border-violet-500/50'
                                                : 'border-gray-100 dark:border-white/5 hover:border-violet-200 dark:hover:border-violet-500/20 hover:bg-gray-50 dark:hover:bg-white/5'}`}
                                    >
                                        <span className={`mt-0.5 shrink-0 ${active ? 'text-violet-600 dark:text-violet-400' : 'text-gray-400'}`}>
                                            {meta.icon}
                                        </span>
                                        <div>
                                            <p className={`text-xs font-bold ${active ? 'text-violet-700 dark:text-violet-300' : 'dark:text-gray-200'}`}>
                                                {meta.label}
                                            </p>
                                            <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed">{meta.hint}</p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Mode-specific controls */}
                    <AnimatePresence mode="wait">
                        {mode === 'every-n' && (
                            <motion.div
                                key="every-n"
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden border-b border-gray-100 dark:border-white/5"
                            >
                                <div className="p-5">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">
                                        Pages per part
                                    </label>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => setEveryN(v => Math.max(1, v - 1))}
                                            className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-white/5 font-black text-lg text-gray-600 dark:text-gray-300 hover:bg-violet-100 dark:hover:bg-violet-900/20 hover:text-violet-600 transition-colors"
                                        >−</button>
                                        <span className="flex-1 text-center text-2xl font-black dark:text-white">{everyN}</span>
                                        <button
                                            onClick={() => setEveryN(v => Math.min(totalPages || 999, v + 1))}
                                            className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-white/5 font-black text-lg text-gray-600 dark:text-gray-300 hover:bg-violet-100 dark:hover:bg-violet-900/20 hover:text-violet-600 transition-colors"
                                        >+</button>
                                    </div>
                                    {totalPages > 0 && (
                                        <p className="text-[10px] text-gray-400 text-center mt-2">
                                            → {Math.ceil(totalPages / Math.max(1, everyN))} output files
                                        </p>
                                    )}
                                </div>
                            </motion.div>
                        )}

                        {mode === 'ranges' && (
                            <motion.div
                                key="ranges"
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden border-b border-gray-100 dark:border-white/5"
                            >
                                <div className="p-5 space-y-3">
                                    <div>
                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">
                                            Page Ranges
                                        </label>
                                        <textarea
                                            value={customRanges}
                                            onChange={e => setCustomRanges(e.target.value)}
                                            placeholder={"1-3;4-7;8\n(semicolon-separated)"}
                                            rows={3}
                                            className="w-full text-xs font-mono px-3 py-2 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-violet-400 focus:border-violet-400 outline-none dark:text-gray-200 resize-none"
                                        />
                                    </div>
                                    <div className="p-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-500/20 rounded-xl">
                                        <p className="text-[10px] font-bold text-violet-700 dark:text-violet-300 flex items-center gap-1.5 mb-1.5">
                                            <Info className="w-3 h-3" /> Syntax Guide
                                        </p>
                                        <div className="space-y-0.5 text-[10px] text-violet-600 dark:text-violet-400 font-mono">
                                            <p><span className="font-bold">1-3;4-6</span> → 2 files</p>
                                            <p><span className="font-bold">1,3,5</span> → specific pages</p>
                                            <p><span className="font-bold">1-5;6</span> → 2 files</p>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-gray-400 italic">
                                        💡 Click pages in the grid to auto-fill ranges
                                    </p>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Output options */}
                    <div className="p-5 border-b border-gray-100 dark:border-white/5 space-y-4">
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">
                                Output Filename Prefix
                            </label>
                            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl focus-within:ring-2 focus-within:ring-violet-400 focus-within:border-violet-400 transition-all">
                                <FileDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                <input
                                    type="text"
                                    value={outputPrefix}
                                    onChange={e => setOutputPrefix(e.target.value)}
                                    placeholder="document"
                                    className="flex-1 bg-transparent text-sm font-bold dark:text-gray-200 outline-none placeholder-gray-300 dark:placeholder-gray-600"
                                />
                            </div>
                            <p className="text-[10px] text-gray-400 mt-1">e.g. <span className="font-mono">report_part_001.pdf</span></p>
                        </div>
                    </div>

                    {/* Advanced options */}
                    <div className="border-b border-gray-100 dark:border-white/5">
                        <button
                            onClick={() => setAdvancedOpen(v => !v)}
                            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                        >
                            <span className="flex items-center gap-2 text-xs font-bold text-gray-600 dark:text-gray-300">
                                <Settings2 className="w-3.5 h-3.5" /> Advanced Options
                            </span>
                            {advancedOpen ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                        </button>

                        <AnimatePresence>
                            {advancedOpen && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                >
                                    <div className="px-5 pb-5 space-y-4">
                                        {/* ZIP toggle */}
                                        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/10">
                                            <div>
                                                <p className="text-xs font-bold dark:text-gray-200 flex items-center gap-1.5">
                                                    <ArchiveIcon className="w-3.5 h-3.5 text-violet-500" /> Bundle as ZIP
                                                </p>
                                                <p className="text-[10px] text-gray-400 mt-0.5">
                                                    {singleZip ? 'All parts in one ZIP download' : 'Each part downloaded separately'}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => setSingleZip(v => !v)}
                                                className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ml-3 ${singleZip ? 'bg-violet-600' : 'bg-gray-300 dark:bg-gray-700'}`}
                                            >
                                                <motion.div
                                                    animate={{ left: singleZip ? '20px' : '2px' }}
                                                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                                    className="absolute top-1 w-3 h-3 bg-white rounded-full shadow"
                                                    style={{ left: singleZip ? '20px' : '2px' }}
                                                />
                                            </button>
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

                    {/* Preview of output */}
                    {file && totalPages > 0 && previewParts.length > 0 && (
                        <div className="px-5 py-4 border-b border-gray-100 dark:border-white/5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Output Preview</p>
                            <div className="space-y-1 max-h-28 overflow-y-auto custom-scrollbar">
                                {previewParts.slice(0, 8).map((p, i) => (
                                    <div key={i} className="flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
                                        <FileText className="w-3 h-3 text-violet-400 shrink-0" />
                                        <span className="font-mono truncate">{p}</span>
                                    </div>
                                ))}
                                {previewParts.length > 8 && (
                                    <p className="text-[10px] text-gray-400 italic pl-5">…and {previewParts.length - 8} more</p>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="flex-1" />

                    {/* ── Action Button ── */}
                    <div className="p-5 border-t border-gray-100 dark:border-white/5 bg-white/80 dark:bg-[#262636]/80 backdrop-blur-sm">
                        <button
                            onClick={handleSplit}
                            disabled={!file || isProcessing || totalPages === 0 || loadingFile}
                            className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-sm transition-all duration-200 shadow-lg
                              ${!file || totalPages === 0 || loadingFile
                                    ? 'bg-gray-200 dark:bg-white/5 text-gray-400 cursor-not-allowed shadow-none'
                                    : 'bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-white shadow-violet-500/30 hover:-translate-y-0.5 active:translate-y-0'}`}
                        >
                            {isProcessing ? (
                                <><Loader2 className="w-5 h-5 animate-spin" /> Splitting…</>
                            ) : (
                                <><Download className="w-5 h-5" /> Split & Download</>
                            )}
                        </button>

                        {!file && (
                            <p className="text-center text-[10px] text-gray-400 mt-2">Upload a PDF to begin</p>
                        )}
                        {file && totalPages === 0 && !loadingFile && (
                            <p className="text-center text-[10px] text-red-400 mt-2">Could not read PDF pages</p>
                        )}
                        {loadingFile && (
                            <p className="text-center text-[10px] text-violet-500 mt-2 flex items-center justify-center gap-1">
                                <Loader2 className="w-2.5 h-2.5 animate-spin" /> Analysing file…
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
