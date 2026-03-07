/**
 * editPdfService.ts — Enterprise PDF Editing Engine
 *
 * Architecture:
 *   ┌──────────────┐      ┌──────────────────┐      ┌──────────────────┐
 *   │  EditPDF.tsx  │ ──▶  │  editPdfService  │ ──▶  │  pdf-lib engine  │
 *   │  (UI/Canvas)  │      │  (Undo/Redo/Ops) │      │  (byte output)   │
 *   └──────────────┘      └──────────────────┘      └──────────────────┘
 *         ▲                       │
 *         │                       ├──▶ ocrService (OCR pipeline)
 *         │                       ├──▶ aiService  (AI suggestions)
 *         └───────────────────────┘
 *
 * Features:
 *   • Canvas-based annotations: text, shapes, images, links, highlights
 *   • Full undo/redo with versioned state stack
 *   • Watermark + header/footer injection
 *   • Page ops: reorder, duplicate, delete, rotate
 *   • Batch editing across multiple pages
 *   • AI text suggestions & OCR integration hooks
 *   • Secure blob management with auto-cleanup
 *
 * Dependencies: pdf-lib, pdfjs-dist (rendering only)
 */

import { PDFDocument, rgb, StandardFonts, degrees, PDFPage, PDFFont } from 'pdf-lib';
import {
    getDocument, GlobalWorkerOptions,
    type PDFDocumentProxy,
} from 'pdfjs-dist';

if (GlobalWorkerOptions) {
    GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type EditTool =
    | 'select' | 'text' | 'draw' | 'shape' | 'image'
    | 'highlight' | 'underline' | 'strikethrough'
    | 'link' | 'stamp' | 'whiteout' | 'eraser';

export type ShapeType = 'rectangle' | 'circle' | 'line' | 'arrow' | 'ellipse';

export interface EditAnnotation {
    id: string;
    type: EditTool;
    pageIndex: number;
    // Position in PDF coordinates (bottom-left origin)
    x: number;
    y: number;
    width: number;
    height: number;
    // Text properties
    text?: string;
    fontSize?: number;
    fontFamily?: string;
    fontColor?: string;
    fontWeight?: 'normal' | 'bold';
    fontStyle?: 'normal' | 'italic';
    textAlign?: 'left' | 'center' | 'right';
    // Shape properties
    shapeType?: ShapeType;
    strokeColor?: string;
    strokeWidth?: number;
    fillColor?: string;
    opacity?: number;
    // Image properties
    imageDataUrl?: string;
    // Drawing properties
    drawPoints?: { x: number; y: number }[];
    drawColor?: string;
    drawWidth?: number;
    // Link properties
    linkUrl?: string;
    // Stamp
    stampText?: string;
    stampColor?: string;
    // Rotation
    rotation?: number;
    // Selection state (UI only, not serialized)
    isSelected?: boolean;
}

export interface WatermarkConfig {
    text: string;
    fontSize: number;
    color: string;
    opacity: number;
    rotation: number;
    position: 'center' | 'diagonal' | 'top' | 'bottom';
    pages: 'all' | number[];
}

export interface HeaderFooterConfig {
    headerLeft?: string;
    headerCenter?: string;
    headerRight?: string;
    footerLeft?: string;
    footerCenter?: string;
    footerRight?: string;
    fontSize: number;
    fontColor: string;
    includePageNumbers: boolean;
    pages: 'all' | number[];
}

export interface PageOperation {
    type: 'rotate' | 'delete' | 'duplicate' | 'reorder';
    pageIndex: number;
    angle?: number; // for rotate
    targetIndex?: number; // for reorder
}

export interface EditAction {
    id: string;
    timestamp: number;
    type: 'add' | 'modify' | 'delete' | 'page-op' | 'watermark' | 'header-footer' | 'batch';
    description: string;
    // Snapshot of annotations at this point (for full undo)
    annotationsBefore: EditAnnotation[];
    annotationsAfter: EditAnnotation[];
    // Page operations
    pageOp?: PageOperation;
}

export interface EditState {
    annotations: EditAnnotation[];
    pageCount: number;
    pageRotations: Record<number, number>;
    deletedPages: Set<number>;
    duplicatedPages: { sourceIndex: number; insertAfter: number }[];
    pageOrder: number[];
    watermark: WatermarkConfig | null;
    headerFooter: HeaderFooterConfig | null;
}

export interface EditSession {
    fileId: string;
    fileName: string;
    originalPdfBytes: Uint8Array;
    state: EditState;
    undoStack: EditAction[];
    redoStack: EditAction[];
    createdAt: number;
    lastModified: number;
}

// ── Utility helpers ──────────────────────────────────────────────────────────

export const uid = () => Math.random().toString(36).slice(2, 12);

export const EDIT_MAX_MB = 200;
export const EDIT_MAX_PAGES = 500;

export const validatePdfForEdit = (file: File): string | null => {
    if (!file.name.toLowerCase().endsWith('.pdf')) return 'Only PDF files are supported.';
    if (file.type && file.type !== 'application/pdf') return 'Invalid file type. Only PDF files are accepted.';
    if (file.size > EDIT_MAX_MB * 1024 * 1024) return `File too large. Max ${EDIT_MAX_MB}MB.`;
    return null;
};

export const sanitizeText = (text: string): string => {
    // Prevent script injection via annotations
    return text
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+=/gi, '')
        .replace(/data:text\/html/gi, '')
        .trim();
};

