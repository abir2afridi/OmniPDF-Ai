/**
 * SignPDF.tsx — Sign PDF Module
 *
 * Three modes:
 *  🖊  Visual   — Draw / Upload image / Type styled signature → drag-to-place on page
 *  🔐  Digital  — PKCS#12 certificate-based RSA-SHA256 signing
 *  🔍  Verify   — Detect & validate embedded digital signature
 *
 * Violet brand color (distinct from all other modules).
 */

import React, {
    useState, useRef, useCallback, useEffect, useLayoutEffect,
} from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    PenLine, ShieldCheck, Search, ArrowLeft, Upload, X, Download,
    Loader2, CheckCircle2, AlertCircle, Trash2, RotateCcw, Eye, EyeOff,
    Info, ChevronLeft, ChevronRight, FileKey, ZoomIn, ZoomOut,
    Pen, Image, Type, Lock, Calendar, AlignLeft, BadgeCheck,
    XCircle, FileWarning,
} from 'lucide-react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import {
    visualSignPdf, digitalSignPdf, verifyPdfSignature, parseP12,
    generateTypedSignatureDataUrl, validateSignFile, fmtSize,
    type VisualSignOptions, type DigitalSignOptions, type CertificateInfo,
    type VerifyResult, type SignaturePlacement, type DigitalSignResult,
    type P12Parsed,
} from '../services/signService';
import { downloadBlob } from '../services/pdfService';

