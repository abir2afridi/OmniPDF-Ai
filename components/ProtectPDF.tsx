/**
 * ProtectPDF — Protect & Unlock PDF module
 *
 * Two-tab UI:
 *   🔒 Protect — AES-128/AES-256 encryption, user + owner passwords,
 *                permission toggles, password strength meter,
 *                security summary before download
 *   🔓 Unlock  — password removal with attempt rate limiting
 *
 * Teal/Slate brand color — distinct from all other modules.
 */

import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    Lock, Unlock, Upload, X, Download, Loader2, CheckCircle2,
    AlertCircle, ArrowLeft, Trash2, RotateCcw, Info, Eye, EyeOff,
    ShieldCheck, ShieldAlert, Shield, FileKey, Printer, Copy,
    Pencil, MessageSquare, FormInput, Accessibility, BookOpen,
    ChevronDown, ChevronUp, Archive,
} from 'lucide-react';
import {
    protectPdf, unlockPdf, validatePdfForProtect, scorePassword, fmtSize,
    STRENGTH_CONFIG, FULL_PERMISSIONS, READ_ONLY_PERMISSIONS, PROTECT_MAX_MB,
    type EncryptionLevel, type PermissionSettings, type ProtectResult, type UnlockResult,
    type PasswordScore, type PasswordStrength,
} from '../services/protectService';
import { downloadBlob } from '../services/pdfService';
import JSZip from 'jszip';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