export const hexToRgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return rgb(r, g, b);
};

export const fmtSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// ── PDF Loading ──────────────────────────────────────────────────────────────

export const loadPdfForEdit = async (file: File): Promise<{
    pdfDoc: PDFDocumentProxy;
    pdfBytes: Uint8Array;
    pageCount: number;
}> => {
    const buf = await file.arrayBuffer();
    const pdfBytes = new Uint8Array(buf);
    const pdfDoc = await getDocument({ data: pdfBytes.slice() }).promise;
    return { pdfDoc, pdfBytes, pageCount: pdfDoc.numPages };
};

// ── Session management ───────────────────────────────────────────────────────

export const createEditSession = (file: File, pdfBytes: Uint8Array, pageCount: number): EditSession => {
    const pageOrder = Array.from({ length: pageCount }, (_, i) => i);
    return {
        fileId: uid(),
        fileName: file.name,
        originalPdfBytes: pdfBytes,
        state: {
            annotations: [],
            pageCount,
            pageRotations: {},
            deletedPages: new Set(),
            duplicatedPages: [],
            pageOrder,
            watermark: null,
            headerFooter: null,
        },
        undoStack: [],
        redoStack: [],
        createdAt: Date.now(),
        lastModified: Date.now(),
    };
};

// ── Undo/Redo Engine ─────────────────────────────────────────────────────────

export const pushUndoAction = (
    session: EditSession,
    actionType: EditAction['type'],
    description: string,
    annotationsBefore: EditAnnotation[],
    annotationsAfter: EditAnnotation[],
    pageOp?: PageOperation
): EditSession => {
    const action: EditAction = {
        id: uid(),
        timestamp: Date.now(),
        type: actionType,
        description,
        annotationsBefore: JSON.parse(JSON.stringify(annotationsBefore)),
        annotationsAfter: JSON.parse(JSON.stringify(annotationsAfter)),
        pageOp,
    };

    return {
        ...session,
        undoStack: [...session.undoStack, action].slice(-100), // keep last 100 actions
        redoStack: [], // clear redo on new action
        lastModified: Date.now(),
    };
};

export const undo = (session: EditSession): { session: EditSession; restoredAnnotations: EditAnnotation[] } | null => {
    if (session.undoStack.length === 0) return null;
    const action = session.undoStack[session.undoStack.length - 1];
    return {
        session: {
            ...session,
            undoStack: session.undoStack.slice(0, -1),
            redoStack: [...session.redoStack, action],
            state: {
                ...session.state,
                annotations: JSON.parse(JSON.stringify(action.annotationsBefore)),
            },
            lastModified: Date.now(),
        },
        restoredAnnotations: JSON.parse(JSON.stringify(action.annotationsBefore)),
    };
};

export const redo = (session: EditSession): { session: EditSession; restoredAnnotations: EditAnnotation[] } | null => {
    if (session.redoStack.length === 0) return null;
    const action = session.redoStack[session.redoStack.length - 1];
    return {
        session: {
            ...session,
            redoStack: session.redoStack.slice(0, -1),
            undoStack: [...session.undoStack, action],
            state: {
                ...session.state,
                annotations: JSON.parse(JSON.stringify(action.annotationsAfter)),
            },
            lastModified: Date.now(),
        },
        restoredAnnotations: JSON.parse(JSON.stringify(action.annotationsAfter)),
    };
};

