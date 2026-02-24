/**
 * CompressPDF — Production-ready Compress PDF module
 *
 * UX Highlights:
 * - Multi-file drag & drop
 * - Original vs Compressed size ring/bar comparison per file
 * - Compression level: Low / Medium / High with DPI info
 * - Strip metadata toggle
 * - Inline output filename rename
 * - Per-file animated progress bars
 * - Before/After comparison with savings badge
 * - Batch Compress All / Download All as ZIP
 * - Toast notifications
 * - Purple brand color — distinct from all other modules
 */

import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    Minimize2, Upload, X, Download, Loader2, CheckCircle2,
    AlertCircle, ArrowLeft, Trash2, RotateCcw, Info,
    ChevronDown, ChevronUp, Archive, FileDown, Gauge, Shield,
} from 'lucide-react';
import {
    compressPdf, validatePdfForCompress, fmtSize, LEVEL_PROFILES, COMPRESS_MAX_MB,
    type CompressResult, type CompressionLevel,
} from '../services/compressService';
import { downloadBlob } from '../services/pdfService';
import JSZip from 'jszip';

// ── Types ─────────────────────────────────────────────────────────────────────

type FileStatus = 'idle' | 'ready' | 'compressing' | 'done' | 'error';

interface ManagedFile {
    id: string;
    file: File;
    status: FileStatus;
    progress: number;
    outputName: string;
    result: CompressResult | null;
    error: string;
}

interface Toast { id: string; type: 'success' | 'error' | 'info'; message: string; }
interface Props { onBack?: () => void; }

// ── Helpers ───────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 10);
const ACCEPT = '.pdf,application/pdf';

// ── Toast ─────────────────────────────────────────────────────────────────────

