/**
 * MergePDF — Production-ready Merge PDF module
 * Self-contained: manages its own file list, reordering, options & merge pipeline.
 */

import React, {
    useState, useCallback, useRef,
} from 'react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'motion/react';
import {
    Upload, X, GripVertical, FileText, Plus,
    Download, Settings2, ChevronDown, ChevronUp,
    AlertCircle, CheckCircle2, Loader2, Info,
    Layers, FileInput, Zap, BookOpen, FilePlus2,
    ArrowLeft, Trash2, Eye, EyeOff,
} from 'lucide-react';
import {
    getFilePageCount,
    generatePDFThumbnail,
    mergePDFsAdvanced,
    type AdvancedMergeFileInput,
} from '../services/pdfService';

// ── Types ──────────────────────────────────────────────────────────────────────

interface MergeFile {
    id: string;
    file: File;
    name: string;
    displayName: string;       // Editable in-place
    size: number;
    pageCount: number | null;
    thumbnail: string | null;
    pageRange: string;          // "" = all pages
    loading: boolean;           // true while computing page count + thumbnail
    error: string | null;
}

interface Toast {
    id: string;
    type: 'success' | 'error' | 'info';
    message: string;
}

interface MergePDFProps {
    onBack?: () => void;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_FILES = 30;
const MAX_FILE_MB = 100;
const MAX_TOTAL_MB = 600;
const ACCEPTED_MIME = 'application/pdf';

// ── Helpers ────────────────────────────────────────────────────────────────────

const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

const uid = () => Math.random().toString(36).slice(2, 10);

// ── Sub-components ──────────────────────────────────────────────────────────────

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

// Individual file card with reorder handle
const FileCard = ({
    item,
    onRemove,
    onRangeChange,
    onNameChange,
    showThumbs,
}: {
    item: MergeFile;
    onRemove: () => void;
    onRangeChange: (v: string) => void;
    onNameChange: (v: string) => void;
    showThumbs: boolean;
}) => {
    const controls = useDragControls();
    const [editingName, setEditingName] = useState(false);
    const nameRef = useRef<HTMLInputElement>(null);

    return (
        <Reorder.Item
            value={item}
            dragListener={false}
            dragControls={controls}
            className="group relative flex items-start gap-3 p-3 bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-2xl hover:border-blue-200 dark:hover:border-blue-500/30 hover:shadow-md transition-all duration-200 select-none"
        >
            {/* Drag handle */}
            <button
                onPointerDown={(e) => controls.start(e)}
                className="mt-2 p-1 rounded-lg cursor-grab active:cursor-grabbing text-gray-300 dark:text-white/20 hover:text-blue-400 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors shrink-0"
                title="Drag to reorder"
            >
                <GripVertical className="w-4 h-4" />
            </button>

            {/* Thumbnail */}
            <div className={`shrink-0 rounded-xl overflow-hidden bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 flex items-center justify-center transition-all duration-300 ${showThumbs ? 'w-14 h-[72px]' : 'w-9 h-10'}`}>
                {item.loading ? (
                    <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                ) : item.thumbnail ? (
                    <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                ) : (
                    <FileText className="w-5 h-5 text-gray-400" />
                )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                {/* Editable name */}
                <div className="flex items-center gap-1 mb-1">
                    {editingName ? (
                        <input
                            ref={nameRef}
                            value={item.displayName}
                            onChange={(e) => onNameChange(e.target.value)}
                            onBlur={() => setEditingName(false)}
                            onKeyDown={(e) => e.key === 'Enter' && setEditingName(false)}
                            className="flex-1 text-xs font-bold bg-transparent border-b border-blue-400 outline-none dark:text-gray-100 pb-0.5"
                            autoFocus
                        />
                    ) : (
                        <button
                            onClick={() => { setEditingName(true); setTimeout(() => nameRef.current?.select(), 50); }}
                            className="flex-1 text-xs font-bold truncate dark:text-gray-100 text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            title="Click to rename"
                        >
                            {item.displayName || item.name}
                        </button>
                    )}
                </div>

                {/* Meta row */}
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-gray-400 font-medium">{formatBytes(item.size)}</span>
                    {item.pageCount !== null && (
                        <span className="flex items-center gap-0.5 text-[10px] text-gray-400 font-medium">
                            <Layers className="w-2.5 h-2.5" />
                            {item.pageCount} {item.pageCount === 1 ? 'page' : 'pages'}
                        </span>
                    )}
                    {item.error && (
                        <span className="text-[10px] text-red-500 font-bold flex items-center gap-1">
                            <AlertCircle className="w-2.5 h-2.5" /> {item.error}
                        </span>
                    )}
                </div>

                {/* Page range */}
                <div className="mt-2 flex items-center gap-2">
                    <label className="text-[9px] font-bold uppercase tracking-widest text-gray-400 shrink-0">Pages</label>
                    <input
                        type="text"
                        value={item.pageRange}
                        onChange={(e) => onRangeChange(e.target.value)}
                        placeholder={item.pageCount ? `all (1–${item.pageCount})` : 'all'}
                        className="flex-1 text-[10px] px-2 py-1 rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 focus:ring-1 focus:ring-blue-400 focus:border-blue-400 outline-none dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600"
                    />
                </div>
            </div>

            {/* Remove */}
            <button
                onClick={onRemove}
                className="shrink-0 mt-1 p-1.5 rounded-lg text-gray-300 dark:text-white/20 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all"
                title="Remove"
            >
                <X className="w-4 h-4" />
            </button>
        </Reorder.Item>
    );
};

// ── Main Component ─────────────────────────────────────────────────────────────

export const MergePDF: React.FC<MergePDFProps> = ({ onBack }) => {
    const [files, setFiles] = useState<MergeFile[]>([]);
    const [isDragOver, setIsDragOver] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressLabel, setProgressLabel] = useState('');
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [showThumbs, setShowThumbs] = useState(true);
    const [outputName, setOutputName] = useState('merged');
    const [addBlankBetween, setAddBlankBetween] = useState(false);
    const uploadInputRef = useRef<HTMLInputElement>(null);
    const dropZoneRef = useRef<HTMLDivElement>(null);

    // ── Toast helpers ────────────────────────────────────────────────────────

    const toast = useCallback((type: Toast['type'], message: string) => {
        const id = uid();
        setToasts(prev => [...prev.slice(-4), { id, type, message }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
    }, []);

    // ── File processing ──────────────────────────────────────────────────────

    const processFile = useCallback(async (file: File): Promise<MergeFile | null> => {
        // Validation
        if (file.type !== ACCEPTED_MIME && !file.name.toLowerCase().endsWith('.pdf')) {
            toast('error', `"${file.name}" is not a PDF file.`);
            return null;
        }
        if (file.size > MAX_FILE_MB * 1024 * 1024) {
            toast('error', `"${file.name}" exceeds the ${MAX_FILE_MB} MB limit.`);
            return null;
        }

        const entry: MergeFile = {
            id: uid(),
            file,
            name: file.name,
            displayName: file.name.replace(/\.pdf$/i, ''),
            size: file.size,
            pageCount: null,
            thumbnail: null,
            pageRange: '',
            loading: true,
            error: null,
        };

        // Add immediately so user sees it
        setFiles(prev => {
            if (prev.length >= MAX_FILES) {
                toast('info', `Maximum of ${MAX_FILES} files reached.`);
                return prev;
            }
            const totalMB = (prev.reduce((s, f) => s + f.size, 0) + file.size) / 1024 / 1024;
            if (totalMB > MAX_TOTAL_MB) {
                toast('error', `Total size would exceed ${MAX_TOTAL_MB} MB.`);
                return prev;
            }
            return [...prev, entry];
        });

        // Async enrichment
        const [pageCount, thumbnail] = await Promise.all([
            getFilePageCount(file),
            generatePDFThumbnail(file, 140),
        ]);

        setFiles(prev => prev.map(f =>
            f.id === entry.id
                ? { ...f, pageCount, thumbnail, loading: false }
                : f
        ));

        return entry;
    }, [toast]);

    const addFiles = useCallback(async (rawFiles: FileList | File[]) => {
        const arr = Array.from(rawFiles);
        for (const f of arr) {
            await processFile(f);
        }
    }, [processFile]);

    // ── Drag & Drop upload ───────────────────────────────────────────────────

    const onDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    }, []);

    const onDragLeave = useCallback((e: React.DragEvent) => {
        if (!dropZoneRef.current?.contains(e.relatedTarget as Node)) {
            setIsDragOver(false);
        }
    }, []);

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    }, [addFiles]);

    // ── File list actions ────────────────────────────────────────────────────

    const removeFile = useCallback((id: string) => {
        setFiles(prev => prev.filter(f => f.id !== id));
    }, []);

    const updateRange = useCallback((id: string, pageRange: string) => {
        setFiles(prev => prev.map(f => f.id === id ? { ...f, pageRange } : f));
    }, []);

    const updateName = useCallback((id: string, displayName: string) => {
        setFiles(prev => prev.map(f => f.id === id ? { ...f, displayName } : f));
    }, []);

    const clearAll = useCallback(() => setFiles([]), []);

    // ── Merge ────────────────────────────────────────────────────────────────

    const handleMerge = useCallback(async () => {
        if (files.length === 0) {
            toast('error', 'Please add at least one PDF file before merging.');
            return;
        }
        if (files.length === 1) {
            toast('info', 'Add more files to merge. To download a single file, use the toolbar.');
            return;
        }
        if (isProcessing) return;

        setIsProcessing(true);
        setProgress(0);
        setProgressLabel('Preparing files…');

        const inputs: AdvancedMergeFileInput[] = files.map(f => ({
            file: f.file,
            pageRange: f.pageRange,
        }));

        try {
            setProgressLabel('Merging PDFs…');
            await mergePDFsAdvanced(inputs, {
                outputName,
                addBlankBetween,
                onProgress: (p) => {
                    setProgress(p);
                    if (p < 30) setProgressLabel('Loading files…');
                    else if (p < 85) setProgressLabel(`Merging page ${Math.round((p - 5) / 80 * files.length)} of ${files.length} documents…`);
                    else if (p < 95) setProgressLabel('Finalising PDF…');
                    else setProgressLabel('Preparing download…');
                },
            });
            setProgress(100);
            setProgressLabel('Done!');
            toast('success', `"${outputName || 'merged'}.pdf" downloaded successfully!`);

            // Reset after success
            setTimeout(() => {
                setIsProcessing(false);
                setProgress(0);
                setProgressLabel('');
            }, 1200);
        } catch (err: any) {
            toast('error', err?.message || 'Merge failed. Please try again.');
            setIsProcessing(false);
            setProgress(0);
            setProgressLabel('');
        }
    }, [files, isProcessing, outputName, addBlankBetween, toast]);

    // ── Derived stats ────────────────────────────────────────────────────────

    const totalPages = files.reduce((s, f) => s + (f.pageCount ?? 0), 0);
    const totalSize = files.reduce((s, f) => s + f.size, 0);
    const allLoaded = files.every(f => !f.loading);
    const hasError = files.some(f => f.error);
    const circumference = 2 * Math.PI * 40; // r=40

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="flex-1 flex flex-col h-full bg-[#f3f1ea] dark:bg-[#1e1e2e] overflow-hidden relative">

            {/* ── Toast Portal ── */}
            <div className="fixed top-6 right-6 z-[200] flex flex-col gap-2 items-end pointer-events-none">
                <AnimatePresence>
                    {toasts.map(t => (
                        <div key={t.id}>
                            <ToastItem
                                toast={t}
                                onDismiss={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
                            />
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
                            {/* Circular progress */}
                            <div className="relative w-28 h-28 mx-auto mb-6">
                                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                                    <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor"
                                        strokeWidth="8" className="text-gray-100 dark:text-white/10" />
                                    <motion.circle
                                        cx="50" cy="50" r="40" fill="none"
                                        stroke="url(#mergeGrad)" strokeWidth="8" strokeLinecap="round"
                                        strokeDasharray={circumference}
                                        animate={{ strokeDashoffset: circumference - (circumference * progress) / 100 }}
                                        transition={{ duration: 0.4, ease: 'easeOut' }}
                                    />
                                    <defs>
                                        <linearGradient id="mergeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                            <stop offset="0%" stopColor="#3b82f6" />
                                            <stop offset="100%" stopColor="#6366f1" />
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
                                {progress === 100 ? '✅ Merge Complete!' : 'Merging PDFs…'}
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {progressLabel || 'Please wait…'}
                            </p>

                            <div className="mt-4 w-full h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                                <motion.div
                                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"
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
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                        <Layers className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                        <h1 className="text-lg font-black dark:text-white tracking-tight">Merge PDF</h1>
                        <p className="text-[11px] text-gray-400 font-medium">
                            {files.length > 0
                                ? `${files.length} file${files.length > 1 ? 's' : ''} · ${totalPages} pages · ${formatBytes(totalSize)}`
                                : 'Combine multiple PDFs into one document'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Toggle thumbnails */}
                    <button
                        onClick={() => setShowThumbs(v => !v)}
                        title={showThumbs ? 'Hide thumbnails' : 'Show thumbnails'}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-colors text-gray-400"
                    >
                        {showThumbs ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>

                    {files.length > 0 && (
                        <button onClick={clearAll}
                            className="px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors flex items-center gap-1.5">
                            <Trash2 className="w-3.5 h-3.5" /> Clear All
                        </button>
                    )}
                </div>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 flex gap-0 overflow-hidden">

                {/* ── LEFT: Upload + File List ── */}
                <div className="flex-1 flex flex-col overflow-hidden p-4 lg:p-6 gap-4">

                    {/* Drop Zone */}
                    <div
                        ref={dropZoneRef}
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        onDrop={onDrop}
                        onClick={() => uploadInputRef.current?.click()}
                        className={`shrink-0 border-2 border-dashed rounded-2xl transition-all duration-200 cursor-pointer
                          ${isDragOver
                                ? 'border-blue-500 bg-blue-500/5 scale-[0.99]'
                                : files.length > 0
                                    ? 'border-gray-200 dark:border-white/10 bg-white dark:bg-[#262636] py-4'
                                    : 'border-gray-200 dark:border-white/10 bg-white dark:bg-[#262636] py-16'
                            }
                          hover:border-blue-400 dark:hover:border-blue-500/50 hover:bg-blue-50/30 dark:hover:bg-blue-900/10`}
                    >
                        <input
                            ref={uploadInputRef}
                            type="file"
                            multiple
                            accept=".pdf,application/pdf"
                            className="hidden"
                            onChange={(e) => e.target.files && addFiles(e.target.files)}
                        />

                        {files.length === 0 ? (
                            <div className="flex flex-col items-center text-center px-6">
                                <motion.div
                                    animate={{ y: [0, -6, 0] }}
                                    transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
                                    className="p-5 bg-blue-100 dark:bg-blue-900/30 rounded-2xl mb-4 shadow-lg shadow-blue-200 dark:shadow-blue-900/30"
                                >
                                    <Upload className="w-10 h-10 text-blue-600 dark:text-blue-400" />
                                </motion.div>
                                <h2 className="text-lg font-black dark:text-white mb-1">
                                    Drop PDFs here
                                </h2>
                                <p className="text-sm text-gray-400 mb-4">
                                    or <span className="text-blue-500 font-bold underline underline-offset-2">click to browse</span>
                                </p>
                                <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-gray-300 dark:text-gray-600">
                                    <span>PDF only</span><span>·</span>
                                    <span>Max {MAX_FILE_MB} MB/file</span><span>·</span>
                                    <span>Max {MAX_FILES} files</span>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center gap-3 text-sm text-gray-400 font-medium py-1">
                                <Plus className="w-4 h-4 text-blue-500" />
                                <span>Click or drag to <span className="text-blue-500 font-bold">add more PDFs</span></span>
                            </div>
                        )}
                    </div>

                    {/* File List */}
                    <AnimatePresence>
                        {files.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex-1 flex flex-col min-h-0"
                            >
                                <div className="flex items-center justify-between mb-2 px-1">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                                        Queue · {files.length}
                                        {files.length > 1 && (
                                            <span className="ml-2 text-blue-400">↕ Drag to reorder</span>
                                        )}
                                    </span>
                                    {!allLoaded && (
                                        <span className="flex items-center gap-1 text-[10px] text-blue-500 font-bold">
                                            <Loader2 className="w-3 h-3 animate-spin" /> Loading…
                                        </span>
                                    )}
                                </div>

                                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                                    <Reorder.Group
                                        axis="y"
                                        values={files}
                                        onReorder={setFiles}
                                        className="space-y-2"
                                    >
                                        <AnimatePresence initial={false}>
                                            {files.map((item, idx) => (
                                                <div key={item.id} className="relative">
                                                    {/* Sequence number badge */}
                                                    <span className="absolute -left-6 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[9px] font-black flex items-center justify-center select-none">
                                                        {idx + 1}
                                                    </span>
                                                    <FileCard
                                                        item={item}
                                                        onRemove={() => removeFile(item.id)}
                                                        onRangeChange={(v) => updateRange(item.id, v)}
                                                        onNameChange={(v) => updateName(item.id, v)}
                                                        showThumbs={showThumbs}
                                                    />
                                                </div>
                                            ))}
                                        </AnimatePresence>
                                    </Reorder.Group>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* ── RIGHT: Options + Action ── */}
                <div className="w-80 shrink-0 flex flex-col border-l border-gray-100 dark:border-white/5 bg-[#f3f1ea] dark:bg-[#262636] overflow-y-auto custom-scrollbar">

                    {/* Stats summary */}
                    {files.length > 0 && (
                        <div className="p-5 border-b border-gray-100 dark:border-white/5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Summary</p>
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { label: 'Files', value: files.length },
                                    { label: 'Pages', value: allLoaded ? totalPages : '…' },
                                    { label: 'Size', value: formatBytes(totalSize) },
                                ].map(stat => (
                                    <div key={stat.label} className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 text-center">
                                        <p className="text-base font-black text-blue-600 dark:text-blue-400">{stat.value}</p>
                                        <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mt-0.5">{stat.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Output name */}
                    <div className="p-5 border-b border-gray-100 dark:border-white/5 space-y-4">
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">
                                Output Filename
                            </label>
                            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl focus-within:ring-2 focus-within:ring-blue-400 focus-within:border-blue-400 transition-all">
                                <FileInput className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                <input
                                    type="text"
                                    value={outputName}
                                    onChange={(e) => setOutputName(e.target.value)}
                                    placeholder="merged"
                                    className="flex-1 bg-transparent text-sm font-bold dark:text-gray-200 outline-none placeholder-gray-300 dark:placeholder-gray-600"
                                />
                                <span className="text-[10px] text-gray-400 font-bold shrink-0">.pdf</span>
                            </div>
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

                                        {/* Blank page toggle */}
                                        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/10">
                                            <div>
                                                <p className="text-xs font-bold dark:text-gray-200 flex items-center gap-1.5">
                                                    <FilePlus2 className="w-3.5 h-3.5 text-blue-500" /> Blank page between files
                                                </p>
                                                <p className="text-[10px] text-gray-400 mt-0.5">Inserts an empty A4 separator</p>
                                            </div>
                                            <button
                                                onClick={() => setAddBlankBetween(v => !v)}
                                                className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ml-3 ${addBlankBetween ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'}`}
                                            >
                                                <motion.div
                                                    animate={{ left: addBlankBetween ? '20px' : '2px' }}
                                                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                                    className="absolute top-1 w-3 h-3 bg-white rounded-full shadow"
                                                    style={{ left: addBlankBetween ? '20px' : '2px' }}
                                                />
                                            </button>
                                        </div>

                                        {/* Page range help */}
                                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-500/20 rounded-xl">
                                            <p className="text-[10px] font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5 mb-1.5">
                                                <Info className="w-3 h-3" /> Page Range Syntax
                                            </p>
                                            <div className="space-y-1 text-[10px] text-blue-600 dark:text-blue-400 font-mono">
                                                <p><span className="font-bold">1,3,5</span> — specific pages</p>
                                                <p><span className="font-bold">1-5</span> — page range</p>
                                                <p><span className="font-bold">1-3,7,10-12</span> — combined</p>
                                                <p className="text-blue-400">(leave empty = all pages)</p>
                                            </div>
                                        </div>

                                        {/* Limits info */}
                                        <div className="p-3 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/10 space-y-1">
                                            <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                                <Zap className="w-3 h-3" /> Limits
                                            </p>
                                            {[
                                                [`Max ${MAX_FILES} files`, ''],
                                                [`Max ${MAX_FILE_MB} MB/file`, ''],
                                                [`Max ${MAX_TOTAL_MB} MB total`, ''],
                                                ['Client-side processing', 'files never leave your device'],
                                            ].map(([k, v]) => (
                                                <div key={k} className="flex justify-between text-[10px]">
                                                    <span className="text-gray-500 dark:text-gray-400 font-bold">{k}</span>
                                                    {v && <span className="text-gray-400">{v}</span>}
                                                </div>
                                            ))}
                                        </div>

                                        {/* Privacy note */}
                                        <div className="flex items-start gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-500/20 rounded-xl">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                                            <p className="text-[10px] text-emerald-700 dark:text-emerald-300 leading-relaxed">
                                                All processing happens <strong>in your browser</strong>. Your files are never uploaded to any server.
                                            </p>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* ── Action Button ── */}
                    <div className="p-5 border-t border-gray-100 dark:border-white/5 bg-white/80 dark:bg-[#262636]/80 backdrop-blur-sm">
                        {/* Order preview strip */}
                        {files.length > 1 && (
                            <div className="flex items-center gap-1 mb-4 overflow-hidden">
                                {files.slice(0, 5).map((f, i) => (
                                    <React.Fragment key={f.id}>
                                        <div className="text-[9px] font-black text-gray-400 truncate max-w-[48px]" title={f.displayName}>
                                            {f.displayName || f.name.replace('.pdf', '')}
                                        </div>
                                        {i < Math.min(files.length, 5) - 1 && (
                                            <span className="text-gray-300 dark:text-white/20 shrink-0">→</span>
                                        )}
                                    </React.Fragment>
                                ))}
                                {files.length > 5 && (
                                    <span className="text-[9px] text-gray-400 font-bold shrink-0">+{files.length - 5} more</span>
                                )}
                            </div>
                        )}

                        <button
                            onClick={handleMerge}
                            disabled={isProcessing || files.length < 2 || hasError || !allLoaded}
                            className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-sm transition-all duration-200 shadow-lg
                              ${files.length < 2 || hasError || !allLoaded
                                    ? 'bg-gray-200 dark:bg-white/5 text-gray-400 cursor-not-allowed shadow-none'
                                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/30 hover:-translate-y-0.5 active:translate-y-0'}`}
                        >
                            {isProcessing ? (
                                <><Loader2 className="w-5 h-5 animate-spin" /> Merging…</>
                            ) : (
                                <><Download className="w-5 h-5" /> Merge & Download</>
                            )}
                        </button>

                        {files.length < 2 && (
                            <p className="text-center text-[10px] text-gray-400 mt-2">
                                {files.length === 0 ? 'Add at least 2 PDFs to begin' : 'Add one more PDF to enable merge'}
                            </p>
                        )}

                        {!allLoaded && files.length > 0 && (
                            <p className="text-center text-[10px] text-blue-500 mt-2 flex items-center justify-center gap-1">
                                <Loader2 className="w-2.5 h-2.5 animate-spin" /> Analysing files…
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MergePDF;