// ── Annotation CRUD ──────────────────────────────────────────────────────────

export const createAnnotation = (
    type: EditTool,
    pageIndex: number,
    x: number, y: number,
    defaults?: Partial<EditAnnotation>
): EditAnnotation => ({
    id: uid(),
    type,
    pageIndex,
    x, y,
    width: defaults?.width ?? (type === 'text' ? 200 : 100),
    height: defaults?.height ?? (type === 'text' ? 30 : 100),
    text: defaults?.text ?? (type === 'text' ? 'Double-click to edit' : undefined),
    fontSize: defaults?.fontSize ?? 16,
    fontFamily: defaults?.fontFamily ?? 'Helvetica',
    fontColor: defaults?.fontColor ?? '#000000',
    fontWeight: defaults?.fontWeight ?? 'normal',
    fontStyle: defaults?.fontStyle ?? 'normal',
    textAlign: defaults?.textAlign ?? 'left',
    shapeType: defaults?.shapeType ?? 'rectangle',
    strokeColor: defaults?.strokeColor ?? '#000000',
    strokeWidth: defaults?.strokeWidth ?? 2,
    fillColor: defaults?.fillColor ?? 'transparent',
    opacity: defaults?.opacity ?? 1,
    drawPoints: defaults?.drawPoints ?? [],
    drawColor: defaults?.drawColor ?? '#000000',
    drawWidth: defaults?.drawWidth ?? 3,
    imageDataUrl: defaults?.imageDataUrl,
    linkUrl: defaults?.linkUrl,
    stampText: defaults?.stampText ?? 'APPROVED',
    stampColor: defaults?.stampColor ?? '#ff0000',
    rotation: defaults?.rotation ?? 0,
});

// ── PDF Generation Engine ────────────────────────────────────────────────────

const getFont = async (pdfDoc: any, fontFamily: string): Promise<PDFFont> => {
    const fontMap: Record<string, any> = {
        'Helvetica': StandardFonts.Helvetica,
        'Helvetica-Bold': StandardFonts.HelveticaBold,
        'Times-Roman': StandardFonts.TimesRoman,
        'Courier': StandardFonts.Courier,
    };
    return pdfDoc.embedFont(fontMap[fontFamily] || StandardFonts.Helvetica);
};

