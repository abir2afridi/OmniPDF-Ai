/**
 * JPGToPDF — Production-ready Images → PDF module.
 *
 * Key UX features:
 * - Drag & drop multi-image upload (JPG, PNG, WebP, BMP, GIF)
 * - Live thumbnail grid with order numbers
 * - Drag-to-reorder via mouse drag (custom DnD, no extra deps)
 * - Page size, orientation, margin, fit mode controls
 * - Background color picker
 * - Output filename rename
 * - Progress bar during conversion
 * - Error / success toasts
 * - Batch: remove individual images before converting
 * - Download final PDF or preview it inline
 */

import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    ImagePlus, Upload, X, Download, Loader2, CheckCircle2,
    AlertCircle, ArrowLeft, GripVertical, Settings2,
    ChevronDown, ChevronUp, Trash2, FileDown, ArrowUpDown,
    Info,
} from 'lucide-react';
import {
    loadImageMeta, validateImageFile, convertImagesToPdf, fmtSize,
    IMG_MAX_COUNT,
    type ImageMeta, type PageSize, type PageOrientation, type FitMode,
} from '../services/jpgToPdfService';
import { downloadBytes } from '../services/pdfService';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Toast {
    id: string;
    type: 'success' | 'error' | 'info';
    message: string;
}

type ConvStatus = 'idle' | 'converting' | 'done' | 'error';

interface ManagedImage {
    id: string;
    meta: ImageMeta;
    /** load error if any */
    loadError?: string;
}

interface JPGToPDFProps {
    onBack?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 10);
const ACCEPT = '.jpg,.jpeg,.png,.webp,.gif,.bmp,.tiff,.tif,image/*';

// ── Toast ─────────────────────────────────────────────────────────────────────

const ToastItem = ({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) => (
    <motion.div layout initial={{ opacity: 0, x: 60, scale: 0.9 }}
        animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 60, scale: 0.9 }}
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

// ── Image Thumbnail Card ──────────────────────────────────────────────────────

interface ThumbCardProps {
    img: ManagedImage;
    index: number;
    total: number;
    onRemove: () => void;
    isDragging: boolean;
    dragHandleProps: React.HTMLAttributes<HTMLDivElement>;
    status: ConvStatus;
}

const ThumbCard: React.FC<ThumbCardProps> = ({
    img, index, total, onRemove, isDragging, dragHandleProps, status,
}) => (
    <motion.div
        layout
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: isDragging ? 0.4 : 1, scale: isDragging ? 0.97 : 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        className={`relative group bg-white dark:bg-[#1e1e2e] rounded-2xl border-2 overflow-hidden transition-all duration-150 shadow-sm hover:shadow-md
      ${isDragging ? 'border-violet-400 shadow-lg shadow-violet-400/20' : 'border-gray-100 dark:border-white/10 hover:border-violet-300 dark:hover:border-violet-500/40'}`}
    >
        {/* Thumbnail */}
        <div className="relative bg-gray-50 dark:bg-white/5 flex items-center justify-center"
            style={{ aspectRatio: `${img.meta.naturalWidth}/${img.meta.naturalHeight}`, maxHeight: 180 }}>
            <img
                src={img.meta.dataUrl}
                alt={img.meta.file.name}
                className="object-contain w-full h-full"
                draggable={false}
            />

            {/* Drag handle */}
            {status === 'idle' && (
                <div {...dragHandleProps}
                    className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 text-white p-1.5 rounded-lg cursor-grab active:cursor-grabbing">
                    <GripVertical className="w-3.5 h-3.5" />
                </div>
            )}

            {/* Remove */}
            {status === 'idle' && (
                <button onClick={onRemove}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-lg shadow-lg">
                    <X className="w-3.5 h-3.5" />
                </button>
            )}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-gray-50 dark:border-white/5">
            <div className="flex items-center justify-between gap-2">
                <span className="w-5 h-5 shrink-0 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-[9px] font-black flex items-center justify-center">
                    {index + 1}
                </span>
                <p className="flex-1 text-[10px] font-bold text-gray-600 dark:text-gray-300 truncate leading-tight">
                    {img.meta.file.name}
                </p>
            </div>
            <p className="text-[9px] text-gray-400 font-mono mt-0.5 pl-7">
                {img.meta.naturalWidth}×{img.meta.naturalHeight} · {fmtSize(img.meta.file.size)}
            </p>
        </div>

        {/* Order badge */}
        {total > 1 && (
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-violet-500/60 to-transparent" />
        )}
    </motion.div>
);

