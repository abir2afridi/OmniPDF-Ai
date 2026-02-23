/**
 * PDFToJPG — Production-ready PDF → Image conversion module.
 *
 * Unique features:
 * - Live thumbnail grid: every page renders as a small preview card
 * - Per-page checkbox selection with range select (Shift+click)
 * - Quality dial: Low / Medium / High / Maximum
 * - Format toggle: JPEG / PNG / WebP
 * - Individual page download or ZIP bundle (all selected)
 * - Streaming: pages appear in the grid as they finish, no waiting for all
 * - Batch: multiple PDFs, each with their own page grid
 * - Stats bar: total pages, selected, done, file size estimate
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    FileImage, Upload, X, Download, Loader2, CheckCircle2,
    AlertCircle, Info, ArrowLeft, ChevronDown, ChevronUp,
    Settings2, Trash2, Package, ZoomIn, ZoomOut,
    LayoutGrid, SlidersHorizontal, RefreshCw, Image,
} from 'lucide-react';
import {
    convertPdfToImages, getPdfPageMeta, validatePdfForImage, packPagesToZip,
    PDF_MAX_FILE_MB, QUALITY_SCALE,
    type ConvertedPage, type PdfPageMeta, type JpgQualityPreset, type ImageFormat,
} from '../services/pdfToJpgService';
import { downloadBlob } from '../services/pdfService';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Toast {
    id: string;
    type: 'success' | 'error' | 'info';
    message: string;
}

type FileStatus = 'idle' | 'loading-meta' | 'ready' | 'converting' | 'done' | 'error';

interface ManagedFile {
    id: string;
    file: File;
    status: FileStatus;
    progress: number;
    /** Loaded page thumbnails & dimensions */
    meta: PdfPageMeta[];
    /** Pages selected for conversion */
    selectedPages: Set<number>;
    /** Completed image results streamed in page by page */
    convertedPages: ConvertedPage[];
    /** Last-clicked page index for shift-select */
    lastClicked: number | null;
    errorMsg?: string;
    outputPrefix: string;
}

interface PDFToJPGProps {
    onBack?: () => void;
}

