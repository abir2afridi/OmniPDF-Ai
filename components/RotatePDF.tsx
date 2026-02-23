/**
 * RotatePDF — Production-ready rotate pages module.
 *
 * Key features:
 * - Visual page grid with real-time CSS rotation preview per card
 * - Per-page CW / CCW / 180° buttons on hover
 * - Bulk selection + batch angle apply
 * - Odd / Even page shortcuts
 * - Undo stack (up to 10 states)
 * - Custom range input
 * - Output filename rename
 * - Animated progress overlay
 * - Download after processing (never re-downloads accidentally)
 */

import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    Upload, X, FileText, Download, Loader2,
    AlertCircle, CheckCircle2, Info,
    ArrowLeft, RotateCcw, RotateCw, Settings2,
    ChevronDown, ChevronUp, FileDown,
    RefreshCw, Layers,
} from 'lucide-react';
import {
    getFilePageCount,
    rotatePDFAdvanced,
    downloadBytes,
    type RotationMap,
    type RotatePDFResult,
} from '../services/pdfService';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Toast {
    id: string;
    type: 'success' | 'error' | 'info';
    message: string;
}

interface PageThumb {
    index: number;
    dataUrl: string;
}

interface RotatePDFProps {
    onBack?: () => void;
}

type AngleStep = 90 | -90 | 180;

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_FILE_MB = 200;
const THUMB_LIMIT = 60;
const uid = () => Math.random().toString(36).slice(2, 10);

