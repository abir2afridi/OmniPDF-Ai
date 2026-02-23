/**
 * PowerPointToPDF — Production-ready PPT → PDF conversion module.
 *
 * Unique features vs. Word/Excel modules:
 * - Slide selector UI with thumbnails (title + slide #)
 * - Per-slide selection: toggle individual slides or all/none
 * - Widescreen layout awareness (16:9 default)
 * - Legacy .ppt detection with helpful user guidance
 * - Stats: total slides, selected, pages in output
 */

import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    Presentation, Upload, X, Download, Loader2, CheckCircle2,
    AlertCircle, Info, ArrowLeft, ChevronDown, ChevronUp,
    Settings2, FileDown, Trash2, RotateCw, Package,
    Play, Layers, SlidersHorizontal, Film,
} from 'lucide-react';
import {
    convertPptToPDF, getPresentationSlides, validatePptFile, PPT_MAX_FILE_MB,
    type SlideInfo, type PptConversionResult,
} from '../services/pptService';
import { downloadBytes } from '../services/pdfService';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Toast {
    id: string;
    type: 'success' | 'error' | 'info';
    message: string;
}

type FileStatus = 'idle' | 'loading-slides' | 'ready' | 'converting' | 'done' | 'error';

interface ManagedFile {
    id: string;
    file: File;
    status: FileStatus;
    progress: number;
    slides: SlideInfo[];
    selectedSlides: Set<number>;
    result?: PptConversionResult;
    errorMsg?: string;
    customName: string;
}

interface PowerPointToPDFProps {
    onBack?: () => void;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 10);