// ── Utilities ──────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 10);
const fmt = (b: number) => {
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(2)} MB`;
};

const ACCEPT = '.pdf,application/pdf';

// ── Toast component ────────────────────────────────────────────────────────────

const ToastItem = ({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) => (
    <motion.div layout initial={{ opacity: 0, x: 60, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 60, scale: 0.9 }}
        className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-xl max-w-sm text-sm font-medium border backdrop-blur-md pointer-events-auto
      ${toast.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/60 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
                : toast.type === 'error' ? 'bg-red-50 dark:bg-red-900/60 border-red-200 dark:border-red-500/30 text-red-800 dark:text-red-200'
                    : 'bg-sky-50 dark:bg-sky-900/60 border-sky-200 dark:border-sky-500/30 text-sky-800 dark:text-sky-200'}`}>
        {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
        {toast.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
        {toast.type === 'info' && <Info className="w-4 h-4 shrink-0 mt-0.5" />}
        <span className="flex-1 leading-snug">{toast.message}</span>
        <button onClick={onDismiss} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
            <X className="w-3.5 h-3.5" />
        </button>
    </motion.div>
);

// ── Circular progress ──────────────────────────────────────────────────────────

const CircularProgress = ({ value }: { value: number }) => {
    const r = 15; const circ = 2 * Math.PI * r;
    return (
        <svg width={38} height={38} className="-rotate-90">
            <circle cx={19} cy={19} r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-gray-200 dark:text-white/10" />
            <circle cx={19} cy={19} r={r} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
                className="text-yellow-500" strokeDasharray={circ} strokeDashoffset={circ - (circ * value) / 100}
                style={{ transition: 'stroke-dashoffset 0.3s ease' }} />
        </svg>
    );
};

// ── Page Thumbnail Card ────────────────────────────────────────────────────────

interface PageCardProps {
    meta: PdfPageMeta;
    selected: boolean;
    converted?: ConvertedPage;
    onToggle: (e: React.MouseEvent) => void;
    onDownload?: () => void;
}

const PageCard: React.FC<PageCardProps> = ({ meta, selected, converted, onToggle, onDownload }) => (
    <motion.div
        layout
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`relative group cursor-pointer rounded-xl overflow-hidden border-2 transition-all duration-150 select-none
      ${selected
                ? 'border-yellow-500 shadow-lg shadow-yellow-500/20 scale-[1.02]'
                : 'border-gray-200 dark:border-white/10 hover:border-yellow-400 dark:hover:border-yellow-500/50'}`}
        onClick={onToggle}
    >
        {/* Thumbnail */}
        <div className="relative bg-gray-100 dark:bg-white/5" style={{ aspectRatio: `${meta.width}/${meta.height}` }}>
            <img
                src={converted ? converted.dataUrl : meta.thumbnail}
                alt={`Page ${meta.pageNumber}`}
                className="w-full h-full object-contain"
                draggable={false}
            />

            {/* Converted overlay badge */}
            {converted && (
                <div className="absolute top-1.5 right-1.5 bg-emerald-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full shadow">
                    DONE
                </div>
            )}

            {/* Download on hover (only when converted) */}
            {converted && onDownload && (
                <button
                    onClick={e => { e.stopPropagation(); onDownload(); }}
                    className="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 hover:bg-black/90 text-white p-1 rounded-lg"
                    title="Download this page"
                >
                    <Download className="w-3 h-3" />
                </button>
            )}

            {/* Selection indicator */}
            <div className={`absolute top-1.5 left-1.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all
        ${selected
                    ? 'bg-yellow-500 border-yellow-500 shadow-md'
                    : 'bg-white/80 dark:bg-black/60 border-gray-300 dark:border-white/30 opacity-0 group-hover:opacity-100'}`}>
                {selected && <CheckCircle2 className="w-3 h-3 text-white" />}
            </div>
        </div>

        {/* Page label */}
        <div className={`px-2 py-1 text-center text-[10px] font-bold transition-colors
      ${selected ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300'
                : 'bg-white dark:bg-[#1e1e2e] text-gray-500 dark:text-gray-400'}`}>
            {meta.pageNumber}
            {converted && (
                <span className="ml-1 text-[8px] text-gray-400">{fmt(converted.size)}</span>
            )}
        </div>
    </motion.div>
);

// ── File section ───────────────────────────────────────────────────────────────

interface FileSectionProps {
    entry: ManagedFile;
    thumbSize: number;
    onRemove: () => void;
    onConvert: () => void;
    onDownloadAll: () => void;
    onDownloadPage: (page: ConvertedPage) => void;
    onTogglePage: (pageNum: number, e: React.MouseEvent) => void;
    onSelectAll: () => void;
    onClearAll: () => void;
    onRename: (n: string) => void;
    format: ImageFormat;
    quality: JpgQualityPreset;
    isAnyConverting: boolean;
}