// ── Loading placeholder cards ─────────────────────────────────────────────────

const SkeletonCard = () => (
    <div className="rounded-2xl border-2 border-gray-100 dark:border-white/10 overflow-hidden animate-pulse">
        <div className="aspect-[3/4] bg-gray-100 dark:bg-white/5" />
        <div className="px-3 py-2 border-t border-gray-50 dark:border-white/5">
            <div className="h-3 bg-gray-200 dark:bg-white/10 rounded w-3/4 mb-1" />
            <div className="h-2 bg-gray-100 dark:bg-white/5 rounded w-1/2" />
        </div>
    </div>
);

// ── Circular progress ─────────────────────────────────────────────────────────

const CircProg = ({ value }: { value: number }) => {
    const r = 16; const c = 2 * Math.PI * r;
    return (
        <svg width={42} height={42} className="-rotate-90">
            <circle cx={21} cy={21} r={r} fill="none" strokeWidth="3.5" strokeLinecap="round"
                className="stroke-gray-200 dark:stroke-white/10" />
            <circle cx={21} cy={21} r={r} fill="none" strokeWidth="3.5" strokeLinecap="round"
                className="stroke-violet-500"
                strokeDasharray={c} strokeDashoffset={c - (c * value) / 100}
                style={{ transition: 'stroke-dashoffset 0.25s ease' }} />
        </svg>
    );
};

// ── Main Component ────────────────────────────────────────────────────────────