if (GlobalWorkerOptions) {
    GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Mode = 'visual' | 'digital' | 'verify';
type SigSource = 'draw' | 'upload' | 'type';
interface Toast { id: string; type: 'success' | 'error' | 'info' | 'warn'; msg: string; }
interface Props { onBack?: () => void; }

const uid = () => Math.random().toString(36).slice(2, 10);
const RENDER_SCALE_INIT = 1.2;

// ── Toast helper ──────────────────────────────────────────────────────────────

const ToastItem = ({ t, onDismiss }: { t: Toast; onDismiss: () => void }) => (
    <motion.div layout initial={{ opacity: 0, x: 60, scale: 0.9 }}
        animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 60 }}
        className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-xl max-w-sm text-sm font-medium border backdrop-blur-md pointer-events-auto
      ${t.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/60 border-emerald-300 text-emerald-800 dark:text-emerald-200'
                : t.type === 'error' ? 'bg-red-50 dark:bg-red-900/60 border-red-300 text-red-800 dark:text-red-200'
                    : t.type === 'warn' ? 'bg-amber-50 dark:bg-amber-900/60 border-amber-300 text-amber-800 dark:text-amber-200'
                        : 'bg-violet-50 dark:bg-violet-900/60 border-violet-300 text-violet-800 dark:text-violet-200'}`}>
        {t.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            : t.type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                : <Info className="w-4 h-4 shrink-0 mt-0.5" />}
        <span className="flex-1 leading-snug">{t.msg}</span>
        <button onClick={onDismiss}><X className="w-3 h-3 opacity-50 hover:opacity-100" /></button>
    </motion.div>
);

// ── Main Component ────────────────────────────────────────────────────────────

export const SignPDF: React.FC<Props> = ({ onBack }) => {
    // ── Top-level mode ───────────────────────────────────────────────────────
    const [mode, setMode] = useState<Mode>('visual');

    // ── Shared PDF state ─────────────────────────────────────────────────────
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [pdfObj, setPdfObj] = useState<any>(null);       // pdfjs doc
    const [totalPages, setTotalPages] = useState(1);
    const [curPage, setCurPage] = useState(1);
    const [renderScale, setRenderScale] = useState(RENDER_SCALE_INIT);
    const [isRenderingPdf, setIsRenderingPdf] = useState(false);

    // ── Canvas refs ──────────────────────────────────────────────────────────
    const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
    const drawCanvasRef = useRef<HTMLCanvasElement>(null);
    const pdfContainerRef = useRef<HTMLDivElement>(null);

    // ── Visual sign state ────────────────────────────────────────────────────
    const [sigSource, setSigSource] = useState<SigSource>('draw');
    const [sigDataUrl, setSigDataUrl] = useState<string>('');
    const [typedText, setTypedText] = useState('');
    const [typedColor, setTypedColor] = useState('#1e3a5f');
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasStrokes, setHasStrokes] = useState(false);
    const [addDate, setAddDate] = useState(true);
    const [customText, setCustomText] = useState('');
    const [lockAfter, setLockAfter] = useState(false);
    const [outputName, setOutputName] = useState('');
    const [progress, setProgress] = useState(0);
    const [isSigning, setIsSigning] = useState(false);
    const [signedBlob, setSignedBlob] = useState<Blob | null>(null);

    // Signature placement overlay state (in canvas pixels)
    const [sigPos, setSigPos] = useState({ x: 40, y: 40 });
    const [sigSize, setSigSize] = useState({ w: 200, h: 80 });
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const dragOrig = useRef({ mx: 0, my: 0, px: 0, py: 0 });
    const resizeOrig = useRef({ mx: 0, my: 0, pw: 0, ph: 0 });

    // ── Digital sign state ───────────────────────────────────────────────────
    const [p12File, setP12File] = useState<File | null>(null);
    const [p12Pass, setP12Pass] = useState('');
    const [showP12Pass, setShowP12Pass] = useState(false);
    const [certInfo, setCertInfo] = useState<CertificateInfo | null>(null);
    const [certError, setCertError] = useState('');
    const [digResult, setDigResult] = useState<DigitalSignResult | null>(null);
    const [showDigPlacement, setShowDigPlacement] = useState(true);

    // ── Verify state ─────────────────────────────────────────────────────────
    const [verifyFile, setVerifyFile] = useState<File | null>(null);
    const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);

    // ── Toasts ───────────────────────────────────────────────────────────────
    const [toasts, setToasts] = useState<Toast[]>([]);
    const toast = useCallback((type: Toast['type'], msg: string) => {
        const id = uid();
        setToasts(p => [...p.slice(-4), { id, type, msg }]);
        setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 7000);
    }, []);

    // ── PDF loading & rendering ───────────────────────────────────────────────

    const loadPdf = useCallback(async (file: File) => {
        setPdfFile(file); setSignedBlob(null); setProgress(0);
        setOutputName(file.name.replace(/\.pdf$/i, ''));
        setSigPos({ x: 40, y: 40 }); setSigSize({ w: 200, h: 80 });
        try {
            const buf = await file.arrayBuffer();
            const doc = await getDocument({ data: buf }).promise;
            setPdfObj(doc);
            setTotalPages(doc.numPages);
            setCurPage(1);
        } catch {
            toast('error', `Could not open "${file.name}" — it may be encrypted or corrupted.`);
            setPdfFile(null);
        }
    }, [toast]);

    const renderPage = useCallback(async () => {
        if (!pdfObj || !pdfCanvasRef.current) return;
        setIsRenderingPdf(true);
        try {
            const page = await pdfObj.getPage(curPage);
            const vp = page.getViewport({ scale: renderScale });
            const c = pdfCanvasRef.current;
            c.width = vp.width;
            c.height = vp.height;
            const ctx = c.getContext('2d')!;
            await page.render({ canvasContext: ctx, viewport: vp }).promise;
        } finally {
            setIsRenderingPdf(false);
        }
    }, [pdfObj, curPage, renderScale]);

    useEffect(() => { renderPage(); }, [renderPage]);

    // ── Drawing canvas ───────────────────────────────────────────────────────

    useLayoutEffect(() => {
        const c = drawCanvasRef.current;
        if (!c) return;
        const ctx = c.getContext('2d')!;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#1e3a5f';
    }, [sigSource]);

    const getPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        const c = drawCanvasRef.current!;
        const r = c.getBoundingClientRect();
        const src = 'touches' in e ? e.touches[0] : e as any;
        return { x: src.clientX - r.left, y: src.clientY - r.top };
    };

    const onDrawStart = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const ctx = drawCanvasRef.current!.getContext('2d')!;
        const p = getPos(e);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        setIsDrawing(true);
    };
    const onDrawMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        e.preventDefault();
        const ctx = drawCanvasRef.current!.getContext('2d')!;
        const p = getPos(e);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        setHasStrokes(true);
    };
    const onDrawEnd = () => {
        setIsDrawing(false);
        if (hasStrokes || drawCanvasRef.current) captureDrawing();
    };

    const captureDrawing = () => {
        const c = drawCanvasRef.current;
        if (!c) return;
        setSigDataUrl(c.toDataURL('image/png'));
    };

    const clearDrawing = () => {
        const c = drawCanvasRef.current;
        if (!c) return;
        const ctx = c.getContext('2d')!;
        ctx.clearRect(0, 0, c.width, c.height);
        setSigDataUrl('');
        setHasStrokes(false);
    };

    // ── Signature overlay drag & resize ─────────────────────────────────────

    const onSigPointerDown = (e: React.PointerEvent) => {
        e.stopPropagation();
        dragOrig.current = { mx: e.clientX, my: e.clientY, px: sigPos.x, py: sigPos.y };
        setIsDragging(true);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };
    const onSigPointerMove = (e: React.PointerEvent) => {
        if (!isDragging) return;
        const dx = e.clientX - dragOrig.current.mx;
        const dy = e.clientY - dragOrig.current.my;
        setSigPos({ x: dragOrig.current.px + dx, y: dragOrig.current.py + dy });
    };
    const onSigPointerUp = () => { setIsDragging(false); };

    const onResizePointerDown = (e: React.PointerEvent) => {
        e.stopPropagation();
        resizeOrig.current = { mx: e.clientX, my: e.clientY, pw: sigSize.w, ph: sigSize.h };
        setIsResizing(true);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };
    const onResizePointerMove = (e: React.PointerEvent) => {
        if (!isResizing) return;
        const dw = e.clientX - resizeOrig.current.mx;
        const dh = e.clientY - resizeOrig.current.my;
        setSigSize({ w: Math.max(60, resizeOrig.current.pw + dw), h: Math.max(30, resizeOrig.current.ph + dh) });
    };
    const onResizePointerUp = () => { setIsResizing(false); };

    // Compute PDF-coordinate placement from canvas pixels
    const getSignaturePlacement = async (): Promise<SignaturePlacement> => {
        const page = await pdfObj!.getPage(curPage);
        const vp = page.getViewport({ scale: 1 }); // 1pt = 1unit
        const pdfW = vp.width;
        const pdfH = vp.height;

        const canvasW = pdfCanvasRef.current!.width;
        const canvasH = pdfCanvasRef.current!.height;

        const pdfX = (sigPos.x / canvasW) * pdfW;
        const pdfY = pdfH - ((sigPos.y + sigSize.h) / canvasH) * pdfH;
        const pdfW_sig = (sigSize.w / canvasW) * pdfW;
        const pdfH_sig = (sigSize.h / canvasH) * pdfH;

        return {
            page: curPage,
            x: Math.max(0, pdfX),
            y: Math.max(0, pdfY),
            width: pdfW_sig,
            height: pdfH_sig,
        };
    };

    // ── Visual sign ──────────────────────────────────────────────────────────

    const handleVisualSign = async () => {
        if (!pdfFile) { toast('error', 'Upload a PDF first.'); return; }
        if (!sigDataUrl) { toast('error', 'Create a signature first (draw, upload, or type).'); return; }

        setIsSigning(true); setProgress(0); setSignedBlob(null);
        try {
            const placement = await getSignaturePlacement();
            const blob = await visualSignPdf(pdfFile, {
                signatureDataUrl: sigDataUrl,
                placement, addDate, customText,
                lockAfterSigning: lockAfter,
                outputName,
                onProgress: setProgress,
            });
            setSignedBlob(blob);
            toast('success', '✅ PDF signed successfully! Click Download to save.');
        } catch (e: any) {
            toast('error', e?.message ?? 'Signing failed.');
        } finally {
            setIsSigning(false);
        }
    };

    // ── Digital sign ─────────────────────────────────────────────────────────

    const parseP12File = async () => {
        if (!p12File || !p12Pass) { toast('warn', 'Upload a .p12 file and enter the password.'); return; }
        setCertError(''); setCertInfo(null);
        try {
            const buf = await p12File.arrayBuffer();
            const parsed = parseP12(buf, p12Pass);
            setCertInfo(parsed.certInfo);
            toast('info', `✅ Certificate loaded: ${parsed.certInfo.subject}`);
        } catch (e: any) {
            setCertError(e?.message ?? 'Failed to parse certificate.');
        }
    };

    const handleDigitalSign = async () => {
        if (!pdfFile) { toast('error', 'Upload a PDF first.'); return; }
        if (!p12File) { toast('error', 'Upload a .p12/.pfx certificate.'); return; }
        if (!certInfo) { toast('error', 'Parse the certificate first.'); return; }

        setIsSigning(true); setProgress(0); setDigResult(null);
        try {
            const buf = await p12File.arrayBuffer();
            const placement = showDigPlacement ? await getSignaturePlacement() : undefined;
            const result = await digitalSignPdf(pdfFile, {
                p12Bytes: buf,
                p12Password: p12Pass,
                placement,
                addDate, customText,
                lockAfterSigning: lockAfter,
                outputName,
                onProgress: setProgress,
            });
            setDigResult(result);
            toast('success', '🔐 Digitally signed with RSA-SHA256!');
        } catch (e: any) {
            toast('error', e?.message ?? 'Digital signing failed.');
        } finally {
            setIsSigning(false);
        }
    };

    // ── Verify ───────────────────────────────────────────────────────────────

    const handleVerify = async () => {
        if (!verifyFile) { toast('error', 'Upload a PDF to verify.'); return; }
        setIsVerifying(true); setVerifyResult(null);
        try {
            const result = await verifyPdfSignature(verifyFile);
            setVerifyResult(result);
        } catch (e: any) {
            toast('error', e?.message ?? 'Verification error.');
        } finally {
            setIsVerifying(false);
        }
    };

    // ── Typed sig generation ─────────────────────────────────────────────────

    const generateTyped = async () => {
        if (!typedText.trim()) { toast('warn', 'Enter your name first.'); return; }
        try {
            const url = await generateTypedSignatureDataUrl(typedText, typedColor);
            setSigDataUrl(url);
            toast('info', 'Signature generated.');
        } catch (e: any) {
            toast('error', e?.message ?? 'Could not generate typed signature.');
        }
    };

    // ── File upload tools ─────────────────────────────────────────────────────

    const pdfDropRef = useRef<HTMLDivElement>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const onPdfDrop = (e: React.DragEvent) => {
        e.preventDefault(); setIsDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) { const err = validateSignFile(file); if (err) toast('error', err); else loadPdf(file); }
    };

    const currentActiveBlob = digResult?.blob ?? signedBlob;
    const currentOutputName = digResult
        ? digResult.outputName
        : `${outputName || 'signed'}.pdf`;

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="flex-1 flex flex-col h-full bg-[#f3f1ea] dark:bg-[#1e1e2e] overflow-hidden relative">

            {/* Toasts */}
            <div className="fixed top-6 right-6 z-[200] flex flex-col gap-2 items-end pointer-events-none">
                <AnimatePresence>
                    {toasts.map(t => (
                        <div key={t.id} className="pointer-events-auto">
                            <ToastItem t={t} onDismiss={() => setToasts(p => p.filter(x => x.id !== t.id))} />
                        </div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-6 py-4 bg-[#f3f1ea] dark:bg-[#262636] border-b border-gray-100 dark:border-white/5 shadow-sm">
                <div className="flex items-center gap-3">
                    {onBack && (
                        <button onClick={onBack} className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl text-gray-500">
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}
                    <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-xl">
                        <PenLine className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div>
                        <h1 className="text-lg font-black dark:text-white tracking-tight">Sign PDF</h1>
                        <p className="text-[11px] text-gray-400 font-medium">Visual signatures · RSA-SHA256 digital certificates · Verification</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {currentActiveBlob && (
                        <button onClick={() => downloadBlob(currentActiveBlob, currentOutputName)}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl flex items-center gap-2 shadow-sm">
                            <Download className="w-3.5 h-3.5" /> Download
                        </button>
                    )}
                </div>
            </div>

            {/* Tab bar */}
            <div className="shrink-0 flex border-b border-gray-100 dark:border-white/5 bg-[#f3f1ea] dark:bg-[#262636] px-6">
                {([
                    ['visual', PenLine, '🖊 Visual Sign'],
                    ['digital', ShieldCheck, '🔐 Digital Sign'],
                    ['verify', Search, '🔍 Verify'],
                ] as [Mode, any, string][]).map(([m, Icon, label]) => (
                    <button key={m} onClick={() => { setMode(m); setSignedBlob(null); setDigResult(null); setVerifyResult(null); }}
                        className={`flex items-center gap-2 px-4 py-3 text-xs font-black border-b-2 transition-all
              ${mode === m
                                ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                                : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                    </button>
                ))}
            </div>

            {/* Body */}
            <div className="flex-1 flex overflow-hidden">

                {/* ── LEFT: Settings panel ── */}
                <div className="w-72 shrink-0 flex flex-col border-r border-gray-100 dark:border-white/5 bg-[#f3f1ea] dark:bg-[#262636] overflow-y-auto">
                    <AnimatePresence mode="wait">

                        {/* VISUAL settings */}
                        {mode === 'visual' && (
                            <motion.div key="vis" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                                className="flex flex-col flex-1">

                                {/* Signature source tabs */}
                                <div className="p-4 border-b border-gray-100 dark:border-white/5">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Signature</p>
                                    <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-white/10">
                                        {([['draw', Pen, 'Draw'], ['upload', Image, 'Upload'], ['type', Type, 'Type']] as [SigSource, any, string][]).map(([s, Icon, lbl]) => (
                                            <button key={s} onClick={() => { setSigSource(s); setSigDataUrl(''); }}
                                                className={`flex-1 flex flex-col items-center gap-1 py-2 text-[10px] font-black transition-colors
                          ${sigSource === s ? 'bg-violet-600 text-white' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5'}`}>
                                                <Icon className="w-3.5 h-3.5" />
                                                {lbl}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* DRAW */}
                                {sigSource === 'draw' && (
                                    <div className="p-4 border-b border-gray-100 dark:border-white/5 space-y-2">
                                        <div className="relative bg-white border-2 border-dashed border-gray-300 dark:border-white/20 rounded-xl overflow-hidden">
                                            <canvas ref={drawCanvasRef} width={230} height={100}
                                                className="w-full cursor-crosshair touch-none"
                                                onMouseDown={onDrawStart} onMouseMove={onDrawMove} onMouseUp={onDrawEnd} onMouseLeave={onDrawEnd} />
                                            {!hasStrokes && (
                                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                    <p className="text-[11px] text-gray-300 italic">Draw your signature here</p>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={clearDrawing}
                                                className="flex-1 py-1.5 text-[11px] font-bold text-gray-500 bg-gray-50 dark:bg-white/5 hover:bg-gray-100 rounded-lg transition-colors flex items-center justify-center gap-1">
                                                <RotateCcw className="w-3 h-3" /> Clear
                                            </button>
                                            {hasStrokes && (
                                                <button onClick={captureDrawing}
                                                    className="flex-1 py-1.5 text-[11px] font-bold text-violet-600 bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 rounded-lg transition-colors">
                                                    ✓ Use this
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* UPLOAD */}
                                {sigSource === 'upload' && (
                                    <div className="p-4 border-b border-gray-100 dark:border-white/5">
                                        <label className="flex flex-col items-center gap-2 p-5 border-2 border-dashed border-gray-200 dark:border-white/10 rounded-xl cursor-pointer hover:border-violet-400 transition-colors">
                                            <Upload className="w-6 h-6 text-gray-300" />
                                            <span className="text-xs text-gray-400">Upload PNG / JPG signature</span>
                                            <input type="file" className="hidden" accept="image/png,image/jpeg,image/gif"
                                                onChange={e => {
                                                    const f = e.target.files?.[0];
                                                    if (!f) return;
                                                    const r = new FileReader();
                                                    r.onload = () => setSigDataUrl(r.result as string);
                                                    r.readAsDataURL(f);
                                                }} />
                                        </label>
                                        {sigDataUrl && (
                                            <div className="mt-2 p-2 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10">
                                                <img src={sigDataUrl} alt="sig" className="max-h-16 mx-auto object-contain" />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* TYPE */}
                                {sigSource === 'type' && (
                                    <div className="p-4 border-b border-gray-100 dark:border-white/5 space-y-3">
                                        <input value={typedText} onChange={e => setTypedText(e.target.value)}
                                            placeholder="Your full name"
                                            className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl outline-none focus:ring-2 focus:ring-violet-400 dark:text-white" />
                                        <div className="flex items-center gap-2">
                                            <label className="text-xs text-gray-500 shrink-0">Color</label>
                                            <input type="color" value={typedColor} onChange={e => setTypedColor(e.target.value)}
                                                className="w-8 h-8 rounded border border-gray-200 cursor-pointer" />
                                        </div>
                                        <button onClick={generateTyped}
                                            className="w-full py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl transition-colors">
                                            Generate Signature
                                        </button>
                                        {sigDataUrl && (
                                            <div className="p-2 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl">
                                                <img src={sigDataUrl} alt="typed sig" className="max-h-14 mx-auto object-contain" />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Sign options */}
                                <div className="p-4 border-b border-gray-100 dark:border-white/5 space-y-3">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Options</p>

                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={addDate} onChange={e => setAddDate(e.target.checked)} className="accent-violet-600 w-4 h-4" />
                                        <Calendar className="w-3.5 h-3.5 text-gray-500" />
                                        <span className="text-xs font-bold dark:text-white">Add signing date</span>
                                    </label>

                                    <div className="space-y-1">
                                        <label className="flex items-center gap-2 text-xs text-gray-500">
                                            <AlignLeft className="w-3.5 h-3.5" /> Custom label
                                        </label>
                                        <input value={customText} onChange={e => setCustomText(e.target.value)}
                                            placeholder="e.g. Approved by · CFO"
                                            className="w-full px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg outline-none focus:ring-1 focus:ring-violet-400 dark:text-white" />
                                    </div>

                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={lockAfter} onChange={e => setLockAfter(e.target.checked)} className="accent-violet-600 w-4 h-4" />
                                        <Lock className="w-3.5 h-3.5 text-amber-500" />
                                        <span className="text-xs font-bold dark:text-white">Lock after signing</span>
                                    </label>
                                </div>

                                <div className="p-4 space-y-2">
                                    <label className="text-xs font-bold dark:text-white">Output filename</label>
                                    <input value={outputName} onChange={e => setOutputName(e.target.value)}
                                        placeholder="my_document_signed"
                                        className="w-full px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg outline-none focus:ring-1 focus:ring-violet-400 font-mono dark:text-white" />
                                </div>

                                <div className="flex-1" />

                                <div className="p-4">
                                    <button onClick={handleVisualSign} disabled={isSigning || !pdfFile || !sigDataUrl}
                                        className="w-full py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-black rounded-xl flex items-center justify-center gap-2 shadow-md transition-all">
                                        {isSigning
                                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing… {progress}%</>
                                            : <><PenLine className="w-4 h-4" /> Sign PDF</>}
                                    </button>
                                    {isSigning && (
                                        <div className="mt-2 h-1.5 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden">
                                            <motion.div className="h-full bg-violet-500" animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}

                        {/* DIGITAL settings */}
                        {mode === 'digital' && (
                            <motion.div key="dig" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                                className="flex flex-col flex-1">

                                <div className="p-4 border-b border-gray-100 dark:border-white/5 space-y-3">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                                        <FileKey className="w-3 h-3" /> Certificate (.p12 / .pfx)
                                    </p>
                                    <label className={`flex items-center gap-2 p-3 border-2 rounded-xl cursor-pointer transition-colors 
                    ${p12File ? 'border-violet-400 bg-violet-50 dark:bg-violet-900/20' : 'border-dashed border-gray-200 dark:border-white/10 hover:border-violet-300'}`}>
                                        <FileKey className="w-4 h-4 text-violet-500 shrink-0" />
                                        <span className="text-xs font-bold text-gray-600 dark:text-gray-300 truncate">
                                            {p12File ? p12File.name : 'Upload .p12 or .pfx file'}
                                        </span>
                                        <input type="file" className="hidden" accept=".p12,.pfx"
                                            onChange={e => { const f = e.target.files?.[0]; if (f) { setP12File(f); setCertInfo(null); setCertError(''); } }} />
                                    </label>

                                    {/* Password */}
                                    <div className="relative">
                                        <input type={showP12Pass ? 'text' : 'password'} value={p12Pass}
                                            onChange={e => setP12Pass(e.target.value)}
                                            placeholder="Certificate password"
                                            className="w-full pr-9 px-3 py-2 text-sm bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl outline-none focus:ring-2 focus:ring-violet-400 font-mono dark:text-white" />
                                        <button onClick={() => setShowP12Pass(v => !v)}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                                            {showP12Pass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>

                                    <button onClick={parseP12File} disabled={!p12File || !p12Pass}
                                        className="w-full py-2 bg-violet-100 dark:bg-violet-900/30 hover:bg-violet-200 dark:hover:bg-violet-900/50 text-violet-700 dark:text-violet-300 text-xs font-black rounded-xl transition-colors disabled:opacity-40">
                                        Load Certificate
                                    </button>

                                    {certError && <p className="text-[11px] text-red-500 leading-tight">{certError}</p>}
                                </div>

                                {/* Cert info */}
                                {certInfo && (
                                    <div className="p-4 border-b border-gray-100 dark:border-white/5">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-2 flex items-center gap-1">
                                            <BadgeCheck className="w-3 h-3" /> Certificate Loaded
                                        </p>
                                        {[
                                            ['Subject', certInfo.subject],
                                            ['Issuer', certInfo.issuer],
                                            ['Valid', new Date(certInfo.validFrom).toLocaleDateString()],
                                            ['Expires', new Date(certInfo.validTo).toLocaleDateString()],
                                        ].map(([k, v]) => (
                                            <div key={k} className="flex justify-between text-[10px] py-0.5 border-b border-gray-50 dark:border-white/5">
                                                <span className="font-bold text-gray-400">{k}</span>
                                                <span className="text-gray-600 dark:text-gray-300 font-mono text-right max-w-[140px] truncate">{v}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Options */}
                                <div className="p-4 border-b border-gray-100 dark:border-white/5 space-y-2">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Options</p>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={showDigPlacement} onChange={e => setShowDigPlacement(e.target.checked)} className="accent-violet-600 w-4 h-4" />
                                        <span className="text-xs font-bold dark:text-white">Show visual signature block on PDF</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={addDate} onChange={e => setAddDate(e.target.checked)} className="accent-violet-600 w-4 h-4" />
                                        <Calendar className="w-3.5 h-3.5 text-gray-500" />
                                        <span className="text-xs font-bold dark:text-white">Add date</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={lockAfter} onChange={e => setLockAfter(e.target.checked)} className="accent-violet-600 w-4 h-4" />
                                        <Lock className="w-3.5 h-3.5 text-amber-500" />
                                        <span className="text-xs font-bold dark:text-white">Lock after signing</span>
                                    </label>
                                </div>

                                {/* Digital result */}
                                {digResult && (
                                    <div className="p-4 border-b border-gray-100 dark:border-white/5 bg-emerald-50 dark:bg-emerald-900/20">
                                        <p className="text-[10px] font-black text-emerald-700 dark:text-emerald-300 mb-1">🔐 Signed Successfully</p>
                                        <p className="text-[10px] text-gray-500">RSA-SHA256 · {new Date(digResult.timestamp).toLocaleString()}</p>
                                    </div>
                                )}

                                <div className="flex-1" />

                                <div className="p-4">
                                    <button onClick={handleDigitalSign} disabled={isSigning || !pdfFile || !certInfo}
                                        className="w-full py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-black rounded-xl flex items-center justify-center gap-2 shadow-md transition-all">
                                        {isSigning
                                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing… {progress}%</>
                                            : <><ShieldCheck className="w-4 h-4" /> Apply Digital Signature</>}
                                    </button>
                                    {isSigning && (
                                        <div className="mt-2 h-1.5 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden">
                                            <motion.div className="h-full bg-violet-500" animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
                                        </div>
                                    )}
                                    <div className="mt-3 p-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-500/20 rounded-xl">
                                        <p className="text-[9px] text-amber-700 dark:text-amber-300 leading-tight">
                                            <strong>Note:</strong> This uses application-level RSA-SHA256 signing verifiable within OmniPDF. For ISO 32000 byte-range PDF signatures, server-side infrastructure is required.
                                        </p>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* VERIFY settings */}
                        {mode === 'verify' && (
                            <motion.div key="ver" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                                className="flex flex-col flex-1 p-4 gap-4">
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Upload PDF to Verify</p>

                                <label className={`flex flex-col items-center gap-3 py-8 border-2 border-dashed rounded-2xl cursor-pointer transition-colors
                  ${verifyFile ? 'border-violet-400 bg-violet-50 dark:bg-violet-900/20' : 'border-gray-200 dark:border-white/10 hover:border-violet-300'}`}>
                                    <Search className="w-7 h-7 text-gray-300" />
                                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400 text-center">
                                        {verifyFile ? verifyFile.name : 'Click to upload a signed PDF'}
                                    </span>
                                    <input type="file" className="hidden" accept=".pdf"
                                        onChange={e => { const f = e.target.files?.[0]; if (f) { setVerifyFile(f); setVerifyResult(null); } }} />
                                </label>

                                <button onClick={handleVerify} disabled={!verifyFile || isVerifying}
                                    className="w-full py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-black rounded-xl flex items-center justify-center gap-2 transition-all">
                                    {isVerifying ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</> : <><Search className="w-4 h-4" /> Verify Signature</>}
                                </button>

                                {/* Verify result */}
                                {verifyResult && (
                                    <AnimatePresence>
                                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                            className={`p-4 rounded-2xl border ${!verifyResult.hasCryptographicSignature
                                                ? 'bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10'
                                                : verifyResult.isValid
                                                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-500/30'
                                                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-500/30'}`}>

                                            <div className="flex items-center gap-2 mb-3">
                                                {!verifyResult.hasCryptographicSignature
                                                    ? <FileWarning className="w-5 h-5 text-gray-400" />
                                                    : verifyResult.isValid
                                                        ? <BadgeCheck className="w-5 h-5 text-emerald-600" />
                                                        : <XCircle className="w-5 h-5 text-red-500" />}
                                                <p className={`text-sm font-black ${!verifyResult.hasCryptographicSignature ? 'text-gray-500 dark:text-gray-400'
                                                    : verifyResult.isValid ? 'text-emerald-700 dark:text-emerald-300'
                                                        : 'text-red-600 dark:text-red-400'}`}>
                                                    {!verifyResult.hasCryptographicSignature
                                                        ? 'No Signature Found'
                                                        : verifyResult.isValid
                                                            ? '✅ Valid Signature'
                                                            : '❌ Invalid / Tampered'}
                                                </p>
                                            </div>

                                            {verifyResult.error && !verifyResult.hasCryptographicSignature && (
                                                <p className="text-[11px] text-gray-500 leading-tight">{verifyResult.error}</p>
                                            )}

                                            {verifyResult.certInfo && (
                                                <div className="space-y-1.5">
                                                    {[
                                                        ['Signer', verifyResult.signer],
                                                        ['Issuer', verifyResult.certInfo.issuer],
                                                        ['Signed At', verifyResult.signedAt ? new Date(verifyResult.signedAt).toLocaleString() : '—'],
                                                        ['Algorithm', verifyResult.algorithm],
                                                        ['Integrity', verifyResult.documentIntegrity],
                                                    ].map(([k, v]) => (
                                                        <div key={k as string} className="flex justify-between text-[10px]">
                                                            <span className="font-bold text-gray-500">{k as string}</span>
                                                            <span className={`font-mono text-right max-w-[150px] truncate ${k === 'Integrity' && v === 'intact' ? 'text-emerald-600 font-black'
                                                                : k === 'Integrity' && v === 'tampered' ? 'text-red-500 font-black'
                                                                    : 'text-gray-700 dark:text-gray-300'}`}>{v as string}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </motion.div>
                                    </AnimatePresence>
                                )}

                                <div className="p-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-500/20 rounded-xl mt-auto">
                                    <p className="text-[10px] text-violet-700 dark:text-violet-300 leading-relaxed">
                                        Verifies OmniPDF RSA-SHA256 signatures. Detects: signer identity, signing date, document integrity, certificate validity.
                                    </p>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* ── RIGHT: PDF Preview + Signature Overlay ── */}
                <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-gray-100 dark:bg-[#16161f]">

                    {/* PDF controls */}
                    {mode !== 'verify' && (
                        <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-[#262636] border-b border-gray-100 dark:border-white/5">
                            <label className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 border-dashed cursor-pointer text-xs font-bold transition-colors
                ${pdfFile ? 'border-violet-400 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300' : 'border-gray-200 dark:border-white/10 text-gray-500 hover:border-violet-300'}`}>
                                <Upload className="w-3.5 h-3.5" />
                                {pdfFile ? pdfFile.name.slice(0, 28) + (pdfFile.name.length > 28 ? '…' : '') : 'Upload PDF'}
                                <input type="file" accept=".pdf" className="hidden"
                                    onChange={e => { const f = e.target.files?.[0]; if (f) loadPdf(f); }} />
                            </label>

                            {pdfFile && (
                                <>
                                    <div className="flex items-center gap-1 ml-auto">
                                        <button onClick={() => setCurPage(p => Math.max(1, p - 1))} disabled={curPage <= 1}
                                            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-30">
                                            <ChevronLeft className="w-4 h-4" />
                                        </button>
                                        <span className="text-xs font-bold dark:text-white px-2">{curPage} / {totalPages}</span>
                                        <button onClick={() => setCurPage(p => Math.min(totalPages, p + 1))} disabled={curPage >= totalPages}
                                            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-30">
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => setRenderScale(s => Math.max(0.5, s - 0.2))}
                                            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10">
                                            <ZoomOut className="w-4 h-4" />
                                        </button>
                                        <span className="text-[10px] font-bold text-gray-400 w-10 text-center">{Math.round(renderScale * 100)}%</span>
                                        <button onClick={() => setRenderScale(s => Math.min(3, s + 0.2))}
                                            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10">
                                            <ZoomIn className="w-4 h-4" />
                                        </button>
                                    </div>
                                    {sigDataUrl && (
                                        <div className="flex items-center gap-1.5 px-3 py-1 bg-violet-100 dark:bg-violet-900/30 rounded-xl">
                                            <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
                                            <span className="text-[10px] font-black text-violet-700 dark:text-violet-300">Drag signature to position</span>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* PDF canvas + overlay */}
                    <div className="flex-1 overflow-auto flex items-start justify-center p-6">
                        {!pdfFile && mode !== 'verify' ? (
                            <div ref={pdfDropRef} onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                                onDragLeave={() => setIsDragOver(false)}
                                onDrop={onPdfDrop}
                                className={`flex flex-col items-center justify-center gap-4 w-full max-w-xl h-80 border-2 border-dashed rounded-3xl transition-all cursor-pointer
                  ${isDragOver ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 scale-[0.98]' : 'border-gray-200 dark:border-white/10 bg-white dark:bg-[#262636]'}`}
                                onClick={() => (document.querySelector('input[accept=".pdf"]') as HTMLInputElement)?.click()}>
                                <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 3 }}
                                    className="p-5 bg-violet-100 dark:bg-violet-900/30 rounded-2xl shadow-lg">
                                    <PenLine className="w-8 h-8 text-violet-600 dark:text-violet-400" />
                                </motion.div>
                                <div className="text-center">
                                    <p className="text-base font-black dark:text-white">Drop your PDF here</p>
                                    <p className="text-sm text-gray-400 mt-1">or <span className="text-violet-500 font-bold underline">browse files</span></p>
                                </div>
                            </div>
                        ) : mode === 'verify' ? (
                            <div className="flex flex-col items-center justify-center gap-4 w-full max-w-md h-80 text-center">
                                <div className="p-6 bg-violet-100 dark:bg-violet-900/30 rounded-2xl">
                                    <Search className="w-10 h-10 text-violet-500" />
                                </div>
                                <p className="text-base font-black dark:text-white">Upload a signed PDF and click Verify</p>
                                <p className="text-sm text-gray-400 leading-relaxed max-w-xs">
                                    The verification panel checks embedded OmniPDF digital signatures: signer identity, hash integrity, and certificate data.
                                </p>
                            </div>
                        ) : (
                            <div className="relative" style={{ display: 'inline-block' }}
                                onPointerMove={e => { onSigPointerMove(e); onResizePointerMove(e); }}
                                onPointerUp={() => { onSigPointerUp(); onResizePointerUp(); }}>

                                {isRenderingPdf && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-black/30 rounded-lg z-20">
                                        <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
                                    </div>
                                )}

                                <canvas ref={pdfCanvasRef} className="block rounded-lg shadow-2xl" />

                                {/* Signature overlay */}
                                {sigDataUrl && (
                                    <div
                                        className={`absolute select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                                        style={{ left: sigPos.x, top: sigPos.y, width: sigSize.w, height: sigSize.h }}
                                        onPointerDown={onSigPointerDown}>

                                        {/* Blue selection border */}
                                        <div className="absolute inset-0 border-2 border-violet-500 rounded-lg bg-violet-500/5 pointer-events-none" />

                                        <img src={sigDataUrl} alt="sig" className="w-full h-full object-contain pointer-events-none" style={{ display: 'block' }} />

                                        {/* Resize handle — bottom-right */}
                                        <div
                                            className="absolute bottom-0 right-0 w-5 h-5 bg-violet-600 rounded-tl-lg cursor-se-resize flex items-center justify-center"
                                            onPointerDown={e => { e.stopPropagation(); onResizePointerDown(e); }}>
                                            <div className="w-2 h-2 border-b-2 border-r-2 border-white" />
                                        </div>

                                        {/* Label */}
                                        <div className="absolute -top-5 left-0 text-[9px] font-black text-violet-600 bg-white dark:bg-[#262636] px-1.5 rounded shadow border border-violet-200 whitespace-nowrap">
                                            Drag to position · {Math.round(sigSize.w)}×{Math.round(sigSize.h)}px
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