const formatBytes = (b: number) => {
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(2)} MB`;
};

const sanitize = (s: string) =>
    s.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\s+/g, '_').slice(0, 100) || 'document';

const normalizeAngle = (a: number) => ((a % 360) + 360) % 360;

// ── ToastItem ─────────────────────────────────────────────────────────────────

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

// ── Angle badge helper ────────────────────────────────────────────────────────

const angleBadge = (delta: number) => {
    const norm = normalizeAngle(delta);
    if (norm === 0) return null;
    return (
        <span className="absolute top-1 right-1 z-10 text-[9px] font-black bg-violet-600 text-white rounded-full px-1.5 py-0.5 leading-none shadow">
            +{norm}°
        </span>
    );
};

// ── Page Card ─────────────────────────────────────────────────────────────────

interface PageCardProps {
    index: number;
    src: string | undefined;
    loadingThumbs: boolean;
    delta: number;              // accumulated rotation delta
    selected: boolean;
    onSelect: () => void;
    onRotate: (angle: AngleStep) => void;
}

const PageCard: React.FC<PageCardProps> = ({
    index, src, loadingThumbs, delta, selected, onSelect, onRotate,
}) => {
    const displayAngle = normalizeAngle(delta);
    const isRotated = displayAngle !== 0;

    return (
        <motion.div
            layout
            whileHover={{ scale: 1.04 }}
            className={`relative flex flex-col gap-1.5 group cursor-pointer select-none`}
            onClick={onSelect}
        >
            {/* Thumbnail card */}
            <div className={`relative aspect-[3/4] rounded-xl overflow-hidden border-2 transition-all duration-150
                ${selected
                    ? 'border-violet-500 ring-2 ring-violet-400/40 shadow-lg shadow-violet-500/20'
                    : 'border-gray-200 dark:border-white/10 hover:border-violet-300 dark:hover:border-violet-500/40'}`}
            >
                {/* Rotation delta badge */}
                {isRotated && angleBadge(displayAngle)}

                {/* Thumbnail with live CSS rotation preview */}
                <div className="w-full h-full flex items-center justify-center bg-gray-50 dark:bg-white/5 overflow-hidden p-1">
                    {src ? (
                        <img
                            src={src}
                            alt={`Page ${index + 1}`}
                            className="max-w-full max-h-full object-contain transition-transform duration-300"
                            style={{ transform: `rotate(${displayAngle}deg)` }}
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            {loadingThumbs
                                ? <Loader2 className="w-4 h-4 text-gray-300 animate-spin" />
                                : <FileText className="w-5 h-5 text-gray-300" />}
                        </div>
                    )}
                </div>

                {/* Selection check */}
                <AnimatePresence>
                    {selected && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.7 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.7 }}
                            className="absolute top-1.5 left-1.5 w-5 h-5 bg-violet-600 rounded-full flex items-center justify-center shadow"
                        >
                            <CheckCircle2 className="w-3 h-3 text-white" />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Rotation controls — visible on hover */}
                <div className="absolute bottom-0 left-0 right-0 flex items-center justify-around py-1 bg-black/60
                                opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                    onClick={e => e.stopPropagation()}
                >
                    <button
                        title="Rotate 90° CCW"
                        onClick={() => onRotate(-90)}
                        className="p-1 text-white hover:text-violet-300 transition-colors"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button
                        title="Rotate 180°"
                        onClick={() => onRotate(180)}
                        className="p-1 text-white hover:text-yellow-300 transition-colors"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                        title="Rotate 90° CW"
                        onClick={() => onRotate(90)}
                        className="p-1 text-white hover:text-violet-300 transition-colors"
                    >
                        <RotateCw className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Page label */}
            <div className="flex items-center justify-between px-0.5">
                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">{index + 1}</span>
                {isRotated && (
                    <span className="text-[9px] font-black text-violet-600 dark:text-violet-400">{displayAngle}°</span>
                )}
            </div>
        </motion.div>
    );
};

// ── Main Component ─────────────────────────────────────────────────────────────

export const RotatePDF: React.FC<RotatePDFProps> = ({ onBack }) => {
    // ── File state
    const [file, setFile] = useState<File | null>(null);
    const [totalPages, setTotalPages] = useState(0);
    const [thumbs, setThumbs] = useState<PageThumb[]>([]);
    const [loadingFile, setLoadingFile] = useState(false);
    const [loadingThumbs, setLoadingThumbs] = useState(false);

    // ── UI state
    const [isDragOver, setIsDragOver] = useState(false);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [toasts, setToasts] = useState<Toast[]>([]);

    // ── Rotation state  — per-page cumulative delta
    const [rotationDeltas, setRotationDeltas] = useState<RotationMap>({});
    const [selected, setSelected] = useState<Set<number>>(new Set());

    // ── Undo
    const [undoStack, setUndoStack] = useState<RotationMap[]>([]);

    // ── Bulk apply angle
    const [bulkAngle, setBulkAngle] = useState<AngleStep>(90);

    // ── Range input
    const [rangeInput, setRangeInput] = useState('');

    // ── Output options
    const [outputPrefix, setOutputPrefix] = useState('');

    // ── Processing
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressLabel, setProgressLabel] = useState('');
    const [lastResult, setLastResult] = useState<RotatePDFResult | null>(null);
    const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);

    const dropZoneRef = useRef<HTMLDivElement>(null);
    const uploadInputRef = useRef<HTMLInputElement>(null);
    const circumference = 2 * Math.PI * 40;

    // ── Toast helpers
    const toast = useCallback((type: Toast['type'], message: string) => {
        const id = uid();
        setToasts(prev => [...prev.slice(-4), { id, type, message }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
    }, []);

    const dismissToast = useCallback((id: string) =>
        setToasts(prev => prev.filter(t => t.id !== id)), []);

    // ── Thumbnail generator
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
        } catch { return ''; }
    }, []);

    // ── File loading
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
        setRotationDeltas({});
        setSelected(new Set());
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

    // ── Drag & Drop
    const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); }, []);
    const onDragLeave = useCallback((e: React.DragEvent) => {
        if (!dropZoneRef.current?.contains(e.relatedTarget as Node)) setIsDragOver(false);
    }, []);
    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault(); setIsDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f) loadFile(f);
    }, [loadFile]);

    // ── Undo helpers
    const pushUndo = useCallback((prev: RotationMap) => {
        setUndoStack(s => [...s.slice(-9), { ...prev }]);
    }, []);

    const undo = useCallback(() => {
        setUndoStack(s => {
            if (s.length === 0) return s;
            const prev = s[s.length - 1];
            setRotationDeltas(prev);
            setLastResult(null); setResultBytes(null);
            toast('info', 'Undo: rotation reverted.');
            return s.slice(0, -1);
        });
    }, [toast]);

    // ── Per-page rotation
    const rotatePage = useCallback((index: number, angle: AngleStep) => {
        setRotationDeltas(prev => {
            pushUndo(prev);
            const next = { ...prev };
            next[index] = ((next[index] ?? 0) + angle);
            return next;
        });
        setLastResult(null); setResultBytes(null);
    }, [pushUndo]);

    // ── Page selection
    const togglePage = useCallback((i: number) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(i)) next.delete(i); else next.add(i);
            return next;
        });
    }, []);

    const selectAll = useCallback(() =>
        setSelected(new Set(Array.from({ length: totalPages }, (_, i) => i))), [totalPages]);

    const clearSelection = useCallback(() => setSelected(new Set()), []);

    // ── Bulk rotate selected pages
    const applyBulkRotation = useCallback(() => {
        if (selected.size === 0) {
            toast('error', 'Select at least one page first.');
            return;
        }
        setRotationDeltas(prev => {
            pushUndo(prev);
            const next = { ...prev };
            for (const idx of selected) {
                next[idx] = ((next[idx] ?? 0) + bulkAngle);
            }
            return next;
        });
        setLastResult(null); setResultBytes(null);
        toast('info', `Rotated ${selected.size} page(s) by ${bulkAngle > 0 ? '+' : ''}${bulkAngle}°`);
        setSelected(new Set());
    }, [selected, bulkAngle, pushUndo, toast]);

    // ── Range input apply
    const applyRange = useCallback(() => {
        if (!rangeInput.trim() || !totalPages) return;
        const indices: number[] = [];
        for (const part of rangeInput.split(',')) {
            const trimmed = part.trim();
            if (!trimmed) continue;
            if (trimmed.includes('-')) {
                const [a, b] = trimmed.split('-').map(s => parseInt(s.trim(), 10));
                if (!isNaN(a) && !isNaN(b))
                    for (let n = Math.max(1, a); n <= Math.min(totalPages, b); n++) indices.push(n - 1);
            } else {
                const n = parseInt(trimmed, 10);
                if (!isNaN(n) && n >= 1 && n <= totalPages) indices.push(n - 1);
            }
        }
        if (indices.length === 0) { toast('error', 'No valid pages in range.'); return; }
        setSelected(new Set(indices));
        toast('info', `${indices.length} page(s) selected from range.`);
    }, [rangeInput, totalPages, toast]);

    // ── Odd / Even shortcuts
    const selectOdd = useCallback(() => {
        setSelected(new Set(Array.from({ length: totalPages }, (_, i) => i).filter(i => i % 2 === 0)));
    }, [totalPages]);

    const selectEven = useCallback(() => {
        setSelected(new Set(Array.from({ length: totalPages }, (_, i) => i).filter(i => i % 2 !== 0)));
    }, [totalPages]);

    // ── Reset all rotations
    const resetAll = useCallback(() => {
        pushUndo(rotationDeltas);
        setRotationDeltas({});
        setLastResult(null); setResultBytes(null);
        toast('info', 'All rotations cleared.');
    }, [rotationDeltas, pushUndo, toast]);

    // ── Count of pages with pending rotation
    const rotatedCount = (Object.values(rotationDeltas) as number[]).filter(d => normalizeAngle(d) !== 0).length;

    // ── Apply rotation handler
    const handleApply = useCallback(async () => {
        if (!file || isProcessing) return;
        if (rotatedCount === 0) {
            toast('error', 'No rotation changes to apply. Use the page controls or bulk apply.');
            return;
        }

        setIsProcessing(true);
        setProgress(0);
        setProgressLabel('Preparing…');

        try {
            const result = await rotatePDFAdvanced(file, {
                rotationMap: rotationDeltas,
                outputPrefix: sanitize(outputPrefix || file.name.replace(/\.pdf$/i, '')),
                onProgress: (p) => {
                    setProgress(p);
                    if (p < 15) setProgressLabel('Loading PDF…');
                    else if (p < 85) setProgressLabel(`Applying rotations to ${rotatedCount} page(s)…`);
                    else setProgressLabel('Saving output…');
                },
            });

            setLastResult(result);
            setResultBytes(result.bytes);
            setProgress(100);
            setProgressLabel('Done!');
            toast('success', `Rotated ${result.rotatedIndices.length} page(s) — ready to download.`);

            setTimeout(() => {
                setIsProcessing(false);
                setProgress(0);
                setProgressLabel('');
            }, 1400);
        } catch (err: any) {
            toast('error', err?.message || 'Rotation failed. Please try again.');
            setIsProcessing(false);
            setProgress(0);
            setProgressLabel('');
        }
    }, [file, isProcessing, rotationDeltas, rotatedCount, outputPrefix, toast]);

    const handleDownload = useCallback(() => {
        if (!resultBytes || !lastResult) return;
        downloadBytes(resultBytes, lastResult.outputName);
        toast('success', `Downloaded: ${lastResult.outputName}`);
    }, [resultBytes, lastResult, toast]);

    // Thumb map
    const thumbMap = new Map<number, string>(thumbs.map(t => [t.index, t.dataUrl]));

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="flex-1 flex flex-col h-full bg-gray-50 dark:bg-[#1e1e2e] overflow-hidden relative">

            {/* ── Toasts ── */}
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
                                        stroke="url(#rotGrad)" strokeWidth="8" strokeLinecap="round"
                                        strokeDasharray={circumference}
                                        animate={{ strokeDashoffset: circumference - (circumference * progress) / 100 }}
                                        transition={{ duration: 0.4, ease: 'easeOut' }}
                                    />
                                    <defs>
                                        <linearGradient id="rotGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                            <stop offset="0%" stopColor="#7c3aed" />
                                            <stop offset="100%" stopColor="#a855f7" />
                                        </linearGradient>
                                    </defs>
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    {progress === 100
                                        ? <CheckCircle2 className="w-9 h-9 text-emerald-500" />
                                        : <span className="text-lg font-black dark:text-white">{progress}%</span>}
                                </div>
                            </div>
                            <h3 className="text-xl font-bold dark:text-white mb-1">
                                {progress === 100 ? '✅ Pages Rotated!' : 'Rotating Pages…'}
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{progressLabel}</p>
                            <div className="mt-4 h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                                <motion.div className="h-full bg-gradient-to-r from-violet-600 to-purple-500 rounded-full"
                                    animate={{ width: `${progress}%` }}
                                    transition={{ duration: 0.35, ease: 'easeOut' }} />
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Header ── */}
            <div className="shrink-0 flex items-center justify-between px-6 py-4 bg-white dark:bg-[#262636] border-b border-gray-100 dark:border-white/5 shadow-sm">
                <div className="flex items-center gap-3">
                    {onBack && (
                        <button onClick={onBack}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-colors text-gray-500 dark:text-gray-400">
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}
                    <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-xl">
                        <RotateCw className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div>
                        <h1 className="text-lg font-black dark:text-white tracking-tight">Rotate PDF</h1>
                        <p className="text-[11px] text-gray-400 font-medium">
                            {file
                                ? `${file.name} · ${totalPages} pages · ${formatBytes(file.size)}`
                                : 'Rotate individual pages or entire PDF'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {file && (
                        <>
                            {undoStack.length > 0 && (
                                <button onClick={undo} title={`Undo last rotation change`}
                                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-colors">
                                    <RotateCcw className="w-3.5 h-3.5" /> Undo
                                </button>
                            )}
                            {rotatedCount > 0 && (
                                <button onClick={resetAll}
                                    className="px-3 py-2 text-xs font-bold text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-xl transition-colors flex items-center gap-1.5">
                                    <RefreshCw className="w-3.5 h-3.5" /> Reset
                                </button>
                            )}
                            <button
                                onClick={() => { setFile(null); setThumbs([]); setTotalPages(0); setRotationDeltas({}); setSelected(new Set()); setUndoStack([]); setLastResult(null); setResultBytes(null); }}
                                className="px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors flex items-center gap-1.5">
                                <X className="w-3.5 h-3.5" /> Remove
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 flex overflow-hidden">

                {/* ── LEFT: Drop Zone / Grid ── */}
                <div className="flex-1 flex flex-col overflow-hidden p-4 lg:p-6 gap-4 min-w-0">

                    {!file ? (
                        /* Drop Zone */
                        <div ref={dropZoneRef} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                            onClick={() => uploadInputRef.current?.click()}
                            className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-2xl transition-all duration-200 cursor-pointer
                              ${isDragOver ? 'border-violet-500 bg-violet-500/5 scale-[0.99]'
                                    : 'border-gray-200 dark:border-white/10 bg-white dark:bg-[#262636]'}
                              hover:border-violet-400 dark:hover:border-violet-500/50 hover:bg-violet-50/30 dark:hover:bg-violet-900/10`}>
                            <input ref={uploadInputRef} type="file" accept=".pdf,application/pdf" className="hidden"
                                onChange={e => e.target.files?.[0] && loadFile(e.target.files[0])} />
                            <motion.div animate={{ rotate: [0, 15, -15, 0] }} transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
                                className="p-5 bg-violet-100 dark:bg-violet-900/30 rounded-2xl mb-5 shadow-lg shadow-violet-200 dark:shadow-violet-900/30">
                                <RotateCw className="w-10 h-10 text-violet-600 dark:text-violet-400" />
                            </motion.div>
                            <h2 className="text-lg font-black dark:text-white mb-1">Drop a PDF here</h2>
                            <p className="text-sm text-gray-400 mb-3">
                                or <span className="text-violet-500 font-bold underline underline-offset-2">click to browse</span>
                            </p>
                            <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-gray-300 dark:text-gray-600">
                                <span>PDF only</span><span>·</span><span>Max {MAX_FILE_MB} MB</span>
                            </div>
                        </div>
                    ) : (
                        <>
                            {loadingFile && (
                                <div className="flex items-center gap-3 px-4 py-3 bg-violet-50 dark:bg-violet-900/20 rounded-xl border border-violet-100 dark:border-violet-500/20">
                                    <Loader2 className="w-4 h-4 text-violet-500 animate-spin" />
                                    <span className="text-sm text-violet-700 dark:text-violet-300 font-medium">Reading PDF…</span>
                                </div>
                            )}

                            {/* Selection + rotation summary bar */}
                            {totalPages > 0 && (selected.size > 0 || rotatedCount > 0) && (
                                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                                    className="flex items-center gap-3 px-4 py-2.5 bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-500/20 rounded-xl text-sm flex-wrap">
                                    {selected.size > 0 && (
                                        <span className="font-bold text-violet-700 dark:text-violet-300">
                                            {selected.size} page{selected.size !== 1 ? 's' : ''} selected
                                        </span>
                                    )}
                                    {rotatedCount > 0 && (
                                        <span className="font-bold text-orange-600 dark:text-orange-400">
                                            {rotatedCount} page{rotatedCount !== 1 ? 's' : ''} pending rotation
                                        </span>
                                    )}
                                    {selected.size > 0 && (
                                        <button onClick={clearSelection} className="ml-auto text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors font-bold">
                                            Clear selection
                                        </button>
                                    )}
                                </motion.div>
                            )}

                            {/* After-apply result banner */}
                            {lastResult && !isProcessing && (
                                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                                    className="flex items-center gap-3 px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-500/20 rounded-xl">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">
                                            Rotation applied — {lastResult.rotatedIndices.length} page(s) rotated
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
                            {totalPages > 0 && (
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                    className="flex-1 flex flex-col min-h-0 bg-white dark:bg-[#262636] rounded-2xl border border-gray-100 dark:border-white/5 overflow-hidden">
                                    {/* Grid toolbar */}
                                    <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/5 flex-wrap gap-2">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                                            {rotatedCount > 0
                                                ? <><span className="text-violet-500">{rotatedCount} pending</span> · </>
                                                : null}{totalPages} pages
                                        </span>
                                        <div className="flex items-center gap-1">
                                            {[
                                                { label: 'All', fn: selectAll },
                                                { label: 'Odd', fn: selectOdd },
                                                { label: 'Even', fn: selectEven },
                                                { label: 'Clear', fn: clearSelection },
                                            ].map(({ label, fn }) => (
                                                <button key={label} onClick={fn}
                                                    className="px-2 py-1 text-[10px] font-bold text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-lg transition-colors">
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

                                    {/* Card Grid */}
                                    <div className="flex-1 overflow-y-auto p-4">
                                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                                            {Array.from({ length: totalPages }, (_, i) => (
                                                <PageCard
                                                    key={i}
                                                    index={i}
                                                    src={thumbMap.get(i)}
                                                    loadingThumbs={loadingThumbs}
                                                    delta={rotationDeltas[i] ?? 0}
                                                    selected={selected.has(i)}
                                                    onSelect={() => togglePage(i)}
                                                    onRotate={(angle) => rotatePage(i, angle)}
                                                />
                                            ))}
                                        </div>
                                        {totalPages > THUMB_LIMIT && (
                                            <p className="text-center text-[10px] text-gray-400 mt-3">
                                                Thumbnails shown for first {THUMB_LIMIT} pages. All {totalPages} pages can be rotated via controls.
                                            </p>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </>
                    )}
                </div>

                {/* ── RIGHT: Controls ── */}
                <div className="w-80 shrink-0 flex flex-col border-l border-gray-100 dark:border-white/5 bg-white dark:bg-[#262636] overflow-y-auto">

                    {/* Stats */}
                    {file && totalPages > 0 && (
                        <div className="p-5 border-b border-gray-100 dark:border-white/5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Summary</p>
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { label: 'Pages', value: totalPages, color: 'text-gray-700 dark:text-gray-200' },
                                    { label: 'Selected', value: selected.size, color: 'text-violet-600 dark:text-violet-400' },
                                    { label: 'Pending', value: rotatedCount, color: 'text-orange-500 dark:text-orange-400' },
                                ].map(stat => (
                                    <div key={stat.label} className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 text-center">
                                        <p className={`text-base font-black ${stat.color}`}>{stat.value}</p>
                                        <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mt-0.5">{stat.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Bulk rotation */}
                    {file && totalPages > 0 && (
                        <div className="p-5 border-b border-gray-100 dark:border-white/5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Bulk Rotate Selected</p>

                            {/* Angle buttons */}
                            <div className="grid grid-cols-3 gap-2 mb-3">
                                {([
                                    { label: '–90°', angle: -90 as AngleStep, icon: <RotateCcw className="w-3.5 h-3.5" /> },
                                    { label: '180°', angle: 180 as AngleStep, icon: <RefreshCw className="w-3.5 h-3.5" /> },
                                    { label: '+90°', angle: 90 as AngleStep, icon: <RotateCw className="w-3.5 h-3.5" /> },
                                ] as { label: string; angle: AngleStep; icon: React.ReactNode }[]).map(item => (
                                    <button
                                        key={item.label}
                                        onClick={() => setBulkAngle(item.angle)}
                                        className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all text-xs font-bold
                                        ${bulkAngle === item.angle
                                                ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
                                                : 'border-gray-100 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-violet-200 dark:hover:border-violet-500/30'}`}
                                    >
                                        {item.icon}
                                        {item.label}
                                    </button>
                                ))}
                            </div>

                            <button
                                onClick={applyBulkRotation}
                                disabled={selected.size === 0}
                                className={`w-full py-3 rounded-xl font-black text-sm transition-all flex items-center justify-center gap-2
                                ${selected.size === 0
                                        ? 'bg-gray-100 dark:bg-white/5 text-gray-400 cursor-not-allowed'
                                        : 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/30 hover:-translate-y-0.5 active:translate-y-0'}`}
                            >
                                <Layers className="w-4 h-4" />
                                {selected.size > 0
                                    ? `Apply to ${selected.size} Page${selected.size !== 1 ? 's' : ''}`
                                    : 'Select pages first'}
                            </button>

                            <p className="text-[10px] text-gray-400 mt-2 text-center">
                                Or hover a page card for per-page controls
                            </p>
                        </div>
                    )}

                    {/* Range input */}
                    {file && totalPages > 0 && (
                        <div className="p-5 border-b border-gray-100 dark:border-white/5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Select by Range</p>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={rangeInput}
                                    onChange={e => setRangeInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && applyRange()}
                                    placeholder="e.g. 1,3-7,10"
                                    className="flex-1 font-mono text-xs px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-violet-400 outline-none dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600"
                                />
                                <button onClick={applyRange}
                                    className="px-3 py-2 text-xs font-bold text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-500/30 rounded-xl hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors shrink-0">
                                    Select
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Undo history */}
                    {undoStack.length > 0 && (
                        <div className="p-5 border-b border-gray-100 dark:border-white/5">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">History</p>
                                <button onClick={undo}
                                    className="flex items-center gap-1 text-[10px] font-bold text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">
                                    <RotateCcw className="w-2.5 h-2.5" /> Undo
                                </button>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-gray-400 px-2 py-1 rounded-lg bg-gray-50 dark:bg-white/5">
                                <RotateCcw className="w-2.5 h-2.5 shrink-0" />
                                <span>{undoStack.length} state{undoStack.length !== 1 ? 's' : ''} in undo stack</span>
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
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">
                                                Output Filename
                                            </label>
                                            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl focus-within:ring-2 focus-within:ring-violet-400 transition-all">
                                                <FileDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                                <input type="text" value={outputPrefix}
                                                    onChange={e => setOutputPrefix(e.target.value)}
                                                    placeholder="document"
                                                    className="flex-1 bg-transparent text-sm font-bold dark:text-gray-200 outline-none placeholder-gray-300 dark:placeholder-gray-600" />
                                            </div>
                                            <p className="text-[10px] text-gray-400 mt-1 font-mono">
                                                → {sanitize(outputPrefix || 'document')}_rotated.pdf
                                            </p>
                                        </div>

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
                        <button
                            onClick={handleApply}
                            disabled={!file || isProcessing || rotatedCount === 0 || loadingFile}
                            className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-sm transition-all duration-200 shadow-lg
                            ${!file || rotatedCount === 0 || loadingFile
                                    ? 'bg-gray-200 dark:bg-white/5 text-gray-400 cursor-not-allowed shadow-none'
                                    : 'bg-gradient-to-r from-violet-600 to-purple-500 hover:from-violet-500 hover:to-purple-400 text-white shadow-violet-500/30 hover:-translate-y-0.5 active:translate-y-0'}`}
                        >
                            {isProcessing
                                ? <><Loader2 className="w-5 h-5 animate-spin" /> Rotating…</>
                                : <><RotateCw className="w-5 h-5" />
                                    {rotatedCount > 0
                                        ? `Apply ${rotatedCount} Rotation${rotatedCount !== 1 ? 's' : ''}`
                                        : 'Rotate Pages to Apply'}</>
                            }
                        </button>

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

                        {!file && <p className="text-center text-[10px] text-gray-400">Upload a PDF to begin</p>}
                        {file && rotatedCount === 0 && !loadingFile && (
                            <p className="text-center text-[10px] text-gray-500 dark:text-gray-400">
                                Hover a page and use CW/CCW, or select & bulk-apply
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
