/**
 * OCRPDF — Hybrid AI + OCR module
 *
 * Pipeline stages shown live:
 *   detecting → rendering → ocr → enhancing → building → done
 *
 * UI Highlights:
 * - Multi-file drag & drop
 * - Language selector (20 languages)
 * - AI Enhancement toggle with token usage display
 * - Output format selector: TXT / Searchable PDF / JSON
 * - Page range selector per file
 * - Per-file staged progress with stage label
 * - Confidence meter (Tesseract + AI confidence)
 * - Before/After text preview (raw OCR vs AI cleaned)
 * - "Already has text" detection banner
 * - Batch OCR + Download All ZIP
 * - Toast notifications
 * - Indigo brand color — distinct from all other modules
 */

import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    ScanText, Upload, X, Download, Loader2, CheckCircle2,
    AlertCircle, ArrowLeft, Trash2, RotateCcw, Info,
    ChevronDown, ChevronUp, Archive, Sparkles, Eye, EyeOff,
    Settings2, Languages, FileText, FileJson, FilePlus2,
} from 'lucide-react';
import {
    runOcr, validatePdfForOcr, fmtSize, OCR_LANGUAGES, OCR_MAX_MB, OCR_MAX_PAGES,
    type OcrResult, type OcrOptions, type OcrLang, type OutputFormat, type OcrStage,
} from '../services/ocrService';
import { downloadBlob } from '../services/pdfService';
import JSZip from 'jszip';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

if (GlobalWorkerOptions) {
    GlobalWorkerOptions.workerSrc =
        `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type FileStatus = 'idle' | 'ready' | 'processing' | 'done' | 'error';

interface ManagedFile {
    id: string;
    file: File;
    status: FileStatus;
    stage: OcrStage | null;
    stageLabel: string;
    progress: number;
    totalPages: number;
    selectedPages: number[];
    result: OcrResult | null;
    error: string;
    thumb: string;
    showPreview: boolean;
}

interface Toast { id: string; type: 'success' | 'error' | 'info' | 'warn'; message: string; }
interface Props { onBack?: () => void; }

// ── Helpers ───────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 10);
const ACCEPT = '.pdf,application/pdf';

async function generateThumb(file: File): Promise<{ thumb: string; totalPages: number }> {
    const buf = await file.arrayBuffer();
    const pdf = await getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    const vp = page.getViewport({ scale: 0.3 });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
    return { thumb: canvas.toDataURL('image/jpeg', 0.5), totalPages: pdf.numPages };
}

function parseRange(raw: string, total: number): number[] {
    const out = new Set<number>();
    for (const part of raw.split(',')) {
        const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
        if (!m) continue;
        const from = parseInt(m[1]) - 1, to = m[2] ? parseInt(m[2]) - 1 : from;
        for (let i = Math.max(0, from); i <= Math.min(total - 1, to); i++) out.add(i);
    }
    return Array.from(out).sort((a, b) => a - b);
}

// Stage labels for progress display
const STAGE_LABELS: Record<OcrStage, string> = {
    detecting: 'Detecting text layer…',
    rendering: 'Rendering pages…',
    ocr: 'Running OCR…',
    enhancing: 'AI enhancing…',
    building: 'Building output…',
    done: 'Complete',
};

// ── Confidence meter ──────────────────────────────────────────────────────────

const ConfidenceMeter = ({ value, label }: { value: number; label: string }) => {
    const color = value >= 80 ? 'bg-emerald-500' : value >= 60 ? 'bg-yellow-500' : 'bg-red-500';
    return (
        <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-400 w-24 shrink-0">{label}</span>
            <div className="flex-1 h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                <motion.div className={`h-full rounded-full ${color}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${value}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }} />
            </div>
            <span className={`text-[10px] font-black w-8 text-right ${value >= 80 ? 'text-emerald-600 dark:text-emerald-400' :
                value >= 60 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600'
                }`}>{value}%</span>
        </div>
    );
};

// ── Toast ─────────────────────────────────────────────────────────────────────