export const JPGToPDF: React.FC<JPGToPDFProps> = ({ onBack }) => {
    const [images, setImages] = useState<ManagedImage[]>([]);
    const [loadingCount, setLoadingCount] = useState(0);
    const [status, setStatus] = useState<ConvStatus>('idle');
    const [progress, setProgress] = useState(0);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [isDragOver, setIsDragOver] = useState(false);
    const [advOpen, setAdvOpen] = useState(false);
    const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
    const [resultSize, setResultSize] = useState(0);
    const [errorMsg, setErrorMsg] = useState('');

    // Output settings
    const [outputName, setOutputName] = useState('images');
    const [pageSize, setPageSize] = useState<PageSize>('a4');
    const [orientation, setOrientation] = useState<PageOrientation>('portrait');
    const [marginPt, setMarginPt] = useState(36);
    const [fitMode, setFitMode] = useState<FitMode>('contain');
    const [background, setBackground] = useState('#ffffff');

    // Drag-to-reorder state
    const dragIndex = useRef<number | null>(null);
    const overIndex = useRef<number | null>(null);

    const dropRef = useRef<HTMLDivElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    // ── Toasts
    const toast = useCallback((type: Toast['type'], message: string) => {
        const id = uid();
        setToasts(prev => [...prev.slice(-4), { id, type, message }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000);
    }, []);

    // ── Add images
    const addFiles = useCallback(async (incoming: FileList | File[]) => {
        const arr = Array.from(incoming);
        const valid: File[] = [];

        for (const f of arr) {
            const err = validateImageFile(f);
            if (err) { toast('error', err); continue; }
            valid.push(f);
        }

        if (valid.length === 0) return;

        const wouldExceed = images.length + valid.length > IMG_MAX_COUNT;
        const toLoad = wouldExceed ? valid.slice(0, IMG_MAX_COUNT - images.length) : valid;
        if (wouldExceed) toast('info', `Max ${IMG_MAX_COUNT} images — adding first ${toLoad.length}.`);

        if (toLoad.length === 0) return;
        setLoadingCount(n => n + toLoad.length);

        // Load metadata concurrently
        await Promise.all(toLoad.map(async f => {
            try {
                const meta = await loadImageMeta(f);
                setImages(prev => [...prev, { id: uid(), meta }]);
            } catch (err: any) {
                toast('error', err?.message ?? `Cannot load "${f.name}"`);
            } finally {
                setLoadingCount(n => Math.max(0, n - 1));
            }
        }));

        // Reset result when new images added
        setStatus('idle');
        setResultBytes(null);
    }, [images.length, toast]);

    // ── Drag-and-drop upload
    const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
    const onDragLeave = (e: React.DragEvent) => {
        if (!dropRef.current?.contains(e.relatedTarget as Node)) setIsDragOver(false);
    };
    const onDrop = (e: React.DragEvent) => {
        e.preventDefault(); setIsDragOver(false); addFiles(e.dataTransfer.files);
    };

    // ── Drag-to-reorder (native HTML5 drag)
    const handleDragStart = (idx: number) => (e: React.DragEvent) => {
        dragIndex.current = idx;
        e.dataTransfer.effectAllowed = 'move';
    };
    const handleDragEnter = (idx: number) => () => { overIndex.current = idx; };
    const handleDragEnd = () => {
        const from = dragIndex.current;
        const to = overIndex.current;
        if (from !== null && to !== null && from !== to) {
            setImages(prev => {
                const copy = [...prev];
                const [item] = copy.splice(from, 1);
                copy.splice(to, 0, item);
                return copy;
            });
        }
        dragIndex.current = null;
        overIndex.current = null;
    };

    // ── Convert
    const convert = useCallback(async () => {
        if (images.length === 0) { toast('info', 'Add at least one image first.'); return; }
        if (status === 'converting') return;

        setStatus('converting');
        setProgress(0);
        setErrorMsg('');
        setResultBytes(null);

        try {
            const result = await convertImagesToPdf(
                images.map(im => im.meta),
                {
                    pageSize, orientation, marginPt, fitMode, background,
                    outputName,
                    onProgress: p => setProgress(p),
                }
            );
            setResultBytes(result.bytes);
            setResultSize(result.fileSizeBytes);
            setStatus('done');
            toast('success', `✅ ${result.pageCount} page PDF created — ${fmtSize(result.fileSizeBytes)}`);
        } catch (err: any) {
            const msg = err?.message ?? 'Conversion failed.';
            setErrorMsg(msg);
            setStatus('error');
            toast('error', msg);
        }
    }, [images, pageSize, orientation, marginPt, fitMode, background, outputName, status, toast]);

    // ── Download
    const doDownload = useCallback(() => {
        if (!resultBytes) return;
        const safe = (outputName.trim() || 'images').replace(/\.pdf$/i, '');
        downloadBytes(resultBytes, `${safe}.pdf`);
    }, [resultBytes, outputName]);

    const removeImage = (id: string) => {
        setImages(prev => prev.filter(im => im.id !== id));
        setStatus('idle');
        setResultBytes(null);
    };
    const clearAll = () => {
        setImages([]);
        setStatus('idle');
        setResultBytes(null);
        setProgress(0);
    };

    const isConverting = status === 'converting';
    const totalPx = images.reduce((s, im) => s + im.meta.naturalWidth * im.meta.naturalHeight, 0);

    return (
        <div className="flex-1 flex flex-col h-full bg-gray-50 dark:bg-[#1e1e2e] overflow-hidden relative">

            {/* Toasts */}
            <div className="fixed top-6 right-6 z-[200] flex flex-col gap-2 items-end pointer-events-none">
                <AnimatePresence>
                    {toasts.map(t => (
                        <div key={t.id} className="pointer-events-auto">
                            <ToastItem toast={t} onDismiss={() => setToasts(prev => prev.filter(x => x.id !== t.id))} />
                        </div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-6 py-4 bg-white dark:bg-[#262636] border-b border-gray-100 dark:border-white/5 shadow-sm">
                <div className="flex items-center gap-3">
                    {onBack && (
                        <button onClick={onBack}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-colors text-gray-500 dark:text-gray-400">
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}
                    <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-xl">
                        <ImagePlus className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div>
                        <h1 className="text-lg font-black dark:text-white tracking-tight">JPG to PDF</h1>
                        <p className="text-[11px] text-gray-400 font-medium">
                            Convert images to PDF — reorder, resize, set margins
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {images.length > 0 && (
                        <button onClick={clearAll}
                            className="px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors flex items-center gap-1.5">
                            <Trash2 className="w-3.5 h-3.5" /> Clear All
                        </button>
                    )}
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 flex overflow-hidden">

                {/* LEFT: uploads + grid */}
                <div className="flex-1 flex flex-col overflow-hidden p-4 lg:p-6 gap-4 min-w-0">

                    {/* Drop zone */}
                    <div ref={dropRef} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                        onClick={() => fileRef.current?.click()}
                        className={`shrink-0 flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl py-9 cursor-pointer transition-all duration-200
              ${isDragOver ? 'border-violet-500 bg-violet-500/5 scale-[0.99]' : 'border-gray-200 dark:border-white/10 bg-white dark:bg-[#262636]'}
              hover:border-violet-400 dark:hover:border-violet-500/50 hover:bg-violet-50/30 dark:hover:bg-violet-900/10`}>
                        <input ref={fileRef} type="file" accept={ACCEPT} multiple className="hidden"
                            onChange={e => e.target.files && addFiles(e.target.files)} />

                        <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                            className="p-4 bg-violet-100 dark:bg-violet-900/30 rounded-2xl shadow-lg shadow-violet-200 dark:shadow-violet-900/30">
                            <Upload className="w-7 h-7 text-violet-600 dark:text-violet-400" />
                        </motion.div>

                        <div className="text-center">
                            <p className="text-base font-black dark:text-white">Drop images here</p>
                            <p className="text-sm text-gray-400 mt-0.5">
                                or <span className="text-violet-500 font-bold underline underline-offset-2">click to browse</span>
                            </p>
                        </div>

                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-300 dark:text-gray-600">
                            {['JPG', 'PNG', 'WebP', 'BMP', 'GIF', 'TIFF'].map(ext => (
                                <span key={ext}>{ext}</span>
                            )).reduce<React.ReactNode[]>((acc, el, i) => i === 0 ? [el] : [...acc, <span key={`dot-${i}`} className="opacity-40">·</span>, el], [])}
                        </div>
                    </div>

                    {/* Reorder hint */}
                    {images.length > 1 && status === 'idle' && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="flex items-center gap-2 px-4 py-2.5 bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-500/20 rounded-xl">
                            <ArrowUpDown className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                            <p className="text-[11px] text-violet-700 dark:text-violet-300 font-medium">
                                Drag the <GripVertical className="w-3 h-3 inline mb-0.5" /> handle on any image to reorder pages.
                            </p>
                        </motion.div>
                    )}

                    {/* Image Grid */}
                    <div className="flex-1 overflow-y-auto min-h-0">
                        <AnimatePresence mode="popLayout">
                            {images.length === 0 && loadingCount === 0 ? (
                                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                    className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
                                    <div className="p-5 bg-gray-100 dark:bg-white/5 rounded-2xl">
                                        <ImagePlus className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                                    </div>
                                    <p className="text-sm font-bold text-gray-400">No images yet</p>
                                    <p className="text-xs text-gray-300 dark:text-gray-600 max-w-xs leading-relaxed">
                                        Upload images above. Each image becomes one PDF page. You can reorder them before converting.
                                    </p>
                                </motion.div>
                            ) : (
                                <div className="grid gap-3 pb-4"
                                    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>

                                    {/* Live image cards */}
                                    {images.map((img, idx) => (
                                        <div key={img.id}
                                            draggable={status === 'idle'}
                                            onDragStart={handleDragStart(idx)}
                                            onDragEnter={handleDragEnter(idx)}
                                            onDragEnd={handleDragEnd}
                                            onDragOver={e => e.preventDefault()}
                                        >
                                            <ThumbCard
                                                img={img}
                                                index={idx}
                                                total={images.length}
                                                onRemove={() => removeImage(img.id)}
                                                isDragging={false}
                                                status={status}
                                                dragHandleProps={{
                                                    draggable: true,
                                                    onDragStart: handleDragStart(idx) as any,
                                                }}
                                            />
                                        </div>
                                    ))}

                                    {/* Loading skeletons */}
                                    {Array.from({ length: loadingCount }).map((_, i) => (
                                        <SkeletonCard key={`skel-${i}`} />
                                    ))}
                                </div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* RIGHT: controls */}
                <div className="w-80 shrink-0 flex flex-col border-l border-gray-100 dark:border-white/5 bg-white dark:bg-[#262636] overflow-y-auto">

                    {/* Stats */}
                    {images.length > 0 && (
                        <div className="p-5 border-b border-gray-100 dark:border-white/5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Queue</p>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { label: 'Images', value: images.length, color: 'text-violet-600 dark:text-violet-400' },
                                    { label: 'Pages', value: images.length, color: 'text-gray-700 dark:text-gray-200' },
                                    { label: 'Size In', value: fmtSize(images.reduce((s, im) => s + im.meta.file.size, 0)), color: 'text-gray-500 dark:text-gray-400' },
                                    { label: 'Pixels', value: `${(totalPx / 1e6).toFixed(1)}M`, color: 'text-gray-500 dark:text-gray-400' },
                                ].map(s => (
                                    <div key={s.label} className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 text-center">
                                        <p className={`text-base font-black ${s.color}`}>{s.value}</p>
                                        <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mt-0.5">{s.label}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Result size */}
                            {status === 'done' && resultSize > 0 && (
                                <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-500/20 rounded-xl">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                    <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-bold">
                                        PDF ready · {fmtSize(resultSize)}
                                    </p>
                                </div>
                            )}
                            {status === 'error' && errorMsg && (
                                <div className="mt-3 flex items-start gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-500/20 rounded-xl">
                                    <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                                    <p className="text-[11px] text-red-600 dark:text-red-400 leading-snug">{errorMsg}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Output name */}
                    <div className="p-5 border-b border-gray-100 dark:border-white/5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Output filename</p>
                        <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl focus-within:ring-2 focus-within:ring-violet-400 transition-all">
                            <FileDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <input
                                type="text"
                                value={outputName}
                                onChange={e => setOutputName(e.target.value)}
                                className="flex-1 bg-transparent text-xs font-mono dark:text-gray-200 outline-none"
                                placeholder="images"
                            />
                            <span className="text-[10px] text-gray-400 shrink-0">.pdf</span>
                        </div>
                    </div>

                    {/* Settings accordion */}
                    <div className="border-b border-gray-100 dark:border-white/5">
                        <button onClick={() => setAdvOpen(v => !v)}
                            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                            <span className="flex items-center gap-2 text-xs font-bold text-gray-600 dark:text-gray-300">
                                <Settings2 className="w-3.5 h-3.5" /> Page Settings
                            </span>
                            {advOpen ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                        </button>

                        <AnimatePresence>
                            {advOpen && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                    <div className="px-5 pb-5 space-y-5">

                                        {/* Page size */}
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Page Size</p>
                                            <div className="grid grid-cols-3 gap-1.5">
                                                {([
                                                    { v: 'a4', label: 'A4', note: '210×297mm' },
                                                    { v: 'letter', label: 'Letter', note: '8.5×11in' },
                                                    { v: 'legal', label: 'Legal', note: '8.5×14in' },
                                                    { v: 'a3', label: 'A3', note: '297×420mm' },
                                                    { v: 'fit', label: 'Fit', note: 'Image size' },
                                                ] as const).map(s => (
                                                    <button key={s.v} onClick={() => setPageSize(s.v)}
                                                        className={`py-2 px-1 flex flex-col items-center text-[9px] font-bold rounded-xl border-2 transition-all
                              ${pageSize === s.v ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
                                                                : 'border-gray-100 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-violet-200'}`}>
                                                        <span className="text-[11px] font-black">{s.label}</span>
                                                        <span className="opacity-60 mt-0.5">{s.note}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Orientation */}
                                        {pageSize !== 'fit' && (
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Orientation</p>
                                                <div className="grid grid-cols-2 gap-1.5">
                                                    {([
                                                        { v: 'portrait', label: '⬌ Portrait' },
                                                        { v: 'landscape', label: '⬍ Landscape' },
                                                    ] as const).map(o => (
                                                        <button key={o.v} onClick={() => setOrientation(o.v)}
                                                            className={`py-2.5 text-[10px] font-bold rounded-xl border-2 transition-all
                                ${orientation === o.v ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
                                                                    : 'border-gray-100 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-violet-200'}`}>
                                                            {o.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Image fit */}
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Image Fit</p>
                                            <div className="grid grid-cols-3 gap-1.5">
                                                {([
                                                    { v: 'contain', label: 'Contain', note: 'Preserve ratio' },
                                                    { v: 'fill', label: 'Fill', note: 'Stretch to fit' },
                                                    { v: 'original', label: 'Original', note: 'Pixel size' },
                                                ] as const).map(f => (
                                                    <button key={f.v} onClick={() => setFitMode(f.v)}
                                                        className={`py-2 px-1 flex flex-col items-center text-[9px] font-bold rounded-xl border-2 transition-all
                              ${fitMode === f.v ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
                                                                : 'border-gray-100 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-violet-200'}`}>
                                                        <span className="text-[11px] font-black">{f.label}</span>
                                                        <span className="opacity-60 mt-0.5">{f.note}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Margin */}
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Page Margin</p>
                                                <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400">
                                                    {marginPt}pt ({(marginPt / 72 * 25.4).toFixed(0)}mm)
                                                </span>
                                            </div>
                                            <input type="range" min={0} max={108} step={9} value={marginPt}
                                                onChange={e => setMarginPt(Number(e.target.value))}
                                                className="w-full accent-violet-500" />
                                            <div className="flex justify-between text-[9px] text-gray-400 mt-1">
                                                <span>None</span><span>0.5in</span><span>1in</span><span>1.5in</span>
                                            </div>
                                        </div>

                                        {/* Background color */}
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Background</p>
                                            <div className="flex items-center gap-3">
                                                <div className="flex gap-1.5">
                                                    {['#ffffff', '#f8f8f8', '#000000', '#1e1e2e', '#fef9ec'].map(c => (
                                                        <button key={c} onClick={() => setBackground(c)}
                                                            title={c}
                                                            className={`w-6 h-6 rounded-lg border-2 transition-all ${background === c ? 'border-violet-500 scale-110 shadow' : 'border-gray-200 dark:border-white/10 hover:scale-105'}`}
                                                            style={{ backgroundColor: c }} />
                                                    ))}
                                                </div>
                                                <input type="color" value={background} onChange={e => setBackground(e.target.value)}
                                                    className="w-7 h-7 rounded-lg border-2 border-gray-200 dark:border-white/10 cursor-pointer bg-transparent" />
                                                <span className="text-[10px] font-mono text-gray-400">{background}</span>
                                            </div>
                                        </div>

                                        {/* Privacy badge */}
                                        <div className="flex items-start gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-500/20 rounded-xl">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                                            <p className="text-[10px] text-emerald-700 dark:text-emerald-300 leading-relaxed">
                                                Converted <strong>entirely in your browser</strong>. No file ever leaves your device.
                                            </p>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className="flex-1" />

                    {/* Action buttons */}
                    <div className="p-5 border-t border-gray-100 dark:border-white/5 bg-white/80 dark:bg-[#262636]/80 backdrop-blur-sm space-y-3">

                        {/* Convert */}
                        <button
                            onClick={status === 'done' ? convert : convert}
                            disabled={images.length === 0 || isConverting}
                            className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-sm transition-all shadow-lg
                ${images.length === 0 || isConverting
                                    ? 'bg-gray-200 dark:bg-white/5 text-gray-400 cursor-not-allowed shadow-none'
                                    : 'bg-gradient-to-r from-violet-600 to-purple-500 hover:from-violet-500 hover:to-purple-400 text-white shadow-violet-500/30 hover:-translate-y-0.5 active:translate-y-0'}`}>
                            {isConverting
                                ? (<><CircProg value={progress} /><span className="ml-1">Converting… {progress}%</span></>)
                                : status === 'done'
                                    ? (<><RefreshIcon /><span>Re-convert</span></>)
                                    : (<><ImagePlus className="w-5 h-5" />
                                        {images.length === 0 ? 'Add images first' : `Convert ${images.length} image${images.length !== 1 ? 's' : ''} to PDF`}
                                    </>)
                            }
                        </button>

                        {/* Download */}
                        <AnimatePresence>
                            {status === 'done' && resultBytes && (
                                <motion.button initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                                    onClick={doDownload}
                                    className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl font-black text-sm bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-lg shadow-emerald-500/30 hover:-translate-y-0.5 active:translate-y-0 transition-all">
                                    <Download className="w-5 h-5" />
                                    Download PDF · {fmtSize(resultSize)}
                                </motion.button>
                            )}
                        </AnimatePresence>

                        {/* Progress bar (linear) */}
                        {isConverting && (
                            <div className="h-1 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                                <motion.div className="h-full bg-gradient-to-r from-violet-500 to-purple-400 rounded-full"
                                    animate={{ width: `${progress}%` }} transition={{ duration: 0.25, ease: 'easeOut' }} />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// tiny inline icon (avoid extra import)
const RefreshIcon = () => (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
    </svg>
);
