/**
 * ExtractImages — Production-ready PDF → Image Extractor module
 *
 * UX Highlights:
 * - Multi-file drag & drop (PDF only)
 * - First-page thumbnail preview
 * - Per-file page range selector
 * - Output format selector: PNG / JPEG
 * - Per-file progress bars during extraction
 * - Image gallery with lightbox preview per PDF
 * - Individual download + Download All as ZIP
 * - Batch extract across multiple PDFs
 * - Toast notifications
 * - Cyan / teal brand color — distinct from all other modules
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    ImageIcon, Upload, X, Download, Loader2, CheckCircle2,
    AlertCircle, ArrowLeft, Trash2, RotateCcw, Settings2,
    ChevronDown, ChevronUp, Info, Archive, FileImage, ZoomIn,
    ChevronLeft, ChevronRight, Grid3x3,
} from 'lucide-react';
import {
    extractImagesFromPdf, validatePdfForExtract, revokeImageUrls, fmtSize,
    EXTRACT_MAX_MB,
    type ExtractedImage, type ExtractResult, type ImageFormat,
} from '../services/extractImagesService';
import { downloadBlob } from '../services/pdfService';
import JSZip from 'jszip';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

if (GlobalWorkerOptions) {
    GlobalWorkerOptions.workerSrc =
        `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type FileStatus = 'idle' | 'loading-meta' | 'ready' | 'extracting' | 'done' | 'error';

interface ManagedFile {
    id: string;
    file: File;
    status: FileStatus;
    progress: number;
    totalPages: number;
    selectedPages: number[];
    result: ExtractResult | null;
    error: string;
    thumb: string;
}

interface Toast { id: string; type: 'success' | 'error' | 'info'; message: string; }
interface Props { onBack?: () => void; }

// ── Helpers ───────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 10);
const ACCEPT = '.pdf,application/pdf';

async function generateThumb(file: File): Promise<{ thumb: string; totalPages: number }> {
    const buf = await file.arrayBuffer();
    const pdf = await getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    const vp = page.getViewport({ scale: 0.35 });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
    return { thumb: canvas.toDataURL('image/jpeg', 0.55), totalPages: pdf.numPages };
}

function parseRange(raw: string, total: number): number[] {
    const out = new Set<number>();
    for (const part of raw.split(',')) {
        const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
        if (!m) continue;
        const from = parseInt(m[1]) - 1;
        const to = m[2] ? parseInt(m[2]) - 1 : from;
        for (let i = Math.max(0, from); i <= Math.min(total - 1, to); i++) out.add(i);
    }
    return Array.from(out).sort((a, b) => a - b);
}

// ── Toast ─────────────────────────────────────────────────────────────────────

const ToastItem = ({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) => (
    <motion.div layout initial={{ opacity: 0, x: 60, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 60, scale: 0.9 }}
        className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-xl max-w-sm text-sm font-medium border backdrop-blur-md pointer-events-auto
      ${toast.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/60 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
                : toast.type === 'error' ? 'bg-red-50 dark:bg-red-900/60 border-red-200 dark:border-red-500/30 text-red-800 dark:text-red-200'
                    : 'bg-cyan-50 dark:bg-cyan-900/60 border-cyan-200 dark:border-cyan-500/30 text-cyan-800 dark:text-cyan-200'}`}>
        {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
        {toast.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
        {toast.type === 'info' && <Info className="w-4 h-4 shrink-0 mt-0.5" />}
        <span className="flex-1 leading-snug">{toast.message}</span>
        <button onClick={onDismiss}><X className="w-3.5 h-3.5 opacity-60 hover:opacity-100" /></button>
    </motion.div>
);

// ── Lightbox ──────────────────────────────────────────────────────────────────

interface LightboxProps {
    images: ExtractedImage[];
    index: number;
    onClose: () => void;
    onNav: (i: number) => void;
}

const Lightbox: React.FC<LightboxProps> = ({ images, index, onClose, onNav }) => {
    const img = images[index];
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowLeft' && index > 0) onNav(index - 1);
            if (e.key === 'ArrowRight' && index < images.length - 1) onNav(index + 1);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [index, images.length, onClose, onNav]);

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
                onClick={e => e.stopPropagation()}
                className="relative max-w-5xl max-h-[90vh] flex flex-col gap-3 items-center">

                {/* Close */}
                <button onClick={onClose} className="absolute -top-4 -right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors z-10">
                    <X className="w-4 h-4" />
                </button>

                {/* Image */}
                <div className="rounded-2xl overflow-hidden shadow-2xl bg-gray-900 border border-white/10 max-h-[75vh]">
                    <img src={img.blobUrl} alt={img.name}
                        className="max-w-full max-h-[75vh] object-contain" />
                </div>

                {/* Info bar */}
                <div className="flex items-center gap-4 text-white/70 text-xs font-medium">
                    <span>{img.pageLabel}</span>
                    <span>{img.width} × {img.height} px</span>
                    <span>{fmtSize(img.sizeBytes)}</span>
                    <span className="uppercase font-bold text-cyan-400">.{img.format === 'jpeg' ? 'jpg' : img.format}</span>
                    <button onClick={() => downloadBlob(img.blob, `${img.name}.${img.format === 'jpeg' ? 'jpg' : img.format}`)}
                        className="flex items-center gap-1 px-3 py-1 bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg text-xs font-bold transition-colors">
                        <Download className="w-3 h-3" /> Download
                    </button>
                </div>

                {/* Nav */}
                {images.length > 1 && (
                    <div className="flex items-center gap-3 text-white/60 text-xs">
                        <button disabled={index === 0} onClick={() => onNav(index - 1)}
                            className="p-2 hover:bg-white/10 rounded-lg disabled:opacity-30 transition-colors">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span>{index + 1} / {images.length}</span>
                        <button disabled={index === images.length - 1} onClick={() => onNav(index + 1)}
                            className="p-2 hover:bg-white/10 rounded-lg disabled:opacity-30 transition-colors">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
};

// ── Image gallery ─────────────────────────────────────────────────────────────

interface GalleryProps {
    images: ExtractedImage[];
    format: ImageFormat;
    onLightbox: (i: number) => void;
}

const ImageGallery: React.FC<GalleryProps> = ({ images, format, onLightbox }) => {
    const ext = format === 'jpeg' ? 'jpg' : 'png';
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
            {images.map((img, i) => (
                <motion.div key={img.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="group relative bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-xl overflow-hidden hover:border-cyan-300 dark:hover:border-cyan-500/50 transition-all hover:shadow-md cursor-pointer"
                    onClick={() => onLightbox(i)}>

                    {/* Thumbnail */}
                    <div className="aspect-[4/3] overflow-hidden bg-gray-100 dark:bg-black/20 flex items-center justify-center">
                        <img src={img.blobUrl} alt={img.name}
                            className="w-full h-full object-contain transition-transform group-hover:scale-105" />
                    </div>

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <div className="p-2 bg-white/20 backdrop-blur-sm rounded-xl">
                            <ZoomIn className="w-5 h-5 text-white" />
                        </div>
                    </div>

                    {/* Info footer */}
                    <div className="p-2 border-t border-gray-100 dark:border-white/5">
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 font-mono truncate">{img.pageLabel}</p>
                        <div className="flex items-center justify-between mt-0.5">
                            <span className="text-[9px] text-gray-400">{img.width}×{img.height}</span>
                            <span className="text-[9px] font-bold uppercase text-cyan-600 dark:text-cyan-400">.{ext}</span>
                        </div>
                    </div>

                    {/* Download button */}
                    <button onClick={e => { e.stopPropagation(); downloadBlob(img.blob, `${img.name}.${ext}`); }}
                        className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 p-1.5 bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg transition-all shadow-md">
                        <Download className="w-3 h-3" />
                    </button>
                </motion.div>
            ))}
        </div>
    );
};

// ── File card ─────────────────────────────────────────────────────────────────

interface FileCardProps {
    entry: ManagedFile;
    format: ImageFormat;
    isAnyExtracting: boolean;
    onRemove: () => void;
    onExtract: () => void;
    onPageRange: (raw: string) => void;
    onLightbox: (i: number) => void;
}

const FileCard: React.FC<FileCardProps> = ({
    entry, format, isAnyExtracting, onRemove, onExtract, onPageRange, onLightbox,
}) => {
    const [showRange, setShowRange] = useState(false);
    const [rangeVal, setRangeVal] = useState('');
    const [showGallery, setShowGallery] = useState(false);

    const dot: Record<FileStatus, string> = {
        'idle': 'bg-gray-300 dark:bg-gray-600',
        'loading-meta': 'bg-cyan-400 animate-pulse',
        'ready': 'bg-cyan-500',
        'extracting': 'bg-cyan-400 animate-pulse',
        'done': 'bg-emerald-500',
        'error': 'bg-red-500',
    };

    const imgCount = entry.result?.images.length ?? 0;
    const ext = format === 'jpeg' ? 'jpg' : 'png';

    const downloadAll = async () => {
        const imgs = entry.result?.images;
        if (!imgs?.length) return;
        if (imgs.length === 1) {
            downloadBlob(imgs[0].blob, `${imgs[0].name}.${ext}`);
            return;
        }
        const zip = new JSZip();
        for (const img of imgs) zip.file(`${img.name}.${ext}`, img.blob);
        downloadBlob(await zip.generateAsync({ type: 'blob' }), `${entry.file.name.replace(/\.pdf$/i, '')}_images.zip`);
    };

    return (
        <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">

            {/* File row */}
            <div className="flex items-center gap-3 p-4">
                <div className={`w-2 h-2 rounded-full shrink-0 ${dot[entry.status]}`} />

                {/* Thumb */}
                <div className="w-10 h-12 shrink-0 rounded-lg overflow-hidden bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10 flex items-center justify-center">
                    {entry.thumb
                        ? <img src={entry.thumb} alt="" className="w-full h-full object-cover" />
                        : <FileImage className="w-5 h-5 text-gray-300 dark:text-gray-600" />}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold dark:text-white truncate">{entry.file.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-gray-400 font-mono">{fmtSize(entry.file.size)}</span>
                        {entry.totalPages > 0 && (
                            <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-bold">
                                {entry.selectedPages.length > 0
                                    ? `Pages ${entry.selectedPages.slice(0, 4).map(i => i + 1).join(',')}${entry.selectedPages.length > 4 ? '…' : ''}`
                                    : `All ${entry.totalPages} pages`}
                            </span>
                        )}
                        {entry.status === 'done' && (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                                ✓ {imgCount} image{imgCount !== 1 ? 's' : ''} found
                            </span>
                        )}
                        {entry.status === 'error' && (
                            <span className="text-[10px] text-red-500 truncate max-w-[200px]">{entry.error}</span>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                    {entry.status === 'ready' && (
                        <>
                            {entry.totalPages > 1 && (
                                <button onClick={() => setShowRange(v => !v)}
                                    className="p-1.5 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 rounded-lg text-cyan-400 hover:text-cyan-600 transition-colors">
                                    <Settings2 className="w-4 h-4" />
                                </button>
                            )}
                            <button onClick={onExtract} disabled={isAnyExtracting}
                                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-40 shadow-sm">
                                Extract
                            </button>
                        </>
                    )}
                    {entry.status === 'extracting' && (
                        <div className="flex items-center gap-2 px-3">
                            <Loader2 className="w-4 h-4 animate-spin text-cyan-500" />
                            <span className="text-xs text-cyan-500 font-bold">{entry.progress}%</span>
                        </div>
                    )}
                    {entry.status === 'done' && imgCount > 0 && (
                        <>
                            <button onClick={() => setShowGallery(v => !v)}
                                className="p-1.5 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 rounded-lg text-cyan-500 transition-colors" title="Toggle gallery">
                                <Grid3x3 className="w-4 h-4" />
                            </button>
                            <button onClick={onExtract} title="Re-extract"
                                className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg text-gray-400">
                                <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={downloadAll}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-colors shadow-sm flex items-center gap-1.5">
                                <Download className="w-3.5 h-3.5" /> {imgCount === 1 ? '1 image' : `${imgCount} ↓`}
                            </button>
                        </>
                    )}
                    {entry.status === 'done' && imgCount === 0 && (
                        <span className="text-[10px] text-amber-500 font-bold px-2">No images found</span>
                    )}
                    {entry.status === 'error' && (
                        <button onClick={onExtract}
                            className="px-3 py-1.5 bg-red-500 hover:bg-red-400 text-white text-xs font-bold rounded-xl flex items-center gap-1.5">
                            <RotateCcw className="w-3.5 h-3.5" /> Retry
                        </button>
                    )}
                    <button onClick={onRemove}
                        className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Progress */}
            {entry.status === 'extracting' && (
                <div className="h-1 bg-gray-100 dark:bg-white/5">
                    <motion.div className="h-full bg-gradient-to-r from-cyan-500 to-teal-400"
                        animate={{ width: `${entry.progress}%` }} transition={{ duration: 0.25 }} />
                </div>
            )}
            {entry.status === 'done' && <div className="h-0.5 bg-emerald-400/60" />}
            {entry.status === 'error' && <div className="h-0.5 bg-red-400/60" />}

            {/* Page range */}
            <AnimatePresence>
                {showRange && entry.status === 'ready' && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                        <div className="px-4 pb-4 pt-2 border-t border-gray-50 dark:border-white/5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                                Scan Pages <span className="normal-case font-normal">(e.g. 1,3,5-8 · blank = all)</span>
                            </p>
                            <div className="flex items-center gap-2">
                                <input type="text" value={rangeVal} onChange={e => setRangeVal(e.target.value)}
                                    onBlur={() => onPageRange(rangeVal)}
                                    placeholder={`1-${entry.totalPages}`}
                                    className="flex-1 px-3 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-xs font-mono dark:text-white outline-none focus:ring-2 focus:ring-cyan-400" />
                                <button onClick={() => { onPageRange(rangeVal); setShowRange(false); }}
                                    className="px-3 py-2 bg-cyan-600 text-white text-xs font-bold rounded-xl hover:bg-cyan-500">Apply</button>
                                <button onClick={() => { setRangeVal(''); onPageRange(''); }}
                                    className="px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 text-xs font-bold rounded-xl hover:bg-gray-200">All</button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Gallery */}
            <AnimatePresence>
                {showGallery && entry.result && entry.result.images.length > 0 && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
                        <div className="border-t border-gray-50 dark:border-white/5 p-4">
                            <ImageGallery images={entry.result.images} format={format}
                                onLightbox={i => onLightbox(i)} />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

// ── Main Component ────────────────────────────────────────────────────────────

export const ExtractImages: React.FC<Props> = ({ onBack }) => {
    const [files, setFiles] = useState<ManagedFile[]>([]);
    const [isDragOver, setIsDragOver] = useState(false);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [infoOpen, setInfoOpen] = useState(false);
    const [format, setFormat] = useState<ImageFormat>('png');

    // Lightbox state: which fileId + which image index
    const [lightbox, setLightbox] = useState<{ fileId: string; index: number } | null>(null);

    const dropRef = useRef<HTMLDivElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    // Revoke blob URLs on unmount
    useEffect(() => {
        return () => {
            setFiles(prev => { prev.forEach(f => f.result && revokeImageUrls(f.result.images)); return []; });
        };
    }, []);

    const toast = useCallback((type: Toast['type'], message: string) => {
        const id = uid();
        setToasts(prev => [...prev.slice(-4), { id, type, message }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 7000);
    }, []);

    const initFile = useCallback(async (raw: File): Promise<ManagedFile> => {
        let thumb = '', totalPages = 0;
        try { const r = await generateThumb(raw); thumb = r.thumb; totalPages = r.totalPages; }
        catch { /* use icon */ }
        return {
            id: uid(), file: raw, status: 'ready', progress: 0,
            totalPages, selectedPages: [],
            result: null, error: '', thumb,
        };
    }, []);

    const addFiles = useCallback(async (incoming: FileList | File[]) => {
        const arr = Array.from(incoming);
        const valid: File[] = [];
        for (const f of arr) {
            const err = validatePdfForExtract(f);
            if (err) { toast('error', err); continue; }
            if (files.some(e => e.file.name === f.name && e.file.size === f.size)) {
                toast('info', `"${f.name}" already added.`); continue;
            }
            valid.push(f);
        }
        if (!valid.length) return;

        const skeletons: ManagedFile[] = valid.map(f => ({
            id: uid(), file: f, status: 'loading-meta' as FileStatus, progress: 0,
            totalPages: 0, selectedPages: [], result: null, error: '', thumb: '',
        }));
        setFiles(prev => [...prev, ...skeletons]);

        const results = await Promise.all(valid.map(f => initFile(f)));
        setFiles(prev => {
            const copy = [...prev];
            for (let i = 0; i < skeletons.length; i++) {
                const idx = copy.findIndex(x => x.id === skeletons[i].id);
                if (idx !== -1) copy[idx] = results[i];
            }
            return copy;
        });
    }, [files, toast, initFile]);

    const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
    const onDragLeave = (e: React.DragEvent) => {
        if (!dropRef.current?.contains(e.relatedTarget as Node)) setIsDragOver(false);
    };
    const onDrop = (e: React.DragEvent) => {
        e.preventDefault(); setIsDragOver(false); addFiles(e.dataTransfer.files);
    };

    const updateFile = (id: string, patch: Partial<ManagedFile>) =>
        setFiles(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));

    const extractOne = useCallback(async (id: string) => {
        const entry = files.find(f => f.id === id);
        if (!entry) return;
        // Revoke old blob URLs
        if (entry.result) revokeImageUrls(entry.result.images);
        updateFile(id, { status: 'extracting', progress: 0, error: '', result: null });
        try {
            const result = await extractImagesFromPdf(entry.file, {
                selectedPages: entry.selectedPages.length > 0 ? entry.selectedPages : undefined,
                format,
                onProgress: p => updateFile(id, { progress: p }),
            });
            updateFile(id, { status: 'done', result, progress: 100 });
            if (result.images.length === 0) {
                toast('info', `"${entry.file.name}" — no embedded raster images found. The PDF may be text-only or use vector graphics.`);
            } else {
                toast('success', `✅ "${entry.file.name}" — ${result.images.length} image${result.images.length !== 1 ? 's' : ''} extracted from ${result.scannedPages} page${result.scannedPages !== 1 ? 's' : ''}.`);
            }
        } catch (err: any) {
            const msg = err?.message ?? 'Extraction failed.';
            updateFile(id, { status: 'error', error: msg, progress: 0 });
            toast('error', msg);
        }
    }, [files, format, toast]);

    const extractAll = useCallback(async () => {
        const ready = files.filter(f => f.status === 'ready' || f.status === 'error');
        for (const f of ready) await extractOne(f.id);
    }, [files, extractOne]);

    const downloadAllZip = async () => {
        const allImgs = files.flatMap(f => f.result?.images ?? []);
        if (!allImgs.length) return;
        const ext = format === 'jpeg' ? 'jpg' : 'png';
        const zip = new JSZip();
        for (const img of allImgs) zip.file(`${img.name}.${ext}`, img.blob);
        downloadBlob(await zip.generateAsync({ type: 'blob' }), 'OmniPDF_Extracted_Images.zip');
    };

    const removeFile = (id: string) => {
        const entry = files.find(f => f.id === id);
        if (entry?.result) revokeImageUrls(entry.result.images);
        setFiles(p => p.filter(f => f.id !== id));
    };

    const isExtracting = files.some(f => f.status === 'extracting');
    const readyCount = files.filter(f => f.status === 'ready' || f.status === 'error').length;
    const totalExtracted = files.reduce((s, f) => s + (f.result?.images.length ?? 0), 0);
    const doneWithImages = files.filter(f => f.status === 'done' && (f.result?.images.length ?? 0) > 0).length;

    // Lightbox images from the focused file
    const lightboxFile = lightbox ? files.find(f => f.id === lightbox.fileId) : null;
    const lightboxImages = lightboxFile?.result?.images ?? [];

    return (
        <div className="flex-1 flex flex-col h-full bg-[#f3f1ea] dark:bg-[#1e1e2e] overflow-hidden relative">

            {/* Toasts */}
            <div className="fixed top-6 right-6 z-[200] flex flex-col gap-2 items-end pointer-events-none">
                <AnimatePresence>
                    {toasts.map(t => (
                        <div key={t.id} className="pointer-events-auto">
                            <ToastItem toast={t} onDismiss={() => setToasts(p => p.filter(x => x.id !== t.id))} />
                        </div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Lightbox */}
            <AnimatePresence>
                {lightbox && lightboxImages.length > 0 && (
                    <Lightbox
                        images={lightboxImages}
                        index={lightbox.index}
                        onClose={() => setLightbox(null)}
                        onNav={i => setLightbox(prev => prev ? { ...prev, index: i } : null)}
                    />
                )}
            </AnimatePresence>

            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-6 py-4 bg-[#f3f1ea] dark:bg-[#262636] border-b border-gray-100 dark:border-white/5 shadow-sm">
                <div className="flex items-center gap-3">
                    {onBack && (
                        <button onClick={onBack} className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-colors text-gray-500">
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}
                    <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 rounded-xl">
                        <ImageIcon className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                    </div>
                    <div>
                        <h1 className="text-lg font-black dark:text-white tracking-tight">Extract PDF Images</h1>
                        <p className="text-[11px] text-gray-400 font-medium">Find &amp; export all embedded raster images from PDFs</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {totalExtracted > 0 && (
                        <span className="text-[10px] font-black uppercase tracking-widest text-cyan-600 dark:text-cyan-400 px-3 py-1.5 bg-cyan-50 dark:bg-cyan-900/20 rounded-xl">
                            {totalExtracted} image{totalExtracted !== 1 ? 's' : ''} extracted
                        </span>
                    )}
                    {doneWithImages > 1 && (
                        <button onClick={downloadAllZip}
                            className="px-3 py-2 text-xs font-bold text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 rounded-xl flex items-center gap-1.5 transition-colors">
                            <Archive className="w-3.5 h-3.5" /> All Images (ZIP)
                        </button>
                    )}
                    {readyCount > 1 && (
                        <button onClick={extractAll} disabled={isExtracting}
                            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-colors shadow-sm flex items-center gap-1.5">
                            <ImageIcon className="w-3.5 h-3.5" /> Extract All ({readyCount})
                        </button>
                    )}
                    {files.length > 0 && (
                        <button onClick={() => { files.forEach(f => f.result && revokeImageUrls(f.result.images)); setFiles([]); }}
                            className="px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl flex items-center gap-1.5 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" /> Clear
                        </button>
                    )}
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 flex overflow-hidden">

                {/* LEFT */}
                <div className="flex-1 flex flex-col overflow-hidden p-4 lg:p-6 gap-4 min-w-0">

                    {/* Drop zone */}
                    <div ref={dropRef} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                        onClick={() => fileRef.current?.click()}
                        className={`shrink-0 flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl py-10 cursor-pointer transition-all duration-200
              ${isDragOver ? 'border-cyan-500 bg-cyan-500/5 scale-[0.99]' : 'border-gray-200 dark:border-white/10 bg-white dark:bg-[#262636]'}
              hover:border-cyan-400 dark:hover:border-cyan-500/50 hover:bg-cyan-50/30 dark:hover:bg-cyan-900/10`}>
                        <input ref={fileRef} type="file" accept={ACCEPT} multiple className="hidden"
                            onChange={e => e.target.files && addFiles(e.target.files)} />
                        <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                            className="p-4 bg-cyan-100 dark:bg-cyan-900/30 rounded-2xl shadow-lg shadow-cyan-200 dark:shadow-cyan-900/30">
                            <Upload className="w-7 h-7 text-cyan-600 dark:text-cyan-400" />
                        </motion.div>
                        <div className="text-center">
                            <p className="text-base font-black dark:text-white">Drop PDF files here</p>
                            <p className="text-sm text-gray-400 mt-0.5">
                                or <span className="text-cyan-500 font-bold underline underline-offset-2">click to browse</span>
                            </p>
                        </div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 dark:text-gray-600">
                            PDF only · Max {EXTRACT_MAX_MB} MB · Extracts embedded raster images only
                        </p>
                    </div>

                    {/* File list */}
                    <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pb-4">
                        <AnimatePresence mode="popLayout">
                            {files.length === 0 ? (
                                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                    className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
                                    <div className="p-5 bg-gray-100 dark:bg-white/5 rounded-2xl">
                                        <ImageIcon className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                                    </div>
                                    <p className="text-sm font-bold text-gray-400">No PDFs added yet</p>
                                    <p className="text-xs text-gray-300 dark:text-gray-600 max-w-xs leading-relaxed">
                                        Works best with PDFs that contain embedded photos, diagrams, or screenshots — not text-only or vector-only PDFs.
                                    </p>
                                </motion.div>
                            ) : (
                                files.map(entry => (
                                    <FileCard key={entry.id} entry={entry} format={format}
                                        isAnyExtracting={isExtracting}
                                        onRemove={() => removeFile(entry.id)}
                                        onExtract={() => extractOne(entry.id)}
                                        onPageRange={raw => updateFile(entry.id, {
                                            selectedPages: raw.trim() ? parseRange(raw, entry.totalPages) : [],
                                        })}
                                        onLightbox={i => setLightbox({ fileId: entry.id, index: i })}
                                    />
                                ))
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* RIGHT: settings */}
                <div className="w-72 shrink-0 flex flex-col border-l border-gray-100 dark:border-white/5 bg-[#f3f1ea] dark:bg-[#262636] overflow-y-auto">

                    {/* Stats */}
                    {files.length > 0 && (
                        <div className="p-5 border-b border-gray-100 dark:border-white/5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Stats</p>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { label: 'Files', value: files.length, color: 'text-cyan-600 dark:text-cyan-400' },
                                    { label: 'Extracted', value: totalExtracted, color: 'text-emerald-600 dark:text-emerald-400' },
                                    { label: 'Ready', value: readyCount, color: 'text-gray-500 dark:text-gray-400' },
                                    { label: 'Done', value: files.filter(f => f.status === 'done').length, color: 'text-gray-700 dark:text-gray-300' },
                                ].map(s => (
                                    <div key={s.label} className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 text-center">
                                        <p className={`text-base font-black ${s.color}`}>{s.value}</p>
                                        <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mt-0.5">{s.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Format selector */}
                    <div className="p-5 border-b border-gray-100 dark:border-white/5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Output Format</p>
                        <div className="grid grid-cols-2 gap-1.5">
                            {([
                                { v: 'png' as ImageFormat, label: 'PNG', sub: 'Lossless · best for diagrams' },
                                { v: 'jpeg' as ImageFormat, label: 'JPEG', sub: 'Smaller · best for photos' },
                            ]).map(opt => (
                                <button key={opt.v} onClick={() => setFormat(opt.v)}
                                    className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all
                    ${format === opt.v
                                            ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300'
                                            : 'border-gray-100 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-cyan-200'}`}>
                                    <span className="text-lg font-black">.{opt.v === 'jpeg' ? 'jpg' : opt.v}</span>
                                    <span className="text-[9px] opacity-70 text-center leading-tight">{opt.sub}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* How it works */}
                    <div className="border-b border-gray-100 dark:border-white/5">
                        <button onClick={() => setInfoOpen(v => !v)}
                            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                            <span className="flex items-center gap-2 text-xs font-bold text-gray-600 dark:text-gray-300">
                                <Info className="w-3.5 h-3.5" /> How it works
                            </span>
                            {infoOpen ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                        </button>
                        <AnimatePresence>
                            {infoOpen && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                    <div className="px-5 pb-5 space-y-3 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                                        <p>OmniPDF walks each PDF page's operator list to find <code className="text-[10px] bg-gray-100 dark:bg-white/10 px-1 rounded">ImageXObject</code> commands, then decodes the raw pixel data and exports it as PNG or JPEG.</p>
                                        <p>Only <strong className="text-gray-700 dark:text-gray-200">embedded raster images</strong> (photos, screenshots, diagrams stored as bitmaps) are extracted. Vector graphics, text, and drawn paths are not images and will not appear.</p>
                                        <p className="text-amber-600 dark:text-amber-400 font-bold">
                                            ⚠ Very small images (icons, color markers) are automatically filtered out.
                                        </p>
                                        <div className="flex items-start gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-500/20 rounded-xl">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                                            <p className="text-[10px] text-emerald-700 dark:text-emerald-300">
                                                <strong>100% in your browser.</strong> Files never leave your device.
                                            </p>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Tips */}
                    <div className="p-5 space-y-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Tips</p>
                        {[
                            { icon: '🖼️', text: 'Use PNG for diagrams/charts — lossless quality. Use JPEG for photos — smaller file size.' },
                            { icon: '📑', text: 'Use page ranges to scan only the pages where you expect images.' },
                            { icon: '🔍', text: 'Click the grid icon (☰) on a file card to open the image gallery inline.' },
                            { icon: '🔎', text: 'Click any thumbnail to open the full-screen lightbox with keyboard navigation.' },
                        ].map((tip, i) => (
                            <div key={i} className="flex items-start gap-2.5">
                                <span className="text-sm shrink-0">{tip.icon}</span>
                                <p className="text-[10px] text-gray-400 leading-relaxed">{tip.text}</p>
                            </div>
                        ))}
                    </div>

                    <div className="flex-1" />

                    {/* Badge */}
                    <div className="p-5 border-t border-gray-100 dark:border-white/5">
                        <div className="flex items-center gap-3 p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-xl">
                            <div className="w-8 h-8 shrink-0 rounded-lg bg-cyan-600 flex items-center justify-center">
                                <ImageIcon className="w-4 h-4 text-white" />
                            </div>
                            <div>
                                <p className="text-[11px] font-black text-cyan-700 dark:text-cyan-300">Output: PNG / JPEG</p>
                                <p className="text-[9px] text-cyan-500 leading-tight">Original resolution · per-image download or ZIP</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