const ToastItem = ({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) => (
    <motion.div layout initial={{ opacity: 0, x: 60, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 60, scale: 0.9 }}
        className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-xl max-w-sm text-sm font-medium border backdrop-blur-md pointer-events-auto
      ${toast.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/60 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
                : toast.type === 'error' ? 'bg-red-50 dark:bg-red-900/60 border-red-200 dark:border-red-500/30 text-red-800 dark:text-red-200'
                    : toast.type === 'warn' ? 'bg-amber-50 dark:bg-amber-900/60 border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-200'
                        : 'bg-indigo-50 dark:bg-indigo-900/60 border-indigo-200 dark:border-indigo-500/30 text-indigo-800 dark:text-indigo-200'}`}>
        {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
        {toast.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
        {toast.type === 'warn' && <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
        {toast.type === 'info' && <Info className="w-4 h-4 shrink-0 mt-0.5" />}
        <span className="flex-1 leading-snug">{toast.message}</span>
        <button onClick={onDismiss}><X className="w-3.5 h-3.5 opacity-60 hover:opacity-100" /></button>
    </motion.div>
);

// ── File Card ─────────────────────────────────────────────────────────────────

interface FileCardProps {
    entry: ManagedFile;
    language: OcrLang;
    aiEnhancement: boolean;
    outputFormat: OutputFormat;
    isAnyRunning: boolean;
    onRemove: () => void;
    onProcess: () => void;
    onDownload: () => void;
    onPageRange: (raw: string) => void;
    onTogglePreview: () => void;
}

const FileCard: React.FC<FileCardProps> = ({
    entry, language, aiEnhancement, outputFormat, isAnyRunning,
    onRemove, onProcess, onDownload, onPageRange, onTogglePreview,
}) => {
    const [showRange, setShowRange] = useState(false);
    const [rangeVal, setRangeVal] = useState('');

    const dot: Record<FileStatus, string> = {
        'idle': 'bg-gray-300 dark:bg-gray-600',
        'ready': 'bg-indigo-500',
        'processing': 'bg-indigo-400 animate-pulse',
        'done': 'bg-emerald-500',
        'error': 'bg-red-500',
    };

    const stageColor: Partial<Record<OcrStage, string>> = {
        detecting: 'text-blue-500',
        rendering: 'text-violet-500',
        ocr: 'text-orange-500',
        enhancing: 'text-pink-500',
        building: 'text-teal-500',
        done: 'text-emerald-500',
    };

    const formatIcons: Record<OutputFormat, React.ReactNode> = {
        txt: <FileText className="w-3 h-3" />,
        pdf: <FilePlus2 className="w-3 h-3" />,
        json: <FileJson className="w-3 h-3" />,
    };

    const r = entry.result;

    return (
        <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">

            <div className="p-4">
                {/* Top row */}
                <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${dot[entry.status]}`} />

                    {/* Thumb */}
                    <div className="w-10 h-12 shrink-0 rounded-lg overflow-hidden bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-500/20 flex items-center justify-center">
                        {entry.thumb
                            ? <img src={entry.thumb} alt="" className="w-full h-full object-cover" />
                            : <ScanText className="w-4 h-4 text-indigo-400" />}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold dark:text-white truncate">{entry.file.name}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-[10px] text-gray-400 font-mono">{fmtSize(entry.file.size)}</span>
                            {entry.totalPages > 0 && (
                                <span className="text-[10px] text-indigo-500 font-bold">
                                    {entry.selectedPages.length > 0
                                        ? `${entry.selectedPages.length} of ${entry.totalPages} pages`
                                        : `${entry.totalPages} pages`}
                                </span>
                            )}
                            <span className="text-[10px] font-bold text-gray-400">
                                {OCR_LANGUAGES[language]} {aiEnhancement ? '· 🤖 AI' : ''}
                            </span>

                            {/* Stage label while processing */}
                            {entry.status === 'processing' && entry.stage && (
                                <span className={`text-[10px] font-black ${stageColor[entry.stage] ?? 'text-indigo-500'}`}>
                                    {STAGE_LABELS[entry.stage]}
                                </span>
                            )}

                            {/* Results summary */}
                            {entry.status === 'done' && r && (
                                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                    ✓ {r.pages.length} page{r.pages.length !== 1 ? 's' : ''} · {r.avgConfidence}% confidence
                                    {r.aiEnhanced ? ' · AI ✨' : ''}
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
                                        className="p-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg text-indigo-400 hover:text-indigo-600 transition-colors">
                                        <Settings2 className="w-4 h-4" />
                                    </button>
                                )}
                                <button onClick={onProcess} disabled={isAnyRunning}
                                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-40 shadow-sm flex items-center gap-1.5">
                                    <ScanText className="w-3.5 h-3.5" /> OCR
                                </button>
                            </>
                        )}

                        {entry.status === 'processing' && (
                            <div className="flex items-center gap-2 px-3">
                                <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                                <span className="text-xs text-indigo-500 font-bold">{entry.progress}%</span>
                            </div>
                        )}

                        {entry.status === 'done' && (
                            <>
                                <button onClick={onTogglePreview} title="Preview text"
                                    className="p-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg text-indigo-400 transition-colors">
                                    {entry.showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                                <button onClick={onProcess} title="Re-run OCR"
                                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg text-gray-400">
                                    <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={onDownload}
                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm">
                                    {formatIcons[outputFormat]}
                                    .{r?.format}
                                </button>
                            </>
                        )}

                        {entry.status === 'error' && (
                            <button onClick={onProcess}
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

                {/* Confidence meters */}
                {entry.status === 'done' && r && (
                    <div className="mt-3 space-y-1.5">
                        <ConfidenceMeter value={r.avgConfidence} label="OCR confidence" />
                        {r.aiEnhanced && r.pages[0]?.aiConfidence != null && (
                            <ConfidenceMeter value={r.pages[0].aiConfidence} label="AI estimate" />
                        )}
                    </div>
                )}

                {/* Already-has-text banner */}
                {entry.status === 'done' && r?.alreadyHasText && (
                    <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 rounded-xl text-[11px] text-amber-700 dark:text-amber-300 font-bold">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        This PDF already contains a text layer — OCR may not add further value.
                    </div>
                )}

                {/* Token usage */}
                {entry.status === 'done' && r?.aiEnhanced && r.tokenUsage && (
                    <div className="mt-2 flex items-center gap-1 text-[10px] text-gray-400">
                        <Sparkles className="w-3 h-3 text-indigo-400" />
                        <span>AI tokens: {r.tokenUsage.prompt + r.tokenUsage.completion} total</span>
                    </div>
                )}
            </div>

            {/* Progress bar */}
            {entry.status === 'processing' && (
                <div className="h-1 bg-gray-100 dark:bg-white/5">
                    <motion.div className="h-full bg-gradient-to-r from-indigo-600 via-violet-500 to-pink-400"
                        animate={{ width: `${entry.progress}%` }} transition={{ duration: 0.3 }} />
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
                                OCR Pages <span className="normal-case font-normal">(e.g. 1,3,5-8 · blank = all · max {OCR_MAX_PAGES})</span>
                            </p>
                            <div className="flex items-center gap-2">
                                <input type="text" value={rangeVal} onChange={e => setRangeVal(e.target.value)}
                                    onBlur={() => onPageRange(rangeVal)}
                                    placeholder={`1-${entry.totalPages}`}
                                    className="flex-1 px-3 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-xs font-mono dark:text-white outline-none focus:ring-2 focus:ring-indigo-400" />
                                <button onClick={() => { onPageRange(rangeVal); setShowRange(false); }}
                                    className="px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-500">Apply</button>
                                <button onClick={() => { setRangeVal(''); onPageRange(''); }}
                                    className="px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 text-xs font-bold rounded-xl">All</button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Text preview */}
            <AnimatePresence>
                {entry.showPreview && entry.result && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
                        <div className="border-t border-gray-50 dark:border-white/5 p-4 space-y-3">
                            {entry.result.pages.slice(0, 2).map((pg, i) => (
                                <div key={i} className="space-y-1">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">
                                        Page {pg.pageIndex + 1} — {pg.confidence}% confidence
                                        {pg.headings.length > 0 && <span className="text-violet-500 ml-2">· {pg.headings.length} heading{pg.headings.length !== 1 ? 's' : ''}</span>}
                                    </p>
                                    <div className="flex gap-3">
                                        {/* Raw */}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Raw OCR</p>
                                            <pre className="text-[10px] text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-white/5 rounded-xl p-3 max-h-28 overflow-y-auto whitespace-pre-wrap leading-relaxed font-mono">
                                                {pg.rawText.slice(0, 500) || '(empty)'}
                                            </pre>
                                        </div>
                                        {/* Clean */}
                                        {entry.result!.aiEnhanced && (
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[9px] font-black text-indigo-400 uppercase mb-1 flex items-center gap-1">
                                                    <Sparkles className="w-2.5 h-2.5" /> AI Cleaned
                                                </p>
                                                <pre className="text-[10px] text-gray-600 dark:text-gray-300 bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-500/20 rounded-xl p-3 max-h-28 overflow-y-auto whitespace-pre-wrap leading-relaxed font-mono">
                                                    {pg.cleanText.slice(0, 500) || '(empty)'}
                                                </pre>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {entry.result.pages.length > 2 && (
                                <p className="text-[10px] text-gray-400 text-center">
                                    + {entry.result.pages.length - 2} more page{entry.result.pages.length - 2 !== 1 ? 's' : ''} in downloaded file
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

export const OCRPDF: React.FC<Props> = ({ onBack }) => {
    const [files, setFiles] = useState<ManagedFile[]>([]);
    const [isDragOver, setIsDragOver] = useState(false);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [infoOpen, setInfoOpen] = useState(false);
    const [language, setLanguage] = useState<OcrLang>('eng');
    const [aiEnhancement, setAiEnhancement] = useState(true);
    const [outputFormat, setOutputFormat] = useState<OutputFormat>('txt');

    const dropRef = useRef<HTMLDivElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const toast = useCallback((type: Toast['type'], message: string) => {
        const id = uid();
        setToasts(prev => [...prev.slice(-4), { id, type, message }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 8000);
    }, []);

    const initFile = useCallback(async (raw: File): Promise<ManagedFile> => {
        let thumb = '', totalPages = 0;
        try { const r = await generateThumb(raw); thumb = r.thumb; totalPages = r.totalPages; }
        catch { /* icon fallback */ }
        return {
            id: uid(), file: raw, status: 'ready', stage: null, stageLabel: '',
            progress: 0, totalPages, selectedPages: [],
            result: null, error: '', thumb, showPreview: false,
        };
    }, []);

    const addFiles = useCallback(async (incoming: FileList | File[]) => {
        const arr = Array.from(incoming);
        const valid: File[] = [];
        for (const f of arr) {
            const err = validatePdfForOcr(f);
            if (err) { toast('error', err); continue; }
            if (files.some(e => e.file.name === f.name && e.file.size === f.size)) {
                toast('info', `"${f.name}" already added.`); continue;
            }
            valid.push(f);
        }
        if (!valid.length) return;

        const skeletons: ManagedFile[] = valid.map(f => ({
            id: uid(), file: f, status: 'ready' as FileStatus, stage: null, stageLabel: '',
            progress: 0, totalPages: 0, selectedPages: [], result: null, error: '', thumb: '', showPreview: false,
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

    const processOne = useCallback(async (id: string) => {
        const entry = files.find(f => f.id === id);
        if (!entry) return;
        updateFile(id, { status: 'processing', progress: 0, error: '', result: null, stage: 'detecting', showPreview: false });

        try {
            const opts: OcrOptions = {
                language,
                aiEnhancement,
                outputFormat,
                selectedPages: entry.selectedPages.length > 0 ? entry.selectedPages : undefined,
                onProgress: (stage, percent, detail) => {
                    updateFile(id, {
                        stage,
                        stageLabel: detail ?? STAGE_LABELS[stage],
                        progress: percent,
                    });
                },
            };

            const result = await runOcr(entry.file, opts);
            updateFile(id, { status: 'done', result, progress: 100, stage: 'done' });

            if (result.alreadyHasText) {
                toast('warn', `📄 "${entry.file.name}" already has a text layer. OCR ran anyway.`);
            } else if (result.avgConfidence < 50) {
                toast('warn', `⚠️ Low OCR confidence (${result.avgConfidence}%) — try a higher DPI scan.`);
            } else {
                toast('success', `✅ OCR complete: ${result.pages.length} page${result.pages.length !== 1 ? 's' : ''}, ${result.avgConfidence}% confidence${result.aiEnhanced ? ', AI enhanced ✨' : ''}`);
            }
        } catch (err: any) {
            const msg = err?.message ?? 'OCR failed.';
            updateFile(id, { status: 'error', error: msg, progress: 0, stage: null });
            toast('error', msg);
        }
    }, [files, language, aiEnhancement, outputFormat, toast]);

    const processAll = useCallback(async () => {
        const ready = files.filter(f => f.status === 'ready' || f.status === 'error');
        for (const f of ready) await processOne(f.id);
    }, [files, processOne]);

    const downloadOne = (id: string) => {
        const e = files.find(f => f.id === id);
        if (!e?.result) return;
        downloadBlob(e.result.outputBlob, e.result.outputName);
    };

    const downloadAll = async () => {
        const done = files.filter(f => f.status === 'done' && f.result);
        if (!done.length) return;
        if (done.length === 1) { downloadOne(done[0].id); return; }
        const zip = new JSZip();
        for (const f of done) zip.file(f.result!.outputName, f.result!.outputBlob);
        downloadBlob(await zip.generateAsync({ type: 'blob' }), 'OmniPDF_OCR_Export.zip');
    };

    const removeFile = (id: string) => setFiles(p => p.filter(f => f.id !== id));
    const isProcessing = files.some(f => f.status === 'processing');
    const readyCount = files.filter(f => f.status === 'ready' || f.status === 'error').length;
    const doneCount = files.filter(f => f.status === 'done').length;

    const formatInfo: Record<OutputFormat, { icon: React.ReactNode; label: string; sub: string }> = {
        txt: { icon: <FileText className="w-4 h-4" />, label: 'Plain Text', sub: '.txt file' },
        pdf: { icon: <FilePlus2 className="w-4 h-4" />, label: 'Searchable PDF', sub: 'text layer added' },
        json: { icon: <FileJson className="w-4 h-4" />, label: 'Structured JSON', sub: 'for API use' },
    };

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
                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
                        <ScanText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                        <h1 className="text-lg font-black dark:text-white tracking-tight flex items-center gap-2">
                            OCR PDF
                            <span className="text-[10px] font-black bg-gradient-to-r from-indigo-500 to-violet-500 text-white px-2 py-0.5 rounded-full">HYBRID AI</span>
                        </h1>
                        <p className="text-[11px] text-gray-400 font-medium">Tesseract OCR + AI text reconstruction</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {doneCount > 1 && (
                        <button onClick={downloadAll}
                            className="px-3 py-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl flex items-center gap-1.5 transition-colors">
                            <Archive className="w-3.5 h-3.5" /> Download All ({doneCount})
                        </button>
                    )}
                    {readyCount > 1 && (
                        <button onClick={processAll} disabled={isProcessing}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-colors shadow-sm flex items-center gap-1.5">
                            <ScanText className="w-3.5 h-3.5" /> OCR All ({readyCount})
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
              ${isDragOver ? 'border-indigo-500 bg-indigo-500/5 scale-[0.99]' : 'border-gray-200 dark:border-white/10 bg-white dark:bg-[#262636]'}
              hover:border-indigo-400 dark:hover:border-indigo-500/50 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10`}>
                        <input ref={fileRef} type="file" accept={ACCEPT} multiple className="hidden"
                            onChange={e => e.target.files && addFiles(e.target.files)} />
                        <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                            className="p-4 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30">
                            <Upload className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
                        </motion.div>
                        <div className="text-center">
                            <p className="text-base font-black dark:text-white">Drop scanned PDF files here</p>
                            <p className="text-sm text-gray-400 mt-0.5">
                                or <span className="text-indigo-500 font-bold underline underline-offset-2">click to browse</span>
                            </p>
                        </div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 dark:text-gray-600">
                            PDF only · Max {OCR_MAX_MB} MB · Max {OCR_MAX_PAGES} pages per file
                        </p>
                    </div>

                    {/* File list */}
                    <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pb-4">
                        <AnimatePresence mode="popLayout">
                            {files.length === 0 ? (
                                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                    className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
                                    <div className="p-5 bg-gray-100 dark:bg-white/5 rounded-2xl">
                                        <ScanText className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                                    </div>
                                    <p className="text-sm font-bold text-gray-400">No PDFs added yet</p>
                                    <p className="text-xs text-gray-300 dark:text-gray-600 max-w-xs leading-relaxed">
                                        Upload scanned or image-based PDFs. The AI pipeline will extract, clean, and reconstruct readable text.
                                    </p>
                                </motion.div>
                            ) : (
                                files.map(entry => (
                                    <FileCard key={entry.id} entry={entry}
                                        language={language} aiEnhancement={aiEnhancement} outputFormat={outputFormat}
                                        isAnyRunning={isProcessing}
                                        onRemove={() => removeFile(entry.id)}
                                        onProcess={() => processOne(entry.id)}
                                        onDownload={() => downloadOne(entry.id)}
                                        onPageRange={raw => updateFile(entry.id, {
                                            selectedPages: raw.trim() ? parseRange(raw, entry.totalPages) : [],
                                        })}
                                        onTogglePreview={() => updateFile(entry.id, { showPreview: !entry.showPreview })}
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
                                    { label: 'Files', value: files.length, color: 'text-indigo-600 dark:text-indigo-400' },
                                    { label: 'Pages', value: files.reduce((s, f) => s + f.totalPages, 0) || '—', color: 'text-gray-700 dark:text-gray-200' },
                                    { label: 'Ready', value: readyCount, color: 'text-gray-500' },
                                    { label: 'Done', value: doneCount, color: 'text-emerald-600 dark:text-emerald-400' },
                                ].map(s => (
                                    <div key={s.label} className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 text-center">
                                        <p className={`text-base font-black font-mono ${s.color}`}>{s.value}</p>
                                        <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mt-0.5">{s.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Language selector */}
                    <div className="p-5 border-b border-gray-100 dark:border-white/5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-1.5">
                            <Languages className="w-3 h-3" /> OCR Language
                        </p>
                        <select value={language} onChange={e => setLanguage(e.target.value as OcrLang)}
                            className="w-full px-3 py-2.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-sm dark:text-white outline-none focus:ring-2 focus:ring-indigo-400 font-medium">
                            {(Object.entries(OCR_LANGUAGES) as [OcrLang, string][]).map(([code, name]) => (
                                <option key={code} value={code}>{name}</option>
                            ))}
                        </select>
                    </div>

                    {/* AI Enhancement toggle */}
                    <div className="p-5 border-b border-gray-100 dark:border-white/5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">AI Enhancement</p>
                        <button onClick={() => setAiEnhancement(v => !v)}
                            className={`w-full flex items-center justify-between px-3 py-3 rounded-xl border-2 transition-all
                ${aiEnhancement
                                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30'
                                    : 'border-gray-100 dark:border-white/10 hover:border-indigo-200'}`}>
                            <div className="flex items-center gap-2">
                                <Sparkles className={`w-4 h-4 ${aiEnhancement ? 'text-indigo-500' : 'text-gray-400'}`} />
                                <div className="text-left">
                                    <span className="text-xs font-black dark:text-white">AI Text Cleanup</span>
                                    <p className="text-[9px] text-gray-400 leading-tight">Fix spelling · Reconstruct paragraphs · Detect headings</p>
                                </div>
                            </div>
                            <div className={`w-8 h-4 rounded-full transition-colors shrink-0 ${aiEnhancement ? 'bg-indigo-500' : 'bg-gray-200 dark:bg-gray-700'}`}>
                                <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${aiEnhancement ? 'translate-x-4' : 'translate-x-0'}`} />
                            </div>
                        </button>
                        {!aiEnhancement && (
                            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold mt-2 px-1">
                                ⚠ Raw OCR output only — no spelling/formatting corrections.
                            </p>
                        )}
                    </div>

                    {/* Output format */}
                    <div className="p-5 border-b border-gray-100 dark:border-white/5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Output Format</p>
                        <div className="space-y-1.5">
                            {(Object.entries(formatInfo) as [OutputFormat, typeof formatInfo[OutputFormat]][]).map(([k, info]) => (
                                <button key={k} onClick={() => setOutputFormat(k)}
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 text-left transition-all
                    ${outputFormat === k
                                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30'
                                            : 'border-gray-100 dark:border-white/10 hover:border-indigo-200'}`}>
                                    <span className={outputFormat === k ? 'text-indigo-500' : 'text-gray-400'}>{info.icon}</span>
                                    <div>
                                        <p className="text-xs font-black dark:text-white">{info.label}</p>
                                        <p className="text-[9px] text-gray-400">{info.sub}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* How it works */}
                    <div className="border-b border-gray-100 dark:border-white/5">
                        <button onClick={() => setInfoOpen(v => !v)}
                            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                            <span className="flex items-center gap-2 text-xs font-bold text-gray-600 dark:text-gray-300">
                                <Info className="w-3.5 h-3.5" /> Pipeline overview
                            </span>
                            {infoOpen ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                        </button>
                        <AnimatePresence>
                            {infoOpen && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                    <div className="px-5 pb-5 space-y-2 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                                        {[
                                            { n: '1', c: 'text-blue-500', t: 'Text Detection — checks if PDF already has selectable text.' },
                                            { n: '2', c: 'text-violet-500', t: 'Render → Canvas at 2.5× scale + contrast boost for accuracy.' },
                                            { n: '3', c: 'text-orange-500', t: 'Tesseract.js OCR extracts text with per-page confidence scores.' },
                                            { n: '4', c: 'text-pink-500', t: 'OpenRouter AI fixes OCR errors, reconstructs paragraphs and tables.' },
                                            { n: '5', c: 'text-teal-500', t: 'Output: plain text, searchable PDF (invisible text layer), or JSON.' },
                                        ].map(s => (
                                            <div key={s.n} className="flex items-start gap-2">
                                                <span className={`w-4 h-4 rounded-full text-white text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5 ${s.c.replace('text-', 'bg-')}`}>{s.n}</span>
                                                <p>{s.t}</p>
                                            </div>
                                        ))}
                                        <div className="flex items-start gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-500/20 rounded-xl mt-2">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                                            <p className="text-[10px] text-emerald-700 dark:text-emerald-300">
                                                <strong>100% in your browser.</strong> AI calls use OpenRouter (no file upload to AI).
                                            </p>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className="flex-1" />

                    {/* Badge */}
                    <div className="p-5 border-t border-gray-100 dark:border-white/5">
                        <div className="flex items-center gap-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl">
                            <div className="w-8 h-8 shrink-0 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center">
                                <Sparkles className="w-4 h-4 text-white" />
                            </div>
                            <div>
                                <p className="text-[11px] font-black text-indigo-700 dark:text-indigo-300">Hybrid AI OCR</p>
                                <p className="text-[9px] text-indigo-500 leading-tight">Tesseract · OpenRouter · pdf-lib</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
