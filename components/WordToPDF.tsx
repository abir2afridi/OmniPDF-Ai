/**
 * WordToPDF — Production-ready Word → PDF conversion module.
 *
 * Features:
 * - Multi-file drag & drop upload (.docx / .doc)
 * - Per-file HTML preview in an inline panel
 * - Individual OR batch conversion
 * - Animated circular progress overlay per conversion
 * - Download individual PDFs or all as ZIP
 * - Output filename rename
 * - Merge option (download all as one ZIP bundle)
 * - Removal of individual files before conversion
 * - Rich error reporting per file
 * - Privacy badge (100% browser-side)
 */

import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    FileText, Upload, X, Download, Loader2, CheckCircle2,
    AlertCircle, Info, ArrowLeft, ChevronDown, ChevronUp,
    Settings2, FileDown, Eye, EyeOff, Layers, Trash2,
    RotateCw, RefreshCw, Package,
} from 'lucide-react';
import {
    convertWordToPDF,
    batchConvertWordToPDF,
    validateWordFile,
    WORD_MAX_FILE_MB,
    type WordConversionResult,
} from '../services/wordService';
import { downloadBytes } from '../services/pdfService';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Toast {
    id: string;
    type: 'success' | 'error' | 'info';
    message: string;
}

type FileStatus = 'idle' | 'converting' | 'done' | 'error';

interface ManagedFile {
    id: string;
    file: File;
    status: FileStatus;
    progress: number;
    result?: WordConversionResult;
    errorMsg?: string;
    customName: string;
    previewOpen: boolean;
}

interface WordToPDFProps {
    onBack?: () => void;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 10);