const fmt = (b: number) => {
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(2)} MB`;
};
const ACCEPT = '.ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation';

// Slide card color palette (cycles)
const SLIDE_COLORS = [
    'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-500/40',
    'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-500/40',
    'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-500/40',
    'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-500/40',
    'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 border-pink-300 dark:border-pink-500/40',
    'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-500/40',
];

// ── Sub-components ─────────────────────────────────────────────────────────────

const ToastItem = ({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) => (
    <motion.div layout initial={{ opacity: 0, x: 60, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 60, scale: 0.9 }}
        className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-xl max-w-sm text-sm font-medium border backdrop-blur-md pointer-events-auto
      ${toast.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/60 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
                : toast.type === 'error' ? 'bg-red-50 dark:bg-red-900/60 border-red-200 dark:border-red-500/30 text-red-800 dark:text-red-200'
                    : 'bg-blue-50 dark:bg-blue-900/60 border-blue-200 dark:border-blue-500/30 text-blue-800 dark:text-blue-200'}`}>
        {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
        {toast.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
        {toast.type === 'info' && <Info className="w-4 h-4 shrink-0 mt-0.5" />}
        <span className="flex-1 leading-snug">{toast.message}</span>
        <button onClick={onDismiss} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
            <X className="w-3.5 h-3.5" />
        </button>
    </motion.div>
);

const CircularProgress = ({ value }: { value: number }) => {
    const r = 15; const circ = 2 * Math.PI * r;
    return (
        <svg width={38} height={38} className="-rotate-90">
            <circle cx={19} cy={19} r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-gray-200 dark:text-white/10" />
            <circle cx={19} cy={19} r={r} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
                className="text-orange-500" strokeDasharray={circ} strokeDashoffset={circ - (circ * value) / 100}
                style={{ transition: 'stroke-dashoffset 0.3s ease' }} />
        </svg>
    );
};

// ── Slide selector chip ────────────────────────────────────────────────────────

interface SlideChipProps {
    slide: SlideInfo;
    selected: boolean;
    onClick: () => void;
    colorClass: string;
}

const SlideChip: React.FC<SlideChipProps> = ({ slide, selected, onClick, colorClass }) => (
    <button
        onClick={onClick}
        title={slide.title}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[10px] font-bold transition-all
      ${selected
                ? colorClass
                : 'border-gray-200 dark:border-white/10 text-gray-400 dark:text-gray-500 hover:border-gray-300 bg-transparent'}`}
    >
        <Film className="w-3 h-3 shrink-0" />
        <span className="truncate max-w-[80px]">
            {slide.title.length > 14 ? slide.title.slice(0, 14) + '…' : slide.title}
        </span>
        <span className="opacity-60 shrink-0">#{slide.index + 1}</span>
    </button>
);

// ── File Card ──────────────────────────────────────────────────────────────────

interface FileCardProps {
    entry: ManagedFile;
    onRemove: () => void;
    onConvert: () => void;
    onDownload: () => void;
    onRename: (n: string) => void;
    onToggleSlide: (idx: number) => void;
    onSelectAll: () => void;
    onClearAll: () => void;
    isAnyConverting: boolean;
}

const FileCard: React.FC<FileCardProps> = ({
    entry, onRemove, onConvert, onDownload, onRename,
    onToggleSlide, onSelectAll, onClearAll, isAnyConverting,
}) => {
    const { file, status, progress, slides, selectedSlides, result, errorMsg, customName } = entry;

    return (
        <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -20, scale: 0.97 }}
            className="bg-white dark:bg-[#262636] rounded-2xl border border-gray-100 dark:border-white/5 overflow-hidden">

            {/* Header row */}
            <div className="flex items-center gap-3 p-4">
                {/* Icon */}
                <div className="shrink-0 w-10 h-10 flex items-center justify-center">
                    {status === 'converting' ? <CircularProgress value={progress} />
                        : status === 'loading-slides' ? <Loader2 className="w-7 h-7 text-orange-500 animate-spin" />
                            : <div className={`w-10 h-10 rounded-xl flex items-center justify-center
              ${status === 'done' ? 'bg-emerald-100 dark:bg-emerald-900/30'
                                    : status === 'error' ? 'bg-red-100 dark:bg-red-900/30'
                                        : 'bg-orange-100 dark:bg-orange-900/30'}`}>
                                {status === 'done' ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                    : status === 'error' ? <AlertCircle className="w-5 h-5 text-red-500" />
                                        : <Presentation className="w-5 h-5 text-orange-600 dark:text-orange-400" />}
                            </div>}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold dark:text-white truncate">{file.name}</p>
                    <p className="text-[11px] text-gray-400 font-mono flex items-center gap-1.5 flex-wrap">
                        <span>{fmt(file.size)}</span>
                        {status === 'ready' && slides.length > 0 && (
                            <span className="text-orange-600 dark:text-orange-400">· {slides.length} slide{slides.length !== 1 ? 's' : ''}</span>
                        )}
                        {status === 'converting' && <span className="text-blue-500">· {progress}%</span>}
                        {status === 'done' && result && (
                            <span className="text-emerald-500">
                                · {result.convertedSlides}/{result.totalSlides} slides · {result.pageCount} page{result.pageCount !== 1 ? 's' : ''} · {fmt(result.outputSize)}
                            </span>
                        )}
                        {status === 'error' && <span className="text-red-500">· Failed</span>}
                    </p>
                    {status === 'error' && errorMsg && (
                        <p className="text-[10px] text-red-400 mt-0.5 leading-relaxed">{errorMsg}</p>
                    )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                    {status === 'done' && (
                        <button onClick={onDownload}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-colors">
                            <Download className="w-3.5 h-3.5" /> PDF
                        </button>
                    )}
                    {(status === 'ready' || status === 'error') && (
                        <button onClick={onConvert} disabled={isAnyConverting || selectedSlides.size === 0}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-colors
                ${(isAnyConverting || selectedSlides.size === 0)
                                    ? 'bg-gray-100 dark:bg-white/5 text-gray-400 cursor-not-allowed'
                                    : 'bg-orange-600 hover:bg-orange-500 text-white'}`}>
                            {status === 'error'
                                ? <><RotateCw className="w-3.5 h-3.5" /> Retry</>
                                : <><Play className="w-3.5 h-3.5" /> Convert</>}
                        </button>
                    )}
                    {status === 'converting' && (
                        <span className="text-xs text-orange-500 font-bold flex items-center gap-1.5">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Converting…
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
                    <motion.div className="h-full bg-gradient-to-r from-orange-500 to-red-400"
                        animate={{ width: `${progress}%` }} transition={{ duration: 0.3, ease: 'easeOut' }} />
                </div>
            )}

            {/* Slide selector */}
            {(status === 'ready' || status === 'error') && slides.length > 0 && (
                <div className="px-4 pb-4 border-t border-gray-50 dark:border-white/5 pt-3">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                            Slides to Convert
                        </span>
                        <div className="flex items-center gap-2">
                            <button onClick={onSelectAll}
                                className="text-[10px] font-bold text-orange-600 dark:text-orange-400 hover:underline">All</button>
                            <span className="text-gray-300">·</span>
                            <button onClick={onClearAll}
                                className="text-[10px] font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">None</button>
                            <span className="text-[10px] text-gray-400 ml-1">({selectedSlides.size}/{slides.length})</span>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                        {slides.map((slide) => (
                            <SlideChip
                                key={slide.index}
                                slide={slide}
                                selected={selectedSlides.has(slide.index)}
                                onClick={() => onToggleSlide(slide.index)}
                                colorClass={SLIDE_COLORS[slide.index % SLIDE_COLORS.length]}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Rename field when done */}
            {status === 'done' && (
                <div className="px-4 pb-4 border-t border-gray-50 dark:border-white/5 pt-3">
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl focus-within:ring-2 focus-within:ring-orange-400 transition-all">
                        <FileDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <input type="text" value={customName} onChange={e => onRename(e.target.value)}
                            className="flex-1 bg-transparent text-xs font-mono dark:text-gray-200 outline-none" placeholder="output-filename" />
                        <span className="text-[10px] text-gray-400">.pdf</span>
                    </div>
                </div>
            )}
        </motion.div>
    );
};

// ── Main Component ─────────────────────────────────────────────────────────────

export const PowerPointToPDF: React.FC<PowerPointToPDFProps> = ({ onBack }) => {
    const [files, setFiles] = useState<ManagedFile[]>([]);
    const [isDragOver, setIsDragOver] = useState(false);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [advancedOpen, setAdvancedOpen] = useState(false);

    // Output settings
    const [pageFormat, setPageFormat] = useState<'a4' | 'letter' | 'legal'>('a4');
    const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('landscape');
    const [quality, setQuality] = useState<1 | 1.5 | 2>(1.5);

    const dropRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // ── Toasts
    const toast = useCallback((type: Toast['type'], message: string) => {
        const id = uid();
        setToasts(prev => [...prev.slice(-4), { id, type, message }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000);
    }, []);
    const dismissToast = useCallback((id: string) => setToasts(prev => prev.filter(t => t.id !== id)), []);

    // ── Add files
    const addFiles = useCallback(async (incoming: FileList | File[]) => {
        const arr = Array.from(incoming);
        const toAdd: ManagedFile[] = [];

        for (const f of arr) {
            const err = validatePptFile(f);
            if (err) { toast('error', err); continue; }
            toAdd.push({
                id: uid(), file: f, status: 'loading-slides', progress: 0,
                slides: [], selectedSlides: new Set(),
                customName: f.name.replace(/\.(pptx?|PPTX?)$/i, ''),
            });
        }
        if (toAdd.length === 0) return;
        setFiles(prev => [...prev, ...toAdd]);

        // Load slide metadata for each file
        for (const entry of toAdd) {
            try {
                const slides = await getPresentationSlides(entry.file);
                setFiles(prev => prev.map(f => f.id === entry.id
                    ? { ...f, status: 'ready', slides, selectedSlides: new Set(slides.map(s => s.index)) }
                    : f));
                toast('info', `"${entry.file.name}" — ${slides.length} slide${slides.length !== 1 ? 's' : ''} detected.`);
            } catch (err: any) {
                setFiles(prev => prev.map(f => f.id === entry.id
                    ? { ...f, status: 'error', errorMsg: err?.message || 'Cannot read presentation' }
                    : f));
                toast('error', `"${entry.file.name}" — ${err?.message}`);
            }
        }
    }, [toast]);

    // ── Drop zone
    const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); }, []);
    const onDragLeave = useCallback((e: React.DragEvent) => {
        if (!dropRef.current?.contains(e.relatedTarget as Node)) setIsDragOver(false);
    }, []);
    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault(); setIsDragOver(false); addFiles(e.dataTransfer.files);
    }, [addFiles]);

    // ── Per-file conversion
    const convertOne = useCallback(async (id: string) => {
        const entry = files.find(f => f.id === id);
        if (!entry) return;
        setFiles(prev => prev.map(f => f.id === id
            ? { ...f, status: 'converting', progress: 0, errorMsg: undefined }
            : f));
        try {
            const result = await convertPptToPDF(entry.file, {
                slideIndexes: Array.from(entry.selectedSlides),
                outputPrefix: entry.customName,
                pageFormat, orientation,
                scale: quality,
                onProgress: p => setFiles(prev => prev.map(f => f.id === id ? { ...f, progress: p } : f)),
            });
            setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'done', progress: 100, result } : f));
            toast('success', `✅ "${entry.file.name}" → ${result.pageCount} PDF page(s).`);
        } catch (err: any) {
            const msg = err?.message || 'Conversion failed.';
            setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'error', progress: 0, errorMsg: msg } : f));
            toast('error', `"${entry.file.name}" — ${msg}`);
        }
    }, [files, pageFormat, orientation, quality, toast]);

    // ── Batch conversion
    const isAnyConverting = files.some(f => f.status === 'converting' || f.status === 'loading-slides');
    const convertAll = useCallback(async () => {
        const ready = files.filter(f => f.status === 'ready' || f.status === 'error');
        if (ready.length === 0) { toast('info', 'No files ready to convert.'); return; }
        for (const entry of ready) await convertOne(entry.id);
        toast('success', 'Batch conversion complete.');
    }, [files, convertOne, toast]);

    // ── Download
    const downloadOne = useCallback((entry: ManagedFile) => {
        if (!entry.result) return;
        const name = (entry.customName.trim() || entry.file.name.replace(/\.(pptx?)/i, '')) + '.pdf';
        downloadBytes(entry.result.bytes, name);
        toast('success', `Downloaded: ${name}`);
    }, [toast]);

    const downloadAll = useCallback(async () => {
        const done = files.filter(f => f.status === 'done' && f.result);
        if (done.length === 0) { toast('info', 'No converted PDFs to download.'); return; }
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();
        for (const entry of done) {
            const name = (entry.customName.trim() || entry.file.name.replace(/\.(pptx?)/i, '')) + '.pdf';
            zip.file(name, entry.result!.bytes);
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'ppt-to-pdf-bundle.zip'; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        toast('success', `Downloaded ${done.length} PDFs as ZIP.`);
    }, [files, toast]);

    // ── Slide management
    const toggleSlide = useCallback((fileId: string, slideIdx: number) => {
        setFiles(prev => prev.map(f => {
            if (f.id !== fileId) return f;
            const next = new Set(f.selectedSlides);
            if (next.has(slideIdx)) next.delete(slideIdx); else next.add(slideIdx);
            return { ...f, selectedSlides: next };
        }));
    }, []);

    const selectAllSlides = useCallback((fileId: string) => {
        setFiles(prev => prev.map(f => f.id === fileId
            ? { ...f, selectedSlides: new Set(f.slides.map(s => s.index)) } : f));
    }, []);

    const clearSlides = useCallback((fileId: string) => {
        setFiles(prev => prev.map(f => f.id === fileId ? { ...f, selectedSlides: new Set() } : f));
    }, []);

    const removeFile = useCallback((id: string) => setFiles(prev => prev.filter(f => f.id !== id)), []);
    const clearAll = useCallback(() => setFiles([]), []);
    const renameFile = useCallback((id: string, name: string) =>
        setFiles(prev => prev.map(f => f.id === id ? { ...f, customName: name } : f)), []);

    const doneCount = files.filter(f => f.status === 'done').length;
    const readyCount = files.filter(f => f.status === 'ready' || f.status === 'error').length;

    // ── Render ─────────────────────────────────────────────────────────────────

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
                    <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-xl">
                        <Presentation className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                        <h1 className="text-lg font-black dark:text-white tracking-tight">PowerPoint to PDF</h1>
                        <p className="text-[11px] text-gray-400 font-medium">
                            Convert .pptx presentations to PDF — select slides, formatting preserved
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {doneCount > 1 && (
                        <button onClick={downloadAll}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl transition-colors">
                            <Package className="w-3.5 h-3.5" /> Download All ZIP
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

                {/* LEFT: drop zone + file list */}
                <div className="flex-1 flex flex-col overflow-hidden p-4 lg:p-6 gap-4 min-w-0">

                    {/* Drop zone */}
                    <div ref={dropRef} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                        onClick={() => inputRef.current?.click()}
                        className={`shrink-0 flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl py-10 cursor-pointer transition-all duration-200
              ${isDragOver ? 'border-orange-500 bg-orange-500/5 scale-[0.99]' : 'border-gray-200 dark:border-white/10 bg-white dark:bg-[#262636]'}
              hover:border-orange-400 dark:hover:border-orange-500/50 hover:bg-orange-50/30 dark:hover:bg-orange-900/10`}>
                        <input ref={inputRef} type="file" accept={ACCEPT} multiple className="hidden"
                            onChange={e => e.target.files && addFiles(e.target.files)} />

                        <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                            className="p-4 bg-orange-100 dark:bg-orange-900/30 rounded-2xl shadow-lg shadow-orange-200 dark:shadow-orange-900/30">
                            <Upload className="w-8 h-8 text-orange-600 dark:text-orange-400" />
                        </motion.div>
                        <div className="text-center">
                            <p className="text-base font-black dark:text-white">Drop PowerPoint files here</p>
                            <p className="text-sm text-gray-400 mt-0.5">
                                or <span className="text-orange-500 font-bold underline underline-offset-2">click to browse</span>
                            </p>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-gray-300 dark:text-gray-600">
                            <span>.pptx</span><span>·</span><span>.ppt</span><span>·</span><span>Max {PPT_MAX_FILE_MB} MB each</span>
                        </div>
                    </div>

                    {/* File list */}
                    <div className="flex-1 overflow-y-auto min-h-0">
                        <AnimatePresence mode="popLayout">
                            {files.length === 0 ? (
                                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                    className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
                                    <div className="p-5 bg-gray-100 dark:bg-white/5 rounded-2xl">
                                        <Presentation className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                                    </div>
                                    <p className="text-sm font-bold text-gray-400">No presentations added</p>
                                    <p className="text-xs text-gray-300 dark:text-gray-600 max-w-xs">
                                        Upload .pptx files above. Slide titles and count will be detected automatically for selection.
                                    </p>
                                </motion.div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {files.map(entry => (
                                        <FileCard
                                            key={entry.id}
                                            entry={entry}
                                            onRemove={() => removeFile(entry.id)}
                                            onConvert={() => convertOne(entry.id)}
                                            onDownload={() => downloadOne(entry)}
                                            onRename={name => renameFile(entry.id, name)}
                                            onToggleSlide={idx => toggleSlide(entry.id, idx)}
                                            onSelectAll={() => selectAllSlides(entry.id)}
                                            onClearAll={() => clearSlides(entry.id)}
                                            isAnyConverting={isAnyConverting}
                                        />
                                    ))}
                                </div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Info note */}
                    {files.length > 0 && (
                        <div className="shrink-0 flex items-start gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/15 border border-amber-100 dark:border-amber-500/20 rounded-xl">
                            <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                                <strong>Best results:</strong> Use .pptx format. Text, shapes, and background colors are preserved.
                                Charts render as placeholder boxes. Only .pptx is supported — legacy .ppt files require re-saving in PowerPoint.
                            </p>
                        </div>
                    )}
                </div>

                {/* RIGHT: Controls */}
                <div className="w-80 shrink-0 flex flex-col border-l border-gray-100 dark:border-white/5 bg-white dark:bg-[#262636] overflow-y-auto">

                    {/* Stats */}
                    {files.length > 0 && (
                        <div className="p-5 border-b border-gray-100 dark:border-white/5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Queue</p>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { label: 'Files', value: files.length, color: 'text-gray-700 dark:text-gray-200' },
                                    { label: 'Ready', value: readyCount, color: 'text-orange-600 dark:text-orange-400' },
                                    { label: 'Done', value: doneCount, color: 'text-emerald-600 dark:text-emerald-400' },
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

                    {/* Slide count summary */}
                    {files.some(f => f.status === 'ready') && (
                        <div className="p-5 border-b border-gray-100 dark:border-white/5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">
                                <SlidersHorizontal className="w-3 h-3 inline mr-1" />Slides Selected
                            </p>
                            <div className="space-y-2">
                                {files.filter(f => f.slides.length > 0).map(f => (
                                    <div key={f.id} className="flex items-center justify-between">
                                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[140px]">{f.file.name}</p>
                                        <span className="text-xs font-bold text-orange-600 dark:text-orange-400 shrink-0">
                                            {f.selectedSlides.size}/{f.slides.length}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Advanced Settings */}
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

                                        {/* Page format */}
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Page Format</p>
                                            <div className="grid grid-cols-3 gap-1.5">
                                                {(['a4', 'letter', 'legal'] as const).map(f => (
                                                    <button key={f} onClick={() => setPageFormat(f)}
                                                        className={`py-2 text-xs font-bold rounded-xl border-2 transition-all
                              ${pageFormat === f ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                                                                : 'border-gray-100 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-orange-200'}`}>
                                                        {f.toUpperCase()}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Orientation */}
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Orientation</p>
                                            <div className="grid grid-cols-2 gap-1.5">
                                                {(['portrait', 'landscape'] as const).map(o => (
                                                    <button key={o} onClick={() => setOrientation(o)}
                                                        className={`py-2 text-xs font-bold rounded-xl border-2 transition-all capitalize
                              ${orientation === o ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                                                                : 'border-gray-100 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-orange-200'}`}>
                                                        {o}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Render quality */}
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Render Quality</p>
                                            <div className="grid grid-cols-3 gap-1.5">
                                                {([
                                                    { v: 1, label: 'Fast' },
                                                    { v: 1.5, label: 'Balanced' },
                                                    { v: 2, label: 'High' },
                                                ] as const).map(q => (
                                                    <button key={q.v} onClick={() => setQuality(q.v)}
                                                        className={`py-2 text-xs font-bold rounded-xl border-2 transition-all
                              ${quality === q.v ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                                                                : 'border-gray-100 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-orange-200'}`}>
                                                        {q.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Privacy badge */}
                                        <div className="flex items-start gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-500/20 rounded-xl">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                                            <p className="text-[10px] text-emerald-700 dark:text-emerald-300 leading-relaxed">
                                                Files converted <strong>entirely in your browser</strong>. Never uploaded.
                                            </p>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Tips */}
                    <div className="p-5 border-b border-gray-100 dark:border-white/5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Tips</p>
                        <ul className="space-y-2">
                            {[
                                'Use .pptx for best compatibility',
                                'Select specific slides to reduce PDF size',
                                'Landscape matches standard 16:9 slides',
                                'Text, shapes & background colors preserved',
                                'Charts render as placeholder boxes',
                                'Legacy .ppt needs re-saving as .pptx',
                            ].map((tip, i) => (
                                <li key={i} className="flex items-start gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                                    <span className="w-4 h-4 shrink-0 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-[8px] font-black flex items-center justify-center mt-0.5">
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
                                    : 'bg-gradient-to-r from-orange-600 to-red-500 hover:from-orange-500 hover:to-red-400 text-white shadow-orange-500/30 hover:-translate-y-0.5 active:translate-y-0'}`}>
                            {isAnyConverting
                                ? <><Loader2 className="w-5 h-5 animate-spin" /> Converting…</>
                                : <><Layers className="w-5 h-5" />
                                    {files.length === 0 ? 'Add files first'
                                        : readyCount === 0 ? 'No files to convert'
                                            : `Convert ${readyCount} File${readyCount !== 1 ? 's' : ''}`}</>
                            }
                        </button>

                        <AnimatePresence>
                            {doneCount > 1 && (
                                <motion.button initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                                    onClick={downloadAll}
                                    className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl font-black text-sm bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-lg shadow-emerald-500/30 hover:-translate-y-0.5 active:translate-y-0 transition-all">
                                    <Package className="w-5 h-5" /> Download All ({doneCount}) as ZIP
                                </motion.button>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </div>
    );
};