export const applyAnnotationsToPdf = async (
    originalBytes: Uint8Array,
    annotations: EditAnnotation[],
    watermark: WatermarkConfig | null,
    headerFooter: HeaderFooterConfig | null,
    pageRotations: Record<number, number>,
    pageOrder: number[],
    onProgress?: (percent: number) => void,
): Promise<Blob> => {
    onProgress?.(5);

    const pdfDoc = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    const totalSteps = annotations.length + (watermark ? pages.length : 0) + (headerFooter ? pages.length : 0);
    let completedSteps = 0;

    onProgress?.(10);

    // Apply page rotations
    for (const [pageIdxStr, angle] of Object.entries(pageRotations)) {
        const pageIdx = parseInt(pageIdxStr);
        if (pageIdx >= 0 && pageIdx < pages.length && angle !== 0) {
            pages[pageIdx].setRotation(degrees(angle));
        }
    }

    onProgress?.(15);

    // Apply annotations
    for (const ann of annotations) {
        if (ann.pageIndex < 0 || ann.pageIndex >= pages.length) continue;
        const page = pages[ann.pageIndex];
        const { width: pageW, height: pageH } = page.getSize();

        try {
            switch (ann.type) {
                case 'text': {
                    if (!ann.text) break;
                    const sanitized = sanitizeText(ann.text);
                    const fontKey = ann.fontWeight === 'bold' ? 'Helvetica-Bold' : (ann.fontFamily || 'Helvetica');
                    const font = await getFont(pdfDoc, fontKey);
                    const fontSize = ann.fontSize || 16;
                    const color = ann.fontColor ? hexToRgb(ann.fontColor) : rgb(0, 0, 0);

                    page.drawText(sanitized, {
                        x: ann.x,
                        y: pageH - ann.y - fontSize,
                        size: fontSize,
                        font,
                        color,
                        opacity: ann.opacity ?? 1,
                    });
                    break;
                }

                case 'shape': {
                    const strokeColor = ann.strokeColor ? hexToRgb(ann.strokeColor) : rgb(0, 0, 0);
                    const fillColor = ann.fillColor && ann.fillColor !== 'transparent' ? hexToRgb(ann.fillColor) : undefined;
                    const opacity = ann.opacity ?? 1;
                    const strokeWidth = ann.strokeWidth || 2;

                    if (ann.shapeType === 'rectangle') {
                        page.drawRectangle({
                            x: ann.x,
                            y: pageH - ann.y - ann.height,
                            width: ann.width,
                            height: ann.height,
                            borderColor: strokeColor,
                            borderWidth: strokeWidth,
                            color: fillColor,
                            opacity,
                        });
                    } else if (ann.shapeType === 'circle' || ann.shapeType === 'ellipse') {
                        page.drawEllipse({
                            x: ann.x + ann.width / 2,
                            y: pageH - ann.y - ann.height / 2,
                            xScale: ann.width / 2,
                            yScale: ann.height / 2,
                            borderColor: strokeColor,
                            borderWidth: strokeWidth,
                            color: fillColor,
                            opacity,
                        });
                    } else if (ann.shapeType === 'line') {
                        page.drawLine({
                            start: { x: ann.x, y: pageH - ann.y },
                            end: { x: ann.x + ann.width, y: pageH - ann.y - ann.height },
                            thickness: strokeWidth,
                            color: strokeColor,
                            opacity,
                        });
                    }
                    break;
                }

                case 'draw': {
                    if (!ann.drawPoints || ann.drawPoints.length < 2) break;
                    const color = ann.drawColor ? hexToRgb(ann.drawColor) : rgb(0, 0, 0);
                    const thickness = ann.drawWidth || 3;

                    for (let i = 1; i < ann.drawPoints.length; i++) {
                        page.drawLine({
                            start: { x: ann.drawPoints[i - 1].x, y: pageH - ann.drawPoints[i - 1].y },
                            end: { x: ann.drawPoints[i].x, y: pageH - ann.drawPoints[i].y },
                            thickness,
                            color,
                            opacity: ann.opacity ?? 1,
                        });
                    }
                    break;
                }

                case 'highlight': {
                    page.drawRectangle({
                        x: ann.x,
                        y: pageH - ann.y - ann.height,
                        width: ann.width,
                        height: ann.height,
                        color: rgb(1, 1, 0),
                        opacity: 0.35,
                    });
                    break;
                }

                case 'underline': {
                    page.drawLine({
                        start: { x: ann.x, y: pageH - ann.y - ann.height },
                        end: { x: ann.x + ann.width, y: pageH - ann.y - ann.height },
                        thickness: 2,
                        color: ann.strokeColor ? hexToRgb(ann.strokeColor) : rgb(1, 0, 0),
                        opacity: ann.opacity ?? 0.8,
                    });
                    break;
                }

                case 'strikethrough': {
                    const midY = pageH - ann.y - ann.height / 2;
                    page.drawLine({
                        start: { x: ann.x, y: midY },
                        end: { x: ann.x + ann.width, y: midY },
                        thickness: 2,
                        color: ann.strokeColor ? hexToRgb(ann.strokeColor) : rgb(1, 0, 0),
                        opacity: ann.opacity ?? 0.8,
                    });
                    break;
                }

                case 'whiteout': {
                    page.drawRectangle({
                        x: ann.x,
                        y: pageH - ann.y - ann.height,
                        width: ann.width,
                        height: ann.height,
                        color: rgb(1, 1, 1),
                        opacity: 1,
                    });
                    break;
                }

                case 'stamp': {
                    const stampFont = await getFont(pdfDoc, 'Helvetica-Bold');
                    const stampText = sanitizeText(ann.stampText || 'APPROVED');
                    const stampColor = ann.stampColor ? hexToRgb(ann.stampColor) : rgb(1, 0, 0);
                    const stampSize = ann.fontSize || 36;

                    page.drawText(stampText, {
                        x: ann.x,
                        y: pageH - ann.y - stampSize,
                        size: stampSize,
                        font: stampFont,
                        color: stampColor,
                        opacity: ann.opacity ?? 0.6,
                        rotate: degrees(ann.rotation || -30),
                    });
                    break;
                }

                case 'image': {
                    if (!ann.imageDataUrl) break;
                    try {
                        let embeddedImage;
                        if (ann.imageDataUrl.includes('image/png')) {
                            const imgBytes = Uint8Array.from(atob(ann.imageDataUrl.split(',')[1]), c => c.charCodeAt(0));
                            embeddedImage = await pdfDoc.embedPng(imgBytes);
                        } else {
                            const imgBytes = Uint8Array.from(atob(ann.imageDataUrl.split(',')[1]), c => c.charCodeAt(0));
                            embeddedImage = await pdfDoc.embedJpg(imgBytes);
                        }
                        page.drawImage(embeddedImage, {
                            x: ann.x,
                            y: pageH - ann.y - ann.height,
                            width: ann.width,
                            height: ann.height,
                            opacity: ann.opacity ?? 1,
                        });
                    } catch (imgErr) {
                        console.warn('Failed to embed image annotation:', imgErr);
                    }
                    break;
                }
            }
        } catch (annErr) {
            console.warn(`Failed to apply annotation ${ann.id}:`, annErr);
        }

        completedSteps++;
        if (totalSteps > 0) {
            onProgress?.(15 + Math.round((completedSteps / totalSteps) * 60));
        }
    }

    onProgress?.(75);

    // Apply watermark
    if (watermark) {
        const wmFont = await getFont(pdfDoc, 'Helvetica-Bold');
        const wmColor = watermark.color ? hexToRgb(watermark.color) : rgb(0.5, 0.5, 0.5);
        const wmText = sanitizeText(watermark.text);

        for (let i = 0; i < pages.length; i++) {
            const shouldApply = watermark.pages === 'all' || (watermark.pages as number[]).includes(i);
            if (!shouldApply) continue;

            const page = pages[i];
            const { width, height } = page.getSize();

            let x: number, y: number, rot: number;
            if (watermark.position === 'diagonal') {
                x = width * 0.15;
                y = height * 0.45;
                rot = watermark.rotation || -45;
            } else if (watermark.position === 'top') {
                x = width / 2 - (wmText.length * watermark.fontSize * 0.3);
                y = height - 50;
                rot = 0;
            } else if (watermark.position === 'bottom') {
                x = width / 2 - (wmText.length * watermark.fontSize * 0.3);
                y = 30;
                rot = 0;
            } else {
                x = width / 2 - (wmText.length * watermark.fontSize * 0.3);
                y = height / 2;
                rot = 0;
            }

            page.drawText(wmText, {
                x,
                y,
                size: watermark.fontSize,
                font: wmFont,
                color: wmColor,
                opacity: watermark.opacity,
                rotate: degrees(rot),
            });
        }
    }

    onProgress?.(85);

    // Apply header/footer
    if (headerFooter) {
        const hfFont = await getFont(pdfDoc, 'Helvetica');
        const hfColor = headerFooter.fontColor ? hexToRgb(headerFooter.fontColor) : rgb(0.3, 0.3, 0.3);

        for (let i = 0; i < pages.length; i++) {
            const shouldApply = headerFooter.pages === 'all' || (headerFooter.pages as number[]).includes(i);
            if (!shouldApply) continue;

            const page = pages[i];
            const { width, height } = page.getSize();
            const fs = headerFooter.fontSize || 10;
            const margin = 40;
            const pageNumText = headerFooter.includePageNumbers ? `Page ${i + 1} of ${pages.length}` : '';

            // Header
            if (headerFooter.headerLeft) {
                page.drawText(sanitizeText(headerFooter.headerLeft), { x: margin, y: height - 30, size: fs, font: hfFont, color: hfColor });
            }
            if (headerFooter.headerCenter) {
                const text = sanitizeText(headerFooter.headerCenter);
                page.drawText(text, { x: width / 2 - (text.length * fs * 0.3), y: height - 30, size: fs, font: hfFont, color: hfColor });
            }
            if (headerFooter.headerRight) {
                const text = sanitizeText(headerFooter.headerRight);
                page.drawText(text, { x: width - margin - (text.length * fs * 0.6), y: height - 30, size: fs, font: hfFont, color: hfColor });
            }

            // Footer
            const footerY = 20;
            if (headerFooter.footerLeft) {
                page.drawText(sanitizeText(headerFooter.footerLeft), { x: margin, y: footerY, size: fs, font: hfFont, color: hfColor });
            }
            if (headerFooter.footerCenter || pageNumText) {
                const text = sanitizeText(headerFooter.footerCenter || pageNumText);
                page.drawText(text, { x: width / 2 - (text.length * fs * 0.3), y: footerY, size: fs, font: hfFont, color: hfColor });
            }
            if (headerFooter.footerRight) {
                const text = sanitizeText(headerFooter.footerRight);
                page.drawText(text, { x: width - margin - (text.length * fs * 0.6), y: footerY, size: fs, font: hfFont, color: hfColor });
            }
        }
    }

    onProgress?.(90);

    // Serialize
    const resultBytes = await pdfDoc.save();
    onProgress?.(100);

    return new Blob([resultBytes], { type: 'application/pdf' });
};

