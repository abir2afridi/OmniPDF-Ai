/**
 * pdfToPptService.ts — PDF → PPTX Conversion Service (client-side)
 *
 * Strategy:
 *   1. Render each PDF page to a canvas at 2× scale (pdfjs-dist)
 *   2. Export canvas as a JPEG data-URL (base64)
 *   3. Add as full-bleed background image to a pptxgenjs slide
 *   4. Extract text items from the page and overlay as transparent
 *      near-invisible TextBoxes so the PPTX remains searchable
 *   5. Pack with pptxgenjs → ArrayBuffer → Blob → download
 *
 * Fidelity note:
 *   Pixel-perfect PDF→PPTX (editable shapes, real fonts, vector paths)
 *   requires server-side LibreOffice headless or a commercial API.
 *   This service produces a PPTX where each slide is a high-res image
 *   — visually accurate but not "vector-editable". Swapping for a
 *   server call is a one-line change inside convertPdfToPpt.
 *
 * Dependencies (already installed):
 *   - pdfjs-dist   (text extraction + canvas rendering)
 *   - pptxgenjs    (PPTX generation)
 *   - jszip        (only used by pptxgenjs internally)
 */

import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import PptxGenJS from 'pptxgenjs';

if (GlobalWorkerOptions) {
    GlobalWorkerOptions.workerSrc =
        `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type SlideSize = 'standard' | 'widescreen';   // 10×7.5 in vs 13.33×7.5 in

export interface PdfToPptOptions {
    /** 0-based page indices to include. Omit = all pages. */
    selectedPages?: number[];
    /** Slide aspect ratio. Default: widescreen (16:9) */
    slideSize?: SlideSize;
    /** Render scale factor for image quality. Default: 2 (retina) */
    scale?: number;
    /** JPEG quality [0-1]. Default: 0.88 */
    imageQuality?: number;
    /** Output file name without extension. Default: derived from PDF name */
    outputName?: string;
    /** Progress callback [0–100] */
    onProgress?: (p: number) => void;
}

export interface PdfToPptResult {
    blob: Blob;
    outputName: string;   // without .pptx
    slideCount: number;
    fileSizeBytes: number;
}

export interface BatchPdfToPptResult {
    succeeded: { fileName: string; result: PdfToPptResult }[];
    failed: { fileName: string; error: string }[];
}

// Slide dimensions in inches
const SLIDE_DIMS: Record<SlideSize, { w: number; h: number }> = {
    standard: { w: 10, h: 7.5 },
    widescreen: { w: 13.33, h: 7.5 },
};

// ── Validation ────────────────────────────────────────────────────────────────

export const PDF_TO_PPT_MAX_MB = 100;
export const PDF_TO_PPT_MAX_PAGES = 200;

export function validatePdfForPpt(file: File): string | null {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))
        return `"${file.name}" is not a PDF file.`;
    if (file.size > PDF_TO_PPT_MAX_MB * 1024 * 1024)
        return `"${file.name}" exceeds the ${PDF_TO_PPT_MAX_MB} MB limit.`;
    if (file.size === 0)
        return `"${file.name}" is empty.`;
    return null;
}

// ── PDF Loading ───────────────────────────────────────────────────────────────

async function openPdf(file: File): Promise<PDFDocumentProxy> {
    const buf = await file.arrayBuffer();
    return getDocument({ data: buf }).promise;
}

// ── Page → JPEG data URL ──────────────────────────────────────────────────────

async function renderPageToDataUrl(
    pdf: PDFDocumentProxy,
    pageIdx: number,
    scale: number,
    quality: number,
): Promise<{ dataUrl: string; pxW: number; pxH: number }> {
    const page = await pdf.getPage(pageIdx + 1);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    return { dataUrl, pxW: canvas.width, pxH: canvas.height };
}

// ── Text extraction for searchable overlay ────────────────────────────────────

interface TextBlock {
    text: string;
    xPct: number;   // x position as % of page width  (0-100)
    yPct: number;   // y position as % of page height (0-100)
    wPct: number;
    hPct: number;
    sizePt: number;
}

async function extractTextBlocks(
    pdf: PDFDocumentProxy,
    pageIdx: number,
): Promise<TextBlock[]> {
    try {
        const page = await pdf.getPage(pageIdx + 1);
        const content = await page.getTextContent();
        const vp = page.getViewport({ scale: 1 });
        const W = vp.width;
        const H = vp.height;

        const blocks: TextBlock[] = [];
        for (const raw of content.items) {
            if (!('str' in raw) || !raw.str.trim()) continue;
            const it = raw as any;
            const [, , , scaleY, tx, ty] = it.transform ?? [1, 0, 0, 1, 0, 0];
            const fontSize = Math.abs(scaleY);
            const x = tx;
            const y = H - ty;                      // flip Y
            const w = Math.max(it.width ?? 30, 10);
            const h = Math.max(fontSize, 8);
            blocks.push({
                text: it.str.trim(),
                xPct: (x / W) * 100,
                yPct: (y / H) * 100,
                wPct: (w / W) * 100,
                hPct: (h / H) * 100,
                sizePt: Math.round(fontSize * 0.75), // px → pt approximation
            });
        }
        return blocks;
    } catch {
        return [];
    }
}

// ── Core conversion ───────────────────────────────────────────────────────────

/**
 * Convert a PDF file to a .pptx Blob.
 * Each PDF page → one PowerPoint slide (high-res JPEG background).
 * Swap body for fetch() to a backend for vector-editable output.
 */
export async function convertPdfToPpt(
    file: File,
    options: PdfToPptOptions = {},
): Promise<PdfToPptResult> {
    const err = validatePdfForPpt(file);
    if (err) throw new Error(err);

    const {
        slideSize = 'widescreen',
        scale = 2,
        imageQuality = 0.88,
        outputName: rawName,
        onProgress,
    } = options;

    onProgress?.(2);

    let pdf: PDFDocumentProxy;
    try {
        pdf = await openPdf(file);
    } catch {
        throw new Error(`"${file.name}" could not be opened — it may be corrupted or encrypted.`);
    }

    const total = pdf.numPages;
    const pageIndices = options.selectedPages?.length
        ? options.selectedPages.filter(i => i >= 0 && i < total)
        : Array.from({ length: total }, (_, i) => i);

    if (pageIndices.length === 0)
        throw new Error('No valid pages selected.');
    if (pageIndices.length > PDF_TO_PPT_MAX_PAGES)
        throw new Error(`Too many pages (max ${PDF_TO_PPT_MAX_PAGES}). Use page ranges.`);

    onProgress?.(4);

    const dims = SLIDE_DIMS[slideSize];
    const pptx = new PptxGenJS();
    pptx.layout = slideSize === 'widescreen' ? 'LAYOUT_WIDE' : 'LAYOUT_4x3';

    // Slide metadata
    const base = sanitizeName(rawName ?? file.name.replace(/\.pdf$/i, ''));
    pptx.author = 'OmniPDF';
    pptx.company = 'OmniPDF';
    pptx.subject = `Converted from ${file.name}`;
    pptx.title = base;

    for (let pi = 0; pi < pageIndices.length; pi++) {
        const pageIdx = pageIndices[pi];
        onProgress?.(4 + Math.round((pi / pageIndices.length) * 86));

        // ── Render page to JPEG
        let imgData: { dataUrl: string; pxW: number; pxH: number };
        try {
            imgData = await renderPageToDataUrl(pdf, pageIdx, scale, imageQuality);
        } catch {
            // Fallback: blank white slide with error note
            const slide = pptx.addSlide();
            slide.addText(`[Page ${pageIdx + 1} could not be rendered]`, {
                x: 0.5, y: dims.h / 2 - 0.3, w: dims.w - 1, h: 0.6,
                fontSize: 16, italic: true, color: 'FF4444', align: 'center',
            });
            continue;
        }

        // ── Add slide
        const slide = pptx.addSlide();

        // Full-bleed background image
        slide.addImage({
            data: imgData.dataUrl,
            x: 0,
            y: 0,
            w: dims.w,
            h: dims.h,
            sizing: { type: 'contain', w: dims.w, h: dims.h },
        });

        // ── Overlay searchable text (invisible — color matches slide bg)
        const textBlocks = await extractTextBlocks(pdf, pageIdx);
        for (const blk of textBlocks) {
            // Convert % positions to inches
            const tx = (blk.xPct / 100) * dims.w;
            const ty = (blk.yPct / 100) * dims.h;
            const tw = Math.max((blk.wPct / 100) * dims.w, 0.1);
            const th = Math.max((blk.hPct / 100) * dims.h, 0.1);

            if (tx + tw > dims.w || ty + th > dims.h) continue; // clip overflow

            slide.addText(blk.text, {
                x: tx,
                y: ty,
                w: tw,
                h: th,
                fontSize: Math.max(blk.sizePt, 6),
                color: 'FFFFFF',   // White = invisible over image
                fontFace: 'Calibri',
                transparency: 100,     // fully transparent — text exists but invisible
                wrap: false,
                autoFit: false,
            });
        }

        // ── Slide number footer (optional, subtle)
        slide.addText(`${pageIdx + 1} / ${total}`, {
            x: dims.w - 1.2,
            y: dims.h - 0.35,
            w: 1,
            h: 0.25,
            fontSize: 8,
            color: 'CCCCCC',
            align: 'right',
        });
    }

    onProgress?.(92);

    // Write to ArrayBuffer
    const buffer = await pptx.write({ outputType: 'arraybuffer' }) as ArrayBuffer;
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });

    onProgress?.(100);

    return {
        blob,
        outputName: base,
        slideCount: pageIndices.length,
        fileSizeBytes: blob.size,
    };
}

// ── Batch ─────────────────────────────────────────────────────────────────────

export async function batchConvertPdfToPpt(
    files: File[],
    options: Omit<PdfToPptOptions, 'outputName' | 'onProgress'> = {},
    onJobProgress?: (name: string, p: number) => void,
): Promise<BatchPdfToPptResult> {
    const succeeded: BatchPdfToPptResult['succeeded'] = [];
    const failed: BatchPdfToPptResult['failed'] = [];

    for (const file of files) {
        try {
            const result = await convertPdfToPpt(file, {
                ...options,
                outputName: file.name.replace(/\.pdf$/i, ''),
                onProgress: p => onJobProgress?.(file.name, p),
            });
            succeeded.push({ fileName: file.name, result });
        } catch (err: any) {
            failed.push({ fileName: file.name, error: err?.message ?? 'Unknown error' });
        }
    }
    return { succeeded, failed };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function sanitizeName(s: string): string {
    return (s || 'presentation')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 120) || 'presentation';
}

export function fmtSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(2)} MB`;
}