const FileSection: React.FC<FileSectionProps> = ({
    entry, thumbSize, onRemove, onConvert, onDownloadAll, onDownloadPage,
    onTogglePage, onSelectAll, onClearAll, onRename,
    format, quality, isAnyConverting,
}) => {
    const { file, status, progress, meta, selectedPages, convertedPages, outputPrefix, errorMsg } = entry;
    const doneMap = new Map(convertedPages.map(p => [p.pageNumber, p]));

    const ext = format === 'png' ? 'PNG' : format === 'webp' ? 'WebP' : 'JPG';

    return (
        <div className="bg-white dark:bg-[#262636] rounded-2xl border border-gray-100 dark:border-white/5 overflow-hidden">

            {/* Header */}
            <div className="flex items-center gap-3 p-4">
                <div className="shrink-0 w-10 h-10 flex items-center justify-center">
                    {status === 'converting' ? <CircularProgress value={progress} />
                        : status === 'loading-meta' ? <Loader2 className="w-7 h-7 text-yellow-500 animate-spin" />
                            : <div className={`w-10 h-10 rounded-xl flex items-center justify-center
              ${status === 'done' ? 'bg-emerald-100 dark:bg-emerald-900/30'
                                    : status === 'error' ? 'bg-red-100 dark:bg-red-900/30'
                                        : 'bg-yellow-100 dark:bg-yellow-900/30'}`}>
                                {status === 'done' ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                    : status === 'error' ? <AlertCircle className="w-5 h-5 text-red-500" />
                                        : <FileImage className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />}
                            </div>}
                </div>

                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold dark:text-white truncate">{file.name}</p>
                    <p className="text-[11px] text-gray-400 font-mono flex flex-wrap items-center gap-1.5">
                        <span>{fmt(file.size)}</span>
                        {status === 'loading-meta' && <span className="text-yellow-500">· Loading pages…</span>}
                        {status === 'ready' && meta.length > 0 && (
                            <span className="text-yellow-600 dark:text-yellow-400">· {meta.length} page{meta.length !== 1 ? 's' : ''}</span>
                        )}
                        {status === 'converting' && <span className="text-blue-500">· {progress}% — {convertedPages.length}/{selectedPages.size} pages</span>}
                        {status === 'done' && (
                            <span className="text-emerald-500">
                                · {convertedPages.length} {ext}s done · {fmt(convertedPages.reduce((s, p) => s + p.size, 0))} total
                            </span>
                        )}
                        {status === 'error' && <span className="text-red-500">· Failed</span>}
                    </p>
                    {status === 'error' && errorMsg && (
                        <p className="text-[10px] text-red-400 mt-0.5 leading-relaxed">{errorMsg}</p>
                    )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {(status === 'done' || (status === 'converting' && convertedPages.length > 0)) && (
                        <button onClick={onDownloadAll}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-colors">
                            <Package className="w-3.5 h-3.5" /> ZIP
                        </button>
                    )}
                    {(status === 'ready' || status === 'error') && (
                        <button onClick={onConvert}
                            disabled={isAnyConverting || selectedPages.size === 0}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-colors
                ${(isAnyConverting || selectedPages.size === 0)
                                    ? 'bg-gray-100 dark:bg-white/5 text-gray-400 cursor-not-allowed'
                                    : 'bg-yellow-500 hover:bg-yellow-400 text-white'}`}>
                            {status === 'error'
                                ? <><RefreshCw className="w-3.5 h-3.5" /> Retry</>
                                : <><Image className="w-3.5 h-3.5" /> Convert</>}
                        </button>
                    )}
                    {status === 'converting' && (
                        <span className="text-xs text-yellow-500 font-bold flex items-center gap-1.5">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Rendering…
                        </span>
                    )}
                    <button onClick={onRemove} className="p-2 text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Progress bar */}
            {status === 'converting' && (
                <div className="h-0.5 bg-gray-100 dark:bg-white/5">
                    <motion.div className="h-full bg-gradient-to-r from-yellow-400 to-amber-500"
                        animate={{ width: `${progress}%` }} transition={{ duration: 0.3, ease: 'easeOut' }} />
                </div>
            )}

            {/* Page grid */}
            {meta.length > 0 && status !== 'idle' && (
                <div className="px-4 pb-4 border-t border-gray-50 dark:border-white/5 pt-3">
                    {(status === 'ready' || status === 'error') && (
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                                {selectedPages.size}/{meta.length} pages selected
                            </span>
                            <div className="flex gap-2">
                                <button onClick={onSelectAll}
                                    className="text-[10px] font-bold text-yellow-600 dark:text-yellow-400 hover:underline">All</button>
                                <span className="text-gray-300">·</span>
                                <button onClick={onClearAll}
                                    className="text-[10px] font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">None</button>
                            </div>
                        </div>
                    )}

                    {/* Thumbnail grid */}
                    <div
                        className="grid gap-2"
                        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbSize}px, 1fr))` }}
                    >
                        {meta.map(pg => (
                            <PageCard
                                key={pg.pageNumber}
                                meta={pg}
                                selected={(status === 'ready' || status === 'error') ? selectedPages.has(pg.pageNumber) : true}
                                converted={doneMap.get(pg.pageNumber)}
                                onToggle={(e) => (status === 'ready' || status === 'error') && onTogglePage(pg.pageNumber, e)}
                                onDownload={doneMap.has(pg.pageNumber) ? () => onDownloadPage(doneMap.get(pg.pageNumber)!) : undefined}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Rename + quality reminder when done */}
            {(status === 'done' || status === 'converting') && (
                <div className="px-4 pb-4 pt-1">
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl focus-within:ring-2 focus-within:ring-yellow-400 transition-all">
                        <FileImage className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <input
                            type="text"
                            value={outputPrefix}
                            onChange={e => onRename(e.target.value)}
                            className="flex-1 bg-transparent text-xs font-mono dark:text-gray-200 outline-none"
                            placeholder="output-prefix"
                        />
                        <span className="text-[10px] text-gray-400">{`_page001.${format === 'jpeg' ? 'jpg' : format}`}</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1.5 ml-1">
                        Quality: <strong className="text-yellow-600 dark:text-yellow-400">{quality}</strong>
                        {' · '}Scale: <strong>{QUALITY_SCALE[quality]}×</strong>
                        {' · '}Format: <strong>{ext}</strong>
                    </p>
                </div>
            )}
        </div>
    );
};

// ── Main Component ─────────────────────────────────────────────────────────────

export const PDFToJPG: React.FC<PDFToJPGProps> = ({ onBack }) => {
    const [files, setFiles] = useState<ManagedFile[]>([]);
    const [isDragOver, setIsDragOver] = useState(false);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [thumbSize, setThumbSize] = useState(100); // px

    // Output settings
    const [quality, setQuality] = useState<JpgQualityPreset>('high');
    const [format, setFormat] = useState<ImageFormat>('jpeg');

    const dropRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // ── Toasts
    const toast = useCallback((type: Toast['type'], message: string) => {
        const id = uid();
        setToasts(prev => [...prev.slice(-4), { id, type, message }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000);
    }, []);
    const dismissToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

    // ── Add files
    const addFiles = useCallback(async (incoming: FileList | File[]) => {
        const arr = Array.from(incoming);
        const validFiles: ManagedFile[] = [];

        for (const f of arr) {
            const err = validatePdfForImage(f);
            if (err) { toast('error', err); continue; }
            validFiles.push({
                id: uid(), file: f, status: 'loading-meta', progress: 0,
                meta: [], selectedPages: new Set(),
                convertedPages: [], lastClicked: null,
                outputPrefix: f.name.replace(/\.pdf$/i, ''),
            });
        }
        if (validFiles.length === 0) return;
        setFiles(prev => [...prev, ...validFiles]);

        // Load page meta for each file concurrently
        await Promise.all(validFiles.map(async entry => {
            try {
                const meta = await getPdfPageMeta(entry.file);
                setFiles(prev => prev.map(f => f.id === entry.id
                    ? { ...f, status: 'ready', meta, selectedPages: new Set(meta.map(p => p.pageNumber)) }
                    : f));
                toast('info', `"${entry.file.name}" — ${meta.length} pages loaded.`);
            } catch (err: any) {
                setFiles(prev => prev.map(f => f.id === entry.id
                    ? { ...f, status: 'error', errorMsg: err?.message || 'Cannot read PDF' }
                    : f));
                toast('error', `"${entry.file.name}" — ${err?.message}`);
            }
        }));
    }, [toast]);

    // ── Drag-and-drop
    const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
    const onDragLeave = (e: React.DragEvent) => {
        if (!dropRef.current?.contains(e.relatedTarget as Node)) setIsDragOver(false);
    };
    const onDrop = (e: React.DragEvent) => {
        e.preventDefault(); setIsDragOver(false); addFiles(e.dataTransfer.files);
    };

    // ── Page toggle with shift-select
    const togglePage = useCallback((fileId: string, pageNum: number, e: React.MouseEvent) => {
        setFiles(prev => prev.map(f => {
            if (f.id !== fileId) return f;
            const next = new Set(f.selectedPages);

            if (e.shiftKey && f.lastClicked !== null && f.meta.length > 0) {
                const sorted = f.meta.map(m => m.pageNumber).sort((a, b) => a - b);
                const fromIdx = sorted.indexOf(f.lastClicked);
                const toIdx = sorted.indexOf(pageNum);
                const [lo, hi] = [Math.min(fromIdx, toIdx), Math.max(fromIdx, toIdx)];
                const isAdding = !next.has(pageNum);
                for (let i = lo; i <= hi; i++) {
                    if (isAdding) next.add(sorted[i]); else next.delete(sorted[i]);
                }
            } else {
                if (next.has(pageNum)) next.delete(pageNum); else next.add(pageNum);
            }
            return { ...f, selectedPages: next, lastClicked: pageNum };
        }));
    }, []);

    // ── Convert single file
    const convertOne = useCallback(async (id: string) => {
        const entry = files.find(f => f.id === id);
        if (!entry) return;

        setFiles(prev => prev.map(f => f.id === id
            ? { ...f, status: 'converting', progress: 0, convertedPages: [], errorMsg: undefined }
            : f));

        try {
            await convertPdfToImages(entry.file, {
                pageNumbers: Array.from(entry.selectedPages),
                quality,
                format,
                outputPrefix: entry.outputPrefix,
                onProgress: p => setFiles(prev => prev.map(f => f.id === id ? { ...f, progress: p } : f)),
                onPageDone: (page) => {
                    setFiles(prev => prev.map(f => f.id === id
                        ? { ...f, convertedPages: [...f.convertedPages, page] }
                        : f));
                },
            });
            setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'done', progress: 100 } : f));
            toast('success', `✅ "${entry.file.name}" converted to ${entry.selectedPages.size} ${format.toUpperCase()}.`);
        } catch (err: any) {
            const msg = err?.message || 'Conversion failed.';
            setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'error', progress: 0, errorMsg: msg } : f));
            toast('error', `"${entry.file.name}" — ${msg}`);
        }
    }, [files, quality, format, toast]);

    // ── Batch convert
    const isAnyConverting = files.some(f => f.status === 'converting' || f.status === 'loading-meta');
    const convertAll = useCallback(async () => {
        const ready = files.filter(f => f.status === 'ready' || f.status === 'error');
        if (ready.length === 0) { toast('info', 'No files ready to convert.'); return; }
        for (const f of ready) await convertOne(f.id);
    }, [files, convertOne, toast]);

    // ── Download one page
    const downloadPage = useCallback((entry: ManagedFile, page: ConvertedPage) => {
        const ext = format === 'png' ? 'png' : format === 'webp' ? 'webp' : 'jpg';
        const name = `${entry.outputPrefix}_page${String(page.pageNumber).padStart(3, '0')}.${ext}`;
        downloadBlob(page.blob, name);
    }, [format]);

    // ── Download all pages from one file as ZIP
    const downloadZip = useCallback(async (entry: ManagedFile) => {
        if (entry.convertedPages.length === 0) { toast('info', 'No converted pages yet.'); return; }
        try {
            const blob = await packPagesToZip(entry.convertedPages, entry.outputPrefix, format);
            downloadBlob(blob, `${entry.outputPrefix}.zip`);
            toast('success', `Downloaded ${entry.convertedPages.length} images as ZIP.`);
        } catch (err: any) {
            toast('error', `ZIP failed: ${err?.message}`);
        }
    }, [format, toast]);

    // ── Download all done files as one giant ZIP
    const downloadAllZip = useCallback(async () => {
        const done = files.filter(f => f.convertedPages.length > 0);
        if (done.length === 0) { toast('info', 'No converted images to bundle.'); return; }
        try {
            const JSZip = (await import('jszip')).default;
            const rootZip = new JSZip();
            const ext = format === 'png' ? 'png' : format === 'webp' ? 'webp' : 'jpg';
            for (const entry of done) {
                const folder = rootZip.folder(entry.outputPrefix) ?? rootZip;
                for (const page of entry.convertedPages) {
                    folder.file(`${entry.outputPrefix}_page${String(page.pageNumber).padStart(3, '0')}.${ext}`, page.blob);
                }
            }
            const blob = await rootZip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 4 } });
            downloadBlob(blob, 'pdf-to-images-bundle.zip');
            toast('success', `Downloaded ${done.reduce((s, f) => s + f.convertedPages.length, 0)} images from ${done.length} PDFs.`);
        } catch (err: any) {
            toast('error', `Bundle failed: ${err?.message}`);
        }
    }, [files, format, toast]);

    const removeFile = (id: string) => setFiles(prev => prev.filter(f => f.id !== id));
    const clearAll = () => setFiles([]);
    const renameFile = (id: string, name: string) =>
        setFiles(prev => prev.map(f => f.id === id ? { ...f, outputPrefix: name } : f));
    const selectAllPages = (id: string) =>
        setFiles(prev => prev.map(f => f.id === id
            ? { ...f, selectedPages: new Set(f.meta.map(m => m.pageNumber)) } : f));
    const clearPages = (id: string) =>
        setFiles(prev => prev.map(f => f.id === id ? { ...f, selectedPages: new Set() } : f));

    const doneCount = files.filter(f => f.status === 'done').length;
    const readyCount = files.filter(f => f.status === 'ready' || f.status === 'error').length;
    const totalConvertedImages = files.reduce((s, f) => s + f.convertedPages.length, 0);

    // ── Render
    return (
        <div className="flex-1 flex flex-col h-full bg-gray-50 dark:bg-[#1e1e2e] overflow-hidden relative">

            {/* Toasts */}
            <div className="fixed top-6 right-6 z-[200] flex flex-col gap-2 items-end pointer-events-none">
                <AnimatePresence>
                    {toasts.map(t => (
                        <div key={t.id} className="pointer-events-auto">
                            <ToastItem toast={t} onDismiss={() => dismissToast(t.id)} />
                        </div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-6 py-4 bg-white dark:bg-[#262636] border-b border-gray-100 dark:border-white/5 shadow-sm">
                <div className="flex items-center gap-3">
                    {onBack && (
                        <button onClick={onBack} className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-colors text-gray-500 dark:text-gray-400">
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}
                    <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-xl">
                        <FileImage className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                    </div>
                    <div>
                        <h1 className="text-lg font-black dark:text-white tracking-tight">PDF to JPG</h1>
                        <p className="text-[11px] text-gray-400 font-medium">
                            Convert PDF pages to high-quality images — select pages, set quality
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {totalConvertedImages > 0 && (
                        <button onClick={downloadAllZip}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl transition-colors">
                            <Package className="w-3.5 h-3.5" /> Bundle All ({totalConvertedImages})
                        </button>
                    )}
                    {files.length > 0 && (
                        <button onClick={clearAll} className="px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors flex items-center gap-1.5">
                            <Trash2 className="w-3.5 h-3.5" /> Clear All
                        </button>
                    )}
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 flex overflow-hidden">

                {/* LEFT: drop zone + file sections */}
                <div className="flex-1 flex flex-col overflow-hidden p-4 lg:p-6 gap-4 min-w-0">

                    {/* Drop Zone */}
                    <div ref={dropRef} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                        onClick={() => inputRef.current?.click()}
                        className={`shrink-0 flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl py-10 cursor-pointer transition-all duration-200
              ${isDragOver ? 'border-yellow-500 bg-yellow-500/5 scale-[0.99]' : 'border-gray-200 dark:border-white/10 bg-white dark:bg-[#262636]'}
              hover:border-yellow-400 dark:hover:border-yellow-500/50 hover:bg-yellow-50/30 dark:hover:bg-yellow-900/10`}>
                        <input ref={inputRef} type="file" accept={ACCEPT} multiple className="hidden"
                            onChange={e => e.target.files && addFiles(e.target.files)} />

                        <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                            className="p-4 bg-yellow-100 dark:bg-yellow-900/30 rounded-2xl shadow-lg shadow-yellow-200 dark:shadow-yellow-900/30">
                            <Upload className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />
                        </motion.div>
                        <div className="text-center">
                            <p className="text-base font-black dark:text-white">Drop PDF files here</p>
                            <p className="text-sm text-gray-400 mt-0.5">
                                or <span className="text-yellow-500 font-bold underline underline-offset-2">click to browse</span>
                            </p>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-gray-300 dark:text-gray-600">
                            <span>.pdf</span><span>·</span><span>Max {PDF_MAX_FILE_MB} MB each</span><span>·</span><span>Shift+click for range select</span>
                        </div>
                    </div>

                    {/* File sections */}
                    <div className="flex-1 overflow-y-auto min-h-0">
                        <AnimatePresence mode="popLayout">
                            {files.length === 0 ? (
                                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                    className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
                                    <div className="p-5 bg-gray-100 dark:bg-white/5 rounded-2xl">
                                        <FileImage className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                                    </div>
                                    <p className="text-sm font-bold text-gray-400">No PDFs added yet</p>
                                    <p className="text-xs text-gray-300 dark:text-gray-600 max-w-xs leading-relaxed">
                                        Upload one or more PDFs. Each page will appear as a thumbnail you can click to select, then convert to JPG, PNG, or WebP.
                                    </p>
                                </motion.div>
                            ) : (
                                <div className="flex flex-col gap-4">
                                    {files.map(entry => (
                                        <motion.div key={entry.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }}>
                                            <FileSection
                                                entry={entry}
                                                thumbSize={thumbSize}
                                                onRemove={() => removeFile(entry.id)}
                                                onConvert={() => convertOne(entry.id)}
                                                onDownloadAll={() => downloadZip(entry)}
                                                onDownloadPage={(page) => downloadPage(entry, page)}
                                                onTogglePage={(pageNum, e) => togglePage(entry.id, pageNum, e)}
                                                onSelectAll={() => selectAllPages(entry.id)}
                                                onClearAll={() => clearPages(entry.id)}
                                                onRename={name => renameFile(entry.id, name)}
                                                format={format}
                                                quality={quality}
                                                isAnyConverting={isAnyConverting}
                                            />
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* RIGHT: Control panel */}
                <div className="w-80 shrink-0 flex flex-col border-l border-gray-100 dark:border-white/5 bg-white dark:bg-[#262636] overflow-y-auto">

                    {/* Thumb size slider */}
                    {files.some(f => f.meta.length > 0) && (
                        <div className="p-5 border-b border-gray-100 dark:border-white/5">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                                    <LayoutGrid className="w-3 h-3" /> Thumbnail Size
                                </p>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => setThumbSize(s => Math.max(60, s - 20))} className="p-1 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors">
                                        <ZoomOut className="w-3.5 h-3.5 text-gray-400" />
                                    </button>
                                    <span className="text-[10px] font-mono text-gray-400 w-10 text-center">{thumbSize}px</span>
                                    <button onClick={() => setThumbSize(s => Math.min(240, s + 20))} className="p-1 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors">
                                        <ZoomIn className="w-3.5 h-3.5 text-gray-400" />
                                    </button>
                                </div>
                            </div>
                            <input type="range" min={60} max={240} step={20} value={thumbSize}
                                onChange={e => setThumbSize(Number(e.target.value))}
                                className="w-full accent-yellow-500" />
                        </div>
                    )}

                    {/* Queue stats */}
                    {files.length > 0 && (
                        <div className="p-5 border-b border-gray-100 dark:border-white/5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Queue</p>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { label: 'Files', value: files.length, color: 'text-gray-700 dark:text-gray-200' },
                                    { label: 'Pages In', value: files.reduce((s, f) => s + f.selectedPages.size, 0), color: 'text-yellow-600 dark:text-yellow-400' },
                                    { label: 'Images', value: totalConvertedImages, color: 'text-emerald-600 dark:text-emerald-400' },
                                    { label: 'Errors', value: files.filter(f => f.status === 'error').length, color: 'text-red-500' },
                                ].map(s => (
                                    <div key={s.label} className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 text-center">
                                        <p className={`text-base font-black ${s.color}`}>{s.value}</p>
                                        <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mt-0.5">{s.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Output Settings */}
                    <div className="border-b border-gray-100 dark:border-white/5">
                        <button onClick={() => setAdvancedOpen(v => !v)}
                            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                            <span className="flex items-center gap-2 text-xs font-bold text-gray-600 dark:text-gray-300">
                                <Settings2 className="w-3.5 h-3.5" /> Output Settings
                            </span>
                            {advancedOpen ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                        </button>

                        <AnimatePresence>
                            {advancedOpen && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                    <div className="px-5 pb-5 space-y-5">

                                        {/* Image Format */}
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Image Format</p>
                                            <div className="grid grid-cols-3 gap-1.5">
                                                {([
                                                    { v: 'jpeg', label: 'JPG', note: 'Smallest' },
                                                    { v: 'png', label: 'PNG', note: 'Lossless' },
                                                    { v: 'webp', label: 'WebP', note: 'Modern' },
                                                ] as const).map(f => (
                                                    <button key={f.v} onClick={() => setFormat(f.v)}
                                                        className={`py-2 px-1 flex flex-col items-center text-[10px] font-bold rounded-xl border-2 transition-all
                              ${format === f.v ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                                                                : 'border-gray-100 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-yellow-200'}`}>
                                                        <span className="text-xs font-black">{f.label}</span>
                                                        <span className="text-[8px] opacity-60 mt-0.5">{f.note}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Quality */}
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Quality / Resolution</p>
                                            <div className="grid grid-cols-2 gap-1.5">
                                                {([
                                                    { v: 'low', label: 'Low', note: '96 dpi' },
                                                    { v: 'medium', label: 'Medium', note: '144 dpi' },
                                                    { v: 'high', label: 'High', note: '192 dpi' },
                                                    { v: 'maximum', label: 'Max', note: '288 dpi' },
                                                ] as const).map(q => (
                                                    <button key={q.v} onClick={() => setQuality(q.v)}
                                                        className={`py-2 flex flex-col items-center text-[10px] font-bold rounded-xl border-2 transition-all
                              ${quality === q.v ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                                                                : 'border-gray-100 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-yellow-200'}`}>
                                                        <span className="font-black text-xs">{q.label}</span>
                                                        <span className="opacity-60 text-[8px] mt-0.5">{q.note}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Privacy badge */}
                                        <div className="flex items-start gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-500/20 rounded-xl">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                                            <p className="text-[10px] text-emerald-700 dark:text-emerald-300 leading-relaxed">
                                                Rendered <strong>entirely in your browser</strong>. No server upload.
                                            </p>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Tips */}
                    <div className="p-5 border-b border-gray-100 dark:border-white/5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-1.5">
                            <SlidersHorizontal className="w-3 h-3" /> Tips
                        </p>
                        <ul className="space-y-2">
                            {[
                                'Click thumbnails to select/deselect pages',
                                'Shift+click for range selection',
                                'Max quality = highest DPI, largest file',
                                'PNG is lossless — best for text-heavy PDFs',
                                'JPG is fastest and smallest',
                                'WebP is recommended for web use',
                                'Individual page download via hover button',
                                'ZIP bundles all selected-page images',
                            ].map((tip, i) => (
                                <li key={i} className="flex items-start gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                                    <span className="w-4 h-4 shrink-0 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 text-[8px] font-black flex items-center justify-center mt-0.5">
                                        {i + 1}
                                    </span>
                                    {tip}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="flex-1" />

                    {/* Action Buttons */}
                    <div className="p-5 border-t border-gray-100 dark:border-white/5 bg-white/80 dark:bg-[#262636]/80 backdrop-blur-sm space-y-3">
                        <button
                            onClick={convertAll}
                            disabled={readyCount === 0 || isAnyConverting}
                            className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-sm transition-all shadow-lg
                ${readyCount === 0 || isAnyConverting
                                    ? 'bg-gray-200 dark:bg-white/5 text-gray-400 cursor-not-allowed shadow-none'
                                    : 'bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-white shadow-yellow-500/30 hover:-translate-y-0.5 active:translate-y-0'}`}>
                            {isAnyConverting
                                ? <><Loader2 className="w-5 h-5 animate-spin" /> Converting…</>
                                : <><FileImage className="w-5 h-5" />
                                    {files.length === 0 ? 'Add PDF files first'
                                        : readyCount === 0 ? 'No files to convert'
                                            : `Convert ${readyCount} PDF${readyCount !== 1 ? 's' : ''}`}</>
                            }
                        </button>

                        <AnimatePresence>
                            {totalConvertedImages > 0 && (
                                <motion.button initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                                    onClick={downloadAllZip}
                                    className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl font-black text-sm bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-lg shadow-emerald-500/30 hover:-translate-y-0.5 active:translate-y-0 transition-all">
                                    <Package className="w-5 h-5" /> Download All {totalConvertedImages} Images
                                </motion.button>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </div>
    );
};