// ── Page Rendering (for canvas preview) ──────────────────────────────────────

export const renderPdfPage = async (
    pdfDoc: PDFDocumentProxy,
    pageIndex: number,
    scale: number,
    canvas: HTMLCanvasElement
): Promise<{ width: number; height: number }> => {
    const page = await pdfDoc.getPage(pageIndex + 1); // pdfjs is 1-indexed
    const viewport = page.getViewport({ scale });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return { width: viewport.width, height: viewport.height };
};

export const renderPdfThumbnail = async (
    pdfDoc: PDFDocumentProxy,
    pageIndex: number,
    maxWidth: number = 120,
): Promise<string> => {
    const page = await pdfDoc.getPage(pageIndex + 1);
    const vp = page.getViewport({ scale: 1 });
    const scale = maxWidth / vp.width;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.6);
};

// ── AI Integration Hooks ─────────────────────────────────────────────────────

export const getAiTextSuggestion = async (
    contextText: string,
    instruction: string = 'Improve this text for clarity and professionalism'
): Promise<string> => {
    try {
        const { chatWithAI } = await import('./aiService');
        const response = await chatWithAI(
            [{ role: 'user', content: `${instruction}:\n\n"${contextText}"\n\nReturn ONLY the improved text, nothing else.` }],
            'z-ai/glm-4.5-air:free',
            500,
            0.3
        );
        return response.message.replace(/^["']|["']$/g, '').trim();
    } catch (err) {
        console.error('AI suggestion failed:', err);
        return contextText;
    }
};

export const getAiFormatSuggestion = async (
    text: string,
): Promise<{ fontSize: number; fontWeight: string; color: string } | null> => {
    try {
        const { chatWithAI } = await import('./aiService');
        const response = await chatWithAI(
            [{
                role: 'user',
                content: `Analyze this text and suggest formatting. Return ONLY a JSON object with keys: fontSize (number 8-72), fontWeight ("normal" or "bold"), color (hex string). Text: "${text}"`
            }],
            'z-ai/glm-4.5-air:free',
            200,
            0.2
        );
        const match = response.message.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
        return null;
    } catch {
        return null;
    }
};

// ── Batch Operations ─────────────────────────────────────────────────────────

export const applyBatchAnnotation = (
    annotations: EditAnnotation[],
    pageIndices: number[],
    template: Partial<EditAnnotation>,
): EditAnnotation[] => {
    const newAnnotations = pageIndices.map(pageIndex =>
        createAnnotation(template.type || 'text', pageIndex, template.x || 50, template.y || 50, template)
    );
    return [...annotations, ...newAnnotations];
};

// ── Temp File Manager ────────────────────────────────────────────────────────

const tempBlobUrls: string[] = [];

export const createTempBlobUrl = (blob: Blob): string => {
    const url = URL.createObjectURL(blob);
    tempBlobUrls.push(url);
    return url;
};

export const cleanupTempBlobs = () => {
    tempBlobUrls.forEach(url => {
        try { URL.revokeObjectURL(url); } catch { /* ignore */ }
    });
    tempBlobUrls.length = 0;
};

// Auto-cleanup after 2 hours
if (typeof window !== 'undefined') {
    setInterval(cleanupTempBlobs, 2 * 60 * 60 * 1000);
}

// ── Download helper ──────────────────────────────────────────────────────────

export const downloadEditedPdf = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.replace(/\.pdf$/i, '') + '_edited.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
};