const ToastItem = ({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) => (
    <motion.div layout initial={{ opacity: 0, x: 60, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 60, scale: 0.9 }}
        className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-xl max-w-sm text-sm font-medium border backdrop-blur-md pointer-events-auto
      ${toast.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/60 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
                : toast.type === 'error' ? 'bg-red-50 dark:bg-red-900/60 border-red-200 dark:border-red-500/30 text-red-800 dark:text-red-200'
                    : 'bg-violet-50 dark:bg-violet-900/60 border-violet-200 dark:border-violet-500/30 text-violet-800 dark:text-violet-200'}`}>
        {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
        {toast.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
        {toast.type === 'info' && <Info className="w-4 h-4 shrink-0 mt-0.5" />}
        <span className="flex-1 leading-snug">{toast.message}</span>
        <button onClick={onDismiss}><X className="w-3.5 h-3.5 opacity-60 hover:opacity-100" /></button>
    </motion.div>
);

// ── Size comparison bar ───────────────────────────────────────────────────────

const SizeBar = ({ result }: { result: CompressResult }) => {
    const pct = Math.max(5, 100 - result.savedPercent);
    const color = result.savedPercent >= 30 ? 'bg-emerald-500'
        : result.savedPercent >= 10 ? 'bg-yellow-500'
            : 'bg-gray-400';
    return (
        <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-bold text-gray-500 dark:text-gray-400">
                <span>Original: {fmtSize(result.originalSize)}</span>
                <span className="text-emerald-600 dark:text-emerald-400">Saved: {fmtSize(result.savedBytes)} ({result.savedPercent}%)</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden">
                <div className="h-full bg-gray-300 dark:bg-white/20 rounded-full relative">
                    <motion.div
                        className={`absolute inset-y-0 left-0 rounded-full ${color}`}
                        initial={{ width: '100%' }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                </div>
            </div>
            <div className="flex items-center justify-between text-[10px] text-gray-400">
                <span>Compressed: <strong className="text-violet-600 dark:text-violet-400">{fmtSize(result.compressedSize)}</strong></span>
                <span className="font-black text-xs text-emerald-600 dark:text-emerald-400">
                    {result.savedPercent > 0 ? `↓ ${result.savedPercent}% smaller` : 'Already optimal'}
                </span>
            </div>
        </div>
    );
};

// ── File card ─────────────────────────────────────────────────────────────────

interface FileCardProps {
    entry: ManagedFile;
    level: CompressionLevel;
    stripMetadata: boolean;
    isAnyCompressing: boolean;
    onRemove: () => void;
    onCompress: () => void;
    onDownload: () => void;
    onRename: (n: string) => void;
}

const FileCard: React.FC<FileCardProps> = ({
    entry, level, isAnyCompressing, onRemove, onCompress, onDownload, onRename,
}) => {
    const dot: Record<FileStatus, string> = {
        'idle': 'bg-gray-300 dark:bg-gray-600',
        'ready': 'bg-violet-500',
        'compressing': 'bg-violet-400 animate-pulse',
        'done': 'bg-emerald-500',
        'error': 'bg-red-500',
    };

    const profile = LEVEL_PROFILES[level];

    return (
        <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">

            <div className="p-4">
                {/* Top row */}
                <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${dot[entry.status]}`} />

                    {/* File icon */}
                    <div className="w-10 h-12 shrink-0 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-500/20 flex flex-col items-center justify-center gap-0.5">
                        <Minimize2 className="w-4 h-4 text-violet-500" />
                        <span className="text-[7px] font-black text-violet-400 uppercase tracking-wide">PDF</span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                        {entry.status === 'done' || entry.status === 'ready' ? (
                            <input value={entry.outputName} onChange={e => onRename(e.target.value)}
                                className="w-full text-sm font-bold dark:text-white bg-transparent outline-none border-b border-transparent hover:border-violet-300 focus:border-violet-400 transition-colors font-mono truncate" />
                        ) : (
                            <p className="text-sm font-bold dark:text-white truncate">{entry.file.name}</p>
                        )}
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-[10px] text-gray-400 font-mono">{fmtSize(entry.file.size)}</span>
                            <span className="text-[10px] text-violet-500 font-bold">{profile.label} · {profile.targetDpi} DPI</span>
                            {entry.status === 'error' && (
                                <span className="text-[10px] text-red-500 truncate max-w-[200px]">{entry.error}</span>
                            )}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                        {entry.status === 'ready' && (
                            <button onClick={onCompress} disabled={isAnyCompressing}
                                className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-40 shadow-sm">
                                Compress
                            </button>
                        )}
                        {entry.status === 'compressing' && (
                            <div className="flex items-center gap-2 px-3">
                                <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                                <span className="text-xs text-violet-500 font-bold">{entry.progress}%</span>
                            </div>
                        )}
                        {entry.status === 'done' && (
                            <>
                                <button onClick={onCompress} title="Re-compress"
                                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg text-gray-400">
                                    <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={onDownload}
                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm">
                                    <Download className="w-3.5 h-3.5" /> .pdf
                                </button>
                            </>
                        )}
                        {entry.status === 'error' && (
                            <button onClick={onCompress}
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

                {/* Size comparison */}
                {entry.status === 'done' && entry.result && <SizeBar result={entry.result} />}
            </div>

            {/* Progress */}
            {entry.status === 'compressing' && (
                <div className="h-1 bg-gray-100 dark:bg-white/5">
                    <motion.div className="h-full bg-gradient-to-r from-violet-600 to-purple-400"
                        animate={{ width: `${entry.progress}%` }} transition={{ duration: 0.25, ease: 'easeOut' }} />
                </div>
            )}
            {entry.status === 'done' && <div className="h-0.5 bg-emerald-400/60" />}
            {entry.status === 'error' && <div className="h-0.5 bg-red-400/60" />}
        </motion.div>
    );
};

// ── Savings badge (aggregate) ─────────────────────────────────────────────────

const SavingsBadge = ({ files }: { files: ManagedFile[] }) => {
    const done = files.filter(f => f.status === 'done' && f.result);
    if (!done.length) return null;
    const totalOrig = done.reduce((s, f) => s + (f.result!.originalSize), 0);
    const totalComp = done.reduce((s, f) => s + (f.result!.compressedSize), 0);
    const saved = totalOrig - totalComp;
    const pct = totalOrig > 0 ? Math.round((saved / totalOrig) * 100) : 0;
    return (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-500/30 rounded-xl text-[10px] font-black text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Saved {fmtSize(saved)} across {done.length} file{done.length !== 1 ? 's' : ''} ({pct}% avg)
        </div>
    );
};

// ── Main Component ────────────────────────────────────────────────────────────

export const CompressPDF: React.FC<Props> = ({ onBack }) => {
    const [files, setFiles] = useState<ManagedFile[]>([]);
    const [isDragOver, setIsDragOver] = useState(false);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [infoOpen, setInfoOpen] = useState(false);
    const [level, setLevel] = useState<CompressionLevel>('medium');
    const [stripMetadata, setStripMetadata] = useState(true);

    const dropRef = useRef<HTMLDivElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const toast = useCallback((type: Toast['type'], message: string) => {
        const id = uid();
        setToasts(prev => [...prev.slice(-4), { id, type, message }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 7000);
    }, []);

    const addFiles = useCallback((incoming: FileList | File[]) => {
        const arr = Array.from(incoming);
        const toAdd: ManagedFile[] = [];
        for (const f of arr) {
            const err = validatePdfForCompress(f);
            if (err) { toast('error', err); continue; }
            if (files.some(e => e.file.name === f.name && e.file.size === f.size)) {
                toast('info', `"${f.name}" already added.`); continue;
            }
            toAdd.push({
                id: uid(), file: f, status: 'ready', progress: 0,
                outputName: f.name.replace(/\.pdf$/i, ''),
                result: null, error: '',
            });
        }
        if (toAdd.length) setFiles(prev => [...prev, ...toAdd]);
    }, [files, toast]);

    const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
    const onDragLeave = (e: React.DragEvent) => {
        if (!dropRef.current?.contains(e.relatedTarget as Node)) setIsDragOver(false);
    };
    const onDrop = (e: React.DragEvent) => {
        e.preventDefault(); setIsDragOver(false); addFiles(e.dataTransfer.files);
    };

    const updateFile = (id: string, patch: Partial<ManagedFile>) =>
        setFiles(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));

    const compressOne = useCallback(async (id: string) => {
        const entry = files.find(f => f.id === id);
        if (!entry) return;
        updateFile(id, { status: 'compressing', progress: 0, error: '', result: null });
        try {
            const result = await compressPdf(entry.file, {
                level,
                stripMetadata,
                outputName: entry.outputName,
                onProgress: p => updateFile(id, { progress: p }),
            });
            updateFile(id, { status: 'done', result, progress: 100 });
            const msg = result.savedPercent > 0
                ? `✅ "${entry.file.name}" compressed by ${result.savedPercent}% (${fmtSize(result.originalSize)} → ${fmtSize(result.compressedSize)})`
                : `ℹ️ "${entry.file.name}" is already highly optimized — no further reduction possible.`;
            toast(result.savedPercent > 0 ? 'success' : 'info', msg);
        } catch (err: any) {
            const msg = err?.message ?? 'Compression failed.';
            updateFile(id, { status: 'error', error: msg, progress: 0 });
            toast('error', msg);
        }
    }, [files, level, stripMetadata, toast]);

    const compressAll = useCallback(async () => {
        const ready = files.filter(f => f.status === 'ready' || f.status === 'error');
        for (const f of ready) await compressOne(f.id);
    }, [files, compressOne]);

    const downloadOne = (id: string) => {
        const e = files.find(f => f.id === id);
        if (!e?.result) return;
        downloadBlob(
            new Blob([e.result.compressedBytes], { type: 'application/pdf' }),
            `${e.outputName}_compressed.pdf`,
        );
    };

    const downloadAll = async () => {
        const done = files.filter(f => f.status === 'done' && f.result);
        if (!done.length) return;
        if (done.length === 1) { downloadOne(done[0].id); return; }
        const zip = new JSZip();
        for (const f of done) {
            zip.file(`${f.outputName}_compressed.pdf`, f.result!.compressedBytes);
        }
        downloadBlob(await zip.generateAsync({ type: 'blob' }), 'OmniPDF_Compressed.zip');
    };

    const removeFile = (id: string) => setFiles(p => p.filter(f => f.id !== id));
    const isCompressing = files.some(f => f.status === 'compressing');
    const readyCount = files.filter(f => f.status === 'ready' || f.status === 'error').length;
    const doneCount = files.filter(f => f.status === 'done').length;
    const profile = LEVEL_PROFILES[level];

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
                        <button onClick={onBack} className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-colors text-gray-500">
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}
                    <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-xl">
                        <Minimize2 className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div>
                        <h1 className="text-lg font-black dark:text-white tracking-tight">Compress PDF</h1>
                        <p className="text-[11px] text-gray-400 font-medium">Reduce file size · Before vs After comparison</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <SavingsBadge files={files} />
                    {doneCount > 1 && (
                        <button onClick={downloadAll}
                            className="px-3 py-2 text-xs font-bold text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-xl flex items-center gap-1.5 transition-colors">
                            <Archive className="w-3.5 h-3.5" /> Download All ({doneCount})
                        </button>
                    )}
                    {readyCount > 1 && (
                        <button onClick={compressAll} disabled={isCompressing}
                            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-colors shadow-sm flex items-center gap-1.5">
                            <FileDown className="w-3.5 h-3.5" /> Compress All ({readyCount})
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
              ${isDragOver ? 'border-violet-500 bg-violet-500/5 scale-[0.99]' : 'border-gray-200 dark:border-white/10 bg-white dark:bg-[#262636]'}
              hover:border-violet-400 dark:hover:border-violet-500/50 hover:bg-violet-50/30 dark:hover:bg-violet-900/10`}>
                        <input ref={fileRef} type="file" accept={ACCEPT} multiple className="hidden"
                            onChange={e => e.target.files && addFiles(e.target.files)} />
                        <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                            className="p-4 bg-violet-100 dark:bg-violet-900/30 rounded-2xl shadow-lg shadow-violet-200 dark:shadow-violet-900/30">
                            <Upload className="w-7 h-7 text-violet-600 dark:text-violet-400" />
                        </motion.div>
                        <div className="text-center">
                            <p className="text-base font-black dark:text-white">Drop PDF files here</p>
                            <p className="text-sm text-gray-400 mt-0.5">
                                or <span className="text-violet-500 font-bold underline underline-offset-2">click to browse</span>
                            </p>
                        </div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 dark:text-gray-600">
                            PDF only · Max {COMPRESS_MAX_MB} MB per file
                        </p>
                    </div>

                    {/* File list */}
                    <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pb-4">
                        <AnimatePresence mode="popLayout">
                            {files.length === 0 ? (
                                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                    className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
                                    <div className="p-5 bg-gray-100 dark:bg-white/5 rounded-2xl">
                                        <Minimize2 className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                                    </div>
                                    <p className="text-sm font-bold text-gray-400">No PDFs added yet</p>
                                    <p className="text-xs text-gray-300 dark:text-gray-600 max-w-xs leading-relaxed">
                                        Upload your PDFs and see the before/after size comparison instantly after compression.
                                    </p>
                                </motion.div>
                            ) : (
                                files.map(entry => (
                                    <FileCard key={entry.id} entry={entry} level={level}
                                        stripMetadata={stripMetadata}
                                        isAnyCompressing={isCompressing}
                                        onRemove={() => removeFile(entry.id)}
                                        onCompress={() => compressOne(entry.id)}
                                        onDownload={() => downloadOne(entry.id)}
                                        onRename={name => updateFile(entry.id, { outputName: name })}
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
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Queue</p>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { label: 'Files', value: files.length, color: 'text-violet-600 dark:text-violet-400' },
                                    { label: 'Saved', value: (() => { const d = files.filter(f => f.result); return d.length ? fmtSize(d.reduce((s, f) => s + f.result!.savedBytes, 0)) : '—'; })(), color: 'text-emerald-600 dark:text-emerald-400' },
                                    { label: 'Ready', value: readyCount, color: 'text-gray-500 dark:text-gray-400' },
                                    { label: 'Done', value: doneCount, color: 'text-gray-700 dark:text-gray-300' },
                                ].map(s => (
                                    <div key={s.label} className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 text-center">
                                        <p className={`text-base font-black font-mono ${s.color}`}>{s.value}</p>
                                        <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mt-0.5">{s.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Compression level */}
                    <div className="p-5 border-b border-gray-100 dark:border-white/5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Compression Level</p>
                        <div className="space-y-1.5">
                            {(['low', 'medium', 'high'] as CompressionLevel[]).map(l => {
                                const p = LEVEL_PROFILES[l];
                                const icon = l === 'low' ? '🟢' : l === 'medium' ? '🟡' : '🔴';
                                return (
                                    <button key={l} onClick={() => setLevel(l)}
                                        className={`w-full flex items-start gap-3 px-3 py-3 rounded-xl border-2 text-left transition-all
                      ${level === l
                                                ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30'
                                                : 'border-gray-100 dark:border-white/10 hover:border-violet-200 dark:hover:border-violet-500/30'}`}>
                                        <span className="text-base shrink-0 mt-0.5">{icon}</span>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-xs font-black ${level === l ? 'text-violet-700 dark:text-violet-300' : 'text-gray-700 dark:text-gray-300'}`}>
                                                    {p.label}
                                                </span>
                                                <span className="text-[9px] font-bold text-gray-400 uppercase">·  {p.targetDpi} DPI</span>
                                            </div>
                                            <p className="text-[10px] text-gray-400 leading-tight mt-0.5">{p.description}</p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Options */}
                    <div className="p-5 border-b border-gray-100 dark:border-white/5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Options</p>
                        <button onClick={() => setStripMetadata(v => !v)}
                            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border-2 transition-all
                ${stripMetadata
                                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30'
                                    : 'border-gray-100 dark:border-white/10 hover:border-violet-200'}`}>
                            <div className="flex items-center gap-2">
                                <Shield className="w-3.5 h-3.5 text-violet-500" />
                                <span className="text-xs font-bold dark:text-white">Strip Metadata</span>
                            </div>
                            <div className={`w-8 h-4 rounded-full transition-colors ${stripMetadata ? 'bg-violet-500' : 'bg-gray-200 dark:bg-gray-700'}`}>
                                <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${stripMetadata ? 'translate-x-4' : 'translate-x-0'}`} />
                            </div>
                        </button>
                        <p className="text-[10px] text-gray-400 mt-2 px-1 leading-relaxed">
                            Removes author, title, creation date, and XMP metadata from the output PDF.
                        </p>
                    </div>

                    {/* How it works */}
                    <div className="border-b border-gray-100 dark:border-white/5">
                        <button onClick={() => setInfoOpen(v => !v)}
                            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                            <span className="flex items-center gap-2 text-xs font-bold text-gray-600 dark:text-gray-300">
                                <Gauge className="w-3.5 h-3.5" /> How compression works
                            </span>
                            {infoOpen ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                        </button>
                        <AnimatePresence>
                            {infoOpen && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                    <div className="px-5 pb-5 space-y-3 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                                        <div className="space-y-2">
                                            {[
                                                { l: '🟢 Low', t: 'Re-serializes the PDF with object stream compression. No visual change. Works on all PDFs.' },
                                                { l: '🟡 Medium', t: 'Re-renders each page at 150 DPI and re-encodes images as JPEG (72% quality). Best balance.' },
                                                { l: '🔴 High', t: 'Re-renders at 72 DPI with 50% JPEG quality. Significant reduction, some quality loss.' },
                                            ].map(row => (
                                                <div key={row.l}>
                                                    <p className="font-bold text-gray-700 dark:text-gray-200">{row.l}</p>
                                                    <p>{row.t}</p>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-amber-600 dark:text-amber-400 font-bold">
                                            ⚠ Medium/High re-render entire pages — text quality may decrease. Use Low for text-heavy PDFs.
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
                            { icon: '📄', text: 'Use "Low" for text-heavy PDFs — no visual quality loss.' },
                            { icon: '🖼️', text: 'Image-heavy PDFs benefit most from Medium/High compression.' },
                            { icon: '📊', text: 'Check the before/after bar to see how much space you saved.' },
                            { icon: '📦', text: '"Download All" bundles every compressed PDF into one ZIP.' },
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
                        <div className="flex items-center gap-3 p-3 bg-violet-50 dark:bg-violet-900/20 rounded-xl">
                            <div className="w-8 h-8 shrink-0 rounded-lg bg-violet-600 flex items-center justify-center">
                                <Minimize2 className="w-4 h-4 text-white" />
                            </div>
                            <div>
                                <p className="text-[11px] font-black text-violet-700 dark:text-violet-300">Output: .pdf</p>
                                <p className="text-[9px] text-violet-500 leading-tight">Smaller size · Same format · Full compatibility</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
