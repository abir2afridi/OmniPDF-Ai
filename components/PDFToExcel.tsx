/**
 * PDFToExcel — Production-ready PDF → XLSX module
 *
 * UX highlights:
 * - Multi-file drag & drop (PDF only)
 * - First-page thumbnail via pdfjs
 * - Page-range selector per file
 * - One-sheet-per-page vs. combined sheet toggle
 * - Inline output filename rename
 * - Per-file progress bars
 * - Batch Convert All / Download All as ZIP
 * - Toast notifications
 * - Green brand color (distinct from all other modules)
 */

import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    FileSpreadsheet, Upload, X, Download, Loader2, CheckCircle2,
    AlertCircle, ArrowLeft, Trash2, RotateCcw, Settings2,
    ChevronDown, ChevronUp, FileDown, Info, Archive, Layers,
} from 'lucide-react';
import {
    convertPdfToExcel, validatePdfForExcel, fmtSize,
    PDF_TO_XLS_MAX_MB,
    type PdfToExcelResult,
} from '../services/pdfToExcelService';
import { downloadBlob } from '../services/pdfService';
import JSZip from 'jszip';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

if (GlobalWorkerOptions) {
    GlobalWorkerOptions.workerSrc =
        `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type FileStatus = 'idle' | 'loading-meta' | 'ready' | 'converting' | 'done' | 'error';

interface ManagedFile {
    id: string;
    file: File;
    status: FileStatus;
    progress: number;
    totalPages: number;
    selectedPages: number[];
    outputName: string;
    result: PdfToExcelResult | null;
    error: string;
    thumb: string;
}

interface Toast { id: string; type: 'success' | 'error' | 'info'; message: string; }

interface PDFToExcelProps { onBack?: () => void; }

// ── Helpers ───────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 10);
const ACCEPT = '.pdf,application/pdf';

async function generateThumb(file: File): Promise<{ thumb: string; totalPages: number }> {
    const buf = await file.arrayBuffer();
    const pdf = await getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    const vp = page.getViewport({ scale: 0.4 });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
    return { thumb: canvas.toDataURL('image/jpeg', 0.6), totalPages: pdf.numPages };
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
                    : 'bg-sky-50 dark:bg-sky-900/60 border-sky-200 dark:border-sky-500/30 text-sky-800 dark:text-sky-200'}`}>
        {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
        {toast.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
        {toast.type === 'info' && <Info className="w-4 h-4 shrink-0 mt-0.5" />}
        <span className="flex-1 leading-snug">{toast.message}</span>
        <button onClick={onDismiss}><X className="w-3.5 h-3.5 opacity-60 hover:opacity-100" /></button>
    </motion.div>
);

// ── File Card ─────────────────────────────────────────────────────────────────

interface FileCardProps {
    entry: ManagedFile;
    oneSheetPerPage: boolean;
    isAnyConverting: boolean;
    onRemove: () => void;
    onConvert: () => void;
    onDownload: () => void;
    onRename: (name: string) => void;
    onPageRangeChange: (raw: string) => void;
}

const FileCard: React.FC<FileCardProps> = ({
    entry, oneSheetPerPage, isAnyConverting, onRemove, onConvert, onDownload, onRename, onPageRangeChange,
}) => {
    const [showRange, setShowRange] = useState(false);
    const [rangeVal, setRangeVal] = useState('');

    const dot: Record<FileStatus, string> = {
        'idle': 'bg-gray-300 dark:bg-gray-600',
        'loading-meta': 'bg-green-400 animate-pulse',
        'ready': 'bg-green-500',
        'converting': 'bg-green-400 animate-pulse',
        'done': 'bg-emerald-500',
        'error': 'bg-red-500',
    };

    const pagesLabel = entry.selectedPages.length > 0
        ? `${entry.selectedPages.length} page${entry.selectedPages.length !== 1 ? 's' : ''} selected`
        : entry.totalPages > 0 ? `All ${entry.totalPages} pages` : '—';

    const sheetLabel = oneSheetPerPage
        ? `${entry.selectedPages.length || entry.totalPages} sheet${(entry.selectedPages.length || entry.totalPages) !== 1 ? 's' : ''}`
        : '1 sheet';

    return (
        <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">

            {/* Main row */}
            <div className="flex items-center gap-3 p-4">
                <div className={`w-2 h-2 rounded-full shrink-0 ${dot[entry.status]}`} />

                {/* Thumbnail */}
                <div className="w-10 h-12 shrink-0 rounded-lg overflow-hidden bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10 flex items-center justify-center">
                    {entry.thumb
                        ? <img src={entry.thumb} alt="preview" className="w-full h-full object-cover" />
                        : <FileSpreadsheet className="w-5 h-5 text-gray-300 dark:text-gray-600" />}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    {(entry.status === 'ready' || entry.status === 'done') ? (
                        <input value={entry.outputName} onChange={e => onRename(e.target.value)}
                            className="w-full text-sm font-bold dark:text-white bg-transparent outline-none border-b border-transparent hover:border-green-300 focus:border-green-400 transition-colors font-mono truncate" />
                    ) : (
                        <p className="text-sm font-bold dark:text-white truncate">{entry.file.name}</p>
                    )}
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-gray-400 font-mono">{fmtSize(entry.file.size)}</span>
                        {entry.totalPages > 0 && (
                            <span className="text-[10px] text-green-600 dark:text-green-400 font-bold">{pagesLabel} → {sheetLabel}</span>
                        )}
                        {entry.status === 'done' && entry.result && (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                                ✓ {entry.result.sheetsCreated} sheet{entry.result.sheetsCreated !== 1 ? 's' : ''} · {entry.result.totalRows.toLocaleString()} rows · {fmtSize(entry.result.fileSizeBytes)}
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
                                <button onClick={() => setShowRange(v => !v)} title="Page range"
                                    className="p-1.5 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg text-green-400 hover:text-green-600 transition-colors">
                                    <Settings2 className="w-4 h-4" />
                                </button>
                            )}
                            <button onClick={onConvert} disabled={isAnyConverting}
                                className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm">
                                Convert
                            </button>
                        </>
                    )}
                    {entry.status === 'converting' && (
                        <div className="flex items-center gap-2 px-3">
                            <Loader2 className="w-4 h-4 animate-spin text-green-500" />
                            <span className="text-xs text-green-500 font-bold">{entry.progress}%</span>
                        </div>
                    )}
                    {entry.status === 'done' && (
                        <>
                            <button onClick={onConvert} title="Re-convert"
                                className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg text-gray-400 transition-colors">
                                <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={onDownload}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-colors shadow-sm flex items-center gap-1.5">
                                <Download className="w-3.5 h-3.5" /> .xlsx
                            </button>
                        </>
                    )}
                    {entry.status === 'error' && (
                        <button onClick={onConvert}
                            className="px-3 py-1.5 bg-red-500 hover:bg-red-400 text-white text-xs font-bold rounded-xl transition-colors shadow-sm flex items-center gap-1.5">
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
            {entry.status === 'converting' && (
                <div className="h-1 bg-gray-100 dark:bg-white/5">
                    <motion.div className="h-full bg-gradient-to-r from-green-500 to-emerald-400"
                        animate={{ width: `${entry.progress}%` }} transition={{ duration: 0.25, ease: 'easeOut' }} />
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
                                Page Range <span className="text-gray-300 normal-case font-normal">(e.g. 1,3,5-8 · blank = all)</span>
                            </p>
                            <div className="flex items-center gap-2">
                                <input type="text" value={rangeVal} onChange={e => setRangeVal(e.target.value)}
                                    onBlur={() => onPageRangeChange(rangeVal)}
                                    placeholder={`1-${entry.totalPages}`}
                                    className="flex-1 px-3 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-xs font-mono dark:text-white outline-none focus:ring-2 focus:ring-green-400" />
                                <button onClick={() => { onPageRangeChange(rangeVal); setShowRange(false); }}
                                    className="px-3 py-2 bg-green-600 text-white text-xs font-bold rounded-xl hover:bg-green-500">
                                    Apply
                                </button>
                                <button onClick={() => { setRangeVal(''); onPageRangeChange(''); }}
                                    className="px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 text-xs font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-white/10">
                                    All
                                </button>
                            </div>
                            {entry.selectedPages.length > 0 && (
                                <p className="text-[10px] text-green-600 dark:text-green-400 font-bold mt-2">
                                    ✓ Pages: {entry.selectedPages.slice(0, 8).map(i => i + 1).join(', ')}{entry.selectedPages.length > 8 ? ` +${entry.selectedPages.length - 8} more` : ''}
                                </p>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

// ── Main Component ────────────────────────────────────────────────────────────

export const PDFToExcel: React.FC<PDFToExcelProps> = ({ onBack }) => {
    const [files, setFiles] = useState<ManagedFile[]>([]);
    const [isDragOver, setIsDragOver] = useState(false);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [infoOpen, setInfoOpen] = useState(false);
    const [oneSheetPerPage, setOneSheetPerPage] = useState(true);

    const dropRef = useRef<HTMLDivElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    // ── Toasts
    const toast = useCallback((type: Toast['type'], message: string) => {
        const id = uid();
        setToasts(prev => [...prev.slice(-4), { id, type, message }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 7000);
    }, []);

    // ── Load meta + thumbnail
    const initFile = useCallback(async (raw: File): Promise<ManagedFile> => {
        let thumb = '', totalPages = 0;
        try {
            const r = await generateThumb(raw);
            thumb = r.thumb; totalPages = r.totalPages;
        } catch { /* fallback to icon */ }
        return {
            id: uid(), file: raw, status: 'ready', progress: 0,
            totalPages, selectedPages: [],
            outputName: raw.name.replace(/\.pdf$/i, ''),
            result: null, error: '', thumb,
        };
    }, []);

    // ── Add files
    const addFiles = useCallback(async (incoming: FileList | File[]) => {
        const arr = Array.from(incoming);
        const valid: File[] = [];
        for (const f of arr) {
            const err = validatePdfForExcel(f);
            if (err) { toast('error', err); continue; }
            if (files.some(e => e.file.name === f.name && e.file.size === f.size)) {
                toast('info', `"${f.name}" already added.`); continue;
            }
            valid.push(f);
        }
        if (valid.length === 0) return;

        const skeletons: ManagedFile[] = valid.map(f => ({
            id: uid(), file: f, status: 'loading-meta', progress: 0,
            totalPages: 0, selectedPages: [], outputName: f.name.replace(/\.pdf$/i, ''),
            result: null, error: '', thumb: '',
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

    // ── Convert one
    const convertOne = useCallback(async (id: string) => {
        const entry = files.find(f => f.id === id);
        if (!entry) return;
        updateFile(id, { status: 'converting', progress: 0, error: '', result: null });
        try {
            const result = await convertPdfToExcel(entry.file, {
                selectedPages: entry.selectedPages.length > 0 ? entry.selectedPages : undefined,
                outputName: entry.outputName,
                oneSheetPerPage,
                onProgress: p => updateFile(id, { progress: p }),
            });
            updateFile(id, { status: 'done', result, progress: 100 });
            toast('success', `✅ "${entry.outputName}.xlsx" · ${result.sheetsCreated} sheet${result.sheetsCreated !== 1 ? 's' : ''}, ${result.totalRows.toLocaleString()} rows`);
        } catch (err: any) {
            const msg = err?.message ?? 'Conversion failed.';
            updateFile(id, { status: 'error', error: msg, progress: 0 });
            toast('error', msg);
        }
    }, [files, oneSheetPerPage, toast]);

    // ── Convert all
    const convertAll = useCallback(async () => {
        const ready = files.filter(f => f.status === 'ready' || f.status === 'error');
        for (const f of ready) await convertOne(f.id);
    }, [files, convertOne]);

    // ── Download one
    const downloadOne = (id: string) => {
        const e = files.find(f => f.id === id);
        if (!e?.result) return;
        downloadBlob(e.result.blob, `${e.outputName}.xlsx`);
    };

    // ── Download all as ZIP
    const downloadAll = async () => {
        const done = files.filter(f => f.status === 'done' && f.result);
        if (!done.length) return;
        const zip = new JSZip();
        for (const f of done) {
            zip.file(`${f.outputName}.xlsx`, await f.result!.blob.arrayBuffer());
        }
        downloadBlob(await zip.generateAsync({ type: 'blob' }), 'OmniPDF_Excel_Export.zip');
    };

    const removeFile = (id: string) => setFiles(p => p.filter(f => f.id !== id));
    const isConverting = files.some(f => f.status === 'converting');
    const readyCount = files.filter(f => f.status === 'ready' || f.status === 'error').length;
    const doneCount = files.filter(f => f.status === 'done').length;
    const totalPages = files.reduce((s, f) => s + (f.totalPages || 0), 0);

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

            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-6 py-4 bg-[#f3f1ea] dark:bg-[#262636] border-b border-gray-100 dark:border-white/5 shadow-sm">
                <div className="flex items-center gap-3">
                    {onBack && (
                        <button onClick={onBack}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-colors text-gray-500">
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}
                    <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-xl">
                        <FileSpreadsheet className="w-5 h-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                        <h1 className="text-lg font-black dark:text-white tracking-tight">PDF to Excel</h1>
                        <p className="text-[11px] text-gray-400 font-medium">Extract tables & data from PDF → editable .xlsx</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {doneCount > 1 && (
                        <button onClick={downloadAll}
                            className="px-3 py-2 text-xs font-bold text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-xl flex items-center gap-1.5 transition-colors">
                            <Archive className="w-3.5 h-3.5" /> Download All ({doneCount})
                        </button>
                    )}
                    {readyCount > 1 && (
                        <button onClick={convertAll} disabled={isConverting}
                            className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-colors shadow-sm flex items-center gap-1.5">
                            <FileDown className="w-3.5 h-3.5" /> Convert All ({readyCount})
                        </button>
                    )}
                    {files.length > 0 && (
                        <button onClick={() => setFiles([])}
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
              ${isDragOver ? 'border-green-500 bg-green-500/5 scale-[0.99]' : 'border-gray-200 dark:border-white/10 bg-white dark:bg-[#262636]'}
              hover:border-green-400 dark:hover:border-green-500/50 hover:bg-green-50/30 dark:hover:bg-green-900/10`}>
                        <input ref={fileRef} type="file" accept={ACCEPT} multiple className="hidden"
                            onChange={e => e.target.files && addFiles(e.target.files)} />
                        <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                            className="p-4 bg-green-100 dark:bg-green-900/30 rounded-2xl shadow-lg shadow-green-200 dark:shadow-green-900/30">
                            <Upload className="w-7 h-7 text-green-600 dark:text-green-400" />
                        </motion.div>
                        <div className="text-center">
                            <p className="text-base font-black dark:text-white">Drop PDF files here</p>
                            <p className="text-sm text-gray-400 mt-0.5">
                                or <span className="text-green-500 font-bold underline underline-offset-2">click to browse</span>
                            </p>
                        </div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 dark:text-gray-600">
                            PDF only · Max {PDF_TO_XLS_MAX_MB} MB per file
                        </p>
                    </div>

                    {/* File list */}
                    <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pb-4">
                        <AnimatePresence mode="popLayout">
                            {files.length === 0 ? (
                                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                    className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
                                    <div className="p-5 bg-gray-100 dark:bg-white/5 rounded-2xl">
                                        <FileSpreadsheet className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                                    </div>
                                    <p className="text-sm font-bold text-gray-400">No PDFs added yet</p>
                                    <p className="text-xs text-gray-300 dark:text-gray-600 max-w-xs leading-relaxed">
                                        Upload PDFs with tables or structured data. Each page becomes a separate Excel sheet by default.
                                    </p>
                                </motion.div>
                            ) : (
                                files.map(entry => (
                                    <FileCard
                                        key={entry.id}
                                        entry={entry}
                                        oneSheetPerPage={oneSheetPerPage}
                                        isAnyConverting={isConverting}
                                        onRemove={() => removeFile(entry.id)}
                                        onConvert={() => convertOne(entry.id)}
                                        onDownload={() => downloadOne(entry.id)}
                                        onRename={name => updateFile(entry.id, { outputName: name })}
                                        onPageRangeChange={raw => {
                                            updateFile(entry.id, {
                                                selectedPages: raw.trim() ? parseRange(raw, entry.totalPages) : [],
                                            });
                                        }}
                                    />
                                ))
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* RIGHT: controls */}
                <div className="w-72 shrink-0 flex flex-col border-l border-gray-100 dark:border-white/5 bg-[#f3f1ea] dark:bg-[#262636] overflow-y-auto">

                    {/* Stats */}
                    {files.length > 0 && (
                        <div className="p-5 border-b border-gray-100 dark:border-white/5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Queue</p>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { label: 'Files', value: files.length, color: 'text-green-600 dark:text-green-400' },
                                    { label: 'Pages', value: totalPages || '—', color: 'text-gray-700 dark:text-gray-200' },
                                    { label: 'Ready', value: readyCount, color: 'text-gray-500 dark:text-gray-400' },
                                    { label: 'Converted', value: doneCount, color: 'text-emerald-600 dark:text-emerald-400' },
                                ].map(s => (
                                    <div key={s.label} className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 text-center">
                                        <p className={`text-base font-black ${s.color}`}>{s.value}</p>
                                        <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mt-0.5">{s.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Sheet mode toggle */}
                    <div className="p-5 border-b border-gray-100 dark:border-white/5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Output Mode</p>
                        <div className="grid grid-cols-2 gap-1.5">
                            {([
                                { v: true, label: 'Per Page', icon: Layers, note: 'One sheet per PDF page' },
                                { v: false, label: 'Combined', icon: FileSpreadsheet, note: 'All pages in one sheet' },
                            ] as const).map(opt => (
                                <button key={String(opt.v)} onClick={() => setOneSheetPerPage(opt.v)}
                                    className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all text-[10px] font-bold
                    ${oneSheetPerPage === opt.v
                                            ? 'border-green-500 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                            : 'border-gray-100 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-green-200'}`}>
                                    <opt.icon className="w-4 h-4" />
                                    <span className="font-black text-[11px]">{opt.label}</span>
                                    <span className="opacity-70 text-center leading-tight">{opt.note}</span>
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
                                        <p>OmniPDF extracts text positions from the PDF and uses spatial analysis to detect column boundaries and table rows, then writes them to Excel sheets with styled headers.</p>
                                        <p>Works best with <strong className="text-gray-700 dark:text-gray-200">text-based PDFs</strong> that contain clear tabular data. Scanned documents (images) will produce empty sheets.</p>
                                        <p className="text-amber-600 dark:text-amber-400 font-bold">
                                            ⚠ Complex merged cells, rotated text, or overlapping columns may not reconstruct perfectly.
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
                            { icon: '📊', text: 'Works best with PDFs that have clearly separated columns.' },
                            { icon: '✏️', text: 'Click the filename to rename your output file before downloading.' },
                            { icon: '📋', text: 'Use page ranges to extract tables only from specific pages.' },
                            { icon: '📦', text: '"Download All" bundles every .xlsx into a single ZIP.' },
                        ].map((tip, i) => (
                            <div key={i} className="flex items-start gap-2.5">
                                <span className="text-sm shrink-0">{tip.icon}</span>
                                <p className="text-[10px] text-gray-400 leading-relaxed">{tip.text}</p>
                            </div>
                        ))}
                    </div>

                    <div className="flex-1" />

                    {/* Excel badge */}
                    <div className="p-5 border-t border-gray-100 dark:border-white/5">
                        <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
                            <div className="w-8 h-8 shrink-0 rounded-lg bg-green-600 flex items-center justify-center">
                                <FileSpreadsheet className="w-4 h-4 text-white" />
                            </div>
                            <div>
                                <p className="text-[11px] font-black text-green-700 dark:text-green-300">Output: .xlsx</p>
                                <p className="text-[9px] text-green-500 leading-tight">Open in Excel, LibreOffice, Google Sheets</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