if (GlobalWorkerOptions) {
    GlobalWorkerOptions.workerSrc =
        `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'protect' | 'unlock';
type FileStatus = 'idle' | 'ready' | 'processing' | 'done' | 'error';

interface ManagedFile {
    id: string;
    file: File;
    status: FileStatus;
    progress: number;
    outputName: string;
    result: ProtectResult | UnlockResult | null;
    error: string;
    thumb: string;
}

interface Toast { id: string; type: 'success' | 'error' | 'info' | 'warn'; message: string; }
interface Props { onBack?: () => void; }

const uid = () => Math.random().toString(36).slice(2, 10);
const ACCEPT = '.pdf,application/pdf';

// ── Thumbnail ─────────────────────────────────────────────────────────────────

async function generateThumb(file: File): Promise<string> {
    try {
        const buf = await file.arrayBuffer();
        const pdf = await getDocument({ data: buf, password: '' }).promise;
        const page = await pdf.getPage(1);
        const vp = page.getViewport({ scale: 0.3 });
        const c = document.createElement('canvas');
        c.width = vp.width; c.height = vp.height;
        await page.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise;
        return c.toDataURL('image/jpeg', 0.4);
    } catch { return ''; }
}

// ── Toast ─────────────────────────────────────────────────────────────────────

const ToastItem = ({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) => (
    <motion.div layout initial={{ opacity: 0, x: 60, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 60, scale: 0.9 }}
        className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-xl max-w-sm text-sm font-medium border backdrop-blur-md pointer-events-auto
      ${toast.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/60 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
                : toast.type === 'error' ? 'bg-red-50 dark:bg-red-900/60 border-red-200 dark:border-red-500/30 text-red-800 dark:text-red-200'
                    : toast.type === 'warn' ? 'bg-amber-50 dark:bg-amber-900/60 border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-200'
                        : 'bg-teal-50 dark:bg-teal-900/60 border-teal-200 dark:border-teal-500/30 text-teal-800 dark:text-teal-200'}`}>
        {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
        {toast.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
        {toast.type === 'warn' && <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
        {toast.type === 'info' && <Info className="w-4 h-4 shrink-0 mt-0.5" />}
        <span className="flex-1 leading-snug">{toast.message}</span>
        <button onClick={onDismiss}><X className="w-3.5 h-3.5 opacity-60 hover:opacity-100" /></button>
    </motion.div>
);

// ── Password strength indicator ───────────────────────────────────────────────

const StrengthMeter = ({ score }: { score: PasswordScore }) => {
    const cfg = STRENGTH_CONFIG[score.strength];
    if (score.strength === 'none') return null;
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Password strength</span>
                <span className={`text-[10px] font-black ${cfg.color}`}>{cfg.label}</span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden">
                <motion.div className={`h-full rounded-full ${cfg.bg}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${score.score}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }} />
            </div>
            {score.suggestions.slice(0, 2).map((s, i) => (
                <p key={i} className="text-[10px] text-gray-400 leading-tight">• {s}</p>
            ))}
        </div>
    );
};

// ── Permission toggle ─────────────────────────────────────────────────────────

interface PermRowProps {
    icon: React.ReactNode;
    label: string;
    sub?: string;
    enabled: boolean;
    onToggle: () => void;
}
const PermRow: React.FC<PermRowProps> = ({ icon, label, sub, enabled, onToggle }) => (
    <button onClick={onToggle}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border-2 transition-all text-left
      ${enabled
                ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                : 'border-gray-100 dark:border-white/10 hover:border-teal-200'}`}>
        <div className="flex items-center gap-2.5">
            <span className={`shrink-0 ${enabled ? 'text-teal-500' : 'text-gray-400'}`}>{icon}</span>
            <div>
                <span className="text-xs font-bold dark:text-white">{label}</span>
                {sub && <p className="text-[9px] text-gray-400 leading-tight">{sub}</p>}
            </div>
        </div>
        <div className={`w-8 h-4 rounded-full transition-colors shrink-0 ${enabled ? 'bg-teal-500' : 'bg-gray-200 dark:bg-gray-700'}`}>
            <motion.div layout className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
        </div>
    </button>
);

// ── Security summary ──────────────────────────────────────────────────────────

const SecuritySummary = ({ result }: { result: ProtectResult }) => {
    const enc = result.encryptionLevel === 'aes256' ? 'AES-256' : 'AES-128';
    const p = result.permissions;

    const strengthIcon = (s: string) =>
        s === 'excellent' ? '🟢' : s === 'strong' ? '🟡' : '🔴';

    return (
        <div className="mt-3 p-3 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-500/30 rounded-xl space-y-2">
            <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0" />
                <span className="text-xs font-black text-teal-700 dark:text-teal-300">
                    {enc} Encryption · {STRENGTH_CONFIG[result.passwordStrength].label} password {strengthIcon(result.passwordStrength)}
                </span>
            </div>
            <div className="grid grid-cols-2 gap-1 text-[10px] text-gray-600 dark:text-gray-400">
                {[
                    ['Printing', p.allowPrinting],
                    ['Copying', p.allowCopying],
                    ['Editing', p.allowEditing],
                    ['Annotating', p.allowAnnotating],
                    ['Forms', p.allowFillingForms],
                    ['Assembly', p.allowAssembly],
                ].map(([label, allowed]) => (
                    <div key={label as string} className="flex items-center gap-1">
                        {allowed
                            ? <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                            : <X className="w-3 h-3 text-red-400 shrink-0" />}
                        <span>{label as string}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ── File Card ─────────────────────────────────────────────────────────────────

interface FileCardProps {
    entry: ManagedFile;
    tab: Tab;
    isRunning: boolean;
    onRemove: () => void;
    onProcess: () => void;
    onDownload: () => void;
    onRename: (n: string) => void;
}

const FileCard: React.FC<FileCardProps> = ({
    entry, tab, isRunning, onRemove, onProcess, onDownload, onRename,
}) => {
    const dot: Record<FileStatus, string> = {
        'idle': 'bg-gray-300 dark:bg-gray-600',
        'ready': 'bg-teal-500',
        'processing': 'bg-teal-400 animate-pulse',
        'done': 'bg-emerald-500',
        'error': 'bg-red-500',
    };

    const isProtectResult = (r: any): r is ProtectResult => r && 'encryptedBlob' in r;
    const r = entry.result;

    return (
        <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <div className="p-4">
                <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${dot[entry.status]}`} />

                    {/* Thumb */}
                    <div className="w-10 h-12 shrink-0 rounded-lg overflow-hidden bg-teal-50 dark:bg-teal-900/20 border border-teal-100 dark:border-teal-500/20 flex items-center justify-center">
                        {entry.thumb
                            ? <img src={entry.thumb} alt="" className="w-full h-full object-cover" />
                            : (tab === 'protect'
                                ? <Lock className="w-4 h-4 text-teal-400" />
                                : <Unlock className="w-4 h-4 text-teal-400" />)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                        {entry.status === 'done' ? (
                            <input value={entry.outputName} onChange={e => onRename(e.target.value)}
                                className="w-full text-sm font-bold dark:text-white bg-transparent outline-none border-b border-transparent hover:border-teal-300 focus:border-teal-400 transition-colors font-mono truncate" />
                        ) : (
                            <p className="text-sm font-bold dark:text-white truncate">{entry.file.name}</p>
                        )}
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-[10px] text-gray-400 font-mono">{fmtSize(entry.file.size)}</span>
                            {entry.status === 'done' && r && isProtectResult(r) && (
                                <span className="text-[10px] text-teal-600 dark:text-teal-400 font-bold">
                                    🔒 {r.encryptionLevel === 'aes256' ? 'AES-256' : 'AES-128'} · {fmtSize(r.encryptedSize)}
                                </span>
                            )}
                            {entry.status === 'done' && r && !isProtectResult(r) && (
                                <span className="text-[10px] text-teal-600 dark:text-teal-400 font-bold">
                                    🔓 Unlocked · {fmtSize((r as UnlockResult).unlockedSize)}
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
                            <button onClick={onProcess} disabled={isRunning}
                                className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-40 shadow-sm flex items-center gap-1.5">
                                {tab === 'protect' ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                                {tab === 'protect' ? 'Protect' : 'Unlock'}
                            </button>
                        )}
                        {entry.status === 'processing' && (
                            <div className="flex items-center gap-2 px-3">
                                <Loader2 className="w-4 h-4 animate-spin text-teal-500" />
                                <span className="text-xs text-teal-500 font-bold">{entry.progress}%</span>
                            </div>
                        )}
                        {entry.status === 'done' && (
                            <>
                                <button onClick={onProcess} title="Re-process"
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

                {/* Security summary for protect results */}
                {entry.status === 'done' && r && isProtectResult(r) && (
                    <SecuritySummary result={r} />
                )}
            </div>

            {/* Progress bar */}
            {entry.status === 'processing' && (
                <div className="h-1 bg-gray-100 dark:bg-white/5">
                    <motion.div className="h-full bg-gradient-to-r from-teal-600 to-cyan-400"
                        animate={{ width: `${entry.progress}%` }} transition={{ duration: 0.3 }} />
                </div>
            )}
            {entry.status === 'done' && <div className="h-0.5 bg-emerald-400/60" />}
            {entry.status === 'error' && <div className="h-0.5 bg-red-400/60" />}
        </motion.div>
    );
};

// ── Main Component ────────────────────────────────────────────────────────────

export const ProtectPDF: React.FC<Props> = ({ onBack }) => {
    const [tab, setTab] = useState<Tab>('protect');
    const [files, setFiles] = useState<ManagedFile[]>([]);
    const [isDragOver, setIsDragOver] = useState(false);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [infoOpen, setInfoOpen] = useState(false);
    const [showUserPw, setShowUserPw] = useState(false);
    const [showOwnerPw, setShowOwnerPw] = useState(false);
    const [showUnlockPw, setShowUnlockPw] = useState(false);

    // Protect settings
    const [userPassword, setUserPassword] = useState('');
    const [ownerPassword, setOwnerPassword] = useState('');
    const [encLevel, setEncLevel] = useState<EncryptionLevel>('aes256');
    const [permissions, setPermissions] = useState<PermissionSettings>(READ_ONLY_PERMISSIONS);

    // Unlock setting
    const [unlockPassword, setUnlockPassword] = useState('');

    const dropRef = useRef<HTMLDivElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const pwScore: PasswordScore = scorePassword(userPassword);

    const toast = useCallback((type: Toast['type'], message: string) => {
        const id = uid();
        setToasts(prev => [...prev.slice(-4), { id, type, message }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 8000);
    }, []);

    const addFiles = useCallback(async (incoming: FileList | File[]) => {
        const arr = Array.from(incoming);
        for (const f of arr) {
            const err = validatePdfForProtect(f);
            if (err) { toast('error', err); continue; }
            if (files.some(e => e.file.name === f.name && e.file.size === f.size)) {
                toast('info', `"${f.name}" already added.`); continue;
            }
            const skeleton: ManagedFile = {
                id: uid(), file: f, status: 'ready', progress: 0,
                outputName: f.name.replace(/\.pdf$/i, ''),
                result: null, error: '', thumb: '',
            };
            setFiles(prev => [...prev, skeleton]);
            const thumb = await generateThumb(f);
            setFiles(prev => prev.map(e => e.id === skeleton.id ? { ...e, thumb } : e));
        }
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

    // ─ Protect ─
    const processProtect = useCallback(async (id: string) => {
        if (!userPassword) { toast('error', 'Enter a user password first.'); return; }
        if (pwScore.strength === 'weak') {
            toast('warn', '⚠ Password is weak. Consider a stronger one before protecting important documents.');
        }
        const entry = files.find(f => f.id === id);
        if (!entry) return;
        updateFile(id, { status: 'processing', progress: 0, error: '', result: null });
        try {
            const result = await protectPdf(entry.file, {
                userPassword,
                ownerPassword: ownerPassword || undefined,
                encryptionLevel: encLevel,
                permissions,
                outputName: entry.outputName,
                onProgress: p => updateFile(id, { progress: p }),
            });
            updateFile(id, { status: 'done', result, progress: 100 });
            toast('success', `🔒 "${entry.file.name}" protected with ${encLevel === 'aes256' ? 'AES-256' : 'AES-128'} encryption.`);
        } catch (err: any) {
            const msg = err?.message ?? 'Protection failed.';
            updateFile(id, { status: 'error', error: msg, progress: 0 });
            toast('error', msg);
        }
    }, [files, userPassword, ownerPassword, encLevel, permissions, pwScore, toast]);

    // ─ Unlock ─
    const processUnlock = useCallback(async (id: string) => {
        if (!unlockPassword) { toast('error', 'Enter the PDF password first.'); return; }
        const entry = files.find(f => f.id === id);
        if (!entry) return;
        updateFile(id, { status: 'processing', progress: 0, error: '', result: null });
        try {
            const result = await unlockPdf(entry.file, {
                password: unlockPassword,
                outputName: entry.outputName,
                onProgress: p => updateFile(id, { progress: p }),
            });
            updateFile(id, { status: 'done', result, progress: 100 });
            toast('success', `🔓 Password removed from "${entry.file.name}".`);
        } catch (err: any) {
            const msg = err?.message ?? 'Unlock failed.';
            updateFile(id, { status: 'error', error: msg, progress: 0 });
            toast('error', msg);
        }
    }, [files, unlockPassword, toast]);

    const processOne = (id: string) => tab === 'protect' ? processProtect(id) : processUnlock(id);

    const processAll = useCallback(async () => {
        const ready = files.filter(f => f.status === 'ready' || f.status === 'error');
        for (const f of ready) await processOne(f.id);
    }, [files, processOne]);

    const downloadOne = (id: string) => {
        const e = files.find(f => f.id === id);
        if (!e?.result) return;
        const r = e.result;
        if ('encryptedBlob' in r) downloadBlob(r.encryptedBlob, e.outputName.endsWith('.pdf') ? e.outputName : `${e.outputName}.pdf`);
        else downloadBlob(r.unlockedBlob, e.outputName.endsWith('.pdf') ? e.outputName : `${e.outputName}.pdf`);
    };

    const downloadAll = async () => {
        const done = files.filter(f => f.status === 'done' && f.result);
        if (!done.length) return;
        if (done.length === 1) { downloadOne(done[0].id); return; }
        const zip = new JSZip();
        for (const f of done) {
            const r = f.result!;
            const blob = 'encryptedBlob' in r ? r.encryptedBlob : (r as any).unlockedBlob;
            const name = f.outputName.endsWith('.pdf') ? f.outputName : `${f.outputName}.pdf`;
            zip.file(name, blob);
        }
        downloadBlob(await zip.generateAsync({ type: 'blob' }), 'OmniPDF_Protected.zip');
    };

    const removeFile = (id: string) => setFiles(p => p.filter(f => f.id !== id));
    const isProcessing = files.some(f => f.status === 'processing');
    const readyCount = files.filter(f => f.status === 'ready' || f.status === 'error').length;
    const doneCount = files.filter(f => f.status === 'done').length;

    const togglePerm = (key: keyof PermissionSettings) =>
        setPermissions(p => ({ ...p, [key]: !p[key] }));

    const PERM_ROWS: { key: keyof PermissionSettings; icon: React.ReactNode; label: string; sub?: string }[] = [
        { key: 'allowPrinting', icon: <Printer className="w-3.5 h-3.5" />, label: 'Printing', sub: 'Allow print to paper or PDF' },
        { key: 'allowHighResPrinting', icon: <Printer className="w-3.5 h-3.5" />, label: 'High-Res Print', sub: 'Allow full-quality printing' },
        { key: 'allowCopying', icon: <Copy className="w-3.5 h-3.5" />, label: 'Copy Text', sub: 'Allow text/image extraction' },
        { key: 'allowEditing', icon: <Pencil className="w-3.5 h-3.5" />, label: 'Edit Content', sub: 'Allow content modification' },
        { key: 'allowAnnotating', icon: <MessageSquare className="w-3.5 h-3.5" />, label: 'Annotating', sub: 'Add/edit comments & marks' },
        { key: 'allowFillingForms', icon: <FormInput className="w-3.5 h-3.5" />, label: 'Fill Forms', sub: 'Fill interactive form fields' },
        { key: 'allowAccessibility', icon: <Accessibility className="w-3.5 h-3.5" />, label: 'Accessibility', sub: 'Screen readers etc.' },
        { key: 'allowAssembly', icon: <BookOpen className="w-3.5 h-3.5" />, label: 'Assembly', sub: 'Insert/rotate/delete pages' },
    ];

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
                    <div className="p-2 bg-teal-100 dark:bg-teal-900/30 rounded-xl">
                        <Shield className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                    </div>
                    <div>
                        <h1 className="text-lg font-black dark:text-white tracking-tight">Protect & Unlock PDF</h1>
                        <p className="text-[11px] text-gray-400 font-medium">AES-256 encryption · Real PDF security standards</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {doneCount > 1 && (
                        <button onClick={downloadAll}
                            className="px-3 py-2 text-xs font-bold text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-xl flex items-center gap-1.5 transition-colors">
                            <Archive className="w-3.5 h-3.5" /> Download All ({doneCount})
                        </button>
                    )}
                    {readyCount > 1 && (
                        <button onClick={processAll} disabled={isProcessing}
                            className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-colors shadow-sm flex items-center gap-1.5">
                            {tab === 'protect' ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                            {tab === 'protect' ? `Protect All (${readyCount})` : `Unlock All (${readyCount})`}
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

            {/* Tab bar */}
            <div className="shrink-0 flex border-b border-gray-100 dark:border-white/5 bg-[#f3f1ea] dark:bg-[#262636] px-6">
                {([['protect', Lock, '🔒 Protect'], ['unlock', Unlock, '🔓 Unlock']] as [Tab, any, string][]).map(([t, Icon, label]) => (
                    <button key={t} onClick={() => { setTab(t); setFiles([]); }}
                        className={`flex items-center gap-2 px-4 py-3 text-xs font-black border-b-2 transition-all
              ${tab === t
                                ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                                : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                    </button>
                ))}
            </div>

            {/* Body */}
            <div className="flex-1 flex overflow-hidden">

                {/* LEFT */}
                <div className="flex-1 flex flex-col overflow-hidden p-4 lg:p-6 gap-4 min-w-0">
                    {/* Drop zone */}
                    <div ref={dropRef} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                        onClick={() => fileRef.current?.click()}
                        className={`shrink-0 flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl py-10 cursor-pointer transition-all duration-200
              ${isDragOver ? 'border-teal-500 bg-teal-500/5 scale-[0.99]' : 'border-gray-200 dark:border-white/10 bg-white dark:bg-[#262636]'}
              hover:border-teal-400 dark:hover:border-teal-500/50 hover:bg-teal-50/30 dark:hover:bg-teal-900/10`}>
                        <input ref={fileRef} type="file" accept={ACCEPT} multiple className="hidden"
                            onChange={e => e.target.files && addFiles(e.target.files)} />
                        <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                            className="p-4 bg-teal-100 dark:bg-teal-900/30 rounded-2xl shadow-lg shadow-teal-200 dark:shadow-teal-900/30">
                            {tab === 'protect'
                                ? <Lock className="w-7 h-7 text-teal-600 dark:text-teal-400" />
                                : <Unlock className="w-7 h-7 text-teal-600 dark:text-teal-400" />}
                        </motion.div>
                        <div className="text-center">
                            <p className="text-base font-black dark:text-white">
                                {tab === 'protect' ? 'Drop PDFs to protect' : 'Drop protected PDFs to unlock'}
                            </p>
                            <p className="text-sm text-gray-400 mt-0.5">
                                or <span className="text-teal-500 font-bold underline underline-offset-2">click to browse</span>
                            </p>
                        </div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 dark:text-gray-600">
                            PDF only · Max {PROTECT_MAX_MB} MB per file
                        </p>
                    </div>

                    {/* File list */}
                    <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pb-4">
                        <AnimatePresence mode="popLayout">
                            {files.length === 0 ? (
                                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                    className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
                                    <div className="p-5 bg-gray-100 dark:bg-white/5 rounded-2xl">
                                        {tab === 'protect'
                                            ? <ShieldCheck className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                                            : <ShieldAlert className="w-10 h-10 text-gray-300 dark:text-gray-600" />}
                                    </div>
                                    <p className="text-sm font-bold text-gray-400">No PDFs added</p>
                                    <p className="text-xs text-gray-300 dark:text-gray-600 max-w-xs leading-relaxed">
                                        {tab === 'protect'
                                            ? 'Upload PDFs to encrypt with AES-256. Set a password and choose what viewers are allowed to do.'
                                            : 'Upload a password-protected PDF and enter its password below to remove encryption.'}
                                    </p>
                                </motion.div>
                            ) : (
                                files.map(entry => (
                                    <FileCard key={entry.id} entry={entry} tab={tab}
                                        isRunning={isProcessing}
                                        onRemove={() => removeFile(entry.id)}
                                        onProcess={() => processOne(entry.id)}
                                        onDownload={() => downloadOne(entry.id)}
                                        onRename={n => updateFile(entry.id, { outputName: n })}
                                    />
                                ))
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* RIGHT: settings */}
                <div className="w-72 shrink-0 flex flex-col border-l border-gray-100 dark:border-white/5 bg-[#f3f1ea] dark:bg-[#262636] overflow-y-auto">

                    <AnimatePresence mode="wait">
                        {tab === 'protect' ? (
                            <motion.div key="protect" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                                className="flex flex-col flex-1">

                                {/* Password section */}
                                <div className="p-5 border-b border-gray-100 dark:border-white/5 space-y-4">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                                        <FileKey className="w-3 h-3" /> Passwords
                                    </p>

                                    {/* User password */}
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold dark:text-white">User Password <span className="text-red-500">*</span></label>
                                        <div className="relative">
                                            <input type={showUserPw ? 'text' : 'password'} value={userPassword}
                                                onChange={e => setUserPassword(e.target.value)}
                                                placeholder="Required to open PDF"
                                                className="w-full pr-9 pl-3 py-2.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-sm dark:text-white outline-none focus:ring-2 focus:ring-teal-400 font-mono" />
                                            <button onClick={() => setShowUserPw(v => !v)}
                                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                                {showUserPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                        <StrengthMeter score={pwScore} />
                                    </div>

                                    {/* Owner password */}
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold dark:text-white">
                                            Owner Password <span className="text-[10px] font-normal text-gray-400">(optional)</span>
                                        </label>
                                        <div className="relative">
                                            <input type={showOwnerPw ? 'text' : 'password'} value={ownerPassword}
                                                onChange={e => setOwnerPassword(e.target.value)}
                                                placeholder="Full access override"
                                                className="w-full pr-9 pl-3 py-2.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-sm dark:text-white outline-none focus:ring-2 focus:ring-teal-400 font-mono" />
                                            <button onClick={() => setShowOwnerPw(v => !v)}
                                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                                {showOwnerPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-gray-400">If set, this overrides all restrictions and allows full access.</p>
                                    </div>
                                </div>

                                {/* Encryption level */}
                                <div className="p-5 border-b border-gray-100 dark:border-white/5">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Encryption</p>
                                    <div className="space-y-1.5">
                                        {([['aes256', 'AES-256', 'Recommended · PDF 1.7ext3 · SHA-256 key', '🟢'], ['aes128', 'AES-128', 'Compatible · PDF 1.6 · 128-bit key', '🟡']] as [EncryptionLevel, string, string, string][]).map(([val, label, desc, icon]) => (
                                            <button key={val} onClick={() => setEncLevel(val)}
                                                className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl border-2 text-left transition-all
                          ${encLevel === val
                                                        ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30'
                                                        : 'border-gray-100 dark:border-white/10 hover:border-teal-200'}`}>
                                                <span className="text-base shrink-0 mt-0.5">{icon}</span>
                                                <div>
                                                    <p className="text-xs font-black dark:text-white">{label}</p>
                                                    <p className="text-[9px] text-gray-400">{desc}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Permissions */}
                                <div className="p-5 border-b border-gray-100 dark:border-white/5">
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Permissions</p>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => setPermissions(FULL_PERMISSIONS)}
                                                className="text-[9px] font-black text-teal-600 hover:text-teal-500 uppercase">Full</button>
                                            <span className="text-gray-300">·</span>
                                            <button onClick={() => setPermissions(READ_ONLY_PERMISSIONS)}
                                                className="text-[9px] font-black text-red-500 hover:text-red-400 uppercase">Read-only</button>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        {PERM_ROWS.map(row => (
                                            <PermRow key={row.key} icon={row.icon} label={row.label} sub={row.sub}
                                                enabled={permissions[row.key]} onToggle={() => togglePerm(row.key)} />
                                        ))}
                                    </div>
                                </div>

                                {/* Info section */}
                                <div className="border-b border-gray-100 dark:border-white/5">
                                    <button onClick={() => setInfoOpen(v => !v)}
                                        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                                        <span className="flex items-center gap-2 text-xs font-bold text-gray-600 dark:text-gray-300">
                                            <Info className="w-3.5 h-3.5" /> About PDF encryption
                                        </span>
                                        {infoOpen ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                                    </button>
                                    <AnimatePresence>
                                        {infoOpen && (
                                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                                <div className="px-5 pb-5 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed space-y-2">
                                                    <p><strong className="text-teal-600 dark:text-teal-400">AES-256</strong> uses a 256-bit key derived with SHA-256 (PDF 2.0 / 1.7ext3). Supported by Adobe Reader X+, MacOS Preview, Chrome.</p>
                                                    <p><strong className="text-yellow-600 dark:text-yellow-400">AES-128</strong> uses a 128-bit key (PDF 1.6/1.7). Oldest compatible format — works in all modern viewers.</p>
                                                    <p><strong className="text-gray-600 dark:text-gray-300">Permissions</strong> are enforced by compliant PDF viewers. They can be bypassed by non-standard software.</p>
                                                    <div className="flex items-start gap-2 p-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-500/20 rounded-xl mt-2">
                                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                                                        <p className="text-[10px] text-emerald-700 dark:text-emerald-300">
                                                            <strong>Passwords are never stored.</strong> Processing is 100% in your browser.
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
                                    <div className="flex items-center gap-3 p-3 bg-teal-50 dark:bg-teal-900/20 rounded-xl">
                                        <div className="w-8 h-8 shrink-0 rounded-lg bg-teal-600 flex items-center justify-center">
                                            <ShieldCheck className="w-4 h-4 text-white" />
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-black text-teal-700 dark:text-teal-300">Standards Compliant</p>
                                            <p className="text-[9px] text-teal-500 leading-tight">ISO 32000-2 · PDF 1.6/1.7/1.7ext3</p>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ) : (
                            // UNLOCK TAB
                            <motion.div key="unlock" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                                className="flex flex-col flex-1">
                                <div className="p-5 border-b border-gray-100 dark:border-white/5 space-y-4">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                                        <Unlock className="w-3 h-3" /> PDF Password
                                    </p>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold dark:text-white">PDF Password <span className="text-red-500">*</span></label>
                                        <div className="relative">
                                            <input type={showUnlockPw ? 'text' : 'password'} value={unlockPassword}
                                                onChange={e => setUnlockPassword(e.target.value)}
                                                placeholder="Enter PDF password"
                                                className="w-full pr-9 pl-3 py-2.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-sm dark:text-white outline-none focus:ring-2 focus:ring-teal-400 font-mono" />
                                            <button onClick={() => setShowUnlockPw(v => !v)}
                                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                                {showUnlockPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-gray-400 leading-relaxed">
                                            Enter the user or owner password of the protected PDF. Wrong password attempts are rate-limited to prevent brute force.
                                        </p>
                                    </div>
                                </div>

                                <div className="p-5 space-y-3">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">How it works</p>
                                    {[
                                        { n: '1', t: 'PDF is opened with your password via pdfjs — we never brute-force.' },
                                        { n: '2', t: 'Each page is re-rendered to a high-quality canvas image.' },
                                        { n: '3', t: 'A new, clean PDF with no encryption is assembled and downloaded.' },
                                        { n: '4', t: 'After 5 failed attempts, unlock is blocked for 5 minutes.' },
                                    ].map(s => (
                                        <div key={s.n} className="flex items-start gap-2">
                                            <span className="w-4 h-4 rounded-full bg-teal-500 text-white text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">{s.n}</span>
                                            <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">{s.t}</p>
                                        </div>
                                    ))}
                                    <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-500/20 rounded-xl mt-3">
                                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                                        <p className="text-[10px] text-amber-700 dark:text-amber-300">
                                            Unlock output is an image-based PDF — text may not be selectable. Use OCR module to restore text.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex-1" />

                                <div className="p-5 border-t border-gray-100 dark:border-white/5">
                                    <div className="flex items-center gap-3 p-3 bg-teal-50 dark:bg-teal-900/20 rounded-xl">
                                        <div className="w-8 h-8 shrink-0 rounded-lg bg-teal-600 flex items-center justify-center">
                                            <Unlock className="w-4 h-4 text-white" />
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-black text-teal-700 dark:text-teal-300">Rate Limited</p>
                                            <p className="text-[9px] text-teal-500 leading-tight">5 attempts / 5 min · No brute force</p>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};