const formatBytes = (b: number) => {
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(2)} MB`;
};
const ACCEPT = '.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const statusColor: Record<FileStatus, string> = {
    idle: 'text-gray-400',
    converting: 'text-blue-500',
    done: 'text-emerald-500',
    error: 'text-red-500',
};

// ── ToastItem ─────────────────────────────────────────────────────────────────

const ToastItem = ({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) => (
    <motion.div
        layout
        initial={{ opacity: 0, x: 60, scale: 0.9 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 60, scale: 0.9 }}
        className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-xl max-w-sm text-sm font-medium border backdrop-blur-md pointer-events-auto
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

// ── Circular Progress ─────────────────────────────────────────────────────────

const CircularProgress = ({ value, size = 36 }: { value: number; size?: number }) => {
    const r = (size - 6) / 2;
    const circ = 2 * Math.PI * r;
    return (
        <svg width={size} height={size} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor"
                strokeWidth="3" className="text-gray-200 dark:text-white/10" />
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor"
                strokeWidth="3" strokeLinecap="round" className="text-blue-500"
                strokeDasharray={circ}
                strokeDashoffset={circ - (circ * value) / 100}
                style={{ transition: 'stroke-dashoffset 0.3s ease' }}
            />
        </svg>
    );
};

// ── File Row ──────────────────────────────────────────────────────────────────

interface FileRowProps {
    entry: ManagedFile;
    onRemove: () => void;
    onConvert: () => void;
    onDownload: () => void;
    onRename: (name: string) => void;
    onTogglePreview: () => void;
    isAnyConverting: boolean;
}

const FileRow: React.FC<FileRowProps> = ({
    entry, onRemove, onConvert, onDownload, onRename, onTogglePreview, isAnyConverting,
}) => {
    const ext = entry.file.name.split('.').pop()?.toUpperCase() || 'DOC';
    const isDocx = ext === 'DOCX';

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -20, scale: 0.97 }}
            className="bg-white dark:bg-[#262636] rounded-2xl border border-gray-100 dark:border-white/5 overflow-hidden"
        >
            {/* Main row */}
            <div className="flex items-center gap-3 p-4">
                {/* Icon / Progress */}
                <div className="relative shrink-0 w-10 h-10 flex items-center justify-center">
                    {entry.status === 'converting' ? (
                        <CircularProgress value={entry.progress} />
                    ) : (
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-[10px]
                            ${isDocx
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'}`}>
                            {entry.status === 'done'
                                ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                : entry.status === 'error'
                                    ? <AlertCircle className="w-5 h-5 text-red-500" />
                                    : ext}
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold dark:text-white truncate">{entry.file.name}</p>
                    <p className="text-[11px] text-gray-400 font-mono">
                        {formatBytes(entry.file.size)}
                        {entry.status === 'converting' && <span className="ml-2 text-blue-500">{entry.progress}%</span>}
                        {entry.status === 'done' && entry.result && (
                            <span className="ml-2 text-emerald-500">
                                → {entry.result.pageCount} page{entry.result.pageCount !== 1 ? 's' : ''} · {formatBytes(entry.result.outputSize)}
                            </span>
                        )}
                        {entry.status === 'error' && <span className="ml-2 text-red-500">Failed</span>}
                    </p>
                    {entry.status === 'error' && entry.errorMsg && (
                        <p className="text-[10px] text-red-400 mt-0.5 truncate">{entry.errorMsg}</p>
                    )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                    {entry.status === 'done' && entry.result && (
                        <button onClick={onTogglePreview} title="Toggle HTML preview"
                            className="p-2 text-gray-400 hover:text-blue-500 transition-colors">
                            {entry.previewOpen ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    )}
                    {entry.status === 'done' && (
                        <button onClick={onDownload}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-colors">
                            <Download className="w-3.5 h-3.5" /> PDF
                        </button>
                    )}
                    {(entry.status === 'idle' || entry.status === 'error') && (
                        <button onClick={onConvert} disabled={isAnyConverting}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-colors
                            ${isAnyConverting
                                    ? 'bg-gray-100 dark:bg-white/5 text-gray-400 cursor-not-allowed'
                                    : 'bg-blue-600 hover:bg-blue-500 text-white'}`}>
                            {entry.status === 'error'
                                ? <><RotateCw className="w-3.5 h-3.5" /> Retry</>
                                : <><RefreshCw className="w-3.5 h-3.5" /> Convert</>}
                        </button>
                    )}
                    {entry.status === 'converting' && (
                        <div className="px-3 py-1.5 text-xs text-blue-500 font-bold flex items-center gap-1.5">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Converting…
                        </div>
                    )}
                    <button onClick={onRemove} title="Remove"
                        className="p-2 text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Progress bar */}
            {entry.status === 'converting' && (
                <div className="h-0.5 bg-gray-100 dark:bg-white/5">
                    <motion.div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full"
                        animate={{ width: `${entry.progress}%` }}
                        transition={{ duration: 0.3, ease: 'easeOut' }} />
                </div>
            )}

            {/* HTML Preview panel */}
            <AnimatePresence>
                {entry.previewOpen && entry.result?.html && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 320, opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden border-t border-gray-100 dark:border-white/5"
                    >
                        <div className="h-full overflow-y-auto p-4 bg-gray-50 dark:bg-[#1e1e2e] text-sm">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-1.5">
                                <Eye className="w-3 h-3" /> Document Preview (HTML)
                            </p>
                            <div
                                className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300"
                                dangerouslySetInnerHTML={{ __html: entry.result.html }}
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Rename field when done */}
            {entry.status === 'done' && (
                <div className="px-4 pb-4">
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-white/5 border border-gray-150 dark:border-white/10 rounded-xl focus-within:ring-2 focus-within:ring-blue-400 transition-all">
                        <FileDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <input
                            type="text"
                            value={entry.customName}
                            onChange={e => onRename(e.target.value)}
                            className="flex-1 bg-transparent text-xs font-mono dark:text-gray-200 outline-none"
                            placeholder="output-name"
                        />
                        <span className="text-[10px] text-gray-400">.pdf</span>
                    </div>
                </div>
            )}
        </motion.div>
    );
};

// ── Main Component ─────────────────────────────────────────────────────────────

export const WordToPDF: React.FC<WordToPDFProps> = ({ onBack }) => {
    const [files, setFiles] = useState<ManagedFile[]>([]);
    const [isDragOver, setIsDragOver] = useState(false);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [isBatchConverting, setIsBatchConverting] = useState(false);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [pageFormat, setPageFormat] = useState<'a4' | 'letter' | 'legal'>('a4');
    const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
    const [quality, setQuality] = useState<1 | 2>(2);

    const dropRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // ── Toast helpers
    const toast = useCallback((type: Toast['type'], message: string) => {
        const id = uid();
        setToasts(prev => [...prev.slice(-4), { id, type, message }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000);
    }, []);
    const dismissToast = useCallback((id: string) => setToasts(prev => prev.filter(t => t.id !== id)), []);

    // ── Add files
    const addFiles = useCallback((incoming: FileList | File[]) => {
        const arr = Array.from(incoming);
        let added = 0;
        const next: ManagedFile[] = [];
        for (const f of arr) {
            const err = validateWordFile(f);
            if (err) { toast('error', err); continue; }
            next.push({
                id: uid(),
                file: f,
                status: 'idle',
                progress: 0,
                customName: f.name.replace(/\.(docx?|DOC[XY]?)$/i, ''),
                previewOpen: false,
            });
            added++;
        }
        if (added > 0) {
            setFiles(prev => [...prev, ...next]);
            toast('info', `${added} file${added !== 1 ? 's' : ''} added.`);
        }
    }, [toast]);

    // ── Drag & Drop
    const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); }, []);
    const onDragLeave = useCallback((e: React.DragEvent) => {
        if (!dropRef.current?.contains(e.relatedTarget as Node)) setIsDragOver(false);
    }, []);
    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault(); setIsDragOver(false);
        addFiles(e.dataTransfer.files);
    }, [addFiles]);

    // ── Per-file conversion
    const convertOne = useCallback(async (id: string) => {
        const entry = files.find(f => f.id === id);
        if (!entry) return;

        setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'converting', progress: 0, errorMsg: undefined } : f));

        try {
            const result = await convertWordToPDF(entry.file, {
                outputPrefix: entry.customName,
                pageFormat,
                orientation,
                scale: quality,
                onProgress: (p) => setFiles(prev => prev.map(f => f.id === id ? { ...f, progress: p } : f)),
            });
            setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'done', progress: 100, result } : f));
            toast('success', `✅ "${entry.file.name}" converted — ${result.pageCount} page${result.pageCount !== 1 ? 's' : ''}.`);
        } catch (err: any) {
            const msg = err?.message || 'Conversion failed.';
            setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'error', progress: 0, errorMsg: msg } : f));
            toast('error', `"${entry.file.name}" — ${msg}`);
        }
    }, [files, pageFormat, orientation, quality, toast]);

    // ── Batch conversion
    const convertAll = useCallback(async () => {
        const toConvert = files.filter(f => f.status === 'idle' || f.status === 'error');
        if (toConvert.length === 0) { toast('info', 'No files to convert.'); return; }

        setIsBatchConverting(true);
        for (const entry of toConvert) {
            await convertOne(entry.id);
        }
        setIsBatchConverting(false);
        toast('success', `Batch conversion complete.`);
    }, [files, convertOne, toast]);

    // ── Download one
    const downloadOne = useCallback((entry: ManagedFile) => {
        if (!entry.result) return;
        const name = entry.customName.trim() || entry.file.name.replace(/\.(docx?)/i, '');
        downloadBytes(entry.result.bytes, `${name}.pdf`);
        toast('success', `Downloaded: ${name}.pdf`);
    }, [toast]);

    // ── Download all as ZIP
    const downloadAll = useCallback(async () => {
        const done = files.filter(f => f.status === 'done' && f.result);
        if (done.length === 0) { toast('info', 'No converted PDFs to download.'); return; }

        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();
        for (const entry of done) {
            const name = (entry.customName.trim() || entry.file.name.replace(/\.(docx?)/i, '')) + '.pdf';
            zip.file(name, entry.result!.bytes);
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'word-to-pdf-bundle.zip'; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        toast('success', `Downloaded ${done.length} PDFs as ZIP.`);
    }, [files, toast]);

    // ── Helpers
    const removeFile = useCallback((id: string) => setFiles(prev => prev.filter(f => f.id !== id)), []);
    const clearAll = useCallback(() => setFiles([]), []);
    const renameFile = useCallback((id: string, name: string) =>
        setFiles(prev => prev.map(f => f.id === id ? { ...f, customName: name } : f)), []);
    const togglePreview = useCallback((id: string) =>
        setFiles(prev => prev.map(f => f.id === id ? { ...f, previewOpen: !f.previewOpen } : f)), []);

    const isAnyConverting = files.some(f => f.status === 'converting');
    const doneCount = files.filter(f => f.status === 'done').length;
    const idleCount = files.filter(f => f.status === 'idle').length;
    const errorCount = files.filter(f => f.status === 'error').length;

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="flex-1 flex flex-col h-full bg-gray-50 dark:bg-[#1e1e2e] overflow-hidden relative">

            {/* ── Toasts ── */}
            <div className="fixed top-6 right-6 z-[200] flex flex-col gap-2 items-end pointer-events-none">
                <AnimatePresence>
                    {toasts.map(t => (
                        <div key={t.id} className="pointer-events-auto">
                            <ToastItem toast={t} onDismiss={() => dismissToast(t.id)} />
                        </div>
                    ))}
                </AnimatePresence>
            </div>

            {/* ── Header ── */}
            <div className="shrink-0 flex items-center justify-between px-6 py-4 bg-white dark:bg-[#262636] border-b border-gray-100 dark:border-white/5 shadow-sm">
                <div className="flex items-center gap-3">
                    {onBack && (
                        <button onClick={onBack}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-colors text-gray-500 dark:text-gray-400">
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                        <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                        <h1 className="text-lg font-black dark:text-white tracking-tight">Word to PDF</h1>
                        <p className="text-[11px] text-gray-400 font-medium">
                            Convert .docx and .doc files to PDF — in your browser
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {files.length > 0 && (
                        <>
                            {doneCount > 1 && (
                                <button onClick={downloadAll}
                                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl transition-colors">
                                    <Package className="w-3.5 h-3.5" /> Download All ZIP
                                </button>
                            )}
                            <button onClick={clearAll}
                                className="px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors flex items-center gap-1.5">
                                <Trash2 className="w-3.5 h-3.5" /> Clear
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 flex overflow-hidden">

                {/* ── LEFT: main area ── */}
                <div className="flex-1 flex flex-col overflow-hidden p-4 lg:p-6 gap-4 min-w-0">

                    {/* Drop Zone */}
                    <div
                        ref={dropRef}
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        onDrop={onDrop}
                        onClick={() => inputRef.current?.click()}
                        className={`shrink-0 flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl py-10 cursor-pointer transition-all duration-200
                          ${isDragOver
                                ? 'border-blue-500 bg-blue-500/5 scale-[0.99]'
                                : 'border-gray-200 dark:border-white/10 bg-white dark:bg-[#262636]'}
                          hover:border-blue-400 dark:hover:border-blue-500/50 hover:bg-blue-50/30 dark:hover:bg-blue-900/10`}
                    >
                        <input
                            ref={inputRef}
                            type="file"
                            accept={ACCEPT}
                            multiple
                            className="hidden"
                            onChange={e => e.target.files && addFiles(e.target.files)}
                        />
                        <motion.div
                            animate={{ y: [0, -6, 0] }}
                            transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
                            className="p-4 bg-blue-100 dark:bg-blue-900/30 rounded-2xl shadow-lg shadow-blue-200 dark:shadow-blue-900/30"
                        >
                            <Upload className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                        </motion.div>
                        <div className="text-center">
                            <p className="text-base font-black dark:text-white">Drop Word files here</p>
                            <p className="text-sm text-gray-400 mt-0.5">
                                or <span className="text-blue-500 font-bold underline underline-offset-2">click to browse</span>
                            </p>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-gray-300 dark:text-gray-600">
                            <span>.docx</span><span>·</span><span>.doc</span><span>·</span><span>Max {WORD_MAX_FILE_MB} MB each</span>
                        </div>
                    </div>

                    {/* File list */}
                    <div className="flex-1 overflow-y-auto min-h-0">
                        <AnimatePresence mode="popLayout">
                            {files.length === 0 ? (
                                <motion.div
                                    key="empty"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="flex flex-col items-center justify-center h-full gap-3 text-center py-12"
                                >
                                    <div className="p-5 bg-gray-100 dark:bg-white/5 rounded-2xl">
                                        <FileText className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                                    </div>
                                    <p className="text-sm font-bold text-gray-400">No files added yet</p>
                                    <p className="text-xs text-gray-300 dark:text-gray-600 max-w-xs">
                                        Drop Word documents above or click to browse. You can add multiple files for batch conversion.
                                    </p>
                                </motion.div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {files.map(entry => (
                                        <FileRow
                                            key={entry.id}
                                            entry={entry}
                                            onRemove={() => removeFile(entry.id)}
                                            onConvert={() => convertOne(entry.id)}
                                            onDownload={() => downloadOne(entry)}
                                            onRename={(name) => renameFile(entry.id, name)}
                                            onTogglePreview={() => togglePreview(entry.id)}
                                            isAnyConverting={isAnyConverting}
                                        />
                                    ))}
                                </div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Note: this technique explanation */}
                    {files.length > 0 && (
                        <div className="shrink-0 flex items-start gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/15 border border-amber-100 dark:border-amber-500/20 rounded-xl">
                            <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                                <strong>How it works:</strong> Your .docx is converted to HTML via <em>mammoth.js</em>, then
                                rendered into a PDF using <em>jsPDF + html2canvas</em>. Complex formatting (charts, custom fonts, macros)
                                may render approximately. For pixel-perfect output, consider the desktop LibreOffice approach.
                            </p>
                        </div>
                    )}
                </div>

                {/* ── RIGHT: Controls ── */}
                <div className="w-80 shrink-0 flex flex-col border-l border-gray-100 dark:border-white/5 bg-white dark:bg-[#262636] overflow-y-auto">

                    {/* Stats */}
                    {files.length > 0 && (
                        <div className="p-5 border-b border-gray-100 dark:border-white/5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Queue</p>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { label: 'Files', value: files.length, color: 'text-gray-700 dark:text-gray-200' },
                                    { label: 'Pending', value: idleCount + errorCount, color: 'text-blue-600 dark:text-blue-400' },
                                    { label: 'Done', value: doneCount, color: 'text-emerald-600 dark:text-emerald-400' },
                                    { label: 'Errors', value: errorCount, color: 'text-red-500' },
                                ].map(s => (
                                    <div key={s.label} className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 text-center">
                                        <p className={`text-base font-black ${s.color}`}>{s.value}</p>
                                        <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mt-0.5">{s.label}</p>
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
                                                        className={`py-2 text-xs font-bold rounded-xl border-2 transition-all capitalize
                                                        ${pageFormat === f
                                                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                                                : 'border-gray-100 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-blue-200'}`}>
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
                                                        ${orientation === o
                                                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                                                : 'border-gray-100 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-blue-200'}`}>
                                                        {o}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Quality */}
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Render Quality</p>
                                            <div className="grid grid-cols-2 gap-1.5">
                                                {([
                                                    { v: 1, label: 'Fast (96dpi)' },
                                                    { v: 2, label: 'High (192dpi)' },
                                                ] as const).map(q => (
                                                    <button key={q.v} onClick={() => setQuality(q.v)}
                                                        className={`py-2 text-xs font-bold rounded-xl border-2 transition-all
                                                        ${quality === q.v
                                                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                                                : 'border-gray-100 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-blue-200'}`}>
                                                        {q.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Privacy note */}
                                        <div className="flex items-start gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-500/20 rounded-xl">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                                            <p className="text-[10px] text-emerald-700 dark:text-emerald-300 leading-relaxed">
                                                All conversion happens <strong>entirely in your browser</strong>. Files are never uploaded.
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
                                'Use .docx for best formatting accuracy',
                                'Tables, bold, lists & images supported',
                                'Complex charts may render approximately',
                                'High quality = larger file, slower render',
                            ].map((tip, i) => (
                                <li key={i} className="flex items-start gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                                    <span className="w-4 h-4 shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[8px] font-black flex items-center justify-center mt-0.5">{i + 1}</span>
                                    {tip}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="flex-1" />

                    {/* ── Action Buttons ── */}
                    <div className="p-5 border-t border-gray-100 dark:border-white/5 bg-white/80 dark:bg-[#262636]/80 backdrop-blur-sm space-y-3">
                        {/* Convert All */}
                        <button
                            onClick={convertAll}
                            disabled={files.length === 0 || isAnyConverting || (idleCount === 0 && errorCount === 0)}
                            className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-sm transition-all shadow-lg
                            ${files.length === 0 || (idleCount === 0 && errorCount === 0)
                                    ? 'bg-gray-200 dark:bg-white/5 text-gray-400 cursor-not-allowed shadow-none'
                                    : 'bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white shadow-blue-500/30 hover:-translate-y-0.5 active:translate-y-0'}`}
                        >
                            {isAnyConverting
                                ? <><Loader2 className="w-5 h-5 animate-spin" /> Converting…</>
                                : <><Layers className="w-5 h-5" />
                                    {files.length === 0 ? 'Add files first'
                                        : `Convert ${idleCount + errorCount} File${(idleCount + errorCount) !== 1 ? 's' : ''}`}</>
                            }
                        </button>

                        {/* Download All ZIP */}
                        <AnimatePresence>
                            {doneCount > 1 && (
                                <motion.button
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 8 }}
                                    onClick={downloadAll}
                                    className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl font-black text-sm bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-lg shadow-emerald-500/30 hover:-translate-y-0.5 active:translate-y-0 transition-all"
                                >
                                    <Package className="w-5 h-5" /> Download All ({doneCount}) as ZIP
                                </motion.button>
                            )}
                        </AnimatePresence>

                        {files.length === 0 && (
                            <p className="text-center text-[10px] text-gray-400">Upload Word files to begin</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
