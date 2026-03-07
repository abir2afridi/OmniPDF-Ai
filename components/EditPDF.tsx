/**
 * EditPDF.tsx — Enterprise PDF Editor Module
 * Canvas-based editor with text, shapes, images, annotations, undo/redo,
 * watermarks, page ops, AI suggestions, OCR hooks, and batch editing.
 * Indigo brand color.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    ArrowLeft, Upload, Download, Loader2, CheckCircle2, AlertCircle, Info, X,
    ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Undo2, Redo2,
    Type, PenTool, Square, Circle, Image, Highlighter, Link2, Stamp, Eraser,
    MousePointer2, Minus, Strikethrough, Underline, Trash2, RotateCw,
    Copy, Layers, Droplets, FileText, Sparkles, Settings2, Eye,
} from 'lucide-react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import {
    type EditAnnotation, type EditSession, type EditTool, type ShapeType,
    type WatermarkConfig,
    validatePdfForEdit, createEditSession, loadPdfForEdit,
    createAnnotation, pushUndoAction, undo, redo,
    renderPdfPage, renderPdfThumbnail,
    applyAnnotationsToPdf, downloadEditedPdf,
    getAiTextSuggestion, sanitizeText, uid, fmtSize,
    cleanupTempBlobs,
} from '../services/editPdfService';

if (GlobalWorkerOptions) {
    GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

interface Props { onBack?: () => void; }
interface Toast { id: string; type: 'success' | 'error' | 'info' | 'warn'; msg: string; }

const TOOLS: { id: EditTool; icon: any; label: string; }[] = [
    { id: 'select', icon: MousePointer2, label: 'Select' },
    { id: 'text', icon: Type, label: 'Text' },
    { id: 'draw', icon: PenTool, label: 'Draw' },
    { id: 'shape', icon: Square, label: 'Shape' },
    { id: 'image', icon: Image, label: 'Image' },
    { id: 'highlight', icon: Highlighter, label: 'Highlight' },
    { id: 'underline', icon: Underline, label: 'Underline' },
    { id: 'strikethrough', icon: Strikethrough, label: 'Strike' },
    { id: 'stamp', icon: Stamp, label: 'Stamp' },
    { id: 'whiteout', icon: Eraser, label: 'Whiteout' },
    { id: 'link', icon: Link2, label: 'Link' },
];

const SHAPES: { id: ShapeType; icon: any; label: string }[] = [
    { id: 'rectangle', icon: Square, label: 'Rect' },
    { id: 'circle', icon: Circle, label: 'Circle' },
    { id: 'line', icon: Minus, label: 'Line' },
];

const STAMPS = ['APPROVED', 'DRAFT', 'CONFIDENTIAL', 'REVIEWED', 'FINAL', 'COPY'];

const FONTS = ['Helvetica', 'Times-Roman', 'Courier'];

const ToastItem = ({ t, onDismiss }: { t: Toast; onDismiss: () => void }) => (
    <motion.div layout initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 60 }}
        className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-xl max-w-sm text-sm font-medium border backdrop-blur-md pointer-events-auto
      ${t.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/60 border-emerald-300 text-emerald-800 dark:text-emerald-200'
                : t.type === 'error' ? 'bg-red-50 dark:bg-red-900/60 border-red-300 text-red-800 dark:text-red-200'
                    : t.type === 'warn' ? 'bg-amber-50 dark:bg-amber-900/60 border-amber-300 text-amber-800 dark:text-amber-200'
                        : 'bg-indigo-50 dark:bg-indigo-900/60 border-indigo-300 text-indigo-800 dark:text-indigo-200'}`}>
        {t.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            : t.type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                : <Info className="w-4 h-4 shrink-0 mt-0.5" />}
        <span className="flex-1 leading-snug">{t.msg}</span>
        <button onClick={onDismiss}><X className="w-3 h-3 opacity-50 hover:opacity-100" /></button>
    </motion.div>
);

export const EditPDF: React.FC<Props> = ({ onBack }) => {
    // ── Core state
    const [session, setSession] = useState<EditSession | null>(null);
    const [pdfDoc, setPdfDoc] = useState<any>(null);
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [curPage, setCurPage] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [scale, setScale] = useState(1.2);
    const [thumbnails, setThumbnails] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // ── Tool state
    const [activeTool, setActiveTool] = useState<EditTool>('select');
    const [annotations, setAnnotations] = useState<EditAnnotation[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [shapeType, setShapeType] = useState<ShapeType>('rectangle');
    const [stampText, setStampText] = useState('APPROVED');

    // ── Drawing state
    const [isDrawing, setIsDrawing] = useState(false);
    const [drawPoints, setDrawPoints] = useState<{ x: number; y: number }[]>([]);
    const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

    // ── Style state
    const [fontSize, setFontSize] = useState(16);
    const [fontFamily, setFontFamily] = useState('Helvetica');
    const [fontColor, setFontColor] = useState('#000000');
    const [strokeColor, setStrokeColor] = useState('#000000');
    const [fillColor, setFillColor] = useState('transparent');
    const [strokeWidth, setStrokeWidth] = useState(2);
    const [drawColor, setDrawColor] = useState('#000000');
    const [drawWidth, setDrawWidth] = useState(3);
    const [opacity, setOpacity] = useState(1);

    // ── Watermark
    const [showWatermark, setShowWatermark] = useState(false);
    const [wmText, setWmText] = useState('DRAFT');
    const [wmOpacity, setWmOpacity] = useState(0.2);
    const [wmFontSize, setWmFontSize] = useState(60);
    const [wmColor, setWmColor] = useState('#888888');

    // ── Export state
    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);
    const [editedBlob, setEditedBlob] = useState<Blob | null>(null);

    // ── AI state
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    // ── Refs
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const overlayRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    // ── Toasts
    const [toasts, setToasts] = useState<Toast[]>([]);
    const toast = useCallback((type: Toast['type'], msg: string) => {
        const id = uid();
        setToasts(p => [...p.slice(-4), { id, type, msg }]);
        setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 5000);
    }, []);

    // ── Cleanup
    useEffect(() => () => cleanupTempBlobs(), []);

    // ── PDF Loading
    const loadPdf = useCallback(async (file: File) => {
        const err = validatePdfForEdit(file);
        if (err) { toast('error', err); return; }
        setIsLoading(true);
        try {
            const { pdfDoc: doc, pdfBytes, pageCount } = await loadPdfForEdit(file);
            setPdfDoc(doc);
            setPdfFile(file);
            setTotalPages(pageCount);
            setCurPage(0);
            setAnnotations([]);
            setSelectedId(null);
            setEditedBlob(null);
            const sess = createEditSession(file, pdfBytes, pageCount);
            setSession(sess);
            // Generate thumbnails
            const thumbs: string[] = [];
            for (let i = 0; i < Math.min(pageCount, 50); i++) {
                try { thumbs.push(await renderPdfThumbnail(doc, i)); } catch { thumbs.push(''); }
            }
            setThumbnails(thumbs);
            toast('success', `Loaded "${file.name}" — ${pageCount} page${pageCount > 1 ? 's' : ''}`);
        } catch (e: any) {
            toast('error', e?.message || 'Failed to load PDF.');
        } finally { setIsLoading(false); }
    }, [toast]);

    // ── Render current page
    const renderCurrentPage = useCallback(async () => {
        if (!pdfDoc || !canvasRef.current) return;
        try { await renderPdfPage(pdfDoc, curPage, scale, canvasRef.current); } catch { }
    }, [pdfDoc, curPage, scale]);

    useEffect(() => { renderCurrentPage(); }, [renderCurrentPage]);

    // ── Draw overlay annotations
    const drawOverlay = useCallback(() => {
        const canvas = overlayRef.current;
        if (!canvas || !canvasRef.current) return;
        canvas.width = canvasRef.current.width;
        canvas.height = canvasRef.current.height;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const pageAnns = annotations.filter(a => a.pageIndex === curPage);
        const scaleRatio = scale;

        for (const ann of pageAnns) {
            const x = ann.x * scaleRatio, y = ann.y * scaleRatio;
            const w = ann.width * scaleRatio, h = ann.height * scaleRatio;
            ctx.globalAlpha = ann.opacity ?? 1;

            switch (ann.type) {
                case 'text':
                    ctx.font = `${ann.fontWeight === 'bold' ? 'bold ' : ''}${(ann.fontSize || 16) * scaleRatio}px ${ann.fontFamily || 'Helvetica'}`;
                    ctx.fillStyle = ann.fontColor || '#000';
                    ctx.textBaseline = 'top';
                    ctx.fillText(ann.text || '', x, y);
                    break;
                case 'shape':
                    ctx.strokeStyle = ann.strokeColor || '#000';
                    ctx.lineWidth = (ann.strokeWidth || 2) * scaleRatio;
                    if (ann.fillColor && ann.fillColor !== 'transparent') { ctx.fillStyle = ann.fillColor; }
                    if (ann.shapeType === 'rectangle') {
                        ctx.strokeRect(x, y, w, h);
                        if (ann.fillColor && ann.fillColor !== 'transparent') ctx.fillRect(x, y, w, h);
                    } else if (ann.shapeType === 'circle' || ann.shapeType === 'ellipse') {
                        ctx.beginPath();
                        ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
                        ctx.stroke();
                        if (ann.fillColor && ann.fillColor !== 'transparent') ctx.fill();
                    } else if (ann.shapeType === 'line') {
                        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.stroke();
                    }
                    break;
                case 'draw':
                    if (ann.drawPoints && ann.drawPoints.length > 1) {
                        ctx.strokeStyle = ann.drawColor || '#000';
                        ctx.lineWidth = (ann.drawWidth || 3) * scaleRatio;
                        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                        ctx.beginPath();
                        ctx.moveTo(ann.drawPoints[0].x * scaleRatio, ann.drawPoints[0].y * scaleRatio);
                        for (let i = 1; i < ann.drawPoints.length; i++) {
                            ctx.lineTo(ann.drawPoints[i].x * scaleRatio, ann.drawPoints[i].y * scaleRatio);
                        }
                        ctx.stroke();
                    }
                    break;
                case 'highlight':
                    ctx.fillStyle = 'rgba(255,255,0,0.35)';
                    ctx.fillRect(x, y, w, h);
                    break;
                case 'underline':
                    ctx.strokeStyle = ann.strokeColor || '#f00';
                    ctx.lineWidth = 2 * scaleRatio;
                    ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.stroke();
                    break;
                case 'strikethrough':
                    ctx.strokeStyle = ann.strokeColor || '#f00';
                    ctx.lineWidth = 2 * scaleRatio;
                    ctx.beginPath(); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.stroke();
                    break;
                case 'whiteout':
                    ctx.fillStyle = '#fff';
                    ctx.globalAlpha = 1;
                    ctx.fillRect(x, y, w, h);
                    break;
                case 'stamp':
                    ctx.save();
                    ctx.translate(x + w / 2, y + h / 2);
                    ctx.rotate((-30 * Math.PI) / 180);
                    ctx.font = `bold ${(ann.fontSize || 36) * scaleRatio}px Helvetica`;
                    ctx.fillStyle = ann.stampColor || '#f00';
                    ctx.globalAlpha = 0.6;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(ann.stampText || 'APPROVED', 0, 0);
                    ctx.restore();
                    break;
                case 'image':
                    // Image rendering handled via img load
                    if (ann.imageDataUrl) {
                        const img = new window.Image();
                        img.src = ann.imageDataUrl;
                        try { ctx.drawImage(img, x, y, w, h); } catch { }
                    }
                    break;
            }

            // Selection border
            if (ann.id === selectedId) {
                ctx.globalAlpha = 1;
                ctx.strokeStyle = '#6366f1';
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 3]);
                ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
                ctx.setLineDash([]);
                // Resize handle
                ctx.fillStyle = '#6366f1';
                ctx.fillRect(x + w - 4, y + h - 4, 8, 8);
            }
            ctx.globalAlpha = 1;
        }
    }, [annotations, curPage, scale, selectedId]);

    useEffect(() => { drawOverlay(); }, [drawOverlay]);

    // ── Mouse handlers
    const getCanvasPos = (e: React.MouseEvent): { x: number; y: number } => {
        const rect = overlayRef.current!.getBoundingClientRect();
        return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
    };

    const findAnnotationAt = (pos: { x: number; y: number }): EditAnnotation | null => {
        const pageAnns = annotations.filter(a => a.pageIndex === curPage);
        for (let i = pageAnns.length - 1; i >= 0; i--) {
            const a = pageAnns[i];
            if (pos.x >= a.x && pos.x <= a.x + a.width && pos.y >= a.y && pos.y <= a.y + a.height) return a;
        }
        return null;
    };

    const onCanvasMouseDown = (e: React.MouseEvent) => {
        if (!session) return;
        const pos = getCanvasPos(e);

        if (activeTool === 'select') {
            const ann = findAnnotationAt(pos);
            setSelectedId(ann?.id || null);
            if (ann) setDragStart({ x: pos.x - ann.x, y: pos.y - ann.y });
            return;
        }

        if (activeTool === 'draw') {
            setIsDrawing(true);
            setDrawPoints([pos]);
            return;
        }

        // For shape-like tools, start drag
        if (['shape', 'highlight', 'underline', 'strikethrough', 'whiteout', 'text', 'stamp', 'link', 'image'].includes(activeTool)) {
            setDragStart(pos);
            setIsDrawing(true);
        }
    };

    const onCanvasMouseMove = (e: React.MouseEvent) => {
        if (!isDrawing) {
            // Move selected annotation
            if (selectedId && dragStart && activeTool === 'select') {
                const pos = getCanvasPos(e);
                setAnnotations(prev => prev.map(a =>
                    a.id === selectedId ? { ...a, x: pos.x - dragStart.x, y: pos.y - dragStart.y } : a
                ));
            }
            return;
        }
        if (activeTool === 'draw') {
            const pos = getCanvasPos(e);
            setDrawPoints(prev => [...prev, pos]);
        }
    };

    const onCanvasMouseUp = (e: React.MouseEvent) => {
        if (!session) return;
        const pos = getCanvasPos(e);

        if (activeTool === 'select') {
            if (selectedId && dragStart) {
                // Save drag result to undo stack
                const before = [...annotations];
                setSession(prev => prev ? pushUndoAction(prev, 'modify', 'Move annotation', before, annotations) : prev);
            }
            setDragStart(null);
            return;
        }

        if (activeTool === 'draw' && drawPoints.length > 1) {
            const before = [...annotations];
            const ann = createAnnotation('draw', curPage, 0, 0, {
                drawPoints, drawColor, drawWidth, opacity,
                width: 0, height: 0,
            });
            const after = [...annotations, ann];
            setAnnotations(after);
            setSession(prev => prev ? pushUndoAction(prev, 'add', 'Freehand drawing', before, after) : prev);
            setIsDrawing(false);
            setDrawPoints([]);
            return;
        }

        if (dragStart && isDrawing) {
            const x = Math.min(dragStart.x, pos.x);
            const y = Math.min(dragStart.y, pos.y);
            const w = Math.max(Math.abs(pos.x - dragStart.x), 20);
            const h = Math.max(Math.abs(pos.y - dragStart.y), 20);

            const before = [...annotations];
            let ann: EditAnnotation;

            switch (activeTool) {
                case 'text':
                    ann = createAnnotation('text', curPage, x, y, { width: w, height: h, fontSize, fontFamily, fontColor, opacity });
                    break;
                case 'shape':
                    ann = createAnnotation('shape', curPage, x, y, { width: w, height: h, shapeType, strokeColor, strokeWidth, fillColor, opacity });
                    break;
                case 'highlight':
                    ann = createAnnotation('highlight', curPage, x, y, { width: w, height: h });
                    break;
                case 'underline':
                    ann = createAnnotation('underline', curPage, x, y, { width: w, height: 4, strokeColor });
                    break;
                case 'strikethrough':
                    ann = createAnnotation('strikethrough', curPage, x, y, { width: w, height: h, strokeColor });
                    break;
                case 'whiteout':
                    ann = createAnnotation('whiteout', curPage, x, y, { width: w, height: h });
                    break;
                case 'stamp':
                    ann = createAnnotation('stamp', curPage, x, y, { width: w, height: h, stampText, fontSize: 36, opacity: 0.6 });
                    break;
                case 'link':
                    const url = prompt('Enter URL:');
                    if (!url) { setIsDrawing(false); setDragStart(null); return; }
                    ann = createAnnotation('link', curPage, x, y, { width: w, height: h, linkUrl: url, text: url, fontSize: 12, fontColor: '#2563eb' });
                    break;
                case 'image':
                    imageInputRef.current?.click();
                    setIsDrawing(false); setDragStart(null); return;
                default:
                    setIsDrawing(false); setDragStart(null); return;
            }

            const after = [...annotations, ann];
            setAnnotations(after);
            setSession(prev => prev ? pushUndoAction(prev, 'add', `Add ${activeTool}`, before, after) : prev);
        }
        setIsDrawing(false);
        setDragStart(null);
    };

    // ── Image upload handler
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const before = [...annotations];
            const ann = createAnnotation('image', curPage, 50, 50, {
                width: 200, height: 150, imageDataUrl: reader.result as string, opacity,
            });
            const after = [...annotations, ann];
            setAnnotations(after);
            setSession(prev => prev ? pushUndoAction(prev, 'add', 'Add image', before, after) : prev);
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    // ── Undo / Redo
    const handleUndo = () => {
        if (!session) return;
        const result = undo(session);
        if (result) { setSession(result.session); setAnnotations(result.restoredAnnotations); setSelectedId(null); toast('info', '↩ Undo'); }
    };

    const handleRedo = () => {
        if (!session) return;
        const result = redo(session);
        if (result) { setSession(result.session); setAnnotations(result.restoredAnnotations); setSelectedId(null); toast('info', '↪ Redo'); }
    };

    // ── Delete selected
    const handleDeleteSelected = () => {
        if (!selectedId || !session) return;
        const before = [...annotations];
        const after = annotations.filter(a => a.id !== selectedId);
        setAnnotations(after);
        setSelectedId(null);
        setSession(prev => prev ? pushUndoAction(prev, 'delete', 'Delete annotation', before, after) : prev);
    };

    // ── Edit text of selected
    const handleEditText = () => {
        if (!selectedId) return;
        const ann = annotations.find(a => a.id === selectedId);
        if (!ann || (ann.type !== 'text' && ann.type !== 'link')) return;
        const newText = prompt('Edit text:', ann.text || '');
        if (newText === null) return;
        const before = [...annotations];
        const after = annotations.map(a => a.id === selectedId ? { ...a, text: sanitizeText(newText) } : a);
        setAnnotations(after);
        setSession(prev => prev ? pushUndoAction(prev, 'modify', 'Edit text', before, after) : prev);
    };

    // ── AI Suggestion
    const handleAiSuggest = async () => {
        if (!selectedId) { toast('warn', 'Select a text annotation first.'); return; }
        const ann = annotations.find(a => a.id === selectedId);
        if (!ann?.text) { toast('warn', 'Selected annotation has no text.'); return; }
        setIsAiLoading(true);
        try {
            const improved = await getAiTextSuggestion(ann.text);
            const before = [...annotations];
            const after = annotations.map(a => a.id === selectedId ? { ...a, text: improved } : a);
            setAnnotations(after);
            setSession(prev => prev ? pushUndoAction(prev, 'modify', 'AI text improvement', before, after) : prev);
            toast('success', '✨ AI improved the text!');
        } catch { toast('error', 'AI suggestion failed.'); }
        finally { setIsAiLoading(false); }
    };

    // ── Export
    const handleExport = async () => {
        if (!session) return;
        setIsExporting(true); setExportProgress(0); setEditedBlob(null);
        try {
            const wm: WatermarkConfig | null = showWatermark ? {
                text: wmText, fontSize: wmFontSize, color: wmColor, opacity: wmOpacity, rotation: -45, position: 'diagonal', pages: 'all',
            } : null;
            const blob = await applyAnnotationsToPdf(
                session.originalPdfBytes, annotations, wm, null,
                session.state.pageRotations, session.state.pageOrder, setExportProgress
            );
            setEditedBlob(blob);
            toast('success', `✅ PDF exported — ${fmtSize(blob.size)}`);
        } catch (e: any) { toast('error', e?.message || 'Export failed.'); }
        finally { setIsExporting(false); }
    };

    // ── Keyboard shortcuts
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === 'z') { e.preventDefault(); handleUndo(); }
            if (e.ctrlKey && e.key === 'y') { e.preventDefault(); handleRedo(); }
            if (e.key === 'Delete' || e.key === 'Backspace') { if (selectedId) handleDeleteSelected(); }
            if (e.key === 'Escape') setSelectedId(null);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    });

    // ── Drop zone
    const [isDragOver, setIsDragOver] = useState(false);

    const selectedAnn = annotations.find(a => a.id === selectedId);

    // ═══════════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════════
    return (
        <div className="flex-1 flex flex-col h-full bg-[#f3f1ea] dark:bg-[#1e1e2e] overflow-hidden relative">
            {/* Toasts */}
            <div className="fixed top-6 right-6 z-[200] flex flex-col gap-2 items-end pointer-events-none">
                <AnimatePresence>{toasts.map(t => (
                    <div key={t.id} className="pointer-events-auto"><ToastItem t={t} onDismiss={() => setToasts(p => p.filter(x => x.id !== t.id))} /></div>
                ))}</AnimatePresence>
            </div>

            {/* Hidden inputs */}
            <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) loadPdf(f); e.target.value = ''; }} />
            <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="shrink-0 flex items-center justify-between px-4 lg:px-6 py-3 bg-[#f3f1ea] dark:bg-[#262636] border-b border-gray-100 dark:border-white/5 shadow-sm gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    {onBack && <button onClick={onBack} className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl text-gray-500"><ArrowLeft className="w-4 h-4" /></button>}
                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl"><PenTool className="w-5 h-5 text-indigo-600 dark:text-indigo-400" /></div>
                    <div className="min-w-0">
                        <h1 className="text-lg font-black dark:text-white tracking-tight">Edit PDF</h1>
                        <p className="text-[10px] text-gray-400 font-medium truncate">Text · Shapes · Images · Annotations · AI Suggestions · Watermarks</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {session && (
                        <>
                            <button onClick={handleUndo} disabled={!session.undoStack.length} className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl text-gray-500 disabled:opacity-30" title="Undo (Ctrl+Z)"><Undo2 className="w-4 h-4" /></button>
                            <button onClick={handleRedo} disabled={!session.redoStack.length} className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl text-gray-500 disabled:opacity-30" title="Redo (Ctrl+Y)"><Redo2 className="w-4 h-4" /></button>
                            <div className="w-px h-6 bg-gray-200 dark:bg-white/10 mx-1" />
                            <button onClick={handleExport} disabled={isExporting} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black rounded-xl flex items-center gap-2 shadow-sm disabled:opacity-50">
                                {isExporting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {exportProgress}%</> : <><Download className="w-3.5 h-3.5" /> Export</>}
                            </button>
                            {editedBlob && (
                                <button onClick={() => downloadEditedPdf(editedBlob, session.fileName)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl flex items-center gap-2 shadow-sm">
                                    <Download className="w-3.5 h-3.5" /> Download
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ── Body ───────────────────────────────────────────────────── */}
            <div className="flex-1 flex overflow-hidden">

                {/* ── LEFT: Toolbar ── */}
                <div className="w-14 shrink-0 flex flex-col items-center py-2 gap-1 border-r border-gray-100 dark:border-white/5 bg-[#f3f1ea] dark:bg-[#262636] overflow-y-auto">
                    {TOOLS.map(t => (
                        <button key={t.id} onClick={() => { setActiveTool(t.id); setSelectedId(null); }} title={t.label}
                            className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${activeTool === t.id ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5'}`}>
                            <t.icon className="w-4 h-4" />
                        </button>
                    ))}
                    <div className="w-8 h-px bg-gray-200 dark:bg-white/10 my-1" />
                    <button onClick={() => imageInputRef.current?.click()} title="Add Image" className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"><Image className="w-4 h-4" /></button>
                </div>

                {/* ── THUMBNAILS ── */}
                {session && (
                    <div className="w-24 shrink-0 flex flex-col border-r border-gray-100 dark:border-white/5 bg-[#f3f1ea] dark:bg-[#262636] overflow-y-auto py-2 gap-2 px-2">
                        {thumbnails.map((thumb, i) => (
                            <button key={i} onClick={() => setCurPage(i)}
                                className={`relative rounded-lg overflow-hidden border-2 transition-all ${curPage === i ? 'border-indigo-500 shadow-lg' : 'border-transparent hover:border-indigo-300'}`}>
                                {thumb ? <img src={thumb} alt={`Page ${i + 1}`} className="w-full" /> : <div className="w-full h-24 bg-gray-200 dark:bg-white/5" />}
                                <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[8px] text-center py-0.5 font-bold">{i + 1}</div>
                                {annotations.filter(a => a.pageIndex === i).length > 0 && (
                                    <div className="absolute top-1 right-1 w-3 h-3 bg-indigo-500 rounded-full border border-white" />
                                )}
                            </button>
                        ))}
                    </div>
                )}

                {/* ── CENTER: Canvas ── */}
                <div className="flex-1 flex flex-col min-w-0 bg-gray-100 dark:bg-[#16161f]">
                    {/* Page controls */}
                    {session && (
                        <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-white dark:bg-[#262636] border-b border-gray-100 dark:border-white/5 text-xs">
                            <div className="flex items-center gap-2">
                                <button onClick={() => setCurPage(p => Math.max(0, p - 1))} disabled={curPage === 0} className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg disabled:opacity-30"><ChevronLeft className="w-3.5 h-3.5" /></button>
                                <span className="font-bold dark:text-white">{curPage + 1} / {totalPages}</span>
                                <button onClick={() => setCurPage(p => Math.min(totalPages - 1, p + 1))} disabled={curPage >= totalPages - 1} className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg disabled:opacity-30"><ChevronRight className="w-3.5 h-3.5" /></button>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setScale(s => Math.max(0.5, s - 0.2))} className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg"><ZoomOut className="w-3.5 h-3.5" /></button>
                                <span className="font-mono font-bold dark:text-white w-12 text-center">{Math.round(scale * 100)}%</span>
                                <button onClick={() => setScale(s => Math.min(3, s + 0.2))} className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg"><ZoomIn className="w-3.5 h-3.5" /></button>
                            </div>
                            <div className="flex items-center gap-1 text-gray-400">
                                <Layers className="w-3 h-3" />
                                <span>{annotations.filter(a => a.pageIndex === curPage).length} edits</span>
                            </div>
                        </div>
                    )}

                    {/* Canvas area */}
                    <div ref={containerRef} className="flex-1 overflow-auto flex items-start justify-center p-4">
                        {!session ? (
                            /* Upload area */
                            <div className={`w-full max-w-xl mx-auto mt-16 p-12 border-2 border-dashed rounded-3xl transition-all cursor-pointer text-center
                ${isDragOver ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-300 dark:border-white/10 hover:border-indigo-400'}`}
                                onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                                onDragLeave={() => setIsDragOver(false)}
                                onDrop={e => { e.preventDefault(); setIsDragOver(false); const f = e.dataTransfer.files[0]; if (f) loadPdf(f); }}
                                onClick={() => fileInputRef.current?.click()}>
                                {isLoading ? (
                                    <div className="flex flex-col items-center gap-4">
                                        <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
                                        <p className="text-sm font-bold text-gray-500">Loading PDF…</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-4">
                                        <div className="w-20 h-20 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center">
                                            <Upload className="w-8 h-8 text-indigo-500" />
                                        </div>
                                        <div>
                                            <p className="text-lg font-black dark:text-white">Drop PDF here to edit</p>
                                            <p className="text-sm text-gray-400 mt-1">or click to browse • Max {200}MB</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="relative inline-block shadow-2xl rounded-lg overflow-hidden">
                                <canvas ref={canvasRef} className="block" />
                                <canvas ref={overlayRef}
                                    className="absolute inset-0 cursor-crosshair"
                                    style={{ cursor: activeTool === 'select' ? 'default' : activeTool === 'draw' ? 'crosshair' : 'cell' }}
                                    onMouseDown={onCanvasMouseDown}
                                    onMouseMove={onCanvasMouseMove}
                                    onMouseUp={onCanvasMouseUp}
                                    onDoubleClick={() => { if (selectedAnn?.type === 'text') handleEditText(); }}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* ── RIGHT: Properties Panel ── */}
                {session && (
                    <div className="w-64 shrink-0 flex flex-col border-l border-gray-100 dark:border-white/5 bg-[#f3f1ea] dark:bg-[#262636] overflow-y-auto">
                        {/* Active tool settings */}
                        <div className="p-4 border-b border-gray-100 dark:border-white/5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">
                                {activeTool === 'select' ? 'Selection' : `${activeTool.charAt(0).toUpperCase() + activeTool.slice(1)} Tool`}
                            </p>

                            {/* Text Settings */}
                            {(activeTool === 'text' || (selectedAnn?.type === 'text')) && (
                                <div className="space-y-3">
                                    <div className="flex gap-2">
                                        <select value={fontFamily} onChange={e => setFontFamily(e.target.value)}
                                            className="flex-1 px-2 py-1.5 text-xs bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg dark:text-white">
                                            {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                                        </select>
                                        <input type="number" value={fontSize} onChange={e => setFontSize(+e.target.value)} min={8} max={120}
                                            className="w-16 px-2 py-1.5 text-xs bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg dark:text-white" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <label className="text-[10px] text-gray-500">Color</label>
                                        <input type="color" value={fontColor} onChange={e => setFontColor(e.target.value)} className="w-7 h-7 rounded border cursor-pointer" />
                                    </div>
                                </div>
                            )}

                            {/* Shape Settings */}
                            {(activeTool === 'shape') && (
                                <div className="space-y-3">
                                    <div className="flex gap-1">
                                        {SHAPES.map(s => (
                                            <button key={s.id} onClick={() => setShapeType(s.id)}
                                                className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg ${shapeType === s.id ? 'bg-indigo-600 text-white' : 'bg-gray-50 dark:bg-white/5 text-gray-500'}`}>
                                                {s.label}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <label className="text-[10px] text-gray-500">Stroke</label>
                                        <input type="color" value={strokeColor} onChange={e => setStrokeColor(e.target.value)} className="w-6 h-6 rounded border cursor-pointer" />
                                        <input type="number" value={strokeWidth} onChange={e => setStrokeWidth(+e.target.value)} min={1} max={20}
                                            className="w-14 px-2 py-1 text-xs bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg dark:text-white" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <label className="text-[10px] text-gray-500">Fill</label>
                                        <input type="color" value={fillColor === 'transparent' ? '#ffffff' : fillColor} onChange={e => setFillColor(e.target.value)} className="w-6 h-6 rounded border cursor-pointer" />
                                        <button onClick={() => setFillColor('transparent')} className="text-[10px] text-gray-400 underline">None</button>
                                    </div>
                                </div>
                            )}

                            {/* Draw Settings */}
                            {activeTool === 'draw' && (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <label className="text-[10px] text-gray-500">Color</label>
                                        <input type="color" value={drawColor} onChange={e => setDrawColor(e.target.value)} className="w-7 h-7 rounded border cursor-pointer" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-500">Width: {drawWidth}px</label>
                                        <input type="range" min={1} max={20} value={drawWidth} onChange={e => setDrawWidth(+e.target.value)} className="w-full accent-indigo-500" />
                                    </div>
                                </div>
                            )}

                            {/* Stamp Settings */}
                            {activeTool === 'stamp' && (
                                <div className="space-y-2">
                                    <div className="flex flex-wrap gap-1">
                                        {STAMPS.map(s => (
                                            <button key={s} onClick={() => setStampText(s)}
                                                className={`px-2 py-1 text-[9px] font-bold rounded-md ${stampText === s ? 'bg-indigo-600 text-white' : 'bg-gray-50 dark:bg-white/5 text-gray-500'}`}>{s}</button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Opacity */}
                            <div className="mt-3">
                                <label className="text-[10px] text-gray-500">Opacity: {Math.round(opacity * 100)}%</label>
                                <input type="range" min={0.1} max={1} step={0.05} value={opacity} onChange={e => setOpacity(+e.target.value)} className="w-full accent-indigo-500" />
                            </div>
                        </div>

                        {/* Selected annotation controls */}
                        {selectedAnn && (
                            <div className="p-4 border-b border-gray-100 dark:border-white/5">
                                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-2">Selected: {selectedAnn.type}</p>
                                <div className="flex gap-2">
                                    {(selectedAnn.type === 'text' || selectedAnn.type === 'link') && (
                                        <button onClick={handleEditText} className="flex-1 py-1.5 text-[10px] font-bold bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 rounded-lg">Edit Text</button>
                                    )}
                                    <button onClick={handleDeleteSelected} className="flex-1 py-1.5 text-[10px] font-bold bg-red-50 dark:bg-red-900/20 text-red-600 rounded-lg flex items-center justify-center gap-1">
                                        <Trash2 className="w-3 h-3" /> Delete
                                    </button>
                                </div>
                                {selectedAnn.type === 'text' && (
                                    <button onClick={handleAiSuggest} disabled={isAiLoading}
                                        className="w-full mt-2 py-1.5 text-[10px] font-bold bg-purple-50 dark:bg-purple-900/20 text-purple-600 rounded-lg flex items-center justify-center gap-1 disabled:opacity-40">
                                        {isAiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} AI Improve
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Watermark */}
                        <div className="p-4 border-b border-gray-100 dark:border-white/5">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={showWatermark} onChange={e => setShowWatermark(e.target.checked)} className="accent-indigo-600 w-4 h-4" />
                                <Droplets className="w-3.5 h-3.5 text-gray-500" />
                                <span className="text-xs font-bold dark:text-white">Watermark</span>
                            </label>
                            {showWatermark && (
                                <div className="mt-3 space-y-2">
                                    <input value={wmText} onChange={e => setWmText(e.target.value)} placeholder="Watermark text"
                                        className="w-full px-2 py-1.5 text-xs bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg dark:text-white" />
                                    <div className="flex items-center gap-2">
                                        <input type="color" value={wmColor} onChange={e => setWmColor(e.target.value)} className="w-6 h-6 rounded border cursor-pointer" />
                                        <span className="text-[10px] text-gray-400">Opacity: {Math.round(wmOpacity * 100)}%</span>
                                    </div>
                                    <input type="range" min={0.05} max={0.8} step={0.05} value={wmOpacity} onChange={e => setWmOpacity(+e.target.value)} className="w-full accent-indigo-500" />
                                </div>
                            )}
                        </div>

                        {/* Stats */}
                        <div className="p-4 mt-auto">
                            <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-500/20 rounded-xl space-y-1">
                                <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400">Session Info</p>
                                <p className="text-[10px] text-gray-500">{totalPages} pages • {annotations.length} edits</p>
                                <p className="text-[10px] text-gray-500">Undo: {session.undoStack.length} • Redo: {session.redoStack.length}</p>
                                <p className="text-[10px] text-gray-400">{pdfFile ? fmtSize(pdfFile.size) : ''}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
